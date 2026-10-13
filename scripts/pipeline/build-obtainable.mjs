#!/usr/bin/env node
/**
 * 兌換（Trade）與 NPC 商店（Vendor）資料建置
 *
 * 資料來源：
 *   Teamcraft  extracts.json          → 「誰賣什麼、位置」的關係與座標
 *   Teamcraft  tw/tw-*.json           → 繁中名稱（只當名稱查詢表，不當篩選依據）
 *   繁中服 CSV ENpcBase               → NPC 實際連到哪些商店（台服是否真的可用）
 *   繁中服 CSV SpecialShop            → 兌換店在台服實際賣什麼
 *   繁中服 CSV GilShopItem            → 金幣商店在台服實際賣什麼
 *
 * 用法：
 *   node build-obtainable.mjs                 下載並建置（輸出到 ./out）
 *   node build-obtainable.mjs --offline       只用 .cache 內的檔案
 *   node build-obtainable.mjs --pretty        輸出易讀的 JSON（除錯用）
 *
 * 環境變數：
 *   TEAMCRAFT_DIR   本機已有 Teamcraft 的 libs/data/src/lib 目錄時使用
 *   PIPELINE_OUT    輸出目錄（預設 ./out）
 */
import path from 'path';
import {
  OUT_DIR, flags, log, teamcraftJson, twCsvText, parseTwCsv, toInt, writeJson, count,
} from './lib/common.mjs';
import { loadShopGraph } from './lib/shopGraph.mjs';

const TYPE_TRADE = 2;
const TYPE_VENDOR = 3;

async function main() {
  log('讀取來源…');
  const [extracts, npcsJson, mapsJson, twNpcs, twPlaces, twItems, deprecated] = await Promise.all([
    teamcraftJson('extracts/extracts.json'),
    teamcraftJson('json/npcs.json'),
    teamcraftJson('json/maps.json'),
    teamcraftJson('json/tw/tw-npcs.json'),
    teamcraftJson('json/tw/tw-places.json'),
    teamcraftJson('json/tw/tw-items.json'),
    teamcraftJson('json/deprecated-items.json'),
  ]);
  const [enpcText, shopText, gilText] = await Promise.all([
    twCsvText('ENpcBase'), twCsvText('SpecialShop'), twCsvText('GilShopItem'),
  ]);

  // ── 繁中服：NPC → 商店編號集合 ──
  const npcLinks = new Map();
  {
    const { names, rows } = parseTwCsv(enpcText);
    const cols = names.map((n, i) => (/^ENpcData\[\d+\]$/.test(n) ? i : -1)).filter((i) => i >= 0);
    if (!cols.length) throw new Error('ENpcBase.csv 找不到 ENpcData 欄位（資料表格式可能已改版）');
    for (const r of rows) {
      const set = new Set();
      for (const c of cols) { const v = toInt(r[c]); if (v > 0) set.add(v); }
      npcLinks.set(toInt(r[0]), set);
    }
  }
  // ── 繁中服：兌換店 → 實際賣出的物品 ──
  const specialShopItems = new Map();
  const specialShopSlots = new Map();
  {
    const { names, rows } = parseTwCsv(shopText);
    const cols = names.map((n, i) => (/^Item\{Receive\}\[\d+\]\[\d+\]$/.test(n) ? i : -1)).filter((i) => i >= 0);
    if (!cols.length) throw new Error('SpecialShop.csv 找不到 Item{Receive} 欄位（資料表格式可能已改版）');
    const col = (name) => names.indexOf(name);
    for (const r of rows) {
      const set = new Set();
      for (const c of cols) { const v = toInt(r[c]); if (v > 0) set.add(v); }
      specialShopItems.set(toInt(r[0]), set);
      // 每個兌換槽的解鎖條件（任務、成就）與加入版本，以「成品物品」為鍵
      const slots = new Map();
      for (let s = 0; s < 60; s += 1) {
        const q = col(`Quest{Item}[${s}]`); const a = col(`AchievementUnlock[${s}]`); const pt = col(`PatchNumber[${s}]`);
        if (q < 0 || a < 0) break;
        const quest = toInt(r[q]); const achievement = toInt(r[a]); const patch = pt >= 0 ? toInt(r[pt]) : 0;
        for (const k of [0, 1]) {
          const item = toInt(r[col(`Item{Receive}[${s}][${k}]`)]);
          if (!item) continue;
          if (!slots.has(item)) slots.set(item, []);
          slots.get(item).push({ quest, achievement, patch });
        }
      }
      specialShopSlots.set(toInt(r[0]), slots);
    }
  }
  // ── 繁中服：金幣商店 → 物品 ──
  const gilShopItems = new Map();
  {
    const { names, rows } = parseTwCsv(gilText);
    const itemCol = names.indexOf('Item');
    if (itemCol < 0) throw new Error('GilShopItem.csv 找不到 Item 欄位');
    for (const r of rows) {
      const shopId = toInt(String(r[0]).split('.')[0]);
      if (!gilShopItems.has(shopId)) gilShopItems.set(shopId, new Set());
      const v = toInt(r[itemCol]);
      if (v > 0) gilShopItems.get(shopId).add(v);
    }
  }
  const graph = await loadShopGraph();
  const reachOf = (npcId) => graph.reachForNpc(npcId, npcLinks.get(npcId));
  log(`  台服 NPC ${npcLinks.size}、兌換店 ${specialShopItems.size}、金幣商店 ${gilShopItems.size}、轉接關係 ${graph.edgeCount}`);

  const isDead = (id) => Object.prototype.hasOwnProperty.call(deprecated, String(id));
  const hasTwItem = (id) => Boolean(twItems[String(id)]?.tw);
  const twNpcName = (id) => twNpcs[String(id)]?.tw || '';

  const dropped = {};        // 被丟掉的原因統計
  const kept = {};           // 保留的統計
  const linkStats = {};      // 各商店類型的「NPC 連結檢查」通過率
  const positions = new Map(); // npcId → Map(key → {zoneId,mapId,x,y})
  const usedNpcs = new Set();
  const usedMaps = new Set();
  const usedZones = new Set();
  const items = {};

  function notePosition(npcId, p) {
    if (!p) return;
    const { zoneId, mapId, x, y } = p;
    if (x === undefined || y === undefined || !mapId) return;
    const key = `${mapId}|${x}|${y}`;
    if (!positions.has(npcId)) positions.set(npcId, new Map());
    positions.get(npcId).set(key, { zoneId, mapId, x, y });
  }
  function npcPositionFallback(npcId) {
    const p = npcsJson[String(npcId)]?.position;
    return p ? { zoneId: p.zoneid, mapId: p.map, x: p.x, y: p.y } : null;
  }

  for (const [itemKey, entry] of Object.entries(extracts)) {
    const itemId = toInt(itemKey);
    const sources = entry.sources || [];
    const hasWanted = sources.some((s) => s.type === TYPE_TRADE || s.type === TYPE_VENDOR);
    if (!hasWanted) continue;
    if (!hasTwItem(itemId)) { count(dropped, '物品不在台服（整個物品略過）'); continue; }

    const outTrades = new Map();
    const outVendors = new Map();

    for (const src of sources) {
      // ───── 兌換 ─────
      if (src.type === TYPE_TRADE) {
        for (const shop of src.data || []) {
          const shopType = shop.type || 'unknown';
          // 各 NPC 的檢查
          const validNpcs = [];
          for (const n of shop.npcs || []) {
            const nid = typeof n === 'object' ? n.id : n;
            if (!twNpcName(nid)) { count(dropped, 'NPC 沒有繁中名稱'); continue; }
            const linked = reachOf(nid).has(shop.id);
            linkStats[shopType] ||= { pass: 0, fail: 0 };
            linkStats[shopType][linked ? 'pass' : 'fail'] += 1;
            // 只有 SpecialShop 能用 ENpcBase 驗證；其他類型（公會商店等）的編號不放在 ENpcData。
            // 無法證明的 NPC 不丟掉，改標記為「未驗證」，讓前端自行決定是否顯示或降低排序
            const proven = linked && shopType === 'SpecialShop';
            if (!proven) count(dropped, '（保留但未驗證）NPC 無法證明連到這家店');
            validNpcs.push({ n, proven });
          }
          for (const trade of shop.trades || []) {
            const result = (trade.items || []).find((i) => i.id === itemId);
            if (!result) { count(dropped, '交易內容找不到成品'); continue; }
            const costs = (trade.currencies || []).map((c) => ({ id: c.id, amount: c.amount, ...(c.hq ? { hq: true } : {}) }));
            if (!costs.length) { count(dropped, '交易沒有貨幣'); continue; }
            if (costs.some((c) => !hasTwItem(c.id))) { count(dropped, '貨幣物品不在台服'); continue; }
            if (shopType === 'SpecialShop' && !specialShopItems.get(shop.id)?.has(itemId)) {
              count(dropped, '兌換店在台服沒有賣這個物品'); continue;
            }
            if (!validNpcs.length) { count(dropped, '兌換沒有任何有效的 NPC'); continue; }

            const slotInfo = shopType === 'SpecialShop' ? (specialShopSlots.get(shop.id)?.get(itemId) || []) : [];
            const quests = [...new Set(slotInfo.map((x) => x.quest).filter(Boolean))];
            const achievements = [...new Set(slotInfo.map((x) => x.achievement).filter(Boolean))];
            // 同一店內同一成品有多個兌換槽且條件不同時，無法精確配對 → 標記 ambiguous，不猜
            const ambiguous = new Set(slotInfo.map((x) => `${x.quest}|${x.achievement}`)).size > 1;
            const unlock = (quests.length || achievements.length)
              ? { ...(quests.length ? { quests } : {}), ...(achievements.length ? { achievements } : {}), ...(ambiguous ? { ambiguous: true } : {}) } : null;
            const gcRank = trade.requiredGCRank || 0;
            const key = JSON.stringify([costs, result.amount, unlock, gcRank]);
            const deadCosts = costs.filter((c) => isDead(c.id)).map((c) => c.id);
            if (!outTrades.has(key)) outTrades.set(key, { shopIds: [], shopType, amount: result.amount, costs, npcIds: [], unverifiedNpcIds: [], ...(unlock ? { unlock } : {}), ...(gcRank ? { gcRank } : {}), ...(deadCosts.length ? { dead: true, deadReason: 'currency-deprecated', deadItems: deadCosts } : {}) });
            const t = outTrades.get(key);
            if (!t.shopIds.includes(shop.id)) t.shopIds.push(shop.id);
            for (const { n, proven } of validNpcs) {
              const nid = typeof n === 'object' ? n.id : n;
              if (!t.npcIds.includes(nid)) t.npcIds.push(nid);
              if (!proven && !t.unverifiedNpcIds.includes(nid)) t.unverifiedNpcIds.push(nid);
              if (proven) t.unverifiedNpcIds = t.unverifiedNpcIds.filter((x) => x !== nid);
              if (typeof n === 'object') notePosition(nid, { zoneId: n.zoneId, mapId: n.mapId, ...(n.coords || {}) });
              usedNpcs.add(nid);
            }
          }
        }
      }
      // ───── 金幣商店 ─────
      if (src.type === TYPE_VENDOR) {
        for (const v of src.data || []) {
          if (!twNpcName(v.npcId)) { count(dropped, 'NPC 沒有繁中名稱'); continue; }
          if (!npcLinks.has(v.npcId)) { count(dropped, '台服沒有這個 NPC'); continue; }
          const gilShops = [...reachOf(v.npcId)].filter((id) => gilShopItems.has(id));
          let verified = false;
          if (gilShops.length) {
            if (gilShops.some((id) => gilShopItems.get(id).has(itemId))) verified = true;
            else { count(dropped, '台服金幣商店沒有賣這個物品'); continue; }
          } // 沒有直接連到金幣商店（例如透過選單轉接）→ 無法驗證，保留並標記 verified:false
          const key = `${v.npcId}|${v.price}`;
          if (!outVendors.has(key)) outVendors.set(key, { npcId: v.npcId, price: v.price, verified, ...(v.festival ? { festival: v.festival } : {}) });
          notePosition(v.npcId, { zoneId: v.zoneId, mapId: v.mapId, ...(v.coords || {}) });
          usedNpcs.add(v.npcId);
        }
      }
    }

    if (outTrades.size || outVendors.size) {
      items[itemKey] = {};
      if (outTrades.size) {
        // 同一物品、同一店型、同一組成本物品、同樣解鎖條件下，若有「每種成本都不高於、且至少一種更低」的變體，
        // 高成本者視為被取代（遊戲改版放寬需求後資料表仍留有舊版）。保留不刪除，標記 superseded。
        const list = [...outTrades.values()];
        const groups = new Map();
        for (const t of list) {
          const gk = JSON.stringify([t.shopType, t.unlock || null, t.gcRank || 0, t.costs.map((c) => c.id).sort((a, b) => a - b)]);
          if (!groups.has(gk)) groups.set(gk, []);
          groups.get(gk).push(t);
        }
        for (const grp of groups.values()) {
          if (grp.length < 2) continue;
          const amt = (t, id) => t.costs.find((c) => c.id === id)?.amount ?? 0;
          for (const a of grp) {
            const dominated = grp.some((b) => b !== a && b.amount >= a.amount
              && a.costs.every((c) => amt(b, c.id) <= c.amount) && a.costs.some((c) => amt(b, c.id) < c.amount));
            if (dominated) { a.superseded = true; count(kept, '兌換（被較低成本版本取代）'); }
          }
        }
      }
      if (outTrades.size) { items[itemKey].trades = [...outTrades.values()].map((t) => ({ ...t, verified: t.npcIds.length > t.unverifiedNpcIds.length, ...(t.unverifiedNpcIds.length ? {} : { unverifiedNpcIds: undefined }) })); count(kept, '兌換', outTrades.size); }
      if (outVendors.size) { items[itemKey].vendors = [...outVendors.values()]; count(kept, 'NPC 商店', outVendors.size); }
    }
  }

  // ── NPC 表（含所有已知位置）──
  const npcs = {};
  let multiPos = 0; let noPos = 0;
  for (const id of usedNpcs) {
    let locs = positions.has(id) ? [...positions.get(id).values()] : [];
    if (!locs.length) { const fb = npcPositionFallback(id); if (fb && fb.mapId) locs = [fb]; }
    if (!locs.length) noPos += 1;
    if (locs.length > 1) multiPos += 1;
    locs.forEach((l) => { usedMaps.add(l.mapId); if (l.zoneId) usedZones.add(l.zoneId); });
    npcs[id] = { name: twNpcName(id), locations: locs };
  }
  const places = {};
  for (const z of usedZones) if (twPlaces[String(z)]?.tw) places[z] = twPlaces[String(z)].tw;
  const maps = {};
  for (const m of usedMaps) {
    const e = mapsJson[String(m)];
    if (e) maps[m] = { image: e.image, sizeFactor: e.size_factor, offsetX: e.offset_x, offsetY: e.offset_y, placeNameId: e.placename_id, placeNameSubId: e.placename_sub_id };
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    sources: { teamcraft: 'ffxiv-teamcraft extracts + tw-*', twCsv: 'thewakingsands/ffxiv-datamining-tc' },
    counts: { items: Object.keys(items).length, npcs: Object.keys(npcs).length, maps: Object.keys(maps).length, kept, npcsWithMultipleLocations: multiPos, npcsWithoutLocation: noPos },
    droppedReasons: dropped,
    npcLinkCheckByShopType: linkStats,
  };
  const output = { meta, items, npcs, places, maps };
  writeJson(path.join(OUT_DIR, 'obtainable.json'), output, flags.has('--pretty'));
  log('\n── 驗證報告 ──');
  log(JSON.stringify(meta, null, 2));
}

main().catch((e) => { console.error('✘', e.message); process.exit(1); });
