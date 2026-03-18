/**
 * BBScoring — Game 比賽資料模型
 */
import { generateId, getTimestamp, getTodayStr, getNowTimeStr } from '../utils/helpers.js';
import { createInning } from './Inning.js';
import { GAME_STATUS, HALF_INNING } from '../utils/constants.js';

export function createGame({
  name = '',
  date = '',
  time = '',
  venue = '',
  totalInnings = 9,
  notes = ''
} = {}) {
  const id = generateId('game');
  const now = getTimestamp();

  // 初始化局數
  const innings = [];
  for (let i = 1; i <= totalInnings; i++) {
    innings.push(createInning(i));
  }

  return {
    id,
    version: 1,
    createdAt: now,
    updatedAt: now,

    info: {
      date: date || getTodayStr(),
      time: time || getNowTimeStr(),
      name,
      venue,
      totalInnings,
      status: GAME_STATUS.SETUP,
      notes
    },

    teams: {
      away: null,
      home: null
    },

    lineups: {
      away: createLineup(),
      home: createLineup()
    },

    innings,

    currentState: {
      inning: 1,
      halfInning: HALF_INNING.TOP,
      outs: 0,
      balls: 0,
      strikes: 0,
      battingTeam: 'away',
      fieldingTeam: 'home',
      currentBatterIndex: 0,
      currentPitcherId: null,
      runners: {
        first: null,
        second: null,
        third: null
      },
      score: {
        away: 0,
        home: 0
      }
    },

    history: [],
    historyIndex: -1
  };
}

export function createLineup(teamId = null) {
  return {
    teamId,
    starters: [],    // { order, playerId, position, isActive }
    pitcher: null,    // { playerId, isActive }
    substitutions: []
  };
}
