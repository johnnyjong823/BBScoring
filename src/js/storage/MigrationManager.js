/**
 * BBScoring — MigrationManager 資料遷移管理器
 *
 * Handles migration of saved game data between schema versions.
 * All migrations are non-destructive and idempotent — fields are
 * added but never removed, and re-running is safe.
 */
import {
  DATA_VERSION,
  GAME_STATUS,
  START_MODE,
  RECORDING_MODE
} from '../utils/constants.js';

export class MigrationManager {

  // ===================== 版本偵測 =====================

  /**
   * Check if a game object needs migration to the current DATA_VERSION.
   * @param {object} game
   * @returns {boolean}
   */
  static needsMigration(game) {
    if (!game) return false;
    return (game.version || 1) < DATA_VERSION;
  }

  // ===================== 單場遷移 =====================

  /**
   * Migrate a single game object to the latest version (mutated in place).
   * Each step is guarded so partial / repeated runs are safe.
   * @param {object} game - The game object to migrate
   * @returns {object} The same game object, now at the latest version
   */
  static migrateGame(game) {
    if (!game) return game;

    const currentVersion = game.version || 1;

    // v1 → v2
    if (currentVersion < 2) {
      MigrationManager._migrateV1toV2(game);
    }

    // Future migrations (v2 → v3, etc.) go here

    return game;
  }

  // ===================== 批次遷移 =====================

  /**
   * Migrate every game stored in LocalStorage.
   * @param {import('./StorageManager.js').StorageManager} storage
   * @returns {number} Number of games that were migrated
   */
  static migrateAll(storage) {
    const games = storage.loadAllGames();
    let count = 0;

    for (const game of games) {
      if (MigrationManager.needsMigration(game)) {
        MigrationManager.migrateGame(game);
        storage.saveGameImmediate(game);
        count++;
      }
    }

    return count;
  }

  // ===================== 歸檔 =====================

  /**
   * Move completed (FINISHED) games from LocalStorage to IndexedDB.
   * The game is migrated to the latest version before archiving.
   * @param {import('./StorageManager.js').StorageManager} localStorage
   * @param {import('./IndexedDBManager.js').IndexedDBManager} indexedDB
   * @returns {Promise<number>} Number of games archived
   */
  static async archiveCompleted(localStorage, indexedDB) {
    const games = localStorage.loadAllGames();
    const finished = games.filter(
      g => g.info && g.info.status === GAME_STATUS.FINISHED
    );

    if (finished.length === 0) return 0;

    // Ensure every game is up-to-date before archiving
    for (const game of finished) {
      if (MigrationManager.needsMigration(game)) {
        MigrationManager.migrateGame(game);
      }
    }

    await indexedDB.putMany('games', finished);

    // Remove from LocalStorage only after a successful write
    for (const game of finished) {
      localStorage.deleteGame(game.id);
    }

    return finished.length;
  }

  // ===================== 私有方法 =====================

  /**
   * v1 → v2 migration.
   * Adds mode, version, tournament/match IDs, player flags, and
   * per-atBat recording mode.
   * @param {object} game
   * @private
   */
  static _migrateV1toV2(game) {
    // --- Top-level fields ---

    if (!game.mode) {
      game.mode = {
        startMode: START_MODE.QUICK,
        recordingMode: RECORDING_MODE.DETAILED
      };
    }

    if (game.tournamentId === undefined) {
      game.tournamentId = null;
    }
    if (game.matchId === undefined) {
      game.matchId = null;
    }

    // --- Players in both teams ---

    if (game.teams) {
      for (const side of ['away', 'home']) {
        const team = game.teams[side];
        if (team && Array.isArray(team.players)) {
          for (const player of team.players) {
            if (player.isTemporary === undefined) {
              player.isTemporary = false;
            }
          }
        }
      }
    }

    // --- AtBats in every inning half ---

    if (Array.isArray(game.innings)) {
      for (const inning of game.innings) {
        for (const half of ['top', 'bottom']) {
          const halfInning = inning[half];
          if (halfInning && Array.isArray(halfInning.atBats)) {
            for (const atBat of halfInning.atBats) {
              if (atBat.recordingMode === undefined) {
                atBat.recordingMode = RECORDING_MODE.DETAILED;
              }
            }
          }
        }
      }
    }

    // --- Stamp version last (so a crash mid-migration won't skip it) ---

    game.version = 2;
    game.updatedAt = new Date().toISOString();
  }
}
