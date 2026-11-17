/* 回歸測試：node tools/macro-regress.js
   比對 js/macro-engine.js 與舊版 macro-tool.js 產生的 958 個行案例、39 份整份巨集（含警告）、30 個分段案例。*/
const fs=require('fs'),path=require('path');
const E=require(path.join(__dirname,'../js/macro-engine.js'));
const G=JSON.parse(fs.readFileSync(path.join(__dirname,'macro-golden.json'),'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
let fail=0;const note=m=>{if(fail++<15)console.log('FAIL',m)};
G.cases.forEach(c=>{let out,err=null;try{out=E.buildLines({id:1,type:c.type,params:JSON.parse(JSON.stringify(c.params)),note:'',repeat:c.repeat})}catch(e){err=e.message}
  if(err!==c.err||!same(out,c.out))note(c.type+' '+JSON.stringify(c.params)+' => '+JSON.stringify(out)+' expected '+JSON.stringify(c.out));});
G.macros.forEach(m=>{const t=E.TEMPLATES.find(x=>x.id===m.tpl);
  const ls=t.lines.map((l,i)=>Object.assign({id:i+1,note:'',repeat:1},JSON.parse(JSON.stringify(l))));
  const o=E.getAllOutput(ls,m.g),w=E.validate(ls,m.g);
  if(!same(o,m.out)||!same(w,m.warn))note('macro '+m.tpl+' '+JSON.stringify(m.g));});
G.splits.forEach(s=>{const all=[];for(let i=0;i<s.n;i++)all.push('/p 行'+(i+1));if(s.n%2==0)all.push('/micon "x" action');
  if(!same(E.doSplit(all,s.g),s.out))note('split n='+s.n+' '+JSON.stringify(s.g));});
const total=G.cases.length+G.macros.length+G.splits.length;
console.log(fail?`${fail} 項不一致`:`通過：${total} 項全部與舊版一致`);process.exit(fail?1:0);
