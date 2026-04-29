/**
 * supabaseSync.js - Supabase 클라우드 동기화 레이어 (디바운스)
 *
 * 왜 디바운스? → setState가 연속 호출될 때 매번 API 쏘면 과부하
 */

import { stateHolder } from './stateRef.js';
import { saveToDB } from './indexedDb.js';
import * as db from '../db.js';
import { storeItemToDb } from '../db.js';
import { managedQuery, invalidateCache } from '../traffic-manager.js';
import { isSupabaseConfigured, supabase } from '../supabase-client.js';

// === Supabase 동기화 (디바운스) ===
let _supabaseSyncTimer = null;
// 어떤 데이터가 변경됐는지 추적
let _dirtyKeys = new Set();
let _waitingAuthResume = false;
let _authResumeSubscription = null;
let _syncRetryCount = 0;
const MAX_SYNC_RETRIES = 5;

export function getErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string') return error.message;
  if (typeof error.error_description === 'string') return error.error_description;
  return String(error);
}

export function isAuthLikeSyncError(error) {
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

export function waitForAuthThenSync() {
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

export function getLastLocalSyncTime() {
  return _lastLocalSyncTime;
}

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
      const items = (stateHolder.current.mappedData || []).map(item => storeItemToDb(item));
      promises.push(
        managedQuery(() => db.items.bulkUpsert(items))
          .then((savedItems) => {
            //  Supabase가 반환한 UUID를 state.mappedData._id에 반영
            // → 같은 세션 내 deleteItem이 정확한 UUID로 Supabase 삭제 가능
            if (Array.isArray(savedItems) && savedItems.length > 0) {
              savedItems.forEach(saved => {
                const storeItem = stateHolder.current.mappedData.find(m =>
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
      const newTxs = (stateHolder.current.transactions || [])
        .filter(tx => !tx._synced)
        .map(tx => ({
          id: tx.id,            //  클라이언트 UUID → Supabase와 동일 ID 공유 (upsert 멱등성 보장)
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
          color: tx.color || null,
          date: tx.date,
          vendor: tx.vendor,
          warehouse: tx.warehouse,
          note: tx.note,
        }));

      if (newTxs.length > 0) {
        promises.push(
          managedQuery(() => db.transactions.bulkCreate(newTxs))
            .then(() => {
              stateHolder.current.transactions.forEach(tx => { tx._synced = true; });
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
    //  _id(UUID)를 id로 포함: 이름 변경 시 같은 row를 업데이트 (중복 생성 방지)
    if (keysToSync.has('vendorMaster')) {
      const vendors = (stateHolder.current.vendorMaster || []).map(v => {
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
      promises.push(
        managedQuery(() => db.vendors.upsertBulk(vendors)).catch(err => {
          console.warn('[Sync] 거래처 동기화 실패:', getErrorMessage(err));
          failedKeys.add('vendorMaster');
        })
      );

      //  삭제된 거래처 Supabase에서도 제거
      // _deletedVendors: setState로 전달된 삭제 목록 (store에서 추적)
      const deletedVendors = stateHolder.current._deletedVendors || [];
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
        stateHolder.current._deletedVendors = [];
      }
    }

    // 매출/매입 전표 동기화
    if (keysToSync.has('accountEntries')) {
      const entries = (stateHolder.current.accountEntries || [])
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
      const orders = (stateHolder.current.purchaseOrders || [])
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
      const rows = (stateHolder.current.transfers || [])
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
      'notificationReadMap', //  알림 읽음 상태 — 새로고침 후에도 유지
      'ledgerOpeningOverrides', //  수불부 기초재고 수동 입력값 — 다기기 동기화
    ];
    for (const key of settingKeys) {
      if (keysToSync.has(key) && stateHolder.current[key] !== undefined) {
        promises.push(
          managedQuery(() => db.settings.set(key, stateHolder.current[key]))
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
export function scheduleSyncToSupabase(changedKeys) {
  changedKeys.forEach(k => _dirtyKeys.add(k));

  if (_supabaseSyncTimer) clearTimeout(_supabaseSyncTimer);
  _supabaseSyncTimer = setTimeout(() => {
    syncToSupabase();
  }, 500);
}

/**
 * 로그아웃 시 auth 재시도 구독 해제 + dirty keys 초기화
 */
export function cleanupDirtyKeys() {
  if (_authResumeSubscription) {
    _authResumeSubscription.unsubscribe?.();
    _authResumeSubscription = null;
    _waitingAuthResume = false;
    _dirtyKeys.clear();
  }
}

// 페이지 언로드 직전 미동기화 데이터 플러시
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (_dirtyKeys.size > 0) syncToSupabase();
  });
}
