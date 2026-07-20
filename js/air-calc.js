/* air-calc.js — 飛空艇「演算法」：路線搜尋、配裝反查等計算函式。
 * 依賴 air-data.js 裡定義的資料，必須晚於 air-data.js 載入。架構對照 sub-calc.js。
 */


/* 部件代號（比照潛水艇的命名方式，取英文原名字首字母）：
   Bronco／Invincible／Enterprise／Invincible II／Odyssey／Tatanora／Viltgance */
const AIR_RANK_CODE={1:'B',5:'I',15:'E',25:'I(II)',35:'O',45:'T',50:'V'};

const AIR_SECTOR_MAP=new Map(AIR_SECTORS.map(s=>[s[0],s]));

/* ===== ROUTE CALCULATOR（架構比照 subFindRoutes，但單一地圖不需分圖迴圈）===== */
function airPerms(a){if(a.length<=1)return[a];const r=[];a.forEach((v,i)=>{airPerms([...a.slice(0,i),...a.slice(i+1)]).forEach(p=>r.push([v,...p]));});return r;}
function airCombos(a,n){if(n===0)return[[]];if(n>a.length)return[];const r=[];for(let i=0;i<=a.length-n;i++){airCombos(a.slice(i+1),n-1).forEach(c=>r.push([a[i],...c]));}return r;}
function airBestOrder(ids){
  const survD=ids.reduce((s,id)=>{const sec=AIR_SECTOR_MAP.get(id);return s+(sec?sec[6]:0);},0);
  const survR=ids.reduce((s,id)=>{const sec=AIR_SECTOR_MAP.get(id);return s+(sec?sec[7]:0);},0);
  let bestTD=Infinity,bestTR=0,bestOrd=ids;
  airPerms(ids).forEach(perm=>{let td=0,tr=0,prev=AIR_HOME,ok=true;for(const sid of perm){const e=(AIR_DIST[prev]||{})[sid];if(!e){ok=false;break;}td+=e[0];tr+=e[1];prev=sid;}if(ok&&td<bestTD){bestTD=td;bestTR=tr;bestOrd=[...perm];}});
  return{order:bestOrd,totalDist:survD+bestTD,totalRng:survR+bestTR};
}
function airCalcStats(h,r,f,a){const sum=i=>[h,r,f,a].reduce((t,p)=>t+(p?p[i]:0),0);return{fav:sum(3),sur:sum(4),ret:sum(5),spd:sum(6),rng:sum(7)};}
function airFindRoutes(rank,stats,mustInc,mustExcl,mustLootIds,desiredMin,useTime,lootStrict){
  const results=[];
  const avail=AIR_SECTORS.filter(s=>s[4]<=rank&&!mustExcl.includes(s[0]));
  const required=mustInc.map(id=>AIR_SECTOR_MAP.get(id)).filter(Boolean);
  if(mustInc.some(id=>!avail.some(s=>s[0]===id)))return[];
  let optional=avail.filter(s=>!mustInc.includes(s[0]));
  optional.sort((a,b)=>b[5]-a[5]);const topOpt=optional.slice(0,25);const maxExtra=Math.max(0,5-required.length);
  for(let n=0;n<=Math.min(maxExtra,topOpt.length);n++){airCombos(topOpt,n).forEach(combo=>{
    const secs=[...required,...combo];if(!secs.length)return;
    const best=airBestOrder(secs.map(s=>s[0]));if(best.totalRng>stats.rng)return;
    const allLoot=[...new Set(best.order.flatMap(id=>[...(AIR_LOOT_TIER[id]?.[1]||[]),...(AIR_LOOT_TIER[id]?.[2]||[]),...(AIR_LOOT_TIER[id]?.[3]||[])]))];
    if(mustLootIds.length){
      if(lootStrict){
        if(!best.order.every(id=>{const lt=AIR_LOOT_TIER[id]||{};const ids=[...(lt[1]||[]),...(lt[2]||[]),...(lt[3]||[])];return mustLootIds.some(iid=>ids.includes(iid));}))return;
      }else if(!mustLootIds.every(iid=>allLoot.includes(iid))){return;}
    }
    const totalExp=secs.reduce((s,x)=>s+x[5],0);
    const totalTank=secs.reduce((s,x)=>s+x[13],0);
    const timeMins=best.totalDist/stats.spd+720;
    if(useTime&&timeMins>desiredMin*1.01)return;
    const epm=Math.floor(totalExp/Math.floor(timeMins));
    const hh=Math.floor(timeMins/60),mm=Math.floor(timeMins%60),dd=Math.floor(hh/24),rh=hh%24;
    const timeStr=dd>0?`${dd}天${rh}小時${mm}分`:`${rh}小時${mm}分`;
    const secStr=best.order.map(id=>{const s=AIR_SECTOR_MAP.get(id);return `${s[1]} ${s[3]}`;}).join(' → ');
    const secLetters=best.order.map(id=>AIR_SECTOR_MAP.get(id)[1]).join(' \u2192 ');
    results.push({minRank:Math.max(...secs.map(s=>s[4])),exp:totalExp,timeStr,timeMins,epm,range:best.totalRng,tank:totalTank,secCount:secs.length,secStr,secLetters,secIds:best.order,allLoot});
  });}
  results.sort((a,b)=>b.epm-a.epm);return results.slice(0,200);
}

/* ===== 配裝反查（GEAR REVERSE-LOOKUP）=====
 * 給定「單一目的地」＋想要的品質門檻，從玩家「擁有的部件」裡窮舉四個部位
 * 的組合，找出達標的配裝，並附上時間／承載力等資訊，依耗時由短到長排序。
 *
 * th（門檻設定）格式：{sur:'none'|'normal'|'best'|<number>,
 *                       ret:'none'|'normal'|'best'|<number>,
 *                       fav:'none'|'met'|<number>}
 * 'normal'/'best' 走該航區自己的門檻值（跟遊戲內顯示一致）；
 * 數字則是進階模式的精確門檻，兩者共用同一個判斷函式。
 *
 * ownedRanks（擁有的部件）格式：{hull:[1,5,15,...], rigging:[...], forecastle:[...], aftcastle:[...]}
 * 陣列內容是「等級」（對應 AIR_RANK_CODE 的 key），不是部件ID，
 * 跟畫面上「勾選擁有哪些等級/款式」的操作方式直接對應。
 */
function airMeetsThreshold(val, normalThr, bestThr, mode) {
  if (mode === 'none' || mode == null) return true;
  if (typeof mode === 'number') return val >= mode;
  if (mode === 'normal') return val >= normalThr;
  if (mode === 'best') return val >= bestThr;
  return true;
}
function airFindBuilds(sectorIds, ownedRanks, th, rank) {
  const ids = Array.isArray(sectorIds) ? sectorIds : [sectorIds];
  const secs = ids.map(id => AIR_SECTOR_MAP.get(id)).filter(Boolean);
  if (!secs.length) return [];
  const best = airBestOrder(ids); // 单一目的地时 ids 只有一个元素，一样适用
  const maxCap = (AIR_RANKS[rank] || [])[1];
  const own = slot => AIR_PARTS[slot].filter(p => (ownedRanks[slot] || []).includes(p[1]));
  const hulls = own('hull'), riggings = own('rigging'), forecastles = own('forecastle'), aftcastles = own('aftcastle');
  const tank = secs.reduce((s, sec) => s + sec[13], 0);
  const results = [];
  for (const h of hulls) for (const r of riggings) for (const f of forecastles) for (const a of aftcastles) {
    const st = airCalcStats(h, r, f, a);
    if (best.totalRng > st.rng) continue; // 航程不夠，連飛都飛不到
    const cost = h[8] + r[8] + f[8] + a[8];
    if (maxCap != null && cost > maxCap) continue; // 超過承載力，裝不上船
    // 整條路線每一站都要達標（同一艘船跑完全程，門檻不能只滿足其中一站）
    if (!secs.every(sec => airMeetsThreshold(st.sur, sec[9], sec[10], th.sur))) continue;
    if (!secs.every(sec => airMeetsThreshold(st.ret, sec[11], sec[12], th.ret))) continue;
    if (!secs.every(sec => airMeetsThreshold(st.fav, sec[8], sec[8], th.fav === 'met' ? 'normal' : th.fav))) continue;
    const timeMins = best.totalDist / st.spd + 720;
    const hh = Math.floor(timeMins / 60), mm = Math.floor(timeMins % 60), dd = Math.floor(hh / 24), rh = hh % 24;
    const timeStr = dd > 0 ? `${dd}天${rh}小時${mm}分` : `${rh}小時${mm}分`;
    results.push({ hull: h, rigging: r, forecastle: f, aftcastle: a, st, cost, cap: maxCap, timeMins, timeStr, tank, secOrder: best.order });
  }
  results.sort((a, b) => a.timeMins - b.timeMins);
  return results;
}

/* ===== 配裝反查：以物品為目標 =====
 * {物品ID: [{sec:航區id, tier:1/2/3}, ...]} —— 由 AIR_LOOT_TIER 反推出來，
 * 讓「選物品」可以查出「在哪些航區、要多高的探索門檻才拿得到」。
 */
const AIR_ITEM_SECTORS = {};
Object.entries(AIR_LOOT_TIER).forEach(([secId, tiers]) => {
  Object.entries(tiers).forEach(([tier, ids]) => {
    ids.forEach(itemId => {
      const list = AIR_ITEM_SECTORS[itemId] || (AIR_ITEM_SECTORS[itemId] = []);
      const existing = list.find(x => x.sec === +secId);
      if (existing) existing.tier = Math.min(existing.tier, +tier); // 同一物品在同航區可能列在多個Tier，取最低的（最容易拿到的那個）
      else list.push({ sec: +secId, tier: +tier });
    });
  });
});

/* sectorTierMap：{航區id: 需要的Tier(1/2/3)}（同一航區若被多個物品用到，
 * 呼叫端要先取最高的 Tier 再傳進來）。探索門檻依 Tier 各自比對每個航區
 * 自己的門檻值；收集/恩惠沿用一般的 th 設定，全程統一比對。 */
function airFindBuildsForTiers(sectorTierMap, th, ownedRanks, rank) {
  const ids = Object.keys(sectorTierMap).map(Number);
  const secs = ids.map(id => AIR_SECTOR_MAP.get(id)).filter(Boolean);
  if (!secs.length) return [];
  const best = airBestOrder(ids);
  const maxCap = (AIR_RANKS[rank] || [])[1];
  const own = slot => AIR_PARTS[slot].filter(p => (ownedRanks[slot] || []).includes(p[1]));
  const hulls = own('hull'), riggings = own('rigging'), forecastles = own('forecastle'), aftcastles = own('aftcastle');
  const tank = secs.reduce((s, sec) => s + sec[13], 0);
  const results = [];
  for (const h of hulls) for (const r of riggings) for (const f of forecastles) for (const a of aftcastles) {
    const st = airCalcStats(h, r, f, a);
    if (best.totalRng > st.rng) continue;
    const cost = h[8] + r[8] + f[8] + a[8];
    if (maxCap != null && cost > maxCap) continue;
    let ok = true;
    for (const sec of secs) {
      const tier = sectorTierMap[sec[0]];
      if (tier >= 3 && st.sur < sec[10]) { ok = false; break; }
      if (tier === 2 && st.sur < sec[9]) { ok = false; break; }
    }
    if (!ok) continue;
    if (!secs.every(sec => airMeetsThreshold(st.ret, sec[11], sec[12], th.ret))) continue;
    if (!secs.every(sec => airMeetsThreshold(st.fav, sec[8], sec[8], th.fav === 'met' ? 'normal' : th.fav))) continue;
    const timeMins = best.totalDist / st.spd + 720;
    const hh = Math.floor(timeMins / 60), mm = Math.floor(timeMins % 60), dd = Math.floor(hh / 24), rh = hh % 24;
    const timeStr = dd > 0 ? `${dd}天${rh}小時${mm}分` : `${rh}小時${mm}分`;
    results.push({ hull: h, rigging: r, forecastle: f, aftcastle: a, st, cost, cap: maxCap, timeMins, timeStr, tank, secOrder: best.order });
  }
  results.sort((a, b) => a.timeMins - b.timeMins);
  return results;
}

/* ===== 配裝反查：自行輸入數值（不綁定任何航區）=====
 * target 每個欄位可給數字或省略(不要求)：{sur,ret,fav,spd,rng}
 * 沒有航區就沒有「時間」概念，改成依承載力使用量由低到高排序（越省越好）。 */
function airFindBuildsByStats(target, ownedRanks, rank) {
  const maxCap = (AIR_RANKS[rank] || [])[1];
  const own = slot => AIR_PARTS[slot].filter(p => (ownedRanks[slot] || []).includes(p[1]));
  const hulls = own('hull'), riggings = own('rigging'), forecastles = own('forecastle'), aftcastles = own('aftcastle');
  const results = [];
  for (const h of hulls) for (const r of riggings) for (const f of forecastles) for (const a of aftcastles) {
    const st = airCalcStats(h, r, f, a);
    const cost = h[8] + r[8] + f[8] + a[8];
    if (maxCap != null && cost > maxCap) continue;
    if (target.sur != null && st.sur < target.sur) continue;
    if (target.ret != null && st.ret < target.ret) continue;
    if (target.fav != null && st.fav < target.fav) continue;
    if (target.spd != null && st.spd < target.spd) continue;
    if (target.rng != null && st.rng < target.rng) continue;
    results.push({ hull: h, rigging: r, forecastle: f, aftcastle: a, st, cost, cap: maxCap });
  }
  results.sort((a, b) => a.cost - b.cost);
  return results;
}
