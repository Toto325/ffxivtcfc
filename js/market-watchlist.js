/* market-watchlist.js — 市場頁「關注清單」
 *
 * 設計重點（輕度玩家只看價格、重度玩家要細節，但畫面不能亂）：
 *  - 預設只有「物品／最低價／漲跌／更新時間」。其餘資訊（成交均價、賣速、跨服差價、製作成本…）
 *    由使用者在「設定」選欄位，或點開某一列的展開面板才看到，而且展開面板只列「還沒顯示在欄位上」的資訊。
 *  - 右側抽屜（跟生產頁「圖譜材料／批次規劃」同一套互動），預設窄版；頂端按鈕可展開成寬版表格。
 *  - 價格資料兩段式：先用每小時預先計算的資料（瞬間出現，均價／賣速也從這裡來），
 *    再用即時批次查詢補上最新最低價與資料更新時間。
 *  - 本機儲存（localStorage），沿用舊版清單的 key（ff14fc-market-watchlist），舊資料不會消失。
 *
 * 這個檔案不依賴 market-panel.js 的內部函式，需要的東西（物品名稱、圖示、開啟物品頁、製作成本）
 * 全部由 market-panel.js 呼叫 MarketWatchlist.init(bridge) 時提供。 */
(function () {
  'use strict';

  var WATCH_KEY = 'ff14fc-market-watchlist';        // 沿用舊版，格式向下相容
  var NOTIFY_KEY = 'ff14fc-market-watch-notify';    // 沿用舊版：'1' 代表使用者開過通知
  var PREFS_KEY = 'ff14fc-watch-prefs';
  var SEEN_KEY = 'ff14fc-watch-seen';               // 「上次關閉清單時」的價格，用來算漲跌
  var ALERT_KEY = 'ff14fc-watch-alert';             // 每個物品目前是否已在目標價以下，避免重複通知

  var STALE_WARN = 6 * 3600 * 1000;                 // 資料超過 6 小時：橘色（跟物品頁一致）
  var STALE_BAD = 24 * 3600 * 1000;                 // 超過 1 天：紅色
  var ALERT_COOLDOWN = 30 * 60 * 1000;              // 同一物品兩次通知至少間隔 30 分鐘
  var PC_MAX_AGE = 24 * 3600 * 1000;                // 預先計算資料超過 24 小時就不採用（跟物品頁一致）
  var D_IDX = { current: [0, 1], '1d': [2, 3], '3d': [4, 5], '7d': [6, 7] }; // 跟 market-panel.js 的 D_WINDOW_IDX 同一套
  var AVG_LABEL = { current: '24小時', '1d': '近1天', '3d': '近3天', '7d': '近7天' };
  var AVG_KEYS = ['current', '1d', '3d', '7d'];
  var PRESET_TAGS = ['想買', '轉賣', '素材'];
  var COLS = { change: '漲跌', updated: '更新時間', avg: '成交均價', vel: '賣速', freq: '成交頻率', spread: '跨服差價', cost: '製作成本' };
  var COL_UNIT = { change: '%', avg: '金', vel: '件/天', freq: '筆/天', spread: '金', cost: '金' }; // 欄名旁邊的單位
  var COL_ORDER = ['change', 'updated', 'avg', 'vel', 'freq', 'spread', 'cost'];
  var EXTRA_COLS = ['avg', 'vel', 'freq', 'spread', 'cost']; // 這幾欄只在寬版顯示，窄版放不下
  var SORTS = [
    ['default', '預設（加入順序）'], ['name', '名稱'], ['priceAsc', '價格低→高'], ['priceDesc', '價格高→低'],
    ['drop', '跌幅最大'], ['rise', '漲幅最大'], ['cheap', '低於均價最多'], ['dear', '高於均價最多'],
    ['vel', '賣速高→低'], ['freq', '成交頻率高→低'],
  ];

  var bridge = null;
  var list = [];
  var prefs = {};
  var seen = {};
  var alertState = {};
  var live = { dc: {}, world: {} };   // 即時查價結果：scope -> { 物品ID: {...} }
  var pcCache = {};                   // 預先計算資料：scopeKey -> { items }
  var costCache = {};                 // 物品ID -> { state: 'loading'|'ok'|'none', craft }
  var expanded = {};                  // 物品ID -> true（展開面板）
  var focusTarget = null;             // 打開後要聚焦「目標價」輸入框的物品
  var els = {};
  var refreshing = false, needAgain = null, lastRefreshAt = 0, lastRefreshState = 'idle';
  var timer = null, dirty = false, globalBound = false, lastSig = '';
  var listeners = {};
  var toastTimer = null, sceneObserver = null, fabFrame = null, fabRO = null;

  /* ───────────── 小工具 ───────────── */
  function readJson(key, fb) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fb : v; } catch (e) { return fb; } }
  function writeJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 存不了就算了，不影響其他功能 */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function trim2(x) { return String(Math.round(x * 100) / 100); }
  function compactGil(n) { return n >= 1e8 ? trim2(n / 1e8) + '億' : trim2(n / 1e4) + '萬'; }
  function fmt(n) { return n == null ? '—' : (n >= 1e7 ? compactGil(n) : Math.round(n).toLocaleString('zh-TW')); }
  function fmtFull(n) { return Math.round(n).toLocaleString('zh-TW'); }
  function fmtVel(x) { x = x || 0; return x >= 1 ? x.toFixed(1) : (x > 0 ? x.toFixed(2) : '0'); }
  function fmtPct(p) { var a = Math.abs(p); return (a >= 10 ? String(Math.round(a)) : a.toFixed(1)) + '%'; }
  function agoText(ms) {
    var diff = (Date.now() - ms) / 1000;
    if (diff < 3600) return Math.max(1, Math.round(diff / 60)) + '分前';
    if (diff < 86400) return Math.round(diff / 3600) + '時前';
    return Math.round(diff / 86400) + '天前';
  }
  function staleClass(ms) { var d = Date.now() - ms; return d > STALE_BAD ? 'bad' : (d > STALE_WARN ? 'warn' : ''); }
  function parseGil(str) { // 空字串 → null（代表清除）；格式錯誤 → NaN
    str = String(str || '').replace(/[,，\s]/g, '').replace(/金$/, '');
    if (!str) return null;
    var m = /^(\d+(?:\.\d+)?)(萬|万|億|亿|k|K|m|M)?$/.exec(str);
    if (!m) return NaN;
    var n = Number(m[1]), u = m[2];
    if (u === '萬' || u === '万') n *= 1e4; else if (u === '億' || u === '亿') n *= 1e8; else if (u === 'k' || u === 'K') n *= 1e3; else if (u === 'm' || u === 'M') n *= 1e6;
    n = Math.round(n);
    return n > 0 ? n : NaN;
  }
  function numCmp(a, b, dir) { if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1; return (a - b) * dir; }

  /* ───────────── 狀態讀寫 ───────────── */
  function defaultPrefs() {
    return { view: 'table', wide: false, scope: 'dc', cols: ['change', 'updated'], avgWin: 'current', sort: 'default', pinHit: false, tag: '', auto: true, interval: 5 };
  }
  function loadState() {
    var raw = readJson(WATCH_KEY, []);
    list = (Array.isArray(raw) ? raw : []).filter(function (w) { return w && w.itemId != null; }).map(function (w) {
      var t = Number(w.targetPrice);
      return {
        itemId: String(w.itemId), name: w.name || '',
        targetPrice: (w.targetPrice != null && isFinite(t) && t > 0) ? t : null,
        targetDir: w.targetDir === 'above' ? 'above' : 'below', // below＝降到目標價以下提醒（買）；above＝漲到目標價以上提醒（賣）
        tags: Array.isArray(w.tags) ? w.tags.filter(Boolean).map(String) : [],
        addedAt: w.addedAt || 0,
      };
    });
    prefs = Object.assign(defaultPrefs(), readJson(PREFS_KEY, {}));
    if (!Array.isArray(prefs.cols)) prefs.cols = defaultPrefs().cols;
    prefs.cols = prefs.cols.filter(function (c) { return COLS[c]; });
    if (!D_IDX[prefs.avgWin]) prefs.avgWin = 'current';
    if (!SORTS.some(function (x) { return x[0] === prefs.sort; })) prefs.sort = 'default'; // 舊版的「資料最舊」已移除
    seen = readJson(SEEN_KEY, {});
    alertState = readJson(ALERT_KEY, {});
  }
  function saveList() { writeJson(WATCH_KEY, list); }
  function savePrefs() { writeJson(PREFS_KEY, prefs); }
  function find(id) { id = String(id); for (var i = 0; i < list.length; i++) if (list[i].itemId === id) return list[i]; return null; }

  /* ───────────── 範圍／設定 ───────────── */
  function st() { return (bridge && bridge.settings && bridge.settings()) || {}; }
  function hasWorld() { return !!st().worldName; }
  function effScope() { return (prefs.scope === 'world' && hasWorld()) ? 'world' : 'dc'; }
  function scopePcKey(scope) { return scope === 'world' ? st().worldName : 'ALL'; }
  function displayName(w) { return (bridge && bridge.name && bridge.name(w.itemId)) || w.name || ('#' + w.itemId); }
  function isWide() { return !!prefs.wide && window.innerWidth >= 720; }
  function visibleCols() {
    var wide = isWide();
    return COL_ORDER.filter(function (k) { return prefs.cols.indexOf(k) >= 0 && (wide || EXTRA_COLS.indexOf(k) < 0); });
  }

  /* ───────────── 價格資料 ───────────── */
  function ensurePc(scope) {
    var key = scopePcKey(scope);
    if (!key || typeof MarketData === 'undefined' || !MarketData.loadPrecomputed) return Promise.resolve(null);
    return MarketData.loadPrecomputed(key).then(function (r) {
      if (r && r.state === 'ok' && r.ageMs <= PC_MAX_AGE) { pcCache[key] = { items: (r.data && r.data.items) || {}, ageMs: r.ageMs }; return pcCache[key]; }
      pcCache[key] = null; return null;
    }).catch(function () { pcCache[key] = null; return null; });
  }
  function pcRow(scope, id) { var c = pcCache[scopePcKey(scope)]; return (c && c.items && c.items[id]) || null; }

  function priceInfo(id, scope) {
    var L = live[scope] && live[scope][id];
    if (L) {
      var upload = null;
      if (scope === 'dc' && L.minWorld && L.worldUploadTimes && L.worldUploadTimes[L.minWorld]) upload = L.worldUploadTimes[L.minWorld];
      else upload = L.lastUpload || null;
      return { src: 'live', min: L.min, nq: L.minNQ, hq: L.minHQ, world: L.minWorld, upload: upload, L: L };
    }
    var row = pcRow(scope, id);
    if (row && row[2] != null) return { src: 'cache', min: row[2], nq: row[7] ? row[7][0] : null, hq: row[7] ? row[7][1] : null, world: null, upload: null };
    return null;
  }
  function qualTag(p) {
    if (!p) return '';
    if (p.nq != null && p.hq != null) return p.hq < p.nq ? 'HQ' : 'NQ';
    if (p.hq != null) return 'HQ';
    return '';
  }
  function avgOfRow(row, win) {
    var D = row && row[6], ix = D_IDX[win];
    if (D && ix && D[ix[0]] > 0 && D[ix[1]] != null) return { v: D[ix[1]], n: D[ix[0]] };
    return null;
  }
  function seenKey(scope, id) { return scope + ':' + id; }
  function changeInfo(id, scope, price) {
    var s = seen[seenKey(scope, id)];
    if (!s || price == null || !s.p) return null;
    var d = price - s.p;
    return { dir: d === 0 ? 0 : (d > 0 ? 1 : -1), pct: d / s.p * 100, prev: s.p, t: s.t };
  }
  function isReached(w, price) {
    if (w.targetPrice == null || price == null) return false;
    return w.targetDir === 'above' ? price >= w.targetPrice : price <= w.targetPrice;
  }

  function model(w) {
    var scope = effScope(), id = w.itemId;
    var marketable = !bridge || !bridge.isMarketable || bridge.isMarketable(id);
    var p = marketable ? priceInfo(id, scope) : null;
    var row = marketable ? pcRow(scope, id) : null;
    var price = p ? p.min : null;
    var avg = avgOfRow(row, prefs.avgWin);
    var vel = row ? { nq: row[0] || 0, hq: row[1] || 0 } : null;
    var freq = (row && bridge.txnFreq) ? bridge.txnFreq(row) : null; // 筆/天，跟熱度排行、代幣兌換同一套定義
    return {
      w: w, id: id, name: displayName(w), scope: scope, marketable: marketable, p: p, row: row, price: price,
      noListing: !!(p && p.src === 'live' && p.min == null),
      qual: qualTag(p),
      change: (p && p.src === 'live') ? changeInfo(id, scope, price) : null,
      avg: avg, avgDiff: (avg && price != null) ? (price - avg.v) / avg.v * 100 : null,
      vel: vel, freq: freq, reached: isReached(w, price),
    };
  }
  function spreadInfo(id) {
    if (!hasWorld()) return null;
    var d = live.dc[id], w = live.world[id];
    if (!d || !w || d.min == null || w.min == null) return null;
    return { world: w.min, dc: d.min, pct: (w.min - d.min) / d.min * 100, dcWorld: d.minWorld };
  }
  function ensureCost(id) {
    if (costCache[id] || !bridge || !bridge.craftInfo) return;
    costCache[id] = { state: 'loading' };
    Promise.resolve(bridge.craftInfo(id)).then(function (r) {
      costCache[id] = (r && r.craftable && r.craft != null) ? { state: 'ok', craft: r.craft } : { state: 'none' };
      scheduleRender();
    }).catch(function () { costCache[id] = { state: 'none' }; scheduleRender(); });
  }

  /* ───────────── 查價 ───────────── */
  function mergeLive(scope, ids, map) {
    ids.forEach(function (id) {
      var e = map[String(id)];
      if (e) live[scope][String(id)] = Object.assign({ fetchedAt: Date.now() }, e);
    });
  }
  function refresh(opts) {
    opts = opts || {};
    if (!bridge || typeof MarketData === 'undefined' || !MarketData.fetchWatchBatch) return Promise.resolve();
    if (refreshing) { needAgain = needAgain && !needAgain.targetsOnly ? needAgain : opts; return Promise.resolve(); }
    var s = st();
    if (!s.dcName) { lastRefreshState = 'nodc'; renderStatus(); return Promise.resolve(); }
    var items = list.filter(function (w) {
      if (bridge.isMarketable && !bridge.isMarketable(w.itemId)) return false;
      if (opts.targetsOnly && w.targetPrice == null) return false;
      if (opts.ids && opts.ids.indexOf(w.itemId) < 0) return false;
      return true;
    });
    var ids = items.map(function (w) { return Number(w.itemId); });
    if (!ids.length) { lastRefreshState = 'ok'; renderStatus(); updateBadge(); return Promise.resolve(); }

    refreshing = true; lastRefreshState = 'loading'; renderStatus();
    var scope = effScope();
    var wantSpread = prefs.cols.indexOf('spread') >= 0 && !!s.worldName;
    var needDc = scope === 'dc' || wantSpread;
    var needWorld = (scope === 'world' || wantSpread) && !!s.worldName;
    var stats = { failedChunks: 0 };
    var jobs = [ensurePc(scope).then(function () { scheduleRender(); updateBadge(); })];
    if (needDc) jobs.push(MarketData.fetchWatchBatch(ids, s.dcName, stats).then(function (m) { mergeLive('dc', ids, m); }));
    if (needWorld) jobs.push(MarketData.fetchWatchBatch(ids, s.worldName, stats).then(function (m) { mergeLive('world', ids, m); }));
    return Promise.all(jobs).then(function () {
      lastRefreshAt = Date.now();
      lastRefreshState = stats.failedChunks ? 'partial' : 'ok';
      seedSeen(); checkAlerts();
    }).catch(function () { lastRefreshState = 'fail'; }).then(function () {
      refreshing = false;
      scheduleRender(); renderStatus(); updateBadge();
      if (needAgain) { var o = needAgain; needAgain = null; refresh(o); }
    });
  }
  function missingData() {
    var sc = effScope();
    return list.some(function (w) { return (!bridge.isMarketable || bridge.isMarketable(w.itemId)) && !(live[sc] && live[sc][w.itemId]); });
  }

  /* 「上次關閉清單時」的價格：關閉抽屜時存下來，下次打開就能看到這段時間的漲跌 */
  function seedSeen() {
    var sc = effScope(), now = Date.now(), changed = false;
    list.forEach(function (w) {
      var p = priceInfo(w.itemId, sc), k = seenKey(sc, w.itemId);
      if (p && p.src === 'live' && p.min != null && !seen[k]) { seen[k] = { p: p.min, t: now }; changed = true; }
    });
    if (changed) writeJson(SEEN_KEY, seen);
  }
  function commitSeen() {
    var sc = effScope(), now = Date.now(), changed = false;
    list.forEach(function (w) {
      var p = priceInfo(w.itemId, sc);
      if (p && p.src === 'live' && p.min != null) { seen[seenKey(sc, w.itemId)] = { p: p.min, t: now }; changed = true; }
    });
    if (changed) writeJson(SEEN_KEY, seen);
  }

  /* ───────────── 通知（只在剛跨過目標價的那一刻通知一次） ───────────── */
  function notifyEnabled() {
    try { return localStorage.getItem(NOTIFY_KEY) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted'; } catch (e) { return false; }
  }
  function fireNotification(w, price) {
    if (!notifyEnabled()) return;
    try {
      var n = new Notification('市場關注・' + displayName(w), {
        body: '現在最低 ' + fmtFull(price) + ' 金，' + (w.targetDir === 'above' ? '已高於目標價（' : '已降到目標價（') + fmtFull(w.targetPrice) + ' 金）' + (w.targetDir === 'above' ? '' : '以下'), tag: 'ff14-watch-' + w.itemId,
      });
      n.onclick = function () { try { window.focus(); } catch (e) { /* 忽略 */ } openDrawer(); try { n.close(); } catch (e2) { /* 忽略 */ } };
    } catch (e) { /* 通知被擋掉就算了 */ }
  }
  function checkAlerts() {
    var sc = effScope(), now = Date.now(), changed = false;
    list.forEach(function (w) {
      if (w.targetPrice == null) return;
      var p = priceInfo(w.itemId, sc);
      if (!p || p.src !== 'live' || p.min == null) return; // 只用即時資料判斷，不拿每小時快取亂通知
      var cur = alertState[w.itemId] || { below: false, t: 0 };
      var below = isReached(w, p.min); // 欄位名沿用 below，意思是「目前是否已達標」
      if (below && !cur.below) {
        if (now - cur.t > ALERT_COOLDOWN) { fireNotification(w, p.min); alertState[w.itemId] = { below: true, t: now }; }
        else alertState[w.itemId] = { below: true, t: cur.t };
        changed = true;
      } else if (!below && cur.below) { alertState[w.itemId] = { below: false, t: cur.t }; changed = true; }
    });
    if (changed) writeJson(ALERT_KEY, alertState);
  }

  /* ───────────── 自動刷新 ───────────── */
  function isOpen() { return !!(els.drawer && els.drawer.classList.contains('open')); }
  function hasTargets() { return list.some(function (w) { return w.targetPrice != null; }); }
  function tick() {
    if (!bridge || !list.length) return;
    if (isOpen()) { refresh({}); return; }
    if (document.hidden && !notifyEnabled()) return;
    if (hasTargets()) refresh({ targetsOnly: true });
  }
  function startTimer() {
    if (timer) { clearInterval(timer); timer = null; }
    if (!prefs.auto) return;
    timer = setInterval(tick, Math.max(1, Number(prefs.interval) || 5) * 60 * 1000);
  }

  /* ───────────── 對外：新增／移除／查詢 ───────────── */
  function fireChange() { Object.keys(listeners).forEach(function (k) { try { listeners[k](); } catch (e) { /* 單一監聽器出錯不影響其他 */ } }); }
  function onChange(key, fn) { listeners[key] = fn; }
  function has(id) { return !!find(id); }
  function count() { return list.length; }
  function afterListChanged(newIds) {
    saveList();
    if (els.drawer) { renderHead(); renderTagbar(); scheduleRender(); }
    updateBadge();
    if (newIds && newIds.length && isOpen()) refresh({ ids: newIds });
    fireChange();
  }
  function add(itemId, name, target, opts) {
    itemId = String(itemId);
    if (find(itemId)) return;
    var t = Number(target);
    list.push({ itemId: itemId, name: name || '', targetPrice: (target != null && isFinite(t) && t > 0) ? t : null, targetDir: 'below', tags: [], addedAt: Date.now() });
    afterListChanged([itemId]);
    if (opts && opts.toast) toast('已加入關注清單', '設定目標價', function () { openDrawer({ focusId: itemId }); });
  }
  function remove(itemId) {
    itemId = String(itemId);
    var n = list.length;
    list = list.filter(function (w) { return w.itemId !== itemId; });
    if (list.length === n) return;
    delete expanded[itemId]; delete alertState[itemId]; delete costCache[itemId];
    ['dc', 'world'].forEach(function (sc) { delete seen[seenKey(sc, itemId)]; });
    writeJson(SEEN_KEY, seen); writeJson(ALERT_KEY, alertState);
    afterListChanged();
  }
  function toggle(itemId, name) { if (has(itemId)) { remove(itemId); return false; } add(itemId, name, null, { toast: true }); return true; }
  function setTarget(id, value, dir) {
    var w = find(id); if (!w) return;
    w.targetPrice = value;
    if (dir) w.targetDir = dir;
    delete alertState[w.itemId]; writeJson(ALERT_KEY, alertState); // 目標價改了，重新判斷是否要通知
    saveList(); checkAlerts(); updateBadge(); scheduleRender(); fireChange();
  }
  function addTag(id, tag) {
    var w = find(id); tag = String(tag || '').trim().slice(0, 12);
    if (!w || !tag || w.tags.indexOf(tag) >= 0) return;
    w.tags.push(tag); saveList(); renderTagbar(); scheduleRender();
  }
  function delTag(id, tag) {
    var w = find(id); if (!w) return;
    w.tags = w.tags.filter(function (t) { return t !== tag; });
    if (prefs.tag === tag && !allTags().length) { prefs.tag = ''; savePrefs(); }
    saveList(); renderTagbar(); scheduleRender();
  }
  function allTags() {
    var seenT = {}, out = [];
    list.forEach(function (w) { w.tags.forEach(function (t) { if (!seenT[t]) { seenT[t] = 1; out.push(t); } }); });
    return out;
  }
  function onSettingsChanged() {
    var s = st(), sig = (s.dcName || '') + '|' + (s.worldName || '');
    if (sig === lastSig) return;
    var first = lastSig === '';
    lastSig = sig;
    if (first) return;
    live = { dc: {}, world: {} }; pcCache = {}; costCache = {};
    if (els.drawer) renderAll();
    if (isOpen()) refresh({}); else if (hasTargets()) refresh({ targetsOnly: true });
  }

  /* ───────────── 畫面：區塊 HTML ───────────── */
  function nameBlock(m, iconSize) {
    var w = m.w, sub = [];
    if (m.reached) sub.push('<span class="wl-pill ok"><i class="ph ph-check-circle"></i>達標</span>');
    if (w.targetPrice != null) sub.push('<span class="wl-pill" title="' + (w.targetDir === 'above' ? '高於' : '低於') + '這個價格時提醒"><i class="ph ph-bell-ringing"></i>' + (w.targetDir === 'above' ? '≥ ' : '≤ ') + fmt(w.targetPrice) + '</span>');
    w.tags.forEach(function (t) { sub.push('<span class="wl-pill tag">' + esc(t) + '</span>'); });
    return '<div class="wl-cell wl-name">' + (bridge.icon ? bridge.icon(m.id, iconSize || 24) : '') +
      '<div class="wl-name-text"><div class="wl-name-line"><a class="wl-name-link" data-act="open" title="開啟物品頁">' + esc(m.name) + '</a></div>' +
      (sub.length ? '<div class="wl-sub">' + sub.join('') + '</div>' : '') + '</div></div>';
  }
  function priceBlock(m, noWorld) {
    var inner;
    if (!m.marketable) inner = '<span class="wl-dim" title="這個物品不能在市場交易">不可交易</span>';
    else if (m.noListing) inner = '<span class="wl-dim">無掛單</span>';
    else if (m.price == null) inner = refreshing ? '<span class="wl-skel"></span>' : '<span class="wl-dim">—</span>';
    else {
      var worldTxt = '';
      if (noWorld) worldTxt = '';
      else if (m.p.src === 'live' && m.scope === 'dc' && m.p.world) worldTxt = '<span class="wl-world" title="目前最低價所在的伺服器">' + esc(m.p.world) + '</span>';
      else if (m.p.src === 'cache') worldTxt = '<span class="wl-world cache" title="這是每小時預先計算的資料，即時價格載入中或查詢失敗">快取</span>';
      inner = '<span class="wl-price-top"><b class="wl-price-num' + (m.reached ? ' is-reached' : '') + '" title="' + fmtFull(m.price) + ' 金">' + fmt(m.price) + '</b>' +
        (m.qual ? '<span class="wl-q ' + m.qual.toLowerCase() + '" title="這個價格是' + m.qual + '品質">' + m.qual + '</span>' : '') + '</span>' + worldTxt;
    }
    return '<div class="wl-cell wl-price' + (noWorld ? ' compact' : '') + '">' + inner + '</div>';
  }
  function changeBlock(m) {
    var c = m.change, inner = '<span class="wl-dim">·</span>', title = '';
    if (c) {
      title = '對比你上次關閉清單時（' + agoText(c.t) + '）的價格 ' + fmtFull(c.prev) + ' 金';
      if (c.dir === 0) inner = '<span class="wl-chg flat">持平</span>';
      else inner = '<span class="wl-chg ' + (c.dir < 0 ? 'down' : 'up') + '">' + (c.dir < 0 ? '▼' : '▲') + fmtPct(c.pct) + '</span>';
    }
    return '<div class="wl-cell wl-chgcell" title="' + esc(title) + '">' + inner + '</div>';
  }
  function updatedBlock(m) {
    var inner = '<span class="wl-dim">—</span>', title = '';
    if (m.p && m.p.upload) { inner = '<span class="wl-ago ' + staleClass(m.p.upload) + '">' + agoText(m.p.upload) + '</span>'; title = '這個價格的資料最後上傳時間（超過 6 小時橘色、超過 1 天紅色）'; }
    else if (m.p && m.p.src === 'cache') { inner = '<span class="wl-dim">快取</span>'; title = '每小時預先計算的資料'; }
    return '<div class="wl-cell" title="' + title + '">' + inner + '</div>';
  }
  function avgBlock(m) {
    if (!m.avg) return '<div class="wl-cell" title="這段時間成交太少，不顯示"><span class="wl-dim">—</span></div>';
    var d = m.avgDiff, diffHtml = '';
    if (d != null && Math.abs(d) >= 1) diffHtml = '<small class="' + (d < 0 ? 'cheap' : 'dear') + '">' + (d < 0 ? '低' : '高') + fmtPct(d) + '</small>';
    return '<div class="wl-cell wl-stack" title="' + AVG_LABEL[prefs.avgWin] + '成交均價 ' + fmtFull(m.avg.v) + ' 金（' + m.avg.n + ' 筆成交）"><span>' + fmt(m.avg.v) + '</span>' + diffHtml + '</div>';
  }
  function velBlock(m) {
    if (!m.vel || (m.vel.nq + m.vel.hq) === 0) return '<div class="wl-cell" title="近期沒有成交"><span class="wl-dim">—</span></div>';
    return '<div class="wl-cell" title="每天賣出幾件（NQ・HQ）">' + fmtVel(m.vel.nq) + ' <span class="wl-dim">·</span> ' + fmtVel(m.vel.hq) + '</div>';
  }
  function freqBlock(m) {
    if (!m.row || m.freq == null) return '<div class="wl-cell"><span class="wl-dim">—</span></div>';
    if (!(m.freq > 0)) return '<div class="wl-cell" title="近30天成交不到5筆，筆數太少算不出可靠的頻率（不代表完全沒有成交）"><span class="wl-dim">&lt;5筆/月</span></div>';
    return '<div class="wl-cell" title="近30天平均每天成交幾筆">' + m.freq.toFixed(2) + '</div>';
  }
  function spreadBlock(m) {
    if (!hasWorld()) return '<div class="wl-cell" title="請先在上方「設定」選擇我的世界"><span class="wl-dim">—</span></div>';
    var s = spreadInfo(m.id);
    if (!s) return '<div class="wl-cell"><span class="wl-dim">' + (refreshing ? '⋯' : '—') + '</span></div>';
    if (s.pct < 0.5) return '<div class="wl-cell" title="我的世界就是所有世界裡的最低價"><span class="wl-chg down">本服最低</span></div>';
    return '<div class="wl-cell wl-stack" title="我的世界 ' + fmtFull(s.world) + ' 金；所有世界最低 ' + fmtFull(s.dc) + ' 金（' + esc(s.dcWorld || '其他世界') + '）"><span>' + fmt(s.world - s.dc) + '</span><small class="dear">本服貴' + fmtPct(s.pct) + '</small></div>';
  }
  function costBlock(m) {
    var c = costCache[m.id];
    if (!c || c.state === 'loading') return '<div class="wl-cell"><span class="wl-dim">⋯</span></div>';
    if (c.state === 'none') return '<div class="wl-cell" title="這個物品不能製作，或查不到材料價格"><span class="wl-dim">—</span></div>';
    var profit = m.price != null ? m.price - c.craft : null, pHtml = '';
    if (profit != null) pHtml = '<small class="' + (profit >= 0 ? 'cheap' : 'dear') + '">' + (profit >= 0 ? '+' : '−') + fmt(Math.abs(profit)) + '</small>';
    return '<div class="wl-cell wl-stack" title="材料成本 ' + fmtFull(c.craft) + ' 金；小字是目前最低價減成本（未扣稅）"><span>' + fmt(c.craft) + '</span>' + pHtml + '</div>';
  }
  var COL_BLOCK = { change: changeBlock, updated: updatedBlock, avg: avgBlock, vel: velBlock, freq: freqBlock, spread: spreadBlock, cost: costBlock };
  var COL_WIDTH = { change: '58px', updated: '58px', avg: '88px', vel: '78px', freq: '84px', spread: '96px', cost: '88px' };

  function actionsBlock(m) {
    var hasT = m.w.targetPrice != null;
    return '<div class="wl-cell wl-actions">' +
      '<button type="button" class="wl-iconbtn sm' + (hasT ? ' on' : '') + '" data-act="target" title="' + (hasT ? '修改目標價' : '設定目標價') + '"><i class="ph ph-bell' + (hasT ? '-ringing' : '-simple') + '"></i></button>' +
      '<button type="button" class="wl-iconbtn sm wl-chev" data-act="toggle" title="展開詳細資訊"><i class="ph ph-caret-down"></i></button></div>';
  }

  function tileHtml(label, val, cls, title) {
    return '<div class="wl-tile' + (cls ? ' ' + cls : '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '><span class="wl-tile-l">' + label + '</span><span class="wl-tile-v">' + val + '</span></div>';
  }
  function detailHtml(m) {
    var w = m.w, cols = visibleCols(), tiles = [];
    if (m.marketable && m.p) {
      if (m.p.hq != null && m.p.nq != null) {
        tiles.push(tileHtml('NQ 最低', fmt(m.p.nq) + '<small>金</small>', '', fmtFull(m.p.nq) + ' 金'));
        tiles.push(tileHtml('HQ 最低', fmt(m.p.hq) + '<small>金</small>', '', fmtFull(m.p.hq) + ' 金'));
      }
      AVG_KEYS.forEach(function (k) {
        var a = avgOfRow(m.row, k);
        tiles.push(tileHtml('均價・' + AVG_LABEL[k], a ? fmt(a.v) + '<small>金</small>' : '—', a ? '' : 'dim', a ? (a.n + ' 筆成交') : '這段時間成交太少，不顯示'));
      });
      if (cols.indexOf('vel') < 0) tiles.push(tileHtml('賣速 NQ·HQ', m.vel && (m.vel.nq + m.vel.hq) ? fmtVel(m.vel.nq) + ' · ' + fmtVel(m.vel.hq) + '<small>件/天</small>' : '—', m.vel && (m.vel.nq + m.vel.hq) ? '' : 'dim'));
      if (cols.indexOf('freq') < 0 && m.row && m.freq != null) tiles.push(tileHtml('成交頻率', m.freq > 0 ? m.freq.toFixed(2) + '<small>筆/天</small>' : '<5<small>筆/月</small>', m.freq > 0 ? '' : 'dim', m.freq > 0 ? '近30天平均每天成交幾筆' : '近30天成交不到5筆，算不出可靠的頻率'));
      var r = m.row && m.row[8];
      if (r) {
        var rs = [];
        if (r[0] != null && r[1]) rs.push('<span class="wl-line">NQ ' + fmt(r[0]) + '<small>金・' + agoText(r[1] * 1000) + '</small></span>');
        if (r[2] != null && r[3]) rs.push('<span class="wl-line">HQ ' + fmt(r[2]) + '<small>金・' + agoText(r[3] * 1000) + '</small></span>');
        if (rs.length) tiles.push(tileHtml('最近成交', rs.join(''), 'multi'));
      }
      if (cols.indexOf('spread') < 0 && hasWorld() && live.world[m.id] && live.dc[m.id]) {
        var sp = spreadInfo(m.id);
        if (sp) tiles.push(tileHtml('跨服差價', sp.pct < 0.5 ? '本服最低' : '本服貴 ' + fmtPct(sp.pct), sp.pct < 0.5 ? 'good' : ''));
      }
      if (cols.indexOf('cost') < 0) {
        var c = costCache[m.id];
        if (c && c.state === 'ok') tiles.push(tileHtml('材料成本', fmt(c.craft) + '<small>金</small>', '', fmtFull(c.craft) + ' 金'));
      }
    }
    var worldPills = '';
    var L = live.dc[m.id];
    if (m.marketable && L && L.worldMins) {
      var ws = Object.keys(L.worldMins).sort(function (a, b) { return L.worldMins[a] - L.worldMins[b]; }).slice(0, 6);
      if (ws.length) {
        worldPills = '<div class="wl-worlds"><span class="wl-tile-l">各世界最低</span>' + ws.map(function (n) {
          var up = L.worldUploadTimes && L.worldUploadTimes[n];
          return '<span class="wl-wpill' + (up ? ' ' + staleClass(up) : '') + '" title="' + (up ? '資料更新 ' + agoText(up) : '') + '">' + esc(n) + ' <b>' + fmt(L.worldMins[n]) + '</b></span>';
        }).join('') + '</div>';
      }
    }
    var tagHtml = w.tags.map(function (t) { return '<span class="wl-pill tag">' + esc(t) + '<button type="button" data-act="tag-del" data-tag="' + esc(t) + '" title="移除標籤">×</button></span>'; }).join('');
    var sugg = PRESET_TAGS.concat(allTags()).filter(function (t, i, a) { return a.indexOf(t) === i && w.tags.indexOf(t) < 0; }).slice(0, 6)
      .map(function (t) { return '<button type="button" class="wl-pill tag ghost" data-act="tag-add" data-tag="' + esc(t) + '">+ ' + esc(t) + '</button>'; }).join('');
    return '<div class="wl-detail">' +
      (tiles.length ? '<div class="wl-tiles">' + tiles.join('') + '</div>' : '') + worldPills +
      '<div class="wl-edit"><div class="wl-edit-row wrap"><span class="wl-edit-l"><i class="ph ph-bell"></i>目標價</span>' +
        '<div class="wl-seg sm" role="group">' + [['below', '≤ 低於'], ['above', '≥ 高於']].map(function (d) {
          return '<button type="button" data-act="dir" data-v="' + d[0] + '" class="' + ((w.targetDir || 'below') === d[0] ? 'on' : '') + '">' + d[1] + '</button>';
        }).join('') + '</div></div>' +
      '<div class="wl-edit-row">' +
        '<input type="text" inputmode="numeric" class="wl-input" data-field="target" value="' + (w.targetPrice != null ? w.targetPrice : '') + '" placeholder="例如 5000、1.2萬" autocomplete="off">' +
        '<button type="button" class="wl-btn" data-act="save-target">儲存</button>' +
        (w.targetPrice != null ? '<button type="button" class="wl-btn ghost" data-act="clear-target">清除</button>' : '') + '</div>' +
      '<div class="wl-edit-row wrap"><span class="wl-edit-l"><i class="ph ph-tag"></i>標籤</span>' + tagHtml +
        '<input type="text" class="wl-input tiny" data-field="tag" maxlength="12" placeholder="自訂標籤，按 Enter" autocomplete="off">' + sugg + '</div></div>' +
      '<div class="wl-detail-actions">' +
        '<button type="button" class="wl-btn" data-act="open"><i class="ph ph-arrow-square-out"></i>查看物品頁</button>' +
        '<button type="button" class="wl-btn" data-act="copy"><i class="ph ph-copy"></i>複製名稱</button>' +
        '<button type="button" class="wl-btn danger" data-act="remove"><i class="ph ph-trash"></i>移除關注</button></div>' +
      '</div>';
  }

  /* 窄版（手機、或沒展開寬版的抽屜）：放不下一欄一欄的表格，所以把漲跌、更新時間併到價格下面一行，名稱才有空間顯示 */
  function compactPriceBlock(m, cols) {
    var meta = [];
    if (m.p && m.p.src === 'live' && m.scope === 'dc' && m.p.world) meta.push('<span class="wl-world" title="目前最低價所在的伺服器">' + esc(m.p.world) + '</span>');
    else if (m.p && m.p.src === 'cache') meta.push('<span class="wl-world cache" title="這是每小時預先計算的資料，即時價格載入中或查詢失敗">快取</span>');
    if (cols.indexOf('change') >= 0 && m.change) meta.push(changeBlock(m));
    if (cols.indexOf('updated') >= 0 && m.p && m.p.upload) meta.push(updatedBlock(m));
    return '<div class="wl-pcol">' + priceBlock(m, true) + (meta.length ? '<div class="wl-pmeta">' + meta.join('') + '</div>' : '') + '</div>';
  }
  /* 欄名＋單位：單位用較小較淡的字放在欄名下面，數字本身就不用每格再寫一次 */
  function thHtml(k) {
    var label = k === 'price' ? '最低價' : (k === 'avg' ? '均價・' + AVG_LABEL[prefs.avgWin] : (k === 'vel' ? '賣速 NQ·HQ' : COLS[k]));
    var u = k === 'price' ? '金' : COL_UNIT[k];
    return '<span class="wl-th">' + label + (u ? '<small>' + u + '</small>' : '') + '</span>';
  }
  function tableHtml(ms) {
    var cols = visibleCols();
    if (!isWide()) {
      var ctpl = 'minmax(0,1fr) auto 50px';
      return '<div class="wl-thead compact" style="grid-template-columns:' + ctpl + '"><span>物品</span>' + thHtml('price') + '<span></span></div>' +
        ms.map(function (m) {
          return '<div class="wl-item' + (m.reached ? ' is-reached' : '') + (expanded[m.id] ? ' is-open' : '') + '" data-id="' + m.id + '">' +
            '<div class="wl-rowmain compact" style="grid-template-columns:' + ctpl + '">' + nameBlock(m) + compactPriceBlock(m, cols) + actionsBlock(m) + '</div>' +
            (expanded[m.id] ? detailHtml(m) : '') + '</div>';
        }).join('');
    }
    var tpl = ['minmax(0,1fr)', '96px'].concat(cols.map(function (k) { return COL_WIDTH[k]; })).concat(['52px']).join(' ');
    var head = '<div class="wl-thead" style="grid-template-columns:' + tpl + '"><span>物品</span>' + thHtml('price') +
      cols.map(thHtml).join('') + '<span></span></div>';
    return head + ms.map(function (m) {
      return '<div class="wl-item' + (m.reached ? ' is-reached' : '') + (expanded[m.id] ? ' is-open' : '') + '" data-id="' + m.id + '">' +
        '<div class="wl-rowmain" style="grid-template-columns:' + tpl + '">' + nameBlock(m) + priceBlock(m) +
        cols.map(function (k) { return COL_BLOCK[k](m); }).join('') + actionsBlock(m) + '</div>' +
        (expanded[m.id] ? detailHtml(m) : '') + '</div>';
    }).join('');
  }
  function gaugeHtml(m) { // 目前最低價落在均價的哪個位置：中間＝剛好是均價，偏左＝便宜，偏右＝貴
    if (m.price == null || !m.avg) return '';
    var pos = 50 + Math.max(-1, Math.min(1, (m.price / m.avg.v - 1) / 0.5)) * 50, d = m.avgDiff;
    var txt = Math.abs(d) < 1 ? '約等於均價' : (d < 0 ? '低於均價 ' : '高於均價 ') + fmtPct(d);
    return '<div class="wl-gauge" title="' + AVG_LABEL[prefs.avgWin] + '成交均價 ' + fmtFull(m.avg.v) + ' 金"><div class="wl-gauge-bar"><i style="left:' + pos.toFixed(1) + '%"></i></div>' +
      '<span class="' + (d < -1 ? 'cheap' : (d > 1 ? 'dear' : '')) + '">' + txt + '</span></div>';
  }
  function cardsHtml(ms) {
    var vis = visibleCols(), cols = vis.filter(function (k) { return EXTRA_COLS.indexOf(k) >= 0 && k !== 'avg'; }); // 均價已經用量尺呈現，不再重複
    return '<div class="wl-cards">' + ms.map(function (m) {
      var extras = cols.length ? '<div class="wl-card-extras">' + cols.map(function (k) {
        return '<div class="wl-xrow"><span>' + COLS[k] + (COL_UNIT[k] ? '<small>' + COL_UNIT[k] + '</small>' : '') + '</span>' + COL_BLOCK[k](m) + '</div>';
      }).join('') + '</div>' : '';
      var foot = [];
      if (vis.indexOf('change') >= 0) foot.push(changeBlock(m));
      if (vis.indexOf('updated') >= 0) foot.push(updatedBlock(m));
      return '<div class="wl-card wl-item' + (m.reached ? ' is-reached' : '') + (expanded[m.id] ? ' is-open' : '') + '" data-id="' + m.id + '">' +
        '<div class="wl-card-head">' + nameBlock(m, 40) + actionsBlock(m) + '</div>' +
        '<div class="wl-card-price">' + priceBlock(m) + '</div>' + gaugeHtml(m) +
        (foot.length ? '<div class="wl-card-foot">' + foot.join('') + '</div>' : '') + extras +
        (expanded[m.id] ? detailHtml(m) : '') + '</div>';
    }).join('') + '</div>';
  }
  function emptyHtml() {
    return '<div class="wl-empty"><i class="ph ph-shopping-cart-simple"></i><p>還沒有關注的物品</p>' +
      '<small>在物品頁或搜尋結果按 ☆ 加入</small>' +
      '<button type="button" class="wl-btn" data-act="import"><i class="ph ph-upload-simple"></i>匯入清單</button></div>';
  }

  function sortModels(ms) {
    ms.forEach(function (m, i) { m.i = i; });
    var by = {
      'default': function () { return 0; }, // 單純的加入順序（同分時下面統一用加入次序排）
      name: function (a, b) { return a.name.localeCompare(b.name, 'zh-Hant'); },
      priceAsc: function (a, b) { return numCmp(a.price, b.price, 1); },
      priceDesc: function (a, b) { return numCmp(a.price, b.price, -1); },
      drop: function (a, b) { return numCmp(a.change && a.change.pct, b.change && b.change.pct, 1); },
      rise: function (a, b) { return numCmp(a.change && a.change.pct, b.change && b.change.pct, -1); },
      cheap: function (a, b) { return numCmp(a.avgDiff, b.avgDiff, 1); },
      dear: function (a, b) { return numCmp(a.avgDiff, b.avgDiff, -1); },
      vel: function (a, b) { return numCmp(a.vel ? a.vel.nq + a.vel.hq : null, b.vel ? b.vel.nq + b.vel.hq : null, -1); },
      freq: function (a, b) { return numCmp(a.freq, b.freq, -1); },
    };
    var f = by[prefs.sort] || by['default'];
    ms.sort(function (a, b) { return f(a, b) || a.i - b.i; });
    if (prefs.pinHit) { // 達標項目置頂：不改變目前選的排序，只是把達標的整批移到最前面，兩批各自維持原本的排序
      var hit = ms.filter(function (m) { return m.reached; }), rest = ms.filter(function (m) { return !m.reached; });
      return hit.concat(rest);
    }
    return ms;
  }

  /* ───────────── 畫面：渲染 ───────────── */
  function renderBody() {
    if (!els.body) return;
    var html, ms = [];
    if (!list.length) html = emptyHtml();
    else {
      ms = list.map(model);
      if (prefs.tag) ms = ms.filter(function (m) { return m.w.tags.indexOf(prefs.tag) >= 0; });
      if (!ms.length) html = '<div class="wl-empty"><p>這個標籤下沒有物品</p></div>';
      else html = prefs.view === 'card' ? cardsHtml(sortModels(ms)) : tableHtml(sortModels(ms));
    }
    var top = els.body.scrollTop;
    els.body.innerHTML = html;
    els.body.scrollTop = top;
    if (focusTarget) {
      var inp = els.body.querySelector('[data-id="' + focusTarget + '"] [data-field="target"]');
      if (inp) { try { inp.focus(); inp.select(); inp.scrollIntoView({ block: 'nearest' }); } catch (e) { /* 忽略 */ } }
      focusTarget = null;
    }
    var wantCost = visibleCols().indexOf('cost') >= 0;
    ms.forEach(function (m) { if (m.marketable && (wantCost || expanded[m.id])) ensureCost(m.id); });
  }
  function scheduleRender() {
    if (!els.body) return;
    var a = document.activeElement;
    if (a && els.body.contains(a) && /^(input|select|textarea)$/i.test(a.tagName)) { dirty = true; return; } // 使用者正在輸入，等輸入完再重畫，免得游標被洗掉
    renderBody();
  }
  function renderHead() {
    if (!els.count) return;
    els.count.textContent = list.length ? '（' + list.length + '）' : '';
  }
  /* 自製下拉選單：瀏覽器原生的選項列表只能改底色，改不了選中列的高亮和邊框，所以自己畫 */
  function ddHtml(name, value, options, extra) {
    var cur = options.filter(function (o) { return o[0] === value; })[0] || options[0];
    return '<div class="wl-dd" data-dd="' + name + '">' +
      '<button type="button" class="wl-dd-btn" data-act="dd-toggle" aria-haspopup="listbox" aria-expanded="false"><span>' + esc(cur[1]) + '</span><i class="ph ph-caret-down"></i></button>' +
      '<div class="wl-dd-list" role="listbox" hidden>' + options.map(function (o) {
        return '<button type="button" role="option" class="wl-dd-opt' + (o[0] === value ? ' on' : '') + '" data-act="dd-pick" data-v="' + esc(o[0]) + '" aria-selected="' + (o[0] === value) + '">' + esc(o[1]) + '</button>';
      }).join('') + (extra || '') + '</div></div>';
  }
  function closeDropdowns() {
    if (!els.drawer) return false;
    var any = false;
    [].slice.call(els.drawer.querySelectorAll('.wl-dd-list')).forEach(function (l) {
      if (l.hidden) return;
      l.hidden = true; any = true;
      l.parentNode.classList.remove('open');
      var b = l.parentNode.querySelector('.wl-dd-btn'); if (b) b.setAttribute('aria-expanded', 'false');
    });
    return any;
  }
  function toggleDropdown(dd) {
    var list = dd.querySelector('.wl-dd-list'), wasOpen = !list.hidden;
    closeDropdowns();
    if (wasOpen) return;
    list.hidden = false; dd.classList.add('open');
    dd.querySelector('.wl-dd-btn').setAttribute('aria-expanded', 'true');
    list.classList.remove('right');
    var pr = els.drawer.querySelector('.wl-panel').getBoundingClientRect(), lr = list.getBoundingClientRect();
    if (lr.right > pr.right - 8) list.classList.add('right'); // 靠右放不下就改成靠右對齊
    var cur = list.querySelector('.wl-dd-opt.on'); if (cur) { try { cur.focus(); } catch (e) { /* 忽略 */ } }
  }
  function renderToolbar() {
    var world = hasWorld(), sc = effScope();
    els.toolbar.innerHTML =
      '<div class="wl-seg" role="group" aria-label="價格範圍">' +
        '<button type="button" data-act="scope" data-v="dc" class="' + (sc === 'dc' ? 'on' : '') + '">所有世界</button>' +
        '<button type="button" data-act="scope" data-v="world" class="' + (sc === 'world' ? 'on' : '') + '"' + (world ? '' : ' disabled title="請先在上方「設定」選擇我的世界"') + '>' + (world ? esc(st().worldName) : '我的世界') + '</button></div>' +
      '<div class="wl-seg icons" role="group" aria-label="檢視方式">' +
        '<button type="button" data-act="view" data-v="table" class="' + (prefs.view === 'table' ? 'on' : '') + '" title="表格"><i class="ph ph-list-dashes"></i></button>' +
        '<button type="button" data-act="view" data-v="card" class="' + (prefs.view === 'card' ? 'on' : '') + '" title="卡片"><i class="ph ph-squares-four"></i></button></div>' +
      ddHtml('sort', prefs.sort, SORTS, '<div class="wl-dd-sep"></div><button type="button" role="menuitemcheckbox" class="wl-dd-opt wl-dd-check' + (prefs.pinHit ? ' on' : '') + '" data-act="pin-toggle" aria-checked="' + !!prefs.pinHit + '" title="不改變上面選的排序，只把已達目標價的物品移到最前面">達標項目置頂</button>');
  }
  function renderStatus() {
    if (!els.status) return;
    var txt = '', cls = '';
    var s = lastRefreshState;
    if (s === 'nodc') txt = '請先在上方「設定」選擇資料中心';
    else if (s === 'loading') { txt = '更新中⋯'; cls = 'busy'; }
    else if (s === 'ok' && lastRefreshAt) txt = '即時價格 · ' + new Date(lastRefreshAt).toTimeString().slice(0, 5) + ' 更新';
    else if (s === 'partial') { txt = '部分物品查詢失敗，其餘為即時價格'; cls = 'warn'; }
    else if (s === 'fail') { txt = '即時查詢失敗，顯示的是每小時快取'; cls = 'warn'; }
    else txt = list.length ? '尚未更新' : '';
    els.status.className = 'wl-status ' + cls;
    els.status.querySelector('.wl-status-txt').textContent = txt;
    els.status.querySelector('[data-act="refresh"]').classList.toggle('spin', refreshing);
  }
  function renderTagbar() {
    if (!els.tagbar) return;
    var tags = allTags();
    if (prefs.tag && tags.indexOf(prefs.tag) < 0) { prefs.tag = ''; savePrefs(); }
    if (!tags.length) { els.tagbar.hidden = true; els.tagbar.innerHTML = ''; return; }
    els.tagbar.hidden = false;
    els.tagbar.innerHTML = '<button type="button" class="wl-chip' + (prefs.tag ? '' : ' on') + '" data-act="tagfilter" data-v="">全部</button>' +
      tags.map(function (t) { return '<button type="button" class="wl-chip' + (prefs.tag === t ? ' on' : '') + '" data-act="tagfilter" data-v="' + esc(t) + '">' + esc(t) + '</button>'; }).join('');
  }
  function renderSettings() {
    if (!els.settings || els.settings.hidden) return;
    var perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    var nOn = notifyEnabled();
    els.settings.innerHTML =
      '<div class="wl-set-group"><div class="wl-set-title">顯示欄位</div><div class="wl-checks">' + COL_ORDER.map(function (k) {
        var extra = EXTRA_COLS.indexOf(k) >= 0;
        return '<label class="wl-check' + (extra ? ' wl-extra-col' : '') + '"><input type="checkbox" data-pref="col" data-v="' + k + '"' + (prefs.cols.indexOf(k) >= 0 ? ' checked' : '') + '><span>' + COLS[k] + '</span>' +
          (extra ? '<i class="ph ph-arrows-out-line-horizontal" title="寬版顯示"></i>' : '') + '</label>';
      }).join('') + '</div></div>' +
      '<div class="wl-set-group"><div class="wl-set-title">成交均價</div><div class="wl-seg">' +
        AVG_KEYS.map(function (k) { return '<button type="button" data-act="avgwin" data-v="' + k + '" class="' + (prefs.avgWin === k ? 'on' : '') + '">' + AVG_LABEL[k] + '</button>'; }).join('') + '</div></div>' +
      '<div class="wl-set-group"><div class="wl-set-title">提醒</div><div class="wl-checks">' +
        '<label class="wl-check" title="只有這個網頁開著時才會提醒"><input type="checkbox" data-pref="notify"' + (nOn ? ' checked' : '') + (perm === 'unsupported' || perm === 'denied' ? ' disabled' : '') + '><span>瀏覽器通知</span></label>' +
        '<label class="wl-check"><input type="checkbox" data-pref="auto"' + (prefs.auto ? ' checked' : '') + '><span>自動刷新</span></label>' +
        (prefs.auto ? '<div class="wl-seg sm" role="group" aria-label="刷新間隔">' + [3, 5, 10, 15].map(function (n) {
          return '<button type="button" data-act="interval" data-v="' + n + '" class="' + (Number(prefs.interval) === n ? 'on' : '') + '">' + n + ' 分</button>';
        }).join('') + '</div>' : '') + '</div>' +
        (perm === 'denied' ? '<p class="wl-hint warn">瀏覽器已封鎖通知</p>' : '') + '</div>' +
      '<div class="wl-set-group"><div class="wl-set-btns">' +
        '<button type="button" class="wl-btn" data-act="export"><i class="ph ph-download-simple"></i>匯出</button>' +
        '<button type="button" class="wl-btn" data-act="import"><i class="ph ph-upload-simple"></i>匯入</button>' +
        '<button type="button" class="wl-btn danger" data-act="clear"><i class="ph ph-trash"></i>清空</button></div></div>';
  }
  function renderAll() {
    if (!els.drawer) return;
    els.drawer.classList.toggle('wide', isWide());
    renderHead(); renderToolbar(); renderTagbar(); renderSettings(); renderBody(); renderStatus(); updateBadge();
  }
  function updateBadge() {
    if (!els.badge) return;
    var sc = effScope(), n = 0;
    list.forEach(function (w) { var p = priceInfo(w.itemId, sc); if (p && isReached(w, p.min)) n++; });
    els.badge.textContent = n;
    els.badge.style.display = n > 0 ? 'inline-flex' : 'none';
    if (els.fab) {
      els.fab.title = '關注清單（' + list.length + '）' + (n ? '・' + n + ' 個已達目標價' : '');
      els.fab.classList.toggle('has-hit', n > 0);
    }
  }

  /* ───────────── 抽屜開關 ───────────── */
  function openDrawer(opts) {
    if (!els.drawer) return;
    els.drawer.classList.add('open');
    if (els.fab) els.fab.classList.add('hide');
    if (opts && opts.focusId) { expanded[String(opts.focusId)] = true; focusTarget = String(opts.focusId); }
    renderAll();
    if (Date.now() - lastRefreshAt > 60 * 1000 || missingData()) refresh({});
    else ensurePc(effScope()).then(scheduleRender);
  }
  function closeDrawer() {
    if (!els.drawer || !isOpen()) return;
    closeDropdowns();
    els.drawer.classList.remove('open');
    if (els.fab) els.fab.classList.remove('hide');
    commitSeen();
  }

  /* ───────────── 匯出／匯入／複製／提示 ───────────── */
  function exportJson() {
    var d = new Date(), p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var blob = new Blob([JSON.stringify({ v: 1, kind: 'ff14fc-watchlist', exportedAt: d.toISOString(), items: list }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ff14-watchlist-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(String(reader.result)); } catch (e) { toast('匯入失敗：檔案不是有效的 JSON'); return; }
      var items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
      if (!items) { toast('匯入失敗：找不到關注清單資料'); return; }
      var added = 0, updated = 0, newIds = [];
      items.forEach(function (x) {
        if (!x || x.itemId == null || !/^\d+$/.test(String(x.itemId))) return;
        var id = String(x.itemId), t = Number(x.targetPrice);
        var target = (x.targetPrice != null && isFinite(t) && t > 0) ? t : null;
        var tags = Array.isArray(x.tags) ? x.tags.filter(Boolean).map(function (s) { return String(s).slice(0, 12); }) : [];
        var dir = x.targetDir === 'above' ? 'above' : 'below';
        var cur = find(id);
        if (cur) { cur.targetPrice = target; cur.targetDir = dir; cur.tags = tags; updated++; }
        else { list.push({ itemId: id, name: x.name || '', targetPrice: target, targetDir: dir, tags: tags, addedAt: Date.now() }); added++; newIds.push(id); }
      });
      afterListChanged(newIds);
      toast('匯入完成：新增 ' + added + ' 個，更新 ' + updated + ' 個');
    };
    reader.readAsText(file);
  }
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* 忽略 */ } ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback); else fallback();
    toast('已複製「' + text + '」');
  }
  function toast(msg, actLabel, actFn) {
    if (!els.toast) return;
    els.toast.innerHTML = '<span>' + esc(msg) + '</span>' + (actLabel ? '<button type="button">' + esc(actLabel) + '</button>' : '');
    els.toast.hidden = false;
    els.toast.classList.add('show');
    var b = els.toast.querySelector('button');
    if (b) b.onclick = function () { els.toast.classList.remove('show'); if (actFn) actFn(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 4500);
  }

  /* ───────────── 事件 ───────────── */
  function blurActive() { // 有些瀏覽器（Safari）點按鈕不會讓輸入框失焦，畫面會因為「正在輸入」而不更新，所以動作前先讓它失焦
    var a = document.activeElement;
    if (a && els.body && els.body.contains(a) && /^(input|select|textarea)$/i.test(a.tagName)) { try { a.blur(); } catch (e) { /* 忽略 */ } }
    dirty = false;
  }
  function handleAct(btn, e) {
    var act = btn.dataset.act;
    blurActive();
    var itemEl = btn.closest('[data-id]');
    var id = itemEl ? itemEl.dataset.id : null;
    var w = id ? find(id) : null;
    switch (act) {
      case 'close': closeDrawer(); break;
      case 'dd-toggle': toggleDropdown(btn.closest('.wl-dd')); break;
      case 'pin-toggle': // 勾選／取消：下拉選單保持開著，清單立刻重排
        prefs.pinHit = !prefs.pinHit; savePrefs();
        btn.classList.toggle('on', prefs.pinHit); btn.setAttribute('aria-checked', String(prefs.pinHit));
        renderBody();
        break;
      case 'dd-pick': {
        var ddName = btn.closest('.wl-dd').dataset.dd;
        if (ddName === 'sort') { prefs.sort = btn.dataset.v; savePrefs(); renderToolbar(); renderBody(); }
        break;
      }
      case 'interval': prefs.interval = Number(btn.dataset.v) || 5; savePrefs(); startTimer(); renderSettings(); break;
      case 'wide': prefs.wide = !prefs.wide; savePrefs(); renderAll(); break;
      case 'settings': els.settings.hidden = !els.settings.hidden; renderSettings(); break;
      case 'refresh': costCache = {}; refresh({}); break;
      case 'scope': if (!btn.disabled) { prefs.scope = btn.dataset.v; savePrefs(); renderToolbar(); renderBody(); updateBadge(); refresh({}); } break;
      case 'view': prefs.view = btn.dataset.v; savePrefs(); renderToolbar(); renderBody(); break;
      case 'tagfilter': prefs.tag = btn.dataset.v || ''; savePrefs(); renderTagbar(); renderBody(); break;
      case 'avgwin': prefs.avgWin = btn.dataset.v; savePrefs(); renderSettings(); renderBody(); break;
      case 'export': exportJson(); break;
      case 'import': els.file.value = ''; els.file.click(); break;
      case 'clear':
        if (list.length && confirm('確定要清空整個關注清單嗎？（可以先按「匯出」備份）')) {
          var ids = list.map(function (x) { return x.itemId; });
          ids.forEach(function (x) { remove(x); });
        }
        break;
      case 'open': if (w && bridge.openItem) { closeDrawer(); bridge.openItem(w.itemId); } break;
      case 'toggle': if (id) toggleExpand(id); break;
      case 'target': if (id) { expanded[id] = true; focusTarget = id; renderBody(); } break;
      case 'dir':
        if (w) { // 切換方向時，輸入框裡打好的數字一起存下來，免得切換後被洗掉
          var tin = itemEl.querySelector('[data-field="target"]'), tv = tin ? parseGil(tin.value) : null;
          setTarget(w.itemId, (tv !== null && !isNaN(tv)) ? tv : w.targetPrice, btn.dataset.v);
        }
        break;
      case 'save-target': if (w) saveTargetFrom(itemEl, w); break;
      case 'clear-target': if (w) { setTarget(w.itemId, null); } break;
      case 'tag-add': if (w) addTag(w.itemId, btn.dataset.tag); break;
      case 'tag-del': if (w) delTag(w.itemId, btn.dataset.tag); if (e) e.stopPropagation(); break;
      case 'copy': if (w) copyText(displayName(w)); break;
      case 'remove': if (w) remove(w.itemId); break;
      default: break;
    }
  }
  function toggleExpand(id) { if (expanded[id]) delete expanded[id]; else expanded[id] = true; renderBody(); }
  function saveTargetFrom(itemEl, w) {
    var inp = itemEl.querySelector('[data-field="target"]');
    var v = parseGil(inp.value);
    if (v !== null && isNaN(v)) { toast('目標價格式不對，請輸入數字，例如 5000 或 1.2萬'); return; }
    setTarget(w.itemId, v, w.targetDir);
    toast(v == null ? '已清除目標價' : '目標價已設為 ' + fmtFull(v) + ' 金');
  }
  function bindDrawerEvents() {
    els.drawer.addEventListener('click', function (e) {
      if (e.target.classList.contains('wl-backdrop')) { closeDrawer(); return; }
      if (!e.target.closest('.wl-dd')) closeDropdowns();
      var btn = e.target.closest('[data-act]');
      if (btn) { e.preventDefault(); handleAct(btn, e); return; }
      var item = e.target.closest('.wl-item');
      if (item && !e.target.closest('.wl-detail, input, button, a, select')) toggleExpand(item.dataset.id);
    });
    els.drawer.addEventListener('change', function (e) {
      var t = e.target;
      var pref = t.dataset.pref;
      if (pref === 'col') {
        var k = t.dataset.v, i = prefs.cols.indexOf(k);
        if (t.checked && i < 0) prefs.cols.push(k); else if (!t.checked && i >= 0) prefs.cols.splice(i, 1);
        if (t.checked && EXTRA_COLS.indexOf(k) >= 0 && !prefs.wide && window.innerWidth >= 720) prefs.wide = true; // 勾選寬版欄位就自動展開寬版
        savePrefs(); renderAll();
        if (k === 'spread' && t.checked) refresh({});
      } else if (pref === 'auto') { prefs.auto = t.checked; savePrefs(); startTimer(); }
      else if (pref === 'notify') {
        if (t.checked) {
          if (typeof Notification === 'undefined') { t.checked = false; return; }
          var done = function (perm) { if (perm === 'granted') { try { localStorage.setItem(NOTIFY_KEY, '1'); } catch (e2) { /* 忽略 */ } } renderSettings(); };
          if (Notification.permission === 'granted') done('granted');
          else Promise.resolve(Notification.requestPermission()).then(done);
        } else { try { localStorage.setItem(NOTIFY_KEY, '0'); } catch (e3) { /* 忽略 */ } renderSettings(); }
      }
    });
    els.drawer.addEventListener('keydown', function (e) {
      var opt = e.target.closest && e.target.closest('.wl-dd-opt');
      if (opt && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        var opts = [].slice.call(opt.parentNode.querySelectorAll('.wl-dd-opt')), nx = opts[opts.indexOf(opt) + (e.key === 'ArrowDown' ? 1 : -1)];
        if (nx) nx.focus();
        return;
      }
      if (e.key !== 'Enter') return;
      var t = e.target, itemEl = t.closest && t.closest('[data-id]');
      if (!itemEl || !t.dataset) return;
      var w = find(itemEl.dataset.id); if (!w) return;
      if (t.dataset.field === 'target') { e.preventDefault(); var tv = t.value; blurActive(); t.value = tv; saveTargetFrom(itemEl, w); }
      else if (t.dataset.field === 'tag') { e.preventDefault(); var gv = t.value; blurActive(); addTag(w.itemId, gv); }
    });
    els.drawer.addEventListener('focusout', function () {
      setTimeout(function () { if (dirty) { dirty = false; scheduleRender(); } }, 0);
    });
    els.file.addEventListener('change', function () { if (els.file.files && els.file.files[0]) importJson(els.file.files[0]); });
    els.fab.addEventListener('click', function () { openDrawer(); });
  }
  function bindGlobalOnce() {
    if (globalBound) return;
    globalBound = true;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) { if (!closeDropdowns()) closeDrawer(); } }); // 先關下拉，再關抽屜
    window.addEventListener('resize', function () { if (els.drawer) { els.drawer.classList.toggle('wide', isWide()); if (isOpen()) renderBody(); } positionFab(); });
    window.addEventListener('storage', function (e) { // 同時開了多個分頁：另一個分頁改了清單／設定，這邊同步
      if ([WATCH_KEY, PREFS_KEY, SEEN_KEY, ALERT_KEY].indexOf(e.key) < 0) return;
      loadState();
      if (els.drawer) renderAll();
      fireChange();
    });
    var lastTop = new WeakMap(), dimTimer = null; // 只要在捲動（往上、往下都算），浮動按鈕就縮小變暗；停止捲動約 0.7 秒後恢復
    document.addEventListener('scroll', function (e) {
      var t = e.target === document ? document.scrollingElement : e.target;
      if (!t || typeof t.scrollTop !== 'number' || !els.fab) return;
      if (els.drawer && els.drawer.contains(t)) return; // 抽屜自己的捲動不算
      var prev = lastTop.has(t) ? lastTop.get(t) : 0, cur = t.scrollTop;
      lastTop.set(t, cur);
      if (cur === prev) return;
      els.fab.classList.add('dim');
      clearTimeout(dimTimer);
      dimTimer = setTimeout(function () { if (els.fab) els.fab.classList.remove('dim'); }, 700);
    }, true);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && hasTargets() && Date.now() - lastRefreshAt > 2 * 60 * 1000) refresh({ targetsOnly: !isOpen() }); });
  }

  /* 螢幕很大時，內容框置中、兩邊留一大片空白，貼著視窗右下角的按鈕會離內容很遠、很難發現。
   * 所以右邊空間夠的話，就把按鈕放在內容框的右外側（距離 16px）；空間不夠（一般螢幕、手機）才貼視窗角落。 */
  function positionFab() {
    if (!els.fab || !fabFrame) return;
    var fr = fabFrame.getBoundingClientRect();
    if (!fr.width) return;
    var vw = document.documentElement.clientWidth, w = els.fab.offsetWidth || 58, room = vw - fr.right;
    els.fab.style.right = (room >= w + 16 + 18) ? Math.round(room - w - 16) + 'px' : '';
  }

  /* ───────────── 掛載 ───────────── */
  function mount(root) {
    root = root || document.getElementById('market-root');
    if (!root || !bridge) return;
    ['wl-host', 'wl-fab', 'wl-drawer', 'wl-toast'].forEach(function (id) { var o = document.getElementById(id); if (o) o.remove(); });
    if (sceneObserver) { sceneObserver.disconnect(); sceneObserver = null; }
    if (fabRO) { fabRO.disconnect(); fabRO = null; }
    var html =
      '<button type="button" id="wl-fab" class="wl-fab" title="關注清單" aria-label="關注清單">' +
        '<span class="wl-fab-medal"><span class="wl-fab-disc"><i class="ph ph-shopping-cart-simple"></i></span>' +
          '<i class="wl-fab-gem n"></i><i class="wl-fab-gem e"></i><i class="wl-fab-gem s"></i><i class="wl-fab-gem w"></i></span>' +
        '<span class="wl-fab-plate">關注</span>' +
        '<span id="wl-fab-badge" class="wl-fab-badge" style="display:none">0</span></button>' +
      '<div id="wl-drawer" class="wl-drawer"><div class="wl-backdrop"></div>' +
        '<aside class="wl-panel" role="dialog" aria-label="關注清單">' +
          '<div class="wl-head"><div class="wl-title"><i class="ph ph-shopping-cart-simple"></i>關注清單<span id="wl-count" class="wl-count"></span></div>' +
            '<div class="wl-head-actions">' +
              '<button type="button" class="wl-iconbtn wl-widebtn" data-act="wide" title="展開／收合寬版"><i class="ph ph-arrows-out-line-horizontal"></i></button>' +
              '<button type="button" class="wl-iconbtn" data-act="settings" title="設定"><i class="ph ph-sliders-horizontal"></i></button>' +
              '<button type="button" class="wl-iconbtn" data-act="close" title="關閉"><i class="ph ph-x"></i></button></div></div>' +
          '<div class="wl-toolbar" id="wl-toolbar"></div>' +
          '<div class="wl-status" id="wl-status"><span class="wl-status-txt"></span><button type="button" class="wl-iconbtn sm" data-act="refresh" title="立即刷新"><i class="ph ph-arrows-clockwise"></i></button></div>' +
          '<div class="wl-tagbar" id="wl-tagbar" hidden></div>' +
          '<div class="wl-settings" id="wl-settings" hidden></div>' +
          '<div class="wl-body" id="wl-body"></div>' +
          '<input type="file" id="wl-file" accept="application/json,.json" hidden></aside></div>' +
      '<div class="wl-toast" id="wl-toast" hidden></div>';
    // 掛在 body 底下，不掛在市場頁外框裡：外框有 backdrop-filter，會讓裡面的 position:fixed 變成相對外框定位，
    // 抽屜跟浮動按鈕就被關在外框裡面，不是貼著畫面。改掛 body 之後，再跟著市場頁是否為作用中的場景來顯示／隱藏。
    var host = document.createElement('div');
    host.id = 'wl-host';
    host.innerHTML = html;
    document.body.appendChild(host);
    var scene = root.closest ? root.closest('.scene') : null;
    var syncHost = function () {
      var on = !scene || scene.classList.contains('active');
      host.style.display = on ? '' : 'none';
      if (!on && isOpen()) closeDrawer();
      if (on) { positionFab(); setTimeout(positionFab, 400); setTimeout(positionFab, 1300); } // 場景切換有淡入動畫，多量幾次
    };
    fabFrame = (root.closest && root.closest('.noble-outer-frame')) || root;
    if (scene && 'MutationObserver' in window) { sceneObserver = new MutationObserver(syncHost); sceneObserver.observe(scene, { attributes: true, attributeFilter: ['class'] }); }
    els = {
      fab: document.getElementById('wl-fab'), badge: document.getElementById('wl-fab-badge'), drawer: document.getElementById('wl-drawer'),
      count: document.getElementById('wl-count'), toolbar: document.getElementById('wl-toolbar'), status: document.getElementById('wl-status'),
      tagbar: document.getElementById('wl-tagbar'), settings: document.getElementById('wl-settings'), body: document.getElementById('wl-body'),
      file: document.getElementById('wl-file'), toast: document.getElementById('wl-toast'),
    };
    syncHost();
    if (typeof ResizeObserver !== 'undefined') { fabRO = new ResizeObserver(positionFab); fabRO.observe(fabFrame); }
    var s = st(); lastSig = (s.dcName || '') + '|' + (s.worldName || '');
    bindDrawerEvents(); bindGlobalOnce();
    renderAll(); startTimer();
    if (hasTargets()) refresh({ targetsOnly: true }); // 頁面一載入就悄悄查一次，徽章才準
  }
  function init(b) { bridge = b; loadState(); }

  window.MarketWatchlist = {
    init: init, mount: mount, add: add, remove: remove, toggle: toggle, has: has, count: count,
    open: openDrawer, close: closeDrawer, onChange: onChange, onSettingsChanged: onSettingsChanged,
  };
})();
