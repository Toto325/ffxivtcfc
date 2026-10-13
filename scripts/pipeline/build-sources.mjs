#!/usr/bin/env node
/**
 * 其他取得方式建置（兌換、NPC 商店由 build-obtainable.mjs 處理）
 *
 * 處理的類型：製作、分解、精選、副本、採集、園藝、潛水艇/飛空艇探索、怪物掉落、限時採集、
 *           祕籍、寶箱/容器、危命任務、探險、任務、成就、需求物、商城、無人島。
 *
 * 原則：
 *   1. 結果物品必須在台服（tw-items）。
 *   2. 被引用的實體（副本、危命任務、任務、成就、怪物、探險、探索海域…）必須在對應的台服名稱表中，
 *      否則視為台服尚未開放而排除，並在報告計數。
 *   3. 製作配方額外用台服 Recipe.csv 驗證（編號與成品相符）。
 *   4. 物品若在 Teamcraft 的 deprecated-items 中，視為已無法取得，整個物品略過。
 *   5. 「依賴已無法取得物品」的取得方式不刪除，標記 dead（例如配方的素材已過期）。
 *   6. 無法用台服資料驗證的類型（商城、無人島）保留並標記 unverified。
 *
 * 輸出：out/sources.json
 *   items[itemId][類型] = [...]    只存編號與必要數值，不重複存名稱
 *   entities                       被引用到的繁中名稱與細節（副本、危命任務、任務…）
 *
 * 用法：node build-sources.mjs [--offline] [--pretty]
 */
import path from 'path';
import {
  OUT_DIR, flags, log, teamcraftJson, twCsvText, parseTwCsv, toInt, writeJson, count,
} from './lib/common.mjs';

const T = { CRAFT: 1, REDUCTION: 4, DESYNTH: 5, INSTANCE: 6, GATHERING: 7, GARDENING: 8, VOYAGE: 9, DROP: 10, ALARM: 11,
  MASTERBOOK: 12, TREASURE: 13, FATE: 14, VENTURE: 15, QUEST: 18, ACHIEVEMENT: 19, REQUIREMENT: 20, MOGSTATION: 21,
  ISLAND_PASTURE: 22, ISLAND_CROP: 23, DEPRECATED: -1 };
const NAMES = { 1: 'craft', 4: 'reduction', 5: 'desynth', 6: 'instances', 7: 'gathering', 8: 'gardening', 9: 'voyages', 10: 'drops',
  11: 'alarms', 12: 'masterbooks', 13: 'treasures', 14: 'fates', 15: 'ventures', 18: 'quests', 19: 'achievements',
  20: 'requirements', 21: 'mogstation', 22: 'islandPasture', 23: 'islandCrop' };
const HANDLED_ELSEWHERE = new Set([2, 3]);

async function main() {
  log('讀取來源…');
  const names = ['tw-items', 'tw-instances', 'tw-fates', 'tw-quests', 'tw-achievements', 'tw-mobs', 'tw-places', 'tw-ventures',
    'tw-airship-voyages', 'tw-submarine-voyages', 'tw-gathering-types', 'tw-content-types'];
  const [extracts, deprecated, instances, mapsJson, ...tw] = await Promise.all([
    teamcraftJson('extracts/extracts.json'), teamcraftJson('json/deprecated-items.json'),
    teamcraftJson('json/instances.json'), teamcraftJson('json/maps.json'),
    ...names.map((n) => teamcraftJson(`json/tw/${n}.json`)),
  ]);
  const TW = Object.fromEntries(names.map((n, i) => [n, tw[i]]));
  const recipeText = await twCsvText('Recipe');

  // 台服 Recipe：成品 → 配方編號集合
  const twRecipesByResult = new Map();
  {
    const { names: cols, rows } = parseTwCsv(recipeText);
    const resCol = cols.indexOf('Item{Result}');
    if (resCol < 0) throw new Error('Recipe.csv 找不到 Item{Result} 欄位（資料表格式可能已改版）');
    for (const r of rows) {
      const res = toInt(r[resCol]);
      if (!twRecipesByResult.has(res)) twRecipesByResult.set(res, new Set());
      twRecipesByResult.get(res).add(String(toInt(r[0])));
    }
  }

  const hasItem = (id) => Boolean(TW['tw-items'][String(id)]?.tw);
  const isDead = (id) => Object.prototype.hasOwnProperty.call(deprecated, String(id));
  const hasPlace = (id) => Boolean(TW['tw-places'][String(id)]?.tw);

  const dropped = {};
  const kept = {};
  const entities = { instances: {}, fates: {}, quests: {}, achievements: {}, mobs: {}, ventures: {}, voyages: {}, places: {}, maps: {} };
  const usedMaps = new Set();
  const usedPlaces = new Set();
  const items = {};
  let unknownTypes = {};

  const notePlace = (zoneId, mapId) => { if (zoneId) usedPlaces.add(zoneId); if (mapId) usedMaps.add(mapId); };
  const pos = (c) => (c ? { x: c.x, y: c.y, ...(c.z !== undefined ? { z: c.z } : {}) } : null);

  for (const [itemKey, entry] of Object.entries(extracts)) {
    const itemId = toInt(itemKey);
    const sources = entry.sources || [];
    if (!sources.length) continue;
    if (sources.some((s) => s.type === T.DEPRECATED)) { count(dropped, '物品已被 Teamcraft 標記為無法取得（整個物品略過）'); continue; }
    if (!hasItem(itemId)) { count(dropped, '物品不在台服（整個物品略過）'); continue; }
    const out = {};
    const push = (type, value) => { (out[NAMES[type]] ||= []).push(value); count(kept, NAMES[type]); };

    for (const src of sources) {
      const type = src.type;
      const data = src.data;
      if (HANDLED_ELSEWHERE.has(type)) continue;
      if (!NAMES[type]) { count(unknownTypes, String(type)); continue; }

      switch (type) {
        case T.CRAFT: {
          for (const rc of data) {
            const rid = String(rc.id);
            const numeric = /^\d+$/.test(rid);
            if (numeric && !twRecipesByResult.get(itemId)?.has(rid)) { count(dropped, '製作：台服 Recipe 表沒有這個配方'); continue; }
            const ing = rc.ingredients || [];
            if (ing.some((i) => !hasItem(i.id))) { count(dropped, '製作：素材不在台服'); continue; }
            const deadIng = ing.filter((i) => isDead(i.id)).map((i) => i.id);
            push(type, {
              id: rid, job: rc.job, lvl: rc.lvl, rlvl: rc.rlvl, stars: rc.stars_tooltip || '', yield: rc.yield,
              durability: rc.durability, progress: rc.progression, quality: rc.quality,
              ingredients: ing.map((i) => ({ id: i.id, amount: i.amount, ...(i.quality ? { quality: i.quality } : {}) })),
              ...(rc.masterbook ? { masterbook: rc.masterbook } : {}),
              ...(rc.isIslandRecipe ? { island: true } : {}),
              ...(numeric ? {} : { special: true }),
              ...(deadIng.length ? { dead: true, deadReason: 'ingredient-deprecated', deadItems: deadIng } : {}),
            });
          }
          break;
        }
        case T.REDUCTION: case T.DESYNTH: case T.TREASURE: {
          const ids = data.filter((id) => hasItem(id));
          if (ids.length < data.length) count(dropped, `${NAMES[type]}：部分物品不在台服`, data.length - ids.length);
          if (ids.length) push(type, ids);
          break;
        }
        case T.INSTANCE: {
          const ids = [];
          for (const id of data) {
            const name = TW['tw-instances'][String(id)]?.tw;
            if (!name) { count(dropped, '副本：台服沒有這個副本'); continue; }
            const ins = instances[String(id)] || {};
            entities.instances[id] = { name, level: ins.levelReq ?? null, ilvl: ins.ilvlReq ?? null, sync: ins.sync ?? null, contentType: ins.contentType ?? null, map: ins.map ?? null };
            if (ins.map) usedMaps.add(ins.map);
            ids.push(id);
          }
          if (ids.length) push(type, ids);
          break;
        }
        case T.GATHERING: {
          const nodes = [];
          for (const n of data.nodes || []) {
            if (!hasPlace(n.zoneId)) { count(dropped, '採集：地點不在台服'); continue; }
            notePlace(n.zoneId, n.map);
            nodes.push({
              id: n.id, level: n.level, type: n.type, base: n.base, x: n.x, y: n.y, ...(n.z !== undefined ? { z: n.z } : {}), radius: n.radius,
              map: n.map, zoneId: n.zoneId, limited: !!n.limited, ephemeral: !!n.ephemeral, legendary: !!n.legendary,
              spawns: n.spawns || [], duration: n.duration || 0,
              ...((n.hiddenItems || []).includes(itemId) ? { hidden: true } : {}),
            });
          }
          if (nodes.length) push(type, { level: data.level, stars: data.stars_tooltip || '', type: data.type, nodes });
          break;
        }
        case T.ALARM: {
          for (const a of data) {
            if (!hasPlace(a.zoneId)) { count(dropped, '限時採集：地點不在台服'); continue; }
            notePlace(a.zoneId, a.mapId);
            push(type, { nodeId: a.nodeId, type: a.type, mapId: a.mapId, zoneId: a.zoneId, coords: pos(a.coords), spawns: a.spawns, duration: a.duration,
              ephemeral: !!a.ephemeral, reduction: !!a.reduction, weathers: a.weathers || [], weathersFrom: a.weathersFrom || [] });
          }
          break;
        }
        case T.GARDENING: {
          if (!hasItem(data.seedItemId)) { count(dropped, '園藝：種子不在台服'); break; }
          push(type, { seed: data.seedItemId, duration: data.duration, crossBreeds: (data.crossBreeds || []).filter((x) => hasItem(typeof x === 'object' ? x.itemId ?? x.id : x)) });
          break;
        }
        case T.VOYAGE: {
          for (const v of data) {
            const table = v.type === 0 ? TW['tw-airship-voyages'] : TW['tw-submarine-voyages'];
            const id = v.name?.id;
            const name = table[String(id)]?.tw;
            if (!name) { count(dropped, '探索：台服沒有這個海域/空域'); continue; }
            const key = `${v.type}-${id}`;
            entities.voyages[key] = { name, kind: v.type === 0 ? 'airship' : 'submarine', ...(table[String(id)].location ? { rank: table[String(id)].location } : {}) };
            push(type, key);
          }
          break;
        }
        case T.DROP: {
          for (const d of data) {
            const name = TW['tw-mobs'][String(d.id)]?.tw;
            if (!name) { count(dropped, '掉落：台服沒有這個怪物'); continue; }
            entities.mobs[d.id] = { name };
            const zoneId = d.zoneid ?? d.position?.zoneid;
            if (zoneId && !hasPlace(zoneId)) { count(dropped, '掉落：地點不在台服'); continue; }
            notePlace(zoneId, d.mapid);
            push(type, { mob: d.id, mapId: d.mapid ?? null, zoneId: zoneId ?? null, ...(d.position ? { x: d.position.x, y: d.position.y, radius: d.position.radius } : {}) });
          }
          break;
        }
        case T.MASTERBOOK: {
          const ids = data.map((d) => d.id).filter((id) => hasItem(id));
          if (ids.length < data.length) count(dropped, '祕籍：物品不在台服', data.length - ids.length);
          if (ids.length) push(type, ids);
          break;
        }
        case T.FATE: {
          for (const f of data) {
            const name = TW['tw-fates'][String(f.id)]?.name?.tw;
            if (!name) { count(dropped, '危命任務：台服沒有這個危命任務'); continue; }
            if (f.zoneId && !hasPlace(f.zoneId)) { count(dropped, '危命任務：地點不在台服'); continue; }
            entities.fates[f.id] = { name, level: f.level ?? null };
            notePlace(f.zoneId, f.mapId);
            push(type, { id: f.id, zoneId: f.zoneId ?? null, mapId: f.mapId ?? null, ...(f.coords ? { x: f.coords.x, y: f.coords.y } : {}) });
          }
          break;
        }
        case T.VENTURE: {
          for (const v of data) {
            const name = TW['tw-ventures'][String(v.id)]?.tw;
            if (!name) { count(dropped, '探險：台服沒有這個探險'); continue; }
            entities.ventures[v.id] = { name };
            push(type, { id: v.id, lvl: v.lvl, category: v.category, cost: v.cost, exp: v.exp, reqGathering: v.reqGathering, reqIlvl: v.reqIlvl, quantities: v.quantities });
          }
          break;
        }
        case T.QUEST: case T.ACHIEVEMENT: {
          const table = TW[type === T.QUEST ? 'tw-quests' : 'tw-achievements'];
          const bucket = type === T.QUEST ? entities.quests : entities.achievements;
          const ids = [];
          for (const id of data) {
            const name = table[String(id)]?.tw;
            if (!name) { count(dropped, `${NAMES[type]}：台服沒有`); continue; }
            bucket[id] = { name: String(name).trim() };
            ids.push(id);
          }
          if (ids.length) push(type, ids);
          break;
        }
        case T.REQUIREMENT: {
          for (const r of data) {
            if (!hasItem(r.id)) { count(dropped, '需求物：物品不在台服'); continue; }
            push(type, { id: r.id, amount: r.amount, ...(r.batches ? { batches: r.batches } : {}), ...(isDead(r.id) ? { dead: true, deadReason: 'requirement-deprecated' } : {}) });
          }
          break;
        }
        case T.MOGSTATION: push(type, { id: data.id, price: data.price, unverified: true }); break;
        case T.ISLAND_PASTURE: push(type, { ids: data.map((d) => d.id), unverified: true }); break;
        case T.ISLAND_CROP: push(type, { seed: data.seed, unverified: true }); break;
        default: break;
      }
    }
    if (Object.keys(out).length) items[itemKey] = out;
  }

  for (const p of usedPlaces) if (TW['tw-places'][String(p)]?.tw) entities.places[p] = TW['tw-places'][String(p)].tw;
  for (const m of usedMaps) {
    const e = mapsJson[String(m)];
    if (e) entities.maps[m] = { image: e.image, sizeFactor: e.size_factor, offsetX: e.offset_x, offsetY: e.offset_y, placeNameId: e.placename_id, placeNameSubId: e.placename_sub_id };
  }
  entities.contentTypes = Object.fromEntries(Object.entries(TW['tw-content-types']).map(([k, v]) => [k, v.tw]));
  entities.gatheringTypes = Object.fromEntries(Object.entries(TW['tw-gathering-types']).map(([k, v]) => [k, v.tw]));

  const meta = {
    generatedAt: new Date().toISOString(),
    counts: { items: Object.keys(items).length, kept, referenced: Object.fromEntries(Object.entries(entities).map(([k, v]) => [k, Object.keys(v).length])) },
    droppedReasons: dropped,
    unhandledSourceTypes: unknownTypes,
    note: 'dead：依賴已無法取得物品的取得方式（保留供前端折疊顯示）；unverified：無法用台服資料驗證',
  };
  writeJson(path.join(OUT_DIR, 'sources.json'), { meta, items, entities }, flags.has('--pretty'));
  log('\n── 驗證報告 ──');
  log(JSON.stringify(meta, null, 2));
}

main().catch((e) => { console.error('✘', e.message); process.exit(1); });
