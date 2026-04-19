/**
 * page-payroll.js — 급여 계산 (Phase A: 스캐폴드 / Phase B: 본 구현 예정)
 * 현재: 월 선택 + 직원별 기본급·4대보험 간이 미리보기만 제공
 */
import { employees as employeesDb, payrolls as payrollsDb } from './db.js';
import { showToast } from './toast.js';
import { escapeHtml } from './ux-toolkit.js';

function fmt(n) { return '₩' + (parseFloat(n) || 0).toLocaleString('ko-KR'); }

export async function renderPayrollPage(container, navigateTo) {
  const now = new Date();
  const defY = now.getFullYear(), defM = now.getMonth() + 1;
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">💰</span> 급여 계산</h1>
        <div class="page-desc">월 귀속 급여를 일괄 계산합니다 (Phase B에서 4대보험/원천징수/PDF 명세서 본 구현)</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px;">
      <div class="form-row">
        <div class="form-group"><label>귀속 연도</label><input id="py-year" type="number" class="form-input" value="${defY}" /></div>
        <div class="form-group"><label>귀속 월</label><select id="py-month" class="form-select">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===defM?'selected':''}>${i+1}월</option>`).join('')}</select></div>
        <div class="form-group" style="align-self:end;"><button class="btn btn-primary" id="btn-py-load">조회</button></div>
      </div>
    </div>

    <div class="card" style="border-left:3px solid var(--warning);">
      <div style="padding:12px; background:var(--bg-muted, rgba(255,255,0,0.05));">
        <strong>⚠️ Phase A 안내</strong><br/>
        이 페이지는 기반 구조만 배포되어 있습니다. 다음 Phase B 배포에서 4대보험(국민연금 4.5% / 건강보험 3.545% / 장기요양 / 고용보험 0.9%)과 원천징수(간이세액표), 급여명세서 PDF 생성이 추가됩니다.<br/>
        현재는 직원별 기본급 미리보기와 저장된 급여 내역 조회만 가능합니다.
      </div>
    </div>

    <div class="card"><div id="py-table">직원 목록을 불러오세요.</div></div>
  `;
  container.querySelector('#btn-py-load').addEventListener('click', () => load(container));
  load(container);
}

async function load(container) {
  const y = parseInt(container.querySelector('#py-year').value);
  const m = parseInt(container.querySelector('#py-month').value);
  try {
    const [emps, pays] = await Promise.all([
      employeesDb.list({ status: 'active' }),
      payrollsDb.list({ year: y, month: m }),
    ]);
    const payMap = {};
    pays.forEach(p => { payMap[p.employeeId] = p; });

    container.querySelector('#py-table').innerHTML = emps.length === 0
      ? `<div class="empty-state"><div class="msg">등록된 직원이 없습니다</div></div>`
      : `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>사번</th><th>이름</th><th>부서</th><th class="text-right">기본급</th><th class="text-right">지급총액</th><th class="text-right">실지급</th><th>상태</th></tr></thead>
          <tbody>
            ${emps.map(e => {
              const p = payMap[e.id];
              return `<tr>
                <td>${escapeHtml(e.empNo)}</td>
                <td>${escapeHtml(e.name)}</td>
                <td>${escapeHtml(e.dept || '-')}</td>
                <td class="text-right">${fmt(e.baseSalary)}</td>
                <td class="text-right">${p ? fmt(p.gross) : '<span style="color:var(--text-muted);">미계산</span>'}</td>
                <td class="text-right">${p ? fmt(p.net) : '-'}</td>
                <td>${p ? `<span class="badge badge-info">${escapeHtml(p.status || '초안')}</span>` : '-'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    showToast('급여 데이터 로드 실패: ' + e.message, 'error');
  }
}
