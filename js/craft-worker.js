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
  const MAX_RETRY_ROUNDS = options.maxRetryRounds || 0; // 隨機重來命中率低，已改成下面「從目前最佳出發繼續搜尋」
  const CONTINUE_SEARCH = options.continueSearch !== false;
  const baseSeedStr = craft.id + '|' + crafterStats.craftsmanship + '|' + crafterStats.getControl({}) + '|' + crafterStats.cp;
  const baseSeed = hashSeed(baseSeedStr);

  /* 時間上限：整個求解最多花 timeBudgetMs（預設 5.5 秒，之後最多再精修 3 秒，整體最慢約 8.5 秒）。第一輪的各次嘗試平均分這段時間，
   * 不論這台電腦多慢，時間到就用「目前找到最好的」收工並標記 timedOut，不會讓玩家無限等。 */
  const BUDGET = options.timeBudgetMs || 5500; // 這是「重複嘗試」的時間上限；之後最多再加精修 1.5～3 秒，整體最慢約 8.5 秒
  const startedAt = Date.now();
  let timedOut = false;
  const originalRandom = Math.random;
  let best = null;
  const trialResults = []; // 第一輪每次嘗試的結果，之後「多起點精修」要用
  let attempts = 0;
  const totalTrials = (MAX_RETRY_ROUNDS + 1) * TRIALS;
  const actionsFromKeys = function (keys) {
    return (keys || []).map(function (key) {
      const entry = simulator.CraftingActionsRegistry.ALL_ACTIONS.find(function (e) { return e.name === key; });
      return entry ? new entry.action.constructor() : null;
    }).filter(Boolean);
  };
  const scoreOf = function (ev) {
    if (!ev.success) return (Math.min(ev.progression, craft.progress) / craft.progress) * 100;
    if (options.collectableGoal) return 100 + Math.min(100, (ev.collectability / options.collectableGoal) * 100) - ev.steps * 0.01;
    return 100 + ev.hqPercent + (craft.quality > 0 ? Math.min(ev.quality, craft.quality) / craft.quality * 10 : 0) - ev.steps * 0.01; // 同 GA：品質比例當小梯度
  };
  let continued = false;

  try {
    for (let round = 0; round <= MAX_RETRY_ROUNDS; round++) {
      for (let t = 0; t < TRIALS; t++) {
        if (best && Date.now() >= startedAt + BUDGET) { timedOut = true; break; } // 時間用完了，已經有結果就不再開新的嘗試
        const slice = round === 0 ? BUDGET * (t + 1) / TRIALS : BUDGET; // 第一輪每次嘗試各佔一份；重試輪用剩下的時間
        attempts++;
        const seed = (baseSeed + round * 1000 + t) >>> 0;
        Math.random = mulberry32(seed); // 暫時接管，讓這一輪求解可重現

        const fixedPrefix = actionsFromKeys(options.fixedPrefix);
        const seeds = (options.seedActionKeysList || []).concat(options.seedActionKeys ? [options.seedActionKeys] : []).map(actionsFromKeys); // 每次嘗試各自建立新實例，不共用
        const solver = new CraftSolverGA(craft, crafterStats, {
          populationSize: options.populationSize || 150,
          generations: options.generations || 40,
          hqTarget: options.hqTarget || 90,
          hqIngredients: options.hqIngredients || [],
          safeMode: options.safeMode,
          collectableGoal: options.collectableGoal,
          fixedPrefix: fixedPrefix,
          seeds: seeds,
          goalQuality: options.goalQuality, // 有指定才啟用：成功且品質達標就提早結束（背景分析用）
          deadline: startedAt + slice,
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
        if (solver.timedOut) timedOut = true;
        const evalResult = evaluateRotation(craft, rotation, crafterStats, options.hqIngredients, options.safeMode, options.collectableGoal);
        let score;
        if (!evalResult.success) {
          score = (Math.min(evalResult.progression, craft.progress) / craft.progress) * 100;
        } else if (options.collectableGoal) {
          score = 100 + Math.min(100, (evalResult.collectability / options.collectableGoal) * 100) - evalResult.steps * 0.01;
        } else {
          score = 100 + evalResult.hqPercent + (craft.quality > 0 ? Math.min(evalResult.quality, craft.quality) / craft.quality * 10 : 0) - evalResult.steps * 0.01;
        }

        trialResults.push({ score: score, eval: evalResult, seed: seed, rotation: rotation, solver: solver });
        if (!best || score > best.score) {
          best = { score: score, eval: evalResult, seed: seed, rotation: rotation, solver: solver };
        }
      }
      // 這一輪如果已經有成功的結果，不必再放寬繼續重試
      if (best && best.eval.success) break;
    }

    /* 搜尋到收斂為止：第一輪（幾次獨立的 GA）只是起點，GA 常卡在「差一點」的局部最佳
     * （實測最佳手法進度 5864/6600，從它重新搜尋卻能到 6583）。所以只要「還不夠好」，就反覆做：
     *   以目前最佳為種子再跑一次 GA ＋ 局部精修（刪／換／插單一技能），
     * 直到：夠好了（成功且優質率達標，或驗證用目標達成）、或連續幾輪都沒有進步（收斂）、或到時間上限（只是防呆）。
     * 「做不出來」的結論只在收斂後才下；到時間上限才停就標記 timedOut，表示結論不確定。 */
    const idealHq = options.hqTarget || 90;
    const goalMetNow = function () {
      if (options.goalQuality != null) return best.eval.success && best.eval.quality >= options.goalQuality;
      return best.eval.success && (options.collectableGoal || best.eval.hqPercent >= idealHq);
    };
    // 驗證用的求解（有指定 goalQuality）：離目標還很遠就不費力繼續（救不回來），只在「差一點」時才繼續
    const nearGoal = options.goalQuality == null || !best || (best.eval.success ? best.eval.quality >= options.goalQuality * 0.6 : best.eval.progression >= craft.progress * 0.85);
    if (CONTINUE_SEARCH && best && !goalMetNow() && nearGoal) {
      continued = true;
      /* 時間上限：還沒成功時最多搜尋到 FAIL_CAP；一旦成功，改成「成功後最多再改善 IMPROVE 這麼久」、而且連續 2 輪沒進步就停
       * （原本沒有這個切換，成功之後還繼續沿用「做不出來」的長上限，把時間白白用光）。 */
      const FAIL_CAP = options.failBudgetMs || 25000, IMPROVE = options.improveBudgetMs || 12000;
      let successAt = best.eval.success ? startedAt : 0;
      const capNow = function () { return best.eval.success ? Math.min(startedAt + FAIL_CAP, successAt + IMPROVE) : startedAt + FAIL_CAP; };
      const needStall = function () { return best.eval.success ? 2 : 4; }; // 連續幾輪（每輪都是不同隨機種子、從清理後的最佳重新搜尋）都沒進步，就視為收斂
      const cap = FAIL_CAP; // 給下面多起點精修的時間計算用
      /* 多起點精修：不同次嘗試會落在不同的局部最佳，只精修分數最高的那個，會漏掉「現在分數較低、但精修後能成功」的起點
       * （實測 1500／1500／300：精修最好的那個停在進度 6361/6600，另一個起點精修後完成）。
       * 挑最多 3 個不重複的起點，各自精修到收斂（或各自的時間上限）。 */
      const phaseStart = Date.now();
      // 這一段只是快速補一下不同起點；真正有效的是下面「以清理後的最佳為種子、反覆跑 GA」，所以給的時間要少
      const phaseCap = Math.min(best.eval.success ? 1500 : 3500, startedAt + cap - phaseStart);
      const perStart = best.eval.success ? 500 : 1200;
      const seen = {};
      const starts = trialResults.slice().sort(function (a, b) { return b.score - a.score; }).filter(function (c) {
        const k = c.rotation.map(function (a) { return a.constructor.name; }).join(',');
        if (seen[k]) return false; seen[k] = true; return true;
      }).slice(0, 3);
      for (let si = 0; si < starts.length; si++) {
        const c = starts[si], left = phaseCap - (Date.now() - phaseStart);
        if (goalMetNow() || left <= 300) break;
        c.solver.config.deadline = Date.now() + Math.min(perStart, left);
        const rot0 = c.solver.ils(c.rotation, perStart); // 迭代局部搜尋（擾動＋精修），比單純精修更容易跳出局部最佳
        const ev0 = evaluateRotation(craft, rot0, crafterStats, options.hqIngredients, options.safeMode, options.collectableGoal);
        const sc0 = scoreOf(ev0);
        if (sc0 > best.score + 0.05) best = { score: sc0, eval: ev0, seed: c.seed, rotation: rot0, solver: c.solver };
      }
      let iter = 0, stall = 0;
      while (!goalMetNow() && stall < needStall() && Date.now() < capNow()) {
        iter++; attempts++;
        const seed = (baseSeed + 5000 + iter) >>> 0;
        Math.random = mulberry32(seed);
        const remaining = capNow() - Date.now();
        const solver = new CraftSolverGA(craft, crafterStats, {
          populationSize: options.populationSize || 150,
          generations: options.generations || 40,
          hqTarget: options.hqTarget || 90,
          hqIngredients: options.hqIngredients || [],
          safeMode: options.safeMode,
          collectableGoal: options.collectableGoal,
          fixedPrefix: actionsFromKeys(options.fixedPrefix),
          // 以目前最佳為種子——用「實際會執行的動作」（跟輸出的巨集一致），不是含失敗尾巴／被跳過動作的原始序列：
          // 後者的突變、交配大多打在沒用的位置上。實測同一個種子，清理後 1.9 秒就成功，原始序列 25 秒都沒成功。
          seeds: [(best.eval.actions && best.eval.actions.length ? best.eval.actions : best.rotation).map(function (a) { return new a.constructor(); })],
          goalQuality: options.goalQuality,
          deadline: Date.now() + Math.min(remaining, options.iterGaMs || 3000),
        });
        let rot = solver.run(function (p) {
          if (typeof onProgress !== 'function') return;
          onProgress({ trial: Math.min(attempts, totalTrials), totalTrials: totalTrials, generation: p.generation, totalGenerations: p.totalGenerations, bestSuccess: p.bestSuccess, bestHqPercent: p.bestHqPercent, bestCollectability: p.bestCollectability, bestSteps: p.bestSteps });
        });
        const polishCap = Math.max(0, Math.min(options.iterIlsMs != null ? options.iterIlsMs : (best.eval.success ? 1500 : 1200), remaining)); // 每一輪「從最佳出發」之後的迭代局部搜尋時間；短而多輪，比長而少輪更能靠 GA 的多樣性跳出局部最佳
        solver.config.deadline = Date.now() + Math.max(300, polishCap);
        if (polishCap > 0) rot = solver.ils(rot, polishCap);
        const ev = evaluateRotation(craft, rot, crafterStats, options.hqIngredients, options.safeMode, options.collectableGoal);
        const sc = scoreOf(ev);
        if (sc > best.score + 0.05) { const was = best.eval.success; best = { score: sc, eval: ev, seed: seed, rotation: rot, solver: solver }; stall = 0; if (!was && best.eval.success) successAt = Date.now(); }
        else stall++; // 這一輪沒有刷新最佳 // 迭代局部搜尋真的收斂（連續很多次擾動都沒有刷新最佳）：才算沒進步
        // 精修被時間截斷（還沒爬完）不算沒進步：下一輪從這個結果繼續，直到收斂或時間上限
      }
      // 沒成功：連續幾輪都沒有進步＝收斂了，才算「這組數值做不出來」；是被時間上限截斷的就不確定
      if (!best.eval.success) timedOut = stall < 4;
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
    timedOut: !!(timedOut && best && !best.eval.success), // 沒成功、又沒收斂（被時間上限截斷）：結論不確定
    seed: best ? best.seed : null,
  };
}

/* ---------- 技能序列 → 遊戲可貼的巨集文字（繁中/其他語言可切換） ---------- */
const MACRO_LINE_MAX = 15; // 遊戲單一巨集上限 15 行
const MACRO_ACTION_MAX = MACRO_LINE_MAX - 1; // 技能行最多14行，留1行給結尾提示字句，不然加了提示會超過遊戲上限存不進去

function actionDisplayName(action, lang) {
  lang = lang || 'tw';
  const key = action.constructor.name;
  const entry = CRAFT_ACTION_NAMES[key];
  if (!entry) return key; // 理論上不會發生，保底
  // 查到資料但缺對應語言欄位時，依序退而求其次，最後用類別名稱保底，
  // 不能讓 undefined 或空字串跑進巨集文字裡（那樣貼進遊戲會變成一行無效的/ac ""指令）
  return entry[lang] || entry.tw || entry.zh || entry.en || key;
}

function buildMacroLines(actions, lang) {
  return actions.map(function (action) {
    const name = actionDisplayName(action, lang);
    // 用技能本身定義的等待時間（simulator 內建：buff類技能2秒、實際加工/製作類技能3秒，比自己猜的準）
    const wait = (typeof action.getWaitDuration === 'function' ? action.getWaitDuration() : 3) || 3;
    return '/ac "' + name + '" <wait.' + wait + '>';
  });
}

/* 巨集塞不下 14 行技能時，自動拆成多段（比照吐司工坊的作法），
 * 每段結尾加上完成提示字句：真實玩家分享的巨集都會在結尾加 /echo 提示，讓人知道這段跑完了、
 * 沒有這個提示的話，連續執行多段巨集時很容易在動畫還沒跑完就按下一段，導致巨集卡住或跳過步驟。 */
function splitMacroSegments(lines) {
  const segments = [];
  for (let i = 0; i < lines.length; i += MACRO_ACTION_MAX) {
    segments.push(lines.slice(i, i + MACRO_ACTION_MAX));
  }
  segments.forEach(function (seg, i) {
    const isLastSegment = i === segments.length - 1;
    if (isLastSegment) {
      seg.push('/echo 巨集執行完畢，請確認製作結果 <se.6>');
    } else {
      seg.push('/echo 第' + (i + 1) + '段完成，可以接著執行下一段巨集 <se.6>');
    }
  });
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
    /* result.actions 目前是真正的技能class實例(例如 new BasicSynthesis())，但等一下要整包用
     * postMessage 送到主執行緒——worker跟主執行緒之間傳遞資料用的是「結構化克隆」，
     * 不是真的把物件傳過去，是複製一份新的，而且複製出來的東西不會保留原本的class/prototype，
     * 主執行緒收到的只是一個外觀相似但完全沒有canBeUsed()這些方法的空殼物件。
     * 這正是「求解完換配方再求解、結果卻還停在舊的/甚至完全沒有結果」這個bug的真正根因：
     * 主執行緒後來又用result.actions重新組一次Simulation算診斷建議，物件沒有canBeUsed方法直接丟例外，
     * renderResult()的畫面更新在寫進新結果之前就整個中斷，畫面因此卡在前一次求解的舊結果上。
     * 改成只送「技能是哪一個」的名字字串陣列（可以安全被結構化克隆），主執行緒需要真正的技能物件時，
     * 自己從技能名字對照表重建，不要指望class實例能完整地跨過postMessage活下來。 */
    result.actionKeys = result.actions.map(function (a) { return a.constructor.name; });
    delete result.actions;
    self.postMessage({ type: 'solve-result', requestId: requestId, ok: true, craft: craft, result: result });
  } catch (err) {
    self.postMessage({ type: 'solve-result', requestId: requestId, ok: false, error: String(err && err.message || err) });
  }
};
