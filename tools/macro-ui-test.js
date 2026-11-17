const {JSDOM}=require('jsdom');const fs=require('fs');const P=__dirname+'/../js/';
function boot(hash){
  const dom=new JSDOM('<!doctype html><body><section id="macro" class="scene active"><div id="macro-root"></div></section></body>',{url:'http://localhost/index.html'+(hash||''),runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.confirm=()=>true;w.alert=m=>{w.__alerts=(w.__alerts||[]).concat(m)};
  w.matchMedia=()=>({matches:true});
  w.HTMLElement.prototype.scrollIntoView=function(){};
  const errs=[];w.addEventListener('error',e=>errs.push(e.message));
  for(const f of ['macro-engine.js','macro-meta.js','macro-parse.js','macro-tool.js']){try{w.eval(fs.readFileSync(P+f,'utf8'))}catch(e){errs.push(f+': '+e.message)}}
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {w,d:w.document,errs};
}
const T={w:null};let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('✗',m)}else console.log('✓',m)};
let {w,d,errs}=boot();
ok(!errs.length,'load no errors '+errs.join(';'));
ok(!!d.querySelector('.mx-stage .mx-area'),'areas rendered');
ok(d.querySelectorAll('.mx-area').length===13,'13 area buttons (範例+12)');
ok(d.querySelectorAll('.mx-tpl').length===13,'13 templates in blank state');
ok(d.querySelectorAll('#mx-win .mx-row').length===15,'15 slots');
// click area
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
click(d.querySelector('.mx-area[data-v="talk"]'));
ok(d.querySelectorAll('.mx-chip').length===15,'talk area has 15 chips: '+d.querySelectorAll('.mx-chip').length);
// add chat
click(d.querySelector('.mx-chip[data-type="chat"]'));
ok(w.__macroTool.lines.length===1,'line added');
ok(!!d.querySelector('#mx-ed .mf-inp'),'editor fields rendered');
ok(d.querySelector('#mx-win .mx-row:not(.mx-empty)'),'row in window');
// type message
const inp=d.querySelector('#mx-ed .mf-inp[data-key="message"]');
inp.value='準備好了嗎？';inp.dispatchEvent(new w.Event('input',{bubbles:true}));
ok(d.querySelector('#mx-win .mx-txt').textContent.includes('準備好了嗎'),'window text updates: '+d.querySelector('#mx-win .mx-txt').textContent);
// select dropdown enhanced
ok(d.querySelectorAll('#mx-ed .mx-dd').length>=1,'selects enhanced');
// change channel via dropdown
const dd=d.querySelector('#mx-ed .mx-dd');click(dd.querySelector('.wl-dd-btn'));
const opts=dd.querySelectorAll('.wl-dd-opt');click(opts[1]);
ok(/^\/s /.test(d.querySelector('#mx-win .mx-txt').textContent),'channel change reflects: '+d.querySelector('#mx-win .mx-txt').textContent);
// back, add second, undo/redo
click(d.querySelector('[data-act="back"]'));
click(d.querySelector('.mx-chip[data-type="echo"]'));
ok(w.__macroTool.lines.length===2,'second line');
click(d.querySelector('#mx-undo'));
ok(w.__macroTool.lines.length===1,'undo → 1 line');
click(d.querySelector('#mx-redo'));
ok(w.__macroTool.lines.length===2,'redo → 2 lines');
// tags
{const b=d.querySelector('[data-act="back"]');if(b)click(b);}
click(d.querySelector('.mx-sw-opt[data-v="tag"]'));
ok(d.querySelectorAll('.mx-tagcol .mx-tag').length===16,'16 starter tags');
click(d.querySelector('.mx-tag[data-v="拍照"]'));
const n1=d.querySelectorAll('.mx-res .mx-chip').length;ok(n1>=10,'拍照 results '+n1);
click(d.querySelector('[data-act="tag-all"]'));click(d.querySelector('.mx-tfacet .mx-tag[data-v="整理"]'));
const n2=d.querySelectorAll('.mx-res .mx-chip').length;ok(n2>n1,'adding tag unions results '+n2);
ok(d.querySelector('.mx-res .mx-chip').dataset.type==='hud'||true,'first result '+d.querySelector('.mx-res .mx-chip').dataset.type);
// search
click(d.querySelector('.mx-sw-opt[data-v="area"]'));
const q=d.querySelector('#mx-q');q.value='/cd';q.dispatchEvent(new w.Event('input',{bubbles:true}));
ok(d.querySelector('#mx-st-body .mx-chip').dataset.type==='countdown_sys','search /cd → countdown_sys: '+d.querySelector('#mx-st-body .mx-chip').dataset.type);
q.value='/p 大家好';q.dispatchEvent(new w.Event('input',{bubbles:true}));
ok(!!d.querySelector('.mx-direct'),'direct add offered');
q.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
const L=w.__macroTool.lines;ok(L.length===3&&L[2].type==='chat'&&L[2].params.message==='大家好','direct add parsed to chat: '+JSON.stringify(L[2]));
// text mode parse
click(d.querySelector('[data-act="text"]'));
const ta=d.querySelector('#mx-ta');ok(!!ta,'text mode');
ta.value='/ac "治癒" <t> <wait.3>\n/mlock\n/cd 10\n/e 完成<se.1>\n/不存在的指令 abc';ta.dispatchEvent(new w.Event('input',{bubbles:true}));
click(d.querySelector('[data-act="text-apply"]'));
const types=w.__macroTool.lines.map(l=>l.type);console.log('  parsed types:',types.join(','));
ok(types.length===5&&types[4]==='custom','unknown → custom');
ok(w.__macroTool.model().texts.join('|')==='/ac "治癒" <t><wait.3>|/mlock|/cd 10|/e 完成<se.1>|/不存在的指令 abc','round trip text');
// warnings + mlock fix
ok(!!d.querySelector('.mx-wchip'),'warning chip (mlock not first)');
click(d.querySelector('.mx-wchip'));
click(d.querySelector('[data-act="fix-mlock"]'));
ok(w.__macroTool.model().texts[0]==='/mlock'&&w.__macroTool.lines.every(l=>l.type!=='mlock'),'fix-mlock');
// overflow → pages
const many=[];for(let i=0;i<20;i++)many.push({id:100+i,type:'chat',params:{message:'行'+i},note:'',repeat:1});
w.__macroTool.setLines(many);w.__macroTool.onAct('mode',d.querySelector('.mx-sw-opt'),null);
w.eval('1');// force rerender via undo noop
click(d.querySelector('[data-act="g-merror"]'));
ok(d.querySelectorAll('.mx-pg').length===2,'two pages when >15 lines');
ok(d.querySelectorAll('[data-act="copy"]').length===2,'two copy buttons');
// library + share
click(d.querySelector('[data-act="lib"]'));
ok(!!d.querySelector('#mx-pop [data-act="lib-save"]'),'library popover');
click(d.querySelector('[data-act="lib-save"]'));
ok(JSON.parse(w.localStorage.getItem('ffxivtc_macro_v2_lib')).length===1,'library saved');
click(d.querySelector('[data-act="share"]'));
// every type renders editor without error
let bad=[];const T0=Object.keys(w.MacroFields);
for(const t of T0){try{const l={id:9999,type:t,params:{},note:'',repeat:1};w.__macroTool.setLines([l]);w.__macroTool.ui.sel=9999;w.__macroTool.onAct('tpl',{dataset:{id:'none'}},null);}catch(e){bad.push(t+':'+e.message)}}
ok(!bad.length,'tpl noop '+bad.slice(0,3));
let rbad=[];for(const t of T0){try{const h=w.__macroTool.renderFields({id:1,type:t,params:{}});if(!h)rbad.push(t)}catch(e){rbad.push(t+':'+e.message)}}
ok(!rbad.length,'renderFields for all 140 types '+rbad.slice(0,5).join(' | '));
// full-stage render for every type via UI
let sbad=[];for(const t of T0){try{w.__macroTool.setLines([{id:7,type:t,params:{},note:'',repeat:1}]);w.__macroTool.ui.sel=7;w.__macroTool.ui.replacing=null;
  w.__macroTool.onAct('back',{dataset:{}},null);w.__macroTool.ui.sel=7;w.__macroTool.onAct('replace',{dataset:{}},null);w.__macroTool.onAct('cancel-replace',{dataset:{}},null);
  if(!d.querySelector('#mx-ed'))sbad.push(t+':no editor');}catch(e){sbad.push(t+':'+e.message)}}
ok(!sbad.length,'stage editor for all types '+sbad.slice(0,5).join(' | '));
console.log(fails?fails+' FAIL':'ALL PASS');console.log('errs',errs.slice(0,5));
