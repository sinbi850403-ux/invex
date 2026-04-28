import { showToast } from '../toast.js';
import { downloadExcelSheets } from '../excel.js';

export const ADMIN_EMAILS = [
  'sinbi0214@naver.com',
  'sinbi850403@gmail.com',
  'admin@invex.io.kr',
];

export const POS_FIELDS = [
  { key: 'saleDate',    label: '판매일자' },
  { key: 'storeName',   label: '매장명' },
  { key: 'category',    label: '구분' },
  { key: 'totalSales',  label: '총매출액' },
  { key: 'salesAmount', label: '매출금액' },
  { key: 'vat',         label: '부가세' },
  { key: 'cardAmount',  label: '카드' },
  { key: 'cashAmount',  label: '현금' },
  { key: 'pointAmount', label: '포인트' },
  { key: 'refund',      label: '환불/할인' },
  { key: 'netSales',    label: '순매출' },
  { key: 'itemName',    label: '품목명' },
  { key: 'quantity',    label: '수량' },
  { key: 'unitPrice',   label: '단가' },
  { key: 'posNumber',   label: 'POS번호' },
  { key: 'note',        label: '비고' },
];

export const POS_KEYWORDS = {
  saleDate:    ['판매일자', '판매일', '거래일', '거래일자', '일자', '날짜', 'date'],
  storeName:   ['매장명', '매장', '매장코드', '점포', '지점', 'store'],
  category:    ['구분', '분류', '결제구분', '유형', '거래유형', 'type'],
  totalSales:  ['총매출액', '총매출', '매출합계', '합계금액', '합계', 'total'],
  salesAmount: ['매출금액', '매출액', '공급가액', '공급가', '금액', 'sales', 'amount'],
  vat:         ['부가세', '세액', '부가가치세', 'vat', 'tax'],
  cardAmount:  ['카드', '카드금액', '카드매출', '신용카드', 'card'],
  cashAmount:  ['현금', '현금금액', '현금매출', 'cash'],
  pointAmount: ['포인트', '포인트금액', '포인트사용', 'point'],
  refund:      ['환불', '할인', '반품', '환불금액', '할인금액', 'refund', 'discount'],
  netSales:    ['순매출', '순매출액', '실매출', 'net'],
  itemName:    ['품목명', '품목', '상품명', '제품명', '메뉴명', 'item'],
  quantity:    ['수량', '판매수량', 'qty', 'quantity'],
  unitPrice:   ['단가', '판매단가', '매출단가', 'price'],
  posNumber:   ['pos번호', 'pos', '승인번호', '전표번호'],
  note:        ['비고', '메모', 'note', 'memo'],
};

export function autoMapPOS(headers) {
  const lower = headers.map(h => (h || '').toString().toLowerCase().trim());
  const mapping = {};
  const usedIdx = new Set();
  POS_FIELDS.forEach(field => {
    const kws = POS_KEYWORDS[field.key] || [];
    const matchIdx = lower.findIndex((h, idx) => !usedIdx.has(idx) && kws.some(kw => h.includes(kw)));
    if (matchIdx >= 0) { mapping[field.key] = matchIdx; usedIdx.add(matchIdx); }
  });
  return mapping;
}

export function downloadPosTemplate() {
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const headers = ['판매일자','매장명','구분','총매출액','매출금액','부가세','카드','현금','포인트','환불/할인','순매출','품목명','수량','단가','POS번호','비고'];
  const sampleRows = [
    [todayStr,'본점','정상',750000,681819,68181,450000,300000,0,0,750000,'','','','0001','1일차 매출'],
    [todayStr,'본점','정상',500000,454545,45455,500000,0,0,0,500000,'','','','0002','카드 100%'],
    [yesterday,'본점','정상',620000,563636,56364,400000,220000,0,0,620000,'','','','0007','전일 매출'],
  ];
  downloadExcelSheets([{ name: 'POS 매출 데이터', rows: [headers, ...sampleRows] }], 'INVEX_POS매출_양식');
  showToast('POS 양식을 다운로드했습니다.', 'success');
}

export const fmt = n => '₩' + Math.round(n).toLocaleString('ko-KR');
