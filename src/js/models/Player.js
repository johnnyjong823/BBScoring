/**
 * BBScoring — Player 球員資料模型
 */
import { generateId } from '../utils/helpers.js';

export function createPlayer({
  number,
  name = '',
  bats = 'R',
  throws = 'R',
  position = [],
  notes = '',
  isTemporary = false
} = {}) {
  return {
    id: generateId('player'),
    number,
    name,
    bats,          // L / R / S
    throws,        // L / R
    position: Array.isArray(position) ? position : [position],
    notes,
    isTemporary    // Quick Start 模式下為 true，僅有背號
  };
}
