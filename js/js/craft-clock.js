/* craft-clock.js — 虛擬時鐘：讓求解結果「可重現」
 *
 * 原本搜尋用真實時間（Date.now()）決定要搜尋多久，所以同樣的輸入在快慢不同的電腦、或同一台電腦忙閒不同時，
 * 搜尋的次數不一樣，結果也不一樣（同樣的數值有時 47%、有時 92%）。
 * 這裡改成用「已經做了多少模擬工作」當時鐘：每次模擬依技能步數累計一點時間，所有「預算」「截止時間」都讀這個時鐘，
 * 所以每個預算都等於固定的計算量，不再受電腦速度影響。搜尋流程本身完全沒變（一樣是同樣的預算、同樣的步驟），
 * 隨機種子本來就固定，所以同樣的輸入會得到完全相同的結果。
 * 防呆：真實時間超過安全上限（預設 60 秒）時，時鐘直接跳到「全部截止」，避免很慢的電腦無限等待。 */
(function (g) {
  'use strict';
  var virtual = 0, det = true, realStart = Date.now(), realCapMs = 60000, tripped = false;
  var PER_STEP = 0.0013; // 每個模擬步驟折算多少「虛擬毫秒」（含搜尋本身的其他開銷，依典型電腦校準）
  g.CraftClock = {
    now: function () {
      if (!det) return Date.now();
      if (!tripped && Date.now() - realStart > realCapMs) tripped = true;
      return virtual + (tripped ? 1e9 : 0);
    },
    tick: function (steps) { virtual += steps * PER_STEP; },
    begin: function (opts) { realStart = Date.now(); tripped = false; det = !(opts && opts.deterministic === false); if (opts && opts.realCapMs) realCapMs = opts.realCapMs; },
    virtualMs: function () { return virtual; },
  };
  if (g.simulator && g.simulator.Simulation && !g.simulator.Simulation.prototype.__clocked) {
    var orig = g.simulator.Simulation.prototype.run;
    g.simulator.Simulation.prototype.run = function () {
      var r = orig.apply(this, arguments);
      g.CraftClock.tick((this.actions && this.actions.length) || 20);
      return r;
    };
    g.simulator.Simulation.prototype.__clocked = true;
  }
})(typeof self !== 'undefined' ? self : this);
