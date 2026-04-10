/**
 * firebase-sync.js - Firestore 클라우드 동기화
 * 역할: 로컬 데이터를 Firestore에 자동 동기화 (양방향)
 * 왜 필요? → PC/모바일 어디서든 같은 데이터. 데이터 유실 방지.
 */

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, isConfigured } from './firebase-config.js';
import { getCurrentUser } from './firebase-auth.js';
import { getState, setState } from './store.js';
import { showToast } from './toast.js';

let unsubscribe = null;
let isSyncing = false;
let lastSyncTime = null;

/**
 * 클라우드 동기화 시작
 * 사용자 로그인 후 호출
 */
export function startSync(userId) {
  if (!isConfigured || !userId) return;

  const docRef = doc(db, 'workspaces', userId);

  // 실시간 동기화 리스너
  unsubscribe = onSnapshot(docRef, (docSnap) => {
    if (isSyncing) return; // 내가 업로드한 변경은 무시

    if (docSnap.exists()) {
      const cloudData = docSnap.data();
      const cloudTime = cloudData._lastSync || 0;
      const localTime = lastSyncTime || 0;

      // 클라우드가 더 최신이면 로컬에 반영
      if (cloudTime > localTime) {
        const { _lastSync, ...data } = cloudData;
        setState(data);
        lastSyncTime = cloudTime;
        console.log('[Sync] 클라우드 → 로컬 동기화 완료');
      }
    }
  }, (error) => {
    console.warn('[Sync] 실시간 동기화 에러:', error.message);
  });
}

/**
 * 로컬 → 클라우드 업로드
 * 데이터 변경 시 호출 (디바운스 적용)
 */
let saveTimer = null;

export function syncToCloud() {
  if (!isConfigured) return;
  
  const user = getCurrentUser();
  if (!user) return;

  // 2초 디바운스: 빠른 연속 변경 시 마지막 것만 저장
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      isSyncing = true;
      const state = getState();
      const now = Date.now();

      // 민감하지 않은 데이터만 동기화
      const syncData = {
        mappedData: state.mappedData || [],
        mappingConfig: state.mappingConfig || null,
        transactions: state.transactions || [],
        transfers: state.transfers || [],
        vendorMaster: state.vendorMaster || [],
        accountEntries: state.accountEntries || [],
        purchaseOrders: state.purchaseOrders || [],
        stocktakeHistory: state.stocktakeHistory || [],
        customFields: state.customFields || [],
        industryTemplate: state.industryTemplate || 'general',
        costMethod: state.costMethod || 'weighted-avg',
        currency: state.currency || { code: 'KRW', symbol: '₩', rate: 1 },
        _lastSync: now,
      };

      const docRef = doc(db, 'workspaces', user.uid);
      await setDoc(docRef, syncData, { merge: true });
      
      lastSyncTime = now;
      isSyncing = false;
      console.log('[Sync] 로컬 → 클라우드 동기화 완료');
    } catch (error) {
      isSyncing = false;
      console.warn('[Sync] 업로드 실패:', error.message);
    }
  }, 2000);
}

/**
 * 동기화 중지
 * 로그아웃 시 호출
 */
export function stopSync() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  clearTimeout(saveTimer);
  lastSyncTime = null;
}

/**
 * 수동 전체 동기화
 */
export async function forceSync() {
  if (!isConfigured) {
    showToast('Firebase가 설정되지 않았습니다.', 'info');
    return;
  }

  const user = getCurrentUser();
  if (!user) {
    showToast('로그인이 필요합니다.', 'warning');
    return;
  }

  try {
    // 현재 로컬 데이터를 클라우드로 강제 업로드
    isSyncing = true;
    const state = getState();
    const now = Date.now();

    const docRef = doc(db, 'workspaces', user.uid);
    await setDoc(docRef, {
      ...state,
      _lastSync: now,
    });

    lastSyncTime = now;
    isSyncing = false;
    showToast('클라우드에 전체 동기화 완료 ☁️', 'success');
  } catch (error) {
    isSyncing = false;
    showToast('동기화 실패: ' + error.message, 'error');
  }
}

/**
 * 동기화 상태 반환
 */
export function getSyncStatus() {
  return {
    isConfigured,
    isConnected: !!unsubscribe,
    lastSync: lastSyncTime ? new Date(lastSyncTime).toLocaleString('ko-KR') : '없음',
  };
}
