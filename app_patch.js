/**
 * app_patch.js  v15
 *
 * 修正：
 *  1. F5 閃爍：body 於 HTML 加上 visibility:hidden，JS init 後移除
 *              (改由 HTML <body style="visibility:hidden"> 在第一繪製前生效)
 *  2. 時尚圖片：_parseFashionClean 同時收集圖片 URL（data-src / src）
 *              _renderFashionPosts 交錯渲染文字段落與圖片
 */
(function () {

  console.log('[XIV Patch] v15 loaded');

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
    /* 修正：localStorage 存取可能在私密模式拋出 SecurityError */
    try { this._recentViewed = JSON.parse(localStorage.getItem('xiv_rv') || '[]'); }
    catch (_) { this._recentViewed = []; }
    this.initStars();
    this.initNavFF();
    this._startFFLoop();
    this._initIH();

    /* 切換到上次所在分頁 */
    var lastNav = 'home';
    try { lastNav = sessionStorage.getItem('xiv_nav') || 'home'; } catch (_) {}
    this.nav(lastNav);

    var _rsT;
    window.addEventListener('resize', function () {
      clearTimeout(_rsT);
      _rsT = setTimeout(function () { app.initStars(); }, 200);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        cancelAnimationFrame(app._sid);
      } else {
        app.initStars();
      }
    });
    document.querySelectorAll('.nav-item[data-nav]').forEach(function (el) {
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', el.querySelector('.cn') ? el.querySelector('.cn').textContent : el.dataset.nav);
      el.addEventListener('click', function () { app.nav(el.dataset.nav); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); app.nav(el.dataset.nav); }
      });
    });
  };

  /* ══ nav ════════════════════════════════════════════════════════════ */
  app.nav = function (id) {
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

  /* ══ fetchNews ══════════════════════════════════════════════════════ */
  app.fetchNews = async function () {
    var ctn     = document.getElementById('news-list');
    if (!ctn) return;
    var NEWS_URL = 'https://www.ffxiv.com.tw/web/news/news_list.aspx';
    var self     = this;
    console.log('[XIV News] fetchNews start');

    var html = await this._fetch(NEWS_URL);
    console.log('[XIV News] result:', html ? html.length + ' chars' : 'null');
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
    if (!container) { ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>'; return; }
    var links = Array.from(container.querySelectorAll('a[href*="news_content"]'));
    var dates = Array.from(container.querySelectorAll('.publish_date'));
    if (!links.length) { ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>'; return; }
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
      a.className = 'news-item'; a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      if (isPinned) { var p = document.createElement('span'); p.className = 'news-pin'; p.textContent = '置頂'; a.appendChild(p); }
      if (date)     { var d = document.createElement('span'); d.className = 'news-date'; d.textContent = date; a.appendChild(d); }
      var h = document.createElement('span'); h.className = 'news-headline'; h.textContent = title; a.appendChild(h);
      ctn.appendChild(a);
    });
    if (!ctn.childElementCount) ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>';
  };

  /* ══ fetchFashion ════════════════════════════════════════════════════ */
  app.fetchFashion = async function () {
    var ctn  = document.getElementById('fashion-content');
    if (!ctn) return;
    var BASE = 'https://forum.gamer.com.tw/C.php?bsn=17608&snA=20177';
    var self = this;
    console.log('[XIV Fashion] start');

    /* 抓第 1 頁只取頁碼資訊 */
    var html1    = await this._fetch(BASE);
    var lastPage = 1;
    if (html1) {
      var doc1     = new DOMParser().parseFromString(html1, 'text/html');
      var pageNums = Array.from(doc1.querySelectorAll('a[href*="page="]'))
        .map(function (a) { var m = (a.getAttribute('href') || '').match(/[?&]page=(\d+)/); return m ? parseInt(m[1]) : 0; })
        .filter(function (n) { return n > 0; });
      if (pageNums.length) lastPage = Math.max.apply(null, pageNums);
      console.log('[XIV Fashion] lastPage:', lastPage);
    } else {
      ctn.innerHTML = '<div class="news-error"><span>無法連線，<button class="fashion-retry-btn" onclick="app._retryFashion()">重新讀取</button>　或　<a href="' + BASE + '" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">前往原文查看</a></span></div>';
      return;
    }

    /* 抓最後 2 頁（若只有 1 頁就只抓 1 頁），每頁明確請求 */
    var pages = [];
    for (var p = lastPage; p >= Math.max(1, lastPage - 1); p--) pages.push(p);
    console.log('[XIV Fashion] pages:', pages);

    var allPosts = [];
    for (var i = 0; i < pages.length; i++) {
      var h = await this._fetch(BASE + '&page=' + pages[i]);
      if (h) {
        var parsed = self._parseFashionClean(h, pages[i]);
        console.log('[XIV Fashion] page', pages[i], '→', parsed.length, 'posts');
        allPosts = allPosts.concat(parsed);
      }
    }

    /* 降序排列、去重 */
    allPosts.sort(function (a, b) { return b.floor - a.floor; });
    var seen = new Set();
    allPosts = allPosts.filter(function (p) { if (seen.has(p.floor)) return false; seen.add(p.floor); return true; });

    /* PRIO 作者優先，取最新 3 筆 */
    var PRIO      = ['chcooboo', 'rhythm'];
    var prioPosts = allPosts.filter(function (p) { return PRIO.some(function (n) { return p.author.toLowerCase().includes(n); }); });
    var othPosts  = allPosts.filter(function (p) { return !PRIO.some(function (n) { return p.author.toLowerCase().includes(n); }); });
    var final     = (prioPosts.length > 0 ? prioPosts : othPosts).slice(0, 3);
    console.log('[XIV Fashion] final:', final.map(function (p) { return p.author + ' floor' + p.floor; }));

    if (!final.length) {
      ctn.innerHTML = '<div class="news-error"><span>未找到本週答案，<button class="fashion-retry-btn" onclick="app._retryFashion()">重新讀取</button>　或　<a href="' + BASE + '" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">前往原文查看</a></span></div>';
      return;
    }
    self._renderFashionPosts(ctn, final);
  };

  /* ══ _parseFashionClean ══════════════════════════════════════════════
   * 同時收集文字段落與圖片，回傳 segments 陣列：
   *   { type: 'text', value: '...' }
   *   { type: 'img',  src: 'https://...' }
   * ════════════════════════════════════════════════════════════════ */
  app._parseFashionClean = function (html, pageHint) {
    var KW  = ['時尚品鑑簡單80分攻略', '金蝶時尚主題'];
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var posts = [];

    doc.querySelectorAll('a.username').forEach(function (userLink) {
      var author = userLink.textContent.trim();
      var href   = userLink.getAttribute('href') || '';
      var uidM   = href.match(/home\.gamer\.com\.tw\/([^/?#"']+)/);
      var uid    = uidM ? uidM[1] : '';

      var container = userLink.closest('section');
      if (!container) return;

      var floorEl = container.querySelector('a[data-floor]');
      var floor   = floorEl ? (parseInt(floorEl.getAttribute('data-floor')) || 0) : 0;

      var contentEl = container.querySelector('.c-article__content');
      if (!contentEl) return;

      /* 檢查是否含關鍵字（用純文字判斷） */
      var rawText = contentEl.textContent || '';
      if (!rawText.trim() || rawText.length < 20) return;
      if (!KW.some(function (kw) { return rawText.includes(kw); })) return;

      /* 建立 segments：遍歷子節點，交錯收集文字與圖片 */
      var segments = [];
      var textBuf  = '';

      function flushText() {
        var t = textBuf.replace(/\n{3,}/g, '\n\n').trim();
        if (t) segments.push({ type: 'text', value: t });
        textBuf = '';
      }

      function walk(node) {
        if (node.nodeType === 3) {        /* 文字節點 */
          textBuf += node.nodeValue;
          return;
        }
        if (node.nodeType !== 1) return;  /* 略過非元素 */
        var tag = node.tagName.toUpperCase();

        if (tag === 'BR') { textBuf += '\n'; return; }
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME') return;

        if (tag === 'IMG') {
          flushText();
          /* 優先 data-src（lazy load），否則 src */
          var src = node.getAttribute('data-src') || node.getAttribute('src') || '';
          /* 過濾掉表情符號小圖（bahamut editor/emotion） */
          if (src && !src.includes('/editor/emotion/') && !src.includes('bahamut.com.tw/forum/icons')) {
            segments.push({ type: 'img', src: src });
          }
          return;
        }

        /* 區塊元素前後補換行 */
        var isBlock = /^(DIV|P|H[1-6]|SECTION|ARTICLE|HEADER|FOOTER|LI|TR|TD|TH)$/.test(tag);
        if (isBlock) textBuf += '\n';
        node.childNodes.forEach(walk);
        if (isBlock) textBuf += '\n';
      }

      contentEl.cloneNode(true).childNodes.forEach(walk);
      flushText();

      posts.push({ author: author || '玩家分享', uid: uid, floor: floor, segments: segments });
    });

    return posts;
  };

  /* ══ _renderFashionPosts ════════════════════════════════════════════
   * 交錯渲染文字段落與圖片；文字中偵測到的 URL 自動轉為超連結
   * ════════════════════════════════════════════════════════════════ */

  /* 將文字中的 URL 轉為 <a> 節點，其餘保持純文字節點 */
  function linkify(container, text) {
    var urlRE  = /https?:\/\/[^\s\n<>"()[\]]+/g;
    var last   = 0;
    var match;
    while ((match = urlRE.exec(text)) !== null) {
      if (match.index > last)
        container.appendChild(document.createTextNode(text.slice(last, match.index)));
      var a    = document.createElement('a');
      var cleanUrl = match[0].replace(/[。，、！？.,;:!?\)\]]+$/, '');
      a.href   = cleanUrl;
      /* 縮短顯示文字：超過 60 字元時截斷加省略 */
      a.textContent = cleanUrl.length > 60 ? cleanUrl.slice(0, 60) + '…' : cleanUrl;
      a.title  = cleanUrl;
      a.target = '_blank';
      a.rel    = 'noopener noreferrer';
      a.className = 'fashion-link';
      container.appendChild(a);
      last = match.index + match[0].length - (match[0].length - cleanUrl.length);
    }
    if (last < text.length)
      container.appendChild(document.createTextNode(text.slice(last)));
  }

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
      div.appendChild(hdr);

      /* 依 segments 依序渲染 */
      (p.segments || []).forEach(function (seg) {
        if (seg.type === 'text') {
          var body = document.createElement('div');
          body.className = 'fashion-body';
          linkify(body, seg.value);   /* URL 自動轉超連結 */
          div.appendChild(body);
        } else if (seg.type === 'img') {
          var img = document.createElement('img');
          img.className   = 'fashion-img';
          img.src         = seg.src;
          img.alt         = '';
          img.loading     = 'lazy';
          img.onerror     = function () { this.style.display = 'none'; };
          div.appendChild(img);
        }
      });

      ctn.appendChild(div);
    });
  };

  /* ══ 啟動入口 ══════════════════════════════════════════════════════
   * script.js 已移除 window.onload，統一在此觸發 init()
   * ════════════════════════════════════════════════════════════════ */
  window.addEventListener('load', function () { app.init(); });

})();
