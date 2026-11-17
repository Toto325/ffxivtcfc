#!/usr/bin/env node
/* 集束搜尋策略的穩健性測試：分層取樣各種配方（專家、不同職業／等級、無品質），每個配方在兩組數值下，
 *   ① 不可丟例外（回傳 null → 以 ok:false 回報是允許的，代表由其他策略負責）
 *   ② 回報的結果必須等於「把那串手法（actionKeys）用 vendor 模擬器重算」的結果（玩家貼進遊戲的巨集一定做得到回報的東西）
 *   ③ 取「plain 與 beam 中較好者」（網站實際的做法）一定 >= plain
 * 用法：node tools/test-beam.js [取樣數] [beamMaxExpand] */
const { makeWorker } = require('./node-worker-host');
(async () => {
  const want = +(process.argv[2] || 14), bme = +(process.argv[3] || 8e6);
  const w = makeWorker({ library: false }), R = w.recipes();
  const all = Object.keys(R).map((id) => Object.assign({ id }, R[id]));
  const LOW = process.argv[4] === 'low'; // 只測 90 級以下（rlvl < 580）
  const pick = []; const take = (arr, n) => { for (let i = 0; i < n && i < arr.length; i++) pick.push(arr[Math.floor((i + 0.5) * arr.length / Math.min(n, arr.length))]); };
  if (!LOW) { take(all.filter((r) => r.isExpert), 3); take(all.filter((r) => !(r.quality > 0)), 2); }
  for (const [lo, hi, n] of (LOW ? [[1, 100, 2], [100, 200, 2], [200, 300, 2], [300, 400, 2], [400, 580, 2]] : [[1, 200, 1], [200, 400, 1], [400, 580, 2], [580, 700, 3], [700, 9999, 3]])) take(all.filter((r) => r.rlvl >= lo && r.rlvl < hi && r.quality > 0 && !r.isExpert), n);
  const seen = new Set(); const sample = pick.filter((r) => !seen.has(r.id) && seen.add(r.id)).slice(0, want);
  const better = (a, b) => a.success !== b.success ? a.success : a.hqPercent !== b.hqPercent ? a.hqPercent > b.hqPercent : Math.min(a.quality, 1e9) !== Math.min(b.quality, 1e9) ? a.quality > b.quality : a.steps < b.steps;
  let issues = 0, beamWins = 0, plainWins = 0, ties = 0, nulls = 0, cells = 0;
  for (const r of sample) {
    const hq = (r.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const S = r.suggestedCraftsmanship > 0 ? r.suggestedCraftsmanship : Math.max(300, 6.5 * r.rlvl);
    const levelMatched = r.rlvl >= 560 ? 100 : (r.rlvl >= 390 ? 90 : (r.rlvl >= 250 ? 80 : (r.rlvl >= 120 ? 60 : 50)));
    for (const [f, level] of (LOW ? [[0.9, 100], [1.1, levelMatched]] : [[0.9, levelMatched], [1.1, levelMatched]])) {
      const sv = Math.round(S * f), st = { jobId: r.jobId, level, craftsmanship: sv, control: Math.round(sv * 0.92), cp: Math.round(17 * Math.pow(sv, 0.35) + 180), specialist: false, excludedActions: ['StellarSteadyHand', 'MaterialMiracle', 'TrainedEye'] };
      cells++;
      const base = { type: 'solve', recipeId: r.id, stats: st };
      const opt = (strategy) => ({ strategy, lang: 'tw', trials: 3, populationSize: 150, generations: 40, hqIngredients: hq, beamMaxExpand: bme });
      let a, b;
      try { a = await w.send(Object.assign({ options: opt('plain') }, base)); b = await w.send(Object.assign({ options: opt('beam') }, base)); } catch (e) { issues++; console.log('EXCEPTION', r.id, f, e.message); continue; }
      if (!a.ok) { issues++; console.log('PLAIN-FAIL', r.id, a.error); continue; }
      if (!b.ok) { nulls++; console.log(r.id, 'rlvl' + r.rlvl, r.isExpert ? 'EXPERT' : '', 'f=' + f, '| beam: none (' + b.error + ') | plain', a.result.success ? a.result.hqPercent + '%' : 'fail'); continue; }
      // ② 巨集重算一致
      const sim = await w.send({ type: 'simulate', recipeId: r.id, stats: st, keys: b.result.actionKeys, hq, safeMode: true });
      const o = sim.result, x = b.result;
      if (o.success !== x.success || o.quality !== x.quality || o.hqPercent !== x.hqPercent || o.steps !== x.steps) { issues++; console.log('MACRO-MISMATCH', r.id, f, 'reported', x.success, x.hqPercent, x.quality, x.steps, 'actual', o.success, o.hqPercent, o.quality, o.steps); }
      const cap = r.quality > 0 ? r.quality : 1e9, norm = (z) => ({ success: z.success, hqPercent: z.hqPercent, quality: Math.min(z.quality, cap), steps: z.steps });
      const A = norm(a.result), B = norm(b.result);
      const v = better(B, A) ? 'BEAM+' : better(A, B) ? 'PLAIN+' : 'tie'; if (v === 'BEAM+') beamWins++; else if (v === 'PLAIN+') plainWins++; else ties++;
      console.log(r.id, 'rlvl' + r.rlvl, r.isExpert ? 'EXPERT' : (r.quality > 0 ? '' : 'noQ'), 'lv' + level, 'f=' + f, '| plain', A.success ? A.hqPercent + '% q' + A.quality + ' ' + A.steps + 'st' : 'fail', '| beam', B.success ? B.hqPercent + '% q' + B.quality + ' ' + B.steps + 'st' : 'fail', '|', v);
    }
  }
  console.log('cells', cells, '| beam better', beamWins, '| plain better', plainWins, '| tie', ties, '| beam none', nulls, '| ISSUES', issues);
  process.exit(issues ? 1 : 0);
})();
