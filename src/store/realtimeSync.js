/**
 * realtimeSync.js - Supabase Realtime 실시간 동기화
 *
 * 2026-04-29: Realtime 비활성화
 * 이유: 사용자가 대량 데이터 입출고 시 매번 전체 데이터 재로드 → 지속적인 새로고침 문제
 * 해결: 명시적 새로고침만 지원 (대시보드 새로고침 버튼, 페이지 이동 시)
 * 향후: 부분 업데이트 구현 후 Realtime 재활성화 예정
 */

import { supabase, isSupabaseConfigured } from '../supabase-client.js';

let _realtimeChannel = null;

export function setupRealtimeSync(onReload) {
  // Realtime 구독 비활성화 (지속적인 새로고침 문제 해결)
  // onReload는 더 이상 자동으로 호출되지 않음
  // 필요시 사용자가 명시적으로 새로고침 버튼 클릭으로 호출
}

export function cleanupRealtimeSync() {
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel).catch(() => {});
    _realtimeChannel = null;
  }
}
