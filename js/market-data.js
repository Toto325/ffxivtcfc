/* market-data.js — 市場價格模組（Universalis）
 *
 * 設計原則：
 *  1. 純前端直連 Universalis 公開API，不架後端代理。
 *  2. 「買」＝整個資料中心(DC)聚合，貪婪填充跨世界湊足數量（因為市場板本來就能買同DC任何世界的掛單）。
 *  3. 「賣」＝只看玩家自己選的世界（因為上架只能在角色當下所在世界，不能跨世界賣）。
 *  4. 世界／資料中心清單即時向 Universalis 要，不在這裡手刻寫死，
 *     避免琉球/陸行鳥之類的譯名或未來新開服跟實際資料兜不起來。
 *  5. 記憶體快取＋localStorage快取雙層，TTL內重複查詢不再打API；
 *     同一批itemId一次送出（逗號分隔），不要多次個別call。
 */
window.MarketData = (function () {
  const API = 'https://universalis.app/api/v2';
  const TTL_MS = 8 * 60 * 1000; // 8分鐘內的資料視為新鮮，不重查
  const SETTINGS_KEY = 'craftMarketSettings:v1';
  const CACHE_KEY_PREFIX = 'craftMarketCache:v1:';

  let settings = { dcName: null, worldName: null };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = Object.assign(settings, JSON.parse(raw));
  } catch (e) { /* 讀不到就用預設值，不影響使用 */ }

  const memCache = new Map(); // itemId -> { time, listings: [{worldName, pricePerUnit, quantity, hq}] }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* 存不進去就算了 */ }
  }

  /* ── 世界／資料中心清單：跟遊戲資料一樣做「本地快取＋背景更新」，不必每次都連線才能用 ── */
  let worldList = null; // [{id, name}]
  let dcList = null; // [{name, worlds:[worldId,...], region}]
  const META_CACHE_KEY = 'craftMarketMeta:v1';

  async function ensureMeta() {
    if (worldList && dcList) return;
    try {
      const raw = localStorage.getItem(META_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.time && Date.now() - parsed.time < 24 * 60 * 60 * 1000) {
          worldList = parsed.worldList; dcList = parsed.dcList;
        }
      }
    } catch (e) { /* 忽略壞掉的快取 */ }
    if (worldList && dcList) return;
    const [w, d] = await Promise.all([
      fetch(API + '/worlds').then(function (r) { return r.json(); }),
      fetch(API + '/data-centers').then(function (r) { return r.json(); }),
    ]);
    worldList = w; dcList = d;
    try { localStorage.setItem(META_CACHE_KEY, JSON.stringify({ time: Date.now(), worldList: w, dcList: d })); } catch (e) { /* 忽略 */ }
  }

  /* 世界id -> 世界名稱，查詢/顯示都會用到 */
  function worldName(worldId) {
    if (!worldList) return String(worldId);
    const w = worldList.find(function (x) { return x.id === worldId; });
    return w ? w.name : String(worldId);
  }

  async function listDcNames() { await ensureMeta(); return dcList.map(function (d) { return d.name; }); }
  async function listWorldNamesInDc(dcName) {
    await ensureMeta();
    const dc = dcList.find(function (d) { return d.name === dcName; });
    if (!dc) return [];
    return dc.worlds.map(worldName);
  }

  function getSettings() { return Object.assign({}, settings); }
  async function setDataCenter(dcName) {
    settings.dcName = dcName; settings.worldName = null; saveSettings();
  }
  async function setWorld(worldNameStr) {
    settings.worldName = worldNameStr;
    if (!settings.dcName) {
      await ensureMeta();
      const dc = dcList.find(function (d) { return listContains(d, worldNameStr); });
      if (dc) settings.dcName = dc.name;
    }
    saveSettings();
  }
  function listContains(dc, wName) {
    return dc.worlds.map(worldName).indexOf(wName) !== -1;
  }

  /* ── 批次查價：一次把多個itemId送給 Universalis（逗號分隔），減少API呼叫次數 ── */
  async function fetchListingsBatch(itemIds) {
    if (!itemIds.length) return {};
    await ensureMeta();
    if (!settings.dcName) throw new Error('尚未設定資料中心，請先在設定裡選擇伺服器');

    const now = Date.now();
    const need = [];
    const result = {};
    itemIds.forEach(function (id) {
      const hit = memCache.get(id);
      if (hit && now - hit.time < TTL_MS) { result[id] = hit.listings; return; }
      need.push(id);
    });
    if (!need.length) return result;

    // Universalis單次查詢itemId數量上限抓保守值，超過就分批送
    const CHUNK = 90;
    for (let i = 0; i < need.length; i += CHUNK) {
      const chunk = need.slice(i, i + CHUNK);
      // 不加 fields 篩選參數：文件雖然列了 fields 這個query參數，但巢狀寫法(listings.worldName)沒有把握
      // 一定被正確解析，一旦解析失敗很可能連 listings 都被濾掉，寧可多拿一點欄位也不要冒資料被砍光的風險。
      const url = API + '/' + encodeURIComponent(settings.dcName) + '/' + chunk.join(',') + '?listings=50&entries=0';
      let data;
      try {
        const res = await fetch(url);
        data = await res.json();
      } catch (e) { continue; } // 這批查詢失敗就跳過，不讓整個功能因為一批失敗而全部掛掉

      // 關鍵：查單一itemId時，Universalis回傳的是「攤平的單一物件」，欄位是 itemID（大寫ID）；
      // 查多個itemId（逗號分隔）時，回傳的是 { itemIDs, items, dcName, unresolvedItems }，
      // 且 items 是「以itemID字串為key的物件(map)」，不是陣列，不能直接forEach，要轉成entries來跑。
      const list = chunk.length === 1
        ? (data && data.itemID != null ? [data] : [])
        : Object.keys((data && data.items) || {}).map(function (key) { return data.items[key]; });

      list.forEach(function (entry) {
        if (!entry || entry.itemID == null) return;
        const listings = (entry.listings || []).slice().sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
        memCache.set(entry.itemID, { time: now, listings: listings });
        result[entry.itemID] = listings;
      });
    }
    return result;
  }

  /* ── 貪婪填充：從最便宜的掛單開始吃，直到湊滿需求量，回傳總成本／均價／跨了哪些世界 ──
   * listings 需已依 pricePerUnit 由低到高排序（fetchListingsBatch 已排好）。 */
  function greedyFill(listings, neededQty) {
    let remaining = neededQty;
    let totalCost = 0;
    const breakdown = [];
    for (let i = 0; i < listings.length && remaining > 0; i++) {
      const l = listings[i];
      const take = Math.min(remaining, l.quantity);
      if (take <= 0) continue;
      totalCost += take * l.pricePerUnit;
      breakdown.push({ world: l.worldName, qty: take, unitPrice: l.pricePerUnit });
      remaining -= take;
    }
    return {
      resolved: remaining <= 0, // false代表整個DC掛單量都不夠湊滿，需求量比市場庫存還大
      filledQty: neededQty - remaining,
      totalCost: totalCost,
      avgPrice: (neededQty - remaining) > 0 ? totalCost / (neededQty - remaining) : null,
      worldCount: new Set(breakdown.map(function (b) { return b.world; })).size,
      breakdown: breakdown,
    };
  }

  /* ── 對外主要介面：買一批材料，回傳 { itemId: greedyFillResult } ── */
  async function resolveBuyCosts(needMap) {
    // needMap: { itemId: quantity }
    const ids = Object.keys(needMap).map(Number);
    const listingsMap = await fetchListingsBatch(ids);
    const out = {};
    ids.forEach(function (id) {
      out[id] = greedyFill(listingsMap[id] || [], needMap[id]);
    });
    return out;
  }

  /* 材料圖譜單顆節點只需要「單價參考」，quantity固定給1，本質上跟批量查是同一支函式，只是量小 */
  async function getUnitPriceRef(itemId) {
    const listingsMap = await fetchListingsBatch([Number(itemId)]);
    const listings = listingsMap[itemId] || [];
    if (!listings.length) return null;
    return { price: listings[0].pricePerUnit, world: listings[0].worldName };
  }

  /* ── 賣出價：只看玩家自己的世界，不做跨世界貪婪填充（上架不能跨世界） ── */
  async function getSellPrice(itemId) {
    if (!settings.worldName) return null;
    const url = API + '/' + encodeURIComponent(settings.worldName) + '/' + itemId + '?listings=20&entries=0';
    try {
      const res = await fetch(url);
      const data = await res.json();
      const listings = (data.listings || []).slice().sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
      if (!listings.length) return null;
      return { price: listings[0].pricePerUnit, world: settings.worldName };
    } catch (e) { return null; }
  }

  return {
    ensureMeta: ensureMeta,
    listDcNames: listDcNames,
    listWorldNamesInDc: listWorldNamesInDc,
    getSettings: getSettings,
    setDataCenter: setDataCenter,
    setWorld: setWorld,
    resolveBuyCosts: resolveBuyCosts,
    getUnitPriceRef: getUnitPriceRef,
    getSellPrice: getSellPrice,
  };
})();
