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
       內容頁外線缺角半徑：左側 18、頂部 12。 */
    var r = top ? 12 : 18, c = top ? 1.1 : 1.75;           // 缺角半徑（原 8／12）與寶石縮放：放大到有「主角」的存在感
    var sIn = top ? 4 : 6.5;
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
    var cs = c * (.7 + .3 * fk), jo = 1.8 * cs;            // 寶石縮放
    var cw = (top ? .82 : 1.25) * (.7 + .3 * fk);          // 飾翼縮放（線寬、基準高度）：不跟寶石一起放大，免得翼變粗變重

    /* 中央扣飾的範圍先算出來：角翼要「填到扣飾旁邊」。按鈕上角翼＋扣飾約佔每半邊上緣的 85%，上緣看起來才像被承托住。
       頂部模式：主選單下緣已有一組大扣飾（翼寬約 134px），內容頁這組一定要比它小，所以流線翼上限 95px。 */
    var csc = top ? .6 : .85;
    var reach = top ? Math.min(.33 * half, 95) : .33 * half;
    var clk = Math.max(.4, (reach / csc - 22) / 112);      // 22＝筆劃起點離寶石中心；112＝最長流線

    /* 飾翼：長度維持按鈕的覆蓋率（不縮短）；缺角那端的「鉤子」扇開高度跟著框的尺寸放大，
       尾端仍然長而平。若只放大長度、不放大鉤子，鉤子就會退化成一個小彎，翼變成貼邊的直線。 */
    var wingLen = Math.max(40, Math.min(.52 * half, half - reach - .12 * half));
    var wlk = wingLen / (44 * cw);                         // PLAQUE_WING 最長那條是 44，換算成長度倍率
    var spread = Math.max(9 * cw, Math.min(wingLen / 10, top ? 16 : 24));   // 鉤子扇開高度（螢幕 px）；按鈕約 9
    var sy = spread / (9 * cw);                            // 相對於按鈕公式（前端 y 7→16，共 9）的放大倍率
    var WS = N.PLAQUE_WING.map(function (e) {              // 只放大「離基準線 7 的高度」，最貼邊的那條不動
      return [7 + (e[0] - 7) * sy, 7 + (e[1] - 7) * sy, e[2], e[3], e[4]];
    });
    var wRf = 16.6 * (WS[WS.length - 1][0] / 16);            // 前端同心弧半徑隨最大前端 y 放大，保持包住寶石的弧線
    function corner(x, y, sx, sy, wings) {
      return '<g transform="translate(' + fmt(x) + ' ' + fmt(y) + ') scale(' + sx + ' ' + sy + ')">' +
        (wings ? '<g transform="scale(' + fmt(cw) + ')">' + N.wingSet(WS, wRf, 1.15, wlk) + '</g>' : '') +
        '<g transform="translate(' + fmt(jo) + ' ' + fmt(jo) + ')">' + N.miniJewel(cs) + '</g></g>';
    }
    o += corner(x0, y0, 1, 1, true) + corner(x1, y0, -1, 1, true) +
         corner(x0, y1, 1, -1, false) + corner(x1, y1, -1, -1, false);

    /* 上緣正中：中央扣飾（選單款），寶石中心換成點綴色；範圍已在上面算好（csc／reach／clk） */
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
