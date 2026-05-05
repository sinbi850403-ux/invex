/**
 * HrDashboardPage.jsx — HR 대시보드 (초고도화)
 * - 이번달 급여 합계 카드
 * - 부서별 인원 분포 바 차트
 * - 고용형태별 현황
 * - 이번달 결근·지각·조퇴 현황
 * - 승인 대기 휴가 목록
 */

import React, { useState, useEffect, useMemo } from 'react';
import { employees as employeesDb, attendance as attendanceDb, leaves as leavesDb, payrolls as payrollsDb } from '../db.js';
import { showToast } from '../toast.js';
import AIAnalysisPanel from '../components/AIAnalysisPanel.jsx';
import { buildHRPrompt } from '../ai-report.js';

function fmtWon(n) {
  const v = parseFloat(n) || 0;
  if (v >= 100000000) return '₩' + (v / 100000000).toFixed(1) + '억';
  if (v >= 10000) return '₩' + (v / 10000).toFixed(1) + '만';
  return '₩' + Math.round(v).toLocaleString('ko-KR');
}
function fmtWonFull(n) {
  const v = parseFloat(n) || 0;
  return '₩' + Math.round(v).toLocaleString('ko-KR');
}

export default function HrDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  useEffect(() => {
    async function load() {
      try {
        const [emps, pendingLeaves, monthPayrolls] = await Promise.all([
          employeesDb.list(),
          leavesDb.list({ status: '신청' }),
          payrollsDb.list({ year, month }).catch(() => []),
        ]);
        const active = emps.filter(e => e.status !== 'resigned');
        const resigned = emps.filter(e => e.status === 'resigned');

        // 부서별 인원
        const deptMap = {};
        active.forEach(e => {
          const d = e.dept || '미배정';
          deptMap[d] = (deptMap[d] || 0) + 1;
        });
        const depts = Object.entries(deptMap).sort((a, b) => b[1] - a[1]);

        // 고용형태별
        const typeMap = {};
        active.forEach(e => {
          const t = e.employmentType || '정규직';
          typeMap[t] = (typeMap[t] || 0) + 1;
        });

        // 이번달 근태
        const monthFrom = `${monthStr}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const monthTo = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
        const monthRecs = await attendanceDb.list({ from: monthFrom, to: monthTo, limit: 5000 }).catch(() => []);
        const absentCount = monthRecs.filter(r => r.status === '결근').length;
        const lateCount = monthRecs.filter(r => r.status === '지각').length;
        const earlyLeaveCount = monthRecs.filter(r => r.status === '조퇴').length;

        // 이번달 급여 합계
        const thisMonthPayrolls = (monthPayrolls || []).filter(p => p.payYear === year && p.payMonth === month);
        const totalGross = thisMonthPayrolls.reduce((s, p) => s + (p.gross || 0), 0);
        const totalNet = thisMonthPayrolls.reduce((s, p) => s + (p.net || 0), 0);

        // 입사 예정 / 최근 입사 (이번달)
        const recentHires = active.filter(e => (e.hireDate || '').startsWith(monthStr));

        setData({
          active, resigned, depts, typeMap, pendingLeaves,
          absentCount, lateCount, earlyLeaveCount,
          totalGross, totalNet, payrollCount: thisMonthPayrolls.length,
          recentHires,
        });
      } catch (e) {
        showToast('대시보드 로드 실패: ' + e.message, 'error');
        setError('데이터 로드에 실패했습니다. Supabase 스키마 마이그레이션을 확인하세요.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ✅ Hooks 규칙: useMemo는 항상 조건부 return 이전에 선언 (React error #310 방지)
  const DEPT_COLORS = ['var(--primary)', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

  const aiPrompt = useMemo(() => {
    if (!data) return null;
    return buildHRPrompt({
      activeCount: data.active.length,
      resignedCount: data.resigned.length,
      totalGross: data.totalGross,
      totalNet: data.totalNet,
      depts: data.depts,
      absentCount: data.absentCount,
      lateCount: data.lateCount,
      earlyLeaveCount: data.earlyLeaveCount,
      pendingLeaveCount: (data.pendingLeaves || []).length,
      monthLabel: `${year}년 ${month}월`,
    });
  }, [data, year, month]);

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중…</div>;
  if (error) return <div className="empty-state"><div className="msg">{error}</div></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">HR 대시보드</h1>
          <div className="page-desc">{year}년 {month}월 · 인원·근태·급여·휴가 현황</div>
        </div>
      </div>

      {/* AI HR 분석 패널 */}
      <AIAnalysisPanel {...aiPrompt} title="AI HR 분석" buttonLabel="AI HR 분석" />

      {/* 핵심 지표 */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">재직 인원</div>
          <div className="stat-value">{data.active.length}명</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>퇴사 {data.resigned.length}명 포함</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">이번달 급여 합계</div>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>
            {data.payrollCount > 0 ? fmtWon(data.totalGross) : '-'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {data.payrollCount > 0 ? `실지급 ${fmtWon(data.totalNet)} · ${data.payrollCount}명` : '급여 확정 전'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">이번달 결근</div>
          <div className="stat-value" style={{ color: data.absentCount > 0 ? 'var(--danger)' : undefined }}>
            {data.absentCount}건
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            지각 {data.lateCount} · 조퇴 {data.earlyLeaveCount}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">휴가 승인 대기</div>
          <div className="stat-value" style={{ color: data.pendingLeaves.length > 0 ? 'var(--warning)' : undefined }}>
            {data.pendingLeaves.length}건
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>즉시 처리 필요</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* 부서별 인원 */}
        <div className="card">
          <div className="card-title">부서별 인원</div>
          {data.depts.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}><div className="msg">부서 정보 없음</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.depts.map(([dept, cnt], i) => (
                <div key={dept}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 500 }}>{dept}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{cnt}명 ({Math.round(cnt / data.active.length * 100)}%)</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--border)', borderRadius: 4 }}>
                    <div style={{
                      height: '100%',
                      width: Math.round(cnt / data.active.length * 100) + '%',
                      background: DEPT_COLORS[i % DEPT_COLORS.length],
                      borderRadius: 4,
                      transition: 'width 0.4s',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 고용형태 + 최근 입사 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ flex: 1 }}>
            <div className="card-title">고용형태 현황</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(data.typeMap).map(([type, cnt]) => (
                <div key={type} style={{
                  padding: '8px 16px', borderRadius: 20,
                  background: 'var(--bg-subtle)', fontSize: 13, fontWeight: 500,
                }}>
                  {type} <strong>{cnt}명</strong>
                </div>
              ))}
              {Object.keys(data.typeMap).length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>데이터 없음</div>
              )}
            </div>
          </div>

          {data.payrollCount > 0 && (
            <div className="card" style={{ flex: 1 }}>
              <div className="card-title">이번달 급여 상세</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['총 지급액 (세전)', fmtWonFull(data.totalGross)],
                  ['실지급액 (세후)', fmtWonFull(data.totalNet)],
                  ['1인 평균', fmtWonFull(data.totalNet / data.payrollCount)],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 휴가 승인 대기 */}
      {data.pendingLeaves.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ color: 'var(--warning)' }}>휴가 승인 대기 {data.pendingLeaves.length}건</div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr><th>직원 ID</th><th>유형</th><th>기간</th><th className="text-right">일수</th><th>사유</th></tr>
              </thead>
              <tbody>
                {data.pendingLeaves.slice(0, 5).map(l => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12 }}>{l.employeeId?.slice(0, 8)}…</td>
                    <td><span className="badge badge-info">{l.leaveType}</span></td>
                    <td style={{ fontSize: 12 }}>{l.startDate} ~ {l.endDate}</td>
                    <td className="text-right">{l.days}일</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 재직자 요약 */}
      <div className="card">
        <div className="card-title">재직자 목록 (상위 {Math.min(15, data.active.length)}명)</div>
        {data.active.length === 0 ? (
          <div className="empty-state"><div className="msg">등록된 직원이 없습니다</div></div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>사번</th><th>이름</th><th>부서</th><th>직급</th>
                  <th>고용형태</th><th>입사일</th><th className="text-right">기본급</th>
                </tr>
              </thead>
              <tbody>
                {data.active.slice(0, 15).map(e => (
                  <tr key={e.id || e.empNo}>
                    <td><strong>{e.empNo || ''}</strong></td>
                    <td>{e.name || ''}</td>
                    <td>{e.dept || '-'}</td>
                    <td>{e.position || '-'}</td>
                    <td><span className="badge badge-info">{e.employmentType || '정규직'}</span></td>
                    <td style={{ fontSize: 12 }}>{e.hireDate || '-'}</td>
                    <td className="text-right">
                      {e.baseSalary ? '₩' + (e.baseSalary).toLocaleString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
