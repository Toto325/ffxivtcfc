#!/usr/bin/env node
/* 實驗：集束搜尋的 4 組權重 × 3 種寬度，各自的結果與運算量。用來判斷「只跑最有效的權重／提早停在較窄的寬度」會損失多少。
 * 輸出每個（配方，數值）一行 JSON：每個（寬度，權重）的品質（上限為配方品質）與步數。 */
const { makeWorker } = require('./node-worker-host');
const path = require('path'), fs = require('fs'), vm = require('vm');
(async () => {
  const ids = (process.argv[2] || '5618,37819,36073,35830,34800,5586').split(','), fl = (process.argv[3] || '0.85,1.05').split(',').map(Number);
  const w = makeWorker({ library: false }), cx = w.ctx;
  ['craft-sim-fast.js', 'craft-exact.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), cx, { filename: f }));
  const S = cx.CraftSimFast, E = cx.CraftExact, sim = cx.simulator, R = w.recipes();
  const VARS = [{ dur: 0.6, buff: 0.6 }, { dur: 0.4, buff: 0.4 }, { cp: 0.6 }, { cp: 0.4, dur: 0.6 }], WIDTHS = [2500, 7000, 16000];
  for (const rid of ids) for (const f of fl) {
    const rec = R[rid], hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const sv = Math.round(rec.suggestedCraftsmanship * f), st = { jobId: rec.jobId, level: 100, craftsmanship: sv, control: Math.round(sv * 0.905), cp: Math.round(17 * Math.pow(sv, 0.35) + 180), excludedActions: ['StellarSteadyHand', 'MaterialMiracle', 'TrainedEye'] };
    const craft = cx.buildCraftObject(Object.assign({ id: rid }, rec), {}), cs = cx.buildCrafterStats(st);
    const ctx = S.makeCtx(craft, st, hq, sim.Tables.LEVEL_TABLE[100], cx.allowedActionNames(cs));
    const row = { rid, f, cap: rec.quality, cells: [] };
    for (const wd of WIDTHS) for (let vi = 0; vi < VARS.length; vi++) {
      const r = E.beamSearch(ctx, { beam: wd, variant: VARS[vi] });
      row.cells.push({ w: wd, v: vi, q: r.ids ? Math.min(r.quality, rec.quality) : null, steps: r.ids ? r.steps : null, exp: r.expanded });
    }
    console.log(JSON.stringify(row));
  }
})();
