--- a/js/market-watchlist.js	2026-11-04 19:19:12.811437356 +0000
+++ b/js/market-watchlist.js	2026-11-04 19:19:12.813524810 +0000
@@ -58,7 +58,10 @@
   function writeJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 存不了就算了，不影響其他功能 */ } }
   function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
   function trim2(x) { return String(Math.round(x * 100) / 100); }
-  function compactGil(n) { return n >= 1e8 ? trim2(n / 1e8) + '億' : trim2(n / 1e4) + '萬'; }
+  function compactGil(n) { // 跟物品頁同一個簡寫函式（進位方式一致）；抽屜表格空間夠，1000 萬以上才簡寫，這個門檻保留
+    if (bridge && bridge.compactGil) return bridge.compactGil(n, 1e7);
+    return n >= 1e8 ? trim2(n / 1e8) + '億' : trim2(n / 1e4) + '萬';
+  }
   function fmt(n) { return n == null ? '—' : (n >= 1e7 ? compactGil(n) : Math.round(n).toLocaleString('zh-TW')); }
   function fmtFull(n) { return Math.round(n).toLocaleString('zh-TW'); }
   function fmtVel(x) { x = x || 0; return x >= 1 ? x.toFixed(1) : (x > 0 ? x.toFixed(2) : '0'); }
@@ -208,10 +211,21 @@
       if (e) live[scope][String(id)] = Object.assign({ fetchedAt: Date.now() }, e);
     });
   }
+  /* 查價進行中又有新的要求時，合併成「做完這次再補一次」：要查全部的優先；都只查指定物品就把物品合起來，
+   * 不要只留最後一個（連續加入幾個物品時，前面那幾個會一直沒有價格）。 */
+  function mergeRefreshOpts(a, b) {
+    if (!a) return b;
+    const aFull = !a.ids && !a.targetsOnly, bFull = !b.ids && !b.targetsOnly;
+    if (aFull) return a;
+    if (bFull) return b;
+    if (a.ids && b.ids) { const u = a.ids.slice(); b.ids.forEach(function (x) { if (u.indexOf(x) < 0) u.push(x); }); return Object.assign({}, a, { ids: u }); }
+    if (a.ids || b.ids) return {}; // 一個指定物品、一個只查有目標價的：直接查全部最保險
+    return a; // 都是 targetsOnly
+  }
   function refresh(opts) {
     opts = opts || {};
     if (!bridge || typeof MarketData === 'undefined' || !MarketData.fetchWatchBatch) return Promise.resolve();
-    if (refreshing) { needAgain = needAgain && !needAgain.targetsOnly ? needAgain : opts; return Promise.resolve(); }
+    if (refreshing) { needAgain = mergeRefreshOpts(needAgain, opts); return Promise.resolve(); }
     var s = st();
     if (!s.dcName) { lastRefreshState = 'nodc'; renderStatus(); return Promise.resolve(); }
     var items = list.filter(function (w) {
@@ -734,15 +748,23 @@
     els.drawer.classList.toggle('wide', isWide());
     renderHead(); renderToolbar(); renderTagbar(); renderSettings(); renderBody(); renderStatus(); updateBadge();
   }
+  /* 徽章＝清單裡的物品總數（跟生產頁「批次規劃」的徽章同一個邏輯：加一個就 +1、移除就 -1，馬上跳數字）。
+   * 「已達目標價」改用顏色表達：有達標時徽章變綠、金框呼吸綠光，數量寫在滑鼠提示裡。 */
+  var lastBadgeN = null;
   function updateBadge() {
     if (!els.badge) return;
-    var sc = effScope(), n = 0;
-    list.forEach(function (w) { var p = priceInfo(w.itemId, sc); if (p && isReached(w, p.min)) n++; });
-    els.badge.textContent = n;
-    els.badge.style.display = n > 0 ? 'inline-flex' : 'none';
+    var sc = effScope(), hit = 0, total = list.length;
+    list.forEach(function (w) { var p = priceInfo(w.itemId, sc); if (p && isReached(w, p.min)) hit++; });
+    els.badge.textContent = total > 99 ? '99+' : total;
+    els.badge.style.display = total > 0 ? 'inline-flex' : 'none';
+    els.badge.classList.toggle('has-hit', hit > 0);
+    if (lastBadgeN !== null && lastBadgeN !== total && total > 0) { // 數量變了才彈一下（第一次載入不彈）
+      els.badge.classList.remove('bump'); void els.badge.offsetWidth; els.badge.classList.add('bump');
+    }
+    lastBadgeN = total;
     if (els.fab) {
-      els.fab.title = '關注清單（' + list.length + '）' + (n ? '・' + n + ' 個已達目標價' : '');
-      els.fab.classList.toggle('has-hit', n > 0);
+      els.fab.title = '關注清單（' + total + '）' + (hit ? '・' + hit + ' 個已達目標價' : '');
+      els.fab.classList.toggle('has-hit', hit > 0);
     }
   }
 
