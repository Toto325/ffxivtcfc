#!/usr/bin/env node
/**
 * 月球（宇宙探索）製作資料建置
 *
 * 與舊版（照抄 beherw 的腳本）的差異：
 *   - 不再寫死任務編號範圍。改成：找出所有「製作類任務」→ 依編號連續性分成區塊 →
 *     以「區塊內成品是否存在於台服（tw-items）」判斷該區塊台服有沒有開。
 *     台服開新區域時，新區塊會自動出現；國際服多出來的區塊會自動排除。
 *   - 結構來自國際服 CSV（欄位有名稱、較穩定），可用性由 Teamcraft 的台服名稱表判斷。
 *   - 內建抽樣驗證，欄位改版時會明確報錯而不是產生錯資料。
 *
 * 用法：node build-lunar.mjs [--offline] [--pretty]
 */
import path from 'path';
import {
  OUT_DIR, flags, log, teamcraftJson, globalCsvText, parseNamedCsv, toInt, writeJson,
} from './lib/common.mjs';

const MIN_TW_RATIO = 0.9;               // 區塊內成品有 90% 以上在台服 → 視為台服已開
const CRAFT_CATEGORY = [9, 16];         // ClassJobCategory[0]：8 個製作職業
const RANK_NAMES = { 1: 'D', 2: 'C', 3: 'B', 4: 'A', 5: 'EX', 6: 'EX+' };
// 收藏價值門檻：資料表中找不到來源。目前兩個樣本（A 級品質 12300、EX+ 品質 23200）
// 都是 20%/40%/70%，因此暫定為固定比例；若日後發現例外，只需改這裡。
const COLLECTABLE_TIERS = [0.2, 0.4, 0.7];
// 已知答案（來自遊戲畫面）：用來偵測公式或資料表是否改版。不符時只警告。
const KNOWN_GOOD = [{ result: 48261, job: 8, progress: 1500, quality: 23200, durability: 75, note: '月球車用的貨物包裝用品（EX+，刻木匠）' }];

const scale = (base, factor) => Math.max(0, Math.floor((toInt(base) * toInt(factor, 100)) / 100));
const bool = (v) => v === 'True';

function requireColumns(name, rows, cols) {
  const have = new Set(Object.keys(rows[0] || {}));
  const missing = cols.filter((c) => !have.has(c));
  if (missing.length) throw new Error(`${name}.csv 缺少欄位：${missing.join(', ')}（資料表格式可能已改版）`);
}

async function main() {
  log('讀取來源…');
  const [twItems, twPlaces] = await Promise.all([
    teamcraftJson('json/tw/tw-items.json'), teamcraftJson('json/tw/tw-places.json'),
  ]);
  const [units, groups, recipes, levels] = (await Promise.all(
    ['WKSMissionUnit', 'WKSMissionRecipe', 'Recipe', 'RecipeLevelTable'].map(globalCsvText),
  )).map(parseNamedCsv);

  requireColumns('WKSMissionUnit', units, ['#', 'Name', 'ClassJobCategory[0]', 'WKSMissionRecipe', 'LevelGroup', 'PlaceName']);
  requireColumns('WKSMissionRecipe', groups, ['#', 'Recipe[0]', 'Recipe[4]']);
  requireColumns('Recipe', recipes, ['#', 'CraftType', 'ItemResult', 'AmountResult', 'RecipeLevelTable', 'DifficultyFactor',
    'QualityFactor', 'DurabilityFactor', 'Ingredient[0]', 'AmountIngredient[0]', 'CanHq', 'IsExpert']);
  requireColumns('RecipeLevelTable', levels, ['#', 'Difficulty', 'Quality', 'Durability', 'ClassJobLevel', 'Stars']);

  const groupById = new Map(groups.map((r) => [toInt(r['#']), r]));
  const recipeById = new Map(recipes.map((r) => [toInt(r['#']), r]));
  const levelById = new Map(levels.map((r) => [toInt(r['#']), r]));
  const hasTw = (id) => Boolean(twItems[String(id)]?.tw);

  const craftUnits = units
    .filter((r) => {
      const cat = toInt(r['ClassJobCategory[0]']);
      return cat >= CRAFT_CATEGORY[0] && cat <= CRAFT_CATEGORY[1] && toInt(r.WKSMissionRecipe) > 0;
    })
    .sort((a, b) => toInt(a['#']) - toInt(b['#']));

  const recipeIdsOf = (unit) => {
    const g = groupById.get(toInt(unit.WKSMissionRecipe));
    if (!g) throw new Error(`任務 ${unit['#']} 找不到 WKSMissionRecipe ${unit.WKSMissionRecipe}`);
    const ids = [];
    for (let i = 0; i < 5; i += 1) { const id = toInt(g[`Recipe[${i}]`]); if (id) ids.push(id); }
    return ids;
  };

  // 依編號連續性分區塊
  const blocks = [];
  for (const u of craftUnits) {
    const last = blocks[blocks.length - 1];
    if (last && toInt(u['#']) === toInt(last.units[last.units.length - 1]['#']) + 1) last.units.push(u);
    else blocks.push({ units: [u] });
  }
  for (const b of blocks) {
    const results = new Set();
    for (const u of b.units) for (const rid of recipeIdsOf(u)) {
      const r = recipeById.get(rid);
      if (!r) throw new Error(`Recipe 缺少 ${rid}`);
      results.add(toInt(r.ItemResult));
    }
    b.items = results.size;
    b.itemsInTw = [...results].filter(hasTw).length;
    b.inTw = b.items > 0 && b.itemsInTw / b.items >= MIN_TW_RATIO;
    b.from = toInt(b.units[0]['#']);
    b.to = toInt(b.units[b.units.length - 1]['#']);
    b.placeNameId = b.units.map((u) => toInt(u.PlaceName)).find((p) => p > 0) || 0;
  }
  log('任務區塊：');
  for (const b of blocks) log(`  ${String(b.from).padStart(4)}–${String(b.to).padEnd(4)} ${String(b.units.length).padStart(3)} 筆  成品 ${b.itemsInTw}/${b.items} 在台服  → ${b.inTw ? '採用' : '略過（台服尚未開放）'}`);

  const missions = [];
  const recipeRanks = new Map();
  blocks.forEach((b, blockIndex) => {
    if (!b.inTw) return;
    for (const u of b.units) {
      const rank = toInt(u.LevelGroup);
      const rids = recipeIdsOf(u);
      for (const rid of rids) {
        if (!recipeRanks.has(rid)) recipeRanks.set(rid, new Set());
        recipeRanks.get(rid).add(rank);
      }
      missions.push({ id: toInt(u['#']), block: blockIndex, rank, rankName: RANK_NAMES[rank] || String(rank), categoryId: toInt(u['ClassJobCategory[0]']), nameEn: (u.Name || '').trim(), recipes: rids });
    }
  });

  const outRecipes = [];
  const itemMap = new Map();
  for (const [rid, rankSet] of recipeRanks) {
    const src = recipeById.get(rid);
    const lv = levelById.get(toInt(src.RecipeLevelTable));
    if (!lv) throw new Error(`RecipeLevelTable 缺少 ${src.RecipeLevelTable}（配方 ${rid}）`);
    const ingredients = [];
    for (let i = 0; i < 8; i += 1) {
      const id = toInt(src[`Ingredient[${i}]`]); const amount = toInt(src[`AmountIngredient[${i}]`]);
      if (id > 0 && amount > 0) ingredients.push({ id, amount });
    }
    const job = toInt(src.CraftType) + 8;
    const ranks = [...rankSet].filter((r) => r >= 1 && r <= 6).sort((a, b) => a - b);
    const result = toInt(src.ItemResult);
    const quality = scale(lv.Quality, src.QualityFactor);
    outRecipes.push({
      id: rid, job, result, yields: toInt(src.AmountResult, 1), lvl: toInt(lv.ClassJobLevel), rlvl: toInt(src.RecipeLevelTable), stars: toInt(lv.Stars),
      progress: scale(lv.Difficulty, src.DifficultyFactor), quality, durability: scale(lv.Durability, src.DurabilityFactor),
      maxCollectable: Math.floor(quality / 10),
      suggestedCraftsmanship: toInt(lv.SuggestedCraftsmanship), requiredCraftsmanship: toInt(src.RequiredCraftsmanship), requiredControl: toInt(src.RequiredControl),
      progressDivider: toInt(lv.ProgressDivider, 100), qualityDivider: toInt(lv.QualityDivider, 100),
      progressModifier: toInt(lv.ProgressModifier, 100), qualityModifier: toInt(lv.QualityModifier, 100),
      conditionsFlag: toInt(lv.ConditionsFlag, 15),
      canHq: bool(src.CanHq), canQuickSynth: bool(src.CanQuickSynth), expert: bool(src.IsExpert),
      ingredients, cosmicRanks: ranks,
    });
    const e = itemMap.get(result) || { id: result, jobs: new Set(), ranks: new Set(), ranksByJob: {} };
    e.jobs.add(job); ranks.forEach((r) => e.ranks.add(r));
    e.ranksByJob[job] = [...new Set([...(e.ranksByJob[job] || []), ...ranks])].sort((a, b) => a - b);
    itemMap.set(result, e);
  }
  const items = [...itemMap.values()].map((e) => ({ id: e.id, jobs: [...e.jobs].sort((a, b) => a - b), ranks: [...e.ranks].sort((a, b) => a - b), ranksByJob: e.ranksByJob })).sort((a, b) => a.id - b.id);

  // ── 驗證 ──
  const problems = []; const warnings = [];
  if (!outRecipes.length) problems.push('配方數為 0');
  for (const r of outRecipes) {
    if (!r.result) problems.push(`配方 ${r.id} 沒有成品`);
    if (r.progress <= 0 || r.durability <= 0) problems.push(`配方 ${r.id} 數值異常（progress/durability 為 0）`);
    if (!hasTw(r.result)) warnings.push(`配方 ${r.id} 的成品 ${r.result} 不在台服名稱表`);
  }
  for (const k of KNOWN_GOOD) {
    const hit = outRecipes.find((r) => r.result === k.result && r.job === k.job);
    if (!hit) warnings.push(`已知樣本不存在：${k.note}`);
    else if (hit.progress !== k.progress || hit.quality !== k.quality || hit.durability !== k.durability) warnings.push(`已知樣本數值不符：${k.note}（得到 ${hit.progress}/${hit.quality}/${hit.durability}）`);
  }
  if (problems.length) { console.error('驗證失敗：\n- ' + problems.slice(0, 20).join('\n- ')); process.exit(2); }

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      rankNames: RANK_NAMES,
      collectableTiers: { ratios: COLLECTABLE_TIERS, source: 'assumed-fixed-ratio（資料表中未找到，兩個樣本吻合）' },
      blocks: blocks.map((b) => ({ from: b.from, to: b.to, missions: b.units.length, items: b.items, itemsInTw: b.itemsInTw, adopted: b.inTw, placeName: twPlaces[String(b.placeNameId)]?.tw || null })),
      counts: { missions: missions.length, recipes: outRecipes.length, items: items.length },
      warnings,
    },
    missions, recipes: outRecipes.sort((a, b) => a.id - b.id), items,
  };
  writeJson(path.join(OUT_DIR, 'lunar.json'), output, flags.has('--pretty'));
  log(`任務 ${missions.length}、配方 ${outRecipes.length}、物品 ${items.length}`);
  if (warnings.length) log('⚠ 警告：\n- ' + warnings.slice(0, 10).join('\n- '));
}

main().catch((e) => { console.error('✘', e.message); process.exit(1); });
