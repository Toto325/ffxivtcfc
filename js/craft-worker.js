/* craft-worker.js — 生產製作求解 Web Worker
 *
 * 職責：
 *  1. 載入 ffxiv-simulator（技能庫/模擬引擎，跟得上最新版本）+ 自製 craft-solver-ga.js（GA 搜尋邏輯）
 *  2. 把「配方原始資料 + rlvl 對照表」組成模擬器要的 Craft 物件
 *  3. 呼叫 GA 求解器算出最佳手法序列，並套用三個緩解策略：
 *     (a) 種子化亂數：同樣輸入 → 同樣輸出，可重現、可快取
 *     (b) 多組獨立族群平行跑，取「成功 > 品質 > 步數少」最佳者
 *     (c) 失敗自動重試數次，仍失敗則誠實回報，不硬塞會失敗的巨集
 *
 * 技能來源說明：曾評估過用現成的 @ffxiv-teamcraft/crafting-solver 套件，
 * 但實測其內建技能清單是舊版快照（缺 Veneration/Dawntrail 新技能，混了已移除的舊技能），
 * 會讓巨集叫出遊戲裡不存在的技能而失敗，因此改為只用它的模擬引擎(simulator)，
 * 「怎麼搜尋最佳序列」這段自己實作在 craft-solver-ga.js。
 */
importScripts('vendor/ffxiv-simulator.umd.js');
importScripts('craft-solver-ga.js');
importScripts('craft-data.js'); // 提供 CRAFT_RECIPES / CRAFT_ITEM_NAMES_TW
importScripts('craft-action-names.js'); // 提供 CRAFT_ACTION_NAMES_BY_GAME_ID（game id -> 多語言名稱）

/* 把「game id -> 名稱」轉成「模擬引擎技能鍵名(如 BasicSynthesis) -> 名稱」，
 * 用 CraftingActionsRegistry 自己的 getIds() 對照，跟技能來源保證一致，不用手動維護對照表 */
const CRAFT_ACTION_NAMES = {};
simulator.CraftingActionsRegistry.ALL_ACTIONS.forEach(function (entry) {
  const ids = entry.action.getIds().filter(function (id) { return id > 0; });
  const found = ids.map(function (id) { return CRAFT_ACTION_NAMES_BY_GAME_ID[id]; }).find(Boolean);
  if (found) CRAFT_ACTION_NAMES[entry.name] = found;
});

/* ---------- 種子化亂數（mulberry32），取代全域 Math.random ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 用字串（配方id+數值+種子偏移）算出一個穩定的整數種子 */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---------- Craft 物件建構：配方資料（已含算好的進度/品質/耐久/狀態旗標）→ 模擬器格式 ---------- */
function buildCraftObject(recipe, opts) {
  opts = opts || {};
  return {
    id: String(recipe.id || ''),
    job: recipe.jobId,
    rlvl: recipe.rlvl,
    durability: recipe.durability,
    quality: recipe.quality,
    progress: recipe.progress,
    lvl: recipe.lvl,
    stars: recipe.stars || 0,
    hq: recipe.hasHqIngredients ? 1 : 0,
    expert: !!recipe.isExpert,
    // 模擬引擎要求材料欄位叫 id（不是 itemId），quality 是這個材料 HQ 時的起始品質貢獻值
    // （來源：使用者提供的精確配方資料，見 craft-data.js 開頭說明，不是近似公式）
    ingredients: (recipe.ingredients || []).map(function (ing) {
      return { id: ing.itemId, amount: ing.amount, quality: ing.quality || 0 };
    }),
    // conditionsFlag 現在是逐配方精確值（來自使用者提供的資料），不再是近似值
    conditionsFlag: recipe.conditionsFlag,
    progressDivider: recipe.progressDivider,
    qualityDivider: recipe.qualityDivider,
    progressModifier: recipe.progressModifier,
    qualityModifier: recipe.qualityModifier,
    requiredQuality: recipe.requiredQuality || opts.requiredQuality || 0,
  };
}

function buildCrafterStats(stats) {
  // stats: { jobId, craftsmanship, control, cp, level, levels(可省), specialist, relicTool, excludedActions(可省) }
  const levels = stats.levels || [90, 90, 90, 90, 90, 90, 90, 90];
  const crafterStats = new simulator.CrafterStats(
    stats.jobId,
    stats.craftsmanship,
    stats.control,
    stats.cp,
    !!stats.specialist,
    !!stats.relicTool,
    stats.level,
    levels
  );
  crafterStats.excludedActions = stats.excludedActions || []; // 玩家勾選「還沒學會」的技能鍵名清單
  return crafterStats;
}

/* 用 Simulation 把一串技能序列跑一次，取得完整結果（品質%、是否成功、步驟明細、耐久/CP剩餘）
 * hqIngredients: [{id, amount}]，玩家指定這次製作要用幾個某材料的HQ版本，影響起始品質
 * safeMode 預設開啟：假設每一步都是最差運氣（成功率<100%的技能一律視為失敗），確保回報給玩家
 * 的結果是「不管運氣好壞都能達成」的保守估計，不是碰運氣才能達到的樂觀值 */
function evaluateRotation(craft, actions, crafterStats, hqIngredients, safeMode, collectableGoal) {
  if (safeMode === undefined) safeMode = true;
  const sim = new simulator.Simulation(craft, actions, crafterStats, hqIngredients || []);
  const result = sim.run(true, undefined, safeMode);
  const cleanActions = actions.filter(function (action, i) {
    return result.steps[i] && !result.steps[i].skipped && result.steps[i].success;
  });
  return {
    actions: cleanActions,
    success: !!result.success,
    hqPercent: result.hqPercent || 0,
    collectability: collectableGoal ? Math.floor((sim.quality || 0) / 10) : null,
    progression: sim.progression || 0,
    quality: sim.quality || 0,
    durabilityLeft: Math.max(0, sim.durability || 0),
    cpLeft: Math.max(0, sim.availableCP || 0),
    steps: cleanActions.length,
  };
}

/* ---------- 主流程：多組族群平行跑 + 重試 ---------- */
function solveWithMitigations(craft, crafterStats, options, onProgress) {
  const TRIALS = options.trials || 3;
  const MAX_RETRY_ROUNDS = options.maxRetryRounds || 1;
  const baseSeedStr = craft.id + '|' + crafterStats.craftsmanship + '|' + crafterStats.getControl({}) + '|' + crafterStats.cp;
  const baseSeed = hashSeed(baseSeedStr);

  const originalRandom = Math.random;
  let best = null;
  let attempts = 0;
  const totalTrials = (MAX_RETRY_ROUNDS + 1) * TRIALS;

  try {
    for (let round = 0; round <= MAX_RETRY_ROUNDS; round++) {
      for (let t = 0; t < TRIALS; t++) {
        attempts++;
        const seed = (baseSeed + round * 1000 + t) >>> 0;
        Math.random = mulberry32(seed); // 暫時接管，讓這一輪求解可重現

        const fixedPrefix = (options.fixedPrefix || []).map(function (key) {
          const entry = simulator.CraftingActionsRegistry.ALL_ACTIONS.find(function (e) { return e.name === key; });
          return entry ? new entry.action.constructor() : null;
        }).filter(Boolean);
        const solver = new CraftSolverGA(craft, crafterStats, {
          populationSize: options.populationSize || 150,
          generations: options.generations || 40,
          hqTarget: options.hqTarget || 90,
          hqIngredients: options.hqIngredients || [],
          safeMode: options.safeMode,
          collectableGoal: options.collectableGoal,
          fixedPrefix: fixedPrefix,
        });
        const rotation = solver.run(function (p) {
          if (typeof onProgress !== 'function') return;
          onProgress({
            trial: attempts, totalTrials: totalTrials,
            generation: p.generation, totalGenerations: p.totalGenerations,
            bestSuccess: p.bestSuccess, bestHqPercent: p.bestHqPercent,
            bestCollectability: p.bestCollectability, bestSteps: p.bestSteps,
          });
        });
        const evalResult = evaluateRotation(craft, rotation, crafterStats, options.hqIngredients, options.safeMode, options.collectableGoal);
        let score;
        if (!evalResult.success) {
          score = (Math.min(evalResult.progression, craft.progress) / craft.progress) * 100;
        } else if (options.collectableGoal) {
          score = 100 + Math.min(100, (evalResult.collectability / options.collectableGoal) * 100) - evalResult.steps * 0.01;
        } else {
          score = 100 + evalResult.hqPercent - evalResult.steps * 0.01;
        }

        if (!best || score > best.score) {
          best = { score: score, eval: evalResult, seed: seed };
        }
      }
      // 這一輪如果已經有成功的結果，不必再放寬繼續重試
      if (best && best.eval.success) break;
    }
  } finally {
    Math.random = originalRandom; // 一定要還原，避免影響 Worker 內其他邏輯
  }

  return {
    success: !!(best && best.eval.success),
    actions: best ? best.eval.actions : [],
    hqPercent: best ? best.eval.hqPercent : 0,
    collectability: best ? best.eval.collectability : null,
    steps: best ? best.eval.steps : 0,
    progression: best ? best.eval.progression : 0,
    quality: best ? best.eval.quality : 0,
    durabilityLeft: best ? best.eval.durabilityLeft : 0,
    cpLeft: best ? best.eval.cpLeft : 0,
    attempts: attempts,
    seed: best ? best.seed : null,
  };
}

/* ---------- 技能序列 → 遊戲可貼的巨集文字（繁中/其他語言可切換） ---------- */
const MACRO_LINE_MAX = 15; // 遊戲單一巨集上限 15 行

function actionDisplayName(action, lang) {
  lang = lang || 'tw';
  const key = action.constructor.name;
  const entry = CRAFT_ACTION_NAMES[key];
  if (!entry) return key; // 理論上不會發生，保底
  return entry[lang] || entry.tw || entry.en;
}

function buildMacroLines(actions, lang) {
  return actions.map(function (action) {
    const name = actionDisplayName(action, lang);
    // 用技能本身定義的等待時間（simulator 內建，比自己猜的準）
    const wait = (typeof action.getWaitDuration === 'function' ? action.getWaitDuration() : 3) || 3;
    return '/ac "' + name + '" <wait.' + wait + '>';
  });
}

/* 巨集塞不下 15 行時，自動拆成多段（比照吐司工坊的作法） */
function splitMacroSegments(lines) {
  const segments = [];
  for (let i = 0; i < lines.length; i += MACRO_LINE_MAX) {
    segments.push(lines.slice(i, i + MACRO_LINE_MAX));
  }
  return segments;
}

/* ---------- Worker 訊息入口 ---------- */
self.onmessage = function (e) {
  const msg = e.data || {};
  if (msg.type !== 'solve') return;

  const { requestId, recipeId, stats, options } = msg;
  try {
    const recipe = CRAFT_RECIPES[recipeId];
    if (!recipe) throw new Error('找不到配方 id=' + recipeId);

    const craft = buildCraftObject(Object.assign({ id: recipeId }, recipe), options);
    const crafterStats = buildCrafterStats(stats);
    const result = solveWithMitigations(craft, crafterStats, options || {}, function (p) {
      self.postMessage({ type: 'solve-progress', requestId: requestId, progress: p });
    });
    const lang = (options && options.lang) || 'tw';
    const macroLines = buildMacroLines(result.actions, lang);
    result.macroSegments = splitMacroSegments(macroLines);
    result.actionNames = result.actions.map(function (a) { return actionDisplayName(a, lang); });
    self.postMessage({ type: 'solve-result', requestId: requestId, ok: true, craft: craft, result: result });
  } catch (err) {
    self.postMessage({ type: 'solve-result', requestId: requestId, ok: false, error: String(err && err.message || err) });
  }
};
