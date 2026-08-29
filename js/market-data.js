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

  // 繁中台服目前唯一的DC就是「陸行鳥」，預設先選上它，玩家不用每次開抽屜都要手動選一次；
  // 世界則是個人選擇（哪個世界有角色），不預設，維持空值讓玩家自己挑。
  const DEFAULT_DC = '陸行鳥';
  let settings = { dcName: DEFAULT_DC, worldName: null, sellCityKey: null };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = Object.assign(settings, JSON.parse(raw));
  } catch (e) { /* 讀不到就用預設值，不影響使用 */ }
  if (!settings.dcName) settings.dcName = DEFAULT_DC; // 舊版存過的空值也拉回預設，不要讓使用者開箱看到空的資料中心

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
    settings.sellCityKey = null; // 換了世界，之前選的城市對新世界不一定有意義，重置回「用最低稅率」
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
   * listings 需已依 pricePerUnit 由低到高排序（fetchListingsBatch 已排好）。
   * 買方稅：現在版本規定不管在哪個城市買，買家一律要付稅，Universalis每筆掛單本身就帶了`tax`
   * 欄位（那筆掛單全部買下要付的稅金），這裡按實際拿取的比例分攤，不用自己假設稅率是多少%，
   * 萬一哪天官方調整買方稅率，這裡也不用跟著改。 */
  function greedyFill(listings, neededQty) {
    let remaining = neededQty;
    let totalCost = 0; // 已經含稅，代表玩家實際要付的Gil
    let totalTax = 0;
    const breakdown = [];
    const remainingListings = []; // 這批規劃「用不到」的部分（完全沒動到的掛單、或某筆掛單買剩的量），
    // 用來讓玩家判斷「如果我想多做一批，下一批大概要多少錢」——因為便宜的掛單被這批吃完了，
    // 加購的邊際成本通常會更高，這個資訊只給看規劃內數量會漏掉，得把買剩的部分也記下來。
    for (let i = 0; i < listings.length; i++) {
      const l = listings[i];
      let take = 0;
      if (remaining > 0) {
        take = Math.min(remaining, l.quantity);
        if (take > 0) {
          const subtotal = take * l.pricePerUnit;
          // 該筆掛單全部買下的稅金比例，套用在我們實際拿取的份量上；找不到tax欄位就退回5%當保守估計
          const listingTaxRate = (l.tax != null && l.pricePerUnit > 0 && l.quantity > 0) ? l.tax / (l.pricePerUnit * l.quantity) : 0.05;
          const tax = Math.round(subtotal * listingTaxRate);
          totalCost += subtotal + tax;
          totalTax += tax;
          breakdown.push({ world: l.worldName, qty: take, unitPrice: l.pricePerUnit, tax: tax });
          remaining -= take;
        }
      }
      const leftover = l.quantity - take;
      if (leftover > 0) remainingListings.push({ world: l.worldName, quantity: leftover, pricePerUnit: l.pricePerUnit });
    }
    return {
      resolved: remaining <= 0, // false代表整個DC掛單量都不夠湊滿，需求量比市場庫存還大
      filledQty: neededQty - remaining,
      totalCost: totalCost, // 已含買方稅的實際花費
      totalTax: totalTax,
      avgPrice: (neededQty - remaining) > 0 ? totalCost / (neededQty - remaining) : null,
      worldCount: new Set(breakdown.map(function (b) { return b.world; })).size,
      breakdown: breakdown,
      remainingListings: remainingListings, // 買剩的市場深度，依原本的低到高價格順序排列
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

  /* ── 賣出價：只看玩家自己的世界，不做跨世界貪婪填充（上架不能跨世界）。
   * 整批訂單規劃裡常常一次要查好幾個成品的賣出價，如果每個都各自打一次API，量一多很容易被
   * Universalis的流量限制擋掉（429 Too Many Requests）。這裡改成跟買方查價一樣的做法：
   * 同一批itemId合併成一次請求（逗號分隔），並且做記憶體快取，減少實際打出去的請求數量。 ── */
  const sellMemCache = new Map(); // `${world}:${itemId}` -> {time, price}
  async function getSellPricesBatch(itemIds) {
    if (!settings.worldName || !itemIds.length) return {};
    const world = settings.worldName;
    const now = Date.now();
    const need = [];
    const result = {};
    itemIds.forEach(function (id) {
      const key = world + ':' + id;
      const hit = sellMemCache.get(key);
      if (hit && now - hit.time < TTL_MS) { result[id] = hit.price; return; }
      need.push(id);
    });
    if (!need.length) return result;

    const CHUNK = 90;
    for (let i = 0; i < need.length; i += CHUNK) {
      const chunk = need.slice(i, i + CHUNK);
      const url = API + '/' + encodeURIComponent(world) + '/' + chunk.join(',') + '?listings=20&entries=0';
      let data;
      try {
        const res = await fetch(url);
        data = await res.json();
      } catch (e) { continue; } // 這批查詢失敗就跳過，不讓整個功能因為一批失敗而全部掛掉

      const list = chunk.length === 1
        ? (data && data.itemID != null ? [data] : [])
        : Object.keys((data && data.items) || {}).map(function (key) { return data.items[key]; });

      list.forEach(function (entry) {
        if (!entry || entry.itemID == null) return;
        const listings = (entry.listings || []).slice().sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
        const price = listings.length ? { price: listings[0].pricePerUnit, world: world } : null;
        sellMemCache.set(world + ':' + entry.itemID, { time: now, price: price });
        result[entry.itemID] = price;
      });
    }
    return result;
  }
  async function getSellPrice(itemId) {
    const out = await getSellPricesBatch([Number(itemId)]);
    return out[itemId] || null;
  }

  /* ── 賣方稅：依退休所在城市而不同（新手三城固定5%，其他城市較低、會不定期調整）。
   * 不代管理性地假設玩家一定能挑最低稅率的城市寄售——有些玩家角色可能還沒解鎖遠方城市、或退休就是懶得搬，
   * 所以改成回傳「這個世界目前每個城市的稅率」完整清單，讓UI做成下拉選單給玩家自己選要用哪個城市算，
   * 沒特別選的話才退回目前最低稅率的城市當預設值（多數玩家的常態用法）。
   * 城市欄位的實際大小寫/命名沒有百分之百把握，所以不依賴寫死的key清單，直接掃過整份回傳物件轉成清單，
   * 畫面上顯示的城市名稱盡量對應已知常見寫法，對不到就直接顯示原始key。 ── */
  const CITY_NAME_MAP = {
    limsa: '利姆薩', limsalominsa: '利姆薩', gridania: '格里達尼亞', uldah: '烏爾達哈',
    ishgard: '伊修加德', kugane: '黃金港', crystarium: '水晶都', oldsharlayan: '古沙拉雅',
    tuliyollal: '圖利雅波',
  };
  function cityDisplayName(rawKey) {
    const norm = rawKey.toLowerCase().replace(/[^a-z]/g, '');
    return CITY_NAME_MAP[norm] || rawKey;
  }
  const taxCache = new Map(); // world -> {time, list:[{cityKey,cityName,percent}] 依稅率由低到高排序}
  const TAX_TTL_MS = 30 * 60 * 1000; // 稅率不像價格那樣分秒在變，快取拉長到30分鐘
  async function fetchTaxRatesRaw(worldNameStr) {
    const hit = taxCache.get(worldNameStr);
    if (hit && Date.now() - hit.time < TAX_TTL_MS) return hit.list;
    const res = await fetch(API + '/tax-rates?world=' + encodeURIComponent(worldNameStr));
    const data = await res.json();
    const list = Object.keys(data || {}).map(function (k) {
      return { cityKey: k, cityName: cityDisplayName(k), percent: Number(data[k]) };
    }).filter(function (x) { return !isNaN(x.percent); });
    list.sort(function (a, b) { return a.percent - b.percent; });
    taxCache.set(worldNameStr, { time: Date.now(), list: list });
    return list;
  }
  async function listSellCities(worldNameStr) {
    if (!worldNameStr) return [];
    try { return await fetchTaxRatesRaw(worldNameStr); } catch (e) { return []; }
  }
  function setSellCity(cityKey) { settings.sellCityKey = cityKey || null; saveSettings(); }
  async function getSellTaxInfo(worldNameStr) {
    const list = await listSellCities(worldNameStr);
    if (!list.length) return null;
    let chosen = settings.sellCityKey ? list.find(function (c) { return c.cityKey === settings.sellCityKey; }) : null;
    const isUserChosen = !!chosen;
    if (!chosen) chosen = list[0]; // 沒選的話，list已依稅率排序，[0]就是目前最低稅率的城市
    return { ratePercent: chosen.percent, cityKey: chosen.cityKey, cityName: chosen.cityName, isUserChosen: isUserChosen };
  }

  /* ── 賣出深度：跟買方的「還可以加購」是對稱的概念——賣家如果一次要出清很多個，
   * 前面可能已經有其他玩家掛了不少同類型在排隊，實際能不能照「最低價」全部賣掉是個問號。
   * 這裡不假裝能預測「多久會賣掉」（Universalis沒有給即時的成交速度資料，硬猜只會誤導），
   * 只把「目前這個世界已經有哪些掛單、掛多少錢」老實攤開來，讓玩家自己判斷市場擁擠不擁擠、
   * 打算掛多少錢比較實際。 ── */
  async function getSellDepth(itemId, worldNameStr) {
    if (!worldNameStr) return null;
    const url = API + '/' + encodeURIComponent(worldNameStr) + '/' + itemId + '?listings=50&entries=0';
    try {
      const res = await fetch(url);
      const data = await res.json();
      const listings = (data.listings || []).slice().sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
      return listings.map(function (l) { return { world: worldNameStr, quantity: l.quantity, pricePerUnit: l.pricePerUnit }; });
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
    getSellPricesBatch: getSellPricesBatch,
    getSellTaxInfo: getSellTaxInfo,
    listSellCities: listSellCities,
    setSellCity: setSellCity,
    getSellDepth: getSellDepth,
  };
})();
