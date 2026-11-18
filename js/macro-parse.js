/* macro-parse.js — 把一行巨集指令反推回「行類型 + 參數」。
   做法：用引擎對每種類型產生帶標記的範本，再轉成正規式比對。無法辨識的行交給呼叫端變成「自訂行」。 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MacroParse=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
var index=null;
function esc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function combos(fields,cap){
  // select 全選項、checkbox 兩態；超過上限就改成「一次只動一欄」
  var dims=fields.filter(function(f){return f.tag==='select'||f.type==='checkbox';});
  var n=1;dims.forEach(function(f){n*=f.tag==='select'?Math.max(1,f.opts.length):2;});
  var out=[];
  if(n<=cap){
    var rec=function(i,cur){
      if(i===dims.length){out.push(cur);return;}
      var f=dims[i];
      var vals=f.tag==='select'?f.opts:[false,true];
      vals.forEach(function(v){var c=Object.assign({},cur);c[f.key]=v;rec(i+1,c);});
    };
    rec(0,{});
  }else{
    out.push({});
    dims.forEach(function(f){
      var vals=f.tag==='select'?f.opts:[true];
      vals.forEach(function(v){var c={};c[f.key]=v;out.push(c);});
    });
  }
  return out;
}
function build(E,inv){
  var list=[],seenKey={};
  Object.keys(inv).forEach(function(type){
    var d=inv[type];
    if(type==='custom'||type==='chatcountdown'||type==='abilityrotation'||type==='itemsort'||type==='hud')return;
    var fields=d.fields;
    if(type==='emote'&&E.EMOTES){fields=fields.map(function(f){return f.key==='emoteName'?{key:'emoteName',tag:'select',opts:E.EMOTES.map(function(e){return e.v;})}:f;});}
    var free=fields.filter(function(f){return f.tag!=='select'&&f.type!=='checkbox'&&f.key!=='jobs';});
    var fi=free.map(function(f,i){return i;});
    var variants=[fi,[]];fi.forEach(function(i){variants.push([i]);});
    combos(fields.filter(function(f){return f.key!=='jobs';}),2500).forEach(function(base,ci){
      variants.forEach(function(on){
        var p=Object.assign({},base),marks={};
        free.forEach(function(f,i){
          if(on.indexOf(i)<0){p[f.key]='';return;}
          if(f.type==='number'){var v=String(7001+i*11+ci%9);p[f.key]=v;marks[f.key]=v;}
          else{var t='Zq'+i+'x'+'Z';p[f.key]=t;marks[f.key]=t;}
        });
        var out;try{out=E.buildLines({id:1,type:type,params:p,note:'',repeat:1});}catch(e){return;}
        if(!out||out.length!==1)return;
        var s=out[0],caps=[],used={};
        Object.keys(marks).forEach(function(k){if(s.indexOf(marks[k])>=0)used[k]=1;});
        var order=Object.keys(used).sort(function(a,b){return s.indexOf(marks[a])-s.indexOf(marks[b]);});
        var re=esc(s);
        order.forEach(function(k){re=re.replace(esc(marks[k]),'\u0000');caps.push(k);});
        if(re.indexOf('\u0000')<0&&caps.length)return;
        var lit=re.replace(/\u0000/g,'').length;
        if(lit<=1)return; /* 只有「/」加一個變數＝通用範本（如自訂情感動作），會吃掉所有未知指令，不收 */
        var pattern='^'+re.split('\u0000').join('(.*?)')+'$';
        var key=type+'|'+pattern+'|'+caps.join(',');
        if(seenKey[key])return;seenKey[key]=1;
        var cm=/^\/[^\s<]+/.exec(s);
        list.push({type:type,re:new RegExp(pattern),caps:caps,fixed:Object.assign({},base),nfixed:Object.keys(base).length,lit:lit,free:free.length,used:caps.length,cmd:cm?cm[0].toLowerCase():''});
      });
    });
  });
  // 字面較多、可變欄位較少者優先，才不會被通用範本吃掉
  list.sort(function(a,b){return b.lit-a.lit||a.nfixed-b.nfixed||a.used-b.used;});
  return list;
}
function parseLine(E,inv,text){
  if(!index)index=build(E,inv);
  /* 論壇貼來的巨集常寫成「<t> <wait.3>」（中間有空格）；引擎輸出沒有空格，所以多試一次正規化後的寫法 */
  var cands=[text];
  var n1=text.replace(/\s+(<wait\.[^>]+>)\s*$/,'$1');if(n1!==text)cands.push(n1);
  var n2=text.replace(/\s+$/,'');if(n2!==text&&cands.indexOf(n2)<0)cands.push(n2);
  for(var c=0;c<cands.length;c++){
    for(var i=0;i<index.length;i++){
      var t=index[i],m=t.re.exec(cands[c]);
      if(!m)continue;
      var p=Object.assign({},t.fixed);
      t.caps.forEach(function(k,j){p[k]=m[j+1];});
      return{type:t.type,params:p};
    }
  }
  return null;
}
/* 指令命中：輸入 /p 時，先給「指令剛好是 /p」的，再給「/p 開頭」的（如 /pvpac）。同一類型同一指令只留設定最少的那一個。 */
function hits(E,inv,q){
  if(!index)index=build(E,inv);
  q=String(q||'').trim().toLowerCase();if(!q)return{exact:[],prefix:[]};
  if(q.charAt(0)!=='/')q='/'+q;
  var ex=[],pf=[],seenE={},seenP={},ord=index.slice().sort(function(a,b){return ne(a)-ne(b)||a.nfixed-b.nfixed;});
  function ne(t){var n=0;for(var k in t.fixed){var v=t.fixed[k];if(v!==''&&v!==false)n++;}return n;}
  function clean(f){var o={};for(var k in f){if(f[k]!==''&&f[k]!==false)o[k]=f[k];}return o;}
  ord.forEach(function(t){
    if(!t.cmd)return;
    var k=t.type+'|'+t.cmd;
    if(t.cmd===q){if(!seenE[k]){seenE[k]=1;ex.push({type:t.type,params:clean(t.fixed),cmd:t.cmd});}}
    else if(t.cmd.indexOf(q)===0){if(!seenP[k]){seenP[k]=1;pf.push({type:t.type,params:clean(t.fixed),cmd:t.cmd});}}
  });
  pf.sort(function(a,b){return a.cmd.length-b.cmd.length||(a.cmd<b.cmd?-1:1);});
  return{exact:ex,prefix:pf};
}
function reset(){index=null;}
return{parseLine:parseLine,hits:hits,reset:reset,_build:build};
});
