/**
 * StocktakePage.jsx - 재고 실사
 */
import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';
import { canAction } from '../auth.js';
import { recalcItemAmounts } from '../store.js';

function toNum(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }

function getGroupKey(item) {
  const code = String(item?.itemCode || '').trim();
  if (code) return `code:${code.toLowerCase()}`;
  return `name:${String(item?.itemName || '').trim().toLowerCase() || '-'}`;
}

export default function StocktakePage() {
  const [state, setState] = useStore();
  const items = state.mappedData || [];
  const stocktakeHistory = state.stocktakeHistory || [];

  const today = new Date().toISOString().split('T')[0];
  const [stDate, setStDate] = useState(today);
  const [inspector, setInspector] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [actualCounts, setActualCounts] = useState({});   // { [itemIdx]: string }
  const [noteCounts, setNoteCounts] = useState({});        // { [itemIdx]: string }
  const [expandedGroups, setExpandedGroups] = useState(() => {
    // 중복 그룹은 기본 펼침
    const s = new Set();
    const map = new Map();
    items.forEach((item, idx) => {
      const k = getGroupKey(item);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(idx);
    });
    map.forEach((indices, k) => { if (indices.length > 1) s.add(k); });
    return s;
  });

  const canAdjust = canAction('stocktake:adjust');

  const warehouseOptions = useMemo(
    () => [...new Set(items.map(i => String(i.warehouse || '').trim()).filter(Boolean))],
    [items]
  );

  // 그룹 목록 계산
  const groups = useMemo(() => {
    const order = [];
    const map = new Map();
    items.forEach((item, idx) => {
      const k = getGroupKey(item);
      if (!map.has(k)) { map.set(k, []); order.push(k); }
      map.get(k).push(idx);
    });
    return order.map(k => ({ key: k, indices: map.get(k) }));
  }, [items]);

  const toggleGroup = (key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  function getDiffMeta(idx) {
    const raw = actualCounts[idx];
    if (raw === undefined || String(raw).trim() === '') return null;
    const actual = parseFloat(raw);
    if (!isFinite(actual)) return null;
    const sys = toNum(items[idx]?.quantity);
    const diff = actual - sys;
    if (diff === 0) return { diff, badge: <span className="badge badge-success">일치</span>, color: 'var(--success)' };
    if (diff > 0) return { diff, badge: <span className="badge badge-info">과잉</span>, color: 'var(--accent)' };
    return { diff, badge: <span className="badge badge-danger">부족</span>, color: 'var(--danger)' };
  }

  // 요약 통계
  const summary = useMemo(() => {
    let checked = 0, match = 0, over = 0, under = 0;
    Object.entries(actualCounts).forEach(([idxStr, raw]) => {
      if (String(raw).trim() === '') return;
      const idx = parseInt(idxStr);
      if (warehouseFilter && String(items[idx]?.warehouse || '') !== warehouseFilter) return;
      const actual = parseFloat(raw);
      if (!isFinite(actual)) return;
      checked++;
      const diff = actual - toNum(items[idx]?.quantity);
      if (diff === 0) match++;
      else if (diff > 0) over++;
      else under++;
    });
    return { checked, match, over, under };
  }, [actualCounts, items, warehouseFilter]);

  const handleExport = () => {
    const rows = items.map((item, idx) => {
      const sys = toNum(item.quantity);
      const raw = actualCounts[idx];
      const actual = (raw !== undefined && String(raw).trim() !== '') ? parseFloat(raw) : '';
      const diff = isFinite(actual) && actual !== '' ? actual - sys : '';
      return { 품목명: item.itemName || '', 코드: item.itemCode || '', 창고: item.warehouse || '', 시스템재고: sys, 실사재고: actual, 차이: diff, 비고: noteCounts[idx] || '' };
    });
    downloadExcel(rows, `재고실사_${stDate}`);
    showToast('실사표를 내보냈습니다.', 'success');
  };

  const handleAdjust = () => {
    if (!canAdjust) { showToast('재고 조정 권한이 없습니다. 매니저 이상만 가능합니다.', 'warning'); return; }
    const updatedItems = [...items];
    let adjustCount = 0;
    items.forEach((item, idx) => {
      const raw = actualCounts[idx];
      if (raw === undefined || String(raw).trim() === '') return;
      const actual = parseFloat(raw);
      if (!isFinite(actual)) return;
      if (actual === toNum(item.quantity)) return;
      const adjusted = { ...updatedItems[idx], quantity: actual };
      recalcItemAmounts(adjusted);
      updatedItems[idx] = adjusted;
      adjustCount++;
    });
    if (adjustCount === 0) { showToast('조정할 차이가 없습니다.', 'info'); return; }
    if (!confirm(`${adjustCount}건의 재고를 실사 수량으로 조정하시겠습니까?`)) return;
    const record = { date: stDate, inspector, adjustCount, totalItems: items.length };
    setState({ mappedData: updatedItems, stocktakeHistory: [...stocktakeHistory, record] });
    setActualCounts({});
    setNoteCounts({});
    showToast(`${adjustCount}건 재고 조정 완료`, 'success');
  };

  const showHistory = () => {
    if (stocktakeHistory.length === 0) { showToast('이전 실사 기록이 없습니다.', 'info'); return; }
    const text = stocktakeHistory.map(r => `${r.date} - 담당: ${r.inspector || '-'} / 조정 ${r.adjustCount}건 / 총 ${r.totalItems}품목`).join('\n');
    alert(`실사 이력\n\n${text}`);
  };

  let rowNo = 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📋 재고 실사</h1>
          <div className="page-desc">실제 재고와 시스템 재고를 비교하고 차이를 조정합니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={showHistory}>📅 실사 이력 ({stocktakeHistory.length}건)</button>
          <button className="btn btn-primary" onClick={() => { setActualCounts({}); setNoteCounts({}); }}>🆕 새 실사 시작</button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon">📦</div>
            <div className="msg">등록된 품목이 없습니다</div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-title">📋 재고 실사표</div>

          {/* 헤더 필터 */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">실사일자</label>
              <input className="form-input" type="date" value={stDate} onChange={e => setStDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">실사자</label>
              <input className="form-input" placeholder="실사 담당자" value={inspector} onChange={e => setInspector(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0, flex: 1 }}>
              <label className="form-label">창고 필터</label>
              <select className="form-select" value={warehouseFilter} onChange={e => setWarehouseFilter(e.target.value)}>
                <option value="">전체 창고</option>
                {warehouseOptions.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>

          {/* 테이블 */}
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>품목명</th>
                  <th>코드</th>
                  <th>창고</th>
                  <th className="text-right">시스템 재고</th>
                  <th className="text-right">실사 재고</th>
                  <th className="text-right">차이</th>
                  <th>상태</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(({ key, indices }) => {
                  const visible = indices.filter(idx => !warehouseFilter || String(items[idx]?.warehouse || '') === warehouseFilter);
                  if (visible.length === 0) return null;

                  const isMulti = indices.length > 1;
                  const isExpanded = expandedGroups.has(key);
                  const rows = [];

                  if (isMulti) {
                    const first = items[indices[0]] || {};
                    rows.push(
                      <tr key={`g-${key}`} style={{ background: 'var(--bg-lighter)', borderLeft: '3px solid var(--accent)', cursor: 'pointer' }} onClick={() => toggleGroup(key)}>
                        <td style={{ textAlign: 'center' }}>{rowNo++}</td>
                        <td colSpan={8}>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }}>
                            {isExpanded ? '▼' : '▶'} {first.itemName || '-'} {first.itemCode ? `(${first.itemCode})` : ''} — 중복 {indices.length}건
                          </button>
                        </td>
                      </tr>
                    );
                    if (!isExpanded) return rows;
                  }

                  visible.forEach(idx => {
                    const item = items[idx] || {};
                    const sys = toNum(item.quantity);
                    const meta = getDiffMeta(idx);
                    const diffText = meta ? (meta.diff > 0 ? `+${meta.diff}` : String(meta.diff)) : '-';
                    rows.push(
                      <tr key={`r-${idx}`} data-idx={idx}>
                        <td className="col-num">{rowNo++}</td>
                        <td><strong>{item.itemName || '-'}</strong></td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{item.itemCode || '-'}</td>
                        <td style={{ fontSize: '12px' }}>{item.warehouse || '-'}</td>
                        <td className="text-right">{sys.toLocaleString('ko-KR')}</td>
                        <td className="text-right">
                          <input
                            type="number"
                            className="form-input"
                            value={actualCounts[idx] ?? ''}
                            placeholder={String(sys)}
                            onChange={e => setActualCounts(prev => ({ ...prev, [idx]: e.target.value }))}
                            style={{ width: '80px', padding: '3px 6px', textAlign: 'right', fontWeight: 600 }}
                          />
                        </td>
                        <td className="text-right" style={{ fontWeight: 600, color: meta?.color }}>
                          {diffText}
                        </td>
                        <td>{meta ? meta.badge : '-'}</td>
                        <td>
                          <input
                            className="form-input"
                            value={noteCounts[idx] ?? ''}
                            placeholder="메모"
                            onChange={e => setNoteCounts(prev => ({ ...prev, [idx]: e.target.value }))}
                            style={{ width: '100px', padding: '3px 6px', fontSize: '11px' }}
                          />
                        </td>
                      </tr>
                    );
                  });
                  return rows;
                })}
              </tbody>
            </table>
          </div>

          {/* 요약 */}
          {summary.checked > 0 && (
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: '16px' }}>
              <div className="stat-card"><div className="stat-label">검수 품목</div><div className="stat-value">{summary.checked}</div></div>
              <div className="stat-card"><div className="stat-label">일치</div><div className="stat-value text-success">{summary.match}</div></div>
              <div className="stat-card"><div className="stat-label">과잉</div><div className="stat-value text-accent">{summary.over}</div></div>
              <div className="stat-card"><div className="stat-label">부족</div><div className="stat-value text-danger">{summary.under}</div></div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button className="btn btn-outline" onClick={handleExport}>📊 실사표 내보내기</button>
            <button
              className="btn btn-danger"
              onClick={handleAdjust}
              disabled={!canAdjust}
              title={!canAdjust ? '매니저 이상만 재고 조정이 가능합니다.' : undefined}
              style={!canAdjust ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
            >
              ⚖️ 재고 조정 반영
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
