/* market-panel.js — 市場頁：以物品為中心的查詢/探索頁面，跟生產頁分工不同
 * （生產頁＝效率導向操作面板，市場頁＝探索導向資訊展示），但底層資料層完全共用 MarketData／
 * CRAFT_RECIPES，但 ITEM_TO_RECIPES／ITEM_USED_IN 是生產工具內部的私有索引，市場頁拿不到，
 * 這裡另外用 buildToRecipesIndex()／buildUsedInIndex() 各自建立一份對等的索引，不重新設計邏輯，
 * 只是換一個地方各自維護——這也是先前答應過、要等市場頁穩定後再回頭考慮共用的技術債之一。
 *
 * 這一版只做骨架：搜尋框（接上全物品繁中名稱索引）＋市場設定摘要＋兩個分頁的空殼，
 * 物品詳情頁的實際內容（價格/走勢/供應鏈視覺化）跟機會雷達排行榜之後再疊上去。 */
(function () {
  // app 是 app.js 用「const app = {...}」宣告的全域物件，不是掛在 window.app 上，
  // 這裡直接用同一個全域識別字就好，不要再重新宣告一次（重新宣告會變成一個沒人在用的假物件，
  // 之前就是這裡寫錯，導致 nav.js 呼叫的 app.nav() 找不到 buildMarket，市場頁才會整頁空白）。

  app.buildMarket = function () {
    const root = document.getElementById('market-root');
    if (!root) return;

    root.innerHTML = '<div class="craft-loading"><span class="craft-loading-icon">⚖</span><span>載入物品資料中⋯</span></div>';

    // 市場頁只需要「全物品名稱索引」＋「市場資料層」，不需要 craft-data.js 那份好幾MB的配方庫，
    // 除非之後要顯示供應鏈視覺化，那時候才臨時另外載入 craft-data.js（用 typeof 判斷避免重複載入）。
    const need = [];
    if (typeof ITEM_NAMES_TW_ALL === 'undefined') need.push('js/item-names-tw.js');
    if (typeof ITEM_ICONS_TW_ALL === 'undefined') need.push('js/item-icons-tw.js');
    if (typeof MarketData === 'undefined') need.push('js/market-data.js');

    if (!need.length) { renderMarketSkeleton(); return; }
    let loaded = 0;
    need.forEach(function (src) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { loaded++; if (loaded === need.length) renderMarketSkeleton(); };
      s.onerror = function () {
        root.innerHTML = '<div class="craft-loading craft-error">資料載入失敗，請重新整理再試一次。</div>';
      };
      document.body.appendChild(s);
    });
  };

  function $(id) { return document.getElementById(id); }

  function renderMarketSkeleton() {
    const root = document.getElementById('market-root');
    root.innerHTML =
      '<div class="market-top-fixed">' +
        '<div class="market-header">' +
          '<h2 class="unified-gold-header small">⚖ 市場</h2>' +
          '<p class="elegant-body-text page-note">查詢單一物品的即時價格、跨服比價與供應鏈，或看看最近交易熱度排行。</p>' +
        '</div>' +
        '<div class="market-recent-row" id="mk-recent-row"></div>' +
        '<div class="market-searchbar">' +
          '<div class="market-search-box">' +
            '<input id="mk-search" class="craft-search" placeholder="搜尋物品名稱⋯" autocomplete="off" />' +
            '<div id="mk-search-results" class="craft-search-results"></div>' +
          '</div>' +
          '<button type="button" id="mk-settings-btn" class="craft-mat-worlds-icon" style="width:auto;padding:0 10px;gap:6px" title="設定資料中心／我的世界">' +
            '<i class="ph ph-gear"></i><span id="mk-settings-summary" class="market-settings-text">尚未設定市場資訊</span>' +
          '</button>' +
        '</div>' +
        '<div id="mk-watchlist-panel" class="market-watchlist-panel"></div>' +
        '<div class="market-tabs">' +
          '<button type="button" class="craft-tab-btn active" data-mk-tab="item">物品查詢</button>' +
          '<button type="button" class="craft-tab-btn" data-mk-tab="radar">機會雷達</button>' +
          '<button type="button" class="craft-tab-btn" data-mk-tab="hot">熱度排行</button>' +
        '</div>' +
      '</div>' +
      '<div class="market-panes-flex">' +
        '<div id="mk-pane-item" class="market-pane">' +
          '<p class="craft-muted">搜尋一個物品開始查詢——即時價格、跨服比價、銷售速度，如果是可製作品還會顯示完整供應鏈。</p>' +
        '</div>' +
        '<div id="mk-pane-radar" class="market-pane" style="display:none"></div>' +
        '<div id="mk-pane-hot" class="market-pane" style="display:none"></div>' +
      '</div>';

    updateMarketSettingsSummary();
    renderRecentlyViewed();
    renderWatchlistPanel();
    bindSearchBox();
    bindTabSwitch();
    renderRadarShell();

    $('mk-settings-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      openMarketSettingsPopover(this);
    });
  }

  function updateMarketSettingsSummary() {
    const el = $('mk-settings-summary');
    if (!el || typeof MarketData === 'undefined') return;
    const s = MarketData.getSettings();
    const parts = [];
    if (s.dcName) {
      parts.push(s.dcName + (s.worldName ? '・' + s.worldName : ''));
      if (s.worldName) parts.push(s.sellCityKey ? '手動選城市稅率' : '自動最低稅率');
    }
    el.textContent = parts.length ? parts.join('・') : '尚未設定市場資訊';
  }

  /* 市場設定彈出卡：生產頁craft-panel.js裡已經有一份幾乎一樣的邏輯（cf-market-*系列），
   * 這裡先各自維護一份簡化版，等市場頁功能穩定後再考慮抽成共用元件——現階段兩邊都還在變動，
   * 太早抽共用反而互相牽制，之後有餘力再做這個重構。
   * 第4點：原本漏了「賣出城市」這一欄——沒有這個選項，稅後估算就只能死板套用「目前最低稅率」，
   * 玩家沒辦法照自己角色實際退休/常去的城市去算。這裡補上，跟生產頁同一套邏輯：資料中心決定
   * 「買」的查價範圍，世界決定「賣」的查價範圍，城市決定賣方稅率，不選城市就自動用目前最低稅率。 */
  function ensureSettingsPopoverDom() {
    let pop = $('mk-settings-popover');
    if (pop) return pop;
    pop = document.createElement('div');
    pop.id = 'mk-settings-popover';
    pop.className = 'craft-mat-worlds-popover craft-settings-popover';
    pop.style.display = 'none';
    pop.innerHTML =
      '<p class="craft-mat-worlds-title">市場設定</p>' +
      '<div class="craft-settings-field"><label>資料中心<span class="craft-muted">（材料成本查詢範圍）</span></label><select id="mk-set-dc" class="craft-select craft-select-block"><option value="">資料中心⋯</option></select></div>' +
      '<div class="craft-settings-field"><label>我的世界<span class="craft-muted">（賣出參考只看這裡）</span></label><select id="mk-set-world" class="craft-select craft-select-block"><option value="">我的世界⋯</option></select></div>' +
      '<div class="craft-settings-field" id="mk-set-city-field" style="display:none"><label>賣出城市<span class="craft-muted">（決定賣方稅率）</span></label><select id="mk-set-city" class="craft-select craft-select-block"></select></div>';
    document.body.appendChild(pop);
    $('mk-set-dc').addEventListener('change', async function () {
      await MarketData.setDataCenter(this.value);
      const worlds = this.value ? await MarketData.listWorldNamesInDc(this.value) : [];
      $('mk-set-world').innerHTML = '<option value="">我的世界⋯</option>' + worlds.map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('');
      await refreshCitySelectOptions(null, null);
      updateMarketSettingsSummary();
      refreshMarketDependentDisplays();
    });
    $('mk-set-world').addEventListener('change', async function () {
      await MarketData.setWorld(this.value);
      await refreshCitySelectOptions(this.value, null);
      updateMarketSettingsSummary();
      refreshMarketDependentDisplays();
    });
    $('mk-set-city').addEventListener('change', function () {
      MarketData.setSellCity(this.value || null);
      updateMarketSettingsSummary();
      refreshMarketDependentDisplays();
    });
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { pop.style.display = 'none'; });
    return pop;
  }

  async function refreshCitySelectOptions(worldNameStr, presetCityKey) {
    const citySel = $('mk-set-city');
    const field = $('mk-set-city-field');
    if (!worldNameStr) { field.style.display = 'none'; citySel.innerHTML = ''; return; }
    const cities = await MarketData.listSellCities(worldNameStr);
    if (!cities.length) { field.style.display = 'none'; citySel.innerHTML = ''; return; }
    citySel.innerHTML = '<option value="">自動（目前最低稅率）</option>' +
      cities.map(function (c) { return '<option value="' + c.cityKey + '">' + c.cityName + '（稅率' + c.percent + '%）</option>'; }).join('');
    citySel.value = presetCityKey || '';
    field.style.display = 'block';
  }

  // 設定一改（世界/城市/DC），正在看的物品詳情跟正在顯示的機會雷達都要立刻反映新假設，
  // 不然玩家選了別的賣出城市，畫面卻還停在舊稅率算出來的數字，會誤判。
  function refreshMarketDependentDisplays() {
    if (currentDetailItemId) loadMarketSection(currentDetailItemId);
    const activeJobBtn = document.querySelector('[data-mk-radar-job].active');
    if (activeJobBtn) runRadarScan(parseInt(activeJobBtn.dataset.mkRadarJob, 10), true);
  }

  async function openMarketSettingsPopover(anchorBtn) {
    const pop = ensureSettingsPopoverDom();
    try {
      const dcNames = await MarketData.listDcNames();
      $('mk-set-dc').innerHTML = '<option value="">資料中心⋯</option>' + dcNames.map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('');
      const saved = MarketData.getSettings();
      if (saved.dcName) {
        $('mk-set-dc').value = saved.dcName;
        const worlds = await MarketData.listWorldNamesInDc(saved.dcName);
        $('mk-set-world').innerHTML = '<option value="">我的世界⋯</option>' + worlds.map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('');
        if (saved.worldName) {
          $('mk-set-world').value = saved.worldName;
          await refreshCitySelectOptions(saved.worldName, saved.sellCityKey);
        }
      }
    } catch (e) { /* 抓不到清單就先不管，畫面照常運作 */ }
    pop.style.display = 'flex';
    const r = anchorBtn.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 280)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
  }

  /* 搜尋框：直接查 ITEM_NAMES_TW_ALL（全物品，不限配方相關），跟生產頁的配方搜尋是兩套獨立索引，
   * 市場頁本來就該看得到裝備/雜物/家具這些不會出現在配方庫裡的東西。 */
  function bindSearchBox() {
    const input = $('mk-search');
    const box = $('mk-search-results');
    let debounceTimer = null;
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runSearch, 120);
    });
    function runSearch() {
      const q = input.value.trim();
      if (!q) { box.innerHTML = ''; box.classList.remove('open'); return; }
      const ids = Object.keys(ITEM_NAMES_TW_ALL);
      const matches = [];
      for (let i = 0; i < ids.length; i++) {
        const name = ITEM_NAMES_TW_ALL[ids[i]];
        if (name && name.indexOf(q) !== -1) matches.push({ id: ids[i], name: name });
      }
      // 第5點抓到的真正原因：純粹按物品ID排序，會讓「基礎材料」被自己衍生出來的一大堆裝備
      // 名稱排擠出前30名——例如「銀狼革」這個素材本身的ID，剛好比拿它做出來的33件裝備的ID都大，
      // 純ID排序下，光是這些裝備就佔滿了前30名，真正要找的素材反而看不到。不是抓不到資料
      // （這個物品在供應鏈圖上能正確顯示價格，證明資料完全存在），純粹是排序方式的問題。
      // 改成先比對「符合程度」：完全等於搜尋字串 > 開頭符合 > 只是包含在中間；
      // 同等級再比名字長度（越短越接近你在找的東西），最後才用ID排序當保底。
      function rank(name) {
        if (name === q) return 0;
        if (name.indexOf(q) === 0) return 1;
        return 2;
      }
      matches.sort(function (a, b) {
        const ra = rank(a.name), rb = rank(b.name);
        if (ra !== rb) return ra - rb;
        if (a.name.length !== b.name.length) return a.name.length - b.name.length;
        return Number(a.id) - Number(b.id);
      });
      // 原本這裡會砍到只留前30筆，是我自己加的上限，怕一次塞太多DOM節點卡頓。
      // 現在下拉清單本身有自己的捲軸能正常捲動，這個限制沒必要，拿掉——搜尋結果要列出全部。
      if (!matches.length) { box.innerHTML = '<div class="craft-muted" style="padding:8px">查無符合的物品</div>'; box.classList.add('open'); return; }
      box.innerHTML = matches.map(function (m) {
        return '<div class="craft-search-item" data-mk-pick="' + m.id + '">' + itemIconHtml(m.id, 24) + '<span>' + m.name + '</span></div>';
      }).join('');
      box.classList.add('open');
      box.querySelectorAll('[data-mk-pick]').forEach(function (el) {
        el.addEventListener('click', function () {
          input.value = el.textContent;
          box.innerHTML = ''; box.classList.remove('open');
          openItemDetail(el.dataset.mkPick);
        });
      });
    }
    document.addEventListener('click', function (e) {
      if (!box.contains(e.target) && e.target !== input) { box.classList.remove('open'); }
    });
  }

  function bindTabSwitch() {
    document.querySelectorAll('[data-mk-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-mk-tab]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        const tab = btn.dataset.mkTab;
        $('mk-pane-item').style.display = tab === 'item' ? 'block' : 'none';
        $('mk-pane-radar').style.display = tab === 'radar' ? 'block' : 'none';
        $('mk-pane-hot').style.display = tab === 'hot' ? 'block' : 'none';
        if (tab === 'hot' && !$('mk-pane-hot').dataset.rendered) {
          $('mk-pane-hot').dataset.rendered = '1';
          renderHotShell();
        }
      });
    });
  }

  /* 最近查看：純本機 localStorage，零維護，不用帳號、不用後端。之後點進物品詳情頁時
   * 會呼叫 recordRecentlyViewed() 把當下這個物品記進來，這裡先只做「讀出來顯示」的部分。 */
  const RECENT_KEY = 'ff14fc-market-recent';
  function getRecentlyViewed() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
  }
  function recordRecentlyViewed(itemId, name) {
    try {
      let list = getRecentlyViewed().filter(function (r) { return r.id !== itemId; });
      list.unshift({ id: itemId, name: name });
      list = list.slice(0, 20);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) { /* localStorage被封鎖（例如私密瀏覽）就靜默放棄，不影響其他功能 */ }
  }
  function renderRecentlyViewed() {
    const row = $('mk-recent-row');
    const list = getRecentlyViewed();
    if (!list.length) { row.innerHTML = ''; return; }
    row.innerHTML = '<span class="craft-muted market-recent-label">最近查看：</span>' +
      list.map(function (r) {
        return '<button type="button" class="market-recent-chip" data-mk-recent="' + r.id + '">' + itemIconHtml(r.id, 18) + '<span>' + r.name + '</span></button>';
      }).join('');
    row.querySelectorAll('[data-mk-recent]').forEach(function (el) {
      el.addEventListener('click', function () { openItemDetail(el.dataset.mkRecent); });
    });
  }

  /* 物品詳情頁：即時跨服比價、銷售速度、（可製作品）供應鏈視覺化、被用在哪的反查。
   * 供應鏈那塊才需要載入 craft-data.js（好幾MB），其他資訊只需要 MarketData，
   * 所以市場資訊跟供應鏈分開兩個區塊、分開非同步載入，市場資訊不用等配方資料回來才顯示。 */
  let currentDetailItemId = null; // 目前物品詳情頁顯示的itemId，市場設定一改要用這個判斷要不要重算
  let marketUsedInIndex = null; // 延遲建立的反查表：itemId -> [recipeId]，只在真的需要時掃一次 CRAFT_RECIPES
  let marketToRecipesIndex = null; // 同樣道理：itemId -> [recipeId]，這個物品「本身」可以用哪個配方做出來

  /* 第9點：資料集裡有281筆配方 itemId=0、twAvailable=false——這些是全球版有、但台服目前
   * 沒有的物品，資料來源沒辦法對到台服的物品ID，所以留了個0佔位，但先前索引時沒有濾掉，
   * 才會在「被用在」清單這類地方冒出圖示是方塊、名稱是「0」的怪東西。從源頭索引就濾掉，
   * 下游（用途清單、往上鑽、搜尋等）都不用再各自判斷。 */
  function isTwRecipe(recipe) {
    return !!recipe && recipe.twAvailable !== false && !!recipe.itemId;
  }
  function buildUsedInIndex() {
    if (marketUsedInIndex) return marketUsedInIndex;
    marketUsedInIndex = {};
    Object.keys(CRAFT_RECIPES).forEach(function (rid) {
      const recipe = CRAFT_RECIPES[rid];
      if (!isTwRecipe(recipe)) return;
      (recipe.ingredients || []).forEach(function (ing) {
        if (!marketUsedInIndex[ing.itemId]) marketUsedInIndex[ing.itemId] = [];
        marketUsedInIndex[ing.itemId].push(rid);
      });
    });
    return marketUsedInIndex;
  }

  function buildToRecipesIndex() {
    if (marketToRecipesIndex) return marketToRecipesIndex;
    marketToRecipesIndex = {};
    Object.keys(CRAFT_RECIPES).forEach(function (rid) {
      const recipe = CRAFT_RECIPES[rid];
      if (!isTwRecipe(recipe)) return;
      const outId = recipe.itemId;
      if (!marketToRecipesIndex[outId]) marketToRecipesIndex[outId] = [];
      marketToRecipesIndex[outId].push(rid);
    });
    return marketToRecipesIndex;
  }

  // HQ標示：改回文字＋外框樣式（NQ不加任何符號）
  function hqIconHtml() {
    return '<span class="market-hq-tag">HQ</span>';
  }

  function itemIconHtml(itemId, size) {
    const url = (typeof ITEM_ICONS_TW_ALL !== 'undefined' && ITEM_ICONS_TW_ALL[itemId]) || null;
    return url
      ? '<img src="' + url + '" width="' + size + '" height="' + size + '" class="market-item-icon" alt="" loading="lazy">'
      : '<span class="market-item-icon market-item-icon-fallback" style="width:' + size + 'px;height:' + size + 'px"><i class="ph ph-cube"></i></span>';
  }

  function openItemDetail(itemId) {
    itemId = String(itemId);
    const name = ITEM_NAMES_TW_ALL[itemId] || ('#' + itemId);
    recordRecentlyViewed(itemId, name);
    renderRecentlyViewed();
    document.querySelector('[data-mk-tab="item"]').click();
    currentDetailItemId = itemId;
    $('mk-pane-item').innerHTML =
      '<div class="market-detail-header">' + itemIconHtml(itemId, 40) + '<h3>' + name + '</h3>' +
        '<button type="button" class="market-history-btn market-watch-btn-header" id="mk-watch-btn"></button>' +
      '</div>' +
      '<div class="market-detail-columns">' +
        '<div id="mk-detail-market" class="market-detail-section market-col-market"><p class="craft-muted">讀取市場資料中⋯</p></div>' +
        '<div class="market-detail-section market-col-supply">' +
          '<div id="mk-detail-supply"></div>' +
        '</div>' +
      '</div>';
    bindWatchButton(itemId); // 跟名稱同一行，不用等市場資料回來才看得到，關注這件事跟查不查得到價格無關
    loadMarketSection(itemId);
    loadSupplyChainSection(itemId);
  }

  function timeAgo(unixSeconds) {
    const diff = Date.now() / 1000 - unixSeconds;
    if (diff < 3600) return Math.max(1, Math.round(diff / 60)) + '分鐘前';
    if (diff < 86400) return Math.round(diff / 3600) + '小時前';
    return Math.round(diff / 86400) + '天前';
  }

  /* 第8點：市場走勢圖。資料就是overview.history（近期實際成交紀錄，Universalis本來就有回傳，
   * 只是之前沒有拿來畫圖），用純手刻SVG折線，不引入額外圖表函式庫，維持低維護的原則。
   * 第2點修正：HQ改用星形（比三角形更接近「精良」的視覺聯想），並且補上簡單的X/Y軸標示——
   * Y軸標最低/最高價，X軸標最早/最新日期，兩側各加一個小小的軸標題（價格／時間），
   * 不是完整座標刻度線那種正式圖表，但至少看得出「這條線代表什麼範圍」，不是憑空一條線。
   * 第5點：成交熱絡的道具，一天可能有幾十筆成交，每一筆都畫成一個點會擠成一團看不清楚。
   * 超過門檻時改成「以天為單位」分組——同一天的NQ成交取平均、HQ成交取平均，最多變成
   * 一天2個點，還是保留NQ/HQ分開看的意義，但密度大幅降低，滑鼠移上去會告訴你那天平均了幾筆。 */
  function bucketByDay(pts) {
    const byDay = {};
    pts.forEach(function (h) {
      const dayKey = new Date(h.timestamp * 1000).toLocaleDateString();
      const hqKey = dayKey + (h.hq ? ':hq' : ':nq');
      if (!byDay[hqKey]) byDay[hqKey] = { sum: 0, count: 0, hq: h.hq, timestamp: h.timestamp };
      byDay[hqKey].sum += h.pricePerUnit;
      byDay[hqKey].count++;
      byDay[hqKey].timestamp = Math.max(byDay[hqKey].timestamp, h.timestamp);
    });
    return Object.keys(byDay).map(function (k) {
      const b = byDay[k];
      return { pricePerUnit: Math.round(b.sum / b.count), hq: b.hq, timestamp: b.timestamp, bucketCount: b.count };
    }).sort(function (a, b) { return b.timestamp - a.timestamp; });
  }
  function renderTrendChart(rawPts) {
    if (!rawPts || rawPts.length < 2) return '<p class="craft-muted" style="padding:12px 0">這個區間內沒有足夠的成交紀錄可以畫圖，換個區間試試。</p>';
    const DENSITY_THRESHOLD = 40;
    const bucketed = rawPts.length > DENSITY_THRESHOLD;
    const pts = bucketed ? bucketByDay(rawPts) : rawPts;
    const ordered = pts.slice().reverse(); // 由舊到新，由左到右畫
    const W = 560, H = 190, PADL = 46, PADR = 14, PADT = 14, PADB = 34;
    const prices = ordered.map(function (h) { return h.pricePerUnit; });
    const min = Math.min.apply(null, prices), max = Math.max.apply(null, prices);
    const range = (max - min) || 1;
    function xy(i, p) {
      const x = PADL + (ordered.length > 1 ? (i / (ordered.length - 1)) : 0) * (W - PADL - PADR);
      const y = H - PADB - ((p - min) / range) * (H - PADT - PADB);
      return { x: x, y: y };
    }
    const linePath = ordered.map(function (h, i) {
      const p = xy(i, h.pricePerUnit);
      return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1);
    }).join(' ');
    const dots = ordered.map(function (h, i) {
      const p = xy(i, h.pricePerUnit);
      const when = new Date(h.timestamp * 1000).toLocaleDateString();
      const countNote = bucketed ? '（當天平均，' + h.bucketCount + '筆）' : '';
      const label = h.pricePerUnit.toLocaleString() + '金' + (h.hq ? '（HQ）' : '（NQ）') + countNote + ' · ' + when;
      // HQ=星形、NQ=圓形，輪廓差異夠大，不用靠顏色也能秒分辨（色盲友善）
      if (h.hq) {
        const cx = p.x, cy = p.y, rOuter = 6, rInner = 2.6;
        let starPts = '';
        for (let k = 0; k < 10; k++) {
          const ang = (Math.PI / 5) * k - Math.PI / 2;
          const rr = k % 2 === 0 ? rOuter : rInner;
          starPts += (cx + rr * Math.cos(ang)).toFixed(1) + ',' + (cy + rr * Math.sin(ang)).toFixed(1) + ' ';
        }
        return '<polygon points="' + starPts.trim() + '" fill="#fcf6ba" stroke="#3a2f1a" stroke-width="0.8"><title>' + label + '</title></polygon>';
      }
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.2" fill="#8fb3ff" stroke="#1a2a3a" stroke-width="0.8"><title>' + label + '</title></circle>';
    }).join('');
    const earliestDate = new Date(ordered[0].timestamp * 1000).toLocaleDateString();
    const latestDate = new Date(ordered[ordered.length - 1].timestamp * 1000).toLocaleDateString();
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="market-trend-svg">' +
        // Y軸：最低/最高價 + 軸標題
        '<text x="' + (PADL - 6) + '" y="' + (H - PADB) + '" text-anchor="end" font-size="10" fill="#999">' + min.toLocaleString() + '</text>' +
        '<text x="' + (PADL - 6) + '" y="' + (PADT + 8) + '" text-anchor="end" font-size="10" fill="#999">' + max.toLocaleString() + '</text>' +
        '<text x="10" y="' + (H / 2) + '" text-anchor="middle" font-size="10" fill="#777" transform="rotate(-90 10 ' + (H / 2) + ')">價格（金）</text>' +
        // X軸：最早/最新日期 + 軸標題
        '<text x="' + PADL + '" y="' + (H - 8) + '" text-anchor="start" font-size="10" fill="#999">' + earliestDate + '</text>' +
        '<text x="' + (W - PADR) + '" y="' + (H - 8) + '" text-anchor="end" font-size="10" fill="#999">' + latestDate + '</text>' +
        '<text x="' + (W / 2) + '" y="' + (H - 20) + '" text-anchor="middle" font-size="10" fill="#777">時間</text>' +
        '<line x1="' + PADL + '" y1="' + (H - PADB) + '" x2="' + (W - PADR) + '" y2="' + (H - PADB) + '" stroke="var(--tb)" stroke-width="1"/>' +
        '<path d="' + linePath + '" fill="none" stroke="#c5a059" stroke-width="1.5" opacity="0.8"/>' + dots +
      '</svg>' +
      (bucketed ? '<p class="craft-muted" style="font-size:10px;margin-top:2px">這段時間成交較多筆，已按「天」分組取平均顯示（每天最多NQ/HQ各一點），避免點位擠成一團看不清楚；把滑鼠移到點上可以看到那天平均了幾筆。</p>' : '');
  }

  async function loadMarketSection(itemId) {
    const box = $('mk-detail-market');
    if (!MarketData.getSettings().dcName) {
      box.innerHTML = '<p class="craft-muted">尚未設定資料中心，點右上角「設定」後才能查價。</p>';
      return;
    }
    const out = await Promise.all([
      MarketData.getItemMarketOverview(itemId).catch(function () { return null; }),
      MarketData.fetchSaleVelocity(itemId).catch(function () { return null; }),
      MarketData.getSettings().worldName ? MarketData.getSellTaxInfo(MarketData.getSettings().worldName).catch(function () { return null; }) : Promise.resolve(null),
    ]);
    const overview = out[0], velocity = out[1], taxInfo = out[2];
    let html = '';

    /* 統計摘要全部濃縮成一條可換行的徽章列（第1點）：原本每個數字各自佔一整行<p>，
     * 五六行文字疊起來就把左欄一半版面吃掉，擠壓到下面清單能顯示的筆數。改成徽章後
     * 同一條列最多換行兩次，省下來的高度直接讓清單多顯示好幾筆，不用大量捲動才看得到。
     * 最低價是目前真實存在、有競爭力的參考數字，擺第一個；均價/最高價只是輔助參考。 */
    const badgeParts = [];
    if (overview && overview.minPrice) badgeParts.push('<span class="market-stat-badge market-stat-badge-strong">目前最低 ' + overview.minPrice.toLocaleString() + '金</span>');
    if (overview && overview.avgPrice) badgeParts.push('<span class="market-stat-badge">均價 ' + Math.round(overview.avgPrice).toLocaleString() + '金</span>');
    if (overview && overview.maxPrice) badgeParts.push('<span class="market-stat-badge">最高 ' + overview.maxPrice.toLocaleString() + '金</span>');
    if (velocity && (velocity.nqVelocityPerDay != null || velocity.hqVelocityPerDay != null)) {
      const scopeNote = velocity.usedScope === 'world' ? '' : '（DC）';
      badgeParts.push('<span class="market-stat-badge">賣速 NQ ' + (velocity.nqVelocityPerDay || 0).toFixed(1) + '/天　HQ ' + (velocity.hqVelocityPerDay || 0).toFixed(1) + '/天' + scopeNote + '</span>');
    } else if (velocity && velocity.usedScope === null) {
      badgeParts.push('<span class="market-stat-badge market-stat-badge-muted">近4天查無成交</span>');
    }
    // 買賣方稅率／資料新鮮度是輔助小字，跟徽章列分開放，但合併成一行，不再各佔一整行<p>。
    // 稅後估算基準用目前最低掛單價，不是均價：要有競爭力就得訂在最低價附近，均價不是你實際能賣到的價格。
    const footNotes = [];
    if (taxInfo && overview && overview.minPrice) {
      const netMin = Math.round(overview.minPrice * (1 - taxInfo.ratePercent / 100));
      footNotes.push('貼最低價在' + taxInfo.cityName + '寄售（稅率最低，扣' + (Math.round(taxInfo.ratePercent * 10) / 10) + '%）約拿 <span style="color:#4ade80">' + netMin.toLocaleString() + ' 金</span>');
    }
    if (overview && overview.lastUploadTime) footNotes.push('資料更新於 ' + timeAgo(overview.lastUploadTime / 1000));

    if (badgeParts.length) html += '<div class="market-stat-bar">' + badgeParts.join('') + '</div>';
    if (footNotes.length) html += '<p class="market-stat-foot craft-muted">' + footNotes.join('　·　') + '</p>';

    if (!overview || !overview.listings.length) {
      html += '<p class="craft-muted">目前查無掛單（可能沒有人在賣）</p>';
      box.innerHTML = html;
      return;
    }

    // 第9點：欄位排版模仿遊戲原生市場介面（優質／價格／數量／總計價格／僱員名），
    // 「魔晶石數量」是遊戲那邊跟這個查詢介面無關的欄位，照你的指示忽略掉。
    // 「世界」是我們自己加的——這是跨服查詢工具的核心價值，遊戲原生介面看不到這欄，
    // 但拿掉的話就失去「跨服比價」的意義了，所以保留在僱員名後面。
    html += '<p class="market-subheading">目前掛單（共 ' + overview.listings.length + ' 筆） ' +
        '<button type="button" class="market-history-btn" data-mk-open-history="1">查看最近成交紀錄</button>' +
        '<button type="button" class="market-history-btn" id="mk-hq-filter-btn">只顯示HQ</button>' +
        '<button type="button" class="market-history-btn" data-mk-open-trend="1">查看走勢圖</button>' +
        '<label class="market-fee-toggle-inline"><input type="checkbox" id="mk-fee-toggle"' + (taxInfo && taxInfo.ratePercent ? '' : ' disabled') + '/> 總計價格算入跨城市手續費</label>' +
      '</p>' +
      '<div id="mk-listing-table-slot"></div>';
    box.innerHTML = html;

    const historyBtn = box.querySelector('[data-mk-open-history]');
    if (historyBtn) {
      historyBtn.addEventListener('click', function () { openHistoryModal(itemId, overview.history); });
    }
    const trendBtn = box.querySelector('[data-mk-open-trend]');
    if (trendBtn) {
      trendBtn.addEventListener('click', function () { openTrendModal(overview.history); });
    }

    // hq-only跟手續費是純畫面篩選/計算，不需要重新查價，切換時只重繪表格本身就好
    let hqOnly = false, includeFee = false;
    function renderListingTable() {
      const rows = hqOnly ? overview.listings.filter(function (l) { return l.hq; }) : overview.listings;
      // 手續費：遊戲裡買東西如果僱員登記的市場城市跟你目前所在城市不同，會多收一筆手續費，
      // 同城市不收。我們沒有追蹤「你現在人在哪」，只有你設定的「賣出城市」，所以這裡簡化處理：
      // 勾選＝假設全部都是跨城市（每一筆都算手續費），用你設定城市的稅率當手續費率估算。
      const feeRate = (taxInfo && taxInfo.ratePercent) ? taxInfo.ratePercent / 100 : 0;
      $('mk-listing-table-slot').innerHTML =
        '<div class="market-table-scroll"><table class="market-price-table"><thead><tr><th>優質</th><th>價格</th><th>數量</th><th>總計價格</th><th>僱員名</th><th>世界</th></tr></thead><tbody>' +
        rows.map(function (l) {
          const total = l.pricePerUnit * l.quantity * (includeFee ? (1 + feeRate) : 1);
          return '<tr><td>' + (l.hq ? hqIconHtml() : '') + '</td><td>' + l.pricePerUnit.toLocaleString() + '金</td><td>' + l.quantity.toLocaleString() + '</td><td>' + Math.round(total).toLocaleString() + '金</td><td>' + (l.retainerName || '—') + '</td><td>' + l.world + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    renderListingTable();
    $('mk-hq-filter-btn').addEventListener('click', function () {
      hqOnly = !hqOnly;
      this.classList.toggle('active', hqOnly);
      renderListingTable();
    });
    $('mk-fee-toggle').addEventListener('change', function () { includeFee = this.checked; renderListingTable(); });
  }

  /* 最近成交紀錄是「輔助資訊」——玩家主要決策看的是目前掛單跟供應鏈，成交紀錄是想深入了解
   * 時才需要的東西。直接攤開在主頁面會擠壓到更重要的資訊，改成點按鈕才彈出的浮層。 */
  /* ── 關注清單：本機儲存，不用帳號。每個關注項目記「目標價」，開啟通知後每5分鐘悄悄檢查一次，
   * 現價低於目標價就跳系統通知——跟生產頁批次規劃的「持續關注」是同一套機制，只是這裡盯的是
   * 單一物品的價格，不是整批訂單的成本。 ── */
  const WATCH_KEY = 'ff14fc-market-watchlist';
  const WATCH_NOTIFY_KEY = 'ff14fc-market-watch-notify';
  const WATCH_INTERVAL_MS = 5 * 60 * 1000;
  let watchTimer = null;

  function getWatchlist() {
    try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveWatchlist(list) {
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(list)); } catch (e) { /* 存不了就算了，不影響其他功能 */ }
  }
  function isWatched(itemId) {
    return getWatchlist().some(function (w) { return w.itemId === itemId; });
  }
  function addToWatchlist(itemId, name, targetPrice) {
    const list = getWatchlist().filter(function (w) { return w.itemId !== itemId; });
    list.push({ itemId: itemId, name: name, targetPrice: targetPrice });
    saveWatchlist(list);
  }
  function removeFromWatchlist(itemId) {
    saveWatchlist(getWatchlist().filter(function (w) { return w.itemId !== itemId; }));
  }

  function bindWatchButton(itemId) {
    const btn = $('mk-watch-btn');
    if (!btn) return;
    function render() {
      const watched = isWatched(itemId);
      btn.innerHTML = watched
        ? '<i class="ph ph-bell-simple-slash"></i> 取消關注'
        : '<i class="ph ph-bell-simple"></i> 加入關注';
    }
    render();
    btn.addEventListener('click', function () {
      if (isWatched(itemId)) {
        removeFromWatchlist(itemId);
        render();
        renderWatchlistPanel();
        return;
      }
      const priceStr = prompt('目標價（現價低於這個數字就通知你），留空代表不設價格門檻、只是先收藏起來：');
      if (priceStr === null) return; // 按取消
      const targetPrice = priceStr.trim() ? Number(priceStr.trim()) : null;
      const name = ITEM_NAMES_TW_ALL[itemId] || ('#' + itemId);
      addToWatchlist(itemId, name, targetPrice);
      render();
      renderWatchlistPanel();
      ensureWatchTimerRunning();
    });
  }

  async function checkWatchlist() {
    const list = getWatchlist().filter(function (w) { return w.targetPrice != null; });
    if (!list.length || !MarketData.getSettings().dcName) return;
    for (const w of list) {
      try {
        const overview = await MarketData.getItemMarketOverview(w.itemId);
        if (overview && overview.minPrice != null && overview.minPrice <= w.targetPrice) {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try { new Notification('市場關注・' + w.name, { body: '現在最低 ' + overview.minPrice.toLocaleString() + ' 金，已經到你設定的目標價（' + w.targetPrice.toLocaleString() + ' 金）以下了' }); } catch (e) { /* 通知被擋掉就算了 */ }
          }
        }
      } catch (e) { /* 這個物品查詢失敗就跳過，不影響清單裡其他物品的檢查 */ }
    }
  }
  async function ensureWatchTimerRunning() {
    if (watchTimer) return;
    if (typeof Notification === 'undefined') return;
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    localStorage.setItem(WATCH_NOTIFY_KEY, '1');
    checkWatchlist();
    watchTimer = setInterval(checkWatchlist, WATCH_INTERVAL_MS);
  }
  // 頁面載入時，如果之前開過通知而且權限本來就是granted，靜默恢復背景檢查
  if (localStorage.getItem(WATCH_NOTIFY_KEY) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    ensureWatchTimerRunning();
  }

  function renderWatchlistPanel() {
    const box = $('mk-watchlist-panel');
    if (!box) return;
    const list = getWatchlist();
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<p class="market-subheading">關注清單（' + list.length + '）</p>' +
      list.map(function (w) {
        return '<div class="market-watch-row">' +
          '<span class="market-recent-chip" data-mk-recent="' + w.itemId + '">' + itemIconHtml(w.itemId, 18) + '<span>' + w.name + '</span></span>' +
          (w.targetPrice != null ? '<span class="craft-muted">目標 ' + w.targetPrice.toLocaleString() + ' 金</span>' : '') +
          '<button type="button" class="market-modal-close" data-mk-unwatch="' + w.itemId + '" title="移除"><i class="ph ph-x"></i></button>' +
        '</div>';
      }).join('');
    box.querySelectorAll('[data-mk-recent]').forEach(function (el) {
      el.addEventListener('click', function () { openItemDetail(el.dataset.mkRecent); });
    });
    box.querySelectorAll('[data-mk-unwatch]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        removeFromWatchlist(el.dataset.mkUnwatch);
        renderWatchlistPanel();
      });
    });
  }

  function ensureHistoryModalDom() {
    let modal = $('mk-history-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'mk-history-modal';
    modal.className = 'market-modal-backdrop';
    modal.style.display = 'none';
    modal.innerHTML = '<div class="market-modal-box">' +
      '<div class="market-modal-head"><h4>最近成交紀錄</h4><button type="button" class="market-modal-close" data-mk-close-history="1"><i class="ph ph-x"></i></button></div>' +
      '<div id="mk-history-body" class="market-modal-body"></div>' +
    '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.style.display = 'none'; });
    modal.querySelector('[data-mk-close-history]').addEventListener('click', function () { modal.style.display = 'none'; });
    return modal;
  }
  function openHistoryModal(itemId, history) {
    const modal = ensureHistoryModalDom();
    const body = $('mk-history-body');
    if (!history || !history.length) {
      body.innerHTML = '<p class="craft-muted">近期查無成交紀錄</p>';
    } else {
      body.innerHTML = '<table class="market-price-table"><thead><tr><th>成交價</th><th>數量</th><th>世界</th><th>時間</th></tr></thead><tbody>' +
        history.slice(0, 50).map(function (h) {
          return '<tr><td>' + h.pricePerUnit.toLocaleString() + '金' + (h.hq ? ' ' + hqIconHtml() : '') + '</td><td>' + h.quantity.toLocaleString() + '</td><td>' + h.world + '</td><td class="craft-muted">' + timeAgo(h.timestamp) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    modal.style.display = 'flex';
  }

  // 第2點：走勢圖彈窗，按鈕跟「查看最近成交紀錄」放一起，不再直接佔用供應鏈欄的版面
  function ensureTrendModalDom() {
    let modal = $('mk-trend-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'mk-trend-modal';
    modal.className = 'market-modal-backdrop';
    modal.style.display = 'none';
    modal.innerHTML = '<div class="market-modal-box market-modal-box-wide">' +
      '<div class="market-modal-head"><h4>近期成交走勢</h4><button type="button" class="market-modal-close" data-mk-close-trend="1"><i class="ph ph-x"></i></button></div>' +
      '<div class="market-modal-body">' +
        '<div id="mk-trend-range-row" class="market-trend-range-row"></div>' +
        '<p class="market-subheading">●圓形=NQ　★星形=HQ<span class="craft-muted">，滑鼠移到點上看細節</span></p>' +
        '<div id="mk-trend-svg-slot"></div>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.style.display = 'none'; });
    modal.querySelector('[data-mk-close-trend]').addEventListener('click', function () { modal.style.display = 'none'; });
    return modal;
  }
  const TREND_RANGES = [
    { key: '1', label: '1天', days: 1 }, { key: '3', label: '3天', days: 3 }, { key: '7', label: '7天', days: 7 },
    { key: '30', label: '30天', days: 30 }, { key: '90', label: '90天', days: 90 }, { key: 'all', label: '全部', days: null },
  ];
  function openTrendModal(history) {
    const modal = ensureTrendModalDom();
    let activeRange = '7'; // 預設抓一個中庸的區間，不要一開就是全部（資料量大時畫面反而雜）
    $('mk-trend-range-row').innerHTML = TREND_RANGES.map(function (r) {
      return '<button type="button" class="market-history-btn market-trend-range-btn" data-range="' + r.key + '">' + r.label + '</button>';
    }).join('');
    function renderForRange() {
      $('mk-trend-range-row').querySelectorAll('[data-range]').forEach(function (b) {
        b.classList.toggle('active', b.dataset.range === activeRange);
      });
      const rangeDef = TREND_RANGES.find(function (r) { return r.key === activeRange; });
      const filtered = rangeDef.days == null
        ? (history || [])
        : (history || []).filter(function (h) { return h.timestamp >= (Date.now() / 1000) - rangeDef.days * 86400; });
      $('mk-trend-svg-slot').innerHTML = renderTrendChart(filtered);
    }
    $('mk-trend-range-row').querySelectorAll('[data-range]').forEach(function (b) {
      b.addEventListener('click', function () { activeRange = b.dataset.range; renderForRange(); });
    });
    renderForRange();
    modal.style.display = 'flex';
  }

  // 第5點排查時發現的潛在問題：supply chain跟機會雷達各自獨立判斷「CRAFT_RECIPES存在嗎」
  // 再決定要不要注入<script>，如果使用者在第一份還沒下載完（3.9MB不小）時就觸發第二個入口，
  // 兩邊都會判斷「不存在」而各自注入一次，變成同一個全域const被宣告兩次，會直接丟例外。
  // 集中成一個共用的載入中promise，晚到的呼叫者等同一個promise，不會重複注入。
  let craftDataLoadPromise = null;
  function ensureCraftDataLoaded() {
    if (typeof CRAFT_RECIPES !== 'undefined') return Promise.resolve(true);
    if (craftDataLoadPromise) return craftDataLoadPromise;
    craftDataLoadPromise = new Promise(function (resolve) {
      const s = document.createElement('script');
      s.src = 'js/craft-data.js';
      s.onload = function () { resolve(typeof CRAFT_RECIPES !== 'undefined'); };
      s.onerror = function () { resolve(false); }; // 抓不到就算了，退回不顯示供應鏈，不要卡住整個詳情頁
      document.body.appendChild(s);
    });
    return craftDataLoadPromise;
  }

  async function loadSupplyChainSection(itemId) {
    const box = $('mk-detail-supply');
    if (typeof CRAFT_RECIPES === 'undefined') {
      box.innerHTML = '<p class="craft-muted">讀取配方資料中⋯</p>';
      await ensureCraftDataLoaded();
    }
    if (typeof CRAFT_RECIPES === 'undefined') { box.innerHTML = ''; return; }
    const rid = (buildToRecipesIndex()[itemId] || [])[0];
    renderSupplyChain(itemId, rid, box);
  }

  const SUPPLY_NODE_LIMIT = 6; // 單一側（材料或用途）超過這個數量就收合成清單，不硬塞進圖裡

  /* ── 供應鏈視覺化：中心是這個物品，材料（往下）跟用途（往上）畫在同一張圖的兩側，
   * 節點只放圖示，完整名稱用細線牽到外圈——名字再長都有地方放，不會被截斷。
   * 寬螢幕時材料在左、用途在右；容器變窄（手機）時材料在上、用途在下，同一份資料換個方向重畫。
   * 材料通常只有4~8種，天生有上限；用途可能幾十種，超過 SUPPLY_NODE_LIMIT 就只顯示前幾個，
   * 剩下的用一個「還有N種」節點取代，點下去切換成清單式呈現（跟生產頁「這個成品還能用在哪」
   * 那份清單同樣的體驗，不是另外發明一套新介面）。 ── */
  /* ── 供應鏈視覺化 v2：材料跟材料之間沒有先後順序（配方裡的水晶、原木、布料是同時都需要，
   * 不是做完一個才輪到下一個），所以不該串成一條鏈——那樣會暗示一個不存在的順序關係。
   * 改成比較貼近「淘汰賽晉級圖」的概念：中心物品在中間，材料卡片一排在上、用途卡片一排在下，
   * 每張卡片各自獨立一條線連回中心，卡片彼此不相連。線走「垂直→轉角→垂直」，不是直接扇形斜線
   * 對準中心——這樣不管卡片有幾張，靠近卡片那一段永遠是整齊的平行線，只有靠近中心才轉彎，
   * 畫面不會因為線的角度深淺不一而顯得亂。永遠上下流動，不再判斷寬窄螢幕：供應鏈跟金額列表
   * 左右並排之後，能分到的寬度本來就有限，等於永遠是「窄」的情況，兩套判斷邏輯沒有意義。
   *
   * 連接線的視覺效果（漸層線身、方向感箭頭、三層菱形光點沿路徑跑）整組從參考HTML的
   * cycDrawArcs完整移植，只把「橫→轉角→橫」換成「縱→轉角→縱」，核心手法不變。 ── */
  /* ── 供應鏈視覺化 v3（第2/3/4/10點修正）：
   * ・方向對調：材料（往下拆）現在畫在下排、成品／用途（往上用）畫在上排，箭頭永遠指向「往上」，
   *   對應「原料在底部匯聚、往上升成成品」的生產意象，不再是舊版「材料在上、用途在下」的順序。
   * ・光點改成全圖同步的接力式動畫（cycSparkMoveDown / cycSparkMoveUp，定義在page-market.css）：
   *   前半個週期材料→中心的光點一起出發，抵達中心後中心圓短暫亮一下，後半個週期中心→成品
   *   的光點才接著一起出發，不再各自隨機挑速度延遲、彼此各跑各的。
   * ・光點形狀改用 offset-rotate:auto 90deg，沿路徑自動貼合切線方向，垂直段/轉角處的橫向段
   *   都會自動轉向，不用再另外判斷「這段是縱線還是橫線」分開處理。
   * ・只有單一材料且剛好置中（沒有左右偏移）時，路徑其實是純直線、沒有轉角，這時直接輸出
   *   一條直線路徑，不再套用「轉角」公式（避免無意義的偏移把直線畫歪一小截）。
   * ・卡片文字不再用 textLength+spacingAndGlyphs 強制拉伸/壓縮字形（那就是造成文字被橫向
   *   拉寬變形的原因）。改成：先試著把字級縮小到能完整放下；如果縮到最小字級還是放不下，
   *   才截斷加「…」，並附上原生 <title> 提示，滑鼠移過去或點進項目本身都能看到完整名稱，
   *   不會出現整串字擠成一團看不清楚的情況。 ── */
  function renderSupplyChain(itemId, rid, box) {
    const recipe = rid ? CRAFT_RECIPES[rid] : null;
    const ings = recipe ? (recipe.ingredients || []) : [];
    const usedInRids = buildUsedInIndex()[itemId] || [];
    if (!ings.length && !usedInRids.length) { box.innerHTML = ''; return; }

    // 材料（下排）：可製作的點下去能繼續往下鑽
    const matNodes = ings.map(function (ing) {
      const childRid = (buildToRecipesIndex()[ing.itemId] || [])[0];
      return { itemId: ing.itemId, amount: ing.amount, rid: childRid || '', name: ITEM_NAMES_TW_ALL[ing.itemId] || ing.itemId };
    });
    // 成品／用途（上排）：可能有幾十種，超過門檻收合成「還有N種」
    const useNodesFull = usedInRids.map(function (urid) {
      const r = CRAFT_RECIPES[urid];
      if (!r) return null;
      return { itemId: r.itemId, rid: urid, name: ITEM_NAMES_TW_ALL[r.itemId] || r.itemId };
    }).filter(Boolean);
    const useOverflow = useNodesFull.length > SUPPLY_NODE_LIMIT;
    const useNodes = useOverflow ? useNodesFull.slice(0, SUPPLY_NODE_LIMIT - 1) : useNodesFull;

    // 版面尺寸：卡片固定寬高，數量決定整排多寬，不會因為卡片一多就把單張卡片擠小
    const CARD_W = 96, CARD_H = 88, GAP = 16, PAD = 20;
    const CENTER_W = 112, CENTER_H = 84; // 中心卡片比一般卡片大一點，強調「這是目前正在看的物品」
    const rowCount = Math.max(matNodes.length, useNodes.length + (useOverflow ? 1 : 0), 1);
    const W = Math.max(360, rowCount * CARD_W + (rowCount - 1) * GAP + PAD * 2);
    const cx = W / 2;
    // 由上而下：成品排（上）→轉角→中心卡片→轉角→材料排（下）
    const useTop = PAD, useBottom = useTop + CARD_H;
    const bendY1 = useBottom + 28;
    const centerTop = bendY1 + 28, centerBottom = centerTop + CENTER_H;
    const bendY2 = centerBottom + 28;
    const matTop = bendY2 + 28, matBottom = matTop + CARD_H;
    const H = matBottom + PAD;

    function rowX(count, i) {
      const rowW = count * CARD_W + (count - 1) * GAP;
      const startX = cx - rowW / 2;
      return startX + i * (CARD_W + GAP) + CARD_W / 2;
    }

    let svgDefs = '', svgParts = '', gradN = 0;
    function roundedElbowV(a, b, bendY, r) {
      if (a.x === b.x) return 'M' + a.x + ',' + a.y + ' L' + b.x + ',' + b.y; // 純直線，沒有轉角可繞
      const sy = bendY >= a.y ? 1 : -1;
      const sx = b.x >= a.x ? 1 : -1;
      return 'M' + a.x + ',' + a.y + ' L' + a.x + ',' + (bendY - sy * r) +
        ' Q' + a.x + ',' + bendY + ' ' + (a.x + sx * r) + ',' + bendY +
        ' L' + (b.x - sx * r) + ',' + bendY +
        ' Q' + b.x + ',' + bendY + ' ' + b.x + ',' + (bendY + sy * r) +
        ' L' + b.x + ',' + b.y;
    }
    function tip(x, y, fromX, fromY) {
      const dx = x - fromX, dy = y - fromY;
      let p;
      if (Math.abs(dx) > Math.abs(dy)) { const s = dx >= 0 ? -5 : 5; p = 'M' + (x + s) + ',' + (y - 5) + ' L' + x + ',' + y + ' L' + (x + s) + ',' + (y + 5); }
      else { const s = dy >= 0 ? -5 : 5; p = 'M' + (x - 5) + ',' + (y + s) + ' L' + x + ',' + y + ' L' + (x + 5) + ',' + (y + s); }
      svgParts += '<path class="cyc-arc-tip" d="' + p + '"/>';
    }
    function gradLine(d, a, b) {
      gradN++;
      const gradId = 'mksgrad' + gradN;
      svgDefs += '<linearGradient id="' + gradId + '" gradientUnits="userSpaceOnUse" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '">' +
        '<stop offset="0%" stop-color="#c5a059" stop-opacity="0.7"/><stop offset="100%" stop-color="#fcf6ba" stop-opacity="1"/></linearGradient>';
      svgParts += '<path class="cyc-arc-line" stroke="url(#' + gradId + ')" d="' + d + '"/>';
    }
    // phase：'down' = 材料→中心（前半週期出發），'up' = 中心→成品（後半週期出發）。
    // 所有線共用同一個全域週期、不再各自隨機，才會有「材料先到、成品接著出發」的接力感。
    function spark(d, phase) {
      const style = "offset-path:path('" + d + "');offset-rotate:auto 90deg";
      svgParts += '<g class="mk-spark mk-spark-' + phase + '" style="' + style + '">' +
        '<path class="cyc-spark-outer" d="M0,-26 L10,0 L0,26 L-10,0 Z"/>' +
        '<path class="cyc-spark-mid" d="M0,-17 L6,0 L0,17 L-6,0 Z"/>' +
        '<path class="cyc-spark-core" d="M0,-8 L2.4,0 L0,8 L-2.4,0 Z"/>' +
      '</g>';
    }
    function facetV(a, b, bendY, phase) {
      const d = roundedElbowV(a, b, bendY, 7);
      gradLine(d, a, b);
      // 箭頭方向錯誤（第1點）的根因：這裡原本傳入的「來向參考點」用了出發卡片的x座標，
      // 但實際上無論是不是有轉角，抵達b之前的最後一段永遠是「垂直」走到b.x——用出發點的x
      // 算方向向量，dx會被水平位移放大，結果誤判成「橫向」箭頭。改成永遠用b.x當來向點的x，
      // 只有y不同，這樣方向向量必定接近垂直，箭頭形狀才會跟線的實際走向一致。
      tip(b.x, b.y, b.x, bendY);
      spark(d, phase);
    }

    function itemIconSvg(iid, x, y, r) {
      const url = (typeof ITEM_ICONS_TW_ALL !== 'undefined' && ITEM_ICONS_TW_ALL[iid]) || null;
      if (!url) return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="rgba(255,255,255,.06)"/><text x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#999">⬡</text>';
      return '<clipPath id="clip' + iid + Math.round(x) + '"><circle cx="' + x + '" cy="' + y + '" r="' + r + '"/></clipPath>' +
        '<image href="' + url + '" x="' + (x - r) + '" y="' + (y - r) + '" width="' + (r * 2) + '" height="' + (r * 2) + '" clip-path="url(#clip' + iid + Math.round(x) + ')"/>';
    }

    // 名稱排版：先試著縮字級塞下，縮到最小還放不下才截斷＋補<title>，絕不強制拉伸/壓縮字形。
    function estTextWidth(str, fs) {
      let w = 0;
      for (let i = 0; i < str.length; i++) {
        w += /[\u2e80-\u9fff\uff00-\uffef]/.test(str[i]) ? fs : fs * 0.56; // 全形字約等寬，半形字窄一些
      }
      return w;
    }
    function fitName(text, maxWidth, baseFs, minFs) {
      const full = estTextWidth(text, baseFs);
      if (full <= maxWidth) return { text: text, fontSize: baseFs, titleAttr: '' };
      const scaled = maxWidth / (full / baseFs);
      if (scaled >= minFs) return { text: text, fontSize: scaled, titleAttr: '' };
      let cut = text;
      while (cut.length > 1 && estTextWidth(cut + '…', minFs) > maxWidth) cut = cut.slice(0, -1);
      return { text: cut + '…', fontSize: minFs, titleAttr: '<title>' + text + '</title>' };
    }

    // 每張卡片：圖示置中，下面兩行文字（名稱、數量）
    // 第1點：名字跟圖示重疊的根因是原本用寫死的數字(iconY=20、文字y=42)算間距，圖示半徑一變大
    // （中心卡片r=18）就不夠用了。改成用「圖示半徑」推算每一行的y座標，間距永遠跟著圖示大小走，
    // 不會再因為某張卡片圖示比較大就擠在一起。
    // 第8點：數量(×N)字級加大、換成更亮的顏色＋粗體，一眼就看得到，不用瞇眼看小字。
    // 第10點：卡片多留一行給「查最低價」，先顯示「查價中…」，實際數字由fillCardPrices()非同步填入。
    function cardHtml(x, topY, iconId, line1, line2, clickAttrs, isOverflow, opts) {
      opts = opts || {};
      const w = opts.w || CARD_W, h = opts.h || CARD_H;
      const r = opts.iconR || 15;
      const iconY = topY + 8 + r;
      const nameY = iconY + r + 12;
      const line2Y = nameY + 13;
      const priceY = (line2 ? line2Y : nameY) + 13;
      const fit = line1 ? fitName(line1, w - 12, opts.fontSize || 10.5, 8) : { text: '', fontSize: 10.5, titleAttr: '' };
      const strokeColor = isOverflow ? '#7a736a' : (opts.highlight ? '#f0d9a0' : '#c5a059');
      const strokeWidth = opts.highlight ? 2 : 1.2;
      return '<g class="mk-supply-node' + (opts.highlight ? ' mk-supply-node-center' : '') + '"' + clickAttrs + '>' + fit.titleAttr +
        '<rect x="' + (x - w / 2) + '" y="' + topY + '" width="' + w + '" height="' + h + '" rx="8" fill="' + (opts.highlight ? 'rgba(197,160,89,.18)' : 'rgba(0,0,0,.4)') + '" stroke="' + strokeColor + '" stroke-width="' + strokeWidth + '"/>' +
        (isOverflow
          ? '<text x="' + x + '" y="' + iconY + '" text-anchor="middle" dominant-baseline="central" font-size="13" fill="#ddd">還有</text>'
          : itemIconSvg(iconId, x, iconY, r)) +
        '<text x="' + x + '" y="' + nameY + '" text-anchor="middle" font-size="' + fit.fontSize.toFixed(1) + '" fill="' + (opts.highlight ? '#fcf6ba' : '#eee') + '" font-weight="' + (opts.highlight ? '600' : '400') + '">' + fit.text + '</text>' +
        (line2 ? '<text x="' + x + '" y="' + line2Y + '" text-anchor="middle" font-size="12" fill="#fcf6ba" font-weight="700">' + line2 + '</text>' : '') +
        (isOverflow ? '' : '<text class="mk-card-price" data-price-item="' + iconId + '" x="' + x + '" y="' + priceY + '" text-anchor="middle" font-size="9" fill="#8fd6a0"></text>') +
      '</g>';
    }

    // 材料排（下）：箭頭往上指向中心，光點屬於 'down' 段
    matNodes.forEach(function (n, i) {
      const x = rowX(matNodes.length, i);
      const a = { x: x, y: matTop };
      const b = { x: cx, y: centerBottom };
      facetV(a, b, bendY2, 'down');
      const clickAttrs = n.rid
        ? ' data-mk-supply-item="' + n.itemId + '" data-mk-supply-rid="' + n.rid + '"'
        : ' data-mk-goto-item="' + n.itemId + '"'; // 不可製作的原料一樣可以點，只是跳去它自己的市場詳情頁，不是往下鑽
      svgParts += cardHtml(x, matTop, n.itemId, n.name, '×' + n.amount, clickAttrs, false);
    });
    // 成品／用途排（上）：箭頭從中心往上指向成品，光點屬於 'up' 段。
    // 第12點：這一排的卡片本身也有自己的配方（n.rid），所以點下去不再直接跳走離開這個頁面，
    // 而是往上鑽進同一張圖——這個成品自己也可能是別的東西的材料，一路往上追出完整供應鏈，
    // 不是只能看到「往下一層」，跟生產頁清單展開一樣可以無限往上／往下追蹤，只是用同一張圖呈現。
    useNodes.forEach(function (n, i) {
      const count = useNodes.length + (useOverflow ? 1 : 0);
      const x = rowX(count, i);
      const a = { x: cx, y: centerTop };
      const b = { x: x, y: useBottom };
      facetV(a, b, bendY1, 'up');
      svgParts += cardHtml(x, useTop, n.itemId, n.name, '', ' data-mk-supply-item="' + n.itemId + '" data-mk-supply-rid="' + n.rid + '"', false);
    });
    if (useOverflow) {
      const count = useNodes.length + 1;
      const x = rowX(count, count - 1);
      const a = { x: cx, y: centerTop };
      const b = { x: x, y: useBottom };
      facetV(a, b, bendY1, 'up');
      svgParts += cardHtml(x, useTop, '', String(useNodesFull.length - useNodes.length) + '種', '', ' data-mk-usedin-more="1"', true);
    }

    box.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="market-supply-svg"><defs>' + svgDefs + '</defs>' +
        svgParts +
        cardHtml(cx, centerTop, itemId, ITEM_NAMES_TW_ALL[itemId] || itemId, '', '', false, { w: CENTER_W, h: CENTER_H, iconR: 18, fontSize: 11.5, highlight: true }) +
      '</svg>' +
      '<p class="craft-muted market-supply-legend">上：這個物品被用在哪　下：這個物品需要的材料（可製作的點下去能繼續往下追）</p>' +
      '<div class="market-fullchain-btn-row"><button type="button" class="market-fullchain-btn" data-mk-open-fullchain="1">查看完整供應鏈清單</button></div>';

    box.querySelector('[data-mk-open-fullchain]').addEventListener('click', function () { openFullChainModal(itemId, rid); });
    fillCardPrices(box); // 第10點：圖上每張卡片都補上「查最低價（全世界）」

    // 第3點抓到的真正原因：材料/用途卡片一直以來分兩條路——可製作的點了只更新這張圖本身
    // （data-mk-supply-item→只重繪box），不可製作的原料點了卻是整頁換目標（data-mk-goto-item→
    // openItemDetail）。同一張圖上的卡片，點起來反應却不一樣，才會出現「點這個只換圖、點那個
    // 整頁跳」的不一致。統一成兩者都走完整的openItemDetail，左邊價格欄位、頁首名稱、右邊供應鏈
    // 圖永遠一起換成同一個目標物品，不會再各自為政。
    box.querySelectorAll('[data-mk-supply-item], [data-mk-goto-item]').forEach(function (el) {
      const targetId = el.dataset.mkSupplyItem || el.dataset.mkGotoItem;
      el.addEventListener('click', function () { openItemDetail(targetId); });
    });
    const moreBtn = box.querySelector('[data-mk-usedin-more]');
    if (moreBtn) {
      moreBtn.addEventListener('click', function () { renderUsedInList(itemId); });
    }
  }

  // 第10點：幫任何有 data-price-item 標記的節點查「全世界最低價」，做法照抄生產頁材料圖譜的
  // fillNodePrices——合併成一次批次請求，不要每張卡片各打一次API（一次撐爆Universalis流量限制）。
  function fillCardPrices(container) {
    if (typeof MarketData === 'undefined') return;
    const s = MarketData.getSettings();
    if (!s.dcName) return; // 沒設定資料中心就不查，卡片上的價格欄保持空白，不跳訊息打斷版面
    const nodes = Array.prototype.slice.call(container.querySelectorAll('[data-price-item]'));
    if (!nodes.length) return;
    const ids = [];
    nodes.forEach(function (el) { if (ids.indexOf(el.dataset.priceItem) === -1) ids.push(el.dataset.priceItem); });
    MarketData.fetchListingsBatch(ids.map(Number)).then(function (result) {
      nodes.forEach(function (el) {
        const listings = result[el.dataset.priceItem];
        el.textContent = (listings && listings.length) ? listings[0].pricePerUnit.toLocaleString() + '金' : '無人出售';
      });
    }).catch(function () {
      nodes.forEach(function (el) { el.textContent = '查價失敗'; });
    });
  }

  /* 第6點：完整供應鏈清單——SVG圖只畫「上下各一層」，適合快速掃視，但看不到更遠的層級，
   * 要看更遠就得換焦點、失去原本的脈絡。這裡另外做一個「看到底」的清單模式，跟生產頁材料清單
   * 同樣的「可展開樹狀清單」邏輯，但多做了一個生產頁沒有的方向——「被用在」也能一路往上展開。
   * 每個節點預設收合，點三角形才展開下一層，不是一次全部攤開：結晶這類材料可能被用在上千種
   * 配方，一次全展開等於瞬間生出上千個DOM節點，畫面會卡死，所以一定要做成懶展開。 */
  const FULLCHAIN_CHILD_LIMIT = 60; // 單一節點底下子項太多時，先只顯示前60個，其餘用文字註記數量
  function fullChainNodeHtml(itemId, rid, direction) {
    const name = ITEM_NAMES_TW_ALL[itemId] || itemId;
    const hasChildren = direction === 'down'
      ? !!(rid && CRAFT_RECIPES[rid] && (CRAFT_RECIPES[rid].ingredients || []).length)
      : !!((buildUsedInIndex()[itemId] || []).length);
    // 第9點：名字/圖示包成獨立可點區塊(data-fc-goto)，點下去直接跳去那個物品的市場頁面；
    // 展開箭頭是另一個獨立按鈕，兩者互不干擾，點名字不會誤觸展開、點箭頭也不會誤觸跳轉。
    // 第10點：後面留一個查價佔位(data-price-item)，交給fillCardPrices()統一批次查填。
    return '<li class="market-fc-node" data-fc-item="' + itemId + '" data-fc-rid="' + (rid || '') + '" data-fc-dir="' + direction + '">' +
      '<div class="market-fc-row">' +
        (hasChildren ? '<button type="button" class="market-fc-toggle">▶</button>' : '<span class="market-fc-toggle-spacer"></span>') +
        '<span class="market-fc-goto" data-fc-goto="' + itemId + '">' + itemIconHtml(itemId, 18) + '<span>' + name + '</span></span>' +
        '<span class="market-fc-price" data-price-item="' + itemId + '"></span>' +
      '</div>' +
      '<ul class="market-fc-children" style="display:none"></ul>' +
    '</li>';
  }
  function expandFullChainNode(li) {
    const itemId = li.dataset.fcItem, rid = li.dataset.fcRid, dir = li.dataset.fcDir;
    const childUl = li.querySelector(':scope > .market-fc-children');
    if (childUl.dataset.loaded) return;
    childUl.dataset.loaded = '1';
    let childHtml = '';
    if (dir === 'down') {
      const ings = (rid && CRAFT_RECIPES[rid] && CRAFT_RECIPES[rid].ingredients) || [];
      childHtml = ings.map(function (ing) {
        const childRid = (buildToRecipesIndex()[ing.itemId] || [])[0];
        return fullChainNodeHtml(ing.itemId, childRid, 'down').replace('<span class="market-fc-goto"', '<span class="market-fc-amount">×' + ing.amount + '</span><span class="market-fc-goto"');
      }).join('');
    } else {
      const urids = buildUsedInIndex()[itemId] || [];
      const shown = urids.slice(0, FULLCHAIN_CHILD_LIMIT);
      childHtml = shown.map(function (urid) {
        const r = CRAFT_RECIPES[urid];
        return r ? fullChainNodeHtml(r.itemId, urid, 'up') : '';
      }).join('');
      if (urids.length > FULLCHAIN_CHILD_LIMIT) {
        childHtml += '<li class="craft-muted" style="padding:4px 0 4px 26px">…還有 ' + (urids.length - FULLCHAIN_CHILD_LIMIT) + ' 種未顯示</li>';
      }
    }
    childUl.innerHTML = childHtml || '<li class="craft-muted" style="padding:4px 0 4px 26px">（無）</li>';
    fillCardPrices(childUl); // 第10點：新展開出來的節點也要補查價
  }
  function ensureFullChainModalDom() {
    let modal = $('mk-fullchain-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'mk-fullchain-modal';
    modal.className = 'market-modal-backdrop';
    modal.style.display = 'none';
    modal.innerHTML = '<div class="market-modal-box market-modal-box-wide">' +
      '<div class="market-modal-head"><h4 id="mk-fullchain-title"></h4><button type="button" class="market-modal-close" data-mk-close-fullchain="1"><i class="ph ph-x"></i></button></div>' +
      '<div class="market-modal-body">' +
        '<p class="market-subheading">▲ 被用在（可一路往上追）</p><ul class="market-fc-tree" id="mk-fc-up"></ul>' +
        '<p class="market-subheading" style="margin-top:14px">▼ 材料組成（可一路往下追）</p><ul class="market-fc-tree" id="mk-fc-down"></ul>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) { modal.style.display = 'none'; return; }
      // 第9點：先判斷是不是點在名字/圖示上，是的話直接跳轉，不繼續往下判斷展開箭頭
      const gotoEl = e.target.closest('[data-fc-goto]');
      if (gotoEl) { modal.style.display = 'none'; openItemDetail(gotoEl.dataset.fcGoto); return; }
      const toggle = e.target.closest('.market-fc-toggle');
      if (!toggle) return;
      const li = toggle.closest('.market-fc-node');
      const childUl = li.querySelector(':scope > .market-fc-children');
      const willOpen = childUl.style.display === 'none';
      if (willOpen) expandFullChainNode(li);
      childUl.style.display = willOpen ? 'block' : 'none';
      toggle.textContent = willOpen ? '▼' : '▶';
    });
    modal.querySelector('[data-mk-close-fullchain]').addEventListener('click', function () { modal.style.display = 'none'; });
    return modal;
  }
  function openFullChainModal(itemId, rid) {
    const modal = ensureFullChainModalDom();
    $('mk-fullchain-title').textContent = (ITEM_NAMES_TW_ALL[itemId] || itemId) + '——完整供應鏈';
    $('mk-fc-up').innerHTML = fullChainNodeHtml(itemId, rid, 'up');
    $('mk-fc-down').innerHTML = fullChainNodeHtml(itemId, rid, 'down');
    fillCardPrices($('mk-fc-up'));
    fillCardPrices($('mk-fc-down'));
    modal.style.display = 'flex';
  }

  /* 用途數量超過門檻時，點「還有N種」卡片彈出的清單（第6點）：原本是塞在頁面裡的flex-wrap
   * 標籤，項目一多（結晶類可能對到上千種配方）就會因為每個標籤寬度不一而顯得雜亂無章。
   * 改成彈窗＋固定欄寬的Grid：每一格寬度、圖示大小都相同，名字太長就截斷＋title提示，
   * 視覺上永遠是整整齊齊的方格陣列，不會因為個別物品名字長短不一而參差不齊。
   * 使用者說不需要搜尋／分類，所以只處理「排整齊」跟「大量項目不要一次塞爆畫面」這兩件事：
   * 一次只渲染一批（先400筆），捲到底部再載入下一批，避免上千個DOM節點一次生成卡頓。 */
  const USEDIN_BATCH = 400;
  function ensureUsedInModalDom() {
    let modal = $('mk-usedin-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'mk-usedin-modal';
    modal.className = 'market-modal-backdrop';
    modal.style.display = 'none';
    modal.innerHTML = '<div class="market-modal-box market-modal-box-wide">' +
      '<div class="market-modal-head"><h4 id="mk-usedin-title"></h4><button type="button" class="market-modal-close" data-mk-close-usedin="1"><i class="ph ph-x"></i></button></div>' +
      '<div id="mk-usedin-body" class="market-modal-body"><div id="mk-usedin-grid" class="market-usedin-grid"></div><button type="button" id="mk-usedin-more-btn" class="market-history-btn" style="display:none;margin-top:10px">載入更多</button></div>' +
    '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.style.display = 'none'; });
    modal.querySelector('[data-mk-close-usedin]').addEventListener('click', function () { modal.style.display = 'none'; });
    return modal;
  }
  function renderUsedInList(itemId) {
    const rids = buildUsedInIndex()[itemId] || [];
    const items = rids.map(function (urid) {
      const r = CRAFT_RECIPES[urid];
      return r ? { itemId: r.itemId, name: ITEM_NAMES_TW_ALL[r.itemId] || r.itemId } : null;
    }).filter(Boolean);

    const modal = ensureUsedInModalDom();
    $('mk-usedin-title').textContent = '被用在（共 ' + items.length + ' 種）';
    const grid = $('mk-usedin-grid');
    const moreBtn = $('mk-usedin-more-btn');
    let shown = 0;

    function renderBatch() {
      const next = items.slice(shown, shown + USEDIN_BATCH);
      grid.innerHTML += next.map(function (it) {
        return '<button type="button" class="market-usedin-cell" data-mk-goto-item="' + it.itemId + '" title="' + it.name + '">' +
          itemIconHtml(it.itemId, 28) + '<span>' + it.name + '</span><span class="market-fc-price" data-price-item="' + it.itemId + '"></span></button>';
      }).join('');
      grid.querySelectorAll('[data-mk-goto-item]').forEach(function (el) {
        if (el._bound) return; el._bound = true;
        el.addEventListener('click', function () { modal.style.display = 'none'; openItemDetail(el.dataset.mkGotoItem); });
      });
      shown += next.length;
      moreBtn.style.display = shown < items.length ? 'inline-block' : 'none';
      fillCardPrices(grid); // 第4點：這個彈窗原本漏了查價，現在每一批渲染完都補查
    }
    grid.innerHTML = '';
    renderBatch();
    moreBtn.onclick = renderBatch;
    modal.style.display = 'flex';
  }

  /* ── 機會雷達：全物品投報率排行榜，不限自己職業能做的，依職業分頁瀏覽。
   * 切到這個分頁、選一個職業才觸發計算，不是一進市場頁就跑；用直接材料成本做初篩
   * （不遞迴算到最低成本的完整決策引擎邏輯，那個留給玩家點進單一物品詳情頁時才算），
   * 結果快取在localStorage，長TTL＋手動重新整理，避免每次打開都重新發一輪大量查價請求。 ── */
  const JOB_LIST = [
    { id: 0, name: '木工師' }, { id: 1, name: '鍛造師' }, { id: 2, name: '甲冑師' },
    { id: 3, name: '雕金師' }, { id: 4, name: '皮革師' }, { id: 5, name: '裁縫師' },
    { id: 6, name: '鍊金術師' }, { id: 7, name: '烹調師' },
  ];
  const RADAR_CACHE_KEY = 'ff14fc-market-radar-cache';
  const RADAR_TTL_MS = 60 * 60 * 1000; // 1小時，掃全職業配方查價量不小，不用每次打開都重算

  function renderRadarShell() {
    const box = $('mk-pane-radar');
    box.innerHTML =
      '<div class="market-radar-jobtabs" id="mk-radar-jobtabs">' +
        JOB_LIST.map(function (j) { return '<button type="button" class="craft-job-filter-btn" data-mk-radar-job="' + j.id + '">' + j.name + '</button>'; }).join('') +
      '</div>' +
      '<div id="mk-radar-body"><p class="craft-muted">選一個職業開始掃描，找出目前成本低、賣得快的配方。</p></div>';
    box.querySelectorAll('[data-mk-radar-job]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        box.querySelectorAll('[data-mk-radar-job]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        runRadarScan(parseInt(btn.dataset.mkRadarJob, 10));
      });
    });
  }

  function loadRadarCache(jobId) {
    try {
      const all = JSON.parse(localStorage.getItem(RADAR_CACHE_KEY) || '{}');
      const s = MarketData.getSettings();
      const key = jobId + ':' + s.dcName + ':' + s.worldName;
      const hit = all[key];
      if (hit && Date.now() - hit.time < RADAR_TTL_MS) return hit.rows;
    } catch (e) { /* 快取壞掉就當沒有，重新掃一次 */ }
    return null;
  }
  function saveRadarCache(jobId, rows) {
    try {
      const all = JSON.parse(localStorage.getItem(RADAR_CACHE_KEY) || '{}');
      const s = MarketData.getSettings();
      const key = jobId + ':' + s.dcName + ':' + s.worldName;
      all[key] = { time: Date.now(), rows: rows };
      localStorage.setItem(RADAR_CACHE_KEY, JSON.stringify(all));
    } catch (e) { /* 存不下就算了，不影響這次已經算好、正在畫面上顯示的結果 */ }
  }

  async function runRadarScan(jobId, forceRefresh) {
    const body = $('mk-radar-body');
    const s = MarketData.getSettings();
    if (!s.dcName || !s.worldName) {
      body.innerHTML = '<p class="craft-muted">機會雷達需要同時設定資料中心跟「我的世界」（成本用資料中心估、賣價要看你自己世界的掛單），點右上角設定後再試。</p>';
      return;
    }
    if (typeof CRAFT_RECIPES === 'undefined') {
      body.innerHTML = '<p class="craft-muted">讀取配方資料中⋯</p>';
      await ensureCraftDataLoaded();
    }
    if (typeof CRAFT_RECIPES === 'undefined') { body.innerHTML = '<p class="craft-muted">配方資料載入失敗，請重新整理頁面再試。</p>'; return; }

    if (!forceRefresh) {
      const cached = loadRadarCache(jobId);
      if (cached) { renderRadarRows(jobId, cached, true); return; }
    }

    body.innerHTML = '<p class="craft-muted">掃描中，這個職業的配方一次要查不少材料跟賣價，可能要幾秒鐘⋯</p>';
    const jobRecipeIds = Object.keys(CRAFT_RECIPES).filter(function (rid) { return CRAFT_RECIPES[rid].jobId === jobId && isTwRecipe(CRAFT_RECIPES[rid]); });
    // 直接材料成本初篩：不遞迴算到底層最低成本，只看這一層材料，求快不求最精準——
    // 真的想知道某一項精確的買/做/採決策，玩家點進那個物品的詳情頁自然會看到完整資訊。
    const ingredientNeed = {};
    jobRecipeIds.forEach(function (rid) {
      (CRAFT_RECIPES[rid].ingredients || []).forEach(function (ing) {
        ingredientNeed[ing.itemId] = 1; // 這裡只需要「單價參考」，量給1就好，不用算整批職業實際總需求
      });
    });
    const outputIds = jobRecipeIds.map(function (rid) { return CRAFT_RECIPES[rid].itemId; });
    let ingredientResults, sellResults, dcListings;
    try {
      const out = await Promise.all([
        MarketData.resolveBuyCosts(ingredientNeed),
        MarketData.getSellPricesBatch(outputIds),
        MarketData.fetchListingsBatch(outputIds), // 第4點：DC全服掛單，用來抓「真實最低價」──買方能跨世界買，只看賣方自己那個世界的最低價，等於做出一個實際上會被跨服比價打破的偽最低價
      ]);
      ingredientResults = out[0]; sellResults = out[1]; dcListings = out[2];
    } catch (e) {
      body.innerHTML = '<p class="craft-muted">查價失敗，請稍後再試一次。</p>';
      return;
    }
    const rows = [];
    jobRecipeIds.forEach(function (rid) {
      const recipe = CRAFT_RECIPES[rid];
      let cost = 0, allResolved = true;
      (recipe.ingredients || []).forEach(function (ing) {
        const rr = ingredientResults[ing.itemId];
        if (!rr || rr.avgPrice == null) { allResolved = false; return; }
        cost += rr.avgPrice * ing.amount;
      });
      const sell = sellResults[recipe.itemId];
      const dcList = dcListings[recipe.itemId];
      const dcMinUnit = dcList && dcList.length ? dcList[0].pricePerUnit : null;
      if (!allResolved || !dcMinUnit) return; // 用「真實最低價」當能不能算出結果的門檻，你自己世界沒掛單不代表這配方沒行情
      const yields = recipe.yields || 1;
      // 第5點：一次「製作」可能產出不只1個成品（recipe.yields），賣價卻是單件價格，
      // 沒乘上產出數量的話，等於拿「做一次的成本」去跟「賣一件的錢」比，多產出的部分完全沒算到，
      // 利潤會被嚴重低估（甚至讓真正划算的配方看起來不划算）。
      // 主要用來排序/判斷賺不賺的是「真實最低價」（DC全服最低，買方跨世界一定挑得到這個價），
      // 你自己世界的價格只當附註參考──有可能比全服最低價高（你這裡比較好賣），也可能沒掛單。
      const dcSellTotal = dcMinUnit * yields;
      const worldSellTotal = sell && sell.price ? sell.price * yields : null;
      const profit = dcSellTotal - cost;
      rows.push({
        itemId: recipe.itemId, name: ITEM_NAMES_TW_ALL[recipe.itemId] || recipe.itemId,
        cost: cost, sell: dcSellTotal, sellUnit: dcMinUnit, worldSell: worldSellTotal,
        yields: yields, profit: profit,
      });
    });
    rows.sort(function (a, b) { return b.profit - a.profit; });
    const top = rows.slice(0, 50);
    saveRadarCache(jobId, top);
    renderRadarRows(jobId, top, false);
  }

  function renderRadarRows(jobId, rows, fromCache) {
    const body = $('mk-radar-body');
    if (!rows.length) { body.innerHTML = '<p class="craft-muted">這個職業目前查不到足夠的市場資料（可能材料/成品都查無掛單）。</p>'; return; }
    body.innerHTML =
      (fromCache ? '<p class="craft-muted">顯示快取結果（1小時內） <button type="button" class="market-history-btn" id="mk-radar-refresh">重新整理</button></p>' : '') +
      '<div class="market-table-scroll"><table class="market-price-table"><thead><tr><th>淨利／次</th><th>材料成本</th><th>最低價／次<span class="craft-muted" style="font-weight:normal">（全服）</span></th><th>物品</th></tr></thead><tbody>' +
      rows.map(function (r) {
        const yieldNote = r.yields > 1 ? r.sellUnit.toLocaleString() + '金×' + r.yields : '';
        const worldNote = r.worldSell != null ? '你的世界 ' + r.worldSell.toLocaleString() + '金' : '你的世界目前無掛單';
        const noteLine = [yieldNote, worldNote].filter(Boolean).join('　·　');
        return '<tr data-mk-radar-item="' + r.itemId + '" style="cursor:pointer"><td style="color:' + (r.profit >= 0 ? '#4ade80' : '#f87171') + '">' + (r.profit >= 0 ? '+' : '') + Math.round(r.profit).toLocaleString() + '金</td><td>' + Math.round(r.cost).toLocaleString() + '金</td><td>' + Math.round(r.sell).toLocaleString() + '金<br><span class="craft-muted" style="font-size:10px">' + noteLine + '</span></td><td>' + r.name + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="craft-muted" style="margin-top:6px">粗估值：只算直接材料成本，沒有考慮製作時間跟賣方稅；「淨利／次」是做一次配方（可能一次做出不只1件）的總損益，不是單件價格。「最低價」是整個資料中心裡最便宜的掛單——買方能跨世界買，只看你自己世界的價格會漏掉「其實有人在別的世界用更低價賣」這件事，所以拿全服最低價當能不能賺的判斷基準；你自己世界的價格另外列出來當參考，那才是你實際上架時看得到的競爭對手。</p>';
    body.querySelectorAll('[data-mk-radar-item]').forEach(function (tr) {
      tr.addEventListener('click', function () { openItemDetail(tr.dataset.mkRadarItem); });
    });
    const refreshBtn = $('mk-radar-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { runRadarScan(jobId, true); });
  }

  /* ── 熱度排行：跟機會雷達不一樣，範圍不侷限在「能製作的東西」——候選清單來自Universalis的
   * 「最近有真實市場活動」端點，不管道具是製作、採集、打寶還是兌換來的，只要真的有人在交易
   * 就會被列進來，這樣才涵蓋得到你說的「非生產類但很熱門」的道具。
   * 指標給4種切換：賣速／漲跌幅度／總交易金額／波動度，市場學上這幾個各自代表不同面向——
   * 賣速看「流動性」、漲跌幅度看「短期動能」、總交易金額看「熱錢規模」（賣得快但單價低的雞肋
   * 道具，跟真正熱錢在流動的道具，賣速可能一樣快，但總交易金額差很多，這個指標能抓出差異）、
   * 波動度看「價差／投機空間」。範圍可以切换自己世界或整個資料中心。 ── */
  const HOT_CACHE_KEY = 'ff14fc-market-hot-cache';
  const HOT_TTL_MS = 60 * 60 * 1000;
  const HOT_METRICS = [
    { key: 'velocity', label: '賣速', fmt: function (v) { return v.toFixed(1) + ' 件/天'; }, hint: '流動性：多快能賣掉，數字越高代表越搶手（NQ+HQ合計，跟物品詳情頁同一套計算方式）' },
    { key: 'changePct', label: '漲跌幅度', fmt: function (v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }, hint: '短期動能：最近3天的成交均價，比再往前3~7天那段的均價貴/便宜多少' },
  ];

  function renderHotShell() {
    const box = $('mk-pane-hot');
    box.innerHTML =
      '<div class="market-hot-controls">' +
        '<div class="market-hot-scope">' +
          '<button type="button" class="craft-job-filter-btn active" data-mk-hot-scope="world">自己的世界</button>' +
          '<button type="button" class="craft-job-filter-btn" data-mk-hot-scope="dc">整個資料中心</button>' +
        '</div>' +
        '<div class="market-hot-metrics">' +
          HOT_METRICS.map(function (m, i) { return '<button type="button" class="craft-job-filter-btn' + (i === 0 ? ' active' : '') + '" data-mk-hot-metric="' + m.key + '" title="' + m.hint + '">' + m.label + '</button>'; }).join('') +
        '</div>' +
      '</div>' +
      '<div id="mk-hot-body"><p class="craft-muted">選好範圍跟指標後，按下面的按鈕開始掃描目前市場上最熱門的道具。</p><button type="button" class="market-fullchain-btn" id="mk-hot-start">開始掃描</button></div>';

    let scope = 'world', metric = 'velocity';
    box.querySelectorAll('[data-mk-hot-scope]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        box.querySelectorAll('[data-mk-hot-scope]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        scope = btn.dataset.mkHotScope;
        runHotScan(scope, metric);
      });
    });
    box.querySelectorAll('[data-mk-hot-metric]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        box.querySelectorAll('[data-mk-hot-metric]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        metric = btn.dataset.mkHotMetric;
        renderHotFromCacheOrRescan(scope, metric);
      });
    });
    $('mk-hot-start').addEventListener('click', function () { runHotScan(scope, metric); });
  }

  function loadHotCache(scope) {
    try {
      const all = JSON.parse(localStorage.getItem(HOT_CACHE_KEY) || '{}');
      const s = MarketData.getSettings();
      const key = scope + ':' + s.dcName + ':' + s.worldName;
      const hit = all[key];
      if (hit && Date.now() - hit.time < HOT_TTL_MS) return hit.rows;
    } catch (e) { /* 快取壞掉就當沒有 */ }
    return null;
  }
  function saveHotCache(scope, rows) {
    try {
      const all = JSON.parse(localStorage.getItem(HOT_CACHE_KEY) || '{}');
      const s = MarketData.getSettings();
      const key = scope + ':' + s.dcName + ':' + s.worldName;
      all[key] = { time: Date.now(), rows: rows };
      localStorage.setItem(HOT_CACHE_KEY, JSON.stringify(all));
    } catch (e) { /* 存不下就算了 */ }
  }
  function renderHotFromCacheOrRescan(scope, metric) {
    const cached = loadHotCache(scope);
    if (cached) renderHotRows(cached, metric, true, scope);
    else runHotScan(scope, metric);
  }

  async function runHotScan(scope, metric) {
    const body = $('mk-hot-body');
    const s = MarketData.getSettings();
    if (!s.dcName || (scope === 'world' && !s.worldName)) {
      body.innerHTML = '<p class="craft-muted">熱度排行需要先設定資料中心' + (scope === 'world' ? '跟「我的世界」' : '') + '，點右上角設定後再試。</p>';
      return;
    }
    const cached = loadHotCache(scope);
    if (cached) { renderHotRows(cached, metric, true, scope); return; }

    body.innerHTML = '<p class="craft-muted">掃描中，先抓最近有市場活動的道具，再批次查賣速跟漲跌，可能要幾秒鐘⋯</p>';
    try {
      const scopeName = scope === 'world' ? s.worldName : s.dcName;
      const candidateIds = await MarketData.fetchMostRecentlyUpdated(scope, scopeName, 200);
      if (!candidateIds.length) { body.innerHTML = '<p class="craft-muted">目前查不到最近有活動的道具，稍後再試試看。</p>'; return; }
      const numericIds = candidateIds.map(Number);
      const out = await Promise.all([
        MarketData.fetchSaleVelocityBatch(numericIds, scopeName), // 第8點：跟物品詳情頁同一套「已驗證正確」的賣速邏輯
        MarketData.fetchHistoryBatch(numericIds, scopeName),
      ]);
      const velResult = out[0], histResult = out[1];
      const rows = candidateIds.map(function (id) {
        const vel = velResult[id] || {};
        const hist = histResult[id] || {};
        return {
          itemId: id, name: ITEM_NAMES_TW_ALL[id] || ('#' + id),
          stats: {
            velocity: vel.totalVelocityPerDay || 0,
            nqVelocity: vel.nqVelocityPerDay, hqVelocity: vel.hqVelocityPerDay,
            changePct: hist.changePct,
          },
        };
      }).filter(function (r) { return r.stats.velocity > 0 || r.stats.changePct != null; });
      saveHotCache(scope, rows);
      renderHotRows(rows, metric, false, scope);
    } catch (e) {
      body.innerHTML = '<p class="craft-muted">掃描失敗，請稍後再試一次。</p>';
    }
  }

  function renderHotRows(rows, metricKey, fromCache, scope) {
    const body = $('mk-hot-body');
    const metricDef = HOT_METRICS.find(function (m) { return m.key === metricKey; });
    const withValue = rows.filter(function (r) { return r.stats[metricKey] != null; });
    withValue.sort(function (a, b) { return b.stats[metricKey] - a.stats[metricKey]; });
    const top = withValue.slice(0, 30);
    if (!top.length) { body.innerHTML = '<p class="craft-muted">目前這個指標查不到足夠的資料，換個指標或範圍試試。</p>'; return; }
    const maxVal = Math.max.apply(null, top.map(function (r) { return Math.abs(r.stats[metricKey]); })) || 1;
    body.innerHTML =
      (fromCache ? '<p class="craft-muted">顯示快取結果（1小時內） <button type="button" class="market-history-btn" id="mk-hot-refresh">重新整理</button></p>' : '') +
      '<p class="craft-muted" style="margin-bottom:8px">' + metricDef.hint + '</p>' +
      '<div class="market-hot-list">' +
        top.map(function (r, i) {
          const v = r.stats[metricKey];
          const barPct = Math.max(4, Math.round((Math.abs(v) / maxVal) * 100));
          const barColor = v >= 0 ? '#c5a059' : '#f87171';
          const subLine = (metricKey === 'velocity' && (r.stats.nqVelocity != null || r.stats.hqVelocity != null))
            ? '<span class="market-hot-sub">NQ ' + (r.stats.nqVelocity || 0).toFixed(1) + '　HQ ' + (r.stats.hqVelocity || 0).toFixed(1) + '</span>' : '';
          return '<div class="market-hot-row" data-mk-hot-item="' + r.itemId + '">' +
            '<span class="market-hot-rank">' + (i + 1) + '</span>' +
            itemIconHtml(r.itemId, 30) +
            '<span class="market-hot-name">' + r.name + '</span>' +
            '<div class="market-hot-bar-track"><div class="market-hot-bar" style="width:' + barPct + '%;background:' + barColor + '"></div></div>' +
            '<span class="market-hot-value">' + metricDef.fmt(v) + subLine + '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<p class="craft-muted" style="margin-top:8px">候選道具來自Universalis「最近有市場活動」清單（' + (scope === 'world' ? '你的世界' : '整個資料中心') + '，約200項），不限定生產分類，打寶/兌換/採集道具都涵蓋在內；只是全遊戲道具數以千計，沒辦法每種都查，這份清單已經是「最近真的有人在交易」的子集。</p>';
    body.querySelectorAll('[data-mk-hot-item]').forEach(function (el) {
      el.addEventListener('click', function () { openItemDetail(el.dataset.mkHotItem); });
    });
    const refreshBtn = $('mk-hot-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { localStorage.removeItem(HOT_CACHE_KEY); runHotScan(scope, metricKey); });
  }

})();
