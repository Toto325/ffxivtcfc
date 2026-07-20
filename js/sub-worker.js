/**
 * sub-worker.js
 *
 * 把潛水艇路線搜尋（subFindRoutes，組合爆炸的重計算）丟到背景執行緒跑，
 * 避免使用者按下「搜尋」時主執行緒（畫面）被卡住。
 *
 * 用 importScripts 載入 sub-data.js（資料）與 sub-calc.js（演算法）。
 * 這兩份檔案同時被 index.html 以 <script> 載入（主執行緒）和這裡以
 * importScripts 載入（Worker），確保資料/邏輯只有一份來源，不會兩邊改到不同步。
 * 兩者皆不碰 document/window，可安全在 Worker（沒有 DOM）裡載入。
 * 順序不可顛倒：sub-calc.js 在頂層直接使用 sub-data.js 定義的常數
 * （例如 SECTOR_MAP 是從 SUB_SECTORS 算出來的），必須先載入 sub-data.js。
 */
importScripts('sub-data.js', 'sub-calc.js');

self.onmessage = function (e) {
  const d = e.data || {};
  const reqId = d.reqId;
  try {
    const routes = subFindRoutes(
      d.rank, d.stats, d.mustInc, d.mustExcl,
      d.mustIncMaps, d.mustExclMaps, d.mustLootIds,
      d.desiredMins, d.useTime, d.letterOnly, d.lootStrict
    );
    self.postMessage({ reqId: reqId, ok: true, routes: routes });
  } catch (err) {
    self.postMessage({ reqId: reqId, ok: false, error: String((err && err.message) || err) });
  }
};
