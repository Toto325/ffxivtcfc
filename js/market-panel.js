/* market-panel.js — 市場頁：以物品為中心的查詢/探索頁面，跟生產頁分工不同
 * （生產頁＝效率導向操作面板，市場頁＝探索導向資訊展示），但底層資料層完全共用 MarketData／
 * CRAFT_RECIPES，但 ITEM_TO_RECIPES／ITEM_USED_IN 是生產工具內部的私有索引，市場頁拿不到，
 * 這裡另外用 buildToRecipesIndex()／buildUsedInIndex() 各自建立一份對等的索引，不重新設計邏輯，
 * 只是換一個地方各自維護——這也是先前答應過、要等市場頁穩定後再回頭考慮共用的技術債之一。
 *
 * 這一版只做骨架：搜尋框（接上全物品繁中名稱索引）＋市場設定摘要＋兩個分頁的空殼，
 * 物品詳情頁的實際內容（價格/走勢/供應鏈視覺化）跟機會雷達排行榜之後再疊上去。 */
(function () {
  const app = window.app = window.app || {};

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
        return '<div class="craft-search-item" data-mk-pick="' + m.id + '">' + m.name + '</div>';
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
        return '<button type="button" class="market-recent-chip" data-mk-recent="' + r.id + '">' + r.name + '</button>';
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

  function openItemDetail(itemId) {
    itemId = String(itemId);
    const name = ITEM_NAMES_TW_ALL[itemId] || ('#' + itemId);
    recordRecentlyViewed(itemId, name);
    renderRecentlyViewed();
    document.querySelector('[data-mk-tab="item"]').click();
    detailBreadcrumb = [itemId];
    $('mk-pane-item').innerHTML =
      '<div class="market-detail-header"><h3>' + name + '</h3><span class="craft-muted">物品ID ' + itemId + '</span></div>' +
      '<div id="mk-detail-market" class="market-detail-section"><p class="craft-muted">讀取市場資料中⋯</p></div>' +
      '<div id="mk-detail-supply" class="market-detail-section"></div>' +
      '<div id="mk-detail-usedin" class="market-detail-section"></div>';
    loadMarketSection(itemId);
    loadSupplyChainSection(itemId);
  }

  async function loadMarketSection(itemId) {
    const box = $('mk-detail-market');
    if (!MarketData.getSettings().dcName) {
      box.innerHTML = '<p class="craft-muted">尚未設定資料中心，點右上角「設定」後才能查價。</p>';
      return;
    }
    const out = await Promise.all([
      MarketData.getCrossWorldPrices(itemId).catch(function () { return null; }),
      MarketData.fetchSaleVelocity(itemId).catch(function () { return null; }),
    ]);
    const crossWorld = out[0], velocity = out[1];
    let html = '';
    if (velocity && velocity.totalVelocityPerDay) {
      const scopeNote = velocity.usedScope === 'world' ? '' : '<span class="craft-muted">（DC整體，僅供參考）</span>';
      html += '<p><i class="ph ph-chart-line"></i> 近4天賣出速度約 <strong style="color:#4ade80">' + velocity.totalVelocityPerDay.toFixed(1) + ' 件/天</strong>' + scopeNote + '</p>';
    } else if (velocity && velocity.usedScope === null) {
      html += '<p class="craft-muted">近4天查無成交紀錄，可能較冷門</p>';
    }
    if (crossWorld && crossWorld.length) {
      html += '<table class="market-price-table"><thead><tr><th>世界</th><th>單價</th><th>數量</th></tr></thead><tbody>' +
        crossWorld.slice(0, 15).map(function (r) {
          return '<tr><td>' + r.world + '</td><td>' + r.pricePerUnit.toLocaleString() + '金</td><td>' + r.quantity.toLocaleString() + '</td></tr>';
        }).join('') + '</tbody></table>';
    } else {
      html += '<p class="craft-muted">目前查無掛單（可能沒有人在賣）</p>';
    }
    box.innerHTML = html;
  }

  async function loadSupplyChainSection(itemId) {
    const box = $('mk-detail-supply');
    const usedInBox = $('mk-detail-usedin');
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
    if (rid) {
      renderSupplyChainRadial(itemId, rid, box);
    } else {
      box.innerHTML = '';
    }
    renderUsedIn(itemId, usedInBox);
  }

  function renderUsedIn(itemId, box) {
    const idx = buildUsedInIndex();
    const rids = idx[itemId] || [];
    if (!rids.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<p class="craft-muted" style="margin-bottom:6px">這個物品被用在：</p>' +
      rids.slice(0, 20).map(function (rid) {
        const r = CRAFT_RECIPES[rid];
        if (!r) return '';
        return '<button type="button" class="market-recent-chip" data-mk-goto-item="' + r.itemId + '">' + (ITEM_NAMES_TW_ALL[r.itemId] || r.itemId) + '</button>';
      }).join('') +
      (rids.length > 20 ? '<span class="craft-muted">⋯還有 ' + (rids.length - 20) + ' 種</span>' : '');
    box.querySelectorAll('[data-mk-goto-item]').forEach(function (el) {
      el.addEventListener('click', function () { openItemDetail(el.dataset.mkGotoItem); });
    });
  }

  /* 供應鏈視覺化：中心是這個物品，一圈是直接材料，金色圈代表那個材料本身也可製作、能再往下鑽，
   * 藍色圈代表市場買的材料，沒有再下一層。點金色節點會把整個圖重新畫成以那個材料為中心，
   * 上方麵包屑可以點回去任一層——先做這個「換中心＋麵包屑」的簡化版鑽入方式，
   * 不是同心圓一次全部展開，畫面比較不會一次塞爆。 */
  function renderSupplyChainRadial(itemId, rid, box) {
    const recipe = CRAFT_RECIPES[rid];
    const ings = recipe.ingredients || [];
    if (!ings.length) { box.innerHTML = ''; return; }
    const W = 560, H = 340, cx = W / 2, cy = H / 2, R = 118;
    const nodes = ings.map(function (ing, i) {
      const angle = (Math.PI * 2 * i / ings.length) - Math.PI / 2;
      const x = cx + R * Math.cos(angle), y = cy + R * Math.sin(angle);
      const childRid = (buildToRecipesIndex()[ing.itemId] || [])[0];
      return {
        itemId: ing.itemId, amount: ing.amount, x: x, y: y,
        rid: childRid || '',
        name: ITEM_NAMES_TW_ALL[ing.itemId] || ing.itemId,
      };
    });
    const lines = nodes.map(function (n) {
      return '<line x1="' + cx + '" y1="' + cy + '" x2="' + n.x + '" y2="' + n.y + '" stroke="rgba(255,255,255,.15)" stroke-width="1"/>';
    }).join('');
    const centerName = ITEM_NAMES_TW_ALL[itemId] || itemId;
    const nodeEls = nodes.map(function (n) {
      const color = n.rid ? '#c5a059' : '#7aa2ff';
      return '<g class="mk-supply-node"' + (n.rid ? ' data-mk-supply-item="' + n.itemId + '" data-mk-supply-rid="' + n.rid + '" style="cursor:pointer"' : '') + '>' +
        '<title>' + n.name + ' ×' + n.amount + '</title>' +
        '<circle cx="' + n.x + '" cy="' + n.y + '" r="27" fill="rgba(0,0,0,.35)" stroke="' + color + '" stroke-width="1.5"/>' +
        '<text x="' + n.x + '" y="' + (n.y - 3) + '" text-anchor="middle" font-size="10" fill="#eee">' + n.name.slice(0, 4) + '</text>' +
        '<text x="' + n.x + '" y="' + (n.y + 11) + '" text-anchor="middle" font-size="9" fill="#999">×' + n.amount + '</text>' +
      '</g>';
    }).join('');
    box.innerHTML =
      '<div class="market-supply-breadcrumb" id="mk-supply-crumb"></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="market-supply-svg">' + lines +
        '<circle cx="' + cx + '" cy="' + cy + '" r="33" fill="rgba(197,160,89,.18)" stroke="#c5a059" stroke-width="1.5"/>' +
        '<title>' + centerName + '</title>' +
        '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" font-size="11" fill="#f0d9a0">' + centerName.slice(0, 4) + '</text>' +
        nodeEls +
      '</svg>' +
      '<p class="craft-muted market-supply-legend">金色圈：可製作，點下去能鑽入它自己的供應鏈；藍色圈：市場購買。</p>';
    renderSupplyCrumb(box);
    box.querySelectorAll('[data-mk-supply-item]').forEach(function (el) {
      el.addEventListener('click', function () {
        detailBreadcrumb.push(el.dataset.mkSupplyItem);
        renderSupplyChainRadial(el.dataset.mkSupplyItem, el.dataset.mkSupplyRid, box);
      });
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
        renderSupplyChainRadial(id, rid, box);
      });
    });
  }
})();
