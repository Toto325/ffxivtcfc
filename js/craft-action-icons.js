/* craft-action-icons.js — 技能圖示網址對照表（遊戲技能ID -> XIVAPI v2 asset URL），本檔案由
 * scripts/update-craft-data.js 自動產生，請勿手動編輯。來源：v2.xivapi.com（官方公開API）。
 * key是getIds()查到的其中一個真實遊戲技能ID，8職業共用同一張圖示，查不到時介面要有預設圖示fallback。
 * 目前是空殼：排程還沒實際跑過一次，需要能連到 v2.xivapi.com 的環境執行
 * scripts/update-craft-data.js 才會抓到真實圖示網址填進來。
 */
const CRAFT_ACTION_ICONS_BY_GAME_ID={};
