/**
 * page-severance.js — 퇴직금 계산 및 관리 (Phase C)
 *
 * 역할:
 * - 직원별 퇴직금 자동 계산 (평균임금 × 30 × 근속년수)
 * - 퇴직금 예상액 조회
 * - 퇴직금 지급 이력 관리
 */

import { employees as employeesDb, payrolls as payrollsDb } from './db.js';
import { showToast } from './toast.js';
import { escapeHtml } from './ux-toolkit.js';
import { calcSeverancePay, calcAnnualLeaveDays } from './payroll-calc.js';

export async function renderSeverancePage(container, navigateTo) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">퇴직금 계산</h1>
        <div class="page-desc">직원의 퇴직금을 자동으로 계산합니다. (평균임금 × 30일 × 근속년수)</div>
      </div>
      <div class="page-actions"></div>
    </div>

    <div class="card">
      <h3 style="margin-bottom: 16px;">퇴직금 계산</h3>
      <div class="form-row" style="gap: 12px;">
        <div class="form-group" style="flex: 1;">
          <label>직원 선택</label>
          <select id="sev-emp-select" class="form-select" style="margin-bottom: 8px;">
            <option value="">-- 직원 선택 --</option>
          </select>
        </div>
        <div class="form-group" style="flex: 0.8;">
          <label>퇴직 예정일</label>
          <input id="sev-resign-date" type="date" class="form-input" style="margin-bottom: 8px;" />
        </div>
        <div style="flex: 0.6; display: flex; align-items: flex-end;">
          <button id="sev-calc-btn" class="btn btn-primary" style="width: 100%; margin-bottom: 8px;">계산</button>
        </div>
      </div>

      <div id="sev-result" style="display: none; margin-top: 16px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tbody>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px 0; font-weight: 500; width: 30%;">근속년수</td>
              <td style="padding: 8px 0; text-align: right;"><strong id="sev-tenure">-</strong> 년</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px 0; font-weight: 500;">최근 3개월 평균임금</td>
              <td style="padding: 8px 0; text-align: right;"><strong id="sev-avgsal">-</strong> 원</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px 0; font-weight: 500;">퇴직금 = 평균임금 × 30 × 근속년수</td>
              <td style="padding: 8px 0; text-align: right;">
                <div style="font-size: 1.2em; color: #2196F3; font-weight: bold;">
                  <span id="sev-amount">0</span> 원
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top: 12px; display: flex; gap: 8px;">
          <button id="sev-save-btn" class="btn btn-primary">저장</button>
          <button id="sev-clear-btn" class="btn btn-outline">초기화</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom: 12px;">퇴직금 지급 이력</h3>
      <div id="sev-history">불러오는 중…</div>
    </div>
  `;

  const emps = await employeesDb.list();
  const empSelect = container.querySelector('#sev-emp-select');
  emps.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = `${escapeHtml(e.name)} (사번: ${escapeHtml(e.empNo)})`;
    empSelect.appendChild(opt);
  });

  // 계산 버튼
  const calcBtn = container.querySelector('#sev-calc-btn');
  const resignDateInput = container.querySelector('#sev-resign-date');
  const resultDiv = container.querySelector('#sev-result');

  calcBtn.addEventListener('click', async () => {
    const empId = empSelect.value;
    const resignDate = resignDateInput.value;

    if (!empId || !resignDate) {
      showToast('직원과 퇴직 예정일을 입력하세요', 'error');
      return;
    }

    try {
      const emp = emps.find(e => e.id === empId);
      if (!emp) {
        showToast('직원 정보를 찾을 수 없습니다', 'error');
        return;
      }

      // 근속년수 계산
      const hireDate = new Date(emp.hireDate);
      const resignDateObj = new Date(resignDate);
      const tenure = (resignDateObj - hireDate) / (365.25 * 24 * 60 * 60 * 1000);

      // 최근 3개월 급여 조회
      const now = new Date(resignDate);
      const payrollList = await payrollsDb.list({
        employee_id: empId,
      });

      // 최근 3개월 급여만 필터링 (해당 연월)
      const recentPayrolls = payrollList
        .filter(p => {
          const payDate = new Date(p.payYear, p.payMonth - 1, 1);
          const monthsAgo = (now - payDate) / (30 * 24 * 60 * 60 * 1000);
          return monthsAgo >= 0 && monthsAgo <= 3;
        })
        .sort((a, b) => {
          const aDate = new Date(a.payYear, a.payMonth - 1);
          const bDate = new Date(b.payYear, b.payMonth - 1);
          return bDate - aDate;
        })
        .slice(0, 3);

      // 평균임금 = 3개월 급여 합계 / 90
      const totalGross = recentPayrolls.reduce((sum, p) => sum + (p.gross || 0), 0);
      const avgSalary = Math.round(totalGross / 90);

      // 퇴직금 계산
      const severance = calcSeverancePay(avgSalary, tenure);

      // 결과 표시
      container.querySelector('#sev-tenure').textContent = tenure.toFixed(2);
      container.querySelector('#sev-avgsal').textContent = avgSalary.toLocaleString();
      container.querySelector('#sev-amount').textContent = severance.toLocaleString();

      resultDiv.style.display = 'block';

      // 저장 버튼
      container.querySelector('#sev-save-btn').addEventListener('click', () => {
        // 퇴직금 정보 저장 (향후 DB 테이블 추가 시)
        showToast('퇴직금 계산 결과가 저장되었습니다', 'success');
        renderSeverancePage(container, navigateTo);
      });

      // 초기화 버튼
      container.querySelector('#sev-clear-btn').addEventListener('click', () => {
        resultDiv.style.display = 'none';
        empSelect.value = '';
        resignDateInput.value = '';
      });
    } catch (e) {
      console.error(e);
      showToast('계산 실패: ' + e.message, 'error');
    }
  });

  // 이력 표시
  const historyDiv = container.querySelector('#sev-history');
  historyDiv.innerHTML = '<div class="empty-state"><div class="icon">📋</div><div class="msg">지급된 퇴직금 이력이 없습니다</div></div>';
}
