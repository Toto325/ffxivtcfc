/* craft-panel.js — 生產製作 UI 面板。
 * 依賴：craft-action-names.js、craft-foods.js、craft-consumables.js（已在 index.html 隨頁載入，體積小）；
 * craft-data.js（13,892筆配方，~3.9MB）與 vendor/ffxiv-simulator.umd.js 體積較大，只有玩家真的點進
 * 「生產」分頁才動態載入，避免拖慢其他頁面的首次載入。
 * 求解邏輯本身丟給 craft-worker.js（Web Worker）跑，UI 執行緒不會被 GA 演算法卡住。
 *
 * 技能可用性設計（修正版）：不再讓玩家逐一勾選每個技能——等級/職業/專家能不能用某個技能，
 * 求解器自己會依模擬引擎的規則正確判斷，不需要玩家自己確認。只有極少數「等級到了但還要
 * 另外解任務才學得到」的技能（目前確認的只有「掌握」），才需要玩家額外確認一下有沒有學會，
 * 這份清單維護在 SPECIAL_ACTIONS，之後如果查證到其他類似技能，加進這個陣列就好。
 */
/* 技能可用性設計：等級/職業能不能用某個技能，求解器自己依模擬引擎規則判斷，不需要玩家逐一確認。
 * 只有這四個技能，遊戲規則本身允許使用，但玩家不一定「有」或「想用」，需要額外過目：
 *  - 掌握：等級到了不代表學會了，需要另外解任務
 *  - 專心致志／快速改革：專家限定＋單場限用一次
 *  - 工匠的神速技巧：等級80＋角色等級要比配方等級高10以上（首步限定），能不能用要看選了哪個配方
 * 判斷「現在能不能用」一律直接問模擬引擎本身的 canBeUsed()，不自己重寫規則，
 * 避免规则跟求解器實際使用的不一致（版本更新/規則調整都會自動跟著對）。
 */
var SPECIAL_ACTIONS = [
  { key: 'Manipulation', label: '掌握', note: '需另外解任務學習' },
  { key: 'HeartAndSoul', label: '專心致志', note: '需啟用專家，限用一次' },
  { key: 'QuickInnovation', label: '快速改革', note: '需啟用專家，限用一次' },
  { key: 'TrainedEye', label: '工匠的神速技巧', note: '角色等級需比配方高10以上，僅限首步' },
];

/* 水/風/地/雷/火/冰的水晶系列（碎晶/水晶/晶簇），道具ID 2-19，自2.0版至今固定沒變過。
 * 這類材料遊戲裡沒有HQ版本，介面上要整排鎖住只能選NQ，不是我們忘記給選項。 */
var CRYSTAL_ITEM_IDS = new Set([2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]);

app.buildCraft = function () {
  const root = document.getElementById('craft-root');
  if (!root) return;

  root.innerHTML =
    '<div class="craft-loading"><span class="craft-loading-icon">⚒</span><span>載入配方資料中⋯</span></div>';

  const need = ['js/vendor/ffxiv-simulator.umd.js', 'js/craft-data.js', 'js/craft-icons.js', 'js/craft-action-names.js'];
  let loaded = 0;
  need.forEach(function (src) {
    const s = document.createElement('script');
    s.src = src;
    s.onload = function () { loaded++; if (loaded === need.length) app._craftReady(); };
    s.onerror = function () {
      root.innerHTML = '<div class="craft-loading craft-error">資料載入失敗，請重新整理再試一次。</div>';
    };
    document.body.appendChild(s);
  });
};

app._craftReady = function () {
  const root = document.getElementById('craft-root');

  /* 技能鍵名(如BasicSynthesis) -> 多語言名稱，手動模式技能格子跟序列顯示要用 */
  const MANUAL_ACTION_NAMES = {};
  simulator.CraftingActionsRegistry.ALL_ACTIONS.forEach(function (entry) {
    const ids = entry.action.getIds().filter(function (id) { return id > 0; });
    const found = ids.map(function (id) { return CRAFT_ACTION_NAMES_BY_GAME_ID[id]; }).find(Boolean);
    if (found) MANUAL_ACTION_NAMES[entry.name] = found;
  });

  /* ── 配方搜尋索引：配方 id -> 道具名稱，只建一次 ── */
  const RECIPE_INDEX = Object.keys(CRAFT_RECIPES).map(function (id) {
    const r = CRAFT_RECIPES[id];
    return { id: id, itemId: r.itemId, jobId: r.jobId, rlvl: r.rlvl, name: CRAFT_ITEM_NAMES_TW[r.itemId] || ('道具#' + r.itemId) };
  });

  const JOBS = [
    { id: 0, name: '刻木匠' }, { id: 1, name: '鍛鐵匠' }, { id: 2, name: '鑄甲匠' },
    { id: 3, name: '雕金匠' }, { id: 4, name: '製革匠' }, { id: 5, name: '裁衣匠' },
    { id: 6, name: '鍊金術士' }, { id: 7, name: '烹調師' },
  ];

  let selectedRecipe = null;
  let worker = null;
  let lastCpMax = 0;
  let ingredientHqCounts = {}; // { itemId: 這個材料要用幾個HQ }
  let batchList = []; // [{recipeId, itemId, name, quantity}]
  let expandedItems = new Set(); // 玩家選「自己做」的材料itemId，這些會被遞迴展開成子材料需求
  const learnedSpecial = new Set(SPECIAL_ACTIONS.map(function (s) { return s.key; })); // 預設「有/想用」，遊戲規則不允許時會自動鎖住不能勾

  function numberField(id, value, step) {
    step = step || 1;
    return '<div class="craft-stepper">' +
      '<button type="button" class="craft-step-btn" data-target="' + id + '" data-dir="-1" data-step="' + step + '">−</button>' +
      '<input id="' + id + '" type="number" value="' + value + '" />' +
      '<button type="button" class="craft-step-btn" data-target="' + id + '" data-dir="1" data-step="' + step + '">＋</button>' +
      '</div>';
  }

  root.innerHTML =
    '<div class="craft-layout">' +
      '<div class="craft-col craft-col-left">' +
        '<div class="craft-card">' +
          '<div class="craft-row">' +
            '<select id="cf-job" class="craft-select"></select>' +
            '<div class="craft-lvl"><span>Lv</span>' + numberField('cf-lvl', 100, 1) + '</div>' +
            '<label class="craft-check-inline"><input id="cf-specialist" type="checkbox" />專家</label>' +
          '</div>' +
        '</div>' +
        '<div class="craft-card craft-stats-grid">' +
          '<div><label>作業精度</label>' + numberField('cf-craftsmanship', 4444, 10) + '<span id="cf-craftsmanship-delta" class="craft-delta"></span></div>' +
          '<div><label>加工精度</label>' + numberField('cf-control', 4444, 10) + '<span id="cf-control-delta" class="craft-delta"></span></div>' +
          '<div><label>CP</label>' + numberField('cf-cp', 888, 5) + '<span id="cf-cp-delta" class="craft-delta"></span></div>' +
        '</div>' +
        '<div class="craft-card craft-consumable-grid">' +
          '<div>' +
            '<div class="craft-row craft-row-tight"><span class="craft-label"><i class="ph ph-bowl-food"></i>食物</span><div class="craft-toggle" id="cf-food-tier"><button data-v="nq">NQ</button><button data-v="hq" class="active">HQ</button></div></div>' +
            '<select id="cf-food" class="craft-select craft-select-block"><option value="">不使用</option></select>' +
          '</div>' +
          '<div>' +
            '<div class="craft-row craft-row-tight"><span class="craft-label"><i class="ph ph-flask"></i>藥水</span><div class="craft-toggle" id="cf-pot-tier"><button data-v="nq">NQ</button><button data-v="hq" class="active">HQ</button></div></div>' +
            '<select id="cf-pot" class="craft-select craft-select-block"><option value="">不使用</option></select>' +
          '</div>' +
        '</div>' +
        '<div class="craft-card">' +
          '<span class="craft-label"><i class="ph ph-graduation-cap"></i>特殊技能確認</span>' +
          '<div id="cf-special-list" class="craft-special-list"></div>' +
        '</div>' +
      '</div>' +
      '<div class="craft-col craft-col-right">' +
        '<div class="craft-card craft-row">' +
          '<span class="craft-label">模式</span>' +
          '<div class="craft-toggle" id="cf-mode-toggle"><button data-v="auto" class="active">自動求解</button><button data-v="manual">手動操作</button></div>' +
        '</div>' +
        '<div class="craft-card">' +
          '<input id="cf-recipe-search" class="craft-search" placeholder="搜尋配方名稱⋯" autocomplete="off" />' +
          '<div id="cf-recipe-results" class="craft-recipe-results"></div>' +
          '<div id="cf-recipe-selected" class="craft-recipe-selected"></div>' +
          '<div id="cf-add-batch-wrap" style="display:none;margin-top:8px" class="craft-row">' +
            numberField('cf-batch-qty', 1, 1) +
            '<button id="cf-add-batch" type="button" style="margin-left:8px"><i class="ph ph-plus"></i>加入批次</button>' +
          '</div>' +
          '<div id="cf-ingredients" class="craft-ingredients"></div>' +
          '<div id="cf-material-graph" class="craft-material-graph"></div>' +
        '</div>' +
        '<div id="cf-batch-card" class="craft-card" style="display:none">' +
          '<div class="craft-row"><span class="craft-label"><i class="ph ph-stack"></i>批次清單</span><a href="#" id="cf-batch-clear" class="craft-link" style="margin-left:auto">清空</a></div>' +
          '<div id="cf-batch-list" class="craft-batch-list"></div>' +
          '<div class="craft-ingredients"><p class="craft-ingredients-title">整批訂單規劃　<span class="craft-muted">材料可選「自己做」往下展開，或維持採購</span></p><div id="cf-batch-materials"></div></div>' +
        '</div>' +
        '<div id="cf-auto-block">' +
          '<div class="craft-card craft-row">' +
            '<label class="craft-check-inline" style="margin-left:0"><input id="cf-collectable" type="checkbox" />收藏品模式</label>' +
            '<div id="cf-collectable-goal-wrap" style="display:none;margin-left:auto" class="craft-row"><span class="craft-label">目標收藏度</span>' + numberField('cf-collectable-goal', 100, 10) + '</div>' +
          '</div>' +
          '<button id="cf-solve" class="craft-solve-btn" disabled><i class="ph ph-play"></i>選擇配方後開始求解</button>' +
          '<div id="cf-progress" class="craft-progress" style="display:none"></div>' +
          '<div id="cf-result" class="craft-card craft-result" style="display:none"></div>' +
        '</div>' +
        '<div id="cf-manual-panel" class="craft-card" style="display:none">' +
          '<div class="craft-row" style="gap:20px">' +
            '<div style="flex:1"><div class="craft-bar-label"><span>耐久</span><span id="cf-m-dur-text">- / -</span></div><div id="cf-m-dur-blocks" style="display:flex;gap:3px"></div></div>' +
            '<div style="flex:1"><div class="craft-bar-label"><span>CP</span><span id="cf-m-cp-text">- / -</span></div><div class="craft-bar-track"><div id="cf-m-cp-bar" class="craft-bar-fill craft-fill-accent" style="width:100%"></div></div></div>' +
          '</div>' +
          '<div class="craft-bar-row" style="margin-top:10px"><div class="craft-bar-label"><span>進度</span><span id="cf-m-prog-text">- / -</span></div><div class="craft-bar-track"><div id="cf-m-prog-bar" class="craft-bar-fill craft-fill-accent" style="width:0%"></div></div></div>' +
          '<div class="craft-bar-row"><div class="craft-bar-label"><span>品質</span><span id="cf-m-qual-text">- / -</span></div><div class="craft-bar-track"><div id="cf-m-qual-bar" class="craft-bar-fill craft-fill-success" style="width:0%"></div></div></div>' +
          '<div class="craft-row" style="margin:10px 0"><div id="cf-m-sequence" style="display:flex;gap:5px;flex-wrap:wrap;flex:1"></div><button id="cf-m-undo" type="button"><i class="ph ph-arrow-u-up-left"></i>復原</button></div>' +
          '<div id="cf-m-skills" class="craft-manual-skills"></div>' +
          '<div class="craft-row" style="margin-top:10px;justify-content:flex-end"><button id="cf-m-continue" class="craft-solve-btn" style="width:auto;padding:0 16px"><i class="ph ph-magic-wand"></i>接續求解</button></div>' +
          '<div id="cf-m-result" style="margin-top:10px"></div>' +
        '</div>' +
      '</div>' +
    '</div>';

  const $ = function (id) { return document.getElementById(id); };

  $('cf-job').innerHTML = JOBS.map(function (j) { return '<option value="' + j.id + '">' + j.name + '</option>'; }).join('');

  /* ── 食物／藥水下拉，同一份資料依 type 分開填入 ── */
  const MEALS = Object.keys(CRAFT_FOODS).filter(function (id) { return CRAFT_FOODS[id].type === 'meal'; });
  const MEDICINES = Object.keys(CRAFT_FOODS).filter(function (id) { return CRAFT_FOODS[id].type === 'medicine'; });
  $('cf-food').innerHTML += MEALS.map(function (id) {
    return '<option value="' + id + '">' + CRAFT_FOODS[id].name + '</option>';
  }).join('');
  $('cf-pot').disabled = false;
  $('cf-pot').innerHTML = '<option value="">不使用</option>' + MEDICINES.map(function (id) {
    return '<option value="' + id + '">' + CRAFT_FOODS[id].name + '</option>';
  }).join('');

  /* ── 數字欄位的加減按鈕（取代原生 input[number] 的箭頭，風格統一成按鈕） ── */
  root.querySelectorAll('.craft-step-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const input = $(btn.dataset.target);
      const step = parseFloat(btn.dataset.step) * parseFloat(btn.dataset.dir);
      const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
      const max = input.max !== '' ? parseFloat(input.max) : Infinity;
      const next = Math.min(max, Math.max(min, (parseFloat(input.value) || 0) + step));
      input.value = next;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  $('cf-lvl').min = 1; $('cf-lvl').max = 100;

  /* ── 特殊技能確認：可不可以用，直接問模擬引擎本身，不自己重寫規則 ── */
  const ACTION_BY_KEY = {};
  simulator.CraftingActionsRegistry.ALL_ACTIONS.forEach(function (entry) {
    ACTION_BY_KEY[entry.action.constructor.name] = entry.action;
  });

  function specialActionAvailability(key) {
    const action = ACTION_BY_KEY[key];
    if (!action) return { available: false, reason: '技能資料異常' };
    const level = parseInt($('cf-lvl').value, 10) || 1;
    const req = action.getLevelRequirement();
    if (level < req.level) return { available: false, reason: '需求Lv' + req.level };
    if (key === 'TrainedEye' && !selectedRecipe) return { available: false, reason: '選擇配方後才能判斷' };

    const jobId = parseInt($('cf-job').value, 10);
    let dummyRecipe = { durability: 80, quality: 100, progress: 100, lvl: 1, rlvl: 1, ingredients: [], conditionsFlag: 15, progressDivider: 100, qualityDivider: 100, progressModifier: 100, qualityModifier: 100, expert: false };
    if (selectedRecipe) {
      const r = CRAFT_RECIPES[selectedRecipe.id];
      dummyRecipe = Object.assign({}, dummyRecipe, { lvl: r.lvl, rlvl: r.rlvl, expert: r.isExpert });
    }
    const stats = new simulator.CrafterStats(jobId, 1, 1, 1, $('cf-specialist').checked, false, level, [level, level, level, level, level, level, level, level]);
    const sim = new simulator.Simulation(dummyRecipe, [], stats);
    const ok = action.canBeUsed(sim, false);
    if (!ok) {
      if (key === 'TrainedEye') return { available: false, reason: '角色等級需比配方高10以上' };
      if (key === 'HeartAndSoul' || key === 'QuickInnovation') return { available: false, reason: '需先啟用專家' };
      return { available: false, reason: '目前條件不符' };
    }
    return { available: true };
  }

  function renderSpecialActions() {
    const box = $('cf-special-list');
    box.innerHTML = SPECIAL_ACTIONS.map(function (s) {
      const state = specialActionAvailability(s.key);
      const checked = state.available && learnedSpecial.has(s.key);
      return '<label class="craft-skill-item' + (state.available ? '' : ' craft-skill-locked') + '">' +
        '<input type="checkbox" data-special="' + s.key + '" ' + (checked ? 'checked' : '') + ' ' + (state.available ? '' : 'disabled') + ' />' +
        '<span>' + s.label + '</span>' +
        '<span class="craft-skill-lvl">' + (state.available ? s.note : state.reason) + '</span>' +
        '</label>';
    }).join('');
    box.querySelectorAll('[data-special]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked) learnedSpecial.add(cb.dataset.special); else learnedSpecial.delete(cb.dataset.special);
      });
    });
  }
  ['cf-job', 'cf-lvl', 'cf-specialist'].forEach(function (id) {
    $(id).addEventListener('input', renderSpecialActions);
    $(id).addEventListener('change', renderSpecialActions);
  });

  /* ── 食藥即時換算（用真正的公式，跟前面驗證過的一致） ── */
  function isHQ(toggleId) { return $(toggleId).querySelector('.active').dataset.v === 'hq'; }
  function recalcStats() {
    const craftsmanship = parseInt($('cf-craftsmanship').value, 10) || 0;
    const control = parseInt($('cf-control').value, 10) || 0;
    const cp = parseInt($('cf-cp').value, 10) || 0;
    const food = CRAFT_FOODS[$('cf-food').value];
    const pot = CRAFT_FOODS[$('cf-pot').value];
    const hqFood = isHQ('cf-food-tier');
    const hqPot = isHQ('cf-pot-tier');

    function bonusOf(entry, hq) {
      if (!entry) return null;
      return { percent: hq ? entry.percentHQ : entry.percent, cap: hq ? entry.capHQ : entry.cap };
    }
    const meal = food ? { craftsmanship: bonusOf(food.craftsmanship, hqFood), control: bonusOf(food.control, hqFood), cp: bonusOf(food.cp, hqFood) } : null;
    const medicine = pot ? { craftsmanship: bonusOf(pot.craftsmanship, hqPot), control: bonusOf(pot.control, hqPot), cp: bonusOf(pot.cp, hqPot) } : null;
    const final = CraftConsumables.computeFinalStats({ craftsmanship: craftsmanship, control: control, cp: cp }, meal, medicine);

    $('cf-craftsmanship-delta').textContent = final.breakdown.craftsmanshipBonus ? ('+' + final.breakdown.craftsmanshipBonus + ' → ' + final.craftsmanship.toLocaleString()) : '';
    $('cf-control-delta').textContent = final.breakdown.controlBonus ? ('+' + final.breakdown.controlBonus + ' → ' + final.control.toLocaleString()) : '';
    $('cf-cp-delta').textContent = final.breakdown.cpBonus ? ('+' + final.breakdown.cpBonus + ' → ' + final.cp.toLocaleString()) : '';
    return final;
  }
  ['cf-craftsmanship', 'cf-control', 'cf-cp', 'cf-food', 'cf-pot'].forEach(function (id) {
    $(id).addEventListener('input', recalcStats);
  });
  ['cf-food-tier', 'cf-pot-tier'].forEach(function (id) {
    $(id).querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $(id).querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        recalcStats();
      });
    });
  });

  /* ── 配方搜尋：不再截斷到20筆，滾動清單顯示所有符合結果 ── */
  $('cf-recipe-search').addEventListener('input', function (e) {
    const q = e.target.value.trim();
    const box = $('cf-recipe-results');
    if (!q) { box.innerHTML = ''; box.classList.remove('open'); return; }
    const matches = RECIPE_INDEX.filter(function (r) { return r.name.indexOf(q) !== -1; });
    box.innerHTML = matches.map(function (r) {
      return '<div class="craft-recipe-item craft-row" data-id="' + r.id + '">' + itemIconHtml(r.itemId, 22) + '<span>' + r.name + '</span> <span class="craft-muted">rlvl' + r.rlvl + '</span></div>';
    }).join('') || '<div class="craft-recipe-empty">找不到符合的配方</div>';
    box.classList.add('open');
    box.querySelectorAll('.craft-recipe-item').forEach(function (item) {
      item.addEventListener('click', function () {
        selectedRecipe = RECIPE_INDEX.find(function (r) { return r.id === item.dataset.id; });
        $('cf-recipe-search').value = selectedRecipe.name;
        box.innerHTML = ''; box.classList.remove('open');
        renderRecipeSelected();
        renderIngredients();
        renderMaterialGraph();
        renderSpecialActions();
        manualRotation = []; renderManual(); // 換配方，手動模式的操作進度歸零重來
        $('cf-solve').disabled = false;
        $('cf-solve').innerHTML = '<i class="ph ph-play"></i>開始求解';
      });
    });
  });

  function renderRecipeSelected() {
    const box = $('cf-recipe-selected');
    if (!selectedRecipe) { box.innerHTML = ''; $('cf-add-batch-wrap').style.display = 'none'; return; }
    const recipe = CRAFT_RECIPES[selectedRecipe.id];
    box.innerHTML = '<div class="craft-recipe-chip">' + selectedRecipe.name +
      '<span class="craft-muted">　需求Lv' + recipe.lvl + '・進展' + recipe.progress + '・品質' + recipe.quality + '・耐久' + recipe.durability + '</span></div>';
    $('cf-add-batch-wrap').style.display = 'flex';
  }

  /* ── 材料關聯圖譜索引：正向(誰能做出這個道具)／反向(這個道具被用在哪些配方裡) ──
   * 只建索引，不預先展開整棵樹（配方數量大，一路展開到底效能/畫面都會爆），
   * 改成「點一次展開一層」，玩家自己決定要查多深，也順便避開萬一資料有循環的問題。 */
  const ITEM_TO_RECIPES = {}; // itemId -> [recipeId]，這個道具可以用哪些配方做出來
  const ITEM_USED_IN = {}; // itemId -> [recipeId]，這個道具被用在哪些配方的材料裡
  Object.keys(CRAFT_RECIPES).forEach(function (rid) {
    const r = CRAFT_RECIPES[rid];
    (ITEM_TO_RECIPES[r.itemId] = ITEM_TO_RECIPES[r.itemId] || []).push(rid);
    r.ingredients.forEach(function (ing) {
      (ITEM_USED_IN[ing.itemId] = ITEM_USED_IN[ing.itemId] || []).push(rid);
    });
  });

  function itemName(itemId) { return CRAFT_ITEM_NAMES_TW[itemId] || ('道具#' + itemId); }

  /* 道具圖示：查得到就顯示真實遊戲圖示，查不到或載入失敗就顯示預設圖示，不會出現破圖 */
  function itemIconHtml(itemId, size) {
    size = size || 24;
    const url = typeof CRAFT_ITEM_ICONS !== 'undefined' ? CRAFT_ITEM_ICONS[itemId] : null;
    if (!url) return '<span class="craft-icon-fallback" style="width:' + size + 'px;height:' + size + 'px"><i class="ph ph-cube"></i></span>';
    return '<img class="craft-item-icon" src="' + url + '" width="' + size + '" height="' + size + '" loading="lazy" ' +
      'onerror="this.outerHTML=\'<span class=&quot;craft-icon-fallback&quot; style=&quot;width:' + size + 'px;height:' + size + 'px&quot;><i class=&quot;ph ph-cube&quot;></i></span>\'" />';
  }

  /* 產生一個材料節點的HTML：direction='down'(這個材料由什麼做成) 或 'up'(這個道具還能用在哪) */
  function materialNodeHtml(itemId, direction, seenPath) {
    const list = direction === 'down' ? (ITEM_TO_RECIPES[itemId] || []) : (ITEM_USED_IN[itemId] || []);
    const expandable = list.length > 0 && !CRYSTAL_ITEM_IDS.has(itemId);
    return '<div class="craft-mat-node" data-item="' + itemId + '" data-dir="' + direction + '" data-path="' + seenPath + '">' +
      '<div class="craft-mat-row">' +
        (expandable ? '<button type="button" class="craft-mat-toggle" data-item="' + itemId + '" data-dir="' + direction + '" data-path="' + seenPath + '">▸</button>' : '<span class="craft-mat-toggle-placeholder"></span>') +
        '<span class="craft-mat-name">' + itemIconHtml(itemId, 18) + itemName(itemId) + '</span>' +
        (list.length > 1 ? '<span class="craft-muted">' + list.length + ' 種做法／用途</span>' : '') +
      '</div>' +
      '<div class="craft-mat-children"></div>' +
    '</div>';
  }

  function expandMaterialNode(nodeEl) {
    const itemId = parseInt(nodeEl.dataset.item, 10);
    const direction = nodeEl.dataset.dir;
    const path = nodeEl.dataset.path; // 用逗號分隔的祖先itemId，防止循環展開
    const seen = path.split(',').filter(Boolean).map(Number);
    const childBox = nodeEl.querySelector('.craft-mat-children');
    const list = direction === 'down' ? (ITEM_TO_RECIPES[itemId] || []) : (ITEM_USED_IN[itemId] || []);

    childBox.innerHTML = list.slice(0, 15).map(function (rid) {
      const r = CRAFT_RECIPES[rid];
      if (direction === 'down') {
        // 往下：這個道具的配方用了哪些材料
        return '<div class="craft-mat-sub-label">配方材料：</div>' + r.ingredients.map(function (ing) {
          if (seen.indexOf(ing.itemId) !== -1) return '<div class="craft-mat-cycle">' + itemName(ing.itemId) + '（迴圈，不再展開）</div>';
          return materialNodeHtml(ing.itemId, 'down', path + ',' + itemId);
        }).join('');
      } else {
        // 往上：這個道具被用在哪個配方，該配方做出來的成品是什麼
        if (seen.indexOf(r.itemId) !== -1) return '<div class="craft-mat-cycle">' + itemName(r.itemId) + '（迴圈，不再展開）</div>';
        return materialNodeHtml(r.itemId, 'up', path + ',' + itemId);
      }
    }).join('') + (list.length > 15 ? '<div class="craft-muted">還有 ' + (list.length - 15) + ' 種，太多先不列出</div>' : '');

    childBox.classList.add('open');
    childBox.querySelectorAll('.craft-mat-toggle').forEach(bindToggle);
  }

  function bindToggle(btn) {
    btn.addEventListener('click', function () {
      const nodeEl = btn.closest('.craft-mat-node');
      const childBox = nodeEl.querySelector('.craft-mat-children');
      if (childBox.classList.contains('open')) {
        childBox.classList.remove('open');
        childBox.innerHTML = '';
        btn.textContent = '▸';
      } else {
        expandMaterialNode(nodeEl);
        btn.textContent = '▾';
      }
    });
  }


  function renderIngredients() {
    const box = $('cf-ingredients');
    if (!selectedRecipe) { box.innerHTML = ''; return; }
    const recipe = CRAFT_RECIPES[selectedRecipe.id];
    ingredientHqCounts = {};
    box.innerHTML = '<p class="craft-ingredients-title">材料 HQ 設定</p>' +
      recipe.ingredients.map(function (ing) {
        const name = CRAFT_ITEM_NAMES_TW[ing.itemId] || ('道具#' + ing.itemId);
        const isCrystal = CRYSTAL_ITEM_IDS.has(ing.itemId);
        if (isCrystal) {
          return '<div class="craft-ing-row">' +
            '<span class="craft-ing-name">' + itemIconHtml(ing.itemId, 20) + name + '</span>' +
            '<span class="craft-ing-fixed">NQ ×' + ing.amount + '</span>' +
            '</div>';
        }
        ingredientHqCounts[ing.itemId] = 0;
        return '<div class="craft-ing-row" data-item="' + ing.itemId + '" data-amount="' + ing.amount + '">' +
          '<span class="craft-ing-name">' + itemIconHtml(ing.itemId, 20) + name + '</span>' +
          '<div class="craft-ing-hq-control">' +
            '<button type="button" class="craft-step-btn" data-ing="' + ing.itemId + '" data-dir="-1">−</button>' +
            '<span class="craft-ing-split"><span class="craft-ing-nq">NQ ' + ing.amount + '</span>／<span class="craft-ing-hq">HQ 0</span></span>' +
            '<button type="button" class="craft-step-btn" data-ing="' + ing.itemId + '" data-dir="1">＋</button>' +
          '</div>' +
        '</div>';
      }).join('');

    box.querySelectorAll('[data-ing]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const itemId = parseInt(btn.dataset.ing, 10);
        const row = btn.closest('.craft-ing-row');
        const amount = parseInt(row.dataset.amount, 10);
        const dir = parseInt(btn.dataset.dir, 10);
        const next = Math.max(0, Math.min(amount, (ingredientHqCounts[itemId] || 0) + dir));
        ingredientHqCounts[itemId] = next;
        row.querySelector('.craft-ing-nq').textContent = 'NQ ' + (amount - next);
        row.querySelector('.craft-ing-hq').textContent = 'HQ ' + next;
      });
    });
  }

  function buildHqIngredients() {
    return Object.keys(ingredientHqCounts)
      .filter(function (id) { return ingredientHqCounts[id] > 0; })
      .map(function (id) { return { id: parseInt(id, 10), amount: ingredientHqCounts[id] }; });
  }

  function renderMaterialGraph() {
    const box = $('cf-material-graph');
    if (!selectedRecipe) { box.innerHTML = ''; return; }
    const recipe = CRAFT_RECIPES[selectedRecipe.id];
    const usedInCount = (ITEM_USED_IN[recipe.itemId] || []).length;
    box.innerHTML =
      '<p class="craft-ingredients-title">材料關聯圖譜　<span class="craft-muted">點展開可以一路往下／往上查</span></p>' +
      '<div class="craft-mat-section-label">▾ 材料還能再往下拆的（可製作的材料才會有展開鈕）</div>' +
      recipe.ingredients.map(function (ing) { return materialNodeHtml(ing.itemId, 'down', ''); }).join('') +
      (usedInCount > 0
        ? '<div class="craft-mat-section-label" style="margin-top:10px">▾ 這個成品還能用在哪</div>' + materialNodeHtml(recipe.itemId, 'up', '')
        : '<p class="craft-muted" style="margin-top:10px">這個成品目前查不到被用在其他配方裡（可能是終端道具）</p>');
    box.querySelectorAll('.craft-mat-toggle').forEach(bindToggle);
  }

  /* ── 批量規劃：加入批次清單、彙總材料需求（直接材料，未遞迴展開子配方） ── */
  function renderBatch() {
    const card = $('cf-batch-card');
    if (batchList.length === 0) { card.style.display = 'none'; return; }
    card.style.display = 'block';

    $('cf-batch-list').innerHTML = batchList.map(function (b, i) {
      return '<div class="craft-ing-row" data-idx="' + i + '">' +
        '<span class="craft-ing-name">' + b.name + '</span>' +
        '<div class="craft-ing-hq-control">' +
          '<button type="button" class="craft-step-btn" data-batch-idx="' + i + '" data-dir="-1">−</button>' +
          '<span class="craft-ing-split" style="min-width:30px">×' + b.quantity + '</span>' +
          '<button type="button" class="craft-step-btn" data-batch-idx="' + i + '" data-dir="1">＋</button>' +
          '<button type="button" class="craft-copy-btn" data-batch-remove="' + i + '" style="margin-left:6px"><i class="ph ph-x"></i></button>' +
        '</div>' +
      '</div>';
    }).join('');

    $('cf-batch-list').querySelectorAll('[data-batch-idx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const idx = parseInt(btn.dataset.batchIdx, 10);
        const dir = parseInt(btn.dataset.dir, 10);
        batchList[idx].quantity = Math.max(1, batchList[idx].quantity + dir);
        renderBatch();
      });
    });
    $('cf-batch-list').querySelectorAll('[data-batch-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        batchList.splice(parseInt(btn.dataset.batchRemove, 10), 1);
        renderBatch();
      });
    });

    /* 整批訂單規劃：從批次清單出發，遇到玩家選「自己做」的材料就往下展開它自己的配方，
     * 一路展開到底（用 ITEM_TO_RECIPES 找該道具的配方，數量除以 yields 無條件進位算出要做幾次），
     * 沒選「自己做」的材料就當作要用買的，停在那一層不再往下。
     * seen 用來防循環（正常遊戲資料不該有循環，但防呆一下），craftCounts 記錄中間材料各要做幾次。 */
    const buyTotals = {}; // itemId -> 要採購的總數量
    const craftCounts = {}; // itemId -> 要製作幾次（次數，不是數量；一次可能產出多個）

    function expand(itemId, amount, seen) {
      if (seen.has(itemId) || seen.size > 12) { buyTotals[itemId] = (buyTotals[itemId] || 0) + amount; return; }
      const recipeIds = ITEM_TO_RECIPES[itemId];
      if (!expandedItems.has(itemId) || !recipeIds || !recipeIds.length) {
        buyTotals[itemId] = (buyTotals[itemId] || 0) + amount;
        return;
      }
      const recipe = CRAFT_RECIPES[recipeIds[0]]; // 同一道具多種做法時先取第一種
      const yields = recipe.yields || 1;
      const crafts = Math.ceil(amount / yields);
      craftCounts[itemId] = (craftCounts[itemId] || 0) + crafts;
      const nextSeen = new Set(seen); nextSeen.add(itemId);
      recipe.ingredients.forEach(function (ing) {
        expand(ing.itemId, ing.amount * crafts, nextSeen);
      });
    }

    batchList.forEach(function (b) {
      const recipe = CRAFT_RECIPES[b.recipeId];
      recipe.ingredients.forEach(function (ing) {
        expand(ing.itemId, ing.amount * b.quantity, new Set());
      });
    });

    const rows = Object.keys(buyTotals).map(function (itemId) {
      return { itemId: itemId, amount: buyTotals[itemId], name: itemName(itemId), craftable: !!(ITEM_TO_RECIPES[itemId] && ITEM_TO_RECIPES[itemId].length) };
    }).sort(function (a, b) { return b.amount - a.amount; });

    const craftRows = Object.keys(craftCounts).map(function (itemId) {
      return { itemId: itemId, times: craftCounts[itemId], name: itemName(itemId) };
    });

    $('cf-batch-materials').innerHTML =
      (craftRows.length ? '<p class="craft-mat-section-label">▾ 需要自己額外製作</p>' +
        craftRows.map(function (r) { return '<div class="craft-ing-row"><span class="craft-ing-name">' + r.name + '</span><span class="craft-row" style="gap:8px"><span class="craft-muted">製作 ' + r.times + ' 次</span><button type="button" class="craft-copy-btn" data-collapse-toggle="' + r.itemId + '">改採購</button></span></div>'; }).join('') +
        '<p class="craft-mat-section-label" style="margin-top:8px">▾ 需要採購</p>' : '') +
      (rows.map(function (r) {
        const toggle = r.craftable
          ? '<button type="button" class="craft-copy-btn" data-expand-toggle="' + r.itemId + '">自己做</button>'
          : '<span class="craft-muted" style="font-size:10px">不可製作</span>';
        return '<div class="craft-ing-row"><span class="craft-ing-name">' + r.name + '</span><span class="craft-row" style="gap:8px"><span class="craft-muted">×' + r.amount.toLocaleString() + '</span>' + toggle + '</span></div>';
      }).join('') || '<p class="craft-muted">批次是空的</p>');

    $('cf-batch-materials').querySelectorAll('[data-expand-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        expandedItems.add(parseInt(btn.dataset.expandToggle, 10));
        renderBatch();
      });
    });
    $('cf-batch-materials').querySelectorAll('[data-collapse-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        expandedItems.delete(parseInt(btn.dataset.collapseToggle, 10));
        renderBatch();
      });
    });
  }

  $('cf-add-batch').addEventListener('click', function () {
    if (!selectedRecipe) return;
    const recipe = CRAFT_RECIPES[selectedRecipe.id];
    const qty = parseInt($('cf-batch-qty').value, 10) || 1;
    const existing = batchList.find(function (b) { return b.recipeId === selectedRecipe.id; });
    if (existing) existing.quantity += qty;
    else batchList.push({ recipeId: selectedRecipe.id, itemId: recipe.itemId, name: selectedRecipe.name, quantity: qty });
    renderBatch();
  });
  $('cf-batch-clear').addEventListener('click', function (e) {
    e.preventDefault();
    batchList = [];
    renderBatch();
  });


  /* ── 手動操作模式 ── */
  let manualRotation = [];

  $('cf-mode-toggle').querySelectorAll('button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $('cf-mode-toggle').querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      const manual = btn.dataset.v === 'manual';
      $('cf-auto-block').style.display = manual ? 'none' : 'block';
      $('cf-manual-panel').style.display = manual ? 'block' : 'none';
      if (manual) { manualRotation = []; renderManual(); }
    });
  });

  function currentStatsForManual() {
    const final = recalcStats();
    return {
      jobId: parseInt($('cf-job').value, 10),
      craftsmanship: final.craftsmanship,
      control: final.control,
      cp: final.cp,
      level: parseInt($('cf-lvl').value, 10) || 1,
      specialist: $('cf-specialist').checked,
    };
  }

  function manualAvailableActions(stats) {
    const excludedKeys = SPECIAL_ACTIONS.filter(function (s) { return !learnedSpecial.has(s.key); }).map(function (s) { return s.key; });
    return simulator.CraftingActionsRegistry.ALL_ACTIONS
      .map(function (e) { return e.action; })
      .filter(function (a) { return a.constructor.name !== 'RemoveFinalAppraisal' && excludedKeys.indexOf(a.constructor.name) === -1; })
      .filter(function (a) { const req = a.getLevelRequirement(); return stats.level >= req.level; });
  }

  function renderManual() {
    if (!selectedRecipe) {
      $('cf-manual-skills').innerHTML = '<p class="craft-muted">請先在上方搜尋並選擇配方</p>';
      return;
    }
    const recipe = CRAFT_RECIPES[selectedRecipe.id];
    const stats = currentStatsForManual();
    const crafterStats = new simulator.CrafterStats(stats.jobId, stats.craftsmanship, stats.control, stats.cp, stats.specialist, false, stats.level, [stats.level, stats.level, stats.level, stats.level, stats.level, stats.level, stats.level, stats.level]);
    const hqIngredients = buildHqIngredients();
    const sim = new simulator.Simulation(
      { id: selectedRecipe.id, job: recipe.jobId, rlvl: recipe.rlvl, durability: recipe.durability, quality: recipe.quality, progress: recipe.progress, lvl: recipe.lvl, stars: recipe.stars || 0, hq: 0, expert: !!recipe.isExpert,
        ingredients: recipe.ingredients.map(function (ing) { return { id: ing.itemId, amount: ing.amount, quality: ing.quality || 0 }; }),
        conditionsFlag: recipe.conditionsFlag, progressDivider: recipe.progressDivider, qualityDivider: recipe.qualityDivider, progressModifier: recipe.progressModifier, qualityModifier: recipe.qualityModifier, requiredQuality: recipe.requiredQuality || 0 },
      manualRotation, crafterStats, hqIngredients
    );
    sim.run(false, undefined, true); // safeMode=true：手動模式一樣預設用保守成功率判斷技能能不能用

    const durPct = recipe.durability ? sim.durability / recipe.durability : 0;
    const durColor = durPct <= 0.15 ? 'var(--gold)' : durPct <= 0.4 ? 'var(--gold)' : '#6fa8dc';
    $('cf-m-dur-text').textContent = sim.durability + ' / ' + recipe.durability;
    const segs = 4, per = recipe.durability / segs;
    $('cf-m-dur-blocks').innerHTML = Array.from({ length: segs }).map(function (_, i) {
      const remain = Math.max(0, Math.min(per, sim.durability - i * per));
      return '<div style="flex:1;height:14px;border-radius:3px;background:' + (remain > 0 ? durColor : 'rgba(255,255,255,0.06)') + '"></div>';
    }).join('');
    $('cf-m-cp-text').textContent = sim.availableCP + ' / ' + stats.cp;
    $('cf-m-cp-bar').style.width = Math.max(0, (sim.availableCP / stats.cp) * 100) + '%';
    $('cf-m-prog-text').textContent = Math.min(sim.progression, recipe.progress) + ' / ' + recipe.progress;
    $('cf-m-prog-bar').style.width = Math.min(100, (sim.progression / recipe.progress) * 100) + '%';
    $('cf-m-qual-text').textContent = Math.min(sim.quality, recipe.quality) + ' / ' + recipe.quality;
    $('cf-m-qual-bar').style.width = Math.min(100, (sim.quality / recipe.quality) * 100) + '%';

    $('cf-m-sequence').innerHTML = manualRotation.map(function (a) {
      const n = MANUAL_ACTION_NAMES && MANUAL_ACTION_NAMES[a.constructor.name];
      return '<span style="font-size:11px;background:var(--surface-1,rgba(255,255,255,.05));border:1px solid var(--tb);border-radius:6px;padding:2px 8px">' + (n ? n.tw : a.constructor.name) + '</span>';
    }).join('') || '<span class="craft-muted" style="font-size:12px">尚未選擇技能</span>';

    const actions = manualAvailableActions(stats);
    $('cf-m-skills').innerHTML = actions.map(function (a) {
      let usable = false;
      try { usable = a.canBeUsed(sim, false, true); } catch (e) { usable = false; }
      const n = MANUAL_ACTION_NAMES && MANUAL_ACTION_NAMES[a.constructor.name];
      const label = n ? n.tw : a.constructor.name;
      return '<button type="button" data-key="' + a.constructor.name + '" ' + (usable ? '' : 'disabled') + ' style="' + (usable ? '' : 'opacity:.35') + '">' + label + '</button>';
    }).join('');
    $('cf-m-skills').querySelectorAll('[data-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const action = actions.find(function (a) { return a.constructor.name === btn.dataset.key; });
        if (action) { manualRotation = manualRotation.concat([action]); renderManual(); }
      });
    });
  }

  $('cf-m-undo').addEventListener('click', function () {
    manualRotation = manualRotation.slice(0, -1);
    renderManual();
  });

  $('cf-m-continue').addEventListener('click', function () {
    if (!selectedRecipe) return;
    const btn = $('cf-m-continue');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner craft-spin"></i>求解中⋯';
    const stats = currentStatsForManual();
    if (!worker) worker = new Worker('js/craft-worker.js');
    const requestId = Date.now();
    // 接續求解：把目前手動選過的步驟當固定前綴傳給 Worker，讓它接著算剩下的部分並直接回傳完整巨集
    function onMsg(e) {
      if (e.data.requestId !== requestId || e.data.type === 'solve-progress') return;
      worker.removeEventListener('message', onMsg);
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-magic-wand"></i>接續求解';
      if (!e.data.ok) { $('cf-m-result').innerHTML = '<p class="craft-error">求解失敗：' + e.data.error + '</p>'; return; }
      $('cf-m-result').innerHTML = '<pre class="craft-macro">' + (e.data.result.macroSegments || []).map(function (s) { return s.join('\n'); }).join('\n') + '</pre>';
    }
    worker.addEventListener('message', onMsg);
    worker.postMessage({
      type: 'solve', requestId: requestId, recipeId: selectedRecipe.id, stats: stats,
      options: { lang: 'tw', trials: 3, populationSize: 150, generations: 40, hqIngredients: buildHqIngredients(), fixedPrefix: manualRotation.map(function (a) { return a.constructor.name; }) },
    });
  });


  $('cf-solve').addEventListener('click', function () {
    if (!selectedRecipe) return;
    const btn = $('cf-solve');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner craft-spin"></i>求解中⋯';
    $('cf-result').style.display = 'none';

    const final = recalcStats();
    const excludedActions = SPECIAL_ACTIONS.filter(function (s) {
      const state = specialActionAvailability(s.key);
      return !(state.available && learnedSpecial.has(s.key));
    }).map(function (s) { return s.key; });
    const stats = {
      jobId: parseInt($('cf-job').value, 10),
      craftsmanship: final.craftsmanship,
      control: final.control,
      cp: final.cp,
      level: parseInt($('cf-lvl').value, 10) || 1,
      specialist: $('cf-specialist').checked,
      relicTool: false,
      excludedActions: excludedActions,
    };

    if (!worker) {
      worker = new Worker('js/craft-worker.js');
      worker.addEventListener('error', function (err) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-play"></i>開始求解';
        $('cf-progress').style.display = 'none';
        $('cf-result').style.display = 'block';
        $('cf-result').innerHTML = '<p class="craft-error">求解引擎載入失敗：' + (err.message || '未知錯誤') +
          '。若是直接雙擊開啟本機檔案測試，瀏覽器會封鎖 Worker，請改用本機伺服器（例如 <code>python -m http.server</code>）開啟。</p>';
      });
    }
    lastCpMax = stats.cp;
    const requestId = Date.now();
    $('cf-progress').style.display = 'block';
    $('cf-progress').textContent = '求解中⋯';
    function onMsg(e) {
      if (e.data.requestId !== requestId) return;
      if (e.data.type === 'solve-progress') {
        const p = e.data.progress;
        const metric = p.bestCollectability != null ? ('收藏度 ' + p.bestCollectability) : ('優質率約 ' + Math.round(p.bestHqPercent) + '%');
        $('cf-progress').textContent =
          '求解中⋯ 第 ' + p.trial + '/' + p.totalTrials + ' 輪・第 ' + p.generation + '/' + p.totalGenerations + ' 代' +
          '　目前最佳：' + (p.bestSuccess ? '✓ 已達成・' : '尚未達成・') + metric + '・' + p.bestSteps + ' 步';
        return;
      }
      worker.removeEventListener('message', onMsg);
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-play"></i>開始求解';
      $('cf-progress').style.display = 'none';
      if (!e.data.ok) {
        $('cf-result').style.display = 'block';
        $('cf-result').innerHTML = '<p class="craft-error">求解失敗：' + e.data.error + '</p>';
        return;
      }
      renderResult(e.data.craft, e.data.result);
    }
    worker.addEventListener('message', onMsg);
    const collectableGoal = $('cf-collectable').checked ? (parseInt($('cf-collectable-goal').value, 10) || 100) : null;
    worker.postMessage({ type: 'solve', requestId: requestId, recipeId: selectedRecipe.id, stats: stats, options: { lang: 'tw', trials: 3, populationSize: 150, generations: 40, hqIngredients: buildHqIngredients(), collectableGoal: collectableGoal } });
  });

  function bar(label, cur, max, cls) {
    const pct = max ? Math.min(100, Math.round(cur / max * 100)) : 0;
    return '<div class="craft-bar-row"><div class="craft-bar-label"><span>' + label + '</span><span>' + cur.toLocaleString() + ' / ' + max.toLocaleString() + '</span></div>' +
      '<div class="craft-bar-track"><div class="craft-bar-fill ' + cls + '" style="width:' + pct + '%"></div></div></div>';
  }

  function renderResult(craft, result) {
    const box = $('cf-result');
    box.style.display = 'block';
    const statusClass = result.success ? 'craft-status-ok' : 'craft-status-fail';
    box.innerHTML =
      '<div class="craft-result-split">' +
        '<div class="craft-result-col">' +
          bar('進度', Math.min(result.progression, craft.progress), craft.progress, 'craft-fill-accent') +
          bar('耐久', result.durabilityLeft, craft.durability, 'craft-fill-warning') +
        '</div>' +
        '<div class="craft-result-col">' +
          bar('品質', Math.min(result.quality, craft.quality), craft.quality, 'craft-fill-success') +
          bar('CP 剩餘', result.cpLeft, lastCpMax || result.cpLeft, 'craft-fill-accent') +
        '</div>' +
      '</div>' +
      '<div class="craft-hq-line ' + statusClass + '">' + (result.success ? '✓ 成功' : '✕ 未達成（已盡量算出完成度最高的手法，但這組數值/技能組合湊不到 100% 進度）') + '・' + (result.collectability != null ? '收藏度 ' + result.collectability : '優質率約 ' + Math.round(result.hqPercent) + '%') + '・' + result.steps + ' 步</div>' +
      (result.success ? (
        '<div class="craft-macro-head"><span class="craft-muted">巨集（繁中，可直接貼入遊戲）</span><button id="cf-copy" class="craft-copy-btn"><i class="ph ph-copy"></i>複製</button></div>' +
        (result.macroSegments || []).map(function (seg, i) {
          return '<pre class="craft-macro">' + (result.macroSegments.length > 1 ? '― 第' + (i + 1) + '段 ―\n' : '') + seg.join('\n') + '</pre>';
        }).join('')
      ) : '');

    if (result.success) {
      $('cf-copy').addEventListener('click', function () {
        const text = (result.macroSegments || []).map(function (seg) { return seg.join('\n'); }).join('\n\n');
        navigator.clipboard.writeText(text);
        $('cf-copy').innerHTML = '<i class="ph ph-check"></i>已複製';
        setTimeout(function () { $('cf-copy').innerHTML = '<i class="ph ph-copy"></i>複製'; }, 1500);
      });
    }
  }

  $('cf-collectable').addEventListener('change', function () {
    $('cf-collectable-goal-wrap').style.display = $('cf-collectable').checked ? 'flex' : 'none';
  });

  recalcStats();
  renderSpecialActions();

  /* ── 記憶功能：角色數值/職業/食藥選擇存在瀏覽器本機，下次開啟自動帶入 ──
   * 只存在使用者自己的瀏覽器裡，不會上傳到任何地方，換瀏覽器/清快取就會不見。 */
  const PROFILE_KEY = 'ffxivCraftProfile.v1';

  function saveProfile() {
    try {
      const profile = {
        job: $('cf-job').value,
        lvl: $('cf-lvl').value,
        craftsmanship: $('cf-craftsmanship').value,
        control: $('cf-control').value,
        cp: $('cf-cp').value,
        specialist: $('cf-specialist').checked,
        food: $('cf-food').value,
        foodHQ: isHQ('cf-food-tier'),
        pot: $('cf-pot').value,
        potHQ: isHQ('cf-pot-tier'),
        learnedSpecial: Array.from(learnedSpecial),
      };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch (e) { /* 本機儲存被封鎖(例如無痕模式)就算了，不影響其他功能 */ }
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.job != null) $('cf-job').value = p.job;
      if (p.lvl != null) $('cf-lvl').value = p.lvl;
      if (p.craftsmanship != null) $('cf-craftsmanship').value = p.craftsmanship;
      if (p.control != null) $('cf-control').value = p.control;
      if (p.cp != null) $('cf-cp').value = p.cp;
      $('cf-specialist').checked = !!p.specialist;
      if (p.food != null) $('cf-food').value = p.food;
      if (p.pot != null) $('cf-pot').value = p.pot;
      if (p.foodHQ === false) { $('cf-food-tier').querySelector('[data-v="nq"]').click(); }
      if (p.potHQ === false) { $('cf-pot-tier').querySelector('[data-v="nq"]').click(); }
      if (Array.isArray(p.learnedSpecial)) {
        learnedSpecial.clear();
        p.learnedSpecial.forEach(function (k) { learnedSpecial.add(k); });
      }
      recalcStats();
      renderSpecialActions();
    } catch (e) { /* 存壞的資料就當作沒有，不要讓整個介面掛掉 */ }
  }

  root.addEventListener('input', saveProfile);
  root.addEventListener('change', saveProfile);
  loadProfile();
};
