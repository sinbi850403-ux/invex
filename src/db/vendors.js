/**
 * db/vendors.js — 거래처 (Vendors) CRUD
 */

import { supabase } from '../supabase-client.js';
import { getUserId, handleError } from './core.js';

// ============================================================
// 거래처 (Vendors) CRUD
// ============================================================
export const vendors = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('vendors')
      .select('*')
      .eq('user_id', userId)
      .order('name');
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    handleError(error, '거래처 조회');
    return data || [];
  },

  async create(vendor) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('vendors')
      .insert({ ...vendor, user_id: userId })
      .select()
      .single();
    handleError(error, '거래처 생성');
    return data;
  },

  async update(vendorId, updates) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('vendors')
      .update(updates)
      .eq('id', vendorId)
      .eq('user_id', userId)
      .select()
      .single();
    handleError(error, '거래처 수정');
    return data;
  },

  async upsert(vendor) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('vendors')
      .upsert({ ...vendor, user_id: userId }, { onConflict: 'user_id,name' });
    handleError(error, '거래처 저장');
  },

  async upsertBulk(vendors) {
    if (!vendors.length) return;
    const userId = await getUserId();
    const { error } = await supabase
      .from('vendors')
      .upsert(vendors.map(v => ({ ...v, user_id: userId })), { onConflict: 'user_id,name' });
    handleError(error, '거래처 일괄 저장');
  },

  async remove(vendorId) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', vendorId)
      .eq('user_id', userId);
    handleError(error, '거래처 삭제');
  },

  /**
   * 거래처 이름 기반 삭제 (Supabase UUID를 모를 때 폴백)
   */
  async removeByName(name) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('user_id', userId)
      .eq('name', name);
    handleError(error, '거래처 삭제(by name)');
  },
};
