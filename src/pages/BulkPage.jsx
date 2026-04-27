/**
 * BulkPage.jsx - 일괄 입출고 & 자동 발주 추천
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { addTransaction, addTransactionsBulk, setState as storeSetState } from '../store.js';
import { openPurchaseOrderDraft } from '../purchase-order-draft.js';
import { useNavigate } from 'react-router-dom';

function calcReorderRecommendations(items, transactions, safetyStock) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

  const outMap = {};
  transactions
    .filter(tx => tx.type === 'out' && tx.date >= cutoff)
    .forEach(tx => { outMap[tx.itemName] = (outMap[tx.itemName] || 0) + (parseFloat(tx.quantity) || 0); });

  const results = [];
  items.forEach(item => {
    const currentQty = parseFloat(item.quantity) || 0;
    const totalOut = outMap[item.itemName] || 0;
    const avgDailyOut = totalOut / 30;
    const daysLeft = avgDailyOut > 0 ? Math.floor(currentQty / avgDailyOut) : 999;
    const safetyQty = safetyStock[item.itemName] || 0;
    const needReorder = daysLeft <= 14 || (safetyQty > 0 && currentQty < safetyQty);
    if (!needReorder) return;
    const recommendedQty = Math.max(1, Math.ceil(avgDailyOut * 30 + safetyQty - currentQty));
    results.push({ itemName: item.itemName, itemCode: item.itemCode || '', currentQty, safetyQty, avgDailyOut, daysLeft: Math.max(0, daysLeft), recommendedQty });
  });
  return results.sort((a, b) => a.daysLeft - b.daysLeft);
}

const EMPTY_ROW = () => ({ itemIdx: '', qty: '1', note: '' });

export default function BulkPage() {
  const [state] = useStore();
  const navigate = useNavigate();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const safetyStock = state.safetyStock || {};

  const [activeTab, setActiveTab] = useState('bulk');
  const [bulkType, setBulkType] = useState('in');
  const [rows, setRows] = useState([EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()]);

  const reorderItems = useMemo(
    () => calcReorderRecommendations(items, transactions, safetyStock),
    [items, transactions, safetyStock]
  );

  const addRow = () => setRows(prev => [...prev, EMPTY_ROW()]);
  const removeRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, field, value) => setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));

  const handleExecute = () => {
    const today = new Date().toISOString().split('T')[0];
    const txBatch = [];

    rows.forEach(row => {
      const itemIdx = parseInt(row.itemIdx);
      if (isNaN(itemIdx)) return;
      const item = items[itemIdx];
      if (!item) return;
      const qty = parseInt(row.qty) || 0;
      if (qty <= 0) return;

      if (bulkType === 'out') {
        const currentQty = parseFloat(item.quantity) || 0;
        if (qty > currentQty) {
          showToast(`${item.itemName}: 재고 부족 (${currentQty})`, 'error');
          return;
        }
      }

      txBatch.push({
        type: bulkType,
        itemName: item.itemName,
        itemCode: item.itemCode || '',
        quantity: qty,
        unitPrice: parseFloat(item.unitPrice) || 0,
        date: today,
        note: (row.note || '') + ' [일괄]',
      });
    });

    if (txBatch.length === 0) { showToast('처리할 품목이 없습니다.', 'warning'); return; }

    addTransactionsBulk(txBatch);
    showToast(`${bulkType === 'in' ? '입고' : '출고'} ${txBatch.length}건 일괄 처리 완료`, 'success');
    setRows([EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()]);
  };

  const handleReorderAll = () => {
    const ok = openPurchaseOrderDraft({
      setState: storeSetState,
      navigateTo: (id) => navigate('/' + id),
      source: 'bulk-reorder',
      items: reorderItems,
      note: '일괄 처리의 자동 발주 추천 품목입니다.',
    });
    if (!ok) { showToast('발주서로 넘길 추천 품목이 없습니다.', 'warning'); return; }
    showToast(`${reorderItems.length}개 추천 품목을 발주서 초안에 담았습니다.`, 'success');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🔁 일괄 처리 & 자동 발주</h1>
          <div className="page-desc">여러 품목을 한번에 입고/출고하고, 발주 시점을 자동 추천받습니다.</div>
        </div>
      </div>

      {/* 탭 */}
      <div className="scan-mode-bar" style={{ marginBottom: '16px' }}>
        <button className={`scan-mode-btn${activeTab === 'bulk' ? ' active' : ''}`} onClick={() => setActiveTab('bulk')}>
          📦 일괄 입출고
        </button>
        <button className={`scan-mode-btn${activeTab === 'reorder' ? ' active' : ''}`} onClick={() => setActiveTab('reorder')}>
          🛒 자동 발주 추천 {reorderItems.length > 0 && <span className="badge badge-danger" style={{ marginLeft: '4px' }}>{reorderItems.length}</span>}
        </button>
      </div>

      {/* 일괄 입출고 탭 */}
      {activeTab === 'bulk' && (
        items.length === 0 ? (
          <div className="card"><div className="empty-state"><div className="icon">📦</div><div className="msg">품목을 먼저 등록해주세요</div></div></div>
        ) : (
          <div className="card">
            <div className="card-title">📦 일괄 입출고</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button className={`btn btn-success${bulkType === 'in' ? ' active' : ''}`} style={{ flex: 1 }} onClick={() => setBulkType('in')}>📥 일괄 입고</button>
              <button className={`btn btn-outline${bulkType === 'out' ? ' active' : ''}`} style={{ flex: 1, color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => setBulkType('out')}>📤 일괄 출고</button>
            </div>
            <div className="table-wrapper" style={{ border: 'none', marginBottom: '12px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>품목 선택</th>
                    <th className="text-right">현재 재고</th>
                    <th>수량</th>
                    <th>비고</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const itemIdx = parseInt(row.itemIdx);
                    const item = !isNaN(itemIdx) ? items[itemIdx] : null;
                    const currentQty = item ? (parseFloat(item.quantity) || 0) : null;
                    return (
                      <tr key={idx}>
                        <td>
                          <select
                            className="form-select bulk-item"
                            style={{ minWidth: '180px' }}
                            value={row.itemIdx}
                            onChange={e => updateRow(idx, 'itemIdx', e.target.value)}
                          >
                            <option value="">-- 선택 --</option>
                            {items.map((it, i) => (
                              <option key={i} value={i}>{it.itemName} ({it.itemCode || '-'}) [재고:{parseFloat(it.quantity) || 0}]</option>
                            ))}
                          </select>
                        </td>
                        <td className="text-right">{currentQty !== null ? currentQty.toLocaleString('ko-KR') : '-'}</td>
                        <td>
                          <input
                            type="number" className="form-input" min="1"
                            value={row.qty}
                            onChange={e => updateRow(idx, 'qty', e.target.value)}
                            style={{ width: '80px', padding: '3px 6px', textAlign: 'right' }}
                          />
                        </td>
                        <td>
                          <input
                            className="form-input"
                            value={row.note}
                            onChange={e => updateRow(idx, 'note', e.target.value)}
                            placeholder="메모"
                            style={{ width: '120px', padding: '3px 6px', fontSize: '11px' }}
                          />
                        </td>
                        <td>
                          <button className="btn-icon btn-icon-danger" onClick={() => removeRow(idx)}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
              <button className="btn btn-outline" onClick={addRow}>+ 행 추가</button>
              <button className="btn btn-primary btn-lg" onClick={handleExecute}>⚡ 일괄 처리 실행</button>
            </div>
          </div>
        )
      )}

      {/* 자동 발주 추천 탭 */}
      {activeTab === 'reorder' && (
        reorderItems.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="icon" style={{ fontSize: '40px' }}>✅</div>
              <div className="msg">현재 발주가 필요한 품목이 없습니다</div>
              <div className="sub">모든 품목이 충분한 재고를 보유하고 있습니다.</div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ borderLeft: '3px solid var(--danger)' }}>
            <div className="card-title">🛒 자동 발주 추천 <span className="badge badge-danger">{reorderItems.length}건</span></div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              과거 출고 패턴과 안전재고 설정을 분석하여 발주가 필요한 품목을 추천합니다.
            </div>
            <div className="table-wrapper" style={{ border: 'none', marginBottom: '16px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>긴급도</th>
                    <th>품목명</th>
                    <th>코드</th>
                    <th className="text-right">현재 재고</th>
                    <th className="text-right">안전재고</th>
                    <th className="text-right">일평균 출고</th>
                    <th className="text-right">예상 소진일</th>
                    <th className="text-right">추천 발주량</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderItems.map((r, i) => (
                    <tr key={i} className={r.daysLeft <= 3 ? 'row-danger' : r.daysLeft <= 7 ? 'row-warning' : ''}>
                      <td>
                        {r.daysLeft <= 0
                          ? <span className="badge badge-danger">긴급</span>
                          : r.daysLeft <= 3
                            ? <span className="badge badge-danger">위험</span>
                            : r.daysLeft <= 7
                              ? <span className="badge badge-warning">주의</span>
                              : <span className="badge badge-info">참고</span>
                        }
                      </td>
                      <td><strong>{r.itemName}</strong></td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{r.itemCode || '-'}</td>
                      <td className={`text-right${r.currentQty <= 0 ? ' type-out' : ''}`}>{r.currentQty.toLocaleString('ko-KR')}</td>
                      <td className="text-right">{r.safetyQty}</td>
                      <td className="text-right">{r.avgDailyOut.toFixed(1)}</td>
                      <td className="text-right" style={{ fontWeight: 600, ...(r.daysLeft <= 3 ? { color: 'var(--danger)' } : {}) }}>
                        {r.daysLeft <= 0 ? '소진됨!' : `D-${r.daysLeft}`}
                      </td>
                      <td className="text-right" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                        {r.recommendedQty.toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-lg" onClick={handleReorderAll}>📋 발주서 작성으로 이동</button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
