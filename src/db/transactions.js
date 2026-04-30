/**
 * db/transactions.js - 입출고(Transactions) CRUD
 */

import { supabase } from '../supabase-client.js';
import { getUserId, handleError } from './core.js';

function toDateOnly(value) {
  if (!value) return null;
  const s = String(value).trim().replace(/,/g, '');
  if (!s) return null;
  // Excel serials sometimes come in as text
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (Number.isFinite(serial)) {
      const ms = Math.round((Math.floor(serial) - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        if (y >= 1900 && y <= 2100) return d.toISOString().slice(0, 10);
      }
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 1900 || y > 2100) return null;
  return d.toISOString().slice(0, 10);
}

function pick(tx, camel, snake) {
  if (tx?.[camel] !== undefined) return tx[camel];
  return tx?.[snake];
}

// ============================================================
// 입출고(Transactions) CRUD
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
    if (options.dateFrom) query = query.gte('txn_date', options.dateFrom);
    if (options.dateTo) query = query.lte('txn_date', options.dateTo);
    if (options.vendor) query = query.eq('vendor', options.vendor);

    query = query
      .order('txn_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
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
    const BATCH_SIZE = 500;
    const rows = txArray.map((tx) => {
      const rawDate = pick(tx, 'date', 'date');
      const normalizedDate = toDateOnly(rawDate);
      const normalizedTxnDate = toDateOnly(pick(tx, 'txnDate', 'txn_date'));
      return {
        id: pick(tx, 'id', 'id'),
        user_id: userId,
        type: pick(tx, 'type', 'type'),
        item_id: pick(tx, 'itemId', 'item_id') || null,
        item_name: pick(tx, 'itemName', 'item_name'),
        item_code: pick(tx, 'itemCode', 'item_code'),
        quantity: pick(tx, 'quantity', 'quantity') ?? 0,
        unit_price: pick(tx, 'unitPrice', 'unit_price') ?? 0,
        supply_value: pick(tx, 'supplyValue', 'supply_value') ?? 0,
        vat: pick(tx, 'vat', 'vat') ?? 0,
        total_amount: pick(tx, 'totalAmount', 'total_amount') ?? 0,
        selling_price: pick(tx, 'sellingPrice', 'selling_price') ?? 0,
        actual_selling_price: pick(tx, 'actualSellingPrice', 'actual_selling_price') ?? 0,
        spec: pick(tx, 'spec', 'spec') || null,
        unit: pick(tx, 'unit', 'unit') || null,
        category: pick(tx, 'category', 'category') || null,
        color: pick(tx, 'color', 'color') || null,
        date: normalizedDate,
        txn_date: normalizedTxnDate || normalizedDate,
        vendor: pick(tx, 'vendor', 'vendor') || null,
        vendor_id: pick(tx, 'vendorId', 'vendor_id') || null,
        warehouse: pick(tx, 'warehouse', 'warehouse') || null,
        warehouse_id: pick(tx, 'warehouseId', 'warehouse_id') || null,
        note: pick(tx, 'note', 'note') || null,
      };
    });

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('transactions')
        .upsert(batch, { onConflict: 'id' });
      handleError(error, `입출고 일괄 등록(${i}~${i + batch.length})`);
    }
    return [];
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

  async deleteAll() {
    const userId = await getUserId();
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId);
    handleError(error, '입출고 전체 삭제');
  },
};
