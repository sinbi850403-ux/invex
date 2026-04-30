/**
 * indexedDb.js - IndexedDB 오프라인 캐시 레이어
 */

import { stateHolder } from './stateRef.js';

// === IndexedDB 관련 (오프라인 캐시) ===
const DB_NAME = 'invex-db';
const DB_VERSION = 1;
const STORE_NAME = 'appState';

export function openDB() {
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

const LS_UNSYNCED_KEY = 'invex-unsynced-txs';

// IDB 비동기 쓰기 완료 전 강력새로고침이 발생해도 미동기화 트랜잭션 보호
// localStorage 쓰기는 동기 → 페이지 언로드 전 반드시 완료됨
function backupUnsyncedTxs() {
  if (!stateHolder.current) return;
  try {
    const unsynced = (stateHolder.current.transactions || []).filter(tx => !tx._synced);
    if (unsynced.length > 0) {
      localStorage.setItem(LS_UNSYNCED_KEY, JSON.stringify(unsynced));
    } else {
      localStorage.removeItem(LS_UNSYNCED_KEY);
    }
  } catch (_) {}
}

export function getUnsyncedTxsFromLS() {
  try {
    const raw = localStorage.getItem(LS_UNSYNCED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

export function clearUnsyncedTxsLS() {
  try { localStorage.removeItem(LS_UNSYNCED_KEY); } catch (_) {}
}

export async function saveToDB() {
  backupUnsyncedTxs(); // 동기 localStorage 백업 — IDB 쓰기 앞에 반드시 실행
  try {
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(stateHolder.current, 'current');
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
        mappedData: stateHolder.current.mappedData,
        transactions: stateHolder.current.transactions,
        safetyStock: stateHolder.current.safetyStock,
        documentDraft: stateHolder.current.documentDraft,
        fileName: stateHolder.current.fileName,
        currentStep: stateHolder.current.currentStep,
        beginnerMode: stateHolder.current.beginnerMode,
        dashboardMode: stateHolder.current.dashboardMode,
        tableSortPrefs: stateHolder.current.tableSortPrefs,
        inventoryViewPrefs: stateHolder.current.inventoryViewPrefs,
        inoutViewPrefs: stateHolder.current.inoutViewPrefs,
      };
      localStorage.setItem('invex-fallback', JSON.stringify(slim));
    } catch (_) { /* 무시 */ }
    // 사용자에게 오프라인 저장 실패 알림
    window.dispatchEvent(new CustomEvent('invex:idb-failed', { detail: { reason: e.message } }));
  }
}

export async function loadFromDB() {
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

export async function clearDB() {
  try {
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    idb.close();
    console.log('[Store] IndexedDB 초기화 완료');
  } catch (e) {
    console.warn('[Store] IndexedDB 초기화 실패:', e.message);
  }
}
