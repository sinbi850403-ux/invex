/**
 * db/loader.js — 전체 데이터 로드 + 전체 삭제
 *
 * 전체 데이터 로드 (초기화용) — store.js 호환
 * 왜? → 기존 getState()가 전체 데이터를 메모리에 갖고 있는 구조라서
 * → 점진적 전환을 위해 한번에 전체 로딩 후 캐시하는 함수 제공
 *
 * 주의: Supabase PostREST API는 RLS 적용 시 1000행 하드 제한 → 페이지네이션 필수
 */

import { supabase } from '../supabase-client.js';
import { getUserId, getAuthUserId } from './core.js';
import { items } from './items.js';
import { transactions } from './transactions.js';
import { vendors } from './vendors.js';
import { transfers, stocktakes, itemStocks, safetyStocks } from './inventory.js';
import { auditLogs, accountEntries, purchaseOrders, posSales } from './accounts.js';
import { settings, customFields } from './settings.js';
import { dbItemToStoreItem, dbTxToStoreTx, dbVendorToStore, dbTransferToStore } from './converters.js';
import { enrichItemsWithQty } from '../domain/inventoryStockCalc.js';

// Supabase PostREST API 페이지네이션 (1000행 제한)
async function _fetchAllPages(table, maxLimit = 100000) {
  const userId = await getUserId();
  const pageSize = 1000;
  let allData = [];
  let offset = 0;

  // 테이블별 정렬 필드 정의
  const orderFields = {
    transactions: 'date',
    transfers: 'date',
    stocktakes: 'created_at',
    items: 'created_at',
    vendors: 'created_at',
    account_entries: 'created_at',
    purchase_orders: 'created_at',
    safety_stocks: 'created_at',
  };
  const orderField = orderFields[table] || 'created_at';

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order(orderField, { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error(`[_fetchAllPages] ${table} 조회 실패:`, error.message);
      throw error;
    }
    if (!data || data.length === 0) break;

    allData = allData.concat(data);
    if (allData.length >= maxLimit) {
      console.warn(`[loadAllData] ${table}: ${maxLimit}행 제한으로 로드 중단`);
      return allData.slice(0, maxLimit);
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return allData;
}

// ============================================================
// 전체 데이터 로드 (초기화용) — store.js 호환
//
// 2단계 로드 전략:
//   Phase 1: items + transactions + settings (핵심 UI에 필요한 데이터) → onCriticalReady 콜백
//   Phase 2: vendors + transfers + stocktakes 등 보조 데이터 → 전체 반환
//
// 이렇게 하면 items/transactions가 준비되자마자 UI가 갱신되고,
// vendors/거래처 등은 0.5~1초 뒤 추가로 업데이트됩니다.
// ============================================================
export async function loadAllData(onCriticalReady) {
  // ── Phase 1: 핵심 데이터 (items + transactions + settings) ──────────
  const phase1 = await Promise.allSettled([
    _fetchAllPages('items', 100000),          // 0
    _fetchAllPages('transactions', 100000),   // 1
    settings.getAll(),                         // 2
    itemStocks.listAll(),                      // 3
    _fetchAllPages('safety_stocks', 50000),   // 4
  ]);

  const pickP1 = (idx, fallback) => {
    const r = phase1[idx];
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[loadAllData] phase1[${idx}] 로드 실패:`, r.reason?.message || r.reason);
    return fallback;
  };

  const itemsData        = pickP1(0, []);
  const txData           = pickP1(1, []);
  const settingsData     = pickP1(2, {});
  const itemStocksData   = pickP1(3, []);
  const safetyStocksData = pickP1(4, []);

  // 핵심 데이터 변환
  const mappedData         = itemsData.map(dbItemToStoreItem);
  const enrichedMappedData = enrichItemsWithQty(mappedData, itemStocksData);
  const convertedSafetyStocks = safetyStocksData.map(r => ({
    id: r.id, itemId: r.item_id, warehouseId: r.warehouse_id,
    minQty: r.min_qty, updatedAt: r.updated_at,
  }));

  const criticalState = {
    mappedData:         enrichedMappedData,
    transactions:       txData.map(dbTxToStoreTx),
    itemStocks:         itemStocksData,
    safetyStocks:       convertedSafetyStocks,
    safetyStock:        settingsData.safetyStock || {},
    beginnerMode:       settingsData.beginnerMode ?? true,
    dashboardMode:      settingsData.dashboardMode || 'executive',
    visibleColumns:     settingsData.visibleColumns || null,
    inventoryViewPrefs: settingsData.inventoryViewPrefs || {},
    inoutViewPrefs:     settingsData.inoutViewPrefs || {},
    tableSortPrefs:     settingsData.tableSortPrefs || {},
    costMethod:         settingsData.costMethod || 'weighted-avg',
    currency:           settingsData.currency || { code: 'KRW', symbol: '₩', rate: 1 },
  };

  // 핵심 데이터 준비 즉시 콜백 → store가 바로 UI 업데이트
  if (typeof onCriticalReady === 'function') {
    try { onCriticalReady(criticalState); } catch (_) {}
  }

  // ── Phase 2: 보조 데이터 (vendors, transfers, 장부 등) ───────────────
  const phase2 = await Promise.allSettled([
    _fetchAllPages('vendors', 50000),          // 0
    _fetchAllPages('transfers', 50000),         // 1
    _fetchAllPages('stocktakes', 50000),        // 2
    auditLogs.list({ limit: 200 }),             // 3
    _fetchAllPages('account_entries', 100000),  // 4
    _fetchAllPages('purchase_orders', 50000),   // 5
    posSales.list({ limit: 1000 }),             // 6
    customFields.list({ limit: 999999 }),       // 7
  ]);

  const secLabels = ['vendors', 'transfers', 'stocktakes', 'auditLogs',
    'account_entries', 'purchase_orders', 'posSales', 'customFields'];
  const pickP2 = (idx, fallback) => {
    const r = phase2[idx];
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[loadAllData] ${secLabels[idx]} 로드 실패:`, r.reason?.message || r.reason);
    return fallback;
  };

  const vendorsData   = pickP2(0, []);
  const transfersData = pickP2(1, []);
  const stocktakeData = pickP2(2, []);
  const auditData     = pickP2(3, []);
  const accountData   = pickP2(4, []);
  const orderData     = pickP2(5, []);
  const posData       = pickP2(6, []);
  const fieldData     = pickP2(7, []);

  return {
    ...criticalState,
    vendorMaster:     vendorsData.map(dbVendorToStore),
    transfers:        transfersData.map(dbTransferToStore),
    stocktakeHistory: stocktakeData,
    auditLogs:        auditData,
    accountEntries:   accountData,
    purchaseOrders:   orderData,
    posData:          posData,
    customFields:     fieldData,
  };
}

/**
 * 현재 사용자의 모든 데이터 삭제 (회원탈퇴/초기화용)
 * 각 테이블에서 user_id = auth.uid() 인 데이터를 순서대로 삭제
 */
export async function clearAllUserData() {
  // 실제 인증된 사용자 UID 사용 (워크스페이스 오너 UID 불가 — 본인 데이터만 삭제)
  const userId = await getAuthUserId();
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
