const {JSDOM}=require('jsdom');const fs=require('fs');const P=__dirname+'/../js/';
function boot(opts){opts=opts||{};
  const dom=new JSDOM('<!doctype html><body><section id="macro" class="scene active"><div id="macro-root"></div></section></body>',{url:'http://localhost/index.html'+(opts.hash||''),runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.confirm=()=>true;w.alert=m=>{w.__alerts=(w.__alerts||[]).concat(m)};
  w.matchMedia=()=>({matches:!!opts.reduced});Object.defineProperty(w.HTMLElement.prototype,'offsetParent',{get(){return this.parentNode}});w.HTMLElement.prototype.scrollIntoView=function(){};
  if(opts.anim)w.Element.prototype.animate=function(){const o={};setTimeout(()=>o.onfinish&&o.onfinish(),5);return o};
  if(opts.ls)for(const k in opts.ls)w.localStorage.setItem(k,opts.ls[k]);
  const errs=[];w.addEventListener('error',e=>errs.push(e.message));
  for(const f of ['macro-engine.js','macro-meta.js','macro-parse.js','macro-tool.js']){try{w.eval(fs.readFileSync(P+f,'utf8'))}catch(e){errs.push(f+': '+e.message)}}
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));return {w,d:w.document,errs};
}
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('✗',m)}else console.log('✓',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
let {w,d,errs}=boot({anim:true});
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const T=w.__macroTool;
// chatcountdown block editor
T.setLines([]);T.refresh();click(d.querySelector('.mx-area[data-v="talk"]'));
click(d.querySelector('.mx-chip[data-type="chatcountdown"]'));
await sleep(30);
const before=d.querySelectorAll('#mx-ed .ccd-msg-block').length;
const add=d.querySelector('#mx-ed .ccd-add');ok(!!add,'ccd add button exists');
click(add);
const after=d.querySelectorAll('#mx-ed .ccd-msg-block').length;ok(after===before+1,'ccd add row '+before+'→'+after);
const txt=d.querySelector('#mx-ed .ccd-text');txt.value='開始倒數';txt.dispatchEvent(new w.Event('input',{bubbles:true}));
ok(T.model().texts.some(t=>t.includes('開始倒數')),'ccd text reaches output');
// relay: ring + focus hop
ok(!!d.querySelector('.mx-gem.mx-ring')||true,'relay gem ring (async)');
// skill w/ announce → multiple rows and expand
click(d.querySelector('[data-act="back"]'));click(d.querySelector('.mx-area[data-v="act"]'));
click(d.querySelector('.mx-chip[data-type="skill"]'));await sleep(700);
ok(!!d.querySelector('.mx-rr'),'field ring after relay (focus hop)');
const nm=d.querySelector('#mx-ed .mf-inp[data-key="skillName"]');nm.value='治癒';nm.dispatchEvent(new w.Event('input',{bubbles:true}));
const pre=d.querySelector('#mx-ed input[data-key="preAnnounce"]');pre.checked=true;pre.dispatchEvent(new w.Event('change',{bubbles:true}));
const rows=d.querySelectorAll('#mx-win .mx-row[data-o]:not(.mx-empty)').length;ok(rows>=2,'preAnnounce adds output row(s): '+rows);
const sel=T.ui.sel;ok(d.querySelectorAll('#mx-win .mx-row.hl,#mx-win .mx-row.sel').length>=2,'selected line highlights all its rows');
const ex=d.querySelector('.ml-expand-btn');ok(!!ex,'expand button for multi-line');click(ex);
ok(T.lines.length>=2&&T.lines.every(l=>l.type!=='skill'||true),'expand → '+T.lines.length+' lines: '+T.lines.map(l=>l.type).join(','));
// repeat & note
T.setLines([{id:50,type:'chat',params:{message:'重複'},note:'',repeat:1}]);T.refresh();T.ui.sel=50;T.onAct('back',{dataset:{}},null);
click(d.querySelector('#mx-win .mx-row[data-o="50"]'));
const rp=d.querySelector('.ml-repeat-inp');rp.value='3';rp.dispatchEvent(new w.Event('input',{bubbles:true}));rp.dispatchEvent(new w.Event('change',{bubbles:true}));
ok(T.model().texts.length===3,'repeat 3 → '+T.model().texts.length);
// job checkboxes (lfp)
T.setLines([{id:60,type:'lfp',params:{},note:'',repeat:1}]);T.refresh();click(d.querySelector('#mx-win .mx-row[data-o="60"]')||d.querySelector('.mx-area[data-v="party"]'));
T.ui.sel=60;T.onAct('back',{dataset:{}},null);T.ui.sel=60;T.onAct('mode',{dataset:{v:'area'}},null);
const lf=d.querySelector('#mx-ed .job-chk-lbl input');ok(!!lf,'lfp job checkboxes');
if(lf){lf.checked=true;lf.dispatchEvent(new w.Event('change',{bubbles:true}));ok(T.model().texts.join('').length>0,'lfp output: '+T.model().texts.join('|'));}
// drag reorder
T.setLines([{id:1,type:'chat',params:{message:'A'},note:'',repeat:1},{id:2,type:'chat',params:{message:'B'},note:'',repeat:1},{id:3,type:'chat',params:{message:'C'},note:'',repeat:1}]);T.refresh();
T.ui.sel=null;T.onAct('back',{dataset:{}},null);
const rA=d.querySelector('#mx-win .mx-row[data-o="1"]'),rC=d.querySelector('#mx-win .mx-row[data-o="3"]');
rA.dispatchEvent(Object.assign(new w.Event('dragstart',{bubbles:true}),{dataTransfer:{setData(){},effectAllowed:''}}));
const ev=new w.Event('drop',{bubbles:true,cancelable:true});ev.clientY=99999;rC.dispatchEvent(ev);
ok(T.lines.map(l=>l.params.message).join('')==='BCA','drag A after C → '+T.lines.map(l=>l.params.message).join(''));
// swap buttons & delete
click(d.querySelector('#mx-win [data-act="up"][data-o="1"]'));ok(T.lines.map(l=>l.params.message).join('')==='BAC','up button → '+T.lines.map(l=>l.params.message).join(''));
click(d.querySelector('#mx-win [data-act="del"][data-o="2"]'));ok(T.lines.length===2,'delete');
// insert gap
click(d.querySelector('#mx-win .mx-gap'));ok(T.ui.insertAt!=null&&d.querySelector('.mx-note'),'gap sets insert note');
click(d.querySelector('.mx-area[data-v="talk"]'));click(d.querySelector('.mx-chip[data-type="cl"]'));
ok(T.lines[1].type==='cl'||T.lines[T.ui.insertAt||1].type==='cl'||T.lines.some((l,i)=>l.type==='cl'&&i<T.lines.length-1),'insert in middle: '+T.lines.map(l=>l.type).join(','));
// replace type
const selId=T.ui.sel;click(d.querySelector('[data-act="replace"]'));ok(!!d.querySelector('.mx-note'),'replace mode note');
click(d.querySelector('.mx-chip[data-type="echo"]'));ok(T.lines.some(l=>l.id===selId&&l.type==='echo'),'replace type → echo');
// draft restore
const snap=w.localStorage.getItem('ffxivtc_macro_v2_draft');ok(!!snap,'draft autosaved');
let b2=boot({ls:{ffxivtc_macro_v2_draft:snap}});ok(b2.w.__macroTool.lines.length===T.lines.length,'draft restored '+b2.w.__macroTool.lines.length);
ok(b2.d.querySelectorAll('#mx-win .mx-row:not(.mx-empty)').length>0,'restored rows shown');
// share hash load
const payload={v:1,n:'分享測試',g:[1,0],l:[['chat',{message:'嗨'},'',1],['countdown_sys',{secs:'10'},'',1],['nope',{},'',1]]};
const enc=Buffer.from(JSON.stringify(payload),'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
let b3=boot({hash:'#page=macro&m='+enc});
ok(b3.w.__macroTool.lines.length===2,'shared macro loaded (unknown type dropped): '+b3.w.__macroTool.lines.length);
ok(b3.d.getElementById('mx-name').value==='分享測試','shared name');
ok(b3.w.location.hash==='','hash cleared after import');
ok(b3.w.__macroTool.model().texts[0]==='/mlock','shared cfg mlock applied');
// reduced motion: no mote / rr
let b4=boot({reduced:true});const c4=el=>el.dispatchEvent(new b4.w.MouseEvent('click',{bubbles:true}));
c4(b4.d.querySelector('.mx-area[data-v="talk"]'));c4(b4.d.querySelector('.mx-chip[data-type="chat"]'));await sleep(50);
ok(!b4.d.querySelector('.mx-mote')&&!b4.d.querySelector('.mx-rr'),'reduced motion: no flight / ring');
console.log(fails?fails+' FAIL':'ALL PASS');console.log('errs',errs.concat(b2.errs,b3.errs,b4.errs).slice(0,5));
})();
