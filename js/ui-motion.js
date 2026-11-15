/* ui-motion.js — 動態與寶飾座（配合 ui-refine.css）
 *
 * 內容：
 *   1. 簡介卡片的寶飾座（.ic2-seat）：與中央扣飾同一套內凹星形雙層框，窄菱形＋短尖刺，色彩取卡片的 --gem
 *   2. 金粉：卡片 hover／點擊時迸出幾粒（只在偏好動態、非省電時）
 *   3. 日期數字「解碼」：簡介頁每次進入時，數字亂數跳動後由左至右定位
 *   4. 光之接力：點選單時，一粒光從該項圖示飛到內容頁標題徽章，抵達時點燃光環
 *   5. 資料到位：市場最低價那列的數字滾動到定位
 *
 * 依賴：nav-royal.js 的 window.NRO（沒有就只做不需要它的部分）。
 * 偏好減少動態（prefers-reduced-motion）時，2～5 全部不執行。
 */
(function () {
  'use strict';
  var doc = document, N = window.NRO;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var raf = window.requestAnimationFrame.bind(window);

  /* ───────── 1. 寶飾座 ───────── */
  function seatSvg() {
    if (!N || !N.ccvPath) return '';
    var sc = 1.0, ak = .62, sp = .72, P = N.P;
    var a = 17.5 * sc * ak, b = 11 * sc, a2 = 13.6 * sc * ak, b2 = 8.2 * sc, o = '';
    [-1, 1].forEach(function (d) {
      o += '<g class="sp"><polygon points="' + P([[-2 * sc, d * 9.6 * sc], [0, d * 20 * sc * sp * 1.15], [2 * sc, d * 9.6 * sc]]) + '" fill="#e3c780" fill-opacity=".8"/>' +
           '<polygon points="' + P([[-.7 * sc, d * 12 * sc], [0, d * 24 * sc * sp * 1.15], [.7 * sc, d * 12 * sc]]) + '" fill="#e3c780" fill-opacity=".5"/></g>';
    });
    o += '<path d="' + N.ccvPath(a, b, .34) + '" fill="#0c0a0e" fill-opacity=".97" stroke="#ecd38f" stroke-opacity=".95" stroke-width="1.5" stroke-linejoin="round"/>';
    o += '<path d="' + N.ccvPath(a2, b2, .34) + '" fill="none" stroke="currentColor" stroke-opacity=".75" stroke-width="1" stroke-linejoin="round"/>';
    /* 中央鑲一顆切面寶石（取卡片寶石色；沒有圖示） */
    o += '<g class="gm"><polygon points="' + P([[0, -6.2], [4.6, 0], [0, 6.2], [-4.6, 0]]) + '" fill="currentColor" fill-opacity=".92"/>' +
         '<polygon points="' + P([[0, -6.2], [4.6, 0], [0, 0]]) + '" fill="#fff" fill-opacity=".38"/>' +
         '<polygon points="' + P([[0, -6.2], [4.6, 0], [0, 6.2], [-4.6, 0]]) + '" fill="none" stroke="#fff6d6" stroke-opacity=".55" stroke-width=".5"/></g>';
    [-1, 1].forEach(function (d) {      /* 兩側小鑽：取卡片寶石色 */
      var x = d * 19.6 * sc * ak;
      o += '<polygon points="' + P([[x - 2.6, 0], [x, -3], [x + 2.6, 0], [x, 3]]) + '" fill="currentColor"/>';
    });
    return '<svg viewBox="-29 -29 58 58" aria-hidden="true">' + o + '</svg>';
  }
  function buildSeats() {
    var svg = seatSvg();
    doc.querySelectorAll('.ic2-seat').forEach(function (el) {
      if (el.__seat) return; el.__seat = true;
      el.innerHTML = svg;
    });
  }

  /* ───────── 2. 金粉 ───────── */
  function burst(x, y, gem, n) {
    if (reduce) return;
    for (var i = 0; i < n; i++) {
      var p = doc.createElement('i'); p.className = 'gd';
      if (gem) p.style.setProperty('--gem', gem);
      p.style.left = x + 'px'; p.style.top = y + 'px';
      doc.body.appendChild(p);
      var ang = Math.random() * Math.PI * 2, dist = 18 + Math.random() * 30;
      var anim = p.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(' + Math.cos(ang) * dist + 'px,' + (Math.sin(ang) * dist - 12) + 'px) scale(.2)', opacity: 0 }
      ], { duration: 620 + Math.random() * 260, easing: 'cubic-bezier(.2,.7,.3,1)' });
      anim.onfinish = (function (el) { return function () { el.remove(); }; })(p);
    }
  }
  doc.addEventListener('pointerenter', function (e) {
    var c = e.target.closest && e.target.closest('.intro-card2');
    if (!c || e.pointerType === 'touch') return;
    var s = c.querySelector('.ic2-seat'); if (!s) return;
    var r = s.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, getComputedStyle(c).getPropertyValue('--gem'), 6);
  }, true);
  doc.addEventListener('pointerdown', function (e) {
    var c = e.target.closest && e.target.closest('.intro-card2');
    if (!c) return;
    burst(e.clientX, e.clientY, getComputedStyle(c).getPropertyValue('--gem'), 8);
  }, true);

  /* ───────── 3. 日期數字解碼 ───────── */
  function roll(el) {
    if (reduce || !el) return;
    var fin = el.getAttribute('data-final') || el.textContent;
    el.setAttribute('data-final', fin); el.setAttribute('aria-label', fin);
    var t0 = performance.now(), last = -99, shown = fin;
    (function step(t) {
      var dt = t - t0, out = '', i;
      if (dt - last > 45) {                      // 每 45ms 重新亂數一次，已定位的字元不再變
        for (i = 0; i < fin.length; i++) out += (/\d/.test(fin[i]) && dt < 480 + i * 70) ? String(Math.floor(Math.random() * 10)) : fin[i];
        shown = out; last = dt; el.textContent = out;
      }
      if (dt < 480 + fin.length * 70 + 60) raf(step); else el.textContent = fin;
    })(t0);
  }

  /* ───────── 4. 光之接力 ───────── */
  var lastSrc = null, flight = null, holdBadge = null, holdTimer = 0;
  doc.addEventListener('click', function (e) {
    var it = e.target.closest && e.target.closest('.nav-item[data-nav]');
    if (!it) return;
    var ic = it.querySelector('.nr-ic') || it, r = ic.getBoundingClientRect();
    lastSrc = { x: r.left + r.width / 2, y: r.top + r.height / 2, t: Date.now(), nav: it.getAttribute('data-nav') };
  }, true);

  function release() {
    clearTimeout(holdTimer);
    if (holdBadge) { holdBadge.classList.remove('cr-hold'); holdBadge = null; }
  }
  function fly(src, badge) {
    var tr = badge.getBoundingClientRect();
    if (!tr.width || tr.bottom < 0 || tr.top > innerHeight) { release(); return; }
    var x0 = src.x, y0 = src.y, x1 = tr.left + tr.width / 2, y1 = tr.top + tr.height / 2;
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    var cx = (x0 + x1) / 2 - dy / len * Math.min(160, len * .28), cy = (y0 + y1) / 2 + dx / len * Math.min(160, len * .28) - 40;   // 弧線控制點
    var sc = getComputedStyle(badge.closest('.scene') || doc.body).getPropertyValue('--acc').trim() || '255,232,176';
    var dur = Math.max(560, Math.min(900, len * .9)), N_TRAIL = 6, motes = [], done = 0;
    function pos(t) { var u = 1 - t; return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]; }
    function frames(delay) {
      var f = [], i, n = 18, p;
      for (i = 0; i <= n; i++) { p = pos(Math.max(0, Math.min(1, (i / n) )));
        f.push({ transform: 'translate(' + p[0] + 'px,' + p[1] + 'px) scale(' + (1 - .45 * i / n) + ')', opacity: i === n ? 0 : 1, offset: i / n }); }
      return f;
    }
    for (var k = 0; k <= N_TRAIL; k++) {
      var m = doc.createElement('i'); m.className = 'relay-mote'; m.style.setProperty('--acc', sc);
      if (k) { m.style.width = m.style.height = (10 - k) + 'px'; m.style.margin = (-(10 - k) / 2) + 'px 0 0 ' + (-(10 - k) / 2) + 'px'; m.style.opacity = String(1 - k / (N_TRAIL + 1)); m.style.boxShadow = '0 0 ' + (10 - k) + 'px 1px rgba(' + sc + ',.5)'; }
      doc.body.appendChild(m); motes.push(m);
      var a = m.animate(frames(), { duration: dur, delay: k * 34, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'both' });
      a.onfinish = function () { if (++done === N_TRAIL + 1) finish(); };
    }
    flight = motes;
    function finish() {
      motes.forEach(function (m) { m.remove(); }); flight = null;
      release();
      badge.classList.add('cr-pop'); setTimeout(function () { badge.classList.remove('cr-pop'); }, 800);
      var h = badge.closest('.unified-gold-header'); if (h) { h.classList.add('ttl-flash'); setTimeout(function () { h.classList.remove('ttl-flash'); }, 1000); }
      burst(x1, y1, sc, 7);
    }
  }
  function onSceneChange(muts) {
    if (reduce || !lastSrc || Date.now() - lastSrc.t > 900) return;
    var sc = doc.querySelector('.scene.active'); if (!sc || sc.id !== lastSrc.nav) return;   // 舊頁剛取消 active 的那次變動先略過，等新頁
    var src = lastSrc; lastSrc = null;
    var badge = sc.querySelector('.unified-gold-header .cr-title-ic'); if (!badge) return;
    if (flight) { flight.forEach(function (m) { m.remove(); }); flight = null; }
    release(); holdBadge = badge; badge.classList.add('cr-hold');         /* 光抵達前先壓住光環（同一個 microtask，繪製之前） */
    holdTimer = setTimeout(release, 3000);                               /* 保險：最久 3 秒一定放行 */
    var tStart = performance.now();
    (function wait() {                                                    /* 等頁面進場排版穩定（至少 120ms，且徽章量得到尺寸）再量位置 */
      var el = performance.now() - tStart, r = badge.getBoundingClientRect();
      if ((el < 120 || !r.width) && el < 1200) return raf(wait);
      fly(src, badge);
    })();
  }
  var vp = doc.getElementById('viewport');
  if (vp && window.MutationObserver) new MutationObserver(onSceneChange).observe(vp, { attributes: true, attributeFilter: ['class'], subtree: true });

  /* ───────── 日期解碼：簡介頁每次進入時執行 ───────── */
  function watchRoll() {
    var sc = doc.getElementById('about'); if (!sc || !window.MutationObserver) return;
    var was = false;
    function chk() {
      var on = sc.classList.contains('active');
      if (on && !was) setTimeout(function () { roll(sc.querySelector('[data-roll]')); }, 760);
      was = on;
    }
    new MutationObserver(chk).observe(sc, { attributes: true, attributeFilter: ['class'] });
    chk();
  }

  /* ───────── 5. 資料到位：市場最低價數字滾動 ───────── */
  function countUp(el) {
    var txt = el.textContent.trim();
    if (el.children.length || !/^[\d,]+$/.test(txt)) return;
    var to = parseInt(txt.replace(/,/g, ''), 10), t0 = performance.now(), dur = 700 + Math.min(500, String(to).length * 50);
    if (!isFinite(to) || to < 10) return;
    el.textContent = '0';
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * e).toLocaleString('en-US');
      if (k < 1) raf(step); else el.textContent = txt;
    })(t0);
  }
  function watchMarket() {
    var mk = doc.getElementById('market'); if (!mk || !window.MutationObserver || reduce) return;
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          var rows = n.matches && n.matches('.market-flexrow-best') ? [n] : (n.querySelectorAll ? n.querySelectorAll('.market-flexrow-best') : []);
          Array.prototype.forEach.call(rows, function (row) {
            if (row.__arrived) return; row.__arrived = true;
            row.querySelectorAll('.mfl-price, .mfl-total').forEach(countUp);
          });
        });
      });
    }).observe(mk, { childList: true, subtree: true });
  }

  function init() { buildSeats(); watchRoll(); watchMarket(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('load', buildSeats);
})();
