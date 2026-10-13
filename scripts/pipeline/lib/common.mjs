// 共用工具：下載（含快取）、CSV 解析、繁中服 CSV 載入
import fs from 'fs';
import path from 'path';

export const CACHE_DIR = path.resolve(process.env.PIPELINE_CACHE || '.cache');
export const OUT_DIR = path.resolve(process.env.PIPELINE_OUT || 'out');

const TEAMCRAFT_RAW =
  process.env.TEAMCRAFT_RAW ||
  'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib';
const TW_CSV_RAW =
  process.env.TW_CSV_RAW ||
  'https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-tc/master';
const GLOBAL_CSV_RAW =
  process.env.GLOBAL_CSV_RAW ||
  'https://raw.githubusercontent.com/xivapi/ffxiv-datamining/master/csv/en';

// 若你已在本機有 Teamcraft 的檔案（例如 git submodule），設定 TEAMCRAFT_DIR 即可，不再下載。
// 例如：TEAMCRAFT_DIR=./teamcraft_git/libs/data/src/lib
const TEAMCRAFT_DIR = process.env.TEAMCRAFT_DIR || '';

export const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
export const offline = flags.has('--offline');

export function log(...a) { console.log(...a); }

async function download(url, file) {
  if (offline) {
    if (!fs.existsSync(file)) throw new Error(`離線模式找不到快取：${file}`);
    return fs.readFileSync(file, 'utf8');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下載失敗 ${url} → HTTP ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  log(`  ↓ ${path.basename(file)}`);
  return text;
}

/** 讀取 Teamcraft 的檔案，例如 'json/npcs.json'、'extracts/extracts.json'、'json/tw/tw-npcs.json' */
export async function teamcraftJson(rel) {
  if (TEAMCRAFT_DIR) return JSON.parse(fs.readFileSync(path.join(TEAMCRAFT_DIR, rel), 'utf8'));
  const text = await download(`${TEAMCRAFT_RAW}/${rel}`, path.join(CACHE_DIR, 'teamcraft', rel));
  return JSON.parse(text);
}

export async function twCsvText(name) {
  return download(`${TW_CSV_RAW}/${name}.csv`, path.join(CACHE_DIR, 'tw', `${name}.csv`));
}
export async function globalCsvText(name) {
  return download(`${GLOBAL_CSV_RAW}/${name}.csv`, path.join(CACHE_DIR, 'global-en', `${name}.csv`));
}

export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1; } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows.length) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  return rows;
}

/** 國際服（xivapi）格式：第一列為欄位名稱 */
export function parseNamedCsv(text) {
  const rows = parseCsvRows(text);
  const headers = rows.shift();
  return rows.map((vals) => Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ''])));
}

/**
 * 繁中服（thewakingsands）格式：
 *   第 1 列 key,0,1,2…   第 2 列 欄位名稱（有些資料表為空）   第 3 列 型別   之後為資料
 * 回傳 { names, rows }，rows 為字串陣列，第 0 欄為 key。
 */
export function parseTwCsv(text) {
  const all = parseCsvRows(text);
  return { names: all[1], rows: all.slice(3) };
}

export const toInt = (v, d = 0) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : d; };

export function writeJson(file, data, pretty = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data));
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  log(`✔ ${file}（${kb} KB）`);
}

export function count(map, key, n = 1) { map[key] = (map[key] || 0) + n; }
