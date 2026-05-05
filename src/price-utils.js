// price-utils.js - 가격 관련 유틸리티 함수 모음
// ---------------------------------------------------
// 기본 마진(예: 20%)을 적용해 판매가격이 없을 경우 추정 판매가격을 계산합니다.
// 이 모듈은 손익 페이지와 기타 매출/매입 계산 로직에서 재사용됩니다.

/**
 * 기본 마크업 비율 (0.2 = 20%). 판매가 미입력 시 원가에 곱해 추정 판매가를 산출합니다.
 *
 * ※ 마크업(markup) vs 마진(margin) 구분:
 *   - 마크업 20%: 판매가 = 원가 × 1.2  → 실매출이익률 = 16.67%
 *   - 마진 20%  : 판매가 = 원가 ÷ 0.8  → 실매출이익률 = 20.00%
 * 이 상수는 마크업 방식이므로, 표시되는 '마진율'과 실제 비율이 다를 수 있습니다.
 * (영업 정책상 마진 기준으로 바꾸려면 getSalePrice 함수를 unitCost / (1 - DEFAULT_MARGIN) 로 변경)
 */
export const DEFAULT_MARKUP = 0.2;
/** @deprecated DEFAULT_MARGIN → DEFAULT_MARKUP 으로 명칭 변경. 호환성 유지를 위해 alias 제공. */
export const DEFAULT_MARGIN = DEFAULT_MARKUP;

/**
 * 판매가격을 반환합니다.
 * - tx.unitPrice 가 존재하고 유효하면 그대로 사용합니다.
 * - 없거나 0이면 단가(tx.unitCost 혹은 tx.unitPrice) 에 기본 마진을 적용해 추정합니다.
 *
 * @param {Object} tx - 거래 객체
 * @returns {number} 판매가격 (원)
 */
export function getSalePrice(tx) {
  // 1순위: salePrice 필드 (판매단가가 직접 입력된 경우)
  const salePrice = parseFloat(tx.salePrice);
  if (!isNaN(salePrice) && salePrice > 0) return salePrice;

  // 2순위: 매입단가에 기본 마진을 적용해 추정
  const unitCost = parseFloat(tx.unitCost) || parseFloat(tx.unitPrice) || 0;
  if (unitCost > 0) return Math.round(unitCost * (1 + DEFAULT_MARKUP));

  // 둘 다 없으면 0 반환
  return 0;
}

/**
 * 판매 금액을 계산합니다. 수량 * (실제 혹은 추정) 판매가격
 *
 * @param {Object} tx - 거래 객체
 * @returns {number} 판매 금액 (원)
 */
export function calcSaleAmount(tx) {
  return Math.round((parseFloat(tx.quantity) || 0) * getSalePrice(tx));
}

/**
 * 매입 금액을 계산합니다. 기존 로직과 동일하게 단가와 수량을 곱합니다.
 *
 * @param {Object} tx - 거래 객체
 * @returns {number} 매입 금액 (원)
 */
export function calcPurchaseAmount(tx) {
  return Math.round((parseFloat(tx.quantity) || 0) * (parseFloat(tx.unitCost) || parseFloat(tx.unitPrice) || 0));
}

/**
 * 부가세 계산
 * - 매출(out): 원 미만 절사 (Math.floor) — 공급자 유리
 * - 매입(in):  원 미만 올림 (Math.ceil)  — 매입세액 공제 최대화
 *
 * @param {number} supplyAmount - 공급가액 (VAT 제외)
 * @param {'in'|'out'} type - 거래 유형
 * @returns {number} 부가세액
 */
export function calcVAT(supplyAmount, type) {
  const raw = (supplyAmount || 0) * 0.1;
  return type === 'in' ? Math.ceil(raw) : Math.floor(raw);
}
