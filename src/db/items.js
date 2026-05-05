/**
 * db/items.js — 품목 (Items) CRUD
 */

import { supabase } from '../supabase-client.js';
import { getUserId, withDbTimeout, handleError, toNullableNumber, toNullableString, generateClientUuid } from './core.js';

const normalizeItemCode = (value) => String(value ?? '').replace(/\s+/g, '').trim().toLowerCase();
const normalizeItemName = (value) => String(value ?? '').trim().toLowerCase();
const preferValue = (prev, next) => {
  const p = String(prev ?? '').trim();
  const n = String(next ?? '').trim();
  if (!p && n) return next;
  return prev;
};

// ============================================================
// 품목 (Items) CRUD
// ============================================================
export const items = {
  /**
   * 전체 품목 조회
   * @param {Object} options - { category, warehouse, vendor, search, orderBy, limit }
   */
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('items')
      .select('*')
      .eq('user_id', userId);

    // 필터 적용
    if (options.category) query = query.eq('category', options.category);
    if (options.warehouse) query = query.eq('warehouse', options.warehouse);
    if (options.vendor) query = query.eq('vendor', options.vendor);
    if (options.search) query = query.ilike('item_name', `%${options.search}%`);

    // 정렬
    if (options.orderBy) {
      const [col, dir] = options.orderBy.split(':');
      query = query.order(col, { ascending: dir !== 'desc' });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // 페이지네이션
    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1);

    const { data, error } = await query;
    handleError(error, '품목 조회');
    return data || [];
  },

  /**
   * 품목 1건 조회
   */
  async get(itemId) {
    const userId = await getUserId();
    const { data, error } = await withDbTimeout(
      supabase.from('items').select('*').eq('id', itemId).eq('user_id', userId).single(),
      '품목 상세 조회'
    );
    handleError(error, '품목 상세 조회');
    return data;
  },

  /**
   * 품목 생성
   * @param {Object} item - { itemName, category, unit, ... } (camelCase)
   */
  async create(item) {
    const userId = await getUserId();
    // camelCase → snake_case 변환
    const row = {
      user_id: userId,
      item_name: toNullableString(item?.itemName),
      item_code: toNullableString(item?.itemCode),
      item_code_norm: normalizeItemCode(item?.itemCode) || null,
      category: toNullableString(item?.category),
      unit: toNullableString(item?.unit || 'EA'),
      unit_price: toNullableNumber(item?.unitPrice),
      sale_price: toNullableNumber(item?.salePrice),
      spec: toNullableString(item?.spec),
      color: toNullableString(item?.color),
      warehouse: toNullableString(item?.warehouse),
      warehouse_id: item?.warehouseId,
      location: toNullableString(item?.location),
      vendor: toNullableString(item?.vendor),
      min_stock: toNullableNumber(item?.minStock),
      memo: toNullableString(item?.memo),
    };
    // warehouse_id FK: fix-security-perf-2026-04.sql V008-ext 적용 후 활성화
    const { data, error } = await withDbTimeout(
      supabase.from('items').insert(row).select().single(),
      '품목 생성'
    );
    handleError(error, '품목 생성');
    return data;
  },

  /**
   * 품목 여러 건 일괄 생성 (엑셀 업로드용)
   * 왜 upsert? → 같은 품목명이 이미 있으면 업데이트, 없으면 생성
   */
  async bulkUpsert(itemsArray) {
    const userId = await getUserId();
    const rows = itemsArray.map((item) => {
      const itemCode = toNullableString(item?.item_code);
      const payload = {
        user_id: userId,
        item_name: toNullableString(item?.item_name),
        item_code: itemCode,
        item_code_norm: normalizeItemCode(itemCode) || null,
        category: toNullableString(item?.category),
        quantity: toNullableNumber(item?.quantity),
        unit: toNullableString(item?.unit),
        unit_price: toNullableNumber(item?.unit_price),
        supply_value: toNullableNumber(item?.supply_value),
        vat: toNullableNumber(item?.vat),
        total_price: toNullableNumber(item?.total_price),
        sale_price: toNullableNumber(item?.sale_price),
        warehouse: toNullableString(item?.warehouse),
        location: toNullableString(item?.location),
        vendor: toNullableString(item?.vendor),
        min_stock: toNullableNumber(item?.min_stock),
        expiry_date: toNullableString(item?.expiry_date),
        lot_number: toNullableString(item?.lot_number),
        memo: toNullableString(item?.memo),
        asset_type: toNullableString(item?.asset_type),
        spec: toNullableString(item?.spec),
        extra: item?.extra && typeof item.extra === 'object' ? item.extra : {},
      };

      const rawId = item?.id;
      if (rawId !== null && rawId !== undefined && String(rawId).trim() !== '') {
        payload.id = rawId;
      }
      return payload;
    });
    const dedupedMap = new Map();
    rows.forEach((row) => {
      const normalizedName = normalizeItemName(row.item_name);
      const normalizedCode = normalizeItemCode(row.item_code);
      if (!normalizedName && !normalizedCode) return;
      const key = normalizedCode ? `${userId}::code::${normalizedCode}` : `${userId}::name::${normalizedName}`;
      const existing = dedupedMap.get(key);
      if (!existing) {
        dedupedMap.set(key, {
          ...row,
          item_name: String(row.item_name ?? '').trim(),
          item_code_norm: normalizedCode || null,
        });
        return;
      }
      // Same item_name rows can come from mixed sources; never let blank fields overwrite filled fields.
      const merged = { ...existing, ...row };
      merged.item_name = String(existing.item_name ?? row.item_name ?? '').trim();
      merged.item_code = preferValue(existing.item_code, row.item_code);
      merged.item_code_norm = normalizeItemCode(merged.item_code) || null;
      merged.vendor = preferValue(existing.vendor, row.vendor);
      merged.category = preferValue(existing.category, row.category);
      merged.spec = preferValue(existing.spec, row.spec);
      merged.color = preferValue(existing.color, row.color);
      merged.unit = preferValue(existing.unit, row.unit);
      merged.warehouse = preferValue(existing.warehouse, row.warehouse);
      dedupedMap.set(key, merged);
    });
    const dedupedRows = [...dedupedMap.values()];

    const existingIdByCode = new Map();
    const existingIdByNameNoCode = new Map();
    const codes = dedupedRows.map((row) => row.item_code_norm).filter(Boolean);
    const names = dedupedRows.filter((row) => !row.item_code_norm).map((row) => row.item_name).filter(Boolean);
    const QUERY_BATCH = 120;

    const isBatchRequestTooLarge = (error) => {
      const message = String(error?.message || '').toLowerCase();
      return (
        message.includes('bad request') ||
        message.includes('uri too long') ||
        message.includes('request-uri too large') ||
        message.includes('payload too large') ||
        message.includes('query')
      );
    };

    const fetchExistingBatch = async (batchValues, useCode, offsetLabel = 0) => {
      if (!batchValues.length) return [];
      const { data, error } = await supabase
        .from('items')
        .select('id,item_name,item_code_norm')
        .eq('user_id', userId)
        .in(useCode ? 'item_code_norm' : 'item_name', batchValues);

      if (!error) return data || [];

      if (batchValues.length > 1 && isBatchRequestTooLarge(error)) {
        const mid = Math.ceil(batchValues.length / 2);
        const left = await fetchExistingBatch(batchValues.slice(0, mid), useCode, offsetLabel);
        const right = await fetchExistingBatch(batchValues.slice(mid), useCode, offsetLabel + mid);
        return [...left, ...right];
      }

      handleError(error, `기존 품목 ID 조회(${offsetLabel}~${offsetLabel + batchValues.length})`);
      return [];
    };

    for (let i = 0; i < codes.length; i += QUERY_BATCH) {
      const codeBatch = codes.slice(i, i + QUERY_BATCH);
      if (!codeBatch.length) continue;
      const existingRows = await fetchExistingBatch(codeBatch, true, i);
      existingRows.forEach((row) => {
        const key = normalizeItemCode(row.item_code_norm);
        if (key && row.id) existingIdByCode.set(key, row.id);
      });
    }

    for (let i = 0; i < names.length; i += QUERY_BATCH) {
      const nameBatch = names.slice(i, i + QUERY_BATCH);
      if (!nameBatch.length) continue;
      const existingRows = await fetchExistingBatch(nameBatch, false, i);
      existingRows.forEach((row) => {
        const key = normalizeItemName(row.item_name);
        if (key && row.id && !row.item_code_norm) existingIdByNameNoCode.set(key, row.id);
      });
    }

    dedupedRows.forEach((row) => {
      const hasId = row.id !== null && row.id !== undefined && String(row.id).trim() !== '';
      if (hasId) return;
      const existingId = row.item_code_norm
        ? existingIdByCode.get(normalizeItemCode(row.item_code_norm))
        : existingIdByNameNoCode.get(normalizeItemName(row.item_name));
      row.id = existingId || generateClientUuid();
    });

    // warehouse_id FK 듀얼라이트: fix-security-perf-2026-04.sql 적용(V008-ext) 후 아래 주석 해제
    // const warehouseNames = dedupedRows.map(r => r.warehouse).filter(Boolean);
    // const warehouseMap = await resolveFKMap('warehouses', 'name', userId, warehouseNames);
    // dedupedRows.forEach(row => { const wid = warehouseMap[row.warehouse]; if (wid) row.warehouse_id = wid; });

    // 500개씩 배치 처리 — Supabase 요청 크기 제한 대응
    const BATCH_SIZE = 500;
    const results = [];

    for (let i = 0; i < dedupedRows.length; i += BATCH_SIZE) {
      const batch = dedupedRows.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase
        .from('items')
        .upsert(batch)
        .select();
      handleError(error, `품목 일괄 저장(${i}~${i + batch.length})`);
      results.push(...(data || []));
    }

    return results;
  },

  /**
   * 품목 수정
   */
  async update(itemId, updates) {
    const userId = await getUserId();
    const nextUpdates = { ...updates };
    if (Object.prototype.hasOwnProperty.call(nextUpdates, 'item_code')) {
      nextUpdates.item_code_norm = normalizeItemCode(nextUpdates.item_code) || null;
    }
    // warehouse_id FK: fix-security-perf-2026-04.sql V008-ext 적용 후 활성화
    const { data, error } = await supabase
      .from('items')
      .update(nextUpdates)
      .eq('id', itemId)
      .eq('user_id', userId)
      .select()
      .single();
    handleError(error, '품목 수정');
    return data;
  },

  /**
   * 품목 삭제
   */
  async remove(itemId) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId);
    handleError(error, '품목 삭제');
  },

  /**
   * 여러 품목 일괄 삭제
   */
  async bulkRemove(itemIds) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('items')
      .delete()
      .in('id', itemIds)
      .eq('user_id', userId);
    handleError(error, '품목 일괄 삭제');
  },

  /**
   * 품목 수 (요금제 제한 체크용)
   */
  async count() {
    const userId = await getUserId();
    const { count, error } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    handleError(error, '품목 수 조회');
    return count || 0;
  },
};
