/* macro-app.js — 巨集頁（重新設計）：左側入口／中間時間軸／右側預覽。資料與輸出規則全部來自 macro-data.js */
(function(){
'use strict';
var D=window.MacroData,L=D.LISTS,SC=D.SCHEMA,TD=D.TDEFS,MAX=D.MAX,MAXC=D.MAX_C,esc=D.esc,cc=D.cc;
var lines=[],nextId=1,gcfg={mlock:false,merrorOff:false},selId=null,cat=null,tags=[],root=null;
/* ── 標籤（寧可多掛）── */
var TAGG=[['對象',['自己','隊友','公會','敵人','畫面']],['效果',['說話','標記','使用','切換','顯示','整理']],['情境',['副本','拍照','生產','PvP','日常']]];
var CATTAG={chat:'隊友 公會 說話 副本 日常',emote:'自己 畫面 使用 拍照 日常',skill:'自己 敵人 使用 副本 PvP',item:'自己 使用 整理 日常 生產',target:'敵人 隊友 標記 切換 副本',combat:'自己 敵人 切換 副本 PvP',timer:'隊友 說話 顯示 副本',move:'自己 切換 拍照 日常',pet:'自己 使用 切換 日常',camera:'畫面 拍照 切換',party:'隊友 公會 說話 日常',status:'自己 切換 日常',display:'畫面 顯示 切換',hotbar:'自己 切換 畫面 PvP',av:'畫面 切換',magia:'自己 切換',system:'自己 顯示 日常',macro:'自己 切換',custom:''};
var TAGRX=[[/標記|mk|wmark|mark/i,'標記 隊友 副本'],[/整理|itemsort|sort/i,'整理 自己'],[/fc|部隊|公會|通訊貝|cwl/i,'公會 說話'],[/pvp/i,'PvP'],[/製|生產|craft/i,'生產'],[/拍|gpose|camera|鏡頭|視角/i,'拍照 畫面'],[/目標|target|focus|assist|lock/i,'敵人 切換'],[/倒數|countdown|cd|rcheck|ready/i,'隊友 說話 副本'],[/hud|ui|名牌|視窗|window/i,'畫面 顯示'],[/echo|默語/i,'自己 顯示']];
var _tm={},_sm={};
function tagsOf(k){if(_tm[k])return _tm[k];var d=TD[k],s={};(CATTAG[d.cat]||'').split(' ').forEach(function(t){if(t)s[t]=1;});var tx=d.label+' '+k+' '+(d.kw||'');TAGRX.forEach(function(r){if(r[0].test(tx))r[1].split(' ').forEach(function(t){s[t]=1;});});return _tm[k]=s;}
function tagN(t){return Object.keys(TD).filter(function(k){return tagsOf(k)[t];}).length;}
function sample(k){if(k in _sm)return _sm[k];var r='';try{r=(D.buildLines({id:0,type:k,params:{},repeat:1})[0]||'').trim();}catch(e){}return _sm[k]=r.length>24?r.slice(0,23)+'…':r;}
function opts(c){var a=c.opts||(L[c.ref]||[]).map(function(x){return Array.isArray(x)?x:[x.v,x.l];});return c.blank?[['',c.blank]].concat(a):a;}
/* ── 輸出（與舊版 getAllOutput 相同：全域行在前，/micon 排到最後）── */
function outEntries(){
  var e=[],mi=[];if(gcfg.mlock)e.push({t:'/mlock',id:0});if(gcfg.merrorOff)e.push({t:'/merror off',id:0});
  lines.forEach(function(l){bl(l).forEach(function(s){(s.indexOf('/micon')===0?mi:e).push({t:s,id:l.id});});});
  return e.concat(mi);
}
function lineOut(l){return bl(l);}
function find(id){return lines.filter(function(l){return l.id===id;})[0];}
/* ── 畫面 ── */
function shell(){
  root.innerHTML='<h2 class="unified-gold-header small"><i class="ph ph-gear-six cr-title-ic" aria-hidden="true"></i>巨集建立工具</h2><div class="fancy-divider mini"><div class="long-silk-line-short"></div></div>'
   +'<div class="ma"><aside class="ma-rail" id="ma-rail"></aside><section class="ma-tl" id="ma-tl"></section><aside class="ma-pv" id="ma-pv"></aside></div>';
  all();
}
function all(){rail();tl();pv();}
function typeBtn(k){var d=TD[k],s=sample(k);return '<button type="button" class="ma-ty" data-act="add" data-type="'+k+'">'+d.icon+' <span>'+esc(d.label)+'</span>'+(s?'<code>'+esc(s)+'</code>':'')+'</button>';}
function rail(){
  var el=document.getElementById('ma-rail');if(!el)return;
  var h='<div class="ma-sec"><div class="ma-lbl">我想要</div>'+TAGG.map(function(g){return '<div class="ma-tagrow"><b>'+g[0]+'</b>'+g[1].map(function(t){return '<button type="button" class="ma-tag'+(tags.indexOf(t)>=0?' on':'')+'" data-act="tag" data-tag="'+t+'">'+t+'<i>'+tagN(t)+'</i></button>';}).join('')+'</div>';}).join('')+(tags.length?'<button type="button" class="ma-link" data-act="tag" data-tag="">清除標籤</button>':'')+'</div>';
  h+='<div class="ma-sec"><div class="ma-lbl">新增指令</div>';
  if(tags.length){
    var rows=Object.keys(TD).map(function(k){var n=0;tags.forEach(function(t){if(tagsOf(k)[t])n++;});return{k:k,n:n};}).sort(function(a,b){return b.n-a.n;});
    h+='<div class="ma-types">'+rows.map(function(r){return '<span class="'+(r.n?'':'ma-dim')+'">'+typeBtn(r.k)+'</span>';}).join('')+'</div>';
  }else if(cat===null){
    h+='<div class="ma-cats">'+D.CATS.map(function(c){return '<button type="button" class="ma-cat" data-act="cat" data-cat="'+c.id+'" title="'+esc(c.desc)+'">'+c.icon+'<span>'+esc(c.label)+'</span></button>';}).join('')+'</div>';
  }else{
    var c=D.CATS.filter(function(x){return x.id===cat;})[0];
    h+='<button type="button" class="ma-link" data-act="cat" data-cat="">← 全部分類</button><div class="ma-sub">'+c.icon+' '+esc(c.label)+'</div><div class="ma-types">'+Object.keys(TD).filter(function(k){return TD[k].cat===cat;}).map(typeBtn).join('')+'</div>';
  }
  h+='</div><div class="ma-sec"><div class="ma-lbl">模板</div><div class="ma-tpls">'+D.TEMPLATES.map(function(t){return '<button type="button" class="ma-tpl" data-act="tpl" data-tpl="'+t.id+'"><span>'+t.icon+'</span><b>'+esc(t.label)+'</b><small>'+esc(t.desc)+'</small></button>';}).join('')+'</div></div>';
  el.innerHTML=h;
}
function ctlHTML(l,c){
  var p=l.params,v=p[c.key],id=l.id,a=' data-id="'+id+'" data-k="'+c.key+'"';
  if(c.t==='sel'){return '<select class="ma-in"'+a+' data-ty="v">'+opts(c).map(function(o){var on=v===undefined?o[0]===c.def:o[0]===v;return '<option value="'+esc(o[0])+'"'+(on?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+'</select>';}
  if(c.t==='inp')return '<input class="ma-in" type="'+c.type+'"'+a+' data-ty="v" placeholder="'+esc(c.ph||'')+'" value="'+esc(v==null?'':v)+'"'+(c.min!=null?' min="'+c.min+'"':'')+(c.max!=null?' max="'+c.max+'"':'')+'>';
  if(c.t==='msg')return '<div class="ma-msg"><input class="ma-in" type="text"'+a+' data-ty="v" placeholder="'+esc(c.ph||'')+'" value="'+esc(v==null?'':v)+'"><div class="ma-ins">'+PROS.map(function(m){return '<button type="button" data-act="ins" data-id="'+id+'" data-k="'+c.key+'" data-s="'+esc(m.v)+'" title="'+esc(m.l)+'">'+esc(m.v)+'</button>';}).join('')+'</div></div>';
  if(c.t==='chk')return '<label class="ma-chk"><input type="checkbox"'+a+' data-ty="c"'+((v===undefined?c.def:v)?' checked':'')+'><span>'+esc(c.label)+'</span></label>';
  if(c.t==='unit'||c.t==='text')return '<span class="ma-unit">'+esc(c.text)+'</span>';
  if(c.t==='emote')return emoHTML(l,c);
  if(c.t==='jobs'){var cur=v||[];return '<div class="ma-jobs">'+L.JOBS.map(function(j){return '<label class="'+(cur.indexOf(j.v)>=0?'on':'')+'"><input type="checkbox" data-id="'+id+'" data-k="'+c.key+'" data-ty="j" data-val="'+j.v+'"'+(cur.indexOf(j.v)>=0?' checked':'')+'>'+esc(j.l)+'</label>';}).join('')+'</div>';}
  return '';
}
function editor(l){
  var d=TD[l.type],h='<div class="ma-ed"><div class="ma-row"><span class="ma-rl">指令類型</span><div class="ma-rc"><button type="button" class="ma-in ma-typecur" data-act="chtype" data-id="'+l.id+'">'+d.icon+' '+esc(d.label)+' ▾</button></div></div>'+(typeOpen===l.id?typePanel(l):'');
  (SC[l.type]&&SC[l.type].f||[]).forEach(function(f){
    if(f.k==='hint')h+='<p class="ma-hint">'+esc(f.t)+'</p>';
    else if(f.k==='warn')h+='<p class="ma-warn">'+esc(f.t)+'</p>';
    else if(f.k==='sep')h+='<div class="ma-sep"><span>'+esc(f.t)+'</span></div>';
    else if(f.k==='row')h+='<div class="ma-row"><span class="ma-rl">'+esc(f.label)+'</span><div class="ma-rc">'+f.ctl.map(function(c){return ctlHTML(l,c);}).join('')+'</div></div>';
    else if(f.k==='ccd')h+=ccdHTML(l);else if(f.k==='arlist')h+=arHTML(l);else if(f.k==='areas')h+=areasHTML(l);else if(f.k==='conds')h+=condsHTML(l);else if(f.k==='hudwins')h+=hudHTML(l);
  });
  if(!d.isBlock)h+='<div class="ma-row"><span class="ma-rl">重複次數</span><div class="ma-rc"><input class="ma-in ma-sm" type="number" min="1" max="15" data-id="'+l.id+'" data-ty="r" value="'+(l.repeat||1)+'"></div></div>';
  h+='<div class="ma-row"><span class="ma-rl">備註</span><div class="ma-rc"><input class="ma-in" type="text" data-id="'+l.id+'" data-ty="n" placeholder="只給自己看，不輸出到巨集" value="'+esc(l.note||'')+'"></div></div></div>';
  return h;
}
function cardHead(l,i){
  var d=TD[l.type]||{icon:'?',label:'未知'},o=lineOut(l),mx=0;o.forEach(function(s){mx=Math.max(mx,cc(s));});
  return '<div class="ma-h" data-act="sel" data-id="'+l.id+'"><span class="ma-grip" title="拖曳排序（下一階段）">⠿</span><span class="ma-n">'+(i+1)+'</span><span class="ma-t">'+d.icon+' '+esc(d.label)+'</span><code class="ma-o">'+esc(o[0]||'')+(o.length>1?'<em>＋'+(o.length-1)+' 行</em>':'')+'</code><span class="ma-g'+(mx>MAXC?' over':mx>D.WARN_C?' warn':'')+'">'+mx+'/'+MAXC+'</span><span class="ma-a">'+linkBtn(l)+'<button type="button" data-act="up" data-id="'+l.id+'"'+(i?'':' disabled')+'>▲</button><button type="button" data-act="dn" data-id="'+l.id+'"'+(i<lines.length-1?'':' disabled')+'>▼</button><button type="button" data-act="del" data-id="'+l.id+'">✕</button></span></div>';
}
function tl(){
  var el=document.getElementById('ma-tl');if(!el)return;
  el.innerHTML='<div class="ma-bar"><span class="ma-lbl">行時間軸</span><span class="ma-hb"><button type="button" id="ma-undo" data-act="undo" title="復原 (Ctrl+Z)"'+(hi>0?'':' disabled')+'>↶</button><button type="button" id="ma-redo" data-act="redo" title="重做 (Ctrl+Y)"'+(hi<hist.length-1?'':' disabled')+'>↷</button><button type="button" class="ma-link" data-act="clear"'+(lines.length?'':' disabled')+'>清空全部</button></span></div>'
   +varBarHTML()+(lines.length?lines.map(function(l,i){return '<div class="ma-card'+(l.id===selId?' sel':'')+'" data-card="'+l.id+'">'+cardHead(l,i)+(l.id===selId?editor(l):'')+'</div>';}).join(''):'<div class="ma-empty">從左側選一個指令，或套用模板開始</div>');
}
function pv(){
  var el=document.getElementById('ma-pv');if(!el)return;
  var e=outEntries(),n=e.length,g='';for(var i=0;i<MAX;i++)g+='<i class="'+(i<n?'on':'')+'"></i>';
  var w=validate(e,n);
  
  el.innerHTML='<div class="ma-sticky"><div class="ma-lbl">巨集預覽<button type="button" class="ma-edtg" data-act="pvedit">'+(pvEdit?'返回預覽':'編輯文字')+'</button></div><div class="ma-gems'+(n>MAX?' over':n>12?' warn':'')+'">'+g+'<span>'+n+' / '+MAX+' 行</span></div>'
   +'<div class="ma-gl"><label class="ma-chk"><input type="checkbox" data-ty="g" data-k="mlock"'+(gcfg.mlock?' checked':'')+'><span>/mlock 鎖定巨集</span></label><label class="ma-chk"><input type="checkbox" data-ty="g" data-k="merrorOff"'+(gcfg.merrorOff?' checked':'')+'><span>/merror off 關閉錯誤提示</span></label></div>'
   +(pvEdit?pvEditHTML():n>MAX?splitHTML(e):'<pre class="ma-pre" id="ma-pre">'+(n?e.map(function(x){return '<span class="ma-ln" data-id="'+x.id+'">'+esc(x.t)+'</span>';}).join('\n'):'（巨集為空）')+'</pre>')
   +w.map(function(x){return '<div class="ma-wn '+x.lv+'">'+(x.lv==='info'?'ⓘ ':'⚠ ')+esc(x.msg)+'</div>';}).join('')
   +(n>MAX?'':'<button type="button" class="ma-copy" data-act="copy"'+(n?'':' disabled')+'>複製巨集</button>')+'<div class="ma-tools"><button type="button" data-act="imp">匯入／檢查</button><button type="button" data-act="lib">我的巨集</button><button type="button" data-act="pron">代名詞速查</button></div></div>';
}
function pulse(id){[].forEach.call(document.querySelectorAll('.ma-ln[data-id="'+id+'"]'),function(x){x.classList.remove('hit');void x.offsetWidth;x.classList.add('hit');});}
function refresh(id){var c=document.querySelector('.ma-card[data-card="'+id+'"] .ma-h');var l=find(id);if(c&&l){var i=lines.indexOf(l);c.outerHTML=cardHead(l,i);}pv();pulse(id);}
/* ── 操作 ── */
function addLine(type){var l={id:nextId++,type:type,params:{},note:'',repeat:1};applyAllVars(l);lines.push(l);selId=l.id;all();var c=document.querySelector('.ma-card[data-card="'+l.id+'"]');if(c&&c.scrollIntoView)c.scrollIntoView({block:'nearest',behavior:'smooth'});pulse(l.id);}
function move(id,d){var i=lines.indexOf(find(id)),j=i+d;if(i<0||j<0||j>=lines.length)return;var t=lines[i];lines[i]=lines[j];lines[j]=t;tl();pv();pulse(id);}
function copyText(btn,txt){
  var t=txt!=null?txt:outEntries().map(function(x){return x.t;}).join('\n');
  var done=function(){btn.textContent='已複製 ✓';btn.classList.add('ok');setTimeout(function(){btn.textContent=btn.getAttribute('data-l')||'複製巨集';btn.classList.remove('ok');},1600);};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){fb();});}else fb();
  function fb(){var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy');done();}catch(x){}a.remove();}
}

/* ── 專用編輯器：倒數訊息、能力技輪換、整理背包（區域＋排序條件）、UI 視窗、情感動作 ── */
var emoOpen=null,emoQ='';
function so(a,cur){return a.map(function(o){var v=Array.isArray(o)?o[0]:o.v,t=Array.isArray(o)?o[1]:o.l;return '<option value="'+esc(v)+'"'+(v===cur?' selected':'')+'>'+esc(t)+'</option>';}).join('');}
function mkMsgs(l){var p=l.params;if(!p.msgs||!p.msgs.length)p.msgs=[{text:'',wait:0,se:'',channel:''}];return p.msgs;}
function ccdHTML(l){var id=l.id;return '<div class="ma-list">'+mkMsgs(l).map(function(m,i){var d=' data-id="'+id+'" data-idx="'+i+'"';
  return '<div class="ma-li"><span class="ma-n sm">'+(i+1)+'</span><div class="ma-lb"><input class="ma-in" type="text" data-ty="ccd" data-f="text"'+d+' placeholder="訊息內容" value="'+esc(m.text||'')+'"><div class="ma-ins">'+PROS.map(function(x){return '<button type="button" data-act="ins" data-s="'+esc(x.v)+'" title="'+esc(x.l)+'"'+d+'>'+esc(x.v)+'</button>';}).join('')+'</div>'
   +'<div class="ma-meta"><label>等待<input class="ma-in ma-sm" type="number" step="any" min="0" data-ty="ccd" data-f="wait"'+d+' value="'+(m.wait||0)+'"></label><label>音效<select class="ma-in" data-ty="ccd" data-f="se"'+d+'>'+so(L.SE,m.se||'')+'</select></label><label>頻道<select class="ma-in" data-ty="ccd" data-f="channel"'+d+'><option value="">（使用上方預設頻道）</option>'+so(L.CH,m.channel||'')+'</select></label></div></div>'
   +'<button type="button" class="ma-x" data-act="ccd-del"'+d+'>✕</button></div>';}).join('')+'<button type="button" class="ma-add" data-act="ccd-add" data-id="'+id+'">＋ 新增一行</button></div>';}
function arHTML(l){var sk=l.params.skills&&l.params.skills.length?l.params.skills:[''],id=l.id;return '<div class="ma-list">'+sk.map(function(t,i){return '<div class="ma-li"><span class="ma-n sm">'+(i+1)+'</span><div class="ma-lb"><input class="ma-in" type="text" data-ty="ar" data-id="'+id+'" data-idx="'+i+'" placeholder="技能名稱（遊戲內的名稱）" value="'+esc(t)+'"></div><button type="button" class="ma-x" data-act="ar-del" data-id="'+id+'" data-idx="'+i+'">✕</button></div>';}).join('')+'<button type="button" class="ma-add" data-act="ar-add" data-id="'+id+'">＋ 新增技能</button></div>';}
function chipsHTML(arr,cur,ty,id){return '<div class="ma-jobs">'+arr.map(function(a){var on=cur.indexOf(a.v)>=0;return '<label class="'+(on?'on':'')+'"><input type="checkbox" data-ty="'+ty+'" data-id="'+id+'" data-val="'+esc(a.v)+'"'+(on?' checked':'')+'>'+esc(a.l)+'</label>';}).join('')+'</div>';}
function areasHTML(l){var id=l.id;return '<div class="ma-quick"><button type="button" data-act="area-set" data-set="common" data-id="'+id+'">常用整理（背包＋兵裝庫＋鞍囊）</button><button type="button" data-act="area-set" data-set="all" data-id="'+id+'">全選</button><button type="button" data-act="area-set" data-set="none" data-id="'+id+'">全不選</button></div>'+chipsHTML(L.IS_AREAS,l.params.areas||[],'area',id);}
function hudHTML(l){return chipsHTML(L.HUD_W,l.params.windows||[],'win',l.id);}
function condsHTML(l){var id=l.id,cs=l.params.conditions||[];return '<div class="ma-list">'+cs.map(function(c,ci){var cd=L.IS_C.filter(function(x){return x.v===c.criterion;})[0],d=' data-id="'+id+'" data-ci="'+ci+'"';
  return '<div class="ma-li"><span class="ma-n sm">'+(ci+1)+'</span><div class="ma-lb ma-meta"><select class="ma-in" data-ty="crit"'+d+'>'+so(L.IS_C,c.criterion)+'</select>'+(cd&&cd.o?'<select class="ma-in" data-ty="ord"'+d+'>'+so([['des','降序（高→低）'],['asc','升序（低→高）']],c.order)+'</select>':'<span class="ma-unit">（無升降序）</span>')+'</div><button type="button" class="ma-x" data-act="cond-del"'+d+'>✕</button></div>';}).join('')+'<button type="button" class="ma-add" data-act="cond-add" data-id="'+id+'">＋ 新增條件</button></div>';}
function emoResults(){var q=emoQ.trim().toLowerCase(),r=L.EMOTES.filter(function(o){return !q||o.l.toLowerCase().indexOf(q)>=0||o.v.toLowerCase().indexOf(q)>=0;});return r.slice(0,80).map(function(o){return '<button type="button" data-act="emo-pick" data-val="'+esc(o.v)+'">'+esc(o.l)+'<i>'+esc(o.v)+'</i></button>';}).join('')+(r.length>80?'<small>還有 '+(r.length-80)+' 項，輸入文字縮小範圍</small>':'')+(r.length?'':'<small>沒有符合的項目，清除文字可看全部</small>');}
function emoHTML(l,c){var cur=l.params[c.key],o=L.EMOTES.filter(function(x){return x.v===cur;})[0],open=emoOpen&&emoOpen.id===l.id&&emoOpen.k===c.key,d=' data-id="'+l.id+'" data-k="'+c.key+'"';
  return '<div class="ma-emo"><button type="button" class="ma-in ma-emocur" data-act="emo-open"'+d+'>'+(o?esc(o.l)+' <i>'+esc(o.v)+'</i>':'選擇情感動作')+' ▾</button>'+(open?'<div class="ma-emopanel"><input class="ma-in" type="text" data-ty="emof" placeholder="篩選（可不輸入，直接在下方挑選）" value="'+esc(emoQ)+'"><div class="ma-emores" id="ma-emores">'+emoResults()+'</div></div>':'')+'</div>';}
function sAct(act,b,id){
  if(act==='pvedit'){pvEdit=!pvEdit;if(pvEdit)pvText=outEntries().map(function(x){return x.t;}).join('\n');pv();if(pvEdit)pvCheck();return true;}
  if(act==='pvcancel'){pvEdit=false;pv();return true;}
  if(act==='pvapply'){applyPv();return true;}
  if(act==='pvfix'){var r=pvText.split(/\r?\n/);r[+b.getAttribute('data-i')]=b.getAttribute('data-val');pvText=r.join('\n');var ta=document.getElementById('ma-pvta');if(ta)ta.value=pvText;pvCheck();return true;}
  if(act==='pron'){openPron();return true;}
  if(act==='imp'){openImp('');return true;}if(act==='lib'){openLib();return true;}
  if(act==='wait'){var dw=+b.getAttribute('data-w'),wi=[];lines.forEach(function(l){if(applyKind(l,'wait',null,dw))wi.push(l.id);});tl();pv();flash(wi);return true;}
  if(act==='undo'){jump(-1);hideToast();return true;}if(act==='redo'){jump(1);return true;}
  var l=find(id),ix=+b.getAttribute('data-idx'),ci=+b.getAttribute('data-ci');
  if(act==='emo-open'){var k=b.getAttribute('data-k');emoOpen=(emoOpen&&emoOpen.id===id)?null:{id:id,k:k};emoQ='';tl();return true;}
  if(act==='emo-pick'){var o=emoOpen&&find(emoOpen.id);if(o){o.params[emoOpen.k]=b.getAttribute('data-val');var oid=o.id;emoOpen=null;tl();pv();pulse(oid);}return true;}
  if(!l)return false;
  if(act==='chtype'){typeOpen=typeOpen===id?null:id;tl();return true;}
  if(act==='settype'){var nt=b.getAttribute('data-type');if(nt&&nt!==l.type){l.type=nt;l.params={};l.own=undefined;applyAllVars(l);}typeOpen=null;tl();pv();pulse(l.id);return true;}
  if(act==='link'){if(!l.indep){l.indep=true;restoreLine(l);}else{l.indep=false;applyAllVars(l);}tl();pv();flash([l.id]);return true;}
  if(act==='ccd-add'){mkMsgs(l).push({text:'',wait:0,se:'',channel:''});tl();pv();return true;}
  if(act==='ccd-del'){var m=mkMsgs(l);m.splice(ix,1);if(!m.length)l.params.msgs=[{text:'',wait:0,se:'',channel:''}];tl();pv();return true;}
  if(act==='ar-add'){var s1=(l.params.skills||['']).slice();s1.push('');l.params.skills=s1;tl();return true;}
  if(act==='ar-del'){var s2=(l.params.skills||['']).slice();s2.splice(ix,1);l.params.skills=s2;tl();pv();return true;}
  if(act==='area-set'){var w=b.getAttribute('data-set');l.params.areas=w==='common'?['inventory','armoury','saddlebag']:w==='all'?L.IS_AREAS.map(function(a){return a.v;}):[];tl();pv();return true;}
  if(act==='cond-add'){var c1=(l.params.conditions||[]).slice();c1.push({criterion:'ilv',order:'des'});l.params.conditions=c1;tl();pv();return true;}
  if(act==='cond-del'){l.params.conditions=(l.params.conditions||[]).filter(function(_,i){return i!==ci;});tl();pv();return true;}
  return false;
}
function sEdit(t,ty,l){
  var ix=+t.getAttribute('data-idx'),ci=+t.getAttribute('data-ci');
  if(ty==='emof'){emoQ=t.value;var r=document.getElementById('ma-emores');if(r)r.innerHTML=emoResults();return true;}
  if(ty==='ccd'){var m=mkMsgs(l)[ix],f=t.getAttribute('data-f');if(m){m[f]=f==='wait'?(parseFloat(t.value)||0):t.value;refresh(l.id);}return true;}
  if(ty==='ar'){var a=(l.params.skills||['']).slice();a[ix]=t.value;l.params.skills=a;refresh(l.id);return true;}
  if(ty==='area'||ty==='win'){var key=ty==='area'?'areas':'windows',arr=(l.params[key]||[]).slice(),v=t.getAttribute('data-val'),i=arr.indexOf(v);if(t.checked&&i<0)arr.push(v);if(!t.checked&&i>=0)arr.splice(i,1);l.params[key]=arr;t.parentNode.className=t.checked?'on':'';refresh(l.id);return true;}
  if(ty==='crit'||ty==='ord'){var cs=(l.params.conditions||[]).slice();if(cs[ci]){cs[ci][ty==='crit'?'criterion':'order']=t.value;l.params.conditions=cs;}if(ty==='crit')tl();refresh(l.id);return true;}
  return false;
}

/* ── 超過 15 行：自動分割成兩個巨集（全域行與 /micon 兩份都帶上）── */
function splitOut(e){
  var hd=e.filter(function(x){return x.id===0;}).map(function(x){return x.t;}),mi=e.filter(function(x){return x.id!==0&&x.t.indexOf('/micon')===0;}).map(function(x){return x.t;}),bd=e.filter(function(x){return x.id!==0&&x.t.indexOf('/micon')!==0;}).map(function(x){return x.t;});
  var m1max=MAX-hd.length-(mi.length?1:0),m1=hd.concat(bd.slice(0,m1max)),m2=hd.concat(bd.slice(m1max));
  if(mi.length){m1.push(mi[0]);m2.push(mi[0]);}
  var over=Math.max(0,m2.length-MAX);return{m1:m1,m2:m2.slice(0,MAX),overflow:over};
}
function splitHTML(e){var sp=splitOut(e);function blk(n,a){return '<div class="ma-sp"><div class="ma-spl">巨集 '+n+'（'+a.length+'/'+MAX+' 行）</div><pre class="ma-pre">'+esc(a.join('\n'))+'</pre><button type="button" class="ma-copy" data-act="copy2" data-w="'+n+'" data-l="複製巨集 '+n+'">複製巨集 '+n+'</button></div>';}return blk(1,sp.m1)+blk(2,sp.m2);}
/* ── 復原／重做 ── */
var hist=[],hi=-1,sT=null,tT=null;
function ser(){return JSON.stringify({l:lines,g:gcfg,n:nextId,v:gv});}
function histUI(){var u=document.getElementById('ma-undo'),r=document.getElementById('ma-redo');if(u)u.disabled=hi<=0;if(r)r.disabled=hi>=hist.length-1;}
function snap(now){clearTimeout(sT);var f=function(){var s=ser();if(hist[hi]===s)return;var pl=hi>=0?JSON.parse(hist[hi]).l.length:lines.length;hist=hist.slice(0,hi+1);hist.push(s);hi++;if(hist.length>80){hist.shift();hi--;}histUI();if(Math.abs(pl-lines.length)>=2)toast('已變更 '+Math.abs(pl-lines.length)+' 行');};if(now)f();else sT=setTimeout(f,450);}
function jump(d){snap(true);var j=hi+d;if(j<0||j>=hist.length)return;hi=j;var o=JSON.parse(hist[hi]);lines=o.l;gcfg=o.g;nextId=o.n;gv=o.v||{channel:'',target:'',se:''};if(!find(selId))selId=null;all();histUI();}
function toast(m,noUndo){var t=document.getElementById('ma-toast');if(!t){t=document.createElement('div');t.id='ma-toast';t.className='ma-toast';document.body.appendChild(t);t.addEventListener('click',function(e){if(e.target.closest('[data-act=undo]')){jump(-1);hideToast();}});}t.innerHTML='<span>'+esc(m)+'</span>'+(noUndo?'':'<button type="button" data-act="undo">↶ 還原</button>');t.classList.add('show');clearTimeout(tT);tT=setTimeout(hideToast,5000);}
function hideToast(){var t=document.getElementById('ma-toast');if(t)t.classList.remove('show');}
document.addEventListener('keydown',function(e){var el=document.activeElement,ty=el&&(/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)||el.isContentEditable),sc=document.getElementById('macro');if(ty||!sc||!sc.classList.contains('active')||!(e.ctrlKey||e.metaKey))return;if(e.key==='z'){e.preventDefault();jump(e.shiftKey?1:-1);}else if(e.key==='y'){e.preventDefault();jump(1);}});
/* ── 指標拖曳排序（滑鼠／觸控／手寫筆；按下就跟手，不靠瀏覽器內建拖放）── */
var drag=null;
function clearMarks(){[].forEach.call(root.querySelectorAll('.ins-top,.ins-bot'),function(x){x.classList.remove('ins-top','ins-bot');});}
function initDrag(){
  root.addEventListener('pointerdown',function(e){var g=e.target.closest('.ma-grip');if(!g||(e.button&&e.button>0))return;var c=g.closest('.ma-card');if(!c)return;drag={id:+c.getAttribute('data-card'),y0:e.clientY,on:false,card:c,tgt:null,after:false,pid:e.pointerId,g:g};try{g.setPointerCapture(e.pointerId);}catch(x){}e.preventDefault();});
  root.addEventListener('pointermove',function(e){if(!drag)return;
    if(!drag.on){if(Math.abs(e.clientY-drag.y0)<3)return;drag.on=true;drag.card.classList.add('drag');}
    clearMarks();var cs=[].slice.call(root.querySelectorAll('.ma-card')).filter(function(c){return c!==drag.card;}),t=null,after=false;
    for(var i=0;i<cs.length;i++){var r=cs[i].getBoundingClientRect();if(e.clientY<r.top+r.height/2){t=cs[i];break;}}
    if(!t&&cs.length){t=cs[cs.length-1];after=true;}
    if(t){t.classList.add(after?'ins-bot':'ins-top');drag.tgt=+t.getAttribute('data-card');drag.after=after;}else drag.tgt=null;
    if(e.clientY<50)window.scrollBy(0,-14);else if(window.innerHeight-e.clientY<50)window.scrollBy(0,14);});
  function end(ok){if(!drag)return;var d=drag;drag=null;clearMarks();d.card.classList.remove('drag');try{d.g.releasePointerCapture(d.pid);}catch(x){}
    if(ok&&d.on&&d.tgt!=null&&d.tgt!==d.id){var mv=find(d.id);lines=lines.filter(function(l){return l!==mv;});var ti=lines.indexOf(find(d.tgt));lines.splice(ti+(d.after?1:0),0,mv);tl();pv();pulse(d.id);}}
  root.addEventListener('pointerup',function(){end(true);});root.addEventListener('pointercancel',function(){end(false);});
}
/* ── 編輯時：只亮起影響範圍（不飛光點）；游標指到某一行，預覽對應行亮起 ── */
var hov=null;
function hoverLink(e){var c=e.target.closest('.ma-card'),id=c?c.getAttribute('data-card'):null;if(id===hov)return;[].forEach.call(root.querySelectorAll('.ma-ln.on'),function(x){x.classList.remove('on');});hov=id;if(id)[].forEach.call(root.querySelectorAll('.ma-ln[data-id="'+id+'"]'),function(x){x.classList.add('on');});}
/* ── 邀請光：只用在「下一步」引導。光點飛向目標，目標邊緣流光繞一圈，然後靜止 ── */
var gT=null,gShown={},moteEl=null,reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function guided(){try{return !!localStorage.getItem('ma_guided');}catch(e){return false;}}
function light(a,b,done){
  if(moteEl){moteEl.remove();moteEl=null;}if(reduce||!document.body.animate){done&&done();return;}
  var m=document.createElement('i');m.className='ma-mote';document.body.appendChild(m);moteEl=m;var H=window.innerHeight,cl=function(y){return Math.max(12,Math.min(H-12,y));};
  var x0=a.left+a.width/2,y0=cl(a.top+a.height/2),x1=b.left+b.width/2,y1=cl(b.top+Math.min(b.height/2,40));
  var an=m.animate([{transform:'translate('+x0+'px,'+y0+'px) scale(.6)',opacity:0},{opacity:1,offset:.15},{transform:'translate('+x1+'px,'+y1+'px) scale(1)',opacity:1,offset:.9},{transform:'translate('+x1+'px,'+y1+'px) scale(1.6)',opacity:0}],{duration:700,easing:'cubic-bezier(.4,0,.2,1)'});
  an.onfinish=function(){if(moteEl===m){m.remove();moteEl=null;}done&&done();};
}
function armGuide(){clearTimeout(gT);if(guided())return;gT=setTimeout(runGuide,4500);}
function runGuide(){
  var sc=document.getElementById('macro');if(!sc||!sc.classList.contains('active'))return;
  var step=lines.length?1:0;if(gShown[step])return;
  var t=step?root.querySelector('.ma-copy:not(:disabled)'):root.querySelector('#ma-rail .ma-sec:nth-child(2)');if(!t||t.offsetParent===null)return;
  var src=document.querySelector('#macro .cr-medal')||t;gShown[step]=1;
  light(src.getBoundingClientRect(),t.getBoundingClientRect(),function(){t.classList.remove('ma-edge');void t.offsetWidth;t.classList.add('ma-edge');});
}
document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.ma-copy')){try{localStorage.setItem('ma_guided','1');}catch(x){}}},true);

/* ── 全局變數（頻道／目標／音效／等待）：每行可「跟隨」或「獨立」；解除連結 = 回到這一行原本的值 ── */
var PROS=L.MSG_PROS.concat([{v:'{頻道}',l:'頻道名稱（輸出時自動換成該行頻道的名稱）'}]);
var gv={channel:'',target:'',se:''},VK=[['channel','頻道','CH'],['target','目標','TGT'],['se','音效','SE']],_tk={};
function kindOf(k){return /channel$/i.test(k)?'channel':/(^se$|Se$)/.test(k)?'se':/(^target$|Target$)/.test(k)?'target':/(wait$|^secs$)/i.test(k)?'wait':'';}
function chName(v){var c=L.CH.filter(function(x){return x.v===v;})[0];return c?c.l.split(/[ （]/)[0]:v;}
function bl(l){var o=D.buildLines(l);if(!o.some(function(x){return x.indexOf('{頻道}')>=0;}))return o;var p=l.params||{},n=chName(p.channel||p.notifyChannel||gv.channel||'p');return o.map(function(x){return x.split('{頻道}').join(n);});}
function hasCcd(l){return (SC[l.type].f||[]).some(function(f){return f.k==='ccd';});}
function ctlsOf(type){var r=[];((SC[type]&&SC[type].f)||[]).forEach(function(f){if(f.k==='row')f.ctl.forEach(function(c){if(c.key&&(c.t==='sel'||c.t==='inp')&&kindOf(c.key))r.push(c);});});return r;}
function typeKinds(type){if(_tk[type])return _tk[type];var s={};ctlsOf(type).forEach(function(c){s[kindOf(c.key)]=1;});if((SC[type].f||[]).some(function(f){return f.k==='ccd';})){s.channel=1;s.se=1;s.wait=1;}return _tk[type]=Object.keys(s);}
function getPath(o,path){var a=path.split('.');for(var i=0;i<a.length&&o;i++)o=o[a[i]];return o;}
function setPath(o,path,val){var a=path.split('.'),i;for(i=0;i<a.length-1;i++){o=o[a[i]];if(!o)return;}if(val===null)delete o[a[a.length-1]];else o[a[a.length-1]]=val;}
function ownSet(l,kind,path){l.own=l.own||{};var m=l.own[kind]=l.own[kind]||{};if(!(path in m)){var v=getPath(l.params,path);m[path]=v===undefined?null:v;}}
function applyKind(l,kind,val,delta){
  if(l.indep||!typeKinds(l.type).length)return false;var ch=false,p=l.params;
  if(kind!=='wait'){
    ctlsOf(l.type).forEach(function(c){if(c.t!=='sel'||kindOf(c.key)!==kind)return;if(!opts(c).some(function(o){return o[0]===val;}))return;ownSet(l,kind,c.key);p[c.key]=val;ch=true;});
    if(kind!=='target'&&hasCcd(l))mkMsgs(l).forEach(function(m,i){ownSet(l,kind,'msgs.'+i+'.'+kind);m[kind]=val;ch=true;});
  }else{
    ctlsOf(l.type).forEach(function(c){if(c.t!=='inp'||kindOf(c.key)!=='wait')return;var n=parseFloat(p[c.key]);if(!(n>0))return;ownSet(l,kind,c.key);p[c.key]=String(Math.min(c.max?+c.max:999,Math.max(1,n+delta)));ch=true;});
    if(hasCcd(l))mkMsgs(l).forEach(function(m,i){var n=parseFloat(m.wait);if(!(n>0))return;ownSet(l,kind,'msgs.'+i+'.wait');m.wait=Math.max(0,n+delta);ch=true;});
  }return ch;
}
function restoreLine(l,kinds){var ow=l.own||{};(kinds||Object.keys(ow)).forEach(function(k){var m=ow[k];if(!m)return;Object.keys(m).forEach(function(q){setPath(l.params,q,m[q]);});delete ow[k];});}
function applyAllVars(l){['channel','target','se'].forEach(function(k){if(gv[k])applyKind(l,k,gv[k]);});}
function varBarHTML(){
  var f=0,i=0;lines.forEach(function(l){if(typeKinds(l.type).length){if(l.indep)i++;else f++;}});
  return '<div class="ma-vars"><div class="ma-vl">全局變數<small>改一個，所有「跟隨」的行一起改</small></div><div class="ma-vr">'+VK.map(function(k){return '<label>'+k[1]+'<select class="ma-in" data-ty="var" data-var="'+k[0]+'"><option value="">（不變更）</option>'+so(L[k[2]].filter(function(o){return o.v&&o.v!=='custom';}),gv[k[0]])+'</select></label>';}).join('')+'<span class="ma-wb">等待<button type="button" data-act="wait" data-w="-1">−1</button><button type="button" data-act="wait" data-w="1">＋1</button>秒</span><span class="ma-vs">'+f+' 行跟隨'+(i?' · '+i+' 行獨立':'')+'</span></div></div>';
}
function linkBtn(l){
  if(!typeKinds(l.type).length)return '';var own=[];Object.keys(l.own||{}).forEach(function(k){Object.keys(l.own[k]).forEach(function(q){var v=l.own[k][q];if(v!==null&&v!==''&&own.length<3)own.push(v);});});
  var tip=l.indep?'重新跟隨全局變數':'解除連結：這一行回到原本的設定'+(own.length?'（'+own.join(' ')+'）':'');
  return '<button type="button" class="ma-lk'+(l.indep?' off':'')+'" data-act="link" data-id="'+l.id+'" title="'+esc(tip)+'"><i class="ph ph-'+(l.indep?'link-break':'link')+'"></i></button>';
}
function flash(ids){ids.forEach(function(id){var c=root.querySelector('.ma-card[data-card="'+id+'"]');if(c){c.classList.remove('flash');void c.offsetWidth;c.classList.add('flash');}pulse(id);});}

/* ── 匯入／檢查：三態判定，只檢查指令本身；對話內容（含全形、符號、圖案）一律不碰；所有修正都要按了才套用 ── */
var ALIAS={action:'ac',petaction:'pac',companionaction:'cac',echo:'e',say:'s',shout:'sh',yell:'y',reply:'r',alliance:'a',playtime:'ptime',macroicon:'micon',macrolock:'mlock',macroerror:'merror',actionerror:'aerror',targetmode:'tmode',chatmode:'cm'};
function knownSet(){var m={};L.KNOWN_CMDS.forEach(function(c){m[c]=1;});L.CH.forEach(function(c){m[c.v]=1;});return m;}
function lev(a,b){var d=[],i,j;for(i=0;i<=a.length;i++)d[i]=[i];for(j=1;j<=b.length;j++)d[0][j]=j;for(i=1;i<=a.length;i++)for(j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length];}
function checkLine(raw,ks){
  var r={st:'ok',msgs:[],fix:null},t=raw;if(!t.trim())return null;
  if(/^\s+\S/.test(t)&&t.trim().charAt(0)==='/'){r.st='warn';r.msgs.push('行首有空白');r.fix={lbl:'移除行首空白',val:t.replace(/^\s+/,'')};t=r.fix.val;}
  else if(t.charAt(0)==='／'){r.st='warn';r.msgs.push('開頭是全形斜線「／」，遊戲不會當成指令');r.fix={lbl:'改成半形 /',val:'/'+t.slice(1)};t=r.fix.val;}
  if(t.charAt(0)==='/'){
    var m=/^\/([A-Za-z0-9_]+)/.exec(t),low=m&&m[1].toLowerCase();
    if(!m){if(r.st==='ok')r.st='warn';r.msgs.push('斜線後缺少指令名稱');}
    else if(ALIAS[low])r.msgs.push('長寫，等同 /'+ALIAS[low]+'（兩種寫法都可以，不需要修改）');
    else if(!ks[low]){var best=null,bd=3;Object.keys(ks).forEach(function(c){var d=lev(low,c);if(d<bd){bd=d;best=c;}});r.st='unk';r.msgs.push('本工具資料庫未收錄 /'+m[1]+'（不代表遊戲一定沒有）');if(best&&low.length>1)r.fix={lbl:'你是不是想打 /'+best+'？',val:'/'+best+t.slice(m[0].length)};}
  }else{r.st=r.st==='ok'?'unk':r.st;r.msgs.push('不是指令行，工具不檢查內容');}
  var w=/<wait\.(\d+)>/.exec(t);if(w&&+w[1]>60){if(r.st==='ok')r.st='warn';r.msgs.push('<wait.'+w[1]+'> 超過 60，遊戲會當成 60 秒');}else if(w&&+w[1]<1){if(r.st==='ok')r.st='warn';r.msgs.push('<wait.'+w[1]+'> 的秒數需為 1 以上');}
  var c=cc(t);if(c>MAXC){r.st='warn';r.msgs.push('超出字元上限（'+c+'/'+MAXC+'）');}
  return r;
}
function impParse(txt,keep){
  var rows=txt.split(/\r?\n/).filter(function(x){return x.trim();}),g={mlock:false,merrorOff:false},out=[],chs={};
  while(!keep&&rows.length&&/^\s*(\/mlock|\/merror\s+off)\s*$/i.test(rows[0])){if(/mlock/i.test(rows[0]))g.mlock=true;else g.merrorOff=true;rows.shift();}
  L.CH.forEach(function(c){chs[c.v]=1;});
  rows.forEach(function(raw){var t=raw.trim(),m=/^\/([A-Za-z0-9]+)\s+([\s\S]*)$/.exec(t);
    if(m&&chs[m[1].toLowerCase()]){var msg=m[2],wt='',se='',a=/<wait\.(\d+)>\s*$/.exec(msg);if(a){wt=a[1];msg=msg.slice(0,a.index);}var b=/(<se\.\d+>)\s*$/.exec(msg);if(b){se=b[1];msg=msg.slice(0,b.index);}
      out.push({id:nextId++,type:'chat',params:{channel:m[1].toLowerCase(),message:msg.replace(/\s+$/,''),se:se,inlineWait:wt},note:'',repeat:1});}
    else out.push({id:nextId++,type:'custom',params:{text:t},note:'',repeat:1});});
  return{g:g,lines:out};
}
function impCheck(){
  var ta=document.getElementById('ma-ta'),box=document.getElementById('ma-res');if(!ta||!box)return;
  var ks=knownSet(),rows=ta.value.split(/\r?\n/),n={ok:0,warn:0,unk:0},h='';
  rows.forEach(function(raw,i){var r=checkLine(raw,ks);if(!r)return;n[r.st]++;h+='<div class="ma-ck '+r.st+'"><i>'+(r.st==='ok'?'✓':r.st==='warn'?'⚠':'？')+'</i><code>'+esc(raw)+'</code>'+(r.msgs.length?'<span>'+esc(r.msgs.join('；'))+'</span>':'')+(r.fix?'<button type="button" data-m="fix" data-i="'+i+'" data-val="'+esc(r.fix.val)+'">'+esc(r.fix.lbl)+'</button>':'')+'</div>';});
  var tot=rows.filter(function(x){return x.trim();}).length;
  box.innerHTML=h?'<div class="ma-cks">✓ '+n.ok+'　⚠ '+n.warn+'　？ '+n.unk+(tot>MAX?'　· 共 '+tot+' 行，超過 '+MAX+' 行上限（會自動分割）':'')+'</div>'+h+'<div class="ma-ckf">未檢出問題不代表一定能執行；所有建議都不會自動套用。</div>':'';
}
function openImp(txt){mOpen('貼上巨集檢查／匯入','<textarea id="ma-ta" class="ma-ta" rows="7" spellcheck="false" placeholder="把巨集貼在這裡，每行一條指令。對話內容（含全形、符號、圖案）不會被檢查。">'+esc(txt)+'</textarea><div id="ma-res"></div><div class="ma-mact"><button type="button" data-m="load">帶入目前巨集</button><button type="button" data-m="append">附加在現有行後面</button><button type="button" data-m="replace">取代現有行</button></div>');if(txt)impCheck();}
/* ── 我的巨集庫（localStorage）＋ 匯出入 ＋ 分享連結（#page=macro&m=…，沿用站上既有的 hash 路由）── */
function serial(){return{l:lines.map(function(x){return{t:x.type,p:x.params,r:x.repeat,n:x.note,i:x.indep,o:x.own};}),g:gcfg,v:gv};}
function loadData(d){if(!d||!d.l)return false;lines=d.l.map(function(x){return{id:nextId++,type:TD[x.t]?x.t:'custom',params:TD[x.t]?(x.p||{}):{text:'（未知行類型 '+x.t+'）'},repeat:x.r||1,note:x.n||'',indep:!!x.i,own:x.o||undefined};});gcfg={mlock:!!(d.g&&d.g.mlock),merrorOff:!!(d.g&&d.g.merrorOff)};gv=d.v||{channel:'',target:'',se:''};selId=null;all();snap(true);return true;}
function libGet(){try{return JSON.parse(localStorage.getItem('ma_lib')||'[]');}catch(e){return [];}}
function libSet(a){try{localStorage.setItem('ma_lib',JSON.stringify(a));return true;}catch(e){toast('無法寫入瀏覽器儲存空間，請改用「匯出備份」',true);return false;}}
function b64e(o){return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function b64d(t){t=t.replace(/-/g,'+').replace(/_/g,'/');while(t.length%4)t+='=';return JSON.parse(decodeURIComponent(escape(atob(t))));}
function shareURL(){return location.href.replace(/#.*$/,'')+'#page=macro&m='+b64e(serial());}
function fromHash(){var m=/[#&]m=([^&]+)/.exec(location.hash);if(!m||lines.length)return;try{if(loadData(b64d(m[1]))){toast('已載入分享的巨集',true);try{history.replaceState(null,'',location.href.replace(/&m=[^&]+/,'').replace(/#m=[^&]+&?/,'#'));}catch(e){}}}catch(e){toast('分享連結內容無法讀取',true);}}
function libHTML(){var a=libGet();return '<div class="ma-mact"><input id="ma-name" class="ma-in" maxlength="30" placeholder="為目前的巨集命名"><button type="button" data-m="save">儲存目前巨集</button></div><div class="ma-mact"><button type="button" data-m="share">複製分享連結</button><button type="button" data-m="export">匯出備份</button><label class="ma-fl">匯入備份<input type="file" id="ma-file" accept=".json,application/json" hidden></label></div>'
  +(a.length?a.map(function(x){return '<div class="ma-ck ok"><i>◆</i><code>'+esc(x.name)+'</code><span>'+x.d.l.length+' 行 · '+new Date(x.ts).toLocaleDateString()+'</span><button type="button" data-m="lload" data-id="'+x.id+'">載入</button><button type="button" data-m="lover" data-id="'+x.id+'">以目前內容覆寫</button><button type="button" data-m="ldel" data-id="'+x.id+'">刪除</button></div>';}).join(''):'<div class="ma-ckf">還沒有儲存的巨集。資料只存在這個瀏覽器，清除瀏覽器資料會消失，重要的請用「匯出備份」。</div>');}
function openLib(){mOpen('我的巨集（存在這個瀏覽器）',libHTML());}
var modal=null;
function mOpen(t,h){if(!modal){modal=document.createElement('div');modal.className='ma-modal';modal.hidden=true;modal.innerHTML='<div class="ma-mbox"><div class="ma-mh"><b id="ma-mt"></b><button type="button" data-m="close">✕</button></div><div id="ma-mb"></div></div>';document.body.appendChild(modal);modal.addEventListener('click',mClick);modal.addEventListener('input',function(e){if(e.target.id==='ma-ta')impCheck();});modal.addEventListener('change',mFile);document.addEventListener('keydown',function(e){if(e.key==='Escape')modal.hidden=true;});}
  document.getElementById('ma-mt').textContent=t;document.getElementById('ma-mb').innerHTML=h;modal.hidden=false;}
function mFile(e){if(e.target.id!=='ma-file'||!e.target.files[0])return;var fr=new FileReader();fr.onload=function(){try{var o=JSON.parse(fr.result),a=libGet(),n=0;(o.items||[]).forEach(function(x){if(x&&x.d&&x.d.l){x.id='m'+Date.now().toString(36)+n;a.push(x);n++;}});if(libSet(a)){document.getElementById('ma-mb').innerHTML=libHTML();toast('已匯入 '+n+' 個巨集',true);}}catch(x){toast('檔案格式不正確',true);}};fr.readAsText(e.target.files[0]);e.target.value='';}
function mClick(e){
  var b=e.target.closest('[data-m]'),ta=document.getElementById('ma-ta');
  if(e.target===modal||(b&&b.getAttribute('data-m')==='close')){modal.hidden=true;return;}if(!b)return;var k=b.getAttribute('data-m'),id=b.getAttribute('data-id');
  if(k==='load'&&ta){ta.value=outEntries().map(function(x){return x.t;}).join('\n');impCheck();}
  else if(k==='fix'&&ta){var r=ta.value.split(/\r?\n/);r[+b.getAttribute('data-i')]=b.getAttribute('data-val');ta.value=r.join('\n');impCheck();}
  else if((k==='append'||k==='replace')&&ta&&ta.value.trim()){var p=impParse(ta.value);if(k==='replace')lines=[];lines=lines.concat(p.lines);if(p.g.mlock)gcfg.mlock=true;if(p.g.merrorOff)gcfg.merrorOff=true;selId=null;all();snap(true);modal.hidden=true;toast('已匯入 '+p.lines.length+' 行');}
  else if(k==='pron'){var tx=b.getAttribute('data-s');(navigator.clipboard?navigator.clipboard.writeText(tx):Promise.reject()).then(function(){toast('已複製 '+tx,true);},function(){window.prompt('複製：',tx);});}
  else if(k==='save'){var a=libGet(),nm=((document.getElementById('ma-name')||{}).value||'').trim()||'巨集 '+(a.length+1);a.unshift({id:'m'+Date.now().toString(36),name:nm,ts:Date.now(),d:serial()});if(libSet(a)){document.getElementById('ma-mb').innerHTML=libHTML();toast('已儲存「'+nm+'」',true);}}
  else if(k==='lload'){var it=libGet().filter(function(x){return x.id===id;})[0];if(it){loadData(it.d);modal.hidden=true;}}
  else if(k==='lover'){var ar=libGet(),i2=ar.filter(function(x){return x.id===id;})[0];if(i2){i2.d=serial();i2.ts=Date.now();libSet(ar);toast('已覆寫「'+i2.name+'」',true);document.getElementById('ma-mb').innerHTML=libHTML();}}
  else if(k==='ldel'){libSet(libGet().filter(function(x){return x.id!==id;}));document.getElementById('ma-mb').innerHTML=libHTML();}
  else if(k==='share'){var u=shareURL();if(u.length>6000)toast('巨集較長，連結可能無法在部分程式中開啟，建議改用「匯出備份」',true);(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(function(){toast('分享連結已複製',true);},function(){window.prompt('複製此連結：',u);});}
  else if(k==='export'){var bl2=new Blob([JSON.stringify({v:1,items:libGet()})],{type:'application/json'}),a2=document.createElement('a');a2.href=URL.createObjectURL(bl2);a2.download='ffxiv-macro-library.json';document.body.appendChild(a2);a2.click();a2.remove();}
}

/* ── 警告（完整移植舊版 validate：必填欄位、/mlock 位置、重複 /micon、熱鍵欄衝突、技能提示）── */
function validate(e,n){
  var W=[];
  if(n>MAX){var sp=splitOut(e);W.push({lv:'info',msg:'超過 '+MAX+' 行，已自動分割成兩個巨集，請依序執行巨集 1 → 巨集 2'});if(sp.overflow>0)W.push({lv:'error',msg:'即使分割仍放不下，巨集 2 少了 '+sp.overflow+' 行，請刪減內容'});}
  e.forEach(function(x,i){var c=cc(x.t);if(c>MAXC)W.push({lv:'error',msg:'第 '+(i+1)+' 行字元超出上限（'+c+'/'+MAXC+'）'});});
  var ml=lines.findIndex(function(l){return l.type==='mlock';});
  if(ml>0&&!gcfg.mlock)W.push({lv:'warn',msg:'/mlock 在第 '+(ml+1)+' 行，前面的行仍可能被中斷。建議移至第1行，或使用右側的 /mlock 選項。'});
  var mi=lines.filter(function(l){return l.type==='micon';}).length;if(mi>1)W.push({lv:'warn',msg:'巨集中有 '+mi+' 個 /micon，只有第一個圖示生效，其餘被忽略。'});
  var hn=lines.some(function(l){return l.type==='hotbar'&&l.params.zone!=='pvp';}),hp=lines.some(function(l){return l.type==='hotbar'&&l.params.zone==='pvp';});
  if(hn&&hp)W.push({lv:'warn',msg:'同時包含一般熱鍵欄（非戰鬥區）和 PvP 熱鍵欄（對戰區），兩者無法在同一場景生效。'});
  lines.forEach(function(l,i){var p=l.params||{},miss=null;
    switch(l.type){
      case 'tell':if(!p.target)miss='悄悄話對象尚未填寫';break;
      case 'skill':case 'generalskill':case 'blueaction':case 'pvpaction':case 'petaction':case 'companionaction':if(!p.skillName)miss='技能／動作名稱尚未填寫';break;
      case 'item':if(!p.itemName)miss='道具名稱尚未填寫';break;
      case 'statusoff':if(!p.statusName)miss='狀態名稱尚未填寫';break;
      case 'micon':if(p.miconType!=='gearset'&&!p.miconName)miss='/micon 的技能名稱尚未填寫';break;
      case 'emote':if(p.emoteName==='custom'&&!p.emoteCustom)miss='自訂情感動作指令名稱尚未填寫';break;
      case 'em':if(p.addMotion&&p.motionEmote==='custom'&&!p.motionCustom)miss='自訂行禮動作指令名稱尚未填寫';break;}
    if(miss)W.push({lv:'error',msg:'第 '+(i+1)+' 行：'+miss+'。'});});
  if(lines.some(function(l){return l.type==='skill'||l.type==='generalskill';}))W.push({lv:'info',msg:'技能巨集提示：巨集無法配合 GCD 時機，可能打斷技能循環。建議只用於低頻或非高強度戰鬥場景。'});
  return W;
}
/* ── 預覽直接編輯文字：進階玩家直接打字改。套用時，沒改的行保持原樣，改過的行轉成可編輯的行（說話類還原成欄位，其餘保留原文）── */
var pvEdit=false,pvText='',typeOpen=null;
function pvEditHTML(){return '<textarea id="ma-pvta" class="ma-pvta" rows="10" spellcheck="false" data-ty="pvta">'+esc(pvText)+'</textarea><div id="ma-pvck"></div><div class="ma-mact2"><button type="button" data-act="pvapply">套用到行</button><button type="button" data-act="pvcancel">取消</button></div>';}
function pvCheck(){var box=document.getElementById('ma-pvck');if(!box)return;var ks=knownSet(),h='',bad=0;
  pvText.split(/\r?\n/).forEach(function(raw,i){var r=checkLine(raw,ks);if(!r||r.st==='ok'||(r.st==='unk'&&raw.trim().charAt(0)!=='/'))return;bad++;h+='<div class="ma-ck '+r.st+'"><i>'+(r.st==='warn'?'⚠':'？')+'</i><code>'+esc(raw)+'</code><span>'+esc(r.msgs.join('；'))+'</span>'+(r.fix?'<button type="button" data-act="pvfix" data-i="'+i+'" data-val="'+esc(r.fix.val)+'">'+esc(r.fix.lbl)+'</button>':'')+'</div>';});
  box.innerHTML=bad?h+'<div class="ma-ckf">以上只是提醒，不會自動修改；未列出的行沒有檢出問題。</div>':'';}
function applyPv(){
  var cur=outEntries(),body=cur.filter(function(x){return x.id!==0;}),rows=pvText.split(/\r?\n/).filter(function(x){return x.trim();}),g={mlock:false,merrorOff:false};
  while(rows.length&&/^\s*(\/mlock|\/merror\s+off)\s*$/i.test(rows[0])){if(/mlock/i.test(rows[0]))g.mlock=true;else g.merrorOff=true;rows.shift();}
  gcfg.mlock=g.mlock;gcfg.merrorOff=g.merrorOff;
  if(rows.length===body.length){
    var by={};body.forEach(function(x,j){(by[x.id]=by[x.id]||[]).push(j);});
    lines=lines.map(function(l){var js=by[l.id];if(!js)return [l];var same=js.every(function(j){return rows[j]===body[j].t;});if(same)return [l];return impParse(js.map(function(j){return rows[j];}).join('\n'),true).lines;}).reduce(function(a,b){return a.concat(b);},[]);
  }else lines=impParse(rows.join('\n'),true).lines;
  pvEdit=false;selId=null;all();snap(true);toast('已套用文字修改');
}
function typePanel(l){return '<div class="ma-tpanel">'+D.CATS.map(function(c){var ks=Object.keys(TD).filter(function(k){return TD[k].cat===c.id;});return ks.length?'<div class="ma-tg"><b>'+c.icon+' '+esc(c.label)+'</b>'+ks.map(function(k){return '<button type="button" class="'+(k===l.type?'on':'')+'" data-act="settype" data-id="'+l.id+'" data-type="'+k+'">'+TD[k].icon+' '+esc(TD[k].label)+'</button>';}).join('')+'</div>':'';}).join('')+'</div>';}
function openPron(){mOpen('常用指令代名詞（點一下複製）','<div class="ma-pron">'+D.PRONS.map(function(x){return '<button type="button" data-m="pron" data-s="'+esc(x.s)+'"><code>'+esc(x.s)+'</code><span>'+esc(x.d)+'</span></button>';}).join('')+'</div>');}
function onClick(e){
  var b=e.target.closest('[data-act]');if(!b||!root.contains(b))return;var act=b.getAttribute('data-act'),id=+b.getAttribute('data-id');if(sAct(act,b,id))return;
  if(act==='sel'){if(e.target.closest('.ma-a')||e.target.closest('.ma-grip'))return;selId=selId===id?null:id;tl();}
  else if(act==='add')addLine(b.getAttribute('data-type'));
  else if(act==='cat'){cat=b.getAttribute('data-cat')||null;rail();}
  else if(act==='tag'){var t=b.getAttribute('data-tag'),i=tags.indexOf(t);if(!t)tags=[];else if(i>=0)tags.splice(i,1);else tags.push(t);rail();}
  else if(act==='tpl'){var tp=D.TEMPLATES.filter(function(x){return x.id===b.getAttribute('data-tpl');})[0];if(!tp)return;if(lines.length&&!window.confirm('套用「'+tp.label+'」模板將取代現有所有行，確認？'))return;lines=tp.lines.map(function(x){return{id:nextId++,type:x.type,params:JSON.parse(JSON.stringify(x.params||{})),note:x.note||'',repeat:x.repeat||1};});selId=null;lines.forEach(applyAllVars);all();}
  else if(act==='up')move(id,-1);else if(act==='dn')move(id,1);
  else if(act==='del'){lines=lines.filter(function(x){return x.id!==id;});if(selId===id)selId=null;tl();pv();}
  else if(act==='clear'){if(lines.length&&window.confirm('清空所有行？')){lines=[];selId=null;all();}}
  else if(act==='copy')copyText(b);else if(act==='copy2'){var sp=splitOut(outEntries());copyText(b,(b.getAttribute('data-w')==='1'?sp.m1:sp.m2).join('\n'));}
  else if(act==='ins'){var l=find(id),k=b.getAttribute('data-k'),ix=b.getAttribute('data-idx'),inp=root.querySelector(ix!=null?'input[data-ty="ccd"][data-id="'+id+'"][data-idx="'+ix+'"]':'input[data-id="'+id+'"][data-k="'+k+'"]');if(!l||!inp)return;var st=inp.selectionStart==null?inp.value.length:inp.selectionStart;inp.value=inp.value.slice(0,st)+b.getAttribute('data-s')+inp.value.slice(inp.selectionEnd==null?st:inp.selectionEnd);if(ix!=null)mkMsgs(l)[+ix].text=inp.value;else l.params[k]=inp.value;inp.focus();refresh(id);}
}
function onEdit(e){
  var t=e.target,ty=t.getAttribute&&t.getAttribute('data-ty');if(!ty||!root.contains(t))return;
  if(ty==='g'){gcfg[t.getAttribute('data-k')]=t.checked;pv();return;}
  if(ty==='emof'){emoQ=t.value;var er=document.getElementById('ma-emores');if(er)er.innerHTML=emoResults();return;}
  if(ty==='pvta'){pvText=t.value;pvCheck();return;}
  if(ty==='var'){var kd=t.getAttribute('data-var'),vv=t.value,ids=[];gv[kd]=vv;lines.forEach(function(l){if(l.indep)return;if(vv){if(applyKind(l,kd,vv))ids.push(l.id);}else if(l.own&&l.own[kd]){restoreLine(l,[kd]);ids.push(l.id);}});tl();pv();flash(ids);return;}
  var id=+t.getAttribute('data-id'),l=find(id);if(!l)return;if(sEdit(t,ty,l))return;var k=t.getAttribute('data-k');
  if(ty==='v')l.params[k]=t.value;
  else if(ty==='c')l.params[k]=t.checked;
  else if(ty==='j'){var a=(l.params[k]||[]).slice(),v=t.getAttribute('data-val'),i=a.indexOf(v);if(t.checked&&i<0)a.push(v);if(!t.checked&&i>=0)a.splice(i,1);l.params[k]=a;t.parentNode.className=t.checked?'on':'';}
  else if(ty==='r')l.repeat=Math.max(1,parseInt(t.value)||1);
  else if(ty==='n'){l.note=t.value;return;}
  refresh(id);
}
function init(){
  root=document.getElementById('macro-root');if(!root||root.getAttribute('data-ma'))return;root.setAttribute('data-ma','1');
  root.addEventListener('click',onClick);root.addEventListener('input',onEdit);fromHash();root.addEventListener('change',onEdit);
  root.addEventListener('click',function(){snap(true);},true);root.addEventListener('click',function(){snap(true);});root.addEventListener('change',function(){snap(true);});root.addEventListener('input',function(){snap(false);});
  initDrag();root.addEventListener('mouseover',hoverLink);root.addEventListener('pointerdown',armGuide);root.addEventListener('keydown',armGuide);shell();snap(true);armGuide();
}
var done=false;function go(){var sc=document.getElementById('macro');if(!sc||done)return;if(sc.classList.contains('active')){done=true;init();}}
document.addEventListener('DOMContentLoaded',function(){var sc=document.getElementById('macro');if(!sc)return;go();new MutationObserver(go).observe(sc,{attributes:true,attributeFilter:['class']});});
window.MacroApp={shareURL:shareURL,serial:serial,loadData:loadData,check:function(t){var ks=knownSet();return t.split(/\r?\n/).map(function(x){return checkLine(x,ks);});},parse:impParse,state:function(){return{lines:lines,gcfg:gcfg};},out:outEntries};
})();
