// 입출고 엑셀 파싱 도메인 로직

export const EXCEL_EPOCH_OFFSET = 25569;

/** 엑셀 셀 값 → 숫자 (₩, 쉼표, 공백 제거) */
export function parseBulkNumber(v) {
  const n = parseFloat(String(v ?? '').replace(/[₩,\s]/g, ''));
  return isFinite(n) ? n : 0;
}

/** '출고'/'out'/'sale' 계열 → 'out', 나머지 → 'in' */
export function normType(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['출고', '출', 'out', 'sale', 'sales', '판매', '매출'].includes(s)) return 'out';
  return 'in';
}

/** 날짜 문자열 → YYYY-MM-DD */
export function formatDateStr(dateStr) {
  if (!dateStr || dateStr === '-') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 헤더 배열 + modeDefault → colMap (컬럼 인덱스 맵) */
export function buildColMap(headers, modeDefault) {
  const findCol = (...names) => {
    for (const n of names) {
      const idx = headers.findIndex(h => h === n);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    type:         findCol('구분'),
    vendor:       findCol('거래처', '매장명'),
    itemName:     findCol('품명', '품목명'),
    itemCode:     findCol('상품코드', '품목코드'),
    quantity:     modeDefault === 'out'
      ? findCol('출고수량', '입고수량', '수량')
      : findCol('입고수량', '출고수량', '수량'),
    unitPrice:    findCol('매입원가', '매입가', '단가', '원가'),
    sellingPrice: findCol('판매가', '출고단가'),
    date:         modeDefault === 'out'
      ? findCol('출고일자', '입고일자', '날짜')
      : findCol('입고일자', '출고일자', '날짜'),
    note:         findCol('비고'),
    spec:         findCol('규격'),
    unit:         findCol('단위'),
    category:     findCol('자산', '분류', '카테고리'),
  };
}

/** sheetData + colMap → 정제된 거래 행 배열. 매칭 여부(matched)도 포함 */
export function parseExcelRows(sheetData, colMap, modeDefault, items) {
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const rows = [];

  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    if (!row || !row.length) continue;

    let itemName = colMap.itemName >= 0 ? String(row[colMap.itemName] ?? '').trim() : '';
    const rawItemCode = colMap.itemCode >= 0 ? String(row[colMap.itemCode] ?? '').trim() : '';
    const quantity = parseBulkNumber(row[colMap.quantity]);

    const matchedItem = items.find(it =>
      (itemName && it.itemName === itemName) ||
      (rawItemCode && it.itemCode && it.itemCode === rawItemCode)
    );
    if (!itemName && matchedItem) itemName = matchedItem.itemName;
    if (!itemName || quantity <= 0) continue;

    let dateStr = '';
    if (colMap.date >= 0) {
      const raw = row[colMap.date];
      if (typeof raw === 'number') {
        dateStr = new Date((raw - EXCEL_EPOCH_OFFSET) * 86400 * 1000).toISOString().slice(0, 10);
      } else {
        dateStr = formatDateStr(String(raw ?? '').trim());
      }
    }

    rows.push({
      type:         colMap.type >= 0 ? normType(row[colMap.type]) : (modeDefault ?? 'in'),
      vendor:       colMap.vendor >= 0       ? String(row[colMap.vendor] ?? '').trim()       : '',
      itemName,
      itemCode:     rawItemCode || matchedItem?.itemCode || '',
      quantity,
      unitPrice:    colMap.unitPrice >= 0    ? parseBulkNumber(row[colMap.unitPrice])    : 0,
      sellingPrice: colMap.sellingPrice >= 0 ? parseBulkNumber(row[colMap.sellingPrice]) : 0,
      date:         dateStr || todayStr(),
      note:         colMap.note >= 0     ? String(row[colMap.note] ?? '').trim()     : '',
      spec:         colMap.spec >= 0     ? String(row[colMap.spec] ?? '').trim()     : (matchedItem?.spec     || ''),
      unit:         colMap.unit >= 0     ? String(row[colMap.unit] ?? '').trim()     : (matchedItem?.unit     || ''),
      category:     colMap.category >= 0 ? String(row[colMap.category] ?? '').trim() : (matchedItem?.category || ''),
      matched:      Boolean(matchedItem),
    });
  }
  return rows;
}
