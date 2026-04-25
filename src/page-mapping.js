/**
 * page-mapping.js - 데이터 확인(매핑) 페이지
 * 역할: 엑셀 컬럼을 ERP 필드에 자동/수동 매핑하고 미리보기
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { indexToCol } from './excel.js';
import { escapeHtml } from './ux-toolkit.js';

// ERP 필드 정의
const ERP_FIELDS = [
  { key: 'itemName', label: '품목명', required: true },
  { key: 'itemCode', label: '품목코드', required: false },
  { key: 'category', label: '분류', required: false },
  { key: 'vendor', label: '거래처', required: false },
  { key: 'quantity', label: '수량', required: true },
  { key: 'unit', label: '단위', required: false },
  { key: 'unitPrice', label: '매입가(원가)', required: false },
  { key: 'salePrice', label: '판매가(소가)', required: false },
  { key: 'supplyValue', label: '공급가액', required: false },
  { key: 'vat', label: '부가세', required: false },
  { key: 'totalPrice', label: '합계금액', required: false },
  { key: 'warehouse', label: '창고/위치', required: false },
  { key: 'expiryDate', label: '유통기한', required: false },
  { key: 'lotNumber', label: 'LOT번호', required: false },
  { key: 'note', label: '비고', required: false },
  { key: 'safetyStock', label: '안전재고', required: false },
];

export function renderMappingPage(container, navigateTo) {
  const state = getState();

  if (!state.rawData || state.rawData.length === 0) {
    if (Array.isArray(state.mappedData) && state.mappedData.length > 0) {
      const previewRows = state.mappedData.slice(0, 100);
      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title"><span class="title-icon">📋</span> 데이터 확인</h1>
        </div>
        <div class="alert alert-info">
          업로드 원본(rawData)이 없어 저장된 데이터 기준으로 표시합니다.
          총 ${state.mappedData.length}건
        </div>
        <div class="card">
          <div class="card-title">저장 데이터 미리보기 <span class="card-subtitle">처음 ${previewRows.length}건</span></div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width:36px;">#</th>
                  <th>품목명</th>
                  <th>품목코드</th>
                  <th>분류</th>
                  <th>거래처</th>
                  <th>수량</th>
                  <th>단위</th>
                  <th>매입가</th>
                  <th>판매가</th>
                  <th>창고/위치</th>
                </tr>
              </thead>
              <tbody>
                ${previewRows.map((row, idx) => `
                  <tr>
                    <td class="col-num">${idx + 1}</td>
                    <td>${escapeHtml(row?.itemName ?? '')}</td>
                    <td>${escapeHtml(row?.itemCode ?? '')}</td>
                    <td>${escapeHtml(row?.category ?? '')}</td>
                    <td>${escapeHtml(row?.vendor ?? '')}</td>
                    <td>${escapeHtml(row?.quantity ?? '')}</td>
                    <td>${escapeHtml(row?.unit ?? '')}</td>
                    <td>${escapeHtml(row?.unitPrice ?? '')}</td>
                    <td>${escapeHtml(row?.salePrice ?? '')}</td>
                    <td>${escapeHtml(row?.warehouse ?? '')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
          <button class="btn btn-outline" id="btn-go-upload">파일 다시 업로드</button>
          <button class="btn btn-primary" id="btn-go-inventory">재고 현황 보기</button>
        </div>
      `;
      container.querySelector('#btn-go-upload')?.addEventListener('click', () => navigateTo('upload'));
      container.querySelector('#btn-go-inventory')?.addEventListener('click', () => navigateTo('inventory'));
      return;
    }

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">데이터 확인</h1>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="icon">📂</div>
          <div class="msg">먼저 파일을 업로드해 주세요</div>
          <div class="sub">엑셀 파일을 올리면 자동으로 이 화면에서 데이터를 확인할 수 있습니다.</div>
          <br/>
          <button class="btn btn-primary" id="btn-go-upload">파일 업로드하러 가기</button>
        </div>
      </div>
    `;
    container.querySelector('#btn-go-upload')?.addEventListener('click', () => navigateTo('upload'));
    return;
  }

  const headers = state.rawData[0] || [];
  const dataRows = state.rawData.slice(1);
  const mapping = { ...(state.columnMapping || {}) };

  // 자동 매핑 (처음에만)
  const beforeAutoMap = JSON.stringify(mapping);
  autoMap(headers, mapping, { fillMissingOnly: true });
  if (beforeAutoMap !== JSON.stringify(mapping)) {
    setState({ columnMapping: mapping });
  }

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">데이터 확인</h1>
        <div class="page-desc">엑셀 컬럼과 ERP 항목을 연결합니다.</div>
      </div>
    </div>

    <div class="steps">
      <div class="step done"><span class="step-num">✓</span> 파일 올리기</div>
      <div class="step active"><span class="step-num">2</span> 컬럼 매핑</div>
      <div class="step"><span class="step-num">3</span> 확인 완료</div>
    </div>

    <div class="alert alert-info">
      📄 <strong>${state.fileName}</strong> | ${dataRows.length}건의 데이터
      ${state.sheetNames.length > 1 ? `
        | 시트:
        <select id="sheet-select" class="filter-select" style="margin-left:4px;">
          ${state.sheetNames.map(s => `<option value="${s}" ${s === state.activeSheet ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      ` : ''}
    </div>

    <!-- 컬럼 매핑 -->
    <div class="card">
      <div class="card-title">컬럼 연결 <span class="card-subtitle">비슷한 이름은 자동으로 연결됩니다</span></div>
      <div id="mapping-list">
        ${ERP_FIELDS.map(field => renderMappingRow(field, headers, mapping)).join('')}
      </div>
    </div>

    <!-- 미리보기 -->
    <div class="card">
      <div class="card-title">데이터 미리보기 <span class="card-subtitle">처음 10건</span></div>
      <div class="table-wrapper">
        <table class="data-table" id="preview-table">
          <thead>
            <tr>
              <th style="width:36px;">#</th>
              ${headers.map((h, i) => `<th title="엑셀 ${indexToCol(i)}열">${h || `(${indexToCol(i)}열)`}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${dataRows.slice(0, 10).map((row, ri) => `
              <tr>
                <td class="col-num">${ri + 1}</td>
                ${headers.map((_, ci) => `<td>${row[ci] ?? ''}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
      <button class="btn btn-outline" id="btn-back">← 다시 업로드</button>
      <button class="btn btn-success btn-lg" id="btn-confirm">✓ 매핑 확인 완료</button>
    </div>
  `;

  // --- 이벤트 ---

  // 시트 전환
  container.querySelector('#sheet-select')?.addEventListener('change', (e) => {
    const newSheet = e.target.value;
    const allSheets = state.allSheets || {};
    setState({ activeSheet: newSheet, rawData: allSheets[newSheet] || [], columnMapping: {} });
    renderMappingPage(container, navigateTo);
    showToast(`"${newSheet}" 시트로 전환`, 'info');
  });

  // 매핑 변경
  container.querySelectorAll('.mapping-select').forEach(select => {
    select.addEventListener('change', () => {
      const fieldKey = select.dataset.field;
      const colIdx = select.value;
      const cur = { ...getState().columnMapping };
      if (colIdx === '') { delete cur[fieldKey]; } else { cur[fieldKey] = parseInt(colIdx); }
      setState({ columnMapping: cur });
      updatePreviewHighlight(container, cur, headers);
    });
  });

  // 뒤로
  container.querySelector('#btn-back').addEventListener('click', () => navigateTo('upload'));

  // 확인
  container.querySelector('#btn-confirm').addEventListener('click', () => {
    const cur = getState().columnMapping;
    const missing = ERP_FIELDS.filter(f => f.required && cur[f.key] === undefined).map(f => f.label);
    if (missing.length > 0) {
      showToast(`필수 항목: ${missing.join(', ')}`, 'warning');
      return;
    }

    const mappedData = buildMappedData(dataRows, cur);
    
    // 안전재고 전역 상태 반영
    const uploadSafetyStock = { ...getState().safetyStock };
    mappedData.forEach(row => {
      if (row.safetyStock !== '' && row.safetyStock !== undefined && row.safetyStock !== null) {
        let val = parseFloat(row.safetyStock);
        if(!isNaN(val)) uploadSafetyStock[row.itemName] = val;
      }
    });

    setState({ mappedData, currentStep: 3, safetyStock: uploadSafetyStock });
    showToast(`${mappedData.length}건 저장 완료`, 'success');
  });

  updatePreviewHighlight(container, mapping, headers);
}

function renderMappingRow(field, headers, mapping) {
  const selectedIdx = mapping[field.key];
  const preview = selectedIdx !== undefined ? (getState().rawData[1]?.[selectedIdx] ?? '-') : '';

  return `
    <div class="mapping-row">
      <span class="mapping-label">
        ${field.label}${field.required ? ' <span style="color:var(--danger);">*</span>' : ''}
      </span>
      <select class="mapping-select" data-field="${field.key}">
        <option value="">-- 선택 안 함 --</option>
        ${headers.map((h, i) => `
          <option value="${i}" ${selectedIdx === i ? 'selected' : ''}>
            ${indexToCol(i)}: ${h || '(빈 열)'}
          </option>
        `).join('')}
      </select>
      <span class="mapping-preview" title="${preview}">${preview ? `예: ${preview}` : ''}</span>
    </div>
  `;
}

function autoMap(headers, mapping, { fillMissingOnly = false } = {}) {
  const lower = headers.map(h => (h || '').toString().toLowerCase().trim());
  // 왜 usedIdx? → 하나의 엑셀 컬럼이 두 개 필드에 중복 매핑되는 것을 방지
  const usedIdx = new Set(Object.values(mapping).filter((v) => Number.isInteger(v)));
  const keywords = {
    itemName: ['품목명', '품목', '품명', '제품명', '상품명', '이름', 'name', 'item', '자재명', '자재'],
    itemCode: ['품목코드', '코드', 'code', '품번', 'sku', '자재코드'],
    category: ['분류', '카테고리', 'category', '유형', '종류', '구분'],
    quantity: ['수량', 'qty', 'quantity', '재고', '개수', '입고수량', '출고수량', '현재고'],
    unit: ['단위', 'unit', 'uom'],
    unitPrice: ['매입가', '원가', '단가', '매입단가', '입고단가', '입고가', '사입가', '도매가', 'cost', 'price'],
    salePrice: ['판매가', '소가', '판매단가', '소비자가', '외상단가', '출고단가', '출고가', '매출단가', '매출가', '소매가', 'sale', 'selling'],
    supplyValue: ['공급가액', '공급가'],
    vat: ['부가세', '세액', 'vat', 'tax'],
    totalPrice: ['합계금액', '총금액', '합계', 'total', '총액'],
    warehouse: ['창고', '위치', 'warehouse', 'location', '보관', '저장위치'],
    vendor: ['거래처', '업체', '업체명', '공급업체', '공급처', '매입처', 'vendor', 'supplier', '거래선'],
    expiryDate: ['유통기한', '유효기한', '만료일', 'expiry', 'exp', '사용기한'],
    lotNumber: ['lot', 'LOT', '로트', '로트번호', 'batch', '배치'],
    note: ['비고', 'note', 'memo', '메모', '참고', '특이사항'],
    safetyStock: ['안전재고', '최소재고', '최소수량', 'safetystock'],
  };

  ERP_FIELDS.forEach(field => {
    if (fillMissingOnly && mapping[field.key] !== undefined) return;
    const kws = keywords[field.key] || [];
    // 이미 사용된 컬럼은 건너뛰고 다음 매칭 검색
    const matchIdx = lower.findIndex((h, idx) => !usedIdx.has(idx) && kws.some(kw => h.includes(kw)));
    if (matchIdx >= 0) {
      mapping[field.key] = matchIdx;
      usedIdx.add(matchIdx);
    }
  });
}

function updatePreviewHighlight(container, mapping, headers) {
  const table = container.querySelector('#preview-table');
  if (!table) return;
  const mapped = new Set(Object.values(mapping));
  table.querySelectorAll('th, td').forEach(cell => { cell.style.background = ''; });
  table.querySelectorAll('tr').forEach(row => {
    const cells = row.querySelectorAll('th, td');
    cells.forEach((cell, ci) => {
      // 매핑된 컬럼 강조 — 다크 모드에서도 텍스트가 보이도록 투명도 낮은 색상 사용
      if (ci > 0 && mapped.has(ci - 1)) cell.style.background = 'rgba(37,99,235,0.15)';
    });
  });
}

function buildMappedData(dataRows, mapping) {
  return dataRows
    .filter(row => row.some(cell => cell !== '' && cell != null))
    .map(row => {
      const obj = {};
      ERP_FIELDS.forEach(field => {
        const ci = mapping[field.key];
        let val = ci !== undefined ? (row[ci] ?? '') : '';
        if (['quantity', 'unitPrice', 'salePrice', 'supplyValue', 'vat', 'totalPrice', 'safetyStock'].includes(field.key)) {
          if (typeof val === 'string') {
            const clean = val.replace(/,/g, '').trim();
            if (clean !== '' && !isNaN(clean)) {
              val = parseFloat(clean);
            }
          }
        }
        obj[field.key] = val;
      });

      // 왜 재계산? → 원본 엑셀의 공급가액/부가세/합계 값이 부정확할 수 있으므로
      // 수량 × 단가(매입)를 기준으로 항상 일관되게 재계산
      const qty = parseFloat(obj.quantity) || 0;
      const unitPrice = parseFloat(obj.unitPrice) || 0;
      const supply = qty * unitPrice;
      const vat = Math.floor(supply * 0.1);

      obj.supplyValue = supply;
      obj.vat = vat;
      obj.totalPrice = supply + vat;

      return obj;
    });
}
