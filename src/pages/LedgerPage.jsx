/**
 * LedgerPage.jsx - 수불부 (재고수불대장)
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import { applyKoreanFont, getKoreanFontStyle } from '../pdf-font.js';

applyPlugin(jsPDF);

const TEXT_COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

const SORT_FIELDS = [
  { key: 'itemName',     label: '품목명' },
  { key: 'itemCode',     label: '코드' },
  { key: 'unit',         label: '단위' },
  { key: 'openingQty',   label: '기초재고',  numeric: true, align: 'text-right' },
  { key: 'inQty',        label: '입고',      numeric: true, align: 'text-right' },
  { key: 'outQty',       label: '출고',      numeric: true, align: 'text-right' },
  { key: 'closingQty',   label: '기말재고',  numeric: true, align: 'text-right' },
  { key: 'weightedAvgCost', label: '단가',   numeric: true, align: 'text-right' },
  { key: 'closingValue', label: '재고금액',  numeric: true, align: 'text-right' },
];

const fmt = v => v ? `₩${Math.round(v).toLocaleString('ko-KR')}` : '-';

function buildLedger(items, transactions, from, to, itemFilter, openingOverrides = {}) {
  const targetItems = itemFilter ? items.filter(i => i.itemName === itemFilter) : items;
  return targetItems.map(item => {
    const currentQty = parseFloat(item.quantity) || 0;
    const unitPrice  = parseFloat(item.unitPrice)  || 0;
    let periodInQty = 0, periodInAmt = 0;
    let periodOutQty = 0, periodOutAmt = 0, periodCostAmt = 0;
    let openingQty = currentQty, primaryVendor = '';
    transactions.forEach(tx => {
      if (tx.itemName !== item.itemName) return;
      const qty = parseFloat(tx.quantity) || 0;
      if (tx.date >= from) { if (tx.type === 'in') openingQty -= qty; else openingQty += qty; }
      if (tx.date >= from && tx.date <= to) {
        if (tx.type === 'in') {
          periodInQty += qty;
          periodInAmt += Math.round((parseFloat(tx.unitPrice) || 0) * qty);
          if (tx.vendor) primaryVendor = tx.vendor;
        } else {
          periodOutQty += qty;
          periodOutAmt  += Math.round((parseFloat(tx.sellingPrice) || 0) * qty);
          periodCostAmt += Math.round((parseFloat(tx.unitPrice)    || 0) * qty);
        }
      }
    });
    const override = openingOverrides[item.itemName];
    const finalOpeningQty = (override !== undefined && override !== null && override !== '')
      ? Math.max(0, parseFloat(override) || 0)
      : Math.max(0, openingQty);
    const closingQty = Math.max(0, finalOpeningQty + periodInQty - periodOutQty);
    // 가중평균 단가: 실제 거래 기반 우선, 없으면 품목 마스터 단가
    const weightedAvgCost = periodInAmt > 0 && periodInQty > 0
      ? periodInAmt / periodInQty
      : unitPrice;
    return {
      itemName: item.itemName, itemCode: item.itemCode || '',
      unit: item.unit || '', vendor: primaryVendor, unitPrice,
      sellingPrice: parseFloat(item.sellingPrice || item.salePrice) || 0,
      openingQty: Math.max(0, openingQty), inQty: periodInQty, outQty: periodOutQty,
      inAmt: periodInAmt, outAmt: periodOutAmt, costAmt: periodCostAmt,
      weightedAvgCost,
      closingQty, closingValue: Math.round(closingQty * (weightedAvgCost || unitPrice)),
    };
  }).filter(r => r.openingQty > 0 || r.inQty > 0 || r.outQty > 0 || r.closingQty > 0);
}

function sortRows(rows, sort) {
  return [...rows].sort((a, b) => {
    const av = sort.key === 'itemName' ? a.itemName
      : SORT_FIELDS.find(f => f.key === sort.key)?.numeric ? Number(a[sort.key]) : a[sort.key];
    const bv = sort.key === 'itemName' ? b.itemName
      : SORT_FIELDS.find(f => f.key === sort.key)?.numeric ? Number(b[sort.key]) : b[sort.key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const r = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : TEXT_COLLATOR.compare(String(av), String(bv));
    return sort.direction === 'desc' ? -r : r;
  });
}

/* 기초재고 입력 모달 */
function OpeningModal({ items, openingOverrides, onClose, onSave }) {
  const [search, setSearch] = useState('');
  const [overrides, setOverrides] = useState({ ...openingOverrides });

  const filtered = search
    ? items.filter(i => (i.itemName || '').toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal" style={{ maxWidth: '760px' }}>
        <div className="modal-header">
          <h3 className="modal-title">기초재고 입력</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
            <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="품목명을 검색하세요" />
            <button className="btn btn-outline btn-sm" onClick={() => setOverrides({})}>초기화</button>
          </div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr><th>품목명</th><th className="text-right">현재 재고</th><th className="text-right">기초재고</th></tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => (
                  <tr key={i}>
                    <td><strong>{item.itemName}</strong></td>
                    <td className="text-right">{(parseFloat(item.quantity) || 0).toLocaleString('ko-KR')}</td>
                    <td className="text-right">
                      <input
                        className="form-input"
                        style={{ maxWidth: '120px', textAlign: 'right' }}
                        value={overrides[item.itemName] ?? ''}
                        placeholder="입력"
                        onChange={e => setOverrides(prev => ({ ...prev, [item.itemName]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={() => onSave(overrides)}>저장</button>
        </div>
      </div>
    </div>
  );
}

export default function LedgerPage() {
  const [state, setState] = useStore();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const openingOverrides = state.ledgerOpeningOverrides || {};

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = now.toISOString().split('T')[0];

  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [itemFilter, setItemFilter] = useState('');
  const [sort, setSort] = useState({ key: 'closingValue', direction: 'desc' });
  const [showTable, setShowTable] = useState(true);
  const [showOpening, setShowOpening] = useState(false);

  const rawRows = useMemo(
    () => buildLedger(items, transactions, fromDate, toDate, itemFilter, openingOverrides),
    [items, transactions, fromDate, toDate, itemFilter, openingOverrides]
  );
  const rows = useMemo(() => sortRows(rawRows, sort), [rawRows, sort]);

  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : 'asc') : (SORT_FIELDS.find(f => f.key === key)?.numeric ? 'desc' : 'asc'),
    }));
  };

  const handleSaveOpening = (overrides) => {
    const clean = {};
    Object.entries(overrides).forEach(([k, v]) => {
      if (v === '') return;
      const n = parseFloat(v);
      if (!isNaN(n)) clean[k] = n;
    });
    setState({ ledgerOpeningOverrides: clean });
    setShowOpening(false);
    showToast('기초재고가 저장되었습니다.', 'success');
  };

  const handleExcelExport = () => {
    if (!rows.length) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }
    const exportRows = rows.map(row => {
      // 공급가액: 실제 거래 금액 우선, 없으면 마스터 단가 × 입고수량
      const supply = row.inAmt > 0 ? row.inAmt : Math.round((row.unitPrice || 0) * (row.inQty || 0));
      const vat = Math.floor(supply * 0.1);
      // 출고금액: 실제 거래 금액 우선, 없으면 판매가 × 출고수량
      const outAmt = row.outAmt > 0 ? row.outAmt : Math.round((row.sellingPrice || 0) * (row.outQty || 0));
      // 매입원가: 실제 거래 원가 우선, 없으면 가중평균 단가 × 출고수량
      const purchase = row.costAmt > 0 ? row.costAmt : Math.round((row.weightedAvgCost || row.unitPrice || 0) * (row.outQty || 0));
      const profit = outAmt - purchase;
      return {
        '품목명': row.itemName, '상품코드': row.itemCode, '단위': row.unit,
        '입고수량': row.inQty, '단가': Math.round(row.weightedAvgCost || row.unitPrice),
        '공급가액': supply, '부가세': vat, '합계금액': supply + vat,
        '출고수량': row.outQty, '출고금액': outAmt, '매입원가': purchase,
        '이익액': profit,
        '이익율': purchase > 0 ? (profit / purchase * 100).toFixed(1) + '%' : '',
        '기말재고수량': row.closingQty, '기말재고': row.closingValue,
      };
    });
    downloadExcel(exportRows, `수불부_${fromDate}_${toDate}`);
    showToast('수불부를 엑셀로 내보냈습니다.', 'success');
  };

  const handlePdfExport = async () => {
    if (!rows.length) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }
    try {
      showToast('PDF 생성 중입니다. (폰트 로딩)', 'info', 2000);
      const doc = new jsPDF('landscape');
      const fontStyle = getKoreanFontStyle();
      await applyKoreanFont(doc);
      doc.setFontSize(16);
      doc.text('재고 수불대장', 148, 15, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`기간: ${fromDate} ~ ${toDate}`, 14, 25);
      doc.autoTable({
        startY: 32,
        head: [['No', '품목명', '코드', '단위', '기초재고', '입고', '출고', '기말재고', '단가', '재고금액']],
        body: rows.map((row, i) => [
          i + 1, row.itemName, row.itemCode || '-', row.unit || '-',
          row.openingQty, row.inQty > 0 ? `+${row.inQty}` : '-',
          row.outQty > 0 ? `-${row.outQty}` : '-', row.closingQty,
          row.weightedAvgCost > 0 ? fmt(row.weightedAvgCost) : '-',
          row.closingValue > 0 ? fmt(row.closingValue) : '-',
        ]),
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], ...fontStyle },
        bodyStyles: { ...fontStyle },
        styles: { fontSize: 8, ...fontStyle },
      });
      doc.save(`수불대장_${fromDate}_${toDate}.pdf`);
      showToast('수불부 PDF를 다운로드했습니다.', 'success');
    } catch (err) {
      showToast(`PDF 생성 실패: ${err.message}`, 'error');
    }
  };

  const totalOpening = rows.reduce((s, r) => s + r.openingQty, 0);
  const totalIn      = rows.reduce((s, r) => s + r.inQty, 0);
  const totalOut     = rows.reduce((s, r) => s + r.outQty, 0);
  const totalClosing = rows.reduce((s, r) => s + r.closingQty, 0);
  const totalValue   = rows.reduce((s, r) => s + r.closingValue, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📒 수불부 (재고수불대장)</h1>
          <div className="page-desc">기간별 품목의 입고, 출고, 잔량을 장부 형식으로 자동 생성합니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setShowOpening(true)}>기초재고 입력</button>
          <button className="btn btn-outline" onClick={handleExcelExport}>📊 엑셀 다운로드</button>
          <button className="btn btn-primary" onClick={handlePdfExport}>📄 PDF 다운로드</button>
        </div>
      </div>

      {/* 필터 */}
      <div className="card card-compact" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">시작일</label>
            <input className="form-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">종료일</label>
            <input className="form-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">품목 필터</label>
            <select className="form-select" value={itemFilter} onChange={e => setItemFilter(e.target.value)}>
              <option value="">전체 품목</option>
              {items.map(item => (
                <option key={item.itemName} value={item.itemName}>{item.itemName} ({item.itemCode || '-'})</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" style={{ marginTop: '18px' }} onClick={() => setShowTable(true)}>조회</button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="card card-flush">
        {!showTable || rows.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            {showTable ? '해당 기간의 데이터가 없습니다.' : '조회 버튼을 눌러주세요.'}
          </div>
        ) : (
          <>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <strong>📒 수불대장</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px', marginLeft: '8px' }}>
                {fromDate} ~ {toDate} ({rows.length}개 품목)
              </span>
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
                          style={field.key === 'inQty' ? { color: 'var(--success)' } : field.key === 'outQty' ? { color: 'var(--danger)' } : field.key === 'closingQty' ? { fontWeight: 700 } : {}}
                        >
                          <span>{field.label}</span>
                          <span className="table-sort-arrow">{sort.key === field.key ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td className="col-num">{i + 1}</td>
                      <td className="col-fill"><strong>{row.itemName}</strong></td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{row.itemCode || '-'}</td>
                      <td>{row.unit || '-'}</td>
                      <td className="text-right">{row.openingQty.toLocaleString('ko-KR')}</td>
                      <td className="text-right type-in">{row.inQty > 0 ? `+${row.inQty.toLocaleString('ko-KR')}` : '-'}</td>
                      <td className="text-right type-out">{row.outQty > 0 ? `-${row.outQty.toLocaleString('ko-KR')}` : '-'}</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>{row.closingQty.toLocaleString('ko-KR')}</td>
                      <td className="text-right">{row.weightedAvgCost > 0 ? fmt(row.weightedAvgCost) : '-'}</td>
                      <td className="text-right">{row.closingValue > 0 ? fmt(row.closingValue) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, background: 'var(--bg-card)' }}>
                    <td colSpan={4} className="text-right">합계</td>
                    <td className="text-right">{totalOpening.toLocaleString('ko-KR')}</td>
                    <td className="text-right type-in">+{totalIn.toLocaleString('ko-KR')}</td>
                    <td className="text-right type-out">-{totalOut.toLocaleString('ko-KR')}</td>
                    <td className="text-right">{totalClosing.toLocaleString('ko-KR')}</td>
                    <td className="text-right"></td>
                    <td className="text-right">{fmt(totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="chart-help-text" style={{ padding: '0 20px 16px' }}>표 제목을 누르면 품목명, 수량, 금액 기준으로 바로 정렬됩니다.</div>
          </>
        )}
      </div>

      {showOpening && (
        <OpeningModal
          items={items}
          openingOverrides={openingOverrides}
          onClose={() => setShowOpening(false)}
          onSave={handleSaveOpening}
        />
      )}
    </div>
  );
}
