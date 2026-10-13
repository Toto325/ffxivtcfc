// NPC 不一定直接連到商店：常見的轉接方式
//   NPC → 選單 TopicSelect → 多家店
//   NPC → PreHandler(Target) → 店
//   NPC → CustomTalk（腳本參數內含店的編號）→ 店
//   NPC → InclusionShop → Category → Series → SpecialShop
// 這裡用繁中服 CSV 建立關係圖，回傳「某 NPC 在台服能到達的所有編號」。
import { twCsvText, parseTwCsv, toInt } from './common.mjs';

const MIN_EVENT_ID = 65536; // 事件處理器編號都 >= 65536，用來排除一般的小數字

export async function loadShopGraph() {
  const [topic, pre, custom, incl, inclCat, inclSeries] = await Promise.all([
    twCsvText('TopicSelect'), twCsvText('PreHandler'), twCsvText('CustomTalk'),
    twCsvText('InclusionShop'), twCsvText('InclusionShopCategory'), twCsvText('InclusionShopSeries'),
  ]);

  const edges = new Map(); // id -> Set(target ids)
  const addEdge = (from, to) => {
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from).add(to);
  };

  // 一般轉接：該列中所有 >= 65536 的數字都視為目標
  for (const text of [topic, pre, custom]) {
    const { rows } = parseTwCsv(text);
    for (const r of rows) {
      const id = toInt(String(r[0]).split('.')[0]);
      for (let c = 1; c < r.length; c += 1) {
        const v = toInt(r[c]);
        if (v >= MIN_EVENT_ID && v !== id) addEdge(id, v);
      }
    }
  }

  // InclusionShop → Category（小編號）→ Series（小編號）→ SpecialShop
  const seriesShops = new Map(); // seriesId -> Set(SpecialShop)
  {
    const { names, rows } = parseTwCsv(inclSeries);
    const col = names.indexOf('SpecialShop');
    if (col < 0) throw new Error('InclusionShopSeries.csv 找不到 SpecialShop 欄位');
    for (const r of rows) {
      const sid = toInt(String(r[0]).split('.')[0]);
      if (!seriesShops.has(sid)) seriesShops.set(sid, new Set());
      const v = toInt(r[col]);
      if (v > 0) seriesShops.get(sid).add(v);
    }
  }
  const categorySeries = new Map(); // categoryId -> seriesId
  {
    const { names, rows } = parseTwCsv(inclCat);
    const col = names.indexOf('InclusionShopSeries');
    if (col < 0) throw new Error('InclusionShopCategory.csv 找不到 InclusionShopSeries 欄位');
    for (const r of rows) categorySeries.set(toInt(r[0]), toInt(r[col]));
  }
  {
    const { names, rows } = parseTwCsv(incl);
    const cols = names.map((n, i) => (/^Category\[\d+\]$/.test(n) ? i : -1)).filter((i) => i >= 0);
    for (const r of rows) {
      const id = toInt(r[0]);
      for (const c of cols) {
        const cat = toInt(r[c]);
        if (!cat) continue;
        const series = categorySeries.get(cat);
        for (const shop of seriesShops.get(series) || []) addEdge(id, shop);
      }
    }
  }

  const cache = new Map();
  /** 從 NPC 的 ENpcData 出發，追蹤所有轉接，回傳能到達的編號集合 */
  function reach(starts) {
    const seen = new Set();
    const stack = [...starts];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const t of edges.get(id) || []) if (!seen.has(t)) stack.push(t);
    }
    return seen;
  }
  return {
    reach,
    reachForNpc(npcId, directLinks) {
      if (!cache.has(npcId)) cache.set(npcId, reach(directLinks || []));
      return cache.get(npcId);
    },
    edgeCount: [...edges.values()].reduce((a, s) => a + s.size, 0),
  };
}
