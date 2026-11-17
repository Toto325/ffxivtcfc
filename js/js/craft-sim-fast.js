/* craft-sim-fast.js — 精簡版生產模擬器（只做「安全模式＋線性」這一種情境）
 *
 * 為什麼要有它：
 *   求解的熱路徑是「在某個狀態下試一個技能，看新狀態」。vendor 的 Simulation 每一步都會配置物件、
 *   用 Array.find 找 buff、重新計算基礎進度／品質，慢很多。精確搜尋（craft-exact.js）一次要展開數百萬個狀態，
 *   所以這裡把狀態壓成一組整數、把每個技能的規則寫成查表＋少量運算。
 *
 * 正確性怎麼保證（重要）：
 *   規則是逐行對照 vendor/ffxiv-simulator.umd.js 的技能實作移植的（含 Math.fround 的順序、combo 判定、buff 計時方式）。
 *   tools/fuzz-sim.js 會用大量隨機配方／數值／手法，把這裡的每一步結果跟 vendor 模擬器逐項比對（進度、品質、耐久、CP、是否成功、優質率）。
 *   而且「採用任何結果之前，一律再用 vendor 模擬器重算一次」——所以就算這裡有遺漏的邊角規則，最壞情況也只是
 *   多一個被淘汰的候選，不會讓玩家拿到錯誤的手法。
 *
 * 範圍：只支援安全模式（成功率 < 100 的技能一律不用）。不支援的技能（RapidSynthesis／HastyTouch／DaringTouch／
 *   MaterialMiracle／StellarSteadyHand／CarefulObservation）直接不收錄；需要它們的情境由原本的搜尋流程負責。
 */
(function (g) {
  'use strict';

  /* 狀態欄位（全部是整數，放在一個 Int32Array 裡，方便複製與當 key）：
   *  0 progress  1 quality  2 durability  3 cp
   *  4 iq（0～10）  5 wn（節約剩餘次數，節約／加工節約共用一個，只影響耐久減半與 Prudent 系列能不能用）
   *  6 manip  7 gs  8 inno  9 ven  10 mm  11 fa  12 hs（0/1）  13 tp（0/1：永久 buff，尚未被消耗）
   *  14 combo（0 無／1 剛用完 BasicTouch／2 剛用完「有 combo 的」StandardTouch／3 剛用完 Observe）
   *  15 flags：bit0＝已做過「會計步」的動作（Reflect／MuscleMemory 只能在這之前用）
   *            bit1＝已做過任何動作（TrainedEye 只能第一步）  bit2＝TrainedPerfection 已用過
   *            bit3＝HeartAndSoul 已用過  bit4＝QuickInnovation 已用過
   *  16 steps（已用步數，只用來比較步數，不影響規則） */
  var F = { PROG: 0, QUAL: 1, DUR: 2, CP: 3, IQ: 4, WN: 5, MANIP: 6, GS: 7, INNO: 8, VEN: 9, MM: 10, FA: 11, HS: 12, TP: 13, COMBO: 14, FLAGS: 15, STEPS: 16 };
  var NF = 17;

  /* 技能表：id 就是索引。req＝等級需求；cp／dur 是基礎消耗（有 combo 或狀態變化的在 apply 裡另外處理）。
   * name 是 vendor 的類別名稱（跟 craft-worker 的 actionKeys 一致）。 */
  var ACTIONS = [
    { name: 'BasicSynthesis', req: 1 }, { name: 'CarefulSynthesis', req: 62 }, { name: 'PrudentSynthesis', req: 88 },
    { name: 'Groundwork', req: 72 }, { name: 'MuscleMemory', req: 54 }, { name: 'IntensiveSynthesis', req: 78 },
    { name: 'DelicateSynthesis', req: 76 }, { name: 'BasicTouch', req: 5 }, { name: 'StandardTouch', req: 18 },
    { name: 'AdvancedTouch', req: 68 }, { name: 'ByregotsBlessing', req: 50 }, { name: 'PreciseTouch', req: 53 },
    { name: 'PrudentTouch', req: 66 }, { name: 'PreparatoryTouch', req: 71 }, { name: 'Reflect', req: 69 },
    { name: 'TrainedFinesse', req: 90 }, { name: 'RefinedTouch', req: 92 }, { name: 'TricksOfTheTrade', req: 13 },
    { name: 'MastersMend', req: 7 }, { name: 'Manipulation', req: 65 }, { name: 'ImmaculateMend', req: 98 },
    { name: 'WasteNot', req: 15 }, { name: 'WasteNotII', req: 47 }, { name: 'GreatStrides', req: 21 },
    { name: 'Innovation', req: 26 }, { name: 'Veneration', req: 15 }, { name: 'FinalAppraisal', req: 42 },
    { name: 'Observe', req: 13 }, { name: 'HeartAndSoul', req: 86 }, { name: 'QuickInnovation', req: 96 },
    { name: 'TrainedEye', req: 80 }, { name: 'TrainedPerfection', req: 100 },
  ];
  var A = {}; ACTIONS.forEach(function (a, i) { a.id = i; A[a.name] = i; });
  var NA = ACTIONS.length;

  /* HQ_TABLE：品質百分比 → 優質率（跟 vendor 的 Tables.HQ_TABLE 一樣） */
  var HQ_TABLE = [
    1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8,
    9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12, 13, 13, 13, 14, 14, 14, 15, 15, 15, 16, 16, 17, 17,
    17, 18, 18, 18, 19, 19, 20, 20, 21, 22, 23, 24, 26, 28, 31, 34, 38, 42, 47, 52, 58, 64, 68, 71,
    74, 76, 78, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 94, 96, 98, 100,
  ];
  function hqPercentOf(quality, recipeQuality) {
    var pct = Math.min(quality / recipeQuality, 1) * 100;
    if (pct === 0) return 1;
    if (pct >= 100) return 100;
    return HQ_TABLE[Math.floor(pct)];
  }
  /* vendor 的 LEVEL_TABLE 只用到「該等級對應的 rlvl <= 配方 rlvl」這個判斷，這裡直接傳進來 */

  /* ctx：一次求解固定不變的東西（配方、數值、起始品質、各技能的預先計算值）。
   *  craft：buildCraftObject 的結果；stats：{ craftsmanship, control, cp, level, specialist }；
   *  hq：[{id, amount}]；levelRlvl：LEVEL_TABLE[level]（呼叫端從 vendor 取，不自己維護一份表）；
   *  allowed：Set<技能名稱>（職業／等級／玩家排除之後能用的技能），沒給就用等級判斷。 */
  function makeCtx(craft, stats, hq, levelRlvl, allowed) {
    var lvl = stats.level;
    var baseProg = (stats.craftsmanship * 10) / craft.progressDivider + 2;
    var baseQual = (stats.control * 10) / craft.qualityDivider + 35;
    var bp, bq;
    if (levelRlvl != null && levelRlvl <= craft.rlvl) { // vendor：LEVEL_TABLE 沒有這個等級（51 級以下）時 undefined <= x 為 false，走 else
      bp = Math.floor(Math.fround(baseProg * (craft.progressModifier || 100) * Math.fround(0.01)));
      bq = Math.floor(Math.fround(baseQual * (craft.qualityModifier || 100) * Math.fround(0.01)));
    } else { bp = Math.floor(Math.floor(baseProg)); bq = Math.floor(Math.floor(baseQual)); }
    var startQ = 0;
    (hq || []).forEach(function (h) {
      var d = null; for (var i = 0; i < craft.ingredients.length; i++) if (craft.ingredients[i].id === h.id) { d = craft.ingredients[i]; break; }
      if (d && d.quality) startQ += d.quality * h.amount;
    });
    startQ = Math.floor(startQ);
    var ctx = {
      craft: craft, lvl: lvl, bp: bp, bq: bq, startQ: startQ, P: craft.progress, Q: craft.quality, D: craft.durability,
      reqQ: craft.requiredQuality || 0, CP: stats.cp, specialist: !!stats.specialist, expert: !!craft.expert, recipeLvl: craft.lvl,
      iqOk: lvl >= 11, usable: new Array(NA), QCAP: craft.quality,
    };
    for (var i = 0; i < NA; i++) {
      var a = ACTIONS[i], ok = lvl >= a.req;
      if (allowed) ok = ok && allowed.has(a.name);
      if ((a.name === 'HeartAndSoul' || a.name === 'QuickInnovation') && !ctx.specialist) ok = false;
      if (a.name === 'TrainedEye' && (ctx.expert || lvl - craft.lvl < 10)) ok = false;
      ctx.usable[i] = ok;
    }
    // 等級相關的威力
    ctx.potBasic = lvl >= 31 ? 120 : 100;
    ctx.potCareful = lvl >= 82 ? 180 : 150;
    ctx.potGround = lvl >= 86 ? 360 : 300;
    ctx.potDelProg = lvl >= 94 ? 150 : 100;
    return ctx;
  }

  function initState(ctx) {
    var s = new Int32Array(NF);
    s[F.QUAL] = ctx.startQ; s[F.DUR] = ctx.D; s[F.CP] = ctx.CP;
    return s;
  }

  /* 進度／品質的增量，運算順序跟 vendor 完全一樣（浮點運算的順序會影響 floor 的結果） */
  function progInc(ctx, potency, s) {
    var buffMod = 1;
    if (s[F.MM] > 0) buffMod += 1;
    if (s[F.VEN] > 0) buffMod += 0.5;
    var efficiency = potency * buffMod;
    return Math.floor((ctx.bp * 1 * efficiency) / 100);
  }
  function qualInc(ctx, potency, s) {
    var buffMult = 1;
    if (s[F.GS] > 0) buffMult += 1;
    if (s[F.INNO] > 0) buffMult += 0.5;
    var buffMod = (1 * buffMult * (100 + s[F.IQ] * 10)) / 100;
    var efficiency = Math.fround(potency * buffMod);
    return Math.floor((ctx.bq * 1 * efficiency) / 100);
  }
  /* 進度技能的共同收尾：吃掉 MuscleMemory；Final Appraisal 生效時進度最多停在「差 1 點」並消耗掉這個 buff */
  function progressDone(ctx, s) {
    s[F.MM] = 0;
    if (s[F.FA] > 0 && s[F.PROG] >= ctx.P) { s[F.PROG] = Math.min(s[F.PROG], ctx.P - 1); s[F.FA] = 0; }
  }
  /* 品質技能的共同部分：增加品質、吃掉 Great Strides、加 1 層 Inner Quiet（等級 11 以上）；extra＝額外直接加的層數 */
  function qualityAct(ctx, s, potency, extra) {
    s[F.QUAL] += qualInc(ctx, potency, s);
    s[F.GS] = 0;
    if (ctx.iqOk) s[F.IQ] = Math.min(s[F.IQ] + 1, 10);
    if (extra) s[F.IQ] = Math.min(s[F.IQ] + extra, 10);
  }

  /* 這個技能這一步的 CP 基礎消耗（combo 會變） */
  function cpCost(ctx, s, id) {
    switch (id) {
      case 0: return 0; case 1: return 7; case 2: return 18; case 3: return 18; case 4: return 6; case 5: return 6;
      case 6: return 32; case 7: return 18; case 8: return s[F.COMBO] === 1 ? 18 : 32;
      case 9: return (s[F.COMBO] === 2 || s[F.COMBO] === 3) ? 18 : 46;
      case 10: return 24; case 11: return 18; case 12: return 25; case 13: return 40; case 14: return 6; case 15: return 32;
      case 16: return 24; case 17: return 0; case 18: return 88; case 19: return 96; case 20: return 112; case 21: return 56;
      case 22: return 98; case 23: return 32; case 24: return 18; case 25: return 18; case 26: return 1; case 27: return 7;
      case 28: return 0; case 29: return 0; case 30: return 250; case 31: return 0;
    }
    return 1e9;
  }
  /* 基礎耐久消耗（還沒套用節約） */
  var DUR_BASE = [10, 10, 5, 20, 10, 10, 10, 10, 10, 10, 10, 10, 5, 20, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  /* MuscleMemory 的耐久消耗固定 10（不受節約影響）；其餘 ceil(base / 節約倍率) */
  function durCost(s, id) {
    if (id === 4) return 10;
    var base = DUR_BASE[id];
    if (base === 0) return 0;
    return s[F.WN] > 0 ? Math.ceil(base / 2) : base;
  }

  /* 這個技能在這個狀態下能不能用（安全模式＋線性；含 CP 足夠）。對應 vendor 的 canBeUsed + hasEnoughCP + 安全模式規則。 */
  function canUse(ctx, s, id) {
    if (!ctx.usable[id]) return false;
    if (s[F.CP] < cpCost(ctx, s, id)) return false;
    switch (id) {
      case 2: case 12: return s[F.WN] === 0; // Prudent 系列：節約中不能用
      case 4: case 14: return (s[F.FLAGS] & 1) === 0; // MuscleMemory／Reflect：只能在第一個「會計步」的動作
      case 5: case 11: return s[F.HS] === 1; // 安全模式：需要 Heart and Soul（PreciseTouch／IntensiveSynthesis）
      case 10: return s[F.IQ] > 0;
      case 15: return s[F.IQ] === 10;
      case 17: return s[F.HS] === 1; // Tricks 沒有 Heart and Soul 只是浪費一步，直接不用
      case 28: return (s[F.FLAGS] & 8) === 0;
      case 29: return (s[F.FLAGS] & 16) === 0;
      case 30: return (s[F.FLAGS] & 2) === 0;
      case 31: return (s[F.FLAGS] & 4) === 0;
    }
    return true;
  }


  /* 一次掃出這個狀態所有能用的技能（結果必須跟逐一呼叫 canUse 完全相同；tools/fuzz-sim.js 會檢查）。
   * 把 CP、旗標等先讀成區域變數、依序判斷，比對 32 個技能各呼叫一次 canUse 快很多。 */
  function usableIds(ctx, s, out) {
    var n = 0, cp = s[F.CP], fl = s[F.FLAGS], wn = s[F.WN], iq = s[F.IQ], hs = s[F.HS], cb = s[F.COMBO], u = ctx.usable;
    var first = (fl & 1) === 0;
    if (u[0]) out[n++] = 0;
    if (u[1] && cp >= 7) out[n++] = 1;
    if (u[2] && cp >= 18 && wn === 0) out[n++] = 2;
    if (u[3] && cp >= 18) out[n++] = 3;
    if (u[4] && cp >= 6 && first) out[n++] = 4;
    if (u[5] && cp >= 6 && hs === 1) out[n++] = 5;
    if (u[6] && cp >= 32) out[n++] = 6;
    if (u[7] && cp >= 18) out[n++] = 7;
    if (u[8] && cp >= (cb === 1 ? 18 : 32)) out[n++] = 8;
    if (u[9] && cp >= ((cb === 2 || cb === 3) ? 18 : 46)) out[n++] = 9;
    if (u[10] && cp >= 24 && iq > 0) out[n++] = 10;
    if (u[11] && cp >= 18 && hs === 1) out[n++] = 11;
    if (u[12] && cp >= 25 && wn === 0) out[n++] = 12;
    if (u[13] && cp >= 40) out[n++] = 13;
    if (u[14] && cp >= 6 && first) out[n++] = 14;
    if (u[15] && cp >= 32 && iq === 10) out[n++] = 15;
    if (u[16] && cp >= 24) out[n++] = 16;
    if (u[17] && hs === 1) out[n++] = 17;
    if (u[18] && cp >= 88) out[n++] = 18;
    if (u[19] && cp >= 96) out[n++] = 19;
    if (u[20] && cp >= 112) out[n++] = 20;
    if (u[21] && cp >= 56) out[n++] = 21;
    if (u[22] && cp >= 98) out[n++] = 22;
    if (u[23] && cp >= 32) out[n++] = 23;
    if (u[24] && cp >= 18) out[n++] = 24;
    if (u[25] && cp >= 18) out[n++] = 25;
    if (u[26] && cp >= 1) out[n++] = 26;
    if (u[27] && cp >= 7) out[n++] = 27;
    if (u[28] && (fl & 8) === 0) out[n++] = 28;
    if (u[29] && (fl & 16) === 0) out[n++] = 29;
    if (u[30] && cp >= 250 && (fl & 2) === 0) out[n++] = 30;
    if (u[31] && (fl & 4) === 0) out[n++] = 31;
    return n;
  }

  /* 套用一個技能（呼叫前要先確認 canUse）。直接修改傳進來的 s（呼叫端先複製）。
   * 回傳：0＝繼續、1＝完成（進度達標）、2＝失敗（耐久歸零）。
   * 順序完全比照 vendor：execute → 扣耐久（Trained Perfection 會吃掉這次的耐久消耗）→ 扣 CP → 判斷完成／失敗 →
   * 計時（只有「這一步之前就存在」的 buff 會計時）。 */
  function step(ctx, s, id) {
    var cpc = cpCost(ctx, s, id), dc = durCost(s, id);
    var prevCombo = s[F.COMBO], nextCombo = 0;
    var newBuff = -1, newDur = 0, skipsTick = false;
    switch (id) {
      case 0: s[F.PROG] += progInc(ctx, ctx.potBasic, s); progressDone(ctx, s); break;
      case 1: s[F.PROG] += progInc(ctx, ctx.potCareful, s); progressDone(ctx, s); break;
      case 2: s[F.PROG] += progInc(ctx, 180, s); progressDone(ctx, s); break;
      case 3: {
        var pot = ctx.potGround;
        if (!(s[F.TP] === 1 || s[F.DUR] >= dc)) pot = pot / 2;
        s[F.PROG] += progInc(ctx, pot, s); progressDone(ctx, s); break;
      }
      case 4: s[F.PROG] += progInc(ctx, 300, s); progressDone(ctx, s); newBuff = F.MM; newDur = 5; break;
      case 5: s[F.PROG] += progInc(ctx, 400, s); progressDone(ctx, s); break;
      case 6:
        s[F.PROG] += progInc(ctx, ctx.potDelProg, s); progressDone(ctx, s);
        s[F.QUAL] += qualInc(ctx, 100, s); s[F.GS] = 0; if (ctx.iqOk) s[F.IQ] = Math.min(s[F.IQ] + 1, 10);
        break;
      case 7: qualityAct(ctx, s, 100, 0); nextCombo = 1; break;
      case 8: qualityAct(ctx, s, 125, 0); nextCombo = prevCombo === 1 ? 2 : 0; break;
      case 9: qualityAct(ctx, s, 150, 0); break;
      case 10: qualityAct(ctx, s, Math.min(100 + s[F.IQ] * 20, 300), 0); s[F.IQ] = 0; break;
      case 11: qualityAct(ctx, s, 150, 1); break;
      case 12: qualityAct(ctx, s, 100, 0); break;
      case 13: qualityAct(ctx, s, 200, 1); break;
      case 14: qualityAct(ctx, s, 300, 1); break;
      case 15: qualityAct(ctx, s, 100, 0); break;
      case 16: qualityAct(ctx, s, 100, prevCombo === 1 ? 1 : 0); break;
      case 17: if (s[F.HS] === 1) s[F.CP] = Math.min(s[F.CP] + 20, ctx.CP); break;
      case 18: s[F.DUR] = Math.min(s[F.DUR] + 30, ctx.D); break;
      case 19: s[F.MANIP] = 0; newBuff = F.MANIP; newDur = 8; break;
      case 20: s[F.DUR] = ctx.D; break;
      case 21: s[F.WN] = 0; newBuff = F.WN; newDur = 4; break;
      case 22: s[F.WN] = 0; newBuff = F.WN; newDur = 8; break;
      case 23: s[F.GS] = 0; newBuff = F.GS; newDur = 3; break;
      case 24: s[F.INNO] = 0; newBuff = F.INNO; newDur = 4; break;
      case 25: s[F.VEN] = 0; newBuff = F.VEN; newDur = 4; break;
      case 26: s[F.FA] = 0; newBuff = F.FA; newDur = 5; skipsTick = true; break;
      case 27: nextCombo = 3; break;
      case 28: newBuff = F.HS; newDur = 1; skipsTick = true; s[F.FLAGS] |= 8; break;
      case 29: s[F.INNO] = 0; newBuff = F.INNO; newDur = 1; skipsTick = true; s[F.FLAGS] |= 16; break;
      case 30: s[F.QUAL] = ctx.Q; break;
      case 31: newBuff = F.TP; newDur = 1; s[F.FLAGS] |= 4; break;
    }
    if (s[F.TP] === 1 && dc > 0) s[F.TP] = 0; else s[F.DUR] -= dc;
    s[F.CP] -= cpc;
    s[F.STEPS]++;
    s[F.FLAGS] |= 2;
    if (!skipsTick) s[F.FLAGS] |= 1;
    s[F.COMBO] = nextCombo;
    if (s[F.PROG] >= ctx.P) return 1;
    if (s[F.DUR] <= 0) return 2;
    if (!skipsTick) {
      if (s[F.MANIP] > 0) { s[F.DUR] = Math.min(s[F.DUR] + 5, ctx.D); s[F.MANIP]--; }
      if (s[F.WN] > 0) s[F.WN]--;
      if (s[F.GS] > 0) s[F.GS]--;
      if (s[F.INNO] > 0) s[F.INNO]--;
      if (s[F.VEN] > 0) s[F.VEN]--;
      if (s[F.MM] > 0) s[F.MM]--;
      if (s[F.FA] > 0) s[F.FA]--;
      if (s[F.HS] === 1 && (id === 5 || id === 11 || id === 17)) s[F.HS] = 0; // 這一步不是 Good／Excellent，Heart and Soul 被吃掉
    }
    if (newBuff >= 0) s[newBuff] = newDur;
    return 0;
  }

  /* 結果是否成功（含專家配方的最低品質門檻） */
  function isSuccess(ctx, s) { return s[F.PROG] >= ctx.P && (!ctx.reqQ || s[F.QUAL] >= ctx.reqQ); }

  g.CraftSimFast = { F: F, NF: NF, ACTIONS: ACTIONS, A: A, NA: NA, makeCtx: makeCtx, initState: initState, hqPercentOf: hqPercentOf, canUse: canUse, usableIds: usableIds, cpCost: cpCost, durCost: durCost, progInc: progInc, qualInc: qualInc, step: step, isSuccess: isSuccess };
})(typeof self !== 'undefined' ? self : this);
