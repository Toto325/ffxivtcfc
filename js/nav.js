/* nav.js — 左側／頂部選單手動切換 ＋ 視窗寬度自動切換
 *
 * data-nav-mode 屬性「第一次決定值」的關鍵邏輯寫在 index.html <head>
 * 最前面的內聯 <script>，必須在任何 CSS 套用前同步執行完，否則畫面
 * 會先閃一下錯的版面才變成對的（FOUC）。這支檔案不重複那段邏輯，
 * 只負責頁面互動的部分：
 *   1. 切換按鈕的點擊行為、更新提示文字
 *   2. 頂部模式下，選單可能因為視窗變窄而自動換成兩行，
 *      這裡量測選單實際高度寫入 --nav-top-h-actual，
 *      讓下方內容區（#viewport）的 top 永遠對齊選單真正的高度，
 *      不會被多出來的第二行蓋住。
 *   3. 視窗寬度自動切換（本次新增）
 *
 * ── 選單模式規則（簡化版）────────────────────────────────────────────
 *   - 窄螢幕（<= 900px，手機）：一律使用頂部選單（含手機漢堡收合），不提供切換——
 *     左側選單會佔掉大半個畫面，在手機上沒有意義，切換按鈕也一併隱藏。
 *   - 寬螢幕：使用者可用切換按鈕在左側／頂部之間切換，選擇存在 localStorage。
 *   - 視窗寬度跨越門檻時：變窄 → 暫時顯示頂部；變寬 → 回到使用者原本選的模式。
 *     自動切換「不會」改寫 localStorage，所以偏好不會被窄螢幕弄丟。
 */
(function () {
  // embed 彈窗實例：沒有選單，也絕不能改寫跟外層共用的 localStorage 選單偏好
  if (/embed=1/.test(window.location.hash)) return;
  var STORAGE_KEY = 'ff14fc-nav-mode';
  var BREAKPOINT = 900; // 必須與 index.html <head> 內聯 script 的門檻一致
  var root = document.documentElement;
  var btn = document.getElementById('nav-mode-toggle');

  // ── 同一次瀏覽期間的「復原依據」初始值：優先用 localStorage 目前存的
  //    畫面模式（新規則下，它就是上次關閉／整理頁面時螢幕上顯示的模式），
  //    完全沒存過才以 'left' 為基準。
  var userPref = (function () {
    var m;
    try { m = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    return (m === 'left' || m === 'top') ? m : 'left';
  })();

  var lastNarrow = window.innerWidth <= BREAKPOINT;

  function currentMode() {
    return root.getAttribute('data-nav-mode') === 'top' ? 'top' : 'left';
  }

  // 手機窄螢幕的頂部模式：選單平常只剩一條細列（漢堡按鈕），展開時是「浮在內容上方」，
  // 所以內容區的 top 固定對齊那條細列，不能再用展開後的高度來量。
  function isMobileTop() {
    return !!document.getElementById('nav-burger') && currentMode() === 'top' && window.innerWidth <= BREAKPOINT;
  }

  function syncTopNavHeight() {
    if (currentMode() !== 'top') return;
    if (isMobileTop()) { root.style.removeProperty('--nav-top-h-actual'); return; }
    var nav = document.querySelector('.royal-nav');
    if (!nav) return;
    var h = nav.offsetHeight;
    if (h > 0) root.style.setProperty('--nav-top-h-actual', h + 'px');
  }

  /* 頂部選單的「每排幾個」響應式計算：以後選單項目變多（例如變成10、11個）不用再手動改CSS數字。
   * 只算最上層的項目（不含展開子選單「遠航探索」裡面那幾個，那些平常收起來不佔格子）。
   * 做法：先依目前寬度換算「這排最多塞得下幾個」當上限，用這個上限反推「最少要幾排」，
   * 再用「幾排」往回算出「平均分下來每排要幾個」——這樣算出來的每排數量，天生就不會讓最後一排
   * 只單獨剩1個（比如9個項目，上限4個一排，最少要3排，3排平均下來剛好每排3個，不會有落單的）。
   * NAV_TOP_WIDE_BP 要跟 page-content.css 那個 @media (min-width:920px) 的門檻數字一致，改一邊要一起改。 */
  var NAV_TOP_WIDE_BP = 920;
  function computeBalancedCols(total, maxCols) {
    if (total <= 0 || maxCols <= 0) return maxCols || 1;
    if (total <= maxCols) return total; // 塞得下一排就一排放完
    var minRows = Math.ceil(total / maxCols);
    // 從最少需要的排數開始試，最多往後多試2排：只要那個排數換算出來的欄數，最後一排不會只單獨剩1個，就用它；
    // 都試不到（例如總數是質數，怎麼分都會剩1個）才退回最初那個最省排數的算法，不強求。
    for (var rows = minRows; rows <= minRows + 2; rows++) {
      var cols = Math.ceil(total / rows);
      if (cols > maxCols) continue;
      var lastRow = total - (rows - 1) * cols;
      if (lastRow !== 1 || total === 1) return cols;
    }
    return Math.ceil(total / minRows);
  }
  function syncTopNavCols() {
    if (currentMode() !== 'top') return;
    var nav = document.querySelector('.royal-nav');
    if (!nav) return;
    var items = nav.querySelectorAll(':scope > .nav-item').length; // 只算最上層，子選單裡的不算
    if (!items) return;
    var maxCols = window.innerWidth >= NAV_TOP_WIDE_BP ? 7 : 4; // 跟CSS兩個斷點各自原本的欄數上限一致
    var cols = computeBalancedCols(items, maxCols);
    var rows = Math.ceil(items / cols); // 排數要跟著一起明確寫死，切換鍵（grid-row:1/-1）的「-1」才認得到真正的最後一排
    root.style.setProperty('--nav-top-cols', String(cols));
    root.style.setProperty('--nav-top-rows', String(rows));
  }

  function updateBtnTitle() {
    if (!btn) return;
    var m = currentMode();
    var label = btn.querySelector('.nmt-label');
    if (m === 'top') {
      btn.setAttribute('title', '目前：頂部選單（點擊切換為左側選單）');
      btn.setAttribute('aria-label', '切換為左側選單');
      if (label) label.textContent = '切換左側選單';
    } else {
      btn.setAttribute('title', '目前：左側選單（點擊切換為頂部選單）');
      btn.setAttribute('aria-label', '切換為頂部選單');
      if (label) label.textContent = '切換頂部選單';
    }
  }

  // 改變畫面顯示，並且一律同步寫回 localStorage（重點修正：
  // 不管這次改變是手動點擊還是自動覆寫，F5 後都要看到跟現在一樣的畫面）
  /* ── 手機漢堡選單：展開／收合 ───────────────────────────────────── */
  var navEl = document.querySelector('.royal-nav');
  var burger = document.getElementById('nav-burger');
  function syncExplorationGroup(open) {
    var g = document.getElementById('nav-group-exploration');
    if (g && g._setOpen) g._setOpen(open);
  }
  function setMenuOpen(open) {
    if (!navEl) return;
    navEl.classList.toggle('nav-menu-open', open);
    if (burger) {
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? '收合選單' : '展開選單');
    }
    if (!open && currentMode() === 'top') syncExplorationGroup(false);
  }
  if (burger && navEl) {
    burger.addEventListener('click', function () {
      setMenuOpen(!navEl.classList.contains('nav-menu-open'));
    });
    // 選了任何一個頁面（含子選單裡的潛水艇／飛空艇）就自動收合；
    // 點「遠航探索」本身只是展開子選單，不收合
    navEl.addEventListener('click', function (e) {
      if (e.target.closest('.nav-item[data-nav]')) setMenuOpen(false);
    });
    document.addEventListener('click', function (e) {
      if (navEl.classList.contains('nav-menu-open') && !navEl.contains(e.target)) setMenuOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navEl.classList.contains('nav-menu-open')) {
        setMenuOpen(false);
        burger.focus();
      }
    });
  }

  function applyMode(mode, persist) {
    root.setAttribute('data-nav-mode', mode);
    if (persist) { try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {} }
    // 換模式：漢堡選單先收起來；遠航探索子選單——左側模式在該分頁時保持展開，頂部模式一律收起
    setMenuOpen(false);
    var g = document.getElementById('nav-group-exploration');
    syncExplorationGroup(mode === 'left' && !!(g && g.classList.contains('active')));
    updateBtnTitle();
    syncTopNavCols();
    // 換模式後版面要先套用完，下一禎再量測（換行與否會影響高度）
    requestAnimationFrame(syncTopNavHeight);
  }

  // 視窗寬度跨越門檻時的自動切換：窄 → 頂部；寬 → 回到使用者的偏好（皆不寫入 localStorage）
  function checkAutoSwitch() {
    var narrowNow = window.innerWidth <= BREAKPOINT;
    if (narrowNow === lastNarrow) return; // 沒有跨越門檻，不處理
    lastNarrow = narrowNow;
    applyMode(narrowNow ? 'top' : userPref, false);
  }

  if (btn) {
    btn.addEventListener('click', function () {
      if (window.innerWidth <= BREAKPOINT) return; // 手機固定頂部選單（按鈕本來也已隱藏）
      var next = currentMode() === 'top' ? 'left' : 'top';
      userPref = next;
      applyMode(next, true); // 手動切換才記住偏好
    });
  }

  function handleResize() {
    checkAutoSwitch();
    if (!isMobileTop() && navEl && navEl.classList.contains('nav-menu-open')) setMenuOpen(false);
    syncTopNavCols();
    syncTopNavHeight();
  }

  updateBtnTitle();
  syncTopNavCols();
  syncTopNavHeight();
  window.addEventListener('resize', handleResize, { passive: true });
  window.addEventListener('load', handleResize);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncTopNavHeight).catch(function () {});
  }
})();
