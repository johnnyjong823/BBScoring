/**
 * BBScoring — Match 場次資料模型（屬於 Tournament）
 */
import { generateId } from '../utils/helpers.js';
import { MATCH_STATUS } from '../utils/constants.js';

export function createMatch({
  tournamentId,
  round = 1,
  awayTeamId = null,
  homeTeamId = null,
  date = '',
  time = '',
  venue = ''
} = {}) {
  return {
    matchId: generateId('match'),
    tournamentId,
    round,
    awayTeamId,
    homeTeamId,
    date,
    time,
    venue,
    gameId: null,        // 連結到實際 Game（比賽開始後填入）
    status: MATCH_STATUS.SCHEDULED
  };
}
