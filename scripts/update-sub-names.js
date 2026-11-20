#!/usr/bin/env node
/* scripts/update-sub-names.js
 * 自動補上潛水艇「繁中名稱」，來源：ffxiv-teamcraft/ffxiv-teamcraft（staging 分支, MIT）
 *   tw/tw-submarine-voyages.json → js/sub-data.js     SUB_SECTORS 的航區繁中名（第 5 欄）
 *   tw/tw-items.json             → js/items.js        ITEM_DB（只處理潛水艇戰利品用到的物品）
 *
 * 只動「名稱」，不動任何數值（距離、經驗、門檻、戰利品分級等都不碰）。
 * 規則（保守）：
 *   - 現有名稱已經是中文 → 不覆蓋（若與 Teamcraft 不同只印警告）
 *   - 現有名稱是英文／缺漏，且 Teamcraft 已有繁中名 → 補上
 *   - Teamcraft 還沒有繁中名（國際服新內容）→ 維持原狀（英文）
 * 保護：來源抓不到、格式不對、筆數明顯變少、更新後資料無法載入或筆數改變 → 直接報錯結束，
 * 不寫任何檔案（寫檔前先在記憶體驗證，寫檔用暫存檔再改名）。
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw/';
const ROOT = path.join(__dirname, '..');
const SUB_DATA = path.join(ROOT, 'js', 'sub-data.js');
const ITEMS_JS = path.join(ROOT, 'js', 'items.js');
const HAS_CJK = /[\u3400-\u9fff]/;

function fail(msg) { console.error('❌ ' + msg); process.exit(1); }

function get(url, tries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = n => {
      const req = https.get(url, { timeout: 60000 }, res => {
        if (res.statusCode !== 200) { res.resume(); return n > 1 ? setTimeout(() => attempt(n - 1), 2000) : reject(new Error(`${url} → HTTP ${res.statusCode}`)); }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', e => n > 1 ? setTimeout(() => attempt(n - 1), 2000) : reject(new Error(`${url} → ${e.message}`)));
    };
    attempt(tries);
  });
}

function atomicWrite(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function loadSubData(code) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code + '\n;this.__r={S:SUB_SECTORS,T:SUB_LOOT_TIER,L:SUB_LOOT};', ctx, { timeout: 5000 });
  return ctx.__r;
}

(async () => {
  /* ---------- 1. 抓來源並驗證格式 ---------- */
  let twVoy, twItems;
  try {
    twVoy = JSON.parse(await get(BASE + 'tw-submarine-voyages.json'));
    twItems = JSON.parse(await get(BASE + 'tw-items.json'));
  } catch (e) { fail('來源抓取或解析失敗：' + e.message); }

  const voyKeys = Object.keys(twVoy);
  if (voyKeys.length < 120) fail(`tw-submarine-voyages 筆數異常（${voyKeys.length}，預期 ≥120）`);
  for (const k of voyKeys) {
    const v = twVoy[k];
    if (!v || typeof v.tw !== 'string' || typeof v.location !== 'string') fail(`tw-submarine-voyages 格式不對（id ${k}）`);
  }
  if (Object.keys(twItems).length < 40000) fail(`tw-items 筆數異常（${Object.keys(twItems).length}，預期 ≥40000）`);

  /* ---------- 2. sub-data.js：航區名 ---------- */
  const subSrc = fs.readFileSync(SUB_DATA, 'utf8');
  const before = loadSubData(subSrc);
  /* 資料列在檔案裡有「一行一列」也有「一行多列、逗號後帶空格」兩種寫法，所以不能逐行處理，
   * 改成只在 SUB_SECTORS 區塊內用全域正則逐列處理，並保留原本的空白格式。 */
  const blockStart = subSrc.indexOf('const SUB_SECTORS=[');
  const blockEnd = blockStart < 0 ? -1 : subSrc.indexOf(']];', blockStart) + 1; /* 陣列結尾是 ']];'，blockEnd 指到最後一列的 ']' 之後 */
  if (blockStart >= 0 && blockEnd <= 0) fail('sub-data.js 找不到 SUB_SECTORS 結尾');
  if (blockStart < 0 || blockEnd < 0) fail('sub-data.js 找不到 SUB_SECTORS 區塊');
  const rowRe = /(\[(\d+),\s*(\d+),\s*"([^"]*)",\s*"(?:[^"\\]|\\.)*",\s*")((?:[^"\\]|\\.)*)(")/g;
  let sectorChanged = 0, sectorWarn = 0, sectorNoTw = 0;
  const block = subSrc.slice(blockStart, blockEnd).replace(rowRe, (all, head, id, map, letter, cur, q) => {
    const t = twVoy[id];
    if (!t) { if (!HAS_CJK.test(cur)) sectorNoTw++; return all; }
    if (t.location !== letter) fail(`航區 ${id} 代號不一致（頁面 ${letter} / Teamcraft ${t.location}），資料可能整批改版，請人工檢查`);
    const name = t.tw.split('\u3000').slice(1).join('\u3000') || t.tw;
    if (!HAS_CJK.test(name) || cur === name) return all;
    if (HAS_CJK.test(cur)) { console.warn(`⚠ 航區 ${id}（${letter}）現有「${cur}」與 Teamcraft「${name}」不同，未覆蓋`); sectorWarn++; return all; }
    sectorChanged++;
    console.log(`航區 ${id} ${letter}：${cur} → ${name}`);
    return head + name + q;
  });
  const newSub = subSrc.slice(0, blockStart) + block + subSrc.slice(blockEnd);
  const after = loadSubData(newSub);
  if (after.S.length !== before.S.length) fail('更新後航區數量改變，中止');
  for (let i = 0; i < before.S.length; i++) {
    const a = before.S[i], b = after.S[i];
    for (let j = 0; j < a.length; j++) if (j !== 4 && a[j] !== b[j]) fail(`航區 ${a[0]} 第 ${j} 欄被改動，中止`);
  }

  /* ---------- 3. items.js：潛水艇戰利品名稱 ---------- */
  const itemSrc = fs.readFileSync(ITEMS_JS, 'utf8');
  const dbMatch = itemSrc.match(/const ITEM_DB=(\{[^\n]*\});/);
  if (!dbMatch) fail('items.js 找不到 ITEM_DB');
  let db;
  try { db = JSON.parse(dbMatch[1]); } catch (e) { fail('ITEM_DB 解析失敗：' + e.message); }
  const dbBefore = Object.keys(db).length;
  const lootIds = new Set();
  Object.values(before.T).forEach(t => Object.values(t).forEach(a => a.forEach(i => lootIds.add(i))));
  Object.values(before.L).forEach(a => a.forEach(i => lootIds.add(i)));
  let itemAdded = 0, itemFixed = 0, itemEnglish = 0;
  for (const id of lootIds) {
    const tw = twItems[id] && twItems[id].tw;
    const cur = db[id];
    if (!tw || !HAS_CJK.test(tw)) { if (cur && !HAS_CJK.test(cur)) itemEnglish++; continue; }
    if (cur === undefined) { db[id] = tw; itemAdded++; console.log(`物品 ${id} 新增：${tw}`); }
    else if (!HAS_CJK.test(cur)) { db[id] = tw; itemFixed++; console.log(`物品 ${id}：${cur} → ${tw}`); }
    else if (cur !== tw) console.warn(`⚠ 物品 ${id} 現有「${cur}」與 Teamcraft「${tw}」不同，未覆蓋`);
  }
  if (Object.keys(db).length < dbBefore) fail('ITEM_DB 筆數變少，中止');
  /* 保留原本的輸出格式："id": "name", ...（鍵數字遞增，JSON.parse 會自動排序）*/
  const dbText = '{' + Object.entries(db).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ') + '}';
  const newItems = itemSrc.replace(dbMatch[0], () => `const ITEM_DB=${dbText};`);
  const ctx2 = {}; vm.createContext(ctx2);
  try { vm.runInContext(newItems + '\n;this.__n=Object.keys(ITEM_DB).length;', ctx2, { timeout: 5000 }); } catch (e) { fail('更新後 items.js 無法載入：' + e.message); }
  if (ctx2.__n !== Object.keys(db).length) fail('更新後 ITEM_DB 筆數不符，中止');

  /* ---------- 4. 全部驗證通過才寫檔 ---------- */
  let wrote = false;
  if (newSub !== subSrc) { atomicWrite(SUB_DATA, newSub); wrote = true; }
  if (newItems !== itemSrc) { atomicWrite(ITEMS_JS, newItems); wrote = true; }
  console.log(`\n航區名稱：更新 ${sectorChanged}、警告 ${sectorWarn}、Teamcraft 尚無繁中（維持英文）${sectorNoTw}`);
  console.log(`物品名稱：新增 ${itemAdded}、英文換繁中 ${itemFixed}、Teamcraft 尚無繁中（維持英文）${itemEnglish}`);
  console.log(wrote ? '✅ 已寫入更新' : '✅ 沒有需要更新的內容');
})().catch(e => fail(e.message));
