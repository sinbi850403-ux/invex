/**
 * HrDashboardPage.jsx - HR 대시보드
 */
import React, { useState, useEffect } from 'react';
import { employees as employeesDb, attendance as attendanceDb, leaves as leavesDb } from '../db.js';
import { showToast } from '../toast.js';

export default function HrDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [emps, pendingLeaves] = await Promise.all([
          employeesDb.list(),
          leavesDb.list({ status: '신청' }),
        ]);
        const active = emps.filter(e => e.status !== 'resigned');

        const today = new Date();
        const yKey = today.getFullYear();
        const mKey = today.getMonth() + 1;
        const monthFrom = `${yKey}-${String(mKey).padStart(2, '0')}-01`;
        const monthTo = `${yKey}-${String(mKey).padStart(2, '0')}-${String(new Date(yKey, mKey, 0).getDate()).padStart(2, '0')}`;
        const monthRecs = await attendanceDb.list({ from: monthFrom, to: monthTo, limit: 2000 });
        const absentCount = monthRecs.filter(r => r.status === '결근').length;

        setData({ active, monthRecs, absentCount, pendingLeaves });
      } catch (e) {
        showToast('대시보드 로드 실패: ' + e.message, 'error');
        setError('데이터 로드에 실패했습니다. Supabase 스키마 마이그레이션을 확인하세요.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">HR 대시보드</h1>
          <div className="page-desc">인원·근태·휴가 현황을 한눈에 확인합니다</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중…</div>
      ) : error ? (
        <div className="empty-state"><div className="msg">{error}</div></div>
      ) : (
        <>
          <div className="stats-grid" style={{ marginBottom: '16px' }}>
            <div className="stat-card">
              <div className="stat-label">재직 인원</div>
              <div className="stat-value">{data.active.length}명</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">이번달 근태 기록</div>
              <div className="stat-value">{data.monthRecs.length}건</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">이번달 결근</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{data.absentCount}일</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">휴가 승인 대기</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{data.pendingLeaves.length}건</div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">재직자 요약</div>
            {data.active.length === 0 ? (
              <div className="empty-state"><div className="msg">등록된 직원이 없습니다</div></div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>사번</th>
                      <th>이름</th>
                      <th>부서</th>
                      <th>직급</th>
                      <th>입사일</th>
                      <th>고용형태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.active.slice(0, 20).map(e => (
                      <tr key={e.id || e.empNo}>
                        <td>{e.empNo || ''}</td>
                        <td>{e.name || ''}</td>
                        <td>{e.dept || '-'}</td>
                        <td>{e.position || '-'}</td>
                        <td>{e.hireDate || '-'}</td>
                        <td>{e.employmentType || '정규직'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
