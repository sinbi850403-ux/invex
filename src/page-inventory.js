/**
 * page-inventory.js - 재고 현황 페이지
 * 실무 기능: 수동 품목 추가/편집, 안전재고 경고, 검색/필터, 페이지네이션, 엑셀 내보내기
 * **컬럼 표시 설정**: 사용자가 보고 싶은 컬럼만 선택해서 볼 수 있음
 */

import { getState, setState, addItem, updateItem, deleteItem, setSafetyStock } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';

// 페이지당 행 수
const PAGE_SIZE = 20;

// 전체 필드 정의 (순서 유지)
const ALL_FIELDS = [
  { key: 'itemName',   label: '품목명',    numeric: false },
  { key: 'itemCode',   label: '품목코드',  numeric: false },
  { key: 'category',   label: '분류',      numeric: false },
  { key: 'quantity',   label: '수량',      numeric: true  },
  { key: 'unit',       label: '단위',      numeric: false },
  { key: 'unitPrice',  label: '단가',      numeric: true  },
  { key: 'totalPrice', label: '합계금액',  numeric: true  },
  { key: 'warehouse',  label: '창고/위치', numeric: false },
  { key: 'note',       label: '비고',      numeric: false },
];

// 간편 참조 맵
const FIELD_LABELS = {};
ALL_FIELDS.forEach(f => { FIELD_LABELS[f.key] = f.label; });

/**
 * 현재 표시할 컬럼 목록 결정
 * 왜 이 로직? → visibleColumns 설정이 있으면 그걸 따르고,
 * 없으면 데이터에 실제 값이 있는 필드만 자동 선택
 */
function getVisibleFields(data) {
  const state = getState();
  const visibleColumns = state.visibleColumns;

  // 데이터에 실제 값이 들어있는 필드 목록
  const hasData = new Set(
    ALL_FIELDS.map(f => f.key).filter(key =>
      data.some(row => row[key] !== '' && row[key] !== undefined && row[key] !== null)
    )
  );

  if (visibleColumns && Array.isArray(visibleColumns)) {
    // 사용자 설정이 있으면 → 설정에 포함된 것만 (순서는 ALL_FIELDS 순서 유지)
    return ALL_FIELDS.filter(f => visibleColumns.includes(f.key)).map(f => f.key);
  }

  // 설정 없으면 → 데이터가 있는 필드만 자동 선택
  return ALL_FIELDS.filter(f => hasData.has(f.key)).map(f => f.key);
}

/**
 * 재고 현황 페이지 렌더링
 */
export function renderInventoryPage(container, navigateTo) {
  const state = getState();
  const data = state.mappedData || [];
  const safetyStock = state.safetyStock || {};

  if (data.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><span class="title-icon">📦</span> 재고 현황</h1>
          <div class="page-desc">품목의 재고 수량과 금액을 관리합니다.</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-item">+ 품목 추가</button>
        </div>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="icon">📦</div>
          <div class="msg">아직 등록된 품목이 없습니다</div>
          <div class="sub">파일을 업로드하거나, 위의 "품목 추가" 버튼으로 직접 등록하세요.</div>
          <br/>
          <button class="btn btn-outline" id="btn-go-upload">파일 업로드하기</button>
        </div>
      </div>
    `;
    container.querySelector('#btn-go-upload')?.addEventListener('click', () => navigateTo('upload'));
    container.querySelector('#btn-add-item')?.addEventListener('click', () => openItemModal(container, navigateTo));
    return;
  }

  // 현재 표시할 필드 목록
  let activeFields = getVisibleFields(data);

  // 데이터에 값이 있는 전체 필드 목록 (컬럼 설정 패널에서 사용)
  const allAvailableFields = ALL_FIELDS.filter(f =>
    data.some(row => row[f.key] !== '' && row[f.key] !== undefined && row[f.key] !== null)
  );

  // 안전재고 이하 항목 카운트
  const warningCount = data.filter(d => {
    const min = safetyStock[d.itemName];
    return min !== undefined && (parseFloat(d.quantity) || 0) <= min;
  }).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📦</span> 재고 현황</h1>
        <div class="page-desc">${state.fileName ? `📄 ${state.fileName}` : ''} 총 ${data.length}개 품목</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-export">📥 엑셀 내보내기</button>
        <button class="btn btn-primary" id="btn-add-item">+ 품목 추가</button>
      </div>
    </div>

    <!-- 통계 카드 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">전체 품목</div>
        <div class="stat-value text-accent" id="stat-total">${data.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 수량</div>
        <div class="stat-value" id="stat-qty">${calcTotalQty(data)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 금액</div>
        <div class="stat-value text-success" id="stat-price">${calcTotalPrice(data)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">재고 부족 경고</div>
        <div class="stat-value ${warningCount > 0 ? 'text-danger' : ''}" id="stat-warn">
          ${warningCount > 0 ? warningCount + '건' : '없음'}
        </div>
      </div>
    </div>

    <!-- 검색/필터 + 컬럼 설정 -->
    <div class="toolbar">
      <input type="text" class="search-input" id="search-input"
        placeholder="품목명, 코드, 분류로 검색..." />
      <select class="filter-select" id="filter-category">
        <option value="">전체 분류</option>
        ${getCategories(data).map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-warehouse">
        <option value="">전체 창고</option>
        ${getWarehouses(data).map(w => `<option value="${w}">${w}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-stock">
        <option value="">전체 재고</option>
        <option value="low">⚠️ 부족 항목만</option>
      </select>
      <div class="col-settings-wrap" style="position:relative;">
        <button class="btn btn-outline btn-sm" id="btn-col-settings" title="표시할 컬럼 선택">
          ⚙️ 표시 항목
        </button>
        <div class="col-settings-panel" id="col-settings-panel">
          <div class="col-settings-header">
            <strong>📋 표시할 항목 선택</strong>
            <button class="col-settings-close" id="col-settings-close">✕</button>
          </div>
          <div class="col-settings-body">
            ${allAvailableFields.map(f => `
              <label class="col-settings-item">
                <input type="checkbox" class="col-check" data-key="${f.key}"
                  ${activeFields.includes(f.key) ? 'checked' : ''} />
                <span>${f.label}</span>
              </label>
            `).join('')}
          </div>
          <div class="col-settings-footer">
            <button class="btn btn-ghost btn-sm" id="col-select-all">전체 선택</button>
            <button class="btn btn-primary btn-sm" id="col-apply">적용</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 데이터 테이블 -->
    <div class="card card-flush">
      <div class="table-wrapper" style="border:none;">
        <table class="data-table" id="inventory-table">
          <thead id="inventory-thead"></thead>
          <tbody id="inventory-body"></tbody>
        </table>
      </div>
      <div class="pagination" id="pagination"></div>
    </div>

    <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">
      💡 셀을 더블클릭하면 직접 수정할 수 있습니다. | ⚙️ 표시 항목 버튼으로 보고 싶은 컬럼을 선택하세요.
    </div>
  `;

  // === 상태 변수 ===
  let currentFilter = { keyword: '', category: '', warehouse: '', stock: '' };
  let currentPageNum = 1;

  // === 테이블 헤더 렌더링 (컬럼 변경 시 재호출) ===
  function renderTableHeader() {
    const thead = container.querySelector('#inventory-thead');
    thead.innerHTML = `
      <tr>
        <th class="col-num">#</th>
        ${activeFields.map(key => `
          <th class="${ALL_FIELDS.find(f => f.key === key)?.numeric ? 'text-right' : ''}">
            ${FIELD_LABELS[key]}
          </th>
        `).join('')}
        <th class="text-center" style="width:50px;" title="안전재고 설정">⚙️</th>
        <th class="col-actions">관리</th>
      </tr>
    `;
  }

  // === 필터링 ===
  function getFilteredData() {
    return data.filter(row => {
      const kw = currentFilter.keyword.toLowerCase();
      if (kw && !(
        (row.itemName || '').toLowerCase().includes(kw) ||
        (row.itemCode || '').toLowerCase().includes(kw) ||
        (row.category || '').toLowerCase().includes(kw)
      )) return false;

      if (currentFilter.category && row.category !== currentFilter.category) return false;
      if (currentFilter.warehouse && row.warehouse !== currentFilter.warehouse) return false;
      if (currentFilter.stock === 'low') {
        const min = safetyStock[row.itemName];
        if (min === undefined || (parseFloat(row.quantity) || 0) > min) return false;
      }
      return true;
    });
  }

  // === 테이블 바디 렌더링 ===
  function renderTable() {
    const filtered = getFilteredData();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPageNum > totalPages) currentPageNum = totalPages;

    const start = (currentPageNum - 1) * PAGE_SIZE;
    const pageData = filtered.slice(start, start + PAGE_SIZE);

    const tbody = container.querySelector('#inventory-body');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${activeFields.length + 3}" style="text-align:center; padding:32px; color:var(--text-muted);">
        검색 결과가 없습니다.
      </td></tr>`;
    } else {
      tbody.innerHTML = pageData.map((row, i) => {
        const realIdx = data.indexOf(row);
        const min = safetyStock[row.itemName];
        const qty = parseFloat(row.quantity) || 0;
        const isLow = min !== undefined && qty <= min;
        const isDanger = min !== undefined && qty === 0;

        return `
          <tr class="${isDanger ? 'row-danger' : isLow ? 'row-warning' : ''}" data-idx="${realIdx}">
            <td class="col-num">${start + i + 1}</td>
            ${activeFields.map(key => `
              <td class="editable-cell ${ALL_FIELDS.find(f => f.key === key)?.numeric ? 'text-right' : ''}"
                  data-field="${key}" data-idx="${realIdx}">
                ${formatCell(key, row[key])}
                ${key === 'quantity' && isLow ? ' <span class="badge badge-danger" style="font-size:10px;">부족</span>' : ''}
              </td>
            `).join('')}
            <td class="text-center">
              <button class="btn-icon btn-safety" data-name="${row.itemName}" data-min="${min ?? ''}"
                title="안전재고: ${min !== undefined ? min : '미설정'}">
                ${min !== undefined ? '🔔' : '➖'}
              </button>
            </td>
            <td class="col-actions">
              <button class="btn-icon btn-edit" data-idx="${realIdx}" title="편집">✏️</button>
              <button class="btn-icon btn-icon-danger btn-del" data-idx="${realIdx}" title="삭제">🗑️</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 페이지네이션
    const paginationEl = container.querySelector('#pagination');
    paginationEl.innerHTML = `
      <span>${filtered.length}건 중 ${start + 1}~${Math.min(start + PAGE_SIZE, filtered.length)}</span>
      <div class="pagination-btns">
        <button class="page-btn" id="page-prev" ${currentPageNum <= 1 ? 'disabled' : ''}>← 이전</button>
        ${Array.from({length: Math.min(totalPages, 7)}, (_, i) => {
          let p;
          if (totalPages <= 7) { p = i + 1; }
          else if (currentPageNum <= 4) { p = i + 1; }
          else if (currentPageNum >= totalPages - 3) { p = totalPages - 6 + i; }
          else { p = currentPageNum - 3 + i; }
          return `<button class="page-btn ${p === currentPageNum ? 'active' : ''}" data-p="${p}">${p}</button>`;
        }).join('')}
        <button class="page-btn" id="page-next" ${currentPageNum >= totalPages ? 'disabled' : ''}>다음 →</button>
      </div>
    `;

    // 이벤트 재연결
    attachTableEvents();
    attachPaginationEvents();
  }

  // === 테이블 이벤트 (인라인 편집, 삭제 등) ===
  function attachTableEvents() {
    // 인라인 편집
    container.querySelectorAll('.editable-cell').forEach(cell => {
      cell.addEventListener('dblclick', () => {
        const idx = parseInt(cell.dataset.idx);
        const field = cell.dataset.field;
        const currentValue = data[idx]?.[field] ?? '';
        if (cell.querySelector('input')) return;

        const input = document.createElement('input');
        input.value = currentValue;
        input.className = 'form-input';
        input.style.cssText = 'padding:4px 6px; font-size:13px;';
        cell.textContent = '';
        cell.appendChild(input);
        input.focus();
        input.select();

        const save = () => {
          const newVal = input.value;
          updateItem(idx, { [field]: newVal });
          // 합계 재계산
          if (field === 'quantity' || field === 'unitPrice') {
            const q = parseFloat(data[idx].quantity) || 0;
            const p = parseFloat(data[idx].unitPrice) || 0;
            updateItem(idx, { totalPrice: q * p });
          }
          renderTable();
          updateStats();
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') renderTable();
        });
      });
    });

    // 삭제
    container.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const name = data[idx]?.itemName || `${idx + 1}번 항목`;
        if (confirm(`"${name}"을(를) 삭제하시겠습니까?`)) {
          deleteItem(idx);
          renderTable();
          updateStats();
          showToast(`"${name}" 항목을 삭제했습니다.`, 'info');
        }
      });
    });

    // 편집 (모달)
    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        openItemModal(container, navigateTo, idx);
      });
    });

    // 안전재고 설정
    container.querySelectorAll('.btn-safety').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        const currentMin = btn.dataset.min;
        const input = prompt(
          `"${name}"의 안전재고(최소 수량)를 입력하세요.\n비워두면 해제됩니다.`,
          currentMin
        );
        if (input === null) return; // 취소
        if (input.trim() === '') {
          setSafetyStock(name, undefined);
          showToast(`"${name}" 안전재고 해제`, 'info');
        } else {
          const num = parseInt(input);
          if (isNaN(num) || num < 0) {
            showToast('숫자를 입력해 주세요.', 'warning');
            return;
          }
          setSafetyStock(name, num);
          showToast(`"${name}" 안전재고를 ${num}으로 설정했습니다.`, 'success');
        }
        renderTable();
        updateStats();
      });
    });
  }

  // 페이지네이션 이벤트
  function attachPaginationEvents() {
    container.querySelector('#page-prev')?.addEventListener('click', () => {
      if (currentPageNum > 1) { currentPageNum--; renderTable(); }
    });
    container.querySelector('#page-next')?.addEventListener('click', () => {
      currentPageNum++;
      renderTable();
    });
    container.querySelectorAll('.page-btn[data-p]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPageNum = parseInt(btn.dataset.p);
        renderTable();
      });
    });
  }

  // 통계 업데이트
  function updateStats() {
    const d = getState().mappedData || [];
    const ss = getState().safetyStock || {};
    container.querySelector('#stat-total').textContent = d.length;
    container.querySelector('#stat-qty').textContent = calcTotalQty(d);
    container.querySelector('#stat-price').textContent = calcTotalPrice(d);
    const wc = d.filter(r => {
      const min = ss[r.itemName];
      return min !== undefined && (parseFloat(r.quantity) || 0) <= min;
    }).length;
    const warnEl = container.querySelector('#stat-warn');
    warnEl.textContent = wc > 0 ? wc + '건' : '없음';
    warnEl.className = `stat-value ${wc > 0 ? 'text-danger' : ''}`;
  }

  // === 컬럼 설정 패널 이벤트 ===

  const colPanel = container.querySelector('#col-settings-panel');
  const colBtn = container.querySelector('#btn-col-settings');

  // 패널 열기/닫기
  colBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    colPanel.classList.toggle('open');
  });

  container.querySelector('#col-settings-close').addEventListener('click', () => {
    colPanel.classList.remove('open');
  });

  // 패널 외부 클릭 시 닫기
  document.addEventListener('click', (e) => {
    if (!colPanel.contains(e.target) && e.target !== colBtn) {
      colPanel.classList.remove('open');
    }
  });

  // 전체 선택 버튼
  container.querySelector('#col-select-all').addEventListener('click', () => {
    container.querySelectorAll('.col-check').forEach(cb => { cb.checked = true; });
  });

  // 적용 버튼 — 선택한 컬럼을 저장하고 테이블 새로 그리기
  container.querySelector('#col-apply').addEventListener('click', () => {
    const checked = [];
    container.querySelectorAll('.col-check:checked').forEach(cb => {
      checked.push(cb.dataset.key);
    });

    if (checked.length === 0) {
      showToast('최소 1개 이상의 항목을 선택해 주세요.', 'warning');
      return;
    }

    // 전체 선택이면 null로 저장 (기본값 = 자동)
    const allKeys = allAvailableFields.map(f => f.key);
    const isAll = checked.length === allKeys.length && allKeys.every(k => checked.includes(k));

    setState({ visibleColumns: isAll ? null : checked });
    activeFields = checked;

    // 테이블 헤더+바디 다시 그리기
    renderTableHeader();
    renderTable();
    colPanel.classList.remove('open');
    showToast(`${checked.length}개 항목 표시`, 'success');
  });

  // === 검색/필터 이벤트 ===
  container.querySelector('#search-input').addEventListener('input', (e) => {
    currentFilter.keyword = e.target.value;
    currentPageNum = 1;
    renderTable();
  });
  container.querySelector('#filter-category').addEventListener('change', (e) => {
    currentFilter.category = e.target.value;
    currentPageNum = 1;
    renderTable();
  });
  container.querySelector('#filter-warehouse').addEventListener('change', (e) => {
    currentFilter.warehouse = e.target.value;
    currentPageNum = 1;
    renderTable();
  });
  container.querySelector('#filter-stock').addEventListener('change', (e) => {
    currentFilter.stock = e.target.value;
    currentPageNum = 1;
    renderTable();
  });

  // 엑셀 내보내기 — 현재 표시 중인 컬럼만 내보내기
  container.querySelector('#btn-export').addEventListener('click', () => {
    try {
      const exportData = data.map(row => {
        const obj = {};
        activeFields.forEach(key => { obj[FIELD_LABELS[key]] = row[key]; });
        return obj;
      });
      const baseName = (state.fileName || '재고현황').replace(/\.[^.]+$/, '');
      downloadExcel(exportData, `${baseName}_재고현황`);
      showToast('엑셀 파일을 다운로드했습니다.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // 품목 추가 버튼
  container.querySelector('#btn-add-item').addEventListener('click', () => {
    openItemModal(container, navigateTo);
  });

  // === 초기 렌더링 ===
  renderTableHeader();
  renderTable();
}

// === 품목 추가/편집 모달 ===

function openItemModal(container, navigateTo, editIdx = null) {
  const state = getState();
  const isEdit = editIdx !== null;
  const item = isEdit ? (state.mappedData[editIdx] || {}) : {};

  // 모달 HTML
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? '품목 수정' : '새 품목 추가'}</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">품목명 <span class="required">*</span></label>
            <input class="form-input" id="f-itemName" value="${item.itemName || ''}" placeholder="예: A4용지" />
          </div>
          <div class="form-group">
            <label class="form-label">품목코드</label>
            <input class="form-input" id="f-itemCode" value="${item.itemCode || ''}" placeholder="예: P-001" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">분류</label>
            <input class="form-input" id="f-category" value="${item.category || ''}" placeholder="예: 사무용품" />
          </div>
          <div class="form-group">
            <label class="form-label">수량 <span class="required">*</span></label>
            <input class="form-input" type="number" id="f-quantity" value="${item.quantity ?? ''}" placeholder="0" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">단위</label>
            <input class="form-input" id="f-unit" value="${item.unit || ''}" placeholder="EA, KG, M ..." />
          </div>
          <div class="form-group">
            <label class="form-label">단가</label>
            <input class="form-input" type="number" id="f-unitPrice" value="${item.unitPrice ?? ''}" placeholder="0" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">창고/위치</label>
            <input class="form-input" id="f-warehouse" value="${item.warehouse || ''}" placeholder="예: 본사 1층" />
          </div>
          <div class="form-group">
            <label class="form-label">비고</label>
            <input class="form-input" id="f-note" value="${item.note || ''}" placeholder="메모" />
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="modal-cancel">취소</button>
        <button class="btn btn-primary" id="modal-save">${isEdit ? '수정' : '추가'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 닫기
  const close = () => overlay.remove();
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // 저장
  overlay.querySelector('#modal-save').addEventListener('click', () => {
    const name = overlay.querySelector('#f-itemName').value.trim();
    const qty = overlay.querySelector('#f-quantity').value;

    if (!name) {
      showToast('품목명은 필수입니다.', 'warning');
      overlay.querySelector('#f-itemName').focus();
      return;
    }

    const newItem = {
      itemName: name,
      itemCode: overlay.querySelector('#f-itemCode').value.trim(),
      category: overlay.querySelector('#f-category').value.trim(),
      quantity: qty === '' ? 0 : parseFloat(qty),
      unit: overlay.querySelector('#f-unit').value.trim(),
      unitPrice: parseFloat(overlay.querySelector('#f-unitPrice').value) || 0,
      warehouse: overlay.querySelector('#f-warehouse').value.trim(),
      note: overlay.querySelector('#f-note').value.trim(),
    };
    // 합계 자동 계산
    newItem.totalPrice = newItem.quantity * newItem.unitPrice;

    if (isEdit) {
      updateItem(editIdx, newItem);
      showToast(`"${name}" 항목을 수정했습니다.`, 'success');
    } else {
      addItem(newItem);
      showToast(`"${name}" 항목을 추가했습니다.`, 'success');
    }

    close();
    // 페이지 새로 그리기
    renderInventoryPage(container, navigateTo);
  });

  // 첫 입력란에 포커스
  setTimeout(() => overlay.querySelector('#f-itemName').focus(), 100);
}

// === 유틸 ===

function formatCell(key, value) {
  if (value === '' || value === null || value === undefined) return '';
  if (['quantity', 'unitPrice', 'totalPrice'].includes(key)) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      if (key === 'unitPrice' || key === 'totalPrice') {
        return '₩' + num.toLocaleString('ko-KR');
      }
      return num.toLocaleString('ko-KR');
    }
  }
  return String(value);
}

function calcTotalQty(data) {
  return data.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0).toLocaleString('ko-KR');
}

function calcTotalPrice(data) {
  const total = data.reduce((s, r) => s + (parseFloat(r.totalPrice) || 0), 0);
  return total > 0 ? '₩' + total.toLocaleString('ko-KR') : '-';
}

function getCategories(data) {
  return [...new Set(data.map(r => r.category).filter(Boolean))].sort();
}

function getWarehouses(data) {
  return [...new Set(data.map(r => r.warehouse).filter(Boolean))].sort();
}
