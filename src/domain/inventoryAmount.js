/**
 * inventoryAmount.js — 수량×단가 기반 금액 계산 공통 모듈
 * 업로드 즉시 반영 경로(page-upload)와 매핑 확인 경로(page-mapping) 양쪽에서 동일한 계산 기준 적용
 */

const VAT_RATE = 0.1;

/**
 * 수량과 단가로 공급가액/부가세/합계를 계산
 * @param {number} quantity
 * @param {number} unitPrice
 * @returns {{ supplyValue: number, vat: number, totalPrice: number }}
 */
export function calcAmount(quantity, unitPrice) {
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const supplyValue = qty * price;
  const vat = Math.floor(supplyValue * VAT_RATE);
  return { supplyValue, vat, totalPrice: supplyValue + vat };
}

/**
 * 매핑된 데이터 행에 공급가액/부가세/합계를 재계산하여 덮어씀
 * 원본 엑셀 값이 부정확할 수 있으므로 항상 수량×단가 기준으로 통일
 * @param {Object} row - buildMappedData가 반환한 행 객체
 * @returns {Object} 동일 row (수정됨)
 */
export function applyAmounts(row) {
  const { supplyValue, vat, totalPrice } = calcAmount(row.quantity, row.unitPrice);
  row.supplyValue = supplyValue;
  row.vat = vat;
  row.totalPrice = totalPrice;
  return row;
}

/**
 * 매핑된 데이터 배열 전체에 금액 재계산 적용
 * @param {Object[]} rows
 * @returns {Object[]} 동일 배열 (각 행 수정됨)
 */
export function applyAmountsAll(rows) {
  rows.forEach(applyAmounts);
  return rows;
}
