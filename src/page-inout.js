/**
 * page-inout.js - 입출고 관리 페이지
 * 역할: 입고/출고 기록 등록, 이력 조회, 재고 자동 반영
 * 핵심: 입출고를 기록하면 재고 현황의 수량이 자동으로 증감됨
 */

import { getState, addTransaction, deleteTransaction } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';

const PAGE_SIZE = 15;

/**
 * 입출고 관리 페이지 렌더링
 */
export function renderInoutPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🔄</span> 입출고 관리</h1>
        <div class="page-desc">입고·출고를 등록하면 재고 수량이 자동으로 변경됩니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-export-tx">📥 이력 내보내기</button>
        <button class="btn btn-success" id="btn-in">📥 입고 등록</button>
        <button class="btn btn-danger" id="btn-out">📤 출고 등록</button>
      </div>
    </div>

    <!-- 오늘 통계 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">전체 기록</div>
        <div class="stat-value text-accent">${transactions.length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">오늘 입고</div>
        <div class="stat-value text-success">${countToday(transactions, 'in')}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">오늘 출고</div>
        <div class="stat-value text-danger">${countToday(transactions, 'out')}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">등록 품목 수</div>
        <div class="stat-value">${items.length}</div>
      </div>
    </div>

    <!-- 필터 -->
    <div class="toolbar">
      <input type="text" class="search-input" id="tx-search" placeholder="품목명, 코드로 검색..." />
      <select class="filter-select" id="tx-type-filter">
        <option value="">전체</option>
        <option value="in">📥 입고만</option>
        <option value="out">📤 출고만</option>
      </select>
      <input type="date" class="filter-select" id="tx-date-filter" style="padding:7px 10px;" />
    </div>

    <!-- 이력 테이블 -->
    <div class="card card-flush">
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th>구분</th>
              <th>품목명</th>
              <th>품목코드</th>
              <th class="text-right">수량</th>
              <th class="text-right">단가</th>
              <th>일자</th>
              <th>비고</th>
              <th style="width:50px;">삭제</th>
            </tr>
          </thead>
          <tbody id="tx-body"></tbody>
        </table>
      </div>
      <div class="pagination" id="tx-pagination"></div>
    </div>

    ${items.length === 0 ? `
      <div class="alert alert-warning" style="margin-top:12px;">
        ⚠️ 등록된 품목이 없습니다. 먼저 재고 현황에서 품목을 등록하거나 파일을 업로드해 주세요.
      </div>
    ` : ''}
  `;

  let currentPageNum = 1;
  let filter = { keyword: '', type: '', date: '' };

  function getFilteredTx() {
    return transactions.filter(tx => {
      const kw = filter.keyword.toLowerCase();
      if (kw && !(
        (tx.itemName || '').toLowerCase().includes(kw) ||
        (tx.itemCode || '').toLowerCase().includes(kw)
      )) return false;
      if (filter.type && tx.type !== filter.type) return false;
      if (filter.date && tx.date !== filter.date) return false;
      return true;
    });
  }

  function renderTxTable() {
    const filtered = getFilteredTx();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPageNum > totalPages) currentPageNum = totalPages;
    const start = (currentPageNum - 1) * PAGE_SIZE;
    const pageData = filtered.slice(start, start + PAGE_SIZE);

    const tbody = container.querySelector('#tx-body');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:32px; color:var(--text-muted);">
        ${transactions.length === 0 ? '아직 입출고 기록이 없습니다. 위의 버튼으로 등록하세요.' : '검색 결과가 없습니다.'}
      </td></tr>`;
    } else {
      tbody.innerHTML = pageData.map((tx, i) => `
        <tr>
          <td class="col-num">${start + i + 1}</td>
          <td>
            <span class="${tx.type === 'in' ? 'type-in' : 'type-out'}">
              ${tx.type === 'in' ? '📥 입고' : '📤 출고'}
            </span>
          </td>
          <td><strong>${tx.itemName || '-'}</strong></td>
          <td style="color:var(--text-muted);">${tx.itemCode || '-'}</td>
          <td class="text-right">
            <span class="${tx.type === 'in' ? 'type-in' : 'type-out'}">
              ${tx.type === 'in' ? '+' : '-'}${parseFloat(tx.quantity || 0).toLocaleString('ko-KR')}
            </span>
          </td>
          <td class="text-right">${tx.unitPrice ? '₩' + parseFloat(tx.unitPrice).toLocaleString('ko-KR') : '-'}</td>
          <td>${tx.date || '-'}</td>
          <td style="color:var(--text-muted); font-size:13px;">${tx.note || ''}</td>
          <td class="text-center">
            <button class="btn-icon btn-icon-danger btn-del-tx" data-id="${tx.id}" title="삭제">🗑️</button>
          </td>
        </tr>
      `).join('');
    }

    // 페이지네이션
    const pagEl = container.querySelector('#tx-pagination');
    pagEl.innerHTML = `
      <span>${filtered.length}건</span>
      <div class="pagination-btns">
        <button class="page-btn" id="tx-prev" ${currentPageNum <= 1 ? 'disabled' : ''}>← 이전</button>
        <span style="padding:4px 8px; color:var(--text-muted); font-size:13px;">${currentPageNum} / ${totalPages}</span>
        <button class="page-btn" id="tx-next" ${currentPageNum >= totalPages ? 'disabled' : ''}>다음 →</button>
      </div>
    `;

    // 삭제 이벤트
    container.querySelectorAll('.btn-del-tx').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('이 기록을 삭제하시겠습니까?\n※ 재고 수량은 자동으로 되돌아가지 않습니다.')) {
          deleteTransaction(btn.dataset.id);
          showToast('기록을 삭제했습니다.', 'info');
          renderInoutPage(container, navigateTo);
        }
      });
    });

    // 페이지네이션 이벤트
    pagEl.querySelector('#tx-prev')?.addEventListener('click', () => { currentPageNum--; renderTxTable(); });
    pagEl.querySelector('#tx-next')?.addEventListener('click', () => { currentPageNum++; renderTxTable(); });
  }

  // 필터 이벤트
  container.querySelector('#tx-search').addEventListener('input', (e) => {
    filter.keyword = e.target.value;
    currentPageNum = 1;
    renderTxTable();
  });
  container.querySelector('#tx-type-filter').addEventListener('change', (e) => {
    filter.type = e.target.value;
    currentPageNum = 1;
    renderTxTable();
  });
  container.querySelector('#tx-date-filter').addEventListener('change', (e) => {
    filter.date = e.target.value;
    currentPageNum = 1;
    renderTxTable();
  });

  // 입고/출고 등록 버튼
  container.querySelector('#btn-in').addEventListener('click', () => {
    openTxModal(container, navigateTo, 'in', items);
  });
  container.querySelector('#btn-out').addEventListener('click', () => {
    openTxModal(container, navigateTo, 'out', items);
  });

  // 이력 내보내기
  container.querySelector('#btn-export-tx').addEventListener('click', () => {
    if (transactions.length === 0) {
      showToast('내보낼 기록이 없습니다.', 'warning');
      return;
    }
    const exportData = transactions.map(tx => ({
      '구분': tx.type === 'in' ? '입고' : '출고',
      '품목명': tx.itemName,
      '품목코드': tx.itemCode || '',
      '수량': tx.quantity,
      '단가': tx.unitPrice || '',
      '일자': tx.date,
      '비고': tx.note || '',
      '등록시간': tx.createdAt,
    }));
    downloadExcel(exportData, '입출고_이력');
    showToast('이력을 엑셀로 내보냈습니다.', 'success');
  });

  // 초기 렌더링
  renderTxTable();
}

/**
 * 입고/출고 등록 모달
 */
function openTxModal(container, navigateTo, type, items) {
  const today = new Date().toISOString().split('T')[0];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">${type === 'in' ? '📥 입고 등록' : '📤 출고 등록'}</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">품목 선택 <span class="required">*</span></label>
          ${items.length > 0 ? `
            <select class="form-select" id="tx-item">
              <option value="">-- 선택 --</option>
              ${items.map((item, i) => `
                <option value="${i}" data-code="${item.itemCode || ''}" data-price="${item.unitPrice || ''}">
                  ${item.itemName}${item.itemCode ? ` (${item.itemCode})` : ''}
                  ${type === 'out' ? ` [현재: ${parseFloat(item.quantity || 0)}]` : ''}
                </option>
              `).join('')}
            </select>
          ` : `
            <input class="form-input" id="tx-item-name" placeholder="품목명 직접 입력" />
          `}
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">수량 <span class="required">*</span></label>
            <input class="form-input" type="number" id="tx-qty" placeholder="0" min="1" />
          </div>
          <div class="form-group">
            <label class="form-label">단가</label>
            <input class="form-input" type="number" id="tx-price" placeholder="선택사항" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">일자 <span class="required">*</span></label>
          <input class="form-input" type="date" id="tx-date" value="${today}" />
        </div>
        <div class="form-group">
          <label class="form-label">비고</label>
          <input class="form-input" id="tx-note" placeholder="메모 (선택사항)" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="modal-cancel">취소</button>
        <button class="btn ${type === 'in' ? 'btn-success' : 'btn-danger'}" id="modal-save">
          ${type === 'in' ? '📥 입고 등록' : '📤 출고 등록'}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 품목 선택 시 단가 자동 채움
  const itemSelect = overlay.querySelector('#tx-item');
  if (itemSelect) {
    itemSelect.addEventListener('change', () => {
      const opt = itemSelect.selectedOptions[0];
      const price = opt?.dataset.price;
      if (price) {
        overlay.querySelector('#tx-price').value = price;
      }
    });
  }

  const close = () => overlay.remove();
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // 저장
  overlay.querySelector('#modal-save').addEventListener('click', () => {
    let itemName = '';
    let itemCode = '';

    if (items.length > 0 && itemSelect) {
      const idx = itemSelect.value;
      if (idx === '') {
        showToast('품목을 선택해 주세요.', 'warning');
        return;
      }
      const selectedItem = items[parseInt(idx)];
      itemName = selectedItem.itemName;
      itemCode = selectedItem.itemCode || '';
    } else {
      itemName = overlay.querySelector('#tx-item-name')?.value.trim();
      if (!itemName) {
        showToast('품목명을 입력해 주세요.', 'warning');
        return;
      }
    }

    const qty = parseFloat(overlay.querySelector('#tx-qty').value);
    if (!qty || qty <= 0) {
      showToast('수량을 입력해 주세요.', 'warning');
      return;
    }

    const date = overlay.querySelector('#tx-date').value;
    if (!date) {
      showToast('일자를 선택해 주세요.', 'warning');
      return;
    }

    // 출고 시 재고 확인
    if (type === 'out' && items.length > 0 && itemSelect) {
      const idx = parseInt(itemSelect.value);
      const currentQty = parseFloat(items[idx]?.quantity) || 0;
      if (qty > currentQty) {
        showToast(`재고가 부족합니다. (현재 ${currentQty})`, 'error');
        return;
      }
    }

    addTransaction({
      type,
      itemName,
      itemCode,
      quantity: qty,
      unitPrice: parseFloat(overlay.querySelector('#tx-price').value) || 0,
      date,
      note: overlay.querySelector('#tx-note').value.trim(),
    });

    showToast(
      `${type === 'in' ? '입고' : '출고'} 등록: ${itemName} ${qty}개`,
      type === 'in' ? 'success' : 'info'
    );
    close();
    renderInoutPage(container, navigateTo);
  });

  // 수량 입력에 포커스
  setTimeout(() => {
    const qtyInput = overlay.querySelector('#tx-qty');
    if (items.length > 0) {
      overlay.querySelector('#tx-item')?.focus();
    } else {
      overlay.querySelector('#tx-item-name')?.focus();
    }
  }, 100);
}

// === 유틸 ===

function countToday(transactions, type) {
  const today = new Date().toISOString().split('T')[0];
  return transactions.filter(tx => tx.type === type && tx.date === today).length;
}
