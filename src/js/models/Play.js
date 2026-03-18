/**
 * BBScoring — Play (AtBat / Pitch) 資料模型
 */
import { generateId, getTimestamp } from '../utils/helpers.js';

export function createPitch({ number, result }) {
  return {
    number,
    result,
    speed: null,
    type: null,
    timestamp: getTimestamp()
  };
}

export function createAtBat({ inning, halfInning, batterId, pitcherId, orderPosition }) {
  return {
    id: generateId('ab'),
    inning,
    halfInning,
    batterId,
    pitcherId,
    orderPosition,
    pitchCount: 0,
    pitches: [],
    result: null,
    runnerMovements: [],
    events: [],
    isModified: false,
    modifiedAt: null,
    notes: ''
  };
}

export function createHitResult({
  type,
  hitType = null,
  direction = null,
  fieldingPath = [],
  rbi = 0,
  isError = false,
  errorFielder = null,
  errorType = null
} = {}) {
  return {
    type,
    hitType,
    direction: direction || { zone: null, subZone: null, x: null, y: null },
    fieldingPath,
    rbi,
    isError,
    errorFielder,
    errorType
  };
}

export function createRunnerMovement({ runnerId, from, to, event, scored = false, earnedRun = false }) {
  return { runnerId, from, to, event, scored, earnedRun };
}
