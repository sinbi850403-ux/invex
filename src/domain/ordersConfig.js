export const STATUS = {
  draft:     { text: '작성중',   icon: '', color: 'var(--text-muted)',  bg: 'rgba(139,148,158,.15)' },
  confirmed: { text: '발주확정', icon: '', color: '#58a6ff',            bg: 'rgba(88,166,255,.15)' },
  partial:   { text: '부분입고', icon: '', color: '#d29922',            bg: 'rgba(210,153,34,.15)' },
  complete:  { text: '입고완료', icon: '', color: 'var(--success)',      bg: 'rgba(63,185,80,.15)' },
  cancelled: { text: '취소',     icon: '', color: 'var(--danger)',       bg: 'rgba(248,81,73,.15)' },
  pending:   { text: '작성중',   icon: '', color: 'var(--text-muted)',  bg: 'rgba(139,148,158,.15)' },
  sent:      { text: '발주확정', icon: '', color: '#58a6ff',            bg: 'rgba(88,166,255,.15)' },
};

export const EMPTY_ITEM = { name: '', itemCode: '', qty: '', price: '' };

export const fmt   = v => v ? '₩' + Math.round(Number(v) || 0).toLocaleString('ko-KR') : '-';
export const toNum = v => parseFloat(String(v || '').replace(/,/g, '')) || 0;

export function orderTotal(order) {
  return (order.items || []).reduce((s, it) => s + toNum(it.qty) * toNum(it.price), 0);
}

export function genOrderNo(orders, date) {
  const d = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const today = orders.filter(o => (o.orderNo || '').includes(d));
  return `PO-${d}-${String(today.length + 1).padStart(3, '0')}`;
}

export function calcDueDate(base = new Date().toISOString().split('T')[0], days = 30) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
