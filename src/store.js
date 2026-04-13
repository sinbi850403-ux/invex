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

import { isSupabaseConfigured } from './supabase-client.js';
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

/**
 * 변경된 데이터만 Supabase에 동기화
 * 왜 전체가 아닌 부분 동기화? → 품목 10,000개를 매번 보내면 느림
 */
async function syncToSupabase() {
  if (!isSupabaseConfigured || _dirtyKeys.size === 0) return;

  const keysToSync = new Set(_dirtyKeys);
  _dirtyKeys.clear();

  try {
    const promises = [];

    // 품목 데이터 동기화
    if (keysToSync.has('mappedData')) {
      const items = (state.mappedData || []).map(item => storeItemToDb(item));
      promises.push(
        // managedQuery로 래핑 — 레이트 리밋 + 재시도 자동 적용
        managedQuery(() => db.items.bulkUpsert(items))
          .then(result => console.log(`[Sync] 품목 ${result.length}건 동기화`))
          .catch(err => console.warn('[Sync] 품목 동기화 실패:', err.message))
      );
    }

    // 입출고 동기화 — 새로 추가된 건만 (기존 건은 이미 서버에 있음)
    if (keysToSync.has('transactions')) {
      // Supabase에 없는 새 트랜잭션만 식별
      // _id가 없으면 아직 서버에 안 올라간 것
      const newTxs = (state.transactions || [])
        .filter(tx => !tx._synced)
        .map(tx => ({
          type: tx.type,
          item_name: tx.itemName,
          quantity: tx.quantity,
          unit_price: tx.unitPrice || 0,
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
              // 동기화 완료 표시
              state.transactions.forEach(tx => { tx._synced = true; });
            })
            .catch(err => console.warn('[Sync] 입출고 동기화 실패:', err.message))
        );
      }
    }

    // 거래처 동기화
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
      // 거래처는 upsert 미지원이라 개별 생성 시도 (중복은 무시)
      for (const vendor of vendors) {
        promises.push(
          managedQuery(() => db.vendors.create(vendor)).catch(() => { /* 중복 무시 */ })
        );
      }
    }

    // 설정값 동기화 (key-value 형태)
    const settingKeys = [
      'safetyStock', 'beginnerMode', 'dashboardMode', 'visibleColumns',
      'inventoryViewPrefs', 'inoutViewPrefs', 'tableSortPrefs',
      'industryTemplate', 'costMethod', 'currency',
    ];
    for (const key of settingKeys) {
      if (keysToSync.has(key) && state[key] !== undefined) {
        promises.push(
          managedQuery(() => db.settings.set(key, state[key]))
            .catch(err => console.warn(`[Sync] 설정 ${key} 동기화 실패:`, err.message))
        );
      }
    }

    await Promise.allSettled(promises);
  } catch (err) {
    console.warn('[Sync] Supabase 동기화 오류:', err.message);
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
  // 비동기로 로컬 저장 (UI 블로킹 방지)
  saveToDB();
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
  saveToDB();
}

/**
 * 앱 시작 시 상태 복원
 * 전략: Supabase에서 먼저 로드 → 실패 시 IndexedDB 폴백
 */
export async function restoreState() {
  // 1. Supabase에서 데이터 로딩 시도
  if (isSupabaseConfigured) {
    try {
      console.log('[Store] Supabase에서 데이터 로딩 중...');
      const cloudData = await managedQuery(() => db.loadAllData());

      // 로컬 IndexedDB에서 UI 설정만 로드 (Supabase에 없는 것들)
      const localData = await loadFromDB();
      const localOnly = {};
      if (localData) {
        // Supabase에 저장하지 않는 로컬 전용 데이터
        const localOnlyKeys = [
          'rawData', 'sheetNames', 'activeSheet', 'fileName',
          'columnMapping', 'currentStep', 'allSheets',
          'activeWarehouseFilter', 'currentPlan', 'subscription',
          'paymentHistory', 'adminUsers', 'adminNotices',
          'notificationReadMap', 'notificationDeliveryLog',
          'notificationChannelPrefs', 'ledgerOpeningOverrides',
          'warehouses', 'roles', 'members', 'apiKeys', 'webhooks',
          'userName',
        ];
        localOnlyKeys.forEach(key => {
          if (localData[key] !== undefined) {
            localOnly[key] = localData[key];
          }
        });
      }

      // Supabase 데이터에 입출고는 _synced 표시
      if (cloudData.transactions) {
        cloudData.transactions.forEach(tx => { tx._synced = true; });
      }

      state = { ...DEFAULT_STATE, ...localOnly, ...cloudData };
      // 로컬 캐시도 업데이트
      saveToDB();
      console.log(`[Store] Supabase 로딩 완료: 품목 ${(cloudData.mappedData || []).length}건, 입출고 ${(cloudData.transactions || []).length}건`);
      return;
    } catch (err) {
      console.warn('[Store] Supabase 로딩 실패, IndexedDB로 폴백:', err.message);
    }
  }

  // 2. IndexedDB에서 복원 (오프라인 or Supabase 미설정)
  const saved = await loadFromDB();
  if (saved) {
    state = { ...DEFAULT_STATE, ...saved };
    return;
  }

  // 3. localStorage 폴백 (최후 수단)
  try {
    const fallback = localStorage.getItem('invex-fallback') || localStorage.getItem('erp-lite-fallback');
    if (fallback) {
      const parsed = JSON.parse(fallback);
      state = { ...DEFAULT_STATE, ...parsed };
    }
  } catch (_) { /* 무시 */ }
}

// === 입출고 관련 유틸 ===

/**
 * 새 입출고 기록 추가
 * @param {object} tx - {type:'in'|'out', itemName, quantity, date, note, unitPrice}
 */
export function addTransaction(tx) {
  const newTx = {
    id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    createdAt: new Date().toISOString(),
    ...tx,
  };
  state.transactions = [newTx, ...state.transactions];

  // 재고 데이터에 수량 반영
  const item = state.mappedData.find(d =>
    d.itemName === tx.itemName ||
    (d.itemCode && d.itemCode === tx.itemCode)
  );
  if (item) {
    const qty = parseFloat(tx.quantity) || 0;
    const currentQty = parseFloat(item.quantity) || 0;
    if (tx.type === 'in') {
      item.quantity = currentQty + qty;
    } else {
      item.quantity = Math.max(0, currentQty - qty);
    }
    // 합계금액 재계산
    const price = parseFloat(item.unitPrice) || 0;
    item.supplyValue = item.quantity * price;
    item.vat = Math.floor(item.supplyValue * 0.1);
    item.totalPrice = item.supplyValue + item.vat;
  }

  saveToDB();
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
export function deleteTransaction(id) {
  const target = state.transactions.find(t => t.id === id);
  if (target) {
    const item = (state.mappedData || []).find(d =>
      d.itemName === target.itemName ||
      (d.itemCode && d.itemCode === target.itemCode)
    );
    if (item) {
      const qty = parseFloat(target.quantity) || 0;
      const currentQty = parseFloat(item.quantity) || 0;
      if (target.type === 'in') {
        item.quantity = Math.max(0, currentQty - qty);
      } else {
        item.quantity = currentQty + qty;
      }
      const price = parseFloat(item.unitPrice) || 0;
      item.supplyValue = item.quantity * price;
      item.vat = Math.floor(item.supplyValue * 0.1);
      item.totalPrice = item.supplyValue + item.vat;
    }

    // Supabase에서도 삭제
    if (isSupabaseConfigured && target._synced) {
      db.transactions.remove(target.id).catch(err =>
        console.warn('[Store] 입출고 삭제 동기화 실패:', err.message)
      );
    }
  }
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['mappedData']);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notifications-updated'));
  }
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
  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['transactions']);
  }
  return tx;
}
