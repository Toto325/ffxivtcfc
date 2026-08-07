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

  /* 隨機生成一條「能跑到終局」的手法序列（成功或失敗都算終局，只是不要半途而廢） */
  CraftSolverGA.prototype.generateRotation = function () {
    var rotation = this.fixedPrefix.slice(); // 接續求解：固定前綴一定保留在最前面，後面才是隨機生成
    var guard = 0;
    while (guard < this.config.maxSteps) {
      guard++;
      var action = this._pickRandomValidAction(rotation);
      if (!action) break; // 沒有可用技能了（通常是 CP 或耐久用盡）
      rotation.push(action);
      var sim = new simulator.Simulation(this.recipe, rotation, this.stats, this.hqIngredients);
      sim.run(false, undefined, this.safeMode);
      if (sim.success !== undefined) break; // 已經是終局狀態（做完了 或 失敗了）
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
      score = 100 + (result.hqPercent || 0);
      if (score >= 200) score += Math.max(0, 50 - rotation.length); // 步數當極小權重 tie-breaker
    }
    return { score: score, success: !!result.success, hqPercent: result.hqPercent || 0, collectability: collectability, result: result };
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

    var population = [];
    for (var i = 0; i < populationSize; i++) population.push(this.generateRotation());

    var best = null;
    for (var gen = 0; gen < this.config.generations; gen++) {
      var scored = population.map(function (rotation) {
        var ev = self.evaluate(rotation);
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

      // 已經找到「成功且高品質」的解，且是最後幾代了，可以提早收工，省時間
      if (best.ev.success && best.ev.hqPercent >= this.config.hqTarget && gen > this.config.generations * 0.3) {
        break;
      }

      var elites = scored.slice(0, eliteCount).map(function (s) { return s.rotation; });
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
    return best.rotation;
  };

  global.CraftSolverGA = CraftSolverGA;
})(typeof self !== 'undefined' ? self : this);
