/**
 * BBScoring — PitchPanel UI (投球按鈕面板)
 *
 * Two-layer flow:
 *   Main:   好球(S) / 壞球(B) / 擊出(P) / (其他)
 *   好球 →  揮空(1) · 過半(2) · 界外(3)  |  盜壘
 *     揮空/過半 → 暴投/捕逸確認: 無(1) · 暴投(2) · 捕逸(3)
 *   壞球 →  壞球確認(1/Enter)  |  暴投(2) · 捕逸(3)  |  盜壘
 *
 * Keyboard: S/B/P直接進入, 數字選項, Esc返回
 */
import { createElement } from '../utils/helpers.js';
import { PITCH_RESULTS } from '../utils/constants.js';
import { Vibration } from '../utils/vibration.js';

export class PitchPanel {
  constructor({ container, onPitch, onSteal, hasRunners }) {
    this.container = container;
    this.onPitch = onPitch;
    this.onSteal = onSteal || null;
    this.hasRunners = hasRunners || false;
    this._layer = 'main'; // 'main' | 'strike' | 'strike-wpcheck' | 'ball'
    this._pendingStrike = null; // 'SS' or 'CS' while in strike-wpcheck
  }

  render() {
    this.container.innerHTML = '';
    const panel = createElement('div', { className: 'pitch-buttons' });

    switch (this._layer) {
      case 'strike':        panel.appendChild(this._renderStrikeLayer()); break;
      case 'strike-wpcheck': panel.appendChild(this._renderStrikeWpCheck()); break;
      case 'ball':           panel.appendChild(this._renderBallLayer()); break;
      default:               panel.appendChild(this._renderMainLayer());
    }

    this.container.appendChild(panel);
  }

  /** Called by LiveRecord's global keyboard handler */
  handleKey(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    const key = e.key.toUpperCase();

    switch (this._layer) {
      case 'main':
        if (key === 'S') { this._layer = 'strike'; this.render(); e.preventDefault(); }
        else if (key === 'B') { this._layer = 'ball'; this.render(); e.preventDefault(); }
        else if (key === 'P') { this._emit(PITCH_RESULTS.IN_PLAY); e.preventDefault(); }
        break;

      case 'strike':
        if (key === '1') { this._pendingStrike = PITCH_RESULTS.SWINGING_STRIKE; this._layer = 'strike-wpcheck'; this.render(); e.preventDefault(); }
        else if (key === '2') { this._pendingStrike = PITCH_RESULTS.CALLED_STRIKE; this._layer = 'strike-wpcheck'; this.render(); e.preventDefault(); }
        else if (key === '3') { this._emit(PITCH_RESULTS.FOUL); e.preventDefault(); }
        else if (key === '4') { this._emit(PITCH_RESULTS.FOUL_BUNT); e.preventDefault(); }
        else if (key === 'ESCAPE') { this._layer = 'main'; this.render(); e.preventDefault(); }
        break;

      case 'strike-wpcheck':
        if (key === '1' || key === 'ENTER') { this._emit(this._pendingStrike); e.preventDefault(); }
        else if (key === '2') { this._emit(this._pendingStrike, { wpPb: 'WP' }); e.preventDefault(); }
        else if (key === '3') { this._emit(this._pendingStrike, { wpPb: 'PB' }); e.preventDefault(); }
        else if (key === 'ESCAPE') { this._layer = 'strike'; this._pendingStrike = null; this.render(); e.preventDefault(); }
        break;

      case 'ball':
        if (key === '1' || key === 'ENTER') { this._emit(PITCH_RESULTS.BALL); e.preventDefault(); }
        else if (key === '2') { this._emit(PITCH_RESULTS.WP); e.preventDefault(); }
        else if (key === '3') { this._emit(PITCH_RESULTS.PB); e.preventDefault(); }
        else if (key === 'ESCAPE') { this._layer = 'main'; this.render(); e.preventDefault(); }
        break;
    }
  }

  // ═══════════════════════════════════════════
  // Main Layer
  // ═══════════════════════════════════════════

  _renderMainLayer() {
    const frag = document.createDocumentFragment();

    // Row 1: 好球 / 壞球
    const row1 = createElement('div', { className: 'pitch-buttons__primary' });
    row1.appendChild(this._btn('好球', 'btn--lg btn--strike', () => {
      this._layer = 'strike'; this.render();
    }, 'S'));
    row1.appendChild(this._btn('壞球', 'btn--lg btn--ball', () => {
      this._layer = 'ball'; this.render();
    }, 'B'));
    frag.appendChild(row1);

    // Row 2: 擊出 (full width)
    const row2 = createElement('div', { className: 'pitch-buttons__inplay' });
    row2.appendChild(this._btn('擊出', 'btn--lg btn--inplay', () => {
      this._emit(PITCH_RESULTS.IN_PLAY);
    }, 'P'));
    frag.appendChild(row2);

    // Row 3: 其他 (small, muted)
    const row3 = createElement('div', { className: 'pitch-buttons__extra' });
    row3.appendChild(this._btn('觸身', 'btn--sm btn--special', () => this._emit(PITCH_RESULTS.HBP)));
    row3.appendChild(this._btn('故意四壞', 'btn--sm btn--ibb', () => this._emit(PITCH_RESULTS.IBB)));
    row3.appendChild(this._btn('投手犯規', 'btn--sm btn--wp', () => this._emit(PITCH_RESULTS.BK)));
    frag.appendChild(row3);

    // Row 4: 妨礙 (small)
    const row4 = createElement('div', { className: 'pitch-buttons__extra' });
    row4.appendChild(this._btn('捕手妨礙', 'btn--sm btn--special', () => this._emit(PITCH_RESULTS.CI)));
    row4.appendChild(this._btn('妨礙守備', 'btn--sm btn--special', () => this._emit(PITCH_RESULTS.OI)));
    if (this.hasRunners) {
      row4.appendChild(this._btn('妨礙跑壘', 'btn--sm btn--special', () => this._emit(PITCH_RESULTS.OBS)));
    }
    frag.appendChild(row4);

    return frag;
  }

  // ═══════════════════════════════════════════
  // Strike Sub-layer
  // ═══════════════════════════════════════════

  _renderStrikeLayer() {
    const frag = document.createDocumentFragment();
    frag.appendChild(this._backRow('好球 ▸ 選擇類型'));

    const primary = createElement('div', { className: 'pitch-buttons__primary pitch-buttons__primary--triple' });
    primary.appendChild(this._btn('揮空', 'btn--lg btn--strike', () => {
      this._pendingStrike = PITCH_RESULTS.SWINGING_STRIKE;
      this._layer = 'strike-wpcheck';
      this.render();
    }, '1'));
    primary.appendChild(this._btn('過半', 'btn--lg btn--strike', () => {
      this._pendingStrike = PITCH_RESULTS.CALLED_STRIKE;
      this._layer = 'strike-wpcheck';
      this.render();
    }, '2'));
    primary.appendChild(this._btn('界外', 'btn--lg btn--foul', () => this._emit(PITCH_RESULTS.FOUL), '3'));
    primary.appendChild(this._btn('界外觸擊', 'btn--sm btn--foul', () => this._emit(PITCH_RESULTS.FOUL_BUNT), '4'));
    frag.appendChild(primary);

    // 盜壘 only (WP/PB moved to wpcheck step)
    if (this.hasRunners) {
      const secondary = createElement('div', { className: 'pitch-buttons__secondary' });
      secondary.appendChild(this._btn('盜壘', 'btn--sm btn--special', () => this._handleSteal()));
      frag.appendChild(secondary);
    }

    return frag;
  }

  // ═══════════════════════════════════════════
  // Strike WP/PB Check (after 揮空 or 過半)
  // ═══════════════════════════════════════════

  _renderStrikeWpCheck() {
    const frag = document.createDocumentFragment();
    const label = this._pendingStrike === PITCH_RESULTS.SWINGING_STRIKE ? '揮空' : '過半';
    frag.appendChild(this._backRow(`好球 ▸ ${label} ▸ 暴投/捕逸？`));

    const row = createElement('div', { className: 'pitch-buttons__primary pitch-buttons__primary--triple' });
    row.appendChild(this._btn('無', 'btn--lg btn--strike', () => this._emit(this._pendingStrike), '1'));
    row.appendChild(this._btn('暴投', 'btn--lg btn--wp', () => this._emit(this._pendingStrike, { wpPb: 'WP' }), '2'));
    row.appendChild(this._btn('捕逸', 'btn--lg btn--wp', () => this._emit(this._pendingStrike, { wpPb: 'PB' }), '3'));
    frag.appendChild(row);

    return frag;
  }

  // ═══════════════════════════════════════════
  // Ball Sub-layer
  // ═══════════════════════════════════════════

  _renderBallLayer() {
    const frag = document.createDocumentFragment();
    frag.appendChild(this._backRow('壞球 ▸ 選擇'));

    // Large confirm button for plain ball
    const confirmRow = createElement('div', { className: 'pitch-buttons__inplay' });
    confirmRow.appendChild(this._btn('壞球確認', 'btn--lg btn--ball', () => this._emit(PITCH_RESULTS.BALL), '1 / ↵'));
    frag.appendChild(confirmRow);

    // WP / PB row
    const wpRow = createElement('div', { className: 'pitch-buttons__primary' });
    wpRow.appendChild(this._btn('暴投', 'btn--lg btn--wp', () => this._emit(PITCH_RESULTS.WP), '2'));
    wpRow.appendChild(this._btn('捕逸', 'btn--lg btn--wp', () => this._emit(PITCH_RESULTS.PB), '3'));
    frag.appendChild(wpRow);

    // 盜壘
    if (this.hasRunners) {
      const secondary = createElement('div', { className: 'pitch-buttons__secondary' });
      secondary.appendChild(this._btn('盜壘', 'btn--sm btn--special', () => this._handleSteal()));
      frag.appendChild(secondary);
    }

    return frag;
  }

  // ═══════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════

  _btn(label, cls, onClick, hint = null) {
    const btn = createElement('button', {
      className: `btn ${cls}`,
      onClick: () => { Vibration.tap(); onClick(); }
    });
    if (hint) {
      btn.innerHTML = `${label} <kbd class="kbd-hint">${hint}</kbd>`;
    } else {
      btn.textContent = label;
    }
    return btn;
  }

  _backRow(label) {
    const row = createElement('div', { className: 'pitch-buttons__back-row' });
    row.appendChild(createElement('button', {
      className: 'btn btn--icon btn--sm',
      innerHTML: '←',
      onClick: () => {
        if (this._layer === 'strike-wpcheck') { this._layer = 'strike'; this._pendingStrike = null; }
        else { this._layer = 'main'; }
        this.render();
      }
    }));
    row.appendChild(createElement('span', {
      className: 'pitch-buttons__layer-label',
      textContent: label
    }));
    row.appendChild(createElement('kbd', { className: 'kbd-hint', textContent: 'Esc' }));
    return row;
  }

  _emit(type, extra = null) {
    this._layer = 'main';
    this._pendingStrike = null;
    if (this.onPitch) this.onPitch(type, extra);
  }

  _handleSteal() {
    if (this.onSteal) this.onSteal();
  }
}
