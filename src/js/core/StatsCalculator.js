/**
 * BBScoring — StatsCalculator 統計計算器
 */
import { HIT_RESULTS_INFO } from '../utils/constants.js';
import { formatIP } from '../utils/helpers.js';

export class StatsCalculator {

  /**
   * 計算單場打者統計
   * @param {Array} atBats — 該打者的所有打席
   * @returns {Object} 打擊統計
   */
  static calcBatterStats(atBats) {
    let pa = 0, ab = 0, h = 0, singles = 0, doubles = 0, triples = 0, hr = 0;
    let rbi = 0, runs = 0, bb = 0, k = 0, hbp = 0, sf = 0, sac = 0;

    atBats.forEach(atBat => {
      if (!atBat.result) return;
      pa++;
      const type = atBat.result.type;
      const info = HIT_RESULTS_INFO[type];
      if (!info) return;

      if (!info.noAB) ab++;
      if (info.category === 'HIT') {
        h++;
        if (info.bases === 1) singles++;
        else if (info.bases === 2) doubles++;
        else if (info.bases === 3) triples++;
        else if (info.bases === 4) hr++;
      }
      if (type === 'K' || type === 'KL') k++;
      if (type === 'BB' || type === 'IBB') bb++;
      if (type === 'HBP') hbp++;
      if (type === 'SF') sf++;
      if (type === 'SAC') sac++;
      if (atBat.result.rbi) rbi += atBat.result.rbi;

      // 得分計算 — 打者本人是否得分
      const selfMove = atBat.runnerMovements.find(m => m.runnerId === atBat.batterId);
      if (selfMove && selfMove.scored) runs++;
    });

    const tb = singles + doubles * 2 + triples * 3 + hr * 4;
    const avg = ab > 0 ? h / ab : 0;
    const obp = (ab + bb + hbp + sf) > 0 ? (h + bb + hbp) / (ab + bb + hbp + sf) : 0;
    const slg = ab > 0 ? tb / ab : 0;
    const ops = obp + slg;

    return {
      pa, ab, h, singles, doubles, triples, hr,
      rbi, runs, bb, k, hbp, sf, sac, tb,
      avg: avg.toFixed(3),
      obp: obp.toFixed(3),
      slg: slg.toFixed(3),
      ops: ops.toFixed(3)
    };
  }

  /**
   * 計算單場投手統計
   * @param {Array} atBats — 該投手面對的所有打席
   * @returns {Object} 投手統計
   */
  static calcPitcherStats(atBats) {
    let tbf = 0, np = 0, strikes = 0, balls = 0;
    let h = 0, hr = 0, bb = 0, k = 0, hbp = 0;
    let outsRecorded = 0, runs = 0, er = 0, wp = 0, bk = 0;

    atBats.forEach(atBat => {
      if (!atBat.result) return;
      tbf++;

      // 投球數
      atBat.pitches.forEach(p => {
        np++;
        if (['S', 'SS', 'F', 'FB', 'IP'].includes(p.result)) strikes++;
        else if (p.result === 'B') balls++;
        if (p.result === 'WP') wp++;
        if (p.result === 'BK') bk++;
      });

      const type = atBat.result.type;
      const info = HIT_RESULTS_INFO[type];
      if (!info) return;

      if (info.category === 'HIT') h++;
      if (type === 'HR') hr++;
      if (type === 'K' || type === 'KL') k++;
      if (type === 'BB' || type === 'IBB') bb++;
      if (type === 'HBP') hbp++;
      if (info.outs) outsRecorded += info.outs;

      // 失分
      atBat.runnerMovements.forEach(m => {
        if (m.scored) {
          runs++;
          if (m.earnedRun) er++;
        }
      });
    });

    const ip = formatIP(outsRecorded);
    const ipNum = outsRecorded / 3;
    const era = ipNum > 0 ? (er * 9) / ipNum : 0;
    const whip = ipNum > 0 ? (bb + h) / ipNum : 0;
    const k9 = ipNum > 0 ? (k * 9) / ipNum : 0;
    const bb9 = ipNum > 0 ? (bb * 9) / ipNum : 0;
    const spct = np > 0 ? (strikes / np * 100) : 0;

    return {
      tbf, np, strikes, balls, spct: spct.toFixed(1),
      ip, h, hr, bb, k, hbp, wp, bk,
      runs, er,
      era: era.toFixed(2),
      whip: whip.toFixed(2),
      k9: k9.toFixed(1),
      bb9: bb9.toFixed(1)
    };
  }

  /**
   * 取得球隊全部打者統計
   */
  static calcTeamBattingStats(game, teamSide) {
    const lineup = game.lineups[teamSide];
    if (!lineup) return [];

    const team = game.teams[teamSide];
    if (!team) return [];

    // 收集所有打席
    const allAtBats = [];
    game.innings.forEach(inn => {
      const half = teamSide === 'away' ? inn.top : inn.bottom;
      half.atBats.forEach(ab => allAtBats.push(ab));
    });

    // 按打者分組
    const playerMap = {};
    allAtBats.forEach(ab => {
      if (!playerMap[ab.batterId]) playerMap[ab.batterId] = [];
      playerMap[ab.batterId].push(ab);
    });

    return team.players
      .filter(p => playerMap[p.id])
      .map(p => ({
        player: p,
        stats: this.calcBatterStats(playerMap[p.id])
      }));
  }
}
