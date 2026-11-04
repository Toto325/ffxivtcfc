--- a/js/market-panel.js	2026-11-04 19:19:12.793709844 +0000
+++ b/js/market-panel.js	2026-11-04 19:19:12.795869525 +0000
@@ -11,6 +11,39 @@
   // 這裡直接用同一個全域識別字就好，不要再重新宣告一次（重新宣告會變成一個沒人在用的假物件，
   // 之前就是這裡寫錯，導致 nav.js 呼叫的 app.nav() 找不到 buildMarket，市場頁才會整頁空白）。
 
+  /* 網址深連結：開啟物品時把網址換成 #page=market&item=物品ID。
+   * 重新整理、把網址傳給朋友、或按瀏覽器的「上一頁」都能回到同一個物品（app.js 本來就會讀 #page=）。
+   * 離開市場頁時把這段 hash 清掉，不然之後在別頁重新整理會被帶回市場。生產頁彈窗（embed）不碰網址。 */
+  const IS_EMBED = /embed=1/.test(window.location.hash);
+  function hashIsMarket() { return /(?:^|[#&])page=market(?:&|$)/.test(window.location.hash); }
+  function readHashItem() { if (!hashIsMarket()) return null; const m = /[#&]item=(\d+)/.exec(window.location.hash); return m ? m[1] : null; }
+  function syncHash(itemId, push) {
+    if (IS_EMBED) return;
+    const h = '#page=market' + (itemId ? '&item=' + encodeURIComponent(itemId) : '');
+    if (window.location.hash === h) return;
+    try { window.history[push ? 'pushState' : 'replaceState'](null, '', window.location.pathname + window.location.search + h); } catch (e) { /* 某些環境不允許改網址就算了 */ }
+  }
+  (function () {
+    const rawNav = app.nav;
+    app.nav = function (id) {
+      if (!IS_EMBED && id !== 'market' && hashIsMarket()) { try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* 忽略 */ } }
+      const r = rawNav.apply(this, arguments);
+      if (!IS_EMBED && id === 'market' && currentDetailItemId) syncHash(currentDetailItemId, false);
+      return r;
+    };
+  })();
+  window.addEventListener('popstate', function () { // 瀏覽器上一頁／下一頁
+    if (IS_EMBED || !hashIsMarket() || !$('mk-pane-item')) return;
+    if (!document.getElementById('market').classList.contains('active')) app.nav('market');
+    const id = readHashItem();
+    if (id) { if (id !== currentDetailItemId) openItemDetail(id, { fromHash: true }); }
+    else if (currentDetailItemId) { // 回到「還沒開任何物品」的那一步
+      currentDetailItemId = null; detailLoadToken++; detailViewState = null;
+      $('mk-pane-item').innerHTML = '<p class="craft-muted">搜尋一個物品開始查詢——即時價格、跨服比價、銷售速度，如果是可製作品還會顯示完整供應鏈。</p>';
+      renderRecentlyViewed(); fitMarketHeights();
+    }
+  });
+
   app.buildMarket = function () {
     const root = document.getElementById('market-root');
     if (!root) return;
@@ -33,6 +66,10 @@
   };
 
   function $(id) { return document.getElementById(id); }
+  // 把文字放進 HTML 之前先「跳脫」：把 < > & " 換成安全的寫法，這樣名稱裡就算剛好有這些符號，也只會被當成文字顯示，
+  // 不會被瀏覽器當成網頁語法（例如名稱裡的 " 會把 title="…" 提早結束）。物品名稱目前都來自你自己的資料所以沒有實際風險，
+  // 但從 localStorage（最近查看）讀出來的內容可以被改，加上這一層比較保險。
+  function escHtml(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
 
   function renderMarketSkeleton() {
     const root = document.getElementById('market-root');
@@ -74,7 +111,15 @@
     bindSearchBox();
     bindTabSwitch();
     renderRadarShell();
+    MarketData.bindPricePrefsBars();
+    MarketData.autoEnhanceSelects(); // 市場頁的下拉全部換成站內設計的自製下拉
+    if (!prefsSupplyHooked) { // 全站取價設定改了：物品頁的供應鏈圖要原地重畫
+      prefsSupplyHooked = true;
+      MarketData.onPricePrefsChange(function () { if (lastSupplyCtx && lastSupplyCtx.box.isConnected) renderSupplyChainWithBreakdown(lastSupplyCtx.itemId, lastSupplyCtx.rid, lastSupplyCtx.box); });
+    }
     fitMarketHeights();
+    const hashItem = readHashItem(); // 網址帶著物品（重新整理、分享連結）就直接開那個物品
+    if (hashItem) openItemDetail(hashItem, { fromHash: true });
 
     $('mk-settings-btn').addEventListener('click', function (e) {
       e.stopPropagation();
@@ -119,7 +164,7 @@
       '<div class="craft-settings-field"' + (MarketData.dcSelectorVisible ? '' : ' style="display:none"') + '><label>資料中心<span class="craft-muted">（材料成本查詢範圍）</span></label><select id="mk-set-dc" class="craft-select craft-select-block"><option value="">資料中心⋯</option></select></div>' +
       '<div class="craft-settings-field"><label>我的世界<span class="craft-muted">（賣出參考只看這裡）</span></label><select id="mk-set-world" class="craft-select craft-select-block"><option value="">我的世界⋯</option></select></div>' +
       '<div class="craft-settings-field" id="mk-set-city-field" style="display:none"><label>賣出城市<span class="craft-muted">（決定賣方稅率）</span></label><select id="mk-set-city" class="craft-select craft-select-block"></select></div>' +
-      '<div class="craft-settings-field"><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="mk-set-exclude-outlier"' + (MarketData.getSettings().excludeOutlierTrades ? ' checked' : '') + '><span>排除異常成交<span class="craft-muted">（跟其他成交比，單筆差距同時超過100萬金和100倍就不算進均價）</span></span></label></div>';
+      '<div class="craft-settings-field"><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="mk-set-exclude-outlier"' + (MarketData.getSettings().excludeOutlierTrades ? ' checked' : '') + '><span>排除異常成交<span class="craft-muted">（單筆成交價跟其他成交的中位數比，差距同時超過1000金和10倍，就不算進均價）</span></span></label></div>';
     document.body.appendChild(pop);
     $('mk-set-dc').addEventListener('change', async function () {
       await MarketData.setDataCenter(this.value);
@@ -164,7 +209,7 @@
   // 設定一改（世界/城市/DC），正在看的物品詳情跟正在顯示的製作商機都要立刻反映新假設，
   // 不然玩家選了別的賣出城市，畫面卻還停在舊稅率算出來的數字，會誤判。
   function refreshMarketDependentDisplays() {
-    if (currentDetailItemId) loadMarketSection(currentDetailItemId);
+    if (currentDetailItemId) loadMarketSection(currentDetailItemId, { keepView: true });
     if (radarRefreshHook) radarRefreshHook();
     fitMarketHeights();
   }
@@ -212,6 +257,8 @@
   function bindSearchBox() {
     const input = $('mk-search');
     const box = $('mk-search-results');
+    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', 'mk-search-results'); input.setAttribute('aria-autocomplete', 'list');
+    box.setAttribute('role', 'listbox');
     let debounceTimer = null;
     input.addEventListener('input', function () {
       clearTimeout(debounceTimer);
@@ -219,7 +266,7 @@
     });
     function runSearch() {
       const q = input.value.trim();
-      if (!q) { box.innerHTML = ''; box.classList.remove('open'); fitMarketHeights(); return; }
+      if (!q) { closeBox(); return; }
       // 只搜尋可在市場交易的物品（ITEM_MARKETABLE_TW 由 update-craft-data.js 產生）；
       // 貨幣、不可交易的物品不需要被直接搜尋到，仍可從其他物品的兌換清單點進去。
       const ids = (typeof ITEM_MARKETABLE_TW !== 'undefined' && ITEM_MARKETABLE_TW.length) ? ITEM_MARKETABLE_TW : Object.keys(ITEM_NAMES_TW_ALL);
@@ -247,13 +294,19 @@
       });
       // 原本這裡會砍到只留前30筆，是我自己加的上限，怕一次塞太多DOM節點卡頓。
       // 現在下拉清單本身有自己的捲軸能正常捲動，這個限制沒必要，拿掉——搜尋結果要列出全部。
-      if (!matches.length) { box.innerHTML = '<div class="craft-muted" style="padding:8px">查無符合的物品</div>'; box.classList.add('open'); fitMarketHeights(); return; }
-      box.innerHTML = matches.map(function (m) {
+      if (!matches.length) { box.innerHTML = '<div class="craft-muted" style="padding:8px">查無符合的物品</div>'; box.classList.add('open'); input.setAttribute('aria-expanded', 'true'); fitMarketHeights(); return; }
+      // 一次最多畫 SEARCH_MAX 筆：搜「的」這種很短的字會符合上千個物品，每個都帶圖示一次全畫出來會卡；
+      // 排序已經是「最像的在前面」，後面的用更完整的名稱就能縮小，所以超過的部分只提示筆數。
+      const SEARCH_MAX = 200;
+      const shown = matches.slice(0, SEARCH_MAX);
+      box.innerHTML = shown.map(function (m, idx) {
         const on = isWatched(m.id);
-        return '<div class="craft-search-item" data-mk-pick="' + m.id + '">' + itemIconHtml(m.id, 24) + '<span>' + m.name + '</span>' +
-          '<button type="button" class="wl-star' + (on ? ' on' : '') + '" data-wl-star="' + m.id + '" title="' + (on ? '取消關注' : '加入關注') + '">' + (on ? '★' : '☆') + '</button></div>';
-      }).join('');
+        return '<div class="craft-search-item" role="option" id="mk-opt-' + idx + '" data-mk-pick="' + m.id + '">' + itemIconHtml(m.id, 24) + '<span>' + escHtml(m.name) + '</span>' +
+          '<button type="button" class="wl-star' + (on ? ' on' : '') + '" data-wl-star="' + m.id + '" tabindex="-1" title="' + (on ? '取消關注' : '加入關注') + '" aria-label="' + (on ? '取消關注' : '加入關注') + '">' + (on ? '★' : '☆') + '</button></div>';
+      }).join('') + (matches.length > SEARCH_MAX ? '<div class="craft-muted mk-search-more">還有 ' + (matches.length - SEARCH_MAX).toLocaleString() + ' 筆符合，輸入更完整的名稱可以縮小範圍</div>' : '');
       box.classList.add('open');
+      input.setAttribute('aria-expanded', 'true');
+      activeIdx = -1; input.removeAttribute('aria-activedescendant');
       fitMarketHeights();
       box.querySelectorAll('[data-wl-star]').forEach(function (star) {
         star.addEventListener('click', function (e) {
@@ -263,19 +316,44 @@
           star.classList.toggle('on', nowOn);
           star.textContent = nowOn ? '★' : '☆';
           star.title = nowOn ? '取消關注' : '加入關注';
+          star.setAttribute('aria-label', star.title);
         });
       });
       box.querySelectorAll('[data-mk-pick]').forEach(function (el) {
-        el.addEventListener('click', function () {
-          input.value = ITEM_NAMES_TW_ALL[el.dataset.mkPick] || '';
-          box.innerHTML = ''; box.classList.remove('open');
-          fitMarketHeights();
-          openItemDetail(el.dataset.mkPick);
-        });
+        el.addEventListener('click', function () { pick(el.dataset.mkPick); });
       });
     }
+    function pick(id) {
+      input.value = ITEM_NAMES_TW_ALL[id] || '';
+      closeBox();
+      openItemDetail(id);
+    }
+    function closeBox() { box.innerHTML = ''; box.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); activeIdx = -1; fitMarketHeights(); }
+    // 鍵盤：↑↓ 移動、Enter 選取（沒移動過就選第一個）、Esc 關閉
+    let activeIdx = -1;
+    function setActive(i) {
+      const items = box.querySelectorAll('.craft-search-item');
+      if (!items.length) return;
+      activeIdx = (i + items.length) % items.length;
+      items.forEach(function (el, k) { el.classList.toggle('is-active', k === activeIdx); el.setAttribute('aria-selected', k === activeIdx ? 'true' : 'false'); });
+      const cur = items[activeIdx];
+      input.setAttribute('aria-activedescendant', cur.id);
+      cur.scrollIntoView({ block: 'nearest' });
+    }
+    input.addEventListener('keydown', function (e) {
+      const open = box.classList.contains('open') && box.querySelector('.craft-search-item');
+      if (e.key === 'ArrowDown') { if (!open) { runSearch(); return; } e.preventDefault(); setActive(activeIdx + 1); }
+      else if (e.key === 'ArrowUp') { if (!open) return; e.preventDefault(); setActive(activeIdx <= 0 ? -1 : activeIdx - 1); }
+      else if (e.key === 'Enter') {
+        if (!open) return;
+        e.preventDefault();
+        const items = box.querySelectorAll('.craft-search-item');
+        const cur = items[activeIdx >= 0 ? activeIdx : 0];
+        if (cur) pick(cur.dataset.mkPick);
+      } else if (e.key === 'Escape') { if (box.classList.contains('open')) { e.preventDefault(); closeBox(); } }
+    });
     document.addEventListener('click', function (e) {
-      if (!box.contains(e.target) && e.target !== input) { box.classList.remove('open'); fitMarketHeights(); }
+      if (!box.contains(e.target) && e.target !== input) { box.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); fitMarketHeights(); }
     });
   }
 
@@ -319,7 +397,7 @@
     // 渲染高度（CSS max-height:82vh，根據內容多高撐開）本身又受panesFlex目前的高度影響——
     // 這是一個循環依賴：量出來的值會回頭影響下一次量測的基準，每次只能往正確答案「靠近一點點」，
     // 要點很多下才收斂到正確高度，剛好對上你看到的症狀。改成完全不依賴root目前渲染高度的算法：
-    // 用window.innerHeight（永遠固定，不受任何內容影響）乘上跟CSS一致的82%上限，
+    // 用window.innerHeight（永遠固定，不受任何內容影響）乘上跟CSS一致的85%上限，
     // 再扣掉topFixed自己的實際高度（topFixed是flex-shrink:0，大小只取決於自己的內容，
     // 跟panesFlex完全無關）——這樣算出來的值第一次就是對的，不用等好幾次點擊才收斂。
     const viewportCap = window.innerHeight * 0.85;
@@ -346,7 +424,8 @@
   /* 價格太長時的簡寫（只用在空間很窄的地方：各世界最低價格子、統計列）：
    * 100萬以上改用「萬」、1億以上改用「億」，台服玩家看價格本來就習慣萬為單位；一千萬以內保留到小數點一位，
    * 以上取整數（1190萬、5億）。完整數字永遠放在滑鼠提示跟下方表格裡，簡寫只是為了「放得下、看得清楚」。 */
-  function fmtCompactGil(n) {
+  function fmtCompactGil(n, from) {
+    if (from && n < from) return Math.round(n).toLocaleString();
     if (n >= 1e8) { const v = n / 1e8; return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + '億'; }
     if (n >= 1e6) { const v = n / 1e4; return (v >= 1000 ? Math.round(v) : Math.round(v * 10) / 10) + '萬'; }
     return n.toLocaleString();
@@ -380,7 +459,7 @@
         '<button type="button" class="market-recent-nav prev" aria-label="往左" tabindex="-1"><i class="ph ph-caret-left"></i></button>' +
         '<div class="market-recent-scroller">' +
           list.map(function (r) {
-            return '<button type="button" class="market-recent-chip' + (String(r.id) === String(currentDetailItemId) ? ' is-current' : '') + '" data-mk-recent="' + r.id + '" title="' + r.name + '">' + itemIconHtml(r.id, 18) + '<span>' + r.name + '</span></button>';
+            return '<button type="button" class="market-recent-chip' + (String(r.id) === String(currentDetailItemId) ? ' is-current' : '') + '" data-mk-recent="' + r.id + '" title="' + escHtml(r.name) + '">' + itemIconHtml(r.id, 18) + '<span>' + escHtml(r.name) + '</span></button>';
           }).join('') +
         '</div>' +
         '<button type="button" class="market-recent-nav next" aria-label="往右" tabindex="-1"><i class="ph ph-caret-right"></i></button>' +
@@ -482,10 +561,12 @@
     return chips.length ? '<span class="market-detail-meta">' + chips.join('') + '</span>' : '';
   }
 
-  function openItemDetail(itemId) {
+  function openItemDetail(itemId, o) {
     itemId = String(itemId);
+    detailViewState = null; // 開新物品＝從預設視圖開始（分頁、世界、篩選都重置）；只有改設定的重畫才沿用
     const name = ITEM_NAMES_TW_ALL[itemId] || ('#' + itemId);
     currentDetailItemId = itemId; // 要在重畫「最近查看」之前設定，才標得出目前正在看哪一個
+    if (!(o && o.fromHash)) syncHash(itemId, true);
     recordRecentlyViewed(itemId, name);
     renderRecentlyViewed();
     document.querySelector('[data-mk-tab="item"]').click();
@@ -668,42 +749,17 @@
     pop.style.display = 'block';
     placePopover(pop, anchorBtn.getBoundingClientRect());
     try {
-      const full = await MarketData.fetchFullHistory(itemId, 30, scopeWorld || undefined);
-      const now = Date.now() / 1000;
-      // 第1點：改成不重疊的區間切片，跟均價徽章同一套定義——「當前」是0~24小時，
-      // 「1天前」是24~48小時，都是實際成交紀錄的均價，不是掛單快照均價。
-      // 「近1天成交均價」＝最近48小時內（當天＋昨天）；所有窗口都從「現在」算起，不跳過最近一小時。
-      // 第1點：「當前成交均價」＝最近24小時的成交，不是最近1小時。
-      // 第6點：排除異常成交（全域設定，預設打開）——每個視窗各自排除，同一批視窗裡的離群值不會互相影響
-      function inRange(fromH, toH) { return full.filter(function (h) { return h.timestamp >= now - toH * 3600 && h.timestamp < now - fromH * 3600; }); }
-      function withinDays(days) { return full.filter(function (h) { return h.timestamp >= now - days * 86400; }); }
-      function avgOf(list) {
-        const clean = MarketData.excludeOutlierEntries(list, function (h) { return h.pricePerUnit; });
-        return clean.length ? Math.round(clean.reduce(function (s, h) { return s + h.pricePerUnit; }, 0) / clean.length) : null;
-      }
-      const current = avgOf(inRange(0, 24));
-      const oneDay = avgOf(inRange(0, 48));
-      const avg3d = avgOf(withinDays(3)), avg7d = avgOf(withinDays(7)), avg30d = avgOf(withinDays(30));
-      // 以前是六行大字＋一大段說明，面板又高又寬，開起來會蓋掉下面的世界列跟一半的表格。
-      // 現在：每行「標籤＋長條＋數字」，長條長度＝跟這幾個數字裡最大的比，高低一眼就看得出來，不用逐行讀數字；
-      // 整個面板約一半高；原本那段說明文字收進標題的提示（滑鼠停在「？」上才看得到），不佔畫面。
-      const rows = [['當前', current, '最近24小時內的成交均價'], ['近1天', oneDay, '最近48小時內（當天＋昨天）的成交均價'],
-        ['近3天', avg3d, '過去3天所有成交的平均'], ['近7天', avg7d, '過去7天所有成交的平均'], ['近30天', avg30d, '過去30天所有成交的平均']];
-      const maxV = Math.max.apply(null, rows.map(function (r) { return r[1] || 0; })) || 1;
-      pop.innerHTML = '<p class="mav-title">均價比較' + scopeLabel + '<span class="mav-help" title="都是實際成交的平均，已排除異常成交（可在設定裡關閉）。「目前掛單」是現在架上還沒賣掉的掛單價格平均，不是成交價。">？</span></p>' +
-        rows.map(function (r, i) {
-          return '<div class="mav-row' + (i === 0 ? ' is-now' : '') + '" title="' + r[2] + '"><span class="mav-l">' + r[0] + '</span>' +
-            '<span class="mav-bar"><i style="width:' + (r[1] != null ? Math.max(4, r[1] / maxV * 100).toFixed(0) : 0) + '%"></i></span>' +
-            '<strong>' + (r[1] != null ? r[1].toLocaleString() : '—') + '</strong><small>金</small></div>';
-        }).join('') +
-        '<div class="mav-row mav-listing" id="mk-avgprice-listing" title="現在架上還沒賣掉的掛單價格平均，不是成交價"><span class="mav-l">掛單</span><span class="mav-bar"></span><strong>⋯</strong><small>金</small></div>';
+      const w = await MarketData.getAvgWindows(itemId, scopeWorld || undefined); // 共用一份（市場頁、生產頁同一套：件數加權、已排除異常成交）
+      if (!w) throw new Error('avg windows failed');
+      pop.innerHTML = '<p class="mav-title">均價比較' + scopeLabel + '<span class="mav-help" title="都是實際成交的平均，已排除異常成交（可在設定裡關閉）。「目前掛單」是現在架上還沒賣掉的掛單價格平均，不是成交價。">？</span></p>' + MarketData.avgWindowRowsHtml(w) +
+        '<div class="mav-row mav-listing" id="mk-avgprice-listing" title="現在架上還沒賣掉的掛單價格平均，不是成交價"><span class="mav-l">掛單</span><span class="mav-bar"></span><strong>⋯</strong><small>金</small><em class="mav-chg"></em></div>';
       placePopover(pop, anchorBtn.getBoundingClientRect()); // 內容換了，高度變了：方向沿用，只重新算位置
       // 第3點：把「目前掛單均價」也列進來當參考——這是現在架上還沒賣掉的掛單價格平均，跟上面的「成交均價」是不同的東西。
       // 這裡改成跟均價徽章用同一個來源（Universalis 官方算好的 currentAveragePrice），不要自己另外抓一批掛單
       // 重新算平均——之前兩邊各自算，物品掛單一多，兩個「掛單均價」數字就會兜不起來，看起來像bug。
       try {
         const st = MarketData.getSettings();
-        const ov2 = await MarketData.getItemMarketOverview(itemId, scopeWorld || st.dcName);
+        const ov2 = await MarketData.getItemMarketOverviewEx(itemId, scopeWorld || undefined); // 選了世界就查那個世界（以前第二個參數被忽略，永遠是整個資料中心）
         const row = document.getElementById('mk-avgprice-listing');
         if (row) { row.querySelector('strong').textContent = (ov2 && ov2.avgPrice) ? Math.round(ov2.avgPrice).toLocaleString() : '—'; if (!(ov2 && ov2.avgPrice)) row.querySelector('small').textContent = '無掛單'; }
       } catch (e) { const row = document.getElementById('mk-avgprice-listing'); if (row) { row.querySelector('strong').textContent = '—'; row.querySelector('small').textContent = '讀取失敗'; } }
@@ -716,25 +772,22 @@
    * （一次抓30天完整成交紀錄，5個窗口都是本地端切的，不是5次API），只是這裡要給圖上
    * 好幾張卡片共用，所以包成一個可以查快取的版本，同一個物品一個畫面裡只抓一次。
    * 注意：這套窗口均價不分NQ/HQ（跟物品詳情頁那個彈窗一樣），跟「掛單最低價」會分NQ/HQ不同。 */
-  let liveAvgCache = {}; // itemId -> {current,'1d','3d','7d','30d'} | null(查詢失敗)
+  let liveAvgCache = {}; // itemId -> {current,'1d','3d','7d','30d'}（只存成功的結果；失敗不存，下次會重查）
+  const liveAvgTime = {}; // itemId -> 存進快取的時間，超過 LIVE_AVG_TTL 就當作過期重查（以前成功的結果一直留到重新整理頁面）
+  const LIVE_AVG_TTL = 10 * 60 * 1000;
+  function liveAvgFresh(id) { return liveAvgCache[id] !== undefined && Date.now() - (liveAvgTime[id] || 0) < LIVE_AVG_TTL; }
   async function fetchLiveAvgWindows(itemId) {
-    if (liveAvgCache[itemId] !== undefined) return liveAvgCache[itemId];
+    if (liveAvgFresh(itemId)) return liveAvgCache[itemId];
     try {
-      const full = await MarketData.fetchFullHistory(itemId, 30);
-      const now = Date.now() / 1000;
-      function inRange(fromH, toH) { return full.filter(function (h) { return h.timestamp >= now - toH * 3600 && h.timestamp < now - fromH * 3600; }); }
-      function withinDays(days) { return full.filter(function (h) { return h.timestamp >= now - days * 86400; }); }
-      function avgOf(list) {
-        const clean = MarketData.excludeOutlierEntries(list, function (h) { return h.pricePerUnit; });
-        return clean.length ? clean.reduce(function (s, h) { return s + h.pricePerUnit; }, 0) / clean.length : null;
-      }
-      const windows = { current: avgOf(inRange(0, 24)), '1d': avgOf(inRange(0, 48)), '3d': avgOf(withinDays(3)), '7d': avgOf(withinDays(7)), '30d': avgOf(withinDays(30)) };
-      liveAvgCache[itemId] = windows;
+      const w = await MarketData.getAvgWindows(itemId);
+      if (!w) return null;
+      const windows = { current: w.current, '1d': w.d1, '3d': w.d3, '7d': w.d7, '30d': w.d30 };
+      liveAvgCache[itemId] = windows; liveAvgTime[itemId] = Date.now();
       return windows;
-    } catch (e) { liveAvgCache[itemId] = null; return null; }
+    } catch (e) { return null; } // 失敗不記進快取：下次再需要時會重新查
   }
   async function ensureLiveAvgForItems(itemIds) {
-    const need = itemIds.filter(function (id) { return liveAvgCache[id] === undefined; });
+    const need = itemIds.filter(function (id) { return !liveAvgFresh(id); });
     await Promise.all(need.map(fetchLiveAvgWindows));
   }
   /* 均價統一查詢入口：window='current'先試預先計算快照（快，涵蓋大部分熱門物品），
@@ -782,6 +835,9 @@
     return {
       velocity: { nqVelocityPerDay: row[0], hqVelocityPerDay: row[1], usedScope: 'pc' },
       avg24h: D && D[0] > 0 ? D[1] : null,
+      txnFreq: liquidityOf('x', { items: { x: row } }).txnFreq, // 成交頻率（筆/天），跟熱度排行、代幣兌換同一套；近30天成交不到5筆時是 0
+      // 每日成交額（金/天）：窗口內成交金額加總 ÷ 窗口天數，跟熱度排行「每日成交額」同一套；沒有資料（成交太少）是 null
+      turnover: (row[3] && HOT_TIER_DAYS[row[3][0]]) ? row[3][5] / HOT_TIER_DAYS[row[3][0]] : null,
     };
   }
 
@@ -790,7 +846,8 @@
    * 不會拿過期資料硬算出一個看起來很篤定、實際上已經是舊行情的數字。 */
   async function getPrecomputedAllData() {
     try {
-      const r = await MarketData.loadPrecomputed('ALL');
+      const pf = MarketData.getPricePrefs(), w = MarketData.getSettings().worldName; // 供應鏈是「買」的決策：看全站共用設定的買入範圍
+      const r = await MarketData.loadPrecomputed(pf.buyScope === 'world' && w ? w : 'ALL');
       if (r.state === 'ok' && r.ageMs <= 24 * 3600 * 1000) return r.data;
     } catch (e) { /* 讀不到就回傳null，呼叫端自行處理 */ }
     return null;
@@ -840,6 +897,7 @@
       if (i >= cols * (rows - 1)) t.classList.add('ms-last-row');
     });
   }
+
   function fitWorldStrip(strip) {
     if (!strip || !strip.isConnected) return;
     const n = strip.querySelectorAll('.mws-cell').length, W = strip.clientWidth;
@@ -862,27 +920,40 @@
   function getSupplySettings() {
     let s = null;
     try { s = JSON.parse(localStorage.getItem(SUPPLY_SETTINGS_KEY) || 'null'); } catch (e) {}
-    return Object.assign({
+    const merged = Object.assign({
       materialsBasis: 'listing', materialsAvgWindow: 'current', // 選了「成交均價」才有意義：當前/1天/3天/7天
       includeCrystal: true, matPersp: 'nq', hqOverrides: {},
     }, s || {});
+    merged.materialsBasis = MarketData.getPricePrefs().buyBasis; // 價格基準＝全站共用的「買入基準」，不再各自存一份
+    return merged;
   }
   function saveSupplySettings(s) {
+    if (s && s.materialsBasis && s.materialsBasis !== MarketData.getPricePrefs().buyBasis) MarketData.setPricePrefs({ buyBasis: s.materialsBasis });
     try { localStorage.setItem(SUPPLY_SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
   }
 
-  async function loadMarketSection(itemId) {
+  /* 詳情頁的載入序號：換了物品、或改了市場設定重畫時，還在路上的舊請求回來要自己放棄，不能蓋掉新畫面。
+   * detailViewState 記住「正在看哪個分頁／世界／HQ篩選／手續費勾選」，改稅率城市這類設定變更重畫時沿用，不要全部重置。 */
+  let detailLoadToken = 0, detailViewState = null;
+  async function loadMarketSection(itemId, opts) {
+    opts = opts || {};
+    const myLoad = ++detailLoadToken;
+    const keep = (opts.keepView && detailViewState && detailViewState.itemId === String(itemId)) ? detailViewState : null;
+    if (!keep) detailViewState = { itemId: String(itemId), tab: 'listing', world: 'ALL', hq: false, fee: false };
+    const view = detailViewState;
     const box = $('mk-detail-market');
     if (!MarketData.getSettings().dcName) {
       box.innerHTML = '<p class="craft-muted">尚未設定資料中心，點右上角「設定」後才能查價。</p>';
       return;
     }
+    let overviewFailed = false; // 查詢失敗（網路、限流）跟「真的沒有掛單」要分開顯示
     const out = await Promise.all([
-      MarketData.getItemMarketOverview(itemId).catch(function () { return null; }),
+      MarketData.getItemMarketOverviewEx(itemId).catch(function () { overviewFailed = true; return null; }),
       MarketData.fetchSaleVelocityBatch([Number(itemId)], MarketData.getSettings().dcName).then(function (m) { return m[itemId] || null; }).catch(function () { return null; }),
       MarketData.getSettings().worldName ? MarketData.getSellTaxInfo(MarketData.getSettings().worldName).catch(function () { return null; }) : Promise.resolve(null),
       getPrecomputedRow('ALL', itemId),
     ]);
+    if (myLoad !== detailLoadToken) return; // 已經換物品或重畫了
     const overview = out[0], taxInfo = out[2];
     const pcStat = out[3] ? pcRowToStat(out[3]) : null;
     const velocity = pcStat ? pcStat.velocity : out[1]; // 有預先計算資料就用它（跟熱度排行同一份），沒有才用即時查到的
@@ -914,8 +985,8 @@
     }
     function buildStatBarHtml(st) {
       const parts = [];
-      // 三個價格裡只要有一個到千萬以上，三個一起改用萬／億簡寫（一起改才看得出大小關係），完整數字放在滑鼠提示
-      const compact = Math.max(st.minPrice || 0, st.avgDisplay || 0, st.maxPrice || 0) >= 1e7;
+      // 兩個價格裡只要有一個到千萬以上，兩個一起改用萬／億簡寫（一起改才看得出大小關係），完整數字放在滑鼠提示
+      const compact = Math.max(st.minPrice || 0, st.avgDisplay || 0) >= 1e7;
       const fmtP = function (n) { return compact ? fmtCompactGil(n) : n.toLocaleString(); };
       const U = compact ? '' : '<small>金</small>'; // 簡寫（萬／億）本身就是金幣的習慣單位，再加「金」是重複，還會把賣速擠到第二行
       if (st.minPrice) parts.push(statTile('在售最低', fmtP(st.minPrice) + U, 'market-stat-tile-strong', ' title="目前掛單中最低的單價：' + st.minPrice.toLocaleString() + ' 金"'));
@@ -923,14 +994,22 @@
       // 24小時內沒有成交的冷門物品，退回用掛單均價，並明確標成「掛單均價」，註明這不是真的成交均價。
       if (st.avgLoading) parts.push(statTile('均價', '計算中⋯', 'market-stat-tile-muted'));
       else if (st.avgDisplay != null) parts.push('<button type="button" class="market-stat-tile market-stat-tile-btn" id="mk-avgprice-badge" title="' + st.avgDisplay.toLocaleString() + ' 金・點擊看不同天數的均價比較"><span class="mst-label">' + (st.avgIsFallback ? '掛單均價' : '成交均價') + '<i class="ph ph-caret-down"></i></span><span class="mst-val">' + fmtP(st.avgDisplay) + U + '</span></button>');
-      if (st.maxPrice) parts.push(statTile('在售最高', fmtP(st.maxPrice) + U, '', ' title="目前掛單中最高的單價：' + st.maxPrice.toLocaleString() + ' 金"'));
+      // 排列：金額類（最低價、均價、每日成交額）在前，速度類（賣速、成交頻率）在後；放不下一排時會自然拆成「金額一排、速度一排」
+      if (!st.velLoading && st.turnover != null && st.turnover > 0) {
+        parts.push(statTile('每日成交額', fmtCompactGil(Math.round(st.turnover)) + '<small>金/天</small>', '', ' title="平均每天成交的總金額（成交單價×件數，已排除異常成交）：約 ' + Math.round(st.turnover).toLocaleString() + ' 金／天（' + (st.scopeWorld || '所有世界') + '）"'));
+      }
       if (st.velLoading) parts.push(statTile('賣速', '計算中⋯', 'market-stat-tile-muted'));
       else { const vt = velTileHtml(st.velocity, st.scopeWorld); if (vt) parts.push(vt); }
+      // 成交頻率：每天成交「幾筆」（不是幾件），只在有預先計算資料時才有，沒有就不顯示這格
+      if (!st.velLoading && st.txnFreq != null) { // 載入中不先擺這格，免得算完又消失造成跳動
+        if (st.txnFreq > 0) parts.push(statTile('成交頻率', st.txnFreq.toFixed(2) + '<small>筆/天</small>', '', ' title=\"每天平均成交幾筆（' + (st.scopeWorld || '所有世界') + '），跟賣速（每天賣幾件）不同\"'));
+        else parts.push(statTile('成交頻率', '<5<small>筆/月</small>', 'market-stat-tile-muted', ' title=\"近30天成交不到5筆，筆數太少算不出可靠的頻率（不代表完全沒有成交）\"'));
+      }
       return parts.join('');
     }
     const last24hRaw = (overview && overview.history) ? overview.history.filter(function (h) { return h.timestamp >= Date.now() / 1000 - 86400; }) : [];
     const last24h = MarketData.excludeOutlierEntries(last24hRaw, function (h) { return h.pricePerUnit; }); // 第6點：排除異常成交（全域設定，預設打開）
-    const liveAvg24h = last24h.length ? Math.round(last24h.reduce(function (s, h) { return s + h.pricePerUnit; }, 0) / last24h.length) : null;
+    const liveAvg24h = MarketData.weightedAvgPrice(last24hRaw); // 件數加權＋排除異常成交（跟預先計算同一定義）
     // 預先計算的24小時均價涵蓋完整24小時；即時查到的只是「最近200筆」裡剛好落在24小時內的，成交熱絡的道具會偏短
     const avg24h = pcStat && pcStat.avg24h != null ? pcStat.avg24h : liveAvg24h;
     const dcStat = {
@@ -938,21 +1017,24 @@
       avgDisplay: avg24h != null ? avg24h : (overview && overview.avgPrice ? Math.round(overview.avgPrice) : null),
       avgIsFallback: avg24h == null && !!(overview && overview.avgPrice),
       velocity: velocity, scopeWorld: null,
+      txnFreq: pcStat ? pcStat.txnFreq : null, turnover: pcStat ? pcStat.turnover : null,
     };
     // 買賣方稅率／資料新鮮度是輔助小字，跟徽章列分開放，但合併成一行，不再各佔一整行<p>。
     // 稅後估算基準用目前最低掛單價，不是均價：要有競爭力就得訂在最低價附近，均價不是你實際能賣到的價格。
     const footNotes = [];
-    if (taxInfo && overview && overview.minPrice) {
-      const netMin = Math.round(overview.minPrice * (1 - taxInfo.ratePercent / 100));
-      const taxPct = Math.round(taxInfo.ratePercent * 10) / 10;
-      // 畫面上只留「寄售稅後 ≈49（3%）」，完整意思（哪個城市、為什麼是這個稅率）放提示文字，不佔橫向空間
-      footNotes.push('<span title="貼最低價在' + taxInfo.cityName + '寄售（目前稅率最低，扣' + taxPct + '%），約拿 ' + netMin.toLocaleString() + ' 金">寄售稅後 ≈ <span style="color:#4ade80">' + netMin.toLocaleString() + '</span>（' + taxPct + '%）</span>');
-    }
+    // 「寄售稅後」放一個空位，內容由下面的 updateTaxNote() 依「目前選的世界」「NQ／HQ 各自最低價」動態填入
+    if (taxInfo && overview && overview.listings.length) footNotes.push('<span id="mk-taxnote"></span>');
     if (overview && overview.lastUploadTime) footNotes.push('<span id="mk-fresh" title="資料最後上傳時間，隨下方選的世界變動">' + timeAgo(overview.lastUploadTime / 1000) + '更新</span>');
 
     html += '<div class="market-stat-bar" id="mk-stat-bar">' + buildStatBarHtml(dcStat) + '</div>';
     if (footNotes.length) html += '<p class="market-stat-foot craft-muted">' + footNotes.join('　·　') + '</p>';
 
+    if (overviewFailed) {
+      html += '<div class="market-untradable"><i class="ph ph-warning"></i><div><b>查詢失敗</b><button type="button" class="market-history-btn" id="mk-retry-load" style="margin-top:6px"><i class="ph ph-arrow-clockwise"></i> 重試</button></div></div>';
+      box.innerHTML = html;
+      const rb = $('mk-retry-load'); if (rb) rb.addEventListener('click', function () { loadMarketSection(itemId, { keepView: true }); });
+      return;
+    }
     if (!overview || !overview.listings.length) {
       html += isNoUniversalis(itemId)
         ? '<div class="market-untradable"><i class="ph ph-info"></i><div><b>價格資料來源未收錄這個物品</b><span>這個物品在台服仍可交易，但價格資料來源（Universalis）跟著國際服版本走，已不收錄它，所以這裡看不到掛單與價格。請以遊戲內市場板為準。</span></div></div>'
@@ -967,6 +1049,7 @@
     // 「魔晶石數量」是遊戲那邊跟這個查詢介面無關的欄位，照你的指示忽略掉。
     // 第8點：世界欄位改成篩選下拉，預設「所有世界」，選了特定世界就只顯示那個世界的掛單。
     const dcWorlds = MarketData.getSettings().dcName ? await MarketData.listWorldNamesInDc(MarketData.getSettings().dcName).catch(function () { return []; }) : [];
+    if (myLoad !== detailLoadToken) return;
     // 各世界目前最低價（取自整個資料中心「最便宜的100筆」）：玩家不用逐一切換世界，打開下拉就看得出哪個世界最便宜。
     // 沒有出現在這100筆裡的世界，最低價一定比第100筆還高，不顯示數字（不會誤導成「沒有在賣」）。
     const worldMinPrice = {};
@@ -993,11 +1076,12 @@
     html += '<div class="market-world-strip" id="mk-world-strip"></div>';
     html += '<div class="market-listing-bar">' +
         '<div class="market-tabs-mini" id="mk-tabs" role="tablist">' +
-          '<button type="button" class="market-tab-mini active" data-mk-tab="listing" role="tab" aria-selected="true">在售 <span id="mk-tab-count">' + overview.listings.length + '</span></button>' +
+          '<button type="button" class="market-tab-mini active" data-mk-tab="listing" role="tab" aria-selected="true" title="目前掛單數；下面只列最便宜的 100 筆">在售 <span id="mk-tab-count">' + (overview.listingsCount != null ? overview.listingsCount : overview.listings.length) + '項</span></button>' +
           '<button type="button" class="market-tab-mini" data-mk-tab="history" role="tab" aria-selected="false">成交</button>' +
           '<button type="button" class="market-tab-mini" data-mk-tab="trend" role="tab" aria-selected="false">走勢</button>' +
         '</div>' +
         '<button type="button" class="market-history-btn" id="mk-hq-filter-btn">只顯示HQ</button>' +
+        '<button type="button" class="market-history-btn" id="mk-calc-btn" title="想買幾件？算總價" aria-expanded="false"><i class="ph ph-calculator"></i></button>' +
         '<select id="mk-world-filter" class="craft-select" style="display:none" aria-hidden="true" tabindex="-1">' +
           // optgroup 的標題列看起來像分類、不能被選取，只當說明用；預設選中的仍是裡面第一個「所有世界」（標題的配色見 page-market.css）
           '<optgroup label="顯示範圍・最低價' + (hasWorldTimes ? '・資料更新' : '') + '">' +
@@ -1010,7 +1094,13 @@
             }).join('') +
           '</optgroup>' +
         '</select>' +
-        '<label class="market-fee-toggle-inline" id="mk-fee-label"><input type="checkbox" id="mk-fee-toggle"' + (taxInfo && taxInfo.ratePercent ? '' : ' disabled') + '/> 總計價格算入跨城市手續費</label>' +
+        '<span class="market-listing-bar-r" id="mk-bar-r"><span class="market-sig" id="mk-sig-sell" style="display:none"></span>' +
+          '<label class="market-fee-toggle-inline" id="mk-fee-label" title="買方稅固定 5%"><input type="checkbox" id="mk-fee-toggle"/> 含買方稅 5%</label></span>' +
+        '<div class="market-calc-pop" id="mk-calc" style="display:none"><div class="market-calc-row">' +
+          '<span class="craft-stepper"><button type="button" class="craft-step-btn" data-calc-dir="-1" aria-label="減少">−</button><input type="number" id="mk-calc-n" min="1" max="99999" inputmode="numeric" placeholder="數量" aria-label="想買的數量"><button type="button" class="craft-step-btn" data-calc-dir="1" aria-label="增加">+</button></span>' +
+          '<span class="market-calc-unit">件</span>' +
+          '<select id="mk-calc-q" class="craft-select market-calc-q" aria-label="品質"><option value="">不限品質</option><option value="nq">只買NQ</option><option value="hq">只買HQ</option></select></div>' +
+          '<div class="market-calc-out" id="mk-calc-out"></div></div>' +
       '</div>' +
       // 表頭獨立在捲動區域外面，欄寬用同一組mfl-*class對齊（不用<table>），捲動時表頭固定不動，內容在下面單獨捲動
       '<div id="mk-tab-head"></div>' +
@@ -1034,7 +1124,7 @@
     // token 避免使用者連續切換時，慢回來的舊結果蓋掉新畫面。
     let statToken = 0;
     const worldHist24Cache = {}, worldVelCache = {};
-    function setStatBar(st) { const el = $('mk-stat-bar'); if (el) { el.innerHTML = buildStatBarHtml(st); bindAvgBadge(); fitStatBar(el); mkObserveFit(el, function () { fitStatBar(el); }); } }
+    function setStatBar(st) { refAvg = (st.avgDisplay != null && !st.avgIsFallback) ? st.avgDisplay : null; updateSignals(); const el = $('mk-stat-bar'); if (el) { el.innerHTML = buildStatBarHtml(st); bindAvgBadge(); fitStatBar(el); mkObserveFit(el, function () { fitStatBar(el); }); } }
     async function updateStatBar() {
       const token = ++statToken;
       if (worldFilter === 'ALL') { setStatBar(dcStat); return; }
@@ -1049,7 +1139,7 @@
         let avgDisplay = st.avg24h, avgIsFallback = false;
         if (avgDisplay == null && ls.length) { avgDisplay = Math.round(ls.reduce(function (t, l) { return t + l.pricePerUnit; }, 0) / ls.length); avgIsFallback = true; }
         // 注意：st.avg24h 是抓取腳本算好的，已經在伺服器那邊排除過異常成交，這裡不用重複處理
-        setStatBar(Object.assign({ avgDisplay: avgDisplay, avgIsFallback: avgIsFallback, velocity: st.velocity }, base));
+        setStatBar(Object.assign({ avgDisplay: avgDisplay, avgIsFallback: avgIsFallback, velocity: st.velocity, txnFreq: st.txnFreq, turnover: st.turnover }, base));
         return;
       }
       setStatBar(Object.assign({ avgLoading: true, velLoading: true }, base));
@@ -1064,14 +1154,16 @@
       const nowSec = Date.now() / 1000;
       const recent = MarketData.excludeOutlierEntries(hist.filter(function (h) { return h.timestamp >= nowSec - 86400; }), function (h) { return h.pricePerUnit; });
       let avgDisplay = null, avgIsFallback = false;
-      if (recent.length) avgDisplay = Math.round(recent.reduce(function (t, h) { return t + h.pricePerUnit; }, 0) / recent.length);
+      if (recent.length) avgDisplay = MarketData.weightedAvgPrice(recent);
       else if (ls.length) { avgDisplay = Math.round(ls.reduce(function (t, l) { return t + l.pricePerUnit; }, 0) / ls.length); avgIsFallback = true; }
       setStatBar(Object.assign({ avgDisplay: avgDisplay, avgIsFallback: avgIsFallback }, base));
     }
 
     // hq-only／手續費是純畫面篩選或計算；世界篩選要重新查（見下面說明）
-    let hqOnly = false, includeFee = false;
-    let activeTab = 'listing', tabToken = 0, currentHistory = [];
+    let hqOnly = !!(keep && keep.hq), includeFee = !!(keep && keep.fee);
+    let activeTab = keep ? keep.tab : 'listing', tabToken = 0, currentHistory = [];
+    let listingError = false;       // 這個世界的掛單查詢失敗（跟「沒有掛單」要分開顯示）
+    const worldNoListing = {};      // 已經確認「這個世界完全沒有掛單」的世界
     const worldListingsCache = {}; // 同一次開啟頁面內，切換過的世界不用重複查
     const worldHistoryCache = {};
     const trendViews = {};         // 各世界範圍的走勢圖：{世界或'ALL': {el, ts}}，見 renderActiveTab
@@ -1080,19 +1172,28 @@
     let activeListingSet = overview.listings;
     function setActiveListingSet(list) {
       activeListingSet = list;
-      const c = $('mk-tab-count'); if (c) c.textContent = list.length;
+      const c = $('mk-tab-count'); if (c) c.textContent = (list.total != null ? list.total : list.length) + '項';
+      if (typeof updateSignals === 'function') updateSignals();
     }
     // 欄位排版：價格→數量→總價是一組（總價＝價格×數量，是前兩欄的結果，所以緊靠在一起），
     // 跟後面的僱員／買家、世界之間留明顯間距，閱讀時才分得出「數字區」跟「人／地點區」。
     const LISTING_HEAD = '<div class="market-flexrow market-flexrow-head"><span class="mfl-price mfl-r">價格(金)</span><span class="mfl-qty mfl-r">數量</span><span class="mfl-total mfl-r">總價</span><span class="mfl-buyer">僱員</span><span class="mfl-world">世界</span></div>';
     const HISTORY_HEAD = '<div class="market-flexrow market-flexrow-head"><span class="mfl-price mfl-r">成交價(金)</span><span class="mfl-qty mfl-r">數量</span><span class="mfl-total mfl-r">總價</span><span class="mfl-buyer">買家</span><span class="mfl-world">世界</span><span class="mfl-time">時間</span></div>';
-    function escHtml(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
     function priceCellHtml(hq, price) { return '<span class="mfl-price mfl-pricehq"><span>' + (hq ? hqIconHtml() : '') + '</span><span>' + price.toLocaleString() + '</span></span>'; }
     function renderListingTableFromActiveSet() {
+      if (listingError) {
+        $('mk-listing-table-slot').innerHTML = '<p class="craft-muted" style="padding:8px 0"><i class="ph ph-warning"></i> 查詢失敗 <button type="button" class="market-history-btn" id="mk-wl-retry"><i class="ph ph-arrow-clockwise"></i> 重試</button></p>';
+        const rb = $('mk-wl-retry'); if (rb) rb.addEventListener('click', function () { $('mk-world-filter').dispatchEvent(new Event('change')); });
+        updateCalc(); return;
+      }
+      renderListingRows();
+      updateCalc();
+    }
+    function renderListingRows() {
       let rows = hqOnly ? activeListingSet.filter(function (l) { return l.hq; }) : activeListingSet;
-      const feeRate = (taxInfo && taxInfo.ratePercent) ? taxInfo.ratePercent / 100 : 0;
+      const feeRate = includeFee ? MarketData.buyTaxRate : 0; // 買方稅固定 5%（賣方稅才依城市不同）
       $('mk-listing-table-slot').innerHTML = rows.length ? rows.map(function (l) {
-        const total = l.pricePerUnit * l.quantity * (includeFee ? (1 + feeRate) : 1);
+        const total = l.pricePerUnit * l.quantity * (1 + feeRate);
         // 僱員名不截斷（名字最長約6~7個字，空間夠就完整顯示），只有放不下才用…並且滑鼠停留看全名。
         const name = escHtml(l.retainerName || '—');
         return '<div class="market-flexrow' + (rows[0] === l ? ' market-flexrow-best' : '') + '">' + priceCellHtml(l.hq, l.pricePerUnit) +
@@ -1120,9 +1221,15 @@
         if (worldFilter === 'ALL') currentHistory = overview.history || [];
         else {
           if (!worldHistoryCache[worldFilter]) {
-            slot.innerHTML = '<p class="craft-muted" style="padding:8px 0">讀取' + worldFilter + '成交紀錄中⋯</p>';
-            try { worldHistoryCache[worldFilter] = await MarketData.getRecentHistoryForWorld(itemId, worldFilter, 50); }
-            catch (e) { worldHistoryCache[worldFilter] = []; }
+            const wf = worldFilter;
+            slot.innerHTML = '<p class="craft-muted" style="padding:8px 0">讀取' + wf + '成交紀錄中⋯</p>';
+            try { worldHistoryCache[wf] = await MarketData.getRecentHistoryForWorld(itemId, wf, 50); }
+            catch (e) { // 失敗不存快取，也不假裝「沒有成交」：顯示失敗並給重試
+              if (token !== tabToken) return;
+              slot.innerHTML = '<p class="craft-muted" style="padding:8px 0"><i class="ph ph-warning"></i> 查詢失敗 <button type="button" class="market-history-btn" id="mk-hist-retry"><i class="ph ph-arrow-clockwise"></i> 重試</button></p>';
+              const rb = $('mk-hist-retry'); if (rb) rb.addEventListener('click', function () { renderActiveTab(); });
+              return;
+            }
             if (token !== tabToken) return;
           }
           currentHistory = worldHistoryCache[worldFilter];
@@ -1142,23 +1249,24 @@
       renderTrendInto(el, itemId, worldFilter === 'ALL' ? null : worldFilter);
     }
     function setTab(tab) {
-      activeTab = tab;
+      activeTab = tab; view.tab = tab;
       box.querySelectorAll('[data-mk-tab]').forEach(function (b) {
         const on = b.dataset.mkTab === tab;
         b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
       });
       $('mk-hq-filter-btn').style.display = tab === 'trend' ? 'none' : '';   // 走勢圖自己有NQ/HQ選單
-      $('mk-fee-label').style.display = tab === 'listing' ? '' : 'none';      // 手續費只影響在售表格的總價
+      $('mk-bar-r').style.display = tab === 'listing' ? '' : 'none';          // 買方稅、掛單訊號只跟在售表格有關
+      $('mk-calc-btn').style.display = tab === 'listing' ? '' : 'none';       // 數量計算器也只跟在售有關
+      if (tab !== 'listing') closeCalc();
       renderActiveTab();
     }
     box.querySelectorAll('[data-mk-tab]').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.mkTab); }); });
-    renderActiveTab();
     $('mk-hq-filter-btn').addEventListener('click', function () {
-      hqOnly = !hqOnly;
+      hqOnly = !hqOnly; view.hq = hqOnly;
       this.classList.toggle('active', hqOnly);
       if (activeTab === 'history') renderHistoryTable(); else renderListingTableFromActiveSet();
     });
-    $('mk-fee-toggle').addEventListener('change', function () { includeFee = this.checked; renderListingTableFromActiveSet(); });
+    $('mk-fee-toggle').addEventListener('change', function () { includeFee = this.checked; view.fee = includeFee; renderListingTableFromActiveSet(); });
     // 小字裡的「更新時間」跟著範圍走：選了某個世界就顯示那個世界自己的資料更新時間（API有給的話），不然顯示整個資料中心最新的
     function updateFreshness() {
       const el = $('mk-fresh'); if (!el) return;
@@ -1172,16 +1280,23 @@
         .concat(dcWorlds.map(function (w) { return { key: w, name: w, price: worldMinPrice[w] != null ? worldMinPrice[w] : null, ts: worldTimes[w] || null }; }));
       const prices = cells.slice(1).map(function (c) { return c.price; }).filter(function (v) { return v != null; });
       const best = prices.length ? Math.min.apply(null, prices) : null;
+      // 手上只有「全服最便宜的 N 筆」掛單。沒出現在裡面的世界不代表沒人賣：它的最低價「至少」要等於這 N 筆裡最貴的那筆。
+      // 只有確定手上這批就是全部掛單（總筆數沒超過 N），或是已經查過那個世界確實沒有掛單，才顯示「無」。
+      const listedN = overview.listings.length;
+      const allShown = overview.listingsCount != null ? overview.listingsCount <= listedN : listedN < 100;
+      const lowerBound = listedN ? overview.listings[listedN - 1].pricePerUnit : null;
       // 每格兩行：世界名／最低價。資料更新距今只有「過舊」（超過6小時，橘色；超過1天，紅色）才在價格旁邊標出來，
       // 新鮮的不標——新鮮是常態，每格都寫一次只是雜訊，還會讓每格多一行高度；完整時間放在滑鼠停留的提示裡。
       strip.innerHTML = cells.map(function (c) {
         const isBest = c.key !== 'ALL' && c.price != null && c.price === best;
         const stale = c.key !== 'ALL' && c.ts && (Date.now() - c.ts) / 3600e3 >= 6;
-        const tip = c.key === 'ALL' ? '所有世界' : (c.price == null ? c.name + '：沒有出現在全服最便宜的100筆裡（價格較高）' : c.name + '目前最低價 ' + c.price.toLocaleString() + ' 金') +
+        const none = c.key !== 'ALL' && c.price == null && (allShown || worldNoListing[c.key]);
+        const bound = c.key !== 'ALL' && c.price == null && !none && lowerBound != null;
+        const tip = c.key === 'ALL' ? '所有世界' : (none ? c.name + '：目前沒有掛單' : (bound ? c.name + '：最低價 ≥ ' + lowerBound.toLocaleString() + ' 金' : (c.price == null ? c.name : c.name + '目前最低價 ' + c.price.toLocaleString() + ' 金'))) +
           (c.ts && c.key !== 'ALL' ? '（資料更新於' + timeAgo(c.ts / 1000) + '）' : '');
         return '<button type="button" class="mws-cell' + (worldFilter === c.key ? ' active' : '') + (isBest ? ' is-best' : '') + '" data-world="' + c.key + '" title="' + tip + '">' +
           '<span class="mws-name">' + c.name + '</span>' +
-          '<span class="mws-price">' + (c.price != null ? fmtCompactGil(c.price) : '—') + (stale ? '<span class="mws-age' + ageClass(c.ts) + '">' + shortAgo(c.ts) + '</span>' : '') + '</span>' +
+          '<span class="mws-price">' + (c.price != null ? fmtCompactGil(c.price) : (none ? '<span class="mws-none">無</span>' : (bound ? '<span class="mws-lb">≥' + fmtCompactGil(lowerBound) + '</span>' : '—'))) + (stale ? '<span class="mws-age' + ageClass(c.ts) + '">' + shortAgo(c.ts) + '</span>' : '') + '</span>' +
         '</button>';
       }).join('');
       fitWorldStrip(strip); mkObserveFit(strip, function () { fitWorldStrip(strip); });
@@ -1194,27 +1309,122 @@
       sel.dispatchEvent(new Event('change')); // 隱藏的下拉仍然是「目前範圍」的唯一來源，邏輯照舊
     });
     renderWorldStrip();
+    /* 寄售稅後：跟著下方選的世界走（選「所有世界」＝全服最低價，選某個世界＝那個世界自己的最低價），
+     * NQ 跟 HQ 是不同的東西，各算各的，不混在一起。賣出只能在自己的世界，所以選「所有世界」時提示去點自己的世界看更準。 */
+    function updateTaxNote(loading) {
+      const el = $('mk-taxnote'); if (!el || !taxInfo) return;
+      if (loading) { el.textContent = '寄售稅後 ≈ ⋯'; el.removeAttribute('title'); return; }
+      const src = worldFilter === 'ALL' ? overview.listings : activeListingSet;
+      function minOf(isHq) { let m = null; (src || []).forEach(function (l) { if (!!l.hq === isHq && (m == null || l.pricePerUnit < m)) m = l.pricePerUnit; }); return m; }
+      let nq, hq;
+      if (worldFilter === 'ALL') { nq = overview.minPriceNQ || minOf(false); hq = overview.minPriceHQ || minOf(true); } // 全服：優先用 API 算好的（涵蓋全部掛單，不限前100筆）
+      else { nq = minOf(false); hq = minOf(true); }
+      const pct = Math.round(taxInfo.ratePercent * 10) / 10;
+      const net = function (v) { return Math.round(v * (1 - taxInfo.ratePercent / 100)); };
+      const parts = [], tipParts = [];
+      if (nq != null) { parts.push('NQ <span style="color:#4ade80">' + net(nq).toLocaleString() + '</span>'); tipParts.push('NQ 最低 ' + nq.toLocaleString() + ' → 約拿 ' + net(nq).toLocaleString()); }
+      if (hq != null) { parts.push('HQ <span style="color:#4ade80">' + net(hq).toLocaleString() + '</span>'); tipParts.push('HQ 最低 ' + hq.toLocaleString() + ' → 約拿 ' + net(hq).toLocaleString()); }
+      if (!parts.length) { el.textContent = ''; el.removeAttribute('title'); return; }
+      el.innerHTML = '寄售稅後 ≈ ' + parts.join('　') + '（' + pct + '%）';
+      el.title = (worldFilter === 'ALL' ? '全服' : worldFilter) + '最低價扣賣方稅 ' + pct + '%（' + taxInfo.cityName + '）：' + tipParts.join('；');
+    }
+    /* 數量計算器：從目前範圍（所有世界／選的世界）最便宜的掛單開始買，算買 N 件實際要花多少。
+     * 買方稅固定 5%。掛單只取最便宜的那批（至多100筆），數量超過手上掛單就明說「只夠 K 件」，不假裝買得到。 */
+    function updateCalc() {
+      const inp = $('mk-calc-n'), out = $('mk-calc-out'), q = $('mk-calc-q'); if (!inp || !out) return;
+      const n = parseInt(inp.value, 10);
+      if (!(n > 0)) { out.textContent = ''; return; }
+      if (listingError) { out.textContent = '掛單查詢失敗，暫時無法計算'; return; }
+      const want = q.value;
+      const rows = (activeListingSet || []).filter(function (l) { return want === 'hq' ? l.hq : (want === 'nq' ? !l.hq : true); });
+      let remain = n, cost = 0, lastPrice = null; const worlds = {};
+      for (let k = 0; k < rows.length && remain > 0; k++) {
+        const take = Math.min(remain, rows[k].quantity);
+        cost += take * rows[k].pricePerUnit; remain -= take; lastPrice = rows[k].pricePerUnit; worlds[rows[k].world] = true;
+      }
+      const got = n - remain;
+      if (!got) { out.textContent = '目前沒有符合的掛單'; return; }
+      const tax = Math.round(cost * MarketData.buyTaxRate), total = cost + tax;
+      const per = Math.round(cost / got); // 每件均價（不含稅）：拿來跟成交均價比，訊號才是「價格」的比較，不被稅影響
+      out.innerHTML = '<b class="market-calc-total" title="' + cost.toLocaleString() + ' ＋稅 ' + tax.toLocaleString() + '（買方稅 5%）">' + total.toLocaleString() + '</b><small>金</small>' +
+        '<span class="market-calc-per" title="每件均價（不含稅）；最貴那件 ' + lastPrice.toLocaleString() + (worldFilter === 'ALL' ? '；跨 ' + Object.keys(worlds).length + ' 個世界' : '') + '">≈' + per.toLocaleString() + '/件</span>' +
+        sigChipHtml('buy', per) +
+        (remain > 0 ? '<span class="market-calc-warn" title="目前掛單（最便宜的 ' + (activeListingSet || []).length + ' 筆）只夠 ' + got + ' 件"><i class="ph ph-warning"></i>' + got + '件</span>' : '');
+    }
+    /* ── 價格訊號（沒有開關）：把「現在要付／能賣到的價」跟「成交均價（件數加權）」比。
+     *   買（計算器裡）：輸入的數量，吃最便宜的 N 件的實際均價 對比 成交均價。
+     *   賣（在售列右側「掛單」）：最低 3 筆掛單的均價（件數加權）對比 成交均價，比單看最低價不容易被一兩筆特例拉歪。
+     * 顏色跟全站漲跌一致：紅＝比成交均價高（▲）、綠＝比成交均價低（▼）、灰＝差在 3% 以內。
+     * 沒有成交均價（只剩掛單均價可用）或資料不足就不顯示。±3% 以內算持平（灰）。 */
+    let refAvg = null;
+    function sigChipHtml(kind, price) {
+      if (refAvg == null || !(price > 0)) return '';
+      const pct = (price - refAvg) / refAvg * 100, abs = Math.abs(pct);
+      const cls = abs < 3 ? 'flat' : (pct > 0 ? 'up' : 'down'); // 顏色跟全站漲跌一致：紅＝比成交均價高、綠＝比成交均價低
+      return '<span class="market-sig-chip ' + cls + '" title="' + Math.round(price).toLocaleString() + ' ／ 成交均價 ' + refAvg.toLocaleString() + '">' + (pct > 0 ? '▲' : '▼') + (abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)) + '%</span>';
+    }
+    function updateSignals() {
+      const el = $('mk-sig-sell'); if (!el) return;
+      const set = (activeListingSet || []).slice(0, 3);
+      let v = 0, q = 0; set.forEach(function (l) { v += l.pricePerUnit * l.quantity; q += l.quantity; });
+      const chip = (!listingError && q > 0) ? sigChipHtml('sell', v / q) : '';
+      el.style.display = chip ? '' : 'none';
+      el.innerHTML = chip ? '<span class="market-sig-lead" title="最低 3 筆掛單的均價，對比成交均價">掛單</span>' + chip : '';
+      updateCalc();
+    }
+    // 計算器浮出面板：點小按鈕開關，點外面或按 Esc 關；不佔表格的列數
+    function closeCalc() { const pop = $('mk-calc'); if (pop) pop.style.display = 'none'; const b = $('mk-calc-btn'); if (b) { b.classList.remove('on'); b.setAttribute('aria-expanded', 'false'); } }
+    $('mk-calc-btn').addEventListener('click', function (e) {
+      e.stopPropagation();
+      const pop = $('mk-calc'), open = pop.style.display === 'none';
+      pop.style.display = open ? '' : 'none'; this.classList.toggle('on', open); this.setAttribute('aria-expanded', open ? 'true' : 'false');
+      if (open) { $('mk-calc-n').focus(); updateCalc(); }
+    });
+    document.addEventListener('click', function (e) { const pop = $('mk-calc'); if (pop && pop.style.display !== 'none' && !pop.contains(e.target) && !e.target.closest('.wl-dd-list')) closeCalc(); });
+    $('mk-calc').addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeCalc(); $('mk-calc-btn').focus(); e.stopPropagation(); } });
+    $('mk-calc').querySelectorAll('[data-calc-dir]').forEach(function (b) {
+      b.addEventListener('click', function () { const inp = $('mk-calc-n'); inp.value = Math.max(1, (parseInt(inp.value, 10) || 0) + parseInt(b.dataset.calcDir, 10)); updateCalc(); });
+    });
+    $('mk-calc-n').addEventListener('input', updateCalc);
+    $('mk-calc-q').addEventListener('change', updateCalc);
+
     $('mk-world-filter').addEventListener('change', async function () {
-      worldFilter = this.value;
+      const target = this.value; // 先記下「這次切到哪個世界」：下面 await 回來後，使用者可能已經又切走了
+      worldFilter = target; view.world = target;
       renderWorldStrip();
       updateFreshness();
+      listingError = false;
       // 成交／走勢分頁立刻跟著新範圍重畫；掛單資料仍在背景更新（統計徽章要用）
       if (activeTab !== 'listing') renderActiveTab();
-      if (worldFilter === 'ALL') { setActiveListingSet(overview.listings); if (activeTab === 'listing') renderListingTableFromActiveSet(); updateStatBar(); return; }
-      if (worldListingsCache[worldFilter]) { setActiveListingSet(worldListingsCache[worldFilter]); if (activeTab === 'listing') renderListingTableFromActiveSet(); updateStatBar(); return; }
-      if (activeTab === 'listing') $('mk-listing-table-slot').innerHTML = '<p class="craft-muted" style="padding:8px 0">查詢' + worldFilter + '掛單中⋯</p>';
-      try {
-        const listings = await MarketData.getListingsForWorld(itemId, worldFilter);
-        worldListingsCache[worldFilter] = listings;
-        if (listings.length) worldMinPrice[worldFilter] = Math.min.apply(null, listings.map(function (l) { return l.pricePerUnit; }));
-        setActiveListingSet(listings);
-        renderWorldStrip();
-      } catch (e) {
-        setActiveListingSet([]);
+      if (target === 'ALL') { setActiveListingSet(overview.listings); updateTaxNote(); if (activeTab === 'listing') renderListingTableFromActiveSet(); updateStatBar(); return; }
+      if (worldListingsCache[target]) { setActiveListingSet(worldListingsCache[target]); updateTaxNote(); if (activeTab === 'listing') renderListingTableFromActiveSet(); updateStatBar(); return; }
+      if (activeTab === 'listing') $('mk-listing-table-slot').innerHTML = '<p class="craft-muted" style="padding:8px 0">查詢' + target + '掛單中⋯</p>';
+      updateTaxNote(true);
+      let listings = null;
+      try { listings = await MarketData.getListingsForWorld(itemId, target); } catch (e) { listings = null; }
+      if (myLoad !== detailLoadToken) return; // 已經換物品或重畫了
+      if (listings) { // 結果一律只存進「那個世界」自己的快取；以前存進目前選的世界，快速連點時會把 A 世界的掛單存成 B 世界的
+        worldListingsCache[target] = listings;
+        if (listings.length) worldMinPrice[target] = Math.min.apply(null, listings.map(function (l) { return l.pricePerUnit; }));
+        else worldNoListing[target] = true;
       }
+      renderWorldStrip();
+      if (target !== worldFilter) return; // 查詢期間又切到別的世界：這份結果只留在快取，不動現在的畫面
+      listingError = !listings;
+      setActiveListingSet(listings || []);
+      updateTaxNote();
       if (activeTab === 'listing') renderListingTableFromActiveSet();
-      if (worldFilter === this.value) updateStatBar(); // 查詢期間又切走了就不用更新
+      updateStatBar();
     });
+
+    // 還原／同步畫面狀態（改設定重畫時，沿用原本的分頁、世界、HQ篩選、買方稅勾選）
+    refAvg = (dcStat.avgDisplay != null && !dcStat.avgIsFallback) ? dcStat.avgDisplay : null; // 訊號用的「成交均價」：一開始是所有世界那組（選了世界後由統計列更新）
+    updateSignals();
+    $('mk-hq-filter-btn').classList.toggle('active', hqOnly);
+    $('mk-fee-toggle').checked = includeFee;
+    updateTaxNote();
+    setTab(activeTab);
+    if (keep && keep.world !== 'ALL' && dcWorlds.indexOf(keep.world) >= 0) { $('mk-world-filter').value = keep.world; $('mk-world-filter').dispatchEvent(new Event('change')); }
   }
 
   /* 成交紀錄跟走勢圖是「輔助資訊」——玩家主要決策看的是目前掛單跟供應鏈。以前為了不擠壓主要資訊做成彈窗，
@@ -1237,6 +1447,7 @@
       openItem: openItemDetail,
       // 成交頻率：跟熱度排行、代幣兌換同一套定義（筆/天，近30天成交不到5筆時算不出來＝0）
       txnFreq: function (row) { return row ? liquidityOf('x', { items: { x: row } }).txnFreq : null; },
+      compactGil: fmtCompactGil, // 價格簡寫（萬／億）跟物品頁用同一個函式，同一個價格在各處長得一樣
       // 製作成本欄位：跟供應鏈圖同一套算法與基準設定；配方庫（好幾MB）等到真的要顯示成本才載入
       craftInfo: async function (id) {
         const ok = await ensureCraftDataLoaded();
@@ -1859,7 +2070,10 @@
   /* 供應鏈圖外面包一層：先讀設定＋預先計算資料，把「自製 vs 直購」的結論算出來，
    * 再交給 renderSupplyChain 畫圖＋標結論。設定一改（水晶/價格基準/材料品質）就整個重算重畫，
    * 不需要重新整理整個物品詳情頁。 */
+  let prefsSupplyHooked = false;
+  let lastSupplyCtx = null; // 最後一次畫供應鏈圖的物品與容器：全站取價設定改了要能原地重畫
   async function renderSupplyChainWithBreakdown(itemId, rid, box) {
+    lastSupplyCtx = { itemId: itemId, rid: rid, box: box };
     const settings = getSupplySettings();
     box.innerHTML = '<p class="craft-muted">讀取供應鏈中⋯</p>';
     // 只要圖上會出現任何卡片（不管是材料還是用在哪）就要讀價格快照——用在哪的卡片一樣需要買/做比較，
@@ -2062,14 +2276,10 @@
     const windowLoading = pop.dataset.windowLoading === '1'; // 30天窗口正在抓取時顯示讀取中，不讓select消失造成「沒反應」的錯覺
     pop.innerHTML =
       '<p class="craft-mat-worlds-title">供應鏈比較設定</p>' +
-      '<div class="market-supply-settings-row"><span>價格基準</span>' +
-        '<select id="mk-sup-basis" class="craft-select" style="font-size:11px">' +
-          '<option value="listing"' + (s.materialsBasis === 'listing' ? ' selected' : '') + '>掛單最低價</option>' +
-          '<option value="avg"' + (s.materialsBasis === 'avg' ? ' selected' : '') + '>成交均價</option>' +
-        '</select></div>' +
+      '<div class="market-supply-settings-row">' + MarketData.pricePrefsBarHtml(['buy']) + '</div>' +
+        '<p class="craft-muted" style="font-size:10px;margin:-2px 0 6px">決定圖上所有卡片的顯示價，也決定買/做比較時材料怎麼算</p>' +
       (s.materialsBasis === 'avg' ? '<div class="market-supply-settings-row"><span>均價窗口</span>' + avgWindowSelectHtml('mk-sup-mwindow', s.materialsAvgWindow) + (windowLoading ? ' <span class="craft-muted" style="font-size:10px">讀取中⋯</span>' : '') + '</div>' : '') +
-      '<p class="craft-muted" style="font-size:10px;margin:-2px 0 6px">決定圖上所有卡片的顯示價，也決定買/做比較時材料怎麼算</p>' +
-      '<div class="market-supply-settings-row"><span>材料品質（全域）</span>' +
+            '<div class="market-supply-settings-row"><span>材料品質（全域）</span>' +
         '<select id="mk-sup-persp" class="craft-select" style="font-size:11px">' +
           '<option value="nq"' + (s.matPersp === 'nq' ? ' selected' : '') + '>NQ</option>' +
           '<option value="hq"' + (s.matPersp === 'hq' ? ' selected' : '') + '>HQ</option>' +
@@ -2113,7 +2323,6 @@
       const freshDcData = await renderSupplyChainWithBreakdown(itemId, rid, box); // 重畫背後的圖
       await openSupplySettingsPopover(box, itemId, rid, freshDcData); // 面板留著，用最新資料／設定重新畫一次內容（不關閉）
     }
-    $('mk-sup-basis').addEventListener('change', function () { apply({ materialsBasis: this.value }); });
     $('mk-sup-persp').addEventListener('change', function () { apply({ matPersp: this.value }); });
     $('mk-sup-crystal').addEventListener('click', function () { apply({ includeCrystal: this.dataset.on !== '1' }); });
     const mWin = $('mk-sup-mwindow'); if (mWin) mWin.addEventListener('change', function () { apply({ materialsAvgWindow: this.value }); });
@@ -3037,47 +3246,69 @@
       '</div>';
   }
 
+  /* 依需要量吃掛單：ls＝這個材料的掛單 [[單價,數量,是否HQ],...]（由便宜到貴）。
+   * 先只用 NQ（跟材料取價慣例一致），NQ 不夠才連 HQ 一起用；掛單量不夠湊滿需要量就回傳 null（改回估算，不假裝買得到）。
+   * 回傳「每件平均單價」。 */
+  function fillAvgUnit(ls, need) {
+    let pool = ls.filter(function (x) { return !x[2]; });
+    let have = pool.reduce(function (t, x) { return t + x[1]; }, 0);
+    if (have < need) { pool = ls; have = pool.reduce(function (t, x) { return t + x[1]; }, 0); }
+    if (have < need) return null;
+    let remain = need, cost = 0;
+    for (let i = 0; i < pool.length && remain > 0; i++) { const t = Math.min(remain, pool[i][1]); cost += t * pool[i][0]; remain -= t; }
+    return cost / need;
+  }
   function computeRadarList(jobId, ui, dcData, sellData) {
-    const persp = ui.persp, basis = ui.basis, pIdx = HOT_PERSP_IDX[persp];
+    const persp = ui.persp, buyBasis = ui.buyBasis, sellBasis = ui.sellBasis, pIdx = HOT_PERSP_IDX[persp];
+    const liveLs = (buyBasis === 'listing' && ui.matMode === 'buy') ? ui.liveBuy : null; // 只有「直接買」＋最低價才依數量精算
     const rows = [];
     let skippedMat = 0, skippedSell = 0;
     // 兩種材料成本都算：畫面上要並排顯示「直接買」跟「自動選較便宜」，讓使用者知道自己做到底省多少
-    const resolveBuy = makeCostResolver(dcData, basis, false);
-    const resolveAuto = makeCostResolver(dcData, basis, true);
+    const resolveBuy = makeCostResolver(dcData, buyBasis, false);
+    const resolveAuto = makeCostResolver(dcData, buyBasis, true);
     const useAuto = ui.matMode === 'auto';
     const jobRecipeIds = Object.keys(CRAFT_RECIPES).filter(function (rid) { return CRAFT_RECIPES[rid].jobId === jobId && isTwRecipe(CRAFT_RECIPES[rid]); });
     const seenItem = {};
-    function sumCost(recipe, resolve) {
-      let cost = 0, crafted = 0;
+    function sumCost(recipe, resolve, refine) {
+      let cost = 0, crafted = 0, refined = !!(refine && liveLs);
       for (const ing of (recipe.ingredients || [])) {
         const c = resolve(ing.itemId);
         if (!c) return null;
-        cost += c.cost * ing.amount;
+        let unitCost = c.cost;
         if (c.mode === 'craft') crafted++;
+        else if (refine && liveLs && c.cost > 0) { // 依配方數量逐件吃掛單；查不到掛單或量不夠就退回最低價估算，並標成「估算」
+          const e = liveLs[ing.itemId], f = e && e.ls ? fillAvgUnit(e.ls, ing.amount) : null;
+          if (f != null) unitCost = f; else refined = false;
+        }
+        cost += unitCost * ing.amount;
       }
-      return { cost: cost, crafted: crafted };
+      return { cost: cost, crafted: crafted, refined: refined };
     }
     jobRecipeIds.forEach(function (rid) {
       const recipe = CRAFT_RECIPES[rid];
       if (seenItem[recipe.itemId]) return; // 同一個成品有多個配方時只算第一個
       seenItem[recipe.itemId] = true;
       const sellRow = sellData.items[recipe.itemId];
-      const unit = radarUnitPrice(sellRow, persp, basis);
+      const unit = radarUnitPrice(sellRow, persp, sellBasis);
       // 成品要「有在賣出」才有意義：只有掛單、近幾天完全沒成交的成品，賣得掉才是問題
       if (!unit || !(hotVelocity(sellRow, persp) > 0)) { skippedSell++; return; }
-      const buy = sumCost(recipe, resolveBuy), auto = sumCost(recipe, resolveAuto);
+      const buy = sumCost(recipe, resolveBuy, true), auto = sumCost(recipe, resolveAuto, false);
       const chosen = useAuto ? auto : buy;
       if (!chosen) { skippedMat++; return; }
-      const cost = chosen.cost, craftedN = useAuto ? chosen.crafted : 0;
+      let cost = chosen.cost; const craftedN = useAuto ? chosen.crafted : 0;
       const yields = recipe.yields || 1;
-      const sell = unit * yields;
+      let sell = unit * yields;
+      if (ui.tax) { cost *= 1 + MarketData.buyTaxRate; sell *= 1 - (ui.sellTaxRate != null ? ui.sellTaxRate : 0.05); } // 含稅：買方固定5%、賣方依城市（查不到就用5%）
       const profit = sell - cost;
       const P = sellRow[pIdx];
       rows.push({
         rid: rid, itemId: recipe.itemId, cost: cost, sell: sell, unit: unit, yields: yields, profit: profit, craftedN: craftedN,
         costBuy: buy ? buy.cost : null, costAuto: auto ? auto.cost : null,
         roi: cost > 0 ? (profit / cost) * 100 : 0, vel: hotVelocity(sellRow, persp), P: P,
-        otherPrice: basis === 'listing' ? (P ? P[4] : null) : radarUnitPrice(sellRow, persp, 'listing'),
+        otherPrice: sellBasis === 'listing' ? (P ? P[4] : null) : radarUnitPrice(sellRow, persp, 'listing'),
+        refined: !useAuto && !!(buy && buy.refined),
+        // ⚠：最低掛單價遠低於成交均價（可能是一兩筆低價特例，或行情正在跌），拿最低價或均價估賣價時都要留意
+        warnLow: (function () { const lst = sellBasis === 'listing' ? unit : radarUnitPrice(sellRow, persp, 'listing'), av = sellBasis === 'avg' ? unit : (P ? P[4] : null); return !!(lst && av && lst < av * 0.7); })(),
         change: P ? ((P[2] - P[4]) / P[4]) * 100 : null, band: hotBandIndex(unit),
       });
     });
@@ -3097,9 +3328,12 @@
 
   function renderRadarShell() {
     const box = $('mk-pane-radar');
-    const ui = { job: null, basis: 'listing', matMode: 'buy', sellScope: 'dc', persp: 'all', band: 'all', sort: 'profit', medianOnly: false, profitOnly: false, shown: 50, mode: 'pre' };
+    const ui = { job: null, matMode: 'buy', tax: false, sellTaxRate: null, persp: 'all', band: 'all', sort: 'profit', medianOnly: false, profitOnly: false, shown: 50, mode: 'pre' };
     // 即時掛單價（只在「掛單最低價」基準下用）：id -> { min, minN, minH, time }，材料用資料中心的、成品用成品範圍的
-    const liveDc = {}, liveSell = {};
+    // 買入／賣出各自一份即時掛單價（依各自的範圍查）；範圍改了就清空重查
+    let liveBuy = {}, liveSell = {};
+    function syncPrefs() { const pf = MarketData.getPricePrefs(); ui.buyBasis = pf.buyBasis; ui.sellBasis = pf.sellBasis; ui.buyScope = pf.buyScope; ui.sellScope = pf.sellScope; ui.liveBuy = liveBuy; }
+    syncPrefs();
     const liveTried = {}; // 展開明細時已經補查過即時掛單價的道具（查過一次就不重複查）
     let liveToken = 0, liveRounds = 0, liveNote = '';
     let pc = null; // { dc, sell, meta, ageMs }
@@ -3112,23 +3346,49 @@
         JOB_LIST.map(function (j) { return '<button type="button" class="craft-job-filter-btn" data-mk-radar-job="' + j.id + '">' + j.name + '</button>'; }).join('') +
       '</div>' +
       '<div class="market-hot-controls market-pane-fixed" id="mk-radar-filters" style="display:none">' +
-        row('價格基準', 'basis', [['listing', '掛單最低價'], ['avg', '成交均價']]) +
+        '<div class="market-hot-row-filter">' + MarketData.pricePrefsBarHtml(['buy', 'sell']) + '</div>' +
+        '<button type="button" class="market-fold-btn" id="mk-radar-fold-btn" aria-expanded="false"><i class="ph ph-funnel"></i><span class="market-fold-sum" id="mk-radar-fold-sum"></span><i class="ph ph-caret-down market-fold-caret"></i></button>' +
+        '<div id="mk-radar-fold" style="display:none">' +
         row('材料成本', 'matMode', [['buy', '直接買'], ['auto', '自動選較便宜（買或自己做）']]) +
-        row('成品範圍', 'sellScope', [['dc', '所有世界'], ['world', '我的世界']]) +
         row('成品視角', 'persp', HOT_UI_BTNS.persp) +
         row('價格帶', 'band', HOT_UI_BTNS.band) +
         row('排序', 'sort', RADAR_SORTS) +
         '<label class="market-hot-median"><input type="checkbox" id="mk-radar-median"> 只看成品賣速在「同價格帶」中位數以上的配方</label>' +
         '<label class="market-hot-median"><input type="checkbox" id="mk-radar-profit"> 只顯示有獲利的配方</label>' +
+        '<label class="market-hot-median" title="買方稅固定5%、賣方稅依你的城市"><input type="checkbox" id="mk-radar-tax"> 含稅</label>' +
+        '</div>' +
         '<p class="craft-muted market-hot-status" id="mk-radar-status" style="display:none"></p>' +
       '</div>' +
       '<div id="mk-radar-body" class="market-pane-scrollbody"><p class="craft-muted">選一個職業，找出材料成本低、成品行情高的配方。</p></div>';
 
+    const RADAR_FOLD_KEY = 'ff14fc-radar-fold';
+    function radarFoldSummary() {
+      const parts = [];
+      const act = function (k) { const b = box.querySelector('[data-rk="' + k + '"].active'); return b ? b.textContent : ''; };
+      if (ui.matMode === 'auto') parts.push('買或自己做');
+      if (ui.persp !== 'all') parts.push(act('persp'));
+      if (ui.band !== 'all') parts.push(act('band'));
+      parts.push(act('sort'));
+      if (ui.medianOnly) parts.push('賣速≥中位');
+      if (ui.profitOnly) parts.push('有獲利');
+      if (ui.tax) parts.push('含稅');
+      return parts.filter(Boolean).join('・');
+    }
+    function setRadarFold(open) {
+      $('mk-radar-fold').style.display = open ? '' : 'none';
+      $('mk-radar-fold-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
+      $('mk-radar-fold-btn').classList.toggle('open', open);
+      try { localStorage.setItem(RADAR_FOLD_KEY, open ? 'open' : 'closed'); } catch (e) { /* 存不了就只對這次有效 */ }
+      fitMarketHeights();
+    }
+    $('mk-radar-fold-btn').addEventListener('click', function () { setRadarFold($('mk-radar-fold').style.display === 'none'); });
+    try { if (localStorage.getItem(RADAR_FOLD_KEY) === 'open') setRadarFold(true); } catch (e) { /* 預設收起 */ }
     function setStatus(html) { const el = $('mk-radar-status'); el.innerHTML = html || ''; el.style.display = html ? '' : 'none'; }
     function sync() {
       box.querySelectorAll('[data-mk-radar-job]').forEach(function (b) { b.classList.toggle('active', ui.job !== null && parseInt(b.dataset.mkRadarJob, 10) === ui.job); });
       box.querySelectorAll('[data-rk]').forEach(function (b) { b.classList.toggle('active', String(ui[b.dataset.rk]) === b.dataset.rv); });
       $('mk-radar-filters').style.display = ui.mode === 'pre' && ui.job !== null ? '' : 'none';
+      $('mk-radar-fold-sum').textContent = radarFoldSummary();
     }
     function goLive(note) {
       ui.mode = 'live'; sync(); $('mk-radar-filters').style.display = 'none';
@@ -3167,25 +3427,26 @@
     /* 「前 50 名用即時掛單價更新」：預先計算的掛單價是最多一小時前的快照，
      * 這裡只針對畫面上排在前面的配方，去查它們的成品跟材料「現在」的掛單，更新後重算、重新排序。 */
     async function refreshLive(rowsTop) {
-      if (ui.basis !== 'listing' || liveRounds >= 3 || !rowsTop.length) return;
+      const wantBuy = ui.buyBasis === 'listing', wantSell = ui.sellBasis === 'listing';
+      if ((!wantBuy && !wantSell) || liveRounds >= 3 || !rowsTop.length) return;
       const st = MarketData.getSettings();
       const need = idsForRows(rowsTop);
-      const sellIsDc = ui.sellScope === 'dc';
-      const dcIds = need.mats.filter(function (id) { return !liveFresh(liveDc, id); }).concat(sellIsDc ? need.prod.filter(function (id) { return !liveFresh(liveDc, id) && need.mats.indexOf(id) === -1; }) : []);
-      const sellIds = sellIsDc ? [] : need.prod.filter(function (id) { return !liveFresh(liveSell, id); });
-      if (!dcIds.length && !sellIds.length) return;
+      const buyName = ui.buyScope === 'world' ? st.worldName : st.dcName, sellName = ui.sellScope === 'world' ? st.worldName : st.dcName;
+      const buyIds = wantBuy ? need.mats.filter(function (id) { return !liveFresh(liveBuy, id); }) : [];
+      const sellIds = wantSell ? need.prod.filter(function (id) { return !liveFresh(liveSell, id); }) : [];
+      if (!buyIds.length && !sellIds.length) return;
       liveRounds++;
       const token = ++liveToken, myJob = ui.job;
-      liveNote = '正在用即時掛單價更新前 ' + rowsTop.length + ' 名⋯';
+      liveNote = '⟳ 更新前 ' + rowsTop.length + ' 名即時價';
       const noteEl = $('mk-radar-live'); if (noteEl) noteEl.textContent = liveNote;
-      let dcRes = {}, sellRes = {};
+      let buyRes = {}, sellRes = {};
       try {
         const rs = await Promise.all([
-          dcIds.length ? MarketData.fetchListingsBatchForScope(dcIds, st.dcName) : {},
-          sellIds.length ? MarketData.fetchListingsBatchForScope(sellIds, st.worldName) : {},
+          buyIds.length ? MarketData.fetchListingsBatchForScope(buyIds, buyName) : {},
+          sellIds.length ? MarketData.fetchListingsBatchForScope(sellIds, sellName) : {},
         ]);
-        dcRes = rs[0]; sellRes = rs[1];
-      } catch (e) { liveNote = '即時掛單價更新失敗，目前顯示的是預先計算的價格。'; const el = $('mk-radar-live'); if (el) el.textContent = liveNote; return; }
+        buyRes = rs[0]; sellRes = rs[1];
+      } catch (e) { liveNote = '⚠ 即時價更新失敗，顯示預先計算價'; const el = $('mk-radar-live'); if (el) el.textContent = liveNote; return; }
       if (token !== liveToken || myJob !== ui.job) return; // 使用者已經換了職業或又觸發了新的更新
       let stored = 0;
       function store(dest, res, ids) {
@@ -3194,19 +3455,21 @@
           if (!ls) return; // 這個道具沒查到（請求失敗），保留原本的價格
           stored++;
           const first = function (f) { const x = ls.find(f); return x ? x.pricePerUnit : null; };
-          dest[id] = { min: ls.length ? ls[0].pricePerUnit : null, minN: first(function (l) { return !l.hq; }), minH: first(function (l) { return l.hq; }), time: Date.now() };
+          dest[id] = { min: ls.length ? ls[0].pricePerUnit : null, minN: first(function (l) { return !l.hq; }), minH: first(function (l) { return l.hq; }), time: Date.now(),
+            ls: ls.slice(0, 40).map(function (l) { return [l.pricePerUnit, l.quantity, l.hq ? 1 : 0]; }) }; // 保留前40筆（價格、數量、HQ），依數量精算用
         });
       }
-      store(liveDc, dcRes, dcIds); store(liveSell, sellRes, sellIds);
-      if (!stored) { liveNote = '即時掛單價查詢沒有回傳資料，目前顯示的是預先計算的價格。'; const el = $('mk-radar-live'); if (el) el.textContent = liveNote; return; }
+      store(liveBuy, buyRes, buyIds); store(liveSell, sellRes, sellIds);
+      if (!stored) { liveNote = '⚠ 查無即時價，顯示預先計算價'; const el = $('mk-radar-live'); if (el) el.textContent = liveNote; return; }
       const hh = new Date(); const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
-      liveNote = '已用即時掛單價更新前 ' + rowsTop.length + ' 名（' + pad(hh.getHours()) + ':' + pad(hh.getMinutes()) + '），名次以更新後為準。';
+      liveNote = '✓ 已用即時價更新前 ' + rowsTop.length + ' 名（' + pad(hh.getHours()) + ':' + pad(hh.getMinutes()) + '）';
       renderPre();
     }
     function renderPre() {
       const body = $('mk-radar-body');
-      const dcView = ui.basis === 'listing' ? patchData(pc.dc, liveDc) : pc.dc;
-      const sellView = ui.basis === 'listing' ? (ui.sellScope === 'dc' ? dcView : patchData(pc.sell, liveSell)) : pc.sell;
+      const dcView = ui.buyBasis === 'listing' ? patchData(pc.buy, liveBuy) : pc.buy;      // 材料成本用的資料（買入範圍）
+      const sellView = ui.sellBasis === 'listing' ? patchData(pc.sell, liveSell) : pc.sell; // 成品售價用的資料（賣出範圍）
+      ui.liveBuy = liveBuy;
       const res = computeRadarList(ui.job, ui, dcView, sellView);
       const top = res.list.slice(0, ui.shown);
       if (pc.ageMs > 24 * 3600 * 1000) {
@@ -3218,20 +3481,24 @@
         return;
       }
       const sellLabel = ui.sellScope === 'world' ? '你的世界' : '所有世界';
-      const isListing = ui.basis === 'listing';
+      const buyLabel = ui.buyScope === 'world' ? '你的世界' : '所有世界';
+      const isListing = ui.sellBasis === 'listing';                              // 成品用最低價
+      const anyListing = ui.sellBasis === 'listing' || ui.buyBasis === 'listing'; // 任一邊用掛單價（才需要即時更新）
       const radarMore = moreInfoButton();
       body.innerHTML =
-        '<p class="craft-muted" style="margin-bottom:4px">符合 ' + res.list.length + ' 個配方（' + (res.skippedSell + res.skippedMat) + ' 個查無價格）。' + radarMore.html + '</p>' +
-        (isListing ? '<p class="craft-muted" id="mk-radar-live" style="margin-bottom:4px">' + (liveNote || '') + '</p>' : '') +
+        '<p class="craft-muted" style="margin-bottom:4px">符合 ' + res.list.length + ' 個配方（' + (res.skippedSell + res.skippedMat) + ' 個查無價格）。' + radarMore.html + (anyListing ? '<span class="mk-live" id="mk-radar-live" title="即時掛單價最近更新時間">' + (liveNote || '') + '</span>' : '') + '</p>' +
         moreInfoList(radarMore.id, [
           '售價：成品' + (isListing ? '最低價' : '成交均價') + '（' + sellLabel + '，可切換）',
-          '材料：全資料中心最低價（優先NQ，可跨世界買）',
+          '材料：' + (ui.buyBasis === 'listing' ? '最低價（優先NQ' + (ui.buyScope === 'dc' ? '，可跨世界買' : '') + '）' : '成交均價') + '（' + buyLabel + '）',
           '材料成本：預設只算直接買；「自動選較便宜」會比較直接買和自己做',
-          '未計入製作時間、買方稅、賣方稅',
+          (ui.tax ? '已含買方稅5%與賣方稅' : '未計入買方稅、賣方稅') + '；未計入製作時間',
           '淨利／次：做一次配方（可能不只1件）的總損益',
-          isListing ? '掛單價為快照，最多約1小時前＋玩家回報延遲，僅供參考' : '成交均價取每個道具自己的長窗口均價（較高＝48小時、較低＝7天）',
+          anyListing ? '掛單價為快照，最多約1小時前＋玩家回報延遲，僅供參考；前幾名會用即時掛單更新並依數量精算' : null,
+          (ui.sellBasis === 'avg' || ui.buyBasis === 'avg') ? '成交均價取每個道具自己的長窗口均價（較高＝48小時、較低＝7天）' : null,
+          '成本欄 ✓＝依配方數量逐件吃掛單精算；≈＝用最低價估算',
+          '售價欄 ⚠＝最低掛單價遠低於成交均價（可能是特例，或行情正在下跌）',
           '最後更新：' + new Date(pc.meta.generatedAtMs).toLocaleString()
-        ]) +
+        ].filter(Boolean)) +
         '<div class="market-table-scroll market-radar-scroll"><table class="market-price-table"><thead><tr><th>淨利</th><th>投報率</th><th>成本</th><th>售價</th><th>賣速</th><th>物品</th></tr></thead><tbody>' +
         top.map(function (r) {
           const yieldNote = r.yields > 1 ? fmtGil(r.unit) + '金×' + r.yields : '';
@@ -3246,13 +3513,13 @@
             else if (pct < 5) craftNote = BUY + '材料就好（' + CRAFT_DIM + '只省 ' + fmtGil(save) + ' 金・' + pct.toFixed(1) + '%，不划算）';
             else craftNote = CRAFT + '省 ' + fmtGil(save) + ' 金（' + pct.toFixed(1) + '%）' + (ui.matMode === 'auto' && r.craftedN ? '，已套用（' + r.craftedN + ' 項）' : '');
           } else if (r.costBuy == null && r.costAuto != null) craftNote = '有些材料市場上沒有人賣，只能' + CRAFT + '（成本 ' + fmtGil(r.costAuto) + ' 金）';
-          const trendColor = r.change >= 0 ? '#4ade80' : '#f87171';
+          const trendColor = r.change > 0 ? '#f87171' : (r.change < 0 ? '#4ade80' : 'var(--dim)'); // 全站一致：紅＝漲、綠＝跌
           const trendNote = r.P ? windowCoverageLabel(r.P) + '・漲跌 <span style="color:' + trendColor + '">' + (r.change >= 0 ? '+' : '') + r.change.toFixed(1) + '%</span>' : '成交筆數太少，沒有漲跌';
           const hasBreakdown = (CRAFT_RECIPES[r.rid].ingredients || []).length > 0;
           const expandBtn = hasBreakdown ? ' <button type="button" class="market-radar-expand" data-mk-radar-expand="' + r.rid + '" data-item="' + r.itemId + '">▸ 材料明細</button>' : '';
           const note = [yieldNote, craftNote, otherNote, trendNote].filter(Boolean).join('　·　');
           return '<tr data-mk-radar-item="' + r.itemId + '" class="market-hot-item" style="cursor:pointer"><td style="color:' + (r.profit >= 0 ? '#4ade80' : '#f87171') + '">' + (r.profit >= 0 ? '+' : '') + fmtGil(r.profit) + '金</td>' +
-            '<td style="color:' + (r.roi >= 0 ? '#4ade80' : '#f87171') + '">' + (r.roi >= 0 ? '+' : '') + r.roi.toFixed(0) + '%</td><td>' + fmtGil(r.cost) + '金</td><td>' + fmtGil(r.sell) + '金</td><td>' + r.vel.toFixed(1) + '/天</td>' +
+            '<td style="color:' + (r.roi >= 0 ? '#4ade80' : '#f87171') + '">' + (r.roi >= 0 ? '+' : '') + r.roi.toFixed(0) + '%</td><td>' + (r.refined ? '<span class="mk-ref ok" title="依配方數量逐件吃掛單精算">✓</span>' : (ui.buyBasis === 'listing' && ui.matMode === 'buy' ? '<span class="mk-ref" title="用最低價估算">≈</span>' : '')) + fmtGil(r.cost) + '金</td><td>' + (r.warnLow ? '<i class="ph ph-warning mk-warn" title="最低掛單價遠低於成交均價"></i>' : '') + fmtGil(r.sell) + '金</td><td>' + r.vel.toFixed(1) + '/天</td>' +
             '<td>' + (ITEM_NAMES_TW_ALL[r.itemId] || r.itemId) + expandBtn + '<div class="craft-muted" style="font-size:10px">' + note + '</div></td></tr>' +
             '<tr class="market-radar-detail-row" data-mk-radar-detail="' + r.rid + '" style="display:none"><td colspan="6"></td></tr>';
         }).join('') + '</tbody></table></div>' +
@@ -3260,29 +3527,29 @@
       bindMoreInfoToggles(body);
       body.querySelectorAll('[data-mk-radar-item]').forEach(function (tr) { tr.addEventListener('click', function () { openItemDetail(tr.dataset.mkRadarItem); }); });
       // 展開明細：先用手上的資料畫出來；如果有材料沒有價格（預先計算資料沒收錄），再去查即時掛單價補上、重畫一次
-      function currentDcView() { return ui.basis === 'listing' ? patchData(pc.dc, liveDc) : pc.dc; }
+      function currentDcView() { return ui.buyBasis === 'listing' ? patchData(pc.buy, liveBuy) : pc.buy; }
       async function fillBreakdown(td, itemId, depth, allowFetch) {
-        const bd = materialBreakdown(itemId, currentDcView(), ui.basis);
+        const bd = materialBreakdown(itemId, currentDcView(), ui.buyBasis);
         td.innerHTML = renderBreakdownHtml(bd, depth);
-        if (!allowFetch || !bd || ui.basis !== 'listing') return;
+        if (!allowFetch || !bd || ui.buyBasis !== 'listing') return;
         const need = [];
         bd.rows.forEach(function (r) {
           if (r.buy == null) need.push(r.itemId);
           (r.missing || []).forEach(function (id) { need.push(id); });
         });
-        const ids = need.filter(function (id, i) { return need.indexOf(id) === i && !liveFresh(liveDc, id) && !liveTried[id]; });
+        const ids = need.filter(function (id, i) { return need.indexOf(id) === i && !liveFresh(liveBuy, id) && !liveTried[id]; });
         if (!ids.length) return;
         ids.forEach(function (id) { liveTried[id] = true; });
         const st = MarketData.getSettings();
         let res = {};
-        try { res = await MarketData.fetchListingsBatchForScope(ids, st.dcName); } catch (e) { return; }
+        try { res = await MarketData.fetchListingsBatchForScope(ids, ui.buyScope === 'world' ? st.worldName : st.dcName); } catch (e) { return; }
         let got = 0;
         ids.forEach(function (id) {
           const ls = res[id];
           if (!ls || !ls.length) return; // 查不到或真的沒有掛單：不覆蓋任何資料
           got++;
           const first = function (f) { const x = ls.find(f); return x ? x.pricePerUnit : null; };
-          liveDc[id] = { min: ls[0].pricePerUnit, minN: first(function (l) { return !l.hq; }), minH: first(function (l) { return l.hq; }), time: Date.now() };
+          liveBuy[id] = { min: ls[0].pricePerUnit, minN: first(function (l) { return !l.hq; }), minH: first(function (l) { return l.hq; }), time: Date.now() };
         });
         if (got && td.isConnected) await fillBreakdown(td, itemId, depth, false);
       }
@@ -3342,26 +3609,23 @@
       if (ui.job === null) return;
       const body = $('mk-radar-body');
       const st = MarketData.getSettings();
-      if (ui.sellScope === 'world' && !st.worldName) {
-        ui.mode = 'pre'; sync();
-        body.innerHTML = '<p class="craft-muted">「我的世界」範圍需要先設定「我的世界」，點右上角設定後再試；也可以把上面的「成品範圍」切成「所有世界」。</p>';
-        return;
-      }
+      syncPrefs();
       if (typeof CRAFT_RECIPES === 'undefined') { body.innerHTML = '<p class="craft-muted">讀取配方資料中⋯</p>'; await ensureCraftDataLoaded(); }
       if (typeof CRAFT_RECIPES === 'undefined') { body.innerHTML = '<p class="craft-muted">配方資料載入失敗，請重新整理頁面再試。</p>'; return; }
       body.innerHTML = '<p class="craft-muted">讀取市場資料中⋯</p>';
-      const myJob = ui.job, myScope = ui.sellScope;
-      const sellKey = myScope === 'world' ? st.worldName : 'ALL';
-      const rs = await Promise.all([MarketData.loadPrecomputed('ALL'), sellKey === 'ALL' ? null : MarketData.loadPrecomputed(sellKey)]);
-      if (myJob !== ui.job || myScope !== ui.sellScope) return;
-      const dcR = rs[0], sellR = rs[1] || rs[0];
-      if (dcR.state === 'ok' && sellR.state === 'ok') {
-        pc = { dc: dcR.data, sell: sellR.data, meta: dcR.meta, ageMs: Math.max(dcR.ageMs, sellR.ageMs) };
+      const myJob = ui.job, myKey = ui.buyScope + ui.sellScope;
+      const buyKey = ui.buyScope === 'world' ? st.worldName : 'ALL', sellKey = ui.sellScope === 'world' ? st.worldName : 'ALL';
+      const rs = await Promise.all([MarketData.loadPrecomputed(buyKey), sellKey === buyKey ? null : MarketData.loadPrecomputed(sellKey)]);
+      if (myJob !== ui.job || myKey !== ui.buyScope + ui.sellScope) return;
+      const buyR = rs[0], sellR = rs[1] || rs[0];
+      if (ui.sellTaxRate == null && st.worldName) { MarketData.getSellTaxInfo(st.worldName).then(function (t) { if (t && t.ratePercent != null) { ui.sellTaxRate = t.ratePercent / 100; if (ui.tax && pc && ui.mode === 'pre') renderPre(); } }).catch(function () { /* 查不到就用 5% */ }); }
+      if (buyR.state === 'ok' && sellR.state === 'ok') {
+        pc = { buy: buyR.data, sell: sellR.data, meta: buyR.meta, ageMs: Math.max(buyR.ageMs, sellR.ageMs) };
         ui.mode = 'pre'; sync(); renderPre(); return;
       }
-      if (dcR.state === 'none') { goLive('⚠ 這個網站還沒有產生過預先計算的市場資料，暫時使用舊的即時掃描。'); return; }
+      if (buyR.state === 'none') { goLive('⚠ 這個網站還沒有產生過預先計算的市場資料，暫時使用舊的即時掃描。'); return; }
       ui.mode = 'pre'; sync();
-      setStatus('⚠ 暫時讀不到預先計算的市場資料。 <button type="button" class="market-history-btn" id="mk-radar-retry">重試</button> <button type="button" class="market-history-btn" id="mk-radar-to-live2">改用即時掃描（僅供參考）</button>');
+      setStatus('⚠ 暫時讀不到預先計算的市場資料。 <button type="button" class="market-history-btn" id="mk-radar-retry"><i class="ph ph-arrow-clockwise"></i> 重試</button> <button type="button" class="market-history-btn" id="mk-radar-to-live2">改用即時掃描（僅供參考）</button>');
       $('mk-radar-filters').style.display = '';
       body.innerHTML = '<p class="craft-muted">讀取失敗。</p>';
       $('mk-radar-retry').addEventListener('click', show);
@@ -3373,11 +3637,17 @@
       const fb = e.target.closest('[data-rk]');
       if (fb) {
         const v = fb.dataset.rv; ui[fb.dataset.rk] = v; ui.shown = 50; liveRounds = 0; sync();
-        if (fb.dataset.rk === 'sellScope') show(); else if (pc && ui.mode === 'pre') renderPre();
+        if (pc && ui.mode === 'pre') renderPre();
       }
     });
     $('mk-radar-median').addEventListener('change', function () { ui.medianOnly = this.checked; ui.shown = 50; liveRounds = 0; if (pc && ui.mode === 'pre') renderPre(); });
     $('mk-radar-profit').addEventListener('change', function () { ui.profitOnly = this.checked; ui.shown = 50; liveRounds = 0; if (pc && ui.mode === 'pre') renderPre(); });
+    $('mk-radar-tax').addEventListener('change', function () { ui.tax = this.checked; ui.shown = 50; if (pc && ui.mode === 'pre') renderPre(); });
+    MarketData.onPricePrefsChange(function () { // 全站共用的取價設定改了（不管是在這裡還是別頁改的）：清掉即時價、重算
+      if (!box.isConnected) return;
+      liveBuy = {}; liveSell = {}; syncPrefs(); ui.shown = 50; liveRounds = 0;
+      if (ui.job !== null && ui.mode === 'pre') show();
+    });
     // 設定（我的世界等）一改，畫面要重算
     radarRefreshHook = function () { if (ui.job !== null) { if (ui.mode === 'live') runRadarScan(ui.job, true); else show(); } };
   }
@@ -3688,9 +3958,8 @@
   ];
   /* 代幣兌換的價格基準：所有世界（預設，整個資料中心）／我的世界。記在本機。
    * 「哪些代幣算沒有可比價、要隱藏」固定用所有世界的掛單價判斷，不跟著切換，這樣切換基準時清單不會忽多忽少。 */
-  const TOKEN_SCOPE_KEY = 'ff14fc-token-scope';
-  let tokenScope = (function () { try { return localStorage.getItem(TOKEN_SCOPE_KEY) === 'world' ? 'world' : 'all'; } catch (e) { return 'all'; } })();
-  function tokenScopeEff() { const st = MarketData.getSettings(); return (tokenScope === 'world' && st.worldName) ? 'world' : 'all'; }
+  // 代幣換到的東西是拿去賣的：範圍與基準都用全站共用設定的「賣出」那一邊
+  function tokenScopeEff() { return MarketData.getPricePrefs().sellScope === 'world' ? 'world' : 'all'; }
   async function getTokenData() {
     if (tokenScopeEff() === 'world') {
       try {
@@ -3699,7 +3968,11 @@
       } catch (e) { /* 讀不到就回傳null，呼叫端自行處理 */ }
       return null;
     }
-    return getPrecomputedAllData();
+    try { // 「所有世界」固定讀 ALL，不受供應鏈的買入範圍影響
+      const r = await MarketData.loadPrecomputed('ALL');
+      if (r.state === 'ok' && r.ageMs <= 24 * 3600 * 1000) return r.data;
+    } catch (e) { /* 讀不到就回傳null */ }
+    return null;
   }
   let tokenCatSel = 'all'; // 目前選的分類，重畫、切換分頁回來都維持
   let tokenShowHidden = false;
@@ -3770,10 +4043,7 @@
       '</div>';
     }
     function renderScope() {
-      const world = MarketData.getSettings().worldName, eff = tokenScopeEff();
-      $('mk-token-scope').innerHTML = '<span class="mts-label">價格</span>' +
-        '<button type="button" class="craft-job-filter-btn' + (eff === 'all' ? ' active' : '') + '" data-tscope="all">所有世界</button>' +
-        '<button type="button" class="craft-job-filter-btn' + (eff === 'world' ? ' active' : '') + '" data-tscope="world"' + (world ? '' : ' disabled title="請先在上方「設定」選擇我的世界"') + '>' + (world || '我的世界') + '</button>';
+      $('mk-token-scope').innerHTML = MarketData.pricePrefsBarHtml(['sell']);
     }
     function renderCats() {
       $('mk-token-cats').innerHTML =
@@ -3828,11 +4098,8 @@
       });
     }
     renderScope(); renderCats(); renderList(); renderHideBar();
-    pane.addEventListener('click', function (e) { // 價格基準切換：已展開的排行立刻重算，沒展開的下次點開時再算
-      const b = e.target.closest('[data-tscope]');
-      if (!b || b.disabled) return;
-      tokenScope = b.dataset.tscope;
-      try { localStorage.setItem(TOKEN_SCOPE_KEY, tokenScope); } catch (e2) { /* 存不了就算了 */ }
+    MarketData.onPricePrefsChange(function () { // 全站取價設定改了：已展開的排行立刻重算，沒展開的下次點開時再算
+      if (!pane.isConnected) return;
       renderScope();
       pane.querySelectorAll('.market-token-body').forEach(function (body) {
         const open = body.style.display !== 'none' && body.dataset.tokenId;
@@ -3896,7 +4163,7 @@
       }
       const sortKey = body.dataset.sort || 'net';
       const SHOW = 20;
-      const all = buildCurrencyBestUses(id, dcData, settings.materialsBasis, 99999, sortKey);
+      const all = buildCurrencyBestUses(id, dcData, MarketData.getPricePrefs().sellBasis, 99999, sortKey);
       const best = all.slice(0, SHOW);
       const totalTrades = Number(body.dataset.count) || 0;
       if (!best.length) {
@@ -3964,19 +4231,41 @@
           '<button type="button" class="craft-job-filter-btn active" data-mk-hot-scope="ALL">所有世界</button>' +
           worldNames.map(function (w) { return '<button type="button" class="craft-job-filter-btn" data-mk-hot-scope="' + w + '">' + w + '</button>'; }).join('') +
         '</div>' +
+        '<button type="button" class="market-fold-btn" id="mk-hot-fold-btn" aria-expanded="false"><i class="ph ph-funnel"></i><span class="market-fold-sum" id="mk-hot-fold-sum"></span><i class="ph ph-caret-down market-fold-caret"></i></button>' +
+        '<div id="mk-hot-fold" style="display:none">' +
         '<p class="craft-muted market-hot-scope-note"><strong>提醒：</strong>只能在自己的世界掛賣，「所有世界」僅供參考。</p>' +
         btnRow('指標', 'metric', 'mk-hf-metric') +
         '<div id="mk-hot-filters">' +
           btnRow('視角', 'persp', 'mk-hf-persp') + btnRow('成交頻率', 'freq', 'mk-hf-freq') + btnRow('方向', 'dir', 'mk-hf-dir') + btnRow('價格帶', 'band', 'mk-hf-band') +
           '<label class="market-hot-median" id="mk-hot-median-label"><input type="checkbox" id="mk-hot-median"> 只看賣速在「同價格帶」中位數以上的道具（成交冷清的先排除）</label>' +
         '</div>' +
+        '</div>' +
         '<p class="craft-muted market-hot-status" id="mk-hot-status"></p>' +
       '</div>' +
       '<div id="mk-hot-body" class="market-pane-scrollbody"><p class="craft-muted">讀取市場資料中⋯</p></div>';
     fitMarketHeights();
 
+    // 篩選區收合：收起時只留一條「目前選了什麼」的摘要（沿用按鈕上的短字），清單才有空間；選擇會記住
+    const HOT_FOLD_KEY = 'ff14fc-hot-fold';
+    function hotFoldSummary() {
+      return ['metric', 'persp', 'freq', 'dir', 'band'].map(function (k) {
+        const b = box.querySelector('[data-hk="' + k + '"].active'); const row = b && b.closest('.market-hot-row-filter');
+        const t = b && (!row || row.style.display !== 'none') && b.dataset.hv !== 'all' ? b.textContent : '';
+        return t && k === 'freq' ? '頻率' + t : t; // 「較高」單獨出現看不出是什麼，加上「頻率」
+      }).filter(Boolean).join('・');
+    }
+    function setHotFold(open) {
+      $('mk-hot-fold').style.display = open ? '' : 'none';
+      $('mk-hot-fold-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
+      $('mk-hot-fold-btn').classList.toggle('open', open);
+      try { localStorage.setItem(HOT_FOLD_KEY, open ? 'open' : 'closed'); } catch (e) { /* 存不了就只對這次有效 */ }
+      fitMarketHeights();
+    }
+    $('mk-hot-fold-btn').addEventListener('click', function () { setHotFold($('mk-hot-fold').style.display === 'none'); });
+    try { if (localStorage.getItem(HOT_FOLD_KEY) === 'open') setHotFold(true); } catch (e) { /* 預設收起 */ }
     function syncButtons() {
       box.querySelectorAll('[data-hk]').forEach(function (b) { b.classList.toggle('active', ui[b.dataset.hk] === b.dataset.hv); });
+      $('mk-hot-fold-sum').textContent = hotFoldSummary();
       box.querySelectorAll('[data-mk-hot-scope]').forEach(function (b) { b.classList.toggle('active', b.dataset.mkHotScope === ui.scope); });
       const pre = ui.mode === 'pre';
       $('mk-hot-filters').style.display = pre ? '' : 'none';
@@ -4036,7 +4325,7 @@
           top.map(function (e, i) {
             const v = e.value;
             const barPct = Math.max(4, Math.round((Math.log(Math.abs(v) + 1) / Math.log(maxVal + 1)) * 100));
-            const barColor = v >= 0 ? '#c5a059' : '#f87171';
+            const barColor = ui.metric === 'changePct' ? (v > 0 ? '#f87171' : (v < 0 ? '#4ade80' : '#c5a059')) : '#c5a059'; // 漲跌幅度：紅＝漲、綠＝跌（全站一致）；賣速等指標不是價格方向，維持金色
             // 第1、2點：賣速、每日成交額這兩個指標，本來就有算好的價格漲跌（跟「漲跌幅度」指標是同一套算法），
             // 只是原本沒有拿出來顯示；這裡不管選哪個指標，只要有P資料，都順便把價格漲跌標出來，方便對照。
             function priceChangeTxt(P) {
@@ -4272,7 +4561,7 @@
       const down = withValue.filter(function (r) { return r.stats.changePct < -0.05; }).length;
       const flat = withValue.length - up - down;
       const skipped = rows.length - withValue.length;
-      summaryLine = '<p class="craft-muted" style="margin-bottom:8px">共 ' + withValue.length + ' 項可判斷：<span style="color:#c5a059">漲 ' + up + '</span>／<span style="color:#f87171">跌 ' + down + '</span>／平 ' + flat +
+      summaryLine = '<p class="craft-muted" style="margin-bottom:8px">共 ' + withValue.length + ' 項可判斷：<span style="color:#f87171">漲 ' + up + '</span>／<span style="color:#4ade80">跌 ' + down + '</span>／平 ' + flat +
         (skipped > 0 ? '（另有 ' + skipped + ' 項成交筆數不足，未列入）' : '') + '</p>';
     }
     const notes = [];
@@ -4290,7 +4579,7 @@
           const v = r.stats[metricKey];
           // 數值跨好幾個數量級時用對數比例，才分得出差異
           const barPct = Math.max(4, Math.round((Math.log(Math.abs(v) + 1) / Math.log(maxVal + 1)) * 100));
-          const barColor = v >= 0 ? '#c5a059' : '#f87171';
+          const barColor = ui.metric === 'changePct' ? (v > 0 ? '#f87171' : (v < 0 ? '#4ade80' : '#c5a059')) : '#c5a059'; // 漲跌幅度：紅＝漲、綠＝跌（全站一致）；賣速等指標不是價格方向，維持金色
           let subLine = '';
           if (metricKey === 'velocity' && (r.stats.nqVelocity != null || r.stats.hqVelocity != null)) {
             subLine = '<span class="market-hot-sub">NQ ' + (r.stats.nqVelocity || 0).toFixed(1) + '　HQ ' + (r.stats.hqVelocity || 0).toFixed(1) + '</span>';
