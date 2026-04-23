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
  // 업종 템플릿
  industryTemplate: 'general', // 'general' | 'food' | 'clothing' | ...
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

function createStableId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeDateString(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function toLocalDateKey(value) {
  const direct = normalizeDateString(value);
  if (direct) return direct;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeTxType(value, tx = null) {
  const raw = normalizeText(value).toLowerCase();
  if (['in', '입고', '입', 'inbound', 'purchase', 'buy', '매입'].includes(raw)) return 'in';
  if (['out', '출고', '출', 'outbound', 'sale', 'sales', '판매', '매출'].includes(raw)) return 'out';

  const note = normalizeText(tx?.note).toLowerCase();
  if (['out', '출고', '출', '매출', '판매'].some((keyword) => note.includes(keyword))) return 'out';
  if (['in', '입고', '입', '매입', '초기재고'].some((keyword) => note.includes(keyword))) return 'in';

  const quantity = Number.parseFloat(String(tx?.quantity ?? '').replace(/,/g, '').trim());
  if (Number.isFinite(quantity) && quantity < 0) return 'out';
  // type이 비어 있거나 이상값이면 기본은 입고로 보정한다.
  // (기존에는 화면/삭제 로직에서 사실상 출고처럼 취급되어 오동작 가능)
  return 'in';
}

function buildBootstrapTransactionsFromItems(items = []) {
  const today = toLocalDateKey(new Date()) || normalizeDateString(new Date().toISOString());
  return (items || [])
    .map((item) => {
      const quantity = toNum(item?.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        id: createStableId('tx'),
        type: 'in',
        itemName: normalizeText(item?.itemName),
        itemCode: normalizeText(item?.itemCode),
        vendor: normalizeText(item?.vendor),
        warehouse: normalizeText(item?.warehouse),
        quantity,
        unitPrice: toNum(item?.unitPrice),
        sellingPrice: toNum(item?.salePrice),
        actualSellingPrice: 0,
        date: today,
        note: '초기재고 자동생성',
        createdAt: new Date().toISOString(),
        _synced: false,
      };
    })
    .filter(Boolean);
}

function ensureStableIds() {
  let changed = false;

  if (!Array.isArray(state.mappedData)) state.mappedData = [];
  state.mappedData.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const stableId = normalizeText(item.id ?? item._id) || createStableId('itm');
    if (item.id !== stableId) {
      item.id = stableId;
      changed = true;
    }
  });

  if (!Array.isArray(state.transactions)) state.transactions = [];
  state.transactions.forEach((tx) => {
    if (!tx || typeof tx !== 'object') return;
    const stableId = normalizeText(tx.id ?? tx._id) || createStableId('tx');
    if (tx.id !== stableId) {
      tx.id = stableId;
      changed = true;
    }

    const normalizedType = normalizeTxType(tx.type, tx);
    if (tx.type !== normalizedType) {
      tx.type = normalizedType;
      changed = true;
    }

    const normalizedDate = toLocalDateKey(tx.date) || toLocalDateKey(tx.createdAt);
    if (normalizedDate && tx.date !== normalizedDate) {
      tx.date = normalizedDate;
      changed = true;
    }

    if (!normalizeText(tx.itemCode) && normalizeText(tx.itemName)) {
      const matchedItem = state.mappedData.find((item) => normalizeText(item?.itemName) === normalizeText(tx.itemName));
      const fallbackCode = normalizeText(matchedItem?.itemCode);
      if (fallbackCode) {
        tx.itemCode = fallbackCode;
        changed = true;
      }
    }
  });

  return changed;
}

function validateItemPayload(item) {
  const itemName = normalizeText(item.itemName);
  if (!itemName) throw new Error('품목명은 필수입니다.');

  const quantity = toNum(item.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('수량은 0 이상의 숫자여야 합니다.');
  }

  const unitPrice = toNum(item.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error('원가는 0 이상의 숫자여야 합니다.');
  }

  const salePrice = toNum(item.salePrice);
  if (!Number.isFinite(salePrice) || salePrice < 0) {
    throw new Error('판매가는 0 이상의 숫자여야 합니다.');
  }

  if (item.lockedUntil && !normalizeDateString(item.lockedUntil)) {
    throw new Error('잠금 해제일 형식이 올바르지 않습니다. (YYYY-MM-DD)');
  }
}

function normalizeAndValidateTransaction(inputTx) {
  const tx = { ...inputTx };
  const type = tx.type === 'in' || tx.type === 'out' ? tx.type : '';
  if (!type) throw new Error('입출고 구분(type)은 in 또는 out 이어야 합니다.');

  const itemName = normalizeText(tx.itemName);
  if (!itemName) throw new Error('입출고 품목명은 필수입니다.');

  const quantity = toNum(tx.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('입출고 수량은 1 이상의 숫자여야 합니다.');
  }

  const unitPrice = toNum(tx.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error('입출고 원가는 0 이상의 숫자여야 합니다.');
  }

  const date = normalizeDateString(tx.date);
  if (!date) throw new Error('입출고 날짜는 YYYY-MM-DD 형식이어야 합니다.');

  return {
    ...tx,
    type,
    itemName,
    itemCode: normalizeText(tx.itemCode),
    vendor: normalizeText(tx.vendor),
    warehouse: normalizeText(tx.warehouse),
    note: tx.note == null ? '' : String(tx.note),
    quantity,
    unitPrice,
    date,
  };
}

function resolveItemIndex(target) {
  if (Number.isInteger(target)) {
    return target >= 0 && target < state.mappedData.length ? target : -1;
  }
  const id = normalizeText(
    typeof target === 'object' && target !== null
      ? (target.id ?? target._id)
      : target
  );
  if (!id) return -1;
  return state.mappedData.findIndex(item => normalizeText(item?.id) === id);
}

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
let _sessionProbePromise = null;

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

async function getActiveSessionSafe() {
  if (_sessionProbePromise) return _sessionProbePromise;

  _sessionProbePromise = supabase.auth
    .getSession()
    .then(({ data }) => data?.session || null)
    .catch((error) => {
      const message = getErrorMessage(error).toLowerCase();
      if (!message.includes('lock')) {
        console.warn('[Store] session check failed:', message || error);
      }
      return null;
    })
    .finally(() => {
      _sessionProbePromise = null;
    });

  return _sessionProbePromise;
}

/**
 * 변경된 데이터만 Supabase에 동기화
 * 왜 전체가 아닌 부분 동기화? → 품목 10,000개를 매번 보내면 느림
 */
async function syncToSupabase() {
  if (!isSupabaseConfigured || _dirtyKeys.size === 0) return;
  const session = await getActiveSessionSafe();
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
          .then(result => console.log(`[Sync] 품목 ${result.length}건 동기화`))
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
          type: tx.type,
          item_name: tx.itemName,
          item_code: tx.itemCode || null,
          quantity: tx.quantity,
          unit_price: tx.unitPrice || 0,
          selling_price: tx.sellingPrice || 0,
          actual_selling_price: tx.actualSellingPrice || 0,
          date: tx.date,
          vendor: tx.vendor,
          warehouse: tx.warehouse,
          note: tx.note,
        }));

      if (newTxs.length > 0) {
        promises.push(
          managedQuery(() => db.transactions.bulkCreate(newTxs))
            .then(result => {
              console.log(`[Sync] 입출고 ${result.length}건 동기화`);
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

    // 거래처 동기화 — bulkUpsert로 N+1 쿼리 제거 (거래처 수만큼 API 호출하던 문제 수정)
    if (keysToSync.has('vendorMaster')) {
      const vendors = (state.vendorMaster || []).map(v => ({
        name: v.name,
        type: v.type,
        biz_number: v.bizNumber,
        ceo_name: v.ceoName,
        contact_name: v.contactName,
        phone: v.phone,
        email: v.email,
        address: v.address,
        memo: v.memo,
      }));
      if (vendors.length > 0) {
        promises.push(
          managedQuery(() => db.vendors.bulkUpsert(vendors))
            .catch(err => { console.warn('[Sync] 거래처 일괄 저장 실패:', err.message); failedKeys.add('vendorMaster'); })
        );
      }
    }

    // 설정값 동기화
    const settingKeys = [
      'safetyStock', 'beginnerMode', 'dashboardMode', 'visibleColumns',
      'inventoryViewPrefs', 'inoutViewPrefs', 'tableSortPrefs',
      'industryTemplate', 'costMethod', 'currency',
    ];
    for (const key of settingKeys) {
      if (keysToSync.has(key) && state[key] !== undefined) {
        promises.push(
          managedQuery(() => db.settings.set(key, state[key]))
            .catch(err => { console.warn(`[Sync] 설정 ${key} 동기화 실패:`, err.message); failedKeys.add(key); })
        );
      }
    }

    await Promise.allSettled(promises);

    // 실패한 키는 다시 dirty로 등록해 재시도 보장
    if (failedKeys.size > 0) {
      failedKeys.forEach(k => _dirtyKeys.add(k));
      if (authBlocked) {
        waitForAuthThenSync();
        return;
      }
      window.dispatchEvent(new CustomEvent('invex:sync-failed', { detail: { keys: [...failedKeys] } }));
      console.warn('[Sync] 실패 항목 재시도 예약:', [...failedKeys]);
      // 10초 후 재시도 (즉시 재시도는 루프 위험)
      setTimeout(() => syncToSupabase(), 10_000);
    }
  } catch (err) {
    // 전체 실패 시 모든 키 복원
    keysToSync.forEach(k => _dirtyKeys.add(k));
    if (isAuthLikeSyncError(err)) {
      waitForAuthThenSync();
      return;
    }
    console.warn('[Sync] Supabase 동기화 전체 오류, 재시도 예약:', getErrorMessage(err));
    setTimeout(() => syncToSupabase(), 10_000);
  }
}

/**
 * 대기 중인 Supabase 동기화를 즉시 실행
 * 로그아웃 직전에 호출해 2초 디바운스 중 세션이 사라지기 전에 데이터를 저장한다.
 */
export async function flushPendingSync() {
  if (_supabaseSyncTimer) {
    clearTimeout(_supabaseSyncTimer);
    _supabaseSyncTimer = null;
  }
  if (_dirtyKeys.size > 0) {
    await syncToSupabase();
  }
}

/**
 * 디바운스된 Supabase 동기화 트리거
 * 왜 2초? → setState가 0.1초 간격으로 연속 호출될 수 있어서 묶어서 처리
 */
function scheduleSyncToSupabase(changedKeys) {
  changedKeys.forEach(k => _dirtyKeys.add(k));

  if (_supabaseSyncTimer) clearTimeout(_supabaseSyncTimer);
  _supabaseSyncTimer = setTimeout(() => {
    syncToSupabase();
  }, 2000);
}

// === Public API ===

export function getState() {
  ensureStableIds();
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
  ensureStableIds();
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
 * 상태 초기화 (메모리 + IndexedDB만)
 */
export function resetState() {
  state = { ...DEFAULT_STATE };
  _restorePromise = null; // 로그아웃 후 재로그인 시 재복원 허용
  _dirtyKeys.clear();     // 대기 중인 sync 취소 (초기화 후 빈 데이터가 sync되지 않도록)
  if (_supabaseSyncTimer) { clearTimeout(_supabaseSyncTimer); _supabaseSyncTimer = null; }
  ensureStableIds();
  window.dispatchEvent(new CustomEvent('invex:store-updated', { detail: { changedKeys: ['*'] } }));
  saveToDB();
  // localStorage fallback도 삭제
  try { localStorage.removeItem('invex-fallback'); } catch (_) {}
}

/**
 * 전체 데이터 초기화 (메모리 + IndexedDB + Supabase 모두 삭제)
 * setState({})만 하면 Supabase는 안 지워져서 재로그인 시 복원됨 — 이 함수로 해결
 */
export async function clearAllData() {
  // 1. Supabase에서 먼저 삭제
  if (isSupabaseConfigured) {
    const session = await getActiveSessionSafe();
    if (session?.user) {
      try {
        await db.deleteAllUserData();
        console.log('[Store] Supabase 전체 데이터 삭제 완료');
      } catch (err) {
        console.warn('[Store] Supabase 삭제 실패:', getErrorMessage(err));
        // DB 삭제 실패해도 로컬은 초기화 진행
      }
    }
  }
  // 2. 메모리 + IndexedDB 초기화
  resetState();
}

/**
 * 앱 시작 시 상태 복원
 * 전략: Supabase에서 먼저 로드 → 실패 시 IndexedDB 폴백
 *
 * idempotency: 이미 진행 중인 복원이 있으면 동일 Promise를 반환 (React StoreProvider
 * 가 페이지 이동마다 재마운트되어도 Supabase 중복 호출 방지)
 */
let _restorePromise = null;
export function restoreState() {
  if (_restorePromise) return _restorePromise;
  _restorePromise = _doRestoreState().finally(() => {
    // Promise 완료 후 null로 초기화 → 재로그인 시 새로 패치 허용
    // (진행 중엔 동일 Promise 반환해 중복 호출 방지, 완료 후엔 재사용 불가)
    _restorePromise = null;
  });
  return _restorePromise;
}

async function _doRestoreState() {
  // 1. Supabase에서 데이터 로딩 시도
  if (isSupabaseConfigured) {
    const session = await getActiveSessionSafe();
    if (session?.user) {
      try {
        console.log('[Store] Supabase에서 데이터 로딩 중...');
        const cloudData = await managedQuery(() => db.loadAllData());

        // 로컬 IndexedDB 전체를 먼저 읽어 두고, Supabase가 담당하는 키만 cloudData로 덮어쓴다.
        // 이렇게 해야 아직 Supabase 동기화 대상이 아닌 로컬 전용/미이관 데이터가
        // 로그인 후 복원 과정에서 DEFAULT_STATE로 날아가지 않는다.
        const localData = await loadFromDB();

        // Supabase가 빈 배열을 반환해도 IndexedDB 데이터를 보존한다.
        // (sync 미완료/네트워크 오류 상태에서 로그아웃 후 재로그인 시 데이터 유실 방지)
        const localTransactions = Array.isArray(localData?.transactions) ? localData.transactions : [];
        const cloudTransactions = Array.isArray(cloudData?.transactions) ? cloudData.transactions : [];
        const mergedTransactions = cloudTransactions.length > 0 ? cloudTransactions : localTransactions;

        // 품목 데이터도 동일 전략 적용 (Supabase 빈 배열이면 IndexedDB 우선)
        const localMappedData = Array.isArray(localData?.mappedData) ? localData.mappedData : [];
        const cloudMappedData = Array.isArray(cloudData?.mappedData) ? cloudData.mappedData : [];
        const mergedMappedData = cloudMappedData.length > 0 ? cloudMappedData : localMappedData;

        // Supabase에서 온 거래내역에는 _synced 표시
        if (cloudTransactions.length > 0) {
          mergedTransactions.forEach(tx => { tx._synced = true; });
        }

        state = { ...DEFAULT_STATE, ...(localData || {}), ...cloudData,
          mappedData: mergedMappedData,
          transactions: mergedTransactions,
        };
        let bootstrappedTransactions = false;
        if ((!state.transactions || state.transactions.length === 0) && (state.mappedData || []).length > 0) {
          state.transactions = buildBootstrapTransactionsFromItems(state.mappedData);
          bootstrappedTransactions = state.transactions.length > 0;
        }
        ensureStableIds();
        window.dispatchEvent(new CustomEvent('invex:store-updated', { detail: { changedKeys: ['*'] } }));
        // 로컬 캐시도 업데이트
        saveToDB();
        if (bootstrappedTransactions && isSupabaseConfigured) {
          scheduleSyncToSupabase(['transactions']);
        }
        console.log(`[Store] Supabase 로딩 완료: 품목 ${(cloudData.mappedData || []).length}건, 입출고 ${(cloudData.transactions || []).length}건`);
        return;
      } catch (err) {
        console.warn('[Store] Supabase 로딩 실패, IndexedDB로 폴백:', err.message);
      }
    } else {
      console.log('[Store] 활성 세션 없음, IndexedDB 복원 사용');
    }
  }

  // 2. IndexedDB에서 복원 (오프라인 or Supabase 미설정)
  const saved = await loadFromDB();
  if (saved) {
    state = { ...DEFAULT_STATE, ...saved };
    if ((!state.transactions || state.transactions.length === 0) && (state.mappedData || []).length > 0) {
      state.transactions = buildBootstrapTransactionsFromItems(state.mappedData);
      if (isSupabaseConfigured && state.transactions.length > 0) {
        scheduleSyncToSupabase(['transactions']);
      }
    }
    ensureStableIds();
    window.dispatchEvent(new CustomEvent('invex:store-updated', { detail: { changedKeys: ['*'] } }));
    return;
  }

  // 3. localStorage 폴백 (최후 수단)
  try {
    const fallback = localStorage.getItem('invex-fallback');
    if (fallback) {
      const parsed = JSON.parse(fallback);
      state = { ...DEFAULT_STATE, ...parsed };
      if ((!state.transactions || state.transactions.length === 0) && (state.mappedData || []).length > 0) {
        state.transactions = buildBootstrapTransactionsFromItems(state.mappedData);
        if (isSupabaseConfigured && state.transactions.length > 0) {
          scheduleSyncToSupabase(['transactions']);
        }
      }
      ensureStableIds();
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
  // Math.round: 부동소수점 오류 제거 (한국 원화는 원 단위, 소수점 없음)
  item.supplyValue = Math.round(qty * price);
  item.vat = Math.floor(item.supplyValue * vatRate);
  item.totalPrice = item.supplyValue + item.vat;
}

/**
 * 새 입출고 기록 추가
 * @param {object} tx - {type:'in'|'out', itemName, quantity, date, note, unitPrice}
 */
export function addTransaction(tx) {
  const validatedTx = normalizeAndValidateTransaction(tx);
  const newTx = {
    id: createStableId('tx'),
    createdAt: new Date().toISOString(),
    ...validatedTx,
  };
  state.transactions = [newTx, ...state.transactions];

  // 재고 데이터에 수량 반영
  const item = state.mappedData.find(d =>
    String(d.itemName || '').trim() === validatedTx.itemName ||
    (d.itemCode && validatedTx.itemCode && String(d.itemCode).trim() === validatedTx.itemCode)
  );
  if (item) {
    const qty = validatedTx.quantity;
    const currentQty = toNum(item.quantity);
    if (validatedTx.type === 'in') {
      item.quantity = currentQty + qty;
    } else {
      item.quantity = Math.max(0, currentQty - qty);
    }

    // 단가 업데이트: 입고 시 가중평균 단가 적용 (costMethod 설정 기반)
    const txPrice = validatedTx.unitPrice;
    const itemPrice = toNum(item.unitPrice);
    if (txPrice > 0) {
      if (validatedTx.type === 'in') {
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
    const qty = validatedTx.type === 'in' ? validatedTx.quantity : 0;
    const price = validatedTx.unitPrice;
    const supplyValue = qty * price;
    const vat = Math.floor(supplyValue * 0.1);

    const newItem = {
      id: createStableId('itm'),
      itemName: validatedTx.itemName,
      itemCode: validatedTx.itemCode || '',
      category: '미분류',
      quantity: qty,
      unit: 'EA',
      unitPrice: price,
      salePrice: 0,
      supplyValue: supplyValue,
      vat: vat,
      totalPrice: supplyValue + vat,
      warehouse: validatedTx.warehouse || '',
      note: '입출고 등록 자동 생성',
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
  return true;
}

export function deleteTransaction(idOrTx) {
  const normalizedId = normalizeText(
    typeof idOrTx === 'object' && idOrTx !== null ? (idOrTx.id ?? idOrTx._id) : idOrTx
  );
  const index = state.transactions.findIndex(t => normalizeText(t.id) === normalizedId);
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
  const nextItem = {
    ...item,
    id: normalizeText(item?.id ?? item?._id) || createStableId('itm'),
  };
  validateItemPayload(nextItem);
  state.mappedData.push(nextItem);
  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['mappedData']);
  }
  return nextItem;
}

/**
 * 품목 수정
 */
export function updateItem(target, item) {
  const index = resolveItemIndex(target);
  if (index < 0 || !state.mappedData[index]) return false;
  const merged = {
    ...state.mappedData[index],
    ...item,
  };
  merged.id = normalizeText(merged.id ?? merged._id) || createStableId('itm');
  validateItemPayload(merged);
  state.mappedData[index] = merged;
  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['mappedData']);
  }
  return true;
}

/**
 * 품목 삭제
 */
export function deleteItem(target) {
  const index = resolveItemIndex(target);
  if (index < 0) return null;
  const deleted = state.mappedData[index];
  if (!deleted) return null;
  state.mappedData.splice(index, 1);
  saveToDB();

  // Supabase에서도 삭제
  if (isSupabaseConfigured && deleted?._id) {
    db.items.remove(deleted._id).catch(err =>
      console.warn('[Store] 품목 삭제 동기화 실패:', err.message)
    );
  }
  if (isSupabaseConfigured) {
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
  const nextItem = {
    ...item,
    id: normalizeText(item?.id ?? item?._id) || createStableId('itm'),
  };
  validateItemPayload(nextItem);
  const safeIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(index, state.mappedData.length))
    : 0;
  state.mappedData.splice(safeIndex, 0, nextItem);
  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['mappedData']);
  }
  return nextItem;
}

/**
 * 삭제된 입출고 기록 복원 (되돌리기 기능)
 */
export function restoreTransaction(tx, index = 0) {
  if (!tx) return null;
  const validatedTx = normalizeAndValidateTransaction(tx);
  if (!Array.isArray(state.transactions)) state.transactions = [];
  const safeIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(index, state.transactions.length))
    : 0;
  // 복원된 건은 다시 동기화 필요
  const restoreTx = {
    ...validatedTx,
    id: normalizeText(tx.id ?? tx._id) || createStableId('tx'),
    _synced: false,
  };
  state.transactions.splice(safeIndex, 0, restoreTx);

  // 재고 수량도 복원 (deleteTransaction에서 조정한 수량을 원복)
  const item = (state.mappedData || []).find(d =>
    String(d.itemName || '').trim() === String(restoreTx.itemName || '').trim() ||
    (d.itemCode && restoreTx.itemCode && String(d.itemCode).trim() === String(restoreTx.itemCode).trim())
  );
  if (item) {
    const qty = toNum(restoreTx.quantity);
    const currentQty = toNum(item.quantity);
    if (restoreTx.type === 'in') {
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
  return restoreTx;
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
