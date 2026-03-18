/**
 * BBScoring — FieldDiagram UI (SVG 棒球場方向選擇圖)
 */
import { createElement } from '../utils/helpers.js';
import { HIT_ZONES } from '../utils/constants.js';

export class FieldDiagram {
  constructor({ container, selectedZone, onZoneClick }) {
    this.container = container;
    this.selectedZone = selectedZone;
    this.onZoneClick = onZoneClick;
  }

  render() {
    this.container.innerHTML = '';

    const wrapper = createElement('div', { className: 'field-diagram' });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 300 300');
    svg.setAttribute('class', 'field-diagram__svg');

    // 外野弧形
    const outfieldArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    outfieldArc.setAttribute('d', 'M 30,250 A 210,210 0 0,1 270,250');
    outfieldArc.setAttribute('fill', '#2d5016');
    outfieldArc.setAttribute('stroke', '#fff');
    outfieldArc.setAttribute('stroke-width', '2');
    svg.appendChild(outfieldArc);

    // 內野菱形
    const infield = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    infield.setAttribute('points', '150,260 100,210 150,160 200,210');
    infield.setAttribute('fill', '#8B6914');
    infield.setAttribute('stroke', '#fff');
    infield.setAttribute('stroke-width', '1');
    svg.appendChild(infield);

    // 定義各區域
    const zones = [
      { zone: HIT_ZONES.LEFT, label: '左', path: 'M 30,250 A 210,210 0 0,1 90,110 L 100,210 L 150,260 Z' },
      { zone: HIT_ZONES.LEFT_CENTER, label: '左中', path: 'M 90,110 A 210,210 0 0,1 135,70 L 150,160 L 100,210 Z' },
      { zone: HIT_ZONES.CENTER, label: '中', path: 'M 135,70 A 210,210 0 0,1 165,70 L 150,160 Z' },
      { zone: HIT_ZONES.RIGHT_CENTER, label: '右中', path: 'M 165,70 A 210,210 0 0,1 210,110 L 200,210 L 150,160 Z' },
      { zone: HIT_ZONES.RIGHT, label: '右', path: 'M 210,110 A 210,210 0 0,1 270,250 L 150,260 L 200,210 Z' },
    ];

    zones.forEach(z => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', z.path);
      path.setAttribute('class', `field-zone${this.selectedZone === z.zone ? ' selected' : ''}`);
      path.setAttribute('data-zone', z.zone);
      path.addEventListener('click', () => {
        if (this.onZoneClick) this.onZoneClick(z.zone);
      });
      svg.appendChild(path);

      // 區域標籤
      const pos = this._getZoneLabelPos(z.zone);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', pos.x);
      text.setAttribute('y', pos.y);
      text.setAttribute('class', 'field-zone__label');
      text.setAttribute('text-anchor', 'middle');
      text.textContent = z.label;
      text.style.pointerEvents = 'none';
      svg.appendChild(text);
    });

    // 壘包標記
    const bases = [
      { x: 150, y: 260, label: '本' },
      { x: 200, y: 210, label: '一' },
      { x: 150, y: 160, label: '二' },
      { x: 100, y: 210, label: '三' },
    ];
    bases.forEach(b => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', b.x - 6);
      rect.setAttribute('y', b.y - 6);
      rect.setAttribute('width', 12);
      rect.setAttribute('height', 12);
      rect.setAttribute('transform', `rotate(45 ${b.x} ${b.y})`);
      rect.setAttribute('fill', '#fff');
      rect.setAttribute('stroke', '#333');
      svg.appendChild(rect);
    });

    // 內野守備區域（額外可點擊）
    const infieldZones = [
      { zone: HIT_ZONES.INFIELD, label: '內野', cx: 150, cy: 210, r: 20 },
    ];
    infieldZones.forEach(iz => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', iz.cx);
      circle.setAttribute('cy', iz.cy);
      circle.setAttribute('r', iz.r);
      circle.setAttribute('class', `field-zone field-zone--infield${this.selectedZone === iz.zone ? ' selected' : ''}`);
      circle.addEventListener('click', () => {
        if (this.onZoneClick) this.onZoneClick(iz.zone);
      });
      svg.appendChild(circle);
    });

    wrapper.appendChild(svg);
    this.container.appendChild(wrapper);
  }

  _getZoneLabelPos(zone) {
    const positions = {
      [HIT_ZONES.LEFT]: { x: 60, y: 190 },
      [HIT_ZONES.LEFT_CENTER]: { x: 100, y: 130 },
      [HIT_ZONES.CENTER]: { x: 150, y: 100 },
      [HIT_ZONES.RIGHT_CENTER]: { x: 200, y: 130 },
      [HIT_ZONES.RIGHT]: { x: 240, y: 190 },
    };
    return positions[zone] || { x: 150, y: 150 };
  }
}
