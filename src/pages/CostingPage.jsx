/**
 * CostingPage.jsx - 원가 분석 (총평균법 / FIFO / 최종매입원가법)
 */
import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';
import { getSalePrice } from '../price-utils.js';

const TEXT_COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

const SORT_FIELDS = [
  { key: 'itemName',   label: '품목명' },
  { key: 'itemCode',   label: '코드' },
  { key: 'qty',        label: '재고수량',   numeric: true, align: 'text-right' },
  { key: 'unitCost',   label: '단위원가',   numeric: true, align: 'text-right' },
  { key: 'totalCost',  label: '총 원가',    numeric: true, align: 'text-right' },
  { key: 'sellPrice',  label: '판매단가',   numeric: true, align: 'text-right' },
  { key: 'marketValue',label: '시가환산',   numeric: true, align: 'text-right' },
  { key: 'profit',     label: '예상이익',   numeric: true, align: 'text-right' },
  { key: 'marginRate', label: '매출이익률', numeric: true, align: 'text-right' },
];

const fmtMoney = v => v ? `₩${Math.round(v).toLocaleString('ko-KR')}` : '-';
const fmtSigned = v => !v ? '-' : `${v < 0 ? '-₩' : '₩'}${Math.abs(Math.round(v)).toLocaleString('ko-KR')}`;
const getMarginRate = row => row.marketValue ? Number((((row.profit || 0) / row.marketValue) * 100).toFixed(1)) : null;

function calculateCosts(items, transactions, method) {
  return items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const itemUnitPrice = parseFloat(item.unitPrice) || 0;
    const inTx = transactions
      .filter(tx => tx.type === 'in' && tx.itemName === item.itemName)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // 원가법별 unitCost 계산 (판매가 fallback에도 사용)
    let unitCost = itemUnitPrice;
    if (method === 'fifo' && inTx.length > 0) unitCost = parseFloat(inTx[0].unitPrice) || itemUnitPrice;
    else if (method === 'latest' && inTx.length > 0) unitCost = parseFloat(inTx[inTx.length - 1].unitPrice) || itemUnitPrice;
    else if (method === 'weighted-avg' && inTx.length > 0) {
      let tq = 0, tv = 0;
      inTx.forEach(tx => { const q = parseFloat(tx.quantity) || 0; tq += q; tv += q * (parseFloat(tx.unitPrice) || itemUnitPrice); });
      unitCost = tq > 0 ? Math.round(tv / tq) : itemUnitPrice;
    }
    unitCost = Math.round(unitCost);

    // 판매가: item.salePrice → getSalePrice 폴백(20% 마크업) → unitCost 순 fallback
    // item.unitPrice가 없어도 unitCost(트랜잭션 기반)를 최종 fallback으로 사용
    const sellPrice = getSalePrice(item) || unitCost;

    const totalCost = Math.round(qty * unitCost);
    const marketValue = Math.round(qty * sellPrice);
    return { itemName: item.itemName, itemCode: item.itemCode || '', qty, unitCost, totalCost, sellPrice: Math.round(sellPrice), marketValue, profit: marketValue - totalCost };
  });
}

function sortRows(rows, sort) {
  return [...rows].sort((a, b) => {
    const av = sort.key === 'marginRate' ? getMarginRate(a) : (SORT_FIELDS.find(f => f.key === sort.key)?.numeric ? Number(a[sort.key]) : a[sort.key]);
    const bv = sort.key === 'marginRate' ? getMarginRate(b) : (SORT_FIELDS.find(f => f.key === sort.key)?.numeric ? Number(b[sort.key]) : b[sort.key]);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const r = typeof av === 'number' && typeof bv === 'number' ? av - bv : TEXT_COLLATOR.compare(String(av), String(bv));
    return sort.direction === 'desc' ? -r : r;
  });
}

export default function CostingPage() {
  const [state, setState] = useStore();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const costMethod = state.costMethod || 'weighted-avg';

  const [sort, setSort] = useState({ key: 'totalCost', direction: 'desc' });
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const costData = useMemo(() => calculateCosts(items, transactions, costMethod), [items, transactions, costMethod]);
  const sortedData = useMemo(() => sortRows(costData, sort), [costData, sort]);

  const totalCost   = useMemo(() => costData.reduce((s, r) => s + r.totalCost, 0), [costData]);
  const totalMarket = useMemo(() => costData.reduce((s, r) => s + r.marketValue, 0), [costData]);
  const totalProfit = totalMarket - totalCost;
  const avgMargin   = totalMarket > 0 ? ((totalProfit / totalMarket) * 100).toFixed(1) : null;

  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : 'asc') : (SORT_FIELDS.find(f => f.key === key)?.numeric ? 'desc' : 'asc'),
    }));
  };

  const toggleGroup = (key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleExport = () => {
    if (!sortedData.length) { showToast('데이터가 없습니다.', 'warning'); return; }
    downloadExcel(sortedData.map(row => ({
      '품목명': row.itemName, '코드': row.itemCode || '', '재고수량': row.qty,
      '단위원가': row.unitCost, '총원가': row.totalCost, '판매단가': row.sellPrice,
      '시가환산': row.marketValue, '예상이익': row.profit,
      '마진율(%)': getMarginRate(row) ?? '',
    })), `원가분석_${new Date().toISOString().split('T')[0]}`);
    showToast('원가표를 내보냈습니다.', 'success');
  };

  // 그룹화
  const groups = useMemo(() => {
    const order = [];
    const map = new Map();
    sortedData.forEach(row => {
      const key = row.itemCode ? String(row.itemCode).trim() : String(row.itemName || '').trim();
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key).push(row);
    });
    return order.map(k => ({ key: k, rows: map.get(k) }));
  }, [sortedData]);

  let rowNum = 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 원가 분석</h1>
          <div className="page-desc">매입 원가와 예상 마진을 한눈에 정리합니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={handleExport}> 원가표 내보내기</button>
        </div>
      </div>

      {/* 원가 계산 방식 */}
      <div className="card card-compact" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="form-label" style={{ margin: 0, fontWeight: 600 }}>원가 계산 방식:</label>
          {[
            { value: 'weighted-avg', label: '총평균법(가중평균)', sub: '(권장)' },
            { value: 'fifo',         label: '선입선출법 (FIFO)' },
            { value: 'latest',       label: '최종매입원가법' },
          ].map(opt => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="radio" name="cost-method" value={opt.value} checked={costMethod === opt.value} onChange={() => setState({ costMethod: opt.value })} />
              {opt.label} {opt.sub && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{opt.sub}</span>}
            </label>
          ))}
        </div>
      </div>

      {/* KPI */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card"><div className="stat-label">총 매입원가</div><div className="stat-value">{fmtMoney(totalCost)}</div></div>
        <div className="stat-card"><div className="stat-label">시가 환산액</div><div className="stat-value">{fmtMoney(totalMarket)}</div></div>
        <div className="stat-card"><div className="stat-label">예상 마진</div><div className={`stat-value ${totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>{fmtSigned(totalProfit)}</div></div>
        <div className="stat-card"><div className="stat-label">평균 매출이익률</div><div className="stat-value text-accent">{avgMargin !== null ? `${avgMargin}%` : '-'}</div></div>
      </div>

      {/* 테이블 */}
      <div className="card card-flush">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <strong> 품목별 원가 분석</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>({sortedData.length}개 품목)</span>
        </div>
        <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                {SORT_FIELDS.map(field => (
                  <th key={field.key} className={`sortable-col${field.align ? ' ' + field.align : ''}${field.key === 'itemName' ? ' col-fill' : ''}`}>
                    <button
                      type="button"
                      className={`table-sort-btn${sort.key === field.key ? ' active' : ''}`}
                      onClick={() => handleSort(field.key)}
                    >
                      <span>{field.label}</span>
                      <span className="table-sort-arrow">{sort.key === field.key ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(({ key, rows: groupRows }) => {
                if (groupRows.length === 1) {
                  const row = groupRows[0];
                  const mr = getMarginRate(row);
                  const rowClass = mr !== null && mr < 0 ? 'row-danger' : mr !== null && mr < 10 ? 'row-warning' : '';
                  return (
                    <tr key={key} className={rowClass}>
                      <td className="col-num">{rowNum++}</td>
                      <td className="col-fill"><strong>{row.itemName}</strong></td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{row.itemCode || '-'}</td>
                      <td className="text-right">{row.qty.toLocaleString('ko-KR')}</td>
                      <td className="text-right">{fmtMoney(row.unitCost)}</td>
                      <td className="text-right">{fmtMoney(row.totalCost)}</td>
                      <td className="text-right">{fmtMoney(row.sellPrice)}</td>
                      <td className="text-right">{fmtMoney(row.marketValue)}</td>
                      <td className={`text-right ${row.profit >= 0 ? 'type-in' : 'type-out'}`}>{fmtSigned(row.profit)}</td>
                      <td className="text-right" style={{ fontWeight: 600 }}>{mr !== null ? `${mr.toFixed(1)}%` : '-'}</td>
                    </tr>
                  );
                }

                const isExpanded = expandedGroups.has(key);
                const totalQty  = groupRows.reduce((s, r) => s + r.qty, 0);
                const totalCostSum = groupRows.reduce((s, r) => s + r.totalCost, 0);
                return (
                  <React.Fragment key={key}>
                    <tr style={{ cursor: 'pointer', background: 'var(--bg-card)', borderLeft: '3px solid var(--accent)' }} onClick={() => toggleGroup(key)}>
                      <td className="col-num">{rowNum++}</td>
                      <td colSpan={9} style={{ paddingLeft: '8px' }}>
                        <span style={{ marginRight: '6px', fontSize: '12px' }}>{isExpanded ? '▼' : '▶'}</span>
                        <strong>{groupRows[0].itemName}</strong>
                        {groupRows[0].itemCode && <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '6px' }}>{groupRows[0].itemCode}</span>}
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                          {groupRows.length}항목 · 총 {totalQty.toLocaleString('ko-KR')}개 · ₩{Math.round(totalCostSum).toLocaleString('ko-KR')}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && groupRows.map((row, ri) => {
                      const mr = getMarginRate(row);
                      const rowClass = mr !== null && mr < 0 ? 'row-danger' : mr !== null && mr < 10 ? 'row-warning' : '';
                      return (
                        <tr key={ri} className={rowClass} style={{ background: 'var(--bg-lighter)' }}>
                          <td className="col-num">{rowNum++}</td>
                          <td className="col-fill" style={{ paddingLeft: '24px' }}><strong>{row.itemName}</strong></td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{row.itemCode || '-'}</td>
                          <td className="text-right">{row.qty.toLocaleString('ko-KR')}</td>
                          <td className="text-right">{fmtMoney(row.unitCost)}</td>
                          <td className="text-right">{fmtMoney(row.totalCost)}</td>
                          <td className="text-right">{fmtMoney(row.sellPrice)}</td>
                          <td className="text-right">{fmtMoney(row.marketValue)}</td>
                          <td className={`text-right ${row.profit >= 0 ? 'type-in' : 'type-out'}`}>{fmtSigned(row.profit)}</td>
                          <td className="text-right" style={{ fontWeight: 600 }}>{mr !== null ? `${mr.toFixed(1)}%` : '-'}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="chart-help-text">표 제목을 누르면 큰 값 순서나 가나다순으로 바로 정렬됩니다.</div>
    </div>
  );
}
