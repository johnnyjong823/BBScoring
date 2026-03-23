/**
 * BBScoring — HomeView 首頁儀表板
 *
 * Dashboard with:
 * - Two main entry buttons: ⚡ Quick Start / 🏆 Tournament
 * - In-progress games (resume)
 * - Recent completed games
 * - Bottom navigation
 */
import { createElement } from '../utils/helpers.js';
import { GAME_STATUS, START_MODE, RECORDING_MODE } from '../utils/constants.js';

export class HomeView {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container
   * @param {import('../storage/StorageManager.js').StorageManager} opts.storage
   * @param {(route: string) => void} opts.navigate
   */
  constructor({ container, storage, navigate, authSession = null, onLogout = null, onStartTestGame = null }) {
    this.container = container;
    this.storage = storage;
    this.navigate = navigate;
    this.authSession = authSession;
    this.onLogout = onLogout;
    this.onStartTestGame = onStartTestGame;
  }

  async render() {
    this.container.innerHTML = '';

    const wrapper = createElement('div', 'home-view');

    // ── Fixed Top Section ──
    const fixedTop = createElement('div', 'home-view__fixed');

    // Header
    const header = createElement('div', 'home-view__header');
    header.innerHTML = `
      <h1 class="home-view__title">⚾ BBScoring</h1>
      <p class="home-view__subtitle">${this._getHeaderSubtitle()}</p>
    `;
    header.appendChild(this._createAuthBar());
    fixedTop.appendChild(header);

    if (this.authSession?.mode === 'guest') {
      fixedTop.appendChild(this._createGuestNotice());
    }

    // Mode Entry Buttons
    const actions = createElement('div', 'home-view__actions');

    const quickBtn = createElement('button', 'home-view__action-btn home-view__action-btn--quick');
    quickBtn.innerHTML = `
      <span class="home-view__action-icon">⚡</span>
      <span class="home-view__action-label">快速開始</span>
      <span class="home-view__action-desc">直接輸入背號開始記錄</span>
    `;
    quickBtn.addEventListener('click', () => this.navigate('#/quick-setup'));

    const tournamentBtn = createElement('button', 'home-view__action-btn home-view__action-btn--tournament');
    tournamentBtn.innerHTML = `
      <span class="home-view__action-icon">🏆</span>
      <span class="home-view__action-label">聯賽 / 盃賽</span>
      <span class="home-view__action-desc">從賽事中選擇場次</span>
    `;
    tournamentBtn.addEventListener('click', () => this.navigate('#/tournament'));

    actions.appendChild(quickBtn);
    actions.appendChild(tournamentBtn);
    fixedTop.appendChild(actions);
    fixedTop.appendChild(this._createTestModeSection());

    wrapper.appendChild(fixedTop);

    // ── Scrollable Game List Section ──
    const allGames = await this._loadGames();
    const inProgress = allGames.filter(
      g => g.info && g.info.status === GAME_STATUS.IN_PROGRESS
    );
    const completed = allGames.filter(
      g => g.info && g.info.status === GAME_STATUS.FINISHED
    );

    if (inProgress.length > 0 || completed.length > 0) {
      // In-progress block
      if (inProgress.length > 0) {
        const block = createElement('div', 'home-view__list-block');
        block.appendChild(createElement('h2', {
          className: 'home-view__section-title',
          innerHTML: '🔴 進行中比賽'
        }));
        const scrollArea = createElement('div', 'home-view__scroll');
        const list = createElement('div', 'home-view__game-list');
        for (const game of inProgress) {
          list.appendChild(this._createGameCard(game, true));
        }
        scrollArea.appendChild(list);
        block.appendChild(scrollArea);
        wrapper.appendChild(block);
      }

      // Completed block
      if (completed.length > 0) {
        const block = createElement('div', 'home-view__list-block');
        block.appendChild(createElement('h2', {
          className: 'home-view__section-title',
          innerHTML: '📋 最近比賽'
        }));
        const scrollArea = createElement('div', 'home-view__scroll');
        const list = createElement('div', 'home-view__game-list');
        const recent = completed.slice(0, 5);
        for (const game of recent) {
          list.appendChild(this._createGameCard(game, false));
        }
        scrollArea.appendChild(list);
        block.appendChild(scrollArea);
        wrapper.appendChild(block);
      }
    } else {
      const empty = createElement('div', 'home-view__empty');
      empty.innerHTML = `
        <p class="home-view__empty-icon">📝</p>
        <p class="home-view__empty-text">尚無比賽紀錄</p>
        <p class="home-view__empty-hint">點擊上方按鈕開始記錄比賽</p>
      `;
      wrapper.appendChild(empty);
    }

    this.container.appendChild(wrapper);
  }

  // ── Private ──

  async _loadGames() {
    if (this.storage.loadAllGamesAsync) {
      return await this.storage.loadAllGamesAsync();
    }
    return this.storage.loadAllGames();
  }

  _createAuthBar() {
    const bar = createElement('div', 'home-view__auth-bar');

    const summary = createElement('div', 'home-view__auth-summary');
    const badgeClass = `home-view__auth-badge home-view__auth-badge--${this.authSession?.mode || 'guest'}`;
    summary.appendChild(createElement('span', {
      className: badgeClass,
      textContent: this._getRoleLabel()
    }));
    summary.appendChild(createElement('span', {
      className: 'home-view__auth-desc',
      textContent: this._getRoleDescription()
    }));

    bar.appendChild(summary);
    bar.appendChild(createElement('button', {
      className: 'btn btn--outline btn--sm home-view__switch-btn',
      textContent: '登出',
      onClick: () => this.onLogout && this.onLogout()
    }));

    return bar;
  }

  _createGuestNotice() {
    const notice = createElement('div', 'home-view__guest-notice');
    notice.innerHTML = `
      <strong>訪客模式：</strong>
      目前所有紀錄僅保存在本機。之後補登入正式帳號時，可再銜接做雲端綁定流程。
    `;
    return notice;
  }

  _createTestModeSection() {
    const section = createElement('div', 'home-view__section');
    section.appendChild(createElement('h2', {
      className: 'home-view__section-title',
      textContent: '🧪 測試紀錄模式'
    }));

    const hint = createElement('p', {
      className: 'home-view__test-hint',
      textContent: '直接產生隨機隊伍與先發名單，快速進入紀錄畫面測試。'
    });
    section.appendChild(hint);

    const buttons = createElement('div', 'home-view__test-actions');
    buttons.appendChild(createElement('button', {
      className: 'btn btn--outline home-view__test-btn',
      textContent: '測試：僅記結果',
      onClick: () => this.onStartTestGame && this.onStartTestGame(RECORDING_MODE.RESULT_ONLY)
    }));
    buttons.appendChild(createElement('button', {
      className: 'btn btn--outline home-view__test-btn',
      textContent: '測試：詳細記錄',
      onClick: () => this.onStartTestGame && this.onStartTestGame(RECORDING_MODE.DETAILED)
    }));
    section.appendChild(buttons);

    return section;
  }

  _getHeaderSubtitle() {
    if (this.authSession?.mode === 'admin') {
      return '管理入口已啟用';
    }
    if (this.authSession?.mode === 'user') {
      return '使用者入口已啟用';
    }
    return '訪客體驗模式';
  }

  _getRoleLabel() {
    if (this.authSession?.mode === 'admin') {
      return 'Admin';
    }
    if (this.authSession?.mode === 'user') {
      return this.authSession.providerLabel || '一般用戶';
    }
    return '訪客';
  }

  _getRoleDescription() {
    if (this.authSession?.mode === 'admin') {
      return '可進入審核與權限管理流程（本階段為 UI 展示）';
    }
    if (this.authSession?.mode === 'user') {
      return '帳號／賽事綁定入口已保留（本階段為 UI 展示）';
    }
    return '比賽資料只存在這台裝置，不上雲端';
  }

  _createGameCard(game, isLive) {
    const card = createElement('div', `home-view__card ${isLive ? 'home-view__card--live' : ''}`);

    const away = game.teams?.away;
    const home = game.teams?.home;
    const awayName = away?.name || '客隊';
    const homeName = home?.name || '主隊';
    const score = game.currentState?.score || { away: 0, home: 0 };
    const date = game.info?.date || '';
    const inning = game.currentState?.inning || 1;

    // Mode badges
    const startBadge = game.mode?.startMode === START_MODE.TOURNAMENT ? '🏆' : '⚡';
    const recBadge = game.mode?.recordingMode === RECORDING_MODE.RESULT_ONLY ? '簡' : '詳';

    card.innerHTML = `
      <div class="home-view__card-header">
        <span class="home-view__card-date">${date}</span>
        <span class="home-view__card-badges">
          <span class="home-view__card-badge">${startBadge}</span>
          <span class="home-view__card-badge home-view__card-badge--rec">${recBadge}</span>
        </span>
      </div>
      <div class="home-view__card-score">
        <span class="home-view__card-team">${awayName}</span>
        <span class="home-view__card-vs">${score.away} : ${score.home}</span>
        <span class="home-view__card-team">${homeName}</span>
      </div>
      ${isLive ? `<div class="home-view__card-status">第 ${inning} 局進行中</div>` : ''}
    `;

    card.addEventListener('click', () => {
      if (isLive) {
        this.navigate(`#/live/${game.id}`);
      } else {
        this.navigate(`#/stats/${game.id}`);
      }
    });

    return card;
  }
}
