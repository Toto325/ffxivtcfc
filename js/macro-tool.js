/* macro-tool.js v2 — FF14 巨集建立工具 */
(function(){
'use strict';
var MAX=15,MAX_C=180,WARN_C=150;
var lines=[],nextId=1,globalCfg={merrorOff:false,mlock:false},pickerCat=null,pickerSearch='',splitData=null,activeLineId=null;

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
  {v:'surprised',l:'驚訝'},{v:'angry',l:'不滿'},{v:'furious',l:'憤怒'},
  {v:'blush',l:'害羞'},{v:'bow',l:'行禮'},{v:'cheer',l:'加油'},
  {v:'clap',l:'拍手'},{v:'beckon',l:'招手'},{v:'comfort',l:'安慰'},
  {v:'cry',l:'哭泣'},{v:'dance',l:'跳舞'},{v:'doubt',l:'質疑'},
  {v:'doze',l:'打盹'},{v:'fume',l:'後悔'},{v:'goodbye',l:'道別'},
  {v:'wave',l:'揮手'},{v:'huh',l:'莫名'},{v:'joy',l:'高興'},
  {v:'kneel',l:'下跪'},{v:'chuckle',l:'輕笑'},{v:'laugh',l:'大笑'},
  {v:'lookout',l:'張望'},{v:'me',l:'展示'},{v:'no',l:'搖頭'},
  {v:'deny',l:'否定'},{v:'panic',l:'慌亂'},{v:'point',l:'指向'},
  {v:'poke',l:'戳指'},{v:'congratulate',l:'稱讚'},{v:'psych',l:'激勵'},
  {v:'salute',l:'敬禮'},{v:'shocked',l:'震驚'},{v:'shrug',l:'聳肩'},
  {v:'rally',l:'鼓勵'},{v:'soothe',l:'安撫'},{v:'stagger',l:'迷糊'},
  {v:'stretch',l:'伸展'},{v:'sulk',l:'愠怒'},{v:'think',l:'思考'},
  {v:'upset',l:'失望'},{v:'welcome',l:'歡迎'},{v:'yes',l:'點頭'},
  {v:'thumbsup',l:'肯定'},{v:'examineself',l:'自視'},{v:'pose',l:'擺造型'},
  {v:'blowkiss',l:'飛吻'},{v:'grovel',l:'下跪認錯'},{v:'happy',l:'欣喜若狂'},
  {v:'disappointed',l:'大失所望'},{v:'sit',l:'坐下'},{v:'airquotes',l:'引用'},
  {v:'gcsalute',l:'軍禮'},{v:'pray',l:'祈禱'},{v:'imperialsalute',l:'帝國式軍禮'},
  {v:'straightface',l:'平常'},{v:'smile',l:'微笑'},{v:'grin',l:'笑顏'},
  {v:'smirk',l:'自信'},{v:'taunt',l:'無畏'},{v:'shuteyes',l:'閉目'},
  {v:'sad',l:'悲傷'},{v:'scared',l:'恐怖'},{v:'amazed',l:'意外'},
  {v:'ouch',l:'痛苦'},{v:'annoyed',l:'反感'},{v:'alert',l:'吃驚'},
  {v:'worried',l:'擔心'},{v:'throw',l:'投擲'},{v:'changepose',l:'改變姿勢'},
  {v:'stepdance',l:'踢踏舞'},{v:'harvestdance',l:'豐饒之舞'},{v:'balldance',l:'宮廷之舞'},
  {v:'mandervilledance',l:'紳士之舞'},{v:'stroke',l:'撫摸'},{v:'handover',l:'遞交'},
  {v:'bombdance',l:'火盆舞'},{v:'hurray',l:'勝利歡呼'},{v:'slap',l:'甩巴掌'},
  {v:'hug',l:'擁抱'},{v:'embrace',l:'深情擁抱'},{v:'hildibrand',l:'紳士風度'},
  {v:'fistbump',l:'對拳'},{v:'thavdance',l:'薩維奈舞'},{v:'golddance',l:'黃金之舞'},
  {v:'sundance',l:'太陽之舞'},{v:'battlestance',l:'準備戰鬥'},{v:'victorypose',l:'歡呼勝利'},
  {v:'backflip',l:'後空翻'},{v:'easterngreeting',l:'抱拳禮'},{v:'eureka',l:'靈光一現'},
  {v:'mogdance',l:'莫古莫古舞'},{v:'haurchefant',l:'太棒了'},{v:'easternstretch',l:'熱身'},
  {v:'easterndance',l:'東方傳統舞蹈'},{v:'rangerpose1r',l:'戰隊演武正紅一式'},
  {v:'rangerpose2r',l:'戰隊演武正黑二式'},{v:'rangerpose3r',l:'戰隊演武正黃三式'},
  {v:'wink',l:'飛眼'},{v:'rangerpose1l',l:'戰隊演武逆紅一式'},
  {v:'rangerpose2l',l:'戰隊演武逆黑二式'},{v:'rangerpose3l',l:'戰隊演武逆黃三式'},
  {v:'facepalm',l:'捂臉'},{v:'zantetsuken',l:'斬鐵劍'},{v:'flex',l:'肉體之美'},
  {v:'respect',l:'默哀'},{v:'sneer',l:'陰險'},{v:'prettyplease',l:'撒嬌'},
  {v:'playdead',l:'裝死'},{v:'moonlift',l:'日月之舞'},{v:'dote',l:'表達愛意'},
  {v:'spectacles',l:'托眼鏡'},{v:'songbird',l:'小黃鶯之舞'},{v:'waterfloat',l:'浮水'},
  {v:'waterflip',l:'水中翻跟頭'},{v:'puckerup',l:'嘟嘴'},{v:'powerup',l:'蓄力迸發'},
  {v:'easternbow',l:'行東方禮'},{v:'squats',l:'深蹲'},{v:'pushups',l:'伏地挺身'},
  {v:'situps',l:'仰臥起坐'},{v:'breathcontrol',l:'深呼吸'},{v:'converse',l:'說話'},
  {v:'concentrate',l:'認真'},{v:'disturbed',l:'困惑'},{v:'simper',l:'柔和'},
  {v:'beam',l:'滿足'},{v:'attention',l:'立正'},{v:'atease',l:'稍息'},
  {v:'box',l:'練拳'},{v:'ritualprayer',l:'祝禱'},{v:'tremble',l:'害怕'},
  {v:'winded',l:'單膝跪地'},{v:'aback',l:'大吃一驚'},{v:'greet',l:'打招呼'},
  {v:'boxstep',l:'方形步'},{v:'sidestep',l:'側步'},{v:'ultima',l:'究極'},
  {v:'yoldance',l:'胡鷹之舞'},{v:'splash',l:'撩水'},{v:'sweat',l:'好熱'},
  {v:'shiver',l:'好冷'},{v:'elucidate',l:'說明'},{v:'ponder',l:'思索'},
  {v:'leftwink',l:'左飛眼'},{v:'getfantasy',l:'幻想舞步'},{v:'popotostep',l:'波波托步'},
  {v:'hum',l:'哼歌'},{v:'confirm',l:'確認'},{v:'scheme',l:'說明計劃'},
  {v:'endure',l:'忍耐'},{v:'tomestone',l:'神典石'},{v:'heeltoe',l:'趾踵步'},
  {v:'goobbuedo',l:'古菩步'},{v:'gratuity',l:'心意'},{v:'fistpump',l:'振作精神'},
  {v:'reprimand',l:'提醒'},{v:'sabotender',l:'優雅仙人刺'},{v:'mandervillemambo',l:'紳士舞步'},
  {v:'laliho',l:'啦哩吼'},{v:'simulationm',l:'歐米茄M架勢'},{v:'simulationf',l:'歐米茄F架勢'},
  {v:'toast',l:'乾杯'},{v:'lean',l:'背靠'},{v:'headache',l:'頭痛'},
  {v:'snap',l:'打響指'},{v:'breakfast',l:'吃麵包'},{v:'read',l:'看書'},
  {v:'insist',l:'堅持主張'},{v:'consider',l:'疑問'},{v:'wasshoi',l:'嘿哟'},
  {v:'flowershower',l:'花雨'},{v:'flamedance',l:'火焰之舞'},{v:'highfive',l:'擊掌'},
  {v:'guard',l:'巡視'},{v:'malevolence',l:'詛咒'},{v:'beesknees',l:'蜜蜂之舞'},
  {v:'lalihop',l:'啦哩吼舞'},{v:'eatriceball',l:'吃飯糰'},{v:'eatapple',l:'吃蘋果'},
  {v:'wringhands',l:'搓手'},{v:'sweep',l:'掃地'},{v:'paintblack',l:'黑色陸行鳥之筆'},
  {v:'paintred',l:'紅色陸行鳥之筆'},{v:'paintyellow',l:'黃色陸行鳥之筆'},
  {v:'paintblue',l:'藍色陸行鳥之筆'},{v:'fakesmile',l:'假笑'},
  {v:'pantomime',l:'默劇'},{v:'vexed',l:'不解'},{v:'shush',l:'嘘'},
  {v:'eatpizza',l:'吃披薩'},{v:'reference',l:'比對文獻'},
  {v:'adventoflight',l:'神使降臨'},{v:'allsaintscharm',l:'萬聖護符'},{v:'attend',l:'待命'},
  {v:'biggrin',l:'咧嘴大笑'},{v:'blackrangerposea',l:'黑騎士造型A'},{v:'blackrangerposeb',l:'黑騎士造型B'},
  {v:'blowbubbles',l:'吹泡泡'},{v:'blownaway',l:'被震飛'},{v:'bouquet',l:'獻花束'},
  {v:'breakdance',l:'霹靂舞'},{v:'cackle',l:'高傲冷笑'},{v:'carrybook',l:'抱書'},
  {v:'charmed',l:'意亂情迷'},{v:'cheerjump',l:'應援跳躍：紅'},{v:'cheerjumpgreen',l:'應援跳躍：綠'},
  {v:'cheerjumpindigo',l:'應援跳躍：靛'},{v:'cheerlightblue',l:'應援搖擺：藍'},{v:'cheerlightgreen',l:'應援搖擺：綠'},
  {v:'cheerlightyellow',l:'應援搖擺：黃'},{v:'cheeronblue',l:'應援揮舞：藍'},{v:'cheeronbright',l:'應援揮舞：白'},
  {v:'cheeronorange',l:'應援揮舞：橘'},{v:'cheerrhythmbright',l:'應援打拍：白'},{v:'cheerrhythmred',l:'應援打拍：紅'},
  {v:'cheerrhythmviolet',l:'應援打拍：紫'},{v:'cheerwave',l:'應援揮手：黃'},{v:'cheerwavepink',l:'應援揮手：粉'},
  {v:'cheerwaveviolet',l:'應援揮手：紫'},{v:'clutchhead',l:'抱頭'},{v:'conduct',l:'指揮'},
  {v:'content',l:'滿足微笑'},{v:'crimsonlotus',l:'赤蓮之技'},{v:'dazed',l:'頭暈眼花'},
  {v:'delighted',l:'陶醉捧臉'},{v:'deride',l:'嘲諷冷笑'},{v:'determined',l:'握拳決心'},
  {v:'devourtaco',l:'狂吃塔可'},{v:'divinearm',l:'神兵：臂'},{v:'divinedisk',l:'神兵：盤'},
  {v:'divinetiara',l:'神兵：冠'},{v:'draw',l:'拔出武器'},{v:'drinkgreentea',l:'喝綠茶'},
  {v:'earwiggle',l:'搖耳朵'},{v:'eatchicken',l:'吃炸雞'},{v:'eatchocolate',l:'吃巧克力'},
  {v:'eategg',l:'吃水煮蛋'},{v:'eatpumpkincookie',l:'吃南瓜餅乾'},{v:'eattaco',l:'吃塔可'},
  {v:'frighten',l:'裝可怕'},{v:'fryegg',l:'煎蛋'},{v:'furrow',l:'皺眉'},
  {v:'gridaniangulp',l:'暢飲格里達尼亞特調'},{v:'gridaniansip',l:'小酌格里達尼亞特調'},{v:'groundsit',l:'坐在地上'},
  {v:'handtoheart',l:'手撫胸口'},{v:'humbletriumph',l:'略帶得意'},{v:'iceheart',l:'鑽石星塵'},
  {v:'jumpforjoy1',l:'歡喜跳躍1'},{v:'jumpforjoy2',l:'歡喜跳躍2'},{v:'jumpforjoy3',l:'歡喜跳躍3'},
  {v:'jumpforjoy4',l:'歡喜跳躍4'},{v:'jumpforjoy5',l:'歡喜跳躍5（仙人刺）'},{v:'limberup',l:'甩臂熱身'},
  {v:'linkpearl',l:'通訊貝通話'},{v:'littleladiesdance',l:'小小姐之舞'},{v:'lominsangulp',l:'暢飲利姆薩·羅敏薩特調'},
  {v:'lominsansip',l:'小酌利姆薩·羅敏薩特調'},{v:'lophop',l:'洛波跳躍'},{v:'loveheart',l:'比愛心'},
  {v:'magictrick',l:'魔術戲法'},{v:'megaflare',l:'究極核爆'},{v:'ohokaliy',l:'哈奴哈奴式問候'},
  {v:'overreact',l:'誇張驚訝'},{v:'pen',l:'用羽毛筆寫字'},{v:'photograph',l:'拍立得拍照'},
  {v:'rage',l:'憤怒顫抖'},{v:'redrangerposea',l:'紅騎士造型A'},{v:'redrangerposeb',l:'紅騎士造型B'},
  {v:'reflect',l:'閉眼沉思'},{v:'runwaywalk',l:'伸展台走秀'},{v:'savortea',l:'品茶'},
  {v:'scoff',l:'冷笑'},{v:'shakedrink',l:'調酒'},{v:'sheathe',l:'收回武器'},
  {v:'showleft',l:'展示左側'},{v:'showright',l:'展示右側'},{v:'slump',l:'垂頭喪氣'},
  {v:'spirit',l:'展現團隊精神'},{v:'standup',l:'站起身'},{v:'stomp',l:'跺地洩憤'},
  {v:'study',l:'專心研讀'},{v:'sundering',l:'天崩地裂'},{v:'tea',l:'品茶（優雅）'},
  {v:'tomescroll',l:'摩挲神典石祈求'},{v:'twirl',l:'旋轉展示服裝'},{v:'uchiwasshoi',l:'團扇嘿咻舞'},
  {v:'uldahngulp',l:'暢飲烏爾達哈特調'},{v:'uldahnsip',l:'小酌烏爾達哈特調'},{v:'unbound',l:'解放姿態'},
  {v:'victoryreveal',l:'靜候佳音'},{v:'visage',l:'拍攝面容'},{v:'visor',l:'開闔面罩'},
  {v:'water',l:'灑水'},{v:'wow',l:'驚豔閃亮'},{v:'yellowrangerposea',l:'黃騎士造型A'},
  {v:'yellowrangerposeb',l:'黃騎士造型B'},
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
  {id:'chat',icon:'💬',label:'聊天公告',desc:'3秒倒數通知小隊出發',
   lines:[
    {type:'mlock',params:{},note:'鎖定巨集防止中斷'},
    {type:'chat',params:{channel:'p',message:'準備好了嗎？',inlineWait:1},note:''},
    {type:'chat',params:{channel:'p',message:'3...',inlineWait:1},note:''},
    {type:'chat',params:{channel:'p',message:'2...',inlineWait:1},note:''},
    {type:'chat',params:{channel:'p',message:'1...',inlineWait:1},note:''},
    {type:'chat',params:{channel:'p',message:'出發！'},note:''}
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
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function so(opts,cur){return opts.map(function(o){return '<option value="'+esc(o.v)+'"'+(o.v===cur?' selected':'')+'>'+esc(o.l)+'</option>';}).join('');}
function dc(o){return JSON.parse(JSON.stringify(o));}
function tv(p,key,ckey){var v=p[key];return v==='custom'?(p[ckey]||'<t>'):v||'';}
function seStr(se){return se?(' '+se):'';}
function waitStr(w){var n=parseInt(w)||0;return n>0?'<wait.'+n+'>':'';}

/* 插入代名詞到輸入框游標位置 */
var _lastMsgInput=null;
function insertAtCursor(inp,text){
  if(!inp) return;
  var s=inp.selectionStart||0,e=inp.selectionEnd||0,v=inp.value||'';
  inp.value=v.slice(0,s)+text+v.slice(e);
  inp.selectionStart=inp.selectionEnd=s+text.length;
  inp.dispatchEvent(new Event('input'));inp.focus();
}

/* 可編輯預覽狀態 */
var previewEditable=false;
/* ════════════════════════════════════════════════
   COMMAND BUILDERS — returns array of strings
════════════════════════════════════════════════ */
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
function renderKeepScroll(){
  var frame=document.querySelector('.macro-root-frame');
  var st=frame?frame.scrollTop:0;
  render();
  if(frame) frame.scrollTop=st;
}
function getAllOutput(){
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
  // Always place /micon at the end (game only reads the last one for display)
  // Note: only the FIRST /micon in the final macro affects the hotbar icon;
  // we keep all of them but sorted to end so user can see they exist.
  miconLines.forEach(function(s){out.push(s);});
  return out;
}

function getTotalLines(){return getAllOutput().length;}

/* ── Per-line preview ── */
function linePreview(line){return buildLines(line).join(' | ');}
function lineCount(line){return buildLines(line).length;}

/* ════════════════════════════════════════════════
   VALIDATION
════════════════════════════════════════════════ */
function validate(){
  var W=[], total=getTotalLines();
  if(total>MAX) W.push({lv:'error',msg:'行數超出上限：目前共 '+total+' 行（最多 '+MAX+' 行）。請刪除部分行或使用「分割巨集」功能。'});
  getAllOutput().forEach(function(s,i){var c=cc(s);if(c>MAX_C)W.push({lv:'error',msg:'第 '+(i+1)+' 行字元超出上限（'+c+'/180）'});});
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

/* ════════════════════════════════════════════════
   FIELD RENDERERS
════════════════════════════════════════════════ */
function fRow(label,content,hint){
  // 無障礙修正：把這一行的標籤文字，自動補進內容裡每個 input/select/textarea 的
  // title 屬性（若該元素本身還沒有 title），讓螢幕閱讀器/自動化檢測工具能辨識
  // 到可存取名稱（accessible name），不用逐一改寫上百處呼叫端。
  var titled=content.replace(/<(input|select|textarea)((?:(?!title=)[^>])*)>/gi,function(m,tag,rest){
    return '<'+tag+rest+' title="'+esc(label)+'">';
  });
  return '<div class="mf-row"><span class="mf-lbl">'+label+'</span><div class="mf-cnt">'+titled+(hint?'<span class="mf-unit">'+hint+'</span>':'')+'</div></div>';
}
function fInp(id,key,ph,val,type,extra){type=type||'text';extra=extra||'';var fid='mf_'+id+'_'+key;return '<input class="mf-inp" id="'+fid+'" name="'+fid+'" data-id="'+id+'" data-key="'+key+'" type="'+type+'" placeholder="'+esc(ph)+'" value="'+esc(val||'')+'" '+extra+'>';}
function fSel(id,key,opts,cur,cls){var fid='mf_'+id+'_'+key;return '<select class="mf-sel'+(cls?' '+cls:'')+'" id="'+fid+'" name="'+fid+'" data-id="'+id+'" data-key="'+key+'">'+so(opts,cur)+'</select>';}
function fChk(id,key,label,checked){return '<label class="mf-check"><input type="checkbox" data-id="'+id+'" data-key="'+key+'"'+(checked?' checked':'')+'><span>'+label+'</span></label>';}
function fHint(msg){return '<div class="mf-hint">'+msg+'</div>';}
function fSep(label){return '<div class="mf-sep"><span>'+label+'</span></div>';}
function fTgt(id,key,cur){
  var sel=fSel(id,key,TGT,cur);
  var custom=cur==='custom'?fInp(id,'targetCustom','自訂代名詞（如 <2>）',''):'' ;
  return sel+custom;
}
function fSE(id,key,cur){return fSel(id,key,SE,cur||'');}
function fCH(id,key,cur){return fSel(id,key,CH,cur||'p');}

/* 訊息輸入框 + 內嵌代名詞選擇器 */
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
function fMsgInp(id,key,ph,val){
  var chips=MSG_PROS.map(function(p){
    return '<span class="inline-pro" data-sym="'+esc(p.v)+'" title="'+esc(p.l)+'">'+esc(p.v)+'</span>';
  }).join('');
  return '<div class="msg-inp-wrap">'
    +'<input class="mf-inp msg-inp" data-id="'+id+'" data-key="'+key+'" placeholder="'+esc(ph)+'" value="'+esc(val||'')+'">'
    +'<div class="inline-pro-row">'+chips+'</div>'
    +'</div>';
}

function renderFields(line){
  var p=line.params||{}, id=line.id;
  switch(line.type){
    /* ── 說話 / 通知（原有）── */
    case 'chat': return renderChatFields(line);
    case 'chatcountdown': return renderChatCountdownFields(line);
    case 'echo': return renderEchoFields(line);
    case 'tell': return renderTellFields(line);
    case 'reply': return renderReplyFields(line);
    case 'cth': return fHint('/cth 清除所有透過悄悄話（/tell）收發的歷史紀錄。無參數、無需設定。');
    case 'em': return renderEmFields(line);
    /* ── 技能 / 道具（原有）── */
    case 'skill': case 'generalskill': case 'blueaction':
    case 'pvpaction': case 'petaction': case 'companionaction':
      return renderSkillFields(line,line.type);
    case 'item': return renderItemFields(line);
    case 'itemsearch': return fHint('/isearch 在背包、雇員物品、兵裝庫、陸行鳥鞍囊、收藏柜、投影台中，完整搜尋含有指定關鍵字的道具。無法用於巨集內（僅能在對話欄直接輸入）。')+
      fRow('關鍵字',fInp(id,'itemName','道具名稱關鍵字（如：恢復藥）',p.itemName));
    case 'emote': return renderEmoteFields(line);
    case 'abilityrotation': return renderAbilityRotation(line);
    /* ── 目標操作（原有）── */
    case 'openwindow': return fHint('開啟（或關閉，若已開啟）指定的選單／清單視窗。多數視窗指令再次執行會直接關閉。')+
      fRow('視窗',fSel(id,'winCmd',WINDOW_LIST,p.winCmd||'bag'));
    case 'targeting': return renderTargetingFields(line);
    case 'check': return renderCheckFields(line);
    case 'trade': return renderTradeFields(line);
    case 'assist': return renderAssistFields(line);
    case 'focustarget': return renderFocusTargetFields(line);
    case 'facetarget': return renderFaceTargetFields(line);
    case 'lockon': return renderLockOnFields(line);
    case 'marking': return renderMarkingFields(line);
    case 'waymark': return renderWaymarkFields(line);
    /* ── 計時 / 通報（原有）── */
    case 'countdown_sys': return renderCountdownFields(line);
    case 'readycheck': return renderReadycheckFields(line);
    case 'ready': return fHint('/rd — 回應準備確認：準備完畢。');
    case 'notready': return fHint('/nr — 回應準備確認：尚未準備好。');
    /* ── 角色 / 移動（原有）── */
    case 'automove': return fHint('/automove — 切換自動前進。執行一次開始，再次執行停止。');
    case 'follow': return renderFollowFields(line);
    case 'battlemode': return renderBattleModeFields(line);
    case 'visor': return fHint('/visor — 切換頭部裝備的面罩開關（適用於可開合的頭盔）。');
    case 'fashion': return fHint('/fashion 裝備指定的時尚配件（如陽傘等外觀類配件）。')+
      fRow('配件名稱',fInp(id,'itemName','時尚配件名稱（與遊戲完全一致）',p.itemName));
    /* ── 召喚獸 / 坐騎（原有）── */
    case 'mount': return renderMountFields(line);
    case 'minion': return renderMinionFields(line);
    /* ── 鏡頭 / 拍照（原有）── */
    case 'gpose': return fHint('/gpose — 進入集體動作（拍照）模式。再次執行離開。');
    /* ── 介面 / 顯示（原有）── */
    case 'nameplatedisp': return renderNameplateFields(line);
    case 'nameplatetype': return renderNameplateTypeFields(line);
    case 'battleeffect': return renderBattleEffectFields(line);
    case 'hud': return renderHudFields(line);
    /* ── 角色套裝（原有）── */
    case 'gearset': return renderGearsetFields(line);
    case 'itemsort': return renderItemsortFields(line);
    /* ── 說話/通知 新增 ── */
    case 'cl': return fHint('清除消息欄中所有歷史記錄，執行後無法復原。');
    case 'emotelog': return fHint('/emotelog 設定使用情感動作時，是否在消息欄顯示對應的文字提示。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示'},{v:'off',l:'不顯示'},{v:'toggle',l:'切換'}],p.toggle||'toggle'));
    case 'qchat': return fHint('發送快捷發言（僅限群狼盛宴中使用）。')+
      fRow('快捷發言名',fInp(id,'name','快捷發言名稱（與遊戲完全一致）',p.name))+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));

    /* ── 技能/道具 新增 ── */
    case 'recast': return fHint('在消息欄顯示指定技能的剩餘複唱時間（秒）。')+
      fRow('技能名稱',fInp(id,'skillName','技能名稱（與遊戲完全一致）',p.skillName));
    case 'aaction': return fHint('設定或解除大地使者的額外技能。技能名輸入「clear」可解除全部已設定的技能。')+
      fRow('技能名稱',fInp(id,'skillName','技能名稱或輸入 clear 解除全部',p.skillName))+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'設定技能'},{v:'off',l:'解除技能'},{v:'toggle',l:'切換（設定↔解除）'}],p.toggle||'toggle'));
    case 'bluespellbook': return fHint('管理青魔法書的有效技能設定。可切換開關、設定單一技能、或套用預設組。')+
      fRow('子指令',fSel(id,'sub',[{v:'toggle',l:'切換青魔法書開/關'},{v:'set',l:'設定有效技能（開/關）'},{v:'preset',l:'套用預設技能組'},{v:'clear',l:'撤除所有有效技能'}],p.sub||'toggle'))+
      (p.sub==='set'?fRow('技能名稱',fInp(id,'spells','青魔法名稱（與遊戲完全一致）',p.spells))+fRow('操作',fSel(id,'spellToggle',[{v:'on',l:'設為有效技能'},{v:'off',l:'從有效技能移除'},{v:'toggle',l:'切換'}],p.spellToggle||'on')):'')  +
      (p.sub==='preset'?fRow('預設組編號',fSel(id,'presetNum',[{v:'1',l:'預設組 1'},{v:'2',l:'預設組 2'},{v:'3',l:'預設組 3'},{v:'4',l:'預設組 4'},{v:'5',l:'預設組 5'}],p.presetNum||'1')):'');
    case 'apa': return fHint('同時設定兩個對戰追加技能，兩個欄位都必須填寫。')+
      fRow('追加技能 1',fInp(id,'skill1','對戰追加技能名稱（與遊戲完全一致）',p.skill1))+
      fRow('追加技能 2',fInp(id,'skill2','對戰追加技能名稱（與遊戲完全一致）',p.skill2));

    /* ── 計時/通報/骰子 新增 ── */
    case 'alarm': return fHint('設定到指定時間時發出提醒的鬧鐘。可設本地、伺服器或艾奧傑亞時間，並可設定提前提醒或每小時重複。')+
      fRow('操作',fSel(id,'alarmSub',[{v:'open',l:'開啟鬧鐘視窗'},{v:'set',l:'設定鬧鐘'},{v:'clear',l:'撤除所有鬧鐘'}],p.alarmSub||'open'))+
      (p.alarmSub==='set'?
        fRow('鬧鐘名稱',fInp(id,'alarmName','鬧鐘名稱',p.alarmName))+
        fRow('時間類型',fSel(id,'timeType',ALARM_TTYPE,p.timeType||'lt'))+
        fRow('時間',fInp(id,'alarmTime','格式：0000~2400，如 2000 表示 20:00',p.alarmTime||'2000'))+
        fRow('重複',fChk(id,'repeat','每小時重複提醒（加上 rp）',p.repeat))+
        fRow('提前提醒（分鐘）',fInp(id,'advance','0~60，留空則準時提醒',p.advance,'number','min="0" max="60"'))
      :'');
    case 'dice': return fHint('在聊天頻道發送骰子結果（0~999，或指定上限 1~N）。省略頻道則在當前頻道發言。在巨集中使用時建議指定頻道。')+
      fRow('頻道（選填）',fSel(id,'channel',[{v:'',l:'省略（當前頻道）'}].concat(CH_OPTS.filter(function(c){return c.v&&['party','alliance','freecompany','pvpteam','linkshell1','linkshell2','linkshell3','linkshell4','linkshell5','linkshell6','linkshell7','linkshell8','cwlinkshell1','cwlinkshell2','cwlinkshell3','cwlinkshell4','cwlinkshell5','cwlinkshell6','cwlinkshell7','cwlinkshell8'].indexOf(c.v)>=0;})),p.channel||''))+
      fRow('上限值（選填）',fInp(id,'max','省略則 0~999；填入數字則 1~N',p.max,'number','min="2" max="999"'));

    /* ── 召喚獸/坐騎 新增 ── */
    case 'petsize': return fHint('變更指定召喚獸的顯示尺寸，僅對自身生效，PvP區無效。選「全部」時無法使用切換，需指定尺寸。')+
      fRow('召喚獸',fSel(id,'petName',PETSIZE_PETS,p.petName||'Demi-Bahamut'))+
      fRow('尺寸',fSel(id,'size',[{v:'large',l:'大'},{v:'medium',l:'中'},{v:'small',l:'小'},{v:'toggle',l:'切換（小→中→大）'}],p.size||'toggle'));
    case 'petmirage': return fHint('/petglamour（別名 /petglam、/egiglamour）將指定召喚獸的外貌更換為另一款召喚獸的外觀，需重新召喚才會生效，PvP區無效。學者妖精 Eos 可換裝成 Selene（7.51版確認）。注意：官方指令名稱已由舊版 /petmirage 改為 /petglamour，若巨集裡還留著 /petmirage 會執行失敗。勾選「撤除外貌」會省略外貌參數以恢復原始外觀（並非填入「clear」字樣）。')+
      fRow('召喚獸',fSel(id,'petName',PETMIRAGE_PETS,p.petName||'carbuncle'))+
      fRow('撤除外貌',fChk(id,'clear','撤除（省略外貌參數，恢復原始外貌）',p.clear))+
      (!p.clear?fRow('外貌',fSel(id,'appearance',(PETMIRAGE_APPEARANCES[p.petName||'carbuncle']||[]),p.appearance||'')):'');
    case 'ridepillion': return fHint('搭乘指定隊員的坐騎，並選擇座位編號（1~7）。若指定座位已滿會自動選空位。')+
      fRow('隊員',fTgt(id,'target',p.target||'<2>','party'))+
      fRow('座位編號',fSel(id,'seat',[{v:'1',l:'座位 1'},{v:'2',l:'座位 2'},{v:'3',l:'座位 3'},{v:'4',l:'座位 4'},{v:'5',l:'座位 5'},{v:'6',l:'座位 6'},{v:'7',l:'座位 7'}],p.seat||'1'));

    /* ── 鏡頭/拍照 新增 ── */
    case 'facecamera': return fHint('讓角色視線轉向鏡頭方向。再次執行可解除。');
    case 'idlingcamera': return fHint('切換為景觀鏡頭視角，可指定目標讓鏡頭鎖定該對象。省略目標則隨機選擇場景。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'tiltcamera': return fHint('調整第三人稱視角的俯視角度（0~100）。數值越大俯視角度越大。')+
      fRow('俯視角度',fInp(id,'value','0~100',p.value,'number','min="0" max="100"'));

    /* ── 狀態/身分 新增 ── */
    case 'busy': return fHint('設定在線狀態為「忙碌」。開啟後其他玩家會看到你處於忙碌狀態。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'設為忙碌'},{v:'off',l:'回到在線'},{v:'toggle',l:'切換（忙碌↔在線）'}],p.toggle||'toggle'));
    case 'away': return fHint('設定在線狀態為「離開（AFK）」。開啟後其他玩家會看到你處於離開狀態。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'設為離開'},{v:'off',l:'回到在線'},{v:'toggle',l:'切換（離開↔在線）'}],p.toggle||'toggle'));
    case 'roleplaying': return fHint('設定在線狀態為「角色扮演中」。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'設為角色扮演中'},{v:'off',l:'回到在線'},{v:'toggle',l:'切換（角色扮演↔在線）'}],p.toggle||'toggle'));
    case 'lfp': return fHint('設定在線狀態為「希望組隊」，可附加你能以哪些職業參與組隊。省略職業時預設為當前職業（省略全部職業）。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'設為希望組隊'},{v:'off',l:'回到在線'},{v:'toggle',l:'切換（希望組隊↔在線）'}],p.toggle||'toggle'))+
      fRow('可組隊職業（選填，可多選）',
        '<div class="job-ctrl-row">'+
          '<button class="job-sel-all" data-id="'+id+'">全選</button>'+
          '<button class="job-sel-none" data-id="'+id+'">全不選</button>'+
        '</div>'+
        '<div class="job-checkbox-grid">'+JOBS.map(function(j){
          var isChecked=(p.jobs||[]).indexOf(j.v)>=0;
          var checked=isChecked?'checked':'';
          return '<label class="job-chk-lbl'+(isChecked?' checked':'')+'"><input type="checkbox" class="mf-chk-job" data-id="'+id+'" data-key="jobs" data-val="'+j.v+'" '+checked+'> '+j.l+'</label>';
        }).join('')+'</div>');
    case 'lfm': return fHint('設定在線狀態為「接受鑲嵌魔晶石請求」。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'接受鑲嵌請求'},{v:'off',l:'回到在線'},{v:'toggle',l:'切換'}],p.toggle||'toggle'));
    case 'scomment': return fHint('設定搜尋玩家時顯示的個性簽名。')+
      fRow('簽名內容',fInp(id,'text','簽名文字',p.text));
    case 'bstatus': return fHint('/nastatus（別名 /nas）切換自己的「新人（Sprout）」在線狀態。注意：官方指令名稱已由舊版 /beginnerstatus、/bstatus 改為 /nastatus，若巨集裡還留著 /bstatus 會執行失敗。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟新人狀態'},{v:'off',l:'解除新人狀態'},{v:'toggle',l:'切換'}],p.toggle||'toggle'));
    case 'nnetwork': return fHint('/nnetwork（別名 /novicenetwork）設定是否自動加入新人頻道。開啟時會立即加入頻道；關閉時會離開頻道並停止自動加入。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟自動加入'},{v:'off',l:'關閉自動加入並離開'},{v:'toggle',l:'切換'}],p.toggle||'toggle'));
    case 'nnetworkinvitation': return fHint('/nnetworkinvitation（別名 /novicenetworkinvitation）設定是否允許被邀請加入新人頻道。關閉後會自動拒絕所有邀請。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'允許被邀請'},{v:'off',l:'自動拒絕邀請'},{v:'toggle',l:'切換'}],p.toggle||'toggle'));
    case 'nnetworkleave': return fHint('/nnetworkleave（別名 /novicenetworkleave）立即退出目前所在的新人頻道。無參數。');
    case 'search': return fHint('/sea（別名 /search）依條件搜尋玩家，結果顯示在玩家搜尋視窗中。可組合多種條件，全部留空則執行預設搜尋。')+
      fRow('姓名條件',fSel(id,'nameMode',[{v:'',l:'（不篩選姓名）'},{v:'forename',l:'名字（forename）'},{v:'surname',l:'姓氏（surname）'}],p.nameMode||''))+
      (p.nameMode?fRow('姓名關鍵字',fInp(id,'playerName','完整名字或姓氏',p.playerName)):'')+
      fRow('在線狀態',fSel(id,'status',[
        {v:'',l:'（不篩選）'},{v:'leader',l:'隊長 leader'},{v:'away',l:'離開 away'},{v:'busy',l:'忙碌 busy'},
        {v:'duty',l:'任務中 duty'},{v:'event',l:'剧情中 event'},{v:'lookingforparty',l:'希望組隊 lookingforparty'},
        {v:'recruit',l:'招募隊員中 recruit'},{v:'lookingtomeld',l:'接受鑲嵌請求 lookingtomeld'},
        {v:'newadventurer',l:'新人 newadventurer'},{v:'mentor',l:'指導者 mentor'},
        {v:'tradementor',l:'製作採集指導者 tradementor'},{v:'pvementor',l:'戰鬥指導者 pvementor'},
        {v:'pvpmentor',l:'對戰指導者 pvpmentor'},{v:'roleplay',l:'角色扮演中 roleplay'},
        {v:'returner',l:'回歸者 returner'}
      ],p.status||''))+
      fRow('職業（選填，可多選；省略＝所有職業）',
        '<div class="job-ctrl-row">'+
          '<button class="job-sel-all" data-id="'+id+'">全選</button>'+
          '<button class="job-sel-none" data-id="'+id+'">全不選</button>'+
        '</div>'+
        '<div class="job-checkbox-grid">'+JOBS.map(function(j){
          var isChecked=(p.jobs||[]).indexOf(j.v)>=0;
          var checked=isChecked?'checked':'';
          return '<label class="job-chk-lbl'+(isChecked?' checked':'')+'"><input type="checkbox" class="mf-chk-job" data-id="'+id+'" data-key="jobs" data-val="'+j.v+'" '+checked+'> '+j.l+'</label>';
        }).join('')+'</div>')+
      fRow('等級範圍（選填）',fInp(id,'lvMin','最低（省略＝所有等級）',p.lvMin,'number','min="1" max="100"')+' ~ '+fInp(id,'lvMax','最高（留空＝與最低相同）',p.lvMax,'number','min="1" max="100"'))+
      fRow('大國防聯軍',fSel(id,'gc',[{v:'',l:'（不篩選）'},{v:'Maelstrom',l:'黑渦團 Maelstrom'},{v:'Order of the Twin Adder',l:'雙蛇黨 Order of the Twin Adder'},{v:'Immortal Flames',l:'恆輝隊 Immortal Flames'}],p.gc||''))+
      fRow('所在地區',fSel(id,'location',[
        {v:'',l:'（不篩選，預設全世界）'},{v:'Limsa Lominsa',l:'利姆薩·羅敏薩'},{v:'Gridania',l:'格里達尼亞'},
        {v:'Ul\'dah',l:'烏爾達哈'},{v:'Ishgard',l:'伊修加德'},{v:'The Black Shroud',l:'黑衣森林'},
        {v:'Thanalan',l:'薩納蘭'},{v:'La Noscea',l:'拉諾西亞'},{v:'Mor Dhona',l:'摩杜納'},
        {v:'Coerthas',l:'庫爾札斯'},{v:'Dravania',l:'龍堡'},{v:'Abalathia\'s Spine',l:'阿巴拉提亞'},
        {v:'Kugane',l:'龍宮城'},{v:'Gyr Abania',l:'基拉巴尼亞'},{v:'Othard',l:'奧薩德'},
        {v:'The Crystarium',l:'水晶都'},{v:'Eulmore',l:'幽爾牧場'},{v:'Norvrandt',l:'諾弗蘭特'}
      ],p.location||''))+
      fRow('語言',fSel(id,'lang',[{v:'',l:'（不篩選，預設當前語言）'},{v:'JA',l:'日文 JA'},{v:'EN',l:'英文 EN'},{v:'FR',l:'法文 FR'},{v:'DE',l:'德文 DE'}],p.lang||''));
    case 'title': return fHint('變更角色稱號。可指定稱號名稱、撤除，或隨機套用已獲得的稱號。')+
      fRow('操作',fSel(id,'sub',[{v:'random',l:'隨機稱號（從已獲得中選）'},{v:'set',l:'指定稱號'},{v:'clear',l:'撤除稱號'}],p.sub||'random'))+
      (p.sub==='set'?fRow('稱號名稱',fInp(id,'titleName','稱號名稱（與遊戲完全一致）',p.titleName)):'');

    /* ── 小隊/社交 新增 ── */
    case 'partycmd': return fHint('執行小隊相關指令。跨服組隊時僅支援「加入」子指令及開啟小隊視窗。')+
      fRow('子指令',fSel(id,'sub',[{v:'',l:'開啟小隊視窗'},{v:'add',l:'邀請玩家加入'},{v:'accept',l:'接受邀請'},{v:'deny',l:'拒絕邀請'},{v:'leader',l:'轉讓隊長'},{v:'leave',l:'退出小隊'},{v:'kick',l:'移除隊員'},{v:'breakup',l:'解散小隊'}],p.sub||''))+
      (['add','leader','kick'].indexOf(p.sub)>=0?fRow('目標',fTgt(id,'target',p.target||'<t>')):'');
    case 'join': return fHint('接受小隊組隊邀請。');
    case 'decline': return fHint('拒絕小隊組隊邀請。');
    case 'invite': return fHint('邀請指定玩家加入小隊。省略目標則邀請當前選中的玩家。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'kick': return fHint('將指定隊員移除小隊。省略目標則對當前選中的玩家執行。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'leader': return fHint('將隊長轉讓給指定玩家。省略目標則對當前選中的玩家執行。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'leave': return fHint('退出當前所在的小隊。');
    case 'psort': return fHint('將小隊列表按指定順序重新排列。');
    case 'meldrequest': return fHint('向指定玩家發送魔晶石鑲嵌委託。省略目標則對當前選中的玩家發送。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'friendlist': return fHint('/flist 執行好友名單相關指令。省略子指令則開啟好友名單視窗。「接受／拒絕」需搭配對方剛送出的好友邀請。')+
      fRow('子指令',fSel(id,'sub',[{v:'',l:'開啟好友名單視窗'},{v:'add',l:'加入（送出好友申請）'},{v:'accept',l:'接受（同意對方的申請）'},{v:'deny',l:'拒絕（拒絕對方的申請）'},{v:'remove',l:'清除（移出好友名單）'}],p.sub||''))+
      (p.sub?fRow('目標',fTgt(id,'target',p.target||'<t>')):'');
    case 'blacklist': return fHint('/blist 執行黑名單相關指令。省略子指令則開啟黑名單視窗。')+
      fRow('子指令',fSel(id,'sub',[{v:'',l:'開啟黑名單視窗'},{v:'add',l:'加入（將對方帳號加入黑名單）'},{v:'remove',l:'清除（將對方移出黑名單）'}],p.sub||''))+
      (p.sub?fRow('目標',fTgt(id,'target',p.target||'<t>')):'');

    /* ── 戰鬥設定（原有）── */
    case 'levelsync': return fHint('/levelsync 同步自己的等級至當前任務上限。再次執行解除同步。');
    case 'statusoff': return renderStatusoffFields(line);
    /* ── 戰鬥設定 新增 ── */
    case 'autolockon': return fHint('開始自動攻擊時是否自動鎖定目標。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟自動鎖定'},{v:'off',l:'關閉自動鎖定'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'autofacetarget': return fHint('發動技能時角色是否自動轉向面對目標。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟自動轉向'},{v:'off',l:'關閉自動轉向'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'autotarget': return fHint('未選中目標時是否自動選中敵對目標。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟自動選中'},{v:'off',l:'關閉自動選中'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'targetself': return fHint('是否可以將自己選為目標。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟選中自己'},{v:'off',l:'關閉選中自己'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'groundclick': return fHint('點擊場景地面時是否取消當前選中的目標。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'點地面取消目標'},{v:'off',l:'關閉此功能'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'duelswitch': return fHint('設定是否強制拒絕其他玩家的決鬥申請。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'強制拒絕決鬥申請'},{v:'off',l:'接受決鬥申請'},{v:'toggle',l:'切換'}],p.toggle||'toggle'));
    case 'actionerror': return fHint('發動技能時，是否在螢幕上顯示錯誤提示（如：「目標超出範圍」）。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示技能錯誤提示'},{v:'off',l:'關閉錯誤提示'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'recasterror': return fHint('技能冷卻中時，是否在螢幕上顯示複唱中的錯誤提示。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示複唱錯誤提示'},{v:'off',l:'關閉錯誤提示'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));

    /* ── 介面/顯示 新增 ── */
    case 'legacymark': return fHint('顯示或隱藏自己角色頭上的十二神印記。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示十二神印記'},{v:'off',l:'隱藏十二神印記'},{v:'toggle',l:'切換（顯示↔隱藏）'}],p.toggle||'toggle'));
    case 'displayhead': return fHint('顯示或隱藏自己的頭部裝備。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示頭部裝備'},{v:'off',l:'隱藏頭部裝備'},{v:'toggle',l:'切換（顯示↔隱藏）'}],p.toggle||'toggle'));
    case 'displayarms': return fHint('收回武器時是否仍顯示武器於角色身上。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'收刀時仍顯示武器'},{v:'off',l:'收刀時隱藏武器'},{v:'toggle',l:'切換（顯示↔隱藏）'}],p.toggle||'toggle'));
    case 'autosheathe': return fHint('戰鬥結束後是否自動收回武器。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'戰鬥後自動收刀'},{v:'off',l:'關閉自動收刀'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'jobhudmode': return fHint('切換職業量譜（量表）的顯示模式（普通↔簡潔）。可針對第1或第2個量譜單獨切換，或全部一起切換。')+
      fRow('量譜',fSel(id,'num',[{v:'',l:'全部量譜一起切換'},{v:'1',l:'第 1 個量譜'},{v:'2',l:'第 2 個量譜'}],p.num||''));
    case 'hudreset': return fHint('將當前介面所有視窗的位置及縮放率重置為初始狀態。');
    case 'uireset': return fHint('將全部介面設定（1~4 組）及所有視窗的位置與縮放率重置為初始狀態。此操作會清除所有介面佈局，請謹慎使用。');
    case 'uiscale': return fHint('調整遊戲介面的縮放倍率。可選擇預設值或重置為初始狀態。')+
      fRow('縮放倍率',fSel(id,'value',[{v:'reset',l:'重置（恢復初始）'},{v:'60',l:'60%'},{v:'80',l:'80%'},{v:'90',l:'90%'},{v:'100',l:'100%（預設）'},{v:'110',l:'110%'},{v:'120',l:'120%'},{v:'140',l:'140%'}],p.value||'100'));
    case 'chatlog': return fHint('調整消息視窗的各項設定，包含字體大小、時間顯示格式及接收訊息的提示音。')+
      fRow('設定類型',fSel(id,'sub',CHATLOG_SUBS,p.sub||'fontsize'))+
      (!p.sub||p.sub==='fontsize'?
        fRow('消息欄編號（選填）',fInp(id,'tabNum','留空＝全部消息欄，填 1~4 指定消息欄',p.tabNum,'number','min="1" max="4"'))+
        fRow('字體大小',fInp(id,'fontSize','請填入字體大小數值',p.fontSize,'number','min="1"'))
      :'')+
      (p.sub==='time_onoff'?
        fRow('消息欄編號（選填）',fInp(id,'tabNum','留空＝全部消息欄，填 1~4 指定消息欄',p.tabNum,'number','min="1" max="4"'))+
        fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟時間顯示'},{v:'off',l:'關閉時間顯示'},{v:'toggle',l:'切換'}],p.toggle||'on'))
      :'')+
      (p.sub==='time_format'?
        fRow('時間格式',fSel(id,'format',[{v:'12',l:'12 小時制'},{v:'24',l:'24 小時制'}],p.format||'24'))
      :'')+
      (p.sub==='time_base'?
        fRow('時間基準',fSel(id,'base',[{v:'local',l:'本地時間'},{v:'server',l:'伺服器時間'}],p.base||'local'))
      :'')+
      (p.sub==='call'?
        fRow('頻道（選填）',fSel(id,'clChannel',[{v:'',l:'省略（預設悄悄話）'}].concat(CHATLOG_CH),p.clChannel||''))+
        fRow('提示音操作',fSel(id,'callAction',[{v:'on',l:'開啟提示音'},{v:'off',l:'關閉提示音'},{v:'toggle',l:'切換'},{v:'sound',l:'指定音效編號'}],p.callAction||'on'))+
        (p.callAction==='sound'?fRow('音效編號',fInp(id,'soundNum','1~16',p.soundNum,'number','min="1" max="16"')):'')
      :'');
    case 'targetring': return fHint('顯示或隱藏目標環（選中目標時腳下的圓環）。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示目標環'},{v:'off',l:'隱藏目標環'},{v:'toggle',l:'切換（顯示↔隱藏）'}],p.toggle||'toggle'));
    case 'targetline': return fHint('顯示或隱藏目標線（自身與目標之間的連線）。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示目標線'},{v:'off',l:'隱藏目標線'},{v:'toggle',l:'切換（顯示↔隱藏）'}],p.toggle||'toggle'));
    case 'linkline': return fHint('顯示或隱藏聯繫線（連接有關聯的目標之間的連線）。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'顯示聯繫線'},{v:'off',l:'隱藏聯繫線'},{v:'toggle',l:'切換（顯示↔隱藏）'}],p.toggle||'toggle'));

    /* ── 熱鍵設定 新增 ── */
    case 'hotbar': return fHint('操作一般熱鍵欄（非對戰區）或 PvP 熱鍵欄（對戰區）。可設置技能、更換、複製、顯示切換、共通設定或清除。')+
      fRow('區域',fSel(id,'zone',[{v:'normal',l:'一般熱鍵欄（非戰鬥區）'},{v:'pvp',l:'PvP 熱鍵欄（對戰區）'}],p.zone||'normal'))+
      fRow('子指令',fSel(id,'sub',HOTBAR_SUBS,p.sub||'set'))+
      ((!p.sub||p.sub==='set')?(
        p.zone==='pvp'?        fRow('類型',fSel(id,'setType',HOTBAR_SET_TYPES_PVP,p.setType||'action'))+
        fRow('名稱',fInp(id,'setName','PvP技能／道具等名稱（與遊戲完全一致）',p.setName))+
        fRow('熱鍵欄編號（選填）',fInp(id,'num','省略＝自動放到最小空位的熱鍵欄；填 1~10 指定',p.num,'number','min="1" max="10"'))+
        fRow('格位編號（選填）',fInp(id,'slot2','省略＝自動放到最小空位；填 1~12 指定',p.slot2,'number','min="1" max="12"')):        fRow('類型',fSel(id,'setType',HOTBAR_SET_TYPES,p.setType||'action'))+
        fRow('名稱',fInp(id,'setName','技能／道具／坐騎等名稱（與遊戲完全一致）',p.setName))+
        fRow('熱鍵欄編號（選填）',fInp(id,'num','省略＝自動放到最小空位的熱鍵欄；填 1~10 指定',p.num,'number','min="1" max="10"'))+
        fRow('格位編號（選填）',fInp(id,'slot2','省略＝自動放到最小空位；填 1~12 指定',p.slot2,'number','min="1" max="12"'))
      ):'')+
      (p.sub==='change'?fRow('熱鍵欄編號',fInp(id,'num','1~10',p.num,'number','min="1" max="10"')):'')+
      (p.sub==='copy'?
        fRow('來源職業',fSel(id,'srcJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.srcJob||'current'))+
        fRow('來源熱鍵欄編號',fInp(id,'srcNum','1~10，或填 current 代表當前熱鍵欄1',p.srcNum))+
        fRow('目標職業',fSel(id,'dstJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.dstJob||'current'))+
        fRow('目標熱鍵欄編號',fInp(id,'dstNum','1~10，或填 current 代表當前熱鍵欄1',p.dstNum))
      :'')+
      (['display','share'].indexOf(p.sub)>=0?
        fRow('熱鍵欄編號',fInp(id,'num','1~10',p.num,'number','min="1" max="10"'))+
        fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟'},{v:'off',l:'關閉'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'))
      :'')+
      (p.sub==='remove'?
        fRow('熱鍵欄編號',fInp(id,'num','1~10',p.num,'number','min="1" max="10"'))+
        fRow('格位',fSel(id,'slot',[{v:'all',l:'全部清除'},{v:'1',l:'格位 1'},{v:'2',l:'格位 2'},{v:'3',l:'格位 3'},{v:'4',l:'格位 4'},{v:'5',l:'格位 5'},{v:'6',l:'格位 6'},{v:'7',l:'格位 7'},{v:'8',l:'格位 8'},{v:'9',l:'格位 9'},{v:'10',l:'格位 10'},{v:'11',l:'格位 11'},{v:'12',l:'格位 12'}],p.slot||'all'))
      :'');
    case 'pvphotbar': return fHint('操作 PvP 專用熱鍵欄（只能在對戰區使用）。可設置PvP技能、更換、複製、顯示切換、共通設定或清除。')+
      fRow('子指令',fSel(id,'sub',HOTBAR_SUBS,p.sub||'set'))+
      ((!p.sub||p.sub==='set')?        fRow('類型',fSel(id,'setType',HOTBAR_SET_TYPES_PVP,p.setType||'action'))+
        fRow('名稱',fInp(id,'setName','PvP技能／道具等名稱（與遊戲完全一致）',p.setName))+
        fRow('熱鍵欄編號（選填）',fInp(id,'num','省略＝自動放到最小空位的熱鍵欄；填 1~10 指定',p.num,'number','min="1" max="10"'))+
        fRow('格位編號（選填）',fInp(id,'slot2','省略＝自動放到最小空位；填 1~12 指定',p.slot2,'number','min="1" max="12"'))
      :'')+
      (p.sub==='change'?fRow('熱鍵欄編號',fInp(id,'num','1~10',p.num,'number','min="1" max="10"')):'')+
      (p.sub==='copy'?
        fRow('來源職業',fSel(id,'srcJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.srcJob||'current'))+
        fRow('來源熱鍵欄編號',fInp(id,'srcNum','1~10，或填 current',p.srcNum))+
        fRow('目標職業',fSel(id,'dstJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.dstJob||'current'))+
        fRow('目標熱鍵欄編號',fInp(id,'dstNum','1~10，或填 current',p.dstNum))
      :'')+
      (['display','share'].indexOf(p.sub)>=0?
        fRow('熱鍵欄編號',fInp(id,'num','1~10',p.num,'number','min="1" max="10"'))+
        fRow('操作',fSel(id,'toggle',[{v:'on',l:'開啟'},{v:'off',l:'關閉'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'))
      :'')+
      (p.sub==='remove'?
        fRow('熱鍵欄編號',fInp(id,'num','1~10',p.num,'number','min="1" max="10"'))+
        fRow('格位',fSel(id,'slot',[{v:'all',l:'全部清除'},{v:'1',l:'格位 1'},{v:'2',l:'格位 2'},{v:'3',l:'格位 3'},{v:'4',l:'格位 4'},{v:'5',l:'格位 5'},{v:'6',l:'格位 6'},{v:'7',l:'格位 7'},{v:'8',l:'格位 8'},{v:'9',l:'格位 9'},{v:'10',l:'格位 10'},{v:'11',l:'格位 11'},{v:'12',l:'格位 12'}],p.slot||'all'))
      :'');
    case 'chotbar': return fHint('操作十字熱鍵欄（一般版非對戰區，PvP版對戰區）。可設置技能、更換、複製、共通設定或清除。')+
      fRow('區域',fSel(id,'zone',[{v:'normal',l:'一般十字熱鍵欄（非戰鬥區）'},{v:'pvp',l:'PvP 十字熱鍵欄（對戰區）'}],p.zone||'normal'))+
      fRow('子指令',fSel(id,'sub',[{v:'set',l:'設置技能（將技能/道具等放入指定位置）'},{v:'change',l:'更換（切換到指定編號）'},{v:'copy',l:'複製（複製熱鍵欄內容）'},{v:'share',l:'共通（設定全職業共通）'},{v:'remove',l:'清除（解除指定位置技能）'}],p.sub||'set'))+
      ((!p.sub||p.sub==='set')?(
        p.zone==='pvp'?        fRow('類型',fSel(id,'setType',HOTBAR_SET_TYPES_PVP,p.setType||'action'))+
        fRow('名稱',fInp(id,'setName','PvP技能等名稱（與遊戲完全一致）',p.setName))+
        fRow('十字熱鍵欄編號（選填）',fInp(id,'num','省略＝自動；填 1~8 指定',p.num,'number','min="1" max="8"'))+
        fRow('位置（選填）',fSel(id,'pos',[{v:'',l:'省略（自動放到最小空位）'},{v:'LD1',l:'左 ↙ LD1'},{v:'LD2',l:'左 ↑ LD2'},{v:'LD3',l:'左 ↗ LD3'},{v:'LD4',l:'左 ↓ LD4'},{v:'LA1',l:'左 LA1'},{v:'LA2',l:'左 LA2'},{v:'LA3',l:'左 LA3'},{v:'LA4',l:'左 LA4'},{v:'RD1',l:'右 ↙ RD1'},{v:'RD2',l:'右 ↑ RD2'},{v:'RD3',l:'右 ↗ RD3'},{v:'RD4',l:'右 ↓ RD4'},{v:'RA1',l:'右 RA1'},{v:'RA2',l:'右 RA2'},{v:'RA3',l:'右 RA3'},{v:'RA4',l:'右 RA4'}],p.pos||'')):        fRow('類型',fSel(id,'setType',HOTBAR_SET_TYPES,p.setType||'action'))+
        fRow('名稱',fInp(id,'setName','技能／道具等名稱（與遊戲完全一致）',p.setName))+
        fRow('十字熱鍵欄編號（選填）',fInp(id,'num','省略＝自動；填 1~8 指定',p.num,'number','min="1" max="8"'))+
        fRow('位置（選填）',fSel(id,'pos',[{v:'',l:'省略（自動放到最小空位）'},{v:'LD1',l:'左 ↙ LD1'},{v:'LD2',l:'左 ↑ LD2'},{v:'LD3',l:'左 ↗ LD3'},{v:'LD4',l:'左 ↓ LD4'},{v:'LA1',l:'左 LA1'},{v:'LA2',l:'左 LA2'},{v:'LA3',l:'左 LA3'},{v:'LA4',l:'左 LA4'},{v:'RD1',l:'右 ↙ RD1'},{v:'RD2',l:'右 ↑ RD2'},{v:'RD3',l:'右 ↗ RD3'},{v:'RD4',l:'右 ↓ RD4'},{v:'RA1',l:'右 RA1'},{v:'RA2',l:'右 RA2'},{v:'RA3',l:'右 RA3'},{v:'RA4',l:'右 RA4'}],p.pos||''))
      ):'')+
      (p.sub==='change'?fRow('十字熱鍵欄編號',fInp(id,'num','1~8',p.num,'number','min="1" max="8"')):'')+
      (p.sub==='copy'?
        fRow('來源職業',fSel(id,'srcJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.srcJob||'current'))+
        fRow('來源編號',fInp(id,'srcNum','1~8，或填 current',p.srcNum))+
        fRow('目標職業',fSel(id,'dstJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.dstJob||'current'))+
        fRow('目標編號',fInp(id,'dstNum','1~8，或填 current',p.dstNum))
      :'')+
      (p.sub==='share'?
        fRow('十字熱鍵欄編號',fInp(id,'num','1~8',p.num,'number','min="1" max="8"'))+
        fRow('操作',fSel(id,'toggle',[{v:'on',l:'設為全職業共通'},{v:'off',l:'改為當前職業專用'},{v:'toggle',l:'切換'}],p.toggle||'toggle'))
      :'')+
      (p.sub==='remove'?
        fRow('十字熱鍵欄編號',fInp(id,'num','1~8',p.num,'number','min="1" max="8"'))+
        fRow('位置',fSel(id,'pos',[{v:'all',l:'全部清除'},{v:'LD1',l:'左 ↙ LD1'},{v:'LD2',l:'左 ↑ LD2'},{v:'LD3',l:'左 ↗ LD3'},{v:'LD4',l:'左 ↓ LD4'},{v:'LA1',l:'左 LA1'},{v:'LA2',l:'左 LA2'},{v:'LA3',l:'左 LA3'},{v:'LA4',l:'左 LA4'},{v:'RD1',l:'右 ↙ RD1'},{v:'RD2',l:'右 ↑ RD2'},{v:'RD3',l:'右 ↗ RD3'},{v:'RD4',l:'右 ↓ RD4'},{v:'RA1',l:'右 RA1'},{v:'RA2',l:'右 RA2'},{v:'RA3',l:'右 RA3'},{v:'RA4',l:'右 RA4'}],p.pos||'all'))
      :'');
    case 'pvpchotbar': return fHint('操作 PvP 專用十字熱鍵欄（只能在對戰區使用）。可設置PvP技能、更換、複製、共通設定或清除。')+
      fRow('子指令',fSel(id,'sub',[{v:'set',l:'設置技能（將PvP技能等放入指定位置）'},{v:'change',l:'更換（切換到指定編號）'},{v:'copy',l:'複製（複製熱鍵欄內容）'},{v:'share',l:'共通（設定全職業共通）'},{v:'remove',l:'清除（解除指定位置技能）'}],p.sub||'set'))+
      ((!p.sub||p.sub==='set')?        fRow('類型',fSel(id,'setType',HOTBAR_SET_TYPES_PVP,p.setType||'action'))+
        fRow('名稱',fInp(id,'setName','PvP技能等名稱（與遊戲完全一致）',p.setName))+
        fRow('十字熱鍵欄編號（選填）',fInp(id,'num','省略＝自動；填 1~8 指定',p.num,'number','min="1" max="8"'))+
        fRow('位置（選填）',fSel(id,'pos',[{v:'',l:'省略（自動放到最小空位）'},{v:'LD1',l:'左 ↙ LD1'},{v:'LD2',l:'左 ↑ LD2'},{v:'LD3',l:'左 ↗ LD3'},{v:'LD4',l:'左 ↓ LD4'},{v:'LA1',l:'左 LA1'},{v:'LA2',l:'左 LA2'},{v:'LA3',l:'左 LA3'},{v:'LA4',l:'左 LA4'},{v:'RD1',l:'右 ↙ RD1'},{v:'RD2',l:'右 ↑ RD2'},{v:'RD3',l:'右 ↗ RD3'},{v:'RD4',l:'右 ↓ RD4'},{v:'RA1',l:'右 RA1'},{v:'RA2',l:'右 RA2'},{v:'RA3',l:'右 RA3'},{v:'RA4',l:'右 RA4'}],p.pos||''))
      :'')+
      (p.sub==='change'?fRow('十字熱鍵欄編號',fInp(id,'num','1~8',p.num,'number','min="1" max="8"')):'')+
      (p.sub==='copy'?
        fRow('來源職業',fSel(id,'srcJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.srcJob||'current'))+
        fRow('來源編號',fInp(id,'srcNum','1~8，或填 current',p.srcNum))+
        fRow('目標職業',fSel(id,'dstJob',[{v:'current',l:'當前職業 current'},{v:'share',l:'共通熱鍵欄 share'},{v:'GLA',l:'劍術師 GLA'},{v:'PGL',l:'格鬥家 PGL'},{v:'MRD',l:'斧術師 MRD'},{v:'LNC',l:'槍術師 LNC'},{v:'ARC',l:'弓箭手 ARC'},{v:'CNJ',l:'幻術師 CNJ'},{v:'ROG',l:'雙劍師 ROG'},{v:'THM',l:'咒術師 THM'},{v:'ACN',l:'巴術士 ACN'},{v:'PLD',l:'騎士 PLD'},{v:'MNK',l:'武僧 MNK'},{v:'WAR',l:'戰士 WAR'},{v:'DRG',l:'龍騎士 DRG'},{v:'BRD',l:'吟遊詩人 BRD'},{v:'NIN',l:'忍者 NIN'},{v:'WHM',l:'白魔法師 WHM'},{v:'BLM',l:'黑魔法師 BLM'},{v:'SMN',l:'召喚師 SMN'},{v:'SCH',l:'學者 SCH'},{v:'DRK',l:'暗黑騎士 DRK'},{v:'AST',l:'占星術士 AST'},{v:'MCH',l:'機工士 MCH'},{v:'SAM',l:'武士 SAM'},{v:'RDM',l:'赤魔法師 RDM'},{v:'BLU',l:'青魔法師 BLU'},{v:'GNB',l:'絕槍戰士 GNB'},{v:'DNC',l:'舞者 DNC'},{v:'SGE',l:'賢者 SGE'},{v:'RPR',l:'奪魂者 RPR'},{v:'VPR',l:'毒蛇劍士 VPR'},{v:'PCT',l:'繪靈法師 PCT'}],p.dstJob||'current'))+
        fRow('目標編號',fInp(id,'dstNum','1~8，或填 current',p.dstNum))
      :'')+
      (p.sub==='share'?
        fRow('十字熱鍵欄編號',fInp(id,'num','1~8',p.num,'number','min="1" max="8"'))+
        fRow('操作',fSel(id,'toggle',[{v:'on',l:'設為全職業共通'},{v:'off',l:'改為當前職業專用'},{v:'toggle',l:'切換'}],p.toggle||'toggle'))
      :'')+
      (p.sub==='remove'?
        fRow('十字熱鍵欄編號',fInp(id,'num','1~8',p.num,'number','min="1" max="8"'))+
        fRow('位置',fSel(id,'pos',[{v:'all',l:'全部清除'},{v:'LD1',l:'左 ↙ LD1'},{v:'LD2',l:'左 ↑ LD2'},{v:'LD3',l:'左 ↗ LD3'},{v:'LD4',l:'左 ↓ LD4'},{v:'LA1',l:'左 LA1'},{v:'LA2',l:'左 LA2'},{v:'LA3',l:'左 LA3'},{v:'LA4',l:'左 LA4'},{v:'RD1',l:'右 ↙ RD1'},{v:'RD2',l:'右 ↑ RD2'},{v:'RD3',l:'右 ↗ RD3'},{v:'RD4',l:'右 ↓ RD4'},{v:'RA1',l:'右 RA1'},{v:'RA2',l:'右 RA2'},{v:'RA3',l:'右 RA3'},{v:'RA4',l:'右 RA4'}],p.pos||'all'))
      :'');
    case 'chotbardisplay': return fHint('設定是否一直顯示十字熱鍵欄（即使未按下 LT/RT 也持續顯示）。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'一直顯示十字熱鍵欄'},{v:'off',l:'關閉一直顯示'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'chotbartype': return fHint('變更十字熱鍵欄的操作類型。按住：需持續按 LT/RT；單擊：點一下切換；混合：結合兩者。')+
      fRow('操作類型',fSel(id,'type',[{v:'hold',l:'按住（Hold）'},{v:'toggle',l:'單擊（Toggle）'},{v:'mix',l:'混合（Mix）'}],p.type||'hold'));

    /* ── 畫面/音效 新增 ── */
    case 'gpreset': return fHint('快速切換圖像品質預設設定。')+
      fRow('預設組',fSel(id,'num',GPRESET_OPTS,p.num||'2'));
    case 'mastervolume': return fHint('調整遊戲整體音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'bgm': return fHint('調整背景音樂音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'soundeffects': return fHint('調整整體音效音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'voice': return fHint('調整語音音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'systemsounds': return fHint('調整系統音效音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'ambientsounds': return fHint('調整環境音效音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'soundeffectsself': return fHint('調整自己角色的音效音量（0~100）。')+
      fRow('音量',fInp(id,'value','0~100',p.value,'number','min="0" max="100"'));
    case 'soundeffectsparty': return fHint('調整小隊成員的音效音量（0~100）。')+
      fRow('音量',fInp(id,'value','0~100',p.value,'number','min="0" max="100"'));
    case 'soundeffectsother': return fHint('調整其他玩家的音效音量（0~100）。')+
      fRow('音量',fInp(id,'value','0~100',p.value,'number','min="0" max="100"'));
    case 'performsounds': return fHint('調整樂器演奏的音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));
    case 'mountbgm': return fHint('設定騎乘坐騎時是否播放坐騎專屬背景音樂。')+
      fRow('操作',fSel(id,'toggle',[{v:'on',l:'播放坐騎音樂'},{v:'off',l:'不播放坐騎音樂'},{v:'toggle',l:'切換（開↔關）'}],p.toggle||'toggle'));
    case 'systemsoundsspeaker': return fHint('調整 PS4/PS5/Windows DX11 無線手柄揚聲器的系統音效音量（0~100）。留空則切換靜音/取消靜音。')+
      fRow('音量（選填）',fInp(id,'value','0~100，留空＝切換靜音',p.value,'number','min="0" max="100"'));

    /* ── 魔素板 新增 ── */
    case 'magiaright': return fHint('將魔素板順時針轉動一格，切換到下一個屬性。');
    case 'magialeft': return fHint('將魔素板逆時針轉動一格，切換到上一個屬性。');
    case 'magiaattack': return fHint('自動將魔素板切換為攻擊時克制當前目標的屬性。省略目標則使用當前選中的目標。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'magiadefense': return fHint('自動將魔素板切換為與當前目標相同的屬性（利於防禦）。省略目標則使用當前選中的目標。')+
      fRow('目標（選填）',fTgt(id,'target',p.target||''));
    case 'magiaauto': return fHint('設定魔素板是否在選中目標後自動切換屬性。')+
      fRow('模式',fSel(id,'mode',[{v:'atk',l:'攻勢（自動切換為克制屬性）'},{v:'def',l:'守勢（自動切換為相同屬性）'},{v:'off',l:'關閉自動調整'}],p.mode||'off'));

    /* ── 雜項/系統 新增 ── */
    case 'playtime': return fHint('在消息欄顯示當前角色的累計遊戲時間。');
    case 'logout': return fHint('退出遊戲並回到標題畫面。');
    case 'shutdown': return fHint('直接退出並結束遊戲程式。');
    case 'instance': return fHint('檢查當前所在地區是否為副本區域，並在消息欄顯示結果。');
    case 'patchnote': return fHint('開啟瀏覽器並前往官方網站的版本更新筆記頁面。');

    /* ── 巨集設定 ── */
    case 'micon': return fHint('設定巨集在熱鍵欄上顯示的圖示。同一巨集只有第一個 /micon 生效，建議放第一行。')+
      fRow('圖示類型',fSel(id,'miconType',MICON_T,p.miconType||'action'))+
      fRow(p.miconType==='gearset'?'套裝編號':'名稱',fInp(id,'miconName',p.miconType==='gearset'?'套裝編號（數字）':'名稱（與遊戲完全一致）',p.miconName));
    case 'mlock': return fHint('/mlock 讓巨集執行完畢前不允許其他巨集打斷。建議複雜巨集使用，放在第一行效果最好（亦可用上方全域設定）。');
    case 'merror_line': return fHint('控制巨集執行時是否顯示錯誤訊息。巨集結束後自動恢復顯示，無需手動開啟。')+
      fRow('設定',fSel(id,'onOff',[{v:'off',l:'關閉錯誤提示（適合技能輪換、整理類巨集）'},{v:'on',l:'開啟錯誤提示'},{v:'toggle',l:'切換'}],p.onOff||'off'));
    case 'wait_line': return fHint('在巨集中插入等待時間（1~60秒）。讓後續行在指定秒數後才執行。')+
      fRow('等待秒數',fInp(id,'secs','1~60',p.secs,'number','min="1" max="60"'));
    case 'random': return fHint('在說話範圍內廣播一個隨機數字。省略上限值時從 0~999 中抽取；指定上限值則從 1~N 抽取。')+
      fRow('上限值（選填）',fInp(id,'max','省略則 0~999；填入數字則 1~N',p.max,'number','min="2" max="999"'));
    case 'custom': return fHint('直接輸入任何完整指令，原樣輸出。請確保語法完全正確，工具不做任何處理。')+
      fRow('完整指令',fInp(id,'text','輸入完整指令，如：/ta <t>',p.text));

    default: return fHint('選擇行類型以顯示設定選項。');
  }
}

function renderChatFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('在指定頻道發送訊息。可附加音效，或在行末加入等待時間讓後續行延遲執行。')+
    fRow('頻道',fCH(id,'channel',p.channel||'p'))+
    fRow('訊息',fMsgInp(id,'message','輸入訊息內容…',p.message))+
    fRow('音效',fSE(id,'se',p.se))+
    fRow('行末等待',fInp(id,'inlineWait','0',p.inlineWait,'number','min="0" max="60"'),'秒（0＝不等待）');
}
function renderChatCountdownFields(line){
  var p=line.params||{}, id=line.id;
  if(!p.msgs||!p.msgs.length) p.msgs=[{text:'',wait:0,se:'',channel:''}];
  var msgs=p.msgs;
  var chips=MSG_PROS.map(function(mp){
    return '<span class="inline-pro" data-sym="'+esc(mp.v)+'" title="'+esc(mp.l)+'">'+esc(mp.v)+'</span>';
  }).join('');
  function chOptionsFor(sel){
    var opts='<option value=""'+(sel?'':' selected')+'>（使用上方預設頻道）</option>';
    opts+=CH.map(function(c){return '<option value="'+c.v+'"'+(sel===c.v?' selected':'')+'>'+c.l+'</option>';}).join('');
    return opts;
  }
  var rows=msgs.map(function(m,i){
    return '<div class="ccd-msg-block">'+
      '<div class="ccd-row">'+
        '<span class="ccd-num">'+(i+1)+'</span>'+
        '<div class="msg-inp-wrap ccd-msg-wrap">'+
          '<input class="mf-inp ccd-text msg-inp" data-id="'+id+'" data-idx="'+i+'" placeholder="訊息內容" value="'+esc(m.text||'')+'">'+
          '<div class="inline-pro-row">'+chips+'</div>'+
        '</div>'+
        '<button class="ccd-del" data-id="'+id+'" data-idx="'+i+'" title="刪除此行">✕</button>'+
      '</div>'+
      '<div class="ccd-meta-row">'+
        '<span class="ccd-meta-item"><span class="ccd-meta-label">頻道</span>'+
          '<select class="mf-sel ccd-ch" data-id="'+id+'" data-idx="'+i+'" title="此行頻道（留空則用上方預設頻道）">'+chOptionsFor(m.channel||'')+'</select></span>'+
        '<span class="ccd-meta-item"><span class="ccd-meta-label">音效</span>'+
          '<select class="mf-sel ccd-se" data-id="'+id+'" data-idx="'+i+'">'+'<option value="">無音效</option>'+SE.map(function(s){return '<option value="'+s.v+'"'+(m.se===s.v?' selected':'')+'>'+s.l+'</option>';}).join('')+'</select></span>'+
        '<span class="ccd-meta-item"><span class="ccd-meta-label">等待秒數</span>'+
          '<input class="mf-inp ccd-wait" data-id="'+id+'" data-idx="'+i+'" type="number" min="0" max="60" value="'+esc(m.wait===undefined||m.wait===null||m.wait===''?'0':String(m.wait))+'"></span>'+
      '</div>'+
    '</div>';
  }).join('');
  return fHint('逐行輸出訊息，每行可附加等待時間（倒數效果）。預設全部使用同一個頻道，若某幾行想改用其他頻道（例如平時用小隊、最後一行改用喊話），可在該行的「此行頻道」個別覆寫，留空則沿用上方預設頻道。')+
    fRow('預設頻道',fCH(id,'channel',p.channel||'p'))+
    '<div class="ccd-list" id="ccd-list-'+id+'">'+rows+'</div>'+
    '<button class="ccd-add" data-id="'+id+'">＋ 新增行</button>';
}
function renderEchoFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/e 僅自己可見，不會出現在他人畫面。適合用來確認巨集執行進度。')+
    fRow('訊息',fMsgInp(id,'message','輸入提示訊息…',p.message))+
    fRow('音效',fSE(id,'se',p.se));
}
function renderTellFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('傳送悄悄話給指定玩家。指定方式：<t> 目前目標、直接輸入玩家名稱（格式：名字 姓氏）。')+
    fRow('目標',fTgt(id,'target',p.target||'<t>'))+
    fRow('訊息',fMsgInp(id,'message','輸入悄悄話內容…',p.message));
}
function renderReplyFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/r 回覆最後一個傳悄悄話給你的玩家。')+
    fRow('訊息',fMsgInp(id,'message','輸入回覆內容…',p.message));
}
function renderEmFields(line){
  var p=line.params||{}, id=line.id;
  var motionOpts=[{v:'custom',l:'自訂輸入情感動作指令名'}].concat(
    EMOTES.map(function(e){return{v:e.v,l:e.l+'（'+e.v+'）'};}));
  return fHint('/em 顯示第三人稱的自訂文字（如：玩家名 向你微笑。）。所有附近玩家都能看到。')+
    fRow('文字內容',fMsgInp(id,'text','如：向 <t> 微笑。',p.text))+
    fRow('',fChk(id,'addMotion','同時播放情感動作',p.addMotion))+
    (p.addMotion?fRow('情感動作',fSel(id,'motionEmote',motionOpts,p.motionEmote||'bow')+
      (p.motionEmote==='custom'?fInp(id,'motionCustom','輸入情感動作的英文指令名（如 bow）',p.motionCustom):'')):'');
}
function renderCheckFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/check（縮寫 /c）查看目標玩家的詳細情報視窗。省略目標則查看當前選中的目標。')+
    fRow('目標（選填）',fTgt(id,'target',p.target||''));
}
function renderTradeFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/trade 向指定玩家發起交易請求，對方需在附近才能成立。省略目標則向當前選中的目標發起交易。')+
    fRow('目標（選填）',fTgt(id,'target',p.target||''));
}
function renderAssistFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/as 以目標的目標作為新目標（通常用於跟隨坦克選怪）。')+
    fRow('目標',fTgt(id,'target',p.target||'<t>'));
}
function renderFocusTargetFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/focustarget 設定焦點目標（單獨顯示在畫面角落），省略目標則清除焦點目標。')+
    fRow('目標（省略則清除）',fTgt(id,'target',p.target||''));
}
function renderFaceTargetFields(line){
  return fHint('/ft 讓角色立即轉向面對當前選中的目標。');
}
function renderLockOnFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/lo 鎖定當前目標（持續追蹤目標方向）。省略目標則鎖定當前選中目標。')+
    fRow('目標（選填）',fTgt(id,'target',p.target||''));
}
function renderCountdownFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/cd 開始戰鬥倒計時（5~30秒）。省略秒數則開啟倒計時視窗。')+
    fRow('秒數（選填）',fInp(id,'secs','5~30，省略則開啟視窗',p.secs,'number','min="5" max="30"'));
}
function renderReadycheckFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/rcheck 向小隊發起準備確認。所有成員需各自回應準備完畢或未準備好。')+
    fRow('',fChk(id,'notify','確認後在頻道通知',p.notify))+
    (p.notify?fRow('通知訊息',fMsgInp(id,'notifyMsg','準備確認！',p.notifyMsg))+
      fRow('頻道',fCH(id,'notifyChannel',p.notifyChannel))+
      fRow('音效',fSE(id,'notifySe',p.notifySe)):'');
}
function renderFollowFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/follow 跟隨指定目標移動。省略目標則跟隨當前選中的角色。再次執行停止跟隨。')+
    fRow('目標（選填）',fTgt(id,'target',p.target||''));
}
function renderBattleModeFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/bm 切換拔刀/收刀狀態。可選擇強制拔刀、強制收刀，或在兩者之間切換。')+
    fRow('操作',fSel(id,'toggle',[{v:'toggle',l:'切換（拔刀↔收刀）'},{v:'draw',l:'拔刀'},{v:'sheathe',l:'收刀'}],p.toggle||'toggle'));
}
function renderMountFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/mount 乘上指定坐騎。已騎乘時執行會跳下。省略坐騎名則直接跳下當前坐騎。')+
    fRow('坐騎名稱（選填）',fInp(id,'mountName','坐騎名稱（與遊戲完全一致），省略則跳下坐騎',p.mountName));
}
function renderMinionFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/minion 召喚指定寵物。已召喚同一隻時再次執行會讓牠離開。')+
    fRow('寵物名稱',fInp(id,'minionName','寵物名稱（與遊戲完全一致）',p.minionName));
}
function renderStatusoffFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/statusoff "狀態名稱" 解除自身指定的單一強化狀態（如食物效果、藥水效果），需與遊戲內顯示名稱完全一致。')+
    fRow('狀態名稱',fInp(id,'statusName','狀態名稱（與遊戲完全一致），如：舍身',p.statusName));
}
function renderNameplateFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/nameplatedisp 設定指定對象的名牌「顯示時機」（何時看得到名牌）。若要改的是名牌上顯示全名／略名，請改用「名牌顯示格式 /nameplatetype」。')+
    fRow('對象',fSel(id,'target',[
      {v:'all',l:'全部玩家'},{v:'self',l:'自己'},{v:'party',l:'小隊成員'},
      {v:'alliance',l:'團隊成員'},{v:'other',l:'其他玩家'},{v:'friend',l:'好友'},
      {v:'feast',l:'群狼盛宴敵人'}],p.target||'all'))+
    fRow('顯示設定',fSel(id,'setting',[
      {v:'1',l:'1 — 一直顯示'},{v:'2',l:'2 — 戰鬥時顯示'},
      {v:'3',l:'3 — 選為目標時顯示'},{v:'4',l:'4 — 不顯示'}],p.setting||'1'));
}
function renderNameplateTypeFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/nameplatetype 設定指定對象的名牌「顯示格式」（名字要顯示全名還是縮寫）。若要改的是名牌何時看得到，請改用「名牌顯示時機 /nameplatedisp」。')+
    fRow('對象',fSel(id,'target',[
      {v:'all',l:'全部玩家'},{v:'self',l:'自己'},{v:'party',l:'小隊成員'},
      {v:'alliance',l:'團隊成員'},{v:'other',l:'其他玩家'},{v:'friend',l:'好友'},
      {v:'feast',l:'群狼盛宴敵人'}],p.target||'all'))+
    fRow('格式',fSel(id,'setting',[
      {v:'1',l:'1 — 全名'},{v:'2',l:'2 — 略姓（僅顯示名，姓縮寫）'},
      {v:'3',l:'3 — 略名（僅顯示姓，名縮寫）'},{v:'4',l:'4 — 縮寫（僅顯示姓名首字母）'}],p.setting||'1'));
}
function renderBattleEffectFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/battleeffect 設定戰鬥特效的顯示密度，可分別設定自己、小隊、他人、PvP敵人。')+
    fRow('對象',fSel(id,'effTarget',[
      {v:'self',l:'自己'},{v:'party',l:'小隊'},{v:'other',l:'他人'},{v:'enemypc',l:'PvP敵方玩家'}],p.effTarget||'self'))+
    fRow('顯示類型',fSel(id,'effType',[
      {v:'all',l:'完全顯示'},{v:'simple',l:'簡單顯示'},{v:'off',l:'不顯示'}],p.effType||'all'));
}

function renderSkillFields(line,type){
  var p=line.params||{}, id=line.id;
  var labelMap={'skill':'職業技能（需要學會才能使用，如：治癒、神聖領域）',
    'generalskill':'通用技能（所有職業都有的動作，如：跳躍、衝刺、極限技）',
    'blueaction':'青魔法技能（青魔法師專用，需設定為有效技能）',
    'pvpaction':'PvP技能（只在對戰區生效）',
    'petaction':'召喚獸技能（控制召喚師的召喚獸）',
    'companionaction':'搭擋技能（控制陸行鳥搭擋）'};
  var cmdMap={'skill':'/ac','generalskill':'/gaction','blueaction':'/blueaction',
    'pvpaction':'/pvpaction','petaction':'/petaction','companionaction':'/companionaction'};
  var groundHint=type!=='companionaction'?'　若技能需要「地面目標」（如縮地、部分場地技），省略目標或不勾選地面關時，執行後角色會進入地面瞄準模式等待你點擊；勾選「地面關」則直接對目前所指位置發動，不進入瞄準模式。':'';
  return fHint(labelMap[type]+'　以自己為目標的技能可省略「目標」欄位。'+groundHint)+
    fRow('技能名稱',fInp(id,'skillName','技能名稱（與遊戲完全一致）',p.skillName))+
    (type!=='companionaction'&&!p.groundOff?fRow('目標',fTgt(id,'target',p.target||'<t>')):'')+
    (type!=='companionaction'?fRow('',fChk(id,'groundOff','地面關（gtoff，僅地面目標技能適用，勾選後直接對所指位置發動，忽略目標欄位）',p.groundOff)):'')+
    fRow('等待秒數',fInp(id,'inlineWait','0',p.inlineWait,'number','min="0" max="60"'),'秒（0＝不等待，加在行末 &lt;wait.X&gt;）')+
    (type==='skill'?'<div class="mf-combat-warn">⚠ 職業技能巨集可能干擾 GCD 循環，建議只用於低頻技能或非高強度戰鬥</div>':'')+
    fSep('附加選項（每勾選一項增加一行輸出）')+
    fRow('',fChk(id,'preAnnounce','施放前預告（先在頻道發出訊息，等待後再施放）',p.preAnnounce))+
    (p.preAnnounce?
      fRow('預告訊息',fMsgInp(id,'preAnnounceMsg','即將施放技能！',p.preAnnounceMsg))+
      fRow('頻道',fCH(id,'preAnnounceChannel',p.preAnnounceChannel))+
      fRow('等待秒數',fInp(id,'preAnnounceWait','2',p.preAnnounceWait,'number','min="0" max="60"'),'秒（等待後再施放）')+
      fRow('音效',fSE(id,'preAnnounceSe',p.preAnnounceSe)):'')+
    fRow('',fChk(id,'postNotify','施放後立即在頻道通知',p.postNotify))+
    (p.postNotify?
      fRow('通知訊息',fMsgInp(id,'postNotifyMsg','技能已施放！',p.postNotifyMsg))+
      fRow('頻道',fCH(id,'postNotifyChannel',p.postNotifyChannel))+
      fRow('音效',fSE(id,'postNotifySe',p.postNotifySe)):'')+
    fRow('',fChk(id,'postEcho','施放後自我提示（僅自己看到）',p.postEcho))+
    (p.postEcho?
      fRow('提示訊息',fMsgInp(id,'postEchoMsg','技能使用完畢',p.postEchoMsg))+
      fRow('音效',fSE(id,'postEchoSe',p.postEchoSe)):'')+
    fRow('',fChk(id,'recastNotify','施放後顯示冷卻時間（使用 &lt;recast&gt; 代名詞）',p.recastNotify))+
    (p.recastNotify?
      fRow('前綴文字',fInp(id,'recastPrefix','留空則自動填入【技能名】剩餘冷卻：',p.recastPrefix))+
      fRow('後綴文字',fInp(id,'recastSuffix',' 秒',p.recastSuffix||' 秒'))+
      fRow('發送到',fSel(id,'recastChannel',[{v:'e',l:'默語（僅自己）'},{v:'p',l:'小隊'},{v:'fc',l:'部隊'}],p.recastChannel||'e'))+
      fRow('音效',fSE(id,'recastSe',p.recastSe)):''
    );
}

function renderItemFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('使用背包中的指定道具。道具必須在背包裡才能執行，名稱需與遊戲完全一致。')+
    fRow('道具名稱',fInp(id,'itemName','道具名稱（與遊戲完全一致，如：高級乙太藥）',p.itemName))+
    fRow('目標',fTgt(id,'target',p.target||'<me>'))+
    fSep('附加選項')+
    fRow('',fChk(id,'postEcho','使用後顯示確認訊息（僅自己看到）',p.postEcho))+
    (p.postEcho?fRow('確認訊息',fMsgInp(id,'postEchoMsg','已使用：'+(p.itemName||'道具名稱'),p.postEchoMsg))+fRow('音效',fSE(id,'postEchoSe',p.postEchoSe)):'');
}

function renderEmoteFields(line){
  var p=line.params||{}, id=line.id;
  var emoteOpts=[{v:'custom',l:'自訂輸入情感動作指令名'}].concat(
    EMOTES.map(function(e){return{v:e.v,l:e.l+'（'+e.v+'）'};}));
  return fHint('播放指定情感動作。勾選「僅播動作」後加上 motion 子命令，只播放動作動畫但不顯示文字提示。')+
    fRow('情感動作',fSel(id,'emoteName',emoteOpts,p.emoteName||'bow')+
      (p.emoteName==='custom'?fInp(id,'emoteCustom','輸入情感動作的英文指令名（如 bow）',p.emoteCustom):''))+
    fRow('',fChk(id,'motionOnly','僅播動作，不顯示文字提示（加上 motion）',p.motionOnly))+
    fSep('選填：同時發出感情表現文字')+
    fHint('情感動作後緊接 /em 文字，效果：角色播放動作，同時顯示第三人稱自訂文字。')+
    fRow('',fChk(id,'addEm','附加感情表現文字（/em）',p.addEm))+
    (p.addEm?fRow('文字內容',fMsgInp(id,'emText','如：向 <t> 深深一鞠躬。',p.emText))+fRow('音效',fSE(id,'emSe',p.emSe)):'');
}

function renderAbilityRotation(line){
  var p=line.params||{}, id=line.id;
  if(!p.skills||!p.skills.length) p.skills=['','',''];
  var skills=p.skills;
  var skillInputs=skills.map(function(s,i){
    return '<div class="ar-skill-row"><span class="ar-num">'+(i+1)+'</span>'+
      '<input class="mf-inp ar-skill" data-id="'+id+'" data-ar-idx="'+i+'" placeholder="技能名稱（與遊戲完全一致）" value="'+esc(s)+'">'+'<button class="ar-del" data-id="'+id+'" data-ar-idx="'+i+'">✕</button></div>';
  }).join('');
  return fHint('將多個能力技（不佔 GCD 的技能）排在一起。反覆按下此巨集，會依序嘗試施放每個技能，冷卻中的會跳過（建議搭配全局 /merror off 或在上方勾選）。')+
    '<div class="mf-combat-warn">⚠ 此功能需要技能均為「能力技」（不佔 GCD 的瞬發技），若放入佔 GCD 的技能會影響循環。</div>'+
    fRow('目標',fTgt(id,'target',p.target||'<t>'))+
    fRow('等待秒數',fInp(id,'inlineWait','0',p.inlineWait,'number','min="0" max="60"'),'秒（一般能力技不需等待）')+
    fSep('技能列表（按上至下順序排列）')+
    '<div class="ar-list" id="ar-list-'+id+'">'+skillInputs+'</div>'+
    '<button class="ar-add" data-id="'+id+'">＋ 新增技能</button>';
}

function renderTargetingFields(line){
  var p=line.params||{}, id=line.id;
  var cmds=[
    {v:'/bt',l:'/bt　選中最近敵視目標（最常用）'},
    {v:'/ta',l:'/ta　選中指定目標（搭配代名詞）'},
    {v:'/tpc',l:'/tpc　選中最近玩家'},
    {v:'/tnpc',l:'/tnpc　選中最近 NPC'},
    {v:'/tenemy',l:'/tenemy　選中最近敵人'},
    {v:'/nt',l:'/nt　向右順次選中下一個目標'},
    {v:'/previoustarget',l:'/previoustarget　向左選中上一個目標'},
    {v:'/tlt',l:'/tlt　重新選中上次目標'},
    {v:'/tle',l:'/tle　重新選中前次敵人'}
  ];
  return fHint('選中指定種類的目標。')+
    fRow('指令',fSel(id,'targetCmd',cmds,p.targetCmd||'/bt'))+
    ((!p.targetCmd||p.targetCmd==='/bt'||p.targetCmd==='/ta'||p.targetCmd==='/as')?
      fRow('目標（選填）',fTgt(id,'targetParam',p.targetParam||'')):'');
}

function renderMarkingFields(line){
  var p=line.params||{}, id=line.id;
  var mkTypes=[
    {v:'attack',l:'攻擊（自動下一個編號）'},{v:'attack1',l:'攻擊1'},{v:'attack2',l:'攻擊2'},
    {v:'attack3',l:'攻擊3'},{v:'attack4',l:'攻擊4'},{v:'attack5',l:'攻擊5'},
    {v:'bind',l:'止步（自動下一個編號）'},{v:'bind1',l:'止步1'},{v:'bind2',l:'止步2'},{v:'bind3',l:'止步3'},
    {v:'stop',l:'禁止（自動下一個編號）'},{v:'stop1',l:'禁止1'},{v:'stop2',l:'禁止2'},
    {v:'square',l:'方塊'},{v:'circle',l:'圓圈'},{v:'cross',l:'叉'},{v:'triangle',l:'三角'},
    {v:'clear',l:'清除所有標記'}
  ];
  return fHint('給目標加上攻擊順序或形狀標記。小隊成員都能看到標記。')+
    fRow('標記種類',fSel(id,'markType',mkTypes,p.markType||'attack1'))+
    (p.markType!=='clear'?fRow('標記目標',fTgt(id,'markTarget',p.markTarget||'<t>')):'')+
    fSep('選填：完成後通知')+
    fRow('',fChk(id,'notify','完成後在頻道通知',p.notify))+
    (p.notify?fRow('訊息',fMsgInp(id,'notifyMsg','標記已設定！',p.notifyMsg))+fRow('頻道',fCH(id,'notifyChannel',p.notifyChannel))+fRow('音效',fSE(id,'notifySe',p.notifySe)):'');
}

function renderWaymarkFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/wmark 設置場景標記（A/B/C/D 或 1~4），讓隊友知道站位或集合點。也可將目前擺放的整組標記存成預設，之後一鍵讀取。')+
    fRow('模式',fSel(id,'waymarkAction',
      [{v:'toggle',l:'切換單一標記（已設定則撤除）'},{v:'target',l:'將單一標記設在當前目標腳下（<t>）'},
       {v:'clear',l:'清除所有場景標記'},{v:'save',l:'儲存目前擺放為預設'},{v:'preset',l:'讀取已儲存的預設'}],
      p.waymarkAction||'toggle'))+
    (['toggle','target'].indexOf(p.waymarkAction||'toggle')>=0?
      fRow('標記',fSel(id,'waymarkName',[{v:'A',l:'A'},{v:'B',l:'B'},{v:'C',l:'C'},{v:'D',l:'D'},{v:'1',l:'1'},{v:'2',l:'2'},{v:'3',l:'3'},{v:'4',l:'4'}],p.waymarkName||'A')):'')+
    (['save','preset'].indexOf(p.waymarkAction)>=0?
      fRow('預設編號',fSel(id,'presetSlot',[{v:'1',l:'1'},{v:'2',l:'2'},{v:'3',l:'3'},{v:'4',l:'4'},{v:'5',l:'5'}],p.presetSlot||'1')):'')+
    fSep('選填：完成後通知')+
    fRow('',fChk(id,'notify','完成後在頻道通知',p.notify))+
    (p.notify?fRow('訊息',fMsgInp(id,'notifyMsg','場景標記已設置！',p.notifyMsg))+fRow('頻道',fCH(id,'notifyChannel',p.notifyChannel))+fRow('音效',fSE(id,'notifySe',p.notifySe)):'');
}



function renderGearsetFields(line){
  var p=line.params||{}, id=line.id;
  return fHint('/gs 切換、儲存、刪除或查看裝備套裝。套裝編號也可用套裝名稱的開頭字母代替。可附加圖示和確認訊息，讓熱鍵欄視覺效果統一。')+
    fRow('動作',fSel(id,'gsAction',[{v:'change',l:'切換套裝'},{v:'save',l:'儲存當前裝備至此編號'},{v:'view',l:'查看套裝內容'},{v:'delete',l:'刪除此編號套裝（僅刪除套裝紀錄，不影響裝備本身）'}],p.gsAction||'change'))+
    fRow('套裝編號',fInp(id,'gsNumber','1',p.gsNumber,'number','min="1" max="100"'),'（1~100，或填套裝名稱）')+
    (p.gsAction==='change'?fRow('投影板編號（選填）',fInp(id,'plateNumber','若有投影板功能可指定要套用的板號',p.plateNumber,'number','min="1"')):'')+
    fSep('附加選項')+
    fRow('',fChk(id,'addMicon','加入巨集圖示（/micon，讓熱鍵欄顯示套裝圖示）',p.addMicon))+
    (p.addMicon?fRow('圖示類型',fSel(id,'miconType',MICON_T,p.miconType||'gearset')):'')+
    fRow('',fChk(id,'addEcho','加入切換確認訊息（僅自己看到）',p.addEcho))+
    (p.addEcho?fRow('確認訊息',fMsgInp(id,'echoMsg','已切換至套裝 '+(p.gsNumber||'1'),p.echoMsg))+fRow('音效',fSE(id,'echoSe',p.echoSe)):'');
}

function renderItemsortFields(line){
  var p=line.params||{}, id=line.id;
  var areaChecks=IS_AREAS.map(function(a){
    var checked=(p.areas||[]).indexOf(a.v)>=0;
    return '<label class="is-area-lbl'+(checked?' checked':'')+'"><input type="checkbox" class="is-area-cb" data-id="'+id+'" data-area="'+a.v+'"'+(checked?' checked':'')+'>'+a.l+'</label>';
  }).join('');
  var conds=p.conditions||[];
  var condRows=conds.map(function(c,ci){
    var cdef=IS_C.filter(function(x){return x.v===c.criterion;})[0];
    return '<div class="is-cond-row">'+
      '<select class="mf-sel is-crit-sel" data-id="'+id+'" data-ci="'+ci+'">'+
        IS_C.map(function(x){return'<option value="'+x.v+'"'+(x.v===c.criterion?' selected':'')+'>'+x.l+'</option>';}).join('')+
      '</select>'+
      (cdef&&cdef.o?'<select class="mf-sel is-ord-sel" data-id="'+id+'" data-ci="'+ci+'"><option value="des"'+(c.order==='des'?' selected':'')+'>降序（高→低）</option><option value="asc"'+(c.order==='asc'?' selected':'')+'>升序（低→高）</option></select>':'<span class="mf-unit">（無升降序）</span>')+
      '<button class="is-del-cond" data-id="'+id+'" data-ci="'+ci+'">✕</button>'+
    '</div>';
  }).join('');
  return fHint('按設定條件整理指定區域的物品。每個區域依照排序條件的順序（上方優先）重新排列。注意：勾選「雇員物品」或「陸行鳥鞍囊」時，該視窗必須已經開啟才會生效（可在巨集最前面加一行開啟該視窗的指令）。')+
    fSep('整理目標（可多選）')+
    '<div class="is-area-wrap">'+
      '<button class="is-sel-common" data-id="'+id+'">常用整理（背包＋兵裝庫＋鞍囊）</button>'+
      '<button class="is-sel-all" data-id="'+id+'">全選</button>'+
      '<button class="is-sel-none" data-id="'+id+'">全不選</button>'+
    '</div>'+
    '<div class="is-areas" id="is-areas-'+id+'">'+areaChecks+'</div>'+
    fRow('',fChk(id,'useClear','每個區域排序前先執行 /itemsort clear（清除舊設定，使結果更乾淨）',p.useClear!==false))+
    fSep('排序條件（由上至下優先順序）')+
    '<div class="is-conds" id="is-conds-'+id+'">'+condRows+'</div>'+
    '<button class="is-add-cond" data-id="'+id+'">＋ 新增條件</button>'+
    fSep('完成後確認訊息（選填）')+
    fRow('訊息',fMsgInp(id,'echoMsg','整理完成！（留空則不輸出）',p.echoMsg))+
    fRow('音效',fSE(id,'echoSe',p.echoSe));
}

function renderHudFields(line){
  var p=line.params||{}, id=line.id;
  var wins=p.windows||[];
  var winChecks=HUD_W.map(function(w){
    var checked=wins.indexOf(w.v)>=0;
    return '<label class="is-area-lbl'+(checked?' checked':'')+'"><input type="checkbox" class="hud-win-cb" data-id="'+id+'" data-win="'+w.v+'"'+(checked?' checked':'')+'>'+w.l+'</label>';
  }).join('');
  return fHint('一次控制多個 UI 視窗的顯示狀態。勾選要操作的視窗，再選擇統一的操作方式。')+
    fRow('操作方式',fSel(id,'toggle',[{v:'toggle',l:'切換（開↔關）'},{v:'on',l:'全部顯示'},{v:'off',l:'全部隱藏'}],p.toggle||'toggle'))+
    fSep('選擇要操作的視窗（可多選）')+
    '<div class="is-areas" id="hud-wins-'+id+'">'+winChecks+'</div>';
}

/* ════════════════════════════════════════════════
   LINE ROW HTML
════════════════════════════════════════════════ */
function lineSummary(line){
  var def=TDEFS[line.type]||{icon:'?',label:'未知'};
  var prev=linePreview(line);var cnt=lineCount(line);
  var cmds=buildLines(line);
  var r=parseInt(line.repeat)||1;
  return '<span class="ml-icon">'+def.icon+'</span>'+
    '<span class="ml-type-name">'+def.label+'</span>'+
    (cnt>1?'<span class="ml-blk-badge">'+cnt+'行</span>':'')+
    (r>1?'<span class="ml-rep-badge">×'+r+'</span>':'')+
    '<span class="ml-preview">'+esc(prev.length>60?prev.slice(0,60)+'…':prev)+'</span>';
}

function typeComboDropdownHTML(query,currentType){
  var q=(query||'').trim().toLowerCase();
  var html='',any=false;
  CATS.forEach(function(c){
    var typesInCat=Object.keys(TDEFS).filter(function(k){
      if(TDEFS[k].cat!==c.id) return false;
      if(!q) return true;
      var d=TDEFS[k];
      return d.label.toLowerCase().indexOf(q)>=0||k.toLowerCase().indexOf(q)>=0
        ||(d.kw&&d.kw.toLowerCase().indexOf(q)>=0);
    });
    if(!typesInCat.length) return;
    any=true;
    html+='<div class="sub-combo-grp">'+esc(c.icon+' '+c.label)+'</div>';
    html+=typesInCat.map(function(k){
      var d=TDEFS[k];
      return '<div class="sub-combo-item'+(k===currentType?' selected':'')+'" data-type="'+k+'">'+esc(d.icon+' '+d.label)+'</div>';
    }).join('');
  });
  if(!any) html='<div class="sub-combo-empty">沒有符合的行類型，換個關鍵字試試？</div>';
  return html;
}
function lineHTML(line,idx){
  var def=TDEFS[line.type]||{icon:'?',label:'未知'};
  var cmds=buildLines(line);
  var hdr_chars=cc(cmds[0]||'');
  var char_class=hdr_chars>MAX_C?' ml-chars-over':hdr_chars>WARN_C?' ml-chars-warn':'';
  var isFirst=idx===0, isLast=idx===lines.length-1;
  var isActive=line.id===activeLineId;
  return '<div class="ml-row'+(isActive?' ml-active':'')+'" data-id="'+line.id+'" data-expanded="'+(line.expanded?'1':'0')+'">'
    +'<div class="ml-head" data-toggle-id="'+line.id+'">'
      +'<div class="ml-left">'
        +'<span class="ml-num">'+(idx+1)+'</span>'
        +'<div class="ml-reorder">'
          +'<button class="ml-mv" data-id="'+line.id+'" data-dir="up"'+(isFirst?' disabled':'')+'>▲</button>'
          +'<button class="ml-mv" data-id="'+line.id+'" data-dir="down"'+(isLast?' disabled':'')+'>▼</button>'
        +'</div>'
      +'</div>'
      +'<div class="ml-summary">'+lineSummary(line)+'</div>'
      +'<div class="ml-right">'
        +'<span class="ml-chars'+char_class+'">'+hdr_chars+'/180</span>'
        +'<span class="ml-exp-icon">'+(line.expanded?'▲':'▼')+'</span>'
        +'<button class="ml-del" data-id="'+line.id+'" title="刪除此行">✕</button>'
      +'</div>'
    +'</div>'
    +(line.expanded?'<div class="ml-body">'
        +'<div class="ml-type-row">'
          +'<span class="ml-type-lbl">行類型</span>'
          +'<div class="sub-combo-wrap ml-type-combo" data-id="'+line.id+'">'
            +'<input type="text" class="sub-combo-inp ml-type-combo-inp" data-id="'+line.id+'" value="'+esc(def.icon+' '+def.label)+'" autocomplete="off" placeholder="🔍 搜尋或選擇行類型…">'
            +'<div class="sub-combo-dd ml-type-combo-dd" data-id="'+line.id+'" style="display:none"></div>'
          +'</div>'
        +'</div>'
        +'<div class="ml-fields">'+renderFields(line)+'</div>'
        +(def.isBlock?'<button class="ml-expand-btn" data-id="'+line.id+'">展開為獨立行（可個別編輯）</button>':
          '<div class="ml-repeat-row"><span class="ml-repeat-lbl">重複次數</span><input class="ml-repeat-inp" type="number" min="1" max="15" data-id="'+line.id+'" value="'+(line.repeat||1)+'"><span class="ml-repeat-hint">（此行在輸出中重複幾次）</span></div>'
        )
        +'<div class="ml-note-wrap"><input class="ml-note" data-id="'+line.id+'" placeholder="備註（僅此工具顯示，不輸出到巨集）" value="'+esc(line.note||'')+'"></div>'
        +'<div class="ml-cmd-preview">'+cmds.map(function(s){return esc(s);}).join('<br>')+'</div>'
      +'</div>':'')
    +'</div>';
}

/* ════════════════════════════════════════════════
   CATEGORY PICKER
════════════════════════════════════════════════ */
function pickerHTML(){
  return '<div class="mt-picker">'
    +'<div class="mt-picker-search-wrap">'
      +'<input type="text" class="mt-picker-search" id="mt-picker-search" placeholder="🔍 搜尋指令類型（例如：技能、坐騎、/mount）" value="'+esc(pickerSearch)+'" autocomplete="off">'
      +'<button type="button" class="mt-picker-search-clear" id="mt-picker-search-clear" style="display:'+(pickerSearch?'':'none')+'" title="清除搜尋">✕</button>'
    +'</div>'
    +'<div id="mt-picker-results">'+pickerResultsHTML()+'</div>'
  +'</div>';
}
function pickerResultsHTML(){
  var q=(pickerSearch||'').trim().toLowerCase();
  if(q){
    var matches=Object.keys(TDEFS).filter(function(k){
      var d=TDEFS[k];
      return d.label.toLowerCase().indexOf(q)>=0||k.toLowerCase().indexOf(q)>=0
        ||(d.kw&&d.kw.toLowerCase().indexOf(q)>=0);
    });
    if(!matches.length){
      return '<div class="mt-picker-empty">沒有符合「'+esc(pickerSearch)+'」的指令類型，換個關鍵字試試？</div>';
    }
    return '<div class="mt-picker-title">搜尋結果（'+matches.length+'）</div>'
      +'<div class="mt-picker-types">'
      +matches.map(function(k){
        var d=TDEFS[k];
        var catDef=CATS.filter(function(c){return c.id===d.cat;})[0];
        return '<button class="mt-type-btn" data-type="'+k+'">'+d.icon+' '+d.label
          +(catDef?'<span class="mt-type-cat-tag">'+catDef.icon+catDef.label+'</span>':'')
          +'</button>';
      }).join('')
      +'</div>';
  }
  if(!pickerCat){
    return '<div class="mt-picker-title">選擇要新增的行類型：</div>'
      +'<div class="mt-picker-cats">'
      +CATS.map(function(c){return '<button class="mt-cat-btn" data-cat="'+c.id+'">'+c.icon+'<span class="mt-cat-lbl">'+c.label+'</span><span class="mt-cat-desc">'+c.desc+'</span></button>';}).join('')
      +'</div>';
  }
  var types=Object.keys(TDEFS).filter(function(k){return TDEFS[k].cat===pickerCat;});
  var catDef=CATS.filter(function(c){return c.id===pickerCat;})[0]||{icon:'',label:''};
  return '<div class="mt-picker-title">'
    +'<button class="mt-picker-back">← 返回</button>'
    +catDef.icon+' '+catDef.label+'</div>'
    +'<div class="mt-picker-types">'
    +types.map(function(k){var d=TDEFS[k];return '<button class="mt-type-btn" data-type="'+k+'">'+d.icon+' '+d.label+'</button>';}).join('')
    +'</div>';
}

/* ════════════════════════════════════════════════
   TOOL HTML
════════════════════════════════════════════════ */
function toolHTML(){
  return '<h2 class="unified-gold-header small">⚙ 巨集建立工具</h2>'
    +'<div class="fancy-divider mini"><div class="long-silk-line-short"></div></div>'
    +'<p class="mt-intro">FF14 巨集上限 <b>15 行</b>，每行上限 <b>180 字元</b>（中文字每個佔3字元，英文/符號/空格各佔1字元）。工具即時計算並提示問題。每一行均可自由修改、增減及調換順序。模板供快速開始，可自由修改。</p>'
    +'<div class="mt-steps"><span class="mt-step active">① 選擇模板或新增行</span><span class="mt-step-arr">→</span><span class="mt-step">② 展開各行進行設定</span><span class="mt-step-arr">→</span><span class="mt-step">③ 確認後複製貼入遊戲</span></div>'
    // Global settings
    +'<div class="mt-global-bar">'
      +'<span class="mt-global-ttl">全局設定（自動加入巨集開頭）</span>'
      +'<label class="mt-glbl-chk" title="執行完畢前不允許其他巨集打斷，建議複雜巨集使用"><input type="checkbox" id="g-mlock"'+(globalCfg.mlock?' checked':'')+'> /mlock　鎖定巨集</label>'
      +'<label class="mt-glbl-chk" title="關閉執行中的錯誤提示，巨集結束後自動恢復，技能輪換及整理類巨集建議開啟"><input type="checkbox" id="g-merror"'+(globalCfg.merrorOff?' checked':'')+'>  /merror off　關閉錯誤提示</label>'
    +'</div>'
    // Templates
    +'<div class="mt-sec">'
      +'<div class="mt-sec-hdr"><span class="mt-sec-lbl">▸ 模板快速開始</span>'
      +'<button class="mt-clearall" id="mt-clearall">清空所有行</button></div>'
      +'<div class="mt-tpl-row">'
        +TEMPLATES.map(function(t){return '<div class="mt-tpl-card" data-tpl="'+t.id+'"><div class="mt-tpl-icon">'+t.icon+'</div><div class="mt-tpl-info"><div class="mt-tpl-name">'+t.label+'</div><div class="mt-tpl-desc">'+t.desc+'</div></div></div>';}).join('')
      +'</div>'
    +'</div>'
    // Line editor
    +'<div class="mt-sec mt-editor-sec">'
      +'<div class="mt-sec-hdr">'
        +'<span class="mt-sec-lbl">▸ 行編輯器</span>'
        +'<span class="mt-lc" id="mt-lc">0 / 15 行</span>'
      +'</div>'
      +'<div class="mt-lines" id="mt-lines"><div class="mt-empty">尚無行 — 選擇模板，或按「＋ 新增行」</div></div>'
      +'<div id="mt-picker-wrap"></div>'
      +'<button class="mt-addbtn" id="mt-addbtn">＋ 新增行</button>'
    +'</div>'
    // Warnings
    +'<div class="mt-sec mt-warn-sec" id="mt-warn-sec" style="display:none">'
      +'<div class="mt-sec-lbl">▸ 提示與警告</div><div id="mt-warns"></div>'
    +'</div>'
    // Preview
    +'<div class="mt-sec" id="mt-preview-sec">'
      +'<div class="mt-sec-hdr"><span class="mt-sec-lbl">▸ 巨集預覽</span>'
      +'<div style="display:flex;gap:8px;">'
      +'<button class="mt-edit-toggle" id="mt-edit-toggle">切換編輯</button>'
      +'<button class="mt-copybtn" id="mt-copybtn">複製巨集</button>'
      +'</div></div>'
      +'<div id="mt-preview-wrap"><pre class="mt-preview" id="mt-preview">（巨集為空）</pre></div>'
      +'<div id="mt-split-area"></div>'
    +'</div>'
    // Pronouns
    +'<div class="mt-sec">'
      +'<div class="mt-sec-lbl">▸ 常用指令代名詞 <span class="mt-prosub">（點擊可複製）</span></div>'
      +'<div class="mt-prorow">'+PRONS.map(function(p){return '<span class="mt-pro" title="'+esc(p.d)+'">'+esc(p.s)+'</span>';}).join('')+'</div>'
    +'</div>';
}

/* ════════════════════════════════════════════════
   RENDER
════════════════════════════════════════════════ */
function render(){
  var el=document.getElementById('mt-lines');
  if(!el) return;
  el.innerHTML=lines.length?lines.map(function(l,i){return lineHTML(l,i);}).join('')
    :'<div class="mt-empty">尚無行 — 選擇模板，或按「＋ 新增行」</div>';
  var lc=document.getElementById('mt-lc');
  if(lc){var t=getTotalLines();lc.textContent=t+' / 15 行';lc.className='mt-lc'+(t>MAX?' over':t>12?' warn':'');}
  var ab=document.getElementById('mt-addbtn');if(ab) ab.disabled=getTotalLines()>=MAX;
  var pw=document.getElementById('mt-picker-wrap');
  if(pw){
    var showPicker=(pickerCat!==null)||(pickerCat===null&&!!pw.dataset.open);
    pw.innerHTML=showPicker?pickerHTML():'';
    if(showPicker)bindPickerEvents();
  }
  bindLineEvents();
  updatePreview();
}

function updatePreview(){
  var out=getAllOutput();
  // Don't overwrite if user is editing
  if(!previewEditable){
    var pre=document.getElementById('mt-preview');
    if(pre) pre.textContent=out.length?out.join('\n'):'（巨集為空）';
  }
  var warns=validate();
  var ws=document.getElementById('mt-warn-sec'),wc=document.getElementById('mt-warns');
  if(ws&&wc){
    if(!warns.length){ws.style.display='none';}
    else{ws.style.display='';wc.innerHTML=warns.map(function(w){
      return '<div class="mt-warn '+w.lv+'">'+(w.lv==='error'?'⛔':w.lv==='warn'?'⚠️':'ℹ️')+' '+esc(w.msg)+'</div>';
    }).join('');}
  }
  // Split button
  var sa=document.getElementById('mt-split-area');
  if(sa){
    if(out.length>MAX){
      splitData=doSplit(out);
      var overflowNote=splitData.overflow>0
        ?'<div class="mt-split-note mt-split-error">⛔ 內容過長，即使分割成兩個巨集仍放不下，巨集 2 已被截斷，少了 '+splitData.overflow+' 行（未包含在下方輸出中）！請先刪減部分內容，或將巨集2的內容再拆成更多自訂行/巨集。</div>'
        :'';
      sa.innerHTML='<div class="mt-split-note">⚠ 此巨集超過 '+MAX+' 行，已自動分割成兩個巨集。兩個都需分別複製使用，請依序執行巨集1 → 巨集2。</div>'
        +overflowNote
        +'<div class="mt-dual">'
          +'<div class="mt-dual-col"><div class="mt-dual-hdr">巨集 1（'+splitData.m1.length+'/'+MAX+' 行）</div><pre class="mt-split-pre">'+esc(splitData.m1.join('\n'))+'</pre><button class="mt-split-copy" data-which="1">複製巨集 1</button></div>'
          +'<div class="mt-dual-col"><div class="mt-dual-hdr">巨集 2（'+splitData.m2.length+'/'+MAX+' 行'+(splitData.overflow>0?'，另有 '+splitData.overflow+' 行被截斷':'')+'）</div><pre class="mt-split-pre">'+esc(splitData.m2.join('\n'))+'</pre><button class="mt-split-copy" data-which="2">複製巨集 2</button></div>'
        +'</div>';
      document.getElementById('mt-copybtn').style.display='none';
    } else {
      splitData=null;sa.innerHTML='';
      var cb=document.getElementById('mt-copybtn');if(cb)cb.style.display='';
    }
  }
}

function updateRow(id){
  var line=lines.find(function(l){return l.id===id;});if(!line)return;
  var row=document.querySelector('.ml-row[data-id="'+id+'"]');if(!row)return;
  var cmds=buildLines(line);var hdr_chars=cc(cmds[0]||'');
  var cc_class=hdr_chars>MAX_C?' ml-chars-over':hdr_chars>WARN_C?' ml-chars-warn':'';
  var charEl=row.querySelector('.ml-chars');if(charEl){charEl.textContent=hdr_chars+'/180';charEl.className='ml-chars'+cc_class;}
  var sumEl=row.querySelector('.ml-summary');if(sumEl)sumEl.innerHTML=lineSummary(line);
  var cmdEl=row.querySelector('.ml-cmd-preview');if(cmdEl)cmdEl.innerHTML=cmds.map(function(s){return esc(s);}).join('<br>');
}

/* ── Split logic ── */
function doSplit(allLines){
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

/* ── Force exit preview edit mode (call before any major content replacement) ── */
function exitPreviewEdit(){
  if(!previewEditable) return;
  previewEditable=false;
  var etBtn=document.getElementById('mt-edit-toggle');
  if(etBtn){etBtn.textContent='切換編輯';etBtn.classList.remove('active');}
  var wrap=document.getElementById('mt-preview-wrap');
  if(wrap) wrap.innerHTML='<pre class="mt-preview" id="mt-preview"></pre>';
}

/* ════════════════════════════════════════════════
   EVENTS
════════════════════════════════════════════════ */
function bindRoot(){
  // Global settings
  var gm=document.getElementById('g-mlock');
  if(gm)gm.addEventListener('change',function(){globalCfg.mlock=gm.checked;render();});
  var ge=document.getElementById('g-merror');
  if(ge)ge.addEventListener('change',function(){globalCfg.merrorOff=ge.checked;render();});
  // Templates
  var tr=document.querySelector('.mt-tpl-row');
  if(tr)tr.addEventListener('click',function(e){
    var card=e.target.closest('.mt-tpl-card');if(!card)return;
    var tpl=TEMPLATES.filter(function(t){return t.id===card.dataset.tpl;})[0];if(!tpl)return;
    if(lines.length>0&&!confirm('套用「'+tpl.label+'」模板將取代現有所有行，確認？'))return;
    exitPreviewEdit();
    lines=tpl.lines.map(function(l){return Object.assign({},l,{id:nextId++,params:dc(l.params),expanded:false});});
    render();
  });
  // Add line button
  var ab=document.getElementById('mt-addbtn');
  if(ab)ab.addEventListener('click',function(){
    var pw=document.getElementById('mt-picker-wrap');
    if(!pw) return;
    if(pw.dataset.open){delete pw.dataset.open;pw.innerHTML='';pickerCat=null;pickerSearch='';return;}
    pw.dataset.open='1';pickerCat=null;pickerSearch='';pw.innerHTML=pickerHTML();
    bindPickerEvents();
  });
  // Clear all
  var ca=document.getElementById('mt-clearall');
  if(ca)ca.addEventListener('click',function(){
    if(!lines.length)return;if(!confirm('確定清空所有行？'))return;
    exitPreviewEdit();
    lines=[];render();
  });
  // Copy button
  // Split copy buttons: use event delegation — updatePreview() rebuilds sa.innerHTML
  // every time, so direct per-button listeners added in bindLineEvents() are lost.
  // Delegating to the static #mt-split-area container survives all innerHTML rebuilds.
  var splitSa=document.getElementById('mt-split-area');
  if(splitSa)splitSa.addEventListener('click',function(e){
    var btn=e.target.closest('.mt-split-copy');
    if(!btn||!splitData)return;
    var which=btn.dataset.which;
    var out=(which==='1'?splitData.m1:splitData.m2).join('\r\n');
    copyText(out,btn,'複製巨集 '+which);
  });

  var cb=document.getElementById('mt-copybtn');
  if(cb)cb.addEventListener('click',function(){
    var out;
    if(previewEditable){
      var ta=document.getElementById('mt-preview-edit');
      out=ta?ta.value.replace(/\r\n|\r|\n/g,'\r\n'):'';
    } else {
      out=getAllOutput().join('\r\n');
    }
    if(!out.trim()){alert('巨集為空，請先新增內容');return;}
    copyText(out,cb,'複製巨集');
  });
  // Edit toggle
  var etBtn=document.getElementById('mt-edit-toggle');
  if(etBtn)etBtn.addEventListener('click',function(){
    previewEditable=!previewEditable;
    var wrap=document.getElementById('mt-preview-wrap');
    if(!wrap)return;
    if(previewEditable){
      var pre=document.getElementById('mt-preview');
      var content=pre?pre.textContent:'';
      var rect=pre?pre.getBoundingClientRect():{width:0,height:0};
      var w=Math.round(rect.width)||wrap.offsetWidth||0;
      var h=Math.max(Math.round(rect.height),160);
      var ta=document.createElement('textarea');
      ta.id='mt-preview-edit';ta.className='mt-preview-edit';
      ta.value=content;
      ta.style.cssText='height:'+h+'px;width:'+w+'px;max-width:100%;box-sizing:border-box;resize:both;';
      wrap.innerHTML='';wrap.appendChild(ta);
      etBtn.textContent='鎖定預覽';etBtn.classList.add('active');
      ta.focus();
    } else {
      var ta2=document.getElementById('mt-preview-edit');
      var editedContent=ta2?ta2.value:'';
      wrap.innerHTML='<pre class="mt-preview" id="mt-preview"></pre>';
      etBtn.textContent='切換編輯';etBtn.classList.remove('active');
      updatePreview();
      // updatePreview() 會用結構化的 lines 資料重新產生內容，
      // 蓋掉使用者剛才手動編輯的文字；鎖定後應該保留使用者編輯的結果，
      // 所以驗證/分割等副作用跑完後，再把顯示內容換回使用者編輯的版本。
      var pre2=document.getElementById('mt-preview');
      if(pre2) pre2.textContent=editedContent;
    }
  });
  // Pronouns
  document.querySelectorAll('.mt-pro').forEach(function(chip){
    chip.addEventListener('click',function(){
      var s=chip.textContent;
      if(navigator.clipboard)navigator.clipboard.writeText(s).catch(function(){});
      chip.classList.add('copied');setTimeout(function(){chip.classList.remove('copied');},700);
    });
  });
  // Inline pronoun insert
  document.addEventListener('click',function(e){
    var chip=e.target.closest('.inline-pro');
    if(!chip) return;
    var sym=chip.dataset.sym;if(!sym) return;
    var wrap=chip.closest('.msg-inp-wrap');
    var inp=wrap?wrap.querySelector('.msg-inp'):_lastMsgInput;
    if(inp) insertAtCursor(inp,sym);
  });
  document.addEventListener('focusin',function(e){
    if(e.target&&e.target.classList&&e.target.classList.contains('msg-inp'))
      _lastMsgInput=e.target;
  });
}

function updatePickerResults(){
  var results=document.getElementById('mt-picker-results');
  if(results) results.innerHTML=pickerResultsHTML();
  var clearBtn=document.getElementById('mt-picker-search-clear');
  if(clearBtn) clearBtn.style.display=pickerSearch?'':'none';
  bindPickerResultEvents();
}
function bindPickerResultEvents(){
  var results=document.getElementById('mt-picker-results');if(!results)return;
  var backBtn=results.querySelector('.mt-picker-back');
  if(backBtn)backBtn.addEventListener('click',function(){pickerCat=null;updatePickerResults();});
  results.querySelectorAll('.mt-cat-btn').forEach(function(btn){
    btn.addEventListener('click',function(){pickerCat=btn.dataset.cat;updatePickerResults();});
  });
  results.querySelectorAll('.mt-type-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      if(getTotalLines()>=MAX){alert('已達 '+MAX+' 行上限。');return;}
      addLine(btn.dataset.type);
      var pw=document.getElementById('mt-picker-wrap');
      if(pw){delete pw.dataset.open;pw.innerHTML='';}
      pickerCat=null;pickerSearch='';
    });
  });
}
function bindPickerEvents(){
  var pw=document.getElementById('mt-picker-wrap');if(!pw)return;
  var searchInp=pw.querySelector('#mt-picker-search');
  if(searchInp){
    searchInp.addEventListener('input',function(){
      pickerSearch=searchInp.value;
      updatePickerResults();
    });
  }
  var clearBtn=pw.querySelector('#mt-picker-search-clear');
  if(clearBtn){
    clearBtn.addEventListener('click',function(){
      pickerSearch='';
      if(searchInp){searchInp.value='';searchInp.focus();}
      updatePickerResults();
    });
  }
  bindPickerResultEvents();
}

function addLine(type){
  var newId=nextId;
  activeLineId=newId;
  lines.push({id:nextId++,type:type,params:{},note:'',expanded:true,repeat:1});
  render();
  setTimeout(function(){
    var newRow=document.querySelector('.ml-row[data-id="'+newId+'"]');
    if(newRow){
      newRow.classList.add('ml-new');
      newRow.scrollIntoView({behavior:'smooth',block:'nearest'});
      setTimeout(function(){newRow.classList.remove('ml-new');},900);
    }
  },60);
}

function bindLineEvents(){
  var el=document.getElementById('mt-lines');if(!el)return;
  // Toggle expand — only the clicked line becomes active (bright)
  el.querySelectorAll('.ml-head[data-toggle-id]').forEach(function(hdr){
    hdr.addEventListener('click',function(e){
      if(e.target.closest('.ml-del')||e.target.closest('.ml-mv'))return;
      var id=+hdr.dataset.toggleId;
      var line=lines.find(function(l){return l.id===id;});
      if(!line)return;
      line.expanded=!line.expanded;
      activeLineId=line.expanded?id:null;
      renderKeepScroll();
    });
  });
  // Delete
  el.querySelectorAll('.ml-del').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;lines=lines.filter(function(l){return l.id!==id;});render();
    });
  });
  // Move
  el.querySelectorAll('.ml-mv').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id,dir=btn.dataset.dir;
      var idx=-1;lines.forEach(function(l,i){if(l.id===id)idx=i;});if(idx<0)return;
      if(dir==='up'&&idx>0){var t=lines[idx-1];lines[idx-1]=lines[idx];lines[idx]=t;}
      if(dir==='down'&&idx<lines.length-1){var t2=lines[idx+1];lines[idx+1]=lines[idx];lines[idx]=t2;}
      render();
    });
  });
  // Type selector — searchable combobox
  el.querySelectorAll('.ml-type-combo-inp').forEach(function(inp){
    var id=+inp.dataset.id;
    var wrap=inp.closest('.ml-type-combo');
    var dd=wrap?wrap.querySelector('.ml-type-combo-dd'):null;
    if(!dd) return;
    function openDD(query){
      var line=lines.find(function(l){return l.id===id;});
      dd.innerHTML=typeComboDropdownHTML(query,line?line.type:null);
      dd.style.display='block';
    }
    inp.addEventListener('focus',function(){
      inp.dataset.orig=inp.value;
      inp.value='';
      openDD('');
      inp.select();
    });
    inp.addEventListener('input',function(){ openDD(inp.value); });
    inp.addEventListener('blur',function(){
      setTimeout(function(){
        if(!document.body.contains(dd)) return;
        dd.style.display='none';
        inp.value=inp.dataset.orig!==undefined?inp.dataset.orig:inp.value;
      },150);
    });
    dd.addEventListener('mousedown',function(e){
      var item=e.target.closest('.sub-combo-item');
      if(!item) return;
      e.preventDefault();
      var line=lines.find(function(l){return l.id===id;});
      if(!line) return;
      line.type=item.dataset.type;line.params={};render();
    });
  });
  // Text/number inputs
  el.querySelectorAll('.mf-inp').forEach(function(inp){
    inp.addEventListener('input',function(){
      var id=+inp.dataset.id,key=inp.dataset.key;
      var line=lines.find(function(l){return l.id===id;});if(!line||!key)return;
      line.params[key]=inp.value;updateRow(id);updatePreview();
    });
  });
  // Selects
  el.querySelectorAll('.mf-sel').forEach(function(sel){
    sel.addEventListener('change',function(){
      var id=+sel.dataset.id,key=sel.dataset.key;
      var line=lines.find(function(l){return l.id===id;});if(!line||!key)return;
      line.params[key]=sel.value;
      var NR=['target','markTarget','targetParam','motionEmote','miconType','gsAction','gsNumber','waymarkAction','markType','toggle','preMsg_on','postNotify','postEcho','recastNotify','preAnnounce','targetCmd','zone','addMicon','addEcho','sub','alarmSub','spellToggle','mode','callAction','type','effTarget','effType','format','base','clChannel','petName','setType'];
      if(NR.indexOf(key)>=0) render(); else{updateRow(id);updatePreview();}
    });
  });
  // Checkboxes
  el.querySelectorAll('input[type="checkbox"][data-id]').forEach(function(cb){
    cb.addEventListener('change',function(){
      var id=+cb.dataset.id,key=cb.dataset.key;
      var line=lines.find(function(l){return l.id===id;});if(!line||!key)return;
      if(key==='jobs') return; // handled by mf-chk-job handler
      line.params[key]=cb.checked;render();
    });
  });
  // Notes
  el.querySelectorAll('.ml-note').forEach(function(inp){
    inp.addEventListener('input',function(){
      var id=+inp.dataset.id;var line=lines.find(function(l){return l.id===id;});
      if(line)line.note=inp.value;
    });
  });
  // Repeat
  el.querySelectorAll('.ml-repeat-inp').forEach(function(inp){
    inp.addEventListener('input',function(){
      var id=+inp.dataset.id;var line=lines.find(function(l){return l.id===id;});
      if(!line)return;line.repeat=Math.max(1,parseInt(inp.value)||1);updateRow(id);updatePreview();
    });
  });
  // Expand block to individual lines
  el.querySelectorAll('.ml-expand-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;var line=lines.find(function(l){return l.id===id;});
      if(!line)return;
      var cmds=buildLines(line);var idx=-1;lines.forEach(function(l,i){if(l.id===id)idx=i;});
      if(idx<0)return;
      var newLines=cmds.map(function(cmd){return{id:nextId++,type:'custom',params:{text:cmd},note:'',expanded:false,repeat:1};});
      lines.splice.apply(lines,[idx,1].concat(newLines));render();
    });
  });
  // ItemSort specific
  el.querySelectorAll('.is-area-cb').forEach(function(cb){
    cb.addEventListener('change',function(){
      var id=+cb.dataset.id,area=cb.dataset.area;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var arr=line.params.areas||[];
      if(cb.checked){if(arr.indexOf(area)<0)arr.push(area);}else{arr=arr.filter(function(a){return a!==area;});}
      line.params.areas=arr;updateRow(id);updatePreview();
      var lbl=cb.parentNode;if(lbl)lbl.className='is-area-lbl'+(cb.checked?' checked':'');
    });
  });
  el.querySelectorAll('.is-sel-common').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;var line=lines.find(function(l){return l.id===id;});if(!line)return;
      line.params.areas=['inventory','armoury','saddlebag'];render();
    });
  });
  el.querySelectorAll('.is-sel-all').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;var line=lines.find(function(l){return l.id===id;});if(!line)return;
      line.params.areas=IS_AREAS.map(function(a){return a.v;});render();
    });
  });
  el.querySelectorAll('.is-sel-none').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;var line=lines.find(function(l){return l.id===id;});if(!line)return;
      line.params.areas=[];render();
    });
  });
  el.querySelectorAll('.is-crit-sel').forEach(function(sel){
    sel.addEventListener('change',function(){
      var id=+sel.dataset.id,ci=+sel.dataset.ci;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var conds=line.params.conditions||[];if(!conds[ci])return;
      conds[ci].criterion=sel.value;line.params.conditions=conds;render();
    });
  });
  el.querySelectorAll('.is-ord-sel').forEach(function(sel){
    sel.addEventListener('change',function(){
      var id=+sel.dataset.id,ci=+sel.dataset.ci;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var conds=line.params.conditions||[];if(!conds[ci])return;
      conds[ci].order=sel.value;line.params.conditions=conds;updateRow(id);updatePreview();
    });
  });
  el.querySelectorAll('.is-del-cond').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id,ci=+btn.dataset.ci;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      line.params.conditions=(line.params.conditions||[]).filter(function(_,i){return i!==ci;});render();
    });
  });
  el.querySelectorAll('.is-add-cond').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var conds=line.params.conditions||[];conds.push({criterion:'ilv',order:'des'});
      line.params.conditions=conds;render();
    });
  });
  // HUD windows
  el.querySelectorAll('.hud-win-cb').forEach(function(cb){
    cb.addEventListener('change',function(){
      var id=+cb.dataset.id,win=cb.dataset.win;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var arr=line.params.windows||[];
      if(cb.checked){if(arr.indexOf(win)<0)arr.push(win);}else{arr=arr.filter(function(w){return w!==win;});}
      line.params.windows=arr;updateRow(id);updatePreview();
      var lbl=cb.parentNode;if(lbl)lbl.className='is-area-lbl'+(cb.checked?' checked':'');
    });
  });
  // LFP job checkboxes
  el.querySelectorAll('.mf-chk-job').forEach(function(cb){
    cb.addEventListener('change',function(){
      var id=+cb.dataset.id, val=cb.dataset.val;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var arr=(line.params.jobs||[]).slice();
      if(cb.checked){if(arr.indexOf(val)<0)arr.push(val);}
      else{arr=arr.filter(function(v){return v!==val;});}
      line.params.jobs=arr;
      var lbl=cb.closest('.job-chk-lbl');
      if(lbl) lbl.classList.toggle('checked',cb.checked);
      updateRow(id);updatePreview();
    });
  });
  // LFP job select all / none buttons
  el.querySelectorAll('.job-sel-all').forEach(function(btn){
    btn.addEventListener('click',function(){
      var id=+btn.dataset.id;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      line.params.jobs=JOBS.map(function(j){return j.v;});
      render();
    });
  });
  el.querySelectorAll('.job-sel-none').forEach(function(btn){
    btn.addEventListener('click',function(){
      var id=+btn.dataset.id;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      line.params.jobs=[];
      render();
    });
  });
  // ── Chat Countdown Builder (use querySelectorAll - no delegation accumulation) ──
  el.querySelectorAll('.ccd-text').forEach(function(inp){
    inp.addEventListener('input',function(){
      var id=+inp.dataset.id,idx=+inp.dataset.idx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      if(!line.params.msgs)line.params.msgs=[{text:'',wait:0,se:'',channel:''}];
      if(!line.params.msgs[idx])line.params.msgs[idx]={text:'',wait:0,se:'',channel:''};
      line.params.msgs[idx].text=inp.value;updateRow(id);updatePreview();
    });
  });
  el.querySelectorAll('.ccd-wait').forEach(function(inp){
    inp.addEventListener('input',function(){
      var id=+inp.dataset.id,idx=+inp.dataset.idx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      if(!line.params.msgs)line.params.msgs=[{text:'',wait:0,se:'',channel:''}];
      if(!line.params.msgs[idx])line.params.msgs[idx]={text:'',wait:0,se:'',channel:''};
      line.params.msgs[idx].wait=parseFloat(inp.value)||0;updateRow(id);updatePreview();
    });
  });
  el.querySelectorAll('.ccd-se').forEach(function(sel){
    sel.addEventListener('change',function(){
      var id=+sel.dataset.id,idx=+sel.dataset.idx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      if(!line.params.msgs)line.params.msgs=[{text:'',wait:0,se:'',channel:''}];
      if(!line.params.msgs[idx])line.params.msgs[idx]={text:'',wait:0,se:'',channel:''};
      line.params.msgs[idx].se=sel.value;updateRow(id);updatePreview();
    });
  });
  el.querySelectorAll('.ccd-ch').forEach(function(sel){
    sel.addEventListener('change',function(){
      var id=+sel.dataset.id,idx=+sel.dataset.idx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      if(!line.params.msgs)line.params.msgs=[{text:'',wait:0,se:'',channel:''}];
      if(!line.params.msgs[idx])line.params.msgs[idx]={text:'',wait:0,se:'',channel:''};
      line.params.msgs[idx].channel=sel.value;updateRow(id);updatePreview();
    });
  });
  el.querySelectorAll('.ccd-add').forEach(function(btn){
    btn.addEventListener('click',function(){
      var id=+btn.dataset.id;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      if(!line.params.msgs)line.params.msgs=[];
      line.params.msgs.push({text:'',wait:0,se:'',channel:''});render();
    });
  });
  el.querySelectorAll('.ccd-del').forEach(function(btn){
    btn.addEventListener('click',function(){
      var id=+btn.dataset.id,idx=+btn.dataset.idx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      if(!line.params.msgs)return;
      line.params.msgs.splice(idx,1);
      if(!line.params.msgs.length)line.params.msgs=[{text:'',wait:0,se:'',channel:''}];
      render();
    });
  });
  // Ability rotation
  el.querySelectorAll('.ar-skill').forEach(function(inp){
    inp.addEventListener('input',function(){
      var id=+inp.dataset.id,idx=+inp.dataset.arIdx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var skills=line.params.skills||[];skills[idx]=inp.value;line.params.skills=skills;updateRow(id);updatePreview();
    });
  });
  el.querySelectorAll('.ar-del').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id,idx=+btn.dataset.arIdx;
      var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var skills=line.params.skills||[];skills.splice(idx,1);line.params.skills=skills;render();
    });
  });
  el.querySelectorAll('.ar-add').forEach(function(btn){
    btn.addEventListener('click',function(e){e.stopPropagation();
      var id=+btn.dataset.id;var line=lines.find(function(l){return l.id===id;});if(!line)return;
      var skills=line.params.skills||[];skills.push('');line.params.skills=skills;render();
    });
  });
}

function copyText(text,btn,originalLabel){
  // 同步、在使用者手勢內執行的 execCommand 複製法；回傳是否成功。
  // Firefox 對 navigator.clipboard.writeText() 這種非同步 API，
  // 若在 .then/.catch 才執行 execCommand，可能因已脫離「使用者手勢」
  // 情境而悄悄失敗或抓到舊的選取內容 —— 這正是只複製到第一行的成因。
  // 因此這裡改成「先同步試 execCommand，失敗才退回非同步 API」。
  var legacyCopy=function(){
    var ok=false;
    var ta=document.createElement('textarea');
    ta.value=text;
    // 給予實際尺寸並移出畫面：Firefox 對零尺寸或純 opacity:0 的 textarea
    // 呼叫 select() 可能只選中第一行，明確 focus + setSelectionRange 確保全選。
    ta.style.cssText='position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;opacity:0;';
    ta.setAttribute('readonly','');
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0,ta.value.length);
    try{ok=document.execCommand('copy');}catch(e){ok=false;}
    document.body.removeChild(ta);
    return ok;
  };
  var done=function(){
    var o=originalLabel||'複製';
    btn.textContent='✓ 已複製！';btn.classList.add('copied');
    setTimeout(function(){btn.textContent=o;btn.classList.remove('copied');},2000);
  };
  // 先同步嘗試 execCommand（一定在使用者手勢內，最可靠）；
  // 只有它失敗時才退回非同步的 Clipboard API。
  if(legacyCopy()){
    done();
  } else if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(function(){
      alert('複製失敗，請手動選取文字複製');
    });
  } else {
    alert('複製失敗，請手動選取文字複製');
  }
}

/* ════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════ */
var initialized=false;
function init(){
  var root=document.getElementById('macro-root');if(!root)return;
  root.innerHTML=toolHTML();bindRoot();render();
}
function tryInit(){
  var sc=document.getElementById('macro');if(!sc)return;
  if(!initialized&&sc.classList.contains('active')){initialized=true;init();}
}
document.addEventListener('DOMContentLoaded',function(){
  var sc=document.getElementById('macro');if(!sc)return;
  tryInit();new MutationObserver(tryInit).observe(sc,{attributes:true,attributeFilter:['class']});
});
})();
