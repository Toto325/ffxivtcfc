/* app.js — 全站骨架邏輯：星空背景、導覽列光點特效、互動光點(.ih)、
 * 分頁切換(nav)、外部公告/時尚品鑑抓取（含 CORS 代理 fallback）。
 *
 * 本檔案由原本的 script.js（app 物件骨架，buildSub 已搬到 sub-panel.js）
 * 與 app_patch.js（原本用「猴子補丁」方式覆蓋 app 物件方法）合併而成，
 * 內容逐字未變，只是不再需要「兩個檔案疊加才是最終邏輯」，
 * 一份檔案就是完整、最終的行為。
 *
 * 下半部分原本是 app_patch.js v15，這裡原封不動保留其 IIFE 私有作用域
 * （PRIO 清單、linkify 函式都只給下面這段用，不外洩到全域）。
 */

const app = {
initStars(){
    const cv=document.getElementById('starfield');if(!cv)return;
    const ctx=cv.getContext('2d');cv.width=innerWidth;cv.height=innerHeight;
    if(this._sid)cancelAnimationFrame(this._sid);
    this._stars=Array.from({length:290},(_,i)=>{const b=i<28,g=Math.random()<0.11;return{x:Math.random()*cv.width,y:Math.random()*cv.height,sz:b?2.4+Math.random()*2.1:0.6+Math.random()*1.6,spd:.055+Math.random()*.18,bOp:b?.68+Math.random()*.28:.40+Math.random()*.48,tf:.007+Math.random()*.022,tp:Math.random()*Math.PI*2,ta:b?.20+Math.random()*.28:.10+Math.random()*.20,b,r:g?252:b?245:232,gr:g?214:b?240:228,bl:g?140:b?255:215};});
    let f=0;const run=()=>{ctx.clearRect(0,0,cv.width,cv.height);f++;this._stars.forEach(s=>{s.y-=s.spd;if(s.y<-5){s.y=cv.height+5;s.x=Math.random()*cv.width;}const op=Math.max(.12,Math.min(1,s.bOp+Math.sin(f*s.tf+s.tp)*s.ta));if(s.b){const g1=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,s.sz*5.5);g1.addColorStop(0,`rgba(${s.r},${s.gr},${s.bl},${(op*.60).toFixed(3)})`);g1.addColorStop(.35,`rgba(${s.r},${s.gr},${s.bl},${(op*.18).toFixed(3)})`);g1.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g1;ctx.beginPath();ctx.arc(s.x,s.y,s.sz*5.5,0,Math.PI*2);ctx.fill();}ctx.fillStyle=`rgba(${s.r},${s.gr},${s.bl},${op.toFixed(3)})`;ctx.beginPath();ctx.arc(s.x,s.y,s.sz,0,Math.PI*2);ctx.fill();});this._sid=requestAnimationFrame(run);};run();
  },

  initNavFF(){document.querySelectorAll('.nav-item').forEach(item=>{item._nH=false;item.addEventListener('mouseenter',()=>{item._nH=true;this._schedNavFF(item);});item.addEventListener('mouseleave',()=>{item._nH=false;clearTimeout(item._nT);});});},
  _schedNavFF(item){if(!item._nH)return;item._nT=setTimeout(()=>{this._navFF.push(this._mkNavFF(item));this._schedNavFF(item);},170+Math.random()*310);},
  _mkNavFF(item){const el=document.createElement('span'),sz=3+Math.random()*5.5;const lx=item.offsetWidth*(.65+Math.random()*.30),ly=item.offsetHeight*(.46+Math.random()*.44);el.style.cssText=`position:absolute;width:${sz}px;height:${sz}px;left:${lx}px;top:${ly}px;border-radius:50%;pointer-events:none;opacity:0;background:radial-gradient(circle at 38% 35%,#fff 0%,#fcf6ba 42%,#c5a059 100%);box-shadow:0 0 ${sz*1.2}px ${sz*.4}px #c5a059,0 0 ${sz*2.5}px ${sz*.8}px rgba(197,160,89,.4);z-index:10;will-change:transform,opacity;`;item.appendChild(el);return{el,age:0,maxAge:210+Math.random()*150,dAmp:(Math.random()-.5)*60,dFreq:.011+Math.random()*.020,dPhase:Math.random()*Math.PI*2,rise:.18+Math.random()*.26,riseA:.0004+Math.random()*.0009};},
  _startFFLoop(){const anim=arr=>arr.filter(f=>{f.age++;const p=f.age/f.maxAge;if(p>=1){f.el.remove();return false;}const op=p<.10?p/.10:p>.72?(1-p)/.28:1,sc=p<.12?p/.12:p>.76?(1-p)/.24:1;const dx=Math.sin(f.dFreq*f.age+f.dPhase)*f.dAmp*Math.min(p*5,1),dy=-(f.rise*f.age+f.riseA*f.age*f.age);f.el.style.opacity=Math.max(0,Math.min(1,op)).toFixed(4);f.el.style.transform=`translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px) scale(${sc.toFixed(4)})`;return true;});const run=()=>{requestAnimationFrame(run);this._navFF=anim(this._navFF);this._ihFF=anim(this._ihFF);};run();},
  _initIH(){setTimeout(()=>{document.querySelectorAll('.ih').forEach(el=>this._bindIH(el));new MutationObserver(()=>document.querySelectorAll('.ih:not([data-ih])').forEach(el=>{el.setAttribute('data-ih','1');this._bindIH(el);})).observe(document.body,{subtree:true,childList:true});},400);},
  _bindIH(el){if(el._ihB)return;el._ihB=true;el._ihH=false;el.addEventListener('mouseenter',()=>{el._ihH=true;this._schedIH(el);});el.addEventListener('mouseleave',()=>{el._ihH=false;clearTimeout(el._iT);});},
  _schedIH(el){if(!el._ihH)return;el._iT=setTimeout(()=>{this._spawnIHFF(el);this._schedIH(el);},220+Math.random()*380);},
  _spawnIHFF(el){const sz=2.5+Math.random()*4.5,rect=el.getBoundingClientRect();const f=document.createElement('span');f.style.cssText=`position:fixed;width:${sz}px;height:${sz}px;pointer-events:none;border-radius:50%;z-index:99998;opacity:0;will-change:transform,opacity;background:radial-gradient(circle at 38% 35%,#fff 0%,#fcf6ba 42%,#c5a059 100%);box-shadow:0 0 ${sz*1.5}px ${sz*.5}px rgba(197,160,89,.65);left:${(rect.left+rect.width*(.60+Math.random()*.35)-sz/2).toFixed(1)}px;top:${(rect.top+rect.height*(.44+Math.random()*.46)-sz/2).toFixed(1)}px;`;document.body.appendChild(f);this._ihFF.push({el:f,age:0,maxAge:190+Math.random()*140,dAmp:(Math.random()-.5)*52,dFreq:.012+Math.random()*.022,dPhase:Math.random()*Math.PI*2,rise:.15+Math.random()*.22,riseA:.0005+Math.random()*.0008});}
};

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

  /* 優先顯示的作者清單（fetchFashion 和 _renderFashionPosts 共用） */
  var PRIO = ['chcooboo', 'rhythm'];

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
      } catch (e) { clearTimeout(tid); console.warn('[XIV] proxy', i, 'error:', e.message); continue; }
    }
    console.error('[XIV] all proxies failed for', url);
    return null;
  };

  /* ══ init ══════════════════════════════════════════════════════════ */
  app.init = function () {
    if (this._initDone) return;
    this._initDone = true;
    this._navFF = []; this._ihFF = [];
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
      /* Prevent browser scroll-into-view on the overflow-y:auto .royal-nav in left mode.
         mousedown fires before focus is assigned; preventDefault() stops focus being
         given on mouse click, eliminating the sidebar jump. Keyboard nav (keydown) is
         unaffected — it never triggers this path. */
      el.addEventListener('mousedown', function (e) { e.preventDefault(); });
      el.addEventListener('click', function () { app.nav(el.dataset.nav); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); app.nav(el.dataset.nav); }
      });
    });

    /* 「遠航探索」子選單（潛水艇／飛空艇）展開收合：
       這個項目本身沒有 data-nav，不會被上面那個迴圈綁到，需要另外處理。
       點擊子項目（.nav-subitem）時事件會冒泡到這裡，用 closest 判斷跳過，
       避免選了子項目後子選單又被這裡的 toggle 邏輯關掉/開起來造成閃爍。 */
    var expGroup = document.getElementById('nav-group-exploration');
    if (expGroup) {
      var toggleExpGroup = function (force) {
        var open = typeof force === 'boolean' ? force : !expGroup.classList.contains('nav-open');
        expGroup.classList.toggle('nav-open', open);
        expGroup.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      expGroup.addEventListener('mousedown', function (e) { e.preventDefault(); });
      expGroup.addEventListener('click', function (e) {
        if (e.target.closest('.nav-subitem')) return; // 子項目自己的 data-nav 迴圈已經處理導覽
        toggleExpGroup();
      });
      expGroup.addEventListener('keydown', function (e) {
        if (e.target !== expGroup) return; // 子項目的 Enter/Space 已由上面迴圈處理
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpGroup(); }
      });
      expGroup._setOpen = toggleExpGroup;
    }

  };

  /* ══ nav ════════════════════════════════════════════════════════════ */
  app.nav = function (id) {
    try { sessionStorage.setItem('xiv_nav', id); } catch (_) {}

    document.querySelectorAll('.scene.active').forEach(function (s) {
      s.classList.remove('active');
    });
    document.querySelectorAll('.nav-item[data-nav]').forEach(function (n) {
      n.classList.toggle('active', n.dataset.nav === id);
    });
    var expGroup = document.getElementById('nav-group-exploration');
    if (expGroup) {
      var inExploration = (id === 'submarine' || id === 'airship');
      expGroup.classList.toggle('active', inExploration);
      if (expGroup._setOpen) expGroup._setOpen(inExploration);
    }
    var t = document.getElementById(id);
    if (!t) return;
    t.classList.add('active');                   // synchronous — no rAF gap
    var vp = document.getElementById('viewport');
    if (vp && vp.scrollTop) vp.scrollTop = 0;
    if (t.scrollTop) t.scrollTop = 0;           // reset scene scroll in left mode

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
    if (id === 'airship' && !this._aDone) { this._aDone = true; this.buildAir(); }
    if (id === 'craft' && !this._cDone) { this._cDone = true; this.buildCraft(); }
  };

  app._retryFashion = function () { this._fDone = false; this.nav('fashion'); };

  /* ══ fetchNews ══════════════════════════════════════════════════════ */
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
    /* 抓第 1 頁只取頁碼資訊 */
    var html1    = await this._fetch(BASE);
    var lastPage = 1;
    if (html1) {
      var doc1     = new DOMParser().parseFromString(html1, 'text/html');
      var pageNums = Array.from(doc1.querySelectorAll('a[href*="page="]'))
        .map(function (a) { var m = (a.getAttribute('href') || '').match(/[?&]page=(\d+)/); return m ? parseInt(m[1]) : 0; })
        .filter(function (n) { return n > 0; });
      if (pageNums.length) lastPage = Math.max.apply(null, pageNums);
    } else {
      ctn.innerHTML = '<div class="news-error"><span>無法連線，<button class="fashion-retry-btn" onclick="app._retryFashion()">重新讀取</button>　或　<a href="' + BASE + '" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">前往原文查看</a></span></div>';
      return;
    }

    /* 抓最後 2 頁（若只有 1 頁就只抓 1 頁），每頁明確請求 */
    var pages = [];
    for (var p = lastPage; p >= Math.max(1, lastPage - 1); p--) pages.push(p);

    var allPosts = [];
    for (var i = 0; i < pages.length; i++) {
      var h = await this._fetch(BASE + '&page=' + pages[i]);
      if (h) {
        var parsed = self._parseFashionClean(h, pages[i]);
        allPosts = allPosts.concat(parsed);
      }
    }

    /* 降序排列、去重 */
    allPosts.sort(function (a, b) { return b.floor - a.floor; });
    var seen = new Set();
    allPosts = allPosts.filter(function (p) { if (seen.has(p.floor)) return false; seen.add(p.floor); return true; });

    /* PRIO 作者優先，取最新 3 筆 */
    var prioPosts = allPosts.filter(function (p) { return PRIO.some(function (n) { return p.author.toLowerCase().includes(n); }); });
    var othPosts  = allPosts.filter(function (p) { return !PRIO.some(function (n) { return p.author.toLowerCase().includes(n); }); });
    var final     = (prioPosts.length > 0 ? prioPosts : othPosts).slice(0, 3);

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
      /* 只推進到 cleanUrl 結尾（不含被裁掉的結尾標點），
         讓那些標點在下一輪被當成一般文字輸出 */
      last = match.index + cleanUrl.length;
    }
    if (last < text.length)
      container.appendChild(document.createTextNode(text.slice(last)));
  }

  app._renderFashionPosts = function (ctn, posts) {
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
