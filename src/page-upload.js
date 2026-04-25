/**
 * page-upload.js - 파일 업로드 페이지
 * 흐름: 파일 선택 → 엑셀 파싱 → 자동 매핑 → 바로 재고 현황으로 이동
 * 왜 자동 매핑? → 매핑 확인 단계를 건너뛰어 사용자 클릭 수를 줄임
 */

import { readExcelFile } from './excel.js';
import { setState, resetState, getState } from './store.js';
import { showToast } from './toast.js';
import { downloadTemplate, getTemplateList } from './excel-templates.js';

// ERP 필드 정의 (page-mapping.js와 동일)
const ERP_FIELDS = [
  { key: 'itemName',   label: '품목명' },
  { key: 'itemCode',   label: '품목코드' },
  { key: 'category',   label: '분류' },
  { key: 'quantity',   label: '수량' },
  { key: 'unit',       label: '단위' },
  { key: 'unitPrice',  label: '단가' },
  { key: 'salePrice',  label: '판매가(소가)' },
  { key: 'supplyValue',label: '공급가액' },
  { key: 'vat',        label: '부가세' },
  { key: 'totalPrice', label: '합계금액' },
  { key: 'warehouse',  label: '창고/위치' },
  { key: 'note',       label: '비고' },
  { key: 'safetyStock',label: '안전재고' },
];

// 자동 매핑용 키워드 사전
const MAPPING_KEYWORDS = {
  itemName:   ['품목', '품명', '제품명', '상품명', '이름', 'name', 'item', '자재명', '자재'],
  itemCode:   ['코드', 'code', '품번', '품목코드', 'sku', '자재코드'],
  category:   ['분류', '카테고리', 'category', '유형', '종류', '구분'],
  quantity:   ['수량', 'qty', 'quantity', '재고', '개수', '입고수량', '출고수량', '현재고'],
  unit:       ['단위', 'unit', 'uom'],
  unitPrice:  ['단가', 'price', '가격', '원가', '매입가'],
  salePrice:  ['판매가', '소가', '판매단가', '소비자가', '출고단가', 'sale', 'selling', 'retail'],
  supplyValue:['공급가액', '공급가', '금액'],
  vat:        ['부가세', '세액', 'vat', 'tax'],
  totalPrice: ['합계', 'total', '합계금액', '총액', '총금액'],
  warehouse:  ['창고', '위치', 'warehouse', 'location', '보관', '저장위치'],
  note:       ['비고', 'note', 'memo', '메모', '참고', '특이사항'],
  safetyStock:['안전재고', '최소재고', '최소수량', 'safetystock'],
};

export function renderUploadPage(container, navigateTo) {
  const state = getState();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">파일 업로드</h1>
        <div class="page-desc">엑셀 파일을 올리면 자동으로 데이터를 읽고 재고에 등록합니다.</div>
      </div>
    </div>

    <!-- 진행 안내 -->
    <div class="steps">
      <div class="step active">
        <span class="step-num">1</span> 파일 올리기
      </div>
      <div class="step">
        <span class="step-num">2</span> 자동 매핑
      </div>
      <div class="step">
        <span class="step-num">3</span> 재고 확인
      </div>
    </div>

    <div class="card">
      <div id="upload-zone" class="upload-zone">
        <div class="icon">📁</div>
        <div class="label">엑셀 파일을 여기에 끌어다 놓거나 클릭하세요</div>
        <div class="hint">.xlsx, .xls, .csv 파일 지원 · 업로드 즉시 자동 매핑됩니다</div>
        <input type="file" id="file-input" accept=".xlsx,.xls,.csv" style="display:none" />
      </div>
    </div>

    <div style="text-align:center; margin-top:12px;">
      <!-- 샘플 데이터 기능 삭제 -->
    </div>

    <!-- 엑셀 양식 다운로드 -->
    <div class="card" style="margin-top:24px;">
      <h3 style="font-size:16px; font-weight:700; margin-bottom:4px;">📋 엑셀 양식 다운로드</h3>
      <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
        업종에 맞는 양식을 다운받아 데이터를 입력하고 업로드하세요. 샘플 데이터가 포함되어 있습니다.
      </p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
        ${getTemplateList().map(tpl => `
          <button class="template-card" data-template="${tpl.key}" title="${tpl.desc}">
            <div style="font-size:14px; font-weight:600; margin-bottom:2px;">${tpl.name}</div>
            <div style="font-size:11px; color:var(--text-muted);">${tpl.desc}</div>
            <div style="font-size:11px; color:var(--accent); margin-top:6px;">⬇ 다운로드</div>
          </button>
        `).join('')}
      </div>
    </div>

    ${state.fileName ? `
      <div class="alert alert-info" style="margin-top:16px;">
        📄 현재 불러온 파일: <strong>${state.fileName}</strong>
        (${(state.mappedData || []).length}건 등록됨)
        <button class="btn btn-outline btn-sm" id="btn-clear" style="margin-left:12px;">
          새 파일로 교체
        </button>
        <button class="btn btn-primary btn-sm" id="btn-go-inv" style="margin-left:4px;">
          재고 현황 보기 →
        </button>
      </div>
    ` : ''}
  `;

  // --- 이벤트 ---
  const zone = container.querySelector('#upload-zone');
  const fileInput = container.querySelector('#file-input');

  zone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0], navigateTo);
  });

  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0], navigateTo);
  });

  container.querySelector('#btn-clear')?.addEventListener('click', () => {
    resetState();
    renderUploadPage(container, navigateTo);
    showToast('이전 데이터를 초기화했습니다.', 'info');
  });

  // 샘플 이벤트 바인딩 제거

  // 템플릿 다운로드 이벤트
  container.querySelectorAll('.template-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.template;
      downloadTemplate(key);
      showToast('엑셀 양식을 다운로드합니다 📥', 'success');
    });
  });

  container.querySelector('#btn-go-inv')?.addEventListener('click', () => {
    navigateTo('inventory');
  });
}

/**
 * 파일 업로드 처리
 * 흐름: 파일 읽기 → 자동 매핑 → mappedData 생성 → 바로 재고 현황 이동
 */
async function handleFile(file, navigateTo) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
    showToast('지원하지 않는 파일 형식입니다.', 'error');
    return;
  }

  try {
    showToast('파일을 읽는 중...', 'info', 1500);
    const result = await readExcelFile(file);
    const activeSheet = result.sheetNames[0];
    const rawData = result.sheets[activeSheet];

    if (!rawData || rawData.length < 2) {
      showToast('파일에 데이터가 없거나 헤더만 있습니다.', 'warning');
      return;
    }

    // 자동 매핑 수행
    const headers = rawData[0];
    const dataRows = rawData.slice(1);
    const mapping = autoMap(headers);
    const mappedData = buildMappedData(dataRows, mapping);

    // 매핑 결과 요약
    const mappedCount = Object.keys(mapping).length;
    const previousMappedData = (getState().mappedData || []).slice();
    const uploadDiff = buildUploadDiff(previousMappedData, mappedData, file.name);

    const uploadSafetyStock = { ...getState().safetyStock };
    mappedData.forEach(row => {
      if (row.safetyStock !== '' && row.safetyStock !== undefined && row.safetyStock !== null) {
        let val = parseFloat(row.safetyStock);
        if(!isNaN(val)) uploadSafetyStock[row.itemName] = val;
      }
    });

    resetState();
    setState({
      rawData,
      sheetNames: result.sheetNames,
      activeSheet,
      fileName: file.name,
      currentStep: 3,
      allSheets: result.sheets,
      columnMapping: mapping,
      mappedData,
      safetyStock: uploadSafetyStock,
      lastUploadDiff: uploadDiff,
    });

    showToast(
      `"${file.name}" → ${mappedData.length}건 등록 (${mappedCount}개 필드 자동 매핑)`,
      'success'
    );

    // 바로 재고 현황으로
    navigateTo('inventory');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 샘플 데이터 로드(loadSampleData) 함수 제거됨

// === 자동 매핑 유틸 ===

/**
 * 엑셀 헤더를 분석해 ERP 필드에 자동 매핑
 * @returns {object} { fieldKey: columnIndex, ... }
 */
function buildUploadDiff(previousRows, nextRows, fileName = '') {
  const previousMap = new Map();
  previousRows.forEach((row, index) => {
    previousMap.set(getUploadRowKey(row, index), row);
  });

  const touched = new Set();
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  nextRows.forEach((row, index) => {
    const key = getUploadRowKey(row, index);
    const previous = previousMap.get(key);
    if (!previous) {
      added += 1;
      return;
    }

    touched.add(key);
    if (isUploadRowChanged(previous, row)) updated += 1;
    else unchanged += 1;
  });

  const removed = previousRows.length - touched.size;

  return {
    fileName,
    added,
    updated,
    unchanged,
    removed: Math.max(0, removed),
    at: new Date().toISOString(),
  };
}

function getUploadRowKey(row, index) {
  const code = String(row?.itemCode || '').trim();
  const name = String(row?.itemName || '').trim();
  if (code) return `code:${code}`;
  if (name) return `name:${name}`;
  return `row:${index}`;
}

function isUploadRowChanged(previousRow, nextRow) {
  const compareKeys = [
    'itemName',
    'itemCode',
    'category',
    'quantity',
    'unit',
    'unitPrice',
    'salePrice',
    'supplyValue',
    'vat',
    'totalPrice',
    'warehouse',
    'note',
    'safetyStock',
  ];

  return compareKeys.some((key) =>
    String(previousRow?.[key] ?? '').trim() !== String(nextRow?.[key] ?? '').trim()
  );
}

function autoMap(headers) {
  const lower = headers.map(h => (h || '').toString().toLowerCase().trim());
  const mapping = {};

  ERP_FIELDS.forEach(field => {
    const kws = MAPPING_KEYWORDS[field.key] || [];
    const matchIdx = lower.findIndex(h => kws.some(kw => h.includes(kw)));
    if (matchIdx >= 0) {
      mapping[field.key] = matchIdx;
    }
  });

  return mapping;
}

/**
 * 매핑 정보를 기반으로 원시 데이터를 ERP 형식으로 변환
 */
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
      return obj;
    });
}
