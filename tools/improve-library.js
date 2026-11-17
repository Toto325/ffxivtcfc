#!/usr/bin/env node
/* 手法庫自我改進迴圈：找出「手法庫裡最好的手法，不如求解實際找到的結果」的情況，把更好的手法補進庫當新的踏腳石。
 *
 * 做法（每種配方形狀、一批訓練數值）：
 *   1. 在訓練數值下，先算「庫裡現成最好的手法」做到多少品質（確定性模擬）。
 *   2. 用完整求解（含手法庫）與「完全不帶手法庫的獨立求解」各跑一次（結果可重現）。
 *   3. 任何一個結果比「庫裡現成最好的」更好，就代表庫在這種情況有缺口——把那套手法補進庫。
 * 訓練數值涵蓋不同強度、不同的加工／CP 取向（不只集中在設計者比例附近）。
 * 可重複執行；補進去的手法會出現在下一輪的「庫裡現成最好的」裡，缺口越來越少。
 * 用法：node tools/improve-library.js [配方id,...] [--scales 0.6,0.72,0.84] */
const fs = require('fs'), path = require('path');
const { makeWorker } = require('./node-worker-host');
const LIB = path.resolve(__dirname, '..', 'data', 'craft-rotation-library.json');
(async () => {
  const ids = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '5586,5597,5592').split(',');
  const si = process.argv.indexOf('--scales'); const scales = (si > 0 ? process.argv[si + 1] : '0.6,0.72,0.84').split(',').map(Number);
  const wNo = makeWorker({ library: false }), wLib = makeWorker();
  await wLib.send({ type: 'simulate', recipeId: ids[0], stats: { jobId: 7, level: 100, craftsmanship: 3000, control: 3000, cp: 500 }, keys: [] });
  const R = wNo.recipes();
  const lib = JSON.parse(fs.readFileSync(LIB, 'utf8'));
  let added = 0, gaps = 0, cases = 0; const seenShape = new Set();
  for (const rid of ids) {
    const rec = R[rid]; const shape = wNo.shapeKeyOf(rec); if (seenShape.has(shape)) continue; seenShape.add(shape);
    const hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const f = await wNo.send({ type: 'frontier', recipeId: rid, stats: { jobId: rec.jobId, level: 100 }, ref: { craftsmanship: 3300, control: 3000, cp: 420 }, goal: 'full', qGoal: rec.quality, hq, budgetMs: 4500, seed: 1 });
    const N = f.result.cands[0].need;
    for (const sc of scales) for (const [ctv, cpv] of [[1.0, 1.0], [0.85, 1.05], [1.1, 0.92]]) {
      const st = { jobId: rec.jobId, level: 100, craftsmanship: Math.round(N.craftsmanship * sc), control: Math.round(N.control * sc * ctv), cp: Math.round(N.cp * sc * cpv) };
      const keysList = (lib.shapes[shape] || []).map((r) => r.map((i) => lib.actions[i]));
      const ev = await wLib.send({ type: 'evalmany', recipeId: rid, stats: st, hq, keysList });
      const libBest = Math.max(0, ...ev.result.filter(Boolean).map((e) => (e.success ? e.quality : 0)));
      const opt = { lang: 'tw', trials: 3, populationSize: 150, generations: 40, hqIngredients: hq, fixedPrefix: [] };
      const a = await wNo.send({ type: 'solve', recipeId: rid, stats: st, options: opt });          // 不帶庫的獨立求解
      const c = await wLib.send({ type: 'solve', recipeId: rid, stats: st, options: opt });         // 完整求解
      cases++;
      const cand = [a, c].filter((r) => r.ok && r.result.success && r.result.quality > libBest + 1);
      if (cand.length) gaps++;
      cand.forEach((r) => {
        const keys = r.result.actionKeys; const sig = keys.join(',');
        if (!lib.shapes[shape].some((x) => x.map((i) => lib.actions[i]).join(',') === sig)) {
          const enc = keys.map((k) => { let i = lib.actions.indexOf(k); if (i < 0) { i = lib.actions.length; lib.actions.push(k); } return i; });
          lib.shapes[shape].push(enc); added++;
        }
      });
      console.log(rid, 'x' + sc, 'ct' + ctv, 'cp' + cpv, 'library-best quality', libBest, '| solve', Math.max(a.result.quality, c.result.quality), cand.length ? '  -> gap, added' : '');
      fs.writeFileSync(LIB, JSON.stringify(lib));
    }
  }
  console.log('cases', cases, 'gaps', gaps, 'rotations added', added);
})();
