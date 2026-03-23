/**
 * BBScoring — App 入口 (主應用程式控制器)
 *
 * v2: Supports 2×2 mode matrix (Quick/Tournament × Result-Only/Detailed)
 */
import { Router } from './router.js';
import { StorageManager } from './storage/StorageManager.js';
import { ExportManager } from './storage/ExportManager.js';
import { ImportManager } from './storage/ImportManager.js';
import { GameEngine } from './core/GameEngine.js';
import { GameSetup } from './ui/GameSetup.js';
import { QuickSetup } from './ui/QuickSetup.js';
import { HomeView } from './ui/HomeView.js';
import { AuthView } from './ui/AuthView.js';
import { LiveRecord } from './ui/LiveRecord.js';
import { StatsView } from './ui/StatsView.js';
import { HistoryPanel } from './ui/HistoryPanel.js';
import { createGame } from './models/Game.js';
import { createTeam } from './models/Team.js';
import { createPlayer } from './models/Player.js';
import { TutorialView } from './ui/TutorialView.js';
import { createElement, showToast, showConfirm, formatDate, formatTime } from './utils/helpers.js';
import { GAME_STATUS, DEFAULT_SETTINGS, START_MODE, RECORDING_MODE } from './utils/constants.js';

class App {
  constructor() {
    this.router = new Router();
    this.storage = new StorageManager();
    this.engine = null;
    this.container = null;
    this.authSession = null;
    this.settings = { ...DEFAULT_SETTINGS };
  }

  /** 初始化應用程式（含 async IndexedDB + 資料遷移） */
  async init() {
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

    // 初始化 StorageManager（IndexedDB + 資料遷移）
    try {
      await this.storage.init();
    } catch (e) {
      console.warn('Storage init warning:', e);
    }

    // 設定路由
    this.router
      .add('#/', () => this._renderEntry())
      .add('#/auth', () => this._renderAuth())
      .add('#/quick-setup', () => this._ensureAuth() && this._renderQuickSetup())
      .add('#/setup', () => this._ensureAuth() && this._renderSetup())
      .add('#/setup/:id', (p) => this._ensureAuth() && this._renderSetup(p.id))
      .add('#/live/:id', (p) => this._ensureAuth() && this._renderLive(p.id))
      .add('#/stats/:id', (p) => this._ensureAuth() && this._renderStats(p.id))
      .add('#/history/:id', (p) => this._ensureAuth() && this._renderHistory(p.id))
      .add('#/tournament', () => this._ensureAuth() && this._renderTournamentList())
      .add('#/settings', () => this._ensureAuth() && this._renderSettings())
      .add('#/tutorial', () => this._renderTutorial());

    this.router.start();

    // 註冊 Service Worker
    this._registerSW();
  }

  // ==================
  // 頁面渲染
  // ==================

  _renderEntry() {
    if (this._ensureAuth(false)) {
      this._renderHome();
      return;
    }
    this.router.navigate('#/auth');
  }

  _renderAuth() {
    const auth = new AuthView({
      container: this.container,
      storage: this.storage,
      onEnter: (session) => {
        this.storage.saveAuthSession(session);
        this.authSession = session;
        showToast(`${session.title} 已就緒`);
        this.router.navigate('#/');
      }
    });
    auth.render();
  }

  _renderHome() {
    this.authSession = this.storage.getAuthSession();
    const home = new HomeView({
      container: this.container,
      storage: this.storage,
      authSession: this.authSession,
      onStartTestGame: (recordingMode) => this._startMockGame(recordingMode),
      onLogout: () => {
        this.storage.clearAuthSession();
        this.authSession = null;
        showToast('已登出');
        this.router.navigate('#/auth');
      },
      navigate: (hash) => this.router.navigate(hash)
    });
    home.render();
  }

  _renderQuickSetup() {
    const setup = new QuickSetup({
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

  _startMockGame(recordingMode) {
    const game = this._createMockGame(recordingMode);
    game.info.status = GAME_STATUS.IN_PROGRESS;
    this.storage.saveGameImmediate(game);
    showToast(recordingMode === RECORDING_MODE.DETAILED ? '已建立詳細記錄測試場次' : '已建立僅記結果測試場次');
    this.router.navigate(`#/live/${game.id}`);
  }

  _createMockGame(recordingMode) {
    const awayTeam = this._createMockTeam('away');
    const homeTeam = this._createMockTeam('home');

    const game = createGame({
      name: `${awayTeam.name} vs ${homeTeam.name}`,
      venue: '測試模式球場',
      totalInnings: 7,
      startMode: START_MODE.QUICK,
      recordingMode
    });

    game.teams.away = awayTeam;
    game.teams.home = homeTeam;
    game.lineups.away = this._createMockLineup(awayTeam);
    game.lineups.home = this._createMockLineup(homeTeam);

    return game;
  }

  _createMockTeam(side) {
    const prefixes = side === 'away'
      ? ['北城', '海風', '雷霆', '銀河', '赤焰']
      : ['南港', '山岳', '疾風', '流星', '藍海'];
    const suffixes = ['獵鷹', '猛虎', '戰狼', '飛馬', '巨人'];
    const seed = Math.floor(Math.random() * prefixes.length);
    const team = createTeam({
      name: `${prefixes[seed]}${suffixes[Math.floor(Math.random() * suffixes.length)]}`,
      color: side === 'away' ? '#c0392b' : '#2980b9'
    });

    const positions = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P'];
    const baseNumber = side === 'away' ? 1 : 31;
    team.players = positions.map((position, index) => createPlayer({
      number: String(baseNumber + index).padStart(2, '0'),
      name: `${side === 'away' ? '客隊' : '主隊'}球員${index + 1}`,
      position: [position],
      isTemporary: true
    }));

    return team;
  }

  _createMockLineup(team) {
    const starters = team.players.map((player, index) => ({
      order: index + 1,
      playerId: player.id,
      position: player.position[0] || '',
      isActive: true
    }));
    const pitcher = team.players.find(player => player.position.includes('P')) || team.players[0];

    return {
      teamId: team.id,
      starters,
      pitcher: { playerId: pitcher.id, isActive: true },
      substitutions: []
    };
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

  async _renderLive(gameId) {
    const gameData = await this.storage.loadGameAsync(gameId);
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

  async _renderStats(gameId) {
    const gameData = await this.storage.loadGameAsync(gameId);
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

  async _renderHistory(gameId) {
    const gameData = await this.storage.loadGameAsync(gameId);
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

  _renderTutorial() {
    const tutorial = new TutorialView({
      container: this.container,
      onBack: () => this.router.navigate('#/')
    });
    tutorial.render();
  }

  _renderSettings() {
    this.container.innerHTML = '';
    const page = createElement('div', { className: 'settings-page' });

    // ── Header ──
    const header = createElement('div', { className: 'settings-page__header' });
    header.appendChild(createElement('button', {
      className: 'btn btn--icon', innerHTML: '◀',
      onClick: () => this.router.navigate('#/')
    }));
    header.appendChild(createElement('h3', { textContent: '⚙️ 設定' }));
    page.appendChild(header);

    const body = createElement('div', { className: 'settings-page__body' });

    // ── 外觀 ──
    const themeSection = createElement('div', { className: 'settings-section' });
    themeSection.appendChild(createElement('div', { className: 'settings-section__title', textContent: '🎨 外觀' }));

    const themeRow = createElement('div', { className: 'settings-section__row' });
    const themeLabel = createElement('div');
    themeLabel.appendChild(createElement('div', { className: 'settings-section__row-label', textContent: '深色模式' }));
    themeLabel.appendChild(createElement('div', { className: 'settings-section__row-desc', textContent: this.settings.darkMode ? '已開啟' : '已關閉' }));
    themeRow.appendChild(themeLabel);
    const themeToggle = createElement('button', {
      className: `toggle${this.settings.darkMode ? ' active' : ''}`,
      onClick: () => {
        this.settings.darkMode = !this.settings.darkMode;
        this._applyTheme();
        this.storage.saveSettings(this.settings);
        this._renderSettings();
      }
    });
    themeRow.appendChild(themeToggle);
    themeSection.appendChild(themeRow);
    body.appendChild(themeSection);

    // ── 字型大小 ──
    const fontSection = createElement('div', { className: 'settings-section' });
    fontSection.appendChild(createElement('div', { className: 'settings-section__title', textContent: '🔤 字型大小' }));
    const fontContent = createElement('div', { className: 'settings-section__content' });
    const fontOptions = createElement('div', { className: 'settings-font-options' });
    [
      { key: 'small', label: '小', preview: 'A', size: '0.85rem' },
      { key: 'medium', label: '中', preview: 'A', size: '1rem' },
      { key: 'large', label: '大', preview: 'A', size: '1.2rem' }
    ].forEach(opt => {
      const btn = createElement('button', {
        className: `settings-font-btn${this.settings.fontSize === opt.key ? ' selected' : ''}`,
        onClick: () => {
          this.settings.fontSize = opt.key;
          document.documentElement.setAttribute('data-font-size', opt.key);
          this.storage.saveSettings(this.settings);
          this._renderSettings();
        }
      });
      btn.appendChild(createElement('span', {
        className: 'settings-font-btn__preview',
        textContent: opt.preview,
        style: `font-size: ${opt.size}`
      }));
      btn.appendChild(createElement('span', { className: 'settings-font-btn__label', textContent: opt.label }));
      fontOptions.appendChild(btn);
    });
    fontContent.appendChild(fontOptions);
    fontSection.appendChild(fontContent);
    body.appendChild(fontSection);

    // ── 回饋 ──
    const vibeSection = createElement('div', { className: 'settings-section' });
    vibeSection.appendChild(createElement('div', { className: 'settings-section__title', textContent: '📳 回饋' }));

    const vibeRow = createElement('div', { className: 'settings-section__row' });
    const vibeLabel = createElement('div');
    vibeLabel.appendChild(createElement('div', { className: 'settings-section__row-label', textContent: '觸覺震動' }));
    vibeLabel.appendChild(createElement('div', { className: 'settings-section__row-desc', textContent: '按鈕點擊時震動回饋' }));
    vibeRow.appendChild(vibeLabel);
    const vibeToggle = createElement('button', {
      className: `toggle${this.settings.vibration ? ' active' : ''}`,
      onClick: () => {
        this.settings.vibration = !this.settings.vibration;
        this.storage.saveSettings(this.settings);
        this._renderSettings();
      }
    });
    vibeRow.appendChild(vibeToggle);
    vibeSection.appendChild(vibeRow);
    body.appendChild(vibeSection);

    // ── 資料管理 ──
    const dangerSection = createElement('div', { className: 'settings-section' });
    dangerSection.appendChild(createElement('div', { className: 'settings-section__title', textContent: '🗂️ 資料管理' }));
    const dangerZone = createElement('div', { className: 'settings-section__danger-zone' });
    dangerZone.appendChild(createElement('button', {
      className: 'btn btn--danger btn--full',
      textContent: '🗑️ 清除所有比賽記錄',
      onClick: async () => {
        const ok = await showConfirm('確定要清除所有比賽記錄嗎？此操作無法復原。');
        if (ok) {
          this.storage.clearAll();
          showToast('已清除所有資料');
        }
      }
    }));
    dangerSection.appendChild(dangerZone);
    body.appendChild(dangerSection);

    // ── 關於 ──
    const aboutSection = createElement('div', { className: 'settings-section' });
    aboutSection.appendChild(createElement('div', { className: 'settings-section__title', textContent: '💡 關於' }));
    const aboutContent = createElement('div', { className: 'settings-section__about' });
    aboutContent.innerHTML = `
      <div style="font-weight:700; font-size:1rem; margin-bottom:4px;">⚾ BBScoring v2.0.0</div>
      <div>棒球計分助手 — 離線可用的 PWA 應用程式</div>
    `;
    aboutSection.appendChild(aboutContent);
    body.appendChild(aboutSection);

    page.appendChild(body);
    this.container.appendChild(page);
  }

  _renderTournamentList() {
    this.container.innerHTML = '';
    const page = createElement('div', 'tournament-page');

    const header = createElement('div', 'tournament-page__header');
    header.appendChild(createElement('button', {
      className: 'btn btn--icon', innerHTML: '◀',
      onClick: () => this.router.navigate('#/')
    }));
    header.appendChild(createElement('h3', { textContent: '🏆 聯賽 / 盃賽' }));
    page.appendChild(header);

    const body = createElement('div', 'tournament-page__body scrollable');
    body.innerHTML = `
      <div class="home-view__empty">
        <p class="home-view__empty-icon">🏗️</p>
        <p class="home-view__empty-text">聯賽功能開發中</p>
        <p class="home-view__empty-hint">Phase 3 將實作聯賽管理功能</p>
      </div>
    `;
    page.appendChild(body);

    this.container.appendChild(page);
  }

  // ==================
  // 工具方法
  // ==================

  _ensureAuth(redirect = true) {
    this.authSession = this.storage.getAuthSession();
    if (this.authSession) return true;
    if (redirect) this.router.navigate('#/auth');
    return false;
  }

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
    if (!('serviceWorker' in navigator)) return;

    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

    if (isLocalhost) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      }).catch(() => {
        // Ignore localhost cleanup failure
      });
      return;
    }

    navigator.serviceWorker.register('./sw.js').catch(() => {
      // SW registration failed — offline mode unavailable
    });
  }
}

// Boot
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
