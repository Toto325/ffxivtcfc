#!/usr/bin/env node
/* 實驗：CP 不足時（CP×倍率，其他數值為基準），各種權重在窄／寬集束下的結果。
 * 用法：node tools/study-cp.js 配方id,配方id CP倍率 [寬集束寬度] */
const { makeWorker } = require('./node-worker-host');
const path = require('path'), fs = require('fs'), vm = require('vm');
(async () => {
  const ids = (process.argv[2] || '5618,36073,34800').split(','), cpm = +(process.argv[3] || 0.6), WIDE = +(process.argv[4] || 16000);
  const w = makeWorker({ library: false }), cx = w.ctx;
  ['craft-sim-fast.js', 'craft-exact.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), cx, { filename: f }));
  const S = cx.CraftSimFast, E = cx.CraftExact, sim = cx.simulator, R = w.recipes();
  const VARS = { V0: { dur: 0.6, buff: 0.6 }, V1: { dur: 0.4, buff: 0.4 }, V2: { cp: 0.6 }, V3: { cp: 0.4, dur: 0.6 }, cp2: { cp: 2 }, cp3: { cp: 3 }, cp2d: { cp: 2, dur: 0.5 }, dur15: { dur: 1.5 }, iq03: { iq: 0.3 }, p05cp: { prog: 0.5, cp: 1.5 } };
  for (const rid of ids) {
    const rec = R[rid], hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const sv = Math.round(rec.suggestedCraftsmanship), st = { jobId: rec.jobId, level: 100, craftsmanship: sv, control: Math.round(sv * 0.905), cp: Math.round((17 * Math.pow(sv, 0.35) + 180) * cpm), excludedActions: ['StellarSteadyHand', 'MaterialMiracle', 'TrainedEye'] };
    const craft = cx.buildCraftObject(Object.assign({ id: rid }, rec), {}), cs = cx.buildCrafterStats(st);
    const ctx = S.makeCtx(craft, st, hq, sim.Tables.LEVEL_TABLE[100], cx.allowedActionNames(cs));
    const row = { rid, cpm, cp: st.cp, cap: rec.quality, res: {} };
    for (const [name, v] of Object.entries(VARS)) {
      const o = {}; for (const wd of [2500, WIDE]) { const r = E.beamSearch(ctx, { beam: wd, variant: v }); o[wd] = r.ids ? Math.min(r.quality, rec.quality) : 0; }
      row.res[name] = o;
    }
    console.log(JSON.stringify(row));
  }
})();
