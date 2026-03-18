/**
 * BBScoring — Player 球員資料模型
 */
import { generateId } from '../utils/helpers.js';

export function createPlayer({ number, name, bats = 'R', throws = 'R', position = [], notes = '' } = {}) {
  return {
    id: generateId('player'),
    number,
    name,
    bats,      // L / R / S
    throws,    // L / R
    position: Array.isArray(position) ? position : [position],
    notes
  };
}
