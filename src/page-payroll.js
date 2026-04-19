/**
 * page-payroll.js — 급여 월별 계산 & 확정 (Phase B-4)
 *
 * 역할:
 * - 월별 급여 자동 계산 (직원별 / 일괄)
 * - 급여액 검토 & 수정
 * - Admin만 "급여 확정"
 * - 개인별 급여명세서 (B-5에서 PDF)
 */

import { showToast } from './toast.js';
import { escapeHtml } from './ux-toolkit.js';
import { employees as employeesDb, attendance as attendanceDb } from './db.js';
import { canAction } from './auth.js';
import { isAdminVerified } from './admin-auth.js';
import { addAuditLog } from './audit-log.js';
import { calcPayroll } from './payroll-calc.js';
import { summarizeMonthAttendance } from './attendance-calc.js';
import { generatePayslipPDF, generatePayslipBulkPDF } from './pdf-generator.js';
import { payrolls as payrollsDb } from './db.js';

function fmtWon(n) {
  const v = parseFloat(n) || 0;
  return v ? '₩' + v.toLocaleString('ko-KR') : '-';
}

export async function renderPayrollPage(container, navigateTo) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">💵</span> 급여 계산 & 확정</h1>
        <div class="page-desc">월별 급여를 자동 계산·검토·확정합니다. Admin만 확정 및 명세서 발행 가능합니다.</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px;">
      <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;">
        <div class="form-group" style="flex:0.8; margin:0;">
          <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:500;">정산 월</label>
          <input id="payroll-month" type="month" class="form-input" />
        </div>
        <div class="form-group" style="flex:1; margin:0;">
          <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:500;">부서</label>
          <select id="payroll-dept" class="form-select"><option value="">전체</option></select>
        </div>
        <button id="payroll-calc-btn" class="btn btn-primary" style="white-space:nowrap;">계산</button>
      </div>
    </div>

    <div id="payroll-summary-wrap" style="display:none; margin-bottom:12px;">
      <div class="card">
        <h3 style="margin-bottom:12px;">이번달 급여 요약</h3>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:12px;">
          <div class="stat-card"><div class="stat-value"><span id="summary-count">0</span></div><div class="stat-label">대상 직원</div></div>
          <div class="stat-card"><div class="stat-value" id="summary-gross-val">₩0</div><div class="stat-label">총 지급액</div></div>
          <div class="stat-card"><div class="stat-value" id="summary-deduct-val">₩0</div><div class="stat-label">총 공제액</div></div>
          <div class="stat-card"><div class="stat-value" id="summary-net-val">₩0</div><div class="stat-label">총 실지급</div></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:12px;">급여 계산 결과</h3>
      <div id="payroll-table-wrap">월을 선택하고 "계산" 버튼을 클릭하세요.</div>
    </div>

    <div id="payroll-action-wrap" style="display:none; margin-top:12px;">
      <div class="card" style="display:flex; gap:8px;">
        <button id="payroll-confirm-btn" class="btn btn-primary" style="flex:1;">✓ 급여 확정</button>
        <button id="payroll-export-btn" class="btn btn-ghost" style="flex:1;">📄 명세서 다운로드</button>
      </div>
    </div>
  `;

  const now = new Date();
  const defaultMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const monthInput = container.querySelector('#payroll-month');
  if (monthInput) monthInput.value = defaultMonth;

  let currentPayrolls = [];
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth() + 1;

  const emps = await employeesDb.list({ status: 'active' });
  const deptSet = new Set(emps.filter(e => e.dept).map(e => e.dept));
  const deptSelect = container.querySelector('#payroll-dept');
  Array.from(deptSet).sort().forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    deptSelect.appendChild(opt);
  });

  container.querySelector('#payroll-calc-btn').addEventListener('click', async (e) => {
    const calcBtn = e.currentTarget;
    if (calcBtn.disabled) return;

    const monthStr = container.querySelector('#payroll-month').value;
    if (!monthStr) {
      showToast('월을 선택하세요', 'warning');
      return;
    }

    calcBtn.disabled = true;
    calcBtn.textContent = '계산 중…';

    const [year, month] = monthStr.split('-').map(Number);
    const dept = container.querySelector('#payroll-dept').value;

    try {
      const filtered = dept
        ? emps.filter(e => e.dept === dept && !e.resignDate)
        : emps.filter(e => !e.resignDate);

      const allAtt = await attendanceDb.list({
        from: `${year}-${String(month).padStart(2, '0')}-01`,
        to: `${year}-${String(month).padStart(2, '0')}-31`
      });

      const payrolls = [];
      for (const emp of filtered) {
        const empAtt = allAtt.filter(a => a.employeeId === emp.id);
        const attSummary = summarizeMonthAttendance(empAtt);
        const p = calcPayroll(emp, attSummary, emp.allowances || {}, {});

        payrolls.push({
          employeeId: emp.id,
          empNo: emp.empNo,
          name: emp.name,
          dept: emp.dept,
          ...p,
        });
      }

      currentPayrolls = payrolls;
      currentYear = year;
      currentMonth = month;
      renderPayrollTable(container, payrolls, year, month);
    } catch (e) {
      console.error(e);
      showToast('계산 실패: ' + e.message, 'error');
    } finally {
      calcBtn.disabled = false;
      calcBtn.textContent = '계산';
    }
  });

  container.querySelector('#payroll-confirm-btn')?.addEventListener('click', async () => {
    const adminOk = await isAdminVerified();
    if (!adminOk || !canAction('payroll:confirm')) {
      showToast('급여 확정은 admin만 가능합니다', 'error');
      return;
    }

    const monthStr = container.querySelector('#payroll-month').value;
    if (!monthStr) {
      showToast('월을 선택하세요', 'warning');
      return;
    }
    if (currentPayrolls.length === 0) {
      showToast('먼저 급여를 계산하세요', 'warning');
      return;
    }

    const [year, month] = monthStr.split('-').map(Number);
    if (!confirm(`${year}년 ${month}월 급여를 확정하시겠습니까?\n이후 수정이 불가능합니다.`)) return;

    const confirmBtn = container.querySelector('#payroll-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '저장 중…';

    try {
      // DB에 status='confirmed'로 저장
      const rows = currentPayrolls.map(p => ({
        employeeId: p.employeeId,
        payYear: year,
        payMonth: month,
        baseSalary: p.base || 0,
        allowances: p.allowances || {},
        deductions: {
          np: p.np || 0,
          hi: p.hi || 0,
          ltc: p.ltc || 0,
          ei: p.ei || 0,
          income_tax: p.income_tax || 0,
          local_tax: p.local_tax || 0,
        },
        grossPay: p.gross || 0,
        totalDeduction: p.total_deduct || 0,
        netPay: p.net || 0,
        status: 'confirmed',
        paidDate: new Date().toISOString().split('T')[0],
      }));

      await payrollsDb.bulkUpsert(rows);

      addAuditLog('payroll.confirm', `payroll:${year}-${month}`, {
        year, month, targetCount: currentPayrolls.length,
      });

      showToast(`${currentPayrolls.length}명의 급여가 확정되었습니다`, 'success');
      confirmBtn.textContent = '✓ 확정 완료';
    } catch (e) {
      showToast('확정 실패: ' + e.message, 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✓ 급여 확정';
    }
  });

  container.querySelector('#payroll-export-btn')?.addEventListener('click', async () => {
    if (currentPayrolls.length === 0) {
      showToast('먼저 급여를 계산하세요', 'warning');
      return;
    }
    await generatePayslipBulkPDF(currentPayrolls, currentYear, currentMonth);
  });
}

function renderPayrollTable(container, payrolls, year, month) {
  const wrap = container.querySelector('#payroll-table-wrap');
  const summaryWrap = container.querySelector('#payroll-summary-wrap');
  const actionWrap = container.querySelector('#payroll-action-wrap');

  if (payrolls.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="icon">👥</div><div class="msg">대상 직원이 없습니다</div></div>`;
    summaryWrap.style.display = 'none';
    actionWrap.style.display = 'none';
    return;
  }

  const totalGross = payrolls.reduce((s, p) => s + (p.gross || 0), 0);
  const totalDeduct = payrolls.reduce((s, p) => s + (p.total_deduct || 0), 0);
  const totalNet = payrolls.reduce((s, p) => s + (p.net || 0), 0);

  container.querySelector('#summary-count').textContent = payrolls.length;
  container.querySelector('#summary-gross-val').textContent = fmtWon(totalGross);
  container.querySelector('#summary-deduct-val').textContent = fmtWon(totalDeduct);
  container.querySelector('#summary-net-val').textContent = fmtWon(totalNet);
  summaryWrap.style.display = 'block';

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>사번</th><th>이름</th><th>부서</th>
            <th class="text-right">기본급</th><th class="text-right">수당</th>
            <th class="text-right">초과/야간</th><th class="text-right">4대보험</th>
            <th class="text-right">세금</th>
            <th class="text-right" style="background:#f5f5f5; color:#2196F3;">실지급액</th>
            <th style="width:60px;">상세</th>
          </tr>
        </thead>
        <tbody>
          ${payrolls.map((p, idx) => {
            const insurance = (p.np || 0) + (p.hi || 0) + (p.ltc || 0) + (p.ei || 0);
            const tax = (p.income_tax || 0) + (p.local_tax || 0);
            const overtime = (p.overtime_pay || 0) + (p.night_pay || 0) + (p.holiday_pay || 0);
            const allowanceSum = Object.values(p.allowances || {}).reduce((a, b) => a + b, 0);

            return `
              <tr>
                <td><strong>${escapeHtml(p.empNo || '')}</strong></td>
                <td>${escapeHtml(p.name || '')}</td>
                <td>${escapeHtml(p.dept || '-')}</td>
                <td class="text-right">${fmtWon(p.base)}</td>
                <td class="text-right">${fmtWon(allowanceSum)}</td>
                <td class="text-right">${fmtWon(overtime)}</td>
                <td class="text-right">${fmtWon(insurance)}</td>
                <td class="text-right">${fmtWon(tax)}</td>
                <td class="text-right" style="background:#f5f5f5; color:#2196F3; font-weight:bold;">${fmtWon(p.net)}</td>
                <td><button class="btn-icon payroll-detail" data-idx="${idx}">→</button></td>
              </tr>
            `;
          }).join('')}
          <tr style="background:#f0f0f0; font-weight:bold; border-top:2px solid #333;">
            <td colspan="3">합계</td>
            <td class="text-right">${fmtWon(payrolls.reduce((s, p) => s + (p.base || 0), 0))}</td>
            <td class="text-right">${fmtWon(payrolls.reduce((s, p) => s + Object.values(p.allowances || {}).reduce((a, b) => a + b, 0), 0))}</td>
            <td class="text-right">${fmtWon(payrolls.reduce((s, p) => s + ((p.overtime_pay || 0) + (p.night_pay || 0) + (p.holiday_pay || 0)), 0))}</td>
            <td class="text-right">${fmtWon(payrolls.reduce((s, p) => s + ((p.np || 0) + (p.hi || 0) + (p.ltc || 0) + (p.ei || 0)), 0))}</td>
            <td class="text-right">${fmtWon(payrolls.reduce((s, p) => s + ((p.income_tax || 0) + (p.local_tax || 0)), 0))}</td>
            <td class="text-right" style="background:#fff; color:#2196F3;">${fmtWon(totalNet)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('.payroll-detail').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = payrolls[parseInt(btn.dataset.idx)];
      showPayrollDetailModal(p, year, month);
    });
  });

  actionWrap.style.display = 'block';
}

function showPayrollDetailModal(payroll, year, month) {
  const allowanceSum = Object.values(payroll.allowances || {}).reduce((a, b) => a + b, 0);
  const insurance = (payroll.np || 0) + (payroll.hi || 0) + (payroll.ltc || 0) + (payroll.ei || 0);
  const tax = (payroll.income_tax || 0) + (payroll.local_tax || 0);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:700px;">
      <div class="modal-header">
        <h3>${escapeHtml(payroll.name)} (${escapeHtml(payroll.empNo)}) - ${year}년 ${month}월</h3>
        <button class="btn-close">✕</button>
      </div>
      <div class="modal-body">
        <h4 style="margin-bottom:12px; font-size:14px;">【지급항목】</h4>
        <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
          <tbody>
            <tr style="border-bottom:1px solid #e0e0e0;">
              <td style="padding:8px 0;">기본급</td>
              <td style="padding:8px 0; text-align:right; font-weight:500;">${fmtWon(payroll.base)}</td>
            </tr>
            ${allowanceSum > 0 ? `<tr style="border-bottom:1px solid #e0e0e0;"><td>수당</td><td style="text-align:right; font-weight:500;">${fmtWon(allowanceSum)}</td></tr>` : ''}
            ${(payroll.overtime_pay || 0) > 0 ? `<tr style="border-bottom:1px solid #e0e0e0;"><td>초과근무비</td><td style="text-align:right; font-weight:500;">${fmtWon(payroll.overtime_pay)}</td></tr>` : ''}
            ${(payroll.night_pay || 0) > 0 ? `<tr style="border-bottom:1px solid #e0e0e0;"><td>야간근무비</td><td style="text-align:right; font-weight:500;">${fmtWon(payroll.night_pay)}</td></tr>` : ''}
            <tr style="border-bottom:2px solid #333; background:#fafafa;">
              <td style="padding:10px 0; font-weight:bold;">총 지급액</td>
              <td style="padding:10px 0; text-align:right; font-weight:bold; color:#2196F3; font-size:16px;">${fmtWon(payroll.gross)}</td>
            </tr>
          </tbody>
        </table>

        <h4 style="margin-bottom:12px; font-size:14px;">【공제항목】</h4>
        <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
          <tbody>
            ${(payroll.np || 0) > 0 ? `<tr style="border-bottom:1px solid #e0e0e0;"><td>국민연금</td><td style="text-align:right;">${fmtWon(payroll.np)}</td></tr>` : ''}
            ${(payroll.hi || 0) > 0 ? `<tr style="border-bottom:1px solid #e0e0e0;"><td>건강보험</td><td style="text-align:right;">${fmtWon(payroll.hi)}</td></tr>` : ''}
            ${(payroll.ltc || 0) > 0 ? `<tr style="border-bottom:1px solid #e0e0e0;"><td>장기요양보험</td><td style="text-align:right;">${fmtWon(payroll.ltc)}</td></tr>` : ''}
            ${(payroll.income_tax || 0) > 0 ? `<tr style="border-bottom:1px solid #e0e0e0;"><td>소득세</td><td style="text-align:right;">${fmtWon(payroll.income_tax)}</td></tr>` : ''}
            <tr style="background:#fff5e6;">
              <td style="padding:10px 0; font-weight:bold;">총 공제액</td>
              <td style="padding:10px 0; text-align:right; font-weight:bold;">${fmtWon(payroll.total_deduct)}</td>
            </tr>
          </tbody>
        </table>

        <table style="width:100%;">
          <tr style="background:#f0f7ff;">
            <td style="padding:12px; font-weight:bold; color:#2196F3;">실지급액</td>
            <td style="padding:12px; text-align:right; font-weight:bold; font-size:20px; color:#2196F3;">${fmtWon(payroll.net)}</td>
          </tr>
        </table>
      </div>
      <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-ghost btn-pdf-slip">📄 PDF 출력</button>
        <button class="btn btn-primary btn-close">닫기</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('.btn-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.modal-header .btn-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.btn-pdf-slip').addEventListener('click', async () => {
    await generatePayslipPDF(payroll, year, month);
  });
}
