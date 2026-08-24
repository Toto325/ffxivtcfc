/* craft-action-effects.js — 技能CP消耗與效果說明對照表
 * 資料來源：FFXIV繁體中文版官方網站「能工巧匠・大地使者指南」木工師頁面（使用者提供的官方頁面存檔），
 * 手動整理，不是XIVAPI抓的，所以不會被 update-craft-data.js 那個自動更新流程覆蓋，也不會自動跟著版更。
 * category: progress=推進度／quality=推品質／buff=耐久CP等資源管理／special=特殊或一次性技能
 * cp/effect為null代表官方指南頁面沒有這個技能（目前只有宇宙探索專用的奇蹟之材/宇宙穩手兩個）。 */
const CRAFT_ACTION_EFFECTS = {
  "BasicSynthesis": {
    "cp": 0,
    "effect": "消耗耐久以推動作業進展\n效率：120\n成功率：100%",
    "category": "progress"
  },
  "CarefulSynthesis": {
    "cp": 7,
    "effect": "消耗耐久以推動作業進展\n效率：180\n成功率：100%",
    "category": "progress"
  },
  "PrudentSynthesis": {
    "cp": 18,
    "effect": "在儉約和長期儉約狀態下無法使用\n耐久度消耗量減半的同時推動作業進展\n效率：180\n成功率：100%",
    "category": "progress"
  },
  "RapidSynthesis": {
    "cp": 0,
    "effect": "消耗耐久以推動作業進展\n效率：500\n成功率：50%",
    "category": "progress"
  },
  "Groundwork": {
    "cp": 18,
    "effect": "大量消耗耐久以推動作業進展\n在剩餘耐久不足的情況下使用時，效率會減半\n效率：360\n成功率：100%\n耐久消耗：20",
    "category": "progress"
  },
  "MuscleMemory": {
    "cp": 6,
    "effect": "僅可在首次作業時發動\n消耗耐久以推動作業進展\n追加效果：令下一次使用的製作系技能效果提升100%，5次作業內有效\n效率：300\n成功率：100%",
    "category": "progress"
  },
  "IntensiveSynthesis": {
    "cp": 6,
    "effect": "只有在「高品質」或以上的狀態下才能使用\n消耗耐久以使作業大幅進展\n效率：400\n成功率：100%",
    "category": "progress"
  },
  "BasicTouch": {
    "cp": 18,
    "effect": "消耗耐久以提高製品品質\n效率：100\n成功率：100%",
    "category": "quality"
  },
  "StandardTouch": {
    "cp": 32,
    "effect": "消耗耐久以提高製品品質\n效率：125\n成功率：100%\n連擊條件：加工連擊中消耗CP：18",
    "category": "quality"
  },
  "AdvancedTouch": {
    "cp": 46,
    "effect": "消耗耐久以提高製品品質\n效率：150\n成功率：100%\n連擊條件：中級加工或觀察\n連擊中消耗CP：18",
    "category": "quality"
  },
  "HastyTouch": {
    "cp": 0,
    "effect": "消耗耐久以提高製品品質\n不會消耗CP，但是成功率比較低\n效率：100\n成功率：60%\n追加效果：工匠的良機\n持續時間：一次作業",
    "category": "quality"
  },
  "DaringTouch": {
    "cp": 0,
    "effect": "消耗耐久以提高製品品質\n不會消耗CP，但是成功率比較低\n效率：150\n成功率：60%\n使用條件：工匠的良機狀態中\n※該技能無法設置到快速鍵",
    "category": "quality"
  },
  "ByregotsBlessing": {
    "cp": 24,
    "effect": "只有在內靜的階數大於1時才可以使用\n消耗耐久以提高製品品質\n隨內靜的效果提高效率，內靜每上升1階效率提升20\n使用之後會結束內靜效果\n效率：100 (最大300)\n成功率：100%",
    "category": "quality"
  },
  "PreciseTouch": {
    "cp": 18,
    "effect": "只有在「高品質」或以上的狀態下才能使用\n消耗耐久以提高製品品質\n追加效果：內靜的累積階數+1（最多累積10階）\n效率：150\n成功率：100%",
    "category": "quality"
  },
  "PrudentTouch": {
    "cp": 25,
    "effect": "在儉約和長期儉約狀態下無法使用\n耐久度消耗量減半的同時提高製品品質\n效率：100\n成功率：100%",
    "category": "quality"
  },
  "TrainedEye": {
    "cp": 250,
    "effect": "僅可在首次作業且用於等級低了10級及以上的配方時發動\n可提升製品最大品質的100%\n成功率：100%\n無法在高難度配方中使用",
    "category": "quality"
  },
  "PreparatoryTouch": {
    "cp": 40,
    "effect": "大量消耗耐久以提高製品品質\n追加效果：內靜的累積階數+1（最多累積10階）\n效率：200\n成功率：100%\n耐久消耗：20",
    "category": "quality"
  },
  "Reflect": {
    "cp": 6,
    "effect": "僅可在首次作業時發動\n消耗耐久以提高製品品質\n追加效果：內靜的累積階數+1（最多累積10階）\n效率：300\n成功率：100%",
    "category": "quality"
  },
  "TrainedFinesse": {
    "cp": 32,
    "effect": "只有內靜的階數為10時才可以使用\n不消耗耐久，提高製品品質\n效率：100\n成功率：100%",
    "category": "quality"
  },
  "RefinedTouch": {
    "cp": 24,
    "effect": "消耗耐久以提高製品品質\n效率：100\n成功率：100%\n連擊條件：加工\n連擊效果：內靜的累積階數+1（最多累積10階）",
    "category": "quality"
  },
  "TrainedPerfection": {
    "cp": 0,
    "effect": "令下一次作業不消耗耐久\n一次製作或練習最多可使用1次",
    "category": "buff"
  },
  "TricksOfTheTrade": {
    "cp": 0,
    "effect": "只有在「高品質」或以上的狀態下才能使用\n恢復20點CP",
    "category": "buff"
  },
  "MastersMend": {
    "cp": 88,
    "effect": "恢復30點耐久",
    "category": "buff"
  },
  "Manipulation": {
    "cp": 96,
    "effect": "每次作業結束時恢復5點耐久，8次作業內有效",
    "category": "buff"
  },
  "ImmaculateMend": {
    "cp": 112,
    "effect": "恢復全部耐久",
    "category": "buff"
  },
  "WasteNot": {
    "cp": 56,
    "effect": "耐久度的消耗量減少50%，4次作業內有效",
    "category": "buff"
  },
  "WasteNotII": {
    "cp": 98,
    "effect": "耐久度的消耗量減少50%，8次作業內有效",
    "category": "buff"
  },
  "GreatStrides": {
    "cp": 32,
    "effect": "令下一次使用的加工系技能效果提升100%，3次作業內有效",
    "category": "buff"
  },
  "Innovation": {
    "cp": 18,
    "effect": "提升品質的技能效率提高50%，4次作業內有效",
    "category": "buff"
  },
  "Veneration": {
    "cp": 18,
    "effect": "推動作業進展的技能效率提高50%，4次作業內有效",
    "category": "buff"
  },
  "FinalAppraisal": {
    "cp": 1,
    "effect": "執行可令物品製作完成的技能時，讓進展在差一點就完成製作的位置停下來1次，5次作業內有效\n使用本技能不會消耗作業次數",
    "category": "special"
  },
  "QuickInnovation": {
    "cp": 0,
    "effect": "專家專用技能\n改革狀態下無法使用\n為自身附加改革狀態\n持續時間：一次作業\n使用時需消耗道具「能工巧匠圖紙」\n使用本技能不會消耗一次作業時間\n一次製作或練習最多可使用1次",
    "category": "special"
  },
  "Observe": {
    "cp": 7,
    "effect": "放空一次作業，不做任何事",
    "category": "special"
  },
  "HeartAndSoul": {
    "cp": 0,
    "effect": "專家專用技能\n專心致志效果發動後，可在非「高品質」或「最高品質」狀態下使用技能集中加工、集中製作或秘訣\n使用技能集中加工、集中製作或秘訣後，專心致志效果結束\n使用時需消耗道具「能工巧匠圖紙」\n使用本技能不會消耗一次作業時間\n一次製作或練習最多可使用1次",
    "category": "special"
  },
  "CarefulObservation": {
    "cp": 0,
    "effect": "專家專用技能\n變更一次作業狀態\n使用時需消耗道具「能工巧匠圖紙」\n使用本技能不會消耗一次作業時間\n一次製作或練習最多可使用3次",
    "category": "special"
  },
  "DelicateSynthesis": {
    "cp": 32,
    "effect": "消耗耐久以推動作業進展，同時提高品質\n製作效率：150\n加工效率：100\n成功率：100%",
    "category": "progress"
  },
  "MaterialMiracle": {
    "cp": null,
    "effect": null,
    "category": "special"
  },
  "StellarSteadyHand": {
    "cp": null,
    "effect": null,
    "category": "special"
  }
};
