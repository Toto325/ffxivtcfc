#!/usr/bin/env node
/* 實驗：GA 在「GA 與集束搜尋取最好」裡還貢獻多少？把 GA 縮短到約 1/4 運算量，聯合結果會損失多少？ */
const { makeWorker } = require('./node-worker-host');
(async () => {
  const ids = (process.argv[2] || '5618,37819,36073,35830,34800,5586,5935,36990').split(','), fl = (process.argv[3] || '0.9,1.1').split(',').map(Number);
  const w = makeWorker({ library: false }), R = w.recipes();
  const key = (z) => [z.success ? 1 : 0, z.hqPercent, Math.min(z.quality, 1e9), -z.steps];
  const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; return 0; };
  const pickBest = (arr) => arr.filter(Boolean).reduce((m, z) => (!m || cmp(z, m) > 0 ? z : m), null);
  let rows = 0, gaWins = 0, gaQuarterLoss = 0, gaQuarterLossAmt = [];
  for (const rid of ids) { const rec = R[rid]; if (!rec) continue;
    const hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    for (const f of fl) {
      const sv = Math.round((rec.suggestedCraftsmanship || 3000) * f), st = { jobId: rec.jobId, level: 100, craftsmanship: sv, control: Math.round(sv * 0.905), cp: Math.round(17 * Math.pow(sv, 0.35) + 180), excludedActions: ['StellarSteadyHand', 'MaterialMiracle', 'TrainedEye'] };
      const run = async (o) => { const r = await w.send({ type: 'solve', recipeId: rid, stats: st, options: Object.assign({ lang: 'tw', hqIngredients: hq }, o) }); return r.ok ? r.result : null; };
      const gaFull = await run({ strategy: 'plain', trials: 3, populationSize: 150, generations: 40 });
      const gaQ = await run({ strategy: 'plain', trials: 1, populationSize: 75, generations: 20 });
      const bm = await run({ strategy: 'beam', beamMaxExpand: 36e6 });
      const uFull = pickBest([gaFull, bm]), uQ = pickBest([gaQ, bm]);
      rows++; if (gaFull && bm && cmp(gaFull, bm) > 0) gaWins++;
      const lossQ = uFull && uQ && cmp(uFull, uQ) > 0; if (lossQ) { gaQuarterLoss++; gaQuarterLossAmt.push(uFull.quality - uQ.quality); }
      console.log(rid, 'f=' + f, '| GA全', gaFull && gaFull.hqPercent + '% q' + gaFull.quality, '| GA¼', gaQ && gaQ.hqPercent + '% q' + gaQ.quality, '| beam', bm && bm.hqPercent + '% q' + bm.quality, '| 聯合(全GA)', uFull && uFull.hqPercent + '% q' + uFull.quality, '| 聯合(¼GA)', uQ && uQ.hqPercent + '% q' + uQ.quality, lossQ ? ' <- ¼GA 較差' : '');
    } }
  console.log('組數', rows, '| GA(全)勝過 beam', gaWins, '| 縮短 GA 後聯合結果變差', gaQuarterLoss, gaQuarterLossAmt.join(','));
})();
