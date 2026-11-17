#!/usr/bin/env node
/* 實驗：精確搜尋引擎 vs 現有 GA（同樣條件） */
const { makeWorker } = require('./node-worker-host');
const path = require('path'), fs = require('fs'), vm = require('vm');
(async () => {
  const rid = process.argv[2] || '5618', beam = +(process.argv[3] || 20000);
  const w = makeWorker({ library: false }), cx = w.ctx;
  ['craft-sim-fast.js', 'craft-exact.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), cx, { filename: f }));
  const S = cx.CraftSimFast, E = cx.CraftExact, sim = cx.simulator;
  const R = w.recipes(), rec = R[rid];
  const hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
  const SS = rec.suggestedCraftsmanship, cpF = (sv) => 17 * Math.pow(sv, 0.35) + 180;
  const fs_ = (process.argv[4] || '0.75,0.85,0.95,1.05').split(',').map(Number);
  for (const f of fs_) {
    const sv = Math.round(SS * f), st = { jobId: rec.jobId, level: 100, craftsmanship: sv, control: Math.round(sv * 0.905), cp: Math.round(cpF(sv)), specialist: false, relicTool: false, excludedActions: ['StellarSteadyHand', 'MaterialMiracle', 'Manipulation_', 'TrainedEye'] };
    const craft = cx.buildCraftObject(Object.assign({ id: rid }, rec), {});
    const cs = cx.buildCrafterStats(st);
    const ctx = S.makeCtx(craft, st, hq, sim.Tables.LEVEL_TABLE[100], cx.allowedActionNames(cs));
    const variants = [{ dur: 0.6, buff: 0.6 }, { cp: 0.6 }, { dur: 0.4, buff: 0.4 }, { cp: 0.4, dur: 0.6 }];
    let bestOverall = null; const t0 = Date.now();
    for (const v of variants) {
      const t = Date.now();
      const r = E.beamSearch(ctx, { beam, variant: v });
      let line = JSON.stringify(v) + ' -> ';
      if (r.ids) {
        const keys = r.ids.map((i) => S.ACTIONS[i].name);
        const sr = await w.send({ type: 'simulate', recipeId: rid, stats: st, keys, hq, safeMode: true });
        const o = sr.result; line += 'hq ' + o.hqPercent + ' q ' + o.quality + ' steps ' + o.steps + ' success ' + o.success + ' (fast-sim q ' + r.quality + ')';
        if (!bestOverall || o.hqPercent > bestOverall.hq || (o.hqPercent === bestOverall.hq && o.quality > bestOverall.q)) bestOverall = { hq: o.hqPercent, q: o.quality, steps: o.steps, keys };
      } else line += 'none';
      console.log('  ', line, ((Date.now() - t) / 1000).toFixed(1) + 's', 'expanded', r.expanded, 'pruned', r.pruned, 'finMemo', r.finMemo);
    }
    console.log('f=' + f, 'BEST hq', bestOverall && bestOverall.hq, 'q', bestOverall && bestOverall.q, 'steps', bestOverall && bestOverall.steps, 'total', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
})();
