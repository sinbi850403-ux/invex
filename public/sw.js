/**
 * Service Worker - 오프라인 지원 & 캐싱
 *
 * 주의: /assets/ 파일은 SW 캐시하지 않음
 *   - Vercel이 Cache-Control: immutable(1년) 헤더를 이미 전송
 *   - SW가 캐시하면 배포 후 해시가 바뀐 청크를 HTML로 오염시켜 모듈 로드 실패 유발
 */

// ★ 배포 때마다 버전을 올리면 이전 캐시가 자동 제거됨
const CACHE_NAME = 'invex-v4';

// 프리캐시 대상: HTML 셸만 (assets는 브라우저 HTTP 캐시에 위임)
const PRECACHE_URLS = ['/index.html', '/landing.html'];

// ── 설치 ──────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting(); // 즉시 활성화
});

// ── 활성화: 이전 버전 캐시 전부 삭제 ─────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch 전략 ────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // GET 이외 / 외부 API / 인증 관련 → SW 처리 안 함
  if (
    req.method !== 'GET' ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('accounts.google') ||
    url.hostname.includes('googleapis.com') ||
    url.searchParams.has('code') ||
    url.searchParams.has('access_token')
  ) {
    return; // 브라우저 기본 처리에 위임
  }

  // /assets/ (JS 청크, CSS, 이미지 등)
  // → SW 캐시 완전히 배제. Vercel immutable 헤더로 브라우저가 처리.
  // → 혹시 네트워크 실패 시만 SW 캐시 폴백 (없으면 그냥 실패)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // 나머지 (index.html 등): Network-first → 캐시 폴백
  event.respondWith(
    fetch(req)
      .then((response) => {
        // 정상 응답만 캐시 (HTML fallback 오염 방지: ok + html만 저장)
        if (response.ok) {
          const ct = response.headers.get('content-type') || '';
          // JS/CSS를 반환해야 할 URL에 HTML이 오면 캐시하지 않음
          const expectsScript = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
          const gotHtml = ct.includes('text/html');
          if (!expectsScript || !gotHtml) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});
