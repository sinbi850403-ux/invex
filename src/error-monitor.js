/**
 * error-monitor.js - 에러 모니터링 (Sentry 연동)
 * 
 * 왜 필요? → 사용자가 겪는 오류를 실시간으로 감지해야
 *            무료 오픈 기간 중 빠르게 버그를 고칠 수 있음.
 * 
 * 사용법:
 *   1. https://sentry.io 에서 무료 계정 생성
 *   2. 프로젝트 생성 (Platform: JavaScript)
 *   3. DSN 값을 아래 SENTRY_DSN에 붙여넣기
 *   4. 배포하면 자동으로 에러 수집 시작
 * 
 * DSN 미설정 시: 콘솔에 에러를 출력하고 Sentry는 비활성화됨 (앱 동작에 영향 없음)
 */

import * as Sentry from '@sentry/browser';
import { showToast } from './toast.js';

//  Sentry 프로젝트 DSN을 여기에 입력하세요
// 예시: 'https://abcdef1234567890@o123456.ingest.sentry.io/1234567'
const SENTRY_DSN = '';

/**
 * 에러 모니터링 초기화
 * 왜 필요? → 사용자가 겪는 오류를 실시간으로 감지해야
 */
export function initErrorMonitor() {
  // DSN이 설정되지 않으면 Sentry 비활성화
  if (!SENTRY_DSN) {
    console.info('[INVEX] 에러 모니터링: DSN 미설정 → 콘솔 모드로 동작합니다.');
    setupFallbackErrorHandler();
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: window.location.hostname === 'invex.io.kr' ? 'production' : 'development',
      // 왜 0.5? → 무료 플랜은 월 5,000건 제한이므로 50%만 샘플링
      tracesSampleRate: 0.5,
      beforeSend(event) {
        // request body 제거
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
        }
        // user 정보는 id만 유지 (이메일 제거)
        if (event.user) {
          event.user = { id: event.user.id };
        }
        // extra/contexts에서 민감 키 제거
        const SENSITIVE = ['password', 'token', 'secret', 'accountNo', 'rrn', 'email'];
        const scrub = (obj) => {
          if (!obj || typeof obj !== 'object') return obj;
          for (const key of Object.keys(obj)) {
            if (SENSITIVE.some(s => key.toLowerCase().includes(s))) obj[key] = '[Filtered]';
            else if (typeof obj[key] === 'object') scrub(obj[key]);
          }
          return obj;
        };
        scrub(event.extra);
        scrub(event.contexts);
        return event;
      },
    });
    console.info('[INVEX] 에러 모니터링: Sentry 연동 완료');
  } catch (err) {
    console.warn('[INVEX] 에러 모니터링 초기화 실패:', err.message);
    setupFallbackErrorHandler();
  }
}

/**
 * 사용자 정보 설정 (로그인 후 호출)
 * 왜 필요? → 사용자가 겪는 오류를 실시간으로 감지해야
 * 주의: 이메일은 보내되 비밀번호 등 민감 정보는 절대 보내지 않음
 */
export function setMonitorUser(userId) {
  if (!SENTRY_DSN) return;
  try {
    // id만 전송 — 이메일 등 개인정보는 Sentry에 보내지 않음
    Sentry.setUser({ id: userId });
  } catch (err) {
    // 무시
  }
}

/**
 * 사용자 정보 초기화 (로그아웃 시 호출)
 */
export function clearMonitorUser() {
  if (!SENTRY_DSN) return;
  try {
    Sentry.setUser(null);
  } catch (err) {
    // 무시
  }
}

/**
 * 수동 에러 보고 (catch 블록에서 사용)
 * 사용 예시: reportError(error, { page: 'inventory', action: 'delete' })
 */
export function reportError(error, context = {}) {
  if (SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
  console.error('[INVEX 에러]', error.message, context);
}

/**
 * 수동 메시지 보고 (에러는 아니지만 주의가 필요한 상황)
 * 사용 예시: reportMessage('데이터 동기화 지연', { delay: '5000ms' })
 */
export function reportMessage(message, context = {}) {
  if (SENTRY_DSN) {
    Sentry.captureMessage(message, { extra: context });
  }
  console.warn('[INVEX 주의]', message, context);
}

// ─── 영문 에러 → 한국어 변환 테이블 ─────────────────────────────────────────
const ERROR_TRANSLATIONS = [
  { test: /network|fetch|failed to fetch|net::/i,  msg: '네트워크 연결을 확인해 주세요.' },
  { test: /timeout|timed out/i,                    msg: '요청 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.' },
  { test: /permission|policy|403|not authorized/i, msg: '접근 권한이 없습니다.' },
  { test: /not found|404|pgrst116/i,               msg: '데이터를 찾을 수 없습니다.' },
  { test: /duplicate|unique|already exists/i,      msg: '이미 동일한 데이터가 존재합니다.' },
  { test: /quota|storage full/i,                   msg: '저장 공간이 부족합니다.' },
  { test: /invalid|validation/i,                   msg: '입력값을 다시 확인해 주세요.' },
  { test: /jwt|token|session|auth/i,               msg: '로그인이 만료됐습니다. 다시 로그인해 주세요.' },
  { test: /abort/i,                                msg: '작업이 취소됐습니다.' },
];

/**
 * 영문 기술 에러 메시지를 한국어 사용자 메시지로 변환
 */
export function translateError(message) {
  if (!message) return '알 수 없는 오류가 발생했습니다.';
  for (const { test, msg } of ERROR_TRANSLATIONS) {
    if (test.test(message)) return msg;
  }
  return '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}

/**
 * 에러를 Sentry에 보고하고 사용자에게 한국어 토스트를 표시하는 통합 핸들러
 *
 * 사용 예시:
 *   } catch (err) {
 *     handlePageError(err, { page: 'inventory', action: 'delete' });
 *   }
 *
 * @param {Error}  error        - 발생한 에러 객체
 * @param {object} context      - 디버깅용 컨텍스트 (page, action 등)
 * @param {string} [userMsg]    - 직접 지정할 사용자 메시지 (없으면 자동 번역)
 * @param {'error'|'warning'} [toastType] - 토스트 유형 (기본 'error')
 */
export function handlePageError(error, context = {}, userMsg = null, toastType = 'error') {
  // 1. Sentry / 콘솔에 기록
  reportError(error, context);

  // 2. 사용자 메시지 결정
  const msg = userMsg || translateError(error?.message || '');

  // 3. 토스트 표시
  try {
    showToast(msg, toastType);
  } catch {
    // showToast 자체가 실패해도 앱이 죽으면 안 됨
  }

  return msg;
}

// 브라우저 확장 프로그램(MetaMask 등) 및 외부 라이브러리 에러 패턴
const EXTENSION_ERROR_PATTERNS = [
  /metamask/i,
  /ethereum/i,
  /inpage\.js/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /extension:\/\//i,
];

function isExternalError(message = '', filename = '') {
  const text = `${message} ${filename}`;
  return EXTENSION_ERROR_PATTERNS.some(p => p.test(text));
}

/**
 * Sentry 미설정 시 콘솔에 에러를 출력하는 폴백 핸들러
 * 왜? → DSN이 없어도 개발 중 에러를 놓치지 않기 위함
 */
function setupFallbackErrorHandler() {
  window.addEventListener('error', (event) => {
    if (isExternalError(event.error?.message || event.message, event.filename)) return;
    console.error('[INVEX 미포착 에러]', event.error?.message || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason || '');
    const stack = event.reason?.stack || '';
    if (isExternalError(msg, stack)) return;
    console.error('[INVEX 미포착 Promise 거부]', msg);
  });
}
