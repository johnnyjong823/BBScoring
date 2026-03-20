/**
 * BBScoring — RunnerManager 跑壘管理器
 */

export class RunnerManager {
  constructor(gameState) {
    this.state = gameState; // reference to game.currentState
  }

  getRunners() {
    return { ...this.state.runners };
  }

  setRunners(runners) {
    this.state.runners.first = runners.first || null;
    this.state.runners.second = runners.second || null;
    this.state.runners.third = runners.third || null;
  }

  clearBases() {
    this.state.runners.first = null;
    this.state.runners.second = null;
    this.state.runners.third = null;
  }

  /** 推進跑者（暴投/捕逸/投手犯規） */
  advanceAllRunners(event) {
    const movements = [];
    let runs = 0;

    if (this.state.runners.third) {
      movements.push({
        runnerId: this.state.runners.third,
        from: 'third', to: 'home', event, scored: true, earnedRun: event !== 'ERROR'
      });
      runs++;
    }

    const newThird = this.state.runners.second || null;
    const newSecond = this.state.runners.first || null;

    if (this.state.runners.second) {
      movements.push({
        runnerId: this.state.runners.second,
        from: 'second', to: 'third', event, scored: false, earnedRun: false
      });
    }
    if (this.state.runners.first) {
      movements.push({
        runnerId: this.state.runners.first,
        from: 'first', to: 'second', event, scored: false, earnedRun: false
      });
    }

    this.state.runners.third = newThird;
    this.state.runners.second = newSecond;
    this.state.runners.first = null;

    return { movements, runs };
  }

  /** 盜壘 */
  stealBase(runnerId, from, to) {
    if (from === 'first' && this.state.runners.first === runnerId) {
      this.state.runners.first = null;
      if (to === 'second') this.state.runners.second = runnerId;
    } else if (from === 'second' && this.state.runners.second === runnerId) {
      this.state.runners.second = null;
      if (to === 'third') this.state.runners.third = runnerId;
    } else if (from === 'third' && this.state.runners.third === runnerId) {
      this.state.runners.third = null;
      // 得分
    }
  }

  /** 盜壘失敗 / 牽制出局 — 移除跑者 */
  removeRunner(base) {
    this.state.runners[base] = null;
  }

  /** 放置跑者到指定壘包 */
  placeRunner(base, runnerId) {
    this.state.runners[base] = runnerId;
  }

  /** 移動跑者 (from → to) */
  moveRunner(from, to) {
    const runnerId = this.state.runners[from];
    if (!runnerId) return;
    this.state.runners[from] = null;
    if (to !== 'home') this.state.runners[to] = runnerId;
    return runnerId;
  }

  /**
   * 自訂推進跑者 (WP/PB/BK 時由 UI 指定每位跑者前進幾個壘包)
   * @param {Array} advances - [{from:'first', bases:1}, {from:'second', bases:2}, ...]
   *   bases = 0 means no advance, 1=one base, 2=two bases, 3=score from first, etc.
   * @param {string} event - 'WP', 'PB', 'BK'
   * @returns {{ movements: Array, runs: number }}
   */
  applyCustomAdvancement(advances, event) {
    const BASE_ORDER = ['first', 'second', 'third', 'home'];
    const movements = [];
    let runs = 0;

    // Process from third→first to avoid conflicts
    const sorted = [...advances].sort((a, b) =>
      BASE_ORDER.indexOf(b.from) - BASE_ORDER.indexOf(a.from)
    );

    for (const { from, bases } of sorted) {
      if (bases <= 0) continue;
      const runnerId = this.state.runners[from];
      if (!runnerId) continue;

      const fromIdx = BASE_ORDER.indexOf(from);
      const toIdx = Math.min(fromIdx + bases, 3); // cap at home
      const to = BASE_ORDER[toIdx];
      const scored = to === 'home';

      this.state.runners[from] = null;
      if (!scored) this.state.runners[to] = runnerId;

      movements.push({
        runnerId, from, to, event,
        scored,
        earnedRun: scored && event !== 'ERROR'
      });
      if (scored) runs++;
    }
    return { movements, runs };
  }

  hasRunners() {
    return !!(this.state.runners.first || this.state.runners.second || this.state.runners.third);
  }

  /** 取得壘上跑者數 */
  runnersOnBase() {
    let count = 0;
    if (this.state.runners.first) count++;
    if (this.state.runners.second) count++;
    if (this.state.runners.third) count++;
    return count;
  }
}
