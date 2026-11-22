#!/usr/bin/env node
/* 隨機對照測試：精簡模擬器（js/craft-sim-fast.js）vs vendor 模擬器（teamcraft simulator）
 *
 * 沿著大量隨機路徑，每一步都比對：
 *   ① 「哪些技能現在能用」：兩邊的集合必須完全相同（限於精簡模擬器收錄的技能）。
 *   ② 套用同一個技能後的狀態：進度、品質、耐久、CP、是否完成／失敗、優質率，必須完全相同。
 * 用法：node tools/fuzz-sim.js [路徑數，預設 3000] [種子，預設 1] [low＝只測角色等級 5～55]
 * 任何不一致都會印出完整重現資訊（配方、數值、到目前為止的手法）並計入失敗。 */
const { makeWorker } = require('./node-worker-host');
const path = require('path'), fs = require('fs'), vm = require('vm');

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

(async () => {
  const PATHS = +(process.argv[2] || 3000), rnd = rng(+(process.argv[3] || 1));
  const w = makeWorker({ library: false }), cx = w.ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'craft-sim-fast.js'), 'utf8'), cx, { filename: 'craft-sim-fast.js' });
  const S = cx.CraftSimFast, sim = cx.simulator;
  const R = w.recipes(), ids = Object.keys(R).filter((i) => R[i].quality > 0 || true);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const ENTRY = {}; sim.CraftingActionsRegistry.ALL_ACTIONS.forEach((e) => { ENTRY[e.name] = e; });
  const LEVEL_TABLE = sim.Tables ? sim.Tables.LEVEL_TABLE : null;
  let mism = 0, steps = 0, paths = 0, finished = 0, usableChecks = 0;
  const fail = (msg, info) => { mism++; if (mism <= 12) console.log('MISMATCH:', msg, JSON.stringify(info)); };

  for (let pi = 0; pi < PATHS; pi++) {
    const rid = pick(ids), rec = R[rid];
    const level = process.argv[4] === 'low' ? pick([5, 10, 11, 15, 20, 26, 30, 31, 40, 50, 51, 55]) : (rnd() < 0.75 ? 100 : pick([60, 70, 80, 90, 95, 99]));
    const S0 = rec.suggestedCraftsmanship > 0 ? rec.suggestedCraftsmanship : Math.max(300, 6.5 * rec.rlvl);
    const csv = Math.round(S0 * (0.4 + rnd() * 1.4)), ctv = Math.round(S0 * (0.3 + rnd() * 1.4)), cpv = Math.round(60 + rnd() * 900);
    const specialist = rnd() < 0.25;
    const hqAll = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const hq = hqAll.map((h) => ({ id: h.id, amount: rnd() < 0.5 ? h.amount : Math.floor(rnd() * (h.amount + 1)) })).filter((h) => h.amount > 0);
    const stats = { jobId: rec.jobId, level, craftsmanship: csv, control: ctv, cp: cpv, specialist, relicTool: false };
    const full = Object.assign({ id: String(rid) }, rec);
    const craft = cx.buildCraftObject(full, {});
    const excluded = ['StellarSteadyHand', 'MaterialMiracle'].concat(rnd() < 0.2 ? [pick(['Manipulation', 'WasteNotII', 'Reflect', 'TrainedFinesse', 'ImmaculateMend', 'ByregotsBlessing'])] : []);
    const cs = cx.buildCrafterStats(Object.assign({}, stats, { excludedActions: excluded }));
    const allowed = cx.allowedActionNames(cs);
    const lv = LEVEL_TABLE ? LEVEL_TABLE[level] : 0;
    const ctx = S.makeCtx(craft, { craftsmanship: csv, control: ctv, cp: cpv, level, specialist }, hq, lv, allowed); // lv 可能是 undefined（51 級以下 LEVEL_TABLE 沒有值），要原樣傳，跟 vendor 一致
    const st = S.initState(ctx);
    const rot = []; paths++;
    const len = 8 + Math.floor(rnd() * 40);
    for (let n = 0; n < len; n++) {
      // vendor：把到目前為止的手法完整跑一遍（跟網站的評分方式一樣：linear + safeMode）
      const acts = rot.map((id) => new ENTRY[S.ACTIONS[id].name].action.constructor());
      const vs = new sim.Simulation(craft, acts, cs, hq);
      const res = vs.run(true, undefined, true);
      // 比對目前狀態
      const mine = { p: st[S.F.PROG], q: st[S.F.QUAL], d: st[S.F.DUR], c: st[S.F.CP] };
      const theirs = { p: vs.progression, q: vs.quality, d: vs.durability, c: vs.availableCP };
      if (mine.p !== theirs.p || mine.q !== theirs.q || mine.d !== theirs.d || mine.c !== theirs.c) { fail('state', { rid, level, stats, hq, rot: rot.map((i) => S.ACTIONS[i].name), mine, theirs }); break; }
      const terminated = vs.success !== undefined;
      if (terminated) { finished++; break; }
      // 比對「能用的技能」集合
      const mineUsable = [], theirsUsable = [];
      for (let id = 0; id < S.NA; id++) {
        const name = S.ACTIONS[id].name;
        // Tricks of the Trade：vendor 在「產生手法」(linear=false) 時不認 Heart and Soul，但「評分」(linear=true) 會執行。
        // 這是遊戲裡真實可用的技巧（專家職人用 Heart and Soul 免費回 20 CP），所以精簡模擬器收錄它；
        // 它的行為改由「套用後 vendor 完整重跑」驗證，不在這裡比對可用集合。
        if (name === 'TricksOfTheTrade') continue;
        if (S.canUse(ctx, st, id)) mineUsable.push(name);
        const a = ENTRY[name].action;
        if (!allowed.has(name)) continue;
        let ok = false;
        try { ok = a.canBeUsed(vs, false, true) && a.getBaseCPCost(vs) <= vs.availableCP; } catch (e) { ok = false; }
        if (ok) theirsUsable.push(name);
      }
      usableChecks++;
      { // 快速版 usableIds 必須跟逐一 canUse 完全相同
        const buf = new Int8Array(S.NA), cnt = S.usableIds(ctx, st, buf), fast = []; for (let q = 0; q < cnt; q++) fast.push(buf[q]);
        const slow = []; for (let q = 0; q < S.NA; q++) if (S.canUse(ctx, st, q)) slow.push(q);
        if (fast.join() !== slow.join()) { fail('usableIds-vs-canUse', { fast, slow, state: Array.from(st) }); break; }
      }
      const a1 = mineUsable.slice().sort().join(','), a2 = theirsUsable.slice().sort().join(',');
      if (a1 !== a2) { fail('usable-set', { rid, level, stats, rot: rot.map((i) => S.ACTIONS[i].name), mineOnly: mineUsable.filter((x) => !theirsUsable.includes(x)), theirsOnly: theirsUsable.filter((x) => !mineUsable.includes(x)), state: Array.from(st) }); break; }
      if (!mineUsable.length) break;
      // 偏好有意義的技能，才容易走到深層狀態（Inner Quiet 10 層、combo、各種 buff 疊加）
      if (S.canUse(ctx, st, S.A.TricksOfTheTrade)) mineUsable.push('TricksOfTheTrade');
      const pref = mineUsable.filter((x) => /Touch|Byregot|Veneration|Innovation|GreatStrides|WasteNot|Manipulation|Observe|Synthesis|Groundwork|Reflect|MuscleMemory|Appraisal|HeartAndSoul|Finesse|Perfection|Mend|Preparatory|Quick|Tricks/.test(x));
      const name = rnd() < 0.85 && pref.length ? pick(pref) : pick(mineUsable);
      const id = S.A[name];
      const flag = S.step(ctx, st, id);
      rot.push(id); steps++;
      // 套用後再用 vendor 完整重跑一次比對（含「完成／失敗」判斷）
      const acts2 = rot.map((i) => new ENTRY[S.ACTIONS[i].name].action.constructor());
      const vs2 = new sim.Simulation(craft, acts2, cs, hq); const r2 = vs2.run(true, undefined, true);
      const vflag = vs2.success === undefined ? 0 : (vs2.success ? 1 : 2);
      const skippedAny = r2.steps.some((x) => x.skipped || !x.success);
      if (skippedAny) { fail('vendor-skipped-or-failed-a-step-mine-thought-ok', { rid, level, stats, rot: rot.map((i) => S.ACTIONS[i].name) }); break; }
      if (flag !== vflag) { fail('end-flag', { rid, level, stats, rot: rot.map((i) => S.ACTIONS[i].name), mine: flag, theirs: vflag }); break; }
      const hq1 = S.hqPercentOf(st[S.F.QUAL], ctx.Q), hq2 = r2.hqPercent;
      if (ctx.Q > 0 && hq1 !== hq2) { fail('hq%', { rid, rot: rot.map((i) => S.ACTIONS[i].name), mine: hq1, theirs: hq2 }); break; }
      if (S.isSuccess(ctx, st) !== !!r2.success && flag !== 0) { fail('success-flag', { rid, rot: rot.map((i) => S.ACTIONS[i].name), mine: S.isSuccess(ctx, st), theirs: !!r2.success }); break; }
      if (flag !== 0) { // 終局：再比一次最終數值
        if (st[S.F.PROG] !== vs2.progression || st[S.F.QUAL] !== vs2.quality || st[S.F.DUR] !== vs2.durability || st[S.F.CP] !== vs2.availableCP) { fail('final-state', { rid, rot: rot.map((i) => S.ACTIONS[i].name), mine: Array.from(st).slice(0, 4), theirs: [vs2.progression, vs2.quality, vs2.durability, vs2.availableCP] }); }
        finished++; break;
      }
    }
  }
  console.log('paths', paths, '| steps applied', steps, '| usable-set checks', usableChecks, '| finished crafts', finished, '| MISMATCHES', mism);
  process.exit(mism ? 1 : 0);
})();
