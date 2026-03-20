/**
 * BBScoring — Tournament 聯賽/賽事資料模型
 */
import { generateId, getTimestamp } from '../utils/helpers.js';
import { TOURNAMENT_TYPE, TOURNAMENT_STATUS } from '../utils/constants.js';

export function createTournament({
  name = '',
  season = '',
  type = TOURNAMENT_TYPE.LEAGUE,
  settings = {}
} = {}) {
  return {
    id: generateId('tournament'),
    name,
    season,
    type,
    status: TOURNAMENT_STATUS.ACTIVE,
    createdAt: getTimestamp(),
    updatedAt: getTimestamp(),

    settings: {
      totalInnings: settings.totalInnings || 9,
      dhRule: settings.dhRule || false,
      mercyRule: settings.mercyRule || { enabled: false, runDiff: 10, afterInning: 5 },
      defaultRecordingMode: settings.defaultRecordingMode || 'DETAILED'
    },

    teams: [],
    // [{ teamId, name, roster: Player[] }]

    schedule: [],
    // [{ matchId, round, awayTeamId, homeTeamId, date, time, venue, gameId, status }]

    standings: []
    // 由 TournamentStandings 計算器產生
  };
}
