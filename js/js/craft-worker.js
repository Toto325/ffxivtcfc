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
importScripts('craft-clock.js'); // 虛擬時鐘：讓求解結果可重現
importScripts('craft-solver-ga.js');
importScripts('craft-frontier.js'); // 反推「最低所需數值」
importScripts('craft-sim-fast.js'); // 精簡模擬器（安全模式＋線性）：集束搜尋的底層
importScripts('craft-exact.js'); // 分層集束搜尋引擎（strategy:'beam' 使用）
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
  let startedAt = CraftClock.now();
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
  const phaseLog = []; const phaseT0 = CraftClock.now(); const mark = function (name, extra) { phaseLog.push(Object.assign({ name: name, t: Math.round(CraftClock.now() - phaseT0) }, extra || {})); };
  let pipelineInfo = null; // 除錯／分析用：各條流程各自的結果（options.debug 才會回傳）

  /* 手法庫：把庫裡的手法在目前數值下直接模擬（確定性，不含隨機）。
   *  ・有一套做得到滿品質：這個結果是確定的，直接採用，只做一小段局部精修（找更短的手法），不必再跑整輪隨機搜尋。
   *  ・沒有：最接近的幾套當作每次搜尋的起點種子，讓搜尋站在已知好的手法上。庫沒資料時完全照原本流程。 */
  const libKeys = (!(options.fixedPrefix && options.fixedPrefix.length) && options.strategy !== 'plain' && options.libraryKeys) || []; // 獨立流程（plain）完全不碰手法庫，跟原本一模一樣
  const libEvals = [];
  libKeys.forEach(function (keys) {
    try {
      const rot = actionsFromKeys(keys);
      if (!rot.length) return;
      const ev = evaluateRotation(craft, rot, crafterStats, options.hqIngredients, options.safeMode, options.collectableGoal);
      libEvals.push({ score: scoreOf(ev), eval: ev, rotation: rot, keys: keys });
    } catch (e) { /* 這套手法在目前條件下不能用就略過 */ }
  });
  libEvals.sort(function (a, b) { return b.score - a.score; });
  // 搜尋的起點種子：庫裡目前數值下最好的 4 套。
  const libSeedKeys = libEvals.slice(0, 4).map(function (c) { return c.keys; });
  const libTop = libEvals[0] || null;
  const libFull = !!libTop && libTop.eval.success && !options.collectableGoal && options.goalQuality == null && craft.quality > 0 && libTop.eval.quality >= craft.quality;
  const libHit = libFull && options.libraryFast !== false;
  if (onProgress) onProgress({ kind: 'info', libraryCount: libKeys.length, libHit: libHit });

  try {
    if (libHit) {
      const hitSolver = new CraftSolverGA(craft, crafterStats, { populationSize: 60, generations: 10, hqTarget: options.hqTarget || 90, hqIngredients: options.hqIngredients || [], safeMode: options.safeMode, seeds: [libTop.rotation], deadline: CraftClock.now() + 1500 });
      best = { score: libTop.score, eval: libTop.eval, seed: baseSeed, rotation: libTop.rotation, solver: hitSolver };
      trialResults.push(best);
      try {
        Math.random = mulberry32((baseSeed ^ 0x5bd1e995) >>> 0);
        const better = hitSolver.ils(libTop.rotation, 1200); // 品質已經滿了，用剩下的時間找「更短」的手法
        const evb = evaluateRotation(craft, better, crafterStats, options.hqIngredients, options.safeMode, options.collectableGoal);
        const scb = scoreOf(evb);
        if (evb.success && evb.quality >= craft.quality && scb > best.score + 0.005) best = { score: scb, eval: evb, seed: baseSeed, rotation: better, solver: hitSolver };
      } catch (e) { /* 精修失敗就用庫裡原本的結果 */ }
    }
    /* 兩條完整的搜尋流程（各自包含「幾次獨立搜尋＋從最佳反覆精修直到收斂」），最後取較好的：
     *   ① 手法庫流程：每次搜尋都以庫裡最接近的手法當種子，站在已知好的手法上往上追；
     *   ② 獨立流程：完全不帶庫的種子，跟沒有手法庫時一模一樣（保留搜尋自己變通、跳出庫的影響範圍的能力）。
     * ① 已經做到滿品質就不必再跑 ②（滿品質是上限）；否則 ② 一定會跑，所以最終結果在設計上不會比沒有手法庫時差。
     * 兩條流程的結果、起點都保留，後面的「放寬收緊／品質階梯」可以從任何一個出發。 */
    /* strategy（網站用多個 Worker 平行各跑一條策略，取最好的；等待時間只取決於最慢的那條，其中一條就是原本的做法）：
     *   'plain'  ：獨立流程，完全不帶手法庫，跟沒有手法庫時一模一樣（保證不會比原本差、也不會比原本慢）。
     *   'lib'    ：手法庫流程，以庫裡最接近的手法當種子，再反覆精修。
     *   'ladder' ：階梯優先：直接從庫裡最好的手法出發，用精確反推逐步提高品質目標（不跑整輪隨機搜尋），通常最快。
     *   不指定   ：依序跑 lib → plain → 放寬收緊／階梯（測試與離線腳本用）。 */
    const strat = options.strategy || null;
    // 「追求滿品質」流程（'lib'：有手法庫就帶庫的種子，沒有就是單純追求滿品質）：原本「優質率 90% 以上就算夠好、提早結束」的規則是為了省時間，
    // 但結果會變成 90～100% 之間誰先碰到誰贏、純看運氣（實測：把搜尋時間拉長 10 倍、族群加倍，平均優質率完全沒變）。
    // 獨立流程（'plain'）維持原本的 90%，它就是「原本的做法」，當作保險。
    // 沒有手法庫時，追求滿品質的流程「成功後繼續改善」的時間縮短到 4 秒、一輪沒進步就停：實測 24 個案例這樣已經保留幾乎所有好處，
    // 而且在「根本做不到滿品質」的案例不會比原本多花時間。
    const hqTargetEff = options.hqTarget || ((strat === 'lib' && !options.collectableGoal) ? 100 : 90);
    const ladderStart = strat === 'ladder' && libTop && libTop.eval.success && !options.collectableGoal && options.goalQuality == null;
    const pipelineModes = strat === 'plain' ? ['plain']
      : strat === 'lib' ? [(libEvals.length && !libHit) ? 'lib' : 'plain']
      : strat === 'ladder' ? (ladderStart ? [] : ['plain'])
      : ((libEvals.length && !libHit) ? ['lib', 'plain'] : ['plain']);
    const modeResults = [];
    for (let mi = 0; mi < pipelineModes.length && !libHit; mi++) {
      const useLib = pipelineModes[mi] === 'lib';
      if (mi > 0 && modeResults.length && modeResults[0].best && modeResults[0].best.eval.success && craft.quality > 0 && !options.collectableGoal && options.goalQuality == null && modeResults[0].best.eval.quality >= craft.quality) break;
      best = null; trialResults.length = 0; attempts = 0; timedOut = false; continued = false;
      startedAt = CraftClock.now();
    for (let round = 0; round <= MAX_RETRY_ROUNDS && !libHit; round++) {
      // 階梯優先流程在「庫裡沒有能完成的手法」時才需要自己先找一個起點：只跑一次短搜尋、不做後續的反覆精修，避免比獨立流程（原本的做法）慢
      for (let t = 0; t < (strat === 'ladder' ? 1 : TRIALS); t++) {
        if (best && CraftClock.now() >= startedAt + BUDGET) { timedOut = true; break; } // 時間用完了，已經有結果就不再開新的嘗試
        const slice = round === 0 ? BUDGET * (t + 1) / TRIALS : BUDGET; // 第一輪每次嘗試各佔一份；重試輪用剩下的時間
        attempts++;
        const seed = (baseSeed + round * 1000 + t) >>> 0;
        Math.random = mulberry32(seed); // 暫時接管，讓這一輪求解可重現

        const fixedPrefix = actionsFromKeys(options.fixedPrefix);
        const seeds = (useLib ? libSeedKeys.concat(options.markovSeeds ? markovSeeds(libKeys, options.markovSeeds, baseSeed + 777 + t) : []) : []).concat(options.seedActionKeysList || []).concat(options.seedActionKeys ? [options.seedActionKeys] : []).map(actionsFromKeys); // 每次嘗試各自建立新實例，不共用。手法庫流程才帶庫的種子；獨立流程完全不帶
        const solver = new CraftSolverGA(craft, crafterStats, {
          populationSize: options.populationSize || 150,
          generations: options.generations || 40,
          hqTarget: hqTargetEff,
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
    const idealHq = hqTargetEff;
    const goalMetNow = function () {
      if (options.goalQuality != null) return best.eval.success && best.eval.quality >= options.goalQuality;
      return best.eval.success && (options.collectableGoal || best.eval.hqPercent >= idealHq);
    };
    // 驗證用的求解（有指定 goalQuality）：離目標還很遠就不費力繼續（救不回來），只在「差一點」時才繼續
    const nearGoal = options.goalQuality == null || !best || (best.eval.success ? best.eval.quality >= options.goalQuality * 0.6 : best.eval.progression >= craft.progress * 0.85);
    if (CONTINUE_SEARCH && strat !== 'ladder' && best && !goalMetNow() && nearGoal) {
      continued = true;
      /* 時間上限：還沒成功時最多搜尋到 FAIL_CAP；一旦成功，改成「成功後最多再改善 IMPROVE 這麼久」、而且連續 2 輪沒進步就停
       * （原本沒有這個切換，成功之後還繼續沿用「做不出來」的長上限，把時間白白用光）。 */
      // 手法庫流程的「成功後繼續改善」上限比獨立流程（原本的做法）短：有庫的起點已經很好，不需要磨那麼久，這樣才不會比原本慢
    const FAIL_CAP = options.failBudgetMs || 25000, IMPROVE = options.improveBudgetMs || (strat === 'lib' ? (options.chaseImproveMs || (libEvals.length ? 8000 : 4000)) : 12000);
      let successAt = best.eval.success ? startedAt : 0;
      const capNow = function () { return best.eval.success ? Math.min(startedAt + FAIL_CAP, successAt + IMPROVE) : startedAt + FAIL_CAP; };
      const needStall = function () { return best.eval.success ? ((strat === 'lib' && (options.chaseStall || (libEvals.length ? 0 : 1))) || 2) : 4; }; // 連續幾輪（每輪都是不同隨機種子、從清理後的最佳重新搜尋）都沒進步，就視為收斂
      const cap = FAIL_CAP; // 給下面多起點精修的時間計算用
      /* 多起點精修：不同次嘗試會落在不同的局部最佳，只精修分數最高的那個，會漏掉「現在分數較低、但精修後能成功」的起點
       * （實測 1500／1500／300：精修最好的那個停在進度 6361/6600，另一個起點精修後完成）。
       * 挑最多 3 個不重複的起點，各自精修到收斂（或各自的時間上限）。 */
      const phaseStart = CraftClock.now();
      // 這一段只是快速補一下不同起點；真正有效的是下面「以清理後的最佳為種子、反覆跑 GA」，所以給的時間要少
      const phaseCap = Math.min(best.eval.success ? 1500 : 3500, startedAt + cap - phaseStart);
      const perStart = best.eval.success ? 500 : 1200;
      const seen = {};
      const starts = trialResults.slice().sort(function (a, b) { return b.score - a.score; }).filter(function (c) {
        const k = c.rotation.map(function (a) { return a.constructor.name; }).join(',');
        if (seen[k]) return false; seen[k] = true; return true;
      }).slice(0, 3);
      for (let si = 0; si < starts.length; si++) {
        const c = starts[si], left = phaseCap - (CraftClock.now() - phaseStart);
        if (goalMetNow() || left <= 300) break;
        c.solver.config.deadline = CraftClock.now() + Math.min(perStart, left);
        const rot0 = c.solver.ils(c.rotation, perStart); // 迭代局部搜尋（擾動＋精修），比單純精修更容易跳出局部最佳
        const ev0 = evaluateRotation(craft, rot0, crafterStats, options.hqIngredients, options.safeMode, options.collectableGoal);
        const sc0 = scoreOf(ev0);
        if (sc0 > best.score + 0.05) best = { score: sc0, eval: ev0, seed: c.seed, rotation: rot0, solver: c.solver };
      }
      let iter = 0, stall = 0;
      while (!goalMetNow() && stall < needStall() && CraftClock.now() < capNow()) {
        iter++; attempts++;
        const seed = (baseSeed + 5000 + iter) >>> 0;
        Math.random = mulberry32(seed);
        const remaining = capNow() - CraftClock.now();
        const solver = new CraftSolverGA(craft, crafterStats, {
          populationSize: options.populationSize || 150,
          generations: options.generations || 40,
          hqTarget: hqTargetEff,
          hqIngredients: options.hqIngredients || [],
          safeMode: options.safeMode,
          collectableGoal: options.collectableGoal,
          fixedPrefix: actionsFromKeys(options.fixedPrefix),
          // 以目前最佳為種子——用「實際會執行的動作」（跟輸出的巨集一致），不是含失敗尾巴／被跳過動作的原始序列：
          // 後者的突變、交配大多打在沒用的位置上。實測同一個種子，清理後 1.9 秒就成功，原始序列 25 秒都沒成功。
          seeds: [(best.eval.actions && best.eval.actions.length ? best.eval.actions : best.rotation).map(function (a) { return new a.constructor(); })],
          goalQuality: options.goalQuality,
          deadline: CraftClock.now() + Math.min(remaining, options.iterGaMs || 3000),
        });
        let rot = solver.run(function (p) {
          if (typeof onProgress !== 'function') return;
          onProgress({ trial: Math.min(attempts, totalTrials), totalTrials: totalTrials, generation: p.generation, totalGenerations: p.totalGenerations, bestSuccess: p.bestSuccess, bestHqPercent: p.bestHqPercent, bestCollectability: p.bestCollectability, bestSteps: p.bestSteps });
        });
        const polishCap = Math.max(0, Math.min(options.iterIlsMs != null ? options.iterIlsMs : (best.eval.success ? 1500 : 1200), remaining)); // 每一輪「從最佳出發」之後的迭代局部搜尋時間；短而多輪，比長而少輪更能靠 GA 的多樣性跳出局部最佳
        solver.config.deadline = CraftClock.now() + Math.max(300, polishCap);
        if (polishCap > 0) rot = solver.ils(rot, polishCap);
        const ev = evaluateRotation(craft, rot, crafterStats, options.hqIngredients, options.safeMode, options.collectableGoal);
        const sc = scoreOf(ev);
        if (sc > best.score + 0.05) { const was = best.eval.success; best = { score: sc, eval: ev, seed: seed, rotation: rot, solver: solver }; stall = 0; if (!was && best.eval.success) successAt = CraftClock.now(); }
        else stall++; // 這一輪沒有刷新最佳 // 迭代局部搜尋真的收斂（連續很多次擾動都沒有刷新最佳）：才算沒進步
        // 精修被時間截斷（還沒爬完）不算沒進步：下一輪從這個結果繼續，直到收斂或時間上限
      }
      // 沒成功：連續幾輪都沒有進步＝收斂了，才算「這組數值做不出來」；是被時間上限截斷的就不確定
      if (!best.eval.success) timedOut = stall < 4;
    }

      mark('pipeline-' + pipelineModes[mi] + '-done', { hq: best ? best.eval.hqPercent : 0 });
      modeResults.push({ best: best, trialResults: trialResults.slice(), timedOut: timedOut, continued: continued, attempts: attempts });
    }
    pipelineInfo = modeResults.map(function (m, i) { return { mode: pipelineModes[i], hq: m.best ? m.best.eval.hqPercent : 0, quality: m.best ? m.best.eval.quality : 0, steps: m.best ? m.best.eval.steps : 0, attempts: m.attempts }; });
    if (ladderStart && !libHit) best = { score: libTop.score, eval: libTop.eval, seed: baseSeed, rotation: libTop.rotation, solver: null };
    if (modeResults.length) { // 取較好的那條流程；兩條的起點都留給後面的步驟
      let pick = modeResults[0];
      modeResults.forEach(function (m) { if (m.best && (!pick.best || m.best.score > pick.best.score + 1e-9)) pick = m; });
      best = pick.best; timedOut = pick.timedOut; continued = pick.continued;
      trialResults.length = 0;
      modeResults.forEach(function (m) { m.trialResults.forEach(function (r) { trialResults.push(r); }); });
    }

    /* 先放寬、再收緊 + 品質階梯（只在「能完成、但沒做到滿品質」時用）：
     * 優質率到接近滿品質時分數幾乎是平的（92% 和 98% 差不多），隨機搜尋沒有方向感，很容易停在 9X%。
     * 反推需求的搜尋（craft-frontier.js）換個角度：先把數值放寬，在輕鬆的條件下找到目標品質的手法，
     * 再逐步收緊回真實數值，每一步都有明確的方向（「還差多少」）。
     *  ① 先試滿品質。
     *  ② 做不到的話，一步步提高「品質目標」（比目前結果高一點、再高一點…），每一步都用同一套精確反推當可行性判斷，
     *     找出目前數值下能達到的最高品質，而不是停在隨機搜尋碰巧找到的結果。
     * 所有候選手法都在目前真實數值下直接模擬，只有「確實更好」才採用，所以不會讓原本的結果變差。 */
    if (options.relaxTighten !== false && (strat == null || strat === 'ladder' || (strat === 'lib' && !libEvals.length)) && options.rawStats && !options.goalQuality && !options.collectableGoal && craft.quality > 0 &&
        !(options.fixedPrefix && options.fixedPrefix.length) && best && best.eval.success && best.eval.quality < craft.quality) {
      try {
        Math.random = mulberry32((baseSeed + 9000) >>> 0);
        const raw = options.rawStats, goalQ = craft.quality;
        const keysOf = function (rot) { return rot.map(function (a) { return a.constructor.name; }); };
        const bestKeys = function () { return keysOf(best.eval.actions && best.eval.actions.length ? best.eval.actions : best.rotation); };
        const tryTarget = function (qGoal, budgetMs) { // 找「品質目標 qGoal 下所需數值最低」的手法，直接在目前數值模擬，確實更好才採用
          const topKeys = trialResults.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 3).map(function (c) { return keysOf(c.eval && c.eval.actions && c.eval.actions.length ? c.eval.actions : c.rotation); }).concat(libSeedKeys.slice(0, 2));
          const found = CraftFrontier.frontierSearch(craft,
            function (cs, ct, cp) { return buildCrafterStats(Object.assign({}, raw, { craftsmanship: cs, control: ct, cp: cp })); },
            function (gen) { return buildCrafterStats(Object.assign({}, raw, { craftsmanship: gen.cs, control: gen.ct, cp: gen.cp })); },
            { goal: 'full', ref: { craftsmanship: raw.craftsmanship, control: raw.control, cp: raw.cp }, qGoal: qGoal, hq: options.hqIngredients || [],
              libKeys: libKeys, allowed: options.allowedSet || null, budgetMs: budgetMs, quick: true, seedKeys: bestKeys(), seedKeysList: topKeys, safeMode: options.safeMode },
            actionsFromKeys);
          let improved = false;
          for (let ci = 0; ci < found.cands.length; ci++) {
            const rot = actionsFromKeys(found.cands[ci].keys);
            const ev = evaluateRotation(craft, rot, crafterStats, options.hqIngredients, options.safeMode, options.collectableGoal);
            if (!ev.success) continue;
            const sc = scoreOf(ev);
            if (sc > best.score + 0.005) { best = { score: sc, eval: ev, seed: best.seed, rotation: rot, solver: best.solver }; improved = true; }
          }
          return improved;
        };
        // 離滿品質多近：除了目前結果的優質率，也看手法庫裡每套手法「最少需要多少數值」跟你的數值差多少（精確反推，不是估計）。
        // 只用來決定「先衝滿品質」還是「先走階梯」的順序，兩邊都會服務，不會因此跳過任何一邊。
        let nearByNeeds = false;
        if (options.needsOrder && libKeys.length) {
          let minD = Infinity;
          libKeys.forEach(function (keys) {
            try {
              const n = CraftFrontier.needsOfRotation(craft, actionsFromKeys(keys),
                { makeStats: function (cs, ct, cp) { return buildCrafterStats(Object.assign({}, raw, { craftsmanship: cs, control: ct, cp: cp })); }, hq: options.hqIngredients || [], safeMode: options.safeMode !== false, full: true, qGoal: goalQ,
                  gen: { cs: Math.ceil(raw.craftsmanship * 10), ct: Math.ceil(raw.control * 10), cp: Math.ceil(raw.cp * 10 + 600) }, fast: true }, 20);
              if (n) minD = Math.min(minD, Math.max(n.cs / raw.craftsmanship, n.ct / raw.control, n.cp / raw.cp));
            } catch (e) { /* 這套手法不能用就略過 */ }
          });
          nearByNeeds = minD <= 1.1;
        }
        if (best.eval.hqPercent >= (options.relaxMinHq != null ? options.relaxMinHq : 70) || nearByNeeds) { tryTarget(goalQ, options.relaxBudgetMs || 1800); mark('relax-full', { hq: best.eval.hqPercent }); } // ① 已經很接近滿品質時直接衝滿品質（只是安排順序：離得遠的由下面的階梯一步步逼近，同樣會服務）
        if (best.eval.quality < goalQ && options.qualityLadder !== false) { // ② 品質階梯：不論離滿品質多遠都照常服務；只有已經確定做到滿品質才會省略
          let inc = (goalQ - best.eval.quality) * 0.4;
          const maxAttempts = strat === 'ladder' ? 5 : 3;
          const ladderT0 = CraftClock.now();
          for (let attempt = 0; attempt < maxAttempts && best.eval.quality < goalQ && CraftClock.now() - ladderT0 < (options.ladderCapMs || (strat === 'lib' ? 4000 : 6000)); attempt++) { // 階梯優先流程的總時間上限，避免比獨立流程（原本的做法）慢
            const target = Math.min(goalQ, best.eval.quality + Math.max(inc, goalQ * 0.02));
            const okT = tryTarget(target, options.ladderBudgetMs || 1000); mark('ladder-attempt-' + attempt, { ok: okT, hq: best.eval.hqPercent });
            if (okT) inc = (goalQ - best.eval.quality) * 0.4;
            else { inc *= 0.5; if (inc < goalQ * 0.02) break; }
          }
        }
      } catch (e) { /* 這一步只是加碼，失敗就維持原本的結果 */ }
    }
    if (strat === 'ladder' && best && best.eval.success) { // 最後用局部精修把手法整理得更好（更短、更穩）
      try {
        Math.random = mulberry32((baseSeed + 7000) >>> 0);
        const sv = new CraftSolverGA(craft, crafterStats, { populationSize: 60, generations: 10, hqTarget: options.hqTarget || 90, hqIngredients: options.hqIngredients || [], safeMode: options.safeMode,
          seeds: [best.rotation], deadline: CraftClock.now() + 900, collectableGoal: options.collectableGoal, fixedPrefix: actionsFromKeysGlobal(prefixKeys) });
        const rot = sv.ils(best.rotation, 800);
        const evp = evaluateRotation(craft, rot, crafterStats, options.hqIngredients, options.safeMode, options.collectableGoal);
        const scp = scoreOf(evp);
        if (evp.success && scp > best.score + 0.005) best = { score: scp, eval: evp, seed: best.seed, rotation: rot, solver: sv };
      } catch (e) { /* 精修失敗就用原本的結果 */ }
    }
    // 保證：不會比手法庫裡「現成就能用的最佳手法」更差（手法庫只會幫忙，不會拖累）
    if (libTop && best && libTop.eval.success && libTop.score > best.score + 1e-9) {
      best = { score: libTop.score, eval: libTop.eval, seed: best.seed, rotation: libTop.rotation, solver: best.solver };
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
    pipelineInfo: options.debug ? pipelineInfo : undefined,
    phaseLog: options.debug ? phaseLog : undefined,
    libHit: !!libHit,
  };
}


/* ---------- 集束搜尋流程（strategy:'beam'）----------
 * 跟遺傳演算法完全不同的搜尋方式（見 craft-exact.js）：系統性地一步一步展開，不靠隨機運氣。
 * 做法：由窄到寬逐步加大集束寬度（先用小寬度快速拿到一個好結果，再用更寬的去追更好的），每個寬度跑幾組不同的評價權重；
 * 運算量用「展開的節點數」限制（不是時間），所以結果在任何裝置上都一樣、可重現。
 * 找到的每一個候選手法都先用 vendor 模擬器（跟網站其他地方完全相同的評分方式）重算，再用既有的局部精修整理一次。
 * 只支援「安全模式、沒有固定前綴、沒有品質階梯目標」的求解（其餘情況回傳 null，由其他策略負責）。
 * 這條流程只是「多一個候選來源」：網頁端會跟其他策略的結果一起比較、取最好的，所以不可能讓結果變差。 */
const BEAM_WIDTHS = [2500, 7000, 16000];
const BEAM_VARIANTS = [{ dur: 0.6, buff: 0.6 }, { dur: 0.4, buff: 0.4 }, { cp: 0.6 }, { cp: 0.4, dur: 0.6 }];
function betterEval(craft, options, a, b) { // 排序：成功 > 優質率（收藏品則為收藏度，上限為目標）> 品質 > 步數；a 比 b 好才回傳 true
  if (!b) return true;
  if (!!a.success !== !!b.success) return !!a.success;
  if (!a.success) return a.progression > b.progression;
  if (options.collectableGoal) {
    const ca = Math.min(a.collectability, options.collectableGoal), cb = Math.min(b.collectability, options.collectableGoal);
    if (ca !== cb) return ca > cb;
  } else {
    if (a.hqPercent !== b.hqPercent) return a.hqPercent > b.hqPercent;
    const cap = craft.quality > 0 ? craft.quality : Infinity, qa = Math.min(a.quality, cap), qb = Math.min(b.quality, cap);
    if (qa !== qb) return qa > qb;
  }
  return a.steps < b.steps;
}
function solveBeam(craft, crafterStats, options) {
  if (options.safeMode === false || options.goalQuality != null) return null;
  const S = CraftSimFast, E = CraftExact;
  const stats = { craftsmanship: crafterStats.craftsmanship, control: crafterStats.getControl({}), cp: crafterStats.cp, level: crafterStats.level, specialist: !!crafterStats.specialist };
  const ctx = S.makeCtx(craft, stats, options.hqIngredients || [], simulator.Tables.LEVEL_TABLE[crafterStats.level], allowedActionNames(crafterStats));
  /* 接續求解：玩家手動選好的前幾步固定不動，先用精簡模擬器走完得到起點狀態，集束搜尋只展開後面的部分。
   * 前綴有任何一步在精簡模擬器裡不能用（不支援的技能、CP 不夠…）就回傳 null，由其他策略處理。 */
  const prefixKeys = options.fixedPrefix || [], prefixIds = []; let startState = null;
  if (prefixKeys.length) {
    const st0 = S.initState(ctx);
    for (let pi = 0; pi < prefixKeys.length; pi++) {
      const pid = S.A[prefixKeys[pi]];
      if (pid == null || !S.canUse(ctx, st0, pid) || S.step(ctx, st0, pid) !== 0) return null;
      prefixIds.push(pid);
    }
    startState = st0;
  }
  const capQ = options.collectableGoal ? options.collectableGoal * 10 : craft.quality;
  ctx.QCAP = capQ;
  const baseSeed = hashSeed(craft.id + '|' + stats.craftsmanship + '|' + stats.control + '|' + stats.cp + '|beam');
  const keysOf = function (ids) { return ids.map(function (i) { return S.ACTIONS[i].name; }); };
  const actionsOf = function (keys) { return keys.map(function (k) { const e = simulator.CraftingActionsRegistry.ALL_ACTIONS.find(function (x) { return x.name === k; }); return e ? new e.action.constructor() : null; }).filter(Boolean); };
  let best = null, expandedTotal = 0, budget = options.beamMaxExpand || 28e6;
  const realDeadline = Date.now() + (options.beamRealCapMs || 25000); // 安全上限：極慢的裝置不會無限等（只有觸發時結果才會因裝置而異）
  const seen = new Set();
  /* 手法庫（離線用超大運算量產生的靜態資料）：每套手法都用「玩家這組實際數值」重新評分，當作候選；
   * 同時當作集束搜尋的保護種子（它們走過的狀態一定留在搜尋裡），所以結果保證不比庫裡任何一套在這組數值下的表現差。
   * 庫的手法在這組數值下做不到的（CP 不夠、技能被排除）會被自然淘汰，不影響其他。 */
  const libIds = [];
  (prefixKeys.length ? [] : (options.libraryKeys || [])).slice(0, 48).forEach(function (keys) {
    const ids = [];
    for (let i = 0; i < keys.length; i++) { const id = S.A[keys[i]]; if (id == null) { ids.length = 0; break; } ids.push(id); }
    if (ids.length) libIds.push(ids);
  });
  const consider = function (ids) {
    const keys = keysOf(ids), sig = keys.join(',');
    if (seen.has(sig)) return;
    seen.add(sig);
    const rot = actionsOf(keys);
    const ev = evaluateRotation(craft, rot, crafterStats, options.hqIngredients, options.safeMode, options.collectableGoal);
    if (betterEval(craft, options, ev, best && best.eval)) best = { eval: ev, rotation: rot };
  };
  const reachedCap = function () { return best && best.eval.success && craft.quality > 0 && (options.collectableGoal ? best.eval.collectability >= options.collectableGoal : best.eval.quality >= craft.quality); };
  const widths = options.beamWidths || BEAM_WIDTHS; // 離線產生手法庫時可以傳更寬的
  libIds.forEach(consider);
  outer:
  for (let wi = 0; wi < widths.length; wi++) {
    for (let vi = 0; vi < BEAM_VARIANTS.length; vi++) {
      if (budget <= 0 || Date.now() > realDeadline) break outer;
      const r = E.beamSearch(ctx, { beam: widths[wi], variant: BEAM_VARIANTS[vi], seeds: libIds, startState: startState, maxExpand: budget, realDeadline: realDeadline });
      expandedTotal += r.expanded || 0; budget -= r.expanded || 0;
      if (r.unsupported) return null;
      if (r.ids) consider(prefixIds.concat(r.ids));
      if (reachedCap()) break outer; // 品質已經到上限：更寬的集束只會更慢，不會更好
    }
  }
  if (!best || !best.eval.success) return null;
  // 局部精修（既有的 ILS，用 vendor 評分）：整理成更短、更穩的手法；只在「更好」時採用
  const originalRandom = Math.random;
  try {
    Math.random = mulberry32((baseSeed + 7000) >>> 0);
    const sv = new CraftSolverGA(craft, crafterStats, { populationSize: 60, generations: 10, hqTarget: options.hqTarget || 90, hqIngredients: options.hqIngredients || [], safeMode: options.safeMode,
      seeds: [best.rotation], deadline: CraftClock.now() + 900, collectableGoal: options.collectableGoal });
    const rot = sv.ils(best.rotation, 800);
    const ev = evaluateRotation(craft, rot, crafterStats, options.hqIngredients, options.safeMode, options.collectableGoal);
    if (betterEval(craft, options, ev, best.eval)) best = { eval: ev, rotation: rot };
  } catch (e) { /* 精修失敗就用集束搜尋原本的結果 */ } finally { Math.random = originalRandom; }
  return {
    success: true, actions: best.eval.actions, hqPercent: best.eval.hqPercent, collectability: best.eval.collectability, steps: best.eval.steps,
    progression: best.eval.progression, quality: best.eval.quality, durabilityLeft: best.eval.durabilityLeft, cpLeft: best.eval.cpLeft,
    attempts: 1, timedOut: false, seed: baseSeed, libHit: false, engine: 'beam', beamExpanded: expandedTotal, beamLibSeeds: libIds.length,
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

/* ---------- 手法庫 ----------
 * data/craft-rotation-library.json 是離線預先算好的「每種配方形狀的一批互不被壓過的手法」（只存技能序列，不存玩家數值）。
 * 玩家的數值不同沒關係：每套手法需要的數值，載入時用模擬精確反推。庫沒有、或載入失敗都不影響求解，照原本流程跑。
 * 「配方形狀」＝會影響模擬結果的欄位（耐久、進度、品質、各種係數、條件旗標…），同形狀的配方可以共用同一批手法。 */
self.__library = null;
self.__libraryReady = (function () {
  try {
    const url = new URL('../data/craft-rotation-library.json', self.location.href).href;
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { self.__library = j; }).catch(function () { /* 沒有庫就照常求解 */ });
  } catch (e) { return Promise.resolve(); }
})();
/* 這個玩家實際能用的技能（比照搜尋產生手法時的規則）：職業、等級夠不夠、有沒有被玩家勾掉（還沒學會）。
 * 手法庫的手法是離線用「等級 100、沒有禁用技能」產生的，不能直接拿來用：玩家不能用的技能必須剔除，否則建議／巨集會用到他做不出來的技能。 */
function allowedActionNames(crafterStats) {
  const ANY = -1, excluded = new Set(crafterStats.excludedActions || []), out = new Set();
  simulator.CraftingActionsRegistry.ALL_ACTIONS.forEach(function (entry) {
    const action = entry.action, name = action.constructor.name;
    if (name === 'RemoveFinalAppraisal' || excluded.has(name)) return;
    const req = action.getLevelRequirement();
    if ((req.job === ANY || req.job === crafterStats.jobId) && crafterStats.level >= req.level) out.add(name);
  });
  return out;
}
/* 把玩家不能用的技能從手法裡剔掉（剩下的步驟照樣用模擬精確評估，不能用的版本就不會被採用） */
function sanitizeKeysList(keysList, allowed) {
  const seen = new Set(), out = [];
  (keysList || []).forEach(function (keys) {
    const k2 = keys.filter(function (n) { return allowed.has(n); });
    if (k2.length < 3) return;
    const sig = k2.join(','); if (seen.has(sig)) return; seen.add(sig); out.push(k2);
  });
  return out;
}
function shapeKeyOf(r) {
  return [r.rlvl, r.durability, r.progress, r.quality, r.progressDivider, r.qualityDivider, r.progressModifier, r.qualityModifier, r.conditionsFlag, r.isExpert ? 1 : 0, r.requiredQuality || 0].join('|');
}
function libraryKeysFor(recipe) {
  const lib = self.__library;
  if (!lib || !lib.shapes || !lib.actions) return [];
  const rots = lib.shapes[shapeKeyOf(recipe)];
  if (!rots) return [];
  return rots.map(function (r) { return r.map(function (i) { return lib.actions[i]; }); });
}

/* 由手法庫的技能銜接統計（「這個技能後面常接哪個技能」）隨機產生新的手法當搜尋的額外種子。
 * 只是額外的起點：種子只是初始族群的一部分，搜尋仍然自由交配、突變，不受這些銜接規則限制。 */
function markovSeeds(keysList, n, seed) {
  if (!keysList || keysList.length < 3) return [];
  const trans = {};
  keysList.forEach(function (ks) {
    let prev = '^';
    ks.forEach(function (k) { (trans[prev] = trans[prev] || {})[k] = (trans[prev][k] || 0) + 1; prev = k; });
    (trans[prev] = trans[prev] || {})['$'] = ((trans[prev] || {})['$'] || 0) + 1;
  });
  const rnd = mulberry32(seed >>> 0), out = [];
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const seq = []; let prev = '^';
    while (seq.length < 45) {
      const t = trans[prev]; if (!t) break;
      let tot = 0, k; for (k in t) tot += t[k];
      let r = rnd() * tot, pick = null; for (k in t) { r -= t[k]; if (r <= 0) { pick = k; break; } }
      if (!pick || pick === '$') break;
      seq.push(pick); prev = pick;
    }
    if (seq.length >= 5) out.push(seq);
  }
  return out;
}

/* ---------- 共用：手法鍵名 → 技能實例；固定手法在指定數值下的完整結果（含巨集） ---------- */
function actionsFromKeysGlobal(keys) {
  return (keys || []).map(function (key) {
    const entry = simulator.CraftingActionsRegistry.ALL_ACTIONS.find(function (e) { return e.name === key; });
    return entry ? new entry.action.constructor() : null;
  }).filter(Boolean);
}
function attachMacro(result, lang) {
  result.macroSegments = splitMacroSegments(buildMacroLines(result.actions, lang));
  result.actionNames = result.actions.map(function (a) { return actionDisplayName(a, lang); });
  result.actionKeys = result.actions.map(function (a) { return a.constructor.name; });
  delete result.actions;
  return result;
}

/* ---------- Worker 訊息入口 ---------- */
self.onmessage = async function (e) {
  const msg = e.data || {};
  CraftClock.begin({ deterministic: msg.deterministic !== false && !(msg.options && msg.options.deterministic === false), realCapMs: msg.options && msg.options.realCapMs });
  if (msg.type === 'frontier' || msg.type === 'solve' || msg.type === 'preview') await self.__libraryReady;
  if (msg.type === 'frontier' || msg.type === 'simulate' || msg.type === 'needs' || msg.type === 'evalmany' || msg.type === 'preview') {
    try {
      const recipe = CRAFT_RECIPES[msg.recipeId];
      if (!recipe) throw new Error('找不到配方 id=' + msg.recipeId);
      const craft = buildCraftObject(Object.assign({ id: msg.recipeId }, recipe), {});
      if (msg.type === 'simulate') {
        // 固定手法、固定數值，完全確定的重算（不含任何隨機搜尋）：驗證「這組數值＋這套手法」到底做不做得到
        const crafterStats = buildCrafterStats(msg.stats);
        const r = evaluateRotation(craft, actionsFromKeysGlobal(msg.keys), crafterStats, msg.hq || [], msg.safeMode, null);
        self.postMessage({ type: 'solve-result', requestId: msg.requestId, ok: true, craft: craft, result: attachMacro(r, msg.lang || 'tw') });
        return;
      }
      const cs0 = buildCrafterStats(Object.assign({ craftsmanship: 1, control: 1, cp: 1, level: 100 }, msg.stats));
      msg.allowed = allowedActionNames(cs0); // 玩家不能用的技能（禁用／等級不夠）絕不會出現在任何候選手法裡
      if (!(msg.libKeys && msg.libKeys.length)) msg.libKeys = sanitizeKeysList(libraryKeysFor(recipe), msg.allowed); // 離線產生庫時由產生腳本直接帶入
      if (msg.type === 'preview') {
        /* 免求解的能力預覽：手法庫裡每套手法最少需要多少數值，用模擬精確反推（每套約 1 毫秒），不必求解就能告訴玩家「這個配方滿品質大約要多少」。
         * 玩家不能用的技能（禁用／等級不夠）會先剔除，所以顯示的需求都是這位玩家實際做得到的。 */
        const cs1 = buildCrafterStats(Object.assign({ craftsmanship: 1, control: 1, cp: 1, level: 100 }, msg.stats));
        const allowed = allowedActionNames(cs1);
        const keysList = sanitizeKeysList(libraryKeysFor(recipe), allowed);
        const mk = function (cs, ct, cp) { return buildCrafterStats(Object.assign({}, msg.stats, { craftsmanship: cs, control: ct, cp: cp })); };
        const hqAll = (craft.ingredients || []).filter(function (i) { return i.quality > 0; }).map(function (i) { return { id: i.id, amount: i.amount }; });
        const calc = function (hq) {
          const out = [];
          keysList.forEach(function (keys) {
            try {
              const n = CraftFrontier.needsOfRotation(craft, actionsFromKeysGlobal(keys), { makeStats: mk, hq: hq, safeMode: true, full: true, qGoal: craft.quality, gen: { cs: 60000, ct: 60000, cp: 6000 }, allowed: allowed }, 5, true);
              if (n) out.push({ cs: n.cs, ct: n.ct, cp: n.cp, csMax: n.csMax, steps: n.steps });
            } catch (e) { /* 這套手法不能用就略過 */ }
          });
          const le = function (a, b) { return a.cs <= b.cs && a.ct <= b.ct && a.cp <= b.cp; };
          return out.filter(function (c, i) { return !out.some(function (e, j) { return j !== i && le(e, c) && (e.cs < c.cs || e.ct < c.ct || e.cp < c.cp || j < i); }); }).slice(0, 8);
        };
        const cur = calc(msg.hq || []);
        const allHq = hqAll.length ? calc(hqAll) : cur;
        self.postMessage({ type: 'solve-result', requestId: msg.requestId, ok: true, result: { has: keysList.length > 0, count: keysList.length, cur: cur, allHq: allHq, hasHqChoice: hqAll.length > 0, quality: craft.quality } });
        return;
      }
      if (msg.type === 'evalmany') {
        // 一批手法在指定數值下的結果（確定性模擬）：離線改進手法庫時用來找出「庫裡最好的手法在這組數值下做到多少」
        const cs = buildCrafterStats(msg.stats);
        const list = (msg.keysList || []).map(function (keys) {
          try { const ev = evaluateRotation(craft, actionsFromKeysGlobal(keys), cs, msg.hq || [], msg.safeMode, null); return { success: !!ev.success, quality: ev.quality, hqPercent: ev.hqPercent, steps: ev.steps }; }
          catch (e) { return null; }
        });
        self.postMessage({ type: 'solve-result', requestId: msg.requestId, ok: true, result: list });
        return;
      }
      if (msg.type === 'needs') {
        // 一批手法各自最少需要的數值（離線產生手法庫時用來篩選互不被壓過的手法）
        const full = msg.goal === 'full';
        const mk = function (cs, ct, cp) { return buildCrafterStats(Object.assign({}, msg.stats, { craftsmanship: cs, control: ct, cp: cp })); };
        const gen = { cs: 60000, ct: 60000, cp: 6000 };
        const list = (msg.keysList || []).map(function (keys) {
          try {
            const n = CraftFrontier.needsOfRotation(craft, actionsFromKeysGlobal(keys), { makeStats: mk, hq: msg.hq || [], safeMode: msg.safeMode !== false, full: full, qGoal: craft.quality, gen: gen }, 5);
            return n ? { cs: n.cs, ct: n.ct, cp: n.cp, steps: n.steps, keys: n.keys } : null;
          } catch (e) { return null; }
        });
        self.postMessage({ type: 'solve-result', requestId: msg.requestId, ok: true, result: list });
        return;
      }
      const originalRandom = Math.random;
      Math.random = mulberry32((hashSeed(String(msg.recipeId) + '|' + (msg.seed || 0))) >>> 0);
      try {
        // 集束搜尋當額外的候選來源（craft-frontier.js 會在「滿品質」目標時呼叫它）：在指定的寬裕數值下找一套手法，回傳技能名稱清單
        if (!msg.noBeam) msg.beamFn = function (gen, maxExpand) {
          const cs = buildCrafterStats(Object.assign({}, msg.stats, { craftsmanship: gen.cs, control: gen.ct, cp: gen.cp }));
          const r = solveBeam(craft, cs, { hqIngredients: msg.hq || [], safeMode: msg.safeMode !== false, beamMaxExpand: maxExpand, beamWidths: [2500, 6000], beamRealCapMs: 6000, libraryKeys: [] });
          return r && r.actions ? r.actions.map(function (a) { return a.constructor.name; }) : null;
        };
        const out = CraftFrontier.frontierSearch(
          craft,
          function (cs, ct, cp) { return buildCrafterStats(Object.assign({}, msg.stats, { craftsmanship: cs, control: ct, cp: cp })); },
          function (gen) { return buildCrafterStats(Object.assign({}, msg.stats, { craftsmanship: gen.cs, control: gen.ct, cp: gen.cp })); },
          msg, actionsFromKeysGlobal);
        self.postMessage({ type: 'solve-result', requestId: msg.requestId, ok: true, result: out });
      } finally { Math.random = originalRandom; }
    } catch (err) {
      self.postMessage({ type: 'solve-result', requestId: msg.requestId, ok: false, error: String(err && err.message || err) });
    }
    return;
  }
  if (msg.type !== 'solve') return;

  const { requestId, recipeId, stats, options } = msg;
  try {
    const recipe = CRAFT_RECIPES[recipeId];
    if (!recipe) throw new Error('找不到配方 id=' + recipeId);

    const craft = buildCraftObject(Object.assign({ id: recipeId }, recipe), options);
    const crafterStats = buildCrafterStats(stats);
    const solveOpts = Object.assign({}, options || {}, { rawStats: stats, libraryKeys: sanitizeKeysList(libraryKeysFor(recipe), allowedActionNames(crafterStats)), allowedSet: allowedActionNames(crafterStats) });
    const onProg = function (p) {
      // 手法庫狀況：確認「有手法庫、而且沒有直接命中滿品質」才通知網頁開另外兩條策略（直接命中約 1 秒就結束，不必白開 Worker）
      if (p && p.kind === 'info') { self.postMessage({ type: 'solve-info', requestId: requestId, libraryCount: p.libraryCount, libHit: p.libHit }); return; }
      self.postMessage({ type: 'solve-progress', requestId: requestId, progress: p });
    };
    // strategy:'beam' 是額外的候選來源（集束搜尋）；不支援的情況回傳 null，網頁端會忽略這條，不影響其他策略
    const result = (options && options.strategy === 'beam') ? solveBeam(craft, crafterStats, solveOpts) : solveWithMitigations(craft, crafterStats, solveOpts, onProg);
    if (!result) throw new Error('beam-unsupported');
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
