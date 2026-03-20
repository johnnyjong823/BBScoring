---
applyTo: "**"
---

- 使用繁體中文回應與撰寫 UI 文字。
- 這是純 vanilla JavaScript 的離線優先 PWA，不使用 React、Vue、Angular 等框架。
- 全案使用 ES Module（`import` / `export`），禁止使用 CommonJS（`require`）。
- 沒有 npm、package.json、node_modules、bundler、TypeScript、測試框架或 linter；不要建議引入這些工具。
- 入口為 `src/index.html`，主程式為 `src/js/app.js`。
- 主要結構：`src/js/models/`、`src/js/core/`、`src/js/ui/`、`src/js/storage/`、`src/js/utils/`、`src/css/`。
- 路由為 hash-based，資料以 LocalStorage 與 IndexedDB 儲存，並搭配 Service Worker / `manifest.json` 提供離線能力。
- 樣式採 mobile-first，使用 CSS Variables 管理主題。
- 修改程式時請延續現有架構與命名，不要引入與現況不相容的技術。
