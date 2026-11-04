--- a/js/market-data.js	2026-11-04 19:19:12.778578512 +0000
+++ b/js/market-data.js	2026-11-04 19:19:12.780603771 +0000
@@ -107,8 +107,14 @@
   let dcList = null; // [{name, worlds:[worldId,...], region}]
   const META_CACHE_KEY = 'craftMarketMeta:v1';
 
+  let metaPromise = null; // 同時多處呼叫 ensureMeta 時共用同一個請求，不重複打
   async function ensureMeta() {
     if (worldList && dcList) return;
+    if (!metaPromise) metaPromise = loadMeta().finally(function () { metaPromise = null; });
+    return metaPromise;
+  }
+  async function loadMeta() {
+    if (worldList && dcList) return;
     try {
       const raw = localStorage.getItem(META_CACHE_KEY);
       if (raw) {
@@ -120,9 +126,10 @@
     } catch (e) { /* 忽略壞掉的快取 */ }
     if (worldList && dcList) return;
     const [w, d] = await Promise.all([
-      fetch(API + '/worlds').then(function (r) { return r.json(); }),
-      fetch(API + '/data-centers').then(function (r) { return r.json(); }),
+      fetchJsonRetry(API + '/worlds'),   // 失敗會重試；回來的不是正常資料就丟錯，不會把錯誤頁當成世界清單存起來
+      fetchJsonRetry(API + '/data-centers'),
     ]);
+    if (!Array.isArray(w) || !Array.isArray(d)) throw new Error('世界／資料中心清單格式異常');
     worldList = w; dcList = d;
     try { localStorage.setItem(META_CACHE_KEY, JSON.stringify({ time: Date.now(), worldList: w, dcList: d })); } catch (e) { /* 忽略 */ }
   }
@@ -196,13 +203,14 @@
     }
     let all = [];
     let entriesUntil = null;
+    let truncated = false; // 翻頁途中失敗＝手上的資料沒涵蓋到 maxDays，這種結果不能存進快取
     const MAX_PAGES = 8; // 安全上限，避免單一物品成交紀錄多到無限翻頁
     for (let page = 0; page < MAX_PAGES; page++) {
       let url = API + '/history/' + encodeURIComponent(region) + '/' + itemId + '?entriesToReturn=1800';
       if (entriesUntil != null) url += '&entriesUntil=' + entriesUntil;
       let data;
       try { data = await fetchJsonRetry(url); }
-      catch (e) { if (page === 0) throw e; break; } // 第一頁就失敗要讓畫面知道；翻頁途中失敗就用已抓到的
+      catch (e) { if (page === 0) throw e; truncated = true; break; } // 第一頁就失敗要讓畫面知道；翻頁途中失敗就用已抓到的（但不存快取）
       const entries = ((data && data.entries) || []).map(function (e) {
         return { pricePerUnit: e.pricePerUnit, quantity: e.quantity, hq: !!e.hq, timestamp: e.timestamp, world: e.worldName || null };
       });
@@ -217,7 +225,7 @@
       if (entriesUntil != null && earliest >= entriesUntil) break; // 保險：翻頁沒有前進，停下來避免無限迴圈
       entriesUntil = earliest - 1;
     }
-    fullHistoryCache[cacheKey] = { time: Date.now(), days: maxDays, all: all };
+    if (!truncated) fullHistoryCache[cacheKey] = { time: Date.now(), days: maxDays, all: all };
     return all;
   }
 
@@ -260,7 +268,7 @@
     if (!sc) return { state: 'error' };
     if (!pcState.scopes[scopeKey] || pcState.scopeGen[scopeKey] !== meta.generatedAtMs) {
       const r = await pcGet(base + sc.file);
-      if (r.status !== 200) return { state: r.status === 404 ? 'error' : 'error' };
+      if (r.status !== 200) return { state: 'error' };
       pcState.scopes[scopeKey] = r.json; pcState.scopeGen[scopeKey] = meta.generatedAtMs;
     }
     return { state: 'ok', meta: meta, data: pcState.scopes[scopeKey], ageMs: Date.now() - meta.generatedAtMs };
@@ -466,16 +474,9 @@
       // 一定被正確解析，一旦解析失敗很可能連 listings 都被濾掉，寧可多拿一點欄位也不要冒資料被砍光的風險。
       const url = API + '/' + encodeURIComponent(settings.dcName) + '/' + chunk.join(',') + '?listings=50&entries=0';
       let data;
-      try {
-        const res = await throttledFetch(url);
-        data = await res.json();
-      } catch (e) {
-        // 第10點：偶爾有物品明明有掛單卻查不到價錢，很可能是這批請求暫時性失敗，先自動重試一次
-        try {
-          const res2 = await throttledFetch(url);
-          data = await res2.json();
-        } catch (e2) { return; }
-      }
+      // 以前直接 res.json()，遇到限流（429）回來的不是正常資料，卻會被當成「這批物品都沒有掛單」；
+      // 現在統一走 fetchJsonRetry（看狀態碼、暫時性錯誤會等一下再試），最後還是失敗才放棄這一批（不寫入快取）。
+      try { data = await fetchJsonRetry(url); } catch (e) { return; }
 
       // 關鍵：查單一itemId時，Universalis回傳的是「攤平的單一物件」，欄位是 itemID（大寫ID）；
       // 查多個itemId（逗號分隔）時，回傳的是 { itemIDs, items, dcName, unresolvedItems }，
@@ -550,6 +551,38 @@
     return out;
   }
 
+  /* 依全站共用的「買入」取價設定買一批材料（範圍＋基準）：
+   *   最低價＋所有世界＝原本的 resolveBuyCosts；最低價＋我的世界＝只看自己世界的掛單；
+   *   均價＝用預先計算快照的成交均價（24小時內，沒有就用長窗口均價）×數量，查不到均價的改用掛單。
+   * 回傳格式跟 greedyFill 一樣（totalCost 含買方稅5%、filledQty、avgPrice…），呼叫端不用改。 */
+  async function resolveBuyCostsByPrefs(needMap) {
+    const pf = getPricePrefs();
+    const useWorld = pf.buyScope === 'world' && settings.worldName;
+    if (pf.buyBasis === 'listing' && !useWorld) return resolveBuyCosts(needMap);
+    const ids = Object.keys(needMap).map(Number);
+    const out = {};
+    let missing = ids;
+    if (pf.buyBasis === 'avg') {
+      let snap = null;
+      try { snap = await loadPrecomputed(useWorld ? settings.worldName : 'ALL'); } catch (e) { snap = null; }
+      if (snap && snap.state === 'ok') {
+        missing = [];
+        ids.forEach(function (id) {
+          const row = snap.data.items[id], D = row && row[6], P = row && row[3];
+          const avg = D && D[0] > 0 ? D[1] : (P ? P[4] : null);
+          if (!avg) { missing.push(id); return; }
+          const q = needMap[id], cost = avg * q, tax = cost * BUY_TAX_RATE;
+          out[id] = { filledQty: q, totalCost: cost + tax, totalTax: tax, avgPrice: avg, breakdown: [], remainingListings: [], fromAverage: true };
+        });
+      }
+    }
+    if (missing.length) {
+      const lm = useWorld ? await fetchListingsBatchForScope(missing, settings.worldName) : await fetchListingsBatch(missing);
+      missing.forEach(function (id) { out[id] = greedyFill(lm[id] || [], needMap[id]); });
+    }
+    return out;
+  }
+
   /* 材料圖譜單顆節點只需要「單價參考」，quantity固定給1，本質上跟批量查是同一支函式，只是量小 */
   async function getUnitPriceRef(itemId) {
     const listingsMap = await fetchListingsBatch([Number(itemId)]);
@@ -582,10 +615,7 @@
       const chunk = need.slice(i, i + CHUNK);
       const url = API + '/' + encodeURIComponent(world) + '/' + chunk.join(',') + '?listings=20&entries=0';
       let data;
-      try {
-        const res = await throttledFetch(url);
-        data = await res.json();
-      } catch (e) { continue; } // 這批查詢失敗就跳過，不讓整個功能因為一批失敗而全部掛掉
+      try { data = await fetchJsonRetry(url); } catch (e) { continue; } // 這批查詢失敗（重試後）就跳過，不讓整個功能因為一批失敗而全部掛掉
 
       const list = chunk.length === 1
         ? (data && data.itemID != null ? [data] : [])
@@ -626,8 +656,7 @@
   async function fetchTaxRatesRaw(worldNameStr) {
     const hit = taxCache.get(worldNameStr);
     if (hit && Date.now() - hit.time < TAX_TTL_MS) return hit.list;
-    const res = await throttledFetch(API + '/tax-rates?world=' + encodeURIComponent(worldNameStr));
-    const data = await res.json();
+    const data = await fetchJsonRetry(API + '/tax-rates?world=' + encodeURIComponent(worldNameStr));
     const list = Object.keys(data || {}).map(function (k) {
       return { cityKey: k, cityName: cityDisplayName(k), percent: Number(data[k]) };
     }).filter(function (x) { return !isNaN(x.percent); });
@@ -644,11 +673,17 @@
   /* 排除異常成交（即時查詢這邊用的版本，規則必須跟 scripts/update-market-data.js 的 excludeOutliers 完全一致）：
    * 跟這批成交的中位數比，同時「差距超過 OUTLIER_MIN_DIFF 金」且「超過 OUTLIER_RATIO 倍」才排除。
    * 為什麼是這組數字、為什麼兩邊要一致，說明寫在 scripts/update-market-data.js 同名函式上方，這裡不重複。
-   * 少於3筆不判斷。傳入的是每一筆的 pricePerUnit 陣列。 */
+   * 少於2筆不判斷，剛好2筆用較便宜的那筆當基準。傳入的是每一筆的 pricePerUnit 陣列。 */
   const OUTLIER_RATIO = 10;      // ⚠️ 改這裡要同步改 scripts/update-market-data.js
   const OUTLIER_MIN_DIFF = 1000; // ⚠️ 改這裡要同步改 scripts/update-market-data.js
   function excludeOutlierEntries(entries, priceOf) {
-    if (!settings.excludeOutlierTrades || entries.length < 3) return entries;
+    if (!settings.excludeOutlierTrades || entries.length < 2) return entries;
+    if (entries.length === 2) { // 剛好2筆：跟 scripts/update-market-data.js 的 excludeOutliers 同一套——拿較便宜那筆當基準，另一筆同時符合差距與倍數門檻才排除
+      const a = priceOf(entries[0]), b = priceOf(entries[1]);
+      const lo = Math.min(a, b), hi = Math.max(a, b);
+      if (lo > 0 && hi - lo > OUTLIER_MIN_DIFF && hi / lo > OUTLIER_RATIO) return a <= b ? [entries[0]] : [entries[1]];
+      return entries;
+    }
     const prices = entries.map(priceOf).slice().sort(function (a, b) { return a - b; });
     const mid = Math.floor(prices.length / 2);
     const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
@@ -690,11 +725,12 @@
   async function getListingsForWorld(itemId, worldName) {
     await ensureMeta();
     const url = API + '/' + encodeURIComponent(worldName) + '/' + itemId + '?listings=100&entries=0';
-    const res = await throttledFetch(url);
-    const data = await res.json();
-    return (data.listings || []).map(function (l) {
+    const data = await fetchJsonRetry(url); // 失敗會丟錯，讓畫面能顯示「查詢失敗」而不是「沒有掛單」
+    const arr = (data.listings || []).map(function (l) {
       return { world: worldName, pricePerUnit: l.pricePerUnit, quantity: l.quantity, hq: !!l.hq, retainerName: l.retainerName };
     }).sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
+    arr.total = data.listingsCount != null ? data.listingsCount : arr.length; // 這個世界的掛單總數（表格只列最便宜的100筆）
+    return arr;
   }
 
   /* 某個世界自己的最近成交紀錄（「查看最近成交紀錄」選了特定世界時用）。
@@ -708,40 +744,51 @@
     }).sort(function (a, b) { return b.timestamp - a.timestamp; });
   }
 
-  async function getItemMarketOverview(itemId) {
+  /* 物品詳情頁用：查失敗會丟錯（畫面才分得出「查詢失敗，可重試」跟「真的沒有掛單」）。
+   * scopeName 不給＝整個資料中心；給世界名稱＝只查那個世界（均價彈窗選了世界時用）。
+   * 另外帶回：listingsCount（這個範圍目前總共有幾筆掛單，判斷手上這100筆是不是全部）、
+   * minPriceNQ／minPriceHQ（NQ、HQ 各自的最低價，兩種品質不要混在一起算）。 */
+  async function getItemMarketOverviewEx(itemId, scopeName) {
     await ensureMeta();
-    if (!settings.dcName) return null;
-    const url = API + '/' + encodeURIComponent(settings.dcName) + '/' + itemId + '?listings=100&entries=200';
-    try {
-      const res = await throttledFetch(url);
-      const data = await res.json();
-      const listings = (data.listings || []).map(function (l) {
-        return { world: l.worldName, pricePerUnit: l.pricePerUnit, quantity: l.quantity, hq: !!l.hq, retainerName: l.retainerName };
-      }).sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
-      const history = (data.recentHistory || []).map(function (h) {
-        return { world: h.worldName, pricePerUnit: h.pricePerUnit, quantity: h.quantity, hq: !!h.hq, buyerName: h.buyerName, timestamp: h.timestamp };
-      }).sort(function (a, b) { return b.timestamp - a.timestamp; });
-      // 各世界資料更新時間：API 給的 key 是世界ID，轉成世界名稱方便畫面直接用
-      const worldUploadTimes = {};
-      if (data.worldUploadTimes) Object.keys(data.worldUploadTimes).forEach(function (id) { worldUploadTimes[worldName(Number(id))] = data.worldUploadTimes[id]; });
-      return {
-        listings: listings,
-        history: history,
-        avgPrice: data.currentAveragePrice || null,
-        minPrice: data.minPrice || null,
-        maxPrice: data.maxPrice || null,
-        lastUploadTime: data.lastUploadTime || null, // 掛單資料的更新時間戳（毫秒），給「資料新鮮度」用
-        worldUploadTimes: worldUploadTimes,            // {世界名稱: 更新時間戳(毫秒)}，資料中心查詢時 Universalis 會一併回傳；沒給就是空物件
-      };
-    } catch (e) { return null; }
+    const scope = scopeName || settings.dcName;
+    if (!scope) return null;
+    const url = API + '/' + encodeURIComponent(scope) + '/' + itemId + '?listings=100&entries=200';
+    let data;
+    try { data = await fetchJsonRetry(url); }
+    catch (e) { if (/HTTP 404/.test(String(e && e.message))) return null; throw e; } // 404＝這個道具在市場上沒有資料（例如目前版本找不到的染劑）：交給畫面顯示原本的特例說明，不當成「查詢失敗」
+    const listings = (data.listings || []).map(function (l) {
+      return { world: l.worldName || (scopeName || null), pricePerUnit: l.pricePerUnit, quantity: l.quantity, hq: !!l.hq, retainerName: l.retainerName };
+    }).sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
+    const history = (data.recentHistory || []).map(function (h) {
+      return { world: h.worldName || (scopeName || null), pricePerUnit: h.pricePerUnit, quantity: h.quantity, hq: !!h.hq, buyerName: h.buyerName, timestamp: h.timestamp };
+    }).sort(function (a, b) { return b.timestamp - a.timestamp; });
+    // 各世界資料更新時間：API 給的 key 是世界ID，轉成世界名稱方便畫面直接用
+    const worldUploadTimes = {};
+    if (data.worldUploadTimes) Object.keys(data.worldUploadTimes).forEach(function (id) { worldUploadTimes[worldName(Number(id))] = data.worldUploadTimes[id]; });
+    listings.total = data.listingsCount != null ? data.listingsCount : listings.length; // 掛單總數（表格只列最便宜的100筆，標籤顯示總數）
+    return {
+      listings: listings,
+      listingsCount: data.listingsCount != null ? data.listingsCount : null,
+      history: history,
+      avgPrice: data.currentAveragePrice || null,
+      minPrice: data.minPrice || null,
+      minPriceNQ: data.minPriceNQ || null,
+      minPriceHQ: data.minPriceHQ || null,
+      maxPrice: data.maxPrice || null,
+      lastUploadTime: data.lastUploadTime || null, // 掛單資料的更新時間戳（毫秒），給「資料新鮮度」用
+      worldUploadTimes: worldUploadTimes,            // {世界名稱: 更新時間戳(毫秒)}，資料中心查詢時 Universalis 會一併回傳；沒給就是空物件
+    };
+  }
+  /* 舊介面（生產頁等地方在用）：失敗回傳 null，行為不變，只是現在查詢有重試 */
+  async function getItemMarketOverview(itemId, scopeName) {
+    try { return await getItemMarketOverviewEx(itemId, scopeName); } catch (e) { return null; }
   }
 
   async function getSellDepth(itemId, worldNameStr) {
     if (!worldNameStr) return null;
     const url = API + '/' + encodeURIComponent(worldNameStr) + '/' + itemId + '?listings=50&entries=0';
     try {
-      const res = await throttledFetch(url);
-      const data = await res.json();
+      const data = await fetchJsonRetry(url);
       const listings = (data.listings || []).slice().sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
       return listings.map(function (l) { return { world: worldNameStr, quantity: l.quantity, pricePerUnit: l.pricePerUnit }; });
     } catch (e) { return null; }
@@ -835,7 +882,182 @@
     return out[itemId] || null;
   }
 
+  /* ── 成交均價（全站同一套）──
+   * 件數加權：成交總額 ÷ 成交總件數（每一件實際賣多少）。排除異常成交後再算。
+   * 預先計算腳本（scripts/update-market-data.js）用同一個定義：sv ÷ sq。 */
+  function weightedAvgPrice(list) {
+    const clean = excludeOutlierEntries(list || [], function (h) { return h.pricePerUnit; });
+    let v = 0, q = 0;
+    clean.forEach(function (h) { const n = h.quantity > 0 ? h.quantity : 1; v += h.pricePerUnit * n; q += n; });
+    return q > 0 ? Math.round(v / q) : null;
+  }
+  /* 5個窗口的成交均價（當前＝24小時內、近1天＝48小時內、3天、7天、30天）。
+   * 一次抓30天紀錄、窗口都在本地切；同一個物品同一個範圍10分鐘內只抓一次，失敗不存快取。
+   * 市場頁、生產頁、供應鏈共用這一份。 */
+  const avgWindowsCache = {};
+  function getAvgWindows(itemId, scopeWorld) {
+    const key = (scopeWorld || 'DC') + '|' + itemId;
+    const hit = avgWindowsCache[key];
+    if (hit && Date.now() - hit.time < 10 * 60 * 1000) return hit.promise;
+    const promise = fetchFullHistory(itemId, 30, scopeWorld || undefined).then(function (full) {
+      const now = Date.now() / 1000;
+      const inRange = function (a, b) { return full.filter(function (h) { return h.timestamp >= now - b * 3600 && h.timestamp < now - a * 3600; }); };
+      const within = function (d) { return full.filter(function (h) { return h.timestamp >= now - d * 86400; }); };
+      return { current: weightedAvgPrice(inRange(0, 24)), d1: weightedAvgPrice(inRange(0, 48)), d3: weightedAvgPrice(within(3)), d7: weightedAvgPrice(within(7)), d30: weightedAvgPrice(within(30)) };
+    }).catch(function () { delete avgWindowsCache[key]; return null; });
+    avgWindowsCache[key] = { time: Date.now(), promise: promise };
+    return promise;
+  }
+  /* 均價比較彈窗的內容（市場頁、生產頁共用）：每列＝標籤＋長條＋數字＋「當前相對這個窗口」的漲跌%。
+   * 漲跌色沿用關注抽屜：紅＝當前比這個窗口貴（漲），綠＝便宜（跌）。 */
+  function avgWindowRowsHtml(w) {
+    const rows = [['當前', w.current, '最近24小時內的成交均價'], ['近1天', w.d1, '最近48小時內（當天＋昨天）的成交均價'], ['近3天', w.d3, '過去3天所有成交的平均'], ['近7天', w.d7, '過去7天所有成交的平均'], ['近30天', w.d30, '過去30天所有成交的平均']];
+    const maxV = Math.max.apply(null, rows.map(function (r) { return r[1] || 0; })) || 1;
+    return rows.map(function (r, i) {
+      let chg = '<em class="mav-chg"></em>';
+      if (i > 0 && w.current != null && r[1]) {
+        const pct = (w.current - r[1]) / r[1] * 100, abs = Math.abs(pct);
+        chg = abs < 0.5 ? '<em class="mav-chg flat">0%</em>' : '<em class="mav-chg ' + (pct > 0 ? 'up' : 'down') + '">' + (pct > 0 ? '+' : '−') + (abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)) + '%</em>';
+      }
+      return '<div class="mav-row' + (i === 0 ? ' is-now' : '') + '" title="' + r[2] + '"><span class="mav-l">' + r[0] + '</span>' +
+        '<span class="mav-bar"><i style="width:' + (r[1] != null ? Math.max(4, r[1] / maxV * 100).toFixed(0) : 0) + '%"></i></span>' +
+        '<strong>' + (r[1] != null ? r[1].toLocaleString() : '—') + '</strong><small>金</small>' + chg + '</div>';
+    }).join('');
+  }
+
+  /* ── 全站共用的「取價設定」：買入／賣出 各自的「範圍」與「基準」──
+   *   範圍：dc＝所有世界（整個資料中心）、world＝我的世界
+   *   基準：listing＝最低價（掛單）、avg＝成交均價（件數加權）
+   * 買入＝材料／要買的東西；賣出＝成品／要賣的東西。製作商機、供應鏈、代幣兌換、生產頁共用同一份，
+   * 在任何一處切換，其他處跟著變（用 onPricePrefsChange 訂閱）。存在瀏覽器，沒設定我的世界時範圍一律當作 dc。 */
+  const PRICE_PREFS_KEY = 'ff14fc-price-prefs-v1';
+  const PRICE_PREFS_DEFAULT = { buyScope: 'dc', buyBasis: 'listing', sellScope: 'dc', sellBasis: 'avg' };
+  let pricePrefs = null;
+  const pricePrefListeners = [];
+  function loadPricePrefs() {
+    let saved = null;
+    try { saved = JSON.parse(localStorage.getItem(PRICE_PREFS_KEY) || 'null'); } catch (e) { saved = null; }
+    if (!saved) { // 第一次：把舊的各自設定帶過來（供應鏈基準、代幣範圍、生產頁範圍）
+      saved = {};
+      try { const sup = JSON.parse(localStorage.getItem('ff14fc-supply-settings') || 'null'); if (sup && (sup.materialsBasis === 'avg' || sup.materialsBasis === 'listing')) saved.buyBasis = sup.materialsBasis; } catch (e) { /* 沒有就用預設 */ }
+      try { if (localStorage.getItem('ff14fc-token-scope') === 'world' || localStorage.getItem('cf-profit-scope') === 'world') saved.sellScope = 'world'; } catch (e) { /* 沒有就用預設 */ }
+    }
+    pricePrefs = Object.assign({}, PRICE_PREFS_DEFAULT, saved);
+    ['buyScope', 'sellScope'].forEach(function (k) { if (pricePrefs[k] !== 'world') pricePrefs[k] = 'dc'; });
+    ['buyBasis', 'sellBasis'].forEach(function (k) { if (pricePrefs[k] !== 'avg') pricePrefs[k] = 'listing'; });
+  }
+  function getPricePrefs() {
+    if (!pricePrefs) loadPricePrefs();
+    const p = Object.assign({}, pricePrefs);
+    if (!settings.worldName) { p.buyScope = 'dc'; p.sellScope = 'dc'; } // 沒設定我的世界：只能看所有世界
+    return p;
+  }
+  function setPricePrefs(patch) {
+    if (!pricePrefs) loadPricePrefs();
+    Object.keys(patch).forEach(function (k) { if (k in PRICE_PREFS_DEFAULT) pricePrefs[k] = patch[k]; });
+    try { localStorage.setItem(PRICE_PREFS_KEY, JSON.stringify(pricePrefs)); } catch (e) { /* 存不了就只對這次有效 */ }
+    pricePrefListeners.slice().forEach(function (fn) { try { fn(getPricePrefs()); } catch (e) { /* 單一訂閱者出錯不影響其他人 */ } });
+  }
+  function onPricePrefsChange(fn) { pricePrefListeners.push(fn); }
+  /* 切換列：[買 範圍｜基準][賣 範圍｜基準]，只畫 sides 指定的那幾邊；「我的世界」按鈕直接顯示世界名稱。
+   * 回傳 HTML；事件綁定用 bindPricePrefsBars()（全頁共用一個委派，不用每次重綁）。 */
+  function pricePrefsBarHtml(sides) {
+    const p = getPricePrefs(), w = settings.worldName;
+    const seg = function (key, opts) {
+      return '<span class="pp-seg" role="group">' + opts.map(function (o) {
+        const dis = o[2] ? ' disabled title="先在右上角設定我的世界"' : '';
+        return '<button type="button" class="pp-btn' + (p[key] === o[0] ? ' on' : '') + '" data-pp-key="' + key + '" data-pp-val="' + o[0] + '"' + dis + '>' + o[1] + '</button>';
+      }).join('') + '</span>';
+    };
+    return '<span class="pp-bar">' + (sides || ['buy', 'sell']).map(function (side) {
+      return '<span class="pp-side"><span class="pp-lead">' + (side === 'buy' ? '買入' : '賣出') + '</span>' +
+        seg(side + 'Scope', [['dc', '所有世界'], ['world', w || '我的世界', !w]]) +
+        seg(side + 'Basis', [['listing', '最低價'], ['avg', '均價']]) + '</span>';
+    }).join('') + '</span>';
+  }
+  let ppBound = false;
+  function bindPricePrefsBars() {
+    if (ppBound) return;
+    ppBound = true;
+    // 用「捕獲階段」接收：供應鏈設定彈窗等地方會擋住事件往上傳（stopPropagation），一般的 click 監聽收不到，按鈕就點不動
+    document.addEventListener('click', function (e) {
+      const b = e.target.closest && e.target.closest('.pp-btn');
+      if (!b || b.disabled) return;
+      const patch = {}; patch[b.dataset.ppKey] = b.dataset.ppVal;
+      setPricePrefs(patch);
+    }, true);
+    onPricePrefsChange(function (cur) { // 全頁所有切換列同步亮起目前的選擇
+      document.querySelectorAll('.pp-btn').forEach(function (btn) { btn.classList.toggle('on', cur[btn.dataset.ppKey] === btn.dataset.ppVal); });
+    });
+  }
+
+  /* ── 自製下拉：取代瀏覽器原生的灰色下拉（選項列表、邊框、捲動條都改不了），樣式共用關注抽屜的 .wl-dd ──
+   * 原本的 <select> 留著（隱藏），選了之後照樣改它的值並觸發 change，原本的程式不用動；
+   * 程式之後改 select.value、換 option、改 disabled，按鈕上的字也會跟著更新。 */
+  function enhanceSelect(sel) {
+    if (!sel || sel._enhanced) return;
+    sel._enhanced = true;
+    sel.style.display = 'none';
+    const wrap = document.createElement('div');
+    wrap.className = 'wl-dd craft-dd mk-dd';
+    wrap.innerHTML = '<button type="button" class="wl-dd-btn" aria-haspopup="listbox" aria-expanded="false"><span></span><i class="ph ph-caret-down"></i></button><div class="wl-dd-list" role="listbox" hidden></div>';
+    sel.parentNode.insertBefore(wrap, sel.nextSibling);
+    const btn = wrap.querySelector('.wl-dd-btn'), list = wrap.querySelector('.wl-dd-list');
+    const close = function () { list.hidden = true; wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
+    const render = function () {
+      const cur = sel.options[sel.selectedIndex];
+      btn.firstElementChild.textContent = cur ? cur.text : '';
+      btn.disabled = sel.disabled;
+      list.innerHTML = Array.prototype.map.call(sel.options, function (o) {
+        return '<button type="button" role="option" class="wl-dd-opt' + (o.selected ? ' on' : '') + '" data-v="' + String(o.value).replace(/"/g, '&quot;') + '">' + o.text + '</button>';
+      }).join('');
+    };
+    render();
+    sel._ddRender = render;
+    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
+    Object.defineProperty(sel, 'value', { configurable: true, get: function () { return d.get.call(sel); }, set: function (v) { d.set.call(sel, v); render(); } });
+    new MutationObserver(render).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
+    btn.addEventListener('click', function (e) {
+      e.stopPropagation();
+      const was = !list.hidden;
+      document.querySelectorAll('.mk-dd .wl-dd-list').forEach(function (l) { l.hidden = true; l.parentNode.classList.remove('open'); });
+      if (!was) { list.hidden = false; wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); const on = list.querySelector('.wl-dd-opt.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
+    });
+    list.addEventListener('click', function (e) {
+      const o = e.target.closest('.wl-dd-opt'); if (!o) return;
+      e.stopPropagation();
+      sel.value = o.dataset.v;
+      sel.dispatchEvent(new Event('change', { bubbles: true }));
+      close();
+    });
+    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
+    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !list.hidden) { close(); e.stopPropagation(); } }, true);
+  }
+  /* 市場頁所有 id 以 mk- 開頭的下拉（設定、走勢、供應鏈、計算器…）自動換成自製下拉，之後動態產生的也會處理 */
+  let selectWatcher = null;
+  function autoEnhanceSelects() {
+    if (selectWatcher) return;
+    const scan = function (root) {
+      (root.querySelectorAll ? root.querySelectorAll('select[id^="mk-"]') : []).forEach(function (s) { if (s.id !== 'mk-world-filter') enhanceSelect(s); });
+      if (root.matches && root.matches('select[id^="mk-"]') && root.id !== 'mk-world-filter') enhanceSelect(root);
+    };
+    scan(document);
+    selectWatcher = new MutationObserver(function (muts) { muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); }); });
+    selectWatcher.observe(document.body, { childList: true, subtree: true });
+  }
+
+  /* 買方稅：不管在哪個城市買，買家一律固定 5%（賣方稅才依城市不同）。畫面上所有「買」的總價估算都用這個數字。 */
+  const BUY_TAX_RATE = 0.05;
   return {
+    buyTaxRate: BUY_TAX_RATE,
+    enhanceSelect: enhanceSelect, autoEnhanceSelects: autoEnhanceSelects,
+    resolveBuyCostsByPrefs: resolveBuyCostsByPrefs,
+    getPricePrefs: getPricePrefs, setPricePrefs: setPricePrefs, onPricePrefsChange: onPricePrefsChange, pricePrefsBarHtml: pricePrefsBarHtml, bindPricePrefsBars: bindPricePrefsBars,
+    weightedAvgPrice: weightedAvgPrice,
+    getAvgWindows: getAvgWindows,
+    avgWindowRowsHtml: avgWindowRowsHtml,
+    greedyFill: greedyFill,
+    getItemMarketOverviewEx: getItemMarketOverviewEx,
     ensureMeta: ensureMeta,
     listDcNames: listDcNames,
     listWorldNamesInDc: listWorldNamesInDc,
