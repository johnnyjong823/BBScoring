/**
 * BBScoring — RunnerDiagram UI (壘包圖)
 */
import { createElement } from '../utils/helpers.js';

export class RunnerDiagram {
  constructor({ container, runners, outs }) {
    this.container = container;
    this.runners = runners || { first: null, second: null, third: null };
    this.outs = outs || 0;
  }

  update(runners, outs) {
    this.runners = runners;
    this.outs = outs;
    this.render();
  }

  render() {
    this.container.innerHTML = '';

    const wrapper = createElement('div', { className: 'runner-diagram' });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 140 140');
    svg.setAttribute('class', 'runner-diagram__svg');

    // 背景連線
    const lines = [
      { x1: 70, y1: 120, x2: 115, y2: 70 },  // 本→一
      { x1: 115, y1: 70, x2: 70, y2: 20 },    // 一→二
      { x1: 70, y1: 20, x2: 25, y2: 70 },     // 二→三
      { x1: 25, y1: 70, x2: 70, y2: 120 },    // 三→本
    ];
    lines.forEach(l => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', l.x1);
      line.setAttribute('y1', l.y1);
      line.setAttribute('x2', l.x2);
      line.setAttribute('y2', l.y2);
      line.setAttribute('stroke', 'var(--border-color, #555)');
      line.setAttribute('stroke-width', '1.5');
      svg.appendChild(line);
    });

    // 壘包
    const bases = [
      { x: 70, y: 120, name: 'home', hasRunner: false, isHome: true },      // 本壘
      { x: 115, y: 70, name: 'first', hasRunner: !!this.runners.first },     // 一壘
      { x: 70, y: 20, name: 'second', hasRunner: !!this.runners.second },    // 二壘
      { x: 25, y: 70, name: 'third', hasRunner: !!this.runners.third },      // 三壘
    ];

    bases.forEach(b => {
      const size = b.isHome ? 10 : 8;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', b.x - size);
      rect.setAttribute('y', b.y - size);
      rect.setAttribute('width', size * 2);
      rect.setAttribute('height', size * 2);
      rect.setAttribute('transform', `rotate(45 ${b.x} ${b.y})`);
      rect.setAttribute('class', `base base--${b.name}${b.hasRunner ? ' occupied' : ''}`);
      svg.appendChild(rect);

      // 跑者圓點
      if (b.hasRunner) {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', b.x);
        dot.setAttribute('cy', b.y);
        dot.setAttribute('r', 5);
        dot.setAttribute('class', 'runner-dot');
        svg.appendChild(dot);
      }
    });

    // 出局數
    const outsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    outsGroup.setAttribute('transform', 'translate(70, 80)');
    for (let i = 0; i < 3; i++) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', (i - 1) * 14);
      circle.setAttribute('cy', 0);
      circle.setAttribute('r', 4);
      circle.setAttribute('class', `out-dot${i < this.outs ? ' filled' : ''}`);
      outsGroup.appendChild(circle);
    }
    svg.appendChild(outsGroup);

    wrapper.appendChild(svg);
    this.container.appendChild(wrapper);
  }
}
