#!/usr/bin/env node
/* 離線產生「手法庫」data/craft-rotation-library.json
 *
 * 每種「配方形狀」（耐久、進度、品質、各種係數…相同的配方，模擬結果完全一樣）各自搜尋一批互不被壓過的手法：
 *   ・用設計者比例（作業：加工 ≈ 1：0.905，CP ≈ 17×作業^0.35 + 180）在不同強度下當參考，各跑一輪反推需求搜尋
 *   ・沒有 HQ 材料與全 HQ 材料兩種起始品質各算一次（起始品質不同，最適合的手法也不同）
 *   ・前一輪找到的手法會當下一輪的種子，所以越跑越好，也可以重複執行來持續改進（已有的手法會保留）
 * 只存技能序列，不存任何玩家數值；網站載入後會用模擬精確反推每套手法需要的數值。
 *
 * 集束搜尋（strategy:'beam'，見 js/craft-exact.js）也會在每個參考點各跑一次當候選來源：離線可以給它很大的運算量與更寬的集束（--beam-budget、--beam-widths），
 * 找到的手法跟遺傳演算法找到的一起進入「互不被壓過」的篩選，所以庫只會更好。--beam-budget 0 可關閉。
 * 用法：node tools/build-rotation-library.js [--min-rlvl 580] [--max-rlvl 99999] [--budget 6000] [--beam-budget 60000000] [--beam-widths 4000,12000,30000] [--shard 0/4] [--only 5586,5597] [--out data/craft-rotation-library.json]
 *       node tools/build-rotation-library.js --merge a.json b.json ... --out data/craft-rotation-library.json */
const fs = require('fs'), path = require('path');
const { makeWorker } = require('./node-worker-host');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const DIVERSE = +opt('diverse', 0);
const EXTRA_CP = String(opt('extra-cp', '')).split(',').filter(Boolean).map(Number);
const BEAM_BUDGET = +opt('beam-budget', 60e6), BEAM_WIDTHS = String(opt('beam-widths', '4000,12000,30000')).split(',').map(Number);
const OUT = path.resolve(opt('out', path.join(__dirname, '..', 'data', 'craft-rotation-library.json')));

function load(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { v: 1, actions: [], shapes: {} }; } }
function encode(lib, shapes) { // 技能名稱改成編號，檔案小很多
  const idx = new Map(lib.actions.map((a, i) => [a, i]));
  const enc = (keys) => keys.map((k) => { if (!idx.has(k)) { idx.set(k, lib.actions.length); lib.actions.push(k); } return idx.get(k); });
  Object.keys(shapes).forEach((k) => { lib.shapes[k] = shapes[k].map(enc); });
}
function decodeAll(lib) { const out = {}; Object.keys(lib.shapes).forEach((k) => { out[k] = lib.shapes[k].map((r) => r.map((i) => lib.actions[i])); }); return out; }

if (args.includes('--merge')) {
  const files = args.slice(args.indexOf('--merge') + 1).filter((a) => !a.startsWith('--') && a !== OUT && fs.existsSync(a));
  const merged = { v: 1, actions: [], shapes: {} }; const all = {};
  files.concat(fs.existsSync(OUT) ? [OUT] : []).forEach((f) => { const d = decodeAll(load(f)); Object.keys(d).forEach((k) => { all[k] = (all[k] || []).concat(d[k]); }); });
  Object.keys(all).forEach((k) => { const seen = new Set(); all[k] = all[k].filter((r) => { const s = r.join(','); if (seen.has(s)) return false; seen.add(s); return true; }); });
  encode(merged, all); fs.writeFileSync(OUT, JSON.stringify(merged)); console.log('merged', Object.keys(all).length, 'shapes ->', OUT); process.exit(0);
}

(async () => {
  const EXTRA_EX = String(opt('exclude', '')).split(',').filter(Boolean); // 例如 --exclude Manipulation：在「玩家沒學會操作」的條件下建庫（手法不能用這些技能）
  const w = makeWorker({ library: false, extraExcluded: EXTRA_EX });
  const ALSO_EX = String(opt('also-exclude', '')).split(',').filter(Boolean); // 例如 --also-exclude Manipulation：每個參考點另外再用「沒學會這些技能」的條件各找一次（玩家勾掉操作時庫才有手法可用）
  const w2 = ALSO_EX.length ? makeWorker({ library: false, extraExcluded: EXTRA_EX.concat(ALSO_EX) }) : null;
  const R = w.recipes();
  const minRlvl = +opt('min-rlvl', 580), maxRlvl = +opt('max-rlvl', 99999), budget = +opt('budget', 6000);
  const [si, sn] = String(opt('shard', '0/1')).split('/').map(Number);
  const beamOnly = args.includes('--beam-only'); // 快速模式：只用集束搜尋在一組參考數值點產生手法（不跑遺傳演算法與反推），每個形狀約 1～2 分鐘
  const limit = +opt('limit', 0), maxMinutes = +opt('max-minutes', 0), startedAt = Date.now(); // limit：只處理每個分片的前 N 個形狀（測試用）；max-minutes：超過就不再開始新的形狀（避免被 GitHub 的時限強制中斷）
  const only = opt('only', null) ? String(opt('only')).split(',') : null;
  // 依形狀分組，挑代表配方：HQ 材料最多的一個（算「全 HQ」起始品質）與完全沒有 HQ 的設定
  const shapes = new Map();
  Object.keys(R).forEach((id) => {
    const r = R[id]; if (r.rlvl < minRlvl || r.rlvl > maxRlvl || !(r.quality > 0)) return;
    const k = w.shapeKeyOf(r); const hqSum = (r.ingredients || []).filter((i) => i.quality > 0).reduce((s, i) => s + i.amount * i.quality, 0);
    const cur = shapes.get(k); if (!cur) shapes.set(k, { id, hqSum, rec: r, count: 1 }); else { cur.count++; if (hqSum > cur.hqSum) { cur.id = id; cur.hqSum = hqSum; cur.rec = r; } }
  });
  // 常見的形狀（涵蓋比較多配方）優先處理：中途停掉也已經涵蓋最多的配方（前 20 個形狀涵蓋約 43%、前 40 個約 59% 的 90 級以上配方）
  let keys = Array.from(shapes.keys()).sort((a, b) => shapes.get(b).count - shapes.get(a).count || (a < b ? -1 : 1));
  if (only) { const want = new Set(only.map((id) => R[id] && w.shapeKeyOf(R[id])).filter(Boolean)); keys = keys.filter((k) => want.has(k)); } // --only 指定的是配方 id，實際比對的是它的「形狀」
  keys = keys.filter((_, i) => i % sn === si);
  if (limit > 0) keys = keys.slice(0, limit);
  const lib = load(OUT); const existing = decodeAll(lib); const result = {};
  console.log('shapes to process:', keys.length, '(shard', si + '/' + sn + ', budget', budget, 'ms per search)');
  let okCount = 0, failCount = 0;
  for (const k of keys) {
    if (maxMinutes > 0 && (Date.now() - startedAt) / 60000 > maxMinutes) { console.log('已達時間上限 ' + maxMinutes + ' 分鐘，剩下的形狀留到下一次執行'); break; }
    const { id, rec } = shapes.get(k);
    try {
    const hqAll = (rec.ingredients || []).filter((i) => i.quality > 0).map((i) => ({ id: i.id, amount: i.amount }));
    const variants = [[]].concat(hqAll.length ? [hqAll] : []);
    const S0 = rec.suggestedCraftsmanship > 0 ? rec.suggestedCraftsmanship : Math.max(400, 6.5 * rec.rlvl);
    /* 專家配方（隨機狀態、有最低品質門檻）的需求跟一般配方很不一樣：實測加工精度約為作業精度的 0.74 倍（一般是 0.9），
     * CP 約是一般比例公式的 2 倍以上（例如作業 4215 時需要 CP 1124，公式只有約 510）。如果沿用一般配方的參考點，
     * 搜尋會一直在「CP 不夠」的區域打轉，所以專家配方用自己的參考點。 */
    const isExpert = !!rec.isExpert;
    const cpFormula = (sv) => 17 * Math.pow(sv, 0.35) + 180;
    const REFS = isExpert
      ? [[0.7, 0.75, 2.0], [0.85, 0.75, 2.2], [1.0, 0.7, 2.4], [1.0, 0.85, 2.0], [1.2, 0.75, 2.2], [1.4, 0.8, 2.2], [0.85, 0.9, 1.8], [1.0, 0.75, 2.6]]
      : [[0.55, 0.905, 0], [0.7, 0.78, 0], [0.7, 1.04, 0], [0.85, 0.905, 60], [1.0, 0.78, -40], [1.0, 1.04, 40], [1.2, 0.905, 0], [1.5, 0.905, 0]];
    const refOf = (sv, ctr, third) => ({ craftsmanship: sv, control: ctr * sv, cp: isExpert ? cpFormula(sv) * third : cpFormula(sv) + third });
    let pool = (existing[k] || []).slice();
    const t0 = Date.now();
    if (beamOnly) {
      const hqv = hqAll.length ? hqAll : [], pts = [], list = [], seenSig = new Set();
      REFS.forEach(function (r) { const sv = S0 * r[0], c = refOf(sv, r[1], r[2]); pts.push({ craftsmanship: Math.round(sv), control: Math.round(c.control), cp: Math.round(c.cp) }); });
      [0.45, 0.6, 0.75, 0.9].forEach(function (f) { const sv = S0 * f; pts.push({ craftsmanship: Math.round(sv), control: Math.round((isExpert ? 0.75 : 0.905) * sv), cp: Math.round(isExpert ? cpFormula(sv) * 2.0 : cpFormula(sv)) }); });
      if (EXTRA_CP.length) { const base = pts.slice(); EXTRA_CP.forEach(function (m) { base.forEach(function (p0) { pts.push({ craftsmanship: p0.craftsmanship, control: p0.control, cp: Math.round(p0.cp * m) }); }); }); } // --extra-cp 0.9,1.1：每個參考點再多放幾個 CP 比例不同的點
      for (const pt of pts) {
        for (const wk of w2 ? [w, w2] : [w]) {
          for (const dv of DIVERSE > 0 ? [0, DIVERSE] : [0]) { // --diverse 0.8：每個參考點另外用「多樣性集束」再找一次（保留資源組合不同的狀態，常找得到一般集束漏掉的手法）
            const bst = Object.assign({ jobId: rec.jobId, level: 100 }, pt);
            const b = await wk.send({ type: 'solve', recipeId: id, stats: bst, options: { strategy: 'beam', lang: 'tw', hqIngredients: hqv, beamMaxExpand: BEAM_BUDGET, beamWidths: BEAM_WIDTHS, beamRealCapMs: 600000, diverse: dv || undefined } });
            const bk = b.ok && b.result && b.result.actionKeys, sig = bk && bk.join(',');
            if (bk && bk.length && !seenSig.has(sig)) { seenSig.add(sig); list.push(bk); }
          }
        }
      }
      result[k] = list;
      console.log('shape of recipe', id, 'rlvl', rec.rlvl, '->', list.length, 'rotations kept (beam-only),', Math.round((Date.now() - t0) / 1000) + 's');
      const outB = { v: 1, actions: [], shapes: {} }; encode(outB, Object.assign({}, existing, result)); fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(outB));
      okCount++;
      continue;
    }
    for (const hq of variants) {
      // 參考點：不同強度 × 不同的加工／CP 比重。玩家的配置不一定貼近設計者比例（例如裝備不齊、某一項特別低），
      // 所以庫要涵蓋「加工偏低」「加工偏高」「CP 偏多／偏少」等不同取向，不能只集中在比例附近
      for (const [f, ctr, third] of REFS) {
        const sv = S0 * f;
        const r = await w.send({ type: 'frontier', recipeId: id, stats: { jobId: rec.jobId, level: 100 }, ref: refOf(sv, ctr, third),
          goal: 'full', qGoal: rec.quality, hq, budgetMs: budget, seed: Math.round(f * 100 + ctr * 10), libKeys: pool.slice(0, 12), seedKeysList: pool.slice(0, 6) });
        if (r.ok && r.result.cands) r.result.cands.forEach((c) => pool.push(c.keys));
        if (BEAM_BUDGET > 0) { // 集束搜尋：在這個參考數值下直接找手法（不靠隨機），結果也進候選池
          const bs = { jobId: rec.jobId, level: 100, craftsmanship: Math.round(sv), control: Math.round(ctr * sv), cp: Math.round(isExpert ? cpFormula(sv) * third : cpFormula(sv) + third) };
          const b = await w.send({ type: 'solve', recipeId: id, stats: bs, options: { strategy: 'beam', lang: 'tw', hqIngredients: hq, beamMaxExpand: BEAM_BUDGET, beamWidths: BEAM_WIDTHS, beamRealCapMs: 600000 } });
          if (b.ok && b.result && b.result.actionKeys && b.result.actionKeys.length) pool.push(b.result.actionKeys);
        }
      }
    }
    // 篩選：在每種起始品質下各自只留互不被壓過的手法
    const uniq = []; const seen = new Set(); pool.forEach((p) => { const s = p.join(','); if (!seen.has(s)) { seen.add(s); uniq.push(p); } });
    const keep = new Set();
    for (const hq of variants) {
      const nr = await w.send({ type: 'needs', recipeId: id, stats: { jobId: rec.jobId, level: 100 }, goal: 'full', hq, keysList: uniq });
      const items = nr.result.map((n, i) => n && Object.assign(n, { i })).filter(Boolean);
      const le = (a, b) => a.cs <= b.cs && a.ct <= b.ct && a.cp <= b.cp;
      items.filter((c, ii) => !items.some((e, j) => j !== ii && le(e, c) && (e.cs < c.cs || e.ct < c.ct || e.cp < c.cp || j < ii))).forEach((c) => keep.add(c.i));
      // 「沒學會操作」的玩家不能用含操作的手法：只在不含操作的手法之間再篩一次，否則好用但含操作的手法會把它們全部擠掉（實測高等級形狀有 70/201 個沒有任何可用手法）
      const noMan = items.filter((c) => !uniq[c.i].includes('Manipulation'));
      noMan.filter((c, ii) => !noMan.some((e, j) => j !== ii && le(e, c) && (e.cs < c.cs || e.ct < c.ct || e.cp < c.cp || j < ii))).forEach((c) => keep.add(c.i));
    }
    result[k] = Array.from(keep).sort((a, b) => a - b).map((i) => uniq[i]);
    // 品質階梯的踏腳石：不只存「滿品質」的手法，也存「品質目標只有 50%～95%」時所需數值最低的手法。
    // 這樣不論玩家數值多少（即使做不到滿品質），庫裡都有接近「該數值下最高品質」的現成手法可以當起點。
    {
      const stepSeen = new Set(result[k].map((p) => p.join(',')));
      for (const hq of variants) {
        for (const [qf, f] of [[0.5, 0.45], [0.7, 0.6], [0.85, 0.75], [0.95, 0.9]]) {
          const sv = S0 * f;
          const r = await w.send({ type: 'frontier', recipeId: id, stats: { jobId: rec.jobId, level: 100 }, ref: refOf(sv, isExpert ? 0.75 : 0.905, isExpert ? 2.0 : 0),
            goal: 'full', qGoal: Math.round(rec.quality * qf), hq, budgetMs: budget, seed: Math.round(qf * 100), libKeys: [], seedKeysList: [] });
          if (r.ok && r.result.cands) r.result.cands.slice(0, 4).forEach((c) => { const sig = c.keys.join(','); if (!stepSeen.has(sig)) { stepSeen.add(sig); result[k].push(c.keys); } });
        }
      }
    }
    // 數值不夠、做不到滿品質時：在偏低的數值下用一般求解找出「品質盡量高」的手法也存進庫，
    // 給這類情況當起點種子（困難情況的結果原本波動很大，起點好壞影響很多）
    const qSeen = new Set(result[k].map((p) => p.join(',')));
    for (const hq of variants) {
      for (const f of [0.45, 0.6, 0.75]) {
        const sv = S0 * f;
        const r = await w.send({ type: 'solve', recipeId: id, stats: { jobId: rec.jobId, level: 100, craftsmanship: Math.round(sv), control: Math.round((isExpert ? 0.75 : 0.905) * sv), cp: Math.round(isExpert ? cpFormula(sv) * 2.0 : cpFormula(sv)) },
          options: { lang: 'tw', trials: 3, populationSize: 150, generations: 40, hqIngredients: hq, fixedPrefix: [], libraryFast: false, relaxTighten: false } });
        const ak = r.ok && r.result && r.result.actionKeys; const sig = ak && ak.join(',');
        if (ak && ak.length && !qSeen.has(sig)) { qSeen.add(sig); result[k].push(ak); }
        if (BEAM_BUDGET > 0) {
          const bst = { jobId: rec.jobId, level: 100, craftsmanship: Math.round(sv), control: Math.round((isExpert ? 0.75 : 0.905) * sv), cp: Math.round(isExpert ? cpFormula(sv) * 2.0 : cpFormula(sv)) };
          const b = await w.send({ type: 'solve', recipeId: id, stats: bst, options: { strategy: 'beam', lang: 'tw', hqIngredients: hq, beamMaxExpand: BEAM_BUDGET, beamWidths: BEAM_WIDTHS, beamRealCapMs: 600000 } });
          const bk = b.ok && b.result && b.result.actionKeys; const bsig = bk && bk.join(',');
          if (bk && bk.length && !qSeen.has(bsig)) { qSeen.add(bsig); result[k].push(bk); }
        }
      }
    }
    console.log('shape of recipe', id, 'rlvl', rec.rlvl, '->', result[k].length, 'rotations kept,', Math.round((Date.now() - t0) / 1000) + 's');
    // 每完成一種形狀就寫檔，中斷也不會白做
    const out = { v: 1, actions: [], shapes: {} }; encode(out, Object.assign({}, existing, result)); fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out));
    okCount++;
    } catch (e) { failCount++; delete result[k]; console.log('略過這個形狀（配方 ' + id + '）：' + (e && e.stack || e)); } // 單一形狀出錯不影響其他形狀
  }
  console.log('done ->', OUT, '| 成功', okCount, '個形狀 | 略過', failCount, '個');
  if (okCount === 0 && keys.length > 0) process.exit(1); // 全部都失敗才算失敗
})().catch((e) => { console.error('求解庫產生工具發生錯誤：', e && e.stack || e); process.exit(1); });
