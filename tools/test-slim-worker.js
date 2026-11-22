#!/usr/bin/env node
/* 驗證 Worker 瘦身：同樣的求解，「附帶單一配方（不載入整份配方庫）」與「Worker 自己載入整份配方庫」的結果必須逐項完全相同。
 * 另外確認瘦身的 Worker 真的沒有載入整份資料，並量記憶體。 */
const vm = require('vm');
const { makeWorker } = require('./node-worker-host');
(async () => {
  const mb = (x) => Math.round(x / 1048576);
  const full = makeWorker({ library: false }), R = full.recipes();           // 完整版（會載入配方庫）
  const slim = makeWorker({ library: false });                                // 瘦身版：不呼叫 recipes()，只靠 msg.recipe
  const ids = ['5618', '37819', '34800', '5586', '36990'];                    // 含專家配方
  let bad = 0, cells = 0;
  for (const rid of ids) {
    const rec = R[rid], hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const sv = Math.round((rec.suggestedCraftsmanship || 3000) * 1.0), st = { jobId: rec.jobId, level: 100, craftsmanship: sv, control: Math.round(sv * 0.9), cp: Math.round(17 * Math.pow(sv, 0.35) + 180), excludedActions: ['StellarSteadyHand', 'MaterialMiracle', 'TrainedEye'] };
    for (const type of ['solve-plain', 'solve-beam', 'simulate', 'frontier']) {
      const base = { type: type.startsWith('solve') ? 'solve' : type, recipeId: rid, stats: st };
      if (base.type === 'solve') base.options = { strategy: type.split('-')[1], lang: 'tw', trials: 3, populationSize: 60, generations: 12, hqIngredients: hq, beamMaxExpand: 2e6, beamWidths: [1500] };
      if (base.type === 'simulate') { base.keys = ['Reflect', 'Innovation', 'PrudentTouch', 'Veneration', 'Groundwork']; base.hq = hq; base.safeMode = true; }
      if (base.type === 'frontier') { Object.assign(base, { ref: { craftsmanship: sv, control: Math.round(sv * 0.9), cp: 600 }, goal: 'full', qGoal: rec.quality, hq, budgetMs: 800, noBeam: true }); }
      const a = await full.send(JSON.parse(JSON.stringify(base)));
      const b = await slim.send(Object.assign(JSON.parse(JSON.stringify(base)), { recipe: R[rid] }));
      const strip = (m) => JSON.stringify(m, (k, v) => (k === 'elapsedMs' || k === 'ms' ? undefined : v));
      cells++;
      if (strip(a) !== strip(b)) { bad++; console.log('DIFF', rid, type); }
    }
  }
  const loaded = vm.runInContext('typeof CRAFT_RECIPES', slim.ctx);
  console.log('比對', cells, '組（solve plain／beam、simulate、frontier，含專家配方）| 不同', bad, '| 瘦身 Worker 載入整份配方庫了嗎？', loaded === 'undefined' ? '沒有（正確）' : '有（錯誤）');
  process.exit(bad || loaded !== 'undefined' ? 1 : 0);
})();
