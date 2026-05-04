/**
 * supabaseSync.js - Supabase 동기화 레이어 (디바운스)
 *
 * 디바운스 방식: setState가 호출될 때마다 API를 즉시 호출하지 않고,
 * 일정 시간(기본 2초) 대기 후 한 번에 Supabase에 동기화한다.
 */


import { stateHolder } from './stateRef.js';
import { saveToDB } from './indexedDb.js';
import * as db from '../db.js';
import { storeItemToDb, storeVendorToDb } from '../db.js';
import { getUserId } from '../db/core.js';
import { managedQuery, invalidateCache } from '../traffic-manager.js';
import { isSupabaseConfigured, supabase } from '../supabase-client.js';

// === Supabase 동기화 타이머 (디바운스) ===
let _supabaseSyncTimer = null;
// 변경된 데이터 키를 추적하여 최소한의 API 호출
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
  // BUG-002: 이미 구독 중이거나 대기 중이면 중복 구독 생성 방지
  // _authResumeSubscription 체크 추가 → 재진입 시 중복 리스너 누수 차단
  if (_authResumeSubscription || _waitingAuthResume || !isSupabaseConfigured) return;
  _waitingAuthResume = true;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      // 구독/플래그 먼저 정리 후 sync 호출 (sync 실패 시 재진입 가능하도록)
      const sub = _authResumeSubscription;
      _authResumeSubscription = null;
      _waitingAuthResume = false;
      sub?.unsubscribe?.();
      syncToSupabase();
    }
  });
  _authResumeSubscription = data?.subscription || null;
}

/**
 * 변경된 데이터만 Supabase에 동기화
 * 여러 개가 동시에 변경되면 한 번에 동기화. 단, 10,000개를 넘으면 분할 처리
 */
let _lastLocalSyncTime = 0; // 마지막 Supabase 성공 시각 (오류 시 Realtime으로 보완)
let _isSyncing = false;    // 현재 sync 진행 중 여부 — Realtime reload 중복 방지

export function getLastLocalSyncTime() {
  return _lastLocalSyncTime;
}

export function isSyncing() {
  return _isSyncing;
}

async function syncToSupabase() {
  if (!isSupabaseConfigured || _dirtyKeys.size === 0) return;
  // sync ?쒖옉 ?쒖젏????꾩뒪?ы봽 ?ㅼ젙 ??Realtime ?대깽???듭젣 李쎌쓣 利됱떆 ?쒖꽦??
  // (湲곗〈: ?꾨즺 ???ㅼ젙 ???꾨즺 ??Realtime??restoreState瑜?諛쒕룞?쒖폒 ?ш퀬?섎웾??0?쇰줈 珥덇린?붾릺??踰꾧렇)
  _lastLocalSyncTime = Date.now();
  _isSyncing = true;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    waitForAuthThenSync();
    return;
  }

  const keysToSync = new Set(_dirtyKeys);
  _dirtyKeys.clear();

  // ?ㅽ뙣???ㅻ? 異붿쟻???ъ떆??蹂댁옣
  const failedKeys = new Set();
  let authBlocked = false;

  try {
    const promises = [];

    // ?덈ぉ ?곗씠???숆린??
    if (keysToSync.has('mappedData')) {
      const items = (stateHolder.current.mappedData || []).map(item => storeItemToDb(item));
      promises.push(
        managedQuery(() => db.items.bulkUpsert(items))
          .then((savedItems) => {
            //  Supabase媛 諛섑솚??UUID瑜?state.mappedData._id??諛섏쁺
            // ??媛숈? ?몄뀡 ??deleteItem???뺥솗??UUID濡?Supabase ??젣 媛??
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
            console.warn('[Sync] ?덈ぉ ?숆린???ㅽ뙣:', getErrorMessage(err));
            if (isAuthLikeSyncError(err)) authBlocked = true;
            failedKeys.add('mappedData');
          })
      );
    }

    // ?낆텧怨??숆린?????덈줈 異붽???嫄대쭔
    if (keysToSync.has('transactions')) {
      // P1 수정: session.user.id(팀원 UID) → getUserId()(워크스페이스 컨텍스트 UID)
      // 팀 모드에서 창고를 생성할 때 팀원 UID가 아닌 오너 UID로 user_id를 설정해야
      // 다른 데이터(items/transactions)의 user_id와 일치하여 RLS 통과
      const syncUserId = await getUserId();
      // stateHolder 인메모리 데이터로 items/warehouses 조회 — DB 재조회 제거 (P1-4)
      // mappedData._id는 bulkUpsert 후 동기화되므로 최신 UUID 보유
      const dbItems = (stateHolder.current.mappedData || [])
        .map(item => ({ id: item._id, item_name: item.itemName }))
        .filter(item => item.id && item.item_name);

      let dbWarehouses = (stateHolder.current.warehouses || [])
        .map(w => ({ id: w._id || w.id, name: w.name }))
        .filter(w => w.name);
      const unsyncedTxs = (stateHolder.current.transactions || []).filter(tx => !tx._synced);
      const missingWarehouseNames = [...new Set(
        unsyncedTxs
          .map(tx => String(tx?.warehouse || '').trim())
          .filter(Boolean)
          .filter(name => !dbWarehouses.some(w => w.name === name))
      )];
      if (missingWarehouseNames.length > 0) {
        const rows = missingWarehouseNames.map(name => ({ user_id: syncUserId, name }));
        const { error: whError } = await supabase
          .from('warehouses')
          .upsert(rows, { onConflict: 'user_id,name' });
        if (whError) {
          console.warn('[Sync] warehouse upsert failed:', getErrorMessage(whError));
        } else {
          const { data: refreshedWarehouses = [] } = await supabase.from('warehouses')
            .select('id, name')
            .catch(() => ({ data: [] }));
          dbWarehouses = refreshedWarehouses;
        }
      }

      // warehouse 臾몄옄????warehouse_id UUID 蹂??
      const getWarehouseId = (warehouseName) => {
        const name = String(warehouseName || '').trim();
        if (!name) {
          return dbWarehouses.find(w => w.name === '본사 창고')?.id || dbWarehouses[0]?.id || null;
        }
        const warehouse = dbWarehouses.find(w => w.name === name);
        return warehouse ? warehouse.id : null;
      };

      // item_name 臾몄옄????item_id UUID 蹂??
      const getItemId = (itemName) => {
        if (!itemName) return null;
        const item = dbItems.find(m => m.item_name === itemName);
        return item ? item.id : null;
      };

      const newTxs = unsyncedTxs
        .map(tx => ({
          id: tx.id,            //  ?대씪?댁뼵??UUID ??Supabase? ?숈씪 ID 怨듭쑀 (upsert 硫깅벑??蹂댁옣)
          type: tx.type,
          item_id: getItemId(tx.itemName),
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
          txn_date: /^\d{4}-\d{2}-\d{2}$/.test(String(tx.date || '')) ? tx.date : null,
          vendor: tx.vendor,
          warehouse: tx.warehouse || null,
          warehouse_id: getWarehouseId(tx.warehouse),
          note: tx.note,
        }));

      if (newTxs.length > 0) {
        promises.push(
          managedQuery(() => db.transactions.bulkCreate(newTxs))
            .then(() => {
              stateHolder.current.transactions.forEach(tx => { tx._synced = true; });
            })
            .catch(err => {
              console.warn('[Sync] ?낆텧怨??숆린???ㅽ뙣:', getErrorMessage(err));
              if (isAuthLikeSyncError(err)) authBlocked = true;
              failedKeys.add('transactions');
            })
        );
      }
    }

    // 嫄곕옒泥??숆린????upsert(onConflict: user_id,name)濡??섏젙 ?댁슜??諛섏쁺
    //  _id(UUID)瑜?id濡??ы븿: ?대쫫 蹂寃???媛숈? row瑜??낅뜲?댄듃 (以묐났 ?앹꽦 諛⑹?)
    if (keysToSync.has('vendorMaster')) {
      const vendors = (stateHolder.current.vendorMaster || []).map(v => {
        const payload = storeVendorToDb(v);
        if (v._id) payload.id = v._id; // UUID 있으면 포함 → id conflict로 기존 row 업데이트
        return payload;
      });
      promises.push(
        managedQuery(() => db.vendors.upsertBulk(vendors)).catch(err => {
          console.warn('[Sync] 嫄곕옒泥??숆린???ㅽ뙣:', getErrorMessage(err));
          failedKeys.add('vendorMaster');
        })
      );

      //  ??젣??嫄곕옒泥?Supabase?먯꽌???쒓굅
      // _deletedVendors: setState濡??꾨떖????젣 紐⑸줉 (store?먯꽌 異붿쟻)
      const deletedVendors = stateHolder.current._deletedVendors || [];
      if (deletedVendors.length > 0) {
        for (const v of deletedVendors) {
          const del = v._id
            ? managedQuery(() => db.vendors.remove(v._id))
            : managedQuery(() => db.vendors.removeByName(v.name));
          promises.push(
            del.catch(err => console.warn('[Sync] 嫄곕옒泥???젣 ?숆린???ㅽ뙣:', getErrorMessage(err)))
          );
        }
        // 泥섎━ ??珥덇린??
        stateHolder.current._deletedVendors = [];
      }
    }

    // 留ㅼ텧/留ㅼ엯 ?꾪몴 ?숆린??
    if (keysToSync.has('accountEntries')) {
      const entries = (stateHolder.current.accountEntries || [])
        .filter(e => e.id && String(e.id).includes('-')) // UUID ?뺤떇留?sync (Date.now_ ?뺤떇? ?쒖쇅)
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
            console.warn('[Sync] 留ㅼ텧/留ㅼ엯 ?꾪몴 ?숆린???ㅽ뙣:', getErrorMessage(err));
            failedKeys.add('accountEntries');
          })
        );
      }
    }

    // 諛쒖＜???숆린??
    if (keysToSync.has('purchaseOrders')) {
      const orders = (stateHolder.current.purchaseOrders || [])
        .filter(o => o.id && String(o.id).includes('-')) // UUID ?뺤떇留?sync
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
            console.warn('[Sync] 諛쒖＜???숆린???ㅽ뙣:', getErrorMessage(err));
            failedKeys.add('purchaseOrders');
          })
        );
      }
    }

    // 李쎄퀬 ?대룞 ?숆린??
    if (keysToSync.has('transfers')) {
      const rows = (stateHolder.current.transfers || [])
        .filter(t => t.id && String(t.id).includes('-')) // UUID ?뺤떇留?sync
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
            console.warn('[Sync] 李쎄퀬 ?대룞 ?숆린???ㅽ뙣:', getErrorMessage(err));
            failedKeys.add('transfers');
          })
        );
      }
    }

    // ?ㅼ젙媛??숆린??
    const settingKeys = [
      'safetyStock', 'beginnerMode', 'dashboardMode', 'visibleColumns',
      'inventoryViewPrefs', 'inoutViewPrefs', 'tableSortPrefs',
      'costMethod', 'currency',
      'notificationReadMap', //  ?뚮┝ ?쎌쓬 ?곹깭 ???덈줈怨좎묠 ?꾩뿉???좎?
      'ledgerOpeningOverrides', //  ?섎텋遺 湲곗큹?ш퀬 ?섎룞 ?낅젰媛????ㅺ린湲??숆린??
    ];
    for (const key of settingKeys) {
      if (keysToSync.has(key) && stateHolder.current[key] !== undefined) {
        promises.push(
          managedQuery(() => db.settings.set(key, stateHolder.current[key]))
            .catch(err => { console.warn(`[Sync] ?ㅼ젙 ${key} ?숆린???ㅽ뙣:`, err?.message ?? err); failedKeys.add(key); })
        );
      }
    }

    await Promise.allSettled(promises);

    // ?ㅽ뙣???ㅻ뒗 ?ㅼ떆 dirty濡??깅줉???ъ떆??蹂댁옣
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
    _lastLocalSyncTime = Date.now();
  } catch (err) {
    // ?꾩껜 ?ㅽ뙣 ??紐⑤뱺 ??蹂듭썝
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
  } finally {
    _isSyncing = false;
  }
}

/**
 * ?붾컮?댁뒪??Supabase ?숆린???몃━嫄?(500ms)
 * setState媛 0.1珥?媛꾧꺽?쇰줈 ?곗냽 ?몄텧?????덉뼱??臾띠뼱??泥섎━
 */
export function scheduleSyncToSupabase(changedKeys) {
  changedKeys.forEach(k => _dirtyKeys.add(k));

  if (_supabaseSyncTimer) clearTimeout(_supabaseSyncTimer);
  _supabaseSyncTimer = setTimeout(() => {
    syncToSupabase();
  }, 500);
}

/**
 * 濡쒓렇?꾩썐 ??auth ?ъ떆??援щ룆 ?댁젣 + dirty keys 珥덇린??
 */
export function cleanupDirtyKeys() {
  if (_authResumeSubscription) {
    _authResumeSubscription.unsubscribe?.();
    _authResumeSubscription = null;
    _waitingAuthResume = false;
    _dirtyKeys.clear();
  }
}

// ?섏씠吏 ?몃줈??吏곸쟾 誘몃룞湲고솕 ?곗씠???뚮윭??
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (_dirtyKeys.size > 0) syncToSupabase();
  });
}
