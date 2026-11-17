/* 在 Node 裡載入 js/craft-worker.js（像 Web Worker 一樣），讓離線腳本與測試能用跟網站完全相同的求解程式。 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_EXCLUDED = ['StellarSteadyHand', 'MaterialMiracle'];
function makeWorker(opts) {
  opts = opts || {};
  const listeners = [];
  const ctx = { console, Date, Math, URL, performance: { now: () => Date.now() }, setTimeout, clearTimeout };
  ctx.self = ctx; ctx.globalThis = ctx;
  ctx.location = { href: 'file://' + path.join(ROOT, 'js', 'craft-worker.js') };
  ctx.fetch = function (url) { // 只用來讀本機的手法庫檔案
    try {
      const f = decodeURIComponent(String(url).replace(/^file:\/\//, ''));
      if (opts.library === false || !fs.existsSync(f)) return Promise.resolve({ ok: false });
      const txt = fs.readFileSync(f, 'utf8');
      return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(txt)) });
    } catch (e) { return Promise.resolve({ ok: false }); }
  };
  ctx.postMessage = (m) => { listeners.forEach((f) => f(m)); };
  ctx.importScripts = (f) => { const p = path.join(ROOT, 'js', f); vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: p }); };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'craft-worker.js'), 'utf8'), ctx, { filename: 'craft-worker.js' });
  let seq = 0;
  /* 角色數值的預設值：完全比照網站介面（craft-panel.js 的 currentSolveStats／specialActionAvailability），
   * 測試與離線產生手法庫才會跟玩家實際按下「開始求解」時的條件一致。曾經因為測試條件跟介面不一致
   * （沒有帶禁用技能），手法庫 99% 的手法用到玩家實際不能用的技能，測出來的效益被高估。
   *   ・禁用技能＝「特殊技能」清單裡，不是（可用而且玩家勾選學會）的那些：
   *       宇宙探索專用的兩個預設不勾；專家技能（專心致志、快速改革）要啟用專家才能用；淬鍊之眼要角色等級比配方高 10 以上；
   *       「可不可用」直接問模擬引擎本身（canBeUsed），不自己重寫規則。
   *   ・各職業等級（levels）、專家、神兵工具：沒指定就跟介面預設一樣（全職業同等級、非專家、無）。
   * 要測別的條件時，在 stats 明確指定 excludedActions／specialist／levels 即可覆蓋。 */
  const SPECIAL = [{ key: 'Manipulation' }, { key: 'HeartAndSoul' }, { key: 'QuickInnovation' }, { key: 'TrainedEye' }, { key: 'MaterialMiracle', defaultOff: true }, { key: 'StellarSteadyHand', defaultOff: true }];
  const canUse = vm.runInContext(`(function (key, jobId, level, specialist, recipe) {
    const entry = simulator.CraftingActionsRegistry.ALL_ACTIONS.find(function (e) { return e.action.constructor.name === key; });
    if (!entry) return false;
    const action = entry.action, req = action.getLevelRequirement();
    if (level < req.level) return false;
    let dummy = { durability: 80, quality: 100, progress: 100, lvl: 1, rlvl: 1, ingredients: [], conditionsFlag: 15, progressDivider: 100, qualityDivider: 100, progressModifier: 100, qualityModifier: 100, expert: false };
    if (recipe) dummy = Object.assign({}, dummy, { lvl: recipe.lvl, rlvl: recipe.rlvl, expert: recipe.isExpert });
    const stats = new simulator.CrafterStats(jobId, 1, 1, 1, specialist, false, level, [level, level, level, level, level, level, level, level]);
    const sim = new simulator.Simulation(dummy, [], stats);
    return action.canBeUsed(sim, false);
  })`, ctx);
  const uiDefaults = (msg) => {
    const st = Object.assign({}, msg.stats);
    const level = st.level || 100, specialist = !!st.specialist;
    if (st.levels === undefined) st.levels = [level, level, level, level, level, level, level, level];
    if (st.specialist === undefined) st.specialist = false;
    if (st.relicTool === undefined) st.relicTool = false;
    if (st.excludedActions === undefined) {
      const recipe = msg.recipeId ? vm.runInContext('CRAFT_RECIPES', ctx)[msg.recipeId] : null;
      st.excludedActions = SPECIAL.filter((a) => a.defaultOff || !canUse(a.key, st.jobId, level, specialist, recipe)).map((a) => a.key);
    }
    return st;
  };
  const send = (msg) => new Promise((res) => {
    if (msg.stats) msg.stats = uiDefaults(msg);
    const id = ++seq; msg.requestId = id;
    const f = (m) => { if (m.type === 'solve-result' && m.requestId === id) { listeners.splice(listeners.indexOf(f), 1); res(m); } };
    listeners.push(f);
    ctx.onmessage({ data: msg });
  });
  return { ctx, send, recipes: () => vm.runInContext('CRAFT_RECIPES', ctx), shapeKeyOf: (r) => vm.runInContext('shapeKeyOf', ctx)(r) };
}
module.exports = { makeWorker, DEFAULT_EXCLUDED };
