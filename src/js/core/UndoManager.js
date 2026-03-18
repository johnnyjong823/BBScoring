/**
 * BBScoring — UndoManager 撤銷/重做管理
 */
import { deepClone } from '../utils/helpers.js';
import { MAX_UNDO } from '../utils/constants.js';

export class UndoManager {
  constructor() {
    this.stack = [];
    this.index = -1;
  }

  /** 推入一筆操作 */
  push(action) {
    // 如果不在堆疊頂端，丟棄後面的記錄
    if (this.index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.index + 1);
    }
    this.stack.push(deepClone(action));
    if (this.stack.length > MAX_UNDO) {
      this.stack.shift();
    } else {
      this.index++;
    }
  }

  /** 撤銷 — 回傳被撤銷的 action */
  undo() {
    if (!this.canUndo()) return null;
    const action = this.stack[this.index];
    this.index--;
    return deepClone(action);
  }

  /** 重做 — 回傳被重做的 action */
  redo() {
    if (!this.canRedo()) return null;
    this.index++;
    return deepClone(this.stack[this.index]);
  }

  canUndo() { return this.index >= 0; }
  canRedo() { return this.index < this.stack.length - 1; }

  clear() {
    this.stack = [];
    this.index = -1;
  }

  /** 序列化 */
  toJSON() {
    return { stack: this.stack, index: this.index };
  }

  /** 復原 */
  loadFrom(data) {
    if (data) {
      this.stack = data.stack || [];
      this.index = data.index ?? -1;
    }
  }
}
