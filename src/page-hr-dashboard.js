/**
 * page-hr-dashboard.js — 인사 대시보드
 * Phase A: 인원 수·이번달 근태·연차 잔여 기본 요약. Phase C에서 확장.
 */
import { employees as employeesDb, attendance as attendanceDb, leaves as leavesDb } from './db.js';
import { showToast } from './toast.js';
import { escapeHtml } from './ux-toolkit.js';

export async function renderHrDashboardPage(container, navigateTo) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">HR 대시보드</h1>
        <div class="page-desc">인원·근태·휴가 현황을 한눈에 확인합니다</div>
      </div>
    </div>
    <div id="hr-dash-body">불러오는 중…</div>
  `;

  try {
    const [emps, pendingLeaves] = await Promise.all([
      employeesDb.list(),
      leavesDb.list({ status: '신청' }),
    ]);
    const active = emps.filter(e => e.status !== 'resigned');
    const today = new Date();
    const yKey = today.getFullYear(), mKey = today.getMonth() + 1;
    const monthFrom = `${yKey}-${String(mKey).padStart(2,'0')}-01`;
    const monthTo = `${yKey}-${String(mKey).padStart(2,'0')}-${String(new Date(yKey, mKey, 0).getDate()).padStart(2,'0')}`;
    const monthRecs = await attendanceDb.list({ from: monthFrom, to: monthTo, limit: 2000 });
    const absentCount = monthRecs.filter(r => r.status === '결근').length;

    container.querySelector('#hr-dash-body').innerHTML = `
      <div class="stats-grid" style="margin-bottom:16px;">
        <div class="stat-card"><div class="stat-label">재직 인원</div><div class="stat-value">${active.length}명</div></div>
        <div class="stat-card"><div class="stat-label">이번달 근태 기록</div><div class="stat-value">${monthRecs.length}건</div></div>
        <div class="stat-card"><div class="stat-label">이번달 결근</div><div class="stat-value" style="color:var(--danger)">${absentCount}일</div></div>
        <div class="stat-card"><div class="stat-label">휴가 승인 대기</div><div class="stat-value" style="color:var(--warning)">${pendingLeaves.length}건</div></div>
      </div>

      <div class="card">
        <div class="card-title">재직자 요약</div>
        ${active.length === 0 ? '<div class="empty-state"><div class="msg">등록된 직원이 없습니다</div></div>' : `
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>사번</th><th>이름</th><th>부서</th><th>직급</th><th>입사일</th><th>고용형태</th></tr></thead>
              <tbody>
                ${active.slice(0, 20).map(e => `
                  <tr>
                    <td>${escapeHtml(e.empNo || '')}</td>
                    <td>${escapeHtml(e.name || '')}</td>
                    <td>${escapeHtml(e.dept || '-')}</td>
                    <td>${escapeHtml(e.position || '-')}</td>
                    <td>${e.hireDate || '-'}</td>
                    <td>${escapeHtml(e.employmentType || '정규직')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  } catch (e) {
    showToast('대시보드 로드 실패: ' + e.message, 'error');
    container.querySelector('#hr-dash-body').innerHTML = `<div class="empty-state"><div class="msg">데이터 로드에 실패했습니다. Supabase 스키마 마이그레이션을 확인하세요.</div></div>`;
  }
}
