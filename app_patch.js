/**
 * app_patch.js
 * 修正項目：
 *  - 移除 localStorage 死代碼（_recentViewed）
 *  - nav 加入 active 狀態管理，修正 display/visibility 切換
 *  - 導覽列改為 addEventListener（搭配 data-nav 屬性）
 *  - fetchNews 加入 localStorage 快取備援
 *  - fetchFashion 修正最後一頁偵測邏輯，加入快取備援
 *  - 新增 _renderFashionPosts 輔助方法
 */
(function () {

  /* ── init ─────────────────────────────────────────────────────────── */
  app.init = function () {
    this._navFF = []; this._ihFF = [];
    this.initStars();
    this.initNavFF();
    this._startFFLoop();
    this._initIH();
    // 不再讀取 localStorage xiv_rv（移除死代碼）
    this.nav('home');
    window.addEventListener('resize', () => this.initStars());

    // 事件監聽取代 inline onclick
    document.querySelectorAll('.nav-item[data-nav]').forEach(el => {
      el.addEventListener('click', () => this.nav(el.dataset.nav));
    });
  };

  /* ── nav ──────────────────────────────────────────────────────────── */
  app.nav = function (id) {
    // 清除所有 scene（移除 inline style，讓 CSS 接管 visibility）
    document.querySelectorAll('.scene').forEach(s => {
      s.classList.remove('active');
      s.style.display = ''; // 清除舊版 script.js 設定的 inline display
    });
    // 更新 nav active 狀態
    document.querySelectorAll('.nav-item[data-nav]').forEach(n => {
      n.classList.toggle('active', n.dataset.nav === id);
    });
    // 啟用目標 scene
    const t = document.getElementById(id);
    if (!t) return;
    t.classList.add('active');
    // 捲回頂部（手機模式下）
    const vp = document.getElementById('viewport');
    if (vp) vp.scrollTop = 0;
    // 懶載入
    if (id === 'news'      && !this._nDone) { this._nDone = true; this.fetchNews(); }
    if (id === 'fashion'   && !this._fDone) { this._fDone = true; this.fetchFashion(); }
    if (id === 'submarine' && !this._sDone) { this._sDone = true; this.buildSub(); }
  };

  /* ── fetchNews（加入 localStorage 快取備援）─────────────────────── */
  app.fetchNews = async function () {
    const ctn = document.getElementById('news-list');
    if (!ctn) return;

    let html = await this._fetch('https://www.ffxiv.com.tw/web/news/news_list.aspx');
    let fromCache = false;

    if (!html) {
      // 嘗試讀取快取
      try {
        const cache = JSON.parse(localStorage.getItem('xiv_news_cache') || 'null');
        if (cache && cache.html) { html = cache.html; fromCache = true; }
      } catch (_) {}
    }

    if (!html) {
      ctn.innerHTML =
        '<div class="news-error"><span>暫時無法讀取，' +
        '<a href="https://www.ffxiv.com.tw/web/news/news_list.aspx" target="_blank" ' +
        'style="color:var(--gold)">請點此前往官網</a></span></div>';
      return;
    }

    // 成功取得新資料時存快取
    if (!fromCache) {
      try { localStorage.setItem('xiv_news_cache', JSON.stringify({ ts: Date.now(), html })); } catch (_) {}
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

    // 快取提示
    if (fromCache) {
      try {
        const ts = JSON.parse(localStorage.getItem('xiv_news_cache')).ts;
        const note = document.createElement('div');
        note.className = 'news-cache-note';
        note.textContent = '（快取版本・' + new Date(ts).toLocaleDateString('zh-TW') + '）';
        ctn.parentElement.insertBefore(note, ctn);
      } catch (_) {}
    }

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

  /* ── fetchFashion（修正最後一頁偵測 + 快取備援）────────────────── */
  app.fetchFashion = async function () {
    const ctn = document.getElementById('fashion-content');
    if (!ctn) return;

    const BASE = 'https://forum.gamer.com.tw/C.php?bsn=17608&snA=20177';
    const html0 = await this._fetch(BASE);
    let lastPage = 1;

    if (!html0) {
      // 嘗試讀取快取
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

    // ── 修正：從分頁連結偵測最後一頁，不再依賴不存在的 data-floor 屬性 ──
    const doc0      = new DOMParser().parseFromString(html0, 'text/html');
    const pageLinks = [...doc0.querySelectorAll('a[href*="page="]')];
    const pageNums  = pageLinks
      .map(a => { const m = (a.getAttribute('href') || '').match(/page=(\d+)/); return m ? parseInt(m[1]) : 0; })
      .filter(n => n > 0);
    if (pageNums.length) lastPage = Math.max(...pageNums);

    // 抓最後一頁及前一頁（避免分頁邊界剛好漏掉本週貼文）
    const pagesToFetch = [...new Set([lastPage, Math.max(1, lastPage - 1)])];
    let allPosts = [];

    for (const pg of pagesToFetch) {
      const h = (pg === lastPage) ? html0 : await this._fetch(`${BASE}&page=${pg}`);
      if (h) allPosts = [...allPosts, ...this._parseFashion(h)];
    }

    // 去重、排序（floor 由大到小）
    allPosts.sort((a, b) => b.floor - a.floor);
    const seen = new Set();
    allPosts = allPosts.filter(p => { if (seen.has(p.floor)) return false; seen.add(p.floor); return true; });

    // 優先顯示特定作者
    const PRIO = ['chcooboo', 'rhythm'];
    const pP   = allPosts.filter(p =>  PRIO.some(n => p.author.toLowerCase().includes(n)));
    const oP   = allPosts.filter(p => !PRIO.some(n => p.author.toLowerCase().includes(n)));
    const final = [...pP, ...oP].slice(0, 6);

    if (!final.length) {
      ctn.innerHTML = '<div class="news-error"><span>未找到本週答案，請前往原文查看</span></div>';
      return;
    }

    // 存快取
    try { localStorage.setItem('xiv_fashion_cache', JSON.stringify({ ts: Date.now(), posts: final })); } catch (_) {}

    this._renderFashionPosts(ctn, final);
  };

  /* ── _renderFashionPosts（從 fetchFashion 抽出的渲染邏輯）────────── */
  app._renderFashionPosts = function (ctn, posts) {
    const PRIO = ['chcooboo', 'rhythm'];
    ctn.innerHTML = '';
    posts.forEach(p => {
      const div  = document.createElement('div');  div.className = 'fashion-post';
      const hdr  = document.createElement('div');  hdr.className = 'fashion-post-hdr';
      const auth = document.createElement('span');
      auth.className = 'fashion-author' + (PRIO.some(n => p.author.toLowerCase().includes(n)) ? ' priority' : '');
      auth.textContent = p.author;
      const uid = document.createElement('span');
      uid.className = 'fashion-uid';
      uid.textContent = p.uid ? `（${p.uid}）` : '';
      hdr.append(auth, uid);
      const body = document.createElement('div');
      body.className = 'fashion-body'; body.textContent = p.content;
      div.append(hdr, body);
      ctn.appendChild(div);
    });
  };

})();
