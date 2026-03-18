/**
 * BBScoring — 手勢處理
 */
export class GestureHandler {
  constructor(element, options = {}) {
    this.el = element;
    this.options = {
      swipeThreshold: 50,
      longPressDelay: 500,
      ...options
    };
    this.startX = 0;
    this.startY = 0;
    this.startTime = 0;
    this.longPressTimer = null;

    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    this.el.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this.el.addEventListener('touchmove', this._onTouchMove, { passive: true });
    this.el.addEventListener('touchend', this._onTouchEnd);
  }

  _onTouchStart(e) {
    const touch = e.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.startTime = Date.now();
    this.moved = false;

    this.longPressTimer = setTimeout(() => {
      if (!this.moved) {
        this.el.dispatchEvent(new CustomEvent('longpress', {
          detail: { x: this.startX, y: this.startY, target: e.target }
        }));
      }
    }, this.options.longPressDelay);
  }

  _onTouchMove(e) {
    const touch = e.touches[0];
    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      this.moved = true;
      clearTimeout(this.longPressTimer);
    }
  }

  _onTouchEnd(e) {
    clearTimeout(this.longPressTimer);
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;
    const elapsed = Date.now() - this.startTime;

    if (elapsed < 300 && Math.abs(dx) > this.options.swipeThreshold && Math.abs(dx) > Math.abs(dy)) {
      const direction = dx > 0 ? 'right' : 'left';
      this.el.dispatchEvent(new CustomEvent('swipe', { detail: { direction } }));
    }

    if (elapsed < 300 && Math.abs(dy) > this.options.swipeThreshold && Math.abs(dy) > Math.abs(dx)) {
      const direction = dy > 0 ? 'down' : 'up';
      this.el.dispatchEvent(new CustomEvent('swipe', { detail: { direction } }));
    }
  }

  destroy() {
    this.el.removeEventListener('touchstart', this._onTouchStart);
    this.el.removeEventListener('touchmove', this._onTouchMove);
    this.el.removeEventListener('touchend', this._onTouchEnd);
    clearTimeout(this.longPressTimer);
  }
}
