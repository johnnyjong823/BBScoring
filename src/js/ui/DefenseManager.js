/**
 * BBScoring — DefenseManager 守備調度面板
 *
 * Unified UI for:
 * - Pitcher changes
 * - Player substitutions (bench ↔ field)
 * - Position swaps between active fielders
 * - Post-pinch-hit/run defense confirmation
 *
 * Operates in "draft" mode: user builds up pendingChanges,
 * reviews the summary, then confirms to batch-commit.
 */
import { createElement, showToast } from '../utils/helpers.js';
import { POSITIONS, POSITION_LIST, REENTRY_RULE } from '../utils/constants.js';

export class DefenseManager {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container - DOM container (LiveRecord's container)
   * @param {import('../core/GameEngine.js').GameEngine} opts.engine
   * @param {string} opts.side - 'away' or 'home'
   * @param {object} [opts.options]
   * @param {boolean} [opts.options.focusPitcher] - auto-highlight pitcher row
   * @param {boolean} [opts.options.isConfirmation] - triggered by half-inning change
   * @param {Function} [opts.onClose] - callback when panel closes
   */
  constructor({ container, engine, side, options = {}, onClose }) {
    this.container = container;
    this.engine = engine;
    this.side = side;
    this.options = options;
    this.onClose = onClose;

    // Draft state: working copy of positions (not committed yet)
    this.draft = this._buildDraft();
    // Snapshot of original state for diff highlighting
    this.originalState = this._snapshotDraft();
    this.pendingChanges = []; // array of change objects for engine
    this.removedPlayers = []; // players subbed OUT in this draft

    // DH rule tracking
    this.hadDHOriginal = this.draft.fielders.some(f => f.position === 'DH');
    this.dhForfeited = false; // set to true when DH is lost

    this._render();
  }

  // ═══════════════════════════════════════════════
  // Build draft from current lineup
  // ═══════════════════════════════════════════════

  _buildDraft() {
    const game = this.engine.game;
    const lineup = game.lineups[this.side];
    const team = game.teams[this.side];

    // Build roster map
    const playerMap = {};
    team.players.forEach(p => { playerMap[p.id] = p; });

    // Current fielders from starters
    const fielders = lineup.starters
      .filter(s => s.isActive)
      .map(s => ({
        playerId: s.playerId,
        player: playerMap[s.playerId],
        position: s.position,
        order: s.order,
        isOriginal: true // was on field before this draft
      }));

    // Current pitcher
    const pitcherId = lineup.pitcher?.playerId;

    return {
      fielders,
      pitcherId,
      playerMap,
      team,
      lineup
    };
  }

  _snapshotDraft() {
    return new Map(this.draft.fielders.map(f => [f.order, { playerId: f.playerId, position: f.position }]));
  }

  /**
   * Determine visual change type for a fielder row.
   * @returns {'new'|'moved'|null}
   */
  _getRowChangeType(fielder) {
    if (this.pendingChanges.length === 0) return null;
    const orig = this.originalState.get(fielder.order);
    if (!orig) return 'new'; // new slot shouldn't happen, but safe fallback
    if (orig.playerId !== fielder.playerId) return 'new'; // different person → substituted in
    if (orig.position !== fielder.position) return 'moved'; // same person, different position
    return null;
  }

  /**
   * Check if DH position can be assigned.
   * - Not allowed if lineup never had DH (pitcher bats)
   * - Not allowed if DH was forfeited (DH moved to field position)
   */
  _isDHAvailable() {
    if (!this.hadDHOriginal) return false;
    if (this.dhForfeited) return false;
    return true;
  }

  /**
   * Check if a position is valid to assign given DH rules.
   */
  _isPositionAllowed(pos) {
    if (pos === 'DH' && !this._isDHAvailable()) return false;
    return true;
  }

  // ═══════════════════════════════════════════════
  // Get available bench players (respecting reentry)
  // ═══════════════════════════════════════════════

  _getAvailableBench() {
    const game = this.engine.game;
    const team = game.teams[this.side];
    const lineup = game.lineups[this.side];
    const reentryRule = game.mode?.reentryRule || REENTRY_RULE.NONE;

    // Active player IDs (including draft changes)
    const activeIds = new Set(this.draft.fielders.map(f => f.playerId));

    // Players removed in this draft session are NOT in substitutions yet
    const subbedOutIds = new Set(
      lineup.substitutions.map(sub => sub.playerOut)
    );
    // Also add players removed in this draft
    this.removedPlayers.forEach(id => subbedOutIds.add(id));

    return team.players.filter(p => {
      if (activeIds.has(p.id)) return false;
      if (!subbedOutIds.has(p.id)) return true;

      // Was subbed out before — check reentry
      if (reentryRule === REENTRY_RULE.FREE) return true;
      if (reentryRule === REENTRY_RULE.SAME_SLOT) {
        // Allow only if they can go back to original slot
        // (we'll check specific slot at assignment time)
        return true;
      }
      return false; // NONE
    });
  }

  // ═══════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════

  _render() {
    // Remove previous
    if (this._overlay) this._overlay.remove();

    const overlay = createElement('div', { className: 'modal-overlay active defense-mgr-overlay' });
    this._overlay = overlay;

    const panel = createElement('div', { className: 'defense-mgr' });

    // Header
    const teamName = this.draft.team.name;
    const header = createElement('div', { className: 'defense-mgr__header' });
    const title = this.options.isConfirmation
      ? `守備確認 (${teamName})`
      : `守備調度 (${teamName})`;
    header.appendChild(createElement('span', { className: 'defense-mgr__title', textContent: title }));
    header.appendChild(createElement('button', {
      className: 'btn btn--icon btn--sm',
      textContent: '✕',
      onClick: () => this._close()
    }));
    panel.appendChild(header);

    if (this.options.isConfirmation) {
      const hintText = (this.options.recentSubPlayerIds || []).length > 0
        ? '本半局有代打/代跑（橘色標示），請確認守備位置'
        : '本半局有代打/代跑，請確認守備位置';
      panel.appendChild(createElement('div', {
        className: 'defense-mgr__hint',
        textContent: hintText
      }));
    }

    // Fielder list
    const list = createElement('div', { className: 'defense-mgr__list' });
    const posOrder = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

    // Sort fielders by position order
    const sorted = [...this.draft.fielders].sort((a, b) => {
      return posOrder.indexOf(a.position) - posOrder.indexOf(b.position);
    });

    sorted.forEach(f => {
      const isPitcher = f.playerId === this.draft.pitcherId;
      const isRecentSub = (this.options.recentSubPlayerIds || []).includes(f.playerId);
      const changeType = this._getRowChangeType(f); // 'new' | 'moved' | null

      let rowClass = 'defense-mgr__row';
      if (changeType === 'new') rowClass += ' defense-mgr__row--new';
      else if (changeType === 'moved') rowClass += ' defense-mgr__row--moved';
      else if (isRecentSub) rowClass += ' defense-mgr__row--recent-sub';
      else if (isPitcher) rowClass += ' defense-mgr__row--pitcher';

      const row = createElement('div', { className: rowClass });

      row.appendChild(createElement('span', {
        className: 'defense-mgr__pos',
        textContent: f.position
      }));

      const playerSpan = createElement('span', {
        className: 'defense-mgr__player',
        textContent: `#${f.player?.number || '?'} ${f.player?.name || ''}`
      });
      // Add a small badge for changed rows
      if (changeType === 'new') {
        playerSpan.appendChild(createElement('span', {
          className: 'defense-mgr__badge defense-mgr__badge--new',
          textContent: 'NEW'
        }));
      } else if (changeType === 'moved') {
        playerSpan.appendChild(createElement('span', {
          className: 'defense-mgr__badge defense-mgr__badge--moved',
          textContent: '移'
        }));
      }
      row.appendChild(playerSpan);

      const actions = createElement('div', { className: 'defense-mgr__actions' });

      const isDH = f.position === 'DH';

      if (isDH) {
        // DH can only: be replaced by bench, or forfeit DH
        actions.appendChild(createElement('button', {
          className: 'btn btn--xs btn--outline',
          textContent: '換人',
          onClick: () => this._showBenchOptions(f)
        }));
        if (!this.dhForfeited) {
          actions.appendChild(createElement('button', {
            className: 'btn btn--xs btn--outline',
            style: 'color:var(--color-strike);border-color:var(--color-strike)',
            textContent: '取消DH',
            onClick: () => this._forfeitDH(f)
          }));
        }
      } else {
        // Regular fielders: swap position (excluding DH targets) + bench replace
        const isPitcher = f.playerId === this.draft.pitcherId;
        actions.appendChild(createElement('button', {
          className: 'btn btn--xs btn--outline',
          textContent: '換位',
          onClick: () => this._showPositionOptions(f)
        }));
        actions.appendChild(createElement('button', {
          className: 'btn btn--xs btn--outline',
          textContent: isPitcher ? '換投' : '換人',
          onClick: () => this._showBenchOptions(f)
        }));
      }

      row.appendChild(actions);
      list.appendChild(row);
    });

    panel.appendChild(list);

    // Pending changes summary
    if (this.pendingChanges.length > 0) {
      const summary = createElement('div', { className: 'defense-mgr__summary' });
      summary.appendChild(createElement('div', {
        className: 'defense-mgr__summary-title',
        textContent: `待確認異動 (${this.pendingChanges.length})`
      }));

      this.pendingChanges.forEach((c, idx) => {
        const line = createElement('div', { className: 'defense-mgr__summary-item' });
        line.appendChild(createElement('span', { textContent: this._describeChange(c) }));
        line.appendChild(createElement('button', {
          className: 'btn btn--xs btn--text',
          textContent: '✕',
          onClick: () => this._undoChange(idx)
        }));
        summary.appendChild(line);
      });

      panel.appendChild(summary);
    }

    // Footer buttons
    const footer = createElement('div', { className: 'defense-mgr__footer' });

    // Double Switch button (only for non-DH lineups)
    if (!this.hadDHOriginal) {
      footer.appendChild(createElement('button', {
        className: 'btn btn--outline btn--sm',
        textContent: '雙重換人',
        onClick: () => this._showDoubleSwitch()
      }));
    }

    if (this.pendingChanges.length > 0) {
      footer.appendChild(createElement('button', {
        className: 'btn btn--outline btn--sm',
        textContent: '重置',
        onClick: () => this._resetDraft()
      }));
    }

    footer.appendChild(createElement('button', {
      className: 'btn btn--primary btn--sm',
      textContent: this.pendingChanges.length > 0 ? '確認調度' : (this.options.isConfirmation ? '守備不變' : '關閉'),
      onClick: () => this._confirm()
    }));

    panel.appendChild(footer);
    overlay.appendChild(panel);

    // Don't close on overlay click for confirmation mode
    if (!this.options.isConfirmation) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this._close();
      });
    }

    this.container.appendChild(overlay);
  }

  // ═══════════════════════════════════════════════
  // Position swap / change
  // ═══════════════════════════════════════════════

  _showPositionOptions(fielder) {
    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `<div class="modal__title">調整位置 — #${fielder.player?.number || '?'} ${fielder.player?.name || ''}</div>`;

    const body = createElement('div', { className: 'modal__body', style: 'max-height:50vh;overflow-y:auto' });

    // Option 1: Swap with another fielder (exclude DH — DH cannot swap positions)
    body.appendChild(createElement('div', {
      className: 'defense-mgr__section-label',
      textContent: '與場上球員互換位置'
    }));

    this.draft.fielders
      .filter(f => f.playerId !== fielder.playerId && f.position !== 'DH')
      .forEach(other => {
        const isPitcherSwap = other.playerId === this.draft.pitcherId || fielder.playerId === this.draft.pitcherId;
        const label = isPitcherSwap
          ? `⚠️ ↔ ${other.position} #${other.player?.number || '?'} ${other.player?.name || ''} (將更換投手)`
          : `↔ ${other.position} #${other.player?.number || '?'} ${other.player?.name || ''}`;

        body.appendChild(createElement('button', {
          className: `btn btn--outline btn--full mb-sm${isPitcherSwap ? ' btn--pitcher-warn' : ''}`,
          textContent: label,
          style: isPitcherSwap ? 'border-color:var(--color-strike);color:var(--color-strike)' : '',
          onClick: () => {
            if (isPitcherSwap) {
              // Confirm before swapping with pitcher
              this._confirmPitcherSwap(fielder, other, overlay);
            } else {
              this._addPositionSwap(fielder, other);
              overlay.remove();
            }
          }
        }));
      });

    // Option 2: Change to an unoccupied position
    const occupiedPositions = new Set(this.draft.fielders.map(f => f.position));
    const freePositions = POSITION_LIST.filter(p =>
      !occupiedPositions.has(p) && this._isPositionAllowed(p)
    );

    if (freePositions.length > 0) {
      body.appendChild(createElement('div', {
        className: 'defense-mgr__section-label',
        textContent: '移至空位'
      }));

      freePositions.forEach(pos => {
        const becomingPitcher = pos === 'P';
        const label = becomingPitcher
          ? `⚠️ → ${pos} (${POSITIONS[pos]?.name || pos}) — 將更換投手`
          : `→ ${pos} (${POSITIONS[pos]?.name || pos})`;

        body.appendChild(createElement('button', {
          className: 'btn btn--outline btn--full mb-sm',
          textContent: label,
          style: becomingPitcher ? 'border-color:var(--color-strike);color:var(--color-strike)' : '',
          onClick: () => {
            if (becomingPitcher) {
              this._confirmBecomePitcher(fielder, pos, overlay);
            } else {
              this._addPositionChange(fielder, pos);
              overlay.remove();
            }
          }
        }));
      });
    }

    const actions = createElement('div', { className: 'modal__actions' });
    actions.appendChild(createElement('button', {
      className: 'btn btn--outline',
      textContent: '取消',
      onClick: () => overlay.remove()
    }));
    modal.appendChild(body);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    this.container.appendChild(overlay);
  }

  /**
   * Confirm dialog before swapping positions with the pitcher
   */
  _confirmPitcherSwap(fielder, pitcherFielder, parentOverlay) {
    const currentPitcher = pitcherFielder.playerId === this.draft.pitcherId ? pitcherFielder : fielder;
    const newPitcher = pitcherFielder.playerId === this.draft.pitcherId ? fielder : pitcherFielder;

    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `
      <div class="modal__title">⚠️ 確認更換投手</div>
      <div class="modal__body" style="text-align:center;padding:var(--space-md)">
        <p style="margin-bottom:var(--space-sm)">此操作將更換投手：</p>
        <p style="font-size:1.1rem;margin-bottom:var(--space-sm)">
          <strong>#${currentPitcher.player?.number} ${currentPitcher.player?.name || ''}</strong> (目前投手)
          <br>↓ 換位為 ${newPitcher.position}<br>
          <strong>#${newPitcher.player?.number} ${newPitcher.player?.name || ''}</strong> 將成為新投手
        </p>
      </div>`;
    const actions = createElement('div', { className: 'modal__actions' });
    actions.appendChild(createElement('button', {
      className: 'btn btn--outline',
      textContent: '取消',
      onClick: () => overlay.remove()
    }));
    actions.appendChild(createElement('button', {
      className: 'btn btn--primary',
      textContent: '確認換投',
      onClick: () => {
        this._addPositionSwap(fielder, pitcherFielder);
        overlay.remove();
        parentOverlay.remove();
      }
    }));
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    this.container.appendChild(overlay);
  }

  /**
   * Confirm dialog before moving a player to pitcher position
   */
  _confirmBecomePitcher(fielder, pos, parentOverlay) {
    const currentPitcherId = this.draft.pitcherId;
    const currentPitcher = this.draft.fielders.find(f => f.playerId === currentPitcherId);
    const currentPLabel = currentPitcher
      ? `#${currentPitcher.player?.number} ${currentPitcher.player?.name || ''}`
      : '(目前投手)';

    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `
      <div class="modal__title">⚠️ 確認更換投手</div>
      <div class="modal__body" style="text-align:center;padding:var(--space-md)">
        <p style="margin-bottom:var(--space-sm)">此操作將更換投手：</p>
        <p style="font-size:1.1rem">
          <strong>#${fielder.player?.number} ${fielder.player?.name || ''}</strong>
          (${fielder.position} → P) 將成為新投手
        </p>
        <p style="color:var(--text-secondary);margin-top:var(--space-sm)">
          原投手 ${currentPLabel} 將不再擔任投手
        </p>
      </div>`;
    const actions = createElement('div', { className: 'modal__actions' });
    actions.appendChild(createElement('button', {
      className: 'btn btn--outline',
      textContent: '取消',
      onClick: () => overlay.remove()
    }));
    actions.appendChild(createElement('button', {
      className: 'btn btn--primary',
      textContent: '確認換投',
      onClick: () => {
        this._addPositionChange(fielder, pos);
        overlay.remove();
        parentOverlay.remove();
      }
    }));
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    this.container.appendChild(overlay);
  }

  // ═══════════════════════════════════════════════
  // Bench substitution
  // ═══════════════════════════════════════════════

  _showBenchOptions(fielder) {
    const bench = this._getAvailableBench();
    if (bench.length === 0) {
      showToast('沒有可用的替補球員');
      return;
    }

    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    const isPitcher = fielder.playerId === this.draft.pitcherId;
    const titleText = isPitcher
      ? `換投 — 替換 #${fielder.player?.number || '?'} ${fielder.player?.name || ''}`
      : `替換 #${fielder.player?.number || '?'} ${fielder.player?.name || ''}`;
    const subtitle = isPitcher
      ? '選擇新投手上場'
      : `選擇板凳球員上場守 ${fielder.position}`;
    modal.innerHTML = `<div class="modal__title">${titleText}</div>
      <p style="color:var(--text-secondary);margin-bottom:var(--space-md)">${subtitle}</p>`;

    const body = createElement('div', { className: 'modal__body', style: 'max-height:50vh;overflow-y:auto' });

    bench.forEach(p => {
      body.appendChild(createElement('button', {
        className: 'btn btn--outline btn--full mb-sm',
        textContent: `#${p.number}  ${p.name || `球員${p.number}`}`,
        onClick: () => {
          this._addSubstitution(fielder, p);
          overlay.remove();
        }
      }));
    });

    const actions = createElement('div', { className: 'modal__actions' });
    actions.appendChild(createElement('button', {
      className: 'btn btn--outline',
      textContent: '取消',
      onClick: () => overlay.remove()
    }));
    modal.appendChild(body);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    this.container.appendChild(overlay);
  }

  /**
   * Forfeit DH: remove DH position, pitcher must enter batting lineup at the DH's slot.
   * The DH player is removed, and the pitcher takes their batting order.
   */
  _forfeitDH(dhFielder) {
    const idx = this.draft.fielders.indexOf(dhFielder);
    if (idx < 0) return;

    const dhOrder = dhFielder.order;
    const dhPlayerId = dhFielder.playerId;

    // Remove DH from draft fielders
    this.draft.fielders.splice(idx, 1);
    this.removedPlayers.push(dhPlayerId);
    this.dhForfeited = true;

    // Add pitcher to batting lineup at the DH's batting order slot
    const pitcherId = this.draft.pitcherId;
    const pitcherPlayer = this.draft.playerMap[pitcherId];
    if (pitcherId && pitcherPlayer) {
      // Check if pitcher is already in fielders (shouldn't be in DH lineup, but safety check)
      const existingPitcher = this.draft.fielders.find(f => f.playerId === pitcherId);
      if (!existingPitcher) {
        this.draft.fielders.push({
          playerId: pitcherId,
          player: pitcherPlayer,
          position: 'P',
          order: dhOrder,
          isOriginal: false
        });
      }
    }

    this.pendingChanges.push({
      type: 'forfeit-dh',
      dhPlayerId: dhPlayerId,
      dhPlayerName: `#${dhFielder.player?.number} ${dhFielder.player?.name || ''}`,
      dhOrder: dhOrder,
      side: this.side
    });

    this._render();
  }

  // ═══════════════════════════════════════════════
  // Double Switch (non-DH lineups only)
  // ═══════════════════════════════════════════════

  _showDoubleSwitch() {
    // Double Switch: simultaneously replace two players and swap their batting orders
    // Typically used to keep the new pitcher from batting soon
    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `<div class="modal__title">雙重換人 (Double Switch)</div>
      <p style="color:var(--text-secondary);margin-bottom:var(--space-md)">
        同時換下兩名球員，新球員的守位與棒次互換
      </p>`;

    const body = createElement('div', { className: 'modal__body', style: 'max-height:55vh;overflow-y:auto' });

    // Step 1: Select two fielders to remove
    body.appendChild(createElement('div', {
      className: 'defense-mgr__section-label',
      textContent: '選擇要換下的第一位球員'
    }));

    this.draft.fielders.forEach(f => {
      body.appendChild(createElement('button', {
        className: 'btn btn--outline btn--full mb-sm',
        textContent: `${f.position} #${f.player?.number || '?'} ${f.player?.name || ''} (${f.order}棒)`,
        onClick: () => {
          overlay.remove();
          this._doubleSwitchStep2(f);
        }
      }));
    });

    const actions = createElement('div', { className: 'modal__actions' });
    actions.appendChild(createElement('button', {
      className: 'btn btn--outline',
      textContent: '取消',
      onClick: () => overlay.remove()
    }));
    modal.appendChild(body);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    this.container.appendChild(overlay);
  }

  _doubleSwitchStep2(firstFielder) {
    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `<div class="modal__title">雙重換人 — 選第二位</div>
      <p style="color:var(--text-secondary);margin-bottom:var(--space-md)">
        已選：${firstFielder.position} #${firstFielder.player?.number} ${firstFielder.player?.name || ''}
      </p>`;

    const body = createElement('div', { className: 'modal__body', style: 'max-height:55vh;overflow-y:auto' });

    this.draft.fielders
      .filter(f => f.playerId !== firstFielder.playerId)
      .forEach(f => {
        body.appendChild(createElement('button', {
          className: 'btn btn--outline btn--full mb-sm',
          textContent: `${f.position} #${f.player?.number || '?'} ${f.player?.name || ''} (${f.order}棒)`,
          onClick: () => {
            overlay.remove();
            this._doubleSwitchSelectSubs(firstFielder, f);
          }
        }));
      });

    const actions = createElement('div', { className: 'modal__actions' });
    actions.appendChild(createElement('button', {
      className: 'btn btn--outline',
      textContent: '取消',
      onClick: () => overlay.remove()
    }));
    modal.appendChild(body);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    this.container.appendChild(overlay);
  }

  _doubleSwitchSelectSubs(fieldA, fieldB) {
    const bench = this._getAvailableBench();
    if (bench.length < 2) {
      showToast('板凳球員不足，無法雙重換人');
      return;
    }

    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `<div class="modal__title">雙重換人 — 選替補</div>
      <p style="color:var(--text-secondary);margin-bottom:var(--space-md)">
        替補1 → 守 ${fieldA.position}（${fieldB.order}棒）<br>
        替補2 → 守 ${fieldB.position}（${fieldA.order}棒）
      </p>`;

    const body = createElement('div', { className: 'modal__body', style: 'max-height:50vh;overflow-y:auto' });

    body.appendChild(createElement('div', {
      className: 'defense-mgr__section-label',
      textContent: `選擇替補1：守 ${fieldA.position}（接 ${fieldB.order}棒）`
    }));

    bench.forEach(p => {
      body.appendChild(createElement('button', {
        className: 'btn btn--outline btn--full mb-sm',
        textContent: `#${p.number} ${p.name || `球員${p.number}`}`,
        onClick: () => {
          overlay.remove();
          this._doubleSwitchFinalPick(fieldA, fieldB, p);
        }
      }));
    });

    const actions = createElement('div', { className: 'modal__actions' });
    actions.appendChild(createElement('button', {
      className: 'btn btn--outline',
      textContent: '取消',
      onClick: () => overlay.remove()
    }));
    modal.appendChild(body);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    this.container.appendChild(overlay);
  }

  _doubleSwitchFinalPick(fieldA, fieldB, sub1) {
    const bench = this._getAvailableBench().filter(p => p.id !== sub1.id);
    if (bench.length === 0) {
      showToast('板凳球員不足');
      return;
    }

    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' });
    modal.innerHTML = `<div class="modal__title">雙重換人 — 選替補2</div>
      <p style="color:var(--text-secondary);margin-bottom:var(--space-md)">
        替補1：#${sub1.number} ${sub1.name || ''} → ${fieldA.position}<br>
        選擇替補2 → 守 ${fieldB.position}（接 ${fieldA.order}棒）
      </p>`;

    const body = createElement('div', { className: 'modal__body', style: 'max-height:50vh;overflow-y:auto' });

    bench.forEach(p => {
      body.appendChild(createElement('button', {
        className: 'btn btn--outline btn--full mb-sm',
        textContent: `#${p.number} ${p.name || `球員${p.number}`}`,
        onClick: () => {
          overlay.remove();
          // Execute: sub1 takes fieldA's position at fieldB's batting order
          //          sub2 takes fieldB's position at fieldA's batting order
          this._executeDoubleSwitch(fieldA, fieldB, sub1, p);
        }
      }));
    });

    const actions = createElement('div', { className: 'modal__actions' });
    actions.appendChild(createElement('button', {
      className: 'btn btn--outline',
      textContent: '取消',
      onClick: () => overlay.remove()
    }));
    modal.appendChild(body);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    this.container.appendChild(overlay);
  }

  _executeDoubleSwitch(fieldA, fieldB, sub1, sub2) {
    // sub1 replaces fieldA, takes fieldA's position but fieldB's batting order
    // sub2 replaces fieldB, takes fieldB's position but fieldA's batting order

    // Step 1: sub both out
    this.removedPlayers.push(fieldA.playerId, fieldB.playerId);

    const idxA = this.draft.fielders.indexOf(fieldA);
    const idxB = this.draft.fielders.indexOf(fieldB);

    // sub1 → fieldA position, fieldB order
    this.draft.fielders[idxA] = {
      playerId: sub1.id,
      player: sub1,
      position: fieldA.position,
      order: fieldB.order,
      isOriginal: false
    };

    // sub2 → fieldB position, fieldA order
    this.draft.fielders[idxB] = {
      playerId: sub2.id,
      player: sub2,
      position: fieldB.position,
      order: fieldA.order,
      isOriginal: false
    };

    // Update pitcher if either was pitcher
    if (this.draft.pitcherId === fieldA.playerId) {
      this.draft.pitcherId = sub1.id;
    } else if (this.draft.pitcherId === fieldB.playerId) {
      this.draft.pitcherId = sub2.id;
    }

    this.pendingChanges.push({
      type: 'double-switch',
      outA: { playerId: fieldA.playerId, name: `#${fieldA.player?.number} ${fieldA.player?.name || ''}`, position: fieldA.position, order: fieldA.order },
      outB: { playerId: fieldB.playerId, name: `#${fieldB.player?.number} ${fieldB.player?.name || ''}`, position: fieldB.position, order: fieldB.order },
      inA: { playerId: sub1.id, name: `#${sub1.number} ${sub1.name || ''}`, position: fieldA.position, order: fieldB.order },
      inB: { playerId: sub2.id, name: `#${sub2.number} ${sub2.name || ''}`, position: fieldB.position, order: fieldA.order },
      side: this.side
    });

    this._render();
  }

  // ═══════════════════════════════════════════════
  // Draft manipulation
  // ═══════════════════════════════════════════════

  _addPositionSwap(fielderA, fielderB) {
    // Swap positions in draft
    const tmpPos = fielderA.position;
    fielderA.position = fielderB.position;
    fielderB.position = tmpPos;

    // If one is pitcher, update draft pitcherId
    if (this.draft.pitcherId === fielderA.playerId) {
      this.draft.pitcherId = fielderB.playerId;
    } else if (this.draft.pitcherId === fielderB.playerId) {
      this.draft.pitcherId = fielderA.playerId;
    }

    this.pendingChanges.push({
      type: 'position-swap',
      playerAId: fielderA.playerId,
      playerBId: fielderB.playerId,
      playerAName: `#${fielderA.player?.number} ${fielderA.player?.name || ''}`,
      playerBName: `#${fielderB.player?.number} ${fielderB.player?.name || ''}`,
      posA: fielderA.position, // after swap
      posB: fielderB.position,
      side: this.side
    });

    this._render();
  }

  _addPositionChange(fielder, newPosition) {
    const oldPosition = fielder.position;
    fielder.position = newPosition;

    // DH forfeit: DH moves to a field position (non-swap), DH slot becomes empty
    if (oldPosition === 'DH' && newPosition !== 'DH') {
      this.dhForfeited = true;
    }

    // If becoming pitcher
    if (newPosition === 'P') {
      this.draft.pitcherId = fielder.playerId;
    }

    this.pendingChanges.push({
      type: 'position-change',
      playerId: fielder.playerId,
      playerName: `#${fielder.player?.number} ${fielder.player?.name || ''}`,
      oldPosition,
      newPosition,
      dhForfeited: oldPosition === 'DH' && newPosition !== 'DH',
      side: this.side
    });

    this._render();
  }

  _addSubstitution(fielder, benchPlayer) {
    // Replace in draft
    const idx = this.draft.fielders.indexOf(fielder);
    if (idx >= 0) {
      this.removedPlayers.push(fielder.playerId);

      this.draft.fielders[idx] = {
        playerId: benchPlayer.id,
        player: benchPlayer,
        position: fielder.position,
        order: fielder.order,
        isOriginal: false
      };

      // If replacing pitcher
      if (this.draft.pitcherId === fielder.playerId) {
        this.draft.pitcherId = benchPlayer.id;
      }
    }

    this.pendingChanges.push({
      type: 'substitute',
      playerInId: benchPlayer.id,
      playerOutId: fielder.playerId,
      playerInName: `#${benchPlayer.number} ${benchPlayer.name || ''}`,
      playerOutName: `#${fielder.player?.number} ${fielder.player?.name || ''}`,
      position: fielder.position,
      order: fielder.order,
      side: this.side
    });

    this._render();
  }

  _undoChange(index) {
    // Reset everything and replay remaining changes
    const removed = this.pendingChanges.splice(index, 1);

    // Full rebuild: reset draft and re-apply remaining changes
    this.draft = this._buildDraft();
    this.removedPlayers = [];
    this.dhForfeited = false;

    const remainingChanges = [...this.pendingChanges];
    this.pendingChanges = [];

    for (const change of remainingChanges) {
      if (change.type === 'position-swap') {
        const a = this.draft.fielders.find(f => f.playerId === change.playerAId);
        const b = this.draft.fielders.find(f => f.playerId === change.playerBId);
        if (a && b) this._addPositionSwap(a, b);
      } else if (change.type === 'position-change') {
        const f = this.draft.fielders.find(f => f.playerId === change.playerId);
        if (f) this._addPositionChange(f, change.newPosition);
      } else if (change.type === 'substitute') {
        const f = this.draft.fielders.find(f => f.playerId === change.playerOutId);
        const p = this.draft.playerMap[change.playerInId] || this.draft.team.players.find(pl => pl.id === change.playerInId);
        if (f && p) this._addSubstitution(f, p);
      } else if (change.type === 'forfeit-dh') {
        const dhF = this.draft.fielders.find(f => f.playerId === change.dhPlayerId);
        if (dhF) this._forfeitDH(dhF);
      } else if (change.type === 'double-switch') {
        const fA = this.draft.fielders.find(f => f.playerId === change.outA.playerId);
        const fB = this.draft.fielders.find(f => f.playerId === change.outB.playerId);
        const s1 = this.draft.playerMap[change.inA.playerId] || this.draft.team.players.find(pl => pl.id === change.inA.playerId);
        const s2 = this.draft.playerMap[change.inB.playerId] || this.draft.team.players.find(pl => pl.id === change.inB.playerId);
        if (fA && fB && s1 && s2) this._executeDoubleSwitch(fA, fB, s1, s2);
      }
    }

    // _addXxx calls _render at the end, but if remainingChanges is empty we need a manual render
    if (remainingChanges.length === 0) {
      this._render();
    }
  }

  _resetDraft() {
    this.draft = this._buildDraft();
    this.pendingChanges = [];
    this.removedPlayers = [];
    this.dhForfeited = false;
    this._render();
  }

  // ═══════════════════════════════════════════════
  // Describe change for summary
  // ═══════════════════════════════════════════════

  _describeChange(change) {
    if (change.type === 'substitute') {
      return `${change.playerOutName} 退場 → ${change.playerInName} 上場 (${change.position})`;
    }
    if (change.type === 'position-swap') {
      return `${change.playerAName} (${change.posA}) ↔ ${change.playerBName} (${change.posB})`;
    }
    if (change.type === 'position-change') {
      let desc = `${change.playerName}: ${change.oldPosition} → ${change.newPosition}`;
      if (change.dhForfeited) desc += ' ⚠️ DH取消';
      return desc;
    }
    if (change.type === 'forfeit-dh') {
      return `⚠️ 取消DH制度 — ${change.dhPlayerName} 退出打線，投手進入打線`;
    }
    if (change.type === 'double-switch') {
      return `雙重換人：${change.outA.name}(${change.outA.order}棒) + ${change.outB.name}(${change.outB.order}棒) 退場 → ${change.inA.name}(${change.inA.order}棒 ${change.inA.position}) + ${change.inB.name}(${change.inB.order}棒 ${change.inB.position})`;
    }
    return JSON.stringify(change);
  }

  // ═══════════════════════════════════════════════
  // Confirm / Close
  // ═══════════════════════════════════════════════

  _confirm() {
    if (this.pendingChanges.length > 0) {
      // Build engine-format changes (strip display-only fields)
      const engineChanges = [];
      for (const c of this.pendingChanges) {
        if (c.type === 'substitute') {
          engineChanges.push({
            type: 'substitute',
            playerInId: c.playerInId,
            playerOutId: c.playerOutId,
            position: c.position,
            order: c.order,
            side: c.side
          });
        } else if (c.type === 'position-swap') {
          engineChanges.push({
            type: 'position-swap',
            playerAId: c.playerAId,
            playerBId: c.playerBId,
            side: c.side
          });
        } else if (c.type === 'position-change') {
          engineChanges.push({
            type: 'position-change',
            playerId: c.playerId,
            newPosition: c.newPosition,
            side: c.side
          });
        } else if (c.type === 'forfeit-dh') {
          // DH forfeit: remove DH, pitcher enters batting lineup
          engineChanges.push({
            type: 'forfeit-dh',
            dhPlayerId: c.dhPlayerId,
            dhOrder: c.dhOrder,
            side: c.side
          });
        } else if (c.type === 'double-switch') {
          // Expand to two substitute + batting order swap
          engineChanges.push({
            type: 'substitute',
            playerInId: c.inA.playerId,
            playerOutId: c.outA.playerId,
            position: c.inA.position,
            order: c.inA.order, // swapped order
            side: c.side
          });
          engineChanges.push({
            type: 'substitute',
            playerInId: c.inB.playerId,
            playerOutId: c.outB.playerId,
            position: c.inB.position,
            order: c.inB.order, // swapped order
            side: c.side
          });
        } else {
          engineChanges.push(c);
        }
      }

      this.engine.batchDefenseChange(engineChanges);
      showToast(`守備調度完成（${this.pendingChanges.length} 項異動）`);
    }

    this._close();
  }

  _close() {
    if (this._overlay) this._overlay.remove();
    if (this.onClose) this.onClose();
  }
}
