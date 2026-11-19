/* ═══════════════════════════════════════════════════════════════════════
 * 市場物品頁：版面分配器（MarketLayout）
 *
 * 為什麼有這支檔案：以前「統計列、世界列、供應鏈圖」各自只管自己能不能放得下，彼此不知道對方佔了多少高度／寬度，
 * 全部搶同一份預算，搶不贏就換行、被擠出畫面。窄、矮、字級放大、切換頂部／側邊導覽，其實都只是「可用預算變了」。
 *
 * 做法：每個區塊有幾種「形態」，由豐富到精簡；這裡統一量出實際可用空間，先全部用最豐富的形態，
 * 放不下就依「資訊價值最低的先讓位」的順序降級，直到放得下。字級不縮；大畫面自然停在最豐富的形態。
 *   世界列 wl：0 大卡（原樣）→ 1 單行籌碼 → 2 迷你（所有世界＋我的世界＋「其他 N 個」可展開）
 *   標題列 hdr：0 文字按鈕 → 1 圖示按鈕（tooltip 保留）
 *   決策列 band：0 完整標籤 → 1 簡稱（成交均價→均價）
 *   供應鏈 chain：0 寬鬆 → 1、2 間距逐級收緊 → 3 橫式小卡（只改排列，字級不變）
 *   主條 hero（依寬度，自成一格）：1 單行 → 2 兩行（原版）→ 3 三層 → 4 四層
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const ML = { hooks: {} };

  /* ── 供應鏈圖：量測＋連接線（連接線畫法完全沿用原版：圓角轉折、金色漸層、箭頭、三層菱形光點、匯流菱形接點） ── */
  ML.chain = function (box, total) {
    const root = box.querySelector('.msc-root');
    if (!root) return null;
    const heroEl = root.querySelector('.msc-hero');
    const upRow = root.querySelector('.msc-row-up');
    const downRow = root.querySelector('.msc-row-down');
    const moreCell = box.querySelector('[data-mk-usedin-more]');
    const upCells = upRow ? Array.prototype.filter.call(upRow.children, function (c) { return !c.classList.contains('msc-more'); }) : [];
    const nameEl = heroEl.querySelector('.msc-hero-name');
    const cmpsEl = heroEl.querySelector('.msc-hero-cmps');
    const MIN_CELL_W = [112, 112, 108, 210]; // 各層級的卡片最小寬度（直式卡片名稱可兩行所以較窄；橫式要放圖示所以較寬）
    const COL_GAP = 8;
    function visibleCells(row) { return Array.prototype.filter.call(row.children, function (c) { return !c.hidden; }); }
    function colsFor(lv, row, n) {
      const w = row.clientWidth || 0;
      return w > 0 ? Math.max(1, Math.floor((w + COL_GAP) / (MIN_CELL_W[lv] + COL_GAP))) : n;
    }
    function layoutRow(row, lv) {
      const n = visibleCells(row).length;
      if (!n) return;
      let cols = Math.min(colsFor(lv, row, n), n);
      const rows = Math.ceil(n / cols);
      cols = Math.ceil(n / rows);                 // 5張寫成3＋2，不寫成4＋1
      row.style.setProperty('--msc-cols', String(cols));
    }
    // 這個層級下，用途那排放得下幾張：全部放得下就全顯示；放不下，最後一格留給「還有N種」
    function shownFor(lv, mobile) {
      const maxShown = upCells.length;
      if (!maxShown) return 0;
      if (mobile) return total > 3 ? 3 : maxShown;
      const cols = colsFor(lv, upRow, maxShown + 1);
      if (total <= cols) return Math.min(maxShown, total);
      // 橫式小卡（最後手段，高度吃緊）：寧可只放 cols-1 張＋「還有N種」湊成一排；其他層級至少放 2 張
      return lv >= 3 ? Math.max(1, Math.min(maxShown, cols - 1)) : Math.max(Math.min(2, maxShown), Math.min(maxShown, cols - 1));
    }
    // 連接線：沿用原本的畫法——從出發點垂直走到中段、橫向轉彎（圓角）、再垂直走到終點，全部匯到主條中心；
    // 箭頭一律往上；光點沿用原本的接力動畫（材料→主條→用途）。換行時，外排的卡片用一小段淡線掛在內排卡片下面。
    function drawLinks() {
      const svg = root.querySelector('.msc-links');
      if (!svg) return;
      const rr = root.getBoundingClientRect(), hr = heroEl.getBoundingClientRect();
      svg.setAttribute('width', rr.width); svg.setAttribute('height', rr.height);
      svg.setAttribute('viewBox', '0 0 ' + rr.width + ' ' + rr.height);
      const cx = hr.left + hr.width / 2 - rr.left;
      let defs = '', parts = '', gn = 0;
      function elbow(a, b, bendY, r) {
        if (Math.abs(a.x - b.x) < 1) return 'M' + a.x + ',' + a.y + ' L' + b.x + ',' + b.y;
        const sy = bendY >= a.y ? 1 : -1, sx = b.x >= a.x ? 1 : -1;
        return 'M' + a.x + ',' + a.y + ' L' + a.x + ',' + (bendY - sy * r) + ' Q' + a.x + ',' + bendY + ' ' + (a.x + sx * r) + ',' + bendY +
          ' L' + (b.x - sx * r) + ',' + bendY + ' Q' + b.x + ',' + bendY + ' ' + b.x + ',' + (bendY + sy * r) + ' L' + b.x + ',' + b.y;
      }
      function link(a, b, phase) {
        const len = Math.abs(a.y - b.y);
        if (len < 8) return;
        gn++;
        const gid = 'mscg' + gn, bendY = (a.y + b.y) / 2, r = Math.max(3, Math.min(7, len / 2 - 2)), d = elbow(a, b, bendY, r);
        const k = Math.max(.45, Math.min(1, len / 44)); // 光點大小跟著連接線長度縮放，短線不會被光點塞滿
        defs += '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '">' +
          '<stop offset="0%" stop-color="#c5a059" stop-opacity="0.7"/><stop offset="100%" stop-color="#fcf6ba" stop-opacity="1"/></linearGradient>';
        parts += '<path class="cyc-arc-line" stroke="url(#' + gid + ')" d="' + d + '"/>' +
          '<path class="cyc-arc-tip" d="M' + (b.x - 5) + ',' + (b.y + 5) + ' L' + b.x + ',' + b.y + ' L' + (b.x + 5) + ',' + (b.y + 5) + '"/>' +
          '<g class="mk-spark mk-spark-' + phase + '" style="offset-path:path(\'' + d + '\');offset-rotate:auto 90deg">' +
            '<path class="cyc-spark-outer" d="M0,' + (-26 * k) + ' L' + (10 * k) + ',0 L0,' + (26 * k) + ' L' + (-10 * k) + ',0 Z"/>' +
            '<path class="cyc-spark-mid" d="M0,' + (-17 * k) + ' L' + (6 * k) + ',0 L0,' + (17 * k) + ' L' + (-6 * k) + ',0 Z"/>' +
            '<path class="cyc-spark-core" d="M0,' + (-8 * k) + ' L' + (2.4 * k) + ',0 L0,' + (8 * k) + ' L' + (-2.4 * k) + ',0 Z"/>' +
          '</g>';
      }
      function stub(x, y1, y2) { // 外排卡片掛在內排卡片下面的淡線
        if (Math.abs(y1 - y2) < 4) return;
        parts += '<path d="M' + x + ',' + y1 + ' L' + x + ',' + y2 + '" stroke="rgba(197,160,89,.5)" stroke-width="1.2" fill="none" stroke-dasharray="2 3"/>';
      }
      function port(y) { // 主條邊緣上的匯流點（菱形）
        parts += '<path d="M' + cx + ',' + (y - 4.5) + ' L' + (cx + 4.5) + ',' + y + ' L' + cx + ',' + (y + 4.5) + ' L' + (cx - 4.5) + ',' + y + ' Z" fill="#fcf6ba" opacity=".9"/>';
      }
      function rowsOf(row) { // 依上緣位置分排，由上到下
        const cells = visibleCells(row).map(function (c) { const r = c.getBoundingClientRect(); return { l: r.left - rr.left, r: r.right - rr.left, t: r.top - rr.top, b: r.bottom - rr.top }; });
        const groups = [];
        cells.forEach(function (c) { let g = groups.find(function (x) { return Math.abs(x.t - c.t) < 3; }); if (!g) { g = { t: c.t, cells: [] }; groups.push(g); } g.cells.push(c); });
        return groups.sort(function (a, b) { return a.t - b.t; });
      }
      function overlapX(a, b) { const l = Math.max(a.l, b.l), r = Math.min(a.r, b.r); return r - l > 8 ? (l + r) / 2 : null; }
      if (upRow) {
        const g = rowsOf(upRow), near = g[g.length - 1], hy = hr.top - rr.top;
        if (near) {
          near.cells.forEach(function (c) { link({ x: cx, y: hy }, { x: (c.l + c.r) / 2, y: c.b }, 'up'); });
          port(hy);
          for (let i = g.length - 2; i >= 0; i--) g[i].cells.forEach(function (c) { // 上方外排：卡片下緣 → 下一排卡片上緣
            let best = null; g[i + 1].cells.forEach(function (n) { const x = overlapX(c, n); if (x != null && best == null) best = x; });
            if (best != null) stub(best, c.b, g[i + 1].t);
          });
        }
      }
      if (downRow) {
        const g = rowsOf(downRow), near = g[0], hy = hr.bottom - rr.top;
        if (near) {
          near.cells.forEach(function (c) { link({ x: (c.l + c.r) / 2, y: c.t }, { x: cx, y: hy }, 'down'); });
          port(hy);
          for (let i = 1; i < g.length; i++) g[i].cells.forEach(function (c) { // 下方外排：卡片上緣 → 上一排卡片下緣
            let best = null; g[i - 1].cells.forEach(function (n) { const x = overlapX(c, n); if (x != null && best == null) best = x; });
            if (best != null) stub(best, c.t, g[i - 1].cells[0].b);
          });
        }
      }
      svg.innerHTML = '<defs>' + defs + '</defs>' + parts;
    }
    // 主條形態：依「實際放不放得下」從最舒服的一行開始試（名稱被截、買做價格換行、整條橫向溢出都算放不下）
    function heroOk() {
      return heroEl.scrollWidth <= heroEl.clientWidth + 1 &&
        cmpsEl.getBoundingClientRect().height <= 44 &&
        nameEl.getBoundingClientRect().height <= 54;
    }
    function fitHero() {
      for (let f = 1; f <= 4; f++) { root.dataset.hero = String(f); if (heroOk()) return; }
    }
    function setLevel(lv, stacked) {
      root.dataset.lv = String(lv);
      fitHero();
      const shown = stacked ? shownFor(0, true) : shownFor(lv, false);
      upCells.forEach(function (c, i) { c.hidden = i >= shown; });
      if (moreCell) {
        moreCell.hidden = shown >= total;
        const b = moreCell.querySelector('.msc-more-n'); if (b) b.textContent = (total - shown) + '種';
      }
      if (upRow) layoutRow(upRow, lv);
      if (downRow) layoutRow(downRow, lv);
      if (stacked) { root.dataset.lv = '0'; }
    }
    return { root: root, setLevel: setLevel, draw: drawLinks };
  };

  /* ── 世界列：形態 0 維持原本的格狀大卡；1、2 由 CSS 排成單行籌碼 ── */
  ML.layoutWorld = function (strip) {
    if (!strip || !strip.isConnected) return;
    if ((strip.dataset.wl || '0') !== '0') { strip.style.display = ''; strip.style.gridTemplateColumns = ''; return; }
    const n = strip.querySelectorAll('.mws-cell').length, W = strip.clientWidth;
    if (!n || !W) return;
    const GAP = 5, MIN_W = 66;
    const k = Math.max(1, Math.floor((W + GAP) / (MIN_W + GAP)));
    const rows = Math.ceil(n / k), cols = Math.ceil(n / rows);
    strip.style.display = 'grid';
    strip.style.gridTemplateColumns = 'repeat(' + cols + ',minmax(0,1fr))';
  };

  const SHORT = [['在售最低', '最低'], ['成交均價', '均價'], ['賣速', '賣速'], ['成交頻率', '頻率']];

  /* ── 統一分配 ──
   * 失敗的是哪一邊，就從那一邊的階梯往下降一級：
   *   標題列／決策列自己換行 → 先降它們（它們同時吃掉兩欄的高度）
   *   左欄放不下（掛單清單被擠）→ 世界列 → 標題列 → 決策列 → 世界列迷你
   *   右欄放不下（供應鏈被擠）  → 供應鏈間距 1、2 → 標題列 → 決策列 → 供應鏈橫式小卡 */
  const LEFT = [['wl', 1], ['hdr', 1], ['band', 1], ['wl', 2]];
  const RIGHT = [['chain', 1], ['chain', 2], ['hdr', 1], ['band', 1], ['chain', 3]];

  ML.fitDetail = function (pane) {
    const cols = pane.querySelector('.market-detail-columns');
    if (!cols) return;
    const hdr = pane.querySelector('.market-detail-header');
    const band = pane.querySelector('#mk-decision-band');
    const left = cols.querySelector('.market-col-market');
    const right = cols.querySelector('.market-col-supply');
    const strip = pane.querySelector('#mk-world-strip');
    const box = pane.querySelector('#mk-detail-supply');
    const statsEl = pane.querySelector('#mk-band-stats');
    const verdictEl = pane.querySelector('#mk-band-verdict');
    const statBar = pane.querySelector('#mk-stat-bar');
    const chain = box && box.__mlChain && box.__mlChain.root.isConnected ? box.__mlChain : null;
    const stacked = !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);

    if (hdr) { // 圖示形態需要 tooltip：沒有自己的 title 就用按鈕文字
      Array.prototype.forEach.call(hdr.querySelectorAll('.market-solve-btn,.market-watch-btn-header'), function (b) {
        const txt = (b.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt && (!b.title || b.dataset.autoTitle)) { b.title = txt; b.dataset.autoTitle = '1'; }
      });
    }
    if (statBar) {
      Array.prototype.forEach.call(statBar.querySelectorAll('.mst-label'), function (l) {
        if (l.dataset.short) return;
        const t = (l.textContent || '').trim();
        for (let i = 0; i < SHORT.length; i++) { if (t.indexOf(SHORT[i][0]) === 0) { l.dataset.short = SHORT[i][1]; break; } }
      });
    }

    const state = { chain: 0, wl: 0, hdr: 0, band: 0 };
    function apply() {
      if (hdr) hdr.dataset.hdr = String(state.hdr);
      if (band) band.dataset.band = String(state.band);
      if (strip) { strip.dataset.wl = String(state.wl); ML.layoutWorld(strip); }
      if (statBar && ML.hooks.fitStat) ML.hooks.fitStat(statBar);
      if (chain) chain.setLevel(state.chain, stacked);
    }
    function hdrOk() {
      if (!hdr) return true;
      let m = 0;
      Array.prototype.forEach.call(hdr.children, function (c) { m = Math.max(m, c.offsetHeight); });
      return hdr.offsetHeight <= m + 4;           // 比最高的那一個還高＝有東西換到第二行
    }
    function bandOk() {
      if (!band || band.hidden) return true;
      const m = Math.max(statsEl ? statsEl.offsetHeight : 0, verdictEl ? verdictEl.offsetHeight : 0);
      const lvl = statBar ? (statBar.dataset.fit || '0') : '0';
      return band.offsetHeight <= m + 16 && lvl === '0'; // 單排，而且統計列不用縮字就放得下
    }
    const slot = pane.querySelector('#mk-listing-table-slot');
    const MIN_LIST = 150; // 掛單清單至少要看得到約 5 列，低於這個就算左欄放不下，先讓別的區塊讓位
    function leftOk() { return stacked || !left || ((!slot || slot.clientHeight >= MIN_LIST) && left.scrollHeight <= left.clientHeight + 1); }
    function rightOk() { return stacked || !right || right.scrollHeight <= right.clientHeight + 1; }
    function nextStep() {
      if (!hdrOk() && state.hdr < 1) return ['hdr', 1];
      if (!bandOk() && state.band < 1) return ['band', 1];
      const ladders = [];
      if (!leftOk()) ladders.push(LEFT);
      if (!rightOk()) ladders.push(RIGHT);
      for (let i = 0; i < ladders.length; i++) {
        for (let j = 0; j < ladders[i].length; j++) { const st = ladders[i][j]; if (state[st[0]] < st[1]) return st; }
      }
      return null;
    }
    apply();
    for (let i = 0; i < 12; i++) {
      const st = nextStep();
      if (!st) break;
      state[st[0]] = st[1];
      apply();
    }
    if (chain) chain.draw();
  };

  /* ── 觸發：內容渲染完、視窗／欄位尺寸改變、導覽模式切換、字型載入完、標題列文字改變，都排進同一次重算 ── */
  let queued = 0, installed = false, hdrEl = null, hdrMO = null;
  function paneEl() { return document.getElementById('mk-pane-item'); }
  function install() {
    if (installed) return;
    const pane = paneEl();
    if (!pane) return;
    installed = true;
    if (typeof ResizeObserver !== 'undefined') {
      let key = '';
      new ResizeObserver(function () {
        const k = Math.round(pane.clientWidth) + ',' + Math.round(pane.clientHeight);
        if (k === key) return;                    // 只有舞台本身的寬高真的變了才重算（內部排版改變不會觸發，不會循環）
        key = k; ML.schedule();
      }).observe(pane);
    }
    window.addEventListener('resize', function () { ML.schedule(); });
    if (typeof MutationObserver !== 'undefined') {
      // 頂部／側邊導覽切換時，版面要經過動畫才定位好，分幾次補算，連接線才不會停在舊位置
      new MutationObserver(function () { [0, 150, 400].forEach(function (ms) { setTimeout(ML.schedule, ms); }); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-nav-mode'] });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ML.schedule(); });
  }
  ML.schedule = function () {
    install();
    if (queued) return;
    queued = requestAnimationFrame(function () {
      queued = 0;
      const pane = paneEl();
      if (!pane || !pane.isConnected || pane.offsetParent === null) return; // 分頁沒顯示時量不準，等它顯示（尺寸觀察會再觸發）
      const hdr = pane.querySelector('.market-detail-header');
      if (hdr && hdr !== hdrEl && typeof MutationObserver !== 'undefined') { // 「查詢是否可製作⋯」→「製作求解」這類文字變動會改變按鈕寬度
        hdrEl = hdr; if (hdrMO) hdrMO.disconnect();
        hdrMO = new MutationObserver(function () { ML.schedule(); });
        hdrMO.observe(hdr, { childList: true, characterData: true, subtree: true });
      }
      ML.fitDetail(pane);
    });
  };

  window.MarketLayout = ML;
})();
