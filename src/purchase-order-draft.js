export function openPurchaseOrderDraft({ setState, navigateTo, source, items, note = '' }) {
  const normalizedItems = (items || [])
    .map(item => {
      const orderQty = Math.max(
        1,
        Math.ceil(Number(item.orderQty ?? item.recommendQty ?? item.recommendedQty ?? 1) || 1)
      );

      return {
        itemName: item.itemName || '',
        itemCode: item.itemCode || '',
        vendor: item.vendor || item.bestVendor || '',
        quantity: Number(item.quantity ?? item.currentQty ?? 0) || 0,
        unitPrice: Number(item.unitPrice ?? item.bestPrice ?? 0) || 0,
        orderQty,
        minQty: Number(item.minQty ?? item.safetyQty ?? 0) || 0,
      };
    })
    .filter(item => item.itemName);

  if (!normalizedItems.length) {
    return false;
  }

  const vendors = normalizedItems.map(item => item.vendor).filter(Boolean);
  const vendor = vendors.length > 0 && vendors.every(name => name === vendors[0]) ? vendors[0] : '';

  setState({
    documentDraft: {
      type: 'purchase',
      source,
      note,
      vendor,
      createdAt: new Date().toISOString(),
      items: normalizedItems,
    },
  });

  navigateTo('documents');
  return true;
}
