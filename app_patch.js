/**
 * app_patch.js  v12
 *
 * 修正：
 *  1. lastPage 改從分頁連結 a[href*="page="] 取最大值
 *     （原本用 data-floor 計算，第 1 頁只有 floor 1-20 所以算出 1，pages 為空）
 *  2. F5 保留分頁：init 改為還原 sessionStorage 記錄的最後分頁
 *  3. nav 切換時寫入 sessionStorage
 *  4. 無快取，每次直接抓取
 */
(function () {

  console.log('[XIV Patch] v12 loaded');

  /* ══ _fetch ══════════════════════════════════════════════════════ */
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
        if (!r.ok) { console.warn('[XIV] proxy', i, 'status', r.status); continue; }
        var tx = await r.text();
        try { var j = JSON.parse(tx); if (j.contents && j.contents.length > 200) return j.contents; } catch (_) {}
        if (tx.length > 200) return tx;
      } catch (e) { console.warn('[XIV] proxy', i, 'error:', e.message); continue; }
    }
    console.error('[XIV] all proxies failed for', url);
    return null;
  };

  /* ══ init ══════════════════════════════════════════════════════════ */
  app.init = function () {
    if (this._initDone) return;
    this._initDone = true;
    this._navFF = []; this._ihFF = [];
    this._recentViewed = JSON.parse(localStorage.getItem('xiv_rv') || '[]');
    this.initStars();
    this.initNavFF();
    this._startFFLoop();
    this._initIH();

    /* 還原上次分頁，否則預設 home */
    var lastNav = sessionStorage.getItem('xiv_nav') || 'home';
    this.nav(lastNav);

    window.addEventListener('resize', function () { app.initStars(); });
    document.querySelectorAll('.nav-item[data-nav]').forEach(function (el) {
      el.addEventListener('click', function () { app.nav(el.dataset.nav); });
    });
  };

  /* ══ nav ════════════════════════════════════════════════════════════ */
  app.nav = function (id) {
    /* 記住當前分頁 */
    try { sessionStorage.setItem('xiv_nav', id); } catch (_) {}

    document.querySelectorAll('.scene').forEach(function (s) {
      s.classList.remove('active');
      s.style.display = '';
    });
    document.querySelectorAll('.nav-item[data-nav]').forEach(function (n) {
      n.classList.toggle('active', n.dataset.nav === id);
    });
    var t = document.getElementById(id);
    if (!t) return;
    requestAnimationFrame(function () { t.classList.add('active'); });
    var vp = document.getElementById('viewport');
    if (vp && vp.scrollTop) vp.scrollTop = 0;

    if (id === 'news') {
      var nCtn = document.getElementById('news-list');
      if (!this._nDone || (nCtn && nCtn.querySelector('.news-error'))) {
        this._nDone = true; this.fetchNews();
      }
    }
    if (id === 'fashion') {
      var fCtn = document.getElementById('fashion-content');
      var fHasErr = fCtn && fCtn.querySelector('.news-error');
      if (!this._fDone || fHasErr) {
        if (fHasErr) fCtn.innerHTML = '<div class="news-loading"><span class="news-loading-icon">✿</span><span>重新讀取中⋯</span></div>';
        this._fDone = true;
        this.fetchFashion();
      }
    }
    if (id === 'submarine' && !this._sDone) { this._sDone = true; this.buildSub(); }
  };

  app._retryFashion = function () { this._fDone = false; this.nav('fashion'); };

  /* ══ fetchNews（無快取）══════════════════════════════════════════ */
  app.fetchNews = async function () {
    var ctn     = document.getElementById('news-list');
    if (!ctn) return;
    var NEWS_URL = 'https://www.ffxiv.com.tw/web/news/news_list.aspx';
    var self     = this;

    var html = await this._fetch(NEWS_URL);
    if (html) {
      self._renderNews(ctn, html);
    } else {
      ctn.innerHTML =
        '<div class="news-error"><span>暫時無法讀取，' +
        '<a href="' + NEWS_URL + '" target="_blank" style="color:var(--gold)">請點此前往官網</a>' +
        '</span></div>';
    }
  };

  /* ══ _renderNews ════════════════════════════════════════════════════ */
  app._renderNews = function (ctn, html) {
    var doc       = new DOMParser().parseFromString(html, 'text/html');
    var container = doc.querySelector('.list.news_list');
    if (!container) {
      ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>';
      return;
    }
    var links = Array.from(container.querySelectorAll('a[href*="news_content"]'));
    var dates = Array.from(container.querySelectorAll('.publish_date'));
    if (!links.length) {
      ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>';
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
        var p = document.createElement('span'); p.className = 'news-pin'; p.textContent = '置頂'; a.appendChild(p);
      }
      if (date) {
        var d = document.createElement('span'); d.className = 'news-date'; d.textContent = date; a.appendChild(d);
      }
      var h = document.createElement('span'); h.className = 'news-headline'; h.textContent = title; a.appendChild(h);
      ctn.appendChild(a);
    });
    if (!ctn.childElementCount)
      ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>';
  };

  /* ══ fetchFashion（無快取）══════════════════════════════════════════ */
  app.fetchFashion = async function () {
    var ctn  = document.getElementById('fashion-content');
    if (!ctn) return;
    var BASE = 'https://forum.gamer.com.tw/C.php?bsn=17608&snA=20177';
    var self = this;

    console.log('[XIV Fashion] fetchFashion start');

    /* ── 抓第 1 頁取得分頁資訊，推算最後頁 ── */
    var html1    = await this._fetch(BASE);
    var lastPage = 1;
    if (html1) {
      var doc1 = new DOMParser().parseFromString(html1, 'text/html');

      /* ★ 修正：從分頁連結取最大頁碼，不用 data-floor ★
       * 頁面上的 a[href*="page="] 包含所有可見頁碼連結，
       * 取最大值即為最後頁（巴哈分頁列一定顯示最後頁）      */
      var pageLinks = Array.from(doc1.querySelectorAll('a[href*="page="]'));
      var pageNums  = pageLinks.map(function (a) {
        var m = (a.getAttribute('href') || '').match(/[?&]page=(\d+)/);
        return m ? parseInt(m[1]) : 0;
      }).filter(function (n) { return n > 0; });

      if (pageNums.length) {
        lastPage = Math.max.apply(null, pageNums);
      }
      console.log('[XIV Fashion] lastPage:', lastPage, '  pageNums found:', pageNums.length);
    } else {
      ctn.innerHTML =
        '<div class="news-error"><span>無法連線，' +
        '<button class="fashion-retry-btn" onclick="app._retryFashion()">重新讀取</button>' +
        '　或　<a href="' + BASE + '" target="_blank" style="color:var(--gold)">前往原文查看</a>' +
        '</span></div>';
      return;
    }

    /* ── 只抓最後 3 頁（不含第 1 頁）── */
    var pages = [];
    for (var p = lastPage; p >= Math.max(2, lastPage - 2); p--) pages.push(p);
    console.log('[XIV Fashion] pages to fetch:', pages);

    var allPosts = [];
    for (var i = 0; i < pages.length; i++) {
      var pg = pages[i];
      var h  = (pg === lastPage) ? html1 : await this._fetch(BASE + '&page=' + pg);
      if (h) {
        var parsed = self._parseFashionClean(h, pg);
        console.log('[XIV Fashion] page', pg, '→', parsed.length, 'posts with keyword');
        allPosts = allPosts.concat(parsed);
      }
    }

    /* ── 排序、去重 ── */
    allPosts.sort(function (a, b) { return b.floor - a.floor; });
    var seen = new Set();
    allPosts = allPosts.filter(function (p) {
      if (seen.has(p.floor)) return false; seen.add(p.floor); return true;
    });

    /* ── PRIO 作者優先 ── */
    var PRIO      = ['chcooboo', 'rhythm'];
    var prioPosts = allPosts.filter(function (p) {
      return PRIO.some(function (n) { return p.author.toLowerCase().includes(n); });
    });
    var othPosts  = allPosts.filter(function (p) {
      return !PRIO.some(function (n) { return p.author.toLowerCase().includes(n); });
    });
    var final = (prioPosts.length > 0 ? prioPosts : othPosts).slice(0, 3);
    console.log('[XIV Fashion] final:', final.map(function (p) { return p.author + ' floor' + p.floor; }));

    if (!final.length) {
      ctn.innerHTML =
        '<div class="news-error"><span>未找到本週答案，' +
        '<button class="fashion-retry-btn" onclick="app._retryFashion()">重新讀取</button>' +
        '　或　<a href="' + BASE + '" target="_blank" style="color:var(--gold)">前往原文查看</a>' +
        '</span></div>';
      return;
    }

    self._renderFashionPosts(ctn, final);
  };

  /* ══ _parseFashionClean ══════════════════════════════════════════════
   * 主文在 .c-article__content，不是 .reply-content（那是 B1/B2/B3 留言）
   * ════════════════════════════════════════════════════════════════ */
  app._parseFashionClean = function (html, pageHint) {
    var KW  = ['時尚品鑑簡單80分攻略', '金蝶時尚主題'];
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var posts = [];

    var userLinks = doc.querySelectorAll('a.username');
    console.log('[XIV Fashion] page', pageHint, '  a.username:', userLinks.length);

    userLinks.forEach(function (userLink) {
      var author = userLink.textContent.trim();
      var href   = userLink.getAttribute('href') || '';
      var uidM   = href.match(/home\.gamer\.com\.tw\/([^/?#"']+)/);
      var uid    = uidM ? uidM[1] : '';

      var container = userLink.closest('section');
      if (!container) return;

      var floorEl   = container.querySelector('a[data-floor]');
      var floor     = floorEl ? (parseInt(floorEl.getAttribute('data-floor')) || 0) : 0;

      /* 主文內容在 .c-article__content */
      var contentEl = container.querySelector('.c-article__content');
      if (!contentEl) return;

      var content = contentEl.textContent.replace(/\n{3,}/g, '\n\n').trim();
      var hasKW   = KW.some(function (kw) { return content.includes(kw); });

      console.log('[XIV Fashion]  floor', floor, author,
        '  len:', content.length, '  kw:', hasKW,
        '  preview:', content.slice(0, 60).replace(/\n/g, '↵'));

      if (!content || content.length < 20 || !hasKW) return;

      posts.push({ author: author || '玩家分享', uid: uid, floor: floor, content: content.slice(0, 2000) });
    });

    return posts;
  };

  /* ══ _renderFashionPosts ════════════════════════════════════════════ */
  app._renderFashionPosts = function (ctn, posts) {
    var PRIO = ['chcooboo', 'rhythm'];
    ctn.innerHTML = '';
    posts.forEach(function (p) {
      var isPrio = PRIO.some(function (n) { return p.author.toLowerCase().includes(n); });
      var div  = document.createElement('div'); div.className = 'fashion-post';
      var hdr  = document.createElement('div'); hdr.className = 'fashion-post-hdr';
      var auth = document.createElement('span');
      auth.className   = 'fashion-author' + (isPrio ? ' priority' : '');
      auth.textContent = p.author;
      var uid  = document.createElement('span'); uid.className = 'fashion-uid';
      uid.textContent  = p.uid ? '（' + p.uid + '）' : '';
      hdr.appendChild(auth); hdr.appendChild(uid);
      var body = document.createElement('div'); body.className = 'fashion-body';
      body.textContent = p.content;
      div.appendChild(hdr); div.appendChild(body);
      ctn.appendChild(div);
    });
  };

})();
