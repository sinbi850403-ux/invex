/**
 * inventoryOps.js - 입출고·재고 도메인 연산
 */

import { stateHolder, dispatchUpdate } from './stateRef.js';
import { saveToDB } from './indexedDb.js';
import { scheduleSyncToSupabase } from './supabaseSync.js';
import { isSupabaseConfigured, supabase } from '../supabase-client.js';
import * as db from '../db.js';

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

// _syncCallback은 store.js에서 주입 (순환 참조 없이 콜백 패턴 사용)
let _syncCallback = null;
export function setInventorySyncCallback(fn) { _syncCallback = fn; }

/**
 * 새 입출고 기록 추가
 * @param {object} tx - {type:'in'|'out', itemName, quantity, date, note, unitPrice}
 */
export function addTransaction(tx) {
  //  클라이언트 UUID 사용 → Supabase와 동일 ID 공유 → 삭제/upsert 정확히 동작
  const clientId = tx?.id || (
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );

  // 계산 필드 보정 (미제공 시 계산)
  const qty = toNum(tx.quantity);
  const unitPrice = toNum(tx.unitPrice);
  const supplyValue = tx.supplyValue || (unitPrice > 0 ? Math.round(unitPrice * qty) : 0);
  const vat = tx.vat || Math.ceil(supplyValue * 0.1);
  const totalAmount = tx.totalAmount || (supplyValue + vat);
  const actualSellingPrice = tx.actualSellingPrice || toNum(tx.sellingPrice);

  const newTx = {
    id: clientId,
    createdAt: new Date().toISOString(),
    ...tx,
    supplyValue,
    vat,
    totalAmount,
    actualSellingPrice,
  };
  stateHolder.current.transactions = [newTx, ...stateHolder.current.transactions];

  // 재고 데이터에 수량 반영
  const item = stateHolder.current.mappedData.find(d =>
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
        const costMethod = stateHolder.current.costMethod || 'weighted-avg';
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

    stateHolder.current.mappedData = [newItem, ...stateHolder.current.mappedData];
  }

  saveToDB();
  dispatchUpdate(['transactions', 'mappedData']);
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
    const clientId = tx?.id || (
      (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    );

    // 계산 필드 보정 (미제공 시 계산)
    const qty = toNum(tx.quantity);
    const unitPrice = toNum(tx.unitPrice);
    const supplyValue = tx.supplyValue || (unitPrice > 0 ? Math.round(unitPrice * qty) : 0);
    const vat = tx.vat || Math.ceil(supplyValue * 0.1);
    const totalAmount = tx.totalAmount || (supplyValue + vat);
    const actualSellingPrice = tx.actualSellingPrice || toNum(tx.sellingPrice);

    const newTx = {
      id: clientId,
      createdAt: new Date().toISOString(),
      ...tx,
      supplyValue,
      vat,
      totalAmount,
      actualSellingPrice,
    };
    newTxs.push(newTx);

    // 재고 수량 반영
    const item = stateHolder.current.mappedData.find(d =>
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
          const costMethod = stateHolder.current.costMethod || 'weighted-avg';
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
      stateHolder.current.mappedData = [
        { itemName: tx.itemName, itemCode: tx.itemCode || '', category: tx.category || '미분류',
          spec: tx.spec || '', quantity: qty, unit: tx.unit || 'EA', unitPrice: price,
          salePrice: 0, supplyValue, vat, totalPrice: supplyValue + vat,
          warehouse: tx.warehouse || '', note: '입출고 등록에 의한 자동 생성', safetyStock: 0 },
        ...stateHolder.current.mappedData,
      ];
    }
  }

  // 전체를 앞에 한 번에 추가
  stateHolder.current.transactions = [...newTxs, ...stateHolder.current.transactions];

  // IndexedDB 1번, sync 1번
  saveToDB();
  dispatchUpdate(['transactions', 'mappedData']);
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
 * 트랜잭션 가격 필드(판매가/실판매가) 부분 업데이트
 */
export function updateTransactionPrices(id, fields) {
  const tx = stateHolder.current.transactions.find(t => t.id === id);
  if (!tx) return false;
  const allowed = ['sellingPrice', 'actualSellingPrice'];
  allowed.forEach(key => {
    if (key in fields) tx[key] = fields[key];
  });
  saveToDB();
  if (_syncCallback) _syncCallback();

  //  Supabase에도 즉시 반영 (snake_case로 변환)
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

/**
 * 입출고 기록 삭제
 */
export function deleteTransaction(id) {
  const index = stateHolder.current.transactions.findIndex(t => t.id === id);
  if (index === -1) return null;
  const target = stateHolder.current.transactions[index];

  const item = (stateHolder.current.mappedData || []).find(d =>
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

  stateHolder.current.transactions.splice(index, 1);
  saveToDB();
  dispatchUpdate(['transactions', 'mappedData']);
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
  if (!stateHolder.current.safetyStock) stateHolder.current.safetyStock = {};
  stateHolder.current.safetyStock[itemName] = minQty;
  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['safetyStock']);
  }
}

/**
 * 품목 수동 추가
 */
export function addItem(item) {
  if (!stateHolder.current.mappedData) stateHolder.current.mappedData = [];
  stateHolder.current.mappedData.push(item);
  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['mappedData']);
  }
}

/**
 * 품목 수정
 */
export function updateItem(index, item) {
  if (stateHolder.current.mappedData[index]) {
    stateHolder.current.mappedData[index] = { ...stateHolder.current.mappedData[index], ...item };
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
  const deleted = stateHolder.current.mappedData[index];
  if (!deleted) return null;
  stateHolder.current.mappedData.splice(index, 1);
  saveToDB();

  // Supabase에서도 삭제
  if (isSupabaseConfigured) {
    if (deleted?._id) {
      // _id(UUID)가 있으면 정확히 삭제
      db.items.remove(deleted._id).catch(err =>
        console.warn('[Store] 품목 삭제 동기화 실패(_id):', err.message)
      );
    } else if (deleted?.itemName) {
      //  같은 세션 내 _id 미설정 시 item_name으로 폴백 삭제
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
  if (!Array.isArray(stateHolder.current.mappedData)) stateHolder.current.mappedData = [];
  const safeIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(index, stateHolder.current.mappedData.length))
    : 0;
  stateHolder.current.mappedData.splice(safeIndex, 0, item);
  saveToDB();
  dispatchUpdate(['mappedData']);
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
  if (!Array.isArray(stateHolder.current.transactions)) stateHolder.current.transactions = [];
  const safeIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(index, stateHolder.current.transactions.length))
    : 0;
  // 복원된 건은 다시 동기화 필요
  tx._synced = false;
  stateHolder.current.transactions.splice(safeIndex, 0, tx);

  // 재고 수량도 복원 (deleteTransaction에서 조정한 수량을 원복)
  const item = (stateHolder.current.mappedData || []).find(d =>
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
  dispatchUpdate(['transactions', 'mappedData']);
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
  const txs = [...(stateHolder.current.transactions || [])].sort((a, b) => {
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
    const existing = (stateHolder.current.mappedData || []).find(d =>
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
      if (!Array.isArray(stateHolder.current.mappedData)) stateHolder.current.mappedData = [];
      stateHolder.current.mappedData.push(newItem);
    }
  });

  saveToDB();
  if (isSupabaseConfigured) {
    scheduleSyncToSupabase(['mappedData']);
  }
}
