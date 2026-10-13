/* obtain-ui.js — 「取得方式」彈窗（市場頁物品詳情）
 *
 * 資料：data/obtain.json（由 scripts/pipeline 每週自動產生；第一次打開才下載，之後留在記憶體）。
 * 價格比較、物品名稱／圖示、製作配方都由 market-panel.js 透過 bridge 提供，這裡不重算價格。
 *
 * 顯示規則（與資料管線的狀態標籤對應）：
 *   active   → 正常顯示
 *   seasonal → 只出現在「限期活動」分類
 *   dead     → 一律隱藏（遊戲已不再提供，例如已過期的貨幣、退役的神典石世代）
 * 同一個分類超過 20 筆時，預設只顯示前 10 筆，其餘「顯示更多」展開（一般物品不受影響）。
 */
(function () {
  'use strict';

  const DATA_URL = 'data/obtain.json';
  const LIMIT_THRESHOLD = 20;   // 超過這個數量才折疊
  const LIMIT_SHOWN = 10;       // 折疊時預設顯示幾筆
  const JOBS = ['木工師', '鍛造師', '甲冑師', '金工師', '皮革師', '裁縫師', '鍊金術師', '烹調師']  // 與生產頁（craft-panel.js 的 JOBS）一致;

  const TAGS = [
    { id: 'trade', label: '兌換' }, { id: 'vendor', label: '商店' }, { id: 'craft', label: '製作' },
    { id: 'gather', label: '採集' }, { id: 'drop', label: '掉落' }, { id: 'instance', label: '副本' },
    { id: 'box', label: '開箱獲得' }, { id: 'map', label: '藏寶圖' }, { id: 'quest', label: '任務與成就' },
    { id: 'explore', label: '探索' }, { id: 'desynth', label: '分解與精選' }, { id: 'mog', label: '商城' },
    { id: 'seasonal', label: '限期活動' },
  ];

  let bridge = null;
  let dataPromise = null;
  let DATA = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  const fmt1 = function (n) { return (Math.round(n * 10) / 10).toFixed(1); };
  const flat = function (v) { return Array.isArray(v) ? v.flat(Infinity) : [v]; };

  function loadData() {
    if (!dataPromise) {
      dataPromise = fetch(DATA_URL).then(function (r) {
        if (!r.ok) throw new Error('取得方式資料載入失敗（' + r.status + '）');
        return r.json();
      }).then(function (d) { DATA = d; return d; }).catch(function (e) { dataPromise = null; throw e; });
    }
    return dataPromise;
  }

  /* ───────── 實體查詢 ───────── */
  const E = function () { return DATA.entities; };
  const itemName = function (id) { return bridge.name(id); };
  const placeName = function (zoneId) { return E().places[zoneId] || ''; };

  function itemChip(id, amount, extraClass) {
    return '<button type="button" class="ob-chip ' + (extraClass || '') + '" data-ob-item="' + id + '" title="查看這個物品">' +
      bridge.icon(id, 20) + '<span>' + esc(itemName(id)) + '</span>' + (amount != null ? '<b>×' + amount.toLocaleString('zh-TW') + '</b>' : '') + '</button>';
  }

  function npcLocations(npc) { return (npc && npc.locations) || []; }
  function npcChip(npcId, count) {
    const n = E().npcs[npcId]; if (!n) return '';
    const locs = npcLocations(n);
    const l = locs[0];
    const where = l ? placeName(l.zoneId) + (l.x != null ? ' (' + fmt1(l.x) + ', ' + fmt1(l.y) + ')' : '') + (locs.length > 1 ? ' 等 ' + locs.length + ' 處' : '') : '位置不明';
    return '<button type="button" class="ob-npc' + (l ? '' : ' ob-npc-nomap') + '" ' + (l ? 'data-ob-npc="' + npcId + '"' : 'disabled') + '>' +
      '<span class="ob-npc-name">' + esc(n.name) + (n.title ? '<small>' + esc(n.title) + '</small>' : '') + (count > 1 ? '<small>×' + count + '</small>' : '') + '</span>' +
      '<span class="ob-npc-where"><i class="ph ph-map-pin"></i> ' + esc(where) + '</span></button>';
  }
  function npcList(ids) {
    const known = ids.filter(function (id) { return E().npcs[id]; });
    if (!known.length) return '';
    // 同名、同頭銜、同位置的賣家（例如多個季節商店的同一個 NPC）合併成一個，標示數量
    const seen = {}; const uniq = [];
    known.forEach(function (id) {
      const n = E().npcs[id]; const l = npcLocations(n)[0];
      const key = n.name + '|' + (n.title || '') + '|' + (l ? l.mapId + ',' + l.x + ',' + l.y : '');
      if (seen[key] == null) { seen[key] = uniq.length; uniq.push({ id: id, count: 1 }); } else uniq[seen[key]].count += 1;
    });
    const locCount = uniq.filter(function (u) { return npcLocations(E().npcs[u.id]).length; }).length;
    return '<div class="ob-npcs">' + uniq.map(function (u) { return npcChip(u.id, u.count); }).join('') +
      (locCount > 1 ? '<button type="button" class="ob-link" data-ob-npcs="' + known.join(',') + '"><i class="ph ph-map-trifold"></i> 地圖總覽</button>' : '') + '</div>';
  }

  function unlockNote(unlock) {
    if (!unlock) return '';
    const parts = [];
    (unlock.quests || []).forEach(function (q) { const e = E().quests[q]; parts.push('完成任務「' + esc(e ? e.name : '#' + q) + '」'); });
    (unlock.achievements || []).forEach(function (a) { const e = E().achievements[a]; parts.push('取得成就「' + esc(e ? e.name : '#' + a) + '」'); });
    return parts.length ? '<div class="ob-note"><i class="ph ph-lock-key"></i> 需要' + parts.join('、') + (unlock.ambiguous ? '（條件可能依兌換項目而異）' : '') + '</div>' : '';
  }

  /* ───────── 分類資料整理 ───────── */
  function buildGroups(itemId, ctx, recipes) {
    const e = DATA.items[itemId] || {};
    const groups = {};
    TAGS.forEach(function (t) { groups[t.id] = []; });
    let hidden = 0;

    // 兌換
    (e.trades || []).forEach(function (t, idx) {
      if (t.status === 'dead') { hidden += 1; return; }
      if (t.costs.some(function (c) { return c.id === null; })) return;
      const costs = t.costs.map(function (c) { return [c.id, c.amount]; });
      const html = '<div class="ob-card">' +
        '<div class="ob-trade">' +
          '<div class="ob-cost">' + t.costs.map(function (c) { return itemChip(c.id, c.amount); }).join('<span class="ob-plus">+</span>') + '</div>' +
          '<span class="ob-arrow"><i class="ph ph-arrow-right"></i></span>' +
          '<div class="ob-get"><b>×' + t.amount + '</b></div>' +
        '</div>' +
        (ctx ? bridge.verdict(ctx, costs, t.amount, itemId) : '') +
        unlockNote(t.unlock) +
        (t.festivalIds ? '<div class="ob-note"><i class="ph ph-confetti"></i> 限期活動期間才有的兌換</div>' : '') +
        npcList(t.npcIds || []) +
        '</div>';
      (t.status === 'seasonal' ? groups.seasonal : groups.trade).push({ html: html, sort: t.verified ? 0 : 1 });
    });

    // 金幣商店：同價格合併，列出所有賣家
    const byPrice = {}; const seasonal = {};
    (e.vendors || []).forEach(function (v) {
      const bucket = v.status === 'seasonal' ? seasonal : byPrice;
      (bucket[v.price] = bucket[v.price] || []).push(v.npcId);
    });
    [[byPrice, 'vendor'], [seasonal, 'seasonal']].forEach(function (pair) {
      Object.keys(pair[0]).map(Number).sort(function (a, b) { return a - b; }).forEach(function (price) {
        const html = '<div class="ob-card"><div class="ob-trade"><div class="ob-cost"><span class="ob-gil"><i class="ph ph-coins"></i> ' + price.toLocaleString('zh-TW') + ' 金幣</span></div></div>' +
          (ctx ? bridge.verdict(ctx, [[1, price]], 1, itemId) : '') + npcList(pair[0][price]) + '</div>';
        groups[pair[1]].push({ html: html, sort: 0 });
      });
    });

    // 製作
    const dead = new Set((DATA.craftDead || []).map(String));
    (recipes || []).forEach(function (r) {
      if (dead.has(String(r.rid))) { hidden += 1; return; }
      const rc = r.recipe;
      const books = flat(e.masterbooks || []).filter(Boolean);
      const html = '<div class="ob-card"><div class="ob-craft-head"><b>' + esc(JOBS[rc.jobId] || '製作') + '</b> Lv.' + rc.lvl +
        (rc.stars ? ' ' + '★'.repeat(rc.stars) : '') + (rc.yields > 1 ? ' ・一次產出 ×' + rc.yields : '') +
        '<button type="button" class="ob-link" data-ob-craft="' + esc(r.rid) + '"><i class="ph ph-flask"></i> 製作求解</button></div>' +
        '<div class="ob-cost">' + rc.ingredients.map(function (i) { return itemChip(i.itemId, i.amount); }).join('') + '</div>' +
        (books.length ? '<div class="ob-note"><i class="ph ph-book-bookmark"></i> 需要祕籍：' + books.map(function (b) { return itemChip(b); }).join('') + '</div>' : '') + '</div>';
      groups.craft.push({ html: html, sort: 0 });
    });

    // 採集（含限時、園藝）
    const zones = {};
    (e.gathering || []).forEach(function (g) {
      (g.nodes || []).forEach(function (n) {
        const z = (zones[n.zoneId] = zones[n.zoneId] || { zoneId: n.zoneId, nodes: [], timed: [] });
        z.nodes.push({ n: n, g: g });
      });
    });
    (e.alarms || []).forEach(function (a) {
      const z = (zones[a.zoneId] = zones[a.zoneId] || { zoneId: a.zoneId, nodes: [], timed: [] });
      z.timed.push(a);
    });
    Object.keys(zones).forEach(function (zid) {
      const z = zones[zid];
      const locs = z.nodes.map(function (x) { return { mapId: x.n.map, zoneId: x.n.zoneId, x: x.n.x, y: x.n.y, label: 'Lv.' + x.n.level + (E().gatheringTypes[x.n.type] ? ' ' + E().gatheringTypes[x.n.type] : '') }; })
        .concat(z.timed.filter(function (a) { return a.coords; }).map(function (a) { return { mapId: a.mapId, zoneId: a.zoneId, x: a.coords.x, y: a.coords.y, label: '限時節點' }; }));
      const lv = z.nodes.map(function (x) { return x.n.level; });
      const flags = {};
      z.nodes.forEach(function (x) { if (x.n.limited) flags['限時'] = 1; if (x.n.hidden) flags['隱藏'] = 1; if (x.n.legendary) flags['傳說'] = 1; });
      const html = '<div class="ob-card ob-clickable" data-ob-locs=\'' + esc(JSON.stringify(locs)) + '\' data-ob-title="' + esc(itemName(itemId) + '・採集點') + '">' +
        '<div class="ob-line"><b><i class="ph ph-map-pin"></i> ' + esc(placeName(z.zoneId) || '未知地點') + '</b>' +
        '<span class="ob-dim">' + (z.nodes.length ? z.nodes.length + ' 個節點' : '') + (lv.length ? '・Lv.' + Math.min.apply(null, lv) + (Math.max.apply(null, lv) !== Math.min.apply(null, lv) ? '–' + Math.max.apply(null, lv) : '') : '') + '</span>' +
        Object.keys(flags).map(function (f) { return '<span class="ob-badge">' + f + '</span>'; }).join('') + '</div>' +
        (z.timed.length ? '<div class="ob-note"><i class="ph ph-clock"></i> 限時節點（艾歐澤亞時間）：' + z.timed.map(function (a) { return (a.spawns || []).map(function (h) { return h + ':00'; }).join('、') + ' 出現，持續 ' + a.duration + ' 小時'; }).filter(function (t, i, arr) { return arr.indexOf(t) === i; }).join('；') + '</div>' : '') +
        '<span class="ob-hint">點擊查看地圖</span></div>';
      groups.gather.push({ html: html, sort: 0 });
    });
    (e.gardening || []).forEach(function (g) {
      groups.gather.push({ html: '<div class="ob-card"><div class="ob-line"><b><i class="ph ph-plant"></i> 園藝</b><span class="ob-dim">種子</span></div><div class="ob-cost">' + itemChip(g.seed) + '</div></div>', sort: 2 });
    });

    // 掉落（怪物）、危命任務
    const mobs = {};
    (e.drops || []).forEach(function (d) { (mobs[d.mob] = mobs[d.mob] || []).push(d); });
    Object.keys(mobs).forEach(function (m) {
      const list = mobs[m];
      const locs = list.filter(function (d) { return d.x != null; }).map(function (d) { return { mapId: d.mapId, zoneId: d.zoneId, x: d.x, y: d.y, label: (E().mobs[m] || {}).name }; });
      const name = (E().mobs[m] || {}).name || '#' + m;
      const where = list.map(function (d) { return placeName(d.zoneId); }).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
      groups.drop.push({ html: '<div class="ob-card' + (locs.length ? ' ob-clickable' : '') + '"' + (locs.length ? ' data-ob-locs=\'' + esc(JSON.stringify(locs)) + '\' data-ob-title="' + esc(name) + '"' : '') + '>' +
        '<div class="ob-line"><b><i class="ph ph-skull"></i> ' + esc(name) + '</b><span class="ob-dim">' + esc(where.join('、')) + '</span></div>' + (locs.length ? '<span class="ob-hint">點擊查看地圖</span>' : '') + '</div>', sort: 0 });
    });
    (e.fates || []).forEach(function (f) {
      const en = E().fates[f.id] || {};
      const locs = f.x != null ? [{ mapId: f.mapId, zoneId: f.zoneId, x: f.x, y: f.y, label: en.name }] : [];
      groups.drop.push({ html: '<div class="ob-card' + (locs.length ? ' ob-clickable' : '') + '"' + (locs.length ? ' data-ob-locs=\'' + esc(JSON.stringify(locs)) + '\' data-ob-title="' + esc(en.name || '危命任務') + '"' : '') + '>' +
        '<div class="ob-line"><b><i class="ph ph-flag-banner"></i> ' + esc(en.name || '#' + f.id) + '</b><span class="ob-badge">危命任務</span><span class="ob-dim">' + (en.level ? 'Lv.' + en.level + '・' : '') + esc(placeName(f.zoneId)) + '</span></div>' + (locs.length ? '<span class="ob-hint">點擊查看地圖</span>' : '') + '</div>', sort: 1 });
    });

    // 副本
    flat(e.instances || []).forEach(function (id) {
      const ins = E().instances[id]; if (!ins) return;
      const ct = E().contentTypes[ins.contentType] || '';
      groups.instance.push({ html: '<div class="ob-card"><div class="ob-line"><b><i class="ph ph-castle-turret"></i> ' + esc(ins.name) + '</b>' + (ct ? '<span class="ob-badge' + (ct === '尋寶' ? ' ob-badge-hot' : '') + '">' + esc(ct) + '</span>' : '') +
        '<span class="ob-dim">' + (ins.level ? 'Lv.' + ins.level : '') + (ins.ilvl ? '・iLv.' + ins.ilvl : '') + '</span></div></div>', sort: 0 });
    });

    // 開箱獲得／藏寶圖
    const maps = new Set(E().treasureMaps || []);
    flat(e.treasures || []).forEach(function (id) {
      const isMap = maps.has(id);
      groups[isMap ? 'map' : 'box'].push({ html: '<div class="ob-card"><div class="ob-line">' + itemChip(id) + '<span class="ob-dim">' + (isMap ? '解讀並挖掘藏寶圖可獲得' : '打開這個物品可獲得') + '</span></div></div>', sort: 0 });
    });

    // 任務與成就
    flat(e.quests || []).forEach(function (q) { const en = E().quests[q]; if (en) groups.quest.push({ html: '<div class="ob-card"><div class="ob-line"><b><i class="ph ph-scroll"></i> ' + esc(en.name) + '</b><span class="ob-badge">任務獎勵</span></div></div>', sort: 0 }); });
    flat(e.achievements || []).forEach(function (a) { const en = E().achievements[a]; if (en) groups.quest.push({ html: '<div class="ob-card"><div class="ob-line"><b><i class="ph ph-trophy"></i> ' + esc(en.name) + '</b><span class="ob-badge">成就獎勵</span></div></div>', sort: 1 }); });

    // 探索：潛水艇／飛空艇、探險、無人島
    (e.voyages || []).forEach(function (k) {
      const v = E().voyages[k]; if (!v) return;
      groups.explore.push({ html: '<div class="ob-card"><div class="ob-line"><b><i class="ph ph-' + (v.kind === 'airship' ? 'airplane-tilt' : 'sailboat') + '"></i> ' + esc(v.name) + '</b><span class="ob-badge">' + (v.kind === 'airship' ? '飛空艇探索' : '潛水艇探索') + '</span></div></div>', sort: 0 });
    });
    (e.ventures || []).forEach(function (v) {
      const en = E().ventures[v.id] || {};
      groups.explore.push({ html: '<div class="ob-card"><div class="ob-line"><b><i class="ph ph-compass"></i> ' + esc(en.name || '探險') + '</b><span class="ob-badge">雇員探險</span><span class="ob-dim">' + (v.lvl ? 'Lv.' + v.lvl : '') + '</span></div></div>', sort: 1 });
    });
    if ((e.islandPasture || []).length || (e.islandCrop || []).length) {
      groups.explore.push({ html: '<div class="ob-card"><div class="ob-line"><b><i class="ph ph-island"></i> 無人島</b><span class="ob-dim">' + ((e.islandPasture || []).length ? '牧場' : '') + ((e.islandPasture || []).length && (e.islandCrop || []).length ? '、' : '') + ((e.islandCrop || []).length ? '農地' : '') + '</span></div></div>', sort: 2 });
    }

    // 分解／精選
    ['desynth', 'reduction'].forEach(function (k) {
      flat(e[k] || []).forEach(function (id) {
        groups.desynth.push({ html: '<div class="ob-card"><div class="ob-line">' + itemChip(id) + '<span class="ob-dim">' + (k === 'desynth' ? '分解可獲得' : '精選可獲得') + '</span></div></div>', sort: k === 'desynth' ? 0 : 1 });
      });
    });

    // 商城
    if ((e.mogstation || []).length) groups.mog.push({ html: '<div class="ob-card"><div class="ob-line"><b><i class="ph ph-shopping-bag"></i> 商城販售</b></div></div>', sort: 0 });

    TAGS.forEach(function (t) { groups[t.id].sort(function (a, b) { return a.sort - b.sort; }); });
    return { groups: groups, hidden: hidden };
  }

  /* ───────── 彈窗 ───────── */
  function ensureModal() {
    let m = $('ob-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'ob-modal';
    m.className = 'market-modal-backdrop';
    m.style.display = 'none';
    m.innerHTML = '<div class="market-modal-box ob-box" role="dialog" aria-modal="true" aria-label="取得方式">' +
      '<div class="ob-head"><div class="ob-title" id="ob-title"></div><button type="button" class="market-modal-scene-close" id="ob-close" aria-label="關閉">✕</button></div>' +
      '<div class="ob-tabs" id="ob-tabs" role="tablist"></div>' +
      '<div class="ob-body" id="ob-body"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
    $('ob-close').addEventListener('click', closeModal);
    m.addEventListener('click', onBodyClick);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('ob-map') && $('ob-map').style.display !== 'none') { closeMap(); return; }
      if (m.style.display !== 'none') closeModal();
    });
    return m;
  }
  function closeModal() { const m = $('ob-modal'); if (m) m.style.display = 'none'; closeMap(); }

  let state = null;
  function renderEntries(entries, key) {
    const expanded = state.expanded[key];
    const shown = (!expanded && entries.length > LIMIT_THRESHOLD) ? entries.slice(0, LIMIT_SHOWN) : entries;
    let html = shown.map(function (x) { return x.html; }).join('');
    if (shown.length < entries.length) html += '<button type="button" class="ob-more" data-ob-more="' + esc(key) + '">顯示更多（還有 ' + (entries.length - shown.length) + ' 筆）</button>';
    return html;
  }
  function renderBody() {
    const body = $('ob-body');
    const tag = state.tag;
    const tags = tag === 'all' ? TAGS.filter(function (t) { return state.groups[t.id].length; }) : TAGS.filter(function (t) { return t.id === tag; });
    if (!tags.length) {
      body.innerHTML = '<div class="ob-empty">目前沒有可用的取得方式' + (state.hidden ? '<small>（相關的兌換或製作因貨幣、素材已過期，遊戲內已無法使用）</small>' : '<small>這個物品可能只能從玩家交易或市場取得</small>') + '</div>';
      return;
    }
    body.innerHTML = tags.map(function (t) {
      const g = state.groups[t.id];
      return '<section class="ob-section">' + (tag === 'all' ? '<h4 class="ob-sec-title">' + t.label + ' <span>' + g.length + '</span></h4>' : '') + renderEntries(g, t.id) + '</section>';
    }).join('');
  }
  function renderTabs() {
    const total = TAGS.reduce(function (n, t) { return n + state.groups[t.id].length; }, 0);
    const html = ['<button type="button" class="ob-tab' + (state.tag === 'all' ? ' on' : '') + '" data-ob-tab="all" role="tab">全部 <span>' + total + '</span></button>'];
    TAGS.forEach(function (t) {
      const n = state.groups[t.id].length; if (!n) return;
      html.push('<button type="button" class="ob-tab' + (state.tag === t.id ? ' on' : '') + '" data-ob-tab="' + t.id + '" role="tab">' + t.label + ' <span>' + n + '</span></button>');
    });
    $('ob-tabs').innerHTML = html.join('');
  }

  function onBodyClick(e) {
    const t = e.target;
    const tab = t.closest('[data-ob-tab]');
    if (tab) { state.tag = tab.dataset.obTab; renderTabs(); renderBody(); $('ob-body').scrollTop = 0; return; }
    const more = t.closest('[data-ob-more]');
    if (more) { state.expanded[more.dataset.obMore] = true; renderBody(); return; }
    const item = t.closest('[data-ob-item]');
    if (item) { const id = Number(item.dataset.obItem); closeModal(); bridge.gotoItem(id); return; }
    const craft = t.closest('[data-ob-craft]');
    if (craft) { bridge.gotoCraft(craft.dataset.obCraft); return; }
    const npc = t.closest('[data-ob-npc]');
    if (npc) { openNpcMap([npc.dataset.obNpc]); return; }
    const npcs = t.closest('[data-ob-npcs]');
    if (npcs) { openNpcMap(npcs.dataset.obNpcs.split(',')); return; }
    const locs = t.closest('[data-ob-locs]');
    if (locs) { try { openMap(JSON.parse(locs.dataset.obLocs), locs.dataset.obTitle || ''); } catch (err) { /* 資料異常就不開 */ } }
  }

  function open(itemId) {
    if (!bridge) { console.error('ObtainUI：尚未設定 bridge'); return; }
    const m = ensureModal();
    $('ob-title').innerHTML = bridge.icon(itemId, 28) + '<span>' + esc(itemName(itemId)) + '</span><small>取得方式</small>';
    $('ob-tabs').innerHTML = '';
    $('ob-body').innerHTML = '<div class="ob-empty">載入中…</div>';
    m.style.display = 'flex';
    Promise.all([
      loadData(),
      Promise.resolve(bridge.priceCtx(itemId)).catch(function () { return null; }),
      Promise.resolve(bridge.recipes(itemId)).catch(function () { return []; }),
    ]).then(function (res) {
      const built = buildGroups(itemId, res[1], res[2]);
      state = { itemId: itemId, tag: 'all', groups: built.groups, hidden: built.hidden, expanded: {} };
      renderTabs(); renderBody();
    }).catch(function (err) {
      $('ob-body').innerHTML = '<div class="ob-empty">取得方式資料載入失敗<small>' + esc(err && err.message || err) + '</small></div>';
    });
  }

  /* ───────── 地圖 ───────── */
  function ensureMap() {
    let m = $('ob-map');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'ob-map';
    m.className = 'market-modal-backdrop ob-map-backdrop';
    m.style.display = 'none';
    m.innerHTML = '<div class="ob-map-box" role="dialog" aria-modal="true" aria-label="地圖">' +
      '<div class="ob-head"><div class="ob-title" id="ob-map-title"></div><button type="button" class="market-modal-scene-close" id="ob-map-close" aria-label="關閉地圖">✕</button></div>' +
      '<div class="ob-tabs" id="ob-map-tabs"></div>' +
      '<div class="ob-viewport" id="ob-viewport"><div class="ob-layer" id="ob-layer"></div><div class="ob-noimg-msg" id="ob-noimg-msg" style="display:none">地圖圖片暫時無法載入，仍可依下方座標在遊戲內尋找</div>' +
        '<div class="ob-zoom"><button type="button" data-ob-z="+" aria-label="放大">＋</button><button type="button" data-ob-z="-" aria-label="縮小">－</button><button type="button" data-ob-z="0" aria-label="重設">⟲</button></div></div>' +
      '<div class="ob-loclist" id="ob-loclist"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) closeMap(); });
    $('ob-map-close').addEventListener('click', closeMap);
    bindMapInteractions();
    return m;
  }
  function closeMap() { const m = $('ob-map'); if (m) m.style.display = 'none'; }

  let mapState = null;
  function openNpcMap(npcIds) {
    const locs = [];
    npcIds.forEach(function (id) { const n = E().npcs[id]; if (!n) return; npcLocations(n).forEach(function (l) { locs.push({ mapId: l.mapId, zoneId: l.zoneId, x: l.x, y: l.y, label: n.name + (n.title ? '（' + n.title + '）' : '') }); }); });
    if (locs.length) openMap(locs, npcIds.length === 1 ? (E().npcs[npcIds[0]] || {}).name : '賣家位置');
  }
  function openMap(locs, title) {
    ensureMap();
    const byMap = {};
    locs.forEach(function (l) { if (l.mapId != null) (byMap[l.mapId] = byMap[l.mapId] || []).push(l); });
    const mapIds = Object.keys(byMap);
    if (!mapIds.length) return;
    mapState = { title: title, byMap: byMap, mapIds: mapIds, current: mapIds[0], z: 1, tx: 0, ty: 0, focus: -1 };
    $('ob-map').style.display = 'flex';
    renderMap();
  }
  function markerPct(v, sf) { return ((v - 1) * 50 * (sf / 100)) / 20.48; }
  function renderMap() {
    const s = mapState; const mp = E().maps[s.current] || {};
    const locs = s.byMap[s.current];
    $('ob-map-title').innerHTML = '<i class="ph ph-map-trifold"></i><span>' + esc(s.title) + '</span>';
    $('ob-map-tabs').innerHTML = s.mapIds.length > 1 ? s.mapIds.map(function (id) {
      const z = (s.byMap[id][0] || {}).zoneId;
      return '<button type="button" class="ob-tab' + (id === s.current ? ' on' : '') + '" data-ob-maptab="' + id + '">' + esc(placeName(z) || '地圖 ' + id) + ' <span>' + s.byMap[id].length + '</span></button>';
    }).join('') : '';
    const sf = mp.sizeFactor || 100;
    $('ob-layer').innerHTML = (mp.image ? '<img class="ob-mapimg" alt="" draggable="false" src="' + esc(mp.image) + '" onerror="this.classList.add(\'ob-noimg\');document.getElementById(\'ob-noimg-msg\').style.display=\'block\'">' : '') +
      locs.map(function (l, i) {
        return '<button type="button" class="ob-pin' + (i === s.focus ? ' focus' : '') + '" data-ob-pin="' + i + '" style="left:' + markerPct(l.x, sf) + '%;top:' + markerPct(l.y, sf) + '%" title="' + esc((l.label || '') + ' (' + fmt1(l.x) + ', ' + fmt1(l.y) + ')') + '"><span class="ob-pin-dot"></span></button>';
      }).join('');
    $('ob-loclist').innerHTML = locs.map(function (l, i) {
      return '<button type="button" class="ob-locrow' + (i === s.focus ? ' on' : '') + '" data-ob-loc="' + i + '"><span>' + esc(l.label || placeName(l.zoneId)) + '</span><b>(' + fmt1(l.x) + ', ' + fmt1(l.y) + ')</b></button>';
    }).join('');
    $('ob-noimg-msg').style.display = 'none';
    applyTransform();
  }
  function applyTransform() {
    const s = mapState; const layer = $('ob-layer'); if (!layer) return;
    layer.style.setProperty('--z', s.z);
    layer.style.transform = 'translate(' + s.tx + 'px,' + s.ty + 'px) scale(' + s.z + ')';
  }
  function zoomTo(z) { mapState.z = Math.max(1, Math.min(5, z)); if (mapState.z === 1) { mapState.tx = 0; mapState.ty = 0; } applyTransform(); }
  function focusPin(i) {
    const s = mapState; const vp = $('ob-viewport'); const l = s.byMap[s.current][i]; const mp = E().maps[s.current] || {}; const sf = mp.sizeFactor || 100;
    s.focus = i; s.z = Math.max(s.z, 2.5);
    const w = vp.clientWidth; const h = vp.clientHeight; const side = Math.min(w, h);
    s.tx = w / 2 - (w - side) / 2 - (markerPct(l.x, sf) / 100) * side * s.z - (w - side) / 2 + (w - side) / 2;
    s.ty = h / 2 - (markerPct(l.y, sf) / 100) * side * s.z;
    renderMap();
  }
  function bindMapInteractions() {
    const m = $('ob-map');
    m.addEventListener('click', function (e) {
      const z = e.target.closest('[data-ob-z]');
      if (z) { const v = z.dataset.obZ; zoomTo(v === '+' ? mapState.z * 1.5 : v === '-' ? mapState.z / 1.5 : 1); return; }
      const tab = e.target.closest('[data-ob-maptab]'); if (tab) { mapState.current = tab.dataset.obMaptab; mapState.z = 1; mapState.tx = mapState.ty = 0; mapState.focus = -1; renderMap(); return; }
      const row = e.target.closest('[data-ob-loc]'); if (row) { focusPin(Number(row.dataset.obLoc)); return; }
      const pin = e.target.closest('[data-ob-pin]'); if (pin) { focusPin(Number(pin.dataset.obPin)); }
    });
    const vp = $('ob-viewport');
    vp.addEventListener('wheel', function (e) { e.preventDefault(); zoomTo(mapState.z * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); }, { passive: false });
    let drag = null;
    vp.addEventListener('pointerdown', function (e) { if (e.target.closest('.ob-zoom,.ob-pin')) return; drag = { x: e.clientX, y: e.clientY, tx: mapState.tx, ty: mapState.ty }; vp.setPointerCapture(e.pointerId); vp.classList.add('drag'); });
    vp.addEventListener('pointermove', function (e) { if (!drag || mapState.z === 1) return; mapState.tx = drag.tx + (e.clientX - drag.x); mapState.ty = drag.ty + (e.clientY - drag.y); applyTransform(); });
    const end = function () { drag = null; vp.classList.remove('drag'); };
    vp.addEventListener('pointerup', end); vp.addEventListener('pointercancel', end);
  }

  window.ObtainUI = {
    setBridge: function (b) { bridge = b; },
    open: open,
    close: closeModal,
    loadData: loadData,
    _debug: { buildGroups: function (id) { return loadData().then(function () { return buildGroups(id, null, []); }); } },
  };
})();
