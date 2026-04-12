/**
 * firebase-sync.js - 클라우드 동기화 (Supabase 전환 완료)
 *
 * 왜 파일명을 유지? → main.js가 import { startSync, stopSync, ... }를 사용중
 * 인터페이스 유지하고 내부만 Supabase로 교체
 *
 * 변경 전: Firestore 1개 문서에 모든 데이터 저장 (1MB 제한)
 * 변경 후: Supabase 테이블별 분리 저장 (무제한)
 */

import { isSupabaseConfigured } from './supabase-client.js';
import * as db from './db.js';
import { getState, setState } from './store.js';
import { showToast } from './toast.js';

let isSyncing = false;
let lastSyncTime = null;

/**
 * 클라우드 동기화 시작
 * Supabase는 RLS로 자동 격리되므로 userId는 내부적으로 처리됨
 */
export function startSync(userId) {
  if (!isSupabaseConfigured) return;
  // Supabase는 실시간 동기화가 아닌 요청 기반
  // 초기 데이터 로딩은 initAppAfterAuth에서 처리
  lastSyncTime = Date.now();
  console.log('[Sync] Supabase 동기화 준비 완료 (사용자:', userId, ')');
}

/**
 * 동기화 중지
 */
export function stopSync() {
  lastSyncTime = null;
}

/**
 * 로컬 → 클라우드 업로드 (디바운스)
 * 기존: Firestore 1문서에 전체 데이터
 * 변경: 호출되면 무시 (각 페이지에서 db.js를 직접 사용)
 *
 * 왜 빈 함수? → 기존에 store.js의 setSyncCallback에서 이 함수를 호출하지만
 * Supabase 전환 후에는 각 페이지가 db.js를 직접 호출하므로 별도 동기화 불필요
 */
let saveTimer = null;

export function syncToCloud() {
  // Supabase는 각 CRUD 시점에 바로 저장되므로 별도 동기화 불필요
  // 이 함수는 하위 호환을 위해 유지
}

/**
 * 수동 전체 동기화 — 로컬 데이터를 Supabase로 강제 업로드
 */
export async function forceSync() {
  if (!isSupabaseConfigured) {
    showToast('Supabase가 설정되지 않았습니다.', 'info');
    return;
  }

  try {
    isSyncing = true;
    const state = getState();
    const items = state.mappedData || [];

    if (items.length > 0) {
      // 기존 로컬 데이터를 Supabase로 업로드
      const dbItems = items.map(item => db.storeItemToDb(item));
      await db.items.bulkUpsert(dbItems);
    }

    lastSyncTime = Date.now();
    isSyncing = false;
    showToast('Supabase에 전체 동기화 완료 ☁️', 'success');
  } catch (error) {
    isSyncing = false;
    showToast('동기화 실패: ' + error.message, 'error');
  }
}

/**
 * 동기화 상태 반환
 */
export function getSyncStatus() {
  return {
    isConfigured: isSupabaseConfigured,
    isConnected: isSupabaseConfigured,
    lastSync: lastSyncTime ? new Date(lastSyncTime).toLocaleString('ko-KR') : '없음',
  };
}
