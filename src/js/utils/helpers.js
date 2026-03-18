/**
 * BBScoring — 通用工具函式
 */

/** 產生唯一識別碼 */
export function generateId(prefix = '') {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${ts}_${rand}` : `${ts}_${rand}`;
}

/** 深複製物件 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** 防抖 */
export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/** 格式化日期 */
export function formatDate(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 格式化時間 */
export function formatTime(dateStr) {
  const d = new Date(dateStr);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

/** 投球局數格式 (out 數 → X.Y) */
export function formatIP(outs) {
  const full = Math.floor(outs / 3);
  const partial = outs % 3;
  return `${full}.${partial}`;
}

/** 安全取值 */
export function getVal(obj, path, defaultVal = '') {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : defaultVal), obj);
}

/** 建立 DOM 元素 */
export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'textContent') {
      el.textContent = value;
    } else if (key === 'innerHTML') {
      el.innerHTML = value;
    } else if (key.startsWith('on')) {
      el.addEventListener(key.substring(2).toLowerCase(), value);
    } else if (key.startsWith('data')) {
      el.setAttribute(`data-${key.substring(4).toLowerCase()}`, value);
    } else if (typeof value === 'boolean') {
      if (value) el.setAttribute(key, '');
      else el.removeAttribute(key);
    } else {
      el.setAttribute(key, value);
    }
  }
  children.forEach(child => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  });
  return el;
}

/** 顯示 Toast 訊息 */
export function showToast(message, duration = 3000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = createElement('div', { className: 'toast-container' });
    document.body.appendChild(container);
  }
  const toast = createElement('div', { className: 'toast', textContent: message });
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

/** 顯示確認對話框 (Promise) */
export function showConfirm(title, message) {
  return new Promise(resolve => {
    const overlay = createElement('div', { className: 'modal-overlay active' });
    const modal = createElement('div', { className: 'modal' }, [
      createElement('div', { className: 'modal__title', textContent: title }),
      createElement('p', { textContent: message }),
      createElement('div', { className: 'modal__actions' }, [
        createElement('button', {
          className: 'btn btn--outline',
          textContent: '取消',
          onClick: () => { overlay.remove(); resolve(false); }
        }),
        createElement('button', {
          className: 'btn btn--primary',
          textContent: '確認',
          onClick: () => { overlay.remove(); resolve(true); }
        })
      ])
    ]);
    overlay.appendChild(modal);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); resolve(false); }
    });
    document.body.appendChild(overlay);
  });
}

/** 取得今天日期字串 */
export function getTodayStr() {
  return new Date().toISOString().substring(0, 10);
}

/** 取得現在時間字串 */
export function getNowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 取得 ISO 時間戳 */
export function getTimestamp() {
  return new Date().toISOString();
}

/** 安全 JSON parse */
export function safeParse(str, fallback = null) {
  if (str == null) return fallback;
  try {
    const result = JSON.parse(str);
    return result != null ? result : fallback;
  } catch {
    return fallback;
  }
}

/** 事件委派 helper */
export function delegate(parent, selector, event, handler) {
  parent.addEventListener(event, e => {
    const target = e.target.closest(selector);
    if (target && parent.contains(target)) {
      handler(e, target);
    }
  });
}
