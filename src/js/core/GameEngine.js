/**
 * BBScoring — GameEngine 比賽引擎（狀態機）
 */
import { GAME_STATUS, HALF_INNING, PITCH_RESULTS, PITCH_RESULTS_INFO, HIT_RESULTS, HIT_RESULTS_INFO, ACTION_TYPES, RECORDING_MODE } from '../utils/constants.js';
import { deepClone, getTimestamp } from '../utils/helpers.js';
import { createInning } from '../models/Inning.js';
import { PlayRecorder } from './PlayRecorder.js';
import { RunnerManager } from './RunnerManager.js';
import { RulesEngine } from './RulesEngine.js';
import { UndoManager } from './UndoManager.js';

export class GameEngine {
  constructor() {
    this.game = null;
    this.recorder = new PlayRecorder();
    this.runnerMgr = null;
    this.undoMgr = new UndoManager();
    this.listeners = {};
  }

  // ===================== 事件系統 =====================
  on(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  off(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(f => f !== fn);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(fn => fn(data));
  }

  // ===================== 生命週期 =====================

  /** 載入比賽 */
  loadGame(game) {
    this.game = game;
    this.runnerMgr = new RunnerManager(game.currentState);
    if (game.history && game.historyIndex !== undefined) {
      this.undoMgr.loadFrom({ stack: game.history, index: game.historyIndex });
    }
    this.emit('gameLoaded', game);
  }

  /** 取得目前比賽 */
  getGame() {
    return this.game;
  }

  /** 開始比賽 */
  startGame() {
    if (!this.game) return;
    this.game.info.status = GAME_STATUS.IN_PROGRESS;
    this.game.currentState.inning = 1;
    this.game.currentState.halfInning = HALF_INNING.TOP;
    this.game.currentState.outs = 0;
    this.game.currentState.balls = 0;
    this.game.currentState.strikes = 0;
    this.game.currentState.battingTeam = 'away';
    this.game.currentState.fieldingTeam = 'home';
    this.game.currentState.currentBatterIndex = 0;
    this.game.currentState.awayBatterIndex = 0;
    this.game.currentState.homeBatterIndex = 0;

    // 設定先發投手
    const homePitcher = this.game.lineups.home.pitcher;
    if (homePitcher) {
      this.game.currentState.currentPitcherId = homePitcher.playerId;
    }

    this._startNewAtBat();
    this._save();
    this.emit('gameStarted', this.game);
  }

  // ===================== 投球記錄 =====================

  /** 記錄一球 */
  recordPitch(pitchResult) {
    if (!this.game || this.game.info.status !== GAME_STATUS.IN_PROGRESS) return;

    const beforeState = deepClone(this.game.currentState);
    const beforeAtBat = deepClone(this.recorder.getCurrentAtBat());
    const beforeInnings = deepClone(this.game.innings);

    // 記錄這球
    this.recorder.recordPitch(pitchResult);

    const pitchInfo = PITCH_RESULTS_INFO[pitchResult];

    // 觸身球 / 故意四壞 / 捕手妨礙 — 直接結束打席
    if (pitchInfo && pitchInfo.endAtBat) {
      if (pitchResult === 'HBP') {
        this.recorder.setHBP();
      } else if (pitchResult === 'IBB') {
        // IBB: 補足壞球到 4 顆（如原本 1 壞球則 +3）
        this.game.currentState.balls = 4;
        this.recorder.setIBB();
      } else if (pitchResult === 'CI') {
        this.recorder.setResult('CI');
      }
      const { movements, runs } = this._autoAdvance(pitchInfo.result, this.recorder.getCurrentAtBat().batterId);
      this.recorder.setRunnerMovements(movements);
      this._addRuns(runs);
      this._finishAtBat();
      this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
      this._save();
      this.emit('pitchRecorded', { result: pitchResult, endAtBat: true });
      return;
    }

    // 暴投 / 捕逸 / 投手犯規 — 壘上跑者推進，球數也計算
    if (pitchResult === 'WP' || pitchResult === 'PB' || pitchResult === 'BK') {
      const event = pitchResult;

      // BK/WP/PB: 壘上有無人的判斷是在投球當下
      const hadRunners = this.runnerMgr.hasRunners();

      if (hadRunners && (pitchResult === 'WP' || pitchResult === 'PB')) {
        // WP/PB with runners: check if this causes a walk first
        this.game.currentState.balls++;
        if (this.game.currentState.balls >= 4) {
          // Ball 4 walk — process walk first, then show modal for extra runner advancement
          this.recorder.setWalk();
          const { movements, runs } = this._autoAdvance('BB', this.recorder.getCurrentAtBat().batterId);
          this.recorder.setRunnerMovements(movements);
          this._addRuns(runs);
          this._finishAtBat();
          this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
          this._save();
          // Still show advancement modal — runners may advance extra on the misplay
          this.emit('pitchRecorded', { result: pitchResult, endAtBat: true, needsAdvancement: true });
          return;
        }
        // Not ball 4: defer advancement to UI modal
        this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
        this._save();
        this.emit('pitchRecorded', { result: pitchResult, needsAdvancement: true });
        return;
      }

      if (hadRunners && pitchResult === 'BK') {
        // BK with runners: auto-advance 1 base, 不計壞球
        const { movements, runs } = this.runnerMgr.advanceAllRunners(event);
        this._addRuns(runs);
        const ab = this.recorder.getCurrentAtBat();
        if (ab) {
          ab.events.push({
            pitchNumber: ab.pitchCount,
            type: event,
            runnerId: null,
            from: null,
            to: null,
            description: PITCH_RESULTS_INFO[pitchResult].name
          });
          movements.forEach(m => ab.runnerMovements.push(m));
        }
        // Walk-off check for BK scoring
        if (runs > 0) {
          const st = this.game.currentState;
          if (st.halfInning === HALF_INNING.BOTTOM &&
              st.inning >= this.game.info.totalInnings &&
              st.score.home > st.score.away) {
            this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
            this._save();
            this.endGame();
            this.emit('pitchRecorded', { result: pitchResult });
            return;
          }
        }
      }

      // 壘上無人：WP/PB/BK 都計壞球
      if (!hadRunners) {
        this.game.currentState.balls++;
        if (this.game.currentState.balls >= 4) {
          this.recorder.setWalk();
          const { movements, runs } = this._autoAdvance('BB', this.recorder.getCurrentAtBat().batterId);
          this.recorder.setRunnerMovements(movements);
          this._addRuns(runs);
          this._finishAtBat();
        }
      }
      this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
      this._save();
      this.emit('pitchRecorded', { result: pitchResult });
      return;
    }

    // 妨礙守備 — UI 會彈 modal 選擇妨礙者並處理出局
    if (pitchResult === 'OI') {
      this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
      this._save();
      this.emit('pitchRecorded', { result: pitchResult, needsInterferenceModal: true });
      return;
    }

    // 妨礙跑壘 — UI 會彈 modal 選擇被妨礙跑者並處理進壘
    if (pitchResult === 'OBS') {
      this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
      this._save();
      this.emit('pitchRecorded', { result: pitchResult, needsObstructionModal: true });
      return;
    }

    // 打出去 — 等待打擊結果
    if (pitchResult === 'IP') {
      this.game.currentState.waitingForHitResult = true;
      this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
      this._save();
      this.emit('pitchRecorded', { result: pitchResult, needHitResult: true });
      return;
    }

    // 一般投球 — 更新球數
    const { strikes, balls, result } = RulesEngine.updateCount(
      this.game.currentState.strikes,
      this.game.currentState.balls,
      pitchResult
    );

    this.game.currentState.strikes = strikes;
    this.game.currentState.balls = balls;

    // 追蹤界外球次數
    if (pitchInfo && pitchInfo.category === 'FOUL') {
      this.game.currentState.fouls = (this.game.currentState.fouls || 0) + 1;
    }

    if (result === 'STRIKEOUT') {
      const looking = pitchResult === 'CS';
      // 不死三振條件: 非被判好球、非界外觸擊, 且一壘空或兩出局
      // FB (foul bunt) on 2 strikes = dead-ball strikeout, no dropped K possible
      const isFoulBunt = pitchResult === 'FB';
      const firstEmpty = !this.game.currentState.runners.first;
      const twoOuts = this.game.currentState.outs >= 2;
      const canDroppedK = !looking && !isFoulBunt && (firstEmpty || twoOuts);

      if (canDroppedK) {
        // 不直接記出局，改由 UI 確認是否為不死三振
        this.recorder.setStrikeout(looking);
        this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
        this._save();
        this.emit('pitchRecorded', { result: pitchResult, countResult: result, droppedThirdStrike: true });
        return;
      }
      // 正常三振
      this.recorder.setStrikeout(looking);
      this.game.currentState.outs++;
      this._finishAtBat();
    } else if (result === 'WALK') {
      // 四壞保送
      this.recorder.setWalk();
      const { movements, runs } = this._autoAdvance('BB', this.recorder.getCurrentAtBat().batterId);
      this.recorder.setRunnerMovements(movements);
      this._addRuns(runs);
      this._finishAtBat();
    }

    this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
    this._save();
    this.emit('pitchRecorded', { result: pitchResult, countResult: result });
  }

  // ===================== 不死三振 =====================

  /** 不死三振 — 打者三振但未被接住，跑上壘包 */
  applyDroppedThirdStrike(reached = true) {
    if (!this.game) return;
    const beforeState = deepClone(this.game.currentState);
    const beforeAtBat = deepClone(this.recorder.getCurrentAtBat());
    const beforeInnings = deepClone(this.game.innings);

    if (reached) {
      // 打者跑上一壘 (投手仍記三振，打者不記出局)
      const batterId = this.recorder.getCurrentAtBat().batterId;
      // If first base is occupied (2-out scenario), force-advance existing runner
      if (this.game.currentState.runners.first) {
        const existingRunner = this.game.currentState.runners.first;
        // Push existing runner to second (or further if second is occupied)
        if (!this.game.currentState.runners.second) {
          this.runnerMgr.moveRunner('first', 'second');
        } else if (!this.game.currentState.runners.third) {
          this.runnerMgr.moveRunner('first', 'third');
        }
        // Record the force-advance movement
        const ab = this.recorder.getCurrentAtBat();
        if (ab) {
          ab.runnerMovements.push({
            runnerId: existingRunner, from: 'first', to: this.game.currentState.runners.second === existingRunner ? 'second' : 'third',
            event: 'DROPPED_K', scored: false, earnedRun: false
          });
        }
      }
      this.runnerMgr.placeRunner('first', batterId);
      const ab = this.recorder.getCurrentAtBat();
      if (ab) {
        // result was already set by setStrikeout() — keep it as-is (proper createHitResult)
        // Just add the dropped K event
        ab.events.push({
          pitchNumber: ab.pitchCount,
          type: 'DROPPED_K',
          description: '不死三振 — 打者上壘'
        });
      }
      this._finishAtBat();
    } else {
      // 正常三振出局
      this.game.currentState.outs++;
      this._finishAtBat();
    }

    this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
    this._save();
    this.emit('pitchRecorded', { result: 'K', droppedK: reached });
  }

  // ===================== 妨礙守備 =====================

  /** 妨礙守備 — 妨礙者出局 */
  applyOffensiveInterference({ interfererId, interfererBase, additionalOuts = [] }) {
    if (!this.game) return;
    const beforeState = deepClone(this.game.currentState);
    const beforeAtBat = deepClone(this.recorder.getCurrentAtBat());
    const beforeInnings = deepClone(this.game.innings);

    // 妨礙者出局
    const allOuts = [{ id: interfererId, base: interfererBase }, ...additionalOuts];
    allOuts.forEach(o => {
      this.game.currentState.outs++;
      if (o.base && o.base !== 'batter') {
        this.runnerMgr.removeRunner(o.base);
      }
    });

    const ab = this.recorder.getCurrentAtBat();
    if (ab) {
      ab.events.push({
        pitchNumber: ab.pitchCount,
        type: 'OI',
        description: `妨礙守備 — ${interfererBase === 'batter' ? '打者' : interfererBase + '跑者'}出局`
      });
    }

    // 如果妨礙者是打者，結束打席 (handles 3-out check internally)
    if (interfererBase === 'batter') {
      this._finishAtBat();
    } else if (this.game.currentState.outs >= 3) {
      // Runner interference caused 3rd out — end half inning via _finishAtBat
      this._finishAtBat();
    }
    this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
    this._save();
    this.emit('stateChanged');
  }

  // ===================== 妨礙跑壘 =====================

  /** 妨礙跑壘 — 被妨礙跑者獲得進壘 */
  applyObstruction({ runnerId, runnerBase, advanceTo }) {
    if (!this.game) return;
    const beforeState = deepClone(this.game.currentState);
    const beforeAtBat = deepClone(this.recorder.getCurrentAtBat());
    const beforeInnings = deepClone(this.game.innings);

    let runs = 0;
    if (advanceTo === 'home') {
      this.runnerMgr.removeRunner(runnerBase);
      runs = 1;
    } else {
      // If destination is occupied, force-advance that runner first
      if (this.game.currentState.runners[advanceTo]) {
        const BASE_ORDER = ['first', 'second', 'third', 'home'];
        const destIdx = BASE_ORDER.indexOf(advanceTo);
        for (let i = destIdx; i < BASE_ORDER.length - 1; i++) {
          if (this.game.currentState.runners[BASE_ORDER[i]]) {
            const nextBase = BASE_ORDER[i + 1];
            if (nextBase === 'home') {
              this.runnerMgr.removeRunner(BASE_ORDER[i]);
              runs++;
            } else {
              this.runnerMgr.moveRunner(BASE_ORDER[i], nextBase);
            }
          }
        }
      }
      this.runnerMgr.moveRunner(runnerBase, advanceTo);
    }
    if (runs > 0) this._addRuns(runs);

    const ab = this.recorder.getCurrentAtBat();
    if (ab) {
      ab.events.push({
        pitchNumber: ab.pitchCount,
        type: 'OBS',
        runnerId,
        from: runnerBase,
        to: advanceTo,
        description: `妨礙跑壘 — ${runnerBase}跑者進${advanceTo}`
      });
      ab.runnerMovements.push({ runnerId, from: runnerBase, to: advanceTo, event: 'OBS', earnedRun: false });
    }

    this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat, beforeInnings);
    this._save();
    this.emit('stateChanged');
  }

  // ===================== 打擊結果 =====================

  /** 記錄打擊結果（打出去之後） */
  recordHitResult({ type, hitType, direction, fieldingPath, rbi, isError, errorFielder, errorType, runnerOverrides, advancement, advancementReason, scored, baseReached, fcOutOccurred, fcOutRunner }) {
    if (!this.game || !this.recorder.getCurrentAtBat()) return;

    const beforeState = deepClone(this.game.currentState);
    const beforeAtBat = deepClone(this.recorder.getCurrentAtBat());
    const beforeInnings = deepClone(this.game.innings);

    // 設定結果
    this.game.currentState.waitingForHitResult = false;
    this.recorder.setHitResult({ type, hitType, direction, fieldingPath, rbi: rbi || 0, isError, errorFielder, errorType });

    // 設定額外詳細資訊
    const ab = this.recorder.getCurrentAtBat();
    if (ab && ab.result) {
      if (advancement !== undefined) ab.result.advancement = advancement;
      if (advancementReason !== undefined) ab.result.advancementReason = advancementReason;
      if (scored !== undefined) ab.result.scored = scored;
      if (baseReached !== undefined) ab.result.baseReached = baseReached;
      if (fcOutOccurred !== undefined) ab.result.fcOutOccurred = fcOutOccurred;
      if (fcOutRunner !== undefined) ab.result.fcOutRunner = fcOutRunner;
    }

    // 出局 — when runnerOverrides provided, outs come from Phase B outcomes
    if (!runnerOverrides) {
      const outsAdded = RulesEngine.getOutsFromResult(type);
      this.game.currentState.outs += outsAdded;
    }

    // 跑壘
    if (!runnerOverrides) {
      const { newRunners, movements, runs } = RulesEngine.autoAdvanceRunners(
        this.game.currentState.runners,
        type,
        this.recorder.getCurrentAtBat().batterId
      );
      this.runnerMgr.setRunners(newRunners);
      this.recorder.setRunnerMovements(movements);

      // 計算 RBI
      if (!rbi && runs > 0) {
        const info = HIT_RESULTS_INFO[type];
        // 失誤上壘不計打點、雙殺不計打點
        if (info && info.category !== 'ERROR' && type !== 'DP') {
          this.recorder.getCurrentAtBat().result.rbi = runs;
        }
      }

      this._addRuns(runs);
    } else {
      // Phase B: manual runner overrides
      const batterId = this.recorder.getCurrentAtBat().batterId;

      // Replace __batter__ placeholder with actual batterId
      const nr = { ...runnerOverrides.newRunners };
      for (const base of ['first', 'second', 'third']) {
        if (nr[base] === '__batter__') nr[base] = batterId;
      }
      const mvts = runnerOverrides.movements.map(m => ({
        ...m,
        runnerId: m.runnerId === '__batter__' ? batterId : m.runnerId
      }));

      // Count outs from movements
      const outsFromOverrides = mvts.filter(m => m.out).length;
      this.game.currentState.outs += outsFromOverrides;

      this.runnerMgr.setRunners(nr);
      this.recorder.setRunnerMovements(mvts);
      this._addRuns(runnerOverrides.runs || 0);
    }

    // 安打統計
    const currentHalf = this._getCurrentHalfInning();
    if (RulesEngine.isHit(type) && currentHalf) {
      currentHalf.hits++;
    }
    if (isError && currentHalf) {
      currentHalf.errors++;
    }

    this._finishAtBat();
    this._pushHistory(ACTION_TYPES.RECORD_HIT_RESULT, beforeState, beforeAtBat, beforeInnings);
    this._save();
    this.emit('hitResultRecorded', { type });
  }

  // ===================== Result-Only 打席直接記錄 =====================

  /**
   * Record an at-bat result directly (Result-Only mode).
   * Skips pitch tracking entirely.
   * @param {object} opts
   * @param {string} opts.type - Result type (1B/2B/3B/HR/K/GO/FO/LO/DP/FC/SF/SAC/BB/IBB/HBP/E)
   * @param {number} [opts.rbi=0] - RBI count
   * @param {boolean} [opts.isError=false] - Whether this was an error
   * @param {object} [opts.runnerOverrides] - Manual runner positions
   */
  recordAtBatDirect({ type, rbi = 0, isError = false, runnerOverrides }) {
    if (!this.game || this.game.info.status !== GAME_STATUS.IN_PROGRESS) return;

    const beforeState = deepClone(this.game.currentState);
    const beforeAtBat = deepClone(this.recorder.getCurrentAtBat());
    const beforeInnings = deepClone(this.game.innings);

    // Mark the at-bat as Result-Only
    const atBat = this.recorder.getCurrentAtBat();
    if (atBat) {
      atBat.recordingMode = RECORDING_MODE.RESULT_ONLY;
    }

    // Handle walk/HBP/IBB as special cases (use existing methods)
    if (type === 'BB') {
      this.recorder.setWalk();
      const { movements, runs } = this._autoAdvance('BB', atBat.batterId);
      this.recorder.setRunnerMovements(movements);
      this._addRuns(runs);
      this._finishAtBat();
      this._pushHistory(ACTION_TYPES.RECORD_HIT_RESULT, beforeState, beforeAtBat, beforeInnings);
      this._save();
      this.emit('atBatDirectRecorded', { type });
      return;
    }

    if (type === 'IBB') {
      this.recorder.setIBB();
      const { movements, runs } = this._autoAdvance('BB', atBat.batterId);
      this.recorder.setRunnerMovements(movements);
      this._addRuns(runs);
      this._finishAtBat();
      this._pushHistory(ACTION_TYPES.RECORD_HIT_RESULT, beforeState, beforeAtBat, beforeInnings);
      this._save();
      this.emit('atBatDirectRecorded', { type });
      return;
    }

    if (type === 'HBP') {
      this.recorder.setHBP();
      const { movements, runs } = this._autoAdvance('HBP', atBat.batterId);
      this.recorder.setRunnerMovements(movements);
      this._addRuns(runs);
      this._finishAtBat();
      this._pushHistory(ACTION_TYPES.RECORD_HIT_RESULT, beforeState, beforeAtBat, beforeInnings);
      this._save();
      this.emit('atBatDirectRecorded', { type });
      return;
    }

    if (type === 'K') {
      this.recorder.setStrikeout(false);
      this.game.currentState.outs++;
      this._finishAtBat();
      this._pushHistory(ACTION_TYPES.RECORD_HIT_RESULT, beforeState, beforeAtBat, beforeInnings);
      this._save();
      this.emit('atBatDirectRecorded', { type });
      return;
    }

    // All other results: set hit result and process
    this.recorder.setHitResult({
      type,
      hitType: null,
      direction: null,
      fieldingPath: null,
      rbi: rbi || 0,
      isError: isError || type === 'E',
      errorFielder: null,
      errorType: null
    });

    // Outs
    const outsAdded = RulesEngine.getOutsFromResult(type);
    this.game.currentState.outs += outsAdded;

    // Runner advancement
    if (!runnerOverrides) {
      const { newRunners, movements, runs } = RulesEngine.autoAdvanceRunners(
        this.game.currentState.runners,
        type,
        atBat.batterId
      );
      this.runnerMgr.setRunners(newRunners);
      this.recorder.setRunnerMovements(movements);

      // Auto-calculate RBI if not specified
      if (!rbi && runs > 0 && !isError && type !== 'E' && type !== 'DP') {
        this.recorder.getCurrentAtBat().result.rbi = runs;
      } else if (rbi) {
        this.recorder.getCurrentAtBat().result.rbi = rbi;
      }

      this._addRuns(runs);
    } else {
      this.runnerMgr.setRunners(runnerOverrides.newRunners);
      this.recorder.setRunnerMovements(runnerOverrides.movements);
      this._addRuns(runnerOverrides.runs || 0);
    }

    // Hit/Error stats
    const currentHalf = this._getCurrentHalfInning();
    if (RulesEngine.isHit(type) && currentHalf) {
      currentHalf.hits++;
    }
    if ((isError || type === 'E') && currentHalf) {
      currentHalf.errors++;
    }

    this._finishAtBat();
    this._pushHistory(ACTION_TYPES.RECORD_HIT_RESULT, beforeState, beforeAtBat, beforeInnings);
    this._save();
    this.emit('atBatDirectRecorded', { type });
  }

  // ===================== 撤銷 / 重做 =====================

  undo() {
    const action = this.undoMgr.undo();
    if (!action) return false;

    // 恢復狀態
    this.game.currentState = deepClone(action.before.currentState);
    this.runnerMgr = new RunnerManager(this.game.currentState);

    // 恢復打席
    if (action.before.affectedAtBat) {
      this.recorder.loadAtBat(deepClone(action.before.affectedAtBat));
    }

    // 恢復局數記錄（簡化版：從 history 快照恢復）
    if (action.before.innings) {
      this.game.innings = deepClone(action.before.innings);
    }

    this._save();
    this.emit('undoPerformed', action);
    return true;
  }

  redo() {
    const action = this.undoMgr.redo();
    if (!action) return false;

    this.game.currentState = deepClone(action.after.currentState);
    this.runnerMgr = new RunnerManager(this.game.currentState);

    if (action.after.affectedAtBat) {
      this.recorder.loadAtBat(deepClone(action.after.affectedAtBat));
    }

    if (action.after.innings) {
      this.game.innings = deepClone(action.after.innings);
    }

    this._save();
    this.emit('redoPerformed', action);
    return true;
  }

  canUndo() { return this.undoMgr.canUndo(); }
  canRedo() { return this.undoMgr.canRedo(); }

  // ===================== 球員替換 =====================

  changePitcher(newPitcherId) {
    if (!this.game) return;
    const side = this.game.currentState.fieldingTeam;
    const lineup = this.game.lineups[side];
    const oldPitcherId = lineup.pitcher?.playerId;

    // Record the substitution for reentry tracking
    if (oldPitcherId && oldPitcherId !== newPitcherId) {
      lineup.substitutions.push({
        inning: this.game.currentState.inning,
        halfInning: this.game.currentState.halfInning,
        outs: this.game.currentState.outs,
        type: 'change-pitcher',
        playerIn: newPitcherId,
        playerOut: oldPitcherId,
        position: 'P'
      });
    }

    lineup.pitcher = { playerId: newPitcherId, isActive: true };
    this.game.currentState.currentPitcherId = newPitcherId;
    this._save();
    this.emit('pitcherChanged', { side, pitcherId: newPitcherId });
  }

  substitutePlayer({ type, playerInId, playerOutId, position, order, side }) {
    if (!this.game) return;
    const lineup = this.game.lineups[side];
    lineup.substitutions.push({
      inning: this.game.currentState.inning,
      halfInning: this.game.currentState.halfInning,
      outs: this.game.currentState.outs,
      type,
      playerIn: playerInId,
      playerOut: playerOutId,
      position,
      order
    });

    // 更新先發列表
    const starter = lineup.starters.find(s => s.playerId === playerOutId);
    if (starter) {
      starter.playerId = playerInId;
      starter.isActive = true;
      if (position) starter.position = position;
    }

    this._save();
    this.emit('playerSubstituted', { type, playerInId, playerOutId });
  }

  /**
   * Batch defense changes — handle multiple substitutions and position swaps in one save.
   * @param {Array} changes - Array of change objects:
   *   { type: 'substitute', playerInId, playerOutId, position, order, side }
   *   { type: 'position-swap', playerAId, playerBId, side }
   *   { type: 'position-change', playerId, newPosition, side }
   */
  batchDefenseChange(changes) {
    if (!this.game || !changes.length) return;
    const state = this.game.currentState;

    for (const change of changes) {
      const lineup = this.game.lineups[change.side];

      if (change.type === 'substitute') {
        // Record substitution
        lineup.substitutions.push({
          inning: state.inning,
          halfInning: state.halfInning,
          outs: state.outs,
          type: 'defense-sub',
          playerIn: change.playerInId,
          playerOut: change.playerOutId,
          position: change.position,
          order: change.order
        });

        // Update starters
        const starter = lineup.starters.find(s => s.playerId === change.playerOutId);
        if (starter) {
          starter.playerId = change.playerInId;
          starter.isActive = true;
          if (change.position) starter.position = change.position;
        }

        // If replacing the current pitcher
        if (lineup.pitcher?.playerId === change.playerOutId) {
          lineup.pitcher.playerId = change.playerInId;
        }
      } else if (change.type === 'position-swap') {
        const starterA = lineup.starters.find(s => s.playerId === change.playerAId);
        const starterB = lineup.starters.find(s => s.playerId === change.playerBId);
        if (starterA && starterB) {
          const tmpPos = starterA.position;
          starterA.position = starterB.position;
          starterB.position = tmpPos;
        }
        // If one of them is pitcher, update pitcher record
        if (lineup.pitcher?.playerId === change.playerAId) {
          lineup.pitcher.playerId = change.playerBId;
          state.currentPitcherId = change.playerBId;
        } else if (lineup.pitcher?.playerId === change.playerBId) {
          lineup.pitcher.playerId = change.playerAId;
          state.currentPitcherId = change.playerAId;
        }
      } else if (change.type === 'position-change') {
        const starter = lineup.starters.find(s => s.playerId === change.playerId);
        if (starter) {
          // If becoming new pitcher
          if (change.newPosition === 'P') {
            const oldPitcherId = lineup.pitcher?.playerId;
            lineup.pitcher = { playerId: change.playerId, isActive: true };
            state.currentPitcherId = change.playerId;
            // Record pitcher change substitution
            if (oldPitcherId && oldPitcherId !== change.playerId) {
              lineup.substitutions.push({
                inning: state.inning,
                halfInning: state.halfInning,
                outs: state.outs,
                type: 'change-pitcher',
                playerIn: change.playerId,
                playerOut: oldPitcherId,
                position: 'P'
              });
            }
          }
          starter.position = change.newPosition;
        }
      }
    }

    this._save();
    this.emit('defenseChanged', { changes });
  }

  /**
   * Check if the batting team had pinch-hit/pinch-run this half inning
   */
  hasPendingDefenseConfirmation() {
    if (!this.game) return false;
    const state = this.game.currentState;
    // The team that was batting is now fielding, check their lineup for PH/PR this half
    const fieldingSide = state.fieldingTeam;
    const lineup = this.game.lineups[fieldingSide];
    return lineup.substitutions.some(sub =>
      sub.inning === state.inning &&
      sub.halfInning === state.halfInning &&
      (sub.type === 'pinch-hit' || sub.type === 'pinch-run')
    );
  }

  // ===================== 比賽控制 =====================

  endGame() {
    if (!this.game) return;
    this.game.info.status = GAME_STATUS.FINISHED;
    this.game.updatedAt = getTimestamp();
    this._save();
    this.emit('gameEnded', this.game);
  }

  suspendGame() {
    if (!this.game) return;
    this.game.info.status = GAME_STATUS.SUSPENDED;
    this._save();
    this.emit('gameSuspended', this.game);
  }

  // ===================== 查詢 =====================

  /** 取得目前打者資訊 */
  getCurrentBatter() {
    if (!this.game) return null;
    const side = this.game.currentState.battingTeam;
    const lineup = this.game.lineups[side];
    if (!lineup || !lineup.starters.length) return null;
    const idx = this.game.currentState.currentBatterIndex;
    const starter = lineup.starters[idx];
    if (!starter) return null;
    const team = this.game.teams[side];
    return team ? team.players.find(p => p.id === starter.playerId) : null;
  }

  /** 取得目前投手資訊 */
  getCurrentPitcher() {
    if (!this.game) return null;
    const side = this.game.currentState.fieldingTeam;
    const team = this.game.teams[side];
    if (!team) return null;
    return team.players.find(p => p.id === this.game.currentState.currentPitcherId) || null;
  }

  /** 取得壘上跑者資訊 */
  getRunnersInfo() {
    if (!this.game) return { first: null, second: null, third: null };
    const runners = this.game.currentState.runners;
    const getPlayer = (id) => {
      if (!id) return null;
      const away = this.game.teams.away?.players.find(p => p.id === id);
      if (away) return away;
      return this.game.teams.home?.players.find(p => p.id === id) || null;
    };
    return {
      first: getPlayer(runners.first),
      second: getPlayer(runners.second),
      third: getPlayer(runners.third)
    };
  }

  // ===================== 內部方法 =====================

  _startNewAtBat() {
    const state = this.game.currentState;
    const side = state.battingTeam;
    const lineup = this.game.lineups[side];
    const starter = lineup.starters[state.currentBatterIndex];
    const pitcherId = state.currentPitcherId;

    state.balls = 0;
    state.strikes = 0;
    state.fouls = 0;

    this.recorder.startAtBat({
      inning: state.inning,
      halfInning: state.halfInning,
      batterId: starter ? starter.playerId : null,
      pitcherId,
      orderPosition: state.currentBatterIndex + 1
    });

    this.emit('newAtBat', {
      batter: this.getCurrentBatter(),
      pitcher: this.getCurrentPitcher()
    });
  }

  _finishAtBat() {
    const atBat = this.recorder.finishAtBat();
    if (!atBat) return;

    // 存入局數
    const half = this._getCurrentHalfInning();
    if (half) {
      half.atBats.push(atBat);
    }

    // 得分統計
    let runsThisAB = 0;
    atBat.runnerMovements.forEach(m => { if (m.scored) runsThisAB++; });
    if (half) half.runs += runsThisAB;

    // 殘壘
    if (half) half.leftOnBase = this.runnerMgr.runnersOnBase();

    // Walk-off: 下半局得分後主隊領先 → 比賽結束
    const state = this.game.currentState;
    if (runsThisAB > 0 && state.halfInning === HALF_INNING.BOTTOM &&
        state.inning >= this.game.info.totalInnings &&
        state.score.home > state.score.away) {
      this.endGame();
      return;
    }

    // 檢查三出局
    if (RulesEngine.isHalfInningOver(state.outs)) {
      this._endHalfInning();
      return;
    }

    // 下一位打者
    this._nextBatter();
    this._startNewAtBat();
  }

  _nextBatter() {
    const state = this.game.currentState;
    const lineup = this.game.lineups[state.battingTeam];
    state.currentBatterIndex = (state.currentBatterIndex + 1) % lineup.starters.length;
    // 同步到隊伍專屬索引
    if (state.battingTeam === 'away') {
      state.awayBatterIndex = state.currentBatterIndex;
    } else {
      state.homeBatterIndex = state.currentBatterIndex;
    }
  }

  _endHalfInning() {
    const state = this.game.currentState;

    // 檢查比賽結束
    if (RulesEngine.isGameOver(
      state.inning, state.halfInning, this.game.info.totalInnings,
      state.score.away, state.score.home
    )) {
      this.endGame();
      return;
    }

    // 偵測進攻方本半局是否有代打/代跑（該方下半局要守備確認）
    const battingSide = state.battingTeam;
    const battingLineup = this.game.lineups[battingSide];
    const hadPinchSub = battingLineup.substitutions.some(sub =>
      sub.inning === state.inning &&
      sub.halfInning === state.halfInning &&
      (sub.type === 'pinch-hit' || sub.type === 'pinch-run')
    );

    // 保存目前隊伍的「下一位打者」索引（第三出局打者已完成打席）
    const lineup = this.game.lineups[state.battingTeam];
    const nextIdx = (state.currentBatterIndex + 1) % lineup.starters.length;
    if (state.battingTeam === 'away') {
      state.awayBatterIndex = nextIdx;
    } else {
      state.homeBatterIndex = nextIdx;
    }

    if (state.halfInning === HALF_INNING.TOP) {
      // 切換到下半局
      state.halfInning = HALF_INNING.BOTTOM;
      state.battingTeam = 'home';
      state.fieldingTeam = 'away';
      // 切換投手
      const awayPitcher = this.game.lineups.away.pitcher;
      if (awayPitcher) state.currentPitcherId = awayPitcher.playerId;
    } else {
      // 切換到下一局上半
      state.inning++;
      state.halfInning = HALF_INNING.TOP;
      state.battingTeam = 'away';
      state.fieldingTeam = 'home';
      const homePitcher = this.game.lineups.home.pitcher;
      if (homePitcher) state.currentPitcherId = homePitcher.playerId;

      // 如果需要延長賽，新增局數
      if (state.inning > this.game.innings.length) {
        this.game.innings.push(createInning(state.inning));
      }
    }

    state.outs = 0;
    this.runnerMgr.clearBases();
    // 恢復新攻擊隊的打者索引
    state.currentBatterIndex = state.battingTeam === 'away'
      ? (state.awayBatterIndex || 0)
      : (state.homeBatterIndex || 0);
    this._startNewAtBat();
    this.emit('halfInningChanged', { inning: state.inning, half: state.halfInning });

    // 如果進攻方有代打/代跑，提醒守備確認
    if (hadPinchSub) {
      this.emit('needsDefenseConfirmation', { side: battingSide });
    }
  }

  _getCurrentHalfInning() {
    const state = this.game.currentState;
    const inning = this.game.innings[state.inning - 1];
    if (!inning) return null;
    return state.halfInning === HALF_INNING.TOP ? inning.top : inning.bottom;
  }

  _autoAdvance(resultType, batterId) {
    const { newRunners, movements, runs } = RulesEngine.autoAdvanceRunners(
      this.game.currentState.runners, resultType, batterId
    );
    this.runnerMgr.setRunners(newRunners);
    return { movements, runs };
  }

  _addRuns(runs) {
    if (runs <= 0) return;
    const side = this.game.currentState.battingTeam;
    this.game.currentState.score[side] += runs;
    this.emit('scoreChanged', { side, runs, total: this.game.currentState.score });
  }

  _pushHistory(type, beforeState, beforeAtBat, beforeInnings) {
    const action = {
      id: `action_${Date.now()}`,
      type,
      timestamp: getTimestamp(),
      description: '',
      before: {
        currentState: beforeState,
        affectedAtBat: beforeAtBat,
        innings: beforeInnings || deepClone(this.game.innings)
      },
      after: {
        currentState: deepClone(this.game.currentState),
        affectedAtBat: deepClone(this.recorder.getCurrentAtBat()),
        innings: deepClone(this.game.innings)
      }
    };
    this.undoMgr.push(action);
    this.game.history = this.undoMgr.toJSON().stack;
    this.game.historyIndex = this.undoMgr.toJSON().index;
  }

  _save() {
    if (!this.game) return;
    this.game.updatedAt = getTimestamp();
    this.emit('stateChanged', this.game);
    this.emit('save', this.game);
  }
}
