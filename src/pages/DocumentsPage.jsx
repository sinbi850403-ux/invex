import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { PurchasePanel } from '../components/documents/PurchasePanel.jsx';
import { QuotePanel }    from '../components/documents/QuotePanel.jsx';
import { StatementPanel } from '../components/documents/StatementPanel.jsx';

export default function DocumentsPage() {
  const [state] = useStore();
  const items        = state.mappedData    || [];
  const safetyStock  = state.safetyStock   || {};
  const transactions = state.transactions  || [];
  const documentDraft = state.documentDraft || null;

  const lowStockCount = useMemo(() => items.filter(d => {
    const min = safetyStock[d.itemName];
    return min !== undefined && (parseFloat(d.quantity)||0) <= min;
  }).length, [items, safetyStock]);

  const [docType, setDocType] = useState('purchase');

  const DOC_TYPES = [
    { id: 'purchase',  icon: '', label: '발주서',     desc: '부족 품목을 기준으로 자동 추천합니다.', badge: lowStockCount > 0 ? { text: `${lowStockCount}건 부족`, cls: 'badge-danger' } : null },
    { id: 'quote',     icon: '', label: '견적서',     desc: '품목을 선택해 바로 금액을 계산합니다.' },
    { id: 'statement', icon: '', label: '거래명세서', desc: '입출고 기록을 기준으로 문서를 만듭니다.' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 문서 자동생성</h1>
          <div className="page-desc">발주서, 견적서, 거래명세서를 자동으로 생성하고 PDF로 다운로드합니다.</div>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '20px' }}>
        {DOC_TYPES.map(dt => (
          <div key={dt.id} className={`card${docType === dt.id ? ' active' : ''}`}
            onClick={() => setDocType(dt.id)}
            style={{ cursor: 'pointer', borderTop: docType === dt.id ? '3px solid var(--accent)' : '3px solid transparent' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>{dt.icon}</div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>{dt.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{dt.desc}</div>
            {dt.badge && <span className={`badge ${dt.badge.cls}`} style={{ marginTop: '6px' }}>{dt.badge.text}</span>}
          </div>
        ))}
      </div>

      <div className="card">
        {docType === 'purchase'  && <PurchasePanel  items={items} safetyStock={safetyStock} documentDraft={documentDraft} />}
        {docType === 'quote'     && <QuotePanel     items={items} />}
        {docType === 'statement' && <StatementPanel transactions={transactions} />}
      </div>
    </div>
  );
}
