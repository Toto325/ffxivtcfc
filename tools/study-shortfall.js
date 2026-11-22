#!/usr/bin/env node
/* 實驗：「只有某一項數值不足」時，GA 與集束搜尋的表現。基準＝配方建議作業精度的 1.0 倍（加工精度 0.905 倍、CP 依公式），
 * 再分別把 CP ×0.6、加工精度 ×0.7、作業精度 ×0.7。 */
const { makeWorker } = require('./node-worker-host');
(async () => {
  const ids = (process.argv[2] || '5618,36073,34800,5586').split(',');
  const w = makeWorker({ library: false }), R = w.recipes();
  const key = (z) => [z.success ? 1 : 0, z.hqPercent, Math.min(z.quality, 1e9), -z.steps];
  const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; return 0; };
  for (const rid of ids) { const rec = R[rid], hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const sv = Math.round(rec.suggestedCraftsmanship), base = { cs: sv, ct: Math.round(sv * 0.905), cp: Math.round(17 * Math.pow(sv, 0.35) + 180) };
    for (const [tag, m] of [['基準', [1, 1, 1]], ['CP×0.6', [1, 1, 0.6]], ['加工×0.7', [1, 0.7, 1]], ['作業×0.7', [0.7, 1, 1]]]) {
      const st = { jobId: rec.jobId, level: 100, craftsmanship: Math.round(base.cs * m[0]), control: Math.round(base.ct * m[1]), cp: Math.round(base.cp * m[2]), excludedActions: ['StellarSteadyHand', 'MaterialMiracle', 'TrainedEye'] };
      const run = async (o) => { const r = await w.send({ type: 'solve', recipeId: rid, stats: st, options: Object.assign({ lang: 'tw', hqIngredients: hq }, o) }); return r.ok ? r.result : null; };
      const ga = await run({ strategy: 'plain', trials: 3, populationSize: 150, generations: 40 });
      const bm = await run({ strategy: 'beam', beamMaxExpand: 36e6 });
      const f = (z) => z ? (z.success ? z.hqPercent + '% q' + z.quality + ' ' + z.steps + 'st' : '做不完') : '無結果';
      console.log(rid, tag.padEnd(7), JSON.stringify([st.craftsmanship, st.control, st.cp]), '| GA', f(ga), '| beam', f(bm), '|', !bm ? 'GA+' : !ga ? 'BEAM+' : cmp(bm, ga) > 0 ? 'BEAM+' : cmp(ga, bm) > 0 ? 'GA+' : 'tie');
    } }
})();
