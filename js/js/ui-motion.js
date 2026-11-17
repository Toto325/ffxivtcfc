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

  /* ───────── 1. 寶飾座 ─────────
     與頁面上緣中央扣飾「同一組零件、同樣的細線比例」：內凹星形雙層框、上下兩層尖刺、兩側小鑽（有切面）、
     中央切面寶石＋閃光星芒。差別只有：寶石改成卡片自己的顏色（--gem，用淺→深的切面表現），
     線條用 non-scaling-stroke 固定為細線，所以放大時線不會變粗（這是之前放大後「不精緻」的主因）。
     畫布座標與原扣飾相同（框寬 35、框高 22），整體大小由 CSS 的 --seat-w（＝菱框寬度）決定。 */
  function gemSvg(g) {                      /* 與 N.gem 同一套切面，但顏色取 currentColor */
    var h = g * 1.14, t = g * .44, th = t * 1.14, P = N.P;
    var T = [0, -h], R = [g, 0], B = [0, h], L = [-g, 0], tT = [0, -th], tR = [t, 0], tB = [0, th], tL = [-t, 0];
    return '<polygon points="' + P([T, R, B, L]) + '" fill="currentColor"/>' +
      '<polygon points="' + P([T, L, tL, tT]) + '" fill="#fff" fill-opacity=".58"/>' +
      '<polygon points="' + P([T, R, tR, tT]) + '" fill="#fff" fill-opacity=".24"/>' +
      '<polygon points="' + P([R, B, tB, tR]) + '" fill="#000" fill-opacity=".4"/>' +
      '<polygon points="' + P([L, B, tB, tL]) + '" fill="#000" fill-opacity=".14"/>' +
      '<polygon points="' + P([tT, tR, tB, tL]) + '" fill="#fff" fill-opacity=".62"/>' +
      '<polygon points="' + P([T, R, B, L]) + '" fill="none" stroke="#fff6d6" stroke-opacity=".75" stroke-width=".8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
  }
  var uidN = 0;
  function seatSvg(loader) {
    if (!N || !N.ccvPath) return '';
    var P = N.P, o = '', id = loader ? 'gmc' + (++uidN) : '';
    [-1, 1].forEach(function (d) {          /* 上下兩層尖刺（與原扣飾相同） */
      o += '<g class="sp"><polygon points="' + P([[-2, d * 9.6], [0, d * 20], [2, d * 9.6]]) + '" fill="#e3c780" fill-opacity=".78"/>' +
           '<polygon points="' + P([[-.7, d * 12], [0, d * 24], [.7, d * 12]]) + '" fill="#e3c780" fill-opacity=".5"/></g>';
    });
    o += '<path d="' + N.ccvPath(17.5, 11, .34) + '" fill="#0c0a0e" fill-opacity=".96" stroke="#e9cf8a" stroke-opacity=".9" stroke-width=".9" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
    o += '<path d="' + N.ccvPath(13.6, 8.2, .34) + '" fill="none" stroke="currentColor" stroke-opacity=".75" stroke-width=".7" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
    [-1, 1].forEach(function (d) { o += '<g class="sg ' + (d < 0 ? 'sgl' : 'sgr') + '" transform="translate(' + d * 19.6 + ' 0)">' + gemSvg(2.3) + '</g>'; });
    o += '<g class="gm">' + gemSvg(6.4) + N.glint(-1.9, -2.9, 3);
    if (loader) {                          /* 載入器：一道斜光反覆掃過主寶石的切面（以寶石輪廓裁切） */
      o += '<clipPath id="' + id + '"><polygon points="' + P([[0, -7.3], [6.4, 0], [0, 7.3], [-6.4, 0]]) + '"/></clipPath>' +
           '<g class="shw" clip-path="url(#' + id + ')"><rect x="-2" y="-9" width="3.4" height="18" fill="#fff" fill-opacity=".7" transform="skewX(-22)"/></g>';
    }
    o += '</g>';
    return '<svg viewBox="-26 -26 52 52" aria-hidden="true">' + o + '</svg>';
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

  /* ───────── 6. 載入器：寶飾座甦醒（＋頁面層級加飾桿光波），載入結束時迸出金粉 ─────────
     標記不動：把各頁原本的載入圖示（天秤／錘子／✿／circle-notch）換成同一個寶飾座載入器。
     頁面層級（市場、生產、公告、潛水艇／飛空艇結果區）＝飾桿＋寶飾座；按鈕上的「計算中」＝只有小寶飾座。 */
  var LOADER_SEL = '.craft-loading-icon, .news-loading-icon, .ex-spin.ph-circle-notch';
  var loaders = new Set(), loopOn = false;
  function upgradeLoader(el) {
    if (el.__gl) return; el.__gl = true;
    var page = !(el.closest && el.closest('button, .sub-btn')) && !el.matches('.ex-spin') || !!el.closest('.sub-busy');
    el.classList.add('gl-asm'); if (page) el.classList.add('gl-rod');
    el.innerHTML = '<span class="ic2-seat ld-seat" aria-hidden="true">' + seatSvg(true) + '</span>';
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', '載入中');
    if (page) { el.__born = performance.now(); el.__rect = el.getBoundingClientRect(); loaders.add(el); if (!loopOn) loaderLoop(); }
  }
  function loaderLoop() {
    loopOn = true;
    loaders.forEach(function (el) {
      if (!el.isConnected) {                                   /* 載入結束（節點被換掉）：停留超過 0.45 秒才迸金粉，避免快速載入時閃一下 */
        loaders.delete(el);
        if (!reduce && performance.now() - el.__born > 450) burst(el.__rect.left + el.__rect.width / 2, el.__rect.top + el.__rect.height / 2, '233,207,141', 9);
      } else el.__rect = el.getBoundingClientRect();
    });
    if (loaders.size) raf(loaderLoop); else loopOn = false;
  }
  function scanLoaders(root) {
    if (root.matches && root.matches(LOADER_SEL)) upgradeLoader(root);
    if (root.querySelectorAll) root.querySelectorAll(LOADER_SEL).forEach(upgradeLoader);
  }
  function watchLoaders() {
    scanLoaders(doc.body);
    if (!window.MutationObserver) return;
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scanLoaders(n); }); });
    }).observe(doc.body, { childList: true, subtree: true });
  }

  function init() { buildSeats(); watchRoll(); watchMarket(); watchLoaders(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('load', buildSeats);
})();
