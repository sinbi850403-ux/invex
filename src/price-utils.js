// price-utils.js - 가격 관련 유틸리티 함수 모음
// ---------------------------------------------------
// 기본 마진(예: 20%)을 적용해 판매가격이 없을 경우 추정 판매가격을 계산합니다.
// 이 모듈은 손익 페이지와 기타 매출/매입 계산 로직에서 재사용됩니다.

/**
 * 기본 마진 비율 (0.2 = 20%). 필요에 따라 조정 가능하도록 상수로 정의합니다.
 */
export const DEFAULT_MARGIN = 0.2;

/**
 * 판매가격을 반환합니다.
 * - tx.unitPrice 가 존재하고 유효하면 그대로 사용합니다.
 * - 없거나 0이면 단가(tx.unitCost 혹은 tx.unitPrice) 에 기본 마진을 적용해 추정합니다.
 *
 * @param {Object} tx - 거래 객체
 * @returns {number} 판매가격 (원)
 */
export function getSalePrice(tx) {
  const unitPrice = parseFloat(tx.unitPrice);
  if (!isNaN(unitPrice) && unitPrice > 0) return unitPrice;
  // 단가가 없을 경우 0 으로 간주하고 마진만 적용합니다.
  const unitCost = parseFloat(tx.unitCost) || parseFloat(tx.unitPrice) || 0;
  return unitCost * (1 + DEFAULT_MARGIN);
}

/**
 * 판매 금액을 계산합니다. 수량 * (실제 혹은 추정) 판매가격
 *
 * @param {Object} tx - 거래 객체
 * @returns {number} 판매 금액 (원)
 */
export function calcSaleAmount(tx) {
  return (parseFloat(tx.quantity) || 0) * getSalePrice(tx);
}

/**
 * 매입 금액을 계산합니다. 기존 로직과 동일하게 단가와 수량을 곱합니다.
 *
 * @param {Object} tx - 거래 객체
 * @returns {number} 매입 금액 (원)
 */
export function calcPurchaseAmount(tx) {
  return (parseFloat(tx.quantity) || 0) * (parseFloat(tx.unitCost) || parseFloat(tx.unitPrice) || 0);
}
