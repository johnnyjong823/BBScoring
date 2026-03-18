/**
 * BBScoring — Team 隊伍資料模型
 */
import { generateId } from '../utils/helpers.js';

export function createTeam({ name = '', shortName = '', color = '#2980b9', players = [] } = {}) {
  return {
    id: generateId('team'),
    name,
    shortName: shortName || name.substring(0, 2),
    color,
    players  // Player[]
  };
}
