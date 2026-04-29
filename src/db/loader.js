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
import { getUserId } from './core.js';
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

  console.log(`[loadAllData] ${table}: 총 ${allData.length}행 로드됨`);
  return allData;
}

// ============================================================
// 전체 데이터 로드 (초기화용) — store.js 호환
// ============================================================
export async function loadAllData() {
  const labels = [
    'items', 'transactions', 'vendors', 'transfers', 'stocktakes',
    'auditLogs', 'accountEntries', 'purchaseOrders', 'posSales',
    'customFields', 'settings', 'itemStocks', 'safetyStocks',
  ];

  // 모든 대용량 테이블은 페이지네이션으로 로드
  const results = await Promise.allSettled([
    _fetchAllPages('items', 100000),
    _fetchAllPages('transactions', 100000),
    _fetchAllPages('vendors', 50000),
    _fetchAllPages('transfers', 50000),
    _fetchAllPages('stocktakes', 50000),
    auditLogs.list({ limit: 200 }),
    _fetchAllPages('account_entries', 100000),
    _fetchAllPages('purchase_orders', 50000),
    posSales.list({ limit: 1000 }),
    customFields.list({ limit: 999999 }),
    settings.getAll(),
    itemStocks.listAll(),
    _fetchAllPages('safety_stocks', 50000),
  ]);

  const pick = (idx, fallback) => {
    const r = results[idx];
    if (r.status === 'fulfilled') {
      const value = r.value;
      if (Array.isArray(value) && labels[idx]) {
        console.log(`[loadAllData] ${labels[idx]}: ${value.length}행`);
      }
      return value;
    }
    console.warn(`[loadAllData] ${labels[idx]} 로드 실패:`, r.reason?.message || r.reason);
    return fallback;
  };

  const itemsData      = pick(0,  []);
  const txData         = pick(1,  []);
  const vendorsData    = pick(2,  []);
  const transfersData  = pick(3,  []);
  const stocktakeData  = pick(4,  []);
  const auditData      = pick(5,  []);
  const accountData    = pick(6,  []);
  const orderData      = pick(7,  []);
  const posData        = pick(8,  []);
  const fieldData      = pick(9,  []);
  const settingsData   = pick(10, {});
  const itemStocksData = pick(11, []);
  const safetyStocksData = pick(12, []);

  // 기존 store.js 호환 — 점진적 전환 유지
  const mappedData = itemsData.map(dbItemToStoreItem);

  // itemStocks 기반으로 quantity 채우기 (단일 진실 공급원)
  const enrichedMappedData = enrichItemsWithQty(mappedData, itemStocksData);

  // 안전재고 데이터 변환 (safety_stocks는 정규화 테이블)
  const convertedSafetyStocks = safetyStocksData.map(r => ({
    id: r.id,
    itemId: r.item_id,
    warehouseId: r.warehouse_id,
    minQty: r.min_qty,
    updatedAt: r.updated_at,
  }));

  return {
    mappedData:       enrichedMappedData,
    transactions:     txData.map(dbTxToStoreTx),
    vendorMaster:     vendorsData.map(dbVendorToStore),
    transfers:        transfersData.map(dbTransferToStore),
    stocktakeHistory: stocktakeData,
    auditLogs:        auditData,
    accountEntries:   accountData,
    purchaseOrders:   orderData,
    posData:          posData,
    customFields:     fieldData,
    // 신규: 창고별 현재고 + 안전재고 (정규화 테이블)
    itemStocks:       itemStocksData,
    safetyStocks:     convertedSafetyStocks,
    // 설정값
    safetyStock:      settingsData.safetyStock || {},
    beginnerMode:     settingsData.beginnerMode ?? true,
    dashboardMode:    settingsData.dashboardMode || 'executive',
    visibleColumns:   settingsData.visibleColumns || null,
    inventoryViewPrefs: settingsData.inventoryViewPrefs || {},
    inoutViewPrefs:   settingsData.inoutViewPrefs || {},
    tableSortPrefs:   settingsData.tableSortPrefs || {},
    costMethod:       settingsData.costMethod || 'weighted-avg',
    currency:         settingsData.currency || { code: 'KRW', symbol: '₩', rate: 1 },
  };
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
