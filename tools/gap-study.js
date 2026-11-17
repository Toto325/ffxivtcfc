#!/usr/bin/env node
/* 離線「參考答案」實驗：線上預設的集束搜尋 vs 超大集束（接近最佳的參考）。用來量化線上結果離最佳還差多少。
 * 用法：node tools/gap-study.js 配方id,配方id 倍率 寬度清單 [運算量] */
const { makeWorker } = require('./node-worker-host');
(async () => {
  const ids = (process.argv[2] || '5618,37819,36073,35830').split(','), f = +(process.argv[3] || 1.05);
  const widths = (process.argv[4] || '30000,90000').split(',').map(Number), budget = +(process.argv[5] || 4e8);
  const w = makeWorker({ library: false }), R = w.recipes();
  for (const rid of ids) {
    const rec = R[rid], hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const sv = Math.round(rec.suggestedCraftsmanship * f), st = { jobId: rec.jobId, level: 100, craftsmanship: sv, control: Math.round(sv * 0.905), cp: Math.round(17 * Math.pow(sv, 0.35) + 180), excludedActions: ['StellarSteadyHand', 'MaterialMiracle', 'TrainedEye'] };
    const run = async (tag, opt) => { const t = Date.now(); const r = await w.send({ type: 'solve', recipeId: rid, stats: st, options: Object.assign({ strategy: 'beam', lang: 'tw', hqIngredients: hq }, opt) }); const o = r.result; console.log(rid, 'f=' + f, tag.padEnd(12), r.ok ? o.hqPercent + '% q' + o.quality + ' ' + o.steps + 'st' : 'none', ((Date.now() - t) / 1000).toFixed(0) + 's'); };
    await run('online', {});
    await run('big ' + widths.join('/'), { beamWidths: widths, beamMaxExpand: budget, beamRealCapMs: 900000 });
  }
})();
