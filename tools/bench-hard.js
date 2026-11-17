#!/usr/bin/env node
/* 困難情況基準（可重現）：數值不足、做不到滿品質時，比較「原本的做法」與「完整做法（手法庫＋放寬收緊＋品質階梯）」。
 * 結果可重現（虛擬時鐘），所以任何「完整做法比原本差」的案例都能原樣重現、逐一分析。
 * 用法：node tools/bench-hard.js [配方id,...] [輸出json]（預設 5586,5597,5592 → /tmp/bench-hard.json） */
const fs = require('fs');
const { makeWorker } = require('./node-worker-host');
(async () => {
  const ids = (process.argv[2] || '5586,5597,5592').split(','), out = process.argv[3] || '/tmp/bench-hard.json';
  const wNo = makeWorker({ library: false }), wLib = makeWorker();
  await wLib.send({ type: 'simulate', recipeId: ids[0], stats: { jobId: 7, level: 100, craftsmanship: 3000, control: 3000, cp: 500 }, keys: [] });
  const R = wNo.recipes(); const rows = [];
  for (const rid of ids) {
    const rec = R[rid]; const hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const f = await wNo.send({ type: 'frontier', recipeId: rid, stats: { jobId: rec.jobId, level: 100 }, ref: { craftsmanship: 3300, control: 3000, cp: 420 }, goal: 'full', qGoal: rec.quality, hq, budgetMs: 4500, seed: 1 });
    const N = f.result.cands[0].need;
    for (const sc of [0.62, 0.7, 0.78, 0.85, 0.92]) for (const off of [0, 3]) {
      const st = { jobId: rec.jobId, level: 100, craftsmanship: Math.round(N.craftsmanship * sc) + off, control: Math.round(N.control * sc) + off, cp: Math.round(N.cp * sc) };
      const opt = { lang: 'tw', trials: 3, populationSize: 150, generations: 40, hqIngredients: hq, fixedPrefix: [] };
      const ta = Date.now(); const a = await wNo.send({ type: 'solve', recipeId: rid, stats: st, options: Object.assign({}, opt, { relaxTighten: false, qualityLadder: false }) });
      const tA = (Date.now() - ta) / 1000; const tc = Date.now(); const c = await wLib.send({ type: 'solve', recipeId: rid, stats: st, options: opt }); const tC = (Date.now() - tc) / 1000;
      const row = { rid, sc, off, tA, tC, stats: st, A: { hq: a.result.hqPercent, q: a.result.quality, steps: a.result.steps, keys: a.result.actionKeys }, C: { hq: c.result.hqPercent, q: c.result.quality, steps: c.result.steps, keys: c.result.actionKeys } };
      rows.push(row); fs.writeFileSync(out, JSON.stringify(rows));
      console.log(rid, 'x' + sc, 'off' + off, 'A:', row.A.hq + '%', 'C:', row.C.hq + '%', row.C.hq < row.A.hq ? '  <-- WORSE' : '', '(' + tA.toFixed(0) + 's vs ' + tC.toFixed(0) + 's)');
    }
  }
  const worse = rows.filter((r) => r.C.hq < r.A.hq).length, avg = (k) => (rows.reduce((s, r) => s + r[k].hq, 0) / rows.length).toFixed(1);
  console.log('SUMMARY avg A', avg('A') + '% | avg C', avg('C') + '% | C worse than A in', worse + '/' + rows.length, '| avg time A', (rows.reduce((x, r) => x + r.tA, 0) / rows.length).toFixed(1) + 's, C', (rows.reduce((x, r) => x + r.tC, 0) / rows.length).toFixed(1) + 's (序列執行；網站是兩個 Worker 平行)');
})();
