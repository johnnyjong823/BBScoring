/**
 * BBScoring — StatsView UI (數據統計頁面)
 */
import { createElement } from '../utils/helpers.js';
import { StatsCalculator } from '../core/StatsCalculator.js';
import { GestureHandler } from '../utils/gestures.js';

export class StatsView {
  constructor({ container, game, onBack }) {
    this.container = container;
    this.game = game;
    this.onBack = onBack;
    this._activeTab = 'batting';
    this._activeSide = 'away';
  }

  render() {
    this.container.innerHTML = '';
    const game = this.game;
    if (!game) return;

    const wrapper = createElement('div', { className: 'stats-view' });

    // Header
    const header = createElement('div', { className: 'stats-view__header' });
    header.appendChild(createElement('button', {
      className: 'btn btn--icon', innerHTML: '←', // Unified back icon
      onClick: () => { if (this.onBack) this.onBack(); }
    }));
    header.appendChild(createElement('h3', { textContent: '數據統計' }));
    wrapper.appendChild(header);

    // Swipe to go back
    new GestureHandler(wrapper).el.addEventListener('swipe', (e) => {
      if (e.detail.direction === 'right' && this.onBack) {
        this.onBack();
      }
    });

    // Tab: 打擊 / 投球
    const tabs = createElement('div', { className: 'stats-view__tabs' });
    [
      { key: 'batting', label: '打擊' },
      { key: 'pitching', label: '投球' }
    ].forEach(t => {
      tabs.appendChild(createElement('button', {
        className: `btn btn--sm ${this._activeTab === t.key ? 'btn--primary' : 'btn--outline'}`,
        textContent: t.label,
        onClick: () => { this._activeTab = t.key; this.render(); }
      }));
    });
    wrapper.appendChild(tabs);

    // 隊伍 Tab
    const teamTabs = createElement('div', { className: 'stats-view__team-tabs' });
    ['away', 'home'].forEach(side => {
      const label = side === 'away' ? game.teams.away.name || '客隊' : game.teams.home.name || '主隊';
      teamTabs.appendChild(createElement('button', {
        className: `btn btn--sm ${this._activeSide === side ? 'btn--primary' : 'btn--outline'}`,
        textContent: label,
        onClick: () => { this._activeSide = side; this.render(); }
      }));
    });
    wrapper.appendChild(teamTabs);

    // 統計表格
    const body = createElement('div', { className: 'stats-view__body scrollable' });
    if (this._activeTab === 'batting') {
      this._renderBattingStats(body);
    } else {
      this._renderPitchingStats(body);
    }
    wrapper.appendChild(body);

    this.container.appendChild(wrapper);
  }

  _renderBattingStats(body) {
    const game = this.game;
    const side = this._activeSide;
    const team = game.teams[side];
    const lineup = game.lineups[side];

    const table = createElement('table', { className: 'player-table stats-table' });
    const thead = createElement('thead');
    thead.innerHTML = `<tr>
      <th>#</th><th>球員</th><th>PA</th><th>AB</th><th>H</th>
      <th>2B</th><th>3B</th><th>HR</th><th>RBI</th><th>BB</th>
      <th>SO</th><th>AVG</th><th>OBP</th><th>SLG</th>
    </tr>`;
    table.appendChild(thead);

    const tbody = createElement('tbody');

    // 計算每位球員的打擊所有打席
    const playerIds = lineup.starters.map(s => s.playerId);
    playerIds.forEach(pid => {
      const player = team.players.find(p => p.id === pid);
      if (!player) return;

      const atBats = this._getPlayerAtBats(game, side, pid);
      const stats = StatsCalculator.calcBatterStats(atBats);

      const tr = createElement('tr');
      tr.innerHTML = `
        <td>${player.number}</td>
        <td>${player.name}</td>
        <td>${stats.pa}</td>
        <td>${stats.ab}</td>
        <td>${stats.h}</td>
        <td>${stats.doubles}</td>
        <td>${stats.triples}</td>
        <td>${stats.hr}</td>
        <td>${stats.rbi}</td>
        <td>${stats.bb}</td>
        <td>${stats.k}</td>
        <td>${stats.avg}</td>
        <td>${stats.obp}</td>
        <td>${stats.slg}</td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    body.appendChild(table);
  }

  _renderPitchingStats(body) {
    const game = this.game;
    const side = this._activeSide;
    const team = game.teams[side];
    // 投手面對的是另一方的打者
    const oppSide = side === 'away' ? 'home' : 'away';

    const table = createElement('table', { className: 'player-table stats-table' });
    const thead = createElement('thead');
    thead.innerHTML = `<tr>
      <th>#</th><th>投手</th><th>IP</th><th>BF</th><th>H</th>
      <th>R</th><th>ER</th><th>BB</th><th>SO</th>
      <th>Pitches</th><th>ERA</th><th>WHIP</th>
    </tr>`;
    table.appendChild(thead);

    const tbody = createElement('tbody');

    // 收集所有投手 ID
    const pitcherIds = this._getPitcherIds(game, side);
    pitcherIds.forEach(pid => {
      const player = team.players.find(p => p.id === pid);
      if (!player) return;

      const pitcherData = this._getPitcherData(game, oppSide, pid);
      const stats = StatsCalculator.calcPitcherStats(pitcherData.atBats);

      const tr = createElement('tr');
      tr.innerHTML = `
        <td>${player.number}</td>
        <td>${player.name}</td>
        <td>${stats.ip}</td>
        <td>${stats.tbf}</td>
        <td>${stats.h}</td>
        <td>${stats.runs}</td>
        <td>${stats.er}</td>
        <td>${stats.bb}</td>
        <td>${stats.k}</td>
        <td>${stats.np}</td>
        <td>${stats.era}</td>
        <td>${stats.whip}</td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    body.appendChild(table);
  }

  _getPlayerAtBats(game, side, playerId) {
    const atBats = [];
    const halfKey = side === 'away' ? 'top' : 'bottom';
    game.innings.forEach(inn => {
      const half = inn[halfKey];
      if (half && half.atBats) {
        half.atBats.filter(ab => ab.batterId === playerId).forEach(ab => atBats.push(ab));
      }
    });
    return atBats;
  }

  _getPitcherIds(game, side) {
    const ids = new Set();
    // 先發投手
    if (game.lineups[side].pitcher) {
      ids.add(game.lineups[side].pitcher.playerId);
    }
    // 從比賽記錄中尋找更換投手記錄
    const oppHalfKey = side === 'away' ? 'bottom' : 'top';
    game.innings.forEach(inn => {
      const half = inn[oppHalfKey];
      if (half && half.atBats) {
        half.atBats.forEach(ab => {
          if (ab.pitcherId) ids.add(ab.pitcherId);
        });
      }
    });
    return [...ids];
  }

  _getPitcherData(game, oppSide, pitcherId) {
    const halfKey = oppSide === 'away' ? 'top' : 'bottom';
    const atBats = [];
    let pitchCount = 0;
    game.innings.forEach(inn => {
      const half = inn[halfKey];
      if (half && half.atBats) {
        half.atBats.filter(ab => ab.pitcherId === pitcherId).forEach(ab => {
          atBats.push(ab);
          if (ab.pitches) pitchCount += ab.pitches.length;
        });
      }
    });
    return { atBats, pitchCount };
  }
}
