/* market-panel.js — 市場頁：以物品為中心的查詢/探索頁面，跟生產頁分工不同
 * （生產頁＝效率導向操作面板，市場頁＝探索導向資訊展示），但底層資料層完全共用 MarketData／
 * CRAFT_RECIPES，但 ITEM_TO_RECIPES／ITEM_USED_IN 是生產工具內部的私有索引，市場頁拿不到，
 * 這裡另外用 buildToRecipesIndex()／buildUsedInIndex() 各自建立一份對等的索引，不重新設計邏輯，
 * 只是換一個地方各自維護——這也是先前答應過、要等市場頁穩定後再回頭考慮共用的技術債之一。
 *
 * 這一版只做骨架：搜尋框（接上全物品繁中名稱索引）＋市場設定摘要＋兩個分頁的空殼，
 * 物品詳情頁的實際內容（價格/走勢/供應鏈視覺化）跟製作商機排行榜之後再疊上去。 */
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
          '<button type="button" class="craft-tab-btn" data-mk-tab="radar">製作商機</button>' +
          '<button type="button" class="craft-tab-btn" data-mk-tab="hot">熱度排行</button>' +
          '<button type="button" class="craft-tab-btn" data-mk-tab="tokens">代幣兌換</button>' +
        '</div>' +
      '</div>' +
      '<div class="market-panes-flex">' +
        '<div id="mk-pane-item" class="market-pane active">' +
          '<p class="craft-muted">搜尋一個物品開始查詢——即時價格、跨服比價、銷售速度，如果是可製作品還會顯示完整供應鏈。</p>' +
        '</div>' +
        '<div id="mk-pane-radar" class="market-pane"></div>' +
        '<div id="mk-pane-hot" class="market-pane"></div>' +
        '<div id="mk-pane-tokens" class="market-pane"></div>' +
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
      '<div class="craft-settings-field" id="mk-set-city-field" style="display:none"><label>賣出城市<span class="craft-muted">（決定賣方稅率）</span></label><select id="mk-set-city" class="craft-select craft-select-block"></select></div>' +
      '<div class="craft-settings-field"><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="mk-set-exclude-outlier"' + (MarketData.getSettings().excludeOutlierTrades ? ' checked' : '') + '><span>排除異常成交<span class="craft-muted">（跟其他成交比，單筆差距同時超過100萬金和100倍就不算進均價）</span></span></label></div>';
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
    $('mk-set-exclude-outlier').addEventListener('change', function () {
      MarketData.setExcludeOutlierTrades(this.checked); // 這個開關只影響「即時查詢」的均價；熱度排行的均價本來就固定排除異常成交，不受這個開關控制
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

  // 設定一改（世界/城市/DC），正在看的物品詳情跟正在顯示的製作商機都要立刻反映新假設，
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
        $('mk-pane-tokens').classList.toggle('active', tab === 'tokens');
        if (tab === 'hot' && !$('mk-pane-hot').dataset.rendered) {
          $('mk-pane-hot').dataset.rendered = '1';
          renderHotShell();
        }
        if (tab === 'tokens' && !$('mk-pane-tokens').dataset.rendered) {
          $('mk-pane-tokens').dataset.rendered = '1';
          renderTokensShell();
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
        '<button type="button" class="market-solve-btn" id="mk-obtain-btn"><i class="ph ph-swap"></i> 兌換／商店購買<span class="craft-muted" id="mk-obtain-count"></span></button>' +
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
    bindObtainButton(itemId);
  }

  /* 「兌換／商店購買」——名字刻意不叫「取得方式」，這個功能目前只涵蓋兌換跟NPC商店購買，
   * 採集/任務/副本掉落等其他管道還沒做，取個範圍以內的名字，不要讓玩家誤以為涵蓋全部。
   * 跟「查詢是否可製作」放同一排按鈕，點了才彈窗、才載入資料，不是常駐區塊。 */
  async function bindObtainButton(itemId) {
    const btn = $('mk-obtain-btn');
    if (!btn) return;
    btn.addEventListener('click', async function () { openObtainModal(itemId); });
    // 先安靜查一次數量，讓按鈕上直接看到「（N種）」，玩家不用點開才知道有沒有東西可看；
    // 完全沒有的話按鈕還在，只是不特別強調，跟「查詢是否可製作」目前查不到的視覺份量一致。
    const ok = await ensureShopsDataLoaded();
    if (ok) {
      buildTradeIndices();
      const n = (tradesByResultCache[itemId] || []).length;
      const countEl = $('mk-obtain-count');
      if (countEl) countEl.textContent = n ? '（' + n + '）' : '';
    }
  }
  function ensureObtainModalDom() {
    let modal = $('mk-obtain-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'mk-obtain-modal';
    modal.className = 'market-modal-backdrop';
    modal.style.display = 'none';
    modal.innerHTML = '<div class="market-modal-box">' +
      '<div class="market-modal-head"><h4 id="mk-obtain-title"></h4><button type="button" class="market-modal-close" data-mk-close-obtain="1"><i class="ph ph-x"></i></button></div>' +
      '<div class="market-modal-body" id="mk-obtain-modal-body"></div>' +
    '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('[data-mk-close-obtain]')) { modal.style.display = 'none'; }
    });
    return modal;
  }
  async function openObtainModal(itemId) {
    const modal = ensureObtainModalDom();
    $('mk-obtain-title').textContent = (ITEM_NAMES_TW_ALL[itemId] || itemId) + '——兌換／商店購買';
    const body = $('mk-obtain-modal-body');
    body.innerHTML = '<p class="craft-muted">讀取資料中⋯</p>';
    modal.style.display = 'flex';
    const ok = await ensureShopsDataLoaded();
    if (!ok) { body.innerHTML = '<p class="craft-muted">資料載入失敗，稍後再試。</p>'; return; }
    renderObtainSection(itemId, modal, body);
  }

  function renderObtainSection(itemId, outerBox, body) {
    const settings = getSupplySettings();
    getPrecomputedAllData().then(function (dcData) {
      const rows = dcData ? buildObtainRows(itemId, dcData, settings.materialsBasis) : buildObtainRows(itemId, { items: {} }, settings.materialsBasis);
      const marketPrice = dcData ? tradeItemPrice(itemId, dcData, settings.materialsBasis) : null;
      let html = '';
      if (!rows.length) {
        html += '<p class="craft-muted">沒有找到兌換／商店取得方式（可能是採集、任務獎勵、副本掉落等其他管道）。</p>';
      } else {
        rows.forEach(function (t) {
          const curHtml = t.currencies.map(function (c) {
            return '<button type="button" class="market-obtain-cur" data-mk-goto-item="' + c[0] + '">' +
              itemIconHtml(c[0], 20) + '<span class="market-obtain-cur-name">' + (ITEM_NAMES_TW_ALL[c[0]] || ('#' + c[0])) + ' ×' + c[1] + '</span></button>';
          }).join('<span class="market-obtain-plus">＋</span>');
          let verdictHtml;
          if (t.cost == null) {
            verdictHtml = '<span class="market-stat-badge market-stat-badge-muted">限定道具，無法估算金幣成本</span>';
          } else if (marketPrice != null) {
            const save = marketPrice - t.cost;
            verdictHtml = save > 0.5
              ? '<span class="market-stat-badge market-stat-badge-strong">兌換划算，省 ' + Math.round(save).toLocaleString() + ' 金</span>'
              : '<span class="market-stat-badge">兌換成本約 ' + Math.round(t.cost).toLocaleString() + ' 金，市場直購較划算</span>';
          } else {
            verdictHtml = '<span class="market-stat-badge">兌換成本約 ' + Math.round(t.cost).toLocaleString() + ' 金（此物品無市場行情可比較）</span>';
          }
          html += '<div class="market-obtain-row">' +
            '<span class="market-obtain-type">' + (SHOP_TYPE_LABEL[t.type] || t.type) + '</span>' +
            '<span class="market-obtain-currencies">' + curHtml + '</span>' +
            verdictHtml +
          '</div>';
        });
      }
      // 「這個代幣該換什麼最划算」的排行，搬到獨立的「代幣兌換」分頁專門處理——
      // 那類代幣玩家通常是手上先有一批想知道怎麼花，不是先點進某個物品才想到，獨立查詢更符合實際用法。
      body.innerHTML = html || '<p class="craft-muted">沒有可顯示的取得方式資料。</p>';
      // 讓清單裡的道具圖示／名稱可以點過去查那個道具自己的市場頁（例如點代幣，直接看這個代幣的取得方式）
      body.querySelectorAll('[data-mk-goto-item]').forEach(function (el) {
        el.addEventListener('click', function () { openItemDetail(el.dataset.mkGotoItem); });
      });
    });
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
      // 第6點：排除異常成交（全域設定，預設打開）——每個視窗各自排除，同一批視窗裡的離群值不會互相影響
      function inRange(fromH, toH) { return full.filter(function (h) { return h.timestamp >= now - toH * 3600 && h.timestamp < now - fromH * 3600; }); }
      function withinDays(days) { return full.filter(function (h) { return h.timestamp >= now - days * 86400; }); }
      function avgOf(list) {
        const clean = MarketData.excludeOutlierEntries(list, function (h) { return h.pricePerUnit; });
        return clean.length ? Math.round(clean.reduce(function (s, h) { return s + h.pricePerUnit; }, 0) / clean.length) : null;
      }
      const current = avgOf(inRange(0, 24));
      const oneDay = avgOf(inRange(0, 48));
      const avg3d = avgOf(withinDays(3)), avg7d = avgOf(withinDays(7)), avg30d = avgOf(withinDays(30));
      pop.innerHTML = '<p class="craft-mat-worlds-title">均價比較' + scopeLabel + '</p>' +
        '<p class="market-avgprice-row"><span>當前成交均價</span><strong>' + (current != null ? current.toLocaleString() + ' 金' : '無成交') + '</strong></p>' +
        '<p class="market-avgprice-row"><span>近1天成交均價</span><strong>' + (oneDay != null ? oneDay.toLocaleString() + ' 金' : '無成交') + '</strong></p>' +
        '<p class="market-avgprice-row"><span>近3天成交均價</span><strong>' + (avg3d != null ? avg3d.toLocaleString() + ' 金' : '無成交') + '</strong></p>' +
        '<p class="market-avgprice-row"><span>近7天成交均價</span><strong>' + (avg7d != null ? avg7d.toLocaleString() + ' 金' : '無成交') + '</strong></p>' +
        '<p class="market-avgprice-row"><span>近30天成交均價</span><strong>' + (avg30d != null ? avg30d.toLocaleString() + ' 金' : '無成交') + '</strong></p>' +
        '<p class="market-avgprice-row" id="mk-avgprice-listing"><span>目前掛單均價</span><strong>讀取中⋯</strong></p>' +
        '<p class="craft-muted" style="font-size:10px;margin-top:4px">「當前」是最近24小時內的成交；「近1天」是最近48小時內（當天＋昨天）；「近3/7/30天」是過去那整段時間所有成交的平均，都已排除異常成交（可在設定裡關閉）。「目前掛單均價」是現在架上還沒賣掉的掛單價格平均，不是成交價。</p>';
      // 第3點：把「目前掛單均價」也列進來當參考——這是現在架上還沒賣掉的掛單價格平均，跟上面的「成交均價」是不同的東西。
      // 這裡改成跟均價徽章用同一個來源（Universalis 官方算好的 currentAveragePrice），不要自己另外抓一批掛單
      // 重新算平均——之前兩邊各自算，物品掛單一多，兩個「掛單均價」數字就會兜不起來，看起來像bug。
      try {
        const st = MarketData.getSettings();
        const ov2 = await MarketData.getItemMarketOverview(itemId, scopeWorld || st.dcName);
        const row = document.getElementById('mk-avgprice-listing');
        if (row) row.querySelector('strong').textContent = (ov2 && ov2.avgPrice) ? Math.round(ov2.avgPrice).toLocaleString() + ' 金' : '目前無掛單';
      } catch (e) { const row = document.getElementById('mk-avgprice-listing'); if (row) row.querySelector('strong').textContent = '讀取失敗'; }
    } catch (e) {
      pop.innerHTML = '<p class="craft-mat-worlds-title">均價比較' + scopeLabel + '</p><p class="craft-muted" style="font-size:11px">讀取失敗，請稍後再試。</p>';
    }
  }

  /* 供應鏈圖的5窗口均價（當前/1天/3天/7天/30天）——跟物品詳情頁那個均價彈窗同一套算法
   * （一次抓30天完整成交紀錄，5個窗口都是本地端切的，不是5次API），只是這裡要給圖上
   * 好幾張卡片共用，所以包成一個可以查快取的版本，同一個物品一個畫面裡只抓一次。
   * 注意：這套窗口均價不分NQ/HQ（跟物品詳情頁那個彈窗一樣），跟「掛單最低價」會分NQ/HQ不同。 */
  let liveAvgCache = {}; // itemId -> {current,'1d','3d','7d','30d'} | null(查詢失敗)
  async function fetchLiveAvgWindows(itemId) {
    if (liveAvgCache[itemId] !== undefined) return liveAvgCache[itemId];
    try {
      const full = await MarketData.fetchFullHistory(itemId, 30);
      const now = Date.now() / 1000;
      function inRange(fromH, toH) { return full.filter(function (h) { return h.timestamp >= now - toH * 3600 && h.timestamp < now - fromH * 3600; }); }
      function withinDays(days) { return full.filter(function (h) { return h.timestamp >= now - days * 86400; }); }
      function avgOf(list) {
        const clean = MarketData.excludeOutlierEntries(list, function (h) { return h.pricePerUnit; });
        return clean.length ? clean.reduce(function (s, h) { return s + h.pricePerUnit; }, 0) / clean.length : null;
      }
      const windows = { current: avgOf(inRange(0, 24)), '1d': avgOf(inRange(0, 48)), '3d': avgOf(withinDays(3)), '7d': avgOf(withinDays(7)), '30d': avgOf(withinDays(30)) };
      liveAvgCache[itemId] = windows;
      return windows;
    } catch (e) { liveAvgCache[itemId] = null; return null; }
  }
  async function ensureLiveAvgForItems(itemIds) {
    const need = itemIds.filter(function (id) { return liveAvgCache[id] === undefined; });
    await Promise.all(need.map(fetchLiveAvgWindows));
  }
  /* 均價統一查詢入口：window='current'先試預先計算快照（快，涵蓋大部分熱門物品），
   * 其餘窗口、或快照沒資料，查剛才準備好的即時快取。 */
  // D欄位的索引對照（來自 scripts/update-market-data.js 的 buildD）：
  // [24h筆數,24h均價, 48h筆數,48h均價, 3天筆數,3天均價, 7天筆數,7天均價]——這四組窗口的均價
  // 其實已經在預先計算的快照裡算好了，不用即時抓；只有30天這組快照沒存，才需要查即時快取。
  const D_WINDOW_IDX = { current: [0, 1], '1d': [2, 3], '3d': [4, 5], '7d': [6, 7] };
  /* 掛單最低價，依品質設定決定看NQ、HQ、還是自動選便宜的——'auto'是真的比較NQ跟HQ兩個價格取較低，
   * 不是「跟隨全域」那種意思；這個函式統一給買/做比較、卡片顯示價、明細面板三個地方共用，
   * 不要各自重寫一份，不然以後改規則又要三個地方分別改、容易漏改出新bug。 */
  function listingPriceWithPersp(mr, persp) {
    if (!mr) return null;
    if (persp === 'all') return radarUnitPrice(mr, 'all', 'listing');
    if (persp === 'auto') {
      const nq = radarUnitPrice(mr, 'nq', 'listing'), hq = radarUnitPrice(mr, 'hq', 'listing');
      if (nq != null && hq != null) return Math.min(nq, hq);
      return nq != null ? nq : (hq != null ? hq : radarUnitPrice(mr, 'all', 'listing'));
    }
    return radarUnitPrice(mr, persp, 'listing') || radarUnitPrice(mr, 'all', 'listing');
  }
  function avgPriceOf(id, window, dcData) {
    const mr = dcData && dcData.items[id];
    const D = mr && mr[6];
    const idx = D_WINDOW_IDX[window];
    if (D && idx && D[idx[0]] > 0) return D[idx[1]];
    // 30天、或快照裡這組窗口剛好成交太少湊不到（n=0），才退回即時快取（沒有即時抓過就是null，不會卡住畫面）
    const live = liveAvgCache[id];
    return live ? live[window] : null;
  }

  /* 詳情頁的均價／賣速：優先用預先計算資料（每小時算好，包含完整24小時內所有成交，而且是整個範圍的，
   * 而不是「最近200筆」；讀已經下載過的檔案是瞬間的）。資料超過24小時沒更新、讀不到、或這個道具在該範圍沒有
   * 資料時回傳 null，呼叫的地方就走原本的即時查詢。這裡的「當前均價」跟預先計算的24小時窗口是同一個定義：
   * 從現在往前24小時內所有成交的平均單價（NQ／HQ一起算）。 */
  async function getPrecomputedRow(scopeKey, itemId) {
    try {
      const r = await MarketData.loadPrecomputed(scopeKey);
      if (r.state === 'ok' && r.ageMs <= 24 * 3600 * 1000) { const row = r.data.items[itemId]; return row && (row[0] + row[1]) > 0 && row[6] ? row : null; } // 沒有賣速的列（只有掛單／最近成交）沒有窗口資料，走即時查詢
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

  /* 供應鏈圖的「自製 vs 直購」比較，跟製作商機共用同一份預先計算資料（dcData），
   * 不用另外發一輪查價請求。資料超過24小時沒更新就當作沒有，呼叫端會顯示「暫無法比較」，
   * 不會拿過期資料硬算出一個看起來很篤定、實際上已經是舊行情的數字。 */
  async function getPrecomputedAllData() {
    try {
      const r = await MarketData.loadPrecomputed('ALL');
      if (r.state === 'ok' && r.ageMs <= 24 * 3600 * 1000) return r.data;
    } catch (e) { /* 讀不到就回傳null，呼叫端自行處理 */ }
    return null;
  }

  /* 供應鏈圖的買/做比較設定，記在本機、跨物品沿用同一組偏好，不用每次點開新物品都重設一次。 */
  const SUPPLY_SETTINGS_KEY = 'ff14fc-supply-settings';
  /* 原本 materialsBasis／purchaseBasis 是兩個獨立設定（算成本用一個、卡片顯示價用另一個），
   * 但直購價那條路徑確認有bug、而且條件不明，與其繼續在那條路徑上找問題，直接整個拿掉，
   * 全部統一共用 materialsBasis（已確認正常運作的那條路徑）——圖上所有價格顯示跟成本計算
   * 都是同一個基準，不會再有「這裡改了那裡沒變」的不一致，這條路徑本身的bug風險也一併消除。
   * matPersp／hqOverrides 現在支援 'nq'|'hq'|'auto'（自動＝比較NQ/HQ取較低價），
   * hqOverrides：{itemId: 'nq'|'hq'|'auto'}，個別物品想覆寫全域設定時才會有值。 */
  function getSupplySettings() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SUPPLY_SETTINGS_KEY) || 'null'); } catch (e) {}
    return Object.assign({
      materialsBasis: 'listing', materialsAvgWindow: 'current', // 選了「成交均價」才有意義：當前/1天/3天/7天
      includeCrystal: true, matPersp: 'nq', hqOverrides: {},
    }, s || {});
  }
  function saveSupplySettings(s) {
    try { localStorage.setItem(SUPPLY_SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
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
      // 第3點：清楚分開「成交均價」（真的有成交紀錄算出來的）跟「掛單均價」（沒有成交紀錄可用，退而求其次，
      // 拿現在架上還沒賣掉的掛單價格取平均頂替），不要都叫「均價」混在一起，容易讓人誤以為是同一種東西。
      else if (st.avgDisplay != null) parts.push('<button type="button" class="market-stat-badge market-stat-badge-btn" id="mk-avgprice-badge">' + (st.avgIsFallback ? '掛單均價 ' : '成交均價 ') + st.avgDisplay.toLocaleString() + '金<i class="ph ph-caret-down" style="font-size:9px;margin-left:3px"></i></button>');
      if (st.maxPrice) parts.push('<span class="market-stat-badge">最高 ' + st.maxPrice.toLocaleString() + '金</span>');
      if (st.velLoading) parts.push('<span class="market-stat-badge market-stat-badge-muted">賣速 計算中⋯</span>');
      else { const vb = velBadgeHtml(st.velocity, st.scopeWorld); if (vb) parts.push(vb); }
      return parts.join('');
    }
    const last24hRaw = (overview && overview.history) ? overview.history.filter(function (h) { return h.timestamp >= Date.now() / 1000 - 86400; }) : [];
    const last24h = MarketData.excludeOutlierEntries(last24hRaw, function (h) { return h.pricePerUnit; }); // 第6點：排除異常成交（全域設定，預設打開）
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
        // 注意：st.avg24h 是抓取腳本算好的，已經在伺服器那邊排除過異常成交，這裡不用重複處理
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
      const recent = MarketData.excludeOutlierEntries(hist.filter(function (h) { return h.timestamp >= nowSec - 86400; }), function (h) { return h.pricePerUnit; });
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
   * 每一筆成交都找得到，但不要求整張圖同時畫出每一個點：
   *  ① 顯示方式「自動」：點太密時改畫「價格區間色帶＋NQ／HQ平均線＋成交量長條」，點少到看得清楚才畫一個個獨立的點
   *     （依圖的實際寬度判斷：平均每 8 像素放不下一個點就改畫色帶，手機圖比較窄所以更早切換）。
   *     也可以手動固定成「逐筆成交」或「價格區間」。
   *  ② 逐筆畫法會把相鄰成交用細線連起來，放大到只剩幾個點也看得出走勢；滑鼠移過去（手機點一下）顯示最近那筆成交的詳細資料。
   *  ③ 拖曳選一段時間放大（手機請水平拖曳），雙擊或按「重設縮放」還原。
   *  ④ 「均價線」畫出目前圖上範圍的平均成交價（水平虛線），方便一眼看出每一筆比平均貴還是便宜。
   *  ⑤ 「隱藏極端價格」：預設把最極端的少數價格收在圖外（Y軸只涵蓋 2%~98% 的成交），主要走勢才看得清楚，
   *     被收掉的筆數會標出來，明細表裡仍然找得到。
   *  ⑥ 品質（NQ／HQ）與世界的篩選同時作用在圖跟明細表上。
   *  ⑦ X軸是真正的時間軸（成交空窗期看得出來）。 */
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
    const st = { pts: [], fpts: [], view: null, hideOut: true, showAvg: true, drawMode: 'auto', hover: null, sel: null,
      mode: 'dots', buckets: null, dotPts: null, geom: null, done: false, scopeWorld: opts.scopeWorld,
      fQuality: 'all', fWorld: 'all', sortKey: 'time', sortDir: -1, tableShown: 100, skippedOut: 0, zoomed: false };
    const cv = els.canvas, tip = els.tip;

    /* 圖例：用一般人看得懂的話說明每種顏色／形狀代表什麼，依目前實際用的畫法切換 */
    let legendMode = '';
    function updateLegend(mode) {
      if (!els.legend || legendMode === mode) return;
      legendMode = mode;
      const sw = function (style, txt) { return '<span class="mk-legend-item"><i class="mk-legend-sw" style="' + style + '"></i>' + txt + '</span>'; };
      els.legend.innerHTML = mode === 'band'
        ? sw('background:rgba(197,160,89,.55)', '金色柱：這段時間內成交價從最低到最高') +
          sw('background:#8fb3ff;height:2px;margin-top:6px', '藍線：NQ 的平均成交價') +
          sw('border-top:2px dashed #fcf6ba;height:0;margin-top:6px', '金色虛線：HQ 的平均成交價') +
          sw('background:rgba(143,179,255,.5)', '下方藍柱：這段時間賣出的件數') +
          sw('border-top:2px dashed rgba(255,255,255,.7);height:0;margin-top:6px', '白色虛線：整個範圍的平均價')
        : sw('background:#8fb3ff;border-radius:50%', 'NQ 成交') + sw('background:#fcf6ba;border-radius:2px', 'HQ 成交') +
          sw('background:rgba(197,160,89,.7);height:2px;margin-top:6px', '成交順序連線') +
          sw('border-top:2px dashed rgba(255,255,255,.7);height:0;margin-top:6px', '白色虛線：整個範圍的平均價');
    }

    function refilter() {
      st.fpts = st.pts.filter(function (p) {
        if (st.fQuality === 'nq' && p.hq) return false;
        if (st.fQuality === 'hq' && !p.hq) return false;
        if (st.fWorld !== 'all' && p.world !== st.fWorld) return false;
        return true;
      });
    }
    function visibleRange() { return st.view || { t0: 0, t1: 1 }; }
    function lowerBound(t) { let lo = 0, hi = st.fpts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (st.fpts[m].ts < t) lo = m + 1; else hi = m; } return lo; }
    function visiblePts() { const v = visibleRange(); return st.fpts.slice(lowerBound(v.t0), lowerBound(v.t1 + 1)); }

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
        g.fillText(st.done ? '這個範圍內沒有符合的成交紀錄' : '讀取中⋯', cssW / 2, cssH / 2);
        st.buckets = null; st.dotPts = null;
        return;
      }
      const span = Math.max(1, v.t1 - v.t0);
      const xOf = function (t) { return PADL + ((t - v.t0) / span) * plotW; };
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
      const bandMode = st.drawMode === 'band' || (st.drawMode === 'auto' && vis.length > plotW / 8);
      st.mode = bandMode ? 'band' : 'dots';
      updateLegend(st.mode);
      const volH = plotH * 0.2;
      const yOf = function (price) {
        const top = PADT, bottom = PADT + plotH - (bandMode ? volH + 4 : 0);
        const f = (Math.min(hi, Math.max(lo, price)) - lo) / ((hi - lo) || 1);
        return bottom - f * (bottom - top);
      };
      // 軸
      g.strokeStyle = 'rgba(197,160,89,.18)'; g.lineWidth = 1; g.fillStyle = '#999'; g.textAlign = 'right';
      niceTicks(lo, hi, 5).forEach(function (price) {
        const y = yOf(price);
        g.beginPath(); g.moveTo(PADL, y); g.lineTo(PADL + plotW, y); g.stroke();
        g.fillText(Math.round(price).toLocaleString(), PADL - 5, y + 3);
      });
      g.textAlign = 'center';
      const withDate = span > 36 * 3600;
      for (let i = 0; i <= 4; i++) {
        const t = v.t0 + span * (i / 4);
        g.fillText(fmtTrendTime(t, withDate), Math.min(cssW - 22, Math.max(PADL + 14, xOf(t))), cssH - 8);
      }
      // 均價線
      if (st.showAvg) {
        const avg = vis.reduce(function (s, p) { return s + p.price; }, 0) / vis.length;
        const ay = yOf(avg);
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.setLineDash([6, 4]);
        g.beginPath(); g.moveTo(PADL, ay); g.lineTo(PADL + plotW, ay); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(255,255,255,.85)'; g.textAlign = 'right';
        g.fillText('均價 ' + Math.round(avg).toLocaleString(), PADL + plotW - 4, ay - 4);
      }
      if (!bandMode) {
        st.buckets = null; st.dotPts = [];
        const inRange = vis.filter(function (p) { return p.price >= lo && p.price <= hi; });
        // 相鄰成交用細線連起來，放大到只剩幾個點也看得出走勢
        if (inRange.length > 1) {
          g.strokeStyle = 'rgba(197,160,89,.55)'; g.lineWidth = 1.2; g.beginPath();
          inRange.forEach(function (p, i) { const x = xOf(p.ts), y = yOf(p.price); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
          g.stroke();
        }
        const big = inRange.length <= 60; // 點很少時畫大一點比較好點、好看
        inRange.forEach(function (p) {
          const x = xOf(p.ts), y = yOf(p.price);
          st.dotPts.push({ x: x, y: y, p: p });
          if (p.hq) {
            const R1 = big ? 7 : 5.5, R2 = big ? 3.1 : 2.4;
            g.fillStyle = '#fcf6ba'; g.strokeStyle = '#3a2f1a'; g.lineWidth = 0.8; g.beginPath();
            for (let k = 0; k < 10; k++) { const ang = (Math.PI / 5) * k - Math.PI / 2; const rr = k % 2 === 0 ? R1 : R2; const px = x + rr * Math.cos(ang), py = y + rr * Math.sin(ang); if (k === 0) g.moveTo(px, py); else g.lineTo(px, py); }
            g.closePath(); g.fill(); g.stroke();
          } else {
            g.fillStyle = '#8fb3ff'; g.strokeStyle = '#1a2a3a'; g.lineWidth = 0.8; g.beginPath(); g.arc(x, y, big ? 4.2 : 3.2, 0, Math.PI * 2); g.fill(); g.stroke();
          }
        });
        if (st.hover && st.hover.p) {
          g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(st.hover.x, PADT); g.lineTo(st.hover.x, PADT + plotH); g.stroke();
          g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.beginPath(); g.arc(st.hover.x, st.hover.y, 9, 0, Math.PI * 2); g.stroke();
        }
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
        g.fillStyle = 'rgba(143,179,255,.8)'; g.textAlign = 'left'; g.fillText('賣出件數（最多 ' + maxUnits.toLocaleString() + ' 件）', PADL + 4, PADT + plotH - volH - 2);
        bk.forEach(function (b) {
          if (!b.n) return;
          const h = Math.max(1.5, (b.units / maxUnits) * volH);
          g.fillStyle = 'rgba(143,179,255,.35)'; g.fillRect(PADL + b.i * cw + 0.5, PADT + plotH - h, Math.max(1, cw - 1), h);
        });
        bk.forEach(function (b) {
          if (!b.n) return;
          const y1 = yOf(b.max), y2 = yOf(b.min);
          g.fillStyle = 'rgba(197,160,89,.30)'; g.fillRect(PADL + b.i * cw + 0.5, y1, Math.max(1, cw - 1), Math.max(2, y2 - y1));
        });
        function line(sumKey, nKey, color, dash) {
          g.strokeStyle = color; g.lineWidth = 1.6; g.setLineDash(dash || []); g.beginPath(); let started = false;
          bk.forEach(function (b) { if (!b[nKey]) return; const x = PADL + (b.i + 0.5) * cw, y = yOf(b[sumKey] / b[nKey]); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); });
          g.stroke(); g.setLineDash([]);
        }
        line('nqS', 'nqN', '#8fb3ff'); line('hqS', 'hqN', '#fcf6ba', [5, 3]);
        if (st.hover && st.hover.b) { const b = st.hover.b; g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(PADL + b.i * cw, PADT, cw, plotH); }
      }
      if (st.sel) { g.fillStyle = 'rgba(197,160,89,.22)'; g.fillRect(Math.min(st.sel.x0, st.sel.x1), PADT, Math.abs(st.sel.x1 - st.sel.x0), plotH); }
    }

    /* ── 明細表：圖上目前範圍（含縮放與品質／世界篩選）的每一筆成交 ── */
    function tableRows() {
      const v = visibleRange();
      const rows = st.fpts.slice(lowerBound(v.t0), lowerBound(v.t1 + 1));
      rows.sort(function (x, y) { const k = st.sortKey === 'price' ? 'price' : 'ts'; return (x[k] - y[k]) * st.sortDir; });
      return rows;
    }
    function renderTable() {
      const rows = tableRows();
      const shown = rows.slice(0, st.tableShown);
      const hasWorld = !st.scopeWorld && st.pts.some(function (p) { return p.world; });
      const arrow = function (k) { return st.sortKey === k ? (st.sortDir < 0 ? ' ▼' : ' ▲') : ''; };
      const v = visibleRange();
      els.table.innerHTML =
        '<div class="market-trend-tablehead"><span class="market-subheading" style="margin:0">成交明細（' + fmtTrendTime(v.t0, true) + ' ~ ' + fmtTrendTime(v.t1, true) + '，共 ' + rows.length.toLocaleString() + ' 筆）</span></div>' +
        (rows.length ? '<div class="market-trend-tablewrap"><table class="market-trend-table"><thead><tr>' +
          '<th data-sort="time" class="mk-sortable">時間' + arrow('time') + '</th>' + (hasWorld ? '<th>世界</th>' : '') + '<th>品質</th>' +
          '<th data-sort="price" class="mk-sortable">單價' + arrow('price') + '</th><th>數量</th><th>總價</th></tr></thead><tbody>' +
          shown.map(function (p) { return '<tr><td>' + fmtTrendTime(p.ts, true) + '</td>' + (hasWorld ? '<td>' + (p.world || '') + '</td>' : '') + '<td>' + (p.hq ? '<span style="color:#fcf6ba">HQ★</span>' : 'NQ') + '</td><td>' + p.price.toLocaleString() + '</td><td>' + p.qty + '</td><td>' + (p.price * p.qty).toLocaleString() + '</td></tr>'; }).join('') +
          '</tbody></table></div>' +
          (rows.length > shown.length ? '<button type="button" class="market-history-btn" data-tt="more">顯示更多（還有 ' + (rows.length - shown.length).toLocaleString() + ' 筆）</button>' : '')
          : '<p class="craft-muted">這個範圍內沒有符合的成交紀錄。</p>');
    }
    els.table.addEventListener('click', function (e) {
      const th = e.target.closest('[data-sort]');
      if (th) { const k = th.getAttribute('data-sort'); if (st.sortKey === k) st.sortDir = -st.sortDir; else { st.sortKey = k; st.sortDir = -1; } renderTable(); return; }
      if (e.target.getAttribute('data-tt') === 'more') { st.tableShown += 200; renderTable(); }
    });

    /* ── 互動：滑過（手機點一下）看最近那筆成交、拖曳放大 ── */
    function xFromEvent(e) { const r = cv.getBoundingClientRect(); return e.clientX - r.left; }
    function showTip(html, x, y) {
      tip.innerHTML = html; tip.style.display = 'block';
      const w = tip.offsetWidth; tip.style.left = Math.max(4, Math.min(cv.clientWidth - w - 4, x + 12)) + 'px'; tip.style.top = Math.max(4, y - 8) + 'px';
    }
    function hideTip() { tip.style.display = 'none'; }
    function hoverAt(x, y) {
      const gm = st.geom; if (!gm) return;
      if (st.mode === 'dots' && st.dotPts && st.dotPts.length) {
        // 依「水平距離」找最近的一筆（不要求滑鼠剛好在點上，點很少的時候才好用），同一個位置有好幾筆時再取垂直最近的
        let best = null, bd = Infinity;
        st.dotPts.forEach(function (d) { const dd = Math.abs(d.x - x) * 1000 + Math.abs(d.y - y); if (dd < bd) { bd = dd; best = d; } });
        st.hover = best; draw();
        if (best) showTip('<b>' + best.p.price.toLocaleString() + ' 金</b> ×' + best.p.qty + (best.p.hq ? '（HQ）' : '（NQ）') + '<br>' + fmtTrendTime(best.p.ts, true) + (best.p.world ? ' · ' + best.p.world : '') + '<br>總價 ' + (best.p.price * best.p.qty).toLocaleString() + ' 金', best.x, best.y); else hideTip();
      } else if (st.mode === 'band' && st.buckets) {
        const B = st.buckets.length, cw = gm.plotW / B;
        const i = Math.floor((x - gm.PADL) / cw);
        const b = st.buckets[i];
        if (b && b.n) { st.hover = { b: b }; draw(); showTip(fmtTrendTime(b.t0, true) + ' ~ ' + fmtTrendTime(b.t1, true) + '<br>' + b.n + ' 筆／' + b.units + ' 件<br>最低 ' + Math.round(b.min).toLocaleString() + '　最高 ' + Math.round(b.max).toLocaleString() + (b.nqN ? '<br>NQ均價 ' + Math.round(b.nqS / b.nqN).toLocaleString() : '') + (b.hqN ? '<br>HQ均價 ' + Math.round(b.hqS / b.hqN).toLocaleString() : ''), gm.PADL + (i + 0.5) * cw, gm.PADT + 10); }
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
        if (t1 - t0 > 60) { st.view = { t0: Math.max(v.t0, t0), t1: Math.min(v.t1, t1) }; st.zoomed = true; st.tableShown = 100; }
        st.sel = null; down = null; st.hover = null; hideTip(); draw(); renderTable(); return;
      }
      st.sel = null;
      if (down) hoverAt(x, y); // 手機：點一下＝看那一筆
      down = null;
    });
    cv.addEventListener('pointerleave', function () { if (!down) { st.hover = null; hideTip(); draw(); } });
    cv.addEventListener('dblclick', function () { api.resetView(); });

    const api = {
      state: st, draw: draw, renderTable: renderTable,
      setData: function (list, rangeStart, now, done) {
        st.pts = list.map(function (h) { return { ts: h.timestamp, price: h.pricePerUnit, qty: h.quantity || 1, hq: !!h.hq, world: h.world || null }; }).sort(function (a, b) { return a.ts - b.ts; });
        refilter();
        st.done = done;
        const first = st.pts.length ? st.pts[0].ts : rangeStart;
        st.base = { t0: done ? rangeStart : Math.min(first, now - 3600), t1: now };
        if (!st.zoomed) st.view = { t0: st.base.t0, t1: st.base.t1 };
        draw(); renderTable();
      },
      worlds: function () { return Array.from(new Set(st.pts.map(function (p) { return p.world; }).filter(Boolean))).sort(); },
      resetView: function () { st.zoomed = false; if (st.base) st.view = { t0: st.base.t0, t1: st.base.t1 }; st.tableShown = 100; draw(); renderTable(); },
      setHideOut: function (v) { st.hideOut = v; draw(); },
      setShowAvg: function (v) { st.showAvg = v; draw(); },
      setDrawMode: function (v) { st.drawMode = v; draw(); },
      setFilter: function (quality, world) { st.fQuality = quality; st.fWorld = world; refilter(); st.tableShown = 100; draw(); renderTable(); },
    };
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
        '<select id="mk-trend-q" class="craft-select market-trend-sel"><option value="all">NQ+HQ</option><option value="nq">NQ</option><option value="hq">HQ</option></select>' +
        (scopeWorld ? '' : '<select id="mk-trend-w" class="craft-select market-trend-sel"><option value="all">所有世界</option></select>') +
        '<select id="mk-trend-mode" class="craft-select market-trend-sel"><option value="auto">顯示方式：自動</option><option value="dots">顯示方式：逐筆成交</option><option value="band">顯示方式：價格區間</option></select>' +
        '<label><input type="checkbox" id="mk-trend-avg" checked> 均價線</label>' +
        '<label><input type="checkbox" id="mk-trend-out" checked> 隱藏極端價格</label>' +
        '<button type="button" class="market-history-btn" id="mk-trend-reset">重設縮放</button>' +
      '</div>' +
      '<p class="craft-muted market-trend-status" id="mk-trend-status"></p>' +
      '<div class="market-trend-legend" id="mk-trend-legend"></div>' +
      '<div class="market-trend-canvaswrap"><canvas id="mk-trend-canvas" class="market-trend-canvas"></canvas><div id="mk-trend-tip" class="market-trend-tip" style="display:none"></div></div>' +
      '<p class="craft-muted" style="font-size:11px;margin:4px 0 10px">滑鼠移到圖上（手機點一下）看那一筆的價格；拖曳選一段時間可放大（手機請水平拖曳），雙擊還原。成交太多時，圖會自動改成「每段時間一根柱」的彙總畫法，放大後就會變回逐筆的點。</p>' +
      '<div id="mk-trend-table"></div>';
    const chart = createTrendChart({ canvas: $('mk-trend-canvas'), tip: $('mk-trend-tip'), table: $('mk-trend-table'), legend: $('mk-trend-legend') }, { scopeWorld: scopeWorld });
    let activeRange = '7';
    let token = 0;
    function syncWorldOptions() {
      const sel = $('mk-trend-w'); if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="all">所有世界</option>' + chart.worlds().map(function (w) { return '<option value="' + w + '"' + (w === cur ? ' selected' : '') + '>' + w + '</option>'; }).join('');
    }
    function applyFilters() { chart.setFilter($('mk-trend-q').value, $('mk-trend-w') ? $('mk-trend-w').value : 'all'); }
    async function loadRange() {
      const myToken = ++token;
      const myRange = activeRange;
      $('mk-trend-range-row').querySelectorAll('[data-range]').forEach(function (b) { b.classList.toggle('active', b.dataset.range === myRange); });
      const rangeDef = TREND_RANGES.find(function (r) { return r.key === myRange; });
      const now = Date.now() / 1000, rangeStart = now - rangeDef.days * 86400;
      chart.state.zoomed = false; chart.state.tableShown = 100;
      chart.setData([], rangeStart, now, false);
      $('mk-trend-status').textContent = '讀取中⋯（成交熱絡的道具要翻好幾頁，先畫出已抓到的部分）';
      try {
        const full = await MarketData.fetchFullHistory(itemId, rangeDef.days, scopeWorld || undefined, function (partial, done) {
          if (myToken !== token) return; // 使用者已經切到別的天數，這個請求晚到的進度就不要畫
          chart.setData(partial, rangeStart, now, !!done);
          syncWorldOptions();
          $('mk-trend-status').textContent = (done ? '' : '讀取中⋯ ') + '已載入 ' + partial.length.toLocaleString() + ' 筆成交';
        });
        if (myToken !== token) return;
        const filtered = full.filter(function (h) { return h.timestamp >= rangeStart; });
        chart.setData(filtered, rangeStart, now, true);
        syncWorldOptions();
        const sk = chart.state.skippedOut;
        $('mk-trend-status').textContent = '共 ' + filtered.length.toLocaleString() + ' 筆成交' + (filtered.length ? '' : '（這個區間沒有成交）') + (sk ? '；圖上收起了 ' + sk + ' 筆極端價格（明細表裡仍然找得到，或取消勾選「隱藏極端價格」）' : '');
      } catch (e) {
        if (myToken !== token) return;
        $('mk-trend-status').textContent = '讀取失敗，請稍後再試一次。';
      }
    }
    $('mk-trend-range-row').querySelectorAll('[data-range]').forEach(function (b) {
      b.addEventListener('click', function () { activeRange = b.dataset.range; loadRange(); });
    });
    $('mk-trend-q').addEventListener('change', applyFilters);
    if ($('mk-trend-w')) $('mk-trend-w').addEventListener('change', applyFilters);
    $('mk-trend-mode').addEventListener('change', function () { chart.setDrawMode(this.value); });
    $('mk-trend-avg').addEventListener('change', function () { chart.setShowAvg(this.checked); });
    $('mk-trend-out').addEventListener('change', function () { chart.setHideOut(this.checked); });
    $('mk-trend-reset').addEventListener('click', function () { chart.resetView(); });
    if (window.ResizeObserver) { new ResizeObserver(function () { chart.draw(); }).observe($('mk-trend-canvas')); }
    modal.style.display = 'flex';
    loadRange();
  }

  // 第5點排查時發現的潛在問題：supply chain跟製作商機各自獨立判斷「CRAFT_RECIPES存在嗎」
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

  /* ── 取得方式（兌換／NPC商店）：跟 craft-data.js 同一套「點到才動態載入」的做法，
   * SHOP_TRADES 只有點開物品詳情頁的「取得方式」區塊才會注入，平常完全不影響首次載入速度。 ── */
  let shopsDataLoadPromise = null;
  function ensureShopsDataLoaded() {
    if (typeof SHOP_TRADES !== 'undefined') return Promise.resolve(true);
    if (shopsDataLoadPromise) return shopsDataLoadPromise;
    shopsDataLoadPromise = new Promise(function (resolve) {
      const s = document.createElement('script');
      s.src = 'js/shops-data.js';
      s.onload = function () { resolve(typeof SHOP_TRADES !== 'undefined'); };
      s.onerror = function () { resolve(false); };
      document.body.appendChild(s);
    });
    return shopsDataLoadPromise;
  }

  /* 兩個方向各建一份索引，都只在第一次用到時建立、之後重複使用：
   *  ・TRADES_BY_RESULT：查「這個物品能怎麼兌換／購買到」，key＝換到的道具id
   *  ・TRADES_BY_CURRENCY：查「這個道具當代幣／兌換品時，能換到什麼」，key＝付出的道具id
   * 一筆交易如果同時付出兩種道具（例如「代幣+金幣」換東西），會同時被兩個key收錄到。 */
  let tradesByResultCache = null, tradesByCurrencyCache = null;
  function buildTradeIndices() {
    if (tradesByResultCache) return;
    tradesByResultCache = {}; tradesByCurrencyCache = {};
    SHOP_TRADES.forEach(function (shop) {
      shop.trades.forEach(function (t) {
        t.i.forEach(function (it) {
          (tradesByResultCache[it[0]] = tradesByResultCache[it[0]] || []).push({ type: shop.type, currencies: t.c, items: t.i });
        });
        t.c.forEach(function (cu) {
          if (cu[0] === 1) return; // Gil本身不用當成「代幣」去反查用途，意義不大且數量會多到無法排序
          (tradesByCurrencyCache[cu[0]] = tradesByCurrencyCache[cu[0]] || []).push({ type: shop.type, currencies: t.c, items: t.i });
        });
      });
    });
  }
  const SHOP_TYPE_LABEL = { GilShop: 'NPC商店', SpecialShop: '兌換', GCShop: '軍票商店', AnimaWeapon5TradeItem: '武器兌換' };

  /* 代幣兌換清單改成明確白名單（不是門檻篩選）——門檻會漏掉像銅獎/金獎這種常被關注、
   * 但可兌換種類數剛好不到門檻的項目，也會混進一次性交換這種不是真正貨幣的東西，
   * 直接手動點名清楚、好維護，之後要增減代幣，改這個陣列就好。 */
  const CURATED_CURRENCY_IDS = [
    28, 25, 33913, 26533, 29, 48, 10307, 36656, 33914, 22, 20, 21, 26807, 27,
    28063, 41784, 37549, 45690, 41785, 30341, 21073, 22444, 37550, 26823, 22443,
  ];
  function buildCurrencyDirectory() {
    buildTradeIndices();
    const withCount = CURATED_CURRENCY_IDS.filter(function (id) { return !!ITEM_NAMES_TW_ALL[id]; }).map(function (id) {
      const set = {};
      (tradesByCurrencyCache[id] || []).forEach(function (t) { t.items.forEach(function (it) { set[it[0]] = 1; }); });
      return { id: id, name: ITEM_NAMES_TW_ALL[id], count: Object.keys(set).length };
    });
    withCount.sort(function (a, b) { return b.count - a.count; });
    return withCount;
  }

  /* 這個道具的「市場等值單價」——Gil本身固定是1；其餘查預先計算資料，查不到就回傳null
   * （代表這個道具沒有市場行情，可能是帳號綁定、不可交易，或近期沒有成交）。
   * 不即時另外發查價請求：代幣/兌換清單裡經常一次列出十幾二十種道具，全部即時查會瞬間打爆查價限制，
   * 用跟供應鏈圖同一份預先計算快照最穩定，缺點是價格新鮮度跟熱度排行一樣（最多約一小時前）。 */
  function tradeItemPrice(id, dcData, basis) {
    if (Number(id) === 1) return 1;
    const mr = dcData.items[id];
    if (!mr) return null;
    return radarUnitPrice(mr, 'nq', basis) || radarUnitPrice(mr, 'all', basis);
  }
  /* 一筆交易「付出」的總金幣等值（所有currencies加總），只要有一項查不到價格就整筆視為無法估算，
   * 不要用0頂替缺價的那項，那會讓成本被低估、變相顯得「兌換超划算」。 */
  function tradeSideValue(sides, dcData, basis) {
    let total = 0;
    for (let i = 0; i < sides.length; i++) {
      const p = tradeItemPrice(sides[i][0], dcData, basis);
      if (p == null) return null;
      total += p * sides[i][1];
    }
    return total;
  }

  /* 這個物品所有「換得方式」的比較清單：每種方式付出多少成本（金幣等值）、跟市場直購價比起來划不划算。 */
  function buildObtainRows(itemId, dcData, basis) {
    buildTradeIndices();
    const trades = tradesByResultCache[itemId] || [];
    return trades.map(function (t) {
      const cost = tradeSideValue(t.currencies, dcData, basis);
      const resultAmount = (t.items.find(function (x) { return x[0] === Number(itemId); }) || [0, 1])[1];
      return { type: t.type, currencies: t.currencies, cost: cost != null ? cost / resultAmount : null, resultAmount: resultAmount };
    });
  }

  /* 反過來：這個道具「當代幣花掉」的話，換哪個東西最划算——每筆用到它的交易，算出扣掉其他必要
   * 付出（如果同時還要搭配金幣或其他道具）後，淨賺的市場價值，除以要花的這個道具數量，
   * 得到「每花1個，換到的東西值多少」，由高到低排序。這才是使用者真正想知道的：
   * 手上這批代幣該拿去換什麼，而不是這個代幣本身值多少錢（它通常沒有市場價，這個問題沒有答案）。 */
  /* 每1單位代幣換到的東西，附帶「好不好賣」的流動性指標（跟熱度排行同一套公式，不是另外發明）——
   * 划算不代表賣得掉，sortKey讓玩家自己選要看「淨值優先」還是「流動性優先」。
   * vel（賣速）＝row[0]+row[1]，跟 hotVelocity(row,'all') 算法一致；
   * txnFreq（成交頻率）＝P[3]/HOT_TIER_DAYS[P[0]]，P=row[HOT_PERSP_IDX.all]，跟熱度排行同一套。 */
  function liquidityOf(resultItemId, dcData) {
    const mr = dcData.items[resultItemId];
    if (!mr) return { vel: 0, txnFreq: 0 };
    const vel = (mr[0] || 0) + (mr[1] || 0);
    const P = mr[HOT_PERSP_IDX.all];
    const txnFreq = P ? (P[3] / (HOT_TIER_DAYS[P[0]] || 30)) : 0;
    return { vel: vel, txnFreq: txnFreq };
  }
  const CHAIN_MAX_DEPTH = 3; // 最多追3層，避免無限遞迴也避免算太久
  /* 這個物品值多少錢：能直接查到市場價就直接用；查不到（通常是不可交易的中繼道具，
   * 例如神秘原石這類）但它自己又能再兌換別的東西，就往下追，一路追到有市場價的終點為止，
   * 取「這條路徑能換到的東西裡，淨值最高的那個」當作這個中繼物品的等值。
   * 回傳 {v:等值金額, end:最終有市場價的終點物品id}，或 null（算不出來，不是0——
   * 0會被誤認為「這東西真的不值錢」）。end 要一起回傳，是因為排行裡的賣速／成交頻率
   * 必須看「最後真正賣出去的那個物品」，不是中繼物品（中繼物品不可交易，賣速永遠是0，
   * 之前就是這個錯，讓鏈式結果在賣速／頻率排序下全部墊底、被擠出前20名）。
   * visited防止繞回自己形成無窮迴圈。 */
  function resolveChainedValue(itemId, amountNeeded, dcData, basis, depth, visited) {
    const dbg = typeof window !== 'undefined' && window.__CHAIN_DEBUG__;
    const direct = tradeItemPrice(itemId, dcData, basis);
    if (direct != null) return { v: direct * amountNeeded, end: Number(itemId) };
    if (depth <= 0 || visited.has(itemId)) return null;
    const trades = tradesByCurrencyCache[itemId] || [];
    if (!trades.length) return null; // 沒有任何後續兌換＝死路（例如改良型裝備），不用往下，也不印訊息避免洗版
    visited.add(itemId);
    let best = null;
    trades.forEach(function (t) {
      const myAmt = (t.currencies.find(function (x) { return x[0] === Number(itemId); }) || [0, 0])[1];
      if (!myAmt) return;
      const otherCurrencies = t.currencies.filter(function (x) { return x[0] !== Number(itemId); });
      const otherCost = tradeSideValue(otherCurrencies, dcData, basis); // 其他付出方只看直接市場價，不繼續遞迴，避免路徑爆炸
      if (otherCost == null) return;
      let resultValue = 0, ok = true, bestPart = -Infinity, endId = null;
      t.items.forEach(function (it) {
        const r = resolveChainedValue(it[0], it[1], dcData, basis, depth - 1, visited);
        if (r == null) { ok = false; return; }
        resultValue += r.v;
        if (r.v > bestPart) { bestPart = r.v; endId = r.end; } // 一次換到多樣東西時，終點取價值最高的那個
      });
      if (!ok) return;
      const net = (resultValue - otherCost) / myAmt * amountNeeded;
      if (best == null || net > best.v) best = { v: net, end: endId };
    });
    visited.delete(itemId); // 退出這個分支時解除標記，另一條不相關的路徑如果也經過同一個中繼物品，不該被誤判成循環
    if (dbg) console.log('[CHAIN-DEBUG]   中繼物品 ' + (ITEM_NAMES_TW_ALL[itemId] || itemId) + '(id=' + itemId + ') 追查結果=', best);
    return best;
  }
  function buildCurrencyBestUses(itemId, dcData, basis, limit, sortKey) {
    buildTradeIndices();
    const dbg = typeof window !== 'undefined' && window.__CHAIN_DEBUG__;
    if (dbg) {
      // 探針：直接印出神秘原石／3級薩納蘭土壤在目前資料裡的實際狀態，一眼看出缺不缺資料
      console.log('[CHAIN-DEBUG] ===== 代幣' + itemId + ' 價格基準=' + basis);
      [13586, 7766].forEach(function (pid) {
        console.log('[CHAIN-DEBUG] 探針 ' + (ITEM_NAMES_TW_ALL[pid] || pid) + '(id=' + pid + ') 快照列=', JSON.stringify(dcData.items[pid]), ' 直接市價=', tradeItemPrice(pid, dcData, basis), ' 可再兌換筆數=', (tradesByCurrencyCache[pid] || []).length);
      });
    }
    const trades = tradesByCurrencyCache[itemId] || [];
    const rows = [];
    trades.forEach(function (t) {
      const myAmount = (t.currencies.find(function (x) { return x[0] === Number(itemId); }) || [0, 0])[1];
      if (!myAmount) return;
      const otherCurrencies = t.currencies.filter(function (x) { return x[0] !== Number(itemId); });
      const otherCost = tradeSideValue(otherCurrencies, dcData, basis); // 沒有其他付出時是空陣列，tradeSideValue回傳0
      if (otherCost == null) return;
      let resultValue = 0, ok = true, viaChain = false, chainEnd = null;
      t.items.forEach(function (it) {
        const direct = tradeItemPrice(it[0], dcData, basis);
        if (direct != null) { resultValue += direct * it[1]; return; }
        // 直接查不到市場價，不是馬上放棄，往下追看這個中繼物品能不能再換成有價的東西
        const chained = resolveChainedValue(it[0], it[1], dcData, basis, CHAIN_MAX_DEPTH, new Set([Number(itemId)]));
        if (chained == null) { ok = false; return; }
        resultValue += chained.v; viaChain = true;
        if (chainEnd == null) chainEnd = chained.end;
      });
      if (!ok) return;
      const net = (resultValue - otherCost) / myAmount;
      // 賣速／成交頻率：鏈式結果看「終點物品」（真正會被賣掉的東西），一般結果維持看第一個換到的物品
      const liq = liquidityOf(viaChain && chainEnd != null ? chainEnd : t.items[0][0], dcData);
      rows.push({ resultItems: t.items, net: net, vel: liq.vel, txnFreq: liq.txnFreq, viaChain: viaChain, chainEnd: chainEnd });
    });
    const key = sortKey || 'net';
    rows.sort(function (a, b) { return b[key] - a[key]; });
    return rows.slice(0, limit || 8);
  }

  async function loadSupplyChainSection(itemId) {
    const box = $('mk-detail-supply');
    if (typeof CRAFT_RECIPES === 'undefined') {
      box.innerHTML = '<p class="craft-muted">讀取配方資料中⋯</p>';
      await ensureCraftDataLoaded();
    }
    if (typeof CRAFT_RECIPES === 'undefined') { box.innerHTML = ''; return; }
    const rid = (buildToRecipesIndex()[itemId] || [])[0];
    await renderSupplyChainWithBreakdown(itemId, rid, box);
  }

  /* 供應鏈圖外面包一層：先讀設定＋預先計算資料，把「自製 vs 直購」的結論算出來，
   * 再交給 renderSupplyChain 畫圖＋標結論。設定一改（水晶/價格基準/材料品質）就整個重算重畫，
   * 不需要重新整理整個物品詳情頁。 */
  async function renderSupplyChainWithBreakdown(itemId, rid, box) {
    const settings = getSupplySettings();
    box.innerHTML = '<p class="craft-muted">讀取供應鏈中⋯</p>';
    // 只要圖上會出現任何卡片（不管是材料還是用在哪）就要讀價格快照——用在哪的卡片一樣需要買/做比較，
    // 不是只有中心物品自己有配方時才需要（原礦類物品沒有配方，但一樣有「用在哪」的卡片要顯示比較）。
    const hasAnyGraph = !!rid || ((buildUsedInIndex()[itemId] || []).length > 0);
    const dcData = hasAnyGraph ? await getPrecomputedAllData() : null;
    // 當前/1天/3天/7天 四個窗口都能從快照秒讀，不用即時抓——只有玩家主動選「30天」才需要查即時資料，
    // 而且只在那個時候才抓，不要每次開物品頁都預先抓一輪（那是上一版讓單一物品要等快1分鐘的原因）。
    if (dcData && settings.materialsAvgWindow === '30d') {
      await ensureLiveAvgForItems(getCurrentGraphItemIds(itemId, rid));
    }
    const bd = (rid && dcData) ? materialBreakdown(itemId, dcData, settings.materialsBasis, settings) : null;
    const bdUnavailable = !!rid && !bd; // 有配方、但比較不出來（資料太舊或缺價），跟「這物品本來就不能製作」要分開顯示
    // 水晶在這份配方裡實際值多少錢——固定算「算入水晶」跟「水晶當免費」兩種的自製成本差，
    // 不管目前開關在哪一邊，這個數字永遠是「水晶本身的真實成本貢獻」，意思不會因為現在開或關而反過來，
    // 玩家看到的永遠是同一個方向的數字，不用自己換算。
    let crystalImpact = null;
    if (rid && dcData) {
      const bdOn = materialBreakdown(itemId, dcData, settings.materialsBasis, Object.assign({}, settings, { includeCrystal: true }));
      const bdOff = materialBreakdown(itemId, dcData, settings.materialsBasis, Object.assign({}, settings, { includeCrystal: false }));
      if (bdOn && bdOff && bdOn.totalAuto != null && bdOff.totalAuto != null) crystalImpact = bdOn.totalAuto - bdOff.totalAuto; // 水晶的真實成本貢獻，恆為正
    }
    renderSupplyChain(itemId, rid, box, bd, dcData, settings, bdUnavailable, 1, crystalImpact);
    return dcData; // 讓呼叫端（設定彈窗）能拿到這次重畫用的最新資料，不用沿用自己手上可能過期的那份
  }

  /* 齒輪按鈕彈出的小面板：價格基準／材料品質／水晶成本，三個都是「調了會改變結論數字」的選項，
   * 收在同一顆按鈕底下，平常不佔版面；跟均價比較彈窗用同一個 craft-settings-popover 樣式，
   * 視覺語言全站保持一致。 */
  /* 差額徽章點開的明細面板：不是另開一張小圖，是同一個彈窗裡用麵包屑一路鑽下去，
   * 空間比卡片角落大很多，可以塞下比較結果＋這項材料自己的材料清單＋市場熱度＋關注按鈕，
   * 比參考網站那種「一次全展開」裝得下更多資訊，只是用「鑽進去」取代「攤開來」。 */
  function ensureDetailPanelModalDom() {
    let modal = $('mk-detail-panel-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'mk-detail-panel-modal';
    modal.className = 'market-modal-backdrop';
    modal.style.display = 'none';
    modal.innerHTML = '<div class="market-modal-box">' +
      '<div class="market-modal-head"><div id="mk-detail-panel-crumb" class="market-detail-panel-crumb"></div><button type="button" class="market-modal-close" data-mk-close-detail="1"><i class="ph ph-x"></i></button></div>' +
      '<div class="market-modal-body" id="mk-detail-panel-body"></div>' +
    '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('[data-mk-close-detail]')) modal.style.display = 'none';
    });
    return modal;
  }
  function openMaterialDetailPanel(itemId, dcData, settings) {
    const modal = ensureDetailPanelModalDom();
    modal.style.display = 'flex';
    let crumb = [itemId];
    function renderCrumb() {
      $('mk-detail-panel-crumb').innerHTML = crumb.map(function (id, i) {
        const name = ITEM_NAMES_TW_ALL[id] || id;
        return (i > 0 ? '<span class="market-detail-panel-crumb-sep">›</span>' : '') +
          '<button type="button" class="market-detail-panel-crumb-btn' + (i === crumb.length - 1 ? ' active' : '') + '" data-crumb-idx="' + i + '">' + name + '</button>';
      }).join('');
      $('mk-detail-panel-crumb').querySelectorAll('[data-crumb-idx]').forEach(function (el) {
        el.addEventListener('click', function () {
          crumb = crumb.slice(0, Number(el.dataset.crumbIdx) + 1);
          renderLevel();
        });
      });
    }
    function renderLevel() {
      const id = crumb[crumb.length - 1];
      renderCrumb();
      const body = $('mk-detail-panel-body');
      body.innerHTML = '<p class="craft-muted">讀取中⋯</p>';
      const res = resolveItemBuyCraft(id, dcData, settings.materialsBasis, settings);
      const liq = liquidityOf(id, dcData);
      const purchasePrice = settings.materialsBasis === 'avg'
        ? avgPriceOf(id, settings.materialsAvgWindow || 'current', dcData)
        : listingPriceWithPersp(dcData.items[id], (settings.hqOverrides && settings.hqOverrides[id]) || settings.matPersp || 'nq');
      let costHtml;
      if (res.buy != null && res.craft != null) {
        const better = res.chosen === 'craft';
        const save = Math.abs(res.buy - res.craft);
        costHtml = '<div class="market-detail-cost-badge ' + (better ? 'is-craft' : 'is-buy') + '">' +
          (better ? '🔨 自製 ' + Math.round(res.craft).toLocaleString() : '🛒 直購 ' + Math.round(res.buy).toLocaleString()) +
          '　省 ' + Math.round(save).toLocaleString() +
          '（' + (better ? '直購' : '自製') + ' ' + Math.round(better ? res.buy : res.craft).toLocaleString() + '）</div>';
      } else if (res.buy != null) {
        costHtml = '<div class="market-detail-cost-badge is-buy">🛒 市場價 ' + Math.round(res.buy).toLocaleString() + '（無法製作，只能買）</div>';
      } else if (res.craft != null) {
        costHtml = '<div class="market-detail-cost-badge is-craft">🔨 自製成本 ' + Math.round(res.craft).toLocaleString() + '（市場無報價）</div>';
      } else {
        costHtml = '<p class="craft-muted">目前沒有足夠資料可比較。</p>';
      }
      const liqHtml = '<div class="market-detail-liq-row">' +
        '<span class="market-stat-badge">賣速 ' + liq.vel.toFixed(1) + ' 件/天</span>' +
        '<span class="market-stat-badge">成交頻率 ' + liq.txnFreq.toFixed(2) + ' 筆/天</span>' +
        (purchasePrice != null ? '<span class="market-stat-badge">現價 ' + Math.round(purchasePrice).toLocaleString() + '</span>' : '') +
      '</div>';
      const watched = isWatched(id);
      const watchBtnHtml = '<button type="button" class="market-history-btn" id="mk-detail-watch-btn">' +
        (watched ? '<i class="ph ph-bell-simple-slash"></i> 取消關注' : '<i class="ph ph-bell-simple"></i> 加入關注清單') + '</button>';
      const linkHtml = '<a href="javascript:void(0)" class="market-detail-panel-link" id="mk-detail-fulllink">查看完整物品頁 →</a>';
      // 這個物品自己的材料，一樣各自算買/做，點了在同一個面板裡繼續往下鑽（麵包屑加一節）
      const byItem = getRecipesByItem();
      const childRecipe = byItem[id] && byItem[id][0];
      let subListHtml = '';
      if (childRecipe) {
        subListHtml = '<p class="market-obtain-subtitle">它自己的材料</p><div class="market-detail-sub-list">' +
          childRecipe.ingredients.map(function (ing) {
            const subRes = resolveItemBuyCraft(ing.itemId, dcData, settings.materialsBasis, settings);
            const subDelta = (subRes.buy != null && subRes.craft != null) ? (subRes.buy - subRes.craft) * ing.amount : null;
            const badge = subDelta == null ? '' : (Math.abs(subDelta) < 1 ? '<span class="market-stat-badge market-stat-badge-muted">≈0</span>' :
              '<span class="market-stat-badge' + (subDelta > 0 ? ' market-stat-badge-strong' : '') + '">' + fmtDeltaBadge(subDelta) + '</span>');
            return '<button type="button" class="market-detail-sub-row" data-sub-item="' + ing.itemId + '">' +
              itemIconHtml(ing.itemId, 22) + '<span class="market-detail-sub-name">' + (ITEM_NAMES_TW_ALL[ing.itemId] || ing.itemId) + ' ×' + ing.amount + '</span>' + badge +
            '</button>';
          }).join('') + '</div>';
      }
      body.innerHTML =
        '<div class="market-detail-panel-head">' + itemIconHtml(id, 32) + '<h4>' + (ITEM_NAMES_TW_ALL[id] || id) + '</h4></div>' +
        costHtml + liqHtml +
        '<div class="market-detail-panel-actions">' + watchBtnHtml + linkHtml + '</div>' +
        subListHtml;
      $('mk-detail-watch-btn').addEventListener('click', function () {
        if (isWatched(id)) { removeFromWatchlist(id); } else { addToWatchlist(id, ITEM_NAMES_TW_ALL[id] || id, null); }
        renderWatchlistPanel();
        renderLevel();
      });
      $('mk-detail-fulllink').addEventListener('click', function () { modal.style.display = 'none'; openItemDetail(id); });
      body.querySelectorAll('[data-sub-item]').forEach(function (el) {
        el.addEventListener('click', function () { crumb.push(el.dataset.subItem); renderLevel(); });
      });
    }
    renderLevel();
  }

  /* 目前圖上會出現哪些物品ID——材料、用途、中心物品本身都算，給「個別材料設定」子區塊
   * 篩選用（只列同時有NQ/HQ報價、玩家才有必要個別覆寫的物品，不是圖上每個物品都列）。 */
  function getCurrentGraphItemIds(itemId, rid) {
    const ids = [itemId];
    const recipe = rid ? CRAFT_RECIPES[rid] : null;
    (recipe ? (recipe.ingredients || []) : []).forEach(function (ing) { ids.push(ing.itemId); });
    (buildUsedInIndex()[itemId] || []).forEach(function (urid) {
      const r = CRAFT_RECIPES[urid]; if (r) ids.push(r.itemId);
    });
    return ids;
  }
  /* 「材料品質」只能是真正的材料（下一層），不能把「用在哪」的上層物品也算進去——
   * 製作邏輯本來就是看材料，上一層的成品要用什麼品質是另一回事，兩者不能混在同一份清單裡。 */
  function getMaterialOnlyIds(rid) {
    const recipe = rid ? CRAFT_RECIPES[rid] : null;
    return (recipe ? (recipe.ingredients || []) : []).map(function (ing) { return ing.itemId; });
  }

  // 30天窗口在供應鏈圖這裡先隱藏（即時抓取耗時，暫不開放選擇）；只影響這裡，
  // 跟物品詳情頁本來就有的5窗口均價彈窗（openAvgPricePopover）是完全獨立的另一份UI，不受影響。
  const AVG_WINDOW_OPTIONS = [['current', '當前'], ['1d', '1天'], ['3d', '3天'], ['7d', '7天']];
  function avgWindowSelectHtml(id, cur) {
    return '<select id="' + id + '" class="craft-select" style="font-size:11px">' +
      AVG_WINDOW_OPTIONS.map(function (w) { return '<option value="' + w[0] + '"' + (cur === w[0] ? ' selected' : '') + '>' + w[1] + '</option>'; }).join('') +
      '</select>';
  }
  // 「個別材料品質」子區塊有沒有展開，獨立記在這裡（不是每次重畫彈窗內容時都重置成收合），
  // 跨render存活，解決「點了NQ/HQ按鈕，子區塊又縮回去」的問題。
  let supplyOverrideSectionOpen = false;

  /* 整個設定彈窗只有這一個進入點（不管是點齒輪、還是改完設定要刷新），每次呼叫都：
   *  1. 重新從DOM抓一次按鈕位置（不吃任何外部傳進來、可能已經過期的節點參照）
   *  2. 用localStorage當下最新的設定內容重畫整個彈窗
   * 這樣不會有「舊按鈕/舊select的事件監聽器還留著」這種殘留狀態的問題——
   * 上一版用「重建box再模擬點擊新按鈕」這種間接做法，就是因為殘留的舊監聽器在不確定的時機
   * 被觸發，才會出現「位置跳到左上角」「設定改了沒反應」「隔一段時間才正常」這些不穩定現象。 */
  async function openSupplySettingsPopover(box, itemId, rid, dcData) {
    const btn = box.querySelector('[data-mk-supply-settings-btn]'); // 每次都重新查，絕不沿用舊參照
    if (!btn) return;
    const pop = ensureAvgPricePopoverDom();
    pop.style.display = 'block';
    const s = getSupplySettings();
    const crystalOn = s.includeCrystal;
    const graphIds = dcData ? getMaterialOnlyIds(rid).filter(function (id) {
      const mr = dcData.items[id];
      // 有沒有NQ/HQ兩種報價，一律看「掛單價」資料判斷，不跟著目前的價格基準走——
      // 之前跟著基準走，切到成交均價（均價資料本來就不分品質）後這份清單就被判成空的、整塊消失。
      return mr && radarUnitPrice(mr, 'nq', 'listing') != null && radarUnitPrice(mr, 'hq', 'listing') != null;
    }) : [];
    // 個別材料「自動」＝真的比較NQ/HQ取較低價，不是「跟隨全域」的意思，所以每個材料都可以選，
    // 不需要再有「預設（跟隨全域）」這個選項——沒特別調整的材料，看起來就是全域設定本身，
    // 想個別調整就直接三選一。
    const overrideRows = graphIds.map(function (id) {
      const cur = s.hqOverrides[id] || s.matPersp;
      return '<div class="market-supply-settings-row" data-override-item="' + id + '"><span>' + (ITEM_NAMES_TW_ALL[id] || id) + '</span>' +
        '<span class="market-hq-override-btns">' +
          '<button type="button" class="market-hq-btn' + (cur === 'nq' ? ' active' : '') + '" data-ov="nq">NQ</button>' +
          '<button type="button" class="market-hq-btn' + (cur === 'hq' ? ' active' : '') + '" data-ov="hq">HQ</button>' +
          '<button type="button" class="market-hq-btn' + (cur === 'auto' ? ' active' : '') + '" data-ov="auto">自動</button>' +
        '</span></div>';
    }).join('');
    const windowLoading = pop.dataset.windowLoading === '1'; // 30天窗口正在抓取時顯示讀取中，不讓select消失造成「沒反應」的錯覺
    pop.innerHTML =
      '<p class="craft-mat-worlds-title">供應鏈比較設定</p>' +
      '<div class="market-supply-settings-row"><span>價格基準</span>' +
        '<select id="mk-sup-basis" class="craft-select" style="font-size:11px">' +
          '<option value="listing"' + (s.materialsBasis === 'listing' ? ' selected' : '') + '>掛單最低價</option>' +
          '<option value="avg"' + (s.materialsBasis === 'avg' ? ' selected' : '') + '>成交均價</option>' +
        '</select></div>' +
      (s.materialsBasis === 'avg' ? '<div class="market-supply-settings-row"><span>均價窗口</span>' + avgWindowSelectHtml('mk-sup-mwindow', s.materialsAvgWindow) + (windowLoading ? ' <span class="craft-muted" style="font-size:10px">讀取中⋯</span>' : '') + '</div>' : '') +
      '<p class="craft-muted" style="font-size:10px;margin:-2px 0 6px">決定圖上所有卡片的顯示價，也決定買/做比較時材料怎麼算</p>' +
      '<div class="market-supply-settings-row"><span>材料品質（全域）</span>' +
        '<select id="mk-sup-persp" class="craft-select" style="font-size:11px">' +
          '<option value="nq"' + (s.matPersp === 'nq' ? ' selected' : '') + '>NQ</option>' +
          '<option value="hq"' + (s.matPersp === 'hq' ? ' selected' : '') + '>HQ</option>' +
          '<option value="auto"' + (s.matPersp === 'auto' ? ' selected' : '') + '>自動（比較NQ/HQ取較低）</option>' +
        '</select></div>' +
      // 拿掉彈出提示（title），文字固定「忽略水晶成本」，圖示（💎/◇）負責表達目前開關狀態
      '<button type="button" class="market-supply-settings-row market-crystal-toggle" id="mk-sup-crystal" data-on="' + (crystalOn ? '1' : '0') + '">' +
        '<span>忽略水晶成本</span><span class="market-crystal-icon">' + (crystalOn ? '💎' : '◇') + '</span></button>' +
      (graphIds.length ? (
        '<button type="button" class="market-supply-settings-row market-override-toggle" id="mk-sup-ov-toggle"><span>個別材料品質' + (s.materialsBasis === 'avg' ? '<span class="craft-muted" style="font-size:10px;margin-left:4px">（均價不分品質）</span>' : '') + '</span><i class="ph ph-caret-' + (supplyOverrideSectionOpen ? 'down' : 'right') + '"></i></button>' +
        '<div id="mk-sup-ov-body" style="display:' + (supplyOverrideSectionOpen ? 'block' : 'none') + '">' + overrideRows + '</div>'
      ) : '');
    const r = btn.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 260)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    async function apply(patch) {
      const next = Object.assign(getSupplySettings(), patch);
      saveSupplySettings(next);
      // 當前/1/3/7天都能從快照秒讀，不用等；只有切到「30天」才需要即時抓，這時才顯示讀取中。
      if (next.materialsAvgWindow === '30d') {
        pop.dataset.windowLoading = '1';
        await openSupplySettingsPopover(box, itemId, rid, dcData); // 先把「讀取中」畫出來
        await ensureLiveAvgForItems(getCurrentGraphItemIds(itemId, rid));
        pop.dataset.windowLoading = '';
      }
      const freshDcData = await renderSupplyChainWithBreakdown(itemId, rid, box); // 重畫背後的圖
      await openSupplySettingsPopover(box, itemId, rid, freshDcData); // 面板留著，用最新資料／設定重新畫一次內容（不關閉）
    }
    $('mk-sup-basis').addEventListener('change', function () { apply({ materialsBasis: this.value }); });
    $('mk-sup-persp').addEventListener('change', function () { apply({ matPersp: this.value }); });
    $('mk-sup-crystal').addEventListener('click', function () { apply({ includeCrystal: this.dataset.on !== '1' }); });
    const mWin = $('mk-sup-mwindow'); if (mWin) mWin.addEventListener('change', function () { apply({ materialsAvgWindow: this.value }); });
    const ovToggle = $('mk-sup-ov-toggle');
    if (ovToggle) {
      ovToggle.addEventListener('click', function () {
        supplyOverrideSectionOpen = !supplyOverrideSectionOpen;
        $('mk-sup-ov-body').style.display = supplyOverrideSectionOpen ? 'block' : 'none';
        this.querySelector('.ph').className = supplyOverrideSectionOpen ? 'ph ph-caret-down' : 'ph ph-caret-right';
      });
      pop.querySelectorAll('[data-override-item] [data-ov]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = this.closest('[data-override-item]').dataset.overrideItem;
          const cur = getSupplySettings();
          const hqOverrides = Object.assign({}, cur.hqOverrides);
          if (this.dataset.ov) hqOverrides[id] = this.dataset.ov; else delete hqOverrides[id];
          apply({ hqOverrides: hqOverrides });
        });
      });
    }
  }
  function bindSupplySettingsPopover(box, itemId, rid, dcData) {
    const btn = box.querySelector('[data-mk-supply-settings-btn]');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      openSupplySettingsPopover(box, itemId, rid, dcData);
    });
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
  function renderSupplyChain(itemId, rid, box, bd, dcData, settings, bdUnavailable, craftMultiplier, crystalImpact) {
    craftMultiplier = craftMultiplier || 1; // 中心物品「想做幾個」，材料數量/差額跟著這個倍數縮放，不影響買/做的判斷邏輯本身
    const recipe = rid ? CRAFT_RECIPES[rid] : null;
    const yields = recipe ? (recipe.yields || 1) : 1;
    const ings = recipe ? (recipe.ingredients || []) : [];
    const usedInRids = buildUsedInIndex()[itemId] || [];
    if (!ings.length && !usedInRids.length) { box.innerHTML = ''; return; }
    // itemId→這項材料是買還是做／實際差多少錢，供下面畫卡片時查。不是只有中心物品的直接材料
    // 才算——圖上所有卡片（材料、用途，不分方向）都各自呼叫resolveItemBuyCraft算自己的買/做結果，
    // 用途卡片一樣是「這個成品該自己做還是買」的獨立判斷，跟它是不是中心物品的材料無關。
    // 差額＝買要花多少−做要花多少，正數＝自己做比較省、負數＝直接買比較省，兩種情況都要讓玩家
    // 不展開明細就看到實際數字，自己判斷值不值得花時間做。
    const decisionByItem = {}, deltaByItem = {};
    if (dcData) {
      const allIds = ings.map(function (ing) { return ing.itemId; })
        .concat(usedInRids.map(function (urid) { const r = CRAFT_RECIPES[urid]; return r ? r.itemId : null; }).filter(Boolean));
      allIds.forEach(function (id) {
        if (decisionByItem[id] !== undefined) return; // 同一物品在材料跟用途裡都出現時不用算兩次
        const res = resolveItemBuyCraft(id, dcData, settings.materialsBasis, settings);
        decisionByItem[id] = res.chosen;
        if (res.buy != null && res.craft != null) {
          // 材料卡片的差額要乘上「這個物品要用幾個」，用途卡片本身沒有「用幾個」的概念（它是
          // 上層的一個成品，不是中心物品的用量），差額就是它自己做1個 vs 買1個的差，不用乘amount，
          // 也不受中心物品的數量調整影響（調整的是中心物品要做幾個，不是這個用途成品要做幾個）。
          const ing = ings.find(function (x) { return x.itemId === id; });
          deltaByItem[id] = (res.buy - res.craft) * (ing ? ing.amount * craftMultiplier : 1);
        }
      });
    }

    // 材料（下排）：可製作的點下去能繼續往下鑽
    const matNodes = ings.map(function (ing) {
      const childRid = (buildToRecipesIndex()[ing.itemId] || [])[0];
      return { itemId: ing.itemId, amount: ing.amount * craftMultiplier, rid: childRid || '', name: ITEM_NAMES_TW_ALL[ing.itemId] || ing.itemId };
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
    // 中心卡片比一般卡片大一點，強調「這是目前正在看的物品」；有配方時多顯示一行數量（×N），
    // 要多留13px高度給這行字，不然價格文字會被擠到卡片外面（跟一般卡片line2的排版邏輯一致）。
    const CENTER_W = 112, CENTER_H = 84; // 數量改顯示在−/＋按鈕中間（卡片外面），卡片本身不用再加高
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
    /* 差額壓縮成短字串，卡片角落空間有限，數字位數不固定（幾金到幾萬金都可能），
     * 超過一萬就用「萬」簡寫，不然位數一多角落的小徽章會被撐爆。 */
    function fmtDeltaBadge(n) {
      const sign = n >= 0 ? '+' : '-';
      const abs = Math.abs(n);
      const txt = abs >= 10000 ? (abs / 10000).toFixed(1) + '萬' : Math.round(abs).toString();
      return sign + txt;
    }
    /* 卡片收起狀態就要看得到的實際差額徽章（不是只有顏色）：綠色＝自己做這項省下這個數字，
     * 橘色＝直接買比較划算、做的話反而多花這個數字——兩個方向都給實際金額，玩家自己拿這個數字
     * 跟「做這個要花多少時間」比，才能真正判斷划不划算，不是只靠系統說「划算」兩個字。 */
    const DELTA_NEGLIGIBLE_THRESHOLD = 10; // 差距在這個金額以內就當「價格接近」，不特別標方向，跟結論那句用同一個門檻
    function deltaBadgeSvg(x, topY, w, delta, badgeItemId) {
      if (delta == null) return '';
      const negligible = Math.abs(delta) < DELTA_NEGLIGIBLE_THRESHOLD;
      const color = negligible ? '#a39c8f' : (delta > 0 ? '#4ade80' : '#e0a05a');
      const bg = negligible ? 'rgba(255,255,255,.08)' : (delta > 0 ? 'rgba(74,222,128,.16)' : 'rgba(224,160,90,.14)');
      // 數字前面加一個固定圖示（🔨＝自己做划算、🛒＝直接買划算），不用停留滑鼠也能一眼看懂方向，
      // 跟結論徽章、明細面板用同一套圖示語言，整個頁面對「做」「買」只有這兩個圖示，意思統一。
      const icon = negligible ? '' : (delta > 0 ? '🔨' : '🛒');
      const label = icon + (negligible ? '≈' : fmtDeltaBadge(delta));
      const bw = Math.max(30, 16 + label.length * 6.2);
      const bx = x + w / 2 - bw - 3, by = topY + 3, bh = 14;
      // 滑鼠停留顯示完整意思（原生title提示，不佔畫面空間，不是常駐文字）：正數＝自己做這項省多少，
      // 負數＝直接買這項省多少，跟結論那句「自製省/直接買省」用同一套語言，不用另外發明說法。
      const tip = negligible ? '這項材料買或做價格接近（差距<' + DELTA_NEGLIGIBLE_THRESHOLD + '金）'
        : (delta > 0 ? '這項材料自己做比買省 ' + Math.round(delta).toLocaleString() + ' 金' : '這項材料直接買比做省 ' + Math.round(-delta).toLocaleString() + ' 金');
      // 徽章本身可以點，點了開明細面板——跟卡片本體的「點了跳轉」是分開的兩個互動區域，
      // 卡片本體click的時候要先判斷有沒有點在這個徽章上，點到了就不要再觸發跳轉（見cardClick綁定處）。
      return '<g class="market-delta-badge" data-mk-detail-item="' + badgeItemId + '"><title>' + tip + '</title><rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="7" fill="' + bg + '" stroke="' + color + '" stroke-width="0.8"/>' +
        '<text x="' + (bx + bw / 2) + '" y="' + (by + bh / 2 + 3.5) + '" text-anchor="middle" font-size="9" fill="' + color + '" font-weight="600">' + label + '</text></g>';
    }
    function cardHtml(x, topY, iconId, line1, line2, clickAttrs, isOverflow, opts) {
      opts = opts || {};
      const w = opts.w || CARD_W, h = opts.h || CARD_H;
      const r = opts.iconR || 15;
      const iconY = topY + 8 + r;
      const nameY = iconY + r + 12;
      const line2Y = nameY + 13;
      const priceY = (line2 ? line2Y : nameY) + 13;
      const fit = line1 ? fitName(line1, w - 12, opts.fontSize || 10.5, 8) : { text: '', fontSize: 10.5, titleAttr: '' };
      // decision='craft'：這項材料自己做比買便宜，邊框改成跟「省錢」同一個綠色，一眼認出「這個該自己做」；
      // decision='buy' 或沒有比較結果：維持原本金色邊框，不用特別標記——「照原樣買」是預設情況，不需要額外提醒。
      const strokeColor = isOverflow ? '#7a736a' : (opts.highlight ? '#f0d9a0' : (opts.decision === 'craft' ? '#4ade80' : '#c5a059'));
      const strokeWidth = opts.highlight ? 2 : (opts.decision === 'craft' ? 1.8 : 1.2);
      return '<g class="mk-supply-node' + (opts.highlight ? ' mk-supply-node-center' : '') + '"' + clickAttrs + '>' + fit.titleAttr +
        '<rect x="' + (x - w / 2) + '" y="' + topY + '" width="' + w + '" height="' + h + '" rx="8" fill="' + (opts.highlight ? 'rgba(197,160,89,.18)' : 'rgba(0,0,0,.4)') + '" stroke="' + strokeColor + '" stroke-width="' + strokeWidth + '"/>' +
        (isOverflow
          ? '<text x="' + x + '" y="' + iconY + '" text-anchor="middle" dominant-baseline="central" font-size="13" fill="#ddd">還有</text>'
          : itemIconSvg(iconId, x, iconY, r)) +
        '<text x="' + x + '" y="' + nameY + '" text-anchor="middle" font-size="' + fit.fontSize.toFixed(1) + '" fill="' + (opts.highlight ? '#fcf6ba' : '#eee') + '" font-weight="' + (opts.highlight ? '600' : '400') + '">' + fit.text + '</text>' +
        (line2 ? '<text x="' + x + '" y="' + line2Y + '" text-anchor="middle" font-size="12" fill="#fcf6ba" font-weight="700">' + line2 + '</text>' : '') +
        (isOverflow ? '' : '<text class="mk-card-price"' + (opts.priceElId ? ' id="' + opts.priceElId + '"' : '') + ' data-price-item="' + iconId + '"' + (opts.amount > 1 ? ' data-amount="' + opts.amount + '"' : '') + ' x="' + x + '" y="' + priceY + '" text-anchor="middle" font-size="9" fill="#8fd6a0"></text>') +
        deltaBadgeSvg(x, topY, w, opts.delta, iconId) +
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
      // 這項材料「買」還是「做」比較划算，用邊框顏色直接標出來——跟文字結論同一套顏色語言，
      // 掃一眼卡片邊框就知道要買還是要做，不用先看完文字才懂。'craft'＝這項材料自己做比買便宜。
      const decision = decisionByItem[n.itemId];
      const delta = deltaByItem[n.itemId];
      svgParts += cardHtml(x, matTop, n.itemId, n.name, '×' + n.amount, clickAttrs, false, { decision: decision, delta: delta, amount: n.amount });
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
      svgParts += cardHtml(x, useTop, n.itemId, n.name, '', ' data-mk-supply-item="' + n.itemId + '" data-mk-supply-rid="' + n.rid + '"', false,
        { decision: decisionByItem[n.itemId], delta: deltaByItem[n.itemId] });
    });
    if (useOverflow) {
      const count = useNodes.length + 1;
      const x = rowX(count, count - 1);
      const a = { x: cx, y: centerTop };
      const b = { x: x, y: useBottom };
      facetV(a, b, bendY1, 'up');
      svgParts += cardHtml(x, useTop, '', String(useNodesFull.length - useNodes.length) + '種', '', ' data-mk-usedin-more="1"', true);
    }

    // 結論列：只有這物品本身有配方才需要顯示（用途清單/純原礦沒有「自製vs直購」這回事）。
    // 用色塊+極短句取代長句子，符合左右並排版面空間有限、能用視覺就不用文字的原則；
    // 完整每項材料的買/做細節留給「查看完整供應鏈清單」，這裡只給最後結論。
    let headlineHtml = '';
    if (rid) {
      let concl;
      if (bd && bd.totalBuy != null && bd.totalAuto != null) {
        const save = (bd.totalBuy - bd.totalAuto) * craftMultiplier;
        const qtyTag = craftMultiplier > 1 ? '（' + craftMultiplier + '個）' : '';
        // 三種情況分開處理，不是只有「省」跟「其餘都算多花」兩種——差距小到可以忽略時，
        // 用「-save」這種算法在save剛好是小額正數時會算出帶負號的極小值（顯示成「-0」這種語病），
        // 根本原因是把「忽略」硬塞進「多花」分支，這裡拆成獨立的第三種情況就不會有這個問題。
        const threshold = DELTA_NEGLIGIBLE_THRESHOLD * craftMultiplier; // 做多個的時候門檻也等比例放大，不然買10個時差9金還被當作「有感」
        if (save > threshold) {
          concl = '<span class="market-stat-badge market-stat-badge-strong" style="background:rgba(74,222,128,.16);border-color:#4ade80;color:#8fd6a0">🔨 自製省 ' + Math.round(save).toLocaleString() + ' 金' + qtyTag + '</span>';
        } else if (save < -threshold) {
          concl = '<span class="market-stat-badge">直接買齊最划算・省 ' + Math.round(-save).toLocaleString() + ' 金' + qtyTag + '</span>';
        } else {
          concl = '<span class="market-stat-badge market-stat-badge-muted">買／做價格接近（差距<' + Math.round(threshold).toLocaleString() + '金），皆可' + qtyTag + '</span>';
        }
      } else if (bdUnavailable) {
        concl = '<span class="market-stat-badge market-stat-badge-muted">資料不足，暫無法比較買/做</span>';
      } else {
        concl = '';
      }
      // 水晶圖示放結論徽章旁邊：亮💎＝這個數字有算水晶成本，暗◇＝沒算；旁邊的數字固定代表
      // 「水晶在這個總成本裡實際值多少」，不管現在開或關，數字意思都一樣，不用自己換算方向。
      let crystalDeltaLabel = '';
      if (crystalImpact != null && crystalImpact >= 1) {
        crystalDeltaLabel = '<span class="market-crystal-delta">' + Math.round(crystalImpact * craftMultiplier).toLocaleString() + '</span>';
      }
      // 開/關都用同一個emoji（避免換成另一個符號在深色底幾乎看不見），用顏色濃淡區分狀態，
      // 旁邊加「水晶成本」四字標籤（不是解釋句，是名稱），讓數字知道自己在講什麼。
      const crystalTag = '<button type="button" class="market-supply-crystal-tag' + (settings.includeCrystal ? '' : ' is-off') + '" data-mk-supply-settings-btn="1" title="水晶成本約 ' + (crystalImpact != null ? Math.round(crystalImpact).toLocaleString() : '?') + ' 金，目前' + (settings.includeCrystal ? '已' : '未') + '算入，點擊調整">💎<span class="market-crystal-label">水晶成本</span>' + crystalDeltaLabel + '</button>';
      headlineHtml = '<div class="market-supply-headrow">' +
        '<button type="button" class="market-history-btn" data-mk-supply-settings-btn="1" title="調整價格基準／材料品質／水晶是否算成本"><i class="ph ph-gear-six"></i></button>' +
        concl + crystalTag +
      '</div>';
    }

    // 中心卡片旁的數量調整：− 在卡片左邊、＋在卡片右邊（左右夾住卡片，視覺上比較自然），
    // 數字本身放回卡片「裡面」——但不是新增一行撐高卡片，是接在價格文字同一行後面
    // （例如「300金 ×2」），完全不佔用額外高度，上一版擠壓卡片高度的問題不會再發生。
    let qtyCtrlHtml = '';
    if (rid) {
      const btnR = 13, gapX = 10;
      const minusX = cx - CENTER_W / 2 - gapX - btnR, plusX = cx + CENTER_W / 2 + gapX + btnR;
      const midY = centerTop + CENTER_H / 2;
      const canMinus = craftMultiplier > 1;
      qtyCtrlHtml =
        '<g class="market-qty-btn' + (canMinus ? '' : ' disabled') + '" data-mk-qty-step="-1"><circle cx="' + minusX + '" cy="' + midY + '" r="' + btnR + '"/><text x="' + minusX + '" y="' + (midY + 3) + '" text-anchor="middle">−</text></g>' +
        '<g class="market-qty-btn" data-mk-qty-step="1"><circle cx="' + plusX + '" cy="' + midY + '" r="' + btnR + '"/><text x="' + plusX + '" y="' + (midY + 3) + '" text-anchor="middle">＋</text></g>';
    }

    // 中心卡片現在也套用跟其他卡片一樣的角落徽章（🔨/🛒＋差額），跟結論徽章呈現同一組數字、
    // 只是位置不同，不是互相矛盾——結論徽章是整句話講清楚，角落徽章是跟其他卡片一致的簡短版本。
    let centerDecision, centerDelta;
    if (bd && bd.totalBuy != null && bd.totalAuto != null) {
      const centerSave = (bd.totalBuy - bd.totalAuto) * craftMultiplier;
      centerDecision = centerSave > 0 ? 'craft' : 'buy';
      centerDelta = centerSave;
    }
    box.innerHTML =
      headlineHtml +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" class="market-supply-svg"><defs>' + svgDefs + '</defs>' +
        svgParts +
        cardHtml(cx, centerTop, itemId, ITEM_NAMES_TW_ALL[itemId] || itemId, '', '', false, { w: CENTER_W, h: CENTER_H, iconR: 18, fontSize: 11.5, highlight: true, priceElId: 'mk-center-price', decision: centerDecision, delta: centerDelta }) +
        qtyCtrlHtml +
      '</svg>' +
      '<div class="market-fullchain-btn-row"><button type="button" class="market-fullchain-btn" data-mk-open-fullchain="1">查看完整供應鏈清單</button></div>';

    box.querySelector('[data-mk-open-fullchain]').addEventListener('click', function () { openFullChainModal(itemId, rid); });
    box.querySelectorAll('[data-mk-qty-step]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const dir = Number(btn.dataset.mkQtyStep);
        const newMult = Math.max(1, craftMultiplier + dir);
        if (newMult === craftMultiplier) return;
        renderSupplyChain(itemId, rid, box, bd, dcData, settings, bdUnavailable, newMult, crystalImpact);
      });
    });
    // 第10點＋第6點修正：圖上每張卡片的顯示價，改用跟買/做比較同一份快照資料、同一個materialsBasis
    // 設定去填，不再另外即時查「永遠是最低價」——玩家選了「成交均價」，圖上所有卡片都要跟著換，
    // 不是只有材料成本計算換了、卡片上寫的數字還是舊的最低價，兩邊對不起來。
    // 這兩行必須是同一組if/else，中間不能插入其他程式碼——之前在中間插入了「數量>1」的區塊，
    // 讓else變成接在那個if上，結果數量=1（預設）時每次都多跑一次「即時查最低掛單價」，
    // 把剛填好的均價蓋掉，數量>1才不會被蓋，就是「切換均價沒反應、改數量才突然生效」的真正原因。
    if (dcData) fillCardPricesFromSnapshot(box, dcData, settings.materialsBasis, settings.materialsAvgWindow, settings.matPersp, settings.hqOverrides);
    else fillCardPrices(box); // 完全沒有快照資料時才退回即時查價，至少有數字可看

    // 中心卡片：數量大於1時，價格文字後面接「×N」（金色，跟其他卡片數量同色）與總價
    if (craftMultiplier > 1) {
      const centerPriceEl = $('mk-center-price');
      if (centerPriceEl && centerPriceEl.textContent) {
        const unitPriceNum = parseFloat(centerPriceEl.textContent.replace(/[^\d.]/g, ''));
        const totalTag = !isNaN(unitPriceNum) ? '＝' + fmtTotalGil(unitPriceNum * craftMultiplier) : '';
        centerPriceEl.innerHTML = centerPriceEl.textContent +
          '<tspan fill="#fcf6ba" font-weight="700">　×' + craftMultiplier + '</tspan>' +
          (totalTag ? '<tspan fill="#bfe8c8" font-size="11" font-weight="700">' + totalTag + '</tspan>' : '');
      }
    }
    bindSupplySettingsPopover(box, itemId, rid, dcData); // 每次重繪（含數量±）都要重新綁，舊的按鈕已經被換掉了

    // 第3點抓到的真正原因：材料/用途卡片一直以來分兩條路——可製作的點了只更新這張圖本身
    // （data-mk-supply-item→只重繪box），不可製作的原料點了卻是整頁換目標（data-mk-goto-item→
    // openItemDetail）。同一張圖上的卡片，點起來反應却不一樣，才會出現「點這個只換圖、點那個
    // 整頁跳」的不一致。統一成兩者都走完整的openItemDetail，左邊價格欄位、頁首名稱、右邊供應鏈
    // 圖永遠一起換成同一個目標物品，不會再各自為政。
    box.querySelectorAll('[data-mk-supply-item], [data-mk-goto-item]').forEach(function (el) {
      const targetId = el.dataset.mkSupplyItem || el.dataset.mkGotoItem;
      el.addEventListener('click', function (e) {
        if (e.target.closest('.market-delta-badge')) return; // 點在差額徽章上，交給下面那個監聽器處理，不跳轉
        openItemDetail(targetId);
      });
    });
    // 差額徽章＝開明細面板，跟卡片本體的「點了跳轉」是分開的兩個互動區域。
    box.querySelectorAll('.market-delta-badge').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        openMaterialDetailPanel(el.dataset.mkDetailItem, dcData, settings);
      });
    });
    const moreBtn = box.querySelector('[data-mk-usedin-more]');
    if (moreBtn) {
      moreBtn.addEventListener('click', function () { renderUsedInList(itemId); });
    }
  }

  // 第10點：幫任何有 data-price-item 標記的節點查「全世界最低價」，做法照抄生產頁材料圖譜的
  // fillNodePrices——合併成一次批次請求，不要每張卡片各打一次API（一次撐爆Universalis流量限制）。
  /* 供應鏈圖專用：價格從已經載入的快照資料直接讀（不用再即時查一次）。跟買/做比較、明細面板
   * 共用同一個 materialsBasis 設定跟 listingPriceWithPersp 品質判斷邏輯，不是另一條獨立路徑，
   * 不會再有「這裡改了那裡沒反應」的情況。 */
  /* 卡片上的總價：超過10萬改用「萬」簡寫，不然位數一多會撐出卡片寬度 */
  function fmtTotalGil(n) {
    return n >= 100000 ? (n / 10000).toFixed(1) + '萬' : Math.round(n).toLocaleString();
  }
  function fillCardPricesFromSnapshot(container, dcData, basis, avgWindow, matPersp, hqOverrides) {
    const nodes = Array.prototype.slice.call(container.querySelectorAll('[data-price-item]'));
    nodes.forEach(function (el) {
      const id = el.dataset.priceItem;
      let p;
      if (basis === 'avg') {
        p = avgPriceOf(id, avgWindow || 'current', dcData);
      } else {
        const ov = hqOverrides && hqOverrides[id];
        p = listingPriceWithPersp(dcData.items[id], ov || matPersp || 'nq');
      }
      if (p == null) { el.textContent = '無報價'; return; }
      // 需要的數量大於1時，單價旁邊補上總價（單價×數量），不用玩家自己心算；
      // 總價用tspan單獨上色，不要整句字色混在一起看不出哪段是單價哪段是總價。
      const amount = Number(el.dataset.amount);
      if (amount > 1) {
        el.innerHTML = Math.round(p).toLocaleString() + '金<tspan fill="#bfe8c8" font-size="11" font-weight="700">＝' + fmtTotalGil(p * amount) + '</tspan>';
      } else {
        el.textContent = Math.round(p).toLocaleString() + '金';
      }
    });
  }
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

  /* ── 製作商機（舊的即時掃描版）：全物品投報率排行榜，不限自己職業能做的，依職業分頁瀏覽。
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

  /* ── 製作商機（讀預先計算資料）──
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
  /* 各成品 → 配方（只看繁中服有的配方），遞迴算材料成本時用 */
  let radarRecipesByItem = null;
  function getRecipesByItem() {
    if (radarRecipesByItem) return radarRecipesByItem;
    radarRecipesByItem = {};
    Object.keys(CRAFT_RECIPES).forEach(function (rid) {
      const r = CRAFT_RECIPES[rid];
      if (!isTwRecipe(r)) return;
      (radarRecipesByItem[r.itemId] = radarRecipesByItem[r.itemId] || []).push(r);
    });
    return radarRecipesByItem;
  }
  /* 一個材料的成本：
   *  ・「直接買」模式：就是市場價格（依價格基準）。
   *  ・「自動選較便宜」模式：每個材料各自比較「直接買」跟「自己做（再往下算它的材料，一路算到不能再拆的原料）」，
   *    取比較便宜的那個。這是「每個材料各自取最小值」，不是「全部買」對「全部做」二選一，
   *    所以買比較便宜的材料跟做比較便宜的材料可以同時出現在同一個配方裡，總成本一定不會比直接買貴。
   *  ・最底層不能再拆的原料（採集品、怪物掉落等）一律用市場價格；沒有市場價格又不能製作的材料就無法估價。
   *  ・只算材料本身的價錢，沒有考慮製作時間、買方稅。
   *
   * opts（物品詳情頁的供應鏈比較才會傳，製作商機沿用舊行為不受影響）：
   *  ・includeCrystal=false：水晶系列材料（CRYSTAL_ITEM_IDS）當作免費，不計入成本——很多玩家覺得
   *    水晶隨手採集就有、不該拉低「自己做」看起來的划算程度，這裡讓他們自己決定要不要算進去。
   *  ・matPersp：材料要看哪個品質的價格，預設跟原本行為一樣「NQ優先、沒有才退回全部」；
   *    傳 'hq' 則優先看HQ價格（配方要求HQ材料時用得到），傳 'all' 則不分品質一律用全部掛單的價格。 */
  function makeCostResolver(dcData, basis, auto, opts) {
    opts = opts || {};
    const includeCrystal = opts.includeCrystal !== false; // 預設仍然把水晶算進去，跟原本行為一致
    const matPersp = opts.matPersp || 'nq';
    const memo = {};
    let cycleCuts = 0; // 遞迴時因為「配方繞回自己」而被截斷的次數（截斷過的結果不能記進memo，否則會污染其他道具）
    const byItem = auto ? getRecipesByItem() : null;
    function marketPrice(id) {
      if (!includeCrystal && typeof CRYSTAL_ITEM_IDS !== 'undefined' && CRYSTAL_ITEM_IDS.has(Number(id))) return 0;
      // 均價走5窗口查詢（可能來自即時快取），不分NQ/HQ，跟掛單價是分開的兩條路徑；
      // 材料品質設定（matPersp/hqOverrides）只影響「掛單最低價」怎麼選NQ/HQ，均價本身沒有這個維度。
      if (basis === 'avg') return avgPriceOf(id, opts.materialsAvgWindow || 'current', dcData);
      // 這個物品有沒有被個別覆寫品質（跟全域matPersp不同），有的話優先用覆寫的；
      // 'auto' 是真的比較NQ/HQ兩個價格取較低，跟共用的 listingPriceWithPersp 同一套邏輯。
      const ov = opts.hqOverrides && opts.hqOverrides[id];
      return listingPriceWithPersp(dcData.items[id], ov || matPersp);
    }
    function cost(id, stack) {
      if (memo[id] !== undefined) return memo[id];
      const buy = marketPrice(id);
      let best = buy != null ? { cost: buy, mode: 'buy' } : null;
      const cutsBefore = cycleCuts;
      if (auto && byItem[id] && stack[id]) cycleCuts++;
      if (auto && byItem[id] && !stack[id]) {
        stack[id] = true;
        byItem[id].forEach(function (r) {
          let total = 0, ok = true;
          (r.ingredients || []).forEach(function (ing) {
            const c = cost(ing.itemId, stack);
            if (!c) { ok = false; return; }
            total += c.cost * ing.amount;
          });
          if (!ok) return;
          const perUnit = total / (r.yields || 1);
          if (!best || perUnit < best.cost) best = { cost: perUnit, mode: 'craft' };
        });
        delete stack[id];
      }
      // 這一層算的過程中如果有被「繞回自己」截斷，這個結果只在「這條路徑」上成立，不能當成通用答案記起來；
      // 最外層（stack已清空）的結果本身是完整的，可以記。
      if (cycleCuts === cutsBefore || Object.keys(stack).length === 0) memo[id] = best;
      return best;
    }
    return function (id) { return cost(id, {}); };
  }

  /* 展開明細：某個「成品」自己配方裡每項材料的「買」跟「做」價錢，讓使用者知道比較是怎麼得出來的
   * （不是只顯示一個總數字，而是列出每一項材料，哪些用買的、哪些用做的、各自多少錢）。
   * 用 itemId（不是配方編號）當入口，這樣同一個函式也能拿去遞迴展開「這項材料自己要用什麼材料做」，
   * 一路往下展開到不能再拆的原料——但只在使用者點開時才算、點開才建立下一層，預設全部收合，
   * 不會一次把整棵樹攤開造成畫面混亂。
   * 回傳 null 表示這個道具本身沒有配方（不能製作），呼叫端就不會顯示展開按鈕。
   * 重要：「做」欄一定會盡量算出數字，不會因為「買」比較便宜就故意不算——makeCostResolver 只記錄
   * 「贏的那一個」，這裡改用 craftOnlyCost 另外把「自己做」這條路徑的成本單獨、完整地算一次，
   * 不管它划不划算都要顯示出來，讓使用者自己比較，而不是只在做比較便宜時才給答案。 */
  function craftOnlyCost(itemId, byItem, resolveSub) {
    const recipe = byItem[itemId] && byItem[itemId][0];
    if (!recipe) return null;
    let total = 0, ok = true;
    (recipe.ingredients || []).forEach(function (ing) {
      const c = resolveSub(ing.itemId); // 更下一層的材料仍然各自選較便宜（買或做），這樣「做」的成本才是最低可能的自己做成本
      if (!c) { ok = false; return; }
      total += c.cost * ing.amount;
    });
    if (!ok) return null;
    return total / (recipe.yields || 1);
  }
  /* 找出「自己做」這條路徑上，到底是哪幾樣道具沒有價格（最底層、不能再拆、市場上也沒有價格的道具） */
  function missingPriceItems(itemId, byItem, resolve, seen) {
    if (seen[itemId]) return [];
    if (resolve(itemId)) return [];
    const recipe = byItem[itemId] && byItem[itemId][0];
    if (!recipe) return [itemId];
    seen[itemId] = true;
    let out = [];
    (recipe.ingredients || []).forEach(function (ing) { out = out.concat(missingPriceItems(ing.itemId, byItem, resolve, seen)); });
    return out.length ? out : [itemId];
  }
  function materialBreakdown(itemId, dcData, basis, opts) {
    const byItem = getRecipesByItem();
    const recipe = byItem[itemId] && byItem[itemId][0];
    if (!recipe) return null;
    const resolveBuy = makeCostResolver(dcData, basis, false, opts);
    const resolveAuto = makeCostResolver(dcData, basis, true, opts);
    const yields = recipe.yields || 1;
    const rows = (recipe.ingredients || []).map(function (ing) {
      const buy = resolveBuy(ing.itemId);
      const auto = resolveAuto(ing.itemId); // 「較便宜的那個」，決定「採用」欄要顯示買還是做
      const craftCost = craftOnlyCost(ing.itemId, byItem, resolveAuto); // 「做」欄：不管划不划算，能算就一定顯示
      let missing = null;
      if (craftCost == null && byItem[ing.itemId] && byItem[ing.itemId][0]) {
        const seen = {}; seen[ing.itemId] = true;
        const found = [];
        (byItem[ing.itemId][0].ingredients || []).forEach(function (sub) {
          missingPriceItems(sub.itemId, byItem, resolveAuto, seen).forEach(function (id) { if (found.indexOf(id) === -1) found.push(id); });
        });
        missing = found;
      }
      return {
        missing: missing,
        itemId: ing.itemId, amount: ing.amount,
        buy: buy ? buy.cost : null,
        craft: craftCost,
        chosen: auto ? auto.mode : null,
        craftable: !!(byItem[ing.itemId] && byItem[ing.itemId][0]),
      };
    });
    // 這個道具自己「整批直接買齊材料」vs「每項材料各自選較便宜」的總成本（除以產出數量，變成「做1個」的成本）
    const totalBuy = rows.every(function (x) { return x.buy != null; }) ? rows.reduce(function (s, x) { return s + x.buy * x.amount; }, 0) / yields : null;
    const totalAuto = rows.every(function (x) { return (x.chosen === 'craft' ? x.craft : x.buy) != null; }) ? rows.reduce(function (s, x) { return s + (x.chosen === 'craft' ? x.craft : x.buy) * x.amount; }, 0) / yields : null;
    return { rows: rows, totalBuy: totalBuy, totalAuto: totalAuto, yields: yields };
  }
  /* 通用版：輸入任一物品ID，回傳它自己的買/做比較結果（不限定是誰的材料）。
   * 供應鏈圖上「用在哪」跟「需要的材料」的每張卡片都是呼叫這個，不是只有中心物品的直接材料才有比較——
   * 圖上出現的每一張小卡片，不管在哪個方向、哪一層，都是各自獨立呼叫這個函式算出自己的買/做結果。 */
  function resolveItemBuyCraft(itemId, dcData, basis, opts) {
    const byItem = getRecipesByItem();
    const resolveBuy = makeCostResolver(dcData, basis, false, opts);
    const resolveAuto = makeCostResolver(dcData, basis, true, opts);
    const buyRes = resolveBuy(itemId);
    const buy = buyRes ? buyRes.cost : null;
    const craft = (byItem[itemId] && byItem[itemId][0]) ? craftOnlyCost(itemId, byItem, resolveAuto) : null;
    let chosen = null;
    if (buy != null && craft != null) chosen = craft < buy ? 'craft' : 'buy';
    else if (buy != null) chosen = 'buy';
    else if (craft != null) chosen = 'craft';
    return { buy: buy, craft: craft, chosen: chosen, craftable: !!(byItem[itemId] && byItem[itemId][0]) };
  }
  const MAT_BREAKDOWN_MAX_DEPTH = 4; // 避免無限遞迴／畫面塞滿，超過這個深度就不再顯示展開按鈕
  function renderBreakdownHtml(bd, depth) {
    if (!bd) return '';
    const save = (bd.totalBuy != null && bd.totalAuto != null) ? bd.totalBuy - bd.totalAuto : null;
    const summary = bd.totalBuy != null
      ? '每 1 個材料成本：<span class="' + (save > 0.5 ? '' : 'craft-muted') + '" style="' + (save > 0.5 ? 'color:#4ade80' : '') + '">直接買齊 ' + fmtGil(bd.totalBuy) + ' 金</span>' +
        (bd.totalAuto != null && save > 0.5 ? '　自動選較便宜 <span style="color:#4ade80">' + fmtGil(bd.totalAuto) + ' 金（省 ' + fmtGil(save) + '）</span>' : '')
      : (bd.totalAuto != null ? '每 1 個材料成本（部分材料市場沒有價格，只能算自動選較便宜）：<span style="color:#4ade80">' + fmtGil(bd.totalAuto) + ' 金</span>' : '<span class="craft-muted">材料成本無法完整估算（部分項目沒有價格）</span>');
    return '<div class="market-radar-breakdown-wrap" style="--d:' + depth + '">' +
      (depth > 0 ? '<p class="craft-muted" style="font-size:10px;margin:2px 0">' + summary + '</p>' : '') +
      '<table class="market-radar-breakdown"><thead><tr><th class="market-radar-togcol"></th><th>材料</th><th>需求</th><th>買</th><th>差距</th><th>做</th><th>採用</th></tr></thead><tbody>' +
      bd.rows.map(function (p) {
        const buyTxt = p.buy != null ? fmtGil(p.buy) + ' 金' : '沒有價格';
        let craftTxt;
        if (p.craft != null) craftTxt = fmtGil(p.craft) + ' 金';
        else if (p.craftable) {
          // 注意：這裡說的是「這個道具自己做所需的材料」缺價格，不是這個道具本身沒價格（本身的價格看左邊「買」欄）
          const miss = p.missing || [];
          const names = miss.slice(0, 3).map(function (id) { return ITEM_NAMES_TW_ALL[id] || id; }).join('、');
          craftTxt = '無法完整估算' + (miss.length ? '<span class="craft-muted" style="display:block;font-size:10px" title="自己做所需的材料裡，這些道具在目前的價格基準下查不到價格">缺價格：' + names + (miss.length > 3 ? '⋯等 ' + miss.length + ' 項' : '') + '</span>' : '');
        } else craftTxt = '不能製作';
        const buyWins = p.chosen === 'buy' || p.craft == null;
        // 「差距」欄：買跟做兩個都有數字時，直接算出貴多少／省多少，不用使用者自己心算比較
        let diffTxt = '<span class="craft-muted">－</span>';
        if (p.buy != null && p.craft != null) {
          const diff = p.buy - p.craft; // 正值＝做比較便宜（買比做貴diff），負值＝買比較便宜
          if (Math.abs(diff) < 0.5) diffTxt = '<span class="craft-muted">打平</span>';
          else if (diff > 0) diffTxt = '<span style="color:#4ade80">做省 ' + fmtGil(diff) + '</span>';
          else diffTxt = '<span style="color:#4ade80">買省 ' + fmtGil(-diff) + '</span>';
        }
        const canExpand = p.craftable && depth < MAT_BREAKDOWN_MAX_DEPTH;
        return '<tr class="market-radar-mat-row' + (canExpand ? ' is-expandable' : '') + '" data-mat-item="' + p.itemId + '" data-mat-depth="' + (depth + 1) + '">' +
          '<td class="market-radar-togcol">' + (canExpand ? '<button type="button" class="market-radar-mat-toggle" data-mat-toggle="' + p.itemId + '-' + depth + '" aria-label="展開這項材料的材料明細" title="展開／收起這項材料的材料">▸</button>' : '') + '</td>' +
          '<td class="market-radar-matname">' + (ITEM_NAMES_TW_ALL[p.itemId] || p.itemId) + '</td><td>×' + p.amount + '</td>' +
          '<td style="color:' + (buyWins && p.buy != null ? '#4ade80' : 'inherit') + '">' + buyTxt + '</td>' +
          '<td>' + diffTxt + '</td>' +
          '<td style="color:' + (!buyWins && p.craft != null ? '#4ade80' : 'inherit') + '">' + craftTxt + '</td>' +
          '<td>' + (p.chosen === 'craft' ? '<span style="color:#4ade80">自己做</span>' : (p.chosen === 'buy' ? '直接買' : '－')) + '</td></tr>' +
          (canExpand ? '<tr class="market-radar-mat-nested" data-mat-nested="' + p.itemId + '-' + depth + '" style="display:none"><td colspan="7"></td></tr>' : '');
      }).join('') + '</tbody></table>' +

      '</div>';
  }

  function computeRadarList(jobId, ui, dcData, sellData) {
    const persp = ui.persp, basis = ui.basis, pIdx = HOT_PERSP_IDX[persp];
    const rows = [];
    let skippedMat = 0, skippedSell = 0;
    // 兩種材料成本都算：畫面上要並排顯示「直接買」跟「自動選較便宜」，讓使用者知道自己做到底省多少
    const resolveBuy = makeCostResolver(dcData, basis, false);
    const resolveAuto = makeCostResolver(dcData, basis, true);
    const useAuto = ui.matMode === 'auto';
    const jobRecipeIds = Object.keys(CRAFT_RECIPES).filter(function (rid) { return CRAFT_RECIPES[rid].jobId === jobId && isTwRecipe(CRAFT_RECIPES[rid]); });
    const seenItem = {};
    function sumCost(recipe, resolve) {
      let cost = 0, crafted = 0;
      for (const ing of (recipe.ingredients || [])) {
        const c = resolve(ing.itemId);
        if (!c) return null;
        cost += c.cost * ing.amount;
        if (c.mode === 'craft') crafted++;
      }
      return { cost: cost, crafted: crafted };
    }
    jobRecipeIds.forEach(function (rid) {
      const recipe = CRAFT_RECIPES[rid];
      if (seenItem[recipe.itemId]) return; // 同一個成品有多個配方時只算第一個
      seenItem[recipe.itemId] = true;
      const sellRow = sellData.items[recipe.itemId];
      const unit = radarUnitPrice(sellRow, persp, basis);
      // 成品要「有在賣出」才有意義：只有掛單、近幾天完全沒成交的成品，賣得掉才是問題
      if (!unit || !(hotVelocity(sellRow, persp) > 0)) { skippedSell++; return; }
      const buy = sumCost(recipe, resolveBuy), auto = sumCost(recipe, resolveAuto);
      const chosen = useAuto ? auto : buy;
      if (!chosen) { skippedMat++; return; }
      const cost = chosen.cost, craftedN = useAuto ? chosen.crafted : 0;
      const yields = recipe.yields || 1;
      const sell = unit * yields;
      const profit = sell - cost;
      const P = sellRow[pIdx];
      rows.push({
        rid: rid, itemId: recipe.itemId, cost: cost, sell: sell, unit: unit, yields: yields, profit: profit, craftedN: craftedN,
        costBuy: buy ? buy.cost : null, costAuto: auto ? auto.cost : null,
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
      if (ui.profitOnly && !(r.profit > 0)) return false;
      return true;
    });
    list.sort(function (a, b) { return b[ui.sort] - a[ui.sort]; });
    return { list: list, total: rows.length, skippedMat: skippedMat, skippedSell: skippedSell };
  }

  function renderRadarShell() {
    const box = $('mk-pane-radar');
    const ui = { job: null, basis: 'listing', matMode: 'buy', sellScope: 'dc', persp: 'all', band: 'all', sort: 'profit', medianOnly: false, profitOnly: false, shown: 50, mode: 'pre' };
    // 即時掛單價（只在「掛單最低價」基準下用）：id -> { min, minN, minH, time }，材料用資料中心的、成品用成品範圍的
    const liveDc = {}, liveSell = {};
    const liveTried = {}; // 展開明細時已經補查過即時掛單價的道具（查過一次就不重複查）
    let liveToken = 0, liveRounds = 0, liveNote = '';
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
        row('材料成本', 'matMode', [['buy', '直接買'], ['auto', '自動選較便宜（買或自己做）']]) +
        row('成品範圍', 'sellScope', [['dc', '所有世界'], ['world', '我的世界']]) +
        row('成品視角', 'persp', HOT_UI_BTNS.persp) +
        row('價格帶', 'band', HOT_UI_BTNS.band) +
        row('排序', 'sort', RADAR_SORTS) +
        '<label class="market-hot-median"><input type="checkbox" id="mk-radar-median"> 只看成品賣速在「同價格帶」中位數以上的配方</label>' +
        '<label class="market-hot-median"><input type="checkbox" id="mk-radar-profit"> 只顯示有獲利的配方</label>' +
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
    /* 把已經查到的即時掛單價蓋到預先計算的資料上（只複製有被更新的那幾列，不動原資料） */
    function patchData(data, live) {
      const ids = Object.keys(live);
      if (!ids.length) return data;
      const items = Object.assign({}, data.items);
      ids.forEach(function (id) {
        const row = items[id] ? items[id].slice() : [0, 0, null, null, null, null, null, null, null];
        row[2] = live[id].min; row[7] = [live[id].minN, live[id].minH];
        items[id] = row;
      });
      return { items: items };
    }
    /* 前 50 名配方用到的道具：成品＋材料（自動模式再往下展開自己做的中間材料） */
    function idsForRows(rowsTop) {
      const prod = {}, mats = {};
      const byItem = ui.matMode === 'auto' ? getRecipesByItem() : null;
      function addTree(id, depth) {
        if (mats[id] || depth > 4 || Object.keys(mats).length > 500) return;
        mats[id] = true;
        if (byItem && byItem[id]) byItem[id].forEach(function (r) { (r.ingredients || []).forEach(function (ing) { addTree(ing.itemId, depth + 1); }); });
      }
      rowsTop.forEach(function (r) {
        prod[r.itemId] = true;
        (CRAFT_RECIPES[r.rid].ingredients || []).forEach(function (ing) { addTree(ing.itemId, 0); });
      });
      return { prod: Object.keys(prod).map(Number), mats: Object.keys(mats).map(Number) };
    }
    function liveFresh(store, id) { return store[id] && Date.now() - store[id].time < 5 * 60 * 1000; }
    /* 「前 50 名用即時掛單價更新」：預先計算的掛單價是最多一小時前的快照，
     * 這裡只針對畫面上排在前面的配方，去查它們的成品跟材料「現在」的掛單，更新後重算、重新排序。 */
    async function refreshLive(rowsTop) {
      if (ui.basis !== 'listing' || liveRounds >= 3 || !rowsTop.length) return;
      const st = MarketData.getSettings();
      const need = idsForRows(rowsTop);
      const sellIsDc = ui.sellScope === 'dc';
      const dcIds = need.mats.filter(function (id) { return !liveFresh(liveDc, id); }).concat(sellIsDc ? need.prod.filter(function (id) { return !liveFresh(liveDc, id) && need.mats.indexOf(id) === -1; }) : []);
      const sellIds = sellIsDc ? [] : need.prod.filter(function (id) { return !liveFresh(liveSell, id); });
      if (!dcIds.length && !sellIds.length) return;
      liveRounds++;
      const token = ++liveToken, myJob = ui.job;
      liveNote = '正在用即時掛單價更新前 ' + rowsTop.length + ' 名⋯';
      const noteEl = $('mk-radar-live'); if (noteEl) noteEl.textContent = liveNote;
      let dcRes = {}, sellRes = {};
      try {
        const rs = await Promise.all([
          dcIds.length ? MarketData.fetchListingsBatchForScope(dcIds, st.dcName) : {},
          sellIds.length ? MarketData.fetchListingsBatchForScope(sellIds, st.worldName) : {},
        ]);
        dcRes = rs[0]; sellRes = rs[1];
      } catch (e) { liveNote = '即時掛單價更新失敗，目前顯示的是預先計算的價格。'; const el = $('mk-radar-live'); if (el) el.textContent = liveNote; return; }
      if (token !== liveToken || myJob !== ui.job) return; // 使用者已經換了職業或又觸發了新的更新
      let stored = 0;
      function store(dest, res, ids) {
        ids.forEach(function (id) {
          const ls = res[id];
          if (!ls) return; // 這個道具沒查到（請求失敗），保留原本的價格
          stored++;
          const first = function (f) { const x = ls.find(f); return x ? x.pricePerUnit : null; };
          dest[id] = { min: ls.length ? ls[0].pricePerUnit : null, minN: first(function (l) { return !l.hq; }), minH: first(function (l) { return l.hq; }), time: Date.now() };
        });
      }
      store(liveDc, dcRes, dcIds); store(liveSell, sellRes, sellIds);
      if (!stored) { liveNote = '即時掛單價查詢沒有回傳資料，目前顯示的是預先計算的價格。'; const el = $('mk-radar-live'); if (el) el.textContent = liveNote; return; }
      const hh = new Date(); const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      liveNote = '已用即時掛單價更新前 ' + rowsTop.length + ' 名（' + pad(hh.getHours()) + ':' + pad(hh.getMinutes()) + '），名次以更新後為準。';
      renderPre();
    }
    function renderPre() {
      const body = $('mk-radar-body');
      const dcView = ui.basis === 'listing' ? patchData(pc.dc, liveDc) : pc.dc;
      const sellView = ui.basis === 'listing' ? (ui.sellScope === 'dc' ? dcView : patchData(pc.sell, liveSell)) : pc.sell;
      const res = computeRadarList(ui.job, ui, dcView, sellView);
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
      const radarMore = moreInfoButton();
      body.innerHTML =
        '<p class="craft-muted" style="margin-bottom:4px">符合 ' + res.list.length + ' 個配方（' + (res.skippedSell + res.skippedMat) + ' 個查無價格）。' + radarMore.html + '</p>' +
        (isListing ? '<p class="craft-muted" id="mk-radar-live" style="margin-bottom:4px">' + (liveNote || '') + '</p>' : '') +
        moreInfoList(radarMore.id, [
          '售價：成品' + (isListing ? '最低價' : '成交均價') + '（' + sellLabel + '，可切換）',
          '材料：全資料中心最低價（優先NQ，可跨世界買）',
          '材料成本：預設只算直接買；「自動選較便宜」會比較直接買和自己做',
          '未計入製作時間、買方稅、賣方稅',
          '淨利／次：做一次配方（可能不只1件）的總損益',
          isListing ? '掛單價為快照，最多約1小時前＋玩家回報延遲，僅供參考' : '成交均價取每個道具自己的長窗口均價（較高＝48小時、較低＝7天）',
          '最後更新：' + new Date(pc.meta.generatedAtMs).toLocaleString()
        ]) +
        '<div class="market-table-scroll market-radar-scroll"><table class="market-price-table"><thead><tr><th>淨利</th><th>投報率</th><th>成本</th><th>售價</th><th>賣速</th><th>物品</th></tr></thead><tbody>' +
        top.map(function (r) {
          const yieldNote = r.yields > 1 ? fmtGil(r.unit) + '金×' + r.yields : '';
          const otherNote = r.otherPrice != null ? (isListing ? '成交均價 ' : '最低掛單價 ') + fmtGil(r.otherPrice) + '金' : '';
          // 「直接買」跟「自己做」的比較：把兩個決策字眼本身標色，比較便宜（建議採用）的那個標綠色，
          // 自己做省太少的話時間成本可能不划算，所以「省得不多」的情況故意不特別推薦自己做。
          let craftNote = '';
          const BUY = '<span style="color:#4ade80">直接買</span>', CRAFT = '<span style="color:#4ade80">自己做</span>', BUY_DIM = '<span class="craft-muted">直接買</span>', CRAFT_DIM = '<span class="craft-muted">自己做</span>';
          if (r.costBuy != null && r.costAuto != null) {
            const save = r.costBuy - r.costAuto, pct = r.costBuy > 0 ? (save / r.costBuy) * 100 : 0;
            if (save <= 0.5) craftNote = BUY + '材料已經是最便宜的做法';
            else if (pct < 5) craftNote = BUY + '材料就好（' + CRAFT_DIM + '只省 ' + fmtGil(save) + ' 金・' + pct.toFixed(1) + '%，不划算）';
            else craftNote = CRAFT + '省 ' + fmtGil(save) + ' 金（' + pct.toFixed(1) + '%）' + (ui.matMode === 'auto' && r.craftedN ? '，已套用（' + r.craftedN + ' 項）' : '');
          } else if (r.costBuy == null && r.costAuto != null) craftNote = '有些材料市場上沒有人賣，只能' + CRAFT + '（成本 ' + fmtGil(r.costAuto) + ' 金）';
          const trendColor = r.change >= 0 ? '#4ade80' : '#f87171';
          const trendNote = r.P ? windowCoverageLabel(r.P) + '・漲跌 <span style="color:' + trendColor + '">' + (r.change >= 0 ? '+' : '') + r.change.toFixed(1) + '%</span>' : '成交筆數太少，沒有漲跌';
          const hasBreakdown = (CRAFT_RECIPES[r.rid].ingredients || []).length > 0;
          const expandBtn = hasBreakdown ? ' <button type="button" class="market-radar-expand" data-mk-radar-expand="' + r.rid + '" data-item="' + r.itemId + '">▸ 材料明細</button>' : '';
          const note = [yieldNote, craftNote, otherNote, trendNote].filter(Boolean).join('　·　');
          return '<tr data-mk-radar-item="' + r.itemId + '" class="market-hot-item" style="cursor:pointer"><td style="color:' + (r.profit >= 0 ? '#4ade80' : '#f87171') + '">' + (r.profit >= 0 ? '+' : '') + fmtGil(r.profit) + '金</td>' +
            '<td style="color:' + (r.roi >= 0 ? '#4ade80' : '#f87171') + '">' + (r.roi >= 0 ? '+' : '') + r.roi.toFixed(0) + '%</td><td>' + fmtGil(r.cost) + '金</td><td>' + fmtGil(r.sell) + '金</td><td>' + r.vel.toFixed(1) + '/天</td>' +
            '<td>' + (ITEM_NAMES_TW_ALL[r.itemId] || r.itemId) + expandBtn + '<div class="craft-muted" style="font-size:10px">' + note + '</div></td></tr>' +
            '<tr class="market-radar-detail-row" data-mk-radar-detail="' + r.rid + '" style="display:none"><td colspan="6"></td></tr>';
        }).join('') + '</tbody></table></div>' +
        (res.list.length > top.length ? '<button type="button" class="market-history-btn" id="mk-radar-more" style="margin-top:8px">顯示更多（還有 ' + (res.list.length - top.length) + ' 個）</button>' : '');
      bindMoreInfoToggles(body);
      body.querySelectorAll('[data-mk-radar-item]').forEach(function (tr) { tr.addEventListener('click', function () { openItemDetail(tr.dataset.mkRadarItem); }); });
      // 展開明細：先用手上的資料畫出來；如果有材料沒有價格（預先計算資料沒收錄），再去查即時掛單價補上、重畫一次
      function currentDcView() { return ui.basis === 'listing' ? patchData(pc.dc, liveDc) : pc.dc; }
      async function fillBreakdown(td, itemId, depth, allowFetch) {
        const bd = materialBreakdown(itemId, currentDcView(), ui.basis);
        td.innerHTML = renderBreakdownHtml(bd, depth);
        if (!allowFetch || !bd || ui.basis !== 'listing') return;
        const need = [];
        bd.rows.forEach(function (r) {
          if (r.buy == null) need.push(r.itemId);
          (r.missing || []).forEach(function (id) { need.push(id); });
        });
        const ids = need.filter(function (id, i) { return need.indexOf(id) === i && !liveFresh(liveDc, id) && !liveTried[id]; });
        if (!ids.length) return;
        ids.forEach(function (id) { liveTried[id] = true; });
        const st = MarketData.getSettings();
        let res = {};
        try { res = await MarketData.fetchListingsBatchForScope(ids, st.dcName); } catch (e) { return; }
        let got = 0;
        ids.forEach(function (id) {
          const ls = res[id];
          if (!ls || !ls.length) return; // 查不到或真的沒有掛單：不覆蓋任何資料
          got++;
          const first = function (f) { const x = ls.find(f); return x ? x.pricePerUnit : null; };
          liveDc[id] = { min: ls[0].pricePerUnit, minN: first(function (l) { return !l.hq; }), minH: first(function (l) { return l.hq; }), time: Date.now() };
        });
        if (got && td.isConnected) await fillBreakdown(td, itemId, depth, false);
      }
      /* 第5點：展開材料明細時，把「▾ 收起明細」那一列釘在表頭下方（跟表頭一樣是 position:sticky），
       * 往下捲動看明細內容時，這一列會一直貼在螢幕（或捲動區）最上緣，隨時點得到，不用捲回頂部。
       * 只有最外層（這裡）做 sticky，材料明細裡巢狀展開的部分不做，維持原本自然往下長的方式。
       * 貼的位置（top）跟表頭高度都寫死同一個CSS數字（見 page-market.css 的 .market-radar-scroll thead th
       * 和 .market-hot-item-sticky）。欄名已經精簡成很短的字（淨利/投報率/成本/售價/賣速/物品），不管手機
       * 或電腦正常都不會被擠到換行，表頭高度很穩定，寫死比用JS現場量測更可靠、也更簡單。 */
      body.querySelectorAll('[data-mk-radar-expand]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation(); // 不要順便觸發那一列的「打開物品詳情」
          const rid = btn.dataset.mkRadarExpand;
          const detailRow = body.querySelector('[data-mk-radar-detail="' + rid + '"]');
          const itemRow = btn.closest('tr');
          if (!detailRow) return;
          const showing = detailRow.style.display !== 'none';
          if (showing) {
            detailRow.style.display = 'none'; btn.textContent = '▸ 材料明細';
            if (itemRow) itemRow.classList.remove('market-hot-item-sticky');

            return;
          }
          if (!detailRow.dataset.built) {
            fillBreakdown(detailRow.querySelector('td'), Number(btn.dataset.item), 0, true);
            detailRow.dataset.built = '1';
          }
          detailRow.style.display = '';
          btn.textContent = '▾ 收起明細';
          if (itemRow) itemRow.classList.add('market-hot-item-sticky');
        });
      });
      // 巢狀展開（材料明細裡，某項材料自己也能製作，再往下看一層）：用事件代理，因為這些列是動態插入的
      body.querySelectorAll('.market-radar-detail-row').forEach(function (detailRow) {
        detailRow.addEventListener('click', function (e) {
          const matRow = e.target.closest('tr.market-radar-mat-row.is-expandable');
          if (!matRow || !detailRow.contains(matRow)) return;
          const t = matRow.querySelector('[data-mat-toggle]');
          const nested = matRow.nextElementSibling; // 展開內容固定是這一列的下一列
          if (!t || !nested || !nested.classList.contains('market-radar-mat-nested')) return;
          const keyParts = t.dataset.matToggle.split('-'); // "<itemId>-<depth>"
          const itemId = Number(keyParts[0]), depth = Number(keyParts[1]);
          const showing = nested.style.display !== 'none';
          if (showing) { nested.style.display = 'none'; t.textContent = '▸'; return; }
          if (!nested.dataset.built) {
            fillBreakdown(nested.querySelector('td'), itemId, depth + 1, true);
            nested.dataset.built = '1';
          }
          nested.style.display = '';
          t.textContent = '▾';
        });
      });
      const more = $('mk-radar-more'); if (more) more.addEventListener('click', function () { ui.shown += 50; renderPre(); });
      refreshLive(res.list.slice(0, 50));
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
      if (jb) { ui.job = parseInt(jb.dataset.mkRadarJob, 10); ui.shown = 50; liveRounds = 0; sync(); if (ui.mode === 'live') runRadarScan(ui.job); else show(); return; }
      const fb = e.target.closest('[data-rk]');
      if (fb) {
        const v = fb.dataset.rv; ui[fb.dataset.rk] = v; ui.shown = 50; liveRounds = 0; sync();
        if (fb.dataset.rk === 'sellScope') show(); else if (pc && ui.mode === 'pre') renderPre();
      }
    });
    $('mk-radar-median').addEventListener('change', function () { ui.medianOnly = this.checked; ui.shown = 50; liveRounds = 0; if (pc && ui.mode === 'pre') renderPre(); });
    $('mk-radar-profit').addEventListener('change', function () { ui.profitOnly = this.checked; ui.shown = 50; liveRounds = 0; if (pc && ui.mode === 'pre') renderPre(); });
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
      body.innerHTML = '<p class="craft-muted">製作商機需要先設定「我的世界」（成本用整個資料中心估、賣價要看你自己世界的掛單），點右上角設定後再試。</p>';
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

  /* ── 熱度排行：跟製作商機不一樣，範圍不侷限在「能製作的東西」——候選清單來自Universalis的
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
    { key: 'txnFreq', label: '成交頻率', fmt: function (v) { return v.toFixed(2) + ' 筆/天'; }, hint: '' },
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
  /* 窗口說明：不寫「24/48小時」這種配對，直接說「48小時內40筆成交」——用長窗口的時間範圍和筆數，
   * 一般玩家不需要理解「兩個窗口比較」的機制，只要知道「這個均價是根據多少筆、多長時間內的成交算的」。 */
  function windowCoverageLabel(P) {
    const span = P[0] === 1 ? '48小時內' : (P[0] === 2 ? '7天內' : '30天內');
    return span + P[3] + '筆成交';
  }
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
  /* 常駐只留「這次結果的統計數字」，規則細節（分級門檻、價格基準等）收進這個可以展開的列點區，
   * 文字內容不刪減，只是預設收起、不佔畫面。每次都預設收合，不記狀態。
   * moreInfoButton 只回傳按鈕本身，接在既有那句話的句尾，不另外佔一行；moreInfoList 回傳實際的列點內容，
   * 放在按鈕所在的那個段落之後即可（兩者用同一個id串起來）。 */
  let moreInfoSeq = 0;
  function moreInfoButton() {
    const id = 'mk-more-' + (moreInfoSeq++);
    return { id: id, html: ' <button type="button" class="market-more-info-btn" data-more-toggle="' + id + '" aria-expanded="false" title="更多說明"><i class="ph ph-info"></i> 更多說明</button>' };
  }
  function moreInfoList(id, bullets) {
    return '<ul class="market-more-info-list" id="' + id + '" style="display:none">' +
        bullets.map(function (b) { return '<li>' + b + '</li>'; }).join('') +
      '</ul>';
  }
  function bindMoreInfoToggles(root) {
    root.querySelectorAll('[data-more-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const list = document.getElementById(btn.dataset.moreToggle);
        if (!list) return;
        const showing = list.style.display !== 'none';
        list.style.display = showing ? 'none' : '';
        btn.setAttribute('aria-expanded', showing ? 'false' : 'true');
        btn.classList.toggle('is-open', !showing);
      });
    });
  }

  /* 依目前的篩選條件，從資料裡算出要顯示的清單（純計算，不碰畫面） */
  /* 成交稀少：這個視角下湊不出足夠成交筆數（算不出漲跌）的道具，列出最近一筆成交價跟目前最低掛單價 */
  const HOT_TIER_DAYS = { 1: 2, 2: 7, 3: 30 }; // 每天成交額：窗口天數（賣速高＝48小時＝2天，賣速中＝7天，成交稀少＝30天）
  function computeHotList(data, ui) {
    const pIdx = HOT_PERSP_IDX[ui.persp];
    const tier = ui.freq === 'high' ? 1 : (ui.freq === 'low' ? 2 : 3);
    const universe = [];
    let cntHigh = 0, cntLow = 0, cntRare = 0, cntNone = 0;
    Object.keys(data.items).forEach(function (id) {
      const r = data.items[id];
      const vel = hotVelocity(r, ui.persp);
      const P = r[pIdx];
      if (P) { if (P[0] === 1) cntHigh++; else if (P[0] === 2) cntLow++; else cntRare++; } else if (vel > 0) cntNone++;
      let e = { id: id, vel: vel, P: P, minP: r[2], nqV: r[0], hqV: r[1] };
      if (ui.metric === 'velocity') {
        if (vel <= 0) return;
        e.price = P ? P[4] : (r[2] != null ? r[2] : null); e.value = vel;
      } else {
        if (!P || P[0] !== tier) return; // 這個道具不屬於目前選的頻率級距
        e.price = P[4];
        e.value = ui.metric === 'changePct' ? ((P[2] - P[4]) / P[4]) * 100
          : ui.metric === 'txnFreq' ? P[3] / HOT_TIER_DAYS[P[0]] // 成交頻率：這個窗口內「幾筆成交」除以天數（次數/天），不是數量也不是金額
          : P[5] / HOT_TIER_DAYS[P[0]];
      }
      e.band = hotBandIndex(e.price);
      universe.push(e);
    });
    // 同價格帶的賣速中位數（用「符合指標與頻率」的全部道具算，不受看漲／看跌影響）
    const byBand = {};
    universe.forEach(function (e) { (byBand[e.band] = byBand[e.band] || []).push(e.vel); });
    const medians = {};
    Object.keys(byBand).forEach(function (b) { medians[b] = hotMedian(byBand[b]); });
    // 先套價格帶／中位數篩選，最後才套「方向」——這樣才知道有多少項是「只因為方向被排除」的
    const preList = universe.filter(function (e) {
      if (ui.band !== 'all') { const bi = HOT_BANDS.findIndex(function (b) { return b.key === ui.band; }); if (e.band !== bi) return false; }
      if (ui.medianOnly && e.vel < (medians[e.band] || 0)) return false;
      return true;
    });
    // 方向依「畫面上顯示的一位小數」判斷：顯示 0.0% 的就是持平。
    // 舊寫法「看漲＝大於0、看跌＝小於0」會讓漲跌剛好是 0 的道具（例如高價品、成交價每次都一樣）兩邊都不出現。
    function dirOf(e) { const r1 = Math.round(e.value * 10) / 10; return r1 > 0 ? 'up' : (r1 < 0 ? 'down' : 'flat'); }
    let list = preList, flatHidden = 0;
    if (ui.metric === 'changePct' && ui.dir !== 'all') {
      list = preList.filter(function (e) { return dirOf(e) === ui.dir; });
      if (ui.dir !== 'flat') flatHidden = preList.filter(function (e) { return dirOf(e) === 'flat'; }).length;
    }
    const asc = ui.metric === 'changePct' && ui.dir === 'down';
    const byAbs = ui.metric === 'changePct' && ui.dir === 'all';
    list = list.slice().sort(function (a, b) { return byAbs ? Math.abs(b.value) - Math.abs(a.value) : (asc ? a.value - b.value : b.value - a.value); });
    return { list: list, total: universe.length, cntHigh: cntHigh, cntLow: cntLow, cntRare: cntRare, cntNone: cntNone, flatHidden: flatHidden };
  }

  const HOT_UI_BTNS = {
    metric: [['changePct', '漲跌幅度'], ['velocity', '賣速'], ['turnover', '每日成交額'], ['txnFreq', '成交頻率']],
    persp: [['all', '全部（NQ+HQ）'], ['nq', 'NQ'], ['hq', 'HQ']],
    freq: [['high', '較高'], ['low', '一般'], ['rare', '較低']],
    dir: [['all', '全部'], ['up', '看漲'], ['down', '看跌'], ['flat', '持平']],
    band: HOT_BANDS.map(function (b) { return [b.key, b.label]; }),
  };
  const HOT_METRIC_HINTS = {
    changePct: '短期動能：均價比稍早貴或便宜多少。',
    velocity: '流動性：每天賣出幾件（跟「成交頻率」看的次數不同）。',
    turnover: '市場規模：每天成交的總金額。',
    txnFreq: '成交次數：平均每天成交幾筆（不看數量或金額）。',
    rare: '成交太少、湊不出足夠的成交筆數算漲跌的道具（多半是高價、很久才賣出一件的東西）。這裡列出它們「最近一筆成交價」和「目前最低掛單價」，讓你仍然找得到它們。',
  };

  /* 代幣兌換分頁：獨立的查詢入口，不掛在單一物品詳情頁底下——這類代幣（詩學、軍票、巧手票…）
   * 玩家通常是「手上有一批，想知道拿去換什麼最划算」，不是先想到某個特定物品才點進去看。
   * 預設只顯示清單（圖示/名稱/能換幾種），點下去才載入排行榜內容，避免一次全部展開。 */
  async function renderTokensShell() {
    const pane = $('mk-pane-tokens');
    pane.innerHTML = '<p class="craft-muted">讀取代幣資料中⋯</p>';
    const ok = await ensureShopsDataLoaded();
    if (!ok) { pane.innerHTML = '<p class="craft-muted">代幣資料載入失敗，稍後再試。</p>'; return; }
    const list = buildCurrencyDirectory();
    // 第5點修正：內容包進 market-pane-scrollbody，不然外層 .market-pane 是 overflow:hidden，
    // 清單一長就整個被裁掉、完全不能捲動，其他分頁都有包這層、唯獨這裡漏了。
    pane.innerHTML = '<p class="craft-muted market-pane-fixed" style="margin-bottom:8px">手上這批代幣該換什麼最划算？選一個代幣看排行。</p>' +
      '<input type="text" id="mk-token-search" class="craft-search market-pane-fixed" placeholder="搜尋代幣名稱⋯" style="width:100%;margin-bottom:8px">' +
      '<div class="market-pane-scrollbody"><div class="market-token-list" id="mk-token-list"></div></div>';
    function renderList(filter) {
      const box = $('mk-token-list');
      const kw = (filter || '').trim();
      const rows = kw ? list.filter(function (x) { return x.name.indexOf(kw) !== -1; }) : list;
      if (!rows.length) { box.innerHTML = '<p class="craft-muted">沒有符合的代幣。</p>'; return; }
      box.innerHTML = rows.map(function (x) {
        return '<div class="market-token-row" data-token-id="' + x.id + '">' +
          '<button type="button" class="market-token-head" data-token-toggle="' + x.id + '">' +
            '<i class="ph ph-caret-right"></i>' + itemIconHtml(x.id, 24) +
            '<span class="market-token-name">' + x.name + '</span>' +
            '<span class="craft-muted market-token-count">可換 ' + x.count + ' 種</span>' +
          '</button>' +
          '<div class="market-token-body" id="mk-token-body-' + x.id + '" style="display:none"></div>' +
        '</div>';
      }).join('');
    }
    renderList('');
    $('mk-token-search').addEventListener('input', function () { renderList(this.value); });
    const TOKEN_SORTS = [['net', '市價'], ['vel', '賣速'], ['txnFreq', '成交頻率']];
    pane.addEventListener('click', async function (e) {
      const sortBtn = e.target.closest('[data-token-sort]');
      if (sortBtn) {
        const body = sortBtn.closest('.market-token-body');
        body.dataset.sort = sortBtn.dataset.tokenSort;
        body.dataset.loaded = ''; // 強制重新排序渲染
        renderTokenBody(body, body.dataset.tokenId);
        return;
      }
      const t = e.target.closest('[data-token-toggle]');
      if (!t) return;
      const id = t.dataset.tokenToggle;
      const body = $('mk-token-body-' + id);
      body.dataset.tokenId = id;
      const open = body.style.display !== 'none';
      t.querySelector('.ph').className = open ? 'ph ph-caret-right' : 'ph ph-caret-down';
      body.style.display = open ? 'none' : 'block';
      if (open || body.dataset.loaded) return;
      renderTokenBody(body, id);
    });
    async function renderTokenBody(body, id) {
      body.dataset.loaded = '1';
      body.innerHTML = '<p class="craft-muted">讀取排行中⋯</p>';
      const settings = getSupplySettings();
      const dcData = await getPrecomputedAllData();
      if (!dcData) { body.innerHTML = '<p class="craft-muted">目前沒有可用的市場快照資料，暫時無法算出排行。</p>'; return; }
      const sortKey = body.dataset.sort || 'net';
      const best = buildCurrencyBestUses(id, dcData, settings.materialsBasis, 20, sortKey);
      if (!best.length) { body.innerHTML = '<p class="craft-muted">找不到可以公平比較的兌換對象（可能是關聯的道具都缺乏市場行情）。</p>'; return; }
      const sortTabsHtml = '<div class="market-token-sort-tabs">' + TOKEN_SORTS.map(function (s) {
        return '<button type="button" class="market-token-sort-btn' + (s[0] === sortKey ? ' active' : '') + '" data-token-sort="' + s[0] + '">' + s[1] + '</button>';
      }).join('') + '</div>';
      // 排序指標決定順序，但三個指標的數字都要秀出來（不是只秀排序用的那個），不然玩家
      // 換個排序方式，想比較「市價雖然低但賣速快」這種取捨時，看不到另外兩個數字沒辦法比較。
      body.innerHTML = sortTabsHtml + best.map(function (r, i) {
        const first = r.resultItems[0];
        const label = r.resultItems.map(function (x) { return (ITEM_NAMES_TW_ALL[x[0]] || ('#' + x[0])) + (x[1] > 1 ? '×' + x[1] : ''); }).join('＋');
        // 「每1[這個代幣的小圖示]≈金額」：用代幣自己的圖示＋數字1，明確表達這是換算一個單位的等值，
        // 不是這個成品本身的市場售價；賣速/頻率補回單位，不然看數字猜不出是以天算還是以次算。
        const metricsHtml = '<span class="market-token-metric' + (sortKey === 'net' ? ' active' : '') + '">每1' + itemIconHtml(id, 13) + '≈' + (Math.abs(r.net) < 10 ? r.net.toFixed(1) : Math.round(r.net).toLocaleString()) + '</span>' +
          '<span class="market-token-metric' + (sortKey === 'vel' ? ' active' : '') + '">賣速 ' + r.vel.toFixed(1) + ' 件/天</span>' +
          '<span class="market-token-metric' + (sortKey === 'txnFreq' ? ' active' : '') + '">頻率 ' + r.txnFreq.toFixed(2) + ' 筆/天</span>';
        // 🔗＝這個物品本身不可交易，淨值是追查它能再換到什麼有市場價的東西才算出來的，
        // 不是這個物品自己的市場價——用一個小圖示標出來，不然玩家點進去查這個物品會發現沒有市場價、
        // 覺得數字是編的；滑鼠停留可以看到追查到哪個最終物品。
        // 鏈式結果：🔗後面接終點物品的小圖示（例如神秘原石 🔗[土壤圖示]），不用文字就看得出
        // 「這個中繼物品最後換成什麼才有價值」；停留可看終點名稱。
        const endName = r.chainEnd != null ? (ITEM_NAMES_TW_ALL[r.chainEnd] || r.chainEnd) : '';
        const chainTag = r.viaChain ? '<span class="market-token-chain-tag" title="此物品不可交易，數值為再兌換成「' + endName + '」後的市價">🔗' + (r.chainEnd != null ? itemIconHtml(r.chainEnd, 16) : '') + '</span>' : '';
        return '<button type="button" class="market-obtain-best-row market-token-best-row" data-mk-goto-item="' + first[0] + '">' +
          '<span class="market-obtain-best-rank">' + (i + 1) + '</span>' +
          itemIconHtml(first[0], 22) +
          '<span class="market-obtain-best-name">' + label + chainTag + '</span>' +
          '<span class="market-token-metrics">' + metricsHtml + '</span>' +
        '</button>';
      }).join('');
      body.querySelectorAll('[data-mk-goto-item]').forEach(function (el) {
        el.addEventListener('click', function () { openItemDetail(el.dataset.mkGotoItem); });
      });
    }
  }

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
        '<p class="craft-muted market-hot-scope-note"><strong>提醒：</strong>只能在自己的世界掛賣，「所有世界」僅供參考。</p>' +
        btnRow('指標', 'metric', 'mk-hf-metric') +
        '<div id="mk-hot-filters">' +
          btnRow('視角', 'persp', 'mk-hf-persp') + btnRow('成交頻率', 'freq', 'mk-hf-freq') + btnRow('方向', 'dir', 'mk-hf-dir') + btnRow('價格帶', 'band', 'mk-hf-band') +
          '<label class="market-hot-median" id="mk-hot-median-label"><input type="checkbox" id="mk-hot-median"> 只看賣速在「同價格帶」中位數以上的道具（成交冷清的先排除）</label>' +
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
      $('mk-hf-freq').style.display = pre && (ui.metric === 'changePct' || ui.metric === 'turnover') ? '' : 'none';
      $('mk-hf-dir').style.display = pre && ui.metric === 'changePct' ? '' : 'none';
      // 即時掃描只有「漲跌幅度」「賣速」兩種指標，也沒有「成交稀少」這個賣速級距
      const turn = box.querySelector('[data-hk="metric"][data-hv="turnover"]');
      if (turn) turn.style.display = pre ? '' : 'none';
      const rareBtn = box.querySelector('[data-hk="freq"][data-hv="rare"]');
      if (rareBtn) rareBtn.style.display = pre ? '' : 'none';
      const mb = box.querySelector('#mk-hf-metric'); if (mb) mb.title = HOT_METRIC_HINTS[ui.metric] || '';
    }
    function setStatus(html) { const el = $('mk-hot-status'); el.innerHTML = html || ''; el.style.display = html ? '' : 'none'; }

    function enterLive(noteHtml) {
      ui.mode = 'live';
      if (ui.metric === 'turnover') ui.metric = 'changePct';
      if (ui.freq === 'rare') ui.freq = 'high';
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
        body.innerHTML = '<p class="craft-muted">目前的篩選條件下沒有符合的道具（符合指標與頻率的共 ' + res.total + ' 項）。' +
          (res.flatHidden ? '其中有 ' + res.flatHidden + ' 項漲跌幅是 0.0%（持平），沒有被算進看漲或看跌，可以把「方向」切到「持平」或「全部」。' : '') +
          '可以放寬價格帶，或換個視角、成交頻率級距試試。</p>';
        return;
      }
      const maxVal = Math.max.apply(null, top.map(function (e) { return Math.abs(e.value); })) || 1;
      const hotMore = moreInfoButton();
            body.innerHTML =
        '<p class="craft-muted" style="margin-bottom:6px">' + HOT_METRIC_HINTS[ui.metric] + '</p>' +
        '<p class="craft-muted" style="margin-bottom:4px">符合 ' + res.list.length.toLocaleString() + ' 項（頻率：較高' + res.cntHigh + '／一般' + res.cntLow + '／較低' + res.cntRare + '／太少' + res.cntNone + '）。' + hotMore.html + '</p>' +
        moreInfoList(hotMore.id, [
          '資料來源：Universalis成交紀錄，每小時更新（陸行鳥全部可交易道具，有成交才列入）',
          '漲跌：短窗口對長窗口成交均價（都從現在算起）；看漲／看跌不含漲跌幅剛好0.0%（持平）的道具',
          '頻率分級：較高24小時／48小時、一般3天／7天、較低7天／30天；各自門檻至少3筆／5筆成交，不夠會試下一級或算「太少」',
          '賣速只作參考，不影響頻率分級',
          '價格帶依長窗口均價分；綠色數字為掛單最低價，可能已變動，僅供參考',
          '最後更新：' + generated.toLocaleString()
        ]) +
        '<div class="market-hot-list">' +
          top.map(function (e, i) {
            const v = e.value;
            const barPct = Math.max(4, Math.round((Math.log(Math.abs(v) + 1) / Math.log(maxVal + 1)) * 100));
            const barColor = v >= 0 ? '#c5a059' : '#f87171';
            // 第1、2點：賣速、每日成交額這兩個指標，本來就有算好的價格漲跌（跟「漲跌幅度」指標是同一套算法），
            // 只是原本沒有拿出來顯示；這裡不管選哪個指標，只要有P資料，都順便把價格漲跌標出來，方便對照。
            function priceChangeTxt(P) {
              if (!P || !P[4]) return '';
              const pct = ((P[2] - P[4]) / P[4]) * 100;
              const r1 = Math.round(pct * 10) / 10;
              const arrow = r1 > 0 ? '▲' : (r1 < 0 ? '▼' : '－');
              const cls = r1 > 0 ? 'market-hot-pricechg-up' : (r1 < 0 ? 'market-hot-pricechg-down' : '');
              return '<span class="' + cls + '">' + arrow + Math.abs(r1).toFixed(1) + '%</span>';
            }
            let sub = '';
            if (ui.metric === 'changePct') sub = '均價 ' + fmtGil(e.P[4]) + '→' + fmtGil(e.P[2]) + '（' + windowCoverageLabel(e.P) + '）　賣速 ' + e.vel.toFixed(1) + '/天';
            else if (ui.metric === 'velocity') sub = 'NQ ' + e.nqV.toFixed(1) + '　HQ ' + e.hqV.toFixed(1) + (e.P ? '　均價 ' + fmtGil(e.P[4]) + '　' + priceChangeTxt(e.P) : '');
            else sub = '均價 ' + fmtGil(e.P[4]) + '（' + windowCoverageLabel(e.P) + '）　' + priceChangeTxt(e.P) + '　賣速 ' + e.vel.toFixed(1) + '/天';
            return '<div class="market-hot-item" data-mk-hot-item="' + e.id + '"><div class="market-hot-row">' +
              '<span class="market-hot-rank">' + (i + 1) + '</span>' + itemIconHtml(e.id, 30) +
              '<span class="market-hot-name">' + (ITEM_NAMES_TW_ALL[e.id] || ('#' + e.id)) + (e.minP != null ? '<span class="market-hot-price" title="掛單資料要等玩家上傳才更新，可能已變動；只供參考，不參與任何計算">' + fmtGil(e.minP) + '金</span>' : '') + '</span>' +
              '<div class="market-hot-bar-track"><div class="market-hot-bar" style="width:' + barPct + '%;background:' + barColor + '"></div></div>' +
              '<span class="market-hot-value" style="color:' + barColor + '">' + metricDef.fmt(v) + '</span>' +
            '</div><div class="market-hot-subline">' + sub + '</div></div>';
          }).join('') +
        '</div>' +
        (res.list.length > top.length ? '<button type="button" class="market-history-btn" id="mk-hot-more" style="margin-top:8px">顯示更多（還有 ' + (res.list.length - top.length).toLocaleString() + ' 項）</button>' : '');
      bindMoreInfoToggles(body);
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
