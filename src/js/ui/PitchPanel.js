/**
 * BBScoring — PitchPanel UI (投球按鈕面板)
 */
import { createElement } from '../utils/helpers.js';
import { PITCH_RESULTS } from '../utils/constants.js';
import { Vibration } from '../utils/vibration.js';

export class PitchPanel {
  constructor({ container, onPitch }) {
    this.container = container;
    this.onPitch = onPitch;
  }

  render() {
    this.container.innerHTML = '';

    const panel = createElement('div', { className: 'pitch-buttons' });

    // 主要投球結果
    const primaryButtons = [
      { type: PITCH_RESULTS.STRIKE, label: '好球', cls: 'btn--strike' },
      { type: PITCH_RESULTS.BALL, label: '壞球', cls: 'btn--ball' },
      { type: PITCH_RESULTS.FOUL, label: '界外', cls: 'btn--foul' },
      { type: PITCH_RESULTS.IN_PLAY, label: '擊出', cls: 'btn--inplay' },
    ];

    const primaryRow = createElement('div', { className: 'pitch-buttons__primary' });
    primaryButtons.forEach(b => {
      const btn = createElement('button', {
        className: `btn btn--lg ${b.cls}`,
        textContent: b.label,
        onClick: () => {
          Vibration.tap();
          if (this.onPitch) this.onPitch(b.type);
        }
      });
      primaryRow.appendChild(btn);
    });
    panel.appendChild(primaryRow);

    // 特殊投球結果
    const specialButtons = [
      { type: PITCH_RESULTS.SWINGING_STRIKE, label: '揮空', cls: 'btn--strike' },
      { type: PITCH_RESULTS.CALLED_STRIKE, label: '被判', cls: 'btn--strike' },
      { type: PITCH_RESULTS.HBP, label: '觸身', cls: 'btn--special' },
      { type: PITCH_RESULTS.WP, label: '暴投', cls: 'btn--wp' },
      { type: PITCH_RESULTS.PB, label: '捕逸', cls: 'btn--wp' },
      { type: PITCH_RESULTS.BK, label: '投手犯規', cls: 'btn--wp' },
      { type: PITCH_RESULTS.IBB, label: '故意四壞', cls: 'btn--ibb' },
    ];

    const specialRow = createElement('div', { className: 'pitch-buttons__special' });
    specialButtons.forEach(b => {
      const btn = createElement('button', {
        className: `btn btn--sm ${b.cls}`,
        textContent: b.label,
        onClick: () => {
          Vibration.tap();
          if (this.onPitch) this.onPitch(b.type);
        }
      });
      specialRow.appendChild(btn);
    });
    panel.appendChild(specialRow);

    this.container.appendChild(panel);
  }
}
