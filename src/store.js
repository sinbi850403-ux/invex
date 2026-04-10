/**
 * store.js - 앱 전체 데이터 저장소
 * 왜 IndexedDB? → localStorage는 5MB 제한이 있어서 대용량 엑셀 데이터를 저장할 수 없음
 * IndexedDB는 수백MB까지 저장 가능하므로 실무에서 안정적
 */

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
  // 최근 업로드 변경 요약
  lastUploadDiff: null, // {added, updated, unchanged, removed, fileName, at}
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
};

let state = { ...DEFAULT_STATE };

// === IndexedDB 관련 ===
const DB_NAME = 'invex-db';
const DB_VERSION = 1;
const STORE_NAME = 'appState';

/**
 * IndexedDB 열기
 */
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

/**
 * IndexedDB에 상태 저장
 */
async function saveToDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(state, 'current');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  } catch (e) {
    console.warn('IndexedDB 저장 실패:', e.message);
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
        lastUploadDiff: state.lastUploadDiff,
      };
      localStorage.setItem('invex-fallback', JSON.stringify(slim));
    } catch (_) { /* 무시 */ }
  }
}

/**
 * IndexedDB에서 상태 복원
 */
async function loadFromDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('current');

    return new Promise((resolve) => {
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch (e) {
    console.warn('IndexedDB 읽기 실패:', e.message);
    return null;
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
// 클라우드 동기화 콜백 (외부에서 주입)
let _syncCallback = null;

export function setSyncCallback(fn) {
  _syncCallback = fn;
}

export function setState(partial) {
  state = { ...state, ...partial };
  // 비동기로 로컬 저장 (UI 블로킹 방지)
  saveToDB();
  // 클라우드 동기화 트리거 (설정된 경우)
  if (_syncCallback) _syncCallback();
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
 */
export async function restoreState() {
  const saved = await loadFromDB();
  if (saved) {
    // 새 필드가 추가됐을 수 있으므로 DEFAULT와 머지
    state = { ...DEFAULT_STATE, ...saved };
    return;
  }

  // IndexedDB에 없으면 localStorage 폴백 시도
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
  return newTx;
}

/**
 * 입출고 기록 삭제
 */
export function deleteTransaction(id) {
  const index = state.transactions.findIndex(t => t.id === id);
  if (index < 0) return null;
  const [deleted] = state.transactions.splice(index, 1);
  saveToDB();
  return { deleted, index };
}

/**
 * 입출고 기록 복원
 */
export function restoreTransaction(tx, index = 0) {
  if (!tx) return null;
  if (!Array.isArray(state.transactions)) state.transactions = [];
  const safeIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(index, state.transactions.length))
    : 0;
  state.transactions.splice(safeIndex, 0, tx);
  saveToDB();
  return tx;
}

/**
 * 안전재고 설정
 */
export function setSafetyStock(itemName, minQty) {
  if (!state.safetyStock) state.safetyStock = {};
  state.safetyStock[itemName] = minQty;
  saveToDB();
}

/**
 * 품목 수동 추가
 */
export function addItem(item) {
  if (!state.mappedData) state.mappedData = [];
  state.mappedData.push(item);
  saveToDB();
}

/**
 * 품목 수정
 */
export function updateItem(index, item) {
  if (state.mappedData[index]) {
    state.mappedData[index] = { ...state.mappedData[index], ...item };
    saveToDB();
  }
}

/**
 * 품목 삭제
 */
export function deleteItem(index) {
  if (!Array.isArray(state.mappedData)) return null;
  if (index < 0 || index >= state.mappedData.length) return null;
  const [deleted] = state.mappedData.splice(index, 1);
  saveToDB();
  return { deleted, index };
}

/**
 * 품목 복원
 */
export function restoreItem(item, index = 0) {
  if (!item) return null;
  if (!Array.isArray(state.mappedData)) state.mappedData = [];
  const safeIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(index, state.mappedData.length))
    : 0;
  state.mappedData.splice(safeIndex, 0, item);
  saveToDB();
  return item;
}
