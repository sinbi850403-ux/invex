/**
 * supabase-client.js - Supabase 클라이언트 초기화
 * @updated 2026-05-04
 * 왜 별도 파일? → 모든 모듈에서 동일한 클라이언트 인스턴스를 공유하기 위해
 * 환경변수: .env 파일에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 설정 필요
 */

import { createClient } from '@supabase/supabase-js';

function normalizeEnv(value) {
  return String(value ?? '')
    // remove escaped control sequences accidentally pasted from CLI output
    .replace(/\\r\\n|\\n|\\r|\\t/g, '')
    // remove actual control characters
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '');
}

function isValidHttpsUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Vite 환경변수에서 Supabase 설정 로드 (따옴표/공백 오입력 방어)
const SUPABASE_URL = normalizeEnv(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_ANON_KEY = normalizeEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
const HAS_VALID_URL = isValidHttpsUrl(SUPABASE_URL);
const HAS_VALID_KEY = SUPABASE_ANON_KEY.length > 20;

// Supabase 프로젝트가 설정되어 있는지 확인
export const isSupabaseConfigured = HAS_VALID_URL && HAS_VALID_KEY;

export function getSupabaseConfig() {
  return {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  };
}

export function getSupabaseDebugInfo() {
  const host = HAS_VALID_URL ? new URL(SUPABASE_URL).host : '(invalid-url)';
  return {
    configured: isSupabaseConfigured,
    hasUrl: Boolean(SUPABASE_URL),
    hasKey: Boolean(SUPABASE_ANON_KEY),
    validUrl: HAS_VALID_URL,
    validKey: HAS_VALID_KEY,
    urlHost: host,
    keyLength: SUPABASE_ANON_KEY.length,
  };
}

/**
 * Supabase 클라이언트 싱글톤
 * persistSession: 로그인 세션을 localStorage에 유지
 * autoRefreshToken: 토큰 만료 시 자동 갱신
 */
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // 이전 인증 저장소와 충돌 방지
        storageKey: 'invex-supabase-auth',
        // 동시 다중 쿼리 시 Web Locks 경쟁 방지
        // (단일 탭 SPA이므로 크로스탭 락 보호 불필요)
        lock: (_name, _acquireTimeout, fn) => fn(),
      },
    })
  : null;

if (!isSupabaseConfigured) {
  console.error('[Supabase] 설정값이 유효하지 않습니다.', {
    hasUrl: Boolean(SUPABASE_URL),
    hasKey: Boolean(SUPABASE_ANON_KEY),
    validUrl: HAS_VALID_URL,
    validKey: HAS_VALID_KEY,
  });
}
