/* ============================================================
 * nav-royal.js v4 — 主選單「面板＋飾桿」整合系統
 *
 * 載入後自動啟用（<html> 會被加上 data-nav-royal）；
 * 想關閉：<html data-nav-royal-off>。嵌入模式 (#embed=1) 不啟用。
 *
 * 做的事：
 *  1. 裝飾層 .nrp
 *       左側：左緣出血的面板。右側兩個轉角是「內凹缺角」，缺角中心一顆寶珠，
 *             周圍的雙線是以寶珠為圓心的同心弧；右緣是飾桿（外亮內暗雙線＋珠點），
 *             垂直中央微微外鼓，托著一枚與首頁分隔線同款的 ✧ 圓章。
 *       頂部：主列下緣垂掛的同款飾桿，中央同樣外鼓、托著圓章。
 *  2. 沿框線繞行的邊緣流光（canvas，極慢極淡）
 *  3. 飾桿上的「目前頁面指示光」（左側）：切換頁面時緩緩滑到對應項目旁
 *  4. 「切換頂部／左側選單」按鈕：凹角雕版（四角內凹＋寶珠＋雙線）
 *  5. 項目圖示光環、群組展開環章、hover 小金粉、面板內偶爾飄起的金粉、載入時依序滑入
 *
 * 所有常駐動態都放慢放淡；偵測到「減少動態」時只保留靜態外觀。
 * ============================================================ */
(function () {
  'use strict';
  var root = document.documentElement;
  if (root.hasAttribute('data-nav-royal-off')) return;
  if (/embed=1/.test(location.hash)) return;
  var nav = document.querySelector('.royal-nav');
  if (!nav) return;
  root.setAttribute('data-nav-royal', '1');

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* ───────── 可調參數（想調強弱改這裡）───────── */
  var RW = 300;            // 左側面板右緣（含外鼓）大約的 x 位置
  var COMET_SPEED = 42;    // 邊緣流光速度 px/s（子選單是 85）
  var COMET_TAIL = 200;    // 尾巴長度 px
  var COMET_PEAK = 0.58;   // 亮度峰值
  var SPARK_EVERY = 2600;  // 面板內金粉間隔 ms

  function fmt(n) { return Math.round(n * 100) / 100; }
  var NS = 'http://www.w3.org/2000/svg';

  /* ───────── 1. 圖示光環／群組環章／載入順序 ───────── */
  (function prepItems() {
    var i = 0;
    nav.querySelectorAll('.nav-item:not(.nav-subitem)').forEach(function (it) {
      it.style.setProperty('--i', i++);
      var cn = it.querySelector(':scope > .nav-content > .cn');
      if (!cn) return;
      if (!cn.querySelector('.nr-ic')) {
        var t = cn.firstChild;
        if (t && t.nodeType === 3) {
          var m = /^(\S)/.exec(t.nodeValue);
          if (m) {
            var span = document.createElement('span');
            span.className = 'nr-ic';
            span.textContent = m[1];
            t.nodeValue = t.nodeValue.slice(m[1].length);
            cn.insertBefore(span, t);
          }
        }
      }
      /* 群組的展開提示：緊貼文字右側的華麗 V 形（雙層 V＋兩端小珠＋尖端垂掛寶石） */
      if (it.classList.contains('nav-group') && !cn.querySelector('.nr-chev')) {
        var ch = document.createElement('span');
        ch.className = 'nr-chev';
        ch.setAttribute('aria-hidden', 'true');
        ch.innerHTML =
          '<svg viewBox="0 0 16 14" xmlns="' + NS + '">' +
          '<polygon class="f1" points="1.4,2.4 14.6,2.4 8,6"/>' +
          '<polygon class="f2" points="1.4,2.4 8,6 8,12.6"/>' +
          '<polygon class="f3" points="14.6,2.4 8,6 8,12.6"/>' +
          '<polygon class="fo" points="1.4,2.4 14.6,2.4 8,12.6"/></svg>';
        cn.appendChild(ch);
      }
    });
  })();

  /* ───────── 2. 裝飾層 DOM ───────── */
  var ov = document.createElement('div');
  ov.className = 'nrp';
  ov.setAttribute('aria-hidden', 'true');
  ov.innerHTML =
    '<div class="nrp-body"><i class="nrp-w1"></i><i class="nrp-w2"></i></div>' +
    '<svg class="nrp-svg" xmlns="' + NS + '"></svg>' +
    '<canvas class="nrp-comet"></canvas>' +
    '<div class="nrp-ind"></div>';
  document.body.appendChild(ov);
  var elBody = ov.querySelector('.nrp-body');
  var elSvg = ov.querySelector('.nrp-svg');
  var cvs = ov.querySelector('.nrp-comet');
  var ind = ov.querySelector('.nrp-ind');
  var sparkLayer = document.createElement('div');
  sparkLayer.className = 'nrp-sparks';
  sparkLayer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(sparkLayer);

  /* ───────── 3. 幾何 ───────── */
  var G = { mode: 'none', W: 0, H: 0, navH: 0, pts: null, xe: 0, yc: 0, top: 14 };
  var M = 8;   // canvas 外擴邊距
  var COVE = 18;   // 缺角半徑（花飾坐在缺角中心，被同心弧框線包住）

  /* 左側：一條「飾桿路徑」。off＝往內縮的距離（0 外線／3 珠點／6 內線）。
     缺角圓心固定在 (xe, ys)，所以各條線是同心弧。 */
  function leftRod(off) {
    var xe = G.xe, H = G.H, ys = .75, r = COVE;
    var rad = r + off, k = Math.sqrt(rad * rad - off * off), x = xe - off, yt = ys + off, yb = H - ys - off;
    return 'M0 ' + fmt(yt) + ' H' + fmt(xe - k) + ' A' + rad + ' ' + rad + ' 0 0 0 ' + fmt(x) + ' ' + fmt(ys + k) +
      ' V' + fmt(H - ys - k) + ' A' + rad + ' ' + rad + ' 0 0 0 ' + fmt(xe - k) + ' ' + fmt(yb) + ' H0';
  }
  /* 頂部：下緣飾桿（直線） */
  function topRod(y) { return 'M0 ' + fmt(y) + ' H' + G.W; }

  /* ── 裝飾線條系列（像餐單的框線修飾）：漸細的書法式筆劃＋螺旋捲草＋小鑽石＋星粉 ── */
  function P(a) { return a.map(function (p) { return fmt(p[0]) + ',' + fmt(p[1]); }).join(' '); }

  /* 切面小鑽石（以原點為中心，g＝半寬）：四個切面明暗不同；整體偏暗，不搶眼 */
  function gem(g) {
    var h = g * 1.14, t = g * .44, th = t * 1.14;
    var T = [0, -h], R = [g, 0], B = [0, h], L = [-g, 0];
    var tT = [0, -th], tR = [t, 0], tB = [0, th], tL = [-t, 0];
    return '<polygon points="' + P([T, R, B, L]) + '" fill="#0c0a0e"/>' +
      '<polygon points="' + P([T, L, tL, tT]) + '" fill="#f6e6b4" fill-opacity=".78"/>' +
      '<polygon points="' + P([T, R, tR, tT]) + '" fill="#e9cf8a" fill-opacity=".5"/>' +
      '<polygon points="' + P([R, B, tB, tR]) + '" fill="#8a6c30" fill-opacity=".7"/>' +
      '<polygon points="' + P([L, B, tB, tL]) + '" fill="#c9a85c" fill-opacity=".62"/>' +
      '<polygon points="' + P([tT, tR, tB, tL]) + '" fill="#f3e2ac" fill-opacity=".8"/>' +
      '<polygon points="' + P([T, R, B, L]) + '" fill="none" stroke="#e9cf8a" stroke-opacity=".8" stroke-width=".75" stroke-linejoin="round"/>';
  }
  /* 細星芒：四條漸細的尖線（放在鑽石後方，純線條，不用圓）*/
  function rays(L, w, op) {
    var out = '';
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var px = -d[1], py = d[0];
      out += '<polygon points="' + P([[d[0] * 2 + px * w, d[1] * 2 + py * w], [d[0] * L, d[1] * L], [d[0] * 2 - px * w, d[1] * 2 - py * w]]) + '" fill="#f6e6b4" fill-opacity="' + op + '"/>';
    });
    return out;
  }
  /* 微小的一點亮光 */
  function glint(x, y, L) {
    var w = L * .13;
    return '<path transform="translate(' + fmt(x) + ' ' + fmt(y) + ')" d="M0 ' + fmt(-L) + ' C' + fmt(w * .3) + ' ' + fmt(-w) + ' ' + fmt(w) + ' ' + fmt(-w * .3) + ' ' + fmt(L) + ' 0 C' +
      fmt(w) + ' ' + fmt(w * .3) + ' ' + fmt(w * .3) + ' ' + fmt(w) + ' 0 ' + fmt(L) + ' C' + fmt(-w * .3) + ' ' + fmt(w) + ' ' + fmt(-w) + ' ' + fmt(w * .3) + ' ' + fmt(-L) + ' 0 C' +
      fmt(-w) + ' ' + fmt(-w * .3) + ' ' + fmt(-w * .3) + ' ' + fmt(-w) + ' 0 ' + fmt(-L) + 'Z" fill="#fff4cf" fill-opacity=".7"/>';
  }

  /* 漸細筆劃：沿中心線取樣點，以 wf(t) 為寬度（t＝0..1）產生多邊形 */
  function taper(pts, wf, color, op) {
    var n = pts.length, Lp = [], Rp = [], i;
    for (i = 0; i < n; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      var tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      var nx = -ty / l, ny = tx / l, w = wf(i / (n - 1)) / 2;
      Lp.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
      Rp.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
    }
    return '<polygon points="' + P(Lp.concat(Rp.reverse())) + '" fill="' + color + '" fill-opacity="' + op + '"/>';
  }
  /* 捲草中心線：從 p 沿方向 a（弧度）走 len 的直線，再以對數螺線向 side（+1 順時針／-1 逆時針）捲入 */
  function scrollPts(p, a, len, R0, turns, side) {
    var pts = [], dx = Math.cos(a), dy = Math.sin(a), i;
    var st = Math.max(2, Math.round(len / 1.4));
    for (i = 0; i <= st; i++) pts.push([p[0] + dx * len * i / st, p[1] + dy * len * i / st]);
    var sx = p[0] + dx * len, sy = p[1] + dy * len;
    var cx = sx - dy * side * R0, cy = sy + dx * side * R0;
    var th0 = Math.atan2(sy - cy, sx - cx), total = turns * 2 * Math.PI, m = Math.ceil(total / .16), k = Math.log(1 / .13);
    for (i = 1; i <= m; i++) {
      var f = i / m, r = R0 * Math.exp(-k * f), th = th0 + side * total * f;
      pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
    }
    return pts;
  }

  var GOLD = '#e3c780';
  /* ── 新裝飾語彙：柳葉尖＋菱形小珠＋寶石座（不用捲草，靠漸細線條與尖端收尾做出華麗感） ── */
  /* 柳葉：從 (x,y) 朝角度 a（度）長 len、半寬 w，兩端皆尖 */
  function leaf(x, y, a, len, w, op) {
    return '<path transform="translate(' + fmt(x) + ' ' + fmt(y) + ') rotate(' + fmt(a) + ')" d="M0 0 C' + fmt(len * .24) + ' ' + fmt(-w) + ' ' + fmt(len * .64) + ' ' + fmt(-w * .85) + ' ' + fmt(len) +
      ' 0 C' + fmt(len * .64) + ' ' + fmt(w * .85) + ' ' + fmt(len * .24) + ' ' + fmt(w) + ' 0 0Z" fill="' + GOLD + '" fill-opacity="' + op + '"/>';
  }
  /* 菱形小珠（半寬 g，上下略長） */
  function bead(x, y, g, op) {
    return '<polygon transform="translate(' + fmt(x) + ' ' + fmt(y) + ')" points="' + P([[0, -g * 1.35], [g, 0], [0, g * 1.35], [-g, 0]]) + '" fill="' + GOLD + '" fill-opacity="' + op + '"/>';
  }
  /* 寶石座：寶石外圍一圈菱形細框＋四個尖爪，讓寶石像「鑲」上去而不是「放」上去 */
  function bezel(g, k) {
    var s = g * (k || 1.6), t = s * 1.16, out = '';
    out += '<polygon points="' + P([[0, -t], [s, 0], [0, t], [-s, 0]]) + '" fill="#0c0a0e" fill-opacity=".72" stroke="' + GOLD + '" stroke-opacity=".62" stroke-width=".7" stroke-linejoin="round"/>';
    [[0, -t, -90], [s, 0, 0], [0, t, 90], [-s, 0, 180]].forEach(function (c) { out += leaf(c[0], c[1], c[2], g * .9, g * .2, .8); });
    return out;
  }
  /* 沿圓弧（中心在原點）取樣 */
  function arcPts(R, a0, a1) {
    var out = [], n = Math.max(6, Math.ceil(Math.abs(a1 - a0) * R / 1.6)), i;
    for (i = 0; i <= n; i++) { var aa = a0 + (a1 - a0) * i / n; out.push([R * Math.cos(aa), R * Math.sin(aa)]); }
    return out;
  }
  function line(p, a, len) {
    var out = [], st = Math.max(2, Math.round(len / 1.4)), i;
    for (i = 0; i <= st; i++) out.push([p[0] + Math.cos(a) * len * i / st, p[1] + Math.sin(a) * len * i / st]);
    return out;
  }

  /* 角落：缺角外側的「第三道同心線」改成漸細的弧線，兩條直尾各以「小菱珠＋柳葉尖」收尾；
     弧線外側有兩段更細的陪襯弧，弧心外側長出一朵三葉小冠，缺角中心是鑲了座的寶石。
     以缺角圓心為原點，bottom＝true 時上下翻轉。 */
  function cornerOrn(cx, cy, bottom) {
    var R3 = COVE + 13, yy = 13, xx = Math.sqrt(R3 * R3 - yy * yy), TL = 17;
    var a0 = Math.atan2(yy, -xx), a1 = Math.atan2(xx, -yy), mid = (a0 + a1) / 2;
    var tailA = line([-xx, yy], Math.PI, TL).reverse();        // 往左的直尾（由外端到弧端）
    var arc = arcPts(R3, a0, a1).slice(1, -1);
    var tailB = line([-yy, xx], Math.PI / 2, TL);              // 往下的直尾
    var main = tailA.concat(arc, tailB);
    var g = '<g transform="translate(' + fmt(cx) + ' ' + fmt(cy) + ') scale(1 ' + (bottom ? -1 : 1) + ')">';
    g += taper(main, function (t) { return .35 + 2.2 * Math.pow(Math.sin(Math.PI * t), .85); }, GOLD, .88);
    /* 尾端：小菱珠＋柳葉尖 */
    g += bead(-xx - TL - 4.4, yy, 1.5, .88) + leaf(-xx - TL - 8, yy, 180, 12, 2.1, .92);
    g += bead(-yy, xx + TL + 4.4, 1.5, .88) + leaf(-yy, xx + TL + 8, 90, 12, 2.1, .92);
    /* 三葉小冠：沿弧心方向往外長，中葉長、兩側葉收窄 */
    var da = mid * 180 / Math.PI, ux = Math.cos(mid), uy = Math.sin(mid);
    var bx = (R3 + 1) * ux, by = (R3 + 1) * uy;
    g += leaf(bx, by, da, 14, 2.9, .94);
    g += leaf(bx + ux * 2, by + uy * 2, da - 33, 9.5, 1.6, .84);
    g += leaf(bx + ux * 2, by + uy * 2, da + 33, 9.5, 1.6, .84);
    g += bead(bx + ux * 18.4, by + uy * 18.4, 1.3, .88);
    /* 缺角中心：鑲了座的寶石 */
    g += bezel(8, 1.3) + rays(21, .55, .34) + gem(8) + glint(-2.6, -3.9, 3.4);
    return g + '</g>';
  }

  /* 中央扣飾：中心一顆鑲座寶石，兩側是杏仁形雙弧（內含小菱珠），
     弧尖之後是細軸線，盡頭是柳葉箭頭加兩片側葉，最後收成漸小的星粉。
     以中心為原點；vertical＝true 時旋轉 90°（沿垂直飾桿）。 */
  function centerOrn(cx, cy, vertical, sc) {
    var cr = 'rotate(' + (vertical ? -90 : 0) + ')';
    var g = '<g transform="translate(' + fmt(cx) + ' ' + fmt(cy) + ') rotate(' + (vertical ? 90 : 0) + ') scale(' + (sc || 1) + ')">';
    [-1, 1].forEach(function (d) {
      /* 杏仁形雙弧 */
      [-1, 1].forEach(function (v) {
        var pts = [], n = 28, i;
        for (i = 0; i <= n; i++) { var t = i / n; pts.push([d * (12.5 + 31 * t), v * 5.6 * Math.sin(Math.PI * Math.pow(t, .82))]); }
        g += taper(pts, function (t) { return .3 + 1.15 * Math.pow(Math.sin(Math.PI * t), .8); }, GOLD, .86);
      });
      /* 杏仁內的細軸＋小菱珠，杏仁之後的細軸線 */
      g += '<polygon points="' + fmt(d * 13) + ',-.45 ' + fmt(d * 58) + ',-.3 ' + fmt(d * 60) + ',0 ' + fmt(d * 58) + ',.3 ' + fmt(d * 13) + ',.45" fill="' + GOLD + '" fill-opacity=".62"/>';
      g += '<g transform="translate(' + fmt(d * 27) + ' 0) ' + cr + '">' + bead(0, 0, 2.1, .92) + glint(-.5, -1, 1.6) + '</g>';
      /* 軸線盡頭：柳葉箭頭＋兩片側葉 */
      g += leaf(d * 55, 0, d > 0 ? 0 : 180, 13, 2.5, .9);
      g += leaf(d * 54, 0, d > 0 ? 36 : 144, 8.5, 1.55, .8) + leaf(d * 54, 0, d > 0 ? -36 : -144, 8.5, 1.55, .8);
      /* 星粉 */
      [[72, 1.3, .7], [77, 1, .5], [81, .75, .35]].forEach(function (b) {
        g += '<circle cx="' + fmt(d * b[0]) + '" r="' + b[1] + '" fill="#f6e6b4" fill-opacity="' + b[2] + '"/>';
      });
    });
    return g + '<g transform="' + cr + '">' + bezel(6, 1.42) + rays(12, .5, .4) + gem(6) + glint(-1.8, -2.7, 3) + '</g></g>';
  }
  /* 按鈕四角：只留一顆小鑽石 */
  function gemSmall(cx, cy, g) {
    return '<g transform="translate(' + fmt(cx) + ' ' + fmt(cy) + ')">' + gem(g) + glint(-g * .3, -g * .45, g * .75) + '</g>';
  }

  var DEFS_COMMON =
    '<radialGradient id="nr-halo"><stop offset="0" stop-color="#fce4aa" stop-opacity=".3"/><stop offset="1" stop-color="#fce4aa" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="nr-mm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0c0"/><stop offset=".5" stop-color="#c5a059"/><stop offset="1" stop-color="#f0d88c"/></linearGradient>';

  function layout() {
    var m = root.getAttribute('data-nav-mode');
    if (m === 'left') {
      G.mode = 'left';
      G.W = RW + 40;
      G.H = window.innerHeight - G.top * 2;
      G.xe = G.W - 20; G.yc = G.H / 2;
      ov.style.left = '-40px'; ov.style.top = G.top + 'px';
      ov.style.width = G.W + 'px'; ov.style.height = G.H + 'px';
    } else if (m === 'top') {
      G.mode = 'top';
      G.navH = nav.offsetHeight;
      G.W = window.innerWidth;
      G.H = G.navH + 30;
      ov.style.left = '0'; ov.style.top = '0';
      ov.style.width = G.W + 'px'; ov.style.height = G.H + 'px';
    } else { G.mode = 'none'; return; }
    drawFrame();
    buildPath();
    placeInd();
  }

  function drawFrame() {
    var W = G.W, H = G.H, s = '';
    if (G.mode === 'left') {
      s =
        '<defs>' + DEFS_COMMON +
        '<linearGradient id="nr-m" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="' + fmt(W * .55) + '" y2="' + H + '">' +
          '<stop offset="0" stop-color="#f6e8b0" stop-opacity=".72"/><stop offset=".2" stop-color="#c5a059" stop-opacity=".58"/>' +
          '<stop offset=".45" stop-color="#7a5f2e" stop-opacity=".5"/><stop offset=".7" stop-color="#c5a059" stop-opacity=".62"/>' +
          '<stop offset="1" stop-color="#f6dea0" stop-opacity=".7"/></linearGradient>' +
        '<linearGradient id="nr-fl" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="150" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>' +
        '<linearGradient id="nr-fb" gradientUnits="userSpaceOnUse" x1="' + (G.xe - 110) + '" y1="0" x2="' + (G.xe - 36) + '" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>' +
        '<mask id="nr-ml" maskUnits="userSpaceOnUse" x="0" y="-4" width="' + (W + 30) + '" height="' + (H + 8) + '"><rect x="0" y="-4" width="' + (W + 30) + '" height="' + (H + 8) + '" fill="url(#nr-fl)"/></mask>' +
        '<mask id="nr-mb" maskUnits="userSpaceOnUse" x="0" y="-4" width="' + (W + 30) + '" height="' + (H + 8) + '"><rect x="0" y="-4" width="' + (W + 30) + '" height="' + (H + 8) + '" fill="url(#nr-fb)"/><rect x="' + fmt(G.xe - 16) + '" y="' + fmt(G.yc - 80) + '" width="32" height="160" fill="#000"/></mask>' +
        '</defs>' +
        '<path id="nr-cp" d="' + leftRod(0) + '" fill="none" stroke="none"/>' +
        '<g mask="url(#nr-ml)">' +
          '<path d="' + leftRod(6) + '" fill="none" stroke="#c5a059" stroke-opacity=".3" stroke-width="1"/>' +
          '<path d="' + leftRod(0) + '" fill="none" stroke="url(#nr-m)" stroke-width="1.5"/>' +
          '<g mask="url(#nr-mb)"><path d="' + leftRod(3) + '" fill="none" stroke="#fce4aa" stroke-opacity=".4" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="0 8.5"/></g>' +
        '</g>' +
        cornerOrn(G.xe, .75, false) + cornerOrn(G.xe, H - .75, true) +
        centerOrn(G.xe - 3, G.yc, true, 1);
      elBody.style.clipPath = "path('" + leftRod(0) + " V.75 Z')";
      elBody.style.webkitClipPath = elBody.style.clipPath;
    } else if (G.mode === 'top') {
      var y0 = G.navH, yo = y0 + 8.2, yb = y0 + 4.2, cx = W / 2;
      s =
        '<defs>' + DEFS_COMMON +
        '<linearGradient id="nr-th" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="' + W + '" y2="0">' +
          '<stop offset="0" stop-color="#c5a059" stop-opacity="0"/><stop offset=".1" stop-color="#c5a059" stop-opacity=".55"/>' +
          '<stop offset=".5" stop-color="#f3dfa0" stop-opacity=".95"/><stop offset=".9" stop-color="#c5a059" stop-opacity=".55"/>' +
          '<stop offset="1" stop-color="#c5a059" stop-opacity="0"/></linearGradient>' +
        '<linearGradient id="nr-tf" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="' + W + '" y2="0">' +
          '<stop offset="0" stop-color="#000"/><stop offset=".12" stop-color="#fff"/><stop offset=".88" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>' +
        '<mask id="nr-tm" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="url(#nr-tf)"/></mask>' +
        '<mask id="nr-tm2" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="url(#nr-tf)"/><rect x="' + fmt(cx - 62) + '" y="0" width="124" height="' + H + '" fill="#000"/></mask>' +
        '</defs>' +
        '<path id="nr-cp" d="' + topRod(yo) + '" fill="none" stroke="none"/>' +
        '<g mask="url(#nr-tm)"><path d="' + topRod(yo) + '" stroke="url(#nr-th)" stroke-width="1.6" fill="none"/></g>' +
        '<g mask="url(#nr-tm2)"><path d="' + topRod(yb) + '" stroke="#fce4aa" stroke-opacity=".4" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="0 8.5" fill="none"/></g>' +
        centerOrn(cx, y0 + 6.2, false, .78);
    }
    elSvg.setAttribute('viewBox', '0 0 ' + (W + 30) + ' ' + H);
    elSvg.setAttribute('width', W + 30); elSvg.setAttribute('height', H);
    elSvg.innerHTML = s;
  }

  /* 邊緣流光路徑：直接從 SVG 路徑取樣（約 2px 一點），形狀怎麼變都不用改 */
  function buildPath() {
    var pts = [], p = elSvg.querySelector('#nr-cp');
    if (p && p.getTotalLength) {
      var L = p.getTotalLength();
      for (var l = 0; l <= L; l += 2) { var q = p.getPointAtLength(l); pts.push([q.x, q.y]); }
    }
    G.pts = pts;
  }

  function fit(c, w, h) {
    if (c._w === w && c._h === h) return;
    c._w = w; c._h = h;
    c.width = Math.round(w * DPR); c.height = Math.round(h * DPR);
    c.style.width = w + 'px'; c.style.height = h + 'px';
  }

  /* ───────── 4. 邊緣流光 ───────── */
  var t0 = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || G.mode === 'none' || !G.pts || !G.pts.length) return;
    var t = (now - t0) / 1000, pts = G.pts, n = pts.length;
    var cw = G.W + 30 + 2 * M, ch = G.H + 2 * M;
    fit(cvs, cw, ch);
    var ctx = cvs.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, M * DPR, M * DPR);
    ctx.clearRect(-M, -M, cw, ch);
    ctx.lineCap = 'round';

    var speed = G.mode === 'top' ? COMET_SPEED * 1.5 : COMET_SPEED;
    var tail = Math.round(COMET_TAIL / 2), pause = 60;
    var head = ((t * speed) / 2) % (n + tail + pause);
    var N = 54, step = tail / N;
    function ptAt(idx) {
      if (idx < 0 || idx > n - 1) return null;
      var i0 = Math.floor(idx), i1 = Math.min(n - 1, i0 + 1), f = idx - i0;
      return [pts[i0][0] + (pts[i1][0] - pts[i0][0]) * f, pts[i0][1] + (pts[i1][1] - pts[i0][1]) * f];
    }
    function edge(x) {
      var e = Math.min(1, Math.max(0, (x - 4) / 70));
      if (G.mode === 'top') e = Math.min(e, Math.max(0, (G.W - x) / 120), 1);
      return e;
    }
    var prev = ptAt(head), headPt = prev;
    for (var i = 1; i <= N; i++) {
      var k = i / N, cur = ptAt(head - i * step);
      if (prev && cur) {
        var a = Math.pow(1 - k, 1.7) * COMET_PEAK * edge(cur[0]);
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(cur[0], cur[1]);
        ctx.lineWidth = 4.4 * (1 - k * .55); ctx.strokeStyle = 'rgba(197,160,89,' + (a * .24) + ')'; ctx.stroke();
        ctx.lineWidth = 1.5 * (1 - k * .5);  ctx.strokeStyle = 'rgba(255,238,196,' + a + ')';        ctx.stroke();
      }
      prev = cur || prev;
    }
    if (headPt) {
      var g = ctx.createRadialGradient(headPt[0], headPt[1], 0, headPt[0], headPt[1], 10);
      g.addColorStop(0, 'rgba(255,246,214,' + (COMET_PEAK * .95 * edge(headPt[0])) + ')');
      g.addColorStop(1, 'rgba(255,230,170,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(headPt[0], headPt[1], 10, 0, 6.2832); ctx.fill();
    }
  }
  if (!reduce) requestAnimationFrame(frame);

  /* ───────── 5. 目前頁面指示光（左側，在飾桿上滑動）───────── */
  var settleUntil = 0, tracking = false, lastActive = null;
  function activeItem() { return nav.querySelector('.nav-item.active:not(.nav-subitem)'); }

  function placeInd() {
    var act = activeItem();
    if (!act || G.mode !== 'left') { ind.style.opacity = 0; return; }
    var r = act.getBoundingClientRect();
    if (!r.height || !r.width) { ind.style.opacity = 0; return; }
    var isGroup = act.classList.contains('nav-group');
    var cy = r.top + (isGroup ? 31 : r.height / 2);
    var nb = nav.getBoundingClientRect();
    var inView = cy >= nb.top + 6 && cy <= nb.bottom - 6;
    var IH = 104, local = Math.min(Math.max(cy - G.top, 44), G.H - 44);
    ind.className = 'nrp-ind v';
    ind.style.setProperty('--ix', fmt(G.xe - 3 - 9) + 'px');
    ind.style.setProperty('--iy', fmt(local - IH / 2) + 'px');
    ind.style.opacity = inView ? 1 : .35;
    if (act !== lastActive) {
      if (lastActive && !reduce) { ind.classList.remove('flare'); void ind.offsetWidth; ind.classList.add('flare'); }
      lastActive = act;
    }
  }
  function kick() {
    settleUntil = performance.now() + 1100;
    if (tracking) return;
    tracking = true;
    (function loop() {
      placeInd();
      if (performance.now() < settleUntil) requestAnimationFrame(loop); else tracking = false;
    })();
  }

  /* ───────── 6. 切換按鈕：凹角雕版 ───────── */
  var btn = document.getElementById('nav-mode-toggle');
  function plaque() {
    if (!btn) return;
    var left = root.getAttribute('data-nav-mode') === 'left';
    var bw = btn.offsetWidth, bh = btn.offsetHeight;
    if (!bw || !bh) return;
    var ix = left ? 0 : 11, iy = left ? 0 : 12;
    var w = bw - ix * 2, h = bh - iy * 2, narrow = w < 80, r = narrow ? 8 : 10, sIn = narrow ? 3.6 : 4.5, gg = narrow ? 3.4 : 4.4;
    var svg = btn.querySelector(':scope > .nrb-svg');
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'nrb-svg');
      svg.setAttribute('aria-hidden', 'true');
      btn.insertBefore(svg, btn.firstChild);
    }
    svg.style.left = ix + 'px'; svg.style.top = iy + 'px';
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.style.setProperty('--sw', w + 'px');
    var a = .75, x0 = a, y0 = a, x1 = w - a, y1 = h - a;
    var outer = 'M' + (x0 + r) + ' ' + y0 + ' H' + (x1 - r) + ' A' + r + ' ' + r + ' 0 0 0 ' + x1 + ' ' + (y0 + r) +
      ' V' + (y1 - r) + ' A' + r + ' ' + r + ' 0 0 0 ' + (x1 - r) + ' ' + y1 + ' H' + (x0 + r) +
      ' A' + r + ' ' + r + ' 0 0 0 ' + x0 + ' ' + (y1 - r) + ' V' + (y0 + r) + ' A' + r + ' ' + r + ' 0 0 0 ' + (x0 + r) + ' ' + y0 + 'Z';
    var rr = r + sIn, k = Math.sqrt(rr * rr - sIn * sIn);
    var inner = 'M' + fmt(x0 + k) + ' ' + (y0 + sIn) + ' H' + fmt(x1 - k) + ' A' + rr + ' ' + rr + ' 0 0 0 ' + (x1 - sIn) + ' ' + fmt(y0 + k) +
      ' V' + fmt(y1 - k) + ' A' + rr + ' ' + rr + ' 0 0 0 ' + fmt(x1 - k) + ' ' + (y1 - sIn) + ' H' + fmt(x0 + k) +
      ' A' + rr + ' ' + rr + ' 0 0 0 ' + (x0 + sIn) + ' ' + fmt(y1 - k) + ' V' + fmt(y0 + k) + ' A' + rr + ' ' + rr + ' 0 0 0 ' + fmt(x0 + k) + ' ' + (y0 + sIn) + 'Z';
    svg.innerHTML =
      '<defs><radialGradient id="nr-halo"><stop offset="0" stop-color="#fce4aa" stop-opacity=".3"/><stop offset="1" stop-color="#fce4aa" stop-opacity="0"/></radialGradient><clipPath id="nrb-c"><path d="' + outer + '"/></clipPath>' +
      '<linearGradient id="nrb-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e8b0"/><stop offset=".5" stop-color="#b08d45"/><stop offset="1" stop-color="#f0d88c"/></linearGradient>' +
      '<linearGradient id="nrb-s" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff6d6" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      '<path class="nrb-fill" d="' + outer + '"/>' +
      '<g clip-path="url(#nrb-c)"><rect class="nrb-sh" x="' + fmt(-w * .6) + '" y="0" width="' + fmt(w * .5) + '" height="' + h + '" fill="url(#nrb-s)"/></g>' +
      '<path class="nrb-in" d="' + inner + '"/>' +
      '<path class="nrb-out" d="' + outer + '"/>' +
      '<g class="nrb-ros">' + gemSmall(x0, y0, gg) + gemSmall(x1, y0, gg) + gemSmall(x0, y1, gg) + gemSmall(x1, y1, gg) + '</g>';
  }

  /* ───────── 7. 事件掛鉤 ───────── */
  new MutationObserver(kick).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  nav.addEventListener('scroll', placeInd, { passive: true });
  function relayout() { layout(); plaque(); kick(); }
  if (window.ResizeObserver) {
    new ResizeObserver(relayout).observe(nav);
    if (btn) new ResizeObserver(plaque).observe(btn);
  }
  window.addEventListener('resize', relayout);
  new MutationObserver(relayout).observe(root, { attributes: true, attributeFilter: ['data-nav-mode'] });

  /* ───────── 8. 金粉 ───────── */
  function spawnAmbient() {
    if (reduce || document.hidden || G.mode !== 'left') return;
    if (elBody.querySelectorAll('.nrp-spark').length >= 5) return;
    var s = document.createElement('span');
    var size = 2 + Math.random() * 1.6;
    s.className = 'nrp-spark';
    s.style.width = s.style.height = size + 'px';
    s.style.left = (30 + Math.random() * (G.xe - 70)) + 'px';
    s.style.top = (G.H * (.5 + Math.random() * .45)) + 'px';
    elBody.appendChild(s);
    var rise = 70 + Math.random() * 110, dur = 7000 + Math.random() * 4000, dx = (Math.random() - .5) * 26;
    s.animate([
      { transform: 'translate(0,0)', opacity: 0 },
      { opacity: .7, offset: .25 },
      { opacity: .45, offset: .7 },
      { transform: 'translate(' + dx + 'px,' + (-rise) + 'px)', opacity: 0 }
    ], { duration: dur, easing: 'ease-out' }).onfinish = function () { s.remove(); };
  }
  setInterval(spawnAmbient, SPARK_EVERY);

  /* hover 小金粉（一次性，約 1.4 秒） */
  var lastBurst = new WeakMap();
  function burst(item) {
    if (reduce || !canHover) return;
    var now = performance.now();
    if (now - (lastBurst.get(item) || 0) < 600) return;
    lastBurst.set(item, now);
    var r = item.getBoundingClientRect();
    if (!r.height) return;
    var acc = (getComputedStyle(item).getPropertyValue('--acc') || '255,232,176').trim();
    var left = G.mode === 'left';
    for (var i = 0; i < 5; i++) {
      var s = document.createElement('span');
      var size = 2 + Math.random() * 2;
      s.className = 'nrp-bspark';
      s.style.width = s.style.height = size + 'px';
      s.style.background = 'radial-gradient(circle at 38% 35%, #fff 0%, rgb(' + acc + ') 45%, rgba(' + acc + ',.2) 100%)';
      s.style.boxShadow = '0 0 6px 1px rgba(' + acc + ',.55)';
      var x = left ? r.left + 14 + Math.random() * 150 : r.left + r.width * (.3 + Math.random() * .4);
      var y = left ? r.top + 14 + Math.random() * (r.height - 24) : r.bottom - 12 + Math.random() * 6;
      s.style.left = x + 'px'; s.style.top = y + 'px';
      sparkLayer.appendChild(s);
      var dx = left ? 10 + Math.random() * 30 : (Math.random() - .5) * 40, dy = -(18 + Math.random() * 30), dur = 1000 + Math.random() * 700;
      s.animate([
        { transform: 'translate(0,0) scale(.6)', opacity: 0 },
        { opacity: 1, offset: .2 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1)', opacity: 0 }
      ], { duration: dur, easing: 'ease-out', delay: i * 60 }).onfinish = (function (el) { return function () { el.remove(); }; })(s);
    }
  }
  nav.querySelectorAll('.nav-item:not(.nav-subitem)').forEach(function (it) {
    it.addEventListener('mouseenter', function () { burst(it); });
  });

  /* 啟動 */
  relayout();
  window.addEventListener('load', relayout);
})();
