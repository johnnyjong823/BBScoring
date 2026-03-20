/**
 * BBScoring — RulesEngine 棒球規則引擎
 */
import { PITCH_RESULTS_INFO, HIT_RESULTS_INFO, HALF_INNING } from '../utils/constants.js';

export class RulesEngine {

  /**
   * 計算投球後的球數更新
   * @returns {{ strikes, balls, result }} result: null | 'STRIKEOUT' | 'WALK'
   */
  static updateCount(currentStrikes, currentBalls, pitchResult) {
    let strikes = currentStrikes;
    let balls = currentBalls;
    let result = null;

    const info = PITCH_RESULTS_INFO[pitchResult];
    if (!info) return { strikes, balls, result };

    if (info.countsAsBall) {
      balls++;
      if (balls >= 4) result = 'WALK';
    } else if (info.countsAsStrike) {
      // 界外球兩好球後不增加 (但 FB 界外觸擊會三振)
      if (pitchResult === 'F' && strikes >= 2) {
        // 界外球不計第三好球
      } else {
        strikes++;
        if (strikes >= 3) result = 'STRIKEOUT';
      }
    }
    // 觸身球、故意四壞等不改變球數，但 endAtBat

    return { strikes, balls, result };
  }

  /**
   * 判定打擊結果的出局數
   */
  static getOutsFromResult(hitResultType) {
    const info = HIT_RESULTS_INFO[hitResultType];
    return info ? (info.outs || 0) : 0;
  }

  /**
   * 判定是否為安打
   */
  static isHit(hitResultType) {
    const info = HIT_RESULTS_INFO[hitResultType];
    return info ? info.category === 'HIT' : false;
  }

  /**
   * 判定是否計為打數
   */
  static isAtBat(hitResultType) {
    const info = HIT_RESULTS_INFO[hitResultType];
    return info ? !info.noAB : true;
  }

  /**
   * 判定壘打數
   */
  static getTotalBases(hitResultType) {
    const info = HIT_RESULTS_INFO[hitResultType];
    return info ? (info.bases || 0) : 0;
  }

  /**
   * 自動推算跑壘（簡易版）
   * @param {Object} runners - { first, second, third } (player ID or null)
   * @param {string} resultType - 打擊結果代碼
   * @param {string} batterId - 打者 ID
   * @returns {Object} { newRunners, movements, runs }
   */
  static autoAdvanceRunners(runners, resultType, batterId) {
    const info = HIT_RESULTS_INFO[resultType];
    if (!info) return { newRunners: { ...runners }, movements: [], runs: 0 };

    const newRunners = { first: null, second: null, third: null };
    const movements = [];
    let runs = 0;

    const bases = info.bases || 0;

    if (info.category === 'HIT' && bases === 4) {
      // 全壘打：所有人得分
      ['third', 'second', 'first'].forEach(base => {
        if (runners[base]) {
          movements.push({ runnerId: runners[base], from: base, to: 'home', event: 'HIT', scored: true, earnedRun: true });
          runs++;
        }
      });
      movements.push({ runnerId: batterId, from: 'home', to: 'home', event: 'HIT', scored: true, earnedRun: true });
      runs++;
    } else if (info.category === 'HIT' && bases === 3) {
      // 三壘安打
      ['third', 'second', 'first'].forEach(base => {
        if (runners[base]) {
          movements.push({ runnerId: runners[base], from: base, to: 'home', event: 'HIT', scored: true, earnedRun: true });
          runs++;
        }
      });
      newRunners.third = batterId;
      movements.push({ runnerId: batterId, from: 'home', to: 'third', event: 'HIT', scored: false, earnedRun: false });
    } else if (info.category === 'HIT' && bases === 2) {
      // 二壘安打
      ['third', 'second'].forEach(base => {
        if (runners[base]) {
          movements.push({ runnerId: runners[base], from: base, to: 'home', event: 'HIT', scored: true, earnedRun: true });
          runs++;
        }
      });
      if (runners.first) {
        newRunners.third = runners.first;
        movements.push({ runnerId: runners.first, from: 'first', to: 'third', event: 'HIT', scored: false, earnedRun: false });
      }
      newRunners.second = batterId;
      movements.push({ runnerId: batterId, from: 'home', to: 'second', event: 'HIT', scored: false, earnedRun: false });
    } else if (info.category === 'HIT' && bases === 1) {
      // 一壘安打
      if (runners.third) {
        movements.push({ runnerId: runners.third, from: 'third', to: 'home', event: 'HIT', scored: true, earnedRun: true });
        runs++;
      }
      if (runners.second) {
        newRunners.third = runners.second;
        movements.push({ runnerId: runners.second, from: 'second', to: 'third', event: 'HIT', scored: false, earnedRun: false });
      }
      if (runners.first) {
        newRunners.second = runners.first;
        movements.push({ runnerId: runners.first, from: 'first', to: 'second', event: 'HIT', scored: false, earnedRun: false });
      }
      newRunners.first = batterId;
      movements.push({ runnerId: batterId, from: 'home', to: 'first', event: 'HIT', scored: false, earnedRun: false });
    } else if (info.category === 'WALK' || resultType === 'HBP' || resultType === 'IBB') {
      // 保送 / 觸身球
      if (runners.third) {
        if (runners.second && runners.first) {
          movements.push({ runnerId: runners.third, from: 'third', to: 'home', event: 'HIT', scored: true, earnedRun: true });
          runs++;
        } else {
          newRunners.third = runners.third;
        }
      }
      if (runners.second) {
        if (runners.first) {
          newRunners.third = newRunners.third || runners.second;
          movements.push({ runnerId: runners.second, from: 'second', to: 'third', event: 'HIT', scored: false, earnedRun: false });
        } else {
          newRunners.second = runners.second;
        }
      }
      if (runners.first) {
        newRunners.second = runners.first;
        movements.push({ runnerId: runners.first, from: 'first', to: 'second', event: 'HIT', scored: false, earnedRun: false });
      }
      newRunners.first = batterId;
      movements.push({ runnerId: batterId, from: 'home', to: 'first', event: 'HIT', scored: false, earnedRun: false });
    } else if (info.category === 'OUT' || info.category === 'SAC') {
      // 出局 — 保留跑者（犧牲打可能有人進壘，但簡易版不自動推進）
      newRunners.first = runners.first;
      newRunners.second = runners.second;
      newRunners.third = runners.third;
    } else {
      // 其他（野手選擇、失誤等）
      newRunners.first = batterId;
      newRunners.second = runners.first || runners.second;
      newRunners.third = runners.second || runners.third;
    }

    return { newRunners, movements, runs };
  }

  /**
   * 判定半局是否結束
   */
  static isHalfInningOver(outs) {
    return outs >= 3;
  }

  /**
   * 判定比賽是否結束
   */
  static isGameOver(inning, halfInning, totalInnings, awayScore, homeScore) {
    // Bottom of regulation or extra inning
    if (inning >= totalInnings && halfInning === HALF_INNING.BOTTOM) {
      // Game over if either team leads (walk-off or regulation end)
      // Continues only if tied (extra innings)
      return awayScore !== homeScore;
    }
    // After top of any inning: home still bats, game continues
    return false;
  }
}
