/**
 * BBScoring — StorageManager 儲存管理器
 */
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../utils/constants.js';
import { safeParse, debounce } from '../utils/helpers.js';

export class StorageManager {
  constructor() {
    this._debouncedSave = debounce((key, data) => {
      this._write(key, data);
    }, 300);
  }

  // ===================== 比賽 =====================

  /** 取得所有比賽 ID */
  getGameIds() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.GAMES), []);
  }

  /** 儲存比賽 */
  saveGame(game) {
    if (!game || !game.id) return;
    // 更新比賽清單
    const ids = this.getGameIds();
    if (!ids.includes(game.id)) {
      ids.push(game.id);
      this._write(STORAGE_KEYS.GAMES, ids);
    }
    // 儲存比賽資料（防抖）
    this._debouncedSave(STORAGE_KEYS.GAME + game.id, game);
  }

  /** 立即儲存比賽 */
  saveGameImmediate(game) {
    if (!game || !game.id) return;
    const ids = this.getGameIds();
    if (!ids.includes(game.id)) {
      ids.push(game.id);
      this._write(STORAGE_KEYS.GAMES, ids);
    }
    this._write(STORAGE_KEYS.GAME + game.id, game);
  }

  /** 載入比賽 */
  loadGame(gameId) {
    return safeParse(localStorage.getItem(STORAGE_KEYS.GAME + gameId), null);
  }

  /** 載入所有比賽 */
  loadAllGames() {
    return this.getGameIds().map(id => this.loadGame(id)).filter(Boolean);
  }

  /** 刪除比賽 */
  deleteGame(gameId) {
    const ids = this.getGameIds().filter(id => id !== gameId);
    this._write(STORAGE_KEYS.GAMES, ids);
    localStorage.removeItem(STORAGE_KEYS.GAME + gameId);
  }

  // ===================== 設定 =====================

  getSettings() {
    return { ...DEFAULT_SETTINGS, ...safeParse(localStorage.getItem(STORAGE_KEYS.SETTINGS), {}) };
  }

  saveSettings(settings) {
    this._write(STORAGE_KEYS.SETTINGS, settings);
  }

  // ===================== 隊伍範本 =====================

  getTeamTemplates() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.TEAMS), []);
  }

  saveTeamTemplate(team) {
    const teams = this.getTeamTemplates();
    const idx = teams.findIndex(t => t.id === team.id);
    if (idx >= 0) teams[idx] = team;
    else teams.push(team);
    this._write(STORAGE_KEYS.TEAMS, teams);
  }

  // ===================== 目前比賽 =====================

  setCurrentGameId(id) {
    localStorage.setItem(STORAGE_KEYS.CURRENT, id || '');
  }

  getCurrentGameId() {
    return localStorage.getItem(STORAGE_KEYS.CURRENT) || null;
  }

  // ===================== 清除 =====================

  clearAll() {
    const ids = this.getGameIds();
    ids.forEach(id => localStorage.removeItem(STORAGE_KEYS.GAME + id));
    localStorage.removeItem(STORAGE_KEYS.GAMES);
    localStorage.removeItem(STORAGE_KEYS.TEAMS);
    localStorage.removeItem(STORAGE_KEYS.CURRENT);
    // 保留 settings
  }

  // ===================== 內部 =====================

  _write(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('儲存失敗:', e);
      if (e.name === 'QuotaExceededError') {
        window.dispatchEvent(new CustomEvent('storageQuotaExceeded'));
      }
    }
  }
}
