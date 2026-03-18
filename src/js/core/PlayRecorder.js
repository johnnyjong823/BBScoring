/**
 * BBScoring — PlayRecorder 逐球記錄器
 */
import { createAtBat, createPitch, createHitResult } from '../models/Play.js';
import { getTimestamp } from '../utils/helpers.js';

export class PlayRecorder {
  constructor() {
    this.currentAtBat = null;
  }

  /** 開始新打席 */
  startAtBat({ inning, halfInning, batterId, pitcherId, orderPosition }) {
    this.currentAtBat = createAtBat({ inning, halfInning, batterId, pitcherId, orderPosition });
    return this.currentAtBat;
  }

  /** 記錄一球 */
  recordPitch(result) {
    if (!this.currentAtBat) return null;
    this.currentAtBat.pitchCount++;
    const pitch = createPitch({
      number: this.currentAtBat.pitchCount,
      result
    });
    this.currentAtBat.pitches.push(pitch);
    return pitch;
  }

  /** 設定打擊結果 */
  setHitResult({ type, hitType, direction, fieldingPath, rbi, isError, errorFielder, errorType }) {
    if (!this.currentAtBat) return;
    this.currentAtBat.result = createHitResult({
      type, hitType, direction, fieldingPath, rbi, isError, errorFielder, errorType
    });
  }

  /** 設定跑壘結果 */
  setRunnerMovements(movements) {
    if (!this.currentAtBat) return;
    this.currentAtBat.runnerMovements = movements;
  }

  /** 新增打席內特殊事件 */
  addEvent({ pitchNumber, type, runnerId, from, to, description }) {
    if (!this.currentAtBat) return;
    this.currentAtBat.events.push({ pitchNumber, type, runnerId, from, to, description });
  }

  /** 標記結果為三振 */
  setStrikeout(looking = false) {
    if (!this.currentAtBat) return;
    this.currentAtBat.result = createHitResult({ type: looking ? 'KL' : 'K' });
  }

  /** 標記結果為保送 */
  setWalk() {
    if (!this.currentAtBat) return;
    this.currentAtBat.result = createHitResult({ type: 'BB' });
  }

  /** 標記結果為觸身球 */
  setHBP() {
    if (!this.currentAtBat) return;
    this.currentAtBat.result = createHitResult({ type: 'HBP' });
  }

  /** 標記結果為故意四壞 */
  setIBB() {
    if (!this.currentAtBat) return;
    this.currentAtBat.result = createHitResult({ type: 'IBB' });
  }

  /** 完成打席 */
  finishAtBat() {
    const atBat = this.currentAtBat;
    this.currentAtBat = null;
    return atBat;
  }

  /** 取得目前打席 */
  getCurrentAtBat() {
    return this.currentAtBat;
  }

  /** 從存檔恢復 */
  loadAtBat(atBat) {
    this.currentAtBat = atBat;
  }
}
