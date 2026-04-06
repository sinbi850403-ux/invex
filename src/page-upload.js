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
  { key: 'supplyValue',label: '공급가액' },
  { key: 'vat',        label: '부가세' },
  { key: 'totalPrice', label: '합계금액' },
  { key: 'warehouse',  label: '창고/위치' },
  { key: 'note',       label: '비고' },
];

// 자동 매핑용 키워드 사전
const MAPPING_KEYWORDS = {
  itemName:   ['품목', '품명', '제품명', '상품명', '이름', 'name', 'item', '자재명', '자재'],
  itemCode:   ['코드', 'code', '품번', '품목코드', 'sku', '자재코드'],
  category:   ['분류', '카테고리', 'category', '유형', '종류', '구분'],
  quantity:   ['수량', 'qty', 'quantity', '재고', '개수', '입고수량', '출고수량', '현재고'],
  unit:       ['단위', 'unit', 'uom'],
  unitPrice:  ['단가', 'price', '가격', '원가'],
  supplyValue:['공급가액', '공급가', '금액'],
  vat:        ['부가세', '세액', 'vat', 'tax'],
  totalPrice: ['합계', 'total', '합계금액', '총액', '총금액'],
  warehouse:  ['창고', '위치', 'warehouse', 'location', '보관', '저장위치'],
  note:       ['비고', 'note', 'memo', '메모', '참고', '특이사항'],
};

export function renderUploadPage(container, navigateTo) {
  const state = getState();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📂</span> 파일 업로드</h1>
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
      <button class="btn btn-outline btn-sm" id="btn-sample">
        💡 파일이 없으신가요? 샘플 데이터로 체험하기
      </button>
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

  container.querySelector('#btn-sample')?.addEventListener('click', () => {
    loadSampleData(navigateTo);
  });

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
    const mappedLabels = Object.keys(mapping).map(key =>
      ERP_FIELDS.find(f => f.key === key)?.label || key
    );

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

/**
 * 샘플 데이터 로드 — 파일 없이 체험
 */
function loadSampleData(navigateTo) {
  const sampleData = [
    ['품목명', '품목코드', '분류', '수량', '단위', '단가', '공급가액', '부가세', '합계금액', '창고', '비고'],
    ['A4용지', 'P-001', '사무용품', 500, 'EA', 5000, 2500000, 250000, 2750000, '본사 1층', ''],
    ['볼펜(청)', 'P-002', '사무용품', 200, 'EA', 800, 160000, 16000, 176000, '본사 1층', ''],
    ['복사기 토너', 'P-003', '소모품', 10, 'EA', 45000, 450000, 45000, 495000, '본사 2층', '정기교체'],
    ['모니터 24인치', 'E-001', '전자기기', 15, 'EA', 250000, 3750000, 375000, 4125000, '본사 2층', '신규 입고'],
    ['키보드(무선)', 'E-002', '전자기기', 30, 'EA', 35000, 1050000, 105000, 1155000, '본사 2층', ''],
    ['커피원두 1kg', 'F-001', '식음료', 20, 'KG', 15000, 300000, 30000, 330000, '휴게실', ''],
    ['정수기 필터', 'F-002', '소모품', 5, 'EA', 25000, 125000, 12500, 137500, '휴게실', '6개월 교체'],
    ['택배상자(소)', 'W-001', '포장재', 300, 'EA', 500, 150000, 15000, 165000, '물류창고', ''],
    ['택배상자(중)', 'W-002', '포장재', 200, 'EA', 800, 160000, 16000, 176000, '물류창고', ''],
    ['택배상자(대)', 'W-003', '포장재', 100, 'EA', 1200, 120000, 12000, 132000, '물류창고', ''],
    ['에어캡', 'W-004', '포장재', 50, 'M', 2000, 100000, 10000, 110000, '물류창고', ''],
    ['노트북 충전기', 'E-003', '전자기기', 10, 'EA', 45000, 450000, 45000, 495000, '본사 1층', ''],
    ['화이트보드 마커', 'P-004', '사무용품', 100, 'EA', 1500, 150000, 15000, 165000, '본사 1층', '4색 세트'],
    ['포스트잇', 'P-005', '사무용품', 150, 'EA', 2000, 300000, 30000, 330000, '본사 1층', ''],
  ];

  const headers = sampleData[0];
  const dataRows = sampleData.slice(1);
  const mapping = autoMap(headers);
  const mappedData = buildMappedData(dataRows, mapping);

  resetState();
  setState({
    rawData: sampleData,
    sheetNames: ['샘플데이터'],
    activeSheet: '샘플데이터',
    fileName: '샘플_재고데이터.xlsx',
    currentStep: 3,
    allSheets: { '샘플데이터': sampleData },
    columnMapping: mapping,
    mappedData,
  });

  showToast(`샘플 데이터 ${mappedData.length}건 자동 등록 완료`, 'success');
  navigateTo('inventory');
}

// === 자동 매핑 유틸 ===

/**
 * 엑셀 헤더를 분석해 ERP 필드에 자동 매핑
 * @returns {object} { fieldKey: columnIndex, ... }
 */
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
        obj[field.key] = ci !== undefined ? (row[ci] ?? '') : '';
      });
      return obj;
    });
}
