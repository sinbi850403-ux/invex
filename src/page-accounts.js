/**
 * page-accounts.js - 매출/매입 장부 (미수금·미지급 관리)
 * 역할: 거래처별 매출·매입을 기록하고 미수금/미지급 현황을 추적
 * 왜 필수? → 돈이 오가는 흐름을 모르면 현금 흐름이 막힘. 부도 방지의 기초.
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { addAuditLog } from './audit-log.js';

export function renderAccountsPage(container, navigateTo) {
  const state = getState();
  const accounts = state.accountEntries || [];
  const vendors = state.vendorMaster || [];
  const currency = state.currency || { code: 'KRW', symbol: '₩', rate: 1 };

  // 집계
  const totalReceivable = accounts.filter(a => a.type === 'receivable' && !a.settled).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const totalPayable = accounts.filter(a => a.type === 'payable' && !a.settled).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const settledCount = accounts.filter(a => a.settled).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📊</span> 매출/매입 장부</h1>
        <div class="page-desc">미수금·미지급 현황을 거래처별로 관리합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-accounts-export">📥 내보내기</button>
        <button class="btn btn-primary" id="btn-add-account">+ 전표 등록</button>
      </div>
    </div>

    <!-- KPI -->
    <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
      <div class="stat-card">
        <div class="stat-label">미수금 (받을 돈)</div>
        <div class="stat-value text-success">${currency.symbol}${totalReceivable.toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">미지급금 (줄 돈)</div>
        <div class="stat-value text-danger">${currency.symbol}${totalPayable.toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">순 채권</div>
        <div class="stat-value ${totalReceivable - totalPayable >= 0 ? 'text-success' : 'text-danger'}">
          ${currency.symbol}${(totalReceivable - totalPayable).toLocaleString('ko-KR')}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">정산 완료</div>
        <div class="stat-value text-accent">${settledCount}건</div>
      </div>
    </div>

    <!-- 탭 -->
    <div class="scan-mode-bar" style="margin-bottom:16px;">
      <button class="scan-mode-btn active" data-tab="all">전체</button>
      <button class="scan-mode-btn" data-tab="receivable">미수금 (매출)</button>
      <button class="scan-mode-btn" data-tab="payable">미지급 (매입)</button>
      <button class="scan-mode-btn" data-tab="settled">정산 완료</button>
    </div>

    <!-- 전표 목록 -->
    <div class="card card-flush" id="accounts-list">
      ${renderAccountsList(accounts, 'all', currency)}
    </div>

    <!-- 등록 모달 -->
    <div class="modal-overlay" id="account-modal" style="display:none;">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h2 class="modal-title">전표 등록</h2>
          <button class="modal-close" id="account-modal-close">✕</button>
        </div>
        <div class="modal-body" id="account-modal-body"></div>
      </div>
    </div>
  `;

  let currentTab = 'all';

  // 탭 전환
  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      container.querySelector('#accounts-list').innerHTML = renderAccountsList(accounts, currentTab, currency);
      bindAccountActions(container, accounts, navigateTo, currency);
    });
  });

  // 전표 등록
  container.querySelector('#btn-add-account').addEventListener('click', () => {
    openAccountModal(container, null, accounts, vendors, navigateTo, currency);
  });

  // 내보내기
  container.querySelector('#btn-accounts-export').addEventListener('click', () => {
    if (accounts.length === 0) { showToast('데이터가 없습니다.', 'warning'); return; }
    const data = accounts.map(a => ({
      '구분': a.type === 'receivable' ? '미수금(매출)' : '미지급(매입)',
      '거래처': a.vendorName || '',
      '금액': a.amount,
      '통화': a.currency || 'KRW',
      '일자': a.date || '',
      '만기일': a.dueDate || '',
      '적요': a.description || '',
      '정산여부': a.settled ? '완료' : '미정산',
      '정산일': a.settledDate || '',
    }));
    downloadExcel(data, `매출매입장부_${new Date().toISOString().split('T')[0]}`);
    showToast('장부를 내보냈습니다.', 'success');
  });

  bindAccountActions(container, accounts, navigateTo, currency);
}

function renderAccountsList(accounts, tab, currency) {
  let filtered = accounts;
  if (tab === 'receivable') filtered = accounts.filter(a => a.type === 'receivable' && !a.settled);
  if (tab === 'payable') filtered = accounts.filter(a => a.type === 'payable' && !a.settled);
  if (tab === 'settled') filtered = accounts.filter(a => a.settled);

  const sorted = [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (sorted.length === 0) {
    return '<div style="padding:40px; text-align:center; color:var(--text-muted);">해당 전표가 없습니다</div>';
  }

  return `
    <div class="table-wrapper" style="border:none; border-radius:0;">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:60px;">구분</th>
            <th>거래처</th>
            <th>적요</th>
            <th class="text-right">금액</th>
            <th>거래일</th>
            <th>만기일</th>
            <th>상태</th>
            <th style="width:100px;">관리</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map((a, i) => {
            const isOverdue = !a.settled && a.dueDate && a.dueDate < new Date().toISOString().split('T')[0];
            return `
              <tr class="${isOverdue ? 'row-danger' : ''}">
                <td><span class="badge ${a.type === 'receivable' ? 'badge-success' : 'badge-danger'}">${a.type === 'receivable' ? '매출' : '매입'}</span></td>
                <td><strong>${a.vendorName || '-'}</strong></td>
                <td style="font-size:12px; color:var(--text-muted);">${a.description || '-'}</td>
                <td class="text-right" style="font-weight:600;">${currency.symbol}${(parseFloat(a.amount) || 0).toLocaleString('ko-KR')}</td>
                <td style="font-size:12px;">${a.date || '-'}</td>
                <td style="font-size:12px; ${isOverdue ? 'color:var(--danger); font-weight:600;' : ''}">${a.dueDate || '-'} ${isOverdue ? '⚠️' : ''}</td>
                <td>${a.settled ? '<span class="badge badge-default">정산</span>' : '<span class="badge badge-warning">미정산</span>'}</td>
                <td>
                  <div style="display:flex; gap:4px;">
                    ${!a.settled ? `<button class="btn-icon acc-settle" data-idx="${accounts.indexOf(a)}" title="정산">✅</button>` : ''}
                    <button class="btn-icon btn-icon-danger acc-delete" data-idx="${accounts.indexOf(a)}" title="삭제">🗑️</button>
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

function openAccountModal(container, editData, accounts, vendors, navigateTo, currency) {
  const modal = container.querySelector('#account-modal');
  const body = container.querySelector('#account-modal-body');
  modal.style.display = 'flex';
  const today = new Date().toISOString().split('T')[0];

  body.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">구분 <span class="required">*</span></label>
        <select class="form-select" id="acc-type">
          <option value="receivable">미수금 (매출 - 받을 돈)</option>
          <option value="payable">미지급 (매입 - 줄 돈)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">거래처</label>
        <select class="form-select" id="acc-vendor">
          <option value="">-- 선택 --</option>
          ${vendors.map(v => `<option value="${v.name}">${v.name} (${v.type === 'supplier' ? '매입' : '매출'})</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">금액 <span class="required">*</span></label>
        <input class="form-input" type="number" id="acc-amount" placeholder="0" />
      </div>
      <div class="form-group">
        <label class="form-label">통화</label>
        <select class="form-select" id="acc-currency">
          <option value="KRW">🇰🇷 KRW (원)</option>
          <option value="USD">🇺🇸 USD ($)</option>
          <option value="JPY">🇯🇵 JPY (¥)</option>
          <option value="CNY">🇨🇳 CNY (元)</option>
          <option value="EUR">🇪🇺 EUR (€)</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">거래일</label>
        <input class="form-input" type="date" id="acc-date" value="${today}" />
      </div>
      <div class="form-group">
        <label class="form-label">만기일</label>
        <input class="form-input" type="date" id="acc-due-date" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">적요</label>
      <input class="form-input" id="acc-desc" placeholder="거래 내용" />
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
      <button class="btn btn-outline" id="acc-cancel">취소</button>
      <button class="btn btn-primary" id="acc-save">등록</button>
    </div>
  `;

  const close = () => { modal.style.display = 'none'; };
  container.querySelector('#account-modal-close').onclick = close;
  body.querySelector('#acc-cancel').onclick = close;

  body.querySelector('#acc-save').addEventListener('click', () => {
    const amount = parseFloat(body.querySelector('#acc-amount').value);
    if (!amount || amount <= 0) { showToast('금액을 입력해주세요.', 'warning'); return; }

    const entry = {
      id: Date.now(),
      type: body.querySelector('#acc-type').value,
      vendorName: body.querySelector('#acc-vendor').value,
      amount,
      currency: body.querySelector('#acc-currency').value,
      date: body.querySelector('#acc-date').value,
      dueDate: body.querySelector('#acc-due-date').value,
      description: body.querySelector('#acc-desc').value.trim(),
      settled: false,
      settledDate: '',
    };

    const updated = [...accounts, entry];
    setState({ accountEntries: updated });
    addAuditLog('전표등록', entry.vendorName || '미지정', { note: `${entry.type === 'receivable' ? '매출' : '매입'} ${amount}` });
    showToast('전표를 등록했습니다.', 'success');
    close();
    renderAccountsPage(container, navigateTo);
  });
}

function bindAccountActions(container, accounts, navigateTo, currency) {
  container.querySelectorAll('.acc-settle').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const updated = [...accounts];
      updated[idx] = { ...updated[idx], settled: true, settledDate: new Date().toISOString().split('T')[0] };
      setState({ accountEntries: updated });
      addAuditLog('정산완료', updated[idx].vendorName || '', { note: `${updated[idx].amount}` });
      showToast('정산 처리 완료', 'success');
      renderAccountsPage(container, navigateTo);
    });
  });

  container.querySelectorAll('.acc-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (!confirm('이 전표를 삭제하시겠습니까?')) return;
      const updated = accounts.filter((_, i) => i !== idx);
      setState({ accountEntries: updated });
      showToast('전표를 삭제했습니다.', 'info');
      renderAccountsPage(container, navigateTo);
    });
  });
}
