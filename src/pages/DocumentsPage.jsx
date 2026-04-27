/**
 * DocumentsPage.jsx - 문서 자동생성 (발주서/견적서/거래명세서)
 */
import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
applyPlugin(jsPDF);
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { applyKoreanFont, getKoreanFontStyle } from '../pdf-font.js';

const today = () => new Date().toISOString().split('T')[0];
const monthAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0]; };

async function generatePurchaseOrderPDF(selectedItems, info) {
  try {
    showToast('PDF 생성 중... (폰트 로딩)', 'info', 2000);
    const doc = new jsPDF();
    const fontStyle = getKoreanFontStyle();
    await applyKoreanFont(doc);
    doc.setFontSize(20); doc.text('발주서', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`발주일자: ${info.date}`, 15, 35);
    doc.text(`발주회사: ${info.company}`, 15, 42);
    doc.text(`담당자: ${info.manager}`, 15, 49);
    doc.text(`거래처: ${info.vendor}`, 15, 56);
    const tableData = selectedItems.map((item, i) => {
      const price = parseFloat(item.unitPrice) || 0;
      return [i+1, item.itemName, item.itemCode||'-', item.orderQty, '₩'+price.toLocaleString(), '₩'+(price*item.orderQty).toLocaleString()];
    });
    const total = selectedItems.reduce((s,i) => s + (parseFloat(i.unitPrice)||0)*i.orderQty, 0);
    doc.autoTable({ startY:65, head:[['No','품목명','코드','수량','단가','금액']], body:tableData, foot:[['','','','','합계','₩'+total.toLocaleString()]], theme:'grid', headStyles:{fillColor:[37,99,235],...fontStyle}, bodyStyles:{...fontStyle}, footStyles:{fillColor:[240,242,245],textColor:[0,0,0],fontStyle:'bold',...fontStyle} });
    if (info.note) { const y = doc.lastAutoTable.finalY || 120; doc.setFontSize(9); doc.text(`비고: ${info.note}`, 15, y+15); }
    doc.save(`발주서_${info.date}.pdf`);
    showToast('발주서 PDF를 다운로드했습니다.', 'success');
  } catch (err) { showToast('PDF 생성 실패: ' + err.message, 'error'); }
}

async function generateQuotePDF(quoteItems, info) {
  try {
    showToast('PDF 생성 중... (폰트 로딩)', 'info', 2000);
    const doc = new jsPDF();
    const fontStyle = getKoreanFontStyle();
    await applyKoreanFont(doc);
    doc.setFontSize(20); doc.text('견적서', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`견적일자: ${info.date}`, 15, 35);
    doc.text(`수신: ${info.to}`, 15, 42);
    doc.text(`발신: ${info.from}`, 15, 49);
    doc.text(`유효기간: ${info.valid}`, 15, 56);
    const tableData = quoteItems.map((item, i) => {
      const price = parseFloat(item.unitPrice)||0;
      return [i+1, item.itemName, item.itemCode||'-', item.qty, '₩'+price.toLocaleString(), '₩'+(price*item.qty).toLocaleString()];
    });
    const total = quoteItems.reduce((s,i) => s+(parseFloat(i.unitPrice)||0)*i.qty, 0);
    doc.autoTable({ startY:65, head:[['No','품목명','코드','수량','단가','금액']], body:tableData, foot:[['','','','','합계','₩'+total.toLocaleString()]], theme:'grid', headStyles:{fillColor:[22,163,74],...fontStyle}, bodyStyles:{...fontStyle}, footStyles:{fillColor:[240,242,245],textColor:[0,0,0],fontStyle:'bold',...fontStyle} });
    doc.save(`견적서_${info.date}.pdf`);
    showToast('견적서 PDF를 다운로드했습니다.', 'success');
  } catch (err) { showToast('PDF 생성 실패: ' + err.message, 'error'); }
}

async function generateStatementPDF(txList, info) {
  try {
    showToast('PDF 생성 중... (폰트 로딩)', 'info', 2000);
    const doc = new jsPDF();
    const fontStyle = getKoreanFontStyle();
    await applyKoreanFont(doc);
    doc.setFontSize(20); doc.text('거래명세서', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`기간: ${info.from} ~ ${info.to}`, 15, 35);
    doc.text(`공급자: ${info.supplier}`, 15, 42);
    doc.text(`공급받는자: ${info.receiver}`, 15, 49);
    const tableData = txList.map((tx, i) => [
      i+1, tx.date, tx.type==='in'?'입고':'출고', tx.itemName, tx.itemCode||'-', tx.quantity,
      '₩'+Math.round(parseFloat(tx.unitPrice)||0).toLocaleString(),
      '₩'+Math.round((parseFloat(tx.unitPrice)||0)*(parseFloat(tx.quantity)||0)).toLocaleString(),
    ]);
    doc.autoTable({ startY:58, head:[['No','일자','구분','품목명','코드','수량','단가','금액']], body:tableData, theme:'grid', headStyles:{fillColor:[100,100,100],...fontStyle}, bodyStyles:{...fontStyle}, columnStyles:{2:{cellWidth:15},5:{halign:'right'},6:{halign:'right'},7:{halign:'right'}} });
    doc.save(`거래명세서_${info.from}_${info.to}.pdf`);
    showToast('거래명세서 PDF를 다운로드했습니다.', 'success');
  } catch (err) { showToast('PDF 생성 실패: ' + err.message, 'error'); }
}

/* ── 발주서 패널 ── */
function PurchasePanel({ items, safetyStock, documentDraft }) {
  const lowStockItems = useMemo(() => items.filter(d => {
    const min = safetyStock[d.itemName];
    return min !== undefined && (parseFloat(d.quantity)||0) <= min;
  }), [items, safetyStock]);

  const vendors = useMemo(() => [...new Set(items.map(i => i.vendor).filter(Boolean))].sort(), [items]);

  const draftItems = documentDraft?.type === 'purchase' ? (documentDraft.items||[]) : [];
  const draftVendor = documentDraft?.type === 'purchase' ? (documentDraft.vendor||'') : '';
  const draftNote = documentDraft?.type === 'purchase' ? (documentDraft.note||'') : '';

  const sourceItems = draftItems.length > 0 ? draftItems : (lowStockItems.length > 0 ? lowStockItems : items.slice(0, 10));

  const [poDate, setPoDate] = useState(today());
  const [poVendor, setPoVendor] = useState(draftVendor);
  const [poCompany, setPoCompany] = useState('');
  const [poManager, setPoManager] = useState('');
  const [poNote, setPoNote] = useState(draftNote);
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

  const toggleAll = (checked) => {
    if (checked) setCheckedItems(new Set(sourceItems.map((_, i) => i)));
    else setCheckedItems(new Set());
  };

  const toggleItem = (i) => {
    setCheckedItems(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; });
  };

  const handleGenerate = () => {
    const selected = sourceItems.filter((_, i) => checkedItems.has(i)).map((item, _, arr) => {
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
      <div className="card-title">📋 발주서 작성</div>
      {draftItems.length > 0 ? (
        <div className="alert alert-info" style={{ marginBottom: '16px' }}>선택한 발주 추천 품목 <strong>{draftItems.length}건</strong>을 가져왔습니다.</div>
      ) : lowStockItems.length > 0 ? (
        <div className="alert alert-warning" style={{ marginBottom: '16px' }}>⚠️ 안전재고 부족 품목 <strong>{lowStockItems.length}건</strong>을 자동 추천합니다.</div>
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
        <button className="btn btn-primary btn-lg" onClick={handleGenerate}>📄 발주서 PDF 생성</button>
      </div>
    </div>
  );
}

/* ── 견적서 패널 ── */
function QuotePanel({ items }) {
  const [qtDate, setQtDate] = useState(today());
  const [qtTo, setQtTo] = useState('');
  const [qtFrom, setQtFrom] = useState('');
  const [qtValid, setQtValid] = useState('견적일로부터 30일');
  const [quoteItems, setQuoteItems] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState('');

  const addItem = () => {
    const idx = parseInt(selectedIdx);
    if (isNaN(idx)) { showToast('품목을 선택해 주세요.', 'warning'); return; }
    setQuoteItems(prev => [...prev, { ...items[idx], qty: 1 }]);
    setSelectedIdx('');
  };

  const updateQty = (i, qty) => {
    setQuoteItems(prev => prev.map((item, idx) => idx === i ? { ...item, qty: parseInt(qty)||1 } : item));
  };

  const removeItem = (i) => {
    setQuoteItems(prev => prev.filter((_, idx) => idx !== i));
  };

  const total = quoteItems.reduce((s, item) => s + (parseFloat(item.unitPrice)||0)*item.qty, 0);

  const handleGenerate = () => {
    if (quoteItems.length === 0) { showToast('견적 품목을 추가해 주세요.', 'warning'); return; }
    generateQuotePDF(quoteItems, { date: qtDate, to: qtTo||'거래처', from: qtFrom||'INVEX 사용자', valid: qtValid });
  };

  return (
    <div>
      <div className="card-title">💼 견적서 작성</div>
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
                  <td className="text-center"><button className="btn btn-ghost btn-sm" onClick={() => removeItem(i)}>✕</button></td>
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
        <button className="btn btn-primary btn-lg" onClick={handleGenerate}>📄 견적서 PDF 생성</button>
      </div>
    </div>
  );
}

/* ── 거래명세서 패널 ── */
function StatementPanel({ transactions }) {
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());
  const [supplier, setSupplier] = useState('');
  const [receiver, setReceiver] = useState('');

  const filteredTx = useMemo(() => transactions.filter(tx => tx.date >= from && tx.date <= to), [transactions, from, to]);

  const handleGenerate = () => {
    if (filteredTx.length === 0) { showToast('해당 기간에 거래 기록이 없습니다.', 'warning'); return; }
    generateStatementPDF(filteredTx, { from, to, supplier: supplier||'INVEX 사용자', receiver: receiver||'거래처' });
  };

  return (
    <div>
      <div className="card-title">📑 거래명세서 작성</div>
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
        <button className="btn btn-primary btn-lg" onClick={handleGenerate}>📄 거래명세서 PDF 생성</button>
      </div>
    </div>
  );
}

/* ── 메인 페이지 ── */
export default function DocumentsPage() {
  const [state] = useStore();
  const items = state.mappedData || [];
  const safetyStock = state.safetyStock || {};
  const transactions = state.transactions || [];
  const documentDraft = state.documentDraft || null;

  const lowStockCount = useMemo(() => items.filter(d => {
    const min = safetyStock[d.itemName];
    return min !== undefined && (parseFloat(d.quantity)||0) <= min;
  }).length, [items, safetyStock]);

  const [docType, setDocType] = useState('purchase');

  const DOC_TYPES = [
    { id: 'purchase', icon: '📋', label: '발주서', desc: '부족 품목을 기준으로 자동 추천합니다.', badge: lowStockCount > 0 ? { text: `${lowStockCount}건 부족`, cls: 'badge-danger' } : null },
    { id: 'quote',    icon: '💼', label: '견적서', desc: '품목을 선택해 바로 금액을 계산합니다.' },
    { id: 'statement',icon: '📑', label: '거래명세서', desc: '입출고 기록을 기준으로 문서를 만듭니다.' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📄 문서 자동생성</h1>
          <div className="page-desc">발주서, 견적서, 거래명세서를 자동으로 생성하고 PDF로 다운로드합니다.</div>
        </div>
      </div>

      {/* 문서 유형 선택 */}
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

      {/* 문서 편집기 */}
      <div className="card">
        {docType === 'purchase' && <PurchasePanel items={items} safetyStock={safetyStock} documentDraft={documentDraft} />}
        {docType === 'quote' && <QuotePanel items={items} />}
        {docType === 'statement' && <StatementPanel transactions={transactions} />}
      </div>
    </div>
  );
}
