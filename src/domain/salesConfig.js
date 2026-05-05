export const STATUS = {
  draft:     { label: '견적',     color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  confirmed: { label: '수주확정', color: '#2563eb', bg: 'rgba(37,99,235,0.12)'  },
  partial:   { label: '부분출고', color: '#d97706', bg: 'rgba(217,119,6,0.12)'  },
  complete:  { label: '출고완료', color: '#16a34a', bg: 'rgba(22,163,74,0.12)'  },
  cancelled: { label: '취소',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
};

export const EMPTY_ITEM = { name: '', itemCode: '', qty: '', price: '' };

export const fmt   = v => (parseFloat(v) || 0).toLocaleString('ko-KR');
export const toNum = v => parseFloat(String(v || '').replace(/,/g, '')) || 0;

export function orderTotal(order) {
  const supply = (order.items || []).reduce((s, it) => s + toNum(it.qty) * toNum(it.price), 0);
  return { supply, vat: Math.floor(supply * 0.1), total: supply + Math.floor(supply * 0.1) };
}

export function genOrderNo(orders, date) {
  const d   = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const seq = String((orders || []).filter(o => (o.orderNo || '').includes(d)).length + 1).padStart(3, '0');
  return `SO-${d}-${seq}`;
}

export function calcDueDate(base, days) {
  const d = new Date(base || Date.now());
  d.setDate(d.getDate() + (days || 0));
  return d.toISOString().slice(0, 10);
}
