/**
 * air-panel.js
 *
 * 飛空艇路線計算 UI，架構與互動邏輯完全比照 sub-panel.js 裡的 app.buildSub()。
 * 沿用同一套 CSS class（sub-xxx），所以不需要另外改 CSS。
 *
 * 與潛水艇版本的差異：
 *  - 沒有「航海圖」篩選（雲海只有一張圖、一個起點），拿掉相關 UI。
 *  - 部件欄位是 船體／纜索／艏樓／艉樓（不是 船體／船尾／船首／艦橋）。
 *  - 等級上限 50（不是 125），且沒有隨等級的數值加成。
 *  - 物品名稱查表用 AIR_ITEM_DB（不是外部 ITEM_DB）。
 */
app.buildAir = function () {
  const root = document.getElementById('air-root'); if (!root) return;
  const FILTER_KEY = 'xiv-air-route-filters';
  let savedFilter = null;
  try { savedFilter = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null'); } catch (e) {}
  let selH = null, selR = null, selF = null, selA = null, airRank = savedFilter?.rank || 1, letterOnly = !!savedFilter?.letterOnly;
  let mustInc = savedFilter?.mustInc ? savedFilter.mustInc.slice() : [], mustExcl = savedFilter?.mustExcl ? savedFilter.mustExcl.slice() : [], mustLootIds = savedFilter?.mustLootIds ? savedFilter.mustLootIds.slice() : [];
  let useTime = false, desiredMins = 0;
  let sortKey = 'epm', sortDir = -1, currentRoutes = [], lootToggleSeq = 0;
  const SORT_PROP = { exp: 'exp', time: 'timeMins', epm: 'epm' };
  const SORT_LABEL = { exp: '經驗值', time: '時間', epm: 'EXP/分' };
  const getStats = () => selH && selR && selF && selA ? airCalcStats(selH, selR, selF, selA) : null;
  const getName = id => AIR_ITEM_DB[String(id)] || `ID:${id}`;
  const CAT_ORDER = { blueprint: 0, rare: 1, general: 2, materia: 3 };
  const PICKER_CAT_ORDER = { blueprint: 0, rare3: 1, rare2: 2, general: 3, materia: 4 };
  const PICKER_CAT_LABEL = { blueprint: '設計圖材料', rare3: '更稀有物品', rare2: '稀有物品', general: '一般材料', materia: '魔晶石' };

  /* 等級角標彈窗：列出全部等級升級所需經驗值，架構與 sub-panel.js 的
     buildLevelTableTip 完全比照，只是改用 AIR_RANKS／airRank。 */
  const buildLevelTableTip = () => {
    const ranks = Object.keys(AIR_RANKS).map(Number).sort((a, b) => a - b);
    const rows = ranks.map(r => {
      const exp = (AIR_RANKS[r] || [])[0];
      const cls = r === airRank ? ' exp-cur' : '';
      const expStr = exp ? exp.toLocaleString() : '已達最高等級';
      return `<div class="sub-tip-wide-row${cls}"><span>Lv.${r}</span><span>${expStr}</span></div>`;
    }).join('');
    return `<div class="sub-tip-wide-hdr"><span>等級</span><span>下一級所需經驗值</span></div><div class="sub-tip-wide-body">${rows}</div>`;
  };

  /* 點擊式資訊彈窗：與潛水艇版本共用同一套（window._subTipInit 旗標判斷用的
     data-tip / loot-toggle class 名稱一致，只需初始化一次，兩個分頁共用）。 */
  if (!window._subTipInit) {
    window._subTipInit = true;
    let tipBox = null, tipTrigger = null;
    const closeTip = () => { if (tipBox) { tipBox.remove(); tipBox = null; tipTrigger = null; } };
    const openTip = (trigger) => {
      closeTip();
      const box = document.createElement('div'); box.className = 'sub-tip-box' + (trigger.hasAttribute('data-tip-wide') ? ' sub-tip-wide' : '');
      box.innerHTML = trigger.getAttribute('data-tip').replace(/\n/g, '<br>');
      document.body.appendChild(box);
      const scrollHost = box.querySelector('.sub-tip-wide-body');
      if (scrollHost) {
        /* 視窗較小/較窄時，彈窗整體高度依可視空間動態縮小，確保無論如何
           都完整落在畫面內，不會有一段被截到看不見、也捲不到的內容。 */
        const hdr = box.querySelector('.sub-tip-wide-hdr');
        const hdrH = hdr ? hdr.offsetHeight : 0;
        const avail = window.innerHeight - 16 - hdrH;
        scrollHost.style.maxHeight = Math.max(120, Math.min(320, avail)) + 'px';
      }
      const curRow = box.querySelector('.exp-cur');
      if (scrollHost && curRow) scrollHost.scrollTop = curRow.offsetTop - scrollHost.clientHeight / 2 + curRow.clientHeight / 2;
      const r = trigger.getBoundingClientRect();
      let left = r.left, top = r.bottom + 6;
      const bw = box.offsetWidth, bh = box.offsetHeight;
      if (left + bw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - bw - 8);
      if (top + bh > window.innerHeight - 8) top = r.top - bh - 6;
      if (top < 8) top = 8;
      box.style.left = left + 'px'; box.style.top = top + 'px';
      tipBox = box; tipTrigger = trigger;
    };
    document.addEventListener('click', e => {
      const toggleBtn = e.target.closest('.loot-toggle');
      if (toggleBtn) {
        e.stopPropagation(); closeTip();
        const target = document.getElementById(toggleBtn.dataset.target); if (!target) return;
        const isHidden = target.style.display === 'none';
        target.style.display = isHidden ? 'inline' : 'none';
        toggleBtn.textContent = isHidden ? '　收合' : `　⋯等${toggleBtn.dataset.total}種`;
        return;
      }
      const trigger = e.target.closest('[data-tip]');
      if (trigger) { e.stopPropagation(); if (tipTrigger === trigger) closeTip(); else openTip(trigger); }
      else if (!e.target.closest('.sub-tip-box')) closeTip();
    });
    window.addEventListener('scroll', closeTip, { passive: true });
    window.addEventListener('resize', closeTip);
  }

  root.innerHTML = `<div class="sub-mogship">
<div class="sub-mode-toggle">
  <button type="button" class="sub-mode-btn active" data-mode="route">路線搜尋</button>
  <button type="button" class="sub-mode-btn" data-mode="reverse">配裝反查</button>
</div>
<div id="air-route-panel">
<div class="sub-top-row"><div class="sub-field-grp"><label class="sub-lbl" for="air-rank-inp">等級</label><input type="number" id="air-rank-inp" class="sub-inp" value="1" min="1" max="50"><span class="sub-exp-next" id="air-exp-next"></span><span class="sub-exp-badge" id="air-exp-badge" data-tip-wide="1" data-tip="" title="查看全部等級經驗需求">i</span></div><button id="air-search-btn" class="sub-search-btn" style="margin-left:auto">搜　尋</button><button id="air-clear-btn" class="sub-clear-btn">清除篩選</button><button id="air-view-toggle" class="sub-view-btn" type="button">切換為精簡模式</button><button id="air-map-btn" class="sub-view-btn" type="button">探索地圖</button></div>
<div class="sub-parts-row">
  <div class="sub-part-col"><label class="sub-lbl" for="air-hull">船體</label><select id="air-hull" class="sub-sel"></select></div>
  <div class="sub-part-col"><label class="sub-lbl" for="air-rigging">舾裝</label><select id="air-rigging" class="sub-sel"></select></div>
  <div class="sub-part-col"><label class="sub-lbl" for="air-forecastle">船首</label><select id="air-forecastle" class="sub-sel"></select></div>
  <div class="sub-part-col"><label class="sub-lbl" for="air-aftcastle">船尾</label><select id="air-aftcastle" class="sub-sel"></select></div>
</div>
<div class="sub-stats-bar">
  <div class="sub-stat-box"><div class="sub-stat-lbl">探索性能</div><div class="sub-stat-val sv-neu" id="as-sur">—</div></div>
  <div class="sub-stat-box"><div class="sub-stat-lbl">收集性能</div><div class="sub-stat-val sv-neu" id="as-ret">—</div></div>
  <div class="sub-stat-box"><div class="sub-stat-lbl">巡航速度</div><div class="sub-stat-val sv-neu" id="as-spd">—</div></div>
  <div class="sub-stat-box"><div class="sub-stat-lbl">航行距離</div><div class="sub-stat-val sv-neu" id="as-rng">—</div></div>
  <div class="sub-stat-box"><div class="sub-stat-lbl">恩惠</div><div class="sub-stat-val sv-neu" id="as-fav">—</div></div>
  <div class="sub-stat-box"><div class="sub-stat-lbl">承載力</div><div class="sub-stat-val sv-neu" id="as-cap">—</div></div>
</div>
<div class="sub-filters-section">
  <button id="air-filters-hdr" class="sub-filters-hdr" type="button">&#x25b8; 篩選條件</button>
  <div id="air-filters-panel" class="sub-filters-panel">
<div class="sub-opts-row">
  <label class="sub-chk-lbl"><input type="radio" name="air-time-mode" id="air-time-mode-dur" checked> 剩餘時長</label>
  <label class="sub-chk-lbl"><input type="radio" name="air-time-mode" id="air-time-mode-target"> 指定收成時間</label>
  <label class="sub-chk-lbl"><input type="checkbox" id="air-letter"> 只顯示目的地編號</label>
</div>
<div class="sub-opts-row" id="air-dur-row">
  <label class="sub-lbl" for="air-days">天</label><input type="number" id="air-days" class="sub-inp" value="0" min="0">
  <label class="sub-lbl" for="air-hrs">小時</label><input type="number" id="air-hrs" class="sub-inp" value="0" min="0" max="23">
  <label class="sub-lbl" for="air-mins">分鐘</label><input type="number" id="air-mins" class="sub-inp" value="0" min="0" max="59">
  <label class="sub-chk-lbl"><input type="checkbox" id="air-use-time"> 使用指定時間</label>
</div>
<div class="sub-opts-row" id="air-target-row" style="display:none">
  <label class="sub-lbl" for="air-target-date">日期</label>
  <input type="date" id="air-target-date" class="sub-inp sub-date-inp">
  <label class="sub-lbl sub-time-lbl" for="air-target-hour">時間</label>
  <input type="number" id="air-target-hour" class="sub-inp" value="20" min="0" max="23">
  <span class="sub-time-colon">:</span>
  <input type="number" id="air-target-min" class="sub-inp" value="0" min="0" max="59">
  <button type="button" id="air-ampm-btn" class="sub-ampm-btn" style="display:none">上午</button>
  <button type="button" id="air-hourmode-btn" class="sub-hourmode-btn" title="切換12/24小時制">24小時制</button>
  <span class="sub-picker-wrap">
    <button type="button" id="air-target-picker-btn" class="sub-picker-btn" style="display:none" aria-label="開啟日期時間選擇器" title="開啟日曆選擇器">📅</button>
    <input type="datetime-local" id="air-target-native" class="sub-native-dt" tabindex="-1" aria-hidden="true">
  </span>
  <span class="sub-target-hint" id="air-target-hint"></span>
</div>
<div class="sub-filter-row">
  <div class="sub-filter-col"><label class="sub-lbl">必須包含目的地</label><div class="sub-multisel-wrap" id="air-inc-wrap"></div></div>
  <div class="sub-filter-col"><label class="sub-lbl">排除目的地</label><div class="sub-multisel-wrap" id="air-excl-wrap"></div></div>
</div>
<div class="sub-filter-col"><label class="sub-lbl">必須獲得物品</label><div class="sub-multisel-wrap" id="air-loot-wrap"></div><label class="sub-chk-lbl sub-loot-strict-lbl"><input type="checkbox" id="air-loot-strict"> 每個目的地都至少有其中一項物品</label></div>
<div id="air-range-disp" class="sub-range-disp">目前航行距離：—</div>
  </div>
</div>
<div id="air-results"><div class="sub-empty">選擇部件並按搜尋查看最佳路線</div></div>
</div>
<div id="air-reverse-panel" style="display:none"></div>
</div>`;

  /* 部件代號比照潛水艇的命名方式，定義已搬到 air-data.js 的 AIR_RANK_CODE
     （反查配裝功能也需要用到，搬成共用資料，避免兩處各自維護一份）。 */
  ['hull', 'rigging', 'forecastle', 'aftcastle'].forEach(slot => {
    const sel = root.querySelector(`#air-${slot}`);
    AIR_PARTS[slot].forEach(p => { const o = document.createElement('option'); o.value = p[0]; o.textContent = `${AIR_RANK_CODE[p[1]] || p[1]} — ${p[2]}`; sel.appendChild(o); });
  });

  /* 記憶功能：還原上次的等級／部件選擇（勾選類的目的地/物品清單在
     mustInc/mustExcl/mustLootIds 宣告時就已經還原，這裡補完剩下的欄位）。 */
  if (savedFilter) {
    const rankInp = root.querySelector('#air-rank-inp'); if (rankInp && savedFilter.rank) rankInp.value = savedFilter.rank;
    ['hull', 'rigging', 'forecastle', 'aftcastle'].forEach(slot => {
      const sel = root.querySelector(`#air-${slot}`);
      if (sel && savedFilter[slot] != null && sel.querySelector(`option[value="${savedFilter[slot]}"]`)) sel.value = savedFilter[slot];
    });
    const strictChk = root.querySelector('#air-loot-strict'); if (strictChk) strictChk.checked = !!savedFilter.lootStrict;
    const letterChk = root.querySelector('#air-letter'); if (letterChk) letterChk.checked = !!savedFilter.letterOnly;
  }

  const mkStepper = (input, opts) => {
    if (!input) return; opts = opts || {};
    const step = opts.step || 1, min = opts.min, max = opts.max, wrapAround = !!opts.wrap;
    input.classList.add('sub-stepper-inp'); if (opts.wide) input.classList.add('sub-stepper-inp-wide');
    const wrapEl = document.createElement('div'); wrapEl.className = 'sub-stepper';
    input.parentNode.insertBefore(wrapEl, input);
    const dn = document.createElement('button'); dn.type = 'button'; dn.className = 'sub-step-btn sub-step-dn'; dn.textContent = '−';
    const up = document.createElement('button'); up.type = 'button'; up.className = 'sub-step-btn sub-step-up'; up.textContent = '＋';
    wrapEl.appendChild(dn); wrapEl.appendChild(input); wrapEl.appendChild(up);
    const apply = dir => {
      let v = (parseInt(input.value, 10) || 0) + dir * step;
      if (wrapAround && min != null && max != null) { const range = max - min + 1; v = min + (((v - min) % range) + range) % range; }
      else { if (min != null) v = Math.max(min, v); if (max != null) v = Math.min(max, v); }
      input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    let holdT = null, holdI = null;
    const stopHold = () => { clearTimeout(holdT); clearInterval(holdI); holdT = null; holdI = null; };
    [[dn, -1], [up, 1]].forEach(([btn, dir]) => {
      btn.addEventListener('pointerdown', e => { e.preventDefault(); apply(dir); stopHold(); holdT = setTimeout(() => { holdI = setInterval(() => apply(dir), 80); }, 450); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stopHold));
    });
  };
  mkStepper(root.querySelector('#air-rank-inp'), { step: 1, min: 1, max: 50, wide: true });
  mkStepper(root.querySelector('#air-days'), { step: 1, min: 0 });
  mkStepper(root.querySelector('#air-hrs'), { step: 1, min: 0, max: 23, wrap: true });
  mkStepper(root.querySelector('#air-mins'), { step: 1, min: 0, max: 59, wrap: true });
  mkStepper(root.querySelector('#air-target-min'), { step: 1, min: 0, max: 59, wrap: true });

  /* ── 「指定收成時間」模式：完全比照潛水艇版本的邏輯與元件 ── */
  const durRow = root.querySelector('#air-dur-row');
  const targetRow = root.querySelector('#air-target-row');
  const targetDateInp = root.querySelector('#air-target-date');
  const targetHourInp = root.querySelector('#air-target-hour');
  const targetMinInp = root.querySelector('#air-target-min');
  const targetHint = root.querySelector('#air-target-hint');
  const ampmBtn = root.querySelector('#air-ampm-btn');
  const hourModeBtn = root.querySelector('#air-hourmode-btn');
  const pickerBtn = root.querySelector('#air-target-picker-btn');
  const nativeDt = root.querySelector('#air-target-native');
  const pad2 = n => String(n).padStart(2, '0');
  const toLocalDT = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  let hourMode = '24';
  let ampmIsPM = false;
  let trueHour24 = new Date().getHours();

  const to12 = h24 => { const h = h24 % 12; return h === 0 ? 12 : h; };
  const isPMof = h24 => h24 >= 12;
  const to24 = (h12, pm) => { let h = h12 % 12; if (pm) h += 12; return h; };

  const syncHourDisplay = () => {
    if (!targetHourInp) return;
    if (hourMode === '24') { targetHourInp.value = trueHour24; }
    else { targetHourInp.value = to12(trueHour24); ampmIsPM = isPMof(trueHour24); }
    if (ampmBtn) ampmBtn.textContent = ampmIsPM ? '下午' : '上午';
  };

  const rebuildHourStepper = () => {
    if (hourMode === '24') mkStepper(targetHourInp, { step: 1, min: 0, max: 23, wrap: true });
    else mkStepper(targetHourInp, { step: 1, min: 1, max: 12, wrap: true });
  };

  if (targetDateInp) {
    const now = new Date();
    const tmr = new Date(now.getTime() + 24 * 3600 * 1000);
    targetDateInp.min = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    targetDateInp.value = `${tmr.getFullYear()}-${pad2(tmr.getMonth() + 1)}-${pad2(tmr.getDate())}`;
    trueHour24 = now.getHours();
    if (targetMinInp) targetMinInp.value = now.getMinutes();
    if (nativeDt) nativeDt.min = toLocalDT(now);
  }
  rebuildHourStepper();
  syncHourDisplay();

  /* 記憶功能：只還原「剩餘時長」設定，「指定收成時間」是絕對時間點，
     記住了下次打開也會過期，沒有意義，故意不存也不還原，永遠維持預設。 */
  if (savedFilter?.time) {
    const t = savedFilter.time;
    if (t.days != null) root.querySelector('#air-days').value = t.days;
    if (t.hrs != null) root.querySelector('#air-hrs').value = t.hrs;
    if (t.mins != null) root.querySelector('#air-mins').value = t.mins;
    const useTimeChk = root.querySelector('#air-use-time'); if (useTimeChk) useTimeChk.checked = !!t.useTime;
  }

  const composeTargetDate = () => {
    const dv = targetDateInp?.value; if (!dv) return null;
    const [y, mo, da] = dv.split('-').map(Number);
    const mm = parseInt(targetMinInp?.value, 10) || 0;
    return new Date(y, mo - 1, da, trueHour24, mm, 0, 0);
  };
  const updateTargetHint = () => {
    if (!targetHint) return;
    const target = composeTargetDate();
    if (!target) { targetHint.textContent = ''; return; }
    const diffMin = Math.round((target - new Date()) / 60000);
    if (diffMin <= 0) { targetHint.textContent = '⚠ 已經過去'; targetHint.classList.add('sub-target-hint-warn'); return; }
    targetHint.classList.remove('sub-target-hint-warn');
    const dd = Math.floor(diffMin / 1440), hh = Math.floor((diffMin % 1440) / 60), mm = diffMin % 60;
    const parts = []; if (dd) parts.push(dd + '天'); if (hh) parts.push(hh + '小時'); parts.push(mm + '分');
    targetHint.textContent = '距離現在：' + parts.join('');
  };

  const onHourInput = () => {
    const v = parseInt(targetHourInp.value, 10) || 0;
    if (hourMode === '24') trueHour24 = Math.max(0, Math.min(23, v));
    else trueHour24 = to24(Math.max(1, Math.min(12, v)), ampmIsPM);
    updateTargetHint();
  };
  targetHourInp?.addEventListener('input', onHourInput);
  [targetDateInp, targetMinInp].forEach(el => el?.addEventListener('input', updateTargetHint));
  updateTargetHint();

  ampmBtn?.addEventListener('click', () => {
    ampmIsPM = !ampmIsPM;
    const h12 = parseInt(targetHourInp.value, 10) || 12;
    trueHour24 = to24(h12, ampmIsPM);
    syncHourDisplay(); updateTargetHint();
  });

  hourModeBtn?.addEventListener('click', () => {
    hourMode = hourMode === '24' ? '12' : '24';
    hourModeBtn.textContent = hourMode === '24' ? '24小時制' : '12小時制';
    if (ampmBtn) ampmBtn.style.display = hourMode === '12' ? '' : 'none';
    rebuildHourStepper(); syncHourDisplay(); updateTargetHint();
  });

  const isFirefox = /firefox/i.test(navigator.userAgent);
  const supportsShowPicker = nativeDt && typeof nativeDt.showPicker === 'function' && !isFirefox;
  if (pickerBtn) pickerBtn.style.display = supportsShowPicker ? '' : 'none';
  if (pickerBtn && nativeDt) {
    pickerBtn.addEventListener('click', () => {
      const t = composeTargetDate(); if (t) nativeDt.value = toLocalDT(t);
      try { nativeDt.showPicker(); } catch (err) { console.warn('[XIV] showPicker 失敗：', err); }
    });
    nativeDt.addEventListener('change', () => {
      if (!nativeDt.value) return;
      const dt = new Date(nativeDt.value);
      if (targetDateInp) targetDateInp.value = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
      trueHour24 = dt.getHours();
      if (targetMinInp) targetMinInp.value = dt.getMinutes();
      syncHourDisplay(); updateTargetHint();
    });
  }

  const applyTimeMode = () => {
    const isTarget = root.querySelector('#air-time-mode-target')?.checked;
    if (durRow) durRow.style.display = isTarget ? 'none' : '';
    if (targetRow) targetRow.style.display = isTarget ? '' : 'none';
    if (isTarget) updateTargetHint();
  };
  root.querySelectorAll('input[name="air-time-mode"]').forEach(r => r.addEventListener('change', applyTimeMode));
  applyTimeMode();

  const updateStats = () => {
    airRank = parseInt(root.querySelector('#air-rank-inp')?.value) || 1;
    const expEl = root.querySelector('#air-exp-next');
    if (expEl) {
      const expToNext = (AIR_RANKS[airRank] || [])[0];
      expEl.textContent = expToNext ? `升到下一級需 ${expToNext.toLocaleString()} 經驗值` : (AIR_RANKS[airRank] ? '已達最高等級' : '');
    }
    const expBadge = root.querySelector('#air-exp-badge');
    if (expBadge) expBadge.setAttribute('data-tip', buildLevelTableTip());
    selH = AIR_PARTS.hull.find(p => p[0] == root.querySelector('#air-hull').value);
    selR = AIR_PARTS.rigging.find(p => p[0] == root.querySelector('#air-rigging').value);
    selF = AIR_PARTS.forecastle.find(p => p[0] == root.querySelector('#air-forecastle').value);
    selA = AIR_PARTS.aftcastle.find(p => p[0] == root.querySelector('#air-aftcastle').value);
    const st = getStats(); if (!st) return;
    root.querySelector('#air-range-disp').textContent = `目前航行距離：${st.rng}`;
    [['sur'], ['ret'], ['spd'], ['rng'], ['fav']].forEach(([k]) => {
      const el = root.querySelector(`#as-${k}`); if (!el) return;
      const v = st[k]; el.textContent = (v >= 0 ? '+' : '') + v;
      el.className = 'sub-stat-val ' + (v > 0 ? 'sv-pos' : v < 0 ? 'sv-neg' : 'sv-neu');
    });
    /* 容量：四個部件的「造價(components)」總和，不能超過目前等級的容量上限
       （官方機制：パーツコストの合計＝＜キャパシティ，飛空艇／潛水艇皆同）。 */
    const capEl = root.querySelector('#as-cap');
    if (capEl) {
      const curCap = [selH, selR, selF, selA].reduce((s, p) => s + (p ? p[8] : 0), 0);
      const maxCap = (AIR_RANKS[airRank] || [])[1] ?? '—';
      capEl.textContent = `${curCap}/${maxCap}`;
      capEl.className = 'sub-stat-val ' + (typeof maxCap === 'number' && curCap > maxCap ? 'sv-neg' : 'sv-neu');
    }
  };

  const mkSecFilter = (wid, arr) => {
    const wrap = root.querySelector(`#${wid}`); if (!wrap) return;
    const chips = document.createElement('div'); chips.className = 'sub-chips-display';
    const cw = document.createElement('div'); cw.className = 'sub-combo-wrap';
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'sub-combo-inp'; inp.placeholder = '輸入編號或名稱篩選目的地…';
    const dd = document.createElement('div'); dd.className = 'sub-combo-dd'; dd.style.display = 'none';
    const allOpts = AIR_SECTORS.map(s => ({ val: s[0], label: `${s[1]} — ${s[3]}` }));
    const renderDD = q => {
      dd.innerHTML = ''; q = (q || '').trim().toLowerCase();
      allOpts.forEach(o => {
        const lo = o.label.toLowerCase();
        if (q && !lo.includes(q)) return;
        const it = document.createElement('div'); it.className = 'sub-combo-item' + (arr.includes(o.val) ? ' selected' : ''); it.textContent = (arr.includes(o.val) ? '✓ ' : '') + o.label;
        it.addEventListener('mousedown', e => { e.preventDefault(); const idx = arr.indexOf(o.val); if (idx >= 0) arr.splice(idx, 1); else arr.push(o.val); inp.value = ''; rc(); renderDD(inp.value); });
        dd.appendChild(it);
      });
      if (!dd.children.length) { const em = document.createElement('div'); em.className = 'sub-combo-empty'; em.textContent = '無符合結果'; dd.appendChild(em); }
    };
    inp.addEventListener('focus', () => { renderDD(inp.value); dd.style.display = 'block'; });
    inp.addEventListener('blur', () => { setTimeout(() => { dd.style.display = 'none'; }, 160); });
    inp.addEventListener('input', () => { renderDD(inp.value); dd.style.display = 'block'; });
    cw.appendChild(inp); cw.appendChild(dd);
    const rc = () => { chips.innerHTML = ''; arr.forEach((id, i) => { const s = AIR_SECTOR_MAP.get(id); if (!s) return; const chip = document.createElement('span'); chip.className = 'sub-chip-tag'; chip.textContent = `${s[1]} ${s[3]}`; const rm = document.createElement('span'); rm.className = 'sub-chip-rm'; rm.textContent = '×'; rm.onclick = () => { arr.splice(i, 1); rc(); renderDD(inp.value); }; chip.appendChild(rm); chips.appendChild(chip); }); };
    wrap.appendChild(chips); wrap.appendChild(cw);
    rc();
  };

  const mkLootFilter = (wid, arr) => {
    const wrap = root.querySelector(`#${wid}`); if (!wrap) return;
    const chips = document.createElement('div'); chips.className = 'sub-chips-display';
    const cw = document.createElement('div'); cw.className = 'sub-combo-wrap';
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'sub-combo-inp'; inp.placeholder = '輸入物品名稱搜尋…';
    const dd = document.createElement('div'); dd.className = 'sub-combo-dd'; dd.style.display = 'none';
    const allIds = [...new Set(Object.keys(AIR_ITEM_DB).map(Number))];
    const allOpts = allIds.map(id => ({ id, name: getName(id), cat: getPickerCategory(id) })).sort((a, b) => (PICKER_CAT_ORDER[a.cat] - PICKER_CAT_ORDER[b.cat]) || a.name.localeCompare(b.name, 'zh-TW'));
    const renderDD = q => {
      dd.innerHTML = ''; q = (q || '').trim().toLowerCase(); let curCat = null;
      allOpts.forEach(o => {
        if (q && !o.name.toLowerCase().includes(q)) return;
        if (o.cat !== curCat) { curCat = o.cat; const g = document.createElement('div'); g.className = 'sub-combo-grp'; g.textContent = PICKER_CAT_LABEL[o.cat]; dd.appendChild(g); }
        const it = document.createElement('div'); it.className = 'sub-combo-item' + (arr.includes(o.id) ? ' selected' : ''); it.textContent = (arr.includes(o.id) ? '✓ ' : '') + o.name;
        it.addEventListener('mousedown', e => { e.preventDefault(); const idx = arr.indexOf(o.id); if (idx >= 0) arr.splice(idx, 1); else arr.push(o.id); inp.value = ''; rc(); renderDD(inp.value); });
        dd.appendChild(it);
      });
      if (!dd.children.length) { const em = document.createElement('div'); em.className = 'sub-combo-empty'; em.textContent = '無符合結果'; dd.appendChild(em); }
    };
    inp.addEventListener('focus', () => { renderDD(inp.value); dd.style.display = 'block'; });
    inp.addEventListener('blur', () => { setTimeout(() => { dd.style.display = 'none'; }, 160); });
    inp.addEventListener('input', () => { renderDD(inp.value); dd.style.display = 'block'; });
    cw.appendChild(inp); cw.appendChild(dd);
    const rc = () => { chips.innerHTML = ''; arr.forEach((id, i) => { const chip = document.createElement('span'); chip.className = 'sub-chip-tag'; chip.textContent = getName(id); const rm = document.createElement('span'); rm.className = 'sub-chip-rm'; rm.textContent = '×'; rm.onclick = () => { arr.splice(i, 1); rc(); renderDD(inp.value); }; chip.appendChild(rm); chips.appendChild(chip); }); };
    wrap.appendChild(chips); wrap.appendChild(cw);
    rc();
  };

  mkSecFilter('air-inc-wrap', mustInc); mkSecFilter('air-excl-wrap', mustExcl); mkLootFilter('air-loot-wrap', mustLootIds);

  const ensureAirWorker = () => {
    if (this._airWorkerFailed) return null;
    if (this._airWorker) return this._airWorker;
    try {
      const w = new Worker('js/air-worker.js');
      w.addEventListener('error', ev => { console.warn('[XIV] air_worker 執行失敗，改回主執行緒計算：', ev.message); this._airWorkerFailed = true; this._airWorker = null; });
      this._airWorker = w; return w;
    } catch (err) { console.warn('[XIV] 瀏覽器不支援 Worker 或載入失敗，改回主執行緒計算：', err); this._airWorkerFailed = true; return null; }
  };

  const doSearch = () => {
    const st = getStats(); if (!st) { root.querySelector('#air-results').innerHTML = '<div class="sub-empty">請先選擇所有部件</div>'; return; }
    const lootStrict = root.querySelector('#air-loot-strict')?.checked || false;
    letterOnly = root.querySelector('#air-letter')?.checked || false;
    const res = root.querySelector('#air-results');

    const timeMode = root.querySelector('#air-time-mode-target')?.checked ? 'target' : 'dur';
    if (timeMode === 'target') {
      const target = composeTargetDate();
      if (!target) { res.innerHTML = '<div class="sub-empty">請先選擇想收成的日期與時間</div>'; return; }
      const diffMin = Math.round((target - new Date()) / 60000);
      if (diffMin <= 0) { res.innerHTML = '<div class="sub-empty">指定的收成時間已經過去，請重新選擇</div>'; return; }
      desiredMins = diffMin; useTime = true;
    } else {
      useTime = root.querySelector('#air-use-time')?.checked || false;
      const dd_ = parseInt(root.querySelector('#air-days')?.value) || 0, hh_ = parseInt(root.querySelector('#air-hrs')?.value) || 0, mm_ = parseInt(root.querySelector('#air-mins')?.value) || 0;
      desiredMins = dd_ * 1440 + hh_ * 60 + mm_;
    }
    res.innerHTML = '<div class="sub-empty">⋯ 計算中，請稍候</div>';

    const TIER_LABEL = { 1: 'T1', 2: 'T2', 3: 'T3' };
    const tierMetAt = (sec, tier, curStats) => { if (tier === 1) return true; if (tier === 2) return curStats.sur >= sec[9]; return curStats.sur >= sec[10]; };

    const buildLootDetail = (secIds) => {
      const detail = {};
      secIds.forEach(id => {
        const sec = AIR_SECTOR_MAP.get(id); const tierData = AIR_LOOT_TIER[id];
        if (!sec || !tierData) return;
        [1, 2, 3].forEach(t => { (tierData[t] || []).forEach(itemId => {
          if (!detail[itemId]) detail[itemId] = { 1: [], 2: [], 3: [] };
          detail[itemId][t].push({ id, letter: sec[1], name: sec[3], tier: t });
        }); });
      });
      return detail;
    };

    const buildLootCell = (secIds, curStats) => {
      const detail = buildLootDetail(secIds);
      const groups = { 1: [], 2: [], 3: [] };
      Object.entries(detail).forEach(([idStr, tiers]) => {
        const id = +idStr; const name = getName(id);
        [1,2,3].forEach(t => {
          if (tiers[t].length) {
            const met = t === 1 || tiers[t].some(s => tierMetAt(AIR_SECTOR_MAP.get(s.id), t, curStats));
            groups[t].push({ id, name, sources: tiers[t], met, cat: getItemCategory(id) });
          }
        });
      });
      /* 排序規則：先看有沒有達標（達標在前，拿不到的變暗排最後），
         再依分類重要性排：設計圖材料 > 稀有物品 > 一般材料 > 魔晶石，
         同分類再依名稱排序。CAT_ORDER 用最上面共用那份，跟篩選清單同一套。 */
      [1, 2, 3].forEach(t => groups[t].sort((a, b) =>
        (a.met === b.met ? 0 : (a.met ? -1 : 1)) ||
        (CAT_ORDER[a.cat] - CAT_ORDER[b.cat]) ||
        a.name.localeCompare(b.name, 'zh-TW')
      ));
      const MAX_SHOW = 4; let html = '';
      [1, 2, 3].forEach(t => {
        const items = groups[t]; if (!items.length) return;
        const mkItem = it => {
          const met = it.met;
          const tip = '來源：\n' + it.sources.map(s => { const sec = AIR_SECTOR_MAP.get(s.id); if (t === 1) return `${s.letter} ${s.name}`; const thr = t === 2 ? sec[9] : sec[10]; return `${s.letter} ${s.name}（探索性能需≥${thr}）`; }).join('\n');
          return `<span class="loot-item${met ? '' : ' loot-unmet'} ${lootCatClass(it.id, t)}" data-tip="${tip}">${it.name}</span>`;
        };
        const shown = items.slice(0, MAX_SHOW); const rest = items.slice(MAX_SHOW);
        let itemHtml = shown.map(mkItem).join('、');
        if (rest.length) {
          lootToggleSeq++; const gid = 'air-loot-ext-' + lootToggleSeq; const restHtml = rest.map(mkItem).join('、');
          itemHtml += `<span class="loot-toggle" data-target="${gid}" data-total="${items.length}">　⋯等${items.length}種</span><span class="loot-extra" id="${gid}" style="display:none">、${restHtml}</span>`;
        }
        html += `<div class="loot-tier-row loot-tier-${t}"><span class="loot-tier-badge">${TIER_LABEL[t]}</span><span class="loot-tier-items">${itemHtml}</span></div>`;
      });
      return html || '<span class="loot-empty">—</span>';
    };

    const buildThresholdStrip = (secIds, curStats) => secIds.map(id => {
      const sec = AIR_SECTOR_MAP.get(id); if (!sec) return '';
      const favor = sec[8], t2 = sec[9], t3 = sec[10], normal = sec[11], optimal = sec[12];
      const survCls = curStats.sur >= t3 ? 'thr-full' : curStats.sur >= t2 ? 'thr-part' : 'thr-none';
      const retCls = curStats.ret >= optimal ? 'thr-full' : curStats.ret >= normal ? 'thr-part' : 'thr-none';
      const favCls = curStats.fav >= favor ? 'thr-full' : 'thr-none';
      const tip = `${sec[1]} ${sec[3]}\n👁 探索性能需 T2 ${t2}／T3 ${t3}（你目前 ${curStats.sur}）\n⚓ 收集性能需一般 ${normal}／最佳 ${optimal}（你目前 ${curStats.ret}）\n🍀 恩惠達 ${favor} 有機會雙倍戰利品（你目前 ${curStats.fav}）`;
      return `<span class="thr-stop" data-tip="${tip}"><b class="thr-letter">${sec[1]}</b><i class="thr-dot ${survCls}"></i><i class="thr-dot ${retCls}"></i><i class="thr-dot ${favCls}"></i></span>`;
    }).join('');

    const renderRoutes = (routes) => {
      currentRoutes = routes;
      mogship.classList.toggle('sub-letter', letterOnly && !mogship.classList.contains('sub-compact'));
      if (!routes.length) { res.innerHTML = '<div class="sub-empty">未找到符合條件的路線</div>'; return; }
      const st = getStats(); const curStats = st ? { sur: st.sur, ret: st.ret, fav: st.fav } : { sur: 0, ret: 0, fav: 0 };
      const prop = SORT_PROP[sortKey] || 'epm';
      const sorted = [...routes].sort((a, b) => sortDir * (a[prop] - b[prop]));
      const BATCH = 50; let shown = 0;
      const mkRow = r => {
        const lootHtml = buildLootCell(r.secIds, curStats); const thrHtml = buildThresholdStrip(r.secIds, curStats);
        return `<tr><td data-col="rank">${r.minRank}</td><td data-col="exp">${r.exp.toLocaleString()}</td><td data-col="time">${r.timeStr}</td><td data-col="epm" class="epm-val">${r.epm.toLocaleString()}</td><td data-col="dist">${r.range}</td><td data-col="tank">${r.tank}</td><td data-col="count">${r.secCount}</td><td data-col="sec" class="sec-path"><span class="sec-full">${r.secStr}</span><span class="sec-ltr">${r.secLetters || ''}</span><div class="sub-thr-strip">${thrHtml}</div></td><td data-col="loot" class="loot-cell-tiered">${lootHtml}</td></tr>`;
      };
      const thCell = (col, label) => { if (!SORT_PROP[col]) return `<th data-col="${col}">${label}</th>`; const active = sortKey === col; const arrow = active ? (sortDir === -1 ? '↓' : '↑') : ''; return `<th data-col="${col}" class="sub-sort-th${active ? ' sorted' : ''}">${label}${arrow ? ' ' + arrow : ''}</th>`; };
      const firstBatch = sorted.slice(0, BATCH); shown = firstBatch.length;
      const legendHtml = `<div class="sub-legend"><span class="sub-legend-title">備註</span>`+
        `<span><b class="loot-tier-badge tier-badge-1">T1</b> 一般</span>`+
        `<span><b class="loot-tier-badge tier-badge-2">T2</b> 需探索性能達標</span>`+
        `<span><b class="loot-tier-badge tier-badge-3">T3</b> 需探索性能達最佳</span>`+
        `<span class="sub-legend-sep">淺色字＝尚未達標</span>`+
        `<span class="sub-legend-sep">物品顏色：<b class="cat-blueprint">設計圖材料</b>　<b class="cat-rare3">更稀有物品</b>　<b class="cat-rare2">稀有物品</b>　<b class="cat-general">一般材料</b>　<b class="cat-materia">魔晶石</b></span>`+
        `<span class="sub-legend-sep">圓點（探索／收集／恩惠）：<i class="thr-dot thr-full"></i>最佳（實心）　<i class="thr-dot thr-part"></i>達標（半圓）　<i class="thr-dot thr-none"></i>未達標（空心）</span>`+
        `<span class="sub-legend-sep">點擊物品名稱或圓點可查看完整資訊</span></div>`;
      let html = legendHtml + `<div class="sub-scroll-hint">← 左右滑動查看全部欄位 →</div><table class="sub-table"><thead><tr>` +
        thCell('rank', '等級') + thCell('exp', SORT_LABEL.exp) + thCell('time', SORT_LABEL.time) + thCell('epm', SORT_LABEL.epm) +
        thCell('dist', '距離消耗') + thCell('tank', '燃料需求') + thCell('count', '目的地數') + thCell('sec', '目的地') + thCell('loot', '獲得物品') + `</tr></thead><tbody>`;
      firstBatch.forEach(r => { html += mkRow(r); }); html += '</tbody></table>';
      res.innerHTML = html;
      res.querySelectorAll('th.sub-sort-th').forEach(th => { th.addEventListener('click', () => { const col = th.dataset.col; if (sortKey === col) sortDir = -sortDir; else { sortKey = col; sortDir = -1; } renderRoutes(currentRoutes); }); });
      if (sorted.length > shown) {
        const moreBtn = document.createElement('button'); moreBtn.className = 'sub-more-btn'; moreBtn.textContent = `顯示更多（已顯示 ${shown} ／ 共 ${sorted.length} 筆）`;
        moreBtn.onclick = () => { const tbody = res.querySelector('tbody'); const next = sorted.slice(shown, shown + BATCH); next.forEach(r => { tbody.insertAdjacentHTML('beforeend', mkRow(r)); }); shown += next.length; if (shown >= sorted.length) moreBtn.remove(); else moreBtn.textContent = `顯示更多（已顯示 ${shown} ／ 共 ${sorted.length} 筆）`; };
        res.appendChild(moreBtn);
      }
    };

    const runOnMainThread = () => { setTimeout(() => { renderRoutes(airFindRoutes(airRank, st, mustInc, mustExcl, mustLootIds, desiredMins, useTime, lootStrict)); }, 50); };
    const worker = ensureAirWorker();
    if (!worker) { runOnMainThread(); return; }
    const reqId = (this._airReqId = (this._airReqId || 0) + 1);
    const onMsg = (ev) => {
      if (ev.data?.reqId !== reqId) return; worker.removeEventListener('message', onMsg);
      if (ev.data.ok) { renderRoutes(ev.data.routes); } else { console.warn('[XIV] worker 計算發生錯誤，改回主執行緒計算：', ev.data.error); runOnMainThread(); }
    };
    worker.addEventListener('message', onMsg);
    worker.postMessage({ reqId, rank: airRank, stats: st, mustInc, mustExcl, mustLootIds, desiredMins, useTime, lootStrict });
  };

  root.querySelector('#air-rank-inp')?.addEventListener('input', updateStats);
  const saveFilterState = () => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify({
        rank: airRank,
        hull: root.querySelector('#air-hull')?.value,
        rigging: root.querySelector('#air-rigging')?.value,
        forecastle: root.querySelector('#air-forecastle')?.value,
        aftcastle: root.querySelector('#air-aftcastle')?.value,
        mustInc, mustExcl, mustLootIds,
        lootStrict: root.querySelector('#air-loot-strict')?.checked || false,
        letterOnly,
        time: {
          days: root.querySelector('#air-days')?.value,
          hrs: root.querySelector('#air-hrs')?.value,
          mins: root.querySelector('#air-mins')?.value,
          useTime: root.querySelector('#air-use-time')?.checked || false,
        },
      }));
    } catch (e) {}
  };

  ['air-hull', 'air-rigging', 'air-forecastle', 'air-aftcastle'].forEach(id => root.querySelector(`#${id}`)?.addEventListener('change', updateStats));
  root.querySelector('#air-search-btn')?.addEventListener('click', () => { doSearch(); saveFilterState(); });
  root.querySelector('#air-clear-btn')?.addEventListener('click', () => {
    [mustInc, mustExcl, mustLootIds].forEach(a => a.length = 0);
    root.querySelectorAll('.sub-chips-display').forEach(c => c.innerHTML = '');
    const strictChk = root.querySelector('#air-loot-strict'); if (strictChk) strictChk.checked = false;
    const letterChk = root.querySelector('#air-letter'); if (letterChk) letterChk.checked = false;
    letterOnly = false;
    saveFilterState();
  });

  const mogship = root.querySelector('.sub-mogship');
  const viewToggle = root.querySelector('#air-view-toggle');
  const filtersHdr = root.querySelector('#air-filters-hdr');
  const filtersPanel = root.querySelector('#air-filters-panel');

  /* ── 探索地圖彈窗：跟 sub-panel.js 共用同一套 .map-modal-overlay 元素
     （若潛水艇面板已經建立過就直接複用，不重複建立），飛空艇只有雲海
     一張圖，不需要分頁籤。 */
  let mapModalEl = document.querySelector('.map-modal-overlay');
  if (!mapModalEl) {
    mapModalEl = document.createElement('div');
    mapModalEl.className = 'map-modal-overlay';
    mapModalEl.innerHTML = '<div class="map-modal"><div class="map-modal-inner">'
      + '<div class="map-modal-head"><span class="map-modal-title">探索地圖</span><span class="map-modal-close" role="button" aria-label="關閉">✕</span></div>'
      + '<div class="map-modal-tabs"></div>'
      + '<div class="map-modal-body"><img class="map-modal-img"><div class="map-modal-caption"></div></div>'
      + '</div></div>';
    document.body.appendChild(mapModalEl);
    const closeMapModal = () => mapModalEl.classList.remove('active');
    mapModalEl.addEventListener('click', e => { if (e.target === mapModalEl) closeMapModal(); });
    mapModalEl.querySelector('.map-modal-close').addEventListener('click', closeMapModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMapModal(); });
  }
  const openMapModal = (maps, title) => {
    mapModalEl.querySelector('.map-modal-title').textContent = title;
    const tabsWrap = mapModalEl.querySelector('.map-modal-tabs');
    tabsWrap.innerHTML = '';
    tabsWrap.style.display = maps.length > 1 ? 'flex' : 'none';
    const img = mapModalEl.querySelector('.map-modal-img');
    const cap = mapModalEl.querySelector('.map-modal-caption');
    const show = m => {
      img.classList.remove('loaded');
      img.onload = () => img.classList.add('loaded');
      img.src = m.file; img.alt = m.label; cap.textContent = m.label;
      tabsWrap.querySelectorAll('.map-modal-tab').forEach(t => t.classList.toggle('active', t.dataset.key === m.key));
    };
    maps.forEach(m => {
      const b = document.createElement('div'); b.className = 'map-modal-tab'; b.textContent = m.label; b.dataset.key = m.key;
      b.addEventListener('click', () => show(m));
      tabsWrap.appendChild(b);
    });
    show(maps[0]);
    mapModalEl.classList.add('active');
  };
  const mapBtn = root.querySelector('#air-map-btn');
  if (mapBtn) mapBtn.addEventListener('click', () => openMapModal([{ key: 'clouds', label: '雲海', file: 'assets/maps/map-air-clouds.jpg' }], '飛空艇 · 探索地圖'));

  const setCompact = (compact) => {
    mogship.classList.toggle('sub-compact', compact);
    viewToggle.textContent = compact ? '切換為完整模式' : '切換為精簡模式';
    filtersPanel.classList.toggle('sub-filters-open', !compact);
    filtersHdr.textContent = (filtersPanel.classList.contains('sub-filters-open') ? '▾' : '▸') + ' 篩選條件';
    try { localStorage.setItem('xiv-air-compact', compact ? '1' : '0'); } catch (e) {}
  };
  let _ac = '0'; try { _ac = localStorage.getItem('xiv-air-compact') || '0'; } catch (e) {}
  setCompact(_ac === '1');
  viewToggle?.addEventListener('click', () => setCompact(!mogship.classList.contains('sub-compact')));
  filtersHdr?.addEventListener('click', () => { filtersPanel.classList.toggle('sub-filters-open'); filtersHdr.textContent = (filtersPanel.classList.contains('sub-filters-open') ? '▾' : '▸') + ' 篩選條件'; });

  updateStats();

  /* ===== 配裝反查（路線搜尋 ⇄ 配裝反查 模式切換）===== */
  const revPanel = root.querySelector('#air-reverse-panel');
  const OWNED_KEY = 'xiv-air-owned-parts';
  let ownedParts = { hull: [], rigging: [], forecastle: [], aftcastle: [] };
  try { const saved = JSON.parse(localStorage.getItem(OWNED_KEY) || 'null'); if (saved) ownedParts = saved; } catch (e) {}

  const buildReversePanel = () => {
    const slotLabel = { hull: '船體', rigging: '舾裝', forecastle: '船首', aftcastle: '船尾' };
    let ownedHtml = '<div class="sub-owned-grid">';
    ['hull', 'rigging', 'forecastle', 'aftcastle'].forEach(slot => {
      ownedHtml += `<div class="sub-owned-col"><div class="sub-owned-col-title">${slotLabel[slot]}</div>`;
      AIR_PARTS[slot].forEach(p => {
        const checked = (ownedParts[slot] || []).includes(p[1]) ? 'checked' : '';
        ownedHtml += `<label class="sub-owned-item"><input type="checkbox" data-slot="${slot}" data-rank="${p[1]}" ${checked}> ${AIR_RANK_CODE[p[1]] || p[1]} — ${p[2]}</label>`;
      });
      ownedHtml += '</div>';
    });
    ownedHtml += '</div>';

    revPanel.innerHTML = `<div class="sub-rev-row">
    <label class="sub-chk-lbl"><input type="radio" name="air-rev-kind" id="air-rev-kind-dest" checked> 指定目的地</label>
    <label class="sub-chk-lbl"><input type="radio" name="air-rev-kind" id="air-rev-kind-item"> 指定物品</label>
    <label class="sub-chk-lbl"><input type="radio" name="air-rev-kind" id="air-rev-kind-stat"> 自行輸入需求值</label>
  </div>
  <div class="sub-rev-row">
    <label class="sub-lbl" for="air-rev-rank">等級</label><input type="number" id="air-rev-rank" class="sub-inp" value="1" min="1" max="50">
  </div>
  <div id="air-rev-dest-block">
    <div class="sub-rev-row">
      <label class="sub-chk-lbl"><input type="radio" name="air-rev-target-mode" id="air-rev-mode-single" checked> 單一目的地</label>
      <label class="sub-chk-lbl"><input type="radio" name="air-rev-target-mode" id="air-rev-mode-route"> 整條路線（最多5站）</label>
    </div>
    <div class="sub-rev-row">
      <label class="sub-lbl" id="air-rev-dest-lbl">目的地</label>
      <div class="sub-combo-wrap" id="air-rev-dest-wrap" style="min-width:240px"></div>
    </div>
    <div class="sub-chips-display" id="air-rev-dest-chips"></div>
  </div>
  <div id="air-rev-item-block" style="display:none">
    <div class="sub-rev-row">
      <label class="sub-lbl">物品（可多選，最多5個航區）</label>
      <div class="sub-combo-wrap" id="air-rev-item-wrap" style="min-width:280px"></div>
    </div>
    <div class="sub-chips-display" id="air-rev-item-chips"></div>
    <div id="air-rev-item-picks"></div>
  </div>
  <div id="air-rev-stat-block" style="display:none">
    <div class="sub-rev-row">
      <div class="sub-rev-thr-grp"><label class="sub-lbl">探索至少</label><input type="number" id="air-rev-stat-sur" class="sub-inp sub-rev-thr-num" style="display:inline-block" placeholder="不要求"></div>
      <div class="sub-rev-thr-grp"><label class="sub-lbl">收集至少</label><input type="number" id="air-rev-stat-ret" class="sub-inp sub-rev-thr-num" style="display:inline-block" placeholder="不要求"></div>
      <div class="sub-rev-thr-grp"><label class="sub-lbl">恩惠至少</label><input type="number" id="air-rev-stat-fav" class="sub-inp sub-rev-thr-num" style="display:inline-block" placeholder="不要求"></div>
      <div class="sub-rev-thr-grp"><label class="sub-lbl">速度至少</label><input type="number" id="air-rev-stat-spd" class="sub-inp sub-rev-thr-num" style="display:inline-block" placeholder="不要求"></div>
      <div class="sub-rev-thr-grp"><label class="sub-lbl">航程至少</label><input type="number" id="air-rev-stat-rng" class="sub-inp sub-rev-thr-num" style="display:inline-block" placeholder="不要求"></div>
    </div>
  </div>
  <div class="sub-rev-row" id="air-rev-thr-row">
    <div class="sub-rev-thr-grp sub-rev-thr-toggle" id="air-rev-sur-grp"><label class="sub-lbl">探索</label><select id="air-rev-sur" class="sub-sel"><option value="none">不要求</option><option value="normal">達標</option><option value="best">最佳</option><option value="adv">自行輸入</option></select><input type="number" id="air-rev-sur-num" class="sub-inp sub-rev-thr-num" value="0"></div>
    <div class="sub-rev-thr-grp sub-rev-thr-toggle"><label class="sub-lbl">收集</label><select id="air-rev-ret" class="sub-sel"><option value="none">不要求</option><option value="normal">達標</option><option value="best">最佳</option><option value="adv">自行輸入</option></select><input type="number" id="air-rev-ret-num" class="sub-inp sub-rev-thr-num" value="0"></div>
    <div class="sub-rev-thr-grp sub-rev-thr-toggle"><label class="sub-lbl">恩惠</label><select id="air-rev-fav" class="sub-sel"><option value="none">不要求</option><option value="met">達標(雙倍機會)</option><option value="adv">自行輸入</option></select><input type="number" id="air-rev-fav-num" class="sub-inp sub-rev-thr-num" value="0"></div>
  </div>
  <div class="sub-owned-hdr-row"><label class="sub-lbl">擁有的部件（會自動記住，下次不用重選）</label><div class="sub-owned-actions"><button type="button" id="air-owned-all" class="sub-owned-mini-btn">全選</button><button type="button" id="air-owned-none" class="sub-owned-mini-btn">全部清除</button></div></div>
  ${ownedHtml}
  <div class="sub-rev-row"><button id="air-rev-search-btn" class="sub-search-btn">搜　尋</button></div>
  <div id="air-rev-results-dest"><div class="sub-empty">選擇目的地、門檻與擁有的部件後按搜尋</div></div>
  <div id="air-rev-results-item" style="display:none"><div class="sub-empty">選擇物品、門檻與擁有的部件後按搜尋</div></div>
  <div id="air-rev-results-stat" style="display:none"><div class="sub-empty">輸入需求值與擁有的部件後按搜尋</div></div>`;

    mkStepper(revPanel.querySelector('#air-rev-rank'), { step: 1, min: 1, max: 50, wide: true });
    ['air-rev-sur-num', 'air-rev-ret-num', 'air-rev-fav-num', 'air-rev-stat-sur', 'air-rev-stat-ret', 'air-rev-stat-fav', 'air-rev-stat-spd', 'air-rev-stat-rng'].forEach(id => {
      mkStepper(revPanel.querySelector(`#${id}`), { step: 1, min: 0 });
    });

    /* ── 查詢方式：指定目的地 / 指定物品 / 自行輸入數值 ── */
    let kind = 'dest';
    const destBlock = revPanel.querySelector('#air-rev-dest-block');
    const itemBlock = revPanel.querySelector('#air-rev-item-block');
    const statBlock = revPanel.querySelector('#air-rev-stat-block');
    const thrRow = revPanel.querySelector('#air-rev-thr-row');
    const surGrp = revPanel.querySelector('#air-rev-sur-grp');
    const resDest = revPanel.querySelector('#air-rev-results-dest');
    const resItem = revPanel.querySelector('#air-rev-results-item');
    const resStat = revPanel.querySelector('#air-rev-results-stat');
    const applyKind = () => {
      destBlock.style.display = kind === 'dest' ? '' : 'none';
      itemBlock.style.display = kind === 'item' ? '' : 'none';
      statBlock.style.display = kind === 'stat' ? '' : 'none';
      thrRow.style.display = kind === 'stat' ? 'none' : '';
      surGrp.style.display = kind === 'item' ? 'none' : ''; // 物品模式的探索門檻是自動算出來的，不用再選
      resDest.style.display = kind === 'dest' ? '' : 'none';
      resItem.style.display = kind === 'item' ? '' : 'none';
      resStat.style.display = kind === 'stat' ? '' : 'none';
    };
    revPanel.querySelectorAll('input[name="air-rev-kind"]').forEach(r => r.addEventListener('change', () => {
      kind = revPanel.querySelector('#air-rev-kind-item').checked ? 'item' : revPanel.querySelector('#air-rev-kind-stat').checked ? 'stat' : 'dest';
      applyKind();
      updateThrLabels();
    }));
    applyKind();

    let targetMode = 'single'; // 'single' | 'route'
    let selDest = null;      // 單一目的地模式用
    const selDests = [];     // 整條路線模式用（最多5個）
    const destWrap = revPanel.querySelector('#air-rev-dest-wrap');
    const chipsEl = revPanel.querySelector('#air-rev-dest-chips');
    const destLbl = revPanel.querySelector('#air-rev-dest-lbl');
    const dInp = document.createElement('input'); dInp.type = 'text'; dInp.className = 'sub-combo-inp'; dInp.placeholder = '輸入編號或名稱搜尋目的地…';
    const dDd = document.createElement('div'); dDd.className = 'sub-combo-dd'; dDd.style.display = 'none';
    const allSecOpts = AIR_SECTORS.map(s => ({ val: s[0], label: `${s[1]} — ${s[3]}` }));
    const renderChips = () => {
      chipsEl.innerHTML = '';
      if (targetMode !== 'route') return;
      selDests.forEach((id, i) => {
        const s = AIR_SECTOR_MAP.get(id); if (!s) return;
        const chip = document.createElement('span'); chip.className = 'sub-chip-tag'; chip.textContent = `${s[1]} ${s[3]}`;
        const rm = document.createElement('span'); rm.className = 'sub-chip-rm'; rm.textContent = '×';
        rm.onclick = () => { selDests.splice(i, 1); renderChips(); };
        chip.appendChild(rm); chipsEl.appendChild(chip);
      });
    };
    const renderDestDD = q => {
      dDd.innerHTML = ''; q = (q || '').trim().toLowerCase();
      allSecOpts.forEach(o => {
        if (q && !o.label.toLowerCase().includes(q)) return;
        const isSel = targetMode === 'single' ? selDest === o.val : selDests.includes(o.val);
        const it = document.createElement('div'); it.className = 'sub-combo-item' + (isSel ? ' selected' : ''); it.textContent = (isSel ? '✓ ' : '') + o.label;
        it.addEventListener('mousedown', e => {
          e.preventDefault();
          if (targetMode === 'single') { selDest = o.val; dInp.value = o.label; dDd.style.display = 'none'; }
          else {
            const idx = selDests.indexOf(o.val);
            if (idx >= 0) selDests.splice(idx, 1);
            else if (selDests.length < 5) selDests.push(o.val);
            dInp.value = ''; renderChips(); renderDestDD('');
          }
          updateThrLabels();
        });
        dDd.appendChild(it);
      });
      if (!dDd.children.length) { const em = document.createElement('div'); em.className = 'sub-combo-empty'; em.textContent = '無符合結果'; dDd.appendChild(em); }
    };
    dInp.addEventListener('focus', () => { renderDestDD(dInp.value); dDd.style.display = 'block'; });
    dInp.addEventListener('blur', () => { setTimeout(() => { dDd.style.display = 'none'; }, 160); });
    dInp.addEventListener('input', () => { if (targetMode === 'single') selDest = null; renderDestDD(dInp.value); dDd.style.display = 'block'; });
    destWrap.appendChild(dInp); destWrap.appendChild(dDd);

    revPanel.querySelectorAll('input[name="air-rev-target-mode"]').forEach(r => r.addEventListener('change', () => {
      targetMode = revPanel.querySelector('#air-rev-mode-route').checked ? 'route' : 'single';
      destLbl.textContent = targetMode === 'route' ? '目的地（依序點選，最多5站）' : '目的地';
      dInp.value = ''; selDest = null; renderChips(); renderDestDD('');
      updateThrLabels();
    }));

    /* ── 指定物品：多選 + 每個物品自己選要去哪個航區拿（列出所有候選） ── */
    const itemWrap = revPanel.querySelector('#air-rev-item-wrap');
    const itemChipsEl = revPanel.querySelector('#air-rev-item-chips');
    const itemPicksEl = revPanel.querySelector('#air-rev-item-picks');
    const selItems = []; // [itemId,...]
    const itemPickedSec = {}; // {itemId: sectorId}（每個物品目前選的航區）
    const iInp = document.createElement('input'); iInp.type = 'text'; iInp.className = 'sub-combo-inp'; iInp.placeholder = '輸入物品名稱搜尋…';
    const iDd = document.createElement('div'); iDd.className = 'sub-combo-dd'; iDd.style.display = 'none';
    const allItemOpts = Object.keys(AIR_ITEM_SECTORS).map(id => ({ id: +id, name: getName(+id), cat: getPickerCategory(+id) })).sort((a, b) => (PICKER_CAT_ORDER[a.cat] - PICKER_CAT_ORDER[b.cat]) || a.name.localeCompare(b.name, 'zh-TW'));
    const TIER_LABEL2 = { 1: '一般', 2: '達標', 3: '最佳' };
    const renderItemPicks = () => {
      itemPicksEl.innerHTML = '';
      selItems.forEach(itemId => {
        const cands = (AIR_ITEM_SECTORS[itemId] || []).slice().sort((a, b) => a.tier - b.tier || a.sec - b.sec);
        if (!itemPickedSec[itemId] || !cands.some(c => c.sec === itemPickedSec[itemId])) itemPickedSec[itemId] = cands[0]?.sec;
        const row = document.createElement('div'); row.className = 'sub-rev-row';
        const lbl = document.createElement('span'); lbl.className = 'sub-lbl'; lbl.textContent = getName(itemId) + '：';
        const sel = document.createElement('select'); sel.className = 'sub-sel';
        cands.forEach(c => {
          const s = AIR_SECTOR_MAP.get(c.sec); if (!s) return;
          const surThr = c.tier === 3 ? s[10] : c.tier === 2 ? s[9] : null;
          const thrText = c.tier === 1 ? '探索無要求' : `探索需${TIER_LABEL2[c.tier]}${surThr != null ? ' ' + surThr : ''}`;
          const o = document.createElement('option'); o.value = c.sec; o.textContent = `${s[1]} ${s[3]}（${thrText}）`;
          if (c.sec === itemPickedSec[itemId]) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', () => { itemPickedSec[itemId] = +sel.value; updateThrLabels(); });
        row.appendChild(lbl); row.appendChild(sel); itemPicksEl.appendChild(row);
      });
    };
    const renderItemChips = () => {
      itemChipsEl.innerHTML = '';
      selItems.forEach((id, i) => {
        const chip = document.createElement('span'); chip.className = 'sub-chip-tag'; chip.textContent = getName(id);
        const rm = document.createElement('span'); rm.className = 'sub-chip-rm'; rm.textContent = '×';
        rm.onclick = () => { selItems.splice(i, 1); delete itemPickedSec[id]; renderItemChips(); renderItemPicks(); updateThrLabels(); };
        chip.appendChild(rm); itemChipsEl.appendChild(chip);
      });
    };
    const renderItemDD = q => {
      iDd.innerHTML = ''; q = (q || '').trim().toLowerCase(); let curCat = null;
      allItemOpts.forEach(o => {
        if (q && !o.name.toLowerCase().includes(q)) return;
        if (o.cat !== curCat) { curCat = o.cat; const g = document.createElement('div'); g.className = 'sub-combo-grp'; g.textContent = PICKER_CAT_LABEL[o.cat]; iDd.appendChild(g); }
        const isSel = selItems.includes(o.id);
        const it = document.createElement('div'); it.className = 'sub-combo-item' + (isSel ? ' selected' : ''); it.textContent = (isSel ? '✓ ' : '') + o.name;
        it.addEventListener('mousedown', e => {
          e.preventDefault();
          const idx = selItems.indexOf(o.id);
          if (idx >= 0) { selItems.splice(idx, 1); delete itemPickedSec[o.id]; }
          else selItems.push(o.id);
          iInp.value = ''; renderItemChips(); renderItemPicks(); renderItemDD(''); updateThrLabels();
        });
        iDd.appendChild(it);
      });
      if (!iDd.children.length) { const em = document.createElement('div'); em.className = 'sub-combo-empty'; em.textContent = '無符合結果'; iDd.appendChild(em); }
    };
    iInp.addEventListener('focus', () => { renderItemDD(iInp.value); iDd.style.display = 'block'; });
    iInp.addEventListener('blur', () => { setTimeout(() => { iDd.style.display = 'none'; }, 160); });
    iInp.addEventListener('input', () => { renderItemDD(iInp.value); iDd.style.display = 'block'; });
    itemWrap.appendChild(iInp); itemWrap.appendChild(iDd);

    ['sur', 'ret', 'fav'].forEach(k => {
      const sel = revPanel.querySelector(`#air-rev-${k}`);
      sel.addEventListener('change', () => { sel.closest('.sub-rev-thr-grp').classList.toggle('adv', sel.value === 'adv'); });
    });

    revPanel.querySelectorAll('.sub-owned-item input').forEach(chk => {
      chk.addEventListener('change', () => {
        const slot = chk.dataset.slot, rank = +chk.dataset.rank;
        const arr = ownedParts[slot] || (ownedParts[slot] = []);
        const idx = arr.indexOf(rank);
        if (chk.checked && idx < 0) arr.push(rank);
        else if (!chk.checked && idx >= 0) arr.splice(idx, 1);
        try { localStorage.setItem(OWNED_KEY, JSON.stringify(ownedParts)); } catch (e) {}
      });
    });
    const setAllOwned = (checked) => {
      revPanel.querySelectorAll('.sub-owned-item input').forEach(chk => { chk.checked = checked; });
      ['hull', 'rigging', 'forecastle', 'aftcastle'].forEach(slot => {
        ownedParts[slot] = checked ? AIR_PARTS[slot].map(p => p[1]) : [];
      });
      try { localStorage.setItem(OWNED_KEY, JSON.stringify(ownedParts)); } catch (e) {}
    };
    revPanel.querySelector('#air-owned-all')?.addEventListener('click', () => setAllOwned(true));
    revPanel.querySelector('#air-owned-none')?.addEventListener('click', () => setAllOwned(false));

    const getThr = k => {
      const sel = revPanel.querySelector(`#air-rev-${k}`).value;
      if (sel === 'adv') return parseFloat(revPanel.querySelector(`#air-rev-${k}-num`).value) || 0;
      return sel;
    };
    /* 動態把「達標／最佳」選項的實際門檻數字顯示出來，隨著目的地／物品
       選擇即時更新（不同航區門檻不同；選了多個航區時顯示其中最高的那個，
       因為同一艘船要整趟都達標，實際卡的就是最高的那個數字）。 */
    const updateThrLabels = () => {
      let secs = [];
      if (kind === 'dest') {
        const ids = targetMode === 'route' ? selDests : (selDest != null ? [selDest] : []);
        secs = ids.map(id => AIR_SECTOR_MAP.get(id)).filter(Boolean);
      } else if (kind === 'item') {
        secs = Object.values(itemPickedSec).map(id => AIR_SECTOR_MAP.get(id)).filter(Boolean);
      }
      const maxOf = arr => arr.length ? Math.max(...arr) : null;
      const surNorm = maxOf(secs.map(s => s[9])), surBest = maxOf(secs.map(s => s[10]));
      const retNorm = maxOf(secs.map(s => s[11])), retBest = maxOf(secs.map(s => s[12]));
      const favThr = maxOf(secs.map(s => s[8]));
      const setOpt = (selId, val, label) => { const opt = revPanel.querySelector(`#${selId} option[value="${val}"]`); if (opt) opt.textContent = label; };
      setOpt('air-rev-sur', 'normal', surNorm != null ? `達標 (${surNorm})` : '達標');
      setOpt('air-rev-sur', 'best', surBest != null ? `最佳 (${surBest})` : '最佳');
      setOpt('air-rev-ret', 'normal', retNorm != null ? `達標 (${retNorm})` : '達標');
      setOpt('air-rev-ret', 'best', retBest != null ? `最佳 (${retBest})` : '最佳');
      setOpt('air-rev-fav', 'met', favThr != null ? `達標(雙倍機會) (${favThr})` : '達標(雙倍機會)');
    };
    updateThrLabels();

    const mkResultTable = results => `<table class="sub-table sub-rev-table"><thead><tr><th>船體</th><th>舾裝</th><th>船首</th><th>船尾</th><th data-col="sur">探索</th><th data-col="ret">收集</th><th data-col="fav">恩惠</th><th>承載力</th>${results[0]?.timeStr !== undefined ? '<th>時間</th>' : ''}</tr></thead><tbody>` +
      results.slice(0, 100).map(r => `<tr><td>${AIR_RANK_CODE[r.hull[1]] || r.hull[1]} ${r.hull[2]}</td><td>${AIR_RANK_CODE[r.rigging[1]] || r.rigging[1]} ${r.rigging[2]}</td><td>${AIR_RANK_CODE[r.forecastle[1]] || r.forecastle[1]} ${r.forecastle[2]}</td><td>${AIR_RANK_CODE[r.aftcastle[1]] || r.aftcastle[1]} ${r.aftcastle[2]}</td>` +
        `<td data-col="sur" class="thr-ok">${r.st.sur}</td><td data-col="ret" class="thr-ok">${r.st.ret}</td><td data-col="fav" class="thr-ok">${r.st.fav}</td><td>${r.cost}/${r.cap ?? '—'}</td>${r.timeStr !== undefined ? `<td>${r.timeStr}</td>` : ''}</tr>`).join('') + '</tbody></table>';

    revPanel.querySelector('#air-rev-search-btn').addEventListener('click', () => {
      const resEl = kind === 'item' ? resItem : kind === 'stat' ? resStat : resDest;
      const rank = parseInt(revPanel.querySelector('#air-rev-rank').value) || 1;

      if (kind === 'stat') {
        const num = id => { const v = revPanel.querySelector(`#${id}`).value; return v === '' ? null : parseFloat(v); };
        const target = { sur: num('air-rev-stat-sur'), ret: num('air-rev-stat-ret'), fav: num('air-rev-stat-fav'), spd: num('air-rev-stat-spd'), rng: num('air-rev-stat-rng') };
        const results = airFindBuildsByStats(target, ownedParts, rank);
        if (!results.length) { resEl.innerHTML = '<div class="sub-empty">找不到符合條件的組合（可能是擁有的部件不夠，或超過承載力）</div>'; return; }
        resEl.innerHTML = `<div class="sub-target-hint">共找到 ${results.length} 組符合條件（顯示前100組，依承載力使用量由低到高排序）</div>` + mkResultTable(results);
        return;
      }

      if (kind === 'item') {
        if (!selItems.length) { resEl.innerHTML = '<div class="sub-empty">請先選擇至少一項物品</div>'; return; }
        const sectorTierMap = {};
        selItems.forEach(itemId => {
          const sec = itemPickedSec[itemId];
          const cand = (AIR_ITEM_SECTORS[itemId] || []).find(c => c.sec === sec);
          if (cand) sectorTierMap[sec] = Math.max(sectorTierMap[sec] || 0, cand.tier);
        });
        if (Object.keys(sectorTierMap).length > 5) { resEl.innerHTML = '<div class="sub-empty">選到的物品分散在超過5個航區，同一趟飛不完，請減少物品數量或改選同航區的物品</div>'; return; }
        const th = { ret: getThr('ret'), fav: getThr('fav') };
        const results = airFindBuildsForTiers(sectorTierMap, th, ownedParts, rank);
        if (!results.length) { resEl.innerHTML = '<div class="sub-empty">找不到符合條件的組合（可能是擁有的部件不夠、超過承載力，或航程不夠飛完全程）</div>'; return; }
        const destStr = Object.keys(sectorTierMap).map(id => { const s = AIR_SECTOR_MAP.get(+id); return s ? `${s[1]} ${s[3]}` : ''; }).join('、');
        resEl.innerHTML = `<div class="sub-target-hint">路線會經過：${destStr}　共找到 ${results.length} 組符合條件（顯示前100組，依耗時由短到長排序）</div>` + mkResultTable(results);
        return;
      }

      // kind === 'dest'
      const targets = targetMode === 'route' ? selDests.slice() : (selDest != null ? [selDest] : []);
      if (!targets.length) { resEl.innerHTML = `<div class="sub-empty">請先選擇${targetMode === 'route' ? '至少一個' : ''}目的地</div>`; return; }
      const th = { sur: getThr('sur'), ret: getThr('ret'), fav: getThr('fav') };
      const results = airFindBuilds(targets, ownedParts, th, rank);
      if (!results.length) { resEl.innerHTML = '<div class="sub-empty">找不到符合條件的組合（可能是擁有的部件不夠、超過承載力，或航程不夠飛完全程）</div>'; return; }
      const destStr = targets.map(id => { const s = AIR_SECTOR_MAP.get(id); return s ? `${s[1]} ${s[3]}` : ''; }).join(' → ');
      resEl.innerHTML = `<div class="sub-target-hint">目的地：${destStr}　共找到 ${results.length} 組符合條件（顯示前100組，依耗時由短到長排序）</div>` + mkResultTable(results);
    });
  };
  buildReversePanel();

  const routePanel = root.querySelector('#air-route-panel');
  root.querySelectorAll('.sub-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.sub-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      routePanel.style.display = mode === 'route' ? '' : 'none';
      revPanel.style.display = mode === 'reverse' ? '' : 'none';
    });
  });

  setTimeout(() => root.querySelectorAll('.ih:not([data-ih])').forEach(el => { el.setAttribute('data-ih', '1'); this._bindIH(el); }), 100);
};
