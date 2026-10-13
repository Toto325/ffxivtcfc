#!/usr/bin/env node
/**
 * 把管線輸出整理成網站實際載入的 3 個檔案，並在寫入前做「有原因的變動檢查」。
 *
 *   data/obtain.json    取得方式：兌換、NPC 商店、副本、寶箱、掉落、採集…（含 NPC、地名、地圖等實體資料）
 *   data/exchange.json  代幣兌換換算路徑
 *   data/lunar.json     月球製作
 *
 * 變動檢查（自動更新用）：與目前 data/ 內的上一版逐筆比對，每一筆「消失」的資料都要能用已知機制解釋：
 *   強原因（有明確證據，算已解釋）：物品已不在台服／已被標為無法取得、商店已不在台服兌換店資料表、
 *                                   台服商店已不再賣該物品、副本/危命任務/任務/成就/怪物…已不在台服名稱表、
 *                                   NPC 已沒有繁中名稱、物品已不在任何台服金幣商店。
 *   對不上任何強原因的 → 視為「無法解釋」。無法解釋的筆數超過門檻（max(20, 上一版總筆數的 0.1%)）
 *   就停止（結束代碼 3），不寫入新檔案，保留上一版。狀態改變（dead / seasonal）不算消失。
 *
 * 用法：node build-site-data.mjs [--site-dir ../../data] [--force] [--offline]
 *   --force  略過變動檢查（確認過差異是正常的才用）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OUT_DIR, flags, log, teamcraftJson, twCsvText, parseTwCsv, toInt } from './lib/common.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const siteDir = path.resolve(here, argv.includes('--site-dir') ? argv[argv.indexOf('--site-dir') + 1] : '../../data');
const force = flags.has('--force');

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const readOut = (n) => readJson(path.join(OUT_DIR, n));
const sortedByNumericKey = (obj) => Object.fromEntries(Object.entries(obj).sort((a, b) => Number(a[0]) - Number(b[0])));

// ───────────────────────── 組合 ─────────────────────────
function composeObtain(obt, src, extra) {
  const items = {};
  for (const [id, e] of Object.entries(obt.items)) {
    items[id] = {};
    if (e.trades) items[id].trades = e.trades;   // 陣列順序不可改：exchange.json 以 [物品, 索引] 回查
    if (e.vendors) items[id].vendors = e.vendors;
  }
  const craftDead = [];
  for (const [id, e] of Object.entries(src.items)) {
    items[id] ||= {};
    for (const [type, value] of Object.entries(e)) {
      if (type === 'craft') { for (const rc of value) if (rc.dead) craftDead.push(String(rc.id)); continue; } // 配方本體網站已有，只保留「素材已過期」的清單
      items[id][type] = value;
    }
    if (!Object.keys(items[id]).length) delete items[id];
  }
  const ent = src.entities;
  return {
    meta: {
      twPatch: obt.meta.twPatch, tomestoneRotation: obt.meta.tomestoneRotation,
      counts: { items: Object.keys(items).length, npcs: Object.keys(obt.npcs).length },
      note: 'items[物品].trades/vendors：兌換與 NPC 商店；其餘為其他取得方式。trades[].status：active / seasonal / dead。',
    },
    items: sortedByNumericKey(items),
    craftDead: [...new Set(craftDead)].sort((a, b) => Number(a) - Number(b)),
    entities: {
      npcs: sortedByNumericKey(Object.fromEntries(Object.entries(obt.npcs).map(([id, n]) => [id, extra.npcTitles[id] ? { ...n, title: extra.npcTitles[id] } : n]))),
      shops: sortedByNumericKey(extra.shops),
      treasureMaps: extra.treasureMaps,
      places: sortedByNumericKey({ ...ent.places, ...obt.places }),
      maps: sortedByNumericKey({ ...ent.maps, ...obt.maps }),
      instances: sortedByNumericKey(ent.instances), fates: sortedByNumericKey(ent.fates), quests: sortedByNumericKey(ent.quests),
      achievements: sortedByNumericKey(ent.achievements), mobs: sortedByNumericKey(ent.mobs), ventures: sortedByNumericKey(ent.ventures),
      voyages: ent.voyages, contentTypes: ent.contentTypes, gatheringTypes: ent.gatheringTypes,
    },
  };
}

function composeExchange(graph) {
  return {
    meta: { ...graph.meta, generatedAt: undefined },
    // 邊只保留換算需要的欄位；NPC、商店等顯示資料請由 ref（[物品, trades 索引]）回查 obtain.json
    edges: graph.edges.map((e) => ({
      ref: [e.ref.item, e.ref.idx], costs: e.costs, result: e.result, resultTradable: e.resultTradable,
      ...(e.unlock ? { unlock: e.unlock } : {}), ...(e.gcRank ? { gcRank: e.gcRank } : {}),
    })),
    paths: graph.paths,
  };
}

// 補充顯示用資料：NPC 頭銜、兌換店名稱、藏寶圖物品清單（藏寶圖 = 尋寶玩法，其他「開箱獲得」的容器不是）
async function loadExtra(obt) {
  const [titles, treasures] = await Promise.all([teamcraftJson('json/tw/tw-npc-titles.json'), teamcraftJson('json/treasures.json')]);
  const npcTitles = {};
  for (const id of Object.keys(obt.npcs)) { const t = titles[id]?.tw; if (t) npcTitles[id] = t; }
  const used = new Set();
  for (const e of Object.values(obt.items)) for (const t of e.trades || []) for (const sid of t.shopIds || []) used.add(sid);
  const shops = {};
  const { names, rows } = parseTwCsv(await twCsvText('SpecialShop'));
  const nc = names.indexOf('Name');
  for (const r of rows) { const id = toInt(r[0]); if (used.has(id) && r[nc]) shops[id] = r[nc]; }
  const treasureMaps = [...new Set(treasures.filter((x) => x && typeof x === 'object' && x.item).map((x) => x.item))].sort((a, b) => a - b);
  return { npcTitles, shops, treasureMaps };
}

// ───────────────────────── 變動檢查 ─────────────────────────
const flat = (v) => (Array.isArray(v) ? v.flat(Infinity) : [v]);

function keysOf(itemId, e) {
  const out = [];
  const add = (kind, id, extra = {}) => out.push({ key: `${kind}|${itemId}|${id}`, kind, item: Number(itemId), id, ...extra });
  for (const t of e.trades || []) for (const s of t.shopIds || []) add('T', s, { shopType: t.shopType });
  for (const v of e.vendors || []) add('V', v.npcId);
  for (const x of flat(e.instances || [])) add('I', x);
  for (const g of e.gathering || []) for (const n of g.nodes || []) add('G', n.id, { zoneId: n.zoneId });
  for (const a of e.alarms || []) add('A', a.nodeId, { zoneId: a.zoneId });
  for (const d of e.drops || []) add('D', `${d.mob}@${d.zoneId}`, { mob: d.mob });
  for (const f of e.fates || []) add('F', f.id);
  for (const n of e.ventures || []) add('N', n.id);
  for (const x of flat(e.quests || [])) add('Q', x);
  for (const x of flat(e.achievements || [])) add('C', x);
  for (const x of flat(e.treasures || [])) add('X', x);
  for (const x of flat(e.reduction || [])) add('R', x);
  for (const x of flat(e.desynth || [])) add('S', x);
  for (const x of flat(e.masterbooks || [])) add('M', x);
  for (const x of e.voyages || []) add('Y', x);
  for (const x of e.requirements || []) add('E', x.id);
  return out;
}

async function loadReasons() {
  const names = ['tw-items', 'tw-npcs', 'tw-instances', 'tw-fates', 'tw-quests', 'tw-achievements', 'tw-mobs', 'tw-ventures', 'tw-places', 'tw-airship-voyages', 'tw-submarine-voyages'];
  const [deprecated, ...tw] = await Promise.all([teamcraftJson('json/deprecated-items.json'), ...names.map((n) => teamcraftJson(`json/tw/${n}.json`))]);
  const T = Object.fromEntries(names.map((n, i) => [n, tw[i]]));
  const shops = new Map();
  {
    const { names: cols, rows } = parseTwCsv(await twCsvText('SpecialShop'));
    const rc = cols.map((n, i) => (/^Item\{Receive\}\[\d+\]\[\d+\]$/.test(n) ? i : -1)).filter((i) => i >= 0);
    for (const r of rows) { const set = new Set(); for (const c of rc) { const v = toInt(r[c]); if (v > 0) set.add(v); } shops.set(toInt(r[0]), set); }
  }
  const gilItems = new Set();
  {
    const { names: cols, rows } = parseTwCsv(await twCsvText('GilShopItem'));
    const ic = cols.indexOf('Item');
    for (const r of rows) { const v = toInt(r[ic]); if (v > 0) gilItems.add(v); }
  }
  const has = (table, id) => Boolean(T[table][String(id)]?.tw || T[table][String(id)]?.name?.tw);
  return function explain(k) {
    const idStr = String(k.item);
    if (!T['tw-items'][idStr]?.tw) return { strong: true, reason: 'item-not-in-tw' };
    if (Object.prototype.hasOwnProperty.call(deprecated, idStr)) return { strong: true, reason: 'item-deprecated' };
    switch (k.kind) {
      case 'T':
        if (k.shopType === 'SpecialShop') {
          if (!shops.has(Number(k.id))) return { strong: true, reason: 'shop-not-in-tw' };
          if (!shops.get(Number(k.id)).has(k.item)) return { strong: true, reason: 'tw-shop-no-longer-sells' };
        }
        return { strong: false, reason: 'unknown-trade' };
      case 'V':
        if (!T['tw-npcs'][String(k.id)]?.tw) return { strong: true, reason: 'npc-no-tw-name' };
        if (!gilItems.has(k.item)) return { strong: true, reason: 'removed-from-tw-gilshops' };
        return { strong: false, reason: 'unknown-vendor' };
      case 'I': return has('tw-instances', k.id) ? { strong: false, reason: 'unknown-instance' } : { strong: true, reason: 'instance-not-in-tw' };
      case 'F': return has('tw-fates', k.id) ? { strong: false, reason: 'unknown-fate' } : { strong: true, reason: 'fate-not-in-tw' };
      case 'Q': return has('tw-quests', k.id) ? { strong: false, reason: 'unknown-quest' } : { strong: true, reason: 'quest-not-in-tw' };
      case 'C': return has('tw-achievements', k.id) ? { strong: false, reason: 'unknown-achievement' } : { strong: true, reason: 'achievement-not-in-tw' };
      case 'D': return has('tw-mobs', k.mob) ? { strong: false, reason: 'unknown-drop' } : { strong: true, reason: 'mob-not-in-tw' };
      case 'N': return has('tw-ventures', k.id) ? { strong: false, reason: 'unknown-venture' } : { strong: true, reason: 'venture-not-in-tw' };
      case 'G': case 'A': return k.zoneId && !T['tw-places'][String(k.zoneId)]?.tw ? { strong: true, reason: 'place-not-in-tw' } : { strong: false, reason: 'unknown-node' };
      case 'Y': { const [type, id] = String(k.id).split('-'); const tb = type === '0' ? 'tw-airship-voyages' : 'tw-submarine-voyages'; return T[tb][id]?.tw ? { strong: false, reason: 'unknown-voyage' } : { strong: true, reason: 'voyage-not-in-tw' }; }
      default: return { strong: false, reason: `unknown-${k.kind}` };
    }
  };
}

async function guard(prev, next) {
  const indexOf = (obtain) => {
    const m = new Map();
    for (const [id, e] of Object.entries(obtain.items)) for (const k of keysOf(id, e)) m.set(k.key, k);
    return m;
  };
  const before = indexOf(prev); const after = indexOf(next);
  const removed = [...before.values()].filter((k) => !after.has(k.key));
  const added = [...after.keys()].filter((k) => !before.has(k)).length;
  const explain = await loadReasons();
  const strong = {}; const weak = [];
  for (const k of removed) {
    const r = explain(k);
    if (r.strong) strong[r.reason] = (strong[r.reason] || 0) + 1; else weak.push({ key: k.key, reason: r.reason });
  }
  const threshold = Math.max(20, Math.ceil(before.size * 0.001));
  return { previousKeys: before.size, currentKeys: after.size, added, removed: removed.length, explainedByStrongReasons: strong, unexplained: weak.length, threshold, ok: weak.length <= threshold, unexplainedSample: weak.slice(0, 30) };
}

// ───────────────────────── 主流程 ─────────────────────────
async function main() {
  const obt = readOut('obtainable.json'); const src = readOut('sources.json');
  const graph = readOut('exchange-graph.json'); const lunar = readOut('lunar.json');
  const extra = await loadExtra(obt);
  const next = { 'obtain.json': composeObtain(obt, src, extra), 'exchange.json': composeExchange(graph), 'lunar.json': { ...lunar, meta: { ...lunar.meta, generatedAt: undefined } } };

  const prevFile = path.join(siteDir, 'obtain.json');
  let report = { firstRun: true };
  if (fs.existsSync(prevFile)) {
    report = await guard(readJson(prevFile), next['obtain.json']);
    log('\n── 變動檢查 ──');
    log(JSON.stringify(report, null, 2));
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'changes.json'), JSON.stringify(report, null, 2));
    if (!report.ok && !force) {
      console.error(`\n✘ 無法解釋的消失資料 ${report.unexplained} 筆，超過門檻 ${report.threshold}。已停止，不寫入新檔案（保留上一版）。`);
      console.error('  若確認差異正常，可加 --force 重跑；詳見上方 unexplainedSample。');
      process.exit(3);
    }
  } else log('（第一次建置，沒有上一版可比對）');

  fs.mkdirSync(siteDir, { recursive: true });
  for (const [name, data] of Object.entries(next)) {
    const f = path.join(siteDir, name);
    fs.writeFileSync(f, JSON.stringify(data));
    log(`✔ ${path.relative(process.cwd(), f)}（${(fs.statSync(f).size / 1e6).toFixed(2)} MB）`);
  }
}

main().catch((e) => { console.error('✘', e.message); process.exit(1); });
