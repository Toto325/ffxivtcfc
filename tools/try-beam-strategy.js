#!/usr/bin/env node
/* 透過 worker 訊息入口實測 strategy:'beam'（跟網站實際走的路徑一樣），並跟 strategy:'plain' 比較 */
const { makeWorker } = require('./node-worker-host');
(async () => {
  const ids = (process.argv[2] || '5618').split(','), fl = (process.argv[3] || '0.85,1.05').split(',').map(Number);
  const w = makeWorker({ library: false }), R = w.recipes();
  for (const rid of ids) { const rec = R[rid];
    const hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    for (const f of fl) {
      const sv = Math.round(rec.suggestedCraftsmanship * f), st = { jobId: rec.jobId, level: 100, craftsmanship: sv, control: Math.round(sv * 0.905), cp: Math.round(17 * Math.pow(sv, 0.35) + 180), excludedActions: ['StellarSteadyHand', 'MaterialMiracle', 'TrainedEye'] };
      const run = async (strategy) => { const t = Date.now(); const r = await w.send({ type: 'solve', recipeId: rid, stats: st, options: { strategy, lang: 'tw', trials: 3, populationSize: 150, generations: 40, hqIngredients: hq } }); return Object.assign({ ok: r.ok, sec: ((Date.now() - t) / 1000).toFixed(1), err: r.error }, r.result || {}); };
      const a = await run('plain'), b = await run('beam');
      const fmt = (x) => x.ok ? (x.hqPercent + '% q' + x.quality + ' ' + x.steps + 'st ' + x.sec + 's') : ('FAIL ' + x.err);
      console.log(rid, 'f=' + f, '| plain', fmt(a), '| beam', fmt(b), b.beamExpanded ? '(exp ' + (b.beamExpanded / 1e6).toFixed(1) + 'M)' : '');
    } }
})();
