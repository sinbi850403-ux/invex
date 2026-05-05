/**
 * inventoryStockCalc.js — itemStocks 기반 재고 계산 (단일 진실 공급원)
 *
 * 기존 items.quantity 대신 itemStocks 배열을 사용하여 재고 계산
 */

/**
 * 품목의 창고별 현재고 조회
 * @param {string} itemId - 품목 ID (UUID)
 * @param {string} warehouseId - 창고 ID (UUID), 없으면 전체 합산
 * @param {Array} itemStocks - itemStocks 배열
 * @returns {number} 현재고
 */
export function getItemQty(itemId, warehouseId, itemStocks) {
  const stocks = (itemStocks || []).filter(s => s.itemId === itemId);
  if (!warehouseId) {
    // 창고 지정 없으면 전체 합산
    return stocks.reduce((sum, s) => sum + (parseFloat(s.quantity) || 0), 0);
  }
  const stock = stocks.find(s => s.warehouseId === warehouseId);
  return stock ? parseFloat(stock.quantity) || 0 : 0;
}

/**
 * items 배열에 itemStocks 기반 quantity 주입 (UI 호환성)
 * @param {Array} items - 품목 배열
 * @param {Array} itemStocks - itemStocks 배열
 * @param {string} activeWarehouseId - 창고 필터 (선택)
 * @returns {Array} quantity가 채워진 items 배열
 */
export function enrichItemsWithQty(items, itemStocks, activeWarehouseId) {
  if (!itemStocks || !items) return items;
  return items.map(item => ({
    ...item,
    quantity: getItemQty(item._id || item.id, activeWarehouseId, itemStocks),
  }));
}

/**
 * 특정 창고의 모든 재고를 map으로 반환
 * @param {string} warehouseId - 창고 ID
 * @param {Array} itemStocks - itemStocks 배열
 * @returns {Object} { itemId: quantity, ... }
 */
export function getWarehouseQtyMap(warehouseId, itemStocks) {
  const map = {};
  (itemStocks || [])
    .filter(s => s.warehouseId === warehouseId)
    .forEach(s => { map[s.itemId] = parseFloat(s.quantity) || 0; });
  return map;
}

/**
 * 품목의 안전재고 충족 여부
 * @param {string} itemId - 품목 ID
 * @param {string} warehouseId - 창고 ID
 * @param {Array} itemStocks - itemStocks 배열
 * @param {Array} safetyStocks - safetyStocks 배열 [{id, itemId, warehouseId, minQty}]
 * @returns {boolean} true if current qty <= minQty
 */
export function isLowStock(itemId, warehouseId, itemStocks, safetyStocks) {
  const currentQty = getItemQty(itemId, warehouseId, itemStocks);
  const safeSetting = (safetyStocks || []).find(
    s => s.itemId === itemId && s.warehouseId === warehouseId
  );
  if (!safeSetting) return false;
  return currentQty <= (parseFloat(safeSetting.minQty) || 0);
}

/**
 * 부족한 재고 품목 목록 (안전재고 이하)
 * @param {Array} items - 품목 배열
 * @param {Array} itemStocks - itemStocks 배열
 * @param {Array} safetyStocks - safetyStocks 배열
 * @param {string} warehouseId - 창고 ID (선택)
 * @returns {Array} 부족한 품목들
 */
export function getLowStockItems(items, itemStocks, safetyStocks, warehouseId) {
  return (items || []).filter(item => {
    if (warehouseId) {
      return isLowStock(item._id || item.id, warehouseId, itemStocks, safetyStocks);
    }
    // 창고 미지정시: 모든 창고의 재고가 모두 부족한 품목 반환
    const stocks = (itemStocks || []).filter(s => s.itemId === (item._id || item.id));
    return stocks.length > 0 && stocks.every(s =>
      isLowStock(item._id || item.id, s.warehouseId, itemStocks, safetyStocks)
    );
  });
}

/**
 * 품절 재고 확인 (수량 = 0)
 * @param {string} itemId - 품목 ID
 * @param {string} warehouseId - 창고 ID
 * @param {Array} itemStocks - itemStocks 배열
 * @returns {boolean}
 */
export function isOutOfStock(itemId, warehouseId, itemStocks) {
  return getItemQty(itemId, warehouseId, itemStocks) === 0;
}

/**
 * 전체 재고 금액 합계
 * @param {Array} items - 품목 배열
 * @param {Array} itemStocks - itemStocks 배열
 * @returns {number} 금액
 */
export function getTotalInventoryValue(items, itemStocks) {
  return (items || []).reduce((sum, item) => {
    const qty = getItemQty(item._id || item.id, undefined, itemStocks);
    const price = parseFloat(item.unitPrice) || parseFloat(item.unitCost) || 0;
    return sum + (qty * price);
  }, 0);
}

/**
 * 창고별 재고 요약
 * @param {Array} itemStocks - itemStocks 배열
 * @param {Array} warehouses - warehouses 배열
 * @returns {Array} [{warehouseId, warehouseName, totalQty, totalValue}, ...]
 */
export function getWarehouseSummary(itemStocks, warehouses, items) {
  const summary = {};
  (warehouses || []).forEach(w => {
    summary[w.id] = {
      warehouseId: w.id,
      warehouseName: w.name,
      totalQty: 0,
      totalValue: 0,
    };
  });

  (itemStocks || []).forEach(stock => {
    if (summary[stock.warehouseId]) {
      summary[stock.warehouseId].totalQty += parseFloat(stock.quantity) || 0;
      const item = (items || []).find(i => i.id === stock.itemId || i._id === stock.itemId);
      if (item) {
        const price = parseFloat(item.unitPrice) || parseFloat(item.unitCost) || 0;
        summary[stock.warehouseId].totalValue += (parseFloat(stock.quantity) || 0) * price;
      }
    }
  });

  return Object.values(summary);
}

/**
 * 재고 트렌드 (최근 변경 시점)
 * @param {Array} itemStocks - itemStocks 배열
 * @returns {Array} 재고 변경 시점 기준 정렬
 */
export function getRecentlyUpdatedStocks(itemStocks, limit = 10) {
  return (itemStocks || [])
    .sort((a, b) => new Date(b.lastUpdatedAt || 0) - new Date(a.lastUpdatedAt || 0))
    .slice(0, limit);
}
