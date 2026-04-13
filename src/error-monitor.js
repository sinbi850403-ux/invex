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

// ⚠️ Sentry 프로젝트 DSN을 여기에 입력하세요
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
      // 민감한 사용자 정보는 수집하지 않음
      beforeSend(event) {
        // 이메일, 비밀번호 등 민감 정보 필터링
        if (event.request && event.request.data) {
          delete event.request.data;
        }
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
export function setMonitorUser(userId, email) {
  if (!SENTRY_DSN) return;
  try {
    Sentry.setUser({ id: userId, email });
  } catch (err) {
    // 무시 - 모니터링 실패가 앱 동작에 영향을 주면 안 됨
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

/**
 * Sentry 미설정 시 콘솔에 에러를 출력하는 폴백 핸들러
 * 왜? → DSN이 없어도 개발 중 에러를 놓치지 않기 위함
 */
function setupFallbackErrorHandler() {
  window.addEventListener('error', (event) => {
    console.error('[INVEX 미포착 에러]', event.error?.message || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[INVEX 미포착 Promise 거부]', event.reason?.message || event.reason);
  });
}
