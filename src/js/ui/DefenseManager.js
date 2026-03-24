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

      // Swap position button
      actions.appendChild(createElement('button', {
        className: 'btn btn--xs btn--outline',
        textContent: '換位',
        onClick: () => this._showPositionOptions(f)
      }));

      // Replace with bench button
      actions.appendChild(createElement('button', {
        className: 'btn btn--xs btn--outline',
        textContent: '換人',
        onClick: () => this._showBenchOptions(f)
      }));

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

    // Option 1: Swap with another fielder
    body.appendChild(createElement('div', {
      className: 'defense-mgr__section-label',
      textContent: '與場上球員互換位置'
    }));

    this.draft.fielders
      .filter(f => f.playerId !== fielder.playerId)
      .forEach(other => {
        body.appendChild(createElement('button', {
          className: 'btn btn--outline btn--full mb-sm',
          textContent: `↔ ${other.position} #${other.player?.number || '?'} ${other.player?.name || ''}`,
          onClick: () => {
            this._addPositionSwap(fielder, other);
            overlay.remove();
          }
        }));
      });

    // Option 2: Change to an unoccupied position
    const occupiedPositions = new Set(this.draft.fielders.map(f => f.position));
    const freePositions = POSITION_LIST.filter(p => !occupiedPositions.has(p));

    if (freePositions.length > 0) {
      body.appendChild(createElement('div', {
        className: 'defense-mgr__section-label',
        textContent: '移至空位'
      }));

      freePositions.forEach(pos => {
        body.appendChild(createElement('button', {
          className: 'btn btn--outline btn--full mb-sm',
          textContent: `→ ${pos} (${POSITIONS[pos]?.name || pos})`,
          onClick: () => {
            this._addPositionChange(fielder, pos);
            overlay.remove();
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
    modal.innerHTML = `<div class="modal__title">替換 #${fielder.player?.number || '?'} ${fielder.player?.name || ''}</div>
      <p style="color:var(--text-secondary);margin-bottom:var(--space-md)">選擇板凳球員上場守 ${fielder.position}</p>`;

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
      return `${change.playerName}: ${change.oldPosition} → ${change.newPosition}`;
    }
    return JSON.stringify(change);
  }

  // ═══════════════════════════════════════════════
  // Confirm / Close
  // ═══════════════════════════════════════════════

  _confirm() {
    if (this.pendingChanges.length > 0) {
      // Build engine-format changes (strip display-only fields)
      const engineChanges = this.pendingChanges.map(c => {
        if (c.type === 'substitute') {
          return {
            type: 'substitute',
            playerInId: c.playerInId,
            playerOutId: c.playerOutId,
            position: c.position,
            order: c.order,
            side: c.side
          };
        }
        if (c.type === 'position-swap') {
          return {
            type: 'position-swap',
            playerAId: c.playerAId,
            playerBId: c.playerBId,
            side: c.side
          };
        }
        if (c.type === 'position-change') {
          return {
            type: 'position-change',
            playerId: c.playerId,
            newPosition: c.newPosition,
            side: c.side
          };
        }
        return c;
      });

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
