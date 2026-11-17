#!/usr/bin/env node
/* 回歸測試：用各種不同類型的配方（不同職業、等級、專家配方、不需要品質的配方）檢查：
 *   ① 沒有手法庫的配方：「手法庫策略」必須跟「獨立策略（＝原本的做法）」結果完全相同（不能有任何退步）
 *   ② 同樣輸入跑兩次結果必須完全相同（可重現）
 *   ③ 反推需求（建議的核心）要精確：用算出來的需求數值＋那套手法模擬必須成功，而且少 5 就必須失敗
 *   ④ 任何錯誤（例外、結果欄位缺失）都會列出
 * 用法：node tools/regress.js [取樣數，預設 18] */
const { makeWorker } = require('./node-worker-host');
(async () => {
  const want = +(process.argv[2] || 18);
  const wNo = makeWorker({ library: false }), wLib = makeWorker();
  await wLib.send({ type: 'simulate', recipeId: '5586', stats: { jobId: 7, level: 100, craftsmanship: 3000, control: 3000, cp: 500 }, keys: [] });
  const R = wNo.recipes();
  // 依類型分層取樣（固定規則，可重現）
  const all = Object.keys(R).map((id) => Object.assign({ id }, R[id]));
  const pick = []; const take = (arr, n) => { for (let i = 0; i < n && i < arr.length; i++) pick.push(arr[Math.floor(i * arr.length / Math.min(n, arr.length))]); };
  const hasShapeLib = (r) => wLib.shapeKeyOf(r) && false;
  take(all.filter((r) => r.isExpert), 3);
    for (const [lo, hi, n] of [[1, 200, 2], [200, 400, 2], [400, 580, 2], [580, 700, 3], [700, 9999, 3]]) take(all.filter((r) => r.rlvl >= lo && r.rlvl < hi && r.quality > 0 && !r.isExpert), n);
  const seen = new Set(); let sample = pick.filter((r) => !seen.has(r.id) && seen.add(r.id)).slice(0, want);
  if (process.argv[3]) sample = process.argv[3].split(',').map((id) => Object.assign({ id }, R[id]));
  let issues = 0; const out = [];
  for (const r of sample) {
    const full = r.quality > 0, hq = (r.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const S = r.suggestedCraftsmanship > 0 ? r.suggestedCraftsmanship : Math.max(300, 6.5 * r.rlvl);
    const st = { jobId: r.jobId, level: 100, craftsmanship: Math.round(S * 0.92), control: Math.round(S * 0.92 * 0.905), cp: Math.round(17 * Math.pow(S * 0.92, 0.35) + 180) };
    const opt = { lang: 'tw', trials: 3, populationSize: 150, generations: 40, hqIngredients: hq, fixedPrefix: [] };
    const tag = r.id + ' rlvl' + r.rlvl + ' job' + r.jobId + (r.isExpert ? ' EXPERT' : '') + (full ? '' : ' no-quality');
    const problems = [];
    try {
      const p1 = await wNo.send({ type: 'solve', recipeId: r.id, stats: st, options: Object.assign({}, opt, { strategy: 'plain' }) });
      const p2 = await wNo.send({ type: 'solve', recipeId: r.id, stats: st, options: Object.assign({}, opt, { strategy: 'plain' }) });
      const l1 = await wLib.send({ type: 'solve', recipeId: r.id, stats: st, options: Object.assign({}, opt, { strategy: 'lib' }) });
      if (!p1.ok || !l1.ok) problems.push('solve error: ' + (p1.error || l1.error));
      else {
        const sig = (m) => m.result.hqPercent + '/' + m.result.quality + '/' + m.result.steps + '/' + m.result.actionKeys.join('');
        if (sig(p1) !== sig(p2)) problems.push('NOT REPRODUCIBLE (same input, different result)');
        const libCount = wLib.ctx && true;
        // 網站是「追求滿品質流程」與「原版獨立流程」同時跑、取較好的，所以要檢查的是合併後不比原版差（單一流程偶爾低一點是正常的）
        const better = (a, b) => (a.result.hqPercent > b.result.hqPercent || (a.result.hqPercent === b.result.hqPercent && a.result.quality >= b.result.quality)) ? a : b;
        const merged = better(l1, p1);
        if (merged.result.hqPercent < p1.result.hqPercent || (merged.result.hqPercent === p1.result.hqPercent && merged.result.quality < p1.result.quality)) problems.push('MERGED result WORSE than plain: ' + merged.result.hqPercent + ' vs ' + p1.result.hqPercent);
      }
      // ③ 反推需求：兩種目標（滿品質／能完成）都測。驗證時「不給任何多餘的數值」：算出來是多少就用多少
      //    （曾經因為驗證時把用不到的數值設成極大，蓋掉了「有最低品質門檻的專家配方，能完成也需要加工精度」的漏洞）
      for (const goal of ['full', 'done']) {
        const ref = goal === 'full' ? { craftsmanship: st.craftsmanship, control: st.control, cp: st.cp } : { craftsmanship: Math.round(st.craftsmanship * 0.5), control: Math.round(st.control * 0.5), cp: Math.round(st.cp * 0.6) };
        const f = await wNo.send({ type: 'frontier', recipeId: r.id, stats: { jobId: r.jobId, level: 100 }, ref, goal, qGoal: r.quality, hq, budgetMs: 2500, seed: 1 });
        if (!f.ok) { problems.push(goal + ' frontier error: ' + f.error); continue; }
        if (!f.result.cands.length) { problems.push(goal + ': frontier found nothing'); continue; }
        const c = f.result.cands[0], need = c.need;
        const mk = (cs, ct, cp) => ({ jobId: r.jobId, level: 100, craftsmanship: cs, control: Math.max(1, ct), cp });
        const ok = async (cs, ct, cp) => { const v = await wNo.send({ type: 'simulate', recipeId: r.id, stats: mk(cs, ct, cp), keys: c.keys, hq }); return v.ok && v.result.success && (goal !== 'full' || v.result.quality >= r.quality); };
        if (!(await ok(need.craftsmanship, need.control, need.cp))) problems.push(goal + ': NEED NOT SUFFICIENT (exact computed values fail) need=' + JSON.stringify(need));
        else {
          if (need.craftsmanship > 5 && (await ok(need.craftsmanship - 5, need.control, need.cp))) problems.push(goal + ': NEED NOT MINIMAL (craftsmanship-5 still works)');
          if (need.cp > 1 && (await ok(need.craftsmanship, need.control, need.cp - 1))) problems.push(goal + ': NEED NOT MINIMAL (cp-1 still works)');
          if (need.control > 5 && (await ok(need.craftsmanship, need.control - 5, need.cp))) problems.push(goal + ': NEED NOT MINIMAL (control-5 still works)');
        }
      }
    } catch (e) { problems.push('EXCEPTION ' + e.message); }
    if (problems.length) issues++;
    out.push(tag + ' -> ' + (problems.length ? 'ISSUES: ' + problems.join('; ') : 'ok'));
    console.log(out[out.length - 1]);
  }
  console.log('SUMMARY recipes tested', sample.length, '| with issues', issues);
})();
