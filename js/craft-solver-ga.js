/* craft-solver-ga.js — 自製生產手法遺傳演算法求解器
 *
 * 為什麼自己寫，不用 @ffxiv-teamcraft/crafting-solver：
 *   實測發現該套件內建的技能清單是舊版快照（缺 Veneration、Dawntrail 新技能，
 *   還混了 Ingenuity/PatientTouch 等 6.0 改版時就已從遊戲移除的技能），
 *   直接拿來用會讓玩家的巨集叫出遊戲裡不存在的技能而失敗。
 *
 *   模擬引擎與技能規則本身改用 @ffxiv-teamcraft/simulator（有跟上到 Dawntrail），
 *   只有「怎麼搜尋最佳手法序列」這段 GA 邏輯自己實作，可控、可驗證，且技能來源保證即時。
 *
 * 依賴：需先 importScripts('vendor/ffxiv-simulator.umd.js')，提供全域 `simulator`。
 */
(function (global) {
  'use strict';

  /* 修補 @ffxiv-teamcraft/simulator 本身的方法命名不一致問題：
   * 基底類別 CraftingAction.getSuccessRate() 呼叫 this._getSuccessRate()，但
   * BasicSynthesis/CarefulSynthesis 等主力技能子類別只定義了 getBaseSuccessRate()，
   * 兩個名字對不上。safeMode=false 時因為 `&&` 短路邏輯不會呼叫到，所以平常沒事，
   * 一開啟 safeMode（100%可靠性）這些主力技能呼叫就會直接丟例外。這裡補一個退回實作。
   */
  if (!simulator.CraftingAction.prototype._getSuccessRate) {
    simulator.CraftingAction.prototype._getSuccessRate = function (simulationState) {
      return typeof this.getBaseSuccessRate === 'function' ? this.getBaseSuccessRate(simulationState) : 100;
    };
  }

  function CraftSolverGA(recipe, stats, config) {
    this.recipe = recipe;
    this.stats = stats;
    this.config = Object.assign(
      {
        populationSize: 150,
        generations: 40,
        eliteRate: 0.15,
        maxSteps: 60, // 單一手法序列步數上限，避免亂數迴圈失控
        hqTarget: 100,
      },
      config || {}
    );
    this.hqIngredients = (config && config.hqIngredients) || [];
    this.fixedPrefix = (config && config.fixedPrefix) || []; // 接續求解：玩家手動選過、固定不變的前面幾步（action實例陣列）
    this.collectableGoal = (config && config.collectableGoal) || null; // 收藏品模式：設定目標收藏度，不設就是一般模式衝HQ%
    // 100%可靠性：預設開啟，把所有非必定成功的技能視為不可靠不採用；玩家沒有另外要求就是這個行為
    this.safeMode = !(config && config.safeMode === false);
    this.availableActions = this._buildAvailableActions();
  }

  /* 依職業與等級篩出角色「理論上」能用的技能，再扣掉玩家自己勾選「還沒學會」的部分。
   * 為什麼要讓玩家自己勾選，而不是我們內建一份「哪些技能需要額外解任務」的清單：
   * 這份清單會隨版本變動、也可能有查證不到的遺漏，與其冒錯的風險，不如讓最清楚自己
   * 實際學了什麼技能的玩家自己勾選排除，求解器保證不會用到勾掉的技能。
   * stats.excludedActions: string[]，內容是技能的內部鍵名（如 "TrainedEye"），比照
   * CRAFT_ACTION_NAMES 的 key，介面上會顯示對應的繁中名稱給玩家勾選。
   */
  CraftSolverGA.prototype._buildAvailableActions = function () {
    var stats = this.stats;
    var ANY = -1;
    var excluded = new Set(stats.excludedActions || []);
    return simulator.CraftingActionsRegistry.ALL_ACTIONS
      .map(function (entry) { return entry.action; })
      .filter(function (action) {
        var name = action.constructor.name;
        // 排除內部技術性動作（玩家操作不到、不該出現在巨集裡）
        if (name === 'RemoveFinalAppraisal') return false;
        // 排除玩家自己勾選「還沒學會」的技能
        if (excluded.has(name)) return false;
        var req = action.getLevelRequirement();
        var jobOk = req.job === ANY || req.job === stats.jobId;
        return jobOk && stats.level >= req.level;
      });
  };

  /* 在目前手法序列（部分）狀態下，篩出這一步「可以使用」的技能，隨機選一個 */
  CraftSolverGA.prototype._pickRandomValidAction = function (currentRotation) {
    var self = this; // filter 回呼裡的 this 不會指向實例，先存起來避免存取 this.safeMode 時出錯
    var tempSim = new simulator.Simulation(this.recipe, currentRotation, this.stats, this.hqIngredients);
    tempSim.run(false, undefined, this.safeMode);
    var usable = this.availableActions.filter(function (action) {
      try {
        return action.canBeUsed(tempSim, false, self.safeMode);
      } catch (e) {
        return false;
      }
    });
    if (usable.length === 0) return null;
    var picked = usable[Math.floor(Math.random() * usable.length)];
    // 建立新實例，避免多個手法序列共用同一個物件參照
    return new picked.constructor();
  };

  /* 在同一個模擬狀態上「多走一步」，邏輯對齊 Simulation.run 內每一步的處理（逐步版）。
   * 效能關鍵：以前每選一步都要把整串技能從頭模擬兩次（選技能一次、判斷終局一次），產生一條 40 步的手法要重跑
   * 約 80 次、成本隨步數平方成長；實測整個求解有 88% 的時間花在這裡。改成同一個模擬狀態一路往下走，每步只算一次。
   * 狀態固定用「普通」：評分（evaluate）本來就是線性、每步普通狀態，選技能時用同一個前提，
   * 才不會選到評分時其實用不了、被跳過的技能（需要「高品質」狀態的技能）。 */
  CraftSolverGA.prototype._applyAction = function (sim, action, index) {
    sim.state = simulator.StepState.NORMAL;
    var canUse = false;
    try { canUse = action.canBeUsed(sim, false); } catch (e) { canUse = false; }
    var hasCP = action.getBaseCPCost(sim) <= sim.availableCP;
    var result;
    if (sim.success === undefined && hasCP && canUse) {
      result = sim.runAction(action, false, this.safeMode, index);
    } else {
      result = { action: action, success: null, addedQuality: 0, addedProgression: 0, cpDifference: 0, skipped: true, solidityDifference: 0, state: sim.state };
    }
    var skipTicksOnFail = !result.success && action.skipOnFail();
    if (sim.success === undefined && !action.skipsBuffTicks() && !skipTicksOnFail) sim.tickBuffs(false, action);
    sim.steps.push(result);
    return result;
  };

  /* 隨機生成一條「能跑到終局」的手法序列（成功或失敗都算終局，只是不要半途而廢） */
  CraftSolverGA.prototype.generateRotation = function () {
    var self = this;
    var rotation = this.fixedPrefix.slice(); // 接續求解：固定前綴一定保留在最前面，後面才是隨機生成
    var sim = new simulator.Simulation(this.recipe, [], this.stats, this.hqIngredients);
    sim.lastPossibleReclaimStep = -1;
    rotation.forEach(function (action, i) { self._applyAction(sim, action, i); });
    var guard = 0;
    while (guard < this.config.maxSteps) {
      guard++;
      if (sim.success !== undefined) break; // 已經是終局狀態（做完了 或 失敗了）
      var usable = this.availableActions.filter(function (action) {
        try { return action.canBeUsed(sim, false, self.safeMode); } catch (e) { return false; }
      });
      if (usable.length === 0) break; // 沒有可用技能了（通常是 CP 或耐久用盡）
      var picked = new usable[Math.floor(Math.random() * usable.length)].constructor(); // 新實例，避免多個序列共用同一個物件
      rotation.push(picked);
      this._applyAction(sim, picked, rotation.length - 1);
    }
    return rotation;
  };

  /* 評分：沿用生產圈公認合理的排序邏輯 —— 沒做完看完成度；做完了看品質；都滿了看步數精簡度 */
  CraftSolverGA.prototype.evaluate = function (rotation) {
    if (rotation.length === 0) return { score: 0, success: false, hqPercent: 0 };
    var sim = new simulator.Simulation(this.recipe, rotation, this.stats, this.hqIngredients);
    var result = sim.run(true, undefined, this.safeMode); // linear=true：排除機率波動；safeMode=true：預設以最差運氣為前提，確保100%可靠
    var score;
    var collectability = this.collectableGoal ? Math.floor((sim.quality || 0) / 10) : null;
    if (!result.success) {
      var progression = result.simulation ? result.simulation.progression : 0;
      score = (Math.min(progression, this.recipe.progress) / this.recipe.progress) * 100;
    } else if (this.collectableGoal) {
      // 收藏品模式：收藏度 = 品質/10 無條件捨去，目標是「達到指定收藏度」，不是衝到滿品質，
      // 超過目標之後的品質對收藏品沒有額外好處，用步數當 tie-breaker 讓求解器不做白工。
      var reached = collectability >= this.collectableGoal;
      score = 100 + Math.min(100, (collectability / this.collectableGoal) * 100);
      if (reached) score += Math.max(0, 50 - rotation.length);
    } else {
      // 優質率在低品質時是一大片平的（都是 1～2%），搜尋沒有方向可爬；加一個「品質佔目標的比例」小項（最多 +10），
      // 讓品質高一點的手法分數也高一點。優質率仍是主要依據。
      var qRatio = this.recipe.quality > 0 ? Math.min(sim.quality || 0, this.recipe.quality) / this.recipe.quality : 0;
      score = 100 + (result.hqPercent || 0) + qRatio * 10;
      if ((result.hqPercent || 0) >= 100) score += Math.max(0, 50 - rotation.length); // 步數當極小權重 tie-breaker
    }
    return { score: score, success: !!result.success, hqPercent: result.hqPercent || 0, collectability: collectability, quality: sim.quality || 0, result: result };
  };

  /* 突變：隨機在序列中刪一步，或插入一個（依當時狀態）合法的新步驟。
   * 固定前綴（接續求解時玩家手動選過的部分）永遠不動，只在前綴之後的區段做變化。 */
  CraftSolverGA.prototype._mutate = function (rotation) {
    var prefixLen = this.fixedPrefix.length;
    if (rotation.length <= prefixLen) return rotation;
    var copy = rotation.slice();
    var op = Math.random();
    var idx = prefixLen + Math.floor(Math.random() * (copy.length - prefixLen));
    if (op < 0.4 && copy.length > prefixLen + 1) {
      copy.splice(idx, 1); // 刪一步
    } else {
      var action = this._pickRandomValidAction(copy.slice(0, idx));
      if (action) copy.splice(idx, 0, action); // 插入一步
    }
    return copy;
  };

  /* 交配：兩條序列各取前半後半拼接（單點交配，簡單但有效），切點只落在前綴之後 */
  CraftSolverGA.prototype._crossover = function (a, b) {
    var prefixLen = this.fixedPrefix.length;
    if (a.length <= prefixLen) return b.slice();
    if (b.length <= prefixLen) return a.slice();
    var cut = prefixLen + Math.floor(Math.random() * (a.length - prefixLen));
    var bCut = prefixLen + Math.floor((b.length - prefixLen) / 2);
    return a.slice(0, cut).concat(b.slice(bCut));
  };

  CraftSolverGA.prototype.run = function (onProgress) {
    var self = this;
    var populationSize = this.config.populationSize;
    var eliteCount = Math.max(1, Math.floor(populationSize * this.config.eliteRate));
    var deadline = this.config.deadline || 0; // 絕對時間(ms)；到了就用目前找到最好的收工，不論這台電腦多慢都不會無限等
    var MIN_POPULATION = 20;
    this.timedOut = false;

    /* 種子手法（暖啟動）：把已知的好手法放進初始族群。評分時它跟其他個體一樣照新條件重算，
     * 再加上菁英保留，所以新條件下的結果一定不會比這份種子手法差——用來回答「換了條件（HQ／食藥／數值）最好能到哪」。 */
    var population = (this.config.seeds || []).filter(function (r) { return r && r.length; }).slice(0, populationSize);
    for (var i = population.length; i < populationSize; i++) {
      if (deadline && i >= MIN_POPULATION && Date.now() > deadline) { this.timedOut = true; break; }
      population.push(this.generateRotation());
    }

    var best = null;
    var evCache = new Map(); // 菁英個體會原封不動進下一代，不必重新模擬評分
    for (var gen = 0; gen < this.config.generations; gen++) {
      if (best && deadline && Date.now() > deadline) { this.timedOut = true; break; }
      var scored = population.map(function (rotation) {
        var ev = evCache.get(rotation) || self.evaluate(rotation);
        return { rotation: rotation, ev: ev };
      });
      scored.sort(function (a, b) { return b.ev.score - a.ev.score; });

      if (!best || scored[0].ev.score > best.ev.score) best = scored[0];

      if (typeof onProgress === 'function') {
        onProgress({
          generation: gen + 1,
          totalGenerations: this.config.generations,
          bestSuccess: best.ev.success,
          bestHqPercent: best.ev.hqPercent,
          bestCollectability: best.ev.collectability,
          bestSteps: best.rotation.length,
        });
      }

      // 指定了品質目標（驗證「做不做得到」用）：成功且品質達標就立刻收工，不必把剩下的世代跑完
      if (this.config.goalQuality != null && best.ev.success && best.ev.quality >= this.config.goalQuality) break;

      // 已經找到「成功且高品質」的解，且是最後幾代了，可以提早收工，省時間
      if (best.ev.success && best.ev.hqPercent >= this.config.hqTarget && gen > this.config.generations * 0.3) {
        break;
      }

      var eliteScored = scored.slice(0, eliteCount);
      var elites = eliteScored.map(function (s) { return s.rotation; });
      evCache = new Map();
      eliteScored.forEach(function (s) { evCache.set(s.rotation, s.ev); });
      var nextGen = elites.slice();
      while (nextGen.length < populationSize) {
        var r = Math.random();
        if (r < 0.5) {
          // 突變：從優秀個體中選一個做小變化
          var parent = elites[Math.floor(Math.random() * elites.length)];
          nextGen.push(this._mutate(parent));
        } else if (r < 0.85) {
          // 交配：兩個優秀個體混合
          var p1 = elites[Math.floor(Math.random() * elites.length)];
          var p2 = elites[Math.floor(Math.random() * elites.length)];
          nextGen.push(this._crossover(p1, p2));
        } else {
          // 保留一部分全新隨機個體，避免過早收斂到局部最佳
          nextGen.push(this.generateRotation());
        }
      }
      population = nextGen;
    }
    if (!best) { // 時間上限在第一代評分前就到了（極慢的裝置）：至少評一次拿最好的，不能回空手法
      var first = population.map(function (rotation) { return { rotation: rotation, ev: self.evaluate(rotation) }; });
      first.sort(function (a, b) { return b.ev.score - a.ev.score; });
      best = first[0];
    }
    return best.rotation;
  };

  /* 局部精修（爬山法）：GA 容易卡在「差一點」的局部最佳（實測最佳手法進度 5864/6600，從它重新搜尋卻能到 6583），
   * 所以最後對最佳手法嘗試「刪掉一步／換成別的技能／插入一個技能」，隨機順序、遇到變好就立刻採用並從新手法繼續，
   * 整輪都沒有更好的就收工。固定前綴（接續求解時玩家手動選的）不動。maxMs 是這一步最多花多久。 */
  CraftSolverGA.prototype.polish = function (rotation, maxMs) {
    var self = this;
    var prefixLen = this.fixedPrefix.length;
    var limit = Date.now() + (maxMs || 2000);
    if (this.config.deadline) limit = Math.min(limit, this.config.deadline);
    var cur = rotation, curEv = this.evaluate(cur);
    var A = this.availableActions;
    var reached = function (ev) { return self.config.goalQuality != null && ev.success && ev.quality >= self.config.goalQuality; };
    /* 先沿著目前的手法逐步走一遍，記下「每一步當下哪些技能真的能用」（CP、耐久、前置技能都滿足）。
     * 之後的替換／插入只嘗試這些技能：不能用的技能放進去只會被跳過，等於白白評分一次（實測約省 2/3 的評分）。 */
    var usableAt = function (rot) {
      var sim = new simulator.Simulation(self.recipe, [], self.stats, self.hqIngredients);
      sim.lastPossibleReclaimStep = -1;
      var lists = [];
      for (var i = 0; i <= rot.length; i++) {
        var usable = [];
        if (sim.success === undefined) {
          sim.state = simulator.StepState.NORMAL;
          for (var a = 0; a < A.length; a++) {
            try { if (A[a].canBeUsed(sim, false, self.safeMode)) usable.push(a); } catch (e) { /* 這個技能判斷失敗就當作不能用 */ }
          }
        }
        lists.push(usable);
        if (i < rot.length) self._applyAction(sim, rot[i], i);
      }
      return lists;
    };
    this.polishConverged = false; // 精修是「爬到局部最佳」才結束，還是被時間截斷？呼叫端要用它判斷「沒進步」是真的收斂還是只是沒時間
    var improved = true;
    while (improved && !reached(curEv)) {
      improved = false;
      var usable = usableAt(cur);
      // 這一輪所有可能的改動：[種類, 位置, 技能索引]，打亂順序，這樣不會永遠只改前面那幾步
      var ops = [];
      for (var i = prefixLen; i < cur.length; i++) {
        ops.push([0, i, 0]);
        for (var u = 0; u < usable[i].length; u++) { if (A[usable[i][u]].constructor !== cur[i].constructor) ops.push([1, i, usable[i][u]]); }
      }
      for (var j = prefixLen; j <= cur.length; j++) for (var v = 0; v < usable[j].length; v++) ops.push([2, j, usable[j][v]]);
      for (var k = ops.length - 1; k > 0; k--) { var r = Math.floor(Math.random() * (k + 1)); var t = ops[k]; ops[k] = ops[r]; ops[r] = t; }
      for (var n = 0; n < ops.length; n++) {
        if ((n & 63) === 0 && Date.now() > limit) return cur; // 時間到：polishConverged 維持 false
        var op = ops[n], cand = cur.slice();
        if (op[0] === 0) cand.splice(op[1], 1);
        else if (op[0] === 1) cand[op[1]] = new A[op[2]].constructor();
        else cand.splice(op[1], 0, new A[op[2]].constructor());
        var ev = this.evaluate(cand);
        if (ev.score > curEv.score + 1e-9) { cur = cand; curEv = ev; improved = true; break; } // 變好就採用，從新手法重新開始一輪
      }
    }
    this.polishConverged = true;
    return cur;
  };

  /* 迭代局部搜尋（ILS）：精修（polish）只做「單一步驟的改動」，一旦每個單步改動都沒有更好，就卡在局部最佳。
   * 所以重複：隨機擾動 1～3 步（刪／換／插／對調）→ 精修 → 沒變差就接受、變好就記下最佳。
   * 每次嘗試很便宜（先把失敗後根本沒執行的尾巴修剪掉，手法從 150～200 個動作縮到實際會執行的幾十個），
   * 可以在同樣時間內嘗試很多次，比只精修一次更容易跳出局部最佳。
   * 連續 maxStall 次嘗試都沒有刷新最佳＝收斂（ilsConverged）；被時間截斷則不算收斂。 */
  CraftSolverGA.prototype.ils = function (rotation, maxMs) {
    var self = this, A = this.availableActions, prefixLen = this.fixedPrefix.length;
    var limit = Date.now() + (maxMs || 3000);
    if (this.config.deadline) limit = Math.min(limit, this.config.deadline);
    var reached = function (ev) { return self.config.goalQuality != null && ev.success && ev.quality >= self.config.goalQuality; };
    var trim = function (rot, ev) { // 修掉最後一個「真的有執行」的動作之後的所有尾巴（之後都是失敗／完成後被跳過的）
      var steps = ev.result && ev.result.steps, last = -1;
      if (!steps) return rot;
      for (var i = 0; i < steps.length && i < rot.length; i++) if (!steps[i].skipped) last = i;
      return rot.slice(0, Math.max(last + 1, prefixLen));
    };
    var rnd = function (n) { return Math.floor(Math.random() * n); };
    // 清理：只留「真的有執行且成功」的動作（跟輸出給玩家的巨集一致）。被跳過的動作（CP 不夠、前置條件不符）留在序列裡只會讓後續的
    // 擾動、精修大多打在沒用的位置上；清理後結果沒變差才採用（跳過的動作在模擬器裡仍會推進 Buff 計時，少數情況清理會改變結果）。
    var clean = function (rot, ev) {
      var steps = ev.result && ev.result.steps;
      if (!steps) return { rot: rot, ev: ev };
      var c = rot.filter(function (a, i) { return i < prefixLen || (steps[i] && !steps[i].skipped && steps[i].success); });
      if (c.length === rot.length) return { rot: rot, ev: ev };
      var ce = self.evaluate(c);
      return ce.score >= ev.score - 1e-9 ? { rot: c, ev: ce } : { rot: rot, ev: ev };
    };
    var cur = rotation, curEv = this.evaluate(cur);
    cur = trim(cur, curEv); curEv = this.evaluate(cur);
    var c0 = clean(cur, curEv); cur = c0.rot; curEv = c0.ev;
    var polishMs = 700;
    var p0 = this.polish(cur, polishMs); var e0 = this.evaluate(p0);
    if (e0.score >= curEv.score) { cur = trim(p0, e0); curEv = this.evaluate(cur); }
    var best = cur, bestEv = curEv, stall = 0, MAX_STALL = 40;
    while (!reached(bestEv) && Date.now() < limit && stall < MAX_STALL) {
      var cand = cur.slice(), kicks = 1 + rnd(3);
      for (var k = 0; k < kicks; k++) {
        var span = cand.length - prefixLen, kind = rnd(4);
        if (span <= 0) kind = 2;
        if (kind === 0) cand.splice(prefixLen + rnd(span), 1); // 刪一步
        else if (kind === 1) cand[prefixLen + rnd(span)] = new A[rnd(A.length)].constructor(); // 換成別的技能
        else if (kind === 2) cand.splice(prefixLen + rnd(span + 1), 0, new A[rnd(A.length)].constructor()); // 插一個技能
        else if (span >= 2) { var i = prefixLen + rnd(span - 1), t = cand[i]; cand[i] = cand[i + 1]; cand[i + 1] = t; } // 對調相鄰兩步
      }
      cand = this.polish(cand, polishMs);
      var ev = this.evaluate(cand);
      cand = trim(cand, ev); ev = this.evaluate(cand);
      var cc = clean(cand, ev); cand = cc.rot; ev = cc.ev;
      if (ev.score >= curEv.score - 1e-9) { cur = cand; curEv = ev; } // 沒變差就接受（持平也接受，讓搜尋能在平地上移動）
      if (ev.score > bestEv.score + 1e-9) { best = cand; bestEv = ev; stall = 0; } else stall++;
    }
    this.ilsConverged = reached(bestEv) || stall >= MAX_STALL;
    return best;
  };

  global.CraftSolverGA = CraftSolverGA;
})(typeof self !== 'undefined' ? self : this);
