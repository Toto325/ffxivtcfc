/* plaque.js — 「匾額」：切換按鈕（凹角雕版）的同款設計，等比放大到任意大小的元素
 *
 * 用法：在元素上加 data-plaque（按鈕用 data-plaque="btn"，會有 hover 亮起與光掃過；
 *       一般匾額用 data-plaque="" ，純靜態）。
 *
 * 做法：整套造型（缺角半徑、雙線間距、四角寶石、上緣中央扣飾、下緣短線、線寬）
 *       完全沿用切換按鈕的 plaqueOrn 與路徑公式，只是在「邏輯座標」裡畫好，
 *       再用 viewBox 整體等比放大 s 倍 → 比例與按鈕上一模一樣，不會因為放大而走樣。
 *
 * 縮放 s 由元素的短邊決定（切換按鈕高 46px ＝ s 1.0），緩慢增加並有上限：
 *   s = clamp( (短邊 / 46) ^ 0.45 , 1 , MAX_S )
 *   MAX_S 越大，匾額上的飾物越大；頁面外框約等於 s≈1.85，所以匾額刻意壓在它之下，
 *   兩層框之間才有「大框為主、匾額為輔」的層次。想調整飾物大小，只改 MAX_S 這一個數字。
 *
 * 依賴：nav-royal.js 匯出的 window.NRO（找不到就什麼都不畫，元素退回一般外觀）。
 */
(function () {
  'use strict';
  var MAX_S = 1.3;
  var BASE_H = 46;          // 切換按鈕高度
  var doc = document, N = window.NRO, uid = 0;
  if (!N || !N.plaqueOrn) return;
  var NS = N.NS, fmt = N.fmt;

  function scaleFor(w, h) {
    var m = Math.min(w, h);
    return Math.max(1, Math.min(MAX_S, Math.pow(m / BASE_H, .45)));
  }


  /* ── 飾物：依「匾額實際寬度」決定大小與長度（切換按鈕的原尺寸時與按鈕完全相同）──
     切換按鈕本身的飾物是固定尺寸；放到大匾額上，如果飾物不跟著變，上緣就會顯得空、比例失衡。
     所以這裡用和內容頁外框同一套規則：
       ‧ 中央扣飾：核心縮放隨寬度緩增（寬 176 → 0.45，寬 800 → 約 0.8），流線向外伸展到每半邊的 1/3
       ‧ 角翼：長度填到「扣飾旁邊」（約每半邊的 40%），扇開高度隨長度增加（長高比 3.9 → 最高 9.4）
       ‧ 下緣短線：長度隨寬度增加
     W、H 是實際像素尺寸；lw、lh 與座標是除以 s 之後的邏輯尺寸。 */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ornaments(W, H, s, x0, y0, x1, y1, orn) {
    orn = orn || 'full';   // full＝角翼＋扣飾＋下緣短線；lite＝只留四角寶石、扣飾與下緣短線（無角翼）；none＝只留四角寶石
    var lw = W / s, lh = H / s, half = lw / 2;
    if (lw < 120) return N.plaqueOrn(lw, lh, x0, y0, x1, y1, false);   // 很窄的元素：直接用切換按鈕原版

    var csc = clamp(.45 * Math.pow(W / 176, .37), .45, .9) / s;     // 實際 0.45～0.9，換算成邏輯座標
    var clk = Math.max(.4, (.33 * half / csc - 22) / 112);          // 流線長度倍率：扣飾向外約 1/3 半寬
    var reachC = (22 + 112 * clk) * csc;
    var L = Math.max(18, Math.min(.40 * half, half - reachC - 3 - 17));   // 角翼長度
    var wlk = L / 44;                                               // PLAQUE_WING 最長一條是 44
    var ratio = Math.min(9.4, 3.9 * Math.pow(L / 35, .45));         // 長高比：按鈕原尺寸 3.9，寬大時趨近外框的 9.4
    var kv = (L / ratio) / 9;                                       // 原始扇開高度是 9（前端 y 7→16）
    var WS = N.PLAQUE_WING.map(function (e) { return [7 + (e[0] - 7) * kv, 7 + (e[1] - 7) * kv, e[2], e[3], e[4]]; });
    var wRf = 18 * (WS[WS.length - 1][0] / 16);

    function corner(x, y, sx, sy, wings) {
      return '<g transform="translate(' + fmt(x) + ' ' + fmt(y) + ') scale(' + sx + ' ' + sy + ')">' +
        (wings ? N.wingSet(WS, wRf, 1, wlk) : '') +
        '<g transform="translate(1.8 1.8)">' + N.miniJewel(1) + '</g></g>';
    }
    var cy = y0 + 3.75 / 2 + .75 / 2 + .1;
    var clasp = '<g transform="translate(' + fmt(lw / 2) + ' ' + fmt(cy) + ') scale(' + fmt(csc) + ' ' + fmt(-csc) + ')">' +
      N.claspStrokes(clk) + N.centerFrame() + N.gem(6.4) + N.glint(-1.9, -2.9, 3) + '</g>';
    var m = clamp(Math.pow(half / 88, .6), 1, 2.4), base = '';
    [[40 * m, .9, .55, 7.2], [24 * m, .7, .4, 10.4]].forEach(function (e) {
      var pts = [], n = Math.round(e[0] / 1.2), i;
      for (i = 0; i <= n; i++) pts.push([lw / 2 - e[0] / 2 + i * e[0] / n, y1 - e[3]]);
      base += N.taper(pts, function (t) { return Math.max(.05, e[1] * Math.pow(Math.sin(Math.PI * t), .8)); }, N.GOLD, e[2]);
    });
    var wg = orn === 'full', corners = corner(x0, y0, 1, 1, wg) + corner(x1, y0, -1, 1, wg) + corner(x0, y1, 1, -1, false) + corner(x1, y1, -1, -1, false);
    return orn === 'none' ? corners : corners + clasp + base;
  }

  function build(el) {
    var bb = el.getBoundingClientRect();
    var w = bb.width, h = bb.height;
    if (!w || !h) return;
    var s = parseFloat(el.getAttribute('data-plaque-scale')) || scaleFor(w, h);
    var lw = w / s, lh = h / s;                      // 邏輯尺寸（以按鈕的 1:1 座標畫）
    var key = fmt(w) + 'x' + fmt(h) + '@' + fmt(s) + (el.getAttribute('data-plaque-orn') || '');
    if (el.__plqKey === key) return;
    el.__plqKey = key;
    el.style.setProperty('--ps', fmt(s));

    var id = el.__plqId || (el.__plqId = 'plq' + (++uid));
    var r = 10, sIn = 4.5;
    var a = .75, x0 = a, y0 = a, x1 = lw - a, y1 = lh - a;
    var outer = 'M' + fmt(x0 + r) + ' ' + y0 + ' H' + fmt(x1 - r) + ' A' + r + ' ' + r + ' 0 0 0 ' + fmt(x1) + ' ' + fmt(y0 + r) +
      ' V' + fmt(y1 - r) + ' A' + r + ' ' + r + ' 0 0 0 ' + fmt(x1 - r) + ' ' + fmt(y1) + ' H' + fmt(x0 + r) +
      ' A' + r + ' ' + r + ' 0 0 0 ' + fmt(x0) + ' ' + fmt(y1 - r) + ' V' + fmt(y0 + r) + ' A' + r + ' ' + r + ' 0 0 0 ' + fmt(x0 + r) + ' ' + y0 + 'Z';
    var rr = r + sIn, k = Math.sqrt(rr * rr - sIn * sIn);
    var inner = 'M' + fmt(x0 + k) + ' ' + fmt(y0 + sIn) + ' H' + fmt(x1 - k) + ' A' + rr + ' ' + rr + ' 0 0 0 ' + fmt(x1 - sIn) + ' ' + fmt(y0 + k) +
      ' V' + fmt(y1 - k) + ' A' + rr + ' ' + rr + ' 0 0 0 ' + fmt(x1 - k) + ' ' + fmt(y1 - sIn) + ' H' + fmt(x0 + k) +
      ' A' + rr + ' ' + rr + ' 0 0 0 ' + fmt(x0 + sIn) + ' ' + fmt(y1 - k) + ' V' + fmt(y0 + k) + ' A' + rr + ' ' + rr + ' 0 0 0 ' + fmt(x0 + k) + ' ' + fmt(y0 + sIn) + 'Z';

    var svg = el.querySelector(':scope > .plq-svg');
    if (!svg) {
      svg = doc.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'plq-svg');
      svg.setAttribute('aria-hidden', 'true');
      el.insertBefore(svg, el.firstChild);
    }
    svg.setAttribute('width', fmt(w)); svg.setAttribute('height', fmt(h));
    svg.setAttribute('viewBox', '0 0 ' + fmt(lw) + ' ' + fmt(lh));
    svg.style.setProperty('--sw', fmt(lw) + 'px');
    svg.innerHTML =
      '<defs><clipPath id="' + id + 'c"><path d="' + outer + '"/></clipPath>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e8b0"/><stop offset=".5" stop-color="#b08d45"/><stop offset="1" stop-color="#f0d88c"/></linearGradient>' +
      '<linearGradient id="' + id + 's" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff6d6" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      '<path class="plq-fill" d="' + outer + '"/>' +
      '<g clip-path="url(#' + id + 'c)"><rect class="plq-sh" x="' + fmt(-lw * .6) + '" y="0" width="' + fmt(lw * .5) + '" height="' + fmt(lh) + '" fill="url(#' + id + 's)"/></g>' +
      '<path class="plq-in" d="' + inner + '"/>' +
      '<path class="plq-out" style="stroke:url(#' + id + 'g)" d="' + outer + '"/>' +
      '<g>' + ornaments(w, h, s, x0, y0, x1, y1, el.getAttribute('data-plaque-orn')) + '</g>';
  }

  var ro = window.ResizeObserver ? new ResizeObserver(function (es) { es.forEach(function (e) { build(e.target); }); }) : null;
  function adopt(el) {
    if (el.__plq) return;
    el.__plq = true;
    if (ro) ro.observe(el);
    build(el);
  }
  function scan() { doc.querySelectorAll('[data-plaque]').forEach(adopt); }

  scan();
  window.addEventListener('load', scan);
  new MutationObserver(scan).observe(doc.body, { childList: true, subtree: true });
})();
