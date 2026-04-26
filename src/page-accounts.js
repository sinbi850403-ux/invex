/**
 * page-accounts.js - 미수금/미지급금 정산 관리 (Phase 4)
 *
 * 역할: 판매(미수금)·구매(미지급금) 채권/채무 현황 추적, 에이징 분석, 정산 처리
 *
 * 데이터 소스:
 *   - accountEntries: [{type:'receivable'|'payable', vendorName, amount, dueDate, settled, ...}]
 *   - 미수금: salesOrders 출고 완료시 자동 생성
 *   - 미지급금: purchaseOrders 입고 완료시 자동 생성
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { addAuditLog } from './audit-log.js';
import { enableLocalReportSort } from './report-local-sort.js';
import { enableColumnResize } from './ux-toolkit.js';

let currentTab = 'receivable';

const fmt   = v  => (parseFloat(v) || 0).toLocaleString('ko-KR');
const today = () => new Date().toISOString().slice(0, 10);
const ageDays = dueDate => {
  if (!dueDate) return null;
  return Math.ceil((new Date(today()) - new Date(dueDate)) / 86400000);
};

function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── 에이징 버킷 ─────────────────────────────────────────────────────────────
function agingBucket(dueDate) {
  const days = ageDays(dueDate);
  if (days === null)   return { label: '-',      color: 'var(--text-muted)' };
  if (days <= 0)       return { label: '정상',    color: '#16a34a' };
  if (days <= 30)      return { label: '30일 내', color: '#d97706' };
  if (days <= 60)      return { label: '31-60일', color: '#ea580c' };
  if (days <= 90)      return { label: '61-90일', color: '#dc2626' };
  return               { label: '90일 초과',      color: '#7f1d1d' };
}

// ─── 메인 렌더 ──────────────────────────────────────────────────────────────
export function renderAccountsPage(container, navigateTo) {
  const state    = getState();
  const entries  = state.accountEntries || [];
  const vendors  = state.vendorMaster   || [];
  const invoices = state.taxInvoices    || [];

  const receivables = entries.filter(e => e.type === 'receivable');
  const payables    = entries.filter(e => e.type === 'payable');

  const totalReceivable = receivables.filter(e => !e.settled).reduce((s, e) => s + (parseFloat(e.amount)||0), 0);
  const totalPayable    = payables   .filter(e => !e.settled).reduce((s, e) => s + (parseFloat(e.amount)||0), 0);
  const overdueR  = receivables.filter(e => !e.settled && e.dueDate && e.dueDate < today());
  const overdueP  = payables   .filter(e => !e.settled && e.dueDate && e.dueDate < today());
  const settledThisMonth = entries.filter(e => e.settled && (e.settledDate||'').startsWith(today().slice(0,7))).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">미수금/미지급금 정산</h1>
        <div class="page-desc">판매 미수금과 구매 미지급금을 통합 관리하고 정산 처리합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-accounts-export">📥 내보내기</button>
        <button class="btn btn-primary" id="btn-add-account">+ 수동 전표</button>
      </div>
    </div>

    <!-- KPI -->
    <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">
      <div class="stat-card">
        <div class="stat-label">미수금 (받을 돈)</div>
        <div class="stat-value text-success">₩${fmt(totalReceivable)}</div>
        <div class="stat-sub">${overdueR.length ? `<span style="color:var(--danger);">⚠️ 연체 ${overdueR.length}건</span>` : '연체 없음'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">미지급금 (줄 돈)</div>
        <div class="stat-value text-danger">₩${fmt(totalPayable)}</div>
        <div class="stat-sub">${overdueP.length ? `<span style="color:var(--danger);">⚠️ 연체 ${overdueP.length}건</span>` : '연체 없음'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">순 채권 (미수 − 미지급)</div>
        <div class="stat-value ${totalReceivable - totalPayable >= 0 ? 'text-success' : 'text-danger'}">
          ₩${fmt(totalReceivable - totalPayable)}
        </div>
        <div class="stat-sub">${totalReceivable - totalPayable >= 0 ? '채권 우위' : '채무 우위'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">이번달 정산완료</div>
        <div class="stat-value text-accent">${settledThisMonth}건</div>
        <div class="stat-sub">${today().slice(0,7)}</div>
      </div>
    </div>

    <!-- 에이징 요약 -->
    ${renderAgingSummary(receivables, payables)}

    <!-- 탭 -->
    <div class="scan-mode-bar" style="margin-bottom:12px;">
      <button class="scan-mode-btn ${currentTab==='receivable'?'active':''}" data-tab="receivable">미수금 (${receivables.filter(e=>!e.settled).length})</button>
      <button class="scan-mode-btn ${currentTab==='payable'?'active':''}" data-tab="payable">미지급금 (${payables.filter(e=>!e.settled).length})</button>
      <button class="scan-mode-btn ${currentTab==='vendor-summary'?'active':''}" data-tab="vendor-summary">거래처별 집계</button>
      <button class="scan-mode-btn ${currentTab==='invoices'?'active':''}" data-tab="invoices">세금계산서 (${invoices.length})</button>
      <button class="scan-mode-btn ${currentTab==='settled'?'active':''}" data-tab="settled">정산완료 (${entries.filter(e=>e.settled).length})</button>
    </div>

    <div class="card card-flush" id="accounts-body">
      ${renderTab(entries, invoices, vendors, currentTab)}
    </div>

    <!-- 수동 전표 모달 -->
    <div class="modal-overlay" id="account-modal" style="display:none;">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h2 class="modal-title">수동 전표 등록</h2>
          <button class="modal-close" id="account-modal-close">✕</button>
        </div>
        <div class="modal-body" id="account-modal-body"></div>
      </div>
    </div>

    <!-- 정산 모달 -->
    <div class="modal-overlay" id="settle-modal" style="display:none;">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <h2 class="modal-title" id="settle-modal-title">정산 처리</h2>
          <button class="modal-close" id="settle-modal-close">✕</button>
        </div>
        <div class="modal-body" id="settle-modal-body"></div>
      </div>
    </div>
  `;

  // 탭 전환
  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      container.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab));
      const st2 = getState();
      container.querySelector('#accounts-body').innerHTML = renderTab(st2.accountEntries||[], st2.taxInvoices||[], vendors, currentTab);
      bindAccountActions(container, navigateTo);
    });
  });

  container.querySelector('#btn-add-account').addEventListener('click', () => openAccountModal(container, null, navigateTo));
  container.querySelector('#account-modal-close').addEventListener('click', () => { container.querySelector('#account-modal').style.display = 'none'; });
  container.querySelector('#settle-modal-close').addEventListener('click', () => { container.querySelector('#settle-modal').style.display = 'none'; });

  container.querySelector('#btn-accounts-export').addEventListener('click', () => {
    const st2 = getState();
    const data = (st2.accountEntries||[]).map(e => ({
      '구분':     e.type === 'receivable' ? '미수금(매출)' : '미지급금(매입)',
      '거래처':   e.vendorName || '',
      '금액':     parseFloat(e.amount) || 0,
      '발생일':   e.date || '',
      '만기일':   e.dueDate || '',
      '적요':     e.description || '',
      '정산여부': e.settled ? '완료' : '미정산',
      '정산일':   e.settledDate || '',
      '결제수단': e.paymentMethod || '',
    }));
    if (!data.length) { showToast('데이터가 없습니다.', 'warning'); return; }
    downloadExcel(data, `정산장부_${today()}`);
    showToast('장부를 내보냈습니다.', 'success');
  });

  bindAccountActions(container, navigateTo);
  container.querySelectorAll('.data-table').forEach((table) => {
    table.dataset.autoSort = 'off';
    enableColumnResize(table);
  });
  enableLocalReportSort(container);
}

// ─── 에이징 요약 카드 ────────────────────────────────────────────────────────
function renderAgingSummary(receivables, payables) {
  const pending = receivables.filter(e => !e.settled);
  const buckets = [
    { label: '정상 (만기 이전)',  fn: e => ageDays(e.dueDate) !== null && ageDays(e.dueDate) <= 0 },
    { label: '1-30일 연체',      fn: e => { const d = ageDays(e.dueDate); return d > 0 && d <= 30; } },
    { label: '31-60일 연체',     fn: e => { const d = ageDays(e.dueDate); return d > 30 && d <= 60; } },
    { label: '61-90일 연체',     fn: e => { const d = ageDays(e.dueDate); return d > 60 && d <= 90; } },
    { label: '90일+ 연체',       fn: e => ageDays(e.dueDate) > 90 },
  ];
  const colors = ['#16a34a', '#d97706', '#ea580c', '#dc2626', '#7f1d1d'];

  if (!pending.length) return '';

  return `
    <div class="card" style="margin-bottom:0;">
      <div class="card-title">📊 미수금 에이징 분석</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${buckets.map((b, i) => {
          const items = pending.filter(b.fn);
          const total = items.reduce((s, e) => s + (parseFloat(e.amount)||0), 0);
          return `
            <div style="flex:1;min-width:120px;padding:12px;background:${colors[i]}18;border:1px solid ${colors[i]}40;border-radius:8px;text-align:center;">
              <div style="font-size:11px;color:${colors[i]};font-weight:600;">${b.label}</div>
              <div style="font-size:18px;font-weight:700;color:${colors[i]};">₩${fmt(total)}</div>
              <div style="font-size:11px;color:var(--text-muted);">${items.length}건</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ─── 탭별 렌더 ───────────────────────────────────────────────────────────────
function renderTab(entries, invoices, vendors, tab) {
  if (tab === 'receivable')    return renderEntryTable(entries.filter(e => e.type==='receivable' && !e.settled), '미수금');
  if (tab === 'payable')       return renderEntryTable(entries.filter(e => e.type==='payable'    && !e.settled), '미지급금');
  if (tab === 'settled')       return renderEntryTable(entries.filter(e => e.settled), '정산완료', true);
  if (tab === 'vendor-summary') return renderVendorSummary(entries);
  if (tab === 'invoices')      return renderInvoiceTable(invoices);
  return '';
}

function renderEntryTable(list, label, isSettled = false) {
  const sorted = [...list].sort((a, b) => (a.dueDate||'').localeCompare(b.dueDate||''));

  if (!sorted.length) return `
    <div class="empty-state">
      <div class="icon">✅</div>
      <div class="msg">${label} 내역이 없습니다</div>
    </div>
  `;

  const t = today();
  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>거래처</th>
            <th class="col-fill">적요</th>
            <th class="text-right">금액</th>
            <th>발생일</th>
            <th>만기일</th>
            <th>연체</th>
            <th>상태</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(e => {
            const days = ageDays(e.dueDate);
            const bucket = agingBucket(e.dueDate);
            const isOverdue = !e.settled && e.dueDate && e.dueDate < t;
            return `
              <tr>
                <td>
                  <span style="background:${e.type==='receivable'?'rgba(22,163,74,0.12)':'rgba(239,68,68,0.12)'};color:${e.type==='receivable'?'#16a34a':'#ef4444'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">
                    ${e.type==='receivable'?'미수금':'미지급금'}
                  </span>
                </td>
                <td><strong>${escapeHtml(e.vendorName||'-')}</strong></td>
                <td class="col-fill" style="font-size:12px;color:var(--text-muted);">${escapeHtml(e.description||'-')}</td>
                <td class="text-right" style="font-weight:700;">₩${fmt(e.amount)}</td>
                <td style="font-size:12px;">${e.date||'-'}</td>
                <td style="font-size:12px;${isOverdue?'color:var(--danger);font-weight:600;':''}">${e.dueDate||'-'}</td>
                <td style="font-size:12px;">
                  ${days !== null && !e.settled
                    ? `<span style="color:${bucket.color};font-weight:600;">${bucket.label}${days > 0 ? ` (${days}일)` : ''}</span>`
                    : '-'}
                </td>
                <td>
                  ${e.settled
                    ? `<div style="font-size:11px;color:#16a34a;">✅ ${e.settledDate||''}<br/><span style="color:var(--text-muted);">${e.paymentMethod||''}</span></div>`
                    : `<span style="color:var(--danger);font-size:11px;font-weight:600;">미정산</span>`}
                </td>
                <td>
                  <div style="display:flex;gap:4px;">
                    ${!e.settled ? `<button class="btn btn-xs btn-outline acc-settle" data-id="${e.id}" style="color:#16a34a;border-color:#16a34a;">정산</button>` : ''}
                    <button class="btn btn-xs btn-outline acc-delete" data-id="${e.id}" style="color:var(--danger);border-color:var(--danger);">삭제</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight:700;">
            <td colspan="3" style="text-align:right;">합계</td>
            <td class="text-right">₩${fmt(sorted.reduce((s,e) => s+(parseFloat(e.amount)||0), 0))}</td>
            <td colspan="5"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderVendorSummary(entries) {
  const t = today();
  const pending = entries.filter(e => !e.settled);

  const byVendor = {};
  pending.forEach(e => {
    const v = e.vendorName || '(미지정)';
    if (!byVendor[v]) byVendor[v] = { receivable: 0, payable: 0, overdue: 0, count: 0 };
    byVendor[v][e.type] += parseFloat(e.amount) || 0;
    byVendor[v].count++;
    if (e.dueDate && e.dueDate < t) byVendor[v].overdue += parseFloat(e.amount) || 0;
  });

  const rows = Object.entries(byVendor).sort((a, b) => (b[1].receivable + b[1].payable) - (a[1].receivable + a[1].payable));

  if (!rows.length) return `<div class="empty-state"><div class="icon">📊</div><div class="msg">집계할 데이터가 없습니다</div></div>`;

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th class="col-fill">거래처</th>
            <th class="text-right">미수금</th>
            <th class="text-right">미지급금</th>
            <th class="text-right">순 채권</th>
            <th class="text-right">연체금액</th>
            <th class="text-right">건수</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([name, d]) => {
            const net = d.receivable - d.payable;
            return `
              <tr>
                <td class="col-fill"><strong>${escapeHtml(name)}</strong></td>
                <td class="text-right" style="color:#16a34a;font-weight:600;">₩${fmt(d.receivable)}</td>
                <td class="text-right" style="color:#ef4444;font-weight:600;">₩${fmt(d.payable)}</td>
                <td class="text-right" style="font-weight:700;color:${net>=0?'#16a34a':'#ef4444'};">₩${fmt(net)}</td>
                <td class="text-right" style="color:${d.overdue>0?'var(--danger)':'var(--text-muted)'};">${d.overdue>0?'₩'+fmt(d.overdue):'-'}</td>
                <td class="text-right">${d.count}건</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderInvoiceTable(invoices) {
  if (!invoices.length) return `<div class="empty-state"><div class="icon">📄</div><div class="msg">세금계산서가 없습니다</div></div>`;

  const sorted = [...invoices].sort((a, b) => (b.issueDate||'').localeCompare(a.issueDate||''));
  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>계산서번호</th>
            <th class="col-fill">거래처</th>
            <th>발행일</th>
            <th class="text-right">공급가</th>
            <th class="text-right">부가세</th>
            <th class="text-right">합계</th>
            <th>원본 문서</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(inv => `
            <tr>
              <td>
                <span style="background:${inv.type==='sales'?'rgba(22,163,74,0.12)':'rgba(37,99,235,0.12)'};color:${inv.type==='sales'?'#16a34a':'#2563eb'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">
                  ${inv.type==='sales'?'매출':'매입'}
                </span>
              </td>
              <td style="font-weight:600;font-family:monospace;">${escapeHtml(inv.invoiceNo)}</td>
              <td class="col-fill">${escapeHtml(inv.customer || inv.vendor || '-')}</td>
              <td style="font-size:12px;">${inv.issueDate||'-'}</td>
              <td class="text-right">₩${fmt(inv.supply)}</td>
              <td class="text-right" style="color:var(--text-muted);">₩${fmt(inv.vat)}</td>
              <td class="text-right" style="font-weight:700;">₩${fmt(inv.total)}</td>
              <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(inv.sourceOrderNo||'-')}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight:700;">
            <td colspan="4" style="text-align:right;">합계</td>
            <td class="text-right">₩${fmt(sorted.reduce((s,i)=>s+(parseFloat(i.supply)||0),0))}</td>
            <td class="text-right">₩${fmt(sorted.reduce((s,i)=>s+(parseFloat(i.vat)||0),0))}</td>
            <td class="text-right">₩${fmt(sorted.reduce((s,i)=>s+(parseFloat(i.total)||0),0))}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

// ─── 정산 모달 ───────────────────────────────────────────────────────────────
function openSettleModal(container, entry, navigateTo) {
  const modal = container.querySelector('#settle-modal');
  const body  = container.querySelector('#settle-modal-body');
  container.querySelector('#settle-modal-title').textContent = entry.type === 'receivable' ? '💰 미수금 정산' : '💸 미지급금 정산';

  body.innerHTML = `
    <div style="margin-bottom:16px;padding:12px;background:var(--bg-input,#1e2635);border-radius:8px;font-size:13px;">
      <div style="margin-bottom:4px;"><span style="color:var(--text-muted);">거래처:</span> <strong>${escapeHtml(entry.vendorName)}</strong></div>
      <div style="margin-bottom:4px;"><span style="color:var(--text-muted);">금액:</span> <strong style="font-size:18px;color:var(--accent);">₩${fmt(entry.amount)}</strong></div>
      <div><span style="color:var(--text-muted);">적요:</span> ${escapeHtml(entry.description||'-')}</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div>
        <label class="form-label">정산일 *</label>
        <input class="form-input" type="date" id="settle-date" value="${today()}" />
      </div>
      <div>
        <label class="form-label">결제 수단</label>
        <select class="form-input" id="settle-method">
          <option value="계좌이체">계좌이체</option>
          <option value="현금">현금</option>
          <option value="카드">카드</option>
          <option value="어음">어음</option>
          <option value="상계처리">상계처리</option>
        </select>
      </div>
    </div>
    <div style="margin-bottom:16px;">
      <label class="form-label">메모</label>
      <input class="form-input" type="text" id="settle-note" placeholder="영수증번호, 계좌 등" />
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button class="btn btn-outline" id="settle-cancel-btn">취소</button>
      <button class="btn btn-primary" id="settle-confirm-btn">✅ 정산 완료</button>
    </div>
  `;

  body.querySelector('#settle-cancel-btn').addEventListener('click', () => { modal.style.display = 'none'; });

  body.querySelector('#settle-confirm-btn').addEventListener('click', () => {
    const settledDate   = body.querySelector('#settle-date').value;
    const paymentMethod = body.querySelector('#settle-method').value;
    const settleNote    = body.querySelector('#settle-note').value.trim();

    const state2 = getState();
    const updated = (state2.accountEntries || []).map(e =>
      e.id === entry.id
        ? { ...e, settled: true, settledDate, paymentMethod, settleNote }
        : e
    );
    setState({ accountEntries: updated });
    addAuditLog('정산처리', entry.id, { vendor: entry.vendorName, amount: entry.amount, method: paymentMethod });
    showToast(`${entry.type==='receivable'?'미수금':'미지급금'} 정산 완료! (${paymentMethod})`, 'success');
    modal.style.display = 'none';
    renderAccountsPage(container, navigateTo);
  });

  modal.style.display = 'flex';
}

// ─── 수동 전표 모달 ──────────────────────────────────────────────────────────
function openAccountModal(container, editData, navigateTo) {
  const modal   = container.querySelector('#account-modal');
  const body    = container.querySelector('#account-modal-body');
  const state2  = getState();
  const vendors = state2.vendorMaster || [];

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div>
        <label class="form-label">구분 *</label>
        <select class="form-input" id="acc-type">
          <option value="receivable">미수금 (받을 돈)</option>
          <option value="payable">미지급금 (줄 돈)</option>
        </select>
      </div>
      <div>
        <label class="form-label">거래처</label>
        <select class="form-input" id="acc-vendor">
          <option value="">-- 선택 --</option>
          ${vendors.map(v => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="form-label">금액 *</label>
        <input class="form-input" type="number" id="acc-amount" placeholder="0" min="0" />
      </div>
      <div>
        <label class="form-label">발생일</label>
        <input class="form-input" type="date" id="acc-date" value="${today()}" />
      </div>
      <div>
        <label class="form-label">만기일</label>
        <input class="form-input" type="date" id="acc-due" />
      </div>
      <div>
        <label class="form-label">적요</label>
        <input class="form-input" type="text" id="acc-desc" placeholder="거래 내용" />
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button class="btn btn-outline" id="acc-cancel">취소</button>
      <button class="btn btn-primary" id="acc-save">등록</button>
    </div>
  `;

  body.querySelector('#acc-cancel').addEventListener('click', () => { modal.style.display = 'none'; });

  body.querySelector('#acc-save').addEventListener('click', () => {
    const amount = parseFloat(body.querySelector('#acc-amount').value);
    if (!amount || amount <= 0) { showToast('금액을 입력해 주세요.', 'warning'); return; }

    const entry = {
      id:          Date.now() + '_manual_' + Math.random().toString(36).slice(2, 6),
      type:        body.querySelector('#acc-type').value,
      vendorName:  body.querySelector('#acc-vendor').value,
      amount,
      date:        body.querySelector('#acc-date').value,
      dueDate:     body.querySelector('#acc-due').value,
      description: body.querySelector('#acc-desc').value.trim(),
      settled:     false,
    };

    const st3 = getState();
    setState({ accountEntries: [...(st3.accountEntries||[]), entry] });
    addAuditLog('전표등록', entry.id, { vendor: entry.vendorName, type: entry.type, amount });
    showToast('전표 등록 완료!', 'success');
    modal.style.display = 'none';
    renderAccountsPage(container, navigateTo);
  });

  modal.style.display = 'flex';
}

// ─── 액션 바인딩 ─────────────────────────────────────────────────────────────
function bindAccountActions(container, navigateTo) {
  const state2 = getState();
  const entries = state2.accountEntries || [];

  container.querySelectorAll('.acc-settle').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = entries.find(e => e.id === btn.dataset.id);
      if (entry) openSettleModal(container, entry, navigateTo);
    });
  });

  container.querySelectorAll('.acc-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = entries.find(e => e.id === btn.dataset.id);
      if (!entry || !confirm(`이 전표를 삭제하시겠습니까?\n거래처: ${entry.vendorName} / 금액: ₩${fmt(entry.amount)}`)) return;
      const updated = entries.filter(e => e.id !== btn.dataset.id);
      setState({ accountEntries: updated });
      showToast('전표 삭제 완료', 'info');
      renderAccountsPage(container, navigateTo);
    });
  });
}
