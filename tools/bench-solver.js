#!/usr/bin/env node
/* 求解測試基準：在 Node 裡用跟網站相同的求解程式，量「滿品質成功率」與「耗時」，改動求解邏輯前後各跑一次就能客觀比較。
 * 做法：先用不含手法庫的獨立搜尋，找出「已確認做得到滿品質」的數值，再用這些數值（+0%、+3%、+10%）分別求解，
 *       比較「沒有手法庫」與「有手法庫」兩種情況（交替順序，避免後跑的因為程式預熱佔便宜）。
 * 用法：node tools/bench-solver.js [配方id,配方id,...]（預設 5586,5597,5592） */
const { makeWorker } = require('./node-worker-host');
(async () => {
  const ids = (process.argv[2] || '5586,5597,5592').split(',');
  const wNo = makeWorker({ library: false }), wLib = makeWorker();
  await wLib.send({ type: 'simulate', recipeId: ids[0], stats: { jobId: 7, level: 100, craftsmanship: 3000, control: 3000, cp: 500 }, keys: [] }); // 等手法庫載入
  const R = wNo.recipes(); const tot = { no: { full: 0, n: 0, t: 0 }, lib: { full: 0, n: 0, t: 0 } };
  for (const rid of ids) {
    const rec = R[rid]; const hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const f = await wNo.send({ type: 'frontier', recipeId: rid, stats: { jobId: rec.jobId, level: 100 }, ref: { craftsmanship: 3300, control: 3000, cp: 420 }, goal: 'full', qGoal: rec.quality, hq, budgetMs: 4500, seed: 1 });
    const N = f.result.cands[0].need; console.log('recipe', rid, 'verified-feasible need', JSON.stringify(N));
    for (const m of [0, 0.03, 0.10]) for (let rep = 0; rep < 2; rep++) {
      const st = { jobId: rec.jobId, level: 100, craftsmanship: Math.ceil(N.craftsmanship * (1 + m)) + rep * 3, control: Math.ceil(N.control * (1 + m)) + rep, cp: Math.ceil(N.cp * (1 + m)) };
      const row = []; const order = rep % 2 === 0 ? [['no', wNo], ['lib', wLib]] : [['lib', wLib], ['no', wNo]];
      for (const [k, w] of order) {
        const t = Date.now();
        const r = await w.send({ type: 'solve', recipeId: rid, stats: st, options: { lang: 'tw', trials: 3, populationSize: 150, generations: 40, hqIngredients: hq, fixedPrefix: [] } });
        const dt = (Date.now() - t) / 1000, full = r.result.quality >= rec.quality; tot[k].n++; tot[k].t += dt; if (full) tot[k].full++;
        row.push(k + ':' + (full ? 'FULL' : 'hq' + r.result.hqPercent) + '(' + dt.toFixed(1) + 's,' + r.result.steps + ' steps)');
      }
      console.log('  ' + rid + ' +' + (m * 100) + '% rep' + rep + ': ' + row.join('  '));
    }
  }
  console.log('SUMMARY no-library: full ' + tot.no.full + '/' + tot.no.n + ' avg ' + (tot.no.t / tot.no.n).toFixed(1) + 's | with library: full ' + tot.lib.full + '/' + tot.lib.n + ' avg ' + (tot.lib.t / tot.lib.n).toFixed(1) + 's');
})();
