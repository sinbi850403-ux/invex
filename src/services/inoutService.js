/**
 * inoutService.js - 입출고 비즈니스 로직 서비스
 */
import { addTransaction, deleteTransaction, deleteTransactionsBulk, getState, setState } from '../store.js';
import { showToast } from '../toast.js';
import { addAuditLog } from '../audit-log.js';
import { accountEntries as accountEntriesDb } from '../db.js';

/**
 * 단건 입출고 등록
 * @param {object} data - tx 데이터
 * @param {boolean} canCreate - 권한 여부
 * @returns {boolean} 성공 여부
 */
export function createTransaction(data, canCreate) {
  if (!canCreate) {
    showToast('등록 권한이 없습니다. 직원 이상만 가능합니다.', 'warning');
    return false;
  }
  addTransaction(data);

  // 감사 로그
  const action = data.type === 'in' ? '입고' : '출고';
  addAuditLog(action, data.itemName || data.item_name || '알 수 없음', {
    quantity: data.quantity,
    vendor: data.vendor || '',
    date: data.date || '',
  });

  // 회계 자동 분개 (비동기, 실패해도 입출고 등록에 영향 없음)
  try {
    const qty = parseFloat(data.quantity) || 0;
    const unitPrice = parseFloat(String(data.unitPrice || '0').replace(/,/g, '')) || 0;
    const supply = Math.round(unitPrice * qty);
    const vat = Math.ceil(supply * 0.1);
    const totalAmount = supply + vat;

    if (totalAmount > 0) {
      const entryType = data.type === 'in' ? 'payable' : 'receivable';
      const entryData = {
        type: entryType,
        vendor_name: data.vendor || '',
        amount: totalAmount,
        currency: 'KRW',
        date: data.date || new Date().toISOString().slice(0, 10),
        status: 'pending',
        note: `[자동] ${data.type === 'in' ? '입고' : '출고'}: ${data.itemName || ''} ${qty}개`,
        ref_tx_id: data.id || '',
      };

      // store 상태 동기 업데이트 (즉시 반영)
      const state = getState();
      const newEntry = {
        ...entryData,
        id: `auto_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      setState({ accountEntries: [...(state.accountEntries || []), newEntry] });

      // Supabase 비동기 저장
      accountEntriesDb.create(entryData).catch(err => {
        console.warn('[inoutService] 회계 자동 분개 저장 실패:', err.message);
      });
    }
  } catch (err) {
    console.warn('[inoutService] 회계 자동 분개 오류:', err.message);
  }

  showToast(`${data.type === 'in' ? '입고' : '출고'} 등록 완료!`, 'success');
  return true;
}

/**
 * 단건 삭제 (confirm 포함)
 * @param {object} tx - 트랜잭션 객체 {id, type, itemName}
 * @param {boolean} canDelete
 * @returns {boolean}
 */
export function removeTransaction(tx, canDelete) {
  if (!canDelete) {
    showToast('삭제 권한이 없습니다.', 'warning');
    return false;
  }
  if (!confirm(`이 ${tx.type === 'in' ? '입고' : '출고'} 기록을 삭제하시겠습니까?\n품목: ${tx.itemName}`)) return false;
  deleteTransaction(tx.id);
  addAuditLog('삭제', tx.itemName || '알 수 없음', {
    type: tx.type === 'in' ? '입고' : '출고',
    quantity: tx.quantity,
    date: tx.date || '',
  });
  showToast('삭제되었습니다.', 'success');
  return true;
}

/**
 * 일괄 삭제 (confirm 포함)
 * @param {Set<string>} selectedIds
 * @param {boolean} canBulk
 * @returns {Promise<boolean>}
 */
export async function removeBulkTransactions(selectedIds, canBulk) {
  if (!canBulk) {
    showToast('일괄 삭제 권한이 없습니다. 매니저 이상만 가능합니다.', 'warning');
    return false;
  }
  if (!selectedIds.size) return false;
  if (!confirm(`선택한 ${selectedIds.size}건의 기록을 삭제하시겠습니까?`)) return false;
  const count = selectedIds.size;
  showToast(`${count}건 삭제 중...`, 'info');
  try {
    await deleteTransactionsBulk([...selectedIds]);
    addAuditLog('일괄삭제', `${count}건`, { count });
    showToast(`${count}건 삭제 완료`, 'success');
    return true;
  } catch (err) {
    showToast('삭제 중 오류가 발생했습니다.', 'error');
    console.error('[inoutService] 배치 삭제 실패:', err);
    return false;
  }
}
