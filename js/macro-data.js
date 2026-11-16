/* macro-data.js — 巨集資料與輸出規則（由舊版 macro-tool.js 原樣取出，輸出邏輯逐字不變）＋ 欄位結構 SCHEMA。
 * 沒有任何 DOM 相依，可在 Node 直接載入測試。 */
(function(){
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
  chatcountdown:{cat:'chat',icon:'📢',label:'聊天倒數（建構器）',isBlock:true},
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

var MSG_PROS=[
  {v:'<t>',l:'當前目標'},{v:'<me>',l:'自己'},{v:'<f>',l:'焦點目標'},
  {v:'<tt>',l:'目標的目標'},{v:'<1>',l:'小隊1號'},{v:'<2>',l:'小隊2號'},
  {v:'<3>',l:'小隊3號'},{v:'<4>',l:'小隊4號'},{v:'<5>',l:'小隊5號'},
  {v:'<6>',l:'小隊6號'},{v:'<7>',l:'小隊7號'},{v:'<8>',l:'小隊8號'},
  {v:'<r>',l:'最後悄悄話者'},{v:'<mo>',l:'滑鼠指向'},{v:'<hp>',l:'自身HP'},
  {v:'<hpp>',l:'HP%'},{v:'<mp>',l:'魔力'},{v:'<mpp>',l:'魔力%'},
  {v:'<pos>',l:'坐標'},{v:'<job>',l:'職業'},
  {v:'<targethpp>',l:'目標HP%'},{v:'<focushpp>',l:'焦點HP%'},
  {v:'<se.1>',l:'音效1'},{v:'<se.2>',l:'音效2'},{v:'<se.3>',l:'音效3'},
  {v:'<recast."技能名">',l:'冷卻時間'},
];
function cc(s){var n=0;for(var i=0;i<s.length;i++){var cp=s.codePointAt(i);n+=cp>0x7F?3:1;if(cp>0xFFFF)i++;/* 代理對佔了2個code unit，跳過第二半避免重複計算 */}return n;}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function so(opts,cur){return opts.map(function(o){return '<option value="'+esc(o.v)+'"'+(o.v===cur?' selected':'')+'>'+esc(o.l)+'</option>';}).join('');}
function dc(o){return JSON.parse(JSON.stringify(o));}
function tv(p,key,ckey){var v=p[key];return v==='custom'?(p[ckey]||'<t>'):v||'';}
function seStr(se){return se?(' '+se):'';}
function waitStr(w){var n=parseInt(w)||0;return n>0?'<wait.'+n+'>':'';}

/* 插入代名詞到輸入框游標位置 */
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
var KNOWN_CMDS=["aaction", "ac", "aerror", "afk", "alarm", "ambientsounds", "apa", "as", "ashathe", "autofacetarget", "autolockon", "automove", "autotarget", "battleeffect", "bgm", "blist", "blueaction", "bluespellbook", "bm", "bt", "busy", "c", "cac", "cd", "chatlog", "chotbar", "chotbardisplay", "chotbartype", "cl", "cth", "decline", "dice", "displayarms", "displayhead", "duelswitch", "e", "em", "emotelog", "facecamera", "fashion", "flist", "focustarget", "follow", "ft", "gaction", "gpose", "gpreset", "groundclick", "gs", "hotbar", "hud", "hudreset", "icam", "instance", "invite", "isearch", "item", "itemsort", "jobhudmode", "join", "kick", "leader", "leave", "levelsync", "lfm", "lfp", "linkline", "lmark", "lo", "logout", "magiaattack", "magiaauto", "magiadefense", "magialeft", "magiaright", "mastervolume", "meldrequest", "merror", "micon", "minion", "mk", "mlock", "mount", "mountbgm", "nameplatedisp", "nameplatetype", "nastatus", "nnetwork", "nnetworkinvitation", "nnetworkleave", "nr", "pac", "patchnote", "pcmd", "performsounds", "petglamour", "petsize", "psort", "ptime", "pvpac", "pvpchotbar", "pvphotbar", "qchat", "r", "random", "rcheck", "rd", "recast", "rerror", "ridepillion", "roleplaying", "scomment", "sea", "shutdown", "soundeffects", "soundeffectsother", "soundeffectsparty", "soundeffectsself", "statusoff", "systemsounds", "systemsoundsspeaker", "t", "targetline", "targetring", "targetself", "tiltcamera", "title", "trade", "uireset", "uiscale", "visor", "voice", "wait", "wmark"];
var DICE_CH=[["", "省略（當前頻道）"], ["party", "小隊"], ["alliance", "團隊"], ["freecompany", "部隊"], ["pvpteam", "戰隊"], ["linkshell1", "通訊貝1"], ["linkshell2", "通訊貝2"], ["linkshell3", "通訊貝3"], ["linkshell4", "通訊貝4"], ["linkshell5", "通訊貝5"], ["linkshell6", "通訊貝6"], ["linkshell7", "通訊貝7"], ["linkshell8", "通訊貝8"], ["cwlinkshell1", "跨服通訊貝1"], ["cwlinkshell2", "跨服通訊貝2"], ["cwlinkshell3", "跨服通訊貝3"], ["cwlinkshell4", "跨服通訊貝4"], ["cwlinkshell5", "跨服通訊貝5"], ["cwlinkshell6", "跨服通訊貝6"], ["cwlinkshell7", "跨服通訊貝7"], ["cwlinkshell8", "跨服通訊貝8"]];
var SCHEMA={"chat":{"f":[{"k":"hint","t":"在指定頻道發送訊息。可附加音效，或在行末加入等待時間讓後續行延遲執行。"},{"k":"row","label":"頻道","ctl":[{"t":"sel","key":"channel","def":"p","ref":"CH"}]},{"k":"row","label":"訊息","ctl":[{"t":"msg","key":"message","type":"text","ph":"輸入訊息內容…"}]},{"k":"row","label":"音效","ctl":[{"t":"sel","key":"se","def":"","ref":"SE"}]},{"k":"row","label":"行末等待","ctl":[{"t":"inp","key":"inlineWait","type":"number","ph":"0","min":"0","max":"60"},{"t":"unit","text":"秒（0＝不等待）"}]}]},"chatcountdown":{"f":[{"k":"hint","t":"逐行輸出訊息，每行可附加等待時間（倒數效果）。預設全部使用同一個頻道，若某幾行想改用其他頻道（例如平時用小隊、最後一行改用喊話），可在該行的「此行頻道」個別覆寫，留空則沿用上方預設頻道。"},{"k":"row","label":"預設頻道","ctl":[{"t":"sel","key":"channel","def":"p","ref":"CH"}]},{"k":"ccd"},{"k":"addbtn","cls":["ccd-add"]}]},"echo":{"f":[{"k":"hint","t":"/e 僅自己可見，不會出現在他人畫面。適合用來確認巨集執行進度。"},{"k":"row","label":"訊息","ctl":[{"t":"msg","key":"message","type":"text","ph":"輸入提示訊息…"}]},{"k":"row","label":"音效","ctl":[{"t":"sel","key":"se","def":"","ref":"SE"}]}]},"tell":{"f":[{"k":"hint","t":"傳送悄悄話給指定玩家。指定方式： 目前目標、直接輸入玩家名稱（格式：名字 姓氏）。"},{"k":"row","label":"目標","ctl":[{"t":"sel","key":"target","def":"<t>","ref":"TGT"}]},{"k":"row","label":"訊息","ctl":[{"t":"msg","key":"message","type":"text","ph":"輸入悄悄話內容…"}]}]},"reply":{"f":[{"k":"hint","t":"/r 回覆最後一個傳悄悄話給你的玩家。"},{"k":"row","label":"訊息","ctl":[{"t":"msg","key":"message","type":"text","ph":"輸入回覆內容…"}]}]},"em":{"f":[{"k":"hint","t":"/em 顯示第三人稱的自訂文字（如：玩家名 向你微笑。）。所有附近玩家都能看到。"},{"k":"row","label":"文字內容","ctl":[{"t":"msg","key":"text","type":"text","ph":"如：向 <t> 微笑。"}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"addMotion","label":"同時播放情感動作","def":false}]}]},"cl":{"f":[{"k":"hint","t":"清除消息欄中所有歷史記錄，執行後無法復原。"}]},"emotelog":{"f":[{"k":"hint","t":"/emotelog 設定使用情感動作時，是否在消息欄顯示對應的文字提示。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","顯示"],["off","不顯示"],["toggle","切換"]],"def":"toggle"}]}]},"cth":{"f":[{"k":"hint","t":"/cth 清除所有透過悄悄話（/tell）收發的歷史紀錄。無參數、無需設定。"}]},"qchat":{"f":[{"k":"hint","t":"發送快捷發言（僅限群狼盛宴中使用）。"},{"k":"row","label":"快捷發言名","ctl":[{"t":"inp","key":"name","type":"text","ph":"快捷發言名稱（與遊戲完全一致）"}]},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"skill":{"f":[{"k":"hint","t":"職業技能（需要學會才能使用，如：治癒、神聖領域）　以自己為目標的技能可省略「目標」欄位。　若技能需要「地面目標」（如縮地、部分場地技），省略目標或不勾選地面關時，執行後角色會進入地面瞄準模式等待你點擊；勾選「地面關」則直接對目前所指位置發動，不進入瞄準模式。"},{"k":"row","label":"技能名稱","ctl":[{"t":"inp","key":"skillName","type":"text","ph":"技能名稱（與遊戲完全一致）"}]},{"k":"row","label":"目標","ctl":[{"t":"sel","key":"target","def":"<t>","ref":"TGT"}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"groundOff","label":"地面關（gtoff，僅地面目標技能適用，勾選後直接對所指位置發動，忽略目標欄位）","def":false}]},{"k":"row","label":"等待秒數","ctl":[{"t":"inp","key":"inlineWait","type":"number","ph":"0","min":"0","max":"60"},{"t":"unit","text":"秒（0＝不等待，加在行末 <wait.X>）"}]},{"k":"warn","t":"⚠ 職業技能巨集可能干擾 GCD 循環，建議只用於低頻技能或非高強度戰鬥"},{"k":"sep","t":"附加選項（每勾選一項增加一行輸出）"},{"k":"row","label":"","ctl":[{"t":"chk","key":"preAnnounce","label":"施放前預告（先在頻道發出訊息，等待後再施放）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"postNotify","label":"施放後立即在頻道通知","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"postEcho","label":"施放後自我提示（僅自己看到）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"recastNotify","label":"施放後顯示冷卻時間（使用 <recast> 代名詞）","def":false}]}]},"generalskill":{"f":[{"k":"hint","t":"通用技能（所有職業都有的動作，如：跳躍、衝刺、極限技）　以自己為目標的技能可省略「目標」欄位。　若技能需要「地面目標」（如縮地、部分場地技），省略目標或不勾選地面關時，執行後角色會進入地面瞄準模式等待你點擊；勾選「地面關」則直接對目前所指位置發動，不進入瞄準模式。"},{"k":"row","label":"技能名稱","ctl":[{"t":"inp","key":"skillName","type":"text","ph":"技能名稱（與遊戲完全一致）"}]},{"k":"row","label":"目標","ctl":[{"t":"sel","key":"target","def":"<t>","ref":"TGT"}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"groundOff","label":"地面關（gtoff，僅地面目標技能適用，勾選後直接對所指位置發動，忽略目標欄位）","def":false}]},{"k":"row","label":"等待秒數","ctl":[{"t":"inp","key":"inlineWait","type":"number","ph":"0","min":"0","max":"60"},{"t":"unit","text":"秒（0＝不等待，加在行末 <wait.X>）"}]},{"k":"sep","t":"附加選項（每勾選一項增加一行輸出）"},{"k":"row","label":"","ctl":[{"t":"chk","key":"preAnnounce","label":"施放前預告（先在頻道發出訊息，等待後再施放）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"postNotify","label":"施放後立即在頻道通知","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"postEcho","label":"施放後自我提示（僅自己看到）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"recastNotify","label":"施放後顯示冷卻時間（使用 <recast> 代名詞）","def":false}]}]},"blueaction":{"f":[{"k":"hint","t":"青魔法技能（青魔法師專用，需設定為有效技能）　以自己為目標的技能可省略「目標」欄位。　若技能需要「地面目標」（如縮地、部分場地技），省略目標或不勾選地面關時，執行後角色會進入地面瞄準模式等待你點擊；勾選「地面關」則直接對目前所指位置發動，不進入瞄準模式。"},{"k":"row","label":"技能名稱","ctl":[{"t":"inp","key":"skillName","type":"text","ph":"技能名稱（與遊戲完全一致）"}]},{"k":"row","label":"目標","ctl":[{"t":"sel","key":"target","def":"<t>","ref":"TGT"}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"groundOff","label":"地面關（gtoff，僅地面目標技能適用，勾選後直接對所指位置發動，忽略目標欄位）","def":false}]},{"k":"row","label":"等待秒數","ctl":[{"t":"inp","key":"inlineWait","type":"number","ph":"0","min":"0","max":"60"},{"t":"unit","text":"秒（0＝不等待，加在行末 <wait.X>）"}]},{"k":"sep","t":"附加選項（每勾選一項增加一行輸出）"},{"k":"row","label":"","ctl":[{"t":"chk","key":"preAnnounce","label":"施放前預告（先在頻道發出訊息，等待後再施放）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"postNotify","label":"施放後立即在頻道通知","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"postEcho","label":"施放後自我提示（僅自己看到）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"recastNotify","label":"施放後顯示冷卻時間（使用 <recast> 代名詞）","def":false}]}]},"pvpaction":{"f":[{"k":"hint","t":"PvP技能（只在對戰區生效）　以自己為目標的技能可省略「目標」欄位。　若技能需要「地面目標」（如縮地、部分場地技），省略目標或不勾選地面關時，執行後角色會進入地面瞄準模式等待你點擊；勾選「地面關」則直接對目前所指位置發動，不進入瞄準模式。"},{"k":"row","label":"技能名稱","ctl":[{"t":"inp","key":"skillName","type":"text","ph":"技能名稱（與遊戲完全一致）"}]},{"k":"row","label":"目標","ctl":[{"t":"sel","key":"target","def":"<t>","ref":"TGT"}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"groundOff","label":"地面關（gtoff，僅地面目標技能適用，勾選後直接對所指位置發動，忽略目標欄位）","def":false}]},{"k":"row","label":"等待秒數","ctl":[{"t":"inp","key":"inlineWait","type":"number","ph":"0","min":"0","max":"60"},{"t":"unit","text":"秒（0＝不等待，加在行末 <wait.X>）"}]},{"k":"sep","t":"附加選項（每勾選一項增加一行輸出）"},{"k":"row","label":"","ctl":[{"t":"chk","key":"preAnnounce","label":"施放前預告（先在頻道發出訊息，等待後再施放）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"postNotify","label":"施放後立即在頻道通知","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"postEcho","label":"施放後自我提示（僅自己看到）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"recastNotify","label":"施放後顯示冷卻時間（使用 <recast> 代名詞）","def":false}]}]},"petaction":{"f":[{"k":"hint","t":"召喚獸技能（控制召喚師的召喚獸）　以自己為目標的技能可省略「目標」欄位。　若技能需要「地面目標」（如縮地、部分場地技），省略目標或不勾選地面關時，執行後角色會進入地面瞄準模式等待你點擊；勾選「地面關」則直接對目前所指位置發動，不進入瞄準模式。"},{"k":"row","label":"技能名稱","ctl":[{"t":"inp","key":"skillName","type":"text","ph":"技能名稱（與遊戲完全一致）"}]},{"k":"row","label":"目標","ctl":[{"t":"sel","key":"target","def":"<t>","ref":"TGT"}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"groundOff","label":"地面關（gtoff，僅地面目標技能適用，勾選後直接對所指位置發動，忽略目標欄位）","def":false}]},{"k":"row","label":"等待秒數","ctl":[{"t":"inp","key":"inlineWait","type":"number","ph":"0","min":"0","max":"60"},{"t":"unit","text":"秒（0＝不等待，加在行末 <wait.X>）"}]},{"k":"sep","t":"附加選項（每勾選一項增加一行輸出）"},{"k":"row","label":"","ctl":[{"t":"chk","key":"preAnnounce","label":"施放前預告（先在頻道發出訊息，等待後再施放）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"postNotify","label":"施放後立即在頻道通知","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"postEcho","label":"施放後自我提示（僅自己看到）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"recastNotify","label":"施放後顯示冷卻時間（使用 <recast> 代名詞）","def":false}]}]},"companionaction":{"f":[{"k":"hint","t":"搭擋技能（控制陸行鳥搭擋）　以自己為目標的技能可省略「目標」欄位。"},{"k":"row","label":"技能名稱","ctl":[{"t":"inp","key":"skillName","type":"text","ph":"技能名稱（與遊戲完全一致）"}]},{"k":"row","label":"等待秒數","ctl":[{"t":"inp","key":"inlineWait","type":"number","ph":"0","min":"0","max":"60"},{"t":"unit","text":"秒（0＝不等待，加在行末 <wait.X>）"}]},{"k":"sep","t":"附加選項（每勾選一項增加一行輸出）"},{"k":"row","label":"","ctl":[{"t":"chk","key":"preAnnounce","label":"施放前預告（先在頻道發出訊息，等待後再施放）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"postNotify","label":"施放後立即在頻道通知","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"postEcho","label":"施放後自我提示（僅自己看到）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"recastNotify","label":"施放後顯示冷卻時間（使用 <recast> 代名詞）","def":false}]}]},"item":{"f":[{"k":"hint","t":"使用背包中的指定道具。道具必須在背包裡才能執行，名稱需與遊戲完全一致。"},{"k":"row","label":"道具名稱","ctl":[{"t":"inp","key":"itemName","type":"text","ph":"道具名稱（與遊戲完全一致，如：高級乙太藥）"}]},{"k":"row","label":"目標","ctl":[{"t":"sel","key":"target","def":"<me>","ref":"TGT"}]},{"k":"sep","t":"附加選項"},{"k":"row","label":"","ctl":[{"t":"chk","key":"postEcho","label":"使用後顯示確認訊息（僅自己看到）","def":false}]}]},"emote":{"f":[{"k":"hint","t":"播放指定情感動作。勾選「僅播動作」後加上 motion 子命令，只播放動作動畫但不顯示文字提示。"},{"k":"row","label":"情感動作","ctl":[{"t":"emote","key":"emoteName"}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"motionOnly","label":"僅播動作，不顯示文字提示（加上 motion）","def":false}]},{"k":"sep","t":"選填：同時發出感情表現文字"},{"k":"hint","t":"情感動作後緊接 /em 文字，效果：角色播放動作，同時顯示第三人稱自訂文字。"},{"k":"row","label":"","ctl":[{"t":"chk","key":"addEm","label":"附加感情表現文字（/em）","def":false}]}]},"abilityrotation":{"f":[{"k":"hint","t":"將多個能力技（不佔 GCD 的技能）排在一起。反覆按下此巨集，會依序嘗試施放每個技能，冷卻中的會跳過（建議搭配全局 /merror off 或在上方勾選）。"},{"k":"warn","t":"⚠ 此功能需要技能均為「能力技」（不佔 GCD 的瞬發技），若放入佔 GCD 的技能會影響循環。"},{"k":"row","label":"目標","ctl":[{"t":"sel","key":"target","def":"<t>","ref":"TGT"}]},{"k":"row","label":"等待秒數","ctl":[{"t":"inp","key":"inlineWait","type":"number","ph":"0","min":"0","max":"60"},{"t":"unit","text":"秒（一般能力技不需等待）"}]},{"k":"sep","t":"技能列表（按上至下順序排列）"},{"k":"arlist"},{"k":"addbtn","cls":["ar-add"]}]},"itemsort":{"f":[{"k":"hint","t":"按設定條件整理指定區域的物品。每個區域依照排序條件的順序（上方優先）重新排列。注意：勾選「雇員物品」或「陸行鳥鞍囊」時，該視窗必須已經開啟才會生效（可在巨集最前面加一行開啟該視窗的指令）。"},{"k":"sep","t":"整理目標（可多選）"},{"k":"areas"},{"k":"row","label":"","ctl":[{"t":"chk","key":"useClear","label":"每個區域排序前先執行 /itemsort clear（清除舊設定，使結果更乾淨）","def":true}]},{"k":"sep","t":"排序條件（由上至下優先順序）"},{"k":"conds"},{"k":"addbtn","cls":["is-add-cond"]},{"k":"sep","t":"完成後確認訊息（選填）"},{"k":"row","label":"訊息","ctl":[{"t":"msg","key":"echoMsg","type":"text","ph":"整理完成！（留空則不輸出）"}]},{"k":"row","label":"音效","ctl":[{"t":"sel","key":"echoSe","def":"","ref":"SE"}]}]},"itemsearch":{"f":[{"k":"hint","t":"/isearch 在背包、雇員物品、兵裝庫、陸行鳥鞍囊、收藏柜、投影台中，完整搜尋含有指定關鍵字的道具。無法用於巨集內（僅能在對話欄直接輸入）。"},{"k":"row","label":"關鍵字","ctl":[{"t":"inp","key":"itemName","type":"text","ph":"道具名稱關鍵字（如：恢復藥）"}]}]},"recast":{"f":[{"k":"hint","t":"在消息欄顯示指定技能的剩餘複唱時間（秒）。"},{"k":"row","label":"技能名稱","ctl":[{"t":"inp","key":"skillName","type":"text","ph":"技能名稱（與遊戲完全一致）"}]}]},"aaction":{"f":[{"k":"hint","t":"設定或解除大地使者的額外技能。技能名輸入「clear」可解除全部已設定的技能。"},{"k":"row","label":"技能名稱","ctl":[{"t":"inp","key":"skillName","type":"text","ph":"技能名稱或輸入 clear 解除全部"}]},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","設定技能"],["off","解除技能"],["toggle","切換（設定↔解除）"]],"def":"toggle"}]}]},"bluespellbook":{"f":[{"k":"hint","t":"管理青魔法書的有效技能設定。可切換開關、設定單一技能、或套用預設組。"},{"k":"row","label":"子指令","ctl":[{"t":"sel","key":"sub","opts":[["toggle","切換青魔法書開/關"],["set","設定有效技能（開/關）"],["preset","套用預設技能組"],["clear","撤除所有有效技能"]],"def":"toggle"}]}]},"apa":{"f":[{"k":"hint","t":"同時設定兩個對戰追加技能，兩個欄位都必須填寫。"},{"k":"row","label":"追加技能 1","ctl":[{"t":"inp","key":"skill1","type":"text","ph":"對戰追加技能名稱（與遊戲完全一致）"}]},{"k":"row","label":"追加技能 2","ctl":[{"t":"inp","key":"skill2","type":"text","ph":"對戰追加技能名稱（與遊戲完全一致）"}]}]},"openwindow":{"f":[{"k":"hint","t":"開啟（或關閉，若已開啟）指定的選單／清單視窗。多數視窗指令再次執行會直接關閉。"},{"k":"row","label":"視窗","ctl":[{"t":"sel","key":"winCmd","def":"bag","ref":"WINDOW_LIST"}]}]},"targeting":{"f":[{"k":"hint","t":"選中指定種類的目標。"},{"k":"row","label":"指令","ctl":[{"t":"sel","key":"targetCmd","opts":[["/bt","/bt　選中最近敵視目標（最常用）"],["/ta","/ta　選中指定目標（搭配代名詞）"],["/tpc","/tpc　選中最近玩家"],["/tnpc","/tnpc　選中最近 NPC"],["/tenemy","/tenemy　選中最近敵人"],["/nt","/nt　向右順次選中下一個目標"],["/previoustarget","/previoustarget　向左選中上一個目標"],["/tlt","/tlt　重新選中上次目標"],["/tle","/tle　重新選中前次敵人"]],"def":"/bt"}]},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"targetParam","def":"","ref":"TGT"}]}]},"check":{"f":[{"k":"hint","t":"/check（縮寫 /c）查看目標玩家的詳細情報視窗。省略目標則查看當前選中的目標。"},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"trade":{"f":[{"k":"hint","t":"/trade 向指定玩家發起交易請求，對方需在附近才能成立。省略目標則向當前選中的目標發起交易。"},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"assist":{"f":[{"k":"hint","t":"/as 以目標的目標作為新目標（通常用於跟隨坦克選怪）。"},{"k":"row","label":"目標","ctl":[{"t":"sel","key":"target","def":"<t>","ref":"TGT"}]}]},"focustarget":{"f":[{"k":"hint","t":"/focustarget 設定焦點目標（單獨顯示在畫面角落），省略目標則清除焦點目標。"},{"k":"row","label":"目標（省略則清除）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"facetarget":{"f":[{"k":"hint","t":"/ft 讓角色立即轉向面對當前選中的目標。"}]},"lockon":{"f":[{"k":"hint","t":"/lo 鎖定當前目標（持續追蹤目標方向）。省略目標則鎖定當前選中目標。"},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"marking":{"f":[{"k":"hint","t":"給目標加上攻擊順序或形狀標記。小隊成員都能看到標記。"},{"k":"row","label":"標記種類","ctl":[{"t":"sel","key":"markType","opts":[["attack","攻擊（自動下一個編號）"],["attack1","攻擊1"],["attack2","攻擊2"],["attack3","攻擊3"],["attack4","攻擊4"],["attack5","攻擊5"],["bind","止步（自動下一個編號）"],["bind1","止步1"],["bind2","止步2"],["bind3","止步3"],["stop","禁止（自動下一個編號）"],["stop1","禁止1"],["stop2","禁止2"],["square","方塊"],["circle","圓圈"],["cross","叉"],["triangle","三角"],["clear","清除所有標記"]],"def":"attack1"}]},{"k":"row","label":"標記目標","ctl":[{"t":"sel","key":"markTarget","def":"<t>","ref":"TGT"}]},{"k":"sep","t":"選填：完成後通知"},{"k":"row","label":"","ctl":[{"t":"chk","key":"notify","label":"完成後在頻道通知","def":false}]}]},"waymark":{"f":[{"k":"hint","t":"/wmark 設置場景標記（A/B/C/D 或 1~4），讓隊友知道站位或集合點。也可將目前擺放的整組標記存成預設，之後一鍵讀取。"},{"k":"row","label":"模式","ctl":[{"t":"sel","key":"waymarkAction","opts":[["toggle","切換單一標記（已設定則撤除）"],["target","將單一標記設在當前目標腳下（<t>）"],["clear","清除所有場景標記"],["save","儲存目前擺放為預設"],["preset","讀取已儲存的預設"]],"def":"toggle"}]},{"k":"row","label":"標記","ctl":[{"t":"sel","key":"waymarkName","opts":[["A","A"],["B","B"],["C","C"],["D","D"],["1","1"],["2","2"],["3","3"],["4","4"]],"def":"A"}]},{"k":"sep","t":"選填：完成後通知"},{"k":"row","label":"","ctl":[{"t":"chk","key":"notify","label":"完成後在頻道通知","def":false}]}]},"countdown_sys":{"f":[{"k":"hint","t":"/cd 開始戰鬥倒計時（5~30秒）。省略秒數則開啟倒計時視窗。"},{"k":"row","label":"秒數（選填）","ctl":[{"t":"inp","key":"secs","type":"number","ph":"5~30，省略則開啟視窗","min":"5","max":"30"}]}]},"readycheck":{"f":[{"k":"hint","t":"/rcheck 向小隊發起準備確認。所有成員需各自回應準備完畢或未準備好。"},{"k":"row","label":"","ctl":[{"t":"chk","key":"notify","label":"確認後在頻道通知","def":false}]}]},"ready":{"f":[{"k":"hint","t":"/rd — 回應準備確認：準備完畢。"}]},"notready":{"f":[{"k":"hint","t":"/nr — 回應準備確認：尚未準備好。"}]},"random":{"f":[{"k":"hint","t":"在說話範圍內廣播一個隨機數字。省略上限值時從 0~999 中抽取；指定上限值則從 1~N 抽取。"},{"k":"row","label":"上限值（選填）","ctl":[{"t":"inp","key":"max","type":"number","ph":"省略則 0~999；填入數字則 1~N","min":"2","max":"999"}]}]},"alarm":{"f":[{"k":"hint","t":"設定到指定時間時發出提醒的鬧鐘。可設本地、伺服器或艾奧傑亞時間，並可設定提前提醒或每小時重複。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"alarmSub","opts":[["open","開啟鬧鐘視窗"],["set","設定鬧鐘"],["clear","撤除所有鬧鐘"]],"def":"open"}]}]},"dice":{"f":[{"k":"hint","t":"在聊天頻道發送骰子結果（0~999，或指定上限 1~N）。省略頻道則在當前頻道發言。在巨集中使用時建議指定頻道。"},{"k":"row","label":"頻道（選填）","ctl":[{"t":"sel","key":"channel","ref":"DICE_CH","def":""}]},{"k":"row","label":"上限值（選填）","ctl":[{"t":"inp","key":"max","type":"number","ph":"省略則 0~999；填入數字則 1~N","min":"2","max":"999"}]}]},"automove":{"f":[{"k":"hint","t":"/automove — 切換自動前進。執行一次開始，再次執行停止。"}]},"follow":{"f":[{"k":"hint","t":"/follow 跟隨指定目標移動。省略目標則跟隨當前選中的角色。再次執行停止跟隨。"},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"battlemode":{"f":[{"k":"hint","t":"/bm 切換拔刀/收刀狀態。可選擇強制拔刀、強制收刀，或在兩者之間切換。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["toggle","切換（拔刀↔收刀）"],["draw","拔刀"],["sheathe","收刀"]],"def":"toggle"}]}]},"gearset":{"f":[{"k":"hint","t":"/gs 切換、儲存、刪除或查看裝備套裝。套裝編號也可用套裝名稱的開頭字母代替。可附加圖示和確認訊息，讓熱鍵欄視覺效果統一。"},{"k":"row","label":"動作","ctl":[{"t":"sel","key":"gsAction","opts":[["change","切換套裝"],["save","儲存當前裝備至此編號"],["view","查看套裝內容"],["delete","刪除此編號套裝（僅刪除套裝紀錄，不影響裝備本身）"]],"def":"change"}]},{"k":"row","label":"套裝編號","ctl":[{"t":"inp","key":"gsNumber","type":"number","ph":"1","min":"1","max":"100"},{"t":"unit","text":"（1~100，或填套裝名稱）"}]},{"k":"sep","t":"附加選項"},{"k":"row","label":"","ctl":[{"t":"chk","key":"addMicon","label":"加入巨集圖示（/micon，讓熱鍵欄顯示套裝圖示）","def":false}]},{"k":"row","label":"","ctl":[{"t":"chk","key":"addEcho","label":"加入切換確認訊息（僅自己看到）","def":false}]}]},"visor":{"f":[{"k":"hint","t":"/visor — 切換頭部裝備的面罩開關（適用於可開合的頭盔）。"}]},"fashion":{"f":[{"k":"hint","t":"/fashion 裝備指定的時尚配件（如陽傘等外觀類配件）。"},{"k":"row","label":"配件名稱","ctl":[{"t":"inp","key":"itemName","type":"text","ph":"時尚配件名稱（與遊戲完全一致）"}]}]},"mount":{"f":[{"k":"hint","t":"/mount 乘上指定坐騎。已騎乘時執行會跳下。省略坐騎名則直接跳下當前坐騎。"},{"k":"row","label":"坐騎名稱（選填）","ctl":[{"t":"inp","key":"mountName","type":"text","ph":"坐騎名稱（與遊戲完全一致），省略則跳下坐騎"}]}]},"minion":{"f":[{"k":"hint","t":"/minion 召喚指定寵物。已召喚同一隻時再次執行會讓牠離開。"},{"k":"row","label":"寵物名稱","ctl":[{"t":"inp","key":"minionName","type":"text","ph":"寵物名稱（與遊戲完全一致）"}]}]},"petsize":{"f":[{"k":"hint","t":"變更指定召喚獸的顯示尺寸，僅對自身生效，PvP區無效。選「全部」時無法使用切換，需指定尺寸。"},{"k":"row","label":"召喚獸","ctl":[{"t":"sel","key":"petName","def":"Demi-Bahamut","ref":"PETSIZE_PETS"}]},{"k":"row","label":"尺寸","ctl":[{"t":"sel","key":"size","opts":[["large","大"],["medium","中"],["small","小"],["toggle","切換（小→中→大）"]],"def":"toggle"}]}]},"petmirage":{"f":[{"k":"hint","t":"/petglamour（別名 /petglam、/egiglamour）將指定召喚獸的外貌更換為另一款召喚獸的外觀，需重新召喚才會生效，PvP區無效。學者妖精 Eos 可換裝成 Selene（7.51版確認）。注意：官方指令名稱已由舊版 /petmirage 改為 /petglamour，若巨集裡還留著 /petmirage 會執行失敗。勾選「撤除外貌」會省略外貌參數以恢復原始外觀（並非填入「clear」字樣）。"},{"k":"row","label":"召喚獸","ctl":[{"t":"sel","key":"petName","def":"carbuncle","ref":"PETMIRAGE_PETS"}]},{"k":"row","label":"撤除外貌","ctl":[{"t":"chk","key":"clear","label":"撤除（省略外貌參數，恢復原始外貌）","def":false}]},{"k":"row","label":"外貌","ctl":[{"t":"sel","key":"appearance","opts":[["carbuncle","寶石獸"],["emerald-carbuncle","綠寶石獸"],["topaz-carbuncle","黃寶石獸"],["ruby-carbuncle","紅寶石獸"]],"def":"carbuncle"}]}]},"ridepillion":{"f":[{"k":"hint","t":"搭乘指定隊員的坐騎，並選擇座位編號（1~7）。若指定座位已滿會自動選空位。"},{"k":"row","label":"隊員","ctl":[{"t":"sel","key":"target","def":"<2>","ref":"TGT"}]},{"k":"row","label":"座位編號","ctl":[{"t":"sel","key":"seat","opts":[["1","座位 1"],["2","座位 2"],["3","座位 3"],["4","座位 4"],["5","座位 5"],["6","座位 6"],["7","座位 7"]],"def":"1"}]}]},"gpose":{"f":[{"k":"hint","t":"/gpose — 進入集體動作（拍照）模式。再次執行離開。"}]},"facecamera":{"f":[{"k":"hint","t":"讓角色視線轉向鏡頭方向。再次執行可解除。"}]},"idlingcamera":{"f":[{"k":"hint","t":"切換為景觀鏡頭視角，可指定目標讓鏡頭鎖定該對象。省略目標則隨機選擇場景。"},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"tiltcamera":{"f":[{"k":"hint","t":"調整第三人稱視角的俯視角度（0~100）。數值越大俯視角度越大。"},{"k":"row","label":"俯視角度","ctl":[{"t":"inp","key":"value","type":"number","ph":"0~100","min":"0","max":"100"}]}]},"busy":{"f":[{"k":"hint","t":"設定在線狀態為「忙碌」。開啟後其他玩家會看到你處於忙碌狀態。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","設為忙碌"],["off","回到在線"],["toggle","切換（忙碌↔在線）"]],"def":"toggle"}]}]},"away":{"f":[{"k":"hint","t":"設定在線狀態為「離開（AFK）」。開啟後其他玩家會看到你處於離開狀態。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","設為離開"],["off","回到在線"],["toggle","切換（離開↔在線）"]],"def":"toggle"}]}]},"roleplaying":{"f":[{"k":"hint","t":"設定在線狀態為「角色扮演中」。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","設為角色扮演中"],["off","回到在線"],["toggle","切換（角色扮演↔在線）"]],"def":"toggle"}]}]},"lfp":{"f":[{"k":"hint","t":"設定在線狀態為「希望組隊」，可附加你能以哪些職業參與組隊。省略職業時預設為當前職業（省略全部職業）。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","設為希望組隊"],["off","回到在線"],["toggle","切換（希望組隊↔在線）"]],"def":"toggle"}]},{"k":"row","label":"可組隊職業（選填，可多選）","ctl":[{"t":"jobs","key":"jobs"}]}]},"lfm":{"f":[{"k":"hint","t":"設定在線狀態為「接受鑲嵌魔晶石請求」。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","接受鑲嵌請求"],["off","回到在線"],["toggle","切換"]],"def":"toggle"}]}]},"scomment":{"f":[{"k":"hint","t":"設定搜尋玩家時顯示的個性簽名。"},{"k":"row","label":"簽名內容","ctl":[{"t":"inp","key":"text","type":"text","ph":"簽名文字"}]}]},"bstatus":{"f":[{"k":"hint","t":"/nastatus（別名 /nas）切換自己的「新人（Sprout）」在線狀態。注意：官方指令名稱已由舊版 /beginnerstatus、/bstatus 改為 /nastatus，若巨集裡還留著 /bstatus 會執行失敗。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","開啟新人狀態"],["off","解除新人狀態"],["toggle","切換"]],"def":"toggle"}]}]},"nnetwork":{"f":[{"k":"hint","t":"/nnetwork（別名 /novicenetwork）設定是否自動加入新人頻道。開啟時會立即加入頻道；關閉時會離開頻道並停止自動加入。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","開啟自動加入"],["off","關閉自動加入並離開"],["toggle","切換"]],"def":"toggle"}]}]},"nnetworkinvitation":{"f":[{"k":"hint","t":"/nnetworkinvitation（別名 /novicenetworkinvitation）設定是否允許被邀請加入新人頻道。關閉後會自動拒絕所有邀請。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","允許被邀請"],["off","自動拒絕邀請"],["toggle","切換"]],"def":"toggle"}]}]},"nnetworkleave":{"f":[{"k":"hint","t":"/nnetworkleave（別名 /novicenetworkleave）立即退出目前所在的新人頻道。無參數。"}]},"search":{"f":[{"k":"hint","t":"/sea（別名 /search）依條件搜尋玩家，結果顯示在玩家搜尋視窗中。可組合多種條件，全部留空則執行預設搜尋。"},{"k":"row","label":"姓名條件","ctl":[{"t":"sel","key":"nameMode","opts":[["","（不篩選姓名）"],["forename","名字（forename）"],["surname","姓氏（surname）"]],"def":""}]},{"k":"row","label":"在線狀態","ctl":[{"t":"sel","key":"status","opts":[["","（不篩選）"],["leader","隊長 leader"],["away","離開 away"],["busy","忙碌 busy"],["duty","任務中 duty"],["event","剧情中 event"],["lookingforparty","希望組隊 lookingforparty"],["recruit","招募隊員中 recruit"],["lookingtomeld","接受鑲嵌請求 lookingtomeld"],["newadventurer","新人 newadventurer"],["mentor","指導者 mentor"],["tradementor","製作採集指導者 tradementor"],["pvementor","戰鬥指導者 pvementor"],["pvpmentor","對戰指導者 pvpmentor"],["roleplay","角色扮演中 roleplay"],["returner","回歸者 returner"]],"def":""}]},{"k":"row","label":"職業（選填，可多選；省略＝所有職業）","ctl":[{"t":"jobs","key":"jobs"}]},{"k":"row","label":"等級範圍（選填）","ctl":[{"t":"inp","key":"lvMin","type":"number","ph":"最低（省略＝所有等級）","min":"1","max":"100"},{"t":"text","text":"~"},{"t":"inp","key":"lvMax","type":"number","ph":"最高（留空＝與最低相同）","min":"1","max":"100"}]},{"k":"row","label":"大國防聯軍","ctl":[{"t":"sel","key":"gc","opts":[["","（不篩選）"],["Maelstrom","黑渦團 Maelstrom"],["Order of the Twin Adder","雙蛇黨 Order of the Twin Adder"],["Immortal Flames","恆輝隊 Immortal Flames"]],"def":""}]},{"k":"row","label":"所在地區","ctl":[{"t":"sel","key":"location","opts":[["","（不篩選，預設全世界）"],["Limsa Lominsa","利姆薩·羅敏薩"],["Gridania","格里達尼亞"],["Ul'dah","烏爾達哈"],["Ishgard","伊修加德"],["The Black Shroud","黑衣森林"],["Thanalan","薩納蘭"],["La Noscea","拉諾西亞"],["Mor Dhona","摩杜納"],["Coerthas","庫爾札斯"],["Dravania","龍堡"],["Abalathia's Spine","阿巴拉提亞"],["Kugane","龍宮城"],["Gyr Abania","基拉巴尼亞"],["Othard","奧薩德"],["The Crystarium","水晶都"],["Eulmore","幽爾牧場"],["Norvrandt","諾弗蘭特"]],"def":""}]},{"k":"row","label":"語言","ctl":[{"t":"sel","key":"lang","opts":[["","（不篩選，預設當前語言）"],["JA","日文 JA"],["EN","英文 EN"],["FR","法文 FR"],["DE","德文 DE"]],"def":""}]}]},"title":{"f":[{"k":"hint","t":"變更角色稱號。可指定稱號名稱、撤除，或隨機套用已獲得的稱號。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"sub","opts":[["random","隨機稱號（從已獲得中選）"],["set","指定稱號"],["clear","撤除稱號"]],"def":"random"}]}]},"partycmd":{"f":[{"k":"hint","t":"執行小隊相關指令。跨服組隊時僅支援「加入」子指令及開啟小隊視窗。"},{"k":"row","label":"子指令","ctl":[{"t":"sel","key":"sub","opts":[["","開啟小隊視窗"],["add","邀請玩家加入"],["accept","接受邀請"],["deny","拒絕邀請"],["leader","轉讓隊長"],["leave","退出小隊"],["kick","移除隊員"],["breakup","解散小隊"]],"def":""}]}]},"join":{"f":[{"k":"hint","t":"接受小隊組隊邀請。"}]},"decline":{"f":[{"k":"hint","t":"拒絕小隊組隊邀請。"}]},"invite":{"f":[{"k":"hint","t":"邀請指定玩家加入小隊。省略目標則邀請當前選中的玩家。"},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"kick":{"f":[{"k":"hint","t":"將指定隊員移除小隊。省略目標則對當前選中的玩家執行。"},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"leader":{"f":[{"k":"hint","t":"將隊長轉讓給指定玩家。省略目標則對當前選中的玩家執行。"},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"leave":{"f":[{"k":"hint","t":"退出當前所在的小隊。"}]},"psort":{"f":[{"k":"hint","t":"將小隊列表按指定順序重新排列。"}]},"meldrequest":{"f":[{"k":"hint","t":"向指定玩家發送魔晶石鑲嵌委託。省略目標則對當前選中的玩家發送。"},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"friendlist":{"f":[{"k":"hint","t":"/flist 執行好友名單相關指令。省略子指令則開啟好友名單視窗。「接受／拒絕」需搭配對方剛送出的好友邀請。"},{"k":"row","label":"子指令","ctl":[{"t":"sel","key":"sub","opts":[["","開啟好友名單視窗"],["add","加入（送出好友申請）"],["accept","接受（同意對方的申請）"],["deny","拒絕（拒絕對方的申請）"],["remove","清除（移出好友名單）"]],"def":""}]}]},"blacklist":{"f":[{"k":"hint","t":"/blist 執行黑名單相關指令。省略子指令則開啟黑名單視窗。"},{"k":"row","label":"子指令","ctl":[{"t":"sel","key":"sub","opts":[["","開啟黑名單視窗"],["add","加入（將對方帳號加入黑名單）"],["remove","清除（將對方移出黑名單）"]],"def":""}]}]},"levelsync":{"f":[{"k":"hint","t":"/levelsync 同步自己的等級至當前任務上限。再次執行解除同步。"}]},"statusoff":{"f":[{"k":"hint","t":"/statusoff \"狀態名稱\" 解除自身指定的單一強化狀態（如食物效果、藥水效果），需與遊戲內顯示名稱完全一致。"},{"k":"row","label":"狀態名稱","ctl":[{"t":"inp","key":"statusName","type":"text","ph":"狀態名稱（與遊戲完全一致），如：舍身"}]}]},"autolockon":{"f":[{"k":"hint","t":"開始自動攻擊時是否自動鎖定目標。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","開啟自動鎖定"],["off","關閉自動鎖定"],["toggle","切換（開↔關）"]],"def":"toggle"}]}]},"autofacetarget":{"f":[{"k":"hint","t":"發動技能時角色是否自動轉向面對目標。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","開啟自動轉向"],["off","關閉自動轉向"],["toggle","切換（開↔關）"]],"def":"toggle"}]}]},"autotarget":{"f":[{"k":"hint","t":"未選中目標時是否自動選中敵對目標。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","開啟自動選中"],["off","關閉自動選中"],["toggle","切換（開↔關）"]],"def":"toggle"}]}]},"targetself":{"f":[{"k":"hint","t":"是否可以將自己選為目標。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","開啟選中自己"],["off","關閉選中自己"],["toggle","切換（開↔關）"]],"def":"toggle"}]}]},"groundclick":{"f":[{"k":"hint","t":"點擊場景地面時是否取消當前選中的目標。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","點地面取消目標"],["off","關閉此功能"],["toggle","切換（開↔關）"]],"def":"toggle"}]}]},"duelswitch":{"f":[{"k":"hint","t":"設定是否強制拒絕其他玩家的決鬥申請。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","強制拒絕決鬥申請"],["off","接受決鬥申請"],["toggle","切換"]],"def":"toggle"}]}]},"actionerror":{"f":[{"k":"hint","t":"發動技能時，是否在螢幕上顯示錯誤提示（如：「目標超出範圍」）。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","顯示技能錯誤提示"],["off","關閉錯誤提示"],["toggle","切換（開↔關）"]],"def":"toggle"}]}]},"recasterror":{"f":[{"k":"hint","t":"技能冷卻中時，是否在螢幕上顯示複唱中的錯誤提示。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","顯示複唱錯誤提示"],["off","關閉錯誤提示"],["toggle","切換（開↔關）"]],"def":"toggle"}]}]},"hud":{"f":[{"k":"hint","t":"一次控制多個 UI 視窗的顯示狀態。勾選要操作的視窗，再選擇統一的操作方式。"},{"k":"row","label":"操作方式","ctl":[{"t":"sel","key":"toggle","opts":[["toggle","切換（開↔關）"],["on","全部顯示"],["off","全部隱藏"]],"def":"toggle"}]},{"k":"sep","t":"選擇要操作的視窗（可多選）"},{"k":"hudwins"}]},"battleeffect":{"f":[{"k":"hint","t":"/battleeffect 設定戰鬥特效的顯示密度，可分別設定自己、小隊、他人、PvP敵人。"},{"k":"row","label":"對象","ctl":[{"t":"sel","key":"effTarget","opts":[["self","自己"],["party","小隊"],["other","他人"],["enemypc","PvP敵方玩家"]],"def":"self"}]},{"k":"row","label":"顯示類型","ctl":[{"t":"sel","key":"effType","opts":[["all","完全顯示"],["simple","簡單顯示"],["off","不顯示"]],"def":"all"}]}]},"nameplatedisp":{"f":[{"k":"hint","t":"/nameplatedisp 設定指定對象的名牌「顯示時機」（何時看得到名牌）。若要改的是名牌上顯示全名／略名，請改用「名牌顯示格式 /nameplatetype」。"},{"k":"row","label":"對象","ctl":[{"t":"sel","key":"target","opts":[["all","全部玩家"],["self","自己"],["party","小隊成員"],["alliance","團隊成員"],["other","其他玩家"],["friend","好友"],["feast","群狼盛宴敵人"]],"def":"all"}]},{"k":"row","label":"顯示設定","ctl":[{"t":"sel","key":"setting","opts":[["1","1 — 一直顯示"],["2","2 — 戰鬥時顯示"],["3","3 — 選為目標時顯示"],["4","4 — 不顯示"]],"def":"1"}]}]},"nameplatetype":{"f":[{"k":"hint","t":"/nameplatetype 設定指定對象的名牌「顯示格式」（名字要顯示全名還是縮寫）。若要改的是名牌何時看得到，請改用「名牌顯示時機 /nameplatedisp」。"},{"k":"row","label":"對象","ctl":[{"t":"sel","key":"target","opts":[["all","全部玩家"],["self","自己"],["party","小隊成員"],["alliance","團隊成員"],["other","其他玩家"],["friend","好友"],["feast","群狼盛宴敵人"]],"def":"all"}]},{"k":"row","label":"格式","ctl":[{"t":"sel","key":"setting","opts":[["1","1 — 全名"],["2","2 — 略姓（僅顯示名，姓縮寫）"],["3","3 — 略名（僅顯示姓，名縮寫）"],["4","4 — 縮寫（僅顯示姓名首字母）"]],"def":"1"}]}]},"legacymark":{"f":[{"k":"hint","t":"顯示或隱藏自己角色頭上的十二神印記。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","顯示十二神印記"],["off","隱藏十二神印記"],["toggle","切換（顯示↔隱藏）"]],"def":"toggle"}]}]},"displayhead":{"f":[{"k":"hint","t":"顯示或隱藏自己的頭部裝備。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","顯示頭部裝備"],["off","隱藏頭部裝備"],["toggle","切換（顯示↔隱藏）"]],"def":"toggle"}]}]},"displayarms":{"f":[{"k":"hint","t":"收回武器時是否仍顯示武器於角色身上。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","收刀時仍顯示武器"],["off","收刀時隱藏武器"],["toggle","切換（顯示↔隱藏）"]],"def":"toggle"}]}]},"autosheathe":{"f":[{"k":"hint","t":"戰鬥結束後是否自動收回武器。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","戰鬥後自動收刀"],["off","關閉自動收刀"],["toggle","切換（開↔關）"]],"def":"toggle"}]}]},"jobhudmode":{"f":[{"k":"hint","t":"切換職業量譜（量表）的顯示模式（普通↔簡潔）。可針對第1或第2個量譜單獨切換，或全部一起切換。"},{"k":"row","label":"量譜","ctl":[{"t":"sel","key":"num","opts":[["","全部量譜一起切換"],["1","第 1 個量譜"],["2","第 2 個量譜"]],"def":""}]}]},"hudreset":{"f":[{"k":"hint","t":"將當前介面所有視窗的位置及縮放率重置為初始狀態。"}]},"uireset":{"f":[{"k":"hint","t":"將全部介面設定（1~4 組）及所有視窗的位置與縮放率重置為初始狀態。此操作會清除所有介面佈局，請謹慎使用。"}]},"uiscale":{"f":[{"k":"hint","t":"調整遊戲介面的縮放倍率。可選擇預設值或重置為初始狀態。"},{"k":"row","label":"縮放倍率","ctl":[{"t":"sel","key":"value","opts":[["reset","重置（恢復初始）"],["60","60%"],["80","80%"],["90","90%"],["100","100%（預設）"],["110","110%"],["120","120%"],["140","140%"]],"def":"100"}]}]},"chatlog":{"f":[{"k":"hint","t":"調整消息視窗的各項設定，包含字體大小、時間顯示格式及接收訊息的提示音。"},{"k":"row","label":"設定類型","ctl":[{"t":"sel","key":"sub","def":"fontsize","ref":"CHATLOG_SUBS"}]},{"k":"row","label":"消息欄編號（選填）","ctl":[{"t":"inp","key":"tabNum","type":"number","ph":"留空＝全部消息欄，填 1~4 指定消息欄","min":"1","max":"4"}]},{"k":"row","label":"字體大小","ctl":[{"t":"inp","key":"fontSize","type":"number","ph":"請填入字體大小數值","min":"1"}]}]},"targetring":{"f":[{"k":"hint","t":"顯示或隱藏目標環（選中目標時腳下的圓環）。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","顯示目標環"],["off","隱藏目標環"],["toggle","切換（顯示↔隱藏）"]],"def":"toggle"}]}]},"targetline":{"f":[{"k":"hint","t":"顯示或隱藏目標線（自身與目標之間的連線）。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","顯示目標線"],["off","隱藏目標線"],["toggle","切換（顯示↔隱藏）"]],"def":"toggle"}]}]},"linkline":{"f":[{"k":"hint","t":"顯示或隱藏聯繫線（連接有關聯的目標之間的連線）。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","顯示聯繫線"],["off","隱藏聯繫線"],["toggle","切換（顯示↔隱藏）"]],"def":"toggle"}]}]},"hotbar":{"f":[{"k":"hint","t":"操作一般熱鍵欄（非對戰區）或 PvP 熱鍵欄（對戰區）。可設置技能、更換、複製、顯示切換、共通設定或清除。"},{"k":"row","label":"區域","ctl":[{"t":"sel","key":"zone","opts":[["normal","一般熱鍵欄（非戰鬥區）"],["pvp","PvP 熱鍵欄（對戰區）"]],"def":"normal"}]},{"k":"row","label":"子指令","ctl":[{"t":"sel","key":"sub","def":"set","ref":"HOTBAR_SUBS"}]},{"k":"row","label":"類型","ctl":[{"t":"sel","key":"setType","def":"action","ref":"HOTBAR_SET_TYPES"}]},{"k":"row","label":"名稱","ctl":[{"t":"inp","key":"setName","type":"text","ph":"技能／道具／坐騎等名稱（與遊戲完全一致）"}]},{"k":"row","label":"熱鍵欄編號（選填）","ctl":[{"t":"inp","key":"num","type":"number","ph":"省略＝自動放到最小空位的熱鍵欄；填 1~10 指定","min":"1","max":"10"}]},{"k":"row","label":"格位編號（選填）","ctl":[{"t":"inp","key":"slot2","type":"number","ph":"省略＝自動放到最小空位；填 1~12 指定","min":"1","max":"12"}]}]},"pvphotbar":{"f":[{"k":"hint","t":"操作 PvP 專用熱鍵欄（只能在對戰區使用）。可設置PvP技能、更換、複製、顯示切換、共通設定或清除。"},{"k":"row","label":"子指令","ctl":[{"t":"sel","key":"sub","def":"set","ref":"HOTBAR_SUBS"}]},{"k":"row","label":"類型","ctl":[{"t":"sel","key":"setType","def":"action","ref":"HOTBAR_SET_TYPES_PVP"}]},{"k":"row","label":"名稱","ctl":[{"t":"inp","key":"setName","type":"text","ph":"PvP技能／道具等名稱（與遊戲完全一致）"}]},{"k":"row","label":"熱鍵欄編號（選填）","ctl":[{"t":"inp","key":"num","type":"number","ph":"省略＝自動放到最小空位的熱鍵欄；填 1~10 指定","min":"1","max":"10"}]},{"k":"row","label":"格位編號（選填）","ctl":[{"t":"inp","key":"slot2","type":"number","ph":"省略＝自動放到最小空位；填 1~12 指定","min":"1","max":"12"}]}]},"chotbar":{"f":[{"k":"hint","t":"操作十字熱鍵欄（一般版非對戰區，PvP版對戰區）。可設置技能、更換、複製、共通設定或清除。"},{"k":"row","label":"區域","ctl":[{"t":"sel","key":"zone","opts":[["normal","一般十字熱鍵欄（非戰鬥區）"],["pvp","PvP 十字熱鍵欄（對戰區）"]],"def":"normal"}]},{"k":"row","label":"子指令","ctl":[{"t":"sel","key":"sub","opts":[["set","設置技能（將技能/道具等放入指定位置）"],["change","更換（切換到指定編號）"],["copy","複製（複製熱鍵欄內容）"],["share","共通（設定全職業共通）"],["remove","清除（解除指定位置技能）"]],"def":"set"}]},{"k":"row","label":"類型","ctl":[{"t":"sel","key":"setType","def":"action","ref":"HOTBAR_SET_TYPES"}]},{"k":"row","label":"名稱","ctl":[{"t":"inp","key":"setName","type":"text","ph":"技能／道具等名稱（與遊戲完全一致）"}]},{"k":"row","label":"十字熱鍵欄編號（選填）","ctl":[{"t":"inp","key":"num","type":"number","ph":"省略＝自動；填 1~8 指定","min":"1","max":"8"}]},{"k":"row","label":"位置（選填）","ctl":[{"t":"sel","key":"pos","opts":[["","省略（自動放到最小空位）"],["LD1","左 ↙ LD1"],["LD2","左 ↑ LD2"],["LD3","左 ↗ LD3"],["LD4","左 ↓ LD4"],["LA1","左 LA1"],["LA2","左 LA2"],["LA3","左 LA3"],["LA4","左 LA4"],["RD1","右 ↙ RD1"],["RD2","右 ↑ RD2"],["RD3","右 ↗ RD3"],["RD4","右 ↓ RD4"],["RA1","右 RA1"],["RA2","右 RA2"],["RA3","右 RA3"],["RA4","右 RA4"]],"def":""}]}]},"pvpchotbar":{"f":[{"k":"hint","t":"操作 PvP 專用十字熱鍵欄（只能在對戰區使用）。可設置PvP技能、更換、複製、共通設定或清除。"},{"k":"row","label":"子指令","ctl":[{"t":"sel","key":"sub","opts":[["set","設置技能（將PvP技能等放入指定位置）"],["change","更換（切換到指定編號）"],["copy","複製（複製熱鍵欄內容）"],["share","共通（設定全職業共通）"],["remove","清除（解除指定位置技能）"]],"def":"set"}]},{"k":"row","label":"類型","ctl":[{"t":"sel","key":"setType","def":"action","ref":"HOTBAR_SET_TYPES_PVP"}]},{"k":"row","label":"名稱","ctl":[{"t":"inp","key":"setName","type":"text","ph":"PvP技能等名稱（與遊戲完全一致）"}]},{"k":"row","label":"十字熱鍵欄編號（選填）","ctl":[{"t":"inp","key":"num","type":"number","ph":"省略＝自動；填 1~8 指定","min":"1","max":"8"}]},{"k":"row","label":"位置（選填）","ctl":[{"t":"sel","key":"pos","opts":[["","省略（自動放到最小空位）"],["LD1","左 ↙ LD1"],["LD2","左 ↑ LD2"],["LD3","左 ↗ LD3"],["LD4","左 ↓ LD4"],["LA1","左 LA1"],["LA2","左 LA2"],["LA3","左 LA3"],["LA4","左 LA4"],["RD1","右 ↙ RD1"],["RD2","右 ↑ RD2"],["RD3","右 ↗ RD3"],["RD4","右 ↓ RD4"],["RA1","右 RA1"],["RA2","右 RA2"],["RA3","右 RA3"],["RA4","右 RA4"]],"def":""}]}]},"chotbardisplay":{"f":[{"k":"hint","t":"設定是否一直顯示十字熱鍵欄（即使未按下 LT/RT 也持續顯示）。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","一直顯示十字熱鍵欄"],["off","關閉一直顯示"],["toggle","切換（開↔關）"]],"def":"toggle"}]}]},"chotbartype":{"f":[{"k":"hint","t":"變更十字熱鍵欄的操作類型。按住：需持續按 LT/RT；單擊：點一下切換；混合：結合兩者。"},{"k":"row","label":"操作類型","ctl":[{"t":"sel","key":"type","opts":[["hold","按住（Hold）"],["toggle","單擊（Toggle）"],["mix","混合（Mix）"]],"def":"hold"}]}]},"gpreset":{"f":[{"k":"hint","t":"快速切換圖像品質預設設定。"},{"k":"row","label":"預設組","ctl":[{"t":"sel","key":"num","def":"2","ref":"GPRESET_OPTS"}]}]},"mastervolume":{"f":[{"k":"hint","t":"調整遊戲整體音量（0~100）。留空則切換靜音/取消靜音。"},{"k":"row","label":"音量（選填）","ctl":[{"t":"inp","key":"value","type":"number","ph":"0~100，留空＝切換靜音","min":"0","max":"100"}]}]},"bgm":{"f":[{"k":"hint","t":"調整背景音樂音量（0~100）。留空則切換靜音/取消靜音。"},{"k":"row","label":"音量（選填）","ctl":[{"t":"inp","key":"value","type":"number","ph":"0~100，留空＝切換靜音","min":"0","max":"100"}]}]},"soundeffects":{"f":[{"k":"hint","t":"調整整體音效音量（0~100）。留空則切換靜音/取消靜音。"},{"k":"row","label":"音量（選填）","ctl":[{"t":"inp","key":"value","type":"number","ph":"0~100，留空＝切換靜音","min":"0","max":"100"}]}]},"voice":{"f":[{"k":"hint","t":"調整語音音量（0~100）。留空則切換靜音/取消靜音。"},{"k":"row","label":"音量（選填）","ctl":[{"t":"inp","key":"value","type":"number","ph":"0~100，留空＝切換靜音","min":"0","max":"100"}]}]},"systemsounds":{"f":[{"k":"hint","t":"調整系統音效音量（0~100）。留空則切換靜音/取消靜音。"},{"k":"row","label":"音量（選填）","ctl":[{"t":"inp","key":"value","type":"number","ph":"0~100，留空＝切換靜音","min":"0","max":"100"}]}]},"ambientsounds":{"f":[{"k":"hint","t":"調整環境音效音量（0~100）。留空則切換靜音/取消靜音。"},{"k":"row","label":"音量（選填）","ctl":[{"t":"inp","key":"value","type":"number","ph":"0~100，留空＝切換靜音","min":"0","max":"100"}]}]},"soundeffectsself":{"f":[{"k":"hint","t":"調整自己角色的音效音量（0~100）。"},{"k":"row","label":"音量","ctl":[{"t":"inp","key":"value","type":"number","ph":"0~100","min":"0","max":"100"}]}]},"soundeffectsparty":{"f":[{"k":"hint","t":"調整小隊成員的音效音量（0~100）。"},{"k":"row","label":"音量","ctl":[{"t":"inp","key":"value","type":"number","ph":"0~100","min":"0","max":"100"}]}]},"soundeffectsother":{"f":[{"k":"hint","t":"調整其他玩家的音效音量（0~100）。"},{"k":"row","label":"音量","ctl":[{"t":"inp","key":"value","type":"number","ph":"0~100","min":"0","max":"100"}]}]},"performsounds":{"f":[{"k":"hint","t":"調整樂器演奏的音量（0~100）。留空則切換靜音/取消靜音。"},{"k":"row","label":"音量（選填）","ctl":[{"t":"inp","key":"value","type":"number","ph":"0~100，留空＝切換靜音","min":"0","max":"100"}]}]},"mountbgm":{"f":[{"k":"hint","t":"設定騎乘坐騎時是否播放坐騎專屬背景音樂。"},{"k":"row","label":"操作","ctl":[{"t":"sel","key":"toggle","opts":[["on","播放坐騎音樂"],["off","不播放坐騎音樂"],["toggle","切換（開↔關）"]],"def":"toggle"}]}]},"systemsoundsspeaker":{"f":[{"k":"hint","t":"調整 PS4/PS5/Windows DX11 無線手柄揚聲器的系統音效音量（0~100）。留空則切換靜音/取消靜音。"},{"k":"row","label":"音量（選填）","ctl":[{"t":"inp","key":"value","type":"number","ph":"0~100，留空＝切換靜音","min":"0","max":"100"}]}]},"magiaright":{"f":[{"k":"hint","t":"將魔素板順時針轉動一格，切換到下一個屬性。"}]},"magialeft":{"f":[{"k":"hint","t":"將魔素板逆時針轉動一格，切換到上一個屬性。"}]},"magiaattack":{"f":[{"k":"hint","t":"自動將魔素板切換為攻擊時克制當前目標的屬性。省略目標則使用當前選中的目標。"},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"magiadefense":{"f":[{"k":"hint","t":"自動將魔素板切換為與當前目標相同的屬性（利於防禦）。省略目標則使用當前選中的目標。"},{"k":"row","label":"目標（選填）","ctl":[{"t":"sel","key":"target","def":"","ref":"TGT"}]}]},"magiaauto":{"f":[{"k":"hint","t":"設定魔素板是否在選中目標後自動切換屬性。"},{"k":"row","label":"模式","ctl":[{"t":"sel","key":"mode","opts":[["atk","攻勢（自動切換為克制屬性）"],["def","守勢（自動切換為相同屬性）"],["off","關閉自動調整"]],"def":"off"}]}]},"playtime":{"f":[{"k":"hint","t":"在消息欄顯示當前角色的累計遊戲時間。"}]},"logout":{"f":[{"k":"hint","t":"退出遊戲並回到標題畫面。"}]},"shutdown":{"f":[{"k":"hint","t":"直接退出並結束遊戲程式。"}]},"instance":{"f":[{"k":"hint","t":"檢查當前所在地區是否為副本區域，並在消息欄顯示結果。"}]},"patchnote":{"f":[{"k":"hint","t":"開啟瀏覽器並前往官方網站的版本更新筆記頁面。"}]},"micon":{"f":[{"k":"hint","t":"設定巨集在熱鍵欄上顯示的圖示。同一巨集只有第一個 /micon 生效，建議放第一行。"},{"k":"row","label":"圖示類型","ctl":[{"t":"sel","key":"miconType","def":"action","ref":"MICON_T"}]},{"k":"row","label":"名稱","ctl":[{"t":"inp","key":"miconName","type":"text","ph":"名稱（與遊戲完全一致）"}]}]},"mlock":{"f":[{"k":"hint","t":"/mlock 讓巨集執行完畢前不允許其他巨集打斷。建議複雜巨集使用，放在第一行效果最好（亦可用上方全域設定）。"}]},"merror_line":{"f":[{"k":"hint","t":"控制巨集執行時是否顯示錯誤訊息。巨集結束後自動恢復顯示，無需手動開啟。"},{"k":"row","label":"設定","ctl":[{"t":"sel","key":"onOff","opts":[["off","關閉錯誤提示（適合技能輪換、整理類巨集）"],["on","開啟錯誤提示"],["toggle","切換"]],"def":"off"}]}]},"wait_line":{"f":[{"k":"hint","t":"在巨集中插入等待時間（1~60秒）。讓後續行在指定秒數後才執行。"},{"k":"row","label":"等待秒數","ctl":[{"t":"inp","key":"secs","type":"number","ph":"1~60","min":"1","max":"60"}]}]},"custom":{"f":[{"k":"hint","t":"直接輸入任何完整指令，原樣輸出。請確保語法完全正確，工具不做任何處理。"},{"k":"row","label":"完整指令","ctl":[{"t":"inp","key":"text","type":"text","ph":"輸入完整指令，如：/ta <t>"}]}]}};
var LISTS={MAX:MAX,MAX_C:MAX_C,WARN_C:WARN_C,SE:SE,TGT:TGT,CH:CH,MICON_T:MICON_T,HUD_W:HUD_W,IS_AREAS:IS_AREAS,IS_C:IS_C,EMOTES:EMOTES,JOBS:JOBS,PETMIRAGE_PETS:PETMIRAGE_PETS,PETMIRAGE_APPEARANCES:PETMIRAGE_APPEARANCES,PETSIZE_PETS:PETSIZE_PETS,GPRESET_OPTS:GPRESET_OPTS,ALARM_TTYPE:ALARM_TTYPE,HOTBAR_SUBS:HOTBAR_SUBS,HOTBAR_SET_TYPES:HOTBAR_SET_TYPES,HOTBAR_SET_TYPES_PVP:HOTBAR_SET_TYPES_PVP,CHATLOG_SUBS:CHATLOG_SUBS,WINDOW_LIST:WINDOW_LIST,CHATLOG_CH:CHATLOG_CH,CATS:CATS,TEMPLATES:TEMPLATES,PRONS:PRONS,MSG_PROS:MSG_PROS,DICE_CH:DICE_CH,KNOWN_CMDS:KNOWN_CMDS};
window.MacroData={LISTS:LISTS,SCHEMA:SCHEMA,buildLines:buildLines,cc:cc,esc:esc,MAX:MAX,MAX_C:MAX_C,WARN_C:WARN_C,CATS:CATS,TDEFS:TDEFS,TEMPLATES:TEMPLATES,PRONS:PRONS,MSG_PROS:MSG_PROS};
})();
