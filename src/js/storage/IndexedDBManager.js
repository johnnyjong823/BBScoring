/**
 * BBScoring — IndexedDBManager 索引資料庫管理器
 *
 * Wraps the browser IndexedDB API with a clean async interface.
 * Used alongside the LocalStorage-based StorageManager for
 * structured, larger-capacity client-side persistence.
 */

const DB_NAME = 'bbscoring';
const DB_VERSION = 1;

/**
 * Object store schemas used during `onupgradeneeded`.
 * Each entry defines the keyPath and the indexes to create.
 * @type {Array<{name: string, keyPath: string, indexes: string[]}>}
 */
const STORES = [
  { name: 'games', keyPath: 'id', indexes: ['status', 'tournamentId', 'updatedAt'] },
  { name: 'tournaments', keyPath: 'id', indexes: ['status', 'name'] },
  { name: 'teams', keyPath: 'id', indexes: ['name'] },
];

export class IndexedDBManager {
  constructor() {
    /** @type {IDBDatabase|null} */
    this.db = null;
  }

  // ===================== 初始化 =====================

  /**
   * Open (or create) the database and set up object stores.
   * Safe to call multiple times — subsequent calls return the cached db.
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        for (const schema of STORES) {
          if (!db.objectStoreNames.contains(schema.name)) {
            const store = db.createObjectStore(schema.name, { keyPath: schema.keyPath });
            for (const idx of schema.indexes) {
              store.createIndex(idx, idx, { unique: false });
            }
          }
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB 開啟失敗:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // ===================== CRUD =====================

  /**
   * Insert or update a record in the given store.
   * @param {string} storeName
   * @param {Object} data — must contain the store's keyPath property
   * @returns {Promise<IDBValidKey>} the key of the written record
   */
  async put(storeName, data) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(data);
        request.onsuccess = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Get a single record by its primary key.
   * @param {string} storeName
   * @param {string} id
   * @returns {Promise<Object|undefined>}
   */
  async get(storeName, id) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Get all records from a store.
   * @param {string} storeName
   * @returns {Promise<Object[]>}
   */
  async getAll(storeName) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Delete a record by its primary key.
   * @param {string} storeName
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(storeName, id) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Remove all records from a store.
   * @param {string} storeName
   * @returns {Promise<void>}
   */
  async clear(storeName) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // ===================== 查詢 =====================

  /**
   * Get all records matching a value on a named index.
   * @param {string} storeName
   * @param {string} indexName
   * @param {*} value
   * @returns {Promise<Object[]>}
   */
  async getByIndex(storeName, indexName, value) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(value);
        request.onsuccess = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // ===================== 批次操作 =====================

  /**
   * Insert or update multiple items in a single transaction.
   * @param {string} storeName
   * @param {Object[]} items
   * @returns {Promise<void>}
   */
  async putMany(storeName, items) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const item of items) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // ===================== 工具 =====================

  /**
   * Count the number of records in a store.
   * @param {string} storeName
   * @returns {Promise<number>}
   */
  async count(storeName) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Check whether the current environment supports IndexedDB.
   * @returns {boolean}
   */
  isSupported() {
    return typeof indexedDB !== 'undefined';
  }

  // ===================== 內部 =====================

  /**
   * Ensure the database is open, initialising lazily if needed.
   * @returns {Promise<IDBDatabase>}
   * @private
   */
  async _ensureDB() {
    if (!this.db) {
      await this.init();
    }
    return this.db;
  }
}
