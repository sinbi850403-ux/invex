/**
 * InventoryPage.jsx - 재고 현황
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';
import { generateInventoryPDF } from '../pdf-generator.js';
import { canAction } from '../auth.js';
import { deleteItem, rebuildInventoryFromTransactions, getState as getRawState } from '../store.js';
import { enableColumnResize } from '../ux-toolkit.js';
import { ALL_FIELDS, FOCUS_CHIPS, SORT_OPTIONS, MONEY_KEYS, NUM_KEYS, toNum, fmt, formatCell } from '../domain/inventoryConfig.js';
import { computeData, getVisibleFields, applyFilters, applySort } from '../domain/inventoryCompute.js';
import { ItemModal } from '../components/inventory/ItemModal.jsx';
import { ColumnPanel } from '../components/inventory/ColumnPanel.jsx';
import { enrichItemsWithQty } from '../domain/inventoryStockCalc.js';
import AIAnalysisPanel from '../components/AIAnalysisPanel.jsx';
import { buildInventoryPrompt } from '../ai-report.js';

export default function InventoryPage() {
  const navigate = useNavigate();
  const [state, setState] = useStore();
  const [itemStocks] = useStore(s => s.itemStocks || []);

  const canEdit   = canAction('item:edit');
  const canDelete = canAction('item:delete');
  const canCreate = canAction('item:create');
  const canBulk   = canAction('item:bulk');

  const tableRef = useRef(null);
  const prefsTimerRef = useRef(null);

  const savedPrefs = state.inventoryViewPrefs || {};
  const [filter, setFilterRaw] = useState({
    keyword: '', category: '', warehouse: '', stock: '', itemCode: '', vendor: '', focus: 'all',
    ...((savedPrefs.filter) || {}),
  });
  const [sort, setSort]         = useState(savedPrefs.sort || { key: '', direction: '' });
  const [modal, setModal]       = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [colPanel, setColPanel]       = useState(false);
  const [deleting, setDeleting]       = useState(null);

  const setFilter = useCallback(patch => setFilterRaw(prev => ({ ...prev, ...patch })), []);

  // 대시보드 드릴다운 필터 주입
  useEffect(() => {
    const kw = sessionStorage.getItem('invex:inventory-search');
    if (kw) { sessionStorage.removeItem('invex:inventory-search'); setFilter({ keyword: kw }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 뷰 설정 자동저장 (debounce 300ms)
  useEffect(() => {
    clearTimeout(prefsTimerRef.current);
    prefsTimerRef.current = setTimeout(() => {
      setState({ inventoryViewPrefs: { filter, sort } });
    }, 300);
    return () => clearTimeout(prefsTimerRef.current);
  }, [filter, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  // 고아 품목 자동 재계산
  useEffect(() => {
    const st = getRawState();
    const txs    = st.transactions || [];
    const mapped = st.mappedData   || [];
    const keys   = new Set(mapped.map(d => (d.itemCode ? String(d.itemCode) : String(d.itemName || '')).trim()));
    const hasOrphaned = txs.some(tx => {
      const k = (tx.itemCode ? String(tx.itemCode) : String(tx.itemName || '')).trim();
      return k && !keys.has(k);
    });
    if (hasOrphaned) rebuildInventoryFromTransactions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rawData      = state.mappedData   || [];
  const transactions = state.transactions || [];
  const safetyStock  = state.safetyStock  || {};
  const visibleCols  = state.visibleColumns;

  const enrichedData = useMemo(() => enrichItemsWithQty(rawData, itemStocks), [rawData, itemStocks]);
  const data     = useMemo(() => computeData(enrichedData, transactions), [enrichedData, transactions]);
  const filtered = useMemo(() => applyFilters(data, safetyStock, filter), [data, safetyStock, filter]);
  const sorted   = useMemo(() => applySort(filtered, sort), [filtered, sort]);

  useEffect(() => { if (tableRef.current) enableColumnResize(tableRef.current); }, [sorted]);

  const activeFields       = useMemo(() => getVisibleFields(data, visibleCols), [data, visibleCols]);
  const allAvailableFields = useMemo(() => ALL_FIELDS.filter(f => data.some(row => row[f.key] !== '' && row[f.key] != null)), [data]);

  const stats = useMemo(() => ({
    total:    data.length,
    qty:      Math.round(data.reduce((s, r) => s + toNum(r.quantity), 0)).toLocaleString('ko-KR'),
    supply:   fmt(data.reduce((s, r) => s + toNum(r.supplyValue), 0)),
    vat:      fmt(data.reduce((s, r) => s + toNum(r.vat), 0)),
    price:    fmt(data.reduce((s, r) => s + toNum(r.totalPrice), 0)),
    warnings: data.filter(r => { const min = safetyStock[r.itemName]; return min != null && toNum(r.quantity) <= min; }).length,
  }), [data, safetyStock]);

  const inventoryAiPrompt = useMemo(() => {
    if (data.length === 0) return null;
    const totalValue = data.reduce((s, r) => s + toNum(r.totalPrice || r.supplyValue), 0);
    const lowStockCount = data.filter(r => { const min = safetyStock[r.itemName]; return min != null && toNum(r.quantity) <= min; }).length;
    const zeroStockCount = data.filter(r => toNum(r.quantity) <= 0).length;
    const topValueItems = [...data].sort((a,b)=>toNum(b.totalPrice||b.supplyValue)-toNum(a.totalPrice||a.supplyValue)).slice(0,5).map(r=>[r.itemName||'-', toNum(r.totalPrice||r.supplyValue)]);
    const catMap = {};
    data.forEach(r => { const c = r.category || '미분류'; catMap[c] = (catMap[c]||0)+1; });
    const categoryStats = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
    // 30일 이상 입출고 없는 품목 = 체류재고 (transactions 기준)
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate()-30);
    const activeItems = new Set((transactions||[]).filter(t=>t.date && new Date(t.date)>=thirtyDaysAgo).map(t=>t.itemName));
    const deadStockCount = data.filter(r => toNum(r.quantity)>0 && !activeItems.has(r.itemName)).length;
    return buildInventoryPrompt({ totalItems: data.length, totalValue, lowStockCount, zeroStockCount, topValueItems, categoryStats, deadStockCount });
  }, [data, safetyStock, transactions]);

  const categories = useMemo(() => [...new Set(data.map(r => r.category).filter(Boolean))].sort(), [data]);
  const warehouses = useMemo(() => [...new Set(data.map(r => r.warehouse).filter(Boolean))].sort(), [data]);
  const itemCodes  = useMemo(() => [...new Set(data.map(r => r.itemCode).filter(Boolean))].sort(), [data]);
  const vendors    = useMemo(() => [...new Set(data.map(r => r.vendor).filter(Boolean))].sort(), [data]);

  function toggleSort(key) {
    setSort(prev => {
      if (prev.key === key) return prev.direction === 'asc' ? { key, direction: 'desc' } : { key: '', direction: '' };
      return { key, direction: 'asc' };
    });
  }
  const sortIndicator = key => sort.key !== key ? ' ↕' : sort.direction === 'asc' ? ' ↑' : ' ↓';

  function toggleSelect(idx) {
    setSelected(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  }
  function toggleSelectAll() {
    const allIdxs = sorted.map((_, i) => i);
    const allSel  = allIdxs.every(i => selected.has(i));
    setSelected(prev => { const next = new Set(prev); allIdxs.forEach(i => allSel ? next.delete(i) : next.add(i)); return next; });
  }

  function handleDelete(idx) {
    deleteItem(idx);
    showToast('품목이 삭제되었습니다.', 'success');
    setDeleting(null);
    setSelected(prev => { const next = new Set(prev); next.delete(idx); return next; });
  }
  function handleBulkDelete() {
    const idxs = [...selected].sort((a, b) => b - a);
    idxs.forEach(i => deleteItem(i));
    showToast(`${idxs.length}개 품목이 삭제되었습니다.`, 'success');
    setSelected(new Set());
    setDeleting(null);
  }

  function handleExportExcel() {
    const rows = (filter.keyword || filter.category || filter.focus !== 'all' ? filtered : data).map(row => {
      const r = {}; ALL_FIELDS.forEach(f => { r[f.label] = row[f.key] ?? ''; }); return r;
    });
    downloadExcel(rows, '재고현황');
    showToast('엑셀로 내보냈습니다.', 'success');
  }
  async function handleExportPDF() {
    try { await generateInventoryPDF(filtered.length ? filtered : data); showToast('PDF를 생성했습니다.', 'success'); }
    catch (e) { showToast('PDF 생성 실패: ' + e.message, 'error'); }
  }

  const allPageSelected = sorted.length > 0 && sorted.every((_, i) => selected.has(i));

  // ── 빈 상태 ────────────────────────────────────────────────────────────────
  if (data.length === 0) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title"> 재고 현황</h1>
            <div className="page-desc">품목별 재고 수량과 금액을 관리합니다.</div>
          </div>
          <div className="page-actions">
            {canCreate && <button className="btn btn-primary" onClick={() => setModal({ type: 'add' })}>+ 품목 추가</button>}
          </div>
        </div>
        <div className="card">
          <div className="empty-state">
            <div className="icon"></div>
            <div className="msg">아직 등록된 품목이 없습니다</div>
            <div className="sub">엑셀 파일을 업로드하거나 품목을 직접 등록해 주세요.</div>
          </div>
        </div>
        {modal && <ItemModal item={null} editIdx={null} onClose={() => setModal(null)} onSaved={() => setModal(null)} />}
      </div>
    );
  }

  // ── 렌더 ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* 헤더 */}
      <div className="page-header">
        <div>
          <h1 className="page-title"> 재고 현황</h1>
          <div className="page-desc">{state.fileName ? ` ${state.fileName} ` : ''}총 {data.length}개 품목</div>
        </div>
        <div className="page-actions">
          {canBulk && (
            <button className="btn btn-outline" onClick={() => { rebuildInventoryFromTransactions(); showToast('재고 재계산 완료', 'success'); }}>
               재고 재계산
            </button>
          )}
          <button className="btn btn-outline" onClick={handleExportExcel}> 엑셀</button>
          <button className="btn btn-outline" onClick={handleExportPDF}> PDF</button>
          {canCreate && <button className="btn btn-primary" onClick={() => setModal({ type: 'add' })}>+ 품목 추가</button>}
        </div>
      </div>

      {/* AI 재고 분석 */}
      {inventoryAiPrompt && (
        <AIAnalysisPanel {...inventoryAiPrompt} title="AI 재고 분석" buttonLabel="AI 재고 분석" />
      )}

      {/* KPI */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-label">전체 품목</div><div className="stat-value text-accent">{stats.total}</div></div>
        <div className="stat-card"><div className="stat-label">총 수량</div><div className="stat-value text-accent">{stats.qty}</div></div>
        <div className="stat-card"><div className="stat-label">공급가액 합계</div><div className="stat-value text-accent">{stats.supply}</div></div>
        <div className="stat-card"><div className="stat-label">부가세 합계</div><div className="stat-value text-accent">{stats.vat}</div></div>
        <div className="stat-card"><div className="stat-label">합계금액</div><div className="stat-value text-success">{stats.price}</div></div>
        <div
          className="stat-card"
          style={stats.warnings > 0 ? { cursor: 'pointer' } : {}}
          onClick={stats.warnings > 0 ? () => navigate('/orders') : undefined}
          title={stats.warnings > 0 ? '발주 관리로 이동' : ''}
        >
          <div className="stat-label">재고 부족 경고</div>
          <div className={`stat-value${stats.warnings > 0 ? ' text-danger' : ''}`}>{stats.warnings > 0 ? `${stats.warnings}건 ↗` : '없음'}</div>
          {stats.warnings > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>클릭 → 발주 관리</div>}
        </div>
      </div>

      {/* 필터 */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {FOCUS_CHIPS.map(chip => (
            <button key={chip.value} className={`btn btn-sm ${filter.focus === chip.value ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter({ focus: chip.value })}>
              {chip.label}
            </button>
          ))}
        </div>
        <div className="toolbar">
          <input
            type="text" className="search-input"
            placeholder="스마트 검색: 품목명, 분류:식품, 창고:본사, 재고>=10, 부족, 품절"
            title={"스마트 검색 문법\n품목명 자유 입력\n분류:식품 — 카테고리 일치\n창고:본사 — 창고 일치\n재고>=10 — 수량 이상\n재고<=5 — 수량 이하\n부족 — 안전재고 미달\n품절 — 수량 = 0\n거래처없음 — 거래처 미입력\n창고없음 — 창고 미입력\n여러 조건은 공백으로 구분"}
            value={filter.keyword} onChange={e => setFilter({ keyword: e.target.value })}
          />
          <button className="filter-toggle-btn" onClick={() => setShowFilters(p => !p)}> 상세 필터</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setFilter({ keyword: '', category: '', warehouse: '', stock: '', itemCode: '', vendor: '', focus: 'all' })}>초기화</button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setColPanel(p => !p)}>표시 항목 설정</button>
            {colPanel && (
              <ColumnPanel
                fields={allAvailableFields} activeFields={activeFields}
                onApply={cols => { setState({ visibleColumns: cols }); setColPanel(false); showToast('표시 항목이 변경되었습니다.', 'success'); }}
                onClose={() => setColPanel(false)}
              />
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>빠른 검색</span>
          {['부족', '품절', '거래처없음', '위치없음', '재고>=10'].map(q => (
            <button key={q} className="btn btn-ghost btn-sm" onClick={() => setFilter({ keyword: q })}>{q}</button>
          ))}
        </div>
        {showFilters && (
          <div className="filter-detail-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <select className="filter-select" value={filter.itemCode} onChange={e => setFilter({ itemCode: e.target.value })}>
              <option value="">전체 품목코드</option>
              {itemCodes.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="filter-select" value={filter.vendor} onChange={e => setFilter({ vendor: e.target.value })}>
              <option value="">전체 거래처</option>
              {vendors.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="filter-select" value={filter.category} onChange={e => setFilter({ category: e.target.value })}>
              <option value="">전체 분류</option>
              {categories.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="filter-select" value={filter.warehouse} onChange={e => setFilter({ warehouse: e.target.value })}>
              <option value="">전체 창고</option>
              {warehouses.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="filter-select" value={filter.stock} onChange={e => setFilter({ stock: e.target.value })}>
              <option value="">전체 재고</option>
              <option value="low">부족 항목만</option>
            </select>
            <select
              className="filter-select"
              value={sort.key && sort.direction ? `${sort.key}:${sort.direction}` : 'default'}
              onChange={e => {
                const v = e.target.value;
                if (v === 'default') setSort({ key: '', direction: '' });
                else { const [k, d] = v.split(':'); setSort({ key: k, direction: d }); }
              }}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        {filtered.length !== data.length && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{data.length}개 중 {filtered.length}개 표시</div>
        )}
      </div>

      {/* 일괄 작업 바 */}
      {selected.size > 0 && (
        <div className="card inventory-bulk-bar" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="inventory-bulk-count">선택 {selected.size}개</span>
          <button className="btn btn-outline btn-sm" onClick={() => {
            const rows = [...selected].map(i => { const r = {}; ALL_FIELDS.forEach(f => { r[f.label] = data[i]?.[f.key] ?? ''; }); return r; });
            downloadExcel(rows, '재고현황_선택');
          }}>선택 엑셀 내보내기</button>
          {canDelete && <button className="btn btn-danger btn-sm" onClick={() => setDeleting('bulk')}>선택 삭제</button>}
        </div>
      )}

      {/* 테이블 */}
      <div className="card card-flush">
        <div className="table-wrapper">
          <table className="data-table inv-table" ref={tableRef}>
            <thead>
              <tr>
                {canDelete && <th style={{ width: 32 }}><input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} /></th>}
                <th style={{ width: 40 }}>#</th>
                {activeFields.map(key => {
                  const f = ALL_FIELDS.find(x => x.key === key);
                  return (
                    <th key={key} className={f?.numeric ? 'text-right' : ''} style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(key)}>
                      {f?.label}{sortIndicator(key)}
                    </th>
                  );
                })}
                {(canEdit || canDelete) && <th>관리</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={activeFields.length + 3} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>검색 결과가 없습니다</td></tr>
              ) : sorted.map((row, i) => {
                const isLow = safetyStock[row.itemName] != null && toNum(row.quantity) <= safetyStock[row.itemName];
                return (
                  <tr key={row.itemCode || row.itemName || i} className={isLow ? 'row-warning' : ''}>
                    {canDelete && <td><input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelect(i)} /></td>}
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                    {activeFields.map(key => {
                      const f = ALL_FIELDS.find(x => x.key === key);
                      const val = formatCell(key, row[key]);
                      return (
                        <td key={key} className={f?.numeric ? 'text-right' : ''}>
                          {isLow && key === 'quantity' ? <span style={{ color: 'var(--danger)' }}> {val}</span> : val}
                        </td>
                      );
                    })}
                    {(canEdit || canDelete) && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'edit', idx: i })}>수정</button>}
                          {canDelete && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleting(i)}>삭제</button>}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        표시 항목 설정 버튼으로 보고 싶은 열만 선택해 주세요.
      </div>

      {/* 품목 추가/수정 모달 */}
      {modal && (
        <ItemModal
          item={modal.type === 'edit' ? data[modal.idx] : null}
          editIdx={modal.type === 'edit' ? modal.idx : null}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}

      {/* 삭제 확인 모달 */}
      {deleting != null && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleting(null); }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">삭제 확인</h3>
              <button className="modal-close" onClick={() => setDeleting(null)} />
            </div>
            <div className="modal-body">
              {deleting === 'bulk'
                ? <p>{selected.size}개 품목을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
                : <p>"{data[deleting]?.itemName}" 품목을 삭제하시겠습니까?</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDeleting(null)}>취소</button>
              <button className="btn btn-danger" onClick={() => deleting === 'bulk' ? handleBulkDelete() : handleDelete(deleting)}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
