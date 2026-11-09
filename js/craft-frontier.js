/* craft-frontier.js — 「反推最低所需數值」搜尋
 *
 * 舊做法：猜一組數值 → 跑一次隨機求解看做不做得到 → 再猜。每次驗證都有隨機雜訊（同一組數值第一次沒搜尋到、
 *        第二次卻搜尋到），而且要猜上百次，既慢又不準。
 * 新做法：反過來。模擬器是固定公式、完全確定的——給定一套手法，它「最少需要多少作業精度／加工精度／CP」
 *        可以用幾十次模擬（二分法）精確算出來，不需要任何隨機。所以讓遺傳演算法直接找「所需數值最低的手法」：
 *          ・CP：手法實際用掉多少 CP，就是最少需要多少（精確）
 *          ・作業精度：進度要做滿的最低值（二分）
 *          ・加工精度：品質要做滿的最低值（二分，只有「滿品質」目標才需要）
 *        得到的每個結果都是「這套手法 + 這組數值」確定做得到，不是估計。
 * 依賴：simulator、CraftSolverGA（craft-solver-ga.js）。 */
(function (global) {
  'use strict';

  function bisectMin(ok, hi, step) { // 回傳 step 的倍數中「ok 為真」的最小值；假設 ok 對數值單調（越高越容易），ok(hi) 必須為真
    var lo = 0, h = Math.ceil(hi / step);
    if (!ok(h * step)) return null;
    while (lo < h) {
      var mid = (lo + h) >> 1;
      if (ok(mid * step)) h = mid; else lo = mid + 1;
    }
    return h * step;
  }

  function FrontierGA(recipe, genStats, config, F) {
    global.CraftSolverGA.call(this, recipe, genStats, config);
    this.F = F;                // { goal, full, ref, qGoal, makeStats, hq, safeMode, gen }
    this.archive = [];         // 沒被別人全面壓過的「所需數值」結果
  }
  FrontierGA.prototype = Object.create(global.CraftSolverGA.prototype);
  FrontierGA.prototype.constructor = FrontierGA;

  FrontierGA.prototype._sim = function (actions, cs, ct, cp) {
    var sim = new simulator.Simulation(this.recipe, actions, this.F.makeStats(cs, ct, cp), this.F.hq);
    var res = sim.run(true, undefined, this.F.safeMode);
    return { sim: sim, res: res };
  };

  /* 這串手法最少需要的數值；做不到（在寬裕數值下都不成功）回傳 null */
  FrontierGA.prototype.needsOf = function (rotation, step) {
    var F = this.F, g = F.gen, self = this;
    var first = this._sim(rotation, g.cs, g.ct, g.cp);
    if (!first.res.success) return null;
    var clean = rotation.filter(function (a, i) { var s = first.res.steps[i]; return s && !s.skipped && s.success; });
    var base = this._sim(clean, g.cs, g.ct, g.cp);
    if (!base.res.success || (F.full && (base.sim.quality || 0) < F.qGoal)) return null;
    var cp = Math.max(0, Math.ceil(g.cp - base.sim.availableCP));
    var cs = bisectMin(function (v) { return self._sim(clean, v, g.ct, cp).res.success; }, g.cs, step);
    if (cs == null) return null;
    var ct = 0;
    if (F.full) {
      ct = bisectMin(function (v) { var r = self._sim(clean, cs, v, cp); return r.res.success && (r.sim.quality || 0) >= F.qGoal; }, g.ct, step);
      if (ct == null) return null;
    }
    var chk = this._sim(clean, cs, F.full ? ct : g.ct, cp); // 三項一起再驗一次
    if (!chk.res.success || (F.full && (chk.sim.quality || 0) < F.qGoal)) return null;
    return { cs: cs, ct: ct, cp: cp, steps: clean.length, keys: clean.map(function (a) { return a.constructor.name; }) };
  };

  /* 成本：各項「需要提升的比例」的平方和開根號（而不是直接相加）。
   * 直接相加時，把某一項拉到誇張的高度、換另兩項低一點，總和常常剛好比較小，結果就會集中在單一項目（角落解）；
   * 平方和對「集中在某一項」會明顯加重，會偏向各項一起提升，也比較貼近玩家實際換裝備、鑲嵌魔晶石的情況。 */
  FrontierGA.prototype._costOf = function (n) {
    var r = this.F.ref;
    var a = Math.max(0, n.cs - r.cs) / r.cs, b = Math.max(0, n.cp - r.cp) / r.cp;
    var sq = a * a + b * b;
    var rel = n.cs / r.cs + n.cp / r.cp;
    if (this.F.full) { var c = Math.max(0, n.ct - r.ct) / r.ct; sq += c * c; rel += n.ct / r.ct; }
    return { cost: Math.sqrt(sq), rel: rel };
  };

  FrontierGA.prototype._archiveAdd = function (n) {
    var A = this.archive, full = this.F.full;
    var le = function (a, b) { return a.cs <= b.cs && a.cp <= b.cp && (!full || a.ct <= b.ct); };
    for (var i = 0; i < A.length; i++) if (le(A[i], n)) return;
    this.archive = A.filter(function (a) { return !le(n, a); });
    this.archive.push(n);
    if (this.archive.length > 40) {
      this.archive.sort(function (a, b) { return a.cost - b.cost; });
      this.archive.length = 40;
    }
  };

  /* 評分：做不完看進度；做完了但品質不夠看品質；達標後「所需數值」越低越好 */
  FrontierGA.prototype.evaluate = function (rotation) {
    if (!rotation.length) return { score: 0, success: false, hqPercent: 0, quality: 0 };
    var F = this.F;
    var r = this._sim(rotation, F.gen.cs, F.gen.ct, F.gen.cp);
    var q = r.sim.quality || 0, score;
    if (!r.res.success) {
      var prog = r.res.simulation ? r.res.simulation.progression : (r.sim.progression || 0);
      score = Math.min(prog, this.recipe.progress) / this.recipe.progress * 100;
    } else if (F.full && q < F.qGoal) {
      score = 100 + (q / F.qGoal) * 800;
    } else {
      var n = this.needsOf(rotation, 10);
      if (!n) { score = 900; } else {
        var c = this._costOf(n);
        n.cost = c.cost;
        this._archiveAdd(n);
        score = 1000 - 100 * c.cost - 2 * c.rel - 0.02 * n.steps;
      }
    }
    return { score: score, success: !!r.res.success, hqPercent: 0, quality: q, result: r.res };
  };

  /* 對外入口。msg: { goal:'done'|'full', ref:{craftsmanship,control,cp}, qGoal, hq, budgetMs, seedKeys }
   * makeStats(cs, ct, cp) → CrafterStats；回傳依「相對提升」由低到高排序的結果。
   *
   * 搜尋方式：寬裕程度從「剛好等於玩家目前（含最強食藥）的數值」開始，找不到就逐步放寬；
   * 一旦在某個寬裕程度找到做得到的手法，就代表最低需求就在這附近，再用剩下的時間在這個範圍裡把需求壓到最低。
   * 這樣不會被過度寬裕的數值帶偏。數值夠高就一定做得到，所以沒有固定上限，只是逐步放寬到很高為止。 */
  function frontierSearch(craft, makeStats, statsForActions, msg, actionsFromKeys) {
    var full = msg.goal === 'full';
    var ref = { cs: Math.max(1, msg.ref.craftsmanship), ct: Math.max(1, msg.ref.control), cp: Math.max(1, msg.ref.cp) };
    var MULTS = [1, 1.12, 1.3, 1.55, 1.9, 2.5, 3.5, 5, 8];
    var t0 = Date.now(), budget = msg.budgetMs, hardEnd = t0 + budget * 2;
    var seedKeys = (msg.seedKeysList || []).slice();
    if (msg.seedKeys) seedKeys.push(msg.seedKeys);
    var merged = [], found = false, usedMul = null, lastGa = null;
    var mkF = function (mul) {
      var gen = { cs: Math.ceil(ref.cs * mul), ct: Math.ceil(ref.ct * mul), cp: Math.ceil(ref.cp * mul + (mul > 1 ? 40 : 0)) };
      return { goal: msg.goal, full: full, ref: ref, qGoal: msg.qGoal || craft.quality, makeStats: makeStats, hq: msg.hq || [], safeMode: msg.safeMode !== false, gen: gen };
    };
    var runStage = function (mul, ms, seedList) {
      var F = mkF(mul);
      var seeds = seedList.map(actionsFromKeys).filter(function (x) { return x.length; });
      var ga = new FrontierGA(craft, statsForActions(F.gen), {
        populationSize: msg.populationSize || 150, generations: 100000, hqTarget: 1e9, hqIngredients: F.hq,
        safeMode: F.safeMode, seeds: seeds, deadline: Date.now() + ms,
      }, F);
      var bestRot = ga.run();
      ga.bestKeys = bestRot.map(function (a) { return a.constructor.name; });
      lastGa = ga;
      return ga;
    };
    // 第二階段（接力精修）會帶著第一階段找到的寬裕程度，不必從頭掃描
    if (msg.mulHint) MULTS = [msg.mulHint].concat(MULTS.filter(function (m) { return m > msg.mulHint; }));
    for (var i = 0; i < MULTS.length && Date.now() < hardEnd; i++) {
      var ga = runStage(MULTS[i], Math.min(budget * 0.22, Math.max(300, hardEnd - Date.now())), seedKeys);
      seedKeys = [ga.bestKeys].concat(seedKeys).slice(0, 3);
      if (ga.archive.length) {
        usedMul = MULTS[i]; found = true;
        merged = ga.archive.slice();
        // 在這個範圍裡把需求壓到最低：以目前找到的結果當種子，用剩下的時間繼續搜尋
        var seedList = merged.slice().sort(function (a, b) { return a.cost - b.cost; }).slice(0, 8).map(function (c) { return c.keys; }).concat((msg.seedKeysList || []).slice(0, 4));
        var ga2 = runStage(MULTS[i], Math.max(budget * 0.25, 600), seedList);
        ga2.archive.forEach(function (c) { merged.push(c); });
        /* 精修：遺傳演算法容易卡在「差一點」的局部最佳（實測同一配方、不同隨機種子，找到的最低需求可以差到 60%）。
         * 對目前最好的幾個結果各做一輪迭代局部搜尋（ILS：刪／換／插／對調技能再精修），需求算得很快，所以能試很多次。 */
        var le0 = function (a, b) { return a.cs <= b.cs && a.cp <= b.cp && (!full || a.ct <= b.ct); };
        var tops = ga2.archive.concat(merged).sort(function (a, b) { return a.cost - b.cost; }).filter(function (c, idx, arr) { return arr.findIndex(function (d) { return d.keys.join() === c.keys.join(); }) === idx; }).slice(0, 4);
        var ilsMs = Math.max(400, (t0 + budget * 1.1 - Date.now()) / Math.max(1, tops.length));
        ga2.config.deadline = 0;
        tops.forEach(function (c) {
          try {
            var better = ga2.ils(actionsFromKeys(c.keys), ilsMs);
            var n = ga2.needsOf(better, 10);
            if (n) { n.cost = ga2._costOf(n).cost; merged.push(n); }
          } catch (e) { /* 精修失敗不影響已找到的結果 */ }
        });
        break;
      }
    }
    var out = [];
    if (found && lastGa) {
      // 合併後再清一次「被別人全面壓過」的，最後以 5 為單位精確收斂
      var le = function (a, b) { return a.cs <= b.cs && a.cp <= b.cp && (!full || a.ct <= b.ct); };
      merged = merged.filter(function (c, i) { return !merged.some(function (e, j) { return j !== i && le(e, c) && (e.cs < c.cs || e.cp < c.cp || (full && e.ct < c.ct) || j < i); }); });
      merged.forEach(function (c) {
        var refined = lastGa.needsOf(actionsFromKeys(c.keys), 5) || c;
        var cc = lastGa._costOf(refined);
        out.push({ need: { craftsmanship: refined.cs, control: refined.ct, cp: refined.cp }, keys: refined.keys, steps: refined.steps, cost: cc.cost, rel: cc.rel });
      });
    }
    out.sort(function (a, b) { return a.cost - b.cost || a.rel - b.rel; });
    return { cands: out.slice(0, 12), genMul: usedMul, found: found };
  }

  global.CraftFrontier = { frontierSearch: frontierSearch };
})(typeof self !== 'undefined' ? self : this);
