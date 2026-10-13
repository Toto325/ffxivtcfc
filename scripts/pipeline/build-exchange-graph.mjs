#!/usr/bin/env node
/**
 * 兌換關係圖：物品（貨幣）→ 可交易物品的換算路徑（供「貨幣換什麼最划算」使用，不含價格）
 *
 * 前置：先執行 build-obtainable.mjs（產生 out/obtainable.json）。
 *
 * 規則：
 *   - 排除 dead（過期貨幣、神典石輪替退役）、seasonal（限期活動）與貨幣未能解讀的兌換。同貨幣、不同數量的變體都保留。
 *   - 前置：build-obtainable.mjs → reconcile-tw-trades.mjs → 本腳本。
 *   - 每筆兌換是一條「邊」：costs[] → result。成本可以有多種。
 *   - 從起點物品出發，每一步使用「成本中包含目前持有物品」的邊：
 *       邊上其他成本稱為 extras（額外材料）。
 *       extras 全部可在市場購買（可交易）時，路徑才成立，網站用市價扣除這些成本。
 *       extras 含不可交易物品（例如要同時湊齊四種貨幣）→ 不納入路徑，計入 meta.blockedByUntradableExtras。
 *   - 目標必須是可交易物品（台服 Item.csv 的 ItemSearchCategory > 0）。中間物品可以不可交易。
 *   - 起點每 1 單位的結果：
 *       ratio                   得到多少單位目標
 *       extras[{id, perStart}]  需要另外準備（購買）多少單位的哪個物品
 *     價值 = 目標市價 × ratio − Σ(extras 市價 × perStart)
 *   - 完整路徑：via 是 edges 的索引（由前到後），每條邊都帶 NPC、商店、解鎖條件，可直接顯示步驟。
 *
 * 用法：node build-exchange-graph.mjs [--offline] [--pretty]
 */
import fs from 'fs';
import path from 'path';
import { OUT_DIR, flags, log, teamcraftJson, twCsvText, parseTwCsv, toInt, writeJson } from './lib/common.mjs';

const MAX_HOPS = 4;
const MAX_FRONTIER = 300000;

async function main() {
  const file = path.join(OUT_DIR, 'obtainable.json');
  if (!fs.existsSync(file)) throw new Error('找不到 out/obtainable.json，請先執行 build-obtainable.mjs');
  const obtainable = JSON.parse(fs.readFileSync(file, 'utf8'));
  const twItems = await teamcraftJson('json/tw/tw-items.json');

  const marketable = new Set();
  {
    const { names, rows } = parseTwCsv(await twCsvText('Item'));
    const col = names.indexOf('ItemSearchCategory');
    if (col < 0) throw new Error('Item.csv 找不到 ItemSearchCategory 欄位（資料表格式可能已改版）');
    for (const r of rows) if (toInt(r[col]) > 0) marketable.add(toInt(r[0]));
  }

  const edges = [];
  let skippedDead = 0; let skippedSeasonal = 0; let skippedUnresolved = 0; let skippedSuperseded = 0;
  for (const [itemKey, entry] of Object.entries(obtainable.items)) {
    (entry.trades || []).forEach((t, idx) => {
      if (t.dead) { skippedDead += 1; return; }
      if (t.superseded) { skippedSuperseded += 1; return; }
      if (t.status === 'seasonal') { skippedSeasonal += 1; return; }            // 限期活動不列入換算
      if (t.costs.some((c) => c.id === null)) { skippedUnresolved += 1; return; } // 貨幣未能解讀
      edges.push({
        ref: { item: toInt(itemKey), idx },
        costs: t.costs.map((c) => ({ id: c.id, amount: c.amount, ...(c.hq ? { hq: true } : {}) })),
        result: { id: toInt(itemKey), amount: t.amount },
        resultTradable: marketable.has(toInt(itemKey)),
        shopIds: t.shopIds, npcIds: t.npcIds, verified: t.verified === true,
        ...(t.unlock ? { unlock: t.unlock } : {}),
        ...(t.gcRank ? { gcRank: t.gcRank } : {}),
      });
    });
  }
  const byCost = new Map();
  edges.forEach((e, i) => e.costs.forEach((c) => {
    if (!byCost.has(c.id)) byCost.set(c.id, []);
    byCost.get(c.id).push(i);
  }));
  log(`  有效兌換 ${edges.length}（排除過期 ${skippedDead}、限期活動 ${skippedSeasonal}、貨幣未解 ${skippedUnresolved}）`);

  const paths = {};
  const warnings = [];
  let blockedByUntradableExtras = 0;
  for (const start of byCost.keys()) {
    const best = new Map(); // (目標, 是否受限, 額外材料組合) → 比例最高的路徑
    let frontier = [{ item: start, ratio: 1, via: [], seen: new Set([start]), locked: false, extras: new Map() }];
    for (let hop = 1; hop <= MAX_HOPS && frontier.length; hop += 1) {
      const next = [];
      for (const node of frontier) {
        for (const ei of byCost.get(node.item) || []) {
          const e = edges[ei];
          const own = e.costs.find((c) => c.id === node.item);
          const others = e.costs.filter((c) => c.id !== node.item);
          if (others.some((c) => !marketable.has(c.id))) { blockedByUntradableExtras += 1; continue; }
          const target = e.result.id;
          if (target === start || node.seen.has(target)) continue;
          const ratio = node.ratio * (e.result.amount / own.amount);
          const extras = new Map(node.extras);
          for (const c of others) extras.set(c.id, (extras.get(c.id) || 0) + (node.ratio * c.amount) / own.amount);
          const via = [...node.via, ei];
          const locked = node.locked || Boolean(e.unlock);
          if (e.resultTradable) {
            const extrasKey = [...extras.entries()].sort((a, b) => a[0] - b[0]).map(([id, v]) => `${id}:${v.toFixed(9)}`).join(',');
            const bk = `${target}|${locked ? 1 : 0}|${extrasKey}`;
            const cur = best.get(bk);
            if (!cur || ratio > cur.ratio + 1e-12) best.set(bk, { target, ratio, hops: hop, via, locked, extras });
          }
          if (hop < MAX_HOPS) next.push({ item: target, ratio, via, seen: new Set([...node.seen, target]), locked, extras });
        }
      }
      frontier = next;
      if (frontier.length > MAX_FRONTIER) { warnings.push(`起點 ${start} 在第 ${hop} 步展開過多（${frontier.length}），已停止延伸`); break; }
    }
    if (best.size) {
      paths[start] = [...best.values()]
        .map((v) => ({
          target: v.target, ratio: v.ratio, hops: v.hops, via: v.via,
          ...(v.extras.size ? { extras: [...v.extras.entries()].map(([id, perStart]) => ({ id, perStart })) } : {}),
          ...(v.locked ? { locked: true } : {}),
        }))
        .sort((a, b) => a.hops - b.hops || b.ratio - a.ratio);
    }
  }

  const nameOf = (id) => twItems[String(id)]?.tw || String(id);
  const from = paths[28] || [];
  const example = from.find((p) => p.target === 7766 && !p.extras && !p.locked);
  const mystery = [13582, 13584, 13586, 13588].map((id) => ({
    name: nameOf(id),
    reachableTradable: (paths[id] || []).length,
    targets: (paths[id] || []).slice(0, 4).map((p) => `${nameOf(p.target)}${p.extras ? '（需另購 ' + p.extras.map((x) => nameOf(x.id)).join('、') + '）' : ''}`),
  }));
  const meta = {
    generatedAt: new Date().toISOString(), maxHops: MAX_HOPS,
    counts: {
      edges: edges.length, skippedDeadTrades: skippedDead, skippedSeasonalTrades: skippedSeasonal, skippedUnresolvedTrades: skippedUnresolved,
      startsWithPaths: Object.keys(paths).length,
      totalPaths: Object.values(paths).reduce((a, p) => a + p.length, 0),
      pathsWithExtras: Object.values(paths).reduce((a, p) => a + p.filter((x) => x.extras).length, 0),
      lockedPaths: Object.values(paths).reduce((a, p) => a + p.filter((x) => x.locked).length, 0),
      marketableItems: marketable.size,
    },
    blockedByUntradableExtras,
    example: { text: example ? `${nameOf(28)} → ${example.via.map((i) => nameOf(edges[i].result.id)).join(' → ')}（每 1 個得 ${example.ratio.toFixed(4)}）` : '找不到' },
    mysteryIntermediates: mystery,
    poeticsHops: Object.fromEntries([1, 2, 3, 4].map((h) => [h, from.filter((p) => p.hops === h).length])),
    warnings,
    note: 'ratio=每1單位起點得到多少目標；extras=需另外購買的物品（每1單位起點）；via=edges 索引；locked=路徑上有任務/成就解鎖。價值=目標市價×ratio−Σ(extras市價×perStart)。',
  };
  writeJson(path.join(OUT_DIR, 'exchange-graph.json'), { meta, edges, paths }, flags.has('--pretty'));
  log('\n── 驗證報告 ──');
  log(JSON.stringify(meta, null, 2));
}

main().catch((e) => { console.error('✘', e.message); process.exit(1); });
