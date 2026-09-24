#!/usr/bin/env node
/* update-market-data.js — 預先計算全市場的熱度／漲跌資料，給網站的「熱度排行」直接讀取。
 *
 * 為什麼要預先算：熱度排行要看「所有可交易道具」，瀏覽器沒辦法（也不該）每個使用者都去掃一遍 Universalis。
 * 這支腳本由 GitHub Actions 每小時跑一次，抓完之後輸出成靜態 JSON，網頁只需要讀檔案，秒開。
 *
 * 只用「成交紀錄」計算（不看掛單）：成交才是實際發生的市場流通；掛單要等玩家上傳才更新，可能早就過期。
 *
 * 範圍：陸行鳥資料中心的每個世界，加上「所有世界」（＝各世界成交合併）。
 * 視角：全部（NQ+HQ 一起）／NQ／HQ。
 * 窗口（全部從「現在」算起，不跳過最近一小時，短窗口包含在長窗口裡）：
 *   高頻：24小時內 vs 48小時內（成交筆數至少 3 筆 / 5 筆才算）
 *   低頻：3天內 vs 7天內（成交筆數至少 3 筆 / 5 筆才算；高頻資格不夠才會進低頻）
 *
 * 輸出（OUT_DIR，預設 market-out/market）：
 *   meta.json      產生時間、各範圍檔名與道具數、門檻設定、請求統計
 *   dc.json        所有世界（各世界成交合併）
 *   w<世界ID>.json 每個世界
 * 每個檔案：{ v:1, scope, items: { "<道具ID>": [賣速NQ, 賣速HQ, 最低掛單價|null, P全部, PNQ, PHQ, D|null, Q, S] } }
 *   P = null 或 [頻率(1高頻/2低頻), 短窗口筆數, 短窗口均價, 長窗口筆數, 長窗口均價, 長窗口成交金額(單價×數量加總)]
 *   D = 「全部」視角的四個窗口，給物品詳情頁的均價徽章用：[24小時筆數, 24小時均價, 48小時筆數, 48小時均價,
 *       3天筆數, 3天均價, 7天筆數, 7天均價]（沒有查7天資料的道具，後四個是 null；沒有成交的窗口均價是 null）
 *   Q = [NQ最低掛單價|null, HQ最低掛單價|null]（機會雷達切到「掛單最低價」基準、並選了NQ／HQ視角時用；
 *       第3欄的「最低掛單價」是兩者的較小值）。掛單資料要等玩家上傳才會更新，最多會有約一小時的延遲，只當價格參考。
 *   S = [NQ最近一筆成交價|null, NQ成交時間(秒)|null, HQ最近一筆成交價|null, HQ成交時間(秒)|null]
 *       （Universalis 記錄的「最近一筆成交」，不限時間範圍；給熱度排行的「成交稀少」清單用——高價、很久才賣出一件的道具，
 *       窗口內湊不出足夠成交筆數算漲跌，但仍然要讓使用者找得到它們最近賣多少、現在掛多少）
 *   沒有賣速的道具（近4天沒成交）只要有掛單或有最近成交紀錄，也會列進來（P、D 都是 null），否則這些道具就不見了。
 *
 * 安全機制：失敗率太高、或道具數量比上一次少太多，整支腳本以非0結束，workflow 就不會推送，
 * 舊資料原封不動（不會拿殘缺／空白的資料覆蓋掉好的資料）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = process.env.UNIVERSALIS_BASE || 'https://universalis.app/api/v2';
const DC_NAME = process.env.DC_NAME || '陸行鳥';
const OUT_DIR = process.env.OUT_DIR || path.join('market-out', 'market');
const NAMES_FILE = process.env.NAMES_FILE || path.join('js', 'item-names-tw.js');
const PREV_META_URL = process.env.PREV_META_URL || '';
const ITEM_LIMIT = Number(process.env.ITEM_LIMIT || 0); // 只用於測試
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 6); // Universalis 同一 IP 最多 8 條同時連線，留一點餘裕
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS || 100); // 約每秒 10 個請求（官方上限約 25）
// 「系統上存在、但玩家不能加入」的世界（例如拉姆）：沒有任何成交／掛單資料是正常的。
// 這些世界會先用3個分散的小樣本探測，如果全部查不到東西就整個略過，不浪費時間、也不會被算成失敗。
// 其他世界不在這個名單裡，仍然要完整查，查不到會算失敗（那代表真的出問題了）。
const EMPTY_OK_WORLDS = (process.env.EMPTY_OK_WORLDS || '拉姆').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
const MAX_FAIL_RATIO = 0.05;
const MIN_KEEP_RATIO = 0.7;
const UA = 'xiv-craft-helper-market-bot' + (process.env.GITHUB_REPOSITORY ? ' (github.com/' + process.env.GITHUB_REPOSITORY + ')' : '');

const H24 = 86400, H48 = 172800, D3 = 259200, D7 = 604800, D30 = 2592000;
const MIN_SHORT = 3, MIN_LONG = 5;
const HISTORY_CAP = 1800; // 單次請求每個道具最多回傳的成交筆數
const AGG_CHUNK = 100;    // 聚合端點一次最多 100 個道具
const HIST_CHUNK = 10;

const stats = { requests: 0, failed: 0, retries: 0 };

/* ── 請求：限速＋限制同時連線＋重試 ── */
let active = 0, lastStart = 0;
const waiters = [];
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function acquire() {
  while (active >= MAX_CONCURRENT) await new Promise(function (r) { waiters.push(r); });
  active++;
  const wait = lastStart + MIN_INTERVAL_MS - Date.now();
  lastStart = Math.max(Date.now(), lastStart + MIN_INTERVAL_MS);
  if (wait > 0) await sleep(wait);
}
function release() { active--; const w = waiters.shift(); if (w) w(); }

async function fetchJson(url, tries) {
  tries = tries || 5;
  stats.requests++;
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    await acquire();
    let res = null;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    } catch (e) { lastErr = e; }
    release();
    if (res) {
      if (res.ok) {
        try { return await res.json(); } catch (e) { lastErr = e; }
      } else if (res.status === 404) {
        return null; // 這個道具／世界沒有資料，不算失敗
      } else {
        lastErr = new Error('HTTP ' + res.status);
        if (res.status !== 429 && res.status < 500 && res.status !== 408) break; // 重試沒意義
        const ra = Number(res.headers.get('retry-after'));
        if (ra > 0) await sleep(Math.min(ra, 30) * 1000);
      }
    }
    if (i < tries - 1) { stats.retries++; await sleep(800 * (i + 1) * (i + 1)); }
  }
  stats.failed++;
  console.warn('請求失敗（重試後仍失敗）：' + url + ' — ' + (lastErr && lastErr.message));
  return undefined; // undefined＝失敗；null＝正常但沒資料
}

/* 簡單的併發池：同時最多 MAX_CONCURRENT 個 job 在跑（實際限速在 fetchJson 裡） */
async function runAll(jobs) {
  const results = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= jobs.length) return;
      results[i] = await jobs[i]();
    }
  }
  const workers = [];
  for (let k = 0; k < MAX_CONCURRENT; k++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

function chunkArray(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/* ── 讀道具清單：Universalis 的「可交易道具」∩ 網站有繁中名稱的道具 ── */
function loadTwNameIds() {
  const text = fs.readFileSync(NAMES_FILE, 'utf8');
  const names = new Function(text + '\n;return typeof ITEM_NAMES_TW_ALL !== "undefined" ? ITEM_NAMES_TW_ALL : null;')();
  if (!names) throw new Error('讀不到 ITEM_NAMES_TW_ALL：' + NAMES_FILE);
  return Object.keys(names).map(Number);
}

/* ── 聚合端點：賣速＋目前最低掛單價（掛單只當畫面上的參考，不進任何計算） ── */
function pickWorldNode(node) {
  if (!node) return null;
  return node.world || null;
}
/* 探測：在清單的開頭、中間、結尾各抓一批，全部沒有任何賣速或掛單資料（或查不到）＝這個世界是空的 */
async function probeWorldEmpty(worldName, itemIds) {
  const n = itemIds.length;
  const starts = [0, Math.floor(n / 2) - 50, n - 100].map(function (x) { return Math.max(0, x); });
  for (const st of starts) {
    const chunk = itemIds.slice(st, st + AGG_CHUNK);
    if (!chunk.length) continue;
    const data = await fetchJson(BASE + '/aggregated/' + encodeURIComponent(worldName) + '/' + chunk.join(','), 2);
    if (data === undefined) stats.failed--; // 探測失敗不算進失敗率（這只是在確認世界是不是空的）
    if (data && (data.results || []).some(function (r) {
      const nq = r.nq || {}, hq = r.hq || {};
      return pickWorldNode(nq.dailySaleVelocity) || pickWorldNode(hq.dailySaleVelocity) || pickWorldNode(nq.minListing) || pickWorldNode(hq.minListing);
    })) return false;
  }
  return true;
}
/* 最近一筆成交：{price, ts(秒)}。timestamp 可能是毫秒或秒，統一成秒；欄位不存在就是 null（前端會容許沒有） */
function parseRecent(node) {
  const n = pickWorldNode(node);
  if (!n || !(n.price > 0)) return null;
  let ts = Number(n.timestamp) || null;
  if (ts && ts > 1e12) ts = Math.floor(ts / 1000);
  return { price: Math.round(n.price), ts: ts };
}
async function fetchAggregated(worldName, itemIds) {
  const info = {}; // id -> { vN, vH, minP }
  let failedChunks = 0;
  const jobs = chunkArray(itemIds, AGG_CHUNK).map(function (chunk) {
    // 整批（100個）失敗時，以前整批道具就這樣從資料裡消失（而且只要總失敗率低於5%就照常發布）。
    // 現在失敗會拆成更小的批次重試（100→10→1），救回來的不算失敗，真的救不回來的才計入。
    const run = async function (ids) {
      const url = BASE + '/aggregated/' + encodeURIComponent(worldName) + '/' + ids.join(',');
      const data = await fetchJson(url);
      if (data === undefined && ids.length > 1) {
        stats.failed--; // 這次失敗先不算，拆小重試；還是失敗的小批次會各自重新計入
        const pieces = chunkArray(ids, ids.length > 10 ? 10 : 1);
        for (const piece of pieces) await run(piece);
        return;
      }
      if (data === undefined || data === null) { if (data === undefined) failedChunks++; return; }
      (data.results || []).forEach(function (r) {
        const nq = r.nq || {}, hq = r.hq || {};
        const vN = pickWorldNode(nq.dailySaleVelocity), vH = pickWorldNode(hq.dailySaleVelocity);
        const mN = pickWorldNode(nq.minListing), mH = pickWorldNode(hq.minListing);
        const prices = [mN && mN.price, mH && mH.price].filter(function (p) { return p > 0; });
        info[r.itemId] = {
          rN: parseRecent(nq.recentPurchase), rH: parseRecent(hq.recentPurchase),
          vN: (vN && vN.quantity) || 0, vH: (vH && vH.quantity) || 0,
          minP: prices.length ? Math.min.apply(null, prices) : null,
          minN: mN && mN.price > 0 ? mN.price : null, minH: mH && mH.price > 0 ? mH.price : null,
        };
      });
    };
    return function () { return run(chunk); };
  });
  await runAll(jobs);
  return { info: info, failedChunks: failedChunks };
}

/* ── 成交紀錄 ── */
function parseHistoryResponse(data, ids) {
  const out = {};
  if (!data) return out;
  if (ids.length === 1 && data.itemID != null) { out[data.itemID] = data.entries || data.recentHistory || []; return out; }
  const items = data.items || {};
  Object.keys(items).forEach(function (k) {
    const it = items[k];
    out[it.itemID != null ? it.itemID : k] = it.entries || it.recentHistory || [];
  });
  return out;
}
function slimEntries(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e && e.timestamp != null && e.pricePerUnit != null) out.push({ ts: e.timestamp, price: e.pricePerUnit, qty: e.quantity || 1, hq: !!e.hq });
  }
  return out;
}
/* 取回某個世界一批道具「最近 within 秒」的成交。單次請求有筆數上限（每個道具 1800 筆，新到舊），
 * 撞到上限的道具，用 entriesUntil 往更舊的方向續抓，直到涵蓋到 needCoverSec（或沒有更舊的了）。 */
async function fetchHistory(worldName, ids, within, needCoverSec, nowSec) {
  const result = {}; // id -> { entries, capped(仍然沒涵蓋到 needCover), failed }
  const jobs = chunkArray(ids, HIST_CHUNK).map(function (chunk) {
    return async function () {
      const url = BASE + '/history/' + encodeURIComponent(worldName) + '/' + chunk.join(',') +
        '?entriesWithin=' + within + '&entriesToReturn=' + HISTORY_CAP;
      const data = await fetchJson(url);
      if (data === undefined) {
        // 一批10個失敗（成交多的道具回應很大，最容易逾時）：不要整批放棄，改成一個一個重試
        if (chunk.length > 1) {
          stats.failed--;
          for (const id of chunk) {
            const one = await fetchJson(BASE + '/history/' + encodeURIComponent(worldName) + '/' + id + '?entriesWithin=' + within + '&entriesToReturn=' + HISTORY_CAP);
            if (one === undefined) { result[id] = { entries: [], failed: true }; continue; }
            let entries1 = slimEntries(parseHistoryResponse(one, [id])[id] || []);
            // 單一道具撞到筆數上限的情況很少，這裡不再翻頁，直接標記「沒涵蓋到」，讓上層保守處理（寧缺勿錯）
            result[id] = { entries: entries1, capped: entries1.length >= HISTORY_CAP };
          }
          return;
        }
        chunk.forEach(function (id) { result[id] = { entries: [], failed: true }; });
        return;
      }
      const parsed = parseHistoryResponse(data, chunk);
      for (const id of chunk) {
        let entries = slimEntries(parsed[id] || []);
        let capped = false;
        if (entries.length >= HISTORY_CAP) {
          // 撞到上限 → 往更舊的方向翻頁
          for (let page = 0; page < 12; page++) {
            const oldest = entries.reduce(function (m, e) { return Math.min(m, e.ts); }, Infinity);
            if (oldest <= nowSec - needCoverSec) break;
            const more = await fetchJson(BASE + '/history/' + encodeURIComponent(worldName) + '/' + id +
              '?entriesWithin=' + within + '&entriesToReturn=' + HISTORY_CAP + '&entriesUntil=' + Math.floor(oldest));
            if (more === undefined) { result[id] = { entries: entries, failed: true }; entries = null; break; }
            const older = slimEntries(parseHistoryResponse(more, [id])[id] || []).filter(function (e) { return e.ts < oldest; });
            if (!older.length) break;
            entries = entries.concat(older);
            if (older.length < HISTORY_CAP) break;
          }
          if (entries === null) continue;
          const oldest2 = entries.reduce(function (m, e) { return Math.min(m, e.ts); }, Infinity);
          capped = oldest2 > nowSec - needCoverSec; // 翻完還是沒涵蓋到
        }
        result[id] = { entries: entries, capped: capped };
      }
    };
  });
  await runAll(jobs);
  return result;
}

/* ── 窗口統計：每個視角（全部／NQ／HQ）在 24h、48h、3d、7d、30d 內的 筆數、單價加總、成交金額加總 ──
 * 三段抓取、三個頻率級距，逐級退讓，不設一個固定的賣速門檻：
 *   賣速高：24小時內 vs 48小時內（成交夠密集，看最近的變化就夠準）
 *   賣速中：3天內 vs 7天內（賣速高那組筆數不夠時退這一步）
 *   成交稀少：7天內 vs 30天內（賣速中還是不夠——例如高價道具好幾天才成交一次——用更長的時間換取足夠筆數，
 *             但仍然是「有持續成交」的道具，跟完全沒人買的道具不一樣）
 * accumulate 每次都把5個窗口全部填好，未涵蓋到的時間範圍自然不會有任何成交落進去（不會是錯誤的0，
 * 只是還沒抓那麼遠），buildP 依序嘗試三個級距，遇到資料不足就試下一個更長的，全部不夠才回傳 null。 */
const PERSP = ['all', 'nq', 'hq'];
function emptyW() { return { n: 0, sp: 0, sv: 0 }; }
function newAcc() {
  const a = {};
  PERSP.forEach(function (p) { a[p] = [emptyW(), emptyW(), emptyW(), emptyW(), emptyW()]; }); // 24h, 48h, 3d, 7d, 30d
  return a;
}
function accumulate(acc, entries, nowSec) {
  const limits = [H24, H48, D3, D7, D30];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const age = nowSec - e.ts;
    if (age < -60) continue; // 時鐘誤差保護
    const targets = e.hq ? ['all', 'hq'] : ['all', 'nq'];
    for (let w = 0; w < limits.length; w++) {
      if (age <= limits[w]) {
        for (const p of targets) {
          const cell = acc[p][w];
          cell.n++; cell.sp += e.price; cell.sv += e.price * e.qty;
        }
      }
    }
  }
}
function mergeAcc(into, from) {
  PERSP.forEach(function (p) {
    for (let w = 0; w < 5; w++) { into[p][w].n += from[p][w].n; into[p][w].sp += from[p][w].sp; into[p][w].sv += from[p][w].sv; }
  });
}
/* 依窗口統計決定這個道具落在哪個頻率級距，並輸出精簡陣列（P[0]：1=賣速高、2=賣速中、3=成交稀少）。
 * 三個級距都不夠資料就回傳 null（連「成交稀少」都夠不上，代表這30天內幾乎沒有成交）。
 * P[5]（成交金額）是窗口內的原始加總，沒有除以天數，交由讀取端依窗口天數自己換算成「每天」。 */
function buildP(win) {
  const w24 = win[0], w48 = win[1], w3 = win[2], w7 = win[3], w30 = win[4];
  const avg = function (w) { return Math.round(w.sp / w.n); };
  if (w24.n >= MIN_SHORT && w48.n >= MIN_LONG) return [1, w24.n, avg(w24), w48.n, avg(w48), Math.round(w48.sv)];
  if (w3.n >= MIN_SHORT && w7.n >= MIN_LONG) return [2, w3.n, avg(w3), w7.n, avg(w7), Math.round(w7.sv)];
  if (w7.n >= MIN_SHORT && w30.n >= MIN_LONG) return [3, w7.n, avg(w7), w30.n, avg(w30), Math.round(w30.sv)];
  return null;
}

/* 「全部」視角的四個窗口原始統計（詳情頁的均價徽章要的是「24小時內成交均價」，不管這個道具屬於哪個頻率級距） */
function buildD(win, reachedD7) {
  const avg = function (w) { return w.n ? Math.round(w.sp / w.n) : null; };
  return [win[0].n, avg(win[0]), win[1].n, avg(win[1]), reachedD7 ? win[2].n : null, reachedD7 ? avg(win[2]) : null, reachedD7 ? win[3].n : null, reachedD7 ? avg(win[3]) : null];
}

async function main() {
  const t0 = Date.now();
  const nowSec = Math.floor(Date.now() / 1000);

  // 1) 資料中心跟世界
  const dcs = await fetchJson(BASE + '/data-centers');
  const worlds = await fetchJson(BASE + '/worlds');
  if (!dcs || !worlds) throw new Error('抓不到資料中心／世界清單');
  const dc = dcs.find(function (d) { return d.name === DC_NAME; });
  if (!dc) throw new Error('找不到資料中心：' + DC_NAME);
  const worldName = {};
  worlds.forEach(function (w) { worldName[w.id] = w.name; });
  const dcWorlds = dc.worlds.map(function (id) { return { id: id, name: worldName[id] || String(id) }; });
  console.log('資料中心 ' + DC_NAME + '：' + dcWorlds.map(function (w) { return w.name; }).join('、'));

  // 2) 道具清單
  const marketable = await fetchJson(BASE + '/marketable');
  if (!Array.isArray(marketable) || marketable.length < 1000) throw new Error('可交易道具清單異常（' + (marketable && marketable.length) + '）');
  const twIds = new Set(loadTwNameIds());
  let itemIds = marketable.filter(function (id) { return twIds.has(id); }).sort(function (a, b) { return a - b; });
  if (ITEM_LIMIT > 0) itemIds = itemIds.slice(0, ITEM_LIMIT);
  console.log('道具：可交易 ' + marketable.length + '，其中有繁中名稱 ' + itemIds.length);

  // 3) 逐世界抓取並計算窗口統計（DC 範圍＝各世界統計相加）
  const perWorld = {};   // worldId -> { id -> { acc, has7d, vN, vH, minP } }
  for (const w of dcWorlds) {
    const tw = Date.now();
    if (EMPTY_OK_WORLDS.indexOf(w.name) !== -1 && await probeWorldEmpty(w.name, itemIds)) {
      console.log(w.name + '：沒有任何成交／掛單資料（預期內，非玩家世界），略過');
      perWorld[w.id] = {};
      continue;
    }
    const agg = await fetchAggregated(w.name, itemIds);
    // 「有交易跡象」的候選：賣速>0，或賣速被Universalis四捨五入成0但仍有「最近一筆成交」紀錄
    // （幾天才成交一次的高價道具常常是這種情況——這正是「成交稀少」級距要抓住的對象，
    // 不能只看賣速>0，不然這批道具連第一步的48小時查詢都不會被派到）。
    // 「有交易跡象」的候選：以前只看「賣速>0」，這樣會漏掉高價、好幾天才成交一次的道具——
    // Universalis 回報的賣速是四捨五入／取整的估計值，成交太少時常常直接顯示 0，即使那個道具
    // 其實一直都有人在買賣。改成「賣速>0，或目前市場上有掛單」：只要有掛單，就代表買賣雙方
    // 都還把這個道具當成活躍商品，值得花一次48小時查詢去確認到底有沒有成交、多久成交一次；
    // 真正完全沒人要、連掛單都沒有的道具，才會被排除（這些道具本來就沒有漲跌可言）。
    const active = itemIds.filter(function (id) { const i = agg.info[id]; return i && (i.vN + i.vH > 0 || i.minP != null); });

    // 階段A：48小時成交（賣速高這個級距）
    const histA = await fetchHistory(w.name, active, H48, H48, nowSec);
    const table = {};
    const needB = [];
    let failedItems = 0;
    active.forEach(function (id) {
      const h = histA[id];
      if (!h || h.failed) {
        // 成交紀錄抓不到，但 aggregated 已經有這個道具的掛單價／賣速：仍然留一列（沒有成交統計），
        // 這樣製作商機才查得到它的價格；以前這種道具會整個消失，導致材料被誤判成「沒有價格」。
        failedItems++;
        table[id] = { acc: newAcc(), reachedD7: false, active: false };
        return;
      }
      const acc = newAcc();
      accumulate(acc, h.entries, nowSec);
      table[id] = { acc: acc, reachedD7: false, active: true };
      if (buildP(acc.all) === null) needB.push(id); // 賣速高這個級距不夠資料 → 試著抓更長的範圍
    });

    // 階段B：7天成交（賣速中這個級距）
    const needC = [];
    if (needB.length) {
      const histB = await fetchHistory(w.name, needB, D7, D7, nowSec);
      needB.forEach(function (id) {
        const h = histB[id];
        if (!h || h.failed || h.capped) return; // 沒抓全就不覆蓋（保留階段A的結果，寧可缺，不要算錯）
        const acc = newAcc();
        accumulate(acc, h.entries, nowSec);
        table[id] = { acc: acc, reachedD7: true, active: true };
        if (buildP(acc.all) === null) needC.push(id); // 賣速中還是不夠 → 再試更長的30天
      });
    }

    // 階段C：30天成交（成交稀少這個級距——賣速中都不夠資料，例如好幾天才賣出一件的高價道具）
    if (needC.length) {
      const histC = await fetchHistory(w.name, needC, D30, D30, nowSec);
      needC.forEach(function (id) {
        const h = histC[id];
        if (!h || h.failed || h.capped) return;
        const acc = newAcc();
        accumulate(acc, h.entries, nowSec);
        table[id] = { acc: acc, reachedD7: true, active: true };
      });
    }
    Object.keys(table).forEach(function (id) {
      const i = agg.info[id];
      table[id].vN = i.vN; table[id].vH = i.vH; table[id].minP = i.minP; table[id].minN = i.minN; table[id].minH = i.minH;
      table[id].rN = i.rN; table[id].rH = i.rH;
    });
    perWorld[w.id] = table;
    console.log(w.name + '：有交易跡象 ' + active.length + ' 項，中頻補查 ' + needB.length + ' 項，稀少補查 ' + needC.length + ' 項，失敗 ' + failedItems + ' 項，' + ((Date.now() - tw) / 1000).toFixed(0) + ' 秒');
  }

  // 4) 輸出各範圍
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const scopes = {};
  let totalRows = 0;
  function writeScope(key, file, table, title) {
    const items = {};
    let count = 0;
    Object.keys(table).forEach(function (id) {
      const t = table[id];
      const row = [
        Math.round(t.vN * 10) / 10, Math.round(t.vH * 10) / 10, t.minP == null ? null : Math.round(t.minP),
        buildP(t.acc.all), buildP(t.acc.nq), buildP(t.acc.hq),
        t.active ? buildD(t.acc.all, t.reachedD7) : null,
        [t.minN == null ? null : Math.round(t.minN), t.minH == null ? null : Math.round(t.minH)],
        [t.rN ? t.rN.price : null, t.rN ? t.rN.ts : null, t.rH ? t.rH.price : null, t.rH ? t.rH.ts : null],
      ];
      items[id] = row; count++;
    });
    fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify({ v: 1, scope: title, items: items }));
    scopes[key] = { file: file, items: count };
    totalRows += count;
  }
  dcWorlds.forEach(function (w) { writeScope(w.name, 'w' + w.id + '.json', perWorld[w.id], w.name); });

  const dcTable = {};
  dcWorlds.forEach(function (w) {
    const tbl = perWorld[w.id] || {};
    Object.keys(tbl).forEach(function (id) {
      const src = tbl[id];
      let dst = dcTable[id];
      if (!dst) { dst = dcTable[id] = { acc: newAcc(), reachedD7: true, active: false, vN: 0, vH: 0, minP: null, minN: null, minH: null, rN: null, rH: null }; }
      if (src.active) dst.active = true;
      // 最近一筆成交：各世界取「時間最新」的那一筆
      ['rN', 'rH'].forEach(function (k) { if (src[k] && (!dst[k] || (src[k].ts || 0) > (dst[k].ts || 0))) dst[k] = src[k]; });
      mergeAcc(dst.acc, src.acc);
      if (src.active) dst.reachedD7 = dst.reachedD7 && src.reachedD7; // 只要有一個「有成交」的世界沒有7天以上資料，DC 範圍就只能用賣速高這個級距（寧缺勿錯）；只有掛單沒成交的世界不影響
      dst.vN += src.vN; dst.vH += src.vH;
      if (src.minP != null) dst.minP = dst.minP == null ? src.minP : Math.min(dst.minP, src.minP);
      if (src.minN != null) dst.minN = dst.minN == null ? src.minN : Math.min(dst.minN, src.minN);
      if (src.minH != null) dst.minH = dst.minH == null ? src.minH : Math.min(dst.minH, src.minH);
    });
  });
  writeScope('ALL', 'dc.json', dcTable, '所有世界');

  // 5) 安全檢查：失敗率、跟上一次比道具數量
  const failRatio = stats.requests ? stats.failed / stats.requests : 0;
  console.log('請求 ' + stats.requests + ' 次，重試 ' + stats.retries + ' 次，最終失敗 ' + stats.failed + ' 次（' + (failRatio * 100).toFixed(2) + '%）');
  if (failRatio > MAX_FAIL_RATIO) throw new Error('失敗率過高（' + (failRatio * 100).toFixed(1) + '%），這次結果不採用');
  if (scopes.ALL.items < 100 && ITEM_LIMIT === 0) throw new Error('所有世界範圍只有 ' + scopes.ALL.items + ' 個道具，資料異常，這次結果不採用');
  if (PREV_META_URL) {
    try {
      const res = await fetch(PREV_META_URL, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        const prev = await res.json();
        const prevRows = Object.keys(prev.scopes || {}).reduce(function (s, k) { return s + (prev.scopes[k].items || 0); }, 0);
        if (prevRows > 0 && totalRows < prevRows * MIN_KEEP_RATIO) throw new Error('道具數量從 ' + prevRows + ' 掉到 ' + totalRows + '（低於 ' + (MIN_KEEP_RATIO * 100) + '%），這次結果不採用');
        console.log('與上一次比對：' + prevRows + ' → ' + totalRows);
      } else { console.log('沒有上一次的資料可比對（HTTP ' + res.status + '），略過比對'); }
    } catch (e) {
      if (/不採用/.test(e.message)) throw e;
      console.log('讀取上一次資料失敗，略過比對：' + e.message);
    }
  }

  const meta = {
    v: 1, generatedAt: new Date(nowSec * 1000).toISOString(), generatedAtMs: nowSec * 1000, dc: DC_NAME,
    scopes: scopes,
    rules: { minShort: MIN_SHORT, minLong: MIN_LONG, high: [H24, H48], low: [D3, D7] },
    stats: { requests: stats.requests, failed: stats.failed, retries: stats.retries, seconds: Math.round((Date.now() - t0) / 1000) },
  };
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta));
  console.log('完成，共 ' + totalRows + ' 筆，耗時 ' + meta.stats.seconds + ' 秒，輸出到 ' + OUT_DIR);
}

main().catch(function (e) { console.error('更新失敗：' + e.message); process.exit(1); });
