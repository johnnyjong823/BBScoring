# BBScoring 2×2 模式重構計畫

> 綜合 Claude Opus 4.6（架構）、Gemini 3 Pro（UX）、GPT-5.2 Codex（資料模型）三方分析

---

## 一、需求總覽 — 2×2 模式矩陣

|  | 僅記錄結果 (Result-Only) | 詳細記錄 (Detailed) |
|--|:---:|:---:|
| **快速開始 (Quick)** | **A** 街頭友誼賽、臨時練習 | **B** 正式比賽但未預先建檔 |
| **系統性賽制 (Tournament)** | **C** 大型聯賽簡易記錄 | **D** 專業聯賽完整記錄（≈ 現有版本） |

### 模式差異摘要

| 面向 | Quick Start | Tournament Mode |
|------|-------------|-----------------|
| 球員資料 | 僅背號，姓名後補 | 從已註冊名單選取 |
| 隊伍來源 | 臨時建立 | 從聯賽名單載入 |
| 打序設定 | 直接輸入 9 個背號 | 從 roster 拖曳/點選 |
| 比賽關聯 | 獨立無上下文 | 關聯到賽事/場次 |
| 設定步驟 | 1~2 步（30 秒內開賽） | 3~4 步（選賽事→選場次→確認打序） |

| 面向 | Result-Only | Detailed |
|------|-------------|----------|
| 逐球記錄 | ❌ 不記好壞球過程 | ✅ 逐球 S/B/F/IP |
| 打擊結果 | ✅ 結果+RBI | ✅ 結果+方向+球質+守備路徑 |
| 投手記錄 | ✅ 換投時記錄（IP/被安打/失分/自責分等） | ✅ 逐球累計+換投記錄 |
| 自責分確認 | ✅ 事後確認（失分當下無法判斷） | ✅ 事後確認（失分當下無法判斷） |
| 跑壘追蹤 | 簡化：得分/盜壘 | 完整：每個跑者動向 |
| 球數顯示 | ❌ | ✅ B-S-O 圓點 |
| 球場方向圖 | ❌ | ✅ SVG |
| Undo 粒度 | 以打席為單位 | 以每球為單位 |
| 統計產出 | 基礎+投手統計(AVG/RBI/R/ERA/IP) | 完整(ERA/WHIP/OPS/K9/落點) |

---

## 二、現有程式碼評估

### 2.1 值得保留的設計 ✅
- 清晰分層架構 (models / core / ui / storage / utils)
- Factory 函式建立資料 (`createGame()`, `createPlayer()` 等)
- GameEngine 事件系統 (on/off/emit)
- RulesEngine 全 static 純函式，100% 可重用
- UndoManager 通用快照設計
- StatsCalculator 獨立不綁定 Game 物件
- CSS 變數體系完整
- PWA 基礎到位

### 2.2 現有問題/技術債 ⚠️
| 問題 | 嚴重度 | 說明 |
|------|--------|------|
| GameSetup 只有一條路徑 | 🔴 高 | 6 步設定流程，無法跳過或簡化 |
| 無模式概念 | 🔴 高 | 全部都是逐球記錄，無「僅記結果」選項 |
| App.js 職責過重 | 🟡 中 | 首頁、設定頁、路由回調全堆在 App class |
| LiveRecord 全量 re-render | 🟡 中 | `_updateDisplay()` 每次全部重建 DOM |
| Storage 僅 LocalStorage | 🟡 中 | 無 IndexedDB 實作，大量賽事資料會不夠 |
| HitResult 結構不一致 | 🟡 中 | Panel 用 zone/error，Engine 期待 direction/isError |
| Scoreboard/StatsView BUG | 🟡 中 | 欄位名不對接 (hitResult vs result) |
| Team 範本未接通 | 🟠 低 | Storage 有 getTeamTemplates() 但 UI 沒用 |
| GestureHandler 未使用 | 🟠 低 | gestures.js 已實作但無 UI 引用 |

---

## 三、模組重用 / 重構 / 新建

### 3.1 直接重用 ✅
Router, RulesEngine, StatsCalculator, UndoManager, RunnerDiagram, Scoreboard, FieldDiagram(僅Detailed), Vibration, GestureHandler, ExportManager, ImportManager, helpers.js, constants.js, 全部 CSS

### 3.2 需要重構 🔧
| 模組 | 重構方式 |
|------|----------|
| **GameEngine** | 抽出 RecordingStrategy 介面：DetailedStrategy(現有) + ResultOnlyStrategy(新) |
| **PlayRecorder** | 增加 `recordAtBatResult()` — 不經 pitch 直接記錄打席 |
| **Game model** | 增加 `mode: { startMode, recordingMode }`, `tournamentId`, `matchId` |
| **Player model** | 增加 `isTemporary` flag（Quick Start 時 name 可選） |
| **GameSetup** | 拆為 QuickSetup + TournamentSetup 兩個子元件 |
| **LiveRecord** | 根據 recordingMode 切換子面板 (PitchPanel vs AtBatResultPanel) |
| **App.js** | 拆出 HomeView；增加模式選擇頁 |
| **StorageManager** | 增加 IndexedDB 層 (async)，LocalStorage + IDB 統一封裝 |
| **PitchPanel** | Result-Only 時替換為 AtBatResultPanel |

### 3.3 需要新建 🆕
| 新模組 | 說明 |
|--------|------|
| `models/Tournament.js` | 聯賽/賽事資料模型 |
| `models/Match.js` | 場次資料模型 |
| `models/Roster.js` | 球隊已註冊球員名單 |
| `ui/ModeSelector.js` | 首頁模式選擇元件 |
| `ui/QuickSetup.js` | 快速開始設定（1~2 步） |
| `ui/TournamentSetup.js` | 賽制設定流程 |
| `ui/TournamentManager.js` | 聯賽管理頁 (CRUD 聯賽/隊伍/名單) |
| `ui/AtBatResultPanel.js` | Result-Only 打席結果面板 |
| `core/ResultOnlyEngine.js` | Result-Only 記錄邏輯（或作為 Strategy） |
| `storage/IndexedDBManager.js` | IndexedDB 封裝 |
| `core/TournamentStandings.js` | 聯賽戰績/排名計算器 |

---

## 四、使用者流程設計

### 4.1 首頁重構 → Dashboard 儀表板
- **頂部兩大按鈕**：「⚡ 快速開始」+「🏆 聯賽/盃賽」
- **進行中比賽**：置頂卡片，點擊直接繼續
- **最近紀錄**：列出最近 5 場
- **底部導航**：首頁 | 數據統計 | 球隊管理 | 設定

### 4.2 快速開始流程 (A/B)
```
首頁 → ⚡快速開始 → 選擇記錄模式(結果/詳細)
  → 單一設定頁：
    [客隊名] [主隊名] [局數: 5/7/9]
    [9格直接輸入背號做打序 + 投手背號]
  → 開始記錄
```
- 日期時間自動帶入
- 球員預設右投右打，守位可不選
- 設定完後可隨時補編輯球員名字等

### 4.3 賽制模式流程 (C/D)
```
首頁 → 🏆聯賽/盃賽 → 選擇聯賽 → 選擇場次
  → 載入雙方名單 → 確認先發打序 → 選擇記錄模式
  → 開始記錄
```

### 4.4 即時記錄頁 — 模式差異

#### Result-Only 模式
- **隱藏**：PitchPanel, CountDisplay(S/B), FieldDiagram
- **新增 OutcomePanel**：
  - [安打] → 1B/2B/3B/HR
  - [出局] → K/GO/FO/DP/...
  - [保送] / [觸身] / [失誤]
  - 選結果 → 填 RBI → 自動壘包推進(可手動調) → 下一位
- 流程：**1~2 步完成一個打席**

#### Detailed 模式
- 維持現有：PitchPanel + HitResultPanel + FieldDiagram
- 流程同現有逐球記錄

---

## 五、資料模型變更

### 5.1 Game model 擴展
```js
Game.mode = {
  startMode: 'QUICK' | 'TOURNAMENT',
  recordingMode: 'RESULT_ONLY' | 'DETAILED'
}
Game.tournamentId = null  // 可選
Game.matchId = null       // 可選
```

### 5.2 新增 Tournament model
```js
Tournament = {
  id, name, season, type: 'LEAGUE'|'TOURNAMENT'|'FRIENDLY',
  status: 'ACTIVE'|'COMPLETED',
  settings: { totalInnings, dhRule, mercyRule },
  teams: [{ teamId, name, roster: Player[] }],
  schedule: [{ matchId, round, awayTeamId, homeTeamId, date, time, venue, gameId, status }],
  standings: []
}
```

### 5.3 Player model 擴展
```js
Player.isTemporary = false  // Quick Start 為 true
// Quick Start: number=7, name='' → 後續可補
Player.careerStats = {}
Player.tournamentStats = { [tournamentId]: PlayerStats }
```

### 5.4 AtBat 雙模式統一結構
- 保留完整結構
- Result-Only 時 `pitches=[]`, `direction/fieldingPath=null`
- 加 `recordingMode` 標記
- 加 `stolenBases`, `runsScored` 簡化欄位

### 5.5 儲存架構
| 資料類型 | 儲存位置 | 理由 |
|----------|----------|------|
| 使用者設定 | LocalStorage | 小量即時 |
| 進行中比賽 | LocalStorage | 即時自動存檔 |
| 已完成比賽 | IndexedDB | 量大需查詢 |
| 聯賽/賽事 | IndexedDB | 多隊多場次 |
| 球隊名單範本 | IndexedDB | 跨賽事重用 |

---

## 六、UI 元件跨模式對照表

| 元件 | Quick+Result | Quick+Detail | Tourney+Result | Tourney+Detail |
|------|:---:|:---:|:---:|:---:|
| StatusBar | ✅簡化 | ✅完整 | ✅簡化 | ✅完整 |
| RunnerDiagram | ✅ | ✅ | ✅ | ✅ |
| Scoreboard | ✅ | ✅ | ✅ | ✅ |
| LineupPanel | ✅ | ✅ | ✅ | ✅ |
| PitchPanel | ❌ | ✅ | ❌ | ✅ |
| AtBatResultPanel(新) | ✅ | ❌ | ✅ | ❌ |
| HitResultPanel | ❌ | ✅ | ❌ | ✅ |
| FieldDiagram | ❌ | ✅ | ❌ | ✅ |
| CountDisplay | ❌ | ✅ | ❌ | ✅ |
| EarnedRunConfirm(新) | ✅ | ✅ | ✅ | ✅ |
| HistoryPanel | ✅簡化 | ✅完整 | ✅簡化 | ✅完整 |
| StatsView | ✅基礎+投手 | ✅完整 | ✅基礎+投手 | ✅完整 |

---

## 七、已知 UX 問題修復

### 7.1 先發名單選擇畫面跳動
**問題**：Step 4-5 未選球員列表用 inline 排列，選人後剩餘按鈕重排導致容器寬高跳動。
**解法**：
- **手機**：點擊打序空位 → 彈出 Modal 選球員（不在同一頁面同時顯示兩個變動列表）
- **平板/桌面**：左右 Split View + CSS Grid（`grid-template-columns: repeat(auto-fill, minmax(80px,1fr))`）+ 固定高度 scroll container

### 7.2 其他 UX 改善
- 守備位置改用 Bottom Sheet 而非原生 `<select>`
- 新增「高對比白底模式」（戶外強光用）
- FieldDiagram 手機端加入區域選擇（九宮格）替代精確座標點擊

---

## 八、你可能沒考慮到的重要議題 ⚡

### 8.1 記錄模式不可中途切換
建議比賽開始後鎖定 recordingMode：
- Result-Only 的 AtBat 沒有 pitch 資料，切到 Detailed 會資料不完整
- 統計公式不同，Undo 粒度不同
- **但 Gemini 建議可例外**：允許「Detailed → Result-Only」降級（前幾局詳細記，後面簡化）

### 8.2 Quick Start 球員 ID 問題
- 不同場比賽的同背號 ≠ 同一人
- 需要 RosterKey + GameId 策略避免錯誤關聯
- 提供「關聯到聯賽」功能：自動比對背號嘗試對應已註冊球員

### 8.3 聯賽模式臨時球員
- 比賽當天有人換背號或臨時槍手
- 需支援「單場臨時球員」不污染球隊原始名單

### 8.4 自責分確認機制（兩種模式共用）
- 失分當下不一定能判斷是否為自責分（需看失誤、傳球失誤等因素）
- **兩種記錄模式都需要**：賽中先記錄「失分」，賽後提供「自責分確認」介面
- 建議設計：
  - 每位投手的失分列表，預設全部為自責分（ER = R）
  - 提供逐筆切換按鈕：「自責分 ↔ 非自責分」
  - 可在比賽進行中或比賽結束後操作
  - 修改後自動重算 ERA
- UI 入口：換投手時彈出提醒 + 比賽結束時引導確認 + Stats 頁提供編輯入口

### 8.5 Result-Only 的投手統計
- Result-Only **仍記錄投手數據**：換投時記錄交接點（局數、出局數）
- 可算出：IP、被安打(H)、失分(R)、自責分(ER)、ERA、被保送(BB)、被三振(K)
- 因有出局結果可精確算 IP（不是近似值）
- 無法算：投球數、好球率、WHIP（需逐球資料）
- UI 明確標示需逐球資料的統計顯示 `—`

### 8.5 Undo 記憶體問題
- 現有每步 deepClone 整個 `game.innings`，中後期快照越來越大
- 50 步 × 大量資料 = 可觀記憶體
- 建議改為差異快照或只儲存 affected half-inning

### 8.6 聯賽戰績/跨場次統計
- 球員跨場次累計打擊/投手統計
- 隊伍勝敗紀錄、排名
- 場次結果回寫 Tournament.schedule

### 8.7 匯出格式版本
- 新增 mode 欄位後 JSON version 升至 "2.0.0"
- ImportManager 需相容 v1 和 v2

### 8.8 Service Worker 更新
- 新增檔案後 sw.js 的 PRECACHE_URLS 需同步更新
- 建議改用 Workbox 或建置工具自動產生 precache 清單

### 8.9 同聯賽混合記錄模式
- 同一賽事可能有些場次用 Result-Only，有些用 Detailed
- 統計需標記資料來源，避免混用造成誤解

### 8.10 批次匯入球員名單
- 聯賽模式最大痛點：逐一輸入球員太慢
- 需支援 CSV/Excel 批次匯入（背號/姓名/守位）

---

## 九、路由規劃

```
現有路由（保留/改版）：
#/                        → 首頁 Dashboard（改版）
#/setup/:id               → 比賽設定（拆分）
#/live/:id                → 即時記錄（mode-aware）
#/stats/:id               → 統計（mode-aware）
#/history/:id             → 歷史記錄（mode-aware）
#/settings                → 設定

新增路由：
#/quick-setup             → 快速開始設定
#/tournament              → 聯賽管理列表
#/tournament/:id          → 單一聯賽詳情
#/tournament/:id/match/:matchId → 從賽制進入比賽設定
#/roster/:teamId          → 球隊名單管理
```

---

## 十、實施階段 (Phases)

### Phase 0：基礎準備
- 為 GameEngine, RulesEngine, StatsCalculator 補寫單元測試
- 修復現有 BUG（HitResult 欄位不一致、Scoreboard/StatsView 欄位錯誤）
- 資料模型版本遷移機制 (v1 → v2 自動升級)
- IndexedDB 封裝 (IndexedDBManager)
- StorageManager 改為 async，統一 LS + IDB
- **依賴：無**

### Phase 1：模式選擇 + Quick Start
- Game model 增加 mode 欄位
- Player model 增加 isTemporary
- ModeSelector UI (首頁改版)
- QuickSetup UI (1~2 步極簡設定)
- Router 新增路由
- App.js 拆分 HomeView
- 修復先發名單 UX 跳動問題
- **依賴：Phase 0**

### Phase 2：Result-Only 記錄模式
- AtBatResultPanel UI (新元件)
- GameEngine Strategy Pattern 重構
  - RecordingStrategy 介面
  - DetailedRecordingStrategy (現有邏輯)
  - ResultOnlyStrategy (新邏輯)
- LiveRecord 根據 mode 切換子面板
- PlayRecorder 增加 recordAtBatResult()
- **投手記錄功能**：換投時記錄交接點（IP/被安打/失分）
- **自責分確認機制**（兩種模式共用）：
  - 投手失分列表，預設 ER=R，可逐筆切換
  - 換投手時提醒確認 + 賽後引導確認 + Stats 頁編輯入口
  - 修改後自動重算 ERA
- Undo 粒度適配
- StatsView 根據 mode 隱藏不可用統計（如好球率顯示 `—`）
- HistoryPanel 根據 mode 隱藏投球序列
- **依賴：Phase 1**

### Phase 3：Tournament 模式（可與 Phase 2 並行）
- Tournament / Match / Roster model
- TournamentManager UI (CRUD)
- TournamentSetup UI (選賽事→選對戰→打序)
- IndexedDB 存取 tournament/roster
- TournamentStandings 計算器
- 跨場次統計累計
- 場次結果回寫 schedule
- CSV 批次匯入球員名單
- **依賴：Phase 1**

### Phase 4：整合 + 優化
- Quick Start 升級/關聯到 Tournament 功能
- 匯出格式 v2 + 向下相容匯入
- Service Worker precache 更新
- 效能優化 (LiveRecord 差量更新, Undo 差異快照)
- 全面功能測試 (四種模式組合)
- 高對比白底模式
- 文件更新
- **依賴：Phase 2 + Phase 3**

### 依賴關係
```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──┐
                    └──→ Phase 3 ──┤→ Phase 4
                    (2 和 3 可並行)
```

---

## 十一、統計能力對照

| 統計項 | Result-Only | Detailed |
|--------|:-----------:|:--------:|
| AVG / H / AB | ✅ | ✅ |
| RBI / R | ✅ | ✅ |
| BB / K | ✅ | ✅ |
| OBP / SLG / OPS | ✅ | ✅ |
| SB / CS | ✅ | ✅ |
| IP (投手局數) | ✅ 從出局結果精確計算 | ✅ |
| ERA (防禦率) | ✅ 需搭配自責分確認 | ✅ 需搭配自責分確認 |
| 被安打 / 失分 / 自責分 | ✅ | ✅ |
| WHIP | ❌ (需逐球算投球數) | ✅ |
| K/9, BB/9 | ✅ 可算(有K/BB結果+IP) | ✅ |
| 好球率 / 投球數 | ❌ | ✅ |
| 打擊方向分析 | ❌ | ✅ |
| Spray chart | ❌ | ✅ |
| 紙本記錄還原 | ❌ | ✅ |
| 文字直播 | ❌ | ✅ |

---

## 十二、風險評估

| 風險 | 等級 | 對策 |
|------|------|------|
| GameEngine 改壞現有功能 | 🔴 高 | Phase 0 先補單元測試 |
| 既有資料格式不相容 | 🔴 高 | 版本遷移函式 + 啟動自動遷移 |
| Result-Only 統計不完整造成誤解 | 🟡 中 | UI 明確標示不可用統計 |
| IndexedDB 異步 API 變更大 | 🟡 中 | 封裝統一 async StorageManager |
| Tournament 資料量大 | 🟡 中 | IndexedDB + UI 分頁查詢 |
| Quick Setup 太簡化讓使用者困惑 | 🟠 低 | 完成後提供「編輯詳細資料」入口 |
