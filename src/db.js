/**
 * db.js - Supabase 데이터 접근 레이어 (DAL)
 *
 * 왜 별도 레이어?
 * → 페이지 코드가 직접 SQL을 쓰면 유지보수 지옥
 * → db.items.list(), db.transactions.create() 같은 깔끔한 API 제공
 * → 나중에 DB를 바꿔도 이 파일만 수정하면 됨
 *
 * 구조: db.{테이블}.{동작}() — CRUD 패턴
 */

import { supabase, isSupabaseConfigured } from './supabase-client.js';

const DB_TIMEOUT_MS = 15_000;
const USER_ID_CACHE_TTL_MS = 60_000;
let _cachedUserId = null;
let _cachedUserIdAt = 0;

/**
 * 워크스페이스 오너 UID 오버라이드
 * — 팀 멤버로 접속 시 오너의 user_id로 쿼리하기 위해 사용
 * — main.js에서 로그인 후 setWorkspaceUserId() 호출로 주입
 */
let _workspaceUserId = null;

export function setWorkspaceUserId(uid) {
  _workspaceUserId = uid || null;
}

export function clearWorkspaceUserId() {
  _workspaceUserId = null;
}

/**
 * 로그인 직후 uid를 캐시에 주입 — getUserId()의 getSession 재호출 타이밍 경쟁 방지
 */
export function primeUserIdCache(uid) {
  if (uid) {
    _cachedUserId = uid;
    _cachedUserIdAt = Date.now();
  }
}

/**
 * Supabase 쿼리에 타임아웃을 적용하는 래퍼
 * 왜 필요? → 네트워크 지연 시 무한 대기 → UI 스피너 갇힘 방지
 */
function withDbTimeout(queryPromise, label = 'DB query') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout (${DB_TIMEOUT_MS}ms)`)), DB_TIMEOUT_MS);
  });
  return Promise.race([queryPromise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 에러 핸들링 유틸 — Supabase 에러를 통일된 형태로 변환
 */
function handleError(error, context) {
  if (error) {
    console.error(`[DB] ${context}:`, error.message);
    throw new Error(`${context}: ${error.message}`);
  }
}

function toNullableNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/,/g, '').trim();
  if (!normalized || normalized === '-' || normalized.toLowerCase() === 'nan') return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function toNullableString(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function generateClientUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 텍스트 이름 배열 → {이름: UUID} 맵 (FK 듀얼라이트 헬퍼)
 * 예: resolveFKMap('warehouses', 'name', userId, ['서울창고', '부산창고'])
 *  → { '서울창고': 'uuid1', '부산창고': 'uuid2' }
 */
async function resolveFKMap(table, nameColumn, userId, names) {
  const unique = [...new Set(names.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await supabase
    .from(table)
    .select(`id,${nameColumn}`)
    .eq('user_id', userId)
    .in(nameColumn, unique);
  return Object.fromEntries((data || []).map(r => [r[nameColumn], r.id]));
}

/**
 * 현재 로그인한 사용자 ID를 안전하게 가져오기
 * — 팀 워크스페이스 소속 시 오너 UID 반환 (_workspaceUserId 우선)
 */
async function getUserId() {
  if (_workspaceUserId) return _workspaceUserId;

  if (_cachedUserId && Date.now() - _cachedUserIdAt < USER_ID_CACHE_TTL_MS) {
    return _cachedUserId;
  }

  const { data: { session } } = await withDbTimeout(supabase.auth.getSession(), 'getSession');
  if (session?.user?.id) {
    _cachedUserId = session.user.id;
    _cachedUserIdAt = Date.now();
    return _cachedUserId;
  }

  const { data: { user } } = await withDbTimeout(supabase.auth.getUser(), 'getUser');
  if (!user) throw new Error('로그인이 필요합니다');

  _cachedUserId = user.id;
  _cachedUserIdAt = Date.now();
  return _cachedUserId;
}

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
   * @param {Object} item - { item_name, category, quantity, ... }
   */
  async create(item) {
    const userId = await getUserId();
    const warehouseMap = await resolveFKMap('warehouses', 'name', userId, [item?.warehouse]);
    const { data, error } = await withDbTimeout(
      supabase.from('items').insert({
        ...item,
        user_id: userId,
        warehouse_id: warehouseMap[item?.warehouse] ?? null,
      }).select().single(),
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
      const payload = {
        user_id: userId,
        item_name: toNullableString(item?.item_name),
        item_code: toNullableString(item?.item_code),
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
    const normalizeItemName = (value) => String(value ?? '').trim().toLowerCase();
    rows.forEach((row) => {
      const normalizedName = normalizeItemName(row.item_name);
      if (!normalizedName) return;
      const key = `${userId}::${normalizedName}`;
      dedupedMap.set(key, { ...row, item_name: String(row.item_name ?? '').trim() });
    });
    const dedupedRows = [...dedupedMap.values()];

    const existingIdByName = new Map();
    const names = dedupedRows.map((row) => row.item_name).filter(Boolean);
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

    const fetchExistingByNameBatch = async (nameBatch, offsetLabel = 0) => {
      if (!nameBatch.length) return [];
      const { data, error } = await supabase
        .from('items')
        .select('id,item_name')
        .eq('user_id', userId)
        .in('item_name', nameBatch);

      if (!error) return data || [];

      if (nameBatch.length > 1 && isBatchRequestTooLarge(error)) {
        const mid = Math.ceil(nameBatch.length / 2);
        const left = await fetchExistingByNameBatch(nameBatch.slice(0, mid), offsetLabel);
        const right = await fetchExistingByNameBatch(nameBatch.slice(mid), offsetLabel + mid);
        return [...left, ...right];
      }

      handleError(error, `기존 품목 ID 조회(${offsetLabel}~${offsetLabel + nameBatch.length})`);
      return [];
    };

    for (let i = 0; i < names.length; i += QUERY_BATCH) {
      const nameBatch = names.slice(i, i + QUERY_BATCH);
      if (!nameBatch.length) continue;
      const existingRows = await fetchExistingByNameBatch(nameBatch, i);
      existingRows.forEach((row) => {
        const key = normalizeItemName(row.item_name);
        if (key && row.id) existingIdByName.set(key, row.id);
      });
    }

    dedupedRows.forEach((row) => {
      const hasId = row.id !== null && row.id !== undefined && String(row.id).trim() !== '';
      if (hasId) return;
      const existingId = existingIdByName.get(normalizeItemName(row.item_name));
      row.id = existingId || generateClientUuid();
    });

    // warehouse_id FK 듀얼라이트 (배치 조회로 N+1 방지)
    const warehouseNames = dedupedRows.map(r => r.warehouse).filter(Boolean);
    const warehouseMap = await resolveFKMap('warehouses', 'name', userId, warehouseNames);
    dedupedRows.forEach(row => { row.warehouse_id = warehouseMap[row.warehouse] ?? null; });

    // 500개씩 배치 처리 — Supabase 요청 크기 제한 대응
    const BATCH_SIZE = 500;
    const results = [];

    for (let i = 0; i < dedupedRows.length; i += BATCH_SIZE) {
      const batch = dedupedRows.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase
        .from('items')
        .upsert(batch, { onConflict: 'user_id,item_name' })
        .select();
      handleError(error, `품목 일괄 저장 (${i}~${i + batch.length})`);
      results.push(...(data || []));
    }

    return results;
  },

  /**
   * 품목 수정
   */
  async update(itemId, updates) {
    const userId = await getUserId();
    if ('warehouse' in updates) {
      const warehouseMap = await resolveFKMap('warehouses', 'name', userId, [updates.warehouse]);
      updates = { ...updates, warehouse_id: warehouseMap[updates.warehouse] ?? null };
    }
    const { data, error } = await supabase
      .from('items')
      .update(updates)
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
    const rows = txArray.map(tx => ({ ...tx, user_id: userId }));
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

// ============================================================
// 거래처 (Vendors) CRUD
// ============================================================
export const vendors = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', userId)
      .order('name');
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

// ============================================================
// 창고 이동 (Transfers)
// ============================================================
export const transfers = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
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
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('account_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    handleError(error, '장부 조회');
    return data || [];
  },

  async create(entry) {
    const userId = await getUserId();
    const vendorMap = await resolveFKMap('vendors', 'name', userId, [entry?.vendor]);
    const { data, error } = await supabase
      .from('account_entries')
      .insert({ ...entry, user_id: userId, vendor_id: vendorMap[entry?.vendor] ?? null })
      .select()
      .single();
    handleError(error, '장부 등록');
    return data;
  },

  async update(entryId, updates) {
    const userId = await getUserId();
    if ('vendor' in updates) {
      const vendorMap = await resolveFKMap('vendors', 'name', userId, [updates.vendor]);
      updates = { ...updates, vendor_id: vendorMap[updates.vendor] ?? null };
    }
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
    const vendorNames = entriesArray.map(e => e?.vendor).filter(Boolean);
    const vendorMap = await resolveFKMap('vendors', 'name', userId, vendorNames);
    const rows = entriesArray.map(e => ({
      ...e,
      user_id: userId,
      vendor_id: vendorMap[e?.vendor] ?? null,
    }));
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
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    handleError(error, '발주서 조회');
    return data || [];
  },

  async create(order) {
    const userId = await getUserId();
    const vendorMap = await resolveFKMap('vendors', 'name', userId, [order?.vendor]);
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({ ...order, user_id: userId, vendor_id: vendorMap[order?.vendor] ?? null })
      .select()
      .single();
    handleError(error, '발주서 생성');
    return data;
  },

  async bulkUpsert(ordersArray) {
    const userId = await getUserId();
    const vendorNames = ordersArray.map(o => o?.vendor).filter(Boolean);
    const vendorMap = await resolveFKMap('vendors', 'name', userId, vendorNames);
    const rows = ordersArray.map(o => ({
      ...o,
      user_id: userId,
      vendor_id: vendorMap[o?.vendor] ?? null,
    }));
    const { error } = await supabase
      .from('purchase_orders')
      .upsert(rows, { onConflict: 'id' });
    handleError(error, '발주서 일괄 저장');
  },

  async update(orderId, updates) {
    const userId = await getUserId();
    if ('vendor' in updates) {
      const vendorMap = await resolveFKMap('vendors', 'name', userId, [updates.vendor]);
      updates = { ...updates, vendor_id: vendorMap[updates.vendor] ?? null };
    }
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

// ============================================================
// 재고 실사 (Stocktakes)
// ============================================================
export const stocktakes = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('stocktakes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
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

// ============================================================
// HR: 직원 마스터
// ============================================================
export const employees = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase.from('employees').select('*').eq('user_id', userId);
    if (options.status) query = query.eq('status', options.status);
    if (options.dept) query = query.eq('dept', options.dept);
    query = query.order('emp_no', { ascending: true });
    const { data, error } = await query;
    handleError(error, '직원 조회');
    return (data || []).map(dbEmployeeToStore);
  },
  async get(id) {
    const userId = await getUserId();
    const { data, error } = await withDbTimeout(
      supabase.from('employees').select('*').eq('id', id).eq('user_id', userId).single(),
      '직원 상세'
    );
    handleError(error, '직원 상세');
    return dbEmployeeToStore(data);
  },
  async create(emp) {
    const userId = await getUserId();
    const rrnPlain = emp._rrnPlain;
    const row = storeEmployeeToDb(emp);
    const { data, error } = await withDbTimeout(
      supabase.from('employees').insert({ ...row, user_id: userId }).select().single(),
      '직원 등록'
    );
    handleError(error, '직원 등록');
    if (rrnPlain && data?.id) {
      const { error: e2 } = await supabase.rpc('set_employee_rrn', { emp_id: data.id, plain: rrnPlain });
      handleError(e2, '주민번호 암호화');
    }
    return dbEmployeeToStore(data);
  },
  async update(id, updates) {
    const userId = await getUserId();
    const rrnPlain = updates._rrnPlain;
    const row = storeEmployeeToDb(updates);
    const { data, error } = await supabase.from('employees').update(row).eq('id', id).eq('user_id', userId).select().single();
    handleError(error, '직원 수정');
    if (rrnPlain) {
      const { error: e2 } = await supabase.rpc('set_employee_rrn', { emp_id: id, plain: rrnPlain });
      handleError(e2, '주민번호 암호화');
    }
    return dbEmployeeToStore(data);
  },
  async remove(id) {
    const userId = await getUserId();
    // 소유권 확인
    const { data: emp } = await supabase.from('employees').select('id').eq('id', id).eq('user_id', userId).single();
    if (!emp) throw new Error('삭제 권한이 없거나 존재하지 않는 직원입니다.');
    // 관련 데이터 cascade 삭제 (FK CASCADE가 없는 경우 대비)
    await supabase.from('attendance').delete().eq('employee_id', id).eq('user_id', userId);
    await supabase.from('payrolls').delete().eq('employee_id', id).eq('user_id', userId);
    const { error } = await supabase.from('employees').delete().eq('id', id).eq('user_id', userId);
    handleError(error, '직원 삭제');
  },
  async bulkUpsert(arr) {
    const userId = await getUserId();
    const rows = arr.map(e => ({ ...storeEmployeeToDb(e), user_id: userId }));
    const { data, error } = await supabase.from('employees')
      .upsert(rows, { onConflict: 'user_id,emp_no' }).select();
    handleError(error, '직원 일괄 저장');
    return (data || []).map(dbEmployeeToStore);
  },
  /** 주민번호 평문 조회 (admin 전용, 소유권 검증 후 RPC 호출) */
  async getRRN(id) {
    const userId = await getUserId();
    // 이 직원이 현재 사용자 소유인지 먼저 확인
    const { data: emp } = await supabase.from('employees').select('id').eq('id', id).eq('user_id', userId).single();
    if (!emp) throw new Error('조회 권한이 없습니다.');
    const { data, error } = await supabase.rpc('decrypt_rrn', { emp_id: id });
    handleError(error, '주민번호 조회');
    return data;
  },
};

// ============================================================
// HR: 일별 근태
// ============================================================
export const attendance = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase.from('attendance').select('*').eq('user_id', userId);
    if (options.employeeId) query = query.eq('employee_id', options.employeeId);
    if (options.from) query = query.gte('work_date', options.from);
    if (options.to)   query = query.lte('work_date', options.to);
    query = query.order('work_date', { ascending: false });
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    handleError(error, '근태 조회');
    return (data || []).map(dbAttendanceToStore);
  },
  async create(rec) {
    const userId = await getUserId();
    const row = storeAttendanceToDb(rec);
    const { data, error } = await supabase.from('attendance')
      .upsert({ ...row, user_id: userId }, { onConflict: 'user_id,employee_id,work_date' })
      .select().single();
    handleError(error, '근태 저장');
    return dbAttendanceToStore(data);
  },
  async update(id, updates) {
    const userId = await getUserId();
    const row = storeAttendanceToDb(updates);
    const { data, error } = await supabase.from('attendance').update(row).eq('id', id).eq('user_id', userId).select().single();
    handleError(error, '근태 수정');
    return dbAttendanceToStore(data);
  },
  async remove(id) {
    const userId = await getUserId();
    const { error } = await supabase.from('attendance').delete().eq('id', id).eq('user_id', userId);
    handleError(error, '근태 삭제');
  },
  async bulkUpsert(arr) {
    const userId = await getUserId();
    const rows = arr.map(r => ({ ...storeAttendanceToDb(r), user_id: userId }));
    const { data, error } = await supabase.from('attendance')
      .upsert(rows, { onConflict: 'user_id,employee_id,work_date' }).select();
    handleError(error, '근태 일괄 저장');
    return (data || []).map(dbAttendanceToStore);
  },
};

// ============================================================
// HR: 월별 급여
// ============================================================
export const payrolls = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase.from('payrolls').select('*').eq('user_id', userId);
    const year  = options.payYear  ?? options.year;
    const month = options.payMonth ?? options.month;
    if (year)  query = query.eq('pay_year', year);
    if (month) query = query.eq('pay_month', month);
    if (options.status) query = query.eq('status', options.status);
    if (options.employeeId) query = query.eq('employee_id', options.employeeId);
    query = query.order('pay_year', { ascending: false }).order('pay_month', { ascending: false });
    const { data, error } = await query;
    handleError(error, '급여 조회');
    return (data || []).map(dbPayrollToStore);
  },
  async create(p) {
    const userId = await getUserId();
    const row = storePayrollToDb(p);
    const { data, error } = await supabase.from('payrolls')
      .upsert({ ...row, user_id: userId }, { onConflict: 'user_id,pay_year,pay_month,employee_id' })
      .select().single();
    handleError(error, '급여 저장');
    return dbPayrollToStore(data);
  },
  async update(id, updates) {
    const userId = await getUserId();
    const row = storePayrollToDb(updates);
    const { data, error } = await supabase.from('payrolls').update(row).eq('id', id).eq('user_id', userId).select().single();
    handleError(error, '급여 수정');
    return dbPayrollToStore(data);
  },
  async remove(id) {
    const userId = await getUserId();
    const { error } = await supabase.from('payrolls').delete().eq('id', id).eq('user_id', userId);
    handleError(error, '급여 삭제');
  },
  async bulkUpsert(arr) {
    const userId = await getUserId();
    const rows = arr.map(r => ({ ...storePayrollToDb(r), user_id: userId }));
    const { data, error } = await supabase.from('payrolls')
      .upsert(rows, { onConflict: 'user_id,pay_year,pay_month,employee_id' }).select();
    handleError(error, '급여 일괄 저장');
    return (data || []).map(dbPayrollToStore);
  },
};

// ============================================================
// HR: 휴가
// ============================================================
export const leaves = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase.from('leaves').select('*').eq('user_id', userId);
    if (options.employeeId) query = query.eq('employee_id', options.employeeId);
    if (options.status) query = query.eq('status', options.status);
    query = query.order('start_date', { ascending: false });
    const { data, error } = await query;
    handleError(error, '휴가 조회');
    return (data || []).map(dbLeaveToStore);
  },
  async create(l) {
    const userId = await getUserId();
    const row = storeLeaveToDb(l);
    const { data, error } = await supabase.from('leaves').insert({ ...row, user_id: userId }).select().single();
    handleError(error, '휴가 신청');
    return dbLeaveToStore(data);
  },
  async update(id, updates) {
    const userId = await getUserId();
    const row = storeLeaveToDb(updates);
    const { data, error } = await supabase.from('leaves').update(row).eq('id', id).eq('user_id', userId).select().single();
    handleError(error, '휴가 수정');
    return dbLeaveToStore(data);
  },
  async remove(id) {
    const userId = await getUserId();
    const { error } = await supabase.from('leaves').delete().eq('id', id).eq('user_id', userId);
    handleError(error, '휴가 삭제');
  },
};

// ============================================================
// HR: 수당·공제 마스터
// ============================================================
export const salaryItems = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase.from('salary_items').select('*').eq('user_id', userId).order('sort_order');
    handleError(error, '수당/공제 조회');
    return data || [];
  },
  async create(item) {
    const userId = await getUserId();
    const { data, error } = await supabase.from('salary_items').insert({ ...item, user_id: userId }).select().single();
    handleError(error, '수당/공제 생성');
    return data;
  },
  async update(id, updates) {
    const userId = await getUserId();
    const { data, error } = await supabase.from('salary_items').update(updates).eq('id', id).eq('user_id', userId).select().single();
    handleError(error, '수당/공제 수정');
    return data;
  },
  async remove(id) {
    const userId = await getUserId();
    const { error } = await supabase.from('salary_items').delete().eq('id', id).eq('user_id', userId);
    handleError(error, '수당/공제 삭제');
  },
};

// ============================================================
// 전체 데이터 로드 (초기화용) — store.js 호환
// 왜? → 기존 getState()가 전체 데이터를 메모리에 갖고 있는 구조라서
// → 점진적 전환을 위해 한번에 전체 로딩 후 캐시하는 함수 제공
// ============================================================
export async function loadAllData() {
  const labels = ['items', 'transactions', 'vendors', 'transfers', 'stocktakes',
    'auditLogs', 'accountEntries', 'purchaseOrders', 'posSales', 'customFields', 'settings'];

  // Supabase PostgREST 기본 상한(1000행) 해제
  // — limit(N) 미지정 시 1000건에서 잘려 데이터 누락이 발생하는 것을 방지
  // — 품목·트랜잭션이 수만 건이어도 전부 로드 (성능 이슈가 생기면 페이지네이션으로 전환)
  const ALL_ROWS = { limit: 1_000_000 };

  const results = await Promise.allSettled([
    items.list(ALL_ROWS),
    transactions.list(ALL_ROWS),
    vendors.list(),
    transfers.list(),
    stocktakes.list(),
    auditLogs.list({ limit: 200 }),
    accountEntries.list(),
    purchaseOrders.list(),
    posSales.list({ limit: 1000 }),
    customFields.list(),
    settings.getAll(),
  ]);
  const pick = (idx, fallback) => {
    const r = results[idx];
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[loadAllData] ${labels[idx]} 로드 실패:`, r.reason?.message || r.reason);
    return fallback;
  };

  const itemsData = pick(0, []);
  const txData = pick(1, []);
  const vendorsData = pick(2, []);
  const transfersData = pick(3, []);
  const stocktakeData = pick(4, []);
  const auditData = pick(5, []);
  const accountData = pick(6, []);
  const orderData = pick(7, []);
  const posData = pick(8, []);
  const fieldData = pick(9, []);
  const settingsData = pick(10, {});

  // 기존 store.js의 state 형태로 변환
  // 왜 이렇게? → 60개 페이지 파일이 getState()를 쓰고 있어서
  // 한번에 전부 바꾸기보다 점진적으로 전환하기 위해
  return {
    mappedData: itemsData.map(dbItemToStoreItem),
    transactions: txData.map(dbTxToStoreTx),
    vendorMaster: vendorsData.map(dbVendorToStore),
    transfers: transfersData,
    stocktakeHistory: stocktakeData,
    auditLogs: auditData,
    accountEntries: accountData,
    purchaseOrders: orderData,
    posData: posData,
    customFields: fieldData,
    // 설정값
    safetyStock: settingsData.safetyStock || {},
    beginnerMode: settingsData.beginnerMode ?? true,
    dashboardMode: settingsData.dashboardMode || 'executive',
    visibleColumns: settingsData.visibleColumns || null,
    inventoryViewPrefs: settingsData.inventoryViewPrefs || {},
    inoutViewPrefs: settingsData.inoutViewPrefs || {},
    tableSortPrefs: settingsData.tableSortPrefs || {},
    costMethod: settingsData.costMethod || 'weighted-avg',
    currency: settingsData.currency || { code: 'KRW', symbol: '₩', rate: 1 },
  };
}

// ============================================================
// DB ↔ Store 변환 유틸
// DB는 snake_case, 기존 store는 camelCase라서 변환 필요
// ============================================================
function dbItemToStoreItem(dbItem) {
  return {
    _id: dbItem.id,
    itemName: dbItem.item_name,
    itemCode: dbItem.item_code,
    category: dbItem.category,
    quantity: dbItem.quantity,
    unit: dbItem.unit,
    unitPrice: dbItem.unit_price,
    supplyValue: dbItem.supply_value,
    vat: dbItem.vat,
    totalPrice: dbItem.total_price,
    salePrice: dbItem.sale_price,
    sellingPrice: dbItem.sale_price,    // page-inout.js 호환 별칭
    warehouse: dbItem.warehouse,
    location: dbItem.location,
    vendor: dbItem.vendor,
    minStock: dbItem.min_stock,
    expiryDate: dbItem.expiry_date,
    lotNumber: dbItem.lot_number,
    memo: dbItem.memo,
    assetType: dbItem.asset_type,   // 자산 구분
    spec: dbItem.spec,              // 규격
    ...(dbItem.extra || {}),
  };
}

export function storeItemToDb(storeItem) {
  const { _id, itemName, itemCode, unitPrice, supplyValue, totalPrice,
    salePrice, minStock, expiryDate, lotNumber, assetType, spec, ...rest } = storeItem;

  // 알려진 필드와 커스텀 필드 분리
  const knownKeys = new Set([
    'category', 'quantity', 'unit', 'warehouse', 'location', 'vendor', 'vat', 'memo',
  ]);
  const extra = {};
  const known = {};
  Object.entries(rest).forEach(([k, v]) => {
    if (knownKeys.has(k)) known[k] = v;
    else extra[k] = v;
  });

  return {
    ...((_id !== null && _id !== undefined && String(_id).trim() !== '') ? { id: _id } : {}),
    item_name: toNullableString(itemName),
    item_code: toNullableString(itemCode),
    unit_price: toNullableNumber(unitPrice),
    supply_value: toNullableNumber(supplyValue),
    total_price: toNullableNumber(totalPrice),
    sale_price: toNullableNumber(salePrice),
    min_stock: toNullableNumber(minStock),
    expiry_date: toNullableString(expiryDate),
    lot_number: toNullableString(lotNumber),
    asset_type: toNullableString(assetType),   // 자산 구분
    spec: toNullableString(spec),              // 규격
    extra,
    ...known,
  };
}

function dbTxToStoreTx(dbTx) {
  return {
    id: dbTx.id,
    type: dbTx.type,
    itemName: dbTx.item_name,
    itemCode: dbTx.item_code,                       // 상품코드
    quantity: dbTx.quantity,
    unitPrice: dbTx.unit_price,
    supplyValue: dbTx.supply_value,                 // 공급가액
    vat: dbTx.vat,                                  // 부가세
    totalAmount: dbTx.total_amount,                 // 합계금액
    sellingPrice: dbTx.selling_price,               // 출고단가
    actualSellingPrice: dbTx.actual_selling_price,  // 실판매가
    spec: dbTx.spec,                                // 규격
    unit: dbTx.unit,                                // 단위
    category: dbTx.category,                        // 자산구분
    date: dbTx.date,
    vendor: dbTx.vendor,
    warehouse: dbTx.warehouse,
    note: dbTx.note,
  };
}

function dbVendorToStore(dbVendor) {
  return {
    _id: dbVendor.id,
    name: dbVendor.name,
    type: dbVendor.type,
    bizNumber: dbVendor.biz_number,
    ceoName: dbVendor.ceo_name,
    contactName: dbVendor.contact_name,
    phone: dbVendor.phone,
    email: dbVendor.email,
    address: dbVendor.address,
    bankInfo: dbVendor.bank_info,
    memo: dbVendor.memo,
  };
}

// ============================================================
// HR 변환기 (snake_case ↔ camelCase)
// ============================================================
function dbEmployeeToStore(r) {
  if (!r) return null;
  return {
    id: r.id,
    empNo: r.emp_no,
    name: r.name,
    dept: r.dept,
    position: r.position,
    hireDate: r.hire_date,
    resignDate: r.resign_date,
    rrnMask: r.rrn_mask,
    phone: r.phone,
    email: r.email,
    address: r.address,
    bank: r.bank,
    accountNo: r.account_no,
    baseSalary: r.base_salary,
    hourlyWage: r.hourly_wage,
    employmentType: r.employment_type,
    insuranceFlags: r.insurance_flags || { np: true, hi: true, ei: true, wc: true },
    dependents: r.dependents,
    children: r.children,
    annualLeaveTotal: r.annual_leave_total,
    annualLeaveUsed: r.annual_leave_used,
    status: r.status,
    memo: r.memo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function storeEmployeeToDb(e) {
  const out = {};
  if (e.id) out.id = e.id;
  if ('empNo' in e) out.emp_no = e.empNo;
  if ('name' in e) out.name = e.name;
  if ('dept' in e) out.dept = e.dept;
  if ('position' in e) out.position = e.position;
  if ('hireDate' in e) out.hire_date = e.hireDate;
  if ('resignDate' in e) out.resign_date = e.resignDate;
  if ('rrnMask' in e) out.rrn_mask = e.rrnMask;
  if ('phone' in e) out.phone = e.phone;
  if ('email' in e) out.email = e.email;
  if ('address' in e) out.address = e.address;
  if ('bank' in e) out.bank = e.bank;
  if ('accountNo' in e) out.account_no = e.accountNo;
  if ('baseSalary' in e) out.base_salary = e.baseSalary;
  if ('hourlyWage' in e) out.hourly_wage = e.hourlyWage;
  if ('employmentType' in e) out.employment_type = e.employmentType;
  if ('insuranceFlags' in e) out.insurance_flags = e.insuranceFlags;
  if ('dependents' in e) out.dependents = e.dependents;
  if ('children' in e) out.children = e.children;
  if ('annualLeaveTotal' in e) out.annual_leave_total = e.annualLeaveTotal;
  if ('annualLeaveUsed' in e) out.annual_leave_used = e.annualLeaveUsed;
  if ('status' in e) out.status = e.status;
  if ('memo' in e) out.memo = e.memo;
  return out;
}

function dbAttendanceToStore(r) {
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employee_id,
    workDate: r.work_date,
    checkIn: r.check_in,
    checkOut: r.check_out,
    breakMin: r.break_min,
    workMin: r.work_min,
    overtimeMin: r.overtime_min,
    nightMin: r.night_min,
    holidayMin: r.holiday_min,
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
  };
}

function storeAttendanceToDb(a) {
  const out = {};
  if (a.id) out.id = a.id;
  if ('employeeId' in a) out.employee_id = a.employeeId;
  if ('workDate' in a) out.work_date = a.workDate;
  if ('checkIn' in a) out.check_in = a.checkIn;
  if ('checkOut' in a) out.check_out = a.checkOut;
  if ('breakMin' in a) out.break_min = a.breakMin;
  if ('workMin' in a) out.work_min = a.workMin;
  if ('overtimeMin' in a) out.overtime_min = a.overtimeMin;
  if ('nightMin' in a) out.night_min = a.nightMin;
  if ('holidayMin' in a) out.holiday_min = a.holidayMin;
  if ('status' in a) out.status = a.status;
  if ('note' in a) out.note = a.note;
  return out;
}

function dbPayrollToStore(r) {
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employee_id,
    payYear: r.pay_year,
    payMonth: r.pay_month,
    base: r.base,
    allowances: r.allowances || {},
    overtimePay: r.overtime_pay,
    nightPay: r.night_pay,
    holidayPay: r.holiday_pay,
    gross: r.gross,
    np: r.np,
    hi: r.hi,
    ltc: r.ltc,
    ei: r.ei,
    incomeTax: r.income_tax,
    localTax: r.local_tax,
    otherDeduct: r.other_deduct || {},
    totalDeduct: r.total_deduct,
    net: r.net,
    status: r.status,
    paidAt: r.paid_at,
    confirmedBy: r.confirmed_by,
    confirmedAt: r.confirmed_at,
    issueNo: r.issue_no,
    createdAt: r.created_at,
  };
}

function storePayrollToDb(p) {
  const out = {};
  if (p.id) out.id = p.id;
  if ('employeeId' in p) out.employee_id = p.employeeId;
  if ('payYear' in p) out.pay_year = p.payYear;
  if ('payMonth' in p) out.pay_month = p.payMonth;
  if ('base' in p) out.base = p.base;
  if ('allowances' in p) out.allowances = p.allowances;
  if ('overtimePay' in p) out.overtime_pay = p.overtimePay;
  if ('nightPay' in p) out.night_pay = p.nightPay;
  if ('holidayPay' in p) out.holiday_pay = p.holidayPay;
  if ('gross' in p) out.gross = p.gross;
  if ('np' in p) out.np = p.np;
  if ('hi' in p) out.hi = p.hi;
  if ('ltc' in p) out.ltc = p.ltc;
  if ('ei' in p) out.ei = p.ei;
  if ('incomeTax' in p) out.income_tax = p.incomeTax;
  if ('localTax' in p) out.local_tax = p.localTax;
  if ('otherDeduct' in p) out.other_deduct = p.otherDeduct;
  if ('totalDeduct' in p) out.total_deduct = p.totalDeduct;
  if ('net' in p) out.net = p.net;
  if ('status' in p) out.status = p.status;
  if ('paidAt' in p) out.paid_at = p.paidAt;
  if ('confirmedBy' in p) out.confirmed_by = p.confirmedBy;
  if ('confirmedAt' in p) out.confirmed_at = p.confirmedAt;
  if ('issueNo' in p) out.issue_no = p.issueNo;
  return out;
}

function dbLeaveToStore(r) {
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employee_id,
    leaveType: r.leave_type,
    startDate: r.start_date,
    endDate: r.end_date,
    days: r.days,
    reason: r.reason,
    status: r.status,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    createdAt: r.created_at,
  };
}

function storeLeaveToDb(l) {
  const out = {};
  if (l.id) out.id = l.id;
  if ('employeeId' in l) out.employee_id = l.employeeId;
  if ('leaveType' in l) out.leave_type = l.leaveType;
  if ('startDate' in l) out.start_date = l.startDate;
  if ('endDate' in l) out.end_date = l.endDate;
  if ('days' in l) out.days = l.days;
  if ('reason' in l) out.reason = l.reason;
  if ('status' in l) out.status = l.status;
  if ('approvedBy' in l) out.approved_by = l.approvedBy;
  if ('approvedAt' in l) out.approved_at = l.approvedAt;
  return out;
}


/**
 * 현재 사용자의 모든 데이터 삭제 (회원탈퇴/초기화용)
 * 각 테이블에서 user_id = auth.uid() 인 데이터를 순서대로 삭제
 */
export async function clearAllUserData() {
  const userId = await getUserId();
  if (!userId) throw new Error('로그인이 필요합니다.');

  const tables = [
    'salary_items', 'leaves', 'payrolls', 'attendance', 'employees',
    'pos_sales', 'purchase_orders', 'account_entries',
    'audit_logs', 'stocktakes', 'transfers', 'vendors',
    'transactions', 'items', 'user_settings', 'custom_fields',
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) console.warn(`[clearAllUserData] ${table} 삭제 경고:`, error.message);
  }
}
