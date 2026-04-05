/**
 * page-labels.js - 바코드 라벨 인쇄
 * 역할: 품목 라벨(바코드/QR + 이름/코드/가격)을 생성하고 인쇄
 * 왜 필수? → 자체 라벨 인쇄 = 외부 라벨 서비스 비용 절감 + 재고 정확도 향상
 */

import { getState } from './store.js';
import { showToast } from './toast.js';

export function renderLabelsPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🏷️</span> 라벨 인쇄</h1>
        <div class="page-desc">품목 라벨을 생성하고 인쇄합니다. 바코드/QR 코드 포함.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-print-labels">🖨️ 선택 항목 인쇄</button>
      </div>
    </div>

    <!-- 라벨 설정 -->
    <div class="card card-compact" style="margin-bottom:12px;">
      <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
        <label class="form-label" style="margin:0; font-weight:600;">라벨 크기:</label>
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; font-size:13px;">
          <input type="radio" name="label-size" value="small" checked /> 소형 (50×30mm)
        </label>
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; font-size:13px;">
          <input type="radio" name="label-size" value="medium" /> 중형 (70×40mm)
        </label>
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; font-size:13px;">
          <input type="radio" name="label-size" value="large" /> 대형 (100×60mm)
        </label>
        <div style="margin-left:auto;">
          <label style="display:flex; align-items:center; gap:4px; font-size:13px;">
            인쇄 매수:
            <input class="form-input" type="number" id="label-copies" value="1" min="1" max="10" style="width:60px; padding:3px 6px;" />
          </label>
        </div>
      </div>
    </div>

    <!-- 품목 선택 -->
    <div class="card" style="margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
        <div class="card-title" style="margin:0;">📦 라벨 출력 품목 선택</div>
        <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;">
          <input type="checkbox" id="label-select-all" /> 전체 선택
        </label>
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:8px; max-height:300px; overflow-y:auto;">
        ${items.map((item, i) => `
          <label class="label-item-card" style="display:flex; align-items:center; gap:8px; padding:8px; border:1px solid var(--border-light); border-radius:var(--radius); cursor:pointer; font-size:12px;">
            <input type="checkbox" class="label-check" data-idx="${i}" />
            <div style="flex:1; min-width:0;">
              <div style="font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.itemName}</div>
              <div style="color:var(--text-muted); font-size:11px;">${item.itemCode || '-'}</div>
            </div>
          </label>
        `).join('')}
      </div>
    </div>

    <!-- 라벨 미리보기 -->
    <div class="card">
      <div class="card-title">👁️ 라벨 미리보기</div>
      <div id="label-preview" style="display:flex; flex-wrap:wrap; gap:12px; padding:8px;">
        <div style="color:var(--text-muted); font-size:13px;">위에서 품목을 선택하면 미리보기가 표시됩니다.</div>
      </div>
    </div>

    <!-- 인쇄 전용 영역 (숨김) -->
    <div id="label-print-area" style="display:none;"></div>
  `;

  // 전체 선택
  container.querySelector('#label-select-all').addEventListener('change', (e) => {
    container.querySelectorAll('.label-check').forEach(cb => { cb.checked = e.target.checked; });
    updatePreview();
  });

  // 개별 선택
  container.querySelectorAll('.label-check').forEach(cb => {
    cb.addEventListener('change', updatePreview);
  });

  // 라벨 크기 변경
  container.querySelectorAll('input[name="label-size"]').forEach(r => {
    r.addEventListener('change', updatePreview);
  });

  function getSelectedItems() {
    const selected = [];
    container.querySelectorAll('.label-check:checked').forEach(cb => {
      selected.push(items[parseInt(cb.dataset.idx)]);
    });
    return selected;
  }

  function getLabelSize() {
    const val = container.querySelector('input[name="label-size"]:checked')?.value || 'small';
    const sizes = {
      small: { w: 180, h: 100, fontSize: 10, codeSize: 50 },
      medium: { w: 240, h: 140, fontSize: 12, codeSize: 70 },
      large: { w: 320, h: 190, fontSize: 14, codeSize: 90 },
    };
    return sizes[val];
  }

  function updatePreview() {
    const selected = getSelectedItems();
    const size = getLabelSize();
    const preview = container.querySelector('#label-preview');

    if (selected.length === 0) {
      preview.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">품목을 선택해주세요.</div>';
      return;
    }

    preview.innerHTML = selected.map(item => renderLabel(item, size)).join('');
  }

  // 인쇄
  container.querySelector('#btn-print-labels').addEventListener('click', () => {
    const selected = getSelectedItems();
    if (selected.length === 0) {
      showToast('인쇄할 품목을 선택해주세요.', 'warning');
      return;
    }

    const copies = parseInt(container.querySelector('#label-copies').value) || 1;
    const size = getLabelSize();

    // 인쇄 전용 HTML 생성
    const allLabels = [];
    for (let c = 0; c < copies; c++) {
      selected.forEach(item => { allLabels.push(renderLabel(item, size)); });
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head>
        <title>라벨 인쇄 - ERP-Lite</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Noto Sans KR', sans-serif; padding: 10px; }
          .labels-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
          @media print {
            .labels-wrap { gap: 4px; }
          }
        </style>
      </head>
      <body>
        <div class="labels-wrap">${allLabels.join('')}</div>
        <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `);
    printWindow.document.close();
    showToast(`${selected.length}개 × ${copies}매 라벨 인쇄 시작`, 'success');
  });
}

/**
 * 단일 라벨 HTML 렌더
 */
function renderLabel(item, size) {
  const code = item.itemCode || item.itemName.substring(0, 8);
  const price = parseFloat(item.unitPrice) || 0;

  // 바코드를 CSS로 시뮬레이션 (실제 프로덕션에서는 barcode 라이브러리 사용)
  const barcodeLines = generateBarcodePattern(code);

  return `
    <div style="width:${size.w}px; height:${size.h}px; border:1px solid #333; border-radius:4px; padding:6px; display:flex; flex-direction:column; justify-content:space-between; font-family:'Noto Sans KR',sans-serif; background:#fff;">
      <div style="font-size:${size.fontSize}px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${item.itemName}
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex:1; justify-content:center;">
        <div style="display:flex; gap:1px; align-items:end; height:${size.codeSize}px;">
          ${barcodeLines}
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:end;">
        <div style="font-size:${size.fontSize - 2}px; color:#666;">${code}</div>
        ${price > 0 ? `<div style="font-size:${size.fontSize}px; font-weight:700;">₩${price.toLocaleString('ko-KR')}</div>` : ''}
      </div>
    </div>
  `;
}

/**
 * 간단한 바코드 패턴 생성 (CSS 기반)
 */
function generateBarcodePattern(text) {
  let lines = '';
  const chars = text.split('');
  for (let i = 0; i < 30; i++) {
    const charCode = (chars[i % chars.length] || 'A').charCodeAt(0);
    const w = (charCode % 3) + 1;
    const isBlack = i % 2 === 0;
    lines += `<div style="width:${w}px; height:100%; background:${isBlack ? '#000' : '#fff'};"></div>`;
  }
  return lines;
}
