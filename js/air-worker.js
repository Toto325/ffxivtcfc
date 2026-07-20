/**
 * air-worker.js
 *
 * 把飛空艇路線搜尋（airFindRoutes）丟到背景執行緒跑，架構完全比照 sub-worker.js。
 * air-data.js／air-calc.js 同時被 index.html 以 <script> 載入（主執行緒）和這裡以
 * importScripts 載入（Worker），確保資料只有一份來源。
 */
importScripts('air-data.js', 'air-calc.js');

self.onmessage = function (e) {
  const d = e.data || {};
  const reqId = d.reqId;
  try {
    const routes = airFindRoutes(
      d.rank, d.stats, d.mustInc, d.mustExcl,
      d.mustLootIds, d.desiredMins, d.useTime, d.lootStrict
    );
    self.postMessage({ reqId: reqId, ok: true, routes: routes });
  } catch (err) {
    self.postMessage({ reqId: reqId, ok: false, error: String((err && err.message) || err) });
  }
};
