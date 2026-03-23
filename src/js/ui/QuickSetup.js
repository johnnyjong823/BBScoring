/**
 * BBScoring — QuickSetup 快速開始設定
 *
 * Minimal 3-step setup for Quick Start mode:
 * Step 1: Team names + innings + recording mode
 * Step 2: Away lineup
 * Step 3: Home lineup
 *
 * Target: 30 seconds from open to first pitch.
 */
import { createElement, showToast, getTodayStr, getNowTimeStr } from '../utils/helpers.js';
import { RECORDING_MODE, REENTRY_RULE, POSITIONS, POSITION_LIST } from '../utils/constants.js';
import { createGame } from '../models/Game.js';
import { createTeam } from '../models/Team.js';
import { createPlayer } from '../models/Player.js';

export class QuickSetup {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container
   * @param {(game: object) => void} opts.onComplete - Called with the created Game object
   * @param {() => void} opts.onCancel
   */
  constructor({ container, onComplete, onCancel }) {
    this.container = container;
    this.onComplete = onComplete;
    this.onCancel = onCancel;

    this.step = 1;
    this.totalSteps = 3;

    // Step 1 data
    this.awayName = '';
    this.homeName = '';
    this.totalInnings = null;
    this.recordingMode = '';
    this.reentryRule = REENTRY_RULE.NONE;

    // Step 2 data: arrays of { number, position }
    this.awayLineup = Array.from({ length: 9 }, () => ({ number: '', position: '' }));
    this.awayPitcher = { number: '' };
    this.homeLineup = Array.from({ length: 9 }, () => ({ number: '', position: '' }));
    this.homePitcher = { number: '' };
  }

  render() {
    this.container.innerHTML = '';

    const wrapper = createElement('div', 'quick-setup');

    // ── Header ──
    const header = createElement('div', 'quick-setup__header');

    const backBtn = createElement('button', 'quick-setup__back');
    backBtn.textContent = '◀';
    backBtn.addEventListener('click', () => {
      if (this.step > 1) {
        this.step--;
        this.render();
      } else {
        this.onCancel();
      }
    });

    const title = createElement('h2', 'quick-setup__title');
    title.textContent = this._getStepTitle();

    const nextBtn = createElement('button', 'quick-setup__next btn btn--primary');
    nextBtn.textContent = this.step < this.totalSteps ? '下一步 ▶' : '🔔 開始比賽';
    nextBtn.addEventListener('click', () => this._next());

    header.appendChild(backBtn);
    header.appendChild(title);
    header.appendChild(nextBtn);
    wrapper.appendChild(header);

    // ── Step Indicator ──
    const indicator = createElement('div', 'step-indicator');
    for (let i = 1; i <= this.totalSteps; i++) {
      const dot = createElement('span', `step-indicator__dot ${i === this.step ? 'step-indicator__dot--active' : ''} ${i < this.step ? 'step-indicator__dot--done' : ''}`);
      indicator.appendChild(dot);
    }
    wrapper.appendChild(indicator);

    // ── Body ──
    const body = createElement('div', 'quick-setup__body scrollable');
    if (this.step === 1) {
      this._renderStep1(body);
    } else if (this.step === 2) {
      this._renderLineupStep(body, 'away');
    } else {
      this._renderLineupStep(body, 'home');
    }
    wrapper.appendChild(body);

    // ── Bottom Action (thumb-friendly duplicate) ──
    const bottomBar = createElement('div', 'quick-setup__bottom-bar');
    const bottomBtn = createElement('button', 'quick-setup__bottom-btn btn btn--primary');
    bottomBtn.textContent = this.step < this.totalSteps ? '下一步 ▶' : '🔔 開始比賽';
    bottomBtn.addEventListener('click', () => this._next());
    bottomBar.appendChild(bottomBtn);
    wrapper.appendChild(bottomBar);

    this.container.appendChild(wrapper);
  }

  // ═══════════════════════════════════════════════
  // Step 1: Basic Info + Recording Mode
  // ═══════════════════════════════════════════════

  _renderStep1(body) {
    const form = createElement('div', 'quick-setup__form');

    form.innerHTML = `
      <div class="quick-setup__field">
        <label class="quick-setup__label">客隊名稱</label>
        <input type="text" class="quick-setup__input" id="qs-away-name"
               placeholder="客隊" value="${this._esc(this.awayName)}" />
      </div>
      <div class="quick-setup__field">
        <label class="quick-setup__label">主隊名稱</label>
        <input type="text" class="quick-setup__input" id="qs-home-name"
               placeholder="主隊" value="${this._esc(this.homeName)}" />
      </div>
      <div class="quick-setup__field">
        <label class="quick-setup__label">局數</label>
        <div class="quick-setup__innings-group">
          <button class="quick-setup__innings-btn ${this.totalInnings === 5 ? 'quick-setup__innings-btn--active' : ''}" data-innings="5">5 局</button>
          <button class="quick-setup__innings-btn ${this.totalInnings === 7 ? 'quick-setup__innings-btn--active' : ''}" data-innings="7">7 局</button>
          <button class="quick-setup__innings-btn ${this.totalInnings === 9 ? 'quick-setup__innings-btn--active' : ''}" data-innings="9">9 局</button>
        </div>
      </div>
      <div class="quick-setup__field">
        <label class="quick-setup__label">記錄模式</label>
        <div class="quick-setup__mode-group">
          <button class="quick-setup__mode-btn ${this.recordingMode === RECORDING_MODE.RESULT_ONLY ? 'quick-setup__mode-btn--active' : ''}" data-mode="${RECORDING_MODE.RESULT_ONLY}">
            <span class="quick-setup__mode-icon">📋</span>
            <span class="quick-setup__mode-name">僅記結果</span>
            <span class="quick-setup__mode-desc">打擊結果 + 打點得分</span>
          </button>
          <button class="quick-setup__mode-btn ${this.recordingMode === RECORDING_MODE.DETAILED ? 'quick-setup__mode-btn--active' : ''}" data-mode="${RECORDING_MODE.DETAILED}">
            <span class="quick-setup__mode-icon">📊</span>
            <span class="quick-setup__mode-name">詳細記錄</span>
            <span class="quick-setup__mode-desc">逐球記錄 + 方向落點</span>
          </button>
        </div>
      </div>
      <div class="quick-setup__field">
        <label class="quick-setup__label">再上場規則</label>
        <div class="quick-setup__innings-group">
          <button class="quick-setup__reentry-btn ${this.reentryRule === REENTRY_RULE.NONE ? 'quick-setup__innings-btn--active' : ''}" data-reentry="${REENTRY_RULE.NONE}">不可再上場</button>
          <button class="quick-setup__reentry-btn ${this.reentryRule === REENTRY_RULE.SAME_SLOT ? 'quick-setup__innings-btn--active' : ''}" data-reentry="${REENTRY_RULE.SAME_SLOT}">限原棒次</button>
          <button class="quick-setup__reentry-btn ${this.reentryRule === REENTRY_RULE.FREE ? 'quick-setup__innings-btn--active' : ''}" data-reentry="${REENTRY_RULE.FREE}">不限制</button>
        </div>
      </div>
    `;

    // Event bindings
    form.querySelectorAll('.quick-setup__innings-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.totalInnings = parseInt(btn.dataset.innings, 10);
        form.querySelectorAll('.quick-setup__innings-btn').forEach(b =>
          b.classList.toggle('quick-setup__innings-btn--active', b === btn)
        );
      });
    });

    form.querySelectorAll('.quick-setup__mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.recordingMode = btn.dataset.mode;
        form.querySelectorAll('.quick-setup__mode-btn').forEach(b =>
          b.classList.toggle('quick-setup__mode-btn--active', b === btn)
        );
      });
    });

    form.querySelectorAll('.quick-setup__reentry-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.reentryRule = btn.dataset.reentry;
        form.querySelectorAll('.quick-setup__reentry-btn').forEach(b =>
          b.classList.toggle('quick-setup__innings-btn--active', b === btn)
        );
      });
    });

    body.appendChild(form);
  }

  // ═══════════════════════════════════════════════
  // Step 2-3: Team Lineup (Jersey Number Grid)
  // ═══════════════════════════════════════════════

  _renderLineupStep(body, side) {
    const isAway = side === 'away';
    body.appendChild(this._createLineupSection(
      isAway ? (this.awayName || '客隊') : (this.homeName || '主隊'),
      isAway ? this.awayLineup : this.homeLineup,
      isAway ? this.awayPitcher : this.homePitcher,
      side
    ));
  }

  _createLineupSection(teamName, lineup, pitcher, side) {
    const section = createElement('div', 'quick-setup__lineup-section');

    const titleRow = createElement('div', 'quick-setup__lineup-title');
    titleRow.innerHTML = `<h3>${this._esc(teamName)} 打序</h3>`;
    section.appendChild(titleRow);

    section.appendChild(createElement('p', {
      className: 'quick-setup__lineup-hint',
      textContent: '背號必填；守備位置可先略過，之後再補。'
    }));

    // Collect used positions for this team: { position → slotIndex }
    const positionOwnerMap = () => {
      const map = {};
      lineup.forEach((s, i) => { if (s.position) map[s.position] = i; });
      return map;
    };

    // 9-slot grid
    const grid = createElement('div', 'quick-setup__lineup-grid');
    for (let i = 0; i < 9; i++) {
      const slot = createElement('div', 'quick-setup__lineup-slot');
      const owners = positionOwnerMap();
      const posOptions = this._buildPositionOptions(i, lineup[i].position, owners);

      slot.innerHTML = `
        <span class="quick-setup__slot-order">${i + 1}</span>
        <input type="text" class="quick-setup__slot-number"
               placeholder="#" inputmode="numeric" autocomplete="off"
               value="${lineup[i].number}"
               data-side="${side}" data-index="${i}" />
        <select class="quick-setup__slot-pos" data-side="${side}" data-index="${i}">
          ${posOptions}
        </select>
      `;
      grid.appendChild(slot);
    }

    // Blur → check for duplicate jersey numbers within same team
    grid.addEventListener('focusout', (e) => {
      if (!e.target.classList.contains('quick-setup__slot-number')) return;
      this._validateLineupDuplicates(section, lineup, pitcher, side);
    });

    // Position change → steal from previous owner if taken, then refresh
    grid.addEventListener('change', (e) => {
      const sel = e.target;
      if (!sel.classList.contains('quick-setup__slot-pos')) return;
      const idx = parseInt(sel.dataset.index, 10);
      const arr = sel.dataset.side === 'away' ? this.awayLineup : this.homeLineup;
      const newPos = sel.value;

      // If another slot has this position, clear it (steal)
      if (newPos) {
        arr.forEach((slot, i) => {
          if (i !== idx && slot.position === newPos) {
            slot.position = '';
          }
        });
        // P/DH mutual exclusion: if selecting P, clear any DH; vice versa
        if (newPos === 'P') {
          arr.forEach((slot, i) => { if (i !== idx && slot.position === 'DH') slot.position = ''; });
        } else if (newPos === 'DH') {
          arr.forEach((slot, i) => { if (i !== idx && slot.position === 'P') slot.position = ''; });
        }
      }

      arr[idx].position = newPos;
      this._refreshPositionSelects(grid, arr);
      // Sync pitcher row based on P/DH status
      this._syncPitcherRow(section, arr, side);
      this._validateLineupDuplicates(section, arr, side === 'away' ? this.awayPitcher : this.homePitcher, side);
    });

    section.appendChild(grid);

    // Pitcher row
    const pitcherRow = createElement('div', 'quick-setup__pitcher-row');
    pitcherRow.innerHTML = `
      <span class="quick-setup__pitcher-label">🥎 投手背號</span>
      <input type="text" class="quick-setup__pitcher-number"
             placeholder="#" inputmode="numeric" autocomplete="off"
             value="${pitcher.number}"
             data-side="${side}" />
      <span class="quick-setup__pitcher-hint"></span>
    `;
    const pitInput = pitcherRow.querySelector('.quick-setup__pitcher-number');
    pitInput.addEventListener('input', (e) => {
      if (side === 'away') this.awayPitcher.number = e.target.value;
      else this.homePitcher.number = e.target.value;
      this._validateLineupDuplicates(section, lineup, side === 'away' ? this.awayPitcher : this.homePitcher, side);
    });
    // Blur duplicate check for pitcher input (only when DH mode — pitcher is separate person)
    pitInput.addEventListener('focusout', () => {
      this._validateLineupDuplicates(section, lineup, side === 'away' ? this.awayPitcher : this.homePitcher, side);
    });
    section.appendChild(pitcherRow);

    // Also sync number inputs → pitcher when a batter with P changes number
    grid.addEventListener('input', (e) => {
      const input = e.target;
      if (!input.classList.contains('quick-setup__slot-number')) return;
      const idx = parseInt(input.dataset.index, 10);
      const arr = input.dataset.side === 'away' ? this.awayLineup : this.homeLineup;
      arr[idx].number = input.value;
      // If this batter has position P, sync to pitcher
      if (arr[idx].position === 'P') {
        const pit = side === 'away' ? this.awayPitcher : this.homePitcher;
        pit.number = input.value;
        pitInput.value = input.value;
      }
      this._validateLineupDuplicates(section, arr, side === 'away' ? this.awayPitcher : this.homePitcher, side);
    });

    grid.addEventListener('keydown', (e) => {
      if (!e.target.classList.contains('quick-setup__slot-number')) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();

      const idx = parseInt(e.target.dataset.index, 10);
      const nextInput = grid.querySelector(`.quick-setup__slot-number[data-side="${side}"][data-index="${idx + 1}"]`);
      if (nextInput) nextInput.focus();
      else pitInput.focus();
    });

    grid.addEventListener('keydown', (e) => {
      if (!e.target.classList.contains('quick-setup__slot-pos')) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();

      const idx = parseInt(e.target.dataset.index, 10);
      const nextInput = grid.querySelector(`.quick-setup__slot-number[data-side="${side}"][data-index="${idx + 1}"]`);
      if (nextInput) nextInput.focus();
      else pitInput.focus();
    });

    // Initial sync
    this._syncPitcherRow(section, lineup, side);
    this._validateLineupDuplicates(section, lineup, pitcher, side);

    return section;
  }

  /**
   * Sync pitcher row state based on whether a batter has position P.
   * - Has P in lineup → auto-fill pitcher number from that batter, readonly
   * - Has DH (no P) → pitcher is independent, editable, dup check enforced
   */
  _syncPitcherRow(section, lineup, side) {
    const pitInput = section.querySelector('.quick-setup__pitcher-number');
    const pitHint = section.querySelector('.quick-setup__pitcher-hint');
    if (!pitInput) return;

    const pSlot = lineup.find(s => s.position === 'P');
    const pitcher = side === 'away' ? this.awayPitcher : this.homePitcher;

    if (pSlot) {
      // Batter is the pitcher — auto-fill and lock
      pitcher.number = pSlot.number;
      pitInput.value = pSlot.number;
      pitInput.readOnly = true;
      pitInput.classList.add('quick-setup__pitcher-number--locked');
      pitInput.classList.remove('quick-setup__slot-number--error');
      this._clearSlotError(pitInput);
      if (pitHint) pitHint.textContent = '（自動帶入守位 P 的打者）';
    } else {
      // Pitcher is independent (DH mode or no P assigned yet)
      pitInput.readOnly = false;
      pitInput.classList.remove('quick-setup__pitcher-number--locked');
      if (pitHint) {
        const hasDH = lineup.some(s => s.position === 'DH');
        pitHint.textContent = hasDH ? '（獨立投手，不可與打者同號）' : '';
      }
    }
  }

  _validateLineupDuplicates(section, lineup, pitcher, side) {
    const numberInputs = [...section.querySelectorAll(`.quick-setup__slot-number[data-side="${side}"]`)];
    const pitcherInput = section.querySelector('.quick-setup__pitcher-number');
    const counts = new Map();

    lineup.forEach((slot) => {
      const num = slot.number.trim();
      if (!num) return;
      counts.set(num, (counts.get(num) || 0) + 1);
    });

    const hasPInLineup = lineup.some(slot => slot.position === 'P');
    const pitcherNumber = String(pitcher.number || '').trim();
    const pitcherDuplicatesBatter = Boolean(pitcherNumber && !hasPInLineup && counts.has(pitcherNumber));

    numberInputs.forEach((input, idx) => {
      const num = lineup[idx].number.trim();
      const duplicateInBatters = Boolean(num && (counts.get(num) || 0) > 1);
      const duplicateWithPitcher = Boolean(num && !hasPInLineup && pitcherNumber && pitcherNumber === num);
      if (duplicateInBatters || duplicateWithPitcher) {
        input.classList.add('quick-setup__slot-number--error');
        this._showSlotError(input, duplicateInBatters ? '背號重複' : '與投手背號重複');
      } else {
        input.classList.remove('quick-setup__slot-number--error');
        this._clearSlotError(input);
      }
    });

    if (!pitcherInput) return;

    if (!pitcherNumber || hasPInLineup) {
      pitcherInput.classList.remove('quick-setup__slot-number--error');
      this._clearSlotError(pitcherInput);
      return;
    }

    if (pitcherDuplicatesBatter) {
      pitcherInput.classList.add('quick-setup__slot-number--error');
      this._showSlotError(pitcherInput, '投手與打者不可同背號');
    } else {
      pitcherInput.classList.remove('quick-setup__slot-number--error');
      this._clearSlotError(pitcherInput);
    }
  }

  /**
   * Build <option> HTML for a position select.
   * Taken positions are still selectable but shown with "(N棒)" hint.
   * P/DH conflict shown as disabled.
   */
  _buildPositionOptions(slotIndex, currentPos, ownerMap) {
    const usedPositions = Object.keys(ownerMap);
    let html = '<option value="">位置</option>';

    // Split: available first, taken-by-others last
    const available = [];
    const taken = [];

    const orderedPositions = POSITION_LIST.filter(p => p !== 'P').concat('P');
    for (const p of orderedPositions) {
      const isOwn = currentPos === p;
      const ownerIdx = ownerMap[p];
      const takenByOther = ownerIdx !== undefined && ownerIdx !== slotIndex;

      const pdConflict =
        (p === 'DH' && usedPositions.includes('P') && currentPos !== 'DH') ||
        (p === 'P' && usedPositions.includes('DH') && currentPos !== 'P');

      const label = takenByOther ? `${p} (${ownerIdx + 1}棒)` : p;
      const cls = takenByOther ? 'style="color:#f39c12"' : '';
      const disabled = pdConflict ? 'disabled' : '';
      const selected = isOwn ? 'selected' : '';
      const optHtml = `<option value="${p}" ${selected} ${disabled} ${cls}>${label}</option>`;

      if (takenByOther || pdConflict) {
        taken.push(optHtml);
      } else {
        available.push(optHtml);
      }
    }

    html += available.join('');
    if (taken.length) {
      html += '<option disabled>──────</option>';
      html += taken.join('');
    }
    return html;
  }

  /** Refresh all <select> in a lineup grid based on current data */
  _refreshPositionSelects(grid, lineup) {
    const selects = grid.querySelectorAll('.quick-setup__slot-pos');
    const ownerMap = {};
    lineup.forEach((s, i) => { if (s.position) ownerMap[s.position] = i; });

    selects.forEach((sel, i) => {
      sel.innerHTML = this._buildPositionOptions(i, lineup[i].position, ownerMap);
    });
  }

  /** Show inline error hint below an input */
  _showSlotError(input, msg) {
    this._clearSlotError(input);
    const hint = createElement('span', 'quick-setup__slot-error');
    hint.textContent = msg;
    input.parentElement.appendChild(hint);
  }

  /** Clear inline error hint */
  _clearSlotError(input) {
    const existing = input.parentElement?.querySelector('.quick-setup__slot-error');
    if (existing) existing.remove();
  }

  // ═══════════════════════════════════════════════
  // Navigation & Validation
  // ═══════════════════════════════════════════════

  _next() {
    if (this.step === 1) {
      this._saveStep1();
      if (!this._validateStep1()) return;
      this.step = 2;
      this.render();
    } else if (this.step === 2) {
      this._saveStep2();
      if (!this._validateLineupTeam('客隊', this.awayLineup, this.awayPitcher)) return;
      this.step = 3;
      this.render();
    } else {
      this._saveStep2();
      if (!this._validateLineupTeam('主隊', this.homeLineup, this.homePitcher)) return;
      this._complete();
    }
  }

  _saveStep1() {
    const awayInput = this.container.querySelector('#qs-away-name');
    const homeInput = this.container.querySelector('#qs-home-name');
    if (awayInput) this.awayName = awayInput.value.trim();
    if (homeInput) this.homeName = homeInput.value.trim();
  }

  _saveStep2() {
    // Already saved via event delegation (input/change events)
  }

  _validateStep1() {
    if (!this.awayName.trim()) {
      showToast('請輸入客隊名稱');
      return false;
    }
    if (!this.homeName.trim()) {
      showToast('請輸入主隊名稱');
      return false;
    }
    if (!this.totalInnings) {
      showToast('請選擇局數');
      return false;
    }
    if (!this.recordingMode) {
      showToast('請選擇記錄模式');
      return false;
    }
    return true;
  }

  _validate() {
    return this._validateLineupTeam('客隊', this.awayLineup, this.awayPitcher)
      && this._validateLineupTeam('主隊', this.homeLineup, this.homePitcher);
  }

  _validateLineupTeam(label, lineup, pitcher) {
    const batterCount = lineup.filter(s => s.number !== '').length;
    if (batterCount < 9) {
      showToast(`${label}需要 9 位打者（目前 ${batterCount} 位）`);
      return false;
    }

    const batterNums = lineup.map(s => s.number).filter(n => n !== '');
    if (new Set(batterNums).size !== batterNums.length) {
      showToast(`${label}打者有重複背號，請檢查`);
      return false;
    }

    const hasP = lineup.some(s => s.position === 'P');
    if (!hasP && pitcher.number && batterNums.includes(pitcher.number)) {
      showToast(`${label}投手背號不可與打者相同（DH 制）`);
      return false;
    }

    if (!pitcher.number) {
      showToast(`請輸入${label}投手背號`);
      return false;
    }

    const positions = lineup.map(s => s.position);
    if (positions.includes('P') && positions.includes('DH')) {
      showToast(`${label}不可同時有 P 和 DH`);
      return false;
    }

    return true;
  }

  // ═══════════════════════════════════════════════
  // Complete — Build Game Object
  // ═══════════════════════════════════════════════

  _complete() {
    const game = createGame({
      name: `${this.awayName || '客隊'} vs ${this.homeName || '主隊'}`,
      date: getTodayStr(),
      time: getNowTimeStr(),
      totalInnings: this.totalInnings,
      startMode: 'QUICK',
      recordingMode: this.recordingMode,
      reentryRule: this.reentryRule
    });

    // Build teams with temporary players
    const awayTeam = createTeam({ name: this.awayName || '客隊' });
    const homeTeam = createTeam({ name: this.homeName || '主隊' });

    // Create players from lineup numbers
    const awayPlayers = [];
    const awayStarters = [];
    for (let i = 0; i < 9; i++) {
      const slot = this.awayLineup[i];
      if (!slot.number) continue;
      const player = createPlayer({
        number: parseInt(slot.number, 10),
        name: '',
        isTemporary: true
      });
      awayPlayers.push(player);
      awayStarters.push({
        order: i + 1,
        playerId: player.id,
        position: slot.position || '',
        isActive: true
      });
    }

    // Away pitcher (may be same as a batter or separate)
    let awayPitcherPlayer = awayPlayers.find(
      p => p.number === parseInt(this.awayPitcher.number, 10)
    );
    if (!awayPitcherPlayer) {
      awayPitcherPlayer = createPlayer({
        number: parseInt(this.awayPitcher.number, 10),
        name: '',
        isTemporary: true
      });
      awayPlayers.push(awayPitcherPlayer);
    }

    awayTeam.players = awayPlayers;
    game.teams.away = awayTeam;
    game.lineups.away = {
      teamId: awayTeam.id,
      starters: awayStarters,
      pitcher: { playerId: awayPitcherPlayer.id, isActive: true },
      substitutions: []
    };

    // Home team
    const homePlayers = [];
    const homeStarters = [];
    for (let i = 0; i < 9; i++) {
      const slot = this.homeLineup[i];
      if (!slot.number) continue;
      const player = createPlayer({
        number: parseInt(slot.number, 10),
        name: '',
        isTemporary: true
      });
      homePlayers.push(player);
      homeStarters.push({
        order: i + 1,
        playerId: player.id,
        position: slot.position || '',
        isActive: true
      });
    }

    let homePitcherPlayer = homePlayers.find(
      p => p.number === parseInt(this.homePitcher.number, 10)
    );
    if (!homePitcherPlayer) {
      homePitcherPlayer = createPlayer({
        number: parseInt(this.homePitcher.number, 10),
        name: '',
        isTemporary: true
      });
      homePlayers.push(homePitcherPlayer);
    }

    homeTeam.players = homePlayers;
    game.teams.home = homeTeam;
    game.lineups.home = {
      teamId: homeTeam.id,
      starters: homeStarters,
      pitcher: { playerId: homePitcherPlayer.id, isActive: true },
      substitutions: []
    };

    this.onComplete(game);
  }

  // ── Utility ──

  _esc(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  _getStepTitle() {
    if (this.step === 1) return '⚡ 快速開始';
    if (this.step === 2) return `${this.awayName || '客隊'} 打序`;
    return `${this.homeName || '主隊'} 打序`;
  }
}
