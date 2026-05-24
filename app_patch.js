/**
 * app_patch.js  v8
 *
 * 修正清單：
 *  1. _parseFashionClean：回歸舊 _parseFashion 的工作邏輯（verbatim），
 *     只額外移除確定不含文字的 UI 元素（.usericon / .tippy-gpbp-list 等）
 *     → 這是最保守也最安全的做法，不動任何可能含內文的容器
 *  2. fetchFashion：
 *     - 重試時立即顯示 loading 狀態（不再空白閃爍）
 *     - 失敗時顯示「重新讀取」按鈕
 *     - 多抓一頁（最後 3 頁）以防錯過答案
 *  3. nav：當 fashion 目前顯示 .news-error 時允許重新抓取（修正 _fDone 鎖死問題）
 *  4. _retryFashion：供重試按鈕呼叫的公開方法
 *  5. _fetch：corsproxy.io → codetabs → allorigins 三段降級
 *  6. init：補回 _recentViewed（原 script.js 有，patch 覆寫 init 時遺漏）
 */
(function () {

  /* ══ _fetch：三段 proxy 降級 ══════════════════════════════════════ */
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
        try { var j = JSON.parse(tx); if (j.contents && j.contents.length > 200) return j.contents; } catch (_) {}
        if (tx.length > 200) return tx;
      } catch (_) { continue; }
    }
    return null;
  };

  /* ══ init ══════════════════════════════════════════════════════════ */
  app.init = function () {
    this._navFF = []; this._ihFF = [];
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

  /* ══ nav ════════════════════════════════════════════════════════════
   * 修正：當 fashion/news 的內容區目前顯示 .news-error 時，
   * 允許重新抓取（重置 _fDone / _nDone），修正 _fDone 鎖死問題
   * ════════════════════════════════════════════════════════════════ */
  app.nav = function (id) {
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
      var nHasErr = nCtn && nCtn.querySelector('.news-error');
      if (!this._nDone || nHasErr) { this._nDone = true; this.fetchNews(); }
    }
    if (id === 'fashion') {
      var fCtn = document.getElementById('fashion-content');
      var fHasErr = fCtn && fCtn.querySelector('.news-error');
      /* 如果目前顯示錯誤，先還原 loading 狀態再重抓 */
      if (!this._fDone || fHasErr) {
        if (fHasErr) {
          fCtn.innerHTML = '<div class="news-loading"><span class="news-loading-icon">✿</span><span>重新讀取中⋯</span></div>';
        }
        this._fDone = true;
        this.fetchFashion();
      }
    }
    if (id === 'submarine' && !this._sDone) { this._sDone = true; this.buildSub(); }
  };

  /* ══ _retryFashion：供重試按鈕呼叫 ════════════════════════════════ */
  app._retryFashion = function () {
    this._fDone = false;
    this.nav('fashion');
  };

  /* ══ fetchNews（stale-while-revalidate）══════════════════════════ */
  app.fetchNews = async function () {
    var ctn      = document.getElementById('news-list');
    if (!ctn) return;
    var NEWS_URL  = 'https://www.ffxiv.com.tw/web/news/news_list.aspx';
    var CACHE_KEY = 'xiv_news_cache';
    var self      = this;

    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) {}
    if (cached && cached.html) {
      self._renderNews(ctn, cached.html);
      if (!ctn.parentElement.querySelector('.news-cache-note')) {
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

  /* ══ fetchFashion ════════════════════════════════════════════════ */
  app.fetchFashion = async function () {
    var ctn      = document.getElementById('fashion-content');
    if (!ctn) return;
    var BASE      = 'https://forum.gamer.com.tw/C.php?bsn=17608&snA=20177';
    var CACHE_KEY = 'xiv_fashion_cache';
    var self      = this;

    /* 快取：立即顯示，同時背景刷新 */
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) {}
    if (cached && cached.posts && cached.posts.length) {
      self._renderFashionPosts(ctn, cached.posts);
      if (!ctn.parentElement.querySelector('.news-cache-note')) {
        var note = document.createElement('div');
        note.className   = 'news-cache-note';
        note.textContent = '（快取・' + new Date(cached.ts).toLocaleDateString('zh-TW') + '，更新中⋯）';
        ctn.parentElement.insertBefore(note, ctn);
      }
    }

    /* 抓第 1 頁，用 a[data-floor] 推算總頁數 */
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

    /* 抓最後 3 頁（多一頁保險），去重 */
    var pageSet = new Set([lastPage, Math.max(1, lastPage - 1), Math.max(1, lastPage - 2)]);
    var allPosts = [];
    for (var pg of pageSet) {
      /* 只在單頁串時重用 html0，多頁串一律另行抓取 */
      var h = (pg === lastPage && lastPage === 1 && html0)
              ? html0
              : await this._fetch(BASE + '&page=' + pg);
      if (h) allPosts = allPosts.concat(self._parseFashionClean(h));
    }

    /* 排序、去重 */
    allPosts.sort(function (a, b) { return b.floor - a.floor; });
    var seen = new Set();
    allPosts = allPosts.filter(function (p) {
      if (seen.has(p.floor)) return false;
      seen.add(p.floor); return true;
    });

    /* PRIO 作者優先 */
    var PRIO      = ['chcooboo', 'rhythm'];
    var prioPosts = allPosts.filter(function (p) {
      return PRIO.some(function (n) { return p.author.toLowerCase().includes(n); });
    });
    var othPosts  = allPosts.filter(function (p) {
      return !PRIO.some(function (n) { return p.author.toLowerCase().includes(n); });
    });
    var final = (prioPosts.length > 0 ? prioPosts : othPosts).slice(0, 3);

    var oldNote = ctn.parentElement ? ctn.parentElement.querySelector('.news-cache-note') : null;

    if (!final.length) {
      if (!cached || !cached.posts || !cached.posts.length) {
        /* 沒有任何資料可顯示：顯示錯誤 + 重試按鈕 */
        ctn.innerHTML =
          '<div class="news-error">' +
          '<span>未找到本週答案，' +
          '<button class="fashion-retry-btn" onclick="app._retryFashion()">重新讀取</button>' +
          '　或　' +
          '<a href="' + BASE + '" target="_blank" style="color:var(--gold)">前往原文查看</a>' +
          '</span></div>';
      } else if (oldNote) {
        /* 有快取但新抓無結果：保留快取顯示，更新 note */
        oldNote.textContent = '（快取・' + new Date(cached.ts).toLocaleDateString('zh-TW') + '）';
      }
      return;
    }

    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), posts: final })); } catch (_) {}
    if (oldNote) oldNote.remove();
    self._renderFashionPosts(ctn, final);
  };

  /* ══ _parseFashionClean ══════════════════════════════════════════
   *
   * ★ 關鍵決策 ★
   *
   * 核心移除邏輯回歸舊版 _parseFashion（已確認能成功抓取），
   * 邏輯完全不動，只在後面追加額外的 UI 雜訊清除：
   *   .usericon       → LV / GP 等級圖示
   *   .tippy-gpbp-list → 投票浮層
   *   a.count         → 投票數連結
   *   .buttonbar      → 回應列
   *
   * 這些元素確定不含文章內文，安全移除。
   * .reply-content「不再列入移除」，它是主體內容容器。
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

      /* ── closest('section, article')：與舊工作版 _parseFashion 完全相同 ── */
      var container = userLink.closest('section, article');
      if (!container) return;

      var floorEl = container.querySelector('a[data-floor]');
      var floor   = floorEl ? (parseInt(floorEl.getAttribute('data-floor')) || 0) : 0;

      var clone = container.cloneNode(true);

      /* ── 主要移除：與舊工作版 _parseFashion 完全相同 ── */
      clone.querySelectorAll(
        'a.username, a.floor, a.edittime, .c-reply__header,' +
        '[class*="header"], [class*="nav"], [class*="tool"],' +
        'button, form, script, style, nav'
      ).forEach(function (e) { e.remove(); });

      /* ── 額外 UI 雜訊移除（確定不含內文，安全追加）── */
      clone.querySelectorAll(
        '.usericon, .tippy-gpbp-list, a.count, .buttonbar'
      ).forEach(function (e) { e.remove(); });

      /* ── 換行保留：與舊工作版 _parseFashion 完全相同 ── */
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
