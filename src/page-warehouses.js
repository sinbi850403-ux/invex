/**
 * page-warehouses.js - 다중 창고 관리 센터 (Enterprise)
 * 역할: 창고 CRUD, 창고별 재고 현황 대시보드, 재고 분배 시각화
 * 왜 필요? → 다점포/유통업은 창고별 재고를 분리 관리해야 정확한 재고 파악 가능
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { canAction } from './auth.js';
import { handlePageError } from './error-monitor.js';

/**
 * 창고 ID 생성 유틸
 */
function generateWarehouseId() {
  return 'wh-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
}

/**
 * 창고 타입 한글 변환
 */
function getWarehouseTypeLabel(type) {
  const labels = {
    main: '본사 창고',
    branch: '지점 창고',
    factory: '공장/생산',
    temp: '임시 보관',
    returns: '반품 창고',
    other: '기타',
  };
  return labels[type] || type;
}

/**
 * 창고 타입별 아이콘
 */
function getWarehouseIcon(type) {
  const icons = {
    main: '🏢', branch: '🏪', factory: '🏭',
    temp: '📦', returns: '↩️', other: '🗄️',
  };
  return icons[type] || '🏢';
}

/**
 * 숫자 포맷 (1000 → 1,000)
 */
function fmt(n) {
  return Math.round(n || 0).toLocaleString('ko-KR');
}

export function renderWarehousesPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const warehouses = state.warehouses || [];
  const transfers = state.transfers || [];

  // 창고별 통계 계산
  const warehouseStats = warehouses.map(wh => {
    // 해당 창고의 품목들
    const whItems = items.filter(i => i.warehouse === wh.name);
    const totalQty = whItems.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0);
    const totalValue = whItems.reduce((sum, i) => {
      const qty = parseFloat(i.quantity) || 0;
      const price = parseFloat(i.unitPrice) || 0;
      return sum + (qty * price);
    }, 0);
    const itemCount = whItems.length;

    // 최근 7일 이동 건수
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentTransfers = transfers.filter(t =>
      (t.fromWarehouse === wh.name || t.toWarehouse === wh.name) &&
      new Date(t.date) >= weekAgo
    ).length;

    // 재고 부족 품목 수 (안전재고 미만)
    const safetyStock = state.safetyStock || {};
    const lowStockCount = whItems.filter(i => {
      const min = safetyStock[i.itemName];
      return min && (parseFloat(i.quantity) || 0) < min;
    }).length;

    return { ...wh, itemCount, totalQty, totalValue, recentTransfers, lowStockCount, whItems };
  });

  // 전체 통계
  const totalWarehouses = warehouses.length;
  const totalItems = items.length;
  const totalValue = items.reduce((sum, i) => sum + ((parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0)), 0);
  const unassignedItems = items.filter(i => !i.warehouse || !warehouses.some(w => w.name === i.warehouse)).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">다중 창고 관리</h1>
        <div class="page-desc">Enterprise — 창고별 재고 현황을 한눈에 관리합니다.</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary" id="btn-add-warehouse">➕ 창고 추가</button>
        <button class="btn btn-ghost" id="btn-assign-items" title="미배정 품목을 창고에 배정">📋 미배정 품목 (${unassignedItems})</button>
      </div>
    </div>

    <!-- 전체 요약 카드 -->
    <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-label">등록 창고</div>
        <div class="stat-value">${totalWarehouses}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 품목 수</div>
        <div class="stat-value">${fmt(totalItems)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 재고 가치</div>
        <div class="stat-value">₩${fmt(totalValue)}</div>
      </div>
      <div class="stat-card" style="${unassignedItems > 0 ? 'border-color:var(--warning);' : ''}">
        <div class="stat-label">미배정 품목</div>
        <div class="stat-value" style="${unassignedItems > 0 ? 'color:var(--warning);' : ''}">${unassignedItems}</div>
      </div>
    </div>

    <!-- 창고 카드 그리드 -->
    <div id="warehouse-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:16px; margin-bottom:24px;">
      ${warehouseStats.map(wh => `
        <div class="card warehouse-card" data-wh-id="${wh.id}" style="cursor:pointer; transition:all 0.2s; border-left:4px solid ${wh.type === 'main' ? 'var(--accent)' : wh.type === 'branch' ? 'var(--success)' : wh.type === 'factory' ? '#f59e0b' : 'var(--text-muted)'};">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <div style="font-size:24px; margin-bottom:4px;">${getWarehouseIcon(wh.type)}</div>
              <div style="font-size:16px; font-weight:700;">${wh.name}</div>
              <div style="font-size:12px; color:var(--text-muted);">${getWarehouseTypeLabel(wh.type)}${wh.manager ? ' · ' + wh.manager : ''}</div>
              ${wh.address ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">📍 ${wh.address}</div>` : ''}
            </div>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-ghost btn-sm btn-edit-wh" data-wh-id="${wh.id}" title="수정">✏️</button>
              ${wh.type !== 'main' ? `<button class="btn btn-ghost btn-sm btn-delete-wh" data-wh-id="${wh.id}" title="삭제">🗑️</button>` : ''}
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
            <div style="background:var(--bg-secondary); border-radius:8px; padding:10px;">
              <div style="font-size:11px; color:var(--text-muted);">품목</div>
              <div style="font-size:18px; font-weight:700;">${wh.itemCount}<span style="font-size:12px; color:var(--text-muted);"> 종</span></div>
            </div>
            <div style="background:var(--bg-secondary); border-radius:8px; padding:10px;">
              <div style="font-size:11px; color:var(--text-muted);">총 수량</div>
              <div style="font-size:18px; font-weight:700;">${fmt(wh.totalQty)}</div>
            </div>
            <div style="background:var(--bg-secondary); border-radius:8px; padding:10px;">
              <div style="font-size:11px; color:var(--text-muted);">재고 가치</div>
              <div style="font-size:14px; font-weight:700;">₩${fmt(wh.totalValue)}</div>
            </div>
            <div style="background:var(--bg-secondary); border-radius:8px; padding:10px;">
              <div style="font-size:11px; color:var(--text-muted);">7일 이동</div>
              <div style="font-size:18px; font-weight:700;">${wh.recentTransfers}<span style="font-size:12px; color:var(--text-muted);"> 건</span></div>
            </div>
          </div>

          ${wh.lowStockCount > 0 ? `
            <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); border-radius:6px; padding:8px; font-size:12px; color:var(--danger);">
              ⚠️ 재고 부족 ${wh.lowStockCount}건
            </div>
          ` : ''}

          <!-- 상위 5 품목 미니 리스트 -->
          ${wh.whItems.length > 0 ? `
            <div style="margin-top:12px; border-top:1px solid var(--border); padding-top:8px;">
              <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">상위 품목</div>
              ${wh.whItems
                .sort((a, b) => ((parseFloat(b.quantity) || 0) * (parseFloat(b.unitPrice) || 0)) - ((parseFloat(a.quantity) || 0) * (parseFloat(a.unitPrice) || 0)))
                .slice(0, 3)
                .map(item => `
                  <div style="display:flex; justify-content:space-between; font-size:12px; padding:2px 0;">
                    <span>${item.itemName}</span>
                    <span style="color:var(--text-muted);">${fmt(parseFloat(item.quantity) || 0)}개</span>
                  </div>
                `).join('')}
              ${wh.whItems.length > 3 ? `<div style="font-size:11px; color:var(--accent); margin-top:4px;">+${wh.whItems.length - 3}건 더...</div>` : ''}
            </div>
          ` : `
            <div style="text-align:center; padding:16px; font-size:12px; color:var(--text-muted);">
              아직 배정된 품목이 없습니다
            </div>
          `}
        </div>
      `).join('')}
    </div>

    <!-- 창고 등록/수정 모달 -->
    <div id="wh-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:500px;">
        <div class="modal-header">
          <h3 id="wh-modal-title">창고 추가</h3>
          <button class="btn btn-ghost btn-sm" id="wh-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="wh-edit-id" />
          <div class="form-group">
            <label class="form-label">창고명 <span class="required">*</span></label>
            <input class="form-input" id="wh-name" placeholder="예: 부산 물류센터" />
          </div>
          <div class="form-group">
            <label class="form-label">창고 유형</label>
            <select class="form-select" id="wh-type">
              <option value="main">🏢 본사 창고</option>
              <option value="branch">🏪 지점 창고</option>
              <option value="factory">🏭 공장/생산</option>
              <option value="temp">📦 임시 보관</option>
              <option value="returns">↩️ 반품 창고</option>
              <option value="other">🗄️ 기타</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">주소</label>
            <input class="form-input" id="wh-address" placeholder="창고 소재지" />
          </div>
          <div class="form-group">
            <label class="form-label">담당자</label>
            <input class="form-input" id="wh-manager" placeholder="관리 담당자명" />
          </div>
          <div class="form-group">
            <label class="form-label">메모</label>
            <textarea class="form-input" id="wh-memo" rows="2" placeholder="비고사항"></textarea>
          </div>
        </div>
        <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-ghost" id="wh-modal-cancel">취소</button>
          <button class="btn btn-primary" id="wh-modal-save">저장</button>
        </div>
      </div>
    </div>

    <!-- 미배정 품목 배정 모달 -->
    <div id="assign-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:700px;">
        <div class="modal-header">
          <h3>📋 미배정 품목 일괄 배정</h3>
          <button class="btn btn-ghost btn-sm" id="assign-modal-close">✕</button>
        </div>
        <div class="modal-body" style="max-height:400px; overflow-y:auto;">
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">배정할 창고</label>
            <select class="form-select" id="assign-target">
              ${warehouses.map(w => `<option value="${w.name}">${getWarehouseIcon(w.type)} ${w.name}</option>`).join('')}
            </select>
          </div>
          <div id="unassigned-list"></div>
        </div>
        <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-ghost" id="assign-cancel">취소</button>
          <button class="btn btn-primary" id="assign-all">전체 배정</button>
          <button class="btn btn-accent" id="assign-selected">선택 배정</button>
        </div>
      </div>
    </div>
  `;

  // === 이벤트 바인딩 ===

  const modal = container.querySelector('#wh-modal');
  const assignModal = container.querySelector('#assign-modal');

  // 모달 열기/닫기 유틸
  function openModal(editWh = null) {
    container.querySelector('#wh-edit-id').value = editWh?.id || '';
    container.querySelector('#wh-modal-title').textContent = editWh ? '창고 수정' : '창고 추가';
    container.querySelector('#wh-name').value = editWh?.name || '';
    container.querySelector('#wh-type').value = editWh?.type || 'branch';
    container.querySelector('#wh-address').value = editWh?.address || '';
    container.querySelector('#wh-manager').value = editWh?.manager || '';
    container.querySelector('#wh-memo').value = editWh?.memo || '';
    modal.style.display = 'flex';
  }

  function closeModal() { modal.style.display = 'none'; }
  function closeAssignModal() { assignModal.style.display = 'none'; }

  // 창고 추가 버튼
  container.querySelector('#btn-add-warehouse').addEventListener('click', () => {
    if (!canAction('warehouse:create')) {
      showToast('창고 추가 권한이 없습니다. 관리자만 가능합니다.', 'warning');
      return;
    }
    openModal();
  });

  // 모달 닫기
  container.querySelector('#wh-modal-close').addEventListener('click', closeModal);
  container.querySelector('#wh-modal-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // 창고 저장
  container.querySelector('#wh-modal-save').addEventListener('click', () => {
    const name = container.querySelector('#wh-name').value.trim();
    if (!name) { showToast('창고명을 입력해 주세요.', 'warning'); return; }

    const editId = container.querySelector('#wh-edit-id').value;
    const whData = {
      name,
      type: container.querySelector('#wh-type').value,
      address: container.querySelector('#wh-address').value.trim(),
      manager: container.querySelector('#wh-manager').value.trim(),
      memo: container.querySelector('#wh-memo').value.trim(),
    };

    const currentWarehouses = [...(getState().warehouses || [])];

    if (editId) {
      // 수정 모드
      const idx = currentWarehouses.findIndex(w => w.id === editId);
      if (idx >= 0) {
        const oldName = currentWarehouses[idx].name;
        currentWarehouses[idx] = { ...currentWarehouses[idx], ...whData };

        // 이름이 바뀌면 품목의 warehouse 필드도 업데이트
        if (oldName !== name) {
          const updatedItems = (getState().mappedData || []).map(item =>
            item.warehouse === oldName ? { ...item, warehouse: name } : item
          );
          setState({ warehouses: currentWarehouses, mappedData: updatedItems });
        } else {
          setState({ warehouses: currentWarehouses });
        }
        showToast(`"${name}" 창고를 수정했습니다.`, 'success');
      }
    } else {
      // 추가 모드 — 중복 체크
      if (currentWarehouses.some(w => w.name === name)) {
        showToast('이미 동일한 이름의 창고가 있습니다.', 'warning');
        return;
      }
      currentWarehouses.push({
        id: generateWarehouseId(),
        ...whData,
        createdAt: new Date().toISOString(),
      });
      setState({ warehouses: currentWarehouses });
      showToast(`"${name}" 창고를 추가했습니다.`, 'success');
    }

    closeModal();
    renderWarehousesPage(container, navigateTo);
  });

  // 창고 수정 버튼
  container.querySelectorAll('.btn-edit-wh').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const whId = btn.dataset.whId;
      const wh = warehouses.find(w => w.id === whId);
      if (wh) openModal(wh);
    });
  });

  // 창고 삭제 버튼
  container.querySelectorAll('.btn-delete-wh').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!canAction('warehouse:delete')) {
        showToast('창고 삭제 권한이 없습니다. 관리자만 가능합니다.', 'warning');
        return;
      }
      try {
        const whId = btn.dataset.whId;
        const wh = warehouses.find(w => w.id === whId);
        if (!wh) return;

        const whItems = items.filter(i => i.warehouse === wh.name);
        if (whItems.length > 0) {
          if (!confirm(`"${wh.name}"에 ${whItems.length}개 품목이 있습니다.\n삭제하면 해당 품목들은 미배정 상태가 됩니다.\n계속하시겠습니까?`)) return;
          const updatedItems = items.map(i =>
            i.warehouse === wh.name ? { ...i, warehouse: '' } : i
          );
          setState({ mappedData: updatedItems });
        } else {
          if (!confirm(`"${wh.name}" 창고를 삭제하시겠습니까?`)) return;
        }

        const updatedWarehouses = warehouses.filter(w => w.id !== whId);
        setState({ warehouses: updatedWarehouses });
        showToast(`"${wh.name}" 창고를 삭제했습니다.`, 'info');
        renderWarehousesPage(container, navigateTo);
      } catch (err) {
        handlePageError(err, { page: 'warehouses', action: 'delete-warehouse' });
      }
    });
  });

  // 창고 카드 클릭 → 재고 현황 페이지로 이동 (필터 적용)
  container.querySelectorAll('.warehouse-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // 버튼 클릭이면 무시
      if (e.target.closest('.btn-edit-wh') || e.target.closest('.btn-delete-wh')) return;
      const whId = card.dataset.whId;
      const wh = warehouses.find(w => w.id === whId);
      if (wh) {
        // 창고 필터를 설정하고 재고 현황 페이지로 이동
        setState({ activeWarehouseFilter: wh.name });
        navigateTo('inventory');
      }
    });
  });

  // 미배정 품목 모달
  container.querySelector('#btn-assign-items').addEventListener('click', () => {
    const unassigned = items.filter(i => !i.warehouse || !warehouses.some(w => w.name === i.warehouse));
    const listEl = container.querySelector('#unassigned-list');

    if (unassigned.length === 0) {
      showToast('미배정 품목이 없습니다.', 'info');
      return;
    }

    listEl.innerHTML = `
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">
        총 ${unassigned.length}개 품목이 창고에 배정되지 않았습니다.
      </div>
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead><tr>
            <th style="width:30px;"><input type="checkbox" id="assign-check-all" checked /></th>
            <th>품목명</th>
            <th>코드</th>
            <th class="text-right">수량</th>
          </tr></thead>
          <tbody>
            ${unassigned.map((item, i) => `
              <tr>
                <td><input type="checkbox" class="assign-check" data-item="${item.itemName}" checked /></td>
                <td>${item.itemName}</td>
                <td style="color:var(--text-muted);">${item.itemCode || '-'}</td>
                <td class="text-right">${fmt(parseFloat(item.quantity) || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // 전체 선택/해제
    listEl.querySelector('#assign-check-all')?.addEventListener('change', (e) => {
      listEl.querySelectorAll('.assign-check').forEach(cb => cb.checked = e.target.checked);
    });

    assignModal.style.display = 'flex';
  });

  container.querySelector('#assign-modal-close').addEventListener('click', closeAssignModal);
  container.querySelector('#assign-cancel').addEventListener('click', closeAssignModal);
  assignModal.addEventListener('click', (e) => { if (e.target === assignModal) closeAssignModal(); });

  // 전체 배정
  container.querySelector('#assign-all').addEventListener('click', () => {
    const targetWh = container.querySelector('#assign-target').value;
    if (!targetWh) return;

    const updatedItems = items.map(i => {
      if (!i.warehouse || !warehouses.some(w => w.name === i.warehouse)) {
        return { ...i, warehouse: targetWh };
      }
      return i;
    });

    setState({ mappedData: updatedItems });
    showToast(`미배정 품목을 "${targetWh}"에 배정했습니다.`, 'success');
    closeAssignModal();
    renderWarehousesPage(container, navigateTo);
  });

  // 선택 배정
  container.querySelector('#assign-selected').addEventListener('click', () => {
    const targetWh = container.querySelector('#assign-target').value;
    if (!targetWh) return;

    const checkedNames = new Set();
    container.querySelectorAll('.assign-check:checked').forEach(cb => {
      checkedNames.add(cb.dataset.item);
    });

    if (checkedNames.size === 0) {
      showToast('배정할 품목을 선택해 주세요.', 'warning');
      return;
    }

    const updatedItems = items.map(i => {
      if (checkedNames.has(i.itemName) && (!i.warehouse || !warehouses.some(w => w.name === i.warehouse))) {
        return { ...i, warehouse: targetWh };
      }
      return i;
    });

    setState({ mappedData: updatedItems });
    showToast(`${checkedNames.size}개 품목을 "${targetWh}"에 배정했습니다.`, 'success');
    closeAssignModal();
    renderWarehousesPage(container, navigateTo);
  });
}
