#!/usr/bin/env node
/* 比較：現有純 GA（plain）vs 集束搜尋（4 組權重取最好）vs 兩者取最好（＝網站實際會採用的「只會更好」結果）
 * 排序：成功 > 優質率 > 品質 > 步數。用法：node tools/compare-exact.js 配方id,配方id 倍率,倍率 [beam寬度] */
const { makeWorker } = require('./node-worker-host');
const path = require('path'), fs = require('fs'), vm = require('vm');
(async () => {
  const ids = (process.argv[2] || '5618,37819,36073,35830,34800,5586').split(','), fl = (process.argv[3] || '0.85,1.05').split(',').map(Number), beam = +(process.argv[4] || 5000);
  const w = makeWorker({ library: false }), cx = w.ctx;
  ['craft-sim-fast.js', 'craft-exact.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), cx, { filename: f }));
  const S = cx.CraftSimFast, E = cx.CraftExact, sim = cx.simulator, R = w.recipes();
  const better = (a, b) => !b || (a.success !== b.success ? a.success : a.hq !== b.hq ? a.hq > b.hq : a.q !== b.q ? a.q > b.q : a.steps < b.steps);
  let win = 0, tie = 0, loss = 0, cells = 0;
  for (const rid of ids) {
    const rec = R[rid]; if (!rec) continue;
    const hq = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    for (const f of fl) {
      const sv = Math.round(rec.suggestedCraftsmanship * f), cpF = (s) => 17 * Math.pow(s, 0.35) + 180;
      const st = { jobId: rec.jobId, level: 100, craftsmanship: sv, control: Math.round(sv * 0.905), cp: Math.round(cpF(sv)), specialist: false, relicTool: false, excludedActions: ['StellarSteadyHand', 'MaterialMiracle', 'TrainedEye'] };
      const pl = await w.send({ type: 'solve', recipeId: rid, stats: st, options: { strategy: 'plain', lang: 'tw', trials: 3, populationSize: 150, generations: 40, hqIngredients: hq, fixedPrefix: [] } });
      const A = { success: pl.result.success, hq: pl.result.hqPercent, q: pl.result.quality, steps: pl.result.steps };
      const craft = cx.buildCraftObject(Object.assign({ id: rid }, rec), {}), cs = cx.buildCrafterStats(st);
      const ctx = S.makeCtx(craft, st, hq, sim.Tables.LEVEL_TABLE[100], cx.allowedActionNames(cs));
      let B = null; const t = Date.now();
      for (const v of [{ dur: 0.6, buff: 0.6 }, { cp: 0.6 }, { dur: 0.4, buff: 0.4 }, { cp: 0.4, dur: 0.6 }]) {
        const r = E.beamSearch(ctx, { beam, variant: v, seeds: [] }); if (!r.ids) continue;
        const keys = r.ids.map((i) => S.ACTIONS[i].name);
        const o = (await w.send({ type: 'simulate', recipeId: rid, stats: st, keys, hq, safeMode: true })).result;
        const c = { success: o.success, hq: o.hqPercent, q: o.quality, steps: o.steps };
        if (better(c, B)) B = c;
      }
      const bs = ((Date.now() - t) / 1000).toFixed(0);
      const verdict = !B ? 'beam-none' : better(B, A) ? 'BEAM+' : better(A, B) ? 'GA+' : 'tie';
      cells++; if (verdict === 'BEAM+') win++; else if (verdict === 'GA+') loss++; else tie++;
      console.log(rid, 'f=' + f, '| GA', A.hq + '%', A.q, A.steps + 'st', '| beam', B ? B.hq + '%' : '-', B ? B.q : '-', B ? B.steps + 'st' : '', bs + 's', '|', verdict);
    }
  }
  console.log('beam better', win, '| tie', tie, '| GA better', loss, '| cells', cells, '(兩者取最好 = 永遠 >= GA)');
})();
