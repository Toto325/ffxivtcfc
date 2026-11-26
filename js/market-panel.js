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

  /* 網址深連結：開啟物品時把網址換成 #page=market&item=物品ID。
   * 重新整理、把網址傳給朋友、或按瀏覽器的「上一頁」都能回到同一個物品（app.js 本來就會讀 #page=）。
   * 離開市場頁時把這段 hash 清掉，不然之後在別頁重新整理會被帶回市場。生產頁彈窗（embed）不碰網址。 */
  const IS_EMBED = /embed=1/.test(window.location.hash);
  function hashIsMarket() { return /(?:^|[#&])page=market(?:&|$)/.test(window.location.hash); }
  function readHashItem() { if (!hashIsMarket()) return null; const m = /[#&]item=(\d+)/.exec(window.location.hash); return m ? m[1] : null; }
  function syncHash(itemId, push) {
    if (IS_EMBED) return;
    const h = '#page=market' + (itemId ? '&item=' + encodeURIComponent(itemId) : '');
    if (window.location.hash === h) return;
    try { window.history[push ? 'pushState' : 'replaceState'](null, '', window.location.pathname + window.location.search + h); } catch (e) { /* 某些環境不允許改網址就算了 */ }
  }
  function readHashTab() { if (!hashIsMarket()) return null; const m = /[#&]tab=(item|radar|hot|tokens)(?:&|$)/.exec(window.location.hash); return m ? m[1] : null; }
  // 從分頁（熱度排行／代幣兌換…）點進物品前，先在歷史裡留一格「#page=market&tab=分頁」，
  // 不然歷史只有「前一個看過的物品」，按上一頁就會跳去那個物品，而不是回到分頁。
  function pushTabHash(tab) {
    if (IS_EMBED) return;
    const h = '#page=market&tab=' + tab;
    if (window.location.hash === h) return;
    try { window.history.pushState(null, '', window.location.pathname + window.location.search + h); } catch (e) { /* 忽略 */ }
  }
  /* ── 返回導覽 ──
   * 每次「從別的地方跳進某個物品頁」就記一格：來源是哪個分頁（含捲動位置），或來源是另一個物品（含當時看的分頁、世界、篩選）。
   * 物品頁最上面有一顆「‹ 返回 〇〇」（只有跳進來時才出現，自己搜尋進來的不顯示）。
   * 按鈕＝瀏覽器的「上一頁」，所以按鈕、瀏覽器上一頁、手機返回手勢走同一條路，不會互相打架。
   * 離開市場頁就清空；生產頁彈窗（embed）沒有網址歷史，直接用記錄返回。 */
  const navStack = [];
  const MAIN_TAB_LABELS = { item: '物品查詢', radar: '製作商機', hot: '熱度排行', tokens: '代幣兌換' };
  const ITEM_PANE_PLACEHOLDER = '<p class="craft-muted">搜尋一個物品開始查詢——即時價格、跨服比價、銷售速度，如果是可製作品還會顯示完整供應鏈。</p>';
  function mainTabName() { const b = document.querySelector('.craft-tab-btn[data-mk-tab].active'); return b ? b.dataset.mkTab : 'item'; }
  function paneScroller(tab) { const p = $('mk-pane-' + tab); return p ? p.querySelector('.market-pane-scrollbody') : null; }
  // 手機版（≤720px）整頁交給外層容器捲動（#viewport 或 .scene），window.scrollY 永遠是 0，所以要找出真正在捲的那層
  function hostScroller() {
    let el = $('market-root') || $('mk-pane-item');
    while (el && el !== document.body && el !== document.documentElement) {
      el = el.parentElement;
      if (!el) break;
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
    }
    return null;
  }
  function captureOrigin(targetId) {
    const tab = mainTabName();
    const sc = paneScroller(tab);
    const hs = hostScroller();
    const base = { pane: sc ? sc.scrollTop : 0, win: window.scrollY || 0, host: hs ? hs.scrollTop : 0 };
    if (tab !== 'item') return Object.assign({ kind: 'tab', tab: tab, label: MAIN_TAB_LABELS[tab] || tab }, base);
    if (currentDetailItemId && String(targetId) !== String(currentDetailItemId)) {
      const view = (detailViewState && detailViewState.itemId === String(currentDetailItemId)) ? Object.assign({}, detailViewState) : null;
      return Object.assign({ kind: 'item', id: String(currentDetailItemId), name: ITEM_NAMES_TW_ALL[currentDetailItemId] || ('#' + currentDetailItemId), view: view }, base);
    }
    return null;
  }
  // 內容是非同步載入的，捲動位置要等內容撐開後才還原得了：分幾次嘗試，到位就停。
  function restoreScrollSoon(el, top, winTop, hostTop) {
    let n = 0;
    (function tryIt() {
      if (el) el.scrollTop = top;
      if (winTop != null) window.scrollTo(0, winTop);
      const hs = hostTop != null ? hostScroller() : null;
      if (hs) hs.scrollTop = hostTop;
      n++;
      const ok = (!el || Math.abs(el.scrollTop - top) < 3) && (!hs || Math.abs(hs.scrollTop - hostTop) < 3);
      if (!ok && n < 8) setTimeout(tryIt, 150 * n);
    })();
  }
  function resetItemPane() {
    currentDetailItemId = null; detailLoadToken++; detailViewState = null;
    $('mk-pane-item').innerHTML = ITEM_PANE_PLACEHOLDER;
    renderRecentlyViewed(); fitMarketHeights();
  }
  function restoreOrigin(og, fromHash) {
    if (og.kind === 'tab') {
      const b = document.querySelector('.craft-tab-btn[data-mk-tab="' + og.tab + '"]');
      if (b) b.click();
      restoreScrollSoon(paneScroller(og.tab), og.pane, og.win, og.host);
    } else {
      openItemDetail(og.id, { back: true, fromHash: !!fromHash, restoreView: og.view });
      restoreScrollSoon(paneScroller('item'), og.pane, og.win, og.host);
    }
  }
  function goBack() {
    if (!navStack.length) return;
    if (IS_EMBED) { restoreOrigin(navStack.pop(), false); return; }
    let fired = false;
    const onPop = function () { fired = true; };
    window.addEventListener('popstate', onPop, { once: true });
    window.history.back();
    setTimeout(function () { // 萬一瀏覽器沒有可退的紀錄（popstate 沒觸發），改用記錄直接返回
      window.removeEventListener('popstate', onPop);
      if (!fired && navStack.length) restoreOrigin(navStack.pop(), false);
    }, 400);
  }
  function backRowHtml() {
    const top = navStack[navStack.length - 1];
    if (!top) return '';
    const label = top.kind === 'tab' ? top.label : top.name;
    return '<div class="mk-back-row"><button type="button" class="mk-back-btn" id="mk-back-btn" title="返回「' + escHtml(label) + '」"><i class="ph ph-caret-left"></i><span>返回 ' + escHtml(label) + '</span></button></div>';
  }
  (function () {
    const rawNav = app.nav;
    app.nav = function (id) {
      if (id !== 'market') navStack.length = 0;
      if (!IS_EMBED && id !== 'market' && hashIsMarket()) { try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* 忽略 */ } }
      const r = rawNav.apply(this, arguments);
      if (!IS_EMBED && id === 'market' && currentDetailItemId) syncHash(currentDetailItemId, false);
      return r;
    };
  })();
  window.addEventListener('popstate', function () { // 瀏覽器上一頁／下一頁（返回按鈕也走這裡）
    if (IS_EMBED || !hashIsMarket() || !$('mk-pane-item')) return;
    if (!document.getElementById('market').classList.contains('active')) app.nav('market');
    const id = readHashItem();
    const top = navStack[navStack.length - 1];
    if (id) {
      if (id !== currentDetailItemId || mainTabName() !== 'item') {
        if (top && top.kind === 'item' && top.id === id) { navStack.pop(); restoreOrigin(top, true); }
        else openItemDetail(id, { fromHash: true, back: true });
      }
    } else {
      const ht = readHashTab();
      if (top && top.kind === 'tab' && (!ht || ht === top.tab)) { // 回到「從某個分頁跳進來」之前
        navStack.pop(); resetItemPane(); restoreOrigin(top, true);
      } else if (ht && ht !== mainTabName()) { // 例如「下一頁」走到分頁那一格
        const b = document.querySelector('.craft-tab-btn[data-mk-tab="' + ht + '"]'); if (b) b.click();
      } else if (currentDetailItemId) { // 回到「還沒開任何物品」的那一步
        resetItemPane();
      }
    }
  });

  app.buildMarket = function () {
    const root = document.getElementById('market-root');
    if (!root) return;

    root.innerHTML = '<div class="craft-loading"><i class="ph ph-scales craft-loading-icon"></i><span>載入物品資料中⋯</span></div>';

    // 市場頁只需要「全物品名稱索引」＋「市場資料層」，不需要 craft-data.js 那份好幾MB的配方庫，
    // 除非之後要顯示供應鏈視覺化，那時候才臨時另外載入 craft-data.js（用 typeof 判斷避免重複載入）。
    const need = [];
    if (typeof ITEM_NAMES_TW_ALL === 'undefined') need.push(['js/item-names-tw.js']);
    if (typeof ITEM_ICONS_TW_ALL === 'undefined') need.push(['js/item-icons-tw.js']);
    if (typeof MarketData === 'undefined') need.push(['js/market-data.js', function () { return typeof MarketData !== 'undefined'; }]);

    if (!need.length) { renderMarketSkeleton(); return; }
    // 走共用載入器（定義在 craft-panel.js）：market-data.js 生產頁也會載，不能各載各的
    // 載入卡住（網路停住、檔案一直沒回應）時，不要一直轉圈：30 秒後改成明確的提示；之後如果檔案終於載好，還是會自動接著顯示
    const stuckTimer = setTimeout(function () {
      if (root.querySelector('.craft-loading') && !root.querySelector('.craft-error')) root.innerHTML = '<div class="craft-loading craft-error">資料載入逾時，請重新整理頁面（Ctrl＋F5）再試一次。</div>';
    }, 30000);
    Promise.all(need.map(function (n) { return app.loadScriptOnce(n[0], n[1]); })).then(function (results) {
      clearTimeout(stuckTimer);
      if (results.every(Boolean)) {
        try { renderMarketSkeleton(); }
        catch (e) { root.innerHTML = '<div class="craft-loading craft-error">市場頁顯示失敗（' + String(e && e.message || e).slice(0, 80) + '），請重新整理再試一次。</div>'; throw e; } // 錯誤訊息直接顯示在畫面上，不再只是停在載入中
        return;
      }
      root.innerHTML = '<div class="craft-loading craft-error">資料載入失敗，請重新整理再試一次。</div>';
    });
  };

  function $(id) { return document.getElementById(id); }
  // 把文字放進 HTML 之前先「跳脫」：把 < > & " 換成安全的寫法，這樣名稱裡就算剛好有這些符號，也只會被當成文字顯示，
  // 不會被瀏覽器當成網頁語法（例如名稱裡的 " 會把 title="…" 提早結束）。物品名稱目前都來自你自己的資料所以沒有實際風險，
  // 但從 localStorage（最近查看）讀出來的內容可以被改，加上這一層比較保險。
  /* ── 搜尋比對共用工具（市場頁所有搜尋框都走這裡）──
   * 名稱跟關鍵字先過同一套正規化再比：NFKC（全形英數→半形，例如「ＨＱ」「１」）、轉小寫（大小寫不分）、
   * 去掉所有空白。關鍵字用空白分成多段＝每一段都要符合（順序不拘），跟生產頁的配方搜尋行為一致。
   * 名稱的正規化結果照物品ID快取，只算一次，不然每敲一個鍵都要對幾萬個名稱重做一遍。 */
  function normSearch(str) { return String(str == null ? '' : str).normalize('NFKC').toLowerCase().replace(/\s+/g, ''); }
  function searchTokens(q) { return String(q == null ? '' : q).normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean); }
  const NORM_NAME_CACHE = Object.create(null);
  function normNameOf(id, name) {
    const hit = NORM_NAME_CACHE[id];
    if (hit !== undefined && hit.src === name) return hit.n;
    const n = normSearch(name);
    NORM_NAME_CACHE[id] = { src: name, n: n };
    return n;
  }
  function tokensMatch(nameN, tokens) {
    for (let i = 0; i < tokens.length; i++) { if (nameN.indexOf(tokens[i]) === -1) return false; }
    return true;
  }
  function escHtml(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function renderMarketSkeleton() {
    const root = document.getElementById('market-root');
    root.innerHTML =
      '<div class="market-top-fixed">' +
        '<div class="market-header">' +
          '<h2 class="unified-gold-header small news-title"><i class="ph ph-scales cr-title-ic" aria-hidden="true"></i>市場</h2>' +
          '<div class="fancy-divider mini news-div"><div class="long-silk-line-short"></div></div>' +
        '</div>' +
        '<div class="mk-toolbar" id="mk-toolbar">' +
        '<div class="market-searchbar">' +
          '<div class="market-search-box">' +
            '<input id="mk-search" class="craft-search" placeholder="搜尋物品名稱⋯" autocomplete="off" />' +
            '<div id="mk-search-results" class="craft-search-results"></div>' +
          '</div>' +
          '<button type="button" id="mk-recent-btn" class="mk-recent-btn" title="最近查看" aria-label="最近查看" aria-haspopup="true"><i class="ph ph-clock-counter-clockwise"></i></button>' +
          '<button type="button" id="mk-settings-btn" class="market-settings-btn" title="' + (MarketData.dcSelectorVisible ? '設定資料中心／我的世界' : '設定我的世界') + '">' +
            '<i class="ph ph-gear-six market-settings-gear"></i><span id="mk-settings-summary" class="market-settings-segs"><span class="mss mss-empty">尚未設定市場資訊</span></span>' +
          '</button>' +
        '</div>' +
        '<div class="market-tabs">' +
          '<button type="button" class="craft-tab-btn active" data-mk-tab="item">物品查詢</button>' +
          '<button type="button" class="craft-tab-btn" data-mk-tab="radar">製作商機</button>' +
          '<button type="button" class="craft-tab-btn" data-mk-tab="hot">熱度排行</button>' +
          '<button type="button" class="craft-tab-btn" data-mk-tab="tokens">代幣兌換</button>' +
        '</div>' +
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
    setupWatchlist();
    bindSearchBox();
    bindTabSwitch();
    renderRadarShell();
    MarketData.bindPricePrefsBars();
    MarketData.autoEnhanceSelects(); // 市場頁的下拉全部換成站內設計的自製下拉
    if (!prefsSupplyHooked) { // 全站取價設定改了：物品頁的供應鏈圖要原地重畫
      prefsSupplyHooked = true;
      MarketData.onPricePrefsChange(function () {
        const ctx = lastSupplyCtx;
        if (!ctx || !ctx.box.isConnected) return;
        Promise.resolve(renderSupplyChainWithBreakdown(ctx.itemId, ctx.rid, ctx.box)).then(function (freshDcData) {
          // 設定彈窗正開著：內容也要跟著重畫（例如基準切到「均價」才會出現「均價窗口」那一列），不用關掉再開。
          // 面板沿用原本的位置與方向（openSupplySettingsPopover 對「已開著」的面板就是這樣處理）。
          const pop = ensureAvgPricePopoverDom();
          if (lastSupplyCtx && lastSupplyCtx.box === ctx.box && ctx.box.isConnected && pop.style.display === 'block' && pop.dataset.owner === 'supply') { // 不能比對 ctx 物件本身：每次重畫 lastSupplyCtx 都會換成新物件，只能比容器
            openSupplySettingsPopover(ctx.box, ctx.itemId, ctx.rid, freshDcData);
          }
        });
      });
    }
    fitMarketHeights();
    const hashItem = readHashItem(); // 網址帶著物品（重新整理、分享連結）就直接開那個物品
    if (hashItem) openItemDetail(hashItem, { fromHash: true });

    $('mk-settings-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      const rp = $('mk-recent-pop'); if (rp) rp.style.display = 'none';
      openMarketSettingsPopover(this);
    });
    bindRecentBtn();
    mkBindCondGlobal();
  }

  /* 目前的市場設定摘要：分成幾段，每段「小圖示＋文字」，段與段之間用細線隔開。
   * 以前是一串「陸行鳥・利維坦・自動最低稅率」用・黏在一起的純文字，要逐字讀；現在每一段各有圖示，
   * 一眼分得出哪個是資料中心、哪個是我的世界、哪個是稅率。每一段的滑鼠提示說明它的作用。
   * 還沒設定時整個按鈕用橘色提示，提醒玩家去設定（不設定的話稅後估算跟賣出參考都沒有）。 */
  function updateMarketSettingsSummary() {
    if (window.MarketWatchlist) MarketWatchlist.onSettingsChanged(); // 資料中心／我的世界改了，清單的價格範圍要跟著重查
    const el = $('mk-settings-summary');
    if (!el || typeof MarketData === 'undefined') return;
    const s = MarketData.getSettings();
    const segs = [];
    if (s.dcName) segs.push('<span class="mss mss-dc" title="資料中心（買進、材料成本查價的範圍）"><i class="ph ph-globe-hemisphere-west"></i>' + s.dcName + '</span>');
    if (s.worldName) segs.push('<span class="mss mss-world" title="我的世界"><i class="ph ph-map-pin"></i>' + s.worldName + '</span>');
    if (s.dcName && s.worldName) {
      segs.push('<span class="mss mss-tax" title="' + (s.sellCityKey ? '賣出稅率：使用你手動選的城市' : '賣出稅率：自動採用目前稅率最低的城市') + '"><i class="ph ph-percent"></i>' + (s.sellCityKey ? '手動稅率' : '自動最低稅率') + '</span>');
    }
    el.innerHTML = segs.length ? segs.join('') : '<span class="mss mss-empty">尚未設定<span class="mk-long">市場資訊</span></span>';
    el.classList.toggle('has-world', !!s.worldName);
    const btn = $('mk-settings-btn');
    if (btn) {
      btn.classList.toggle('is-unset', !segs.length);
      // 窄到只剩圖示時，目前的設定改放在提示與無障礙名稱裡
      const plain = [s.dcName, s.worldName, (s.dcName && s.worldName) ? (s.sellCityKey ? '手動稅率' : '自動最低稅率') : ''].filter(Boolean).join('・') || '尚未設定市場資訊';
      btn.setAttribute('aria-label', '市場設定：' + plain);
      btn.title = (MarketData.dcSelectorVisible ? '設定資料中心／我的世界' : '設定我的世界') + '（目前：' + plain + '）';
    }
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
      '<div class="craft-settings-field"><label>我的世界</label><select id="mk-set-world" class="craft-select craft-select-block"><option value="">我的世界⋯</option></select></div>' +
      '<div class="craft-settings-field" id="mk-set-city-field" style="display:none"><label>賣出城市<span class="craft-muted">（決定賣方稅率）</span></label><select id="mk-set-city" class="craft-select craft-select-block"></select></div>' +
      '<div class="craft-settings-field"><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="mk-set-exclude-outlier"' + (MarketData.getSettings().excludeOutlierTrades ? ' checked' : '') + '><span>排除異常成交<span class="craft-muted">（單筆成交價跟其他成交的中位數比，差距同時超過1000金和10倍，就不算進均價）</span></span></label></div>';
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
    if (currentDetailItemId) loadMarketSection(currentDetailItemId, { keepView: true });
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
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 316)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
  }

  /* 搜尋框：直接查 ITEM_NAMES_TW_ALL（全物品，不限配方相關），跟生產頁的配方搜尋是兩套獨立索引，
   * 市場頁本來就該看得到裝備/雜物/家具這些不會出現在配方庫裡的東西。 */
  /* 物品能不能在市場交易：看更新腳本產生的可交易清單。沒有這份清單（資料沒載到）時一律當作可交易，
   * 不亂下「不可交易」的結論。注意這份清單可能比遊戲新物品慢一步，所以「不可交易」只用在提示，
   * 不拿來擋住查詢——有掛單就一定顯示（見 loadMarketSection）。 */
  let marketableSet = null;
  function isMarketable(id) {
    if (typeof ITEM_MARKETABLE_TW === 'undefined' || !ITEM_MARKETABLE_TW.length) return true;
    if (!marketableSet) marketableSet = new Set(ITEM_MARKETABLE_TW.map(String));
    return marketableSet.has(String(id));
  }
  // 台服可交易、但 Universalis 沒有資料的物品（例如國際服 7.5 已停用的舊染劑；台服版本較舊，仍可交易）。
  let noUniversalisSet = null;
  function isNoUniversalis(id) {
    if (typeof ITEM_NO_UNIVERSALIS_TW === 'undefined' || !ITEM_NO_UNIVERSALIS_TW.length) return false;
    if (!noUniversalisSet) noUniversalisSet = new Set(ITEM_NO_UNIVERSALIS_TW.map(String));
    return noUniversalisSet.has(String(id));
  }
  function bindSearchBox() {
    const input = $('mk-search');
    const box = $('mk-search-results');
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', 'mk-search-results'); input.setAttribute('aria-autocomplete', 'list');
    box.setAttribute('role', 'listbox');
    let debounceTimer = null;
    // 注音／拼音輸入法組字中，每敲一個鍵都會觸發 input，但那時的字根本還不是要搜的字：跳過，組字完成才搜。
    input.addEventListener('input', function (e) {
      clearTimeout(debounceTimer);
      if (e.isComposing) return;
      debounceTimer = setTimeout(runSearch, 120);
    });
    input.addEventListener('compositionend', function () { clearTimeout(debounceTimer); debounceTimer = setTimeout(runSearch, 0); });
    // 第一次搜尋要把 1.6 萬個名稱都正規化一遍，會讓第一個字卡一下；游標一點進搜尋框就趁空檔先算好。
    let warmed = false;
    input.addEventListener('focus', function () {
      if (warmed) return; warmed = true;
      const warm = function () {
        const ids = (typeof ITEM_MARKETABLE_TW !== 'undefined' && ITEM_MARKETABLE_TW.length) ? ITEM_MARKETABLE_TW : Object.keys(ITEM_NAMES_TW_ALL);
        for (let i = 0; i < ids.length; i++) { const nm = ITEM_NAMES_TW_ALL[ids[i]]; if (nm) normNameOf(ids[i], nm); }
      };
      if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 1500 }); else setTimeout(warm, 50);
    });
    // 結果清單的點擊用事件委派，只綁一次（原本每次搜尋都替每一列重綁 2 個監聽器）
    box.addEventListener('click', function (e) {
      const star = e.target.closest('[data-wl-star]');
      if (star) {
        e.stopPropagation(); // 只切換關注，不要當成「選了這個物品」
        const id = star.dataset.wlStar;
        const nowOn = MarketWatchlist.toggle(id, ITEM_NAMES_TW_ALL[id] || ('#' + id));
        star.classList.toggle('on', nowOn);
        star.textContent = nowOn ? '★' : '☆';
        star.title = nowOn ? '取消關注' : '加入關注';
        star.setAttribute('aria-label', star.title);
        return;
      }
      const el = e.target.closest('[data-mk-pick]');
      if (el) pick(el.dataset.mkPick);
    });
    function runSearch() {
      const q = input.value.trim();
      if (!q) { closeBox(); return; }
      // 只搜尋可在市場交易的物品（ITEM_MARKETABLE_TW 由 update-craft-data.js 產生）；
      // 貨幣、不可交易的物品不需要被直接搜尋到，仍可從其他物品的兌換清單點進去。
      const ids = (typeof ITEM_MARKETABLE_TW !== 'undefined' && ITEM_MARKETABLE_TW.length) ? ITEM_MARKETABLE_TW : Object.keys(ITEM_NAMES_TW_ALL);
      const qTokens = searchTokens(q);
      const qN = normSearch(q);
      if (!qTokens.length) { closeBox(); return; }
      const matches = [];
      for (let i = 0; i < ids.length; i++) {
        const name = ITEM_NAMES_TW_ALL[ids[i]];
        if (!name) continue;
        const nameN = normNameOf(ids[i], name);
        if (tokensMatch(nameN, qTokens)) matches.push({ id: ids[i], name: name, nameN: nameN });
      }
      // 第5點抓到的真正原因：純粹按物品ID排序，會讓「基礎材料」被自己衍生出來的一大堆裝備
      // 名稱排擠出前30名——例如「銀狼革」這個素材本身的ID，剛好比拿它做出來的33件裝備的ID都大，
      // 純ID排序下，光是這些裝備就佔滿了前30名，真正要找的素材反而看不到。不是抓不到資料
      // （這個物品在供應鏈圖上能正確顯示價格，證明資料完全存在），純粹是排序方式的問題。
      // 改成先比對「符合程度」：完全等於搜尋字串 > 開頭符合 > 只是包含在中間；
      // 同等級再比名字長度（越短越接近你在找的東西），最後才用ID排序當保底。
      function rank(nameN) {
        if (nameN === qN) return 0;
        if (nameN.indexOf(qN) === 0) return 1;
        return 2;
      }
      matches.sort(function (a, b) {
        const ra = rank(a.nameN), rb = rank(b.nameN);
        if (ra !== rb) return ra - rb;
        if (a.name.length !== b.name.length) return a.name.length - b.name.length;
        return Number(a.id) - Number(b.id);
      });
      // 原本這裡會砍到只留前30筆，是我自己加的上限，怕一次塞太多DOM節點卡頓。
      // 現在下拉清單本身有自己的捲軸能正常捲動，這個限制沒必要，拿掉——搜尋結果要列出全部。
      if (!matches.length) { box.innerHTML = '<div class="craft-muted" style="padding:8px">查無符合的物品</div>'; box.classList.add('open'); input.setAttribute('aria-expanded', 'true'); fitMarketHeights(); return; }
      // 一次最多畫 SEARCH_MAX 筆：搜「的」這種很短的字會符合上千個物品，每個都帶圖示一次全畫出來會卡；
      // 排序已經是「最像的在前面」，後面的用更完整的名稱就能縮小，所以超過的部分只提示筆數。
      const SEARCH_MAX = 30;
      const shown = matches.slice(0, SEARCH_MAX);
      box.innerHTML = shown.map(function (m, idx) {
        const on = isWatched(m.id);
        return '<div class="craft-search-item" role="option" id="mk-opt-' + idx + '" data-mk-pick="' + m.id + '">' + itemIconHtml(m.id, 24) + '<span>' + escHtml(m.name) + '</span>' +
          '<button type="button" class="wl-star' + (on ? ' on' : '') + '" data-wl-star="' + m.id + '" tabindex="-1" title="' + (on ? '取消關注' : '加入關注') + '" aria-label="' + (on ? '取消關注' : '加入關注') + '">' + (on ? '★' : '☆') + '</button></div>';
      }).join('') + (matches.length > SEARCH_MAX ? '<div class="craft-muted mk-search-more">還有 ' + (matches.length - SEARCH_MAX).toLocaleString() + ' 筆符合，輸入更完整的名稱可以縮小範圍</div>' : '');
      box.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
      activeIdx = -1; input.removeAttribute('aria-activedescendant');
      fitMarketHeights();
    }
    function pick(id) {
      input.value = ITEM_NAMES_TW_ALL[id] || '';
      closeBox();
      openItemDetail(id);
    }
    function closeBox() { box.innerHTML = ''; box.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); activeIdx = -1; fitMarketHeights(); }
    // 鍵盤：↑↓ 移動、Enter 選取（沒移動過就選第一個）、Esc 關閉
    let activeIdx = -1;
    function setActive(i) {
      const items = box.querySelectorAll('.craft-search-item');
      if (!items.length) return;
      activeIdx = (i + items.length) % items.length;
      items.forEach(function (el, k) { el.classList.toggle('is-active', k === activeIdx); el.setAttribute('aria-selected', k === activeIdx ? 'true' : 'false'); });
      const cur = items[activeIdx];
      input.setAttribute('aria-activedescendant', cur.id);
      cur.scrollIntoView({ block: 'nearest' });
    }
    input.addEventListener('keydown', function (e) {
      const open = box.classList.contains('open') && box.querySelector('.craft-search-item');
      if (e.key === 'ArrowDown') { if (!open) { runSearch(); return; } e.preventDefault(); setActive(activeIdx + 1); }
      else if (e.key === 'ArrowUp') { if (!open) return; e.preventDefault(); setActive(activeIdx <= 0 ? -1 : activeIdx - 1); }
      else if (e.key === 'Enter') {
        if (!open) return;
        e.preventDefault();
        const items = box.querySelectorAll('.craft-search-item');
        const cur = items[activeIdx >= 0 ? activeIdx : 0];
        if (cur) pick(cur.dataset.mkPick);
      } else if (e.key === 'Escape') { if (box.classList.contains('open')) { e.preventDefault(); closeBox(); } }
    });
    document.addEventListener('click', function (e) {
      if (!box.contains(e.target) && e.target !== input) { box.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); fitMarketHeights(); }
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
    // 用window.innerHeight（永遠固定，不受任何內容影響）乘上跟CSS一致的85%上限，
    // 再扣掉topFixed自己的實際高度（topFixed是flex-shrink:0，大小只取決於自己的內容，
    // 跟panesFlex完全無關）——這樣算出來的值第一次就是對的，不用等好幾次點擊才收斂。
    const viewportCap = window.innerHeight * 0.85;
    const topFixedH = topFixed.getBoundingClientRect().height;
    const available = Math.max(160, Math.floor(viewportCap - topFixedH));
    panesFlex.style.height = available + 'px';
  }
  window.addEventListener('resize', function () { fitMarketHeights(); });

  /* ── 篩選條件列＋條件面板（製作商機／熱度排行／代幣兌換共用）──
   * 條件列永遠只有一行：「篩選」按鈕（有文字、有生效條件數）＋目前條件（單行、放不下就淡出）。
   * 條件面板浮在列表上方、不推擠列表，所以展開／收合不會讓列表跳動，也不用重算高度。
   * 面板內的按鈕、勾選框全部沿用各分頁原本的元素與事件，這裡只負責開關、擺位置、摘要。 */
  const condUpdaters = {}; // 各分頁註冊「重畫條件摘要」的函式；全站取價設定改了要一起更新
  function condFoldBtnHtml(p) {
    return '<button type="button" class="market-fold-btn" id="mk-' + p + '-fold-btn" aria-expanded="false" aria-haspopup="true">' +
      '<i class="ph ph-funnel"></i><span class="mk-fold-l">篩選</span>' +
      '<span class="market-fold-sum" id="mk-' + p + '-fold-sum"></span><i class="ph ph-caret-down market-fold-caret"></i></button>';
  }
  function condDoneHtml() { return '<div class="mk-cpanel-foot"><button type="button" class="market-solve-btn mk-cpanel-done">完成</button></div>'; }
  function mkSetChips(prefix, chips, n) {
    const sum = $('mk-' + prefix + '-fold-sum');
    if (sum) sum.innerHTML = chips.map(function (c) { return '<span>' + escHtml(c) + '</span>'; }).join('<i class="mk-chip-dot">·</i>');
  }
  // 全站取價設定（買入／賣出的範圍與基準）的摘要：條件面板收起時也看得到目前用哪一套
  function mkPrefsChips(sides) {
    try {
      const p = MarketData.getPricePrefs(), w = MarketData.getSettings().worldName;
      return sides.map(function (side) {
        return (side === 'buy' ? '買入 ' : '賣出 ') + (p[side + 'Scope'] === 'world' ? (w || '我的世界') : '所有世界') + '・' + (p[side + 'Basis'] === 'avg' ? '均價' : '最低價');
      });
    } catch (e) { return []; }
  }
  function panelPrefix(p) { return p.id.replace(/^mk-/, '').replace(/-fold$/, ''); }
  // 面板最高高度：桌面版分頁是固定高度（超出會被裁掉），所以算到分頁底部；手機版整頁在捲，最高 70% 視窗
  function mkFitPanel(panel) {
    const cond = panel.closest('.mk-cond'), pane = panel.closest('.market-pane');
    let avail = window.innerHeight * 0.7;
    if (cond && pane && getComputedStyle(pane).overflow === 'hidden') {
      avail = Math.min(avail, pane.getBoundingClientRect().bottom - cond.getBoundingClientRect().bottom - 12);
    } else if (cond) { // 整頁在捲的版面：留出右下角「關注」按鈕的位置，面板底部的「完成」才不會被它蓋住
      avail = Math.min(avail, window.innerHeight - cond.getBoundingClientRect().bottom - 96);
    }
    panel.style.maxHeight = Math.max(160, Math.floor(avail)) + 'px';
  }
  function mkSetPanel(prefix, open) {
    const panel = $('mk-' + prefix + '-fold'), btn = $('mk-' + prefix + '-fold-btn');
    if (!panel || !btn) return;
    if (open) document.querySelectorAll('.mk-cpanel.on').forEach(function (p) { if (p !== panel) mkSetPanel(panelPrefix(p), false); });
    panel.classList.toggle('on', !!open);
    btn.classList.toggle('open', !!open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { mkFitPanel(panel); panel.scrollTop = 0; }
  }
  let condGlobalBound = false;
  function mkBindCondGlobal() {
    if (condGlobalBound) return;
    condGlobalBound = true;
    // 用 pointerdown 判斷「點到外面」：click 發生時，面板裡被重畫過的按鈕已經不在 DOM 裡，會誤判成點外面
    document.addEventListener('pointerdown', function (e) {
      document.querySelectorAll('.mk-cpanel.on').forEach(function (p) {
        const c = p.closest('.mk-cond');
        if (c && !c.contains(e.target)) mkSetPanel(panelPrefix(p), false);
      });
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.mk-cpanel.on').forEach(function (p) { mkSetPanel(panelPrefix(p), false); });
    });
    document.addEventListener('click', function (e) {
      const d = e.target.closest && e.target.closest('.mk-cpanel-done');
      const p = d && d.closest('.mk-cpanel');
      if (p) mkSetPanel(panelPrefix(p), false);
    });
    window.addEventListener('resize', function () { document.querySelectorAll('.mk-cpanel.on').forEach(mkFitPanel); });
    MarketData.onPricePrefsChange(function () { Object.keys(condUpdaters).forEach(function (k) { try { condUpdaters[k](); } catch (e) { /* 單一分頁出錯不影響其他 */ } }); });
  }

  /* 單行橫向捲動（職業、世界範圍這類「選一個」的按鈕列）：不換行；放不下的往旁邊捲，邊緣淡出提示後面還有。
   * 滑鼠滾輪直接橫向捲（只有真的放不下才攔截）；觸控本來就能滑。沿用「最近查看」以前那套做法。 */
  function mkEnhanceHScroll(sc) {
    if (!sc || sc.dataset.hs) return;
    sc.dataset.hs = '1';
    // 外面包一層容器：淡出遮罩只作用在按鈕列（sc），兩端的指向菱形放在容器上，才不會被一起淡掉
    const wrap = document.createElement('div');
    wrap.className = 'mk-hs-wrap';
    wrap.style.marginBottom = getComputedStyle(sc).marginBottom;
    sc.style.marginBottom = '0';
    sc.parentNode.insertBefore(wrap, sc);
    wrap.appendChild(sc);
    // 放不下時，兩端各一個「指向菱形」（沿用頂部選單展開提示的造型，轉成朝左／朝右）：點了往該方向捲，出現時輕輕晃三下提醒
    const chev = (window.NRO && window.NRO.chevSvg) ? window.NRO.chevSvg() : '';
    ['l', 'r'].forEach(function (dir) {
      const b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1; b.className = 'mk-hs-btn ' + dir;
      b.setAttribute('aria-label', dir === 'l' ? '往左捲動' : '往右捲動');
      b.innerHTML = '<span class="mk-hs-glyph">' + (chev ? chev.replace('<svg ', '<svg aria-hidden="true" ') : '<i class="ph ph-caret-' + (dir === 'l' ? 'left' : 'right') + '"></i>') + '</span>';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        sc.scrollBy({ left: (dir === 'l' ? -1 : 1) * Math.max(120, sc.clientWidth * 0.7), behavior: 'smooth' });
      });
      wrap.appendChild(b);
    });
    const edges = function () {
      sc.classList.toggle('can-l', sc.scrollLeft > 4);
      sc.classList.toggle('can-r', sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 4);
    };
    sc.addEventListener('scroll', edges, { passive: true });
    sc.addEventListener('wheel', function (e) {
      if (sc.scrollWidth <= sc.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      sc.scrollLeft += e.deltaY; e.preventDefault();
    }, { passive: false });
    // 滑鼠按住拖動捲動（觸控本來就能滑）：移動超過 5px 才算拖動，所以單純點按鈕不受影響；
    // 拖動結束後那一下 click 會被吃掉，免得拖完放開時誤選到底下的按鈕
    let drag = null, dragged = false;
    sc.addEventListener('pointerdown', function (e) {
      dragged = false;
      if (e.pointerType !== 'mouse' || e.button !== 0 || sc.scrollWidth <= sc.clientWidth) return;
      drag = { x: e.clientX, left: sc.scrollLeft, id: e.pointerId, on: false };
    });
    sc.addEventListener('pointermove', function (e) {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.on) {
        if (Math.abs(dx) < 5) return;
        drag.on = true; dragged = true;
        sc.classList.add('is-dragging');
        try { sc.setPointerCapture(drag.id); } catch (err) { /* 抓不到就算了，拖到外面只是少了持續追蹤 */ }
      }
      sc.scrollLeft = drag.left - dx;
    });
    const endDrag = function () { if (drag && drag.on) sc.classList.remove('is-dragging'); drag = null; };
    sc.addEventListener('pointerup', endDrag);
    sc.addEventListener('pointercancel', endDrag);
    sc.addEventListener('click', function (e) { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
    if (window.ResizeObserver) new ResizeObserver(edges).observe(sc); else window.addEventListener('resize', edges);
    requestAnimationFrame(edges);
  }
  function mkHScrollInto(el) { // 把被選到的那顆捲到看得見的位置
    const sc = el && el.parentElement;
    if (!sc || sc.scrollWidth <= sc.clientWidth) return;
    sc.scrollLeft = Math.max(0, el.offsetLeft - (sc.clientWidth - el.offsetWidth) / 2);
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
      list = list.slice(0, 30);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) { /* localStorage被封鎖（例如私密瀏覽）就靜默放棄，不影響其他功能 */ }
  }
  /* 價格太長時的簡寫（只用在空間很窄的地方：各世界最低價格子、統計列）：
   * 100萬以上改用「萬」、1億以上改用「億」，台服玩家看價格本來就習慣萬為單位；一千萬以內保留到小數點一位，
   * 以上取整數（1190萬、5億）。完整數字永遠放在滑鼠提示跟下方表格裡，簡寫只是為了「放得下、看得清楚」。 */
  function fmtCompactGil(n, from) {
    if (from && n < from) return Math.round(n).toLocaleString();
    if (n >= 1e8) { const v = n / 1e8; return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + '億'; }
    if (n >= 1e6) { const v = n / 1e4; return (v >= 1000 ? Math.round(v) : Math.round(v * 10) / 10) + '萬'; }
    return n.toLocaleString();
  }
  /* 最近查看：以前是自動換行的一大片標籤（20個物品在一般視窗寬度下會掉成兩排、約66px高），
   * 現在固定單行（約32px高），放不下的往右捲：滑鼠滾輪直接橫向捲動、左右各有一顆小箭頭、
   * 邊緣用漸層淡出提示「後面還有」。省下的高度還給下面的內容。
   * 目前正在看的那個物品用金色框標出來，一眼知道「我現在在哪一個」。最右邊可以清除紀錄。 */
  /* 滑鼠按住最近查看那一排左右拖動（觸控螢幕本來就能直接滑，這裡只處理滑鼠）。
   * 拖動超過4px才算「在拖」，這時放開滑鼠不能順便觸發標籤的點擊（不然拖完會誤開一個物品）；
   * 監聽器只在載入時掛一次（renderRecentlyViewed 每開一個物品就重畫一次，不能在裡面掛，否則會越疊越多）。 */
  let recentDrag = null, recentSuppressClick = false;
  window.addEventListener('pointermove', function (e) {
    if (!recentDrag) return;
    const dx = e.clientX - recentDrag.x;
    if (!recentDrag.moved && Math.abs(dx) > 4) { recentDrag.moved = true; recentDrag.sc.classList.add('is-dragging'); }
    if (recentDrag.moved) recentDrag.sc.scrollLeft = recentDrag.left - dx;
  });
  window.addEventListener('pointerup', function () {
    if (!recentDrag) return;
    const d = recentDrag; recentDrag = null;
    d.sc.classList.remove('is-dragging');
    if (d.moved) { recentSuppressClick = true; setTimeout(function () { recentSuppressClick = false; }, 0); } // click 事件緊接在 pointerup 之後，同一輪就會被擋掉
  });
  /* 最近查看改成工具列上的 🕘 按鈕＋浮層（不再佔一整列高度）：
   * 一次列出全部紀錄（圖示＋完整名稱，目前正在看的用金框），不用橫向滑動；點一下就開那個物品。
   * 不用「搜尋框聚焦才顯示」：手機一聚焦就跳鍵盤，只想挑最近物品的人會被鍵盤擋住。 */
  function ensureRecentPopDom() {
    let pop = $('mk-recent-pop');
    if (pop) return pop;
    pop = document.createElement('div');
    pop.id = 'mk-recent-pop';
    pop.className = 'craft-mat-worlds-popover mk-recent-pop';
    pop.style.display = 'none';
    document.body.appendChild(pop);
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#mk-recent-btn')) return; pop.style.display = 'none'; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') pop.style.display = 'none'; });
    return pop;
  }
  function renderRecentlyViewed() {
    const btn = $('mk-recent-btn');
    if (!btn) return;
    const list = getRecentlyViewed();
    btn.classList.toggle('is-empty', !list.length);
    const label = list.length ? '最近查看（' + list.length + '）' : '最近查看（還沒有紀錄）';
    btn.title = label; btn.setAttribute('aria-label', label);
    const pop = ensureRecentPopDom();
    pop.innerHTML = '<p class="craft-mat-worlds-title">最近查看</p>' + (list.length
      ? '<div class="mk-recent-list">' + list.map(function (r) {
          return '<button type="button" class="mk-recent-item' + (String(r.id) === String(currentDetailItemId) ? ' is-current' : '') + '" data-mk-recent="' + r.id + '" title="' + escHtml(r.name) + '">' + itemIconHtml(r.id, 20) + '<span>' + escHtml(r.name) + '</span></button>';
        }).join('') + '</div><div class="mk-recent-foot"><button type="button" class="mk-recent-clear"><i class="ph ph-x"></i> 清除紀錄</button></div>'
      : '<p class="craft-muted" style="margin:4px 0 6px">還沒有查看紀錄。查看過的物品會出現在這裡。</p>');
    pop.querySelectorAll('[data-mk-recent]').forEach(function (el) {
      el.addEventListener('click', function () { pop.style.display = 'none'; openItemDetail(el.dataset.mkRecent); });
    });
    const clr = pop.querySelector('.mk-recent-clear');
    if (clr) clr.addEventListener('click', function () {
      try { localStorage.removeItem(RECENT_KEY); } catch (e) { /* 被封鎖就算了 */ }
      renderRecentlyViewed();
    });
  }
  function bindRecentBtn() {
    const btn = $('mk-recent-btn');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function () {
      const pop = ensureRecentPopDom();
      if (pop.style.display === 'flex') { pop.style.display = 'none'; return; }
      renderRecentlyViewed();
      pop.style.display = 'flex';
      delete pop.dataset.dir; // 每次重新決定往上或往下開
      placePopover(pop, btn.getBoundingClientRect(), 0);
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
      ? '<img src="' + url + '" width="' + size + '" height="' + size + '" class="market-item-icon" alt="" loading="lazy" decoding="async">'
      : '<span class="market-item-icon market-item-icon-fallback" style="width:' + size + 'px;height:' + size + 'px"><i class="ph ph-cube"></i></span>';
  }

  /* 統一的「物品引用」：畫面上任何「這是某個物品」的圖示或名稱，都用這個函式輸出。
   * 好處：一律可點、一律有同樣的提示（平常淡淡的點狀底線，滑過變實線），不會再有漏網之魚；
   * 輸出的是真正的連結（href＝該物品頁網址），所以 Ctrl／Cmd／中鍵點擊可以在新分頁開、右鍵能複製連結。
   * o.icon＝圖示尺寸（不給就不放圖示）；o.name＝是否顯示名稱；o.cls＝額外 class；o.title＝自訂提示。 */
  function itemRefHtml(itemId, o) {
    o = o || {};
    const id = String(itemId);
    const nm = ITEM_NAMES_TW_ALL[id] || ('#' + id);
    const inner = (o.icon ? itemIconHtml(id, o.icon) : '') + (o.name ? '<span class="mk-itemref-name">' + escHtml(nm) + '</span>' : '');
    return '<a class="mk-itemref' + (o.cls ? ' ' + o.cls : '') + '" href="#page=market&item=' + encodeURIComponent(id) + '" data-mk-itemref="' + id + '" title="' + escHtml(o.title || ('查看「' + nm + '」')) + '">' + inner + '</a>';
  }
  // 用「捕獲階段」搶在外層整列的點擊之前處理：點到哪個物品就去哪個，不會被整列的目標吃掉。
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('[data-mk-itemref]');
    if (!a) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // 帶修飾鍵＝交給瀏覽器開新分頁
    e.preventDefault(); e.stopPropagation();
    openItemDetail(a.dataset.mkItemref);
  }, true);

  /* 物品名稱旁的「版本・分類」，例如「6.2・布料」：版本來自 Teamcraft、分類來自台服遊戲資料表（資料由 update-craft-data.js 產生） */
  function itemMetaHtml(itemId) {
    if (typeof ITEM_META_TW === 'undefined') return '';
    const v = ITEM_META_TW[itemId]; if (!v) return '';
    const patch = ITEM_PATCH_TW[Math.floor(v / 1000)]; const cat = ITEM_CATEGORY_TW[v % 1000];
    // 以前是一行灰色小字「版本 7.0・木材」，混在名稱旁邊看起來像雜訊；改成兩顆低調的小標籤，
    // 版本（藍綠色）跟分類（金色）用不同色調區分，一眼認得出「這是屬性資訊」，又不搶名稱跟價格的風頭。
    const chips = [];
    if (patch) chips.push('<span class="market-meta-chip market-meta-ver" title="這個物品新增於版本 ' + patch + '">版本 ' + patch + '</span>');
    if (cat) chips.push('<span class="market-meta-chip market-meta-cat" title="物品分類">' + cat + '</span>');
    return chips.length ? '<span class="market-detail-meta">' + chips.join('') + '</span>' : '';
  }

  function openItemDetail(itemId, o) {
    itemId = String(itemId);
    o = o || {};
    closeNpcModal();
    closeChainModal(); // 供應鏈彈窗開著時換物品（點材料卡、返回、點最近查看）：先收掉，免得疊在新頁面上
    let og = null;
    if (!o.back) { og = captureOrigin(itemId); if (og) { navStack.push(og); if (navStack.length > 20) navStack.shift(); } }
    detailViewState = o.restoreView || null; // 開新物品＝從預設視圖開始（分頁、世界、篩選都重置）；只有改設定的重畫才沿用
    const name = ITEM_NAMES_TW_ALL[itemId] || ('#' + itemId);
    currentDetailItemId = itemId; // 要在重畫「最近查看」之前設定，才標得出目前正在看哪一個
    if (!(o && o.fromHash)) { if (og && og.kind === 'tab') pushTabHash(og.tab); syncHash(itemId, true); }
    recordRecentlyViewed(itemId, name);
    renderRecentlyViewed();
    document.querySelector('[data-mk-tab="item"]').click();
    $('mk-pane-item').innerHTML =
      '<div class="market-detail-columns mk-v2" id="mk-cols"><div class="mk-col-info">' +
      backRowHtml() + '<div class="market-detail-header">' + itemIconHtml(itemId, 40) + '<h3>' + name + itemMetaHtml(itemId) + '<span class="mk-npc" id="mk-npc"></span></h3>' +
        '<button type="button" class="market-history-btn market-watch-btn-header" id="mk-watch-btn"></button>' +
        '<button type="button" class="market-solve-btn" id="mk-solve-btn" title="製作求解" aria-label="製作求解" disabled><i class="ph ph-flask"></i><span class="mk-btn-l"> 查詢是否可製作⋯</span></button>' +
        '<button type="button" class="market-solve-btn" id="mk-obtain-btn" title="取得方式" aria-label="取得方式"><i class="ph ph-swap"></i><span class="mk-btn-l"> 取得方式</span></button>' +
      '</div>' +
      '<div class="market-decision-band" id="mk-decision-band" hidden><div class="mdb-stats" id="mk-band-stats"></div><div class="mdb-verdict" id="mk-band-verdict"></div></div>' +
        '<div class="mk-info-world" id="mk-info-world"></div>' +
        '<div class="mk-info-notes" id="mk-info-notes"></div>' +
      '</div>' + // 結束左欄（物品名稱＋資訊）
      '<div id="mk-detail-market" class="market-detail-section market-col-market"><p class="craft-muted">讀取市場資料中⋯</p></div>' +
      '</div>' +
      // 供應鏈圖平常畫在這個看不見的容器裡（買/做結論要靠它算）；按「供應鏈」才整個搬進彈窗，關掉再搬回來
      '<div id="mk-detail-supply" class="mk-chain-host" aria-hidden="true"></div>';
    const backBtn = $('mk-back-btn'); if (backBtn) backBtn.addEventListener('click', goBack);
    (function () { const hd = $('mk-pane-item').querySelector('.market-detail-header'); if (hd) { fitDetailHeader(hd); mkObserveFit(hd, function () { fitDetailHeader(hd); }); } })();
    ensureNpcPrices().then(function () { // 固定價格，載入後補在名稱旁；沒有（NPC 不收）就不顯示
      const el = $('mk-npc'); const pr = npcPriceOf(itemId);
      if (el && currentDetailItemId === itemId && pr > 0) {
        el.title = '賣給系統 NPC 的固定價格';
        el.innerHTML = '<span class="mk-npc-l">NPC 收購</span> <b>' + pr.toLocaleString() + '</b> <span class="mk-npc-l">Gil</span>';
      }
    });
    bindWatchButton(itemId); // 跟名稱同一行，不用等市場資料回來才看得到，關注這件事跟查不查得到價格無關
    if (!isMarketable(itemId)) { const wb = $('mk-watch-btn'); if (wb) { wb.disabled = true; wb.title = '不能在市場交易的物品沒有價格可以關注'; } }
    bindSolveButton(itemId);
    loadMarketSection(itemId, o.restoreView ? { keepView: true } : undefined);
    loadSupplyChainSection(itemId);
    bindObtainButton(itemId);
  }

  /* 「取得方式」——彈窗本體在 js/obtain-ui.js，資料是 data/obtain.json（第一次點開才下載，之後留在記憶體）。
   * 價格比較、物品名稱／圖示、製作配方這些「這個頁面才有的東西」由這裡透過 bridge 提供給彈窗，
   * 價格怎麼算（市價基準、流動性）完全沿用這個檔案原有的函式，彈窗自己不重算任何價格。 */
  function obtainBridge() {
    return {
      name: function (id) { return ITEM_NAMES_TW_ALL[id] || ('#' + id); },
      icon: function (id, size) { return itemIconHtml(id, size); },
      gotoItem: function (id) { openItemDetail(id); },
      gotoCraft: function (rid) { openCraftSolverModal(rid); },
      priceCtx: async function () {
        const dcData = await getPrecomputedAllData();
        return { settings: getSupplySettings(), dcData: dcData || { items: {} } };
      },
      /* 每個成品要花多少錢（成本／一次拿到的數量）跟市價比，沿用原本 tradeSideValue / tradeItemPrice。
       * 任何一邊算不出來（例如沒有市價的貨幣）就不顯示，不亂猜。 */
      verdict: function (ctx, costs, amount, itemId) {
        const basis = ctx.settings.materialsBasis;
        const raw = tradeSideValue(costs, ctx.dcData, basis);
        const price = tradeItemPrice(itemId, ctx.dcData, basis);
        if (raw == null || price == null || !amount) return '';
        const unit = raw / amount;
        const better = price > unit;
        const g = function (n) { return Math.round(n).toLocaleString('zh-TW'); };
        return '<span class=\"ob-verdict ' + (better ? 'good' : 'bad') + '\">兌換成本約 ' + g(unit) + ' 金（市價 ' + g(price) + ' 金）・' + (better ? '兌換較划算' : '直接買較便宜') + '</span>';
      },
      recipes: async function (itemId) {
        await ensureCraftDataLoaded();
        if (typeof CRAFT_RECIPES === 'undefined') return [];
        return (buildToRecipesIndex()[itemId] || []).map(function (rid) { return { rid: rid, recipe: CRAFT_RECIPES[rid] }; });
      },
    };
  }
  function bindObtainButton(itemId) {
    const btn = $('mk-obtain-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (typeof ObtainUI === 'undefined') { alert('取得方式模組載入失敗，請重新整理頁面'); return; }
      ObtainUI.setBridge(obtainBridge());
      ObtainUI.open(itemId);
    });
  }
  // 第7點：查這個物品能不能製作，能的話按下去直接跳到生產頁面、預先選好這個配方；
  // 不能製作（原礦、打寶、兌換來的東西）就顯示「無法製作」，不能點。
  async function bindSolveButton(itemId) {
    const btn = $('mk-solve-btn');
    if (!btn) return;
    await ensureCraftDataLoaded();
    if (typeof CRAFT_RECIPES === 'undefined') { btn.innerHTML = '<i class="ph ph-flask"></i><span class="mk-btn-l"> 無法製作</span>'; btn.title = '無法製作'; btn.setAttribute('aria-label', '無法製作'); btn.classList.add('market-solve-btn-disabled'); refitDetailHeader(); return; }
    const rid = (buildToRecipesIndex()[itemId] || [])[0];
    if (!rid) { btn.innerHTML = '<i class="ph ph-flask"></i><span class="mk-btn-l"> 無法製作</span>'; btn.title = '無法製作'; btn.setAttribute('aria-label', '無法製作'); btn.classList.add('market-solve-btn-disabled'); refitDetailHeader(); return; }
    btn.innerHTML = '<i class="ph ph-flask"></i><span class="mk-btn-l"> 製作求解</span>'; btn.title = '製作求解'; btn.setAttribute('aria-label', '製作求解');
    btn.disabled = false;
    refitDetailHeader();
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
  /* 把浮動面板放在錨點旁邊。
   * 方向（往下／往上）只在「剛打開」的那一刻決定一次，之後固定：以前每次高度改變都重新判斷，
   * 展開「個別材料品質」讓面板變高時，原本往下開的面板就突然翻到錨點上方、蓋住整張供應鏈圖，看起來像跳掉。
   * 決定方向時用 reserveH（面板「全部展開」後的最高高度）來判斷放不放得下，這樣一開始選的那一邊，之後展開也一定放得下。
   * 兩邊都放不下就選空間大的那邊，限制最大高度、在面板內自己捲動。
   * 錨點下緣（往下開）或上緣（往上開）固定不動，展開時只往另一個方向長。 */
  function placePopover(pop, anchorRect, reserveH) {
    const margin = 8, gap = 6;
    pop.style.overflowY = 'auto';
    pop.style.maxHeight = (window.innerHeight - margin * 2) + 'px';
    pop.style.left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - pop.offsetWidth - margin)) + 'px';
    const below = window.innerHeight - anchorRect.bottom - gap - margin;
    const above = anchorRect.top - gap - margin;
    let dir = pop.dataset.dir;
    if (!dir) {
      const need = Math.max(pop.offsetHeight, reserveH || 0);
      dir = need <= below ? 'below' : (need <= above ? 'above' : (above > below ? 'above' : 'below'));
      pop.dataset.dir = dir;
    }
    pop.style.maxHeight = Math.max(80, Math.min(dir === 'below' ? below : above, window.innerHeight - margin * 2)) + 'px';
    const effH = pop.offsetHeight; // 套用最大高度後的實際高度
    const top = dir === 'below' ? anchorRect.bottom + gap : anchorRect.top - gap - effH;
    // 最後一道保險：不管錨點在哪（甚至已經捲出畫面外），面板一定夾回畫面內
    pop.style.top = Math.max(margin, Math.min(top, window.innerHeight - margin - effH)) + 'px';
  }
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
    delete pop.dataset.dir; // 剛打開才重新決定往上還是往下開，之後內容變化沿用同一邊（見 placePopover）
    pop.dataset.owner = 'avg';
    pop.classList.add('mav-pop');
    pop.innerHTML = '<p class="mav-title">均價比較' + scopeLabel + '</p><p class="craft-muted" style="font-size:13px;margin:0">讀取歷史成交中⋯</p>';
    pop.style.display = 'block';
    placePopover(pop, anchorBtn.getBoundingClientRect());
    try {
      const w = await MarketData.getAvgWindows(itemId, scopeWorld || undefined); // 共用一份（市場頁、生產頁同一套：件數加權、已排除異常成交）
      if (!w) throw new Error('avg windows failed');
      pop.innerHTML = '<p class="mav-title">均價比較' + scopeLabel + '<span class="mav-help" title="都是實際成交的平均，已排除異常成交（可在設定裡關閉）。「目前掛單」是現在架上還沒賣掉的掛單價格平均（已排除亂標價，跟成交均價同一套規則），不是成交價。">？</span></p>' + MarketData.avgWindowRowsHtml(w) +
        '<div class="mav-row mav-listing" id="mk-avgprice-listing" title="現在架上還沒賣掉的掛單價格平均（已排除亂標價，跟成交均價同一套規則），不是成交價"><span class="mav-l">掛單</span><span class="mav-bar"></span><strong>⋯</strong><small>金</small><em class="mav-chg"></em></div>';
      placePopover(pop, anchorBtn.getBoundingClientRect()); // 內容換了，高度變了：方向沿用，只重新算位置
      // 第3點：把「目前掛單均價」也列進來當參考——這是現在架上還沒賣掉的掛單價格平均，跟上面的「成交均價」是不同的東西。
      // 這裡改成跟均價徽章用同一個來源（Universalis 官方算好的 currentAveragePrice），不要自己另外抓一批掛單
      // 重新算平均——之前兩邊各自算，物品掛單一多，兩個「掛單均價」數字就會兜不起來，看起來像bug。
      try {
        const st = MarketData.getSettings();
        // 「所有世界」：直接用頁面上已校正、已排除亂標價的同一個數字（fallbackAvg），不重查，也不會跟徽章對不上；
        // 選了單一世界：查那個世界自己的掛單（單一世界端點本來就是各世界自己的資料，不需要再校正）
        let listingAvg;
        if (!scopeWorld && fallbackAvg != null) listingAvg = fallbackAvg;
        else { const ov2 = await MarketData.getItemMarketOverviewEx(itemId, scopeWorld || undefined, { noRefresh: true }); listingAvg = ov2 && ov2.avgPrice; }
        const row = document.getElementById('mk-avgprice-listing');
        if (row) { row.querySelector('strong').textContent = listingAvg ? Math.round(listingAvg).toLocaleString() : '—'; if (!listingAvg) row.querySelector('small').textContent = '無掛單'; }
      } catch (e) { const row = document.getElementById('mk-avgprice-listing'); if (row) { row.querySelector('strong').textContent = '—'; row.querySelector('small').textContent = '讀取失敗'; } }
    } catch (e) {
      pop.innerHTML = '<p class="mav-title">均價比較' + scopeLabel + '</p><p class="craft-muted" style="font-size:13px;margin:0">讀取失敗，請稍後再試。</p>';
    }
  }

  /* 供應鏈圖的5窗口均價（當前/1天/3天/7天/30天）——跟物品詳情頁那個均價彈窗同一套算法
   * （一次抓30天完整成交紀錄，5個窗口都是本地端切的，不是5次API），只是這裡要給圖上
   * 好幾張卡片共用，所以包成一個可以查快取的版本，同一個物品一個畫面裡只抓一次。
   * 注意：這套窗口均價不分NQ/HQ（跟物品詳情頁那個彈窗一樣），跟「掛單最低價」會分NQ/HQ不同。 */
  let liveAvgCache = {}; // itemId -> {current,'1d','3d','7d','30d'}（只存成功的結果；失敗不存，下次會重查）
  const liveAvgTime = {}; // itemId -> 存進快取的時間，超過 LIVE_AVG_TTL 就當作過期重查（以前成功的結果一直留到重新整理頁面）
  const LIVE_AVG_TTL = 10 * 60 * 1000;
  function liveAvgFresh(id) { return liveAvgCache[id] !== undefined && Date.now() - (liveAvgTime[id] || 0) < LIVE_AVG_TTL; }
  async function fetchLiveAvgWindows(itemId) {
    if (liveAvgFresh(itemId)) return liveAvgCache[itemId];
    try {
      const w = await MarketData.getAvgWindows(itemId);
      if (!w) return null;
      const windows = { current: w.current, '1d': w.d1, '3d': w.d3, '7d': w.d7, '30d': w.d30 };
      liveAvgCache[itemId] = windows; liveAvgTime[itemId] = Date.now();
      return windows;
    } catch (e) { return null; } // 失敗不記進快取：下次再需要時會重新查
  }
  async function ensureLiveAvgForItems(itemIds) {
    const need = itemIds.filter(function (id) { return !liveAvgFresh(id); });
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
    return radarUnitPrice(mr, persp, 'listing') || listingPriceWithPersp(mr, 'auto'); // 指定的品質沒有掛單：視同自動
  }
  /* 品質標籤：永遠標出「這個價格實際買到的品質」（NQ／HQ）。玩家固定了品質且該品質真的有掛單＝pinned（實心＋圖釘）；
   * 沒固定、或固定的品質沒有掛單（等於沒生效）都當自動，只顯示實際品質。只有NQ、HQ兩種掛單都有時才能點著切換。
   * 成交均價不分品質，沒有標籤。價格選法必須跟 listingPriceWithPersp 一致，標籤才不會說謊。 */
  function qualityInfo(mr, id, settings) {
    if (!mr || (settings && settings.materialsBasis === 'avg')) return null;
    const nq = radarUnitPrice(mr, 'nq', 'listing'), hq = radarUnitPrice(mr, 'hq', 'listing');
    if (nq == null && hq == null) return null;
    const ov = (settings && settings.hqOverrides && settings.hqOverrides[id]) || (settings && settings.matPersp); // 個別設定優先，沒有就跟全域
    let q, pinned = false;
    if ((ov === 'nq' && nq != null) || (ov === 'hq' && hq != null)) { q = ov; pinned = true; }
    else q = (nq != null && (hq == null || nq <= hq)) ? 'nq' : 'hq';
    return { q: q, pinned: pinned, both: nq != null && hq != null };
  }
  function qChipHtml(id, info) {
    if (!info) return '';
    const tag = info.both ? 'button' : 'span';
    return '<' + tag + (info.both ? ' type="button"' : '') + ' class="mk-qchip' + (info.pinned ? ' is-pin' : '') + (info.both ? '' : ' is-static') + '" data-qchip="' + id + '"' +
      (info.both ? ' title="點一下切換：自動／NQ／HQ"' : '') + '>' + (info.pinned ? '<i class="ph ph-push-pin"></i>' : '') + (info.q === 'hq' ? 'HQ' : 'NQ') + '</' + tag + '>';
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
      txnFreq: liquidityOf('x', { items: { x: row } }).txnFreq, // 成交頻率（筆/天），跟熱度排行、代幣兌換同一套；近30天成交不到5筆時是 0
      // 每日成交額（金/天）：窗口內成交金額加總 ÷ 窗口天數，跟熱度排行「每日成交額」同一套；沒有資料（成交太少）是 null
      turnover: (row[3] && HOT_TIER_DAYS[row[3][0]]) ? row[3][5] / HOT_TIER_DAYS[row[3][0]] : null,
    };
  }

  /* 供應鏈圖的「自製 vs 直購」比較，跟製作商機共用同一份預先計算資料（dcData），
   * 不用另外發一輪查價請求。資料超過24小時沒更新就當作沒有，呼叫端會顯示「暫無法比較」，
   * 不會拿過期資料硬算出一個看起來很篤定、實際上已經是舊行情的數字。 */
  /* 物品頁剛查到的「即時掛單」會蓋到快照的對應列上：標頭顯示的價格跟下面供應鏈用的價格必須是同一個，
   * 不然同一頁同一個物品會出現兩個不同的價（快照最多落後一個排程週期）。只蓋當前看的物品，5分鐘內有效。 */
  const liveRowOverlay = {}; // itemId -> { time, listings }
  function setLiveOverlay(itemId, listings) { liveRowOverlay[String(itemId)] = { time: Date.now(), listings: (listings || []).slice() }; }
  function overlayRowFor(itemId, scopeKey, base) {
    const o = liveRowOverlay[String(itemId)];
    let minN = null, minH = null;
    o.listings.forEach(function (l) {
      if (scopeKey !== 'ALL' && l.world !== scopeKey && l.worldName !== scopeKey) return;
      if (l.hq) { if (minH == null || l.pricePerUnit < minH) minH = l.pricePerUnit; }
      else if (minN == null || l.pricePerUnit < minN) minN = l.pricePerUnit;
    });
    const row = base ? base.slice() : [0, 0, null, null, null, null, null, null, null];
    const both = [minN, minH].filter(function (v) { return v != null; });
    row[2] = both.length ? Math.min.apply(null, both) : null;
    row[7] = [minN, minH];
    return row;
  }
  /* 供應鏈圖的「即時掛單價校正」：圖上每張卡片的「買 vs 自製」都是用預先計算的快照算的（最多落後一個排程週期），
   * 但卡片上另外顯示的最低價標籤是即時查的，同一張卡片會出現兩個對不上的價格。
   * 價格基準是「掛單價」時，圖上出現的物品（中心物品、材料、用在哪的成品）加上自製成本會往下追的材料，
   * 背景查一次「現在」的最低掛單，蓋到快照上重算、重畫。數量通常只有幾十個，一批請求就夠。 */
  const liveMinOverlay = {}; // 範圍（'ALL' 或世界名）-> { 物品ID: { min, minN, minH, time } }
  function collectSupplyLiveIds(itemId, rid) {
    const byItem = getRecipesByItem(), seen = {}, out = [];
    function add(id) { id = Number(id); if (seen[id] || out.length >= 150) return false; seen[id] = 1; out.push(id); return true; }
    function addTree(id, depth) { // 自製成本會一路往下算，下面幾層的材料價格也要即時
      const r = byItem[id] && byItem[id][0];
      if (!r || depth > 4) return;
      (r.ingredients || []).forEach(function (ing) { if (add(ing.itemId)) addTree(ing.itemId, depth + 1); });
    }
    const recipe = rid ? CRAFT_RECIPES[rid] : null;
    const mats = recipe ? (recipe.ingredients || []).map(function (ing) { return ing.itemId; }) : [];
    const usedIn = (buildUsedInIndex()[itemId] || []).slice(0, 20).map(function (urid) { const r = CRAFT_RECIPES[urid]; return r ? r.itemId : null; }).filter(function (x) { return x != null; });
    add(itemId); mats.forEach(add); usedIn.forEach(add); // 先把圖上直接看得到的放進去（超過上限時優先保留）
    mats.forEach(function (id) { addTree(id, 1); }); usedIn.forEach(function (id) { addTree(id, 1); });
    return out;
  }
  // redraw：由 renderSupplyChainWithBreakdown 傳進來的重畫函式；dcData：這次畫圖用的資料（拿來判斷即時價跟快照有沒有差，沒差就不重畫）
  async function supplyLiveCorrect(itemId, rid, box, dcData, redraw) {
    try {
      const pf = MarketData.getPricePrefs(), st = MarketData.getSettings();
      const scopeKey = (pf.buyScope === 'world' && st.worldName) ? st.worldName : 'ALL';
      const fresh = function (rec) { return rec && Date.now() - rec.time < 5 * 60 * 1000; };
      const lv = (liveMinOverlay[scopeKey] = liveMinOverlay[scopeKey] || {});
      const need = collectSupplyLiveIds(itemId, rid).filter(function (id) { return !fresh(lv[id]) && !fresh(liveRowOverlay[String(id)]); });
      if (!need.length) return;
      const res = await MarketData.fetchWatchBatch(need, scopeKey === 'ALL' ? st.dcName : scopeKey, {});
      let differs = false;
      need.forEach(function (id) {
        const r = res[id];
        if (!r) return; // 沒查到（請求失敗）：保留快照價
        lv[id] = { min: r.min, minN: r.minNQ, minH: r.minHQ, time: Date.now() };
        const row = dcData && dcData.items && dcData.items[id], Q = row && row[7];
        if ((row ? row[2] : null) !== r.min || (Q ? Q[0] : null) !== r.minNQ || (Q ? Q[1] : null) !== r.minHQ) differs = true;
      });
      if (!differs) return; // 即時價跟快照一樣：畫面不用動
      // 查的期間使用者已經換了物品／離開頁面：不要蓋掉現在的畫面
      if (!lastSupplyCtx || lastSupplyCtx.box !== box || lastSupplyCtx.itemId !== itemId || !document.body.contains(box)) return;
      redraw();
    } catch (e) { /* 校正失敗就維持快照價，不影響供應鏈圖 */ }
  }
  async function getPrecomputedAllData() {
    try {
      const pf = MarketData.getPricePrefs(), w = MarketData.getSettings().worldName; // 供應鏈是「買」的決策：看全站共用設定的買入範圍
      const scopeKey = pf.buyScope === 'world' && w ? w : 'ALL';
      const r = await MarketData.loadPrecomputed(scopeKey);
      if (r.state === 'ok' && r.ageMs <= 24 * 3600 * 1000) {
        const ids = Object.keys(liveRowOverlay).filter(function (id) { return Date.now() - liveRowOverlay[id].time < 5 * 60 * 1000; });
        const lm = liveMinOverlay[scopeKey] || {};
        const minIds = Object.keys(lm).filter(function (id) { return Date.now() - lm[id].time < 5 * 60 * 1000; });
        if (!ids.length && !minIds.length) return r.data;
        const items = Object.assign({}, r.data.items);
        minIds.forEach(function (id) { // 供應鏈圖查到的即時最低價（見 supplyLiveCorrect）
          const row = items[id] ? items[id].slice() : [0, 0, null, null, null, null, null, null, null];
          row[2] = lm[id].min; row[7] = [lm[id].minN, lm[id].minH];
          items[id] = row;
        });
        ids.forEach(function (id) { items[id] = overlayRowFor(id, scopeKey, items[id]); }); // 物品頁那份有完整掛單，優先
        return Object.assign({}, r.data, { items: items });
      }
    } catch (e) { /* 讀不到就回傳null，呼叫端自行處理 */ }
    return null;
  }
  // 原本這裡會在整份預先計算快照超過1小時沒更新時，於市場頁頂端顯示一條黃色警告橫幅。
  // 站長覺得不好看，已移除（market-data.js 仍會發出 'market-snapshot-stale' 事件，日後要恢復可再接回來）。
  // 熱度排行／製作商機頁面在資料超過24小時時仍有各自的提示，不受影響。
  // 若頁面上已經有舊的橫幅（例如來自快取的舊版腳本），保險起見也一併清掉：
  window.addEventListener('market-snapshot-stale', function () {
    const old = document.getElementById('mk-stale-banner');
    if (old) old.remove();
  });

  /* ── 統計列／世界價格列的「自動適應」 ──
   * 內容長度每個物品都不一樣（110 跟 12,345,678 差很多），固定寫死一組間距一定有物品會被擠成兩行。
   * 所以改成渲染後量測：統計列依序試三段（正常→縮緊→更緊），都放不下才換成「均分的格子」，永遠不會出現孤零零一塊；
   * 世界價格列則依容器寬度算出一排放幾格，再把格數平均分到每一排（8 格寫成 4＋4，不是 6＋2）。
   * 用 ResizeObserver 追蹤寬度，視窗縮放、手機轉向時自動重算。 */
  const mkFitTargets = new WeakMap();
  const mkFitRO = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(function (entries) {
    entries.forEach(function (en) {
      const t = mkFitTargets.get(en.target); if (!t) return;
      const w = Math.round(en.contentRect.width);
      if (t.w !== w) { t.w = w; t.fn(); } // 只有寬度變了才重算；重算只會改高度，不會造成循環
    });
  }) : null;
  function mkObserveFit(el, fn) {
    if (!mkFitRO || !el) return;
    if (mkFitTargets.has(el)) { mkFitTargets.get(el).fn = fn; return; }
    mkFitTargets.set(el, { fn: fn, w: -1 });
    mkFitRO.observe(el);
  }
  // 統計徽章列搬到橫跨兩欄的「決策列」：全寬單排放得下，字級不用縮。
  // 必須在每次 box.innerHTML = html 之後「馬上」呼叫（兩個 #mk-stat-bar 同時存在時 $() 會抓到舊的）；
  // box 已經從畫面上拿掉（使用者已切到別的物品）就不搬，免得把舊物品的資料塞進新物品的決策列。
  function hoistStatBar(box) {
    if (!box || !box.isConnected) return;
    const band = $('mk-decision-band'), stats = $('mk-band-stats'), bar = box.querySelector('#mk-stat-bar');
    if (!band || !stats || !bar) return;
    stats.innerHTML = '';
    stats.appendChild(bar);
    band.hidden = false;
    // 世界列、稅後／更新時間／賣出訊號搬到左欄（右欄只留價格表）；每次重畫都先清掉舊的
    const iw = $('mk-info-world'), inn = $('mk-info-notes');
    if (iw) { iw.innerHTML = ''; const ws = box.querySelector('#mk-world-strip'); if (ws) iw.appendChild(ws); }
    if (inn) {
      inn.innerHTML = '';
      box.querySelectorAll('.market-stat-foot, .mk-notes-sig').forEach(function (el) { inn.appendChild(el); });
    }
  }
  // 標題列：「製作求解」「取得方式」兩顆先用完整文字，實際量一下——完整版讓標題列變高（＝擠到換行或標題被壓成更多行）才縮成圖示。
  // 比用寬度門檻準：不管物品名稱多長、版本標籤有幾個，都是照實際排出來的結果判斷。「加入關注」永遠是圖示。
  function fitDetailHeader(hd) {
    if (!hd || !hd.isConnected) return;
    hd.classList.add('is-compact');
    const hCompact = hd.offsetHeight;
    hd.classList.remove('is-compact');
    const hFull = hd.offsetHeight;
    if (hFull > hCompact + 2) hd.classList.add('is-compact');
  }
  function refitDetailHeader() { const p = $('mk-pane-item'); const hd = p && p.querySelector('.market-detail-header'); if (hd) fitDetailHeader(hd); }
  function fitStatBar(bar) {
    if (!bar || !bar.isConnected) return;
    const tiles = Array.prototype.slice.call(bar.querySelectorAll('.market-stat-tile'));
    bar.style.removeProperty('--ms-cols');
    tiles.forEach(function (t) { t.classList.remove('ms-end', 'ms-last-row'); });
    if (tiles.length < 2) { bar.removeAttribute('data-fit'); return; }
    const oneRow = function () { return tiles[tiles.length - 1].offsetTop - tiles[0].offsetTop < 2; };
    for (let lvl = 0; lvl <= 2; lvl++) {
      bar.dataset.fit = String(lvl);
      if (oneRow()) return;
    }
    // 三段都放不下：格子寬度＝最寬那格的自然寬度，算出一排放得下幾格，再把格數平均分到每一排
    let maxW = 0;
    tiles.forEach(function (t) { maxW = Math.max(maxW, t.offsetWidth); });
    const W = bar.clientWidth;
    if (!W || !maxW) return;
    const k = Math.max(1, Math.floor(W / maxW));
    const rows = Math.ceil(tiles.length / k), cols = Math.ceil(tiles.length / rows);
    bar.dataset.fit = '3';
    bar.style.setProperty('--ms-cols', String(cols));
    tiles.forEach(function (t, i) {
      if ((i + 1) % cols === 0 || i === tiles.length - 1) t.classList.add('ms-end');
      if (i >= cols * (rows - 1)) t.classList.add('ms-last-row');
    });
  }

  function fitWorldStrip(strip) {
    if (!strip || !strip.isConnected) return;
    const n = strip.querySelectorAll('.mws-cell').length, W = strip.clientWidth;
    if (!n || !W) return;
    const GAP = 5, MIN_W = 88; // 一格要放得下「世界名＋過舊標記」同一行
    const k = Math.max(1, Math.floor((W + GAP) / (MIN_W + GAP)));
    const rows = Math.ceil(n / k), cols = Math.ceil(n / rows);
    strip.style.display = 'grid';
    strip.style.gridTemplateColumns = 'repeat(' + cols + ',minmax(0,1fr))';
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
    // 舊版預設的品質是 'nq'：只看NQ掛單，HQ比NQ便宜時會買貴（例：HQ 80,000、最低NQ 86,000，卻顯示「買 86,000」，
    // 跟「在售最低 80,000」對不上）。HQ永遠能頂替NQ用，所以預設改成 'auto'（NQ/HQ取較低）。
    // 舊設定沒有 persv 版本標記，無法分辨是預設值還是玩家自己選的，所以一次性重設成 'auto'，之後玩家改的設定才會被保留。
    if (s && s.persv !== 2) { s.matPersp = 'auto'; s.persv = 2; }
    const merged = Object.assign({
      materialsBasis: 'listing', materialsAvgWindow: 'current', // 選了「成交均價」才有意義：當前/1天/3天/7天
      includeCrystal: true, matPersp: 'auto', hqOverrides: {}, persv: 2,
    }, s || {});
    merged.materialsBasis = MarketData.getPricePrefs().buyBasis; // 價格基準＝全站共用的「買入基準」，不再各自存一份
    merged.materialsAvgWindow = MarketData.getPricePrefs().buyAvgWindow; // 均價窗口同理：跟生產頁共用「買入」的窗口
    return merged;
  }
  function saveSupplySettings(s) {
    if (s && s.materialsBasis && s.materialsBasis !== MarketData.getPricePrefs().buyBasis) MarketData.setPricePrefs({ buyBasis: s.materialsBasis });
    try { localStorage.setItem(SUPPLY_SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  /* 詳情頁的載入序號：換了物品、或改了市場設定重畫時，還在路上的舊請求回來要自己放棄，不能蓋掉新畫面。
   * detailViewState 記住「正在看哪個分頁／世界／HQ篩選／手續費勾選」，改稅率城市這類設定變更重畫時沿用，不要全部重置。 */
  let detailLoadToken = 0, detailViewState = null;
  async function loadMarketSection(itemId, opts) {
    opts = opts || {};
    const myLoad = ++detailLoadToken;
    const keep = (opts.keepView && detailViewState && detailViewState.itemId === String(itemId)) ? detailViewState : null;
    if (!keep) detailViewState = { itemId: String(itemId), tab: 'listing', world: 'ALL', hq: false, fee: false };
    const view = detailViewState;
    const box = $('mk-detail-market');
    if (!MarketData.getSettings().dcName) {
      box.innerHTML = '<p class="craft-muted">尚未設定資料中心，點右上角「設定」後才能查價。</p>';
      return;
    }
    let overviewFailed = false; // 查詢失敗（網路、限流）跟「真的沒有掛單」要分開顯示
    const out = await Promise.all([
      MarketData.getItemMarketOverviewEx(itemId).catch(function () { overviewFailed = true; return null; }),
      MarketData.fetchSaleVelocityBatch([Number(itemId)], MarketData.getSettings().dcName).then(function (m) { return m[itemId] || null; }).catch(function () { return null; }),
      MarketData.getSettings().worldName ? MarketData.getSellTaxInfo(MarketData.getSettings().worldName).catch(function () { return null; }) : Promise.resolve(null),
      getPrecomputedRow('ALL', itemId),
    ]);
    if (myLoad !== detailLoadToken) return; // 已經換物品或重畫了
    const overview = out[0], taxInfo = out[2];
    // 價格以「各世界自己的最新資料」為準：資料中心總覽的世界資料可能比較舊（遊戲內1200、網站寫1497 的實際案例）
    if (overview && overview.listings && overview.listings.length) {
      try {
        // 世界資料校正已經在 getItemMarketOverviewEx 裡做完了（overview 就是校正後的），這裡只需要把它蓋到快照上
        setLiveOverlay(itemId, overview.listings); // 供應鏈／製作成本等用快照的地方，這個物品改用跟標頭同一份即時掛單
      } catch (e) { /* 校正失敗就沿用總覽原本的資料，不影響頁面 */ }
      if (myLoad !== detailLoadToken) return;
    }
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
    // 賣速的數字：1件以上留一位小數，不到1件留兩位（以前一律一位，每天賣0.04件會顯示成0.0，像是完全沒人買）
    function fmtVelNum(x) { x = x || 0; return x >= 1 ? x.toFixed(1) : (x > 0 ? x.toFixed(2) : '0'); }
    function velTileHtml(v, scopeWorld) {
      if (v && (v.nqVelocityPerDay != null || v.hqVelocityPerDay != null)) {
        return '<div class="market-stat-tile" title="每天賣出幾件（' + (scopeWorld || '所有世界') + '）"><span class="mst-label">賣速/天</span>' +
          '<span class="mst-val"><span class="mst-q">NQ</span>' + fmtVelNum(v.nqVelocityPerDay) + '<span class="mst-sep">·</span><span class="mst-q">HQ</span>' + fmtVelNum(v.hqVelocityPerDay) + '</span></div>';
      }
      if (v && v.usedScope === null) return '<div class="market-stat-tile market-stat-tile-muted"><span class="mst-label">賣速</span><span class="mst-val">近4天無成交' + (scopeWorld ? '（' + scopeWorld + '）' : '') + '</span></div>';
      return '';
    }
    /* 統計摘要用「小標籤＋大數字」的方塊排成一列（以前是純文字膠囊，標籤跟數字同樣大小、同樣顏色，
     * 要逐個讀才知道哪個是哪個）。標籤小而淡、數字大而醒目，單位（金、件/天）用更小的字跟在後面，
     * 一眼掃過去先看到數字，需要時再看標籤。最低價最重要，用綠色強調。 */
    function statTile(label, valHtml, cls, attrs) {
      return '<div class="market-stat-tile' + (cls ? ' ' + cls : '') + '"' + (attrs || '') + '><span class="mst-label">' + label + '</span><span class="mst-val">' + valHtml + '</span></div>';
    }
    function buildStatBarHtml(st) {
      const parts = [];
      // 兩個價格裡只要有一個到千萬以上，兩個一起改用萬／億簡寫（一起改才看得出大小關係），完整數字放在滑鼠提示
      const compact = Math.max(st.minPrice || 0, st.avgDisplay || 0) >= 1e7;
      const fmtP = function (n) { return compact ? fmtCompactGil(n) : n.toLocaleString(); };
      const U = compact ? '' : '<small>金</small>'; // 簡寫（萬／億）本身就是金幣的習慣單位，再加「金」是重複，還會把賣速擠到第二行
      if (st.minPrice) parts.push(statTile('在售最低', fmtP(st.minPrice) + U, 'market-stat-tile-strong', ' title="目前掛單中最低的單價：' + st.minPrice.toLocaleString() + ' 金"'));
      // 均價：近24小時實際成交均價，不是掛單快照均價（掛單均價容易被囤積的高價/低價單誤導）。
      // 24小時內沒有成交的冷門物品，退回用掛單均價，並明確標成「掛單均價」，註明這不是真的成交均價。
      if (st.avgLoading) parts.push(statTile('均價', '計算中⋯', 'market-stat-tile-muted'));
      else if (st.avgDisplay != null) parts.push('<button type="button" class="market-stat-tile market-stat-tile-btn" id="mk-avgprice-badge" title="' + st.avgDisplay.toLocaleString() + ' 金・點擊看不同天數的均價比較"><span class="mst-label">' + (st.avgIsFallback ? '掛單均價' : '成交均價') + '<i class="ph ph-caret-down"></i></span><span class="mst-val">' + fmtP(st.avgDisplay) + U + '</span></button>');
      // 排列：金額類（最低價、均價）在前，速度類（賣速、成交頻率）在後；放不下一排時會自然拆成「金額一排、速度一排」
      if (st.velLoading) parts.push(statTile('賣速', '計算中⋯', 'market-stat-tile-muted'));
      else { const vt = velTileHtml(st.velocity, st.scopeWorld); if (vt) parts.push(vt); }
      // 成交頻率：每天成交「幾筆」（不是幾件），只在有預先計算資料時才有，沒有就不顯示這格
      if (!st.velLoading && st.txnFreq != null) { // 載入中不先擺這格，免得算完又消失造成跳動
        if (st.txnFreq > 0) parts.push(statTile('成交頻率', st.txnFreq.toFixed(2) + '<small>筆/天</small>', '', ' title=\"每天平均成交幾筆（' + (st.scopeWorld || '所有世界') + '），跟賣速（每天賣幾件）不同\"'));
        else parts.push(statTile('成交頻率', '<5<small>筆/月</small>', 'market-stat-tile-muted', ' title=\"近30天成交不到5筆，筆數太少算不出可靠的頻率（不代表完全沒有成交）\"'));
      }
      return parts.join('');
    }
    const last24hRaw = (overview && overview.history) ? overview.history.filter(function (h) { return h.timestamp >= Date.now() / 1000 - 86400; }) : [];
    const last24h = MarketData.excludeOutlierEntries(last24hRaw, function (h) { return h.pricePerUnit; }); // 第6點：排除異常成交（全域設定，預設打開）
    const liveAvg24h = MarketData.weightedAvgPrice(last24hRaw); // 件數加權＋排除異常成交（跟預先計算同一定義）
    // 預先計算的24小時均價涵蓋完整24小時；即時查到的只是「最近200筆」裡剛好落在24小時內的，成交熱絡的道具會偏短
    const avg24h = pcStat && pcStat.avg24h != null ? pcStat.avg24h : liveAvg24h;
    const dcStat = {
      minPrice: overview && overview.minPrice, maxPrice: overview && overview.maxPrice,
      avgDisplay: avg24h != null ? avg24h : (overview && overview.avgPrice ? Math.round(overview.avgPrice) : null),
      avgIsFallback: avg24h == null && !!(overview && overview.avgPrice),
      velocity: velocity, scopeWorld: null,
      txnFreq: pcStat ? pcStat.txnFreq : null, turnover: pcStat ? pcStat.turnover : null,
    };
    // 買賣方稅率／資料新鮮度是輔助小字，跟徽章列分開放，但合併成一行，不再各佔一整行<p>。
    // 稅後估算基準用目前最低掛單價，不是均價：要有競爭力就得訂在最低價附近，均價不是你實際能賣到的價格。
    const footNotes = [];
    // 「寄售稅後」放一個空位，內容由下面的 updateTaxNote() 依「目前選的世界」「NQ／HQ 各自最低價」動態填入
    if (taxInfo && overview && overview.listings.length) footNotes.push('<span id="mk-taxnote"></span>');
    if (overview && overview.lastUploadTime) footNotes.push('<span id="mk-fresh" title="資料最後上傳時間，隨下方選的世界變動">' + timeAgo(overview.lastUploadTime / 1000) + '更新</span>');

    html += '<div class="market-stat-bar" id="mk-stat-bar">' + buildStatBarHtml(dcStat) + '</div>';
    // 掛單訊號（▼74%）放在「寄售稅後」與「更新時間」之間同一行；沒有訊號時整段（含前面的點）隱藏，見 market-detail-v2.css 的 .mk-sig-item:has(...)
    const hasTax = !!(taxInfo && overview && overview.listings.length);
    const sigItem = (overview && overview.listings.length)
      ? '<span class="mk-sig-item">' + (hasTax ? '　·　' : '') + '<span class="market-sig" id="mk-sig-sell" style="display:none"></span></span>' : '';
    if (footNotes.length || sigItem) {
      let foot = hasTax ? footNotes[0] : '';
      foot += sigItem;
      const fr = footNotes.slice(hasTax ? 1 : 0).join('　·　');
      if (fr) foot += ((foot && (hasTax || sigItem)) ? '　·　' : '') + fr;
      html += '<p class="market-stat-foot craft-muted">' + foot + '</p>';
    }

    if (overviewFailed) {
      html += '<div class="market-untradable"><i class="ph ph-warning"></i><div><b>查詢失敗</b><button type="button" class="market-history-btn" id="mk-retry-load" style="margin-top:6px"><i class="ph ph-arrow-clockwise"></i> 重試</button></div></div>';
      box.innerHTML = html; hoistStatBar(box);
      const rb = $('mk-retry-load'); if (rb) rb.addEventListener('click', function () { loadMarketSection(itemId, { keepView: true }); });
      return;
    }
    if (!overview || !overview.listings.length) {
      html += isNoUniversalis(itemId)
        ? '<div class="market-untradable"><i class="ph ph-info"></i><div><b>價格資料來源未收錄這個物品</b><span>這個物品在台服仍可交易，但價格資料來源（Universalis）跟著國際服版本走，已不收錄它，所以這裡看不到掛單與價格。請以遊戲內市場板為準。</span></div></div>'
        : isMarketable(itemId)
        ? '<p class="craft-muted">目前查無掛單（可能沒有人在賣）</p>'
        : '<div class="market-untradable"><i class="ph ph-prohibit"></i><div><b>這個物品不能在市場交易</b><span>所以沒有掛單、成交紀錄跟市價可以查。右邊可以看它的供應鏈，上方「取得方式」會告訴你要去哪裡拿。</span></div></div>';
      box.innerHTML = html; hoistStatBar(box);
      return;
    }

    // 第9點：欄位排版模仿遊戲原生市場介面（優質／價格／數量／總計價格／僱員名），
    // 「魔晶石數量」是遊戲那邊跟這個查詢介面無關的欄位，照你的指示忽略掉。
    // 第8點：世界欄位改成篩選下拉，預設「所有世界」，選了特定世界就只顯示那個世界的掛單。
    const dcWorlds = MarketData.getSettings().dcName ? await MarketData.listWorldNamesInDc(MarketData.getSettings().dcName).catch(function () { return []; }) : [];
    if (myLoad !== detailLoadToken) return;
    // 各世界目前最低價（取自整個資料中心的全部掛單）：玩家不用逐一切換世界，打開下拉就看得出哪個世界最便宜。
    // 手上是全部掛單，所以沒出現的世界就是真的沒有在賣。
    const worldMinPrice = {};
    overview.listings.forEach(function (l) {
      if (worldMinPrice[l.world] == null || l.pricePerUnit < worldMinPrice[l.world]) worldMinPrice[l.world] = l.pricePerUnit;
    });
    // 世界下拉：每個世界後面直接寫「該世界目前最低價」和「資料更新距今」，不用逐一切換世界就看得出哪個最便宜、哪個資料太舊。
    // worldUploadTimes 是 Universalis 回傳的各世界更新時間（毫秒）；API沒給就只顯示價格。
    const worldTimes = overview.worldUploadTimes || {};
    const hasWorldTimes = Object.keys(worldTimes).length > 0;
    function shortAgo(ms) {
      const m = Math.floor((Date.now() - ms) / 60000);
      if (m < 1) return '剛剛';
      if (m < 60) return m + '分';
      const h = Math.floor(m / 60);
      return h < 24 ? h + '時' : Math.floor(h / 24) + '天';
    }
    // 在售／成交／走勢三個分頁取代以前的「查看最近成交紀錄」「查看走勢圖」兩個彈窗：
    // 內容直接顯示在清單區域，不用開關視窗，也看得出「現在在哪個檢視」。
    // 「只顯示HQ」是篩選、不是檢視，所以不放進分頁，獨立一顆；走勢圖自己有NQ/HQ選單，切到走勢時就藏起來。
    // 各世界最低價列：取代原本的下拉選單（選項藏在下拉裡，要點開才知道哪個世界最便宜）。
    // 每個世界一格：名稱、該世界目前最低價、資料更新距今（超過6小時變橘色、超過1天變紅色）；
    // 最便宜的世界價格標綠色。點一格＝切換整個頁面的範圍（在售／成交／走勢都跟著換）。內容在下面 renderWorldStrip 填入。
    html += '<div class="market-world-strip" id="mk-world-strip"></div>';
    // 賣出訊號（掛單 ▲%）：放在左欄「寄售稅後／資料更新」的下面，顏色規則不變
    html += '<div class="market-listing-bar">' +
        '<div class="market-tabs-mini" id="mk-tabs" role="tablist">' +
          '<button type="button" class="market-tab-mini active" data-mk-tab="listing" role="tab" aria-selected="true" title="目前掛單數">在售 <span id="mk-tab-count">' + (overview.listingsCount != null ? overview.listingsCount : overview.listings.length) + '項</span></button>' +
          '<button type="button" class="market-tab-mini" data-mk-tab="history" role="tab" aria-selected="false">成交</button>' +
          '<button type="button" class="market-tab-mini" data-mk-tab="trend" role="tab" aria-selected="false">走勢</button>' +
        '</div>' +
        '<button type="button" class="market-history-btn" id="mk-hq-filter-btn" title="只顯示HQ">HQ</button>' +
        '<select id="mk-world-filter" class="craft-select" style="display:none" aria-hidden="true" tabindex="-1">' +
          // optgroup 的標題列看起來像分類、不能被選取，只當說明用；預設選中的仍是裡面第一個「所有世界」（標題的配色見 page-market.css）
          '<optgroup label="顯示範圍・最低價' + (hasWorldTimes ? '・資料更新' : '') + '">' +
            '<option value="ALL">所有世界' + (overview.minPrice ? '　' + overview.minPrice.toLocaleString() : '') + '</option>' +
            dcWorlds.map(function (w) {
              const parts = [w];
              if (worldMinPrice[w] != null) parts.push(worldMinPrice[w].toLocaleString());
              if (worldTimes[w]) parts.push(shortAgo(worldTimes[w]));
              return '<option value="' + w + '">' + parts.join('　') + '</option>';
            }).join('') +
          '</optgroup>' +
        '</select>' +
        '<span class="market-listing-bar-r" id="mk-bar-r">' +
          '<label class="market-fee-toggle-inline" id="mk-fee-label" title="買方稅固定 5%"><input type="checkbox" id="mk-fee-toggle"/> 買方稅5%</label></span>' +
      '</div>' +
      // 表頭獨立在捲動區域外面，欄寬用同一組mfl-*class對齊（不用<table>），捲動時表頭固定不動，內容在下面單獨捲動
      '<div id="mk-tab-head"></div>' +
      '<div id="mk-listing-table-slot"></div>';
    box.innerHTML = html; hoistStatBar(box);
    (function () { const bar = $('mk-stat-bar'); fitStatBar(bar); mkObserveFit(bar, function () { fitStatBar(bar); }); })();

    let worldFilter = 'ALL'; // 目前選的範圍：'ALL'＝整個資料中心，否則是世界名稱
    function bindAvgBadge() {
      // 統計列已被 hoistStatBar 搬到上方「決策列」(#mk-band-stats)，不在 box 裡面了，
      // 所以要從 #mk-stat-bar 本身找；只在 box 裡找會找不到按鈕、點擊事件永遠沒綁上（均價彈窗點了沒反應）。
      const statBarEl = $('mk-stat-bar') || box;
      const avgBtn = statBarEl.querySelector('#mk-avgprice-badge');
      if (!avgBtn) return;
      avgBtn.addEventListener('click', function (e) {
        e.stopPropagation(); // 沒有這行，點擊會冒泡到document把彈窗自己剛打開的畫面關掉，看起來像沒反應
        const pop0 = $('mk-avgprice-popover');
        if (pop0 && pop0.style.display === 'block' && pop0.dataset.owner === 'avg') { pop0.style.display = 'none'; return; } // 再點一次＝收起
        openAvgPricePopover(itemId, avgBtn, overview.avgPrice, worldFilter === 'ALL' ? null : worldFilter);
      });
    }
    bindAvgBadge();
    // 統計徽章隨選擇的範圍更新。世界範圍的均價要另外查該世界最近24小時成交（一頁就夠），
    // token 避免使用者連續切換時，慢回來的舊結果蓋掉新畫面。
    let statToken = 0;
    const worldHist24Cache = {}, worldVelCache = {};
    function setStatBar(st) { refAvg = (st.avgDisplay != null && !st.avgIsFallback) ? st.avgDisplay : null; updateSignals(); const el = $('mk-stat-bar'); if (el) { el.innerHTML = buildStatBarHtml(st); bindAvgBadge(); fitStatBar(el); mkObserveFit(el, function () { fitStatBar(el); }); } }
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
        setStatBar(Object.assign({ avgDisplay: avgDisplay, avgIsFallback: avgIsFallback, velocity: st.velocity, txnFreq: st.txnFreq, turnover: st.turnover }, base));
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
      if (recent.length) avgDisplay = MarketData.weightedAvgPrice(recent);
      else if (ls.length) { avgDisplay = Math.round(ls.reduce(function (t, l) { return t + l.pricePerUnit; }, 0) / ls.length); avgIsFallback = true; }
      setStatBar(Object.assign({ avgDisplay: avgDisplay, avgIsFallback: avgIsFallback }, base));
    }

    // hq-only／手續費是純畫面篩選或計算；世界篩選要重新查（見下面說明）
    let hqOnly = !!(keep && keep.hq), includeFee = !!(keep && keep.fee);
    let activeTab = keep ? keep.tab : 'listing', tabToken = 0, currentHistory = [];
    let listingError = false;       // 這個世界的掛單查詢失敗（跟「沒有掛單」要分開顯示）
    const worldNoListing = {};      // 已經確認「這個世界完全沒有掛單」的世界
    const worldListingsCache = {}; // 同一次開啟頁面內，切換過的世界不用重複查
    const worldHistoryCache = {};
    const trendViews = {};         // 各世界範圍的走勢圖：{世界或'ALL': {el, ts}}，見 renderActiveTab
    // 第4點：切換到特定世界時，不是從DC總覽（上限100筆全服最便宜）裡篩選，因為那樣篩出來的
    // 筆數會不完整——改成直接對那個世界重新查一次，拿到它自己真正完整的掛單清單。
    let activeListingSet = overview.listings;
    function setActiveListingSet(list) {
      activeListingSet = list;
      const c = $('mk-tab-count'); if (c) c.textContent = (list.total != null ? list.total : list.length) + '項';
      if (typeof updateSignals === 'function') updateSignals();
    }
    // 欄位排版：價格→數量→總價是一組（總價＝價格×數量，是前兩欄的結果，所以緊靠在一起），
    // 跟後面的僱員／買家、世界之間留明顯間距，閱讀時才分得出「數字區」跟「人／地點區」。
    const LISTING_HEAD = '<div class="market-flexrow market-flexrow-head"><span class="mfl-price mfl-r">價格(金)</span><span class="mfl-qty mfl-r">數量</span><span class="mfl-total mfl-r">總價</span><span class="mfl-buyer">僱員</span><span class="mfl-world">世界</span></div>';
    const HISTORY_HEAD = '<div class="market-flexrow market-flexrow-head"><span class="mfl-price mfl-r">成交價(金)</span><span class="mfl-qty mfl-r">數量</span><span class="mfl-total mfl-r">總價</span><span class="mfl-buyer">買家</span><span class="mfl-world">世界</span><span class="mfl-time">時間</span></div>';
    function priceCellHtml(hq, price) { return '<span class="mfl-price mfl-pricehq"><span>' + (hq ? hqIconHtml() : '') + '</span><span>' + price.toLocaleString() + '</span></span>'; }
    function renderListingTableFromActiveSet() {
      if (listingError) {
        $('mk-listing-table-slot').innerHTML = '<p class="craft-muted" style="padding:8px 0"><i class="ph ph-warning"></i> 查詢失敗 <button type="button" class="market-history-btn" id="mk-wl-retry"><i class="ph ph-arrow-clockwise"></i> 重試</button></p>';
        const rb = $('mk-wl-retry'); if (rb) rb.addEventListener('click', function () { $('mk-world-filter').dispatchEvent(new Event('change')); });
        return;
      }
      renderListingRows();
    }
    function renderListingRows() {
      let rows = hqOnly ? activeListingSet.filter(function (l) { return l.hq; }) : activeListingSet;
      const feeRate = includeFee ? MarketData.buyTaxRate : 0; // 買方稅固定 5%（賣方稅才依城市不同）
      $('mk-listing-table-slot').innerHTML = rows.length ? rows.map(function (l) {
        const total = l.pricePerUnit * l.quantity * (1 + feeRate);
        // 僱員名不截斷（名字最長約6~7個字，空間夠就完整顯示），只有放不下才用…並且滑鼠停留看全名。
        const name = escHtml(l.retainerName || '—');
        return '<div class="market-flexrow' + (rows[0] === l ? ' market-flexrow-best' : '') + '">' + priceCellHtml(l.hq, l.pricePerUnit) +
          '<span class="mfl-qty mfl-r">' + l.quantity.toLocaleString() + '</span><span class="mfl-total mfl-r">' + Math.round(total).toLocaleString() +
          '</span><span class="mfl-buyer" title="' + name + '">' + name + '</span><span class="mfl-world">' + l.world + '</span></div>';
      }).join('') : '<p class="craft-muted" style="padding:8px 0">' + (hqOnly ? '沒有HQ的掛單' : '這個世界目前查無掛單') + '</p>';
    }
    function renderHistoryTable() {
      const rows = (hqOnly ? currentHistory.filter(function (h) { return h.hq; }) : currentHistory).slice(0, 50);
      $('mk-listing-table-slot').innerHTML = rows.length ? rows.map(function (h) {
        const name = escHtml(h.buyerName || '—');
        return '<div class="market-flexrow">' + priceCellHtml(h.hq, h.pricePerUnit) +
          '<span class="mfl-qty mfl-r">' + h.quantity.toLocaleString() + '</span><span class="mfl-total mfl-r">' + (h.pricePerUnit * h.quantity).toLocaleString() +
          '</span><span class="mfl-buyer" title="' + name + '">' + name + '</span><span class="mfl-world">' + h.world + '</span><span class="mfl-time craft-muted">' + timeAgo(h.timestamp) + '</span></div>';
      }).join('') : '<p class="craft-muted" style="padding:8px 0">' + (hqOnly ? '近期沒有HQ的成交紀錄' : '近期查無成交紀錄') + '</p>';
    }
    // 依目前分頁＋世界範圍重畫清單區域。tabToken：連續切換分頁／世界時，慢回來的舊結果不要蓋掉新畫面。
    async function renderActiveTab() {
      const token = ++tabToken;
      const head = $('mk-tab-head'), slot = $('mk-listing-table-slot');
      if (activeTab === 'listing') { head.innerHTML = LISTING_HEAD; renderListingTableFromActiveSet(); return; }
      if (activeTab === 'history') {
        head.innerHTML = HISTORY_HEAD;
        // 跟世界下拉連動：所有世界＝整個資料中心的近期成交；選了世界就只看那個世界自己的成交
        if (worldFilter === 'ALL') currentHistory = overview.history || [];
        else {
          if (!worldHistoryCache[worldFilter]) {
            const wf = worldFilter;
            slot.innerHTML = '<p class="craft-muted" style="padding:8px 0">讀取' + wf + '成交紀錄中⋯</p>';
            try { worldHistoryCache[wf] = await MarketData.getRecentHistoryForWorld(itemId, wf, 50); }
            catch (e) { // 失敗不存快取，也不假裝「沒有成交」：顯示失敗並給重試
              if (token !== tabToken) return;
              slot.innerHTML = '<p class="craft-muted" style="padding:8px 0"><i class="ph ph-warning"></i> 查詢失敗 <button type="button" class="market-history-btn" id="mk-hist-retry"><i class="ph ph-arrow-clockwise"></i> 重試</button></p>';
              const rb = $('mk-hist-retry'); if (rb) rb.addEventListener('click', function () { renderActiveTab(); });
              return;
            }
            if (token !== tabToken) return;
          }
          currentHistory = worldHistoryCache[worldFilter];
        }
        renderHistoryTable();
        return;
      }
      head.innerHTML = ''; // 走勢圖自己有完整的操作列，不需要表頭
      // 每個世界範圍各保留一份走勢圖（連同畫面狀態）：來回切換分頁時直接放回去，不重新讀取，
      // 也不會丟掉玩家剛調好的天數、縮放、NQ/HQ選擇。放回去後畫布會自己重畫（ResizeObserver）。
      const hit = trendViews[worldFilter];
      slot.innerHTML = '';
      if (hit && Date.now() - hit.ts < TREND_VIEW_TTL) { slot.appendChild(hit.el); return; }
      const el = document.createElement('div');
      slot.appendChild(el); // 先放進頁面再畫：畫布要有實際尺寸
      trendViews[worldFilter] = { el: el, ts: Date.now() };
      renderTrendInto(el, itemId, worldFilter === 'ALL' ? null : worldFilter);
    }
    function setTab(tab) {
      activeTab = tab; view.tab = tab;
      box.querySelectorAll('[data-mk-tab]').forEach(function (b) {
        const on = b.dataset.mkTab === tab;
        b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      $('mk-hq-filter-btn').style.display = tab === 'trend' ? 'none' : '';   // 走勢圖自己有NQ/HQ選單
      $('mk-bar-r').style.display = tab === 'listing' ? '' : 'none';          // 買方稅、掛單訊號只跟在售表格有關
      renderActiveTab();
    }
    box.querySelectorAll('[data-mk-tab]').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.mkTab); }); });
    $('mk-hq-filter-btn').addEventListener('click', function () {
      hqOnly = !hqOnly; view.hq = hqOnly;
      this.classList.toggle('active', hqOnly);
      if (activeTab === 'history') renderHistoryTable(); else renderListingTableFromActiveSet();
    });
    $('mk-fee-toggle').addEventListener('change', function () { includeFee = this.checked; view.fee = includeFee; renderListingTableFromActiveSet(); });
    // 小字裡的「更新時間」跟著範圍走：選了某個世界就顯示那個世界自己的資料更新時間（API有給的話），不然顯示整個資料中心最新的
    function updateFreshness() {
      const el = $('mk-fresh'); if (!el) return;
      const ts = worldFilter === 'ALL' ? overview.lastUploadTime : worldTimes[worldFilter];
      el.textContent = ts ? timeAgo(ts / 1000) + '更新' : '';
    }
    function ageClass(ms) { const h = (Date.now() - ms) / 3600e3; return h >= 24 ? ' is-stale' : (h >= 6 ? ' is-old' : ''); }
    function renderWorldStrip() {
      const strip = $('mk-world-strip'); if (!strip) return;
      const cells = [{ key: 'ALL', name: '所有世界', price: overview.minPrice || null, ts: overview.lastUploadTime }]
        .concat(dcWorlds.map(function (w) { return { key: w, name: w, price: worldMinPrice[w] != null ? worldMinPrice[w] : null, ts: worldTimes[w] || null }; }));
      const prices = cells.slice(1).map(function (c) { return c.price; }).filter(function (v) { return v != null; });
      const best = prices.length ? Math.min.apply(null, prices) : null;
      // 手上只有「全服最便宜的 N 筆」掛單。沒出現在裡面的世界不代表沒人賣：它的最低價「至少」要等於這 N 筆裡最貴的那筆。
      // 只有確定手上這批就是全部掛單（總筆數沒超過 N），或是已經查過那個世界確實沒有掛單，才顯示「無」。
      const listedN = overview.listings.length;
      const allShown = overview.listingsCount != null ? overview.listingsCount <= listedN : true; // 現在抓的是全部掛單；API 沒給總數時也視為手上就是全部
      const lowerBound = listedN ? overview.listings[listedN - 1].pricePerUnit : null;
      // 每格兩行：世界名／最低價。資料更新距今只有「過舊」（超過6小時，橘色；超過1天，紅色）才在價格旁邊標出來，
      // 新鮮的不標——新鮮是常態，每格都寫一次只是雜訊，還會讓每格多一行高度；完整時間放在滑鼠停留的提示裡。
      strip.innerHTML = cells.map(function (c) {
        const isBest = c.key !== 'ALL' && c.price != null && c.price === best;
        const stale = c.key !== 'ALL' && c.ts && (Date.now() - c.ts) / 3600e3 >= 6;
        const none = c.key !== 'ALL' && c.price == null && (allShown || worldNoListing[c.key]);
        const bound = c.key !== 'ALL' && c.price == null && !none && lowerBound != null;
        const tip = c.key === 'ALL' ? '所有世界' : (none ? c.name + '：目前沒有掛單' : (bound ? c.name + '：最低價 ≥ ' + lowerBound.toLocaleString() + ' 金' : (c.price == null ? c.name : c.name + '目前最低價 ' + c.price.toLocaleString() + ' 金'))) +
          (c.ts && c.key !== 'ALL' ? '（資料更新於' + timeAgo(c.ts / 1000) + '）' : '');
        return '<button type="button" class="mws-cell' + (worldFilter === c.key ? ' active' : '') + (isBest ? ' is-best' : '') + '" data-world="' + c.key + '" title="' + tip + '">' +
          '<span class="mws-name">' + c.name + '</span>' + (stale ? '<span class="mws-age' + ageClass(c.ts) + '">' + shortAgo(c.ts) + '</span>' : '') +
          '<span class="mws-price">' + (c.price != null ? fmtCompactGil(c.price) : (none ? '<span class="mws-none">無</span>' : (bound ? '<span class="mws-lb">≥' + fmtCompactGil(lowerBound) + '</span>' : '—'))) + '</span>' +
        '</button>';
      }).join('');
      fitWorldStrip(strip); mkObserveFit(strip, function () { fitWorldStrip(strip); });
    }
    $('mk-world-strip').addEventListener('click', function (e) {
      const b = e.target.closest('[data-world]'); if (!b) return;
      const sel = $('mk-world-filter');
      if (sel.value === b.dataset.world) return;
      sel.value = b.dataset.world;
      sel.dispatchEvent(new Event('change')); // 隱藏的下拉仍然是「目前範圍」的唯一來源，邏輯照舊
    });
    renderWorldStrip();
    // 視窗不夠高時，世界列改用站內樣式的下拉（CSS 決定顯示哪一個）；選項文字已含最低價與更新時間，資訊一樣完整
    (function () {
      const ws = $('mk-world-filter');
      if (ws && window.MarketData && MarketData.enhanceSelect) {
        MarketData.enhanceSelect(ws);
        if (ws.nextSibling && ws.nextSibling.classList) ws.nextSibling.classList.add('mk-world-dd');
      }
    })();
    /* 寄售稅後：跟著下方選的世界走（選「所有世界」＝全服最低價，選某個世界＝那個世界自己的最低價），
     * NQ 跟 HQ 是不同的東西，各算各的，不混在一起。賣出只能在自己的世界，所以選「所有世界」時提示去點自己的世界看更準。 */
    function updateTaxNote(loading) {
      const el = $('mk-taxnote'); if (!el || !taxInfo) return;
      if (loading) { el.textContent = '寄售稅後 ≈ ⋯'; el.removeAttribute('title'); return; }
      const src = worldFilter === 'ALL' ? overview.listings : activeListingSet;
      function minOf(isHq) { let m = null; (src || []).forEach(function (l) { if (!!l.hq === isHq && (m == null || l.pricePerUnit < m)) m = l.pricePerUnit; }); return m; }
      let nq, hq;
      if (worldFilter === 'ALL') { nq = overview.minPriceNQ || minOf(false); hq = overview.minPriceHQ || minOf(true); } // 全服：優先用 API 算好的（涵蓋全部掛單，不限前100筆）
      else { nq = minOf(false); hq = minOf(true); }
      const pct = Math.round(taxInfo.ratePercent * 10) / 10;
      const net = function (v) { return Math.round(v * (1 - taxInfo.ratePercent / 100)); };
      const parts = [], tipParts = [];
      if (nq != null) { parts.push('NQ <span style="color:#4ade80">' + net(nq).toLocaleString() + '</span>'); tipParts.push('NQ 最低 ' + nq.toLocaleString() + ' → 約拿 ' + net(nq).toLocaleString()); }
      if (hq != null) { parts.push('HQ <span style="color:#4ade80">' + net(hq).toLocaleString() + '</span>'); tipParts.push('HQ 最低 ' + hq.toLocaleString() + ' → 約拿 ' + net(hq).toLocaleString()); }
      if (!parts.length) { el.textContent = ''; el.removeAttribute('title'); return; }
      el.innerHTML = '寄售稅後 ≈ ' + parts.join('　') + '（' + pct + '%）';
      el.title = (worldFilter === 'ALL' ? '全服' : worldFilter) + '最低價扣賣方稅 ' + pct + '%（' + taxInfo.cityName + '）：' + tipParts.join('；');
    }
    /* ── 價格訊號（沒有開關）：把「現在要付／能賣到的價」跟「成交均價（件數加權）」比。
     *   買（計算器裡）：輸入的數量，吃最便宜的 N 件的實際均價 對比 成交均價。
     *   賣（在售列右側「掛單」）：最低 3 筆掛單的均價（件數加權）對比 成交均價，比單看最低價不容易被一兩筆特例拉歪。
     * 顏色跟全站漲跌一致：紅＝比成交均價高（▲）、綠＝比成交均價低（▼）、灰＝差在 3% 以內。
     * 沒有成交均價（只剩掛單均價可用）或資料不足就不顯示。±3% 以內算持平（灰）。 */
    let refAvg = null;
    function sigChipHtml(kind, price) {
      if (refAvg == null || !(price > 0)) return '';
      const pct = (price - refAvg) / refAvg * 100, abs = Math.abs(pct);
      const cls = abs < 3 ? 'flat' : (pct > 0 ? 'up' : 'down'); // 顏色跟全站漲跌一致：紅＝比成交均價高、綠＝比成交均價低
      return '<span class="market-sig-chip ' + cls + '" title="' + Math.round(price).toLocaleString() + ' ／ 成交均價 ' + refAvg.toLocaleString() + '">' + (pct > 0 ? '▲' : '▼') + (abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)) + '%</span>';
    }
    function updateSignals() {
      const el = $('mk-sig-sell'); if (!el) return;
      const set = (activeListingSet || []).slice(0, 3);
      let v = 0, q = 0; set.forEach(function (l) { v += l.pricePerUnit * l.quantity; q += l.quantity; });
      const chip = (!listingError && q > 0) ? sigChipHtml('sell', v / q) : '';
      el.style.display = chip ? '' : 'none';
      el.innerHTML = chip ? '<span class="market-sig-lead" title="最低 3 筆掛單的均價，對比成交均價">掛單</span>' + chip : '';
    }
    $('mk-world-filter').addEventListener('change', async function () {
      const target = this.value; // 先記下「這次切到哪個世界」：下面 await 回來後，使用者可能已經又切走了
      worldFilter = target; view.world = target;
      renderWorldStrip();
      updateFreshness();
      listingError = false;
      // 成交／走勢分頁立刻跟著新範圍重畫；掛單資料仍在背景更新（統計徽章要用）
      if (activeTab !== 'listing') renderActiveTab();
      if (target === 'ALL') { setActiveListingSet(overview.listings); updateTaxNote(); if (activeTab === 'listing') renderListingTableFromActiveSet(); updateStatBar(); return; }
      if (worldListingsCache[target]) { setActiveListingSet(worldListingsCache[target]); updateTaxNote(); if (activeTab === 'listing') renderListingTableFromActiveSet(); updateStatBar(); return; }
      /* 開頁時已用各世界自己的資料校正過總覽（見 MarketData.refreshOverviewFromWorlds）：
       * 該世界校正成功就直接用，畫面上的清單、最低價、稅後價都跟「所有世界」同一批資料；校正失敗的世界才即時重查。 */
      if (overview._freshWorlds && overview._freshWorlds[target] && Date.now() - (overview._freshAt || 0) < 90 * 1000) { // 校正超過90秒就走下面的即時重查
        const sub = overview.listings.filter(function (l) { return l.world === target; });
        sub.total = sub.length;
        worldListingsCache[target] = sub;
        if (sub.length) worldMinPrice[target] = Math.min.apply(null, sub.map(function (l) { return l.pricePerUnit; }));
        else worldNoListing[target] = true;
        renderWorldStrip();
        setActiveListingSet(sub);
        updateTaxNote();
        if (activeTab === 'listing') renderListingTableFromActiveSet();
        updateStatBar();
        return;
      }
      if (activeTab === 'listing') $('mk-listing-table-slot').innerHTML = '<p class="craft-muted" style="padding:8px 0">查詢' + target + '掛單中⋯</p>';
      updateTaxNote(true);
      let listings = null;
      try { listings = await MarketData.getListingsForWorld(itemId, target); } catch (e) { listings = null; }
      if (myLoad !== detailLoadToken) return; // 已經換物品或重畫了
      if (listings) { // 結果一律只存進「那個世界」自己的快取；以前存進目前選的世界，快速連點時會把 A 世界的掛單存成 B 世界的
        worldListingsCache[target] = listings;
        if (listings.length) worldMinPrice[target] = Math.min.apply(null, listings.map(function (l) { return l.pricePerUnit; }));
        else worldNoListing[target] = true;
      }
      renderWorldStrip();
      if (target !== worldFilter) return; // 查詢期間又切到別的世界：這份結果只留在快取，不動現在的畫面
      listingError = !listings;
      setActiveListingSet(listings || []);
      updateTaxNote();
      if (activeTab === 'listing') renderListingTableFromActiveSet();
      updateStatBar();
    });

    // 還原／同步畫面狀態（改設定重畫時，沿用原本的分頁、世界、HQ篩選、買方稅勾選）
    refAvg = (dcStat.avgDisplay != null && !dcStat.avgIsFallback) ? dcStat.avgDisplay : null; // 訊號用的「成交均價」：一開始是所有世界那組（選了世界後由統計列更新）
    updateSignals();
    $('mk-hq-filter-btn').classList.toggle('active', hqOnly);
    $('mk-fee-toggle').checked = includeFee;
    updateTaxNote();
    setTab(activeTab);
    if (keep && keep.world !== 'ALL' && dcWorlds.indexOf(keep.world) >= 0) { $('mk-world-filter').value = keep.world; $('mk-world-filter').dispatchEvent(new Event('change')); }
  }

  /* 成交紀錄跟走勢圖是「輔助資訊」——玩家主要決策看的是目前掛單跟供應鏈。以前為了不擠壓主要資訊做成彈窗，
   * 現在改成跟「在售」並列的分頁：同一個區域切換檢視，不用開關視窗，主要資訊（徽章列、供應鏈）也不會被擠走。 */
  /* ── 關注清單：實作搬到 js/market-watchlist.js（右側抽屜＋表格／卡片檢視），這裡只留幾個薄薄的介面，
   * 讓物品頁的 ☆ 按鈕、供應鏈明細面板的「關注」按鈕、搜尋結果的 ☆ 維持原本的呼叫方式。
   * 儲存格式沿用舊版（ff14fc-market-watchlist），舊清單不會消失。 ── */
  function isWatched(itemId) { return !!(window.MarketWatchlist && MarketWatchlist.has(itemId)); }
  function addToWatchlist(itemId, name, targetPrice) { if (window.MarketWatchlist) MarketWatchlist.add(itemId, name, targetPrice); }
  function removeFromWatchlist(itemId) { if (window.MarketWatchlist) MarketWatchlist.remove(itemId); }
  function renderWatchlistPanel() { /* 清單改成抽屜，由 MarketWatchlist 自己更新，這裡不用做事 */ }

  function setupWatchlist() {
    if (!window.MarketWatchlist) return;
    MarketWatchlist.init({
      settings: function () { return MarketData.getSettings(); },
      name: function (id) { return ITEM_NAMES_TW_ALL[id] || null; },
      icon: itemIconHtml,
      isMarketable: isMarketable,
      openItem: openItemDetail,
      // 成交頻率：跟熱度排行、代幣兌換同一套定義（筆/天，近30天成交不到5筆時算不出來＝0）
      txnFreq: function (row) { return row ? liquidityOf('x', { items: { x: row } }).txnFreq : null; },
      compactGil: fmtCompactGil, // 價格簡寫（萬／億）跟物品頁用同一個函式，同一個價格在各處長得一樣
      // 製作成本欄位：跟供應鏈圖同一套算法與基準設定；配方庫（好幾MB）等到真的要顯示成本才載入
      craftInfo: async function (id) {
        const ok = await ensureCraftDataLoaded();
        if (!ok) return null;
        const dcData = await getPrecomputedAllData();
        if (!dcData) return null;
        const settings = getSupplySettings();
        const r = resolveItemBuyCraft(String(id), dcData, settings.materialsBasis, settings);
        return { craftable: r.craftable, craft: r.craft };
      },
    });
    MarketWatchlist.mount($('market-root'));
  }

  function bindWatchButton(itemId) {
    const btn = $('mk-watch-btn');
    if (!btn || !window.MarketWatchlist) return;
    function render() {
      const on = MarketWatchlist.has(itemId);
      btn.classList.toggle('is-on', on);
      btn.innerHTML = on ? '<span aria-hidden="true">★</span><span class="mk-btn-l"> 已關注</span>' : '<span aria-hidden="true">☆</span><span class="mk-btn-l"> 加入關注</span>';
      btn.setAttribute('aria-label', on ? '已關注（點一下取消）' : '加入關注');
      refitDetailHeader();
      btn.title = on ? '點一下取消關注' : '加入關注清單（右側「關注清單」可以看所有關注物品的價格）';
    }
    render();
    MarketWatchlist.onChange('item-btn', render); // 在抽屜裡移除時，物品頁的按鈕也要跟著變
    btn.addEventListener('click', function () {
      MarketWatchlist.toggle(itemId, ITEM_NAMES_TW_ALL[itemId] || ('#' + itemId));
      render();
    });
  }

  // 成交紀錄原本是彈窗（ensureHistoryModalDom／openHistoryModal），現在改成物品頁的「成交」分頁，
  // 直接顯示在清單區域，不用再開關視窗；表格欄位跟「在售」分頁共用同一套排版，見 loadMarketSection。

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
  // 走勢圖整份保留的時間：這段時間內切回走勢分頁，直接放回原本那張圖（縮放、天數、NQ/HQ選擇都還在），
  // 不重新讀取；超過就當資料可能過時，重新建一份。
  const TREND_VIEW_TTL = 5 * 60 * 1000;
  const TREND_RANGES = [
    { key: '1', label: '1天', days: 1 }, { key: '3', label: '3天', days: 3 },
    { key: '7', label: '7天', days: 7 }, { key: '30', label: '30天', days: 30 },
  ];
  function openTrendModal(itemId, scopeWorld) {
    const modal = ensureTrendModalDom();
    const titleEl = modal.querySelector('.market-modal-head h4');
    if (titleEl) titleEl.textContent = '近期成交走勢（' + (scopeWorld || '所有世界') + '）';
    modal.style.display = 'flex'; // 先顯示再畫：canvas要有實際尺寸才畫得出來
    renderTrendInto($('mk-trend-body'), itemId, scopeWorld);
  }
  // 走勢圖本體：寫進傳入的容器。市場頁的「走勢」分頁直接把它畫在清單區域，彈窗版本（app.openMarketTrend）也共用同一份。
  function renderTrendInto(body, itemId, scopeWorld) {
    // 這個函式內所有的 $('mk-trend-…') 都只在「自己的容器」裡找，不去全頁面找：
    // 走勢圖現在會被保留下來（切到別的分頁再切回來不用重讀），同時可能有好幾份各自的走勢圖（所有世界／某個世界）
    // 存在記憶體裡，其中沒顯示的那幾份可能還在背景讀資料——如果用全頁面找ID，背景讀完的結果會寫到「現在正在看的那一份」去。
    const $ = function (id) { return body.querySelector('#' + id); };
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
    loadRange();
  }

  // 第5點排查時發現的潛在問題：supply chain跟製作商機各自獨立判斷「CRAFT_RECIPES存在嗎」再注入<script>，
  // 兩邊都會判斷「不存在」而各自注入一次。後來生產頁（buildCraft）也有同樣問題，所以不再自己維護promise，
  // 全部集中到共用的 app.loadScriptOnce（craft-panel.js）：市場頁、生產頁、任何晚到的呼叫者都等同一個promise。
  function ensureCraftDataLoaded() {
    return app.loadScriptOnce('js/craft-data.js', function () { return typeof CRAFT_RECIPES !== 'undefined'; })
      .then(function (ok) { return ok && typeof CRAFT_RECIPES !== 'undefined'; }); // 抓不到就退回不顯示供應鏈，不要卡住詳情頁
  }

  /* ── 取得方式（兌換／NPC商店）：跟 craft-data.js 同一套「點到才動態載入」的做法，
   * SHOP_TRADES 只有點開物品詳情頁的「取得方式」區塊才會注入，平常完全不影響首次載入速度。 ── */
  let shopsDataLoadPromise = null;
  /* 代幣兌換用的兌換資料：來自 data/obtain.json（資料管線已用台服資料表驗證，並排除已過期的貨幣、
   * 限期活動的兌換），轉成下面原有價值計算（buildCurrencyBestUses／resolveChainedValue）使用的交易清單格式，
   * 那些計算邏輯完全沒有改動。另外讀 data/exchange.json 只為了知道「還有哪些物品能換到有市價的東西」，
   * 用來產生「更多代幣」清單（不在常用名單裡的）。 */
  let tradeListCache = null, exchangeStartsCache = null, tradesLoadPromise = null;
  function ensureShopsDataLoaded() {
    if (tradeListCache) return Promise.resolve(true);
    if (tradesLoadPromise) return tradesLoadPromise;
    if (typeof ObtainUI === 'undefined') return Promise.resolve(false);
    tradesLoadPromise = Promise.all([
      ObtainUI.loadData(),
      fetch('data/exchange.json').then(function (r) { if (!r.ok) throw new Error('exchange.json ' + r.status); return r.json(); }),
    ]).then(function (res) {
      const d = res[0], ex = res[1];
      const list = [];
      Object.keys(d.items).forEach(function (k) {
        (d.items[k].trades || []).forEach(function (t) {
          if (t.status !== 'active') return;                                   // 過期（dead）與限期活動（seasonal）不列入
          if (t.costs.some(function (c) { return c.id === null; })) return;    // 貨幣解讀不出來的不算
          list.push({ type: t.shopType, c: t.costs.map(function (c) { return [c.id, c.amount]; }), i: [[Number(k), t.amount]], locked: !!t.unlock });
        });
      });
      tradeListCache = list;
      exchangeStartsCache = Object.keys(ex.paths).map(function (id) { return Number(id); });
      return true;
    }).catch(function (e) { console.error('代幣兌換資料載入失敗', e); tradesLoadPromise = null; return false; });
    return tradesLoadPromise;
  }

  /* 兩個方向各建一份索引，都只在第一次用到時建立、之後重複使用：
   *  ・TRADES_BY_RESULT：查「這個物品能怎麼兌換／購買到」，key＝換到的道具id
   *  ・TRADES_BY_CURRENCY：查「這個道具當代幣／兌換品時，能換到什麼」，key＝付出的道具id
   * 一筆交易如果同時付出兩種道具（例如「代幣+金幣」換東西），會同時被兩個key收錄到。 */
  let tradesByResultCache = null, tradesByCurrencyCache = null;
  function buildTradeIndices() {
    if (tradesByResultCache) return;
    tradesByResultCache = {}; tradesByCurrencyCache = {};
    tradeListCache.forEach(function (t) {
      const entry = { type: t.type, currencies: t.c, items: t.i, locked: t.locked };
      t.i.forEach(function (it) { (tradesByResultCache[it[0]] = tradesByResultCache[it[0]] || []).push(entry); });
      t.c.forEach(function (cu) {
        if (cu[0] === 1) return; // Gil本身不用當成「代幣」去反查用途，意義不大且數量會多到無法排序
        (tradesByCurrencyCache[cu[0]] = tradesByCurrencyCache[cu[0]] || []).push(entry);
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
    function row(id) {
      const set = {};
      (tradesByCurrencyCache[id] || []).forEach(function (t) { t.items.forEach(function (it) { set[it[0]] = 1; }); });
      return { id: id, name: ITEM_NAMES_TW_ALL[id], count: Object.keys(set).length };
    }
    const pinnedSet = {};
    CURATED_CURRENCY_IDS.forEach(function (id) { pinnedSet[id] = 1; });
    const byCount = function (a, b) { return b.count - a.count; };
    const pinned = CURATED_CURRENCY_IDS.filter(function (id) { return !!ITEM_NAMES_TW_ALL[id]; }).map(row).sort(byCount);
    // 其餘：資料裡「有路徑能換到有市價物品」、且目前還有有效兌換的物品；已過期的貨幣不會出現
    const more = (exchangeStartsCache || []).filter(function (id) { return !pinnedSet[id] && ITEM_NAMES_TW_ALL[id] && tradesByCurrencyCache[id]; }).map(row).sort(byCount);
    return { pinned: pinned, more: more };
  }

  /* 這個道具的「市場等值單價」——Gil本身固定是1；其餘查預先計算資料，查不到就回傳null
   * （代表這個道具沒有市場行情，可能是帳號綁定、不可交易，或近期沒有成交）。
   * 不即時另外發查價請求：代幣/兌換清單裡經常一次列出十幾二十種道具，全部即時查會瞬間打爆查價限制，
   * 用跟供應鏈圖同一份預先計算快照最穩定，缺點是價格新鮮度跟熱度排行一樣（最多約一小時前）。 */
  function tradeItemPrice(id, dcData, basis) {
    if (Number(id) === 1) return 1;
    const mr = dcData.items[id];
    if (!mr) return null;
    if (basis === 'listing') return listingPriceWithPersp(mr, 'auto'); // 掛單價：NQ/HQ取較低（HQ便宜時不要硬用較貴的NQ）
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
    if (!mr) return { vel: 0, txnFreq: 0, n7: 0 };
    const vel = (mr[0] || 0) + (mr[1] || 0);
    const P = mr[HOT_PERSP_IDX.all];
    const txnFreq = P ? (P[3] / (HOT_TIER_DAYS[P[0]] || 30)) : 0;
    // 近7天成交筆數（判斷「明顯滯銷」用）：優先用資料裡的7天筆數 D[6]；沒有的話從頻率級距推——
    // 級距2的長窗口剛好是7天，級距1的長窗口是48小時（筆數只會比7天少，當下限用），
    // 級距3的長窗口是30天，按比例換算成7天；完全沒有頻率資料就視為0筆。
    let n7 = 0;
    const D = mr[6];
    if (D && D[6] != null) n7 = D[6];
    else if (P) n7 = P[0] === 3 ? P[3] * 7 / 30 : P[3];
    return { vel: vel, txnFreq: txnFreq, n7: n7 };
  }
  /* NPC 收購價：把東西賣給系統 NPC 能拿到的固定金額（data/npc-price.json，{物品id: 金額}，沒有這個物品＝NPC 不收）。
   * 用途一：物品頁低調顯示；用途二：「換什麼最划算」裡，不可交易、又沒有任何可追查市價的物品，
   * 用它估算價值（只用在「換到的東西」這一側，付出側不用）。固定不變，所以載入一次就夠。 */
  let npcPriceMap = null, npcPricePromise = null;
  function ensureNpcPrices() {
    if (npcPriceMap) return Promise.resolve(npcPriceMap);
    if (!npcPricePromise) {
      npcPricePromise = fetch('data/npc-price.json')
        .then(function (r) { if (!r.ok) throw new Error('npc-price.json ' + r.status); return r.json(); })
        .then(function (d) { npcPriceMap = d; return d; })
        .catch(function (e) { npcPricePromise = null; console.warn('[NPC 收購價] 載入失敗，相關功能略過：', e); return null; });
    }
    return npcPricePromise;
  }
  function npcPriceOf(id) { return npcPriceMap ? (npcPriceMap[id] || 0) : 0; }
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
    const npcV = npcPriceOf(itemId) * amountNeeded; // 0＝NPC 不收這個物品
    const npcFallback = npcV > 0 ? { v: npcV, end: Number(itemId), npc: true } : null;
    if (depth <= 0 || visited.has(itemId)) return npcFallback;
    const trades = tradesByCurrencyCache[itemId] || [];
    if (!trades.length) return npcFallback; // 沒有任何後續兌換＝死路（例如改良型裝備），不用往下，也不印訊息避免洗版
    visited.add(itemId);
    let best = null;
    trades.forEach(function (t) {
      const myAmt = (t.currencies.find(function (x) { return x[0] === Number(itemId); }) || [0, 0])[1];
      if (!myAmt) return;
      const otherCurrencies = t.currencies.filter(function (x) { return x[0] !== Number(itemId); });
      const otherCost = tradeSideValue(otherCurrencies, dcData, basis); // 其他付出方只看直接市場價，不繼續遞迴，避免路徑爆炸
      if (otherCost == null) return;
      let resultValue = 0, ok = true, bestPart = -Infinity, endId = null, anyNpc = false;
      t.items.forEach(function (it) {
        const r = resolveChainedValue(it[0], it[1], dcData, basis, depth - 1, visited);
        if (r == null) { ok = false; return; }
        resultValue += r.v;
        if (r.npc) anyNpc = true;
        if (r.v > bestPart) { bestPart = r.v; endId = r.end; } // 一次換到多樣東西時，終點取價值最高的那個
      });
      if (!ok) return;
      const net = (resultValue - otherCost) / myAmt * amountNeeded;
      if (best == null || net > best.v) best = { v: net, end: endId, npc: anyNpc };
    });
    visited.delete(itemId); // 退出這個分支時解除標記，另一條不相關的路徑如果也經過同一個中繼物品，不該被誤判成循環
    if (dbg) console.log('[CHAIN-DEBUG]   中繼物品 ' + (ITEM_NAMES_TW_ALL[itemId] || itemId) + '(id=' + itemId + ') 追查結果=', best);
    if (npcFallback && (best == null || best.v < npcFallback.v)) return npcFallback; // 賣給 NPC 比再兌換更值錢（或根本追不到）
    return best;
  }
  /* 只看「賣給系統 NPC」的兌換排行：換到的東西一律用 NPC 收購價計算（不管它有沒有市價），
   * 付出的其他代幣仍用市價算成本。NPC 收購是固定價格、不需要買家、必定成交，所以沒有賣速可言。
   * 單一物品的兌換，另外附上該物品的市價與賣速，讓玩家對照（不做任何總結，只是並列）。 */
  function buildCurrencyNpcUses(itemId, dcData, basis) {
    buildTradeIndices();
    const trades = tradesByCurrencyCache[itemId] || [];
    const rows = [];
    trades.forEach(function (t) {
      const myAmount = (t.currencies.find(function (x) { return x[0] === Number(itemId); }) || [0, 0])[1];
      if (!myAmount) return;
      const otherCost = tradeSideValue(t.currencies.filter(function (x) { return x[0] !== Number(itemId); }), dcData, basis);
      if (otherCost == null) return;
      let total = 0, ok = true;
      t.items.forEach(function (it) { const pr = npcPriceOf(it[0]); if (!(pr > 0)) { ok = false; return; } total += pr * it[1]; });
      if (!ok) return;
      let mkt = null;
      if (t.items.length === 1) {
        const mp = tradeItemPrice(t.items[0][0], dcData, basis);
        if (mp != null) { const lq = liquidityOf(t.items[0][0], dcData); mkt = { price: mp, vel: lq.vel }; }
      }
      rows.push({ resultItems: t.items, total: total, perUnit: (total - otherCost) / myAmount, mkt: mkt, locked: !!t.locked });
    });
    rows.sort(function (a, b) { return b.perUnit - a.perUnit; });
    return rows;
  }
  function closeNpcModal() { const m = $('mk-npc-modal'); if (m) { m.style.display = 'none'; m.dataset.for = ''; } }
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
      let resultValue = 0, ok = true, viaChain = false, chainEnd = null, viaNpc = false;
      t.items.forEach(function (it) {
        const direct = tradeItemPrice(it[0], dcData, basis);
        if (direct != null) { resultValue += direct * it[1]; return; }
        // 直接查不到市場價，不是馬上放棄，往下追看這個中繼物品能不能再換成有價的東西
        const chained = resolveChainedValue(it[0], it[1], dcData, basis, CHAIN_MAX_DEPTH, new Set([Number(itemId)]));
        if (chained == null) { ok = false; return; }
        resultValue += chained.v;
        if (chained.npc) viaNpc = true; // 估值來自 NPC 收購價（不是市價）
        else { viaChain = true; if (chainEnd == null) chainEnd = chained.end; }
      });
      if (!ok) return;
      const net = (resultValue - otherCost) / myAmount;
      // 賣速／成交頻率：鏈式結果看「終點物品」（真正會被賣掉的東西），一般結果維持看第一個換到的物品
      const liq = liquidityOf(viaChain && chainEnd != null ? chainEnd : t.items[0][0], dcData);
      rows.push({ resultItems: t.items, net: net, vel: liq.vel, txnFreq: liq.txnFreq, n7: liq.n7, viaChain: viaChain, chainEnd: chainEnd, viaNpc: viaNpc, locked: !!t.locked });
    });
    const key = sortKey || 'net';
    rows.sort(function (a, b) { return b[key] - a[key]; });
    return rows.slice(0, limit || 8);
  }

  async function loadSupplyChainSection(itemId) {
    const box = $('mk-detail-supply');
    if (typeof CRAFT_RECIPES === 'undefined') {
      box.innerHTML = '<p class="craft-muted">讀取配方資料中⋯</p>';
      const bvl = $('mk-band-verdict'); if (bvl) bvl.innerHTML = '<p class="craft-muted mdb-v-loading">讀取配方資料中⋯</p>';
      await ensureCraftDataLoaded();
    }
    if (typeof CRAFT_RECIPES === 'undefined') { box.innerHTML = ''; return; }
    const rid = (buildToRecipesIndex()[itemId] || [])[0];
    await renderSupplyChainWithBreakdown(itemId, rid, box);
  }

  /* 供應鏈圖外面包一層：先讀設定＋預先計算資料，把「自製 vs 直購」的結論算出來，
   * 再交給 renderSupplyChain 畫圖＋標結論。設定一改（水晶/價格基準/材料品質）就整個重算重畫，
   * 不需要重新整理整個物品詳情頁。 */
  let prefsSupplyHooked = false;
  let lastSupplyCtx = null; // 最後一次畫供應鏈圖的物品與容器：全站取價設定改了要能原地重畫
  async function renderSupplyChainWithBreakdown(itemId, rid, box, silent) { // silent＝即時價校正完成後的重畫：不顯示「讀取中」、不再發起校正
    lastSupplyCtx = { itemId: itemId, rid: rid, box: box };
    const settings = getSupplySettings();
    if (!silent) box.innerHTML = '<p class="craft-muted">讀取供應鏈中⋯</p>';
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
    // 掛單價基準：圖先用快照畫出來（不讓人等），背景查圖上物品的即時最低價，有差才重畫一次
    if (!silent && dcData && settings.materialsBasis === 'listing') {
      supplyLiveCorrect(itemId, rid, box, dcData, function () { renderSupplyChainWithBreakdown(itemId, rid, box, true); });
    }
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
        : listingPriceWithPersp(dcData.items[id], (settings.hqOverrides && settings.hqOverrides[id]) || settings.matPersp || 'auto');
      let costHtml;
      if (res.buy != null && res.craft != null) {
        const better = res.chosen === 'craft';
        const save = Math.abs(res.buy - res.craft);
        costHtml = '<div class="market-detail-cost-badge ' + (better ? 'is-craft' : 'is-buy') + '">' +
          (better ? '🔨 自製 ' + Math.round(res.craft).toLocaleString() : '🛒 直購 ' + Math.round(res.buy).toLocaleString()) +
          '　▼' + Math.round(save).toLocaleString() +
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
    return '<select id="' + id + '" class="craft-select" style="font-size:13px">' +
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
    // 「剛打開」才重設方向；面板本來就開著（調整設定後重畫內容）就沿用原本的方向，位置不會跳動
    if (!(pop.style.display === 'block' && pop.dataset.owner === 'supply')) delete pop.dataset.dir;
    pop.dataset.owner = 'supply';
    pop.classList.remove('mav-pop');
    pop.style.display = 'block';
    const s = getSupplySettings();
    const crystalOn = s.includeCrystal;
    const windowLoading = pop.dataset.windowLoading === '1'; // 30天窗口正在抓取時顯示讀取中，不讓select消失造成「沒反應」的錯覺
    pop.innerHTML =
      '<p class="craft-mat-worlds-title">供應鏈比較設定</p>' +
      '<div class="market-supply-settings-row" style="margin-bottom:2px"><span class="pp-lead">價格基準</span></div>' +
      '<div class="market-supply-settings-row">' + MarketData.pricePrefsBarHtml(['buy'], { windows: true, lead: false }) + '</div>' +
        '<p class="craft-muted pp-sync-hint">與生產頁同步</p>' +
      '<div class="market-supply-settings-row"><span>品質</span>' +
        '<select id="mk-sup-persp" class="craft-select" style="font-size:13px">' +
          '<option value="auto"' + (s.matPersp === 'auto' ? ' selected' : '') + '>自動</option>' +
          '<option value="nq"' + (s.matPersp === 'nq' ? ' selected' : '') + '>NQ</option>' +
          '<option value="hq"' + (s.matPersp === 'hq' ? ' selected' : '') + '>HQ</option>' +
        '</select></div>' +
      // 拿掉彈出提示（title），文字固定「忽略水晶成本」，圖示（💎/◇）負責表達目前開關狀態
      '<button type="button" class="market-supply-settings-row market-crystal-toggle" id="mk-sup-crystal" data-on="' + (crystalOn ? '1' : '0') + '">' +
        '<span>忽略水晶成本</span><span class="market-crystal-icon">' + (crystalOn ? '💎' : '◇') + '</span></button>';
    // 錨點：左右跟著齒輪，上下用「整列操作列」的上緣／下緣。齒輪比旁邊的「查看完整供應鏈清單」按鈕矮，
    // 如果用齒輪自己的上緣，面板底線會剛好落在右邊那顆較高的按鈕上緣，兩個框線疊在一起很不好看。
    function supplyAnchor() {
      const g = btn.getBoundingClientRect();
      const bar = (btn.closest('.market-supply-bar') || btn).getBoundingClientRect();
      return { left: g.left, right: g.right, top: bar.top, bottom: bar.bottom };
    }
    // 子選單「個別材料品質」展開後的最高高度：先暫時展開量一次再收回（同步操作，畫面不會閃），
    // 讓 placePopover 一開始就用「最大高度」決定往哪邊開
    let reserveH = 0;
    const ovBodyProbe = $('mk-sup-ov-body');
    if (ovBodyProbe) {
      const prevDisplay = ovBodyProbe.style.display;
      pop.style.maxHeight = 'none'; ovBodyProbe.style.display = 'block';
      reserveH = pop.offsetHeight;
      ovBodyProbe.style.display = prevDisplay;
    }
    placePopover(pop, supplyAnchor(), reserveH);
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
    // 改全域品質：個別物品的設定一併清掉，全部重新跟著全域走（畫面上看到的就是玩家最後選的）
    $('mk-sup-persp').addEventListener('change', function () { apply({ matPersp: this.value, hqOverrides: {} }); });
    $('mk-sup-crystal').addEventListener('click', function () { apply({ includeCrystal: this.dataset.on !== '1' }); });
    const mWin = $('mk-sup-mwindow'); if (mWin) mWin.addEventListener('change', function () { MarketData.setPricePrefs({ buyAvgWindow: this.value }); }); // 寫進共用設定；圖由 onPricePrefsChange 重畫，生產頁也會跟著變
  }
  function bindSupplySettingsPopover(box, itemId, rid, dcData) {
    const btn = box.querySelector('[data-mk-supply-settings-btn]');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      // 面板已經開著、而且是這顆齒輪開的 → 再點一次就收起來（以前只有點空白處才收得掉）
      const pop = $('mk-avgprice-popover');
      if (pop && pop.style.display === 'block' && pop.dataset.owner === 'supply') { pop.style.display = 'none'; return; }
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
  /* 差額壓縮成短字串：數字位數不固定（幾金到幾萬金都可能），超過一萬就用「萬」簡寫。
   * 一萬以下一律加千分位（跟卡片上的 18,470 格式一致，並排時才好比大小）。
   * fmtDeltaAbs 不帶正負號（徽章用圖示表示方向）；fmtDeltaBadge 是「圖示＋▼＋金額」（材料明細面板用，跟格子徽章同一套）。
   * 這兩個以前定義在 renderSupplyChain 裡面，但材料明細面板（在函式外）也會呼叫 fmtDeltaBadge，
   * 會變成「fmtDeltaBadge is not defined」，所以移到外層共用。 */
  function fmtDeltaAbs(n) {
    const abs = Math.abs(n);
    return abs >= 10000 ? (abs / 10000).toFixed(1) + '萬' : Math.round(abs).toLocaleString();
  }
  function fmtDeltaBadge(n) {
    return (n >= 0 ? '🔨' : '🛒') + '▼' + fmtDeltaAbs(n); // 圖示＝建議的做法，▼＝省下
  }

  function renderSupplyChain(itemId, rid, box, bd, dcData, settings, bdUnavailable, craftMultiplier, crystalImpact) {
    craftMultiplier = craftMultiplier || 1; // 中心物品「想做幾個」，材料數量/差額跟著這個倍數縮放，不影響買/做的判斷邏輯本身
    const recipe = rid ? CRAFT_RECIPES[rid] : null;
    const yields = recipe ? (recipe.yields || 1) : 1;
    const ings = recipe ? (recipe.ingredients || []) : [];
    const usedInRids = buildUsedInIndex()[itemId] || [];
    if (!ings.length && !usedInRids.length) { box.innerHTML = ''; const bv0 = $('mk-band-verdict'); if (bv0) bv0.innerHTML = ''; return; }
    // itemId→這項材料是買還是做／實際差多少錢，供下面畫卡片時查。不是只有中心物品的直接材料
    // 才算——圖上所有卡片（材料、用途，不分方向）都各自呼叫resolveItemBuyCraft算自己的買/做結果，
    // 用途卡片一樣是「這個成品該自己做還是買」的獨立判斷，跟它是不是中心物品的材料無關。
    // 差額＝買要花多少−做要花多少，正數＝自己做比較省、負數＝直接買比較省，兩種情況都要讓玩家
    // 不展開明細就看到實際數字，自己判斷值不值得花時間做。
    const decisionByItem = {}, deltaByItem = {}, neglByItem = {};
    // 「差距小到可以忽略就直接買」的門檻：做要花時間（無法用金額衡量），所以小差距不值得為它去做。
    // 門檻＝10金 或 買價的5%，取較大的（買價幾十萬的東西，差10金當然算相近），再乘上要做的數量。
    // 常數必須放在函式最前面：下面算每張卡片的差額時就要用到，放在後面會踩到「變數尚未宣告」。
    const NEGL_MIN = 10, NEGL_PCT = 0.05;
    function neglThreshold(unitBuy, qty) { return Math.max(NEGL_MIN, (unitBuy || 0) * NEGL_PCT) * (qty || 1); }
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
          neglByItem[id] = neglThreshold(res.buy, ing ? ing.amount * craftMultiplier : 1);
        }
      });
    }

    // 中心物品「本身」的買/做比較：成品直接買的價錢 vs 自己做（材料各自取較便宜）的成本。
    // 以前這裡用的是 bd.totalBuy − bd.totalAuto，那是「材料全買 vs 材料各選較便宜」，只反映材料要不要再往下自製，
    // 成品本身的市價從頭到尾沒拿來比，所以成品其實直接買便宜很多時，結論卻寫「買／做價格接近」。
    // resolveItemBuyCraft 本來就能算任何物品（含產出數量與水晶開關），直接拿來用，不用另外寫演算法。
    let centerCmp = null;
    const centerQChip = dcData ? qChipHtml(itemId, qualityInfo(dcData.items[itemId], itemId, settings)) : '';
    if (dcData && rid) {
      const cres = resolveItemBuyCraft(itemId, dcData, settings.materialsBasis, settings);
      if (cres.craftable && (cres.buy != null || cres.craft != null)) {
        const buyT = cres.buy != null ? cres.buy * craftMultiplier : null;
        const craftT = cres.craft != null ? cres.craft * craftMultiplier : null;
        let winner, save = null;
        if (buyT != null && craftT != null) {
          save = buyT - craftT; // 正數＝自己做比較省
          const negl = neglThreshold(cres.buy, craftMultiplier);
          winner = save > negl ? 'craft' : (save < -negl ? 'buy' : 'tie'); // tie＝相近，建議直接買
        } else winner = buyT != null ? 'buy' : 'craft'; // 只有一邊有價格，只能選那一邊
        centerCmp = { buyT: buyT, craftT: craftT, save: save, winner: winner };
      }
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
    // ── v4：HTML 版面（取代舊的縮放 SVG）──────────────────────────────────────────
    // 舊版是一張固定座標的 SVG，欄位一窄整張等比例縮小、字跟著縮到看不清楚。現在卡片全是真實的網頁元素，
    // 字級固定（名稱14／價格15，跟站內主要文字同級）；造型沿用原本與站內其他元件一致的語彙：
    // 圓角方框（6～8px，沒有膠囊形）、1.2px 金邊、半透明深底、圓形圖示、圓角轉折的發光匯流線＋菱形光點。
    // 版面密度改成「畫出來→量右欄實際寬高→放不下才降一級」（fitChain，做法同統計列的 fitStatBar）：
    // 空間夠就跟原本一樣寬鬆（直式卡片、長連接線），不為了省高度把它壓扁。
    const hasUp = useNodesFull.length > 0;
    const hasDown = matNodes.length > 0;
    const useNodes = useNodesFull.slice(0, SUPPLY_NODE_LIMIT); // 上限；實際顯示幾張由 fitChain 依空間往下調，其餘收進最後那張「還有N種」

    /* 差額徽章：「圖示＋▼＋金額」，▼＝省下。🔨▼＝建議自己做、🛒▼＝建議直接買，數字都是建議的做法能省多少。
     * negl＝這項自己的「相近」門檻，差距小於它就顯示「≈」，不特別標方向。徽章本身可以點（開明細面板），
     * 跟卡片本體的「點了跳轉」是分開的兩個互動區域（見下面的 click 綁定）。 */
    function deltaBadgeHtml(delta, badgeItemId, negl, plain) {
      if (delta == null) return '';
      const limit = negl != null ? negl : NEGL_MIN;
      const negligible = Math.abs(delta) < limit;
      const label = negligible ? '≈' : (delta > 0 ? '🔨' : '🛒') + '▼' + fmtDeltaAbs(delta);
      const cls = negligible ? 'is-neutral' : (delta > 0 ? 'is-craft' : 'is-buy');
      const tipTxt = negligible ? '這項買或製作價格接近（差距<' + Math.round(limit).toLocaleString() + '金），建議直接買'
        : (delta > 0 ? '這項自己製作比買省 ' + Math.round(delta).toLocaleString() + ' 金' : '這項直接買比製作省 ' + Math.round(-delta).toLocaleString() + ' 金');
      if (plain) return '<span class="msc-badge ' + cls + '" title="' + tipTxt + '">' + label + '</span>'; // 決策卡上的結論標記：只是顯示，不能點
      return '<span class="market-delta-badge msc-badge ' + cls + '" role="button" tabindex="0" data-mk-detail-item="' + badgeItemId + '" title="' + tipTxt + '">' + label + '</span>';
    }
    // 一張卡片。邊框顏色＝這項該買還是該做（綠＝自己做比較省，金＝照原樣買）；徽章跨在上緣右側。
    function cellHtml(n, o) {
      o = o || {};
      const attrs = n.rid
        ? ' data-mk-supply-item="' + n.itemId + '" data-mk-supply-rid="' + n.rid + '"'
        : ' data-mk-goto-item="' + n.itemId + '"'; // 不可製作的原料一樣可以點，只是跳去它自己的市場詳情頁，不是往下鑽
      const crystalOff = !!o.crystalOff;
      const decision = crystalOff ? undefined : decisionByItem[n.itemId];
      const delta = crystalOff ? null : deltaByItem[n.itemId];
      const titleTxt = n.name + (crystalOff ? '（水晶未計入成本，可在 ⚙ 設定調整）' : '');
      return '<div class="msc-cell' + (decision === 'craft' ? ' is-craft' : '') + (crystalOff ? ' is-dim' : '') + '" role="button" tabindex="0" title="' + escHtml(titleTxt) + '"' + attrs + '>' +
        '<span class="msc-ico">' + itemIconHtml(n.itemId, 30) + (crystalOff ? '<i class="msc-gem">💎</i>' : '') + '</span>' +
        '<span class="msc-body">' +
          '<span class="msc-name">' + escHtml(n.name) + '</span>' +
          '<span class="msc-nums">' +
            (n.amount != null ? '<b class="msc-qty">×' + n.amount + '</b>' : '') +
            '<span class="msc-price" data-price-item="' + n.itemId + '"' + (n.amount > 1 ? ' data-amount="' + n.amount + '"' : '') + '></span>' +
          '</span>' +
        '</span>' +
        deltaBadgeHtml(delta, n.itemId, neglByItem[n.itemId]) +
      '</div>';
    }
    // 「還有N種」：跟原本一樣是用途那排的最後一張卡片（灰色邊框），點了看全部用途清單
    const moreCellHtml = '<div class="msc-cell msc-more" role="button" tabindex="0" data-mk-usedin-more="1" title="看全部用途清單" hidden><span class="msc-more-t">還有</span><b class="msc-more-n">0種</b></div>';
    const upHtml = hasUp
      ? '<div class="msc-row msc-row-up">' + useNodes.map(function (n) { return cellHtml(n); }).join('') + moreCellHtml + '</div>'
      : '';
    const downHtml = hasDown
      ? '<div class="msc-row msc-row-down">' + matNodes.map(function (n) {
          const isCrystalMat = typeof CRYSTAL_ITEM_IDS !== 'undefined' && CRYSTAL_ITEM_IDS.has(Number(n.itemId));
          return cellHtml(n, { crystalOff: isCrystalMat && settings.includeCrystal === false }); // 水晶未計入成本：變暗，不顯示買/做徽章
        }).join('') + '</div>'
      : '';

    // 主條（中心物品）：橫跨整個欄寬。買／做用跟站內統計列同款的「標籤＋數值」方框，較便宜的亮起（做較省＝綠）、
    // 另一個變暗加刪除線。差距小到可以忽略（tie）時一律建議直接買，所以亮的是「買」，而且不出現省多少的徽章。
    let heroCmps = '', centerTitle = '', bandVerdict = null;
    if (centerCmp) {
      const c = centerCmp;
      const buyWins = c.winner === 'buy' || c.winner === 'tie';
      const craftWins = c.winner === 'craft';
      const both = c.buyT != null && c.craftT != null;
      heroCmps =
        '<span class="msc-tile ' + (buyWins ? 'is-win is-green' : 'is-lose') + (craftWins && both ? ' is-strike' : '') + '"><em>買' + centerQChip + '</em><b>' + (c.buyT != null ? fmtTotalGil(c.buyT) : '無報價') + '</b></span>' +
        '<span class="msc-tile ' + (craftWins ? 'is-win is-green' : 'is-lose') + (c.winner === 'buy' && both ? ' is-strike' : '') + '"><em>製作</em><b>' + (c.craftT != null ? fmtTotalGil(c.craftT) : '無法估價') + '</b></span>' +
        ((c.winner === 'craft' || c.winner === 'buy') ? deltaBadgeHtml(c.save, itemId, 0) : '');
      const verdict = c.save == null ? ''
        : (c.winner === 'craft' ? '自己製作省 ' + Math.round(c.save).toLocaleString() + ' 金'
          : (c.winner === 'buy' ? '直接買省 ' + Math.round(-c.save).toLocaleString() + ' 金'
            : '價格接近，建議直接買（製作還要花時間）'));
      bandVerdict = verdict ? { txt: verdict, win: c.winner } : null;
      centerTitle = '直接買 ' + (c.buyT != null ? Math.round(c.buyT).toLocaleString() : '無報價') + ' 金／自己製作 ' +
        (c.craftT != null ? Math.round(c.craftT).toLocaleString() : '無法估價') + ' 金（' + (settings.includeCrystal === false ? '不含水晶' : '含水晶') + '）' +
        (craftMultiplier > 1 ? '，' + craftMultiplier + ' 個' : '') + (verdict ? '。' + verdict : '');
    } else {
      heroCmps = '<span class="msc-price msc-hero-price" id="mk-center-price" data-price-item="' + itemId + '"></span>';
    }
    // 每次製作產出多個（yields>1）：「製作」的單價已經除過產出數，不標的話玩家看下面材料加起來比「做」貴，會以為算錯。
    const yieldHtml = (hasDown && yields > 1)
      ? '<span class="msc-yield" title="每次製作產出 ' + yields + ' 個；下方材料是製作一次的用量，「製作」的價格已經除以產出數">產×' + yields + '</span>' : '';
    const stepHtml = rid
      ? '<span class="msc-step">' +
          '<button type="button" class="msc-step-btn msc-step-dn" data-mk-qty-step="-1" aria-label="減少數量"' + (craftMultiplier > 1 ? '' : ' disabled') + '>−</button>' +
          '<span class="msc-step-n">×' + craftMultiplier + '</span>' +
          '<button type="button" class="msc-step-btn msc-step-up" data-mk-qty-step="1" aria-label="增加數量">+</button>' +
        '</span>'
      : '';
    // 供應鏈彈窗：第一行＝標題／⚙＋完整清單（水平置中）／關閉；主條只放「圖示＋名稱＋±」和「買／製作」兩行
    const headHtml =
      '<div class="msc-head">' +
        '<span class="msc-head-title">供應鏈</span>' +
        '<div class="msc-head-btns">' +
          '<button type="button" class="market-history-btn market-supply-gear" data-mk-supply-settings-btn="1" title="調整價格基準／品質／水晶是否算成本"><i class="ph ph-gear-six"></i></button>' +
          '<button type="button" class="market-history-btn market-fullchain-btn msc-list-btn" data-mk-open-fullchain="1" title="查看完整供應鏈清單">完整清單</button>' +
        '</div>' +
        '<button type="button" class="market-modal-close msc-head-close" data-mk-chain-close="1" aria-label="關閉"><i class="ph ph-x"></i></button>' +
      '</div>';
    const heroHtml =
      '<div class="msc-hero"' + (centerTitle ? ' title="' + escHtml(centerTitle) + '"' : '') + '>' +
        '<span class="msc-hero-ico">' + itemIconHtml(itemId, 48) + '</span>' +
        '<span class="msc-hero-name">' + escHtml(ITEM_NAMES_TW_ALL[itemId] || itemId) + yieldHtml + '</span>' +
        '<div class="msc-hero-step">' + stepHtml + '</div>' +
        '<div class="msc-hero-cmps">' + heroCmps + '</div>' +
      '</div>';

    box.innerHTML =
      '<div class="msc-root" data-lv="0">' + headHtml + '<svg class="msc-links" aria-hidden="true"></svg>' +
        upHtml + heroHtml + downHtml +
        '<p class="msc-key">▼ 省下　🔨 製作　🛒 買　≈ 相近（建議直接買）　單位：金</p>' +
      '</div>';

    (function () { // 物品頁左欄的「買／製作」結論卡（跟主條同一份計算結果，數量±時一起更新）＋材料一行＋供應鏈按鈕
      const bv = $('mk-band-verdict'); if (!bv) return;
      let tiles = '';
      if (centerCmp) {
        const c = centerCmp;
        const buyWins = c.winner === 'buy' || c.winner === 'tie', craftWins = c.winner === 'craft';
        const both = c.buyT != null && c.craftT != null;
        tiles = '<div class="mdb-v-tiles">' +
          '<span class="msc-tile ' + (buyWins ? 'is-win is-green' : 'is-lose') + (craftWins && both ? ' is-strike' : '') + '"><em>買' + centerQChip + '</em><b>' + (c.buyT != null ? fmtTotalGil(c.buyT) : '無報價') + '</b>' + (c.winner === 'buy' ? deltaBadgeHtml(c.save, itemId, 0, true) : '') + '</span>' +
          '<span class="msc-tile ' + (craftWins ? 'is-win is-green' : 'is-lose') + (c.winner === 'buy' && both ? ' is-strike' : '') + '"><em>製作</em><b>' + (c.craftT != null ? fmtTotalGil(c.craftT) : '無法估價') + '</b>' + (craftWins ? deltaBadgeHtml(c.save, itemId, 0, true) : '') + '</span>' +
          (craftMultiplier > 1 ? '<span class="mdb-v-mult" title="供應鏈裡設定的製作數量">×' + craftMultiplier + '</span>' : '') +
        '</div>';
      }
      const matNames = matNodes.map(function (n) {
        const isCrystalMat = typeof CRYSTAL_ITEM_IDS !== 'undefined' && CRYSTAL_ITEM_IDS.has(Number(n.itemId));
        const crafty = decisionByItem[n.itemId] === 'craft' && !(isCrystalMat && settings.includeCrystal === false);
        // 建議自製的材料：名稱前加錘子圖示（不用顏色表示，避免被誤認成「這項比較便宜」）
        return crafty ? '<span class="mdb-mat is-craft" title="這項自己製作比較省"><i class="ph ph-hammer"></i>' + escHtml(n.name) + '</span>'
          : '<span class="mdb-mat">' + escHtml(n.name) + '</span>';
      });
      const leadTxt = hasDown ? '材料' : '用途';
      const listHtml = hasDown ? matNames.join(' ') : '<span class="mdb-mat">' + useNodesFull.length + ' 種</span>';
      bv.innerHTML = '<div class="mdb-v-body">' + tiles + '<div class="mdb-v-mats">' +
        '<div class="mdb-v-mhead"><span class="mdb-v-lead">' + leadTxt + '</span>' +
        '<button type="button" class="market-solve-btn mdb-chain-btn" data-mk-open-chain="1" title="開啟完整供應鏈圖">供應鏈 ▸</button></div>' +
        '<div class="mdb-v-mlist">' + listHtml + '</div></div></div>';
      bv.querySelector('[data-mk-open-chain]').addEventListener('click', function () { openChainModal(); });
    })();
    box.querySelector('[data-mk-chain-close]').addEventListener('click', function () { closeChainModal(); });
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

    // 主條：數量大於1時，價格後面接「×N＝總價」
    if (craftMultiplier > 1) {
      const centerPriceEl = $('mk-center-price');
      if (centerPriceEl && centerPriceEl.dataset.rawPrice) {
        const unitPriceNum = parseFloat(centerPriceEl.dataset.rawPrice);
        const keepChip = centerPriceEl.querySelector('.mk-qchip'), keepChipHtml = keepChip ? keepChip.outerHTML : '';
        centerPriceEl.innerHTML = '<b class="msc-tot">' + Math.round(unitPriceNum).toLocaleString() + '</b>' +
          '<span class="msc-mult">×' + craftMultiplier + '</span><span class="msc-eq">＝</span><b class="msc-tot">' + fmtTotalGil(unitPriceNum * craftMultiplier) + '</b>' + keepChipHtml;
      }
    }
    bindSupplySettingsPopover(box, itemId, rid, dcData); // 每次重繪（含數量±）都要重新綁，舊的按鈕已經被換掉了

    // 第3點抓到的真正原因：材料/用途卡片一直以來分兩條路——可製作的點了只更新這張圖本身
    // （data-mk-supply-item→只重繪box），不可製作的原料點了卻是整頁換目標（data-mk-goto-item→
    // openItemDetail）。同一張圖上的卡片，點起來反應却不一樣，才會出現「點這個只換圖、點那個
    // 整頁跳」的不一致。統一成兩者都走完整的openItemDetail，左邊價格欄位、頁首名稱、右邊供應鏈
    // 圖永遠一起換成同一個目標物品，不會再各自為政。
    // 品質標籤：點一下依序切換 自動→NQ→HQ→自動（記在個別物品的覆寫裡）。用捕獲階段攔截，不讓卡片本體的「點了跳轉」一起觸發。
    box.__qctx = { itemId: itemId, rid: rid };
    [box, $('mk-band-verdict')].forEach(function (host) {
      if (!host || host.__qchipBound) return;
      host.__qchipBound = true;
      host.addEventListener('click', function (e) {
        const chip = e.target.closest && e.target.closest('.mk-qchip[data-qchip]');
        if (!chip) return;
        e.stopPropagation(); e.preventDefault();
        if (chip.classList.contains('is-static')) return;
        const cur = getSupplySettings(), ov = Object.assign({}, cur.hqOverrides), id = chip.dataset.qchip;
        const eff = ov[id] || cur.matPersp || 'auto'; // 目前實際生效的設定（個別優先，沒有就是全域）
        ov[id] = eff === 'nq' ? 'hq' : (eff === 'hq' ? 'auto' : 'nq'); // 自動→NQ→HQ→自動，只改這一個物品
        saveSupplySettings(Object.assign(cur, { hqOverrides: ov }));
        const ctx = box.__qctx; if (ctx) renderSupplyChainWithBreakdown(ctx.itemId, ctx.rid, box);
      }, true);
    });
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
    // 鍵盤：卡片與徽章都是 role=button，Enter／空白鍵等同點擊（只處理自己，不處理從徽章冒泡上來的事件）
    box.querySelectorAll('.msc-cell, .msc-badge').forEach(function (el) {
      el.addEventListener('keydown', function (e) {
        if (e.target !== el) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });
    });
    const moreCell = box.querySelector('[data-mk-usedin-more]');
    if (moreCell) {
      moreCell.addEventListener('click', function () { renderUsedInList(itemId); });
    }

    /* ── 自動適應：實際畫出來再量，不用估算 ──
     * 密度 0～5（data-lv），越小越寬鬆：
     *   0：直式卡片（圖示在上）、連接線最長（跟原本一樣）；1、2：同樣直式，連接線與間距逐級收緊；
     *   3：改成橫式卡片（圖示在左）；4：名稱改單行；5：極限壓縮。
     * 用途那排永遠只排一行：放得下幾張就顯示幾張（最後一張換成「還有N種」），不換行；材料排放不下才換行。
     * 從密度 0 開始試，量右欄放不放得下（scrollHeight ≤ clientHeight），放不下才降一級。
     * 字級每一級都不變。全部放不下的極端情況，才讓右欄自己捲動。手機整頁本來就往下捲，沒有高度限制，固定密度 0。 */
    const root = box.querySelector('.msc-root');
    const heroEl = root.querySelector('.msc-hero');
    const upRow = root.querySelector('.msc-row-up');
    const downRow = root.querySelector('.msc-row-down');
    const upCells = upRow ? Array.prototype.filter.call(upRow.children, function (c) { return !c.classList.contains('msc-more'); }) : [];
    const MIN_CELL_W = [156, 156, 156, 156, 150, 150]; // 卡片最小寬度：要讓 7 個中文字（13px≈91px）的名稱不換行，圖示在左的卡片至少約 154px；彈窗不夠寬時，欄數會自然減少（而不是硬擠）
    const MIN_CELL_W_OLD = [140, 140, 108, 140, 136, 130]; // 卡片改成圖示在左、整體縮小 // 各密度的卡片最小寬度（直式卡片名稱可兩行，所以較窄；橫式要放圖示，較寬）
    const COL_GAP = 12;                                 // 卡片左右間距：以前是16，縮到8省出寬度
    function visibleCells(row) { return Array.prototype.filter.call(row.children, function (c) { return !c.hidden; }); }
    let minWOverride = 0; // 手機：每排最多 2 張，名稱才讀得舒服
    function colsFor(lv, row, n) {
      const w = row.clientWidth || 0;
      return w > 0 ? Math.max(1, Math.floor((w + COL_GAP) / ((minWOverride || MIN_CELL_W[lv]) + COL_GAP))) : n;
    }
    function layoutRow(row, lv) {
      const n = visibleCells(row).length;
      if (!n) return;
      let cols = Math.min(colsFor(lv, row, n), n);
      const rows = Math.ceil(n / cols);
      cols = Math.ceil(n / rows);                 // 5張寫成3＋2，不寫成4＋1
      row.style.setProperty('--msc-cols', String(cols));
    }
    // 在這個密度下，用途那排「一行」放得下幾張：全部放得下就全顯示；放不下，最後一格留給「還有N種」
    function shownFor(lv, mobile) {
      const total = useNodesFull.length, maxShown = upCells.length;
      if (!maxShown) return 0;
      if (mobile) return total > 3 ? 3 : maxShown;  // 手機一次攤太多讀不完：3張＋「還有」，剛好排成兩列
      const cols = colsFor(lv, upRow, maxShown + 1);
      if (total <= cols) return Math.min(maxShown, total);
      return Math.max(Math.min(2, maxShown), Math.min(maxShown, cols - 1));
    }
    // 連接線：沿用原本的畫法——從出發點垂直走到中段、橫向轉彎（圓角）、再垂直走到終點，全部匯到主條中心；
    // 箭頭一律往上；光點沿用原本的接力動畫（材料→主條→用途）。換行時，外排的卡片用一小段淡線掛在內排卡片下面。
    function drawLinks() {
      const svg = root.querySelector('.msc-links');
      if (!svg) return;
      const rr = root.getBoundingClientRect(), hr = heroEl.getBoundingClientRect();
      svg.setAttribute('width', rr.width); svg.setAttribute('height', rr.height);
      svg.setAttribute('viewBox', '0 0 ' + rr.width + ' ' + rr.height);
      const cx = hr.left + hr.width / 2 - rr.left;
      let defs = '', parts = '', gn = 0;
      function elbow(a, b, bendY, r) {
        if (Math.abs(a.x - b.x) < 1) return 'M' + a.x + ',' + a.y + ' L' + b.x + ',' + b.y;
        const sy = bendY >= a.y ? 1 : -1, sx = b.x >= a.x ? 1 : -1;
        return 'M' + a.x + ',' + a.y + ' L' + a.x + ',' + (bendY - sy * r) + ' Q' + a.x + ',' + bendY + ' ' + (a.x + sx * r) + ',' + bendY +
          ' L' + (b.x - sx * r) + ',' + bendY + ' Q' + b.x + ',' + bendY + ' ' + b.x + ',' + (bendY + sy * r) + ' L' + b.x + ',' + b.y;
      }
      function link(a, b, phase) {
        const len = Math.abs(a.y - b.y);
        if (len < 8) return;
        gn++;
        const gid = 'mscg' + gn, bendY = (a.y + b.y) / 2, r = Math.max(3, Math.min(7, len / 2 - 2)), d = elbow(a, b, bendY, r);
        const k = Math.max(.45, Math.min(1, len / 44)); // 光點大小跟著連接線長度縮放，短線不會被光點塞滿
        defs += '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '">' +
          '<stop offset="0%" stop-color="#c5a059" stop-opacity="0.7"/><stop offset="100%" stop-color="#fcf6ba" stop-opacity="1"/></linearGradient>';
        parts += '<path class="cyc-arc-line" stroke="url(#' + gid + ')" d="' + d + '"/>' +
          '<path class="cyc-arc-tip" d="M' + (b.x - 5) + ',' + (b.y + 5) + ' L' + b.x + ',' + b.y + ' L' + (b.x + 5) + ',' + (b.y + 5) + '"/>' +
          '<g class="mk-spark mk-spark-' + phase + '" style="offset-path:path(\'' + d + '\');offset-rotate:auto 90deg">' +
            '<path class="cyc-spark-outer" d="M0,' + (-26 * k) + ' L' + (10 * k) + ',0 L0,' + (26 * k) + ' L' + (-10 * k) + ',0 Z"/>' +
            '<path class="cyc-spark-mid" d="M0,' + (-17 * k) + ' L' + (6 * k) + ',0 L0,' + (17 * k) + ' L' + (-6 * k) + ',0 Z"/>' +
            '<path class="cyc-spark-core" d="M0,' + (-8 * k) + ' L' + (2.4 * k) + ',0 L0,' + (8 * k) + ' L' + (-2.4 * k) + ',0 Z"/>' +
          '</g>';
      }
      function stub(x, y1, y2) { // 外排卡片掛在內排卡片下面的淡線
        if (Math.abs(y1 - y2) < 4) return;
        parts += '<path d="M' + x + ',' + y1 + ' L' + x + ',' + y2 + '" stroke="rgba(197,160,89,.5)" stroke-width="1.2" fill="none" stroke-dasharray="2 3"/>';
      }
      function port(y) { // 主條邊緣上的匯流點（菱形）
        parts += '<path d="M' + cx + ',' + (y - 4.5) + ' L' + (cx + 4.5) + ',' + y + ' L' + cx + ',' + (y + 4.5) + ' L' + (cx - 4.5) + ',' + y + ' Z" fill="#fcf6ba" opacity=".9"/>';
      }
      function rowsOf(row) { // 依上緣位置分排，由上到下
        const cells = visibleCells(row).map(function (c) { const r = c.getBoundingClientRect(); return { l: r.left - rr.left, r: r.right - rr.left, t: r.top - rr.top, b: r.bottom - rr.top }; });
        const groups = [];
        cells.forEach(function (c) { let g = groups.find(function (x) { return Math.abs(x.t - c.t) < 3; }); if (!g) { g = { t: c.t, cells: [] }; groups.push(g); } g.cells.push(c); });
        return groups.sort(function (a, b) { return a.t - b.t; });
      }
      function overlapX(a, b) { const l = Math.max(a.l, b.l), r = Math.min(a.r, b.r); return r - l > 8 ? (l + r) / 2 : null; }
      if (root.dataset.o === 'h') {
        // 橫向流向（材料在左 → 主條在中 → 用途在右）：畫法與直向完全相同（圓角肘線、金色漸層、箭頭、菱形匯流點、三層光點），
        // 只是把「垂直走、水平轉」換成「水平走、垂直轉」。每側若有兩欄卡片，外欄用一小段淡虛線掛在內欄卡片旁邊。
        const hl = hr.left - rr.left, hrt = hr.right - rr.left, hcy = (hr.top + hr.bottom) / 2 - rr.top;
        const elbowH = function (a, b, bendX, r) {
          if (Math.abs(a.y - b.y) < 1) return 'M' + a.x + ',' + a.y + ' L' + b.x + ',' + b.y;
          const sx = bendX >= a.x ? 1 : -1, sy = b.y >= a.y ? 1 : -1;
          return 'M' + a.x + ',' + a.y + ' L' + (bendX - sx * r) + ',' + a.y + ' Q' + bendX + ',' + a.y + ' ' + bendX + ',' + (a.y + sy * r) +
            ' L' + bendX + ',' + (b.y - sy * r) + ' Q' + bendX + ',' + b.y + ' ' + (bendX + sx * r) + ',' + b.y + ' L' + b.x + ',' + b.y;
        };
        const linkH = function (a, b, phase) {
          const len = Math.abs(b.x - a.x);
          if (len < 8) return;
          gn++;
          const gid = 'mscg' + gn, dy = Math.abs(a.y - b.y), bendX = (a.x + b.x) / 2;
          const r = Math.max(2, Math.min(7, dy / 2 - 1, len / 4)), d = elbowH(a, b, bendX, r);
          const k = Math.max(.45, Math.min(1, len / 44));
          defs += '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '">' +
            '<stop offset="0%" stop-color="#c5a059" stop-opacity="0.7"/><stop offset="100%" stop-color="#fcf6ba" stop-opacity="1"/></linearGradient>';
          parts += '<path class="cyc-arc-line" stroke="url(#' + gid + ')" d="' + d + '"/>' +
            '<path class="cyc-arc-tip" d="M' + (b.x - 5) + ',' + (b.y - 5) + ' L' + b.x + ',' + b.y + ' L' + (b.x - 5) + ',' + (b.y + 5) + '"/>' +
            '<g class="mk-spark mk-spark-' + phase + '" style="offset-path:path(\'' + d + '\');offset-rotate:auto 90deg">' +
              '<path class="cyc-spark-outer" d="M0,' + (-26 * k) + ' L' + (10 * k) + ',0 L0,' + (26 * k) + ' L' + (-10 * k) + ',0 Z"/>' +
              '<path class="cyc-spark-mid" d="M0,' + (-17 * k) + ' L' + (6 * k) + ',0 L0,' + (17 * k) + ' L' + (-6 * k) + ',0 Z"/>' +
              '<path class="cyc-spark-core" d="M0,' + (-8 * k) + ' L' + (2.4 * k) + ',0 L0,' + (8 * k) + ' L' + (-2.4 * k) + ',0 Z"/>' +
            '</g>';
        };
        const portH = function (x) { parts += '<path d="M' + x + ',' + (hcy - 4.5) + ' L' + (x + 4.5) + ',' + hcy + ' L' + x + ',' + (hcy + 4.5) + ' L' + (x - 4.5) + ',' + hcy + ' Z" fill="#fcf6ba" opacity=".9"/>'; };
        const stubH = function (x1, x2, y) { if (Math.abs(x1 - x2) < 4) return; parts += '<path d="M' + x1 + ',' + y + ' L' + x2 + ',' + y + '" stroke="rgba(197,160,89,.5)" stroke-width="1.2" fill="none" stroke-dasharray="2 3"/>'; };
        const cyOf = function (c) { return (c.t + c.b) / 2; };
        if (downRow) { // 材料（左）→ 主條左緣；內欄＝最右那欄
          rowsOf(downRow).forEach(function (g) {
            const cells = g.cells.slice().sort(function (x, y) { return y.r - x.r; });
            linkH({ x: cells[0].r, y: cyOf(cells[0]) }, { x: hl, y: hcy }, 'down');
            for (let i = 1; i < cells.length; i++) stubH(cells[i].r, cells[i - 1].l, cyOf(cells[i]));
          });
          portH(hl);
        }
        if (upRow) { // 主條右緣 → 用途（右）；內欄＝最左那欄
          rowsOf(upRow).forEach(function (g) {
            const cells = g.cells.slice().sort(function (x, y) { return x.l - y.l; });
            linkH({ x: hrt, y: hcy }, { x: cells[0].l, y: cyOf(cells[0]) }, 'up');
            for (let i = 1; i < cells.length; i++) stubH(cells[i - 1].r, cells[i].l, cyOf(cells[i]));
          });
          portH(hrt);
        }
        svg.innerHTML = '<defs>' + defs + '</defs>' + parts;
        return;
      }
      if (upRow) {
        const g = rowsOf(upRow), near = g[g.length - 1], hy = hr.top - rr.top;
        if (near) {
          near.cells.forEach(function (c) { link({ x: cx, y: hy }, { x: (c.l + c.r) / 2, y: c.b }, 'up'); });
          port(hy);
          for (let i = g.length - 2; i >= 0; i--) g[i].cells.forEach(function (c) { // 上方外排：卡片下緣 → 下一排卡片上緣
            let best = null; g[i + 1].cells.forEach(function (n) { const x = overlapX(c, n); if (x != null && best == null) best = x; });
            if (best != null) stub(best, c.b, g[i + 1].t);
          });
        }
      }
      if (downRow) {
        const g = rowsOf(downRow), near = g[0], hy = hr.bottom - rr.top;
        if (near) {
          near.cells.forEach(function (c) { link({ x: (c.l + c.r) / 2, y: c.t }, { x: cx, y: hy }, 'down'); });
          port(hy);
          for (let i = 1; i < g.length; i++) g[i].cells.forEach(function (c) { // 下方外排：卡片上緣 → 上一排卡片下緣
            let best = null; g[i - 1].cells.forEach(function (n) { const x = overlapX(c, n); if (x != null && best == null) best = x; });
            if (best != null) stub(best, c.t, g[i - 1].cells[0].b);
          });
        }
      }
      svg.innerHTML = '<defs>' + defs + '</defs>' + parts;
    }
    // 版面檔位看「供應鏈這一欄自己的寬度」，不看視窗寬度（左側選單／頂部導覽／兩欄並排都會改變欄寬）：
    //   l ≥600：直式卡片＋匯流線；m 480～599：同上，主條改兩層；s／xs <480：單欄＋左側脊柱線（xs <360 主條再分一行）。
    // 高度不夠只做三級輕微收緊（間距／內距，字級不變）；再不夠就讓這一欄自己捲，不再壓成橫式小字。
    function fitChain() {
      if (!root.isConnected) return;
      const colEl = box.closest('.market-col-supply');
      const W = box.clientWidth || 0;
      const tier = W >= 600 ? 'l' : (W >= 480 ? 'm' : (W >= 360 ? 's' : 'xs'));
      const stacked = !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
      const total = useNodesFull.length;
      root.dataset.w = tier;
      function apply(lv, shown) {
        root.dataset.lv = String(lv);
        upCells.forEach(function (c, i) { c.hidden = i >= shown; });
        if (moreCell) {
          moreCell.hidden = shown >= total;
          const b = moreCell.querySelector('.msc-more-n'); if (b) b.textContent = (total - shown) + '種';
        }
        if (upRow) layoutRow(upRow, lv);
        if (downRow) layoutRow(downRow, lv);
      }
      // 橫向流向：欄位夠寬（≥560）、而且材料與用途兩側都有，就改成「材料 → 主條 → 用途」由左到右。
      // 欄位通常又寬又矮，橫向才用得到寬度；主條也不會被拉成一條扁長條。
      const horiz = false; // 供應鏈改在彈窗裡看：一律上下流向，彈窗自己會捲，不用為了塞進固定高度而切換橫向
      const oneSide = false;
      if (horiz || oneSide) {
        root.dataset.o = 'h';
        root.dataset.hs = (hasDown ? 'd' : '') + (hasUp ? 'u' : '');
        root.style.setProperty('--msc-hgap', Math.max(34, Math.min(96, Math.round(34 + (W - 560) / 10))) + 'px');
        root.dataset.hn = W < 700 ? '1' : '0'; // 窄的橫向流向：卡片與主條用緊湊款
        const setCols = function () { // 每側卡片欄數：側欄夠寬（≥460）排兩欄，否則一欄
          [upRow, downRow].forEach(function (row) {
            if (!row) return;
            row.style.setProperty('--msc-cols', '1');
            row.style.setProperty('--msc-cols', row.clientWidth >= 460 ? '2' : '1');
          });
        };
        const fitsH = function () { return !colEl || colEl.scrollHeight <= colEl.clientHeight + 1; };
        const maxShown = Math.min(upCells.length, total);
        let ok = false;
        for (let lv = 0; lv <= 1 && !ok; lv++) {
          for (let shown = maxShown; shown >= Math.min(2, maxShown); shown--) {
            apply(lv, shown); setCols();
            if (fitsH()) { ok = true; break; }
          }
        }
        if (!ok) { apply(1, Math.min(2, maxShown)); setCols(); }
        drawLinks();
        return;
      }
      delete root.dataset.o; delete root.dataset.hs; delete root.dataset.hn; root.style.removeProperty('--msc-hgap');
      [upRow, downRow].forEach(function (row) { if (row) row.style.removeProperty('--msc-cols'); });
      minWOverride = stacked ? 156 : 0;
      if (stacked) { apply(0, shownFor(0, true)); drawLinks(); return; }
      function fits() { return !colEl || colEl.scrollHeight <= colEl.clientHeight; }
      for (let lv = 0; lv <= 2; lv++) { apply(lv, shownFor(lv, false)); if (fits()) break; }
      drawLinks();
    }
    box.__mscFit = fitChain; // 之後價格填完、視窗縮放、欄高改變都從這裡重算（最新一次繪製的版本）
    fitChain();
    requestAnimationFrame(function () { if (box.__mscFit === fitChain) fitChain(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (box.__mscFit === fitChain) fitChain(); });
    if (!box.__mscRO && typeof ResizeObserver !== 'undefined') {
      const host = box; // 彈窗大小改變時重算（寬度本身由彈窗決定）
      if (host) {
        let key = '', raf = 0, mo = null;
        const cleanup = function () { if (box.__mscRO) box.__mscRO.disconnect(); if (mo) mo.disconnect(); window.removeEventListener('resize', kick); };
        const kick = function () {
          if (!box.isConnected) { cleanup(); return; } // 已經換到別的物品，舊的監聽收掉
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(function () { if (box.__mscFit) box.__mscFit(); });
        };
        box.__mscRO = new ResizeObserver(function () {
          const k = Math.round(host.clientWidth) + ',' + Math.round(host.clientHeight) + ',' + Math.round(box.clientWidth);
          if (k === key) return; // 只有欄位寬高真的變了才重算；重算只改右欄內部，不會循環
          key = k; kick();
        });
        box.__mscRO.observe(host); box.__mscRO.observe(box);
        // 頂部／側邊導覽切換時，版面會經過動畫才定位好，分幾次補算，連接線才不會停在舊位置
        if (typeof MutationObserver !== 'undefined') {
          mo = new MutationObserver(function () { [0, 150, 400].forEach(function (ms) { setTimeout(kick, ms); }); });
          mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-nav-mode'] });
        }
        window.addEventListener('resize', kick);
      }
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
        p = listingPriceWithPersp(dcData.items[id], ov || matPersp || 'auto');
      }
      // 價格是玩家最想一眼看到的資訊：字級固定15px粗體、亮綠色，不再因為位數多就縮小（版面改由格子寬度自己適應）。
      // 數量大於1時，單價（較小、較淡）＝總價（大、亮）排成一行，閱讀順序就是算式，不用自己心算。
      el.classList.remove('is-none');
      delete el.dataset.rawPrice;
      if (p == null) { el.classList.add('is-none'); el.textContent = '無報價'; return; }
      el.dataset.rawPrice = String(p); // 主條數量調整時要用原始數字重算，不能從顯示文字（可能是「1.2萬」）反推
      const amount = Number(el.dataset.amount);
      const unitStr = Math.round(p).toLocaleString();
      const chip = basis === 'avg' ? '' : qChipHtml(id, qualityInfo(dcData.items[id], id, { materialsBasis: basis, hqOverrides: hqOverrides, matPersp: matPersp }));
      if (amount > 1) {
        el.innerHTML = '<span class="msc-unit">' + unitStr + '</span><span class="msc-eq">＝</span><b class="msc-tot">' + fmtTotalGil(p * amount) + '</b>' + chip;
      } else {
        el.innerHTML = '<b class="msc-tot">' + unitStr + '</b>' + chip; // 單位「金」統一寫在圖例，不重複，省橫向空間
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
      if (container.__mscFit) container.__mscFit(); // 價格文字寬度變了，供應鏈圖重新量一次版面
    }).catch(function () {
      nodes.forEach(function (el) { el.textContent = '查價失敗'; });
      if (container.__mscFit) container.__mscFit();
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
  /* ── 供應鏈彈窗 ──
   * 供應鏈圖平常畫在頁面裡一個看不見的容器（#mk-detail-supply，買／製作結論要靠它算出來）。
   * 按「供應鏈 ▸」＝把整個容器搬進彈窗，關掉再搬回原位；圖、按鈕、事件監聽都是同一份，不會重畫、不會重複綁定。
   * 層級：供應鏈彈窗 10035，比其他彈窗（10040）低，所以圖上再開的「完整清單」「材料明細」「用途清單」「⚙設定」
   * 一定疊在它上面；Esc 只關最上層的一個。 */
  function ensureChainModalDom() {
    let modal = $('mk-chain-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'mk-chain-modal';
    modal.className = 'market-modal-backdrop mk-chain-modal';
    modal.style.display = 'none';
    modal.innerHTML = '<div class="market-modal-box mk-chain-panel" role="dialog" aria-modal="true" aria-label="供應鏈"><div class="market-modal-body mk-chain-body" id="mk-chain-body"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeChainModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || modal.style.display === 'none') return;
      const overlayAbove = Array.prototype.some.call(document.querySelectorAll('.market-modal-backdrop'), function (el) {
        return el !== modal && el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
      });
      const pop = $('mk-avgprice-popover');
      if (overlayAbove || (pop && pop.style.display === 'block')) return; // 上面還有別的彈窗／面板：先關那個
      closeChainModal();
    });
    return modal;
  }
  function openChainModal() {
    const box = $('mk-detail-supply');
    if (!box || !box.querySelector('.msc-root')) return;
    if (box.classList.contains('is-in-modal')) return;
    const modal = ensureChainModalDom();
    const anchor = document.createElement('span');
    anchor.id = 'mk-chain-anchor'; anchor.hidden = true;
    box.parentNode.insertBefore(anchor, box);
    $('mk-chain-body').appendChild(box);
    box.classList.add('is-in-modal'); box.removeAttribute('aria-hidden');
    modal.style.display = 'flex';
    const refit = function () { if (box.__mscFit) box.__mscFit(); };
    requestAnimationFrame(function () { refit(); requestAnimationFrame(refit); });
    setTimeout(refit, 120);
    const cb = box.querySelector('[data-mk-chain-close]'); if (cb) cb.focus({ preventScroll: true });
  }
  function closeChainModal() {
    const modal = $('mk-chain-modal');
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    const pop = $('mk-avgprice-popover'); if (pop && pop.dataset.owner === 'supply') pop.style.display = 'none'; // ⚙設定面板跟著收
    const box = $('mk-chain-body') && $('mk-chain-body').querySelector('.mk-chain-host');
    const anchor = $('mk-chain-anchor');
    if (box) {
      box.classList.remove('is-in-modal'); box.setAttribute('aria-hidden', 'true');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor); else box.remove(); // 頁面已經換成別的物品：舊的圖直接丟掉
    }
    if (anchor) anchor.remove();
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
   *  ・matPersp：材料要看哪個品質的價格，預設 'auto'：NQ/HQ取較低價（舊版是NQ優先，HQ較便宜時會買貴）；
   *    傳 'hq' 則優先看HQ價格（配方要求HQ材料時用得到），傳 'all' 則不分品質一律用全部掛單的價格。 */
  function makeCostResolver(dcData, basis, auto, opts) {
    opts = opts || {};
    const includeCrystal = opts.includeCrystal !== false; // 預設仍然把水晶算進去，跟原本行為一致
    const matPersp = opts.matPersp || 'auto';
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
        (bd.totalAuto != null && save > 0.5 ? '　自動選較便宜 <span style="color:#4ade80">' + fmtGil(bd.totalAuto) + ' 金（▼' + fmtGil(save) + '）</span>' : '')
      : (bd.totalAuto != null ? '每 1 個材料成本（部分材料市場沒有價格，只能算自動選較便宜）：<span style="color:#4ade80">' + fmtGil(bd.totalAuto) + ' 金</span>' : '<span class="craft-muted">材料成本無法完整估算（部分項目沒有價格）</span>');
    return '<div class="market-radar-breakdown-wrap" style="--d:' + depth + '">' +
      (depth > 0 ? '<p class="craft-muted" style="font-size:11px;margin:2px 0">' + summary + '</p>' : '') +
      '<table class="market-radar-breakdown"><thead><tr><th class="market-radar-togcol"></th><th>材料</th><th>需求</th><th>買</th><th>差距</th><th>做</th><th>採用</th></tr></thead><tbody>' +
      bd.rows.map(function (p) {
        const buyTxt = p.buy != null ? fmtGil(p.buy) + ' 金' : '沒有價格';
        let craftTxt;
        if (p.craft != null) craftTxt = fmtGil(p.craft) + ' 金';
        else if (p.craftable) {
          // 注意：這裡說的是「這個道具自己做所需的材料」缺價格，不是這個道具本身沒價格（本身的價格看左邊「買」欄）
          const miss = p.missing || [];
          const names = miss.slice(0, 3).map(function (id) { return ITEM_NAMES_TW_ALL[id] || id; }).join('、');
          craftTxt = '無法完整估算' + (miss.length ? '<span class="craft-muted" style="display:block;font-size:11px" title="自己做所需的材料裡，這些道具在目前的價格基準下查不到價格">缺價格：' + names + (miss.length > 3 ? '⋯等 ' + miss.length + ' 項' : '') + '</span>' : '');
        } else craftTxt = '不能製作';
        const buyWins = p.chosen === 'buy' || p.craft == null;
        // 「差距」欄：買跟做兩個都有數字時，直接算出貴多少／省多少，不用使用者自己心算比較
        let diffTxt = '<span class="craft-muted">－</span>';
        if (p.buy != null && p.craft != null) {
          const diff = p.buy - p.craft; // 正值＝做比較便宜（買比做貴diff），負值＝買比較便宜
          if (Math.abs(diff) < 0.5) diffTxt = '<span class="craft-muted">打平</span>';
          else if (diff > 0) diffTxt = '<span style="color:#4ade80">🔨▼' + fmtGil(diff) + '</span>';
          else diffTxt = '<span style="color:#4ade80">🛒▼' + fmtGil(-diff) + '</span>';
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

  /* 依需要量吃掛單：ls＝這個材料的掛單 [[單價,數量,是否HQ],...]（由便宜到貴）。
   * 先只用 NQ（跟材料取價慣例一致），NQ 不夠才連 HQ 一起用；掛單量不夠湊滿需要量就回傳 null（改回估算，不假裝買得到）。
   * 回傳「每件平均單價」。 */
  function fillAvgUnit(ls, need) {
    let pool = ls.filter(function (x) { return !x[2]; });
    let have = pool.reduce(function (t, x) { return t + x[1]; }, 0);
    if (have < need) { pool = ls; have = pool.reduce(function (t, x) { return t + x[1]; }, 0); }
    if (have < need) return null;
    let remain = need, cost = 0;
    for (let i = 0; i < pool.length && remain > 0; i++) { const t = Math.min(remain, pool[i][1]); cost += t * pool[i][0]; remain -= t; }
    return cost / need;
  }
  function computeRadarList(jobId, ui, dcData, sellData) {
    const persp = ui.persp, buyBasis = ui.buyBasis, sellBasis = ui.sellBasis, pIdx = HOT_PERSP_IDX[persp];
    const liveLs = (buyBasis === 'listing' && ui.matMode === 'buy') ? ui.liveBuy : null; // 只有「直接買」＋最低價才依數量精算
    const rows = [];
    let skippedMat = 0, skippedSell = 0;
    // 兩種材料成本都算：畫面上要並排顯示「直接買」跟「自動選較便宜」，讓使用者知道自己做到底省多少
    const resolveBuy = makeCostResolver(dcData, buyBasis, false);
    const resolveAuto = makeCostResolver(dcData, buyBasis, true);
    const useAuto = ui.matMode === 'auto';
    const jobRecipeIds = Object.keys(CRAFT_RECIPES).filter(function (rid) { return CRAFT_RECIPES[rid].jobId === jobId && isTwRecipe(CRAFT_RECIPES[rid]); });
    const seenItem = {};
    function sumCost(recipe, resolve, refine) {
      let cost = 0, crafted = 0, refined = !!(refine && liveLs);
      for (const ing of (recipe.ingredients || [])) {
        const c = resolve(ing.itemId);
        if (!c) return null;
        let unitCost = c.cost;
        if (c.mode === 'craft') crafted++;
        else if (refine && liveLs && c.cost > 0) { // 依配方數量逐件吃掛單；查不到掛單或量不夠就退回最低價估算，並標成「估算」
          const e = liveLs[ing.itemId], f = e && e.ls ? fillAvgUnit(e.ls, ing.amount) : null;
          if (f != null) unitCost = f; else refined = false;
        }
        cost += unitCost * ing.amount;
      }
      return { cost: cost, crafted: crafted, refined: refined };
    }
    jobRecipeIds.forEach(function (rid) {
      const recipe = CRAFT_RECIPES[rid];
      if (seenItem[recipe.itemId]) return; // 同一個成品有多個配方時只算第一個
      seenItem[recipe.itemId] = true;
      const sellRow = sellData.items[recipe.itemId];
      const unit = radarUnitPrice(sellRow, persp, sellBasis);
      // 成品要「有在賣出」才有意義：只有掛單、近幾天完全沒成交的成品，賣得掉才是問題
      if (!unit || !(hotVelocity(sellRow, persp) > 0)) { skippedSell++; return; }
      const buy = sumCost(recipe, resolveBuy, true), auto = sumCost(recipe, resolveAuto, false);
      const chosen = useAuto ? auto : buy;
      if (!chosen) { skippedMat++; return; }
      let cost = chosen.cost; const craftedN = useAuto ? chosen.crafted : 0;
      const yields = recipe.yields || 1;
      let sell = unit * yields;
      if (ui.tax) { cost *= 1 + MarketData.buyTaxRate; sell *= 1 - (ui.sellTaxRate != null ? ui.sellTaxRate : 0.05); } // 含稅：買方固定5%、賣方依城市（查不到就用5%）
      const profit = sell - cost;
      const P = sellRow[pIdx];
      rows.push({
        rid: rid, itemId: recipe.itemId, cost: cost, sell: sell, unit: unit, yields: yields, profit: profit, craftedN: craftedN,
        costBuy: buy ? buy.cost : null, costAuto: auto ? auto.cost : null,
        roi: cost > 0 ? (profit / cost) * 100 : 0, vel: hotVelocity(sellRow, persp), P: P,
        otherPrice: sellBasis === 'listing' ? (P ? P[4] : null) : radarUnitPrice(sellRow, persp, 'listing'),
        refined: !useAuto && !!(buy && buy.refined),
        // ⚠：最低掛單價遠低於成交均價（可能是一兩筆低價特例，或行情正在跌），拿最低價或均價估賣價時都要留意
        warnLow: (function () { const lst = sellBasis === 'listing' ? unit : radarUnitPrice(sellRow, persp, 'listing'), av = sellBasis === 'avg' ? unit : (P ? P[4] : null); return !!(lst && av && lst < av * 0.7); })(),
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
    const ui = { job: null, matMode: 'buy', tax: false, sellTaxRate: null, persp: 'all', band: 'all', sort: 'profit', medianOnly: false, profitOnly: false, shown: 50, mode: 'pre' };
    // 即時掛單價（只在「掛單最低價」基準下用）：id -> { min, minN, minH, time }，材料用資料中心的、成品用成品範圍的
    // 買入／賣出各自一份即時掛單價（依各自的範圍查）；範圍改了就清空重查
    let liveBuy = {}, liveSell = {};
    function syncPrefs() { const pf = MarketData.getPricePrefs(); ui.buyBasis = pf.buyBasis; ui.sellBasis = pf.sellBasis; ui.buyScope = pf.buyScope; ui.sellScope = pf.sellScope; ui.liveBuy = liveBuy; }
    syncPrefs();
    const liveTried = {}; // 展開明細時已經補查過即時掛單價的道具（查過一次就不重複查）
    let liveToken = 0, liveRounds = 0, liveNote = '';
    let pc = null; // { dc, sell, meta, ageMs }
    function row(label, key, options) {
      return '<div class="market-hot-row-filter"><span class="market-hot-filter-label">' + label + '</span><span class="mk-opts">' +
        options.map(function (o) { return '<button type="button" class="craft-job-filter-btn" data-rk="' + key + '" data-rv="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</span></div>';
    }
    box.innerHTML =
      '<div class="market-radar-jobtabs mk-hscroll market-pane-fixed" id="mk-radar-jobtabs">' +
        JOB_LIST.map(function (j) { return '<button type="button" class="craft-job-filter-btn" data-mk-radar-job="' + j.id + '">' + j.name + '</button>'; }).join('') +
      '</div>' +
      '<div class="market-hot-controls market-pane-fixed" id="mk-radar-filters" style="display:none">' +
        '<div class="mk-cond">' + condFoldBtnHtml('radar') +
        '<div id="mk-radar-fold" class="mk-cpanel">' +
        '<div class="market-hot-row-filter"><span class="market-hot-filter-label">取價</span><span class="mk-opts">' + MarketData.pricePrefsBarHtml(['buy', 'sell']) + '</span></div>' +
        row('材料成本', 'matMode', [['buy', '直接買'], ['auto', '自動選較便宜（買或自己做）']]) +
        row('成品視角', 'persp', HOT_UI_BTNS.persp) +
        row('價格帶', 'band', HOT_UI_BTNS.band) +
        row('排序', 'sort', RADAR_SORTS) +
        '<label class="market-hot-median"><input type="checkbox" id="mk-radar-median"> 只看成品賣速在「同價格帶」中位數以上的配方</label>' +
        '<label class="market-hot-median"><input type="checkbox" id="mk-radar-profit"> 只顯示有獲利的配方</label>' +
        '<label class="market-hot-median" title="買方稅固定5%、賣方稅依你的城市"><input type="checkbox" id="mk-radar-tax"> 含稅</label>' +
        condDoneHtml() +
        '</div></div>' +
        '<p class="craft-muted market-hot-status" id="mk-radar-status" style="display:none"></p>' +
      '</div>' +
      '<div id="mk-radar-body" class="market-pane-scrollbody"><p class="craft-muted">選一個職業，找出材料成本低、成品行情高的配方。</p></div>';

    mkEnhanceHScroll($('mk-radar-jobtabs'));
    // 目前條件（不含「排序」）有幾項不是預設值＝徽章數字；取價設定放最後，窄時被淡出也不影響主要條件
    function radarFoldSummary() {
      const chips = [], act = function (k) { const b = box.querySelector('[data-rk="' + k + '"].active'); return b ? b.textContent : ''; };
      let n = 0;
      if (ui.matMode === 'auto') { chips.push('買或自己做'); n++; }
      if (ui.persp !== 'all') { chips.push(act('persp')); n++; }
      if (ui.band !== 'all') { chips.push(act('band')); n++; }
      chips.push(act('sort'));
      if (ui.medianOnly) { chips.push('賣速≥中位'); n++; }
      if (ui.profitOnly) { chips.push('有獲利'); n++; }
      if (ui.tax) { chips.push('含稅'); n++; }
      return { chips: chips.concat(mkPrefsChips(['buy', 'sell'])).filter(Boolean), n: n };
    }
    function syncRadarChips() { const r = radarFoldSummary(); mkSetChips('radar', r.chips, r.n); }
    condUpdaters.radar = syncRadarChips;
    function setRadarFold(open) { mkSetPanel('radar', open); }
    $('mk-radar-fold-btn').addEventListener('click', function () { setRadarFold(!$('mk-radar-fold').classList.contains('on')); });
    let radarShownJob = null;
    function setStatus(html) { const el = $('mk-radar-status'); el.innerHTML = html || ''; el.style.display = html ? '' : 'none'; }
    function sync() {
      box.querySelectorAll('[data-mk-radar-job]').forEach(function (b) { b.classList.toggle('active', ui.job !== null && parseInt(b.dataset.mkRadarJob, 10) === ui.job); });
      box.querySelectorAll('[data-rk]').forEach(function (b) { b.classList.toggle('active', String(ui[b.dataset.rk]) === b.dataset.rv); });
      $('mk-radar-filters').style.display = ui.mode === 'pre' && ui.job !== null ? '' : 'none';
      syncRadarChips();
      if (ui.job !== radarShownJob) { radarShownJob = ui.job; mkHScrollInto(box.querySelector('[data-mk-radar-job].active')); }
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
      const wantBuy = ui.buyBasis === 'listing', wantSell = ui.sellBasis === 'listing';
      if ((!wantBuy && !wantSell) || liveRounds >= 3 || !rowsTop.length) return;
      const st = MarketData.getSettings();
      const need = idsForRows(rowsTop);
      const buyName = ui.buyScope === 'world' ? st.worldName : st.dcName, sellName = ui.sellScope === 'world' ? st.worldName : st.dcName;
      const buyIds = wantBuy ? need.mats.filter(function (id) { return !liveFresh(liveBuy, id); }) : [];
      const sellIds = wantSell ? need.prod.filter(function (id) { return !liveFresh(liveSell, id); }) : [];
      if (!buyIds.length && !sellIds.length) return;
      liveRounds++;
      const token = ++liveToken, myJob = ui.job;
      liveNote = '⟳ 更新前 ' + rowsTop.length + ' 名即時價';
      const noteEl = $('mk-radar-live'); if (noteEl) noteEl.textContent = liveNote;
      let buyRes = {}, sellRes = {};
      try {
        const rs = await Promise.all([
          buyIds.length ? MarketData.fetchListingsBatchForScope(buyIds, buyName) : {},
          sellIds.length ? MarketData.fetchListingsBatchForScope(sellIds, sellName) : {},
        ]);
        buyRes = rs[0]; sellRes = rs[1];
      } catch (e) { liveNote = '⚠ 即時價更新失敗，顯示預先計算價'; const el = $('mk-radar-live'); if (el) el.textContent = liveNote; return; }
      if (token !== liveToken || myJob !== ui.job) return; // 使用者已經換了職業或又觸發了新的更新
      let stored = 0;
      function store(dest, res, ids) {
        ids.forEach(function (id) {
          const ls = res[id];
          if (!ls) return; // 這個道具沒查到（請求失敗），保留原本的價格
          stored++;
          const first = function (f) { const x = ls.find(f); return x ? x.pricePerUnit : null; };
          dest[id] = { min: ls.length ? ls[0].pricePerUnit : null, minN: first(function (l) { return !l.hq; }), minH: first(function (l) { return l.hq; }), time: Date.now(),
            ls: ls.slice(0, 40).map(function (l) { return [l.pricePerUnit, l.quantity, l.hq ? 1 : 0]; }) }; // 保留前40筆（價格、數量、HQ），依數量精算用
        });
      }
      store(liveBuy, buyRes, buyIds); store(liveSell, sellRes, sellIds);
      if (!stored) { liveNote = '⚠ 查無即時價，顯示預先計算價'; const el = $('mk-radar-live'); if (el) el.textContent = liveNote; return; }
      const hh = new Date(); const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      liveNote = '✓ 已用即時價更新前 ' + rowsTop.length + ' 名（' + pad(hh.getHours()) + ':' + pad(hh.getMinutes()) + '）';
      renderPre();
    }
    function renderPre() {
      const body = $('mk-radar-body');
      const dcView = ui.buyBasis === 'listing' ? patchData(pc.buy, liveBuy) : pc.buy;      // 材料成本用的資料（買入範圍）
      const sellView = ui.sellBasis === 'listing' ? patchData(pc.sell, liveSell) : pc.sell; // 成品售價用的資料（賣出範圍）
      ui.liveBuy = liveBuy;
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
      const buyLabel = ui.buyScope === 'world' ? '你的世界' : '所有世界';
      const isListing = ui.sellBasis === 'listing';                              // 成品用最低價
      const anyListing = ui.sellBasis === 'listing' || ui.buyBasis === 'listing'; // 任一邊用掛單價（才需要即時更新）
      const radarMore = moreInfoButton();
      body.innerHTML =
        '<p class="craft-muted" style="margin-bottom:4px">符合 ' + res.list.length + ' 個配方（' + (res.skippedSell + res.skippedMat) + ' 個查無價格）。' + radarMore.html + (anyListing ? '<span class="mk-live" id="mk-radar-live" title="即時掛單價最近更新時間">' + (liveNote || '') + '</span>' : '') + '</p>' +
        moreInfoList(radarMore.id, [
          '售價：成品' + (isListing ? '最低價' : '成交均價') + '（' + sellLabel + '，可切換）',
          '材料：' + (ui.buyBasis === 'listing' ? '最低價（NQ/HQ取較低' + (ui.buyScope === 'dc' ? '，可跨世界買' : '') + '）' : '成交均價') + '（' + buyLabel + '）',
          '材料成本：預設只算直接買；「自動選較便宜」會比較直接買和自己做',
          (ui.tax ? '已含買方稅5%與賣方稅' : '未計入買方稅、賣方稅') + '；未計入製作時間',
          '淨利／次：做一次配方（可能不只1件）的總損益',
          anyListing ? '掛單價為快照，最多約1小時前＋玩家回報延遲，僅供參考；前幾名會用即時掛單更新並依數量精算' : null,
          (ui.sellBasis === 'avg' || ui.buyBasis === 'avg') ? '成交均價取每個道具自己的長窗口均價（較高＝48小時、較低＝7天）' : null,
          '成本欄 ✓＝依配方數量逐件吃掛單精算；≈＝用最低價估算',
          '售價欄 ⚠＝最低掛單價遠低於成交均價（可能是特例，或行情正在下跌）',
          '最後更新：' + new Date(pc.meta.generatedAtMs).toLocaleString()
        ].filter(Boolean)) +
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
          const trendColor = r.change > 0 ? '#f87171' : (r.change < 0 ? '#4ade80' : 'var(--dim)'); // 全站一致：紅＝漲、綠＝跌
          const trendNote = r.P ? windowCoverageLabel(r.P) + '・漲跌 <span style="color:' + trendColor + '">' + (r.change >= 0 ? '+' : '') + r.change.toFixed(1) + '%</span>' : '成交筆數太少，沒有漲跌';
          const hasBreakdown = (CRAFT_RECIPES[r.rid].ingredients || []).length > 0;
          const expandBtn = hasBreakdown ? ' <button type="button" class="market-radar-expand" data-mk-radar-expand="' + r.rid + '" data-item="' + r.itemId + '">▸ 材料明細</button>' : '';
          const note = [yieldNote, craftNote, otherNote, trendNote].filter(Boolean).join('　·　');
          return '<tr data-mk-radar-item="' + r.itemId + '" class="market-hot-item" style="cursor:pointer"><td style="color:' + (r.profit >= 0 ? '#4ade80' : '#f87171') + '">' + (r.profit >= 0 ? '+' : '') + fmtGil(r.profit) + '金</td>' +
            '<td style="color:' + (r.roi >= 0 ? '#4ade80' : '#f87171') + '">' + (r.roi >= 0 ? '+' : '') + r.roi.toFixed(0) + '%</td><td>' + (r.refined ? '<span class="mk-ref ok" title="依配方數量逐件吃掛單精算">✓</span>' : (ui.buyBasis === 'listing' && ui.matMode === 'buy' ? '<span class="mk-ref" title="用最低價估算">≈</span>' : '')) + fmtGil(r.cost) + '金</td><td>' + (r.warnLow ? '<i class="ph ph-warning mk-warn" title="最低掛單價遠低於成交均價"></i>' : '') + fmtGil(r.sell) + '金</td><td>' + r.vel.toFixed(1) + '/天</td>' +
            '<td>' + (ITEM_NAMES_TW_ALL[r.itemId] || r.itemId) + expandBtn + '<div class="craft-muted" style="font-size:11px">' + note + '</div></td></tr>' +
            '<tr class="market-radar-detail-row" data-mk-radar-detail="' + r.rid + '" style="display:none"><td colspan="6"></td></tr>';
        }).join('') + '</tbody></table></div>' +
        (res.list.length > top.length ? '<button type="button" class="market-history-btn" id="mk-radar-more" style="margin-top:8px">顯示更多（還有 ' + (res.list.length - top.length) + ' 個）</button>' : '');
      bindMoreInfoToggles(body);
      body.querySelectorAll('[data-mk-radar-item]').forEach(function (tr) { tr.addEventListener('click', function () { openItemDetail(tr.dataset.mkRadarItem); }); });
      // 展開明細：先用手上的資料畫出來；如果有材料沒有價格（預先計算資料沒收錄），再去查即時掛單價補上、重畫一次
      function currentDcView() { return ui.buyBasis === 'listing' ? patchData(pc.buy, liveBuy) : pc.buy; }
      async function fillBreakdown(td, itemId, depth, allowFetch) {
        const bd = materialBreakdown(itemId, currentDcView(), ui.buyBasis);
        td.innerHTML = renderBreakdownHtml(bd, depth);
        if (!allowFetch || !bd || ui.buyBasis !== 'listing') return;
        const need = [];
        bd.rows.forEach(function (r) {
          if (r.buy == null) need.push(r.itemId);
          (r.missing || []).forEach(function (id) { need.push(id); });
        });
        const ids = need.filter(function (id, i) { return need.indexOf(id) === i && !liveFresh(liveBuy, id) && !liveTried[id]; });
        if (!ids.length) return;
        ids.forEach(function (id) { liveTried[id] = true; });
        const st = MarketData.getSettings();
        let res = {};
        try { res = await MarketData.fetchListingsBatchForScope(ids, ui.buyScope === 'world' ? st.worldName : st.dcName); } catch (e) { return; }
        let got = 0;
        ids.forEach(function (id) {
          const ls = res[id];
          if (!ls || !ls.length) return; // 查不到或真的沒有掛單：不覆蓋任何資料
          got++;
          const first = function (f) { const x = ls.find(f); return x ? x.pricePerUnit : null; };
          liveBuy[id] = { min: ls[0].pricePerUnit, minN: first(function (l) { return !l.hq; }), minH: first(function (l) { return l.hq; }), time: Date.now() };
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
      syncPrefs();
      if (typeof CRAFT_RECIPES === 'undefined') { body.innerHTML = '<p class="craft-muted">讀取配方資料中⋯</p>'; await ensureCraftDataLoaded(); }
      if (typeof CRAFT_RECIPES === 'undefined') { body.innerHTML = '<p class="craft-muted">配方資料載入失敗，請重新整理頁面再試。</p>'; return; }
      body.innerHTML = '<p class="craft-muted">讀取市場資料中⋯</p>';
      const myJob = ui.job, myKey = ui.buyScope + ui.sellScope;
      const buyKey = ui.buyScope === 'world' ? st.worldName : 'ALL', sellKey = ui.sellScope === 'world' ? st.worldName : 'ALL';
      const rs = await Promise.all([MarketData.loadPrecomputed(buyKey), sellKey === buyKey ? null : MarketData.loadPrecomputed(sellKey)]);
      if (myJob !== ui.job || myKey !== ui.buyScope + ui.sellScope) return;
      const buyR = rs[0], sellR = rs[1] || rs[0];
      if (ui.sellTaxRate == null && st.worldName) { MarketData.getSellTaxInfo(st.worldName).then(function (t) { if (t && t.ratePercent != null) { ui.sellTaxRate = t.ratePercent / 100; if (ui.tax && pc && ui.mode === 'pre') renderPre(); } }).catch(function () { /* 查不到就用 5% */ }); }
      if (buyR.state === 'ok' && sellR.state === 'ok') {
        pc = { buy: buyR.data, sell: sellR.data, meta: buyR.meta, ageMs: Math.max(buyR.ageMs, sellR.ageMs) };
        ui.mode = 'pre'; sync(); renderPre(); return;
      }
      if (buyR.state === 'none') { goLive('⚠ 這個網站還沒有產生過預先計算的市場資料，暫時使用舊的即時掃描。'); return; }
      ui.mode = 'pre'; sync();
      setStatus('⚠ 暫時讀不到預先計算的市場資料。 <button type="button" class="market-history-btn" id="mk-radar-retry"><i class="ph ph-arrow-clockwise"></i> 重試</button> <button type="button" class="market-history-btn" id="mk-radar-to-live2">改用即時掃描（僅供參考）</button>');
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
        if (pc && ui.mode === 'pre') renderPre();
      }
    });
    $('mk-radar-median').addEventListener('change', function () { ui.medianOnly = this.checked; ui.shown = 50; liveRounds = 0; if (pc && ui.mode === 'pre') renderPre(); });
    $('mk-radar-profit').addEventListener('change', function () { ui.profitOnly = this.checked; ui.shown = 50; liveRounds = 0; if (pc && ui.mode === 'pre') renderPre(); });
    $('mk-radar-tax').addEventListener('change', function () { ui.tax = this.checked; ui.shown = 50; if (pc && ui.mode === 'pre') renderPre(); });
    MarketData.onPricePrefsChange(function () { // 全站共用的取價設定改了（不管是在這裡還是別頁改的）：清掉即時價、重算
      if (!box.isConnected) return;
      liveBuy = {}; liveSell = {}; syncPrefs(); ui.shown = 50; liveRounds = 0;
      if (ui.job !== null && ui.mode === 'pre') show();
    });
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
        return '<tr data-mk-radar-item="' + r.itemId + '" style="cursor:pointer"><td style="color:' + (r.profit >= 0 ? '#4ade80' : '#f87171') + '">' + (r.profit >= 0 ? '+' : '') + Math.round(r.profit).toLocaleString() + '金</td><td>' + Math.round(r.cost).toLocaleString() + '金</td><td>' + Math.round(r.sell).toLocaleString() + '金<br><span class="craft-muted" style="font-size:11px">' + noteLine + '</span></td><td>' + r.name + '</td></tr>';
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
  /* 代幣分類：依「怎麼賺到、拿來做什麼」分，不用遊戲資料裡的分類（那邊只有「貨幣／其他／雜貨」三種，對玩家沒有幫助）。
   * 用物品ID指定（名稱可能改，ID不會），只有「第N期重建用…」這種一整批同樣命名的才用名稱比對。
   * 沒列到的一律進「其他」，所以新出現的代幣不會憑空消失，只是先歸在「其他」，之後補上分類就好。
   * 分類資訊是玩家端的整理，不是遊戲資料，歸類不確定的（例如空賊／遠航通貨）標籤直接用物品名稱，不亂猜用途。 */
  const R = function (a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }; // 連續物品ID（沒有對應代幣的ID會被忽略）
  const TOKEN_GROUPS = [
    { key: 'tomestone', label: '神典石', ids: [48, 28, 47], desc: '副本與團隊挑戰的獎勵貨幣' },
    { key: 'gc', label: '軍票', ids: [22, 20, 21], desc: '三大軍團的軍票（不滅隊、黑渦團、雙蛇黨）' },
    // 生產採集：票券（巧手票、大地票…）、收藏品（換票據用）、以及製作／採集用的材料。
    // 材料那一大批（2.2～2.5 的靈性岩、雲杉合板、月長石…）換到的是工匠與採集師的工具、票據、秘笈，出處是生產採集職業。
    { key: 'craft', label: '生產採集', ids: [33913, 33914, 41784, 41785, 12839, 41807, 45690, 43930, 44231, 44232, 44234]
      .concat([2644, 4763, 4864, 4866, 5822, 7690, 9466], R(7610, 7619), R(8030, 8039), R(10100, 10107), R(10112, 10124)),
      desc: '生產、採集職的票券與信用點數、收藏品，以及製作／採集用的材料' },
    { key: 'hunt', label: '狩獵', ids: [27, 10307, 26533, 20308], desc: '狩獵（通緝）任務的獎勵貨幣，包含著名兵團成員的手冊' },
    { key: 'pvp', label: 'PvP', ids: [25, 36656, 21067], desc: 'PvP 對戰的獎勵貨幣：狼印戰績、戰利水晶、凶狼項圈' },
    { key: 'fate', label: 'FATE', ids: [26807, 35833, 43961, 20638, 45043], desc: 'FATE（野外突發事件）的獎勵：雙色寶石與其收據、伊克西翁的雷角' },
    { key: 'battle', label: '戰鬥', ids: [30341, 31351, 44868, 44869, 22599, 23383, 24816, 24815, 12236, 45040, 45044, 47868], desc: '幻巧拼圖的幻巧葉、博茲雅古錢、優蕾卡的大馬士革織物與神秘印章，以及副本掉落的火龍鱗、蟲珀、暗雲半魔晶石、破破爛爛的樂譜' },
    // 寶圖：藏寶圖／寶圖迷宮掉落的稀有素材，各只換一件坐騎或道具（絢爛華麗的羽毛→阿爾科諾斯特笛、灼熱的火角→法厄同角笛…）。
    // 前兩個有查證；暮光寶石、驚奇補劑是依「同樣只換單一稀有品」的模式推斷。
    { key: 'treasure', label: '藏寶圖', ids: [37491, 39592, 41805, 39590], desc: '藏寶圖與藏寶圖迷宮掉落的稀有素材，到商人那裡換坐騎等獎勵' },
    { key: 'tribe', label: '友好部族', ids: [21073, 21074, 21075, 21076, 21077, 21078, 21079, 21080, 21081, 21935, 22525, 28186, 28187, 28188, 36657, 37854, 38952, 44472, 48084], desc: '友好部族任務的貨幣，每個部族各有一種' },
    { key: 'variant', label: '多變／異聞迷宮', ids: [38533, 38534, 38535, 39884, 39885, 39886, 41078, 41079, 41080], desc: '希拉狄哈、六根山、阿羅阿羅島的遺物、書籍與貨幣' },
    // 大型副本＝8人副本（XX之章），掉落的是「拿去換裝備的道具」。神秘貝殼／神秘原石是戈耳狄透鏡／彈簧換來的中繼物，同一條兌換鏈。
    { key: 'raid', label: '大型副本', ids: [16545, 13583, 13584, 13585, 13586, 19117, 19122, 21780, 23969], desc: '亞歷山大、歐米茄等 8 人大型副本（XX之章）掉落的兌換用道具' },
    { key: 'deep', label: '深層迷宮', ids: [15422, 23164, 38941], desc: '死者宮殿、天之御柱等深層迷宮的陶器碎片' },
    // 魔晶石交換：依「換到什麼」判斷。名稱裡有「魔晶石」不代表是這一類（暗雲半魔晶石換到的是坐騎跟髮型），
    // 所以不用名稱比對「魔晶石」，只比對「惰性」開頭那一批。
    { key: 'materia', label: '魔晶石交換', ids: [15110, 16783], desc: '用來兌換魔晶石的道具：惰性晶簇／水晶、瑪哈物質' },
    { key: 'island', label: '無人島', ids: [37549, 37550], desc: '無人島（謝爾達萊）產出的貨幣' },
    { key: 'wondrous', label: '天書奇談', ids: [22443, 22444, 26823], desc: '天書奇談的庫洛獎狀（金、銀、銅）' },
    { key: 'saucer', label: '金碟', ids: [29], desc: '金碟遊樂場的金碟幣' },
    { key: 'achieve', label: '成就', ids: [21172], desc: '成就兌換用的貨幣（成就證書，4.1 新增）' },
    { key: 'house', label: '房屋', ids: [15857, 15858], desc: '房屋相關的兌換用道具（阿爾基克薰衣草、虛無界風茄）' },
    { key: 'voyage', label: '遠航探索', ids: [15111, 15112], desc: '遠航探索獲得的黃銅通貨與白鋼通貨' },
    { key: 'official', label: '官方貨幣', ids: [12995], desc: '官方發放的特殊貨幣（白銀陸行鳥的羽毛）' },
    { key: 'skybuilder', label: '蒼天街重建', ids: [28063, 33870, 13630, 13631], desc: '蒼天街重建的振興票與各期重建物資，以及慶典參加證書、空賊通貨', fold: true },
    { key: 'other', label: '其他', ids: [], desc: '還沒有歸類的代幣（新出現的代幣會先出現在這裡）', fold: true },
  ];
  /* 代幣兌換的價格基準：所有世界（預設，整個資料中心）／我的世界。記在本機。
   * 「哪些代幣算沒有可比價、要隱藏」固定用所有世界的掛單價判斷，不跟著切換，這樣切換基準時清單不會忽多忽少。 */
  // 代幣換到的東西是拿去賣的：範圍與基準都用全站共用設定的「賣出」那一邊
  function tokenScopeEff() { return MarketData.getPricePrefs().sellScope === 'world' ? 'world' : 'all'; }
  /* 代幣兌換的「即時掛單價校正」：排行本身用預先計算的快照（最多落後一個排程週期），
   * 價格基準是「掛單價」時，展開代幣後會對排行前面那幾十個兌換物（連同它們的其他付出項、鏈式終點）查一次「現在」的最低掛單，
   * 蓋到快照上重算、重畫。做法跟製作商機的「前 50 名即時更新」一樣：快照負責「找」，即時價負責「定」。
   * 均價基準是成交窗口（歷史資料），不需要也不做即時校正。校正結果 5 分鐘內有效，同一個範圍的各代幣共用。 */
  const tokenLive = {}; // 範圍（'ALL' 或世界名）-> { 物品ID: { min, minN, minH, time } }
  const TOKEN_LIVE_TTL = 5 * 60 * 1000;
  function tokenLiveKey() { return tokenScopeEff() === 'world' ? MarketData.getSettings().worldName : 'ALL'; }
  function tokenLiveFresh(rec) { return rec && Date.now() - rec.time < TOKEN_LIVE_TTL; }
  function applyTokenLive(data) {
    if (MarketData.getPricePrefs().sellBasis !== 'listing') return data; // 只有掛單價基準才需要
    const lv = tokenLive[tokenLiveKey()];
    if (!lv) return data;
    const ids = Object.keys(lv).filter(function (id) { return tokenLiveFresh(lv[id]); });
    if (!ids.length) return data;
    const items = Object.assign({}, data.items);
    ids.forEach(function (id) {
      const row = items[id] ? items[id].slice() : [0, 0, null, null, null, null, null, null, null];
      row[2] = lv[id].min; row[7] = [lv[id].minN, lv[id].minH];
      items[id] = row;
    });
    return Object.assign({}, data, { items: items });
  }
  function tokenLiveStamp() { // 目前有效的校正裡最新的一筆時間（沒有就回傳 0）
    const lv = tokenLive[tokenLiveKey()] || {};
    let t = 0; Object.keys(lv).forEach(function (id) { if (tokenLiveFresh(lv[id]) && lv[id].time > t) t = lv[id].time; });
    return t;
  }
  async function tokenLiveCorrect(body, tokenId, gen, topRows, redraw) { // redraw＝由 renderTokenBody 傳進來的重畫函式（它定義在內層，這裡看不到）
    try {
      buildTradeIndices();
      const need = {}, rowItems = new Set();
      topRows.forEach(function (r) {
        rowItems.add(r.resultItems);
        r.resultItems.forEach(function (it) { need[it[0]] = 1; });
        if (r.chainEnd != null) need[r.chainEnd] = 1;
      });
      (tradesByCurrencyCache[tokenId] || []).forEach(function (t) { // 這些兌換的「其他付出項」也要用即時價，不然成本還是舊的
        if (!rowItems.has(t.items)) return;
        t.currencies.forEach(function (c) { if (c[0] !== Number(tokenId) && c[0] !== 1) need[c[0]] = 1; });
      });
      const key = tokenLiveKey();
      const lv = (tokenLive[key] = tokenLive[key] || {});
      const ids = Object.keys(need).filter(function (id) { return !tokenLiveFresh(lv[id]); }).slice(0, 150).map(Number);
      if (!ids.length) return;
      const st = MarketData.getSettings();
      const res = await MarketData.fetchWatchBatch(ids, key === 'ALL' ? st.dcName : key, {});
      let stored = 0;
      ids.forEach(function (id) {
        const r = res[id];
        if (!r) return; // 這個物品沒查到（請求失敗）：保留快照價，不蓋掉
        lv[id] = { min: r.min, minN: r.minNQ, minH: r.minHQ, time: Date.now() };
        stored++;
      });
      if (!stored) { tokenLiveFail(body, tokenId, gen, redraw); return; }
      // 查的期間使用者已經收起、換了代幣、或改了排序：不要蓋掉現在的畫面
      if (body.__tokGen !== gen || body.dataset.loaded !== '1' || String(body.dataset.tokenId) !== String(tokenId)) return;
      redraw();
    } catch (e) { tokenLiveFail(body, tokenId, gen, redraw); /* 校正失敗就維持快照價，不影響排行 */ }
  }
  function tokenLiveFail(body, tokenId, gen, redraw) { // 查不到即時價：把畫面底下那行字改成「查詢失敗」，免得一直顯示「正在查⋯」
    if (body.__tokGen !== gen || body.dataset.loaded !== '1' || String(body.dataset.tokenId) !== String(tokenId)) return;
    body.__tokLiveState = 'failed';
    redraw();
  }
  async function getTokenData() {
    if (tokenScopeEff() === 'world') {
      try {
        const r = await MarketData.loadPrecomputed(MarketData.getSettings().worldName);
        if (r.state === 'ok' && r.ageMs <= 24 * 3600 * 1000) return applyTokenLive(r.data);
      } catch (e) { /* 讀不到就回傳null，呼叫端自行處理 */ }
      return null;
    }
    try { // 「所有世界」固定讀 ALL，不受供應鏈的買入範圍影響
      const r = await MarketData.loadPrecomputed('ALL');
      if (r.state === 'ok' && r.ageMs <= 24 * 3600 * 1000) return applyTokenLive(r.data);
    } catch (e) { /* 讀不到就回傳null */ }
    return null;
  }
  let tokenCatSel = 'all'; // 目前選的分類，重畫、切換分頁回來都維持
  const TOKEN_SHOWHIDDEN_KEY = 'ff14fc-token-showhidden';
  let tokenShowHidden = false; // 「顯示沒有可比價兌換物的代幣」勾選狀態（會記在 localStorage）
  let tokenPopCloser = null; // 齒輪彈出卡的「點外面就收起」監聽器
  let tokenExcludeSlow = false; // 「排除明顯滯銷物品」勾選狀態（會記在 localStorage）
  /* 預設隱藏的代幣：
   * ① 換到的東西「全部都無法比價」（不可交易，或市場上完全沒有行情）——這類多半是限時活動的兌換物，或只換不可交易的外觀／坐騎，
   *    查價排行對玩家沒有意義，列出來只是增加雜訊。判斷依據是「用掛單價能不能算出至少一個兌換對象的價值」
   *    （用掛單價而不是目前選的價格基準，是為了寧可少隱藏：均價基準會因為某些物品沒成交紀錄就誤判成「全部不能比」）。
   * ② 明確指定不用看的（HIDE）：幾個「收藏用…」是拿收藏品換票據的中間物，不是玩家會拿來查價的代幣。
   * 例外（KEEP）：宇宙信用點數換到的東西要再往下兌換才有價，排行算不出來不代表沒用，保留。
   * 隱藏不是刪除：清單上方會留一行說明，點「顯示」可以全部看到（用淡色標出「無可比價」）。 */
  const HIDE_TOKEN_IDS = new Set([43930, 44231, 44232, 44234]);
  const KEEP_TOKEN_IDS = new Set([45690]);
  /* 代幣兌換分頁：獨立的查詢入口，不掛在單一物品詳情頁底下——這類代幣（詩學、軍票、巧手票…）
   * 玩家通常是「手上有一批，想知道拿去換什麼最划算」，不是先想到某個特定物品才點進去看。
   * 預設只顯示清單（圖示/名稱/能換幾種），點下去才載入排行榜內容，避免一次全部展開。 */
  async function renderTokensShell() {
    const pane = $('mk-pane-tokens');
    pane.innerHTML = '<p class="craft-muted">讀取代幣資料中⋯</p>';
    const ok = await ensureShopsDataLoaded();
    if (!ok) { pane.innerHTML = '<p class="craft-muted">代幣資料載入失敗，稍後再試。</p>'; return; }
    await ensureNpcPrices(); // 要先有 NPC 收購價，才判斷得出哪些代幣「有東西可比價」
    const dir = buildCurrencyDirectory();
    const allList = dir.pinned.concat(dir.more);
    // 先算出哪些代幣「沒有任何可比價的兌換對象」（需要市場快照；讀不到快照就不隱藏，寧可多顯示）
    const hiddenIds = {};
    let dcData0 = null;
    try { dcData0 = await getPrecomputedAllData(); } catch (e) { dcData0 = null; }
    allList.forEach(function (x) {
      if (HIDE_TOKEN_IDS.has(x.id)) { hiddenIds[x.id] = true; return; }
      if (KEEP_TOKEN_IDS.has(x.id) || !dcData0) return;
      if (!buildCurrencyBestUses(x.id, dcData0, 'listing', 1, 'net').length) hiddenIds[x.id] = true;
    });
    try { tokenShowHidden = localStorage.getItem(TOKEN_SHOWHIDDEN_KEY) === '1'; } catch (e) { tokenShowHidden = false; }
    const hiddenCount = allList.filter(function (x) { return hiddenIds[x.id]; }).length;
    // 分組：每個代幣歸到一個分類；組內依「可換種類數」多到少。顯示／隱藏切換時要重算，所以包成函式
    const groupOf = {};
    TOKEN_GROUPS.forEach(function (g) { g.ids.forEach(function (id) { groupOf[id] = g.key; }); });
    allList.forEach(function (x) { x.group = groupOf[x.id] || (/重建用/.test(x.name) ? 'skybuilder' : (/^惰性/.test(x.name) ? 'materia' : 'other')); });
    let list = allList, byGroup = {}, groups = [], groupLabel = {};
    function rebuild() {
      list = allList.filter(function (x) { return tokenShowHidden || !hiddenIds[x.id]; });
      byGroup = {};
      list.forEach(function (x) { (byGroup[x.group] = byGroup[x.group] || []).push(x); });
      Object.keys(byGroup).forEach(function (k) { byGroup[k].sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); }); });
      groups = TOKEN_GROUPS.filter(function (g) { return (byGroup[g.key] || []).length; }); // 沒有任何代幣的分類不顯示（例如「其他」歸完之後就消失）
      groupLabel = {}; groups.forEach(function (g) { groupLabel[g.key] = g.label; });
      if (tokenCatSel !== 'all' && !byGroup[tokenCatSel]) tokenCatSel = 'all';
    }
    rebuild();

    // 內容包進 market-pane-scrollbody，不然外層 .market-pane 是 overflow:hidden，清單一長就整個被裁掉、完全不能捲動。
    // 分類按鈕放在搜尋框上方：先選「哪一類」再用名稱縮小範圍，是兩個層次的篩選。
    pane.innerHTML =
      '<div class="market-token-topbar market-pane-fixed mk-cond" id="mk-token-bar">' +
        condFoldBtnHtml('token') +
        '<button type="button" id="mk-token-gear" class="market-token-gear" title="代幣兌換設定（顯示無可比價代幣／排除滯銷物品）" aria-label="代幣兌換設定" aria-haspopup="true"><i class="ph ph-gear-six"></i></button>' +
        '<button type="button" id="mk-token-sbtn" class="market-token-gear mk-tsr-btn" title="搜尋代幣" aria-label="搜尋代幣"><i class="ph ph-magnifying-glass"></i></button>' +
        '<input type="text" id="mk-token-search" class="craft-search" placeholder="搜尋代幣名稱⋯">' +
        '<button type="button" id="mk-token-sx" class="market-token-gear mk-tsr-x" title="關閉搜尋" aria-label="關閉搜尋"><i class="ph ph-x"></i></button>' +
        '<div id="mk-token-fold" class="mk-cpanel">' +
          '<div class="market-token-scope" id="mk-token-scope"></div>' +
          '<div class="market-token-cats" id="mk-token-cats"></div>' +
          '<p class="market-token-note" id="mk-token-note"></p>' +
          condDoneHtml() +
        '</div>' +
      '</div>' +
      '<div class="market-pane-scrollbody"><div class="market-token-list" id="mk-token-list"></div></div>';
    function tokenRowHtml(x, showGroup) {
      return '<div class="market-token-row' + (hiddenIds[x.id] ? ' is-nocmp' : '') + '" data-token-id="' + x.id + '">' +
        '<div class="market-token-headrow">' +
        '<button type="button" class="market-token-head" data-token-toggle="' + x.id + '">' +
          '<i class="ph ph-caret-right"></i>' + itemIconHtml(x.id, 24) +
          '<span class="market-token-name">' + x.name + '</span>' +
          '<span class="market-token-count">可換 ' + x.count + ' 種</span>' +
          (showGroup ? '<span class="market-token-gtag">' + groupLabel[x.group] + '</span>' : '') +
          (hiddenIds[x.id] ? '<span class="market-token-nocmp" title="換到的東西全部不可交易，或目前市場上沒有行情">無可比價</span>' : '') +
        '</button>' +
        '<span class="mk-npc-slot"></span>' +
        '</div>' +
        '<div class="market-token-body" id="mk-token-body-' + x.id + '" data-count="' + x.count + '" style="display:none"></div>' +
      '</div>';
    }
    function renderScope() {
      $('mk-token-scope').innerHTML = MarketData.pricePrefsBarHtml(['sell']);
    }
    function renderCats() {
      if ($('mk-token-fold-sum')) syncFoldSummary();
      $('mk-token-cats').innerHTML =
        '<button type="button" class="craft-job-filter-btn' + (tokenCatSel === 'all' ? ' active' : '') + '" data-tcat="all">全部</button>' +
        groups.map(function (g) {
          return '<button type="button" class="craft-job-filter-btn' + (tokenCatSel === g.key ? ' active' : '') + '" data-tcat="' + g.key + '" title="' + g.desc + '">' +
            g.label + '<span class="market-token-cat-n">' + byGroup[g.key].length + '</span></button>';
        }).join('');
    }
    function renderList() {
      const box = $('mk-token-list');
      const kw = ($('mk-token-search').value || '').trim();
      const sel = groups.find(function (g) { return g.key === tokenCatSel; });
      $('mk-token-note').textContent = sel ? sel.desc : '';
      $('mk-token-note').style.display = sel ? '' : 'none';
      const kwTokens = searchTokens(kw);
      const kwHit = function (x) { return tokensMatch(normNameOf('tok' + x.id, x.name), kwTokens); };
      if (kwTokens.length) {
        // 搜尋：選了某個分類就只在該分類裡找；選「全部」就全部分類一起找，每列標出所屬分類
        const pool = sel ? byGroup[sel.key] : list;
        const rows = pool.filter(kwHit);
        if (rows.length) { box.innerHTML = '<div class="market-token-panel">' + rows.map(function (x) { return tokenRowHtml(x, !sel); }).join('') + '</div>'; return; }
        const elsewhere = sel ? list.filter(kwHit).length : 0;
        // 被隱藏的代幣也要能被「找得到」：搜尋沒結果、但其實有被隱藏的符合時，明講出來，不然玩家會以為沒有這個代幣
        const hiddenMatch = tokenShowHidden ? 0 : allList.filter(function (x) { return hiddenIds[x.id] && kwHit(x); }).length;
        box.innerHTML = '<p class="craft-muted">' + (sel ? '「' + sel.label + '」裡沒有符合的代幣' + (elsewhere ? '，但其他分類有 ' + elsewhere + ' 個符合，切到「全部」可以看到。' : '。') : '沒有符合的代幣。') +
          (hiddenMatch ? '　另有 ' + hiddenMatch + ' 個被隱藏的符合（換到的東西都沒有可比價），點上方的 ⚙ 勾選「顯示沒有可比價兌換物的代幣」就能看到。' : '') + '</p>';
        return;
      }
      if (sel) { box.innerHTML = '<div class="market-token-panel">' + byGroup[sel.key].map(function (x) { return tokenRowHtml(x, false); }).join('') + '</div>'; return; }
      // 「全部」：常見的分類各自一段（有標題），數量很多的（蒼天街重建的幾十種物資、其他雜項）不攤開，
      // 只在最下面留入口，不然一打開就是上百列，真正常用的反而被淹沒。
      const open = groups.filter(function (g) { return !g.fold; });
      const folded = groups.filter(function (g) { return g.fold; });
      const PREVIEW = 8; // 超過 PREVIEW+2 個的分類，在「全部」裡只露出前 PREVIEW 個（組內已依可換種類多到少排序），其餘用按鈕連到該分類
      box.innerHTML = open.map(function (g) {
        const arr = byGroup[g.key];
        const shown = arr.length > PREVIEW + 2 ? arr.slice(0, PREVIEW) : arr;
        return '<div class="market-token-panel"><div class="market-token-group-title">' + g.label + '<span class="craft-muted">' + arr.length + '</span></div>' +
          shown.map(function (x) { return tokenRowHtml(x, false); }).join('') +
          (shown.length < arr.length ? '<button type="button" class="market-token-more" data-tcat="' + g.key + '">還有 ' + (arr.length - shown.length) + ' 項，看「' + g.label + '」全部 ›</button>' : '') + '</div>';
      }).join('') + (folded.length ? '<div class="market-token-panel"><div class="market-token-group-title">還有這些分類（數量較多，點進去看）</div><div class="market-token-fold-links">' +
        folded.map(function (g) { return '<button type="button" class="craft-job-filter-btn" data-tcat="' + g.key + '">' + g.label + '<span class="market-token-cat-n">' + byGroup[g.key].length + '</span></button>'; }).join('') + '</div></div>' : '');
    }
    // 齒輪設定（比照上方「市場設定」的彈出卡）：兩個勾選項收在這裡，齒輪放在收合列上，平常就看得到。
    // 「顯示沒有可比價兌換物的代幣」勾選＝顯示、沒勾選＝隱藏（隱藏不是刪除，勾起來就全部看得到，用淡色標出「無可比價」）。
    function syncGear() {
      const g = $('mk-token-gear'); if (g) g.classList.toggle('is-active', !!((hiddenCount && tokenShowHidden) || tokenExcludeSlow)); // 有開啟任何一項就亮點提示
    }
    function closeTokenPop() {
      const old = $('mk-token-popover'); if (old) old.remove();
      if (tokenPopCloser) { document.removeEventListener('click', tokenPopCloser); tokenPopCloser = null; }
    }
    function openTokenPop(anchor) {
      if ($('mk-token-popover')) { closeTokenPop(); return; } // 再點一次齒輪就收起
      const pop = document.createElement('div');
      pop.id = 'mk-token-popover';
      pop.className = 'craft-mat-worlds-popover craft-settings-popover';
      pop.style.display = 'flex';
      pop.innerHTML =
        '<p class="craft-mat-worlds-title">代幣兌換設定</p>' +
        (hiddenCount ? '<div class="craft-settings-field"><label class="market-token-popchk"><input type="checkbox" id="mk-token-showhidden"' + (tokenShowHidden ? ' checked' : '') + '><span>顯示沒有可比價兌換物的代幣</span></label>' +
          '<p class="craft-muted market-token-pophint">目前有 ' + hiddenCount + ' 個（多為限時活動或無可交易的兌換物），沒勾選時不會列出。</p></div>' : '') +
        '<div class="craft-settings-field"><label class="market-token-popchk" title="賣速低於 0.3 件/天，且近 7 天成交少於 5 筆的物品（掛了很久也賣不掉）。賣給 NPC 的兌換品必定成交，不受影響。"><input type="checkbox" id="mk-token-noslow"' + (tokenExcludeSlow ? ' checked' : '') + '><span>排除明顯滯銷物品</span></label>' +
          '<p class="craft-muted market-token-pophint">賣速低於 0.3 件/天，且近 7 天成交少於 5 筆。賣給 NPC 的兌換品不受影響。</p></div>';
      document.body.appendChild(pop);
      pop.addEventListener('click', function (e) { e.stopPropagation(); });
      tokenPopCloser = function () { closeTokenPop(); };
      document.addEventListener('click', tokenPopCloser);
      const sh = $('mk-token-showhidden');
      if (sh) sh.addEventListener('change', function () {
        tokenShowHidden = this.checked;
        try { localStorage.setItem(TOKEN_SHOWHIDDEN_KEY, tokenShowHidden ? '1' : '0'); } catch (e) { /* 存不了就只對這次有效 */ }
        rebuild(); renderCats(); renderList(); syncFoldSummary(); syncGear();
      });
      $('mk-token-noslow').addEventListener('change', function () {
        tokenExcludeSlow = this.checked;
        try { localStorage.setItem(TOKEN_NOSLOW_KEY, tokenExcludeSlow ? '1' : '0'); } catch (e) { /* 忽略 */ }
        syncFoldSummary(); syncGear(); refreshOpenTokenBodies();
      });
      const r = anchor.getBoundingClientRect();
      const w = pop.offsetWidth || 284;
      pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
      pop.style.top = (r.bottom + 6) + 'px';
    }
    // 篩選區收合（比照熱度排行）：收起時只剩「漏斗＋目前選了什麼」與搜尋框，清單才有空間；選擇會記住，預設收起
    const TOKEN_FOLD_KEY = 'ff14fc-token-fold', TOKEN_NOSLOW_KEY = 'ff14fc-token-noslow';
    function syncFoldSummary() {
      const chips = [tokenCatSel === 'all' ? '全部分類' : (groupLabel[tokenCatSel] || '全部分類')];
      let n = tokenCatSel !== 'all' ? 1 : 0;
      if (tokenExcludeSlow) { chips.push('排除滯銷'); n++; }
      if (tokenShowHidden) { chips.push('含無可比價'); n++; }
      mkSetChips('token', chips.concat(mkPrefsChips(['sell'])), n);
    }
    condUpdaters.token = syncFoldSummary;
    function setTokenFold(open) { mkSetPanel('token', open); }
    $('mk-token-fold-btn').addEventListener('click', function () { setTokenFold(!$('mk-token-fold').classList.contains('on')); });
    try { tokenExcludeSlow = localStorage.getItem(TOKEN_NOSLOW_KEY) === '1'; } catch (e) { tokenExcludeSlow = false; }
    // 已展開的排行要重算（排序、價格設定、排除滯銷任何一個改了都一樣）；沒展開的下次點開時再算
    function refreshOpenTokenBodies() {
      pane.querySelectorAll('.market-token-body').forEach(function (body) {
        const open = body.style.display !== 'none' && body.dataset.tokenId;
        body.dataset.loaded = '';
        if (open) renderTokenBody(body, body.dataset.tokenId);
      });
    }
    $('mk-token-gear').addEventListener('click', function (e) { e.stopPropagation(); openTokenPop(this); });
    closeTokenPop(); renderScope(); renderCats(); renderList(); syncFoldSummary(); syncGear();
    if (typeof ResizeObserver === 'function' && $('mk-token-list')) { // 視窗／欄寬改變時，已展開的列重新決定按鈕要完整、縮寫還是換行
      let npcFitRaf = 0;
      new ResizeObserver(function () { cancelAnimationFrame(npcFitRaf); npcFitRaf = requestAnimationFrame(fitAllNpcBtns); }).observe($('mk-token-list'));
    }
    MarketData.onPricePrefsChange(function () { // 全站取價設定改了：已展開的排行立刻重算，沒展開的下次點開時再算
      if (!pane.isConnected) return;
      renderScope();
      pane.querySelectorAll('.market-token-body').forEach(function (body) {
        const open = body.style.display !== 'none' && body.dataset.tokenId;
        body.dataset.loaded = '';
        if (open) renderTokenBody(body, body.dataset.tokenId);
      });
    });
    pane.addEventListener('click', function (e) {
      const c = e.target.closest('[data-tcat]');
      if (!c) return;
      tokenCatSel = c.dataset.tcat;
      renderCats(); renderList();
      setTokenFold(false); // 分類是「選一次就看結果」的操作：選完立刻收起，把空間還給清單（摘要會顯示目前分類，想換再點開）
      const sb = pane.querySelector('.market-pane-scrollbody'); if (sb) sb.scrollTop = 0;
    });
    // 代幣搜尋原本每敲一個鍵就整份重畫；注音／拼音組字中每個鍵都會觸發，手機上很容易卡。
    // 跟物品搜尋框一樣：組字中不搜、停手 120ms 才搜、組字完成立刻搜。
    (function () {
      const tin = $('mk-token-search');
      let tTimer = 0;
      tin.addEventListener('input', function (e) { clearTimeout(tTimer); if (e.isComposing) return; tTimer = setTimeout(renderList, 120); });
      tin.addEventListener('compositionend', function () { clearTimeout(tTimer); tTimer = setTimeout(renderList, 0); });
    })();
    // 窄容器：搜尋框收成放大鏡鈕，點了才換成搜尋列（關掉會一併清除關鍵字，免得「看不到的篩選」還在作用）
    $('mk-token-sbtn').addEventListener('click', function () {
      setTokenFold(false);
      $('mk-token-bar').classList.add('is-search');
      $('mk-token-search').focus();
    });
    $('mk-token-sx').addEventListener('click', function () {
      const inp = $('mk-token-search');
      inp.value = ''; inp.dispatchEvent(new Event('input'));
      $('mk-token-bar').classList.remove('is-search');
    });

    const TOKEN_SORTS = [['net', '市價'], ['vel', '賣速'], ['txnFreq', '成交頻率']];
    pane.addEventListener('click', async function (e) {
      const npcBtn = e.target.closest('[data-npc-open]');
      if (npcBtn) { e.stopPropagation(); openNpcRanking(npcBtn.dataset.npcOpen, npcBtn); return; }
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
      const tokRow = t.closest('.market-token-row');
      if (tokRow) tokRow.classList.toggle('is-open', !open);
      if (open) return;
      if (body.dataset.loaded) { fitNpcBtn(tokRow); return; }
      renderTokenBody(body, id);
    });
    // 賣速／成交頻率的數字顯示。重點：「0」不等於「沒人買」，所以不寫0，也不寫要讀懂定義的「稀少」，
    // 直接寫出門檻本身：成交頻率不到「5筆/月」、賣速不到「0.05件/天」——自己就看得懂，不需要另外的說明文字。
    // （原因：頻率在30天內成交不到5筆時算不出可靠的數字；賣速在快照裡只留到小數第二位。）
    // 每個數字後面都帶單位（金／件/天／筆/天），單位用較小較淡的字，數字本身才是視覺重點。
    function unit(t) { return '<small class="mtr-unit">' + t + '</small>'; }
    function fmtVelCell(v) {
      if (!(v > 0)) return '<span class="mtr-null" title="最近每天賣不到0.05件，幾乎沒有成交">&lt;0.05</span>' + unit('件/天');
      return (v >= 1 ? v.toFixed(1) : v.toFixed(2)) + unit('件/天');
    }
    function fmtFreqCell(f) {
      if (!(f > 0)) return '<span class="mtr-null" title="近30天成交不到5筆，筆數太少算不出可靠的頻率（不代表完全沒有成交）">&lt;5</span>' + unit('筆/月');
      return f.toFixed(2) + unit('筆/天');
    }
    /* 商店賣價排行：從表頭按鈕「往上」彈出的小浮層（不再是蓋滿畫面的視窗），
     * 這樣排行表每一列的市價欄不會被擋住，可以一邊看排行一邊對照。
     * 上方放得下（至少約180px）就往上開、高度縮到剛好放得下，內部可捲動；上方真的放不下才改往下開。 */
    async function openNpcRanking(id, anchor) {
      let pop = $('mk-npc-modal');
      if (!pop) {
        pop = document.createElement('div');
        pop.id = 'mk-npc-modal'; pop.className = 'mk-npc-pop'; pop.style.display = 'none';
        pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-labelledby', 'mk-npc-title');
        pop.innerHTML = '<div class="mk-npc-head"><h4 id="mk-npc-title"></h4><button type="button" class="mk-npc-close" aria-label="關閉"><i class="ph ph-x"></i></button></div>' +
          '<div class="mk-npc-body" id="mk-npc-body"></div>';
        document.body.appendChild(pop);
        pop.addEventListener('click', function (e) { if (e.target.closest('.mk-npc-close')) closeNpcModal(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNpcModal(); });
        document.addEventListener('mousedown', function (e) { // 點浮層外面就關（點排行表頭那顆按鈕交給它自己切換）
          if (pop.style.display !== 'none' && !pop.contains(e.target) && !e.target.closest('[data-npc-open]')) closeNpcModal();
        });
        window.addEventListener('resize', closeNpcModal);
        document.addEventListener('scroll', function (e) { // 頁面捲動時不關閉，只跟著錨點重新定位；錨點捲出畫面才關；浮層自己內部捲動不算
          if (pop.style.display === 'none' || pop.contains(e.target)) return;
          const a = pop._anchor;
          if (!a || !a.isConnected) { closeNpcModal(); return; }
          const r = a.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) { closeNpcModal(); return; }
          if (pop._place) pop._place();
        }, true);
      }
      if (pop.style.display !== 'none' && pop.dataset.for === String(id)) { closeNpcModal(); return; } // 再按一次＝收起
      pop.dataset.for = String(id);
      pop._anchor = anchor;
      function place() {
        if (pop.style.display === 'none') return;
        const m = 8, gap = 6, CAP = 340, MIN_ABOVE = 180;
        const r = (anchor && anchor.isConnected) ? anchor.getBoundingClientRect() : null;
        if (!r) { closeNpcModal(); return; }
        pop.style.maxHeight = 'none';
        const natural = pop.offsetHeight;
        const above = r.top - gap - m, below = window.innerHeight - r.bottom - gap - m;
        const wantUp = above >= Math.min(natural, CAP, MIN_ABOVE);
        const room = wantUp ? above : below;
        pop.style.maxHeight = Math.max(120, Math.min(CAP, room)) + 'px';
        pop.style.left = Math.max(m, Math.min(r.left, window.innerWidth - pop.offsetWidth - m)) + 'px';
        if (wantUp) { pop.style.top = 'auto'; pop.style.bottom = (window.innerHeight - r.top + gap) + 'px'; pop.dataset.dir = 'up'; }
        else { pop.style.bottom = 'auto'; pop.style.top = (r.bottom + gap) + 'px'; pop.dataset.dir = 'down'; }
      }
      pop._place = place;
      const curName = ITEM_NAMES_TW_ALL[id] || ('#' + id);
      $('mk-npc-title').innerHTML = '🏪 商店賣價排行';
      const nbody = $('mk-npc-body');
      nbody.innerHTML = '<p class="craft-muted">讀取中⋯</p>';
      pop.style.display = 'flex'; place();
      const dcData = await getTokenData();
      await ensureNpcPrices();
      if (pop.style.display === 'none' || pop.dataset.for !== String(id)) return; // 讀取期間已被關掉或換了別的代幣
      if (!dcData) { nbody.innerHTML = '<p class="craft-muted">目前沒有可用的市場快照資料，暫時無法算出排行。</p>'; place(); return; }
      const rows = buildCurrencyNpcUses(id, dcData, MarketData.getPricePrefs().sellBasis);
      if (!rows.length) { nbody.innerHTML = '<p class="craft-muted">這個代幣換到的東西，系統 NPC 都不收購。</p>'; place(); return; }
      const STEP = 30;
      let shown = 0;
      function draw() {
        shown = Math.min(rows.length, shown + STEP);
        // 每列一行：名次｜名稱×數量｜市價・賣速｜每1代幣多少金；放不下時整列自動換行
        nbody.innerHTML = '<p class="mk-npc-sub">' + itemIconHtml(id, 16) + '所對應兌換物品的NPC收購價。依「每 1' + itemIconHtml(id, 14) + '相等於多少金」排序</p>' +
          '<div class="mk-npc-list">' +
          rows.slice(0, shown).map(function (r, i) {
            const label = r.resultItems.map(function (x) { return itemRefHtml(x[0], { icon: 20, name: true }) + (x[1] > 1 ? '×' + x[1] : ''); }).join('＋');
            const mkt = r.mkt ? '<span class="mk-npc-mkt">市價 ' + Math.round(r.mkt.price).toLocaleString() + '・' + fmtVelCell(r.mkt.vel) + '</span>' : '';
            const per = Math.abs(r.perUnit) < 10 ? r.perUnit.toFixed(1) : Math.round(r.perUnit).toLocaleString();
            return '<div class="mk-npc-row"><span class="mk-npc-rank">' + (i + 1) + '</span>' +
              '<span class="mk-npc-name">' + label + (r.locked ? '<span class="market-token-chain-tag" title="需要先完成任務或成就才能兌換">🔒</span>' : '') + '</span>' + mkt +
              '<span class="mk-npc-per"><b>' + per + '</b>' + unit('金') + '</span></div>';
          }).join('') + '</div>' +
          (shown < rows.length ? '<button type="button" class="market-token-more" id="mk-npc-more">顯示更多（還有 ' + (rows.length - shown) + ' 種）</button>' : '');
        const more = $('mk-npc-more'); if (more) more.addEventListener('click', draw);
        place();
      }
      draw();
    }
    // 「商店賣價排行」按鈕的文字長度由實際空間決定：先試完整文字「商店賣價排行」，
    // 同一行放不下就縮成「商店價」再試；還是放不下，就回到完整文字、讓它自然換到下一行（靠右）。
    // 用量的，不用猜寬度——名稱短就多留一點，名稱長就早一點縮。
    function fitNpcBtn(row) {
      if (!row || !row.classList.contains('is-open')) return;
      const btn = row.querySelector('.mk-npc-slot .mk-npc-open');
      const head = row.querySelector('.market-token-head');
      if (!btn || !head || !head.offsetParent) return;
      function sameLine() { return btn.getBoundingClientRect().top < head.getBoundingClientRect().bottom - 2; }
      btn.classList.remove('is-short'); row.dataset.npcFit = 'full';
      if (sameLine()) return;
      btn.classList.add('is-short'); row.dataset.npcFit = 'short';
      if (sameLine()) return;
      btn.classList.remove('is-short'); row.dataset.npcFit = 'wrap';
    }
    function fitAllNpcBtns() { pane.querySelectorAll('.market-token-row.is-open').forEach(fitNpcBtn); }
    async function renderTokenBody(body, id, silent) { // silent＝即時價校正完成後的重畫：不顯示「讀取中」、不重新發起校正
      body.dataset.loaded = '1';
      const gen = silent ? body.__tokGen : (body.__tokGen = (body.__tokGen || 0) + 1); // 每次完整重畫換編號，校正回來時用來判斷畫面還是不是同一份
      const tokRow = body.closest('.market-token-row');
      const npcSlot = tokRow && tokRow.querySelector('.mk-npc-slot');
      if (npcSlot) npcSlot.innerHTML = '';
      if (!silent) body.innerHTML = '<p class="craft-muted">讀取排行中⋯</p>';
      const settings = getSupplySettings();
      const dcData = await getTokenData();
      if (body.__tokGen !== gen) return; // 讀資料的期間又有新的重畫（換排序、換代幣），這一份作廢
      if (!dcData) {
        body.innerHTML = tokenScopeEff() === 'world'
          ? '<p class="craft-muted">目前沒有「' + MarketData.getSettings().worldName + '」的市場快照資料，暫時無法算出排行；可以切回「所有世界」。</p>'
          : '<p class="craft-muted">目前沒有可用的市場快照資料，暫時無法算出排行。</p>';
        return;
      }
      await ensureNpcPrices();
      const sortKey = body.dataset.sort || 'net';
      const SHOW = 20;
      const allRaw = buildCurrencyBestUses(id, dcData, MarketData.getPricePrefs().sellBasis, 99999, sortKey);
      // 排除明顯滯銷：賣速<0.3件/天，且近7天成交<5筆（兩個條件同時成立才排除）。
      // 賣給 NPC 的列（必定成交）一律保留，這正是這個選項要讓 NPC 即賣能公平競爭的原因。
      const all = tokenExcludeSlow ? allRaw.filter(function (r) { return (r.viaNpc && !r.viaChain && !r.vel) || !(r.vel < 0.3 && (r.n7 || 0) < 5); }) : allRaw;
      const slowCut = allRaw.length - all.length;
      const best = all.slice(0, SHOW);
      const npcCount = buildCurrencyNpcUses(id, dcData, MarketData.getPricePrefs().sellBasis).length;
      const totalTrades = Number(body.dataset.count) || 0;
      if (!best.length) {
        body.innerHTML = '<p class="craft-muted">' + (slowCut ? '排除明顯滯銷物品之後，這個代幣沒有剩下可比價的兌換品（排除了 ' + slowCut + ' 種）。可以點上方的 ⚙ 取消勾選。' : '這個代幣可換的 ' + totalTrades + ' 種東西，都是不可交易且NPC收購價為0，或目前市場上沒有行情的物品。') + '</p>';
        return;
      }
      // 排行改成「表頭＋對齊的欄」：欄名只在表頭寫一次，點表頭就能換排序。
      // 每列底下一條淡淡的長條＝目前排序指標的相對大小，不用逐列比數字就看得出差距。
      const maxMetric = Math.max.apply(null, best.map(function (r) { return Math.max(0, r[sortKey] || 0); })) || 1;
      function sortHead(key, cls, html, tip) {
        return '<button type="button" class="mtr-sort ' + cls + (sortKey === key ? ' active' : '') + '" data-token-sort="' + key + '" title="' + tip + '">' + html + '</button>';
      }
      const npcBtnHtml = npcCount ? '<button type="button" class="mk-npc-open mk-npc-open-row" data-npc-open="' + id + '" title="只看賣給系統 NPC 的價格排行（固定價格、不需要等買家、必定成交），共 ' + npcCount + ' 種">🏪 ' + '<span class="mk-npc-l-full">商店賣價排行</span><span class="mk-npc-l-short">商店價</span>（' + npcCount + '） ›</button>' : '';
      const headHtml = '<div class="mtr-head"><span class="mtr-rank"></span><span class="mtr-name">' + '' + '</span>' +
        sortHead('net', 'mtr-val', '每1' + itemIconHtml(id, 13) + '價值', '用1個這種代幣，大約能換到多少金幣的東西（換成最划算的那一種）') +
        sortHead('vel', 'mtr-vel', '賣速', '最近每天大約賣出幾件') +
        sortHead('txnFreq', 'mtr-freq', '成交頻率', '近30天平均每天成交幾筆；30天內成交不到5筆時算不出來，顯示「<5筆/月」') +
      '</div>';
      // 清單底下的一行小字：直接回答「可換399種，為什麼只看到1個」——只列得出行情的才會出現在排行裡，
      // 其餘（不可交易的裝備、幻卡、樂譜，或可交易但目前市場沒有任何行情的）算不出價值，所以不列。
      const notes = [];
      notes.push(all.length > SHOW ? '列出前 ' + SHOW + ' 名，共 ' + all.length + ' 種可比價' : '共 ' + all.length + ' 種可比價');
      if (tokenScopeEff() === 'world') notes.push('價格以「' + MarketData.getSettings().worldName + '」為準');
      if (slowCut) notes.push('已排除 ' + slowCut + ' 種明顯滯銷物品');
      if (MarketData.getPricePrefs().sellBasis === 'listing') {
        const liveAt = tokenLiveStamp();
        if (liveAt) { const hh = new Date(liveAt); notes.push('已用即時掛單價校正（' + (hh.getHours() < 10 ? '0' : '') + hh.getHours() + ':' + (hh.getMinutes() < 10 ? '0' : '') + hh.getMinutes() + '）'); }
        else notes.push(body.__tokLiveState === 'failed' ? '即時掛單價查詢失敗，顯示的是預先計算快照（約每15分鐘更新）' : '價格為預先計算快照（約每15分鐘更新），正在查即時掛單價⋯');
      }
      if (totalTrades > allRaw.length) notes.push('另有 ' + (totalTrades - allRaw.length) + ' 種不可交易且NPC收購價為0，或目前市場上沒有行情');
      const legendParts = [];
      if (best.some(function (r) { return r.viaChain; })) legendParts.push('🔗→ 再兌換成該物品後的市價');
      if (best.some(function (r) { return r.viaNpc; })) legendParts.push('🏪 以 NPC 收購價估算（不可交易）');
      if (best.some(function (r) { return r.locked; })) legendParts.push('🔒 需先完成任務或成就');
      body.innerHTML = '<div class="mtr-wrap">' + headHtml + best.map(function (r, i) {
        const first = r.resultItems[0];
        const label = r.resultItems.map(function (x) { return itemRefHtml(x[0], { name: true }) + (x[1] > 1 ? '×' + x[1] : ''); }).join('＋');
        // 🔗＝這個物品本身不可交易，淨值是追查它能再換到什麼有市場價的東西才算出來的，
        // 不是這個物品自己的市場價——用一個小圖示標出來；滑鼠停留可以看到追查到哪個最終物品。
        const endName = r.chainEnd != null ? (ITEM_NAMES_TW_ALL[r.chainEnd] || r.chainEnd) : '';
        const chainTag = r.viaChain ? '<span class="market-token-chain-tag" title="此物品不可交易，數值為再兌換成「' + endName + '」後的市價">🔗' + (r.chainEnd != null ? '→' + itemRefHtml(r.chainEnd, { icon: 16, name: true, cls: 'mk-itemref-chain', title: '查看「' + endName + '」（此物品不可交易，數值為再兌換成它之後的市價）' }) : '') + '</span>' : '';
        const npcTag = r.viaNpc ? '<span class="market-token-chain-tag mk-npc-tag" title="此物品不可交易，數值按賣給 NPC 的收購價估算（固定價格，不需要等買家）">🏪</span>' : '';
        const noLiq = r.viaNpc && !r.viaChain && !r.vel; // NPC 收購沒有「賣速」這回事
        const net = Math.abs(r.net) < 10 ? r.net.toFixed(1) : Math.round(r.net).toLocaleString();
        const pct = Math.max(0, Math.min(100, (Math.max(0, r[sortKey] || 0) / maxMetric) * 100));
        return '<div role="button" tabindex="0" class="mtr-row" data-mk-goto-item="' + first[0] + '">' +
          '<span class="mtr-bar" style="width:' + pct.toFixed(1) + '%"></span>' +
          '<span class="mtr-rank">' + (i + 1) + '</span>' +
          '<span class="mtr-name">' + itemIconHtml(first[0], 22) + '<span class="mtr-label">' + label + '</span>' + chainTag + npcTag + (r.locked ? '<span class="market-token-chain-tag" title="需要先完成任務或成就才能兌換">🔒</span>' : '') + '</span>' +
          '<span class="mtr-val' + (sortKey === 'net' ? ' active' : '') + '">' + net + unit('金') + '</span>' +
          '<span class="mtr-vel' + (sortKey === 'vel' ? ' active' : '') + '">' + (noLiq ? '<span class="mk-instant" title="賣給系統 NPC：固定價格、不需要等買家，100% 成交">即賣</span>' : fmtVelCell(r.vel)) + '</span>' +
          '<span class="mtr-freq' + (sortKey === 'txnFreq' ? ' active' : '') + '">' + (noLiq ? '<span class="mk-instant" title="賣給系統 NPC：固定價格、不需要等買家，100% 成交">即賣</span>' : fmtFreqCell(r.txnFreq)) + '</span>' +
        '</div>';
      }).join('') + (legendParts.length ? '<p class="mtr-legend">' + legendParts.join('<span class="mtr-legend-gap"></span>') + '</p>' : '') + '<p class="mtr-foot">' + notes.join('；') + '</p></div>';
      body.querySelectorAll('[data-mk-goto-item]').forEach(function (el) {
        el.addEventListener('click', function () { openItemDetail(el.dataset.mkGotoItem); });
        el.addEventListener('keydown', function (e) { // 整列已不是 <button>，補上鍵盤操作
          if (e.target !== el || (e.key !== 'Enter' && e.key !== ' ')) return;
          e.preventDefault(); openItemDetail(el.dataset.mkGotoItem);
        });
      });
      if (npcSlot) { npcSlot.innerHTML = npcBtnHtml; fitNpcBtn(tokRow); }
      // 掛單價基準：快照畫好之後，背景查一次排行前面那些物品的即時最低價，回來再重畫一次（均價基準是歷史成交，不需要）
      if (!silent && MarketData.getPricePrefs().sellBasis === 'listing') { body.__tokLiveState = 'pending'; tokenLiveCorrect(body, id, gen, all.slice(0, 40), function () { renderTokenBody(body, id, true); }); }
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
      return '<div class="market-hot-row-filter" id="' + rowId + '"><span class="market-hot-filter-label">' + label + '</span><span class="mk-opts">' +
        HOT_UI_BTNS[key].map(function (o) { return '<button type="button" class="craft-job-filter-btn" data-hk="' + key + '" data-hv="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</span></div>';
    }
    box.innerHTML =
      '<div class="market-hot-controls market-pane-fixed">' +
        '<div class="market-hot-scope mk-hscroll" id="mk-hot-scope">' +
          '<button type="button" class="craft-job-filter-btn active" data-mk-hot-scope="ALL">所有世界</button>' +
          worldNames.map(function (w) { return '<button type="button" class="craft-job-filter-btn" data-mk-hot-scope="' + w + '">' + w + '</button>'; }).join('') +
        '</div>' +
        '<div class="mk-cond">' + condFoldBtnHtml('hot') +
        '<div id="mk-hot-fold" class="mk-cpanel">' +
        '<p class="craft-muted market-hot-scope-note"><strong>提醒：</strong>只能在自己的世界掛賣，「所有世界」僅供參考。</p>' +
        btnRow('指標', 'metric', 'mk-hf-metric') +
        '<div id="mk-hot-filters">' +
          btnRow('視角', 'persp', 'mk-hf-persp') + btnRow('成交頻率', 'freq', 'mk-hf-freq') + btnRow('方向', 'dir', 'mk-hf-dir') + btnRow('價格帶', 'band', 'mk-hf-band') +
          '<label class="market-hot-median" id="mk-hot-median-label"><input type="checkbox" id="mk-hot-median"> 只看賣速在「同價格帶」中位數以上的道具（成交冷清的先排除）</label>' +
        '</div>' +
        condDoneHtml() +
        '</div></div>' +
        '<p class="craft-muted market-hot-status" id="mk-hot-status"></p>' +
      '</div>' +
      '<div id="mk-hot-body" class="market-pane-scrollbody"><p class="craft-muted">讀取市場資料中⋯</p></div>';
    fitMarketHeights();
    mkEnhanceHScroll($('mk-hot-scope'));

    // 篩選區收合：收起時只留一條「目前選了什麼」的摘要（沿用按鈕上的短字），清單才有空間；選擇會記住
    function hotFoldSummary() {
      return ['metric', 'persp', 'freq', 'dir', 'band'].map(function (k) {
        const b = box.querySelector('[data-hk="' + k + '"].active'); const row = b && b.closest('.market-hot-row-filter');
        const t = b && (!row || row.style.display !== 'none') && b.dataset.hv !== 'all' ? b.textContent : '';
        return t && k === 'freq' ? '頻率' + t : t; // 「較高」單獨出現看不出是什麼，加上「頻率」
      }).filter(Boolean);
    }
    function syncHotChips() { const c = hotFoldSummary(); mkSetChips('hot', c, Math.max(0, c.length - 1)); } // 第一個是「指標」（一定有），不算進徽章
    condUpdaters.hot = syncHotChips;
    function setHotFold(open) { mkSetPanel('hot', open); }
    $('mk-hot-fold-btn').addEventListener('click', function () { setHotFold(!$('mk-hot-fold').classList.contains('on')); });
    let hotShownScope = null;
    function syncButtons() {
      box.querySelectorAll('[data-hk]').forEach(function (b) { b.classList.toggle('active', ui[b.dataset.hk] === b.dataset.hv); });
      syncHotChips();
      box.querySelectorAll('[data-mk-hot-scope]').forEach(function (b) { b.classList.toggle('active', b.dataset.mkHotScope === ui.scope); });
      if (ui.scope !== hotShownScope) { hotShownScope = ui.scope; mkHScrollInto(box.querySelector('[data-mk-hot-scope].active')); }
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

    /* 預先計算模式下，名稱旁那個綠色的「掛單最低價」是快照裡的值。排行（漲跌、賣速）本來就是用成交窗口算的、不受影響，
     * 這個價格只是顯示，所以顯示出來的那幾十筆另外查一次即時最低價，直接改掉畫面上的數字（不重排、不重畫）。 */
    const hotLiveMin = {}; // '範圍|物品ID' -> { min, time }
    function hotLiveUpdate(ids, scope, body) {
      const s = MarketData.getSettings(), scopeName = scope === 'ALL' ? s.dcName : scope;
      if (!scopeName || !ids.length) return;
      const keyOf = function (id) { return scope + '|' + id; };
      const fresh = function (rec) { return rec && Date.now() - rec.time < 5 * 60 * 1000; };
      function paint() {
        ids.forEach(function (id) {
          const rec = hotLiveMin[keyOf(id)];
          if (!fresh(rec)) return;
          const el = body.querySelector('[data-mk-hot-item="' + id + '"] .market-hot-price');
          if (!el) return;
          const hh = new Date(rec.time);
          el.textContent = rec.min != null ? fmtGil(rec.min) + '金' : '無人出售';
          el.title = '已用即時掛單價更新（' + (hh.getHours() < 10 ? '0' : '') + hh.getHours() + ':' + (hh.getMinutes() < 10 ? '0' : '') + hh.getMinutes() + '）；掛單隨時會變動，只供參考，不參與任何計算';
        });
      }
      paint();
      const need = ids.filter(function (id) { return !fresh(hotLiveMin[keyOf(id)]); });
      if (!need.length) return;
      MarketData.fetchWatchBatch(need.map(Number), scopeName, {}).then(function (res) {
        need.forEach(function (id) { if (res[id]) hotLiveMin[keyOf(id)] = { min: res[id].min, time: Date.now() }; }); // 沒查到的保留快照價
        if (ui.scope !== scope || $('mk-hot-body') !== body) return; // 查的期間使用者換了範圍或畫面已重畫
        paint();
      }).catch(function () { /* 查不到就維持快照價（旁邊的提示本來就寫了可能已變動） */ });
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
          '資料來源：Universalis成交紀錄，約每15分鐘更新（陸行鳥全部可交易道具，有成交才列入）',
          '漲跌：短窗口對長窗口成交均價（都從現在算起）；看漲／看跌不含漲跌幅剛好0.0%（持平）的道具',
          '頻率分級：較高24小時／48小時、一般3天／7天、較低7天／30天；各自門檻至少3筆／5筆成交，不夠會試下一級或算「太少」',
          '賣速只作參考，不影響頻率分級',
          '價格帶依長窗口均價分；綠色數字為掛單最低價，可能已變動，僅供參考',
          '最後更新：' + generated.toLocaleString()
        ]) +
        '<div class="market-hot-list">' +
          '<div class="market-hot-head"><span class="mhh-rank"></span><span class="mhh-icon"></span><span class="mhh-name">物品</span><span class="mhh-bar">' + metricDef.label + '</span><span class="mhh-val">數值</span></div>' +
          top.map(function (e, i) {
            const v = e.value;
            const barPct = Math.max(4, Math.round((Math.log(Math.abs(v) + 1) / Math.log(maxVal + 1)) * 100));
            const barColor = ui.metric === 'changePct' ? (v > 0 ? '#f87171' : (v < 0 ? '#4ade80' : '#c5a059')) : '#c5a059'; // 漲跌幅度：紅＝漲、綠＝跌（全站一致）；賣速等指標不是價格方向，維持金色
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
      hotLiveUpdate(top.map(function (e) { return e.id; }), ui.scope, body);
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
      summaryLine = '<p class="craft-muted" style="margin-bottom:8px">共 ' + withValue.length + ' 項可判斷：<span style="color:#f87171">漲 ' + up + '</span>／<span style="color:#4ade80">跌 ' + down + '</span>／平 ' + flat +
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
          '<div class="market-hot-head"><span class="mhh-rank"></span><span class="mhh-icon"></span><span class="mhh-name">物品</span><span class="mhh-bar">' + metricDef.label + '</span><span class="mhh-val">數值</span></div>' +
        top.map(function (r, i) {
          const v = r.stats[metricKey];
          // 數值跨好幾個數量級時用對數比例，才分得出差異
          const barPct = Math.max(4, Math.round((Math.log(Math.abs(v) + 1) / Math.log(maxVal + 1)) * 100));
          const barColor = ui.metric === 'changePct' ? (v > 0 ? '#f87171' : (v < 0 ? '#4ade80' : '#c5a059')) : '#c5a059'; // 漲跌幅度：紅＝漲、綠＝跌（全站一致）；賣速等指標不是價格方向，維持金色
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
