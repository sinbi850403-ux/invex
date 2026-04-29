/**
 * LedgerPage.jsx - 수불부 (재고수불대장)
 * 헤더: 거래처 | 상품코드 | 상품명 | 년도 | 전월이월(수량/금액) | 입고(수량/금액) | 출고(수량/금액) | 로스(수량/금액) | 기말재고(수량/금액) | 단가
 */
import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import { applyKoreanFont, getKoreanFontStyle } from '../pdf-font.js';
import { fmtWon as fmt } from '../utils/formatters.js';

applyPlugin(jsPDF);

const TEXT_COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

const SORT_COLS = [
  { key: 'vendor',       label: '거래처',      numeric: false },
  { key: 'itemCode',     label: '상품코드',    numeric: false },
  { key: 'itemName',     label: '상품명',      numeric: false },
  { key: 'color',        label: '색상',        numeric: false },
  { key: 'openingQty',   label: '전월이월수량', numeric: true  },
  { key: 'openingAmt',   label: '전월이월금액', numeric: true  },
  { key: 'inQty',        label: '입고수량',    numeric: true  },
  { key: 'inAmt',        label: '입고금액',    numeric: true  },
  { key: 'outQty',       label: '출고수량',    numeric: true  },
  { key: 'outAmt',       label: '출고금액',    numeric: true  },
  { key: 'lossQty',      label: '로스수량',    numeric: true  },
  { key: 'lossAmt',      label: '로스금액',    numeric: true  },
  { key: 'closingQty',   label: '기말재고수량', numeric: true  },
  { key: 'closingValue', label: '기말재고금액', numeric: true  },
  { key: 'unitPrice',    label: '단가',        numeric: true  },
];

function sortRows(rows, sort) {
  if (!sort.key) return rows;
  return [...rows].sort((a, b) => {
    const col = SORT_COLS.find(c => c.key === sort.key);
    const av = col?.numeric ? Number(a[sort.key]) : a[sort.key] ?? '';
    const bv = col?.numeric ? Number(b[sort.key]) : b[sort.key] ?? '';
    const r = col?.numeric
      ? av - bv
      : TEXT_COLLATOR.compare(String(av), String(bv));
    return sort.direction === 'desc' ? -r : r;
  });
}

function SortTh({ colKey, sort, onSort, children, style = {}, rowSpan, colSpan }) {
  const active = sort.key === colKey;
  return (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
      style={{ ...style, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => onSort(colKey)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        {children}
        <span style={{ fontSize: '10px', color: active ? 'var(--primary)' : 'var(--text-muted)', marginLeft: '1px' }}>
          {active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  );
}

function buildLedger(items, transactions, from, to, vendorFilter, itemFilter, openingOverrides = {}) {
  const txByItem = new Map();
  transactions.forEach(tx => {
    if (!txByItem.has(tx.itemName)) txByItem.set(tx.itemName, []);
    txByItem.get(tx.itemName).push(tx);
  });

  let targetItems = itemFilter ? items.filter(i => i.itemName === itemFilter) : items;
  if (vendorFilter) {
    const vf = vendorFilter.toLowerCase();
    targetItems = targetItems.filter(item => {
      const txs = txByItem.get(item.itemName) || [];
      return txs.some(tx => tx.type === 'in' && (tx.vendor || '').toLowerCase().includes(vf));
    });
  }

  return targetItems.map(item => {
    const currentQty  = parseFloat(item.quantity)  || 0;
    const unitPrice   = parseFloat(item.unitPrice)  || 0;
    let periodInQty = 0, periodInAmt = 0;
    let periodOutQty = 0, periodOutAmt = 0, periodCostAmt = 0;
    let periodLossQty = 0, periodLossAmt = 0;
    let openingQty = currentQty;
    let primaryVendor = item.vendor || '';
    let itemColor = item.color || '';
    const itemTxs = txByItem.get(item.itemName) || [];

    itemTxs.forEach(tx => {
      const qty = parseFloat(tx.quantity) || 0;
      // 기초재고 역산: 기간 이전/이후 트랜잭션을 기준으로 개시 재고 계산
      if (tx.date >= from) {
        if (tx.type === 'in' || tx.type === 'loss') openingQty -= qty;
        else openingQty += qty;
      }
      // 색상: 트랜잭션에서 보완
      if (tx.color && !itemColor) itemColor = tx.color;
      if (tx.date >= from && tx.date <= to) {
        if (tx.type === 'in') {
          periodInQty += qty;
          periodInAmt += Math.round((parseFloat(tx.unitPrice) || 0) * qty);
          if (tx.vendor) primaryVendor = tx.vendor;
        } else if (tx.type === 'out') {
          periodOutQty += qty;
          periodOutAmt  += Math.round((parseFloat(tx.sellingPrice) || 0) * qty);
          periodCostAmt += Math.round((parseFloat(tx.unitPrice)    || 0) * qty);
          // 입고 거래처가 없으면 출고 거래처로 보완
          if (tx.vendor && !primaryVendor) primaryVendor = tx.vendor;
        } else if (tx.type === 'loss' || tx.type === 'adjust') {
          periodLossQty += qty;
          periodLossAmt += Math.round((parseFloat(tx.unitPrice) || 0) * qty);
        }
      }
    });

    const override = openingOverrides[item.itemName];
    const finalOpeningQty = (override !== undefined && override !== null && override !== '')
      ? Math.max(0, parseFloat(override) || 0)
      : Math.max(0, openingQty);

    const closingQty = Math.max(0, finalOpeningQty + periodInQty - periodOutQty - periodLossQty);

    // 가중평균 단가: 입고 기반 → 출고 원가 기반 → 품목 마스터 단가 순으로 fallback
    const weightedAvgCost = periodInAmt > 0 && periodInQty > 0
      ? periodInAmt / periodInQty
      : periodCostAmt > 0 && periodOutQty > 0
        ? periodCostAmt / periodOutQty
        : unitPrice;

    const openingAmt = Math.round(finalOpeningQty * (weightedAvgCost || unitPrice));
    const closingValue = Math.round(closingQty * (weightedAvgCost || unitPrice));

    // 로스 금액: 명시적 로스가 없으면 재고차이로 보완
    const impliedLoss = finalOpeningQty + periodInQty - periodOutQty - periodLossQty - closingQty;
    const finalLossQty = periodLossQty + Math.max(0, impliedLoss);
    const finalLossAmt = periodLossAmt > 0
      ? periodLossAmt
      : Math.round(Math.max(0, impliedLoss) * (weightedAvgCost || unitPrice));

    const fromYear = from ? from.slice(0, 4) : '';

    return {
      vendor: primaryVendor,
      itemCode: item.itemCode || '',
      itemName: item.itemName,
      color: itemColor,
      year: fromYear,
      unitPrice: Math.round(weightedAvgCost || unitPrice),
      openingQty: Math.max(0, finalOpeningQty),
      openingAmt,
      inQty: periodInQty,
      inAmt: periodInAmt,
      outQty: periodOutQty,
      outAmt: periodOutAmt,
      costAmt: periodCostAmt,
      lossQty: finalLossQty,
      lossAmt: finalLossAmt,
      closingQty,
      closingValue,
      sellingPrice: parseFloat(item.sellingPrice || item.salePrice) || 0,
    };
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
          <button className="modal-close" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
            <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="품목명을 검색하세요" />
            <button className="btn btn-outline btn-sm" onClick={() => setOverrides({})}>초기화</button>
          </div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>품목명</th>
                  <th className="text-right">현재 재고</th>
                  <th className="text-right">기초재고 (전월이월)</th>
                </tr>
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
  const items        = state.mappedData || [];
  const transactions = state.transactions || [];
  const openingOverrides = state.ledgerOpeningOverrides || {};

  const now      = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay  = now.toISOString().split('T')[0];

  const [fromDate, setFromDate]     = useState(firstDay);
  const [toDate, setToDate]         = useState(lastDay);
  const [vendorFilter, setVendorFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [showOpening, setShowOpening] = useState(false);
  const [sort, setSort] = useState({ key: 'closingValue', direction: 'desc' });

  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : 'asc') : (SORT_COLS.find(c => c.key === key)?.numeric ? 'desc' : 'asc'),
    }));
  };

  // 거래처 목록 (입고 트랜잭션 기준)
  const vendorList = useMemo(() => {
    const set = new Set();
    transactions.forEach(tx => { if (tx.type === 'in' && tx.vendor) set.add(tx.vendor); });
    return Array.from(set).sort();
  }, [transactions]);

  const rawRows = useMemo(
    () => buildLedger(items, transactions, fromDate, toDate, vendorFilter, itemFilter, openingOverrides),
    [items, transactions, fromDate, toDate, vendorFilter, itemFilter, openingOverrides]
  );
  const rows = useMemo(() => sortRows(rawRows, sort), [rawRows, sort]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    openingQty:   acc.openingQty   + r.openingQty,
    openingAmt:   acc.openingAmt   + r.openingAmt,
    inQty:        acc.inQty        + r.inQty,
    inAmt:        acc.inAmt        + r.inAmt,
    outQty:       acc.outQty       + r.outQty,
    outAmt:       acc.outAmt       + r.outAmt,
    lossQty:      acc.lossQty      + r.lossQty,
    lossAmt:      acc.lossAmt      + r.lossAmt,
    closingQty:   acc.closingQty   + r.closingQty,
    closingValue: acc.closingValue + r.closingValue,
  }), { openingQty: 0, openingAmt: 0, inQty: 0, inAmt: 0, outQty: 0, outAmt: 0, lossQty: 0, lossAmt: 0, closingQty: 0, closingValue: 0 }), [rows]);

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
    const exportRows = rows.map(row => ({
      '거래처':       row.vendor || '-',
      '상품코드':     row.itemCode || '-',
      '상품명':       row.itemName,
      '색상':         row.color || '',
      '년도':         row.year,
      '전월이월_수량': row.openingQty,
      '전월이월_금액': row.openingAmt,
      '입고_수량':    row.inQty,
      '입고_금액':    row.inAmt,
      '출고_수량':    row.outQty,
      '출고_금액':    row.outAmt,
      '로스_수량':    row.lossQty,
      '로스_금액':    row.lossAmt,
      '기말재고_수량': row.closingQty,
      '기말재고_금액': row.closingValue,
      '단가':         row.unitPrice,
    }));
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
        head: [[
          '거래처', '상품코드', '상품명', '색상', '년도',
          '전월이월(수)', '전월이월(금)', '입고(수)', '입고(금)',
          '출고(수)', '출고(금)', '로스(수)', '로스(금)',
          '기말재고(수)', '기말재고(금)', '단가',
        ]],
        body: rows.map(row => [
          row.vendor || '-', row.itemCode || '-', row.itemName, row.color || '-', row.year,
          row.openingQty.toLocaleString('ko-KR'), fmt(row.openingAmt),
          row.inQty > 0 ? row.inQty.toLocaleString('ko-KR') : '-', row.inAmt > 0 ? fmt(row.inAmt) : '-',
          row.outQty > 0 ? row.outQty.toLocaleString('ko-KR') : '-', row.outAmt > 0 ? fmt(row.outAmt) : '-',
          row.lossQty > 0 ? row.lossQty.toLocaleString('ko-KR') : '-', row.lossAmt > 0 ? fmt(row.lossAmt) : '-',
          row.closingQty.toLocaleString('ko-KR'), row.closingValue > 0 ? fmt(row.closingValue) : '-',
          fmt(row.unitPrice),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], ...fontStyle },
        bodyStyles: { ...fontStyle },
        styles: { fontSize: 7, ...fontStyle },
      });
      doc.save(`수불대장_${fromDate}_${toDate}.pdf`);
      showToast('수불부 PDF를 다운로드했습니다.', 'success');
    } catch (err) {
      showToast(`PDF 생성 실패: ${err.message}`, 'error');
    }
  };

  const n = (v) => v > 0 ? v.toLocaleString('ko-KR') : '-';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">수불부 (재고수불대장)</h1>
          <div className="page-desc">기간별 품목의 입고, 출고, 로스, 기말재고를 장부 형식으로 자동 생성합니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setShowOpening(true)}>기초재고 입력</button>
          <button className="btn btn-outline" onClick={handleExcelExport}>엑셀 다운로드</button>
          <button className="btn btn-primary" onClick={handlePdfExport}>PDF 다운로드</button>
        </div>
      </div>

      {/* 필터 */}
      <div className="card card-compact" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">시작일</label>
            <input className="form-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">종료일</label>
            <input className="form-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">거래처</label>
            <select className="form-select" value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}>
              <option value="">전체 거래처</option>
              {vendorList.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">품목</label>
            <select className="form-select" value={itemFilter} onChange={e => setItemFilter(e.target.value)}>
              <option value="">전체 품목</option>
              {items.map(item => (
                <option key={item.itemName} value={item.itemName}>{item.itemName} ({item.itemCode || '-'})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="card card-flush">
        {rows.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            해당 기간의 데이터가 없습니다.
          </div>
        ) : (
          <>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <strong>수불대장</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px', marginLeft: '8px' }}>
                {fromDate} ~ {toDate} ({rows.length}개 품목)
              </span>
            </div>
            <div className="table-wrapper" style={{ border: 'none', borderRadius: 0, overflowX: 'auto' }}>
              <table className="data-table inv-table" style={{ minWidth: '1200px' }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ verticalAlign: 'middle', textAlign: 'center', width: '36px' }}>#</th>
                    <SortTh colKey="vendor"     sort={sort} onSort={handleSort} rowSpan={2} style={{ verticalAlign: 'middle', textAlign: 'center', minWidth: '90px' }}>거래처</SortTh>
                    <SortTh colKey="itemCode"   sort={sort} onSort={handleSort} rowSpan={2} style={{ verticalAlign: 'middle', textAlign: 'center', minWidth: '80px' }}>상품코드</SortTh>
                    <SortTh colKey="itemName"   sort={sort} onSort={handleSort} rowSpan={2} style={{ verticalAlign: 'middle', textAlign: 'center', minWidth: '140px' }}>상품명</SortTh>
                    <SortTh colKey="color"      sort={sort} onSort={handleSort} rowSpan={2} style={{ verticalAlign: 'middle', textAlign: 'center', minWidth: '70px' }}>색상</SortTh>
                    <th rowSpan={2} style={{ verticalAlign: 'middle', textAlign: 'center', width: '55px' }}>년도</th>
                    <th colSpan={2} style={{ textAlign: 'center', background: 'var(--bg-muted)' }}>전월이월</th>
                    <th colSpan={2} style={{ textAlign: 'center', color: 'var(--success)' }}>입고</th>
                    <th colSpan={2} style={{ textAlign: 'center', color: 'var(--danger)' }}>출고</th>
                    <th colSpan={2} style={{ textAlign: 'center', color: 'var(--warning)' }}>로스</th>
                    <th colSpan={2} style={{ textAlign: 'center', fontWeight: 700 }}>기말재고</th>
                    <SortTh colKey="unitPrice"  sort={sort} onSort={handleSort} rowSpan={2} style={{ verticalAlign: 'middle', textAlign: 'right', minWidth: '80px' }}>단가</SortTh>
                  </tr>
                  <tr>
                    <SortTh colKey="openingQty" sort={sort} onSort={handleSort} style={{ textAlign: 'right', fontSize: '11px', background: 'var(--bg-muted)' }}>수량</SortTh>
                    <SortTh colKey="openingAmt" sort={sort} onSort={handleSort} style={{ textAlign: 'right', fontSize: '11px', background: 'var(--bg-muted)' }}>금액</SortTh>
                    <SortTh colKey="inQty"      sort={sort} onSort={handleSort} style={{ textAlign: 'right', fontSize: '11px', color: 'var(--success)' }}>수량</SortTh>
                    <SortTh colKey="inAmt"      sort={sort} onSort={handleSort} style={{ textAlign: 'right', fontSize: '11px', color: 'var(--success)' }}>금액</SortTh>
                    <SortTh colKey="outQty"     sort={sort} onSort={handleSort} style={{ textAlign: 'right', fontSize: '11px', color: 'var(--danger)' }}>수량</SortTh>
                    <SortTh colKey="outAmt"     sort={sort} onSort={handleSort} style={{ textAlign: 'right', fontSize: '11px', color: 'var(--danger)' }}>금액</SortTh>
                    <SortTh colKey="lossQty"    sort={sort} onSort={handleSort} style={{ textAlign: 'right', fontSize: '11px', color: 'var(--warning)' }}>수량</SortTh>
                    <SortTh colKey="lossAmt"    sort={sort} onSort={handleSort} style={{ textAlign: 'right', fontSize: '11px', color: 'var(--warning)' }}>금액</SortTh>
                    <SortTh colKey="closingQty" sort={sort} onSort={handleSort} style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700 }}>수량</SortTh>
                    <SortTh colKey="closingValue" sort={sort} onSort={handleSort} style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700 }}>금액</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td className="col-num" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{row.vendor || '-'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{row.itemCode || '-'}</td>
                      <td><strong>{row.itemName}</strong></td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{row.color || '-'}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>{row.year}</td>
                      <td className="text-right">{n(row.openingQty)}</td>
                      <td className="text-right">{n(row.openingAmt)}</td>
                      <td className="text-right type-in">{n(row.inQty)}</td>
                      <td className="text-right type-in">{row.inAmt > 0 ? fmt(row.inAmt) : '-'}</td>
                      <td className="text-right type-out">{n(row.outQty)}</td>
                      <td className="text-right type-out">{row.outAmt > 0 ? fmt(row.outAmt) : '-'}</td>
                      <td className="text-right" style={{ color: row.lossQty > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                        {n(row.lossQty)}
                      </td>
                      <td className="text-right" style={{ color: row.lossAmt > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                        {row.lossAmt > 0 ? fmt(row.lossAmt) : '-'}
                      </td>
                      <td className="text-right" style={{ fontWeight: 700 }}>{row.closingQty.toLocaleString('ko-KR')}</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>{row.closingValue > 0 ? fmt(row.closingValue) : '-'}</td>
                      <td className="text-right">{fmt(row.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, background: 'var(--bg-card)' }}>
                    <td colSpan={6} className="text-right" style={{ color: 'var(--text-muted)' }}>합계</td>
                    <td className="text-right">{totals.openingQty.toLocaleString('ko-KR')}</td>
                    <td className="text-right">{fmt(totals.openingAmt)}</td>
                    <td className="text-right type-in">{n(totals.inQty)}</td>
                    <td className="text-right type-in">{fmt(totals.inAmt)}</td>
                    <td className="text-right type-out">{n(totals.outQty)}</td>
                    <td className="text-right type-out">{fmt(totals.outAmt)}</td>
                    <td className="text-right" style={{ color: 'var(--warning)' }}>{n(totals.lossQty)}</td>
                    <td className="text-right" style={{ color: 'var(--warning)' }}>{fmt(totals.lossAmt)}</td>
                    <td className="text-right">{totals.closingQty.toLocaleString('ko-KR')}</td>
                    <td className="text-right">{fmt(totals.closingValue)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
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
