import React, { useState } from 'react';
import { showToast } from '../../toast.js';
import { today, generateQuotePDF } from '../../domain/documentsConfig.js';

export function QuotePanel({ items }) {
  const [qtDate,      setQtDate]      = useState(today());
  const [qtTo,        setQtTo]        = useState('');
  const [qtFrom,      setQtFrom]      = useState('');
  const [qtValid,     setQtValid]     = useState('견적일로부터 30일');
  const [quoteItems,  setQuoteItems]  = useState([]);
  const [selectedIdx, setSelectedIdx] = useState('');

  const addItem = () => {
    const idx = parseInt(selectedIdx);
    if (isNaN(idx)) { showToast('품목을 선택해 주세요.', 'warning'); return; }
    setQuoteItems(prev => [...prev, { ...items[idx], qty: 1 }]);
    setSelectedIdx('');
  };

  const updateQty  = (i, qty) => setQuoteItems(prev => prev.map((item, idx) => idx === i ? { ...item, qty: parseInt(qty)||1 } : item));
  const removeItem = (i) => setQuoteItems(prev => prev.filter((_, idx) => idx !== i));

  const total = quoteItems.reduce((s, item) => s + (parseFloat(item.unitPrice)||0)*item.qty, 0);

  const handleGenerate = () => {
    if (quoteItems.length === 0) { showToast('견적 품목을 추가해 주세요.', 'warning'); return; }
    generateQuotePDF(quoteItems, { date: qtDate, to: qtTo||'거래처', from: qtFrom||'INVEX 사용자', valid: qtValid });
  };

  return (
    <div>
      <div className="card-title"> 견적서 작성</div>
      <div className="form-row" style={{ marginBottom: '16px' }}>
        <div className="form-group">
          <label className="form-label">견적일자</label>
          <input className="form-input" type="date" value={qtDate} onChange={e => setQtDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">거래처 (수신)</label>
          <input className="form-input" value={qtTo} onChange={e => setQtTo(e.target.value)} placeholder="견적 받을 업체명" />
        </div>
      </div>
      <div className="form-row" style={{ marginBottom: '16px' }}>
        <div className="form-group">
          <label className="form-label">발신 회사명</label>
          <input className="form-input" value={qtFrom} onChange={e => setQtFrom(e.target.value)} placeholder="우리 회사명" />
        </div>
        <div className="form-group">
          <label className="form-label">유효기간</label>
          <input className="form-input" value={qtValid} onChange={e => setQtValid(e.target.value)} />
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: '8px' }}>
        <label className="form-label">품목 추가</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select className="form-select" value={selectedIdx} onChange={e => setSelectedIdx(e.target.value)} style={{ flex: 1 }}>
            <option value="">-- 품목 선택 --</option>
            {items.map((item, i) => (
              <option key={i} value={i}>{item.itemName} ({item.itemCode||'-'}) - ₩{Math.round(parseFloat(item.unitPrice||0)).toLocaleString('ko-KR')}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={addItem}>+ 추가</button>
        </div>
      </div>

      <div className="table-wrapper" style={{ marginBottom: '16px' }}>
        <table className="data-table">
          <thead>
            <tr><th>품목명</th><th>코드</th><th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">금액</th><th style={{ width: '40px' }}>삭제</th></tr>
          </thead>
          <tbody>
            {quoteItems.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>품목을 추가해 주세요.</td></tr>
            ) : quoteItems.map((item, i) => {
              const price = parseFloat(item.unitPrice)||0;
              return (
                <tr key={i}>
                  <td><strong>{item.itemName}</strong></td>
                  <td style={{ color: 'var(--text-muted)' }}>{item.itemCode||'-'}</td>
                  <td className="text-right">
                    <input type="number" className="form-input" value={item.qty} min="1"
                      onChange={e => updateQty(i, e.target.value)}
                      style={{ width: '60px', padding: '3px 6px', textAlign: 'right' }} />
                  </td>
                  <td className="text-right">₩{price.toLocaleString('ko-KR')}</td>
                  <td className="text-right">₩{(price*item.qty).toLocaleString('ko-KR')}</td>
                  <td className="text-center"><button className="btn btn-ghost btn-sm" onClick={() => removeItem(i)}></button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--bg-card)' }}>
              <td colSpan={4} className="text-right">합계</td>
              <td className="text-right">₩{total.toLocaleString('ko-KR')}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-lg" onClick={handleGenerate}> 견적서 PDF 생성</button>
      </div>
    </div>
  );
}
