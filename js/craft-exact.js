/* craft-exact.js — 以精簡模擬器為底的「分層集束搜尋」求解引擎
 *
 * 跟遺傳演算法（craft-solver-ga.js）的根本差別：
 *   GA 是「隨機突變手法、看分數」，容易卡在局部最佳，而且同樣的條件多給一點數值，結果還可能變差（因為隨機的運氣）。
 *   這裡是「一步一步系統性地展開所有可能的下一步」：
 *     ・第 N 層＝已經做了 N 步的所有狀態。相同的「資源／buff 狀態」（耐久、CP、各 buff 剩餘回合、Inner Quiet、combo…）只保留
 *       進度與品質互不被壓過的組合（Pareto），所以不會重複展開等價的狀態。
 *     ・每一層只保留評價最高的 beam 個狀態（評價把 CP、耐久、進度、buff 都換算成「品質等值」；用幾組不同的換算權重各跑一次，取最好）。
 *     ・進度達標的狀態就是候選答案；品質已經達到上限時，最早出現的就是最短的手法，搜尋立刻結束。
 *   「現有最佳手法」可以當保護種子：它走過的每個狀態都強制留在搜尋裡，所以搜尋的結果一定不會比它差。
 *
 * 輸出的任何手法，採用前都會用 vendor 模擬器重算（由呼叫端負責），所以這裡不需要「保證正確」，只需要「盡量找到好的」。
 * 依賴：craft-sim-fast.js（CraftSimFast）。 */
(function (g) {
  'use strict';
  var S = g.CraftSimFast, F = S.F, NF = S.NF, NA = S.NA;

  /* 評價權重：把各種資源換算成「品質等值」。下面的係數是依這個配方、這組數值實際算出來的（不是固定常數）。 */
  function makeWeights(ctx, v) {
    v = v || {};
    var tmp = new Int32Array(NF); tmp[F.IQ] = 8; tmp[F.INNO] = 2;
    var q100 = S.qualInc(ctx, 100, tmp); // 一個 100% 威力的觸工在 IQ8＋Innovation 下的品質
    var vCP = Math.max(0.01, q100 / 25) * (v.cp || 1);       // 每點 CP 大約能換多少品質（以 Prudent Touch 25CP 估）
    var vDur = vCP * 2.2 * (v.dur || 1);                      // 每點耐久（用 Manipulation 96CP 修 40 點估）
    var tp = new Int32Array(NF); tp[F.VEN] = 2;
    var inc = Math.max(1, S.progInc(ctx, 360, tp));        // Groundwork＋Veneration 的進度
    var progUnit = (18 + 20 * 2.2) * vCP / inc * (v.prog || 1); // 每點進度大約要多少「品質等值」才能做出來
    var touchQ = ctx.bq * 1.6;
    return { vCP: vCP, vDur: vDur, progUnit: progUnit, touchQ: touchQ, buff: v.buff == null ? 1 : v.buff, iqW: v.iq == null ? 1 : v.iq, Qcap: ctx.QCAP };
  }

  function heur(ctx, W, s) {
    var P = ctx.P, prog = s[F.PROG] < P ? s[F.PROG] : P;
    var q = s[F.QUAL] < W.Qcap ? s[F.QUAL] : W.Qcap;
    var iq = s[F.IQ];
    var h = q + prog * W.progUnit + s[F.DUR] * W.vDur + s[F.CP] * W.vCP * (0.6 + 0.4 * (iq / 10) * W.iqW);
    var b = W.buff;
    h += b * (s[F.INNO] * 0.5 * W.touchQ * 0.55 + s[F.GS] * 1.0 * W.touchQ * 0.4 + s[F.VEN] * 0.5 * W.progUnit * ctx.bp * 0.9 +
      s[F.MANIP] * 5 * W.vDur * 0.8 + s[F.WN] * 6 * W.vDur * 0.5 + s[F.MM] * W.progUnit * ctx.bp * 1.2 + (s[F.TP] ? 20 * W.vDur : 0));
    h += iq * W.touchQ * 0.12 * W.iqW;
    return h;
  }


  /* 「收尾能力」：從某個資源狀態出發，只用進度類／輔助類技能（不做品質）最多還能再做多少進度。
   * 這是精確的動態規劃（記憶化），而且是「還能不能做完」的必要條件：品質技能只會消耗 CP／耐久，不會幫進度，
   * 所以 進度 + 收尾能力 < 目標 的狀態一定做不完，可以直接丟掉（不是估計）。 */
  var FIN_ACTIONS = [0, 1, 2, 3, 6, 25, 21, 22, 19, 18, 20, 31]; // Basic Careful Prudent Groundwork Delicate Veneration WN WN2 Manipulation MastersMend ImmaculateMend TrainedPerfection
  function makeFinisher(ctx) {
    var memo = new Map(), P = ctx.P;
    var pool = []; for (var d = 0; d < 80; d++) pool.push(new Int32Array(NF));
    function keyOf(s) {
      // dur(≤255) cp(≤4095) ven(≤7) mm(≤7) wn(≤15) manip(≤15) tp(1) flags-bit2(1)
      return ((((((s[F.DUR] * 4096 + s[F.CP]) * 8 + s[F.VEN]) * 8 + s[F.MM]) * 16 + s[F.WN]) * 16 + s[F.MANIP]) * 2 + s[F.TP]) * 2 + ((s[F.FLAGS] >> 2) & 1);
    }
    function rec(s, depth) {
      var k = keyOf(s), m = memo.get(k);
      if (m !== undefined) return m;
      var best = 0, t = pool[depth];
      for (var i = 0; i < FIN_ACTIONS.length; i++) {
        var id = FIN_ACTIONS[i];
        if (!S.canUse(ctx, s, id)) continue;
        if (depth >= 79) continue;
        for (var j = 0; j < NF; j++) t[j] = s[j];
        var p0 = t[F.PROG];
        var f = S.step(ctx, t, id);
        if (f === 2) continue;
        var gain = t[F.PROG] - p0;
        if (f === 1) { if (gain > best) best = gain; continue; }
        // 先清掉「還在進行中的狀態」跟品質無關的欄位，讓記憶化更容易命中
        t[F.QUAL] = 0; t[F.IQ] = 0; t[F.GS] = 0; t[F.INNO] = 0; t[F.COMBO] = 0; t[F.HS] = 0; t[F.PROG] = 0; t[F.STEPS] = 0;
        var v = gain + rec(t, depth + 1);
        if (v > best) best = v;
      }
      if (best > P) best = P;
      memo.set(k, best);
      return best;
    }
    var probe = new Int32Array(NF);
    return {
      /* 這個狀態（進行中）收尾最多還能做多少進度 */
      maxGain: function (s) {
        for (var j = 0; j < NF; j++) probe[j] = s[j];
        probe[F.QUAL] = 0; probe[F.IQ] = 0; probe[F.GS] = 0; probe[F.INNO] = 0; probe[F.COMBO] = 0; probe[F.HS] = 0; probe[F.PROG] = 0; probe[F.STEPS] = 0;
        return rec(probe, 0);
      },
      size: function () { return memo.size; },
    };
  }

  /* 把「決定未來可能性」的欄位（排除進度、品質、步數）壓成兩個 32 位元整數當 key：
   *  k1＝耐久(8) CP(12) IQ(4) 節約(4) Manipulation(4)；k2＝GS(2) Innovation(3) Veneration(3) MuscleMemory(3) FinalAppraisal(3) HS(1) TP(1) combo(2) 旗標(5)
   * 欄位的值域在 beamSearch 開頭檢查（耐久 ≤ 255、CP ≤ 4095），超出就不使用本引擎。 */
  function pack1(s) { return s[F.DUR] | (s[F.CP] << 8) | (s[F.IQ] << 20) | (s[F.WN] << 24) | (s[F.MANIP] << 28); }
  function pack2(s) { return s[F.GS] | (s[F.INNO] << 2) | (s[F.VEN] << 5) | (s[F.MM] << 8) | (s[F.FA] << 11) | (s[F.HS] << 14) | (s[F.TP] << 15) | (s[F.COMBO] << 16) | (s[F.FLAGS] << 18); }
  function mixHash(k1, k2) { var h = Math.imul(k1 ^ (k1 >>> 15), 0x2c1b3c6d) ^ Math.imul(k2 ^ (k2 >>> 13), 0x297a2d39); return h ^ (h >>> 16); }

  function quickselectThreshold(arr, n, k) { // 回傳第 k 大的值（0 起算），不改動原陣列
    var a = Float64Array.prototype.slice.call(arr, 0, n), lo = 0, hi = n - 1;
    while (lo < hi) {
      var pivot = a[(lo + hi) >> 1], i = lo, j = hi;
      while (i <= j) { while (a[i] > pivot) i++; while (a[j] < pivot) j--; if (i <= j) { var t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; } }
      if (k <= j) hi = j; else if (k >= i) lo = i; else break;
    }
    return a[k];
  }

  /* 單一權重的集束搜尋。
   * o：{ beam, maxSteps, variant, seeds:[[技能id...]], maxExpand, realDeadline(ms epoch), incumbentQ（已知最好的品質，供提前結束判斷） }
   * 回傳 { ids:[...], quality, steps, success, expanded } 或 null（沒找到能完成的） */
  function beamSearch(ctx, o) {
    o = o || {};
    if (ctx.D > 255 || ctx.CP > 4095) return { ids: null, expanded: 0, unsupported: true }; // key 的欄位寬度放不下：不使用本引擎
    var beam = o.beam || 20000, maxSteps = o.maxSteps || 60, W = makeWeights(ctx, o.variant);
    var Qcap = ctx.QCAP, expanded = 0, maxExpand = o.maxExpand || 1e9, realDeadline = o.realDeadline || 0;
    var cur = new Int32Array(beam * NF), curN = 1;
    cur.set(o.startState || S.initState(ctx), 0); // startState：接續求解時，玩家手動選好的前綴走完之後的狀態
    var parents = [null], acts = [null]; // 每一層「第 i 個節點」的父節點編號與動作
    // 保護種子：預先模擬每個種子，記錄每一層的狀態
    var seedStates = [];
    (o.seeds || []).forEach(function (ids) {
      var s = S.initState(ctx), path = [S.initState(ctx)], ok = true;
      for (var i = 0; i < ids.length && ok; i++) {
        if (!S.canUse(ctx, s, ids[i])) { ok = false; break; }
        var f = S.step(ctx, s, ids[i]);
        if (f) break; // 完成或失敗：種子到此為止（完成的由下面的候選機制處理，這裡只保護「進行中」的狀態）
        path.push(Int32Array.from(s));
      }
      if (path.length > 1) seedStates.push(path);
    });
    var fin = o.useFinisher ? makeFinisher(ctx) : null, pruned = 0;
    var best = null; // { qcap, steps, layer, idx, id }
    var tmp = new Int32Array(NF), t2 = new Int32Array(NF), uids = new Int8Array(NA);
    var nxt = new Int32Array(Math.max(1024, beam * NF)), nxtCap = (nxt.length / NF) | 0;
    var nParent = new Int32Array(nxtCap), nAct = new Uint8Array(nxtCap), nProt = new Uint8Array(nxtCap), nChain = new Int32Array(nxtCap), nK1 = new Int32Array(nxtCap), nK2 = new Int32Array(nxtCap);
    var tabBits = 16, tab = new Int32Array(1 << tabBits), mask = (1 << tabBits) - 1;
    var hbuf = new Float64Array(nxtCap);
    var timedOut = false;

    function reconstruct(layer, idx, lastId) {
      var out = [lastId];
      for (var L = layer; L > 0; L--) { out.push(acts[L][idx]); idx = parents[L][idx]; }
      return out.reverse();
    }
    function growNxt() {
      var nc = nxtCap * 2;
      var a = new Int32Array(nc * NF); a.set(nxt); nxt = a;
      var b = new Int32Array(nc); b.set(nParent); nParent = b;
      var c = new Uint8Array(nc); c.set(nAct); nAct = c;
      var d = new Uint8Array(nc); d.set(nProt); nProt = d;
      var e = new Int32Array(nc); e.set(nChain); nChain = e;
      var k1a = new Int32Array(nc); k1a.set(nK1); nK1 = k1a; var k2a = new Int32Array(nc); k2a.set(nK2); nK2 = k2a;
      hbuf = new Float64Array(nc);
      nxtCap = nc;
    }
    function resizeTab(need) {
      var bits = 12; while ((1 << bits) < need * 2) bits++;
      if (bits !== tabBits) { tabBits = bits; tab = new Int32Array(1 << bits); mask = (1 << bits) - 1; }
      tab.fill(-1);
    }

    for (var layer = 0; layer < maxSteps; layer++) {
      resizeTab(Math.min(curN * 8, 1 << 21));
      var nN = 0;
      var protAt = layer + 1;
      // 插入一個節點（做 Pareto 去重）；回傳是否被收下
      var insert = function (s, parent, id, prot) {
        var k1 = pack1(s), k2 = pack2(s), slot = mixHash(k1, k2) & mask, e = tab[slot];
        while (e !== -1) {
          if (nK1[e] === k1 && nK2[e] === k2) {
            var bo = e * NF, ep = nxt[bo + F.PROG], eq = nxt[bo + F.QUAL];
            if (ep >= s[F.PROG] && eq >= s[F.QUAL]) { if (prot) nProt[e] = 1; return false; } // 被壓過
            if (s[F.PROG] >= ep && s[F.QUAL] >= eq) { // 壓過舊的：直接取代它的位置
              for (var k = 0; k < NF; k++) nxt[bo + k] = s[k];
              nParent[e] = parent; nAct[e] = id; if (prot) nProt[e] = 1;
              return true;
            }
          }
          e = nChain[e];
        }
        if (nN >= nxtCap) growNxt();
        var o2 = nN * NF; for (var k2i = 0; k2i < NF; k2i++) nxt[o2 + k2i] = s[k2i];
        nParent[nN] = parent; nAct[nN] = id; nProt[nN] = prot ? 1 : 0; nK1[nN] = k1; nK2[nN] = k2;
        nChain[nN] = tab[slot]; tab[slot] = nN; nN++;
        return true;
      };

      for (var i = 0; i < curN; i++) {
        var bo2 = i * NF;
        for (var k = 0; k < NF; k++) tmp[k] = cur[bo2 + k];
        var nu = S.usableIds(ctx, tmp, uids);
        for (var ui = 0; ui < nu; ui++) {
          var id = uids[ui];
          t2.set(tmp);
          var flag = S.step(ctx, t2, id);
          expanded++;
          if (flag === 1) {
            // 專家配方有「最低品質門檻」：達到門檻的候選一定優先；都達不到（數值不足）時，退而求其次保留「品質最高」的，
            // 讓玩家至少得到一套能做完、品質盡量高的手法（跟 GA 的行為一致），而不是什麼都沒有。
            var met = !ctx.reqQ || t2[F.QUAL] >= ctx.reqQ;
            var qc = t2[F.QUAL] < Qcap ? t2[F.QUAL] : Qcap;
            if (!best || (met && !best.met) || (met === best.met && (qc > best.qcap || (qc === best.qcap && layer + 1 < best.steps)))) best = { met: met, qcap: qc, steps: layer + 1, layer: layer, idx: i, id: id, q: t2[F.QUAL] };
          } else if (flag === 0) {
            if (fin && t2[F.PROG] + fin.maxGain(t2) < ctx.P) { pruned++; continue; } // 一定做不完：丟掉
            insert(t2, i, id, false);
          }
        }
        if ((i & 255) === 0 && realDeadline && Date.now() > realDeadline) { timedOut = true; break; }
      }
      if (timedOut || expanded >= maxExpand) { timedOut = timedOut || expanded >= maxExpand; }
      // 保護種子：種子在這一層的狀態一定要留著
      var prot = [];
      for (var sd = 0; sd < seedStates.length; sd++) {
        var path = seedStates[sd];
        if (path.length > protAt) {
          // 找出這個種子狀態對應的節點（跟 nxt 中的節點用同一個 key 去重）；若不存在就補進去（父節點不明，標記 -1，之後不重建）
          var ss = path[protAt];
          var sk1 = pack1(ss), sk2 = pack2(ss), e2 = tab[mixHash(sk1, sk2) & mask], found = -1;
          while (e2 !== -1) { if (nK1[e2] === sk1 && nK2[e2] === sk2 && nxt[e2 * NF + F.PROG] >= ss[F.PROG] && nxt[e2 * NF + F.QUAL] >= ss[F.QUAL]) { found = e2; break; } e2 = nChain[e2]; }
          if (found >= 0) nProt[found] = 1;
        }
      }
      if (nN === 0) break;
      // 提前結束：已經達到品質上限，這一層之後的手法只會更長
      if (best && best.met && best.qcap >= Qcap) break;
      if (timedOut || expanded >= maxExpand) break;
      // 選出前 beam 個
      var keepN = nN, sel = null;
      if (nN > beam) {
        for (var j = 0; j < nN; j++) {
          for (var k4 = 0; k4 < NF; k4++) t2[k4] = nxt[j * NF + k4];
          hbuf[j] = nProt[j] ? 1e18 : heur(ctx, W, t2);
        }
        if (o.diverse) { // o.diverse（0～1，預設不啟用＝跟原本完全一樣）：前 (1-diverse) 比例照分數留，其餘名額讓「資源組合（CP、耐久、增益）不同」的狀態各留最好的 2 個，避免整層都是相似狀態；窄集束在 CP 吃緊時常因此漏掉可行手法
          var order = new Int32Array(nN); for (var oi = 0; oi < nN; oi++) order[oi] = oi;
          order = Array.prototype.slice.call(order).sort(function (a, b) { return hbuf[b] - hbuf[a]; });
          var topN = Math.floor(beam * (1 - o.diverse)); sel = order.slice(0, topN);
          var cnt = {}, rest = [];
          for (var oi2 = topN; oi2 < nN && sel.length < beam; oi2++) {
            var jj = order[oi2], bb = jj * NF;
            var bk = ((nxt[bb + F.CP] >> 4) * 64 + (nxt[bb + F.DUR] >> 3)) * 256 + (nxt[bb + F.IQ] > 0 ? 1 : 0) + (nxt[bb + F.INNO] > 0 ? 2 : 0) + (nxt[bb + F.VEN] > 0 ? 4 : 0) + (nxt[bb + F.GS] > 0 ? 8 : 0) + (nxt[bb + F.MANIP] > 0 ? 16 : 0) + (nxt[bb + F.WN] > 0 ? 32 : 0) + (nxt[bb + F.MM] > 0 ? 64 : 0);
            if ((cnt[bk] || 0) < 2) { cnt[bk] = (cnt[bk] || 0) + 1; sel.push(jj); } else rest.push(jj);
          }
          for (var ri2 = 0; ri2 < rest.length && sel.length < beam; ri2++) sel.push(rest[ri2]);
          keepN = sel.length;
        } else {
        var thr = quickselectThreshold(hbuf, nN, beam - 1);
        sel = []; var ties = [];
        for (var j2 = 0; j2 < nN; j2++) { if (hbuf[j2] > thr) sel.push(j2); else if (hbuf[j2] === thr) ties.push(j2); }
        for (var t3 = 0; t3 < ties.length && sel.length < beam; t3++) sel.push(ties[t3]);
        keepN = sel.length;
        }
      }
      var newCur = new Int32Array(beam * NF), np = new Int32Array(keepN), na = new Uint8Array(keepN);
      for (var m = 0; m < keepN; m++) {
        var src = sel ? sel[m] : m;
        for (var k5 = 0; k5 < NF; k5++) newCur[m * NF + k5] = nxt[src * NF + k5];
        np[m] = nParent[src]; na[m] = nAct[src];
      }
      cur = newCur; curN = keepN; parents.push(np); acts.push(na);
    }
    if (!best) return { ids: null, expanded: expanded, timedOut: timedOut, pruned: pruned };
    var ids = reconstruct(best.layer, best.idx, best.id);
    return { ids: ids, quality: best.q, qcap: best.qcap, met: best.met, steps: best.steps, expanded: expanded, timedOut: timedOut, pruned: pruned, finMemo: fin ? fin.size() : 0 };
  }


  /* ── 快速局部搜尋 ──
   * 集束搜尋找到的手法不一定是「局部最佳」：把其中某一步換掉、刪掉、插入一步、或跟隔壁交換，常常還能更好一點
   * （實測用 GA 的局部搜尋精修，5 組裡有 2 組品質提高）。這裡用精簡模擬器做同樣的事，一次評估只要十幾微秒，
   * 比 vendor 版快很多，所以可以對前幾名候選都精修。結果採用前仍由呼叫端用 vendor 模擬器重算。
   * 評分：做完且達到門檻 > 做完但品質不足（專家配方）；再比品質（上限為目標）；最後步數越少越好。
   * 運算量用「評估次數」限制，種子固定，所以結果可重現。 */
  function makeRng(seed) { var a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function localSearch(ctx, startIds, o) {
    o = o || {};
    var rnd = makeRng(o.seed || 1), maxEvals = o.maxEvals || 120000, prefixLen = o.prefixLen || 0, Qcap = ctx.QCAP;
    var st = new Int32Array(NF), init = o.startState || S.initState(ctx), usableList = [];
    for (var u = 0; u < NA; u++) if (ctx.usable[u]) usableList.push(u);
    var evals = 0;
    // 評估一串手法：回傳 { score, len }（score<0＝無效：有技能不能用、或沒做完）。做完之後多餘的步驟直接截掉。
    function evaluate(ids) {
      evals++;
      st.set(init);
      for (var i = 0; i < ids.length; i++) {
        if (!S.canUse(ctx, st, ids[i])) return { score: -1, len: 0 };
        var f = S.step(ctx, st, ids[i]);
        if (f === 2) return { score: -1, len: 0 };
        if (f === 1) {
          var met = !ctx.reqQ || st[F.QUAL] >= ctx.reqQ, qc = st[F.QUAL] < Qcap ? st[F.QUAL] : Qcap;
          return { score: (met ? 2e12 : 1e12) + qc * 1e3 + (999 - (i + 1)), len: i + 1 };
        }
      }
      return { score: -1, len: 0 };
    }
    var cur = startIds.slice(), curE = evaluate(cur);
    if (curE.score < 0) return null;
    cur.length = curE.len;
    var best = cur.slice(), bestScore = curE.score, sinceImprove = 0;
    while (evals < maxEvals) {
      var cand = cur.slice(), n = cand.length, free = n - prefixLen;
      var kind = Math.floor(rnd() * 4), k = prefixLen + Math.floor(rnd() * Math.max(1, free));
      if (kind === 0 && free > 0) cand[k] = usableList[Math.floor(rnd() * usableList.length)];           // 換一步
      else if (kind === 1 && free > 1) cand.splice(k, 1);                                                  // 刪一步
      else if (kind === 2) cand.splice(prefixLen + Math.floor(rnd() * (free + 1)), 0, usableList[Math.floor(rnd() * usableList.length)]); // 插一步
      else if (free > 1 && k + 1 < n) { var t = cand[k]; cand[k] = cand[k + 1]; cand[k + 1] = t; }      // 跟隔壁交換
      else continue;
      var e = evaluate(cand);
      if (e.score >= curE.score) { // 持平也接受（讓搜尋能在平坦區域移動）
        cur = cand.slice(0, e.len); curE = e;
        if (e.score > bestScore) { bestScore = e.score; best = cur.slice(); sinceImprove = 0; }
      }
      sinceImprove++;
      if (sinceImprove > 4000) { // 卡住了：回到目前最好的，隨機擾動 2～3 步再繼續
        cur = best.slice(); curE = evaluate(cur);
        for (var r = 0, nr = 2 + Math.floor(rnd() * 2); r < nr; r++) {
          var c2 = cur.slice(), f2 = c2.length - prefixLen; if (f2 < 1) break;
          c2[prefixLen + Math.floor(rnd() * f2)] = usableList[Math.floor(rnd() * usableList.length)];
          var e2 = evaluate(c2); if (e2.score >= 0) { cur = c2.slice(0, e2.len); curE = e2; }
        }
        sinceImprove = 0;
      }
    }
    return { ids: best, score: bestScore, evals: evals };
  }

  g.CraftExact = { beamSearch: beamSearch, makeWeights: makeWeights, localSearch: localSearch };
})(typeof self !== 'undefined' ? self : this);
