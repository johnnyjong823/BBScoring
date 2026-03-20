/**
 * BBScoring — StorageManager 儲存管理器
 *
 * 統一介面，整合 LocalStorage（即時存取）與 IndexedDB（大量資料）。
 * - 進行中比賽、設定 → LocalStorage（同步、快速）
 * - 已完成比賽、聯賽、球隊範本 → IndexedDB（非同步、大容量）
 */
import { STORAGE_KEYS, DEFAULT_SETTINGS, GAME_STATUS } from '../utils/constants.js';
import { safeParse, debounce, getTimestamp } from '../utils/helpers.js';
import { IndexedDBManager } from './IndexedDBManager.js';
import { MigrationManager } from './MigrationManager.js';

export class StorageManager {
  constructor() {
    this._debouncedSave = debounce((key, data) => {
      this._write(key, data);
    }, 300);
    this.idb = new IndexedDBManager();
    this._idbReady = false;
  }

  /** 初始化（含 IndexedDB + 資料遷移） */
  async init() {
    // 初始化 IndexedDB
    if (this.idb.isSupported()) {
      try {
        await this.idb.init();
        this._idbReady = true;
      } catch (e) {
        console.warn('IndexedDB 初始化失敗，降級為 LocalStorage:', e);
      }
    }

    // 執行資料遷移 (v1 → v2)
    MigrationManager.migrateAll(this);

    // 將已完成比賽移至 IndexedDB
    if (this._idbReady) {
      await MigrationManager.archiveCompleted(this, this.idb);
    }
  }

  // ===================== 比賽 =====================

  /** 取得所有比賽 ID */
  getGameIds() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.GAMES), []);
  }

  /** 儲存比賽（防抖） */
  saveGame(game) {
    if (!game || !game.id) return;
    const ids = this.getGameIds();
    if (!ids.includes(game.id)) {
      ids.push(game.id);
      this._write(STORAGE_KEYS.GAMES, ids);
    }
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

  /** 載入比賽（先找 LocalStorage，再找 IndexedDB） */
  loadGame(gameId) {
    const local = safeParse(localStorage.getItem(STORAGE_KEYS.GAME + gameId), null);
    if (local) return local;
    return null; // IndexedDB 需用 async 版本
  }

  /** 載入比賽（async，包含 IndexedDB） */
  async loadGameAsync(gameId) {
    const local = this.loadGame(gameId);
    if (local) return local;
    if (this._idbReady) {
      return await this.idb.get('games', gameId) || null;
    }
    return null;
  }

  /** 載入所有比賽 */
  loadAllGames() {
    return this.getGameIds().map(id => this.loadGame(id)).filter(Boolean);
  }

  /** 載入所有比賽（async，含 IndexedDB 已封存比賽） */
  async loadAllGamesAsync() {
    const localGames = this.loadAllGames();
    if (this._idbReady) {
      const idbGames = await this.idb.getAll('games');
      // 合併，LocalStorage 優先（避免重複）
      const localIds = new Set(localGames.map(g => g.id));
      const merged = [...localGames];
      for (const g of idbGames) {
        if (!localIds.has(g.id)) merged.push(g);
      }
      return merged;
    }
    return localGames;
  }

  /** 刪除比賽 */
  deleteGame(gameId) {
    const ids = this.getGameIds().filter(id => id !== gameId);
    this._write(STORAGE_KEYS.GAMES, ids);
    localStorage.removeItem(STORAGE_KEYS.GAME + gameId);
  }

  /** 刪除比賽（async，含 IndexedDB） */
  async deleteGameAsync(gameId) {
    this.deleteGame(gameId);
    if (this._idbReady) {
      await this.idb.delete('games', gameId);
    }
  }

  // ===================== 聯賽 (IndexedDB) =====================

  /** 儲存聯賽 */
  async saveTournament(tournament) {
    if (!this._idbReady || !tournament) return;
    await this.idb.put('tournaments', tournament);
  }

  /** 載入聯賽 */
  async loadTournament(id) {
    if (!this._idbReady) return null;
    return await this.idb.get('tournaments', id) || null;
  }

  /** 載入所有聯賽 */
  async loadAllTournaments() {
    if (!this._idbReady) return [];
    return await this.idb.getAll('tournaments');
  }

  /** 刪除聯賽 */
  async deleteTournament(id) {
    if (!this._idbReady) return;
    await this.idb.delete('tournaments', id);
  }

  // ===================== 球隊範本 =====================

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

  /** 儲存球隊到 IndexedDB（聯賽用） */
  async saveTeamIDB(team) {
    if (!this._idbReady || !team) return;
    await this.idb.put('teams', team);
  }

  /** 載入所有 IndexedDB 球隊 */
  async loadAllTeamsIDB() {
    if (!this._idbReady) return [];
    return await this.idb.getAll('teams');
  }

  // ===================== 設定 =====================

  getSettings() {
    return { ...DEFAULT_SETTINGS, ...safeParse(localStorage.getItem(STORAGE_KEYS.SETTINGS), {}) };
  }

  saveSettings(settings) {
    this._write(STORAGE_KEYS.SETTINGS, settings);
  }

  // ===================== 使用者 =====================

  getRegisteredUsers() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.USERS), []);
  }

  findRegisteredUserByAccount(account) {
    const accountKey = this._normalizeKey(account);
    return this.getRegisteredUsers().find(user => user.accountKey === accountKey) || null;
  }

  findRegisteredUserByEmail(email) {
    const emailKey = this._normalizeKey(email);
    return this.getRegisteredUsers().find(user => user.emailKey === emailKey) || null;
  }

  saveRegisteredUser(user) {
    const users = this.getRegisteredUsers();
    const timestamp = getTimestamp();
    const nextUser = {
      ...user,
      accountKey: this._normalizeKey(user.account),
      emailKey: this._normalizeKey(user.email),
      updatedAt: timestamp
    };

    const idx = users.findIndex(existing => existing.id === nextUser.id);
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...nextUser };
    } else {
      users.push({
        ...nextUser,
        createdAt: nextUser.createdAt || timestamp
      });
    }

    this._write(STORAGE_KEYS.USERS, users);
    return nextUser;
  }

  // ===================== 登入身份 =====================

  getAuthSession() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.AUTH), null);
  }

  saveAuthSession(session) {
    if (!session) {
      localStorage.removeItem(STORAGE_KEYS.AUTH);
      return;
    }
    this._write(STORAGE_KEYS.AUTH, session);
  }

  clearAuthSession() {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
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

  async clearAllAsync() {
    this.clearAll();
    if (this._idbReady) {
      await this.idb.clear('games');
      await this.idb.clear('tournaments');
      await this.idb.clear('teams');
    }
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

  _normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
  }
}
