#!/usr/bin/env node
/**
 * 依正確順序執行全部建置腳本：
 *   build-obtainable → reconcile-tw-trades → build-exchange-graph → build-sources → build-lunar
 * 用法：node run-all.mjs [--offline] [--pretty]
 * 任何一步失敗（結束代碼不為 0）就停止並回報。
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const steps = ['build-obtainable.mjs', 'reconcile-tw-trades.mjs', 'build-exchange-graph.mjs', 'build-sources.mjs', 'build-lunar.mjs'];
for (const step of steps) {
  console.log(`\n===== ${step} =====`);
  const r = spawnSync(process.execPath, [path.join(dir, step), ...args], { stdio: 'inherit', cwd: process.cwd() });
  if (r.status !== 0) { console.error(`\n✘ ${step} 失敗（結束代碼 ${r.status}），已停止。`); process.exit(r.status || 1); }
}
console.log('\n✔ 全部完成');
