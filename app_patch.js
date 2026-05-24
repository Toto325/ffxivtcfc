/**
 * app_patch.js  v7
 *
 * 修正清單：
 *  1. _fetch：移除永遠失敗的 allorigins，改為 corsproxy.io → codetabs → allorigins 三段降級
 *  2. _parseFashionClean：
 *     - 核心 Bug 修正：.reply-content 是巴哈文章主體，不可移除，改為針對性提取
 *     - 移除過於寬泛的 [class*="header"] / [class*="nav"] / [class*="tool"] 萬用符選擇器
 *     - 改為精確移除 .c-reply__footer / .c-reply__reaction / .c-reply__bottom
 *  3. init：補回 _recentViewed 初始化（原 script.js 有但 patch 遺漏）
 *  4. nav：桌面版 visibility 動畫需要 rAF 再加 active class 確保過渡生效
 *  5. fetchFashion / fetchNews：快取邏輯小修（避免 note 重複插入）
 */
(function () {

  /* ══ _fetch：三段 proxy 降級 ══════════════════════════════════════
   * 優先順序：corsproxy.io → codetabs.com → allorigins（最後手段）
   * allorigins 對多數台灣站台回傳 403/500，放最後避免浪費時間
   * ══════════════════════════════════════════════════════════════ */
  app._fetch = async function (url, ms) {
    ms = ms || 12000;
    var proxies = [
      function (u) { return 'https://corsproxy.io/?' + encodeURIComponent(u); },
      function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); },
      function (u) { return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); },
    ];
    for (var i = 0; i < proxies.length; i++) {
      try {
        var ctrl = new AbortController();
        var tid  = setTimeout(function () { ctrl.abort(); }, ms);
        var r    = await fetch(proxies[i](url), { signal: ctrl.signal });
        clearTimeout(tid);
        if (!r.ok) continue;
        var tx = await r.text();
        /* allorigins 回傳 JSON wrapper，先嘗試解析 */
        try { var j = JSON.parse(tx); if (j.contents && j.contents.length > 200) return j.contents; } catch (_) {}
        if (tx.length > 200) return tx;
      } catch (_) { continue; }
    }
    return null;
  };

  /* ══ init ══════════════════════════════════════════════════════ */
  app.init = function () {
    this._navFF = []; this._ihFF = [];
    /* Bug Fix：補回 script.js 中存在但 patch 遺漏的 _recentViewed */
    this._recentViewed = JSON.parse(localStorage.getItem('xiv_rv') || '[]');
    this.initStars();
    this.initNavFF();
    this._startFFLoop();
    this._initIH();
    this.nav('home');
    window.addEventListener('resize', function () { app.initStars(); });
    document.querySelectorAll('.nav-item[data-nav]').forEach(function (el) {
      el.addEventListener('click', function () { app.nav(el.dataset.nav); });
    });
  };

  /* ══ nav ════════════════════════════════════════════════════════
   * 桌面版用 visibility 動畫：先重置所有 scene，再用 rAF 確保
   * 瀏覽器完成一次 layout 後才加 active，transition 才會觸發
   * 手機版（style_patch.css）用 display:none/flex，直接切換
   * ══════════════════════════════════════════════════════════════ */
  app.nav = function (id) {
    document.querySelectorAll('.scene').forEach(function (s) {
      s.classList.remove('active');
      s.style.display = '';   /* 清除 script.js 可能殘留的 inline display:none */
    });
    document.querySelectorAll('.nav-item[data-nav]').forEach(function (n) {
      n.classList.toggle('active', n.dataset.nav === id);
    });
    var t = document.getElementById(id);
    if (!t) return;
    /* rAF 確保移除 active 的 repaint 完成後才加回，讓 opacity transition 生效 */
    requestAnimationFrame(function () {
      t.classList.add('active');
    });
    var vp = document.getElementById('viewport');
    if (vp && vp.scrollTop) vp.scrollTop = 0;
    if (id === 'news'      && !this._nDone) { this._nDone = true; this.fetchNews(); }
    if (id === 'fashion'   && !this._fDone) { this._fDone = true; this.fetchFashion(); }
    if (id === 'submarine' && !this._sDone) { this._sDone = true; this.buildSub(); }
  };

  /* ══ fetchNews（stale-while-revalidate）════════════════════════ */
  app.fetchNews = async function () {
    var ctn      = document.getElementById('news-list');
    if (!ctn) return;
    var NEWS_URL  = 'https://www.ffxiv.com.tw/web/news/news_list.aspx';
    var CACHE_KEY = 'xiv_news_cache';
    var self      = this;

    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) {}

    /* 有快取先顯示，避免頁面空白 */
    if (cached && cached.html) {
      self._renderNews(ctn, cached.html);
      /* 避免重複插入 note */
      var existNote = ctn.parentElement && ctn.parentElement.querySelector('.news-cache-note');
      if (!existNote) {
        var note = document.createElement('div');
        note.className   = 'news-cache-note';
        note.textContent = '（快取・' + new Date(cached.ts).toLocaleDateString('zh-TW') + '，更新中⋯）';
        ctn.parentElement.insertBefore(note, ctn);
      }
    }

    var html    = await this._fetch(NEWS_URL);
    var oldNote = ctn.parentElement ? ctn.parentElement.querySelector('.news-cache-note') : null;

    if (html) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), html: html })); } catch (_) {}
      if (oldNote) oldNote.remove();
      self._renderNews(ctn, html);
    } else if (!cached) {
      ctn.innerHTML =
        '<div class="news-error"><span>暫時無法讀取，' +
        '<a href="' + NEWS_URL + '" target="_blank" style="color:var(--gold)">請點此前往官網</a>' +
        '</span></div>';
    } else if (oldNote) {
      oldNote.textContent = '（快取・' + new Date(cached.ts).toLocaleDateString('zh-TW') + '）';
    }
  };

  /* ══ _renderNews ════════════════════════════════════════════════ */
  app._renderNews = function (ctn, html) {
    var doc       = new DOMParser().parseFromString(html, 'text/html');
    var container = doc.querySelector('.list.news_list');
    if (!container) {
      if (!ctn.childElementCount) ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>';
      return;
    }
    var links = Array.from(container.querySelectorAll('a[href*="news_content"]'));
    var dates = Array.from(container.querySelectorAll('.publish_date'));
    if (!links.length) {
      if (!ctn.childElementCount) ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>';
      return;
    }
    ctn.innerHTML = '';
    links.forEach(function (link, i) {
      var title = link.textContent.trim();
      if (!title || title.length < 2) return;
      var rawDate = (dates[i + 1] ? dates[i + 1].textContent : '').trim();
      var dm      = rawDate.match(/^(\d{4})(\d{2})(\d{2})$/);
      var date    = dm ? dm[1] + '/' + dm[2] + '/' + dm[3] : rawDate;
      var href    = link.getAttribute('href') || '';
      if (!href.startsWith('http'))
        href = 'https://www.ffxiv.com.tw/' + (href.startsWith('/') ? href.slice(1) : href);
      var rowContainer = link.closest('li,tr,div');
      var isPinned     = !!(rowContainer && rowContainer.querySelector('.badge.top,span.top'));
      var a = document.createElement('a');
      a.className = 'news-item'; a.href = href; a.target = '_blank'; a.rel = 'noopener';
      if (isPinned) {
        var p = document.createElement('span'); p.className = 'news-pin';
        p.textContent = '置頂'; a.appendChild(p);
      }
      if (date) {
        var d = document.createElement('span'); d.className = 'news-date';
        d.textContent = date; a.appendChild(d);
      }
      var h = document.createElement('span'); h.className = 'news-headline';
      h.textContent = title; a.appendChild(h);
      ctn.appendChild(a);
    });
    if (!ctn.childElementCount) ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>';
  };

  /* ══ fetchFashion ═══════════════════════════════════════════════ */
  app.fetchFashion = async function () {
    var ctn      = document.getElementById('fashion-content');
    if (!ctn) return;
    var BASE      = 'https://forum.gamer.com.tw/C.php?bsn=17608&snA=20177';
    var CACHE_KEY = 'xiv_fashion_cache';
    var self      = this;

    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) {}
    if (cached && cached.posts && cached.posts.length) {
      self._renderFashionPosts(ctn, cached.posts);
      var existNote = ctn.parentElement && ctn.parentElement.querySelector('.news-cache-note');
      if (!existNote) {
        var note = document.createElement('div');
        note.className   = 'news-cache-note';
        note.textContent = '（快取・' + new Date(cached.ts).toLocaleDateString('zh-TW') + '，更新中⋯）';
        ctn.parentElement.insertBefore(note, ctn);
      }
    }

    /* 抓第 1 頁（巴哈無 page 參數預設第 1 頁），從 data-floor 推算總頁數 */
    var html0    = await this._fetch(BASE);
    var lastPage = 1;
    if (html0) {
      var doc0     = new DOMParser().parseFromString(html0, 'text/html');
      var floorEls = Array.from(doc0.querySelectorAll('a[data-floor]'));
      var floors   = floorEls.map(function (a) {
        return parseInt(a.getAttribute('data-floor')) || 0;
      }).filter(function (n) { return n > 0; });
      if (floors.length) lastPage = Math.ceil(Math.max.apply(null, floors) / 20);
    }

    /* 抓最後兩頁，避免重複請求（lastPage === 1 時直接重用 html0） */
    var pagesToFetch = Array.from(new Set([lastPage, Math.max(1, lastPage - 1)]));
    var allPosts     = [];
    for (var i = 0; i < pagesToFetch.length; i++) {
      var pg = pagesToFetch[i];
      /* lastPage === 1 時 html0 即是最後頁；> 1 時需另行抓取 */
      var h = (pg === lastPage && lastPage === 1 && html0)
              ? html0
              : await this._fetch(BASE + '&page=' + pg);
      if (h) allPosts = allPosts.concat(self._parseFashionClean(h));
    }

    /* 依樓層降序、去重 */
    allPosts.sort(function (a, b) { return b.floor - a.floor; });
    var seen = new Set();
    allPosts = allPosts.filter(function (p) {
      if (seen.has(p.floor)) return false;
      seen.add(p.floor); return true;
    });

    /* 優先作者置頂 */
    var PRIO       = ['chcooboo', 'rhythm'];
    var prioPosts  = allPosts.filter(function (p) {
      return PRIO.some(function (n) { return p.author.toLowerCase().includes(n); });
    });
    var otherPosts = allPosts.filter(function (p) {
      return !PRIO.some(function (n) { return p.author.toLowerCase().includes(n); });
    });
    var final = (prioPosts.length > 0 ? prioPosts : otherPosts).slice(0, 3);

    var oldNote = ctn.parentElement ? ctn.parentElement.querySelector('.news-cache-note') : null;

    if (!final.length) {
      if (!cached) ctn.innerHTML = '<div class="news-error"><span>未找到本週答案，請前往原文查看</span></div>';
      else if (oldNote) oldNote.textContent = '（快取・' + new Date(cached.ts).toLocaleDateString('zh-TW') + '）';
      return;
    }

    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), posts: final })); } catch (_) {}
    if (oldNote) oldNote.remove();
    self._renderFashionPosts(ctn, final);
  };

  /* ══ _parseFashionClean ═════════════════════════════════════════
   *
   * ★ 核心 Bug 修正 ★
   *
   * 舊版問題：將 .reply-content 列入移除對象
   *   → .reply-content 在巴哈論壇是「文章主體容器」
   *   → 移除後 content 幾乎為空，關鍵字比對永遠失敗
   *
   * 修正策略：
   *   1. 優先鎖定 .c-reply__content 或 .reply-content 作為提取目標
   *      （只取主體，天然排除 header/footer）
   *   2. 移除元素清單改為精確指定，不使用 [class*="..."] 萬用符
   *      （避免誤刪含關鍵字的內容區塊）
   *   3. .usericon（LV/GP 圖示）、.tippy-gpbp-list（投票）、
   *      .c-reply__footer、.c-reply__reaction、.c-reply__bottom
   *      仍正確移除
   *
   * ══════════════════════════════════════════════════════════════ */
  app._parseFashionClean = function (html) {
    var KW  = ['時尚品鑑簡單80分攻略', '金蝶時尚主題'];
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var posts = [];

    doc.querySelectorAll('a.username').forEach(function (userLink) {
      var author = userLink.textContent.trim();
      var href   = userLink.getAttribute('href') || '';
      var uidM   = href.match(/home\.gamer\.com\.tw\/([^/?#"']+)/);
      var uid    = uidM ? uidM[1] : '';

      /* closest('section, article') 與工作版一致 */
      var container = userLink.closest('section, article');
      if (!container) return;

      var floorEl = container.querySelector('a[data-floor]');
      var floor   = floorEl ? (parseInt(floorEl.getAttribute('data-floor')) || 0) : 0;

      /* ── 精確鎖定主體內容區塊 ──────────────────────────────────
       * 巴哈文章結構：
       *   article / section
       *     .c-reply__header  ← 作者列、樓層（不含內文）
       *     .c-reply__content
       *       .reply-content  ← ★ 這才是真正的文章主體
       *     .c-reply__footer / .c-reply__reaction  ← 按鈕、GP 等
       *
       * 直接取 .c-reply__content 或 .reply-content，
       * 避免 clone 整個 container 再逐一剔除帶來的誤刪風險
       * ────────────────────────────────────────────────────────── */
      var contentArea = container.querySelector('.c-reply__content, .reply-content');
      var clone       = (contentArea || container).cloneNode(true);

      /* 從 clone 中移除確定不含文章內容的元素（精確指定，不用萬用符） */
      clone.querySelectorAll([
        'a.username',
        'a.floor',
        'a.edittime',
        '.c-reply__header',
        '.c-reply__footer',
        '.c-reply__reaction',
        '.c-reply__bottom',
        '.usericon',           /* LV / GP 圖示 */
        '.tippy-gpbp-list',    /* 投票浮層 */
        'a.count',             /* 投票數連結 */
        '.buttonbar',
        '.edittime',
        'button',
        'form',
        'script',
        'style',
        'nav'
      ].join(',')).forEach(function (e) { e.remove(); });

      /* 保留換行語意 */
      clone.querySelectorAll('br').forEach(function (br) { br.replaceWith('\n'); });
      clone.querySelectorAll('p, div').forEach(function (el) {
        if (el.textContent.trim()) el.insertAdjacentText('afterend', '\n');
      });

      var content = clone.textContent.replace(/\n{3,}/g, '\n\n').trim();
      if (!content || content.length < 20) return;
      if (!KW.some(function (kw) { return content.includes(kw); })) return;

      posts.push({ author: author || '玩家分享', uid: uid, floor: floor, content: content.slice(0, 2000) });
    });

    return posts;
  };

  /* ══ _renderFashionPosts ════════════════════════════════════════ */
  app._renderFashionPosts = function (ctn, posts) {
    var PRIO = ['chcooboo', 'rhythm'];
    ctn.innerHTML = '';
    posts.forEach(function (p) {
      var isPrio = PRIO.some(function (n) { return p.author.toLowerCase().includes(n); });
      var div  = document.createElement('div');  div.className  = 'fashion-post';
      var hdr  = document.createElement('div');  hdr.className  = 'fashion-post-hdr';
      var auth = document.createElement('span');
      auth.className   = 'fashion-author' + (isPrio ? ' priority' : '');
      auth.textContent = p.author;
      var uid  = document.createElement('span'); uid.className  = 'fashion-uid';
      uid.textContent  = p.uid ? '（' + p.uid + '）' : '';
      hdr.appendChild(auth); hdr.appendChild(uid);
      var body = document.createElement('div'); body.className = 'fashion-body';
      body.textContent = p.content;
      div.appendChild(hdr); div.appendChild(body);
      ctn.appendChild(div);
    });
  };

})();
