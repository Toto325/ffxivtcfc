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
      '<div class="market-tabs">' +
        '<button type="button" class="craft-tab-btn active" data-mk-tab="item">物品查詢</button>' +
        '<button type="button" class="craft-tab-btn" data-mk-tab="radar">機會雷達</button>' +
      '</div>' +
      '<div id="mk-pane-item" class="market-pane">' +
        '<p class="craft-muted">搜尋一個物品開始查詢——即時價格、跨服比價、銷售速度，如果是可製作品還會顯示完整供應鏈。（下一步實作）</p>' +
      '</div>' +
      '<div id="mk-pane-radar" class="market-pane" style="display:none">' +
        '<p class="craft-muted">全物品投報率排行榜，不限自己能做的職業，切到這裡才會開始背景計算。（之後實作）</p>' +
      '</div>';

    updateMarketSettingsSummary();
    renderRecentlyViewed();
    bindSearchBox();
    bindTabSwitch();

    $('mk-settings-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      openMarketSettingsPopover(this);
    });
  }

  function updateMarketSettingsSummary() {
    const el = $('mk-settings-summary');
    if (!el || typeof MarketData === 'undefined') return;
    const s = MarketData.getSettings();
    el.textContent = s.dcName ? (s.dcName + (s.worldName ? '・' + s.worldName : '')) : '尚未設定市場資訊';
  }

  /* 市場設定彈出卡：生產頁craft-panel.js裡已經有一份幾乎一樣的邏輯（cf-market-*系列），
   * 這裡先各自維護一份簡化版，等市場頁功能穩定後再考慮抽成共用元件——現階段兩邊都還在變動，
   * 太早抽共用反而互相牽制，之後有餘力再做這個重構。 */
  function ensureSettingsPopoverDom() {
    let pop = $('mk-settings-popover');
    if (pop) return pop;
    pop = document.createElement('div');
    pop.id = 'mk-settings-popover';
    pop.className = 'craft-mat-worlds-popover craft-settings-popover';
    pop.style.display = 'none';
    pop.innerHTML =
      '<p class="craft-mat-worlds-title">市場設定</p>' +
      '<div class="craft-settings-field"><label>資料中心</label><select id="mk-set-dc" class="craft-select craft-select-block"><option value="">資料中心⋯</option></select></div>' +
      '<div class="craft-settings-field"><label>我的世界</label><select id="mk-set-world" class="craft-select craft-select-block"><option value="">我的世界⋯</option></select></div>';
    document.body.appendChild(pop);
    $('mk-set-dc').addEventListener('change', async function () {
      await MarketData.setDataCenter(this.value);
      const worlds = this.value ? await MarketData.listWorldNamesInDc(this.value) : [];
      $('mk-set-world').innerHTML = '<option value="">我的世界⋯</option>' + worlds.map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('');
      updateMarketSettingsSummary();
    });
    $('mk-set-world').addEventListener('change', async function () {
      await MarketData.setWorld(this.value);
      updateMarketSettingsSummary();
    });
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { pop.style.display = 'none'; });
    return pop;
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
        if (saved.worldName) $('mk-set-world').value = saved.worldName;
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
      for (let i = 0; i < ids.length && matches.length < 30; i++) {
        const name = ITEM_NAMES_TW_ALL[ids[i]];
        if (name && name.indexOf(q) !== -1) matches.push({ id: ids[i], name: name });
      }
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
  let detailBreadcrumb = [];
  let marketUsedInIndex = null; // 延遲建立的反查表：itemId -> [recipeId]，只在真的需要時掃一次 CRAFT_RECIPES
  let marketToRecipesIndex = null; // 同樣道理：itemId -> [recipeId]，這個物品「本身」可以用哪個配方做出來

  function buildUsedInIndex() {
    if (marketUsedInIndex) return marketUsedInIndex;
    marketUsedInIndex = {};
    Object.keys(CRAFT_RECIPES).forEach(function (rid) {
      const recipe = CRAFT_RECIPES[rid];
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
      const outId = CRAFT_RECIPES[rid].itemId;
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
    detailBreadcrumb = [itemId];
    $('mk-pane-item').innerHTML =
      '<div class="market-detail-header">' + itemIconHtml(itemId, 40) + '<h3>' + name + '</h3></div>' +
      '<div id="mk-detail-market" class="market-detail-section"><p class="craft-muted">讀取市場資料中⋯</p></div>' +
      '<div id="mk-detail-supply" class="market-detail-section"></div>';
    loadMarketSection(itemId);
    loadSupplyChainSection(itemId);
  }

  function timeAgo(unixSeconds) {
    const diff = Date.now() / 1000 - unixSeconds;
    if (diff < 3600) return Math.max(1, Math.round(diff / 60)) + '分鐘前';
    if (diff < 86400) return Math.round(diff / 3600) + '小時前';
    return Math.round(diff / 86400) + '天前';
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
    ]);
    const overview = out[0], velocity = out[1];
    let html = '';

    // 統計摘要：均價/最低/最高，跟銷售速度放同一行，三個數字放一起看最直接
    const statParts = [];
    if (overview && overview.avgPrice) statParts.push('均價約 <strong>' + Math.round(overview.avgPrice).toLocaleString() + '金</strong>');
    if (overview && overview.minPrice) statParts.push('最低 <strong style="color:#4ade80">' + overview.minPrice.toLocaleString() + '金</strong>');
    if (overview && overview.maxPrice) statParts.push('最高 <strong style="color:#f87171">' + overview.maxPrice.toLocaleString() + '金</strong>');
    if (velocity && velocity.totalVelocityPerDay) {
      const scopeNote = velocity.usedScope === 'world' ? '' : '<span class="craft-muted">（DC整體）</span>';
      statParts.push('近4天賣出速度約 <strong style="color:#4ade80">' + velocity.totalVelocityPerDay.toFixed(1) + ' 件/天</strong>' + scopeNote);
    } else if (velocity && velocity.usedScope === null) {
      statParts.push('<span class="craft-muted">近4天查無成交</span>');
    }
    if (statParts.length) html += '<p class="market-stat-line">' + statParts.join('　') + '</p>';

    if (!overview || !overview.listings.length) {
      html += '<p class="craft-muted">目前查無掛單（可能沒有人在賣）</p>';
      box.innerHTML = html;
      return;
    }

    // 全部掛單攤開來，不再只留每個世界最低那一筆——這才是玩家判斷「市場厚不厚」需要的資訊量
    html += '<p class="market-subheading">目前掛單（共 ' + overview.listings.length + ' 筆）</p>' +
      '<div class="market-table-scroll"><table class="market-price-table"><thead><tr><th>世界</th><th>品質</th><th>單價</th><th>數量</th></tr></thead><tbody>' +
      overview.listings.map(function (l) {
        return '<tr><td>' + l.world + '</td><td>' + (l.hq ? '<span class="market-hq-tag">HQ</span>' : 'NQ') + '</td><td>' + l.pricePerUnit.toLocaleString() + '金</td><td>' + l.quantity.toLocaleString() + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    // 最近成交紀錄：真正的歷史交易，不是掛單，讓玩家看得到「實際上有沒有人在買」
    if (overview.history.length) {
      html += '<p class="market-subheading" style="margin-top:14px">最近成交紀錄</p>' +
        '<div class="market-table-scroll"><table class="market-price-table"><thead><tr><th>世界</th><th>品質</th><th>成交價</th><th>數量</th><th>時間</th></tr></thead><tbody>' +
        overview.history.slice(0, 30).map(function (h) {
          return '<tr><td>' + h.world + '</td><td>' + (h.hq ? '<span class="market-hq-tag">HQ</span>' : 'NQ') + '</td><td>' + h.pricePerUnit.toLocaleString() + '金</td><td>' + h.quantity.toLocaleString() + '</td><td class="craft-muted">' + timeAgo(h.timestamp) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } else {
      html += '<p class="craft-muted" style="margin-top:10px">近期查無成交紀錄</p>';
    }
    box.innerHTML = html;
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
  function renderSupplyChain(itemId, rid, box) {
    const recipe = rid ? CRAFT_RECIPES[rid] : null;
    const ings = recipe ? (recipe.ingredients || []) : [];
    const usedInRids = buildUsedInIndex()[itemId] || [];
    if (!ings.length && !usedInRids.length) { box.innerHTML = ''; return; }

    const downNodes = ings.map(function (ing) {
      const childRid = (buildToRecipesIndex()[ing.itemId] || [])[0];
      return { itemId: ing.itemId, amount: ing.amount, rid: childRid || '', name: ITEM_NAMES_TW_ALL[ing.itemId] || ing.itemId };
    });
    const upNodesFull = usedInRids.map(function (urid) {
      const r = CRAFT_RECIPES[urid];
      if (!r) return null;
      return { itemId: r.itemId, rid: urid, name: ITEM_NAMES_TW_ALL[r.itemId] || r.itemId };
    }).filter(Boolean);
    const upOverflow = upNodesFull.length > SUPPLY_NODE_LIMIT;
    const upNodes = upOverflow ? upNodesFull.slice(0, SUPPLY_NODE_LIMIT - 1) : upNodesFull;

    const isNarrow = (box.clientWidth || box.parentElement.clientWidth || 680) < 560;
    const W = isNarrow ? 380 : 700, H = isNarrow ? 620 : 380;
    const cx = W / 2, cy = H / 2, R = isNarrow ? 150 : 200;

    // 寬螢幕：材料在左半圈（110°~250°）、用途在右半圈（-70°~70°）
    // 窄螢幕：材料在上半圈（200°~340°）、用途在下半圈（20°~160°）—— 角度0°＝右方，順時針遞增
    function place(list, side, includeOverflow) {
      const total = list.length + (includeOverflow ? 1 : 0);
      let a0, a1;
      if (isNarrow) { a0 = side === 'down' ? 200 : 20; a1 = side === 'down' ? 340 : 160; }
      else { a0 = side === 'down' ? 110 : -70; a1 = side === 'down' ? 250 : 70; }
      const pts = [];
      for (let i = 0; i < total; i++) {
        const t = total <= 1 ? 0.5 : i / (total - 1);
        const ang = (a0 + (a1 - a0) * t) * Math.PI / 180;
        pts.push({ x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), angDeg: a0 + (a1 - a0) * t });
      }
      return pts;
    }
    const downPts = place(downNodes, 'down', false);
    const upPts = place(upNodes, 'up', upOverflow);

    function labelAnchor(angDeg) {
      // 節點在左半邊（90°~270°）文字靠右對齊、右半邊文字靠左對齊，避免文字被畫布邊界切掉
      const a = ((angDeg % 360) + 360) % 360;
      return (a > 90 && a < 270) ? 'end' : 'start';
    }
    function labelOffset(angDeg) {
      const a = ((angDeg % 360) + 360) % 360;
      return (a > 90 && a < 270) ? -40 : 40;
    }

    let svgParts = '';
    let idCounter = 0;
    function connectorAndNode(pt, iconId, label, clickAttrs, isOverflowNode) {
      idCounter++;
      const pathId = 'mksp' + idCounter;
      const d = 'M' + cx + ',' + cy + ' L' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1);
      const anchor = labelAnchor(pt.angDeg);
      const lx = pt.x + labelOffset(pt.angDeg);
      svgParts +=
        '<path id="' + pathId + '" class="cyc-arc-line" d="' + d + '" stroke="#c5a059"/>' +
        '<circle class="cyc-spark-outer" r="7"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.8;1" dur="2.6s" repeatCount="indefinite"/><animateMotion dur="2.6s" repeatCount="indefinite" path="' + d + '"/></circle>' +
        '<circle class="cyc-spark-core" r="2.4"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.8;1" dur="2.6s" repeatCount="indefinite"/><animateMotion dur="2.6s" repeatCount="indefinite" path="' + d + '"/></circle>' +
        '<g class="mk-supply-node"' + clickAttrs + '>' +
          '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="22" fill="rgba(0,0,0,.4)" stroke="' + (isOverflowNode ? '#7a736a' : '#c5a059') + '" stroke-width="1.4"/>' +
          (isOverflowNode ? '<text x="' + pt.x + '" y="' + pt.y + '" text-anchor="middle" dominant-baseline="central" font-size="10" fill="#ddd">+' + label + '</text>' : itemIconSvg(iconId, pt.x, pt.y)) +
          '<line x1="' + pt.x + '" y1="' + pt.y + '" x2="' + lx + '" y2="' + pt.y + '" stroke="rgba(255,255,255,.25)" stroke-width="1"/>' +
          '<text x="' + (lx + (anchor === 'end' ? -4 : 4)) + '" y="' + pt.y + '" text-anchor="' + anchor + '" dominant-baseline="central" font-size="11" fill="#eee">' + (isOverflowNode ? '' : label) + '</text>' +
        '</g>';
    }
    function itemIconSvg(iid, x, y) {
      const url = (typeof ITEM_ICONS_TW_ALL !== 'undefined' && ITEM_ICONS_TW_ALL[iid]) || null;
      if (!url) return '<text x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="central" font-size="14">⬡</text>';
      return '<image href="' + url + '" x="' + (x - 16) + '" y="' + (y - 16) + '" width="32" height="32" clip-path="circle(15px)"/>';
    }

    downNodes.forEach(function (n, i) {
      const clickAttrs = n.rid ? ' data-mk-supply-item="' + n.itemId + '" data-mk-supply-rid="' + n.rid + '" style="cursor:pointer"' : '';
      connectorAndNode(downPts[i], n.itemId, n.name + '×' + n.amount, clickAttrs, false);
    });
    upNodes.forEach(function (n, i) {
      connectorAndNode(upPts[i], n.itemId, n.name, ' data-mk-goto-item="' + n.itemId + '" style="cursor:pointer"', false);
    });
    if (upOverflow) {
      connectorAndNode(upPts[upPts.length - 1], '', String(upNodesFull.length - upNodes.length), ' data-mk-usedin-more="1" style="cursor:pointer"', true);
    }

    const centerName = ITEM_NAMES_TW_ALL[itemId] || itemId;
    box.innerHTML =
      '<div class="market-supply-breadcrumb" id="mk-supply-crumb"></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="market-supply-svg">' +
        svgParts +
        '<circle cx="' + cx + '" cy="' + cy + '" r="30" fill="rgba(197,160,89,.2)" stroke="#f0d9a0" stroke-width="1.6"/>' +
        itemIconSvg(itemId, cx, cy) +
      '</svg>' +
      '<p class="craft-muted market-supply-legend">往' + (isNarrow ? '上' : '左') + '：這個物品需要的材料（點進去能繼續往下追）　往' + (isNarrow ? '下' : '右') + '：這個物品被用在哪</p>' +
      '<div id="mk-usedin-list" class="market-usedin-list" style="display:none"></div>';

    renderSupplyCrumb(box);
    box.querySelectorAll('[data-mk-supply-item]').forEach(function (el) {
      el.addEventListener('click', function () {
        detailBreadcrumb.push(el.dataset.mkSupplyItem);
        renderSupplyChain(el.dataset.mkSupplyItem, el.dataset.mkSupplyRid, box);
      });
    });
    box.querySelectorAll('[data-mk-goto-item]').forEach(function (el) {
      el.addEventListener('click', function () { openItemDetail(el.dataset.mkGotoItem); });
    });
    const moreBtn = box.querySelector('[data-mk-usedin-more]');
    if (moreBtn) {
      moreBtn.style.cursor = 'pointer';
      moreBtn.addEventListener('click', function () { renderUsedInList(itemId, box); });
    }
  }

  /* 用途數量超過門檻時，點「還有N種」節點切換成的清單式呈現——圖示＋名字逐項列出，
   * 跟生產頁材料圖譜「這個成品還能用在哪」的體驗一致，不是另外設計一套新的互動方式。 */
  function renderUsedInList(itemId, box) {
    const rids = buildUsedInIndex()[itemId] || [];
    const listBox = box.querySelector('#mk-usedin-list');
    if (!listBox) return;
    box.querySelector('.market-supply-svg').style.display = 'none';
    box.querySelector('.market-supply-legend').style.display = 'none';
    listBox.style.display = 'block';
    listBox.innerHTML = '<p class="market-subheading">這個物品被用在（共 ' + rids.length + ' 種）</p>' +
      rids.map(function (urid) {
        const r = CRAFT_RECIPES[urid];
        if (!r) return '';
        return '<button type="button" class="market-recent-chip" data-mk-goto-item="' + r.itemId + '">' + itemIconHtml(r.itemId, 18) + '<span>' + (ITEM_NAMES_TW_ALL[r.itemId] || r.itemId) + '</span></button>';
      }).join('');
    listBox.querySelectorAll('[data-mk-goto-item]').forEach(function (el) {
      el.addEventListener('click', function () { openItemDetail(el.dataset.mkGotoItem); });
    });
  }

  function renderSupplyCrumb(box) {
    const el = box.querySelector('#mk-supply-crumb');
    if (!el) return;
    el.innerHTML = detailBreadcrumb.map(function (id, i) {
      const nm = ITEM_NAMES_TW_ALL[id] || id;
      return (i > 0 ? '<span class="craft-muted"> › </span>' : '') + '<span class="market-crumb-item" data-mk-crumb-idx="' + i + '">' + nm + '</span>';
    }).join('');
    el.querySelectorAll('[data-mk-crumb-idx]').forEach(function (b) {
      b.addEventListener('click', function () {
        const idx = parseInt(b.dataset.mkCrumbIdx, 10);
        detailBreadcrumb = detailBreadcrumb.slice(0, idx + 1);
        const id = detailBreadcrumb[idx];
        const rid = (buildToRecipesIndex()[id] || [])[0];
        renderSupplyChain(id, rid, box);
      });
    });
  }
})();
