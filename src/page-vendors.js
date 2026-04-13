/**
 * page-vendors.js - 거래처 마스터 관리
 * 역할: 거래처 정보를 체계적으로 관리 (연락처, 담당자, 계좌 등)
 * 왜 필수? → ₩50만/월 이상 제품은 거래처 DB가 없으면 경쟁 불가
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';

export function renderVendorsPage(container, navigateTo) {
  const state = getState();
  const vendors = state.vendorMaster || [];
  const transactions = state.transactions || [];
  const vendorStats = buildVendorStats(vendors, transactions);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🤝</span> 거래처 관리</h1>
        <div class="page-desc">거래처 정보를 체계적으로 관리합니다. 발주서·거래명세서에 자동 연동됩니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-export-vendors">📥 내보내기</button>
        <button class="btn btn-primary" id="btn-add-vendor">+ 거래처 등록</button>
      </div>
    </div>

    <!-- 검색 & 통계 -->
    <div class="card card-compact" style="margin-bottom:12px;">
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <div style="flex:1; min-width:200px;">
          <input class="form-input" id="vendor-search" placeholder="🔍 거래처명, 담당자, 사업자번호 검색..." />
        </div>
        <div style="display:flex; gap:16px; font-size:13px; color:var(--text-muted);">
          <span>전체 <strong style="color:var(--accent);">${vendors.length}</strong>개</span>
          <span>매입처 <strong>${vendors.filter(v => v.type === 'supplier').length}</strong></span>
          <span>매출처 <strong>${vendors.filter(v => v.type === 'customer').length}</strong></span>
        </div>
      </div>
    </div>

    <!-- 거래처 목록 -->
    <div class="card card-compact" style="margin-bottom:12px;">
      <div style="display:flex; flex-wrap:wrap; gap:16px; font-size:13px; color:var(--text-muted);">
        <div>거래 발생 거래처 <strong style="color:var(--accent);">${vendorStats.activeCount}</strong>곳</div>
        <div>누적 매입 <strong>${formatMoney(vendorStats.totalIn)}</strong></div>
        <div>누적 매출 <strong>${formatMoney(vendorStats.totalOut)}</strong></div>
      </div>
    </div>

    <div class="card card-flush" id="vendor-list-area">
      ${renderVendorList(vendors, '', vendorStats.map)}
    </div>

    <!-- 등록/수정 모달 -->
    <div class="modal-overlay" id="vendor-modal" style="display:none;">
      <div class="modal" style="max-width:640px;">
        <div class="modal-header">
          <h2 class="modal-title" id="vendor-modal-title">거래처 등록</h2>
          <button class="modal-close" id="vendor-modal-close">✕</button>
        </div>
        <div class="modal-body" id="vendor-modal-body"></div>
      </div>
    </div>
  `;

  // === 검색 ===
  container.querySelector('#vendor-search').addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    container.querySelector('#vendor-list-area').innerHTML = renderVendorList(vendors, keyword, vendorStats.map);
    bindVendorActions(container, vendors, navigateTo);
  });

  // === 거래처 등록 ===
  container.querySelector('#btn-add-vendor').addEventListener('click', () => {
    openVendorModal(container, null, vendors, navigateTo);
  });

  // === 내보내기 ===
  container.querySelector('#btn-export-vendors').addEventListener('click', () => {
    if (vendors.length === 0) { showToast('내보낼 거래처가 없습니다.', 'warning'); return; }
    const data = vendors.map(v => ({
      '구분': v.type === 'supplier' ? '매입처' : '매출처',
      '거래처명': v.name,
      '사업자번호': v.bizNumber || '',
      '대표자': v.ceoName || '',
      '담당자': v.contactName || '',
      '연락처': v.phone || '',
      '이메일': v.email || '',
      '주소': v.address || '',
      '계좌정보': v.bankInfo || '',
      '비고': v.note || '',
    }));
    downloadExcel(data, '거래처마스터');
    showToast('거래처 목록을 내보냈습니다.', 'success');
  });

  // 초기 이벤트 바인딩
  bindVendorActions(container, vendors, navigateTo);
}

/**
 * 거래처 목록 HTML
 */
function renderVendorList(vendors, keyword, statsMap) {
  const filtered = keyword
    ? vendors.filter(v =>
        (v.name || '').toLowerCase().includes(keyword) ||
        (v.contactName || '').toLowerCase().includes(keyword) ||
        (v.bizNumber || '').includes(keyword) ||
        (v.phone || '').includes(keyword)
      )
    : vendors;

  if (filtered.length === 0) {
    return `<div style="padding:40px; text-align:center; color:var(--text-muted);">
      <div style="font-size:32px; margin-bottom:8px;">🤝</div>
      ${keyword ? '검색 결과가 없습니다' : '등록된 거래처가 없습니다. [+ 거래처 등록] 버튼을 눌러주세요.'}
    </div>`;
  }

  return `
    <div class="table-wrapper" style="border:none; border-radius:0;">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:60px;">구분</th>
            <th>거래처명</th>
            <th>사업자번호</th>
            <th>담당자</th>
            <th>연락처</th>
            <th>이메일</th>
            <th class="text-right">거래 건수</th>
            <th class="text-right">누적 매입</th>
            <th class="text-right">누적 매출</th>
            <th>최근 거래</th>
            <th style="width:100px;">관련 품목</th>
            <th style="width:80px;">관리</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((v, i) => {
            const realIdx = vendors.indexOf(v);
            const stats = statsMap?.get(v.name) || { count: 0, totalIn: 0, totalOut: 0, lastDate: '' };
            return `
              <tr>
                <td><span class="badge ${v.type === 'supplier' ? 'badge-info' : 'badge-success'}">${v.type === 'supplier' ? '매입' : '매출'}</span></td>
                <td><strong>${v.name}</strong>${v.ceoName ? `<br><span style="font-size:11px; color:var(--text-muted);">대표: ${v.ceoName}</span>` : ''}</td>
                <td style="font-size:12px;">${v.bizNumber || '-'}</td>
                <td>${v.contactName || '-'}</td>
                <td style="font-size:12px;">${v.phone || '-'}</td>
                <td style="font-size:12px;">${v.email || '-'}</td>
                <td class="text-right">${stats.count.toLocaleString('ko-KR')}건</td>
                <td class="text-right">${formatMoney(stats.totalIn)}</td>
                <td class="text-right">${formatMoney(stats.totalOut)}</td>
                <td style="font-size:12px;">${stats.lastDate || '-'}</td>
                <td class="text-center">${getVendorItemCount(v.name)}개</td>
                <td>
                  <div style="display:flex; gap:4px;">
                    <button class="btn-icon vendor-edit" data-idx="${realIdx}" title="수정">✏️</button>
                    <button class="btn-icon btn-icon-danger vendor-delete" data-idx="${realIdx}" title="삭제">🗑️</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * 거래처에 연결된 품목 수
 */
function getVendorItemCount(vendorName) {
  const state = getState();
  const items = state.mappedData || [];
  return items.filter(i => i.vendor === vendorName).length;
}

function buildVendorStats(vendors, transactions) {
  const map = new Map();
  vendors.forEach(v => map.set(v.name, { count: 0, totalIn: 0, totalOut: 0, lastDate: '' }));

  transactions.forEach(tx => {
    const name = (tx.vendor || '').trim();
    if (!name) return;
    const stats = map.get(name) || { count: 0, totalIn: 0, totalOut: 0, lastDate: '' };
    const qty = toNumber(tx.quantity);
    const price = toNumber(tx.price ?? tx.unitPrice ?? tx.unitCost ?? 0);
    const amount = Math.round(qty * price);
    if (tx.type === 'in') stats.totalIn += amount;
    if (tx.type === 'out') stats.totalOut += amount;
    stats.count += 1;
    const dateKey = String(tx.date || tx.createdAt || '');
    if (dateKey && dateKey > stats.lastDate) stats.lastDate = dateKey;
    map.set(name, stats);
  });

  let totalIn = 0;
  let totalOut = 0;
  let activeCount = 0;
  map.forEach(stats => {
    totalIn += stats.totalIn;
    totalOut += stats.totalOut;
    if (stats.count > 0) activeCount += 1;
  });

  return { map, totalIn, totalOut, activeCount };
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number.parseFloat(String(value).replace(/,/g, ''));
  return Number.isNaN(numeric) ? 0 : numeric;
}

function formatMoney(value) {
  const numeric = toNumber(value);
  if (!numeric) return '₩0';
  return `₩${Math.round(numeric).toLocaleString('ko-KR')}`;
}

/**
 * 거래처 등록/수정 모달
 */
function openVendorModal(container, editData, vendors, navigateTo) {
  const modal = container.querySelector('#vendor-modal');
  const title = container.querySelector('#vendor-modal-title');
  const body = container.querySelector('#vendor-modal-body');

  title.textContent = editData ? '거래처 수정' : '거래처 등록';
  modal.style.display = 'flex';

  const d = editData || {};

  body.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">구분 <span class="required">*</span></label>
        <select class="form-select" id="vm-type">
          <option value="supplier" ${d.type === 'supplier' ? 'selected' : ''}>매입처 (물건 사오는 곳)</option>
          <option value="customer" ${d.type === 'customer' ? 'selected' : ''}>매출처 (물건 파는 곳)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">거래처명 <span class="required">*</span></label>
        <input class="form-input" id="vm-name" value="${d.name || ''}" placeholder="예: (주)삼성전자" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">사업자번호</label>
        <input class="form-input" id="vm-biz" value="${d.bizNumber || ''}" placeholder="000-00-00000" />
      </div>
      <div class="form-group">
        <label class="form-label">대표자명</label>
        <input class="form-input" id="vm-ceo" value="${d.ceoName || ''}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">담당자명</label>
        <input class="form-input" id="vm-contact" value="${d.contactName || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">연락처</label>
        <input class="form-input" id="vm-phone" value="${d.phone || ''}" placeholder="010-0000-0000" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">이메일</label>
        <input class="form-input" id="vm-email" value="${d.email || ''}" type="email" />
      </div>
      <div class="form-group">
        <label class="form-label">팩스</label>
        <input class="form-input" id="vm-fax" value="${d.fax || ''}" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">주소</label>
      <input class="form-input" id="vm-address" value="${d.address || ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">계좌정보</label>
      <input class="form-input" id="vm-bank" value="${d.bankInfo || ''}" placeholder="은행명 / 계좌번호 / 예금주" />
    </div>
    <div class="form-group">
      <label class="form-label">비고</label>
      <input class="form-input" id="vm-note" value="${d.note || ''}" />
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
      <button class="btn btn-outline" id="vm-cancel">취소</button>
      <button class="btn btn-primary" id="vm-save">${editData ? '수정' : '등록'}</button>
    </div>
  `;

  // 닫기
  const closeModal = () => { modal.style.display = 'none'; };
  container.querySelector('#vendor-modal-close').onclick = closeModal;
  body.querySelector('#vm-cancel').onclick = closeModal;

  // 저장
  body.querySelector('#vm-save').addEventListener('click', () => {
    const name = body.querySelector('#vm-name').value.trim();
    if (!name) { showToast('거래처명을 입력해 주세요.', 'warning'); return; }

    const newVendor = {
      type: body.querySelector('#vm-type').value,
      name,
      bizNumber: body.querySelector('#vm-biz').value.trim(),
      ceoName: body.querySelector('#vm-ceo').value.trim(),
      contactName: body.querySelector('#vm-contact').value.trim(),
      phone: body.querySelector('#vm-phone').value.trim(),
      email: body.querySelector('#vm-email').value.trim(),
      fax: body.querySelector('#vm-fax').value.trim(),
      address: body.querySelector('#vm-address').value.trim(),
      bankInfo: body.querySelector('#vm-bank').value.trim(),
      note: body.querySelector('#vm-note').value.trim(),
      createdAt: editData?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [...vendors];
    if (editData) {
      const idx = vendors.indexOf(editData);
      updated[idx] = newVendor;
    } else {
      updated.push(newVendor);
    }

    setState({ vendorMaster: updated });
    showToast(`거래처 "${name}"을(를) ${editData ? '수정' : '등록'}했습니다.`, 'success');
    closeModal();
    renderVendorsPage(container, navigateTo);
  });
}

/**
 * 수정/삭제 이벤트 바인딩
 */
function bindVendorActions(container, vendors, navigateTo) {
  container.querySelectorAll('.vendor-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      openVendorModal(container, vendors[idx], vendors, navigateTo);
    });
  });

  container.querySelectorAll('.vendor-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (!confirm(`"${vendors[idx].name}" 거래처를 삭제하시겠습니까?`)) return;
      const updated = vendors.filter((_, i) => i !== idx);
      setState({ vendorMaster: updated });
      showToast('거래처를 삭제했습니다.', 'info');
      renderVendorsPage(container, navigateTo);
    });
  });
}
