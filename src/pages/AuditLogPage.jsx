/**
 * AuditLogPage.jsx - 감사 추적
 */
import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';

const ACTION_ICONS = {
  '입고': '📥', '출고': '📤', '삭제': '🗑️', '수정': '✏️', '등록': '➕',
  '재고조정': '⚖️', '이동': '🔄', '발주': '📋', '백업': '💾', '복원': '♻️',
  '설정변경': '⚙️', '거래처등록': '🏢', '거래처삭제': '🏚️',
};

function getActionIcon(action) {
  return ACTION_ICONS[action] || '📌';
}

function formatDetail(detail) {
  if (!detail || Object.keys(detail).length === 0) return '';
  const parts = [];
  if (detail.quantity) parts.push(`수량: ${detail.quantity}`);
  if (detail.before !== undefined && detail.after !== undefined) {
    parts.push(`${detail.before} → ${detail.after}`);
  }
  if (detail.note) parts.push(detail.note);
  return parts.join(' | ');
}

export default function AuditLogPage() {
  const [rawLogs] = useStore(s => s.auditLogs || []);
  const [keyword, setKeyword] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');

  // 최신순 정렬
  const logs = useMemo(() => [...rawLogs].reverse(), [rawLogs]);

  // 행위 목록 (필터 드롭다운용)
  const actions = useMemo(() => [...new Set(logs.map(l => l.action))], [logs]);

  // 필터 적용
  const filtered = useMemo(() => {
    let result = logs;

    if (keyword) {
      const kw = keyword.toLowerCase();
      result = result.filter(l =>
        (l.target || '').toLowerCase().includes(kw) ||
        (l.action || '').toLowerCase().includes(kw)
      );
    }

    if (actionFilter) {
      result = result.filter(l => l.action === actionFilter);
    }

    if (periodFilter) {
      const cutoff = new Date();
      if (periodFilter === 'today') cutoff.setHours(0, 0, 0, 0);
      else if (periodFilter === 'week') cutoff.setDate(cutoff.getDate() - 7);
      else if (periodFilter === 'month') cutoff.setDate(cutoff.getDate() - 30);
      result = result.filter(l => new Date(l.timestamp) >= cutoff);
    }

    return result;
  }, [logs, keyword, actionFilter, periodFilter]);

  // 날짜별 그룹핑
  const groups = useMemo(() => {
    const g = {};
    filtered.forEach(l => {
      const date = l.timestamp.split('T')[0];
      if (!g[date]) g[date] = [];
      g[date].push(l);
    });
    return Object.entries(g);
  }, [filtered]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">감사 추적</h1>
          <div className="page-desc">모든 데이터 변경 이력을 기록합니다. 세무·감사 대비 필수 기능.</div>
        </div>
        <div className="page-actions">
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>총 {logs.length}건</span>
        </div>
      </div>

      {/* 필터 */}
      <div className="card card-compact" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <input
              className="form-input"
              placeholder="🔍 대상, 행위 검색..."
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
          </div>
          <select className="form-select" style={{ width: 'auto' }} value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
            <option value="">전체 행위</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="form-select" style={{ width: 'auto' }} value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}>
            <option value="">전체 기간</option>
            <option value="today">오늘</option>
            <option value="week">최근 7일</option>
            <option value="month">최근 30일</option>
          </select>
        </div>
      </div>

      {/* 로그 목록 */}
      <div className="card card-flush">
        {groups.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>기록이 없습니다</div>
        ) : (
          groups.map(([date, items]) => (
            <div key={date}>
              {/* 날짜 헤더 */}
              <div style={{ padding: '8px 16px', background: 'var(--bg-main)', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-light)' }}>
                📅 {date} ({items.length}건)
              </div>
              {/* 로그 항목 */}
              {items.slice(0, 50).map(l => {
                const time = new Date(l.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const icon = getActionIcon(l.action);
                const detailStr = formatDetail(l.detail);
                return (
                  <div key={l.id} style={{ display: 'flex', gap: '10px', padding: '8px 16px', borderBottom: '1px solid var(--border-light)', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '2px' }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px' }}>
                        <span className="badge badge-default" style={{ fontSize: '10px' }}>{l.action}</span>
                        <strong style={{ marginLeft: '4px' }}>{l.target}</strong>
                      </div>
                      {detailStr && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{detailStr}</div>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>
                      {time}<br />{l.user || ''}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
