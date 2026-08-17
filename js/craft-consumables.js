/* craft-consumables.js — 食藥（食物/藥水）加成計算邏輯
 *
 * 遊戲規則（截圖驗證過的行為）：實際加成 = min(基礎數值 * 加成% , 封頂值)，
 * 例：手速4444、食物「加工+5%(上限76)」→ 4444*5% = 222.2，但封頂只有76，
 * 所以實際只加 76，不是 222。這是很多新手會搞錯的地方，封頂比百分比更常是瓶頸。
 *
 * 食藥資料本身（CRAFT_CONSUMABLES）由另一支資料檔提供，格式：
 * { id, name:{tw,en,...}, type:'meal'|'medicine',
 *   craftsmanship:{percent,cap}, control:{percent,cap}, cp:{percent,cap} }
 * NQ/HQ 是否視為「兩筆不同資料」還是「同一筆兩個檔位」，等資料到位後再決定，
 * 這裡的計算函式兩種資料形狀都能處理（傳對應那組 percent/cap 進來即可）。
 */
(function (global) {
  'use strict';

  /* 套用單一項加成：baseStat 是基礎數值，bonus 是 {percent, cap}，回傳「這一項實際加了多少」 */
  function applyBonus(baseStat, bonus) {
    if (!bonus || (!bonus.percent && !bonus.cap)) return 0;
    var byPercent = Math.floor((baseStat * (bonus.percent || 0)) / 100);
    var cap = bonus.cap != null ? bonus.cap : Infinity;
    return Math.min(byPercent, cap);
  }

  /* 把食物 + 藥水的加成疊加到基礎三圍上，回傳最終數值（給 CrafterStats 建構用） */
  function computeFinalStats(baseStats, meal, medicine) {
    var craftsmanship = baseStats.craftsmanship;
    var control = baseStats.control;
    var cp = baseStats.cp;

    var craftsmanshipBonus = 0, controlBonus = 0, cpBonus = 0;
    [meal, medicine].forEach(function (item) {
      if (!item) return;
      craftsmanshipBonus += applyBonus(craftsmanship, item.craftsmanship);
      controlBonus += applyBonus(control, item.control);
      cpBonus += applyBonus(cp, item.cp);
    });

    return {
      craftsmanship: craftsmanship + craftsmanshipBonus,
      control: control + controlBonus,
      cp: cp + cpBonus,
      breakdown: { craftsmanshipBonus: craftsmanshipBonus, controlBonus: controlBonus, cpBonus: cpBonus },
    };
  }

  global.CraftConsumables = { applyBonus: applyBonus, computeFinalStats: computeFinalStats };
})(typeof self !== 'undefined' ? self : this);
