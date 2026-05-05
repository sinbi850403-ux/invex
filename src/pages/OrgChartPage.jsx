import React, { useState, useEffect, useMemo } from 'react';
import { employees as employeesDb } from '../db.js';
import { showToast } from '../toast.js';

function buildTree(employees) {
  const deptMap = {};
  employees.forEach(e => {
    const dept = e.dept || '미배정';
    if (!deptMap[dept]) deptMap[dept] = [];
    deptMap[dept].push(e);
  });
  return deptMap;
}

const STATUS_BADGE = {
  resigned: { label: '퇴사', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  leave:    { label: '휴직', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
};

const AVATAR_COLORS = [
  ['#6366f1','#818cf8'], ['#3b82f6','#60a5fa'], ['#10b981','#34d399'],
  ['#f59e0b','#fbbf24'], ['#ef4444','#f87171'], ['#8b5cf6','#a78bfa'],
  ['#ec4899','#f472b6'], ['#14b8a6','#2dd4bf'],
];

function getAvatarColor(name) {
  let hash = 0;
  for (const c of (name || '')) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Avatar({ name, size = 38 }) {
  const [from, to] = getAvatarColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, ${from}, ${to})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.42,
    }}>
      {(name || '?')[0]}
    </div>
  );
}

function EmployeeCard({ emp, isManager }) {
  const badge = STATUS_BADGE[emp.status];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px',
      borderRadius: 10,
      border: `1px solid ${isManager ? 'var(--accent)' : 'var(--border)'}`,
      background: isManager ? 'rgba(59,130,246,0.06)' : 'var(--bg-secondary)',
      minWidth: 200, maxWidth: 260,
      position: 'relative',
    }}>
      <Avatar name={emp.name} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{emp.name || '-'}</span>
          {isManager && (
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 4,
              background: 'rgba(59,130,246,0.15)', color: 'var(--accent)', fontWeight: 700,
            }}>팀장</span>
          )}
          {badge && (
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 4,
              background: badge.bg, color: badge.color, fontWeight: 700,
            }}>{badge.label}</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
          {emp.position || '직급 미지정'}
          {emp.empNo && <span style={{ marginLeft: 6, opacity: 0.6 }}>#{emp.empNo}</span>}
        </div>
      </div>
    </div>
  );
}

const DEPT_COLORS = [
  '#3b82f6','#6366f1','#10b981','#f59e0b',
  '#ef4444','#8b5cf6','#ec4899','#14b8a6',
];

function DeptGroup({ dept, members, expanded, onToggle, colorIdx }) {
  const color = DEPT_COLORS[colorIdx % DEPT_COLORS.length];
  const manager = members.find(m =>
    m.position && ['팀장','부장','과장','실장','이사','CEO','대표','CTO','COO'].some(t => m.position.includes(t))
  );
  const others = members.filter(m => m !== manager);

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      border: '1px solid var(--border)',
      marginBottom: 12,
    }}>
      {/* 부서 헤더 */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          background: 'var(--bg-secondary)',
          borderLeft: `4px solid ${color}`,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: `${color}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, color,
        }}>
          {dept[0]}
        </div>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', flex: 1 }}>{dept}</span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 20,
          background: `${color}18`, color, fontWeight: 600,
        }}>{members.length}명</span>
        <span style={{ fontSize: 16, color: 'var(--text-muted)', marginLeft: 4 }}>
          {expanded ? '−' : '+'}
        </span>
      </div>

      {/* 멤버 목록 */}
      {expanded && (
        <div style={{ padding: '16px', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {manager && <EmployeeCard key={manager.id} emp={manager} isManager />}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {others.map(emp => <EmployeeCard key={emp.id} emp={emp} isManager={false} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [expandedDepts, setExpandedDepts] = useState({});   // undefined = 펼침(기본), false = 접힘

  useEffect(() => {
    employeesDb.list()
      .then(data => { setEmployees(data); setLoading(false); })
      .catch(e => { showToast('직원 목록 로드 실패: ' + e.message, 'error'); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'active')   return employees.filter(e => e.status !== 'resigned');
    if (statusFilter === 'resigned') return employees.filter(e => e.status === 'resigned');
    return employees;
  }, [employees, statusFilter]);

  const deptMap = useMemo(() => buildTree(filtered), [filtered]);
  const depts   = Object.keys(deptMap).sort();

  // ── 기본: undefined(= 펼침), 접힘: false, 펼침: true ──────
  const isDeptExpanded = dept => expandedDepts[dept] !== false;

  function toggleDept(dept) {
    setExpandedDepts(prev => ({ ...prev, [dept]: !isDeptExpanded(dept) }));
  }

  function expandAll() {
    const all = {};
    depts.forEach(d => { all[d] = true; });
    setExpandedDepts(all);
  }

  function collapseAll() {
    const all = {};
    depts.forEach(d => { all[d] = false; });   // ← 명시적으로 false 설정
    setExpandedDepts(all);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">조직도</h1>
          <div className="page-desc">부서별 인원 구성을 시각적으로 확인합니다</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={expandAll}>전체 펼치기</button>
          <button className="btn btn-outline" onClick={collapseAll}>전체 접기</button>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', marginRight: 4 }}>재직 상태</span>
          {[
            { value: 'active',   label: '재직중' },
            { value: 'all',      label: '전체' },
            { value: 'resigned', label: '퇴사' },
          ].map(opt => (
            <button
              key={opt.value}
              className={`btn ${statusFilter === opt.value ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            총 {filtered.length}명 · {depts.length}개 부서
          </span>
        </div>
      </div>

      {/* 본문 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="msg">등록된 직원이 없습니다</div>
          <div className="sub">직원 관리 페이지에서 직원을 추가해 주세요</div>
        </div>
      ) : (
        <div>
          {depts.map((dept, idx) => (
            <DeptGroup
              key={dept}
              dept={dept}
              members={deptMap[dept]}
              expanded={isDeptExpanded(dept)}
              onToggle={() => toggleDept(dept)}
              colorIdx={idx}
            />
          ))}
        </div>
      )}
    </div>
  );
}
