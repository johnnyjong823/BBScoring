/**
 * BBScoring — Service Worker (Cache First)
 */
const CACHE_NAME = 'bbscoring-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/reset.css',
  './css/variables.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/field.css',
  './css/scoreboard.css',
  './css/animations.css',
  './css/responsive.css',
  './js/app.js',
  './js/router.js',
  './js/utils/constants.js',
  './js/utils/helpers.js',
  './js/utils/gestures.js',
  './js/utils/vibration.js',
  './js/models/Player.js',
  './js/models/Team.js',
  './js/models/Play.js',
  './js/models/Inning.js',
  './js/models/Game.js',
  './js/core/GameEngine.js',
  './js/core/PlayRecorder.js',
  './js/core/RunnerManager.js',
  './js/core/RulesEngine.js',
  './js/core/StatsCalculator.js',
  './js/core/UndoManager.js',
  './js/storage/StorageManager.js',
  './js/storage/ExportManager.js',
  './js/storage/ImportManager.js',
  './js/ui/GameSetup.js',
  './js/ui/LiveRecord.js',
  './js/ui/PitchPanel.js',
  './js/ui/HitResultPanel.js',
  './js/ui/FieldDiagram.js',
  './js/ui/RunnerDiagram.js',
  './js/ui/Scoreboard.js',
  './js/ui/LineupPanel.js',
  './js/ui/StatsView.js',
  './js/ui/HistoryPanel.js'
];

// Install — 預快取所有資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate — 清除舊版快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — Cache First 策略
self.addEventListener('fetch', (event) => {
  // 只攔截 GET 請求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // 不快取非成功回應或跨域請求
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        return response;
      });
    })
  );
});
