/**
 * inoutService.js - 입출고 비즈니스 로직 서비스
 */
import { addTransaction, deleteTransaction, deleteTransactionsBulk } from '../store.js';
import { showToast } from '../toast.js';

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
    showToast(`${count}건 삭제 완료`, 'success');
    return true;
  } catch (err) {
    showToast('삭제 중 오류가 발생했습니다.', 'error');
    console.error('[inoutService] 배치 삭제 실패:', err);
    return false;
  }
}
