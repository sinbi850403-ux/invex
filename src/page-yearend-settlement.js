/**
 * page-yearend-settlement.js — 연말정산 보조 (Phase C)
 *
 * 역할:
 * - 연간 급여 집계
 * - 월별 소득세 비교 및 재계산
 * - 부양가족 변경에 따른 환급액 계산
 * - 연말정산 기초자료 제공
 */

import { employees as employeesDb, payrolls as payrollsDb } from './db.js';
import { showToast } from './toast.js';
import { escapeHtml } from './ux-toolkit.js';
import { calcIncomeTax } from './payroll-calc.js';

export async function renderYearendSettlementPage(container, navigateTo) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">연말정산 보조</h1>
        <div class="page-desc">연간 급여를 기반으로 환급액을 자동 계산합니다.</div>
      </div>
      <div class="page-actions"></div>
    </div>

    <div class="card">
      <div class="form-row" style="gap: 12px; margin-bottom: 16px;">
        <div class="form-group" style="flex: 1;">
          <label>정산 연도</label>
          <select id="yes-year" class="form-select">
            <option value="2025">2025년</option>
            <option value="2024">2024년</option>
            <option value="2023">2023년</option>
          </select>
        </div>
        <div class="form-group" style="flex: 1;">
          <label>부서 필터</label>
          <select id="yes-dept" class="form-select">
            <option value="">전체</option>
          </select>
        </div>
        <div style="flex: 0.4; display: flex; align-items: flex-end;">
          <button id="yes-calc-btn" class="btn btn-primary" style="width: 100%;">계산</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom: 12px;">연말정산 요약</h3>
      <div id="yes-summary">계산 후 표시됩니다</div>
    </div>

    <div class="card" style="display: none;" id="yes-detail-card">
      <h3 style="margin-bottom: 12px;">개별 상세 조회</h3>
      <div id="yes-detail">상세 정보</div>
    </div>
  `;

  const emps = await employeesDb.list();

  // 부서 필터 초기화
  const deptSet = new Set();
  emps.forEach(e => {
    if (e.dept) deptSet.add(e.dept);
  });
  const deptSelect = container.querySelector('#yes-dept');
  Array.from(deptSet).sort().forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    deptSelect.appendChild(opt);
  });

  // 계산 버튼
  const calcBtn = container.querySelector('#yes-calc-btn');
  calcBtn.addEventListener('click', async () => {
    const year = parseInt(container.querySelector('#yes-year').value);
    const dept = container.querySelector('#yes-dept').value;

    try {
      // 필터링된 직원 목록
      const filteredEmps = dept ? emps.filter(e => e.dept === dept) : emps;

      // 연간 급여 조회
      const allPayrolls = await payrollsDb.list();
      const yearPayrolls = allPayrolls.filter(p => p.payYear === year);

      // 직원별 연말정산 계산
      const settlements = filteredEmps.map(emp => {
        const empPayrolls = yearPayrolls.filter(p => p.employeeId === emp.id);

        // 연간 급여 합계
        const annualGross = empPayrolls.reduce((sum, p) => sum + (p.gross || 0), 0);

        // 월별 소득세 합계
        const monthlyTaxPaid = empPayrolls.reduce(
          (sum, p) => sum + ((p.incomeTax || 0) + (p.localTax || 0)),
          0
        );

        // 4대보험 합계
        const annualInsurance = empPayrolls.reduce(
          (sum, p) => sum + ((p.np || 0) + (p.hi || 0) + (p.ltc || 0) + (p.ei || 0)),
          0
        );

        // 재계산 소득세 (부양가족 수 = employee.dependents)
        const yearendTax = calcIncomeTax(annualGross, emp.dependents || 0);

        // 환급액 = 월별 납부세 + 4대보험 - 재계산 세액
        const refundAmount = monthlyTaxPaid + annualInsurance - yearendTax;

        return {
          id: emp.id,
          name: emp.name,
          empNo: emp.empNo,
          dept: emp.dept,
          annualGross,
          monthlyTaxPaid,
          yearendTax,
          refundAmount,
          annualInsurance,
          dependents: emp.dependents || 0,
          payrolls: empPayrolls,
        };
      });

      // 요약 테이블 렌더링
      const totalGross = settlements.reduce((sum, s) => sum + s.annualGross, 0);
      const totalTaxPaid = settlements.reduce((sum, s) => sum + s.monthlyTaxPaid, 0);
      const totalYearendTax = settlements.reduce((sum, s) => sum + s.yearendTax, 0);
      const totalRefund = settlements.reduce((sum, s) => sum + s.refundAmount, 0);

      const summaryHtml = `
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>직원명</th>
                <th class="text-right">연간 급여</th>
                <th class="text-right">기납부 세액</th>
                <th class="text-right">재계산 세액</th>
                <th class="text-right">환급액</th>
                <th style="width: 80px;">상세</th>
              </tr>
            </thead>
            <tbody>
              ${settlements.map((s, idx) => `
                <tr>
                  <td>${escapeHtml(s.name)} (${escapeHtml(s.empNo)})</td>
                  <td class="text-right">${(s.annualGross || 0).toLocaleString()}</td>
                  <td class="text-right">${(s.monthlyTaxPaid || 0).toLocaleString()}</td>
                  <td class="text-right">${(s.yearendTax || 0).toLocaleString()}</td>
                  <td class="text-right" style="color: ${s.refundAmount > 0 ? '#4CAF50' : '#F44336'}; font-weight: bold;">
                    ${s.refundAmount > 0 ? '+' : ''}${(s.refundAmount || 0).toLocaleString()}
                  </td>
                  <td>
                    <button class="btn-icon yes-detail" data-idx="${idx}" title="상세">→</button>
                  </td>
                </tr>
              `).join('')}
              <tr style="background: #f5f5f5; font-weight: bold; border-top: 2px solid #333;">
                <td>합계</td>
                <td class="text-right">${totalGross.toLocaleString()}</td>
                <td class="text-right">${totalTaxPaid.toLocaleString()}</td>
                <td class="text-right">${totalYearendTax.toLocaleString()}</td>
                <td class="text-right" style="color: ${totalRefund > 0 ? '#4CAF50' : '#F44336'}; font-weight: bold;">
                  ${totalRefund > 0 ? '+' : ''}${totalRefund.toLocaleString()}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      `;

      container.querySelector('#yes-summary').innerHTML = summaryHtml;

      // 상세 조회 버튼
      container.querySelectorAll('.yes-detail').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          const settlement = settlements[idx];
          showDetailModal(settlement);
        });
      });
    } catch (e) {
      console.error(e);
      showToast('계산 실패: ' + e.message, 'error');
    }
  });
}

function showDetailModal(settlement) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:700px;">
      <div class="modal-header">
        <h3>${escapeHtml(settlement.name)} (${escapeHtml(settlement.empNo)}) - 연말정산 상세</h3>
        <button class="btn-close">✕</button>
      </div>
      <div class="modal-body">
        <table style="width: 100%; border-collapse: collapse;">
          <tbody>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px 0; font-weight: 500;">연간 급여합계</td>
              <td style="padding: 8px 0; text-align: right;">${(settlement.annualGross || 0).toLocaleString()} 원</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px 0; font-weight: 500;">4대보험 합계</td>
              <td style="padding: 8px 0; text-align: right;">${(settlement.annualInsurance || 0).toLocaleString()} 원</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px 0; font-weight: 500;">월별 소득세 합계</td>
              <td style="padding: 8px 0; text-align: right;">${(settlement.monthlyTaxPaid || 0).toLocaleString()} 원</td>
            </tr>
            <tr style="border-bottom: 2px solid #333;">
              <td style="padding: 8px 0; font-weight: 500;">부양가족</td>
              <td style="padding: 8px 0; text-align: right;">${settlement.dependents}명</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px 0; font-weight: 500; color: #2196F3;">재계산 소득세</td>
              <td style="padding: 8px 0; text-align: right; color: #2196F3; font-weight: bold;">${(settlement.yearendTax || 0).toLocaleString()} 원</td>
            </tr>
            <tr style="background: #f0f7ff;">
              <td style="padding: 12px 0; font-weight: bold; color: #2196F3; font-size: 1.1em;">환급액 / 납부액</td>
              <td style="padding: 12px 0; text-align: right; font-weight: bold; color: ${settlement.refundAmount > 0 ? '#4CAF50' : '#F44336'}; font-size: 1.2em;">
                ${settlement.refundAmount > 0 ? '+' : ''}${(settlement.refundAmount || 0).toLocaleString()} 원
              </td>
            </tr>
          </tbody>
        </table>

        <h4 style="margin-top: 20px; margin-bottom: 12px;">월별 급여</h4>
        <div style="max-height: 300px; overflow-y: auto;">
          <table class="data-table" style="font-size: 0.9em;">
            <thead>
              <tr>
                <th>연월</th>
                <th class="text-right">급여</th>
                <th class="text-right">세액</th>
              </tr>
            </thead>
            <tbody>
              ${settlement.payrolls.map(p => `
                <tr>
                  <td>${p.payYear}년 ${String(p.payMonth).padStart(2, '0')}월</td>
                  <td class="text-right">${(p.gross || 0).toLocaleString()}</td>
                  <td class="text-right">${((p.incomeTax || 0) + (p.localTax || 0)).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary btn-close">닫기</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('.btn-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.btn-primary').addEventListener('click', () => overlay.remove());
}
