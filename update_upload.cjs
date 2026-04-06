const fs = require('fs');
let code = fs.readFileSync('src/page-upload.js', 'utf-8');

code = code.replace(
  /{ key: 'unitPrice',  label: '단가' },\n  { key: 'totalPrice', label: '합계금액' },/g,
  "{ key: 'unitPrice',  label: '단가' },\n  { key: 'supplyValue', label: '공급가액' },\n  { key: 'vat', label: '부가세' },\n  { key: 'totalPrice', label: '합계금액' },"
);

code = code.replace(
  /unitPrice:  \['단가', 'price', '가격', '원가'\],\n  totalPrice: \['합계', 'total', '금액', '합계금액', '총액', '총금액'\],/g,
  "unitPrice:  ['단가', 'price', '가격', '원가'],\n  supplyValue: ['공급가액', '공급가', '금액'],\n  vat: ['부가세', '세액', 'vat', 'tax'],\n  totalPrice: ['합계', 'total', '합계금액', '총액', '총금액'],"
);

code = code.replace(/\['품목명', '품목코드', '분류', '수량', '단위', '단가', '합계금액', '창고', '비고'\]/g, 
  "['품목명', '품목코드', '분류', '수량', '단위', '단가', '공급가액', '부가세', '합계금액', '창고', '비고']");

code = code.replace(
  /\[\s*(['`].*?['`]),\s*(['`].*?['`]),\s*(['`].*?['`]),\s*(\d+),\s*(['`].*?['`]),\s*(\d+),\s*(\d+),\s*(['`].*?['`]),\s*(['`].*?['`])\s*\]/g,
  (m, p1, p2, p3, qty, p5, price, total, p8, p9) => {
    let q = parseInt(qty); let p = parseInt(price);
    let supply = q * p; let vat = Math.floor(supply * 0.1); let tot = supply + vat;
    return `[${p1}, ${p2}, ${p3}, ${q}, ${p5}, ${p}, ${supply}, ${vat}, ${tot}, ${p8}, ${p9}]`;
  }
);

fs.writeFileSync('src/page-upload.js', code);
