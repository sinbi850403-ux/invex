/**
 * store.js - 앱 전체 데이터 저장소 (thin orchestrator)
 *
 * 저장 전략 (하이브리드):
 * 1. 메모리: 빠른 읽기 (getState)
 * 2. IndexedDB: 오프라인 캐시 + 즉시 저장
 * 3. Supabase: 클라우드 영구 저장 (로그인 시)
 *
 * 데이터 흐름:
 *   setState() → 메모리 갱신 → IndexedDB 저장 → Supabase 동기화 (디바운스)
 *   restoreState() → Supabase 로딩 → 메모리 적용 → IndexedDB 캐시
 *
 * 서브모듈:
 *   store/defaultState.js  — 초기 상태 상수
 *   store/stateRef.js      — stateHolder 공유 객체 + dispatchUpdate
 *   store/indexedDb.js     — openDB / saveToDB / loadFromDB
 *   store/supabaseSync.js  — syncToSupabase / scheduleSyncToSupabase
 *   store/realtimeSync.js  — setupRealtimeSync / cleanupRealtimeSync
 *   store/inventoryOps.js  — 입출고·재고 도메인 연산
 */

import { isSupabaseConfigured, supabase } from './supabase-client.js';
import * as db from './db.js';
import { managedQuery } from './traffic-manager.js';
import { DEFAULT_STATE } from './store/defaultState.js';
import { stateHolder, dispatchUpdate } from './store/stateRef.js';
import { saveToDB, loadFromDB, getUnsyncedTxsFromLS, clearUnsyncedTxsLS } from './store/indexedDb.js';
import { scheduleSyncToSupabase, cleanupDirtyKeys } from './store/supabaseSync.js';
import { setInventorySyncCallback, recalcItemAmounts } from './store/inventoryOps.js';

/**
 * restoreState 후 items.quantity=0이지만 transactions 합계가 >0인 품목 보정
 * Supabase 초기 업로드 시 수량=0으로 등록된 뒤 sync가 한 번도 성공하지 못한 경우 복원
 */
function _recalcMissingQuantities() {
  const items = stateHolder.current.mappedData;
  const txs = stateHolder.current.transactions;
  if (!Array.isArray(items) || !Array.isArray(txs) || items.length === 0 || txs.length === 0) return false;

  // 품목명 기준 순재고 계산
  const netMap = {};
  for (const tx of txs) {
    const k = String(tx.itemName || '').trim();
    if (!k) continue;
    if (netMap[k] === undefined) netMap[k] = 0;
    const qty = parseFloat(tx.quantity) || 0;
    netMap[k] += tx.type === 'in' ? qty : -qty;
  }

  let changed = false;
  for (const item of items) {
    const k = String(item.itemName || '').trim();
    const net = netMap[k];
    if (net > 0 && (item.quantity === 0 || item.quantity == null)) {
      item.quantity = Math.round(net * 1000) / 1000;
      changed = true;
    }
  }
  return changed;
}

/**
 * restoreState 후 품목 금액 자동 보정
 *
 * 문제 상황:
 *   items 테이블 unit_price = NULL (Excel 업로드 시 가격 미포함)
 *   트랜잭션에는 unit_price 있음 → 대시보드·요약·원가 분석에서 금액 "-" 표시
 *
 * 처리 순서:
 *   1. 입고 트랜잭션 가중평균 단가 맵 생성 (O(N))
 *   2. unitPrice 없는 품목에 트랜잭션 가중평균 단가 보정
 *   3. totalPrice 없는 품목에 recalcItemAmounts 호출
 */
function _recalcMissingTotalPrices() {
  const items = stateHolder.current.mappedData;
  const transactions = stateHolder.current.transactions;
  if (!Array.isArray(items) || items.length === 0) return;

  // 입고 트랜잭션 기반 품목별 가중평균 단가 맵
  const txPriceMap = new Map();
  if (Array.isArray(transactions)) {
    for (const tx of transactions) {
      if (tx.type !== 'in') continue;
      const name = String(tx.itemName || '').trim();
      if (!name) continue;
      const qty = parseFloat(tx.quantity) || 0;
      const price = parseFloat(tx.unitPrice) || 0;
      if (qty <= 0 || price <= 0) continue;
      const cur = txPriceMap.get(name) || { totalQty: 0, totalValue: 0 };
      cur.totalQty += qty;
      cur.totalValue += qty * price;
      txPriceMap.set(name, cur);
    }
  }

  for (const item of items) {
    const existingPrice = parseFloat(item.unitPrice) || 0;
    const existingTotal = parseFloat(item.totalPrice) || 0;

    // unitPrice 없으면 트랜잭션 가중평균으로 보정 (기존 값은 보호)
    if (existingPrice <= 0) {
      const name = String(item.itemName || '').trim();
      const txPriceData = txPriceMap.get(name);
      if (txPriceData && txPriceData.totalQty > 0) {
        item.unitPrice = Math.round(txPriceData.totalValue / txPriceData.totalQty);
      }
    }

    // totalPrice 없으면 (unitPrice 보정 포함) recalcItemAmounts
    if ((parseFloat(item.unitPrice) || 0) > 0 && existingTotal <= 0) {
      recalcItemAmounts(item);
    }
  }
}

import {
  setupRealtimeSync as _setupRealtimeSync,
  cleanupRealtimeSync as _cleanupRealtimeSync,
} from './store/realtimeSync.js';

export {
  recalcItemAmounts, addTransaction, addTransactionsBulk, updateTransactionPrices,
  deleteTransaction, deleteTransactionsBulk, setSafetyStock, addItem, updateItem, deleteItem,
  restoreItem, restoreTransaction, rebuildInventoryFromTransactions,
} from './store/inventoryOps.js';

/**
 * setupRealtimeSync 래퍼 — onReload 콜백을 외부에서 주입하지 않아도 restoreState를 기본으로 사용
 * 기존 호출자(AuthContext.jsx)가 setupRealtimeSync() 인자 없이 호출해도 동작하도록 보장
 */
export function setupRealtimeSync(onReload) {
  _setupRealtimeSync(onReload || restoreState);
}

/**
 * cleanupRealtimeSync 래퍼 — 채널 해제 + dirty keys 초기화까지 한 번에 처리
 * 로그아웃 시 이전 세션 dirty 데이터가 새 세션에 동기화되는 것 방지
 */
export function cleanupRealtimeSync() {
  _cleanupRealtimeSync();
  cleanupDirtyKeys();
}

// 상태 초기화
stateHolder.current = { ...DEFAULT_STATE };

// TOKEN_REFRESHED 이벤트가 이미 발생했는지 추적
let _tokenWasRefreshed = false;
window.addEventListener('invex:token-refreshed', () => { _tokenWasRefreshed = true; });

// 마지막 restoreState가 Supabase에서 실제 데이터를 가져왔는지 추적
let _supabaseLoadSucceeded = false;
export function wasLoadedFromSupabase() { return _supabaseLoadSucceeded; }

export function getState() {
  return stateHolder.current;
}

/**
 * 상태 업데이트 + 자동 저장 + 클라우드 동기화
 * @param {object} partial - 변경할 속성들
 */
let _syncCallback = null;

export function setSyncCallback(fn) {
  _syncCallback = fn;
  // inventoryOps에도 동일한 콜백 주입
  setInventorySyncCallback(fn);
}

// IDB 쓰기 디바운스 타이머 — 빠른 연속 setState 시 쓰기 폭증 방지
let _idbSaveTimer = null;
const IDB_DEBOUNCE_MS = 200;

export function setState(partial) {
  // 변경된 키 추적 (Supabase 부분 동기화용)
  const changedKeys = Object.keys(partial);

  stateHolder.current = { ...stateHolder.current, ...partial };
  dispatchUpdate(changedKeys);
  // IDB 쓰기 디바운스 — 200ms 내 연속 호출은 마지막 1회만 저장
  if (_idbSaveTimer !== null) clearTimeout(_idbSaveTimer);
  _idbSaveTimer = setTimeout(() => {
    _idbSaveTimer = null;
    saveToDB().catch(e => {
      console.warn('[Store] setState → saveToDB 실패:', e.message);
      window.dispatchEvent(new CustomEvent('invex:idb-failed', { detail: { reason: e.message } }));
    });
  }, IDB_DEBOUNCE_MS);
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
  stateHolder.current = { ...DEFAULT_STATE };
  dispatchUpdate(['*']);
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
                // 30초 이내 만료 또는 이미 만료 → TOKEN_REFRESHED 대기 (최대 2초)
                await new Promise(resolve => {
                  const timer = setTimeout(resolve, 2000);
                  window.addEventListener('invex:token-refreshed', () => {
                    clearTimeout(timer);
                    resolve();
                  }, { once: true });
                });
              }
            }
          } catch (_) { /* localStorage 파싱 오류 무시 */ }
        }

        // IndexedDB 먼저 로드 (로컬 캐시) — 두 가지 목적:
        //   ① 빈 클라우드 응답으로 로컬 데이터가 덮어씌워지는 것 방지
        //   ② onCriticalReady 콜백에서 캐시를 즉시 스토어에 적용 가능
        const localData = await loadFromDB();

        // Phase 1 완료 콜백: items+transactions 준비 즉시 스토어 갱신 → 화면 빠른 표시
        const onCriticalReady = (critical) => {
          critical.transactions?.forEach(tx => { tx._synced = true; });
          const safeCrit = { ...critical };
          if (!(safeCrit.mappedData?.length) && (localData?.mappedData?.length ?? 0) > 0) delete safeCrit.mappedData;
          if (!(safeCrit.transactions?.length) && (localData?.transactions?.length ?? 0) > 0) delete safeCrit.transactions;
          // 미동기화 로컬 트랜잭션 선(先) 병합
          if (safeCrit.transactions) {
            const unsynced = (localData?.transactions || []).filter(tx => !tx._synced);
            if (unsynced.length) {
              const cIds = new Set(safeCrit.transactions.map(t => t.id));
              const missing = unsynced.filter(tx => !cIds.has(tx.id));
              if (missing.length) safeCrit.transactions = [...missing, ...safeCrit.transactions];
            }
          }
          stateHolder.current = { ...DEFAULT_STATE, ...(localData || {}), ...safeCrit };
          _recalcMissingQuantities();
          _recalcMissingTotalPrices(); // total_price NULL 품목 보정 (금액 "-" 방지)
          dispatchUpdate(['mappedData', 'transactions', 'itemStocks', 'safetyStocks',
            'safetyStock', 'beginnerMode', 'dashboardMode', 'costMethod', 'currency',
            'visibleColumns', 'inventoryViewPrefs', 'inoutViewPrefs', 'tableSortPrefs']);
        };

        let cloudData = await managedQuery(() => db.loadAllData(onCriticalReady));

        // 여전히 0건이면 1회 재시도 (네트워크 일시 오류 또는 토큰 전파 지연 대응)
        const cloudItemCount = cloudData.mappedData?.length ?? 0;
        const cloudTxCount = cloudData.transactions?.length ?? 0;
        const looksPartialCloudLoad =
          (cloudItemCount === 0 && cloudTxCount === 0) ||
          (cloudItemCount > 0 && cloudTxCount === 0);
        if (looksPartialCloudLoad) {
          await new Promise(r => setTimeout(r, 400)); // 1500ms → 400ms
          const retry = await managedQuery(() => db.loadAllData());
          const retryItemCount = retry.mappedData?.length ?? 0;
          const retryTxCount = retry.transactions?.length ?? 0;
          if (retryItemCount > 0 || retryTxCount > 0) {
            cloudData = retry;
          }
        }

        // Supabase 데이터에 입출고는 _synced 표시
        if (cloudData.transactions) {
          cloudData.transactions.forEach(tx => { tx._synced = true; });
        }

        _supabaseLoadSucceeded =
          (cloudData.mappedData?.length ?? 0) > 0 ||
          (cloudData.transactions?.length ?? 0) > 0;

        //  오프라인에서 입력한 미동기화 트랜잭션 보호
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

        // localStorage 백업에서도 미동기화 트랜잭션 병합
        // — IDB 비동기 쓰기가 강력새로고침 전 완료되지 않았을 때 데이터 보호
        const lsUnsynced = getUnsyncedTxsFromLS();
        if (lsUnsynced.length > 0) {
          const mergedIds = new Set((cloudData.transactions || []).map(t => t.id));
          const lsMissing = lsUnsynced.filter(tx => !mergedIds.has(tx.id));
          if (lsMissing.length > 0) {
            cloudData.transactions = [...lsMissing, ...(cloudData.transactions || [])];
          }
        }
        clearUnsyncedTxsLS();

        // Supabase가 빈 배열을 반환했지만 로컬에 실제 데이터가 있으면 보호
        // — 토큰 갱신 타이밍, RLS 일시 차단, 네트워크 오류로 인한 데이터 소실 방지
        const safeCloudData = { ...cloudData };
        if ((safeCloudData.mappedData?.length ?? 0) === 0 && (localData?.mappedData?.length ?? 0) > 0) {
          delete safeCloudData.mappedData;
        }
        if ((safeCloudData.transactions?.length ?? 0) === 0 && (localData?.transactions?.length ?? 0) > 0) {
          delete safeCloudData.transactions;
        }
        //  주요 데이터 추가 보호 (빈 배열/객체로 덮어쓰기 방지)
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

        stateHolder.current = { ...DEFAULT_STATE, ...(localData || {}), ...safeCloudData };
        const _q1 = _recalcMissingQuantities();
        _recalcMissingTotalPrices(); // total_price NULL 품목 보정 (금액 "-" 방지)
        dispatchUpdate(['*']);
        saveToDB();
        if (_q1 && isSupabaseConfigured) scheduleSyncToSupabase(['mappedData']);
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
    // IDB에도 없는 미동기화 트랜잭션을 localStorage 백업에서 병합
    const lsUnsynced = getUnsyncedTxsFromLS();
    if (lsUnsynced.length > 0) {
      const idbIds = new Set((saved.transactions || []).map(t => t.id));
      const missing = lsUnsynced.filter(tx => !idbIds.has(tx.id));
      if (missing.length > 0) {
        saved.transactions = [...missing, ...(saved.transactions || [])];
      }
    }
    clearUnsyncedTxsLS();
    stateHolder.current = { ...DEFAULT_STATE, ...saved };
    const _q2 = _recalcMissingQuantities();
    _recalcMissingTotalPrices();
    dispatchUpdate(['*']);
    if (_q2 && isSupabaseConfigured) scheduleSyncToSupabase(['mappedData']);
    return;
  }

  // 3. localStorage 폴백 (최후 수단)
  try {
    const lsUnsynced = getUnsyncedTxsFromLS();
    const fallback = localStorage.getItem('invex-fallback');
    if (fallback) {
      const parsed = JSON.parse(fallback);
      // lsUnsynced 병합
      if (lsUnsynced.length > 0) {
        const ids = new Set((parsed.transactions || []).map(t => t.id));
        const missing = lsUnsynced.filter(tx => !ids.has(tx.id));
        if (missing.length > 0) {
          parsed.transactions = [...missing, ...(parsed.transactions || [])];
        }
      }
      stateHolder.current = { ...DEFAULT_STATE, ...parsed };
      const _q3 = _recalcMissingQuantities();
      dispatchUpdate(['*']);
      if (_q3 && isSupabaseConfigured) scheduleSyncToSupabase(['mappedData']);
    } else if (lsUnsynced.length > 0) {
      // invex-fallback도 없지만 미동기화 트랜잭션은 있는 경우
      stateHolder.current = { ...DEFAULT_STATE, transactions: lsUnsynced };
      _recalcMissingQuantities();
      dispatchUpdate(['*']);
    }
    clearUnsyncedTxsLS();
  } catch (_) { /* 무시 */ }
}
