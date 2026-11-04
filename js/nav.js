--- a/js/nav.js	2026-11-04 19:19:12.825485341 +0000
+++ b/js/nav.js	2026-11-04 19:19:12.827376666 +0000
@@ -187,3 +187,22 @@
     document.fonts.ready.then(syncTopNavHeight).catch(function () {});
   }
 })();
+
+/* 背景預載市場頁要用的大檔案（物品名稱、圖示、配方庫）：頁面載完、瀏覽器閒下來之後才開始，
+ * 優先度最低，不影響目前頁面；玩家之後進市場頁時直接命中快取，不用停在「載入中」。
+ * 開了「省流量」或網路很慢（2G）就不預載。 */
+(function () {
+  function prefetchMarketFiles() {
+    const c = navigator.connection;
+    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
+    ['js/item-names-tw.js', 'js/item-icons-tw.js', 'js/craft-data.js'].forEach(function (u) {
+      if (document.querySelector('link[rel="prefetch"][href="' + u + '"]')) return;
+      const l = document.createElement('link');
+      l.rel = 'prefetch'; l.as = 'script'; l.href = u;
+      document.head.appendChild(l);
+    });
+  }
+  window.addEventListener('load', function () {
+    (window.requestIdleCallback || function (f) { setTimeout(f, 4000); })(prefetchMarketFiles, { timeout: 8000 });
+  });
+})();
