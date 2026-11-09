(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (factory((global.simulator = {})));
}(this, (function (exports) { 'use strict';

  (function (Buff) {
      Buff[Buff["INNER_QUIET"] = 0] = "INNER_QUIET";
      Buff[Buff["WASTE_NOT"] = 1] = "WASTE_NOT";
      Buff[Buff["WASTE_NOT_II"] = 2] = "WASTE_NOT_II";
      Buff[Buff["MANIPULATION"] = 3] = "MANIPULATION";
      Buff[Buff["GREAT_STRIDES"] = 4] = "GREAT_STRIDES";
      Buff[Buff["INNOVATION"] = 5] = "INNOVATION";
      Buff[Buff["VENERATION"] = 6] = "VENERATION";
      Buff[Buff["MAKERS_MARK"] = 7] = "MAKERS_MARK";
      Buff[Buff["MUSCLE_MEMORY"] = 8] = "MUSCLE_MEMORY";
      Buff[Buff["FINAL_APPRAISAL"] = 9] = "FINAL_APPRAISAL";
      Buff[Buff["HEART_AND_SOUL"] = 10] = "HEART_AND_SOUL";
      Buff[Buff["EXPEDIENCE"] = 11] = "EXPEDIENCE";
      Buff[Buff["TRAINED_PERFECTION"] = 12] = "TRAINED_PERFECTION";
      Buff[Buff["STELLAR_STEADY_HAND"] = 13] = "STELLAR_STEADY_HAND";
  })(exports.Buff || (exports.Buff = {}));

  var CrafterStats = /** @class */ (function () {
      function CrafterStats(jobId, craftsmanship, _control, cp, specialist, relicTool, level, levels) {
          this.jobId = jobId;
          this.craftsmanship = craftsmanship;
          this._control = _control;
          this.cp = cp;
          this.specialist = specialist;
          this.relicTool = relicTool;
          this.level = level;
          this.levels = levels;
      }
      CrafterStats.prototype.getControl = function (simulationState) {
          return this._control;
      };
      return CrafterStats;
  }());

  /*! *****************************************************************************
  Copyright (c) Microsoft Corporation. All rights reserved.
  Licensed under the Apache License, Version 2.0 (the "License"); you may not use
  this file except in compliance with the License. You may obtain a copy of the
  License at http://www.apache.org/licenses/LICENSE-2.0

  THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
  WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
  MERCHANTABLITY OR NON-INFRINGEMENT.

  See the Apache Version 2.0 License for specific language governing permissions
  and limitations under the License.
  ***************************************************************************** */
  /* global Reflect, Promise */

  var extendStatics = function(d, b) {
      extendStatics = Object.setPrototypeOf ||
          ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
          function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
      return extendStatics(d, b);
  };

  function __extends(d, b) {
      extendStatics(d, b);
      function __() { this.constructor = d; }
      d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
  }

  var __assign = function() {
      __assign = Object.assign || function __assign(t) {
          for (var s, i = 1, n = arguments.length; i < n; i++) {
              s = arguments[i];
              for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
          }
          return t;
      };
      return __assign.apply(this, arguments);
  };

  (function (ActionType) {
      ActionType[ActionType["PROGRESSION"] = 0] = "PROGRESSION";
      ActionType[ActionType["QUALITY"] = 1] = "QUALITY";
      ActionType[ActionType["CP_RECOVERY"] = 2] = "CP_RECOVERY";
      ActionType[ActionType["BUFF"] = 3] = "BUFF";
      ActionType[ActionType["SPECIALTY"] = 4] = "SPECIALTY";
      ActionType[ActionType["REPAIR"] = 5] = "REPAIR";
      ActionType[ActionType["OTHER"] = 6] = "OTHER";
  })(exports.ActionType || (exports.ActionType = {}));

  (function (CraftingJob) {
      CraftingJob[CraftingJob["ANY"] = -1] = "ANY";
      CraftingJob[CraftingJob["CRP"] = 0] = "CRP";
      CraftingJob[CraftingJob["BSM"] = 1] = "BSM";
      CraftingJob[CraftingJob["ARM"] = 2] = "ARM";
      CraftingJob[CraftingJob["GSM"] = 3] = "GSM";
      CraftingJob[CraftingJob["LTW"] = 4] = "LTW";
      CraftingJob[CraftingJob["WVR"] = 5] = "WVR";
      CraftingJob[CraftingJob["ALC"] = 6] = "ALC";
      CraftingJob[CraftingJob["CUL"] = 7] = "CUL";
  })(exports.CraftingJob || (exports.CraftingJob = {}));

  (function (SimulationFailCause) {
      // Only used for safe mode, this is for when safe mode is enabled and action success rate is <100 at this moment.
      SimulationFailCause[SimulationFailCause["UNSAFE_ACTION"] = 0] = "UNSAFE_ACTION";
      SimulationFailCause[SimulationFailCause["DURABILITY_REACHED_ZERO"] = 1] = "DURABILITY_REACHED_ZERO";
      SimulationFailCause[SimulationFailCause["NOT_ENOUGH_CP"] = 2] = "NOT_ENOUGH_CP";
      SimulationFailCause[SimulationFailCause["MISSING_LEVEL_REQUIREMENT"] = 3] = "MISSING_LEVEL_REQUIREMENT";
      SimulationFailCause[SimulationFailCause["MISSING_STATS_REQUIREMENT"] = 4] = "MISSING_STATS_REQUIREMENT";
      SimulationFailCause[SimulationFailCause["NOT_SPECIALIST"] = 5] = "NOT_SPECIALIST";
      SimulationFailCause[SimulationFailCause["NO_INNER_QUIET"] = 6] = "NO_INNER_QUIET";
      SimulationFailCause[SimulationFailCause["QUALITY_TOO_LOW"] = 7] = "QUALITY_TOO_LOW";
  })(exports.SimulationFailCause || (exports.SimulationFailCause = {}));

  (function (StepState) {
      StepState[StepState["NONE"] = 0] = "NONE";
      StepState[StepState["NORMAL"] = 1] = "NORMAL";
      StepState[StepState["GOOD"] = 2] = "GOOD";
      StepState[StepState["EXCELLENT"] = 3] = "EXCELLENT";
      StepState[StepState["POOR"] = 4] = "POOR";
      // Only for expert recipes
      StepState[StepState["CENTERED"] = 5] = "CENTERED";
      StepState[StepState["STURDY"] = 6] = "STURDY";
      StepState[StepState["PLIANT"] = 7] = "PLIANT";
      // Only for super expert recipes
      StepState[StepState["MALLEABLE"] = 8] = "MALLEABLE";
      StepState[StepState["PRIMED"] = 9] = "PRIMED";
      StepState[StepState["GOOD_OMEN"] = 10] = "GOOD_OMEN";
      StepState[StepState["ROBUST"] = 11] = "ROBUST";
  })(exports.StepState || (exports.StepState = {}));

  var Tables = /** @class */ (function () {
      function Tables() {
      }
      Tables.HQ_TABLE = [
          1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8,
          9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12, 13, 13, 13, 14, 14, 14, 15, 15, 15, 16, 16, 17, 17,
          17, 18, 18, 18, 19, 19, 20, 20, 21, 22, 23, 24, 26, 28, 31, 34, 38, 42, 47, 52, 58, 64, 68, 71,
          74, 76, 78, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 94, 96, 98, 100,
      ];
      Tables.LEVEL_TABLE = {
          51: 120,
          52: 125,
          53: 130,
          54: 133,
          55: 136,
          56: 139,
          57: 142,
          58: 145,
          59: 148,
          60: 150,
          61: 260,
          62: 265,
          63: 270,
          64: 273,
          65: 276,
          66: 279,
          67: 282,
          68: 285,
          69: 288,
          70: 290,
          71: 390,
          72: 395,
          73: 400,
          74: 403,
          75: 406,
          76: 409,
          77: 412,
          78: 415,
          79: 418,
          80: 420,
          81: 517,
          82: 520,
          83: 525,
          84: 530,
          85: 535,
          86: 540,
          87: 545,
          88: 550,
          89: 555,
          90: 560,
          91: 650,
          92: 653,
          93: 656,
          94: 660,
          95: 665,
          96: 670,
          97: 675,
          98: 680,
          99: 685,
          100: 690,
      };
      return Tables;
  }());

  /**
   * This is the parent class of all actions in the simulator.
   */
  var CraftingAction = /** @class */ (function () {
      function CraftingAction() {
      }
      /**
       * checks if the action can be moved inside the simulation state,
       * this is meant to prevent moving automatic actions (looking at you Whistle end progression tick).
       * @returns {boolean}
       */
      CraftingAction.prototype.canBeMoved = function (currentIndex) {
          return true;
      };
      CraftingAction.prototype.getId = function (jobId) {
          // Crafter ids are 8 to 15, we want indexes from 0 to 7, so...
          return this.getIds()[jobId - 8] || this.getIds()[0];
      };
      CraftingAction.prototype.getWaitDuration = function () {
          return this.getType() === exports.ActionType.BUFF ? 2 : 3;
      };
      /**
       * If an action is skipped on fail, it doesn't tick buffs.
       * Example: Observe, Master's Mend, buffs.
       */
      CraftingAction.prototype.skipOnFail = function () {
          return false;
      };
      CraftingAction.prototype.requiresGood = function () {
          return false;
      };
      CraftingAction.prototype.hasCombo = function (simulation) {
          return false;
      };
      CraftingAction.prototype.getSuccessRate = function (simulationState) {
          var baseRate = this._getSuccessRate(simulationState);
          if (simulationState.state === exports.StepState.CENTERED) {
              return baseRate + 25;
          }
          return baseRate;
      };
      CraftingAction.prototype.canBeUsed = function (simulationState, linear, safeMode) {
          var levelRequirement = this.getLevelRequirement();
          var craftsmanshipRequirement = simulationState.recipe.craftsmanshipReq;
          var controlRequirement = simulationState.recipe.controlReq;
          if (safeMode && this.getSuccessRate(simulationState) < 100) {
              return false;
          }
          if (levelRequirement.job !== exports.CraftingJob.ANY &&
              simulationState.crafterStats.levels[levelRequirement.job] !== undefined) {
              return (simulationState.crafterStats.levels[levelRequirement.job] >= levelRequirement.level &&
                  this._canBeUsed(simulationState, linear));
          }
          if (craftsmanshipRequirement && controlRequirement) {
              return (simulationState.crafterStats.craftsmanship >= craftsmanshipRequirement &&
                  simulationState.crafterStats._control >= controlRequirement &&
                  simulationState.crafterStats.level >= levelRequirement.level &&
                  this._canBeUsed(simulationState, linear));
          }
          if (craftsmanshipRequirement) {
              return (simulationState.crafterStats.craftsmanship >= craftsmanshipRequirement &&
                  simulationState.crafterStats.level >= levelRequirement.level &&
                  this._canBeUsed(simulationState, linear));
          }
          if (controlRequirement) {
              return (simulationState.crafterStats._control >= controlRequirement &&
                  simulationState.crafterStats.level >= levelRequirement.level &&
                  this._canBeUsed(simulationState, linear));
          }
          return (simulationState.crafterStats.level >= levelRequirement.level &&
              this._canBeUsed(simulationState, linear));
      };
      CraftingAction.prototype.getFailCause = function (simulationState, linear, safeMode) {
          if (simulationState.success) {
              return undefined;
          }
          var levelRequirement = this.getLevelRequirement();
          var craftsmanshipRequirement = simulationState.recipe.craftsmanshipReq;
          var controlRequirement = simulationState.recipe.controlReq;
          if (safeMode && this.getSuccessRate(simulationState) < 100) {
              return exports.SimulationFailCause.UNSAFE_ACTION;
          }
          if (levelRequirement.job !== exports.CraftingJob.ANY &&
              simulationState.crafterStats.levels[levelRequirement.job] !== undefined) {
              if (simulationState.crafterStats.levels[levelRequirement.job] < levelRequirement.level) {
                  return exports.SimulationFailCause.MISSING_LEVEL_REQUIREMENT;
              }
          }
          if (simulationState.crafterStats.level < levelRequirement.level) {
              return exports.SimulationFailCause.MISSING_LEVEL_REQUIREMENT;
          }
          if (craftsmanshipRequirement &&
              simulationState.crafterStats.craftsmanship < craftsmanshipRequirement) {
              return exports.SimulationFailCause.MISSING_STATS_REQUIREMENT;
          }
          if (controlRequirement && simulationState.crafterStats._control < controlRequirement) {
              return exports.SimulationFailCause.MISSING_STATS_REQUIREMENT;
          }
          return undefined;
      };
      CraftingAction.prototype.getCPCost = function (simulationState, linear) {
          if (linear === void 0) { linear = false; }
          var baseCost = this.getBaseCPCost(simulationState);
          if (simulationState.state === exports.StepState.PLIANT) {
              return Math.ceil(baseCost / 2);
          }
          return baseCost;
      };
      CraftingAction.prototype.onFail = function (simulation) {
          // Base onFail does nothing, override to implement it, as it wont be used in most cases.
      };
      CraftingAction.prototype.skipsBuffTicks = function () {
          return false;
      };
      /**
       * Checks if this action is an instance of a given other action.
       * @param actionClass
       */
      CraftingAction.prototype.is = function (actionClass) {
          return this instanceof actionClass;
      };
      CraftingAction.prototype.getBaseProgression = function (simulation) {
          var stats = simulation.crafterStats;
          var baseValue = (stats.craftsmanship * 10) / simulation.recipe.progressDivider + 2;
          if (Tables.LEVEL_TABLE[stats.level] <= simulation.recipe.rlvl) {
              return Math.fround(baseValue * (simulation.recipe.progressModifier || 100) * Math.fround(0.01));
          }
          return Math.floor(baseValue);
      };
      CraftingAction.prototype.getBaseQuality = function (simulation) {
          var stats = simulation.crafterStats;
          var baseValue = (stats.getControl(simulation) * 10) / simulation.recipe.qualityDivider + 35;
          if (Tables.LEVEL_TABLE[stats.level] <= simulation.recipe.rlvl) {
              return Math.fround(baseValue * (simulation.recipe.qualityModifier || 100) * Math.fround(0.01));
          }
          return Math.floor(baseValue);
      };
      return CraftingAction;
  }());

  /**
   * This is for every progress and quality actions
   */
  var GeneralAction = /** @class */ (function (_super) {
      __extends(GeneralAction, _super);
      function GeneralAction() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      GeneralAction.prototype.getDurabilityCost = function (simulationState) {
          var divider = 1;
          if (simulationState.hasBuff(exports.Buff.WASTE_NOT) || simulationState.hasBuff(exports.Buff.WASTE_NOT_II)) {
              divider *= 2;
          }
          if (simulationState.state === exports.StepState.STURDY || simulationState.state === exports.StepState.ROBUST) {
              divider *= 2;
          }
          return Math.ceil(this.getBaseDurabilityCost(simulationState) / divider);
      };
      GeneralAction.prototype._getSuccessRate = function (simulationState) {
          if (simulationState.hasBuff(exports.Buff.STELLAR_STEADY_HAND)) {
              return 100;
          }
          return this.getBaseSuccessRate(simulationState);
      };
      GeneralAction.prototype.getBaseBonus = function (simulation) {
          return 1;
      };
      GeneralAction.prototype.getBaseCondition = function (simulation) {
          return 1;
      };
      return GeneralAction;
  }(CraftingAction));

  var ProgressAction = /** @class */ (function (_super) {
      __extends(ProgressAction, _super);
      function ProgressAction() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      ProgressAction.prototype.getType = function () {
          return exports.ActionType.PROGRESSION;
      };
      ProgressAction.prototype.execute = function (simulation) {
          var buffMod = this.getBaseBonus(simulation);
          var conditionMod = this.getBaseCondition(simulation);
          var potency = this.getPotency(simulation);
          var progressionIncrease = Math.floor(this.getBaseProgression(simulation));
          switch (simulation.state) {
              case exports.StepState.MALLEABLE:
                  conditionMod *= 1.5;
                  break;
              default:
                  break;
          }
          if (simulation.hasBuff(exports.Buff.MUSCLE_MEMORY)) {
              buffMod += 1;
              simulation.removeBuff(exports.Buff.MUSCLE_MEMORY);
          }
          if (simulation.hasBuff(exports.Buff.VENERATION)) {
              buffMod += 0.5;
          }
          var efficiency = potency * buffMod;
          simulation.progression += Math.floor((progressionIncrease * conditionMod * efficiency) / 100);
          if (simulation.hasBuff(exports.Buff.FINAL_APPRAISAL) &&
              simulation.progression >= simulation.recipe.progress) {
              simulation.progression = Math.min(simulation.progression, simulation.recipe.progress - 1);
              simulation.removeBuff(exports.Buff.FINAL_APPRAISAL);
          }
      };
      return ProgressAction;
  }(GeneralAction));

  var BasicSynthesis = /** @class */ (function (_super) {
      __extends(BasicSynthesis, _super);
      function BasicSynthesis() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      BasicSynthesis.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 1 };
      };
      BasicSynthesis.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      BasicSynthesis.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      BasicSynthesis.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      BasicSynthesis.prototype.getBaseCPCost = function (simulationState) {
          return 0;
      };
      BasicSynthesis.prototype.getIds = function () {
          return [100001, 100015, 100030, 100075, 100045, 100060, 100090, 100105];
      };
      BasicSynthesis.prototype.getPotency = function (simulation) {
          if (simulation.crafterStats.level >= 31) {
              // Basic Synthesis Mastery
              return 120;
          }
          return 100;
      };
      return BasicSynthesis;
  }(ProgressAction));

  var CarefulSynthesis = /** @class */ (function (_super) {
      __extends(CarefulSynthesis, _super);
      function CarefulSynthesis() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      CarefulSynthesis.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 62 };
      };
      CarefulSynthesis.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      CarefulSynthesis.prototype.getBaseCPCost = function (simulationState) {
          return 7;
      };
      CarefulSynthesis.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      CarefulSynthesis.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      CarefulSynthesis.prototype.getIds = function () {
          return [100203, 100204, 100205, 100206, 100207, 100208, 100209, 100210];
      };
      CarefulSynthesis.prototype.getPotency = function (simulation) {
          return simulation.crafterStats.level >= 82 ? 180 : 150;
      };
      return CarefulSynthesis;
  }(ProgressAction));

  var RapidSynthesis = /** @class */ (function (_super) {
      __extends(RapidSynthesis, _super);
      function RapidSynthesis() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      RapidSynthesis.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 9 };
      };
      RapidSynthesis.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      RapidSynthesis.prototype.getBaseCPCost = function (simulationState) {
          return 0;
      };
      RapidSynthesis.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      RapidSynthesis.prototype.getBaseSuccessRate = function (simulationState) {
          return 50;
      };
      RapidSynthesis.prototype.getIds = function () {
          return [100363, 100364, 100365, 100366, 100367, 100368, 100369, 100370];
      };
      RapidSynthesis.prototype.getPotency = function (simulation) {
          if (simulation.crafterStats.level >= 63) {
              // Rapid Synthesis Mastery
              return 500;
          }
          return 250;
      };
      return RapidSynthesis;
  }(ProgressAction));

  var Groundwork = /** @class */ (function (_super) {
      __extends(Groundwork, _super);
      function Groundwork() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      Groundwork.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 72 };
      };
      Groundwork.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      Groundwork.prototype.getBaseCPCost = function (simulationState) {
          return 18;
      };
      Groundwork.prototype.getBaseDurabilityCost = function (simulationState) {
          return 20;
      };
      Groundwork.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      Groundwork.prototype.getIds = function () {
          return [100403, 100404, 100405, 100406, 100407, 100408, 100409, 100410];
      };
      Groundwork.prototype.getPotency = function (simulation) {
          var basePotency = simulation.crafterStats.level >= 86 ? 360 : 300;
          if (simulation.hasBuff(exports.Buff.TRAINED_PERFECTION) ||
              simulation.durability >= this.getDurabilityCost(simulation)) {
              return basePotency;
          }
          return basePotency / 2;
      };
      return Groundwork;
  }(ProgressAction));

  /**
   * MuMe is just piece by piece with a different condition, cost and success rate.
   */
  var MuscleMemory = /** @class */ (function (_super) {
      __extends(MuscleMemory, _super);
      function MuscleMemory() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MuscleMemory.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 54 };
      };
      MuscleMemory.prototype.getType = function () {
          return exports.ActionType.PROGRESSION;
      };
      MuscleMemory.prototype.execute = function (simulation) {
          _super.prototype.execute.call(this, simulation);
          simulation.buffs.push({
              duration: simulation.state === exports.StepState.PRIMED ? 7 : 5,
              stacks: 0,
              buff: exports.Buff.MUSCLE_MEMORY,
              appliedStep: simulation.steps.length,
          });
      };
      MuscleMemory.prototype._canBeUsed = function (simulation) {
          return simulation.steps.filter(function (step) { return !step.action.skipsBuffTicks(); }).length === 0;
      };
      MuscleMemory.prototype.canBeMoved = function (currentIndex) {
          return currentIndex > 0;
      };
      MuscleMemory.prototype.getBaseCPCost = function (simulation) {
          return 6;
      };
      MuscleMemory.prototype.getIds = function () {
          return [100379, 100380, 100381, 100382, 100383, 100384, 100385, 100386];
      };
      MuscleMemory.prototype.getDurabilityCost = function (simulationState) {
          return 10;
      };
      MuscleMemory.prototype._getSuccessRate = function (simulationState) {
          return 100;
      };
      MuscleMemory.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      MuscleMemory.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      MuscleMemory.prototype.getPotency = function (simulation) {
          return 300;
      };
      return MuscleMemory;
  }(ProgressAction));

  var QualityAction = /** @class */ (function (_super) {
      __extends(QualityAction, _super);
      function QualityAction() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      QualityAction.prototype.getType = function () {
          return exports.ActionType.QUALITY;
      };
      QualityAction.prototype.execute = function (simulation, safe, skipStackAddition) {
          var _a;
          if (safe === void 0) { safe = false; }
          if (skipStackAddition === void 0) { skipStackAddition = false; }
          var buffMod = this.getBaseBonus(simulation);
          var conditionMod = this.getBaseCondition(simulation);
          var potency = this.getPotency(simulation);
          var qualityIncrease = Math.floor(this.getBaseQuality(simulation));
          switch (simulation.state) {
              case exports.StepState.EXCELLENT:
                  conditionMod *= 4;
                  break;
              case exports.StepState.POOR:
                  conditionMod *= 0.5;
                  break;
              case exports.StepState.GOOD:
                  conditionMod *= simulation.crafterStats.relicTool ? 1.75 : 1.5;
                  break;
              default:
                  break;
          }
          var iqMod = ((_a = simulation.getBuff(exports.Buff.INNER_QUIET)) === null || _a === void 0 ? void 0 : _a.stacks) || 0;
          var buffMult = 1;
          if (simulation.hasBuff(exports.Buff.GREAT_STRIDES)) {
              buffMult += 1;
              simulation.removeBuff(exports.Buff.GREAT_STRIDES);
          }
          if (simulation.hasBuff(exports.Buff.INNOVATION)) {
              buffMult += 0.5;
          }
          buffMod = (buffMod * buffMult * (100 + iqMod * 10)) / 100;
          var efficiency = Math.fround(potency * buffMod);
          simulation.quality += Math.floor((qualityIncrease * conditionMod * efficiency) / 100);
          if (!skipStackAddition && simulation.crafterStats.level >= 11) {
              simulation.addInnerQuietStacks(1);
          }
      };
      return QualityAction;
  }(GeneralAction));

  var BasicTouch = /** @class */ (function (_super) {
      __extends(BasicTouch, _super);
      function BasicTouch() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      BasicTouch.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 5 };
      };
      BasicTouch.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      BasicTouch.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      BasicTouch.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      BasicTouch.prototype.getBaseCPCost = function (simulationState) {
          return 18;
      };
      BasicTouch.prototype.getIds = function () {
          return [100002, 100016, 100031, 100076, 100046, 100061, 100091, 100106];
      };
      BasicTouch.prototype.getPotency = function (simulation) {
          return 100;
      };
      return BasicTouch;
  }(QualityAction));

  var StandardTouch = /** @class */ (function (_super) {
      __extends(StandardTouch, _super);
      function StandardTouch() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      StandardTouch.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 18 };
      };
      StandardTouch.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      StandardTouch.prototype.hasCombo = function (simulation) {
          return simulation.hasComboAvailable(new BasicTouch().getIds()[0]);
      };
      StandardTouch.prototype.getBaseCPCost = function (simulationState) {
          return simulationState.hasComboAvailable(new BasicTouch().getIds()[0]) ? 18 : 32;
      };
      StandardTouch.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      StandardTouch.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      StandardTouch.prototype.getIds = function () {
          return [100004, 100018, 100034, 100078, 100048, 100064, 100093, 100109];
      };
      StandardTouch.prototype.getPotency = function (simulation) {
          return 125;
      };
      return StandardTouch;
  }(QualityAction));

  var HastyTouch = /** @class */ (function (_super) {
      __extends(HastyTouch, _super);
      function HastyTouch() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      HastyTouch.prototype.execute = function (simulation, safe, skipStackAddition) {
          if (safe === void 0) { safe = false; }
          if (skipStackAddition === void 0) { skipStackAddition = false; }
          _super.prototype.execute.call(this, simulation, safe, skipStackAddition);
          if (simulation.crafterStats.level >= 96) {
              simulation.buffs.push({
                  duration: 1,
                  buff: exports.Buff.EXPEDIENCE,
                  stacks: 1,
                  appliedStep: simulation.steps.length,
              });
          }
      };
      HastyTouch.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 9 };
      };
      HastyTouch.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      HastyTouch.prototype.getBaseCPCost = function (simulationState) {
          return 0;
      };
      HastyTouch.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      HastyTouch.prototype.getBaseSuccessRate = function (simulationState) {
          return 60;
      };
      HastyTouch.prototype.getIds = function () {
          return [100355, 100356, 100357, 100358, 100359, 100360, 100361, 100362];
      };
      HastyTouch.prototype.getPotency = function (simulation) {
          return 100;
      };
      return HastyTouch;
  }(QualityAction));

  var ByregotsBlessing = /** @class */ (function (_super) {
      __extends(ByregotsBlessing, _super);
      function ByregotsBlessing() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      ByregotsBlessing.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 50 };
      };
      ByregotsBlessing.prototype._canBeUsed = function (simulationState) {
          return (simulationState.hasBuff(exports.Buff.INNER_QUIET) &&
              simulationState.getBuff(exports.Buff.INNER_QUIET).stacks > 0);
      };
      ByregotsBlessing.prototype.getFailCause = function (simulationState, linear, safeMode) {
          var superCause = _super.prototype.getFailCause.call(this, simulationState, linear, safeMode);
          if (!simulationState.success && !superCause && !simulationState.hasBuff(exports.Buff.INNER_QUIET)) {
              return exports.SimulationFailCause.NO_INNER_QUIET;
          }
          return superCause;
      };
      ByregotsBlessing.prototype.execute = function (simulation) {
          _super.prototype.execute.call(this, simulation);
          simulation.removeBuff(exports.Buff.INNER_QUIET);
      };
      ByregotsBlessing.prototype.getBaseCPCost = function (simulationState) {
          return 24;
      };
      ByregotsBlessing.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      ByregotsBlessing.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      ByregotsBlessing.prototype.getIds = function () {
          return [100339, 100340, 100341, 100342, 100343, 100344, 100345, 100346];
      };
      ByregotsBlessing.prototype.getPotency = function (simulation) {
          return Math.min(100 + simulation.getBuff(exports.Buff.INNER_QUIET).stacks * 20, 300);
      };
      return ByregotsBlessing;
  }(QualityAction));

  var PreciseTouch = /** @class */ (function (_super) {
      __extends(PreciseTouch, _super);
      function PreciseTouch() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      PreciseTouch.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 53 };
      };
      PreciseTouch.prototype.execute = function (simulation) {
          _super.prototype.execute.call(this, simulation);
          simulation.addInnerQuietStacks(1);
      };
      PreciseTouch.prototype.requiresGood = function () {
          return true;
      };
      PreciseTouch.prototype._canBeUsed = function (simulationState, linear) {
          if (linear === void 0) { linear = false; }
          if (linear) {
              return true;
          }
          if (simulationState.safe && !simulationState.hasBuff(exports.Buff.HEART_AND_SOUL)) {
              return false;
          }
          return (simulationState.hasBuff(exports.Buff.HEART_AND_SOUL) ||
              simulationState.state === exports.StepState.GOOD ||
              simulationState.state === exports.StepState.EXCELLENT);
      };
      PreciseTouch.prototype.getBaseCPCost = function (simulationState) {
          return 18;
      };
      PreciseTouch.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      PreciseTouch.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      PreciseTouch.prototype.getIds = function () {
          return [100128, 100129, 100130, 100131, 100132, 100133, 100134, 100135];
      };
      PreciseTouch.prototype.getPotency = function (simulation) {
          return 150;
      };
      return PreciseTouch;
  }(QualityAction));

  var PrudentTouch = /** @class */ (function (_super) {
      __extends(PrudentTouch, _super);
      function PrudentTouch() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      PrudentTouch.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 66 };
      };
      PrudentTouch.prototype._canBeUsed = function (simulationState) {
          return !(simulationState.hasBuff(exports.Buff.WASTE_NOT) || simulationState.hasBuff(exports.Buff.WASTE_NOT_II));
      };
      PrudentTouch.prototype.getBaseCPCost = function (simulationState) {
          return 25;
      };
      PrudentTouch.prototype.getBaseDurabilityCost = function (simulationState) {
          return 5;
      };
      PrudentTouch.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      PrudentTouch.prototype.getIds = function () {
          return [100227, 100228, 100229, 100230, 100231, 100232, 100233, 100234];
      };
      PrudentTouch.prototype.getPotency = function (simulation) {
          return 100;
      };
      return PrudentTouch;
  }(QualityAction));

  var TricksOfTheTrade = /** @class */ (function (_super) {
      __extends(TricksOfTheTrade, _super);
      function TricksOfTheTrade() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      TricksOfTheTrade.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 13 };
      };
      TricksOfTheTrade.prototype.getType = function () {
          return exports.ActionType.CP_RECOVERY;
      };
      TricksOfTheTrade.prototype._canBeUsed = function (simulationState, linear) {
          if (linear === void 0) { linear = false; }
          if (linear) {
              return true;
          }
          if (simulationState.safe) {
              return false;
          }
          return (simulationState.state === exports.StepState.GOOD || simulationState.state === exports.StepState.EXCELLENT);
      };
      TricksOfTheTrade.prototype.execute = function (simulation, safe) {
          if (simulation.hasBuff(exports.Buff.HEART_AND_SOUL) ||
              simulation.state === exports.StepState.GOOD ||
              simulation.state === exports.StepState.EXCELLENT) {
              simulation.availableCP += 20;
              if (simulation.availableCP > simulation.maxCP) {
                  simulation.availableCP = simulation.maxCP;
              }
          }
      };
      TricksOfTheTrade.prototype.getBaseCPCost = function (simulationState) {
          return 0;
      };
      TricksOfTheTrade.prototype.getIds = function () {
          return [100371, 100372, 100373, 100374, 100375, 100376, 100377, 100378];
      };
      TricksOfTheTrade.prototype._getSuccessRate = function (simulationState) {
          return 100;
      };
      TricksOfTheTrade.prototype.getDurabilityCost = function (simulationState) {
          return 0;
      };
      TricksOfTheTrade.prototype.skipOnFail = function () {
          return true;
      };
      return TricksOfTheTrade;
  }(CraftingAction));

  var MastersMend = /** @class */ (function (_super) {
      __extends(MastersMend, _super);
      function MastersMend() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MastersMend.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 7 };
      };
      MastersMend.prototype.getType = function () {
          return exports.ActionType.REPAIR;
      };
      MastersMend.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      MastersMend.prototype.execute = function (simulation) {
          simulation.repair(30);
      };
      MastersMend.prototype.getBaseCPCost = function (simulationState) {
          return 88;
      };
      MastersMend.prototype.getDurabilityCost = function (simulationState) {
          return 0;
      };
      MastersMend.prototype.getIds = function () {
          return [100003, 100017, 100032, 100047, 100062, 100077, 100092, 100107];
      };
      MastersMend.prototype._getSuccessRate = function (simulationState) {
          return 100;
      };
      MastersMend.prototype.skipOnFail = function () {
          return true;
      };
      return MastersMend;
  }(CraftingAction));

  var BuffAction = /** @class */ (function (_super) {
      __extends(BuffAction, _super);
      function BuffAction() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      BuffAction.prototype.getType = function () {
          return exports.ActionType.BUFF;
      };
      BuffAction.prototype.canBeClipped = function () {
          return false;
      };
      BuffAction.prototype.execute = function (simulation) {
          for (var _i = 0, _a = this.getOverrides(); _i < _a.length; _i++) {
              var buffToOverride = _a[_i];
              simulation.removeBuff(buffToOverride);
          }
          simulation.buffs.push(this.getAppliedBuff(simulation));
      };
      BuffAction.prototype._canBeUsed = function (simulationState) {
          if (this.canBeClipped()) {
              return true;
          }
          return !simulationState.hasBuff(this.getBuff());
      };
      BuffAction.prototype.getDurabilityCost = function (simulationState) {
          return 0;
      };
      BuffAction.prototype._getSuccessRate = function (simulationState) {
          return 100;
      };
      BuffAction.prototype.skipOnFail = function () {
          return true;
      };
      /**
       * Override this method if the buff overrides other buffs (steady hands for instance).
       * Don't forget to add super.getOverrides() to the array you'll return
       * @returns {Buff | null}
       */
      BuffAction.prototype.getOverrides = function () {
          return [this.getBuff()];
      };
      BuffAction.prototype.getOnExpire = function () {
          // Adding a return here to avoid typescript compilation error due to empty block.
          return undefined;
      };
      BuffAction.prototype.getAppliedBuff = function (simulation) {
          return {
              duration: simulation.state === exports.StepState.PRIMED
                  ? this.getDuration(simulation) + 2
                  : this.getDuration(simulation),
              tick: this.getTick(),
              onExpire: this.getOnExpire(),
              stacks: this.getInitialStacks(),
              buff: this.getBuff(),
              appliedStep: simulation.steps.length,
          };
      };
      return BuffAction;
  }(CraftingAction));

  var Manipulation = /** @class */ (function (_super) {
      __extends(Manipulation, _super);
      function Manipulation() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      Manipulation.prototype.canBeClipped = function () {
          return true;
      };
      Manipulation.prototype.getWaitDuration = function () {
          return 2;
      };
      Manipulation.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 65 };
      };
      Manipulation.prototype.getType = function () {
          return exports.ActionType.REPAIR;
      };
      Manipulation.prototype.getBaseCPCost = function (simulationState) {
          return 96;
      };
      Manipulation.prototype.getDuration = function (simulation) {
          return 8;
      };
      Manipulation.prototype.getIds = function () {
          return [4574, 4575, 4576, 4577, 4578, 4579, 4580, 4581];
      };
      Manipulation.prototype.getOverrides = function () {
          return _super.prototype.getOverrides.call(this).concat(exports.Buff.MANIPULATION);
      };
      Manipulation.prototype.getBuff = function () {
          return exports.Buff.MANIPULATION;
      };
      Manipulation.prototype.getInitialStacks = function () {
          return 0;
      };
      Manipulation.prototype.getTick = function () {
          return function (simulation) {
              simulation.repair(5);
          };
      };
      return Manipulation;
  }(BuffAction));

  var GreatStrides = /** @class */ (function (_super) {
      __extends(GreatStrides, _super);
      function GreatStrides() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      GreatStrides.prototype.canBeClipped = function () {
          return true;
      };
      GreatStrides.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 21 };
      };
      GreatStrides.prototype.getBaseCPCost = function (simulationState) {
          return 32;
      };
      GreatStrides.prototype.getDuration = function (simulation) {
          return 3;
      };
      GreatStrides.prototype.getIds = function () {
          return [260, 261, 262, 263, 264, 265, 266, 267];
      };
      GreatStrides.prototype.getBuff = function () {
          return exports.Buff.GREAT_STRIDES;
      };
      GreatStrides.prototype.getInitialStacks = function () {
          return 0;
      };
      GreatStrides.prototype.getTick = function () {
          return undefined;
      };
      return GreatStrides;
  }(BuffAction));

  var Innovation = /** @class */ (function (_super) {
      __extends(Innovation, _super);
      function Innovation() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      Innovation.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 26 };
      };
      Innovation.prototype.getBaseCPCost = function (simulationState) {
          return 18;
      };
      Innovation.prototype.getBuff = function () {
          return exports.Buff.INNOVATION;
      };
      Innovation.prototype.getDuration = function (simulation) {
          return 4;
      };
      Innovation.prototype.getIds = function () {
          return [19004, 19005, 19006, 19007, 19008, 19009, 19010, 19011];
      };
      Innovation.prototype.getInitialStacks = function () {
          return 0;
      };
      Innovation.prototype.canBeClipped = function () {
          return true;
      };
      Innovation.prototype.getTick = function () {
          return undefined;
      };
      return Innovation;
  }(BuffAction));

  var Veneration = /** @class */ (function (_super) {
      __extends(Veneration, _super);
      function Veneration() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      Veneration.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 15 };
      };
      Veneration.prototype.getBaseCPCost = function (simulationState) {
          return 18;
      };
      Veneration.prototype.getBuff = function () {
          return exports.Buff.VENERATION;
      };
      Veneration.prototype.getDuration = function (simulation) {
          return 4;
      };
      Veneration.prototype.getIds = function () {
          return [19297, 19298, 19299, 19300, 19301, 19302, 19303, 19304];
      };
      Veneration.prototype.getInitialStacks = function () {
          return 0;
      };
      Veneration.prototype.canBeClipped = function () {
          return true;
      };
      Veneration.prototype.getTick = function () {
          return undefined;
      };
      return Veneration;
  }(BuffAction));

  var Observe = /** @class */ (function (_super) {
      __extends(Observe, _super);
      function Observe() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      Observe.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 13 };
      };
      Observe.prototype.getType = function () {
          return exports.ActionType.OTHER;
      };
      Observe.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      Observe.prototype.execute = function (simulation) {
          // Nothing happens
      };
      Observe.prototype.getBaseCPCost = function (simulationState) {
          return 7;
      };
      Observe.prototype.getDurabilityCost = function (simulationState) {
          return 0;
      };
      Observe.prototype.getIds = function () {
          return [100010, 100023, 100040, 100053, 100070, 100082, 100099, 100113];
      };
      Observe.prototype._getSuccessRate = function (simulationState) {
          return 100;
      };
      Observe.prototype.skipOnFail = function () {
          return true;
      };
      return Observe;
  }(CraftingAction));

  var WasteNot = /** @class */ (function (_super) {
      __extends(WasteNot, _super);
      function WasteNot() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      WasteNot.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 15 };
      };
      WasteNot.prototype.getBaseCPCost = function (simulationState) {
          return 56;
      };
      WasteNot.prototype.getDuration = function (simulation) {
          return 4;
      };
      WasteNot.prototype.getIds = function () {
          return [4631, 4632, 4633, 4634, 4635, 4636, 4637, 4638];
      };
      WasteNot.prototype.getBuff = function () {
          return exports.Buff.WASTE_NOT;
      };
      WasteNot.prototype.getInitialStacks = function () {
          return 0;
      };
      WasteNot.prototype.canBeClipped = function () {
          return true;
      };
      WasteNot.prototype.getOverrides = function () {
          return _super.prototype.getOverrides.call(this).concat(exports.Buff.WASTE_NOT_II);
      };
      WasteNot.prototype.getTick = function () {
          return undefined;
      };
      return WasteNot;
  }(BuffAction));

  var WasteNotII = /** @class */ (function (_super) {
      __extends(WasteNotII, _super);
      function WasteNotII() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      WasteNotII.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 47 };
      };
      WasteNotII.prototype.getBaseCPCost = function (simulationState) {
          return 98;
      };
      WasteNotII.prototype.getDuration = function (simulation) {
          return 8;
      };
      WasteNotII.prototype.getIds = function () {
          return [4639, 4640, 4641, 4642, 4643, 4644, 19002, 19003];
      };
      WasteNotII.prototype.getBuff = function () {
          return exports.Buff.WASTE_NOT_II;
      };
      WasteNotII.prototype.getInitialStacks = function () {
          return 0;
      };
      WasteNotII.prototype.canBeClipped = function () {
          return true;
      };
      WasteNotII.prototype.getOverrides = function () {
          return _super.prototype.getOverrides.call(this).concat(exports.Buff.WASTE_NOT);
      };
      WasteNotII.prototype.getTick = function () {
          return undefined;
      };
      return WasteNotII;
  }(BuffAction));

  var TrainedEye = /** @class */ (function (_super) {
      __extends(TrainedEye, _super);
      function TrainedEye() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      TrainedEye.prototype._canBeUsed = function (simulationState, linear) {
          return (!simulationState.recipe.expert &&
              simulationState.crafterStats.level - simulationState.recipe.lvl >= 10 &&
              simulationState.steps.length === 0);
      };
      TrainedEye.prototype.skipOnFail = function () {
          return true;
      };
      TrainedEye.prototype.execute = function (simulation) {
          simulation.quality = simulation.recipe.quality;
      };
      TrainedEye.prototype.getBaseCPCost = function (simulationState) {
          return 250;
      };
      TrainedEye.prototype.getDurabilityCost = function (simulationState) {
          return 0;
      };
      TrainedEye.prototype.getIds = function () {
          return [100283, 100284, 100285, 100286, 100287, 100288, 100289, 100290];
      };
      TrainedEye.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 80 };
      };
      TrainedEye.prototype._getSuccessRate = function (simulationState) {
          return 100;
      };
      TrainedEye.prototype.getType = function () {
          return exports.ActionType.QUALITY;
      };
      return TrainedEye;
  }(CraftingAction));

  var PreparatoryTouch = /** @class */ (function (_super) {
      __extends(PreparatoryTouch, _super);
      function PreparatoryTouch() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      PreparatoryTouch.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 71 };
      };
      PreparatoryTouch.prototype.execute = function (simulation) {
          _super.prototype.execute.call(this, simulation);
          simulation.addInnerQuietStacks(1);
      };
      PreparatoryTouch.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      PreparatoryTouch.prototype.getBaseCPCost = function (simulationState) {
          return 40;
      };
      PreparatoryTouch.prototype.getBaseDurabilityCost = function (simulationState) {
          return 20;
      };
      PreparatoryTouch.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      PreparatoryTouch.prototype.getIds = function () {
          return [100299, 100300, 100301, 100302, 100303, 100304, 100305, 100306];
      };
      PreparatoryTouch.prototype.getPotency = function (simulation) {
          return 200;
      };
      return PreparatoryTouch;
  }(QualityAction));

  var IntensiveSynthesis = /** @class */ (function (_super) {
      __extends(IntensiveSynthesis, _super);
      function IntensiveSynthesis() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      IntensiveSynthesis.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 78 };
      };
      IntensiveSynthesis.prototype.requiresGood = function () {
          return true;
      };
      IntensiveSynthesis.prototype._canBeUsed = function (simulationState, linear) {
          if (linear) {
              return true;
          }
          if (simulationState.safe && !simulationState.hasBuff(exports.Buff.HEART_AND_SOUL)) {
              return false;
          }
          return (simulationState.hasBuff(exports.Buff.HEART_AND_SOUL) ||
              simulationState.state === exports.StepState.GOOD ||
              simulationState.state === exports.StepState.EXCELLENT);
      };
      IntensiveSynthesis.prototype.getBaseCPCost = function (simulationState) {
          return 6;
      };
      IntensiveSynthesis.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      IntensiveSynthesis.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      IntensiveSynthesis.prototype.getIds = function () {
          return [100315, 100316, 100317, 100318, 100319, 100320, 100321, 100322];
      };
      IntensiveSynthesis.prototype.getPotency = function (simulation) {
          return 400;
      };
      return IntensiveSynthesis;
  }(ProgressAction));

  var DelicateSynthesis = /** @class */ (function (_super) {
      __extends(DelicateSynthesis, _super);
      function DelicateSynthesis() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      DelicateSynthesis.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 76 };
      };
      DelicateSynthesis.prototype._canBeUsed = function (simulation, linear) {
          return true;
      };
      DelicateSynthesis.prototype.execute = function (simulation) {
          // Progress
          var progressionIncrease = Math.floor(this.getBaseProgression(simulation));
          var progressPotency = this.getPotency(simulation, 'progress');
          var progressBuffMod = this.getBaseBonus(simulation);
          var progressConditionMod = this.getBaseCondition(simulation);
          switch (simulation.state) {
              case exports.StepState.MALLEABLE:
                  progressConditionMod *= 1.5;
                  break;
              default:
                  break;
          }
          if (simulation.hasBuff(exports.Buff.MUSCLE_MEMORY)) {
              progressBuffMod += 1;
              simulation.removeBuff(exports.Buff.MUSCLE_MEMORY);
          }
          if (simulation.hasBuff(exports.Buff.VENERATION)) {
              progressBuffMod += 0.5;
          }
          var progressEfficiency = progressPotency * progressBuffMod;
          simulation.progression += Math.floor((progressionIncrease * progressConditionMod * progressEfficiency) / 100);
          if (simulation.hasBuff(exports.Buff.FINAL_APPRAISAL) &&
              simulation.progression >= simulation.recipe.progress) {
              simulation.progression = Math.min(simulation.progression, simulation.recipe.progress - 1);
              simulation.removeBuff(exports.Buff.FINAL_APPRAISAL);
          }
          // Quality
          this.executeQuality(simulation);
      };
      DelicateSynthesis.prototype.executeQuality = function (simulation) {
          var _a;
          var buffMod = this.getBaseBonus(simulation);
          var conditionMod = this.getBaseCondition(simulation);
          var potency = this.getPotency(simulation);
          var qualityIncrease = Math.floor(this.getBaseQuality(simulation));
          switch (simulation.state) {
              case exports.StepState.EXCELLENT:
                  conditionMod *= 4;
                  break;
              case exports.StepState.POOR:
                  conditionMod *= 0.5;
                  break;
              case exports.StepState.GOOD:
                  conditionMod *= simulation.crafterStats.relicTool ? 1.75 : 1.5;
                  break;
              default:
                  break;
          }
          var iqMod = ((_a = simulation.getBuff(exports.Buff.INNER_QUIET)) === null || _a === void 0 ? void 0 : _a.stacks) || 0;
          var buffMult = 1;
          if (simulation.hasBuff(exports.Buff.GREAT_STRIDES)) {
              buffMult += 1;
              simulation.removeBuff(exports.Buff.GREAT_STRIDES);
          }
          if (simulation.hasBuff(exports.Buff.INNOVATION)) {
              buffMult += 0.5;
          }
          buffMod = (buffMod * buffMult * (100 + iqMod * 10)) / 100;
          var efficiency = Math.fround(potency * buffMod);
          simulation.quality += Math.floor((qualityIncrease * conditionMod * efficiency) / 100);
          if (simulation.crafterStats.level >= 11) {
              simulation.addInnerQuietStacks(1);
          }
      };
      DelicateSynthesis.prototype.getBaseCPCost = function (simulationState) {
          return 32;
      };
      DelicateSynthesis.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      DelicateSynthesis.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      DelicateSynthesis.prototype.getIds = function () {
          return [100323, 100324, 100325, 100326, 100327, 100328, 100329, 100330];
      };
      DelicateSynthesis.prototype.getPotency = function (simulation, target) {
          if (target === 'progress') {
              return simulation.crafterStats.level >= 94 ? 150 : 100;
          }
          return 100;
      };
      DelicateSynthesis.prototype.getType = function () {
          return exports.ActionType.OTHER;
      };
      return DelicateSynthesis;
  }(GeneralAction));

  var FinalAppraisal = /** @class */ (function (_super) {
      __extends(FinalAppraisal, _super);
      function FinalAppraisal() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      FinalAppraisal.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 42 };
      };
      FinalAppraisal.prototype.getBaseCPCost = function (simulationState) {
          return 1;
      };
      FinalAppraisal.prototype.getDuration = function (simulation) {
          return 5;
      };
      FinalAppraisal.prototype.getIds = function () {
          return [19012, 19013, 19014, 19015, 19016, 19017, 19018, 19019];
      };
      FinalAppraisal.prototype.getBuff = function () {
          return exports.Buff.FINAL_APPRAISAL;
      };
      FinalAppraisal.prototype.getInitialStacks = function () {
          return 0;
      };
      FinalAppraisal.prototype.canBeClipped = function () {
          return true;
      };
      FinalAppraisal.prototype.skipsBuffTicks = function () {
          return true;
      };
      FinalAppraisal.prototype.getTick = function () {
          return undefined;
      };
      return FinalAppraisal;
  }(BuffAction));

  var Reflect$1 = /** @class */ (function (_super) {
      __extends(Reflect, _super);
      function Reflect() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      Reflect.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 69 };
      };
      Reflect.prototype._canBeUsed = function (simulation) {
          return simulation.steps.filter(function (step) { return !step.action.skipsBuffTicks(); }).length === 0;
      };
      Reflect.prototype.skipOnFail = function () {
          return true;
      };
      Reflect.prototype.canBeMoved = function (currentIndex) {
          return currentIndex > 0;
      };
      Reflect.prototype.execute = function (simulation) {
          _super.prototype.execute.call(this, simulation);
          simulation.addInnerQuietStacks(1);
      };
      Reflect.prototype.getBaseCPCost = function (simulationState) {
          return 6;
      };
      Reflect.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      Reflect.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      Reflect.prototype.getIds = function () {
          return [100387, 100388, 100389, 100390, 100391, 100392, 100393, 100394];
      };
      Reflect.prototype.getPotency = function (simulation) {
          return 300;
      };
      return Reflect;
  }(QualityAction));

  var RemoveFinalAppraisal = /** @class */ (function (_super) {
      __extends(RemoveFinalAppraisal, _super);
      function RemoveFinalAppraisal() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      RemoveFinalAppraisal.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 42 };
      };
      RemoveFinalAppraisal.prototype.getType = function () {
          return exports.ActionType.OTHER;
      };
      RemoveFinalAppraisal.prototype._canBeUsed = function (simulationState) {
          return simulationState.hasBuff(exports.Buff.FINAL_APPRAISAL);
      };
      RemoveFinalAppraisal.prototype.execute = function (simulation) {
          simulation.removeBuff(exports.Buff.FINAL_APPRAISAL);
      };
      RemoveFinalAppraisal.prototype.getBaseCPCost = function (simulationState) {
          return 0;
      };
      RemoveFinalAppraisal.prototype.getDurabilityCost = function (simulationState) {
          return 0;
      };
      RemoveFinalAppraisal.prototype.getIds = function () {
          return [-1];
      };
      RemoveFinalAppraisal.prototype._getSuccessRate = function (simulationState) {
          return 100;
      };
      RemoveFinalAppraisal.prototype.skipsBuffTicks = function () {
          return true;
      };
      return RemoveFinalAppraisal;
  }(CraftingAction));

  var CarefulObservation = /** @class */ (function (_super) {
      __extends(CarefulObservation, _super);
      function CarefulObservation() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      CarefulObservation.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 55 };
      };
      CarefulObservation.prototype.getType = function () {
          return exports.ActionType.OTHER;
      };
      CarefulObservation.prototype._canBeUsed = function (simulationState) {
          return simulationState.crafterStats.specialist;
      };
      CarefulObservation.prototype.execute = function (simulation) {
          // As it just rolls the condition, nothing happens
          // We cannot make it not count the step because of replay and step by step view
      };
      CarefulObservation.prototype.getBaseCPCost = function (simulationState) {
          return 0;
      };
      CarefulObservation.prototype.getDurabilityCost = function (simulationState) {
          return 0;
      };
      CarefulObservation.prototype.getIds = function () {
          return [100395, 100396, 100397, 100398, 100399, 100400, 100401, 100402];
      };
      CarefulObservation.prototype._getSuccessRate = function (simulationState) {
          return 100;
      };
      CarefulObservation.prototype.skipOnFail = function () {
          return true;
      };
      CarefulObservation.prototype.skipsBuffTicks = function () {
          return true;
      };
      return CarefulObservation;
  }(CraftingAction));

  var AdvancedTouch = /** @class */ (function (_super) {
      __extends(AdvancedTouch, _super);
      function AdvancedTouch() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      AdvancedTouch.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 68 };
      };
      AdvancedTouch.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      AdvancedTouch.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      AdvancedTouch.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      AdvancedTouch.prototype.hasCombo = function (simulation) {
          for (var index = simulation.steps.length - 1; index >= 0; index--) {
              var step = simulation.steps[index];
              // If we end up finding the action, the combo is available
              if ((step.action.is(StandardTouch) && step.success && step.combo) ||
                  step.action.is(Observe)) {
                  return true;
              }
              // If there's an action that isn't skipped (fail or not), combo is broken
              if (!step.skipped) {
                  return false;
              }
          }
          return false;
      };
      AdvancedTouch.prototype.getBaseCPCost = function (simulationState) {
          return this.hasCombo(simulationState) ? 18 : 46;
      };
      AdvancedTouch.prototype.getIds = function () {
          return [100411, 100412, 100413, 100414, 100415, 100416, 100417, 100418];
      };
      AdvancedTouch.prototype.getPotency = function (simulation) {
          return 150;
      };
      return AdvancedTouch;
  }(QualityAction));

  var PrudentSynthesis = /** @class */ (function (_super) {
      __extends(PrudentSynthesis, _super);
      function PrudentSynthesis() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      PrudentSynthesis.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 88 };
      };
      PrudentSynthesis.prototype._canBeUsed = function (simulationState) {
          return !simulationState.hasBuff(exports.Buff.WASTE_NOT) && !simulationState.hasBuff(exports.Buff.WASTE_NOT_II);
      };
      PrudentSynthesis.prototype.getBaseCPCost = function (simulationState) {
          return 18;
      };
      PrudentSynthesis.prototype.getBaseDurabilityCost = function (simulationState) {
          return 5;
      };
      PrudentSynthesis.prototype.getBaseSuccessRate = function (simulationState) {
          return 180;
      };
      PrudentSynthesis.prototype.getIds = function () {
          return [100427, 100428, 100429, 100430, 100431, 100432, 100433, 100434];
      };
      PrudentSynthesis.prototype.getPotency = function (simulation) {
          return 180;
      };
      return PrudentSynthesis;
  }(ProgressAction));

  var HeartAndSoul = /** @class */ (function (_super) {
      __extends(HeartAndSoul, _super);
      function HeartAndSoul() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      HeartAndSoul.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 86 };
      };
      HeartAndSoul.prototype.canBeClipped = function () {
          return true;
      };
      HeartAndSoul.prototype.skipsBuffTicks = function () {
          return true;
      };
      HeartAndSoul.prototype._canBeUsed = function (simulationState) {
          return (simulationState.crafterStats.specialist &&
              !simulationState.steps.some(function (step) { return step.action.is(HeartAndSoul); }));
      };
      HeartAndSoul.prototype.getType = function () {
          return exports.ActionType.OTHER;
      };
      HeartAndSoul.prototype.getBaseCPCost = function (simulationState) {
          return 0;
      };
      HeartAndSoul.prototype.getDuration = function (simulation) {
          return Infinity;
      };
      HeartAndSoul.prototype.getIds = function () {
          return [100419, 100420, 100421, 100422, 100423, 100424, 100425, 100426];
      };
      HeartAndSoul.prototype.getBuff = function () {
          return exports.Buff.HEART_AND_SOUL;
      };
      HeartAndSoul.prototype.getInitialStacks = function () {
          return 0;
      };
      HeartAndSoul.prototype.getTick = function () {
          var _this = this;
          return function (simulation, linear, action) {
              var usedOnNonGoodOrExcellent = simulation.state !== exports.StepState.GOOD && simulation.state !== exports.StepState.EXCELLENT;
              // If linear, this buff will be removed if last action is one of the buffed ones.
              if (usedOnNonGoodOrExcellent &&
                  [PreciseTouch, IntensiveSynthesis, TricksOfTheTrade].some(function (a) { return action === null || action === void 0 ? void 0 : action.is(a); })) {
                  simulation.removeBuff(_this.getBuff());
              }
          };
      };
      return HeartAndSoul;
  }(BuffAction));

  var TrainedFinesse = /** @class */ (function (_super) {
      __extends(TrainedFinesse, _super);
      function TrainedFinesse() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      TrainedFinesse.prototype._canBeUsed = function (simulationState, linear) {
          return (simulationState.hasBuff(exports.Buff.INNER_QUIET) &&
              simulationState.getBuff(exports.Buff.INNER_QUIET).stacks === 10);
      };
      TrainedFinesse.prototype.getBaseCPCost = function (simulationState) {
          return 32;
      };
      TrainedFinesse.prototype.getIds = function () {
          return [100435, 100436, 100437, 100438, 100439, 100440, 100441, 100442];
      };
      TrainedFinesse.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 90 };
      };
      TrainedFinesse.prototype.getBaseDurabilityCost = function (simulationState) {
          return 0;
      };
      TrainedFinesse.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      TrainedFinesse.prototype.getPotency = function (simulation) {
          return 100;
      };
      return TrainedFinesse;
  }(QualityAction));

  var RefinedTouch = /** @class */ (function (_super) {
      __extends(RefinedTouch, _super);
      function RefinedTouch() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      RefinedTouch.prototype.execute = function (simulation, safe, skipStackAddition) {
          if (safe === void 0) { safe = false; }
          if (skipStackAddition === void 0) { skipStackAddition = false; }
          var hasCombo = this.hasCombo(simulation);
          _super.prototype.execute.call(this, simulation, safe, skipStackAddition);
          if (hasCombo) {
              simulation.addInnerQuietStacks(1);
          }
      };
      RefinedTouch.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 92 };
      };
      RefinedTouch.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      RefinedTouch.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      RefinedTouch.prototype.getBaseSuccessRate = function (simulationState) {
          return 100;
      };
      RefinedTouch.prototype.hasCombo = function (simulation) {
          for (var index = simulation.steps.length - 1; index >= 0; index--) {
              var step = simulation.steps[index];
              // If we end up finding the action, the combo is available
              if (step.action.is(BasicTouch) && step.success) {
                  return true;
              }
              // If there's an action that isn't skipped (fail or not), combo is broken
              if (!step.skipped) {
                  return false;
              }
          }
          return false;
      };
      RefinedTouch.prototype.getBaseCPCost = function (simulationState) {
          return 24;
      };
      RefinedTouch.prototype.getIds = function () {
          return [100443, 100444, 100445, 100446, 100447, 100448, 100449, 100450];
      };
      RefinedTouch.prototype.getPotency = function (simulation) {
          return 100;
      };
      return RefinedTouch;
  }(QualityAction));

  var TrainedPerfection = /** @class */ (function (_super) {
      __extends(TrainedPerfection, _super);
      function TrainedPerfection() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      TrainedPerfection.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 100 };
      };
      TrainedPerfection.prototype.getType = function () {
          return exports.ActionType.OTHER;
      };
      TrainedPerfection.prototype._canBeUsed = function (simulationState) {
          return !simulationState.steps.some(function (step) { return step.action.is(TrainedPerfection); });
      };
      TrainedPerfection.prototype.getBaseCPCost = function (simulationState) {
          return 0;
      };
      TrainedPerfection.prototype.getIds = function () {
          return [100475, 100476, 100477, 100478, 100479, 100480, 100481, 100482];
      };
      TrainedPerfection.prototype.getBuff = function () {
          return exports.Buff.TRAINED_PERFECTION;
      };
      TrainedPerfection.prototype.getDuration = function (simulation) {
          return Infinity;
      };
      TrainedPerfection.prototype.getInitialStacks = function () {
          return 0;
      };
      TrainedPerfection.prototype.getTick = function () {
          return undefined;
      };
      return TrainedPerfection;
  }(BuffAction));

  var DaringTouch = /** @class */ (function (_super) {
      __extends(DaringTouch, _super);
      function DaringTouch() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      DaringTouch.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 96 };
      };
      DaringTouch.prototype.hasCombo = function (simulation) {
          return simulation.hasBuff(exports.Buff.EXPEDIENCE);
      };
      DaringTouch.prototype._canBeUsed = function (simulationState) {
          return simulationState.hasBuff(exports.Buff.EXPEDIENCE);
      };
      DaringTouch.prototype.getBaseDurabilityCost = function (simulationState) {
          return 10;
      };
      DaringTouch.prototype.getBaseSuccessRate = function (simulationState) {
          return 60;
      };
      DaringTouch.prototype.getBaseCPCost = function (simulationState) {
          return 0;
      };
      DaringTouch.prototype.getIds = function () {
          return [100451, 100452, 100453, 100454, 100455, 100456, 100457, 100458];
      };
      DaringTouch.prototype.getPotency = function (simulation) {
          return 150;
      };
      return DaringTouch;
  }(QualityAction));

  var QuickInnovation = /** @class */ (function (_super) {
      __extends(QuickInnovation, _super);
      function QuickInnovation() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      QuickInnovation.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 96 };
      };
      QuickInnovation.prototype.getBaseCPCost = function (simulationState) {
          return 0;
      };
      QuickInnovation.prototype._canBeUsed = function (simulationState) {
          return (simulationState.crafterStats.specialist &&
              !simulationState.steps.some(function (step) { return step.action.is(QuickInnovation); }));
      };
      QuickInnovation.prototype.getWaitDuration = function () {
          return 3;
      };
      QuickInnovation.prototype.getBuff = function () {
          return exports.Buff.INNOVATION;
      };
      QuickInnovation.prototype.getDuration = function (simulation) {
          return 1;
      };
      QuickInnovation.prototype.getIds = function () {
          return [100459, 100460, 100461, 100462, 100463, 100464, 100465, 100466];
      };
      QuickInnovation.prototype.getInitialStacks = function () {
          return 0;
      };
      QuickInnovation.prototype.skipsBuffTicks = function () {
          return true;
      };
      QuickInnovation.prototype.canBeClipped = function () {
          return true;
      };
      QuickInnovation.prototype.getTick = function () {
          return undefined;
      };
      return QuickInnovation;
  }(BuffAction));

  var ImmaculateMend = /** @class */ (function (_super) {
      __extends(ImmaculateMend, _super);
      function ImmaculateMend() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      ImmaculateMend.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 98 };
      };
      ImmaculateMend.prototype.getType = function () {
          return exports.ActionType.REPAIR;
      };
      ImmaculateMend.prototype._canBeUsed = function (simulationState) {
          return true;
      };
      ImmaculateMend.prototype.execute = function (simulation) {
          simulation.durability = simulation.recipe.durability;
      };
      ImmaculateMend.prototype.getBaseCPCost = function (simulationState) {
          return 112;
      };
      ImmaculateMend.prototype.getDurabilityCost = function (simulationState) {
          return 0;
      };
      ImmaculateMend.prototype.getIds = function () {
          return [100467, 100468, 100469, 100470, 100471, 100472, 100473, 100474];
      };
      ImmaculateMend.prototype._getSuccessRate = function (simulationState) {
          return 100;
      };
      ImmaculateMend.prototype.skipOnFail = function () {
          return true;
      };
      return ImmaculateMend;
  }(CraftingAction));

  var MaterialMiracle = /** @class */ (function (_super) {
      __extends(MaterialMiracle, _super);
      function MaterialMiracle() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MaterialMiracle.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 1 };
      };
      MaterialMiracle.prototype.getType = function () {
          return exports.ActionType.OTHER;
      };
      MaterialMiracle.prototype._canBeUsed = function (simulationState) {
          return !simulationState.safe;
      };
      MaterialMiracle.prototype.execute = function (simulation, safe) {
          // DO NOTHING, THIS IS PURELY FOR REPLAY PURPOSE
      };
      MaterialMiracle.prototype.getBaseCPCost = function (simulationState) {
          return 0;
      };
      MaterialMiracle.prototype.getIds = function () {
          return [41269];
      };
      MaterialMiracle.prototype._getSuccessRate = function (simulationState) {
          return 100;
      };
      MaterialMiracle.prototype.getDurabilityCost = function (simulationState) {
          return 0;
      };
      MaterialMiracle.prototype.skipOnFail = function () {
          return true;
      };
      return MaterialMiracle;
  }(CraftingAction));

  var StellarSteadyHand = /** @class */ (function (_super) {
      __extends(StellarSteadyHand, _super);
      function StellarSteadyHand() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      StellarSteadyHand.prototype.getLevelRequirement = function () {
          return { job: exports.CraftingJob.ANY, level: 1 };
      };
      StellarSteadyHand.prototype.getBaseCPCost = function (simulationState) {
          return 0;
      };
      StellarSteadyHand.prototype.getBuff = function () {
          return exports.Buff.STELLAR_STEADY_HAND;
      };
      StellarSteadyHand.prototype.getDuration = function (simulation) {
          return 3;
      };
      StellarSteadyHand.prototype.getIds = function () {
          return [46843, 46843, 46843, 46843, 46843, 46843, 46843, 46843];
      };
      StellarSteadyHand.prototype.getInitialStacks = function () {
          return 0;
      };
      StellarSteadyHand.prototype.canBeClipped = function () {
          return true;
      };
      StellarSteadyHand.prototype.getTick = function () {
          return undefined;
      };
      return StellarSteadyHand;
  }(BuffAction));

  var CraftingActionsRegistry = /** @class */ (function () {
      function CraftingActionsRegistry() {
      }
      CraftingActionsRegistry.getActionsByType = function (type) {
          return CraftingActionsRegistry.ALL_ACTIONS.filter(function (row) { return row.action.getType() === type; }).map(function (row) { return row.action; });
      };
      CraftingActionsRegistry.importFromCraftOpt = function (importArray) {
          return importArray
              .map(function (row) {
              var found = CraftingActionsRegistry.ACTION_IMPORT_NAMES.find(function (action) { return action.short === row; });
              if (found === undefined) {
                  return undefined;
              }
              return CraftingActionsRegistry.ALL_ACTIONS.find(function (el) {
                  return el.name === found.full;
              });
          })
              .filter(function (action) { return action !== undefined; })
              .map(function (row) { return row.action; });
      };
      CraftingActionsRegistry.exportToCraftOpt = function (actionNames) {
          return JSON.stringify(actionNames
              .map(function (actionName) {
              return CraftingActionsRegistry.ACTION_IMPORT_NAMES.find(function (el) {
                  return el.full === actionName;
              });
          })
              .filter(function (action) { return action !== undefined; })
              .map(function (row) { return row.short; }));
      };
      CraftingActionsRegistry.createFromIds = function (ids) {
          return ids
              .map(function (id) {
              var found = CraftingActionsRegistry.ALL_ACTIONS.find(function (row) { return row.action.getIds().indexOf(id) > -1; });
              if (found !== undefined) {
                  return found.action;
              }
              return undefined;
          })
              .filter(function (action) { return action !== undefined; });
      };
      CraftingActionsRegistry.serializeRotation = function (rotation) {
          return rotation
              .map(function (action) {
              var actionRow = CraftingActionsRegistry.ALL_ACTIONS.find(function (row) { return row.action.getIds()[0] === action.getIds()[0]; });
              if (actionRow !== undefined) {
                  return actionRow.name;
              }
              return undefined;
          })
              .filter(function (action) { return action !== undefined; });
      };
      CraftingActionsRegistry.deserializeRotation = function (rotation) {
          return rotation
              .map(function (actionName) {
              return CraftingActionsRegistry.ALL_ACTIONS.find(function (row) { return row.name === actionName; });
          })
              .filter(function (action) { return action !== undefined; })
              .map(function (row) { return row.action; });
      };
      CraftingActionsRegistry.ACTION_IMPORT_NAMES = [
          { short: 'observe', full: 'Observe' },
          { short: 'basicSynth', full: 'BasicSynthesis' },
          { short: 'basicSynth2', full: 'BasicSynthesis' },
          { short: 'rapidSynthesis', full: 'RapidSynthesis' },
          { short: 'rapidSynthesis3', full: 'RapidSynthesis' },
          { short: 'groundwork', full: 'Groundwork' },
          { short: 'basicTouch', full: 'BasicTouch' },
          { short: 'standardTouch', full: 'StandardTouch' },
          { short: 'advancedTouch', full: 'AdvancedTouch' },
          { short: 'hastyTouch', full: 'HastyTouch' },
          { short: 'byregotsBlessing', full: 'ByregotsBlessing' },
          { short: 'byregotsBrow', full: 'ByregotsBlessing' },
          { short: 'byregotsMiracle', full: 'ByregotsBlessing' },
          { short: 'mastersMend', full: 'MastersMend' },
          { short: 'tricksOfTheTrade', full: 'TricksOfTheTrade' },
          { short: 'wasteNot', full: 'WasteNot' },
          { short: 'wasteNot2', full: 'WasteNotII' },
          { short: 'innovation', full: 'Innovation' },
          { short: 'veneration', full: 'Veneration' },
          { short: 'greatStrides', full: 'GreatStrides' },
          { short: 'preciseTouch', full: 'PreciseTouch' },
          { short: 'muscleMemory', full: 'MuscleMemory' },
          { short: 'brandOfTheElements', full: 'BrandOfTheElements' },
          { short: 'brandOfEarth', full: 'BrandOfTheElements' },
          { short: 'brandOfFire', full: 'BrandOfTheElements' },
          { short: 'brandOfIce', full: 'BrandOfTheElements' },
          { short: 'brandOfLightning', full: 'BrandOfTheElements' },
          { short: 'brandOfWater', full: 'BrandOfTheElements' },
          { short: 'brandOfWind', full: 'BrandOfTheElements' },
          { short: 'nameOfTheElements', full: 'NameOfTheElements' },
          { short: 'nameOfEarth', full: 'NameOfTheElements' },
          { short: 'nameOfFire', full: 'NameOfTheElements' },
          { short: 'nameOfIce', full: 'NameOfTheElements' },
          { short: 'nameOfLightning', full: 'NameOfTheElements' },
          { short: 'nameOfWater', full: 'NameOfTheElements' },
          { short: 'nameOfWind', full: 'NameOfTheElements' },
          { short: 'carefulSynthesis', full: 'CarefulSynthesis' },
          { short: 'carefulSynthesis3', full: 'CarefulSynthesis' },
          { short: 'patientTouch', full: 'PatientTouch' },
          { short: 'manipulation', full: 'Manipulation' },
          { short: 'manipulation2', full: 'Manipulation' },
          { short: 'prudentTouch', full: 'PrudentTouch' },
          { short: 'focusedSynthesis', full: 'FocusedSynthesis' },
          { short: 'focusedTouch', full: 'FocusedTouch' },
          { short: 'intensiveSynthesis', full: 'IntensiveSynthesis' },
          { short: 'preparatoryTouch', full: 'PreparatoryTouch' },
          { short: 'delicateSynthesis', full: 'DelicateSynthesis' },
          { short: 'trainedEye', full: 'TrainedEye' },
          { short: 'finalAppraisal', full: 'FinalAppraisal' },
          { short: 'reflect', full: 'Reflect' },
          { short: 'prudentSynthesis', full: 'PrudentSynthesis' },
          { short: 'trainedFinesse', full: 'TrainedFinesse' },
      ];
      CraftingActionsRegistry.ALL_ACTIONS = [
          // Progress actions
          { name: 'BasicSynthesis', action: new BasicSynthesis() },
          { name: 'CarefulSynthesis', action: new CarefulSynthesis() },
          { name: 'PrudentSynthesis', action: new PrudentSynthesis() },
          { name: 'RapidSynthesis', action: new RapidSynthesis() },
          { name: 'Groundwork', action: new Groundwork() },
          { name: 'MuscleMemory', action: new MuscleMemory() },
          { name: 'IntensiveSynthesis', action: new IntensiveSynthesis() },
          // Quality actions
          { name: 'BasicTouch', action: new BasicTouch() },
          { name: 'StandardTouch', action: new StandardTouch() },
          { name: 'AdvancedTouch', action: new AdvancedTouch() },
          { name: 'HastyTouch', action: new HastyTouch() },
          { name: 'DaringTouch', action: new DaringTouch() },
          { name: 'ByregotsBlessing', action: new ByregotsBlessing() },
          { name: 'PreciseTouch', action: new PreciseTouch() },
          { name: 'PrudentTouch', action: new PrudentTouch() },
          { name: 'TrainedEye', action: new TrainedEye() },
          { name: 'PreparatoryTouch', action: new PreparatoryTouch() },
          { name: 'Reflect', action: new Reflect$1() },
          { name: 'TrainedFinesse', action: new TrainedFinesse() },
          { name: 'RefinedTouch', action: new RefinedTouch() },
          { name: 'TrainedPerfection', action: new TrainedPerfection() },
          // CP recovery
          { name: 'TricksOfTheTrade', action: new TricksOfTheTrade() },
          // Repair
          { name: 'MastersMend', action: new MastersMend() },
          { name: 'Manipulation', action: new Manipulation() },
          { name: 'ImmaculateMend', action: new ImmaculateMend() },
          // Buffs
          { name: 'WasteNot', action: new WasteNot() },
          { name: 'WasteNotII', action: new WasteNotII() },
          { name: 'GreatStrides', action: new GreatStrides() },
          { name: 'Innovation', action: new Innovation() },
          { name: 'Veneration', action: new Veneration() },
          { name: 'FinalAppraisal', action: new FinalAppraisal() },
          { name: 'QuickInnovation', action: new QuickInnovation() },
          // Other
          { name: 'Observe', action: new Observe() },
          { name: 'HeartAndSoul', action: new HeartAndSoul() },
          { name: 'CarefulObservation', action: new CarefulObservation() },
          { name: 'DelicateSynthesis', action: new DelicateSynthesis() },
          { name: 'RemoveFinalAppraisal', action: new RemoveFinalAppraisal() },
          { name: 'MaterialMiracle', action: new MaterialMiracle() },
          { name: 'StellarSteadyHand', action: new StellarSteadyHand() },
      ];
      return CraftingActionsRegistry;
  }());

  var recipeStars = {
      55: 1,
      56: 1,
      57: 1,
      58: 1,
      59: 1,
      60: 1,
      61: 1,
      62: 1,
      63: 1,
      64: 1,
      65: 1,
      66: 1,
      67: 1,
      68: 1,
      69: 1,
      70: 2,
      71: 2,
      72: 2,
      73: 2,
      74: 2,
      75: 2,
      76: 2,
      77: 2,
      78: 2,
      79: 2,
      80: 2,
      81: 2,
      82: 2,
      83: 2,
      84: 2,
      85: 2,
      86: 2,
      87: 2,
      88: 2,
      89: 2,
      90: 3,
      91: 3,
      92: 3,
      93: 3,
      94: 3,
      95: 3,
      96: 3,
      97: 3,
      98: 3,
      99: 3,
      100: 3,
      101: 3,
      102: 3,
      103: 3,
      104: 3,
      105: 3,
      106: 3,
      107: 3,
      108: 3,
      109: 3,
      110: 4,
      111: 4,
      112: 4,
      113: 4,
      114: 4,
      160: 1,
      161: 1,
      162: 1,
      163: 1,
      164: 1,
      165: 1,
      166: 1,
      167: 1,
      168: 1,
      169: 1,
      170: 1,
      171: 1,
      172: 1,
      173: 1,
      174: 1,
      175: 1,
      176: 1,
      177: 1,
      178: 1,
      179: 1,
      180: 2,
      181: 2,
      182: 2,
      183: 2,
      184: 2,
      185: 2,
      186: 2,
      187: 2,
      188: 2,
      189: 2,
      190: 2,
      191: 2,
      192: 2,
      193: 2,
      194: 2,
      195: 2,
      196: 2,
      197: 2,
      198: 2,
      199: 2,
      200: 2,
      201: 2,
      202: 2,
      203: 2,
      204: 2,
      205: 2,
      206: 2,
      207: 2,
      208: 2,
      209: 2,
      210: 3,
      211: 3,
      212: 3,
      213: 3,
      214: 3,
      215: 3,
      216: 3,
      217: 3,
      218: 3,
      219: 3,
      220: 3,
      221: 3,
      222: 3,
      223: 3,
      224: 3,
      225: 3,
      226: 3,
      227: 3,
      228: 3,
      229: 3,
      230: 3,
      231: 3,
      232: 3,
      233: 3,
      234: 3,
      235: 3,
      236: 3,
      237: 3,
      238: 3,
      239: 3,
      240: 3,
      241: 3,
      242: 3,
      243: 3,
      244: 3,
      245: 3,
      246: 3,
      247: 3,
      248: 3,
      249: 3,
      250: 4,
      251: 4,
      252: 4,
      253: 4,
      254: 4,
      300: 1,
      301: 1,
      302: 1,
      303: 1,
      304: 1,
      305: 1,
      306: 1,
      307: 1,
      308: 1,
      309: 1,
      310: 1,
      311: 1,
      312: 1,
      313: 1,
      314: 1,
      315: 1,
      316: 1,
      317: 1,
      318: 1,
      319: 1,
      320: 2,
      321: 2,
      322: 2,
      323: 2,
      324: 2,
      325: 2,
      326: 2,
      327: 2,
      328: 2,
      329: 2,
      330: 2,
      331: 2,
      332: 2,
      333: 2,
      334: 2,
      335: 2,
      336: 2,
      337: 2,
      338: 2,
      339: 2,
      340: 2,
      341: 2,
      342: 2,
      343: 2,
      344: 2,
      345: 2,
      346: 2,
      347: 2,
      348: 2,
      349: 2,
      350: 3,
      351: 3,
      352: 3,
      353: 3,
      354: 3,
      355: 3,
      356: 3,
      357: 3,
      358: 3,
      359: 3,
      360: 3,
      361: 3,
      362: 3,
      363: 3,
      364: 3,
      365: 3,
      366: 3,
      367: 3,
      368: 3,
      369: 3,
      370: 3,
      371: 3,
      372: 3,
      373: 3,
      374: 3,
      375: 3,
      376: 3,
      377: 3,
      378: 3,
      379: 3,
      380: 4,
      440: 1,
      441: 1,
      442: 1,
      443: 1,
      444: 1,
      445: 1,
      446: 1,
      447: 1,
      448: 1,
      449: 1,
      450: 2
  };

  var Simulation = /** @class */ (function () {
      function Simulation(recipe, actions, _crafterStats, hqIngredients, stepStates, fails, startingQuality) {
          if (hqIngredients === void 0) { hqIngredients = []; }
          if (stepStates === void 0) { stepStates = {}; }
          if (fails === void 0) { fails = []; }
          if (startingQuality === void 0) { startingQuality = 0; }
          this.recipe = recipe;
          this.actions = actions;
          this._crafterStats = _crafterStats;
          this.hqIngredients = hqIngredients;
          this.stepStates = stepStates;
          this.fails = fails;
          this.progression = 0;
          this.quality = 0;
          this.startingQuality = 0;
          this.state = exports.StepState.NORMAL;
          this.buffs = [];
          this.success = undefined;
          this.steps = [];
          this.lastPossibleReclaimStep = -1; // equals the index of the last step where you have CP/durability for Reclaim,
          // or -1 if Reclaim is uncastable (i.e. not enough CP)
          this.safe = false;
          this.possibleConditions = [];
          this.durability = recipe.durability;
          this.availableCP = this._crafterStats.cp;
          this.maxCP = this.availableCP;
          var _loop_1 = function (ingredient) {
              // Get the ingredient in the recipe
              var ingredientDetails = this_1.recipe.ingredients.find(function (i) { return i.id === ingredient.id; });
              // Check that the ingredient in included in the recipe
              if (ingredientDetails !== undefined && ingredientDetails.quality) {
                  this_1.quality += ingredientDetails.quality * ingredient.amount;
              }
          };
          var this_1 = this;
          for (var _i = 0, _a = this.hqIngredients; _i < _a.length; _i++) {
              var ingredient = _a[_i];
              _loop_1(ingredient);
          }
          if (this.hqIngredients.length === 0) {
              this.quality = startingQuality;
          }
          this.quality = Math.floor(this.quality);
          this.startingQuality = this.quality;
          this.possibleConditions = this.recipe.conditionsFlag
              .toString(2)
              .split('')
              .reverse()
              .map(function (value, index) {
              if (value === '1') {
                  return (index + 1);
              }
              else {
                  return null;
              }
          })
              .filter(function (condition) { return condition !== null; });
      }
      Object.defineProperty(Simulation.prototype, "lastStep", {
          get: function () {
              return this.steps[this.steps.length - 1];
          },
          enumerable: false,
          configurable: true
      });
      Simulation.prototype.hasComboAvailable = function (actionId) {
          for (var index = this.steps.length - 1; index >= 0; index--) {
              var step = this.steps[index];
              // If we end up finding the action, the combo is available
              if (step.action.getIds()[0] === actionId && step.success) {
                  return true;
              }
              // If there's an action that isn't skipped (fail or not), combo is broken
              if (!step.skipped) {
                  return false;
              }
          }
          return false;
      };
      Object.defineProperty(Simulation.prototype, "crafterStats", {
          get: function () {
              return this._crafterStats;
          },
          enumerable: false,
          configurable: true
      });
      Simulation.prototype.getReliabilityReport = function () {
          this.reset();
          var results = [];
          // Let's run the simulation 200 times.
          for (var i = 0; i < 200; i++) {
              results.push(this.run(false));
              this.reset();
          }
          var successPercent = (results.filter(function (res) { return res.success; }).length / results.length) * 100;
          var hqPercent = results.reduce(function (p, c) { return p + c.hqPercent; }, 0) / results.length;
          var hqMedian;
          results = results.sort(function (a, b) { return a.hqPercent - b.hqPercent; });
          if (results.length % 2) {
              hqMedian = results[Math.floor(results.length / 2)].hqPercent;
          }
          else {
              hqMedian =
                  (results[Math.floor(results.length / 2)].hqPercent +
                      results[Math.ceil(results.length / 2)].hqPercent) /
                      2;
          }
          return {
              rawData: results,
              successPercent: Math.round(successPercent),
              averageHQPercent: Math.round(hqPercent),
              medianHQPercent: hqMedian,
              minHQPercent: results[0].hqPercent,
              maxHQPercent: results[results.length - 1].hqPercent,
          };
      };
      Simulation.prototype.addInnerQuietStacks = function (stacks) {
          if (!this.hasBuff(exports.Buff.INNER_QUIET)) {
              this.buffs.push({
                  appliedStep: this.steps.length,
                  stacks: Math.min(stacks, 10),
                  buff: exports.Buff.INNER_QUIET,
                  duration: Infinity,
              });
          }
          else {
              var iq = this.getBuff(exports.Buff.INNER_QUIET);
              iq.stacks = Math.min(iq.stacks + stacks, 10);
          }
      };
      /**
       *
       * @param thresholds an array of quality thresholds, Collectibility ratings must be scaled before input
       * @returns a boolean for successful calculation, and the minimum value for each stat
       */
      Simulation.prototype.getMinStats = function (thresholds) {
          var _this = this;
          var _a, _b;
          if (thresholds === void 0) { thresholds = []; }
          var totalIterations = 0;
          var result = this.run(true);
          var originalHqPercent = result.hqPercent;
          var originalQuality = result.simulation.quality;
          var originalStats = __assign({}, this.crafterStats);
          var res = {
              control: this.crafterStats._control,
              craftsmanship: this.crafterStats.craftsmanship,
              cp: this.crafterStats.cp,
              found: true,
          };
          // Note that thresholds are actual quality, so Collectibility rating must scale before input
          var rating = originalQuality;
          if (thresholds.length > 0) {
              rating = thresholds.reduce(function (current, next) { return (next > originalQuality ? current : Math.max(current, next)); }, 0);
          }
          var bisect = function (stat, start, end) {
              if (start === end) {
                  return start;
              }
              totalIterations++;
              // Our operating new stat value
              var test = Math.floor((start + end) / 2);
              switch (stat) {
                  case 'cms':
                      _this.crafterStats.craftsmanship = test;
                      break;
                  case 'cp':
                      _this.crafterStats.cp = test;
                      break;
              }
              _this.reset();
              result = _this.run(true);
              // CP needs to know we didn't gimp quality, so check both values
              if (result.success && result.hqPercent >= originalHqPercent) {
                  // Due to flooring, if the 2 numbers are adjacent, test will be the same as the lower
                  if (test === start) {
                      return test;
                  }
                  return bisect(stat, start, test);
              }
              else {
                  // If it fails but our test was 1 below the "good" side, then the end was the answer
                  if (test === end - 1) {
                      switch (stat) {
                          case 'cms':
                              _this.crafterStats.craftsmanship = end;
                              break;
                          case 'cp':
                              _this.crafterStats.cp = end;
                              break;
                      }
                      return end;
                  }
                  return bisect(stat, test, end);
              }
          };
          var bisectControl = function (start, end) {
              if (start === end) {
                  return start;
              }
              totalIterations++;
              // Our operating new stat value
              var test = Math.floor((start + end) / 2);
              _this.crafterStats._control = test;
              _this.reset();
              result = _this.run(true);
              // If we have thresholds and didn't max the recipe, target rating, otherwise HQ chance
              var comparator = thresholds.length > 0 && originalHqPercent < 100 ? rating : originalHqPercent;
              // If we have thresholds and didn't max the recipe, use quality, otherwise HQ chance
              var outcome = thresholds.length > 0 && originalHqPercent < 100
                  ? result.simulation.quality
                  : result.hqPercent;
              // Switch between the 2 control targets
              if (outcome < comparator) {
                  if (test === end - 1) {
                      _this.crafterStats._control = end;
                      return end;
                  }
                  return bisectControl(test, end);
              }
              else {
                  if (test === start) {
                      return test;
                  }
                  return bisectControl(start, test);
              }
          };
          // Narrow the window when possible, or return the min if we're too low
          var cmsBase = (_a = this.recipe.craftsmanshipReq) !== null && _a !== void 0 ? _a : 1;
          res.craftsmanship =
              cmsBase < originalStats.craftsmanship
                  ? bisect('cms', cmsBase, originalStats.craftsmanship)
                  : cmsBase;
          var ctlBase = (_b = this.recipe.controlReq) !== null && _b !== void 0 ? _b : 1;
          res.control =
              ctlBase < originalStats._control ? bisectControl(ctlBase, originalStats._control) : ctlBase;
          // We need to reset control to make sure result.hqPercent is accurate
          this.crafterStats._control = originalStats._control;
          res.cp = bisect('cp', 180, originalStats.cp);
          if (totalIterations >= 10000) {
              res.found = false;
          }
          this.crafterStats.cp = originalStats.cp;
          this.crafterStats.craftsmanship = originalStats.craftsmanship;
          this.crafterStats._control = originalStats._control;
          return res;
      };
      Simulation.prototype.reset = function () {
          delete this.success;
          this.progression = 0;
          this.durability = this.recipe.durability;
          this.quality = this.startingQuality;
          this.buffs = [];
          this.steps = [];
          this.maxCP = this.crafterStats.cp;
          this.availableCP = this.maxCP;
          this.state = exports.StepState.NORMAL;
          this.safe = false;
      };
      /**
       * Run the simulation.
       * @param {boolean} linear should everything be linear (aka no fail on actions, Initial preparations never procs)
       * @param maxTurns
       * @param safeMode Safe mode makes all the actions that have success chances < 100
       * @returns {ActionResult[]}
       */
      Simulation.prototype.run = function (linear, maxTurns, safeMode) {
          var _this = this;
          if (linear === void 0) { linear = false; }
          if (maxTurns === void 0) { maxTurns = Infinity; }
          if (safeMode === void 0) { safeMode = false; }
          this.lastPossibleReclaimStep = -1;
          this.actions
              .filter(function (a) { return a !== undefined; })
              .forEach(function (action, index) {
              _this.state = _this.stepStates[index] || exports.StepState.NORMAL;
              var result;
              var failCause = undefined;
              var canUseAction = action.canBeUsed(_this, linear);
              if (!canUseAction) {
                  failCause = action.getFailCause(_this, linear, safeMode);
              }
              var hasEnoughCP = action.getBaseCPCost(_this) <= _this.availableCP;
              if (!hasEnoughCP) {
                  failCause = exports.SimulationFailCause.NOT_ENOUGH_CP;
              }
              // If we can use the action
              if (_this.success === undefined &&
                  hasEnoughCP &&
                  _this.steps.length < maxTurns &&
                  canUseAction) {
                  result = _this.runAction(action, linear, safeMode, index);
              }
              else {
                  // If we can't, add the step to the result but skip it.
                  result = {
                      action: action,
                      success: null,
                      addedQuality: 0,
                      addedProgression: 0,
                      cpDifference: 0,
                      skipped: true,
                      solidityDifference: 0,
                      state: _this.state,
                      failCause: failCause,
                  };
              }
              if (_this.steps.length < maxTurns) {
                  var qualityBefore = _this.quality;
                  var progressionBefore = _this.progression;
                  var durabilityBefore = _this.durability;
                  var cpBefore = _this.availableCP;
                  var skipTicksOnFail = !result.success && action.skipOnFail();
                  if (_this.success === undefined && !action.skipsBuffTicks() && !skipTicksOnFail) {
                      // Tick buffs after checking synth result, so if we reach 0 durability, synth fails.
                      _this.tickBuffs(linear, action);
                  }
                  result.afterBuffTick = {
                      // Amount of progression added to the craft
                      addedProgression: _this.progression - progressionBefore,
                      // Amount of quality added to the craft
                      addedQuality: _this.quality - qualityBefore,
                      // CP added to the craft (negative if removed)
                      cpDifference: _this.availableCP - cpBefore,
                      // Solidity added to the craft (negative if removed)
                      solidityDifference: _this.durability - durabilityBefore,
                  };
              }
              // Tick state to change it for next turn if not in linear mode
              if (!linear && !action.is(FinalAppraisal) && !action.is(RemoveFinalAppraisal)) {
                  _this.tickState();
              }
              _this.steps.push(result);
          });
          var failedAction = this.steps.find(function (step) { return step.failCause !== undefined; });
          var res = {
              steps: this.steps,
              hqPercent: this.getHQPercent(),
              success: this.progression >= this.recipe.progress,
              simulation: this,
          };
          if (this.recipe.requiredQuality) {
              var qualityRequirementMet = this.quality >= this.recipe.requiredQuality;
              res.success = res.success && qualityRequirementMet;
              if (!res.success) {
                  res.failCause = exports.SimulationFailCause[exports.SimulationFailCause.QUALITY_TOO_LOW];
              }
          }
          if (failedAction !== undefined && failedAction.failCause) {
              res.failCause = exports.SimulationFailCause[failedAction.failCause];
          }
          return res;
      };
      /**
       * Runs an action, can be called from external class (Whistle for instance).
       * @param {CraftingAction} action
       * @param {boolean} linear
       * @param {boolean} safeMode
       * @param index
       */
      Simulation.prototype.runAction = function (action, linear, safeMode, index) {
          if (linear === void 0) { linear = false; }
          if (safeMode === void 0) { safeMode = false; }
          if (index === void 0) { index = -1; }
          // The roll for the current action's success rate, 0 if ideal mode, as 0 will even match a 1% chances.
          var probabilityRoll = linear ? 0 : Math.random() * 100;
          if (this.fails.includes(index)) {
              // Impossible to succeed
              probabilityRoll = 999;
          }
          var qualityBefore = this.quality;
          var progressionBefore = this.progression;
          var durabilityBefore = this.durability;
          var cpBefore = this.availableCP;
          var combo = action.hasCombo(this);
          var failCause = undefined;
          var success = false;
          if (safeMode &&
              (action.getSuccessRate(this) < 100 ||
                  (action.requiresGood() && !this.hasBuff(exports.Buff.HEART_AND_SOUL)))) {
              failCause = exports.SimulationFailCause.UNSAFE_ACTION;
              action.onFail(this);
              this.safe = false;
          }
          else {
              if (action.getSuccessRate(this) >= probabilityRoll) {
                  action.execute(this, safeMode);
                  success = true;
              }
              else {
                  action.onFail(this);
              }
          }
          // Even if the action failed, we have to remove the durability cost
          if (this.hasBuff(exports.Buff.TRAINED_PERFECTION) && action.getDurabilityCost(this) > 0) {
              this.removeBuff(exports.Buff.TRAINED_PERFECTION);
          }
          else {
              this.durability -= action.getDurabilityCost(this);
          }
          // Even if the action failed, CP has to be consumed too
          this.availableCP -= action.getCPCost(this, linear);
          if (this.progression >= this.recipe.progress) {
              this.success = true;
          }
          else if (this.durability <= 0) {
              failCause = exports.SimulationFailCause.DURABILITY_REACHED_ZERO;
              // Check durability to see if the craft is failed or not
              this.success = false;
          }
          // return action result
          return {
              action: action,
              success: success,
              addedQuality: this.quality - qualityBefore,
              addedProgression: this.progression - progressionBefore,
              cpDifference: this.availableCP - cpBefore,
              skipped: false,
              solidityDifference: this.durability - durabilityBefore,
              state: this.state,
              failCause: failCause,
              combo: combo,
          };
      };
      Simulation.prototype.hasBuff = function (buff) {
          return this.buffs.find(function (row) { return row.buff === buff; }) !== undefined;
      };
      Simulation.prototype.getBuff = function (buff) {
          return this.buffs.find(function (row) { return row.buff === buff; });
      };
      Simulation.prototype.removeBuff = function (buff) {
          this.buffs = this.buffs.filter(function (row) { return row.buff !== buff; });
      };
      Simulation.prototype.repair = function (amount) {
          this.durability += amount;
          if (this.durability > this.recipe.durability) {
              this.durability = this.recipe.durability;
          }
      };
      Simulation.prototype.clone = function () {
          return new Simulation(this.recipe, this.actions, this.crafterStats, this.hqIngredients, this.stepStates, this.fails, this.startingQuality);
      };
      Simulation.prototype.getHQPercent = function () {
          var qualityPercent = Math.min(this.quality / this.recipe.quality, 1) * 100;
          if (qualityPercent === 0) {
              return 1;
          }
          else if (qualityPercent >= 100) {
              return 100;
          }
          else {
              return Tables.HQ_TABLE[Math.floor(qualityPercent)];
          }
      };
      Simulation.prototype.tickBuffs = function (linear, action) {
          var _this = this;
          if (linear === void 0) { linear = false; }
          for (var _i = 0, _a = this.buffs; _i < _a.length; _i++) {
              var effectiveBuff = _a[_i];
              // We are checking the appliedStep because ticks only happen at the beginning of the second turn after the application,
              // For instance, Great strides launched at turn 1 will start to loose duration at the beginning of turn 3
              if (effectiveBuff.appliedStep < this.steps.length) {
                  // If the buff has something to do, let it do it
                  if (effectiveBuff.tick !== undefined) {
                      effectiveBuff.tick(this, linear, action);
                  }
                  effectiveBuff.duration--;
              }
          }
          this.buffs
              .filter(function (buff) { return buff.duration <= 0 && buff.onExpire !== undefined; })
              .forEach(function (expired) {
              expired.onExpire(_this, linear);
          });
          this.buffs = this.buffs.filter(function (buff) { return buff.duration > 0; });
      };
      /**
       * Changes the state of the craft,
       * source: https://github.com/Ermad/ffxiv-craft-opt-web/blob/master/app/js/ffxivcraftmodel.js#L255
       */
      Simulation.prototype.tickState = function () {
          var _this = this;
          // If current state is EXCELLENT, then next one is poor
          if (this.state === exports.StepState.EXCELLENT) {
              this.state = exports.StepState.POOR;
              return;
          }
          // If current state is GOOD_OMEN, then next one is GOOD
          if (this.state === exports.StepState.GOOD_OMEN) {
              this.state = exports.StepState.GOOD;
              return;
          }
          // If current state is ROBUST, then next one is STURDY
          if (this.state === exports.StepState.ROBUST) {
              this.state = exports.StepState.STURDY;
              return;
          }
          // LV 63 Trait for improved Good chances (Quality Assurance)
          var goodChance = this.crafterStats.level >= 63 ? 0.25 : 0.2;
          var statesAndRates = this.possibleConditions
              .filter(function (condition) { return condition !== exports.StepState.NORMAL; })
              .map(function (condition) {
              // Default rate - most conditions are 12% so here we are.
              var rate = 0.12;
              switch (condition) {
                  case exports.StepState.GOOD:
                      rate = _this.recipe.expert ? 0.12 : goodChance;
                      break;
                  case exports.StepState.EXCELLENT:
                      rate = _this.recipe.expert ? 0 : 0.04;
                      break;
                  case exports.StepState.POOR:
                      rate = 0;
                      break;
                  case exports.StepState.CENTERED:
                      rate = 0.15;
                      break;
                  case exports.StepState.PLIANT:
                      rate = 0.12;
                      break;
                  case exports.StepState.STURDY:
                      rate = 0.15;
                      break;
                  case exports.StepState.ROBUST:
                      rate = 0.1;
                      break;
                  case exports.StepState.MALLEABLE:
                      rate = 0.12;
                      break;
                  case exports.StepState.PRIMED:
                      rate = 0.12;
                      break;
                  case exports.StepState.GOOD_OMEN:
                      rate = 0.1;
                      break;
              }
              return {
                  item: condition,
                  weight: rate,
              };
          });
          var nonNormalRate = statesAndRates
              .map(function (val) { return val.weight; })
              .reduce(function (accumulator, weight) { return accumulator + weight; });
          statesAndRates.push({
              item: exports.StepState.NORMAL,
              weight: 1 - nonNormalRate,
          });
          this.state = getWeightedRandom(statesAndRates);
      };
      return Simulation;
  }());
  var getWeightedRandom = function (weightedItems) {
      var totalWeights = weightedItems
          .map(function (val) { return val.weight; })
          .reduce(function (accumulator, weight) { return accumulator + weight; });
      var threshold = Math.random() * totalWeights;
      var check = 0;
      for (var _i = 0, weightedItems_1 = weightedItems; _i < weightedItems_1.length; _i++) {
          var _a = weightedItems_1[_i], item = _a.item, weight = _a.weight;
          check += weight;
          if (check > threshold) {
              return item;
          }
      }
      return weightedItems[weightedItems.length - 1].item;
  };

  /**
   * @file Automatically generated by barrelsby.
   */

  exports.CrafterStats = CrafterStats;
  exports.CraftingActionsRegistry = CraftingActionsRegistry;
  exports.Tables = Tables;
  exports.BuffAction = BuffAction;
  exports.CraftingAction = CraftingAction;
  exports.GeneralAction = GeneralAction;
  exports.ProgressAction = ProgressAction;
  exports.QualityAction = QualityAction;
  exports.FinalAppraisal = FinalAppraisal;
  exports.GreatStrides = GreatStrides;
  exports.HeartAndSoul = HeartAndSoul;
  exports.Innovation = Innovation;
  exports.Manipulation = Manipulation;
  exports.QuickInnovation = QuickInnovation;
  exports.Veneration = Veneration;
  exports.WasteNotII = WasteNotII;
  exports.WasteNot = WasteNot;
  exports.CarefulObservation = CarefulObservation;
  exports.DelicateSynthesis = DelicateSynthesis;
  exports.ImmaculateMend = ImmaculateMend;
  exports.MastersMend = MastersMend;
  exports.Observe = Observe;
  exports.RemoveFinalAppraisal = RemoveFinalAppraisal;
  exports.TrainedPerfection = TrainedPerfection;
  exports.TricksOfTheTrade = TricksOfTheTrade;
  exports.BasicSynthesis = BasicSynthesis;
  exports.CarefulSynthesis = CarefulSynthesis;
  exports.Groundwork = Groundwork;
  exports.IntensiveSynthesis = IntensiveSynthesis;
  exports.MuscleMemory = MuscleMemory;
  exports.PrudentSynthesis = PrudentSynthesis;
  exports.RapidSynthesis = RapidSynthesis;
  exports.AdvancedTouch = AdvancedTouch;
  exports.BasicTouch = BasicTouch;
  exports.ByregotsBlessing = ByregotsBlessing;
  exports.DaringTouch = DaringTouch;
  exports.HastyTouch = HastyTouch;
  exports.PreciseTouch = PreciseTouch;
  exports.PreparatoryTouch = PreparatoryTouch;
  exports.PrudentTouch = PrudentTouch;
  exports.RefinedTouch = RefinedTouch;
  exports.Reflect = Reflect$1;
  exports.StandardTouch = StandardTouch;
  exports.TrainedEye = TrainedEye;
  exports.TrainedFinesse = TrainedFinesse;
  exports.recipeStars = recipeStars;
  exports.Simulation = Simulation;

  Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=simulator.umd.js.map
