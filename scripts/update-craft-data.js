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
  itemPatch: BASE + 'item-patch.json',     // 物品加入的版本代碼
  patchNames: BASE + 'patch-names.json',   // 版本代碼 → 版本號
  collectables: BASE + 'collectables.json', // 收藏品三檔收藏度門檻（低／中／高）
  marketItems: BASE + 'market-items.json', // 可在市場交易的物品編號清單（市場頁搜尋只找得到這些）
};

/* 台服（繁中服）遊戲資料表。Teamcraft 的配方來自國際服（版本較新），國際服改過的配方素材
 * （例如把染劑換成新物品）台服還沒有；台服可用的配方，素材與產量一律以台服配方表為準。
 * 來源：thewakingsands/ffxiv-datamining-tc（SaintCoinach 解包的繁中服 CSV）。 */
const TW_ITEM_CSV = 'https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-tc/master/Item.csv';
const TW_ITEM_UI_CATEGORY_CSV = 'https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-tc/master/ItemUICategory.csv';
const TW_RECIPE_CSV = 'https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-tc/master/Recipe.csv';

const OUT = {
  craftData: path.join(__dirname, '..', 'js', 'craft-data.js'),
  actionNames: path.join(__dirname, '..', 'js', 'craft-action-names.js'),
  foods: path.join(__dirname, '..', 'js', 'craft-foods.js'),
  icons: path.join(__dirname, '..', 'js', 'craft-icons.js'),
  itemIconsAll: path.join(__dirname, '..', 'js', 'item-icons-tw.js'),
  actionIcons: path.join(__dirname, '..', 'js', 'craft-action-icons.js'),
  i18n: path.join(__dirname, '..', 'data', 'item-names-i18n.json'),
  itemNamesTw: path.join(__dirname, '..', 'js', 'item-names-tw.js'),
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

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ffxiv-craft-data-updater' }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(fetchText(res.headers.location));
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(url + ' 回應 ' + res.statusCode));
        resolve(data);
      });
    });
    req.on('timeout', () => { req.destroy(new Error(url + ' 逾時（30秒）')); });
    req.on('error', reject);
  });
}

function parseCsvRows(text) {
  const rows = [];
  let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i += 1; } else quoted = !quoted; }
    else if (ch === ',' && !quoted) { row.push(field); field = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* 台服 Recipe.csv → Map(配方id → { yields, ingredients:[{itemId, amount}] })。
 * 格式：第1列 key,0,1,2…；第2列欄位名稱；第3列型別；之後為資料。欄位不見就直接丟錯，
 * 不會用抓壞的資料覆蓋現有檔案（資料表改版時寧可讓這次更新失敗）。 */
function parseTwRecipes(text) {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  const names = rows[1];
  const col = (n) => names.indexOf(n);
  const resultAmount = col('Amount{Result}');
  const ingItem = []; const ingAmount = [];
  for (let k = 0; k < 8; k += 1) { ingItem.push(col('Item{Ingredient}[' + k + ']')); ingAmount.push(col('Amount{Ingredient}[' + k + ']')); }
  if (resultAmount < 0 || ingItem.some((c) => c < 0) || ingAmount.some((c) => c < 0)) {
    throw new Error('台服 Recipe.csv 找不到預期欄位（Amount{Result}／Item{Ingredient}／Amount{Ingredient}），資料表可能已改版');
  }
  const map = new Map();
  for (const r of rows.slice(3)) {
    const id = parseInt(r[0], 10);
    if (!Number.isFinite(id)) continue;
    const ingredients = [];
    for (let k = 0; k < 8; k += 1) {
      const itemId = parseInt(r[ingItem[k]], 10); const amount = parseInt(r[ingAmount[k]], 10);
      if (itemId > 0 && amount > 0) ingredients.push({ itemId, amount });
    }
    map.set(id, { yields: parseInt(r[resultAmount], 10) || 1, ingredients });
  }
  if (map.size < 5000) throw new Error('台服 Recipe.csv 只解析出 ' + map.size + ' 筆配方，數量異常，已停止（不覆蓋現有資料）');
  return map;
}

function convertRecipes(raw, twIdSet, twRecipes) {
  const recipes = {};
  let skipped = 0;
  const overrides = { ingredients: 0, yields: 0 };
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
      const tw = recipes[r.id].twAvailable ? twRecipes.get(r.id) : null;
      if (tw) {
        const have = new Map(recipes[r.id].ingredients.map((i) => [i.itemId, i]));
        const sig = (list) => list.map((i) => i.itemId + ':' + i.amount).sort().join(',');
        if (sig(tw.ingredients) !== sig(recipes[r.id].ingredients)) {
          // 同一個物品沿用 Teamcraft 的 quality（HQ 權重），台服獨有的素材沒有這項資料，設 0
          recipes[r.id].ingredients = tw.ingredients.map((i) => ({ itemId: i.itemId, amount: i.amount, quality: have.has(i.itemId) ? have.get(i.itemId).quality : 0 }));
          overrides.ingredients += 1;
        }
        if (tw.yields !== recipes[r.id].yields) { recipes[r.id].yields = tw.yields; overrides.yields += 1; }
      }
    });
  }
  return { recipes, skipped, overrides };
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
      /* 實測發現：這個批次查詢是「全部要有效才回資料」的，只要38個ID裡有任何一個在CraftAction表裡
       * 真的不存在（例如宇宙探索專用的宇宙穩手/奇蹟之材，本來就不屬於一般CraftAction），
       * 整批查詢直接回404、一個都拿不到——不是查詢方式錯，是一顆老鼠屎壞了一鍋粥。
       * 失敗時改成這批裡的ID一個一個單獨查，各自成功各自收，單獨查也失敗的（代表真的不存在）
       * 就跳過，不會再讓少數幾個有問題的ID拖累其他37個原本抓得到的技能圖示。 */
      console.warn('  一批技能圖示查詢失敗，改成逐一查詢這批的', batch.length, '個ID:', e.message);
      for (const id of batch) {
        // CraftAction表查不到時，備援改查原本的Action表——實測發現「掌握」這種很早期就有的老技能
        // (id 4574)在CraftAction表裡反而查不到，猜測是CraftAction表主要收後期才用新schema登記的技能，
        // 舊技能還留在最早的Action表裡沒搬過去，兩張表都試過還是查不到，才真的代表這個ID不存在。
        let found = false;
        for (const sheet of ['CraftAction', 'Action']) {
          try {
            const singleUrl = XIVAPI_BASE + 'sheet/' + sheet + '?fields=Icon&rows=' + id;
            const singleRes = await fetchJson(singleUrl);
            const row = (singleRes.rows || [])[0];
            const path = row && row.fields && row.fields.Icon && row.fields.Icon.path;
            if (path) { icons[row.row_id] = XIVAPI_BASE + 'asset?path=' + encodeURIComponent(path) + '&format=png'; found = true; break; }
          } catch (e2) { /* 這張表查不到，換下一張表試 */ }
        }
        if (!found) console.warn('    CraftAction／Action兩張表都查不到，這個ID可能真的不存在，略過:', id);
      }
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
    actions, twActions, zhActions, itemBonuses, itemPatch, patchNames, collectables, marketItems,
  ] = await Promise.all(Object.values(URLS).map(fetchJson));
  const twRecipes = parseTwRecipes(await fetchText(TW_RECIPE_CSV));
  console.log('  全部下載完成（台服配方表', twRecipes.size, '筆）');

  /* ---------- 1. craft-data.js：配方 + 道具名稱 + 台服可用性 ---------- */
  const twIdSet = new Set(twRecipesArr.map((r) => r.id));
  const { recipes, skipped, overrides } = convertRecipes(rawRecipes, twIdSet, twRecipes);
  console.log('以台服配方表修正：素材', overrides.ingredients, '筆、產量', overrides.yields, '筆');
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

  /* 全物品圖示對照表：跟上面 craft-icons.js 的邏輯完全一樣，只是範圍從「配方相關」擴大到
   * items.json 全部物品，給市場頁用（搜尋結果、詳情頁、供應鏈節點都要用到圖示，市場頁能查到
   * 的物品不限於配方相關）。fetchItemIcons本身已經是分批查詢，範圍變大只是多跑幾批，
   * 邏輯不用改。 */
  const allItemIds = new Set(Object.keys(items).map(Number));
  const allIcons = await fetchItemIcons(allItemIds);
  fs.writeFileSync(OUT.itemIconsAll,
    '/* item-icons-tw.js — 全物品圖示網址對照表（itemId -> XIVAPI v2 asset URL），本檔案由\n' +
    ' * scripts/update-craft-data.js 自動產生，請勿手動編輯。來源：v2.xivapi.com（官方公開API）。\n' +
    ' * 涵蓋 items.json 全部物品（不限配方相關），給市場頁用；craft-icons.js 那份範圍較小，\n' +
    ' * 是給生產頁用的（只需要配方相關物品，不用載入這份更大的檔案）。\n' +
    ' * 最後更新時間：' + new Date().toISOString() + '\n' +
    ' */\n' +
    'const ITEM_ICONS_TW_ALL=' + JSON.stringify(allIcons) + ';\n'
  );
  console.log('已寫入', OUT.itemIconsAll, '（全物品圖示，', Object.keys(allIcons).length, '筆，供市場頁用）');


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
  if (!Array.isArray(marketItems) || marketItems.length < 1000) throw new Error('market-items.json 內容異常（' + (marketItems && marketItems.length) + '筆），已停止');
  const collectableTiers = {};
  Object.keys(collectables).forEach(function (id) {
    const c = collectables[id];
    if (c && c.base && c.mid && c.high && c.base.rating > 0) collectableTiers[id] = [c.base.rating, c.mid.rating, c.high.rating];
  });
  // 物品詳情要顯示的「版本・分類」：版本來自 Teamcraft（item-patch），分類是台服遊戲資料表的繁中分類名稱
  const itemCsv = parseCsvRows((await fetchText(TW_ITEM_CSV)).replace(/^\uFEFF/, ''));
  const uiCol = itemCsv[1].indexOf('ItemUICategory');
  const uiCsv = parseCsvRows((await fetchText(TW_ITEM_UI_CATEGORY_CSV)).replace(/^\uFEFF/, ''));
  if (uiCol < 0 || uiCsv[1].indexOf('Name') < 0) throw new Error('台服 Item.csv／ItemUICategory.csv 找不到預期欄位，資料表可能已改版');
  const categoryName = {};
  uiCsv.slice(3).forEach(function (r) { if (/^\d+$/.test(r[0]) && r[1]) categoryName[r[0]] = r[1]; });
  const itemUi = {};
  itemCsv.slice(3).forEach(function (r) { if (/^\d+$/.test(r[0])) itemUi[r[0]] = parseInt(r[uiCol], 10) || 0; });
  const patchVersion = {};
  Object.keys(patchNames).forEach(function (k) {
    const v = patchNames[k] && patchNames[k].version;
    const m = v && /^(\d+)\.(\d)/.exec(v);                 // 6.28 → 6.2、6.05 → 6.0（只取 X.Y）
    if (m) patchVersion[patchNames[k].id != null ? patchNames[k].id : k] = m[1] + '.' + m[2];
  });
  const itemMeta = {}; const usedPatch = {}; const usedCat = {};
  Object.keys(itemNamesTw).forEach(function (id) {
    const pc = itemPatch[id] || 0; const c = itemUi[id] || 0;
    if (!pc && !c) return;
    itemMeta[id] = pc * 1000 + c;
    if (pc && patchVersion[pc]) usedPatch[pc] = patchVersion[pc];
    if (c && categoryName[c]) usedCat[c] = categoryName[c];
  });
  console.log('物品版本・分類:', Object.keys(itemMeta).length, '筆');
  const marketableTw = marketItems.filter(function (id) { return itemNamesTw[id]; }).sort(function (a, b) { return a - b; });
  console.log('可交易（有繁中名稱）:', marketableTw.length, '筆');

  fs.writeFileSync(OUT.craftData,
    '/* craft-data.js — 生產製作「資料」：配方庫（含精確材料HQ權重/專家配方狀態旗標/台服可用性）、道具繁中名稱表。\n' +
    ' * 本檔案由 scripts/update-craft-data.js 自動產生，請勿手動編輯。\n' +
    ' * 來源：ffxiv-teamcraft/ffxiv-teamcraft（MIT）。twAvailable 標記依 tw-recipes.json 是否收錄該配方id判斷；\n' +
    ' * 台服可用的配方，素材與產量以台服配方表（thewakingsands/ffxiv-datamining-tc）為準。\n' +
    ' * 最後更新時間：' + new Date().toISOString() + '\n' +
    ' */\n' +
    'const CRAFT_RECIPES=' + JSON.stringify(recipes) + ';\n' +
    'const CRAFT_ITEM_NAMES_TW=' + JSON.stringify(itemNamesTw) + ';\n' +
    '/* CRAFT_COLLECTABLE_TIERS：收藏品（可交給收藏品商人換票券）三檔收藏度門檻 { 物品id: [低, 中, 高] }，\n' +
    ' * 供求解頁的「目標收藏度」滑桿標示門檻；月球製作的門檻另由 data/lunar.json 提供。 */\n' +
    'const CRAFT_COLLECTABLE_TIERS=' + JSON.stringify(collectableTiers) + ';\n'
  );
  console.log('已寫入', OUT.craftData, '（收藏品門檻', Object.keys(collectableTiers).length, '筆）');

  const i18nItems = {};
  for (const id of Object.keys(items)) {
    i18nItems[id] = Object.assign({}, items[id], { tw: twItems[id] && twItems[id].tw, zh: zhItems[id] && zhItems[id].zh });
  }
  fs.writeFileSync(OUT.i18n, JSON.stringify(i18nItems));
  console.log('已寫入', OUT.i18n, '（多語言完整版，供之後多語言介面使用）');

  /* 精簡版全物品繁中名稱表：跟上面的itemNamesTw是同一份資料（涵蓋items.json裡全部物品，
   * 不只是配方相關的），只是這裡單獨輸出成一個小檔案，給市場頁做「搜尋所有物品」用——
   * 不需要為了搜個名字，把整個 craft-data.js（含13,892筆配方，好幾MB）一起載進來。 */
  fs.writeFileSync(OUT.itemNamesTw,
    '/* item-names-tw.js — 全物品繁中名稱表（id -> 名稱），跟 craft-data.js 裡的 CRAFT_ITEM_NAMES_TW 同來源，\n' +
    ' * 差別是這份涵蓋 items.json 全部物品（不限配方相關），給市場頁搜尋用，體積比 craft-data.js 小很多。\n' +
    ' * 本檔案由 scripts/update-craft-data.js 自動產生，請勿手動編輯。來源：ffxiv-teamcraft/ffxiv-teamcraft（MIT）。\n' +
    ' * 最後更新時間：' + new Date().toISOString() + '\n' +
    ' */\n' +
    'const ITEM_NAMES_TW_ALL=' + JSON.stringify(itemNamesTw) + ';\n' +
    '/* ITEM_MARKETABLE_TW：可在市場交易（有繁中名稱）的物品編號。市場頁搜尋只列這些；貨幣、不可交易的\n' +
    ' * 物品不需要被直接搜尋到，仍可從其他物品的兌換清單點進去查看。 */\n' +
    'const ITEM_MARKETABLE_TW=' + JSON.stringify(marketableTw) + ';\n' +
    '/* ITEM_META_TW：{ 物品id: 加入版本代碼×1000 + 道具分類編號 }，用於市場頁物品詳情顯示「版本・分類」。\n' +
    ' * ITEM_PATCH_TW：版本代碼 → 版本（只取 X.Y，例如 6.28 → 6.2）；ITEM_CATEGORY_TW：分類編號 → 繁中分類名稱（台服 ItemUICategory）。 */\n' +
    'const ITEM_META_TW=' + JSON.stringify(itemMeta) + ';\n' +
    'const ITEM_PATCH_TW=' + JSON.stringify(usedPatch) + ';\n' +
    'const ITEM_CATEGORY_TW=' + JSON.stringify(usedCat) + ';\n'
  );
  console.log('已寫入', OUT.itemNamesTw, '（全物品繁中名稱，', Object.keys(itemNamesTw).length, '筆，供市場頁搜尋用）');

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
