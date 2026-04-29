/**
 * db/transactions.js — 입출고 (Transactions) CRUD
 */

import { supabase } from '../supabase-client.js';
import { getUserId, handleError } from './core.js';

// ============================================================
// 입출고 (Transactions) CRUD
// ============================================================
export const transactions = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId);

    if (options.type) query = query.eq('type', options.type);
    if (options.itemName) query = query.eq('item_name', options.itemName);
    if (options.dateFrom) query = query.gte('date', options.dateFrom);
    if (options.dateTo) query = query.lte('date', options.dateTo);
    if (options.vendor) query = query.eq('vendor', options.vendor);

    query = query.order('date', { ascending: false });
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    handleError(error, '입출고 조회');
    return data || [];
  },

  async create(tx) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('transactions')
      .insert({ ...tx, user_id: userId })
      .select()
      .single();
    handleError(error, '입출고 등록');
    return data;
  },

  async bulkCreate(txArray) {
    const userId = await getUserId();
    const rows = txArray.map(tx => ({
      id: tx.id,
      user_id: userId,
      type: tx.type,
      item_name: tx.itemName,
      item_code: tx.itemCode,
      quantity: tx.quantity,
      unit_price: tx.unitPrice,
      supply_value: tx.supplyValue,
      vat: tx.vat,
      total_amount: tx.totalAmount,
      selling_price: tx.sellingPrice,
      actual_selling_price: tx.actualSellingPrice,
      spec: tx.spec,
      unit: tx.unit,
      category: tx.category,
      color: tx.color,
      date: tx.date,
      vendor: tx.vendor,
      warehouse: tx.warehouse,
      note: tx.note,
    }));
    //  insert → upsert(onConflict: 'id')
    //   클라이언트 UUID가 id로 전달되므로 재시도 시 중복 생성 없음 (멱등)
    const { data, error } = await supabase
      .from('transactions')
      .upsert(rows, { onConflict: 'id' })
      .select();
    handleError(error, '입출고 일괄 등록');
    return data || [];
  },

  async update(txId, updates) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', txId)
      .eq('user_id', userId);
    handleError(error, '입출고 수정');
  },

  async remove(txId) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', txId)
      .eq('user_id', userId);
    handleError(error, '입출고 삭제');
  },

  /**
   * 해당 사용자의 입출고 기록 전체 삭제 (설정 페이지 초기화용)
   */
  async deleteAll() {
    const userId = await getUserId();
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId);
    handleError(error, '입출고 전체 삭제');
  },
};
