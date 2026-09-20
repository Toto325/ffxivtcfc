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
          '<button type="button" id="mk-settings-btn" class="craft-mat-worlds-icon" style="width:auto;padding:0 10px;gap:6px" title="' + (MarketData.dcSelectorVisible ? '設定資料中心／我的世界' : '設定我的世界') + '">' +
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
        '<div id="mk-pane-item" class="market-pane active">' +
          '<p class="craft-muted">搜尋一個物品開始查詢——即時價格、跨服比價、銷售速度，如果是可製作品還會顯示完整供應鏈。</p>' +
        '</div>' +
        '<div id="mk-pane-radar" class="market-pane"></div>' +
        '<div id="mk-pane-hot" class="market-pane"></div>' +
      '</div>';

    updateMarketSettingsSummary();
    renderRecentlyViewed();
    renderWatchlistPanel();
    bindSearchBox();
    bindTabSwitch();
    renderRadarShell();
    fitMarketHeights();

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
      '<div class="craft-settings-field"' + (MarketData.dcSelectorVisible ? '' : ' style="display:none"') + '><label>資料中心<span class="craft-muted">（材料成本查詢範圍）</span></label><select id="mk-set-dc" class="craft-select craft-select-block"><option value="">資料中心⋯</option></select></div>' +
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
    if (radarRefreshHook) radarRefreshHook();
    fitMarketHeights();
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
      if (!q) { box.innerHTML = ''; box.classList.remove('open'); fitMarketHeights(); return; }
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
      if (!matches.length) { box.innerHTML = '<div class="craft-muted" style="padding:8px">查無符合的物品</div>'; box.classList.add('open'); fitMarketHeights(); return; }
      box.innerHTML = matches.map(function (m) {
        return '<div class="craft-search-item" data-mk-pick="' + m.id + '">' + itemIconHtml(m.id, 24) + '<span>' + m.name + '</span></div>';
      }).join('');
      box.classList.add('open');
      fitMarketHeights();
      box.querySelectorAll('[data-mk-pick]').forEach(function (el) {
        el.addEventListener('click', function () {
          input.value = el.textContent;
          box.innerHTML = ''; box.classList.remove('open');
          fitMarketHeights();
          openItemDetail(el.dataset.mkPick);
        });
      });
    }
    document.addEventListener('click', function (e) {
      if (!box.contains(e.target) && e.target !== input) { box.classList.remove('open'); fitMarketHeights(); }
    });
  }

  function bindTabSwitch() {
    document.querySelectorAll('[data-mk-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-mk-tab]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        const tab = btn.dataset.mkTab;
        $('mk-pane-item').classList.toggle('active', tab === 'item');
        $('mk-pane-radar').classList.toggle('active', tab === 'radar');
        $('mk-pane-hot').classList.toggle('active', tab === 'hot');
        if (tab === 'hot' && !$('mk-pane-hot').dataset.rendered) {
          $('mk-pane-hot').dataset.rendered = '1';
          renderHotShell();
        }
        fitMarketHeights();
      });
    });
  }

  /* 第1點的最終解法：前四輪一直用CSS的max-height+多層flex:1去「猜」子層該不該收縮，
   * 在實際瀏覽器裡並不會每次都可靠觸發——這就是反覆修不好的根本原因。改成直接用JS量測
   * 「上面固定區塊」實際佔了多高，用量出來的真實px數字設定.market-panes-flex的高度，
   * 下面的flex:1/min-height:0就是在一個「確定高度」的容器裡運作，不再是猜的，一定會生效。
   * 任何會讓上面固定區塊高度改變的操作（開合搜尋下拉、切分頁、視窗縮放、設定變更）都要重新量。 */
  function fitMarketHeights() {
    const root = document.getElementById('market-root');
    const topFixed = root && root.querySelector('.market-top-fixed');
    const panesFlex = root && root.querySelector('.market-panes-flex');
    if (!root || !topFixed || !panesFlex) return;
    // 第4點：這套固定高度機制是為桌面版左右並排設計的，手機版（≤720px）兩欄會疊成一直條，
    // 交給CSS媒體查詢處理成自然高度＋整頁捲動，這裡就不要再用行內style設定固定px高度去蓋掉它。
    if (window.innerWidth <= 720) { panesFlex.style.height = ''; return; }
    // 第6點抓到的真正原因：舊寫法用 root.getBoundingClientRect().bottom 當基準，但root的實際
    // 渲染高度（CSS max-height:82vh，根據內容多高撐開）本身又受panesFlex目前的高度影響——
    // 這是一個循環依賴：量出來的值會回頭影響下一次量測的基準，每次只能往正確答案「靠近一點點」，
    // 要點很多下才收斂到正確高度，剛好對上你看到的症狀。改成完全不依賴root目前渲染高度的算法：
    // 用window.innerHeight（永遠固定，不受任何內容影響）乘上跟CSS一致的82%上限，
    // 再扣掉topFixed自己的實際高度（topFixed是flex-shrink:0，大小只取決於自己的內容，
    // 跟panesFlex完全無關）——這樣算出來的值第一次就是對的，不用等好幾次點擊才收斂。
    const viewportCap = window.innerHeight * 0.85;
    const topFixedH = topFixed.getBoundingClientRect().height;
    const available = Math.max(160, Math.floor(viewportCap - topFixedH));
    panesFlex.style.height = available + 'px';
  }
  window.addEventListener('resize', function () { fitMarketHeights(); });

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
        // 同一個成品只算一次（多個職業都能做、或同一配方兩個欄位放同一材料，都會造成重複）
        const list = marketUsedInIndex[ing.itemId];
        if (!list.some(function (otherRid) { return CRAFT_RECIPES[otherRid].itemId === recipe.itemId; })) list.push(rid);
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
        '<button type="button" class="market-solve-btn" id="mk-solve-btn" disabled><i class="ph ph-flask"></i> 查詢是否可製作⋯</button>' +
      '</div>' +
      '<div class="market-detail-columns">' +
        '<div id="mk-detail-market" class="market-detail-section market-col-market"><p class="craft-muted">讀取市場資料中⋯</p></div>' +
        '<div class="market-detail-section market-col-supply">' +
          '<div id="mk-detail-supply"></div>' +
        '</div>' +
      '</div>';
    bindWatchButton(itemId); // 跟名稱同一行，不用等市場資料回來才看得到，關注這件事跟查不查得到價格無關
    bindSolveButton(itemId);
    loadMarketSection(itemId);
    loadSupplyChainSection(itemId);
  }

  // 第7點：查這個物品能不能製作，能的話按下去直接跳到生產頁面、預先選好這個配方；
  // 不能製作（原礦、打寶、兌換來的東西）就顯示「無法製作」，不能點。
  async function bindSolveButton(itemId) {
    const btn = $('mk-solve-btn');
    if (!btn) return;
    await ensureCraftDataLoaded();
    if (typeof CRAFT_RECIPES === 'undefined') { btn.innerHTML = '<i class="ph ph-flask"></i> 無法製作'; btn.classList.add('market-solve-btn-disabled'); return; }
    const rid = (buildToRecipesIndex()[itemId] || [])[0];
    if (!rid) { btn.innerHTML = '<i class="ph ph-flask"></i> 無法製作'; btn.classList.add('market-solve-btn-disabled'); return; }
    btn.innerHTML = '<i class="ph ph-flask"></i> 製作求解';
    btn.disabled = false;
    btn.addEventListener('click', function () { openCraftSolverModal(rid); });
  }

  /* 第3點：改成彈出視窗顯示生產頁面，不整頁跳轉——直接把#craft那個scene用CSS蓋成一個
   * 置中的彈窗樣式疊在市場頁上面，不用真的觸發app.nav()切換場景（market其實沒有被關閉，
   * 只是視覺上被蓋住），按右上角X只是拿掉這個彈窗樣式，市場頁的畫面/捲動位置完全沒受影響。
   * 選配方的部分改叫app.openCraftForRecipe()——這個函式自己會判斷生產頁資料到底載入好了沒，
   * 不管哪種狀態呼叫都能正確選好配方，不會再出現「跳轉過去了但沒真的選到那個配方」的狀況。 */
  /* 第2點：改用iframe——載入的是全新、完全獨立的頁面實例，跟外層市場頁、跟你自己另外開分頁
   * 手動瀏覽的生產頁，三者的程式狀態互不相干，關掉這個彈窗不會影響到其他地方選了什麼配方。
   * iframe的src帶上#page=craft&recipe=xxx，app.js讀到這個hash會直接跳進生產頁並預選好配方
   * （見app.js的app.init()）。
   * 第1點：框大小改成貼近生產頁實際內容寬度（900px上限），不是硬撐滿視窗留一堆空白側邊。 */
  function ensureCraftModalDom() {
    let modal = $('mk-craft-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'mk-craft-modal';
    modal.className = 'market-modal-backdrop';
    modal.style.display = 'none';
    modal.innerHTML = '<div class="market-craft-modal-box">' +
      '<div class="market-craft-modal-head"><span>製作求解</span>' +
        '<button type="button" class="market-modal-scene-close" data-mk-close-craft="1" aria-label="關閉">✕</button>' +
      '</div>' +
      '<iframe id="mk-craft-modal-iframe" class="market-craft-modal-iframe" title="製作求解"></iframe>' +
    '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeCraftModal(); });
    modal.querySelector('[data-mk-close-craft]').addEventListener('click', closeCraftModal);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.style.display !== 'none') closeCraftModal(); });
    return modal;
  }
  function closeCraftModal() {
    const modal = $('mk-craft-modal');
    if (!modal) return;
    modal.style.display = 'none';
    $('mk-craft-modal-iframe').src = 'about:blank'; // 關掉時清空，下次開啟保證是全新載入，不會殘留上次的狀態
  }
  app.openMarketCraftModal = function (rid) { openCraftSolverModal(rid); }; // 也方便測試直接呼叫
  app.openMarketTrend = function (itemId, scopeWorld) { openTrendModal(itemId, scopeWorld); }; // 也方便測試直接呼叫
  function openCraftSolverModal(rid) {
    const modal = ensureCraftModalDom();
    $('mk-craft-modal-iframe').src = window.location.pathname + '#page=craft&embed=1&recipe=' + rid;
    modal.style.display = 'flex';
  }

  function timeAgo(unixSeconds) {
    const diff = Date.now() / 1000 - unixSeconds;
    if (diff < 3600) return Math.max(1, Math.round(diff / 60)) + '分鐘前';
    if (diff < 86400) return Math.round(diff / 3600) + '小時前';
    return Math.round(diff / 86400) + '天前';
  }

  /* 第8點：市場走勢圖。資料就是overview.history（近期實際成交紀錄，Universalis本來就有回傳，
   * 只是之前沒有拿來畫圖），用純手刻SVG折線，不引入額外圖表函式庫，維持低維護的原則。
   * 第3點：拿掉「以天分組取平均」——分組會讓短天數選項失去參考價值（幾乎沒有平均的意義），
   * 恢復成不分組、每一筆真實成交都畫出來。改成畫兩條獨立的線：NQ一條實線、HQ一條虛線，
   * 顏色也不同，各自只連接自己品質的點，這樣兩條價格趨勢可以分開看，不會因為NQ/HQ交錯
   * 成交而讓同一條線在兩者之間跳來跳去、看不出真正的走勢。點的形狀維持圓形=NQ、星形=HQ。 */
  // 第4點：均價徽章點下去彈出不同天數的均價比較，不是只看「現在」這一個數字
  function ensureAvgPricePopoverDom() {
    let pop = $('mk-avgprice-popover');
    if (pop) return pop;
    pop = document.createElement('div');
    pop.id = 'mk-avgprice-popover';
    pop.className = 'craft-mat-worlds-popover craft-settings-popover';
    pop.style.display = 'none';
    document.body.appendChild(pop);
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { pop.style.display = 'none'; });
    return pop;
  }
  async function openAvgPricePopover(itemId, anchorBtn, fallbackAvg, scopeWorld) {
    const scopeLabel = scopeWorld ? '（' + scopeWorld + '）' : '（所有世界）';
    const pop = ensureAvgPricePopoverDom();
    pop.innerHTML = '<p class="craft-mat-worlds-title">均價比較' + scopeLabel + '</p><p class="craft-muted" style="font-size:11px">讀取歷史成交中⋯</p>';
    pop.style.display = 'block';
    const r = anchorBtn.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 260)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    try {
      const full = await MarketData.fetchFullHistory(itemId, 30, scopeWorld || undefined);
      const now = Date.now() / 1000;
      // 第1點：改成不重疊的區間切片，跟均價徽章同一套定義——「當前」是0~24小時，
      // 「1天前」是24~48小時，都是實際成交紀錄的均價，不是掛單快照均價。
      // 「近1天成交均價」＝最近48小時內（當天＋昨天）；所有窗口都從「現在」算起，不跳過最近一小時。
      // 第1點：「當前成交均價」＝最近24小時的成交，不是最近1小時。
      function avgInRange(fromH, toH) {
        const list = full.filter(function (h) { return h.timestamp >= now - toH * 3600 && h.timestamp < now - fromH * 3600; });
        return list.length ? Math.round(list.reduce(function (s, h) { return s + h.pricePerUnit; }, 0) / list.length) : null;
      }
      const current = avgInRange(0, 24);
      const oneDay = avgInRange(0, 48);
      // 3/7/30天你確認要用「過去N天整段」的累積平均，不是單日切片
      function avgWithinDays(days) {
        const list = full.filter(function (h) { return h.timestamp >= now - days * 86400; });
        return list.length ? Math.round(list.reduce(function (s, h) { return s + h.pricePerUnit; }, 0) / list.length) : null;
      }
      const avg3d = avgWithinDays(3), avg7d = avgWithinDays(7), avg30d = avgWithinDays(30);
      pop.innerHTML = '<p class="craft-mat-worlds-title">均價比較' + scopeLabel + '</p>' +
        '<p class="market-avgprice-row"><span>當前成交均價</span><strong>' + (current != null ? current.toLocaleString() + ' 金' : '無成交') + '</strong></p>' +
        '<p class="market-avgprice-row"><span>近1天成交均價</span><strong>' + (oneDay != null ? oneDay.toLocaleString() + ' 金' : '無成交') + '</strong></p>' +
        '<p class="market-avgprice-row"><span>近3天成交均價</span><strong>' + (avg3d != null ? avg3d.toLocaleString() + ' 金' : '無成交') + '</strong></p>' +
        '<p class="market-avgprice-row"><span>近7天成交均價</span><strong>' + (avg7d != null ? avg7d.toLocaleString() + ' 金' : '無成交') + '</strong></p>' +
        '<p class="market-avgprice-row"><span>近30天成交均價</span><strong>' + (avg30d != null ? avg30d.toLocaleString() + ' 金' : '無成交') + '</strong></p>' +
        '<p class="craft-muted" style="font-size:10px;margin-top:4px">「當前」是最近24小時內的成交；「近1天」是最近48小時內（當天＋昨天）；「近3/7/30天」是過去那整段時間所有成交的平均。</p>';
    } catch (e) {
      pop.innerHTML = '<p class="craft-mat-worlds-title">均價比較' + scopeLabel + '</p><p class="craft-muted" style="font-size:11px">讀取失敗，請稍後再試。</p>';
    }
  }

  /* 詳情頁的均價／賣速：優先用預先計算資料（每小時算好，包含完整24小時內所有成交，而且是整個範圍的，
   * 而不是「最近200筆」；讀已經下載過的檔案是瞬間的）。資料超過24小時沒更新、讀不到、或這個道具在該範圍沒有
   * 資料時回傳 null，呼叫的地方就走原本的即時查詢。這裡的「當前均價」跟預先計算的24小時窗口是同一個定義：
   * 從現在往前24小時內所有成交的平均單價（NQ／HQ一起算）。 */
  async function getPrecomputedRow(scopeKey, itemId) {
    try {
      const r = await MarketData.loadPrecomputed(scopeKey);
      if (r.state === 'ok' && r.ageMs <= 24 * 3600 * 1000) return r.data.items[itemId] || null;
    } catch (e) { /* 讀不到就走即時查詢 */ }
    return null;
  }
  function pcRowToStat(row) {
    const D = row[6];
    return {
      velocity: { nqVelocityPerDay: row[0], hqVelocityPerDay: row[1], usedScope: 'pc' },
      avg24h: D && D[0] > 0 ? D[1] : null,
    };
  }

  async function loadMarketSection(itemId) {
    const box = $('mk-detail-market');
    if (!MarketData.getSettings().dcName) {
      box.innerHTML = '<p class="craft-muted">尚未設定資料中心，點右上角「設定」後才能查價。</p>';
      return;
    }
    const out = await Promise.all([
      MarketData.getItemMarketOverview(itemId).catch(function () { return null; }),
      MarketData.fetchSaleVelocityBatch([Number(itemId)], MarketData.getSettings().dcName).then(function (m) { return m[itemId] || null; }).catch(function () { return null; }),
      MarketData.getSettings().worldName ? MarketData.getSellTaxInfo(MarketData.getSettings().worldName).catch(function () { return null; }) : Promise.resolve(null),
      getPrecomputedRow('ALL', itemId),
    ]);
    const overview = out[0], taxInfo = out[2];
    const pcStat = out[3] ? pcRowToStat(out[3]) : null;
    const velocity = pcStat ? pcStat.velocity : out[1]; // 有預先計算資料就用它（跟熱度排行同一份），沒有才用即時查到的
    let html = '';

    /* 統計摘要全部濃縮成一條可換行的徽章列（第1點）：原本每個數字各自佔一整行<p>，
     * 五六行文字疊起來就把左欄一半版面吃掉，擠壓到下面清單能顯示的筆數。改成徽章後
     * 同一條列最多換行兩次，省下來的高度直接讓清單多顯示好幾筆，不用大量捲動才看得到。
     * 最低價是目前真實存在、有競爭力的參考數字，擺第一個；均價/最高價只是輔助參考。 */
    /* 統計徽章（最低／均價／最高）跟下面的世界下拉選單連動：選「所有世界」＝整個資料中心
     * （跟以前一樣），選了某個世界＝只用那個世界自己的掛單跟成交紀錄計算；
     * 均價底下「當前／近1天／近3、7、30天」各自的時間邏輯完全不變，只是計算對象換掉。
     * 賣速徽章不受影響（它有自己的範圍標示）。 */
    function velBadgeHtml(v, scopeWorld) {
      if (v && (v.nqVelocityPerDay != null || v.hqVelocityPerDay != null)) {
        return '<span class="market-stat-badge">賣速 NQ ' + (v.nqVelocityPerDay || 0).toFixed(1) + '/天　HQ ' + (v.hqVelocityPerDay || 0).toFixed(1) + '/天（' + (scopeWorld || '所有世界') + '）</span>';
      }
      if (v && v.usedScope === null) return '<span class="market-stat-badge market-stat-badge-muted">近4天查無成交' + (scopeWorld ? '（' + scopeWorld + '）' : '') + '</span>';
      return '';
    }
    function buildStatBarHtml(st) {
      const parts = [];
      if (st.minPrice) parts.push('<span class="market-stat-badge market-stat-badge-strong">目前最低 ' + st.minPrice.toLocaleString() + '金</span>');
      // 均價：近24小時實際成交均價，不是掛單快照均價（掛單均價容易被囤積的高價/低價單誤導）。
      // 24小時內沒有成交的冷門物品，退回用掛單均價並標＊，註明這不是真的成交均價。
      if (st.avgLoading) parts.push('<span class="market-stat-badge market-stat-badge-muted">均價 計算中⋯</span>');
      else if (st.avgDisplay != null) parts.push('<button type="button" class="market-stat-badge market-stat-badge-btn" id="mk-avgprice-badge">均價 ' + st.avgDisplay.toLocaleString() + '金' + (st.avgIsFallback ? '<span class="craft-muted">＊</span>' : '') + '<i class="ph ph-caret-down" style="font-size:9px;margin-left:3px"></i></button>');
      if (st.maxPrice) parts.push('<span class="market-stat-badge">最高 ' + st.maxPrice.toLocaleString() + '金</span>');
      if (st.velLoading) parts.push('<span class="market-stat-badge market-stat-badge-muted">賣速 計算中⋯</span>');
      else { const vb = velBadgeHtml(st.velocity, st.scopeWorld); if (vb) parts.push(vb); }
      return parts.join('');
    }
    const last24h = (overview && overview.history) ? overview.history.filter(function (h) { return h.timestamp >= Date.now() / 1000 - 86400; }) : [];
    const liveAvg24h = last24h.length ? Math.round(last24h.reduce(function (s, h) { return s + h.pricePerUnit; }, 0) / last24h.length) : null;
    // 預先計算的24小時均價涵蓋完整24小時；即時查到的只是「最近200筆」裡剛好落在24小時內的，成交熱絡的道具會偏短
    const avg24h = pcStat && pcStat.avg24h != null ? pcStat.avg24h : liveAvg24h;
    const dcStat = {
      minPrice: overview && overview.minPrice, maxPrice: overview && overview.maxPrice,
      avgDisplay: avg24h != null ? avg24h : (overview && overview.avgPrice ? Math.round(overview.avgPrice) : null),
      avgIsFallback: avg24h == null && !!(overview && overview.avgPrice),
      velocity: velocity, scopeWorld: null,
    };
    // 買賣方稅率／資料新鮮度是輔助小字，跟徽章列分開放，但合併成一行，不再各佔一整行<p>。
    // 稅後估算基準用目前最低掛單價，不是均價：要有競爭力就得訂在最低價附近，均價不是你實際能賣到的價格。
    const footNotes = [];
    if (taxInfo && overview && overview.minPrice) {
      const netMin = Math.round(overview.minPrice * (1 - taxInfo.ratePercent / 100));
      footNotes.push('貼最低價在' + taxInfo.cityName + '寄售（稅率最低，扣' + (Math.round(taxInfo.ratePercent * 10) / 10) + '%）約拿 <span style="color:#4ade80">' + netMin.toLocaleString() + ' 金</span>');
    }
    if (overview && overview.lastUploadTime) footNotes.push('資料更新於 ' + timeAgo(overview.lastUploadTime / 1000));

    html += '<div class="market-stat-bar" id="mk-stat-bar">' + buildStatBarHtml(dcStat) + '</div>';
    if (footNotes.length) html += '<p class="market-stat-foot craft-muted">' + footNotes.join('　·　') + '</p>';

    if (!overview || !overview.listings.length) {
      html += '<p class="craft-muted">目前查無掛單（可能沒有人在賣）</p>';
      box.innerHTML = html;
      return;
    }

    // 第9點：欄位排版模仿遊戲原生市場介面（優質／價格／數量／總計價格／僱員名），
    // 「魔晶石數量」是遊戲那邊跟這個查詢介面無關的欄位，照你的指示忽略掉。
    // 第8點：世界欄位改成篩選下拉，預設「所有世界」，選了特定世界就只顯示那個世界的掛單。
    const dcWorlds = MarketData.getSettings().dcName ? await MarketData.listWorldNamesInDc(MarketData.getSettings().dcName).catch(function () { return []; }) : [];
    html += '<p class="market-subheading">目前掛單（共 ' + overview.listings.length + ' 筆） ' +
        '<button type="button" class="market-history-btn" data-mk-open-history="1">查看最近成交紀錄</button>' +
        '<button type="button" class="market-history-btn" id="mk-hq-filter-btn">只顯示HQ</button>' +
        '<button type="button" class="market-history-btn" data-mk-open-trend="1">查看走勢圖</button>' +
        '<select id="mk-world-filter" class="craft-select" style="margin-left:6px;font-size:11px">' +
          // optgroup 的標題列看起來像分類、不能被選取，只當說明用；預設選中的仍是裡面第一個「所有世界」（標題的配色見 page-market.css）
          '<optgroup label="掛單、均價、賣速、成交及走勢圖顯示範圍">' +
            '<option value="ALL">所有世界</option>' +
            dcWorlds.map(function (w) { return '<option value="' + w + '">' + w + '</option>'; }).join('') +
          '</optgroup>' +
        '</select>' +
        '<label class="market-fee-toggle-inline"><input type="checkbox" id="mk-fee-toggle"' + (taxInfo && taxInfo.ratePercent ? '' : ' disabled') + '/> 總計價格算入跨城市手續費</label>' +
      '</p>' +
      // 第7點：表頭獨立在捲動區域外面（跟成交紀錄彈窗同一招），欄寬用同一組mfr-*class對齊，
      // 不再用<table><thead>，捲動時表頭固定不動，資料列在下面單獨捲動。
      '<div class="market-flexrow market-flexrow-head">' +
        '<span class="mfr-hq">優質</span><span class="mfr-price">價格</span><span class="mfr-qty">數量</span><span class="mfr-total">總計價格</span><span class="mfr-buyer">僱員名</span><span class="mfr-world">世界</span>' +
      '</div>' +
      '<div id="mk-listing-table-slot"></div>';
    box.innerHTML = html;

    const worldHistoryCache = {};
    const historyBtn = box.querySelector('[data-mk-open-history]');
    if (historyBtn) {
      historyBtn.addEventListener('click', async function () {
        // 跟世界下拉連動：所有世界＝整個資料中心的近期成交；選了世界就只看那個世界自己的成交
        if (worldFilter === 'ALL') { openHistoryModal(itemId, overview.history, null); return; }
        const w = worldFilter;
        if (!worldHistoryCache[w]) {
          try { worldHistoryCache[w] = await MarketData.getRecentHistoryForWorld(itemId, w, 50); }
          catch (e) { worldHistoryCache[w] = []; }
        }
        openHistoryModal(itemId, worldHistoryCache[w], w);
      });
    }
    const trendBtn = box.querySelector('[data-mk-open-trend]');
    if (trendBtn) {
      trendBtn.addEventListener('click', function () { openTrendModal(itemId, worldFilter === 'ALL' ? null : worldFilter); });
    }
    let worldFilter = 'ALL'; // 目前選的範圍：'ALL'＝整個資料中心，否則是世界名稱
    function bindAvgBadge() {
      const avgBtn = box.querySelector('#mk-avgprice-badge');
      if (!avgBtn) return;
      avgBtn.addEventListener('click', function (e) {
        e.stopPropagation(); // 沒有這行，點擊會冒泡到document把彈窗自己剛打開的畫面關掉，看起來像沒反應
        openAvgPricePopover(itemId, avgBtn, overview.avgPrice, worldFilter === 'ALL' ? null : worldFilter);
      });
    }
    bindAvgBadge();
    // 統計徽章隨選擇的範圍更新。世界範圍的均價要另外查該世界最近24小時成交（一頁就夠），
    // token 避免使用者連續切換時，慢回來的舊結果蓋掉新畫面。
    let statToken = 0;
    const worldHist24Cache = {}, worldVelCache = {};
    function setStatBar(st) { const el = $('mk-stat-bar'); if (el) { el.innerHTML = buildStatBarHtml(st); bindAvgBadge(); } }
    async function updateStatBar() {
      const token = ++statToken;
      if (worldFilter === 'ALL') { setStatBar(dcStat); return; }
      const ls = activeListingSet || [];
      const base = { minPrice: ls.length ? ls[0].pricePerUnit : null, maxPrice: ls.length ? ls[ls.length - 1].pricePerUnit : null };
      base.scopeWorld = worldFilter;
      // 先看預先計算資料有沒有這個世界的這個道具：有就直接算，不用再發兩個即時請求
      const pcRowW = await getPrecomputedRow(worldFilter, itemId);
      if (token !== statToken) return;
      if (pcRowW) {
        const st = pcRowToStat(pcRowW);
        let avgDisplay = st.avg24h, avgIsFallback = false;
        if (avgDisplay == null && ls.length) { avgDisplay = Math.round(ls.reduce(function (t, l) { return t + l.pricePerUnit; }, 0) / ls.length); avgIsFallback = true; }
        setStatBar(Object.assign({ avgDisplay: avgDisplay, avgIsFallback: avgIsFallback, velocity: st.velocity }, base));
        return;
      }
      setStatBar(Object.assign({ avgLoading: true, velLoading: true }, base));
      let hist = worldHist24Cache[worldFilter];
      let vel = worldVelCache[worldFilter];
      await Promise.all([
        hist ? null : MarketData.fetchFullHistory(itemId, 1, worldFilter).then(function (h) { hist = h; worldHist24Cache[worldFilter] = h; }).catch(function () { hist = []; }),
        vel !== undefined ? null : MarketData.fetchSaleVelocityBatch([Number(itemId)], worldFilter).then(function (m) { vel = m[itemId] || null; worldVelCache[worldFilter] = vel; }).catch(function () { vel = null; }),
      ]);
      if (token !== statToken) return;
      base.velocity = vel;
      const nowSec = Date.now() / 1000;
      const recent = hist.filter(function (h) { return h.timestamp >= nowSec - 86400; });
      let avgDisplay = null, avgIsFallback = false;
      if (recent.length) avgDisplay = Math.round(recent.reduce(function (t, h) { return t + h.pricePerUnit; }, 0) / recent.length);
      else if (ls.length) { avgDisplay = Math.round(ls.reduce(function (t, l) { return t + l.pricePerUnit; }, 0) / ls.length); avgIsFallback = true; }
      setStatBar(Object.assign({ avgDisplay: avgDisplay, avgIsFallback: avgIsFallback }, base));
    }

    // hq-only／世界篩選／手續費都是純畫面篩選或計算（世界篩選除外，那個要重新查，見下面說明）
    let hqOnly = false, includeFee = false;
    const worldListingsCache = {}; // 同一次開啟頁面內，切換過的世界不用重複查
    // 第4點：切換到特定世界時，不是從DC總覽（上限100筆全服最便宜）裡篩選，因為那樣篩出來的
    // 筆數會不完整——改成直接對那個世界重新查一次，拿到它自己真正完整的掛單清單。
    let activeListingSet = overview.listings;
    function renderListingTableFromActiveSet() {
      let rows = hqOnly ? activeListingSet.filter(function (l) { return l.hq; }) : activeListingSet;
      const feeRate = (taxInfo && taxInfo.ratePercent) ? taxInfo.ratePercent / 100 : 0;
      $('mk-listing-table-slot').innerHTML = rows.length ? rows.map(function (l) {
        const total = l.pricePerUnit * l.quantity * (includeFee ? (1 + feeRate) : 1);
        return '<div class="market-flexrow"><span class="mfr-hq">' + (l.hq ? hqIconHtml() : '') + '</span><span class="mfr-price">' + l.pricePerUnit.toLocaleString() + '金</span><span class="mfr-qty">' + l.quantity.toLocaleString() + '</span><span class="mfr-total">' + Math.round(total).toLocaleString() + '金</span><span class="mfr-buyer">' + (l.retainerName || '—') + '</span><span class="mfr-world">' + l.world + '</span></div>';
      }).join('') : '<p class="craft-muted" style="padding:8px 0">這個世界目前查無掛單</p>';
    }
    renderListingTableFromActiveSet();
    $('mk-hq-filter-btn').addEventListener('click', function () {
      hqOnly = !hqOnly;
      this.classList.toggle('active', hqOnly);
      renderListingTableFromActiveSet();
    });
    $('mk-fee-toggle').addEventListener('change', function () { includeFee = this.checked; renderListingTableFromActiveSet(); });
    $('mk-world-filter').addEventListener('change', async function () {
      worldFilter = this.value;
      if (worldFilter === 'ALL') { activeListingSet = overview.listings; renderListingTableFromActiveSet(); updateStatBar(); return; }
      if (worldListingsCache[worldFilter]) { activeListingSet = worldListingsCache[worldFilter]; renderListingTableFromActiveSet(); updateStatBar(); return; }
      $('mk-listing-table-slot').innerHTML = '<p class="craft-muted" style="padding:8px 0">查詢' + worldFilter + '掛單中⋯</p>';
      try {
        const listings = await MarketData.getListingsForWorld(itemId, worldFilter);
        worldListingsCache[worldFilter] = listings;
        activeListingSet = listings;
      } catch (e) {
        activeListingSet = [];
      }
      renderListingTableFromActiveSet();
      if (worldFilter === this.value) updateStatBar(); // 查詢期間又切走了就不用更新
    });
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
    if (!list.length) { box.innerHTML = ''; fitMarketHeights(); return; }
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
    fitMarketHeights();
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
      '<div class="market-flexrow market-flexrow-head">' +
        '<span class="mfr-hq">優質</span><span class="mfr-price">成交價</span><span class="mfr-qty">數量</span><span class="mfr-total">總計價格</span><span class="mfr-buyer">買家</span><span class="mfr-world">世界</span><span class="mfr-time">時間</span>' +
      '</div>' +
      '<div id="mk-history-body" class="market-modal-body"></div>' +
    '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.style.display = 'none'; });
    modal.querySelector('[data-mk-close-history]').addEventListener('click', function () { modal.style.display = 'none'; });
    return modal;
  }
  function openHistoryModal(itemId, history, scopeWorld) {
    const modal = ensureHistoryModalDom();
    const titleEl = modal.querySelector('.market-modal-head h4');
    if (titleEl) titleEl.textContent = '最近成交紀錄（' + (scopeWorld || '所有世界') + '）';
    const body = $('mk-history-body');
    if (!history || !history.length) {
      body.innerHTML = '<p class="craft-muted">近期查無成交紀錄</p>';
    } else {
      // 第2點：表頭改成獨立在捲動區域「外面」的一列，不再用position:sticky貼在表格<th>上——
      // sticky套用在table cell上，不同瀏覽器渲染很不穩定（重影/穿洞就是這樣來的）。
      // 改成表頭跟資料列都用同一組class控制欄寬（flex排版，不是<table>），表頭固定在最上面
      // 不隨內容捲動，資料列在下面單獨捲動，兩者欄寬對得齊，也不會有sticky那些渲染問題。
      // 第7點：欄位改成跟掛單列表一樣的結構(優質/價格/數量/總計價格/○名/世界)，只是「僱員名」
      // 換成「買家」——掛單是誰在賣，成交紀錄是誰買走的，概念上對應但不是同一個人。
      body.innerHTML = history.slice(0, 50).map(function (h) {
        const total = h.pricePerUnit * h.quantity;
        return '<div class="market-flexrow"><span class="mfr-hq">' + (h.hq ? hqIconHtml() : '') + '</span><span class="mfr-price">' + h.pricePerUnit.toLocaleString() + '金</span><span class="mfr-qty">' + h.quantity.toLocaleString() + '</span><span class="mfr-total">' + total.toLocaleString() + '金</span><span class="mfr-buyer">' + (h.buyerName || '—') + '</span><span class="mfr-world">' + h.world + '</span><span class="mfr-time craft-muted">' + timeAgo(h.timestamp) + '</span></div>';
      }).join('');
    }
    modal.style.display = 'flex';
  }

  // 第2點：走勢圖彈窗，按鈕跟「查看最近成交紀錄」放一起，不再直接佔用供應鏈欄的版面
  /* ── 走勢圖（Canvas）──
   * 舊版是 SVG，每一筆成交一個元素：成交量大的道具會出現幾百上千個點糊成一團，手機更是完全看不出東西。
   * 新版的原則：「每一筆成交都找得到，但不要求整張圖同時畫出每一個點」。
   *  ① 點太密時自動改畫「價格範圍色帶＋平均線＋成交量長條」；點少到看得清楚才畫一個個獨立的點。
   *     切換的依據是「圖實際有多寬」：平均每 8 像素放不到一個點就改畫色帶，所以手機（圖比較窄）
   *     會比電腦更早切換，不會有380個點擠在340像素裡的狀況。
   *  ② 拖曳選一段時間放大（手機請水平拖曳），放大到點夠少，就變回一個個獨立的成交點。
   *  ③ 圖下方的成交明細表列出「目前圖上範圍」的每一筆成交，可依品質／世界篩選、依時間／單價排序；
   *     點色帶的某一格，明細表就只列出那一格時間內的成交。
   *  ④ 離群值：預設把最極端的少數價格收在圖外（Y軸用 2%~98% 分位數），讓主要走勢看得清楚，
   *     被收掉的筆數會標出來，明細表裡仍然找得到；也可以切成對數刻度。
   *  ⑤ X軸是真正的時間軸（舊版是「第幾筆」平均分佈，成交空窗期看不出來）。 ── */
  function fmtTrendTime(ts, withDate) {
    const d = new Date(ts * 1000);
    const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return (withDate ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' : '') + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function niceTicks(lo, hi, count) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(lo + (hi - lo) * (i / (count - 1)));
    return out;
  }
  function createTrendChart(els, opts) {
    const st = { pts: [], view: null, log: false, hideOut: true, hover: null, sel: null, tableRange: null, mode: 'dots',
      buckets: null, dotPts: null, geom: null, done: false, scopeWorld: opts.scopeWorld,
      fQuality: 'all', fWorld: 'all', sortKey: 'time', sortDir: -1, tableShown: 100, skippedOut: 0 };
    const cv = els.canvas, tip = els.tip;

    function visibleRange() { return st.view || { t0: 0, t1: 1 }; }
    function lowerBound(t) { let lo = 0, hi = st.pts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (st.pts[m].ts < t) lo = m + 1; else hi = m; } return lo; }
    function visiblePts() { const v = visibleRange(); const a = lowerBound(v.t0), b = lowerBound(v.t1 + 1); return st.pts.slice(a, b); }

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const cssW = cv.clientWidth || 300, cssH = cv.clientHeight || 240;
      if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) { cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cssW, cssH);
      const PADL = 52, PADR = 10, PADT = 10, PADB = 24;
      const plotW = cssW - PADL - PADR, plotH = cssH - PADT - PADB;
      const v = visibleRange();
      const vis = visiblePts();
      st.geom = { PADL: PADL, PADT: PADT, plotW: plotW, plotH: plotH, cssW: cssW, cssH: cssH };
      g.font = '10px sans-serif';
      if (!vis.length) {
        g.fillStyle = '#888'; g.textAlign = 'center';
        g.fillText(st.done ? '這個範圍內沒有成交紀錄' : '讀取中⋯', cssW / 2, cssH / 2);
        st.mode = 'dots'; st.buckets = null; st.dotPts = null;
        return;
      }
      const span = Math.max(1, v.t1 - v.t0);
      const xOf = function (t) { return PADL + ((t - v.t0) / span) * plotW; };
      // Y 範圍
      const prices = vis.map(function (p) { return p.price; }).sort(function (a, b) { return a - b; });
      let lo = prices[0], hi = prices[prices.length - 1];
      st.skippedOut = 0;
      if (st.hideOut && prices.length >= 20) {
        const p2 = prices[Math.floor(prices.length * 0.02)], p98 = prices[Math.min(prices.length - 1, Math.ceil(prices.length * 0.98) - 1)];
        const pad = (p98 - p2) * 0.08 || p98 * 0.05 || 1;
        lo = Math.max(prices[0], p2 - pad); hi = Math.min(prices[prices.length - 1], p98 + pad);
        st.skippedOut = vis.filter(function (p) { return p.price < lo || p.price > hi; }).length;
      }
      if (hi === lo) { hi = lo * 1.05 + 1; lo = Math.max(0, lo * 0.95 - 1); }
      const tr = st.log ? function (x) { return Math.log(Math.max(1, x)); } : function (x) { return x; };
      const tlo = tr(Math.max(1, lo)), thi = tr(hi);
      const volH = plotH * 0.2;
      const yOf = function (price, bandMode) {
        const top = PADT, bottom = PADT + plotH - (bandMode ? volH + 4 : 0);
        const f = (tr(Math.min(hi, Math.max(lo, price))) - tlo) / ((thi - tlo) || 1);
        return bottom - f * (bottom - top);
      };
      // 決定畫法：平均每8像素放不下一個點 → 色帶
      const bandMode = vis.length > plotW / 8;
      st.mode = bandMode ? 'band' : 'dots';
      // 軸
      g.strokeStyle = 'rgba(197,160,89,.18)'; g.lineWidth = 1; g.fillStyle = '#999'; g.textAlign = 'right';
      niceTicks(lo, hi, 5).forEach(function (val, idx) {
        const price = st.log ? Math.exp(tlo + (thi - tlo) * (idx / 4)) : val;
        const y = yOf(price, bandMode);
        g.beginPath(); g.moveTo(PADL, y); g.lineTo(PADL + plotW, y); g.stroke();
        g.fillText(Math.round(price).toLocaleString(), PADL - 5, y + 3);
      });
      g.textAlign = 'center';
      const withDate = span > 36 * 3600;
      for (let i = 0; i <= 4; i++) {
        const t = v.t0 + span * (i / 4);
        g.fillText(fmtTrendTime(t, withDate), Math.min(cssW - 22, Math.max(PADL + 14, xOf(t))), cssH - 8);
      }
      if (!bandMode) {
        st.buckets = null; st.dotPts = [];
        vis.forEach(function (p) {
          const x = xOf(p.ts), y = yOf(p.price, false);
          const out = p.price < lo || p.price > hi;
          if (out) return; // 離群值不畫（明細表找得到）
          st.dotPts.push({ x: x, y: y, p: p });
          if (p.hq) {
            g.fillStyle = '#fcf6ba'; g.strokeStyle = '#3a2f1a'; g.lineWidth = 0.8; g.beginPath();
            for (let k = 0; k < 10; k++) { const ang = (Math.PI / 5) * k - Math.PI / 2; const rr = k % 2 === 0 ? 5.5 : 2.4; const px = x + rr * Math.cos(ang), py = y + rr * Math.sin(ang); if (k === 0) g.moveTo(px, py); else g.lineTo(px, py); }
            g.closePath(); g.fill(); g.stroke();
          } else {
            g.fillStyle = '#8fb3ff'; g.strokeStyle = '#1a2a3a'; g.lineWidth = 0.8; g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill(); g.stroke();
          }
        });
        if (st.hover && st.hover.p) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(st.hover.x, st.hover.y, 8, 0, Math.PI * 2); g.stroke(); }
      } else {
        const B = Math.max(8, Math.floor(plotW / 6));
        const bw = span / B;
        const bk = []; for (let i = 0; i < B; i++) bk.push({ i: i, n: 0, units: 0, min: Infinity, max: -Infinity, nqS: 0, nqN: 0, hqS: 0, hqN: 0, t0: v.t0 + bw * i, t1: v.t0 + bw * (i + 1) });
        vis.forEach(function (p) {
          const b = bk[Math.min(B - 1, Math.floor((p.ts - v.t0) / bw))];
          b.n++; b.units += p.qty; if (p.price < b.min) b.min = p.price; if (p.price > b.max) b.max = p.price;
          if (p.hq) { b.hqS += p.price; b.hqN++; } else { b.nqS += p.price; b.nqN++; }
        });
        st.buckets = bk; st.dotPts = null;
        const maxUnits = Math.max.apply(null, bk.map(function (b) { return b.units; })) || 1;
        const cw = plotW / B;
        // 成交量長條
        bk.forEach(function (b) {
          if (!b.n) return;
          const h = Math.max(1.5, (b.units / maxUnits) * volH);
          g.fillStyle = 'rgba(143,179,255,.35)'; g.fillRect(PADL + b.i * cw + 0.5, PADT + plotH - h, Math.max(1, cw - 1), h);
        });
        // 價格範圍色帶
        bk.forEach(function (b) {
          if (!b.n) return;
          const y1 = yOf(b.max, true), y2 = yOf(b.min, true);
          g.fillStyle = 'rgba(197,160,89,.30)'; g.fillRect(PADL + b.i * cw + 0.5, y1, Math.max(1, cw - 1), Math.max(2, y2 - y1));
        });
        // 平均線
        function line(sumKey, nKey, color, dash) {
          g.strokeStyle = color; g.lineWidth = 1.6; g.setLineDash(dash || []); g.beginPath(); let started = false;
          bk.forEach(function (b) { if (!b[nKey]) return; const x = PADL + (b.i + 0.5) * cw, y = yOf(b[sumKey] / b[nKey], true); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); });
          g.stroke(); g.setLineDash([]);
        }
        line('nqS', 'nqN', '#8fb3ff'); line('hqS', 'hqN', '#fcf6ba', [5, 3]);
        if (st.hover && st.hover.b) { const b = st.hover.b; g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(PADL + b.i * cw, PADT, cw, plotH); }
        if (st.tableRange) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(xOf(st.tableRange.t0), PADT, Math.max(2, xOf(st.tableRange.t1) - xOf(st.tableRange.t0)), plotH); }
      }
      if (st.sel) { g.fillStyle = 'rgba(197,160,89,.22)'; g.fillRect(Math.min(st.sel.x0, st.sel.x1), PADT, Math.abs(st.sel.x1 - st.sel.x0), plotH); }
      st.xOf = xOf; st.spanInfo = { t0: v.t0, span: span };
    }

    /* ── 明細表 ── */
    function tableRows() {
      const r = st.tableRange || visibleRange();
      const a = lowerBound(r.t0), b = lowerBound(r.t1 + 1);
      let rows = st.pts.slice(a, b);
      if (st.fQuality === 'nq') rows = rows.filter(function (p) { return !p.hq; });
      if (st.fQuality === 'hq') rows = rows.filter(function (p) { return p.hq; });
      if (st.fWorld !== 'all') rows = rows.filter(function (p) { return p.world === st.fWorld; });
      rows.sort(function (x, y) { const k = st.sortKey === 'price' ? 'price' : 'ts'; return (x[k] - y[k]) * st.sortDir; });
      return rows;
    }
    function renderTable() {
      const rows = tableRows();
      const shown = rows.slice(0, st.tableShown);
      const hasWorld = !st.scopeWorld && st.pts.some(function (p) { return p.world; });
      const worlds = hasWorld ? Array.from(new Set(st.pts.map(function (p) { return p.world; }).filter(Boolean))).sort() : [];
      const arrow = function (k) { return st.sortKey === k ? (st.sortDir < 0 ? ' ▼' : ' ▲') : ''; };
      const r = st.tableRange || visibleRange();
      els.table.innerHTML =
        '<div class="market-trend-tablehead">' +
          '<span class="market-subheading" style="margin:0">成交明細（' + fmtTrendTime(r.t0, true) + ' ~ ' + fmtTrendTime(r.t1, true) + '，共 ' + rows.length.toLocaleString() + ' 筆）</span>' +
          '<select data-tt="q" class="craft-select market-trend-sel"><option value="all"' + (st.fQuality === 'all' ? ' selected' : '') + '>NQ+HQ</option><option value="nq"' + (st.fQuality === 'nq' ? ' selected' : '') + '>只看NQ</option><option value="hq"' + (st.fQuality === 'hq' ? ' selected' : '') + '>只看HQ</option></select>' +
          (hasWorld ? '<select data-tt="w" class="craft-select market-trend-sel"><option value="all">所有世界</option>' + worlds.map(function (w) { return '<option value="' + w + '"' + (st.fWorld === w ? ' selected' : '') + '>' + w + '</option>'; }).join('') + '</select>' : '') +
          (st.tableRange ? '<button type="button" class="market-history-btn" data-tt="clr">取消單格選取</button>' : '') +
        '</div>' +
        (rows.length ? '<div class="market-trend-tablewrap"><table class="market-trend-table"><thead><tr>' +
          '<th data-sort="time" class="mk-sortable">時間' + arrow('time') + '</th>' + (hasWorld ? '<th>世界</th>' : '') + '<th>品質</th>' +
          '<th data-sort="price" class="mk-sortable">單價' + arrow('price') + '</th><th>數量</th><th>總價</th></tr></thead><tbody>' +
          shown.map(function (p) { return '<tr><td>' + fmtTrendTime(p.ts, true) + '</td>' + (hasWorld ? '<td>' + (p.world || '') + '</td>' : '') + '<td>' + (p.hq ? '<span style="color:#fcf6ba">HQ★</span>' : 'NQ') + '</td><td>' + p.price.toLocaleString() + '</td><td>' + p.qty + '</td><td>' + (p.price * p.qty).toLocaleString() + '</td></tr>'; }).join('') +
          '</tbody></table></div>' +
          (rows.length > shown.length ? '<button type="button" class="market-history-btn" data-tt="more">顯示更多（還有 ' + (rows.length - shown.length).toLocaleString() + ' 筆）</button>' : '')
          : '<p class="craft-muted">這個範圍內沒有符合的成交紀錄。</p>');
    }
    els.table.addEventListener('change', function (e) {
      const t = e.target.getAttribute('data-tt');
      if (t === 'q') st.fQuality = e.target.value; else if (t === 'w') st.fWorld = e.target.value; else return;
      st.tableShown = 100; renderTable();
    });
    els.table.addEventListener('click', function (e) {
      const th = e.target.closest('[data-sort]');
      if (th) { const k = th.getAttribute('data-sort'); if (st.sortKey === k) st.sortDir = -st.sortDir; else { st.sortKey = k; st.sortDir = -1; } renderTable(); return; }
      const t = e.target.getAttribute('data-tt');
      if (t === 'more') { st.tableShown += 200; renderTable(); }
      else if (t === 'clr') { st.tableRange = null; st.tableShown = 100; draw(); renderTable(); }
    });

    /* ── 互動：滑過看細節、拖曳放大、點色帶一格看那一格的成交 ── */
    function xFromEvent(e) { const r = cv.getBoundingClientRect(); return e.clientX - r.left; }
    function showTip(html, x, y) {
      tip.innerHTML = html; tip.style.display = 'block';
      const w = tip.offsetWidth; tip.style.left = Math.max(4, Math.min(cv.clientWidth - w - 4, x + 12)) + 'px'; tip.style.top = Math.max(4, y - 8) + 'px';
    }
    function hideTip() { tip.style.display = 'none'; }
    function hoverAt(x, y) {
      const gm = st.geom; if (!gm) return;
      if (st.mode === 'dots' && st.dotPts) {
        let best = null, bd = 14;
        st.dotPts.forEach(function (d) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } });
        st.hover = best; draw();
        if (best) showTip(best.p.price.toLocaleString() + '金 ×' + best.p.qty + (best.p.hq ? '（HQ）' : '（NQ）') + '<br>' + fmtTrendTime(best.p.ts, true) + (best.p.world ? ' · ' + best.p.world : ''), best.x, best.y); else hideTip();
      } else if (st.mode === 'band' && st.buckets) {
        const B = st.buckets.length, cw = gm.plotW / B;
        const i = Math.floor((x - gm.PADL) / cw);
        const b = st.buckets[i];
        if (b && b.n) { st.hover = { b: b }; draw(); showTip(fmtTrendTime(b.t0, true) + ' ~ ' + fmtTrendTime(b.t1, true) + '<br>' + b.n + ' 筆／' + b.units + ' 件<br>最低 ' + Math.round(b.min).toLocaleString() + '　最高 ' + Math.round(b.max).toLocaleString() + '<br><span style="color:#999">點一下只看這段時間的成交</span>', gm.PADL + (i + 0.5) * cw, gm.PADT + 10); }
        else { st.hover = null; draw(); hideTip(); }
      }
    }
    let down = null;
    cv.addEventListener('pointerdown', function (e) { down = { x: xFromEvent(e), moved: false }; st.sel = null; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
    cv.addEventListener('pointermove', function (e) {
      const x = xFromEvent(e), r = cv.getBoundingClientRect(), y = e.clientY - r.top;
      if (down) { if (Math.abs(x - down.x) > 6) down.moved = true; if (down.moved) { st.sel = { x0: down.x, x1: x }; hideTip(); draw(); return; } }
      if (e.pointerType === 'mouse' || !down) hoverAt(x, y);
    });
    cv.addEventListener('pointerup', function (e) {
      const x = xFromEvent(e), r = cv.getBoundingClientRect(), y = e.clientY - r.top;
      if (down && down.moved && st.sel && st.geom) {
        const a = Math.min(st.sel.x0, st.sel.x1), b = Math.max(st.sel.x0, st.sel.x1);
        const v = visibleRange(), gm = st.geom;
        const t0 = v.t0 + ((a - gm.PADL) / gm.plotW) * (v.t1 - v.t0), t1 = v.t0 + ((b - gm.PADL) / gm.plotW) * (v.t1 - v.t0);
        if (t1 - t0 > 60) { st.view = { t0: Math.max(v.t0, t0), t1: Math.min(v.t1, t1) }; st.tableRange = null; st.tableShown = 100; }
        st.sel = null; down = null; st.hover = null; draw(); renderTable(); return;
      }
      st.sel = null;
      if (down && st.mode === 'band' && st.buckets && st.geom) {
        const i = Math.floor((x - st.geom.PADL) / (st.geom.plotW / st.buckets.length)); const b = st.buckets[i];
        if (b && b.n) { st.tableRange = { t0: b.t0, t1: b.t1 }; st.tableShown = 100; draw(); renderTable(); }
      } else if (down && e.pointerType !== 'mouse') hoverAt(x, y);
      down = null;
    });
    cv.addEventListener('pointerleave', function () { if (!down) { st.hover = null; hideTip(); draw(); } });
    cv.addEventListener('dblclick', function () { api.resetView(); });

    const api = {
      state: st, draw: draw, renderTable: renderTable,
      /* 更新資料。partial=true 表示還在翻頁（先畫目前抓到的） */
      setData: function (list, rangeStart, now, done) {
        st.pts = list.map(function (h) { return { ts: h.timestamp, price: h.pricePerUnit, qty: h.quantity || 1, hq: !!h.hq, world: h.world || null }; }).sort(function (a, b) { return a.ts - b.ts; });
        st.done = done;
        const first = st.pts.length ? st.pts[0].ts : rangeStart;
        st.base = { t0: done ? rangeStart : Math.min(first, now - 3600), t1: now };
        if (!st.zoomed) st.view = { t0: st.base.t0, t1: st.base.t1 };
        draw(); renderTable();
      },
      resetView: function () { st.zoomed = false; st.tableRange = null; if (st.base) st.view = { t0: st.base.t0, t1: st.base.t1 }; st.tableShown = 100; draw(); renderTable(); },
      setLog: function (v) { st.log = v; draw(); },
      setHideOut: function (v) { st.hideOut = v; draw(); },
    };
    // 拖曳放大後標記為「使用者已縮放」，資料還在翻頁時就不會把他的視窗又重設掉
    const origUp = cv.onpointerup;
    cv.addEventListener('pointerup', function () { if (st.view && st.base && (st.view.t0 !== st.base.t0 || st.view.t1 !== st.base.t1)) st.zoomed = true; });
    return api;
  }

  function ensureTrendModalDom() {
    let modal = $('mk-trend-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'mk-trend-modal';
    modal.className = 'market-modal-backdrop';
    modal.style.display = 'none';
    modal.innerHTML = '<div class="market-modal-box market-modal-box-wide">' +
      '<div class="market-modal-head"><h4>近期成交走勢</h4><button type="button" class="market-modal-close" data-mk-close-trend="1" aria-label="關閉">✕</button></div>' +
      '<div class="market-modal-body" id="mk-trend-body"></div>' +
    '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.style.display = 'none'; });
    modal.querySelector('[data-mk-close-trend]').addEventListener('click', function () { modal.style.display = 'none'; });
    return modal;
  }
  const TREND_RANGES = [
    { key: '1', label: '1天', days: 1 }, { key: '3', label: '3天', days: 3 },
    { key: '7', label: '7天', days: 7 }, { key: '30', label: '30天', days: 30 },
  ];
  function openTrendModal(itemId, scopeWorld) {
    const modal = ensureTrendModalDom();
    const titleEl = modal.querySelector('.market-modal-head h4');
    if (titleEl) titleEl.textContent = '近期成交走勢（' + (scopeWorld || '所有世界') + '）';
    const body = $('mk-trend-body');
    body.innerHTML =
      '<div class="market-trend-range-row" id="mk-trend-range-row">' + TREND_RANGES.map(function (r) { return '<button type="button" class="market-history-btn market-trend-range-btn" data-range="' + r.key + '">' + r.label + '</button>'; }).join('') + '</div>' +
      '<div class="market-trend-opts">' +
        '<label><input type="checkbox" id="mk-trend-log"> 對數刻度</label>' +
        '<label><input type="checkbox" id="mk-trend-out" checked> 隱藏離群值</label>' +
        '<button type="button" class="market-history-btn" id="mk-trend-reset">重設縮放</button>' +
      '</div>' +
      '<p class="craft-muted market-trend-status" id="mk-trend-status"></p>' +
      '<div class="market-trend-canvaswrap"><canvas id="mk-trend-canvas" class="market-trend-canvas"></canvas><div id="mk-trend-tip" class="market-trend-tip" style="display:none"></div></div>' +
      '<p class="craft-muted" style="font-size:11px;margin:4px 0 10px">○ NQ　★ HQ。點太多時自動改畫價格範圍色帶（藍線＝NQ平均、金色虛線＝HQ平均）＋下方成交量。拖曳選一段時間可放大（手機請水平拖曳），點色帶一格只看那段時間的成交，雙擊重設。</p>' +
      '<div id="mk-trend-table"></div>';
    const chart = createTrendChart({ canvas: $('mk-trend-canvas'), tip: $('mk-trend-tip'), table: $('mk-trend-table') }, { scopeWorld: scopeWorld });
    let activeRange = '7'; // 預設抓一個中庸的區間，不要一開就是最大範圍（翻頁次數多、等比較久）
    let token = 0;
    async function loadRange() {
      const myToken = ++token;
      const myRange = activeRange;
      $('mk-trend-range-row').querySelectorAll('[data-range]').forEach(function (b) { b.classList.toggle('active', b.dataset.range === myRange); });
      const rangeDef = TREND_RANGES.find(function (r) { return r.key === myRange; });
      const now = Date.now() / 1000, rangeStart = now - rangeDef.days * 86400;
      chart.state.zoomed = false; chart.state.tableRange = null; chart.state.tableShown = 100;
      chart.setData([], rangeStart, now, false);
      $('mk-trend-status').textContent = '讀取中⋯（成交熱絡的道具要翻好幾頁，先畫出已抓到的部分）';
      try {
        const full = await MarketData.fetchFullHistory(itemId, rangeDef.days, scopeWorld || undefined, function (partial, done) {
          // 競態保護：使用者已經切到別的天數，這個請求晚到的進度就不要畫
          if (myToken !== token) return;
          chart.setData(partial, rangeStart, now, !!done);
          $('mk-trend-status').textContent = (done ? '' : '讀取中⋯ ') + '已載入 ' + partial.length.toLocaleString() + ' 筆成交';
        });
        if (myToken !== token) return;
        const filtered = full.filter(function (h) { return h.timestamp >= rangeStart; });
        chart.setData(filtered, rangeStart, now, true);
        const sk = chart.state.skippedOut;
        $('mk-trend-status').textContent = '共 ' + filtered.length.toLocaleString() + ' 筆成交' + (filtered.length ? '' : '（這個區間沒有成交）') + (sk ? '；圖上收起了 ' + sk + ' 筆極端價格（明細表裡仍然找得到，或取消勾選「隱藏離群值」）' : '');
      } catch (e) {
        if (myToken !== token) return;
        $('mk-trend-status').textContent = '讀取失敗，請稍後再試一次。';
      }
    }
    $('mk-trend-range-row').querySelectorAll('[data-range]').forEach(function (b) {
      b.addEventListener('click', function () { activeRange = b.dataset.range; loadRange(); });
    });
    $('mk-trend-log').addEventListener('change', function () { chart.setLog(this.checked); });
    $('mk-trend-out').addEventListener('change', function () { chart.setHideOut(this.checked); });
    $('mk-trend-reset').addEventListener('click', function () { chart.resetView(); });
    if (window.ResizeObserver) { new ResizeObserver(function () { chart.draw(); }).observe($('mk-trend-canvas')); }
    modal.style.display = 'flex';
    loadRange();
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
    const CARD_W = 96, CARD_H = 88, GAP = 16, PAD = 14;
    const CENTER_W = 112, CENTER_H = 84; // 中心卡片比一般卡片大一點，強調「這是目前正在看的物品」
    const rowCount = Math.max(matNodes.length, useNodes.length + (useOverflow ? 1 : 0), 1);
    const W = Math.max(360, rowCount * CARD_W + (rowCount - 1) * GAP + PAD * 2);
    const cx = W / 2;
    // 第2點抓到的真正原因：這裡原本不管上排/下排有沒有東西，永遠固定保留一整排卡片+兩個轉角
    // 間距的高度——五加木原木這種原礦沒有材料組成，下排明明完全沒有卡片，卻還是保留了一整排
    // 空白空間，SVG圖看起來很短，但緊接著的「查看完整供應鏈清單」按鈕前面卻硬是空了一大段，
    // 就是這裡沒用到的保留空間造成的。改成哪一排沒有卡片，就完全不保留那一排的版面。
    const hasUp = useNodesFull.length > 0;
    const hasDown = matNodes.length > 0;
    let cursorY = PAD;
    let useTop, useBottom, bendY1;
    if (hasUp) {
      useTop = cursorY; useBottom = useTop + CARD_H;
      bendY1 = useBottom + 28;
      cursorY = bendY1 + 28;
    }
    const centerTop = cursorY, centerBottom = centerTop + CENTER_H;
    cursorY = centerBottom;
    let bendY2, matTop, matBottom;
    if (hasDown) {
      bendY2 = cursorY + 28;
      matTop = bendY2 + 28; matBottom = matTop + CARD_H;
      cursorY = matBottom;
    }
    const H = cursorY + PAD;

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
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" class="market-supply-svg"><defs>' + svgDefs + '</defs>' +
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

  /* ── 機會雷達（讀預先計算資料）──
   * 「價格基準」是主選項，決定材料成本跟成品價錢用哪一個數字代表一個道具：
   *   ・掛單最低價（預設）：買方實際買得到的價格，不限單一世界；成品價錢預設看「所有世界」。
   *   ・成交均價：實際成交的行情（每個道具取自己的長窗口均價：高頻＝48小時、低頻＝7天）。
   * 材料永遠看整個資料中心（買方可以跨世界買）、優先用 NQ（配方吃 NQ 材料就夠）；成品可以切「所有世界／我的世界」，
   * 也可以切視角（全部／NQ／HQ）。掛單資料是預先計算的快照（最多約一小時前，加上玩家上傳的延遲），只當價格參考。
   * 資料太少（材料或成品沒有這個基準的價格）的配方不列入，並顯示被略過的數量。
   * 算一次是純計算、不用發任何查價請求，所以切換職業或篩選是瞬間的。
   * 預先計算資料讀不到時，處理方式跟熱度排行一樣：從來沒有過資料才自動退回舊的即時掃描，
   * 超過24小時或讀不到就提示並讓使用者自己決定。 */
  let radarRefreshHook = null;
  const RADAR_SORTS = [['profit', '淨利／次'], ['roi', '投報率'], ['vel', '成品賣速']];

  /* 一個道具在某個視角下，依「價格基準」取出代表它的單價 */
  function radarUnitPrice(row, persp, basis) {
    if (!row) return null;
    if (basis === 'listing') {
      const Q = row[7];
      const p = persp === 'all' ? row[2] : (Q ? (persp === 'nq' ? Q[0] : Q[1]) : null);
      return p || null;
    }
    const P = row[HOT_PERSP_IDX[persp]];
    return P ? P[4] : null;
  }
  function computeRadarList(jobId, ui, dcData, sellData) {
    const persp = ui.persp, basis = ui.basis, pIdx = HOT_PERSP_IDX[persp];
    const rows = [];
    let skippedMat = 0, skippedSell = 0;
    const jobRecipeIds = Object.keys(CRAFT_RECIPES).filter(function (rid) { return CRAFT_RECIPES[rid].jobId === jobId && isTwRecipe(CRAFT_RECIPES[rid]); });
    const seenItem = {};
    jobRecipeIds.forEach(function (rid) {
      const recipe = CRAFT_RECIPES[rid];
      if (seenItem[recipe.itemId]) return; // 同一個成品有多個配方時只算第一個
      seenItem[recipe.itemId] = true;
      const sellRow = sellData.items[recipe.itemId];
      const unit = radarUnitPrice(sellRow, persp, basis);
      if (!unit) { skippedSell++; return; }
      let cost = 0, ok = true;
      (recipe.ingredients || []).forEach(function (ing) {
        const mr = dcData.items[ing.itemId];
        const mp = mr ? (radarUnitPrice(mr, 'nq', basis) || radarUnitPrice(mr, 'all', basis)) : null; // NQ 優先，沒有才用全部
        if (!mp) { ok = false; return; }
        cost += mp * ing.amount;
      });
      if (!ok) { skippedMat++; return; }
      const yields = recipe.yields || 1;
      const sell = unit * yields;
      const profit = sell - cost;
      const P = sellRow[pIdx];
      rows.push({
        itemId: recipe.itemId, cost: cost, sell: sell, unit: unit, yields: yields, profit: profit,
        roi: cost > 0 ? (profit / cost) * 100 : 0, vel: hotVelocity(sellRow, persp), P: P,
        otherPrice: basis === 'listing' ? (P ? P[4] : null) : radarUnitPrice(sellRow, persp, 'listing'),
        change: P ? ((P[2] - P[4]) / P[4]) * 100 : null, band: hotBandIndex(unit),
      });
    });
    const byBand = {};
    rows.forEach(function (r) { (byBand[r.band] = byBand[r.band] || []).push(r.vel); });
    const medians = {};
    Object.keys(byBand).forEach(function (b) { medians[b] = hotMedian(byBand[b]); });
    const list = rows.filter(function (r) {
      if (ui.band !== 'all') { const bi = HOT_BANDS.findIndex(function (b) { return b.key === ui.band; }); if (r.band !== bi) return false; }
      if (ui.medianOnly && r.vel < (medians[r.band] || 0)) return false;
      return true;
    });
    list.sort(function (a, b) { return b[ui.sort] - a[ui.sort]; });
    return { list: list, total: rows.length, skippedMat: skippedMat, skippedSell: skippedSell };
  }

  function renderRadarShell() {
    const box = $('mk-pane-radar');
    const ui = { job: null, basis: 'listing', sellScope: 'dc', persp: 'all', band: 'all', sort: 'profit', medianOnly: false, shown: 50, mode: 'pre' };
    let pc = null; // { dc, sell, meta, ageMs }
    function row(label, key, options) {
      return '<div class="market-hot-row-filter"><span class="market-hot-filter-label">' + label + '</span>' +
        options.map(function (o) { return '<button type="button" class="craft-job-filter-btn" data-rk="' + key + '" data-rv="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>';
    }
    box.innerHTML =
      '<div class="market-radar-jobtabs market-pane-fixed" id="mk-radar-jobtabs">' +
        JOB_LIST.map(function (j) { return '<button type="button" class="craft-job-filter-btn" data-mk-radar-job="' + j.id + '">' + j.name + '</button>'; }).join('') +
      '</div>' +
      '<div class="market-hot-controls market-pane-fixed" id="mk-radar-filters" style="display:none">' +
        row('價格基準', 'basis', [['listing', '掛單最低價'], ['avg', '成交均價']]) +
        row('成品範圍', 'sellScope', [['dc', '所有世界'], ['world', '我的世界']]) +
        row('成品視角', 'persp', HOT_UI_BTNS.persp) +
        row('價格帶', 'band', HOT_UI_BTNS.band) +
        row('排序', 'sort', RADAR_SORTS) +
        '<label class="market-hot-median"><input type="checkbox" id="mk-radar-median"> 只看成品賣速在「同價格帶」中位數以上的配方</label>' +
        '<p class="craft-muted market-hot-status" id="mk-radar-status" style="display:none"></p>' +
      '</div>' +
      '<div id="mk-radar-body" class="market-pane-scrollbody"><p class="craft-muted">選一個職業，找出材料成本低、成品行情高的配方。</p></div>';

    function setStatus(html) { const el = $('mk-radar-status'); el.innerHTML = html || ''; el.style.display = html ? '' : 'none'; }
    function sync() {
      box.querySelectorAll('[data-mk-radar-job]').forEach(function (b) { b.classList.toggle('active', ui.job !== null && parseInt(b.dataset.mkRadarJob, 10) === ui.job); });
      box.querySelectorAll('[data-rk]').forEach(function (b) { b.classList.toggle('active', String(ui[b.dataset.rk]) === b.dataset.rv); });
      $('mk-radar-filters').style.display = ui.mode === 'pre' && ui.job !== null ? '' : 'none';
    }
    function goLive(note) {
      ui.mode = 'live'; sync(); $('mk-radar-filters').style.display = 'none';
      if (ui.job === null) return;
      runRadarScan(ui.job, false);
      if (note) { const b = $('mk-radar-body'); b.insertAdjacentHTML('afterbegin', '<p class="craft-muted">' + note + '</p>'); }
    }
    function renderPre() {
      const body = $('mk-radar-body');
      const res = computeRadarList(ui.job, ui, pc.dc, pc.sell);
      const top = res.list.slice(0, ui.shown);
      if (pc.ageMs > 24 * 3600 * 1000) {
        setStatus('⚠ 預先計算的市場資料已超過 24 小時沒有更新（最後更新：' + new Date(pc.meta.generatedAtMs).toLocaleString() + '）。 <button type="button" class="market-history-btn" id="mk-radar-to-live">改用即時掃描（僅供參考）</button>');
        $('mk-radar-to-live').addEventListener('click', function () { goLive('目前改用即時掃描。'); });
      } else setStatus('');
      if (!top.length) {
        body.innerHTML = '<p class="craft-muted">目前的條件下沒有符合的配方（能估價的共 ' + res.total + ' 個；成品沒有價格 ' + res.skippedSell + ' 個、材料沒有價格 ' + res.skippedMat + ' 個）。可以放寬價格帶或換個成品視角試試。</p>';
        return;
      }
      const sellLabel = ui.sellScope === 'world' ? '你的世界' : '所有世界';
      const isListing = ui.basis === 'listing';
      body.innerHTML =
        '<p class="craft-muted" style="margin-bottom:6px">符合條件 ' + res.list.length + ' 個配方（另有成品沒有這個基準的價格 ' + res.skippedSell + ' 個、材料沒有價格 ' + res.skippedMat + ' 個無法估價）。</p>' +
        '<div class="market-table-scroll"><table class="market-price-table"><thead><tr><th>淨利／次</th><th>投報率</th><th>材料成本</th><th>成品' + (isListing ? '最低價' : '成交均價') + '／次<span class="craft-muted" style="font-weight:normal">（' + sellLabel + '）</span></th><th>賣速</th><th>物品</th></tr></thead><tbody>' +
        top.map(function (r) {
          const yieldNote = r.yields > 1 ? fmtGil(r.unit) + '金×' + r.yields : '';
          const otherNote = r.otherPrice != null ? (isListing ? '成交均價 ' : '最低掛單價 ') + fmtGil(r.otherPrice) + '金' : '';
          const trendNote = r.P ? (r.P[0] === 1 ? '24/48小時' : '3/7天') + '・' + r.P[3] + '筆・漲跌 ' + (r.change >= 0 ? '+' : '') + r.change.toFixed(1) + '%' : '成交筆數太少，沒有漲跌';
          const note = [yieldNote, otherNote, trendNote].filter(Boolean).join('　·　');
          return '<tr data-mk-radar-item="' + r.itemId + '" style="cursor:pointer"><td style="color:' + (r.profit >= 0 ? '#4ade80' : '#f87171') + '">' + (r.profit >= 0 ? '+' : '') + fmtGil(r.profit) + '金</td>' +
            '<td>' + (r.roi >= 0 ? '+' : '') + r.roi.toFixed(0) + '%</td><td>' + fmtGil(r.cost) + '金</td><td>' + fmtGil(r.sell) + '金</td><td>' + r.vel.toFixed(1) + '/天</td>' +
            '<td>' + (ITEM_NAMES_TW_ALL[r.itemId] || r.itemId) + '<div class="craft-muted" style="font-size:10px">' + note + '</div></td></tr>';
        }).join('') + '</tbody></table></div>' +
        (res.list.length > top.length ? '<button type="button" class="market-history-btn" id="mk-radar-more" style="margin-top:8px">顯示更多（還有 ' + (res.list.length - top.length) + ' 個）</button>' : '') +
        '<p class="craft-muted" style="margin-top:6px">價格基準：' + (isListing ? '「掛單最低價」是買方實際買得到的價格（預先計算的快照，最多約一小時前加上玩家上傳的延遲，僅供參考）。' : '「成交均價」是實際成交的行情，每個道具取自己的長窗口均價（高頻＝48 小時、低頻＝7 天）。') +
        '材料用整個資料中心的價格（買方可跨世界買，優先用 NQ）；成品用「' + sellLabel + '」的價格，可在上面切換。只算直接材料成本（不考慮自己製作中間材料更便宜的情況），沒有考慮製作時間和賣方稅。「淨利／次」是做一次配方（可能一次做出不只 1 件）的總損益。最後更新：' + new Date(pc.meta.generatedAtMs).toLocaleString() + '。</p>';
      body.querySelectorAll('[data-mk-radar-item]').forEach(function (tr) { tr.addEventListener('click', function () { openItemDetail(tr.dataset.mkRadarItem); }); });
      const more = $('mk-radar-more'); if (more) more.addEventListener('click', function () { ui.shown += 50; renderPre(); });
    }
    async function show() {
      if (ui.job === null) return;
      const body = $('mk-radar-body');
      const st = MarketData.getSettings();
      if (ui.sellScope === 'world' && !st.worldName) {
        ui.mode = 'pre'; sync();
        body.innerHTML = '<p class="craft-muted">「我的世界」範圍需要先設定「我的世界」，點右上角設定後再試；也可以把上面的「成品範圍」切成「所有世界」。</p>';
        return;
      }
      if (typeof CRAFT_RECIPES === 'undefined') { body.innerHTML = '<p class="craft-muted">讀取配方資料中⋯</p>'; await ensureCraftDataLoaded(); }
      if (typeof CRAFT_RECIPES === 'undefined') { body.innerHTML = '<p class="craft-muted">配方資料載入失敗，請重新整理頁面再試。</p>'; return; }
      body.innerHTML = '<p class="craft-muted">讀取市場資料中⋯</p>';
      const myJob = ui.job, myScope = ui.sellScope;
      const sellKey = myScope === 'world' ? st.worldName : 'ALL';
      const rs = await Promise.all([MarketData.loadPrecomputed('ALL'), sellKey === 'ALL' ? null : MarketData.loadPrecomputed(sellKey)]);
      if (myJob !== ui.job || myScope !== ui.sellScope) return;
      const dcR = rs[0], sellR = rs[1] || rs[0];
      if (dcR.state === 'ok' && sellR.state === 'ok') {
        pc = { dc: dcR.data, sell: sellR.data, meta: dcR.meta, ageMs: Math.max(dcR.ageMs, sellR.ageMs) };
        ui.mode = 'pre'; sync(); renderPre(); return;
      }
      if (dcR.state === 'none') { goLive('⚠ 這個網站還沒有產生過預先計算的市場資料，暫時使用舊的即時掃描。'); return; }
      ui.mode = 'pre'; sync();
      setStatus('⚠ 暫時讀不到預先計算的市場資料。 <button type="button" class="market-history-btn" id="mk-radar-retry">重試</button> <button type="button" class="market-history-btn" id="mk-radar-to-live2">改用即時掃描（僅供參考）</button>');
      $('mk-radar-filters').style.display = '';
      body.innerHTML = '<p class="craft-muted">讀取失敗。</p>';
      $('mk-radar-retry').addEventListener('click', show);
      $('mk-radar-to-live2').addEventListener('click', function () { goLive('目前改用即時掃描。'); });
    }
    box.addEventListener('click', function (e) {
      const jb = e.target.closest('[data-mk-radar-job]');
      if (jb) { ui.job = parseInt(jb.dataset.mkRadarJob, 10); ui.shown = 50; sync(); if (ui.mode === 'live') runRadarScan(ui.job); else show(); return; }
      const fb = e.target.closest('[data-rk]');
      if (fb) {
        const v = fb.dataset.rv; ui[fb.dataset.rk] = v; ui.shown = 50; sync();
        if (fb.dataset.rk === 'sellScope') show(); else if (pc && ui.mode === 'pre') renderPre();
      }
    });
    $('mk-radar-median').addEventListener('change', function () { ui.medianOnly = this.checked; ui.shown = 50; if (pc && ui.mode === 'pre') renderPre(); });
    // 設定（我的世界等）一改，畫面要重算
    radarRefreshHook = function () { if (ui.job !== null) { if (ui.mode === 'live') runRadarScan(ui.job, true); else show(); } };
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
      body.innerHTML = '<p class="craft-muted">機會雷達需要先設定「我的世界」（成本用整個資料中心估、賣價要看你自己世界的掛單），點右上角設定後再試。</p>';
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
  const HOT_CACHE_VERSION = 4; // 資料結構改版（新增樣本數／NQHQ分開算）時遞增，舊快取自動作廢
  const HOT_METRICS = [
    { key: 'velocity', label: '賣速', fmt: function (v) { return v.toFixed(1) + ' 件/天'; }, hint: '流動性：多快能賣掉，數字越高代表越搶手（NQ+HQ合計，跟物品詳情頁同一套計算方式）' },
    { key: 'turnover', label: '每日成交額', fmt: function (v) { return fmtGil(v) + ' 金/天'; }, hint: '' },
    { key: 'changePct', label: '漲跌幅度', fmt: function (v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }, hint: '短期動能：當前（24小時內）成交均價，比近1天（48小時內）成交均價貴/便宜多少（NQ／HQ一起算，成交筆數不足的不列入）' },
  ];

  /* ── 熱度排行（讀預先計算資料）──
   * 資料由 GitHub Actions 每小時算好（scripts/update-market-data.js），涵蓋陸行鳥全部可交易道具。
   * 只用「成交紀錄」計算，不看掛單：成交才是實際發生的市場流通；掛單要等玩家上傳才更新，可能早就過期，
   * 所以列上的綠色「掛單最低價」只是參考，不參與任何計算。
   * 漲跌幅度＝短窗口成交均價 vs 長窗口成交均價（長窗口包含短窗口，窗口都從「現在」算起）：
   *   高頻：24小時內 vs 48小時內；低頻：3天內 vs 7天內（高頻的成交筆數不夠才會進低頻）。
   * 篩選：視角（全部／NQ／HQ）、頻率、價格帶（用長窗口均價分，材料通常在1千以下，裝備等單價高、成交少的道具
   * 在別的價格帶，自然分流，不會互相稀釋）、看漲／看跌、「只看賣速在同價格帶中位數以上」（預設關）。
   * 資料超過24小時沒更新，或讀不到，才會提示，並由使用者決定要不要改用即時掃描（範圍較小）；
   * 唯一自動退回即時掃描的情況是「從來沒有產生過資料」（剛上線）。 */
  const HOT_BANDS = [
    { key: 'all', label: '全部', min: 0, max: Infinity },
    { key: 'b0', label: '1千以下', min: 0, max: 1e3 },
    { key: 'b1', label: '1千~1萬', min: 1e3, max: 1e4 },
    { key: 'b2', label: '1萬~10萬', min: 1e4, max: 1e5 },
    { key: 'b3', label: '10萬~100萬', min: 1e5, max: 1e6 },
    { key: 'b4', label: '100萬以上', min: 1e6, max: Infinity },
  ];
  function hotBandIndex(price) {
    if (price == null) return -1;
    for (let i = 1; i < HOT_BANDS.length; i++) if (price >= HOT_BANDS[i].min && price < HOT_BANDS[i].max) return i;
    return -1;
  }
  const HOT_PERSP_IDX = { all: 3, nq: 4, hq: 5 };
  function hotVelocity(row, persp) { return persp === 'all' ? row[0] + row[1] : (persp === 'nq' ? row[0] : row[1]); }
  function hotMedian(arr) {
    const a = arr.slice().sort(function (x, y) { return x - y; });
    const n = a.length; if (!n) return 0;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  function fmtGil(n) { return Math.round(n).toLocaleString(); }

  /* 依目前的篩選條件，從資料裡算出要顯示的清單（純計算，不碰畫面） */
  function computeHotList(data, ui) {
    const pIdx = HOT_PERSP_IDX[ui.persp];
    const tier = ui.freq === 'high' ? 1 : 2;
    const universe = [];
    let cntHigh = 0, cntLow = 0, cntNone = 0;
    Object.keys(data.items).forEach(function (id) {
      const r = data.items[id];
      const vel = hotVelocity(r, ui.persp);
      const P = r[pIdx];
      if (P) { if (P[0] === 1) cntHigh++; else cntLow++; } else if (vel > 0) cntNone++;
      let e = { id: id, vel: vel, P: P, minP: r[2], nqV: r[0], hqV: r[1] };
      if (ui.metric === 'velocity') {
        if (vel <= 0) return;
        e.price = P ? P[4] : (r[2] != null ? r[2] : null); e.value = vel;
      } else {
        if (!P || P[0] !== tier) return; // 這個道具不屬於目前選的頻率
        e.price = P[4];
        e.value = ui.metric === 'changePct' ? ((P[2] - P[4]) / P[4]) * 100 : P[5] / (P[0] === 1 ? 2 : 7);
      }
      e.band = hotBandIndex(e.price);
      universe.push(e);
    });
    // 同價格帶的賣速中位數（用「符合指標與頻率」的全部道具算，不受看漲／看跌影響）
    const byBand = {};
    universe.forEach(function (e) { (byBand[e.band] = byBand[e.band] || []).push(e.vel); });
    const medians = {};
    Object.keys(byBand).forEach(function (b) { medians[b] = hotMedian(byBand[b]); });
    let list = universe.filter(function (e) {
      if (ui.metric === 'changePct') { if (ui.dir === 'up' ? e.value <= 0 : e.value >= 0) return false; }
      if (ui.band !== 'all') { const bi = HOT_BANDS.findIndex(function (b) { return b.key === ui.band; }); if (e.band !== bi) return false; }
      if (ui.medianOnly && e.vel < (medians[e.band] || 0)) return false;
      return true;
    });
    const asc = ui.metric === 'changePct' && ui.dir === 'down';
    list.sort(function (a, b) { return asc ? a.value - b.value : b.value - a.value; });
    return { list: list, total: universe.length, cntHigh: cntHigh, cntLow: cntLow, cntNone: cntNone };
  }

  const HOT_UI_BTNS = {
    metric: [['changePct', '漲跌幅度'], ['velocity', '賣速'], ['turnover', '每日成交額']],
    persp: [['all', '全部（NQ+HQ）'], ['nq', 'NQ'], ['hq', 'HQ']],
    freq: [['high', '高頻（24小時對48小時）'], ['low', '低頻（3天對7天）']],
    dir: [['up', '看漲'], ['down', '看跌']],
    band: HOT_BANDS.map(function (b) { return [b.key, b.label]; }),
  };
  const HOT_METRIC_HINTS = {
    changePct: '短期動能：短窗口成交均價比長窗口成交均價貴／便宜多少（窗口都從現在算起，長的包含短的；NQ／HQ預設一起算）',
    velocity: '流動性：每天賣出幾件，數字越高越搶手',
    turnover: '市場規模：每天實際成交的金額（單價×數量加總），看哪些道具的錢流得最多',
  };

  async function renderHotShell() {
    const box = $('mk-pane-hot');
    box.innerHTML = '<p class="craft-muted market-pane-fixed">讀取世界清單中⋯</p><div class="market-pane-scrollbody"></div>';
    const s = MarketData.getSettings();
    let worldNames = [];
    if (s.dcName) {
      try { worldNames = await MarketData.listWorldNamesInDc(s.dcName); } catch (e) { /* 抓不到就只顯示「所有世界」 */ }
    }
    const ui = { scope: 'ALL', metric: 'changePct', persp: 'all', freq: 'high', dir: 'up', band: 'all', medianOnly: false, shown: 30, mode: 'pre' };
    let pcResult = null;
    function btnRow(label, key, rowId) {
      return '<div class="market-hot-row-filter" id="' + rowId + '"><span class="market-hot-filter-label">' + label + '</span>' +
        HOT_UI_BTNS[key].map(function (o) { return '<button type="button" class="craft-job-filter-btn" data-hk="' + key + '" data-hv="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>';
    }
    box.innerHTML =
      '<div class="market-hot-controls market-pane-fixed">' +
        '<div class="market-hot-scope">' +
          '<button type="button" class="craft-job-filter-btn active" data-mk-hot-scope="ALL">所有世界</button>' +
          worldNames.map(function (w) { return '<button type="button" class="craft-job-filter-btn" data-mk-hot-scope="' + w + '">' + w + '</button>'; }).join('') +
        '</div>' +
        '<p class="craft-muted market-hot-scope-note"><strong>提醒：</strong>玩家只能從自己所屬的世界掛賣，「所有世界」的數字僅供參考，請優先選擇自己所屬的世界。</p>' +
        btnRow('指標', 'metric', 'mk-hf-metric') +
        '<div id="mk-hot-filters">' +
          btnRow('視角', 'persp', 'mk-hf-persp') + btnRow('頻率', 'freq', 'mk-hf-freq') + btnRow('方向', 'dir', 'mk-hf-dir') + btnRow('價格帶', 'band', 'mk-hf-band') +
          '<label class="market-hot-median"><input type="checkbox" id="mk-hot-median"> 只看賣速在「同價格帶」中位數以上的道具（成交冷清的先排除）</label>' +
        '</div>' +
        '<p class="craft-muted market-hot-status" id="mk-hot-status"></p>' +
      '</div>' +
      '<div id="mk-hot-body" class="market-pane-scrollbody"><p class="craft-muted">讀取市場資料中⋯</p></div>';
    fitMarketHeights();

    function syncButtons() {
      box.querySelectorAll('[data-hk]').forEach(function (b) { b.classList.toggle('active', ui[b.dataset.hk] === b.dataset.hv); });
      box.querySelectorAll('[data-mk-hot-scope]').forEach(function (b) { b.classList.toggle('active', b.dataset.mkHotScope === ui.scope); });
      const pre = ui.mode === 'pre';
      $('mk-hot-filters').style.display = pre ? '' : 'none';
      $('mk-hf-freq').style.display = pre && ui.metric !== 'velocity' ? '' : 'none';
      $('mk-hf-dir').style.display = pre && ui.metric === 'changePct' ? '' : 'none';
      // 即時掃描只有「漲跌幅度」「賣速」兩種指標
      const turn = box.querySelector('[data-hk="metric"][data-hv="turnover"]');
      if (turn) turn.style.display = pre ? '' : 'none';
      const mb = box.querySelector('#mk-hf-metric'); if (mb) mb.title = HOT_METRIC_HINTS[ui.metric] || '';
    }
    function setStatus(html) { const el = $('mk-hot-status'); el.innerHTML = html || ''; el.style.display = html ? '' : 'none'; }

    function enterLive(noteHtml) {
      ui.mode = 'live';
      if (ui.metric === 'turnover') ui.metric = 'changePct';
      syncButtons();
      setStatus(noteHtml || '');
      const m = ui.metric;
      $('mk-hot-body').innerHTML = '<p class="craft-muted">即時掃描只會查「最近有市場活動」的一小部分道具（不是全市場），結果僅供參考。</p><button type="button" class="market-fullchain-btn" id="mk-hot-start">開始掃描</button>';
      $('mk-hot-start').addEventListener('click', function () { runHotScan(ui.scope, ui.metric); });
    }

    function renderPre() {
      const r = pcResult;
      const body = $('mk-hot-body');
      const res = computeHotList(r.data, ui);
      const metricDef = HOT_METRICS.find(function (m) { return m.key === ui.metric; });
      const top = res.list.slice(0, ui.shown);
      const generated = new Date(r.meta.generatedAtMs);
      if (r.ageMs > 24 * 3600 * 1000) {
        setStatus('⚠ 預先計算的市場資料已超過 24 小時沒有更新（最後更新：' + generated.toLocaleString() + '）。 <button type="button" class="market-history-btn" id="mk-hot-to-live">改用即時掃描（範圍較小，僅供參考）</button>');
        const b = $('mk-hot-to-live'); if (b) b.addEventListener('click', function () { enterLive('目前改用即時掃描。'); });
      } else setStatus('');
      if (!top.length) {
        body.innerHTML = '<p class="craft-muted">目前的篩選條件下沒有符合的道具（符合指標與頻率的共 ' + res.total + ' 項）。可以放寬價格帶、換個視角或頻率試試。</p>';
        return;
      }
      const maxVal = Math.max.apply(null, top.map(function (e) { return Math.abs(e.value); })) || 1;
      const tierLabel = function (P) { return P[0] === 1 ? '24/48小時' : '3/7天'; };
      body.innerHTML =
        '<p class="craft-muted" style="margin-bottom:6px">' + HOT_METRIC_HINTS[ui.metric] + '</p>' +
        '<p class="craft-muted" style="margin-bottom:8px">符合條件 ' + res.list.length.toLocaleString() + ' 項（此視角下：高頻 ' + res.cntHigh + '、低頻 ' + res.cntLow + '、成交太少無法比較 ' + res.cntNone + '）。</p>' +
        '<div class="market-hot-list">' +
          top.map(function (e, i) {
            const v = e.value;
            const barPct = Math.max(4, Math.round((Math.log(Math.abs(v) + 1) / Math.log(maxVal + 1)) * 100));
            const barColor = v >= 0 ? '#c5a059' : '#f87171';
            let sub = '';
            if (ui.metric === 'changePct') sub = '均價 ' + fmtGil(e.P[4]) + '→' + fmtGil(e.P[2]) + '（' + e.P[1] + '／' + e.P[3] + '筆・' + tierLabel(e.P) + '）　賣速 ' + e.vel.toFixed(1) + '/天';
            else if (ui.metric === 'velocity') sub = 'NQ ' + e.nqV.toFixed(1) + '　HQ ' + e.hqV.toFixed(1) + (e.P ? '　均價 ' + fmtGil(e.P[4]) : '');
            else sub = '均價 ' + fmtGil(e.P[4]) + '（' + e.P[3] + '筆・' + tierLabel(e.P) + '）　賣速 ' + e.vel.toFixed(1) + '/天';
            return '<div class="market-hot-item" data-mk-hot-item="' + e.id + '"><div class="market-hot-row">' +
              '<span class="market-hot-rank">' + (i + 1) + '</span>' + itemIconHtml(e.id, 30) +
              '<span class="market-hot-name">' + (ITEM_NAMES_TW_ALL[e.id] || ('#' + e.id)) + (e.minP != null ? '<span class="market-hot-price" title="掛單資料要等玩家上傳才更新，可能已變動；只供參考，不參與任何計算">' + fmtGil(e.minP) + '金</span>' : '') + '</span>' +
              '<div class="market-hot-bar-track"><div class="market-hot-bar" style="width:' + barPct + '%;background:' + barColor + '"></div></div>' +
              '<span class="market-hot-value">' + metricDef.fmt(v) + '</span>' +
            '</div><div class="market-hot-subline">' + sub + '</div></div>';
          }).join('') +
        '</div>' +
        (res.list.length > top.length ? '<button type="button" class="market-history-btn" id="mk-hot-more" style="margin-top:8px">顯示更多（還有 ' + (res.list.length - top.length).toLocaleString() + ' 項）</button>' : '') +
        '<p class="craft-muted" style="margin-top:8px">資料來源：Universalis 成交紀錄，由 GitHub Actions 每小時預先計算，涵蓋陸行鳥全部可交易道具（有成交才會列入）。' +
        '漲跌＝短窗口成交均價對長窗口成交均價（長窗口包含短窗口，都從「現在」算起）；高頻＝24小時對48小時，低頻＝3天對7天（高頻成交筆數不夠才進低頻）；短窗口至少3筆、長窗口至少5筆成交才會列入。' +
        '價格帶依長窗口均價分。綠色數字是掛單最低價，掛單資料可能已變動，只供參考。最後更新：' + generated.toLocaleString() + '。</p>';
      body.querySelectorAll('[data-mk-hot-item]').forEach(function (el) { el.addEventListener('click', function () { openItemDetail(el.dataset.mkHotItem); }); });
      const more = $('mk-hot-more'); if (more) more.addEventListener('click', function () { ui.shown += 30; renderPre(); });
    }

    async function load() {
      const myScope = ui.scope;
      $('mk-hot-body').innerHTML = '<p class="craft-muted">讀取市場資料中⋯</p>';
      const r = await MarketData.loadPrecomputed(myScope);
      if (myScope !== ui.scope) return; // 讀的期間使用者又換了範圍
      if (r.state === 'ok') { pcResult = r; ui.mode = 'pre'; syncButtons(); renderPre(); return; }
      if (r.state === 'none') { enterLive('⚠ 這個網站還沒有產生過預先計算的市場資料，暫時使用即時掃描（範圍較小）。'); return; }
      // 讀不到：不自動退回，由使用者決定（即時掃描只涵蓋一小部分道具，失去全市場對比的意義）
      setStatus('⚠ 暫時讀不到預先計算的市場資料。 <button type="button" class="market-history-btn" id="mk-hot-retry-pc">重試</button> <button type="button" class="market-history-btn" id="mk-hot-to-live2">改用即時掃描（範圍較小，僅供參考）</button>');
      $('mk-hot-body').innerHTML = '<p class="craft-muted">讀取失敗。</p>';
      $('mk-hot-retry-pc').addEventListener('click', load);
      $('mk-hot-to-live2').addEventListener('click', function () { enterLive('目前改用即時掃描。'); });
    }

    if (box._hotHandler) box.removeEventListener('click', box._hotHandler); // 重新進入分頁時不要疊加舊的事件處理
    box._hotHandler = function (e) {
      const sb = e.target.closest('[data-mk-hot-scope]');
      if (sb) { ui.scope = sb.dataset.mkHotScope; ui.shown = 30; syncButtons(); if (ui.mode === 'live') { runHotScan(ui.scope, ui.metric); } else load(); return; }
      const fb = e.target.closest('[data-hk]');
      if (fb) {
        ui[fb.dataset.hk] = fb.dataset.hv; ui.shown = 30; syncButtons();
        if (ui.mode === 'pre') { if (pcResult) renderPre(); }
        else if (fb.dataset.hk === 'metric') renderHotFromCacheOrRescan(ui.scope, ui.metric);
      }
    };
    box.addEventListener('click', box._hotHandler);
    $('mk-hot-median').addEventListener('change', function () { ui.medianOnly = this.checked; ui.shown = 30; if (pcResult && ui.mode === 'pre') renderPre(); });
    syncButtons();
    load();
  }

  function loadHotCache(scope) {
    try {
      const all = JSON.parse(localStorage.getItem(HOT_CACHE_KEY) || '{}');
      const s = MarketData.getSettings();
      const key = scope + ':' + s.dcName;
      const hit = all[key];
      // 版本號不符（舊版存的資料沒有樣本數等欄位、而且可能是失敗的空結果）一律當作沒有快取
      if (hit && hit.v === HOT_CACHE_VERSION && Date.now() - hit.time < HOT_TTL_MS) return hit.rows;
    } catch (e) { /* 快取壞掉就當沒有 */ }
    return null;
  }
  function saveHotCache(scope, rows) {
    const s = MarketData.getSettings();
    const key = scope + ':' + s.dcName;
    const payload = {};
    payload[key] = { v: HOT_CACHE_VERSION, time: Date.now(), rows: rows };
    // 只保留當前這個範圍的結果（切換世界時舊的就丟掉），資料量小；萬一還是寫不下，先清空再寫一次。
    try {
      localStorage.setItem(HOT_CACHE_KEY, JSON.stringify(payload));
    } catch (e) {
      try {
        localStorage.removeItem(HOT_CACHE_KEY);
        localStorage.setItem(HOT_CACHE_KEY, JSON.stringify(payload));
      } catch (e2) { /* 真的存不下就算了，下次重查 */ }
    }
  }
  // 這次瀏覽期間掃過的結果（含有失敗批次、沒寫進localStorage的）：只用在「同一個範圍切換指標」，
  // 賣速／漲跌用的是同一份資料，切換指標不需要整個重掃一次。
  const hotMem = {};
  function renderHotFromCacheOrRescan(scope, metric) {
    const cached = loadHotCache(scope);
    if (cached) { renderHotRows(cached, metric, true, scope); return; }
    const mem = hotMem[scope];
    if (mem) { renderHotRows(mem.rows, metric, false, scope, { degraded: mem.degraded }); return; }
    runHotScan(scope, metric);
  }

  /* 每次掃描都有自己的編號：使用者掃描到一半又切了範圍／重新整理時，舊的那次就算晚回來，
   * 也不會再把畫面蓋回舊結果。 */
  let hotScanSeq = 0;
  const HOT_POOL_SIZE = 60; // 進入第二階段（查漲跌、價格）的物品數：賣速前60名

  /* ── 掃描流程（三階段，越貴的查詢對象越少）──
   *  階段一：抓「最近有市場活動」的候選（約200項）→ 去重。
   *  階段二：只查「賣速」（聚合端點，一次90項，很便宜）→ 排出賣速前 HOT_POOL_SIZE 名，
   *          賣速指標的結果這時就能先顯示出來，不用等後面。
   *  階段三：只對這批前幾名查「近48小時成交」（算漲跌）跟「最低掛單價」。
   *          賣速太低的物品成交筆數本來就湊不出可信的漲跌，所以不會浪費查詢在它們身上。
   *  任何一批查詢在重試後仍失敗，會在結果上方提示「資料可能不完整」，而且這次結果不寫入快取，
   *  避免把殘缺的資料存起來害你一小時內一直看到同樣的殘缺結果。 */
  async function runHotScan(scope, metric) {
    const body = $('mk-hot-body');
    const s = MarketData.getSettings();
    if (!s.dcName) {
      body.innerHTML = '<p class="craft-muted">熱度排行需要先設定資料中心，點右上角設定後再試。</p>';
      return;
    }
    const cached = loadHotCache(scope);
    if (cached) { renderHotRows(cached, metric, true, scope); return; }

    const seq = ++hotScanSeq;
    const stale = function () { return seq !== hotScanSeq; };
    const stats = { failedChunks: 0 };
    body.innerHTML = '<p class="craft-muted">掃描中，先抓最近有市場活動的道具⋯</p>';
    try {
      const scopeType = scope === 'ALL' ? 'dc' : 'world';
      const scopeName = scope === 'ALL' ? s.dcName : scope;
      const rawCandidateIds = await MarketData.fetchMostRecentlyUpdated(scopeType, scopeName, 200);
      if (stale()) return;
      // 這支端點是「最近更新的事件」清單，同一個熱門物品會出現好幾次，要濾掉重複、保留第一次出現的順序
      const seen = {};
      const candidateIds = rawCandidateIds.filter(function (id) {
        if (seen[id]) return false;
        seen[id] = true;
        return true;
      });
      if (!candidateIds.length) { body.innerHTML = '<p class="craft-muted">目前查不到最近有活動的道具，稍後再試試看。</p>'; return; }
      const numericIds = candidateIds.map(Number);

      body.innerHTML = '<p class="craft-muted">掃描中，正在查 ' + numericIds.length + ' 項道具的賣速⋯</p>';
      const velResult = await MarketData.fetchSaleVelocityBatch(numericIds, scopeName, stats);
      if (stale()) return;

      let rows = candidateIds.map(function (id) {
        const vel = velResult[id] || {};
        return {
          itemId: id, name: ITEM_NAMES_TW_ALL[id] || ('#' + id), minPrice: null,
          stats: {
            velocity: vel.totalVelocityPerDay || 0,
            nqVelocity: vel.nqVelocityPerDay, hqVelocity: vel.hqVelocityPerDay,
            changePct: null, changeInfo: null,
          },
        };
      });
      rows = rows.filter(function (r) { return r.stats.velocity > 0; })
                 .sort(function (a, b) { return b.stats.velocity - a.stats.velocity; })
                 .slice(0, HOT_POOL_SIZE);
      if (!rows.length) {
        body.innerHTML = '<p class="craft-muted">' + (stats.failedChunks
          ? '賣速資料查詢失敗（Universalis 可能暫時限流），請稍後按「重新整理」再試一次。'
          : '目前查不到有成交流動的道具，稍後再試試看。') + '</p>';
        return;
      }

      // 賣速指標：第一階段就能先給結果，價格跟漲跌之後再補上
      if (metric === 'velocity') {
        renderHotRows(rows, metric, false, scope, { pending: '正在補查最低價與漲跌⋯' });
      } else {
        body.innerHTML = '<p class="craft-muted">已排出賣速前 ' + rows.length + ' 名，正在查近48小時成交來算漲跌⋯</p>';
      }

      const topIds = rows.map(function (r) { return Number(r.itemId); });
      const out = await Promise.all([
        MarketData.fetchHistoryBatch(topIds, scopeName, stats).catch(function () { stats.failedChunks++; return {}; }),
        MarketData.fetchListingsBatchForScope(topIds, scopeName, stats).catch(function () { stats.failedChunks++; return {}; }),
      ]);
      if (stale()) return;
      const histResult = out[0], listingsResult = out[1];
      rows.forEach(function (r) {
        const hist = histResult[r.itemId];
        if (hist) { r.stats.changePct = hist.changePct; r.stats.changeInfo = hist; }
        const listings = listingsResult[r.itemId] || [];
        if (listings.length) r.minPrice = listings[0].pricePerUnit;
      });
      // 批次查完還是沒價格的，逐一單獨再查（第二階段量小，成本很低）
      const missing = rows.filter(function (r) { return r.minPrice == null; });
      if (missing.length && missing.length <= 20) {
        await Promise.all(missing.map(async function (r) {
          try {
            const single = await MarketData.fetchListingsBatchForScope([Number(r.itemId)], scopeName);
            const listings = single[r.itemId] || [];
            if (listings.length) r.minPrice = listings[0].pricePerUnit;
          } catch (e) { /* 補查也失敗就真的沒有，讓它留空白 */ }
        }));
        if (stale()) return;
      }
      const degraded = stats.failedChunks > 0;
      if (!degraded) saveHotCache(scope, rows); // 有任何一批失敗就不快取，下次進來會重查
      hotMem[scope] = { rows: rows, degraded: degraded };
      renderHotRows(rows, metric, false, scope, { degraded: degraded });
    } catch (e) {
      if (stale()) return;
      body.innerHTML = '<p class="craft-muted">掃描失敗，請稍後再試一次。 <button type="button" class="market-history-btn" id="mk-hot-retry">重試</button></p>';
      const rb = $('mk-hot-retry');
      if (rb) rb.addEventListener('click', function () { runHotScan(scope, metric); });
    }
  }

  function renderHotRows(rows, metricKey, fromCache, scope, opts) {
    opts = opts || {};
    const body = $('mk-hot-body');
    const metricDef = HOT_METRICS.find(function (m) { return m.key === metricKey; });
    const withValue = rows.filter(function (r) { return r.stats[metricKey] != null; });
    withValue.sort(function (a, b) { return b.stats[metricKey] - a.stats[metricKey]; });
    const top = withValue.slice(0, 30);
    const rescan = function () { localStorage.removeItem(HOT_CACHE_KEY); delete hotMem[scope]; runHotScan(scope, metricKey); };
    if (!top.length) {
      const insufficient = rows.filter(function (r) { return r.stats.changeInfo && r.stats.changeInfo.insufficient; }).length;
      const why = opts.degraded
        ? '部分資料查詢失敗（Universalis 可能暫時限流），所以算不出漲跌。'
        : (insufficient ? '這 ' + rows.length + ' 項熱門道具裡，近48小時成交筆數都不足以判斷漲跌（需要「當前」窗口至少3筆、「近1天」窗口至少5筆）。'
                        : '目前這個指標查不到足夠的資料。');
      body.innerHTML = '<p class="craft-muted">' + why + ' 可以換個指標或範圍試試。 <button type="button" class="market-history-btn" id="mk-hot-refresh-empty">重新整理</button></p>';
      const rb = $('mk-hot-refresh-empty');
      if (rb) rb.addEventListener('click', rescan);
      return;
    }
    const maxVal = Math.max.apply(null, top.map(function (r) { return Math.abs(r.stats[metricKey]); })) || 1;

    // 漲跌指標：顯示漲／跌／平的數量，跟有多少項因為樣本不足沒列入，方便你判斷這份結果可不可信
    let summaryLine = '';
    if (metricKey === 'changePct') {
      const up = withValue.filter(function (r) { return r.stats.changePct > 0.05; }).length;
      const down = withValue.filter(function (r) { return r.stats.changePct < -0.05; }).length;
      const flat = withValue.length - up - down;
      const skipped = rows.length - withValue.length;
      summaryLine = '<p class="craft-muted" style="margin-bottom:8px">共 ' + withValue.length + ' 項可判斷：<span style="color:#c5a059">漲 ' + up + '</span>／<span style="color:#f87171">跌 ' + down + '</span>／平 ' + flat +
        (skipped > 0 ? '（另有 ' + skipped + ' 項成交筆數不足，未列入）' : '') + '</p>';
    }
    const notes = [];
    if (opts.pending) notes.push(opts.pending);
    if (opts.degraded) notes.push('⚠ 有部分查詢失敗，結果可能不完整（這次不會存入快取）。 <button type="button" class="market-history-btn" id="mk-hot-refresh-degraded">重新整理</button>');

    const scopeLabel = scope === 'ALL' ? '整個資料中心' : '「' + scope + '」世界';
    body.innerHTML =
      (fromCache ? '<p class="craft-muted">顯示快取結果（1小時內） <button type="button" class="market-history-btn" id="mk-hot-refresh">重新整理</button></p>' : '') +
      (notes.length ? '<p class="craft-muted">' + notes.join('<br>') + '</p>' : '') +
      '<p class="craft-muted" style="margin-bottom:8px">' + metricDef.hint + '</p>' +
      summaryLine +
      '<div class="market-hot-list">' +
        top.map(function (r, i) {
          const v = r.stats[metricKey];
          // 數值跨好幾個數量級時用對數比例，才分得出差異
          const barPct = Math.max(4, Math.round((Math.log(Math.abs(v) + 1) / Math.log(maxVal + 1)) * 100));
          const barColor = v >= 0 ? '#c5a059' : '#f87171';
          let subLine = '';
          if (metricKey === 'velocity' && (r.stats.nqVelocity != null || r.stats.hqVelocity != null)) {
            subLine = '<span class="market-hot-sub">NQ ' + (r.stats.nqVelocity || 0).toFixed(1) + '　HQ ' + (r.stats.hqVelocity || 0).toFixed(1) + '</span>';
          } else if (metricKey === 'changePct' && r.stats.changeInfo && r.stats.changeInfo.shortAvg != null) {
            const ci = r.stats.changeInfo;
            subLine = '<span class="market-hot-sub">' + Math.round(ci.longAvg).toLocaleString() + '→' + Math.round(ci.shortAvg).toLocaleString() +
              '（' + ci.nShort + '／' + ci.nLong + '筆' + (ci.approx ? '，約' + ci.windowHours + 'h' : '') + '）</span>';
          }
          return '<div class="market-hot-row" data-mk-hot-item="' + r.itemId + '">' +
            '<span class="market-hot-rank">' + (i + 1) + '</span>' +
            itemIconHtml(r.itemId, 30) +
            '<span class="market-hot-name">' + r.name + (r.minPrice != null ? '<span class="market-hot-price">' + r.minPrice.toLocaleString() + '金</span>' : '') + '</span>' +
            '<div class="market-hot-bar-track"><div class="market-hot-bar" style="width:' + barPct + '%;background:' + barColor + '"></div></div>' +
            '<span class="market-hot-value">' + metricDef.fmt(v) + subLine + '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<p class="craft-muted" style="margin-top:8px">候選道具來自 Universalis「最近有市場活動」清單（' + scopeLabel + '，約200項），再取其中賣速最高的 ' + HOT_POOL_SIZE + ' 項查漲跌與價格；不限定生產分類，打寶／兌換／採集道具都涵蓋在內。全遊戲道具數以千計，沒辦法每種都查，這份是「最近真的有人在交易」的子集。' +
      (metricKey === 'changePct' ? '漲跌算法：當前（24小時內）成交均價 vs 近1天（48小時內）成交均價，NQ／HQ 不分開，所有成交紀錄一起平均；成交太密、資料只涵蓋不到48小時的道具會等比例縮短窗口（標「約Nh」）。' : '') + '</p>';
    body.querySelectorAll('[data-mk-hot-item]').forEach(function (el) {
      el.addEventListener('click', function () { openItemDetail(el.dataset.mkHotItem); });
    });
    ['mk-hot-refresh', 'mk-hot-refresh-degraded'].forEach(function (id) {
      const b = $(id);
      if (b) b.addEventListener('click', rescan);
    });
  }

})();
