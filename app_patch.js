/**
 * app_patch.js  v5
 *
 * 策略：完全不覆寫 app._fetch，所有網路請求都透過原版 this._fetch，
 * 確保本地與上傳後的行為與原版完全一致。
 * 只在外層加入 stale-while-revalidate 快取 + bug 修正 + 雜訊清理。
 */
(function () {

  /* ══ init ══════════════════════════════════════════════════════ */
  app.init = function () {
    this._navFF = []; this._ihFF = [];
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

  /* ══ nav ════════════════════════════════════════════════════════ */
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
    t.classList.add('active');
    var vp = document.getElementById('viewport');
    if (vp && vp.scrollTop) vp.scrollTop = 0;
    if (id === 'news'      && !this._nDone) { this._nDone = true; this.fetchNews(); }
    if (id === 'fashion'   && !this._fDone) { this._fDone = true; this.fetchFashion(); }
    if (id === 'submarine' && !this._sDone) { this._sDone = true; this.buildSub(); }
  };

  /* ══ fetchNews ══════════════════════════════════════════════════
   * 使用原版 this._fetch（不動），只加 stale-while-revalidate 快取。
   * 有快取 → 立刻顯示，同時背景更新。
   * 無快取 → 等待後顯示（與原版相同行為）。
   * ══════════════════════════════════════════════════════════════ */
  app.fetchNews = async function () {
    var ctn = document.getElementById('news-list');
    if (!ctn) return;
    var NEWS_URL  = 'https://www.ffxiv.com.tw/web/news/news_list.aspx';
    var CACHE_KEY = 'xiv_news_cache';
    var self      = this;

    /* 立刻顯示快取（若有） */
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) {}
    if (cached && cached.html) {
      self._renderNews(ctn, cached.html);
      var cacheNote = document.createElement('div');
      cacheNote.className   = 'news-cache-note';
      cacheNote.textContent = '（快取・' + new Date(cached.ts).toLocaleDateString('zh-TW') + '，更新中⋯）';
      ctn.parentElement.insertBefore(cacheNote, ctn);
    }

    /* 用原版 this._fetch 抓新資料 */
    var html = await this._fetch(NEWS_URL);

    /* 清除快取提示 */
    var oldNote = ctn.parentElement
      ? ctn.parentElement.querySelector('.news-cache-note') : null;

    if (html) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), html: html })); } catch (_) {}
      if (oldNote) oldNote.remove();
      self._renderNews(ctn, html);
    } else if (!cached) {
      /* 無快取且抓取失敗 */
      ctn.innerHTML =
        '<div class="news-error"><span>暫時無法讀取，' +
        '<a href="' + NEWS_URL + '" target="_blank" style="color:var(--gold)">請點此前往官網</a>' +
        '</span></div>';
    } else if (oldNote) {
      /* 抓取失敗但有快取，更新提示文字 */
      oldNote.textContent = '（快取・' + new Date(cached.ts).toLocaleDateString('zh-TW') + '）';
    }
  };

  /* ══ _renderNews ════════════════════════════════════════════════ */
  app._renderNews = function (ctn, html) {
    var doc       = new DOMParser().parseFromString(html, 'text/html');
    var container = doc.querySelector('.list.news_list');
    if (!container) {
      if (!ctn.childElementCount)
        ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>';
      return;
    }
    var links = Array.from(container.querySelectorAll('a[href*="news_content"]'));
    var dates = Array.from(container.querySelectorAll('.publish_date'));
    if (!links.length) {
      if (!ctn.childElementCount)
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
    if (!ctn.childElementCount)
      ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>';
  };

  /* ══ fetchFashion ═══════════════════════════════════════════════
   * 修正兩個原版 bug：
   *   1. 頁碼 selector 改為 .BH-pagebtnA a[href*="page="]（Bahamut 專用）
   *   2. 最後一頁另外抓，不重用 html0（html0 是第 1 頁，不是最後一頁）
   * 加入 stale-while-revalidate 快取。
   * ══════════════════════════════════════════════════════════════ */
  app.fetchFashion = async function () {
    var ctn = document.getElementById('fashion-content');
    if (!ctn) return;
    var BASE      = 'https://forum.gamer.com.tw/C.php?bsn=17608&snA=20177';
    var CACHE_KEY = 'xiv_fashion_cache';
    var self      = this;

    /* 立刻顯示快取（若有） */
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) {}
    if (cached && cached.posts && cached.posts.length) {
      self._renderFashionPosts(ctn, cached.posts);
      var cacheNote = document.createElement('div');
      cacheNote.className   = 'news-cache-note';
      cacheNote.textContent = '（快取・' + new Date(cached.ts).toLocaleDateString('zh-TW') + '，更新中⋯）';
      ctn.parentElement.insertBefore(cacheNote, ctn);
    }

    /* Step 1：抓第 1 頁，取得總頁數 */
    var html0 = await this._fetch(BASE);
    if (!html0) {
      if (!cached)
        ctn.innerHTML = '<div class="news-error"><span>未找到本週答案，請前往原文查看</span></div>';
      return;
    }

    /* Step 2：用 Bahamut 專用 selector 取得最後一頁頁碼 */
    var doc0     = new DOMParser().parseFromString(html0, 'text/html');
    var pageNums = Array.from(doc0.querySelectorAll('.BH-pagebtnA a[href*="page="]'))
      .map(function (a) {
        var m = (a.getAttribute('href') || '').match(/page=(\d+)/);
        return m ? parseInt(m[1]) : 0;
      })
      .filter(function (n) { return n > 0; });
    var lastPage = pageNums.length ? Math.max.apply(null, pageNums) : 1;

    /* Step 3：另外抓最後一頁（不重用 html0，html0 是第 1 頁） */
    var htmlLast = (lastPage === 1)
      ? html0
      : await this._fetch(BASE + '&page=' + lastPage);

    if (!htmlLast) {
      if (!cached)
        ctn.innerHTML = '<div class="news-error"><span>未找到本週答案，請前往原文查看</span></div>';
      return;
    }

    /* Step 4：用乾淨解析器（排除 LV/GP/子回覆） */
    var posts = self._parseFashionClean(htmlLast);
    posts.sort(function (a, b) { return b.floor - a.floor; });
    var seen = new Set();
    posts = posts.filter(function (p) {
      if (seen.has(p.floor)) return false;
      seen.add(p.floor); return true;
    });

    /* Step 5：PRIO 作者優先，找到則只顯示他們 */
    var PRIO       = ['chcooboo', 'rhythm'];
    var prioPosts  = posts.filter(function (p) {
      return PRIO.some(function (n) { return p.author.toLowerCase().includes(n); });
    });
    var otherPosts = posts.filter(function (p) {
      return !PRIO.some(function (n) { return p.author.toLowerCase().includes(n); });
    });
    var final = (prioPosts.length > 0 ? prioPosts : otherPosts).slice(0, 3);

    var oldNote = ctn.parentElement
      ? ctn.parentElement.querySelector('.news-cache-note') : null;

    if (!final.length) {
      if (!cached)
        ctn.innerHTML = '<div class="news-error"><span>未找到本週答案，請前往原文查看</span></div>';
      else if (oldNote)
        oldNote.textContent = '（快取・' + new Date(cached.ts).toLocaleDateString('zh-TW') + '）';
      return;
    }

    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), posts: final })); } catch (_) {}
    if (oldNote) oldNote.remove();
    self._renderFashionPosts(ctn, final);
  };

  /* ══ _parseFashionClean ═════════════════════════════════════════
   * 與原版 _parseFashion 邏輯相同，額外移除：
   *   .usericon（LV/GP）、.reply-content（子回覆）、a.count（投票數）等
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

      /* 原版相同：往上找含有 a[data-floor] 的祖先容器 */
      var container = userLink.parentElement;
      var depth     = 0;
      while (container && depth < 10) {
        if (container.querySelector('a[data-floor]')) break;
        container = container.parentElement; depth++;
      }
      if (!container || depth >= 10) return;

      var floorEl = container.querySelector('a[data-floor]');
      var floor   = floorEl ? (parseInt(floorEl.getAttribute('data-floor')) || 0) : 0;

      /* Clone 並清除（原版基礎上新增移除 LV/GP/子回覆/投票） */
      var clone = container.cloneNode(true);
      clone.querySelectorAll(
        'a.username, a.floor, a.edittime,' +
        '.c-reply__header, [class*="header"], [class*="nav"], [class*="tool"],' +
        'button, form, script, style, nav,' +
        '.usericon, .reply-content, a.count, .tippy-gpbp-list, .edittime, .buttonbar'
      ).forEach(function (e) { e.remove(); });

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
