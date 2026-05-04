/**
 * traffic-manager.js — 프론트엔드 트래픽 분산 + 레이트 리미팅
 *
 * 왜 필요?
 * 1. Supabase Free 플랜은 초당 요청 수에 제한이 있음
 * 2. 동시 접속자가 많아지면 API 호출이 429(Too Many Requests) 발생
 * 3. 불필요한 중복 요청을 줄여서 체감 성능 + 비용 절감
 *
 * 전략:
 * - 요청 디바운싱: 같은 엔드포인트 100ms 내 중복 호출 병합
 * - 요청 큐잉: 동시 요청 수를 제한하여 순차 처리
 * - 레이트 리미터: 슬라이딩 윈도우 방식으로 초당 요청 수 제한
 * - 지수 백오프 재시도: 429/500 에러 시 자동 재시도
 * - 응답 캐시: 짧은 TTL(30초) 인메모리 캐시로 동일 요청 재사용
 */

// ── 설정값 ──
const CONFIG = {
  MAX_CONCURRENT: 6,          // 동시 진행 가능한 요청 수
  RATE_LIMIT_PER_SEC: 10,     // 초당 최대 요청 수
  DEBOUNCE_MS: 100,           // 동일 키 요청 디바운스 간격
  CACHE_TTL_MS: 30_000,       // 응답 캐시 유효시간 (30초)
  MAX_RETRIES: 3,             // 최대 재시도 횟수
  BASE_BACKOFF_MS: 500,       // 기본 백오프 대기시간
};

// ── 내부 상태 ──
let _activeRequests = 0;
const _requestQueue = [];
const _responseCache = new Map();
const _pendingDebounce = new Map();
const _rateLimitWindow = [];          // 타임스탬프 배열 (슬라이딩 윈도우)

// ── 지표 수집 ──
const _metrics = {
  totalRequests: 0,
  cacheHits: 0,
  debounced: 0,
  queued: 0,
  retried: 0,
  rateLimited: 0,
};

/**
 * 요청 키 생성 — URL + 주요 파라미터를 해시하여 동일 요청 식별
 */
function getRequestKey(url, options = {}) {
  const method = options.method || 'GET';
  const body = options.body || '';
  return `${method}:${url}:${typeof body === 'string' ? body : JSON.stringify(body)}`;
}

/**
 * 인메모리 캐시 조회
 */
function getCachedResponse(key) {
  const cached = _responseCache.get(key);
  if (!cached) return null;

  // TTL 만료 체크
  if (Date.now() - cached.timestamp > CONFIG.CACHE_TTL_MS) {
    _responseCache.delete(key);
    return null;
  }

  _metrics.cacheHits++;
  return cached.data;
}

/**
 * 인메모리 캐시 저장
 */
function setCachedResponse(key, data) {
  // 캐시가 너무 커지면 오래된 항목 정리
  if (_responseCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of _responseCache) {
      if (now - v.timestamp > CONFIG.CACHE_TTL_MS) {
        _responseCache.delete(k);
      }
    }
  }
  _responseCache.set(key, { data, timestamp: Date.now() });
}

/**
 * 슬라이딩 윈도우 레이트 리미터
 * 왜 슬라이딩? → 고정 윈도우보다 균등한 분산 효과
 */
function checkRateLimit() {
  const now = Date.now();
  // 1초 이전의 기록 제거
  while (_rateLimitWindow.length > 0 && _rateLimitWindow[0] < now - 1000) {
    _rateLimitWindow.shift();
  }
  return _rateLimitWindow.length < CONFIG.RATE_LIMIT_PER_SEC;
}

function recordRequest() {
  _rateLimitWindow.push(Date.now());
}

/**
 * 레이트 리밋 대기 — 여유가 생길 때까지 대기
 */
function waitForRateLimit() {
  return new Promise(resolve => {
    const check = () => {
      if (checkRateLimit()) {
        resolve();
      } else {
        _metrics.rateLimited++;
        setTimeout(check, 100);
      }
    };
    check();
  });
}

/**
 * 동시 요청 수 제한 큐
 * 왜? → 6개 이상 동시 요청은 브라우저 자체 제한과도 충돌
 */
function enqueue(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      _activeRequests++;
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        _activeRequests--;
        processQueue();
      }
    };

    if (_activeRequests < CONFIG.MAX_CONCURRENT) {
      run();
    } else {
      _metrics.queued++;
      _requestQueue.push(run);
    }
  });
}

function processQueue() {
  while (_requestQueue.length > 0 && _activeRequests < CONFIG.MAX_CONCURRENT) {
    const next = _requestQueue.shift();
    next();
  }
}

/**
 * 지수 백오프 재시도
 * 왜 지수? → 서버 과부하 시 선형 재시도보다 회복 확률이 높음
 */
async function fetchWithRetry(url, options, retries = CONFIG.MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await waitForRateLimit();
      recordRequest();

      const response = await fetch(url, options);

      // 429 Too Many Requests 또는 5xx → 재시도
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        _metrics.retried++;
        const delay = CONFIG.BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 200;
        console.warn(`[Traffic] ${response.status} — ${delay.toFixed(0)}ms 후 재시도 (${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (err) {
      // 네트워크 에러 → 재시도
      if (attempt < retries) {
        _metrics.retried++;
        const delay = CONFIG.BASE_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * 관리되는 fetch — 디바운싱 + 캐시 + 큐잉 + 레이트 리밋 + 재시도
 * 기존 fetch()를 이 함수로 교체하면 자동으로 트래픽 분산 적용
 *
 * @param {string} url - 요청 URL
 * @param {object} options - fetch 옵션
 * @param {object} trafficOptions - 트래픽 관리 옵션
 * @param {boolean} trafficOptions.useCache - 캐시 사용 여부 (기본: GET만 true)
 * @param {boolean} trafficOptions.debounce - 디바운스 적용 여부 (기본: true)
 * @returns {Promise<Response>}
 */
export async function managedFetch(url, options = {}, trafficOptions = {}) {
  _metrics.totalRequests++;
  const key = getRequestKey(url, options);
  const method = (options.method || 'GET').toUpperCase();

  // 1. 캐시 체크 (GET 요청만)
  const useCache = trafficOptions.useCache ?? (method === 'GET');
  if (useCache) {
    const cached = getCachedResponse(key);
    if (cached) return cached;
  }

  // 2. 디바운싱 — 동일 키 요청 100ms 내 병합
  const useDebounce = trafficOptions.debounce ?? true;
  if (useDebounce && _pendingDebounce.has(key)) {
    _metrics.debounced++;
    return _pendingDebounce.get(key);
  }

  // 3. 실제 요청을 큐잉하여 실행
  const requestPromise = enqueue(() => fetchWithRetry(url, options));

  // 디바운스 등록
  if (useDebounce) {
    _pendingDebounce.set(key, requestPromise);
    requestPromise.finally(() => {
      setTimeout(() => _pendingDebounce.delete(key), CONFIG.DEBOUNCE_MS);
    });
  }

  // 결과 캐싱 (GET만)
  if (useCache) {
    try {
      const response = await requestPromise;
      setCachedResponse(key, response.clone());
      return response;
    } catch (err) {
      throw err;
    }
  }

  return requestPromise;
}

/**
 * Supabase 쿼리 래퍼 — RPC/REST 호출에 레이트 리밋 + 재시도 적용
 * 왜: supabase.from().select() 등은 내부적으로 fetch를 쓰므로
 *     직접 제어 불가 → 쿼리 실행 전 큐/레이트 체크만 수행
 */
export async function managedQuery(queryFn) {
  _metrics.totalRequests++;

  return enqueue(async () => {
    await waitForRateLimit();
    recordRequest();

    const result = await queryFn();

    // BUG-003: 429 재시도 시 큐/레이트리밋 재통과 — 직접 호출로 burst 생성 방지
    if (result?.error?.message?.includes('rate') || result?.error?.code === '429') {
      _metrics.retried++;
      const backoff = CONFIG.BASE_BACKOFF_MS * (1 + Math.random()); // 0.5~1.5× jitter
      await new Promise(r => setTimeout(r, backoff));
      // 재시도도 waitForRateLimit → recordRequest 경유 (레이트리밋 우회 차단)
      await waitForRateLimit();
      recordRequest();
      return queryFn();
    }

    return result;
  });
}

/**
 * 캐시 무효화 — 데이터 변경 후 관련 캐시 정리
 */
export function invalidateCache(pattern) {
  if (!pattern) {
    _responseCache.clear();
    return;
  }
  for (const key of _responseCache.keys()) {
    if (key.includes(pattern)) {
      _responseCache.delete(key);
    }
  }
}

/**
 * 지표 조회 — 관리자 대시보드 / 디버깅용
 */
export function getTrafficMetrics() {
  return {
    ..._metrics,
    activeRequests: _activeRequests,
    queuedRequests: _requestQueue.length,
    cachedEntries: _responseCache.size,
    rateLimitWindowSize: _rateLimitWindow.length,
  };
}

/**
 * 설정 업데이트 — 내부 전용 (V-010: 외부 노출 시 레이트리밋 우회 가능)
 * export 제거: 외부에서 CONFIG를 임의 조작하지 못하도록 모듈 내부로 격리
 */
function updateTrafficConfig(overrides) {
  Object.assign(CONFIG, overrides);
}
// 미사용 경고 억제 — 향후 내부 self-tuning 로직에서 호출 예정
void updateTrafficConfig;

/**
 * 지표 초기화
 */
export function resetTrafficMetrics() {
  Object.keys(_metrics).forEach(k => { _metrics[k] = 0; });
}
