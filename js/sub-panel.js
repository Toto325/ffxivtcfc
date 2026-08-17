/* sub-panel.js — 潛水艇路線搜尋／配裝反查 UI 面板。
 * 從原本 script.js 內 app 物件的 buildSub() 方法搬出來獨立成檔，內容逐字未變，
 * 只是把「物件內的簡寫方法」改成「掛在 app 上的獨立賦值」，寫法與
 * air-panel.js／app.js 內其餘方法統一。
 * 依賴：sub-data.js、sub-calc.js（航區/戰利品資料與搜尋演算法）、items.js（物品名稱查表）。
 */
/* ─── SUBMARINE UI ─── */
app.buildSub = function (){
    const root=document.getElementById('sub-root');if(!root)return;
    const FILTER_KEY='xiv-sub-route-filters';
    let savedFilter=null;
    try{savedFilter=JSON.parse(localStorage.getItem(FILTER_KEY)||'null');}catch(e){}
    let selH=null,selS=null,selB=null,selBr=null,subRank=savedFilter?.rank||1;
    let mustInc=savedFilter?.mustInc?savedFilter.mustInc.slice():[],mustExcl=savedFilter?.mustExcl?savedFilter.mustExcl.slice():[],mustIncMaps=savedFilter?.mustIncMaps?savedFilter.mustIncMaps.slice():[],mustExclMaps=savedFilter?.mustExclMaps?savedFilter.mustExclMaps.slice():[],mustLootIds=savedFilter?.mustLootIds?savedFilter.mustLootIds.slice():[];
    let useTime=false,desiredMins=0,letterOnly=!!savedFilter?.letterOnly;
    /* 擁有的部件：路線搜尋（擁有部件模式）與配裝反查共用同一份記錄，
       搬到最上面宣告，兩處都能直接讀寫，不會各自存一份導致不同步。 */
    const OWNED_KEY='xiv-sub-owned-parts';
    let ownedParts={hull:[],stern:[],bow:[],bridge:[]};
    try{const savedOwned=JSON.parse(localStorage.getItem(OWNED_KEY)||'null');if(savedOwned)ownedParts=savedOwned;}catch(e){}
    const saveOwnedParts=()=>{try{localStorage.setItem(OWNED_KEY,JSON.stringify(ownedParts));}catch(e){}};
    /* 部件輸入方式：'select'＝下拉選單指定單一配裝（原本行為）／
       'owned'＝勾選擁有的部件，讓程式自動找出效率最高的路線＋建議配裝。 */
    const PARTS_MODE_KEY='xiv-sub-parts-mode';
    let partsMode='select';
    try{if(localStorage.getItem(PARTS_MODE_KEY)==='owned')partsMode='owned';}catch(e){}
    /* 表格排序狀態：sortKey 對應可排序欄位，sortDir：-1 由大到小、1 由小到大。
       currentRoutes 保留最近一次搜尋結果，點表頭切換排序時直接重排、
       不需要重新呼叫 worker 計算。 */
    let sortKey='epm',sortDir=-1,currentRoutes=[],lootToggleSeq=0,renderRoutes=null;
    const SORT_PROP={exp:'exp',time:'timeMins',epm:'epm',itemEff:'itemEff'};
    const SORT_LABEL={exp:'經驗値',time:'時間',epm:'EXP/分',itemEff:'物品效率'};
    const getStats=()=>selH&&selS&&selB&&selBr?subCalcStats(subRank,selH,selS,selB,selBr):null;
    const getName=id=>(typeof ITEM_DB!=='undefined'&&ITEM_DB[String(id)])||`ID:${id}`;
    /* 物品分類統一排序：設計圖材料 > 稀有物品 > 一般材料 > 魔晶石，跟搜尋結果的
       「獲得物品」顯示用同一套分類（items.js 的 getItemCategory），
       篩選清單／配裝反查指定物品清單都共用這個排序，不再另外維護重點/一般物品清單。 */
    /* 搜尋結果（獲得物品清單）用：跟路線實際門檻連動，只有4類。 */
    const CAT_ORDER={blueprint:0,rare:1,general:2,materia:3};
    /* 篩選清單／配裝反查指定物品清單用：跟路線無關，稀有物品額外拆成
       稀有/更稀有兩類（依多數決），共5類，不能跟上面那組共用。 */
    const PICKER_CAT_ORDER={blueprint:0,rare3:1,rare2:2,general:3,materia:4};
    const PICKER_CAT_LABEL={blueprint:'設計圖材料',rare3:'更稀有物品',rare2:'稀有物品',general:'一般材料',materia:'魔晶石'};

    /* 等級角標彈窗：列出全部等級升級所需經驗值，點擊角標展開，
       樣式沿用點擊物品彈出資訊的同一套 data-tip 機制（見下方點擊式資訊彈窗），
       只是內容從純文字改成表格，並用 data-tip-wide 讓彈窗變寬、可捲動。 */
    const buildLevelTableTip=()=>{
      const ranks=Object.keys(SUB_RANKS).map(Number).sort((a,b)=>a-b);
      const rows=ranks.map(r=>{
        const exp=(SUB_RANKS[r]||[])[0];
        const cls=r===subRank?' exp-cur':'';
        const expStr=exp?exp.toLocaleString():'已達最高等級';
        return `<div class="sub-tip-wide-row${cls}"><span>Lv.${r}</span><span>${expStr}</span></div>`;
      }).join('');
      return `<div class="sub-tip-wide-hdr"><span>等級</span><span>下一級所需經驗值</span></div><div class="sub-tip-wide-body">${rows}</div>`;
    };

    /* ── 點擊式資訊彈窗（取代原生 title）──────────────────────────────
     * 原生 title 只有滑鼠停在原地才會顯示，稍微一動就消失，讀不完內容，
     * 手機上也不可靠。改成：帶有 data-tip 屬性的元素，點擊後在旁邊彈出
     * 一個小方塊顯示完整內容，點別的地方或再點一次就關閉。只需要綁定
     * 一次，整個頁面共用（用 window 旗標避免重複綁定）。 */
    if(!window._subTipInit){
      window._subTipInit=true;
      let tipBox=null,tipTrigger=null;
      const closeTip=()=>{if(tipBox){tipBox.remove();tipBox=null;tipTrigger=null;}};
      const openTip=(trigger)=>{
        closeTip();
        const box=document.createElement('div');
        box.className='sub-tip-box'+(trigger.hasAttribute('data-tip-wide')?' sub-tip-wide':'');
        box.innerHTML=trigger.getAttribute('data-tip').replace(/\n/g,'<br>');
        document.body.appendChild(box);
        const scrollHost=box.querySelector('.sub-tip-wide-body');
        if(scrollHost){
          /* 視窗較小/較窄時，彈窗整體高度依可視空間動態縮小，
             確保無論如何都完整落在畫面內，不會有一段被截到看不見、
             也捲不到的內容（原本固定 max-height 320px 在小螢幕上會超出畫面）。 */
          const hdr=box.querySelector('.sub-tip-wide-hdr');
          const hdrH=hdr?hdr.offsetHeight:0;
          const avail=window.innerHeight-16-hdrH;
          scrollHost.style.maxHeight=Math.max(120,Math.min(320,avail))+'px';
        }
        const curRow=box.querySelector('.exp-cur');
        if(scrollHost&&curRow)scrollHost.scrollTop=curRow.offsetTop-scrollHost.clientHeight/2+curRow.clientHeight/2;
        const r=trigger.getBoundingClientRect();
        let left=r.left,top=r.bottom+6;
        const bw=box.offsetWidth,bh=box.offsetHeight;
        if(left+bw>window.innerWidth-8)left=Math.max(8,window.innerWidth-bw-8);
        if(top+bh>window.innerHeight-8)top=r.top-bh-6;
        if(top<8)top=8;
        box.style.left=left+'px';box.style.top=top+'px';
        tipBox=box;tipTrigger=trigger;
      };
      document.addEventListener('click',e=>{
        const toggleBtn=e.target.closest('.loot-toggle');
        if(toggleBtn){
          e.stopPropagation();
          closeTip();
          const target=document.getElementById(toggleBtn.dataset.target);
          if(!target)return;
          const isHidden=target.style.display==='none';
          target.style.display=isHidden?'inline':'none';
          toggleBtn.textContent=isHidden?'　收合':`　⋯等${toggleBtn.dataset.total}種`;
          return;
        }
        const trigger=e.target.closest('[data-tip]');
        if(trigger){
          e.stopPropagation();
          if(tipTrigger===trigger){closeTip();}else{openTip(trigger);}
        }else if(!e.target.closest('.sub-tip-box')){
          closeTip();
        }
      });
      window.addEventListener('scroll',closeTip,{passive:true});
      window.addEventListener('resize',closeTip);
    }

    root.innerHTML=`<div class="sub-mogship">
<div class="sub-mode-toggle">
  <button type="button" class="sub-mode-btn active" data-mode="route">路線搜尋</button>
  <button type="button" class="sub-mode-btn" data-mode="reverse">配裝反查</button>
</div>
<div id="sub-route-panel">
<div class="sub-top-row"><div class="sub-field-grp"><label class="sub-lbl" for="sub-rank-inp">等級</label><input type="number" id="sub-rank-inp" class="sub-inp" value="1" min="1" max="145"><span class="sub-exp-next" id="sub-exp-next"></span><span class="sub-exp-badge" id="sub-exp-badge" data-tip-wide="1" data-tip="" title="查看全部等級經驗需求">i</span></div><button id="sub-search-btn" class="sub-search-btn" style="margin-left:auto">搜　尋</button><button id="sub-parts-mode-toggle" class="sub-view-btn" type="button">切換「擁有部件」選項</button><button id="sub-view-toggle" class="sub-view-btn" type="button">切換為精簡模式</button><button id="sub-map-btn" class="sub-view-btn" type="button">探索地圖</button><button id="sub-clear-btn" class="sub-clear-btn">清除篩選</button></div>
<div class="sub-parts-row" id="sub-parts-select-row">
  <div class="sub-part-col"><label class="sub-lbl" for="sub-hull">船體</label><select id="sub-hull" class="sub-sel"></select></div>
  <div class="sub-part-col"><label class="sub-lbl" for="sub-stern">船尾</label><select id="sub-stern" class="sub-sel"></select></div>
  <div class="sub-part-col"><label class="sub-lbl" for="sub-bow">船首</label><select id="sub-bow" class="sub-sel"></select></div>
  <div class="sub-part-col"><label class="sub-lbl" for="sub-bridge">艦橋</label><select id="sub-bridge" class="sub-sel"></select></div>
</div>
<div class="sub-stats-bar" id="sub-stats-bar">
  <div class="sub-stat-box"><div class="sub-stat-lbl">探索性能</div><div class="sub-stat-val sv-neu" id="ss-sur">—</div></div>
  <div class="sub-stat-box"><div class="sub-stat-lbl">收集性能</div><div class="sub-stat-val sv-neu" id="ss-ret">—</div></div>
  <div class="sub-stat-box"><div class="sub-stat-lbl">巡航速度</div><div class="sub-stat-val sv-neu" id="ss-spd">—</div></div>
  <div class="sub-stat-box"><div class="sub-stat-lbl">航行距離</div><div class="sub-stat-val sv-neu" id="ss-rng">—</div></div>
  <div class="sub-stat-box"><div class="sub-stat-lbl">恩惠</div><div class="sub-stat-val sv-neu" id="ss-fav">—</div></div>
  <div class="sub-stat-box"><div class="sub-stat-lbl">承載力</div><div class="sub-stat-val sv-neu" id="ss-cap">—</div></div>
</div>
<div class="sub-owned-route-block" id="sub-owned-route-block" style="display:none">
  <div class="sub-owned-hdr-row"><label class="sub-lbl">擁有的部件（與「配裝反查」共用同一份記錄，勾選後搜尋會忽略維修成本，自動找出效率最高的路線＋建議配裝，計算耗時較久）</label><div class="sub-owned-actions"><button type="button" id="sub-owned-route-all" class="sub-owned-mini-btn">全選</button><button type="button" id="sub-owned-route-none" class="sub-owned-mini-btn">全部清除</button></div></div>
  <div id="sub-owned-route-grid"></div>
  <div class="sub-owned-tier-row"><label class="sub-lbl" for="sub-owned-tier">獲得物品門檻</label><select id="sub-owned-tier" class="sub-sel"><option value="none">不限（純比效率，較快）</option><option value="normal">全程每一站至少「達標」</option><option value="best">全程每一站都「最佳」</option></select><span class="sub-owned-tier-note">開啟門檻篩選時，搜尋範圍變大，會比純比效率慢一些</span></div>
</div>
<div class="sub-filters-section">
  <button id="sub-filters-hdr" class="sub-filters-hdr" type="button">&#x25b8; 篩選條件</button>
  <div id="sub-filters-panel" class="sub-filters-panel">
<div class="sub-opts-row">
  <label class="sub-chk-lbl"><input type="radio" name="sub-time-mode" id="sub-time-mode-dur" checked> 剩餘時長</label>
  <label class="sub-chk-lbl"><input type="radio" name="sub-time-mode" id="sub-time-mode-target"> 指定收成時間</label>
  <label class="sub-chk-lbl"><input type="checkbox" id="sub-letter"> 只顯示目的地字母</label>
</div>
<div class="sub-opts-row" id="sub-dur-row">
  <label class="sub-lbl" for="sub-days">天</label><input type="number" id="sub-days" class="sub-inp" value="0" min="0">
  <label class="sub-lbl" for="sub-hrs">小時</label><input type="number" id="sub-hrs" class="sub-inp" value="0" min="0" max="23">
  <label class="sub-lbl" for="sub-mins">分鐘</label><input type="number" id="sub-mins" class="sub-inp" value="0" min="0" max="59">
  <label class="sub-chk-lbl"><input type="checkbox" id="sub-use-time"> 使用指定時間</label>
</div>
<div class="sub-opts-row" id="sub-target-row" style="display:none">
  <label class="sub-lbl" for="sub-target-date">日期</label>
  <input type="date" id="sub-target-date" class="sub-inp sub-date-inp">
  <label class="sub-lbl sub-time-lbl" for="sub-target-hour">時間</label>
  <input type="number" id="sub-target-hour" class="sub-inp" value="20" min="0" max="23">
  <span class="sub-time-colon">:</span>
  <input type="number" id="sub-target-min" class="sub-inp" value="0" min="0" max="59">
  <button type="button" id="sub-ampm-btn" class="sub-ampm-btn" style="display:none">上午</button>
  <button type="button" id="sub-hourmode-btn" class="sub-hourmode-btn" title="切換12/24小時制">24小時制</button>
  <span class="sub-picker-wrap">
    <button type="button" id="sub-target-picker-btn" class="sub-picker-btn" style="display:none" aria-label="開啟日期時間選擇器" title="開啟日曆選擇器">📅</button>
    <input type="datetime-local" id="sub-target-native" class="sub-native-dt" tabindex="-1" aria-hidden="true">
  </span>
  <span class="sub-target-hint" id="sub-target-hint"></span>
</div>
<div class="sub-filter-row">
  <div class="sub-filter-col"><label class="sub-lbl">必須包含目的地</label><div class="sub-multisel-wrap" id="sub-inc-wrap"></div></div>
  <div class="sub-filter-col"><label class="sub-lbl">排除目的地</label><div class="sub-multisel-wrap" id="sub-excl-wrap"></div></div>
</div>
<div class="sub-filter-row">
  <div class="sub-filter-col"><label class="sub-lbl">必須包含航海圖</label><div class="sub-multisel-wrap" id="sub-inmap-wrap"></div></div>
  <div class="sub-filter-col"><label class="sub-lbl">排除航海圖</label><div class="sub-multisel-wrap" id="sub-exmap-wrap"></div></div>
</div>
<div class="sub-filter-col"><label class="sub-lbl">必須獲得物品</label><div class="sub-multisel-wrap" id="sub-loot-wrap"></div><label class="sub-chk-lbl sub-loot-strict-lbl"><input type="checkbox" id="sub-loot-strict"> 每個目的地都至少有其中一項物品</label><label class="sub-chk-lbl sub-loot-meet-lbl" title="只計入探索性能已經達到取得門檻的物品；還沒達標、理論上有機率但目前配裝拿不到的不算數"><input type="checkbox" id="sub-loot-meet"> 忽略不達標的結果</label><div class="sub-loot-sort-row" id="sub-loot-sort-row" style="display:none"><label class="sub-lbl" for="sub-loot-sort">針對獲得物品的排序依據</label><select id="sub-loot-sort" class="sub-sel"><option value="exp">EXP 效率（預設）</option><option value="coverage">物品覆蓋效率（短時間內湊齊優先）</option><option value="count">物品數量效率（拿越多越好）</option></select></div></div>
<div id="sub-range-disp" class="sub-range-disp">目前航行距離：—</div>
  </div>
</div>
<div id="sub-results"><div class="sub-empty">選擇部件並按搜尋查看最佳路線</div></div>
</div>
<div id="sub-reverse-panel" style="display:none"></div>
</div>`;

    ['hull','stern','bow','bridge'].forEach(slot=>{const sel=root.querySelector(`#sub-${slot}`);PARTS[slot].forEach(p=>{const o=document.createElement('option');o.value=p[0];o.textContent=`${p[0]} — ${p[1]}`;sel.appendChild(o);});});

    /* 記憶功能：還原上次的等級／部件選擇 */
    if(savedFilter){
      const rankInp=root.querySelector('#sub-rank-inp');if(rankInp&&savedFilter.rank)rankInp.value=savedFilter.rank;
      ['hull','stern','bow','bridge'].forEach(slot=>{
        const sel=root.querySelector(`#sub-${slot}`);
        if(sel&&savedFilter[slot]!=null&&sel.querySelector(`option[value="${savedFilter[slot]}"]`))sel.value=savedFilter[slot];
      });
      const strictChk=root.querySelector('#sub-loot-strict');if(strictChk)strictChk.checked=!!savedFilter.lootStrict;
      const meetChk=root.querySelector('#sub-loot-meet');if(meetChk)meetChk.checked=!!savedFilter.lootMustMeet;
      const letterChk=root.querySelector('#sub-letter');if(letterChk)letterChk.checked=!!savedFilter.letterOnly;
    }

    /* ── 路線搜尋的「擁有部件」模式 ──────────────────────────────────
     * 跟下面配裝反查的擁有部件勾選格是同一份資料（ownedParts／OWNED_KEY），
     * 這裡只是另外畫一份勾選格 UI（因為兩邊不會同時顯示，不需要即時雙向同步，
     * 每次切換顯示時重新畫一次、讀取當下的 ownedParts 即可）。 */
    const renderOwnedRouteGrid=()=>{
      const gridEl=root.querySelector('#sub-owned-route-grid');if(!gridEl)return;
      const slotLabel={hull:'船體',stern:'船尾',bow:'船首',bridge:'艦橋'};
      let html='<div class="sub-owned-grid">';
      ['hull','stern','bow','bridge'].forEach(slot=>{
        html+=`<div class="sub-owned-col"><div class="sub-owned-col-title">${slotLabel[slot]}</div>`;
        PARTS[slot].forEach(p=>{
          const rankCode=SUB_RANK_CODE_REV[p[0]];
          const checked=(ownedParts[slot]||[]).includes(rankCode)?'checked':'';
          html+=`<label class="sub-owned-item"><input type="checkbox" data-slot="${slot}" data-rank="${rankCode}" ${checked}> ${p[0]} — ${p[1]}</label>`;
        });
        html+='</div>';
      });
      html+='</div>';
      gridEl.innerHTML=html;
      gridEl.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
        chk.addEventListener('change',()=>{
          const slot=chk.dataset.slot,rk=+chk.dataset.rank;
          const arr=ownedParts[slot]||(ownedParts[slot]=[]);
          const idx=arr.indexOf(rk);
          if(chk.checked&&idx<0)arr.push(rk);else if(!chk.checked&&idx>=0)arr.splice(idx,1);
          saveOwnedParts();
        });
      });
    };
    root.querySelector('#sub-owned-route-all')?.addEventListener('click',()=>{
      ['hull','stern','bow','bridge'].forEach(slot=>{ownedParts[slot]=PARTS[slot].map(p=>SUB_RANK_CODE_REV[p[0]]);});
      saveOwnedParts();renderOwnedRouteGrid();
    });
    root.querySelector('#sub-owned-route-none')?.addEventListener('click',()=>{
      ['hull','stern','bow','bridge'].forEach(slot=>{ownedParts[slot]=[];});
      saveOwnedParts();renderOwnedRouteGrid();
    });
    /* 切換「下拉選單指定單一配裝」／「勾選擁有部件」：只換這塊要顯示什麼，
       等級、篩選條件（必包含目的地、指定收成時間…）等其餘設定都不受影響。 */
    const applyPartsMode=()=>{
      const selRow=root.querySelector('#sub-parts-select-row');
      const ownedBlock=root.querySelector('#sub-owned-route-block');
      const statsBar=root.querySelector('#sub-stats-bar');
      const toggleBtn=root.querySelector('#sub-parts-mode-toggle');
      const isOwned=partsMode==='owned';
      if(selRow)selRow.style.display=isOwned?'none':'';
      if(ownedBlock)ownedBlock.style.display=isOwned?'':'none';
      if(statsBar)statsBar.style.display=isOwned?'none':'';
      if(toggleBtn){toggleBtn.textContent=isOwned?'切換「單一配裝」選項':'切換「擁有部件」選項';}
      if(isOwned)renderOwnedRouteGrid(); // 從配裝反查切回來時，順便同步最新勾選
    };
    root.querySelector('#sub-parts-mode-toggle')?.addEventListener('click',()=>{
      partsMode=partsMode==='owned'?'select':'owned';
      try{localStorage.setItem(PARTS_MODE_KEY,partsMode);}catch(e){}
      applyPartsMode();
    });
    applyPartsMode();

    /* ── 自訂增減按鈕：取代原生 number 輸入框的小箭頭 ──────────────────
     * 原生箭頭太小、樣式也跟網站風格不搭。這裡用兩顆夠大的「－／＋」按鈕
     * 取代，點一下增減一次，按住不放會連續增減；同時保留鍵盤直接輸入數字。
     * wrap:true 表示到達上限/下限時循環（例如小時 23 再 ＋1 會回到 0），
     * 適合時鐘型態的欄位（時、分）；天數、等級則用一般的夾在上下限。 */
    const mkStepper=(input,opts)=>{
      if(!input)return;
      opts=opts||{};
      /* 若這顆輸入框先前已經包過一次（例如切換 12/24 小時制需要換新的
         上下限），先把舊的包裝拆掉，避免重複包兩層。 */
      if(input.parentNode&&input.parentNode.classList&&input.parentNode.classList.contains('sub-stepper')){
        const oldWrap=input.parentNode;
        oldWrap.parentNode.insertBefore(input,oldWrap);
        oldWrap.remove();
      }
      const step=opts.step||1,min=opts.min,max=opts.max,wrapAround=!!opts.wrap;
      input.classList.add('sub-stepper-inp');
      if(opts.wide)input.classList.add('sub-stepper-inp-wide');
      const wrapEl=document.createElement('div');wrapEl.className='sub-stepper';
      input.parentNode.insertBefore(wrapEl,input);
      const dn=document.createElement('button');dn.type='button';dn.className='sub-step-btn sub-step-dn';dn.setAttribute('aria-label','減少');dn.textContent='−';
      const up=document.createElement('button');up.type='button';up.className='sub-step-btn sub-step-up';up.setAttribute('aria-label','增加');up.textContent='＋';
      wrapEl.appendChild(dn);wrapEl.appendChild(input);wrapEl.appendChild(up);
      const apply=dir=>{
        let v=(parseInt(input.value,10)||0)+dir*step;
        if(wrapAround&&min!=null&&max!=null){
          const range=max-min+1;
          v=min+(((v-min)%range)+range)%range;
        }else{
          if(min!=null)v=Math.max(min,v);
          if(max!=null)v=Math.min(max,v);
        }
        input.value=v;
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
      };
      let holdT=null,holdI=null;
      const stopHold=()=>{clearTimeout(holdT);clearInterval(holdI);holdT=null;holdI=null;};
      [[dn,-1],[up,1]].forEach(([btn,dir])=>{
        btn.addEventListener('pointerdown',e=>{
          e.preventDefault();apply(dir);stopHold();
          holdT=setTimeout(()=>{holdI=setInterval(()=>apply(dir),80);},450);
        });
        ['pointerup','pointerleave','pointercancel'].forEach(ev=>btn.addEventListener(ev,stopHold));
      });
    };
    mkStepper(root.querySelector('#sub-rank-inp'),{step:1,min:1,max:145,wide:true});
    mkStepper(root.querySelector('#sub-days'),{step:1,min:0});
    mkStepper(root.querySelector('#sub-hrs'),{step:1,min:0,max:23,wrap:true});
    mkStepper(root.querySelector('#sub-mins'),{step:1,min:0,max:59,wrap:true});
    mkStepper(root.querySelector('#sub-target-min'),{step:1,min:0,max:59,wrap:true});

    /* ── 「指定收成時間」模式 ──────────────────────────────────────────
     * 自訂的「日期＋時＋分」欄位負責直接輸入／點按鈕操作；同時保留原生
     * datetime-local 彈窗（滑動式時間選擇、上下午切換都是瀏覽器內建，尤其
     * 手機上很好用），兩者同步、互不影響：
     *   - trueHour24：內部永遠用 0–23 的「真實時間」為準，是唯一的真相來源。
     *   - hourMode('24'/'12') 與 ampmIsPM 只影響「時」欄位怎麼顯示，
     *     不影響實際運算。
     *   - 📅 按鈕呼叫原生 <input type="datetime-local"> 的 showPicker()
     *     （不支援的瀏覽器會自動隱藏這顆按鈕，不影響其他操作方式）。
     * new Date() 直接讀取使用者本機系統時鐘（含時區），不需要任何權限；
     * 手動組成的 Date 物件同樣是本機時區，兩者基準一致，「目標時間－現在
     * 時間」算出來的分鐘數就是使用者真正剩餘的時間，餵給原本「總時間 ≤
     * 指定時間」的篩選邏輯（useTime/desiredMins）即可，sub-calc.js 完全
     * 不用改。 */
    const durRow=root.querySelector('#sub-dur-row');
    const targetRow=root.querySelector('#sub-target-row');
    const targetDateInp=root.querySelector('#sub-target-date');
    const targetHourInp=root.querySelector('#sub-target-hour');
    const targetMinInp=root.querySelector('#sub-target-min');
    const targetHint=root.querySelector('#sub-target-hint');
    const ampmBtn=root.querySelector('#sub-ampm-btn');
    const hourModeBtn=root.querySelector('#sub-hourmode-btn');
    const pickerBtn=root.querySelector('#sub-target-picker-btn');
    const nativeDt=root.querySelector('#sub-target-native');
    const pad2=n=>String(n).padStart(2,'0');
    const toLocalDT=d=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

    let hourMode='24'; // '24' 或 '12'
    let ampmIsPM=false;
    let trueHour24=new Date().getHours(); // 唯一真相來源，之後會被預設值覆蓋

    const to12=h24=>{const h=h24%12;return h===0?12:h;};
    const isPMof=h24=>h24>=12;
    const to24=(h12,pm)=>{let h=h12%12;if(pm)h+=12;return h;};

    const syncHourDisplay=()=>{
      if(!targetHourInp)return;
      if(hourMode==='24'){
        targetHourInp.value=trueHour24;
      }else{
        targetHourInp.value=to12(trueHour24);
        ampmIsPM=isPMof(trueHour24);
      }
      if(ampmBtn)ampmBtn.textContent=ampmIsPM?'下午':'上午';
    };

    const rebuildHourStepper=()=>{
      if(hourMode==='24')mkStepper(targetHourInp,{step:1,min:0,max:23,wrap:true});
      else mkStepper(targetHourInp,{step:1,min:1,max:12,wrap:true});
    };

    if(targetDateInp){
      const now=new Date();
      const tmr=new Date(now.getTime()+24*3600*1000);
      targetDateInp.min=`${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`; // 擋掉過去的日期
      targetDateInp.value=`${tmr.getFullYear()}-${pad2(tmr.getMonth()+1)}-${pad2(tmr.getDate())}`; // 預設「明天」
      trueHour24=now.getHours(); // 預設帶入「此刻」的時分，等於「明天此刻」
      if(targetMinInp)targetMinInp.value=now.getMinutes();
      if(nativeDt)nativeDt.min=toLocalDT(now);
    }
    rebuildHourStepper();
    syncHourDisplay();

    /* 記憶功能：只還原「剩餘時長」設定，「指定收成時間」是絕對時間點，
       記住了下次打開也會過期，沒有意義，故意不存也不還原，永遠維持預設。 */
    if(savedFilter?.time){
      const t=savedFilter.time;
      if(t.days!=null)root.querySelector('#sub-days').value=t.days;
      if(t.hrs!=null)root.querySelector('#sub-hrs').value=t.hrs;
      if(t.mins!=null)root.querySelector('#sub-mins').value=t.mins;
      const useTimeChk=root.querySelector('#sub-use-time');if(useTimeChk)useTimeChk.checked=!!t.useTime;
    }

    const composeTargetDate=()=>{
      const dv=targetDateInp?.value;if(!dv)return null;
      const[y,mo,da]=dv.split('-').map(Number);
      const mm=parseInt(targetMinInp?.value,10)||0;
      return new Date(y,mo-1,da,trueHour24,mm,0,0);
    };
    const updateTargetHint=()=>{
      if(!targetHint)return;
      const target=composeTargetDate();
      if(!target){targetHint.textContent='';return;}
      const diffMin=Math.round((target-new Date())/60000);
      if(diffMin<=0){targetHint.textContent='⚠ 已經過去';targetHint.classList.add('sub-target-hint-warn');return;}
      targetHint.classList.remove('sub-target-hint-warn');
      const dd=Math.floor(diffMin/1440),hh=Math.floor((diffMin%1440)/60),mm=diffMin%60;
      const parts=[];if(dd)parts.push(dd+'天');if(hh)parts.push(hh+'小時');parts.push(mm+'分');
      targetHint.textContent='距離現在：'+parts.join('');
    };

    /* 「時」欄位輸入：依目前模式（12／24小時制）把畫面上的數字換算回
       trueHour24（唯一真相來源），再更新提示文字。 */
    const onHourInput=()=>{
      const v=parseInt(targetHourInp.value,10)||0;
      if(hourMode==='24')trueHour24=Math.max(0,Math.min(23,v));
      else trueHour24=to24(Math.max(1,Math.min(12,v)),ampmIsPM);
      updateTargetHint();
    };
    targetHourInp?.addEventListener('input',onHourInput);
    [targetDateInp,targetMinInp].forEach(el=>el?.addEventListener('input',updateTargetHint));
    updateTargetHint();

    /* 上午／下午切換：只翻轉真實時間的上下半（±12 小時），畫面上的
       12小時制數字（例如「3」）維持不變，只是變成下午3點。 */
    ampmBtn?.addEventListener('click',()=>{
      ampmIsPM=!ampmIsPM;
      const h12=parseInt(targetHourInp.value,10)||12;
      trueHour24=to24(h12,ampmIsPM);
      syncHourDisplay();
      updateTargetHint();
    });

    /* 12／24小時制切換：轉換目前顯示、重建「時」欄位的步進器範圍
       （24小時制是 0–23，12小時制是 1–12，上下限不同）。 */
    hourModeBtn?.addEventListener('click',()=>{
      hourMode=hourMode==='24'?'12':'24';
      hourModeBtn.textContent=hourMode==='24'?'24小時制':'12小時制';
      if(ampmBtn)ampmBtn.style.display=hourMode==='12'?'':'none';
      rebuildHourStepper();
      syncHourDisplay();
      updateTargetHint();
    });

    /* 📅 原生選擇器：想要滑動式時間選擇、或原生日曆的上下午切換，可以點
       這顆按鈕叫出瀏覽器內建的 datetime-local 選擇器（手機上通常是滾輪式
       時間選擇，體驗很好）。選完之後同步寫回自訂欄位。不支援 showPicker()
       的瀏覽器（例如較舊的桌面版 Safari）會自動隱藏這顆按鈕，不影響其他
       操作方式。
       ★ Firefox 雖然也有 showPicker() API，但彈出的選擇器只管日期，時間
       要在「輸入框本身」用內建小箭頭/打字調整——而我們這顆原生欄位刻意
       做成隱形疊在按鈕上面，Firefox 使用者完全看不到、摸不到那個時間輸入
       介面，體驗是殘缺的（只能選日期）。這是 Firefox 本身跟 Chromium 系
       瀏覽器實作方式不同造成的，沒辦法用 CSS/JS 修正，所以額外判斷排除，
       Firefox 上直接隱藏這顆按鈕，只保留一定完整可用的自訂欄位操作方式。 */
    const isFirefox=/firefox/i.test(navigator.userAgent);
    const supportsShowPicker=nativeDt&&typeof nativeDt.showPicker==='function'&&!isFirefox;
    if(pickerBtn)pickerBtn.style.display=supportsShowPicker?'':'none';
    if(pickerBtn&&nativeDt){
      pickerBtn.addEventListener('click',()=>{
        const t=composeTargetDate();
        if(t)nativeDt.value=toLocalDT(t);
        try{nativeDt.showPicker();}catch(err){console.warn('[XIV] showPicker 失敗：',err);}
      });
      nativeDt.addEventListener('change',()=>{
        if(!nativeDt.value)return;
        const dt=new Date(nativeDt.value);
        if(targetDateInp)targetDateInp.value=`${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
        trueHour24=dt.getHours();
        if(targetMinInp)targetMinInp.value=dt.getMinutes();
        syncHourDisplay();
        updateTargetHint();
      });
    }

    const applyTimeMode=()=>{
      const isTarget=root.querySelector('#sub-time-mode-target')?.checked;
      if(durRow)durRow.style.display=isTarget?'none':'';
      if(targetRow)targetRow.style.display=isTarget?'':'none';
      if(isTarget)updateTargetHint();
    };
    root.querySelectorAll('input[name="sub-time-mode"]').forEach(r=>r.addEventListener('change',applyTimeMode));
    applyTimeMode();

    const updateStats=()=>{
      subRank=parseInt(root.querySelector('#sub-rank-inp')?.value)||1;
      const expEl=root.querySelector('#sub-exp-next');
      if(expEl){
        const expToNext=(SUB_RANKS[subRank]||[])[0];
        expEl.textContent=expToNext?`升到下一級需 ${expToNext.toLocaleString()} 經驗值`:(SUB_RANKS[subRank]?'已達最高等級':'');
      }
      const expBadge=root.querySelector('#sub-exp-badge');
      if(expBadge)expBadge.setAttribute('data-tip',buildLevelTableTip());
      selH=PARTS.hull.find(p=>p[0]===root.querySelector('#sub-hull').value);
      selS=PARTS.stern.find(p=>p[0]===root.querySelector('#sub-stern').value);
      selB=PARTS.bow.find(p=>p[0]===root.querySelector('#sub-bow').value);
      selBr=PARTS.bridge.find(p=>p[0]===root.querySelector('#sub-bridge').value);
      const st=getStats();if(!st)return;
      root.querySelector('#sub-range-disp').textContent=`目前航行距離：${st.rng}`;
      [['sur',2],['ret',3],['spd',4],['rng',5],['fav',6]].forEach(([k])=>{const el=root.querySelector(`#ss-${k}`);if(!el)return;const v=st[k];el.textContent=(v>=0?'+':'')+v;el.className='sub-stat-val '+(v>0?'sv-pos':v<0?'sv-neg':'sv-neu');});
      /* 容量：四個部件的「造價(components)」總和，不能超過目前等級的容量上限
         （官方機制：パーツコストの合計＝＜キャパシティ，潛水艇／飛空艇皆同）。 */
      const capEl=root.querySelector('#ss-cap');
      if(capEl){
        const curCap=[selH,selS,selB,selBr].reduce((s,p)=>s+(p?p[7]:0),0);
        const maxCap=(SUB_CAP[subRank]??'—');
        capEl.textContent=`${curCap}/${maxCap}`;
        capEl.className='sub-stat-val '+(typeof maxCap==='number'&&curCap>maxCap?'sv-neg':'sv-neu');
      }
    };

    const mkSecFilter=(wid,arr)=>{
      const wrap=root.querySelector(`#${wid}`);if(!wrap)return;
      const chips=document.createElement('div');chips.className='sub-chips-display';
      const cw=document.createElement('div');cw.className='sub-combo-wrap';
      const inp=document.createElement('input');inp.type='text';inp.className='sub-combo-inp';inp.placeholder='輸入字母或名稱篩選目的地…';
      const dd=document.createElement('div');dd.className='sub-combo-dd';dd.style.display='none';
      const allOpts=[];
      [...new Set(SUB_SECTORS.map(s=>s[1]))].forEach(m=>{SUB_SECTORS.filter(s=>s[1]===m).forEach(s=>{allOpts.push({val:s[0],label:`${s[2]} — ${s[4]}`,grp:`(${m}) ${MAP_NAMES[m]}`});});});
      const renderDD=q=>{
        dd.innerHTML='';q=(q||'').trim().toLowerCase();let cg='';
        allOpts.forEach(o=>{
          const lo=o.label.toLowerCase(),letter=o.label.split('—')[0].trim().toLowerCase();
          if(q&&!lo.includes(q)&&letter!==q)return;
          if(o.grp!==cg){cg=o.grp;const g=document.createElement('div');g.className='sub-combo-grp';g.textContent=cg;dd.appendChild(g);}
          const it=document.createElement('div');it.className='sub-combo-item'+(arr.includes(o.val)?' selected':'');it.textContent=(arr.includes(o.val)?'✓ ':'')+o.label;
          it.addEventListener('mousedown',e=>{e.preventDefault();const idx=arr.indexOf(o.val);if(idx>=0)arr.splice(idx,1);else arr.push(o.val);inp.value='';rc();renderDD(inp.value);});
          dd.appendChild(it);
        });
        if(!dd.children.length){const em=document.createElement('div');em.className='sub-combo-empty';em.textContent='無符合結果';dd.appendChild(em);}
      };
      inp.addEventListener('focus',()=>{renderDD(inp.value);dd.style.display='block';});
      inp.addEventListener('blur',()=>{setTimeout(()=>{dd.style.display='none';},160);});
      inp.addEventListener('input',()=>{renderDD(inp.value);dd.style.display='block';});
      cw.appendChild(inp);cw.appendChild(dd);
      const rc=()=>{chips.innerHTML='';arr.forEach((id,i)=>{const s=SECTOR_MAP.get(id);if(!s)return;const chip=document.createElement('span');chip.className='sub-chip-tag';chip.textContent=`${s[2]} ${s[4]}`;const rm=document.createElement('span');rm.className='sub-chip-rm';rm.textContent='\xd7';rm.onclick=()=>{arr.splice(i,1);rc();renderDD(inp.value);};chip.appendChild(rm);chips.appendChild(chip);});};
      wrap.appendChild(chips);wrap.appendChild(cw);
      rc();
    }

    const mkMapFilter=(wid,arr)=>{
      const wrap=root.querySelector(`#${wid}`);if(!wrap)return;
      const chips=document.createElement('div');chips.className='sub-chips-display';
      const cw=document.createElement('div');cw.className='sub-combo-wrap';
      const btn=document.createElement('button');btn.type='button';btn.className='sub-map-toggle';btn.textContent='選擇航海圖 ▾';
      const dd=document.createElement('div');dd.className='sub-combo-dd sub-map-dd';dd.style.display='none';
      [...new Set(SUB_SECTORS.map(s=>s[1]))].forEach(m=>{
        const it=document.createElement('div');
        it.className='sub-combo-item'+(arr.includes(m)?' selected':'');
        it.dataset.map=m;
        it.textContent=`(${m}) ${MAP_NAMES[m]}`;
        it.addEventListener('mousedown',e=>{
          e.preventDefault();
          if(arr.includes(m)){const idx=arr.indexOf(m);arr.splice(idx,1);}
          else arr.push(m);
          it.classList.toggle('selected',arr.includes(m));
          rc();
        });
        dd.appendChild(it);
      });
      btn.addEventListener('click',()=>{const open=dd.style.display==='block';dd.style.display=open?'none':'block';btn.textContent='選擇航海圖 '+(open?'▾':'▴');});
      document.addEventListener('click',e=>{if(!cw.contains(e.target)){dd.style.display='none';btn.textContent='選擇航海圖 ▾';}},{passive:true});
      cw.appendChild(btn);cw.appendChild(dd);
      const rc=()=>{
        chips.innerHTML='';
        arr.forEach((m,i)=>{
          const chip=document.createElement('span');chip.className='sub-chip-tag';chip.textContent=MAP_NAMES[m];
          const rm=document.createElement('span');rm.className='sub-chip-rm';rm.textContent='\xd7';
          rm.onclick=()=>{arr.splice(i,1);const it=dd.querySelector(`[data-map="${m}"]`);if(it)it.classList.remove('selected');rc();};
          chip.appendChild(rm);chips.appendChild(chip);
        });
      };
      wrap.appendChild(chips);wrap.appendChild(cw);
      rc();
    }

    const mkLootFilter=(wid,arr,onChange)=>{
      const wrap=root.querySelector(`#${wid}`);if(!wrap)return;
      const chips=document.createElement('div');chips.className='sub-chips-display';
      const cw=document.createElement('div');cw.className='sub-combo-wrap';
      const inp=document.createElement('input');inp.type='text';inp.className='sub-combo-inp';inp.placeholder='輸入物品名稱搜尋…';
      const dd=document.createElement('div');dd.className='sub-combo-dd';dd.style.display='none';
      const allIds=[...new Set(Object.values(SUB_LOOT).flat())];
      const allOpts=allIds.map(id=>({id,name:getName(id),cat:getPickerCategory(id)})).filter(o=>!o.name.startsWith('ID:')).sort((a,b)=>(PICKER_CAT_ORDER[a.cat]-PICKER_CAT_ORDER[b.cat])||a.name.localeCompare(b.name,'zh-TW'));
      const renderDD=q=>{
        dd.innerHTML='';q=(q||'').trim().toLowerCase();let curCat=null;
        allOpts.forEach(o=>{
          if(q&&!o.name.toLowerCase().includes(q))return;
          if(o.cat!==curCat){curCat=o.cat;const g=document.createElement('div');g.className='sub-combo-grp';g.textContent=PICKER_CAT_LABEL[o.cat];dd.appendChild(g);}
          const it=document.createElement('div');it.className='sub-combo-item'+(arr.includes(o.id)?' selected':'');it.textContent=(arr.includes(o.id)?'✓ ':'')+o.name;
          it.addEventListener('mousedown',e=>{e.preventDefault();const idx=arr.indexOf(o.id);if(idx>=0)arr.splice(idx,1);else arr.push(o.id);inp.value='';rc();renderDD(inp.value);});
          dd.appendChild(it);
        });
        if(!dd.children.length){const em=document.createElement('div');em.className='sub-combo-empty';em.textContent='無符合結果';dd.appendChild(em);}
      };
      inp.addEventListener('focus',()=>{renderDD(inp.value);dd.style.display='block';});
      inp.addEventListener('blur',()=>{setTimeout(()=>{dd.style.display='none';},160);});
      inp.addEventListener('input',()=>{renderDD(inp.value);dd.style.display='block';});
      cw.appendChild(inp);cw.appendChild(dd);
      const rc=()=>{chips.innerHTML='';arr.forEach((id,i)=>{const chip=document.createElement('span');chip.className='sub-chip-tag';chip.textContent=getName(id);const rm=document.createElement('span');rm.className='sub-chip-rm';rm.textContent='\xd7';rm.onclick=()=>{arr.splice(i,1);rc();renderDD(inp.value);};chip.appendChild(rm);chips.appendChild(chip);});if(onChange)onChange();};
      wrap.appendChild(chips);wrap.appendChild(cw);
      rc();
    };

    mkSecFilter('sub-inc-wrap',mustInc);mkSecFilter('sub-excl-wrap',mustExcl);
    mkMapFilter('sub-inmap-wrap',mustIncMaps);mkMapFilter('sub-exmap-wrap',mustExclMaps);
    /* 排序依據選單：只有勾了「必須獲得物品」才顯示（沒有目標物品清單，
       「覆蓋幾種／命中幾件」這兩個數字沒有意義），勾選狀態一變動就同步。 */
    const updateLootSortVisibility=()=>{
      const row=root.querySelector('#sub-loot-sort-row');
      if(row)row.style.display=mustLootIds.length?'':'none';
      if(!mustLootIds.length){
        const sel=root.querySelector('#sub-loot-sort');
        if(sel)sel.value='exp';
      }
    };
    mkLootFilter('sub-loot-wrap',mustLootIds,updateLootSortVisibility);
    root.querySelector('#sub-loot-sort')?.addEventListener('change',()=>{
      const sel=root.querySelector('#sub-loot-sort');
      /* 換成物品效率排序時，候選地點池的生成方式整個不一樣（改成「有目標物品」
       * 的地點，不是經驗值前 25 名），沒辦法沿用目前畫面上的結果純前端重排，
       * 需要重新搜尋一次。 */
      sortKey=sel.value==='exp'?'epm':'itemEff';sortDir=-1;
      root.querySelector('#sub-search-btn')?.click();
    });

    /* ── 取得（必要時建立）背景計算用的 Web Worker ──
     * 若瀏覽器不支援 Worker，或 Worker 檔案載入失敗（例如直接用
     * file:// 開啟網頁、沒有經過伺服器），自動退回主執行緒同步計算，
     * 確保搜尋功能在任何情況下都還能用，只是退回原本可能會卡頓的版本。 */
    const ensureSubWorker=()=>{
      if(this._subWorkerFailed)return null;
      if(this._subWorker)return this._subWorker;
      try{
        const w=new Worker('js/sub-worker.js');
        w.addEventListener('error',ev=>{
          console.warn('[XIV] sub_worker 執行失敗，改回主執行緒計算：',ev.message);
          this._subWorkerFailed=true;this._subWorker=null;
        });
        this._subWorker=w;
        return w;
      }catch(err){
        console.warn('[XIV] 瀏覽器不支援 Worker 或載入失敗，改回主執行緒計算：',err);
        this._subWorkerFailed=true;
        return null;
      }
    };

    /* ── 擁有部件模式：按地圖分工的 Worker Pool ──────────────────────
     * 候選路線的「列舉」跟配裝完全無關，只跟地圖有關，所以可以照地圖切開
     * 分給多個 Worker 同時列舉，最後在主執行緒合併，再丟給其中一個 Worker
     * 做「依擁有部件查表」。數量取「CPU 邏輯核心數」與「地圖數」兩者較小值。 */
    const ensureSubWorkerPool=(n)=>{
      if(this._subWorkerPoolFailed)return null;
      if(!this._subWorkerPool)this._subWorkerPool=[];
      while(this._subWorkerPool.length<n){
        try{
          const w=new Worker('js/sub-worker.js');
          w.addEventListener('error',ev=>{
            console.warn('[XIV] sub_worker（平行池）執行失敗，改回單一 Worker 計算：',ev.message);
            this._subWorkerPoolFailed=true;
          });
          this._subWorkerPool.push(w);
        }catch(err){
          console.warn('[XIV] 瀏覽器不支援 Worker 或載入失敗，改回單一 Worker 計算：',err);
          this._subWorkerPoolFailed=true;
          return null;
        }
      }
      return this._subWorkerPool.slice(0,n);
    };

    const doSearch=()=>{
      const owned=partsMode==='owned';
      let st=null;
      if(!owned){
        st=getStats();if(!st){root.querySelector('#sub-results').innerHTML='<div class="sub-empty">請先選擇所有部件</div>';return;}
      }else{
        const hasAll=['hull','stern','bow','bridge'].every(slot=>(ownedParts[slot]||[]).length>0);
        if(!hasAll){root.querySelector('#sub-results').innerHTML='<div class="sub-empty">請至少為每個部位（船體／船尾／船首／艦橋）勾選一種擁有的部件</div>';return;}
      }
      letterOnly=root.querySelector('#sub-letter')?.checked||false;
      const lootStrict=root.querySelector('#sub-loot-strict')?.checked||false;
      const lootMustMeet=root.querySelector('#sub-loot-meet')?.checked||false;
      const res=root.querySelector('#sub-results');

      const timeMode=root.querySelector('#sub-time-mode-target')?.checked?'target':'dur';
      if(timeMode==='target'){
        const target=composeTargetDate();
        if(!target){res.innerHTML='<div class="sub-empty">請先選擇想收成的日期與時間</div>';return;}
        const diffMin=Math.round((target-new Date())/60000);
        if(diffMin<=0){res.innerHTML='<div class="sub-empty">指定的收成時間已經過去，請重新選擇</div>';return;}
        desiredMins=diffMin;useTime=true;
      }else{
        useTime=root.querySelector('#sub-use-time')?.checked||false;
        const d=parseInt(root.querySelector('#sub-days')?.value)||0,h=parseInt(root.querySelector('#sub-hrs')?.value)||0,m=parseInt(root.querySelector('#sub-mins')?.value)||0;
        desiredMins=d*1440+h*60+m;
      }

      res.innerHTML='<div class="sub-empty">⋯ 計算中，請稍候</div>';

      const TIER_LABEL={1:'T1',2:'T2',3:'T3'};

      /* 依目前配置(curStats)判斷某個 tier 在某個目的地是否算「達標」。
         T1 一律算達標（隨時拿得到）；T2/T3 比對該目的地的探索性能門檻(sec[10]/sec[11])。 */
      const tierMetAt=(sec,tier,curStats)=>{
        if(tier===1)return true;
        if(tier===2)return curStats.sur>=sec[10];
        return curStats.sur>=sec[11];
      };

      /* 把整條路線（可能多個目的地）的物品，依「每個實際出現的 tier」分組。
         同一物品若在路線上不同目的地分別屬於不同 tier（例如 A 地 T3、B 地 T2），
         兩邊都會各自列出，不會只顯示較低的那個、把較高的隱藏掉；
         sources 記錄每個 tier 各自的來源目的地與門檻，供 tooltip 顯示。 */
      const buildLootDetail=(secIds)=>{
        const detail={};
        secIds.forEach(id=>{
          const sec=SECTOR_MAP.get(id);
          const tierData=SUB_LOOT_TIER[id];
          if(!sec||!tierData)return;
          [1,2,3].forEach(t=>{
            (tierData[t]||[]).forEach(itemId=>{
              if(!detail[itemId])detail[itemId]={1:[],2:[],3:[]};
              detail[itemId][t].push({id,letter:sec[2],name:sec[4],tier:t});
            });
          });
        });
        return detail;
      };

      /* 組出「合併後的 T1/T2/T3 物品清單」HTML：每層最多顯示 MAX_SHOW 項，
         超過的用「...等N種」收起來（滑鼠移過去看完整清單），避免一條路線物品
         一多，整行就被撐得很長。達標的物品正常顯示，未達標的變淺色；每個
         物品滑鼠移過去（或點一下）顯示來源目的地與門檻細節。 */
      const buildLootCell=(secIds,curStats)=>{
        const detail=buildLootDetail(secIds);
        const groups={1:[],2:[],3:[]};
        Object.entries(detail).forEach(([idStr,tiers])=>{
          const id=+idStr;const name=getName(id);
          if(name.startsWith('ID:'))return;
          [1,2,3].forEach(t=>{
            if(tiers[t].length){
              const met=t===1||tiers[t].some(s=>tierMetAt(SECTOR_MAP.get(s.id),t,curStats));
              groups[t].push({id,name,sources:tiers[t],met,cat:getItemCategory(id)});
            }
          });
        });
        /* 排序規則：先看有沒有達標（達標的在前，拿不到的變暗排最後），
           再依分類重要性排：設計圖材料 > 稀有物品 > 一般材料 > 魔晶石，
           同分類再依名稱排序。CAT_ORDER 用最上面共用那份，跟篩選清單同一套。 */
        [1,2,3].forEach(t=>groups[t].sort((a,b)=>
          (a.met===b.met?0:(a.met?-1:1))||
          (CAT_ORDER[a.cat]-CAT_ORDER[b.cat])||
          a.name.localeCompare(b.name,'zh-TW')
        ));
        const MAX_SHOW=4;
        let html='';
        [1,2,3].forEach(t=>{
          const items=groups[t];
          if(!items.length)return;
          const mkItem=it=>{
            const met=it.met;
            /* T1 沒有門檻可比對，但一樣給來源清單當作資訊，這樣每個物品
               不管哪個 tier，點下去都會有反應，不會讓人以為壞了。 */
            const tip='來源：\n'+it.sources.map(s=>{
              const sec=SECTOR_MAP.get(s.id);
              if(t===1)return `${s.letter} ${s.name}`;
              const thr=t===2?sec[10]:sec[11];
              return `${s.letter} ${s.name}（探索性能需≥${thr}）`;
            }).join('\n');
            return `<span class="loot-item${met?'':' loot-unmet'} ${lootCatClass(it.id,t)}" data-tip="${tip}">${it.name}</span>`;
          };
          const shown=items.slice(0,MAX_SHOW);
          const rest=items.slice(MAX_SHOW);
          let itemHtml=shown.map(mkItem).join('、');
          if(rest.length){
            /* 「等N種」不再是純文字彈窗，而是一個展開/收合按鈕：點下去把剩下
               的物品用同一套 mkItem 展開成真正可點擊、有達標判斷的物品，
               再點一次收回去。 */
            lootToggleSeq++;
            const gid='loot-ext-'+lootToggleSeq;
            const restHtml=rest.map(mkItem).join('、');
            itemHtml+=`<span class="loot-toggle" data-target="${gid}" data-total="${items.length}">　⋯等${items.length}種</span>`+
              `<span class="loot-extra" id="${gid}" style="display:none">、${restHtml}</span>`;
          }
          html+=`<div class="loot-tier-row loot-tier-${t}"><span class="loot-tier-badge">${TIER_LABEL[t]}</span><span class="loot-tier-items">${itemHtml}</span></div>`;
        });
        return html||'<span class="loot-empty">—</span>';
      };

      /* 組出目的地門檻列：每個目的地一個字母＋三個小圓點（探索／收集／恩惠），
         圓點顏色代表達標程度，數字細節收進整塊的 tooltip 裡，滑鼠移過去
         （或手機點一下）才看到完整數字，平常只佔很小的空間、不會把欄位撐寬。 */
      const buildThresholdStrip=(secIds,curStats)=>secIds.map(id=>{
        const sec=SECTOR_MAP.get(id);if(!sec)return'';
        const favor=sec[9],t2=sec[10],t3=sec[11],normal=sec[12],optimal=sec[13];
        const survCls=curStats.sur>=t3?'thr-full':curStats.sur>=t2?'thr-part':'thr-none';
        const retCls=curStats.ret>=optimal?'thr-full':curStats.ret>=normal?'thr-part':'thr-none';
        const favCls=curStats.fav>=favor?'thr-full':'thr-none';
        const tip=`${sec[2]} ${sec[4]}\n👁 探索性能需 T2 ${t2}／T3 ${t3}（你目前 ${curStats.sur}）\n`+
          `⚓ 收集性能需一般 ${normal}／最佳 ${optimal}（你目前 ${curStats.ret}）\n`+
          `🍀 恩惠需 ${favor}（你目前 ${curStats.fav}）`;
        return `<span class="thr-stop" data-tip="${tip}"><b class="thr-letter">${sec[2]}</b>`+
          `<i class="thr-dot ${survCls}"></i><i class="thr-dot ${retCls}"></i><i class="thr-dot ${favCls}"></i>`+
        `</span>`;
      }).join('');

      renderRoutes=(routes)=>{
        currentRoutes=routes; // 記住這次搜尋結果，供之後點表頭排序重用，不必重新計算
        // sub-letter: full-mode + letterOnly checkbox → show .sec-ltr instead of .sec-full
        // sub-compact handles its own display separately; clear sub-letter in compact mode
        mogship.classList.toggle('sub-letter', letterOnly && !mogship.classList.contains('sub-compact'));
        if(!routes.length){res.innerHTML='<div class="sub-empty">未找到符合條件的路線</div>';return;}

        /* 目前配置的探索/收集/恩惠數值，供「單一配裝」模式整批路線共用；
           「擁有部件」模式下每條路線可能用不同組合跑出來，改用該列自己
           r.build.st 的數值（在 mkRow 內判斷）。 */
        const st=getStats();
        const curStats=st?{sur:st.sur,ret:st.ret,fav:st.fav}:{sur:0,ret:0,fav:0};
        const hasBuild=routes.some(r=>r.build);

        /* 「排序依據」＝物品覆蓋／件數效率時，幫每條路線多算兩個數字：
           覆蓋種類數（不重複，湊齊優先）、命中件數（可重複累計，拿越多越好），
           除以耗時得到效率；沒有勾必須獲得物品時這個下拉選單本來就會被隱藏，
           不會跑到這段。 */
        const lootSortSel=root.querySelector('#sub-loot-sort');
        const lootSortMode=(mustLootIds.length&&lootSortSel)?lootSortSel.value:'exp';
        const showItemEff=lootSortMode!=='exp';
        if(showItemEff){
          routes.forEach(r=>{
            const rowStats=r.build?{sur:r.build.st.sur,ret:r.build.st.ret,fav:r.build.st.fav}:curStats;
            let count=0;const covered=new Set();
            r.secIds.forEach(id=>{
              const avail=subLootAvailableAt(id,rowStats,lootMustMeet);
              mustLootIds.forEach(iid=>{if(avail.includes(iid)){count++;covered.add(iid);}});
            });
            r.itemCoverage=covered.size;r.itemCount=count;
            r.itemEff=(lootSortMode==='coverage'?covered.size:count)/(r.timeMins/60);
          });
        }

        /* 依目前 sortKey / sortDir 排序（複製陣列，不改動原始 routes 順序） */
        const prop=SORT_PROP[sortKey]||'epm';
        const sorted=[...routes].sort((a,b)=>sortDir*(a[prop]-b[prop]));

        const buildCell=r=>{
          if(!r.build)return'';
          const b=r.build;
          const tip=`船體：${b.hull[1]}\n船尾：${b.stern[1]}\n船首：${b.bow[1]}\n艦橋：${b.bridge[1]}\n承載力：${b.cost}/${b.cap??'—'}`;
          return `<td data-col="build" class="sub-build-cell"><span data-tip="${tip}">${b.hull[0]}／${b.stern[0]}／${b.bow[0]}／${b.bridge[0]}</span></td>`;
        };

        const BATCH=50;let shown=0;
        const mkRow=r=>{
          const rowStats=r.build?{sur:r.build.st.sur,ret:r.build.st.ret,fav:r.build.st.fav}:curStats;
          const lootHtml=buildLootCell(r.secIds,rowStats);
          const thrHtml=buildThresholdStrip(r.secIds,rowStats);
          const midCols=showItemEff
            ?`<td data-col="itemEff" class="sub-item-eff-cell" data-tip="覆蓋 ${r.itemCoverage}/${mustLootIds.length} 種\n命中 ${r.itemCount} 件\n耗時 ${r.timeStr}">${r.itemEff.toFixed(2)}／時</td><td data-col="tank">${r.tank}</td>`
            :`<td data-col="dist">${r.range}</td><td data-col="tank">${r.tank}</td><td data-col="count">${r.secCount}</td>`;
          return `<tr><td data-col="rank">${r.minRank}</td><td data-col="exp">${r.exp.toLocaleString()}</td><td data-col="time">${r.timeStr}</td><td data-col="epm" class="epm-val">${r.epm.toLocaleString()}</td>${midCols}<td data-col="map">${r.mapStr}</td><td data-col="sec" class="sec-path"><span class="sec-full">${r.secStr}</span><span class="sec-ltr">${r.secLetters||''}</span><div class="sub-thr-strip">${thrHtml}</div></td><td data-col="loot" class="loot-cell-tiered">${lootHtml}</td>${buildCell(r)}</tr>`;
        };

        /* 可排序欄位（經驗值／時間／EXP每分）表頭：目前排序中的欄位顯示 ↓／↑ 箭頭與亮色，
           其餘欄位維持原樣。標記 sub-sort-th 讓 CSS 顯示可點擊樣式並綁定 click 事件。 */
        const thCell=(col,label)=>{
          if(!SORT_PROP[col])return `<th data-col="${col}">${label}</th>`;
          const active=sortKey===col;
          const arrow=active?(sortDir===-1?'↓':'↑'):'';
          return `<th data-col="${col}" class="sub-sort-th${active?' sorted':''}">${label}${arrow?' '+arrow:''}</th>`;
        };

        const firstBatch=sorted.slice(0,BATCH);shown=firstBatch.length;
        const legendHtml=`<div class="sub-legend">`+
          `<span class="sub-legend-title">備註</span>`+
          `<span><b class="loot-tier-badge tier-badge-1">T1</b> 一般</span>`+
          `<span><b class="loot-tier-badge tier-badge-2">T2</b> 需探索性能達標</span>`+
          `<span><b class="loot-tier-badge tier-badge-3">T3</b> 需探索性能達最佳</span>`+
          `<span class="sub-legend-sep">淺色字＝尚未達標</span>`+
          `<span class="sub-legend-sep">物品顏色：<b class="cat-blueprint">設計圖材料</b>　<b class="cat-rare3">更稀有物品</b>　<b class="cat-rare2">稀有物品</b>　<b class="cat-general">一般材料</b>　<b class="cat-materia">魔晶石</b></span>`+
          `<span class="sub-legend-sep">圓點（探索／收集／恩惠）：<i class="thr-dot thr-full"></i>最佳（實心）　<i class="thr-dot thr-part"></i>達標（半圓）　<i class="thr-dot thr-none"></i>未達標（空心）</span>`+
          `<span class="sub-legend-sep">點擊物品名稱或圓點可查看完整資訊</span>`+
          (showItemEff?`<span class="sub-legend-sep">物品效率＝${lootSortMode==='coverage'?'覆蓋種類數（不重複）':'命中件數（可重複累計）'}÷耗時，點欄位可查看該路線的明細</span>`:'')+
        `</div>`;
        let html=legendHtml+`<div class="sub-scroll-hint">← 左右滑動查看全部欄位 →</div><table class="sub-table"><thead><tr>`+
          thCell('rank','等級')+
          thCell('exp',SORT_LABEL.exp)+
          thCell('time',SORT_LABEL.time)+
          thCell('epm',SORT_LABEL.epm)+
          (showItemEff?thCell('itemEff',lootSortMode==='coverage'?'物品覆蓋效率':'物品數量效率'):thCell('dist','距離消耗'))+
          thCell('tank','燃料需求')+
          (showItemEff?'':thCell('count','目的地數'))+
          thCell('map','航海圖')+
          thCell('sec','目的地')+
          thCell('loot','獲得物品')+
          (hasBuild?thCell('build','建議配裝'):'')+
          `</tr></thead><tbody>`;
        firstBatch.forEach(r=>{html+=mkRow(r);});html+='</tbody></table>';
        res.innerHTML=html;

        /* 點表頭切換排序：同一欄再點一次→反轉方向；點別欄→切到該欄，預設由大到小。
           純前端重排 currentRoutes，不重新呼叫 worker。 */
        res.querySelectorAll('th.sub-sort-th').forEach(th=>{
          th.addEventListener('click',()=>{
            const col=th.dataset.col;
            if(sortKey===col)sortDir=-sortDir;else{sortKey=col;sortDir=-1;}
            renderRoutes(currentRoutes);
          });
        });

        if(sorted.length>shown){
          const moreBtn=document.createElement('button');
          moreBtn.className='sub-more-btn';
          moreBtn.textContent=`顯示更多（已顯示 ${shown} ／ 共 ${sorted.length} 筆）`;
          moreBtn.onclick=()=>{
            const tbody=res.querySelector('tbody');
            const next=sorted.slice(shown,shown+BATCH);
            next.forEach(r=>{tbody.insertAdjacentHTML('beforeend',mkRow(r));});
            shown+=next.length;
            if(shown>=sorted.length)moreBtn.remove();
            else moreBtn.textContent=`顯示更多（已顯示 ${shown} ／ 共 ${sorted.length} 筆）`;
          };
          res.appendChild(moreBtn);
        }
      };

      const handleOwnedResult=(result)=>{
        if(result.noParts){res.innerHTML='<div class="sub-empty">目前擁有的部件組合不出任何符合承載力上限的配裝，請確認勾選或調整等級</div>';return;}
        renderRoutes(result.routes);
        if(result.capped){
          const note=document.createElement('div');
          note.className='sub-owned-capped-note';
          note.textContent=`你擁有的部件組合出 ${result.totalCount} 組配裝，開了「獲得物品門檻」時無法用捷徑加速比對，數量太多會實際上跑不完，因此只搜尋其中巡航速度最高的 ${result.searchedCount} 組（結果可能不是完全窮舉）。若想縮小範圍，可以取消勾選一些較舊/較少用的部件。`;
          res.prepend(note);
        }
      };
      const lootTier=owned?(root.querySelector('#sub-owned-tier')?.value||'none'):'none';
      const lootSortSel=root.querySelector('#sub-loot-sort');
      const lootSortMode=(mustLootIds.length&&lootSortSel)?lootSortSel.value:'exp';

      const runOnMainThread=()=>{
        setTimeout(()=>{
          if(owned){
            if(lootSortMode!=='exp'){
              handleOwnedResult(subFindRoutesForOwnedPartsByLoot(subRank,ownedParts,mustInc,mustExcl,mustIncMaps,mustExclMaps,mustLootIds,desiredMins,useTime,lootStrict,lootTier,lootMustMeet));
            }else{
              handleOwnedResult(subFindRoutesForOwnedParts(subRank,ownedParts,mustInc,mustExcl,mustIncMaps,mustExclMaps,mustLootIds,desiredMins,useTime,letterOnly,lootStrict,lootTier,lootMustMeet));
            }
          }else{
            if(lootSortMode!=='exp'){
              renderRoutes(subFindRoutesByLoot(subRank,st,mustInc,mustExcl,mustIncMaps,mustExclMaps,mustLootIds,desiredMins,useTime,lootStrict,lootMustMeet));
            }else{
              renderRoutes(subFindRoutes(subRank,st,mustInc,mustExcl,mustIncMaps,mustExclMaps,mustLootIds,desiredMins,useTime,letterOnly,lootStrict,lootMustMeet));
            }
          }
        },50);
      };

      /* 「排序依據」選了物品覆蓋／件數效率：候選地點池改用「有目標物品」的
       * 地點（見 sub-calc.js 的說明），通常比經驗值前 25 名還小，不需要
       * 地圖分工平行化，單一 Worker 就夠快，跟 EXP 效率模式分開處理。 */
      if(owned&&lootSortMode!=='exp'){
        const worker=ensureSubWorker();
        if(!worker){runOnMainThread();return;}
        const reqId=(this._subReqId=(this._subReqId||0)+1);
        const onMsg=(ev)=>{
          if(ev.data?.reqId!==reqId)return;
          worker.removeEventListener('message',onMsg);
          if(ev.data.ok)handleOwnedResult({routes:ev.data.routes,noParts:ev.data.noParts,capped:ev.data.capped,totalCount:ev.data.totalCount,searchedCount:ev.data.searchedCount});
          else{console.warn('[XIV] worker 計算發生錯誤，改回主執行緒計算：',ev.data.error);runOnMainThread();}
        };
        worker.addEventListener('message',onMsg);
        worker.postMessage({reqId,mode:'ownedByLoot',rank:subRank,ownedParts,mustInc,mustExcl,mustIncMaps,mustExclMaps,mustLootIds,desiredMins,useTime,lootStrict,lootTier,lootMustMeet});
        return;
      }

      /* 擁有部件模式（EXP 效率，預設）：候選路線的「列舉」跟配裝無關、只跟
       * 地圖有關，可以照地圖切開分給多個 Worker 平行列舉；列完在主執行緒
       * 合併，再丟給一個 Worker 做「依擁有部件查表」。地圖數只有 1 張時
       * （或平行池不可用時）沒有東西好切，直接走單一 Worker 全流程即可。 */
      if(owned){
        const mapIds=subEligibleMapIds(mustIncMaps,mustExclMaps);
        const n=Math.max(1,Math.min(navigator.hardwareConcurrency||4,6,mapIds.length));
        const pool=n>1?ensureSubWorkerPool(n):null;
        if(!pool||mapIds.length<=1){
          const worker=ensureSubWorker();
          if(!worker){runOnMainThread();return;}
          const reqId=(this._subReqId=(this._subReqId||0)+1);
          const onMsg=(ev)=>{
            if(ev.data?.reqId!==reqId)return;
            worker.removeEventListener('message',onMsg);
            if(ev.data.ok)handleOwnedResult({routes:ev.data.routes,noParts:ev.data.noParts,capped:ev.data.capped,totalCount:ev.data.totalCount,searchedCount:ev.data.searchedCount});
            else{console.warn('[XIV] worker 計算發生錯誤，改回主執行緒計算：',ev.data.error);runOnMainThread();}
          };
          worker.addEventListener('message',onMsg);
          worker.postMessage({reqId,mode:'owned',rank:subRank,ownedParts,mustInc,mustExcl,mustIncMaps,mustExclMaps,mustLootIds,desiredMins,useTime,letterOnly,lootStrict,lootTier,lootMustMeet});
          return;
        }
        const chunks=Array.from({length:pool.length},()=>[]);
        mapIds.forEach((id,i)=>chunks[i%pool.length].push(id));
        const enumReqId=(this._subReqId=(this._subReqId||0)+1);
        let pending=chunks.filter(c=>c.length).length,hadError=false;const allCandidates=[];
        const evaluate=()=>{
          const evalWorker=pool[0];
          const evalReqId=(this._subReqId=(this._subReqId||0)+1);
          const onEval=(ev)=>{
            if(ev.data?.reqId!==evalReqId)return;
            evalWorker.removeEventListener('message',onEval);
            if(ev.data.ok)handleOwnedResult({routes:ev.data.routes,noParts:ev.data.noParts,capped:ev.data.capped,totalCount:ev.data.totalCount,searchedCount:ev.data.searchedCount});
            else{console.warn('[XIV] worker（查表）計算發生錯誤，改回主執行緒計算：',ev.data.error);runOnMainThread();}
          };
          evalWorker.addEventListener('message',onEval);
          evalWorker.postMessage({reqId:evalReqId,mode:'ownedEvaluate',rank:subRank,candidates:allCandidates,ownedParts,mustLootIds,desiredMins,useTime,lootStrict,lootTier,lootMustMeet});
        };
        pool.forEach((w,idx)=>{
          if(!chunks[idx].length)return;
          const onMsg=(ev)=>{
            if(ev.data?.reqId!==enumReqId)return;
            w.removeEventListener('message',onMsg);
            if(hadError)return;
            if(ev.data.ok){
              allCandidates.push(...ev.data.candidates);
              pending--;if(pending===0)evaluate();
            }else{
              hadError=true;
              console.warn('[XIV] worker（平行池）計算發生錯誤，改回主執行緒計算：',ev.data.error);
              runOnMainThread();
            }
          };
          w.addEventListener('message',onMsg);
          w.postMessage({reqId:enumReqId,mode:'ownedEnumerateMap',rank:subRank,mustInc,mustExcl,mustIncMaps,mustExclMaps,mapIds:chunks[idx]});
        });
        return;
      }

      const worker=ensureSubWorker();
      if(!worker){runOnMainThread();return;}

      /* reqId：避免使用者連續快速按搜尋時，舊的計算結果晚回來反而蓋掉新結果 */
      const reqId=(this._subReqId=(this._subReqId||0)+1);
      const onMsg=(ev)=>{
        if(ev.data?.reqId!==reqId)return;
        worker.removeEventListener('message',onMsg);
        if(ev.data.ok){
          renderRoutes(ev.data.routes);
        }else{
          console.warn('[XIV] worker 計算發生錯誤，改回主執行緒計算：',ev.data.error);
          runOnMainThread();
        }
      };
      worker.addEventListener('message',onMsg);
      worker.postMessage(lootSortMode!=='exp'
        ?{reqId,mode:'selectByLoot',rank:subRank,stats:st,mustInc,mustExcl,mustIncMaps,mustExclMaps,mustLootIds,desiredMins,useTime,lootStrict,lootMustMeet}
        :{reqId,mode:'select',rank:subRank,stats:st,mustInc,mustExcl,mustIncMaps,mustExclMaps,mustLootIds,desiredMins,useTime,letterOnly,lootStrict,lootMustMeet});
    };

    root.querySelector('#sub-rank-inp')?.addEventListener('input',updateStats);
    ['sub-hull','sub-stern','sub-bow','sub-bridge'].forEach(id=>root.querySelector(`#${id}`)?.addEventListener('change',updateStats));
    const saveFilterState=()=>{
      try{
        localStorage.setItem(FILTER_KEY,JSON.stringify({
          rank:subRank,
          hull:root.querySelector('#sub-hull')?.value,
          stern:root.querySelector('#sub-stern')?.value,
          bow:root.querySelector('#sub-bow')?.value,
          bridge:root.querySelector('#sub-bridge')?.value,
          mustInc,mustExcl,mustIncMaps,mustExclMaps,mustLootIds,
          lootStrict:root.querySelector('#sub-loot-strict')?.checked||false,
          lootMustMeet:root.querySelector('#sub-loot-meet')?.checked||false,
          letterOnly,
          time:{
            days:root.querySelector('#sub-days')?.value,
            hrs:root.querySelector('#sub-hrs')?.value,
            mins:root.querySelector('#sub-mins')?.value,
            useTime:root.querySelector('#sub-use-time')?.checked||false,
          },
        }));
      }catch(e){}
    };

    root.querySelector('#sub-search-btn')?.addEventListener('click',()=>{doSearch();saveFilterState();});
    root.querySelector('#sub-clear-btn')?.addEventListener('click',()=>{
      [mustInc,mustExcl,mustIncMaps,mustExclMaps,mustLootIds].forEach(a=>a.length=0);
      root.querySelectorAll('.sub-chips-display').forEach(c=>c.innerHTML='');
      root.querySelectorAll('.sub-map-dd .sub-combo-item').forEach(it=>{it.classList.remove('selected');});
      root.querySelectorAll('.sub-map-toggle').forEach(t=>{t.textContent='選擇航海圖 ▾';});
      root.querySelectorAll('.sub-map-dd').forEach(d=>{d.style.display='none';});
      const strictChk=root.querySelector('#sub-loot-strict');if(strictChk)strictChk.checked=false;
      const meetChk2=root.querySelector('#sub-loot-meet');if(meetChk2)meetChk2.checked=false;
      const letterChk=root.querySelector('#sub-letter');if(letterChk)letterChk.checked=false;
      letterOnly=false;
      saveFilterState();
    });
    /* ── 精簡/完整 視圖切換 ── */
    const mogship=root.querySelector('.sub-mogship');
    const viewToggle=root.querySelector('#sub-view-toggle');
    const filtersHdr=root.querySelector('#sub-filters-hdr');
    const filtersPanel=root.querySelector('#sub-filters-panel');

    /* ── 探索地圖彈窗 ──────────────────────────────────────────
     * 純粹給玩家對照參考的航海圖圖片，跟搜尋結果無關。掛在 document.body
     * 底下（不放進 root 容器），避免被 tool-layout 的 overflow-y:auto 裁切；
     * 淡入＋縮放動畫沿用 .scene 場景切換那條 cubic-bezier 緩動曲線。
     * 用 document.querySelector 檢查是否已存在，避免切換選單重新渲染時
     * 疊出第二個彈窗。 */
    const SUB_MAPS=[
      {key:'deepsea',label:'溺沒海',file:'assets/maps/map-sub-deepsea.jpg'},
      {key:'ash',label:'灰海',file:'assets/maps/map-sub-ash.jpg'},
      {key:'jade',label:'翠浪海',file:'assets/maps/map-sub-jade.jpg'},
      {key:'siren',label:'賽蓮海',file:'assets/maps/map-sub-siren.jpg'},
      {key:'lilac',label:'紫礁海',file:'assets/maps/map-sub-lilac.jpg'},
      {key:'indigo',label:'南蒼茫洋',file:'assets/maps/map-sub-indigo.jpg'},
      {key:'north',label:'北洋',file:'assets/maps/map-sub-north.jpg'},
    ];
    let mapModalEl=document.querySelector('.map-modal-overlay');
    if(!mapModalEl){
      mapModalEl=document.createElement('div');
      mapModalEl.className='map-modal-overlay';
      mapModalEl.innerHTML='<div class="map-modal"><div class="map-modal-inner">'
        +'<div class="map-modal-head"><span class="map-modal-title">探索地圖</span><span class="map-modal-close" role="button" aria-label="關閉">✕</span></div>'
        +'<div class="map-modal-tabs"></div>'
        +'<div class="map-modal-body"><img class="map-modal-img"><div class="map-modal-caption"></div></div>'
        +'</div></div>';
      document.body.appendChild(mapModalEl);
      const closeMapModal=()=>mapModalEl.classList.remove('active');
      mapModalEl.addEventListener('click',e=>{if(e.target===mapModalEl)closeMapModal();});
      mapModalEl.querySelector('.map-modal-close').addEventListener('click',closeMapModal);
      document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMapModal();});
      mapModalEl._close=closeMapModal;
    }
    const openMapModal=(maps,title)=>{
      mapModalEl.querySelector('.map-modal-title').textContent=title;
      const tabsWrap=mapModalEl.querySelector('.map-modal-tabs');
      tabsWrap.innerHTML='';
      tabsWrap.style.display=maps.length>1?'flex':'none';
      const img=mapModalEl.querySelector('.map-modal-img');
      const cap=mapModalEl.querySelector('.map-modal-caption');
      const show=m=>{
        img.classList.remove('loaded');
        img.onload=()=>img.classList.add('loaded');
        img.src=m.file;img.alt=m.label;cap.textContent=m.label;
        tabsWrap.querySelectorAll('.map-modal-tab').forEach(t=>t.classList.toggle('active',t.dataset.key===m.key));
      };
      maps.forEach(m=>{
        const b=document.createElement('div');b.className='map-modal-tab';b.textContent=m.label;b.dataset.key=m.key;
        b.addEventListener('click',()=>show(m));
        tabsWrap.appendChild(b);
      });
      show(maps[0]);
      mapModalEl.classList.add('active');
    };
    const mapBtn=root.querySelector('#sub-map-btn');
    if(mapBtn)mapBtn.addEventListener('click',()=>openMapModal(SUB_MAPS,'潛水艇 · 探索地圖'));

    const setCompact=(compact)=>{
      mogship.classList.toggle('sub-compact',compact);
      mogship.classList.remove('sub-letter'); // clear on any mode switch; re-applied by renderRoutes after next search
      viewToggle.textContent=compact?'切換為完整模式':'切換為精簡模式';
      filtersPanel.classList.toggle('sub-filters-open',!compact);
      filtersHdr.textContent=(filtersPanel.classList.contains('sub-filters-open')?'▾':'▸')+' 篩選條件';
      const letterChk=root.querySelector('#sub-letter');
      if(letterChk) letterChk.checked=compact;
      try{localStorage.setItem('xiv-sub-compact',compact?'1':'0');}catch(e){}
    };
    let _sc='0';try{_sc=localStorage.getItem('xiv-sub-compact')||'0';}catch(e){}
    setCompact(_sc==='1');
    viewToggle?.addEventListener('click',()=>setCompact(!mogship.classList.contains('sub-compact')));
    filtersHdr?.addEventListener('click',()=>{
      filtersPanel.classList.toggle('sub-filters-open');
      filtersHdr.textContent=(filtersPanel.classList.contains('sub-filters-open')?'▾':'▸')+' 篩選條件';
    });
    updateStats();

    /* ===== 配裝反查（路線搜尋 ⇄ 配裝反查 模式切換）=====
       OWNED_KEY／ownedParts／saveOwnedParts 已搬到檔案最上面共用，這裡不再重複宣告。 */
    const revPanel=root.querySelector('#sub-reverse-panel');

    const buildReversePanel=()=>{
      const slotLabel={hull:'船體',stern:'船尾',bow:'船首',bridge:'艦橋'};
      let ownedHtml='<div class="sub-owned-grid">';
      ['hull','stern','bow','bridge'].forEach(slot=>{
        ownedHtml+=`<div class="sub-owned-col"><div class="sub-owned-col-title">${slotLabel[slot]}</div>`;
        PARTS[slot].forEach(p=>{
          const rankCode=SUB_RANK_CODE_REV[p[0]];
          const checked=(ownedParts[slot]||[]).includes(rankCode)?'checked':'';
          ownedHtml+=`<label class="sub-owned-item"><input type="checkbox" data-slot="${slot}" data-rank="${rankCode}" ${checked}> ${p[0]} — ${p[1]}</label>`;
        });
        ownedHtml+='</div>';
      });
      ownedHtml+='</div>';

      revPanel.innerHTML=`<div class="sub-rev-row">
    <label class="sub-chk-lbl"><input type="radio" name="sub-rev-kind" id="sub-rev-kind-dest" checked> 指定目的地</label>
    <label class="sub-chk-lbl"><input type="radio" name="sub-rev-kind" id="sub-rev-kind-item"> 指定物品</label>
    <label class="sub-chk-lbl"><input type="radio" name="sub-rev-kind" id="sub-rev-kind-stat"> 自行輸入需求值</label>
  </div>
  <div class="sub-rev-row">
    <label class="sub-lbl" for="sub-rev-rank">等級</label><input type="number" id="sub-rev-rank" class="sub-inp" value="1" min="1" max="145">
  </div>
  <div id="sub-rev-dest-block">
    <div class="sub-rev-row">
      <label class="sub-chk-lbl"><input type="radio" name="sub-rev-target-mode" id="sub-rev-mode-single" checked> 單一目的地</label>
      <label class="sub-chk-lbl"><input type="radio" name="sub-rev-target-mode" id="sub-rev-mode-route"> 整條路線（最多5站，須同一張航海圖）</label>
    </div>
    <div class="sub-rev-row">
      <label class="sub-lbl" id="sub-rev-dest-lbl">目的地</label>
      <div class="sub-combo-wrap" id="sub-rev-dest-wrap" style="min-width:260px"></div>
    </div>
    <div class="sub-chips-display" id="sub-rev-dest-chips"></div>
  </div>
  <div id="sub-rev-item-block" style="display:none">
    <div class="sub-rev-row">
      <label class="sub-lbl">物品（可多選，須同一張航海圖，最多5個航區）</label>
      <div class="sub-combo-wrap" id="sub-rev-item-wrap" style="min-width:280px"></div>
    </div>
    <div class="sub-chips-display" id="sub-rev-item-chips"></div>
    <div id="sub-rev-item-picks"></div>
  </div>
  <div id="sub-rev-stat-block" style="display:none">
    <div class="sub-rev-row">
      <div class="sub-rev-thr-grp"><label class="sub-lbl">探索至少</label><input type="number" id="sub-rev-stat-sur" class="sub-inp sub-rev-thr-num" style="display:inline-block" placeholder="不要求"></div>
      <div class="sub-rev-thr-grp"><label class="sub-lbl">收集至少</label><input type="number" id="sub-rev-stat-ret" class="sub-inp sub-rev-thr-num" style="display:inline-block" placeholder="不要求"></div>
      <div class="sub-rev-thr-grp"><label class="sub-lbl">恩惠至少</label><input type="number" id="sub-rev-stat-fav" class="sub-inp sub-rev-thr-num" style="display:inline-block" placeholder="不要求"></div>
      <div class="sub-rev-thr-grp"><label class="sub-lbl">速度至少</label><input type="number" id="sub-rev-stat-spd" class="sub-inp sub-rev-thr-num" style="display:inline-block" placeholder="不要求"></div>
      <div class="sub-rev-thr-grp"><label class="sub-lbl">航程至少</label><input type="number" id="sub-rev-stat-rng" class="sub-inp sub-rev-thr-num" style="display:inline-block" placeholder="不要求"></div>
    </div>
  </div>
  <div class="sub-rev-row" id="sub-rev-thr-row">
    <div class="sub-rev-thr-grp sub-rev-thr-toggle" id="sub-rev-sur-grp"><label class="sub-lbl">探索</label><select id="sub-rev-sur" class="sub-sel"><option value="none">不要求</option><option value="normal">達標</option><option value="best">最佳</option><option value="adv">自行輸入</option></select><input type="number" id="sub-rev-sur-num" class="sub-inp sub-rev-thr-num" value="0"></div>
    <div class="sub-rev-thr-grp sub-rev-thr-toggle"><label class="sub-lbl">收集</label><select id="sub-rev-ret" class="sub-sel"><option value="none">不要求</option><option value="normal">達標</option><option value="best">最佳</option><option value="adv">自行輸入</option></select><input type="number" id="sub-rev-ret-num" class="sub-inp sub-rev-thr-num" value="0"></div>
    <div class="sub-rev-thr-grp sub-rev-thr-toggle"><label class="sub-lbl">恩惠</label><select id="sub-rev-fav" class="sub-sel"><option value="none">不要求</option><option value="met">達標(雙倍機會)</option><option value="adv">自行輸入</option></select><input type="number" id="sub-rev-fav-num" class="sub-inp sub-rev-thr-num" value="0"></div>
  </div>
  <div class="sub-owned-hdr-row"><label class="sub-lbl">擁有的部件（會自動記住，下次不用重選）</label><div class="sub-owned-actions"><button type="button" id="sub-owned-all" class="sub-owned-mini-btn">全選</button><button type="button" id="sub-owned-none" class="sub-owned-mini-btn">全部清除</button></div></div>
  ${ownedHtml}
  <div class="sub-rev-row"><button id="sub-rev-search-btn" class="sub-search-btn">搜　尋</button></div>
  <div id="sub-rev-results-dest"><div class="sub-empty">選擇目的地、門檻與擁有的部件後按搜尋</div></div>
  <div id="sub-rev-results-item" style="display:none"><div class="sub-empty">選擇物品、門檻與擁有的部件後按搜尋</div></div>
  <div id="sub-rev-results-stat" style="display:none"><div class="sub-empty">輸入需求值與擁有的部件後按搜尋</div></div>`;

      mkStepper(revPanel.querySelector('#sub-rev-rank'),{step:1,min:1,max:145,wide:true});
      ['sub-rev-sur-num','sub-rev-ret-num','sub-rev-fav-num','sub-rev-stat-sur','sub-rev-stat-ret','sub-rev-stat-fav','sub-rev-stat-spd','sub-rev-stat-rng'].forEach(id=>{
        mkStepper(revPanel.querySelector(`#${id}`),{step:1,min:0});
      });

      let kind='dest';
      const destBlock=revPanel.querySelector('#sub-rev-dest-block');
      const itemBlock=revPanel.querySelector('#sub-rev-item-block');
      const statBlock=revPanel.querySelector('#sub-rev-stat-block');
      const thrRow=revPanel.querySelector('#sub-rev-thr-row');
      const surGrp=revPanel.querySelector('#sub-rev-sur-grp');
      const resDest=revPanel.querySelector('#sub-rev-results-dest');
      const resItem=revPanel.querySelector('#sub-rev-results-item');
      const resStat=revPanel.querySelector('#sub-rev-results-stat');
      const applyKind=()=>{
        destBlock.style.display=kind==='dest'?'':'none';
        itemBlock.style.display=kind==='item'?'':'none';
        statBlock.style.display=kind==='stat'?'':'none';
        thrRow.style.display=kind==='stat'?'none':'';
        surGrp.style.display=kind==='item'?'none':'';
        resDest.style.display=kind==='dest'?'':'none';
        resItem.style.display=kind==='item'?'':'none';
        resStat.style.display=kind==='stat'?'':'none';
      };
      revPanel.querySelectorAll('input[name="sub-rev-kind"]').forEach(r=>r.addEventListener('change',()=>{
        kind=revPanel.querySelector('#sub-rev-kind-item').checked?'item':revPanel.querySelector('#sub-rev-kind-stat').checked?'stat':'dest';
        applyKind();
        updateThrLabels();
      }));
      applyKind();

      let targetMode='single'; // 'single' | 'route'
      let selDest=null;
      const selDests=[];
      const destWrap=revPanel.querySelector('#sub-rev-dest-wrap');
      const chipsEl=revPanel.querySelector('#sub-rev-dest-chips');
      const destLbl=revPanel.querySelector('#sub-rev-dest-lbl');
      const dInp=document.createElement('input');dInp.type='text';dInp.className='sub-combo-inp';dInp.placeholder='輸入字母或名稱搜尋目的地…';
      const dDd=document.createElement('div');dDd.className='sub-combo-dd';dDd.style.display='none';
      const allSecOpts=SUB_SECTORS.map(s=>({val:s[0],mapId:s[1],label:`${s[2]} — ${s[4]}`}));
      const renderChips=()=>{
        chipsEl.innerHTML='';
        if(targetMode!=='route')return;
        selDests.forEach((id,i)=>{
          const s=SECTOR_MAP.get(id);if(!s)return;
          const chip=document.createElement('span');chip.className='sub-chip-tag';chip.textContent=`${s[2]} ${s[4]}`;
          const rm=document.createElement('span');rm.className='sub-chip-rm';rm.textContent='×';
          rm.onclick=()=>{selDests.splice(i,1);renderChips();};
          chip.appendChild(rm);chipsEl.appendChild(chip);
        });
      };
      const renderDestDD=q=>{
        dDd.innerHTML='';q=(q||'').trim().toLowerCase();
        let lastMap=null;
        allSecOpts.forEach(o=>{
          if(q&&!o.label.toLowerCase().includes(q))return;
          if(o.mapId!==lastMap){
            lastMap=o.mapId;
            const grp=document.createElement('div');grp.className='sub-combo-grp';grp.textContent=`(${o.mapId}) ${MAP_NAMES[o.mapId]}`;dDd.appendChild(grp);
          }
          const isSel=targetMode==='single'?selDest===o.val:selDests.includes(o.val);
          const it=document.createElement('div');it.className='sub-combo-item'+(isSel?' selected':'');it.textContent=(isSel?'✓ ':'')+o.label;
          it.addEventListener('mousedown',e=>{
            e.preventDefault();
            if(targetMode==='single'){selDest=o.val;dInp.value=o.label;dDd.style.display='none';}
            else{
              const idx=selDests.indexOf(o.val);
              if(idx>=0)selDests.splice(idx,1);
              else if(selDests.length<5)selDests.push(o.val);
              dInp.value='';renderChips();renderDestDD('');
            }
            updateThrLabels();
          });
          dDd.appendChild(it);
        });
        if(!dDd.children.length){const em=document.createElement('div');em.className='sub-combo-empty';em.textContent='無符合結果';dDd.appendChild(em);}
      };
      dInp.addEventListener('focus',()=>{renderDestDD(dInp.value);dDd.style.display='block';});
      dInp.addEventListener('blur',()=>{setTimeout(()=>{dDd.style.display='none';},160);});
      dInp.addEventListener('input',()=>{if(targetMode==='single')selDest=null;renderDestDD(dInp.value);dDd.style.display='block';});
      destWrap.appendChild(dInp);destWrap.appendChild(dDd);

      revPanel.querySelectorAll('input[name="sub-rev-target-mode"]').forEach(r=>r.addEventListener('change',()=>{
        targetMode=revPanel.querySelector('#sub-rev-mode-route').checked?'route':'single';
        destLbl.textContent=targetMode==='route'?'目的地（依序點選，最多5站，須同圖）':'目的地';
        dInp.value='';selDest=null;renderChips();renderDestDD('');
        updateThrLabels();
      }));

      /* ── 指定物品：多選 + 每個物品自己選要去哪個航區拿（列出所有候選） ── */
      const itemWrap=revPanel.querySelector('#sub-rev-item-wrap');
      const itemChipsEl=revPanel.querySelector('#sub-rev-item-chips');
      const itemPicksEl=revPanel.querySelector('#sub-rev-item-picks');
      const selItems=[];
      const itemPickedSec={};
      const iInp=document.createElement('input');iInp.type='text';iInp.className='sub-combo-inp';iInp.placeholder='輸入物品名稱搜尋…';
      const iDd=document.createElement('div');iDd.className='sub-combo-dd';iDd.style.display='none';
      const allItemOpts=Object.keys(SUB_ITEM_SECTORS).filter(id=>typeof ITEM_DB!=='undefined'&&ITEM_DB[id]).map(id=>({id:+id,name:getName(+id),cat:getPickerCategory(+id)})).sort((a,b)=>(PICKER_CAT_ORDER[a.cat]-PICKER_CAT_ORDER[b.cat])||a.name.localeCompare(b.name,'zh-TW'));
      const TIER_LABEL2={1:'一般',2:'達標',3:'最佳'};
      const renderItemPicks=()=>{
        itemPicksEl.innerHTML='';
        selItems.forEach(itemId=>{
          const cands=(SUB_ITEM_SECTORS[itemId]||[]).slice().sort((a,b)=>a.tier-b.tier||a.sec-b.sec);
          if(!itemPickedSec[itemId]||!cands.some(c=>c.sec===itemPickedSec[itemId]))itemPickedSec[itemId]=cands[0]?.sec;
          const row=document.createElement('div');row.className='sub-rev-row';
          const lbl=document.createElement('span');lbl.className='sub-lbl';lbl.textContent=getName(itemId)+'：';
          const sel=document.createElement('select');sel.className='sub-sel';
          cands.forEach(c=>{
            const s=SECTOR_MAP.get(c.sec);if(!s)return;
            const surThr=c.tier===3?s[11]:c.tier===2?s[10]:null;
            const thrText=c.tier===1?'探索無要求':`探索需${TIER_LABEL2[c.tier]}${surThr!=null?' '+surThr:''}`;
            const o=document.createElement('option');o.value=c.sec;o.textContent=`(${MAP_NAMES[s[1]]}) ${s[2]} ${s[4]}（${thrText}）`;
            if(c.sec===itemPickedSec[itemId])o.selected=true;
            sel.appendChild(o);
          });
          sel.addEventListener('change',()=>{itemPickedSec[itemId]=+sel.value;updateThrLabels();});
          row.appendChild(lbl);row.appendChild(sel);itemPicksEl.appendChild(row);
        });
      };
      const renderItemChips=()=>{
        itemChipsEl.innerHTML='';
        selItems.forEach((id,i)=>{
          const chip=document.createElement('span');chip.className='sub-chip-tag';chip.textContent=getName(id);
          const rm=document.createElement('span');rm.className='sub-chip-rm';rm.textContent='×';
          rm.onclick=()=>{selItems.splice(i,1);delete itemPickedSec[id];renderItemChips();renderItemPicks();updateThrLabels();};
          chip.appendChild(rm);itemChipsEl.appendChild(chip);
        });
      };
      const renderItemDD=q=>{
        iDd.innerHTML='';q=(q||'').trim().toLowerCase();let curCat=null;
        allItemOpts.forEach(o=>{
          if(q&&!o.name.toLowerCase().includes(q))return;
          if(o.cat!==curCat){curCat=o.cat;const g=document.createElement('div');g.className='sub-combo-grp';g.textContent=PICKER_CAT_LABEL[o.cat];iDd.appendChild(g);}
          const isSel=selItems.includes(o.id);
          const it=document.createElement('div');it.className='sub-combo-item'+(isSel?' selected':'');it.textContent=(isSel?'✓ ':'')+o.name;
          it.addEventListener('mousedown',e=>{
            e.preventDefault();
            const idx=selItems.indexOf(o.id);
            if(idx>=0){selItems.splice(idx,1);delete itemPickedSec[o.id];}
            else selItems.push(o.id);
            iInp.value='';renderItemChips();renderItemPicks();renderItemDD('');updateThrLabels();
          });
          iDd.appendChild(it);
        });
        if(!iDd.children.length){const em=document.createElement('div');em.className='sub-combo-empty';em.textContent='無符合結果';iDd.appendChild(em);}
      };
      iInp.addEventListener('focus',()=>{renderItemDD(iInp.value);iDd.style.display='block';});
      iInp.addEventListener('blur',()=>{setTimeout(()=>{iDd.style.display='none';},160);});
      iInp.addEventListener('input',()=>{renderItemDD(iInp.value);iDd.style.display='block';});
      itemWrap.appendChild(iInp);itemWrap.appendChild(iDd);

      ['sur','ret','fav'].forEach(k=>{
        const sel=revPanel.querySelector(`#sub-rev-${k}`);
        sel.addEventListener('change',()=>{sel.closest('.sub-rev-thr-grp').classList.toggle('adv',sel.value==='adv');});
      });

      revPanel.querySelectorAll('.sub-owned-item input').forEach(chk=>{
        chk.addEventListener('change',()=>{
          const slot=chk.dataset.slot,rank=+chk.dataset.rank;
          const arr=ownedParts[slot]||(ownedParts[slot]=[]);
          const idx=arr.indexOf(rank);
          if(chk.checked&&idx<0)arr.push(rank);
          else if(!chk.checked&&idx>=0)arr.splice(idx,1);
          try{localStorage.setItem(OWNED_KEY,JSON.stringify(ownedParts));}catch(e){}
        });
      });
      const setAllOwned=(checked)=>{
        revPanel.querySelectorAll('.sub-owned-item input').forEach(chk=>{chk.checked=checked;});
        ['hull','stern','bow','bridge'].forEach(slot=>{
          ownedParts[slot]=checked?PARTS[slot].map(p=>SUB_RANK_CODE_REV[p[0]]):[];
        });
        try{localStorage.setItem(OWNED_KEY,JSON.stringify(ownedParts));}catch(e){}
      };
      revPanel.querySelector('#sub-owned-all')?.addEventListener('click',()=>setAllOwned(true));
      revPanel.querySelector('#sub-owned-none')?.addEventListener('click',()=>setAllOwned(false));

      const getThr=k=>{
        const sel=revPanel.querySelector(`#sub-rev-${k}`).value;
        if(sel==='adv')return parseFloat(revPanel.querySelector(`#sub-rev-${k}-num`).value)||0;
        return sel;
      };
      const updateThrLabels=()=>{
        let secs=[];
        if(kind==='dest'){
          const ids=targetMode==='route'?selDests:(selDest!=null?[selDest]:[]);
          secs=ids.map(id=>SECTOR_MAP.get(id)).filter(Boolean);
        }else if(kind==='item'){
          secs=Object.values(itemPickedSec).map(id=>SECTOR_MAP.get(id)).filter(Boolean);
        }
        const maxOf=arr=>arr.length?Math.max(...arr):null;
        const surNorm=maxOf(secs.map(s=>s[10])),surBest=maxOf(secs.map(s=>s[11]));
        const retNorm=maxOf(secs.map(s=>s[12])),retBest=maxOf(secs.map(s=>s[13]));
        const favThr=maxOf(secs.map(s=>s[9]));
        const setOpt=(selId,val,label)=>{const opt=revPanel.querySelector(`#${selId} option[value="${val}"]`);if(opt)opt.textContent=label;};
        setOpt('sub-rev-sur','normal',surNorm!=null?`達標 (${surNorm})`:'達標');
        setOpt('sub-rev-sur','best',surBest!=null?`最佳 (${surBest})`:'最佳');
        setOpt('sub-rev-ret','normal',retNorm!=null?`達標 (${retNorm})`:'達標');
        setOpt('sub-rev-ret','best',retBest!=null?`最佳 (${retBest})`:'最佳');
        setOpt('sub-rev-fav','met',favThr!=null?`達標(雙倍機會) (${favThr})`:'達標(雙倍機會)');
      };
      updateThrLabels();
      const mkResultTable=results=>`<table class="sub-table sub-rev-table"><thead><tr><th>船體</th><th>船尾</th><th>船首</th><th>艦橋</th><th data-col="sur">探索</th><th data-col="ret">收集</th><th data-col="fav">恩惠</th><th>承載力</th>${results[0]?.timeStr!==undefined?'<th>時間</th>':''}</tr></thead><tbody>`+
        results.slice(0,100).map(r=>`<tr><td>${r.hull[0]} ${r.hull[1]}</td><td>${r.stern[0]} ${r.stern[1]}</td><td>${r.bow[0]} ${r.bow[1]}</td><td>${r.bridge[0]} ${r.bridge[1]}</td>`+
          `<td data-col="sur" class="thr-ok">${r.st.sur}</td><td data-col="ret" class="thr-ok">${r.st.ret}</td><td data-col="fav" class="thr-ok">${r.st.fav}</td><td>${r.cost}/${r.cap??'—'}</td>${r.timeStr!==undefined?`<td>${r.timeStr}</td>`:''}</tr>`).join('')+'</tbody></table>';

      revPanel.querySelector('#sub-rev-search-btn').addEventListener('click',()=>{
        const resEl=kind==='item'?resItem:kind==='stat'?resStat:resDest;
        const rank=parseInt(revPanel.querySelector('#sub-rev-rank').value)||1;

        if(kind==='stat'){
          const num=id=>{const v=revPanel.querySelector(`#${id}`).value;return v===''?null:parseFloat(v);};
          const target={sur:num('sub-rev-stat-sur'),ret:num('sub-rev-stat-ret'),fav:num('sub-rev-stat-fav'),spd:num('sub-rev-stat-spd'),rng:num('sub-rev-stat-rng')};
          const results=subFindBuildsByStats(target,ownedParts,rank);
          if(!results.length){resEl.innerHTML='<div class="sub-empty">找不到符合條件的組合（可能是擁有的部件不夠，或超過承載力）</div>';return;}
          resEl.innerHTML=`<div class="sub-target-hint">共找到 ${results.length} 組符合條件（顯示前100組，依承載力使用量由低到高排序）</div>`+mkResultTable(results);
          return;
        }

        if(kind==='item'){
          if(!selItems.length){resEl.innerHTML='<div class="sub-empty">請先選擇至少一項物品</div>';return;}
          const sectorTierMap={};
          selItems.forEach(itemId=>{
            const sec=itemPickedSec[itemId];
            const cand=(SUB_ITEM_SECTORS[itemId]||[]).find(c=>c.sec===sec);
            if(cand)sectorTierMap[sec]=Math.max(sectorTierMap[sec]||0,cand.tier);
          });
          const secIds=Object.keys(sectorTierMap).map(Number);
          if(secIds.length>5){resEl.innerHTML='<div class="sub-empty">選到的物品分散在超過5個航區，同一趟飛不完，請減少物品數量或改選同航區的物品</div>';return;}
          const mapIds=[...new Set(secIds.map(id=>SECTOR_MAP.get(id)?.[1]))];
          if(mapIds.length>1){resEl.innerHTML='<div class="sub-empty">選到的物品分散在不同航海圖，沒辦法一趟跑完，請改選同一張航海圖的物品</div>';return;}
          const th={ret:getThr('ret'),fav:getThr('fav')};
          const results=subFindBuildsForTiers(sectorTierMap,th,ownedParts,rank);
          if(!results.length){resEl.innerHTML='<div class="sub-empty">找不到符合條件的組合（可能是擁有的部件不夠、超過承載力，或航程不夠飛完全程）</div>';return;}
          const destStr=secIds.map(id=>{const s=SECTOR_MAP.get(id);return s?`${s[2]} ${s[4]}`:'';}).join('、');
          resEl.innerHTML=`<div class="sub-target-hint">路線會經過：${destStr}　共找到 ${results.length} 組符合條件（顯示前100組，依耗時由短到長排序）</div>`+mkResultTable(results);
          return;
        }

        // kind==='dest'
        const targets=targetMode==='route'?selDests.slice():(selDest!=null?[selDest]:[]);
        if(!targets.length){resEl.innerHTML=`<div class="sub-empty">請先選擇${targetMode==='route'?'至少一個':''}目的地</div>`;return;}
        const th={sur:getThr('sur'),ret:getThr('ret'),fav:getThr('fav')};
        const results=subFindBuilds(targets,ownedParts,th,rank);
        if(!results.length){resEl.innerHTML='<div class="sub-empty">找不到符合條件的組合（可能是擁有的部件不夠、超過承載力、選了不同航海圖的目的地，或航程不夠飛完全程）</div>';return;}
        const destStr=targets.map(id=>{const s=SECTOR_MAP.get(id);return s?`${s[2]} ${s[4]}`:'';}).join(' → ');
        resEl.innerHTML=`<div class="sub-target-hint">目的地：${destStr}　共找到 ${results.length} 組符合條件（顯示前100組，依耗時由短到長排序）</div>`+mkResultTable(results);
      });
    };
    buildReversePanel();

    /* 配裝反查的勾選格只在 buildReversePanel() 時畫過一次；如果使用者是在
       「路線搜尋（擁有部件模式）」勾的，切過來時畫面不會自動更新，只更新
       checkbox 的勾選狀態（不重畫整塊，才不會把使用者在配裝反查裡設定到
       一半的目的地/篩選條件重置掉）。 */
    const syncReverseOwnedCheckboxes=()=>{
      revPanel.querySelectorAll('.sub-owned-item input[type="checkbox"]').forEach(chk=>{
        const slot=chk.dataset.slot,rk=+chk.dataset.rank;
        chk.checked=(ownedParts[slot]||[]).includes(rk);
      });
    };

    const routePanel=root.querySelector('#sub-route-panel');
    root.querySelectorAll('.sub-mode-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        root.querySelectorAll('.sub-mode-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const mode=btn.dataset.mode;
        routePanel.style.display=mode==='route'?'':'none';
        revPanel.style.display=mode==='reverse'?'':'none';
        if(mode==='reverse')syncReverseOwnedCheckboxes();
        else if(partsMode==='owned')renderOwnedRouteGrid();
      });
    });

    setTimeout(()=>root.querySelectorAll('.ih:not([data-ih])').forEach(el=>{el.setAttribute('data-ih','1');this._bindIH(el);}),100);
  };
