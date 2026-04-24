/**
 * page-transfer.js - 창고 간 재고 이동 페이지
 * 역할: A창고에서 B창고로 품목을 옮기고, 이동 이력을 관리
 * 왜 필요? → 멀티 창고 운영 시 재고 이동 없이는 정확한 재고 파악 불가
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { escapeHtml } from './ux-toolkit.js';

const expandedTransferGroups = new Set();

export function renderTransferPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transfers = state.transfers || [];
  const warehouses = [...new Set(items.map(item => item.warehouse).filter(Boolean))].sort();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">창고 간 이동</h1>
        <div class="page-desc">품목을 다른 창고로 옮기고 이동 이력을 관리합니다.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📦 재고 이동 등록</div>
      <div style="display:grid; grid-template-columns: 1fr auto 1fr; gap:16px; align-items:end; margin-bottom:16px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">출발 창고 <span class="required">*</span></label>
          <select class="form-select" id="tf-from">
            <option value="">-- 선택 --</option>
            ${warehouses.map(warehouse => `<option value="${warehouse}">${warehouse}</option>`).join('')}
          </select>
        </div>
        <div style="font-size:24px; padding-bottom:8px; color:var(--accent);">→</div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">도착 창고 <span class="required">*</span></label>
          <select class="form-select" id="tf-to">
            <option value="">-- 선택 --</option>
            ${warehouses.map(warehouse => `<option value="${warehouse}">${warehouse}</option>`).join('')}
            <option value="__new__">+ 새 창고 추가</option>
          </select>
          <input class="form-input" id="tf-new-warehouse" placeholder="새 창고명을 입력하세요" style="display:none; margin-top:6px;" />
        </div>
      </div>

      <div class="form-row" style="margin-bottom:16px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">대상 품목 <span class="required">*</span></label>
          <select class="form-select" id="tf-item">
            <option value="">-- 출발 창고를 먼저 선택하세요 --</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">이동 수량 <span class="required">*</span></label>
          <input class="form-input" type="number" id="tf-qty" min="1" placeholder="0" />
          <div class="form-hint" id="tf-available"></div>
        </div>
      </div>

      <div class="form-group" style="margin-bottom:16px;">
        <label class="form-label">비고</label>
        <input class="form-input" id="tf-note" placeholder="이동 사유 (선택)" />
      </div>

      <button class="btn btn-primary btn-lg" id="btn-transfer">🏭 재고 이동 실행</button>
    </div>

    <div class="card">
      <div class="card-title">📋 이동 이력 <span class="card-subtitle">(${transfers.length}건)</span></div>
      ${transfers.length > 0 ? `
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>품목명</th>
                <th>출발</th>
                <th style="width:30px;"></th>
                <th>도착</th>
                <th class="text-right">수량</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody id="transfer-tbody">
              ${(() => {
                const recent = [...transfers].reverse().slice(0, 30);
                const groupOrder = [];
                const groupMap = new Map();
                recent.forEach(t => {
                  const key = t.itemCode ? String(t.itemCode).trim() : String(t.itemName || '').trim();
                  if (!groupMap.has(key)) { groupMap.set(key, []); groupOrder.push(key); }
                  groupMap.get(key).push(t);
                });

                let html = '';
                groupOrder.forEach(key => {
                  const group = groupMap.get(key);
                  const isExpanded = expandedTransferGroups.has(key);
                  if (group.length === 1) {
                    const t = group[0];
                    html += `<tr>
                      <td style="font-size:12px; color:var(--text-muted);">${t.date} ${t.time || ''}</td>
                      <td><strong>${escapeHtml(t.itemName)}</strong></td>
                      <td><span class="badge badge-default">${escapeHtml(t.fromWarehouse)}</span></td>
                      <td style="text-align:center;">→</td>
                      <td><span class="badge badge-info">${escapeHtml(t.toWarehouse)}</span></td>
                      <td class="text-right">${t.quantity}</td>
                      <td style="font-size:12px; color:var(--text-muted);">${t.note || '-'}</td>
                    </tr>`;
                  } else {
                    const totalQty = group.reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
                    html += `<tr class="transfer-group-header" data-transfer-group-key="${escapeHtml(key)}"
                      style="cursor:pointer; background:var(--bg-card); border-left:3px solid var(--accent);">
                      <td colspan="7" style="padding-left:8px;">
                        <span style="margin-right:6px; font-size:12px;">${isExpanded ? '▼' : '▶'}</span>
                        <strong>${escapeHtml(group[0].itemName)}</strong>
                        <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">이동 ${group.length}건 · 총 ${totalQty.toLocaleString('ko-KR')}개</span>
                      </td>
                    </tr>`;
                    if (isExpanded) {
                      group.forEach(t => {
                        html += `<tr class="transfer-child-row" style="background:var(--bg-lighter);">
                          <td style="font-size:12px; color:var(--text-muted); padding-left:24px;">${t.date} ${t.time || ''}</td>
                          <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(t.itemName)}</td>
                          <td><span class="badge badge-default">${escapeHtml(t.fromWarehouse)}</span></td>
                          <td style="text-align:center;">→</td>
                          <td><span class="badge badge-info">${escapeHtml(t.toWarehouse)}</span></td>
                          <td class="text-right">${t.quantity}</td>
                          <td style="font-size:12px; color:var(--text-muted);">${t.note || '-'}</td>
                        </tr>`;
                      });
                    }
                  }
                });
                return html;
              })()}
            </tbody>
          </table>
        </div>
      ` : '<div style="text-align:center; padding:24px; color:var(--text-muted);">아직 이동 이력이 없습니다.</div>'}
    </div>
  `;

  // 이동 이력 그룹 헤더 클릭 → 펼치기/접기
  container.querySelectorAll('.transfer-group-header').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.transferGroupKey;
      if (expandedTransferGroups.has(key)) {
        expandedTransferGroups.delete(key);
      } else {
        expandedTransferGroups.add(key);
      }
      renderTransferPage(container, navigateTo);
    });
  });

  const toSelect = container.querySelector('#tf-to');
  const newInput = container.querySelector('#tf-new-warehouse');
  toSelect.addEventListener('change', () => {
    newInput.style.display = toSelect.value === '__new__' ? 'block' : 'none';
  });

  const fromSelect = container.querySelector('#tf-from');
  const itemSelect = container.querySelector('#tf-item');

  fromSelect.addEventListener('change', () => {
    const warehouse = fromSelect.value;
    const warehouseItems = items.filter(item => item.warehouse === warehouse);

    itemSelect.innerHTML = `<option value="">-- 품목 선택 (${warehouseItems.length}건) --</option>`
      + warehouseItems.map((item, index) => {
        const quantity = parseFloat(item.quantity) || 0;
        return `<option value="${index}" data-qty="${quantity}">${item.itemName} (재고: ${quantity})</option>`;
      }).join('');

    container.querySelector('#tf-available').textContent = '';
  });

  itemSelect.addEventListener('change', () => {
    const option = itemSelect.selectedOptions[0];
    const quantity = option?.dataset?.qty || 0;
    container.querySelector('#tf-available').textContent = quantity > 0 ? `가용 수량: ${quantity}` : '';
  });

  container.querySelector('#btn-transfer').addEventListener('click', () => {
    const fromWarehouse = fromSelect.value;
    let toWarehouse = toSelect.value;
    if (toWarehouse === '__new__') toWarehouse = newInput.value.trim();

    if (!fromWarehouse) {
      showToast('출발 창고를 선택해 주세요.', 'warning');
      return;
    }
    if (!toWarehouse) {
      showToast('도착 창고를 선택해 주세요.', 'warning');
      return;
    }
    if (fromWarehouse === toWarehouse) {
      showToast('같은 창고로는 이동할 수 없습니다.', 'warning');
      return;
    }

    const itemIndex = parseInt(itemSelect.value, 10);
    if (Number.isNaN(itemIndex)) {
      showToast('품목을 선택해 주세요.', 'warning');
      return;
    }

    const warehouseItems = items.filter(item => item.warehouse === fromWarehouse);
    const sourceItem = warehouseItems[itemIndex];
    if (!sourceItem) {
      showToast('품목을 찾을 수 없습니다.', 'error');
      return;
    }

    const quantity = parseFloat(container.querySelector('#tf-qty').value);
    const currentQuantity = parseFloat(sourceItem.quantity) || 0;
    if (!quantity || quantity <= 0) {
      showToast('이동 수량을 입력해 주세요.', 'warning');
      return;
    }
    if (quantity > currentQuantity) {
      showToast(`재고가 부족합니다. 가용 수량: ${currentQuantity}`, 'error');
      return;
    }

    const note = container.querySelector('#tf-note').value.trim();
    const now = new Date();
    const updatedItems = [...items];
    const sourceIndex = updatedItems.findIndex(item => item.itemName === sourceItem.itemName && item.warehouse === fromWarehouse);

    if (sourceIndex >= 0) {
      updatedItems[sourceIndex] = {
        ...updatedItems[sourceIndex],
        quantity: currentQuantity - quantity,
      };
    }

    const destinationIndex = updatedItems.findIndex(item => item.itemName === sourceItem.itemName && item.warehouse === toWarehouse);
    if (destinationIndex >= 0) {
      const destinationQuantity = parseFloat(updatedItems[destinationIndex].quantity) || 0;
      updatedItems[destinationIndex] = {
        ...updatedItems[destinationIndex],
        quantity: destinationQuantity + quantity,
      };
    } else {
      updatedItems.push({
        ...sourceItem,
        warehouse: toWarehouse,
        quantity,
        totalPrice: quantity * (parseFloat(sourceItem.unitPrice) || 0),
      });
    }

    const newTransfer = {
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      itemName: sourceItem.itemName,
      itemCode: sourceItem.itemCode || '',
      fromWarehouse,
      toWarehouse,
      quantity,
      note,
    };

    setState({
      mappedData: updatedItems,
      transfers: [...transfers, newTransfer],
    });

    showToast(`${sourceItem.itemName} ${quantity}개를 ${fromWarehouse}에서 ${toWarehouse}로 이동했습니다.`, 'success');
    renderTransferPage(container, navigateTo);
  });
}
