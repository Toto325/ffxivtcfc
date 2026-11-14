/* content-royal-v2.js — 內容頁外框的 SVG 圖層（凹角內線＋上緣扣飾＋角飾＋下緣短線）
 * 依賴 nav-royal.js 匯出的 window.NRO；找不到時什麼都不畫（外框退回只有外線的樣子）。 */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;

  function build(fr) {
    var N = window.NRO;
    if (!N) return;
    var mode = root.getAttribute('data-nav-mode');
    var svg = fr.querySelector(':scope > .cr2-svg');
    if (mode === 'embed') { if (svg) svg.remove(); return; }
    var w = fr.offsetWidth, h = fr.offsetHeight;
    var inner = fr.querySelector('.noble-inner-frame');
    if (!w || !h || !inner) return;

    var fmt = N.fmt, top = mode === 'top';
    var fk = Math.min(1, w / 640);                         // 窄螢幕時整組縮小
    var fb = fr.getBoundingClientRect(), ib = inner.getBoundingClientRect();
    var sc = fb.width ? w / fb.width : 1;                  // 動畫期間若有縮放，換回版面座標
    var sL = (ib.left - fb.left) * sc + .5, sT = (ib.top - fb.top) * sc + .5;
    var sR = (fb.right - ib.right) * sc + .5, sB = (fb.bottom - ib.bottom) * sc + .5;
    if (!(sL > 1 && sT > 1 && sR > 1 && sB > 1)) return;

    var r = (top ? 8 : 12);                                // 外線缺角半徑（同 content-royal.css 的 --r）

    /* 內線：與外線缺角同圓心的凹角（和切換按鈕同一組公式） */
    function arcPts(sx, sy) {
      var rr = Math.hypot(sx, sy) + (top ? 6 : 9);   // 比內線轉角點略遠，凹弧才看得出來（仍與外線缺角同圓心）
      return { rr: rr, kx: Math.sqrt(rr * rr - sy * sy), ky: Math.sqrt(rr * rr - sx * sx) };
    }
    var a = arcPts(sL, sT), b = arcPts(sR, sT), c = arcPts(sR, sB), d = arcPts(sL, sB);
    var inPath =
      'M' + fmt(a.kx) + ' ' + fmt(sT) + ' H' + fmt(w - b.kx) +
      ' A' + fmt(b.rr) + ' ' + fmt(b.rr) + ' 0 0 0 ' + fmt(w - sR) + ' ' + fmt(b.ky) +
      ' V' + fmt(h - c.ky) +
      ' A' + fmt(c.rr) + ' ' + fmt(c.rr) + ' 0 0 0 ' + fmt(w - c.kx) + ' ' + fmt(h - sB) +
      ' H' + fmt(d.kx) +
      ' A' + fmt(d.rr) + ' ' + fmt(d.rr) + ' 0 0 0 ' + fmt(sL) + ' ' + fmt(h - d.ky) +
      ' V' + fmt(a.ky) +
      ' A' + fmt(a.rr) + ' ' + fmt(a.rr) + ' 0 0 0 ' + fmt(a.kx) + ' ' + fmt(sT) + 'Z';

    var o = '<path class="cr2-in" d="' + inPath + '"/>';

    /* 上面兩角：選單同款角飾（縮小）；下面兩角：只有一顆小寶珠 */
    var ck = (top ? .56 : .667) * (.7 + .3 * fk);
    o += '<g transform="translate(' + fmt(w) + ' 0) scale(' + fmt(ck) + ')">' + N.cornerOrn(0, 0, false) + '</g>';
    o += '<g transform="scale(' + fmt(-ck) + ' ' + fmt(ck) + ')">' + N.cornerOrn(0, 0, false) + '</g>';
    var jc = top ? .82 : 1.2, jo = 1.8 * jc;
    function mini(x, y, sx, sy) {
      return '<g transform="translate(' + fmt(x) + ' ' + fmt(y) + ') scale(' + sx + ' ' + sy + ')">' +
        '<g transform="translate(' + fmt(jo) + ' ' + fmt(jo) + ')">' + N.miniJewel(jc) + '</g></g>';
    }
    o += mini(0, h, 1, -1) + mini(w, h, -1, -1);

    /* 上緣正中：按鈕上緣那組扣飾的放大版（翻轉 y：外側朝上），寶石中心換成點綴色 */
    var csc = (top ? .5 : .62) * (.75 + .25 * fk), clk = (top ? .5 : .6) * (.75 + .25 * fk);
    var cy = (.75 + sT) / 2;
    o += '<g transform="translate(' + fmt(w / 2) + ' ' + fmt(cy) + ') scale(' + fmt(csc) + ' ' + fmt(-csc) + ')">' +
      N.claspStrokes(clk) + N.centerFrame() + N.gem(6.4) +
      '<polygon class="cr2-gem" points="0,-3.2 2.8,0 0,3.2 -2.8,0"/>' + N.glint(-1.9, -2.9, 3) + '</g>';

    /* 下緣正中：兩條極細短線（按鈕下緣同款），貼在內線上方 */
    [[72, 1.2, .55, 4.4], [43, .95, .4, 9.2]].forEach(function (e) {
      var pts = [], n = Math.round(e[0] / 1.2), i, y = h - sB - e[3];
      for (i = 0; i <= n; i++) pts.push([w / 2 - e[0] / 2 + i * e[0] / n, y]);
      o += N.taper(pts, function (t) { return Math.max(.05, e[1] * Math.pow(Math.sin(Math.PI * t), .8)); }, N.GOLD, e[2]);
    });

    if (!svg) {
      svg = doc.createElementNS(N.NS, 'svg');
      svg.setAttribute('class', 'cr2-svg');
      svg.setAttribute('aria-hidden', 'true');
      fr.appendChild(svg);
    }
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.innerHTML = o;
  }

  var ro = window.ResizeObserver ? new ResizeObserver(function (es) {
    es.forEach(function (e) { build(e.target); });
  }) : null;

  function adopt(fr) {
    if (fr.__cr2) return;
    fr.__cr2 = true;
    if (ro) ro.observe(fr);
    build(fr);
  }
  function scan() { doc.querySelectorAll('.noble-outer-frame').forEach(adopt); }
  function rebuildAll() { doc.querySelectorAll('.noble-outer-frame').forEach(build); }

  scan();
  window.addEventListener('load', function () { scan(); rebuildAll(); });
  window.addEventListener('resize', rebuildAll);
  new MutationObserver(rebuildAll).observe(root, { attributes: true, attributeFilter: ['data-nav-mode'] });
  new MutationObserver(function () { scan(); }).observe(doc.body, { childList: true, subtree: true });
})();
