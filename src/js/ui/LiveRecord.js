/**
 * BBScoring — LiveRecord UI (即時記錄主頁面)
 */
import { createElement, showToast, showConfirm } from '../utils/helpers.js';
import { GAME_STATUS, HALF_INNING, POSITIONS } from '../utils/constants.js';
import { PitchPanel } from './PitchPanel.js';
import { HitResultPanel } from './HitResultPanel.js';
import { FieldDiagram } from './FieldDiagram.js';
import { RunnerDiagram } from './RunnerDiagram.js';
import { Scoreboard } from './Scoreboard.js';
import { LineupPanel } from './LineupPanel.js';

export class LiveRecord {
  constructor({ container, engine, storageManager, onBack }) {
    this.container = container;
    this.engine = engine;
    this.storage = storageManager;
    this.onBack = onBack;

    // 子元件
    this.pitchPanel = null;
    this.hitPanel = null;
    this.runnerDiagram = null;
    this.scoreboard = null;
    this.lineupPanel = null;

    // UI 狀態
    this.showLineup = false;
    this.showScoreboard = false;

    // 監聽引擎事件
    this._bindEvents();
  }

  _bindEvents() {
    this.engine.on('pitchRecorded', () => this._updateDisplay());
    this.engine.on('atBatFinished', () => this._updateDisplay());
    this.engine.on('halfInningEnded', () => this._updateDisplay());
    this.engine.on('gameEnded', () => this._handleGameEnd());
    this.engine.on('stateChanged', () => this._updateDisplay());
  }

  render() {
    this.container.innerHTML = '';
    const game = this.engine.game;
    if (!game) return;

    const layout = createElement('div', { className: 'live-layout' });

    // 頂部狀態列
    layout.appendChild(this._renderStatusBar());

    // 主內容
    const main = createElement('div', { className: 'live-layout__main' });

    // 比數列
    main.appendChild(this._renderScoreRow());

    // 壘包圖
    const runnerContainer = createElement('div', { className: 'live-layout__runner' });
    this.runnerDiagram = new RunnerDiagram({
      container: runnerContainer,
      runners: game.currentState.runners,
      outs: game.currentState.outs
    });
    this.runnerDiagram.render();
    main.appendChild(runnerContainer);

    // 打者資訊
    main.appendChild(this._renderBatterInfo());

    // 球數顯示
    main.appendChild(this._renderCountDisplay());

    // 投球面板
    const pitchContainer = createElement('div', { className: 'live-layout__pitch' });
    this.pitchPanel = new PitchPanel({
      container: pitchContainer,
      onPitch: (type) => this._handlePitch(type)
    });
    this.pitchPanel.render();
    main.appendChild(pitchContainer);

    layout.appendChild(main);

    // 打擊結果面板 (滑出式)
    const hitContainer = createElement('div', { className: 'slide-panel', id: 'hit-panel' });
    this.hitPanel = new HitResultPanel({
      container: hitContainer,
      onResult: (result) => this._handleHitResult(result),
      onCancel: () => this._hideHitPanel()
    });
    layout.appendChild(hitContainer);

    // 底部工具列
    layout.appendChild(this._renderBottomBar());

    this.container.appendChild(layout);
  }

  _renderStatusBar() {
    const game = this.engine.game;
    const state = game.currentState;
    const bar = createElement('div', { className: 'status-bar' });

    const halfLabel = state.halfInning === HALF_INNING.TOP ? '▲' : '▼';
    const inningText = `${halfLabel} ${state.inning}`;
    bar.appendChild(createElement('span', { className: 'status-bar__inning', textContent: inningText }));

    const outsEl = createElement('span', { className: 'status-bar__outs' });
    for (let i = 0; i < 3; i++) {
      outsEl.appendChild(createElement('span', {
        className: `status-bar__dot${i < state.outs ? ' filled' : ''}`
      }));
    }
    bar.appendChild(outsEl);

    // 功能按鈕
    const actions = createElement('span', { className: 'status-bar__actions' });
    const undoBtn = createElement('button', {
      className: 'btn btn--icon btn--sm', innerHTML: '↩',
      title: '復原', disabled: !this.engine.canUndo(),
      onClick: () => { this.engine.undo(); }
    });
    const redoBtn = createElement('button', {
      className: 'btn btn--icon btn--sm', innerHTML: '↪',
      title: '重做', disabled: !this.engine.canRedo(),
      onClick: () => { this.engine.redo(); }
    });
    const menuBtn = createElement('button', {
      className: 'btn btn--icon btn--sm', innerHTML: '☰',
      onClick: () => this._showMenu()
    });
    actions.append(undoBtn, redoBtn, menuBtn);
    bar.appendChild(actions);

    return bar;
  }

  _renderScoreRow() {
    const game = this.engine.game;
    const row = createElement('div', { className: 'score-row' });

    const away = createElement('div', {
      className: `score-row__team${game.currentState.halfInning === HALF_INNING.TOP ? ' active' : ''}`
    });
    away.innerHTML = `<span class="score-row__name">${game.teams.away.name || '客隊'}</span>
      <span class="score-row__runs">${game.currentState.score.away}</span>`;

    const vs = createElement('span', { className: 'score-row__vs', textContent: 'VS' });

    const home = createElement('div', {
      className: `score-row__team${game.currentState.halfInning === HALF_INNING.BOTTOM ? ' active' : ''}`
    });
    home.innerHTML = `<span class="score-row__name">${game.teams.home.name || '主隊'}</span>
      <span class="score-row__runs">${game.currentState.score.home}</span>`;

    row.append(away, vs, home);
    return row;
  }

  _renderBatterInfo() {
    const game = this.engine.game;
    const state = game.currentState;
    const side = state.halfInning === HALF_INNING.TOP ? 'away' : 'home';
    const lineup = game.lineups[side];
    const starter = lineup.starters[state.currentBatterIndex];
    const team = game.teams[side];

    const info = createElement('div', { className: 'batter-info' });
    if (starter) {
      const player = team.players.find(p => p.id === starter.playerId);
      if (player) {
        info.innerHTML = `
          <span class="batter-info__order">${state.currentBatterIndex + 1}</span>
          <span class="batter-info__number">#${player.number}</span>
          <span class="batter-info__name">${player.name}</span>
          <span class="batter-info__pos">${starter.position}</span>
        `;
      }
    }
    return info;
  }

  _renderCountDisplay() {
    const state = this.engine.game.currentState;
    const display = createElement('div', { className: 'count-display' });

    const labels = [
      { label: 'B', count: state.balls, max: 4, cls: 'ball' },
      { label: 'S', count: state.strikes, max: 3, cls: 'strike' },
      { label: 'F', count: state.fouls || 0, max: 10, cls: 'foul' }
    ];

    labels.forEach(item => {
      const row = createElement('div', { className: 'count-display__row' });
      row.appendChild(createElement('span', { className: 'count-display__label', textContent: item.label }));
      const dots = createElement('div', { className: 'count-display__dots' });
      const maxDots = item.label === 'F' ? Math.max(item.count, 2) : (item.max - 1);
      for (let i = 0; i < maxDots; i++) {
        dots.appendChild(createElement('span', {
          className: `count-dot count-dot--${item.cls}${i < item.count ? ' filled' : ''}`
        }));
      }
      row.appendChild(dots);
      display.appendChild(row);
    });

    return display;
  }

  _renderBottomBar() {
    const bar = createElement('div', { className: 'tab-bar' });
    const tabs = [
      { icon: '📋', label: '打序', onClick: () => this._toggleLineup() },
      { icon: '📊', label: '計分板', onClick: () => this._toggleScoreboard() },
      { icon: '📝', label: '記錄', onClick: () => this._showHistory() },
      { icon: '📈', label: '數據', onClick: () => this._showStats() }
    ];

    tabs.forEach(t => {
      const btn = createElement('button', {
        className: 'tab-bar__item',
        onClick: t.onClick
      });
      btn.innerHTML = `<span class="tab-bar__icon">${t.icon}</span><span class="tab-bar__label">${t.label}</span>`;
      bar.appendChild(btn);
    });

    return bar;
  }

  // === 事件處理 ===

  _handlePitch(type) {
    try {
      this.engine.recordPitch(type);
    } catch (err) {
      showToast(err.message);
    }
  }

  _handleHitResult(result) {
    try {
      this.engine.recordHitResult(result);
      this._hideHitPanel();
    } catch (err) {
      showToast(err.message);
    }
  }

  _showHitPanel() {
    const panel = this.container.querySelector('#hit-panel');
    if (panel) {
      panel.classList.add('open');
      this.hitPanel.render();
    }
  }

  _hideHitPanel() {
    const panel = this.container.querySelector('#hit-panel');
    if (panel) panel.classList.remove('open');
  }

  _updateDisplay() {
    this.render();

    // 投球進壘 → 顯示打擊結果面板
    const state = this.engine.game.currentState;
    if (state.waitingForHitResult) {
      this._showHitPanel();
    }
  }

  _handleGameEnd() {
    const game = this.engine.game;
    showToast(`比賽結束！${game.currentState.score.away} - ${game.currentState.score.home}`);
    this._updateDisplay();
  }

  _toggleLineup() {
    this.showLineup = !this.showLineup;
    if (this.showLineup) {
      this._lineupDrawer = createElement('div', { className: 'menu-drawer open' });
      this._lineupOverlay = createElement('div', { className: 'overlay open' });
      this._lineupOverlay.addEventListener('click', () => {
        this._lineupDrawer.remove();
        this._lineupOverlay.remove();
        this.showLineup = false;
      });

      const panelContent = createElement('div', { className: 'menu-drawer__content scrollable' });
      this.lineupPanel = new LineupPanel({
        container: panelContent,
        game: this.engine.game,
        engine: this.engine
      });
      this.lineupPanel.render();
      this._lineupDrawer.appendChild(panelContent);

      this.container.append(this._lineupOverlay, this._lineupDrawer);
    } else {
      if (this._lineupDrawer) this._lineupDrawer.remove();
      if (this._lineupOverlay) this._lineupOverlay.remove();
    }
  }

  _toggleScoreboard() {
    this.showScoreboard = !this.showScoreboard;
    if (this.showScoreboard) {
      this._scoreDrawer = createElement('div', { className: 'menu-drawer open' });
      this._scoreOverlay = createElement('div', { className: 'overlay open' });
      this._scoreOverlay.addEventListener('click', () => {
        this._scoreDrawer.remove();
        this._scoreOverlay.remove();
        this.showScoreboard = false;
      });

      const content = createElement('div', { className: 'menu-drawer__content scrollable' });
      this.scoreboard = new Scoreboard({
        container: content,
        game: this.engine.game
      });
      this.scoreboard.render();
      this._scoreDrawer.appendChild(content);

      this.container.append(this._scoreOverlay, this._scoreDrawer);
    } else {
      if (this._scoreDrawer) this._scoreDrawer.remove();
      if (this._scoreOverlay) this._scoreOverlay.remove();
    }
  }

  _showHistory() {
    if (this.onBack) this.onBack('history');
  }

  _showStats() {
    if (this.onBack) this.onBack('stats');
  }

  _showMenu() {
    const overlay = createElement('div', { className: 'overlay open' });
    const menu = createElement('div', { className: 'menu-drawer open' });

    const items = [
      { label: '更換投手', onClick: () => this._changePitcher() },
      { label: '替補球員', onClick: () => this._substitutePlayer() },
      { label: '結束比賽', onClick: () => this._endGame() },
      { label: '返回首頁', onClick: () => { if (this.onBack) this.onBack('home'); } }
    ];

    items.forEach(item => {
      menu.appendChild(createElement('button', {
        className: 'menu-drawer__item',
        textContent: item.label,
        onClick: () => { overlay.remove(); menu.remove(); item.onClick(); }
      }));
    });

    overlay.addEventListener('click', () => { overlay.remove(); menu.remove(); });
    this.container.append(overlay, menu);
  }

  async _endGame() {
    const confirmed = await showConfirm('確定要結束比賽嗎？');
    if (confirmed) {
      this.engine.endGame();
      if (this.onBack) this.onBack('home');
    }
  }

  _changePitcher() {
    // Use engine's changePitcher — show simple prompt
    const game = this.engine.game;
    const state = game.currentState;
    const defendSide = state.halfInning === HALF_INNING.TOP ? 'home' : 'away';
    const team = game.teams[defendSide];

    const modalOverlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `<div class="modal__header"><h3>更換投手 (${team.name})</h3></div>`;

    const body = createElement('div', { className: 'modal__body scrollable' });
    team.players.forEach(p => {
      const btn = createElement('button', {
        className: 'btn btn--outline btn--block mb-sm',
        textContent: `#${p.number} ${p.name}`,
        onClick: () => {
          this.engine.changePitcher(p.id);
          modalOverlay.remove();
          showToast(`投手更換為 #${p.number} ${p.name}`);
        }
      });
      body.appendChild(btn);
    });
    modal.appendChild(body);
    modalOverlay.appendChild(modal);

    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.remove(); });
    this.container.appendChild(modalOverlay);
  }

  _substitutePlayer() {
    const game = this.engine.game;
    const state = game.currentState;
    const battingSide = state.halfInning === HALF_INNING.TOP ? 'away' : 'home';
    const team = game.teams[battingSide];
    const lineup = game.lineups[battingSide];

    const modalOverlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `<div class="modal__header"><h3>替補球員 (${team.name})</h3></div>`;

    const body = createElement('div', { className: 'modal__body scrollable' });
    body.appendChild(createElement('p', { textContent: '選擇要替換的棒次：' }));

    lineup.starters.forEach((s, i) => {
      const player = team.players.find(p => p.id === s.playerId);
      if (!player || !s.isActive) return;
      const btn = createElement('button', {
        className: 'btn btn--outline btn--block mb-sm',
        textContent: `${i + 1}棒 #${player.number} ${player.name}`,
        onClick: () => {
          modalOverlay.remove();
          this._showSubReplace(battingSide, i);
        }
      });
      body.appendChild(btn);
    });
    modal.appendChild(body);
    modalOverlay.appendChild(modal);

    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.remove(); });
    this.container.appendChild(modalOverlay);
  }

  _showSubReplace(side, orderIndex) {
    const team = this.engine.game.teams[side];
    const lineup = this.engine.game.lineups[side];
    const activeIds = lineup.starters.filter(s => s.isActive).map(s => s.playerId);
    const outPlayerId = lineup.starters[orderIndex].playerId;

    const modalOverlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `<div class="modal__header"><h3>選擇替補球員</h3></div>`;

    const body = createElement('div', { className: 'modal__body scrollable' });
    team.players.filter(p => !activeIds.includes(p.id)).forEach(p => {
      const btn = createElement('button', {
        className: 'btn btn--outline btn--block mb-sm',
        textContent: `#${p.number} ${p.name}`,
        onClick: () => {
          this.engine.substitutePlayer({
            type: 'substitute',
            playerInId: p.id,
            playerOutId: outPlayerId,
            order: orderIndex,
            side
          });
          modalOverlay.remove();
          showToast(`替補完成`);
        }
      });
      body.appendChild(btn);
    });
    modal.appendChild(body);
    modalOverlay.appendChild(modal);

    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.remove(); });
    this.container.appendChild(modalOverlay);
  }
}
