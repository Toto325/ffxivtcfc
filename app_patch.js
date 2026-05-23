/**
 * app_patch.js  v2
 * 修正：
 *  1. init() — 移除 _recentViewed 死代碼，改用 addEventListener
 *  2. nav()  — 加入 active class 管理，配合 style_patch.css 過渡動畫
 *  3. fetchNews() — 加入 localStorage 快取備援
 *  4. fetchFashion() — 修正「頁碼計算」bug + 快取備援 + 精簡顯示邏輯
 *  5. _renderFashionPosts() — 渲染輔助方法（加入空白正規化）
 */
(function () {

  /* ── init ─────────────────────────────────────────────────── */
  app.init = function () {
    this._navFF = [];
    this._ihFF  = [];
    this.initStars();
    this.initNavFF();
    this._startFFLoop();
    this._initIH();
    this.nav('home');
    window.addEventListener('resize', () => this.initStars());
    document.querySelectorAll('.nav-item[data-nav]').forEach(el => {
      el.addEventListener('click', () => this.nav(el.dataset.nav));
    });
  };

  /* ── nav ──────────────────────────────────────────────────── */
  app.nav = function (id) {
    document.querySelectorAll('.scene').forEach(s => {
      s.classList.remove('active');
      s.style.display = '';
    });
    document.querySelectorAll('.nav-item[data-nav]').forEach(n => {
      n.classList.toggle('active', n.dataset.nav === id);
    });
    const t = document.getElementById(id);
    if (!t) return;
    t.classList.add('active');
    const vp = document.getElementById('viewport');
    if (vp && vp.scrollTop) vp.scrollTop = 0;
    if (id === 'news'      && !this._nDone) { this._nDone = true; this.fetchNews(); }
    if (id === 'fashion'   && !this._fDone) { this._fDone = true; this.fetchFashion(); }
    if (id === 'submarine' && !this._sDone) { this._sDone = true; this.buildSub(); }
  };

  /* ── fetchNews（加入 localStorage 快取備援）───────────────── */
  app.fetchNews = async function () {
    const ctn = document.getElementById('news-list');
    if (!ctn) return;
    let html = await this._fetch('https://www.ffxiv.com.tw/web/news/news_list.aspx');
    let fromCache = false;
    if (!html) {
      try {
        const cache = JSON.parse(localStorage.getItem('xiv_news_cache') || 'null');
        if (cache && cache.html) { html = cache.html; fromCache = true; }
      } catch (_) {}
    } else {
      try { localStorage.setItem('xiv_news_cache', JSON.stringify({ ts: Date.now(), html })); } catch (_) {}
    }
    if (!html) {
      ctn.innerHTML =
        '<div class="news-error"><span>暫時無法讀取，' +
        '<a href="https://www.ffxiv.com.tw/web/news/news_list.aspx" target="_blank"' +
        ' style="color:var(--gold)">請點此前往官網</a></span></div>';
      return;
    }
    if (fromCache) {
      try {
        const ts = JSON.parse(localStorage.getItem('xiv_news_cache')).ts;
        const note = document.createElement('div');
        note.className = 'news-cache-note';
        note.textContent = '（快取版本・' + new Date(ts).toLocaleDateString('zh-TW') + '）';
        ctn.parentElement.insertBefore(note, ctn);
      } catch (_) {}
    }
    const doc       = new DOMParser().parseFromString(html, 'text/html');
    const container = doc.querySelector('.list.news_list');
    if (!container) {
      ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>';
      return;
    }
    const links = [...container.querySelectorAll('a[href*="news_content"]')];
    const dates = [...container.querySelectorAll('.publish_date')];
    if (!links.length) {
      ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>';
      return;
    }
    ctn.innerHTML = '';
    links.forEach((link, i) => {
      const title = link.textContent.trim();
      if (!title || title.length < 2) return;
      const rawDate = (dates[i + 1]?.textContent || '').trim();
      const dm      = rawDate.match(/^(\d{4})(\d{2})(\d{2})$/);
      const date    = dm ? `${dm[1]}/${dm[2]}/${dm[3]}` : rawDate;
      let href      = link.getAttribute('href') || '';
      if (!href.startsWith('http'))
        href = 'https://www.ffxiv.com.tw/' + (href.startsWith('/') ? href.slice(1) : href);
      const rowContainer = link.closest('li,tr,div');
      const isPinned     = !!rowContainer?.querySelector('.badge.top,span.top');
      const a = document.createElement('a');
      a.className = 'news-item'; a.href = href; a.target = '_blank'; a.rel = 'noopener';
      if (isPinned) {
        const p = document.createElement('span'); p.className = 'news-pin'; p.textContent = '置頂'; a.appendChild(p);
      }
      if (date) {
        const d = document.createElement('span'); d.className = 'news-date'; d.textContent = date; a.appendChild(d);
      }
      const h = document.createElement('span'); h.className = 'news-headline'; h.textContent = title; a.appendChild(h);
      ctn.appendChild(a);
    });
    if (!ctn.children.length)
      ctn.innerHTML = '<div class="news-error"><span>暫時無法解析公告</span></div>';
  };

  /* ── fetchFashion（修正頁碼 bug + 快取 + 精簡）────────────── */
  app.fetchFashion = async function () {
    const ctn = document.getElementById('fashion-content');
    if (!ctn) return;
    const BASE = 'https://forum.gamer.com.tw/C.php?bsn=17608&snA=20177';

    /* Step 1：抓第 1 頁，只用於取得總頁數 */
    const html0 = await this._fetch(BASE);
    if (!html0) {
      try {
        const cache = JSON.parse(localStorage.getItem('xiv_fashion_cache') || 'null');
        if (cache && cache.posts && cache.posts.length) {
          const note = document.createElement('div');
          note.className = 'news-cache-note';
          note.textContent = '（快取版本・' + new Date(cache.ts).toLocaleDateString('zh-TW') + '）';
          ctn.parentElement.insertBefore(note, ctn);
          this._renderFashionPosts(ctn, cache.posts);
          return;
        }
      } catch (_) {}
      ctn.innerHTML = '<div class="news-error"><span>未找到本週答案，請前往原文查看</span></div>';
      return;
    }

    /* Step 2：從分頁連結取得最後一頁頁碼 */
    const doc0      = new DOMParser().parseFromString(html0, 'text/html');
    const pageLinks = [...doc0.querySelectorAll('a[href*="page="]')];
    const pageNums  = pageLinks
      .map(a => { const m = (a.getAttribute('href') || '').match(/page=(\d+)/); return m ? parseInt(m[1]) : 0; })
      .filter(n => n > 0);
    const lastPage = pageNums.length ? Math.max(...pageNums) : 1;

    /* Step 3：另外抓最後一頁（html0 是第 1 頁，不重複使用）
     * 修正說明：前版錯誤地把 html0（第 1 頁內容）當成最後一頁，
     * 導致永遠只看到最舊的回覆。現在明確分開抓取。 */
    const htmlLast = (lastPage === 1)
      ? html0
      : await this._fetch(`${BASE}&page=${lastPage}`);

    if (!htmlLast) {
      ctn.innerHTML = '<div class="news-error"><span>未找到本週答案，請前往原文查看</span></div>';
      return;
    }

    /* Step 4：解析、排序、去重 */
    let posts = this._parseFashion(htmlLast);
    posts.sort((a, b) => b.floor - a.floor);
    const seen = new Set();
    posts = posts.filter(p => { if (seen.has(p.floor)) return false; seen.add(p.floor); return true; });

    /* Step 5：PRIO 作者優先；找到則只顯示他們，找不到才顯示其他人 */
    const PRIO       = ['chcooboo', 'rhythm'];
    const prioPosts  = posts.filter(p =>  PRIO.some(n => p.author.toLowerCase().includes(n)));
    const otherPosts = posts.filter(p => !PRIO.some(n => p.author.toLowerCase().includes(n)));
    const final = (prioPosts.length > 0 ? prioPosts : otherPosts).slice(0, 3);

    if (!final.length) {
      ctn.innerHTML = '<div class="news-error"><span>未找到本週答案，請前往原文查看</span></div>';
      return;
    }
    try { localStorage.setItem('xiv_fashion_cache', JSON.stringify({ ts: Date.now(), posts: final })); } catch (_) {}
    this._renderFashionPosts(ctn, final);
  };

  /* ── _renderFashionPosts ──────────────────────────────────── */
  app._renderFashionPosts = function (ctn, posts) {
    const PRIO = ['chcooboo', 'rhythm'];
    ctn.innerHTML = '';
    posts.forEach(p => {
      const isPrio = PRIO.some(n => p.author.toLowerCase().includes(n));
      const div  = document.createElement('div');  div.className = 'fashion-post';
      const hdr  = document.createElement('div');  hdr.className = 'fashion-post-hdr';
      const auth = document.createElement('span'); auth.className = 'fashion-author' + (isPrio ? ' priority' : '');
      auth.textContent = p.author;
      const uid  = document.createElement('span'); uid.className = 'fashion-uid';
      uid.textContent  = p.uid ? `（${p.uid}）` : '';
      hdr.append(auth, uid);
      const body = document.createElement('div'); body.className = 'fashion-body';
      body.textContent = (p.content || '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      div.append(hdr, body);
      ctn.appendChild(div);
    });
  };

})();
