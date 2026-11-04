--- a/scripts/update-market-data.js	2026-11-04 19:19:12.867842496 +0000
+++ b/scripts/update-market-data.js	2026-11-04 19:19:12.869841800 +0000
@@ -332,7 +332,7 @@
  * accumulate 每次都把5個窗口全部填好，未涵蓋到的時間範圍自然不會有任何成交落進去（不會是錯誤的0，
  * 只是還沒抓那麼遠），buildP 依序嘗試三個級距，遇到資料不足就試下一個更長的，全部不夠才回傳 null。 */
 const PERSP = ['all', 'nq', 'hq'];
-function emptyW() { return { n: 0, sp: 0, sv: 0 }; }
+function emptyW() { return { n: 0, sp: 0, sv: 0, sq: 0 }; } // n筆數、sp單價加總、sv成交金額（單價×件數）加總、sq件數加總；成交均價＝sv÷sq（件數加權）
 function newAcc() {
   const a = {};
   PERSP.forEach(function (p) { a[p] = [emptyW(), emptyW(), emptyW(), emptyW(), emptyW()]; }); // 24h, 48h, 3d, 7d, 30d
@@ -398,7 +398,7 @@
       if (age <= limits[w]) {
         for (const p of targets) {
           const cell = acc[p][w];
-          cell.n++; cell.sp += e.price; cell.sv += e.price * e.qty;
+          cell.n++; cell.sp += e.price; cell.sv += e.price * e.qty; cell.sq += e.qty;
         }
       }
     }
@@ -406,7 +406,7 @@
 }
 function mergeAcc(into, from) {
   PERSP.forEach(function (p) {
-    for (let w = 0; w < 5; w++) { into[p][w].n += from[p][w].n; into[p][w].sp += from[p][w].sp; into[p][w].sv += from[p][w].sv; }
+    for (let w = 0; w < 5; w++) { into[p][w].n += from[p][w].n; into[p][w].sp += from[p][w].sp; into[p][w].sv += from[p][w].sv; into[p][w].sq += from[p][w].sq; }
   });
 }
 /* 依窗口統計決定這個道具落在哪個頻率級距，並輸出精簡陣列（P[0]：1=賣速高、2=賣速中、3=成交稀少）。
@@ -420,7 +420,7 @@
  * 一定是同批資料的子集合），不會有這種「有些世界只貢獻一部分」的問題。 */
 function buildP(win, reachedD30) {
   const w24 = win[0], w48 = win[1], w3 = win[2], w7 = win[3], w30 = win[4];
-  const avg = function (w) { return Math.round(w.sp / w.n); };
+  const avg = function (w) { return Math.round(w.sq > 0 ? w.sv / w.sq : w.sp / w.n); }; // 件數加權的成交均價
   if (w24.n >= MIN_SHORT && w48.n >= MIN_LONG) return [1, w24.n, avg(w24), w48.n, avg(w48), Math.round(w48.sv)];
   if (w3.n >= MIN_SHORT && w7.n >= MIN_LONG) return [2, w3.n, avg(w3), w7.n, avg(w7), Math.round(w7.sv)];
   if (reachedD30 && w7.n >= MIN_SHORT && w30.n >= MIN_LONG) return [3, w7.n, avg(w7), w30.n, avg(w30), Math.round(w30.sv)];
@@ -429,7 +429,7 @@
 
 /* 「全部」視角的四個窗口原始統計（詳情頁的均價徽章要的是「24小時內成交均價」，不管這個道具屬於哪個頻率級距） */
 function buildD(win, reachedD7) {
-  const avg = function (w) { return w.n ? Math.round(w.sp / w.n) : null; };
+  const avg = function (w) { return w.n ? Math.round(w.sq > 0 ? w.sv / w.sq : w.sp / w.n) : null; }; // 件數加權的成交均價
   return [win[0].n, avg(win[0]), win[1].n, avg(win[1]), reachedD7 ? win[2].n : null, reachedD7 ? avg(win[2]) : null, reachedD7 ? win[3].n : null, reachedD7 ? avg(win[3]) : null];
 }
 
