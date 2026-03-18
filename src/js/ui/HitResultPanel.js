/**
 * BBScoring — HitResultPanel UI (打擊結果面板，滑出式)
 */
import { createElement, showToast } from '../utils/helpers.js';
import { HIT_TYPES, HIT_ZONES, HIT_RESULTS, RUNNER_EVENTS } from '../utils/constants.js';
import { FieldDiagram } from './FieldDiagram.js';
import { createHitResult } from '../models/Play.js';
import { Vibration } from '../utils/vibration.js';

export class HitResultPanel {
  constructor({ container, onResult, onCancel }) {
    this.container = container;
    this.onResult = onResult;
    this.onCancel = onCancel;

    this.selected = {
      type: null,       // HIT_RESULTS
      hitType: null,    // HIT_TYPES
      zone: null,       // HIT_ZONES
      fieldingPath: [], // position sequence
      error: false,
      rbi: 0,
      runnerEvents: []
    };
  }

  render() {
    this.container.innerHTML = '';

    const panel = createElement('div', { className: 'hit-result-panel' });

    // 標題列
    const header = createElement('div', { className: 'hit-result-panel__header' });
    header.appendChild(createElement('button', {
      className: 'btn btn--icon', innerHTML: '✕',
      onClick: () => { if (this.onCancel) this.onCancel(); }
    }));
    header.appendChild(createElement('h3', { textContent: '打擊結果' }));
    header.appendChild(createElement('button', {
      className: 'btn btn--primary btn--sm', textContent: '確認',
      onClick: () => this._submit()
    }));
    panel.appendChild(header);

    const body = createElement('div', { className: 'hit-result-panel__body scrollable' });

    // 1. 結果類型
    body.appendChild(createElement('div', { className: 'section-label', textContent: '結果' }));
    const resultGrid = createElement('div', { className: 'hit-result-grid' });
    const resultTypes = [
      { val: HIT_RESULTS.SINGLE, label: '一安', cls: '' },
      { val: HIT_RESULTS.DOUBLE, label: '二安', cls: '' },
      { val: HIT_RESULTS.TRIPLE, label: '三安', cls: '' },
      { val: HIT_RESULTS.HOME_RUN, label: '全壘打', cls: 'highlight' },
      { val: HIT_RESULTS.GROUND_OUT, label: '滾地出局', cls: '' },
      { val: HIT_RESULTS.FLY_OUT, label: '飛球出局', cls: '' },
      { val: HIT_RESULTS.LINE_OUT, label: '平飛出局', cls: '' },
      { val: HIT_RESULTS.POP_OUT, label: '內野飛球', cls: '' },
      { val: HIT_RESULTS.FIELDERS_CHOICE, label: '野選', cls: '' },
      { val: HIT_RESULTS.SACRIFICE_FLY, label: '犧飛', cls: '' },
      { val: HIT_RESULTS.SACRIFICE_BUNT, label: '犧觸', cls: '' },
      { val: HIT_RESULTS.DOUBLE_PLAY, label: '雙殺', cls: '' },
      { val: HIT_RESULTS.TRIPLE_PLAY, label: '三殺', cls: '' },
      { val: HIT_RESULTS.ERROR, label: '失誤', cls: '' },
    ];
    resultTypes.forEach(r => {
      const btn = createElement('button', {
        className: `btn btn--sm ${this.selected.type === r.val ? 'btn--primary' : 'btn--outline'} ${r.cls}`,
        textContent: r.label,
        onClick: () => { this.selected.type = r.val; Vibration.tap(); this.render(); }
      });
      resultGrid.appendChild(btn);
    });
    body.appendChild(resultGrid);

    // 2. 打擊類型
    body.appendChild(createElement('div', { className: 'section-label', textContent: '打擊類型' }));
    const typeGrid = createElement('div', { className: 'hit-result-grid' });
    const hitTypes = [
      { val: HIT_TYPES.GROUND, label: '滾地' },
      { val: HIT_TYPES.FLY, label: '飛球' },
      { val: HIT_TYPES.LINE, label: '平飛' },
      { val: HIT_TYPES.POPUP, label: '小飛球' },
      { val: HIT_TYPES.BUNT, label: '觸擊' },
    ];
    hitTypes.forEach(h => {
      const btn = createElement('button', {
        className: `btn btn--sm ${this.selected.hitType === h.val ? 'btn--primary' : 'btn--outline'}`,
        textContent: h.label,
        onClick: () => { this.selected.hitType = h.val; this.render(); }
      });
      typeGrid.appendChild(btn);
    });
    body.appendChild(typeGrid);

    // 3. 方向 (棒球場圖)
    body.appendChild(createElement('div', { className: 'section-label', textContent: '方向' }));
    const fieldContainer = createElement('div', { className: 'hit-result-panel__field' });
    const fieldDiagram = new FieldDiagram({
      container: fieldContainer,
      selectedZone: this.selected.zone,
      onZoneClick: (zone) => { this.selected.zone = zone; this.render(); }
    });
    fieldDiagram.render();
    body.appendChild(fieldContainer);

    // 4. 守備路徑 (簡易)
    body.appendChild(createElement('div', { className: 'section-label', textContent: '守備路徑' }));
    const fpRow = createElement('div', { className: 'fielding-path' });
    const positions = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
    positions.forEach(pos => {
      const btn = createElement('button', {
        className: `btn btn--sm ${this.selected.fieldingPath.includes(pos) ? 'btn--primary' : 'btn--outline'}`,
        textContent: pos,
        onClick: () => {
          const idx = this.selected.fieldingPath.indexOf(pos);
          if (idx >= 0) this.selected.fieldingPath.splice(idx, 1);
          else this.selected.fieldingPath.push(pos);
          this.render();
        }
      });
      fpRow.appendChild(btn);
    });
    body.appendChild(fpRow);
    if (this.selected.fieldingPath.length > 0) {
      body.appendChild(createElement('div', {
        className: 'text-secondary text-sm',
        textContent: `守備路徑: ${this.selected.fieldingPath.join(' → ')}`
      }));
    }

    // 5. 失誤
    const errorGroup = createElement('div', { className: 'form-group form-group--row' });
    const errorLabel = createElement('label', { textContent: '失誤' });
    const errorToggle = createElement('button', {
      className: `btn btn--sm ${this.selected.error ? 'btn--danger' : 'btn--outline'}`,
      textContent: this.selected.error ? 'E (失誤)' : '無失誤',
      onClick: () => { this.selected.error = !this.selected.error; this.render(); }
    });
    errorGroup.append(errorLabel, errorToggle);
    body.appendChild(errorGroup);

    // 6. 打點
    const rbiGroup = createElement('div', { className: 'form-group form-group--row' });
    rbiGroup.appendChild(createElement('label', { textContent: '打點 (RBI)' }));
    const rbiCtrl = createElement('div', { className: 'number-control' });
    rbiCtrl.appendChild(createElement('button', {
      className: 'btn btn--sm btn--outline', textContent: '−',
      onClick: () => { if (this.selected.rbi > 0) { this.selected.rbi--; this.render(); } }
    }));
    rbiCtrl.appendChild(createElement('span', { className: 'number-control__value', textContent: this.selected.rbi }));
    rbiCtrl.appendChild(createElement('button', {
      className: 'btn btn--sm btn--outline', textContent: '+',
      onClick: () => { this.selected.rbi++; this.render(); }
    }));
    rbiGroup.appendChild(rbiCtrl);
    body.appendChild(rbiGroup);

    panel.appendChild(body);
    this.container.appendChild(panel);
  }

  _submit() {
    if (!this.selected.type) {
      showToast('請選擇打擊結果');
      return;
    }

    const result = createHitResult();
    result.type = this.selected.type;
    result.hitType = this.selected.hitType;
    result.zone = this.selected.zone;
    result.fieldingPath = [...this.selected.fieldingPath];
    result.error = this.selected.error;
    result.rbi = this.selected.rbi;

    // 重置
    this.selected = { type: null, hitType: null, zone: null, fieldingPath: [], error: false, rbi: 0, runnerEvents: [] };

    Vibration.heavy();
    if (this.onResult) this.onResult(result);
  }
}
