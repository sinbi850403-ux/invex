/**
 * store.js - 앱 전체 데이터 저장소
 *
 * 저장 전략 (하이브리드):
 * 1. 메모리: 빠른 읽기 (getState)
 * 2. IndexedDB: 오프라인 캐시 + 즉시 저장
 * 3. Supabase: 클라우드 영구 저장 (로그인 시)
 *
 * 데이터 흐름:
 *   setState() → 메모리 갱신 → IndexedDB 저장 → Supabase 동기화 (디바운스)
 *   restoreState() → Supabase 로딩 → 메모리 적용 → IndexedDB 캐시
 */

import { isSupabaseConfigured, supabase } from './supabase-client.js';
import * as db from './db.js';
import { storeItemToDb } from './db.js';
import { managedQuery, invalidateCache, getTrafficMetrics } from './traffic-manager.js';

// TOKEN_REFRESHED 이벤트가 이미 발생했는지 추적
let _tokenWasRefreshed = false;
window.addEventListener('invex:token-refreshed', () => { _tokenWasRefreshed = true; });

// 마지막 restoreState가 Supabase에서 실제 데이터를 가져왔는지 추적
let _supabaseLoadSucceeded = false;
export function wasLoadedFromSupabase() { return _supabaseLoadSucceeded; }

// 기본 상태
const DEFAULT_STATE = {
  rawData: [],          // 업로드된 원본 데이터
  sheetNames: [],       // 시트 이름 목록
  activeSheet: '',      // 현재 선택된 시트
  fileName: '',         // 업로드된 파일명
  columnMapping: {},    // 컬럼 매핑 정보
  mappedData: [],       // 매핑 완료된 정제 데이터
  currentStep: 1,       // 진행 단계
  allSheets: {},        // 모든 시트 데이터
  // 입출고 이력
  transactions: [],     // [{id, type, itemName, quantity, date, note, ...}]
  // 안전재고 설정
  safetyStock: {},      // { 품목명: 최소수량 }
  // 컬럼 표시 설정
  visibleColumns: null, // ['itemName','quantity','unitPrice'] 형태
  // 초보자 도움 모드
  beginnerMode: true,
  // 대시보드 보기 모드
  dashboardMode: 'executive',
  // 자동 컬럼정렬 상태
  tableSortPrefs: {},
  // 화면별 필터/정렬 뷰 설정 (사용자 편의 저장)
  inventoryViewPrefs: {
    filter: { keyword: '', category: '', warehouse: '', stock: '', itemCode: '', vendor: '', focus: 'all' },
    sort: { key: '', direction: '' },
  },
  inoutViewPrefs: {
    filter: { keyword: '', type: '', date: '', vendor: '', itemCode: '', quick: 'all' },
    sort: { key: 'date', direction: 'desc' },
  },
  // 각 mappedData row에는 expiryDate, lotNumber 필드도 포함 가능
  // 창고 간 이동 이력
  transfers: [],        // [{date, fromWarehouse, toWarehouse, itemName, quantity, ...}]
  // 커스텀 필드 (사용자 정의 컬럼)
  customFields: [],     // [{key, label, type, options?}]
  // 거래처 마스터
  vendorMaster: [],     // [{name, type, bizNumber, ceoName, contactName, phone, ...}]
  // 재고 실사 이력
  stocktakeHistory: [], // [{date, inspector, adjustCount, totalItems}]
  // 감사 추적
  auditLogs: [],        // [{id, timestamp, action, target, detail, user}]
  // 원가 계산 방식
  costMethod: 'weighted-avg', // 'weighted-avg' | 'fifo' | 'latest'
  // 매출/매입 전표
  accountEntries: [],   // [{id, type, vendorName, amount, currency, date, ...}]
  // 발주 이력
  purchaseOrders: [],   // [{id, orderNo, vendor, items, status, paymentDueDate, ...}]
  // 수주 이력 (판매 플로우)
  salesOrders: [],      // [{id, orderNo, customer, items, status, shippedItems, receivableEntryId, ...}]
  // 세금계산서 (매입/매출 공용)
  taxInvoices: [],      // [{id, invoiceNo, type, vendor/customer, items, supply, vat, total, ...}]
  // 문서 작성용 임시 draft
  documentDraft: null,
  // 통화 설정
  currency: { code: 'KRW', symbol: '₩', rate: 1 },
  // 사용자명
  userName: '관리자',
  // 창고 마스터 (Enterprise: 다중 창고 관리)
  warehouses: [
    { id: 'wh-default', name: '본사 창고', type: 'main', address: '', manager: '', memo: '', createdAt: '' }
  ],
  // 권한 관리 (Enterprise: RBAC)
  roles: [],              // [{id, name, icon, color, description, permissions, isSystem}]
  members: [],            // [{id, name, email, roleId, status, joinedAt}]
  // API 연동 (Enterprise)
  apiKeys: [],            // [{id, name, key, scope, createdAt, lastUsed, visible}]
  webhooks: [],           // [{id, name, url, events, active, createdAt}]
  // 창고 필터 (UI 상태)
  activeWarehouseFilter: '',
  // 현재 요금제 (free / pro / enterprise)
  currentPlan: 'free',
  // 구독 정보
  subscription: {},       // {planId, status, startDate, nextPayDate, cardLast4, ...}
  // 결제 이력
  paymentHistory: [],     // [{id, date, planName, amount, status, method}]
  // 관리자 데이터
  adminUsers: [],         // [{uid, name, email, plan, role, status, createdAt, lastLogin}]
  adminNotices: [],       // [{id, title, content, date}]
  // 알림 상태
  notificationReadMap: {},
  notificationDeliveryLog: {},
  notificationChannelPrefs: { webhook: true },
  // 수불부 기초재고 수동 입력
  ledgerOpeningOverrides: {},
  // === HR 모듈 (Phase A) ===
  employees: [],         // 직원 마스터 [{id, empNo, name, dept, position, hireDate, baseSalary, ...}]
  attendance: [],        // 일별 근태   [{id, employeeId, workDate, checkIn, checkOut, workMin, overtimeMin, nightMin, holidayMin, status}]
  payrolls: [],          // 월별 급여   [{id, employeeId, payYear, payMonth, base, gross, net, status}]
  leaves: [],            // 휴가        [{id, employeeId, leaveType, startDate, endDate, days, status}]
  salaryItems: [],       // 수당·공제 마스터
  hrFilters: { dept: '', status: 'active' },
  currentPayrollPeriod: null, // {year, month}
};

let state = { ...DEFAULT_STATE };

// === IndexedDB 관련 (오프라인 캐시) ===
const DB_NAME = 'invex-db';
const DB_VERSION = 1;
const STORE_NAME = 'appState';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToDB() {
  try {
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(state, 'current');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    idb.close();
  } catch (e) {
    console.warn('[Store] IndexedDB 저장 실패:', e.message);
    // 폴백: localStorage에 핵심 데이터만 저장
    try {
      const slim = {
        mappedData: state.mappedData,
        transactions: state.transactions,
        safetyStock: state.safetyStock,
        documentDraft: state.documentDraft,
        fileName: state.fileName,
        currentStep: state.currentStep,
        beginnerMode: state.beginnerMode,
        dashboardMode: state.dashboardMode,
        tableSortPrefs: state.tableSortPrefs,
        inventoryViewPrefs: state.inventoryViewPrefs,
        inoutViewPrefs: state.inoutViewPrefs,
      };
      localStorage.setItem('invex-fallback', JSON.stringify(slim));
    } catch (_) { /* 무시 */ }
    // 사용자에게 오프라인 저장 실패 알림
    window.dispatchEvent(new CustomEvent('invex:idb-failed', { detail: { reason: e.message } }));
  }
}

async function loadFromDB() {
  try {
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('current');
    return new Promise((resolve) => {
      request.onsuccess = () => { idb.close(); resolve(request.result || null); };
      request.onerror = () => { idb.close(); resolve(null); };
    });
  } catch (e) {
    console.warn('[Store] IndexedDB 읽기 실패:', e.message);
    return null;
  }
}

// === Supabase 동기화 (디바운스) ===
// 왜 디바운스? → setState가 연속 호출될 때 매번 API 쏘면 과부하
let _supabaseSyncTimer = null;
// 어떤 데이터가 변경됐는지 추적
let _dirtyKeys = new Set();
let _waitingAuthResume = false;
let _authResumeSubscription = null;
let _syncRetryCount = 0;
const MAX_SYNC_RETRIES = 5;

function getErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string') return error.message;
  if (typeof error.error_description === 'string') return error.error_description;
  return String(error);
}

function isAuthLikeSyncError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('로그인이 필요') ||
    message.includes('login required') ||
    message.includes('jwt') ||
    message.includes('401') ||
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('not authenticated') ||
    message.includes('invalid claim')
  );
}

function waitForAuthThenSync() {
  if (_waitingAuthResume || !isSupabaseConfigured) return;
  _waitingAuthResume = true;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      _waitingAuthResume = false;
      _authResumeSubscription?.unsubscribe?.();
      _authResumeSubscription = null;
      syncToSupabase();
    }
  });
  _authResumeSubscription = data?.subscription || null;
}

/**
 * 변경된 데이터만 Supabase에 동기화
 * 왜 전체가 아닌 부분 동기화? → 품목 10,000개를 매번 보내면 느림
 */
let _lastLocalSyncTime = 0; // 내가 마지막으로 Supabase에 쓴 시각 (내 변경이 Realtime으로 돌아오면 무시)

async function syncToSupabase() {
  if (!isSupabaseConfigured || _dirtyKeys.size === 0) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    waitForAuthThenSync();
    return;
  }

  const keysToSync = new Set(_dirtyKeys);
  _dirtyKeys.clear();

  // 실패한 키를 추적해 재시도 보장
  const failedKeys = new Set();
  let authBlocked = false;

  try {
    const promises = [];

    // 품목 데이터 동기화
    if (keysToSync.has('mappedData')) {
      const items = (state.mappedData || []).map(item => storeItemToDb(item));
      promises.push(
        managedQuery(() => db.items.bulkUpsert(items))
          .then((savedItems) => {
            // ★ Supabase가 반환한 UUID를 state.mappedData._id에 반영
            // → 같은 세션 내 deleteItem이 정확한 UUID로 Supabase 삭제 가능
            if (Array.isArray(savedItems) && savedItems.length > 0) {
              savedItems.forEach(saved => {
                const storeItem = state.mappedData.find(m =>
                  (saved.item_name && m.itemName === saved.item_name) ||
                  (m._id && m._id === saved.id)
                );
                if (storeItem) storeItem._id = saved.id;
              });
              saveToDB();
            }
          })
          .catch(err => {
            console.warn('[Sync] 품목 동기화 실패:', getErrorMessage(err));
            if (isAuthLikeSyncError(err)) authBlocked = true;
            failedKeys.add('mappedData');
          })
      );
    }

    // 입출고 동기화 — 새로 추가된 건만
    if (keysToSync.has('transactions')) {
      const newTxs = (state.transactions || [])
        .filter(tx => !tx._synced)
        .map(tx => ({
          id: tx.id,            // ★ 클라이언트 UUID → Supabase와 동일 ID 공유 (upsert 멱등성 보장)
          type: tx.type,
          item_name: tx.itemName,
          item_code: tx.itemCode || null,
          quantity: tx.quantity,
          unit_price: tx.unitPrice || 0,
          supply_value: tx.supplyValue || 0,
          vat: tx.vat || 0,
          total_amount: tx.totalAmount || 0,
          selling_price: tx.sellingPrice || 0,
          actual_selling_price: tx.actualSellingPrice || 0,
          spec: tx.spec || null,
          unit: tx.unit || null,
          category: tx.category || null,
          date: tx.date,
          vendor: tx.vendor,
          warehouse: tx.warehouse,
          note: tx.note,
        }));

      if (newTxs.length > 0) {
        promises.push(
          managedQuery(() => db.transactions.bulkCreate(newTxs))
            .then(() => {
              state.transactions.forEach(tx => { tx._synced = true; });
            })
            .catch(err => {
              console.warn('[Sync] 입출고 동기화 실패:', getErrorMessage(err));
              if (isAuthLikeSyncError(err)) authBlocked = true;
              failedKeys.add('transactions');
            })
        );
      }
    }

    // 거래처 동기화 — upsert(onConflict: user_id,name)로 수정 내용도 반영
    // ★ _id(UUID)를 id로 포함: 이름 변경 시 같은 row를 업데이트 (중복 생성 방지)
    if (keysToSync.has('vendorMaster')) {
      const vendors = (state.vendorMaster || []).map(v => {
        const payload = {
          name: v.name,
          type: v.type,
          biz_number: v.bizNumber,
          ceo_name: v.ceoName,
          contact_name: v.contactName,
          phone: v.phone,
          email: v.email,
          address: v.address,
          memo: v.memo,
        };
        if (v._id) payload.id = v._id; // UUID 있으면 포함 → id conflict로 정확한 row 업데이트
        return payload;
      });
      for (const vendor of vendors) {
        promises.push(
          managedQuery(() => db.vendors.upsert(vendor)).catch(err => {
            console.warn('[Sync] 거래처 동기화 실패:', getErrorMessage(err));
            failedKeys.add('vendorMaster');
          })
        );
      }

      // ★ 삭제된 거래처 Supabase에서도 제거
      // _deletedVendors: setState로 전달된 삭제 목록 (store에서 추적)
      const deletedVendors = state._deletedVendors || [];
      if (deletedVendors.length > 0) {
        for (const v of deletedVendors) {
          const del = v._id
            ? managedQuery(() => db.vendors.remove(v._id))
            : managedQuery(() => db.vendors.removeByName(v.name));
          promises.push(
            del.catch(err => console.warn('[Sync] 거래처 삭제 동기화 실패:', getErrorMessage(err)))
          );
        }
        // 처리 후 초기화
        state._deletedVendors = [];
      }
    }

    // 매출/매입 전표 동기화
    if (keysToSync.has('accountEntries')) {
      const entries = (state.accountEntries || [])
        .filter(e => e.id && String(e.id).includes('-')) // UUID 형식만 sync (Date.now_ 형식은 제외)
        .map(e => ({
          id: e.id,
          type: e.type,
          vendor: e.vendorName,
          amount: e.amount || 0,
          currency: e.currency || 'KRW',
          date: e.date,
          due_date: e.dueDate || null,
          description: e.description || null,
          settled: e.settled || false,
          settled_date: e.settledDate || null,
          payment_method: e.paymentMethod || null,
          settle_note: e.settleNote || null,
          source: e.source || null,
        }));
      if (entries.length > 0) {
        promises.push(
          managedQuery(() => db.accountEntries.bulkUpsert(entries)).catch(err => {
            console.warn('[Sync] 매출/매입 전표 동기화 실패:', getErrorMessage(err));
            failedKeys.add('accountEntries');
          })
        );
      }
    }

    // 발주서 동기화
    if (keysToSync.has('purchaseOrders')) {
      const orders = (state.purchaseOrders || [])
        .filter(o => o.id && String(o.id).includes('-')) // UUID 형식만 sync
        .map(o => ({
          id: o.id,
          order_no: o.orderNo,
          order_date: o.orderDate,
          delivery_date: o.deliveryDate || null,
          payment_due_date: o.paymentDueDate || null,
          vendor: o.vendor,
          items: o.items || [],
          status: o.status || 'draft',
          total_amount: o.totalAmount || 0,
          notes: o.notes || null,
          confirmed_at: o.confirmedAt || null,
          cancelled_at: o.cancelledAt || null,
          payable_entry_id: o.payableEntryId || null,
          tax_invoice_id: o.taxInvoiceId || null,
        }));
      if (orders.length > 0) {
        promises.push(
          managedQuery(() => db.purchaseOrders.bulkUpsert(orders)).catch(err => {
            console.warn('[Sync] 발주서 동기화 실패:', getErrorMessage(err));
            failedKeys.add('purchaseOrders');
          })
        );
      }
    }

    // 창고 이동 동기화
    if (keysToSync.has('transfers')) {
      const rows = (state.transfers || [])
        .filter(t => t.id && String(t.id).includes('-')) // UUID 형식만 sync
        .map(t => ({
          id: t.id,
          date: t.date,
          item_name: t.itemName,
          item_code: t.itemCode || null,
          from_warehouse: t.fromWarehouse,
          to_warehouse: t.toWarehouse,
          quantity: t.quantity,
          note: t.note || null,
        }));
      if (rows.length > 0) {
        promises.push(
          managedQuery(() => db.transfers.bulkUpsert(rows)).catch(err => {
            console.warn('[Sync] 창고 이동 동기화 실패:', getErrorMessage(err));
            failedKeys.add('transfers');
          })
        );
      }
    }

    // 설정값 동기화
    const settingKeys = [
      'safetyStock', 'beginnerMode', 'dashboardMode', 'visibleColumns',
      'inventoryViewPrefs', 'inoutViewPrefs', 'tableSortPrefs',
      'costMethod', 'currency',
      'notificationReadMap', // ★ 알림 읽음 상태 — 새로고침 후에도 유지
      'ledgerOpeningOverrides', // ★ 수불부 기초재고 수동 입력값 — 다기기 동기화
    ];
    for (const key of settingKeys) {
      if (keysToSync.has(key) && state[key] !== undefined) {
        promises.push(
          managedQuery(() => db.settings.set(key, state[key]))
            .catch(err => { console.warn(`[Sync] 설정 ${key} 동기화 실패:`, err?.message ?? err); failedKeys.add(key); })
        );
      }
    }

    await Promise.allSettled(promises);

    // 실패한 키는 다시 dirty로 등록해 재시도 보장
    if (failedKeys.size > 0) {
      failedKeys.forEach(k => _dirtyKeys.add(k));
      if (authBlocked) {
        _syncRetryCount = 0;
        waitForAuthThenSync();
        return;
      }
      if (_syncRetryCount >= MAX_SYNC_RETRIES) {
        _syncRetryCount = 0;
        window.dispatchEvent(new CustomEvent('invex:sync-failed', { detail: { keys: [...failedKeys] } }));
        return;
      }
      _syncRetryCount++;
      window.dispatchEvent(new CustomEvent('invex:sync-failed', { detail: { keys: [...failedKeys] } }));
      setTimeout(() => syncToSupabase(), 10_000);
    } else {
      _syncRetryCount = 0;
    }
    // 쓰기 완료 후 타임스탬프 기록 — Realtime 이벤트 억제 창을 정확하게 유지
    _lastLocalSyncTime = Date.now();
  } catch (err) {
    // 전체 실패 시 모든 키 복원
    keysToSync.forEach(k => _dirtyKeys.add(k));
    if (isAuthLikeSyncError(err)) {
      _syncRetryCount = 0;
      waitForAuthThenSync();
      return;
    }
    if (_syncRetryCount >= MAX_SYNC_RETRIES) {
      _syncRetryCount = 0;
      return;
    }
    _syncRetryCount++;
    setTimeout(() => syncToSupabase(), 10_000);
  }
}

/**
 * 디바운스된 Supabase 동기화 트리거 (500ms)
 * setState가 0.1초 간격으로 연속 호출될 수 있어서 묶어서 처리
 */
function scheduleSyncToSupabase(changedKeys) {
  changedKeys.forEach(k => _dirtyKeys.add(k));

  if (_supabaseSyncTimer) clearTimeout(_supabaseSyncTimer);
  _supabaseSyncTimer = setTimeout(() => {
    syncToSupabase();
  }, 500);
}

// 페이지 언로드 직전 미동기화 데이터 플러시
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (_dirtyKeys.size > 0) syncToSupabase();
  });
}

// === Realtime 실시간 동기화 ===

let _realtimeChannel = null;
let _realtimeReloadTimer = null;

const REALTIME_TABLES = [
  'items', 'transactions', 'vendors', 'transfers',
  'account_entries', 'purchase_orders', 'stocktakes',
  'user_settings', 'profiles',
];

function scheduleRealtimeReload() {
  // 3초 이내에 내가 직접 Supabase에 썼으면 내 변경이 돌아온 것 → 무시
  if (Date.now() - _lastLocalSyncTime < 3000) return;

  if (_realtimeReloadTimer) clearTimeout(_realtimeReloadTimer);
  _realtimeReloadTimer = setTimeout(async () => {
    await restoreState();
    window.dispatchEvent(new CustomEvent('invex:realtime-reload'));
  }, 1500);
}

export function setupRealtimeSync() {
  if (!isSupabaseConfigured) return;
  cleanupRealtimeSync();

  const channel = supabase.channel('invex-realtime-v1');
  REALTIME_TABLES.forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRealtimeReload);
  });
  channel.subscribe();
  _realtimeChannel = channel;
}

export function cleanupRealtimeSync() {
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel).catch(() => {});
    _realtimeChannel = null;
  }
  if (_realtimeReloadTimer) {
    clearTimeout(_realtimeReloadTimer);
    _realtimeReloadTimer = null;
  }
  // 로그아웃 시 auth 재시도 구독도 해제 — 이전 세션 dirty 데이터가 새 세션에 동기화되는 것 방지
  if (_authResumeSubscription) {
    _authResumeSubscription.unsubscribe?.();
    _authResumeSubscription = null;
    _waitingAuthResume = false;
    _dirtyKeys.clear();
  }
}

// === Public API ===

export function getState() {
  return state;
}

/**
 * 상태 업데이트 + 자동 저장 + 클라우드 동기화
 * @param {object} partial - 변경할 속성들
 */
let _syncCallback = null;

export function setSyncCallback(fn) {
  _syncCallback = fn;
}

export function setState(partial) {
  // 변경된 키 추적 (Supabase 부분 동기화용)
  const changedKeys = Object.keys(partial);

  state = { ...state, ...partial };
  window.dispatchEvent(new CustomEvent('invex:store-updated', { detail: { changedKeys } }));
  // 비동기로 로컬 저장 — 실패 시 invex:idb-failed 이벤트 dispatch
  saveToDB().catch(e => {
    console.warn('[Store] setState → saveToDB 실패:', e.message);
    window.dispatchEvent(new CustomEvent('invex:idb-failed', { detail: { reason: e.message } }));
  });
  // 클라우드 동기화 트리거
  if (_syncCallback) _syncCallback();
  // Supabase 부분 동기화 (디바운스)
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(changedKeys);
  }
}

/**
 * 상태 초기화
 */
export function resetState() {
  state = { ...DEFAULT_STATE };
  window.dispatchEvent(new CustomEvent('invex:store-updated', { detail: { changedKeys: ['*'] } }));
  saveToDB();
}

/**
 * 앱 시작 시 상태 복원
 * 전략: Supabase에서 먼저 로드 → 실패 시 IndexedDB 폴백
 */
export async function restoreState(userId = null) {
  // 1. Supabase에서 데이터 로딩 시도
  if (isSupabaseConfigured) {
    try {
      // userId가 전달되면 getSession 재호출 생략 — 로그인 직후 세션 타이밍 경쟁 방지
      let hasSession = !!userId;
      if (!hasSession) {
        const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        hasSession = !!session?.user;
      }
      if (!hasSession) {
        // 로그인 안 된 상태는 정상 흐름 — 경고 출력하지 않음, IndexedDB 폴백으로 진행
      } else {
        // JWT 만료 감지 → TOKEN_REFRESHED 이벤트 대기 (만료 토큰으로 쿼리하면 RLS가 0건 반환)
        // _tokenWasRefreshed가 이미 true이면 이미 갱신됐으므로 대기 불필요
        if (!_tokenWasRefreshed) {
          try {
            const raw = localStorage.getItem('invex-supabase-auth');
            if (raw) {
              const parsed = JSON.parse(raw);
              const expiresAt = parsed?.expires_at; // Supabase v2: 초 단위 epoch
              if (expiresAt && expiresAt * 1000 < Date.now() + 30_000) {
                // 30초 이내 만료 또는 이미 만료 → TOKEN_REFRESHED 대기 (최대 6초)
                await new Promise(resolve => {
                  const timer = setTimeout(resolve, 6000);
                  window.addEventListener('invex:token-refreshed', () => {
                    clearTimeout(timer);
                    resolve();
                  }, { once: true });
                });
              }
            }
          } catch (_) { /* localStorage 파싱 오류 무시 */ }
        }

        let cloudData = await managedQuery(() => db.loadAllData());

        // 여전히 0건이면 1회 재시도 (네트워크 일시 오류 또는 토큰 전파 지연 대응)
        if (
          (cloudData.mappedData?.length ?? 0) === 0 &&
          (cloudData.transactions?.length ?? 0) === 0
        ) {
          await new Promise(r => setTimeout(r, 1500));
          const retry = await managedQuery(() => db.loadAllData());
          if (
            (retry.mappedData?.length ?? 0) > 0 ||
            (retry.transactions?.length ?? 0) > 0
          ) {
            cloudData = retry;
          }
        }

        // 로컬 IndexedDB 전체를 먼저 읽어 두고, Supabase가 담당하는 키만 cloudData로 덮어쓴다.
        const localData = await loadFromDB();

        // Supabase 데이터에 입출고는 _synced 표시
        if (cloudData.transactions) {
          cloudData.transactions.forEach(tx => { tx._synced = true; });
        }

        _supabaseLoadSucceeded =
          (cloudData.mappedData?.length ?? 0) > 0 ||
          (cloudData.transactions?.length ?? 0) > 0;

        // ★ 오프라인에서 입력한 미동기화 트랜잭션 보호
        // Supabase에 기존 데이터가 있어도 로컬의 _synced:false 건은 유실되지 않도록 merge
        const localTxs = localData?.transactions || [];
        const unsyncedLocal = localTxs.filter(tx => !tx._synced);
        if (unsyncedLocal.length > 0 && cloudData.transactions) {
          // Supabase 트랜잭션 ID 셋으로 중복 방지
          const cloudIds = new Set(cloudData.transactions.map(t => t.id));
          const trulyUnsynced = unsyncedLocal.filter(tx => !cloudIds.has(tx.id));
          if (trulyUnsynced.length > 0) {
            cloudData.transactions = [...trulyUnsynced, ...cloudData.transactions];
          }
        }

        // Supabase가 빈 배열을 반환했지만 로컬에 실제 데이터가 있으면 보호
        // — 토큰 갱신 타이밍, RLS 일시 차단, 네트워크 오류로 인한 데이터 소실 방지
        const safeCloudData = { ...cloudData };
        if ((safeCloudData.mappedData?.length ?? 0) === 0 && (localData?.mappedData?.length ?? 0) > 0) {
          delete safeCloudData.mappedData;
        }
        if ((safeCloudData.transactions?.length ?? 0) === 0 && (localData?.transactions?.length ?? 0) > 0) {
          delete safeCloudData.transactions;
        }
        // ★ 주요 데이터 추가 보호 (빈 배열/객체로 덮어쓰기 방지)
        // vendorMaster, transfers, accountEntries, purchaseOrders, stocktakeHistory는 배열 → .length 사용
        // safetyStock은 객체({품목명: 수량}) → Object.keys().length 사용
        const protectArrayKeys = ['vendorMaster', 'transfers', 'accountEntries', 'purchaseOrders', 'stocktakeHistory'];
        protectArrayKeys.forEach(key => {
          if ((safeCloudData[key]?.length ?? 0) === 0 && (localData?.[key]?.length ?? 0) > 0) {
            delete safeCloudData[key];
          }
        });
        const localSafetyStockLen = Object.keys(localData?.safetyStock || {}).length;
        const cloudSafetyStockLen = Object.keys(safeCloudData?.safetyStock || {}).length;
        if (cloudSafetyStockLen === 0 && localSafetyStockLen > 0) {
          delete safeCloudData.safetyStock;
        }

        state = { ...DEFAULT_STATE, ...(localData || {}), ...safeCloudData };
        window.dispatchEvent(new CustomEvent('invex:store-updated', { detail: { changedKeys: ['*'] } }));
        saveToDB();
        return;
      }
    } catch (err) {
      _supabaseLoadSucceeded = false;
      // 401/RLS/타임아웃은 IndexedDB 폴백이 자연스러운 흐름 — 디버그 수준만
      const msg = String(err.message || '');
      if (!msg.includes('401') && !msg.includes('row-level') && !msg.includes('timeout')) {
        console.warn('[Store] Supabase 로딩 실패, IndexedDB로 폴백:', msg);
      }
    }
  }

  // 2. IndexedDB에서 복원 (오프라인 or Supabase 미설정)
  const saved = await loadFromDB();
  if (saved) {
    state = { ...DEFAULT_STATE, ...saved };
    window.dispatchEvent(new CustomEvent('invex:store-updated', { detail: { changedKeys: ['*'] } }));
    return;
  }

  // 3. localStorage 폴백 (최후 수단)
  try {
    const fallback = localStorage.getItem('invex-fallback');
    if (fallback) {
      const parsed = JSON.parse(fallback);
      state = { ...DEFAULT_STATE, ...parsed };
      window.dispatchEvent(new CustomEvent('invex:store-updated', { detail: { changedKeys: ['*'] } }));
    }
  } catch (_) { /* 무시 */ }
}

// === 입출고 관련 유틸 ===

/**
 * 콤마 포함 숫자 문자열 안전 파싱 (Excel 가져오기 대응)
 * parseFloat("1,000") = 1 오류 방지
 */
function toNum(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/**
 * 품목의 VAT 비율 추론 (면세 0% vs 과세 10%)
 * 기존 supplyValue/vat 비율로 판단, 애매하면 10% 기본값
 */
function inferVatRate(item) {
  const sv = toNum(item.supplyValue);
  const vat = toNum(item.vat);
  if (sv > 0) {
    const rate = vat / sv;
    return rate < 0.05 ? 0 : 0.1;
  }
  return 0.1;
}

/**
 * 품목의 공급가액/부가세/합계 재계산
 * price가 0이면 기존 단가 유지 — 단가 없는 입출고가 금액을 0으로 날리지 않도록 방지
 * @public store 외부(페이지)에서도 사용 가능하도록 export
 */
export function recalcItemAmounts(item) {
  const qty = toNum(item.quantity);
  const price = toNum(item.unitPrice);
  if (price <= 0) {
    // 단가 없으면 금액 필드는 건드리지 않음 (기존값 유지)
    return;
  }
  const vatRate = inferVatRate(item);
  item.supplyValue = qty * price;
  item.vat = Math.floor(item.supplyValue * vatRate);
  item.totalPrice = item.supplyValue + item.vat;
}

/**
 * 새 입출고 기록 추가
 * @param {object} tx - {type:'in'|'out', itemName, quantity, date, note, unitPrice}
 */
export function addTransaction(tx) {
  // ★ 클라이언트 UUID 사용 → Supabase와 동일 ID 공유 → 삭제/upsert 정확히 동작
  const clientId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const newTx = {
    id: clientId,
    createdAt: new Date().toISOString(),
    ...tx,
  };
  state.transactions = [newTx, ...state.transactions];

  // 재고 데이터에 수량 반영
  const item = state.mappedData.find(d =>
    String(d.itemName || '').trim() === String(tx.itemName || '').trim() ||
    (d.itemCode && tx.itemCode && String(d.itemCode).trim() === String(tx.itemCode).trim())
  );
  if (item) {
    const qty = toNum(tx.quantity);
    const currentQty = toNum(item.quantity);
    if (tx.type === 'in') {
      item.quantity = currentQty + qty;
    } else {
      item.quantity = Math.max(0, currentQty - qty);
    }

    // 단가 업데이트: 입고 시 가중평균 단가 적용 (costMethod 설정 기반)
    const txPrice = toNum(tx.unitPrice);
    const itemPrice = toNum(item.unitPrice);
    if (txPrice > 0) {
      if (tx.type === 'in') {
        const costMethod = state.costMethod || 'weighted-avg';
        if (costMethod === 'weighted-avg' && itemPrice > 0) {
          // 가중평균: (이전재고 × 이전단가 + 입고량 × 입고단가) / 신규합계
          const prevQty = Math.max(0, toNum(item.quantity) - qty);
          const totalValue = (prevQty * itemPrice) + (qty * txPrice);
          const totalQty = prevQty + qty;
          if (totalQty > 0) {
            item.unitPrice = Math.round(totalValue / totalQty);
          }
        } else if (itemPrice === 0) {
          item.unitPrice = txPrice;
        }
      }
      // 출고 시에는 단가 변경 안 함 (기존 단가 유지)
    }

    // 금액 재계산 (단가가 있을 때만)
    recalcItemAmounts(item);
  } else {
    // 기존에 없는 품목 → 재고 마스터에 신규 자동 생성
    const qty = tx.type === 'in' ? toNum(tx.quantity) : 0;
    const price = toNum(tx.unitPrice);
    const supplyValue = qty * price;
    const vat = Math.floor(supplyValue * 0.1);

    const newItem = {
      itemName: tx.itemName,
      itemCode: tx.itemCode || '',
      category: tx.category || '미분류',
      spec: tx.spec || '',
      quantity: qty,
      unit: tx.unit || 'EA',
      unitPrice: price,
      salePrice: 0,
      supplyValue: supplyValue,
      vat: vat,
      totalPrice: supplyValue + vat,
      warehouse: tx.warehouse || '',
      note: '입출고 등록에 의한 자동 생성',
      safetyStock: 0,
    };

    state.mappedData = [newItem, ...state.mappedData];
  }

  saveToDB();
  // UI 즉시 갱신 (재고 현황 자동 반영)
  if (_syncCallback) _syncCallback();
  // Supabase에 입출고 + 품목 수량 변경 동기화
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['transactions', 'mappedData']);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notifications-updated'));
  }
  return newTx;
}

/**
 * 일괄 입출고 기록 추가 (엑셀 대량 등록용)
 * addTransaction을 N번 호출하면 saveToDB + scheduleSyncToSupabase도 N번 실행됨
 * → 이 함수로 모두 처리 후 saveToDB 1번, sync 1번으로 줄임
 * @param {object[]} txList - addTransaction과 동일한 형태의 tx 배열
 */
export function addTransactionsBulk(txList) {
  if (!txList || txList.length === 0) return [];
  const newTxs = [];

  for (const tx of txList) {
    const clientId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newTx = { id: clientId, createdAt: new Date().toISOString(), ...tx };
    newTxs.push(newTx);

    // 재고 수량 반영
    const item = state.mappedData.find(d =>
      String(d.itemName || '').trim() === String(tx.itemName || '').trim() ||
      (d.itemCode && tx.itemCode && String(d.itemCode).trim() === String(tx.itemCode).trim())
    );
    if (item) {
      const qty = toNum(tx.quantity);
      const currentQty = toNum(item.quantity);
      if (tx.type === 'in') {
        item.quantity = currentQty + qty;
        const txPrice = toNum(tx.unitPrice);
        const itemPrice = toNum(item.unitPrice);
        if (txPrice > 0) {
          const costMethod = state.costMethod || 'weighted-avg';
          if (costMethod === 'weighted-avg' && itemPrice > 0) {
            const prevQty = Math.max(0, currentQty);
            const totalValue = (prevQty * itemPrice) + (qty * txPrice);
            const totalQty = prevQty + qty;
            if (totalQty > 0) item.unitPrice = Math.round(totalValue / totalQty);
          } else if (itemPrice === 0) {
            item.unitPrice = txPrice;
          }
        }
      } else {
        item.quantity = Math.max(0, currentQty - qty);
      }
      recalcItemAmounts(item);
    } else {
      const qty = tx.type === 'in' ? toNum(tx.quantity) : 0;
      const price = toNum(tx.unitPrice);
      const supplyValue = qty * price;
      const vat = Math.floor(supplyValue * 0.1);
      state.mappedData = [
        { itemName: tx.itemName, itemCode: tx.itemCode || '', category: tx.category || '미분류',
          spec: tx.spec || '', quantity: qty, unit: tx.unit || 'EA', unitPrice: price,
          salePrice: 0, supplyValue, vat, totalPrice: supplyValue + vat,
          warehouse: tx.warehouse || '', note: '입출고 등록에 의한 자동 생성', safetyStock: 0 },
        ...state.mappedData,
      ];
    }
  }

  // 전체를 앞에 한 번에 추가
  state.transactions = [...newTxs, ...state.transactions];

  // IndexedDB 1번, sync 1번
  saveToDB();
  if (_syncCallback) _syncCallback();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['transactions', 'mappedData']);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notifications-updated'));
  }
  return newTxs;
}

/**
 * 입출고 기록 삭제
 */
/**
 * 트랜잭션 가격 필드(판매가/실판매가) 부분 업데이트
 */
export function updateTransactionPrices(id, fields) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return false;
  const allowed = ['sellingPrice', 'actualSellingPrice'];
  allowed.forEach(key => {
    if (key in fields) tx[key] = fields[key];
  });
  saveToDB();
  if (_syncCallback) _syncCallback();

  // ★ Supabase에도 즉시 반영 (snake_case로 변환)
  if (isSupabaseConfigured) {
    const dbFields = {};
    if ('sellingPrice' in fields)       dbFields.selling_price        = fields.sellingPrice;
    if ('actualSellingPrice' in fields) dbFields.actual_selling_price = fields.actualSellingPrice;
    if (Object.keys(dbFields).length > 0) {
      db.transactions.update(id, dbFields).catch(err =>
        console.warn('[Store] 거래 단가 업데이트 Supabase 실패:', err.message)
      );
    }
  }
  return true;
}

export function deleteTransaction(id) {
  const index = state.transactions.findIndex(t => t.id === id);
  if (index === -1) return null;
  const target = state.transactions[index];

  const item = (state.mappedData || []).find(d =>
    String(d.itemName || '').trim() === String(target.itemName || '').trim() ||
    (d.itemCode && target.itemCode && String(d.itemCode).trim() === String(target.itemCode).trim())
  );
  if (item) {
    const qty = toNum(target.quantity);
    const currentQty = toNum(item.quantity);
    if (target.type === 'in') {
      item.quantity = Math.max(0, currentQty - qty);
    } else {
      item.quantity = currentQty + qty;
    }
    recalcItemAmounts(item);
  }

  // Supabase에서도 삭제
  if (isSupabaseConfigured && target._synced) {
    db.transactions.remove(target.id).catch(err =>
      console.warn('[Store] 입출고 삭제 동기화 실패:', err.message)
    );
  }

  state.transactions.splice(index, 1);
  saveToDB();
  if (isSupabaseConfigured) {
    // transactions도 함께 동기화 (삭제 반영)
    scheduleSyncToSupabase(['transactions', 'mappedData']);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notifications-updated'));
  }
  return { deleted: target, index };
}

/**
 * 안전재고 설정
 */
export function setSafetyStock(itemName, minQty) {
  if (!state.safetyStock) state.safetyStock = {};
  state.safetyStock[itemName] = minQty;
  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['safetyStock']);
  }
}

/**
 * 품목 수동 추가
 */
export function addItem(item) {
  if (!state.mappedData) state.mappedData = [];
  state.mappedData.push(item);
  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['mappedData']);
  }
}

/**
 * 품목 수정
 */
export function updateItem(index, item) {
  if (state.mappedData[index]) {
    state.mappedData[index] = { ...state.mappedData[index], ...item };
    saveToDB();
    if (isSupabaseConfigured) {
      scheduleSyncToSupabase(['mappedData']);
    }
  }
}

/**
 * 품목 삭제
 */
export function deleteItem(index) {
  const deleted = state.mappedData[index];
  if (!deleted) return null;
  state.mappedData.splice(index, 1);
  saveToDB();

  // Supabase에서도 삭제
  if (isSupabaseConfigured) {
    if (deleted?._id) {
      // _id(UUID)가 있으면 정확히 삭제
      db.items.remove(deleted._id).catch(err =>
        console.warn('[Store] 품목 삭제 동기화 실패(_id):', err.message)
      );
    } else if (deleted?.itemName) {
      // ★ 같은 세션 내 _id 미설정 시 item_name으로 폴백 삭제
      // (bulkUpsert UUID가 아직 반영되기 전에 삭제하는 경우)
      supabase.auth.getSession().then(({ data: { session } }) => {
        const uid = session?.user?.id;
        if (!uid) return;
        supabase.from('items')
          .delete()
          .eq('user_id', uid)
          .eq('item_name', deleted.itemName)
          .then(({ error }) => {
            if (error) console.warn('[Store] 품목 삭제 동기화 실패(item_name):', error.message);
          });
      });
    }
    scheduleSyncToSupabase(['mappedData']);
  }
  return { deleted, index };
}

/**
 * 삭제된 품목 복원 (되돌리기 기능)
 */
export function restoreItem(item, index = 0) {
  if (!item) return null;
  if (!Array.isArray(state.mappedData)) state.mappedData = [];
  const safeIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(index, state.mappedData.length))
    : 0;
  state.mappedData.splice(safeIndex, 0, item);
  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['mappedData']);
  }
  return item;
}

/**
 * 삭제된 입출고 기록 복원 (되돌리기 기능)
 */
export function restoreTransaction(tx, index = 0) {
  if (!tx) return null;
  if (!Array.isArray(state.transactions)) state.transactions = [];
  const safeIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(index, state.transactions.length))
    : 0;
  // 복원된 건은 다시 동기화 필요
  tx._synced = false;
  state.transactions.splice(safeIndex, 0, tx);

  // 재고 수량도 복원 (deleteTransaction에서 조정한 수량을 원복)
  const item = (state.mappedData || []).find(d =>
    String(d.itemName || '').trim() === String(tx.itemName || '').trim() ||
    (d.itemCode && tx.itemCode && String(d.itemCode).trim() === String(tx.itemCode).trim())
  );
  if (item) {
    const qty = toNum(tx.quantity);
    const currentQty = toNum(item.quantity);
    if (tx.type === 'in') {
      item.quantity = currentQty + qty;
    } else {
      item.quantity = Math.max(0, currentQty - qty);
    }
    recalcItemAmounts(item);
  }

  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['transactions', 'mappedData']);
  }
  return tx;
}

/**
 * 입출고 이력 기반으로 재고 수량 재계산
 * - transactions에 있는 품목이 mappedData에 없으면 자동 추가
 * - 이미 있는 품목은 수량만 갱신 (단가·카테고리 등 기존 정보 유지)
 * - 입고 합계 - 출고 합계 = 현재 재고
 */
export function rebuildInventoryFromTransactions() {
  const txs = [...(state.transactions || [])].sort((a, b) => {
    const da = new Date(a.date || a.createdAt || 0).getTime();
    const db = new Date(b.date || b.createdAt || 0).getTime();
    return da - db;
  });

  // 품목별 수량 집계 (key: itemCode 우선, 없으면 itemName)
  const itemQtyMap = {};
  const itemPriceMap = {};
  const itemInfoMap = {};

  txs.forEach(tx => {
    const key = (tx.itemCode && String(tx.itemCode).trim())
      ? String(tx.itemCode).trim()
      : String(tx.itemName || '').trim();
    if (!key) return;

    if (!itemQtyMap[key]) {
      itemQtyMap[key] = 0;
      itemPriceMap[key] = 0;
      itemInfoMap[key] = {
        itemName: String(tx.itemName || '').trim(),
        itemCode: String(tx.itemCode || '').trim(),
        vendor: String(tx.vendor || '').trim(),
      };
    }

    const qty = toNum(tx.quantity);
    if (tx.type === 'in') {
      const txPrice = toNum(tx.unitPrice);
      if (txPrice > 0) {
        // 가중평균 단가 계산
        const prevQty = itemQtyMap[key];
        const prevPrice = itemPriceMap[key];
        const totalQty = prevQty + qty;
        itemPriceMap[key] = totalQty > 0
          ? Math.round(((prevQty * prevPrice) + (qty * txPrice)) / totalQty)
          : txPrice;
      }
      itemQtyMap[key] += qty;
    } else {
      itemQtyMap[key] = Math.max(0, itemQtyMap[key] - qty);
    }
  });

  // mappedData에 반영
  Object.keys(itemQtyMap).forEach(key => {
    const newQty = itemQtyMap[key];
    const info = itemInfoMap[key];

    // 기존 품목 찾기
    const existing = (state.mappedData || []).find(d =>
      (info.itemCode && String(d.itemCode || '').trim() === info.itemCode) ||
      String(d.itemName || '').trim() === info.itemName
    );

    if (existing) {
      existing.quantity = newQty;
      // 단가 없으면 transactions에서 가져옴
      if (toNum(existing.unitPrice) === 0 && itemPriceMap[key] > 0) {
        existing.unitPrice = itemPriceMap[key];
      }
      recalcItemAmounts(existing);
    } else {
      // 새 품목 추가
      const price = itemPriceMap[key];
      const supplyValue = newQty * price;
      const vat = Math.floor(supplyValue * 0.1);
      const newItem = {
        itemName: info.itemName,
        itemCode: info.itemCode,
        category: '미분류',
        quantity: newQty,
        unit: 'EA',
        unitPrice: price,
        salePrice: 0,
        supplyValue,
        vat,
        totalPrice: supplyValue + vat,
        warehouse: '',
        note: '입출고 이력에서 자동 재계산',
        safetyStock: 0,
      };
      if (!Array.isArray(state.mappedData)) state.mappedData = [];
      state.mappedData.push(newItem);
    }
  });

  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['mappedData']);
  }
}
