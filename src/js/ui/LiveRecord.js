/**
 * BBScoring — LiveRecord UI (即時記錄主頁面)
 *
 * Supports both Detailed and Result-Only recording modes.
 */
import { createElement, showToast, showConfirm, deepClone } from '../utils/helpers.js';
import { GAME_STATUS, HALF_INNING, POSITIONS, RECORDING_MODE, REENTRY_RULE } from '../utils/constants.js';
import { StatsCalculator } from '../core/StatsCalculator.js';
import { PitchPanel } from './PitchPanel.js';
import { HitResultPanel } from './HitResultPanel.js';
import { AtBatResultPanel } from './AtBatResultPanel.js';
import { FieldDiagram } from './FieldDiagram.js';
import { RunnerDiagram } from './RunnerDiagram.js';
import { Scoreboard } from './Scoreboard.js';
import { LineupPanel } from './LineupPanel.js';
import { DefenseManager } from './DefenseManager.js';
import { GestureHandler } from '../utils/gestures.js';

export class LiveRecord {
  constructor({ container, engine, storageManager, onBack }) {
    this.container = container;
    this.engine = engine;
    this.storage = storageManager;
    this.onBack = onBack;

    // 子元件
    this.pitchPanel = null;
    this.hitPanel = null;
    this.atBatPanel = null;  // Result-Only mode
    this.runnerDiagram = null;
    this.scoreboard = null;
    this.lineupPanel = null;

    // UI 狀態
    this.showLineup = false;
    this.showScoreboard = false;

    // 記錄模式
    this.isResultOnly = engine.game?.mode?.recordingMode === RECORDING_MODE.RESULT_ONLY;

    // 監聽引擎事件
    this._bindEvents();

    // 桌面快捷鍵
    this._bindKeyboard();
  }

  _bindEvents() {
    this.engine.on('pitchRecorded', (data) => {
      this._updateDisplay();
      // WP/PB with runners: show advancement modal
      if (data?.needsAdvancement) {
        const event = data.result; // 'WP' or 'PB'
        this._showWpPbAdvanceModal(event, false);
      }
      // PB without runners: still counts as error on scoreboard
      if (data?.result === 'PB' && !data?.needsAdvancement) {
        this._incrementInningErrors();
      }
      // 不死三振: ask if batter reached
      if (data?.droppedThirdStrike) {
        this._showDroppedThirdStrikeModal();
      }
      // 妨礙守備: show interference modal
      if (data?.needsInterferenceModal) {
        this._showOffensiveInterferenceModal();
      }
      // 妨礙跑壘: show obstruction modal
      if (data?.needsObstructionModal) {
        this._showObstructionModal();
      }
    });
    this.engine.on('hitResultRecorded', () => this._updateDisplay());
    this.engine.on('halfInningChanged', () => this._updateDisplay());
    this.engine.on('gameEnded', () => this._handleGameEnd());
    this.engine.on('stateChanged', () => this._scheduleRender());
    this.engine.on('atBatDirectRecorded', () => this._updateDisplay());
    this.engine.on('defenseChanged', () => this._updateDisplay());
    this.engine.on('needsDefenseConfirmation', ({ side }) => {
      // Delay slightly so halfInningChanged render finishes first
      setTimeout(() => this._openDefenseManager({ side, isConfirmation: true }), 300);
    });
  }

  _bindKeyboard() {
    this._keyHandler = (e) => {
      // Auto-cleanup if component is unmounted
      if (!this.container.isConnected) {
        document.removeEventListener('keydown', this._keyHandler);
        return;
      }
      if (this.isResultOnly) return;
      const state = this.engine.game?.currentState;
      if (!state) return;

      // Delegate to hit wizard when open
      if (state.waitingForHitResult && this.hitPanel) {
        this.hitPanel.handleKey(e);
        return;
      }
      // Otherwise delegate to pitch panel
      if (this.pitchPanel) {
        this.pitchPanel.handleKey(e);
      }
    };
    document.addEventListener('keydown', this._keyHandler);
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

    // 投手資訊 (Detailed mode only)
    if (!this.isResultOnly) {
      main.appendChild(this._renderPitcherInfo());
    }

    // 打者資訊
    main.appendChild(this._renderBatterInfo());

    if (this.isResultOnly) {
      // Result-Only: AtBatResultPanel replaces PitchPanel + CountDisplay
      const atBatContainer = createElement('div', { className: 'live-layout__atbat' });
      this.atBatPanel = new AtBatResultPanel({
        container: atBatContainer,
        onResult: (result) => this._handleAtBatDirect(result)
      });
      this.atBatPanel.render();
      main.appendChild(atBatContainer);
    } else {
      // Detailed: CountDisplay + PitchPanel
      main.appendChild(this._renderCountDisplay());

      const runners = game.currentState.runners;
      const hasRunners = !!(runners.first || runners.second || runners.third);
      const pitchContainer = createElement('div', { className: 'live-layout__pitch' });

      if (game.currentState.waitingForHitResult) {
        // Hide pitch buttons while hit wizard is open
        pitchContainer.innerHTML = '<div class="pitch-buttons__waiting">等待打擊結果輸入...</div>';
        this.pitchPanel = null;
      } else {
        this.pitchPanel = new PitchPanel({
          container: pitchContainer,
          onPitch: (type, extra) => this._handlePitch(type, extra),
          onSteal: () => this._handleStealAttempt(),
          hasRunners
        });
        this.pitchPanel.render();
      }
      main.appendChild(pitchContainer);
    }

    layout.appendChild(main);

    if (!this.isResultOnly) {
      // Detailed: 打擊結果面板 (步驟式精靈，滑出式) — only for Detailed mode
      const runners = game.currentState.runners;
      const hitHasRunners = !!(runners.first || runners.second || runners.third);
      const hitContainer = createElement('div', { className: 'slide-panel', id: 'hit-panel' });
      this.hitPanel = new HitResultPanel({
        container: hitContainer,
        onResult: (result) => this._handleHitResult(result),
        onCancel: () => this._hideHitPanel(),
        hasRunners: hitHasRunners,
        runners: this.engine.getRunnersInfo(),
        outs: game.currentState.outs
      });
      layout.appendChild(hitContainer);
    }

    // 底部工具列
    layout.appendChild(this._renderBottomBar());

    this.container.appendChild(layout);

    // Swipe-right to go back (mobile)
    if (this._gesture) this._gesture.destroy();
    if (this._swipeHandler) this.container.removeEventListener('swipe', this._swipeHandler);
    this._swipeHandler = (e) => {
      if (e.detail.direction === 'right') {
        this._confirmLeave();
      }
    };
    this._gesture = new GestureHandler(this.container);
    this.container.addEventListener('swipe', this._swipeHandler);
  }

  _renderStatusBar() {
    const game = this.engine.game;
    const state = game.currentState;
    const bar = createElement('div', { className: 'status-bar' });

    // 返回按鈕
    const backBtn = createElement('button', {
      className: 'btn btn--icon btn--sm status-bar__back',
      innerHTML: '←',
      title: '返回首頁',
      onClick: () => this._confirmLeave()
    });
    bar.appendChild(backBtn);

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

    const wrapper = createElement('div', { className: 'batter-info-row' });

    const info = createElement('div', { className: 'batter-info' });
    if (starter) {
      const player = team.players.find(p => p.id === starter.playerId);
      if (player) {
        info.innerHTML = `
          <span class="batter-info__order">${state.currentBatterIndex + 1}</span>
          <span class="batter-info__number">#${player.number}</span>
          <span class="batter-info__name">${player.name || `球員${player.number}`}</span>
          <span class="batter-info__pos">${starter.position || ''}</span>
        `;
      }
    }
    wrapper.appendChild(info);

    // 代打 / 代跑 按鈕
    const actions = createElement('div', { className: 'batter-info__actions' });

    const phBtn = createElement('button', {
      className: 'btn btn--outline btn--sm batter-info__sub-btn',
      textContent: '代打',
      onClick: () => this._pinchHit()
    });
    actions.appendChild(phBtn);

    // 代跑：壘上有人才顯示
    const runners = state.runners || {};
    if (runners.first || runners.second || runners.third) {
      const prBtn = createElement('button', {
        className: 'btn btn--outline btn--sm batter-info__sub-btn',
        textContent: '代跑',
        onClick: () => this._pinchRun()
      });
      actions.appendChild(prBtn);
    }

    wrapper.appendChild(actions);
    return wrapper;
  }

  /**
   * Get available substitute players for a given side, respecting reentry rules.
   * @param {string} side - 'away' or 'home'
   * @param {number} [targetOrder] - For SAME_SLOT rule, which batting order slot the sub is for
   * @returns {Array} Available player objects
   */
  _getAvailableSubs(side, targetOrder) {
    const game = this.engine.game;
    const team = game.teams[side];
    const lineup = game.lineups[side];
    const reentryRule = game.mode?.reentryRule || REENTRY_RULE.NONE;

    // Currently active player IDs (in the lineup starters)
    const activeIds = new Set(
      lineup.starters.filter(s => s.isActive).map(s => s.playerId)
    );
    // Also exclude current active pitcher
    if (lineup.pitcher?.playerId) {
      activeIds.add(lineup.pitcher.playerId);
    }

    // All players who were substituted OUT (removed from the game)
    const subbedOutIds = new Set(
      lineup.substitutions.map(sub => sub.playerOut)
    );

    return team.players.filter(p => {
      // Can't sub in someone who's already active
      if (activeIds.has(p.id)) return false;

      // If this player was never subbed out, they're available (bench player)
      if (!subbedOutIds.has(p.id)) return true;

      // Player was previously subbed out — check reentry rule
      if (reentryRule === REENTRY_RULE.FREE) {
        return true;
      }
      if (reentryRule === REENTRY_RULE.SAME_SLOT) {
        // Find the original order this player was in
        if (targetOrder === undefined) return false;
        const originalSlot = lineup.substitutions.find(
          sub => sub.playerOut === p.id
        );
        return originalSlot && originalSlot.order === targetOrder;
      }
      // NONE — cannot re-enter
      return false;
    });
  }

  _pinchHit() {
    const game = this.engine.game;
    const state = game.currentState;
    const side = state.halfInning === HALF_INNING.TOP ? 'away' : 'home';
    const lineup = game.lineups[side];
    const orderIndex = state.currentBatterIndex;
    const outPlayerId = lineup.starters[orderIndex].playerId;

    const available = this._getAvailableSubs(side, orderIndex);
    if (available.length === 0) {
      showToast('沒有可用的替補球員');
      return;
    }

    const modalOverlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `<div class="modal__title">代打</div>
      <p style="color:var(--text-secondary);margin-bottom:var(--space-md)">選擇代打球員替換目前打者</p>`;

    const body = createElement('div', { className: 'modal__body', style: 'max-height:50vh;overflow-y:auto' });
    available.forEach(p => {
      body.appendChild(createElement('button', {
        className: 'btn btn--outline btn--full mb-sm',
        textContent: `#${p.number}  ${p.name || `球員${p.number}`}`,
        onClick: () => {
          this.engine.substitutePlayer({
            type: 'pinch-hit',
            playerInId: p.id,
            playerOutId: outPlayerId,
            order: orderIndex,
            side
          });
          modalOverlay.remove();
          showToast(`代打：#${p.number} ${p.name || ''} 上場`);
        }
      }));
    });

    modal.appendChild(body);
    modal.appendChild(createElement('div', {
      className: 'modal__actions',
      innerHTML: ''
    }));
    const cancelBtn = createElement('button', {
      className: 'btn btn--outline',
      textContent: '取消',
      onClick: () => modalOverlay.remove()
    });
    modal.lastChild.appendChild(cancelBtn);

    modalOverlay.appendChild(modal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.remove(); });
    this.container.appendChild(modalOverlay);
  }

  _pinchRun() {
    const game = this.engine.game;
    const state = game.currentState;
    const side = state.halfInning === HALF_INNING.TOP ? 'away' : 'home';
    const team = game.teams[side];
    const lineup = game.lineups[side];
    const runners = state.runners || {};

    // Step 1: find runners on base
    const baseLabels = { first: '一壘', second: '二壘', third: '三壘' };
    const onBase = [];
    for (const [base, playerId] of Object.entries(runners)) {
      if (!playerId) continue;
      const player = team.players.find(p => p.id === playerId);
      onBase.push({ base, playerId, player });
    }

    if (onBase.length === 0) {
      showToast('壘上無跑者');
      return;
    }

    // Find order for reentry check — use the runner's lineup slot
    const getRunnerOrder = (runner) => {
      const idx = lineup.starters.findIndex(s => s.playerId === runner.playerId);
      return idx >= 0 ? idx : undefined;
    };

    // If only one runner, skip selection
    if (onBase.length === 1) {
      const available = this._getAvailableSubs(side, getRunnerOrder(onBase[0]));
      if (available.length === 0) {
        showToast('沒有可用的替補球員');
        return;
      }
      this._showPinchRunReplace(side, onBase[0], available);
      return;
    }

    const modalOverlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `<div class="modal__title">代跑</div>
      <p style="color:var(--text-secondary);margin-bottom:var(--space-md)">選擇要替換的跑者</p>`;

    const body = createElement('div', { className: 'modal__body' });
    onBase.forEach(r => {
      const label = `${baseLabels[r.base]}  #${r.player?.number || '?'} ${r.player?.name || ''}`;
      body.appendChild(createElement('button', {
        className: 'btn btn--outline btn--full mb-sm',
        textContent: label,
        onClick: () => {
          modalOverlay.remove();
          const runnerOrder = lineup.starters.findIndex(s => s.playerId === r.playerId);
          const avail = this._getAvailableSubs(side, runnerOrder >= 0 ? runnerOrder : undefined);
          if (avail.length === 0) {
            showToast('沒有可用的替補球員');
            return;
          }
          this._showPinchRunReplace(side, r, avail);
        }
      }));
    });

    const actions = createElement('div', { className: 'modal__actions' });
    actions.appendChild(createElement('button', {
      className: 'btn btn--outline',
      textContent: '取消',
      onClick: () => modalOverlay.remove()
    }));
    modal.appendChild(body);
    modal.appendChild(actions);
    modalOverlay.appendChild(modal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.remove(); });
    this.container.appendChild(modalOverlay);
  }

  _showPinchRunReplace(side, runner, available) {
    const team = this.engine.game.teams[side];
    const lineup = this.engine.game.lineups[side];
    const baseLabels = { first: '一壘', second: '二壘', third: '三壘' };

    const modalOverlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `<div class="modal__title">代跑 — ${baseLabels[runner.base]}</div>
      <p style="color:var(--text-secondary);margin-bottom:var(--space-md)">選擇代跑球員</p>`;

    const body = createElement('div', { className: 'modal__body', style: 'max-height:50vh;overflow-y:auto' });
    available.forEach(p => {
      body.appendChild(createElement('button', {
        className: 'btn btn--outline btn--full mb-sm',
        textContent: `#${p.number}  ${p.name || `球員${p.number}`}`,
        onClick: () => {
          // Update runner on base before substitute (so _save captures it)
          this.engine.game.currentState.runners[runner.base] = p.id;

          const orderIndex = lineup.starters.findIndex(s => s.playerId === runner.playerId);
          this.engine.substitutePlayer({
            type: 'pinch-run',
            playerInId: p.id,
            playerOutId: runner.playerId,
            order: orderIndex >= 0 ? orderIndex : undefined,
            side
          });

          modalOverlay.remove();
          showToast(`代跑：#${p.number} ${p.name || ''} 上場（${baseLabels[runner.base]}）`);
        }
      }));
    });

    const actions = createElement('div', { className: 'modal__actions' });
    actions.appendChild(createElement('button', {
      className: 'btn btn--outline',
      textContent: '取消',
      onClick: () => modalOverlay.remove()
    }));
    modal.appendChild(body);
    modal.appendChild(actions);
    modalOverlay.appendChild(modal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.remove(); });
    this.container.appendChild(modalOverlay);
  }

  _renderCountDisplay() {
    const state = this.engine.game.currentState;
    const pitchCount = this.engine.recorder?.getCurrentAtBat()?.pitchCount || 0;
    const display = createElement('div', { className: 'count-display' });

    // Balls (left)
    const ballGroup = createElement('div', { className: 'count-display__group' });
    ballGroup.appendChild(createElement('span', { className: 'count-display__label count-display__label--ball', textContent: 'B' }));
    const ballDots = createElement('div', { className: 'count-display__dots' });
    for (let i = 0; i < 3; i++) {
      ballDots.appendChild(createElement('span', {
        className: `count-dot count-dot--ball${i < state.balls ? ' filled' : ''}`
      }));
    }
    ballGroup.appendChild(ballDots);
    display.appendChild(ballGroup);

    // Strikes (right)
    const strikeGroup = createElement('div', { className: 'count-display__group' });
    strikeGroup.appendChild(createElement('span', { className: 'count-display__label count-display__label--strike', textContent: 'S' }));
    const strikeDots = createElement('div', { className: 'count-display__dots' });
    for (let i = 0; i < 2; i++) {
      strikeDots.appendChild(createElement('span', {
        className: `count-dot count-dot--strike${i < state.strikes ? ' filled' : ''}`
      }));
    }
    strikeGroup.appendChild(strikeDots);
    display.appendChild(strikeGroup);

    // Pitch count text
    display.appendChild(createElement('span', {
      className: 'count-display__pitch-count',
      textContent: `此打席 ${pitchCount} 球`
    }));

    return display;
  }

  _renderPitcherInfo() {
    const pitcher = this.engine.getCurrentPitcher();
    const info = createElement('div', { className: 'pitcher-header' });

    if (!pitcher) {
      info.appendChild(createElement('span', { className: 'pitcher-header__empty', textContent: '投手未設定' }));
      return info;
    }

    // Hand label
    const handMap = { R: 'RHP', L: 'LHP', S: 'SHP' };
    const handLabel = handMap[pitcher.throws] || 'RHP';

    // Get pitcher stats
    const stats = this._getPitcherGameStats(pitcher.id);

    const left = createElement('div', { className: 'pitcher-header__left' });

    // Name row (clickable name)
    const nameRow = createElement('div', { className: 'pitcher-header__name-row' });
    const nameLink = createElement('span', {
      className: 'pitcher-header__name',
      textContent: `${pitcher.name || `球員${pitcher.number}`}`,
      onClick: () => this._showPitcherDetail(pitcher)
    });
    nameRow.appendChild(nameLink);
    nameRow.appendChild(createElement('span', {
      className: 'pitcher-header__number',
      textContent: `#${pitcher.number}`
    }));
    nameRow.appendChild(createElement('span', {
      className: 'pitcher-header__hand',
      textContent: handLabel
    }));
    left.appendChild(nameRow);

    // Stats row
    const statsRow = createElement('div', { className: 'pitcher-header__stats' });
    statsRow.appendChild(createElement('span', { textContent: `IP ${stats.ip}` }));
    statsRow.appendChild(createElement('span', { textContent: `NP ${stats.np}` }));
    statsRow.appendChild(createElement('span', { textContent: `R ${stats.runs}` }));
    left.appendChild(statsRow);

    info.appendChild(left);

    // Defense manager button (was change pitcher)
    const changeBtn = createElement('button', {
      className: 'btn btn--icon btn--sm pitcher-header__change',
      innerHTML: '🛡️',
      title: '守備調度',
      onClick: () => this._openDefenseManager({ focusPitcher: true })
    });
    info.appendChild(changeBtn);

    return info;
  }

  _showPitcherDetail(pitcher) {
    const modalOverlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `
      <div class="modal__header"><h3>#${pitcher.number} ${pitcher.name} 投手詳細資料</h3></div>
      <div class="modal__body" style="padding: var(--space-lg); text-align: center;">
        <p style="color: var(--text-muted); font-size: var(--fs-button);">🚧 待開發</p>
        <p style="color: var(--text-secondary); margin-top: var(--space-sm);">此功能將顯示更多比賽資料與匯出選項</p>
      </div>
    `;
    const closeBtn = createElement('button', {
      className: 'btn btn--primary btn--block',
      textContent: '關閉',
      onClick: () => modalOverlay.remove()
    });
    closeBtn.style.margin = 'var(--space-md)';
    modal.querySelector('.modal__body').appendChild(closeBtn);
    modalOverlay.appendChild(modal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.remove(); });
    this.container.appendChild(modalOverlay);
  }

  _getPitcherGameStats(pitcherId) {
    const game = this.engine.game;
    if (!pitcherId || !game) return { ip: '0', np: 0, runs: 0 };
    const atBats = [];
    game.innings.forEach(inn => {
      ['top', 'bottom'].forEach(halfKey => {
        const half = inn[halfKey];
        if (half && half.atBats) {
          half.atBats.filter(ab => ab.pitcherId === pitcherId).forEach(ab => atBats.push(ab));
        }
      });
    });
    return StatsCalculator.calcPitcherStats(atBats);
  }

  _handleStealAttempt() {
    const runnersInfo = this.engine.getRunnersInfo();
    const runners = this.engine.game.currentState.runners;
    const candidates = [];
    if (runners.first) candidates.push({ base: 'first', to: 'second', player: runnersInfo.first, id: runners.first });
    if (runners.second) candidates.push({ base: 'second', to: 'third', player: runnersInfo.second, id: runners.second });
    if (runners.third) candidates.push({ base: 'third', to: 'home', player: runnersInfo.third, id: runners.third });

    if (candidates.length === 0) { showToast('壘上無跑者'); return; }

    // Filter out runners whose target base is occupied by a non-stealing runner
    // For single steals: can only steal if target base is empty
    // For multiple steals: both stealing = ok (chain steal)
    this._showStealWizard(candidates, runners);
  }

  _showStealWizard(candidates, runners) {
    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });

    let step = 'select'; // select → result
    let selected = [];
    const results = {};
    const baseLabel = { first: '一壘', second: '二壘', third: '三壘' };
    const toLabel = { second: '二壘', third: '三壘', home: '本壘' };

    // Validate steal selection: a runner can only steal if target is empty or the occupant is also selected
    const isValidSelection = (sel) => {
      const targetMap = { first: 'second', second: 'third', third: 'home' };
      const occupiedBases = { first: !!runners.first, second: !!runners.second, third: !!runners.third };
      for (const base of sel) {
        const target = targetMap[base];
        if (target === 'home') continue; // home is always available
        if (occupiedBases[target] && !sel.includes(target)) return false;
      }
      return true;
    };

    const draw = () => {
      modal.innerHTML = '';
      const hdr = createElement('div', { className: 'modal__header' });
      hdr.appendChild(createElement('h3', { textContent: '盜壘' }));
      modal.appendChild(hdr);
      const body = createElement('div', { className: 'modal__body', style: 'padding:var(--space-md)' });

      if (step === 'select') {
        body.appendChild(createElement('div', { className: 'section-label', textContent: '選擇盜壘跑者' }));

        // Auto-fix selection: when toggling ON a runner, also select runners blocking the path
        const autoFixSelection = (sel) => {
          const targetMap = { first: 'second', second: 'third', third: 'home' };
          const occupiedBases = { first: !!runners.first, second: !!runners.second, third: !!runners.third };
          let changed = true;
          while (changed) {
            changed = false;
            for (const base of sel) {
              const target = targetMap[base];
              if (target !== 'home' && occupiedBases[target] && !sel.includes(target)) {
                sel.push(target);
                changed = true;
              }
            }
          }
          return sel;
        };

        candidates.forEach(c => {
          const on = selected.includes(c.base);
          const btn = createElement('button', {
            className: `btn btn--block ${on ? 'btn--primary' : 'btn--outline'}`,
            textContent: `${baseLabel[c.base]} → ${toLabel[c.to]}  ${c.player?.name || '#' + (c.player?.number || '?')}`,
            style: 'margin-bottom:var(--space-sm)',
            onClick: () => {
              if (on) {
                selected = selected.filter(b => b !== c.base);
                // Re-validate: removing this runner may break the chain for others
                if (!isValidSelection(selected)) {
                  // Remove runners that depend on the removed one
                  selected = selected.filter(b => isValidSelection([b]));
                }
              } else {
                selected.push(c.base);
                selected = autoFixSelection(selected);
              }
              draw();
            }
          });
          body.appendChild(btn);
        });
        if (candidates.length > 1) {
          const all = selected.length === candidates.length;
          body.appendChild(createElement('button', {
            className: `btn btn--block ${all ? 'btn--primary' : 'btn--outline'}`,
            textContent: '全部 (Both)',
            style: 'margin-bottom:var(--space-sm)',
            onClick: () => { selected = candidates.map(c => c.base); draw(); }
          }));
        }
        if (selected.length > 0 && isValidSelection(selected)) {
          body.appendChild(createElement('button', {
            className: 'btn btn--primary btn--block',
            textContent: '下一步 →',
            style: 'margin-top:var(--space-md)',
            onClick: () => { step = 'result'; draw(); }
          }));
        }
      } else {
        // result step: for each selected runner ask success/fail + error advance
        selected.forEach(base => {
          const c = candidates.find(x => x.base === base);
          if (!results[base]) results[base] = { success: null, errorAdvance: false };
          const r = results[base];

          const grp = createElement('div', { style: 'margin-bottom:var(--space-md);padding-bottom:var(--space-sm);border-bottom:1px solid rgba(255,255,255,.05)' });
          grp.appendChild(createElement('div', {
            className: 'section-label',
            textContent: `${baseLabel[base]} → ${toLabel[c.to]}  ${c.player?.name || '?'}`
          }));
          const row = createElement('div', { style: 'display:flex;gap:var(--space-sm)' });
          row.appendChild(createElement('button', {
            className: `btn ${r.success === true ? 'btn--primary' : 'btn--outline'}`, textContent: '成功',
            onClick: () => { r.success = true; draw(); }
          }));
          row.appendChild(createElement('button', {
            className: `btn ${r.success === false ? 'btn--danger' : 'btn--outline'}`, textContent: '失敗 (CS)',
            onClick: () => { r.success = false; r.errorAdvance = false; draw(); }
          }));
          grp.appendChild(row);

          if (r.success === true) {
            const errRow = createElement('div', { style: 'display:flex;gap:var(--space-sm);margin-top:var(--space-sm)' });
            errRow.appendChild(createElement('span', { textContent: '因失誤額外進壘？', style: 'align-self:center' }));
            errRow.appendChild(createElement('button', {
              className: `btn btn--sm ${r.errorAdvance ? 'btn--primary' : 'btn--outline'}`, textContent: '是',
              onClick: () => { r.errorAdvance = true; draw(); }
            }));
            errRow.appendChild(createElement('button', {
              className: `btn btn--sm ${!r.errorAdvance ? 'btn--primary' : 'btn--outline'}`, textContent: '否',
              onClick: () => { r.errorAdvance = false; draw(); }
            }));
            grp.appendChild(errRow);
          }
          body.appendChild(grp);
        });

        const allDone = selected.every(b => results[b].success !== null);
        if (allDone) {
          body.appendChild(createElement('button', {
            className: 'btn btn--primary btn--block',
            textContent: '確認盜壘',
            style: 'margin-top:var(--space-md)',
            onClick: () => { this._applyStealResults(candidates, selected, results); overlay.remove(); }
          }));
        }
      }

      body.appendChild(createElement('button', {
        className: 'btn btn--outline btn--block',
        textContent: '取消',
        style: 'margin-top:var(--space-sm)',
        onClick: () => overlay.remove()
      }));
      modal.appendChild(body);
    };

    draw();
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    this.container.appendChild(overlay);
  }

  _applyStealResults(candidates, selected, results) {
    // B3/B10: snapshot before mutation for undo
    const beforeState = deepClone(this.engine.game.currentState);
    const beforeAtBat = this.engine.recorder.getCurrentAtBat() ? deepClone(this.engine.recorder.getCurrentAtBat()) : null;
    const beforeInnings = deepClone(this.engine.game.innings);

    const ab = this.engine.recorder.getCurrentAtBat();
    // Process from third → second → first to avoid position conflicts
    const ordered = ['third', 'second', 'first'].filter(b => selected.includes(b));

    ordered.forEach(base => {
      const r = results[base];
      const c = candidates.find(x => x.base === base);
      if (r.success) {
        this.engine.runnerMgr.stealBase(c.id, base, c.to);
        if (ab) {
          ab.events.push({
            pitchNumber: ab.pitchCount, type: 'SB',
            runnerId: c.id, from: base, to: c.to,
            description: `盜壘成功 ${base}→${c.to}${r.errorAdvance ? ' (失誤進壘)' : ''}`
          });
          ab.runnerMovements.push({
            runnerId: c.id, from: base, to: c.to, event: 'SB',
            scored: c.to === 'home', earnedRun: c.to === 'home'
          });
        }
        // Steal home = score a run
        if (c.to === 'home') {
          const side = this.engine.game.currentState.battingTeam;
          this.engine.game.currentState.score[side]++;
          // Track run in half-inning stats
          const half = this.engine._getCurrentHalfInning();
          if (half) half.runs++;
        }
      } else {
        this.engine.runnerMgr.removeRunner(base);
        this.engine.game.currentState.outs++;
        if (ab) {
          ab.events.push({
            pitchNumber: ab.pitchCount, type: 'CS',
            runnerId: c.id, from: base, to: c.to,
            description: `盜壘失敗 ${base}`
          });
          ab.runnerMovements.push({
            runnerId: c.id, from: base, to: base, event: 'CS',
            scored: false, earnedRun: false, out: true
          });
        }
      }
    });

    // Check for third out — use engine's proper flow
    if (this.engine.game.currentState.outs >= 3) {
      this.engine._finishAtBat();
    } else {
      // Walk-off check: steal-home or WP/PB/BK scoring in bottom of final+ inning
      const st = this.engine.game.currentState;
      if (st.halfInning === HALF_INNING.BOTTOM &&
          st.inning >= this.engine.game.info.totalInnings &&
          st.score.home > st.score.away) {
        this.engine.endGame();
      }
    }

    this.engine._pushHistory('STEAL_RESULT', beforeState, beforeAtBat, beforeInnings);
    this.engine._save();
    this._updateDisplay();
    showToast('盜壘記錄完成');
  }

  // ═══════════════════════════════════════════
  // 不死三振 Modal
  // ═══════════════════════════════════════════

  _showDroppedThirdStrikeModal() {
    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });

    const hdr = createElement('div', { className: 'modal__header' });
    hdr.appendChild(createElement('h3', { textContent: '不死三振' }));
    modal.appendChild(hdr);

    const body = createElement('div', { className: 'modal__body', style: 'padding:var(--space-md)' });
    body.appendChild(createElement('p', {
      textContent: '捕手未確實接住第三個好球，打者是否跑上一壘？',
      style: 'margin-bottom:var(--space-md)'
    }));

    const row = createElement('div', { style: 'display:flex;gap:var(--space-sm)' });
    row.appendChild(createElement('button', {
      className: 'btn btn--primary btn--block',
      textContent: '是 — 打者上壘 (不死三振)',
      onClick: () => { this.engine.applyDroppedThirdStrike(true); overlay.remove(); this._updateDisplay(); showToast('不死三振 — 打者上壘'); }
    }));
    row.appendChild(createElement('button', {
      className: 'btn btn--danger btn--block',
      textContent: '否 — 正常三振出局',
      onClick: () => { this.engine.applyDroppedThirdStrike(false); overlay.remove(); this._updateDisplay(); showToast('三振出局'); }
    }));
    body.appendChild(row);
    modal.appendChild(body);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  // ═══════════════════════════════════════════
  // 妨礙守備 Modal
  // ═══════════════════════════════════════════

  _showOffensiveInterferenceModal() {
    const runners = this.engine.game.currentState.runners;
    const runnersInfo = this.engine.getRunnersInfo();
    const baseLabel = { first: '一壘', second: '二壘', third: '三壘' };

    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });

    let selectedBase = null; // 'batter' or 'first'/'second'/'third'

    const draw = () => {
      modal.innerHTML = '';
      const hdr = createElement('div', { className: 'modal__header' });
      hdr.appendChild(createElement('h3', { textContent: '妨礙守備 — 選擇妨礙者' }));
      modal.appendChild(hdr);

      const body = createElement('div', { className: 'modal__body', style: 'padding:var(--space-md)' });

      // Batter option
      const batterBtn = createElement('button', {
        className: `btn btn--block ${selectedBase === 'batter' ? 'btn--danger' : 'btn--outline'}`,
        textContent: '打者妨礙',
        style: 'margin-bottom:var(--space-sm)',
        onClick: () => { selectedBase = 'batter'; draw(); }
      });
      body.appendChild(batterBtn);

      // Runner options
      ['first', 'second', 'third'].forEach(base => {
        if (!runners[base]) return;
        const info = runnersInfo[base];
        const btn = createElement('button', {
          className: `btn btn--block ${selectedBase === base ? 'btn--danger' : 'btn--outline'}`,
          textContent: `${baseLabel[base]}跑者 — ${info?.name || '?'} #${info?.number || '?'}`,
          style: 'margin-bottom:var(--space-sm)',
          onClick: () => { selectedBase = base; draw(); }
        });
        body.appendChild(btn);
      });

      if (selectedBase) {
        const confirmRow = createElement('div', { style: 'display:flex;gap:var(--space-sm);margin-top:var(--space-md)' });
        confirmRow.appendChild(createElement('button', {
          className: 'btn btn--danger btn--block',
          textContent: `確認 — ${selectedBase === 'batter' ? '打者' : baseLabel[selectedBase] + '跑者'}出局`,
          onClick: () => {
            const interfererId = selectedBase === 'batter'
              ? this.engine.recorder.getCurrentAtBat()?.batterId
              : runners[selectedBase];
            this.engine.applyOffensiveInterference({
              interfererId,
              interfererBase: selectedBase
            });
            overlay.remove();
            this._updateDisplay();
            showToast('妨礙守備 — 出局');
          }
        }));
        confirmRow.appendChild(createElement('button', {
          className: 'btn btn--outline btn--block',
          textContent: '取消',
          onClick: () => { this.engine.undo(); overlay.remove(); this._updateDisplay(); }
        }));
        body.appendChild(confirmRow);
      } else {
        body.appendChild(createElement('button', {
          className: 'btn btn--outline btn--block',
          textContent: '取消',
          style: 'margin-top:var(--space-md)',
          onClick: () => { this.engine.undo(); overlay.remove(); this._updateDisplay(); }
        }));
      }

      modal.appendChild(body);
    };

    draw();
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  // ═══════════════════════════════════════════
  // 妨礙跑壘 Modal
  // ═══════════════════════════════════════════

  _showObstructionModal() {
    const runners = this.engine.game.currentState.runners;
    const runnersInfo = this.engine.getRunnersInfo();
    const baseLabel = { first: '一壘', second: '二壘', third: '三壘' };
    const baseOrder = ['first', 'second', 'third', 'home'];

    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });

    let selectedBase = null;
    let advanceTo = null;

    const draw = () => {
      modal.innerHTML = '';
      const hdr = createElement('div', { className: 'modal__header' });
      hdr.appendChild(createElement('h3', { textContent: '妨礙跑壘 — 選擇被妨礙跑者' }));
      modal.appendChild(hdr);

      const body = createElement('div', { className: 'modal__body', style: 'padding:var(--space-md)' });

      // Runner options
      ['first', 'second', 'third'].forEach(base => {
        if (!runners[base]) return;
        const info = runnersInfo[base];
        const btn = createElement('button', {
          className: `btn btn--block ${selectedBase === base ? 'btn--primary' : 'btn--outline'}`,
          textContent: `${baseLabel[base]}跑者 — ${info?.name || '?'} #${info?.number || '?'}`,
          style: 'margin-bottom:var(--space-sm)',
          onClick: () => { selectedBase = base; advanceTo = null; draw(); }
        });
        body.appendChild(btn);
      });

      // If selected, show advance options
      if (selectedBase) {
        body.appendChild(createElement('div', {
          className: 'section-label',
          textContent: '進壘到:',
          style: 'margin-top:var(--space-md)'
        }));
        const advRow = createElement('div', { style: 'display:flex;gap:var(--space-sm);flex-wrap:wrap' });
        const fromIdx = baseOrder.indexOf(selectedBase);
        for (let i = fromIdx + 1; i < baseOrder.length; i++) {
          const target = baseOrder[i];
          const label = target === 'home' ? '得分' : baseLabel[target];
          advRow.appendChild(createElement('button', {
            className: `btn ${advanceTo === target ? (target === 'home' ? 'btn--hit-hr' : 'btn--primary') : 'btn--outline'}`,
            textContent: label,
            onClick: () => { advanceTo = target; draw(); }
          }));
        }
        body.appendChild(advRow);
      }

      if (selectedBase && advanceTo) {
        body.appendChild(createElement('button', {
          className: 'btn btn--primary btn--block',
          textContent: '確認妨礙跑壘',
          style: 'margin-top:var(--space-md)',
          onClick: () => {
            this.engine.applyObstruction({
              runnerId: runners[selectedBase],
              runnerBase: selectedBase,
              advanceTo
            });
            overlay.remove();
            this._updateDisplay();
            showToast(`妨礙跑壘 — 跑者進${advanceTo === 'home' ? '本壘得分' : baseLabel[advanceTo]}`);
          }
        }));
      }

      body.appendChild(createElement('button', {
        className: 'btn btn--outline btn--block',
        textContent: '取消',
        style: 'margin-top:var(--space-sm)',
        onClick: () => { this.engine.undo(); overlay.remove(); this._updateDisplay(); }
      }));

      modal.appendChild(body);
    };

    draw();
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  // ═══════════════════════════════════════════
  // WP/PB Runner Advancement Modal
  // ═══════════════════════════════════════════

  /**
   * Show modal to ask how many bases each runner advances on WP/PB.
   * @param {string} event - 'WP' or 'PB'
   * @param {boolean} isDuringStrike - true if this is combined with a strike
   */
  _showWpPbAdvanceModal(event, isDuringStrike) {
    const runners = this.engine.game.currentState.runners;
    const runnersInfo = this.engine.getRunnersInfo();
    const baseLabel = { first: '一壘', second: '二壘', third: '三壘' };
    const eventLabel = event === 'WP' ? '暴投' : '捕逸';

    // Collect runners on base
    const candidates = [];
    if (runners.third) candidates.push({ base: 'third', player: runnersInfo.third, id: runners.third });
    if (runners.second) candidates.push({ base: 'second', player: runnersInfo.second, id: runners.second });
    if (runners.first) candidates.push({ base: 'first', player: runnersInfo.first, id: runners.first });

    if (candidates.length === 0) return;

    // Default: each runner advances 1 base
    const advances = {};
    candidates.forEach(c => { advances[c.base] = 1; });

    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });

    const draw = () => {
      modal.innerHTML = '';

      // Header
      const hdr = createElement('div', { className: 'modal__header' });
      hdr.appendChild(createElement('h3', {
        textContent: `${eventLabel} — 跑者進壘`
      }));
      if (isDuringStrike) {
        hdr.appendChild(createElement('span', {
          className: 'hit-result-panel__step',
          textContent: '好球 + ' + eventLabel
        }));
      }
      modal.appendChild(hdr);

      const body = createElement('div', { className: 'modal__body' });
      body.style.padding = 'var(--space-md)';

      candidates.forEach(c => {
        const row = createElement('div', { className: 'hit-wizard__yn-group' });
        const label = createElement('span', {
          className: 'hit-wizard__yn-label',
          textContent: `${baseLabel[c.base]} ${c.player?.name || '?'} #${c.player?.number || '?'}`
        });
        row.appendChild(label);

        const btns = createElement('div', { className: 'hit-wizard__yn-btns' });
        [0, 1, 2, 3].forEach(n => {
          const labels = ['不進壘', '+1', '+2', '得分'];
          // Limit options based on starting base
          const maxBases = c.base === 'third' ? 1 : c.base === 'second' ? 2 : 3;
          if (n > maxBases) return;

          const btn = createElement('button', {
            className: `btn btn--sm ${advances[c.base] === n ? 'btn--primary' : 'btn--outline'}`,
            textContent: labels[n],
            onClick: () => { advances[c.base] = n; draw(); }
          });
          btns.appendChild(btn);
        });
        row.appendChild(btns);
        body.appendChild(row);
      });

      // Confirm button
      const confirmBtn = createElement('button', {
        className: 'btn btn--primary btn--block',
        textContent: '確認',
        onClick: () => {
          overlay.remove();
          this._applyWpPbAdvancement(event, isDuringStrike, candidates, advances);
        }
      });
      confirmBtn.style.marginTop = 'var(--space-md)';
      body.appendChild(confirmBtn);

      modal.appendChild(body);
    };

    draw();
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { /* don't dismiss, must confirm */ } });
    this.container.appendChild(overlay);
  }

  _applyWpPbAdvancement(event, isDuringStrike, candidates, advances) {
    // B10: snapshot before mutation for undo
    const beforeState = deepClone(this.engine.game.currentState);
    const beforeAtBat = this.engine.recorder.getCurrentAtBat() ? deepClone(this.engine.recorder.getCurrentAtBat()) : null;
    const beforeInnings = deepClone(this.engine.game.innings);

    const advanceList = candidates.map(c => ({ from: c.base, bases: advances[c.base] }));
    const { movements, runs } = this.engine.runnerMgr.applyCustomAdvancement(advanceList, event);

    if (runs > 0) {
      const side = this.engine.game.currentState.battingTeam;
      this.engine.game.currentState.score[side] += runs;
    }

    // Record event on at-bat
    const ab = this.engine.recorder.getCurrentAtBat();
    if (ab) {
      const desc = isDuringStrike
        ? (event === 'WP' ? '暴投(好球時)' : '捕逸(好球時)')
        : (event === 'WP' ? '暴投' : '捕逸');
      ab.events.push({
        pitchNumber: ab.pitchCount, type: event,
        runnerId: null, from: null, to: null,
        description: desc
      });
      movements.forEach(m => ab.runnerMovements.push(m));
    }

    // PB counts as error — increment inning errors
    if (event === 'PB') {
      const game = this.engine.game;
      const inn = game.innings[game.currentState.inning - 1];
      if (inn) {
        const halfKey = game.currentState.halfInning === 'TOP' ? 'top' : 'bottom';
        if (inn[halfKey]) inn[halfKey].errors = (inn[halfKey].errors || 0) + 1;
      }
    }

    this.engine._pushHistory('WP_PB_ADVANCE', beforeState, beforeAtBat, beforeInnings);
    this.engine._save();

    // Walk-off check after WP/PB scoring
    const st = this.engine.game.currentState;
    if (runs > 0 && st.halfInning === HALF_INNING.BOTTOM &&
        st.inning >= this.engine.game.info.totalInnings &&
        st.score.home > st.score.away) {
      this.engine.endGame();
    }

    this._updateDisplay();
    const eventLabel = event === 'WP' ? '暴投' : '捕逸';
    showToast(`${eventLabel}記錄完成`);
  }

  /** Increment errors for the current half-inning (used for PB) */
  _incrementInningErrors() {
    const game = this.engine.game;
    const inn = game.innings[game.currentState.inning - 1];
    if (inn) {
      const halfKey = game.currentState.halfInning === 'TOP' ? 'top' : 'bottom';
      if (inn[halfKey]) inn[halfKey].errors = (inn[halfKey].errors || 0) + 1;
      this.engine._save();
    }
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

  _handlePitch(type, extra) {
    try {
      this.engine.recordPitch(type);
      // Combined strike + WP/PB: advance runners without an extra pitch
      if (extra?.wpPb) {
        this._handleWpPbDuringPitch(extra.wpPb);
      }
    } catch (err) {
      showToast(err.message);
    }
  }

  /** Handle WP/PB that occurs on the same pitch as a strike (no extra pitch count) */
  _handleWpPbDuringPitch(event) {
    if (!this.engine.runnerMgr || !this.engine.runnerMgr.hasRunners()) return;
    // Show modal to ask per-runner advancement
    this._showWpPbAdvanceModal(event, true);
  }

  _handleHitResult(result) {
    try {
      // Capture at-bat reference before engine finishes it
      const ab = this.engine.recorder.getCurrentAtBat();
      if (ab && result.notes) ab.notes = result.notes;

      // Pass all metadata to recordHitResult
      this.engine.recordHitResult({
        ...result,
        advancement: result.advancement,
        advancementReason: result.advancementReason,
        scored: result.scored,
        baseReached: result.baseReached,
        fcOutOccurred: result.fcOutOccurred,
        fcOutRunner: result.fcOutRunner
      });

      this._hideHitPanel();
    } catch (err) {
      showToast(err.message);
    }
  }

  _handleAtBatDirect(result) {
    try {
      this.engine.recordAtBatDirect(result);
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
    // Cancel the IP pitch: undo to restore state before the ball was put in play
    if (this.engine.game.currentState.waitingForHitResult) {
      this.engine.undo();
    }
    this._updateDisplay();
  }

  /** Debounced render — coalesces multiple stateChanged events into one render */
  _scheduleRender() {
    if (this._renderPending) return;
    this._renderPending = true;
    queueMicrotask(() => {
      this._renderPending = false;
      this._updateDisplay();
    });
  }

  _updateDisplay() {
    this.render();

    // 投球進壘 → 顯示打擊結果面板 (Detailed mode only)
    if (!this.isResultOnly) {
      const state = this.engine.game.currentState;
      if (state.waitingForHitResult) {
        this._showHitPanel();
      }
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
      const closeScoreboard = () => {
        this._scoreDrawer.remove();
        this._scoreOverlay.remove();
        this.showScoreboard = false;
      };
      this._scoreOverlay.addEventListener('click', closeScoreboard);

      // Header with close button
      const header = createElement('div', { className: 'menu-drawer__header' });
      header.appendChild(createElement('span', { textContent: '計分板', className: 'menu-drawer__title' }));
      header.appendChild(createElement('button', {
        className: 'btn btn--icon btn--sm', innerHTML: '✕',
        onClick: closeScoreboard
      }));
      this._scoreDrawer.appendChild(header);

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

    // Header with close button
    const header = createElement('div', { className: 'menu-drawer__header' });
    header.appendChild(createElement('span', { className: 'menu-drawer__title', textContent: '⚾ 選單' }));
    header.appendChild(createElement('button', {
      className: 'btn btn--icon btn--sm',
      innerHTML: '✕',
      onClick: () => { overlay.remove(); menu.remove(); }
    }));
    menu.appendChild(header);

    const closeMenu = () => { overlay.remove(); menu.remove(); };

    const items = [
      { icon: '🛡️', label: '守備調度', onClick: () => this._openDefenseManager() },
      { divider: true },
      { icon: '📖', label: '操作教學', onClick: () => { window.location.hash = '#/tutorial'; } },
      { divider: true },
      { icon: '🏁', label: '結束比賽', danger: true, onClick: () => this._endGame() },
      { icon: '🏠', label: '返回首頁', onClick: () => this._confirmLeave() }
    ];

    const body = createElement('div', { className: 'menu-drawer__body' });
    items.forEach(item => {
      if (item.divider) {
        body.appendChild(createElement('div', { className: 'menu-drawer__divider' }));
        return;
      }
      const btn = createElement('button', {
        className: `menu-drawer__item${item.danger ? ' menu-drawer__item--danger' : ''}`,
        onClick: () => { closeMenu(); item.onClick(); }
      });
      btn.appendChild(createElement('span', { className: 'menu-drawer__item-icon', textContent: item.icon }));
      btn.appendChild(createElement('span', { className: 'menu-drawer__item-label', textContent: item.label }));
      body.appendChild(btn);
    });
    menu.appendChild(body);

    overlay.addEventListener('click', closeMenu);
    this.container.append(overlay, menu);
  }

  async _confirmLeave() {
    const confirmed = await showConfirm('確定要返回首頁嗎？\n比賽進度已自動儲存，可隨時繼續。');
    if (confirmed) {
      if (this.onBack) this.onBack('home');
      else window.location.hash = '#/';
    }
  }

  async _endGame() {
    const confirmed = await showConfirm('確定要結束比賽嗎？');
    if (confirmed) {
      this.engine.endGame();
      if (this.onBack) this.onBack('home');
    }
  }

  /**
   * Open the unified Defense Manager panel.
   * @param {object} [opts]
   * @param {string} [opts.side] - force a specific side (for confirmation)
   * @param {boolean} [opts.isConfirmation] - half-inning defense confirmation mode
   * @param {boolean} [opts.focusPitcher] - highlight pitcher row
   */
  _openDefenseManager(opts = {}) {
    const state = this.engine.game.currentState;
    const side = opts.side || (state.halfInning === HALF_INNING.TOP ? 'home' : 'away');

    new DefenseManager({
      container: this.container,
      engine: this.engine,
      side,
      options: {
        focusPitcher: opts.focusPitcher || false,
        isConfirmation: opts.isConfirmation || false
      },
      onClose: () => this._updateDisplay()
    });
  }
}
