/**
 * InoutPage.jsx - 입출고 관리 페이지
 * mode: 'all' | 'in' | 'out'
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';
import { canAction } from '../auth.js';
import { enableColumnResize } from '../ux-toolkit.js';
import { normalizeCurrency } from '../utils/formatters.js';
import { TxModal } from '../components/inout/TxModal.jsx';
import { BulkUploadModal } from '../components/inout/BulkUploadModal.jsx';
import { InoutTable } from '../components/inout/InoutTable.jsx';
import { useInoutFilters } from '../hooks/useInoutFilters.js';
import { createTransaction, removeTransaction, removeBulkTransactions } from '../services/inoutService.js';

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
    removeTransaction(tx, canDelete);
  };

  const handleBulkDelete = async () => {
    const deleted = await removeBulkTransactions(selectedIds, canBulk);
    if (deleted) setSelectedIds(new Set());
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
        const cost = normalizeCurrency(tx.unitPrice);
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
        const salePrice = normalizeCurrency(tx.sellingPrice || it.sellingPrice);
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
        const cost = normalizeCurrency(tx.unitPrice);
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
    const ok = createTransaction(data, canCreate);
    if (ok) setModal(null);
  };

  useEffect(() => {
    if (tableRef.current) enableColumnResize(tableRef.current);
  }, [sorted]);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>선택 {selectedIds.size}건</div>
          </div>
          <div>
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
        </div>

        {sorted.length === 0 ? (
          <EmptyState
            icon=""
            msg={transactions.length === 0 ? '아직 입출고 기록이 없습니다.' : '검색 결과가 없습니다.'}
            sub={transactions.length === 0 ? '위 버튼으로 입고 또는 출고를 등록해 주세요.' : ''}
          />
        ) : (
          <InoutTable
            mode={mode}
            sorted={sorted}
            sort={sort}
            onSort={toggleSort}
            selectedIds={selectedIds}
            onSelectAll={toggleSelectAll}
            onSelect={toggleSelect}
            canDelete={canDelete}
            resolveItem={resolveItem}
            resolveWac={resolveWac}
            onDelete={handleDelete}
            inTotals={inTotals}
            outTotals={outTotals}
            tableRef={tableRef}
          />
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
