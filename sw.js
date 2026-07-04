/**
 * 日积跬步 - Service Worker V2
 * 离线缓存 + 推送通知 + 自动更新
 */
const CACHE_NAME = 'habit-tracker-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/main.css',
  '/js/db.js',
  '/js/defaults.js',
  '/js/auth.js',
  '/js/render.js',
  '/js/reminder-service.js',
  '/js/app.js',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/favicon.png',
];

// 安装
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW V2] 预缓存资源...');
      return cache.addAll(ASSETS_TO_CACHE).catch(e => {
        console.warn('[SW V2] 部分资源缓存失败:', e);
      });
    })
  );
  self.skipWaiting();
});

// 激活：清��旧版本
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// 请求拦截：缓存优先 + 网络回退
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// 推送通知
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || '日积跬步', {
      body: data.body || '别忘了今天的习惯哦~',
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
    })
  );
});

// 通知点击
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
