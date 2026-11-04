--- a/js/craft-panel.js	2026-11-04 19:19:12.721509260 +0000
+++ b/js/craft-panel.js	2026-11-04 19:19:12.723098371 +0000
@@ -1002,22 +1002,7 @@
 
   /* ── 成交均價：跟市場頁「均價比較」同一套算法（一次抓30天成交紀錄，當前／近1天／3天／7天／30天都在本地切、已排除異常成交）。
    * 以我的世界為範圍；沒設定世界就看整個資料中心。同一個物品同一個範圍只抓一次，統計列跟彈窗共用。 ── */
-  const avgWindowsCache = {};
-  function fetchAvgWindows(itemId, scopeWorld) {
-    const key = (scopeWorld || 'DC') + '|' + itemId;
-    if (avgWindowsCache[key]) return avgWindowsCache[key];
-    avgWindowsCache[key] = MarketData.fetchFullHistory(itemId, 30, scopeWorld || undefined).then(function (full) {
-      const now = Date.now() / 1000;
-      const inRange = function (a, b) { return full.filter(function (h) { return h.timestamp >= now - b * 3600 && h.timestamp < now - a * 3600; }); };
-      const within = function (d) { return full.filter(function (h) { return h.timestamp >= now - d * 86400; }); };
-      const avgOf = function (list) {
-        const clean = MarketData.excludeOutlierEntries(list, function (h) { return h.pricePerUnit; });
-        return clean.length ? Math.round(clean.reduce(function (t, h) { return t + h.pricePerUnit; }, 0) / clean.length) : null;
-      };
-      return { current: avgOf(inRange(0, 24)), d1: avgOf(inRange(0, 48)), d3: avgOf(within(3)), d7: avgOf(within(7)), d30: avgOf(within(30)) };
-    }).catch(function () { delete avgWindowsCache[key]; return null; });
-    return avgWindowsCache[key];
-  }
+  function fetchAvgWindows(itemId, scopeWorld) { return MarketData.getAvgWindows(itemId, scopeWorld); } // 共用資料層那一份（件數加權、已排除異常成交）
   function loadAvgTile(recipe, scopeWorld, overview) {
     const tile = $('cf-avg-tile'); if (!tile) return;
     const val = tile.querySelector('.cst-val'), label = tile.querySelector('.cst-label');
@@ -1039,12 +1024,8 @@
     positionPopoverNear(pop, btn);
     const w = await fetchAvgWindows(itemId, scope);
     if (!w) { pop.innerHTML = '<p class="mav-title">' + title + '</p><p class="craft-muted" style="font-size:11px;margin:0">讀取失敗，請稍後再試。</p>'; positionPopoverNear(pop, btn); return; }
-    const rows = [['當前', w.current, '最近24小時內的成交均價'], ['近1天', w.d1, '最近48小時內（當天＋昨天）的成交均價'], ['近3天', w.d3, '過去3天所有成交的平均'], ['近7天', w.d7, '過去7天所有成交的平均'], ['近30天', w.d30, '過去30天所有成交的平均']];
-    const maxV = Math.max.apply(null, rows.map(function (r) { return r[1] || 0; })) || 1;
-    pop.innerHTML = '<p class="mav-title">' + title + '<span class="mav-help" title="都是實際成交的平均，已排除異常成交。「掛單」是現在架上還沒賣掉的掛單價格平均，不是成交價。">？</span></p>' +
-      rows.map(function (r, i) {
-        return '<div class="mav-row' + (i === 0 ? ' is-now' : '') + '" title="' + r[2] + '"><span class="mav-l">' + r[0] + '</span><span class="mav-bar"><i style="width:' + (r[1] != null ? Math.max(4, r[1] / maxV * 100).toFixed(0) : 0) + '%"></i></span><strong>' + (r[1] != null ? r[1].toLocaleString() : '—') + '</strong><small>金</small></div>';
-      }).join('') + '<div class="mav-row mav-listing" id="cf-avg-listing" title="現在架上還沒賣掉的掛單價格平均，不是成交價"><span class="mav-l">掛單</span><span class="mav-bar"></span><strong>⋯</strong><small>金</small></div>';
+    pop.innerHTML = '<p class="mav-title">' + title + '<span class="mav-help" title="都是實際成交的平均，已排除異常成交。「掛單」是現在架上還沒賣掉的掛單價格平均，不是成交價。">？</span></p>' + MarketData.avgWindowRowsHtml(w) +
+      '<div class="mav-row mav-listing" id="cf-avg-listing" title="現在架上還沒賣掉的掛單價格平均，不是成交價"><span class="mav-l">掛單</span><span class="mav-bar"></span><strong>⋯</strong><small>金</small><em class="mav-chg"></em></div>';
     positionPopoverNear(pop, btn);
     try {
       const ov = await MarketData.getItemMarketOverview(itemId);
@@ -1986,10 +1967,8 @@
   /* 價格列的基準：「我的世界」或「所有世界（整個資料中心）」，記在瀏覽器裡，沒設定世界時只能看所有世界 */
   const PROFIT_SCOPE_KEY = 'cf-profit-scope';
   let profitScopeWorld = ''; // 目前價格列基準的世界名稱（空字串＝整個資料中心），成交均價彈窗跟著用同一個
-  function getProfitScope(settings) {
-    if (!settings.worldName) return 'dc';
-    let v = null; try { v = localStorage.getItem(PROFIT_SCOPE_KEY); } catch (e) { /* 存取不到就用預設 */ }
-    return v === 'dc' ? 'dc' : 'world';
+  function getProfitScope(settings) { // 賣出範圍＝全站共用的取價設定（沒設定我的世界時自動是所有世界）
+    return (settings.worldName && MarketData.getPricePrefs().sellScope === 'world') ? 'world' : 'dc';
   }
   function fillProfitReference(recipe) {
     lastSelectedRecipeForProfit = recipe; // 記住目前顯示的是哪個配方，市場設定一改（世界/城市）才能立刻重算
@@ -2003,7 +1982,8 @@
 
     const needMap = {};
     (recipe.ingredients || []).forEach(function (ing) { needMap[ing.itemId] = ing.amount; });
-    const costPromise = Object.keys(needMap).length ? MarketData.resolveBuyCosts(needMap) : Promise.resolve({});
+    const pf = MarketData.getPricePrefs();
+    const costPromise = Object.keys(needMap).length ? MarketData.resolveBuyCostsByPrefs(needMap) : Promise.resolve({}); // 材料成本依全站「買入」取價設定（範圍＋基準）
     const sellPromise = (scope === 'world' && settings.worldName) ? MarketData.getSellPrice(recipe.itemId) : Promise.resolve(null);
     const taxPromise = settings.worldName ? MarketData.getSellTaxInfo(settings.worldName) : Promise.resolve(null);
     // 銷售速度只需要資料中心（不用等玩家選好世界），有世界時函式內部會自動改用更精準的世界範圍
@@ -2013,8 +1993,10 @@
     // 沒設定我的世界時，在售最低改看整個資料中心（跟市場頁預設的範圍一樣）
     const overviewPromise = MarketData.getItemMarketOverview(recipe.itemId).catch(function () { return null; });
 
-    Promise.all([costPromise, sellPromise, taxPromise, velocityPromise, overviewPromise]).then(function (out) {
-      const costResults = out[0], sellRef = out[1], taxInfo = out[2], velocity = out[3], overview = out[4];
+    // 賣出基準選「均價」時，賣出參考價用成交均價（當前＝24小時）；查不到均價就退回最低掛單價
+    const avgPromise = pf.sellBasis === 'avg' ? fetchAvgWindows(recipe.itemId, scope === 'world' ? settings.worldName : undefined).catch(function () { return null; }) : Promise.resolve(null);
+    Promise.all([costPromise, sellPromise, taxPromise, velocityPromise, overviewPromise, avgPromise]).then(function (out) {
+      const costResults = out[0], sellRef = out[1], taxInfo = out[2], velocity = out[3], overview = out[4], avgW = out[5];
       // materialCost 已經是含買方稅的實際花費（resolveBuyCosts/greedyFill算出來的totalCost本身就含稅）
       let materialCost = 0, unresolvedCount = 0;
       Object.keys(costResults).forEach(function (id) {
@@ -2033,14 +2015,15 @@
       tiles.push({ label: '成交均價<i class="ph ph-caret-down"></i>', value: '計算中⋯', title: '近24小時實際成交均價・點擊看不同天數的均價比較', attrs: ' id="cf-avg-tile" data-avg-toggle="' + recipe.itemId + '" role="button" tabindex="0"', cls: 'cst-btn' });
       if (unresolvedCount) chips.push({ cls: 'warn', icon: 'ph-warning', text: unresolvedCount + '項查無掛單', title: unresolvedCount + '項材料查無掛單，未計入成本' });
       // 所有世界模式：假設在資料中心裡最便宜的那個價格賣出（稅率仍用「我的世界」的）；沒設定世界就不知道稅率，不算淨利
-      const netRef = scope === 'world' ? sellRef : ((settings.worldName && overview && overview.minPrice) ? { price: overview.minPrice } : null);
+      const avgRef = (avgW && avgW.current) ? { price: avgW.current } : null; // 賣出基準＝均價時的參考價
+      const netRef = avgRef || (scope === 'world' ? sellRef : ((settings.worldName && overview && overview.minPrice) ? { price: overview.minPrice } : null));
       if (netRef) {
         // 賣方稅依退休所在城市而不同，這裡假設玩家會把退休放在「目前稅率最低」的城市（理性賣家的作法），
         // 抓不到稅率資料時退回不扣稅並註明；主要顯示稅後實拿金額，原始掛單價可以點旁邊的世界資訊icon查。
         const rate = taxInfo ? taxInfo.ratePercent : 0;
         const netSell = netRef.price * (1 - rate / 100);
         const profit = netSell - materialCost;
-        tiles.push({ label: (scope === 'world' ? settings.worldName : '最低價') + '賣出', value: Math.round(netSell).toLocaleString(), unit: '金',
+        tiles.push({ label: avgRef ? '均價賣出' : ((scope === 'world' ? settings.worldName : '最低價') + '賣出'), value: Math.round(netSell).toLocaleString(), unit: '金',
           title: (taxInfo ? '稅後實拿（已扣' + (Math.round(taxInfo.ratePercent * 10) / 10) + '%賣方稅）' : '稅率查詢失敗，此數字未扣賣方稅') + (scope === 'dc' ? '・以整個資料中心最便宜的掛單價計算' : ''),
           extra: scope === 'world' ? ' <button type="button" class="craft-mat-worlds-icon" data-selldepth-toggle="' + recipe.itemId + '" title="看看這個世界目前有多少人在賣、賣多少錢"><i class="ph ph-info"></i></button>' : '' });
         tiles.push({ label: '預估淨利／件', value: (profit >= 0 ? '+' : '') + Math.round(profit).toLocaleString(), unit: '金', color: profit >= 0 ? '#4ade80' : '#f87171', cls: profit >= 0 ? 'good' : 'bad', title: '僅單件製作，不含製作時間成本' });
@@ -2059,12 +2042,9 @@
         chips.push({ icon: 'ph-snowflake', text: '近4天無成交', title: '近4天查無成交紀錄，可能較冷門' });
       }
       mountCraftStat(el, tiles, chips);
-      // 價格基準快速切換：我的世界／所有世界，一鍵比較；沒設定世界時沒有「我的世界」可選，就不顯示
-      if (settings.worldName) {
-        el.insertAdjacentHTML('afterbegin', '<div class="cw-scope" role="group" aria-label="價格基準"><span class="cw-scope-label"><i class="ph ph-scales"></i>價格基準</span>' +
-          '<button type="button" class="cw-scope-btn' + (scope === 'world' ? ' on' : '') + '" data-profit-scope="world">' + escapeHtml(settings.worldName) + '</button>' +
-          '<button type="button" class="cw-scope-btn' + (scope === 'dc' ? ' on' : '') + '" data-profit-scope="dc">所有世界</button></div>');
-      }
+      // 取價切換（全站共用）：買入／賣出各自的範圍與基準；改了會連材料成本、賣出參考一起重算
+      MarketData.bindPricePrefsBars();
+      el.insertAdjacentHTML('afterbegin', '<div class="cw-scope" role="group">' + MarketData.pricePrefsBarHtml(['buy', 'sell']) + '</div>');
       bindSellDepthPopover();
       bindAvgPopover();
       loadAvgTile(recipe, profitScopeWorld, overview);
@@ -3603,12 +3583,8 @@
     $('cf-actor').addEventListener('click', function () { setTimeout(renderDockSummary, 0); });
     renderDockSummary();
   })();
-  /* 價格基準切換（我的世界／所有世界） */
-  $('cf-recipe-selected').addEventListener('click', function (e) {
-    const b = e.target.closest('[data-profit-scope]'); if (!b) return;
-    try { localStorage.setItem(PROFIT_SCOPE_KEY, b.dataset.profitScope); } catch (err) { /* 存不了就只對這次有效 */ }
-    if (lastSelectedRecipeForProfit) fillProfitReference(lastSelectedRecipeForProfit);
-  });
+  /* 全站取價設定改了（在這裡或其他頁）：目前選的配方的材料成本、賣出參考立刻重算 */
+  if (typeof MarketData !== 'undefined') MarketData.onPricePrefsChange(function () { if (lastSelectedRecipeForProfit) fillProfitReference(lastSelectedRecipeForProfit); });
   /* 已選配方那一條上的「更換配方」：展開列表（沿用上次的搜尋條件），選了之後會再自動收起 */
   $('cf-recipe-selected').addEventListener('click', function (e) {
     if (!e.target.closest('#cf-change-recipe')) return;
