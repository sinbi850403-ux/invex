export const TYPE_LABEL = { supplier: '매입처', customer: '매출처', both: '양방향', transfer: '창고이동', adjust: '조정', return: '반품' };
export const TYPE_BADGE = { supplier: 'badge-info', customer: 'badge-success', both: 'badge-warning', transfer: 'badge-secondary', adjust: 'badge-secondary', return: 'badge-secondary' };

export const PAYMENT_TERMS = [
  { value: '',         label: '-- 선택 --' },
  { value: 'cash',     label: '현금' },
  { value: 'card',     label: '카드' },
  { value: 'transfer', label: '계좌이체' },
  { value: 'bill30',   label: '30일 어음' },
  { value: 'bill60',   label: '60일 어음' },
  { value: 'bill90',   label: '90일 어음' },
  { value: 'consign',  label: '위탁' },
];

export const EMPTY_FORM = {
  code: '', type: 'supplier', name: '', bizNumber: '', ceoName: '', bizType: '', bizItem: '',
  contactName: '', phone: '', email: '', fax: '', address: '',
  paymentTerm: '', creditLimit: '', bankName: '', bankAccount: '', bankHolder: '', note: '',
};

export const toNum = (v) => parseFloat(String(v || '').replace(/,/g, '')) || 0;
export const fmt   = (v) => { const n = parseFloat(String(v || '').replace(/,/g, '')) || 0; if (!n) return '-'; return '₩' + Math.round(n).toLocaleString('ko-KR'); };

export function genVendorCode(vendors, type) {
  const prefix = type === 'customer' ? 'C' : type === 'both' ? 'B' : type === 'transfer' ? 'T' : type === 'adjust' ? 'A' : type === 'return' ? 'R' : 'S';
  const existing = vendors.filter(v => (v.code || '').startsWith(prefix)).map(v => parseInt((v.code || '').slice(1)) || 0);
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

// 아이템 마스터에서 품목명→아이템 맵 생성
function _buildItemPriceMap(items) {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    const name = String(item.itemName || '').trim();
    if (name) map.set(name, item);
    if (item.itemCode) map.set(`__code__${item.itemCode}`, item);
  }
  return map;
}

// 트랜잭션 금액: tx 직접값 → 아이템 마스터 폴백
function _txAmt(tx, itemPriceMap) {
  const qty = toNum(tx.quantity);
  if (qty <= 0) return 0;
  const direct = toNum(tx.unitPrice || tx.unitCost || tx.price || 0);
  if (direct > 0) return qty * direct;
  const name = String(tx.itemName || '').trim();
  const item = itemPriceMap.get(name) ||
    (tx.itemCode ? itemPriceMap.get(`__code__${tx.itemCode}`) : null);
  if (!item) return 0;
  if (tx.type === 'out') {
    const sp = toNum(item.salePrice || 0);
    if (sp > 0) return qty * sp;
    const up = toNum(item.unitPrice || item.unitCost || 0);
    return up > 0 ? qty * up * 1.2 : 0;
  }
  const up = toNum(item.unitPrice || item.unitCost || 0);
  return up > 0 ? qty * up : 0;
}

export function buildStats(vendors, transactions, items) {
  const itemPriceMap = _buildItemPriceMap(items);
  const map = new Map();
  vendors.forEach(v => map.set(v.name, { inAmt: 0, outAmt: 0, count: 0, lastDate: '' }));
  transactions.forEach(tx => {
    const name = (tx.vendor || '').trim();
    if (!name) return;
    if (!map.has(name)) map.set(name, { inAmt: 0, outAmt: 0, count: 0, lastDate: '' });
    const s = map.get(name);
    const amt = _txAmt(tx, itemPriceMap);
    if (tx.type === 'in') s.inAmt += amt;
    if (tx.type === 'out') s.outAmt += amt;
    s.count++;
    const d = String(tx.date || tx.createdAt || '');
    if (d > s.lastDate) s.lastDate = d;
  });
  return map;
}
