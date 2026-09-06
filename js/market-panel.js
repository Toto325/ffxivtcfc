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
      '<div class="market-header">' +
        '<h2 class="unified-gold-header small">⚖ 市場</h2>' +
        '<p class="elegant-body-text page-note">查詢單一物品的即時價格、跨服比價與供應鏈，或看看最近交易熱度排行。</p>' +
      '</div>' +
      '<div class="market-searchbar">' +
        '<div class="market-search-box">' +
          '<input id="mk-search" class="craft-search" placeholder="搜尋物品名稱⋯" autocomplete="off" />' +
          '<div id="mk-search-results" class="craft-search-results"></div>' +
        '</div>' +
        '<button type="button" id="mk-settings-btn" class="craft-mat-worlds-icon" style="width:auto;padding:0 10px;gap:6px" title="設定資料中心／我的世界">' +
          '<i class="ph ph-gear"></i><span id="mk-settings-summary" class="market-settings-text">尚未設定市場資訊</span>' +
        '</button>' +
      '</div>' +
      '<div class="market-recent-row" id="mk-recent-row"></div>' +
      '<div id="mk-watchlist-panel" class="market-watchlist-panel"></div>' +
      '<div class="market-tabs">' +
        '<button type="button" class="craft-tab-btn active" data-mk-tab="item">物品查詢</button>' +
        '<button type="button" class="craft-tab-btn" data-mk-tab="radar">機會雷達</button>' +
      '</div>' +
      '<div id="mk-pane-item" class="market-pane">' +
        '<p class="craft-muted">搜尋一個物品開始查詢——即時價格、跨服比價、銷售速度，如果是可製作品還會顯示完整供應鏈。</p>' +
      '</div>' +
      '<div id="mk-pane-radar" class="market-pane" style="display:none"></div>';

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
      // 先掃過全部符合的再排序，不要一湊滿30筆就提早跳出——早跳出會鎖死在「掃描順序」上，
      // 不保證真的是ID最小的前30筆。物品ID用數字排序（字串排序會把"9"排在"10"後面，是錯的）。
      for (let i = 0; i < ids.length; i++) {
        const name = ITEM_NAMES_TW_ALL[ids[i]];
        if (name && name.indexOf(q) !== -1) matches.push({ id: ids[i], name: name });
      }
      matches.sort(function (a, b) { return Number(a.id) - Number(b.id); });
      matches.length = Math.min(matches.length, 30);
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
      list = list.slice(0, 12);
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
        '<div id="mk-detail-supply" class="market-detail-section market-col-supply"></div>' +
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
   * 設計刻意簡單：只畫價格隨時間的走勢＋NQ/HQ用顏色區分，沒有座標軸刻度那些視覺雜訊，
   * 滑鼠移到點上用原生title看到實際金額跟時間，重點是「一眼看出漲跌方向」，不是精算圖表。 */
  function renderTrendChart(history) {
    if (!history || history.length < 2) return '';
    const pts = history.slice(0, 30).slice().reverse(); // 由舊到新，由左到右畫
    const W = 560, H = 120, PAD = 8;
    const prices = pts.map(function (h) { return h.pricePerUnit; });
    const min = Math.min.apply(null, prices), max = Math.max.apply(null, prices);
    const range = (max - min) || 1;
    function xy(i, p) {
      const x = PAD + (i / (pts.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((p - min) / range) * (H - PAD * 2);
      return { x: x, y: y };
    }
    const linePath = pts.map(function (h, i) {
      const p = xy(i, h.pricePerUnit);
      return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1);
    }).join(' ');
    const dots = pts.map(function (h, i) {
      const p = xy(i, h.pricePerUnit);
      const when = new Date(h.timestamp * 1000).toLocaleDateString();
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.6" fill="' + (h.hq ? '#fcf6ba' : '#8fb3ff') + '"><title>' + h.pricePerUnit.toLocaleString() + '金' + (h.hq ? '（HQ）' : '') + ' · ' + when + '</title></circle>';
    }).join('');
    return '<div class="market-trend-chart">' +
      '<p class="market-subheading">近期成交走勢<span class="craft-muted">（藍=NQ 金=HQ，滑鼠移到點上看細節）</span></p>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="market-trend-svg">' +
        '<path d="' + linePath + '" fill="none" stroke="#c5a059" stroke-width="1.5" opacity="0.8"/>' + dots +
      '</svg></div>';
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
      footNotes.push('貼最低價在' + taxInfo.cityName + '寄售（稅率最低，扣' + (Math.round(taxInfo.ratePercent * 10) / 10) + '%）約拿 ' + netMin.toLocaleString() + ' 金');
    }
    if (overview && overview.lastUploadTime) footNotes.push('資料更新於 ' + timeAgo(overview.lastUploadTime / 1000));

    if (badgeParts.length) html += '<div class="market-stat-bar">' + badgeParts.join('') + '</div>';
    if (footNotes.length) html += '<p class="market-stat-foot craft-muted">' + footNotes.join('　·　') + '</p>';
    if (overview && overview.history && overview.history.length >= 2) html += renderTrendChart(overview.history);

    if (!overview || !overview.listings.length) {
      html += '<p class="craft-muted">目前查無掛單（可能沒有人在賣）</p>';
      box.innerHTML = html;
      return;
    }

    // 全部掛單攤開來，不再只留每個世界最低那一筆——這才是玩家判斷「市場厚不厚」需要的資訊量
    // 欄位順序：金額是市場頁最重要的主體，放第一欄；數量緊接在金額旁邊，兩者放一起才有代表性
    // （「多少錢」單獨看意義不大，要搭配「還有幾件」才知道這個價位能不能吃得下）；
    // 世界跟品質是次要的補充資訊，往後放。
    html += '<p class="market-subheading">目前掛單（共 ' + overview.listings.length + ' 筆） ' +
      '<button type="button" class="market-history-btn" data-mk-open-history="1">查看最近成交紀錄</button></p>' +
      '<div class="market-table-scroll"><table class="market-price-table"><thead><tr><th>單價</th><th>數量</th><th>世界</th></tr></thead><tbody>' +
      overview.listings.map(function (l) {
        // 第2點：拿掉獨立的品質欄，改成用遊戲裡熟悉的小星星符號標在單價後面——有符號=HQ，沒有=NQ，
        // 資訊沒有少，但少一整欄，橫向空間更省，也更貼近玩家在遊戲介面裡看慣的樣子。
        return '<tr><td>' + l.pricePerUnit.toLocaleString() + '金' + (l.hq ? ' <i class="market-hq-icon" title="HQ"></i>' : '') + '</td><td>' + l.quantity.toLocaleString() + '</td><td>' + l.world + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    box.innerHTML = html;

    const historyBtn = box.querySelector('[data-mk-open-history]');
    if (historyBtn) {
      historyBtn.addEventListener('click', function () { openHistoryModal(itemId, overview.history); });
    }
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
          return '<tr><td>' + h.pricePerUnit.toLocaleString() + '金' + (h.hq ? ' <i class="market-hq-icon" title="HQ"></i>' : '') + '</td><td>' + h.quantity.toLocaleString() + '</td><td>' + h.world + '</td><td class="craft-muted">' + timeAgo(h.timestamp) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    modal.style.display = 'flex';
  }

  async function loadSupplyChainSection(itemId) {
    const box = $('mk-detail-supply');
    if (typeof CRAFT_RECIPES === 'undefined') {
      box.innerHTML = '<p class="craft-muted">讀取配方資料中⋯</p>';
      await new Promise(function (resolve) {
        const s = document.createElement('script');
        s.src = 'js/craft-data.js';
        s.onload = resolve;
        s.onerror = resolve; // 抓不到就算了，退回不顯示供應鏈，不要卡住整個詳情頁
        document.body.appendChild(s);
      });
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
    const CARD_W = 92, CARD_H = 60, GAP = 16, PAD = 20;
    const rowCount = Math.max(matNodes.length, useNodes.length + (useOverflow ? 1 : 0), 1);
    const W = Math.max(360, rowCount * CARD_W + (rowCount - 1) * GAP + PAD * 2);
    const cx = W / 2;
    // 由上而下：成品排（上）→轉角→中心→轉角→材料排（下）
    const useTop = PAD, useBottom = useTop + CARD_H;
    const bendY1 = useBottom + 28;
    const centerY = bendY1 + 40, centerR = 32;
    const bendY2 = centerY + centerR + 28;
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
    function cardHtml(x, topY, iconId, line1, line2, clickAttrs, isOverflow) {
      const iconY = topY + 20;
      const fit = line1 ? fitName(line1, CARD_W - 12, 10.5, 8) : { text: '', fontSize: 10.5, titleAttr: '' };
      return '<g class="mk-supply-node"' + clickAttrs + '>' + fit.titleAttr +
        '<rect x="' + (x - CARD_W / 2) + '" y="' + topY + '" width="' + CARD_W + '" height="' + CARD_H + '" rx="8" fill="rgba(0,0,0,.4)" stroke="' + (isOverflow ? '#7a736a' : '#c5a059') + '" stroke-width="1.2"/>' +
        (isOverflow
          ? '<text x="' + x + '" y="' + iconY + '" text-anchor="middle" dominant-baseline="central" font-size="13" fill="#ddd">還有</text>'
          : itemIconSvg(iconId, x, iconY, 15)) +
        '<text x="' + x + '" y="' + (topY + 42) + '" text-anchor="middle" font-size="' + fit.fontSize.toFixed(1) + '" fill="#eee">' + fit.text + '</text>' +
        (line2 ? '<text x="' + x + '" y="' + (topY + 54) + '" text-anchor="middle" font-size="9.5" fill="#999">' + line2 + '</text>' : '') +
      '</g>';
    }

    // 材料排（下）：箭頭往上指向中心，光點屬於 'down' 段
    matNodes.forEach(function (n, i) {
      const x = rowX(matNodes.length, i);
      const a = { x: x, y: matTop };
      const b = { x: cx, y: centerY + centerR };
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
      const a = { x: cx, y: centerY - centerR };
      const b = { x: x, y: useBottom };
      facetV(a, b, bendY1, 'up');
      svgParts += cardHtml(x, useTop, n.itemId, n.name, '', ' data-mk-supply-item="' + n.itemId + '" data-mk-supply-rid="' + n.rid + '"', false);
    });
    if (useOverflow) {
      const count = useNodes.length + 1;
      const x = rowX(count, count - 1);
      const a = { x: cx, y: centerY - centerR };
      const b = { x: x, y: useBottom };
      facetV(a, b, bendY1, 'up');
      svgParts += cardHtml(x, useTop, '', String(useNodesFull.length - useNodes.length) + '種', '', ' data-mk-usedin-more="1"', true);
    }

    box.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="market-supply-svg"><defs>' + svgDefs + '</defs>' +
        svgParts +
        '<g class="mk-supply-core">' +
          '<circle cx="' + cx + '" cy="' + centerY + '" r="' + centerR + '" fill="rgba(197,160,89,.2)" stroke="#f0d9a0" stroke-width="1.6"/>' +
          itemIconSvg(itemId, cx, centerY, centerR - 8) +
        '</g>' +
      '</svg>' +
      '<p class="craft-muted market-supply-legend">上：這個物品被用在哪　下：這個物品需要的材料（可製作的點下去能繼續往下追）</p>';

    // 第4點（方案A）：拿掉左上角的路徑紀錄——點進另一個物品的供應鏈，就是單純換掉目前這張圖，
    // 不再累積歷史清單。「最近查看」本身已經是一種瀏覽紀錄，不需要疊床架屋再做一套。
    box.querySelectorAll('[data-mk-supply-item]').forEach(function (el) {
      el.addEventListener('click', function () {
        renderSupplyChain(el.dataset.mkSupplyItem, el.dataset.mkSupplyRid, box);
      });
    });
    box.querySelectorAll('[data-mk-goto-item]').forEach(function (el) {
      el.addEventListener('click', function () { openItemDetail(el.dataset.mkGotoItem); });
    });
    const moreBtn = box.querySelector('[data-mk-usedin-more]');
    if (moreBtn) {
      moreBtn.addEventListener('click', function () { renderUsedInList(itemId); });
    }
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
          itemIconHtml(it.itemId, 28) + '<span>' + it.name + '</span></button>';
      }).join('');
      grid.querySelectorAll('[data-mk-goto-item]').forEach(function (el) {
        if (el._bound) return; el._bound = true;
        el.addEventListener('click', function () { modal.style.display = 'none'; openItemDetail(el.dataset.mkGotoItem); });
      });
      shown += next.length;
      moreBtn.style.display = shown < items.length ? 'inline-block' : 'none';
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
      await new Promise(function (resolve) {
        const sc = document.createElement('script');
        sc.src = 'js/craft-data.js';
        sc.onload = resolve; sc.onerror = resolve;
        document.body.appendChild(sc);
      });
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
    let ingredientResults, sellResults;
    try {
      const out = await Promise.all([
        MarketData.resolveBuyCosts(ingredientNeed),
        MarketData.getSellPricesBatch(outputIds),
      ]);
      ingredientResults = out[0]; sellResults = out[1];
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
      if (!allResolved || !sell || !sell.price) return;
      // 第5點：一次「製作」可能產出不只1個成品（recipe.yields），賣價卻是單件價格，
      // 沒乘上產出數量的話，等於拿「做一次的成本」去跟「賣一件的錢」比，多產出的部分完全沒算到，
      // 利潤會被嚴重低估（甚至讓真正划算的配方看起來不划算）。
      const yields = recipe.yields || 1;
      const sellTotal = sell.price * yields;
      const profit = sellTotal - cost;
      rows.push({ itemId: recipe.itemId, name: ITEM_NAMES_TW_ALL[recipe.itemId] || recipe.itemId, cost: cost, sell: sellTotal, sellUnit: sell.price, yields: yields, profit: profit });
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
      '<div class="market-table-scroll"><table class="market-price-table"><thead><tr><th>淨利／次</th><th>材料成本</th><th>賣價／次</th><th>物品</th></tr></thead><tbody>' +
      rows.map(function (r) {
        const sellNote = r.yields > 1 ? '<br><span class="craft-muted" style="font-size:10px">' + r.sellUnit.toLocaleString() + '金×' + r.yields + '</span>' : '';
        return '<tr data-mk-radar-item="' + r.itemId + '" style="cursor:pointer"><td style="color:' + (r.profit >= 0 ? '#4ade80' : '#f87171') + '">' + (r.profit >= 0 ? '+' : '') + Math.round(r.profit).toLocaleString() + '金</td><td>' + Math.round(r.cost).toLocaleString() + '金</td><td>' + Math.round(r.sell).toLocaleString() + '金' + sellNote + '</td><td>' + r.name + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="craft-muted" style="margin-top:6px">粗估值：只算直接材料成本，沒有考慮製作時間跟賣方稅；「淨利／次」是做一次配方（可能一次做出不只1件）的總損益，不是單件價格。賣價只查你自己「我的世界」的掛單（上架不能跨世界），材料成本則是抓整個資料中心估的，所以這裡的賣價數字不會直接等於物品詳情頁看到的資料中心最低／均價／最高——想看完整跨服比價，點進物品查詢。</p>';
    body.querySelectorAll('[data-mk-radar-item]').forEach(function (tr) {
      tr.addEventListener('click', function () { openItemDetail(tr.dataset.mkRadarItem); });
    });
    const refreshBtn = $('mk-radar-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { runRadarScan(jobId, true); });
  }

})();
