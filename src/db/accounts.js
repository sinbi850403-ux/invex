/**
 * db/accounts.js — 감사 로그, 매출/매입 장부, 발주서, POS 매출
 */

import { supabase } from '../supabase-client.js';
import { getUserId, withDbTimeout, handleError } from './core.js';

// ============================================================
// 감사 로그 (Audit Logs)
// ============================================================
export const auditLogs = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    handleError(error, '감사 로그 조회');
    return data || [];
  },

  async create(log) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('audit_logs')
      .insert({ ...log, user_id: userId });
    // 감사 로그 실패는 조용히 처리 — 사용자 경험에 영향 없게
    if (error) console.warn('[DB] 감사 로그 저장 실패:', error.message);
  },
};

// ============================================================
// 매출/매입 장부 (Account Entries)
// ============================================================
export const accountEntries = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('account_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    handleError(error, '장부 조회');
    return data || [];
  },

  async create(entry) {
    const userId = await getUserId();
    // vendor_id FK: fix-security-perf-2026-04.sql V007-ext 적용 후 활성화
    const { data, error } = await supabase
      .from('account_entries')
      .insert({ ...entry, user_id: userId })
      .select()
      .single();
    handleError(error, '장부 등록');
    return data;
  },

  async update(entryId, updates) {
    const userId = await getUserId();
    // vendor_id FK: fix-security-perf-2026-04.sql V007-ext 적용 후 활성화
    const { data, error } = await supabase
      .from('account_entries')
      .update(updates)
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()
      .single();
    handleError(error, '장부 수정');
    return data;
  },

  async bulkUpsert(entriesArray) {
    const userId = await getUserId();
    // vendor_id FK: fix-security-perf-2026-04.sql V007-ext 적용 후 활성화
    const rows = entriesArray.map(e => ({ ...e, user_id: userId }));
    const { error } = await supabase
      .from('account_entries')
      .upsert(rows, { onConflict: 'id' });
    handleError(error, '장부 일괄 저장');
  },

  async remove(entryId) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('account_entries')
      .delete()
      .eq('id', entryId)
      .eq('user_id', userId);
    handleError(error, '장부 삭제');
  },
};

// ============================================================
// 발주서 (Purchase Orders)
// ============================================================
export const purchaseOrders = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('purchase_orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    handleError(error, '발주서 조회');
    return data || [];
  },

  async create(order) {
    const userId = await getUserId();
    // vendor_id FK: fix-security-perf-2026-04.sql V007-ext 적용 후 활성화
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({ ...order, user_id: userId })
      .select()
      .single();
    handleError(error, '발주서 생성');
    return data;
  },

  async bulkUpsert(ordersArray) {
    const userId = await getUserId();
    // vendor_id FK: fix-security-perf-2026-04.sql V007-ext 적용 후 활성화
    const rows = ordersArray.map(o => ({ ...o, user_id: userId }));
    const { error } = await supabase
      .from('purchase_orders')
      .upsert(rows, { onConflict: 'id' });
    handleError(error, '발주서 일괄 저장');
  },

  async update(orderId, updates) {
    const userId = await getUserId();
    // vendor_id FK: fix-security-perf-2026-04.sql V007-ext 적용 후 활성화
    const { data, error } = await supabase
      .from('purchase_orders')
      .update(updates)
      .eq('id', orderId)
      .eq('user_id', userId)
      .select()
      .single();
    handleError(error, '발주서 수정');
    return data;
  },
};

// ============================================================
// POS 매출 데이터
// ============================================================
export const posSales = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('pos_sales')
      .select('*')
      .eq('user_id', userId);

    if (options.dateFrom) query = query.gte('sale_date', options.dateFrom);
    if (options.dateTo) query = query.lte('sale_date', options.dateTo);
    if (options.store) query = query.eq('store', options.store);

    query = query.order('sale_date', { ascending: false });
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    handleError(error, 'POS 매출 조회');
    return data || [];
  },

  async bulkCreate(salesArray) {
    const userId = await getUserId();
    const rows = salesArray.map(s => ({ ...s, user_id: userId }));
    const { data, error } = await supabase
      .from('pos_sales')
      .insert(rows)
      .select();
    handleError(error, 'POS 매출 일괄 등록');
    return data || [];
  },
};
