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

/**
 * 에러 핸들링 유틸 — Supabase 에러를 통일된 형태로 변환
 */
function handleError(error, context) {
  if (error) {
    console.error(`[DB] ${context}:`, error.message);
    throw new Error(`${context}: ${error.message}`);
  }
}

/**
 * 현재 로그인한 사용자 ID를 안전하게 가져오기
 */
async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');
  return user.id;
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
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('id', itemId)
      .single();
    handleError(error, '품목 상세 조회');
    return data;
  },

  /**
   * 품목 생성
   * @param {Object} item - { item_name, category, quantity, ... }
   */
  async create(item) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('items')
      .insert({ ...item, user_id: userId })
      .select()
      .single();
    handleError(error, '품목 생성');
    return data;
  },

  /**
   * 품목 여러 건 일괄 생성 (엑셀 업로드용)
   * 왜 upsert? → 같은 품목명이 이미 있으면 업데이트, 없으면 생성
   */
  async bulkUpsert(itemsArray) {
    const userId = await getUserId();
    const rows = itemsArray.map(item => ({
      ...item,
      user_id: userId,
    }));

    // 500개씩 배치 처리 — Supabase 요청 크기 제한 대응
    const BATCH_SIZE = 500;
    const results = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
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
    const { data, error } = await supabase
      .from('items')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single();
    handleError(error, '품목 수정');
    return data;
  },

  /**
   * 품목 삭제
   */
  async remove(itemId) {
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId);
    handleError(error, '품목 삭제');
  },

  /**
   * 여러 품목 일괄 삭제
   */
  async bulkRemove(itemIds) {
    const { error } = await supabase
      .from('items')
      .delete()
      .in('id', itemIds);
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
    const { data, error } = await supabase
      .from('transactions')
      .insert(rows)
      .select();
    handleError(error, '입출고 일괄 등록');
    return data || [];
  },

  async remove(txId) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', txId);
    handleError(error, '입출고 삭제');
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
    const { data, error } = await supabase
      .from('vendors')
      .update(updates)
      .eq('id', vendorId)
      .select()
      .single();
    handleError(error, '거래처 수정');
    return data;
  },

  async remove(vendorId) {
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', vendorId);
    handleError(error, '거래처 삭제');
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
    const { data, error } = await supabase
      .from('account_entries')
      .insert({ ...entry, user_id: userId })
      .select()
      .single();
    handleError(error, '장부 등록');
    return data;
  },

  async update(entryId, updates) {
    const { data, error } = await supabase
      .from('account_entries')
      .update(updates)
      .eq('id', entryId)
      .select()
      .single();
    handleError(error, '장부 수정');
    return data;
  },

  async remove(entryId) {
    const { error } = await supabase
      .from('account_entries')
      .delete()
      .eq('id', entryId);
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
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({ ...order, user_id: userId })
      .select()
      .single();
    handleError(error, '발주서 생성');
    return data;
  },

  async update(orderId, updates) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .update(updates)
      .eq('id', orderId)
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
    const { data, error } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', key)
      .single();

    // 설정이 없으면 null 반환 (에러가 아님)
    if (error?.code === 'PGRST116') return null;
    handleError(error, `설정 조회 (${key})`);
    return data?.value ?? null;
  },

  async set(key, value) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' });
    handleError(error, `설정 저장 (${key})`);
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
    const { error } = await supabase
      .from('custom_fields')
      .delete()
      .eq('id', fieldId);
    handleError(error, '커스텀 필드 삭제');
  },
};

// ============================================================
// 전체 데이터 로드 (초기화용) — store.js 호환
// 왜? → 기존 getState()가 전체 데이터를 메모리에 갖고 있는 구조라서
// → 점진적 전환을 위해 한번에 전체 로딩 후 캐시하는 함수 제공
// ============================================================
export async function loadAllData() {
  const [
    itemsData,
    txData,
    vendorsData,
    transfersData,
    stocktakeData,
    auditData,
    accountData,
    orderData,
    posData,
    fieldData,
    settingsData,
  ] = await Promise.all([
    items.list(),
    transactions.list(),
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
    industryTemplate: settingsData.industryTemplate || 'general',
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
    warehouse: dbItem.warehouse,
    location: dbItem.location,
    vendor: dbItem.vendor,
    minStock: dbItem.min_stock,
    expiryDate: dbItem.expiry_date,
    lotNumber: dbItem.lot_number,
    memo: dbItem.memo,
    ...(dbItem.extra || {}),
  };
}

export function storeItemToDb(storeItem) {
  const { _id, itemName, itemCode, unitPrice, supplyValue, totalPrice,
    salePrice, minStock, expiryDate, lotNumber, ...rest } = storeItem;

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
    ...((_id) ? { id: _id } : {}),
    item_name: itemName,
    item_code: itemCode,
    unit_price: unitPrice,
    supply_value: supplyValue,
    total_price: totalPrice,
    sale_price: salePrice,
    min_stock: minStock,
    expiry_date: expiryDate,
    lot_number: lotNumber,
    extra,
    ...known,
  };
}

function dbTxToStoreTx(dbTx) {
  return {
    id: dbTx.id,
    type: dbTx.type,
    itemName: dbTx.item_name,
    quantity: dbTx.quantity,
    unitPrice: dbTx.unit_price,
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
