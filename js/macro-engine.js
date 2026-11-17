/* macro-engine.js — 巨集資料與指令產生引擎（無 DOM、可在 Node 測試）
   由舊版 macro-tool.js 的資料表與建構邏輯原樣拆出；UI 層不得改動這裡的輸出。 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MacroEngine=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
var MAX=15,MAX_C=180,WARN_C=150;
/* ── Sound effects ── */
var SE=[{v:'',l:'無音效'}];for(var _i=1;_i<=16;_i++)SE.push({v:'<se.'+_i+'>',l:'音效 '+_i});

/* ── Target options ── */
var TGT=[
  {v:'',l:'（不指定目標）'},{v:'<t>',l:'<t>　當前目標'},{v:'<me>',l:'<me>　自己'},
  {v:'<f>',l:'<f>　焦點目標'},{v:'<tt>',l:'<tt>　目標的目標'},
  {v:'<lt>',l:'<lt>　上次目標'},{v:'<mo>',l:'<mo>　滑鼠指向的角色'},
  {v:'<r>',l:'<r>　最後傳悄悄話給你的人'},{v:'<le>',l:'<le>　最後選中的敵人'},
  {v:'<la>',l:'<la>　最後攻擊你的敵人'},{v:'<c>',l:'<c>　自己的搭擋'},
  {v:'<p>',l:'<p>　自己的召喚獸'},
  {v:'<1>',l:'<1>　小隊1號'},{v:'<2>',l:'<2>　小隊2號'},{v:'<3>',l:'<3>　小隊3號'},
  {v:'<4>',l:'<4>　小隊4號'},{v:'<5>',l:'<5>　小隊5號'},{v:'<6>',l:'<6>　小隊6號'},
  {v:'<7>',l:'<7>　小隊7號'},{v:'<8>',l:'<8>　小隊8號'},
  {v:'<attack1>',l:'<attack1>　攻擊標記1'},{v:'<attack2>',l:'<attack2>　攻擊標記2'},
  {v:'<attack3>',l:'<attack3>　攻擊標記3'},{v:'<attack4>',l:'<attack4>　攻擊標記4'},
  {v:'<attack5>',l:'<attack5>　攻擊標記5'},{v:'<bind1>',l:'<bind1>　止步標記1'},
  {v:'<bind2>',l:'<bind2>　止步標記2'},{v:'<bind3>',l:'<bind3>　止步標記3'},
  {v:'<stop1>',l:'<stop1>　禁止標記1'},{v:'<stop2>',l:'<stop2>　禁止標記2'},
  {v:'<square>',l:'<square>　方塊標記'},{v:'<circle>',l:'<circle>　圓圈標記'},
  {v:'<cross>',l:'<cross>　叉標記'},{v:'<triangle>',l:'<triangle>　三角標記'},
  {v:'<e1>',l:'<e1>　PvP敵方1號'},{v:'<e2>',l:'<e2>　PvP敵方2號'},
  {v:'<e3>',l:'<e3>　PvP敵方3號'},{v:'<e4>',l:'<e4>　PvP敵方4號'},
  {v:'<e5>',l:'<e5>　PvP敵方5號'},{v:'custom',l:'自訂輸入...'}
];

/* ── Chat channels ── */
var CH=[
  {v:'p',l:'小隊 /p'},{v:'s',l:'說話 /s（20公尺）'},{v:'y',l:'呼喊 /y（100公尺）'},
  {v:'sh',l:'喊話 /sh（整個區域）'},{v:'a',l:'團隊 /a'},{v:'fc',l:'部隊 /fc'},
  {v:'pt',l:'戰隊 /pt'},{v:'l1',l:'通訊貝1 /l1'},{v:'l2',l:'通訊貝2 /l2'},
  {v:'l3',l:'通訊貝3 /l3'},{v:'l4',l:'通訊貝4 /l4'},{v:'l5',l:'通訊貝5 /l5'},
  {v:'l6',l:'通訊貝6 /l6'},{v:'l7',l:'通訊貝7 /l7'},{v:'l8',l:'通訊貝8 /l8'},
  {v:'cwl1',l:'跨服通訊貝1 /cwl1'},{v:'cwl2',l:'跨服通訊貝2 /cwl2'},
  {v:'cwl3',l:'跨服通訊貝3 /cwl3'},{v:'cwl4',l:'跨服通訊貝4 /cwl4'},
  {v:'cwl5',l:'跨服通訊貝5 /cwl5'},{v:'cwl6',l:'跨服通訊貝6 /cwl6'},
  {v:'cwl7',l:'跨服通訊貝7 /cwl7'},{v:'cwl8',l:'跨服通訊貝8 /cwl8'},
  {v:'b',l:'新人頻道 /b'},{v:'e',l:'默語（僅自己）/e'}
];

/* ── MICON types ── */
var MICON_T=[
  {v:'action',l:'技能 (action)'},{v:'general',l:'通用技能 (general)'},
  {v:'blueaction',l:'青魔法 (blueaction)'},{v:'pvpaction',l:'PvP技能 (pvpaction)'},
  {v:'item',l:'道具 (item)'},{v:'emote',l:'情感動作 (emote)'},
  {v:'mount',l:'坐騎 (mount)'},{v:'minion',l:'寵物 (minion)'},
  {v:'gearset',l:'裝備套裝編號 (gearset)'},{v:'classjob',l:'職業圖示 (classjob)'},
  {v:'marking',l:'目標標記 (marking)'},{v:'waymark',l:'場景標記 (waymark)'}
];

/* ── HUD windows ── */
var HUD_W=[
  {v:'TargetBar',l:'目標欄 (tbar)',g:'目標／焦點'},
  {v:'TInfoHP',l:'目標情報：體力 (tihp)',g:'目標／焦點'},
  {v:'TInfoProgress',l:'目標情報：進度條／詠唱欄 (tiprog)',g:'目標／焦點'},
  {v:'TInfoStatus',l:'目標情報：狀態效果 (tistat)',g:'目標／焦點'},
  {v:'FocusTarget',l:'焦點目標欄 (ftarget)',g:'目標／焦點'},
  {v:'PartyList',l:'小隊列表 (plist)',g:'小隊／團隊'},
  {v:'EnmityList',l:'敵對列表／仇恨列表 (elist)',g:'小隊／團隊'},
  {v:'AllianceList1',l:'團隊列表1 (alist1)',g:'小隊／團隊'},
  {v:'AllianceList2',l:'團隊列表2 (alist2)',g:'小隊／團隊'},
  {v:'JobGauge1',l:'職業量譜1',g:'角色資訊'},
  {v:'JobGauge2',l:'職業量譜2',g:'角色資訊'},
  {v:'ParamBar',l:'角色參數欄 (param)',g:'角色資訊'},
  {v:'LimitGauge',l:'極限技槽 (lgauge)',g:'角色資訊'},
  {v:'ExpBar',l:'經驗值欄 (ebar)',g:'角色資訊'},
  {v:'StatusEffects',l:'狀態效果 (sfx)',g:'角色資訊'},
  {v:'SInfoEnhancements',l:'狀態資訊：強化 (sienh)',g:'角色資訊'},
  {v:'SInfoConditionalEnhancements',l:'狀態資訊：條件強化 (sicenh)',g:'角色資訊'},
  {v:'SInfoEnfeeblements',l:'狀態資訊：弱化 (sienf)',g:'角色資訊'},
  {v:'SInfoOther',l:'狀態資訊：其他 (siother)',g:'角色資訊'},
  {v:'Minimap',l:'小地圖 (mmap)',g:'介面／系統'},
  {v:'MainMenu',l:'主選單 (mmenu)',g:'介面／系統'},
  {v:'ServerInfo',l:'伺服器資訊 (server)',g:'介面／系統'},
  {v:'Gil',l:'金幣 (gil)',g:'介面／系統'},
  {v:'InventoryGrid',l:'背包縮圖 (igrid)',g:'介面／系統'},
  {v:'DutyList',l:'任務列表 (dlist)',g:'介面／系統'},
  {v:'ItemHelp',l:'道具說明 (ihelp)',g:'介面／系統'},
  {v:'ActionHelp',l:'技能說明 (ahelp)',g:'介面／系統'},
  {v:'ScenarioGuide',l:'主線嚮導',g:'介面／系統'},
  {v:'Hotbar1',l:'熱鍵欄1',g:'熱鍵欄'},{v:'Hotbar2',l:'熱鍵欄2',g:'熱鍵欄'},
  {v:'Hotbar3',l:'熱鍵欄3',g:'熱鍵欄'},{v:'Hotbar4',l:'熱鍵欄4',g:'熱鍵欄'},
  {v:'Hotbar5',l:'熱鍵欄5',g:'熱鍵欄'},{v:'Hotbar6',l:'熱鍵欄6',g:'熱鍵欄'},
  {v:'Hotbar7',l:'熱鍵欄7',g:'熱鍵欄'},{v:'Hotbar8',l:'熱鍵欄8',g:'熱鍵欄'},
  {v:'Hotbar9',l:'熱鍵欄9',g:'熱鍵欄'},{v:'Hotbar10',l:'熱鍵欄10',g:'熱鍵欄'},
  {v:'Crosshotbar',l:'十字熱鍵欄',g:'熱鍵欄'},
  {v:'BattleHighGauge',l:'戰鬥高潮槽',g:'特殊玩法'},
  {v:'FrontlineScore',l:'紛爭前線：戰績資訊 (flscore)',g:'特殊玩法'},
  {v:'FrontlineCampaignInfo',l:'紛爭前線：戰役資訊 (flcamp)',g:'特殊玩法'},
  {v:'RWGauge',l:'烈羽爭鋒：計量表 (rwg)',g:'特殊玩法'},
  {v:'RWAlliance',l:'烈羽爭鋒：團隊列表 (rwa)',g:'特殊玩法'},
  {v:'RWStation',l:'烈羽爭鋒：站點資訊 (rwst)',g:'特殊玩法'},
  {v:'RWMerc',l:'烈羽爭鋒：哥布林傭兵資訊 (rwmrc)',g:'特殊玩法'},
  {v:'FeastAlly',l:'群狼盛宴：我方情報 (fally)',g:'特殊玩法'},
  {v:'FeastEnemy',l:'群狼盛宴：敵方情報 (fenemy)',g:'特殊玩法'},
  {v:'CConflictProgress',l:'水晶都爭霸：進度槽 (ccprog)',g:'特殊玩法'},
  {v:'CConflictAlly',l:'水晶都爭霸：我方資訊 (ccally)',g:'特殊玩法'},
  {v:'CConflictEnemy',l:'水晶都爭霸：敵方資訊 (ccenemy)',g:'特殊玩法'},
  {v:'CConflictMap',l:'水晶都爭霸：地圖 (ccmap)',g:'特殊玩法'},
  {v:'CosmicExplorationInfo',l:'宇宙探索資訊 (csmex)',g:'特殊玩法'}
];

/* ── ItemSort areas & criteria ── */
var IS_AREAS=[
  {v:'inventory',l:'背包（物品欄）',g:'常用'},
  {v:'armoury',l:'兵裝庫（整個）',g:'常用'},
  {v:'retainer',l:'雇員物品（視窗需開啟才能執行）',g:'常用'},
  {v:'saddlebag',l:'陸行鳥鞍囊（視窗需開啟才能執行）',g:'常用'},
  {v:'rightsaddlebag',l:'陸行鳥鞍囊2（右，視窗需開啟才能執行）',g:'常用'},
  {v:'mh',l:'兵裝庫：主手',g:'兵裝庫子分類'},
  {v:'oh',l:'兵裝庫：副手',g:'兵裝庫子分類'},
  {v:'head',l:'兵裝庫：頭部',g:'兵裝庫子分類'},
  {v:'body',l:'兵裝庫：身體',g:'兵裝庫子分類'},
  {v:'hands',l:'兵裝庫：手部',g:'兵裝庫子分類'},
  {v:'legs',l:'兵裝庫：腿部',g:'兵裝庫子分類'},
  {v:'feet',l:'兵裝庫：腳部',g:'兵裝庫子分類'},
  {v:'neck',l:'兵裝庫：頸部（項鍊）',g:'兵裝庫子分類'},
  {v:'ears',l:'兵裝庫：耳部（耳飾）',g:'兵裝庫子分類'},
  {v:'wrists',l:'兵裝庫：腕部（手鐲）',g:'兵裝庫子分類'},
  {v:'rings',l:'兵裝庫：戒指',g:'兵裝庫子分類'},
  {v:'soul',l:'兵裝庫：靈魂水晶',g:'兵裝庫子分類'}
];
var IS_C=[
  {v:'ilv',l:'物品品級',o:true},{v:'category',l:'道具種類（分類）',o:true},
  {v:'id',l:'道具編號',o:true},{v:'spiritbond',l:'精煉度',o:true},
  {v:'lv',l:'裝備等級',o:true},{v:'stack',l:'打包數量',o:true},
  {v:'hq',l:'優質道具（HQ）',o:true},{v:'materia',l:'魔晶石數量',o:true},
  {v:'tab',l:'分欄排列（不需選升降序）',o:false},
  {v:'pdamage',l:'物理基本性能',o:true},{v:'mdamage',l:'魔法基本性能',o:true},
  {v:'delay',l:'攻擊間隔',o:true},{v:'autoattack',l:'物理自動攻擊',o:true},
  {v:'blockrate',l:'格擋發動力',o:true},{v:'blockstrength',l:'格擋性能',o:true},
  {v:'defense',l:'物理防禦力',o:true},{v:'mdefense',l:'魔法防禦力',o:true},
  {v:'str',l:'力量 STR',o:true},{v:'dex',l:'靈巧 DEX',o:true},
  {v:'vit',l:'耐力 VIT',o:true},{v:'int',l:'智力 INT',o:true},
  {v:'mnd',l:'精神 MND',o:true},
  {v:'craftsmanship',l:'作業精度（製作）',o:true},
  {v:'control',l:'加工精度（製作）',o:true},{v:'gathering',l:'採集力（採集）',o:true},
  {v:'perception',l:'感知力（採集）',o:true}
];

/* ── Named emotes ── */
var EMOTES=[
  {v:'bow',l:'行禮'},{v:'welcome',l:'歡迎'},{v:'goodbye',l:'道別'},
  {v:'kneel',l:'下跪'},{v:'gcsalute',l:'軍禮'},{v:'easternbow',l:'行東方禮'},
  {v:'greet',l:'打招呼'},{v:'salute',l:'敬禮'},{v:'imperialsalute',l:'帝國式軍禮'},
  {v:'easterngreeting',l:'抱拳禮'},{v:'ohokaliy',l:'噢霍卡利'},{v:'laliho',l:'啦哩吼'},
  {v:'chuckle',l:'輕笑'},{v:'joy',l:'高興'},{v:'rally',l:'鼓勵'},
  {v:'psych',l:'激勵'},{v:'laugh',l:'大笑'},{v:'happy',l:'欣喜若狂'},
  {v:'thumbsup',l:'肯定'},{v:'congratulate',l:'稱讚'},{v:'vpose',l:'歡呼勝利'},
  {v:'vreveal',l:'大獲全勝'},{v:'hurray',l:'勝利歡呼'},{v:'jumpforjoy1',l:'雀躍1'},
  {v:'jumpforjoy2',l:'雀躍2'},{v:'jumpforjoy3',l:'雀躍3'},{v:'jumpforjoy4',l:'雀躍4'},
  {v:'jumpforjoy5',l:'雀躍5'},{v:'determined',l:'幹勁十足'},{v:'wow',l:'兩眼放光'},
  {v:'cry',l:'哭泣'},{v:'fume',l:'後悔'},{v:'upset',l:'失望'},
  {v:'sulk',l:'懊惱'},{v:'huh',l:'莫名'},{v:'shrug',l:'聳肩'},
  {v:'surprised',l:'驚訝'},{v:'grovel',l:'下跪認錯'},{v:'facepalm',l:'捂臉'},
  {v:'aback',l:'大吃一驚'},{v:'deny',l:'否定'},{v:'furious',l:'憤怒'},
  {v:'panic',l:'慌張'},{v:'disappointed',l:'大失所望'},{v:'angry',l:'不滿'},
  {v:'shocked',l:'震驚'},{v:'stagger',l:'迷糊'},{v:'doubt',l:'質疑'},
  {v:'headache',l:'頭痛'},{v:'sundering',l:'眾生離絕'},{v:'slump',l:'垂頭喪氣'},
  {v:'dazed',l:'暈頭轉向'},{v:'rage',l:'氣得發抖'},{v:'tremble',l:'害怕'},
  {v:'frighten',l:'嚇唬人'},{v:'delight',l:'陶醉捧臉'},{v:'cackle',l:'高傲冷笑'},
  {v:'overreact',l:'誇張驚訝'},{v:'blush',l:'害羞'},{v:'deride',l:'叛逆精神'},
  {v:'respect',l:'默哀'},{v:'shiver',l:'好冷'},{v:'sweat',l:'好熱'},
  {v:'hug',l:'擁抱'},{v:'embrace',l:'深情擁抱'},{v:'charmed',l:'魅惑擁抱'},
  {v:'slap',l:'甩巴掌'},{v:'clutchhead',l:'抱頭'},{v:'soothe',l:'安撫'},
  {v:'comfort',l:'安慰'},{v:'pray',l:'祈禱'},{v:'blowkiss',l:'飛吻'},
  {v:'pet',l:'撫摸'},{v:'handover',l:'遞交'},{v:'poke',l:'用手指戳'},
  {v:'beckon',l:'招手'},{v:'point',l:'指向'},{v:'dote',l:'表達愛意'},
  {v:'prettyplease',l:'撒嬌'},{v:'gratuity',l:'心意'},{v:'conduct',l:'指揮'},
  {v:'carrybook',l:'抱書'},{v:'bouquet',l:'贈送花束'},{v:'malevolence',l:'詛咒'},
  {v:'highfive',l:'擊掌'},{v:'throw',l:'投擲'},{v:'pose',l:'擺造型'},
  {v:'think',l:'思考'},{v:'doze',l:'打盹'},{v:'lookout',l:'張望'},
  {v:'me',l:'展示'},{v:'converse',l:'說話'},{v:'shush',l:'噓'},
  {v:'photograph',l:'拍照'},{v:'flex',l:'肉體之美'},{v:'examineself',l:'自視'},
  {v:'stretch',l:'伸展'},{v:'airquotes',l:'引用'},{v:'waterflip',l:'水中翻跟斗'},
  {v:'elucidate',l:'說明'},{v:'lean',l:'背靠'},{v:'attend',l:'待命'},
  {v:'sit',l:'坐下'},{v:'groundsit',l:'坐下到地上'},{v:'changepose',l:'改變姿勢'},
  {v:'confirm',l:'確認'},{v:'reprimand',l:'提醒'},{v:'study',l:'認真看書'},
  {v:'insist',l:'堅持主張'},{v:'consider',l:'疑問'},{v:'wasshoi',l:'嘿喲'},
  {v:'spectacles',l:'托眼鏡'},{v:'visage',l:'用觸控板記錄'},{v:'water',l:'澆水'},
  {v:'tomescroll',l:'摩挲神典石祈求'},{v:'twirl',l:'旋轉展示服裝'},{v:'winded',l:'單膝跪地'},
  {v:'spirit',l:'觀戰'},{v:'sheathe',l:'收回武器'},{v:'draw',l:'亮出武器'},
  {v:'divinearm',l:'神兵：臂'},{v:'divinedisk',l:'神兵：盤'},{v:'divinetiara',l:'神兵：冠'},
  {v:'unbound',l:'象徵自由的姿勢'},{v:'wave',l:'揮手'},{v:'clap',l:'拍手'},
  {v:'cheer',l:'加油'},{v:'visor',l:'頭部裝備操作'},{v:'scheme',l:'說明計畫'},
  {v:'waitforit',l:'得意洋洋'},{v:'handtoheart',l:'手撫胸'},{v:'playdead',l:'裝死'},
  {v:'guard',l:'巡視'},{v:'blownaway',l:'被震飛'},{v:'stomp',l:'跺地洩憤'},
  {v:'wringhands',l:'搓手'},{v:'sweep',l:'掃地'},{v:'pantomime',l:'默劇'},
  {v:'vexed',l:'疑惑'},{v:'reference',l:'比對文獻'},{v:'hildy',l:'紳士風度'},
  {v:'fistbump',l:'對拳'},{v:'linkpearl',l:'通訊珠'},{v:'pen',l:'用羽毛筆寫字'},
  {v:'read',l:'看書'},{v:'heart',l:'比心'},{v:'hum',l:'哼歌'},
  {v:'ritualprayer',l:'祝禱'},{v:'toast',l:'乾杯'},{v:'bigfan',l:'扇大團扇'},
  {v:'blowbubbles',l:'吹泡泡'},{v:'earwiggle',l:'搖兔兔耳'},{v:'flowershower',l:'花雨'},
  {v:'no',l:'搖頭'},{v:'snap',l:'打響指'},{v:'yes',l:'點頭'},
  {v:'tomestone',l:'神典石'},{v:'dance',l:'跳舞'},{v:'stepdance',l:'踢踏舞'},
  {v:'mogdance',l:'莫古莫古舞'},{v:'yoldance',l:'胡鷹之舞'},{v:'lalihop',l:'啦哩吼舞'},
  {v:'sundance',l:'太陽之舞'},{v:'harvestdance',l:'豐饒之舞'},{v:'balldance',l:'宮廷之舞'},
  {v:'mandervilledance',l:'紳士之舞'},{v:'bombdance',l:'火盆舞'},{v:'thavnairiandance',l:'薩維奈舞'},
  {v:'golddance',l:'黃金之舞'},{v:'edance',l:'東方傳統舞蹈'},{v:'moonlift',l:'日月之舞'},
  {v:'songbird',l:'小黃鶯之舞'},{v:'flamedance',l:'烈焰之舞'},{v:'beesknees',l:'蜜蜂之舞'},
  {v:'mmambo',l:'紳士舞步'},{v:'ladance',l:'公主之舞'},{v:'breakdance',l:'霹靂舞'},
  {v:'lophop',l:'兔兔舞'},{v:'sabotender',l:'優雅仙人掌怪'},{v:'boxstep',l:'方形步'},
  {v:'sidestep',l:'側步'},{v:'heeltoe',l:'趾踵步'},{v:'goobbuedo',l:'古卜步'},
  {v:'popotostep',l:'波波托步'},{v:'getfantasy',l:'幻想舞步'},{v:'runway',l:'伸展台走秀'},
  {v:'cheerjump',l:'聲援小紅'},{v:'cheerbright',l:'聲援小白'},{v:'cheergreen',l:'聲援小綠'},
  {v:'cheeron',l:'聲援小藍'},{v:'cheerwave',l:'聲援小黃'},{v:'cheerviolet',l:'聲援小紫'},
  {v:'cheerjumpindigo',l:'應援跳躍：靛'},{v:'cheerlb',l:'應援搖擺：藍'},{v:'cheerlg',l:'應援搖擺：綠'},
  {v:'cheerly',l:'應援搖擺：黃'},{v:'cheeronorange',l:'應援揮舞：橘'},{v:'cheerwavepink',l:'應援揮手：粉'},
  {v:'cheerrw',l:'應援打拍：白'},{v:'cheerrr',l:'應援打拍：紅'},{v:'cheerrv',l:'應援打拍：紫'},
  {v:'battlestance',l:'準備戰鬥'},{v:'fistpump',l:'振作精神'},{v:'rangerpose1r',l:'戰隊演武正紅一式'},
  {v:'rangerpose1l',l:'戰隊演武逆紅一式'},{v:'rangerpose2r',l:'戰隊演武正黑二式'},{v:'rangerpose2l',l:'戰隊演武逆黑二式'},
  {v:'rangerpose3r',l:'戰隊演武正黃三式'},{v:'rangerpose3l',l:'戰隊演武逆黃三式'},{v:'redrangerposea',l:'紅騎士造型A'},
  {v:'redrangerposeb',l:'紅騎士造型B'},{v:'blackrangerposea',l:'黑騎士造型A'},{v:'blackrangerposeb',l:'黑騎士造型B'},
  {v:'yellowrangerposea',l:'黃騎士造型A'},{v:'yellowrangerposeb',l:'黃騎士造型B'},{v:'zantetsuken',l:'斬鐵劍'},
  {v:'ultima',l:'究極'},{v:'crimsonlotus',l:'練武'},{v:'powerup',l:'蓄力迸發'},
  {v:'eureka',l:'靈光一現'},{v:'backflip',l:'後空翻'},{v:'simulationm',l:'歐米茄M架勢'},
  {v:'simulationf',l:'歐米茄F架勢'},{v:'paintred',l:'紅色陸行鳥之筆'},{v:'paintblue',l:'藍色陸行鳥之筆'},
  {v:'paintblack',l:'黑色陸行鳥之筆'},{v:'paintyellow',l:'黃色陸行鳥之筆'},{v:'eatapple',l:'吃蘋果'},
  {v:'eategg',l:'吃水煮蛋'},{v:'eatriceball',l:'吃飯團'},{v:'eatchicken',l:'吃炸雞'},
  {v:'choco',l:'吃戀人巧克力'},{v:'cookie',l:'吃南瓜餅乾'},{v:'taco',l:'吃塔可'},
  {v:'devourtaco',l:'狂吃塔可'},{v:'pizza',l:'吃披薩'},{v:'bread',l:'吃麵包'},
  {v:'fryegg',l:'煎蛋'},{v:'tea',l:'飲用紅茶'},{v:'savortea',l:'品茶'},
  {v:'greentea',l:'喝綠茶'},{v:'shakedrink',l:'搖雪克杯'},{v:'gridaniangulp',l:'暢飲格里達尼亞特調'},
  {v:'gridaniansip',l:'小酌格里達尼亞特調'},{v:'lominsangulp',l:'暢飲利姆薩·羅敏薩特調'},{v:'lominsansip',l:'小酌利姆薩·羅敏薩特調'},
  {v:'uldahngulp',l:'暢飲烏爾達哈特調'},{v:'uldahnsip',l:'小酌烏爾達哈特調'},{v:'pushups',l:'伏地挺身'},
  {v:'situps',l:'仰臥起坐'},{v:'squats',l:'深蹲'},{v:'breathcontrol',l:'深呼吸'},
  {v:'atease',l:'稍息'},{v:'attention',l:'立正'},{v:'box',l:'練拳'},
  {v:'limber',l:'甩臂熱身'},{v:'estretch',l:'熱身'},{v:'waterfloat',l:'浮水'},
  {v:'splash',l:'撩水'},{v:'advent',l:'威光降臨'},{v:'allsaintscharm',l:'守護天節的魔咒'},
  {v:'magictrick',l:'魔術'},{v:'megaflare',l:'百萬火光'},{v:'iceheart',l:'寒冰的幻想'},
  {v:'haurchefant',l:'太棒了！'},{v:'showleft',l:'展現左側'},{v:'showright',l:'展現右側'},
  {v:'straightface',l:'表情：平常'},{v:'grin',l:'表情：笑容'},{v:'biggrin',l:'表情：咧嘴'},
  {v:'leftwink',l:'表情：拋媚眼左'},{v:'smirk',l:'表情：自信'},{v:'shuteyes',l:'表情：閉目'},
  {v:'scared',l:'表情：恐怖'},{v:'ouch',l:'表情：痛苦'},{v:'alert',l:'表情：吃驚'},
  {v:'sneer',l:'表情：陰險'},{v:'concentrate',l:'表情：認真'},{v:'simper',l:'表情：柔和'},
  {v:'reflect',l:'表情：沉思'},{v:'scoff',l:'表情：苦笑'},{v:'endure',l:'表情：忍耐'},
  {v:'smile',l:'表情：微笑'},{v:'rightwink',l:'表情：拋媚眼右'},{v:'content',l:'表情：幸福'},
  {v:'taunt',l:'表情：無畏'},{v:'sad',l:'表情：悲傷'},{v:'amazed',l:'表情：意外'},
  {v:'annoyed',l:'表情：反感'},{v:'worried',l:'表情：擔心'},{v:'puckerup',l:'表情：嘟嘴'},
  {v:'disturbed',l:'表情：困惑'},{v:'beam',l:'表情：滿足'},{v:'furrow',l:'表情：皺眉'},
  {v:'ponder',l:'表情：思索'},{v:'fakesmile',l:'表情：假笑'},
];

/* ── Jobs for LFP / Search ── */
var JOBS=[
  {v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},
  {v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},
  {v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},
  {v:'CRP',l:'刻木匠 CRP'},{v:'BSM',l:'鍛鐵匠 BSM'},{v:'ARM',l:'鑄甲匠 ARM'},
  {v:'GSM',l:'雕金匠 GSM'},{v:'LTW',l:'製革匠 LTW'},{v:'WVR',l:'裁衣匠 WVR'},
  {v:'ALC',l:'煉金術士 ALC'},{v:'CUL',l:'烹調師 CUL'},{v:'MIN',l:'採礦工 MIN'},
  {v:'BTN',l:'園藝工 BTN'},{v:'FSH',l:'捕魚人 FSH'},{v:'PLD',l:'騎士 PLD'},
  {v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},
  {v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},
  {v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},
  {v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},
  {v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},
  {v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},
  {v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}
];

/* ── PetMirage data ── */
var PETMIRAGE_PETS=[
  {v:'carbuncle',l:'寶石獸'},
  {v:'garuda-egi',l:'迦樓羅之靈'},
  {v:'titan-egi',l:'泰坦之靈'},
  {v:'ifrit-egi',l:'伊弗利特之靈'},
  {v:'eos',l:'伊歐斯（學者妖精）'}
];
var PETMIRAGE_APPEARANCES={
  'carbuncle':[{v:'carbuncle',l:'寶石獸'},{v:'emerald-carbuncle',l:'綠寶石獸'},{v:'topaz-carbuncle',l:'黃寶石獸'},{v:'ruby-carbuncle',l:'紅寶石獸'}],
  'garuda-egi':[{v:'ifrit-egi',l:'伊弗利特之靈'},{v:'titan-egi',l:'泰坦之靈'},{v:'garuda-egi',l:'迦樓羅之靈'},{v:'carbuncle',l:'寶石獸'},{v:'emerald-carbuncle',l:'綠寶石獸'},{v:'topaz-carbuncle',l:'黃寶石獸'},{v:'ruby-carbuncle',l:'紅寶石獸'}],
  'titan-egi':[{v:'ifrit-egi',l:'伊弗利特之靈'},{v:'titan-egi',l:'泰坦之靈'},{v:'garuda-egi',l:'迦樓羅之靈'},{v:'carbuncle',l:'寶石獸'},{v:'emerald-carbuncle',l:'綠寶石獸'},{v:'topaz-carbuncle',l:'黃寶石獸'},{v:'ruby-carbuncle',l:'紅寶石獸'}],
  'ifrit-egi':[{v:'ifrit-egi',l:'伊弗利特之靈'},{v:'titan-egi',l:'泰坦之靈'},{v:'garuda-egi',l:'迦樓羅之靈'},{v:'carbuncle',l:'寶石獸'},{v:'emerald-carbuncle',l:'綠寶石獸'},{v:'topaz-carbuncle',l:'黃寶石獸'},{v:'ruby-carbuncle',l:'紅寶石獸'}],
  'eos':[{v:'selene',l:'賽勒涅（Selene）'}]
};

/* ── PetSize summons ── */
var PETSIZE_PETS=[
  {v:'Demi-Bahamut',l:'亞靈神巴哈姆特'},{v:'Demi-Phoenix',l:'亞靈神不死鳥'},
  {v:'Ifrit-Egi',l:'紅寶石伊弗利特'},{v:'Titan-Egi',l:'黃寶石泰坦'},
  {v:'Garuda-Egi',l:'綠寶石迦樓羅'},{v:'Bahamut',l:'烈日巴哈姆特'},
  {v:'all',l:'全部'}
];

/* ── Graphic presets ── */
var GPRESET_OPTS=[
  {v:'1',l:'1 — 標準品質（筆記型電腦）'},{v:'2',l:'2 — 標準品質（桌上型電腦）'},
  {v:'3',l:'3 — 高品質（筆記型電腦）'},{v:'4',l:'4 — 高品質（桌上型電腦）'},
  {v:'5',l:'5 — 最高品質'}
];

/* ── Alarm time types ── */
var ALARM_TTYPE=[{v:'lt',l:'本地時間 lt'},{v:'st',l:'伺服器時間 st'},{v:'et',l:'艾奧傑亞時間 et'}];

/* ── Hotbar subcommands ── */
var HOTBAR_SUBS=[
  {v:'set',l:'設置技能（將技能/道具/坐騎等放入指定位置）'},
  {v:'change',l:'更換（切換到指定編號熱鍵欄）'},
  {v:'copy',l:'複製（複製熱鍵欄內容）'},
  {v:'display',l:'顯示（開關指定熱鍵欄顯示）'},
  {v:'share',l:'共通（設定全職業共通）'},
  {v:'remove',l:'清除（解除熱鍵欄上的技能）'}
];

/* ── Hotbar set item types ── */
var HOTBAR_SET_TYPES=[
  {v:'action',l:'職業技能 action'},
  {v:'blueaction',l:'青魔法技能 blueaction'},
  {v:'general',l:'通用技能 general'},
  {v:'item',l:'道具 item'},
  {v:'emote',l:'情感動作 emote'},
  {v:'buddy',l:'搭擋技能 buddy'},
  {v:'pet',l:'召喚獸技能 pet'},
  {v:'minion',l:'寵物 minion'},
  {v:'mount',l:'坐騎 mount'},
  {v:'marking',l:'目標標記 marking'},
  {v:'waymark',l:'場景標記 waymark'}
];
var HOTBAR_SET_TYPES_PVP=[
  {v:'action',l:'PvP技能 action'},
  {v:'general',l:'通用技能 general'},
  {v:'item',l:'道具 item'},
  {v:'emote',l:'情感動作 emote'},
  {v:'buddy',l:'搭擋技能 buddy'},
  {v:'pet',l:'召喚獸技能 pet'},
  {v:'minion',l:'寵物 minion'},
  {v:'mount',l:'坐騎 mount'},
  {v:'marking',l:'目標標記 marking'},
  {v:'waymark',l:'場景標記 waymark'}
];

/* ── Chatlog subcommands ── */
var CHATLOG_SUBS=[
  {v:'fontsize',l:'字體大小'},
  {v:'time_onoff',l:'時間顯示 開/關'},
  {v:'time_format',l:'時間格式 12/24小時'},
  {v:'time_base',l:'時間基準 本地/伺服器'},
  {v:'call',l:'提示音設定'}
];
/* ── 主選單視窗開關清單 ── */
var WINDOW_LIST=[
  {v:'alist',l:'技能菜單 /alist',g:'角色／裝備'},
  {v:'gear',l:'角色 /gear',g:'角色／裝備'},
  {v:'armoury',l:'兵裝庫 /armoury',g:'角色／裝備'},
  {v:'bag',l:'物品（背包）/bag',g:'角色／裝備'},
  {v:'saddlebag',l:'陸行鳥鞍囊 /saddlebag',g:'角色／裝備'},
  {v:'comp',l:'搭檔 /comp',g:'角色／裝備'},
  {v:'mountguide',l:'坐騎一覽 /mountguide',g:'角色／裝備'},
  {v:'minionguide',l:'寵物一覽 /minionguide',g:'角色／裝備'},
  {v:'fashionguide',l:'時尚配件一覽 /fashionguide',g:'角色／裝備'},
  {v:'pvpp',l:'對戰資料 /pvpp',g:'角色／裝備'},
  {v:'achievements',l:'成就 /achievements',g:'角色／裝備'},
  {v:'currency',l:'貨幣一覽 /currency',g:'角色／裝備'},
  {v:'recommended',l:'推薦任務 /recommended',g:'角色／裝備'},
  {v:'coll',l:'重要物品 /coll',g:'角色／裝備'},
  {v:'kitem',l:'任務道具 /kitem',g:'角色／裝備'},
  {v:'journal',l:'日誌 /journal',g:'任務／地圖'},
  {v:'finder',l:'任務搜尋器 /finder',g:'任務／地圖'},
  {v:'timers',l:'任務情報 /timers',g:'任務／地圖'},
  {v:'rfinder',l:'大型任務搜尋器 /rfinder',g:'任務／地圖'},
  {v:'record',l:'任務回顧 /record',g:'任務／地圖'},
  {v:'ng+',l:'昔日重現模式 /ng+',g:'任務／地圖'},
  {v:'gdutykey',l:'任務通用鍵 /gdutykey',g:'任務／地圖'},
  {v:'hlog',l:'討伐筆記 /hlog',g:'任務／地圖'},
  {v:'sightseeinglog',l:'探索筆記 /sightseeinglog',g:'任務／地圖'},
  {v:'clog',l:'製作筆記 /clog',g:'任務／地圖'},
  {v:'glog',l:'採集筆記 /glog',g:'任務／地圖'},
  {v:'flog',l:'釣魚筆記 /flog',g:'任務／地圖'},
  {v:'fg',l:'魚類圖鑑 /fg',g:'任務／地圖'},
  {v:'orchestrion',l:'管弦樂琴 /orchestrion',g:'任務／地圖'},
  {v:'challengelog',l:'挑戰筆記 /challengelog',g:'任務／地圖'},
  {v:'map',l:'地圖 /map',g:'任務／地圖'},
  {v:'teleport',l:'傳送 /teleport',g:'任務／地圖'},
  {v:'return',l:'返回 /return',g:'任務／地圖'},
  {v:'acurrent',l:'風脈泉 /acurrent',g:'任務／地圖'},
  {v:'mountspeed',l:'坐騎速度 /mountspeed',g:'任務／地圖'},
  {v:'pfinder',l:'隊員招募 /pfinder',g:'小隊／社群'},
  {v:'fsfinder',l:'同好招募 /fsfinder',g:'小隊／社群'},
  {v:'elist',l:'情感動作 /elist',g:'小隊／社群'},
  {v:'fccmd',l:'部隊命令 /fccmd',g:'小隊／社群'},
  {v:'hou',l:'房屋 /hou',g:'小隊／社群'},
  {v:'pvpteamcmd',l:'戰隊命令 /pvpteamcmd',g:'小隊／社群'},
  {v:'lcmd',l:'通訊貝命令 /lcmd',g:'小隊／社群'},
  {v:'cwlcmd',l:'跨服貝命令 /cwlcmd',g:'小隊／社群'},
  {v:'fs',l:'同好會 /fs',g:'小隊／社群'},
  {v:'contactlist',l:'戰友列表 /contactlist',g:'小隊／社群'},
  {v:'support',l:'服務台 /support',g:'系統／設定'},
  {v:'officialsite',l:'官方網站 /officialsite',g:'系統／設定'},
  {v:'pguide',l:'資訊中心 /pguide',g:'系統／設定'},
  {v:'activehelp',l:'新手指南 /activehelp',g:'系統／設定'},
  {v:'cconfig',l:'角色設置 /cconfig',g:'系統／設定'},
  {v:'sconfig',l:'系統設置 /sconfig',g:'系統／設定'},
  {v:'hudlayout',l:'界面設置 /hudlayout',g:'系統／設定'},
  {v:'macros',l:'用戶宏 /macros',g:'系統／設定'},
  {v:'keyconfig',l:'鍵位設置 /keyconfig',g:'系統／設定'},
  {v:'lcolor',l:'信息顏色 /lcolor',g:'系統／設定'}
];
var CHATLOG_CH=[
  {v:'t',l:'悄悄話 t（Tell，省略時預設）'},{v:'emote',l:'情感動作 emote'},
  {v:'p',l:'小隊 p'},{v:'fc',l:'部隊 fc'},
  {v:'al',l:'團隊 al'},{v:'new',l:'新人頻道 new'},
  {v:'pvpteam',l:'戰隊 pvpteam'},
  {v:'l1',l:'通訊貝1 l1'},{v:'l2',l:'通訊貝2 l2'},
  {v:'l3',l:'通訊貝3 l3'},{v:'l4',l:'通訊貝4 l4'},
  {v:'l5',l:'通訊貝5 l5'},{v:'l6',l:'通訊貝6 l6'},
  {v:'l7',l:'通訊貝7 l7'},{v:'l8',l:'通訊貝8 l8'},
  {v:'cwl',l:'跨服通訊貝 cwl（不分編號，統一設定）'}
];

/* ── Categories ── */
var CATS=[
  {id:'chat',   icon:'💬',label:'說話 / 通知',     desc:'聊天、廣播、悄悄話'},
  {id:'emote',  icon:'🎭',label:'情感動作',         desc:'各類情感動作、自訂表演文字、動作記錄顯示'},
  {id:'skill',  icon:'⚔', label:'技能',             desc:'施放職業技能、青魔法、對戰技能、搭檔／召喚獸技能'},
  {id:'item',   icon:'🎒',label:'道具',             desc:'使用道具、整理背包、道具檢索'},
  {id:'target', icon:'🎯',label:'目標操作',         desc:'選中、標記、焦點目標、場景標記'},
  {id:'combat', icon:'🛡',label:'戰鬥設定',         desc:'目標設定、鎖定、決鬥、等級同步'},
  {id:'timer',  icon:'⏱', label:'計時 / 通報 / 骰子',desc:'倒計時、準備確認、骰子、鬧鐘'},
  {id:'move',   icon:'🚶',label:'角色 / 移動',     desc:'移動、換裝、拔刀收刀'},
  {id:'pet',    icon:'🐉',label:'召喚獸 / 坐騎',   desc:'坐騎、寵物、召喚獸投影與尺寸'},
  {id:'camera', icon:'📷',label:'鏡頭 / 拍照',     desc:'集體動作、觀景、鏡頭控制'},
  {id:'party',  icon:'👥',label:'小隊 / 社交',     desc:'組隊、邀請、好友黑名單、搜尋玩家'},
  {id:'status', icon:'👤',label:'狀態 / 身分',     desc:'在線狀態、組隊招募、稱號'},
  {id:'display',icon:'🖥',label:'介面 / 顯示',     desc:'UI視窗開關、名牌、熱鍵欄、顯示設定'},
  {id:'hotbar', icon:'📋',label:'熱鍵設定',         desc:'熱鍵欄操作、十字熱鍵、PvP熱鍵'},
  {id:'av',     icon:'🔊',label:'畫面 / 音效',     desc:'圖像預設、音量、背景音樂'},
  {id:'magia',  icon:'🔮',label:'魔素板',           desc:'魔素板旋轉與屬性切換'},
  {id:'system', icon:'🎲',label:'雜項 / 系統',     desc:'遊戲時間、登出、副本檢查'},
  {id:'macro',  icon:'🔧',label:'巨集設定',         desc:'圖示、鎖定、等待'},
  {id:'custom', icon:'✎', label:'自訂行',           desc:'直接輸入任何完整指令'}
];

/* ── Type definitions (id, category, icon, label) ── */
var TDEFS={
  /* ── 說話 / 通知 ── */
  chat:{cat:'chat',icon:'💬',label:'聊天訊息',kw:CH.map(function(c){return c.l;}).join(' ')},
  chatcountdown:{cat:'chat',icon:'📢',label:'多行聊天（建構器）',isBlock:true},
  echo:{cat:'chat',icon:'🔊',label:'默語（僅自己）/e'},
  tell:{cat:'chat',icon:'✉',label:'悄悄話 /t'},
  reply:{cat:'chat',icon:'↩',label:'回覆悄悄話 /r'},
  em:{cat:'emote',icon:'🎭',label:'感情表現（自訂文字）/em'},
  cl:{cat:'chat',icon:'🗑',label:'清除訊息記錄 /cl'},
  emotelog:{cat:'emote',icon:'📜',label:'情感動作記錄顯示 /emotelog'},
  cth:{cat:'chat',icon:'🗑',label:'清除悄悄話記錄 /cth'},
  qchat:{cat:'chat',icon:'💢',label:'快捷發言 /qchat（群狼盛宴）'},
  /* ── 技能 / 道具 ── */
  skill:{cat:'skill',icon:'⚔',label:'職業技能 /ac',isBlock:true},
  generalskill:{cat:'skill',icon:'✦',label:'通用技能 /gaction',isBlock:true},
  blueaction:{cat:'skill',icon:'🔵',label:'青魔法技能 /blueaction',isBlock:true},
  pvpaction:{cat:'skill',icon:'🏆',label:'PvP技能 /pvpac',isBlock:true},
  petaction:{cat:'skill',icon:'🐉',label:'召喚獸技能 /pac',isBlock:true},
  companionaction:{cat:'skill',icon:'🐦',label:'搭擋技能 /cac',isBlock:true},
  item:{cat:'item',icon:'🧪',label:'使用道具 /item',isBlock:true},
  emote:{cat:'emote',icon:'✨',label:'情感動作 /emote',kw:EMOTES.map(function(e){return e.l+' /'+e.v;}).join(' ')},
  abilityrotation:{cat:'skill',icon:'🔄',label:'能力技輪換（建構器）',isBlock:true},
  itemsort:{cat:'item',icon:'📦',label:'道具整理（建構器）',isBlock:true},
  itemsearch:{cat:'item',icon:'🔎',label:'道具檢索 /isearch'},
  recast:{cat:'skill',icon:'⏳',label:'複唱時間 /recast'},
  aaction:{cat:'skill',icon:'➕',label:'額外技能 /aaction'},
  bluespellbook:{cat:'skill',icon:'📖',label:'青魔法書 /bluespellbook',isBlock:true},
  apa:{cat:'skill',icon:'🏅',label:'對戰額外技能 /apa'},
  /* ── 主選單視窗開關 ── */
  openwindow:{cat:'display',icon:'🗔',label:'開啟選單視窗'},
  /* ── 目標操作 ── */
  targeting:{cat:'target',icon:'🎯',label:'選中目標'},
  check:{cat:'target',icon:'🔍',label:'查看目標情報 /c'},
  trade:{cat:'target',icon:'🤝',label:'交易 /trade'},
  assist:{cat:'target',icon:'↗',label:'目標的目標 /as'},
  focustarget:{cat:'target',icon:'◎',label:'焦點目標 /focustarget'},
  facetarget:{cat:'target',icon:'↕',label:'轉向目標 /ft'},
  lockon:{cat:'target',icon:'🔒',label:'鎖定目標 /lo'},
  marking:{cat:'target',icon:'🏷',label:'目標標記 /mk',isBlock:true},
  waymark:{cat:'target',icon:'📍',label:'場景標記 /wmark',isBlock:true},
  /* ── 計時 / 通報 / 骰子 ── */
  countdown_sys:{cat:'timer',icon:'⏰',label:'倒計時 /cd'},
  readycheck:{cat:'timer',icon:'✅',label:'準備確認 /rcheck',isBlock:true},
  ready:{cat:'timer',icon:'👍',label:'準備完畢 /rd'},
  notready:{cat:'timer',icon:'👎',label:'未準備好 /nr'},
  random:{cat:'timer',icon:'🎲',label:'隨機數字 /random'},
  alarm:{cat:'timer',icon:'🔔',label:'鬧鐘 /alarm',isBlock:true},
  dice:{cat:'timer',icon:'🎰',label:'骰子 /dice'},
  /* ── 角色 / 移動 ── */
  automove:{cat:'move',icon:'🚶',label:'自動前進 /automove'},
  follow:{cat:'move',icon:'👣',label:'跟隨 /follow'},
  battlemode:{cat:'move',icon:'⚔',label:'拔刀/收刀 /bm'},
  gearset:{cat:'move',icon:'🗡',label:'裝備套裝 /gs',isBlock:true},
  visor:{cat:'move',icon:'⛑',label:'頭部裝備 /visor'},
  fashion:{cat:'move',icon:'👒',label:'時尚配件 /fashion'},
  /* ── 召喚獸 / 坐騎 ── */
  mount:{cat:'pet',icon:'🐴',label:'乘坐坐騎 /mount'},
  minion:{cat:'pet',icon:'🐣',label:'召喚寵物 /minion'},
  petsize:{cat:'pet',icon:'📐',label:'召喚獸尺寸 /petsize'},
  petmirage:{cat:'pet',icon:'🌈',label:'召喚獸投影 /petglamour'},
  ridepillion:{cat:'pet',icon:'🏍',label:'共同騎乘 /ridepillion'},
  /* ── 鏡頭 / 拍照 ── */
  gpose:{cat:'camera',icon:'📷',label:'集體動作 /gpose'},
  facecamera:{cat:'camera',icon:'🎥',label:'面向鏡頭 /facecamera'},
  idlingcamera:{cat:'camera',icon:'🌅',label:'觀景視角 /icam'},
  tiltcamera:{cat:'camera',icon:'📐',label:'第三人稱俯視角度 /tiltcamera'},
  /* ── 狀態 / 身分 ── */
  busy:{cat:'status',icon:'🔴',label:'忙碌狀態 /busy'},
  away:{cat:'status',icon:'🌙',label:'離開狀態 /afk'},
  roleplaying:{cat:'status',icon:'🎭',label:'角色扮演中 /roleplaying'},
  lfp:{cat:'status',icon:'👥',label:'希望組隊 /lfp',isBlock:true},
  lfm:{cat:'status',icon:'💎',label:'接受鑲嵌請求 /lfm'},
  scomment:{cat:'status',icon:'💬',label:'個性簽名 /scomment'},
  bstatus:{cat:'status',icon:'🌱',label:'新人狀態 /nastatus'},
  nnetwork:{cat:'status',icon:'🌐',label:'自動加入新人頻道 /nnetwork'},
  nnetworkinvitation:{cat:'status',icon:'✉',label:'接受新人頻道邀請 /nnetworkinvitation'},
  nnetworkleave:{cat:'status',icon:'🚪',label:'退出新人頻道 /nnetworkleave'},
  search:{cat:'party',icon:'🔍',label:'搜尋玩家 /sea'},
  title:{cat:'status',icon:'🏆',label:'稱號 /title'},
  /* ── 小隊 / 社交 ── */
  partycmd:{cat:'party',icon:'⚙',label:'小隊指令 /pcmd'},
  join:{cat:'party',icon:'✅',label:'接受組隊邀請 /join'},
  decline:{cat:'party',icon:'❌',label:'拒絕組隊邀請 /decline'},
  invite:{cat:'party',icon:'📨',label:'邀請玩家 /invite'},
  kick:{cat:'party',icon:'👢',label:'移除隊員 /kick'},
  leader:{cat:'party',icon:'👑',label:'轉讓隊長 /leader'},
  leave:{cat:'party',icon:'🚪',label:'退隊 /leave'},
  psort:{cat:'party',icon:'📊',label:'小隊排序 /psort'},
  meldrequest:{cat:'party',icon:'💠',label:'委託鑲嵌 /meldrequest'},
  friendlist:{cat:'party',icon:'🧑‍🤝‍🧑',label:'好友命令 /flist',isBlock:true},
  blacklist:{cat:'party',icon:'🚫',label:'黑名單命令 /blist',isBlock:true},
  /* ── 戰鬥設定 ── */
  levelsync:{cat:'combat',icon:'📊',label:'等級同步 /levelsync'},
  statusoff:{cat:'combat',icon:'✗',label:'解除強化狀態 /statusoff'},
  autolockon:{cat:'combat',icon:'🔐',label:'自動鎖定 /autolockon'},
  autofacetarget:{cat:'combat',icon:'↩',label:'自動轉向目標 /autofacetarget'},
  autotarget:{cat:'combat',icon:'🎯',label:'自動選中 /autotarget'},
  targetself:{cat:'combat',icon:'🙋',label:'選中自己 /targetself'},
  groundclick:{cat:'combat',icon:'🖱',label:'場景點擊取消選中 /groundclick'},
  duelswitch:{cat:'combat',icon:'⚔',label:'決鬥申請攔截 /duelswitch'},
  actionerror:{cat:'combat',icon:'⚠',label:'技能錯誤提示 /aerror'},
  recasterror:{cat:'combat',icon:'🔁',label:'複唱錯誤提示 /rerror'},
  /* ── 介面 / 顯示 ── */
  hud:{cat:'display',icon:'🖥',label:'UI視窗開關 /hud',isBlock:true},
  battleeffect:{cat:'display',icon:'💥',label:'戰鬥特效 /battleeffect'},
  nameplatedisp:{cat:'display',icon:'🪧',label:'名牌顯示時機 /nameplatedisp'},
  nameplatetype:{cat:'display',icon:'🏷',label:'名牌顯示格式 /nameplatetype'},
  legacymark:{cat:'display',icon:'✴',label:'十二神印記 /lmark'},
  displayhead:{cat:'display',icon:'⛑',label:'顯示頭部裝備 /displayhead'},
  displayarms:{cat:'display',icon:'🗡',label:'顯示武器 /displayarms'},
  autosheathe:{cat:'display',icon:'🔙',label:'自動收回武器 /ashathe'},
  jobhudmode:{cat:'display',icon:'📊',label:'職業量譜模式 /jobhudmode'},
  hudreset:{cat:'display',icon:'↺',label:'重置介面 /hudreset'},
  uireset:{cat:'display',icon:'🔄',label:'重置介面窗口 /uireset'},
  uiscale:{cat:'display',icon:'🔍',label:'介面縮放 /uiscale'},
  chatlog:{cat:'display',icon:'💬',label:'消息視窗設定 /chatlog',isBlock:true},
  targetring:{cat:'display',icon:'⭕',label:'目標環 /targetring'},
  targetline:{cat:'display',icon:'➖',label:'目標線 /targetline'},
  linkline:{cat:'display',icon:'🔗',label:'聯繫線 /linkline'},
  /* ── 熱鍵設定 ── */
  hotbar:{cat:'hotbar',icon:'📋',label:'熱鍵欄 /hotbar',isBlock:true},
  pvphotbar:{cat:'hotbar',icon:'⚔',label:'對戰熱鍵欄 /pvphotbar',isBlock:true},
  chotbar:{cat:'hotbar',icon:'🎮',label:'十字熱鍵欄 /chotbar',isBlock:true},
  pvpchotbar:{cat:'hotbar',icon:'🎮',label:'對戰十字熱鍵欄 /pvpchotbar',isBlock:true},
  chotbardisplay:{cat:'hotbar',icon:'👁',label:'一直顯示十字熱鍵欄 /chotbardisplay'},
  chotbartype:{cat:'hotbar',icon:'🕹',label:'十字熱鍵欄操作類型 /chotbartype'},
  /* ── 畫面 / 音效 ── */
  gpreset:{cat:'av',icon:'🖼',label:'圖像設定預設 /gpreset'},
  mastervolume:{cat:'av',icon:'🔈',label:'整體音量 /mastervolume'},
  bgm:{cat:'av',icon:'🎵',label:'背景音樂 /bgm'},
  soundeffects:{cat:'av',icon:'💥',label:'音效 /soundeffects'},
  voice:{cat:'av',icon:'🗣',label:'語音 /voice'},
  systemsounds:{cat:'av',icon:'🔔',label:'系統音 /systemsounds'},
  ambientsounds:{cat:'av',icon:'🌿',label:'環境音 /ambientsounds'},
  soundeffectsself:{cat:'av',icon:'🙋',label:'自身音效 /soundeffectsself'},
  soundeffectsparty:{cat:'av',icon:'👥',label:'小隊音效 /soundeffectsparty'},
  soundeffectsother:{cat:'av',icon:'🧑',label:'他人音效 /soundeffectsother'},
  performsounds:{cat:'av',icon:'🎹',label:'演奏音量 /performsounds'},
  mountbgm:{cat:'av',icon:'🎶',label:'坐騎音樂 /mountbgm'},
  systemsoundsspeaker:{cat:'av',icon:'📢',label:'揚聲器系統音 /systemsoundsspeaker'},
  /* ── 魔素板 ── */
  magiaright:{cat:'magia',icon:'🔮',label:'魔素板順時旋轉 /magiaright'},
  magialeft:{cat:'magia',icon:'🔮',label:'魔素板逆時旋轉 /magialeft'},
  magiaattack:{cat:'magia',icon:'⚔',label:'魔素板攻勢 /magiaattack'},
  magiadefense:{cat:'magia',icon:'🛡',label:'魔素板守勢 /magiadefense'},
  magiaauto:{cat:'magia',icon:'🔄',label:'魔素板自動 /magiaauto'},
  /* ── 雜項 / 系統 ── */
  playtime:{cat:'system',icon:'🕐',label:'遊戲時間 /ptime'},
  logout:{cat:'system',icon:'🚪',label:'標題畫面 /logout'},
  shutdown:{cat:'system',icon:'⏻',label:'關閉遊戲 /shutdown'},
  instance:{cat:'system',icon:'🗺',label:'副本區檢查 /instance'},
  patchnote:{cat:'system',icon:'📋',label:'版本更新筆記 /patchnote'},
  /* ── 巨集設定 ── */
  micon:{cat:'macro',icon:'🖼',label:'巨集圖示 /micon'},
  mlock:{cat:'macro',icon:'🔒',label:'巨集鎖定 /mlock'},
  merror_line:{cat:'macro',icon:'⚠',label:'錯誤提示設定 /merror'},
  wait_line:{cat:'macro',icon:'⏱',label:'等待（獨立行）/wait'},
  /* ── 自訂行 ── */
  custom:{cat:'custom',icon:'✎',label:'自訂行（自由輸入）'}
};

/* ── Templates ── */
var TEMPLATES=[
  {id:'chat',icon:'💬',label:'倒數公告',desc:'3秒倒數通知小隊出發',
   lines:[
    {type:'mlock',params:{},note:'鎖定巨集防止中斷'},
    {type:'chat',params:{channel:'p',message:'準備好了嗎？',inlineWait:1},note:''},
    {type:'chat',params:{channel:'p',message:'3...',inlineWait:1},note:''},
    {type:'chat',params:{channel:'p',message:'2...',inlineWait:1},note:''},
    {type:'chat',params:{channel:'p',message:'1...',inlineWait:1},note:''},
    {type:'chat',params:{channel:'p',message:'出發！'},note:''}
  ]},
  {id:'aitank',icon:'🤖',label:'人工智慧坦克系統',desc:'讓隊友選擇拉怪方式',
   lines:[
    {type:'mlock',params:{},note:'鎖定巨集防止中斷'},
    {type:'chat',params:{channel:'p',message:'你好！歡迎使用人工智能坦克系統',se:'<se.1>'},note:'第1行（含音效）'},
    {type:'chat',params:{channel:'p',message:'請選擇您的坦克'},note:'第2行'},
    {type:'chat',params:{channel:'p',message:'1.疾跑狂衝，一波到底。'},note:'第3行'},
    {type:'chat',params:{channel:'p',message:'2.穩扎穩打，兩波一停。'},note:'第4行'},
    {type:'chat',params:{channel:'p',message:'3.新手奶媽，一波就行。'},note:'第5行'},
    {type:'chat',params:{channel:'p',message:'不選擇默認為2，很高興見到你。'},note:'第6行（可自行修改內容）'},
  ]},
  {id:'skill',icon:'⚔',label:'技能使用',desc:'施放技能，可附加通知選項',
   lines:[
    {type:'micon',params:{miconName:'',miconType:'action'},note:'技能圖示（同巨集第一個生效）'},
    {type:'skill',params:{skillName:'',target:'<t>',inlineWait:0,
      preAnnounce:false,preAnnounceMsg:'即將施放技能！',preAnnounceChannel:'p',preAnnounceWait:2,preAnnounceSe:'',
      postNotify:false,postNotifyMsg:'技能已施放！',postNotifyChannel:'p',postNotifySe:'',
      postEcho:false,postEchoMsg:'技能使用完畢',postEchoSe:'',
      recastNotify:false,recastPrefix:'',recastSuffix:' 秒',recastChannel:'e',recastSe:''},note:''}
  ]},
  {id:'abilityrotation',icon:'🔄',label:'能力技輪換',desc:'多個能力技輪番施放',
   lines:[
    {type:'merror_line',params:{onOff:'off'},note:'建議關閉錯誤提示，避免冷卻中的訊息刷屏'},
    {type:'micon',params:{miconName:'',miconType:'action'},note:''},
    {type:'abilityrotation',params:{skills:['','',''],target:'<t>',inlineWait:0},note:'不斷按下此巨集可依序施放已冷卻的技能'}
  ]},
  {id:'gearset',icon:'🗡',label:'裝備切換',desc:'切換套裝並顯示圖示和確認',
   lines:[
    {type:'gearset',params:{gsAction:'change',gsNumber:'1',
      addMicon:true,miconType:'gearset',addEcho:true,echoMsg:'已切換至套裝 1',echoSe:''},note:''}
  ]},
  {id:'itemsort',icon:'📦',label:'道具整理',desc:'整理背包與兵裝庫',
   lines:[
    {type:'itemsort',params:{
      areas:['inventory','armoury'],
      conditions:[{criterion:'ilv',order:'des'},{criterion:'category',order:'asc'}],
      useClear:true,echoMsg:'整理完成！',echoSe:'<se.1>'},note:''}
  ]},
  {id:'marking',icon:'🏷',label:'目標標記',desc:'設定順序標記',
   lines:[
    {type:'mlock',params:{},note:''},
    {type:'marking',params:{markType:'attack1',markTarget:'<t>',notify:false},note:'攻擊標記1'},
    {type:'marking',params:{markType:'attack2',markTarget:'<t>',notify:false},note:'攻擊標記2'},
    {type:'marking',params:{markType:'attack3',markTarget:'<t>',notify:false},note:'攻擊標記3'},
  ]},
  {id:'kaomoji',icon:'🐱',label:'自訂顏文字',desc:'顏文字圖案，可自由修改',
   lines:[
    {type:'chat',params:{channel:'p',message:'                           \u25cf'},note:'第1行'},
    {type:'chat',params:{channel:'p',message:'                    /\\__\\__/\\'},note:'第2行'},
    {type:'chat',params:{channel:'p',message:'                  /                   \\'},note:'第3行'},
    {type:'chat',params:{channel:'p',message:'               \\( \uff3f  \u22ef \u25cf \u22ef \uff3f)/'},note:'第4行（可繼續新增行）'},
  ]},
  {id:'emote',icon:'✨',label:'情感動作',desc:'播放情感動作',
   lines:[
    {type:'micon',params:{miconName:'bow',miconType:'emote'},note:''},
    {type:'emote',params:{emoteName:'bow',motionOnly:false,
      addEm:false,emText:'向 <t> 深深一鞠躬。'},note:''}
  ]},
  {id:'em',icon:'🎭',label:'感情表現',desc:'自訂文字搭配情感動作',
   lines:[
    {type:'em',params:{text:'向 <t> 深深一鞠躬。',addMotion:true,motionEmote:'bow'},note:'可修改文字和動作'},
  ]},
  {id:'buzu',icon:'📣',label:'友好部族喊話',desc:'速解友好喊話任務用',
   lines:[
    {type:'chat',params:{channel:'s',message:'乘風而起 / 展翅高飛 / 翱翔天際 / 不屈之翼 / 追夢無限 / 大鯰魚保佑 / 啦哩吼 / 啦嘿 / 夢想加倍 / 超級小可愛'},note:'第1行'},
    {type:'chat',params:{channel:'s',message:'河狸 / 咖啡時間 / 我就是人趣諸神 / 線軸 / 烏姆·阿拉 / 有咕波果哦 / 燉菜做好了 / 新鮮蔬菜上架了'},note:'第2行'},
  ]},
  {id:'blank',icon:'✦',label:'空白自訂',desc:'從零開始',lines:[]},
  {id:'target_report',icon:'📍',label:'通報目標血量坐標',desc:'快速通報目標訊息',
   lines:[
    {type:'chat',params:{channel:'p',message:'<t> 【HP：<targethpp>】 <pos>'},note:'通報目標血量與坐標，頻道可自行更改'}
  ]}
];

/* ── Pronouns ── */
var PRONS=[
  {s:'<t>',d:'當前目標'},{s:'<me>',d:'自己'},{s:'<f>',d:'焦點目標'},
  {s:'<tt>',d:'目標的目標'},{s:'<lt>',d:'上次目標'},{s:'<mo>',d:'滑鼠指向的角色'},
  {s:'<r>',d:'最後傳悄悄話的人'},{s:'<le>',d:'最後選中的敵人'},
  {s:'<la>',d:'最後攻擊你的敵人'},{s:'<c>',d:'搭擋'},{s:'<p>',d:'召喚獸'},
  {s:'<1>',d:'小隊1號'},{s:'<2>',d:'小隊2號'},{s:'<3>',d:'小隊3號'},
  {s:'<4>',d:'小隊4號'},{s:'<5>',d:'小隊5號'},{s:'<6>',d:'小隊6號'},
  {s:'<7>',d:'小隊7號'},{s:'<8>',d:'小隊8號'},
  {s:'<attack1>',d:'攻擊標記1'},{s:'<attack2>',d:'攻擊標記2'},
  {s:'<bind1>',d:'止步標記1'},{s:'<stop1>',d:'禁止標記1'},
  {s:'<square>',d:'方塊標記'},{s:'<circle>',d:'圓圈標記'},
  {s:'<cross>',d:'叉標記'},{s:'<triangle>',d:'三角標記'},
  {s:'<e1>',d:'PvP敵方1號'},{s:'<e2>',d:'PvP敵方2號'},
  {s:'<flag>',d:'地圖標記坐標'},
  {s:'<hp>',d:'HP數值'},{s:'<hpp>',d:'HP百分比'},
  {s:'<mp>',d:'MP數值'},{s:'<mpp>',d:'MP百分比'},
  {s:'<job>',d:'當前職業等級'},{s:'<pos>',d:'當前位置坐標'},
  {s:'<targethpp>',d:'目標HP%'},{s:'<focushpp>',d:'焦點目標HP%'},
  {s:'<targetclass>',d:'目標職業等級'},{s:'<buddyhp>',d:'搭擋HP'},
  {s:'<se.1>',d:'播放音效1'},{s:'<recast."技能名">',d:'技能剩餘冷卻秒數'},
  {s:'<wait.1>',d:'等待1秒（內嵌於行末）'}
];

/* ════════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════════ */
function cc(s){var n=0;for(var i=0;i<s.length;i++){var cp=s.codePointAt(i);n+=cp>0x7F?3:1;if(cp>0xFFFF)i++;/* 代理對佔了2個code unit，跳過第二半避免重複計算 */}return n;}
function dc(o){return JSON.parse(JSON.stringify(o));}
function tv(p,key,ckey){var v=p[key];return v==='custom'?(p[ckey]||'<t>'):v||'';}
function seStr(se){return se?(' '+se):'';}
function waitStr(w){var n=parseInt(w)||0;return n>0?'<wait.'+n+'>':'';}
function buildLines(line){
  var p=line.params||{}, r=parseInt(line.repeat)||1, out=buildLinesInner(line);
  if(out.length===1&&r>1){var arr=[];for(var i=0;i<r;i++)arr.push(out[0]);return arr;}
  return out;
}

function buildLinesInner(line){
  var p=line.params||{};
  switch(line.type){
    /* ── 說話 / 通知（原有）── */
    case 'chat':{
      var msg='/'+(p.channel||'p')+' '+(p.message||'');
      if(p.se) msg+=seStr(p.se);
      var out=[];
      msg+=waitStr(p.inlineWait);
      out.push(msg);
      return out;
    }
    case 'chatcountdown':{
      var out=[];
      var ch=p.channel||'p';
      var msgs=p.msgs||[];
      msgs.forEach(function(m){
        var rowCh=m.channel||ch;
        var line2='/'+rowCh+' '+(m.text||'');
        if(m.se) line2+=seStr(m.se);
        line2+=waitStr(m.wait);
        out.push(line2);
      });
      return out.length?out:[''];
    }
    case 'echo':{
      var msg='/e '+(p.message||'');
      if(p.se) msg+=seStr(p.se);
      return[msg];
    }
    case 'tell': return['/t '+(p.target||'')+' '+(p.message||'')];
    case 'reply': return['/r '+(p.message||'')];
    case 'cth': return['/cth'];
    case 'em':{
      var out=['/em '+(p.text||'')];
      if(p.addMotion){
        var motionCmd=p.motionEmote==='custom'?(p.motionCustom||''):p.motionEmote;
        if(motionCmd) out.unshift('/'+motionCmd+' motion');
      }
      return out;
    }
    /* ── 技能 / 道具（原有）── */
    case 'skill': case 'generalskill': case 'blueaction': case 'pvpaction':
    case 'petaction': case 'companionaction':{
      var cmdMap={skill:'/ac',generalskill:'/gaction',blueaction:'/blueaction',
        pvpaction:'/pvpac',petaction:'/pac',companionaction:'/cac'};
      var cmd=cmdMap[line.type];
      var out=[];
      if(p.preAnnounce){
        var pre='/'+( p.preAnnounceChannel||'p')+' '+(p.preAnnounceMsg||'');
        if(p.preAnnounceSe) pre+=seStr(p.preAnnounceSe);
        pre+=waitStr(p.preAnnounceWait);
        out.push(pre);
      }
      var skillTgt=p.groundOff?'gtoff':tv(p,'target','targetCustom');
      var skillLine=cmd+' "'+(p.skillName||'')+'"'+(line.type!=='companionaction'?' '+skillTgt:'');
      skillLine+=waitStr(p.inlineWait);
      out.push(skillLine);
      if(p.postNotify){
        var post='/'+( p.postNotifyChannel||'p')+' '+(p.postNotifyMsg||'');
        if(p.postNotifySe) post+=seStr(p.postNotifySe);
        out.push(post);
      }
      if(p.postEcho){
        var echo='/e '+(p.postEchoMsg||'');
        if(p.postEchoSe) echo+=seStr(p.postEchoSe);
        out.push(echo);
      }
      if(p.recastNotify){
        var pre2=p.recastPrefix||('【'+(p.skillName||'技能')+'】剩餘冷卻：');
        var suf=p.recastSuffix||' 秒';
        var rline='/'+( p.recastChannel||'e')+' '+pre2+'<recast."'+(p.skillName||'')+'">'+suf;
        if(p.recastSe) rline+=seStr(p.recastSe);
        out.push(rline);
      }
      return out.length?out:[''];
    }
    case 'item':{
      var out=['/item "'+(p.itemName||'')+'" '+tv(p,'target','targetCustom')];
      if(p.postEcho){
        var echo='/e '+(p.postEchoMsg||'已使用道具');
        if(p.postEchoSe) echo+=seStr(p.postEchoSe);
        out.push(echo);
      }
      return out;
    }
    case 'itemsearch': return['/isearch "'+(p.itemName||'')+'"'];
    case 'emote':{
      var en=p.emoteName==='custom'?(p.emoteCustom||''):p.emoteName;
      var out=['/'+en+(p.motionOnly?' motion':'')];
      if(p.addEm){
        var em='/em '+(p.emText||'');
        if(p.emSe) em+=seStr(p.emSe);
        out.push(em);
      }
      return out;
    }
    case 'abilityrotation':{
      var skills=p.skills||[];
      var tgt=tv(p,'target','targetCustom')||'<t>';
      var out=skills.map(function(s){
        if(!s) return null;
        var l='/ac "'+s+'" '+tgt;
        l+=waitStr(p.inlineWait);
        return l;
      }).filter(Boolean);
      return out.length?out:[''];
    }
    /* ── 目標操作（原有）── */
    case 'openwindow': return['/'+(p.winCmd||'bag')];
    case 'targeting':{
      var cmd=p.targetCmd||'/bt';
      var tgt=tv(p,'targetParam','targetParamCustom');
      return[tgt?cmd+' '+tgt:cmd];
    }
    case 'check':{
      var tgt=tv(p,'target','targetCustom');
      return[tgt?'/c '+tgt:'/c'];
    }
    case 'trade':{
      var tgt=tv(p,'target','targetCustom');
      return[tgt?'/trade '+tgt:'/trade'];
    }
    case 'assist': return['/as '+tv(p,'target','targetCustom')];
    case 'focustarget':{
      var tgt=tv(p,'target','targetCustom');
      return[tgt?'/focustarget '+tgt:'/focustarget'];
    }
    case 'facetarget': return['/ft'];
    case 'lockon':{
      var tgt=tv(p,'target','targetCustom');
      return[tgt?'/lo '+tgt:'/lo'];
    }
    case 'marking':{
      var out=[];
      if(p.markType==='clear'){out.push('/mk clear');return out;}
      out.push('/mk '+(p.markType||'attack1')+' '+tv(p,'markTarget','markTargetCustom'));
      if(p.notify){
        var n='/'+( p.notifyChannel||'p')+' '+(p.notifyMsg||'標記已設定！');
        if(p.notifySe) n+=seStr(p.notifySe);
        out.push(n);
      }
      return out;
    }
    case 'waymark':{
      var out=[];
      var act=p.waymarkAction||'toggle';
      if(act==='clear') out.push('/wmark clear');
      else if(act==='save') out.push('/wmark save '+(p.presetSlot||'1'));
      else if(act==='preset') out.push('/wmark preset '+(p.presetSlot||'1'));
      else if(act==='target') out.push('/wmark '+(p.waymarkName||'A')+' <t>');
      else out.push('/wmark '+(p.waymarkName||'A'));
      if(p.notify){
        var n='/'+( p.notifyChannel||'p')+' '+(p.notifyMsg||'場景標記已設置！');
        if(p.notifySe) n+=seStr(p.notifySe);
        out.push(n);
      }
      return out;
    }
    /* ── 計時 / 通報（原有）── */
    case 'countdown_sys':{
      return[p.secs?'/cd '+p.secs:'/cd'];
    }
    case 'readycheck':{
      var out=['/rcheck'];
      if(p.notify){
        var n='/'+( p.notifyChannel||'p')+' '+(p.notifyMsg||'準備確認！');
        if(p.notifySe) n+=seStr(p.notifySe);
        out.push(n);
      }
      return out;
    }
    case 'ready': return['/rd'];
    case 'notready': return['/nr'];
    /* ── 角色 / 移動（原有）── */
    case 'automove': return['/automove'];
    case 'follow':{
      var tgt=tv(p,'target','targetCustom');
      return[tgt?'/follow '+tgt:'/follow'];
    }
    case 'battlemode':{
      var t=p.toggle||'toggle';
      return[t==='draw'?'/bm draw':t==='sheathe'?'/bm sheathe':'/bm'];
    }
    case 'visor': return['/visor'];
    case 'fashion': return['/fashion "'+(p.itemName||'')+'"'];
    /* ── 召喚獸 / 坐騎（原有）── */
    case 'mount': return[p.mountName?'/mount "'+(p.mountName||'')+'"':'/mount'];
    case 'minion': return[p.minionName?'/minion "'+(p.minionName||'')+'"':'/minion'];
    /* ── 鏡頭 / 拍照（原有）── */
    case 'gpose': return['/gpose'];
    /* ── 介面 / 顯示（原有）── */
    case 'nameplatedisp':{
      var tgt=p.target||'all';
      var setting=p.setting||'1';
      return['/nameplatedisp '+tgt+' '+setting];
    }
    case 'nameplatetype':{
      var tgt2=p.target||'all';
      var fmt=p.setting||'1';
      return['/nameplatetype '+tgt2+' '+fmt];
    }
    case 'battleeffect':{
      var tgt=p.effTarget||'self';
      var type=p.effType||'all';
      return['/battleeffect '+tgt+' '+type];
    }
    case 'hud':{
      var wins=p.windows||[];
      var t=p.toggle||'toggle';
      var out=wins.map(function(w){
        return t==='toggle'?'/hud "'+w+'"':'/hud "'+w+'" '+t;
      });
      return out.length?out:['/hud'];
    }
    /* ── 熱鍵設定（原有）── */
    /* ── 角色套裝（原有）── */
    case 'gearset':{
      var out=[];
      var act=p.gsAction||'change';
      var gsCmd=act==='change'?'change':act==='save'?'save':act==='delete'?'delete':'view';
      var gsLine='/gs '+gsCmd+' '+(p.gsNumber||'1');
      if(act==='change'&&p.plateNumber) gsLine+=' '+p.plateNumber;
      out.push(gsLine);
      if(p.addEcho){
        var echo='/e '+(p.echoMsg||'已切換套裝');
        if(p.echoSe) echo+=seStr(p.echoSe);
        out.push(echo);
      }
      if(p.addMicon) out.push('/micon '+(p.gsNumber||'1')+' gearset');
      return out;
    }
    case 'itemsort':{
      var out=[];
      var areas=p.areas||[];
      var conds=p.conditions||[];
      areas.forEach(function(area){
        if(p.useClear!==false) out.push('/itemsort clear '+area);
        conds.forEach(function(c){
          out.push('/itemsort condition '+area+' '+c.criterion+(c.order?' '+c.order:''));
        });
        out.push('/itemsort execute '+area);
      });
      if(p.echoMsg){
        var echo='/e '+p.echoMsg;
        if(p.echoSe) echo+=seStr(p.echoSe);
        out.push(echo);
      }
      return out.length?out:[''];
    }
    /* ── 說話/通知 新增 ── */
    case 'cl': return['/cl'];
    case 'emotelog':{var elg=p.toggle||'toggle';return[elg==='toggle'?'/emotelog':'/emotelog '+elg];}
    case 'qchat':{
      var qc='/qchat "'+(p.name||'')+'"';
      if(p.target&&p.target!=='') qc+=' '+tv(p,'target','targetCustom');
      return[qc];
    }
    /* ── 技能/道具 新增 ── */
    case 'recast': return['/recast "'+(p.skillName||'')+'"'];
    case 'aaction':{
      var aa_name=p.skillName||'';
      if(aa_name==='clear') return['/aaction clear'];
      var aa_t=p.toggle||'toggle';
      return[aa_t==='toggle'?'/aaction "'+aa_name+'"':'/aaction "'+aa_name+'" '+aa_t];
    }
    case 'bluespellbook':{
      var bsb=p.sub||'toggle';
      if(bsb==='toggle') return['/bluespellbook'];
      if(bsb==='clear') return['/bluespellbook clear'];
      if(bsb==='preset') return['/bluespellbook preset '+(p.presetNum||'1')];
      var bsb_t=p.spellToggle||'toggle';
      var bsb_out=[];
      (p.spells||['']).forEach(function(s){
        if(!s) return;
        bsb_out.push(bsb_t==='toggle'?'/bluespellbook set "'+s+'"':'/bluespellbook set "'+s+'" '+bsb_t);
      });
      return bsb_out.length?bsb_out:['/bluespellbook set ""'];
    }
    case 'apa': return['/apa "'+(p.skill1||'')+'" "'+(p.skill2||'')+'"'];
    /* ── 計時/通報/骰子 新增 ── */
    case 'alarm':{
      var al=p.alarmSub||'open';
      if(al==='open') return['/alarm'];
      if(al==='clear') return['/alarm clear'];
      var al_out=[];
      var al_name=p.alarmName?'"'+p.alarmName+'"':'""';
      var al_tt=p.timeType||'lt';
      var al_time=p.alarmTime||'0000';
      var al_line='/alarm '+al_name+' '+al_tt;
      if(p.repeat) al_line+=' rp';
      al_line+=' '+al_time;
      if(p.advance&&parseInt(p.advance)>0) al_line+=' '+p.advance;
      al_out.push(al_line);
      return al_out;
    }
    case 'dice':{
      var dc_out='/dice';
      if(p.channel) dc_out='/dice '+(p.channel);
      if(p.max) dc_out+=' '+p.max;
      return[dc_out];
    }
    /* ── 召喚獸/坐騎 新增 ── */
    case 'petsize':{
      var ps_pet=p.petName||'all';
      var ps_size=p.size||'toggle';
      return[ps_size==='toggle'?'/petsize '+ps_pet:'/petsize '+ps_pet+' '+ps_size];
    }
    case 'petmirage':{
      var pm_pet=p.petName||'carbuncle';
      if(p.clear) return['/petglamour "'+pm_pet+'"'];
      return['/petglamour "'+pm_pet+'" "'+(p.appearance||'')+'"'];
    }
    case 'ridepillion':{
      var rp_tgt=tv(p,'target','targetCustom')||'<2>';
      var rp_seat=p.seat||'1';
      return['/ridepillion '+rp_tgt+' '+rp_seat];
    }
    /* ── 鏡頭/拍照 新增 ── */
    case 'facecamera': return['/facecamera'];
    case 'idlingcamera':{
      var ic=tv(p,'target','targetCustom');
      return[ic?'/icam '+ic:'/icam'];
    }
    case 'tiltcamera': return['/tiltcamera '+(p.value||'50')];
    /* ── 狀態/身分 新增 ── */
    case 'busy':{var bt=p.toggle||'toggle';return[bt==='toggle'?'/busy':'/busy '+bt];}
    case 'away':{var at2=p.toggle||'toggle';return[at2==='toggle'?'/afk':'/afk '+at2];}
    case 'roleplaying':{var rt=p.toggle||'toggle';return[rt==='toggle'?'/roleplaying':'/roleplaying '+rt];}
    case 'lfp':{
      var lfp_t=p.toggle||'toggle';
      var lfp_jobs=(p.jobs||[]).join(' ');
      if(lfp_t==='toggle') return[lfp_jobs?'/lfp '+lfp_jobs:'/lfp'];
      if(lfp_t==='off') return['/lfp off'];
      // on
      return[lfp_jobs?'/lfp on '+lfp_jobs:'/lfp on'];
    }
    case 'lfm':{var lfmt=p.toggle||'toggle';return[lfmt==='toggle'?'/lfm':'/lfm '+lfmt];}
    case 'scomment': return['/scomment '+(p.text||'')];
    case 'bstatus':{var bst=p.toggle||'toggle';return[bst==='toggle'?'/nastatus':'/nastatus '+bst];}
    case 'nnetwork':{var nn=p.toggle||'toggle';return[nn==='toggle'?'/nnetwork':'/nnetwork '+nn];}
    case 'nnetworkinvitation':{var nni=p.toggle||'toggle';return[nni==='toggle'?'/nnetworkinvitation':'/nnetworkinvitation '+nni];}
    case 'nnetworkleave': return['/nnetworkleave'];
    case 'search':{
      var seaParts=[];
      if(p.nameMode&&p.playerName) seaParts.push(p.nameMode+' "'+p.playerName+'"');
      if(p.status) seaParts.push(p.status);
      if(p.jobs&&p.jobs.length) seaParts.push(p.jobs.join(' '));
      if(p.lvMin){ seaParts.push(p.lvMax&&p.lvMax!==p.lvMin?p.lvMin+'-'+p.lvMax:p.lvMin); }
      if(p.gc) seaParts.push('"'+p.gc+'"');
      if(p.location) seaParts.push('"'+p.location+'"');
      if(p.lang) seaParts.push(p.lang);
      return[seaParts.length?'/sea '+seaParts.join(' '):'/sea'];
    }
    case 'title':{
      var tt=p.sub||'random';
      if(tt==='random') return['/title'];
      if(tt==='clear') return['/title clear'];
      return['/title set "'+(p.titleName||'')+'"'];
    }
    /* ── 小隊/社交 新增 ── */
    case 'partycmd':{
      var pc=p.sub||'';
      if(!pc) return['/pcmd'];
      var pc_tgt=tv(p,'target','targetCustom');
      var needs_tgt=['add','leader','kick'];
      if(needs_tgt.indexOf(pc)>=0&&pc_tgt) return['/pcmd '+pc+' '+pc_tgt];
      return['/pcmd '+pc];
    }
    case 'join': return['/join'];
    case 'decline': return['/decline'];
    case 'invite':{var inv_t=tv(p,'target','targetCustom');return[inv_t?'/invite '+inv_t:'/invite'];}
    case 'kick':{var kk_t=tv(p,'target','targetCustom');return[kk_t?'/kick '+kk_t:'/kick'];}
    case 'leader':{var ld_t=tv(p,'target','targetCustom');return[ld_t?'/leader '+ld_t:'/leader'];}
    case 'leave': return['/leave'];
    case 'psort': return['/psort'];
    case 'meldrequest':{var mr_t=tv(p,'target','targetCustom');return[mr_t?'/meldrequest '+mr_t:'/meldrequest'];}
    case 'friendlist':{
      var fl=p.sub||'';
      if(!fl) return['/flist'];
      var fl_tgt=tv(p,'target','targetCustom');
      return[fl_tgt?'/flist '+fl+' '+fl_tgt:'/flist '+fl];
    }
    case 'blacklist':{
      var bl=p.sub||'';
      if(!bl) return['/blist'];
      var bl_tgt=tv(p,'target','targetCustom');
      return[bl_tgt?'/blist '+bl+' '+bl_tgt:'/blist '+bl];
    }
    /* ── 戰鬥設定（原有）── */
    case 'levelsync': return['/levelsync'];
    case 'statusoff': return['/statusoff "'+(p.statusName||'')+'"'];
    /* ── 戰鬥設定 新增 ── */
    case 'autolockon':{var alt=p.toggle||'toggle';return[alt==='toggle'?'/autolockon':'/autolockon '+alt];}
    case 'autofacetarget':{var aft=p.toggle||'toggle';return[aft==='toggle'?'/autofacetarget':'/autofacetarget '+aft];}
    case 'autotarget':{var att=p.toggle||'toggle';return[att==='toggle'?'/autotarget':'/autotarget '+att];}
    case 'targetself':{var tst=p.toggle||'toggle';return[tst==='toggle'?'/targetself':'/targetself '+tst];}
    case 'groundclick':{var gct=p.toggle||'toggle';return[gct==='toggle'?'/groundclick':'/groundclick '+gct];}
    case 'duelswitch':{var dst=p.toggle||'toggle';return[dst==='toggle'?'/duelswitch':'/duelswitch '+dst];}
    case 'actionerror':{var aet=p.toggle||'toggle';return[aet==='toggle'?'/aerror':'/aerror '+aet];}
    case 'recasterror':{var ret=p.toggle||'toggle';return[ret==='toggle'?'/rerror':'/rerror '+ret];}
    /* ── 介面/顯示 新增 ── */
    case 'legacymark':{var lmt=p.toggle||'toggle';return[lmt==='toggle'?'/lmark':'/lmark '+lmt];}
    case 'displayhead':{var dht=p.toggle||'toggle';return[dht==='toggle'?'/displayhead':'/displayhead '+dht];}
    case 'displayarms':{var dat=p.toggle||'toggle';return[dat==='toggle'?'/displayarms':'/displayarms '+dat];}
    case 'autosheathe':{var ast=p.toggle||'toggle';return[ast==='toggle'?'/ashathe':'/ashathe '+ast];}
    case 'jobhudmode':{
      var jhm=p.num||'';
      return[jhm?'/jobhudmode '+jhm:'/jobhudmode'];
    }
    case 'hudreset': return['/hudreset'];
    case 'uireset': return['/uireset'];
    case 'uiscale':{
      var us=p.value||'';
      return[us==='reset'?'/uiscale reset':us?'/uiscale '+us:'/uiscale'];
    }
    case 'chatlog':{
      var cl_out=[];
      var cls=p.sub||'fontsize';
      if(cls==='fontsize'){
        var cl_fs='/chatlog fontsize';
        if(p.tabNum) cl_fs+=' '+p.tabNum;
        cl_fs+=' '+(p.fontSize||'12');
        cl_out.push(cl_fs);
      } else if(cls==='time_onoff'){
        var cl_t='/chatlog time';
        if(p.tabNum) cl_t+=' '+p.tabNum;
        cl_t+=' '+(p.toggle||'on');
        cl_out.push(cl_t);
      } else if(cls==='time_format'){
        cl_out.push('/chatlog time '+(p.format||'24'));
      } else if(cls==='time_base'){
        cl_out.push('/chatlog time '+(p.base||'local'));
      } else if(cls==='call'){
        var cl_c='/chatlog call';
        if(p.clChannel) cl_c+=' '+p.clChannel;
        if(p.callAction==='sound') cl_c+=' '+(p.soundNum||'1');
        else cl_c+=' '+(p.toggle||'on');
        cl_out.push(cl_c);
      }
      return cl_out.length?cl_out:['/chatlog'];
    }
    case 'targetring':{var tri=p.toggle||'toggle';return[tri==='toggle'?'/targetring':'/targetring '+tri];}
    case 'targetline':{var tli=p.toggle||'toggle';return[tli==='toggle'?'/targetline':'/targetline '+tli];}
    case 'linkline':{var lli=p.toggle||'toggle';return[lli==='toggle'?'/linkline':'/linkline '+lli];}
    /* ── 熱鍵設定 新增 ── */
    case 'hotbar':{
      var hb_out=[];
      var hb_sub=p.sub||'set';
      var hb_cmd=p.zone==='pvp'?'/pvphotbar':'/hotbar';
      if(hb_sub==='set'){
        var hb_st=p.setType||'action';
        var hb_sn=p.setName||'';
        var hb_sl=hb_cmd+' '+hb_st+' "'+hb_sn+'"';
        if(p.num) hb_sl+=' '+p.num;
        if(p.slot2) hb_sl+=' '+p.slot2;
        hb_out.push(hb_sl);
      } else if(hb_sub==='change'){
        hb_out.push(hb_cmd+' change '+(p.num||'1'));
      } else if(hb_sub==='copy'){
        hb_out.push(hb_cmd+' copy '+(p.srcJob||'current')+' '+(p.srcNum||'1')+' '+(p.dstJob||'current')+' '+(p.dstNum||'2'));
      } else if(hb_sub==='display'){
        var hb_dt=p.toggle||'toggle';
        hb_out.push(hb_dt==='toggle'?hb_cmd+' display '+(p.num||'1'):hb_cmd+' display '+(p.num||'1')+' '+hb_dt);
      } else if(hb_sub==='share'){
        var hb_sh=p.toggle||'toggle';
        hb_out.push(hb_sh==='toggle'?hb_cmd+' share '+(p.num||'1'):hb_cmd+' share '+(p.num||'1')+' '+hb_sh);
      } else if(hb_sub==='remove'){
        var hb_slot=p.slot||'all';
        hb_out.push(hb_cmd+' remove '+(p.num||'1')+' '+hb_slot);
      }
      return hb_out.length?hb_out:[hb_cmd+' change 1'];
    }
    case 'pvphotbar':{
      var phb_out=[];
      var phb_sub=p.sub||'set';
      if(phb_sub==='set'){
        var phb_st=p.setType||'action';
        var phb_sn=p.setName||'';
        var phb_sl='/pvphotbar '+phb_st+' "'+phb_sn+'"';
        if(p.num) phb_sl+=' '+p.num;
        if(p.slot2) phb_sl+=' '+p.slot2;
        phb_out.push(phb_sl);
      } else if(phb_sub==='change'){
        phb_out.push('/pvphotbar change '+(p.num||'1'));
      } else if(phb_sub==='copy'){
        phb_out.push('/pvphotbar copy '+(p.srcJob||'current')+' '+(p.srcNum||'1')+' '+(p.dstJob||'current')+' '+(p.dstNum||'2'));
      } else if(phb_sub==='display'){
        var phb_dt=p.toggle||'toggle';
        phb_out.push(phb_dt==='toggle'?'/pvphotbar display '+(p.num||'1'):'/pvphotbar display '+(p.num||'1')+' '+phb_dt);
      } else if(phb_sub==='share'){
        var phb_sh=p.toggle||'toggle';
        phb_out.push(phb_sh==='toggle'?'/pvphotbar share '+(p.num||'1'):'/pvphotbar share '+(p.num||'1')+' '+phb_sh);
      } else if(phb_sub==='remove'){
        var phb_slot=p.slot||'all';
        phb_out.push('/pvphotbar remove '+(p.num||'1')+' '+phb_slot);
      }
      return phb_out.length?phb_out:['/pvphotbar change 1'];
    }
    case 'chotbar':{
      var chb_out=[];
      var chb_sub=p.sub||'set';
      var chb_cmd=p.zone==='pvp'?'/pvpchotbar':'/chotbar';
      if(chb_sub==='set'){
        var chb_st=p.setType||'action';
        var chb_sn=p.setName||'';
        var chb_sl=chb_cmd+' '+chb_st+' "'+chb_sn+'"';
        if(p.num) chb_sl+=' '+p.num;
        if(p.pos) chb_sl+=' '+p.pos;
        chb_out.push(chb_sl);
      } else if(chb_sub==='change'){
        chb_out.push(chb_cmd+' change '+(p.num||'1'));
      } else if(chb_sub==='copy'){
        chb_out.push(chb_cmd+' copy '+(p.srcJob||'current')+' '+(p.srcNum||'1')+' '+(p.dstJob||'current')+' '+(p.dstNum||'2'));
      } else if(chb_sub==='display'){
        var chb_dt=p.toggle||'toggle';
        chb_out.push(chb_dt==='toggle'?chb_cmd+' display '+(p.num||'1'):chb_cmd+' display '+(p.num||'1')+' '+chb_dt);
      } else if(chb_sub==='share'){
        var chb_sh=p.toggle||'toggle';
        chb_out.push(chb_sh==='toggle'?chb_cmd+' share '+(p.num||'1'):chb_cmd+' share '+(p.num||'1')+' '+chb_sh);
      } else if(chb_sub==='remove'){
        var chb_pos=p.pos||'all';
        chb_out.push(chb_cmd+' remove '+(p.num||'1')+' '+chb_pos);
      }
      return chb_out.length?chb_out:[chb_cmd+' change 1'];
    }
    case 'pvpchotbar':{
      var pchb_out=[];
      var pchb_sub=p.sub||'set';
      if(pchb_sub==='set'){
        var pchb_st=p.setType||'action';
        var pchb_sn=p.setName||'';
        var pchb_sl='/pvpchotbar '+pchb_st+' "'+pchb_sn+'"';
        if(p.num) pchb_sl+=' '+p.num;
        if(p.pos) pchb_sl+=' '+p.pos;
        pchb_out.push(pchb_sl);
      } else if(pchb_sub==='change'){
        pchb_out.push('/pvpchotbar change '+(p.num||'1'));
      } else if(pchb_sub==='copy'){
        pchb_out.push('/pvpchotbar copy '+(p.srcJob||'current')+' '+(p.srcNum||'1')+' '+(p.dstJob||'current')+' '+(p.dstNum||'2'));
      } else if(pchb_sub==='display'){
        var pchb_dt=p.toggle||'toggle';
        pchb_out.push(pchb_dt==='toggle'?'/pvpchotbar display '+(p.num||'1'):'/pvpchotbar display '+(p.num||'1')+' '+pchb_dt);
      } else if(pchb_sub==='share'){
        var pchb_sh=p.toggle||'toggle';
        pchb_out.push(pchb_sh==='toggle'?'/pvpchotbar share '+(p.num||'1'):'/pvpchotbar share '+(p.num||'1')+' '+pchb_sh);
      } else if(pchb_sub==='remove'){
        var pchb_pos=p.pos||'all';
        pchb_out.push('/pvpchotbar remove '+(p.num||'1')+' '+pchb_pos);
      }
      return pchb_out.length?pchb_out:['/pvpchotbar change 1'];
    }
    case 'chotbardisplay':{var cbd=p.toggle||'toggle';return[cbd==='toggle'?'/chotbardisplay':'/chotbardisplay '+cbd];}
    case 'chotbartype': return['/chotbartype '+(p.type||'hold')];
    /* ── 畫面/音效 新增 ── */
    case 'gpreset': return['/gpreset '+(p.num||'1')];
    case 'mastervolume': return[p.value!==undefined&&p.value!==''?'/mastervolume '+p.value:'/mastervolume'];
    case 'bgm': return[p.value!==undefined&&p.value!==''?'/bgm '+p.value:'/bgm'];
    case 'soundeffects': return[p.value!==undefined&&p.value!==''?'/soundeffects '+p.value:'/soundeffects'];
    case 'voice': return[p.value!==undefined&&p.value!==''?'/voice '+p.value:'/voice'];
    case 'systemsounds': return[p.value!==undefined&&p.value!==''?'/systemsounds '+p.value:'/systemsounds'];
    case 'ambientsounds': return[p.value!==undefined&&p.value!==''?'/ambientsounds '+p.value:'/ambientsounds'];
    case 'soundeffectsself': return['/soundeffectsself '+(p.value||'100')];
    case 'soundeffectsparty': return['/soundeffectsparty '+(p.value||'100')];
    case 'soundeffectsother': return['/soundeffectsother '+(p.value||'100')];
    case 'performsounds': return[p.value!==undefined&&p.value!==''?'/performsounds '+p.value:'/performsounds'];
    case 'mountbgm':{var mbt=p.toggle||'toggle';return[mbt==='toggle'?'/mountbgm':'/mountbgm '+mbt];}
    case 'systemsoundsspeaker': return[p.value!==undefined&&p.value!==''?'/systemsoundsspeaker '+p.value:'/systemsoundsspeaker'];
    /* ── 魔素板 新增 ── */
    case 'magiaright': return['/magiaright'];
    case 'magialeft': return['/magialeft'];
    case 'magiaattack':{var ma_t=tv(p,'target','targetCustom');return[ma_t?'/magiaattack '+ma_t:'/magiaattack'];}
    case 'magiadefense':{var md_t=tv(p,'target','targetCustom');return[md_t?'/magiadefense '+md_t:'/magiadefense'];}
    case 'magiaauto': return['/magiaauto '+(p.mode||'off')];
    /* ── 雜項/系統 新增 ── */
    case 'playtime': return['/ptime'];
    case 'logout': return['/logout'];
    case 'shutdown': return['/shutdown'];
    case 'instance': return['/instance'];
    case 'patchnote': return['/patchnote'];
    /* ── 巨集設定 ── */
    case 'micon':{
      var mit=p.miconType||'action';
      return[mit==='gearset'?'/micon '+(p.miconName||'1')+' gearset':'/micon "'+(p.miconName||'')+'" '+mit];
    }
    case 'mlock': return['/mlock'];
    case 'merror_line': return['/merror '+(p.onOff||'off')];
    case 'wait_line': return['/wait '+(parseInt(p.secs)||1)];
    case 'random': return[p.max?'/random '+p.max:'/random'];
    case 'custom': return[p.text||''];
    default: return[''];
  }
}

/* ── Render preserving scroll position ── */

function getAllOutput(lines,globalCfg){
  var out=[];
  if(globalCfg.mlock) out.push('/mlock');
  if(globalCfg.merrorOff) out.push('/merror off');
  var miconLines=[];
  lines.forEach(function(l){
    buildLines(l).forEach(function(s){
      if(s.startsWith('/micon')) miconLines.push(s);
      else out.push(s);
    });
  });
  miconLines.forEach(function(s){out.push(s);});
  return out;
}
function getTotalLines(lines,globalCfg){return getAllOutput(lines,globalCfg).length;}

function validate(lines,globalCfg){
  var W=[], total=getTotalLines(lines,globalCfg);
  if(total>MAX) W.push({lv:'error',msg:'行數超出上限：目前共 '+total+' 行（最多 '+MAX+' 行）。請刪除部分行或使用「分割巨集」功能。'});
  getAllOutput(lines,globalCfg).forEach(function(s,i){var c=cc(s);if(c>MAX_C)W.push({lv:'error',msg:'第 '+(i+1)+' 行字元超出上限（'+c+'/180）'});});
  var mlockLine=lines.findIndex(function(l){return l.type==='mlock';});
  if(mlockLine>0&&!globalCfg.mlock) W.push({lv:'warn',msg:'/mlock 在第 '+(mlockLine+1)+' 行，前面的行仍可能被中斷。建議移至第1行，或使用上方全局設定。'});
  var miconCount=lines.filter(function(l){return l.type==='micon';}).length;
  if(miconCount>1) W.push({lv:'warn',msg:'巨集中有 '+miconCount+' 個 /micon，只有第一個圖示生效，其餘被忽略。'});
  var hasNorm=lines.some(function(l){return l.type==='hotbar'&&l.params.zone!=='pvp';});
  var hasPvp=lines.some(function(l){return l.type==='hotbar'&&l.params.zone==='pvp';});
  if(hasNorm&&hasPvp) W.push({lv:'warn',msg:'同時包含一般熱鍵欄（非戰鬥區）和 PvP 熱鍵欄（對戰區），兩者無法在同一場景生效。'});
  // 必填名稱欄位檢查：避免欄位留空時輸出空白或無效指令卻沒有任何提示
  lines.forEach(function(l,i){
    var p=l.params||{}, ln=i+1, miss=null;
    switch(l.type){
      case 'tell': if(!p.target) miss='悄悄話對象尚未填寫'; break;
      case 'skill': case 'generalskill': case 'blueaction':
      case 'pvpaction': case 'petaction': case 'companionaction':
        if(!p.skillName) miss='技能／動作名稱尚未填寫'; break;
      case 'item': if(!p.itemName) miss='道具名稱尚未填寫'; break;
      case 'statusoff': if(!p.statusName) miss='狀態名稱尚未填寫'; break;
      case 'micon': if(p.miconType!=='gearset'&&!p.miconName) miss='/micon 的技能名稱尚未填寫'; break;
      case 'emote': if(p.emoteName==='custom'&&!p.emoteCustom) miss='自訂情感動作指令名稱尚未填寫'; break;
      case 'em': if(p.addMotion&&p.motionEmote==='custom'&&!p.motionCustom) miss='自訂行禮動作指令名稱尚未填寫'; break;
    }
    if(miss) W.push({lv:'error',msg:'第 '+ln+' 行：'+miss+'。'});
  });
  var hasSkill=lines.some(function(l){return l.type==='skill'||l.type==='generalskill';});
  if(hasSkill) W.push({lv:'info',msg:'技能巨集提示：巨集無法配合 GCD 時機，可能打斷技能循環。建議只用於低頻或非高強度戰鬥場景。'});
  return W;
}
function doSplit(allLines,globalCfg){
  var header=[];
  if(globalCfg.mlock) header.push('/mlock');
  if(globalCfg.merrorOff) header.push('/merror off');
  // Separate micon lines from the rest (already at end from getAllOutput)
  var miconLines=allLines.filter(function(s){return s.startsWith('/micon');});
  var bodyLines=allLines.filter(function(s){return !s.startsWith('/micon');});
  // m1: header lines at start, micon at end, body fills the middle
  var m1Max=MAX-header.length-(miconLines.length?1:0);
  var m1Body=bodyLines.slice(0,m1Max);
  var m1=header.concat(m1Body);
  if(miconLines.length) m1.push(miconLines[0]); // first micon at end of m1
  // m2: remaining body lines, header again, micon at end
  var rawM2=bodyLines.slice(m1Max);
  var m2header=header.slice();
  var m2body=rawM2;
  var m2=m2header.concat(m2body);
  if(miconLines.length) m2.push(miconLines[0]); // micon at end of m2 too
  var overflow=Math.max(0,m2.length-MAX);
  m2=m2.slice(0,MAX);
  return{m1:m1,m2:m2,overflow:overflow};
}
return {
  MAX:MAX,MAX_C:MAX_C,WARN_C:WARN_C,
  ALARM_TTYPE:ALARM_TTYPE,
  CATS:CATS,
  CH:CH,
  CHATLOG_CH:CHATLOG_CH,
  CHATLOG_SUBS:CHATLOG_SUBS,
  EMOTES:EMOTES,
  GPRESET_OPTS:GPRESET_OPTS,
  HOTBAR_SET_TYPES:HOTBAR_SET_TYPES,
  HOTBAR_SET_TYPES_PVP:HOTBAR_SET_TYPES_PVP,
  HOTBAR_SUBS:HOTBAR_SUBS,
  HUD_W:HUD_W,
  IS_AREAS:IS_AREAS,
  IS_C:IS_C,
  JOBS:JOBS,
  MICON_T:MICON_T,
  PETMIRAGE_APPEARANCES:PETMIRAGE_APPEARANCES,
  PETMIRAGE_PETS:PETMIRAGE_PETS,
  PETSIZE_PETS:PETSIZE_PETS,
  PRONS:PRONS,
  SE:SE,
  TDEFS:TDEFS,
  TEMPLATES:TEMPLATES,
  TGT:TGT,
  WINDOW_LIST:WINDOW_LIST,
  cc:cc,dc:dc,tv:tv,seStr:seStr,waitStr:waitStr,
  buildLines:buildLines,getAllOutput:getAllOutput,getTotalLines:getTotalLines,validate:validate,doSplit:doSplit
};
});
