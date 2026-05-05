/**
 * db/core.js — 공유 유틸리티 (테이블 로직 없음)
 *
 * 왜 별도 레이어?
 * → 페이지 코드가 직접 SQL을 쓰면 유지보수 지옥
 * → db.items.list(), db.transactions.create() 같은 깔끔한 API 제공
 * → 나중에 DB를 바꿔도 이 파일만 수정하면 됨
 */

import { supabase } from '../supabase-client.js';

const DB_TIMEOUT_MS = 15_000;
const USER_ID_CACHE_TTL_MS = 60_000;
let _cachedUserId = null;
let _cachedUserIdAt = 0;

/**
 * 워크스페이스 오너 UID 오버라이드
 * — 팀 멤버로 접속 시 오너의 user_id로 쿼리하기 위해 사용
 * — main.js에서 로그인 후 setWorkspaceUserId() 호출로 주입
 */
let _workspaceUserId = null;

export function setWorkspaceUserId(uid) {
  _workspaceUserId = uid || null;
}

export function clearWorkspaceUserId() {
  _workspaceUserId = null;
}

/**
 * 로그인 직후 uid를 캐시에 주입 — getUserId()의 getSession 재호출 타이밍 경쟁 방지
 */
export function primeUserIdCache(uid) {
  if (uid) {
    _cachedUserId = uid;
    _cachedUserIdAt = Date.now();
  }
}

/**
 * Supabase 쿼리에 타임아웃을 적용하는 래퍼
 * 왜 필요? → 네트워크 지연 시 무한 대기 → UI 스피너 갇힘 방지
 */
export function withDbTimeout(queryPromise, label = 'DB query') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout (${DB_TIMEOUT_MS}ms)`)), DB_TIMEOUT_MS);
  });
  return Promise.race([queryPromise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 에러 핸들링 유틸 — Supabase 에러를 통일된 형태로 변환
 */
export function handleError(error, context) {
  if (error) {
    console.error(`[DB] ${context}:`, error.message);
    throw new Error(`${context}: ${error.message}`);
  }
}

export function toNullableNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/,/g, '').trim();
  if (!normalized || normalized === '-' || normalized.toLowerCase() === 'nan') return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function toNullableString(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

export function generateClientUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // crypto.getRandomValues만 사용 — Math.random()은 암호학적으로 비안전 (CWE-338)
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('보안 UUID 생성 불가: crypto.getRandomValues를 지원하지 않는 환경입니다.');
  }
  const bytes = Array.from(crypto.getRandomValues(new Uint8Array(16)));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 텍스트 이름 배열 → {이름: UUID} 맵 (FK 듀얼라이트 헬퍼)
 * 예: resolveFKMap('warehouses', 'name', userId, ['서울창고', '부산창고'])
 *  → { '서울창고': 'uuid1', '부산창고': 'uuid2' }
 */
export async function resolveFKMap(table, nameColumn, userId, names) {
  const unique = [...new Set(names.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await supabase
    .from(table)
    .select(`id,${nameColumn}`)
    .eq('user_id', userId)
    .in(nameColumn, unique);
  return Object.fromEntries((data || []).map(r => [r[nameColumn], r.id]));
}

/**
 * 데이터 쿼리용 user_id 반환 (V-002 수정)
 *
 * 설계 원칙:
 * - _workspaceUserId는 setWorkspaceUserId()로만 설정됨
 *   → setWorkspaceUserId는 AuthContext에서 인증 성공 + is_workspace_member RPC 검증 후 호출
 *   → 즉, _workspaceUserId가 설정됐다면 이미 안전하게 인증된 컨텍스트
 * - 인증 FAILURE 시 _workspaceUserId로 폴백하는 것이 V-002 취약점
 *   → 수정: _workspaceUserId를 함수 끝이 아닌 인증 이전에 체크 (항상 설정된 값 우선)
 *
 * 결과:
 * - 워크스페이스 모드: _workspaceUserId(오너 UID) → 인증 없이 반환 (보안: 이미 검증됨)
 * - 개인 모드: 정상 인증 경로 → 실제 로그인 UID 반환
 * - 인증 실패 시: 예외 throw (auth bypass 없음)
 */
export async function getUserId() {
  // 워크스페이스 모드: setWorkspaceUserId()가 인증+멤버십 검증 후 주입한 오너 UID 사용
  // 이 값은 인증 성공 후에만 설정되므로 먼저 반환해도 안전 (V-002와 다른 이유: 순서 역전)
  if (_workspaceUserId) return _workspaceUserId;

  if (_cachedUserId && Date.now() - _cachedUserIdAt < USER_ID_CACHE_TTL_MS) {
    return _cachedUserId;
  }

  try {
    const { data: { session } } = await withDbTimeout(supabase.auth.getSession(), 'getSession');
    if (session?.user?.id) {
      _cachedUserId = session.user.id;
      _cachedUserIdAt = Date.now();
      return _cachedUserId;
    }

    const { data: { user } } = await withDbTimeout(supabase.auth.getUser(), 'getUser');
    if (user?.id) {
      _cachedUserId = user.id;
      _cachedUserIdAt = Date.now();
      return _cachedUserId;
    }
  } catch (_) {
    // fall through — 인증 실패 시 아래에서 throw
  }

  // _workspaceUserId가 없고 인증도 실패한 경우: 로그인 필요
  // (인증 실패 시 _workspaceUserId 폴백 제거 — V-002 fix 핵심)
  throw new Error('로그인이 필요합니다.');
}

/**
 * 실제 인증된 사용자 UID (순수 인증용)
 * — 워크스페이스 컨텍스트 무시, 항상 현재 로그인한 사용자의 UID 반환
 * — 사용 대상: clearAllUserData() 같은 소유자 본인 판정 로직
 */
export async function getAuthUserId() {
  if (_cachedUserId && Date.now() - _cachedUserIdAt < USER_ID_CACHE_TTL_MS) {
    return _cachedUserId;
  }
  try {
    const { data: { session } } = await withDbTimeout(supabase.auth.getSession(), 'getSession');
    if (session?.user?.id) {
      _cachedUserId = session.user.id;
      _cachedUserIdAt = Date.now();
      return _cachedUserId;
    }
    const { data: { user } } = await withDbTimeout(supabase.auth.getUser(), 'getUser');
    if (user?.id) {
      _cachedUserId = user.id;
      _cachedUserIdAt = Date.now();
      return _cachedUserId;
    }
  } catch (_) { /* fall through */ }
  throw new Error('로그인이 필요합니다.');
}

/**
 * @deprecated getUserId()가 워크스페이스 컨텍스트를 포함하므로 직접 사용 가능
 * 하위 호환성을 위해 유지
 */
export async function getWorkspaceContextUserId() {
  return getUserId();
}
