/**
 * BBScoring — App 入口 (主應用程式控制器)
 */
import { Router } from './router.js';
import { StorageManager } from './storage/StorageManager.js';
import { ExportManager } from './storage/ExportManager.js';
import { ImportManager } from './storage/ImportManager.js';
import { GameEngine } from './core/GameEngine.js';
import { GameSetup } from './ui/GameSetup.js';
import { LiveRecord } from './ui/LiveRecord.js';
import { StatsView } from './ui/StatsView.js';
import { HistoryPanel } from './ui/HistoryPanel.js';
import { createElement, showToast, showConfirm, formatDate, formatTime } from './utils/helpers.js';
import { GAME_STATUS, DEFAULT_SETTINGS } from './utils/constants.js';

class App {
  constructor() {
    this.router = new Router();
    this.storage = new StorageManager();
    this.engine = null;
    this.container = null;
    this.settings = { ...DEFAULT_SETTINGS };
  }

  /** 初始化應用程式 */
  init() {
    this.container = document.getElementById('app');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'app';
      document.body.appendChild(this.container);
    }

    // 載入設定
    const savedSettings = this.storage.getSettings();
    if (savedSettings) Object.assign(this.settings, savedSettings);
    this._applyTheme();

    // 設定路由
    this.router
      .add('#/', () => this._renderHome())
      .add('#/setup', () => this._renderSetup())
      .add('#/setup/:id', (p) => this._renderSetup(p.id))
      .add('#/live/:id', (p) => this._renderLive(p.id))
      .add('#/stats/:id', (p) => this._renderStats(p.id))
      .add('#/history/:id', (p) => this._renderHistory(p.id))
      .add('#/settings', () => this._renderSettings());

    this.router.start();

    // 註冊 Service Worker
    this._registerSW();
  }

  // ==================
  // 頁面渲染
  // ==================

  _renderHome() {
    this.container.innerHTML = '';
    const page = createElement('div', { className: 'home-layout' });

    // Header
    const header = createElement('header', { className: 'home-layout__header' });
    header.innerHTML = `<h1 class="home-layout__title">⚾ BBScoring</h1>
      <p class="home-layout__subtitle">棒球計分助手</p>`;
    page.appendChild(header);

    // 操作區
    const actions = createElement('div', { className: 'home-layout__actions' });
    actions.appendChild(createElement('button', {
      className: 'btn btn--primary btn--lg btn--block',
      textContent: '🆕 開始新比賽',
      onClick: () => this.router.navigate('#/setup')
    }));
    page.appendChild(actions);

    // 比賽列表
    const games = this.storage.loadAllGames();
    if (games.length > 0) {
      page.appendChild(createElement('h3', {
        className: 'home-layout__section-title',
        textContent: '比賽記錄'
      }));

      const list = createElement('div', { className: 'home-layout__list' });
      games.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      games.forEach(game => {
        const card = createElement('div', { className: 'game-card' });
        const statusLabel = this._getStatusLabel(game.info.status);
        const dateStr = game.info.date || '';
        card.innerHTML = `
          <div class="game-card__header">
            <span class="game-card__name">${game.info.name || '未命名比賽'}</span>
            <span class="game-card__badge game-card__badge--${game.info.status}">${statusLabel}</span>
          </div>
          <div class="game-card__body">
            <div class="game-card__teams">
              <span>${game.teams?.away?.name || '客隊'}</span>
              <span class="game-card__score">${game.currentState?.score?.away ?? 0} - ${game.currentState?.score?.home ?? 0}</span>
              <span>${game.teams?.home?.name || '主隊'}</span>
            </div>
            <div class="game-card__meta">${dateStr} ${game.info.venue || ''}</div>
          </div>
        `;

        // 操作按鈕
        const footer = createElement('div', { className: 'game-card__footer' });
        if (game.info.status === GAME_STATUS.IN_PROGRESS) {
          footer.appendChild(createElement('button', {
            className: 'btn btn--primary btn--sm',
            textContent: '繼續記錄',
            onClick: (e) => { e.stopPropagation(); this.router.navigate(`#/live/${game.id}`); }
          }));
        }
        footer.appendChild(createElement('button', {
          className: 'btn btn--outline btn--sm',
          textContent: '數據',
          onClick: (e) => { e.stopPropagation(); this.router.navigate(`#/stats/${game.id}`); }
        }));
        footer.appendChild(createElement('button', {
          className: 'btn btn--outline btn--sm',
          textContent: '記錄',
          onClick: (e) => { e.stopPropagation(); this.router.navigate(`#/history/${game.id}`); }
        }));
        footer.appendChild(createElement('button', {
          className: 'btn btn--outline btn--sm',
          textContent: '匯出',
          onClick: (e) => { e.stopPropagation(); ExportManager.exportJSON(game); }
        }));
        footer.appendChild(createElement('button', {
          className: 'btn btn--danger btn--sm',
          textContent: '刪除',
          onClick: async (e) => {
            e.stopPropagation();
            const ok = await showConfirm('確定要刪除此比賽嗎？此操作無法復原。');
            if (ok) { this.storage.deleteGame(game.id); this._renderHome(); }
          }
        }));

        card.appendChild(footer);
        list.appendChild(card);
      });

      page.appendChild(list);
    } else {
      page.appendChild(createElement('p', {
        className: 'home-layout__empty text-secondary',
        textContent: '尚無比賽記錄，點擊上方按鈕開始新比賽！'
      }));
    }

    // 底部功能
    const bottomActions = createElement('div', { className: 'home-layout__bottom' });
    bottomActions.appendChild(createElement('button', {
      className: 'btn btn--outline btn--sm',
      textContent: '⚙ 設定',
      onClick: () => this.router.navigate('#/settings')
    }));
    bottomActions.appendChild(createElement('button', {
      className: 'btn btn--outline btn--sm',
      textContent: '📥 匯入比賽',
      onClick: async () => {
        const game = await ImportManager.importJSON();
        if (game) {
          this.storage.saveGameImmediate(game);
          showToast('匯入成功');
          this._renderHome();
        }
      }
    }));
    page.appendChild(bottomActions);

    this.container.appendChild(page);
  }

  _renderSetup(gameId) {
    const setup = new GameSetup({
      container: this.container,
      onComplete: (game) => {
        game.info.status = GAME_STATUS.IN_PROGRESS;
        this.storage.saveGameImmediate(game);
        showToast('比賽建立成功！');
        this.router.navigate(`#/live/${game.id}`);
      },
      onCancel: () => this.router.navigate('#/')
    });
    setup.render();
  }

  _renderLive(gameId) {
    const gameData = this.storage.loadGame(gameId);
    if (!gameData) {
      showToast('找不到此比賽');
      this.router.navigate('#/');
      return;
    }

    this.engine = new GameEngine();
    this.engine.loadGame(gameData);

    // 新建比賽需要啟動
    if (gameData.info.status === GAME_STATUS.IN_PROGRESS && !gameData.history.length) {
      this.engine.startGame();
    }

    // 自動存檔
    this.engine.on('stateChanged', () => {
      this.storage.saveGame(this.engine.game);
    });

    const live = new LiveRecord({
      container: this.container,
      engine: this.engine,
      storageManager: this.storage,
      onBack: (target) => {
        if (target === 'home') this.router.navigate('#/');
        else if (target === 'stats') this.router.navigate(`#/stats/${gameId}`);
        else if (target === 'history') this.router.navigate(`#/history/${gameId}`);
      }
    });
    live.render();
  }

  _renderStats(gameId) {
    const gameData = this.storage.loadGame(gameId);
    if (!gameData) {
      showToast('找不到此比賽');
      this.router.navigate('#/');
      return;
    }

    const stats = new StatsView({
      container: this.container,
      game: gameData,
      onBack: () => {
        if (gameData.info.status === GAME_STATUS.IN_PROGRESS) {
          this.router.navigate(`#/live/${gameId}`);
        } else {
          this.router.navigate('#/');
        }
      }
    });
    stats.render();
  }

  _renderHistory(gameId) {
    const gameData = this.storage.loadGame(gameId);
    if (!gameData) {
      showToast('找不到此比賽');
      this.router.navigate('#/');
      return;
    }

    const history = new HistoryPanel({
      container: this.container,
      game: gameData,
      engine: this.engine,
      onBack: () => {
        if (gameData.info.status === GAME_STATUS.IN_PROGRESS) {
          this.router.navigate(`#/live/${gameId}`);
        } else {
          this.router.navigate('#/');
        }
      }
    });
    history.render();
  }

  _renderSettings() {
    this.container.innerHTML = '';
    const page = createElement('div', { className: 'settings-page' });

    const header = createElement('div', { className: 'settings-page__header' });
    header.appendChild(createElement('button', {
      className: 'btn btn--icon', innerHTML: '◀',
      onClick: () => this.router.navigate('#/')
    }));
    header.appendChild(createElement('h3', { textContent: '設定' }));
    page.appendChild(header);

    const body = createElement('div', { className: 'settings-page__body scrollable' });

    // 主題
    const themeSection = createElement('div', { className: 'settings-section' });
    themeSection.appendChild(createElement('div', { className: 'settings-section__title', textContent: '外觀' }));

    const themeRow = createElement('div', { className: 'settings-section__row' });
    themeRow.appendChild(createElement('span', { textContent: '深色模式' }));
    const themeToggle = createElement('button', {
      className: `toggle${this.settings.darkMode ? ' active' : ''}`,
      onClick: () => {
        this.settings.darkMode = !this.settings.darkMode;
        this._applyTheme();
        this.storage.saveSettings(this.settings);
        this._renderSettings();
      }
    });
    themeToggle.appendChild(createElement('span', { className: 'toggle__thumb' }));
    themeRow.appendChild(themeToggle);
    themeSection.appendChild(themeRow);
    body.appendChild(themeSection);

    // 震動
    const vibeSection = createElement('div', { className: 'settings-section' });
    vibeSection.appendChild(createElement('div', { className: 'settings-section__title', textContent: '回饋' }));
    const vibeRow = createElement('div', { className: 'settings-section__row' });
    vibeRow.appendChild(createElement('span', { textContent: '觸覺震動' }));
    const vibeToggle = createElement('button', {
      className: `toggle${this.settings.vibration ? ' active' : ''}`,
      onClick: () => {
        this.settings.vibration = !this.settings.vibration;
        this.storage.saveSettings(this.settings);
        this._renderSettings();
      }
    });
    vibeToggle.appendChild(createElement('span', { className: 'toggle__thumb' }));
    vibeRow.appendChild(vibeToggle);
    vibeSection.appendChild(vibeRow);
    body.appendChild(vibeSection);

    // 字型大小
    const fontSection = createElement('div', { className: 'settings-section' });
    fontSection.appendChild(createElement('div', { className: 'settings-section__title', textContent: '字型大小' }));
    const fontOptions = createElement('div', { className: 'option-group' });
    ['small', 'medium', 'large'].forEach(size => {
      const labels = { small: '小', medium: '中', large: '大' };
      fontOptions.appendChild(createElement('button', {
        className: `option-btn${this.settings.fontSize === size ? ' selected' : ''}`,
        textContent: labels[size],
        onClick: () => {
          this.settings.fontSize = size;
          document.documentElement.setAttribute('data-font-size', size);
          this.storage.saveSettings(this.settings);
          this._renderSettings();
        }
      }));
    });
    fontSection.appendChild(fontOptions);
    body.appendChild(fontSection);

    // 清除資料
    const dangerSection = createElement('div', { className: 'settings-section' });
    dangerSection.appendChild(createElement('div', { className: 'settings-section__title', textContent: '資料管理' }));
    dangerSection.appendChild(createElement('button', {
      className: 'btn btn--danger btn--sm',
      textContent: '清除所有比賽記錄',
      onClick: async () => {
        const ok = await showConfirm('確定要清除所有比賽記錄嗎？此操作無法復原。');
        if (ok) {
          this.storage.clearAll();
          showToast('已清除所有資料');
        }
      }
    }));
    body.appendChild(dangerSection);

    // 關於
    const aboutSection = createElement('div', { className: 'settings-section' });
    aboutSection.appendChild(createElement('div', { className: 'settings-section__title', textContent: '關於' }));
    aboutSection.innerHTML += `
      <div class="text-secondary">BBScoring v1.0.0</div>
      <div class="text-secondary">棒球計分助手 — 離線可用的 PWA 應用程式</div>
    `;
    body.appendChild(aboutSection);

    page.appendChild(body);
    this.container.appendChild(page);
  }

  // ==================
  // 工具方法
  // ==================

  _getStatusLabel(status) {
    const labels = {
      [GAME_STATUS.NOT_STARTED]: '未開始',
      [GAME_STATUS.IN_PROGRESS]: '進行中',
      [GAME_STATUS.FINISHED]: '已結束',
      [GAME_STATUS.SUSPENDED]: '暫停'
    };
    return labels[status] || status;
  }

  _applyTheme() {
    document.documentElement.setAttribute('data-theme', this.settings.darkMode ? 'dark' : 'light');
    if (this.settings.fontSize) {
      document.documentElement.setAttribute('data-font-size', this.settings.fontSize);
    }
  }

  _registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // SW registration failed — offline mode unavailable
      });
    }
  }
}

// Boot
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
