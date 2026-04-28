import React, { useState, useMemo } from 'react';
import { showToast } from '../../toast.js';
import { today, monthAgo, generateStatementPDF } from '../../domain/documentsConfig.js';

export function StatementPanel({ transactions }) {
  const [from,     setFrom]     = useState(monthAgo());
  const [to,       setTo]       = useState(today());
  const [supplier, setSupplier] = useState('');
  const [receiver, setReceiver] = useState('');

  const filteredTx = useMemo(() => transactions.filter(tx => tx.date >= from && tx.date <= to), [transactions, from, to]);

  const handleGenerate = () => {
    if (filteredTx.length === 0) { showToast('해당 기간에 거래 기록이 없습니다.', 'warning'); return; }
    generateStatementPDF(filteredTx, { from, to, supplier: supplier||'INVEX 사용자', receiver: receiver||'거래처' });
  };

  return (
    <div>
      <div className="card-title"> 거래명세서 작성</div>
      <div className="form-row" style={{ marginBottom: '16px' }}>
        <div className="form-group">
          <label className="form-label">기간 (시작)</label>
          <input className="form-input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">기간 (종료)</label>
          <input className="form-input" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>
      <div className="form-row" style={{ marginBottom: '16px' }}>
        <div className="form-group">
          <label className="form-label">공급자 (우리 회사)</label>
          <input className="form-input" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="우리 회사명" />
        </div>
        <div className="form-group">
          <label className="form-label">공급받는자</label>
          <input className="form-input" value={receiver} onChange={e => setReceiver(e.target.value)} placeholder="거래처명" />
        </div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <strong>해당 기간 거래 건수: </strong>
        <span className="badge badge-info">{filteredTx.length}건</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-lg" onClick={handleGenerate}> 거래명세서 PDF 생성</button>
      </div>
    </div>
  );
}
