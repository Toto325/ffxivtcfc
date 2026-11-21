/* craft-frontier.js — 「反推最低所需數值」搜尋
 *
 * 舊做法：猜一組數值 → 跑一次隨機求解看做不做得到 → 再猜。每次驗證都有隨機雜訊，而且要猜上百次，既慢又不準。
 * 新做法：反過來。模擬器是固定公式、完全確定的——給定一套手法，它「最少需要多少作業精度／加工精度／CP」
 *        可以用幾十次模擬（二分法）精確算出來，不需要任何隨機。所以讓遺傳演算法直接找「所需數值最低的手法」：
 *          ・CP：手法實際用掉多少 CP，就是最少需要多少（精確）
 *          ・作業精度：進度要做滿的最低值（二分）
 *          ・加工精度：品質要做滿的最低值（二分，只有「滿品質」目標才需要）
 *        得到的每個結果都是「這套手法 + 這組數值」確定做得到，不是估計。
 * 手法庫（data/craft-rotation-library.json，離線預先算好）的手法也走同一套精確反推：
 *   不論玩家數值是多少，庫裡的手法都能立刻算出「最少需要多少」，直接當候選、也當搜尋的起點種子。
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

  /* 同 bisectMin，但有「起點提示」：先在提示附近往外成倍擴張找出答案所在的區間，再二分。
   * 相鄰評估的手法需求通常很接近，所以比從整個範圍二分省不少模擬；答案跟 bisectMin 完全相同（一樣假設單調）。 */
  function bisectMinHint(ok, hi, step, hint) {
    var H = Math.ceil(hi / step);
    var t = Math.min(H, Math.max(1, Math.round((hint || 0) / step)));
    if (!hint || t >= H) return bisectMin(ok, hi, step);
    var lo, up, d = 1;
    if (ok(t * step)) { // 答案 ≤ t：往下擴張，直到找到不行的點
      up = t; lo = 0;
      for (;;) { var c = up - d; if (c <= 0) { lo = 0; break; } if (ok(c * step)) { up = c; d *= 2; } else { lo = c; break; } }
    } else { // 答案 > t：往上擴張，直到找到可行的點
      lo = t;
      for (;;) { var c2 = lo + d; if (c2 >= H) { if (!ok(H * step)) return null; up = H; break; } if (ok(c2 * step)) { up = c2; break; } lo = c2; d *= 2; }
    }
    while (lo < up) { var mid = (lo + up) >> 1; if (ok(mid * step)) up = mid; else lo = mid + 1; }
    return up * step;
  }

  /* 一套手法最少需要的數值（確定性）。c: { makeStats, hq, safeMode, full, qGoal, gen:{cs,ct,cp} }
   * 在寬裕數值 gen 下做不到（或沒達到品質目標）就回傳 null。 */
  function needsOfRotation(craft, rotation, c, step, withMax) {
    var g = c.gen;
    if (c.allowed) { for (var ai = 0; ai < rotation.length; ai++) if (!c.allowed.has(rotation[ai].constructor.name)) return null; } // 含玩家不能用的技能：一律不採用
    var run = function (actions, cs, ct, cp) {
      var sim = new simulator.Simulation(craft, actions, c.makeStats(cs, ct, cp), c.hq);
      var res = sim.run(true, undefined, c.safeMode);
      return { sim: sim, res: res };
    };
    var first = run(rotation, g.cs, g.ct, g.cp);
    if (!first.res.success) return null;
    var clean = rotation.filter(function (a, i) { var s = first.res.steps[i]; return s && !s.skipped && s.success; });
    var base = clean.length === rotation.length ? first : run(clean, g.cs, g.ct, g.cp); // 沒有被跳過的步驟就不必再模擬一次
    if (!base.res.success || (c.full && (base.sim.quality || 0) < c.qGoal)) return null;
    var cp = Math.max(0, Math.ceil(g.cp - base.sim.availableCP));
    if (!c.fast && cp > 1) {
      // 手法裡有「可有可無」的步驟時，CP 不夠模擬器會直接跳過它，所以「手法實際用掉的 CP」不一定等於「最低需要的 CP」。
      // 最後精修時用二分法精確找出最低值（搜尋階段為了速度仍用實際用量當估計）。
      var cpMin = bisectMin(function (v) { var r = run(clean, g.cs, g.ct, v); return r.res.success && (!c.full || (r.sim.quality || 0) >= c.qGoal); }, cp, 1);
      if (cpMin != null) cp = cpMin;
    }
    var hint = c.hint || null;
    var cs = bisectMinHint(function (v) { return run(clean, v, g.ct, cp).res.success; }, g.cs, step, hint && hint.cs);
    if (cs == null) return null;
    var ct = 0;
    if (c.full) {
      ct = bisectMinHint(function (v) { var r = run(clean, cs, v, cp); return r.res.success && (r.sim.quality || 0) >= c.qGoal; }, g.ct, step, hint && hint.ct);
      if (ct == null) return null;
    } else if (!run(clean, cs, 1, cp).res.success) {
      // 「能完成」也可能跟加工精度有關：有「最低品質」門檻的配方（例如專家配方），品質不夠就算失敗。這時要精確算出所需的加工精度
      ct = bisectMinHint(function (v) { return run(clean, cs, v, cp).res.success; }, g.ct, step, hint && hint.ct);
      if (ct == null) return null;
    }
    if (!c.fast) { // 搜尋階段（只用來引導方向，之後還會以 5 為單位精確收斂並驗證）省略最後這次三項一起的驗證
      var chk = run(clean, cs, ct > 0 ? ct : g.ct, cp); // 三項一起再驗一次
      if (!chk.res.success || (c.full && (chk.sim.quality || 0) < c.qGoal)) return null;
    }
    /* 作業精度「太高」也會讓手法失效：進度提早做完，後面的品質技能被截斷。所以一套手法能用的作業精度是一個區間 [最低, 最高]，
     * 不是「越高越好」。這裡一併算出最高能承受多少（只在需要時算：每次多約 12 次模擬）。 */
    var csMax = Infinity;
    if (withMax) {
      var hiLim = Math.max(g.cs, cs * 4);
      var ctAt = ct > 0 ? ct : g.ct; // 作業上限要在「這套手法自己的最低加工」下算：用寬裕的加工會讓被截斷的殘缺版本也湊出滿品質，上限就被高估成無限
      var okCs = function (v) { var r = run(clean, v, ctAt, cp); return r.res.success && (!c.full || (r.sim.quality || 0) >= c.qGoal); };
      if (!okCs(hiLim)) {
        var lo = Math.ceil(cs / step), hi = Math.ceil(hiLim / step); // lo 可行、hi 不可行
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (okCs(mid * step)) lo = mid; else hi = mid; }
        csMax = lo * step;
      }
    }
    return { cs: cs, ct: ct, cp: cp, csMax: csMax, steps: clean.length, keys: clean.map(function (a) { return a.constructor.name; }) };
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
  FrontierGA.prototype.needsOf = function (rotation, step, withMax) { return needsOfRotation(this.recipe, rotation, this.F, step, withMax); };

  /* 成本：各項「需要提升的比例」（相對於參考數值）平方和開根號。只用來引導搜尋方向，最終怎麼排序由呼叫端決定。 */
  FrontierGA.prototype._costOf = function (n) {
    var r = this.F.ref;
    var a = Math.max(0, n.cs - r.cs) / r.cs, b = Math.max(0, n.cp - r.cp) / r.cp;
    var sq = a * a + b * b;
    var rel = n.cs / r.cs + n.cp / r.cp;
    if (this.F.full || n.ct > 0) { var c = Math.max(0, n.ct - r.ct) / r.ct; sq += c * c; rel += n.ct / r.ct; }
    return { cost: Math.sqrt(sq), rel: rel };
  };

  FrontierGA.prototype._archiveAdd = function (n) {
    var A = this.archive, full = this.F.full;
    var le = function (a, b) { return a.cs <= b.cs && a.cp <= b.cp && a.ct <= b.ct; };
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
      F.fast = true; F.hint = this._hint || null; // 搜尋階段：只用來引導方向，省略最後的重複驗證，並以前一套手法的需求當二分起點
      var n = this.needsOf(rotation, 10);
      F.fast = false;
      if (n) this._hint = { cs: n.cs, ct: n.ct };
      if (!n) { score = 900; } else {
        var c = this._costOf(n);
        n.cost = c.cost;
        this._archiveAdd(n);
        score = 1000 - 100 * c.cost - 2 * c.rel - 0.02 * n.steps;
      }
    }
    return { score: score, success: !!r.res.success, hqPercent: 0, quality: q, result: r.res };
  };

  /* 對外入口。msg: { goal:'done'|'full', ref:{craftsmanship,control,cp}, qGoal, hq, budgetMs, seedKeys, seedKeysList, libKeys, mulHint }
   * makeStats(cs, ct, cp) → CrafterStats；回傳依「相對提升」由低到高排序的結果。
   *
   * 搜尋方式：寬裕程度從「剛好等於參考數值」開始，找不到就逐步放寬；
   * 一旦在某個寬裕程度找到做得到的手法，就代表最低需求就在這附近，再用剩下的時間在這個範圍裡把需求壓到最低。
   * 數值夠高就一定做得到，所以沒有固定上限，只是逐步放寬到很高為止。
   * 手法庫的手法會先精確反推需求當候選，並當作搜尋的起點種子（庫沒有的情況照常搜尋）。 */
  function frontierSearch(craft, makeStats, statsForActions, msg, actionsFromKeys) {
    var full = msg.goal === 'full';
    var ref = { cs: Math.max(1, msg.ref.craftsmanship), ct: Math.max(1, msg.ref.control), cp: Math.max(1, msg.ref.cp) };
    var MULTS = [1, 1.12, 1.3, 1.55, 1.9, 2.5, 3.5, 5, 8];
    var t0 = CraftClock.now(), budget = msg.budgetMs, hardEnd = t0 + budget * (msg.quick ? 1.4 : 2);
    var seedKeys = (msg.seedKeysList || []).slice();
    if (msg.seedKeys) seedKeys.push(msg.seedKeys);
    var merged = [], found = false, usedMul = null, lastF = null, lastGa = null;
    var baseCtx = { makeStats: makeStats, hq: msg.hq || [], safeMode: msg.safeMode !== false, full: full, qGoal: msg.qGoal || craft.quality, allowed: msg.allowed || null };
    var costOf = function (n) {
      var a = Math.max(0, n.cs - ref.cs) / ref.cs, b = Math.max(0, n.cp - ref.cp) / ref.cp, sq = a * a + b * b, rel = n.cs / ref.cs + n.cp / ref.cp;
      if (full || n.ct > 0) { var c = Math.max(0, n.ct - ref.ct) / ref.ct; sq += c * c; rel += n.ct / ref.ct; }
      return { cost: Math.sqrt(sq), rel: rel };
    };
    // 手法庫：不論玩家數值多少，都能精確反推每套手法最少需要多少
    var libCands = [];
    /* 庫的手法只在「自己的作業範圍」內有效：作業太高進度會提早做完，後面的步驟不會執行，手法被截成殘缺版本。
     * 所以不能一律用超大的寬裕數值評估，而是由低往高找出第一個「整套手法都能完整執行且達到目標」的作業值，
     * 再以它當寬裕數值精確反推需求（這時需求、作業上限都是這套手法真正的值）。 */
    var libGenFor = function (rot) {
      var ctB = Math.max(Math.ceil(ref.ct * 10), 30000), cpB = Math.max(Math.ceil(ref.cp * 10 + 600), 3000);
      var okAt = function (cs) {
        var sim = new simulator.Simulation(craft, rot, makeStats(cs, ctB, cpB), baseCtx.hq);
        var res = sim.run(true, undefined, baseCtx.safeMode);
        if (!res.success || (full && (sim.quality || 0) < baseCtx.qGoal)) return false;
        var ran = 0; for (var i = 0; i < res.steps.length; i++) { var st = res.steps[i]; if (st && !st.skipped && st.success) ran++; }
        return ran === rot.length; // 整套手法都有執行（沒有被提早做完截斷）
      };
      for (var cs = Math.max(300, Math.floor(ref.cs * 0.3)); cs <= 40000; cs = Math.ceil(cs * 1.04)) if (okAt(cs)) return { cs: cs, ct: ctB, cp: cpB };
      return null;
    };
    (msg.libKeys || []).forEach(function (keys) {
      try {
        var rot = actionsFromKeys(keys), gen = libGenFor(rot);
        if (!gen) return;
        var n = needsOfRotation(craft, rot, Object.assign({ gen: gen }, baseCtx), 5, true);
        if (n) { var cc = costOf(n); n.cost = cc.cost; n.fromLib = true; libCands.push(n); }
      } catch (e) { /* 這套手法在目前條件下不能用就略過 */ }
    });
    libCands.sort(function (a, b) { return a.cost - b.cost; });
    if (msg.libOnly) { // 只用手法庫：不搜尋，馬上回傳（用來讓第一批答案幾乎零等待）
      var le0 = function (a, b) { return a.cs <= b.cs && a.cp <= b.cp && a.ct <= b.ct; };
      var pruned = libCands.filter(function (c, i) { return !libCands.some(function (e, j) { return j !== i && le0(e, c) && (e.cs < c.cs || e.cp < c.cp || e.ct < c.ct || j < i); }); });
      return { cands: pruned.slice(0, 16).map(function (c) { return { need: { craftsmanship: c.cs, control: c.ct, cp: c.cp, csMax: c.csMax }, keys: c.keys, steps: c.steps, cost: c.cost, rel: 0, fromLib: true }; }), genMul: null, found: pruned.length > 0 };
    }
    var libSeeds = libCands.slice(0, 6).map(function (c) { return c.keys; });
    seedKeys = libSeeds.concat(seedKeys);
    var mkF = function (mul) {
      var gen = { cs: Math.ceil(ref.cs * mul), ct: Math.ceil(ref.ct * mul), cp: Math.ceil(ref.cp * mul + (mul > 1 ? 40 : 0)) };
      return Object.assign({ goal: msg.goal, ref: ref, gen: gen }, baseCtx);
    };
    var runStage = function (mul, ms, seedList) {
      var F = mkF(mul);
      var seeds = seedList.map(actionsFromKeys).filter(function (x) { return x.length; });
      var ga = new FrontierGA(craft, statsForActions(F.gen), {
        populationSize: msg.populationSize || 150, generations: 100000, hqTarget: 1e9, hqIngredients: F.hq,
        safeMode: F.safeMode, seeds: seeds, deadline: CraftClock.now() + ms,
      }, F);
      var bestRot = ga.run();
      ga.bestKeys = bestRot.map(function (a) { return a.constructor.name; });
      lastGa = ga; lastF = F;
      return ga;
    };
    // 第二階段（接力精修）會帶著第一階段找到的寬裕程度，不必從頭掃描
    if (msg.mulHint) MULTS = [msg.mulHint].concat(MULTS.filter(function (m) { return m > msg.mulHint; }));
    for (var i = 0; i < MULTS.length && CraftClock.now() < hardEnd; i++) {
      var ga = runStage(MULTS[i], Math.min(budget * 0.22, Math.max(msg.quick ? 200 : 300, hardEnd - CraftClock.now())), seedKeys);
      seedKeys = [ga.bestKeys].concat(seedKeys).slice(0, 8);
      if (ga.archive.length) {
        usedMul = MULTS[i]; found = true;
        merged = ga.archive.slice();
        var seedList = merged.concat(libCands).sort(function (a, b) { return a.cost - b.cost; }).slice(0, 8).map(function (c) { return c.keys; }).concat((msg.seedKeysList || []).slice(0, 4));
        var ga2 = runStage(MULTS[i], Math.max(budget * (msg.quick ? 0.2 : 0.25), msg.quick ? 250 : 600), seedList);
        ga2.archive.forEach(function (c) { merged.push(c); });
        /* 精修：遺傳演算法容易卡在「差一點」的局部最佳（實測同一配方、不同隨機種子，找到的最低需求可以差到 60%）。
         * 對目前最好的幾個結果各做一輪迭代局部搜尋（ILS：刪／換／插／對調技能再精修），需求算得很快，所以能試很多次。 */
        var tops = ga2.archive.concat(merged).concat(libCands).sort(function (a, b) { return a.cost - b.cost; }).filter(function (c, idx, arr) { return arr.findIndex(function (d) { return d.keys.join() === c.keys.join(); }) === idx; }).slice(0, msg.quick ? 2 : 4);
        var ilsMs = Math.max(msg.quick ? 250 : 400, (t0 + budget * 1.1 - CraftClock.now()) / Math.max(1, tops.length));
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
    /* 集束搜尋（js/craft-exact.js）當額外候選：放在遺傳演算法「全部做完之後」才跑，所以完全不會影響原本流程找到的任何結果
     * （先前放在前面會改變遺傳演算法的種子，實測反而略差）。在 GA 已經找到可行的寬裕數值下，用集束搜尋找一套手法，
     * 以同一個「精確反推需求」算出它最少需要多少，只是多一個候選進最後「互不被壓過」的篩選。只對「滿品質」目標有意義。 */
    if (full && msg.beamFn && found && usedMul) {
      try {
        var genB = { cs: Math.ceil(ref.cs * usedMul), ct: Math.ceil(ref.ct * usedMul), cp: Math.ceil(ref.cp * usedMul + (usedMul > 1 ? 40 : 0)) };
        var keysB = msg.beamFn(genB, msg.beamExpand || 3e6);
        if (keysB && keysB.length) {
          var nB = needsOfRotation(craft, actionsFromKeys(keysB), Object.assign({ gen: { cs: Math.max(Math.ceil(ref.cs * 10), 30000), ct: Math.max(Math.ceil(ref.ct * 10), 30000), cp: Math.max(Math.ceil(ref.cp * 10 + 600), 3000) } }, baseCtx), 5, true);
          if (nB) { var cB = costOf(nB); nB.cost = cB.cost; nB.fromLib = true; merged.push(nB); }
        }
      } catch (e) { /* 集束搜尋失敗不影響已找到的結果 */ }
    }
    var out = [];
    var pool = merged.concat(libCands);
    if (pool.length) {
      found = true;
      var le = function (a, b) { return a.cs <= b.cs && a.cp <= b.cp && a.ct <= b.ct; };
      pool = pool.filter(function (c, i) { return !pool.some(function (e, j) { return j !== i && le(e, c) && (e.cs < c.cs || e.cp < c.cp || e.ct < c.ct || j < i); }); });
      pool.forEach(function (c) {
        var refined = c.fromLib || !lastGa ? c : (lastGa.needsOf(actionsFromKeys(c.keys), 5, true) || c); // 最後以 5 為單位精確收斂
        var cc = costOf(refined);
        out.push({ need: { craftsmanship: refined.cs, control: refined.ct, cp: refined.cp, csMax: refined.csMax }, keys: refined.keys, steps: refined.steps, cost: cc.cost, rel: cc.rel, fromLib: !!c.fromLib });
      });
    }
    out.sort(function (a, b) { return a.cost - b.cost || a.rel - b.rel; });
    return { cands: out.slice(0, 16), genMul: usedMul, found: found };
  }

  global.CraftFrontier = { frontierSearch: frontierSearch, needsOfRotation: needsOfRotation };
})(typeof self !== 'undefined' ? self : this);
