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
 * ── 自動切換規則 ──────────────────────────────────────────────────────
 * 區分兩個概念：
 *   userPref         僅用於「同一次瀏覽期間、視窗被拉寬時要復原成什麼」的
 *                     依據（純記憶體變數，不等於 localStorage 存的值）。
 *   autoOverrideActive  目前是否處於「因視窗太窄而被自動覆寫」的狀態。
 *
 * 持久化規則（本次修正重點）：
 *   畫面顯示模式只要改變（不管是手動點擊，還是視窗寬度跨越門檻的自動切換），
 *   一律立刻寫回 localStorage，讓「重新整理／F5」永遠维持重新整理前畫面
 *   當下顯示的模式，不會因為當時的視窗寬度而被悄悄改掉。
 *   → 因此 index.html <head> 那段內聯 script 只要單純讀 localStorage
 *     直接套用即可，不需要另外判斷視窗寬度做覆寫。
 *
 * 規則：
 *   - 視窗從寬變窄（跨過門檻的那一刻，同一次瀏覽期間拉動視窗才會觸發）：
 *       若 userPref === 'left' → 自動切到 top，並標記 autoOverrideActive = true
 *       若 userPref === 'top'  → 本來就是 top，不做任何事
 *   - 視窗從窄變寬（跨過門檻的那一刻）：
 *       若 autoOverrideActive  → 復原成 userPref（也就是 left），
 *                                並清除 autoOverrideActive
 *       否則（userPref 本來就是 top）→ 不做任何事，維持 top
 *   - 只在「跨越門檻」的那一刻判斷，視窗在同一寬度區間內持續拉動
 *     不會重複觸發。這一段是「同一次瀏覽期間拉動視窗」的即時體驗優化，
 *     跟上面「F5 維持原樣」的持久化規則是兩件事，不衝突。
 *   - 手動切換按鈕：畫面一律立即切換並寫入 localStorage（見上）；
 *       只有在「不是自動覆寫中」時，才會同時更新 userPref，
 *       讓視窗變寬時的「復原」判斷依然依照進入自動覆寫前的原始模式。
 */
(function () {
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
  var autoOverrideActive = (userPref === 'left' && lastNarrow);

  function currentMode() {
    return root.getAttribute('data-nav-mode') === 'top' ? 'top' : 'left';
  }

  function syncTopNavHeight() {
    if (currentMode() !== 'top') return;
    var nav = document.querySelector('.royal-nav');
    if (!nav) return;
    var h = nav.offsetHeight;
    if (h > 0) root.style.setProperty('--nav-top-h-actual', h + 'px');
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
  function applyMode(mode) {
    root.setAttribute('data-nav-mode', mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
    updateBtnTitle();
    // 換模式後版面要先套用完，下一禎再量測（換行與否會影響高度）
    requestAnimationFrame(syncTopNavHeight);
  }

  // 更新「同一次瀏覽期間、視窗被拉寬時要復原成什麼」的依據，
  // 純記憶體變數，不直接碰 localStorage（畫面本身的持久化交給 applyMode）
  function persistPref(mode) {
    userPref = mode;
  }

  // 視窗寬度跨越門檻時的自動切換判斷
  function checkAutoSwitch() {
    var narrowNow = window.innerWidth <= BREAKPOINT;
    if (narrowNow === lastNarrow) return; // 沒有跨越門檻，不處理
    lastNarrow = narrowNow;

    if (narrowNow) {
      // 寬 → 窄
      if (userPref === 'left') {
        autoOverrideActive = true;
        applyMode('top');
      }
      // userPref 本來就是 'top' 的話什麼都不用做
    } else {
      // 窄 → 寬
      if (autoOverrideActive) {
        autoOverrideActive = false;
        applyMode(userPref); // 復原成原本的偏好（也就是 'left'）
      }
      // 若不是自動覆寫中（代表 userPref 本來就是 'top'），維持原樣
    }
  }

  if (btn) {
    btn.addEventListener('click', function () {
      var next = currentMode() === 'top' ? 'left' : 'top';
      applyMode(next); // 一律切換畫面並寫回 localStorage
      if (!autoOverrideActive) {
        // 不在自動覆寫狀態下的手動切換，才會同時更新 userPref，
        // 讓「視窗變寬時要復原成什麼」的判斷依然依照進入覆寫前的原始模式
        persistPref(next);
      }
    });
  }

  function handleResize() {
    checkAutoSwitch();
    syncTopNavHeight();
  }

  updateBtnTitle();
  syncTopNavHeight();
  window.addEventListener('resize', handleResize, { passive: true });
  window.addEventListener('load', handleResize);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncTopNavHeight).catch(function () {});
  }
})();
