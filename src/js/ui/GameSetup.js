/**
 * BBScoring — GameSetup UI (比賽設定引導精靈)
 */
import { createElement, showToast, getTodayStr, getNowTimeStr, generateId } from '../utils/helpers.js';
import { POSITIONS, POSITION_LIST, HAND } from '../utils/constants.js';
import { createGame } from '../models/Game.js';
import { createTeam } from '../models/Team.js';
import { createPlayer } from '../models/Player.js';

export class GameSetup {
  constructor({ container, onComplete, onCancel }) {
    this.container = container;
    this.onComplete = onComplete;
    this.onCancel = onCancel;
    this.step = 1;
    this.totalSteps = 6;

    // 資料
    this.gameInfo = { name: '', date: getTodayStr(), time: getNowTimeStr(), venue: '', totalInnings: 9, notes: '' };
    this.awayTeam = createTeam({ name: '', color: '#c0392b' });
    this.homeTeam = createTeam({ name: '', color: '#2980b9' });
    this.awayLineup = { starters: [], pitcherId: null };
    this.homeLineup = { starters: [], pitcherId: null };
  }

  render() {
    this.container.innerHTML = '';
    const page = createElement('div', { className: 'setup-layout' });

    // Header
    const header = createElement('div', { className: 'setup-layout__header' });
    const backBtn = createElement('button', {
      className: 'btn btn--icon', innerHTML: '◀',
      onClick: () => this.step > 1 ? this._goStep(this.step - 1) : (this.onCancel && this.onCancel())
    });
    const title = createElement('h2', { textContent: this._getStepTitle() });
    const nextBtn = createElement('button', {
      className: 'btn btn--primary btn--sm',
      textContent: this.step === this.totalSteps ? '開始比賽' : '下一步',
      onClick: () => this._next()
    });
    header.append(backBtn, title, nextBtn);

    // Step indicator
    const indicator = createElement('div', { className: 'step-indicator' });
    for (let i = 1; i <= this.totalSteps; i++) {
      const dot = createElement('div', {
        className: `step-indicator__dot${i === this.step ? ' active' : ''}${i < this.step ? ' done' : ''}`
      });
      indicator.appendChild(dot);
    }

    // Body
    const body = createElement('div', { className: 'setup-layout__body scrollable' });
    this._renderStep(body);

    page.append(header, indicator, body);
    this.container.appendChild(page);
  }

  _getStepTitle() {
    const titles = {
      1: `比賽設定 (1/${this.totalSteps})`,
      2: `客隊設定 (2/${this.totalSteps})`,
      3: `主隊設定 (3/${this.totalSteps})`,
      4: `客隊打序 (4/${this.totalSteps})`,
      5: `主隊打序 (5/${this.totalSteps})`,
      6: `確認比賽資訊 (6/${this.totalSteps})`
    };
    return titles[this.step];
  }

  _goStep(step) {
    this.step = step;
    this.render();
  }

  _next() {
    if (!this._validate()) return;
    if (this.step < this.totalSteps) {
      this.step++;
      this.render();
    } else {
      this._complete();
    }
  }

  _validate() {
    if (this.step === 1) {
      if (!this.gameInfo.name.trim()) { showToast('請輸入比賽名稱'); return false; }
      if (!this.gameInfo.date) { showToast('請選擇比賽日期'); return false; }
    }
    if (this.step === 2) {
      if (!this.awayTeam.name.trim()) { showToast('請輸入客隊名稱'); return false; }
      if (this.awayTeam.players.length < 9) { showToast('客隊至少需要 9 位球員'); return false; }
    }
    if (this.step === 3) {
      if (!this.homeTeam.name.trim()) { showToast('請輸入主隊名稱'); return false; }
      if (this.homeTeam.players.length < 9) { showToast('主隊至少需要 9 位球員'); return false; }
    }
    if (this.step === 4) {
      if (this.awayLineup.starters.length < 9) { showToast('請設定客隊 9 位先發球員'); return false; }
      if (!this.awayLineup.pitcherId) { showToast('請指定客隊先發投手'); return false; }
    }
    if (this.step === 5) {
      if (this.homeLineup.starters.length < 9) { showToast('請設定主隊 9 位先發球員'); return false; }
      if (!this.homeLineup.pitcherId) { showToast('請指定主隊先發投手'); return false; }
    }
    return true;
  }

  _renderStep(body) {
    switch (this.step) {
      case 1: this._renderStep1(body); break;
      case 2: this._renderTeamStep(body, this.awayTeam, '客隊'); break;
      case 3: this._renderTeamStep(body, this.homeTeam, '主隊'); break;
      case 4: this._renderLineupStep(body, this.awayTeam, this.awayLineup, '客隊'); break;
      case 5: this._renderLineupStep(body, this.homeTeam, this.homeLineup, '主隊'); break;
      case 6: this._renderConfirm(body); break;
    }
  }

  // === Step 1: 基本資訊 ===
  _renderStep1(body) {
    const fields = [
      { label: '比賽名稱', key: 'name', required: true, placeholder: '例：112年春季聯賽 第3場' },
      { label: '比賽日期', key: 'date', required: true, type: 'date' },
      { label: '開始時間', key: 'time', type: 'time' },
      { label: '比賽場地', key: 'venue', placeholder: '例：台北市立棒球場' },
    ];

    fields.forEach(f => {
      const group = createElement('div', { className: 'form-group' });
      group.appendChild(createElement('label', {
        className: `form-group__label${f.required ? ' required' : ''}`,
        textContent: f.label
      }));
      const input = createElement('input', {
        className: 'input',
        type: f.type || 'text',
        value: this.gameInfo[f.key],
        placeholder: f.placeholder || '',
        onInput: (e) => { this.gameInfo[f.key] = e.target.value; }
      });
      group.appendChild(input);
      body.appendChild(group);
    });

    // 局數選擇
    const inningGroup = createElement('div', { className: 'form-group' });
    inningGroup.appendChild(createElement('label', { className: 'form-group__label required', textContent: '比賽局數' }));
    const options = createElement('div', { className: 'option-group' });
    [5, 7, 9].forEach(n => {
      const btn = createElement('button', {
        className: `option-btn${this.gameInfo.totalInnings === n ? ' selected' : ''}`,
        textContent: `${n}局`,
        onClick: () => { this.gameInfo.totalInnings = n; this.render(); }
      });
      options.appendChild(btn);
    });
    inningGroup.appendChild(options);
    body.appendChild(inningGroup);

    // 備註
    const noteGroup = createElement('div', { className: 'form-group' });
    noteGroup.appendChild(createElement('label', { className: 'form-group__label', textContent: '備註' }));
    const textarea = createElement('textarea', {
      className: 'input', rows: '3',
      onInput: (e) => { this.gameInfo.notes = e.target.value; }
    });
    textarea.value = this.gameInfo.notes;
    noteGroup.appendChild(textarea);
    body.appendChild(noteGroup);
  }

  // === Step 2-3: 隊伍球員 ===
  _renderTeamStep(body, team, label) {
    // 隊名
    const nameGroup = createElement('div', { className: 'form-group' });
    nameGroup.appendChild(createElement('label', { className: 'form-group__label required', textContent: '隊伍名稱' }));
    nameGroup.appendChild(createElement('input', {
      className: 'input', value: team.name, placeholder: `輸入${label}名稱`,
      onInput: (e) => { team.name = e.target.value; team.shortName = e.target.value.substring(0, 2); }
    }));
    body.appendChild(nameGroup);

    // 球員清單
    body.appendChild(createElement('div', { className: 'form-group__label', textContent: `球員名單 (${team.players.length} 人)` }));

    if (team.players.length > 0) {
      const table = createElement('table', { className: 'player-table' });
      const thead = createElement('thead');
      thead.innerHTML = '<tr><th>#</th><th>姓名</th><th>投</th><th>打</th><th>位置</th><th></th></tr>';
      table.appendChild(thead);

      const tbody = createElement('tbody');
      team.players.forEach((p, i) => {
        const tr = createElement('tr');
        tr.innerHTML = `
          <td>${p.number}</td>
          <td>${p.name}</td>
          <td>${HAND[p.throws] || '右'}</td>
          <td>${HAND[p.bats] || '右'}</td>
          <td>${p.position.join(', ') || '-'}</td>
        `;
        const tdAction = createElement('td');
        const delBtn = createElement('button', {
          className: 'btn btn--icon btn--sm', innerHTML: '🗑',
          onClick: () => { team.players.splice(i, 1); this.render(); }
        });
        tdAction.appendChild(delBtn);
        tr.appendChild(tdAction);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      body.appendChild(table);
    }

    // 快速新增
    body.appendChild(createElement('div', { className: 'divider' }));
    body.appendChild(createElement('div', { className: 'form-group__label', textContent: '快速新增球員' }));

    const quickAdd = createElement('div', { className: 'quick-add' });
    const numInput = createElement('input', {
      className: 'input input--number', type: 'number', placeholder: '背號', min: '0', max: '99'
    });
    const nameInput = createElement('input', {
      className: 'input input--name', type: 'text', placeholder: '姓名'
    });
    const addBtn = createElement('button', {
      className: 'btn btn--primary btn--sm', textContent: '新增',
      onClick: () => {
        const num = parseInt(numInput.value);
        const name = nameInput.value.trim();
        if (isNaN(num) || !name) { showToast('請輸入背號和姓名'); return; }
        if (team.players.some(p => p.number === num)) { showToast(`背號 #${num} 已有球員使用`); return; }
        team.players.push(createPlayer({ number: num, name }));
        numInput.value = '';
        nameInput.value = '';
        numInput.focus();
        this.render();
      }
    });
    quickAdd.append(numInput, nameInput, addBtn);
    body.appendChild(quickAdd);
  }

  // === Step 4-5: 打序設定 ===
  _renderLineupStep(body, team, lineup, label) {
    body.appendChild(createElement('div', { className: 'form-group__label', textContent: '先發打序（點擊球員加入打序）' }));

    // 已選打序
    if (lineup.starters.length > 0) {
      lineup.starters.forEach((s, i) => {
        const player = team.players.find(p => p.id === s.playerId);
        if (!player) return;
        const item = createElement('div', { className: 'lineup-editor__item' });
        item.innerHTML = `
          <span class="lineup-editor__order">${i + 1}</span>
          <span class="lineup-item__number">#${player.number}</span>
          <span class="lineup-item__name">${player.name}</span>
        `;
        // 守備位置選擇
        const select = createElement('select', {
          className: 'lineup-editor__pos-select',
          onChange: (e) => { s.position = e.target.value; }
        });
        POSITION_LIST.filter(p => p !== 'P').forEach(pos => {
          const opt = createElement('option', { value: pos, textContent: pos });
          if (s.position === pos) opt.selected = true;
          select.appendChild(opt);
        });
        item.appendChild(select);

        // 移除
        const removeBtn = createElement('button', {
          className: 'btn btn--icon btn--sm', innerHTML: '✕',
          onClick: () => { lineup.starters.splice(i, 1); this.render(); }
        });
        item.appendChild(removeBtn);
        body.appendChild(item);
      });
    }

    // 未選球員
    if (lineup.starters.length < 9) {
      body.appendChild(createElement('div', { className: 'divider' }));
      body.appendChild(createElement('div', { className: 'form-group__label', textContent: '點擊加入打序' }));
      const selectedIds = lineup.starters.map(s => s.playerId);
      team.players.filter(p => !selectedIds.includes(p.id)).forEach(p => {
        const btn = createElement('button', {
          className: 'btn btn--outline btn--sm mb-sm',
          textContent: `#${p.number} ${p.name}`,
          onClick: () => {
            if (lineup.starters.length >= 9) return;
            lineup.starters.push({
              order: lineup.starters.length + 1,
              playerId: p.id,
              position: p.position[0] || 'CF',
              isActive: true
            });
            this.render();
          }
        });
        body.appendChild(btn);
      });
    }

    // 先發投手
    body.appendChild(createElement('div', { className: 'divider' }));
    body.appendChild(createElement('div', { className: 'form-group__label required', textContent: '先發投手' }));
    const pitcherSelect = createElement('select', {
      className: 'input',
      onChange: (e) => { lineup.pitcherId = e.target.value; }
    });
    pitcherSelect.appendChild(createElement('option', { value: '', textContent: '-- 選擇投手 --' }));
    team.players.forEach(p => {
      const opt = createElement('option', { value: p.id, textContent: `#${p.number} ${p.name}` });
      if (lineup.pitcherId === p.id) opt.selected = true;
      pitcherSelect.appendChild(opt);
    });
    body.appendChild(pitcherSelect);
  }

  // === Step 6: 確認 ===
  _renderConfirm(body) {
    // 比賽資訊
    const info = createElement('div', { className: 'confirm-section' });
    info.innerHTML = `
      <div class="confirm-section__title">📋 ${this.gameInfo.name}</div>
      <div class="text-secondary">📅 ${this.gameInfo.date} ${this.gameInfo.time}</div>
      <div class="text-secondary">📍 ${this.gameInfo.venue || '未設定'}</div>
      <div class="text-secondary">🏟 ${this.gameInfo.totalInnings}局制</div>
    `;
    body.appendChild(info);

    // 客隊
    this._renderConfirmTeam(body, this.awayTeam, this.awayLineup, '客隊');
    // 主隊
    this._renderConfirmTeam(body, this.homeTeam, this.homeLineup, '主隊');
  }

  _renderConfirmTeam(body, team, lineup, label) {
    const section = createElement('div', { className: 'confirm-section' });
    section.appendChild(createElement('div', { className: 'confirm-section__title', textContent: `── ${label}：${team.name} ──` }));

    const list = createElement('div', { className: 'confirm-lineup' });
    lineup.starters.forEach((s, i) => {
      const player = team.players.find(p => p.id === s.playerId);
      if (!player) return;
      list.appendChild(createElement('div', {
        className: 'confirm-lineup__row',
        textContent: `${i + 1}. ${s.position}  #${player.number}  ${player.name}`
      }));
    });

    const pitcher = team.players.find(p => p.id === lineup.pitcherId);
    if (pitcher) {
      list.appendChild(createElement('div', {
        className: 'confirm-lineup__row mt-sm',
        innerHTML: `<strong>先發投手: #${pitcher.number} ${pitcher.name}</strong>`
      }));
    }

    section.appendChild(list);
    body.appendChild(section);
  }

  // === 完成 ===
  _complete() {
    const game = createGame(this.gameInfo);
    game.teams.away = this.awayTeam;
    game.teams.home = this.homeTeam;

    // 設定打序
    game.lineups.away.teamId = this.awayTeam.id;
    game.lineups.away.starters = this.awayLineup.starters;
    game.lineups.away.pitcher = { playerId: this.awayLineup.pitcherId, isActive: true };

    game.lineups.home.teamId = this.homeTeam.id;
    game.lineups.home.starters = this.homeLineup.starters;
    game.lineups.home.pitcher = { playerId: this.homeLineup.pitcherId, isActive: true };

    if (this.onComplete) this.onComplete(game);
  }
}
