/**
 * PosPage.jsx — POS 매출 분석 (관리자 전용)
 * page-pos.js → React 변환 (9차)
 */

import React, { useState, useRef } from 'react';
import { useStore } from '../hooks/useStore.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { showToast } from '../toast.js';
import { readExcelFile, downloadExcel, downloadExcelSheets } from '../excel.js';

const ADMIN_EMAILS = [
  'sinbi0214@naver.com',
  'sinbi850403@gmail.com',
  'admin@invex.io.kr',
];

// POS 필드 정의
const POS_FIELDS = [
  { key: 'saleDate',    label: '판매일자' },
  { key: 'storeName',   label: '매장명' },
  { key: 'category',    label: '구분' },
  { key: 'totalSales',  label: '총매출액' },
  { key: 'salesAmount', label: '매출금액' },
  { key: 'vat',         label: '부가세' },
  { key: 'cardAmount',  label: '카드' },
  { key: 'cashAmount',  label: '현금' },
  { key: 'pointAmount', label: '포인트' },
  { key: 'refund',      label: '환불/할인' },
  { key: 'netSales',    label: '순매출' },
  { key: 'itemName',    label: '품목명' },
  { key: 'quantity',    label: '수량' },
  { key: 'unitPrice',   label: '단가' },
  { key: 'posNumber',   label: 'POS번호' },
  { key: 'note',        label: '비고' },
];

const POS_KEYWORDS = {
  saleDate:    ['판매일자', '판매일', '거래일', '거래일자', '일자', '날짜', 'date'],
  storeName:   ['매장명', '매장', '매장코드', '점포', '지점', 'store'],
  category:    ['구분', '분류', '결제구분', '유형', '거래유형', 'type'],
  totalSales:  ['총매출액', '총매출', '매출합계', '합계금액', '합계', 'total'],
  salesAmount: ['매출금액', '매출액', '공급가액', '공급가', '금액', 'sales', 'amount'],
  vat:         ['부가세', '세액', '부가가치세', 'vat', 'tax'],
  cardAmount:  ['카드', '카드금액', '카드매출', '신용카드', 'card'],
  cashAmount:  ['현금', '현금금액', '현금매출', 'cash'],
  pointAmount: ['포인트', '포인트금액', '포인트사용', 'point'],
  refund:      ['환불', '할인', '반품', '환불금액', '할인금액', 'refund', 'discount'],
  netSales:    ['순매출', '순매출액', '실매출', 'net'],
  itemName:    ['품목명', '품목', '상품명', '제품명', '메뉴명', 'item'],
  quantity:    ['수량', '판매수량', 'qty', 'quantity'],
  unitPrice:   ['단가', '판매단가', '매출단가', 'price'],
  posNumber:   ['pos번호', 'pos', '승인번호', '전표번호'],
  note:        ['비고', '메모', 'note', 'memo'],
};

function autoMapPOS(headers) {
  const lower = headers.map(h => (h || '').toString().toLowerCase().trim());
  const mapping = {};
  const usedIdx = new Set();
  POS_FIELDS.forEach(field => {
    const kws = POS_KEYWORDS[field.key] || [];
    const matchIdx = lower.findIndex((h, idx) => !usedIdx.has(idx) && kws.some(kw => h.includes(kw)));
    if (matchIdx >= 0) { mapping[field.key] = matchIdx; usedIdx.add(matchIdx); }
  });
  return mapping;
}

function downloadPosTemplate() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const headers = ['판매일자','매장명','구분','총매출액','매출금액','부가세','카드','현금','포인트','환불/할인','순매출','품목명','수량','단가','POS번호','비고'];
  const sampleRows = [
    [today,'본점','정상',750000,681819,68181,450000,300000,0,0,750000,'','','','0001','1일차 매출'],
    [today,'본점','정상',500000,454545,45455,500000,0,0,0,500000,'','','','0002','카드 100%'],
    [yesterday,'본점','정상',620000,563636,56364,400000,220000,0,0,620000,'','','','0007','전일 매출'],
  ];
  downloadExcelSheets([{ name: 'POS 매출 데이터', rows: [headers, ...sampleRows] }], 'INVEX_POS매출_양식');
  showToast('POS 양식을 다운로드했습니다.', 'success');
}

const fmt = n => '₩' + Math.round(n).toLocaleString('ko-KR');

// ─── 업로드 모달 ────────────────────────────────────────
function UploadModal({ onClose, onConfirm }) {
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null); // null | { rows, mappedCount, headers, mapping, totalSales } | 'loading' | { error }
  const [dragOver, setDragOver] = useState(false);

  async function processFile(file) {
    setPreview('loading');
    try {
      const { sheets, sheetNames } = await readExcelFile(file);
      const sheetData = sheets[sheetNames[0]];
      if (!sheetData || sheetData.length < 2) { setPreview({ error: '데이터가 없거나 헤더만 있습니다.' }); return; }
      const headers = sheetData[0].map(h => String(h || '').trim());
      const mapping = autoMapPOS(headers);
      const rows = [];
      for (let i = 1; i < sheetData.length; i++) {
        const row = sheetData[i];
        if (!row || row.length === 0) continue;
        if (!row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) continue;
        const record = {};
        POS_FIELDS.forEach(field => {
          const colIdx = mapping[field.key];
          if (colIdx !== undefined && colIdx < row.length) {
            let val = row[colIdx];
            if (field.key === 'saleDate' && typeof val === 'number' && val > 10000) {
              val = new Date((val - 25569) * 86400 * 1000).toISOString().split('T')[0];
            }
            record[field.key] = val !== null && val !== undefined ? String(val).trim() : '';
          }
        });
        if (record.totalSales || record.salesAmount || record.cardAmount) rows.push(record);
      }
      if (rows.length === 0) { setPreview({ error: '유효한 매출 데이터가 없습니다. 헤더를 확인해 주세요.' }); return; }
      const totalSales = rows.reduce((s, r) => s + (parseFloat(r.totalSales) || parseFloat(r.salesAmount) || 0), 0);
      setPreview({ rows, mappedCount: Object.keys(mapping).length, headers, mapping, totalSales });
    } catch (err) {
      setPreview({ error: '파일 처리 중 오류: ' + err.message });
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 800 }}>
        <div className="modal-header">
          <h3 className="modal-title">📤 POS 매출 데이터 업로드</h3>
          <button className="modal-close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="alert alert-info" style={{ marginBottom: 16, fontSize: 12 }}>
            <strong>📋 사용 방법:</strong><br />
            ① 아래 '양식 다운로드'로 POS 엑셀 양식을 받으세요<br />
            ② POS 시스템 데이터를 업로드하세요<br />
            ③ 매핑 결과를 확인하고 '등록' 버튼을 누르세요
          </div>
          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-outline" onClick={downloadPosTemplate}>📥 POS 양식 다운로드</button>
          </div>
          <div
            style={{ border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: 40, textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s' }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>POS 엑셀 파일을 여기에 드래그하거나 클릭</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>.xlsx, .xls 파일 지원</div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files[0]; if (f) processFile(f); }} />
          </div>

          {preview === 'loading' && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>⏳ 파일 분석 중...</div>
          )}
          {preview && preview.error && (
            <div className="alert alert-warning" style={{ marginTop: 12 }}>{preview.error}</div>
          )}
          {preview && preview.rows && (
            <div style={{ marginTop: 16 }}>
              <div className="alert alert-success" style={{ marginBottom: 12 }}>
                ✅ <strong>{preview.rows.length}건</strong> 인식 완료 |
                매핑된 필드: <strong>{preview.mappedCount}/{preview.headers.length}</strong> |
                총 매출: <strong>{fmt(preview.totalSales)}</strong>
              </div>
              <div style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 13 }}>🔗 자동 매핑 결과:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {POS_FIELDS.map(field => {
                    const idx = preview.mapping[field.key];
                    if (idx === undefined) return null;
                    return <span key={field.key} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--accent)', color: '#fff' }}>{preview.headers[idx]} → {field.label}</span>;
                  })}
                </div>
              </div>
              <div className="table-wrapper" style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
                <table className="data-table" style={{ fontSize: 11 }}>
                  <thead><tr><th>일자</th><th>매장</th><th>구분</th><th className="text-right">총매출</th><th className="text-right">카드</th><th className="text-right">현금</th></tr></thead>
                  <tbody>
                    {preview.rows.slice(0, 10).map((r, i) => (
                      <tr key={i}>
                        <td>{r.saleDate || '-'}</td>
                        <td>{r.storeName || '-'}</td>
                        <td>{r.category || '-'}</td>
                        <td className="text-right">{parseFloat(r.totalSales) ? fmt(parseFloat(r.totalSales)) : (parseFloat(r.salesAmount) ? fmt(parseFloat(r.salesAmount)) : '-')}</td>
                        <td className="text-right">{parseFloat(r.cardAmount) ? fmt(parseFloat(r.cardAmount)) : '-'}</td>
                        <td className="text-right">{parseFloat(r.cashAmount) ? fmt(parseFloat(r.cashAmount)) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 10 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>... 외 {preview.rows.length - 10}건</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setPreview(null)}>취소</button>
                <button className="btn btn-primary" onClick={() => onConfirm(preview.rows)}>✅ {preview.rows.length}건 등록</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 대시보드 ────────────────────────────────────────────
function PosDashboard({ posData }) {
  const totalSales = posData.reduce((s, d) => s + (parseFloat(d.totalSales) || parseFloat(d.salesAmount) || 0), 0);
  const totalVat = posData.reduce((s, d) => s + (parseFloat(d.vat) || 0), 0);
  const totalCard = posData.reduce((s, d) => s + (parseFloat(d.cardAmount) || 0), 0);
  const totalCash = posData.reduce((s, d) => s + (parseFloat(d.cashAmount) || 0), 0);
  const totalPoint = posData.reduce((s, d) => s + (parseFloat(d.pointAmount) || 0), 0);
  const totalRefund = posData.reduce((s, d) => s + (parseFloat(d.refund) || 0), 0);
  const netSales = totalSales - totalRefund;

  const storeMap = {};
  posData.forEach(d => { const s = d.storeName || '미지정'; storeMap[s] = (storeMap[s] || 0) + (parseFloat(d.totalSales) || parseFloat(d.salesAmount) || 0); });
  const storeRanking = Object.entries(storeMap).sort((a, b) => b[1] - a[1]);

  const catMap = {};
  posData.forEach(d => { const c = d.category || '미분류'; catMap[c] = (catMap[c] || 0) + (parseFloat(d.totalSales) || parseFloat(d.salesAmount) || 0); });
  const catRanking = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  const dateMap = {};
  posData.forEach(d => { const dt = d.saleDate || '미지정'; dateMap[dt] = (dateMap[dt] || 0) + (parseFloat(d.totalSales) || parseFloat(d.salesAmount) || 0); });
  const dateTrend = Object.entries(dateMap).sort((a, b) => a[0].localeCompare(b[0]));

  const paymentTotal = totalCard + totalCash + totalPoint || 1;
  const cardPct = Math.round((totalCard / paymentTotal) * 100);
  const cashPct = Math.round((totalCash / paymentTotal) * 100);
  const pointPct = 100 - cardPct - cashPct;
  const maxDate = Math.max(...dateTrend.map(d => d[1])) || 1;
  const totalSalesFooter = posData.reduce((s, d) => s + (parseFloat(d.salesAmount) || 0), 0);

  return (
    <>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {[
          { label: '총 매출', value: fmt(totalSales), sub: `${posData.length}건`, cls: 'text-accent' },
          { label: '순매출', value: fmt(netSales), sub: `환불 ${fmt(totalRefund)}`, cls: 'text-success' },
          { label: '부가세', value: fmt(totalVat), sub: '' },
          { label: '카드 매출', value: fmt(totalCard), sub: `${cardPct}%`, style: { color: 'var(--info, #58a6ff)' } },
          { label: '현금 매출', value: fmt(totalCash), sub: `${cashPct}%`, cls: 'text-success' },
          { label: '포인트', value: fmt(totalPoint), sub: `${pointPct}%`, style: { color: 'var(--warning)' } },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.cls || ''}`} style={s.style}>{s.value}</div>
            {s.sub && <div className="stat-change">{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">💳 결제 수단 비율</div>
        <div style={{ display: 'flex', height: 32, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
          {totalCard > 0 && <div style={{ width: `${cardPct}%`, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>카드 {cardPct}%</div>}
          {totalCash > 0 && <div style={{ width: `${cashPct}%`, background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>현금 {cashPct}%</div>}
          {totalPoint > 0 && <div style={{ width: `${pointPct}%`, background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>포인트 {pointPct}%</div>}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          <span>💳 카드: {fmt(totalCard)}</span>
          <span>💵 현금: {fmt(totalCash)}</span>
          <span>🎁 포인트: {fmt(totalPoint)}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">📅 일자별 매출 추이</div>
          {dateTrend.length > 0 ? (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {dateTrend.map(([date, amount]) => (
                <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: 12, minWidth: 80, color: 'var(--text-muted)' }}>{date}</span>
                  <div style={{ flex: 1, height: 20, background: 'var(--border-light)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round((amount / maxDate) * 100)}%`, background: 'linear-gradient(90deg, var(--accent), #60a5fa)', borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, minWidth: 100, textAlign: 'right' }}>{fmt(amount)}</span>
                </div>
              ))}
            </div>
          ) : <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>일자 데이터 없음</div>}
        </div>

        <div>
          {storeRanking.length > 1 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">🏪 매장별 매출</div>
              {storeRanking.slice(0, 10).map(([name, amount], i) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-light)', fontSize: 13 }}>
                  <span><span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{i + 1}</span>{name}</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{fmt(amount)}</span>
                </div>
              ))}
            </div>
          )}
          {catRanking.length > 0 && (
            <div className="card">
              <div className="card-title">🏷️ 구분별 매출</div>
              {catRanking.slice(0, 10).map(([name, amount], i) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-light)', fontSize: 13 }}>
                  <span><span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{i + 1}</span>{name}</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{fmt(amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card card-flush">
        <div className="card-title" style={{ padding: '12px 16px' }}>📋 상세 데이터 <span className="card-subtitle">{posData.length}건</span></div>
        <div className="table-wrapper" style={{ border: 'none', maxHeight: 400, overflowY: 'auto' }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th>판매일자</th><th>매장</th><th>구분</th>
                <th className="text-right">총매출</th><th className="text-right">매출금액</th>
                <th className="text-right">부가세</th><th className="text-right">카드</th>
                <th className="text-right">현금</th><th className="text-right">포인트</th>
              </tr>
            </thead>
            <tbody>
              {posData.slice(0, 100).map((d, i) => (
                <tr key={i}>
                  <td className="col-num">{i + 1}</td>
                  <td>{d.saleDate || '-'}</td>
                  <td>{d.storeName || '-'}</td>
                  <td>{d.category || '-'}</td>
                  <td className="text-right" style={{ fontWeight: 600 }}>{parseFloat(d.totalSales) ? fmt(parseFloat(d.totalSales)) : '-'}</td>
                  <td className="text-right">{parseFloat(d.salesAmount) ? fmt(parseFloat(d.salesAmount)) : '-'}</td>
                  <td className="text-right">{parseFloat(d.vat) ? fmt(parseFloat(d.vat)) : '-'}</td>
                  <td className="text-right" style={{ color: 'var(--info, #58a6ff)' }}>{parseFloat(d.cardAmount) ? fmt(parseFloat(d.cardAmount)) : '-'}</td>
                  <td className="text-right" style={{ color: 'var(--success)' }}>{parseFloat(d.cashAmount) ? fmt(parseFloat(d.cashAmount)) : '-'}</td>
                  <td className="text-right" style={{ color: 'var(--warning)' }}>{parseFloat(d.pointAmount) ? fmt(parseFloat(d.pointAmount)) : '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)' }}>
                <td /><td /><td />
                <td>합계</td>
                <td className="text-right">{fmt(totalSales)}</td>
                <td className="text-right">{fmt(totalSalesFooter)}</td>
                <td className="text-right">{fmt(totalVat)}</td>
                <td className="text-right">{fmt(totalCard)}</td>
                <td className="text-right">{fmt(totalCash)}</td>
                <td className="text-right">{fmt(totalPoint)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {posData.length > 100 && <div style={{ textAlign: 'center', padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>상위 100건만 표시 (전체 {posData.length}건)</div>}
      </div>
    </>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────
export default function PosPage() {
  const { user } = useAuth();
  const [state, setState] = useStore();
  const posData = state.posData || [];
  const [showUpload, setShowUpload] = useState(false);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email);

  if (!isAdmin) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">접근 제한</h1></div>
        <div className="alert alert-danger" style={{ marginTop: 16 }}>🔒 이 기능은 관리자만 사용할 수 있습니다.</div>
      </div>
    );
  }

  function handleConfirm(rows) {
    const totalSales = rows.reduce((s, r) => s + (parseFloat(r.totalSales) || parseFloat(r.salesAmount) || 0), 0);
    setState({ posData: [...posData, ...rows] });
    showToast(`✅ POS 매출 ${rows.length}건 등록 완료! (총 매출: ${fmt(totalSales)})`, 'success');
    setShowUpload(false);
  }

  function handleExport() {
    if (!posData.length) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }
    downloadExcel(posData, 'POS_매출_데이터');
    showToast('POS 데이터를 엑셀로 내보냈습니다.', 'success');
  }

  function handleClear() {
    if (confirm('POS 매출 데이터를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      setState({ posData: [] });
      showToast('POS 데이터를 초기화했습니다.', 'info');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🖥️ POS 매출 분석</h1>
          <div className="page-desc">POS 매출 데이터를 업로드하여 매출 현황을 분석합니다. <span className="badge badge-danger" style={{ fontSize: 10 }}>관리자 전용</span></div>
        </div>
        <div className="page-actions">
          {posData.length > 0 && <>
            <button className="btn btn-outline" onClick={handleExport}>📥 내보내기</button>
            <button className="btn btn-outline" onClick={handleClear}>🗑️ 데이터 초기화</button>
          </>}
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>📤 POS 엑셀 업로드</button>
        </div>
      </div>

      {posData.length > 0 ? (
        <PosDashboard posData={posData} />
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
          <h3 style={{ marginBottom: 8 }}>POS 매출 데이터를 업로드해 주세요</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
            POS 시스템에서 엑셀로 내보낸 매출 데이터를 업로드하면<br />
            자동으로 헤더를 인식하고 매출 현황을 분석합니다.
          </p>
          <div className="alert alert-info" style={{ maxWidth: 500, margin: '0 auto', textAlign: 'left', fontSize: 12 }}>
            <strong>📌 지원되는 POS 헤더:</strong><br />
            판매일자, 매장명, 구분, 총매출액, 매출금액, 부가세, 카드, 현금, 포인트 등<br />
            → 헤더 이름이 조금 달라도 자동으로 인식합니다!
          </div>
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onConfirm={handleConfirm} />}
    </div>
  );
}
