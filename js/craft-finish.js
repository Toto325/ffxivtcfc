/* craft-finish.js — 「完成即可」目標的精確搜尋（只看進度，品質完全不參與）
 *
 * 為什麼可以精確：進度只跟「作業精度、耐久、CP、幾個增益的剩餘回合」有關，品質、集中層數、連擊都不影響，
 * 所以相同這些資源狀態的節點，只需要留下「進度最高、CP 剩最多」不被壓過的那些（支配剔除），不必設寬度上限。
 * 逐層（每層多做一個技能）展開，直到找到「完成所需 CP 最少」的手法。結果是確定的，同樣輸入每次相同。
 *
 *   CraftFinish.minCP(ctx, { maxStates, maxSteps }) → { cp, keys(技能 id 序列), steps, expanded } 或 null（怎麼做都做不完）
 *   ctx＝CraftSimFast.makeCtx(...) 的結果；ctx.CP 會被當成 CP 上限（要算「最低需求」就給一個很大的值）
 *
 * 只收「影響進度／耐久／CP」的技能；純品質技能（各種加工、拜佔庭、稱讚…）不可能讓完成更省，所以不展開。
 * 專家配方有最低品質門檻（ctx.reqQ），這個搜尋不處理，呼叫端要自己判斷（有門檻就不要用）。
 */
(function (g) {
  'use strict';
  var NAMES = ['BasicSynthesis', 'CarefulSynthesis', 'PrudentSynthesis', 'Groundwork', 'MuscleMemory', 'IntensiveSynthesis', 'DelicateSynthesis',
    'Veneration', 'WasteNot', 'WasteNotII', 'MastersMend', 'Manipulation', 'ImmaculateMend', 'FinalAppraisal', 'HeartAndSoul', 'TricksOfTheTrade', 'TrainedPerfection'];

  function minCP(ctx, o) {
    o = o || {};
    var S = g.CraftSimFast; // 載入順序不固定，用到才取
    var F = S.F, NF = S.NF, maxStates = o.maxStates || 3e6, maxSteps = o.maxSteps || 30, deadline = o.deadline || 0, timedOut = false;
    var ids = [];
    for (var i = 0; i < S.NA; i++) if (ctx.usable[i] && NAMES.indexOf(S.ACTIONS[i].name) >= 0) ids.push(i);
    var init = S.initState(ctx);
    var nodes = [{ s: init, parent: -1, id: -1 }];            // 路徑重建用
    var memo = new Map();                                       // 資源狀態 → 目前不被壓過的 [進度, CP剩餘]
    var layer = [0], best = null, expanded = 0;
    var keyOf = function (t) { return t[F.DUR] + ',' + t[F.WN] + ',' + t[F.MANIP] + ',' + t[F.VEN] + ',' + t[F.MM] + ',' + t[F.FA] + ',' + t[F.HS] + ',' + t[F.TP] + ',' + t[F.FLAGS]; };
    var t = new Int32Array(NF);
    for (var depth = 0; depth < maxSteps && layer.length; depth++) {
      var next = [];
      for (var li = 0; li < layer.length; li++) {
        var node = nodes[layer[li]], s = node.s;
        for (var ai = 0; ai < ids.length; ai++) {
          var id = ids[ai];
          if (!S.canUse(ctx, s, id)) continue;
          t.set(s);
          var flag = S.step(ctx, t, id);
          expanded++;
          if (deadline && (expanded & 4095) === 0 && Date.now() > deadline) { timedOut = true; return null; } // 超時：不給不完整的答案，呼叫端當作「這個點算不出來」
          var used = ctx.CP - t[F.CP];
          if (flag === 1) { // 做完了
            if (!best || used < best.cp || (used === best.cp && depth + 1 < best.steps)) best = { cp: used, steps: depth + 1, nodeIdx: layer[li], id: id };
            continue;
          }
          if (flag !== 0) continue;
          if (best && used >= best.cp) continue;               // CP 用得比已知最好的還多：不可能更好
          var key = keyOf(t), list = memo.get(key), dominated = false;
          if (list) {
            for (var m = 0; m < list.length; m++) if (list[m][0] >= t[F.PROG] && list[m][1] >= t[F.CP]) { dominated = true; break; }
            if (dominated) continue;
            var keep = [];
            for (var m2 = 0; m2 < list.length; m2++) if (!(t[F.PROG] >= list[m2][0] && t[F.CP] >= list[m2][1])) keep.push(list[m2]);
            keep.push([t[F.PROG], t[F.CP]]); memo.set(key, keep);
          } else memo.set(key, [[t[F.PROG], t[F.CP]]]);
          nodes.push({ s: new Int32Array(t), parent: layer[li], id: id }); next.push(nodes.length - 1);
        }
        if (nodes.length > maxStates) return best ? build(best, nodes, expanded) : null;
      }
      layer = next;
    }
    return best ? build(best, nodes, expanded) : null;
  }

  function build(best, nodes, expanded) {
    var keys = [best.id], i = best.nodeIdx;
    while (i > 0) { keys.push(nodes[i].id); i = nodes[i].parent; }
    keys.reverse();
    return { cp: best.cp, keys: keys, steps: best.steps, expanded: expanded };
  }

  /* 「作業精度 ↔ 最低 CP」的取捨曲線（只留不被壓過的點）：
   *   先用二分法找出「CP 不設限也做得完」的最低作業，再從那裡往上，每個作業精度各算一次精確最低 CP，直到 CP 不再下降。
   *   ctxFor(cs)＝回傳該作業精度（CP 當無限）的模擬 ctx；o.start＝玩家目前（含食藥）的作業，一定會算一個點。
   *   回傳 [{ cs, cp, keys(技能 id 序列), steps }]，cs 由小到大、cp 嚴格遞減。 */
  function front(ctxFor, o) {
    o = o || {};
    var STEP = 5, up = function (v) { return Math.ceil(v / STEP) * STEP; };
    var deadline = Date.now() + (o.budgetMs || 12000);
    var solveAt = function (cs) { return Date.now() > deadline ? null : minCP(ctxFor(cs), { maxStates: o.maxStates || 1e6, deadline: deadline }); };
    var start = up(Math.max(o.start || 0, 600)), out = [], lastOk = null, firstBad = null;
    // 從高往低試：作業高的點很快就算完；碰到第一個「做不到」就停（做不到的點最花時間，只算一次），再用二分把邊界收窄
    var ks = [1.6, 1.35, 1.2, 1.1, 1.0, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36];
    for (var i = 0; i < ks.length; i++) {
      var c = up(start * ks[i]), r = solveAt(c);
      if (r) { out.push({ cs: c, cp: r.cp, keys: r.keys, steps: r.steps }); lastOk = c; } else { firstBad = c; break; }
    }
    if (lastOk != null && firstBad != null) {
      var lo = firstBad, hi = lastOk;
      for (var it = 0; it < 4 && hi - lo > STEP; it++) { var mid = up((lo + hi) / 2); if (mid >= hi) break; var rm = solveAt(mid); if (rm) { hi = mid; out.push({ cs: mid, cp: rm.cp, keys: rm.keys, steps: rm.steps }); } else lo = mid; }
    }
    out.sort(function (a, b) { return a.cs - b.cs; });
    var res = out.filter(function (x, i) { return i === 0 || x.cp < out[i - 1].cp; });
    res.complete = Date.now() <= deadline; // false＝時間不夠（慢裝置），低作業那一端可能沒算到；呼叫端應該再補跑原本的搜尋
    return res;
  }

  g.CraftFinish = { minCP: minCP, front: front };
})(typeof self !== 'undefined' ? self : this);
