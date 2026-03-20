/**
 * BBScoring — HitResultPanel UI (步驟式擊出精靈)
 *
 * Step flow:
 *   1. type       — 打擊類型 (滾地/飛球/平飛)
 *   2. direction  — 守備路徑 (守位號碼，可連續追加)
 *   3. result     — 結果分類 (安打/出局/失誤/野選)
 *   3-1. hit      — 安打詳情 (一壘~全壘打, 進壘, 得分, 打點)
 *   3-2. out      — 出局詳情 (依打擊類型過濾, 打點, 雙殺警告)
 *   3-3. error    — 失誤詳情 (失誤守位, 上到幾壘)
 *   3-4. fc       — 野選詳情 (有無出局, 哪位跑者出局)
 *   4. notes      — 備註
 */
import { createElement, showToast } from '../utils/helpers.js';
import { HIT_RESULTS_INFO } from '../utils/constants.js';
import { createHitResult } from '../models/Play.js';
import { Vibration } from '../utils/vibration.js';

const POS_NUM_MAP = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B',
  6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF'
};

const POS_LABELS = {
  1: '1 投手', 2: '2 捕手', 3: '3 一壘', 4: '4 二壘', 5: '5 三壘',
  6: '6 游擊', 7: '7 左外', 8: '8 中外', 9: '9 右外'
};

// Out types with compatible hit types
const OUT_OPTIONS = [
  { val: 'GO',  label: '滾地出局',   compatible: ['G', 'BU'] },
  { val: 'FO',  label: '飛球出局',   compatible: ['F'] },
  { val: 'LO',  label: '平飛出局',   compatible: ['L'] },
  { val: 'IF',  label: '內野飛球',   compatible: ['F', 'P'] },
  { val: 'FF',  label: '界外飛球',   compatible: ['F'] },
  { val: 'SF',  label: '犧牲飛球',   compatible: ['F'] },
  { val: 'SAC', label: '犧牲短打',   compatible: ['G', 'BU'] },
  { val: 'DP',  label: '雙殺',       compatible: ['G', 'L'] },
  { val: 'TP',  label: '三殺',       compatible: ['G', 'L'] },
  { val: 'TAG', label: '觸殺',       compatible: ['G', 'L', 'F'] },
];

export class HitResultPanel {
  constructor({ container, onResult, onCancel, hasRunners, runners }) {
    this.container = container;
    this.onResult = onResult;
    this.onCancel = onCancel;
    this.hasRunners = hasRunners || false;
    this.runners = runners || { first: null, second: null, third: null };

    this._step = 'type';
    this._data = this._freshData();
  }

  _freshData() {
    return {
      hitType: null,
      fieldingPath: [],
      resultCategory: null,
      resultType: null,
      hitBases: null,
      advancement: false,
      advancementReason: null,
      errorPosition: null,
      baseReached: null,
      fcOutOccurred: false,
      fcOutRunner: null,
      // Phase B: runner outcomes — auto-filled then user-adjustable
      runnerOutcomes: null, // { batter: {dest}, first: {dest}, second: {dest}, third: {dest} }
      notes: ''
    };
  }

  render() {
    this.container.innerHTML = '';
    const panel = createElement('div', { className: 'hit-result-panel' });
    panel.appendChild(this._renderHeader());

    const body = createElement('div', { className: 'hit-result-panel__body scrollable' });
    switch (this._step) {
      case 'type':         body.appendChild(this._renderTypeStep()); break;
      case 'direction':    body.appendChild(this._renderDirectionStep()); break;
      case 'result':       body.appendChild(this._renderResultStep()); break;
      case 'hit-detail':   body.appendChild(this._renderHitDetailStep()); break;
      case 'out-detail':   body.appendChild(this._renderOutDetailStep()); break;
      case 'error-detail': body.appendChild(this._renderErrorDetailStep()); break;
      case 'fc-detail':    body.appendChild(this._renderFCDetailStep()); break;
      case 'runners':      body.appendChild(this._renderRunnersStep()); break;
      case 'notes':        body.appendChild(this._renderNotesStep()); break;
    }
    panel.appendChild(body);
    this.container.appendChild(panel);
  }

  // ═══════════════════════════════════════════
  // Header
  // ═══════════════════════════════════════════

  _renderHeader() {
    const header = createElement('div', { className: 'hit-result-panel__header' });

    if (this._step !== 'type') {
      header.appendChild(createElement('button', {
        className: 'btn btn--icon btn--sm', innerHTML: '←',
        onClick: () => this._goBack()
      }));
    } else {
      header.appendChild(createElement('button', {
        className: 'btn btn--icon', innerHTML: '✕',
        onClick: () => { if (this.onCancel) this.onCancel(); }
      }));
    }

    const STEP_LABELS = {
      'type': '步驟 1：打擊類型',
      'direction': '步驟 2：守備方向',
      'result': '步驟 3：選擇結果',
      'hit-detail': '步驟 3-1：安打詳情',
      'out-detail': '步驟 3-2：出局詳情',
      'error-detail': '步驟 3-3：失誤詳情',
      'fc-detail': '步驟 3-4：野選詳情',
      'runners': '步驟 4：跑壘結果',
      'notes': '步驟 5：確認'
    };
    header.appendChild(createElement('h3', { textContent: STEP_LABELS[this._step] || '打擊結果' }));

    const STEP_NUM = {
      'type': 1, 'direction': 2, 'result': 3,
      'hit-detail': 3, 'out-detail': 3, 'error-detail': 3, 'fc-detail': 3,
      'runners': 4, 'notes': 5
    };
    header.appendChild(createElement('span', {
      className: 'hit-result-panel__step',
      textContent: `${STEP_NUM[this._step] || 1}/5`
    }));

    return header;
  }

  _goBack() {
    const d = this._data;
    const BACK_MAP = {
      'direction': 'type',
      'result': 'direction',
      'hit-detail': 'result',
      'out-detail': 'result',
      'error-detail': 'result',
      'fc-detail': 'result',
      'runners': d.resultCategory ? `${d.resultCategory}-detail` : 'result',
      'notes': 'runners'
    };
    // When going back to result step, clear result selection
    if (this._step.endsWith('-detail') && BACK_MAP[this._step] === 'result') {
      d.resultCategory = null;
      d.resultType = null;
      d.hitBases = null;
    }
    // When going back from runners, clear outcomes
    if (this._step === 'runners') {
      d.runnerOutcomes = null;
    }
    this._step = BACK_MAP[this._step] || 'type';
    this.render();
  }

  // ═══════════════════════════════════════════
  // Step 1: Hit Type
  // ═══════════════════════════════════════════

  _renderTypeStep() {
    const frag = document.createDocumentFragment();
    frag.appendChild(createElement('div', { className: 'section-label', textContent: '選擇打擊類型' }));

    const grid = createElement('div', { className: 'hit-wizard__type-grid' });
    [
      { val: 'G', label: '滾地', icon: '━▶' },
      { val: 'F', label: '飛球', icon: '↗' },
      { val: 'L', label: '平飛', icon: '─▶' }
    ].forEach(t => {
      const btn = createElement('button', {
        className: `btn btn--lg ${this._data.hitType === t.val ? 'btn--primary' : 'btn--outline'}`,
        onClick: () => {
          Vibration.tap();
          this._data.hitType = t.val;
          this._step = 'direction';
          this.render();
        }
      });
      btn.innerHTML = `<span class="hit-wizard__type-icon">${t.icon}</span><span>${t.label}</span>`;
      grid.appendChild(btn);
    });
    frag.appendChild(grid);
    return frag;
  }

  // ═══════════════════════════════════════════
  // Step 2: Direction / Fielding Path
  // ═══════════════════════════════════════════

  _renderDirectionStep() {
    const frag = document.createDocumentFragment();
    const path = this._data.fieldingPath;

    if (path.length > 0) {
      const pathDisplay = createElement('div', { className: 'hit-wizard__path-display' });
      pathDisplay.textContent = `守備路徑: ${path.join(' - ')}`;
      frag.appendChild(pathDisplay);
    } else {
      frag.appendChild(createElement('div', { className: 'section-label', textContent: '選擇球的方向（守位號碼）' }));
    }

    // 3×3 position grid
    const grid = createElement('div', { className: 'hit-wizard__pos-grid' });
    for (let i = 1; i <= 9; i++) {
      const lastPos = path.length > 0 ? path[path.length - 1] : null;
      const disabled = lastPos === i;
      grid.appendChild(createElement('button', {
        className: `btn btn--outline hit-wizard__pos-btn${disabled ? ' disabled' : ''}`,
        textContent: POS_LABELS[i],
        disabled: disabled,
        onClick: () => { if (!disabled) { Vibration.tap(); path.push(i); this.render(); } }
      }));
    }
    frag.appendChild(grid);

    // Action buttons
    const actions = createElement('div', { className: 'hit-wizard__actions' });
    if (path.length > 0) {
      actions.appendChild(createElement('button', {
        className: 'btn btn--sm btn--outline', textContent: '刪除最後',
        onClick: () => { path.pop(); this.render(); }
      }));
      actions.appendChild(createElement('button', {
        className: 'btn btn--sm btn--outline', textContent: '清除全部',
        onClick: () => { this._data.fieldingPath = []; this.render(); }
      }));
    }
    actions.appendChild(createElement('button', {
      className: 'btn btn--primary', textContent: '下一步 →',
      onClick: () => {
        if (path.length === 0) { showToast('請至少選擇一個守位'); return; }
        this._step = 'result';
        this.render();
      }
    }));
    frag.appendChild(actions);
    return frag;
  }

  // ═══════════════════════════════════════════
  // Step 3: Result Category
  // ═══════════════════════════════════════════

  _renderResultStep() {
    const frag = document.createDocumentFragment();
    frag.appendChild(createElement('div', { className: 'section-label', textContent: '選擇結果分類' }));

    const grid = createElement('div', { className: 'hit-wizard__result-grid' });
    const cats = [
      { key: 'hit',   label: '安打', cls: 'btn--hit-1b' },
      { key: 'out',   label: '出局', cls: 'btn--out' },
      { key: 'error', label: '失誤', cls: 'btn--danger' },
    ];
    if (this.hasRunners) {
      cats.push({ key: 'fc', label: '野選', cls: 'btn--other' });
    }
    cats.forEach(c => {
      grid.appendChild(createElement('button', {
        className: `btn btn--lg ${c.cls}`,
        textContent: c.label,
        onClick: () => {
          Vibration.tap();
          this._data.resultCategory = c.key;
          this._step = `${c.key}-detail`;
          this.render();
        }
      }));
    });
    frag.appendChild(grid);
    return frag;
  }

  // ═══════════════════════════════════════════
  // Step 3-1: Hit Detail
  // ═══════════════════════════════════════════

  _renderHitDetailStep() {
    const frag = document.createDocumentFragment();
    const d = this._data;

    if (!d.hitBases) {
      frag.appendChild(createElement('div', { className: 'section-label', textContent: '安打類型' }));
      const grid = createElement('div', { className: 'hit-wizard__hit-grid' });
      [
        { val: 1, label: '一壘安打', cls: 'btn--hit-1b' },
        { val: 2, label: '二壘安打', cls: 'btn--hit-2b' },
        { val: 3, label: '三壘安打', cls: 'btn--hit-3b' },
        { val: 4, label: '全壘打',   cls: 'btn--hit-hr' }
      ].forEach(o => {
        grid.appendChild(createElement('button', {
          className: `btn btn--lg ${o.cls}`,
          textContent: o.label,
          onClick: () => {
            Vibration.tap();
            d.hitBases = o.val;
            d.resultType = ['', '1B', '2B', '3B', 'HR'][o.val];
            this._initRunnerOutcomes();
            this._step = 'runners';
            this.render();
          }
        }));
      });
      frag.appendChild(grid);
      return frag;
    }

    return frag;
  }

  // ═══════════════════════════════════════════
  // Step 3-2: Out Detail
  // ═══════════════════════════════════════════

  _renderOutDetailStep() {
    const frag = document.createDocumentFragment();
    const d = this._data;

    if (!d.resultType) {
      frag.appendChild(createElement('div', { className: 'section-label', textContent: '選擇出局類型' }));
      const grid = createElement('div', { className: 'hit-wizard__out-grid' });

      OUT_OPTIONS.forEach(o => {
        let ok = o.compatible.includes(d.hitType);
        // Filter DP/TP/SF/SAC based on runner count
        const runnerCount = this._runnerCount;
        if (o.val === 'DP' || o.val === 'SF' || o.val === 'SAC') { if (runnerCount < 1) ok = false; }
        if (o.val === 'TP') { if (runnerCount < 2) ok = false; }

        grid.appendChild(createElement('button', {
          className: `btn btn--sm ${ok ? 'btn--out' : 'btn--outline hit-wizard__disabled'}`,
          textContent: o.label,
          disabled: !ok,
          onClick: () => { if (!ok) return; Vibration.tap(); d.resultType = o.val; this.render(); }
        }));
      });
      frag.appendChild(grid);
      return frag;
    }

    const outInfo = OUT_OPTIONS.find(o => o.val === d.resultType);
    frag.appendChild(createElement('div', { className: 'hit-wizard__selected-badge', textContent: `✓ ${outInfo?.label || d.resultType}` }));

    frag.appendChild(this._nextBtn(() => { this._initRunnerOutcomes(); this._step = 'runners'; this.render(); }));
    return frag;
  }

  // ═══════════════════════════════════════════
  // Step 3-3: Error Detail
  // ═══════════════════════════════════════════

  _renderErrorDetailStep() {
    const frag = document.createDocumentFragment();
    const d = this._data;

    frag.appendChild(createElement('div', { className: 'section-label', textContent: '失誤守位' }));
    const grid = createElement('div', { className: 'hit-wizard__pos-grid' });
    for (let i = 1; i <= 9; i++) {
      const inPath = d.fieldingPath.includes(i);
      const selected = d.errorPosition === i;
      grid.appendChild(createElement('button', {
        className: `btn btn--sm ${selected ? 'btn--danger' : inPath ? 'btn--outline hit-wizard__highlight' : 'btn--outline'}`,
        textContent: POS_LABELS[i],
        onClick: () => { Vibration.tap(); d.errorPosition = i; d.resultType = 'E'; this.render(); }
      }));
    }
    frag.appendChild(grid);

    if (d.errorPosition) {
      frag.appendChild(createElement('div', { className: 'section-label', textContent: '打者上到哪個壘包' }));
      const baseGrid = createElement('div', { className: 'hit-wizard__base-grid' });
      [
        { val: 'first', label: '一壘' },
        { val: 'second', label: '二壘' },
        { val: 'third', label: '三壘' },
        { val: 'home', label: '本壘(得分)' }
      ].forEach(b => {
        baseGrid.appendChild(createElement('button', {
          className: `btn btn--sm ${d.baseReached === b.val ? 'btn--primary' : 'btn--outline'}`,
          textContent: b.label,
          onClick: () => { Vibration.tap(); d.baseReached = b.val; this.render(); }
        }));
      });
      frag.appendChild(baseGrid);
    }

    if (d.errorPosition && d.baseReached) {
      frag.appendChild(this._nextBtn(() => { this._initRunnerOutcomes(); this._step = 'runners'; this.render(); }));
    }
    return frag;
  }

  // ═══════════════════════════════════════════
  // Step 3-4: Fielder's Choice Detail
  // ═══════════════════════════════════════════

  _renderFCDetailStep() {
    const frag = document.createDocumentFragment();
    const d = this._data;
    d.resultType = 'FC';

    frag.appendChild(this._ynToggle('是否有出局？', d.fcOutOccurred, v => { d.fcOutOccurred = v; this.render(); }));

    if (d.fcOutOccurred) {
      frag.appendChild(createElement('div', { className: 'section-label', textContent: '哪位跑者出局？' }));
      const grid = createElement('div', { className: 'hit-wizard__runner-grid' });
      [
        { key: 'first', label: '一壘跑者' },
        { key: 'second', label: '二壘跑者' },
        { key: 'third', label: '三壘跑者' }
      ].forEach(b => {
        if (!this.runners[b.key]) return;
        grid.appendChild(createElement('button', {
          className: `btn btn--sm ${d.fcOutRunner === b.key ? 'btn--primary' : 'btn--outline'}`,
          textContent: b.label,
          onClick: () => { Vibration.tap(); d.fcOutRunner = b.key; this.render(); }
        }));
      });
      frag.appendChild(grid);
    }

    frag.appendChild(this._nextBtn(() => { d.resultType = 'FC'; this._initRunnerOutcomes(); this._step = 'runners'; this.render(); }));
    return frag;
  }

  // ═══════════════════════════════════════════
  // Phase B: Runner Outcomes
  // ═══════════════════════════════════════════

  /** Initialize runner outcomes with smart defaults based on result type */
  _initRunnerOutcomes() {
    const d = this._data;
    const runners = this.runners; // { first: playerObj|null, second: playerObj|null, third: playerObj|null }
    const outcomes = {};
    const info = HIT_RESULTS_INFO[d.resultType];
    const bases = info?.bases || 0;
    const cat = info?.category;

    // Determine possible destinations for each person
    // "out" = out at current base, "stay" = remain, "first"..."home" = advance to that base
    const BASES_ORDER = ['first', 'second', 'third', 'home'];

    if (cat === 'HIT') {
      // Hit defaults from autoAdvanceRunners logic
      if (bases === 4) {
        // HR: everyone scores
        if (runners.third) outcomes.third = { dest: 'home' };
        if (runners.second) outcomes.second = { dest: 'home' };
        if (runners.first) outcomes.first = { dest: 'home' };
        outcomes.batter = { dest: 'home' };
      } else if (bases === 3) {
        if (runners.third) outcomes.third = { dest: 'home' };
        if (runners.second) outcomes.second = { dest: 'home' };
        if (runners.first) outcomes.first = { dest: 'home' };
        outcomes.batter = { dest: 'third' };
      } else if (bases === 2) {
        if (runners.third) outcomes.third = { dest: 'home' };
        if (runners.second) outcomes.second = { dest: 'home' };
        if (runners.first) outcomes.first = { dest: 'third' };
        outcomes.batter = { dest: 'second' };
      } else if (bases === 1) {
        if (runners.third) outcomes.third = { dest: 'home' };
        if (runners.second) outcomes.second = { dest: 'third' };
        if (runners.first) outcomes.first = { dest: 'second' };
        outcomes.batter = { dest: 'first' };
      }
    } else if (cat === 'OUT' || cat === 'SAC') {
      // Out: batter is out, runners stay unless SAC/SF
      if (runners.third) outcomes.third = { dest: (d.resultType === 'SF') ? 'home' : 'stay' };
      if (runners.second) outcomes.second = { dest: 'stay' };
      if (runners.first) outcomes.first = { dest: 'stay' };
      outcomes.batter = { dest: 'out' };

      // DP: batter out + one runner out (default lead runner)
      if (d.resultType === 'DP') {
        if (runners.first) outcomes.first = { dest: 'out' };
        else if (runners.second) outcomes.second = { dest: 'out' };
      }
      // TP: batter out + two runners out
      if (d.resultType === 'TP') {
        if (runners.first) outcomes.first = { dest: 'out' };
        if (runners.second) outcomes.second = { dest: 'out' };
        if (!runners.first && runners.third) outcomes.third = { dest: 'out' };
      }
    } else if (d.resultType === 'E') {
      // Error: batter reaches base specified in error-detail
      if (runners.third) outcomes.third = { dest: 'home' };
      if (runners.second) outcomes.second = { dest: 'third' };
      if (runners.first) outcomes.first = { dest: 'second' };
      outcomes.batter = { dest: d.baseReached || 'first' };
    } else if (d.resultType === 'FC') {
      // FC: batter reaches first, specified runner is out
      outcomes.batter = { dest: 'first' };
      if (runners.third) outcomes.third = { dest: d.fcOutRunner === 'third' ? 'out' : 'stay' };
      if (runners.second) outcomes.second = { dest: d.fcOutRunner === 'second' ? 'out' : 'stay' };
      if (runners.first) outcomes.first = { dest: d.fcOutRunner === 'first' ? 'out' : 'stay' };
    } else {
      // Fallback
      if (runners.third) outcomes.third = { dest: 'stay' };
      if (runners.second) outcomes.second = { dest: 'stay' };
      if (runners.first) outcomes.first = { dest: 'stay' };
      outcomes.batter = { dest: 'first' };
    }

    d.runnerOutcomes = outcomes;
  }

  /** Get valid destinations for a person given their starting base */
  _getDestOptions(fromBase) {
    const all = [
      { val: 'out', label: '出局', cls: 'btn--danger' }
    ];
    if (fromBase === 'home') {
      // Batter
      all.push({ val: 'first', label: '一壘', cls: 'btn--outline' });
      all.push({ val: 'second', label: '二壘', cls: 'btn--outline' });
      all.push({ val: 'third', label: '三壘', cls: 'btn--outline' });
      all.push({ val: 'home', label: '得分', cls: 'btn--hit-hr' });
    } else {
      // Runner on base — can stay, advance, or be out
      const baseNames = { first: '一壘', second: '二壘', third: '三壘', home: '得分' };
      const order = ['first', 'second', 'third', 'home'];
      const idx = order.indexOf(fromBase);
      all.push({ val: 'stay', label: `留${baseNames[fromBase]}`, cls: 'btn--outline' });
      for (let i = idx + 1; i < order.length; i++) {
        const isScore = order[i] === 'home';
        all.push({ val: order[i], label: isScore ? '得分' : baseNames[order[i]], cls: isScore ? 'btn--hit-hr' : 'btn--outline' });
      }
    }
    return all;
  }

  _renderRunnersStep() {
    const frag = document.createDocumentFragment();
    const d = this._data;
    const outcomes = d.runnerOutcomes;
    if (!outcomes) { this._initRunnerOutcomes(); return this._renderRunnersStep(); }

    const resultInfo = HIT_RESULTS_INFO[d.resultType];
    frag.appendChild(createElement('div', { className: 'section-label', textContent: `跑壘結果 — ${resultInfo?.name || d.resultType}` }));
    frag.appendChild(createElement('div', { className: 'hit-wizard__runner-hint', textContent: '系統已自動預填，可依實際調整' }));

    const baseLabel = { third: '三壘跑者', second: '二壘跑者', first: '一壘跑者' };
    const container = createElement('div', { className: 'runner-outcomes' });

    // Show runners from third → first, then batter
    ['third', 'second', 'first'].forEach(base => {
      if (!outcomes[base]) return;
      const runner = this.runners[base];
      const name = runner ? (runner.name || `#${runner.number}`) : baseLabel[base];

      const row = createElement('div', { className: 'runner-outcomes__row' });
      const label = createElement('div', { className: 'runner-outcomes__label' });
      label.innerHTML = `<span class="runner-outcomes__base">${baseLabel[base]}</span><span class="runner-outcomes__name">${name}</span>`;
      row.appendChild(label);

      const btns = createElement('div', { className: 'runner-outcomes__btns' });
      this._getDestOptions(base).forEach(opt => {
        const selected = outcomes[base].dest === opt.val;
        btns.appendChild(createElement('button', {
          className: `btn btn--sm ${selected ? (opt.val === 'out' ? 'btn--danger' : opt.val === 'home' ? 'btn--hit-hr' : 'btn--primary') : opt.cls}`,
          textContent: opt.label,
          onClick: () => { Vibration.tap(); outcomes[base].dest = opt.val; this.render(); }
        }));
      });
      row.appendChild(btns);
      container.appendChild(row);
    });

    // Batter
    if (outcomes.batter) {
      const batter = createElement('div', { className: 'runner-outcomes__row runner-outcomes__row--batter' });
      const batterLabel = createElement('div', { className: 'runner-outcomes__label' });
      batterLabel.innerHTML = `<span class="runner-outcomes__base">打者</span><span class="runner-outcomes__name">⚾</span>`;

      const btns = createElement('div', { className: 'runner-outcomes__btns' });
      this._getDestOptions('home').forEach(opt => {
        const selected = outcomes.batter.dest === opt.val;
        btns.appendChild(createElement('button', {
          className: `btn btn--sm ${selected ? (opt.val === 'out' ? 'btn--danger' : opt.val === 'home' ? 'btn--hit-hr' : 'btn--primary') : opt.cls}`,
          textContent: opt.label,
          onClick: () => { Vibration.tap(); outcomes.batter.dest = opt.val; this.render(); }
        }));
      });
      batter.append(batterLabel, btns);
      container.appendChild(batter);
    }

    frag.appendChild(container);

    // Auto-calculated summary
    const { runs, rbi, outs } = this._calcFromOutcomes();
    const summaryDiv = createElement('div', { className: 'runner-outcomes__summary' });
    summaryDiv.innerHTML = `<span>得分: <strong>${runs}</strong></span> <span>打點: <strong>${rbi}</strong></span> <span>出局: <strong>${outs}</strong></span>`;
    frag.appendChild(summaryDiv);

    frag.appendChild(this._nextBtn(() => { this._step = 'notes'; this.render(); }));
    return frag;
  }

  /** Calculate runs, RBI, and outs from runner outcomes */
  _calcFromOutcomes() {
    const outcomes = this._data.runnerOutcomes;
    if (!outcomes) return { runs: 0, rbi: 0, outs: 0 };

    let runs = 0, outs = 0;
    const cat = HIT_RESULTS_INFO[this._data.resultType]?.category;

    // Count scoring runners (not batter)
    ['third', 'second', 'first'].forEach(base => {
      if (outcomes[base]?.dest === 'home') runs++;
      if (outcomes[base]?.dest === 'out') outs++;
    });

    // Batter
    if (outcomes.batter?.dest === 'home') runs++;
    if (outcomes.batter?.dest === 'out') outs++;

    // RBI: runs scored, except errors don't count RBI, DP usually doesn't
    let rbi = runs;
    if (cat === 'ERROR') rbi = 0;
    if (this._data.resultType === 'DP') rbi = 0;

    return { runs, rbi, outs };
  }

  // ═══════════════════════════════════════════
  // Step 4: Notes + Confirm
  // ═══════════════════════════════════════════

  _renderNotesStep() {
    const frag = document.createDocumentFragment();

    // Summary
    frag.appendChild(this._renderSummary());

    // Notes textarea
    frag.appendChild(createElement('div', { className: 'section-label', textContent: '備註（選填）' }));
    const ta = createElement('textarea', {
      className: 'hit-wizard__notes',
      placeholder: '文字轉播、特殊判決說明...'
    });
    ta.value = this._data.notes;
    ta.addEventListener('input', (e) => { this._data.notes = e.target.value; });
    frag.appendChild(ta);

    // Confirm
    frag.appendChild(createElement('button', {
      className: 'btn btn--primary btn--block btn--lg',
      textContent: '確認結果 ✓',
      style: 'margin-top: var(--space-md)',
      onClick: () => this._submit()
    }));
    return frag;
  }

  _renderSummary() {
    const d = this._data;
    const typeMap = { G: '滾地', F: '飛球', L: '平飛' };
    const baseNames = { first: '一壘', second: '二壘', third: '三壘', home: '得分', stay: '留壘', out: '出局' };
    const lines = [];
    if (d.hitType) lines.push(`打擊類型: ${typeMap[d.hitType]}`);
    if (d.fieldingPath.length) lines.push(`守備路徑: ${d.fieldingPath.join('-')}`);
    if (d.resultType) {
      const info = HIT_RESULTS_INFO[d.resultType];
      lines.push(`結果: ${info ? info.name : d.resultType}`);
    }
    if (d.errorPosition) lines.push(`失誤守位: ${POS_LABELS[d.errorPosition]}`);

    // Runner outcomes summary
    if (d.runnerOutcomes) {
      const { runs, rbi } = this._calcFromOutcomes();
      const baseLabel = { third: '三壘', second: '二壘', first: '一壘' };
      ['third', 'second', 'first'].forEach(base => {
        if (d.runnerOutcomes[base]) {
          lines.push(`${baseLabel[base]}跑者: ${baseNames[d.runnerOutcomes[base].dest]}`);
        }
      });
      if (d.runnerOutcomes.batter) {
        lines.push(`打者: ${baseNames[d.runnerOutcomes.batter.dest]}`);
      }
      if (runs > 0) lines.push(`得分: ${runs}`);
      if (rbi > 0) lines.push(`打點: ${rbi}`);
    }

    const box = createElement('div', { className: 'hit-wizard__summary' });
    box.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
    return box;
  }

  // ═══════════════════════════════════════════
  // Submit
  // ═══════════════════════════════════════════

  _submit() {
    const d = this._data;
    if (!d.resultType) { showToast('請完成所有步驟'); return; }

    const { runs, rbi } = this._calcFromOutcomes();

    const result = createHitResult({
      type: d.resultType,
      hitType: d.hitType,
      direction: { zone: null, subZone: null, x: null, y: null },
      fieldingPath: d.fieldingPath.map(n => POS_NUM_MAP[n]),
      rbi,
      isError: d.resultCategory === 'error',
      errorFielder: d.errorPosition ? POS_NUM_MAP[d.errorPosition] : null,
      errorType: null
    });

    // Attach metadata
    result.notes = d.notes;
    result.baseReached = d.baseReached;
    result.fcOutOccurred = d.fcOutOccurred;
    result.fcOutRunner = d.fcOutRunner;

    // Build runnerOverrides from Phase B outcomes
    if (d.runnerOutcomes) {
      result.runnerOverrides = this._buildRunnerOverrides();
    }

    // Reset wizard
    this._step = 'type';
    this._data = this._freshData();

    Vibration.heavy();
    if (this.onResult) this.onResult(result);
  }

  /** Convert Phase B runner outcomes to runnerOverrides for GameEngine */
  _buildRunnerOverrides() {
    const outcomes = this._data.runnerOutcomes;
    const runners = this.runners; // player objects with .id
    const newRunners = { first: null, second: null, third: null };
    const movements = [];
    let runs = 0;

    // Process each runner (third → first order)
    ['third', 'second', 'first'].forEach(base => {
      if (!outcomes[base]) return;
      const runnerId = runners[base]?.id || runners[base];
      if (!runnerId) return;

      const dest = outcomes[base].dest;
      if (dest === 'out') {
        movements.push({ runnerId, from: base, to: base, event: 'HIT', scored: false, earnedRun: false, out: true });
      } else if (dest === 'home') {
        movements.push({ runnerId, from: base, to: 'home', event: 'HIT', scored: true, earnedRun: true });
        runs++;
      } else if (dest === 'stay') {
        newRunners[base] = runnerId;
      } else {
        // Advanced to a specific base
        newRunners[dest] = runnerId;
        movements.push({ runnerId, from: base, to: dest, event: 'HIT', scored: false, earnedRun: false });
      }
    });

    // Batter
    if (outcomes.batter) {
      const batterId = this._getBatterId();
      const dest = outcomes.batter.dest;
      if (dest === 'out') {
        movements.push({ runnerId: batterId, from: 'home', to: 'home', event: 'HIT', scored: false, earnedRun: false, out: true });
      } else if (dest === 'home') {
        movements.push({ runnerId: batterId, from: 'home', to: 'home', event: 'HIT', scored: true, earnedRun: true });
        runs++;
      } else if (dest && dest !== 'stay') {
        newRunners[dest] = batterId;
        movements.push({ runnerId: batterId, from: 'home', to: dest, event: 'HIT', scored: false, earnedRun: false });
      }
    }

    return { newRunners, movements, runs };
  }

  /** Get current batter ID — uses runner info structure */
  _getBatterId() {
    // The batter ID is not directly in this.runners. It comes from the engine.
    // We'll return a placeholder; the engine will use its own batterId.
    return '__batter__';
  }

  // ═══════════════════════════════════════════
  // Keyboard shortcuts (called by LiveRecord)
  // ═══════════════════════════════════════════

  handleKey(e) {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const key = e.key.toUpperCase();
    const d = this._data;

    switch (this._step) {
      case 'type':
        if (key === '1') { d.hitType = 'G'; this._step = 'direction'; this.render(); e.preventDefault(); }
        else if (key === '2') { d.hitType = 'F'; this._step = 'direction'; this.render(); e.preventDefault(); }
        else if (key === '3') { d.hitType = 'L'; this._step = 'direction'; this.render(); e.preventDefault(); }
        else if (key === 'ESCAPE') { if (this.onCancel) this.onCancel(); e.preventDefault(); }
        break;

      case 'direction':
        if (key >= '1' && key <= '9') {
          const n = parseInt(key);
          // Block consecutive same position
          if (d.fieldingPath.length > 0 && d.fieldingPath[d.fieldingPath.length - 1] === n) {
            e.preventDefault();
            break;
          }
          d.fieldingPath.push(n); this.render(); e.preventDefault();
        }
        else if (key === 'ENTER' && d.fieldingPath.length > 0) { this._step = 'result'; this.render(); e.preventDefault(); }
        else if (key === 'BACKSPACE') { d.fieldingPath.pop(); this.render(); e.preventDefault(); }
        else if (key === 'ESCAPE') { this._goBack(); e.preventDefault(); }
        break;

      case 'result':
        if (key === 'H') { d.resultCategory = 'hit'; this._step = 'hit-detail'; this.render(); e.preventDefault(); }
        else if (key === 'O') { d.resultCategory = 'out'; this._step = 'out-detail'; this.render(); e.preventDefault(); }
        else if (key === 'E') { d.resultCategory = 'error'; this._step = 'error-detail'; this.render(); e.preventDefault(); }
        else if (key === 'F' && this.hasRunners) { d.resultCategory = 'fc'; this._step = 'fc-detail'; this.render(); e.preventDefault(); }
        else if (key === 'ESCAPE') { this._goBack(); e.preventDefault(); }
        break;

      case 'hit-detail':
        if (!d.hitBases) {
          if (key >= '1' && key <= '4') {
            const n = parseInt(key);
            d.hitBases = n;
            d.resultType = ['', '1B', '2B', '3B', 'HR'][n];
            this._initRunnerOutcomes();
            this._step = 'runners'; this.render(); e.preventDefault();
          }
        }
        if (key === 'ESCAPE') { this._goBack(); e.preventDefault(); }
        break;

      case 'out-detail':
        if (!d.resultType) {
          const runnerCount = this._runnerCount;
          const enabled = OUT_OPTIONS.filter(o => {
            const typeOk = o.compatible.includes(d.hitType);
            let runnerOk = true;
            if (o.val === 'DP' || o.val === 'SF' || o.val === 'SAC') runnerOk = runnerCount >= 1;
            if (o.val === 'TP') runnerOk = runnerCount >= 2;
            return typeOk && runnerOk;
          });
          const idx = parseInt(key) - 1;
          if (idx >= 0 && idx < enabled.length) {
            d.resultType = enabled[idx].val;
            this.render(); e.preventDefault();
          }
        } else if (key === 'ENTER') { this._initRunnerOutcomes(); this._step = 'runners'; this.render(); e.preventDefault(); }
        if (key === 'ESCAPE') { this._goBack(); e.preventDefault(); }
        break;

      case 'error-detail':
        if (!d.errorPosition && key >= '1' && key <= '9') {
          d.errorPosition = parseInt(key); d.resultType = 'E'; this.render(); e.preventDefault();
        } else if (d.errorPosition && !d.baseReached) {
          if (key === '1') { d.baseReached = 'first'; this.render(); e.preventDefault(); }
          else if (key === '2') { d.baseReached = 'second'; this.render(); e.preventDefault(); }
          else if (key === '3') { d.baseReached = 'third'; this.render(); e.preventDefault(); }
          else if (key === '4') { d.baseReached = 'home'; this.render(); e.preventDefault(); }
        } else if (d.errorPosition && d.baseReached && key === 'ENTER') {
          this._initRunnerOutcomes(); this._step = 'runners'; this.render(); e.preventDefault();
        }
        if (key === 'ESCAPE') { this._goBack(); e.preventDefault(); }
        break;

      case 'fc-detail':
        if (key === 'Y') { d.fcOutOccurred = true; this.render(); e.preventDefault(); }
        else if (key === 'N') { d.fcOutOccurred = false; this.render(); e.preventDefault(); }
        else if (key === 'ENTER') { d.resultType = 'FC'; this._initRunnerOutcomes(); this._step = 'runners'; this.render(); e.preventDefault(); }
        else if (key === 'ESCAPE') { this._goBack(); e.preventDefault(); }
        break;

      case 'runners':
        if (key === 'ENTER') { this._step = 'notes'; this.render(); e.preventDefault(); }
        else if (key === 'ESCAPE') { this._goBack(); e.preventDefault(); }
        break;

      case 'notes':
        if (key === 'ENTER' && e.ctrlKey) { this._submit(); e.preventDefault(); }
        else if (key === 'ESCAPE') { this._goBack(); e.preventDefault(); }
        break;
    }
  }

  // ═══════════════════════════════════════════
  // Reusable UI helpers
  // ═══════════════════════════════════════════

  _ynToggle(label, value, onChange) {
    const row = createElement('div', { className: 'hit-wizard__yn-group' });
    row.appendChild(createElement('span', { className: 'hit-wizard__yn-label', textContent: label }));
    const btns = createElement('div', { className: 'hit-wizard__yn-btns' });
    btns.appendChild(createElement('button', {
      className: `btn btn--sm ${value === true ? 'btn--primary' : 'btn--outline'}`,
      textContent: '是', onClick: () => { Vibration.tap(); onChange(true); }
    }));
    btns.appendChild(createElement('button', {
      className: `btn btn--sm ${value === false ? 'btn--primary' : 'btn--outline'}`,
      textContent: '否', onClick: () => { Vibration.tap(); onChange(false); }
    }));
    row.appendChild(btns);
    return row;
  }

  _choiceBtns(label, options, selected, onChange) {
    const row = createElement('div', { className: 'hit-wizard__yn-group' });
    row.appendChild(createElement('span', { className: 'hit-wizard__yn-label', textContent: label }));
    const btns = createElement('div', { className: 'hit-wizard__yn-btns' });
    options.forEach(o => {
      btns.appendChild(createElement('button', {
        className: `btn btn--sm ${selected === o.val ? 'btn--primary' : 'btn--outline'}`,
        textContent: o.label, onClick: () => { Vibration.tap(); onChange(o.val); }
      }));
    });
    row.appendChild(btns);
    return row;
  }

  _numberCtrl(label, dataKey) {
    const row = createElement('div', { className: 'hit-wizard__number-group' });
    row.appendChild(createElement('label', { textContent: label }));
    const ctrl = createElement('div', { className: 'number-control' });
    ctrl.appendChild(createElement('button', {
      className: 'btn btn--sm btn--outline', textContent: '−',
      onClick: () => { if (this._data[dataKey] > 0) this._data[dataKey]--; this.render(); }
    }));
    ctrl.appendChild(createElement('span', { className: 'number-control__value', textContent: this._data[dataKey] }));
    ctrl.appendChild(createElement('button', {
      className: 'btn btn--sm btn--outline', textContent: '+',
      onClick: () => { this._data[dataKey]++; this.render(); }
    }));
    row.appendChild(ctrl);
    return row;
  }

  _nextBtn(onClick) {
    return createElement('button', {
      className: 'btn btn--primary btn--block',
      textContent: '下一步 →',
      style: 'margin-top: var(--space-md)',
      onClick
    });
  }

  /** Runner count helper */
  get _runnerCount() {
    return [this.runners.first, this.runners.second, this.runners.third]
      .filter(Boolean).length;
  }
}
