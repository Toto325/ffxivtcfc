/* craft-guide-light.js — 生產頁的「下一步」光引導
 *
 * 設計原則：只引導、不打擾。
 *   ・平常完全靜止、什麼都不顯示。只有「下一步改變了」的那一瞬間，光才會出現：
 *       一小團光（跟選單 .nrp-ind 同一個語彙：金色、screen 混合）緩緩滑到目標 → 沿著目標的邊框繞一圈 → 淡出，結束。
 *   ・同一個目標不會重複提示；玩家已經碰過目標（點、聚焦、輸入）就算完成，不再提示。
 *   ・目標由「畫面目前的狀態」決定，永遠是第一個還沒完成的必要步驟：
 *       沒選配方、沒設數值 → 先指向缺的那一個（兩個都缺就先指配方搜尋列）
 *       兩個都有了        → 指向「開始求解」
 *       求解中            → 不提示
 *       結果出來了        → 指向第一段還沒複製的巨集；複製完滑到下一段；全部複製完就結束
 *   ・尊重「減少動態效果」：不滑動、不繞圈，只讓目標邊框柔和亮一下。
 *   ・可關閉：localStorage['craftGuideLight']='off'（或在 <html> 設 data-guide-light="off"）。
 *
 * 只「讀」畫面狀態（DOM），不改動 craft-panel.js 的任何邏輯，所以不會影響求解與其他功能。 */
(function () {
  'use strict';
  var KEY = 'craftGuideLight';
  var DEFAULT_STATS = { 'cf-cp': 888, 'cf-craftsmanship': 4444, 'cf-control': 4444 }; // 跟 craft-panel.js 的預設值一致：還是預設值＝玩家還沒設定
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function enabled() {
    try { if (localStorage.getItem(KEY) === 'off') return false; } catch (e) { /* 讀不到就當作開啟 */ }
    return document.documentElement.getAttribute('data-guide-light') !== 'off';
  }
  function $(id) { return document.getElementById(id); }

  /* 跨次造訪的「提示次數」：回頭的老玩家不需要每次都被提醒。
   *  recipe／stats 各最多提示 3 次；求解按鈕在「第一次求解」之前提示；
   *  巨集：第一段在「第一次複製」之前提示；第 2 段起（最容易搞混的地方）每次都提示。 */
  var SEEN_KEY = 'craftGuideLight.seen', seen = { recipe: 0, stats: 0, solved: false, copied: false };
  try { var raw = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); if (raw && typeof raw === 'object') seen = Object.assign(seen, raw); } catch (e) { /* 壞掉就用預設 */ }
  function saveSeen() { try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) { /* 存不了就算了 */ } }
  function allowed(t) {
    if (t.kind === 'recipe') return seen.recipe < 3;
    if (t.kind === 'stats') return seen.stats < 3;
    if (t.kind === 'solve') return !seen.solved;
    if (t.kind === 'macro') return t.seg > 0 || !seen.copied;
    return true;
  }
  var touched = { stats: false, recipe: false, solve: false };
  var copied = {};            // 目前這份結果已複製的段落
  var resultSig = '';         // 目前結果的巨集內容簽名（換結果就重新計算已複製）
  var lastKey = '';           // 上一次提示過的目標（同一個目標不重複）
  var lastPlayAt = 0;
  var pending = null;         // 防抖計時器
  var glow = null;            // 飛行的光
  var playing = 0;            // 動畫世代編號（新動畫開始就取消舊的收尾）

  /* ── 狀態判讀（只讀 DOM） ── */
  function statsDone() {
    var ids = ['cf-cp', 'cf-craftsmanship', 'cf-control'], same = 0;
    for (var i = 0; i < ids.length; i++) {
      var el = $(ids[i]); if (!el) return true; // 找不到欄位就不管這一步
      var v = parseInt(el.value, 10);
      if (!(v > 0)) return false;
      if (v === DEFAULT_STATS[ids[i]]) same++;
    }
    return touched.stats || same < ids.length; // 三個都還是預設值、也沒碰過 → 還沒設定
  }
  function recipeDone() {
    var t = $('cf-solve-target');
    return !!(t && t.textContent && t.textContent.indexOf('尚未選擇配方') < 0);
  }
  function solving() {
    var b = $('cf-solve');
    return !!(b && b.disabled && recipeDone());
  }
  function macroButtons() {
    var res = $('cf-result'); if (!res) return [];
    return Array.prototype.slice.call(res.querySelectorAll('.craft-macro-copy-btn'));
  }
  function syncResultSig() {
    var res = $('cf-result'), pres = res ? res.querySelectorAll('pre.craft-macro') : [];
    var sig = ''; for (var i = 0; i < pres.length; i++) sig += pres[i].textContent.length + ':' + pres[i].textContent.slice(0, 24) + '|';
    if (sig !== resultSig) { resultSig = sig; copied = {}; }
  }

  /* 目前的目標：{ key, el } 或 null */
  function currentTarget() {
    if (solving()) return null;
    syncResultSig();
    var btns = macroButtons();
    if (btns.length) {
      for (var i = 0; i < btns.length; i++) if (!copied[btns[i].getAttribute('data-seg')]) return { kind: 'macro', seg: i, key: 'macro:' + resultSig + ':' + btns[i].getAttribute('data-seg'), el: btns[i] };
      return null; // 全部複製完了
    }
    var needR = !recipeDone(), needS = !statsDone();
    if (needR) return { kind: 'recipe', key: 'recipe', el: $('cf-recipe-search') };
    if (needS) {
      var dock = $('cf-dock-bar'), grid = document.querySelector('.cw-stat-grid');
      var open = dock && dock.getAttribute('aria-expanded') === 'true';
      return { kind: 'stats', key: 'stats', el: open && grid ? grid : dock };
    }
    var s = $('cf-solve');
    if (s && !s.disabled && !touched.solve) return { kind: 'solve', key: 'solve:' + ($('cf-solve-target') || {}).textContent, el: s };
    return null;
  }

  /* ── 視覺 ── */
  function ensureGlow() {
    if (glow && glow.parentNode) return glow;
    glow = document.createElement('div');
    glow.className = 'cgl-glow'; glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);
    return glow;
  }
  function inViewport(r) { return r.bottom > 0 && r.top < (window.innerHeight || 0) && r.right > 0 && r.left < (window.innerWidth || 0); }
  function radiusOf(el) { var cs = getComputedStyle(el); return parseFloat(cs.borderTopLeftRadius) || 8; }

  /* 沿著目標邊框繞一圈（SVG 的 pathLength=100，用 stroke-dashoffset 讓一小段亮線跑完一圈） */
  function lap(el, gen) {
    var r = el.getBoundingClientRect(), pad = 3;
    var w = r.width + pad * 2, h = r.height + pad * 2;
    var wrap = document.createElement('div');
    wrap.className = 'cgl-lap' + (reduce ? ' cgl-still' : '');
    wrap.style.cssText = 'left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + w + 'px;height:' + h + 'px';
    var rx = radiusOf(el) + pad;
    wrap.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="' + rx + '" ry="' + rx + '" pathLength="100"/></svg>';
    document.body.appendChild(wrap);
    var done = function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); if (gen === playing && glow) glow.classList.remove('on'); };
    setTimeout(done, reduce ? 900 : 1500);
  }

  function play(target) {
    var el = target.el; if (!el) return;
    var r = el.getBoundingClientRect(); if (!r.width && !r.height) return;
    var gen = ++playing, g = ensureGlow();
    if (!inViewport(r)) { // 目標在畫面外：只在最近的邊緣閃一下，不去捲動頁面（不搶玩家的視線控制）
      var edgeY = r.top < 0 ? 14 : (window.innerHeight || 0) - 14;
      g.style.transform = 'translate(' + Math.max(14, Math.min((window.innerWidth || 0) - 14, r.left + r.width / 2)) + 'px,' + edgeY + 'px)';
      g.classList.add('on'); setTimeout(function () { if (gen === playing) g.classList.remove('on'); }, 1100);
      return;
    }
    var tx = r.left + Math.min(r.width / 2, 28), ty = r.top + r.height / 2;
    if (reduce) { g.classList.remove('on'); lap(el, gen); return; }
    if (!g.getAttribute('data-placed')) { // 第一次：先就位在目標旁邊（不從頁面角落飛過來）
      g.style.transition = 'none'; g.style.transform = 'translate(' + (tx - 70) + 'px,' + (ty - 26) + 'px)';
      void g.offsetWidth; g.style.transition = ''; g.setAttribute('data-placed', '1');
    }
    g.classList.add('on');
    g.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
    // 滑行約 .85 秒（跟選單指示光一樣的曲線），到了就繞一圈
    setTimeout(function () { if (gen === playing) lap(el, gen); }, 780);
  }

  /* ── 排程 ── */
  function evaluate() {
    pending = null;
    if (!enabled() || !$('craft-root') || !$('cf-solve')) return;
    var root = $('craft-root'); if (root.offsetParent === null && root.getClientRects().length === 0) return; // 生產頁沒顯示
    var t = currentTarget();
    if (!t) { lastKey = ''; return; }
    if (t.key === lastKey) return;                 // 同一個目標不重複提示
    var now = Date.now(); if (now - lastPlayAt < 1800) { schedule(1900 - (now - lastPlayAt)); return; } // 太密集就等一下，免得光一直閃
    lastKey = t.key;                                // 不管有沒有播，這個目標都算「處理過」，不會重複排程
    if (!allowed(t)) return;
    if (t.kind === 'recipe') seen.recipe++; else if (t.kind === 'stats') seen.stats++;
    saveSeen();
    lastPlayAt = now;
    play(t);
  }
  function schedule(ms) { if (pending) clearTimeout(pending); pending = setTimeout(evaluate, ms == null ? 160 : ms); }

  function init() {
    var root = $('craft-root'); if (!root) return;
    new MutationObserver(function () { schedule(); }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'aria-expanded', 'value'], characterData: true });
    root.addEventListener('input', function (e) {
      var id = e.target && e.target.id;
      if (id === 'cf-cp' || id === 'cf-craftsmanship' || id === 'cf-control' || id === 'cf-lvl') touched.stats = true;
      schedule(400);
    }, true);
    root.addEventListener('focusin', function (e) { var id = e.target && e.target.id; if (id === 'cf-recipe-search') touched.recipe = true; }, true);
    root.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target : null; if (!t) return;
      var copyBtn = t.closest('.craft-macro-copy-btn');
      if (copyBtn) { copied[copyBtn.getAttribute('data-seg')] = true; seen.copied = true; saveSeen(); schedule(900); } // 複製完讓光滑向下一段（等「已複製」的提示先顯示完）
      if (t.closest('#cf-solve')) { touched.solve = true; seen.solved = true; saveSeen(); lastKey = ''; }
      if (t.closest('#cf-dock-bar') || t.closest('.cw-stat-grid')) touched.stats = touched.stats || t.closest('.cw-stat-grid') !== null;
    }, true);
    // 換配方就重新開始這一輪（solve 的「已碰過」要重設）
    document.addEventListener('change', function (e) { if (e.target && e.target.id === 'cf-job') { touched.solve = false; } }, true);
    new MutationObserver(function () { if (!recipeDone()) touched.solve = false; }).observe($('cf-solve-target') || root, { childList: true, characterData: true, subtree: true });
    schedule(900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  else setTimeout(init, 0);
  window.CraftGuideLight = { off: function () { try { localStorage.setItem(KEY, 'off'); } catch (e) { /* 存不了就只對這次有效 */ } document.documentElement.setAttribute('data-guide-light', 'off'); }, on: function () { try { localStorage.removeItem(KEY); } catch (e) { /* 同上 */ } document.documentElement.removeAttribute('data-guide-light'); } };
})();
