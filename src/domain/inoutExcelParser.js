// 입출고 엑셀 파싱 도메인 로직

export const EXCEL_EPOCH_OFFSET = 25569;

function excelSerialToDateString(serialValue) {
  const serial = Number(serialValue);
  if (!Number.isFinite(serial)) return '';
  // Excel serial date (days since 1899-12-30). Keep integer day part only.
  const utcMs = Math.round((Math.floor(serial) - EXCEL_EPOCH_OFFSET) * 86400 * 1000);
  const d = new Date(utcMs);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

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
  const raw = String(dateStr).trim();
  // Excel serial delivered as text (e.g. "45737", "45737.0")
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const fromSerial = excelSerialToDateString(raw);
    if (fromSerial) return fromSerial;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  // Guard against abnormal parsed years (e.g. +057370-11...)
  if (y < 1900 || y > 2100) return '';
  return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 헤더 배열 + modeDefault → colMap (컬럼 인덱스 맵) */
export function buildColMap(headers, modeDefault) {
  // 대소문자·공백·특수문자 무시 정규화
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[\s\-_·　]+/g, '');
  const normHeaders = headers.map(norm);

  // 정규화 후 부분 일치 검색 (앞 키워드 포함 우선)
  const findCol = (...names) => {
    const normNames = names.map(norm);
    // 1순위: 완전 일치
    for (const n of normNames) {
      const idx = normHeaders.findIndex(h => h === n);
      if (idx >= 0) return idx;
    }
    // 2순위: 헤더가 키워드를 포함
    for (const n of normNames) {
      const idx = normHeaders.findIndex(h => h.includes(n));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  return {
    type:         findCol('구분', 'type'),
    vendor:       findCol('거래처', '매장명', '공급처', '업체', '공급업체', '매입처', '거래선', 'vendor', 'supplier'),
    itemName:     findCol('품명', '품목명', '상품명', '제품명', '이름', '자재명', 'item', 'name'),
    itemCode:     findCol('상품코드', '품목코드', '품번', 'sku', '코드', '자재코드', 'code'),
    quantity:     modeDefault === 'out'
      ? findCol('출고수량', '판매수량', '수량', '입고수량', 'qty', 'quantity')
      : findCol('입고수량', '구매수량', '수량', '출고수량', 'qty', 'quantity'),
    // 출고 엑셀: unitPrice = 원가(비용) 컬럼만 매핑. 출고단가/판매가는 sellingPrice가 담당
    // 입고 엑셀: unitPrice = 매입원가 계열 컬럼
    unitPrice:    modeDefault === 'out'
      ? findCol('매입원가', '매입가', '원가', '매입단가', '구매가', '구매단가', '매입가격', 'cost', 'unitcost')
      : findCol('매입원가', '매입가', '원가', '단가', '입고단가', '입고가', '매입단가', '구매가', '구매단가',
                '매입가격', '입고가격', '공급단가', 'cost', 'unitprice', 'price'),
    // sellingPrice: 판매가/출고단가 계열 (출고 엑셀 핵심 컬럼)
    sellingPrice: findCol('판매가', '출고단가', '판매단가', '소비자가', '소매가', '매출단가', '소가', '출고가',
                          '매출가', 'selling', 'retail', 'saleprice', 'price'),
    date:         modeDefault === 'out'
      ? findCol('출고일자', '출고일', '판매일', '날짜', '일자', '입고일자', 'date')
      : findCol('입고일자', '입고일', '구매일', '날짜', '일자', '출고일자', 'date'),
    warehouse:    findCol('창고', '위치', '보관', '저장위치', 'warehouse', 'location'),
    note:         findCol('비고', '메모', '참고', 'note', 'memo'),
    spec:         findCol('규격', '사양', 'spec'),
    unit:         findCol('단위', 'unit', 'uom'),
    color:        findCol('색상', '컬러', '칼라', 'color'),
    category:     findCol('자산', '분류', '카테고리', '유형', '종류', '구분', 'category'),
    lot_no:       findCol('로트번호', '로트', 'lot', 'lotnumber', 'lot_no', 'lot번호', '배치번호'),
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
    // 코드만 있는 신규 출고/입고도 통과: 임시로 품명에 코드를 대입해 자동 등록 가능하게 함
    if (!itemName && rawItemCode) itemName = rawItemCode;
    if ((!itemName && !rawItemCode) || quantity <= 0) continue;

    let dateStr = '';
    if (colMap.date >= 0) {
      const raw = row[colMap.date];
      if (typeof raw === 'number') {
        dateStr = excelSerialToDateString(raw);
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
      warehouse:    colMap.warehouse >= 0 ? String(row[colMap.warehouse] ?? '').trim() : '',
      note:         colMap.note >= 0     ? String(row[colMap.note] ?? '').trim()     : '',
      spec:         colMap.spec >= 0     ? String(row[colMap.spec] ?? '').trim()     : (matchedItem?.spec     || ''),
      unit:         colMap.unit >= 0     ? String(row[colMap.unit] ?? '').trim()     : (matchedItem?.unit     || ''),
      color:        colMap.color >= 0    ? String(row[colMap.color] ?? '').trim()    : (matchedItem?.color    || ''),
      category:     colMap.category >= 0 ? String(row[colMap.category] ?? '').trim() : (matchedItem?.category || ''),
      lot_no:       colMap.lot_no >= 0   ? String(row[colMap.lot_no] ?? '').trim()   : '',
      matched:      Boolean(matchedItem),
    });
  }
  return rows;
}
