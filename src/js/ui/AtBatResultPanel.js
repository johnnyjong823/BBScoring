/**
 * BBScoring — AtBatResultPanel (Result-Only 模式打席結果面板)
 *
 * Replaces PitchPanel + HitResultPanel in Result-Only mode.
 * Flow: Tap result → Set RBI → Auto-advance runners → Next batter
 * Target: 1-2 taps per at-bat.
 */
import { createElement, showToast } from '../utils/helpers.js';
import { HIT_RESULTS, HIT_RESULTS_INFO } from '../utils/constants.js';

export class AtBatResultPanel {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container
   * @param {(result: object) => void} opts.onResult - Called with { type, rbi, isError, stolenBases }
   */
  constructor({ container, onResult }) {
    this.container = container;
    this.onResult = onResult;

    // Pending state for multi-step
    this._selectedType = null;
    this._rbi = 0;
    this._isError = false;
    this._stolenBases = [];
  }

  render() {
    this.container.innerHTML = '';

    const panel = createElement('div', 'atbat-panel');

    if (!this._selectedType) {
      panel.appendChild(this._renderResultGrid());
    } else {
      panel.appendChild(this._renderConfirmStep());
    }

    this.container.appendChild(panel);
  }

  // ═══════════════════════════════════════════
  // Step 1: Result Type Selection
  // ═══════════════════════════════════════════

  _renderResultGrid() {
    const grid = createElement('div', 'atbat-panel__grid');

    // Hit section
    const hitSection = createElement('div', 'atbat-panel__section');
    hitSection.appendChild(createElement('div', 'atbat-panel__section-label'));
    hitSection.querySelector('.atbat-panel__section-label').textContent = '安打';

    const hitRow = createElement('div', 'atbat-panel__row');
    const hits = [
      { type: '1B', label: '一安', cls: 'hit' },
      { type: '2B', label: '二安', cls: 'hit' },
      { type: '3B', label: '三安', cls: 'hit' },
      { type: 'HR', label: '全壘打', cls: 'hr' },
    ];
    hits.forEach(h => hitRow.appendChild(this._createResultBtn(h)));
    hitSection.appendChild(hitRow);
    grid.appendChild(hitSection);

    // Out section
    const outSection = createElement('div', 'atbat-panel__section');
    outSection.appendChild(createElement('div', 'atbat-panel__section-label'));
    outSection.querySelector('.atbat-panel__section-label').textContent = '出局';

    const outRow1 = createElement('div', 'atbat-panel__row');
    const outs1 = [
      { type: 'K', label: '三振', cls: 'out' },
      { type: 'GO', label: '滾地', cls: 'out' },
      { type: 'FO', label: '飛球', cls: 'out' },
      { type: 'LO', label: '平飛', cls: 'out' },
    ];
    outs1.forEach(o => outRow1.appendChild(this._createResultBtn(o)));
    outSection.appendChild(outRow1);

    const outRow2 = createElement('div', 'atbat-panel__row');
    const outs2 = [
      { type: 'DP', label: '雙殺', cls: 'out' },
      { type: 'FC', label: '野選', cls: 'out' },
      { type: 'SF', label: '犧飛', cls: 'sac' },
      { type: 'SAC', label: '犧觸', cls: 'sac' },
    ];
    outs2.forEach(o => outRow2.appendChild(this._createResultBtn(o)));
    outSection.appendChild(outRow2);
    grid.appendChild(outSection);

    // Special section
    const specialSection = createElement('div', 'atbat-panel__section');
    specialSection.appendChild(createElement('div', 'atbat-panel__section-label'));
    specialSection.querySelector('.atbat-panel__section-label').textContent = '其他';

    const specialRow = createElement('div', 'atbat-panel__row');
    const specials = [
      { type: 'BB', label: '保送', cls: 'bb' },
      { type: 'IBB', label: '故四', cls: 'bb' },
      { type: 'HBP', label: '觸身', cls: 'hbp' },
      { type: 'E', label: '失誤', cls: 'error' },
    ];
    specials.forEach(s => specialRow.appendChild(this._createResultBtn(s)));
    specialSection.appendChild(specialRow);
    grid.appendChild(specialSection);

    return grid;
  }

  _createResultBtn({ type, label, cls }) {
    const btn = createElement('button', `atbat-panel__btn atbat-panel__btn--${cls}`);
    btn.innerHTML = `<span class="atbat-panel__btn-label">${label}</span>`;
    btn.addEventListener('click', () => {
      this._selectedType = type;
      this._rbi = 0;
      this._isError = type === 'E';

      // For simple results with no RBI possibility, skip confirm step
      const noRBIResults = ['K', 'BB', 'IBB', 'HBP'];
      if (noRBIResults.includes(type)) {
        this._submit();
      } else {
        this.render();
      }
    });
    return btn;
  }

  // ═══════════════════════════════════════════
  // Step 2: RBI + Confirm
  // ═══════════════════════════════════════════

  _renderConfirmStep() {
    const confirm = createElement('div', 'atbat-panel__confirm');

    // Selected result display
    const resultDisplay = createElement('div', 'atbat-panel__selected');
    const typeLabel = this._getTypeLabel(this._selectedType);
    resultDisplay.innerHTML = `<span class="atbat-panel__selected-type">${typeLabel}</span>`;
    confirm.appendChild(resultDisplay);

    // RBI counter
    const rbiRow = createElement('div', 'atbat-panel__rbi-row');
    rbiRow.innerHTML = `<span class="atbat-panel__rbi-label">打點 (RBI)</span>`;

    const rbiControls = createElement('div', 'atbat-panel__rbi-controls');
    const minusBtn = createElement('button', 'atbat-panel__rbi-btn');
    minusBtn.textContent = '−';
    minusBtn.addEventListener('click', () => {
      if (this._rbi > 0) {
        this._rbi--;
        rbiValue.textContent = this._rbi;
      }
    });

    const rbiValue = createElement('span', 'atbat-panel__rbi-value');
    rbiValue.textContent = this._rbi;

    const plusBtn = createElement('button', 'atbat-panel__rbi-btn');
    plusBtn.textContent = '+';
    plusBtn.addEventListener('click', () => {
      if (this._rbi < 4) {
        this._rbi++;
        rbiValue.textContent = this._rbi;
      }
    });

    rbiControls.append(minusBtn, rbiValue, plusBtn);
    rbiRow.appendChild(rbiControls);
    confirm.appendChild(rbiRow);

    // Action buttons
    const actions = createElement('div', 'atbat-panel__actions');

    const cancelBtn = createElement('button', 'atbat-panel__action-btn atbat-panel__action-btn--cancel');
    cancelBtn.textContent = '返回';
    cancelBtn.addEventListener('click', () => {
      this._selectedType = null;
      this.render();
    });

    const confirmBtn = createElement('button', 'atbat-panel__action-btn atbat-panel__action-btn--confirm');
    confirmBtn.textContent = '✓ 確認';
    confirmBtn.addEventListener('click', () => this._submit());

    actions.append(cancelBtn, confirmBtn);
    confirm.appendChild(actions);

    return confirm;
  }

  // ═══════════════════════════════════════════
  // Submit
  // ═══════════════════════════════════════════

  _submit() {
    const result = {
      type: this._selectedType,
      rbi: this._rbi,
      isError: this._isError,
      stolenBases: this._stolenBases
    };

    // Reset state
    this._selectedType = null;
    this._rbi = 0;
    this._isError = false;
    this._stolenBases = [];

    this.onResult(result);
  }

  // ═══════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════

  _getTypeLabel(type) {
    const labels = {
      '1B': '一壘安打', '2B': '二壘安打', '3B': '三壘安打', 'HR': '全壘打',
      'K': '三振', 'GO': '滾地出局', 'FO': '飛球出局', 'LO': '平飛出局',
      'DP': '雙殺', 'FC': '野選', 'SF': '犧牲飛球', 'SAC': '犧牲觸擊',
      'BB': '四壞保送', 'IBB': '故意四壞', 'HBP': '觸身球', 'E': '失誤上壘'
    };
    return labels[type] || type;
  }
}
