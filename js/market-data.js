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
  let settings = { dcName: DEFAULT_DC, worldName: null, sellCityKey: null, excludeOutlierTrades: true }; // 排除異常成交預設打開
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = Object.assign(settings, JSON.parse(raw));
  } catch (e) { /* 讀不到就用預設值，不影響使用 */ }
  if (!settings.dcName) settings.dcName = DEFAULT_DC; // 舊版存過的空值也拉回預設，不要讓使用者開箱看到空的資料中心

  /* ── 資料中心鎖定 ──
   * 繁中服只有「陸行鳥」一個資料中心，讓玩家自己選資料中心只會增加操作步驟、還可能選錯。
   * LOCKED_DC 有值時：整個網站固定用這個資料中心，「選資料中心」的下拉選單預設隱藏（程式碼保留，
   * 日後要開放只要把 DC_SELECTOR_VISIBLE 改成 true、LOCKED_DC 改成 null）。
   * 舊版瀏覽器可能存過別的資料中心，載入時一律拉回鎖定值，並清掉那個資料中心底下的世界／城市選擇
   * （別的資料中心的世界在陸行鳥裡沒有意義）。 */
  const LOCKED_DC = DEFAULT_DC;         // 設成 null 就不鎖定
  const DC_SELECTOR_VISIBLE = false;    // 畫面上要不要顯示「資料中心」下拉選單
  if (LOCKED_DC && settings.dcName !== LOCKED_DC) {
    settings.dcName = LOCKED_DC; settings.worldName = null; settings.sellCityKey = null;
  }

  const memCache = new Map(); // itemId -> { time, listings: [{worldName, pricePerUnit, quantity, hq}] }
  const velocityCache = new Map(); // itemId -> { time, data }
  const VELOCITY_TTL_MS = 30 * 60 * 1000; // 銷售速度是「最近4天」的統計值，不像掛單分秒在變，快取拉長到30分鐘省流量

  /* ── 全域請求節流：不管是哪個功能（材料圖譜展開、批次規劃、自動建議…）觸發的查詢，
   * 最終都要經過這裡才真的打出去，同時間最多只放行幾支請求，其餘先排隊。這是最後一道防線——
   * 前面已經盡量把同批需求合併成一次查詢，但難保不會有某個情境還是短時間內湊出一堆零散請求，
   * 一次全部發出去很容易把Universalis的流量限制觸發（429，瀏覽器常會誤報成CORS政策封鎖）。 ── */
  const MAX_CONCURRENT_REQUESTS = 3;
  let activeRequestCount = 0;
  const pendingQueue = [];
  function throttledFetch(url) {
    return new Promise(function (resolve, reject) {
      function run() {
        activeRequestCount++;
        fetch(url).then(function (res) {
          activeRequestCount--;
          drainQueue();
          resolve(res);
        }).catch(function (e) {
          activeRequestCount--;
          drainQueue();
          reject(e);
        });
      }
      if (activeRequestCount < MAX_CONCURRENT_REQUESTS) run();
      else pendingQueue.push(run);
    });
  }
  function drainQueue() {
    if (pendingQueue.length && activeRequestCount < MAX_CONCURRENT_REQUESTS) {
      const next = pendingQueue.shift();
      next();
    }
  }

  /* ── 帶重試的JSON查詢：throttledFetch原本不看HTTP狀態碼，Universalis遇到限流（429）或暫時性
   * 錯誤（5xx／逾時）時回來的不是正常資料，卻會被當成「查詢成功但沒有資料」——熱度排行
   * 「賣速有時候查不到」「漲跌幾乎全空」就是這樣來的，而且失敗還會被快取1小時。
   * 這裡統一：狀態碼不是2xx → 視為失敗；429／5xx／網路錯誤（瀏覽器常把429誤報成CORS錯誤）
   * → 等一下再試（最多tries次，每次等更久）；其他4xx（例如404）→ 不重試，直接丟出去。
   * 等待發生在throttledFetch放行之後，不會佔用同時連線名額。 ── */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function fetchJsonRetry(url, tries) {
    tries = tries || 3;
    let lastErr = null;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await throttledFetch(url);
        if (res.ok) return await res.json();
        lastErr = new Error('HTTP ' + res.status);
        if (res.status !== 429 && res.status < 500 && res.status !== 408) throw lastErr; // 不是暫時性錯誤，重試沒意義
      } catch (e) {
        lastErr = e;
        if (e && /^HTTP 4\d\d$/.test(e.message || '') && !/^HTTP (429|408)$/.test(e.message)) throw e;
      }
      if (i < tries - 1) await sleep(700 * (i + 1));
    }
    throw lastErr || new Error('查詢失敗');
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* 存不進去就算了 */ }
  }

  /* ── 世界／資料中心清單：跟遊戲資料一樣做「本地快取＋背景更新」，不必每次都連線才能用 ── */
  let worldList = null; // [{id, name}]
  let dcList = null; // [{name, worlds:[worldId,...], region}]
  const META_CACHE_KEY = 'craftMarketMeta:v1';

  let metaPromise = null; // 同時多處呼叫 ensureMeta 時共用同一個請求，不重複打
  async function ensureMeta() {
    if (worldList && dcList) return;
    if (!metaPromise) metaPromise = loadMeta().finally(function () { metaPromise = null; });
    return metaPromise;
  }
  async function loadMeta() {
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
      fetchJsonRetry(API + '/worlds'),   // 失敗會重試；回來的不是正常資料就丟錯，不會把錯誤頁當成世界清單存起來
      fetchJsonRetry(API + '/data-centers'),
    ]);
    if (!Array.isArray(w) || !Array.isArray(d)) throw new Error('世界／資料中心清單格式異常');
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
  /* 系統上存在、但玩家不能加入的世界（例如拉姆）：所有「讓使用者選世界」的畫面（設定裡的我的世界、熱度排行、
   * 物品詳情的世界下拉、生產頁的市場設定…）都是從這個函式取得世界清單，所以只要在這裡過濾一次就全部隱藏了。
   * 資料本身（預先計算的資料檔、判斷某個世界是否屬於資料中心）不受影響；日後要重新顯示，把 SHOW_HIDDEN_WORLDS 改成 true。 */
  const HIDDEN_WORLDS = ['拉姆'];
  const SHOW_HIDDEN_WORLDS = false;
  async function listWorldNamesInDc(dcName) {
    await ensureMeta();
    const dc = dcList.find(function (d) { return d.name === dcName; });
    if (!dc) return [];
    return dc.worlds.map(worldName).filter(function (n) { return SHOW_HIDDEN_WORLDS || HIDDEN_WORLDS.indexOf(n) === -1; });
  }

  function getSettings() { return Object.assign({}, settings); }
  async function setDataCenter(dcName) {
    if (LOCKED_DC) dcName = LOCKED_DC; // 鎖定時，不管誰呼叫都只會是鎖定的資料中心
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

  /* ── 熱度排行用：先跟Universalis要一份「最近真的有市場活動」的道具候選清單，這份清單不分
   * 製作/採集/打寶/兌換──只要有人在市場上架或成交過，就會被列進來，涵蓋範圍才不會被鎖死在
   * 「能製作的東西」。拿到候選清單後才批次查詳細數據，不會對全部道具地毯式查價。 ── */
  /* ── 第6點抓到的真正原因：Universalis單次回應本身有上限（約1800筆），成交熱絡的道具，
   * 這1800筆可能一下子就被最近兩三天的成交塞滿，等於後面30天的資料根本沒機會出現在
   * 單次回應裡——不是道具本身沒有更久的紀錄，是單次要不到那麼多筆。解法是分頁：
   * 先要最新一批，看這批最早一筆的時間戳記，下一批用entriesUntil指定「比這個時間更早」，
   * 一直往前翻頁，直到累積的資料涵蓋到想要的天數為止，或翻到沒有更多資料為止。 ── */
  /* 完整成交紀錄（走勢圖用）。單次請求有筆數上限（每次最多1800筆，新到舊），成交熱絡的道具要往更舊的方向
   * 一頁一頁翻。這裡的改動：
   *  1. onProgress：每翻完一頁就回報「目前為止抓到的全部」，走勢圖可以邊抓邊畫，
   *     不用等30天整份翻完才看到東西（最新的資料最先出現）。
   *  2. 保留 world（資料中心範圍的紀錄會帶成交的世界），成交明細表可以依世界篩選。
   *  3. 同一個道具＋範圍抓過的結果先記在記憶體（10分鐘內），再開同一個走勢圖／切換天數是瞬間的。
   *  失敗會重試（fetchJsonRetry），不再一遇到錯誤就默默截斷。 */
  const fullHistoryCache = {}; // key -> { time, days, all }
  async function fetchFullHistory(itemId, maxDays, scopeName, onProgress) {
    await ensureMeta();
    if (!settings.dcName) throw new Error('尚未設定資料中心，請先在設定裡選擇伺服器');
    const region = scopeName || settings.dcName;
    const cacheKey = region + '|' + itemId;
    const cutoff = Date.now() / 1000 - maxDays * 86400;
    const hit = fullHistoryCache[cacheKey];
    if (hit && Date.now() - hit.time < 10 * 60 * 1000 && hit.days >= maxDays) {
      const sub = hit.all.filter(function (h) { return h.timestamp >= cutoff; });
      if (onProgress) onProgress(sub, true);
      return sub;
    }
    let all = [];
    let entriesUntil = null;
    let truncated = false; // 翻頁途中失敗＝手上的資料沒涵蓋到 maxDays，這種結果不能存進快取
    const MAX_PAGES = 8; // 安全上限，避免單一物品成交紀錄多到無限翻頁
    for (let page = 0; page < MAX_PAGES; page++) {
      let url = API + '/history/' + encodeURIComponent(region) + '/' + itemId + '?entriesToReturn=1800';
      if (entriesUntil != null) url += '&entriesUntil=' + entriesUntil;
      let data;
      try { data = await fetchJsonRetry(url); }
      catch (e) { if (page === 0) throw e; truncated = true; break; } // 第一頁就失敗要讓畫面知道；翻頁途中失敗就用已抓到的（但不存快取）
      const entries = ((data && data.entries) || []).map(function (e) {
        return { pricePerUnit: e.pricePerUnit, quantity: e.quantity, hq: !!e.hq, timestamp: e.timestamp, world: e.worldName || null };
      });
      if (!entries.length) break;
      all = all.concat(entries);
      const earliest = entries[entries.length - 1].timestamp; // Universalis回傳是新到舊排序
      const reachedCutoff = earliest <= cutoff; // 已經翻到涵蓋目標天數了，不用再翻下去
      if (onProgress) onProgress(all.filter(function (h) { return h.timestamp >= cutoff; }), false);
      if (reachedCutoff) break;
      // 注意：這裡「不能」因為這一頁沒滿1800筆就停。Universalis 的第一頁預設只回最近7天的成交，
      // 成交不多的道具7天內可能只有幾十筆（遠不到1800），但7天以前還有資料；只有「往更舊的方向再要一頁卻是空的」才代表真的沒有了。
      if (entriesUntil != null && earliest >= entriesUntil) break; // 保險：翻頁沒有前進，停下來避免無限迴圈
      entriesUntil = earliest - 1;
    }
    if (!truncated) fullHistoryCache[cacheKey] = { time: Date.now(), days: maxDays, all: all };
    return all;
  }

  /* ── 預先計算的市場資料（熱度排行用）──
   * 由 GitHub Actions（.github/workflows/update-market-data.yml）每小時算好，發布在 repo 的
   * market-data 分支，網頁只讀靜態檔案。網址預設從網站自己的網址推算（<帳號>.github.io/<repo>/），
   * 如果你用自訂網域，在載入這支腳本之前設定 window.XIV_MARKET_DATA_BASE = 'https://raw.githubusercontent.com/帳號/repo/market-data/market/' 即可。
   * 回傳 state：
   *   'ok'    有資料（另附 meta、data、ageMs＝資料多舊）
   *   'none'  從來沒有產生過資料（meta.json 404、或網址無法推算）——這是唯一會自動退回即時掃描的情況
   *   'error' 資料存在但這次讀不到（網路問題等）——由畫面決定要不要讓使用者手動改用即時掃描 */
  function deriveMarketDataBase() {
    if (window.XIV_MARKET_DATA_BASE) return String(window.XIV_MARKET_DATA_BASE).replace(/\/?$/, '/');
    const m = /^([^.]+)\.github\.io$/i.exec(window.location.hostname);
    if (!m) return null;
    const repo = window.location.pathname.split('/')[1];
    if (!repo) return null;
    return 'https://raw.githubusercontent.com/' + m[1] + '/' + repo + '/market-data/market/';
  }
  const pcState = { meta: null, metaTime: 0, scopes: {}, scopeGen: {} };
  async function pcGet(url) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return { status: 404 };
      if (!res.ok) return { status: res.status };
      return { status: 200, json: await res.json() };
    } catch (e) { return { status: 0 }; }
  }
  async function loadPrecomputed(scopeKey) {
    const base = deriveMarketDataBase();
    if (!base) return { state: 'none' };
    if (!pcState.meta || Date.now() - pcState.metaTime > 10 * 60 * 1000) {
      const r = await pcGet(base + 'meta.json');
      if (r.status === 404) return { state: 'none' };
      if (r.status === 200) { pcState.meta = r.json; pcState.metaTime = Date.now(); }
      else if (!pcState.meta) return { state: 'error' }; // 讀不到，而且手上沒有舊的可以先用
    }
    const meta = pcState.meta;
    const sc = meta.scopes && meta.scopes[scopeKey];
    if (!sc) return { state: 'error' };
    if (!pcState.scopes[scopeKey] || pcState.scopeGen[scopeKey] !== meta.generatedAtMs) {
      const r = await pcGet(base + sc.file);
      if (r.status !== 200) return { state: 'error' };
      pcState.scopes[scopeKey] = r.json; pcState.scopeGen[scopeKey] = meta.generatedAtMs;
    }
    return { state: 'ok', meta: meta, data: pcState.scopes[scopeKey], ageMs: Date.now() - meta.generatedAtMs };
  }

  async function fetchMostRecentlyUpdated(scopeType, scopeName, entries) {
    await ensureMeta();
    const param = (scopeType === 'world' ? 'world=' : 'dcName=') + encodeURIComponent(scopeName);
    const url = 'https://universalis.app/api/v2/extra/stats/most-recently-updated?' + param + '&entries=' + (entries || 200);
    const data = await fetchJsonRetry(url);
    // 這支端點的正式欄位名稱手上沒有第一手文件可以百分之百確認，這裡對幾種常見寫法都做容錯處理，
    // 拿到的統一都轉成單純的itemId陣列，之後不用管原始格式細節。
    const list = data.items || data.Items || data.uploads || [];
    return list.map(function (it) {
      if (typeof it === 'number' || typeof it === 'string') return it;
      return it.itemID != null ? it.itemID : (it.itemId != null ? it.itemId : null);
    }).filter(function (x) { return x != null; });
  }

  /* ── 熱度排行用：批次查「近48小時成交紀錄」，算出漲跌幅度。
   * 舊版的三個問題（也是「所有世界」常查不到、漲的物品少得可疑的原因）：
   *  1. 用一般端點的 entries=140，只拿「最近140筆」。資料中心範圍成交密集，140筆可能只涵蓋
   *     幾個小時，「24小時內」那一段直接是空的（→整個物品被濾掉），或兩段窗口一模一樣（→0%）。
   *     現在改用 history 端點的 entriesWithin=172800（＝48小時），要的是「時間範圍」不是「筆數」。
   *  2. 請求失敗（限流／逾時）被吞掉，整批20個物品一起消失。現在有重試，最後還是失敗的
   *     會記在 stats.failedChunks，讓畫面能告訴你「結果可能不完整」，也不會被快取。
   *  3. NQ與HQ不分開：目的是找市場商機，能成交的紀錄不論NQ或HQ都算進去一起平均。
   * 時間窗口沿用你的設計：「當前」＝最近24小時內、「近1天」＝最近48小時內（後者包含前者），
   * 都跳過最近1小時（資料還沒穩定）。
   * 熱門道具單次回應可能被筆數上限截斷（實際涵蓋不到48小時），這時窗口等比例縮短
   * （例如只涵蓋到16小時，就變成 0.3~8 小時 vs 0.3~16 小時），結果會標記 approx＝true。 ── */
  const HOT_MIN_SHORT = 3; // 「當前」窗口（24小時內）至少幾筆成交才算數
  const HOT_MIN_LONG = 5;  // 「近1天」窗口（48小時內）至少幾筆成交才算數
  function calcChangeForGroup(entries, now, halfSec, skipSec) {
    let sShort = 0, nShort = 0, sLong = 0, nLong = 0;
    entries.forEach(function (e) {
      const age = now - e.timestamp;
      if (age < skipSec || age >= halfSec * 2) return;
      sLong += e.pricePerUnit; nLong++;
      if (age < halfSec) { sShort += e.pricePerUnit; nShort++; }
    });
    if (nShort < HOT_MIN_SHORT || nLong < HOT_MIN_LONG) return { ok: false, nShort: nShort, nLong: nLong };
    const shortAvg = sShort / nShort, longAvg = sLong / nLong;
    if (!(longAvg > 0)) return { ok: false, nShort: nShort, nLong: nLong };
    return { ok: true, changePct: ((shortAvg - longAvg) / longAvg) * 100, shortAvg: shortAvg, longAvg: longAvg, nShort: nShort, nLong: nLong };
  }
  async function fetchHistoryBatch(itemIds, scopeName, stats) {
    if (!itemIds.length) return {};
    const result = {};
    const CHUNK = 10;      // 每批只放10個物品：48小時的成交筆數在資料中心範圍可能很多，回應太大容易失敗
    const CAP = 800;       // 每個物品最多取幾筆（新到舊）
    const WITHIN = 48 * 3600;
    const chunks = [];
    for (let i = 0; i < itemIds.length; i += CHUNK) chunks.push(itemIds.slice(i, i + CHUNK));
    await Promise.all(chunks.map(async function (chunk) {
      const url = API + '/history/' + encodeURIComponent(scopeName) + '/' + chunk.join(',') +
        '?entriesWithin=' + WITHIN + '&entriesToReturn=' + CAP;
      let data;
      try { data = await fetchJsonRetry(url); }
      catch (e) { if (stats) stats.failedChunks = (stats.failedChunks || 0) + 1; return; }
      const list = chunk.length === 1
        ? (data && data.itemID != null ? [data] : [])
        : Object.keys((data && data.items) || {}).map(function (key) { return data.items[key]; });
      const now = Date.now() / 1000;
      list.forEach(function (entry) {
        if (!entry || entry.itemID == null) return;
        const history = (entry.entries || entry.recentHistory || []).filter(function (h) {
          return h && h.timestamp != null && h.pricePerUnit != null;
        });
        // 回應被筆數上限截斷（筆數達上限）→ 實際涵蓋範圍比48小時短，窗口等比例縮短
        let spanSec = WITHIN;
        let approx = false;
        if (history.length >= CAP) {
          const oldest = history.reduce(function (m, h) { return Math.min(m, h.timestamp); }, now);
          spanSec = Math.max(2 * 3600, Math.min(WITHIN, now - oldest));
          approx = spanSec < WITHIN * 0.98;
        }
        const halfSec = spanSec / 2;
        const skipSec = 0; // 不跳過最近一小時：所有窗口都從「現在」算起，最新的成交也要算進去
        // NQ與HQ不分開：要找的是市場商機，只在意「能成交的價格」有沒有漲跌，
        // 不管成交的是NQ還是HQ，每一筆能成交的紀錄都算進去一起平均。
        const pick = calcChangeForGroup(history, now, halfSec, skipSec);
        if (pick.ok) {
          result[entry.itemID] = { changePct: pick.changePct, shortAvg: pick.shortAvg, longAvg: pick.longAvg,
            nShort: pick.nShort, nLong: pick.nLong, approx: approx, windowHours: Math.round(spanSec / 3600),
            saleCount: history.length };
        } else {
          // 成交筆數不足以判斷漲跌：明確標成「資料不足」，不要假裝是0%
          result[entry.itemID] = { changePct: null, insufficient: true, saleCount: history.length,
            nShort: pick.nShort, nLong: pick.nLong };
        }
      });
    }));
    return result;
  }

  /* ── 指定範圍的批次查價：scopeName可以是資料中心也可以是單一世界。
   * 第2點抓到的bug：熱度排行選單一世界時，原本是拿「整個資料中心最便宜的50筆」再篩出該世界的，
   * 但那個世界自己真正最便宜的掛單，很可能根本擠不進全服前50便宜的名單裡，篩出來的就會是
   * 該世界某個比較貴的掛單（你看到的7094 vs 實際4839就是這樣來的）。直接對那個世界查，
   * 拿到的第一筆才是那個世界真正的最低價。
   * 刻意不共用memCache：那份快取存的是資料中心範圍的結果，跟單一世界的結果不能混用。 ── */
  async function fetchListingsBatchForScope(itemIds, scopeName, stats) {
    if (!itemIds.length) return {};
    await ensureMeta();
    const result = {};
    const CHUNK = 40;
    const chunks = [];
    for (let i = 0; i < itemIds.length; i += CHUNK) chunks.push(itemIds.slice(i, i + CHUNK));
    await Promise.all(chunks.map(async function (chunk) {
      const url = API + '/' + encodeURIComponent(scopeName) + '/' + chunk.join(',') + '?listings=50&entries=0';
      let data;
      try { data = await fetchJsonRetry(url); }
      catch (e) { if (stats) stats.failedChunks = (stats.failedChunks || 0) + 1; return; }
      const list = chunk.length === 1
        ? (data && data.itemID != null ? [data] : [])
        : Object.keys((data && data.items) || {}).map(function (key) { return data.items[key]; });
      list.forEach(function (entry) {
        if (!entry || entry.itemID == null) return;
        result[entry.itemID] = (entry.listings || []).slice().sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
      });
    }));
    return result;
  }

  /* 關注清單專用的批次查價：一次請求最多查 40 個物品（跟 fetchListingsBatchForScope 同一套節流／重試），
   * 但除了最低價，還一併帶回「NQ／HQ 各自最低價」「最低價在哪個世界」「資料更新時間」。
   * 物品頁那條單一物品的查詢（getItemMarketOverview）本來就有這些欄位，批次版本原本把它們丟掉了。
   * 回傳 { 物品ID: { min, minNQ, minHQ, minWorld, lastUpload, worldUploadTimes, worldMins } }；
   * 查得到物品但完全沒有掛單的，min 為 null（畫面上才分得出「沒人在賣」跟「查詢失敗」）。 */
  async function fetchWatchBatch(itemIds, scopeName, stats) {
    const result = {};
    if (!itemIds || !itemIds.length) return result;
    await ensureMeta();
    const CHUNK = 40;
    const chunks = [];
    for (let i = 0; i < itemIds.length; i += CHUNK) chunks.push(itemIds.slice(i, i + CHUNK));
    await Promise.all(chunks.map(async function (chunk) {
      const url = API + '/' + encodeURIComponent(scopeName) + '/' + chunk.join(',') + '?listings=50&entries=0';
      let data;
      try { data = await fetchJsonRetry(url); }
      catch (e) { if (stats) stats.failedChunks = (stats.failedChunks || 0) + 1; return; }
      const list = chunk.length === 1
        ? (data && data.itemID != null ? [data] : [])
        : Object.keys((data && data.items) || {}).map(function (key) { return data.items[key]; });
      list.forEach(function (entry) {
        if (!entry || entry.itemID == null) return;
        const listings = (entry.listings || []).slice().sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
        let minNQ = null, minHQ = null;
        const worldMins = {};
        listings.forEach(function (l) {
          if (l.hq) { if (minHQ == null || l.pricePerUnit < minHQ) minHQ = l.pricePerUnit; }
          else { if (minNQ == null || l.pricePerUnit < minNQ) minNQ = l.pricePerUnit; }
          if (l.worldName && (worldMins[l.worldName] == null || l.pricePerUnit < worldMins[l.worldName])) worldMins[l.worldName] = l.pricePerUnit;
        });
        // API 給的整體最低價涵蓋所有掛單；沒給或是 0 才退回用前 50 筆算出來的
        if (entry.minPriceNQ) minNQ = entry.minPriceNQ;
        if (entry.minPriceHQ) minHQ = entry.minPriceHQ;
        let min = entry.minPrice || (listings.length ? listings[0].pricePerUnit : null);
        if (!min) min = null;
        const cand = [minNQ, minHQ].filter(function (v) { return v != null; });
        if (min == null && cand.length) min = Math.min.apply(null, cand);
        let minWorld = null;
        if (min != null) {
          const hit = listings.find(function (l) { return l.pricePerUnit === min; });
          minWorld = hit ? (hit.worldName || null) : null;
        }
        const worldUploadTimes = {};
        if (entry.worldUploadTimes) Object.keys(entry.worldUploadTimes).forEach(function (id) { worldUploadTimes[worldName(Number(id))] = entry.worldUploadTimes[id]; });
        result[entry.itemID] = {
          min: min, minNQ: minNQ, minHQ: minHQ, minWorld: minWorld,
          lastUpload: entry.lastUploadTime || null, worldUploadTimes: worldUploadTimes, worldMins: worldMins,
        };
      });
    }));
    return result;
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

    // Universalis單次查詢itemId數量上限抓保守值，超過就分批送。
    // 第6/10點：批次縮小（90筆×50個掛單的回應非常大，越大越容易出問題），並且改成平行送出，
    // 不要一批批排隊等——排隊是熱度排行掃描要花好幾分鐘的主因之一。
    const CHUNK = 40;
    const chunks = [];
    for (let i = 0; i < need.length; i += CHUNK) chunks.push(need.slice(i, i + CHUNK));
    await Promise.all(chunks.map(async function (chunk) {
      // 不加 fields 篩選參數：文件雖然列了 fields 這個query參數，但巢狀寫法(listings.worldName)沒有把握
      // 一定被正確解析，一旦解析失敗很可能連 listings 都被濾掉，寧可多拿一點欄位也不要冒資料被砍光的風險。
      const url = API + '/' + encodeURIComponent(settings.dcName) + '/' + chunk.join(',') + '?listings=50&entries=0';
      let data;
      // 以前直接 res.json()，遇到限流（429）回來的不是正常資料，卻會被當成「這批物品都沒有掛單」；
      // 現在統一走 fetchJsonRetry（看狀態碼、暫時性錯誤會等一下再試），最後還是失敗才放棄這一批（不寫入快取）。
      try { data = await fetchJsonRetry(url); } catch (e) { return; }

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
    }));
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

  /* 依全站共用的「買入」取價設定買一批材料（範圍＋基準）：
   *   最低價＋所有世界＝原本的 resolveBuyCosts；最低價＋我的世界＝只看自己世界的掛單；
   *   均價＝用預先計算快照的成交均價（24小時內，沒有就用長窗口均價）×數量，查不到均價的改用掛單。
   * 回傳格式跟 greedyFill 一樣（totalCost 含買方稅5%、filledQty、avgPrice…），呼叫端不用改。 */
  async function resolveBuyCostsByPrefs(needMap) {
    const pf = getPricePrefs();
    const useWorld = pf.buyScope === 'world' && settings.worldName;
    if (pf.buyBasis === 'listing' && !useWorld) return resolveBuyCosts(needMap);
    const ids = Object.keys(needMap).map(Number);
    const out = {};
    let missing = ids;
    if (pf.buyBasis === 'avg') {
      let snap = null;
      try { snap = await loadPrecomputed(useWorld ? settings.worldName : 'ALL'); } catch (e) { snap = null; }
      if (snap && snap.state === 'ok') {
        missing = [];
        ids.forEach(function (id) {
          const row = snap.data.items[id], D = row && row[6], P = row && row[3];
          const avg = avgFromSnapshotRow(row, pf.buyAvgWindow) || (P ? P[4] : null); // 窗口湊不到成交才退回長窗口均價
          if (!avg) { missing.push(id); return; }
          const q = needMap[id], cost = avg * q, tax = cost * BUY_TAX_RATE;
          out[id] = { filledQty: q, totalCost: cost + tax, totalTax: tax, avgPrice: avg, breakdown: [], remainingListings: [], fromAverage: true, resolved: true };
        });
      }
    }
    if (missing.length) {
      const lm = useWorld ? await fetchListingsBatchForScope(missing, settings.worldName) : await fetchListingsBatch(missing);
      missing.forEach(function (id) { out[id] = greedyFill(lm[id] || [], needMap[id]); });
    }
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
      try { data = await fetchJsonRetry(url); } catch (e) { continue; } // 這批查詢失敗（重試後）就跳過，不讓整個功能因為一批失敗而全部掛掉

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
    limsa: '利姆薩·羅敏薩', limsalominsa: '利姆薩·羅敏薩', gridania: '格里達尼亞', uldah: '烏爾達哈',
    ishgard: '伊修加德', kugane: '黃金港', crystarium: '水晶都', oldsharlayan: '舊薩雷安',
    tuliyollal: '圖萊尤拉爾',
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
    const data = await fetchJsonRetry(API + '/tax-rates?world=' + encodeURIComponent(worldNameStr));
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
  function setExcludeOutlierTrades(on) { settings.excludeOutlierTrades = !!on; saveSettings(); }
  /* 排除異常成交（即時查詢這邊用的版本，規則必須跟 scripts/update-market-data.js 的 excludeOutliers 完全一致）：
   * 跟這批成交的中位數比，同時「差距超過 OUTLIER_MIN_DIFF 金」且「超過 OUTLIER_RATIO 倍」才排除。
   * 為什麼是這組數字、為什麼兩邊要一致，說明寫在 scripts/update-market-data.js 同名函式上方，這裡不重複。
   * 少於2筆不判斷，剛好2筆用較便宜的那筆當基準。傳入的是每一筆的 pricePerUnit 陣列。 */
  const OUTLIER_RATIO = 10;      // ⚠️ 改這裡要同步改 scripts/update-market-data.js
  const OUTLIER_MIN_DIFF = 1000; // ⚠️ 改這裡要同步改 scripts/update-market-data.js
  function excludeOutlierEntries(entries, priceOf) {
    if (!settings.excludeOutlierTrades || entries.length < 2) return entries;
    if (entries.length === 2) { // 剛好2筆：跟 scripts/update-market-data.js 的 excludeOutliers 同一套——拿較便宜那筆當基準，另一筆同時符合差距與倍數門檻才排除
      const a = priceOf(entries[0]), b = priceOf(entries[1]);
      const lo = Math.min(a, b), hi = Math.max(a, b);
      if (lo > 0 && hi - lo > OUTLIER_MIN_DIFF && hi / lo > OUTLIER_RATIO) return a <= b ? [entries[0]] : [entries[1]];
      return entries;
    }
    const prices = entries.map(priceOf).slice().sort(function (a, b) { return a - b; });
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
    if (!median) return entries;
    return entries.filter(function (e) {
      const price = priceOf(e);
      const diff = Math.abs(price - median);
      if (diff <= OUTLIER_MIN_DIFF) return true;
      const ratio = price >= median ? price / median : median / price;
      return ratio <= OUTLIER_RATIO;
    });
  }
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
  /* ── 跨服比價：跟 getSellDepth 不一樣，那支只查「單一世界」的掛單明細，這支查「整個資料中心」，
   * 每個世界各抓一筆最低價，給市場頁的物品詳情頁用——玩家想知道「這個資料中心裡，哪個世界最便宜」，
   * 不是「我自己這個世界的深度」。用DC名稱去查Universalis，官方回傳的每筆掛單本來就帶worldName，
   * 直接照世界分組取最低價就好，不用另外對每個世界各發一次請求。 ── */
  /* ── 物品詳情頁的完整市場總覽：一次查詢同時拿到「目前所有掛單」「最近實際成交紀錄」
   * 「目前均價/最低/最高價」——Universalis的一般查價端點其實同時回傳這三種資料，只是
   * 之前entries一直設成0（關掉成交紀錄），才會漏掉這麼多可以顯示的資訊。跟getSellDepth
   * 不一樣的地方：這支查整個資料中心（不侷限單一世界），玩家要看的是全部掛單，不是自己
   * 那個世界的深度。 ── */
  /* 第4點：世界篩選要重新查，不能只是從DC總覽裡篩選——DC總覽本身有掛單筆數上限（只抓全服
   * 最便宜的100筆），篩到單一世界時，那個世界真正的掛單很可能大半都不在這100筆的範圍內，
   * 篩出來的結果會不完整、筆數異常少。改成直接對那個世界重新查一次，拿到它自己完整的掛單。 */
  async function getListingsForWorld(itemId, worldName) {
    await ensureMeta();
    const url = API + '/' + encodeURIComponent(worldName) + '/' + itemId + '?entries=0'; // 不帶 listings 參數＝回傳全部掛單（以前限制100筆，掛單多的物品會被截斷）
    const data = await fetchJsonRetry(url); // 失敗會丟錯，讓畫面能顯示「查詢失敗」而不是「沒有掛單」
    const arr = (data.listings || []).map(function (l) {
      return { world: worldName, pricePerUnit: l.pricePerUnit, quantity: l.quantity, hq: !!l.hq, retainerName: l.retainerName };
    }).sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
    arr.total = data.listingsCount != null ? data.listingsCount : arr.length; // 這個世界的掛單總數
    return arr;
  }

  /* 某個世界自己的最近成交紀錄（「查看最近成交紀錄」選了特定世界時用）。
   * 欄位跟 getItemMarketOverview 的 history 一致，才能共用同一個彈窗。 */
  async function getRecentHistoryForWorld(itemId, worldName, count) {
    await ensureMeta();
    const url = API + '/' + encodeURIComponent(worldName) + '/' + itemId + '?listings=0&entries=' + (count || 50);
    const data = await fetchJsonRetry(url);
    return (data.recentHistory || []).map(function (h) {
      return { world: h.worldName || worldName, pricePerUnit: h.pricePerUnit, quantity: h.quantity, hq: !!h.hq, buyerName: h.buyerName, timestamp: h.timestamp };
    }).sort(function (a, b) { return b.timestamp - a.timestamp; });
  }

  /* 物品詳情頁用：查失敗會丟錯（畫面才分得出「查詢失敗，可重試」跟「真的沒有掛單」）。
   * scopeName 不給＝整個資料中心；給世界名稱＝只查那個世界（均價彈窗選了世界時用）。
   * 另外帶回：listingsCount（這個範圍目前總共有幾筆掛單，判斷手上這100筆是不是全部）、
   * minPriceNQ／minPriceHQ（NQ、HQ 各自的最低價，兩種品質不要混在一起算）。 */
  async function getItemMarketOverviewEx(itemId, scopeName) {
    await ensureMeta();
    const scope = scopeName || settings.dcName;
    if (!scope) return null;
    const url = API + '/' + encodeURIComponent(scope) + '/' + itemId + '?entries=200'; // 不帶 listings 參數＝回傳全部掛單（以前限制100筆，掛單多的物品會被截斷）
    let data;
    try { data = await fetchJsonRetry(url); }
    catch (e) { if (/HTTP 404/.test(String(e && e.message))) return null; throw e; } // 404＝這個道具在市場上沒有資料（例如目前版本找不到的染劑）：交給畫面顯示原本的特例說明，不當成「查詢失敗」
    const listings = (data.listings || []).map(function (l) {
      return { world: l.worldName || (scopeName || null), pricePerUnit: l.pricePerUnit, quantity: l.quantity, hq: !!l.hq, retainerName: l.retainerName };
    }).sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
    const history = (data.recentHistory || []).map(function (h) {
      return { world: h.worldName || (scopeName || null), pricePerUnit: h.pricePerUnit, quantity: h.quantity, hq: !!h.hq, buyerName: h.buyerName, timestamp: h.timestamp };
    }).sort(function (a, b) { return b.timestamp - a.timestamp; });
    // 各世界資料更新時間：API 給的 key 是世界ID，轉成世界名稱方便畫面直接用
    const worldUploadTimes = {};
    if (data.worldUploadTimes) Object.keys(data.worldUploadTimes).forEach(function (id) { worldUploadTimes[worldName(Number(id))] = data.worldUploadTimes[id]; });
    listings.total = data.listingsCount != null ? data.listingsCount : listings.length; // 掛單總數（標籤顯示總數）
    return {
      listings: listings,
      listingsCount: data.listingsCount != null ? data.listingsCount : null,
      history: history,
      avgPrice: data.currentAveragePrice || null,
      minPrice: data.minPrice || null,
      minPriceNQ: data.minPriceNQ || null,
      minPriceHQ: data.minPriceHQ || null,
      maxPrice: data.maxPrice || null,
      lastUploadTime: data.lastUploadTime || null, // 掛單資料的更新時間戳（毫秒），給「資料新鮮度」用
      worldUploadTimes: worldUploadTimes,            // {世界名稱: 更新時間戳(毫秒)}，資料中心查詢時 Universalis 會一併回傳；沒給就是空物件
    };
  }
  /* 舊介面（生產頁等地方在用）：失敗回傳 null，行為不變，只是現在查詢有重試 */
  async function getItemMarketOverview(itemId, scopeName) {
    try { return await getItemMarketOverviewEx(itemId, scopeName); } catch (e) { return null; }
  }

  async function getSellDepth(itemId, worldNameStr) {
    if (!worldNameStr) return null;
    const url = API + '/' + encodeURIComponent(worldNameStr) + '/' + itemId + '?listings=50&entries=0';
    try {
      const data = await fetchJsonRetry(url);
      const listings = (data.listings || []).slice().sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
      return listings.map(function (l) { return { world: worldNameStr, quantity: l.quantity, pricePerUnit: l.pricePerUnit }; });
    } catch (e) { return null; }
  }

  /* ── 銷售速度／近期均價：改用官方的「聚合端點」(aggregated)，這支跟一般查掛單的端點不同——
   * 它是 Universalis 後端已經算好、直接查快取的統計值（不用它自己再掃一次原始listings/history），
   * 回傳「最近4天」實際成交紀錄算出的 dailySaleVelocity（每日賣出幾件）跟 averageSalePrice（平均成交價），
   * 不是用掛單價格去猜的，官方文件也建議只要不需要看到「個別掛單明細」就優先用這支，比原本查價的端點更省。
   *
   * 回傳資料結構官方說明「幾乎每個欄位都可能是 null」（例如太冷門、最近4天完全沒成交），
   * 所以底下每一層都用防呆存取，拿不到就是 null，UI端要自己處理「查無資料」的顯示，不要假設一定有值。
   *
   * 世界／DC都可能有各自的統計值：玩家有選世界時，優先用「世界」層級的數字（跟他實際能看到的市場板一致）；
   * 沒選世界（只選了DC）時，退回用「DC」層級的統計（樣本數更多，但涵蓋整個資料中心，不是單一世界的真實狀況）。
   * usedScope 標記目前用的是哪一層，UI上請務必顯示出來，不要讓玩家誤以為那是自己那個世界的精確數字。 ── */
  async function fetchSaleVelocityBatch(itemIds, regionOverride, stats) {
    if (!itemIds.length) return {};
    await ensureMeta();
    if (!settings.dcName) throw new Error('尚未設定資料中心，請先在設定裡選擇伺服器');

    const now = Date.now();
    const need = [];
    const result = {};
    const queryRegion = regionOverride || settings.worldName || settings.dcName;
    itemIds.forEach(function (id) {
      const cacheKey = queryRegion + ':' + id;
      const hit = velocityCache.get(cacheKey);
      if (hit && now - hit.time < VELOCITY_TTL_MS) { result[id] = hit.data; return; }
      need.push(id);
    });
    if (!need.length) return result;

    function pick(entryHolder) {
      return entryHolder ? entryHolder : null;
    }

    // 跟賣出價的邏輯一致：玩家有選「我的世界」就精準查那個世界，沒選才退回查整個資料中心
    // （DC範圍的統計是好幾個世界混在一起，只能當作沒有更精確資料時的次選，不是首選）。
    const CHUNK = 90;
    for (let i = 0; i < need.length; i += CHUNK) {
      const chunk = need.slice(i, i + CHUNK);
      const url = API + '/aggregated/' + encodeURIComponent(queryRegion) + '/' + chunk.join(',');
      let data;
      try {
        data = await fetchJsonRetry(url);
      } catch (e) {
        console.warn('[XIV] 銷售速度查詢失敗（重試後仍失敗，這一批先跳過）:', e);
        if (stats) stats.failedChunks = (stats.failedChunks || 0) + 1;
        continue;
      }
      (data.results || []).forEach(function (r) {
        const nqWorldVel = r.nq && pick(r.nq.dailySaleVelocity) && pick(r.nq.dailySaleVelocity.world);
        const hqWorldVel = r.hq && pick(r.hq.dailySaleVelocity) && pick(r.hq.dailySaleVelocity.world);
        const nqDcVel = r.nq && pick(r.nq.dailySaleVelocity) && pick(r.nq.dailySaleVelocity.dc);
        const hqDcVel = r.hq && pick(r.hq.dailySaleVelocity) && pick(r.hq.dailySaleVelocity.dc);
        const nqWorldPrice = r.nq && pick(r.nq.averageSalePrice) && pick(r.nq.averageSalePrice.world);
        const hqWorldPrice = r.hq && pick(r.hq.averageSalePrice) && pick(r.hq.averageSalePrice.world);
        const nqDcPrice = r.nq && pick(r.nq.averageSalePrice) && pick(r.nq.averageSalePrice.dc);
        const hqDcPrice = r.hq && pick(r.hq.averageSalePrice) && pick(r.hq.averageSalePrice.dc);

        const hasWorldData = !!(nqWorldVel || hqWorldVel);
        const nqVelocity = nqWorldVel ? nqWorldVel.quantity : (nqDcVel ? nqDcVel.quantity : null);
        const hqVelocity = hqWorldVel ? hqWorldVel.quantity : (hqDcVel ? hqDcVel.quantity : null);
        const nqAvgPrice = nqWorldPrice ? nqWorldPrice.price : (nqDcPrice ? nqDcPrice.price : null);
        const hqAvgPrice = hqWorldPrice ? hqWorldPrice.price : (hqDcPrice ? hqDcPrice.price : null);

        const entry = {
          nqVelocityPerDay: nqVelocity,
          hqVelocityPerDay: hqVelocity,
          totalVelocityPerDay: (nqVelocity || 0) + (hqVelocity || 0),
          nqAvgPrice: nqAvgPrice,
          hqAvgPrice: hqAvgPrice,
          // 世界／DC 都拿不到值時（太冷門、近4天無成交）就是 null，UI要顯示「近期無成交紀錄」而不是0
          usedScope: (nqVelocity != null || hqVelocity != null) ? (hasWorldData ? 'world' : 'dc') : null,
        };
        result[r.itemId] = entry;
        velocityCache.set(queryRegion + ':' + r.itemId, { time: now, data: entry });
      });
      (data.failedItems || []).forEach(function (id) {
        const empty = { nqVelocityPerDay: null, hqVelocityPerDay: null, totalVelocityPerDay: 0, nqAvgPrice: null, hqAvgPrice: null, usedScope: null };
        result[id] = empty;
        velocityCache.set(queryRegion + ':' + id, { time: now, data: empty });
      });
    }
    return result;
  }

  async function fetchSaleVelocity(itemId) {
    const out = await fetchSaleVelocityBatch([Number(itemId)]);
    return out[itemId] || null;
  }

  /* ── 成交均價（全站同一套）──
   * 件數加權：成交總額 ÷ 成交總件數（每一件實際賣多少）。排除異常成交後再算。
   * 預先計算腳本（scripts/update-market-data.js）用同一個定義：sv ÷ sq。 */
  function weightedAvgPrice(list) {
    const clean = excludeOutlierEntries(list || [], function (h) { return h.pricePerUnit; });
    let v = 0, q = 0;
    clean.forEach(function (h) { const n = h.quantity > 0 ? h.quantity : 1; v += h.pricePerUnit * n; q += n; });
    return q > 0 ? Math.round(v / q) : null;
  }
  /* 5個窗口的成交均價（當前＝24小時內、近1天＝48小時內、3天、7天、30天）。
   * 一次抓30天紀錄、窗口都在本地切；同一個物品同一個範圍10分鐘內只抓一次，失敗不存快取。
   * 市場頁、生產頁、供應鏈共用這一份。 */
  const avgWindowsCache = {};
  function getAvgWindows(itemId, scopeWorld) {
    const key = (scopeWorld || 'DC') + '|' + itemId;
    const hit = avgWindowsCache[key];
    if (hit && Date.now() - hit.time < 10 * 60 * 1000) return hit.promise;
    const promise = fetchFullHistory(itemId, 30, scopeWorld || undefined).then(function (full) {
      const now = Date.now() / 1000;
      const inRange = function (a, b) { return full.filter(function (h) { return h.timestamp >= now - b * 3600 && h.timestamp < now - a * 3600; }); };
      const within = function (d) { return full.filter(function (h) { return h.timestamp >= now - d * 86400; }); };
      return { current: weightedAvgPrice(inRange(0, 24)), d1: weightedAvgPrice(inRange(0, 48)), d3: weightedAvgPrice(within(3)), d7: weightedAvgPrice(within(7)), d30: weightedAvgPrice(within(30)) };
    }).catch(function () { delete avgWindowsCache[key]; return null; });
    avgWindowsCache[key] = { time: Date.now(), promise: promise };
    return promise;
  }
  /* 均價比較彈窗的內容（市場頁、生產頁共用）：每列＝標籤＋長條＋數字＋「當前相對這個窗口」的漲跌%。
   * 漲跌色沿用關注抽屜：紅＝當前比這個窗口貴（漲），綠＝便宜（跌）。 */
  function avgWindowRowsHtml(w) {
    const rows = [['當前', w.current, '最近24小時內的成交均價'], ['近1天', w.d1, '最近48小時內（當天＋昨天）的成交均價'], ['近3天', w.d3, '過去3天所有成交的平均'], ['近7天', w.d7, '過去7天所有成交的平均'], ['近30天', w.d30, '過去30天所有成交的平均']];
    const maxV = Math.max.apply(null, rows.map(function (r) { return r[1] || 0; })) || 1;
    return rows.map(function (r, i) {
      let chg = '<em class="mav-chg"></em>';
      if (i > 0 && w.current != null && r[1]) {
        const pct = (w.current - r[1]) / r[1] * 100, abs = Math.abs(pct);
        chg = abs < 0.5 ? '<em class="mav-chg flat">0%</em>' : '<em class="mav-chg ' + (pct > 0 ? 'up' : 'down') + '">' + (pct > 0 ? '+' : '−') + (abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)) + '%</em>';
      }
      return '<div class="mav-row' + (i === 0 ? ' is-now' : '') + '" title="' + r[2] + '"><span class="mav-l">' + r[0] + '</span>' +
        '<span class="mav-bar"><i style="width:' + (r[1] != null ? Math.max(4, r[1] / maxV * 100).toFixed(0) : 0) + '%"></i></span>' +
        '<strong>' + (r[1] != null ? r[1].toLocaleString() : '—') + '</strong><small>金</small>' + chg + '</div>';
    }).join('');
  }

  /* ── 全站共用的「取價設定」：買入／賣出 各自的「範圍」與「基準」──
   *   範圍：dc＝所有世界（整個資料中心）、world＝我的世界
   *   基準：listing＝最低價（掛單）、avg＝成交均價（件數加權）
   * 買入＝材料／要買的東西；賣出＝成品／要賣的東西。製作商機、供應鏈、代幣兌換、生產頁共用同一份，
   * 在任何一處切換，其他處跟著變（用 onPricePrefsChange 訂閱）。存在瀏覽器，沒設定我的世界時範圍一律當作 dc。 */
  /* 均價的「窗口」（取多久的成交來平均）：當前＝最近24小時、近1天＝48小時、近3天、近7天。
   * 預先計算快照每個道具的 row[6] 存了這四個窗口的［成交筆數, 均價］；買入／賣出各自有一個窗口設定（只有基準是均價才有意義）。 */
  const AVG_WINDOW_IDX = { current: [0, 1], '1d': [2, 3], '3d': [4, 5], '7d': [6, 7] };
  const AVG_WINDOW_LIVE_KEY = { current: 'current', '1d': 'd1', '3d': 'd3', '7d': 'd7' }; // getAvgWindows（即時）回傳的欄位名
  const AVG_WINDOW_OPTS = [['current', '當前', '最近24小時的成交均價'], ['1d', '近1天', '最近48小時（當天＋昨天）的成交均價'], ['3d', '近3天', '過去3天所有成交的均價'], ['7d', '近7天', '過去7天所有成交的均價']];
  function avgFromSnapshotRow(row, win) {
    const D = row && row[6], idx = AVG_WINDOW_IDX[win] || AVG_WINDOW_IDX.current;
    return (D && D[idx[0]] > 0 && D[idx[1]] > 0) ? D[idx[1]] : null; // 這個窗口湊不到成交（筆數0）就是 null，呼叫端自己決定怎麼退回
  }
  const PRICE_PREFS_KEY = 'ff14fc-price-prefs-v1';
  const PRICE_PREFS_DEFAULT = { buyScope: 'dc', buyBasis: 'listing', sellScope: 'dc', sellBasis: 'avg', buyAvgWindow: 'current', sellAvgWindow: 'current' };
  let pricePrefs = null;
  const pricePrefListeners = [];
  function loadPricePrefs() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PRICE_PREFS_KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved) { // 第一次：把舊的各自設定帶過來（供應鏈基準、代幣範圍、生產頁範圍）
      saved = {};
      try { const sup = JSON.parse(localStorage.getItem('ff14fc-supply-settings') || 'null'); if (sup && (sup.materialsBasis === 'avg' || sup.materialsBasis === 'listing')) saved.buyBasis = sup.materialsBasis; } catch (e) { /* 沒有就用預設 */ }
      try { if (localStorage.getItem('ff14fc-token-scope') === 'world' || localStorage.getItem('cf-profit-scope') === 'world') saved.sellScope = 'world'; } catch (e) { /* 沒有就用預設 */ }
    }
    if (!saved.buyAvgWindow) { // 以前窗口只有供應鏈自己存一份：帶過來當買入窗口
      try { const sup = JSON.parse(localStorage.getItem('ff14fc-supply-settings') || 'null'); if (sup && AVG_WINDOW_IDX[sup.materialsAvgWindow]) saved.buyAvgWindow = sup.materialsAvgWindow; } catch (e) { /* 沒有就用預設 */ }
    }
    pricePrefs = Object.assign({}, PRICE_PREFS_DEFAULT, saved);
    ['buyAvgWindow', 'sellAvgWindow'].forEach(function (k) { if (!AVG_WINDOW_IDX[pricePrefs[k]]) pricePrefs[k] = 'current'; });
    ['buyScope', 'sellScope'].forEach(function (k) { if (pricePrefs[k] !== 'world') pricePrefs[k] = 'dc'; });
    ['buyBasis', 'sellBasis'].forEach(function (k) { if (pricePrefs[k] !== 'avg') pricePrefs[k] = 'listing'; });
  }
  function getPricePrefs() {
    if (!pricePrefs) loadPricePrefs();
    const p = Object.assign({}, pricePrefs);
    if (!settings.worldName) { p.buyScope = 'dc'; p.sellScope = 'dc'; } // 沒設定我的世界：只能看所有世界
    return p;
  }
  function setPricePrefs(patch) {
    if (!pricePrefs) loadPricePrefs();
    Object.keys(patch).forEach(function (k) { if (k in PRICE_PREFS_DEFAULT) pricePrefs[k] = patch[k]; });
    ['buyAvgWindow', 'sellAvgWindow'].forEach(function (k) { if (!AVG_WINDOW_IDX[pricePrefs[k]]) pricePrefs[k] = 'current'; });
    try { localStorage.setItem(PRICE_PREFS_KEY, JSON.stringify(pricePrefs)); } catch (e) { /* 存不了就只對這次有效 */ }
    pricePrefListeners.slice().forEach(function (fn) { try { fn(getPricePrefs()); } catch (e) { /* 單一訂閱者出錯不影響其他人 */ } });
  }
  function onPricePrefsChange(fn) { pricePrefListeners.push(fn); }
  /* 切換列：[買 範圍｜基準][賣 範圍｜基準]，只畫 sides 指定的那幾邊；「我的世界」按鈕直接顯示世界名稱。
   * 回傳 HTML；事件綁定用 bindPricePrefsBars()（全頁共用一個委派，不用每次重綁）。 */
  function pricePrefsBarHtml(sides, opts) {
    const p = getPricePrefs(), w = settings.worldName;
    const seg = function (key, opts) {
      return '<span class="pp-seg" role="group">' + opts.map(function (o) {
        const dis = o[2] ? ' disabled title="先在右上角設定我的世界"' : '';
        return '<button type="button" class="pp-btn' + (p[key] === o[0] ? ' on' : '') + '" data-pp-key="' + key + '" data-pp-val="' + o[0] + '"' + dis + '>' + o[1] + '</button>';
      }).join('') + '</span>';
    };
    return '<span class="pp-bar">' + (sides || ['buy', 'sell']).map(function (side) {
      return '<span class="pp-side"><span class="pp-lead">' + (side === 'buy' ? '買入' : '賣出') + '</span>' +
        seg(side + 'Scope', [['dc', '所有世界'], ['world', w || '我的世界', !w]]) +
        seg(side + 'Basis', [['listing', '最低價'], ['avg', '均價']]) + '</span>' +
        // opts.windows：基準選「均價」時才出現的窗口選擇（當前／近1天／近3天／近7天）；平常 hidden，由 bindPricePrefsBars 的訂閱切換顯示
        (opts && opts.windows ? '<span class="pp-win" data-pp-side="' + side + '"' + (p[side + 'Basis'] === 'avg' ? '' : ' hidden') + '><span class="pp-lead pp-lead-sub">均價取</span><span class="pp-seg" role="group">' +
          AVG_WINDOW_OPTS.map(function (o) { return '<button type="button" class="pp-btn' + (p[side + 'AvgWindow'] === o[0] ? ' on' : '') + '" data-pp-key="' + side + 'AvgWindow" data-pp-val="' + o[0] + '" title="' + o[2] + '">' + o[1] + '</button>'; }).join('') + '</span></span>' : '');
    }).join('') + '</span>';
  }
  let ppBound = false;
  function bindPricePrefsBars() {
    if (ppBound) return;
    ppBound = true;
    // 用「捕獲階段」接收：供應鏈設定彈窗等地方會擋住事件往上傳（stopPropagation），一般的 click 監聽收不到，按鈕就點不動
    document.addEventListener('click', function (e) {
      const b = e.target.closest && e.target.closest('.pp-btn');
      if (!b || b.disabled) return;
      const patch = {}; patch[b.dataset.ppKey] = b.dataset.ppVal;
      setPricePrefs(patch);
    }, true);
    onPricePrefsChange(function (cur) { // 全頁所有切換列同步亮起目前的選擇
      document.querySelectorAll('.pp-btn').forEach(function (btn) { btn.classList.toggle('on', cur[btn.dataset.ppKey] === btn.dataset.ppVal); });
      document.querySelectorAll('.pp-win').forEach(function (el) { el.hidden = cur[el.dataset.ppSide + 'Basis'] !== 'avg'; });
    });
  }

  /* ── 下拉清單自動貼合可見範圍：往下放不完整（被視窗底部、或外層會捲動／裁切的容器擋住）時，
   * 空間比較大的那一側優先——上方比較大就整個翻到按鈕上方，否則留在下方、把清單高度縮到放得下為止
   * （清單本身會捲動）。玩家不用為了看完選項去拖外層的捲動條。 ── */
  function fitDropdown(wrap, btn, list) {
    list.style.maxHeight = ''; wrap.classList.remove('dd-up');
    let top = 0, bottom = window.innerHeight;
    for (let p = wrap.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowY)) { const pr = p.getBoundingClientRect(); top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom); }
    }
    const br = btn.getBoundingClientRect();
    const below = bottom - br.bottom - 14, above = br.top - top - 14;
    const cssMax = parseFloat(getComputedStyle(list).maxHeight);
    const natural = Math.min(list.scrollHeight + 2, isNaN(cssMax) ? Infinity : cssMax);
    if (natural <= below) return;
    if (above > below && above > 120) { wrap.classList.add('dd-up'); list.style.maxHeight = Math.floor(Math.min(natural, above)) + 'px'; }
    else list.style.maxHeight = Math.max(Math.floor(below), 120) + 'px';
  }
  /* ── 自製下拉：取代瀏覽器原生的灰色下拉（選項列表、邊框、捲動條都改不了），樣式共用關注抽屜的 .wl-dd ──
   * 原本的 <select> 留著（隱藏），選了之後照樣改它的值並觸發 change，原本的程式不用動；
   * 程式之後改 select.value、換 option、改 disabled，按鈕上的字也會跟著更新。 */
  function enhanceSelect(sel) {
    if (!sel || sel._enhanced) return;
    sel._enhanced = true;
    sel.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'wl-dd craft-dd mk-dd';
    wrap.innerHTML = '<button type="button" class="wl-dd-btn" aria-haspopup="listbox" aria-expanded="false"><span></span><i class="ph ph-caret-down"></i></button><div class="wl-dd-list" role="listbox" hidden></div>';
    sel.parentNode.insertBefore(wrap, sel.nextSibling);
    const btn = wrap.querySelector('.wl-dd-btn'), list = wrap.querySelector('.wl-dd-list');
    const close = function () { list.hidden = true; wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
    const render = function () {
      const cur = sel.options[sel.selectedIndex];
      btn.firstElementChild.textContent = cur ? cur.text : '';
      btn.disabled = sel.disabled;
      list.innerHTML = Array.prototype.map.call(sel.options, function (o) {
        return '<button type="button" role="option" class="wl-dd-opt' + (o.selected ? ' on' : '') + '" data-v="' + String(o.value).replace(/"/g, '&quot;') + '">' + o.text + '</button>';
      }).join('');
    };
    render();
    sel._ddRender = render;
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(sel, 'value', { configurable: true, get: function () { return d.get.call(sel); }, set: function (v) { d.set.call(sel, v); render(); } });
    new MutationObserver(render).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const was = !list.hidden;
      document.querySelectorAll('.mk-dd .wl-dd-list').forEach(function (l) { l.hidden = true; l.parentNode.classList.remove('open'); });
      if (!was) { list.hidden = false; wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); const on = list.querySelector('.wl-dd-opt.on'); fitDropdown(wrap, btn, list); if (on) on.scrollIntoView({ block: 'nearest' }); }
    });
    list.addEventListener('click', function (e) {
      const o = e.target.closest('.wl-dd-opt'); if (!o) return;
      e.stopPropagation();
      sel.value = o.dataset.v;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !list.hidden) { close(); e.stopPropagation(); } }, true);
  }
  /* 市場頁所有 id 以 mk- 開頭的下拉（設定、走勢、供應鏈、計算器…）自動換成自製下拉，之後動態產生的也會處理 */
  let selectWatcher = null;
  function autoEnhanceSelects() {
    if (selectWatcher) return;
    const scan = function (root) {
      (root.querySelectorAll ? root.querySelectorAll('select[id^="mk-"]') : []).forEach(function (s) { if (s.id !== 'mk-world-filter') enhanceSelect(s); });
      if (root.matches && root.matches('select[id^="mk-"]') && root.id !== 'mk-world-filter') enhanceSelect(root);
    };
    scan(document);
    selectWatcher = new MutationObserver(function (muts) { muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); }); });
    selectWatcher.observe(document.body, { childList: true, subtree: true });
  }

  /* 買方稅：不管在哪個城市買，買家一律固定 5%（賣方稅才依城市不同）。畫面上所有「買」的總價估算都用這個數字。 */
  const BUY_TAX_RATE = 0.05;
  return {
    buyTaxRate: BUY_TAX_RATE,
    enhanceSelect: enhanceSelect, fitDropdown: fitDropdown, autoEnhanceSelects: autoEnhanceSelects,
    resolveBuyCostsByPrefs: resolveBuyCostsByPrefs,
    avgFromSnapshotRow: avgFromSnapshotRow, AVG_WINDOW_LIVE_KEY: AVG_WINDOW_LIVE_KEY, getPricePrefs: getPricePrefs, setPricePrefs: setPricePrefs, onPricePrefsChange: onPricePrefsChange, pricePrefsBarHtml: pricePrefsBarHtml, bindPricePrefsBars: bindPricePrefsBars,
    weightedAvgPrice: weightedAvgPrice,
    getAvgWindows: getAvgWindows,
    avgWindowRowsHtml: avgWindowRowsHtml,
    greedyFill: greedyFill,
    getItemMarketOverviewEx: getItemMarketOverviewEx,
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
    setExcludeOutlierTrades: setExcludeOutlierTrades,
    excludeOutlierEntries: excludeOutlierEntries,
    getSellDepth: getSellDepth,
    fetchListingsBatch: fetchListingsBatch,
    fetchListingsBatchForScope: fetchListingsBatchForScope,
    fetchWatchBatch: fetchWatchBatch,
    fetchMostRecentlyUpdated: fetchMostRecentlyUpdated,
    fetchFullHistory: fetchFullHistory,
    dcSelectorVisible: DC_SELECTOR_VISIBLE,
    lockedDc: LOCKED_DC,
    getListingsForWorld: getListingsForWorld,
    getRecentHistoryForWorld: getRecentHistoryForWorld,
    loadPrecomputed: loadPrecomputed,
    fetchHistoryBatch: fetchHistoryBatch,
    getItemMarketOverview: getItemMarketOverview,
    fetchSaleVelocity: fetchSaleVelocity,
    fetchSaleVelocityBatch: fetchSaleVelocityBatch,
  };
})();
