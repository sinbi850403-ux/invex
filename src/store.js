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
  // 컬럼 표시 설정 (null이면 전체 표시, 배열이면 해당 키만 표시)
  visibleColumns: null, // ['itemName','quantity','unitPrice'] 형태
  // 각 mappedData row에는 expiryDate, lotNumber 필드도 포함 가능
};

let state = { ...DEFAULT_STATE };

// === IndexedDB 관련 ===
const DB_NAME = 'erp-lite-db';
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
      };
      localStorage.setItem('erp-lite-fallback', JSON.stringify(slim));
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
 * 상태 업데이트 + 자동 저장
 * @param {object} partial - 변경할 속성들
 */
export function setState(partial) {
  state = { ...state, ...partial };
  // 비동기로 저장 (UI 블로킹 방지)
  saveToDB();
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
    const fallback = localStorage.getItem('erp-lite-fallback');
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
    item.totalPrice = item.quantity * price;
  }

  saveToDB();
  return newTx;
}

/**
 * 입출고 기록 삭제
 */
export function deleteTransaction(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveToDB();
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
  state.mappedData.splice(index, 1);
  saveToDB();
}
