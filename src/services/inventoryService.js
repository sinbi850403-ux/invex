/**
 * inventoryService.js - 재고 비즈니스 로직 서비스
 */
import { deleteItem, rebuildInventoryFromTransactions } from '../store.js';
import { showToast } from '../toast.js';
import { addAuditLog } from '../audit-log.js';

/**
 * 품목 삭제 (confirm 포함)
 * @param {number} id - 품목 인덱스
 * @param {string} itemName - 품목명 (confirm 메시지용)
 * @param {boolean} canDelete - 권한 여부
 * @returns {boolean} 성공 여부
 */
export function removeItem(id, itemName, canDelete) {
  if (!canDelete) {
    showToast('삭제 권한이 없습니다.', 'warning');
    return false;
  }
  if (!confirm(`"${itemName}" 품목을 삭제하시겠습니까?`)) return false;
  deleteItem(id);
  addAuditLog('품목삭제', itemName || id, { id });
  showToast('품목이 삭제되었습니다.', 'success');
  return true;
}

/**
 * 재고 재계산
 * 트랜잭션 이력 기반으로 재고 수량을 전체 재계산합니다.
 */
export function rebuildInventory() {
  rebuildInventoryFromTransactions();
  addAuditLog('재고재계산', '전체 품목', { action: '이동평균원가 재계산' });
  showToast('재고를 재계산했습니다.', 'success');
}
