/**
 * realtimeSync.js - Supabase Realtime 실시간 동기화
 *
 * 순환 참조 방지: restoreState를 직접 import하지 않고 onReload 콜백으로 주입받는다.
 */

import { supabase, isSupabaseConfigured } from '../supabase-client.js';
import { getLastLocalSyncTime } from './supabaseSync.js';

// === Realtime 실시간 동기화 ===

let _realtimeChannel = null;
let _realtimeReloadTimer = null;

const REALTIME_TABLES = [
  'items', 'transactions', 'vendors', 'transfers',
  'account_entries', 'purchase_orders', 'stocktakes',
  'user_settings', 'profiles',
];

function scheduleRealtimeReload(onReload) {
  // 3초 이내에 내가 직접 Supabase에 썼으면 내 변경이 돌아온 것 → 무시
  if (Date.now() - getLastLocalSyncTime() < 3000) return;

  if (_realtimeReloadTimer) clearTimeout(_realtimeReloadTimer);
  _realtimeReloadTimer = setTimeout(async () => {
    await onReload();
    window.dispatchEvent(new CustomEvent('invex:realtime-reload'));
  }, 1500);
}

export function setupRealtimeSync(onReload) {  // onReload = restoreState callback
  if (!isSupabaseConfigured) return;
  cleanupRealtimeSync();

  const channel = supabase.channel('invex-realtime-v1');
  REALTIME_TABLES.forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => scheduleRealtimeReload(onReload));
  });
  channel.subscribe();
  _realtimeChannel = channel;
}

export function cleanupRealtimeSync() {
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel).catch(() => {});
    _realtimeChannel = null;
  }
  if (_realtimeReloadTimer) {
    clearTimeout(_realtimeReloadTimer);
    _realtimeReloadTimer = null;
  }
}
