/**
 * BBScoring — Scoreboard UI (計分板)
 */
import { createElement } from '../utils/helpers.js';
import { HALF_INNING } from '../utils/constants.js';

export class Scoreboard {
  constructor({ container, game }) {
    this.container = container;
    this.game = game;
  }

  render() {
    this.container.innerHTML = '';
    const game = this.game;
    if (!game) return;

    const wrapper = createElement('div', { className: 'scoreboard' });

    const table = createElement('table', { className: 'scoreboard__table' });

    // 表頭 (局數)
    const thead = createElement('thead');
    const headRow = createElement('tr');
    headRow.appendChild(createElement('th', { textContent: '' }));

    const totalInnings = game.totalInnings || 9;
    const currentInning = game.currentState.inning;
    const maxInning = Math.max(totalInnings, currentInning);

    for (let i = 1; i <= maxInning; i++) {
      const th = createElement('th', {
        className: i === currentInning ? 'current' : '',
        textContent: i
      });
      headRow.appendChild(th);
    }
    headRow.appendChild(createElement('th', { className: 'total', textContent: 'R' }));
    headRow.appendChild(createElement('th', { className: 'total', textContent: 'H' }));
    headRow.appendChild(createElement('th', { className: 'total', textContent: 'E' }));
    thead.appendChild(headRow);
    table.appendChild(thead);

    // 表身
    const tbody = createElement('tbody');

    // 客隊
    const awayRow = createElement('tr');
    awayRow.appendChild(createElement('td', {
      className: 'team-name', textContent: game.teams.away.name || '客隊'
    }));
    for (let i = 1; i <= maxInning; i++) {
      const inning = game.innings[i - 1];
      const runs = inning ? (inning.top.runs !== undefined ? inning.top.runs : '-') : '';
      const td = createElement('td', {
        className: i === currentInning && game.currentState.halfInning === HALF_INNING.TOP ? 'current' : '',
        textContent: runs
      });
      awayRow.appendChild(td);
    }
    awayRow.appendChild(createElement('td', { className: 'total', textContent: game.currentState.score.away }));
    awayRow.appendChild(createElement('td', { className: 'total', textContent: this._getTeamHits('away') }));
    awayRow.appendChild(createElement('td', { className: 'total', textContent: this._getTeamErrors('away') }));
    tbody.appendChild(awayRow);

    // 主隊
    const homeRow = createElement('tr');
    homeRow.appendChild(createElement('td', {
      className: 'team-name', textContent: game.teams.home.name || '主隊'
    }));
    for (let i = 1; i <= maxInning; i++) {
      const inning = game.innings[i - 1];
      const runs = inning ? (inning.bottom.runs !== undefined ? inning.bottom.runs : '-') : '';
      const td = createElement('td', {
        className: i === currentInning && game.currentState.halfInning === HALF_INNING.BOTTOM ? 'current' : '',
        textContent: runs
      });
      homeRow.appendChild(td);
    }
    homeRow.appendChild(createElement('td', { className: 'total', textContent: game.currentState.score.home }));
    homeRow.appendChild(createElement('td', { className: 'total', textContent: this._getTeamHits('home') }));
    homeRow.appendChild(createElement('td', { className: 'total', textContent: this._getTeamErrors('home') }));
    tbody.appendChild(homeRow);

    table.appendChild(tbody);
    wrapper.appendChild(table);
    this.container.appendChild(wrapper);
  }

  _getTeamHits(side) {
    const game = this.game;
    let hits = 0;
    game.innings.forEach(inn => {
      const half = side === 'away' ? inn.top : inn.bottom;
      if (half && half.atBats) {
        half.atBats.forEach(ab => {
          if (ab.result && this._isHit(ab.result.type)) hits++;
        });
      }
    });
    return hits;
  }

  _getTeamErrors(side) {
    const game = this.game;
    // 守備方的失誤 (對方打擊造成的 Error)
    const defSide = side === 'away' ? 'home' : 'away';
    let errors = 0;
    game.innings.forEach(inn => {
      // 當己方打擊時，對方守備
      const half = side === 'away' ? inn.top : inn.bottom;
      if (half && half.atBats) {
        half.atBats.forEach(ab => {
          if (ab.result && ab.result.isError) errors++;
        });
      }
    });
    return errors;
  }

  _isHit(result) {
    return ['1B', '2B', '3B', 'HR'].includes(result);
  }
}
