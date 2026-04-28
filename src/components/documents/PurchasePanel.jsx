import React, { useState, useMemo } from 'react';
import { showToast } from '../../toast.js';
import { today, generatePurchaseOrderPDF } from '../../domain/documentsConfig.js';

export function PurchasePanel({ items, safetyStock, documentDraft }) {
  const lowStockItems = useMemo(() => items.filter(d => {
    const min = safetyStock[d.itemName];
    return min !== undefined && (parseFloat(d.quantity)||0) <= min;
  }), [items, safetyStock]);

  const vendors = useMemo(() => [...new Set(items.map(i => i.vendor).filter(Boolean))].sort(), [items]);

  const draftItems  = documentDraft?.type === 'purchase' ? (documentDraft.items||[])  : [];
  const draftVendor = documentDraft?.type === 'purchase' ? (documentDraft.vendor||'') : '';
  const draftNote   = documentDraft?.type === 'purchase' ? (documentDraft.note||'')   : '';

  const sourceItems = draftItems.length > 0 ? draftItems : (lowStockItems.length > 0 ? lowStockItems : items.slice(0, 10));

  const [poDate,    setPoDate]    = useState(today());
  const [poVendor,  setPoVendor]  = useState(draftVendor);
  const [poCompany, setPoCompany] = useState('');
  const [poManager, setPoManager] = useState('');
  const [poNote,    setPoNote]    = useState(draftNote);
  const [checkedItems, setCheckedItems] = useState(() => new Set(sourceItems.map((_, i) => i)));
  const [orderQtys, setOrderQtys] = useState(() => {
    const m = {};
    sourceItems.forEach((item, i) => {
      const currentQty = parseFloat(item.quantity)||0;
      const minQty = item.minQty ?? (safetyStock[item.itemName]||0);
      m[i] = item.orderQty || Math.max(1, Math.ceil((minQty - currentQty) + (minQty * 0.5)));
    });
    return m;
  });

  const toggleAll  = (checked) => { if (checked) setCheckedItems(new Set(sourceItems.map((_, i) => i))); else setCheckedItems(new Set()); };
  const toggleItem = (i) => { setCheckedItems(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; }); };

  const handleGenerate = () => {
    const selected = sourceItems.filter((_, i) => checkedItems.has(i)).map(item => {
      const idx = sourceItems.indexOf(item);
      return { ...item, orderQty: orderQtys[idx] || 1 };
    });
    if (selected.length === 0) { showToast('발주할 품목을 선택해 주세요.', 'warning'); return; }
    generatePurchaseOrderPDF(selected, {
      date: poDate, vendor: poVendor || '전체 거래처',
      company: poCompany || 'INVEX 사용자', manager: poManager, note: poNote,
    });
  };

  const allVendors = [...new Set([...vendors, draftVendor].filter(Boolean))];

  return (
    <div>
      <div className="card-title"> 발주서 작성</div>
      {draftItems.length > 0 ? (
        <div className="alert alert-info" style={{ marginBottom: '16px' }}>선택한 발주 추천 품목 <strong>{draftItems.length}건</strong>을 가져왔습니다.</div>
      ) : lowStockItems.length > 0 ? (
        <div className="alert alert-warning" style={{ marginBottom: '16px' }}> 안전재고 부족 품목 <strong>{lowStockItems.length}건</strong>을 자동 추천합니다.</div>
      ) : null}

      <div className="form-row" style={{ marginBottom: '16px' }}>
        <div className="form-group">
          <label className="form-label">발주일자</label>
          <input className="form-input" type="date" value={poDate} onChange={e => setPoDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">거래처 선택</label>
          <select className="form-select" value={poVendor} onChange={e => setPoVendor(e.target.value)}>
            <option value="">전체 거래처</option>
            {allVendors.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row" style={{ marginBottom: '16px' }}>
        <div className="form-group">
          <label className="form-label">발주 회사명</label>
          <input className="form-input" value={poCompany} onChange={e => setPoCompany(e.target.value)} placeholder="우리 회사명" />
        </div>
        <div className="form-group">
          <label className="form-label">담당자</label>
          <input className="form-input" value={poManager} onChange={e => setPoManager(e.target.value)} placeholder="담당자명" />
        </div>
      </div>

      <div className="table-wrapper" style={{ marginBottom: '16px' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={checkedItems.size === sourceItems.length} onChange={e => toggleAll(e.target.checked)} /></th>
              <th>품목명</th><th>품목코드</th><th>거래처</th>
              <th className="text-right">현재 재고</th><th className="text-right">안전재고</th>
              <th className="text-right">발주 수량</th><th className="text-right">단가</th>
            </tr>
          </thead>
          <tbody>
            {sourceItems.map((item, i) => {
              const currentQty = parseFloat(item.quantity)||0;
              const minQty = item.minQty ?? (safetyStock[item.itemName]||0);
              return (
                <tr key={i}>
                  <td><input type="checkbox" checked={checkedItems.has(i)} onChange={() => toggleItem(i)} /></td>
                  <td><strong>{item.itemName}</strong></td>
                  <td style={{ color: 'var(--text-muted)' }}>{item.itemCode||'-'}</td>
                  <td>{item.vendor||'-'}</td>
                  <td className={`text-right ${currentQty <= minQty ? 'type-out' : ''}`}>{currentQty.toLocaleString('ko-KR')}</td>
                  <td className="text-right">{minQty||'-'}</td>
                  <td className="text-right">
                    <input type="number" className="form-input" value={orderQtys[i]||1} min="1"
                      onChange={e => setOrderQtys(prev => ({ ...prev, [i]: parseFloat(e.target.value)||1 }))}
                      style={{ width: '80px', padding: '4px 6px', textAlign: 'right' }} />
                  </td>
                  <td className="text-right">{item.unitPrice ? '₩'+Math.round(parseFloat(item.unitPrice)).toLocaleString('ko-KR') : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="form-group" style={{ marginBottom: '16px' }}>
        <label className="form-label">비고</label>
        <input className="form-input" value={poNote} onChange={e => setPoNote(e.target.value)} placeholder="추가 메모 (선택)" />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-lg" onClick={handleGenerate}> 발주서 PDF 생성</button>
      </div>
    </div>
  );
}
