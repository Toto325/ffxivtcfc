/* lunar-ui.js — 「月球製作」配方瀏覽彈窗（生產頁）
 *
 * 月球（宇宙探索）製作的配方、任務等級（D／C／B／A／EX／EX+）資料在 data/lunar.json
 * （由 scripts/pipeline 每週自動產生，第一次打開才下載）。這裡只負責「依職業與任務等級找到要做的東西」，
 * 選定後交給生產頁原本的選配方流程（求解、巨集、模擬器都沿用，沒有另外一套）。
 */
(function () {
  'use strict';

  const JOBS = ['木工師', '鍛造師', '甲冑師', '金工師', '皮革師', '裁縫師', '鍊金術師', '烹調師']  // 與生產頁（craft-panel.js 的 JOBS）一致;
  const RANKS = [{ id: 6, label: 'EX+' }, { id: 5, label: 'EX' }, { id: 4, label: 'A' }, { id: 3, label: 'B' }, { id: 2, label: 'C' }, { id: 1, label: 'D' }];

  let promise = null; let DATA = null;
  const state = { job: 0, rank: 6 };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function nameOf(id) {
    if (typeof CRAFT_ITEM_NAMES_TW !== 'undefined' && CRAFT_ITEM_NAMES_TW[id]) return CRAFT_ITEM_NAMES_TW[id];
    if (typeof ITEM_NAMES_TW_ALL !== 'undefined' && ITEM_NAMES_TW_ALL[id]) return ITEM_NAMES_TW_ALL[id];
    return '#' + id;
  }

  function load() {
    if (!promise) {
      promise = fetch('data/lunar.json').then(function (r) {
        if (!r.ok) throw new Error('月球製作資料載入失敗（' + r.status + '）');
        return r.json();
      }).then(function (d) { DATA = d; return d; }).catch(function (e) { promise = null; throw e; });
    }
    return promise;
  }

  function recipesFor(job, rank) {
    return DATA.recipes.filter(function (r) { return r.job === job + 8 && r.cosmicRanks.indexOf(rank) !== -1; })
      .sort(function (a, b) { return a.lvl - b.lvl || a.rlvl - b.rlvl || nameOf(a.result).localeCompare(nameOf(b.result), 'zh-Hant'); });
  }
  function countFor(job, rank) { return recipesFor(job, rank).length; }

  function ensureModal() {
    let m = $('lu-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'lu-modal';
    m.className = 'lu-backdrop';
    m.style.display = 'none';
    m.innerHTML = '<div class="lu-box" role="dialog" aria-modal="true" aria-label="月球製作">' +
      '<div class="lu-head"><div class="lu-title"><i class="ph ph-moon"></i> 月球製作 <small>選擇職業與任務等級，點選要製作的物品</small></div>' +
      '<button type="button" class="lu-close" id="lu-close" aria-label="關閉">✕</button></div>' +
      '<div class="lu-tabs" id="lu-jobs"></div><div class="lu-tabs lu-ranks" id="lu-ranks"></div>' +
      '<div class="lu-list" id="lu-list"></div>' +
      '<div class="lu-foot">收藏價值滿分 ＝ 品質上限 ÷ 10；選好後生產頁會自動勾選「收藏品模式」，並把目標收藏度設在最高檔（可以用滑桿調整）。</div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.closest('#lu-close')) { close(); return; }
      const job = e.target.closest('[data-lu-job]'); if (job) { state.job = Number(job.dataset.luJob); render(); return; }
      const rank = e.target.closest('[data-lu-rank]'); if (rank) { state.rank = Number(rank.dataset.luRank); render(); return; }
      const item = e.target.closest('[data-lu-rid]'); if (item) pick(item.dataset.luRid);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && m.style.display !== 'none') close(); });
    return m;
  }

  function render() {
    $('lu-jobs').innerHTML = JOBS.map(function (j, i) {
      return '<button type="button" class="lu-tab' + (i === state.job ? ' on' : '') + '" data-lu-job="' + i + '">' + j + '</button>';
    }).join('');
    $('lu-ranks').innerHTML = '<span class="lu-label">任務等級</span>' + RANKS.map(function (r) {
      const n = countFor(state.job, r.id);
      return '<button type="button" class="lu-tab lu-rank' + (r.id === state.rank ? ' on' : '') + (n ? '' : ' empty') + '" data-lu-rank="' + r.id + '">' + r.label + ' <span>' + n + '</span></button>';
    }).join('');
    const list = recipesFor(state.job, state.rank);
    $('lu-list').innerHTML = list.length ? list.map(function (r) {
      return '<button type="button" class="lu-item" data-lu-rid="' + r.id + '">' +
        '<span class="lu-name">' + esc(nameOf(r.result)) + (r.yields > 1 ? '<small>×' + r.yields + '</small>' : '') + '</span>' +
        '<span class="lu-stats">Lv.' + r.lvl + '・進展 ' + r.progress + '・品質 ' + r.quality + '・耐久 ' + r.durability + '・收藏滿分 ' + r.maxCollectable + '</span></button>';
    }).join('') : '<div class="lu-empty">這個職業在這個等級沒有配方</div>';
  }

  function pick(rid) {
    const ok = typeof window.__craftSelectRecipe === 'function' ? window.__craftSelectRecipe(String(rid)) : false;
    if (ok === false) { $('lu-list').insertAdjacentHTML('afterbegin', '<div class="lu-empty">找不到這個配方（生產頁資料尚未載入完成），請稍後再試</div>'); return; }
    if (typeof window.__craftSetCollectable === 'function') window.__craftSetCollectable(true);
    close();
    const t = $('cf-solve-target'); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function close() { const m = $('lu-modal'); if (m) m.style.display = 'none'; }

  function open() {
    const m = ensureModal();
    $('lu-list').innerHTML = '<div class="lu-empty">載入中…</div>';
    m.style.display = 'flex';
    load().then(render).catch(function (e) { $('lu-list').innerHTML = '<div class="lu-empty">' + esc(e && e.message || e) + '</div>'; });
  }

  window.LunarUI = { open: open, close: close };
})();
