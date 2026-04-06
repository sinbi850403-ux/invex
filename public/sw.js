/**
 * Service Worker - 오프라인 지원 & 캐싱
 * 왜 필요? → 인터넷 없는 창고 현장에서도 앱 사용 가능
 */

const CACHE_NAME = 'erp-lite-v1.6';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
];

// 설치 시 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 활성화 시 이전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 네트워크 우선, 실패 시 캐시 사용 (Network-first strategy)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 성공하면 캐시에도 저장
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 제공
        return caches.match(event.request);
      })
  );
});
