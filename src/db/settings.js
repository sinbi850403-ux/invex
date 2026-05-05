/**
 * db/settings.js — 사용자 설정 (Key-Value) + 커스텀 필드
 */

import { supabase } from '../supabase-client.js';
import { getUserId, getAuthUserId, handleError } from './core.js';

// ============================================================
// 사용자 설정 (Key-Value)
// ============================================================
export const settings = {
  async get(key) {
    const userId = await getUserId();
    //  .single() → .maybeSingle() : 행이 없으면 HTTP 406 대신 null 반환
    //   .single()은 0행이면 PGRST116(406)을 발생시켜 브라우저 콘솔에 에러가 찍힘
    const { data, error } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', key)
      .maybeSingle();

    handleError(error, `설정 조회 (${key})`);
    return data?.value ?? null;
  },

  async set(key, value) {
    const userId = await getUserId();
    const result = await supabase
      .from('user_settings')
      .upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' });
    if (!result) return; // Supabase가 undefined 반환 시 안전 처리
    handleError(result.error, `설정 저장 (${key})`);
  },

  /**
   * 여러 설정을 한번에 조회
   */
  async getAll() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('user_settings')
      .select('key, value')
      .eq('user_id', userId);
    handleError(error, '전체 설정 조회');

    // [{key, value}] → {key: value} 객체로 변환
    const result = {};
    (data || []).forEach(row => { result[row.key] = row.value; });
    return result;
  },
};

// ============================================================
// 개인 설정 (Personal Settings) — 항상 로그인한 본인 UID 사용
//
// 왜 별도 분리?
// → settings(공유 설정)는 getUserId()를 사용해 워크스페이스 모드에서
//   오너 UID로 동작하므로 팀원이 joined_workspace_id 등을 읽고 쓰면
//   오너의 설정에 덮어써버리는 버그가 발생한다.
// → 개인 UI 상태 / 소속 워크스페이스 ID 등은 로그인한 본인 UID(getAuthUserId)를 사용해야 한다.
//
// 개인 설정 키 목록:
//   joined_workspace_id, notificationReadMap, onboarding_done, lastPage
// ============================================================
export const personalSettings = {
  async get(key) {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', key)
      .maybeSingle();
    handleError(error, `개인설정 조회 (${key})`);
    return data?.value ?? null;
  },

  async set(key, value) {
    const userId = await getAuthUserId();
    const result = await supabase
      .from('user_settings')
      .upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' });
    if (!result) return;
    handleError(result.error, `개인설정 저장 (${key})`);
  },

  async getAll() {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('user_settings')
      .select('key, value')
      .eq('user_id', userId);
    handleError(error, '개인설정 전체 조회');
    const result = {};
    (data || []).forEach(row => { result[row.key] = row.value; });
    return result;
  },
};

// ============================================================
// 커스텀 필드
// ============================================================
export const customFields = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('custom_fields')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order');
    handleError(error, '커스텀 필드 조회');
    return data || [];
  },

  async create(field) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('custom_fields')
      .insert({ ...field, user_id: userId })
      .select()
      .single();
    handleError(error, '커스텀 필드 생성');
    return data;
  },

  async remove(fieldId) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('custom_fields')
      .delete()
      .eq('id', fieldId)
      .eq('user_id', userId);
    handleError(error, '커스텀 필드 삭제');
  },
};
