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
/* subBestOrderFast：跟上面 subBestOrder 算的是同一件事、同一個公式（窮舉所有
 * 走法，找總距離最短的排序），結果保證一樣，純粹是效能優化版本，用在真正的
 * 搜尋熱點路徑。subBestOrder 本身完全沒有被修改，保留在上面當作最直觀、
 * 最容易驗證正確性的參考版本，之後如果要確認新版本有沒有算錯，可以直接
 * 拿兩者的結果互相比對。
 *
 * 差在哪裡：subBestOrder 是「先用 subPerms 把所有排列組合都生成、存成陣列，
 * 再一個個評估」，5 站的話單一組合就要生出 120 個暫時陣列；subBestOrderFast
 * 改成「邊生成邊評估、原地標記走過的站點」（DFS 加回溯），不用一次生出整批
 * 排列，也不用每一步都複製陣列，站數越多，省下的暫時陣列配置越多。 */
function subBestOrderFast(homeId,ids){
  const survD=ids.reduce((s,id)=>{const sec=SECTOR_MAP.get(id);return s+(sec?sec[7]:0);},0);
  const survR=ids.reduce((s,id)=>{const sec=SECTOR_MAP.get(id);return s+(sec?sec[8]:0);},0);
  const n=ids.length;
  let bestTD=Infinity,bestTR=0,bestOrd=ids;
  const used=new Array(n).fill(false);
  const path=new Array(n);
  const walk=(depth,prev,td,tr)=>{
    if(depth===n){if(td<bestTD){bestTD=td;bestTR=tr;bestOrd=path.slice();}return;}
    for(let i=0;i<n;i++){
      if(used[i])continue;
      const sid=ids[i];
      const e=(SUB_DIST[prev]||{})[sid];
      if(!e)continue;
      used[i]=true;path[depth]=sid;
      walk(depth+1,sid,td+e[0],tr+e[1]);
      used[i]=false;
    }
  };
  walk(0,homeId,0,0);
  return{order:bestOrd,totalDist:survD+bestTD,totalRng:survR+bestTR};
}
function subCalcStats(rank,h,s,b,br){const rb=SUB_RANKS[rank]||[0,0,0,0,0,0];const sum=i=>[h,s,b,br].reduce((t,p)=>t+(p?p[i]:0),0);return{sur:sum(2)+rb[3],ret:sum(3)+rb[4],spd:sum(4)+rb[1],rng:sum(5)+rb[2],fav:sum(6)+rb[5]};}
/* 判斷某個目的地實際「拿得到」的物品：lootMustMeet=false 時維持原本行為
 * （只要在戰利品表裡就算，不管探索性能夠不夠）；lootMustMeet=true 時，
 * T2/T3 物品要探索性能達到該地門檻(sec[10]/sec[11])才算數，跟畫面上顯示
 * 「達標/未達標」的判斷邏輯（tierMetAt）一致。 */
function subLootAvailableAt(id,stats,lootMustMeet){
  if(!lootMustMeet)return SUB_LOOT[id]||[];
  const tierData=SUB_LOOT_TIER[id];if(!tierData)return[];
  const sec=SECTOR_MAP.get(id);if(!sec)return[];
  const items=[...(tierData[1]||[])];
  if(stats.sur>=sec[10])items.push(...(tierData[2]||[]));
  if(stats.sur>=sec[11])items.push(...(tierData[3]||[]));
  return items;
}
function subFindRoutes(rank,stats,mustInc,mustExcl,mustIncMaps,mustExclMaps,mustLootIds,desiredMin,useTime,letterOnly,lootStrict,lootMustMeet){
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
      /* 提早剪枝：不管走哪種順序，這批目的地至少要花多少航行距離，用「起家
         到批次裡最遠目的地的直線距離」當下限（含每站自身的探索距離）；連這個
         下限都超過玩家的航行距離，這個組合注定不合格，不用浪費資源去跑全
         排列找最短走法。這是航行距離的下限估計，不會誤判「其實合格」的組合
         為不合格，只會提早跳過本來就會被淘汰的組合。 */
      const survRLower=secs.reduce((s,x)=>s+(x[8]||0),0);
      const lowerBoundR=survRLower+Math.max(0,...secs.map(x=>{const e=(SUB_DIST[homeId]||{})[x[0]];return e?e[1]:0;}));
      if(lowerBoundR>stats.rng)return;
      const best=subBestOrderFast(homeId,secs.map(s=>s[0]));if(best.totalRng>stats.rng)return;
      /* 修正：以整條路線的戰利品聯集判斷，而非每格個別判斷 */
      const allLoot=[...new Set(best.order.flatMap(id=>subLootAvailableAt(id,stats,lootMustMeet)))];
      if(mustLootIds.length){
        if(lootStrict){
          /* 嚴格模式：路線上每一個目的地，都要至少有一項使用者勾選的物品，
             確保不會有「繞去一個目的地卻拿不到任何想要物品」的浪費站點。 */
          if(!best.order.every(id=>mustLootIds.some(iid=>subLootAvailableAt(id,stats,lootMustMeet).includes(iid))))return;
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

/* ===== 「擁有部件」直接搜路線（方案 B：列一次候選路線 + 事後查表）=====
 * 使用者不用先手動選一組固定配裝，只要勾選「擁有哪些部件」，直接在所有
 * 擁有部件的組合裡，搜出能跑出的最佳路線，並在每條路線附上建議配裝。
 *
 * 舊做法是「每一組配裝都各自完整呼叫一次 subFindRoutes」，配裝一多就會
 * 被乘出去，數量大時實務上跑不完。這裡改成兩階段：
 * 1) subEnumerateCandidates()：只依 mustInc/mustExcl/mustIncMaps/mustExclMaps
 *    （這些跟配裝完全無關）把「所有可能路線」列一次——這件事本身跟
 *    subFindRoutes 單次呼叫的計算量差不多（因為 subFindRoutes 內部本來就是
 *    先窮舉出所有目的地組合，才拿 rng 去判斷要不要收進結果，窮舉的量本來
 *    就跟 rng 沒有關係），只是先不套用任何跟配裝有關的篩選/距離門檻。
 * 2) 對每條候選路線，把擁有的配裝依巡航速度由快到慢排序去比對，第一個
 *    「航行距離夠、獲得物品/門檻條件都符合」的就是這條路線能達到的最高
 *    效率（因為總經驗值固定時，速度越快耗時越短、EXP/分一定越高，不需要
 *    整批比完再挑最大值）。
 * 這樣不管擁有幾種部件組合，只需要「列舉一次」＋「每條路線一次很快的
 * 比對」，跟舊做法比起來，結果應該完全一致（單一配裝時可用 subFindRoutes
 * 交叉驗證），但不會再隨配裝數量被乘出去。
 *
 * 注意：subFindRoutes／subFindBuilds 等其他既有函式完全沒有被更動，
 * 「單一配裝」搜尋跟「配裝反查」的計算路徑、結果都不受影響。
 */
function subEligibleMapIds(mustIncMaps, mustExclMaps) {
  return [...new Set(SUB_SECTORS.map(s => s[1]))].filter(mapId =>
    (!mustIncMaps.length || mustIncMaps.includes(mapId)) && !mustExclMaps.includes(mapId)
  );
}
function subEnumerateCandidates(rank, mustInc, mustExcl, mustIncMaps, mustExclMaps, onlyMapIds, lootFilterIds) {
  const candidates = [];
  [...new Set(SUB_SECTORS.map(s => s[1]))].forEach(mapId => {
    if (onlyMapIds ? !onlyMapIds.includes(mapId) : false) return;
    if (mustIncMaps.length && !mustIncMaps.includes(mapId)) return;
    if (mustExclMaps.includes(mapId)) return;
    const homeId = SUB_HOMES[String(mapId)]; if (homeId === undefined) return;
    const mapSecs = SUB_SECTORS.filter(s => s[1] === mapId && s[5] <= rank && !mustExcl.includes(s[0]));
    const mustInMap = mustInc.filter(id => { const s = SECTOR_MAP.get(id); return s && s[1] === mapId; });
    if (mustInMap.some(id => !mapSecs.some(s => s[0] === id))) return;
    const required = mustInMap.map(id => SECTOR_MAP.get(id));
    let optional = mapSecs.filter(s => !mustInMap.includes(s[0]));
    let topOpt;
    if (lootFilterIds && lootFilterIds.length) {
      /* 物品優先模式：候選地點池＝「有目標物品」的地點，不是經驗值前 25 名。
       * 探索性能門檻夠不夠是之後比對配裝時的事，這裡先不篩，只看戰利品表
       * 有沒有這個物品——這樣才不會漏掉經驗值排名較低、但正是目標所在的地點。
       * 目標物品分布通常很集中，這批候選地點池反而比經驗值前 25 名還小，
       * 排列組合的量不會變大，還設了一個安全上限避免物品分布過廣時失控。 */
      topOpt = optional.filter(s => (SUB_LOOT[s[0]] || []).some(iid => lootFilterIds.includes(iid)));
      topOpt.sort((a, b) => b[6] - a[6]);
      if (topOpt.length > 30) topOpt = topOpt.slice(0, 30);
    } else {
      optional.sort((a, b) => b[6] - a[6]); topOpt = optional.slice(0, 25);
    }
    const maxExtra = Math.max(0, 5 - required.length);
    for (let n = 0; n <= Math.min(maxExtra, topOpt.length); n++) { subCombos(topOpt, n).forEach(combo => {
      const secs = [...required, ...combo]; if (!secs.length) return;
      const best = subBestOrderFast(homeId, secs.map(s => s[0]));
      const totalExp = secs.reduce((s, x) => s + x[6], 0);
      const totalTank = secs.reduce((s, x) => s + (SUB_TANK[x[0]] || 0), 0);
      const secStr = best.order.map(id => { const s = SECTOR_MAP.get(id); return `${s[2]} ${s[4]}`; }).join(' \u2192 ');
      const secLetters = best.order.map(id => SECTOR_MAP.get(id)[2]).join(' \u2192 ');
      candidates.push({
        minRank: Math.max(...secs.map(s => s[5])), totalExp, totalTank, secCount: secs.length,
        mapStr: `(${mapId}) ${MAP_NAMES[mapId]}`, secStr, secLetters, secIds: best.order,
        totalRng: best.totalRng, totalDist: best.totalDist
      });
    }); }
  });
  return candidates;
}
/* 判斷 stats 是否讓整條路線「每一站」都達到指定等級：
 * 'normal'＝探索達 T2、收集達標、恩惠達標(雙倍機會)；
 * 'best'＝探索達 T3(最佳)、收集最佳，恩惠沒有更高一級，用同一個門檻。 */
function subRouteMeetsTier(secIds, stats, level) {
  return secIds.every(id => {
    const sec = SECTOR_MAP.get(id);
    if (!sec) return false;
    const survOk = level === 'best' ? stats.sur >= sec[11] : stats.sur >= sec[10];
    const retOk = level === 'best' ? stats.ret >= sec[13] : stats.ret >= sec[12];
    return survOk && retOk && stats.fav >= sec[9];
  });
}
/* 部位內先剃除「6 維全都被支配」的部件（恩惠/探索/收集/巡航速度/航行距離
 * 都不比另一個部件好、承載力成本也不比它省），單純減少後面要比對的組合數，
 * 不影響正確性（換成支配它的那個部件，只會更好或一樣好）。 */
function subPruneSlotPartsFull(parts) {
  return parts.filter((p, i) => !parts.some((q, j) => j !== i &&
    q[2] >= p[2] && q[3] >= p[3] && q[4] >= p[4] && q[5] >= p[5] && q[6] >= p[6] && q[7] <= p[7] &&
    (q[2] > p[2] || q[3] > p[3] || q[4] > p[4] || q[5] > p[5] || q[6] > p[6] || q[7] < p[7])
  ));
}
function subOwnedCombos(ownedRanks, rank) {
  const maxCap = SUB_CAP[rank];
  const own = slot => subPruneSlotPartsFull(PARTS[slot].filter(p => (ownedRanks[slot] || []).includes(SUB_RANK_CODE_REV[p[0]])));
  const hulls = own('hull'), sterns = own('stern'), bows = own('bow'), bridges = own('bridge');
  const combos = [];
  for (const h of hulls) for (const s of sterns) for (const b of bows) for (const br of bridges) {
    const cost = h[7] + s[7] + b[7] + br[7];
    if (maxCap != null && cost > maxCap) continue;
    combos.push({ hull: h, stern: s, bow: b, bridge: br, st: subCalcStats(rank, h, s, b, br), cost, cap: maxCap });
  }
  return combos;
}
/* Pareto 前緣：依 rng 由大到小排序，只留下 spd 比目前看過的組合都高的那些。
 * 前緣本身具有「rng 越靠後面的項目越小、spd 越靠後面越大」的單調性，
 * 所以「rng 至少要多少」這種查詢可以直接二分搜尋，不用整批線性比對。
 * 注意：這個前緣只看 rng/spd，忽略探索/收集/恩惠——只有在完全不需要
 * 「獲得物品門檻」篩選時才能安全使用（見下方 subFindRoutesForOwnedParts）。 */
function subParetoFrontier(combos) {
  const sorted = [...combos].sort((a, b) => (b.st.rng - a.st.rng) || (b.st.spd - a.st.spd));
  const frontier = []; let maxSpd = -Infinity;
  for (const c of sorted) { if (c.st.spd > maxSpd) { frontier.push(c); maxSpd = c.st.spd; } }
  return frontier;
}
/* 在 Pareto 前緣裡二分搜尋「rng >= minRng 之中，spd 最高的那一組」
 * （前緣依 rng 遞減排列，找 rng 仍然 >= minRng 的最後一個位置即可）。 */
function subBestComboForRng(frontier, minRng) {
  let lo = 0, hi = frontier.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frontier[mid].st.rng >= minRng) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans === -1 ? null : frontier[ans];
}
function subEvaluateOwnedCandidates(rank, candidates, ownedRanks, mustLootIds, desiredMin, useTime, lootStrict, lootTier, lootMustMeet, noCap) {
  const combos = subOwnedCombos(ownedRanks, rank);
  if (!combos.length) return { routes: [], noParts: true };
  const results = [];
  /* 沒有「必須獲得物品」也沒有「獲得物品門檻」時，能不能達成只看 rng，
   * 效率只看 spd，可以直接用 Pareto 前緣二分搜尋，每條候選路線 O(log n)，
   * 不用整批線性比對——這是最常見的情境，也是最需要快的情境。 */
  const needPerComboCheck = mustLootIds.length > 0 || (lootTier && lootTier !== 'none');
  if (!needPerComboCheck) {
    const frontier = subParetoFrontier(combos);
    candidates.forEach(cand => {
      const combo = subBestComboForRng(frontier, cand.totalRng);
      if (!combo) return;
      const timeMins = cand.totalDist / combo.st.spd + 720;
      if (useTime && timeMins > desiredMin * 1.01) return;
      const epm = Math.floor(cand.totalExp / Math.floor(timeMins));
      const hh = Math.floor(timeMins / 60), mm = Math.floor(timeMins % 60), dd = Math.floor(hh / 24), rh = hh % 24;
      const timeStr = dd > 0 ? `${dd}\u5929${rh}\u5c0f\u6642${mm}\u5206` : `${rh}\u5c0f\u6642${mm}\u5206`;
      const allLoot = [...new Set(cand.secIds.flatMap(id => subLootAvailableAt(id, combo.st, lootMustMeet)))];
      results.push({
        minRank: cand.minRank, exp: cand.totalExp, timeStr, timeMins, epm,
        range: cand.totalRng, tank: cand.totalTank, secCount: cand.secCount,
        mapStr: cand.mapStr, secStr: cand.secStr, secLetters: cand.secLetters, secIds: cand.secIds, allLoot,
        build: { hull: combo.hull, stern: combo.stern, bow: combo.bow, bridge: combo.bridge, st: combo.st, cost: combo.cost, cap: combo.cap }
      });
    });
    results.sort((a, b) => b.epm - a.epm);
    return { routes: noCap ? results : results.slice(0, 200), noParts: false };
  }
  /* 有「必須獲得物品」或「獲得物品門檻」時，探索/收集/恩惠也會影響合不合格，
   * 不能只看 rng/spd 的前緣（可能漏掉前緣以外、但探索/收集/恩惠更好的組合），
   * 改成依巡航速度由快到慢排序、逐一線性比對，第一個「可行且符合條件」的
   * 就是這條路線能拿到的最高效率。
   * 這條路徑沒辦法用前緣二分搜尋加速（因為要比對的維度變多了），如果擁有的
   * 部件多到組合數量很大（例如把每個部位全部部件都勾起來），逐一線性比對
   * 仍然可能要花很久。這裡設一個組合數上限，超過時依巡航速度取前 N 組，
   * 並回報「有沒有被裁切」讓畫面能提示使用者（跟「不限」模式不同，這裡沒有
   * 更好的加速方式，只能取捨速度與完整性）。 */
  const OWNED_FILTERED_CAP = 400;
  let combosForFiltered = combos, capped = false;
  if (combos.length > OWNED_FILTERED_CAP) {
    combosForFiltered = [...combos].sort((a, b) => b.st.spd - a.st.spd).slice(0, OWNED_FILTERED_CAP);
    capped = true;
  }
  const combosBySpd = [...combosForFiltered].sort((a, b) => b.st.spd - a.st.spd);
  candidates.forEach(cand => {
    for (const combo of combosBySpd) {
      if (cand.totalRng > combo.st.rng) continue;
      if (mustLootIds.length) {
        if (lootStrict) {
          if (!cand.secIds.every(id => mustLootIds.some(iid => subLootAvailableAt(id, combo.st, lootMustMeet).includes(iid)))) continue;
        } else {
          const allLootSet = new Set(cand.secIds.flatMap(id => subLootAvailableAt(id, combo.st, lootMustMeet)));
          if (!mustLootIds.every(iid => allLootSet.has(iid))) continue;
        }
      }
      const timeMins = cand.totalDist / combo.st.spd + 720;
      if (useTime && timeMins > desiredMin * 1.01) continue;
      if (lootTier && lootTier !== 'none' && !subRouteMeetsTier(cand.secIds, combo.st, lootTier)) continue;
      const epm = Math.floor(cand.totalExp / Math.floor(timeMins));
      const hh = Math.floor(timeMins / 60), mm = Math.floor(timeMins % 60), dd = Math.floor(hh / 24), rh = hh % 24;
      const timeStr = dd > 0 ? `${dd}\u5929${rh}\u5c0f\u6642${mm}\u5206` : `${rh}\u5c0f\u6642${mm}\u5206`;
      const allLoot = [...new Set(cand.secIds.flatMap(id => subLootAvailableAt(id, combo.st, lootMustMeet)))];
      results.push({
        minRank: cand.minRank, exp: cand.totalExp, timeStr, timeMins, epm,
        range: cand.totalRng, tank: cand.totalTank, secCount: cand.secCount,
        mapStr: cand.mapStr, secStr: cand.secStr, secLetters: cand.secLetters, secIds: cand.secIds, allLoot,
        build: { hull: combo.hull, stern: combo.stern, bow: combo.bow, bridge: combo.bridge, st: combo.st, cost: combo.cost, cap: combo.cap }
      });
      break; // 已經是這條路線裡效率最高的配裝，後面（較慢的）組合不用再看
    }
  });
  results.sort((a, b) => b.epm - a.epm);
  return { routes: noCap ? results : results.slice(0, 200), noParts: false, capped, totalCount: combos.length, searchedCount: combosForFiltered.length };
}
function subFindRoutesForOwnedParts(rank, ownedRanks, mustInc, mustExcl, mustIncMaps, mustExclMaps, mustLootIds, desiredMin, useTime, letterOnly, lootStrict, lootTier, lootMustMeet) {
  const candidates = subEnumerateCandidates(rank, mustInc, mustExcl, mustIncMaps, mustExclMaps);
  return subEvaluateOwnedCandidates(rank, candidates, ownedRanks, mustLootIds, desiredMin, useTime, lootStrict, lootTier, lootMustMeet);
}

/* ===== 排序依據＝物品覆蓋／件數效率時使用（見 sub-panel.js 的「排序依據」下拉選單）=====
 * 候選地點池改用「有目標物品」的地點（subEnumerateCandidates 的 lootFilterIds 參數），
 * 不是經驗值前 25 名，這樣才不會漏掉真正含有目標物品、但經驗值排名較低的地點；
 * 候選地點池本身通常比經驗值前 25 名還小，也不用再裁到前 200 筆。 */
function subEvaluateSingleStats(candidates, stats, mustLootIds, desiredMin, useTime, lootStrict, lootMustMeet) {
  const results = [];
  candidates.forEach(cand => {
    if (cand.totalRng > stats.rng) return;
    if (mustLootIds.length) {
      if (lootStrict) {
        if (!cand.secIds.every(id => mustLootIds.some(iid => subLootAvailableAt(id, stats, lootMustMeet).includes(iid)))) return;
      } else {
        const allLootSet = new Set(cand.secIds.flatMap(id => subLootAvailableAt(id, stats, lootMustMeet)));
        if (!mustLootIds.every(iid => allLootSet.has(iid))) return;
      }
    }
    const timeMins = cand.totalDist / stats.spd + 720;
    if (useTime && timeMins > desiredMin * 1.01) return;
    const epm = Math.floor(cand.totalExp / Math.floor(timeMins));
    const hh = Math.floor(timeMins / 60), mm = Math.floor(timeMins % 60), dd = Math.floor(hh / 24), rh = hh % 24;
    const timeStr = dd > 0 ? `${dd}\u5929${rh}\u5c0f\u6642${mm}\u5206` : `${rh}\u5c0f\u6642${mm}\u5206`;
    const allLoot = [...new Set(cand.secIds.flatMap(id => subLootAvailableAt(id, stats, lootMustMeet)))];
    results.push({
      minRank: cand.minRank, exp: cand.totalExp, timeStr, timeMins, epm,
      range: cand.totalRng, tank: cand.totalTank, secCount: cand.secCount,
      mapStr: cand.mapStr, secStr: cand.secStr, secLetters: cand.secLetters, secIds: cand.secIds, allLoot
    });
  });
  results.sort((a, b) => b.epm - a.epm);
  return results;
}
function subFindRoutesByLoot(rank, stats, mustInc, mustExcl, mustIncMaps, mustExclMaps, mustLootIds, desiredMin, useTime, lootStrict, lootMustMeet) {
  const candidates = subEnumerateCandidates(rank, mustInc, mustExcl, mustIncMaps, mustExclMaps, null, mustLootIds);
  return subEvaluateSingleStats(candidates, stats, mustLootIds, desiredMin, useTime, lootStrict, lootMustMeet);
}
function subFindRoutesForOwnedPartsByLoot(rank, ownedRanks, mustInc, mustExcl, mustIncMaps, mustExclMaps, mustLootIds, desiredMin, useTime, lootStrict, lootTier, lootMustMeet) {
  const candidates = subEnumerateCandidates(rank, mustInc, mustExcl, mustIncMaps, mustExclMaps, null, mustLootIds);
  return subEvaluateOwnedCandidates(rank, candidates, ownedRanks, mustLootIds, desiredMin, useTime, lootStrict, lootTier, lootMustMeet, true);
}
