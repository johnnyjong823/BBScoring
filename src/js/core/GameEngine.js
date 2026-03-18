/**
 * BBScoring — GameEngine 比賽引擎（狀態機）
 */
import { GAME_STATUS, HALF_INNING, PITCH_RESULTS, PITCH_RESULTS_INFO, HIT_RESULTS, HIT_RESULTS_INFO, ACTION_TYPES } from '../utils/constants.js';
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

    // 記錄這球
    this.recorder.recordPitch(pitchResult);

    const pitchInfo = PITCH_RESULTS_INFO[pitchResult];

    // 觸身球 / 故意四壞 — 直接結束打席
    if (pitchInfo && pitchInfo.endAtBat) {
      if (pitchResult === 'HBP') {
        this.recorder.setHBP();
      } else if (pitchResult === 'IBB') {
        this.recorder.setIBB();
      }
      const { movements, runs } = this._autoAdvance(pitchInfo.result, this.recorder.getCurrentAtBat().batterId);
      this.recorder.setRunnerMovements(movements);
      this._addRuns(runs);
      this._finishAtBat();
      this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat);
      this._save();
      this.emit('pitchRecorded', { result: pitchResult, endAtBat: true });
      return;
    }

    // 暴投 / 捕逸 / 投手犯規 — 壘上跑者推進，球數也計算
    if (pitchResult === 'WP' || pitchResult === 'PB' || pitchResult === 'BK') {
      const event = pitchResult;
      if (this.runnerMgr.hasRunners()) {
        const { movements, runs } = this.runnerMgr.advanceAllRunners(event);
        this._addRuns(runs);
        // 將事件記錄到打席
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
      }
      // BK 計壞球
      if (pitchResult === 'BK') {
        this.game.currentState.balls++;
        if (this.game.currentState.balls >= 4) {
          this.recorder.setWalk();
          const { movements, runs } = this._autoAdvance('BB', this.recorder.getCurrentAtBat().batterId);
          this.recorder.setRunnerMovements(movements);
          this._addRuns(runs);
          this._finishAtBat();
        }
      }
      this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat);
      this._save();
      this.emit('pitchRecorded', { result: pitchResult });
      return;
    }

    // 打出去 — 等待打擊結果
    if (pitchResult === 'IP') {
      this.game.currentState.waitingForHitResult = true;
      this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat);
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
      // 三振
      const looking = pitchResult === 'S';
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

    this._pushHistory(ACTION_TYPES.RECORD_PITCH, beforeState, beforeAtBat);
    this._save();
    this.emit('pitchRecorded', { result: pitchResult, countResult: result });
  }

  // ===================== 打擊結果 =====================

  /** 記錄打擊結果（打出去之後） */
  recordHitResult({ type, hitType, direction, fieldingPath, rbi, isError, errorFielder, errorType, runnerOverrides }) {
    if (!this.game || !this.recorder.getCurrentAtBat()) return;

    const beforeState = deepClone(this.game.currentState);
    const beforeAtBat = deepClone(this.recorder.getCurrentAtBat());

    // 設定結果
    this.game.currentState.waitingForHitResult = false;
    this.recorder.setHitResult({ type, hitType, direction, fieldingPath, rbi: rbi || 0, isError, errorFielder, errorType });

    // 出局
    const outsAdded = RulesEngine.getOutsFromResult(type);
    this.game.currentState.outs += outsAdded;

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
      // 手動指定跑壘
      this.runnerMgr.setRunners(runnerOverrides.newRunners);
      this.recorder.setRunnerMovements(runnerOverrides.movements);
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
    this._pushHistory(ACTION_TYPES.RECORD_HIT_RESULT, beforeState, beforeAtBat);
    this._save();
    this.emit('hitResultRecorded', { type });
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
    this.game.lineups[side].pitcher = { playerId: newPitcherId, isActive: true };
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

    // 檢查三出局
    if (RulesEngine.isHalfInningOver(this.game.currentState.outs)) {
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

  _pushHistory(type, beforeState, beforeAtBat) {
    const action = {
      id: `action_${Date.now()}`,
      type,
      timestamp: getTimestamp(),
      description: '',
      before: {
        currentState: beforeState,
        affectedAtBat: beforeAtBat,
        innings: deepClone(this.game.innings)
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
