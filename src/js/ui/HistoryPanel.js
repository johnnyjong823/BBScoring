/**
 * BBScoring — HistoryPanel UI (逐球記錄歷史)
 */
import { createElement, showConfirm, showToast } from '../utils/helpers.js';
import { HALF_INNING, PITCH_RESULTS, HIT_RESULTS } from '../utils/constants.js';
import { GestureHandler } from '../utils/gestures.js';

export class HistoryPanel {
  constructor({ container, game, engine, onBack }) {
    this.container = container;
    this.game = game;
    this.engine = engine;
    this.onBack = onBack;
    this._expandedInning = null;
  }

  render() {
    this.container.innerHTML = '';
    const game = this.game;
    if (!game) return;

    const wrapper = createElement('div', { className: 'history-panel' });

    // Header
    const header = createElement('div', { className: 'history-panel__header' });
    header.appendChild(createElement('button', {
      className: 'btn btn--icon', innerHTML: '←', // Unified back icon
      onClick: () => { if (this.onBack) this.onBack(); }
    }));
    header.appendChild(createElement('h3', { textContent: '比賽記錄' }));
    wrapper.appendChild(header);

    // Swipe to go back
    new GestureHandler(wrapper).el.addEventListener('swipe', (e) => {
      if (e.detail.direction === 'right' && this.onBack) {
        this.onBack();
      }
    });

    // 逐局列表
    const list = createElement('div', { className: 'history-panel__list scrollable' });

    game.innings.forEach((inning, idx) => {
      const inningNum = idx + 1;
      const isExpanded = this._expandedInning === inningNum;

      // 局標題
      const inningHeader = createElement('div', {
        className: `history-item history-item--inning${isExpanded ? ' expanded' : ''}`,
        onClick: () => {
          this._expandedInning = isExpanded ? null : inningNum;
          this.render();
        }
      });

      const topRuns = inning.top.runs !== undefined ? inning.top.runs : '-';
      const bottomRuns = inning.bottom.runs !== undefined ? inning.bottom.runs : '-';

      inningHeader.innerHTML = `
        <span class="history-item__toggle">${isExpanded ? '▼' : '▶'}</span>
        <span class="history-item__label">第${inningNum}局</span>
        <span class="history-item__score">${topRuns} - ${bottomRuns}</span>
      `;
      list.appendChild(inningHeader);

      if (isExpanded) {
        // 上半
        this._renderHalfInning(list, inning.top, '上', game);
        // 下半
        this._renderHalfInning(list, inning.bottom, '下', game);
      }
    });

    wrapper.appendChild(list);
    this.container.appendChild(wrapper);
  }

  _renderHalfInning(list, half, label, game) {
    const halfHeader = createElement('div', { className: 'history-item history-item--half' });
    halfHeader.textContent = `${label}半局`;
    list.appendChild(halfHeader);

    if (!half.atBats || half.atBats.length === 0) {
      list.appendChild(createElement('div', {
        className: 'history-item history-item--empty',
        textContent: '(無打席記錄)'
      }));
      return;
    }

    half.atBats.forEach((ab, abIdx) => {
      const batter = this._findPlayer(game, ab.batterId);
      const batterName = batter ? `#${batter.number} ${batter.name}` : '未知球員';

      const item = createElement('div', { className: 'history-item history-item--atbat' });

      // 打者
      const batterInfo = createElement('div', { className: 'history-item__batter' });
      batterInfo.textContent = `${abIdx + 1}. ${batterName}`;
      item.appendChild(batterInfo);

      // 投球序列
      if (ab.pitches && ab.pitches.length > 0) {
        const pitchRow = createElement('div', { className: 'history-item__pitches' });
        ab.pitches.forEach(p => {
          const badge = createElement('span', {
            className: `pitch-badge pitch-badge--${this._getPitchClass(p.result)}`,
            textContent: this._getPitchLabel(p.result)
          });
          pitchRow.appendChild(badge);
        });
        item.appendChild(pitchRow);
      }

      // 結果
      const resultDiv = createElement('div', { className: 'history-item__result' });
      if (ab.result) {
        const resultType = typeof ab.result === 'object' ? ab.result.type : ab.result;
        resultDiv.textContent = this._getResultLabel(resultType);
        const rbi = typeof ab.result === 'object' ? ab.result.rbi : 0;
        if (rbi > 0) {
          resultDiv.textContent += ` (${rbi}打點)`;
        }
      }
      item.appendChild(resultDiv);

      list.appendChild(item);
    });
  }

  _findPlayer(game, playerId) {
    if (!playerId) return null;
    const awayP = game.teams.away.players.find(p => p.id === playerId);
    if (awayP) return awayP;
    return game.teams.home.players.find(p => p.id === playerId);
  }

  _getPitchClass(result) {
    switch (result) {
      case PITCH_RESULTS.STRIKE:
      case PITCH_RESULTS.SWINGING_STRIKE:
      case PITCH_RESULTS.CALLED_STRIKE: return 'strike';
      case PITCH_RESULTS.BALL: return 'ball';
      case PITCH_RESULTS.FOUL: return 'foul';
      case PITCH_RESULTS.IN_PLAY: return 'inplay';
      default: return 'other';
    }
  }

  _getPitchLabel(result) {
    const labels = {
      [PITCH_RESULTS.STRIKE]: 'S',
      [PITCH_RESULTS.SWINGING_STRIKE]: 'S',
      [PITCH_RESULTS.CALLED_STRIKE]: 'C',
      [PITCH_RESULTS.BALL]: 'B',
      [PITCH_RESULTS.FOUL]: 'F',
      [PITCH_RESULTS.IN_PLAY]: '⬆',
      [PITCH_RESULTS.HBP]: 'HBP',
      [PITCH_RESULTS.WP]: 'WP',
      [PITCH_RESULTS.PB]: 'PB',
      [PITCH_RESULTS.BK]: 'BK',
      [PITCH_RESULTS.IBB]: 'IBB'
    };
    return labels[result] || result;
  }

  _getResultLabel(result) {
    const labels = {
      [HIT_RESULTS.SINGLE]: '一壘安打',
      [HIT_RESULTS.DOUBLE]: '二壘安打',
      [HIT_RESULTS.TRIPLE]: '三壘安打',
      [HIT_RESULTS.HOME_RUN]: '全壘打',
      [HIT_RESULTS.GROUND_OUT]: '滾地出局',
      [HIT_RESULTS.FLY_OUT]: '飛球出局',
      [HIT_RESULTS.LINE_OUT]: '平飛出局',
      [HIT_RESULTS.POP_OUT]: '內野飛球出局',
      [HIT_RESULTS.FIELDERS_CHOICE]: '野選',
      [HIT_RESULTS.SACRIFICE_FLY]: '犧牲飛球',
      [HIT_RESULTS.SACRIFICE_BUNT]: '犧牲觸擊',
      [HIT_RESULTS.DOUBLE_PLAY]: '雙殺',
      [HIT_RESULTS.TRIPLE_PLAY]: '三殺',
      [HIT_RESULTS.ERROR]: '失誤上壘',
      'SO': '三振',
      'K': '三振',
      'KL': '三振(不揮棒)',
      'BB': '四壞球保送',
      'HBP': '觸身球',
      'IBB': '故意四壞'
    };
    return labels[result] || result;
  }
}
