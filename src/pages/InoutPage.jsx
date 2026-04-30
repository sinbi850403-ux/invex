/**
 * InoutPage.jsx - 입출고 관리 페이지
 * mode: 'all' | 'in' | 'out'
 */
import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';
import { canAction } from '../auth.js';
import { addTransaction, deleteTransaction } from '../store.js';
import { enableColumnResize } from '../ux-toolkit.js';
import { fmtNum as fmt, fmtWon as W } from '../utils/formatters.js';
import { formatDateStr as formatDate } from '../domain/inoutExcelParser.js';
import { TxModal } from '../components/inout/TxModal.jsx';
import { BulkUploadModal } from '../components/inout/BulkUploadModal.jsx';
import { SortTh } from '../components/inout/SortTh.jsx';
import { useInoutFilters } from '../hooks/useInoutFilters.js';

// ── 빈 상태 ──────────────────────────────────────────────────────────────────
function EmptyState({ icon, msg, sub }) {
  return (
    <div className="empty-state">
      <div className="icon">{icon}</div>
      <div className="msg">{msg}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export function InoutPage({ mode = 'all' }) {
  const [{ transactions, mappedData, vendorMaster }] = useStore(s => ({
    transactions: s.transactions || [],
    mappedData: s.mappedData || [],
    vendorMaster: s.vendorMaster || [],
  }));

  const isInMode = mode === 'in';
  const isOutMode = mode === 'out';

  const canCreate = canAction('inout:create');
  const canDelete = canAction('inout:delete');
  const canBulk = canAction('inout:bulk');

  const pageTitle = isInMode ? '입고 관리' : isOutMode ? '출고 관리' : '입출고 관리';
  const pageIcon = isInMode ? '' : isOutMode ? '' : '';
  const pageDesc = isInMode
    ? '입고 기록을 등록하면 재고 수량이 자동으로 증가합니다.'
    : isOutMode
      ? '출고 기록을 등록하면 재고 수량이 자동으로 감소합니다.'
      : '입고와 출고를 기록하면 재고 수량이 자동으로 반영됩니다.';

  const {
    keyword, setKeyword,
    typeFilter, setTypeFilter,
    vendorFilter, setVendorFilter,
    dateFilter, setDateFilter,
    monthFilter, setMonthFilter,
    quick, sort, setSort,
    sorted, itemMap, wacMap, resolveItem, resolveWac,
    vendorOptions, quickChips,
    handleQuickChange, handleReset, toggleSort,
    inTotals, outTotals,
    statTotal, statToday, stat3,
    today,
  } = useInoutFilters({ transactions, mappedData, mode });

  const statTotalLabel = isInMode ? '전체 입고' : isOutMode ? '전체 출고' : '전체 기록';
  const statTodayLabel = isInMode ? '오늘 입고' : isOutMode ? '오늘 출고' : '오늘 입고';
  const stat3Label = isInMode ? '이번달 입고' : isOutMode ? '이번달 출고' : '오늘 출고';

  const [modal, setModal] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const tableRef = useRef(null);

  // ── 선택 ───────────────────────────────────────────────────────────────────
  const allOnPageSelected = sorted.length > 0 && sorted.every(tx => selectedIds.has(tx.id));

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) sorted.forEach(tx => next.delete(tx.id));
      else sorted.forEach(tx => next.add(tx.id));
      return next;
    });
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── 삭제 ───────────────────────────────────────────────────────────────────
  const handleDelete = (tx) => {
    if (!canDelete) { showToast('삭제 권한이 없습니다.', 'warning'); return; }
    if (!confirm(`이 ${tx.type === 'in' ? '입고' : '출고'} 기록을 삭제하시겠습니까?\n품목: ${tx.itemName}`)) return;
    deleteTransaction(tx.id);
    showToast('삭제되었습니다.', 'success');
  };

  const handleBulkDelete = () => {
    if (!canBulk) { showToast('일괄 삭제 권한이 없습니다. 매니저 이상만 가능합니다.', 'warning'); return; }
    if (!selectedIds.size) return;
    if (!confirm(`선택한 ${selectedIds.size}건의 기록을 삭제하시겠습니까?`)) return;
    const count = selectedIds.size;
    selectedIds.forEach(id => deleteTransaction(id));
    setSelectedIds(new Set());
    showToast(`${count}건 삭제 완료`, 'success');
  };

  // ── 엑셀 내보내기 ──────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!transactions.length) { showToast('내보낼 기록이 없습니다.', 'warning'); return; }
    const iMap = new Map(mappedData.map(it => [it.itemName, it]));
    let data, fileName;

    if (isInMode) {
      const list = transactions.filter(tx => tx.type === 'in');
      if (!list.length) { showToast('입고 기록이 없습니다.', 'warning'); return; }
      data = list.map(tx => {
        const it = resolveItem(tx);
        const qty = parseFloat(tx.quantity) || 0;
        const cost = parseFloat(tx.unitPrice) || 0;
        const supply = Math.round(cost * qty);
        const vat = Math.ceil(supply * 0.1);
        return {
          '자산': it.category || '', '입고일자': tx.date || '',
          '거래처': tx.vendor || '', '상품코드': tx.itemCode || it.itemCode || '',
          '품명': tx.itemName || '', '규격': it.spec || '', '단위': it.unit || '',
          '입고수량': qty, '원가': cost, '공급가액': supply, '부가세': vat, '합계금액': supply + vat,
        };
      });
      fileName = '입고관리';
    } else if (isOutMode) {
      const list = transactions.filter(tx => tx.type === 'out');
      if (!list.length) { showToast('출고 기록이 없습니다.', 'warning'); return; }
      data = list.map(tx => {
        const it = resolveItem(tx);
        const qty = parseFloat(tx.quantity) || 0;
        const salePrice = parseFloat(tx.sellingPrice || it.sellingPrice) || 0;
        const outAmt = Math.round(salePrice * qty);
        return {
          '자산': it.category || tx.category || '', '출고일자': tx.date || '',
          '거래처': tx.vendor || '', '상품코드': tx.itemCode || it.itemCode || '',
          '품명': tx.itemName || '', '규격': tx.spec || it.spec || '', '단위': tx.unit || it.unit || '',
          '출고수량': qty, '출고단가': salePrice, '판매가': outAmt,
          '출고합계': Math.round(outAmt * 1.1),
        };
      });
      fileName = '출고관리';
    } else {
      data = transactions.map(tx => {
        const it = resolveItem(tx);
        const qty = parseFloat(tx.quantity) || 0;
        const cost = parseFloat(tx.unitPrice) || 0;
        const supply = Math.round(cost * qty);
        const vat = tx.type === 'in' ? Math.ceil(supply * 0.1) : Math.floor(supply * 0.1);
        return {
          '구분': tx.type === 'in' ? '입고' : '출고',
          '날짜': tx.date || '', '거래처': tx.vendor || '',
          '품목명': tx.itemName || '', '품목코드': tx.itemCode || it.itemCode || '',
          '수량': qty, '원가': cost, '공급가액': supply, '부가세': vat, '합계금액': supply + vat,
        };
      });
      fileName = '입출고이력';
    }
    downloadExcel(data, fileName);
    showToast('엑셀로 내보냈습니다.', 'success');
  };

  // ── 등록 저장 ──────────────────────────────────────────────────────────────
  const handleSaveTx = (data) => {
    if (!canCreate) { showToast('등록 권한이 없습니다.', 'warning'); return; }
    addTransaction(data);
    showToast(`${data.type === 'in' ? '입고' : '출고'} 등록 완료!`, 'success');
    setModal(null);
  };

  useEffect(() => {
    if (tableRef.current) enableColumnResize(tableRef.current);
  }, [sorted]);

  // ── 배지 렌더 ──────────────────────────────────────────────────────────────
  const TypeBadge = ({ type }) => (
    <span style={{
      background: type === 'in' ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)',
      color: type === 'in' ? '#16a34a' : '#ef4444',
      padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
    }}>
      {type === 'in' ? '입고' : '출고'}
    </span>
  );

  // ── 렌더 ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* 페이지 헤더 */}
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="title-icon">{pageIcon}</span> {pageTitle}</h1>
          <div className="page-desc">{pageDesc}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={handleExport}> 이력 내보내기</button>
          {canBulk && (
            <button className="btn btn-outline" onClick={() => setModal({ type: 'bulk' })}> 엑셀 일괄 등록</button>
          )}
          {!isOutMode && (
            <button
              className="btn btn-success"
              onClick={() => {
                if (!canCreate) { showToast('등록 권한이 없습니다. 직원 이상만 가능합니다.', 'warning'); return; }
                setModal({ type: 'add', txType: 'in' });
              }}
            >
              + 입고 등록
            </button>
          )}
          {!isInMode && (
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!canCreate) { showToast('등록 권한이 없습니다. 직원 이상만 가능합니다.', 'warning'); return; }
                setModal({ type: 'add', txType: 'out' });
              }}
            >
              + 출고 등록
            </button>
          )}
        </div>
      </div>

      {/* KPI 통계 카드 */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">{statTotalLabel}</div>
          <div className="stat-value text-accent">{statTotal}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{statTodayLabel}</div>
          <div className={`stat-value ${isOutMode ? 'text-danger' : 'text-success'}`}>{statToday}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{stat3Label}</div>
          <div className={`stat-value ${isInMode ? 'text-success' : 'text-danger'}`}>{stat3}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">등록 품목 수</div>
          <div className="stat-value">{mappedData.length}</div>
        </div>
      </div>

      {/* 빠른 필터 칩 */}
      <div className="scan-mode-bar" style={{ marginBottom: '12px' }}>
        {quickChips.map(chip => (
          <button
            key={chip.value}
            className={`scan-mode-btn${quick === chip.value ? ' active' : ''}`}
            onClick={() => handleQuickChange(chip.value)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* 월 필터 칩 (대시보드 드릴다운 시 표시) */}
      {monthFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>필터 적용 중:</span>
          <span className="badge badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
             {monthFilter}
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}
              onClick={() => { setMonthFilter(''); }}
            ></button>
          </span>
        </div>
      )}

      {/* 검색 툴바 */}
      <div className="toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="품목명, 코드, 거래처 검색..."
          value={keyword}
          onChange={e => { setKeyword(e.target.value); }}
        />
        {!isInMode && !isOutMode && (
          <select
            className="filter-select"
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); }}
          >
            <option value="">전체</option>
            <option value="in">입고만</option>
            <option value="out">출고만</option>
          </select>
        )}
        <select
          className="filter-select"
          value={vendorFilter}
          onChange={e => { setVendorFilter(e.target.value); }}
        >
          <option value="">전체 거래처</option>
          {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <input
          type="date"
          className="filter-select"
          style={{ padding: '7px 10px' }}
          value={dateFilter}
          onChange={e => { setDateFilter(e.target.value); }}
        />
        <select
          className="filter-select"
          value={`${sort.key}:${sort.dir}`}
          onChange={e => {
            const [key, dir] = e.target.value.split(':');
            setSort({ key, dir });
          }}
        >
          <option value="date:desc">최신 날짜 순</option>
          <option value="date:asc">오래된 날짜 순</option>
          <option value="quantity:desc">수량 많은 순</option>
          <option value="quantity:asc">수량 적은 순</option>
          <option value="itemName:asc">품목명 가나다순</option>
          <option value="vendor:asc">거래처 가나다순</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={handleReset}>초기화</button>
      </div>

      {/* 필터 요약 */}
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', padding: '0 4px' }}>
        표시 {sorted.length}건 / 전체 {transactions.length}건
      </div>

      {/* 품목 없음 경고 */}
      {mappedData.length === 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '12px' }}>
          등록된 품목이 없습니다. 먼저 재고 현황에서 품목을 등록하거나 파일을 업로드해 주세요.
        </div>
      )}

      {/* 테이블 */}
      <div className="card card-flush">
        {/* 선택 액션 바 */}
        <div style={{
          padding: '10px 16px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-lighter)',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>선택 {selectedIds.size}건</div>
          {canBulk && (
            <button
              className="btn btn-danger btn-sm"
              disabled={selectedIds.size === 0}
              onClick={handleBulkDelete}
            >
              선택 삭제
            </button>
          )}
        </div>

        {sorted.length === 0 ? (
          <EmptyState
            icon=""
            msg={transactions.length === 0 ? '아직 입출고 기록이 없습니다.' : '검색 결과가 없습니다.'}
            sub={transactions.length === 0 ? '위 버튼으로 입고 또는 출고를 등록해 주세요.' : ''}
          />
        ) : (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table inv-table" ref={tableRef}>
              <thead>
                {isOutMode ? (
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center', textTransform: 'none' }}>
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} />
                    </th>
                    <th className="col-num" style={{ textTransform: 'none', fontSize: '13px' }}>#</th>
                    <SortTh sortKey="category" sort={sort} onSort={toggleSort}>자산</SortTh>
                    <SortTh sortKey="date" sort={sort} onSort={toggleSort}>출고일자</SortTh>
                    <SortTh sortKey="vendor" sort={sort} onSort={toggleSort}>거래처</SortTh>
                    <SortTh sortKey="itemCode" sort={sort} onSort={toggleSort}>상품코드</SortTh>
                    <SortTh sortKey="itemName" className="col-fill" sort={sort} onSort={toggleSort}>품명</SortTh>
                    <SortTh sortKey="color" sort={sort} onSort={toggleSort}>색상</SortTh>
                    <SortTh sortKey="spec" sort={sort} onSort={toggleSort}>규격</SortTh>
                    <SortTh sortKey="unit" sort={sort} onSort={toggleSort}>단위</SortTh>
                    <SortTh sortKey="quantity" className="text-right" sort={sort} onSort={toggleSort}>출고수량</SortTh>
                    {[
                      { key: 'sellingPrice', label: '출고단가' },
                      { key: 'outAmt',       label: '판매가'   },
                      { key: 'outVat',       label: '부가세'   },
                      { key: 'outTotal',     label: '출고합계' },
                      { key: 'profit',       label: '이익액'   },
                      { key: 'profitMargin', label: '이익률'   },
                    ].map(({ key, label }) => (
                      <SortTh key={key} sortKey={key} sort={sort} onSort={toggleSort} className="text-right" style={{
                        fontWeight: 700, fontSize: '11px', textTransform: 'none', whiteSpace: 'nowrap', minWidth: 72,
                      }}>{label}</SortTh>
                    ))}
                    <th style={{ textTransform: 'none', fontSize: '13px' }}>관리</th>
                  </tr>
                ) : (
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center', textTransform: 'none' }}>
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} />
                    </th>
                    <th className="col-num" style={{ textTransform: 'none', fontSize: '13px' }}>#</th>
                    {!isInMode && !isOutMode && <SortTh sortKey="type" sort={sort} onSort={toggleSort}>구분</SortTh>}
                    {isInMode ? (
                      <>
                        <SortTh sortKey="category" sort={sort} onSort={toggleSort} style={{ color: 'var(--text-muted)' }}>자산</SortTh>
                        <SortTh sortKey="date" sort={sort} onSort={toggleSort}>입고일자</SortTh>
                        <SortTh sortKey="vendor" sort={sort} onSort={toggleSort}>거래처</SortTh>
                        <SortTh sortKey="itemCode" sort={sort} onSort={toggleSort} style={{ color: 'var(--text-muted)' }}>상품코드</SortTh>
                        <SortTh sortKey="itemName" className="col-fill" sort={sort} onSort={toggleSort}>품명</SortTh>
                        <SortTh sortKey="color" sort={sort} onSort={toggleSort} style={{ color: 'var(--text-muted)' }}>색상</SortTh>
                        <SortTh sortKey="spec" sort={sort} onSort={toggleSort} style={{ color: 'var(--text-muted)' }}>규격</SortTh>
                        <SortTh sortKey="unit" sort={sort} onSort={toggleSort} style={{ color: 'var(--text-muted)' }}>단위</SortTh>
                        <SortTh sortKey="quantity" className="text-right" sort={sort} onSort={toggleSort}>입고수량</SortTh>
                        <SortTh sortKey="unitPrice" className="text-right" sort={sort} onSort={toggleSort}>매입원가</SortTh>
                        <SortTh sortKey="supply" className="text-right" sort={sort} onSort={toggleSort}>공급가액</SortTh>
                        <SortTh sortKey="vat" className="text-right" sort={sort} onSort={toggleSort}>부가세</SortTh>
                        <SortTh sortKey="totalPrice" className="text-right" sort={sort} onSort={toggleSort}>합계금액</SortTh>
                      </>
                    ) : (
                      <>
                        <SortTh sortKey="date" sort={sort} onSort={toggleSort}>날짜</SortTh>
                        <SortTh sortKey="vendor" sort={sort} onSort={toggleSort}>거래처</SortTh>
                        <SortTh sortKey="itemName" className="col-fill" sort={sort} onSort={toggleSort}>품목명</SortTh>
                        <SortTh sortKey="color" sort={sort} onSort={toggleSort} style={{ color: 'var(--text-muted)' }}>색상</SortTh>
                        <SortTh sortKey="quantity" className="text-right" sort={sort} onSort={toggleSort} style={{ color: 'var(--danger)', fontWeight: 700 }}>수량</SortTh>
                        <SortTh sortKey="unitPrice" className="text-right" sort={sort} onSort={toggleSort}>원가</SortTh>
                        <SortTh sortKey="sellingPrice" className="text-right" sort={sort} onSort={toggleSort} style={{ color: 'var(--success)', fontWeight: 700 }}>판매가</SortTh>
                        <SortTh sortKey="supply" className="text-right" sort={sort} onSort={toggleSort} style={{ fontWeight: 700 }}>금액</SortTh>
                        <SortTh sortKey="note" sort={sort} onSort={toggleSort} style={{ color: 'var(--text-muted)' }}>비고</SortTh>
                      </>
                    )}
                    <th style={{ textTransform: 'none', fontSize: '13px' }}>관리</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {sorted.map((tx, i) => {
                  const rowNum = i + 1;
                  const qty = parseFloat(tx.quantity) || 0;
                  const itemData = resolveItem(tx);
                  const unitPrice = parseFloat(tx.unitPrice || itemData.unitPrice) || 0;
                  const supply = Math.round(unitPrice * qty);
                  const vat = Math.ceil(supply * 0.1);
                  const totalPrice = supply + vat;
                  const salePrice = parseFloat(tx.sellingPrice || itemData.salePrice) || 0;
                  const outAmt = Math.round(salePrice * qty);
                  const wac = resolveWac(tx, itemData) || unitPrice;
                  const wacSupply = Math.round(wac * qty);
                  const profit = outAmt - wacSupply;
                  const category = tx.category || itemData.category || '';
                  const itemCode = tx.itemCode || itemData.itemCode || '';
                  const spec = tx.spec || itemData.spec || '';
                  const unit = tx.unit || itemData.unit || '';
                  const isSelected = selectedIds.has(tx.id);
                  return (
                    <tr key={tx.id} className={isSelected ? 'selected' : ''}>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(tx.id)} />
                      </td>
                      <td className="col-num">{rowNum}</td>
                      {!isInMode && !isOutMode && (
                        <td><TypeBadge type={tx.type} /></td>
                      )}
                      {isOutMode ? (
                        <>
                          <td style={{ fontSize: '12px' }}>{category || '-'}</td>
                          <td style={{ fontSize: '12px' }}>{formatDate(tx.date)}</td>
                          <td style={{ fontSize: '12px' }}>{tx.vendor || '-'}</td>
                          <td style={{ fontSize: '12px' }}>{itemCode || '-'}</td>
                          <td className="col-fill"><strong>{tx.itemName || '-'}</strong></td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx.color || itemData.color || '-'}</td>
                          <td style={{ fontSize: '12px' }}>{spec || '-'}</td>
                          <td style={{ fontSize: '12px' }}>{unit || '-'}</td>
                          <td className="text-right" style={{ fontWeight: 600 }}>
                            {qty ? qty.toLocaleString('ko-KR') : '-'}
                          </td>
                          {/* 판매 그룹 */}
                          <td className="text-right">{salePrice ? W(salePrice) : '-'}</td>
                          <td className="text-right">{outAmt ? W(outAmt) : '-'}</td>
                          <td className="text-right">{outAmt ? W(Math.round(outAmt * 0.1)) : '-'}</td>
                          <td className="text-right">{outAmt ? W(Math.round(outAmt * 1.1)) : '-'}</td>
                          <td className="text-right">{outAmt ? W(profit) : '-'}</td>
                          <td className="text-right">{outAmt > 0 ? (profit / outAmt * 100).toFixed(1) + '%' : '-'}</td>
                        </>
                      ) : isInMode ? (
                        <>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{category || '-'}</td>
                          <td style={{ fontSize: '13px' }}>{formatDate(tx.date)}</td>
                          <td style={{ fontSize: '13px' }}>{tx.vendor || '-'}</td>
                          <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{itemCode || '-'}</td>
                          <td className="col-fill"><strong>{tx.itemName || '-'}</strong></td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx.color || itemData.color || '-'}</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{spec || '-'}</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{unit || '-'}</td>
                          <td className="text-right" style={{ fontWeight: 600, fontSize: '13px' }}>
                            +{qty ? qty.toLocaleString('ko-KR') : '-'}
                          </td>
                          <td className="text-right" style={{ fontSize: '13px' }}>{unitPrice ? W(unitPrice) : '-'}</td>
                          <td className="text-right" style={{ fontSize: '13px' }}>{supply ? W(supply) : '-'}</td>
                          <td className="text-right" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{supply ? W(vat) : '-'}</td>
                          <td className="text-right" style={{ fontWeight: 700, fontSize: '13px' }}>{supply ? W(totalPrice) : '-'}</td>
                        </>
                      ) : (
                        <>
                          <td style={{ fontSize: '12px' }}>{formatDate(tx.date)}</td>
                          <td style={{ fontSize: '12px' }}>{tx.vendor || '-'}</td>
                          <td className="col-fill">
                            <strong>{tx.itemName || '-'}</strong>
                            {itemCode && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>{itemCode}</span>}
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx.color || itemData.color || '-'}</td>
                          <td className="text-right">
                            <span style={{ color: tx.type === 'in' ? '#16a34a' : '#ef4444', fontWeight: 600 }}>
                              {tx.type === 'in' ? '+' : '-'}{fmt(qty)}
                            </span>
                          </td>
                          <td className="text-right">{unitPrice ? W(unitPrice) : <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                          <td className="text-right">{salePrice ? W(salePrice) : <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                          <td className="text-right" style={{ fontWeight: 600 }}>{supply ? W(supply) : <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx.note || ''}</td>
                        </>
                      )}
                      <td>
                        {canDelete && (
                          <button
                            className="btn btn-xs btn-outline"
                            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                            onClick={() => handleDelete(tx)}
                          >
                            삭제
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {isInMode && inTotals && sorted.length > 0 && (() => {
                const S = { fontWeight: 700, padding: '8px 12px', borderTop: '2px solid var(--border-color,#333)' };
                return (
                  <tfoot>
                    <tr style={{ background: 'var(--bg-lighter)', fontWeight: 700 }}>
                      <td colSpan={10} className="text-right" style={{ ...S, color: 'var(--text-muted)', fontSize: '12px' }}>
                        합계 ({sorted.length.toLocaleString()}건)
                      </td>
                      <td className="text-right" style={{ ...S, fontSize: '13px' }}>
                        +{inTotals.totQty.toLocaleString('ko-KR')}
                      </td>
                      <td className="text-right" style={S}>-</td>
                      <td className="text-right" style={S}>{W(inTotals.totSupply)}</td>
                      <td className="text-right" style={{ ...S, color: 'var(--text-muted)' }}>{W(inTotals.totVat)}</td>
                      <td className="text-right" style={S}>{W(inTotals.totTotal)}</td>
                      <td style={S}></td>
                    </tr>
                  </tfoot>
                );
              })()}
              {isOutMode && outTotals && sorted.length > 0 && (() => {
                const S = { fontWeight: 700, padding: '8px 12px', borderTop: '2px solid var(--border-color,#333)' };
                return (
                  <tfoot>
                    <tr style={{ background: 'var(--bg-lighter)', fontWeight: 700 }}>
                      <td colSpan={11} className="text-right" style={{ ...S, color: 'var(--text-muted)', fontSize: '12px' }}>
                        합계 ({sorted.length.toLocaleString()}건)
                      </td>
                      <td className="text-right" style={{ ...S, fontWeight: 400 }}>-</td>
                      <td className="text-right" style={S}>{W(outTotals.totOutAmt)}</td>
                      <td className="text-right" style={S}>{W(outTotals.totVat)}</td>
                      <td className="text-right" style={S}>{W(outTotals.totOutTotal)}</td>
                      <td className="text-right" style={S}>{W(outTotals.totProfit)}</td>
                      <td className="text-right" style={{ ...S, fontSize: '12px' }}>{outTotals.totProfitMargin}</td>
                      <td style={S}></td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        )}

      </div>

      {/* 모달 */}
      {modal?.type === 'add' && (
        <TxModal
          txType={modal.txType}
          items={mappedData}
          vendors={vendorMaster}
          onClose={() => setModal(null)}
          onSave={handleSaveTx}
        />
      )}
      {modal?.type === 'bulk' && (
        <BulkUploadModal
          items={mappedData}
          modeDefault={isInMode ? 'in' : isOutMode ? 'out' : null}
          onClose={() => setModal(null)}
          onSuccess={() => {}}
        />
      )}
    </div>
  );
}

// 라우트별 래퍼
export function InPage() { return <InoutPage mode="in" />; }
export function OutPage() { return <InoutPage mode="out" />; }

export default InoutPage;
