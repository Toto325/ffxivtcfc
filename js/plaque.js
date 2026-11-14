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

  function build(el) {
    var bb = el.getBoundingClientRect();
    var w = bb.width, h = bb.height;
    if (!w || !h) return;
    var s = parseFloat(el.getAttribute('data-plaque-scale')) || scaleFor(w, h);
    var lw = w / s, lh = h / s;                      // 邏輯尺寸（以按鈕的 1:1 座標畫）
    var key = fmt(w) + 'x' + fmt(h) + '@' + fmt(s);
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
      '<g>' + N.plaqueOrn(lw, lh, x0, y0, x1, y1, false) + '</g>';
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
