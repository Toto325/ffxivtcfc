#!/usr/bin/env node
/**
 * 以「台服兌換店資料表」為準整合兌換（在 build-obtainable.mjs 之後執行，直接更新 out/obtainable.json）
 *
 * 為什麼需要：Teamcraft 的兌換內容來自國際服（版本較新）。國際服與台服之間，商店編號、貨幣、
 * 需求量都可能不同（例如神典石世代更替），所以 SpecialShop 類的兌換改成用台服資料表重建：
 *   - 商店賣什麼、要多少：台服 SpecialShop.csv
 *   - 哪些 NPC 賣：台服 ENpcBase（含選單轉接）反查
 *   - 貨幣：優先沿用 Teamcraft 已解好的對應（台服與國際服都有的店），
 *           其餘依「店名中的貨幣名稱」解讀，仍無法確定者標記 unverified（成本編號為 null，保留原始值）
 *   - 座標、活動編號、名稱：Teamcraft（npcs.json、tw-*.json）
 * 公會商店、收藏品獎勵等非 SpecialShop 類型維持 Teamcraft 的資料。
 *
 * 狀態（供系統使用，玩家端建議只顯示 active，並把 seasonal 放在獨立分類）：
 *   status = 'active' | 'seasonal' | 'dead'
 *   dead 的原因（statusReasons）：currency-deprecated（Teamcraft 的過期物品清單）、
 *                                  tomestone-rotated（神典石輪替退役）
 *   seasonal：所有賣家 NPC 都有活動編號（festival）
 * 同貨幣、不同數量的有效兌換不隱藏，只標示 variants（變體數量）。
 *
 * 用法：node reconcile-tw-trades.mjs [--offline] [--pretty]
 */
import fs from 'fs';
import path from 'path';
import { OUT_DIR, flags, log, teamcraftJson, twCsvText, parseTwCsv, toInt, writeJson, count } from './lib/common.mjs';
import { loadShopGraph } from './lib/shopGraph.mjs';

const TRADE_TYPE = 'SpecialShop';

async function main() {
  const file = path.join(OUT_DIR, 'obtainable.json');
  if (!fs.existsSync(file)) throw new Error('找不到 out/obtainable.json，請先執行 build-obtainable.mjs');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  log('讀取來源…');
  const [twItems, twNpcs, twPlaces, npcsJson, mapsJson, deprecated, itemPatch, patchNames, twTitles] = await Promise.all([
    teamcraftJson('json/tw/tw-items.json'), teamcraftJson('json/tw/tw-npcs.json'), teamcraftJson('json/tw/tw-places.json'),
    teamcraftJson('json/npcs.json'), teamcraftJson('json/maps.json'), teamcraftJson('json/deprecated-items.json'),
    teamcraftJson('json/item-patch.json'), teamcraftJson('json/patch-names.json'), teamcraftJson('json/tw/tw-npc-titles.json'),
  ]);
  const [shopText, enpcText, tomeText] = await Promise.all([twCsvText('SpecialShop'), twCsvText('ENpcBase'), twCsvText('TomestonesItem')]);
  const graph = await loadShopGraph();

  const hasItem = (id) => Boolean(twItems[String(id)]?.tw);
  const isDeprecated = (id) => Object.prototype.hasOwnProperty.call(deprecated, String(id));
  const npcName = (id) => twNpcs[String(id)]?.tw || '';
  const festivalOf = (id) => npcsJson[String(id)]?.festival || 0;
  // 限期活動賣家：Teamcraft 有活動編號者，或「完全沒有位置、頭銜帶『季節／祭』」者（舊活動的季節商店不在一般地圖上；
  // 實測 138 筆這類兌換的賣家頭銜 100% 是「季節商店」或「紅蓮祭銷售委員」，且貨幣都是活動代幣）
  const isEventNpc = (id) => {
    if (festivalOf(id)) return true;
    const n = data.npcs[id];
    return Boolean(n && !(n.locations || []).length && /季節|祭/.test(twTitles[String(id)]?.tw || ''));
  };

  // ── 台服 SpecialShop ──
  const shops = new Map();
  {
    const { names, rows } = parseTwCsv(shopText);
    const col = (n) => names.indexOf(n);
    const need = ['Name', 'UseCurrencyType', 'Item{Receive}[0][0]', 'Count{Receive}[0][0]', 'Item{Cost}[0][0]', 'Count{Cost}[0][0]', 'PatchNumber[0]', 'Quest{Item}[0]', 'AchievementUnlock[0]'];
    const missing = need.filter((n) => col(n) < 0);
    if (missing.length) throw new Error(`SpecialShop.csv 缺少欄位：${missing.join(', ')}（資料表格式可能已改版）`);
    for (const r of rows) {
      const slots = [];
      for (let s = 0; s < 60; s += 1) {
        const receive = [];
        for (let k = 0; k < 2; k += 1) {
          const item = toInt(r[col(`Item{Receive}[${s}][${k}]`)]); const cnt = toInt(r[col(`Count{Receive}[${s}][${k}]`)]);
          if (item > 0 && cnt > 0) receive.push({ item, count: cnt });
        }
        if (!receive.length) continue;
        const costs = [];
        for (let j = 0; j < 3; j += 1) {
          const cnt = toInt(r[col(`Count{Cost}[${s}][${j}]`)]);
          if (cnt > 0) costs.push({ raw: toInt(r[col(`Item{Cost}[${s}][${j}]`)]), count: cnt });
        }
        const rawPatch = toInt(r[col(`PatchNumber[${s}]`)]);
        slots.push({ s, receive, costs, patch: rawPatch >= 9000 ? 0 : rawPatch, // 9999 為哨兵值，視為未知
          quest: toInt(r[col(`Quest{Item}[${s}]`)]), achievement: toInt(r[col(`AchievementUnlock[${s}]`)]) });
      }
      shops.set(toInt(r[0]), { name: r[col('Name')], uct: toInt(r[col('UseCurrencyType')]), slots });
    }
  }

  // ── 台服版本偵測 ──
  const ver = {};
  for (const [k, v] of Object.entries(patchNames)) { const f = Number.parseFloat(typeof v === 'string' ? v : v?.version ?? v?.name); if (Number.isFinite(f)) ver[k] = f; }
  const byCode = {};
  for (const id of Object.keys(twItems)) { const c = itemPatch[id]; if (c) byCode[c] = (byCode[c] || 0) + 1; }
  const code = Math.max(...Object.entries(byCode).filter(([, n]) => n >= 20).map(([c]) => Number(c)));
  const maxSlotPatch = Math.max(...[...shops.values()].flatMap((s) => s.slots.map((x) => x.patch)));
  const patchCeiling = Math.floor((ver[code] ?? 99) * 10) * 10; // 例如 7.21 → 720
  // ── 台服 NPC → 可到達的商店，反查成「商店 → NPC」──
  const shopNpcs = new Map();
  {
    const { names, rows } = parseTwCsv(enpcText);
    const cols = names.map((n, i) => (/^ENpcData\[\d+\]$/.test(n) ? i : -1)).filter((i) => i >= 0);
    for (const r of rows) {
      const npc = toInt(r[0]);
      if (!npcName(npc)) continue;
      const direct = new Set();
      for (const c of cols) { const v = toInt(r[c]); if (v > 0) direct.add(v); }
      for (const id of graph.reachForNpc(npc, direct)) {
        if (!shops.has(id)) continue;
        if (!shopNpcs.has(id)) shopNpcs.set(id, new Set());
        shopNpcs.get(id).add(npc);
      }
    }
  }
  log(`  台服兌換店 ${shops.size}、有賣家的店 ${shopNpcs.size}`);

  // ── 學習貨幣對應：原始編號 →（沿用 Teamcraft 已解好的）──
  const learned = new Map(); // key `${uct}|${raw}` → Map(id → 次數)
  const oldTrades = [];
  for (const [itemKey, entry] of Object.entries(data.items)) {
    for (const t of entry.trades || []) if (t.shopType === TRADE_TYPE) oldTrades.push([toInt(itemKey), t]);
  }
  for (const [itemId, t] of oldTrades) {
    for (const sid of t.shopIds) {
      const shop = shops.get(sid); if (!shop) continue;
      const slotsOfItem = shop.slots.filter((x) => x.receive.some((rc) => rc.item === itemId));
      if (slotsOfItem.length !== 1) continue;
      const slot = slotsOfItem[0];
      if (slot.costs.length !== t.costs.length || slot.costs.some((c, i) => c.count !== t.costs[i].amount)) continue;
      slot.costs.forEach((c, i) => {
        const key = `${shop.uct}|${c.raw}`;
        if (!learned.has(key)) learned.set(key, new Map());
        learned.get(key).set(t.costs[i].id, (learned.get(key).get(t.costs[i].id) || 0) + 1);
      });
    }
  }
  // 台服與國際服都有的 (店, 成品)：同一槽的貨幣直接沿用 Teamcraft（有些店同一原始編號在不同槽代表不同貨幣）
  const oldBySlot = new Map();
  for (const [itemId, t] of oldTrades) for (const sid of t.shopIds) { const k = `${sid}|${itemId}`; if (!oldBySlot.has(k)) oldBySlot.set(k, []); oldBySlot.get(k).push(t.costs); }
  // 國際服（Teamcraft）記錄的賣家：台服資料表追蹤不到連結時作為後備（標記為未驗證），例如透過其他事件機制連到的店
  const oldShopNpcs = new Map();
  for (const [, t] of oldTrades) for (const sid of t.shopIds) { if (!oldShopNpcs.has(sid)) oldShopNpcs.set(sid, new Set()); t.npcIds.forEach((n) => oldShopNpcs.get(sid).add(n)); }
  const unique = new Map(); const ambiguous = new Set();
  for (const [key, m] of learned) { if (m.size === 1) unique.set(key, [...m.keys()][0]); else ambiguous.add(key); }
  // 僅憑原始編號（跨貨幣類型）：小編號（<100）在所有已知組合中都指向同一個貨幣時才採用（例：1 → 詩學神典石）
  const rawOnly = new Map();
  for (const [key, m] of learned) {
    const raw = Number(key.split('|')[1]); if (raw >= 100) continue;
    if (!rawOnly.has(raw)) rawOnly.set(raw, new Set());
    for (const id of m.keys()) rawOnly.get(raw).add(id);
  }
  const rawUnique = new Map([...rawOnly].filter(([, set]) => set.size === 1).map(([raw, set]) => [raw, [...set][0]]));

  // ── 神典石家族與輪替退役 ──
  const tomestones = [];
  {
    const { names, rows } = parseTwCsv(tomeText);
    const ic = names.indexOf('Item'); const tc = names.indexOf('Tomestones');
    for (const r of rows) if (toInt(r[tc]) > 0) tomestones.push({ id: toInt(r[ic]), name: twItems[String(toInt(r[ic]))]?.tw || '' });
  }
  tomestones.sort((a, b) => a.id - b.id);
  const permanent = tomestones[0]?.id;
  const tomeStats = new Map(tomestones.map((t) => [t.id, { first: 0, last: 0, shops: 0 }]));
  for (const shop of shops.values()) {
    for (const t of tomestones) {
      if (!t.name || !shop.name.includes(t.name)) continue;
      const st = tomeStats.get(t.id); st.shops += 1;
      for (const slot of shop.slots) if (slot.patch > 0) { st.first = st.first ? Math.min(st.first, slot.patch) : slot.patch; st.last = Math.max(st.last, slot.patch); }
    }
  }
  const rotating = tomestones.filter((t) => t.id !== permanent && tomeStats.get(t.id).last > 0);
  const top = [...rotating].sort((a, b) => tomeStats.get(b.id).first - tomeStats.get(a.id).first || b.id - a.id)[0];
  const retiredTomestones = new Set(top ? rotating.filter((t) => t.id !== top.id && tomeStats.get(t.id).last < tomeStats.get(top.id).first).map((t) => t.id) : []);
  const tomeByShopName = (name) => tomestones.find((t) => t.name && name.includes(t.name))?.id ?? null;

  // ── 貨幣解讀 ──
  function decodeCosts(shop, slot, sid, itemId) {
    const direct = (oldBySlot.get(`${sid}|${itemId}`) || []).filter((cs) => cs.length === slot.costs.length && cs.every((c, i) => c.amount === slot.costs[i].count));
    const tuples = new Set(direct.map((cs) => cs.map((c) => c.id).join(',')));
    if (tuples.size === 1) return { costs: slot.costs.map((c, i) => ({ id: direct[0][i].id, amount: c.count, how: 'teamcraft-slot' })), unresolved: false };
    const out = []; let unresolved = false;
    for (const c of slot.costs) {
      const key = `${shop.uct}|${c.raw}`;
      let id = null; let how = null;
      const byName = tomeByShopName(shop.name);
      if (byName && c.raw >= 1 && c.raw <= 4 && shop.uct === 4) { id = byName; how = 'shop-name'; }
      else if (unique.has(key)) { id = unique.get(key); how = 'learned'; }
      else if (c.raw >= 100 && hasItem(c.raw)) { id = c.raw; how = 'direct'; } // 已驗證：原始編號>=100 時皆等於成本物品編號
      else if (rawUnique.has(c.raw)) { id = rawUnique.get(c.raw); how = 'learned-raw'; }
      if (id === null) unresolved = true;
      out.push({ id, amount: c.count, ...(id === null ? { raw: c.raw } : {}), how });
    }
    return { costs: out, unresolved };
  }

  // ── 重建 SpecialShop 兌換 ──
  const dropped = {}; const stats = { rebuilt: 0, unresolved: 0, decodeHow: {} };
  const newTrades = new Map(); // itemId → Map(key → trade)
  const usedNpcs = new Set();
  for (const [sid, shop] of shops) {
    let npcs = [...(shopNpcs.get(sid) || [])];
    let fallback = false;
    if (!npcs.length) { npcs = [...(oldShopNpcs.get(sid) || [])].filter((n) => npcName(n)); fallback = npcs.length > 0; }
    if (!npcs.length) { count(dropped, '台服沒有 NPC 連到這家店（國際服資料也沒有賣家）'); continue; }
    if (fallback) count(dropped, '（保留但未驗證）台服追蹤不到 NPC 連結，沿用國際服賣家');
    for (const slot of shop.slots) {
      if (slot.patch > patchCeiling) { count(dropped, '兌換槽版本晚於台服目前版本'); continue; }
      slot.receive.forEach((rc) => {
        const { costs, unresolved } = decodeCosts(shop, slot, sid, rc.item);
        if (!hasItem(rc.item)) { count(dropped, '成品不在台服'); return; }
        if (isDeprecated(rc.item)) { count(dropped, '成品已被標記為無法取得'); return; }
        const unlock = (slot.quest || slot.achievement) ? { ...(slot.quest ? { quests: [slot.quest] } : {}), ...(slot.achievement ? { achievements: [slot.achievement] } : {}) } : null;
        const key = JSON.stringify([costs.map((c) => [c.id ?? `raw${c.raw}`, c.amount]), rc.count, unlock, slot.receive.length > 1]);
        if (!newTrades.has(rc.item)) newTrades.set(rc.item, new Map());
        const m = newTrades.get(rc.item);
        if (!m.has(key)) {
          m.set(key, {
            shopIds: [], shopType: TRADE_TYPE, amount: rc.count,
            costs: costs.map((c) => ({ id: c.id, amount: c.amount, ...(c.id === null ? { raw: c.raw } : {}) })),
            npcIds: [], unverifiedNpcIds: [], ...(unresolved ? { unresolvedCurrency: true } : {}),
            ...(unlock ? { unlock } : {}), ...(slot.receive.length > 1 ? { bundle: true } : {}),
          });
          stats.rebuilt += 1; if (unresolved) stats.unresolved += 1;
          costs.forEach((c) => count(stats.decodeHow, c.how || 'unresolved'));
        }
        const t = m.get(key);
        if (!t.shopIds.includes(sid)) t.shopIds.push(sid);
        for (const n of npcs) {
          if (!t.npcIds.includes(n)) { t.npcIds.push(n); usedNpcs.add(n); }
          if (fallback) { if (!t.unverifiedNpcIds.includes(n) && !(shopNpcs.get(sid) || new Set()).has(n)) t.unverifiedNpcIds.push(n); }
          else t.unverifiedNpcIds = t.unverifiedNpcIds.filter((x) => x !== n);
        }
      });
    }
  }

  // ── NPC 位置：已有的保留，新出現的從 Teamcraft 補 ──
  for (const id of usedNpcs) {
    if (data.npcs[id]) continue;
    const p = npcsJson[String(id)]?.position;
    data.npcs[id] = { name: npcName(id), locations: p && p.map ? [{ zoneId: p.zoneid, mapId: p.map, x: p.x, y: p.y }] : [] };
  }
  for (const npc of Object.values(data.npcs)) for (const l of npc.locations) {
    if (l.zoneId && !data.places[l.zoneId] && twPlaces[String(l.zoneId)]?.tw) data.places[l.zoneId] = twPlaces[String(l.zoneId)].tw;
    const e = mapsJson[String(l.mapId)];
    if (e && !data.maps[l.mapId]) data.maps[l.mapId] = { image: e.image, sizeFactor: e.size_factor, offsetX: e.offset_x, offsetY: e.offset_y, placeNameId: e.placename_id, placeNameSubId: e.placename_sub_id };
  }

  // ── 合併回資料：移除舊的 SpecialShop 兌換，換成台服版 ──
  for (const entry of Object.values(data.items)) if (entry.trades) entry.trades = entry.trades.filter((t) => t.shopType !== TRADE_TYPE);
  for (const [itemId, m] of newTrades) {
    const key = String(itemId);
    data.items[key] ||= {};
    data.items[key].trades = [...(data.items[key].trades || []), ...m.values()];
  }
  for (const [k, v] of Object.entries(data.items)) { if (v.trades && !v.trades.length) delete v.trades; if (!v.trades && !v.vendors) delete data.items[k]; }

  // ── 狀態 ──
  const statusCount = {}; const reasonCount = {};
  for (const [itemKey, entry] of Object.entries(data.items)) {
    for (const t of entry.trades || []) {
      delete t.superseded; delete t.dead; delete t.deadReason; delete t.deadItems;
      if (t.shopType === TRADE_TYPE) { t.verified = t.npcIds.length > (t.unverifiedNpcIds || []).length; if (!t.unverifiedNpcIds?.length) delete t.unverifiedNpcIds; }
      const reasons = [];
      const deadItems = t.costs.filter((c) => c.id !== null && isDeprecated(c.id)).map((c) => c.id);
      if (deadItems.length) reasons.push('currency-deprecated');
      const rotated = t.costs.filter((c) => c.id !== null && retiredTomestones.has(c.id)).map((c) => c.id);
      if (rotated.length) reasons.push('tomestone-rotated');
      const festivals = [...new Set(t.npcIds.map(festivalOf).filter(Boolean))];
      const seasonal = t.npcIds.length > 0 && t.npcIds.every(isEventNpc);
      t.status = reasons.length ? 'dead' : seasonal ? 'seasonal' : 'active';
      if (reasons.length) { t.dead = true; t.statusReasons = reasons; t.deadItems = [...new Set([...deadItems, ...rotated])]; }
      if (seasonal) t.festivalIds = festivals;
      count(statusCount, t.status); reasons.forEach((r) => count(reasonCount, r));
    }
    // 同貨幣、不同數量的有效兌換：保留，標示變體數量
    const groups = new Map();
    for (const t of entry.trades || []) {
      if (t.status !== 'active' || t.costs.some((c) => c.id === null)) continue;
      const gk = JSON.stringify([t.shopType, t.costs.map((c) => c.id).sort((a, b) => a - b), t.unlock || null]);
      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk).push(t);
    }
    for (const grp of groups.values()) {
      const amounts = new Set(grp.map((t) => JSON.stringify(t.costs.map((c) => [c.id, c.amount]).sort())));
      if (grp.length > 1 && amounts.size > 1) grp.forEach((t) => { t.variants = grp.length; });
    }
  }
  const vend = Object.values(data.items).flatMap((e) => e.vendors || []);
  vend.forEach((v) => { v.status = isEventNpc(v.npcId) ? 'seasonal' : 'active'; });

  const meta = data.meta || {};
  meta.reconciledAt = new Date().toISOString();
  meta.twPatch = { fromItems: ver[code] ?? null, fromShopSlots: maxSlotPatch / 100, note: '依台服物品名稱表（≥20 個物品的最新版本代碼）與兌換槽最大版本推算；無明確版本檔' };
  meta.tomestoneRotation = {
    permanent, top: top?.id ?? null, retired: [...retiredTomestones],
    byTomestone: Object.fromEntries(tomestones.map((t) => [t.name || t.id, tomeStats.get(t.id)])),
  };
  meta.reconcile = { ...stats, rawOnlyCurrencyMap: Object.fromEntries(rawUnique), statusCount, deadReasons: reasonCount, learnedCurrencyKeys: unique.size, ambiguousCurrencyKeys: [...ambiguous], dropped };
  data.meta = meta;
  writeJson(file, data, flags.has('--pretty'));
  log('\n── 驗證報告 ──');
  log(JSON.stringify({ twPatch: meta.twPatch, tomestoneRotation: meta.tomestoneRotation, reconcile: meta.reconcile }, null, 2));
}

main().catch((e) => { console.error('✘', e.message); process.exit(1); });
