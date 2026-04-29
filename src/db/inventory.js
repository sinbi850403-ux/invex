/**
 * db/inventory.js — 창고 이동 (Transfers) + 재고 실사 (Stocktakes)
 *                   창고별 현재고 (item_stocks) + 안전재고 (safety_stocks)
 */

import { supabase } from '../supabase-client.js';
import { getUserId, handleError } from './core.js';

// ============================================================
// 창고 이동 (Transfers)
// ============================================================
export const transfers = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('transfers')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    handleError(error, '이동 이력 조회');
    return data || [];
  },

  async create(transfer) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('transfers')
      .insert({ ...transfer, user_id: userId })
      .select()
      .single();
    handleError(error, '이동 등록');
    return data;
  },

  async bulkUpsert(transfersArray) {
    const userId = await getUserId();
    const rows = transfersArray.map(t => ({ ...t, user_id: userId }));
    const { error } = await supabase
      .from('transfers')
      .upsert(rows, { onConflict: 'id' });
    handleError(error, '창고 이동 일괄 저장');
  },

  /**
   * 해당 사용자의 이동 이력 전체 삭제 (설정 페이지 초기화용)
   */
  async deleteAll() {
    const userId = await getUserId();
    const { error } = await supabase
      .from('transfers')
      .delete()
      .eq('user_id', userId);
    handleError(error, '창고 이동 전체 삭제');
  },
};

// ============================================================
// 재고 실사 (Stocktakes)
// ============================================================
export const stocktakes = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('stocktakes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    handleError(error, '실사 이력 조회');
    return data || [];
  },

  async create(stocktake) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('stocktakes')
      .insert({ ...stocktake, user_id: userId })
      .select()
      .single();
    handleError(error, '실사 등록');
    return data;
  },
};

// ============================================================
// 창고별 현재고 캐시 (item_stocks)
// DB 트리거가 자동 갱신 — 직접 쓰기보다 읽기 위주
// ============================================================
export const itemStocks = {
  async listAll() {
    const userId = await getUserId();
    const pageSize = 1000;
    let allData = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from('item_stocks')
        .select('item_id, warehouse_id, quantity, last_updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(pageSize)
        .offset(offset);

      handleError(error, '현재고 조회');
      if (!data || data.length === 0) break;

      allData = allData.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return allData.map(r => ({
      itemId:        r.item_id,
      warehouseId:   r.warehouse_id,
      quantity:      r.quantity,
      lastUpdatedAt: r.last_updated_at,
    }));
  },

  async byItem(itemId) {
    const userId = await getUserId();
    const pageSize = 1000;
    let allData = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from('item_stocks')
        .select('item_id, warehouse_id, quantity, last_updated_at')
        .eq('user_id', userId)
        .eq('item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(pageSize)
        .offset(offset);

      handleError(error, '품목 현재고 조회');
      if (!data || data.length === 0) break;

      allData = allData.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return allData.map(r => ({
      itemId:        r.item_id,
      warehouseId:   r.warehouse_id,
      quantity:      r.quantity,
      lastUpdatedAt: r.last_updated_at,
    }));
  },

  // 트리거 누락 등으로 불일치 발생 시 전체 재계산
  async recalculate() {
    const userId = await getUserId();
    const { error } = await supabase.rpc('fn_recalculate_item_stocks', {
      target_user_id: userId,
    });
    handleError(error, '재고 재계산');
  },
};

// ============================================================
// 안전재고 (safety_stocks)
// 기존 user_settings.key='safetyStock' JSON 대체
// ============================================================
export const safetyStocks = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('safety_stocks')
      .select('id, item_id, warehouse_id, min_qty, updated_at')
      .eq('user_id', userId);
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    handleError(error, '안전재고 조회');
    return (data || []).map(r => ({
      id:          r.id,
      itemId:      r.item_id,
      warehouseId: r.warehouse_id,
      minQty:      r.min_qty,
      updatedAt:   r.updated_at,
    }));
  },

  async upsert(itemId, minQty, warehouseId = null) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('safety_stocks')
      .upsert(
        { user_id: userId, item_id: itemId, warehouse_id: warehouseId, min_qty: minQty },
        { onConflict: 'user_id,item_id,warehouse_id' }
      )
      .select()
      .single();
    handleError(error, '안전재고 설정');
    return data;
  },

  async delete(itemId, warehouseId = null) {
    const userId = await getUserId();
    let query = supabase
      .from('safety_stocks')
      .delete()
      .eq('user_id', userId)
      .eq('item_id', itemId);
    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    } else {
      query = query.is('warehouse_id', null);
    }
    const { error } = await query;
    handleError(error, '안전재고 삭제');
  },

  // 기존 safetyStock {품목명: 수량} 객체를 safety_stocks 테이블로 마이그레이션 (1회성)
  async migrateFromLegacy(safetyStockObj, items) {
    const userId = await getUserId();
    const rows = [];
    for (const [itemName, minQty] of Object.entries(safetyStockObj)) {
      const item = items.find(i => (i.itemName || i.item_name) === itemName);
      if (!item || !minQty) continue;
      rows.push({
        user_id:      userId,
        item_id:      item._id || item.id,
        warehouse_id: null,
        min_qty:      minQty,
      });
    }
    if (!rows.length) return;
    const { error } = await supabase
      .from('safety_stocks')
      .upsert(rows, { onConflict: 'user_id,item_id,warehouse_id' });
    handleError(error, '안전재고 마이그레이션');
  },
};
