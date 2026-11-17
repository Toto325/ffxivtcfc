#!/usr/bin/env node
/* 三條策略平行的基準（可重現）：獨立流程（＝原本的做法）、手法庫流程、階梯優先流程，各自單獨跑，
 * 再依網站的做法合併：取最好的結果；時間＝「第一個做到滿品質的策略的時間」，都沒滿品質就是最慢那條的時間。
 * 時間用虛擬時鐘（跟真實時間大致相符，但不受電腦忙閒影響）。
 * 用法：node tools/bench-strategies.js [配方id,...] [輸出json] [數值倍率,...] [偏移,...] */
const fs = require('fs'), vm = require('vm');
const { makeWorker } = require('./node-worker-host');
(async () => {
  const ids = (process.argv[2] || '5586,5597,5592').split(','), out = process.argv[3] || '/tmp/bench-strategies.json';
  const wNo = makeWorker({ library: false }), wLib = makeWorker();
  await wLib.send({ type: 'simulate', recipeId: ids[0], stats: { jobId: 7, level: 100, craftsmanship: 3000, control: 3000, cp: 500 }, keys: [] });
  const vms = (w) => vm.runInContext('CraftClock.virtualMs()', w.ctx);
  const R = wNo.recipes(); const rows = [];
  const run = async (w, rid, st, opt, strategy) => {
    const v0 = vms(w); const r = await w.send({ type: 'solve', recipeId: rid, stats: st, options: Object.assign({}, opt, { strategy }) });
    return { hq: r.result.hqPercent, q: r.result.quality, steps: r.result.steps, t: (vms(w) - v0) / 1000, full: r.result.hqPercent >= 100 };
  };
  for (const rid of ids) {
    const rec = R[rid]; const hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const f = await wNo.send({ type: 'frontier', recipeId: rid, stats: { jobId: rec.jobId, level: 100 }, ref: { craftsmanship: 3300, control: 3000, cp: 420 }, goal: 'full', qGoal: rec.quality, hq, budgetMs: 4500, seed: 1 });
    const N = f.result.cands[0].need;
    const SCALES = (process.argv[4] || '0.62,0.7,0.78,0.85,0.92').split(',').map(Number), OFFS = (process.argv[5] || '0,3').split(',').map(Number);
    for (const sc of SCALES) for (const off of OFFS) {
      const st = { jobId: rec.jobId, level: 100, craftsmanship: Math.round(N.craftsmanship * sc) + off, control: Math.round(N.control * sc) + off, cp: Math.round(N.cp * sc) };
      const opt = { lang: 'tw', trials: 3, populationSize: 150, generations: 40, hqIngredients: hq, fixedPrefix: [] };
      const P = await run(wNo, rid, st, opt, 'plain'), L = await run(wLib, rid, st, opt, 'lib'), D = await run(wLib, rid, st, opt, 'ladder');
      const all = [P, L, D]; const best = all.reduce((a, b) => (b.hq > a.hq || (b.hq === a.hq && b.q > a.q)) ? b : a);
      const fullOnes = all.filter((x) => x.full); const tFinal = fullOnes.length ? Math.min(...fullOnes.map((x) => x.t)) : Math.max(...all.map((x) => x.t));
      const row = { rid, sc, off, P, L, D, finalHq: best.hq, tFinal, tPlain: P.t };
      rows.push(row); fs.writeFileSync(out, JSON.stringify(rows));
      console.log(rid, 'x' + sc, 'off' + off, '| plain', P.hq + '%/' + P.t.toFixed(0) + 's', '| lib', L.hq + '%/' + L.t.toFixed(0) + 's', '| ladder', D.hq + '%/' + D.t.toFixed(0) + 's', '=> final', best.hq + '%/' + tFinal.toFixed(0) + 's', best.hq < P.hq ? ' <-- WORSE' : '', tFinal > P.t ? ' <-- SLOWER' : '');
    }
  }
  const n = rows.length, avg = (f) => (rows.reduce((s, r) => s + f(r), 0) / n).toFixed(1);
  console.log('SUMMARY avg hq: plain(=original)', avg((r) => r.P.hq) + '% -> final', avg((r) => r.finalHq) + '% | avg time: plain', avg((r) => r.tPlain) + 's -> final', avg((r) => r.tFinal) + 's | worse', rows.filter((r) => r.finalHq < r.P.hq).length + '/' + n, '| slower', rows.filter((r) => r.tFinal > r.tPlain + 0.5).length + '/' + n);
})();
