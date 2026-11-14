/* content-royal-v2.js — 內容頁外框的 SVG 圖層（凹角內線＋上緣扣飾＋角飾＋下緣短線）
 * 依賴 nav-royal.js 匯出的 window.NRO；找不到時什麼都不畫（外框退回只有外線的樣子）。 */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement, gidN = 0;

  function build(fr) {
    var N = window.NRO;
    if (!N) return;
    var mode = root.getAttribute('data-nav-mode');
    var svg = fr.querySelector(':scope > .cr2-svg');
    if (mode === 'embed') { if (svg) svg.remove(); return; }
    var w = fr.offsetWidth, h = fr.offsetHeight;
    if (!w || !h) return;

    var fmt = N.fmt, top = mode === 'top';
    var fk = Math.min(1, w / 640);                         // 窄螢幕時整組縮小

    /* 與切換按鈕同一組公式：外線缺角半徑 r，內線只貼近外線 sIn，兩者同圓心（寶珠坐在圓心）。
       左側模式 ×1.2、頂部模式 ×0.82（＝按鈕窄版的縮放），內容頁外線缺角半徑 12／8。 */
    var r = top ? 8 : 12, c = top ? .82 : 1.2;
    var sIn = top ? 3.6 : 5.4;
    var a = .75, x0 = a, y0 = a, x1 = w - a, y1 = h - a;
    var rr = r + sIn, k = Math.sqrt(rr * rr - sIn * sIn);
    var inPath =
      'M' + fmt(x0 + k) + ' ' + fmt(y0 + sIn) + ' H' + fmt(x1 - k) +
      ' A' + fmt(rr) + ' ' + fmt(rr) + ' 0 0 0 ' + fmt(x1 - sIn) + ' ' + fmt(y0 + k) +
      ' V' + fmt(y1 - k) +
      ' A' + fmt(rr) + ' ' + fmt(rr) + ' 0 0 0 ' + fmt(x1 - k) + ' ' + fmt(y1 - sIn) +
      ' H' + fmt(x0 + k) +
      ' A' + fmt(rr) + ' ' + fmt(rr) + ' 0 0 0 ' + fmt(x0 + sIn) + ' ' + fmt(y1 - k) +
      ' V' + fmt(y0 + k) +
      ' A' + fmt(rr) + ' ' + fmt(rr) + ' 0 0 0 ' + fmt(x0 + k) + ' ' + fmt(y0 + sIn) + 'Z';

    var gid = fr.__cr2gid || (fr.__cr2gid = 'cr2g' + (++gidN));
    var outPath =
      'M' + fmt(x0 + r) + ' ' + fmt(y0) + ' H' + fmt(x1 - r) +
      ' A' + r + ' ' + r + ' 0 0 0 ' + fmt(x1) + ' ' + fmt(y0 + r) +
      ' V' + fmt(y1 - r) +
      ' A' + r + ' ' + r + ' 0 0 0 ' + fmt(x1 - r) + ' ' + fmt(y1) +
      ' H' + fmt(x0 + r) +
      ' A' + r + ' ' + r + ' 0 0 0 ' + fmt(x0) + ' ' + fmt(y1 - r) +
      ' V' + fmt(y0 + r) +
      ' A' + r + ' ' + r + ' 0 0 0 ' + fmt(x0 + r) + ' ' + fmt(y0) + 'Z';
    /* 外線：與切換按鈕同一條金色漸層描邊（#nrb-g），沿凹弧連續彎過角落 */
    var o = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#f6e8b0"/><stop offset=".5" stop-color="#b08d45"/><stop offset="1" stop-color="#f0d88c"/></linearGradient></defs>' +
      '<path class="cr2-out" stroke="url(#' + gid + ')" d="' + outPath + '"/>' +
      '<path class="cr2-in" d="' + inPath + '"/>';

    /* 四個角：小菱形寶石坐在缺角圓心（同按鈕 corner()）；上面兩角再加「只順著上緣」的四條扇形飾翼。
       飾翼公式沿用按鈕（PLAQUE_WING，前端落在以寶石為圓心的同心弧上），整體 ×c，長度依框寬（見下）。 */
    var half = w / 2;
    var cs = c * (.7 + .3 * fk), jo = 1.8 * cs;
    /* 飾翼比例：按鈕的翼「長：扇開高度」約 5:1。之前長度跟著框寬放大到約 190px，扇開高度卻只放大 1.2 倍
       （變成約 17:1），所以整束翼貼著邊線躺平。現在長度設上限（約 100px），並讓扇開高度跟著長度一起放大，
       維持按鈕那種「從缺角長出來、向外撐開」的比例。 */
    var wingLen = Math.min(Math.max(.2 * half, 48), top ? 84 : 104, .4 * half);
    var wlk = wingLen / (44 * cs);                         // PLAQUE_WING 最長那條是 44，換算成長度倍率
    var sy = Math.max(1, (wingLen / 8) / (9 * cs));      // 扇開高度的放大倍率（基準：前端 y 7→16，共 9）
    var WS = N.PLAQUE_WING.map(function (e) {              // 只放大「離基準線 7 的高度」，最貼邊的那條不動
      return [7 + (e[0] - 7) * sy, 7 + (e[1] - 7) * sy, e[2], e[3], e[4]];
    });
    var wRf = 18 * (WS[WS.length - 1][0] / 16);            // 前端同心弧半徑隨最大前端 y 放大，保持包住寶石的弧線
    function corner(x, y, sx, sy, wings) {
      return '<g transform="translate(' + fmt(x) + ' ' + fmt(y) + ') scale(' + sx + ' ' + sy + ')">' +
        (wings ? '<g transform="scale(' + fmt(cs) + ')">' + N.wingSet(WS, wRf, 1.15, wlk) + '</g>' : '') +
        '<g transform="translate(' + fmt(jo) + ' ' + fmt(jo) + ')">' + N.miniJewel(cs) + '</g></g>';
    }
    o += corner(x0, y0, 1, 1, true) + corner(x1, y0, -1, 1, true) +
         corner(x0, y1, 1, -1, false) + corner(x1, y1, -1, -1, false);

    /* 上緣正中：按鈕上緣那組扣飾的放大版（翻轉 y：外側朝上），寶石中心換成點綴色 */
    /* 中央扣飾：寶石適度放大（照比例放大整組會過重），流線翼放長到約半邊寬度的 33%（按鈕為 33%）。
       流線的彎曲量隨長度一起放大（claspStrokes 內部處理），所以放長後仍是同一種造型。 */
    var csc = top ? .6 : .85;
    /* 頂部模式：主選單下緣已有一組大扣飾（翼寬約 134px），內容頁這組一定要比它小，不然兩組疊成一團，
       所以頂部模式的流線翼上限 95px；左側模式沒有這個問題，照框寬比例。 */
    var reach = top ? Math.min(.33 * half, 95) : .33 * half;
    var clk = Math.max(.4, (reach / csc - 22) / 112);   // 22＝筆劃起點離寶石中心；112＝最長流線
    var cy = y0 + sIn / 2 + .4;
    o += '<g transform="translate(' + fmt(w / 2) + ' ' + fmt(cy) + ') scale(' + fmt(csc) + ' ' + fmt(-csc) + ')">' +
      N.claspStrokes(clk) + N.centerFrame() + N.gem(6.4) +
      '<polygon class="cr2-gem" points="0,-3.2 2.8,0 0,3.2 -2.8,0"/>' + N.glint(-1.9, -2.9, 3) + '</g>';

    /* 下緣正中：兩條極細短線（按鈕下緣同款），貼在內線上方 */
    [[72, 1.2, .55, 4.4], [43, .95, .4, 9.2]].forEach(function (e) {
      var pts = [], n = Math.round(e[0] / 1.2), i, y = y1 - sIn - e[3];
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
