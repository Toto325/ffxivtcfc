/* 由 macro-tags-src.txt 產生 macro-tags.json，並檢查 macro-areas.json。用法：node tools/build-macro-meta.js */
const fs=require('fs'),path=require('path');
const inv=require('./macro-inventory.json');
const D=p=>path.join(__dirname,p);
const AREAS=[
 ['talk','聊天通報',[['發言','chat echo tell reply qchat chatcountdown'],['清除記錄','cl cth'],['準備與倒數','countdown_sys readycheck ready notready'],['隨機與提醒','random dice alarm']]],
 ['act','技能道具',[['施放技能','skill generalskill blueaction pvpaction petaction companionaction aaction apa bluespellbook'],['輪換與複唱','abilityrotation recast'],['道具','item itemsort itemsearch']]],
 ['target','目標標記',[['目標操作','targeting assist focustarget facetarget lockon'],['標記','marking waymark']]],
 ['combat','戰鬥設定',[['目標設定','autolockon autofacetarget autotarget targetself groundclick'],['戰鬥','levelsync statusoff duelswitch'],['錯誤提示','actionerror recasterror'],['魔素板','magiaright magialeft magiaattack magiadefense magiaauto']]],
 ['char','角色坐騎',[['移動與姿態','automove follow battlemode'],['裝備','gearset visor fashion'],['坐騎與寵物','mount minion petsize petmirage ridepillion']]],
 ['emote','情感動作',[['情感動作','emote em emotelog'],['拍照','gpose facecamera idlingcamera tiltcamera']]],
 ['party','小隊組隊',[['組隊','partycmd join decline invite kick leader leave psort lfp']]],
 ['social','玩家互動',[['交易與查看','trade check'],['搜尋與好友','search friendlist blacklist'],['鑲嵌','lfm meldrequest'],['新人頻道','nnetwork nnetworkinvitation nnetworkleave']]],
 ['status','個人狀態',[['狀態','busy away roleplaying scomment bstatus title']]],
 ['ui','介面熱鍵',[['視窗','openwindow hud chatlog uiscale hudreset uireset'],['名牌與目標線','nameplatedisp nameplatetype targetring targetline linkline legacymark'],['角色顯示','displayhead displayarms autosheathe battleeffect jobhudmode'],['熱鍵欄','hotbar pvphotbar chotbar pvpchotbar chotbardisplay chotbartype']]],
 ['av','畫面音效',[['圖像','gpreset'],['音量與音樂','mastervolume bgm mountbgm voice performsounds'],['音效','soundeffects soundeffectsself soundeffectsparty soundeffectsother systemsounds systemsoundsspeaker ambientsounds']]],
 ['sys','巨集系統',[['巨集控制','micon mlock merror_line wait_line'],['系統','playtime logout shutdown instance patchnote'],['自訂','custom']]]];
const FACETS={
 '想做什麼':'喊話 確認進度 下馬 找隊伍 換裝 複製 表情 舞蹈 簡潔 截圖 準備確認 溝通 通知隊友 倒數 一鍵切換 一鍵施放 一鍵使用 一鍵換裝 一鍵上馬 一鍵選取 顯示隱藏 整理 整理背包 提醒 隨機 擲骰 清除 邀請 接受 拒絕 退出 回覆 音量 靜音 重置 設定 查詢 表演 自動 標記 輪換 管理 鎖定 解除 等待 延遲 招募 排序 轉向 縮放 切換 跟隨 移動 召喚 防誤觸 登出 說話 多行訊息 多頻道 說故事',
 '什麼場合':'生產 採集 坦克 開怪 站位 效能 治療 開怪前 戰鬥 副本 拍照 聚會 組隊 PvP 新手 買賣 角色扮演 切換職業 分配戰利品 切換角色 離線 觀景',
 '關於什麼':'提示音 背包 冷卻 能力技 衝刺 跳躍 極限技 食物 大地使者 陸行鳥 選單 查看裝備 選怪 攻擊順序 時間 投影 座位 AFK 簽名 新人 小隊 全名 縮寫 畫質 標題畫面 封鎖 武器 屬性 選中自己 取消選中 聊天 私訊 技能 通用技能 道具 藥水 坐騎 寵物 召喚獸 裝備 外觀 時尚配件 隊友 好友 黑名單 目標 焦點目標 場景標記 介面 視窗 熱鍵 十字熱鍵 手把 鏡頭 視角 集體動作 聲音 音樂 音效 語音 演奏 系統音 環境音 揚聲器 他人 特效 狀態 忙碌 離開 稱號 巨集 圖示 系統 青魔導士 搭擋 名牌 魔素板 魔晶石 鑲嵌 玩家 互動 交易 情感動作 拔刀收刀 圖像設定 畫面 等級同步 強化狀態 決鬥 錯誤提示 複唱 十二神印記 職業量譜 遊戲時間 副本區 版本更新 自我介紹 鬧鐘 顏文字 只有自己看到 自訂 進階 關閉遊戲 骰子'
};
const facetOf={};for(const [f,s] of Object.entries(FACETS))s.split(' ').forEach(t=>{if(facetOf[t]&&facetOf[t]!==f)throw new Error('facet dup '+t);facetOf[t]=f;});
const tags={};fs.readFileSync(D('macro-tags-src.txt'),'utf8').trim().split('\n').forEach(l=>{const [t,s]=l.split('|');if(tags[t])throw new Error('dup '+t);tags[t]=s.split(',');});
const problems=[];
const seen={};AREAS.forEach(a=>a[2].forEach(g=>g[1].split(' ').forEach(t=>{seen[t]=(seen[t]||0)+1;})));
Object.keys(inv).forEach(t=>{if(seen[t]!==1)problems.push('區域：'+t+' 出現 '+(seen[t]||0)+' 次');if(!tags[t])problems.push('缺少標籤：'+t);});
Object.keys(seen).concat(Object.keys(tags)).forEach(t=>{if(!inv[t])problems.push('未知類型：'+t)});
const use={};Object.entries(tags).forEach(([t,ts])=>{if(new Set(ts).size!==ts.length)problems.push('重複標籤：'+t);ts.forEach(x=>(use[x]=use[x]||[]).push(t));});
const noFacet=Object.keys(use).filter(t=>!facetOf[t]);
if(noFacet.length)problems.push('未分面向的標籤：'+noFacet.join(' '));
const unusedInFacet=Object.keys(facetOf).filter(t=>!use[t]);
fs.writeFileSync(D('macro-areas.json'),JSON.stringify({note:'草案 v3：12 個區域（4 字短名稱），區域內依類型分小標題。每種類型恰好屬於一個區域與一個小標題。',areas:AREAS.map(([id,label,gs])=>({id,label,count:gs.reduce((n,g)=>n+g[1].split(' ').length,0),groups:gs.map(([name,t])=>({name,types:t.split(' ')}))}))},null,1));
fs.writeFileSync(D('macro-tags.json'),JSON.stringify({note:'標籤草案：每種類型的標籤依相關度排列，前 2 個視為核心。標籤依指令用意標，不為湊數而標。',facets:Object.fromEntries(Object.keys(FACETS).map(f=>[f,Object.keys(facetOf).filter(t=>facetOf[t]===f&&use[t])])),tags},null,1));

// 前端資料檔：js/macro-meta.js（區域、標籤、面向、各類型欄位，供介面與反向解析使用）
const fieldsOut={};Object.entries(inv).forEach(([t,x])=>{fieldsOut[t]={isBlock:x.isBlock,fields:x.fields.map(f=>{const o={key:f.key,tag:f.tag};if(f.type)o.type=f.type;if(f.opts)o.opts=f.opts.map(function(v){return v.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');});return o;})};});
const metaOut={areas:JSON.parse(fs.readFileSync(D('macro-areas.json'),'utf8')).areas,tags,facets:JSON.parse(fs.readFileSync(D('macro-tags.json'),'utf8')).facets};
fs.writeFileSync(path.join(__dirname,'../js/macro-meta.js'),'/* 自動產生：node tools/build-macro-meta.js（請勿手改，改 tools/macro-tags-src.txt 或 build-macro-meta.js） */\nwindow.MacroMeta='+JSON.stringify(metaOut)+';\nwindow.MacroFields='+JSON.stringify(fieldsOut)+';\n');
const arr=Object.entries(use).map(([t,v])=>[t,v.length]).sort((a,b)=>b[1]-a[1]);
console.log('類型',Object.keys(tags).length,'標籤種類',arr.length,'每類型標籤數',Math.min(...Object.values(tags).map(x=>x.length)),'~',Math.max(...Object.values(tags).map(x=>x.length)));
console.log('最多類型的標籤：',arr.slice(0,12).map(x=>x.join(':')).join(' '));
console.log('只對應 1 種類型的標籤（'+arr.filter(x=>x[1]==1).length+'）：',arr.filter(x=>x[1]==1).map(x=>x[0]).join(' '));
console.log('面向標籤數：',Object.keys(FACETS).map(f=>f+Object.keys(facetOf).filter(t=>facetOf[t]===f&&use[t]).length).join(' '));
if(unusedInFacet.length)console.log('面向表內但沒類型使用（可刪）：',unusedInFacet.join(' '));
console.log(problems.length?'問題：\n'+problems.join('\n'):'檢查通過：140 種類型各歸一個區域、皆有標籤、標籤皆有面向');
process.exit(problems.length?1:0);
