/**
 * BBScoring — Hash-based SPA Router
 */
export class Router {
  constructor() {
    this.routes = [];
    this.currentRoute = null;
    this._onHashChange = this._onHashChange.bind(this);
  }

  /**
   * 註冊路由
   * @param {string} pattern — e.g. '#/', '#/setup/:id', '#/live/:id'
   * @param {Function} handler — (params) => void
   */
  add(pattern, handler) {
    const keys = [];
    const regexStr = pattern
      .replace(/:([^/]+)/g, (_, key) => { keys.push(key); return '([^/]+)'; })
      .replace(/\//g, '\\/');
    this.routes.push({ pattern, regex: new RegExp(`^${regexStr}$`), keys, handler });
    return this;
  }

  /** 啟動路由器 */
  start() {
    window.addEventListener('hashchange', this._onHashChange);
    this._onHashChange();
  }

  /** 停止路由器 */
  stop() {
    window.removeEventListener('hashchange', this._onHashChange);
  }

  /** 導航至指定路由 */
  navigate(hash) {
    window.location.hash = hash;
  }

  /** 回到上一頁（若無歷史則回首頁） */
  back() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      this.navigate('#/');
    }
  }

  _onHashChange() {
    const hash = window.location.hash || '#/';
    for (const route of this.routes) {
      const match = hash.match(route.regex);
      if (match) {
        const params = {};
        route.keys.forEach((key, i) => { params[key] = decodeURIComponent(match[i + 1]); });
        this.currentRoute = { pattern: route.pattern, params, hash };
        route.handler(params);
        return;
      }
    }
    // 404 → 回到首頁
    this.navigate('#/');
  }
}
