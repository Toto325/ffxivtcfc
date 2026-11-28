/* theme.js — 日／夜主題切換 + 淺色模式專屬的「金箔閃光」背景
 *
 * 運作方式
 *   ‧ <html data-theme="light|dark">：深色＝原本設計（預設）；淺色＝css/theme-light.css 覆寫。
 *   ‧ 選擇存在 localStorage 'ff14fc-theme'；index.html <head> 內聯腳本會在 CSS 載入前先寫好屬性，避免閃爍。
 *   ‧ 其他分頁／嵌入的彈窗（embed=1）會透過 storage 事件同步。
 *   ‧ window.ffT(深色值, 淺色值)：給 canvas／JS 內聯顏色用，依目前主題回傳對應值。
 *   ‧ 切換時會送出 'ff-theme' 事件（detail.theme），畫布類元件可據此重畫。
 *
 * 想移除淺色模式：拿掉 index.html 裡 theme-light*.css 兩個 <link> 與本檔 <script> 即可，原本的深色版不受影響。
 */
(function () {
  'use strict';
  var KEY = 'ff14fc-theme', root = document.documentElement;
  function cur() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  window.ffT = function (d, l) { return cur() === 'light' ? l : d; };

  function apply(t, save, first) {
    root.setAttribute('data-theme', t);
    if (save) { try { localStorage.setItem(KEY, t); } catch (e) {} }
    var b = document.getElementById('theme-toggle');
    if (b) {
      b.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
      var lab = t === 'light' ? '切換為深色模式' : '切換為淺色模式';
      b.setAttribute('aria-label', lab); b.setAttribute('title', lab);
    }
    fx.sync();
    try { window.dispatchEvent(new CustomEvent('ff-theme', { detail: { theme: t } })); } catch (e) {}
    /* 讓依視窗尺寸重畫的圖表（市場走勢圖等）立即套用新配色 */
    if (!first) { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }
  }

  /* ── 金箔閃光：少量清晰的四芒星，淡入淡出後換位置（淺色模式專用） ── */
  var fx = (function () {
    var c, g, W = 0, H = 0, S = [], raf = 0, reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    function size() {
      if (!c) return; W = c.width = window.innerWidth; H = c.height = window.innerHeight;
      var n = Math.max(10, Math.min(22, Math.round(W * H / 70000)));
      S = []; for (var i = 0; i < n; i++) S.push(mk(true));
    }
    function mk(init) { return { x: Math.random() * W, y: Math.random() * H, r: 5 + Math.random() * 6, p: init ? Math.random() * 6.28 : -1.57, f: .010 + Math.random() * .012 }; }
    function star(x, y, r, a) {
      g.save(); g.translate(x, y);
      g.strokeStyle = 'rgba(166,118,28,' + (a * .9) + ')'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.moveTo(0, -r); g.lineTo(0, r); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,' + a + ')'; g.lineWidth = .5; g.stroke();
      g.fillStyle = 'rgba(255,252,236,' + a + ')'; g.beginPath(); g.arc(0, 0, r * .2, 0, 7); g.fill();
      g.strokeStyle = 'rgba(166,118,28,' + (a * .8) + ')'; g.lineWidth = .8; g.stroke(); g.restore();
    }
    function frame() {
      raf = 0; if (cur() !== 'light' || document.hidden) return;
      g.clearRect(0, 0, W, H);
      for (var i = 0; i < S.length; i++) {
        var s = S[i]; if (!reduce) s.p += s.f;
        var v = Math.sin(s.p), a = reduce ? .5 : Math.pow(Math.max(0, v), 5);
        if (a > .01) star(s.x, s.y, s.r * (.6 + .4 * a), a);
        if (v < -.98 && !reduce) { s.x = Math.random() * W; s.y = Math.random() * H; s.p = -1.5; }
      }
      raf = requestAnimationFrame(frame);
    }
    return {
      sync: function () {
        if (cur() !== 'light') { if (raf) { cancelAnimationFrame(raf); raf = 0; } if (g) g.clearRect(0, 0, W, H); return; }
        if (!c) { c = document.getElementById('light-fx'); if (!c) return; g = c.getContext('2d'); size(); window.addEventListener('resize', size); document.addEventListener('visibilitychange', function () { if (!document.hidden) fx.sync(); }); }
        if (!raf) raf = requestAnimationFrame(frame);
      }
    };
  })();

  function init() {
    if (!/embed=1/.test(location.hash)) {
      var b = document.getElementById('theme-toggle');
      if (b) b.addEventListener('click', function () { apply(cur() === 'light' ? 'dark' : 'light', true); });
    }
    apply(cur(), false, true);
  }
  window.addEventListener('storage', function (e) { if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark') && e.newValue !== cur()) apply(e.newValue, false); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
