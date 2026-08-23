#!/usr/bin/env node
/* scripts/update-craft-data.js
 * 自動重新產生生產製作用的三份資料檔，來源全部是 ffxiv-teamcraft/ffxiv-teamcraft（staging分支, MIT）：
 *   js/craft-data.js         配方庫 + 道具繁中名稱 + 台服可用性標記(tw-recipes.json)
 *   js/craft-action-names.js 技能繁中名稱（製作技能 craft-actions + 一般技能 actions，兩張表合併）
 *   js/craft-foods.js        食藥（食物/藥水）加成資料
 *
 * 由 .github/workflows/update-craft-data.yml 排程執行，資料有變動才會 commit。
 * 這幾個來源路徑萬一改了，腳本會直接噴錯讓那次執行失敗，不會用抓壞的空資料覆蓋現有檔案。
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/';
const URLS = {
  recipes: BASE + 'recipes-per-item.json',
  twRecipes: BASE + 'tw/tw-recipes.json',
  items: BASE + 'items.json',
  twItems: BASE + 'tw/tw-items.json',
  zhItems: BASE + 'zh/zh-items.json',
  craftActions: BASE + 'craft-actions.json',
  twCraftActions: BASE + 'tw/tw-craft-actions.json',
  zhCraftActions: BASE + 'zh/zh-craft-actions.json',
  actions: BASE + 'actions.json',
  twActions: BASE + 'tw/tw-actions.json',
  zhActions: BASE + 'zh/zh-actions.json',
  itemBonuses: BASE + 'item-bonuses.json',
};

const OUT = {
  craftData: path.join(__dirname, '..', 'js', 'craft-data.js'),
  actionNames: path.join(__dirname, '..', 'js', 'craft-action-names.js'),
  foods: path.join(__dirname, '..', 'js', 'craft-foods.js'),
  icons: path.join(__dirname, '..', 'js', 'craft-icons.js'),
  actionIcons: path.join(__dirname, '..', 'js', 'craft-action-icons.js'),
  i18n: path.join(__dirname, '..', 'data', 'item-names-i18n.json'),
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ffxiv-craft-data-updater' }, timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchJson(res.headers.location));
      }
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        // 錯誤狀態碼時把回應內容也一起帶出來（截斷到300字），不然log只看得到「回應400」，
        // 完全不知道伺服器實際說了什麼（例如查詢語法錯、表名稱打錯這類訊息通常就在回應內容裡）。
        if (res.statusCode !== 200) return reject(new Error(url + ' 回應 ' + res.statusCode + '：' + data.slice(0, 300)));
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(url + ' 不是合法JSON: ' + e.message + '（原始內容前300字：' + data.slice(0, 300) + '）')); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error(url + ' 逾時（15秒）')); });
    req.on('error', reject);
  });
}

function convertRecipes(raw, twIdSet) {
  const recipes = {};
  let skipped = 0;
  for (const arr of Object.values(raw)) {
    arr.forEach((r) => {
      if (r.job === -10) { skipped++; return; }
      recipes[r.id] = {
        jobId: r.job - 8,
        itemId: r.result,
        rlvl: r.rlvl,
        lvl: r.lvl,
        durability: r.durability,
        quality: r.quality,
        progress: r.progress,
        stars: r.stars,
        yields: r.yields || 1,
        isExpert: !!r.expert,
        conditionsFlag: r.conditionsFlag,
        reqCraftsmanship: r.craftsmanshipReq || 0,
        reqControl: r.controlReq || 0,
        suggestedCraftsmanship: r.suggestedCraftsmanship || 0,
        progressDivider: r.progressDivider,
        qualityDivider: r.qualityDivider,
        progressModifier: r.progressModifier,
        qualityModifier: r.qualityModifier,
        requiredQuality: r.requiredQuality || 0,
        twAvailable: twIdSet.has(r.id), // 台服目前有沒有開放這個配方（來源：tw-recipes.json）
        ingredients: (r.ingredients || [])
          .filter((i) => i.id !== 0)
          .map((i) => ({ itemId: i.id, amount: i.amount, quality: i.quality || 0 })),
      };
    });
  }
  return { recipes, skipped };
}

function extractStatBonus(entry) {
  // 來源資料的百分比欄位實際叫NQ/HQ，不是Value/ValueHQ（曾經寫錯導致percent永遠是undefined，
  // JSON.stringify時undefined的欄位會直接消失，害食物/藥水的加成永遠算出0）
  return { percent: entry.NQ, cap: entry.Max, percentHQ: entry.HQ != null ? entry.HQ : entry.NQ, capHQ: entry.MaxHQ != null ? entry.MaxHQ : entry.Max };
}

const XIVAPI_BASE = 'https://v2.xivapi.com/api/';
const ICON_BATCH_SIZE = 90; // 官方文件沒明講上限，保守一點分批查，比較不會被拒絕

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* 批次向 XIVAPI v2 查詢道具圖示路徑，組成可以直接當 <img src> 用的網址。
 * 只查我們配方資料實際用得到的道具（材料+成品），不查全部45,548筆道具名稱，節省請求次數。
 * 某一批查詢失敗（例如格式或路徑之後改了）只會讓那一批圖示缺角，不會讓整個腳本失敗，
 * 因為圖示是錦上添花的功能，不像配方/名稱資料那樣是核心必要資料。 */
async function fetchItemIcons(itemIds) {
  const icons = {};
  const batches = chunk(Array.from(itemIds), ICON_BATCH_SIZE);
  console.log('抓取道具圖示，共', itemIds.size, '筆，分', batches.length, '批查詢...');
  for (const batch of batches) {
    try {
      const url = XIVAPI_BASE + 'sheet/Item?fields=Icon&rows=' + batch.join(',');
      const res = await fetchJson(url);
      (res.rows || []).forEach((row) => {
        const path = row.fields && row.fields.Icon && row.fields.Icon.path;
        if (path) icons[row.row_id] = XIVAPI_BASE + 'asset?path=' + encodeURIComponent(path) + '&format=png';
      });
    } catch (e) {
      console.warn('  一批圖示查詢失敗（不影響其他資料）:', e.message);
    }
  }
  console.log('  實際取得', Object.keys(icons).length, '筆圖示網址');
  return icons;
}

/* 批次向 XIVAPI v2 查詢「生產技能」圖示。這裡要注意：生產技能（作業/加工/掌握…）在遊戲資料裡是放在
 * CraftAction 這張表，跟一般戰鬥/共用技能的 Action 表是分開的兩張表、ID範圍完全不一樣，
 * 不能沿用道具/一般技能查詢時常見的 sheet/Action 去查——查了也不會報錯，只是每一批都查不到任何一列，
 * 靜默地回傳空結果，表面上看起來像「查詢失敗」但其實是問錯表，重跑幾次都一樣查不到。 */
async function fetchActionIcons(actionIds) {
  const icons = {};
  const batches = chunk(Array.from(actionIds), ICON_BATCH_SIZE);
  console.log('抓取技能圖示，共', actionIds.size, '筆，分', batches.length, '批查詢...');
  let loggedSample = false;
  for (const batch of batches) {
    try {
      const url = XIVAPI_BASE + 'sheet/CraftAction?fields=Icon&rows=' + batch.join(',');
      const res = await fetchJson(url);
      const rows = res.rows || [];
      // 查詢本身成功(HTTP 200)、但一列資料都沒配對到，屬於「安靜失敗」——不會丟例外，
      // 前面只會印「查詢失敗」的警告是抓不到這種情況的。第一批就先把完整回應印出來，
      // 手動看log就能直接判斷是表名稱不對、ID對不上、還是欄位名稱不對，不用再憑猜的。
      if (!loggedSample) {
        loggedSample = true;
        console.log('  第一批查詢網址:', url);
        console.log('  第一批回應列數:', rows.length, rows.length === 0 ? '（查詢成功但0筆比對到，回應原文前500字：' + JSON.stringify(res).slice(0, 500) + '）' : '');
      }
      rows.forEach((row) => {
        const path = row.fields && row.fields.Icon && row.fields.Icon.path;
        if (path) icons[row.row_id] = XIVAPI_BASE + 'asset?path=' + encodeURIComponent(path) + '&format=png';
      });
    } catch (e) {
      console.warn('  一批技能圖示查詢失敗（不影響其他資料）:', e.message);
    }
  }
  console.log('  實際取得', Object.keys(icons).length, '筆技能圖示網址');
  return icons;
}

async function main() {
  console.log('抓取全部來源檔案...');
  const [
    rawRecipes, twRecipesArr, items, twItems, zhItems,
    craftActions, twCraftActions, zhCraftActions,
    actions, twActions, zhActions, itemBonuses,
  ] = await Promise.all(Object.values(URLS).map(fetchJson));
  console.log('  全部下載完成');

  /* ---------- 1. craft-data.js：配方 + 道具名稱 + 台服可用性 ---------- */
  const twIdSet = new Set(twRecipesArr.map((r) => r.id));
  const { recipes, skipped } = convertRecipes(rawRecipes, twIdSet);
  console.log('配方:', Object.keys(recipes).length, '筆（跳過', skipped, '筆壞資料）｜ 台服可用:', twIdSet.size, '筆');

  const relevantItemIds = new Set();
  Object.values(recipes).forEach((r) => {
    relevantItemIds.add(r.itemId);
    r.ingredients.forEach((ing) => relevantItemIds.add(ing.itemId));
  });
  const icons = await fetchItemIcons(relevantItemIds);
  fs.writeFileSync(OUT.icons,
    '/* craft-icons.js — 道具圖示網址對照表（itemId -> XIVAPI v2 asset URL），本檔案由\n' +
    ' * scripts/update-craft-data.js 自動產生，請勿手動編輯。來源：v2.xivapi.com（官方公開API）。\n' +
    ' * 只收錄配方資料實際用到的道具，不是全部道具。查不到圖示的道具，介面要有預設圖示 fallback，\n' +
    ' * 不能假設每個道具都查得到（這批抓取允許部分失敗，詳見腳本內註解）。\n' +
    ' * 最後更新時間：' + new Date().toISOString() + '\n' +
    ' */\n' +
    'const CRAFT_ITEM_ICONS=' + JSON.stringify(icons) + ';\n'
  );
  console.log('已寫入', OUT.icons);

  /* ---------- 1b. craft-action-icons.js：技能圖示（跟道具圖示分開的表） ----------
   * 用模擬引擎(js/vendor/ffxiv-simulator.umd.js)列舉全部技能，每個技能的getIds()回傳8個職業各自的
   * 真實遊戲技能ID，只需要查其中一個能查到的ID即可（技能圖示8職業共用同一張圖，不用查全部8個）。 */
  const simulator = require(path.join(__dirname, '..', 'js', 'vendor', 'ffxiv-simulator.umd.js'));
  const actionIdsNeeded = new Set();
  simulator.CraftingActionsRegistry.ALL_ACTIONS.forEach((entry) => {
    const id = (entry.action.getIds() || []).find((v) => v > 0);
    if (id) actionIdsNeeded.add(id);
  });
  const actionIcons = await fetchActionIcons(actionIdsNeeded);
  fs.writeFileSync(OUT.actionIcons,
    '/* craft-action-icons.js — 技能圖示網址對照表（遊戲技能ID -> XIVAPI v2 asset URL），本檔案由\n' +
    ' * scripts/update-craft-data.js 自動產生，請勿手動編輯。來源：v2.xivapi.com（官方公開API）。\n' +
    ' * key是getIds()查到的其中一個真實遊戲技能ID，8職業共用同一張圖示，查不到時介面要有預設圖示fallback。\n' +
    ' * 最後更新時間：' + new Date().toISOString() + '\n' +
    ' */\n' +
    'const CRAFT_ACTION_ICONS_BY_GAME_ID=' + JSON.stringify(actionIcons) + ';\n'
  );
  console.log('已寫入', OUT.actionIcons);

  const itemNamesTw = {};
  for (const id of Object.keys(items)) {
    if (twItems[id] && twItems[id].tw) itemNamesTw[id] = twItems[id].tw;
  }
  console.log('道具繁中名稱:', Object.keys(itemNamesTw).length, '筆');

  fs.writeFileSync(OUT.craftData,
    '/* craft-data.js — 生產製作「資料」：配方庫（含精確材料HQ權重/專家配方狀態旗標/台服可用性）、道具繁中名稱表。\n' +
    ' * 本檔案由 scripts/update-craft-data.js 自動產生，請勿手動編輯。\n' +
    ' * 來源：ffxiv-teamcraft/ffxiv-teamcraft（MIT）。twAvailable 標記依 tw-recipes.json 是否收錄該配方id判斷。\n' +
    ' * 最後更新時間：' + new Date().toISOString() + '\n' +
    ' */\n' +
    'const CRAFT_RECIPES=' + JSON.stringify(recipes) + ';\n' +
    'const CRAFT_ITEM_NAMES_TW=' + JSON.stringify(itemNamesTw) + ';\n'
  );
  console.log('已寫入', OUT.craftData);

  const i18nItems = {};
  for (const id of Object.keys(items)) {
    i18nItems[id] = Object.assign({}, items[id], { tw: twItems[id] && twItems[id].tw, zh: zhItems[id] && zhItems[id].zh });
  }
  fs.writeFileSync(OUT.i18n, JSON.stringify(i18nItems));
  console.log('已寫入', OUT.i18n, '（多語言完整版，供之後多語言介面使用）');

  /* ---------- 2. craft-action-names.js：技能名稱（製作技能 + 一般技能兩張表合併） ----------
   * 一般技能表(actions.json)有5萬多筆，橫跨全部戰鬥/生產技能，光用「id小於製作技能表」
   * 這種範圍門檻篩不掉戰鬥技能（兩者範圍重疊）。改成直接列出我們用的模擬引擎
   * (@ffxiv-teamcraft/simulator) 內建技能實際會查到的 game id 精確清單（用
   * `CraftingActionsRegistry.ALL_ACTIONS.map(a=>a.action.getIds())` 跑一次列出來的，
   * 這些是掌握/儉約/長期儉約/闊步/改革/崇敬/最終確認/奇蹟之材/宇宙探索技能這幾個buff類
   * 技能的 id，不在製作技能表(100000+)裡，要另外從一般技能表撈）。
   * 這份清單如果之後模擬引擎更新技能，需要重新列一次更新這裡。 */
  const GENERAL_BUFF_ACTION_IDS = new Set([
    260, 261, 262, 263, 264, 265, 266, 267,
    4574, 4575, 4576, 4577, 4578, 4579, 4580, 4581,
    4631, 4632, 4633, 4634, 4635, 4636, 4637, 4638,
    4639, 4640, 4641, 4642, 4643, 4644, 19002, 19003,
    19004, 19005, 19006, 19007, 19008, 19009, 19010, 19011,
    19012, 19013, 19014, 19015, 19016, 19017, 19018, 19019,
    19297, 19298, 19299, 19300, 19301, 19302, 19303, 19304,
    41269, 46843,
  ]);
  const actionNames = {};
  for (const id of Object.keys(craftActions)) {
    actionNames[id] = Object.assign({}, craftActions[id], {
      tw: twCraftActions[id] && twCraftActions[id].tw,
      zh: zhCraftActions[id] && zhCraftActions[id].zh,
    });
  }
  for (const id of GENERAL_BUFF_ACTION_IDS) {
    if (!actions[id]) continue;
    actionNames[id] = Object.assign({}, actions[id], {
      tw: twActions[id] && twActions[id].tw,
      zh: zhActions[id] && zhActions[id].zh,
    });
  }
  console.log('技能多語言名稱(依CraftAction/Action id):', Object.keys(actionNames).length, '筆');

  fs.writeFileSync(OUT.actionNames,
    '/* craft-action-names.js — 生產技能多語言對照表（id -> {en,de,ja,fr,zh,tw}）。\n' +
    ' * 本檔案由 scripts/update-craft-data.js 自動產生，請勿手動編輯。\n' +
    ' * id 為 CraftAction 表 ID(100001+) 或一般 Action 表 ID（Manipulation等buff技能）。\n' +
    ' * 執行期由 craft-panel.js / craft-worker.js 透過 CraftingActionsRegistry.ALL_ACTIONS 的\n' +
    ' * getIds() 對照到這張表，取得對應語言的技能名稱。\n' +
    ' * 最後更新時間：' + new Date().toISOString() + '\n' +
    ' */\n' +
    'const CRAFT_ACTION_NAMES_BY_GAME_ID=' + JSON.stringify(actionNames) + ';\n'
  );
  console.log('已寫入', OUT.actionNames);

  /* ---------- 3. craft-foods.js：食物/藥水加成資料 ---------- */
  const foods = {};
  const POTION_HINT = /藥茶|藥水|藥酒|藥液|巧手|達人/;
  for (const [id, bonuses] of Object.entries(itemBonuses)) {
    const cs = bonuses.find((b) => b.ID === 70);
    const ct = bonuses.find((b) => b.ID === 71);
    const cp = bonuses.find((b) => b.ID === 11);
    if (!cs && !ct && !cp) continue;
    const name = itemNamesTw[id] || ('道具#' + id);
    foods[id] = {
      name,
      type: POTION_HINT.test(name) ? 'medicine' : 'meal',
      craftsmanship: cs ? extractStatBonus(cs) : null,
      control: ct ? extractStatBonus(ct) : null,
      cp: cp ? extractStatBonus(cp) : null,
    };
  }
  console.log('生產食藥:', Object.keys(foods).length, '筆');

  fs.writeFileSync(OUT.foods,
    '/* craft-foods.js — 生產食藥（食物/藥水）加成資料，key為道具ID，type分 meal/medicine。\n' +
    ' * 本檔案由 scripts/update-craft-data.js 自動產生，請勿手動編輯。\n' +
    ' * 來源：ffxiv-teamcraft/ffxiv-teamcraft item-bonuses.json（MIT）。\n' +
    ' * 最後更新時間：' + new Date().toISOString() + '\n' +
    ' */\n' +
    'const CRAFT_FOODS=' + JSON.stringify(foods) + ';\n'
  );
  console.log('已寫入', OUT.foods);
}

main().catch((err) => {
  console.error('更新失敗:', err);
  process.exit(1);
});
