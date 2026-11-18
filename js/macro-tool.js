/* macro-tool.js — 巨集建立工具（新版：區域／標籤瀏覽、巨集視窗、接力動態）
   資料與指令產生在 macro-engine.js；區域與標籤在 macro-meta.js；貼上解析在 macro-parse.js。
   欄位表單（renderFields 一族）與其事件沿用舊版邏輯，確保 140 種指令的功能完整。 */
(function(){
'use strict';
var E=window.MacroEngine;
if(!E||!window.MacroMeta||!window.MacroParse){console.error('macro-tool: 缺少 macro-engine / macro-meta / macro-parse');return;}
var MAX=E.MAX,MAX_C=E.MAX_C,WARN_C=E.WARN_C;
var ALARM_TTYPE=E.ALARM_TTYPE,CATS=E.CATS,CH=E.CH,CHATLOG_CH=E.CHATLOG_CH,CHATLOG_SUBS=E.CHATLOG_SUBS,EMOTES=E.EMOTES,GPRESET_OPTS=E.GPRESET_OPTS,
  HOTBAR_SET_TYPES=E.HOTBAR_SET_TYPES,HOTBAR_SET_TYPES_PVP=E.HOTBAR_SET_TYPES_PVP,HOTBAR_SUBS=E.HOTBAR_SUBS,HUD_W=E.HUD_W,IS_AREAS=E.IS_AREAS,IS_C=E.IS_C,
  JOBS=E.JOBS,MICON_T=E.MICON_T,PETMIRAGE_APPEARANCES=E.PETMIRAGE_APPEARANCES,PETMIRAGE_PETS=E.PETMIRAGE_PETS,PETSIZE_PETS=E.PETSIZE_PETS,
  PRONS=E.PRONS,SE=E.SE,TDEFS=E.TDEFS,TEMPLATES=E.TEMPLATES,TGT=E.TGT,WINDOW_LIST=E.WINDOW_LIST;
var cc=E.cc,dc=E.dc,tv=E.tv,seStr=E.seStr,waitStr=E.waitStr,buildLines=E.buildLines;
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function so(opts,cur){return opts.map(function(o){return '<option value="'+esc(o.v)+'"'+(o.v===cur?' selected':'')+'>'+esc(o.l)+'</option>';}).join('');}
var _lastMsgInput=null;
function insertAtCursor(inp,text){
  if(!inp) return;
  var s=inp.selectionStart||0,e=inp.selectionEnd||0,v=inp.value||'';
  inp.value=v.slice(0,s)+text+v.slice(e);
  inp.selectionStart=inp.selectionEnd=s+text.length;
  inp.dispatchEvent(new Event('input'));inp.focus();
}

/* ════════════════════════════════════════════════
   新版外殼：狀態、索引、歷史
════════════════════════════════════════════════ */
var LS_DRAFT='ffxivtc_macro_v2_draft',LS_LIB='ffxivtc_macro_v2_lib';
var M=window.MacroMeta,FLD=window.MacroFields,PARSE=window.MacroParse;
var lines=[],nextId=1,globalCfg={mlock:false,merrorOff:false},macroName='';
var ui={mode:'area',area:'__tpl',proTarget:null,tags:[],tagAll:false,query:'',sel:null,insertAt:null,replacing:null,
        textMode:false,textVal:'',page:0,sheet:false,warnOpen:false,drag:null};
var previewEditable=false;
var hist=[],hi=-1,commitTimer=null,lastSnap='';

/* 預設的下拉頻道（/dice 使用完整英文頻道名） */
var DICE_CH=[{v:'party',l:'小隊'},{v:'alliance',l:'團隊'},{v:'freecompany',l:'部隊'},{v:'pvpteam',l:'戰隊'}]
  .concat([1,2,3,4,5,6,7,8].map(function(n){return{v:'linkshell'+n,l:'通訊貝'+n};}))
  .concat([1,2,3,4,5,6,7,8].map(function(n){return{v:'cwlinkshell'+n,l:'跨服通訊貝'+n};}));

function $(id){return document.getElementById(id);}
function getLine(id){for(var i=0;i<lines.length;i++)if(lines[i].id===id)return lines[i];return null;}
function idxOf(id){for(var i=0;i<lines.length;i++)if(lines[i].id===id)return i;return -1;}
function reduced(){return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
function validate(){return E.validate(lines,globalCfg);}
function getAllOutput(){return E.getAllOutput(lines,globalCfg);}

/* ── 區域、標籤索引 ── */
var AREAS=M.areas,AREA_BY={},TYPE_AREA={},TYPE_GROUP={},AREA_ORD={};
AREAS.forEach(function(a,i){AREA_BY[a.id]=a;AREA_ORD[a.id]=i;a.groups.forEach(function(g){g.types.forEach(function(t){TYPE_AREA[t]=a.id;TYPE_GROUP[t]=g.name;});});});
var AREA_ICON={talk:'ph-chat-circle-dots',act:'ph-sword',target:'ph-crosshair',combat:'ph-shield',char:'ph-horse',emote:'ph-smiley',
  party:'ph-users-three',social:'ph-handshake',status:'ph-user-circle',ui:'ph-browsers',av:'ph-speaker-high',sys:'ph-gear-six'};
var TAGS=M.tags,TAG_TYPES={},TAG_FACET={};
Object.keys(TAGS).forEach(function(t){TAGS[t].forEach(function(g){(TAG_TYPES[g]=TAG_TYPES[g]||[]).push(t);});});
Object.keys(M.facets).forEach(function(f){M.facets[f].forEach(function(g){TAG_FACET[g]=f;});});
var STARTER_TAGS=['溝通','倒數','拍照','表演','一鍵切換','整理','顯示隱藏','提醒','音量','技能','目標','組隊','互動','設定','生產','副本'];
function tagW(g){return 1/Math.log(2.5+(TAG_TYPES[g]||[]).length);}
function typeOrd(t){return AREA_ORD[TYPE_AREA[t]]*1000+Object.keys(TDEFS).indexOf(t);}
/* 命中標籤的類型，依「命中數 × 標籤稀有度」排序；不要求全中 */
function scoreTypes(sel){
  var res=[];
  Object.keys(TAGS).forEach(function(t){
    var s=0;sel.forEach(function(g){var i=TAGS[t].indexOf(g);if(i>=0)s+=tagW(g)*(i<2?1.5:1);});
    if(s>0)res.push([t,s]);
  });
  res.sort(function(a,b){return b[1]-a[1]||typeOrd(a[0])-typeOrd(b[0]);});
  return res.map(function(x){return x[0];});
}
function splitLabel(t){
  var d=TDEFS[t];if(!d)return{n:t,c:''};
  var m=/^(.*?)\s*(\/[A-Za-z0-9_]+)(.*)$/.exec(d.label);
  if(m)return{n:(m[1]+m[3]).replace(/\s+/g,' ').trim()||d.label,c:m[2]};
  return{n:d.label,c:''};
}
function defaultText(t){
  try{return buildLines({id:0,type:t,params:{},note:'',repeat:1}).join('  ⏎  ');}catch(e){return '';}
}
/* 指令搜尋：以「指令」為主，中文名稱與標籤只是順便 */
function searchTypes(q){
  q=q.trim().toLowerCase();if(!q)return[];
  var qs=q.replace(/^\//,'').split(/\s+/)[0],res=[];
  Object.keys(TDEFS).forEach(function(t){
    var d=TDEFS[t],sl=splitLabel(t),cmd=sl.c.toLowerCase(),lab=d.label.toLowerCase(),s=0;
    if(cmd&&cmd.slice(1)===qs)s=100;
    else if(cmd&&cmd.indexOf('/'+qs)===0)s=80;
    else if(cmd&&cmd.indexOf(qs)>=0)s=50;
    else if(lab.indexOf(q)>=0)s=40;
    else if(d.kw&&d.kw.toLowerCase().indexOf(q)>=0)s=30;
    else if((TAGS[t]||[]).some(function(g){return g.toLowerCase().indexOf(q)>=0;}))s=20;
    if(s)res.push([t,s]);
  });
  res.sort(function(a,b){return b[1]-a[1]||typeOrd(a[0])-typeOrd(b[0]);});
  return res.map(function(x){return x[0];});
}

/* ── 歷史（復原／重做）與草稿 ── */
function snap(){return JSON.stringify({l:lines,g:globalCfg,n:nextId,nm:macroName});}
function restore(s){var o=JSON.parse(s);lines=o.l||[];globalCfg=o.g||{mlock:false,merrorOff:false};nextId=o.n||1;macroName=o.nm||'';}
function saveDraft(s){try{localStorage.setItem(LS_DRAFT,s);}catch(e){}}
function commit(){
  clearTimeout(commitTimer);
  var s=snap();if(s===lastSnap)return;
  lastSnap=s;hist=hist.slice(0,hi+1);hist.push(s);
  if(hist.length>120)hist.shift();
  hi=hist.length-1;saveDraft(s);refreshUndo();
}
function scheduleCommit(){clearTimeout(commitTimer);commitTimer=setTimeout(commit,500);}
function fixSel(){if(ui.sel!=null&&!getLine(ui.sel))ui.sel=null;ui.replacing=null;}
function undo(){commit();if(hi<=0)return;hi--;lastSnap=hist[hi];restore(hist[hi]);fixSel();saveDraft(lastSnap);renderAll();}
function redo(){commit();if(hi>=hist.length-1)return;hi++;lastSnap=hist[hi];restore(hist[hi]);fixSel();saveDraft(lastSnap);renderAll();}
function refreshUndo(){
  var u=$('mx-undo'),r=$('mx-redo');
  if(u)u.disabled=hi<=0;if(r)r.disabled=hi>=hist.length-1;
}

/* 舊版事件程式沿用的三個進入點 */
function render(){commit();renderAll();}
function updateRow(){patchSide();scheduleCommit();refreshEdOut();}
function updatePreview(){patchSide();scheduleCommit();refreshEdOut();}

/* ── 輸出模型：每一行指令對應到它屬於哪個邏輯行 ── */
function ownerLines(){
  var out=[];
  if(globalCfg.mlock)out.push({t:'/mlock',o:'g'});
  if(globalCfg.merrorOff)out.push({t:'/merror off',o:'g'});
  var mi=[];
  lines.forEach(function(l){buildLines(l).forEach(function(s){
    if(s.indexOf('/micon')===0)mi.push({t:s,o:l.id});else out.push({t:s,o:l.id});
  });});
  return out.concat(mi);
}
function model(){
  var all=ownerLines(),texts=all.map(function(x){return x.t;}),pages,overflow=0;
  if(texts.length>MAX){var sd=E.doSplit(texts,globalCfg);pages=[sd.m1,sd.m2];overflow=sd.overflow||0;}
  else pages=[texts];
  var ptr=0;
  var rows=pages.map(function(pg){return pg.map(function(t){
    var o=null;if(ptr<all.length&&all[ptr].t===t){o=all[ptr].o;ptr++;}
    return{t:t,o:o};
  });});
  return{pages:rows,overflow:overflow,total:texts.length,texts:texts};
}

/* ════════════════════════════════════════════════
   欄位表單（沿用舊版）
════════════════════════════════════════════════ */
function fRow(label,content,hint){
  // 無障礙修正：把這一行的標籤文字，自動補進內容裡每個 input/select/textarea 的
  // title 屬性（若該元素本身還沒有 title），讓螢幕閱讀器/自動化檢測工具能辨識
  // 到可存取名稱（accessible name），不用逐一改寫上百處呼叫端。
  var titled=content.replace(/<(input|select|textarea)((?:(?!title=)[^>])*)>/gi,function(m,tag,rest){
    return '<'+tag+rest+' title="'+esc(label)+'">';
  });
  return '<div class="mf-row"><span class="mf-lbl">'+label+'</span><div class="mf-cnt">'+titled+(hint?'<span class="mf-unit">'+hint+'</span>':'')+'</div></div>';
}
function fInp(id,key,ph,val,type,extra){type=type||'text';extra=extra||'';var fid='mf_'+id+'_'+key;return '<input class="mf-inp" id="'+fid+'" name="'+fid+'" data-id="'+id+'" data-key="'+key+'" type="'+type+'" placeholder="'+esc(ph)+'" value="'+esc(val||'')+'" '+extra+'>';}
function fSel(id,key,opts,cur,cls){var fid='mf_'+id+'_'+key;return '<select class="mf-sel'+(cls?' '+cls:'')+'" id="'+fid+'" name="'+fid+'" data-id="'+id+'" data-key="'+key+'">'+so(opts,cur)+'</select>';}
function fChk(id,key,label,checked){return '<label class="mf-check"><input type="checkbox" data-id="'+id+'" data-key="'+key+'"'+(checked?' checked':'')+'><span>'+label+'</span></label>';}
function fHint(msg){return '<div class="mf-hint">'+msg+'</div>';}
function fSep(label){return '<div class="mf-sep"><span>'+label+'</span></div>';}
function fTgt(id,key,cur){
  var sel=fSel(id,key,TGT,cur);
  var custom=cur==='custom'?fInp(id,'targetCustom','自訂代名詞（如 <2>）',''):'' ;
  return sel+custom;
}
function fSE(id,key,cur){return fSel(id,key,SE,cur||'');}
function fCH(id,key,cur){return fSel(id,key,CH,cur||'p');}

/* 訊息輸入框 + 內嵌代名詞選擇器 */
var MSG_QUICK=[{v:'<t>',l:'目標'},{v:'<me>',l:'自己'},{v:'<f>',l:'焦點目標'},{v:'<targethpp>',l:'目標HP%'},{v:'<pos>',l:'座標'},{v:'<se.1>',l:'音效'}];
function quickProChips(){
  return MSG_QUICK.map(function(p){
    return '<span class="inline-pro" data-sym="'+esc(p.v)+'" title="'+esc(p.v)+'"><b>'+esc(p.l)+'</b><code>'+esc(p.v)+'</code></span>';
  }).join('')+'<button type="button" class="inline-pro more" data-act="pros" data-pop="1"><i class="ph ph-plus"></i>更多代名詞</button>';
}
function fMsgInp(id,key,ph,val){
  return '<div class="msg-inp-wrap">'
    +'<input class="mf-inp msg-inp" data-id="'+id+'" data-key="'+key+'" placeholder="'+esc(ph)+'" value="'+esc(val||'')+'">'
    +'<div class="inline-pro-row"><span class="ipr-t">插入</span>'+quickProChips()+'</div>'
    +'</div>';
}

function renderFields(line){
  var p=line.params||{}, id=line.id;
  switch(line.type){
    /* ── 說話 / 通知（原有）── */
    case 'chat': return renderChatFields(line);
    case 'chatcountdown': return renderChatCountdownFields(line);
    case 'echo': return renderEchoFields(line);
    case 'tell': return renderTellFields(line);
    case 'reply': return renderReplyFields(line);
    case 'cth': return fHint('/cth 清除所有透過悄悄話（/tell）收發的歷史紀錄。無參數、無需設定。');
    case 'em': return renderEmFields(line);
    /* ── 技能 / 道具（原有）── */
    case 'skill': case 'generalskill': case 'blueaction':
    case 'pvpaction': case 'petaction': case 'companionaction':
      return renderSkillFields(line,line.type);
    case 'item': return renderItemFields(line);
    case 'itemsearch': return fHint('/isearch 在背包、雇員物品、兵裝庫、陸行鳥鞍囊、收藏柜、投影台中，完整搜尋含有指定關鍵字的道具。無法用於巨集內（僅能在對話欄直接輸入）。')+
      fRow('關鍵字',fInp(id,'itemName','道具名稱關鍵字（如：恢復藥）',p.itemName));
    case 'emote': return renderEmoteFields(line);
    case 'abilityrotation': return renderAbilityRotation(line);
    /* ── 目標操作（原有）── */
    case 'openwindow': return fHint('開啟（或關閉，若已開啟）指定的選單／清單視窗。多數視窗指令再次執行會直接關閉。')+
      fRow('視窗',fSel(id,'winCmd',WINDOW_LIST,p.winCmd||'bag'));
    case 'targeting': return renderTargetingFields(line);
    case 'check': return renderCheckFields(line);
    case 'trade': return renderTradeFields(line);
    case 'assist': return renderAssistFields(line);
    case 'focustarget': return renderFocusTargetFields(line);
    case 'facetarget': return renderFaceTargetFields(line);
    case 'lockon': return renderLockOnFields(line);
    case 'marking': return renderMarkingFields(line);
    case 'waymark': return renderWaymarkFields(line);
    /* ── 計時 / 通報（原有）── */
    case 'countdown_sys': return renderCountdownFields(line);
    case 'readycheck': return renderReadycheckFields(line);
    case 'ready': return fHint('/rd — 回應準備確認：準備完畢。');
    case 'notready': return fHint('/nr — 回應準備確認：尚未準備好。');
    /* ── 角色 / 移動（原有）── */
    case 'automove': return fHint('/automove — 切換自動前進。執行一次開始，再次執行停止。');
    case 'follow': return renderFollowFields(line);
    case 'battlemode': return renderBattleModeFields(line);
    case 'visor': return fHint('/visor — 切換頭部裝備的面罩開關（適用於可開合的頭盔）。');
    case 'fashion': return fHint('/fashion 裝備指定的時尚配件（如陽傘等外觀類配件）。')+
      fRow('配件名稱',fInp(id,'itemName','時尚配件名稱（與遊戲完全一致）',p.itemName));
    /* ── 召喚獸 / 坐騎（原有）── */
    case 'mount': return renderMountFields(line);
    case 'minion': return renderMinionFields(line);
    /* ── 鏡頭 / 拍照（原有）── */
    case 'gpose': return fHint('/gpose — 進入集體動作（拍照）模式。再次執行離開。');
    /* ── 介面 / 顯示（原有）── */
    case 'nameplatedisp': return renderNameplateFields(line);
    case 'nameplatetype': return renderNameplateTypeFields(line);
    case 'battleeffect': return renderBattleEffectFields(line);
    case 'hud': return renderHudFields(line);
    /* ── 角色套裝（原有）── */
    case 'gearset': return renderGearsetFields(line);
    case 'itemsort': return renderItemsortFields(line);
    /* ── 說話/通知 新增 ── */
    case 'cl': return fHint('清除消息欄中所有歷史記錄，執行後無法復原。');
    case 'emotelog': return fHint('/emotelog 設定使用情感動作時，是否在消息欄顯示對應的文字提示。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示'},{v:'off',l:'不顯示'},{v:'toggle',l:'切換'}],p.toggle||'toggle'));
    case 'qchat': return fHint('發送快捷發言（僅限群狼盛宴中使用）。')+
      fRow('快捷發言名',fInp(id,'name','快捷發言名稱（與遊戲完全一致）',p.name))+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));

    /* ── 技能/道具 新增 ── */
    case 'recast': return fHint('在消息欄顯示指定技能的剩餘複唱時間（秒）。')+
      fRow('技能名稱',fInp(id,'skillName','技能名稱（與遊戲完全一致）',p.skillName));
    case 'aaction': return fHint('設定或解除大地使者的額外技能。技能名輸入「clear」可解除全部已設定的技能。')+
      fRow('技能名稱',fInp(id,'skillName','技能名稱或輸入 clear 解除全部',p.skillName))+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'設定技能'},{v:'off',l:'解除技能'},{v:'toggle',l:'切換（設定↔解除）'}],p.toggle||'toggle'));
    case 'bluespellbook': return fHint('管理青魔法書的有效技能設定。可切換開關、設定單一技能、或套用預設組。')+
      fRow('子指令',fSel(id,'sub',[{v:'toggle',l:'切換青魔法書開/關'},{v:'set',l:'設定有效技能（開/關）'},{v:'preset',l:'套用預設技能組'},{v:'clear',l:'撤除所有有效技能'}],p.sub||'toggle'))+
      (p.sub==='set'?fRow('技能名稱',fInp(id,'spells','青魔法名稱（與遊戲完全一致）',p.spells))+fRow('操作',fSel(id,'spellToggle',[{v:'on',l:'設為有效技能'},{v:'off',l:'從有效技能移除'},{v:'toggle',l:'切換'}],p.spellToggle||'on')):'')  +
      (p.sub==='preset'?fRow('預設組編號',fSel(id,'presetNum',[{v:'1',l:'預設組 1'},{v:'2',l:'預設組 2'},{v:'3',l:'預設組 3'},{v:'4',l:'預設組 4'},{v:'5',l:'預設組 5'}],p.presetNum||'1')):'');
    case 'apa': return fHint('同時設定兩個對戰追加技能，兩個欄位都必須填寫。')+
      fRow('追加技能 1',fInp(id,'skill1','對戰追加技能名稱（與遊戲完全一致）',p.skill1))+
      fRow('追加技能 2',fInp(id,'skill2','對戰追加技能名稱（與遊戲完全一致）',p.skill2));

    /* ── 計時/通報/骰子 新增 ── */
    case 'alarm': return fHint('設定到指定時間時發出提醒的鬧鐘。可設本地、伺服器或艾奧傑亞時間，並可設定提前提醒或每小時重複。')+
      fRow('操作',fSel(id,'alarmSub',[{v:'open',l:'開啟鬧鐘視窗'},{v:'set',l:'設定鬧鐘'},{v:'clear',l:'撤除所有鬧鐘'}],p.alarmSub||'open'))+
      (p.alarmSub==='set'?
        fRow('鬧鐘名稱',fInp(id,'alarmName','鬧鐘名稱',p.alarmName))+
        fRow('時間類型',fSel(id,'timeType',ALARM_TTYPE,p.timeType||'lt'))+
        fRow('時間',fInp(id,'alarmTime','格式：0000~2400，如 2000 表示 20:00',p.alarmTime||'2000'))+
        fRow('重複',fChk(id,'repeat','每小時重複提醒（加上 rp）',p.repeat))+
        fRow('提前提醒（分鐘）',fInp(id,'advance','0~60，留空則準時提醒',p.advance,'number','min="0" max="60"'))
      :'');
    case 'dice': return fHint('在聊天頻道發送骰子結果（0~999，或指定上限 1~N）。省略頻道則在當前頻道發言。在巨集中使用時建議指定頻道。')+
      fRow('頻道（選填）',fSel(id,'channel',[{v:'',l:'省略（當前頻道）'}].concat(DICE_CH),p.channel||''))+
      fRow('上限值（選填）',fInp(id,'max','省略則 0~999；填入數字則 1~N',p.max,'number','min="2" max="999"'));

    /* ── 召喚獸/坐騎 新增 ── */
    case 'petsize': return fHint('變更指定召喚獸的顯示尺寸，僅對自身生效，PvP區無效。選「全部」時無法使用切換，需指定尺寸。')+
      fRow('召喚獸',fSel(id,'petName',PETSIZE_PETS,p.petName||'Demi-Bahamut'))+
      fRow('尺寸',fSel(id,'size',[{v:'large',l:'大'},{v:'medium',l:'中'},{v:'small',l:'小'},{v:'toggle',l:'切換（小→中→大）'}],p.size||'toggle'));
    case 'petmirage': return fHint('/petglamour（別名 /petglam、/egiglamour）將指定召喚獸的外貌更換為另一款召喚獸的外觀，需重新召喚才會生效，PvP區無效。學者妖精 Eos 可換裝成 Selene（7.51版確認）。注意：官方指令名稱已由舊版 /petmirage 改為 /petglamour，若巨集裡還留著 /petmirage 會執行失敗。勾選「撤除外貌」會省略外貌參數以恢復原始外觀（並非填入「clear」字樣）。')+
      fRow('召喚獸',fSel(id,'petName',PETMIRAGE_PETS,p.petName||'carbuncle'))+
      fRow('撤除外貌',fChk(id,'clear','撤除（省略外貌參數，恢復原始外貌）',p.clear))+
      (!p.clear?fRow('外貌',fSel(id,'appearance',(PETMIRAGE_APPEARANCES[p.petName||'carbuncle']||[]),p.appearance||'')):'');
    case 'ridepillion': return fHint('搭乘指定隊員的坐騎，並選擇座位編號（1~7）。若指定座位已滿會自動選空位。')+
      fRow('隊員',fTgt(id,'target',p.target||'<2>','party'))+
      fRow('座位編號',fSel(id,'seat',[{v:'1',l:'座位 1'},{v:'2',l:'座位 2'},{v:'3',l:'座位 3'},{v:'4',l:'座位 4'},{v:'5',l:'座位 5'},{v:'6',l:'座位 6'},{v:'7',l:'座位 7'}],p.seat||'1'));

    /* ── 鏡頭/拍照 新增 ── */
    case 'facecamera': return fHint('讓角色視線轉向鏡頭方向。再次執行可解除。');
    case 'idlingcamera': return fHint('切換為景觀鏡頭視角，可指定目標讓鏡頭鎖定該對象。省略目標則隨機選擇場景。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'tiltcamera': return fHint('調整第三人稱視角的俯視角度（0~100）。數值越大俯視角度越大。')+
      fRow('俯視角度',fInp(id,'value','0~100',p.value,'number','min="0" max="100"'));

    /* ── 狀態/身分 新增 ── */
    case 'busy': return fHint('設定在線狀態為「忙碌」。開啟後其他玩家會看到你處於忙碌狀態。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'設為忙碌'},{v:'off',l:'回到在線'},{v:'toggle',l:'切換（忙碌↔在線）'}],p.toggle||'toggle'));
    case 'away': return fHint('設定在線狀態為「離開（AFK）」。開啟後其他玩家會看到你處於離開狀態。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'設為離開'},{v:'off',l:'回到在線'},{v:'toggle',l:'切換（離開↔在線）'}],p.toggle||'toggle'));
    case 'roleplaying': return fHint('設定在線狀態為「角色扮演中」。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'設為角色扮演中'},{v:'off',l:'回到在線'},{v:'toggle',l:'切換（角色扮演↔在線）'}],p.toggle||'toggle'));
    case 'lfp': return fHint('設定在線狀態為「希望組隊」，可附加你能以哪些職業參與組隊。省略職業時預設為當前職業（省略全部職業）。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'設為希望組隊'},{v:'off',l:'回到在線'},{v:'toggle',l:'切換（希望組隊↔在線）'}],p.toggle||'toggle'))+
      fRow('可組隊職業（選填，可多選）',
        '<div class="job-ctrl-row">'+
          '<button class="job-sel-all" data-id="'+id+'">全選</button>'+
          '<button class="job-sel-none" data-id="'+id+'">全不選</button>'+
        '</div>'+
        '<div class="job-checkbox-grid">'+JOBS.map(function(j){
          var isChecked=(p.jobs||[]).indexOf(j.v)>=0;
          var checked=isChecked?'checked':'';
          return '<label class="job-chk-lbl'+(isChecked?' checked':'')+'"><input type="checkbox" class="mf-chk-job" data-id="'+id+'" data-key="jobs" data-val="'+j.v+'" '+checked+'> '+j.l+'</label>';
        }).join('')+'</div>');
    case 'lfm': return fHint('設定在線狀態為「接受鑲嵌魔晶石請求」。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'接受鑲嵌請求'},{v:'off',l:'回到在線'},{v:'toggle',l:'切換'}],p.toggle||'toggle'));
    case 'scomment': return fHint('設定搜尋玩家時顯示的個性簽名。')+
      fRow('簽名內容',fInp(id,'text','簽名文字',p.text));
    case 'bstatus': return fHint('/nastatus（別名 /nas）切換自己的「新人（Sprout）」在線狀態。注意：官方指令名稱已由舊版 /beginnerstatus、/bstatus 改為 /nastatus，若巨集裡還留著 /bstatus 會執行失敗。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟新人狀態'},{v:'off',l:'解除新人狀態'},{v:'toggle',l:'切換'}],p.toggle||'toggle'));
    case 'nnetwork': return fHint('/nnetwork（別名 /novicenetwork）設定是否自動加入新人頻道。開啟時會立即加入頻道；關閉時會離開頻道並停止自動加入。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟自動加入'},{v:'off',l:'關閉自動加入並離開'},{v:'toggle',l:'切換'}],p.toggle||'toggle'));
    case 'nnetworkinvitation': return fHint('/nnetworkinvitation（別名 /novicenetworkinvitation）設定是否允許被邀請加入新人頻道。關閉後會自動拒絕所有邀請。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'允許被邀請'},{v:'off',l:'自動拒絕邀請'},{v:'toggle',l:'切換'}],p.toggle||'toggle'));
    case 'nnetworkleave': return fHint('/nnetworkleave（別名 /novicenetworkleave）立即退出目前所在的新人頻道。無參數。');
    case 'search': return fHint('/sea（別名 /search）依條件搜尋玩家，結果顯示在玩家搜尋視窗中。可組合多種條件，全部留空則執行預設搜尋。')+
      fRow('姓名條件',fSel(id,'nameMode',[{v:'',l:'（不篩選姓名）'},{v:'forename',l:'名字（forename）'},{v:'surname',l:'姓氏（surname）'}],p.nameMode||''))+
      (p.nameMode?fRow('姓名關鍵字',fInp(id,'playerName','完整名字或姓氏',p.playerName)):'')+
      fRow('在線狀態',fSel(id,'status',[
        {v:'',l:'（不篩選）'},{v:'leader',l:'隊長 leader'},{v:'away',l:'離開 away'},{v:'busy',l:'忙碌 busy'},
        {v:'duty',l:'任務中 duty'},{v:'event',l:'剧情中 event'},{v:'lookingforparty',l:'希望組隊 lookingforparty'},
        {v:'recruit',l:'招募隊員中 recruit'},{v:'lookingtomeld',l:'接受鑲嵌請求 lookingtomeld'},
        {v:'newadventurer',l:'新人 newadventurer'},{v:'mentor',l:'指導者 mentor'},
        {v:'tradementor',l:'製作採集指導者 tradementor'},{v:'pvementor',l:'戰鬥指導者 pvementor'},
        {v:'pvpmentor',l:'對戰指導者 pvpmentor'},{v:'roleplay',l:'角色扮演中 roleplay'},
        {v:'returner',l:'回歸者 returner'}
      ],p.status||''))+
      fRow('職業（選填，可多選；省略＝所有職業）',
        '<div class="job-ctrl-row">'+
          '<button class="job-sel-all" data-id="'+id+'">全選</button>'+
          '<button class="job-sel-none" data-id="'+id+'">全不選</button>'+
        '</div>'+
        '<div class="job-checkbox-grid">'+JOBS.map(function(j){
          var isChecked=(p.jobs||[]).indexOf(j.v)>=0;
          var checked=isChecked?'checked':'';
          return '<label class="job-chk-lbl'+(isChecked?' checked':'')+'"><input type="checkbox" class="mf-chk-job" data-id="'+id+'" data-key="jobs" data-val="'+j.v+'" '+checked+'> '+j.l+'</label>';
        }).join('')+'</div>')+
      fRow('等級範圍（選填）',fInp(id,'lvMin','最低（省略＝所有等級）',p.lvMin,'number','min="1" max="100"')+' ~ '+fInp(id,'lvMax','最高（留空＝與最低相同）',p.lvMax,'number','min="1" max="100"'))+
      fRow('大國防聯軍',fSel(id,'gc',[{v:'',l:'（不篩選）'},{v:'Maelstrom',l:'黑渦團 Maelstrom'},{v:'Order of the Twin Adder',l:'雙蛇黨 Order of the Twin Adder'},{v:'Immortal Flames',l:'恆輝隊 Immortal Flames'}],p.gc||''))+
      fRow('所在地區',fSel(id,'location',[
        {v:'',l:'（不篩選，預設全世界）'},{v:'Limsa Lominsa',l:'利姆薩·羅敏薩'},{v:'Gridania',l:'格里達尼亞'},
        {v:'Ul\'dah',l:'烏爾達哈'},{v:'Ishgard',l:'伊修加德'},{v:'The Black Shroud',l:'黑衣森林'},
        {v:'Thanalan',l:'薩納蘭'},{v:'La Noscea',l:'拉諾西亞'},{v:'Mor Dhona',l:'摩杜納'},
        {v:'Coerthas',l:'庫爾札斯'},{v:'Dravania',l:'龍堡'},{v:'Abalathia\'s Spine',l:'阿巴拉提亞'},
        {v:'Kugane',l:'龍宮城'},{v:'Gyr Abania',l:'基拉巴尼亞'},{v:'Othard',l:'奧薩德'},
        {v:'The Crystarium',l:'水晶都'},{v:'Eulmore',l:'幽爾牧場'},{v:'Norvrandt',l:'諾弗蘭特'}
      ],p.location||''))+
      fRow('語言',fSel(id,'lang',[{v:'',l:'（不篩選，預設當前語言）'},{v:'JA',l:'日文 JA'},{v:'EN',l:'英文 EN'},{v:'FR',l:'法文 FR'},{v:'DE',l:'德文 DE'}],p.lang||''));
    case 'title': return fHint('變更角色稱號。可指定稱號名稱、撤除，或隨機套用已獲得的稱號。')+
      fRow('操作',fSel(id,'sub',[{v:'random',l:'隨機稱號（從已獲得中選）'},{v:'set',l:'指定稱號'},{v:'clear',l:'撤除稱號'}],p.sub||'random'))+
      (p.sub==='set'?fRow('稱號名稱',fInp(id,'titleName','稱號名稱（與遊戲完全一致）',p.titleName)):'');

    /* ── 小隊/社交 新增 ── */
    case 'partycmd': return fHint('執行小隊相關指令。跨服組隊時僅支援「加入」子指令及開啟小隊視窗。')+
      fRow('子指令',fSel(id,'sub',[{v:'',l:'開啟小隊視窗'},{v:'add',l:'邀請玩家加入'},{v:'accept',l:'接受邀請'},{v:'deny',l:'拒絕邀請'},{v:'leader',l:'轉讓隊長'},{v:'leave',l:'退出小隊'},{v:'kick',l:'移除隊員'},{v:'breakup',l:'解散小隊'}],p.sub||''))+
      (['add','leader','kick'].indexOf(p.sub)>=0?fRow('目標',fTgt(id,'target',p.target||'<t>')):'');
    case 'join': return fHint('接受小隊組隊邀請。');
    case 'decline': return fHint('拒絕小隊組隊邀請。');
    case 'invite': return fHint('邀請指定玩家加入小隊。省略目標則邀請當前選中的玩家。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'kick': return fHint('將指定隊員移除小隊。省略目標則對當前選中的玩家執行。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'leader': return fHint('將隊長轉讓給指定玩家。省略目標則對當前選中的玩家執行。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'leave': return fHint('退出當前所在的小隊。');
    case 'psort': return fHint('將小隊列表按指定順序重新排列。');
    case 'meldrequest': return fHint('向指定玩家發送魔晶石鑲嵌委託。省略目標則對當前選中的玩家發送。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'friendlist': return fHint('/flist 執行好友名單相關指令。省略子指令則開啟好友名單視窗。「接受／拒絕」需搭配對方剛送出的好友邀請。')+
      fRow('子指令',fSel(id,'sub',[{v:'',l:'開啟好友名單視窗'},{v:'add',l:'加入（送出好友申請）'},{v:'accept',l:'接受（同意對方的申請）'},{v:'deny',l:'拒絕（拒絕對方的申請）'},{v:'remove',l:'清除（移出好友名單）'}],p.sub||''))+
      (p.sub?fRow('目標',fTgt(id,'target',p.target||'<t>')):'');
    case 'blacklist': return fHint('/blist 執行黑名單相關指令。省略子指令則開啟黑名單視窗。')+
      fRow('子指令',fSel(id,'sub',[{v:'',l:'開啟黑名單視窗'},{v:'add',l:'加入（將對方帳號加入黑名單）'},{v:'remove',l:'清除（將對方移出黑名單）'}],p.sub||''))+
      (p.sub?fRow('目標',fTgt(id,'target',p.target||'<t>')):'');

    /* ── 戰鬥設定（原有）── */
    case 'levelsync': return fHint('/levelsync 同步自己的等級至當前任務上限。再次執行解除同步。');
    case 'statusoff': return renderStatusoffFields(line);
    /* ── 戰鬥設定 新增 ── */
    case 'autolockon': return fHint('開始自動攻擊時是否自動鎖定目標。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟自動鎖定'},{v:'off',l:'關閉自動鎖定'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'autofacetarget': return fHint('發動技能時角色是否自動轉向面對目標。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟自動轉向'},{v:'off',l:'關閉自動轉向'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'autotarget': return fHint('未選中目標時是否自動選中敵對目標。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟自動選中'},{v:'off',l:'關閉自動選中'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'targetself': return fHint('是否可以將自己選為目標。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟選中自己'},{v:'off',l:'關閉選中自己'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'groundclick': return fHint('點擊場景地面時是否取消當前選中的目標。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'點地面取消目標'},{v:'off',l:'關閉此功能'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'duelswitch': return fHint('設定是否強制拒絕其他玩家的決鬥申請。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'強制拒絕決鬥申請'},{v:'off',l:'接受決鬥申請'},{v:'toggle',l:'切換'}],p.toggle||'toggle'));
    case 'actionerror': return fHint('發動技能時，是否在螢幕上顯示錯誤提示（如：「目標超出範圍」）。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示技能錯誤提示'},{v:'off',l:'關閉錯誤提示'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'recasterror': return fHint('技能冷卻中時，是否在螢幕上顯示複唱中的錯誤提示。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示複唱錯誤提示'},{v:'off',l:'關閉錯誤提示'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));

    /* ── 介面/顯示 新增 ── */
    case 'legacymark': return fHint('顯示或隱藏自己角色頭上的十二神印記。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示十二神印記'},{v:'off',l:'隱藏十二神印記'},{v:'toggle',l:'切換（顯示↔隱藏）'}],p.toggle||'toggle'));
    case 'displayhead': return fHint('顯示或隱藏自己的頭部裝備。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示頭部裝備'},{v:'off',l:'隱藏頭部裝備'},{v:'toggle',l:'切換（顯示↔隱藏）'}],p.toggle||'toggle'));
    case 'displayarms': return fHint('收回武器時是否仍顯示武器於角色身上。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'收刀時仍顯示武器'},{v:'off',l:'收刀時隱藏武器'},{v:'toggle',l:'切換（顯示↔隱藏）'}],p.toggle||'toggle'));
    case 'autosheathe': return fHint('戰鬥結束後是否自動收回武器。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'戰鬥後自動收刀'},{v:'off',l:'關閉自動收刀'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'jobhudmode': return fHint('切換職業量譜（量表）的顯示模式（普通↔簡潔）。可針對第1或第2個量譜單獨切換，或全部一起切換。')+
      fRow('量譜',fSel(id,'num',[{v:'',l:'全部量譜一起切換'},{v:'1',l:'第 1 個量譜'},{v:'2',l:'第 2 個量譜'}],p.num||''));
    case 'hudreset': return fHint('將當前介面所有視窗的位置及縮放率重置為初始狀態。');
    case 'uireset': return fHint('將全部介面設定（1~4 組）及所有視窗的位置與縮放率重置為初始狀態。此操作會清除所有介面佈局，請謹慎使用。');
    case 'uiscale': return fHint('調整遊戲介面的縮放倍率。可選擇預設值或重置為初始狀態。')+
      fRow('縮放倍率',fSel(id,'value',[{v:'reset',l:'重置（恢復初始）'},{v:'60',l:'60%'},{v:'80',l:'80%'},{v:'90',l:'90%'},{v:'100',l:'100%（預設）'},{v:'110',l:'110%'},{v:'120',l:'120%'},{v:'140',l:'140%'}],p.value||'100'));
    case 'chatlog': return fHint('調整消息視窗的各項設定，包含字體大小、時間顯示格式及接收訊息的提示音。')+
      fRow('設定類型',fSel(id,'sub',CHATLOG_SUBS,p.sub||'fontsize'))+
      (!p.sub||p.sub==='fontsize'?
        fRow('消息欄編號（選填）',fInp(id,'tabNum','留空＝全部消息欄，填 1~4 指定消息欄',p.tabNum,'number','min="1" max="4"'))+
        fRow('字體大小',fInp(id,'fontSize','請填入字體大小數值',p.fontSize,'number','min="1"'))
      :'')+
      (p.sub==='time_onoff'?
        fRow('消息欄編號（選填）',fInp(id,'tabNum','留空＝全部消息欄，填 1~4 指定消息欄',p.tabNum,'number','min="1" max="4"'))+
        fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟時間顯示'},{v:'off',l:'關閉時間顯示'},{v:'toggle',l:'切換'}],p.toggle||'on'))
      :'')+
      (p.sub==='time_format'?
        fRow('時間格式',fSel(id,'format',[{v:'12',l:'12 小時制'},{v:'24',l:'24 小時制'}],p.format||'24'))
      :'')+
      (p.sub==='time_base'?
        fRow('時間基準',fSel(id,'base',[{v:'local',l:'本地時間'},{v:'server',l:'伺服器時間'}],p.base||'local'))
      :'')+
      (p.sub==='call'?
        fRow('頻道（選填）',fSel(id,'clChannel',[{v:'',l:'省略（預設悄悄話）'}].concat(CHATLOG_CH),p.clChannel||''))+
        fRow('提示音操作',fSel(id,'callAction',[{v:'on',l:'開啟提示音'},{v:'off',l:'關閉提示音'},{v:'toggle',l:'切換'},{v:'sound',l:'指定音效編號'}],p.callAction||'on'))+
        (p.callAction==='sound'?fRow('音效編號',fInp(id,'soundNum','1~16',p.soundNum,'number','min="1" max="16"')):'')
      :'');
    case 'targetring': return fHint('顯示或隱藏目標環（選中目標時腳下的圓環）。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示目標環'},{v:'off',l:'隱藏目標環'},{v:'toggle',l:'切換（顯示↔隱藏）'}],p.toggle||'toggle'));
    case 'targetline': return fHint('顯示或隱藏目標線（自身與目標之間的連線）。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示目標線'},{v:'off',l:'隱藏目標線'},{v:'toggle',l:'切換（顯示↔隱藏）'}],p.toggle||'toggle'));
    case 'linkline': return fHint('顯示或隱藏聯繫線（連接有關聯的目標之間的連線）。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示聯繫線'},{v:'off',l:'隱藏聯繫線'},{v:'toggle',l:'切換（顯示↔隱藏）'}],p.toggle||'toggle'));

    /* ── 熱鍵設定 新增 ── */
    case 'hotbar': return fHint('操作一般熱鍵欄（非對戰區）或 PvP 熱鍵欄（對戰區）。可設置技能、更換、複製、顯示切換、共通設定或清除。')+
      fRow('區域',fSel(id,'zone',[{v:'normal',l:'一般熱鍵欄（非戰鬥區）'},{v:'pvp',l:'PvP 熱鍵欄（對戰區）'}],p.zone||'normal'))+
      fRow('子指令',fSel(id,'sub',HOTBAR_SUBS,p.sub||'set'))+
      ((!p.sub||p.sub==='set')?(
        p.zone==='pvp'?        fRow('類型',fSel(id,'setType',HOTBAR_SET_TYPES_PVP,p.setType||'action'))+
        fRow('名稱',fInp(id,'setName','PvP技能／道具等名稱（與遊戲完全一致）',p.setName))+
        fRow('熱鍵欄編號（選填）',fInp(id,'num','省略＝自動放到最小空位的熱鍵欄；填 1~10 指定',p.num,'number','min="1" max="10"'))+
        fRow('格位編號（選填）',fInp(id,'slot2','省略＝自動放到最小空位；填 1~12 指定',p.slot2,'number','min="1" max="12"')):        fRow('類型',fSel(id,'setType',HOTBAR_SET_TYPES,p.setType||'action'))+
        fRow('名稱',fInp(id,'setName','技能／道具／坐騎等名稱（與遊戲完全一致）',p.setName))+
        fRow('熱鍵欄編號（選填）',fInp(id,'num','省略＝自動放到最小空位的熱鍵欄；填 1~10 指定',p.num,'number','min="1" max="10"'))+
        fRow('格位編號（選填）',fInp(id,'slot2','省略＝自動放到最小空位；填 1~12 指定',p.slot2,'number','min="1" max="12"'))
      ):'')+
      (p.sub==='change'?fRow('熱鍵欄編號',fInp(id,'num','1~10',p.num,'number','min="1" max="10"')):'')+
      (p.sub==='copy'?
        fRow('來源職業',fSel(id,'srcJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.srcJob||'current'))+
        fRow('來源熱鍵欄編號',fInp(id,'srcNum','1~10，或填 current 代表當前熱鍵欄1',p.srcNum))+
        fRow('目標職業',fSel(id,'dstJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.dstJob||'current'))+
        fRow('目標熱鍵欄編號',fInp(id,'dstNum','1~10，或填 current 代表當前熱鍵欄1',p.dstNum))
      :'')+
      (['display','share'].indexOf(p.sub)>=0?
        fRow('熱鍵欄編號',fInp(id,'num','1~10',p.num,'number','min="1" max="10"'))+
        fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟'},{v:'off',l:'關閉'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'))
      :'')+
      (p.sub==='remove'?
        fRow('熱鍵欄編號',fInp(id,'num','1~10',p.num,'number','min="1" max="10"'))+
        fRow('格位',fSel(id,'slot',[{v:'all',l:'全部清除'},{v:'1',l:'格位 1'},{v:'2',l:'格位 2'},{v:'3',l:'格位 3'},{v:'4',l:'格位 4'},{v:'5',l:'格位 5'},{v:'6',l:'格位 6'},{v:'7',l:'格位 7'},{v:'8',l:'格位 8'},{v:'9',l:'格位 9'},{v:'10',l:'格位 10'},{v:'11',l:'格位 11'},{v:'12',l:'格位 12'}],p.slot||'all'))
      :'');
    case 'pvphotbar': return fHint('操作 PvP 專用熱鍵欄（只能在對戰區使用）。可設置PvP技能、更換、複製、顯示切換、共通設定或清除。')+
      fRow('子指令',fSel(id,'sub',HOTBAR_SUBS,p.sub||'set'))+
      ((!p.sub||p.sub==='set')?        fRow('類型',fSel(id,'setType',HOTBAR_SET_TYPES_PVP,p.setType||'action'))+
        fRow('名稱',fInp(id,'setName','PvP技能／道具等名稱（與遊戲完全一致）',p.setName))+
        fRow('熱鍵欄編號（選填）',fInp(id,'num','省略＝自動放到最小空位的熱鍵欄；填 1~10 指定',p.num,'number','min="1" max="10"'))+
        fRow('格位編號（選填）',fInp(id,'slot2','省略＝自動放到最小空位；填 1~12 指定',p.slot2,'number','min="1" max="12"'))
      :'')+
      (p.sub==='change'?fRow('熱鍵欄編號',fInp(id,'num','1~10',p.num,'number','min="1" max="10"')):'')+
      (p.sub==='copy'?
        fRow('來源職業',fSel(id,'srcJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.srcJob||'current'))+
        fRow('來源熱鍵欄編號',fInp(id,'srcNum','1~10，或填 current',p.srcNum))+
        fRow('目標職業',fSel(id,'dstJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.dstJob||'current'))+
        fRow('目標熱鍵欄編號',fInp(id,'dstNum','1~10，或填 current',p.dstNum))
      :'')+
      (['display','share'].indexOf(p.sub)>=0?
        fRow('熱鍵欄編號',fInp(id,'num','1~10',p.num,'number','min="1" max="10"'))+
        fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟'},{v:'off',l:'關閉'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'))
      :'')+
      (p.sub==='remove'?
        fRow('熱鍵欄編號',fInp(id,'num','1~10',p.num,'number','min="1" max="10"'))+
        fRow('格位',fSel(id,'slot',[{v:'all',l:'全部清除'},{v:'1',l:'格位 1'},{v:'2',l:'格位 2'},{v:'3',l:'格位 3'},{v:'4',l:'格位 4'},{v:'5',l:'格位 5'},{v:'6',l:'格位 6'},{v:'7',l:'格位 7'},{v:'8',l:'格位 8'},{v:'9',l:'格位 9'},{v:'10',l:'格位 10'},{v:'11',l:'格位 11'},{v:'12',l:'格位 12'}],p.slot||'all'))
      :'');
    case 'chotbar': return fHint('操作十字熱鍵欄（一般版非對戰區，PvP版對戰區）。可設置技能、更換、複製、共通設定或清除。')+
      fRow('區域',fSel(id,'zone',[{v:'normal',l:'一般十字熱鍵欄（非戰鬥區）'},{v:'pvp',l:'PvP 十字熱鍵欄（對戰區）'}],p.zone||'normal'))+
      fRow('子指令',fSel(id,'sub',[{v:'set',l:'設置技能（將技能/道具等放入指定位置）'},{v:'change',l:'更換（切換到指定編號）'},{v:'copy',l:'複製（複製熱鍵欄內容）'},{v:'share',l:'共通（設定全職業共通）'},{v:'remove',l:'清除（解除指定位置技能）'}],p.sub||'set'))+
      ((!p.sub||p.sub==='set')?(
        p.zone==='pvp'?        fRow('類型',fSel(id,'setType',HOTBAR_SET_TYPES_PVP,p.setType||'action'))+
        fRow('名稱',fInp(id,'setName','PvP技能等名稱（與遊戲完全一致）',p.setName))+
        fRow('十字熱鍵欄編號（選填）',fInp(id,'num','省略＝自動；填 1~8 指定',p.num,'number','min="1" max="8"'))+
        fRow('位置（選填）',fSel(id,'pos',[{v:'',l:'省略（自動放到最小空位）'},{v:'LD1',l:'左 ↙ LD1'},{v:'LD2',l:'左 ↑ LD2'},{v:'LD3',l:'左 ↗ LD3'},{v:'LD4',l:'左 ↓ LD4'},{v:'LA1',l:'左 LA1'},{v:'LA2',l:'左 LA2'},{v:'LA3',l:'左 LA3'},{v:'LA4',l:'左 LA4'},{v:'RD1',l:'右 ↙ RD1'},{v:'RD2',l:'右 ↑ RD2'},{v:'RD3',l:'右 ↗ RD3'},{v:'RD4',l:'右 ↓ RD4'},{v:'RA1',l:'右 RA1'},{v:'RA2',l:'右 RA2'},{v:'RA3',l:'右 RA3'},{v:'RA4',l:'右 RA4'}],p.pos||'')):        fRow('類型',fSel(id,'setType',HOTBAR_SET_TYPES,p.setType||'action'))+
        fRow('名稱',fInp(id,'setName','技能／道具等名稱（與遊戲完全一致）',p.setName))+
        fRow('十字熱鍵欄編號（選填）',fInp(id,'num','省略＝自動；填 1~8 指定',p.num,'number','min="1" max="8"'))+
        fRow('位置（選填）',fSel(id,'pos',[{v:'',l:'省略（自動放到最小空位）'},{v:'LD1',l:'左 ↙ LD1'},{v:'LD2',l:'左 ↑ LD2'},{v:'LD3',l:'左 ↗ LD3'},{v:'LD4',l:'左 ↓ LD4'},{v:'LA1',l:'左 LA1'},{v:'LA2',l:'左 LA2'},{v:'LA3',l:'左 LA3'},{v:'LA4',l:'左 LA4'},{v:'RD1',l:'右 ↙ RD1'},{v:'RD2',l:'右 ↑ RD2'},{v:'RD3',l:'右 ↗ RD3'},{v:'RD4',l:'右 ↓ RD4'},{v:'RA1',l:'右 RA1'},{v:'RA2',l:'右 RA2'},{v:'RA3',l:'右 RA3'},{v:'RA4',l:'右 RA4'}],p.pos||''))
      ):'')+
      (p.sub==='change'?fRow('十字熱鍵欄編號',fInp(id,'num','1~8',p.num,'number','min="1" max="8"')):'')+
      (p.sub==='copy'?
        fRow('來源職業',fSel(id,'srcJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.srcJob||'current'))+
        fRow('來源編號',fInp(id,'srcNum','1~8，或填 current',p.srcNum))+
        fRow('目標職業',fSel(id,'dstJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.dstJob||'current'))+
        fRow('目標編號',fInp(id,'dstNum','1~8，或填 current',p.dstNum))
      :'')+
      (p.sub==='share'?
        fRow('十字熱鍵欄編號',fInp(id,'num','1~8',p.num,'number','min="1" max="8"'))+
        fRow('操作',fSel(id,'toggle',[{v:'on',l:'設為全職業共通'},{v:'off',l:'改為當前職業專用'},{v:'toggle',l:'切換'}],p.toggle||'toggle'))
      :'')+
      (p.sub==='remove'?
        fRow('十字熱鍵欄編號',fInp(id,'num','1~8',p.num,'number','min="1" max="8"'))+
        fRow('位置',fSel(id,'pos',[{v:'all',l:'全部清除'},{v:'LD1',l:'左 ↙ LD1'},{v:'LD2',l:'左 ↑ LD2'},{v:'LD3',l:'左 ↗ LD3'},{v:'LD4',l:'左 ↓ LD4'},{v:'LA1',l:'左 LA1'},{v:'LA2',l:'左 LA2'},{v:'LA3',l:'左 LA3'},{v:'LA4',l:'左 LA4'},{v:'RD1',l:'右 ↙ RD1'},{v:'RD2',l:'右 ↑ RD2'},{v:'RD3',l:'右 ↗ RD3'},{v:'RD4',l:'右 ↓ RD4'},{v:'RA1',l:'右 RA1'},{v:'RA2',l:'右 RA2'},{v:'RA3',l:'右 RA3'},{v:'RA4',l:'右 RA4'}],p.pos||'all'))
      :'');
    case 'pvpchotbar': return fHint('操作 PvP 專用十字熱鍵欄（只能在對戰區使用）。可設置PvP技能、更換、複製、共通設定或清除。')+
      fRow('子指令',fSel(id,'sub',[{v:'set',l:'設置技能（將PvP技能等放入指定位置）'},{v:'change',l:'更換（切換到指定編號）'},{v:'copy',l:'複製（複製熱鍵欄內容）'},{v:'share',l:'共通（設定全職業共通）'},{v:'remove',l:'清除（解除指定位置技能）'}],p.sub||'set'))+
      ((!p.sub||p.sub==='set')?        fRow('類型',fSel(id,'setType',HOTBAR_SET_TYPES_PVP,p.setType||'action'))+
        fRow('名稱',fInp(id,'setName','PvP技能等名稱（與遊戲完全一致）',p.setName))+
        fRow('十字熱鍵欄編號（選填）',fInp(id,'num','省略＝自動；填 1~8 指定',p.num,'number','min="1" max="8"'))+
        fRow('位置（選填）',fSel(id,'pos',[{v:'',l:'省略（自動放到最小空位）'},{v:'LD1',l:'左 ↙ LD1'},{v:'LD2',l:'左 ↑ LD2'},{v:'LD3',l:'左 ↗ LD3'},{v:'LD4',l:'左 ↓ LD4'},{v:'LA1',l:'左 LA1'},{v:'LA2',l:'左 LA2'},{v:'LA3',l:'左 LA3'},{v:'LA4',l:'左 LA4'},{v:'RD1',l:'右 ↙ RD1'},{v:'RD2',l:'右 ↑ RD2'},{v:'RD3',l:'右 ↗ RD3'},{v:'RD4',l:'右 ↓ RD4'},{v:'RA1',l:'右 RA1'},{v:'RA2',l:'右 RA2'},{v:'RA3',l:'右 RA3'},{v:'RA4',l:'右 RA4'}],p.pos||''))
      :'')+
      (p.sub==='change'?fRow('十字熱鍵欄編號',fInp(id,'num','1~8',p.num,'number','min="1" max="8"')):'')+
      (p.sub==='copy'?
        fRow('來源職業',fSel(id,'srcJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.srcJob||'current'))+
        fRow('來源編號',fInp(id,'srcNum','1~8，或填 current',p.srcNum))+
        fRow('目標職業',fSel(id,'dstJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.dstJob||'current'))+
        fRow('目標編號',fInp(id,'dstNum','1~8，或填 current',p.dstNum))
      :'')+
      (p.sub==='share'?
        fRow('十字熱鍵欄編號',fInp(id,'num','1~8',p.num,'number','min="1" max="8"'))+
        fRow('操作',fSel(id,'toggle',[{v:'on',l:'設為全職業共通'},{v:'off',l:'改為當前職業專用'},{v:'toggle',l:'切換'}],p.toggle||'toggle'))
      :'')+
      (p.sub==='remove'?
        fRow('十字熱鍵欄編號',fInp(id,'num','1~8',p.num,'number','min="1" max="8"'))+
        fRow('位置',fSel(id,'pos',[{v:'all',l:'全部清除'},{v:'LD1',l:'左 ↙ LD1'},{v:'LD2',l:'左 ↑ LD2'},{v:'LD3',l:'左 ↗ LD3'},{v:'LD4',l:'左 ↓ LD4'},{v:'LA1',l:'左 LA1'},{v:'LA2',l:'左 LA2'},{v:'LA3',l:'左 LA3'},{v:'LA4',l:'左 LA4'},{v:'RD1',l:'右 ↙ RD1'},{v:'RD2',l:'右 ↑ RD2'},{v:'RD3',l:'右 ↗ RD3'},{v:'RD4',l:'右 ↓ RD4'},{v:'RA1',l:'右 RA1'},{v:'RA2',l:'右 RA2'},{v:'RA3',l:'右 RA3'},{v:'RA4',l:'右 RA4'}],p.pos||'all'))
      :'');
    case 'chotbardisplay': return fHint('設定是否一直顯示十字熱鍵欄（即使未按下 LT/RT 也持續顯示）。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'一直顯示十字熱鍵欄'},{v:'off',l:'關閉一直顯示'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'chotbartype': return fHint('變更十字熱鍵欄的操作類型。按住：需持續按 LT/RT；單擊：點一下切換；混合：結合兩者。')+
      fRow('操作類型',fSel(id,'type',[{v:'hold',l:'按住（Hold）'},{v:'toggle',l:'單擊（Toggle）'},{v:'mix',l:'混合（Mix）'}],p.type||'hold'));

    /* ── 畫面/音效 新增 ── */
    case 'gpreset': return fHint('快速切換圖像品質預設設定。')+
      fRow('預設組',fSel(id,'num',GPRESET_OPTS,p.num||'2'));
    case 'mastervolume': return fHint('調整遊戲整體音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'bgm': return fHint('調整背景音樂音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'soundeffects': return fHint('調整整體音效音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'voice': return fHint('調整語音音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'systemsounds': return fHint('調整系統音效音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'ambientsounds': return fHint('調整環境音效音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'soundeffectsself': return fHint('調整自己角色的音效音量（0~100）。')+
      fRow('音量',fInp(id,'value','0~100',p.value,'number','min="0" max="100"'));
    case 'soundeffectsparty': return fHint('調整小隊成員的音效音量（0~100）。')+
      fRow('音量',fInp(id,'value','0~100',p.value,'number','min="0" max="100"'));
    case 'soundeffectsother': return fHint('調整其他玩家的音效音量（0~100）。')+
      fRow('音量',fInp(id,'value','0~100',p.value,'number','min="0" max="100"'));
    case 'performsounds': return fHint('調整樂器演奏的音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'mountbgm': return fHint('設定騎乘坐騎時是否播放坐騎專屬背景音樂。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'播放坐騎音樂'},{v:'off',l:'不播放坐騎音樂'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'systemsoundsspeaker': return fHint('調整 PS4/PS5/Windows DX11 無線手柄揚聲器的系統音效音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));

    /* ── 魔素板 新增 ── */
    case 'magiaright': return fHint('將魔素板順時針轉動一格，切換到下一個屬性。');
    case 'magialeft': return fHint('將魔素板逆時針轉動一格，切換到上一個屬性。');
    case 'magiaattack': return fHint('自動將魔素板切換為攻擊時克制當前目標的屬性。省略目標則使用當前選中的目標。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'magiadefense': return fHint('自動將魔素板切換為與當前目標相同的屬性（利於防禦）。省略目標則使用當前選中的目標。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'magiaauto': return fHint('設定魔素板是否在選中目標後自動切換屬性。')+
      fRow('模式',fSel(id,'mode',[{v:'atk',l:'攻勢（自動切換為克制屬性）'},{v:'def',l:'守勢（自動切換為相同屬性）'},{v:'off',l:'關閉自動調整'}],p.mode||'off'));

    /* ── 雜項/系統 新增 ── */
    case 'playtime': return fHint('在消息欄顯示當前角色的累計遊戲時間。');
    case 'logout': return fHint('退出遊戲並回到標題畫面。');
    case 'shutdown': return fHint('直接退出並結束遊戲程式。');
    case 'instance': return fHint('檢查當前所在地區是否為副本區域，並在消息欄顯示結果。');
    case 'patchnote': return fHint('開啟瀏覽器並前往官方網站的版本更新筆記頁面。');

    /* ── 巨集設定 ── */
    case 'micon': return fHint('設定巨集在熱鍵欄上顯示的圖示。同一巨集只有第一個 /micon 生效，建議放第一行。')+
      fRow('圖示類型',fSel(id,'miconType',MICON_T,p.miconType||'action'))+
      fRow(p.miconType==='gearset'?'套裝編號':'名稱',fInp(id,'miconName',p.miconType==='gearset'?'套裝編號（數字）':'名稱（與遊戲完全一致）',p.miconName));
    case 'mlock': return fHint('/mlock 讓巨集執行完畢前不允許其他巨集打斷。建議複雜巨集使用，放在第一行效果最好（亦可用上方全域設定）。');
    case 'merror_line': return fHint('控制巨集執行時是否顯示錯誤訊息。巨集結束後自動恢復顯示，無需手動開啟。')+
      fRow('設定',fSel(id,'onOff',[{v:'off',l:'關閉錯誤提示（適合技能輪換、整理類巨集）'},{v:'on',l:'開啟錯誤提示'},{v:'toggle',l:'切換'}],p.onOff||'off'));
    case 'wait_line': return fHint('在巨集中插入等待時間（1~60秒）。讓後續行在指定秒數後才執行。')+
      fRow('等待秒數',fInp(id,'secs','1~60',p.secs,'number','min="1" max="60"'));
    case 'random': return fHint('在說話範圍內廣播一個隨機數字。省略上限值時從 0~999 中抽取；指定上限值則從 1~N 抽取。')+
      fRow('上限值（選填）',fInp(id,'max','省略則 0~999；填入數字則 1~N',p.max,'number','min="2" max="999"'));
    case 'custom': return fHint('直接輸入任何完整指令，原樣輸出。請確保語法完全正確，工具不做任何處理。')+
      fRow('完整指令',fInp(id,'text','輸入完整指令，如：/ta <t>',p.text));

    default: return fHint('選擇行類型以顯示設定選項。');
  }
}

function renderChatFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('在指定頻道發送訊息。可附加音效，或在行末加入等待時間讓後續行延遲執行。')+
    fRow('頻道',fCH(id,'channel',p.channel||'p'))+
    fRow('訊息',fMsgInp(id,'message','輸入訊息內容…',p.message))+
    fRow('音效',fSE(id,'se',p.se))+
    fRow('行末等待',fInp(id,'inlineWait','0',p.inlineWait,'number','min="0" max="60"'),'秒（0＝不等待）');
}
function renderChatCountdownFields(line){
  var p=line.params||{}, id=line.id;
  if(!p.msgs||!p.msgs.length) p.msgs=[{text:'',wait:0,se:'',channel:''}];
  var msgs=p.msgs;
  var chips='<span class="ipr-t">插入</span>'+quickProChips();
  function chOptionsFor(sel){
    var opts='<option value=""'+(sel?'':' selected')+'>（使用上方預設頻道）</option>';
    opts+=CH.map(function(c){return '<option value="'+c.v+'"'+(sel===c.v?' selected':'')+'>'+c.l+'</option>';}).join('');
    return opts;
  }
  var rows=msgs.map(function(m,i){
    return '<div class="ccd-msg-block">'+
      '<div class="ccd-row">'+
        '<span class="ccd-num">'+(i+1)+'</span>'+
        '<div class="msg-inp-wrap ccd-msg-wrap">'+
          '<input class="mf-inp ccd-text msg-inp" data-id="'+id+'" data-idx="'+i+'" placeholder="訊息內容" value="'+esc(m.text||'')+'">'+
          '<div class="inline-pro-row">'+chips+'</div>'+
        '</div>'+
        '<button class="ccd-del" data-id="'+id+'" data-idx="'+i+'" title="刪除此行">✕</button>'+
      '</div>'+
      '<div class="ccd-meta-row">'+
        '<span class="ccd-meta-item"><span class="ccd-meta-label">頻道</span>'+
          '<select class="mf-sel ccd-ch" data-id="'+id+'" data-idx="'+i+'" title="此行頻道（留空則用上方預設頻道）">'+chOptionsFor(m.channel||'')+'</select></span>'+
        '<span class="ccd-meta-item"><span class="ccd-meta-label">音效</span>'+
          '<select class="mf-sel ccd-se" data-id="'+id+'" data-idx="'+i+'">'+'<option value="">無音效</option>'+SE.map(function(s){return '<option value="'+s.v+'"'+(m.se===s.v?' selected':'')+'>'+s.l+'</option>';}).join('')+'</select></span>'+
        '<span class="ccd-meta-item"><span class="ccd-meta-label">等待秒數</span>'+
          '<input class="mf-inp ccd-wait" data-id="'+id+'" data-idx="'+i+'" type="number" min="0" max="60" value="'+esc(m.wait===undefined||m.wait===null||m.wait===''?'0':String(m.wait))+'"></span>'+
      '</div>'+
    '</div>';
  }).join('');
  return fHint('一次輸出多行聊天訊息，每行可附加等待時間，可用於倒數、排文字圖樣、多頻道發言、說故事等。預設全部使用同一個頻道，若某幾行想改用其他頻道（例如平時用小隊、最後一行改用喊話），可在該行的「此行頻道」個別覆寫，留空則沿用上方預設頻道。')+
    fRow('預設頻道',fCH(id,'channel',p.channel||'p'))+
    '<div class="ccd-list" id="ccd-list-'+id+'">'+rows+'</div>'+
    '<button class="ccd-add" data-id="'+id+'">＋ 新增行</button>';
}
function renderEchoFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/e 僅自己可見，不會出現在他人畫面。適合用來確認巨集執行進度。')+
    fRow('訊息',fMsgInp(id,'message','輸入提示訊息…',p.message))+
    fRow('音效',fSE(id,'se',p.se));
}
function renderTellFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('傳送悄悄話給指定玩家。指定方式：<t> 目前目標、直接輸入玩家名稱（格式：名字 姓氏）。')+
    fRow('目標',fTgt(id,'target',p.target||'<t>'))+
    fRow('訊息',fMsgInp(id,'message','輸入悄悄話內容…',p.message));
}
function renderReplyFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/r 回覆最後一個傳悄悄話給你的玩家。')+
    fRow('訊息',fMsgInp(id,'message','輸入回覆內容…',p.message));
}
function renderEmFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/em 顯示第三人稱的自訂文字（如：玩家名 向你微笑。）。所有附近玩家都能看到。')+
    fRow('文字內容',fMsgInp(id,'text','如：向 <t> 微笑。',p.text))+
    fRow('',fChk(id,'addMotion','同時播放情感動作',p.addMotion))+
    (p.addMotion?fRow('情感動作',fEmoteCombo(id,'motionEmote',p.motionEmote||'bow')+
      (p.motionEmote==='custom'?fInp(id,'motionCustom','輸入情感動作的英文指令名（如 bow）',p.motionCustom):'')):'');
}
function renderCheckFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/check（縮寫 /c）查看目標玩家的詳細情報視窗。省略目標則查看當前選中的目標。')+
    fRow('目標（選填）',fTgt(id,'target',p.target||''));
}
function renderTradeFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/trade 向指定玩家發起交易請求，對方需在附近才能成立。省略目標則向當前選中的目標發起交易。')+
    fRow('目標（選填）',fTgt(id,'target',p.target||''));
}
function renderAssistFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/as 以目標的目標作為新目標（通常用於跟隨坦克選怪）。')+
    fRow('目標',fTgt(id,'target',p.target||'<t>'));
}
function renderFocusTargetFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/focustarget 設定焦點目標（單獨顯示在畫面角落），省略目標則清除焦點目標。')+
    fRow('目標（省略則清除）',fTgt(id,'target',p.target||''));
}
function renderFaceTargetFields(line){
  return fHint('/ft 讓角色立即轉向面對當前選中的目標。');
}
function renderLockOnFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/lo 鎖定當前目標（持續追蹤目標方向）。省略目標則鎖定當前選中目標。')+
    fRow('目標（選填）',fTgt(id,'target',p.target||''));
}
function renderCountdownFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/cd 開始戰鬥倒計時（5~30秒）。省略秒數則開啟倒計時視窗。')+
    fRow('秒數（選填）',fInp(id,'secs','5~30，省略則開啟視窗',p.secs,'number','min="5" max="30"'));
}
function renderReadycheckFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/rcheck 向小隊發起準備確認。所有成員需各自回應準備完畢或未準備好。')+
    fRow('',fChk(id,'notify','確認後在頻道通知',p.notify))+
    (p.notify?fRow('通知訊息',fMsgInp(id,'notifyMsg','準備確認！',p.notifyMsg))+
      fRow('頻道',fCH(id,'notifyChannel',p.notifyChannel))+
      fRow('音效',fSE(id,'notifySe',p.notifySe)):'');
}
function renderFollowFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/follow 跟隨指定目標移動。省略目標則跟隨當前選中的角色。再次執行停止跟隨。')+
    fRow('目標（選填）',fTgt(id,'target',p.target||''));
}
function renderBattleModeFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/bm 切換拔刀/收刀狀態。可選擇強制拔刀、強制收刀，或在兩者之間切換。')+
    fRow('操作',fSel(id,'toggle',[{v:'toggle',l:'切換（拔刀↔收刀）'},{v:'draw',l:'拔刀'},{v:'sheathe',l:'收刀'}],p.toggle||'toggle'));
}
function renderMountFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/mount 乘上指定坐騎。已騎乘時執行會跳下。省略坐騎名則直接跳下當前坐騎。')+
    fRow('坐騎名稱（選填）',fInp(id,'mountName','坐騎名稱（與遊戲完全一致），省略則跳下坐騎',p.mountName));
}
function renderMinionFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/minion 召喚指定寵物。已召喚同一隻時再次執行會讓牠離開。')+
    fRow('寵物名稱',fInp(id,'minionName','寵物名稱（與遊戲完全一致）',p.minionName));
}
function renderStatusoffFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/statusoff "狀態名稱" 解除自身指定的單一強化狀態（如食物效果、藥水效果），需與遊戲內顯示名稱完全一致。')+
    fRow('狀態名稱',fInp(id,'statusName','狀態名稱（與遊戲完全一致），如：舍身',p.statusName));
}
function renderNameplateFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/nameplatedisp 設定指定對象的名牌「顯示時機」（何時看得到名牌）。若要改的是名牌上顯示全名／略名，請改用「名牌顯示格式 /nameplatetype」。')+
    fRow('對象',fSel(id,'target',[
      {v:'all',l:'全部玩家'},{v:'self',l:'自己'},{v:'party',l:'小隊成員'},
      {v:'alliance',l:'團隊成員'},{v:'other',l:'其他玩家'},{v:'friend',l:'好友'},
      {v:'feast',l:'群狼盛宴敵人'}],p.target||'all'))+
    fRow('顯示設定',fSel(id,'setting',[
      {v:'1',l:'1 — 一直顯示'},{v:'2',l:'2 — 戰鬥時顯示'},
      {v:'3',l:'3 — 選為目標時顯示'},{v:'4',l:'4 — 不顯示'}],p.setting||'1'));
}
function renderNameplateTypeFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/nameplatetype 設定指定對象的名牌「顯示格式」（名字要顯示全名還是縮寫）。若要改的是名牌何時看得到，請改用「名牌顯示時機 /nameplatedisp」。')+
    fRow('對象',fSel(id,'target',[
      {v:'all',l:'全部玩家'},{v:'self',l:'自己'},{v:'party',l:'小隊成員'},
      {v:'alliance',l:'團隊成員'},{v:'other',l:'其他玩家'},{v:'friend',l:'好友'},
      {v:'feast',l:'群狼盛宴敵人'}],p.target||'all'))+
    fRow('格式',fSel(id,'setting',[
      {v:'1',l:'1 — 全名'},{v:'2',l:'2 — 略姓（僅顯示名，姓縮寫）'},
      {v:'3',l:'3 — 略名（僅顯示姓，名縮寫）'},{v:'4',l:'4 — 縮寫（僅顯示姓名首字母）'}],p.setting||'1'));
}
function renderBattleEffectFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/battleeffect 設定戰鬥特效的顯示密度，可分別設定自己、小隊、他人、PvP敵人。')+
    fRow('對象',fSel(id,'effTarget',[
      {v:'self',l:'自己'},{v:'party',l:'小隊'},{v:'other',l:'他人'},{v:'enemypc',l:'PvP敵方玩家'}],p.effTarget||'self'))+
    fRow('顯示類型',fSel(id,'effType',[
      {v:'all',l:'完全顯示'},{v:'simple',l:'簡單顯示'},{v:'off',l:'不顯示'}],p.effType||'all'));
}

function renderSkillFields(line,type){
  var p=line.params||{}, id=line.id;
  var labelMap={'skill':'職業技能（需要學會才能使用，如：治癒、神聖領域）',
    'generalskill':'通用技能（所有職業都有的動作，如：跳躍、衝刺、極限技）',
    'blueaction':'青魔法技能（青魔法師專用，需設定為有效技能）',
    'pvpaction':'PvP技能（只在對戰區生效）',
    'petaction':'召喚獸技能（控制召喚師的召喚獸）',
    'companionaction':'搭擋技能（控制陸行鳥搭擋）'};
  var cmdMap={'skill':'/ac','generalskill':'/gaction','blueaction':'/blueaction',
    'pvpaction':'/pvpaction','petaction':'/petaction','companionaction':'/companionaction'};
  var groundHint=type!=='companionaction'?'　若技能需要「地面目標」（如縮地、部分場地技），省略目標或不勾選地面關時，執行後角色會進入地面瞄準模式等待你點擊；勾選「地面關」則直接對目前所指位置發動，不進入瞄準模式。':'';
  return fHint(labelMap[type]+'　以自己為目標的技能可省略「目標」欄位。'+groundHint)+
    fRow('技能名稱',fInp(id,'skillName','技能名稱（與遊戲完全一致）',p.skillName))+
    (type!=='companionaction'&&!p.groundOff?fRow('目標',fTgt(id,'target',p.target||'<t>')):'')+
    (type!=='companionaction'?fRow('',fChk(id,'groundOff','地面關（gtoff，僅地面目標技能適用，勾選後直接對所指位置發動，忽略目標欄位）',p.groundOff)):'')+
    fRow('等待秒數',fInp(id,'inlineWait','0',p.inlineWait,'number','min="0" max="60"'),'秒（0＝不等待，加在行末 &lt;wait.X&gt;）')+
    (type==='skill'?'<div class="mf-combat-warn">⚠ 職業技能巨集可能干擾 GCD 循環，建議只用於低頻技能或非高強度戰鬥</div>':'')+
    fSep('附加選項（每勾選一項增加一行輸出）')+
    fRow('',fChk(id,'preAnnounce','施放前預告（先在頻道發出訊息，等待後再施放）',p.preAnnounce))+
    (p.preAnnounce?
      fRow('預告訊息',fMsgInp(id,'preAnnounceMsg','即將施放技能！',p.preAnnounceMsg))+
      fRow('頻道',fCH(id,'preAnnounceChannel',p.preAnnounceChannel))+
      fRow('等待秒數',fInp(id,'preAnnounceWait','2',p.preAnnounceWait,'number','min="0" max="60"'),'秒（等待後再施放）')+
      fRow('音效',fSE(id,'preAnnounceSe',p.preAnnounceSe)):'')+
    fRow('',fChk(id,'postNotify','施放後立即在頻道通知',p.postNotify))+
    (p.postNotify?
      fRow('通知訊息',fMsgInp(id,'postNotifyMsg','技能已施放！',p.postNotifyMsg))+
      fRow('頻道',fCH(id,'postNotifyChannel',p.postNotifyChannel))+
      fRow('音效',fSE(id,'postNotifySe',p.postNotifySe)):'')+
    fRow('',fChk(id,'postEcho','施放後自我提示（僅自己看到）',p.postEcho))+
    (p.postEcho?
      fRow('提示訊息',fMsgInp(id,'postEchoMsg','技能使用完畢',p.postEchoMsg))+
      fRow('音效',fSE(id,'postEchoSe',p.postEchoSe)):'')+
    fRow('',fChk(id,'recastNotify','施放後顯示冷卻時間（使用 &lt;recast&gt; 代名詞）',p.recastNotify))+
    (p.recastNotify?
      fRow('前綴文字',fInp(id,'recastPrefix','留空則自動填入【技能名】剩餘冷卻：',p.recastPrefix))+
      fRow('後綴文字',fInp(id,'recastSuffix',' 秒',p.recastSuffix||' 秒'))+
      fRow('發送到',fSel(id,'recastChannel',[{v:'e',l:'默語（僅自己）'},{v:'p',l:'小隊'},{v:'fc',l:'部隊'}],p.recastChannel||'e'))+
      fRow('音效',fSE(id,'recastSe',p.recastSe)):''
    );
}

function renderItemFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('使用背包中的指定道具。道具必須在背包裡才能執行，名稱需與遊戲完全一致。')+
    fRow('道具名稱',fInp(id,'itemName','道具名稱（與遊戲完全一致，如：高級乙太藥）',p.itemName))+
    fRow('目標',fTgt(id,'target',p.target||'<me>'))+
    fSep('附加選項')+
    fRow('',fChk(id,'postEcho','使用後顯示確認訊息（僅自己看到）',p.postEcho))+
    (p.postEcho?fRow('確認訊息',fMsgInp(id,'postEchoMsg','已使用：'+(p.itemName||'道具名稱'),p.postEchoMsg))+fRow('音效',fSE(id,'postEchoSe',p.postEchoSe)):'');
}

function renderEmoteFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('播放指定情感動作。勾選「僅播動作」後加上 motion 子命令，只播放動作動畫但不顯示文字提示。')+
    fRow('情感動作',fEmoteCombo(id,'emoteName',p.emoteName||'bow')+
      (p.emoteName==='custom'?fInp(id,'emoteCustom','輸入情感動作的英文指令名（如 bow）',p.emoteCustom):''))+
    fRow('',fChk(id,'motionOnly','僅播動作，不顯示文字提示（加上 motion）',p.motionOnly))+
    fSep('選填：同時發出感情表現文字')+
    fHint('情感動作後緊接 /em 文字，效果：角色播放動作，同時顯示第三人稱自訂文字。')+
    fRow('',fChk(id,'addEm','附加感情表現文字（/em）',p.addEm))+
    (p.addEm?fRow('文字內容',fMsgInp(id,'emText','如：向 <t> 深深一鞠躬。',p.emText))+fRow('音效',fSE(id,'emSe',p.emSe)):'');
}

function renderAbilityRotation(line){
  var p=line.params||{}, id=line.id;
  if(!p.skills||!p.skills.length) p.skills=['','',''];
  var skills=p.skills;
  var skillInputs=skills.map(function(s,i){
    return '<div class="ar-skill-row"><span class="ar-num">'+(i+1)+'</span>'+
      '<input class="mf-inp ar-skill" data-id="'+id+'" data-ar-idx="'+i+'" placeholder="技能名稱（與遊戲完全一致）" value="'+esc(s)+'">'+'<button class="ar-del" data-id="'+id+'" data-ar-idx="'+i+'">✕</button></div>';
  }).join('');
  return fHint('將多個能力技（不佔 GCD 的技能）排在一起。反覆按下此巨集，會依序嘗試施放每個技能，冷卻中的會跳過（建議搭配全局 /merror off 或在上方勾選）。')+
    '<div class="mf-combat-warn">⚠ 此功能需要技能均為「能力技」（不佔 GCD 的瞬發技），若放入佔 GCD 的技能會影響循環。</div>'+
    fRow('目標',fTgt(id,'target',p.target||'<t>'))+
    fRow('等待秒數',fInp(id,'inlineWait','0',p.inlineWait,'number','min="0" max="60"'),'秒（一般能力技不需等待）')+
    fSep('技能列表（按上至下順序排列）')+
    '<div class="ar-list" id="ar-list-'+id+'">'+skillInputs+'</div>'+
    '<button class="ar-add" data-id="'+id+'">＋ 新增技能</button>';
}

function renderTargetingFields(line){
  var p=line.params||{}, id=line.id;
  var cmds=[
    {v:'/bt',l:'/bt　選中最近敵視目標（最常用）'},
    {v:'/ta',l:'/ta　選中指定目標（搭配代名詞）'},
    {v:'/tpc',l:'/tpc　選中最近玩家'},
    {v:'/tnpc',l:'/tnpc　選中最近 NPC'},
    {v:'/tenemy',l:'/tenemy　選中最近敵人'},
    {v:'/nt',l:'/nt　向右順次選中下一個目標'},
    {v:'/previoustarget',l:'/previoustarget　向左選中上一個目標'},
    {v:'/tlt',l:'/tlt　重新選中上次目標'},
    {v:'/tle',l:'/tle　重新選中前次敵人'}
  ];
  return fHint('選中指定種類的目標。')+
    fRow('指令',fSel(id,'targetCmd',cmds,p.targetCmd||'/bt'))+
    ((!p.targetCmd||p.targetCmd==='/bt'||p.targetCmd==='/ta'||p.targetCmd==='/as')?
      fRow('目標（選填）',fTgt(id,'targetParam',p.targetParam||'')):'');
}

function renderMarkingFields(line){
  var p=line.params||{}, id=line.id;
  var mkTypes=[
    {v:'attack',l:'攻擊（自動下一個編號）'},{v:'attack1',l:'攻擊1'},{v:'attack2',l:'攻擊2'},
    {v:'attack3',l:'攻擊3'},{v:'attack4',l:'攻擊4'},{v:'attack5',l:'攻擊5'},
    {v:'bind',l:'止步（自動下一個編號）'},{v:'bind1',l:'止步1'},{v:'bind2',l:'止步2'},{v:'bind3',l:'止步3'},
    {v:'stop',l:'禁止（自動下一個編號）'},{v:'stop1',l:'禁止1'},{v:'stop2',l:'禁止2'},
    {v:'square',l:'方塊'},{v:'circle',l:'圓圈'},{v:'cross',l:'叉'},{v:'triangle',l:'三角'},
    {v:'clear',l:'清除所有標記'}
  ];
  return fHint('給目標加上攻擊順序或形狀標記。小隊成員都能看到標記。')+
    fRow('標記種類',fSel(id,'markType',mkTypes,p.markType||'attack1'))+
    (p.markType!=='clear'?fRow('標記目標',fTgt(id,'markTarget',p.markTarget||'<t>')):'')+
    fSep('選填：完成後通知')+
    fRow('',fChk(id,'notify','完成後在頻道通知',p.notify))+
    (p.notify?fRow('訊息',fMsgInp(id,'notifyMsg','標記已設定！',p.notifyMsg))+fRow('頻道',fCH(id,'notifyChannel',p.notifyChannel))+fRow('音效',fSE(id,'notifySe',p.notifySe)):'');
}

function renderWaymarkFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/wmark 設置場景標記（A/B/C/D 或 1~4），讓隊友知道站位或集合點。也可將目前擺放的整組標記存成預設，之後一鍵讀取。')+
    fRow('模式',fSel(id,'waymarkAction',
      [{v:'toggle',l:'切換單一標記（已設定則撤除）'},{v:'target',l:'將單一標記設在當前目標腳下（<t>）'},
       {v:'clear',l:'清除所有場景標記'},{v:'save',l:'儲存目前擺放為預設'},{v:'preset',l:'讀取已儲存的預設'}],
      p.waymarkAction||'toggle'))+
    (['toggle','target'].indexOf(p.waymarkAction||'toggle')>=0?
      fRow('標記',fSel(id,'waymarkName',[{v:'A',l:'A'},{v:'B',l:'B'},{v:'C',l:'C'},{v:'D',l:'D'},{v:'1',l:'1'},{v:'2',l:'2'},{v:'3',l:'3'},{v:'4',l:'4'}],p.waymarkName||'A')):'')+
    (['save','preset'].indexOf(p.waymarkAction)>=0?
      fRow('預設編號',fSel(id,'presetSlot',[{v:'1',l:'1'},{v:'2',l:'2'},{v:'3',l:'3'},{v:'4',l:'4'},{v:'5',l:'5'}],p.presetSlot||'1')):'')+
    fSep('選填：完成後通知')+
    fRow('',fChk(id,'notify','完成後在頻道通知',p.notify))+
    (p.notify?fRow('訊息',fMsgInp(id,'notifyMsg','場景標記已設置！',p.notifyMsg))+fRow('頻道',fCH(id,'notifyChannel',p.notifyChannel))+fRow('音效',fSE(id,'notifySe',p.notifySe)):'');
}



function renderGearsetFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/gs 切換、儲存、刪除或查看裝備套裝。套裝編號也可用套裝名稱的開頭字母代替。可附加圖示和確認訊息，讓熱鍵欄視覺效果統一。')+
    fRow('動作',fSel(id,'gsAction',[{v:'change',l:'切換套裝'},{v:'save',l:'儲存當前裝備至此編號'},{v:'view',l:'查看套裝內容'},{v:'delete',l:'刪除此編號套裝（僅刪除套裝紀錄，不影響裝備本身）'}],p.gsAction||'change'))+
    fRow('套裝編號',fInp(id,'gsNumber','1',p.gsNumber,'number','min="1" max="100"'),'（1~100，或填套裝名稱）')+
    (p.gsAction==='change'?fRow('投影板編號（選填）',fInp(id,'plateNumber','若有投影板功能可指定要套用的板號',p.plateNumber,'number','min="1"')):'')+
    fSep('附加選項')+
    fRow('',fChk(id,'addMicon','加入巨集圖示（/micon，讓熱鍵欄顯示套裝圖示）',p.addMicon))+
    (p.addMicon?fRow('圖示類型',fSel(id,'miconType',MICON_T,p.miconType||'gearset')):'')+
    fRow('',fChk(id,'addEcho','加入切換確認訊息（僅自己看到）',p.addEcho))+
    (p.addEcho?fRow('確認訊息',fMsgInp(id,'echoMsg','已切換至套裝 '+(p.gsNumber||'1'),p.echoMsg))+fRow('音效',fSE(id,'echoSe',p.echoSe)):'');
}

function renderItemsortFields(line){
  var p=line.params||{}, id=line.id;
  var areaChecks=IS_AREAS.map(function(a){
    var checked=(p.areas||[]).indexOf(a.v)>=0;
    return '<label class="is-area-lbl'+(checked?' checked':'')+'"><input type="checkbox" class="is-area-cb" data-id="'+id+'" data-area="'+a.v+'"'+(checked?' checked':'')+'>'+a.l+'</label>';
  }).join('');
  var conds=p.conditions||[];
  var condRows=conds.map(function(c,ci){
    var cdef=IS_C.filter(function(x){return x.v===c.criterion;})[0];
    return '<div class="is-cond-row">'+
      '<select class="mf-sel is-crit-sel" data-id="'+id+'" data-ci="'+ci+'">'+
        IS_C.map(function(x){return'<option value="'+x.v+'"'+(x.v===c.criterion?' selected':'')+'>'+x.l+'</option>';}).join('')+
      '</select>'+
      (cdef&&cdef.o?'<select class="mf-sel is-ord-sel" data-id="'+id+'" data-ci="'+ci+'"><option value="des"'+(c.order==='des'?' selected':'')+'>降序（高→低）</option><option value="asc"'+(c.order==='asc'?' selected':'')+'>升序（低→高）</option></select>':'<span class="mf-unit">（無升降序）</span>')+
      '<button class="is-del-cond" data-id="'+id+'" data-ci="'+ci+'">✕</button>'+
    '</div>';
  }).join('');
  return fHint('按設定條件整理指定區域的物品。每個區域依照排序條件的順序（上方優先）重新排列。注意：勾選「雇員物品」或「陸行鳥鞍囊」時，該視窗必須已經開啟才會生效（可在巨集最前面加一行開啟該視窗的指令）。')+
    fSep('整理目標（可多選）')+
    '<div class="is-area-wrap">'+
      '<button class="is-sel-common" data-id="'+id+'">常用整理（背包＋兵裝庫＋鞍囊）</button>'+
      '<button class="is-sel-all" data-id="'+id+'">全選</button>'+
      '<button class="is-sel-none" data-id="'+id+'">全不選</button>'+
    '</div>'+
    '<div class="is-areas" id="is-areas-'+id+'">'+areaChecks+'</div>'+
    fRow('',fChk(id,'useClear','每個區域排序前先執行 /itemsort clear（清除舊設定，使結果更乾淨）',p.useClear!==false))+
    fSep('排序條件（由上至下優先順序）')+
    '<div class="is-conds" id="is-conds-'+id+'">'+condRows+'</div>'+
    '<button class="is-add-cond" data-id="'+id+'">＋ 新增條件</button>'+
    fSep('完成後確認訊息（選填）')+
    fRow('訊息',fMsgInp(id,'echoMsg','整理完成！（留空則不輸出）',p.echoMsg))+
    fRow('音效',fSE(id,'echoSe',p.echoSe));
}

function renderHudFields(line){
  var p=line.params||{}, id=line.id;
  var wins=p.windows||[];
  var winChecks=HUD_W.map(function(w){
    var checked=wins.indexOf(w.v)>=0;
    return '<label class="is-area-lbl'+(checked?' checked':'')+'"><input type="checkbox" class="hud-win-cb" data-id="'+id+'" data-win="'+w.v+'"'+(checked?' checked':'')+'>'+w.l+'</label>';
  }).join('');
  return fHint('一次控制多個 UI 視窗的顯示狀態。勾選要操作的視窗，再選擇統一的操作方式。')+
    fRow('操作方式',fSel(id,'toggle',[{v:'toggle',l:'切換（開↔關）'},{v:'on',l:'全部顯示'},{v:'off',l:'全部隱藏'}],p.toggle||'toggle'))+
    fSep('選擇要操作的視窗（可多選）')+
    '<div class="is-areas" id="hud-wins-'+id+'">'+winChecks+'</div>';
}

/* ════════════════════════════════════════════════
   LINE ROW HTML
════════════════════════════════════════════════ */

function emoteComboOptions(){
  return [{v:'custom',l:'✏️ 自訂輸入情感動作指令名'}].concat(
    EMOTES.map(function(e){return{v:e.v,l:e.l+'（'+e.v+'）'};}));
}
function emoteComboLabel(val){
  var found=emoteComboOptions().find(function(o){return o.v===val;});
  return found?found.l:'';
}
function emoteComboDropdownHTML(query,currentVal){
  var q=(query||'').trim().toLowerCase();
  var filtered=emoteComboOptions().filter(function(o){
    if(!q) return true;
    return o.l.toLowerCase().indexOf(q)>=0||o.v.toLowerCase().indexOf(q)>=0;
  });
  if(!filtered.length) return '<div class="sub-combo-empty">沒有符合的情感動作，換個關鍵字試試？</div>';
  return filtered.map(function(o){
    return '<div class="sub-combo-item'+(o.v===currentVal?' selected':'')+'" data-value="'+esc(o.v)+'">'+esc(o.l)+'</div>';
  }).join('');
}
function fEmoteCombo(id,key,curVal){
  var label=emoteComboLabel(curVal||'');
  return '<div class="sub-combo-wrap emote-combo" data-id="'+id+'" data-key="'+key+'">'
    +'<input type="text" class="sub-combo-inp emote-combo-inp" data-id="'+id+'" data-key="'+key+'" value="'+esc(label)+'" autocomplete="off" placeholder="🔍 打字搜尋或選擇情感動作…">'
    +'<div class="sub-combo-dd emote-combo-dd" data-id="'+id+'" data-key="'+key+'" style="display:none"></div>'
  +'</div>';
}
function typeComboDropdownHTML(query,currentType){
  var q=(query||'').trim().toLowerCase();
  var html='',any=false;
  CATS.forEach(function(c){
    var typesInCat=Object.keys(TDEFS).filter(function(k){
      if(TDEFS[k].cat!==c.id) return false;
      if(!q) return true;
      var d=TDEFS[k];
      return d.label.toLowerCase().indexOf(q)>=0||k.toLowerCase().indexOf(q)>=0
        ||(d.kw&&d.kw.toLowerCase().indexOf(q)>=0);
    });
    if(!typesInCat.length) return;
    any=true;
    html+='<div class="sub-combo-grp">'+esc(c.icon+' '+c.label)+'</div>';
    html+=typesInCat.map(function(k){
      var d=TDEFS[k];
      return '<div class="sub-combo-item'+(k===currentType?' selected':'')+'" data-type="'+k+'">'+esc(d.icon+' '+d.label)+'</div>';
    }).join('');
  });
  if(!any) html='<div class="sub-combo-empty">沒有符合的行類型，換個關鍵字試試？</div>';
  return html;
}

/* ════════════════════════════════════════════════
   渲染：導覽區（全寬）＋ 左：選擇／編輯 ＋ 右：巨集視窗
════════════════════════════════════════════════ */
var GROUP_ICON={'發言':'ph-chat-text','清除記錄':'ph-eraser','準備與倒數':'ph-timer','隨機與提醒':'ph-dice-five',
  '施放技能':'ph-lightning','輪換與複唱':'ph-arrows-clockwise','道具':'ph-flask','目標操作':'ph-crosshair','標記':'ph-map-pin',
  '目標設定':'ph-target','戰鬥':'ph-sword','錯誤提示':'ph-warning-circle','魔素板':'ph-hexagon','移動與姿態':'ph-person-simple-run',
  '裝備':'ph-t-shirt','坐騎與寵物':'ph-horse','情感動作':'ph-smiley','拍照':'ph-camera','組隊':'ph-users-three',
  '交易與查看':'ph-binoculars','搜尋與好友':'ph-magnifying-glass','鑲嵌':'ph-diamond','新人頻道':'ph-sparkle','狀態':'ph-user-circle',
  '視窗':'ph-browsers','名牌與目標線':'ph-identification-card','角色顯示':'ph-eye','熱鍵欄':'ph-keyboard','圖像':'ph-image',
  '音量與音樂':'ph-music-notes','音效':'ph-speaker-high','巨集控制':'ph-sliders-horizontal','系統':'ph-gear-six','自訂':'ph-pencil-simple'};
var TPL_ICON={chat:'ph-timer',aitank:'ph-shield-check',skill:'ph-lightning',abilityrotation:'ph-arrows-clockwise',gearset:'ph-t-shirt',
  itemsort:'ph-backpack',marking:'ph-map-pin',kaomoji:'ph-smiley-wink',emote:'ph-hand-waving',em:'ph-chat-teardrop-text',
  buzu:'ph-megaphone',blank:'ph-file-plus',target_report:'ph-heartbeat'};
var PRO_GROUPS=[
  {t:'目標',k:'誰、哪個對象',s:['<t>','<me>','<f>','<tt>','<lt>','<mo>','<r>','<le>','<la>','<c>','<p>']},
  {t:'小隊成員',k:'依小隊列表的順序',s:['<1>','<2>','<3>','<4>','<5>','<6>','<7>','<8>']},
  {t:'標記',k:'場上的標記與 PvP 敵方',s:['<attack1>','<attack2>','<bind1>','<stop1>','<square>','<circle>','<cross>','<triangle>','<e1>','<e2>']},
  {t:'數值與位置',k:'會即時換成當下的數字',s:['<hp>','<hpp>','<mp>','<mpp>','<job>','<pos>','<flag>','<targethpp>','<focushpp>','<targetclass>','<buddyhp>']},
  {t:'巨集專用',k:'音效、冷卻、等待',s:['<se.1>','<recast.\"技能名\">','<wait.1>']}];
function proDesc(sym){for(var i=0;i<PRONS.length;i++)if(PRONS[i].s===sym)return PRONS[i].d;return sym;}
function prosHTML(copyMode){
  return '<div class="mx-pop-t">代名詞<small>'+(copyMode?'點一下複製':'點一下插入游標位置')+'，遊戲會把它換成實際的角色或數值</small></div>'
    +PRO_GROUPS.map(function(g){
      return '<div class="mx-pg-t">'+esc(g.t)+'<small>'+esc(g.k)+'</small></div><div class="mx-pis">'
        +g.s.map(function(s){return '<button type="button" class="mx-pi" data-sym="'+esc(s)+'" data-act="'+(copyMode?'pro-copy':'pro-ins')+'"><b>'+esc(proDesc(s))+'</b><code>'+esc(s)+'</code></button>';}).join('')+'</div>';
    }).join('');
}

function colorize(t){
  var s=esc(t);
  s=s.replace(/^(\/[A-Za-z0-9_]+)/,'<b class="tk-c">$1</b>');
  s=s.replace(/(&lt;[^&]*?&gt;)/g,'<i class="tk-t">$1</i>');
  return s;
}
function cmdOf(t){var m=/^\/[A-Za-z0-9_]+/.exec(defaultText(t));return m?m[0]:'';}
function chipHTML(t,withArea,o){
  o=o||{};
  var sl=splitLabel(t),a=TYPE_AREA[t],g=TYPE_GROUP[t],code=o.code||sl.c||cmdOf(t);
  return '<button type="button" class="mx-chip a-'+a+'" data-act="chip" data-type="'+t+'"'+(o.params?' data-params="'+esc(JSON.stringify(o.params))+'"':'')+' title="'+esc(TDEFS[t].label)+'">'
    +'<span class="mx-ib"><i class="ph '+(GROUP_ICON[g]||AREA_ICON[a])+'"></i></span>'
    +'<span class="mx-chip-t"><b>'+esc(o.name||sl.n)+'</b><span class="mx-chip-s"><code>'+esc(code||'建構器')+'</code>'+(withArea?'<em class="mx-chip-a">'+esc(AREA_BY[a].label)+'</em>':'')+'</span></span></button>';
}
var _tplPrev={};
function tplInfo(t){
  if(_tplPrev[t.id])return _tplPrev[t.id];
  var ls=t.lines.map(function(l,i){return Object.assign({id:i+1,note:'',repeat:1},l);}),out=[];
  try{out=E.getAllOutput(ls,{mlock:false,merrorOff:false});}catch(e){}
  var first=out.filter(function(x){return x.indexOf('/mlock')!==0&&x.indexOf('/merror')!==0&&x.indexOf('/micon')!==0;})[0]||'';
  first=first.replace(/\s+/g,' ').trim();
  return(_tplPrev[t.id]={n:out.length,p:first.length>38?first.slice(0,38)+'…':first});
}
function tplCard(t){
  var inf=tplInfo(t);
  return '<button type="button" class="mx-tpl" data-act="tpl" data-id="'+t.id+'">'
    +'<span class="mx-ib lg"><i class="ph '+(TPL_ICON[t.id]||'ph-sparkle')+'"></i></span>'
    +'<span class="mx-tpl-b"><b>'+esc(t.label)+'</b><span>'+esc(t.desc)+'</span>'+(inf.p?'<code>'+esc(inf.p)+'</code>':'')+'</span>'
    +'<em>'+(inf.n?inf.n+' 行':'空白')+'</em></button>';
}

/* ── 導覽區 ── */
function tabBtn(v,label,ic){return '<button type="button" class="mx-tab'+(ui.mode===v?' on':'')+'" data-act="mode" data-v="'+v+'"><i class="ph '+ic+'"></i>'+label+'</button>';}
function tagChip(g,on,count){return '<button type="button" class="mx-tag'+(on?' on':'')+'" data-act="tag" data-v="'+esc(g)+'">'+esc(g)+(count?'<small>'+count+'</small>':'')+(on?'<i class="ph ph-x"></i>':'')+'</button>';}
function tagNav(){
  var sel=ui.tags,res=sel.length?scoreTypes(sel):[],cnt={};
  if(sel.length)res.forEach(function(t){TAGS[t].forEach(function(g){if(sel.indexOf(g)<0)cnt[g]=(cnt[g]||0)+1;});});
  var h='<div class="mx-tagnav">';
  if(sel.length)h+='<div class="mx-tagrow"><span class="mx-tagrow-t">已選</span><div class="mx-tlist">'+sel.map(function(g){return tagChip(g,true);}).join('')+'<button type="button" class="mx-tclear" data-act="tag-clear">清除全部</button></div></div>';
  var pool=sel.length?Object.keys(cnt).sort(function(a,b){return cnt[b]-cnt[a]||tagW(b)-tagW(a);}).slice(0,22):STARTER_TAGS;
  h+='<div class="mx-tagrow"><span class="mx-tagrow-t">'+(sel.length?'相關':'常用')+'</span><div class="mx-tlist">'+pool.map(function(g){return tagChip(g,false,sel.length?cnt[g]:0);}).join('')+'</div></div>';
  h+='<button type="button" class="mx-tmore" data-act="tag-all"><i class="ph ph-caret-'+(ui.tagAll?'up':'down')+'"></i>'+(ui.tagAll?'收起全部標籤':'展開全部標籤（'+Object.keys(TAG_TYPES).length+'）')+'</button>';
  if(ui.tagAll){
    h+=Object.keys(M.facets).map(function(f){
      var all=M.facets[f].filter(function(g){return TAG_TYPES[g];}).sort(function(a,b){return TAG_TYPES[b].length-TAG_TYPES[a].length;});
      var common=all.filter(function(g){return TAG_TYPES[g].length>1;}),rare=all.filter(function(g){return TAG_TYPES[g].length===1;});
      return '<div class="mx-tagrow"><span class="mx-tagrow-t">'+esc(f)+'</span><div class="mx-tlist">'+common.map(function(g){return tagChip(g,sel.indexOf(g)>=0);}).join('')
        +(rare.length?'<details class="mx-rare"><summary>更精確（'+rare.length+'）</summary><div class="mx-tlist">'+rare.map(function(g){return tagChip(g,sel.indexOf(g)>=0);}).join('')+'</div></details>':'')+'</div></div>';
    }).join('');
  }
  return h+'</div>';
}
function navHTML(){
  var l=ui.sel!=null?getLine(ui.sel):null;
  if(l&&!ui.replacing){
    var a=TYPE_AREA[l.type],g=TYPE_GROUP[l.type];
    return '<div class="mx-slim a-'+a+'"><span class="mx-ib"><i class="ph '+(GROUP_ICON[g]||AREA_ICON[a])+'"></i></span>'
      +'<span class="mx-slim-path">'+esc(AREA_BY[a].label)+'<i class="ph ph-caret-right"></i>'+esc(g)+'<i class="ph ph-caret-right"></i><b>'+esc(TDEFS[l.type].label)+'</b></span>'
      +'<span class="mx-slim-n">第 '+(idxOf(l.id)+1)+' 行</span><span class="mx-sp"></span>'
      +'<button type="button" class="mx-btn" data-act="replace" title="把這一行換成其他指令"><i class="ph ph-arrows-left-right"></i>更換類型</button>'
      +'<button type="button" class="mx-btn on" data-act="back"><i class="ph ph-plus"></i>新增其他行</button></div>';
  }
  var h='<div class="mx-nav-top"><div class="mx-tabs" role="tablist">'+tabBtn('area','功能分類','ph-squares-four')+tabBtn('tag','想做的事','ph-tag')+'</div>'
    +(ui.mode==='area'?'<span class="mx-hint" id="mx-hint" data-base="'+esc(hintBase())+'">'+esc(hintBase())+'</span>':'')
    +'<label class="mx-search"><i class="ph ph-magnifying-glass"></i><input id="mx-q" type="text" autocomplete="off" spellcheck="false" placeholder="輸入指令，例如 /p、/cd、/ac" value="'+esc(ui.query)+'"><kbd>/</kbd></label></div>';
  if(ui.mode==='tag')return h+'<div class="mx-cap">點選符合你想法的詞，可以多選；相關的指令會依符合程度排在最前面，不需要每個詞都命中。</div>'+tagNav();
  h+='<div class="mx-tiles">'
    +'<button type="button" class="mx-tile mx-tile-tpl'+(ui.area==='__tpl'?' on':'')+'" data-act="area" data-v="__tpl" data-hint="不知道從哪開始？選一個範例再修改"><i class="ph ph-sparkle"></i><span>快速開始</span></button>'
    +AREAS.map(function(a){return '<button type="button" class="mx-tile a-'+a.id+(ui.area===a.id?' on':'')+'" data-act="area" data-v="'+a.id+'" data-hint="'+esc(a.groups.map(function(g){return g.name;}).join('・'))+'"><i class="ph '+AREA_ICON[a.id]+'"></i><span>'+a.label+'</span></button>';}).join('')+'</div>';
  return h;
}
function hintBase(){return ui.area==='__tpl'?'不知道從哪開始？選一個範例再修改':(ui.area&&AREA_BY[ui.area]?AREA_BY[ui.area].groups.map(function(g){return g.name;}).join('・'):'');}

/* ── 左：選擇（瀏覽）與編輯 ── */
function areaBody(){
  if(ui.area==='__tpl'||!ui.area||!AREA_BY[ui.area]){
    return '<div class="mx-sect"><i class="ph ph-sparkle"></i>快速開始<small>點一下套用，再依需要修改每一行</small></div><div class="mx-tpls">'+TEMPLATES.map(tplCard).join('')+'</div>';
  }
  var a=AREA_BY[ui.area];
  return a.groups.map(function(g){
    return '<div class="mx-grp"><div class="mx-grp-t"><i class="ph '+(GROUP_ICON[g.name]||AREA_ICON[a.id])+'"></i>'+esc(g.name)+'<small>'+g.types.length+'</small></div><div class="mx-chips">'+g.types.map(function(t){return chipHTML(t,false);}).join('')+'</div></div>';
  }).join('');
}
function tagResults(){
  var sel=ui.tags;
  if(!sel.length)return '<div class="mx-empty-t"><i class="ph ph-tag"></i>在上方選一個詞，符合的指令會出現在這裡。<br>想不到要用哪一個也沒關係，多選幾個看看。</div>';
  var res=scoreTypes(sel);
  return '<div class="mx-sect"><i class="ph ph-tag"></i>找到 '+res.length+' 個相關指令<small>排在前面的最符合</small></div><div class="mx-chips mx-res">'+res.map(function(t){return chipHTML(t,true);}).join('')+'</div>';
}
function hitName(h){
  var n=splitLabel(h.type).n;
  if(h.params&&h.params.channel){for(var i=0;i<CH.length;i++)if(CH[i].v===h.params.channel){n=n+' · '+CH[i].l.replace(/\s*\/.*$/,'').replace(/（.*）/,'');break;}}
  return n;
}
function hitSample(h){try{return buildLines({id:0,type:h.type,params:h.params||{},repeat:1})[0].replace(/\s+$/,'');}catch(e){return h.cmd;}}
function searchBody(){
  var q=ui.query.trim(),h='',seen={};
  if(q.charAt(0)==='/'&&/\s/.test(q)){
    var p=PARSE.parseLine(E,FLD,q);
    h+='<div class="mx-chips"><button type="button" class="mx-chip mx-direct'+(p?' a-'+TYPE_AREA[p.type]:'')+'" data-act="direct"><span class="mx-ib"><i class="ph ph-arrow-line-down"></i></span><span class="mx-chip-t"><b>'+(p?'直接加入這一行':'以自訂行加入')+'</b><code>'+esc(q)+'</code></span>'+(p?'<em class="mx-chip-a">'+esc(splitLabel(p.type).n)+'</em>':'')+'</button></div>';
  }
  var hs=PARSE.hits(E,FLD,q),ex=hs.exact,pf=hs.prefix.slice(0,10);
  var mk=function(arr){return arr.map(function(x){seen[x.type]=1;return chipHTML(x.type,true,{params:x.params,name:hitName(x),code:hitSample(x)||x.cmd});}).join('');};
  if(ex.length)h+='<div class="mx-sect"><i class="ph ph-keyboard"></i>指令完全相符</div><div class="mx-chips">'+mk(ex)+'</div>';
  if(pf.length)h+='<div class="mx-sect"><i class="ph ph-keyboard"></i>相近指令<small>'+esc(q.charAt(0)==='/'?q:'/'+q)+' 開頭</small></div><div class="mx-chips">'+mk(pf)+'</div>';
  var others=searchTypes(q).filter(function(t){return !seen[t];}).slice(0,12);
  if(others.length)h+='<div class="mx-sect"><i class="ph ph-magnifying-glass"></i>名稱或標籤相符</div><div class="mx-chips">'+others.map(function(t){return chipHTML(t,true);}).join('')+'</div>';
  if(!h)h='<div class="mx-empty-t"><i class="ph ph-magnifying-glass"></i>找不到符合的指令。<br>可以改試「想做的事」標籤，或輸入完整指令後按 Enter 直接加入。</div>';
  return h;
}
function browseBody(){
  if(ui.query.trim())return searchBody();
  return ui.mode==='tag'?tagResults():areaBody();
}
function browseHTML(){
  var h='';
  if(ui.replacing){
    var rl=getLine(ui.replacing);
    h+='<div class="mx-note"><i class="ph ph-arrows-left-right"></i>要把第 '+(idxOf(ui.replacing)+1)+' 行換成哪個指令？'+(rl?'<small>目前：'+esc(TDEFS[rl.type].label)+'</small>':'')+'<button type="button" data-act="cancel-replace">取消</button></div>';
  }else if(ui.insertAt!=null){
    h+='<div class="mx-note"><i class="ph ph-arrow-line-down"></i>新增的行會插入第 '+(ui.insertAt+1)+' 行之前<button type="button" data-act="cancel-insert">改為加到最後</button></div>';
  }
  return h+'<div class="mx-st-body" id="mx-st-body">'+browseBody()+'</div>';
}
var COMP_ACTION={skill:1,generalskill:1,blueaction:1,pvpaction:1,petaction:1,companionaction:1,item:1};
function companions(type){
  if(COMP_ACTION[type])return['wait_line','echo'];
  if(type==='chat'||type==='tell'||type==='em')return['wait_line'];
  if(type==='countdown_sys')return['chat','wait_line'];
  if(type==='readycheck')return['countdown_sys'];
  if(type==='marking'||type==='waymark')return['chat'];
  return[];
}
function editHTML(line){
  var comp=companions(line.type),multi=buildLines(line).length>1&&line.type!=='custom';
  return '<div class="mx-ed-body" id="mx-ed">'+renderFields(line)+'</div>'
    +'<div class="mx-ed-out"><span>輸出</span><code id="mx-ed-out"></code></div>'
    +'<div class="mx-ed-ft">'
      +'<label class="mx-f"><span>備註</span><input type="text" class="ml-note" data-id="'+line.id+'" value="'+esc(line.note||'')+'" placeholder="只給自己看，不會輸出"></label>'
      +'<label class="mx-f mx-f-n"><span>重複</span><input type="number" min="1" max="15" class="ml-repeat-inp" data-id="'+line.id+'" value="'+(parseInt(line.repeat)||1)+'"></label>'
      +(multi?'<button type="button" class="mx-btn ml-expand-btn" data-id="'+line.id+'" title="把這個建構器拆成一行一行的自訂行"><i class="ph ph-rows"></i>展開成單行</button>':'')
    +'</div>'
    +(comp.length?'<div class="mx-comp"><span>常搭配</span>'+comp.map(function(t){return '<button type="button" class="mx-chip sm a-'+TYPE_AREA[t]+'" data-act="comp" data-type="'+t+'"><i class="ph ph-plus"></i>'+esc(splitLabel(t).n)+'</button>';}).join('')+'</div>':'');
}
function refreshEdOut(){
  var el=$('mx-ed-out');if(!el||ui.sel==null)return;
  var l=getLine(ui.sel);if(!l)return;
  el.innerHTML=buildLines(l).map(colorize).join('<br>')||'<span class="mx-dim">（沒有輸出）</span>';
}
function stageHTML(){
  var l=ui.sel!=null?getLine(ui.sel):null;
  if(l&&!ui.replacing)return editHTML(l);
  return browseHTML();
}

/* 自製下拉：沿用市場頁的 .wl-dd 樣式；原生 select 隱藏，change 事件照舊 */
function closeDDs(){document.querySelectorAll('.mx-dd').forEach(function(w){var l=w.querySelector('.wl-dd-list');if(l)l.hidden=true;w.classList.remove('open');});}
function enhanceSelect(sel){
  if(sel._mx)return;sel._mx=true;sel.style.display='none';
  var wrap=document.createElement('div');wrap.className='wl-dd mx-dd';
  wrap.innerHTML='<button type="button" class="wl-dd-btn" aria-haspopup="listbox" aria-expanded="false"><span></span><i class="ph ph-caret-down"></i></button><div class="wl-dd-list" hidden></div>';
  sel.parentNode.insertBefore(wrap,sel.nextSibling);
  var btn=wrap.querySelector('.wl-dd-btn'),list=wrap.querySelector('.wl-dd-list');
  function draw(){
    var cur=sel.options[sel.selectedIndex];btn.firstElementChild.textContent=cur?cur.text:'';
    list.innerHTML=Array.prototype.map.call(sel.options,function(o){return '<button type="button" role="option" class="wl-dd-opt'+(o.selected?' on':'')+'" data-v="'+esc(o.value)+'">'+esc(o.text)+'</button>';}).join('');
  }
  draw();
  btn.addEventListener('click',function(e){
    e.stopPropagation();var was=!list.hidden;closeDDs();
    if(!was){list.hidden=false;wrap.classList.add('open');
      var r=wrap.getBoundingClientRect();wrap.classList.toggle('dd-up',(window.innerHeight-r.bottom)<240&&r.top>(window.innerHeight-r.bottom));}
  });
  list.addEventListener('click',function(e){
    var o=e.target.closest('.wl-dd-opt');if(!o)return;
    sel.value=o.dataset.v;sel.dispatchEvent(new Event('change',{bubbles:true}));draw();closeDDs();
  });
}

function renderNav(){var n=$('mx-nav');if(n)n.innerHTML=navHTML();}
function renderStage(keepScroll){
  var st=$('mx-stage');if(!st)return;
  var old=$('mx-ed'),sc=st.scrollTop;
  st.innerHTML=stageHTML();
  if(ui.sel!=null&&getLine(ui.sel)&&!ui.replacing){
    var ed=$('mx-ed');
    ed.querySelectorAll('select.mf-sel').forEach(enhanceSelect);
    bindFieldEvents(st);
    refreshEdOut();
    if(keepScroll&&old)st.scrollTop=sc;
  }else st.scrollTop=0;
}

/* ── 巨集視窗 ── */
function rowHTML(r,n,start){
  var o=r.o,line=(o!=null&&o!=='g')?getLine(o):null,cls='mx-row';
  if(line)cls+=' a-'+TYPE_AREA[line.type];else cls+=' mx-auto';
  if(o!=null&&o===ui.sel)cls+=' sel';
  var b=cc(r.t);if(b>MAX_C)cls+=' over';else if(b>WARN_C)cls+=' warn';
  var act='';
  if(start&&line){
    act='<span class="mx-act"><button type="button" data-act="up" data-o="'+o+'" title="上移"><i class="ph ph-caret-up"></i></button>'
      +'<button type="button" data-act="down" data-o="'+o+'" title="下移"><i class="ph ph-caret-down"></i></button>'
      +'<button type="button" data-act="dup" data-o="'+o+'" title="複製這一行"><i class="ph ph-copy"></i></button>'
      +'<button type="button" data-act="del" data-o="'+o+'" title="刪除"><i class="ph ph-trash"></i></button></span>';
  }
  return '<div class="'+cls+(start?' start':'')+'" data-o="'+(o==null?'':o)+'"'+(line?' draggable="true"':'')+'>'
    +'<span class="mx-gem"><i>'+n+'</i></span>'
    +'<span class="mx-txt">'+(r.t?colorize(r.t):'<span class="mx-dim">（空白）</span>')+'</span>'
    +'<span class="mx-b" title="字元數（中文字佔 3，上限 '+MAX_C+'）">'+b+'</span>'+act
    +'<span class="mx-meter"><u style="width:'+Math.min(100,Math.round(b/MAX_C*100))+'%"></u></span></div>';
}
function warnFix(w){
  if(/^\/mlock 在第/.test(w.msg))return '<button type="button" class="mx-btn" data-act="fix-mlock">改用全局 /mlock</button>';
  return '';
}
function sideHTML(){
  var m=model();ui._m=m;
  if(ui.page>=m.pages.length)ui.page=0;
  var rows=m.pages[ui.page],W=validate(),bad=W.filter(function(w){return w.lv!=='info';}).length;
  var maxB=m.texts.reduce(function(a,t){return Math.max(a,cc(t));},0);
  var h='<div class="mx-side-hd"><input type="text" class="mx-name" id="mx-name" placeholder="未命名巨集" value="'+esc(macroName)+'" maxlength="40">'
    +'<div class="mx-tools">'
    +'<button type="button" id="mx-undo" data-act="undo" title="復原 (Ctrl+Z)"'+(hi<=0?' disabled':'')+'><i class="ph ph-arrow-counter-clockwise"></i></button>'
    +'<button type="button" id="mx-redo" data-act="redo" title="重做 (Ctrl+Y)"'+(hi>=hist.length-1?' disabled':'')+'><i class="ph ph-arrow-clockwise"></i></button>'
    +'<button type="button" data-act="text" class="'+(ui.textMode?'on':'')+'" title="文字模式：直接編輯或貼上整段巨集"><i class="ph ph-text-aa"></i></button>'
    +'<button type="button" data-act="lib" data-pop="1" title="我的巨集"><i class="ph ph-books"></i></button>'
    +'<button type="button" data-act="share" title="複製分享連結"><i class="ph ph-share-network"></i></button>'
    +'<button type="button" data-act="more" data-pop="1" title="更多"><i class="ph ph-dots-three"></i></button></div></div>'
    +'<div class="mx-stat"><span class="mx-cnt'+(m.total>MAX?' over':m.total>12?' warn':'')+'"><b>'+m.total+'</b>/'+MAX+' 行</span>'
    +'<span class="mx-maxb'+(maxB>MAX_C?' over':maxB>WARN_C?' warn':'')+'" title="單行最大字元數（中文字佔 3）">最長 '+maxB+'/'+MAX_C+'</span>'
    +(bad?'<button type="button" class="mx-wchip" data-act="warn"><i class="ph ph-warning"></i>'+bad+'</button>':'')
    +'<span class="mx-sp"></span>'
    +'<button type="button" class="mx-tg'+(globalCfg.mlock?' on':'')+'" data-act="g-mlock" title="執行完畢前不允許其他巨集打斷，建議複雜巨集使用">/mlock</button>'
    +'<button type="button" class="mx-tg'+(globalCfg.merrorOff?' on':'')+'" data-act="g-merror" title="關閉執行中的錯誤提示，巨集結束後自動恢復">/merror off</button></div>';
  if(ui.warnOpen&&W.length){
    h+='<div class="mx-warns">'+W.map(function(w){return '<div class="mx-warn '+w.lv+'"><i class="ph '+(w.lv==='error'?'ph-x-circle':w.lv==='warn'?'ph-warning':'ph-info')+'"></i><span>'+esc(w.msg)+'</span>'+warnFix(w)+'</div>';}).join('')+'</div>';
  }
  if(ui.textMode){
    return h+'<div class="mx-textwrap"><textarea id="mx-ta" class="mx-ta" spellcheck="false" placeholder="貼上或輸入巨集，每行一個指令。">'+esc(ui.textVal)+'</textarea>'
      +'<div class="mx-text-ft"><button type="button" class="mx-btn on" data-act="text-apply"><i class="ph ph-check"></i>套用為行</button><button type="button" class="mx-btn" data-act="text-cancel">取消</button>'
      +'<span class="mx-dim">無法辨識的行會保留成自訂行</span></div></div>'
      +'<div class="mx-side-ft"><button type="button" class="mx-copy" data-plaque="btn" data-act="copy-text"><i class="ph ph-copy"></i><span>複製文字</span></button></div>';
  }
  if(m.pages.length>1){
    h+='<div class="mx-pgs">'+m.pages.map(function(p,i){return '<button type="button" class="mx-pg'+(i===ui.page?' on':'')+'" data-act="page" data-v="'+i+'">巨集 '+(i+1)+'<small>'+p.length+'</small></button>';}).join('')+'</div>';
  }
  var h2='<div class="mx-win" id="mx-win">',prev=null;
  rows.forEach(function(r,i){
    var start=r.o!==prev||i===0;
    if(start&&i>0&&r.o!=null&&r.o!=='g'){var gi=idxOf(r.o);if(gi>=0)h2+='<div class="mx-gap" data-act="gap" data-at="'+gi+'" title="在這裡插入一行"><u></u></div>';}
    h2+=rowHTML(r,i+1,start);prev=r.o;
  });
  for(var k=rows.length;k<MAX;k++){
    var first=k===rows.length;
    h2+='<div class="mx-row mx-empty'+(first?' first':'')+'" data-slot="1" data-act="slot"><span class="mx-gem off"><i>'+(k+1)+'</i></span><span class="mx-ghost" data-base="'+(first?'加入第 '+(k+1)+' 行':'')+'">'+(first?'<u>＋</u> 加入第 '+(k+1)+' 行':'')+'</span></div>';
  }
  h2+='</div>';
  if(m.overflow>0)h2+='<div class="mx-over"><i class="ph ph-x-circle"></i>超出兩個巨集的容量，少了 '+m.overflow+' 行。請刪減內容。</div>';
  var strip='<div class="mx-strip" data-act="sheet">';
  for(var s2=0;s2<MAX;s2++)strip+='<span class="mx-gem xs'+(s2<m.pages[0].length?'':' off')+'"></span>';
  strip+='<b>'+m.total+'/'+MAX+'</b><i class="ph ph-caret-up"></i></div>';
  var ft='<div class="mx-side-ft">';
  if(m.pages.length>1){
    ft+=m.pages.map(function(p,i){return '<button type="button" class="mx-copy'+(i===0?'" data-plaque="btn':' alt')+'" data-act="copy" data-pg="'+i+'"><i class="ph ph-copy"></i><span>複製巨集 '+(i+1)+'</span></button>';}).join('');
  }else ft+='<button type="button" class="mx-copy" data-plaque="btn" data-act="copy" data-pg="0"><i class="ph ph-copy"></i><span>複製巨集</span></button>';
  ft+='</div>';
  return h+h2+ft+strip;
}
function renderSide(){
  var sd=$('mx-side');if(!sd)return;
  var keep=document.activeElement&&document.activeElement.id==='mx-name';
  var pos=keep?document.activeElement.selectionStart:0,win=$('mx-win'),st=win?win.scrollTop:0;
  sd.innerHTML=sideHTML();
  sd.classList.toggle('open',ui.sheet);
  var w2=$('mx-win');if(w2)w2.scrollTop=st;
  if(keep){var nm=$('mx-name');nm.focus();try{nm.setSelectionRange(pos,pos);}catch(e){}}
  refreshUndo();
}
function renderAll(){renderNav();renderStage(true);renderSide();}
function toolHTML(){
  return '<div class="market-header cw-header"><h2 class="unified-gold-header small news-title"><i class="ph ph-gear-six cr-title-ic" aria-hidden="true"></i>巨集</h2>'
    +'<div class="fancy-divider mini news-div"><div class="long-silk-line-short"></div></div>'
    +'<p class="elegant-body-text page-note">選好想做的事，一行一行建立並即時預覽，完成後一鍵複製貼進遊戲。</p></div>'
    +'<div class="mx-nav" id="mx-nav"></div>'
    +'<div class="mx"><section class="mx-stage mx-panel" id="mx-stage"></section><aside class="mx-side mx-panel" id="mx-side"></aside></div>'
    +'<div class="mx-pop" id="mx-pop" hidden></div>';
}

/* ════════════════════════════════════════════════
   動作與事件
════════════════════════════════════════════════ */
function patchSide(){
  var sd=$('mx-side');if(!sd)return;
  var html=sideHTML(),tmp=document.createElement('div');tmp.innerHTML=html;
  var cur=Array.prototype.slice.call(sd.children),nw=Array.prototype.slice.call(tmp.children);
  var sig=function(a){return a.map(function(c){return c.className.split(' ')[0];}).join('|');};
  if(sig(cur)!==sig(nw)){renderSide();return;}
  var win=$('mx-win'),st=win?win.scrollTop:0;
  for(var i=0;i<cur.length;i++){
    if(cur[i].outerHTML===nw[i].outerHTML)continue;
    if(cur[i].contains(document.activeElement)&&cur[i].classList.contains('mx-side-hd'))continue;
    cur[i].replaceWith(nw[i]);
  }
  var w2=$('mx-win');if(w2)w2.scrollTop=st;
  sd.classList.toggle('open',ui.sheet);refreshUndo();
}
updateRow=function(){patchSide();scheduleCommit();refreshEdOut();};
updatePreview=function(){patchSide();scheduleCommit();refreshEdOut();};

function rectPt(el){var r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};}
function fly(a,b,done){
  var m=document.createElement('span');m.className='mx-mote';
  m.style.left=a.x+'px';m.style.top=a.y+'px';document.body.appendChild(m);
  var dx=b.x-a.x,dy=b.y-a.y;
  var an=m.animate([
    {transform:'translate(-50%,-50%) scale(.5)',opacity:0},
    {transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.15},
    {transform:'translate(calc(-50% + '+dx+'px),calc(-50% + '+dy+'px)) scale(1)',opacity:1,offset:.88},
    {transform:'translate(calc(-50% + '+dx+'px),calc(-50% + '+dy+'px)) scale(1.7)',opacity:0}
  ],{duration:640,easing:'cubic-bezier(.22,.8,.3,1)'});
  an.onfinish=function(){m.remove();done();};
}
function ringGem(g){if(!g)return;g.classList.add('mx-ring');setTimeout(function(){g.classList.remove('mx-ring');},1400);}
function ringRect(el){
  if(!el||reduced())return;
  var r=el.getBoundingClientRect(),NS='http://www.w3.org/2000/svg',w=r.width+8,h=r.height+8;
  var s=document.createElementNS(NS,'svg');s.setAttribute('class','mx-rr');
  s.style.cssText='left:'+(r.left-4)+'px;top:'+(r.top-4)+'px;width:'+w+'px;height:'+h+'px';
  s.setAttribute('viewBox','0 0 '+w+' '+h);
  s.innerHTML='<rect x="1.5" y="1.5" width="'+(w-3)+'" height="'+(h-3)+'" rx="3" pathLength="100"/>';
  document.body.appendChild(s);setTimeout(function(){s.remove();},1400);
}
/* 接力：新增一行後，光點從選項飛到視窗裡的新行（行號寶石轉一圈），再接力到第一個要填的欄位 */
function relay(from,lineId){
  var gem=document.querySelector('#mx-win .mx-row[data-o="'+lineId+'"] .mx-gem');
  var hop=function(){
    var ed=$('mx-ed');if(!ed)return;
    var ins=ed.querySelectorAll('input.mf-inp:not([type=checkbox])'),t=null;
    for(var i=0;i<ins.length;i++){if(!ins[i].value&&ins[i].offsetParent){t=ins[i];break;}}
    if(!t)return;
    try{t.focus({preventScroll:true});}catch(e){t.focus();}
    ringRect(t);
  };
  var go=function(){ringGem(gem);setTimeout(hop,reduced()?0:560);};
  if(!from||!gem||reduced()||!document.body.animate){go();return;}
  fly(from,rectPt(gem),go);
}
function addLine(type,params,from,rep){
  var line={id:nextId++,type:type,params:params||{},note:'',expanded:false,repeat:rep||1};
  var at=ui.insertAt!=null?Math.min(ui.insertAt,lines.length):lines.length;
  lines.splice(at,0,line);
  ui.insertAt=null;ui.replacing=null;ui.sel=line.id;ui.query='';
  commit();renderAll();relay(from,line.id);
  return line;
}
function replaceType(type,from,prm){
  var l=getLine(ui.replacing);if(!l)return;
  l.type=type;l.params=prm||{};ui.sel=l.id;ui.replacing=null;ui.query='';
  commit();renderAll();relay(from,l.id);
}
function moveLine(id,toId,after){
  var i=idxOf(id);if(i<0||id===toId)return;
  var l=lines.splice(i,1)[0],j=idxOf(toId);if(j<0){lines.splice(i,0,l);return;}
  lines.splice(after?j+1:j,0,l);render();
}
function swapLine(id,dir){
  var i=idxOf(id),j=i+dir;if(i<0||j<0||j>=lines.length)return;
  var t=lines[i];lines[i]=lines[j];lines[j]=t;render();
}
function inviteWindow(from){
  var gem=document.querySelector('#mx-win .mx-row:not(.mx-empty) .mx-gem')||document.querySelector('#mx-win .mx-row.mx-empty.first .mx-gem');
  var go=function(){ringGem(gem);var w=$('mx-win');if(w){w.classList.add('mx-pulse');setTimeout(function(){w.classList.remove('mx-pulse');},1400);}};
  if(!from||!gem||reduced()||!document.body.animate){go();return;}
  fly(from,rectPt(gem),go);
}
function applyTpl(id,from){
  var tpl=TEMPLATES.filter(function(t){return t.id===id;})[0];if(!tpl)return;
  if(lines.length>0&&!window.confirm('套用「'+tpl.label+'」會取代現有所有行（可用復原還原），確認？'))return;
  lines=tpl.lines.map(function(l){return Object.assign({},l,{id:nextId++,params:dc(l.params),expanded:false});});
  ui.sel=null;ui.insertAt=null;ui.replacing=null;ui.query='';
  commit();renderAll();inviteWindow(from);
}
function renderTop(){renderNav();renderStage();}
function parseText(txt){
  var out=[];
  txt.split(/\r\n|\r|\n/).forEach(function(raw){
    var s=raw.replace(/\s+$/,'');if(!s.trim())return;
    var p=PARSE.parseLine(E,FLD,s);
    out.push({id:nextId++,type:p?p.type:'custom',params:p?p.params:{text:s},note:'',expanded:false,repeat:1});
  });
  return out;
}
function copyOut(pg,btn){
  var m=ui._m||model(),rows=m.pages[pg]||[];
  var out=rows.map(function(r){return r.t;}).join('\r\n');
  if(!out.trim()){window.alert('巨集為空，請先新增內容');return;}
  copyText(out,btn,btn.dataset.lbl||'複製巨集');
  /* 複製成功只做亮起：該頁寶石依序閃過 */
  document.querySelectorAll('#mx-win .mx-row:not(.mx-empty) .mx-gem').forEach(function(g,i){
    setTimeout(function(){g.classList.add('mx-flash');setTimeout(function(){g.classList.remove('mx-flash');},500);},reduced()?0:i*28);
  });
}

/* ── 浮動面板（我的巨集／更多） ── */
function closePop(){var p=$('mx-pop');if(p){p.hidden=true;p.innerHTML='';}}
function openPop(anchor,html,wd){
  var p=$('mx-pop');if(!p)return;
  p.innerHTML=html;p.hidden=false;
  var r=anchor.getBoundingClientRect(),w=Math.min(wd||320,window.innerWidth-16);
  p.style.width=w+'px';
  p.style.left=Math.max(8,Math.min(window.innerWidth-w-8,r.right-w))+'px';
  p.style.maxHeight=(window.innerHeight-24)+'px';
  var hgt=Math.min(p.offsetHeight||400,window.innerHeight-24);
  p.style.top=Math.max(8,Math.min(r.bottom+6,window.innerHeight-hgt-12))+'px';
}
function getLib(){try{var a=JSON.parse(localStorage.getItem(LS_LIB)||'[]');return Array.isArray(a)?a:[];}catch(e){return[];}}
function setLib(a){try{localStorage.setItem(LS_LIB,JSON.stringify(a));return true;}catch(e){window.alert('儲存失敗：瀏覽器儲存空間不可用');return false;}}
function libHTML(){
  var lib=getLib();
  return '<div class="mx-pop-t">我的巨集<small>只存在這個瀏覽器，請定期匯出備份</small></div>'
    +'<button type="button" class="mx-mini on" data-act="lib-save"><i class="ph ph-floppy-disk"></i>儲存目前的巨集</button>'
    +'<div class="mx-lib">'+(lib.length?lib.map(function(x,i){
      return '<div class="mx-lib-i"><span><b>'+esc(x.name||'未命名')+'</b><small>'+(x.data&&x.data.l?x.data.l.length:0)+' 行</small></span>'
        +'<button type="button" data-act="lib-load" data-i="'+i+'" title="載入"><i class="ph ph-download-simple"></i></button>'
        +'<button type="button" data-act="lib-del" data-i="'+i+'" title="刪除"><i class="ph ph-trash"></i></button></div>';
    }).join(''):'<div class="mx-dim">還沒有儲存的巨集</div>')+'</div>'
    +'<div class="mx-pop-ft"><button type="button" class="mx-mini" data-act="lib-export"><i class="ph ph-export"></i>匯出全部</button>'
    +'<button type="button" class="mx-mini" data-act="lib-import"><i class="ph ph-upload-simple"></i>匯入</button></div>'
    +'<input type="file" id="mx-file" accept="application/json,.json" hidden>';
}
function moreHTML(){
  return '<div class="mx-pop-t">更多</div>'
    +'<div class="mx-more-row"><span>統一聊天頻道</span><select id="mx-allch" class="mf-sel">'+so(CH,'p')+'</select><button type="button" class="mx-mini" data-act="all-ch">套用</button></div>'
    +'<button type="button" class="mx-mini danger" data-act="clear-all"><i class="ph ph-trash"></i>清空所有行</button>'
    +prosHTML(true);
}
function snapshotData(){return{v:1,n:macroName,g:[globalCfg.mlock?1:0,globalCfg.merrorOff?1:0],l:lines.map(function(l){return[l.type,l.params,l.note||'',parseInt(l.repeat)||1];})};}
function loadData(o){
  if(!o||!Array.isArray(o.l))return false;
  lines=o.l.filter(function(x){return TDEFS[x[0]];}).map(function(x){return{id:nextId++,type:x[0],params:x[1]||{},note:x[2]||'',expanded:false,repeat:parseInt(x[3])||1};});
  globalCfg={mlock:!!(o.g&&o.g[0]),merrorOff:!!(o.g&&o.g[1])};macroName=o.n||'';
  ui.sel=null;ui.insertAt=null;ui.replacing=null;ui.textMode=false;
  return true;
}
function b64enc(s){return btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function b64dec(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return decodeURIComponent(escape(atob(s)));}
function checkSharedOnLoad(){
  var m=/[#&]m=([^&]+)/.exec(window.location.hash);if(!m)return;
  var o=null;try{o=JSON.parse(b64dec(m[1]));}catch(e){}
  if(o&&Array.isArray(o.l)&&o.l.length){
    var ok=!lines.length||window.confirm('偵測到分享的巨集（'+o.l.length+' 行'+(o.n?'，「'+o.n+'」':'')+'），要載入嗎？\n（會取代目前編輯中的內容，可用復原還原）');
    if(ok){loadData(o);commit();}
  }
  try{history.replaceState(null,'',window.location.pathname+window.location.search);}catch(e){}
}

/* ── 事件 ── */
function onAct(act,el,e){
  var a=el.dataset;
  switch(act){
    case 'mode':ui.mode=a.v;ui.query='';renderTop();break;
    case 'area':ui.area=a.v;ui.query='';renderTop();break;
    case 'tag':{var i=ui.tags.indexOf(a.v);if(i>=0)ui.tags.splice(i,1);else ui.tags.push(a.v);renderTop();break;}
    case 'tag-clear':ui.tags=[];renderTop();break;
    case 'tag-all':ui.tagAll=!ui.tagAll;renderTop();break;
    case 'chip':{var pt=rectPt(el),prm={};try{prm=a.params?JSON.parse(a.params):{};}catch(x){}if(ui.replacing)replaceType(a.type,pt,prm);else addLine(a.type,prm,pt);break;}
    case 'direct':{var q=ui.query.trim(),p=PARSE.parseLine(E,FLD,q);addLine(p?p.type:'custom',p?p.params:{text:q},rectPt(el));break;}
    case 'comp':{var idx=idxOf(ui.sel);ui.insertAt=idx>=0?idx+1:null;addLine(a.type,{},rectPt(el));break;}
    case 'tpl':applyTpl(a.id,rectPt(el));break;
    case 'back':ui.sel=null;ui.replacing=null;renderAll();break;
    case 'replace':ui.replacing=ui.sel;renderTop();break;
    case 'cancel-replace':ui.replacing=null;renderTop();break;
    case 'cancel-insert':ui.insertAt=null;renderStage();break;
    case 'gap':ui.insertAt=+a.at;ui.sel=null;ui.replacing=null;renderAll();focusSearch();break;
    case 'slot':ui.insertAt=null;ui.sel=null;ui.replacing=null;ui.page=Math.max(0,(ui._m?ui._m.pages.length:1)-1);renderAll();focusSearch();break;
    case 'up':swapLine(+a.o,-1);break;
    case 'down':swapLine(+a.o,1);break;
    case 'dup':{var s=getLine(+a.o);if(s){var c=Object.assign({},s,{id:nextId++,params:dc(s.params)});lines.splice(idxOf(s.id)+1,0,c);ui.sel=c.id;render();}break;}
    case 'del':{var id=+a.o;lines=lines.filter(function(l){return l.id!==id;});if(ui.sel===id)ui.sel=null;render();break;}
    case 'g-mlock':globalCfg.mlock=!globalCfg.mlock;render();break;
    case 'g-merror':globalCfg.merrorOff=!globalCfg.merrorOff;render();break;
    case 'undo':undo();break;
    case 'redo':redo();break;
    case 'warn':ui.warnOpen=!ui.warnOpen;renderSide();break;
    case 'fix-mlock':lines=lines.filter(function(l){return l.type!=='mlock';});globalCfg.mlock=true;if(ui.sel!=null&&!getLine(ui.sel))ui.sel=null;render();break;
    case 'page':ui.page=+a.v;renderSide();break;
    case 'sheet':ui.sheet=!ui.sheet;$('mx-side').classList.toggle('open',ui.sheet);break;
    case 'copy':copyOut(+a.pg,el);break;
    case 'copy-text':{var ta=$('mx-ta');var t=ta?ta.value.replace(/\r\n|\r|\n/g,'\r\n'):'';if(!t.trim()){window.alert('沒有內容可複製');break;}copyText(t,el,'複製文字');break;}
    case 'text':
      if(ui.textMode){ui.textMode=false;renderSide();}
      else{ui.textVal=(ui._m||model()).texts.filter(function(t,i){return true;}).filter(function(t){return !(globalCfg.mlock&&t==='/mlock')&&!(globalCfg.merrorOff&&t==='/merror off');}).join('\n');ui.textMode=true;renderSide();var ta2=$('mx-ta');if(ta2)ta2.focus();}
      break;
    case 'text-apply':{var ta3=$('mx-ta'),ls=parseText(ta3?ta3.value:'');
      if(!ls.length&&lines.length&&!window.confirm('文字是空的，套用會清空所有行，確認？'))break;
      lines=ls;ui.sel=null;ui.textMode=false;ui.page=0;render();break;}
    case 'text-cancel':ui.textMode=false;renderSide();break;
    case 'share':{
      var url=window.location.origin+window.location.pathname+window.location.search+'#page=macro&m='+b64enc(JSON.stringify(snapshotData()));
      copyText(url,{textContent:'',classList:{add:function(){},remove:function(){}}},'');
      el.innerHTML='<i class="ph ph-check"></i>';setTimeout(function(){el.innerHTML='<i class="ph ph-share-network"></i>';},1800);break;}
    case 'lib':openPop(el,libHTML());break;
    case 'more':openPop(el,moreHTML());break;
    case 'lib-save':{var lib=getLib(),nm=(macroName||'').trim()||('巨集 '+(lib.length+1));
      var ex=lib.filter(function(x){return x.name===nm;})[0];
      if(ex&&!window.confirm('已有同名的「'+nm+'」，要覆蓋嗎？'))break;
      var rec={name:nm,t:Date.now(),data:snapshotData()};
      if(ex)lib[lib.indexOf(ex)]=rec;else lib.push(rec);
      if(setLib(lib)){macroName=nm;renderSide();var p=$('mx-pop');if(p&&!p.hidden)p.innerHTML=libHTML();}break;}
    case 'lib-load':{var x=getLib()[+a.i];if(!x)break;
      if(lines.length&&!window.confirm('載入「'+x.name+'」會取代目前編輯中的內容（可用復原還原），確認？'))break;
      if(loadData(x.data)){commit();closePop();renderAll();}break;}
    case 'lib-del':{var l2=getLib(),y=l2[+a.i];if(!y||!window.confirm('刪除「'+y.name+'」？'))break;l2.splice(+a.i,1);setLib(l2);$('mx-pop').innerHTML=libHTML();break;}
    case 'lib-export':{var blob=new Blob([JSON.stringify(getLib(),null,1)],{type:'application/json'}),u=URL.createObjectURL(blob),an=document.createElement('a');
      an.href=u;an.download='ffxiv-macros.json';document.body.appendChild(an);an.click();an.remove();setTimeout(function(){URL.revokeObjectURL(u);},1000);break;}
    case 'lib-import':{var f=$('mx-file');if(f)f.click();break;}
    case 'pros':{var wrap=el.closest('.msg-inp-wrap');ui.proTarget=wrap?wrap.querySelector('.msg-inp'):_lastMsgInput;openPop(el,prosHTML(false),430);break;}
    case 'pro-ins':{var tg=ui.proTarget;if(tg&&document.body.contains(tg))insertAtCursor(tg,a.sym);else if(navigator.clipboard)navigator.clipboard.writeText(a.sym).catch(function(){});closePop();break;}
    case 'pro-copy':{if(navigator.clipboard)navigator.clipboard.writeText(a.sym).catch(function(){});el.classList.add('copied');setTimeout(function(){el.classList.remove('copied');},700);break;}
    case 'all-ch':{var v=$('mx-allch').value;lines.forEach(function(l){
        if(l.type==='chat'||l.type==='chatcountdown')l.params.channel=v;
        if(l.params&&l.params.msgs)l.params.msgs.forEach(function(m){if(m.channel)m.channel=v;});});
      render();closePop();break;}
    case 'clear-all':if(lines.length&&window.confirm('確定清空所有行？（可用復原還原）')){lines=[];ui.sel=null;render();closePop();}break;
  }
}
function focusSearch(){var q=$('mx-q');if(q){q.focus();}}
function bindRoot(){
  var root=$('macro-root');
  root.addEventListener('click',function(e){
    var el=e.target.closest('[data-act]');
    if(el&&root.contains(el)){
      /* 巨集視窗的行：點擊（不是點到小按鈕）＝選取該行 */
      onAct(el.dataset.act,el,e);return;
    }
    var row=e.target.closest('#mx-win .mx-row[data-o]');
    if(row&&row.dataset.o&&row.dataset.o!=='g'&&!e.target.closest('.mx-act')){
      ui.sel=+row.dataset.o;ui.replacing=null;
      if(ui.sheet){ui.sheet=false;}
      renderAll();
      var st=$('mx-stage');if(st&&st.getBoundingClientRect().top<0)st.scrollIntoView({block:'start',behavior:'smooth'});
    }
  });
  root.addEventListener('input',function(e){
    var t=e.target;
    if(t.id==='mx-q'){ui.query=t.value;var b=$('mx-st-body');if(b)b.innerHTML=browseBody();}
    else if(t.id==='mx-name'){macroName=t.value;scheduleCommit();}
    else if(t.id==='mx-ta'){ui.textVal=t.value;}
  });
  root.addEventListener('keydown',function(e){
    if(e.target.id==='mx-q'){
      if(e.key==='Enter'){
        var q=ui.query.trim();if(!q)return;
        var d=document.querySelector('#mx-st-body .mx-chip');
        if(d){e.preventDefault();d.click();}
      }else if(e.key==='Escape'){ui.query='';renderTop();focusSearch();}
    }
  });
  /* 拖曳排序 */
  root.addEventListener('dragstart',function(e){
    var r=e.target.closest&&e.target.closest('#mx-win .mx-row[data-o]');
    if(!r||!r.dataset.o||r.dataset.o==='g'){return;}
    ui.drag=+r.dataset.o;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(ui.drag));}catch(x){}
  });
  root.addEventListener('dragover',function(e){
    var r=e.target.closest&&e.target.closest('#mx-win .mx-row[data-o]');
    if(ui.drag==null||!r||!r.dataset.o||r.dataset.o==='g')return;
    e.preventDefault();
    document.querySelectorAll('#mx-win .dz-up,#mx-win .dz-dn').forEach(function(x){x.classList.remove('dz-up','dz-dn');});
    var b=r.getBoundingClientRect();r.classList.add(e.clientY<b.top+b.height/2?'dz-up':'dz-dn');
  });
  root.addEventListener('drop',function(e){
    var r=e.target.closest&&e.target.closest('#mx-win .mx-row[data-o]');
    if(ui.drag==null||!r||!r.dataset.o||r.dataset.o==='g'){ui.drag=null;return;}
    e.preventDefault();var b=r.getBoundingClientRect(),id=ui.drag;ui.drag=null;
    moveLine(id,+r.dataset.o,e.clientY>=b.top+b.height/2);
  });
  root.addEventListener('dragend',function(){ui.drag=null;document.querySelectorAll('#mx-win .dz-up,#mx-win .dz-dn').forEach(function(x){x.classList.remove('dz-up','dz-dn');});});
  /* 行號寶石連動：滑過視窗的某一行，同一個邏輯行的所有寶石一起亮；滑過選項時，下一個空格預覽預設輸出 */
  root.addEventListener('mouseover',function(e){
    var r=e.target.closest&&e.target.closest('#mx-win .mx-row[data-o]');
    document.querySelectorAll('#mx-win .hl').forEach(function(x){x.classList.remove('hl');});
    if(r&&r.dataset.o&&r.dataset.o!=='g')document.querySelectorAll('#mx-win .mx-row[data-o="'+r.dataset.o+'"]').forEach(function(x){x.classList.add('hl');});
    var chip=e.target.closest&&e.target.closest('.mx-chip[data-type]');
    var gh=document.querySelector('#mx-win .mx-empty.first .mx-ghost');
    if(gh){
      if(chip&&!ui.replacing){gh.innerHTML='<span class="gh">'+colorize(defaultText(chip.dataset.type))+'</span>';gh.parentNode.classList.add('pv');}
      else if(!chip){gh.innerHTML=gh.dataset.base?'<u>＋</u> '+esc(gh.dataset.base.replace(/^＋ /,'')):'';gh.parentNode.classList.remove('pv');}
    }
    var ar=e.target.closest&&e.target.closest('.mx-tile'),hint=$('mx-hint');
    if(hint){hint.textContent=ar?ar.dataset.hint:hint.dataset.base;}
  });
  /* 彈出面板的檔案匯入 */
  root.addEventListener('change',function(e){
    if(e.target.id==='mx-file'&&e.target.files&&e.target.files[0]){
      var fr=new FileReader();
      fr.onload=function(){
        try{var arr=JSON.parse(fr.result);if(!Array.isArray(arr))throw 0;
          var lib=getLib();arr.forEach(function(x){if(x&&x.data&&Array.isArray(x.data.l))lib.push({name:x.name||'匯入的巨集',t:Date.now(),data:x.data});});
          setLib(lib);$('mx-pop').innerHTML=libHTML();
        }catch(err){window.alert('匯入失敗：不是有效的巨集庫檔案');}
      };
      fr.readAsText(e.target.files[0]);
    }
  });
  document.addEventListener('click',function(e){
    if(!e.target.closest('.mx-dd'))closeDDs();
    if(!e.target.closest('#mx-pop')&&!e.target.closest('[data-pop]'))closePop();
    var chip=e.target.closest('.inline-pro');
    if(chip){var sym=chip.dataset.sym;if(!sym)return;var wrap=chip.closest('.msg-inp-wrap');var inp=wrap?wrap.querySelector('.msg-inp'):_lastMsgInput;if(inp)insertAtCursor(inp,sym);}
  });
  document.addEventListener('focusin',function(e){if(e.target&&e.target.classList&&e.target.classList.contains('msg-inp'))_lastMsgInput=e.target;});
  document.addEventListener('keydown',function(e){
    var sc=$('macro');if(!sc||!sc.classList.contains('active'))return;
    var tag=(e.target.tagName||'').toLowerCase(),typing=tag==='input'||tag==='textarea'||tag==='select'||e.target.isContentEditable;
    if(e.key==='Escape'){closePop();closeDDs();}
    if(!typing&&e.key==='/'){e.preventDefault();ui.sel=null;ui.replacing=null;renderTop();focusSearch();}
    if(!typing&&(e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}
    if(!typing&&(e.ctrlKey||e.metaKey)&&(e.key.toLowerCase()==='y'||(e.shiftKey&&e.key.toLowerCase()==='z'))){e.preventDefault();redo();}
  });
}

/* 欄位事件（沿用舊版，容器由參數傳入） */
function bindFieldEvents(el){
  // Emote combo — searchable typeahead, still supports 自訂輸入 + click-to-select
  el.querySelectorAll('.emote-combo-inp').forEach(function(inp){
    var id=+inp.dataset.id,key=inp.dataset.key;
    var wrap=inp.closest('.emote-combo');
    var dd=wrap?wrap.querySelector('.emote-combo-dd'):null;
    if(!dd) return;
    function curVal(){
      var line=lines.find(function(l){return l.id===id;});
      return line?line.params[key]:null;
    }
    function openDD(query){
      dd.innerHTML=emoteComboDropdownHTML(query,curVal());
      dd.style.display='block';
    }
    inp.addEventListener('focus',function(){
      inp.dataset.orig=inp.value;
      inp.value='';
      openDD('');
      inp.select();
    });
    inp.addEventListener('input',function(){ openDD(inp.value); });
    inp.addEventListener('blur',function(){
      setTimeout(function(){
        if(!document.body.contains(dd)) return;
        dd.style.display='none';
        inp.value=inp.dataset.orig!==undefined?inp.dataset.orig:inp.value;
      },150);
    });
    dd.addEventListener('mousedown',function(e){
      var item=e.target.closest('.sub-combo-item');
      if(!item) return;
      e.preventDefault();
      var line=lines.find(function(l){return l.id===id;});
      if(!line||!key) return;
      line.params[key]=item.dataset.value;
      render();
    });
  });
  // Text/number inputs
  el.querySelectorAll('.mf-inp').forEach(function(inp){
    inp.addEventListener('input',function(){
      var id=+inp.dataset.id,key=inp.dataset.key;
      var line=lines.find(function(l){return l.id===id;});if(!line||!key)return;
      line.params[key]=inp.value;updateRow(id);updatePreview();
    });
  });
  // Selects
  el.querySelectorAll('.mf-sel').forEach(function(sel){
    sel.addEventListener('change',function(){
      var id=+sel.dataset.id,key=sel.dataset.key;
      var line=lines.find(function(l){return l.id===id;});if(!line||!key)return;
      line.params[key]=sel.value;
      var NR=['target','markTarget','targetParam','motionEmote','miconType','gsAction','gsNumber','waymarkAction','markType','toggle','preMsg_on','postNotify','postEcho','recastNotify','preAnnounce','targetCmd','zone','addMicon','addEcho','sub','alarmSub','spellToggle','mode','callAction','type','effTarget','effType','format','base','clChannel','petName','setType'];
      if(NR.indexOf(key)>=0) render(); else{updateRow(id);updatePreview();}
    });
  });
  // Checkboxes
  el.querySelectorAll('input[type="checkbox"][data-id]').forEach(function(cb){
    cb.addEventListener('change',function(){
      var id=+cb.dataset.id,key=cb.dataset.key;
      var line=lines.find(function(l){return l.id===id;});if(!line||!key)return;
      if(key==='jobs') return; // handled by mf-chk-job handler
      line.params[key]=cb.checked;render();
    });
  });
  // Notes
  el.querySelectorAll('.ml-note').forEach(function(inp){
    inp.addEventListener('input',function(){
      var id=+inp.dataset.id;var line=lines.find(function(l){return l.id===id;});
      if(line)line.note=inp.value;
    });
  });
  // Repeat
  el.querySelectorAll('.ml-repeat-inp').forEach(function(inp){
    inp.addEventListener('input',function(){
      var id=+inp.dataset.id;var line=lines.find(function(l){return l.id===id;});
      if(!line)return;line.repeat=Math.max(1,parseInt(inp.value)||1);updateRow(id);updatePreview();
    });
  });
  // Expand block to individual lines
  el.querySelectorAll('.ml-expand-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;var line=lines.find(function(l){return l.id===id;});
      if(!line)return;
      var cmds=buildLines(line);var idx=-1;lines.forEach(function(l,i){if(l.id===id)idx=i;});
      if(idx<0)return;
      var newLines=cmds.map(function(cmd){return{id:nextId++,type:'custom',params:{text:cmd},note:'',expanded:false,repeat:1};});
      lines.splice.apply(lines,[idx,1].concat(newLines));render();
    });
  });
  // ItemSort specific
  el.querySelectorAll('.is-area-cb').forEach(function(cb){
    cb.addEventListener('change',function(){
      var id=+cb.dataset.id,area=cb.dataset.area;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var arr=line.params.areas||[];
      if(cb.checked){if(arr.indexOf(area)<0)arr.push(area);}else{arr=arr.filter(function(a){return a!==area;});}
      line.params.areas=arr;updateRow(id);updatePreview();
      var lbl=cb.parentNode;if(lbl)lbl.className='is-area-lbl'+(cb.checked?' checked':'');
    });
  });
  el.querySelectorAll('.is-sel-common').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;var line=lines.find(function(l){return l.id===id;});if(!line)return;
      line.params.areas=['inventory','armoury','saddlebag'];render();
    });
  });
  el.querySelectorAll('.is-sel-all').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;var line=lines.find(function(l){return l.id===id;});if(!line)return;
      line.params.areas=IS_AREAS.map(function(a){return a.v;});render();
    });
  });
  el.querySelectorAll('.is-sel-none').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;var line=lines.find(function(l){return l.id===id;});if(!line)return;
      line.params.areas=[];render();
    });
  });
  el.querySelectorAll('.is-crit-sel').forEach(function(sel){
    sel.addEventListener('change',function(){
      var id=+sel.dataset.id,ci=+sel.dataset.ci;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var conds=line.params.conditions||[];if(!conds[ci])return;
      conds[ci].criterion=sel.value;line.params.conditions=conds;render();
    });
  });
  el.querySelectorAll('.is-ord-sel').forEach(function(sel){
    sel.addEventListener('change',function(){
      var id=+sel.dataset.id,ci=+sel.dataset.ci;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var conds=line.params.conditions||[];if(!conds[ci])return;
      conds[ci].order=sel.value;line.params.conditions=conds;updateRow(id);updatePreview();
    });
  });
  el.querySelectorAll('.is-del-cond').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id,ci=+btn.dataset.ci;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      line.params.conditions=(line.params.conditions||[]).filter(function(_,i){return i!==ci;});render();
    });
  });
  el.querySelectorAll('.is-add-cond').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var conds=line.params.conditions||[];conds.push({criterion:'ilv',order:'des'});
      line.params.conditions=conds;render();
    });
  });
  // HUD windows
  el.querySelectorAll('.hud-win-cb').forEach(function(cb){
    cb.addEventListener('change',function(){
      var id=+cb.dataset.id,win=cb.dataset.win;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var arr=line.params.windows||[];
      if(cb.checked){if(arr.indexOf(win)<0)arr.push(win);}else{arr=arr.filter(function(w){return w!==win;});}
      line.params.windows=arr;updateRow(id);updatePreview();
      var lbl=cb.parentNode;if(lbl)lbl.className='is-area-lbl'+(cb.checked?' checked':'');
    });
  });
  // LFP job checkboxes
  el.querySelectorAll('.mf-chk-job').forEach(function(cb){
    cb.addEventListener('change',function(){
      var id=+cb.dataset.id, val=cb.dataset.val;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var arr=(line.params.jobs||[]).slice();
      if(cb.checked){if(arr.indexOf(val)<0)arr.push(val);}
      else{arr=arr.filter(function(v){return v!==val;});}
      line.params.jobs=arr;
      var lbl=cb.closest('.job-chk-lbl');
      if(lbl) lbl.classList.toggle('checked',cb.checked);
      updateRow(id);updatePreview();
    });
  });
  // LFP job select all / none buttons
  el.querySelectorAll('.job-sel-all').forEach(function(btn){
    btn.addEventListener('click',function(){
      var id=+btn.dataset.id;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      line.params.jobs=JOBS.map(function(j){return j.v;});
      render();
    });
  });
  el.querySelectorAll('.job-sel-none').forEach(function(btn){
    btn.addEventListener('click',function(){
      var id=+btn.dataset.id;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      line.params.jobs=[];
      render();
    });
  });
  // ── Chat Countdown Builder (use querySelectorAll - no delegation accumulation) ──
  el.querySelectorAll('.ccd-text').forEach(function(inp){
    inp.addEventListener('input',function(){
      var id=+inp.dataset.id,idx=+inp.dataset.idx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      if(!line.params.msgs)line.params.msgs=[{text:'',wait:0,se:'',channel:''}];
      if(!line.params.msgs[idx])line.params.msgs[idx]={text:'',wait:0,se:'',channel:''};
      line.params.msgs[idx].text=inp.value;updateRow(id);updatePreview();
    });
  });
  el.querySelectorAll('.ccd-wait').forEach(function(inp){
    inp.addEventListener('input',function(){
      var id=+inp.dataset.id,idx=+inp.dataset.idx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      if(!line.params.msgs)line.params.msgs=[{text:'',wait:0,se:'',channel:''}];
      if(!line.params.msgs[idx])line.params.msgs[idx]={text:'',wait:0,se:'',channel:''};
      line.params.msgs[idx].wait=parseFloat(inp.value)||0;updateRow(id);updatePreview();
    });
  });
  el.querySelectorAll('.ccd-se').forEach(function(sel){
    sel.addEventListener('change',function(){
      var id=+sel.dataset.id,idx=+sel.dataset.idx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      if(!line.params.msgs)line.params.msgs=[{text:'',wait:0,se:'',channel:''}];
      if(!line.params.msgs[idx])line.params.msgs[idx]={text:'',wait:0,se:'',channel:''};
      line.params.msgs[idx].se=sel.value;updateRow(id);updatePreview();
    });
  });
  el.querySelectorAll('.ccd-ch').forEach(function(sel){
    sel.addEventListener('change',function(){
      var id=+sel.dataset.id,idx=+sel.dataset.idx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      if(!line.params.msgs)line.params.msgs=[{text:'',wait:0,se:'',channel:''}];
      if(!line.params.msgs[idx])line.params.msgs[idx]={text:'',wait:0,se:'',channel:''};
      line.params.msgs[idx].channel=sel.value;updateRow(id);updatePreview();
    });
  });
  el.querySelectorAll('.ccd-add').forEach(function(btn){
    btn.addEventListener('click',function(){
      var id=+btn.dataset.id;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      if(!line.params.msgs)line.params.msgs=[];
      line.params.msgs.push({text:'',wait:0,se:'',channel:''});render();
    });
  });
  el.querySelectorAll('.ccd-del').forEach(function(btn){
    btn.addEventListener('click',function(){
      var id=+btn.dataset.id,idx=+btn.dataset.idx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      if(!line.params.msgs)return;
      line.params.msgs.splice(idx,1);
      if(!line.params.msgs.length)line.params.msgs=[{text:'',wait:0,se:'',channel:''}];
      render();
    });
  });
  // Ability rotation
  el.querySelectorAll('.ar-skill').forEach(function(inp){
    inp.addEventListener('input',function(){
      var id=+inp.dataset.id,idx=+inp.dataset.arIdx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var skills=line.params.skills||[];skills[idx]=inp.value;line.params.skills=skills;updateRow(id);updatePreview();
    });
  });
  el.querySelectorAll('.ar-del').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id,idx=+btn.dataset.arIdx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var skills=line.params.skills||[];skills.splice(idx,1);line.params.skills=skills;render();
    });
  });
  el.querySelectorAll('.ar-add').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var skills=line.params.skills||[];skills.push('');line.params.skills=skills;render();
    });
  });
}

function copyText(text,btn,originalLabel){
  // 同步、在使用者手勢內執行的 execCommand 複製法；回傳是否成功。
  // Firefox 對 navigator.clipboard.writeText() 這種非同步 API，
  // 若在 .then/.catch 才執行 execCommand，可能因已脫離「使用者手勢」
  // 情境而悄悄失敗或抓到舊的選取內容 —— 這正是只複製到第一行的成因。
  // 因此這裡改成「先同步試 execCommand，失敗才退回非同步 API」。
  var legacyCopy=function(){
    var ok=false;
    var ta=document.createElement('textarea');
    ta.value=text;
    // 給予實際尺寸並移出畫面：Firefox 對零尺寸或純 opacity:0 的 textarea
    // 呼叫 select() 可能只選中第一行，明確 focus + setSelectionRange 確保全選。
    ta.style.cssText='position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;opacity:0;';
    ta.setAttribute('readonly','');
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0,ta.value.length);
    try{ok=document.execCommand('copy');}catch(e){ok=false;}
    document.body.removeChild(ta);
    return ok;
  };
  var done=function(){
    var o=originalLabel||'複製';
    btn.textContent='✓ 已複製！';btn.classList.add('copied');
    setTimeout(function(){btn.textContent=o;btn.classList.remove('copied');},2000);
  };
  // 先同步嘗試 execCommand（一定在使用者手勢內，最可靠）；
  // 只有它失敗時才退回非同步的 Clipboard API。
  if(legacyCopy()){
    done();
  } else if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(function(){
      alert('複製失敗，請手動選取文字複製');
    });
  } else {
    alert('複製失敗，請手動選取文字複製');
  }
}

/* ════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════ */
var initialized=false;
function init(){
  var root=$('macro-root');if(!root)return;
  try{var s=localStorage.getItem(LS_DRAFT);if(s)restore(s);}catch(e){lines=[];}
  lastSnap=snap();hist=[lastSnap];hi=0;
  root.innerHTML=toolHTML();bindRoot();
  checkSharedOnLoad();
  ui.area=lines.length?'talk':'__tpl';
  renderAll();
  /* 版型依「框的實際寬度」切換（左側選單會佔掉一截，視窗寬度不準）：≥900 完整、700–900 中、<700 手機式 */
  var fit=function(){var w=root.clientWidth;root.classList.toggle('mx-md',w>=700&&w<900);root.classList.toggle('mx-sm',w<700);};
  fit();
  if(window.ResizeObserver)new ResizeObserver(fit).observe(root);window.addEventListener('resize',fit);
}
function tryInit(){
  var sc=$('macro');if(!sc)return;
  if(!initialized&&sc.classList.contains('active')){initialized=true;init();}
}
document.addEventListener('DOMContentLoaded',function(){
  var sc=$('macro');if(!sc)return;
  tryInit();new MutationObserver(tryInit).observe(sc,{attributes:true,attributeFilter:['class']});
});
window.__macroTool={get lines(){return lines;},ui:ui,init:init,renderFields:renderFields,addLine:addLine,model:model,onAct:onAct,
  setLines:function(l){lines=l;},refresh:function(){renderAll();}};
})();
