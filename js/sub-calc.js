/* sub-calc.js — 潛水艇「演算法」：路線搜尋、配裝反查等計算函式。
 * 依賴 sub-data.js 裡定義的資料（SUB_SECTORS/SUB_LOOT_TIER 等），必須晚於 sub-data.js 載入。
 */



/* ===== SECTOR LOOKUP MAP (O(1) ID → row) ===== */
const SECTOR_MAP=new Map(SUB_SECTORS.map(s=>[s[0],s]));

/* ===== ROUTE CALCULATOR ===== */
function subPerms(a){if(a.length<=1)return[a];const r=[];a.forEach((v,i)=>{subPerms([...a.slice(0,i),...a.slice(i+1)]).forEach(p=>r.push([v,...p]));});return r;}
function subCombos(a,n){if(n===0)return[[]];if(n>a.length)return[];const r=[];for(let i=0;i<=a.length-n;i++){subCombos(a.slice(i+1),n-1).forEach(c=>r.push([a[i],...c]));}return r;}
function subBestOrder(homeId,ids){
  const survD=ids.reduce((s,id)=>{const sec=SECTOR_MAP.get(id);return s+(sec?sec[7]:0);},0);
  const survR=ids.reduce((s,id)=>{const sec=SECTOR_MAP.get(id);return s+(sec?sec[8]:0);},0);
  let bestTD=Infinity,bestTR=0,bestOrd=ids;
  subPerms(ids).forEach(perm=>{let td=0,tr=0,prev=homeId,ok=true;for(const sid of perm){const e=(SUB_DIST[prev]||{})[sid];if(!e){ok=false;break;}td+=e[0];tr+=e[1];prev=sid;}if(ok&&td<bestTD){bestTD=td;bestTR=tr;bestOrd=[...perm];}});
  return{order:bestOrd,totalDist:survD+bestTD,totalRng:survR+bestTR};
}
function subCalcStats(rank,h,s,b,br){const rb=SUB_RANKS[rank]||[0,0,0,0,0,0];const sum=i=>[h,s,b,br].reduce((t,p)=>t+(p?p[i]:0),0);return{sur:sum(2)+rb[3],ret:sum(3)+rb[4],spd:sum(4)+rb[1],rng:sum(5)+rb[2],fav:sum(6)+rb[5]};}
function subFindRoutes(rank,stats,mustInc,mustExcl,mustIncMaps,mustExclMaps,mustLootIds,desiredMin,useTime,letterOnly,lootStrict){
  const results=[];
  [...new Set(SUB_SECTORS.map(s=>s[1]))].forEach(mapId=>{
    if(mustIncMaps.length&&!mustIncMaps.includes(mapId))return;
    if(mustExclMaps.includes(mapId))return;
    const homeId=SUB_HOMES[String(mapId)];if(homeId===undefined)return;
    const mapSecs=SUB_SECTORS.filter(s=>s[1]===mapId&&s[5]<=rank&&!mustExcl.includes(s[0]));
    const mustInMap=mustInc.filter(id=>{const s=SECTOR_MAP.get(id);return s&&s[1]===mapId;});
    if(mustInMap.some(id=>!mapSecs.some(s=>s[0]===id)))return;
    const required=mustInMap.map(id=>SECTOR_MAP.get(id));
    let optional=mapSecs.filter(s=>!mustInMap.includes(s[0]));
    optional.sort((a,b)=>b[6]-a[6]);const topOpt=optional.slice(0,25);const maxExtra=Math.max(0,5-required.length);
    for(let n=0;n<=Math.min(maxExtra,topOpt.length);n++){subCombos(topOpt,n).forEach(combo=>{
      const secs=[...required,...combo];if(!secs.length)return;
      const best=subBestOrder(homeId,secs.map(s=>s[0]));if(best.totalRng>stats.rng)return;
      /* 修正：以整條路線的戰利品聯集判斷，而非每格個別判斷 */
      const allLoot=[...new Set(best.order.flatMap(id=>SUB_LOOT[id]||[]))];
      if(mustLootIds.length){
        if(lootStrict){
          /* 嚴格模式：路線上每一個目的地，都要至少有一項使用者勾選的物品，
             確保不會有「繞去一個目的地卻拿不到任何想要物品」的浪費站點。 */
          if(!best.order.every(id=>mustLootIds.some(iid=>(SUB_LOOT[id]||[]).includes(iid))))return;
        }else if(!mustLootIds.every(iid=>allLoot.includes(iid))){
          return;
        }
      }
      const totalExp=secs.reduce((s,x)=>s+x[6],0);const totalTank=secs.reduce((s,x)=>s+(SUB_TANK[x[0]]||0),0);const timeMins=best.totalDist/stats.spd+720;
      if(useTime&&timeMins>desiredMin*1.01)return;
      const epm=Math.floor(totalExp/Math.floor(timeMins));
      const hh=Math.floor(timeMins/60),mm=Math.floor(timeMins%60),dd=Math.floor(hh/24),rh=hh%24;
      const timeStr=dd>0?`${dd}天${rh}小時${mm}分`:`${rh}小時${mm}分`;
      const secStr=best.order.map(id=>{const s=SECTOR_MAP.get(id);return `${s[2]} ${s[4]}`;}).join(' → '); // always full name; CSS sub-compact controls display
      const secLetters=best.order.map(id=>SECTOR_MAP.get(id)[2]).join(' \u2192 ');
      results.push({minRank:Math.max(...secs.map(s=>s[5])),exp:totalExp,timeStr,timeMins,epm,range:best.totalRng,tank:totalTank,secCount:secs.length,mapStr:`(${mapId}) ${MAP_NAMES[mapId]}`,secStr,secLetters,secIds:best.order,allLoot});
    });}
  });
  results.sort((a,b)=>b.epm-a.epm);return results.slice(0,200);
}

/* ===== 配裝反查（GEAR REVERSE-LOOKUP）=====
 * 架構完全比照 air-calc.js 的 airFindBuilds，差異只在潛水艇有多張圖／
 * 多個起點，要先從目的地的 mapId 找到對應的 SUB_HOMES 起點。
 *
 * th（門檻設定）格式：{sur:'none'|'normal'|'best'|<number>,
 *                       ret:'none'|'normal'|'best'|<number>,
 *                       fav:'none'|'met'|<number>}
 * ownedRanks（擁有的部件）格式：{hull:[1,15,25,...], stern:[...], bow:[...], bridge:[...]}
 * 陣列內容是「代號對應的等級」：S=1,U=15,W=25,C=35,SY=45，
 * 改良款(SM/UM/WM/CM/SYM)用等級 -1（例如 -15 代表 U 改／甲鱟改級）來跟本體區分，
 * 對應畫面上「勾選擁有哪些等級/是否有改良款」的操作方式。
 */
function subMeetsThreshold(val, normalThr, bestThr, mode) {
  if (mode === 'none' || mode == null) return true;
  if (typeof mode === 'number') return val >= mode;
  if (mode === 'normal') return val >= normalThr;
  if (mode === 'best') return val >= bestThr;
  return true;
}
const SUB_RANK_CODE = { 1: 'S', 15: 'U', 25: 'W', 35: 'C', 45: 'SY', '-1': 'SM', '-15': 'UM', '-25': 'WM', '-35': 'CM', '-45': 'SYM' };
const SUB_RANK_CODE_REV = { S: 1, U: 15, W: 25, C: 35, SY: 45, SM: -1, UM: -15, WM: -25, CM: -35, SYM: -45 };
function subFindBuilds(sectorIds, ownedRanks, th, rank) {
  const ids = Array.isArray(sectorIds) ? sectorIds : [sectorIds];
  const secs = ids.map(id => SECTOR_MAP.get(id)).filter(Boolean);
  if (!secs.length) return [];
  const mapId = secs[0][1];
  if (!secs.every(s => s[1] === mapId)) return []; // 不同航海圖不能排進同一趟
  const home = SUB_HOMES[mapId]; if (home == null) return [];
  const best = subBestOrder(home, ids);
  const maxCap = SUB_CAP[rank];
  const own = slot => PARTS[slot].filter(p => (ownedRanks[slot] || []).includes(SUB_RANK_CODE_REV[p[0]]));
  const hulls = own('hull'), sterns = own('stern'), bows = own('bow'), bridges = own('bridge');
  const tank = ids.reduce((s, id) => s + (SUB_TANK[id] || 0), 0);
  const results = [];
  for (const h of hulls) for (const s of sterns) for (const b of bows) for (const br of bridges) {
    const st = subCalcStats(rank, h, s, b, br); // 修正：先前漏傳 rank，導致沒吃到等級加成、四個部位也對錯位置
    if (best.totalRng > st.rng) continue;
    const cost = h[7] + s[7] + b[7] + br[7];
    if (maxCap != null && cost > maxCap) continue;
    if (!secs.every(sec => subMeetsThreshold(st.sur, sec[10], sec[11], th.sur))) continue;
    if (!secs.every(sec => subMeetsThreshold(st.ret, sec[12], sec[13], th.ret))) continue;
    if (!secs.every(sec => subMeetsThreshold(st.fav, sec[9], sec[9], th.fav === 'met' ? 'normal' : th.fav))) continue;
    const timeMins = best.totalDist / st.spd + 720;
    const hh = Math.floor(timeMins / 60), mm = Math.floor(timeMins % 60), dd = Math.floor(hh / 24), rh = hh % 24;
    const timeStr = dd > 0 ? `${dd}天${rh}小時${mm}分` : `${rh}小時${mm}分`;
    results.push({ hull: h, stern: s, bow: b, bridge: br, st, cost, cap: maxCap, timeMins, timeStr, tank, secOrder: best.order });
  }
  results.sort((a, b) => a.timeMins - b.timeMins);
  return results;
}

/* ===== 配裝反查：以物品為目標 =====
 * {物品ID: [{sec:航區id, tier:1/2/3}, ...]} —— 由 SUB_LOOT_TIER 反推出來。
 */
const SUB_ITEM_SECTORS = {};
Object.entries(SUB_LOOT_TIER).forEach(([secId, tiers]) => {
  Object.entries(tiers).forEach(([tier, ids]) => {
    ids.forEach(itemId => {
      const list = SUB_ITEM_SECTORS[itemId] || (SUB_ITEM_SECTORS[itemId] = []);
      const existing = list.find(x => x.sec === +secId);
      if (existing) existing.tier = Math.min(existing.tier, +tier);
      else list.push({ sec: +secId, tier: +tier });
    });
  });
});

/* sectorTierMap：{航區id: 需要的Tier(1/2/3)}，所有航區必須同一張航海圖
 * （跟整條路線模式一樣的限制），探索門檻依 Tier 各自比對每個航區自己的
 * 門檻值；收集/恩惠沿用一般的 th 設定，全程統一比對。 */
function subFindBuildsForTiers(sectorTierMap, th, ownedRanks, rank) {
  const ids = Object.keys(sectorTierMap).map(Number);
  const secs = ids.map(id => SECTOR_MAP.get(id)).filter(Boolean);
  if (!secs.length) return [];
  const mapId = secs[0][1];
  if (!secs.every(s => s[1] === mapId)) return [];
  const home = SUB_HOMES[mapId]; if (home == null) return [];
  const best = subBestOrder(home, ids);
  const maxCap = SUB_CAP[rank];
  const own = slot => PARTS[slot].filter(p => (ownedRanks[slot] || []).includes(SUB_RANK_CODE_REV[p[0]]));
  const hulls = own('hull'), sterns = own('stern'), bows = own('bow'), bridges = own('bridge');
  const tank = ids.reduce((s, id) => s + (SUB_TANK[id] || 0), 0);
  const results = [];
  for (const h of hulls) for (const s of sterns) for (const b of bows) for (const br of bridges) {
    const st = subCalcStats(rank, h, s, b, br);
    if (best.totalRng > st.rng) continue;
    const cost = h[7] + s[7] + b[7] + br[7];
    if (maxCap != null && cost > maxCap) continue;
    let ok = true;
    for (const sec of secs) {
      const tier = sectorTierMap[sec[0]];
      if (tier >= 3 && st.sur < sec[11]) { ok = false; break; }
      if (tier === 2 && st.sur < sec[10]) { ok = false; break; }
    }
    if (!ok) continue;
    if (!secs.every(sec => subMeetsThreshold(st.ret, sec[12], sec[13], th.ret))) continue;
    if (!secs.every(sec => subMeetsThreshold(st.fav, sec[9], sec[9], th.fav === 'met' ? 'normal' : th.fav))) continue;
    const timeMins = best.totalDist / st.spd + 720;
    const hh = Math.floor(timeMins / 60), mm = Math.floor(timeMins % 60), dd = Math.floor(hh / 24), rh = hh % 24;
    const timeStr = dd > 0 ? `${dd}天${rh}小時${mm}分` : `${rh}小時${mm}分`;
    results.push({ hull: h, stern: s, bow: b, bridge: br, st, cost, cap: maxCap, timeMins, timeStr, tank, secOrder: best.order });
  }
  results.sort((a, b) => a.timeMins - b.timeMins);
  return results;
}

/* ===== 配裝反查：自行輸入數值（不綁定任何航區）===== */
function subFindBuildsByStats(target, ownedRanks, rank) {
  const maxCap = SUB_CAP[rank];
  const own = slot => PARTS[slot].filter(p => (ownedRanks[slot] || []).includes(SUB_RANK_CODE_REV[p[0]]));
  const hulls = own('hull'), sterns = own('stern'), bows = own('bow'), bridges = own('bridge');
  const results = [];
  for (const h of hulls) for (const s of sterns) for (const b of bows) for (const br of bridges) {
    const st = subCalcStats(rank, h, s, b, br);
    const cost = h[7] + s[7] + b[7] + br[7];
    if (maxCap != null && cost > maxCap) continue;
    if (target.sur != null && st.sur < target.sur) continue;
    if (target.ret != null && st.ret < target.ret) continue;
    if (target.fav != null && st.fav < target.fav) continue;
    if (target.spd != null && st.spd < target.spd) continue;
    if (target.rng != null && st.rng < target.rng) continue;
    results.push({ hull: h, stern: s, bow: b, bridge: br, st, cost, cap: maxCap });
  }
  results.sort((a, b) => a.cost - b.cost);
  return results;
}
