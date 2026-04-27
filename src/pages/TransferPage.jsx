/**
 * TransferPage.jsx - 창고 간 재고 이동
 */
import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';

function toNumber(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }

export default function TransferPage() {
  const [state, setState] = useStore();
  const items = state.mappedData || [];
  const transfers = state.transfers || [];

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [newWarehouse, setNewWarehouse] = useState('');
  const [itemIndex, setItemIndex] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const warehouses = useMemo(
    () => [...new Set(items.map(i => i.warehouse).filter(Boolean))].sort(),
    [items]
  );

  const fromItems = useMemo(
    () => items.filter(i => i.warehouse === from),
    [items, from]
  );

  const selectedItem = itemIndex !== '' ? fromItems[parseInt(itemIndex)] : null;
  const availableQty = selectedItem ? toNumber(selectedItem.quantity) : 0;

  // 이동 이력 그룹핑 (최신 30건)
  const groups = useMemo(() => {
    const recent = [...transfers].reverse().slice(0, 30);
    const order = [];
    const map = new Map();
    recent.forEach(t => {
      const key = t.itemCode ? String(t.itemCode).trim() : String(t.itemName || '').trim();
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key).push(t);
    });
    return order.map(key => ({ key, rows: map.get(key) }));
  }, [transfers]);

  const toggleGroup = (key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleTransfer = () => {
    const toWarehouse = to === '__new__' ? newWarehouse.trim() : to;
    if (!from) { showToast('출발 창고를 선택해 주세요.', 'warning'); return; }
    if (!toWarehouse) { showToast('도착 창고를 선택해 주세요.', 'warning'); return; }
    if (from === toWarehouse) { showToast('같은 창고로는 이동할 수 없습니다.', 'warning'); return; }
    if (itemIndex === '' || !selectedItem) { showToast('품목을 선택해 주세요.', 'warning'); return; }

    const moveQty = parseFloat(qty);
    if (!moveQty || moveQty <= 0) { showToast('이동 수량을 입력해 주세요.', 'warning'); return; }
    if (moveQty > availableQty) { showToast(`재고가 부족합니다. 가용 수량: ${availableQty}`, 'error'); return; }

    const updatedItems = [...items];
    const srcIdx = updatedItems.findIndex(i => i.itemName === selectedItem.itemName && i.warehouse === from);
    if (srcIdx >= 0) updatedItems[srcIdx] = { ...updatedItems[srcIdx], quantity: availableQty - moveQty };

    const dstIdx = updatedItems.findIndex(i => i.itemName === selectedItem.itemName && i.warehouse === toWarehouse);
    if (dstIdx >= 0) {
      updatedItems[dstIdx] = { ...updatedItems[dstIdx], quantity: toNumber(updatedItems[dstIdx].quantity) + moveQty };
    } else {
      updatedItems.push({ ...selectedItem, warehouse: toWarehouse, quantity: moveQty, totalPrice: moveQty * toNumber(selectedItem.unitPrice) });
    }

    const now = new Date();
    const newTransfer = {
      id: crypto.randomUUID(),
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      itemName: selectedItem.itemName,
      itemCode: selectedItem.itemCode || '',
      fromWarehouse: from,
      toWarehouse,
      quantity: moveQty,
      note,
    };

    setState({ mappedData: updatedItems, transfers: [...transfers, newTransfer] });
    showToast(`${selectedItem.itemName} ${moveQty}개를 ${from}에서 ${toWarehouse}로 이동했습니다.`, 'success');
    setFrom(''); setTo(''); setItemIndex(''); setQty(''); setNote(''); setNewWarehouse('');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">창고 간 이동</h1>
          <div className="page-desc">품목을 다른 창고로 옮기고 이동 이력을 관리합니다.</div>
        </div>
      </div>

      {/* 이동 등록 폼 */}
      <div className="card">
        <div className="card-title">🔄 재고 이동 등록</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'end', marginBottom: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">출발 창고 <span className="required">*</span></label>
            <select className="form-select" value={from} onChange={e => { setFrom(e.target.value); setItemIndex(''); setQty(''); }}>
              <option value="">-- 선택 --</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div style={{ fontSize: '24px', paddingBottom: '8px', color: 'var(--accent)' }}>→</div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">도착 창고 <span className="required">*</span></label>
            <select className="form-select" value={to} onChange={e => setTo(e.target.value)}>
              <option value="">-- 선택 --</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
              <option value="__new__">+ 새 창고 추가</option>
            </select>
            {to === '__new__' && (
              <input className="form-input" placeholder="새 창고명을 입력하세요" value={newWarehouse} onChange={e => setNewWarehouse(e.target.value)} style={{ marginTop: '6px' }} />
            )}
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">대상 품목 <span className="required">*</span></label>
            <select className="form-select" value={itemIndex} onChange={e => { setItemIndex(e.target.value); setQty(''); }}>
              <option value="">{from ? `-- 품목 선택 (${fromItems.length}건) --` : '-- 출발 창고를 먼저 선택하세요 --'}</option>
              {fromItems.map((item, i) => (
                <option key={i} value={i}>{item.itemName} (재고: {toNumber(item.quantity)})</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">이동 수량 <span className="required">*</span></label>
            <input className="form-input" type="number" min="1" placeholder="0" value={qty} onChange={e => setQty(e.target.value)} />
            {availableQty > 0 && <div className="form-hint">가용 수량: {availableQty}</div>}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label className="form-label">비고</label>
          <input className="form-input" placeholder="이동 사유 (선택)" value={note} onChange={e => setNote(e.target.value)} />
        </div>

        <button className="btn btn-primary btn-lg" onClick={handleTransfer}>🔄 재고 이동 실행</button>
      </div>

      {/* 이동 이력 */}
      <div className="card">
        <div className="card-title">📋 이동 이력 <span className="card-subtitle">({transfers.length}건)</span></div>
        {transfers.length > 0 ? (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>품목명</th>
                  <th>출발</th>
                  <th style={{ width: '30px' }}></th>
                  <th>도착</th>
                  <th className="text-right">수량</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(({ key, rows }) => {
                  if (rows.length === 1) {
                    const t = rows[0];
                    return (
                      <tr key={t.id || key}>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t.date} {t.time || ''}</td>
                        <td><strong>{t.itemName}</strong></td>
                        <td><span className="badge badge-default">{t.fromWarehouse}</span></td>
                        <td style={{ textAlign: 'center' }}>→</td>
                        <td><span className="badge badge-info">{t.toWarehouse}</span></td>
                        <td className="text-right">{t.quantity}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t.note || '-'}</td>
                      </tr>
                    );
                  }
                  const totalQty = rows.reduce((s, t) => s + toNumber(t.quantity), 0);
                  const isExpanded = expandedGroups.has(key);
                  return (
                    <React.Fragment key={key}>
                      <tr
                        style={{ cursor: 'pointer', background: 'var(--bg-card)', borderLeft: '3px solid var(--accent)' }}
                        onClick={() => toggleGroup(key)}
                      >
                        <td colSpan={7} style={{ paddingLeft: '8px' }}>
                          <span style={{ marginRight: '6px', fontSize: '12px' }}>{isExpanded ? '▼' : '▶'}</span>
                          <strong>{rows[0].itemName}</strong>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                            이동 {rows.length}건 · 총 {totalQty.toLocaleString('ko-KR')}개
                          </span>
                        </td>
                      </tr>
                      {isExpanded && rows.map((t, i) => (
                        <tr key={t.id || i} style={{ background: 'var(--bg-lighter)' }}>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)', paddingLeft: '24px' }}>{t.date} {t.time || ''}</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t.itemName}</td>
                          <td><span className="badge badge-default">{t.fromWarehouse}</span></td>
                          <td style={{ textAlign: 'center' }}>→</td>
                          <td><span className="badge badge-info">{t.toWarehouse}</span></td>
                          <td className="text-right">{t.quantity}</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t.note || '-'}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>아직 이동 이력이 없습니다.</div>
        )}
      </div>
    </div>
  );
}
