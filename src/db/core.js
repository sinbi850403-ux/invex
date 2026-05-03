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
  // crypto.getRandomValues 우선 사용 — Math.random()은 암호학적으로 비안전 (CWE-338)
  const bytes = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(16)))
    : Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
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
 * 현재 로그인한 사용자 ID를 안전하게 가져오기
 * — 팀 워크스페이스 소속 시 오너 UID 반환 (_workspaceUserId 우선)
 */
export async function getUserId() {
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
    // fall through
  }

  if (_workspaceUserId) return _workspaceUserId;
  throw new Error('로그인이 필요합니다.');
}
