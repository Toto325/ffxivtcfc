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
/* 製作狀態（StepState）對照表：中文用詞跟顏色都是照玩家提供的遊戲內實際畫面截圖核對過的，
 * 不是憑印象猜的翻譯。ROBUST（頑強，只會在超稀有情況下接在「吉兆」前面觸發到「結實」）
 * 玩家截圖裡沒有出現這個狀態球，暫時沒有能核對的來源，所以先留言標記、用回英文鍵名顯示，
 * 不要為了填滿表格硬猜一個可能是錯的中文詞——這正是這次要修的問題，不能在修的過程中又犯一次。 */
var CONDITION_META = {
  NORMAL:    { label: '普通',   cls: 'cond-normal' },
  GOOD:      { label: '高品質', cls: 'cond-good' },
  EXCELLENT: { label: '最高品質', cls: 'cond-excellent' },
  POOR:      { label: '低品質', cls: 'cond-poor' },
  CENTERED:  { label: '安定',   cls: 'cond-special' },
  STURDY:    { label: '結實',   cls: 'cond-special' },
  PLIANT:    { label: '高效',   cls: 'cond-special' },
  MALLEABLE: { label: '高進度', cls: 'cond-special' },
  PRIMED:    { label: '蓄力',   cls: 'cond-special' },
  GOOD_OMEN: { label: '吉兆',   cls: 'cond-special' },
  ROBUST:    { label: 'ROBUST（用詞待確認）', cls: 'cond-special' },
};
function conditionMeta(stepStateValue) {
  const key = Object.keys(simulator.StepState).find(function (k) { return simulator.StepState[k] === stepStateValue; });
  return CONDITION_META[key] || CONDITION_META.NORMAL;
}

var SPECIAL_ACTIONS = [
  { key: 'Manipulation', label: '掌握', note: '需另外解任務學習' },
  { key: 'HeartAndSoul', label: '專心致志', note: '需啟用專家，限用一次' },
  { key: 'QuickInnovation', label: '快速改革', note: '需啟用專家，限用一次' },
  { key: 'TrainedEye', label: '工匠的神速技巧', note: '角色等級需比配方高10以上，僅限首步' },
  /* 宇宙穩手／奇蹟之材：不是一般配方製作會用到的技能，是「宇宙探索」任務專用的製作技能，
   * 跟一般8個生產職配方完全是不同的遊戲模式，所以求解一般配方、手動求解一般配方時都不該預設可用。
   * 語言表判斷（有沒有tw欄位）只是拿來輔助發現這兩個的線索，不是真正的原因，備註直接寫清楚用途最準確。 */
  { key: 'MaterialMiracle', label: '奇蹟之材', note: '宇宙探索任務專用', defaultOff: true },
  { key: 'StellarSteadyHand', label: '宇宙穩手', note: '宇宙探索任務專用', defaultOff: true },
];

/* 水/風/地/雷/火/冰的水晶系列（碎晶/水晶/晶簇），道具ID 2-19，自2.0版至今固定沒變過。
 * 這類材料遊戲裡沒有HQ版本，介面上要整排鎖住只能選NQ，不是我們忘記給選項。 */
var CRYSTAL_ITEM_IDS = new Set([2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]);

app.buildCraft = function () {
  const root = document.getElementById('craft-root');
  if (!root) return;

  root.innerHTML =
    '<div class="craft-loading"><span class="craft-loading-icon">⚒</span><span>載入配方資料中⋯</span></div>';

  const need = ['js/vendor/ffxiv-simulator.umd.js', 'js/craft-data.js', 'js/craft-icons.js', 'js/craft-action-icons.js', 'js/craft-action-names.js', 'js/craft-action-effects.js'];
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
  const MANUAL_ACTION_ICONS = {};
  simulator.CraftingActionsRegistry.ALL_ACTIONS.forEach(function (entry) {
    const ids = entry.action.getIds().filter(function (id) { return id > 0; });
    const found = ids.map(function (id) { return CRAFT_ACTION_NAMES_BY_GAME_ID[id]; }).find(Boolean);
    if (found) MANUAL_ACTION_NAMES[entry.name] = found;
    const icon = ids.map(function (id) { return CRAFT_ACTION_ICONS_BY_GAME_ID[id]; }).find(Boolean);
    if (icon) MANUAL_ACTION_ICONS[entry.name] = icon;
  });

  /* 技能圖示HTML：跟itemIconHtml同一套視覺邏輯，查不到真實圖示就用清楚可見的預設方塊，不會是空的 */
  function actionIconHtml(actionKey, size) {
    const url = MANUAL_ACTION_ICONS[actionKey];
    if (url) return '<img src="' + url + '" width="' + size + '" height="' + size + '" class="craft-item-icon" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'craft-icon-fallback\',style:\'width:' + size + 'px;height:' + size + 'px\',innerHTML:\'<i class=&quot;ph ph-sword&quot;></i>\'}))" />';
    return '<span class="craft-icon-fallback" style="width:' + size + 'px;height:' + size + 'px"><i class="ph ph-sword"></i></span>';
  }

  /* ── 配方搜尋索引：配方 id -> 道具名稱，只建一次 ── */
  const RECIPE_INDEX = Object.keys(CRAFT_RECIPES).map(function (id) {
    const r = CRAFT_RECIPES[id];
    return { id: id, itemId: r.itemId, jobId: r.jobId, lvl: r.lvl, rlvl: r.rlvl, name: CRAFT_ITEM_NAMES_TW[r.itemId] || ('道具#' + r.itemId) };
  });

  const JOBS = [
    { id: 0, name: '木工師' }, { id: 1, name: '鍛造師' }, { id: 2, name: '甲冑師' },
    { id: 3, name: '金工師' }, { id: 4, name: '皮革師' }, { id: 5, name: '裁縫師' },
    { id: 6, name: '鍊金術師' }, { id: 7, name: '烹調師' },
  ];
  const JOB_NAME_BY_ID = {};
  JOBS.forEach(function (j) { JOB_NAME_BY_ID[j.id] = j.name; });

  let selectedRecipe = null;
  /* 求解對象切換歷史：跟瀏覽器上一頁/下一頁同一個概念。每次選一個新配方就記一筆，
   * 用 solveHistoryIndex 指到目前在歷史裡的哪一格；按上一個/下一個只移動指標，不會重新推入新記錄，
   * 也不會清掉後面的記錄，直到玩家自己又手動選了別的配方（這時才截斷、蓋掉原本「未來」的那段，
   * 行為跟瀏覽器歷史一致）。 */
  let solveHistory = [];
  let solveHistoryIndex = -1;
  let solveNavMode = 'history'; // 'history'=瀏覽紀錄／'batch'=批次順序，求解主界面上的上一個/下一個導覽現在切哪一套資料
  let worker = null;
  let lastCpMax = 0;
  let ingredientHqCounts = {}; // { itemId: 這個材料要用幾個HQ }
  let batchList = []; // [{recipeId, itemId, name, quantity}]
  let batchSeqIndex = -1; // 「依序求解」目前巡覽到批次清單的第幾項；-1代表沒有在巡覽狀態
  let expandedItems = new Set(); // 玩家選「自己做」的材料itemId，這些會被遞迴展開成子材料需求
  const learnedSpecial = new Set(SPECIAL_ACTIONS.filter(function (s) { return !s.defaultOff; }).map(function (s) { return s.key; })); // 預設「有/想用」，遊戲規則不允許時會自動鎖住不能勾；標了defaultOff的（例如繁中服還沒實裝的技能）預設不勾，要玩家自己確認手上真的有才打開

  function numberField(id, value, step) {
    step = step || 1;
    return '<div class="craft-stepper">' +
      '<button type="button" class="craft-step-btn" data-target="' + id + '" data-dir="-1" data-step="' + step + '">−</button>' +
      '<input id="' + id + '" type="number" value="' + value + '" />' +
      '<button type="button" class="craft-step-btn" data-target="' + id + '" data-dir="1" data-step="' + step + '">+</button>' +
      '</div>';
  }

  root.innerHTML =
    '<div class="craft-layout">' +
      '<div class="craft-col craft-col-left">' +
        '<div class="craft-card">' +
          '<div class="craft-row craft-job-row">' +
            '<span id="cf-job-wrap" style="display:none"><select id="cf-job" class="craft-select"></select></span>' +
            '<div class="craft-lvl"><span>Lv</span>' + numberField('cf-lvl', 100, 1) + '</div>' +
            '<label class="craft-check-inline craft-check-specialist"><input id="cf-specialist" type="checkbox" />專家</label>' +
          '</div>' +
          '<div class="craft-row" style="align-items:flex-start">' +
            '<label class="craft-check-inline craft-profile-toggle"><input id="cf-profile-mode" type="checkbox" />使用個人設定檔</label>' +
            '<button type="button" id="cf-profile-manage-btn" class="craft-link" style="margin-left:auto;display:none">管理全部職業 <i class="ph ph-caret-down"></i></button>' +
          '</div>' +
          '<p id="cf-profile-hint-off" class="craft-hint">若需分別記錄不同職業的進度，可勾選個人設定檔。</p>' +
          '<p id="cf-profile-hint-on" class="craft-hint" style="display:none">切換職業自動套用該職業的數值與可製作清單。</p>' +
          '<div id="cf-profile-manager" class="craft-profile-manager" style="display:none"></div>' +
        '</div>' +
        '<div class="craft-card craft-stats-grid">' +
          /* 原本上面選了「木工師」，下面數值就長得很像「這是木工師的數值」，但自由輸入模式其實數值是共用的，
           * 跟上面選哪個職業無關，容易搞混。加一條跟數值黏在一起的狀態列，講清楚現在這組數值的歸屬。 */
          '<div id="cf-stats-scope-tag" class="craft-stats-scope-tag"></div>' +
          '<div><label>作業精度</label>' + numberField('cf-craftsmanship', 4444, 10) + '</div>' +
          '<div><label>加工精度</label>' + numberField('cf-control', 4444, 10) + '</div>' +
          '<div><label>CP</label>' + numberField('cf-cp', 888, 5) + '</div>' +
          '<div id="cf-consumable-summary" class="craft-consumable-summary"></div>' +
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
          '<div class="craft-toggle" id="cf-mode-toggle"><button data-v="auto" class="active">自動求解</button><button data-v="manual">手動求解</button></div>' +
        '</div>' +
        '<div class="craft-card">' +
          '<div class="craft-filter-row">' +
            '<div id="cf-job-filter" class="craft-job-filter"></div>' +
            '<div class="craft-lvl-filter">' +
              '<span class="craft-label">Lv</span>' +
              '<input id="cf-filter-lvl-min" type="number" class="craft-filter-lvl-input" placeholder="最低" min="1" max="100" />' +
              '<span class="craft-muted">～</span>' +
              '<input id="cf-filter-lvl-max" type="number" class="craft-filter-lvl-input" placeholder="最高" min="1" max="100" />' +
            '</div>' +
          '</div>' +
          '<input id="cf-recipe-search" class="craft-search" placeholder="搜尋配方名稱⋯" autocomplete="off" />' +
          '<div id="cf-recipe-results" class="craft-recipe-results"></div>' +
          '<div id="cf-recipe-selected" class="craft-recipe-selected"></div>' +
          '<div id="cf-add-batch-wrap" style="display:none" class="craft-add-batch-box">' +
            '<div class="craft-row">' +
              numberField('cf-batch-qty', 1, 1) +
              '<button id="cf-add-batch" type="button" class="craft-copy-btn" style="margin-left:8px"><i class="ph ph-plus"></i>加入批次規劃</button>' +
              '<span class="craft-add-batch-caption"><i class="ph ph-arrow-bend-right-down"></i>只加進規劃清單，不影響下面求解</span>' +
            '</div>' +
            '<p id="cf-add-batch-confirm" class="craft-add-batch-confirm"></p>' +
          '</div>' +
          '<div id="cf-ingredients" class="craft-ingredients"></div>' +
        '</div>' +
        /* 求解區塊緊接在「選配方＋設定材料HQ」後面，主流程到這裡就結束，畫面乾淨、視線不會被打斷。
         * 材料圖譜、批次規劃是探索/規劃用的附加內容，跟主要求解流程完全分開，收進側邊抽屜面板，
         * 用分頁籤切換，不用一直往下滑、也不會跟求解流程的內容混在一起分不清楚。 */
        '<div id="cf-auto-block">' +
          '<div class="craft-card craft-row">' +
            '<label class="craft-check-inline" style="margin-left:0"><input id="cf-collectable" type="checkbox" />收藏品模式</label>' +
            '<div id="cf-collectable-goal-wrap" style="display:none;margin-left:auto" class="craft-row"><span class="craft-label">目標收藏度</span>' + numberField('cf-collectable-goal', 100, 10) + '</div>' +
          '</div>' +
          '<div id="cf-solve-target" class="craft-solve-target">尚未選擇配方</div>' +
          '<div id="cf-solve-nav" class="craft-solve-nav" style="display:none">' +
            '<div class="craft-solve-nav-mode-toggle" id="cf-solve-nav-mode">' +
              '<button type="button" data-mode="history" class="active"><i class="ph ph-clock-counter-clockwise"></i>瀏覽紀錄</button>' +
              '<button type="button" data-mode="batch"><i class="ph ph-list-numbers"></i>批次順序</button>' +
            '</div>' +
            '<div class="craft-solve-nav-row">' +
              '<button type="button" id="cf-solve-prev" class="craft-solve-nav-btn"><i class="ph ph-caret-left"></i><span id="cf-solve-prev-label"></span></button>' +
              '<span id="cf-solve-nav-pos" class="craft-batch-seq-pos"></span>' +
              '<button type="button" id="cf-solve-next" class="craft-solve-nav-btn"><span id="cf-solve-next-label"></span><i class="ph ph-caret-right"></i></button>' +
            '</div>' +
          '</div>' +
          '<button id="cf-solve" class="craft-solve-btn" disabled><i class="ph ph-play"></i>選擇配方後開始求解</button>' +
          '<div id="cf-progress" class="craft-progress" style="display:none"></div>' +
          '<div id="cf-result" class="craft-card craft-result" style="display:none"></div>' +
        '</div>' +
        '<div id="cf-manual-panel" class="craft-card" style="display:none">' +
          '<div class="craft-row" style="margin-bottom:6px"><span class="craft-label">目前製作狀態</span><span id="cf-m-condition" class="craft-condition-badge">普通</span></div>' +
          '<div class="craft-row" style="gap:20px">' +
            '<div style="flex:1"><div class="craft-bar-label"><span>耐久</span><span id="cf-m-dur-text">- / -</span></div><div id="cf-m-dur-blocks" class="craft-dur-blocks"></div></div>' +
            '<div style="flex:1"><div class="craft-bar-label"><span>CP</span><span id="cf-m-cp-text">- / -</span></div><div class="craft-bar-track"><div id="cf-m-cp-bar" class="craft-bar-fill craft-fill-cp" style="width:100%"></div></div></div>' +
          '</div>' +
          '<div class="craft-bar-row" style="margin-top:10px"><div class="craft-bar-label"><span>進度</span><span id="cf-m-prog-text">- / -</span></div><div class="craft-bar-track"><div id="cf-m-prog-bar" class="craft-bar-fill craft-fill-progress" style="width:0%"></div></div></div>' +
          '<div class="craft-bar-row"><div class="craft-bar-label"><span>品質</span><span id="cf-m-qual-text">- / -</span></div><div class="craft-bar-track"><div id="cf-m-qual-bar" class="craft-bar-fill craft-fill-quality" style="width:0%"></div></div></div>' +
          '<div class="craft-row" style="margin:10px 0"><div id="cf-m-sequence" style="display:flex;gap:5px;flex-wrap:wrap;flex:1"></div><button id="cf-m-undo" type="button" class="craft-copy-btn"><i class="ph ph-arrow-u-up-left"></i>復原</button><button id="cf-m-reset" type="button" class="craft-copy-btn craft-copy-btn-danger"><i class="ph ph-arrow-counter-clockwise"></i>重置</button></div>' +
          '<div id="cf-m-skills" class="craft-manual-skills"></div>' +
          '<div class="craft-row" style="margin-top:10px;justify-content:flex-end"><button id="cf-m-continue" class="craft-solve-btn" style="width:auto;padding:0 16px"><i class="ph ph-magic-wand"></i>接續求解</button></div>' +
          '<div id="cf-m-result" style="margin-top:10px"></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    /* 材料圖譜、批次規劃跟主要求解流程完全分開，用側邊抽屜面板呈現，分頁籤切換，不用一直往下滑 */
    '<button type="button" id="cf-explore-trigger" class="craft-explore-fab">' +
      '<span class="craft-explore-fab-inner">' +
        '<span class="craft-explore-fab-star">✦</span>' +
        '<span class="craft-explore-fab-badge-icon"><i class="ph ph-tree-structure"></i></span>' +
        '<span class="craft-explore-fab-label-group">' +
          '<span class="craft-explore-fab-label">圖譜材料</span>' +
          '<span class="craft-explore-fab-label">批次規劃</span>' +
        '</span>' +
        '<span id="cf-batch-badge" class="craft-explore-badge" style="display:none">0</span>' +
      '</span>' +
    '</button>' +
    '<div id="cf-explore-drawer" class="craft-explore-drawer">' +
      '<div id="cf-explore-backdrop" class="craft-explore-backdrop"></div>' +
      '<div class="craft-explore-panel">' +
        '<div class="craft-explore-head">' +
          '<div class="craft-explore-tabs">' +
            '<button type="button" class="craft-explore-tab active" data-tab="material">材料圖譜</button>' +
            '<button type="button" class="craft-explore-tab" data-tab="batch">批次規劃</button>' +
          '</div>' +
          '<button type="button" id="cf-explore-close" class="craft-explore-close"><i class="ph ph-x"></i></button>' +
        '</div>' +
        /* 原本只有回到求解主界面才能把「目前這個」加入批次規劃，在抽屜裡逛材料圖譜逛到一半，
         * 想把正在看的求解對象加進批次，還要先關抽屜、找到主界面的按鈕才能做，很繞路。
         * 加一條固定顯示在分頁籤下面的小工具列，兩個分頁共用，不管在哪個分頁都看得到、按得到。 */
        '<div id="cf-explore-current-target" class="craft-explore-current-target"></div>' +
        '<div class="craft-explore-body">' +
          '<div id="cf-explore-material" class="craft-explore-pane">' +
            '<div id="cf-material-graph" class="craft-material-graph"></div>' +
          '</div>' +
          '<div id="cf-explore-batch" class="craft-explore-pane" style="display:none">' +
            '<div class="craft-row"><span class="craft-label"><i class="ph ph-stack"></i>批次清單　<span class="craft-muted">可拖曳／點按上下箭頭調整順序，支援依序求解</span></span><a href="#" id="cf-batch-clear" class="craft-link" style="margin-left:auto">清空</a></div>' +
            '<div id="cf-batch-seq-nav" class="craft-batch-seq-nav" style="display:none"></div>' +
            '<div id="cf-batch-list" class="craft-batch-list"></div>' +
            '<div class="craft-ingredients"><p class="craft-ingredients-title">整批訂單規劃　<span class="craft-muted">材料彙總／購物清單，可選「自己做」往下展開，或維持採購</span></p><div id="cf-batch-materials"></div></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  const $ = function (id) { return document.getElementById(id); };
  /* 巨集文字裡有<wait.3>這種尖括號語法，直接塞進innerHTML會被瀏覽器當成不明HTML標籤吃掉不顯示
   * (複製到剪貼簿因為是讀原始字串、不是讀畫面，所以複製出來反而是對的，只有畫面預覽會看起來缺東西)。
   * 塞進畫面前一定要先跳脫尖括號。 */
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ── 材料圖譜／批次規劃抽屜面板：開關與分頁籤切換 ── */
  function openExploreDrawer(tab) {
    $('cf-explore-drawer').classList.add('open');
    if (tab) switchExploreTab(tab);
  }
  function closeExploreDrawer() { $('cf-explore-drawer').classList.remove('open'); }
  function switchExploreTab(tab) {
    document.querySelectorAll('.craft-explore-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    $('cf-explore-material').style.display = tab === 'material' ? 'block' : 'none';
    $('cf-explore-batch').style.display = tab === 'batch' ? 'block' : 'none';
  }
  $('cf-explore-trigger').addEventListener('click', function () { openExploreDrawer(); });
  $('cf-explore-backdrop').addEventListener('click', closeExploreDrawer);
  $('cf-explore-close').addEventListener('click', closeExploreDrawer);
  document.querySelectorAll('.craft-explore-tab').forEach(function (btn) {
    btn.addEventListener('click', function () { switchExploreTab(btn.dataset.tab); });
  });
  function updateBatchBadge() {
    const badge = $('cf-batch-badge');
    if (batchList.length > 0) { badge.textContent = batchList.length; badge.style.display = 'inline-flex'; }
    else { badge.style.display = 'none'; }
  }

  $('cf-job').innerHTML = JOBS.map(function (j) { return '<option value="' + j.id + '">' + j.name + '</option>'; }).join('');

  /* ── 個人設定檔：每個職業各自記住等級／數值，用localStorage存在本機，不需要帳號登入。
   * 只有勾選「使用個人設定檔」時才會自動存/自動套用；沒勾選就是原本的自由輸入模式，完全不受影響。 ── */
  const JOB_PROFILE_KEY = 'craftProfile:v1';
  function loadAllProfiles() {
    try { return JSON.parse(localStorage.getItem(JOB_PROFILE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveAllProfiles(p) {
    try { localStorage.setItem(JOB_PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* 存不進去(例如隱私瀏覽模式)就算了，不影響其他功能 */ }
  }
  let profiles = loadAllProfiles();

  function saveCurrentToProfile(jobId) {
    if (jobId == null || isNaN(jobId)) return;
    profiles[jobId] = {
      level: parseInt($('cf-lvl').value, 10) || 1,
      craftsmanship: parseInt($('cf-craftsmanship').value, 10) || 0,
      control: parseInt($('cf-control').value, 10) || 0,
      cp: parseInt($('cf-cp').value, 10) || 0,
      specialist: $('cf-specialist').checked,
    };
    saveAllProfiles(profiles);
  }
  function loadProfileToFields(jobId) {
    const p = profiles[jobId];
    if (!p) return false; // 這個職業還沒設定過，欄位維持原狀，當作這次是新職業的起點
    $('cf-lvl').value = p.level;
    $('cf-craftsmanship').value = p.craftsmanship;
    $('cf-control').value = p.control;
    $('cf-cp').value = p.cp;
    $('cf-specialist').checked = !!p.specialist;
    return true;
  }
  let lastJobId = null; // 記住切換前是哪個職業，換職業時才知道要把編輯存回哪一筆
  let addBatchConfirmTimer = null;

  /* 設定檔管理面板：一次列出全部8個職業，每個都能直接編輯等級/數值，不用切主選單來回設定 */
  function renderProfileManager() {
    const box = $('cf-profile-manager');
    /* 原本是塞進一張6欄的橫向表格，在窄邊欄裡欄寬只有50幾px，數字被瀏覽器原生上下箭頭一擠就被裁掉，
     * 職業名稱4個字也放不下會換行。改成每個職業一個獨立卡片、垂直排列，不用硬擠橫向空間，
     * 職業名稱單獨一整行絕對放得下；下面4個數值用小巧的2x2網格排列，數字輸入框拿掉原生箭頭
     * (跟全站其他數字欄位一致，改用旁邊小小的文字標籤取代)，字體也給到跟其他卡片一致的大小。 */
    box.innerHTML = JOBS.map(function (j) {
      const p = profiles[j.id] || {};
      const isActive = parseInt($('cf-job').value, 10) === j.id;
      return '<div class="craft-profile-card' + (isActive ? ' craft-profile-card-active' : '') + '" data-job="' + j.id + '">' +
        '<div class="craft-profile-card-head">' +
          '<span class="craft-profile-card-name">' + j.name + (isActive ? '<span class="craft-muted">（使用中）</span>' : '') + '</span>' +
          '<label class="craft-check-inline craft-profile-card-specialist"><input type="checkbox" data-field="specialist" ' + (p.specialist ? 'checked' : '') + ' />專家</label>' +
        '</div>' +
        '<div class="craft-profile-card-fields">' +
          '<label>Lv<input type="number" min="1" max="100" data-field="level" value="' + (p.level != null ? p.level : 1) + '" /></label>' +
          '<label>作業精度<input type="number" min="0" data-field="craftsmanship" value="' + (p.craftsmanship != null ? p.craftsmanship : 0) + '" /></label>' +
          '<label>加工精度<input type="number" min="0" data-field="control" value="' + (p.control != null ? p.control : 0) + '" /></label>' +
          '<label>CP<input type="number" min="0" data-field="cp" value="' + (p.cp != null ? p.cp : 0) + '" /></label>' +
        '</div>' +
      '</div>';
    }).join('');
    box.querySelectorAll('.craft-profile-card').forEach(function (row) {
      const jobId = parseInt(row.dataset.job, 10);
      row.querySelectorAll('[data-field]').forEach(function (input) {
        input.addEventListener('change', function () {
          const cur = profiles[jobId] || { level: 1, craftsmanship: 0, control: 0, cp: 0, specialist: false };
          const field = input.dataset.field;
          cur[field] = field === 'specialist' ? input.checked : (parseInt(input.value, 10) || 0);
          profiles[jobId] = cur;
          saveAllProfiles(profiles);
          // 如果改的剛好是目前使用中的職業，主欄位也要同步更新，不然畫面兩邊數字會不一致
          if (jobId === parseInt($('cf-job').value, 10)) {
            loadProfileToFields(jobId);
            recalcStats(); renderSpecialActions(); refreshSearchFeasibilityIfOpen(); renderManual();
          }
        });
      });
    });
  }

  function syncProfileUiMode() {
    const on = $('cf-profile-mode').checked;
    $('cf-profile-hint-off').style.display = on ? 'none' : 'block';
    $('cf-profile-hint-on').style.display = on ? 'block' : 'none';
    $('cf-profile-manage-btn').style.display = on ? 'inline-flex' : 'none';
    /* 生產技能全職業通用，職業選單本身只有「要編輯/套用哪個職業存的數值」這件事有意義，
     * 所以只在設定檔模式打開時才顯示；自由輸入模式下不管選哪個職業結果都一樣，顯示出來只會讓人誤以為
     * 「選了木工師=用木工師的技能」，乾脆藏起來，少一個沒作用又會混淆的選項。 */
    $('cf-job-wrap').style.display = on ? 'inline-block' : 'none';
    if (!on) { $('cf-profile-manager').style.display = 'none'; $('cf-profile-manage-btn').innerHTML = '管理全部職業 <i class="ph ph-caret-down"></i>'; }
    updateStatsScopeTag();
  }
  /* 數值歸屬標籤：自由輸入模式下固定顯示「通用數值」，不會因為上面選了哪個職業而改變字樣，
   * 避免「選了木工師→看起來像木工師專屬數值」這種誤解；設定檔模式下才會顯示目前是哪個職業的數值。 */
  function updateStatsScopeTag() {
    const tag = $('cf-stats-scope-tag');
    if ($('cf-profile-mode').checked) {
      const jobId = parseInt($('cf-job').value, 10);
      tag.innerHTML = '<i class="ph ph-user-circle"></i>' + (JOB_NAME_BY_ID[jobId] || '') + '　的設定檔數值';
      tag.className = 'craft-stats-scope-tag scope-profile';
    } else {
      tag.innerHTML = '<i class="ph ph-globe"></i>通用數值';
      tag.className = 'craft-stats-scope-tag scope-free';
    }
  }
  $('cf-profile-manage-btn').addEventListener('click', function () {
    const box = $('cf-profile-manager');
    const opening = box.style.display === 'none';
    box.style.display = opening ? 'block' : 'none';
    this.innerHTML = '管理全部職業 <i class="ph ph-caret-' + (opening ? 'up' : 'down') + '"></i>';
    if (opening) renderProfileManager();
  });

  $('cf-profile-mode').addEventListener('change', function () {
    const jobId = parseInt($('cf-job').value, 10);
    lastJobId = jobId;
    syncProfileUiMode();
    if (this.checked) {
      if (!loadProfileToFields(jobId)) saveCurrentToProfile(jobId); // 這個職業還沒存過，先把目前欄位值當作起點存起來
      setJobFilter(jobId); // 搜尋清單自動只顯示這個職業做得到的東西
      recalcStats(); renderSpecialActions(); refreshSearchFeasibilityIfOpen(); renderManual();
    }
  });

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

  /* ── 數字欄位的加減按鈕（取代原生 input[number] 的箭頭，風格統一成按鈕） ──
   * 修正：原本只有按鈕點擊會做min/max限制，手動打字輸入不會；而且大多數欄位根本沒設min，
   * 導致作業精度/加工精度/CP/批次數量/收藏度目標都能被按到0或負數，遊戲裡不可能出現這種值。 */
  function clampStepperInput(input) {
    const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
    const max = input.max !== '' ? parseFloat(input.max) : Infinity;
    let v = parseFloat(input.value);
    if (isNaN(v)) v = (min !== -Infinity ? min : 0);
    input.value = Math.min(max, Math.max(min, v));
  }
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
  root.querySelectorAll('.craft-stepper input').forEach(function (input) {
    input.addEventListener('change', function () { clampStepperInput(input); input.dispatchEvent(new Event('input', { bubbles: true })); });
  });
  $('cf-lvl').min = 1; $('cf-lvl').max = 100;
  $('cf-batch-qty').min = 1;
  $('cf-cp').min = 1;
  $('cf-craftsmanship').min = 0;
  $('cf-control').min = 0;
  $('cf-collectable-goal').min = 0;

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
        '<div class="craft-skill-item-main">' +
          '<input type="checkbox" data-special="' + s.key + '" ' + (checked ? 'checked' : '') + ' ' + (state.available ? '' : 'disabled') + ' />' +
          '<span>' + s.label + '</span>' +
        '</div>' +
        '<span class="craft-skill-lvl">' + (state.available ? s.note : state.reason) + '</span>' +
        '</label>';
    }).join('');
    box.querySelectorAll('[data-special]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked) learnedSpecial.add(cb.dataset.special); else learnedSpecial.delete(cb.dataset.special);
        /* 原本勾/取消勾選之後，手動求解那邊的技能格子跟搜尋結果的可行性判斷都沒有跟著重畫，
         * 畫面卡在勾選前的舊狀態，玩家會覺得「明明勾了怎麼還是沒反應」。補上即時重畫。 */
        renderManual();
        refreshSearchFeasibilityIfOpen();
      });
    });
  }
  ['cf-job', 'cf-lvl', 'cf-specialist'].forEach(function (id) {
    $(id).addEventListener('input', renderSpecialActions);
    $(id).addEventListener('change', renderSpecialActions);
  });

  $('cf-job').addEventListener('change', function () {
    const jobId = parseInt(this.value, 10);
    if ($('cf-profile-mode').checked) {
      saveCurrentToProfile(lastJobId); // 換職業前，先把剛剛編輯的數值存回上一個職業
      if (!loadProfileToFields(jobId)) saveCurrentToProfile(jobId); // 新職業沒存過，就把目前欄位值當起點存起來
      setJobFilter(jobId); // 搜尋清單自動只顯示這個職業做得到的東西
      recalcStats();
      if ($('cf-profile-manager').style.display !== 'none') renderProfileManager();
    }
    lastJobId = jobId;
    updateStatsScopeTag(); // 設定檔模式下標籤要跟著換成新職業的名字；自由輸入模式下這行等於沒變化，字樣一直是「通用數值」
  });
  /* 設定檔模式開著時，數值/等級/專家勾選有變動就自動存回目前職業，不用額外按「儲存」 */
  ['cf-lvl', 'cf-craftsmanship', 'cf-control', 'cf-cp', 'cf-specialist'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      if ($('cf-profile-mode').checked) {
        saveCurrentToProfile(parseInt($('cf-job').value, 10));
        if ($('cf-profile-manager').style.display !== 'none') renderProfileManager();
      }
    });
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

    /* 食物／藥水加成：原本分別塞在三個1/3寬的小欄位下面，字一長就換行、看起來又亂又不像遊戲buff提示。
     * 改成三個數值一起收進下面這條跨欄的整合列，用「食物/藥水來源標籤 + 三個加成小卡」的方式呈現，
     * 版面夠寬就不會硬擠換行，也比單純文字更像遊戲裡的buff效果展示。 */
    const summaryEl = $('cf-consumable-summary');
    if (!food && !pot) {
      summaryEl.innerHTML = '';
      summaryEl.classList.remove('ccs-show');
    } else {
      const sources = [];
      if (food) sources.push('<span class="ccs-source-tag ccs-source-food"><i class="ph ph-bowl-food"></i>' + food.name + (hqFood ? '<em>HQ</em>' : '') + '</span>');
      if (pot) sources.push('<span class="ccs-source-tag ccs-source-pot"><i class="ph ph-flask"></i>' + pot.name + (hqPot ? '<em>HQ</em>' : '') + '</span>');
      const chips = [];
      if (final.breakdown.craftsmanshipBonus) chips.push(consumableChip('ph-hammer', '作業精度', final.breakdown.craftsmanshipBonus, final.craftsmanship));
      if (final.breakdown.controlBonus) chips.push(consumableChip('ph-sparkle', '加工精度', final.breakdown.controlBonus, final.control));
      if (final.breakdown.cpBonus) chips.push(consumableChip('ph-lightning', 'CP', final.breakdown.cpBonus, final.cp));
      summaryEl.innerHTML = '<div class="ccs-sources">' + sources.join('') + '</div>' + '<div class="ccs-chips">' + (chips.join('') || '<span class="craft-muted" style="font-size:11px">目前選擇沒有數值加成</span>') + '</div>';
      summaryEl.classList.add('ccs-show');
    }
    return final;
  }
  function consumableChip(icon, label, bonus, total) {
    return '<span class="ccs-chip"><i class="ph ' + icon + '"></i>' + label + '<b>+' + bonus + '</b><span class="ccs-chip-arrow">→</span>' + total.toLocaleString() + '</span>';
  }
  ['cf-craftsmanship', 'cf-control', 'cf-cp', 'cf-food', 'cf-pot'].forEach(function (id) {
    $(id).addEventListener('input', recalcStats);
    $(id).addEventListener('change', recalcStats);
    $(id).addEventListener('input', refreshSearchFeasibilityIfOpen);
    $(id).addEventListener('change', refreshSearchFeasibilityIfOpen);
    /* 這幾個數值都會直接影響手動求解「哪些技能現在按得下去」，原本改了數值手動求解那邊完全沒反應，
     * 要切一次分頁或換一次配方才會更新，看起來就像技能清單壞了。補上即時重畫。 */
    $(id).addEventListener('input', renderManual);
    $(id).addEventListener('change', renderManual);
  });
  ['cf-job', 'cf-lvl', 'cf-specialist'].forEach(function (id) {
    $(id).addEventListener('input', refreshSearchFeasibilityIfOpen);
    $(id).addEventListener('change', refreshSearchFeasibilityIfOpen);
    $(id).addEventListener('input', renderManual);
    $(id).addEventListener('change', renderManual);
  });
  function refreshSearchFeasibilityIfOpen() {
    if ($('cf-recipe-results').classList.contains('open')) runSearch();
  }
  ['cf-food-tier', 'cf-pot-tier'].forEach(function (id) {
    $(id).querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $(id).querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        recalcStats();
        renderManual();
      });
    });
  });

  /* ── 配方篩選列：職業(9顆，全部+8職業) + 等級範圍。與關鍵字搜尋互相配合，
   * 就算沒打字，只要選了職業或填了等級範圍，也會直接列出結果，不強制一定要先打名字。 ── */
  $('cf-job-filter').innerHTML = '<button type="button" class="craft-job-filter-btn active" data-job="all">全部</button>' +
    JOBS.map(function (j) { return '<button type="button" class="craft-job-filter-btn" data-job="' + j.id + '">' + j.name + '</button>'; }).join('');
  let filterJob = 'all';
  function setJobFilterSilent(jobId) {
    filterJob = String(jobId);
    $('cf-job-filter').querySelectorAll('.craft-job-filter-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.job === filterJob); });
  }
  function setJobFilter(jobId) {
    setJobFilterSilent(jobId);
    runSearch();
  }
  $('cf-job-filter').addEventListener('click', function (e) {
    const btn = e.target.closest('.craft-job-filter-btn');
    if (!btn) return;
    setJobFilter(btn.dataset.job);
  });
  ['cf-filter-lvl-min', 'cf-filter-lvl-max'].forEach(function (id) {
    $(id).addEventListener('input', runSearch);
  });

  /* 快速可行性判斷：用一套「進度全力衝刺」的排法跑一次模擬，不是真的求解找最佳手法，這樣才夠快，
   * 可以用在搜尋清單每一列上。這是保守估計：
   * - 如果連這個「進度全力衝刺、完全不管品質」的最佳情況都衝不完，代表真正求解也不可能成功 → 高信心的「打不動」
   * - 但反過來，能衝完進度不代表真正求解一定成功（還要兼顧品質、CP分配等等），所以只能標示「可能打得動」，不是保證
   *
   * 排法選技能有講究：不能只用最基礎的「作業」，那個效率遠低於真正求解會用的手法（例如「猛攻」＋「加速」），
   * 拿最弱的技能當「最佳情況」會系統性低估高階配方的可行性，導致大部分配方都被誤判成打不動。
   * 這裡選技能是驗證過的：開局用威力最高的「守護之力」(Lv54+)，接著開「加速」buff提升效率，
   * 有「掌握」(Lv65+)就延長耐久，讓模擬引擎自己判斷延長後夠不夠用，中間全部用「猛攻」(Lv72+)衝進度，
   * 沒到對應等級就退回基礎技能。這組排法經過實測比對，跟真正求解的可行性判斷相符。 */
  function quickFeasibility(recipe, crafterStats) {
    try {
      if (crafterStats.level < recipe.lvl) return 'level'; // 等級都不夠，不用跑模擬
      const craft = buildSimCraft(recipe);
      const level = crafterStats.level;
      const hasGroundwork = level >= 72;
      const hasMuscleMemory = level >= 54;
      const hasManipulation = level >= 65;
      const baseSteps = Math.max(1, Math.floor(recipe.durability / 10));
      const actions = [];
      if (hasMuscleMemory) actions.push(new simulator.MuscleMemory()); // 開局限定，威力最高
      if (crafterStats.cp >= 18) actions.push(new simulator.Veneration()); // 加速：CP夠就開，提升接下來幾回合的進度效率
      if (hasManipulation && crafterStats.cp >= 120) actions.push(new simulator.Manipulation()); // 掌握：延長耐久
      const extraSteps = hasManipulation ? 4 : 0; // 耐久被掌握延長，多排幾步讓模擬引擎自己判斷夠不夠用（多排的用不到會自動跳過，不影響結果）
      const remain = (hasMuscleMemory ? baseSteps - 1 : baseSteps) + extraSteps;
      for (let i = 0; i < remain; i++) actions.push(hasGroundwork ? new simulator.Groundwork() : new simulator.BasicSynthesis());
      const sim = new simulator.Simulation(craft, actions, crafterStats, []);
      sim.run(true, undefined, true);
      return sim.progression >= recipe.progress ? 'maybe' : 'no';
    } catch (e) {
      return null; // 算不出來就不顯示，不要顯示可能誤導的結果
    }
  }

  function feasibilityBadgeHtml(verdict) {
    if (verdict === 'level') return '<span class="craft-feasibility craft-feasibility-no" title="角色等級不夠，先不用看能不能做">等級不足</span>';
    if (verdict === 'no') return '<span class="craft-feasibility craft-feasibility-no" title="用目前的數值，就算全部技能都拿去衝進度也做不完，這個配方目前打不動">進度可能不滿</span>';
    if (verdict === 'maybe') return '<span class="craft-feasibility craft-feasibility-ok" title="進度衝得完，但還要看品質/CP怎麼分配，實際能不能過要求解才準">進度可滿</span>';
    return '';
  }

  /* ── 配方搜尋：不再截斷到20筆，滾動清單顯示所有符合結果 ── */
  /* 切換求解對象的共用邏輯：搜尋結果點擊、材料圖譜/批次清單/訂單規劃的快速切換都共用這一個，
   * 避免同樣的流程散落好幾處、以後改一次要改好幾個地方。 */
  function selectRecipeById(recipeId, opts) {
    const found = RECIPE_INDEX.find(function (r) { return r.id === recipeId; });
    if (!found) return false;
    selectedRecipe = found;
    $('cf-recipe-search').value = selectedRecipe.name;

    /* fromHistory=true 代表是「上一個/下一個」按鈕觸發的，只移動指標不改動歷史內容；
     * 其他所有入口（搜尋結果點擊、材料圖譜切換、批次清單點擊…）都當成「手動選了新的」，
     * 砍掉指標後面的「未來」紀錄再把這筆推進去，跟瀏覽器網址列一致的行為。 */
    if (!(opts && opts.fromHistory)) {
      solveHistory = solveHistory.slice(0, solveHistoryIndex + 1);
      solveHistory.push(recipeId);
      solveHistoryIndex = solveHistory.length - 1;
    }

    renderRecipeSelected();
    renderIngredients();
    renderMaterialGraph();
    renderSpecialActions();
    manualRotation = []; renderManual(); // 換配方，手動模式的操作進度歸零重來
    $('cf-solve').disabled = false;
    $('cf-solve').innerHTML = '<i class="ph ph-play"></i>開始求解';
    return true;
  }

  /* 上一個/下一個：純粹在歷史紀錄裡移動指標，不會推入新紀錄 */
  function stepSolveHistory(dir) {
    const nextIndex = solveHistoryIndex + dir;
    if (nextIndex < 0 || nextIndex >= solveHistory.length) return;
    solveHistoryIndex = nextIndex;
    selectRecipeById(solveHistory[solveHistoryIndex], { fromHistory: true });
  }
  function recipeNameById(recipeId) {
    const r = RECIPE_INDEX.find(function (r) { return r.id === recipeId; });
    return r ? r.name : '';
  }

  function runSearch() {
    const q = $('cf-recipe-search').value.trim();
    const lvlMin = parseInt($('cf-filter-lvl-min').value, 10);
    const lvlMax = parseInt($('cf-filter-lvl-max').value, 10);
    const hasFilter = filterJob !== 'all' || !isNaN(lvlMin) || !isNaN(lvlMax);
    const box = $('cf-recipe-results');
    if (!q && !hasFilter) { box.innerHTML = ''; box.classList.remove('open'); return; }
    const matches = RECIPE_INDEX.filter(function (r) {
      if (q && r.name.indexOf(q) === -1) return false;
      if (filterJob !== 'all' && String(r.jobId) !== filterJob) return false;
      if (!isNaN(lvlMin) && r.lvl < lvlMin) return false;
      if (!isNaN(lvlMax) && r.lvl > lvlMax) return false;
      return true;
    });
    /* 可行性判斷只算前30筆：清單可能一次列出成千上萬筆(沒打關鍵字只選職業篩選時尤其明顯)，
     * 每筆都要跑一次模擬會讓每次打字都卡頓，30筆以外的先不顯示標示，捲到再點進去看就好。 */
    const FEASIBILITY_LIMIT = 30;
    let crafterStatsForCheck = null;
    try {
      const level = parseInt($('cf-lvl').value, 10) || 1;
      const final = recalcStats();
      crafterStatsForCheck = new simulator.CrafterStats(parseInt($('cf-job').value, 10), final.craftsmanship, final.control, final.cp, $('cf-specialist').checked, false, level, [level, level, level, level, level, level, level, level]);
    } catch (e) { /* 玩家數值還沒填齊全，就不顯示可行性標示 */ }

    box.innerHTML = matches.map(function (r, i) {
      const recipe = CRAFT_RECIPES[r.id];
      const badge = (crafterStatsForCheck && i < FEASIBILITY_LIMIT) ? feasibilityBadgeHtml(quickFeasibility(recipe, crafterStatsForCheck)) : '';
      return '<div class="craft-recipe-item" data-id="' + r.id + '">' + itemIconHtml(r.itemId, 22) +
        '<span class="craft-recipe-item-name">' + r.name + '</span>' +
        badge +
        '<span class="craft-muted">' + (JOB_NAME_BY_ID[r.jobId] || '') + '・Lv' + r.lvl + '　rlvl' + r.rlvl + '</span></div>';
    }).join('') || '<div class="craft-recipe-empty">找不到符合的配方</div>';
    box.classList.add('open');
    box.querySelectorAll('.craft-recipe-item').forEach(function (item) {
      item.addEventListener('click', function () {
        selectRecipeById(item.dataset.id);
        box.innerHTML = ''; box.classList.remove('open');
      });
    });
  }
  $('cf-recipe-search').addEventListener('input', runSearch);
  $('cf-solve-prev').addEventListener('click', function () { if (solveNavMode === 'batch') stepBatchSeq(-1); else stepSolveHistory(-1); });
  $('cf-solve-next').addEventListener('click', function () { if (solveNavMode === 'batch') stepBatchSeq(1); else stepSolveHistory(1); });
  $('cf-solve-nav-mode').querySelectorAll('button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      solveNavMode = btn.dataset.mode;
      renderSolveNav();
    });
  });

  function renderRecipeSelected() {
    const box = $('cf-recipe-selected');
    if (!selectedRecipe) {
      box.innerHTML = ''; $('cf-add-batch-wrap').style.display = 'none';
      $('cf-solve-target').textContent = '尚未選擇配方';
      renderExploreCurrentTarget();
      return;
    }
    const recipe = CRAFT_RECIPES[selectedRecipe.id];
    box.innerHTML = '<div class="craft-recipe-chip">' + selectedRecipe.name +
      '<span class="craft-muted">　需求Lv' + recipe.lvl + '・進展' + recipe.progress + '・品質' + recipe.quality + '・耐久' + recipe.durability + '</span></div>';
    $('cf-add-batch-wrap').style.display = 'block';
    $('cf-solve-target').innerHTML = '<i class="ph ph-target"></i>　求解目標：<strong>' + selectedRecipe.name + '</strong>' +
      '<span class="craft-muted">　（跟批次清單無關，只算這一項）</span>';
    renderSolveNav();
    renderExploreCurrentTarget();
  }

  /* 圖譜與規劃抽屜裡固定顯示的「目前求解對象」小工具列，兩個分頁共用，隨時可以直接加入批次規劃，
   * 不用先關抽屜跑回主界面。跟材料圖譜/批次清單裡的加號共用同一顆addRecipeToBatch，行為完全一致。 */
  function renderExploreCurrentTarget() {
    const box = $('cf-explore-current-target');
    if (!box) return;
    if (!selectedRecipe) { box.innerHTML = '<span class="craft-muted" style="font-size:12px">尚未選擇求解對象</span>'; return; }
    box.innerHTML = '<span class="craft-explore-current-name"><i class="ph ph-target"></i>' + selectedRecipe.name + '</span>' +
      '<button type="button" id="cf-explore-quickadd" class="craft-copy-btn"><i class="ph ph-plus"></i>加入批次規劃</button>';
    $('cf-explore-quickadd').addEventListener('click', function () {
      addRecipeToBatch(selectedRecipe.id, 1);
      const btn = $('cf-explore-quickadd');
      // 跟主界面「加入批次規劃」按鈕共用同一個craft-add-batch-confirmed綠色樣式，視覺一致，
      // 不要各自發展出不一樣的「已加入」呈現方式
      btn.innerHTML = '<i class="ph ph-check"></i>已加入！';
      btn.classList.add('craft-add-batch-confirmed');
      setTimeout(function () {
        if (!$('cf-explore-quickadd')) return;
        $('cf-explore-quickadd').innerHTML = '<i class="ph ph-plus"></i>加入批次規劃';
        $('cf-explore-quickadd').classList.remove('craft-add-batch-confirmed');
      }, 1100);
    });
  }

  /* 上一個/下一個導覽列：現在支援兩套完全獨立的資料來源——「瀏覽紀錄」(solveHistory，玩家最近手動
   * 選過的配方) 跟「批次順序」(batchList，批次規劃排的順序)，靠上面的切換鈕決定現在顯示哪一套，
   * 兩者共用同一顆左右按鈕，但各自的資料、指標、上一步/下一步邏輯完全不共用，不會互相污染。 */
  function renderSolveNav() {
    const nav = $('cf-solve-nav');
    const toggle = $('cf-solve-nav-mode');
    const hasBatch = batchList.length >= 2;
    // 批次規劃項目不足2筆時，「批次順序」這個選項沒有意義，直接不給選，避免切過去卻沒東西可切
    toggle.style.display = hasBatch ? 'flex' : 'none';
    if (solveNavMode === 'batch' && !hasBatch) solveNavMode = 'history'; // 批次被清空了，自動退回瀏覽紀錄模式
    toggle.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === solveNavMode); });

    if (solveNavMode === 'batch') {
      if (!hasBatch) { nav.style.display = 'none'; return; }
      nav.style.display = 'flex';
      const hasPrev = batchSeqIndex > 0;
      const hasNext = batchSeqIndex < batchList.length - 1;
      $('cf-solve-prev').disabled = !hasPrev;
      $('cf-solve-next').disabled = !hasNext;
      $('cf-solve-prev-label').textContent = hasPrev ? batchList[batchSeqIndex - 1].name : '';
      $('cf-solve-next-label').textContent = hasNext ? batchList[batchSeqIndex + 1].name : (batchSeqIndex < 0 ? '開始' : '');
      $('cf-solve-nav-pos').textContent = batchSeqIndex >= 0 ? ('第 ' + (batchSeqIndex + 1) + ' / ' + batchList.length + ' 項') : ('共 ' + batchList.length + ' 項');
      return;
    }

    // history模式：即使歷史紀錄不夠(沒有上一個/下一個可切)，只要有批次可以切換模式，導覽列本身還是要留著顯示切換鈕
    const hasPrev = selectedRecipe && solveHistoryIndex > 0;
    const hasNext = selectedRecipe && solveHistoryIndex < solveHistory.length - 1;
    if (!hasPrev && !hasNext && !hasBatch) { nav.style.display = 'none'; return; }
    nav.style.display = 'flex';
    $('cf-solve-prev').disabled = !hasPrev;
    $('cf-solve-next').disabled = !hasNext;
    $('cf-solve-prev-label').textContent = hasPrev ? recipeNameById(solveHistory[solveHistoryIndex - 1]) : '';
    $('cf-solve-next-label').textContent = hasNext ? recipeNameById(solveHistory[solveHistoryIndex + 1]) : '';
    $('cf-solve-nav-pos').textContent = '';
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

  /* 產生一個材料節點的HTML：direction='down'(這個材料由什麼做成) 或 'up'(這個道具還能用在哪)
   * 每個節點都帶：① 可製作的材料才有的「快速加入批次」按鈕 ② 價錢欄位（先留空位，等市場功能做好直接把
   * 對應server/資料中心的價格字串塞進 .craft-mat-price 就會顯示，不用再改這裡的HTML結構）。 */
  function materialNodeHtml(itemId, direction, seenPath, knownRecipeId) {
    const list = direction === 'down' ? (ITEM_TO_RECIPES[itemId] || []) : (ITEM_USED_IN[itemId] || []);
    const expandable = list.length > 0 && !CRYSTAL_ITEM_IDS.has(itemId);
    const craftableRecipeId = knownRecipeId || (ITEM_TO_RECIPES[itemId] || [])[0]; // 這個道具本身能不能做；往上查時上層已經知道確切配方，不用猜第一筆
    return '<div class="craft-mat-node" data-item="' + itemId + '" data-dir="' + direction + '" data-path="' + seenPath + '">' +
      '<div class="craft-mat-row">' +
        (expandable ? '<button type="button" class="craft-mat-toggle" data-item="' + itemId + '" data-dir="' + direction + '" data-path="' + seenPath + '">▸</button>' : '<span class="craft-mat-toggle-placeholder"></span>') +
        /* 原本要點旁邊一個很小的圖示才能切換求解對象，不明顯也不好點；
         * 改成能製作的物品，名字本身直接可點、有底線提示，點了就跳轉，符合「點名字就跳轉」的直覺操作。 */
        '<span class="craft-mat-name">' + itemIconHtml(itemId, 18) + itemName(itemId) + '</span>' +
        (list.length > 1 ? '<span class="craft-muted">' + list.length + ' 種做法／用途</span>' : '') +
        '<div class="craft-mat-actions">' +
          '<span class="craft-mat-price" data-price-item="' + itemId + '"></span>' +
          (craftableRecipeId ? '<button type="button" class="craft-mat-switch" data-switch-recipe="' + craftableRecipeId + '" title="切換成求解對象">求解</button>' : '') +
          (craftableRecipeId ? '<button type="button" class="craft-mat-quickadd" data-quickadd-recipe="' + craftableRecipeId + '" title="加入批次規劃"><i class="ph ph-plus"></i></button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="craft-mat-children"></div>' +
    '</div>';
  }

  /* 材料圖譜節點上的快速加入批次／切換求解對象按鈕綁定，跟展開鈕bindToggle一樣，每次渲染新節點都要重綁一次 */
  function bindMatActions(container) {
    container.querySelectorAll('.craft-mat-quickadd').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        addRecipeToBatch(btn.dataset.quickaddRecipe, 1);
        /* 材料圖譜一次可能列出很多列，如果每顆加號平常就顯示「加入批次規劃」6個字的完整按鈕，
         * 密度太高、畫面會很亂。平常維持小小一顆純圖示，只有點下去的當下短暫展開成文字確認，
         * 1.1秒後自動收回原本的圖示，兼顧「看得到有加入」跟「平常不佔版面」兩件事。 */
        btn.classList.add('craft-mat-quickadd-confirmed');
        btn.innerHTML = '<i class="ph ph-check"></i>已加入';
        clearTimeout(btn._confirmTimer);
        btn._confirmTimer = setTimeout(function () {
          btn.classList.remove('craft-mat-quickadd-confirmed');
          btn.innerHTML = '<i class="ph ph-plus"></i>';
        }, 1100);
      });
    });
    container.querySelectorAll('.craft-mat-switch').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        selectRecipeById(btn.dataset.switchRecipe);
        $('cf-recipe-results').innerHTML = ''; $('cf-recipe-results').classList.remove('open');
        closeExploreDrawer(); // 求解目標換了，關閉抽屜讓人看到「求解目標」提示條已經更新
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function expandMaterialNode(nodeEl) {
    const itemId = parseInt(nodeEl.dataset.item, 10);
    const direction = nodeEl.dataset.dir;
    const path = nodeEl.dataset.path; // 用逗號分隔的祖先itemId，防止循環展開
    const seen = path.split(',').filter(Boolean).map(Number);
    const childBox = nodeEl.querySelector('.craft-mat-children');
    const list = direction === 'down' ? (ITEM_TO_RECIPES[itemId] || []) : (ITEM_USED_IN[itemId] || []);

    function renderRecipeNode(rid) {
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
        return materialNodeHtml(r.itemId, 'up', path + ',' + itemId, rid);
      }
    }

    /* 分批呈現：先給前15筆，剩下的用「顯示全部」按鈕點開才一次列完，
     * 不再直接丟「太多先不列出」的死路訊息卻沒有任何辦法看到剩下的。 */
    function render(limit) {
      const shown = typeof limit === 'number' ? list.slice(0, limit) : list;
      const remaining = list.length - shown.length;
      childBox.innerHTML = shown.map(renderRecipeNode).join('') +
        (remaining > 0 ? '<button type="button" class="craft-mat-showmore">顯示全部（還有 ' + remaining + ' 筆）</button>' : '');
      childBox.querySelectorAll('.craft-mat-toggle').forEach(bindToggle);
      bindMatActions(childBox);
      const moreBtn = childBox.querySelector('.craft-mat-showmore');
      if (moreBtn) moreBtn.addEventListener('click', function () { render(null); });
    }
    render(15);

    childBox.classList.add('open');
  }

  function bindToggle(btn) {
    btn.addEventListener('click', function () {
      const nodeEl = btn.closest('.craft-mat-node');
      const childBox = nodeEl.querySelector('.craft-mat-children');
      if (childBox.classList.contains('open')) {
        childBox.classList.remove('open');
        childBox.innerHTML = '';
        btn.classList.remove('open');
      } else {
        expandMaterialNode(nodeEl);
        btn.classList.add('open');
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
        const rid = (ITEM_TO_RECIPES[ing.itemId] || [])[0]; // 這個材料本身可不可以做，可以的話帶一顆「求解」按鈕跳過去
        return '<div class="craft-ing-row" data-item="' + ing.itemId + '" data-amount="' + ing.amount + '">' +
          '<span class="craft-ing-name">' + itemIconHtml(ing.itemId, 20) + name + '</span>' +
          '<div class="craft-row" style="gap:6px">' +
            (rid ? '<button type="button" class="craft-mat-switch" data-switch-recipe="' + rid + '" title="切換成求解對象">求解</button>' : '') +
            '<div class="craft-ing-hq-control">' +
              '<button type="button" class="craft-step-btn" data-ing="' + ing.itemId + '" data-dir="-1">−</button>' +
              '<span class="craft-ing-split"><span class="craft-ing-nq">NQ ' + ing.amount + '</span>／<span class="craft-ing-hq">HQ 0</span></span>' +
              '<button type="button" class="craft-step-btn" data-ing="' + ing.itemId + '" data-dir="1">+</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

    bindMatActions(box);

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
        ? '<div class="craft-mat-section-label" style="margin-top:10px">▾ 這個成品還能用在哪</div>' + materialNodeHtml(recipe.itemId, 'up', '', selectedRecipe.id)
        : '<p class="craft-muted" style="margin-top:10px">這個成品目前查不到被用在其他配方裡（可能是終端道具）</p>');
    box.querySelectorAll('.craft-mat-toggle').forEach(bindToggle);
    bindMatActions(box);
  }

  /* ── 批量規劃：加入批次清單、彙總材料需求（直接材料，未遞迴展開子配方） ── */
  function renderBatch() {
    updateBatchBadge(); // 抽屜是使用者自己點開的，就算批次是空的也照樣渲染，不用整塊隱藏；但觸發鈕上的數字要更新
    renderSolveNav(); // 批次項目數量變了，主界面導覽列「批次順序」選項要不要出現／要不要自動退回瀏覽紀錄模式也要跟著更新
    if (batchList.length === 0) {
      $('cf-batch-list').innerHTML = '<p class="craft-muted">目前沒有加入任何批次項目，搜尋配方後可以「加入批次規劃」，或在材料圖譜上點加號。</p>';
      $('cf-batch-materials').innerHTML = '';
      return;
    }

    $('cf-batch-list').innerHTML = batchList.map(function (b, i) {
      return '<div class="craft-ing-row craft-batch-row" data-idx="' + i + '" draggable="true">' +
        '<span class="craft-batch-drag-handle" title="拖曳調整順序"><i class="ph ph-dots-six-vertical"></i></span>' +
        '<span class="craft-batch-order-num">' + (i + 1) + '</span>' +
        '<span class="craft-ing-name">' + b.name + '</span>' +
        '<div class="craft-row" style="gap:6px">' +
          '<div class="craft-ing-hq-control">' +
            '<button type="button" class="craft-step-btn" data-batch-idx="' + i + '" data-dir="-1">−</button>' +
            '<span class="craft-ing-split" style="min-width:30px">×' + b.quantity + '</span>' +
            '<button type="button" class="craft-step-btn" data-batch-idx="' + i + '" data-dir="1">+</button>' +
          '</div>' +
          '<div class="craft-batch-reorder-btns">' +
            '<button type="button" class="craft-batch-move" data-move-idx="' + i + '" data-move-dir="-1" title="往上移"' + (i === 0 ? ' disabled' : '') + '><i class="ph ph-caret-up"></i></button>' +
            '<button type="button" class="craft-batch-move" data-move-idx="' + i + '" data-move-dir="1" title="往下移"' + (i === batchList.length - 1 ? ' disabled' : '') + '><i class="ph ph-caret-down"></i></button>' +
          '</div>' +
          '<button type="button" class="craft-mat-switch" data-switch-recipe="' + b.recipeId + '" title="切換成求解對象">求解</button>' +
          '<button type="button" class="craft-copy-btn" data-batch-remove="' + i + '"><i class="ph ph-x"></i></button>' +
        '</div>' +
      '</div>';
    }).join('');

    bindMatActions($('cf-batch-list'));
    bindBatchReorder();
    renderBatchSeqNav();

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
        const removedIdx = parseInt(btn.dataset.batchRemove, 10);
        batchList.splice(removedIdx, 1);
        // 移除的項目在巡覽指標之前，指標要跟著往前一格；移除的剛好是指標當前那項，指標歸零重新開始
        if (batchSeqIndex > removedIdx) batchSeqIndex--;
        else if (batchSeqIndex === removedIdx) batchSeqIndex = -1;
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
        craftRows.map(function (r) {
          const rid = (ITEM_TO_RECIPES[r.itemId] || [])[0];
          return '<div class="craft-ing-row"><span class="craft-ing-name">' + r.name + '</span><span class="craft-row" style="gap:8px"><span class="craft-muted">製作 ' + r.times + ' 次</span>' +
            (rid ? '<button type="button" class="craft-mat-switch" data-switch-recipe="' + rid + '" title="切換成求解對象">求解</button>' : '') +
            '<button type="button" class="craft-copy-btn" data-collapse-toggle="' + r.itemId + '">改採購</button></span></div>';
        }).join('') +
        '<p class="craft-mat-section-label" style="margin-top:8px">▾ 需要採購</p>' : '') +
      (rows.map(function (r) {
        const rid = (ITEM_TO_RECIPES[r.itemId] || [])[0];
        const toggle = r.craftable
          ? '<button type="button" class="craft-copy-btn" data-expand-toggle="' + r.itemId + '">自己做</button>'
          : '<span class="craft-muted" style="font-size:10px">不可製作</span>';
        return '<div class="craft-ing-row"><span class="craft-ing-name">' + r.name + '</span><span class="craft-row" style="gap:8px"><span class="craft-muted">×' + r.amount.toLocaleString() + '</span>' +
          (rid ? '<button type="button" class="craft-mat-switch" data-switch-recipe="' + rid + '" title="切換成求解對象">求解</button>' : '') +
          toggle + '</span></div>';
      }).join('') || '<p class="craft-muted">批次是空的</p>');

    bindMatActions($('cf-batch-materials'));

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

  /* ── 批次排序：點擊上/下箭頭 + 拖曳兩種方式都支援，各有適合的情境（拖曳快，但手機/觸控不一定順手；
   * 點擊比較笨拙但到處都能用），排序邏輯共用同一個 moveBatchItem。 ── */
  function moveBatchItem(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= batchList.length || fromIdx === toIdx) return;
    const moved = batchList.splice(fromIdx, 1)[0];
    batchList.splice(toIdx, 0, moved);
    // 巡覽指標要跟著移動的項目一起調整，不然「依序求解」的位置會對不上換過順序後的清單
    if (batchSeqIndex === fromIdx) batchSeqIndex = toIdx;
    else if (batchSeqIndex > fromIdx && batchSeqIndex <= toIdx) batchSeqIndex--;
    else if (batchSeqIndex < fromIdx && batchSeqIndex >= toIdx) batchSeqIndex++;
    renderBatch();
  }
  function bindBatchReorder() {
    $('cf-batch-list').querySelectorAll('[data-move-idx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        moveBatchItem(parseInt(btn.dataset.moveIdx, 10), parseInt(btn.dataset.moveIdx, 10) + parseInt(btn.dataset.moveDir, 10));
      });
    });
    let dragFromIdx = null;
    $('cf-batch-list').querySelectorAll('.craft-batch-row').forEach(function (row) {
      row.addEventListener('dragstart', function () {
        dragFromIdx = parseInt(row.dataset.idx, 10);
        row.classList.add('craft-batch-row-dragging');
      });
      row.addEventListener('dragend', function () { row.classList.remove('craft-batch-row-dragging'); });
      row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('craft-batch-row-dragover'); });
      row.addEventListener('dragleave', function () { row.classList.remove('craft-batch-row-dragover'); });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        row.classList.remove('craft-batch-row-dragover');
        if (dragFromIdx === null) return;
        moveBatchItem(dragFromIdx, parseInt(row.dataset.idx, 10));
        dragFromIdx = null;
      });
    });
  }

  /* ── 依序求解：沿著批次清單的順序（不是切換歷史），一項一項把求解目標換過去。
   * 跟前面材料圖譜那邊「上一個/下一個」共用同一顆 selectRecipeById，
   * 但這裡是照批次清單的排列順序走，不是照玩家點擊過的先後順序，兩者是不同的邏輯，不能共用同一個指標。 ── */
  function renderBatchSeqNav() {
    const nav = $('cf-batch-seq-nav');
    if (batchList.length < 2) { nav.style.display = 'none'; return; }
    nav.style.display = 'flex';
    const hasPrev = batchSeqIndex > 0;
    // 原本這裡多加了 batchSeqIndex>=0 的條件，等於「還沒開始巡覽(-1)」這個起始狀態永遠判斷成沒有下一項，
    // 那顆理論上要能點的「開始」按鈕因此被鎖死，不管清單裡有幾項都按不下去。
    const hasNext = batchSeqIndex < batchList.length - 1;
    const posLabel = batchSeqIndex >= 0 ? ('第 ' + (batchSeqIndex + 1) + ' / ' + batchList.length + ' 項') : ('共 ' + batchList.length + ' 項');
    nav.innerHTML =
      '<span class="craft-solve-nav-label"><i class="ph ph-list-numbers"></i>批次順序</span>' +
      '<button type="button" id="cf-batch-seq-prev" class="craft-solve-nav-btn"' + (hasPrev ? '' : ' disabled') + '><i class="ph ph-caret-left"></i>' + (hasPrev ? batchList[batchSeqIndex - 1].name : '') + '</button>' +
      '<span class="craft-batch-seq-pos">' + posLabel + '</span>' +
      '<button type="button" id="cf-batch-seq-next" class="craft-solve-nav-btn"' + (hasNext ? '' : ' disabled') + '>' + (hasNext ? batchList[batchSeqIndex + 1].name : (batchSeqIndex < 0 ? '開始' : '')) + '<i class="ph ph-caret-right"></i></button>';
    $('cf-batch-seq-prev').addEventListener('click', function () { stepBatchSeq(-1); });
    $('cf-batch-seq-next').addEventListener('click', function () { stepBatchSeq(1); });
  }
  function stepBatchSeq(dir) {
    const nextIndex = (batchSeqIndex < 0 && dir > 0) ? 0 : batchSeqIndex + dir;
    if (nextIndex < 0 || nextIndex >= batchList.length) return;
    batchSeqIndex = nextIndex;
    /* 原本沒傳fromHistory，等於依序求解每切一次，都會被selectRecipeById當成「玩家手動選了新的」
     * 塞進主界面自己那組求解對象切換歷史（cf-solve-nav），兩邊搶同一份歷史紀錄，
     * 才會出現「主界面上一個/下一個看起來怪怪的、只有上一個沒有下一個」這種混淆狀況。
     * 傳fromHistory:true讓這裡的切換完全不去動主界面的歷史，兩套導覽各管各的，互不干擾。 */
    selectRecipeById(batchList[batchSeqIndex].recipeId, { fromHistory: true });
    renderBatchSeqNav(); // selectRecipeById沒有動batchList，不會觸發renderBatch，導覽列要自己刷新位置
    $('cf-batch-qty').value = batchList[batchSeqIndex].quantity; // 求解區塊的數量欄位順便帶入這一項在批次裡設定的數量，減少重複輸入
  }

  /* 加入批次的共用邏輯：主要的「加入批次」按鈕、材料圖譜上的快速加入按鈕都共用這一個，
   * 避免同樣的邏輯散落兩處、以後改一次要改兩個地方。 */
  function addRecipeToBatch(recipeId, qty) {
    qty = Math.max(1, qty || 1);
    const recipe = CRAFT_RECIPES[recipeId];
    if (!recipe) return;
    const idx = RECIPE_INDEX.find(function (r) { return r.id === recipeId; });
    const existing = batchList.find(function (b) { return b.recipeId === recipeId; });
    if (existing) existing.quantity += qty;
    else batchList.push({ recipeId: recipeId, itemId: recipe.itemId, name: idx ? idx.name : itemName(recipe.itemId), quantity: qty });
    renderBatch();
  }

  $('cf-add-batch').addEventListener('click', function () {
    if (!selectedRecipe) return;
    const qty = Math.max(1, parseInt($('cf-batch-qty').value, 10) || 1);
    addRecipeToBatch(selectedRecipe.id, qty);

    // 明確的文字提醒：按鈕本身短暫變化 + 底下顯示「已加入：品名 ×數量」
    const btn = $('cf-add-batch');
    btn.innerHTML = '<i class="ph ph-check"></i>已加入！';
    btn.classList.add('craft-add-batch-confirmed');
    $('cf-add-batch-confirm').textContent = '已加入批次規劃：' + selectedRecipe.name + ' ×' + qty;
    $('cf-add-batch-confirm').classList.add('craft-add-batch-confirm-show');
    clearTimeout(addBatchConfirmTimer);
    addBatchConfirmTimer = setTimeout(function () {
      btn.innerHTML = '<i class="ph ph-plus"></i>加入批次規劃';
      btn.classList.remove('craft-add-batch-confirmed');
      $('cf-add-batch-confirm').classList.remove('craft-add-batch-confirm-show');
    }, 1600);
  });
  $('cf-batch-clear').addEventListener('click', function (e) {
    e.preventDefault();
    batchList = [];
    batchSeqIndex = -1;
    renderBatch();
  });


  /* ── 手動求解模式 ── */
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

  /* 組出 Simulation 需要的配方物件格式，手動模式、快速可行性判斷共用同一份，避免兩處各寫一套容易兜不起來 */
  function buildSimCraft(recipe) {
    return { id: recipe.id, job: recipe.jobId, rlvl: recipe.rlvl, durability: recipe.durability, quality: recipe.quality, progress: recipe.progress, lvl: recipe.lvl, stars: recipe.stars || 0, hq: 0, expert: !!recipe.isExpert,
      ingredients: recipe.ingredients.map(function (ing) { return { id: ing.itemId, amount: ing.amount, quality: ing.quality || 0 }; }),
      conditionsFlag: recipe.conditionsFlag, progressDivider: recipe.progressDivider, qualityDivider: recipe.qualityDivider, progressModifier: recipe.progressModifier, qualityModifier: recipe.qualityModifier, requiredQuality: recipe.requiredQuality || 0 };
  }

  /* 技能顯示名稱：查到資料但缺tw(繁中)欄位時，退而求其次用zh(簡中)，還是沒有才用類別名稱保底，
   * 絕對不能讓 undefined 這個字串跑進畫面（原本 n ? n.tw : ... 只檢查有沒有查到資料，
   * 沒檢查查到的資料裡有沒有tw欄位，缺欄位時就會把undefined塞進按鈕文字）。 */
  function actionLabel(actionKey) {
    const n = MANUAL_ACTION_NAMES && MANUAL_ACTION_NAMES[actionKey];
    return (n && (n.tw || n.zh)) || actionKey;
  }

  function renderManual() {
    if (!selectedRecipe) {
      $('cf-m-skills').innerHTML = '<p class="craft-muted">請先在上方搜尋並選擇配方</p>';
      return;
    }
    const recipe = CRAFT_RECIPES[selectedRecipe.id];
    const stats = currentStatsForManual();
    const crafterStats = new simulator.CrafterStats(stats.jobId, stats.craftsmanship, stats.control, stats.cp, stats.specialist, false, stats.level, [stats.level, stats.level, stats.level, stats.level, stats.level, stats.level, stats.level, stats.level]);
    const hqIngredients = buildHqIngredients();
    const sim = new simulator.Simulation(buildSimCraft(Object.assign({ id: selectedRecipe.id }, recipe)), manualRotation, crafterStats, hqIngredients);
    sim.run(false, undefined, true); // safeMode=true：手動模式一樣預設用保守成功率判斷技能能不能用

    /* 目前製作狀態：sim.state 是模擬引擎照遊戲機率規則(含絕佳→惡劣、吉兆→高品質等連動)算出來的，
     * 之前這個徽章有殼沒接資料，一直死盯著「普通」不動，現在接上真正的模擬結果。 */
    const condMeta = conditionMeta(sim.state);
    const condBadge = $('cf-m-condition');
    condBadge.textContent = condMeta.label;
    condBadge.className = 'craft-condition-badge ' + condMeta.cls;

    $('cf-m-dur-text').textContent = sim.durability + ' / ' + recipe.durability;
    $('cf-m-dur-blocks').innerHTML = durabilityBlocksHtml(sim.durability, recipe.durability);
    $('cf-m-cp-text').textContent = sim.availableCP + ' / ' + stats.cp;
    $('cf-m-cp-bar').style.width = Math.max(0, (sim.availableCP / stats.cp) * 100) + '%';
    $('cf-m-prog-text').textContent = Math.min(sim.progression, recipe.progress) + ' / ' + recipe.progress;
    $('cf-m-prog-bar').style.width = Math.min(100, (sim.progression / recipe.progress) * 100) + '%';
    $('cf-m-qual-text').textContent = Math.min(sim.quality, recipe.quality) + ' / ' + recipe.quality;
    $('cf-m-qual-bar').style.width = Math.min(100, (sim.quality / recipe.quality) * 100) + '%';

    $('cf-m-sequence').innerHTML = manualRotation.map(function (a, i) {
      const stepMeta = sim.steps[i] ? conditionMeta(sim.steps[i].state) : null;
      const dot = stepMeta ? '<span class="craft-m-seq-dot ' + stepMeta.cls + '" title="施放當下狀態：' + stepMeta.label + '"></span>' : '';
      return '<span class="craft-m-seq-chip">' + dot + actionIconHtml(a.constructor.name, 16) + actionLabel(a.constructor.name) + '</span>';
    }).join('') || '<span class="craft-muted" style="font-size:12px">尚未選擇技能</span>';

    /* 技能面板重新設計：原本一整排格子沒有分類、看不到CP消耗、更不知道技能實際效果是什麼。
     * 現在依照CRAFT_ACTION_EFFECTS（整理自官方繁中「能工巧匠指南」頁面）分四大類顯示，
     * 每顆按鈕角上有CP徽章（0也照樣顯示，不然玩家會誤以為是漏標，不是真的免費），
     * 滑鼠停留在按鈕上會彈出官方原文的效果說明，不用另外開遊戲確認這顆技能到底在幹嘛。 */
    const actions = manualAvailableActions(stats);
    const CATEGORY_META = {
      progress: { label: '推進度', icon: 'ph-trend-up' },
      quality: { label: '推品質', icon: 'ph-sparkle' },
      buff: { label: '耐久／CP管理', icon: 'ph-shield-check' },
      special: { label: '特殊技能', icon: 'ph-star' },
    };
    const grouped = { progress: [], quality: [], buff: [], special: [] };
    actions.forEach(function (a) {
      const key = a.constructor.name;
      const cat = (CRAFT_ACTION_EFFECTS[key] && CRAFT_ACTION_EFFECTS[key].category) || 'special';
      (grouped[cat] || grouped.special).push(a);
    });
    $('cf-m-skills').innerHTML = ['progress', 'quality', 'buff', 'special'].map(function (cat) {
      const list = grouped[cat];
      if (!list.length) return '';
      const meta = CATEGORY_META[cat];
      return '<div class="craft-m-skill-cat">' +
        '<div class="craft-m-skill-cat-head"><i class="ph ' + meta.icon + '"></i>' + meta.label + '</div>' +
        '<div class="craft-m-skill-cat-grid">' +
          list.map(function (a) {
            const key = a.constructor.name;
            let usable = false;
            try { usable = a.canBeUsed(sim, false, true); } catch (e) { usable = false; }
            const info = CRAFT_ACTION_EFFECTS[key];
            const cp = info && info.cp != null ? info.cp : null;
            const effectHtml = info && info.effect ? info.effect.split('\n').map(function (line) { return escapeHtml(line); }).join('<br>') : '效果說明尚未收錄';
            return '<div class="craft-m-skill-wrap">' +
              '<button type="button" class="craft-m-skill-btn" data-key="' + key + '" ' + (usable ? '' : 'disabled') + '>' +
                (cp != null ? '<span class="craft-m-skill-cp">' + cp + '</span>' : '') +
                actionIconHtml(key, 26) +
                '<span class="craft-m-skill-label">' + actionLabel(key) + '</span>' +
              '</button>' +
              '<div class="craft-m-skill-tooltip"><strong>' + actionLabel(key) + '</strong>' + (cp != null ? '<span class="craft-m-skill-tooltip-cp">CP ' + cp + '</span>' : '') + '<p>' + effectHtml + '</p></div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';
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

  $('cf-m-reset').addEventListener('click', function () {
    if (manualRotation.length === 0) return;
    if (!confirm('要重置手動求解的全部步驟嗎？目前已經排的 ' + manualRotation.length + ' 步會全部清空，這個動作沒辦法復原。')) return;
    manualRotation = [];
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
      $('cf-m-result').innerHTML = '<pre class="craft-macro">' + (e.data.result.macroSegments || []).map(function (s) { return escapeHtml(s.join('\n')); }).join('\n') + '</pre>';
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
    const solvingName = selectedRecipe.name; // 求解當下鎖定名稱，避免中途切換選定配方導致顯示錯亂
    $('cf-progress').style.display = 'block';
    $('cf-progress').textContent = '「' + solvingName + '」求解中⋯';
    function onMsg(e) {
      if (e.data.requestId !== requestId) return;
      if (e.data.type === 'solve-progress') {
        const p = e.data.progress;
        const metric = p.bestCollectability != null ? ('收藏度 ' + p.bestCollectability) : ('優質率約 ' + Math.round(p.bestHqPercent) + '%');
        $('cf-progress').textContent =
          '「' + solvingName + '」求解中⋯ 第 ' + p.trial + '/' + p.totalTrials + ' 輪・第 ' + p.generation + '/' + p.totalGenerations + ' 代' +
          '　目前最佳：' + (p.bestSuccess ? '✓ 已達成・' : '尚未達成・') + metric + '・' + p.bestSteps + ' 步';
        return;
      }
      worker.removeEventListener('message', onMsg);
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-play"></i>開始求解';
      $('cf-progress').style.display = 'none';
      if (!e.data.ok) {
        $('cf-result').style.display = 'block';
        $('cf-result').innerHTML = '<p class="craft-error">「' + solvingName + '」求解失敗：' + e.data.error + '</p>';
        return;
      }
      renderResult(e.data.craft, e.data.result, solvingName, stats, hqIngredients);
    }
    worker.addEventListener('message', onMsg);
    const collectableGoal = $('cf-collectable').checked ? (parseInt($('cf-collectable-goal').value, 10) || 100) : null;
    const hqIngredients = buildHqIngredients();
    worker.postMessage({ type: 'solve', requestId: requestId, recipeId: selectedRecipe.id, stats: stats, options: { lang: 'tw', trials: 3, populationSize: 150, generations: 40, hqIngredients: hqIngredients, collectableGoal: collectableGoal } });
  });

  /* 求解失敗時的診斷建議：原本是拿「還差多少 ÷ 目前做到多少」的線性比例反推大概還要加多少點，
   * 但這個假設完全不成立——遊戲裡進度/品質跟精度不是簡單正比，而且更關鍵的是，這個算法完全沒考慮到
   * 「作業精度提高了，同一個配方要達到滿進度所需的步驟數會變少，省下來的步驟/CP/耐久可以拿去多排品質類技能」
   * 這個連動關係，所以線性外推出來的數字常常是套用到遊戲裡實際上根本用不到、或遠遠低估的無意義數字。
   *
   * 改成「真的把求解器找到的這套技能序列，換上更高的數值重新模擬一次」——不是重新跑一次GA搜尋新手法
   * (太慢)，而是拿同一套手法配合不同數值直接跑 Simulation（一次模擬只要幾毫秒，跟GA搜尋完全不是同一個量級），
   * 用二分搜尋法找出「同一套手法配合多少數值剛好能補滿缺口」，這樣算出來的數字是真的套用遊戲公式跑出來的，
   * 不是憑空外推的比例。如果拉到很誇張的數值、同一套手法還是補不滿（例如根本沒排夠品質技能），
   * 就代表問題出在手法本身分配不夠，不是數值不夠，改用文字建議取代掰不出來的假數字，
   * 品質這邊另外會提醒作業精度其實也有幫助（省下的進度步驟能挪去做品質），不會只死盯著加工精度講。 */
  /* 技能名字字串 -> 真正的技能class實例。result.actionKeys是從worker那邊送過來的名字陣列
   * （前面worker.js那邊已經說明過為什麼不能直接送class實例），這裡用ACTION_BY_KEY查表重建。
   * 這些技能物件本身是無狀態的（邏輯都在方法裡，實際的耐久/CP/品質狀態是外部傳入的Simulation在管），
   * 所以直接重複使用ACTION_BY_KEY裡同一份共用實例、不用每次new一個新的，結果完全等價。 */
  function reconstructActions(actionKeys) {
    return (actionKeys || []).map(function (key) { return ACTION_BY_KEY[key]; }).filter(Boolean);
  }

  function diagnoseFailure(craft, result, stats, hqIngredients) {
    const tips = [];
    const progressGap = craft.progress - Math.min(result.progression, craft.progress);
    const qualityGap = craft.quality > 0 ? craft.quality - Math.min(result.quality, craft.quality) : 0;
    const cpNote = '增加CP可能會增加求解手法（這裡估的是同一套手法換上更多CP，不是重新求解出的新手法）';
    const actions = reconstructActions(result.actionKeys);

    if (progressGap > 0) {
      if (result.progression > 0 && actions.length) {
        const need = estimateStatNeeded(craft, actions, stats, hqIngredients, 'craftsmanship', function (simResult) { return simResult.progression >= craft.progress; });
        tips.push(need != null
          ? '進度還差 ' + progressGap + ' 點：把同一套手法換算過，作業精度加到約 <strong>' + need + '</strong>（目前 ' + stats.craftsmanship + '）就有機會補滿（拿這套手法實際重新模擬算出來的，不是憑比例亂猜的，但實際換手法求解可能有更好的結果）'
          : '進度差距太大，光靠拉高作業精度、用同一套手法補不滿，建議先升等或換更好的裝備再挑戰這個配方');
        const cpNeed = estimateStatNeeded(craft, actions, stats, hqIngredients, 'cp', function (simResult) { return simResult.progression >= craft.progress; });
        if (cpNeed != null && cpNeed > stats.cp) {
          tips.push('或者：CP加到約 <strong>' + cpNeed + '</strong>（目前 ' + stats.cp + '）配合同一套手法也可能補滿（同樣是實際重新模擬算出來的）');
          tips.push(cpNote);
        }
      } else {
        tips.push('目前的數值幾乎做不出進度，建議大幅提升作業精度，或考慮先升等再挑戰這個配方');
      }
    } else if (qualityGap > 0) {
      // 進度已經達成才需要看品質，進度沒過的話品質再高也沒用
      if (result.quality > 0 && actions.length) {
        const need = estimateStatNeeded(craft, actions, stats, hqIngredients, 'control', function (simResult) { return simResult.quality >= craft.quality; });
        tips.push(need != null
          ? '進度沒問題，但品質還差 ' + qualityGap + ' 點：把同一套手法換算過，加工精度加到約 <strong>' + need + '</strong>（目前 ' + stats.control + '）就有機會補滿（拿這套手法實際重新模擬算出來的）'
          : '進度沒問題，但品質差距太大，光靠拉高加工精度、用同一套手法補不滿，代表問題可能出在手法本身排的品質技能不夠多');
        tips.push('作業精度提高其實也可能有幫助：進度需要的步驟變少了，省下來的步驟／CP／耐久可以挪去多排品質類技能，不是只有加工精度這一條路（但這需要重新求解才會排出新的手法，這裡沒辦法直接算給你看）');
        const cpNeed = estimateStatNeeded(craft, actions, stats, hqIngredients, 'cp', function (simResult) { return simResult.quality >= craft.quality; });
        if (cpNeed != null && cpNeed > stats.cp) {
          tips.push('或者：CP加到約 <strong>' + cpNeed + '</strong>（目前 ' + stats.cp + '）配合同一套手法也可能補滿（同樣是實際重新模擬算出來的）');
          tips.push(cpNote);
        }
      } else {
        tips.push('進度沒問題，但目前的手法幾乎沒有品質產出，建議加工精度');
      }
    }
    if (stats.cp && result.cpLeft <= stats.cp * 0.05) tips.push('CP幾乎用完：加 CP 的食物／藥水可能有幫助');
    return tips;
  }

  /* 二分搜尋：同一套技能序列(actions)，只調整某一項數值(statKey)，重新跑一次真正的Simulation，
   * 直到找出「剛好能讓 checkFn 通過」的最小值。search上限抓得很寬(目前值的4倍+3000)，
   * 如果連這麼誇張的數值都補不滿，就回傳null，代表問題不是數值不夠、是手法本身的分配問題。
   * Simulation要吃真正的CrafterStats實例（不是普通物件），這裡照craft-worker.js裡
   * buildCrafterStats的做法原封不動搬過來組，避免傳一個普通物件進去導致模擬結果不準或直接壞掉。 */
  function buildCrafterStatsForSim(stats) {
    const levels = stats.levels || [90, 90, 90, 90, 90, 90, 90, 90];
    const crafterStats = new simulator.CrafterStats(stats.jobId, stats.craftsmanship, stats.control, stats.cp, !!stats.specialist, !!stats.relicTool, stats.level, levels);
    crafterStats.excludedActions = stats.excludedActions || [];
    return crafterStats;
  }
  function estimateStatNeeded(craft, actions, stats, hqIngredients, statKey, checkFn) {
    const lo0 = stats[statKey];
    const hi0 = lo0 * 4 + 3000;
    function simulateWith(value) {
      const testStats = Object.assign({}, stats);
      testStats[statKey] = value;
      const sim = new simulator.Simulation(craft, actions, buildCrafterStatsForSim(testStats), hqIngredients || []);
      return sim.run(true, undefined, true); // safeMode=true，跟主要求解結果的保守假設一致，才有可比性
    }
    if (!checkFn(simulateWith(hi0))) return null; // 連上限都補不滿，是手法問題，不是數值問題
    let lo = lo0, hi = hi0;
    for (let i = 0; i < 22 && hi - lo > 1; i++) {
      const mid = Math.floor((lo + hi) / 2);
      if (checkFn(simulateWith(mid))) hi = mid; else lo = mid + 1;
    }
    return hi;
  }

  function bar(label, cur, max, cls) {
    const pct = max ? Math.min(100, Math.round(cur / max * 100)) : 0;
    return '<div class="craft-bar-row"><div class="craft-bar-label"><span>' + label + '</span><span>' + cur.toLocaleString() + ' / ' + max.toLocaleString() + '</span></div>' +
      '<div class="craft-bar-track"><div class="craft-bar-fill ' + cls + '" style="width:' + pct + '%"></div></div></div>';
  }

  /* 耐久顏色：依剩餘比例做藍→黃→紅的連續漸層插值，不是三段式跳色 */
  function durabilityColor(pct) {
    function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
    const blue = [79, 180, 224], yellow = [224, 194, 63], red = [224, 131, 122];
    let c;
    if (pct > 0.5) { const t = (pct - 0.5) / 0.5; c = [lerp(yellow[0], blue[0], t), lerp(yellow[1], blue[1], t), lerp(yellow[2], blue[2], t)]; }
    else { const t = pct / 0.5; c = [lerp(red[0], yellow[0], t), lerp(red[1], yellow[1], t), lerp(red[2], yellow[2], t)]; }
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  /* 耐久是每10耐久一個方格（跟遊戲一樣），顏色隨剩餘比例從藍變黃再變紅；自動求解結果、手動模式共用這一套 */
  function durabilityBlocksHtml(cur, max) {
    const pct = max ? cur / max : 0;
    const color = durabilityColor(pct);
    const segs = Math.max(1, Math.ceil(max / 10));
    return Array.from({ length: segs }).map(function (_, i) {
      const capacity = Math.min(10, max - i * 10);
      const remain = Math.max(0, Math.min(capacity, cur - i * 10));
      const fillPct = capacity ? Math.round(remain / capacity * 100) : 0;
      return '<span class="craft-dur-block"><span class="craft-dur-block-fill" style="width:' + fillPct + '%;background:' + color + '"></span></span>';
    }).join('');
  }

  function durabilityBadge(cur, max) {
    return '<div class="craft-meta-dur"><div class="craft-bar-label"><span><i class="ph ph-wrench"></i>耐久</span><span>' + cur + ' / ' + max + '</span></div><div class="craft-dur-blocks">' + durabilityBlocksHtml(cur, max) + '</div></div>';
  }

  function renderResult(craft, result, solvingName, stats, hqIngredients) {
    const box = $('cf-result');
    box.style.display = 'block';
    const statusClass = result.success ? 'craft-status-ok' : 'craft-status-fail';
    // 進度或品質有缺口就顯示診斷建議，不限定一定要「求解失敗」——
    // 進度滿但品質沒滿時，遊戲判定其實是成功(result.success===true)，但玩家還是會想知道怎麼樣能更接近滿品質
    const hasQualityGap = craft.quality > 0 && result.quality < craft.quality;
    /* 診斷建議是錦上添花的附加功能，絕對不能因為它自己出問題就連累到下面主要結果畫面沒辦法正常畫出來
     * ——這正是這次「換配方求解，結果卻停在舊配方」bug的根本教訓：診斷邏輯丟例外，
     * 函式提早中斷，box.innerHTML沒被寫到新內容，畫面就卡在上一次的舊結果上。
     * 包一層try/catch當最後防線，就算以後這段又有沒發現的問題，最多是少一條建議，
     * 不會再讓整個結果畫面掛掉。 */
    let tips = [];
    if (stats && (!result.success || hasQualityGap)) {
      try { tips = diagnoseFailure(craft, result, stats, hqIngredients); }
      catch (e) { console.warn('診斷建議計算失敗（不影響主要結果顯示）:', e); tips = []; }
    }
    box.innerHTML =
      (solvingName ? '<p class="craft-result-title">「' + solvingName + '」求解結果</p>' : '') +
      bar('進度', Math.min(result.progression, craft.progress), craft.progress, 'craft-fill-progress') +
      bar('品質', Math.min(result.quality, craft.quality), craft.quality, 'craft-fill-quality') +
      '<div class="craft-result-meta">' +
        durabilityBadge(result.durabilityLeft, craft.durability) +
        '<div class="craft-meta-cp"><div class="craft-bar-label"><span><i class="ph ph-sparkle"></i>CP</span><span>' + result.cpLeft + ' / ' + (lastCpMax || result.cpLeft) + '</span></div><div class="craft-bar-track"><div class="craft-bar-fill craft-fill-cp" style="width:' + Math.max(0, Math.round(result.cpLeft / (lastCpMax || result.cpLeft) * 100)) + '%"></div></div></div>' +
      '</div>' +
      '<div class="craft-hq-line ' + statusClass + '">' + (result.success ? '✓ 成功' : '✕ 未達成（已盡量算出完成度最高的手法，但這組數值/技能組合湊不到 100% 進度）') + '・' + (result.collectability != null ? '收藏度 ' + result.collectability : '優質率約 ' + Math.round(result.hqPercent) + '%') + '・' + result.steps + ' 步</div>' +
      (tips.length ? '<div class="craft-diagnosis"><p class="craft-diagnosis-title"><i class="ph ph-lightbulb"></i>' + (result.success ? '怎麼樣品質可能更高' : '怎麼樣可能就過了') + '（估計，不是保證）</p><ul>' + tips.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>' : '') +
      (result.success ? (
        '<div class="craft-macro-head"><span class="craft-muted">巨集（繁中，可直接貼入遊戲，' + ((result.macroSegments || []).length > 1 ? '遊戲一組巨集最多15行，分成' + result.macroSegments.length + '段，要分開貼進不同的巨集欄位' : '可直接貼入遊戲') + '）</span></div>' +
        (result.macroSegments || []).map(function (seg, i) {
          return '<div class="craft-macro-block">' +
            ((result.macroSegments.length > 1) ? '<div class="craft-macro-seg-head"><span>第 ' + (i + 1) + ' 段（' + seg.length + ' 行）</span><button type="button" class="craft-copy-btn craft-macro-copy-btn" data-seg="' + i + '"><i class="ph ph-copy"></i>複製第' + (i + 1) + '段</button></div>' : '<div class="craft-macro-seg-head"><span></span><button type="button" class="craft-copy-btn craft-macro-copy-btn" data-seg="' + i + '"><i class="ph ph-copy"></i>複製</button></div>') +
            '<pre class="craft-macro">' + escapeHtml(seg.join('\n')) + '</pre>' +
          '</div>';
        }).join('')
      ) : '');

    if (result.success) {
      // 每一段各自獨立複製，不能只給一顆「全部複製」按鈕——遊戲一組巨集本來就只能塞15行，
      // 會切成好幾段正是因為塞不下同一組，如果複製出來是全部段落黏在一起，貼回遊戲一樣會超過行數塞不下，
      // 等於白切了。
      box.querySelectorAll('.craft-macro-copy-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const i = parseInt(btn.dataset.seg, 10);
          const text = (result.macroSegments[i] || []).join('\n');
          navigator.clipboard.writeText(text);
          const original = btn.innerHTML;
          btn.innerHTML = '<i class="ph ph-check"></i>已複製';
          setTimeout(function () { btn.innerHTML = original; }, 1500);
        });
      });
    }
  }

  $('cf-collectable').addEventListener('change', function () {
    $('cf-collectable-goal-wrap').style.display = $('cf-collectable').checked ? 'flex' : 'none';
  });

  /* 「使用個人設定檔」這個開關本身也記住，重新整理頁面不用重新勾一次 */
  const PROFILE_MODE_KEY = 'craftProfileModeOn:v1';
  $('cf-profile-mode').addEventListener('change', function () {
    try { localStorage.setItem(PROFILE_MODE_KEY, this.checked ? '1' : '0'); } catch (e) { /* 存不進去就算了 */ }
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

  /* 個人設定檔模式的初始化要放在loadProfile()之後，不然會被上面「記住上次設定」的還原值蓋掉。
   * 如果上次有開著設定檔模式，這裡才是真正決定欄位最終值的地方：套用目前職業已存的設定檔數值。 */
  if (localStorage.getItem(PROFILE_MODE_KEY) === '1') {
    $('cf-profile-mode').checked = true;
    lastJobId = parseInt($('cf-job').value, 10);
    loadProfileToFields(lastJobId);
    setJobFilterSilent(lastJobId);
    recalcStats();
    renderSpecialActions();
  }
  syncProfileUiMode();
};
