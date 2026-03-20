/**
 * BBScoring — LiveRecord UI (即時記錄主頁面)
 *
 * Supports both Detailed and Result-Only recording modes.
 */
import { createElement, showToast, showConfirm, deepClone } from '../utils/helpers.js';
import { GAME_STATUS, HALF_INNING, POSITIONS, RECORDING_MODE } from '../utils/constants.js';
import { StatsCalculator } from '../core/StatsCalculator.js';
import { PitchPanel } from './PitchPanel.js';
import { HitResultPanel } from './HitResultPanel.js';
import { AtBatResultPanel } from './AtBatResultPanel.js';
import { FieldDiagram } from './FieldDiagram.js';
import { RunnerDiagram } from './RunnerDiagram.js';
import { Scoreboard } from './Scoreboard.js';
import { LineupPanel } from './LineupPanel.js';
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
    });
    this.engine.on('hitResultRecorded', () => this._updateDisplay());
    this.engine.on('halfInningChanged', () => this._updateDisplay());
    this.engine.on('gameEnded', () => this._handleGameEnd());
    this.engine.on('stateChanged', () => this._scheduleRender());
    this.engine.on('atBatDirectRecorded', () => this._updateDisplay());
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
        runners: this.engine.getRunnersInfo()
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
        if (this.onBack) { this.onBack(); }
        else { window.location.hash = '#/'; }
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
      onClick: () => {
        if (this.onBack) { this.onBack(); }
        else { window.location.hash = '#/'; }
      }
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
    return info;
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

    // Change pitcher button
    const changeBtn = createElement('button', {
      className: 'btn btn--icon btn--sm pitcher-header__change',
      innerHTML: '🔄',
      title: '更換投手',
      onClick: () => this._changePitcher()
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
    this._showStealWizard(candidates);
  }

  _showStealWizard(candidates) {
    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });

    let step = 'select'; // select → result
    let selected = [];
    const results = {};
    const baseLabel = { first: '一壘', second: '二壘', third: '三壘' };
    const toLabel = { second: '二壘', third: '三壘', home: '本壘' };

    const draw = () => {
      modal.innerHTML = '';
      const hdr = createElement('div', { className: 'modal__header' });
      hdr.appendChild(createElement('h3', { textContent: '盜壘' }));
      modal.appendChild(hdr);
      const body = createElement('div', { className: 'modal__body', style: 'padding:var(--space-md)' });

      if (step === 'select') {
        body.appendChild(createElement('div', { className: 'section-label', textContent: '選擇盜壘跑者' }));
        candidates.forEach(c => {
          const on = selected.includes(c.base);
          const btn = createElement('button', {
            className: `btn btn--block ${on ? 'btn--primary' : 'btn--outline'}`,
            textContent: `${baseLabel[c.base]} → ${toLabel[c.to]}  ${c.player?.name || '#' + (c.player?.number || '?')}`,
            style: 'margin-bottom:var(--space-sm)',
            onClick: () => { on ? (selected = selected.filter(b => b !== c.base)) : selected.push(c.base); draw(); }
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
        if (selected.length > 0) {
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
        }
        // Steal home = score a run
        if (c.to === 'home') {
          const side = this.engine.game.currentState.battingTeam;
          this.engine.game.currentState.score[side]++;
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
        }
      }
    });

    // Check for third out — use engine's proper flow
    if (this.engine.game.currentState.outs >= 3) {
      this.engine._finishAtBat();
    }

    this.engine._pushHistory('STEAL_RESULT', beforeState, beforeAtBat, beforeInnings);
    this.engine._save();
    this._updateDisplay();
    showToast('盜壘記錄完成');
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
    // Always re-render to reflect new state after hit result
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
