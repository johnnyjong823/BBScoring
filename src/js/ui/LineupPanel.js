/**
 * BBScoring — LineupPanel UI (打序面板)
 */
import { createElement } from '../utils/helpers.js';
import { HALF_INNING } from '../utils/constants.js';

export class LineupPanel {
  constructor({ container, game, engine }) {
    this.container = container;
    this.game = game;
    this.engine = engine;
  }

  render() {
    this.container.innerHTML = '';
    const game = this.game;
    if (!game) return;

    const wrapper = createElement('div', { className: 'lineup-panel' });

    // Tab: 客隊 / 主隊
    const tabs = createElement('div', { className: 'lineup-panel__tabs' });
    ['away', 'home'].forEach(side => {
      const label = side === 'away' ? `客隊 ${game.teams.away.name}` : `主隊 ${game.teams.home.name}`;
      tabs.appendChild(createElement('button', {
        className: `btn btn--sm ${this._activeSide === side ? 'btn--primary' : 'btn--outline'}`,
        textContent: label,
        onClick: () => { this._activeSide = side; this.render(); }
      }));
    });
    wrapper.appendChild(tabs);

    if (!this._activeSide) this._activeSide = 'away';

    const side = this._activeSide;
    const team = game.teams[side];
    const lineup = game.lineups[side];

    // 打序列表
    const list = createElement('div', { className: 'lineup-list' });

    lineup.starters.forEach((s, i) => {
      const player = team.players.find(p => p.id === s.playerId);
      if (!player) return;

      const isCurrent = (
        (side === 'away' && game.currentState.halfInning === HALF_INNING.TOP) ||
        (side === 'home' && game.currentState.halfInning === HALF_INNING.BOTTOM)
      ) && game.currentState.currentBatterIndex === i;

      const item = createElement('div', {
        className: `lineup-list__item${isCurrent ? ' current' : ''}${!s.isActive ? ' inactive' : ''}`
      });
      item.innerHTML = `
        <span class="lineup-list__order">${i + 1}</span>
        <span class="lineup-list__pos">${s.position}</span>
        <span class="lineup-list__number">#${player.number}</span>
        <span class="lineup-list__name">${player.name}</span>
      `;
      list.appendChild(item);

      // 替補球員
      if (s.substitutes) {
        s.substitutes.forEach(sub => {
          const subPlayer = team.players.find(p => p.id === sub.playerId);
          if (!subPlayer) return;
          const subItem = createElement('div', {
            className: `lineup-list__item lineup-list__item--sub${sub.isActive ? ' active' : ''}`
          });
          subItem.innerHTML = `
            <span class="lineup-list__order">↳</span>
            <span class="lineup-list__pos">${sub.position || ''}</span>
            <span class="lineup-list__number">#${subPlayer.number}</span>
            <span class="lineup-list__name">${subPlayer.name}</span>
          `;
          list.appendChild(subItem);
        });
      }
    });

    wrapper.appendChild(list);

    // 投手資訊
    const pitcherInfo = createElement('div', { className: 'lineup-panel__pitcher' });
    const pitcherId = lineup.pitcher?.playerId;
    const pitcher = pitcherId ? team.players.find(p => p.id === pitcherId) : null;
    if (pitcher) {
      pitcherInfo.innerHTML = `<strong>投手:</strong> #${pitcher.number} ${pitcher.name}`;
    }
    wrapper.appendChild(pitcherInfo);

    this.container.appendChild(wrapper);
  }
}
