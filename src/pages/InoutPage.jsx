/**
 * InoutPage.jsx - 입출고 관리 페이지
 * mode: 'all' | 'in' | 'out'
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel, downloadExcelSheets, readExcelFile } from '../excel.js';
import { canAction } from '../auth.js';
import { addTransaction, addTransactionsBulk, deleteTransaction, restoreTransaction } from '../store.js';
import { enableColumnResize } from '../ux-toolkit.js';

const PAGE_SIZE = 15;

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};
const fmt = v => (parseFloat(v) || 0).toLocaleString('ko-KR');
const W = v => (v ? `₩${Math.round(parseFloat(v)).toLocaleString('ko-KR')}` : '-');

function formatDate(dateStr) {
  if (!dateStr || dateStr === '-') return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

// ── 등록 모달 ─────────────────────────────────────────────────────────────────
function TxModal({ txType, items, vendors, onClose, onSave }) {
  const today = todayStr();
  const typeLabel = txType === 'in' ? '입고' : '출고';
  const partnerLabel = txType === 'in' ? '매입처' : '매출처';
  const filteredVendors = vendors.filter(v =>
    txType === 'in' ? v.type === 'supplier' : v.type === 'customer'
  );

  const [form, setForm] = useState({
    date: today,
    itemName: '',
    vendor: '',
    quantity: '',
    unitPrice: '',
    sellingPrice: '',
    note: '',
  });
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  const filteredItems = useMemo(() => {
    const q = itemSearch.toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      (it.itemName || '').toLowerCase().includes(q) ||
      (it.itemCode || '').toLowerCase().includes(q) ||
      (it.vendor || '').toLowerCase().includes(q)
    );
  }, [items, itemSearch]);

  const handleItemSelect = (e) => {
    const idx = e.target.value;
    if (idx === '') { setSelectedItem(null); setForm(f => ({ ...f, itemName: '' })); return; }
    const item = filteredItems[parseInt(idx, 10)];
    if (!item) return;
    setSelectedItem(item);
    setForm(f => ({
      ...f,
      itemName: item.itemName || '',
      unitPrice: item.unitPrice ? String(item.unitPrice) : f.unitPrice,
      sellingPrice: item.sellingPrice ? String(item.sellingPrice) : f.sellingPrice,
    }));
  };

  const projectedStock = useMemo(() => {
    if (!selectedItem) return null;
    const cur = parseFloat(selectedItem.quantity) || 0;
    const qty = parseFloat(form.quantity) || 0;
    return txType === 'in' ? cur + qty : Math.max(0, cur - qty);
  }, [selectedItem, form.quantity, txType]);

  const totalAmount = useMemo(() => {
    const qty = parseFloat(form.quantity) || 0;
    const price = parseFloat(form.unitPrice) || 0;
    return qty * price;
  }, [form.quantity, form.unitPrice]);

  const margin = useMemo(() => {
    const cost = parseFloat(form.unitPrice) || 0;
    const sell = parseFloat(form.sellingPrice) || 0;
    if (cost > 0 && sell > 0) return ((sell - cost) / cost * 100).toFixed(1);
    return null;
  }, [form.unitPrice, form.sellingPrice]);

  const handleSave = () => {
    const name = form.itemName.trim();
    const qty = parseFloat(form.quantity);
    if (!name) { showToast('품목명을 입력해 주세요.', 'warning'); return; }
    if (!qty || qty <= 0) { showToast('수량을 입력해 주세요.', 'warning'); return; }
    onSave({
      type: txType,
      itemName: name,
      itemCode: selectedItem?.itemCode || '',
      vendor: form.vendor.trim(),
      quantity: qty,
      unitPrice: parseFloat(form.unitPrice) || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
      note: form.note.trim(),
      date: form.date || today,
    });
  };

  // ESC 닫기
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{txType === 'in' ? '📥 입고 등록' : '📤 출고 등록'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '16px' }}>
            {/* 왼쪽: 입력 폼 */}
            <div>
              {/* 거래처 */}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label">{partnerLabel}</label>
                {filteredVendors.length > 0 ? (
                  <select className="form-select" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}>
                    <option value="">-- 거래처 선택 (선택 사항) --</option>
                    {filteredVendors.map(v => (
                      <option key={v.name} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                ) : (
                  <input className="form-input" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="거래처명 직접 입력" />
                )}
              </div>

              {/* 품목 선택 */}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label">품목 선택 <span style={{ color: 'var(--danger)' }}>*</span></label>
                {items.length > 0 ? (
                  <>
                    <input
                      className="form-input"
                      placeholder="품목명/코드 검색..."
                      value={itemSearch}
                      onChange={e => setItemSearch(e.target.value)}
                      style={{ marginBottom: '6px' }}
                    />
                    <select className="form-select" onChange={handleItemSelect}>
                      <option value="">-- 품목 선택 --</option>
                      {filteredItems.map((item, i) => (
                        <option key={i} value={i}>
                          {item.itemName}{item.itemCode ? ` (${item.itemCode})` : ''}{txType === 'out' ? ` [현재 ${parseFloat(item.quantity || 0)}]` : ''}
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      표시 {filteredItems.length}개 / 전체 {items.length}개
                    </div>
                  </>
                ) : (
                  <input
                    className="form-input"
                    value={form.itemName}
                    onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))}
                    placeholder="품목명을 직접 입력해 주세요"
                  />
                )}
              </div>

              {/* 수량 + 원가 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group">
                  <label className="form-label">수량 <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">원가 (매입단가)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={form.unitPrice}
                    onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))}
                    placeholder="선택 사항"
                  />
                </div>
              </div>

              {/* 판매가 */}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label">{txType === 'out' ? '출고단가 (판매가)' : '판매가'}</label>
                <input
                  className="form-input"
                  type="number"
                  value={form.sellingPrice}
                  onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))}
                  placeholder="선택 사항"
                />
              </div>

              {/* 날짜 + 메모 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">날짜 <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">메모</label>
                  <input
                    className="form-input"
                    value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="메모 (선택 사항)"
                  />
                </div>
              </div>
            </div>

            {/* 오른쪽: 요약 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="card" style={{ padding: '14px', margin: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px' }}>입력 요약</div>
                <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>선택 품목</div>
                  <div style={{ fontWeight: 600 }}>{form.itemName || '미선택'}</div>
                </div>
                {selectedItem && (
                  <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>현재 재고</div>
                    <div style={{ fontWeight: 600 }}>{fmt(selectedItem.quantity || 0)}</div>
                  </div>
                )}
                {projectedStock !== null && (
                  <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>반영 후 재고</div>
                    <div style={{ fontWeight: 700, color: projectedStock < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                      {fmt(projectedStock)}
                    </div>
                  </div>
                )}
                {totalAmount > 0 && (
                  <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>예상 금액</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{W(totalAmount)}</div>
                  </div>
                )}
                {margin !== null && (
                  <div style={{ fontSize: '13px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>이익률</div>
                    <div style={{ fontWeight: 700, color: parseFloat(margin) > 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {parseFloat(margin) > 0 ? '+' : ''}{margin}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 20px', borderTop: '1px solid var(--border-color)' }}>
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className={`btn ${txType === 'in' ? 'btn-success' : 'btn-danger'}`} onClick={handleSave}>
            {typeLabel} 저장
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 일괄 업로드 모달 ──────────────────────────────────────────────────────────
function BulkUploadModal({ items, modeDefault, onClose, onSuccess }) {
  const [previewRows, setPreviewRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const modalTitle = modeDefault === 'in' ? '엑셀 일괄 입고 등록'
    : modeDefault === 'out' ? '엑셀 일괄 출고 등록'
    : '엑셀 일괄 입출고 등록';

  const handleDownloadTemplate = () => {
    const today = todayStr();
    let rows, sheetName, fileName;
    if (modeDefault === 'out') {
      rows = [
        ['자산', '출고일자', '거래처', '상품코드', '품명', '규격', '단위', '출고수량', '출고단가'],
        ['전자기기', today, '강남점', 'SM-S925', '갤럭시 S25', '256GB 블랙', 'EA', 10, 1500000],
      ];
      sheetName = '출고_양식'; fileName = '출고_일괄등록_양식';
    } else {
      rows = [
        ['자산', '입고일자', '거래처', '상품코드', '품명', '규격', '단위', '입고수량', '단가'],
        ['전자기기', today, '(주)삼성전자', 'SM-S925', '갤럭시 S25', '256GB 블랙', 'EA', 100, 1200000],
      ];
      sheetName = '입고_양식'; fileName = '입고_일괄등록_양식';
    }
    downloadExcelSheets([{ name: sheetName, rows }], fileName);
    showToast(`${modeDefault === 'out' ? '출고' : '입고'} 양식을 내려받았습니다.`, 'success');
  };

  const processFile = async (file) => {
    setLoading(true); setError(''); setPreviewRows(null);
    try {
      const { sheets, sheetNames } = await readExcelFile(file);
      const sheetData = sheets[sheetNames[0]];
      if (!sheetData || sheetData.length < 2) {
        setError('데이터 행이 없습니다.'); setLoading(false); return;
      }
      const headerRow = sheetData[0];
      const headers = headerRow.map(h => String(h ?? '').trim());
      const findCol = (...names) => {
        for (const n of names) {
          const idx = headers.findIndex(h => h === n);
          if (idx >= 0) return idx;
        }
        return -1;
      };
      const colMap = {
        type: findCol('구분'),
        vendor: findCol('거래처', '매장명'),
        itemName: findCol('품명', '품목명'),
        itemCode: findCol('상품코드', '품목코드'),
        quantity: modeDefault === 'out'
          ? findCol('출고수량', '입고수량', '수량')
          : findCol('입고수량', '출고수량', '수량'),
        unitPrice: findCol('단가', '원가'),
        sellingPrice: findCol('판매가', '출고단가'),
        date: modeDefault === 'out'
          ? findCol('출고일자', '입고일자', '날짜')
          : findCol('입고일자', '출고일자', '날짜'),
        note: findCol('비고'),
        spec: findCol('규격'),
        unit: findCol('단위'),
        category: findCol('자산', '분류', '카테고리'),
      };
      if (colMap.itemName === -1 && colMap.itemCode === -1) {
        setError('품명 또는 상품코드 컬럼을 찾을 수 없습니다.'); setLoading(false); return;
      }
      if (colMap.quantity === -1) {
        setError('수량 컬럼을 찾을 수 없습니다.'); setLoading(false); return;
      }

      const parseBulkNumber = (v) => {
        const n = parseFloat(String(v ?? '').replace(/[₩,\s]/g, ''));
        return isFinite(n) ? n : 0;
      };
      const normType = (v) => {
        const s = String(v ?? '').trim().toLowerCase();
        if (['출고', '출', 'out', 'sale', 'sales', '판매', '매출'].includes(s)) return 'out';
        return 'in';
      };

      const rows = [];
      for (let i = 1; i < sheetData.length; i++) {
        const row = sheetData[i];
        if (!row || !row.length) continue;
        let itemName = colMap.itemName >= 0 ? String(row[colMap.itemName] ?? '').trim() : '';
        const rawItemCode = colMap.itemCode >= 0 ? String(row[colMap.itemCode] ?? '').trim() : '';
        const quantity = parseBulkNumber(row[colMap.quantity]);
        const matchedItem = items.find(it =>
          (itemName && it.itemName === itemName) || (rawItemCode && it.itemCode && it.itemCode === rawItemCode)
        );
        if (!itemName && matchedItem) itemName = matchedItem.itemName;
        if (!itemName || quantity <= 0) continue;

        let dateStr = '';
        if (colMap.date >= 0) {
          const raw = row[colMap.date];
          if (typeof raw === 'number') {
            dateStr = new Date((raw - 25569) * 86400 * 1000).toISOString().slice(0, 10);
          } else {
            dateStr = formatDate(String(raw ?? '').trim());
          }
        }

        rows.push({
          type: colMap.type >= 0 ? normType(row[colMap.type]) : (modeDefault ?? 'in'),
          vendor: colMap.vendor >= 0 ? String(row[colMap.vendor] ?? '').trim() : '',
          itemName,
          itemCode: rawItemCode || matchedItem?.itemCode || '',
          quantity,
          unitPrice: colMap.unitPrice >= 0 ? parseBulkNumber(row[colMap.unitPrice]) : 0,
          sellingPrice: colMap.sellingPrice >= 0 ? parseBulkNumber(row[colMap.sellingPrice]) : 0,
          date: dateStr || todayStr(),
          note: colMap.note >= 0 ? String(row[colMap.note] ?? '').trim() : '',
          spec: colMap.spec >= 0 ? String(row[colMap.spec] ?? '').trim() : (matchedItem?.spec || ''),
          unit: colMap.unit >= 0 ? String(row[colMap.unit] ?? '').trim() : (matchedItem?.unit || ''),
          category: colMap.category >= 0 ? String(row[colMap.category] ?? '').trim() : (matchedItem?.category || ''),
          matched: Boolean(matchedItem),
        });
      }
      if (!rows.length) { setError('유효한 데이터가 없습니다.'); setLoading(false); return; }
      setPreviewRows(rows);
    } catch (err) {
      setError(`파일 처리 중 오류: ${err.message}`);
    }
    setLoading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  };

  const handleConfirm = () => {
    if (!previewRows) return;
    addTransactionsBulk(previewRows.map(r => ({
      type: r.type, vendor: r.vendor, itemName: r.itemName, itemCode: r.itemCode,
      quantity: r.quantity, unitPrice: r.unitPrice, sellingPrice: r.sellingPrice,
      date: r.date, note: r.note, spec: r.spec, unit: r.unit, category: r.category,
    })));
    const inCount = previewRows.filter(r => r.type === 'in').length;
    const outCount = previewRows.filter(r => r.type === 'out').length;
    showToast(`일괄 등록 완료: 총 ${previewRows.length}건 (입고 ${inCount}, 출고 ${outCount})`, 'success');
    onSuccess();
    onClose();
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3 className="modal-title">📂 {modalTitle}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="alert alert-info" style={{ marginBottom: '16px', fontSize: '13px' }}>
            <strong>사용 방법</strong><br />
            1. 아래에서 샘플 양식을 내려받습니다.<br />
            2. 양식에 입고/출고 데이터를 입력합니다.<br />
            3. 저장한 엑셀 파일을 끌어놓거나 선택하면 미리보기 후 한 번에 등록할 수 있습니다.
          </div>
          <button className="btn btn-outline" onClick={handleDownloadTemplate} style={{ marginBottom: '16px' }}>
            📥 엑셀 양식 다운로드
          </button>

          {/* 드롭존 */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border-color)',
              borderRadius: '8px',
              padding: '32px',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📁</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>엑셀 파일을 끌어오거나 클릭해서 선택해 주세요</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>지원 형식: .xlsx, .xls</div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>

          {loading && <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>분석 중...</div>}
          {error && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{error}</div>}

          {/* 미리보기 */}
          {previewRows && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                <strong>분석 결과</strong>
                <span style={{ marginLeft: '8px', color: 'var(--success)' }}>입고 {previewRows.filter(r => r.type === 'in').length}건</span>
                <span style={{ marginLeft: '8px', color: 'var(--danger)' }}>출고 {previewRows.filter(r => r.type === 'out').length}건</span>
                {previewRows.filter(r => !r.matched).length > 0 && (
                  <span style={{ marginLeft: '8px', color: 'var(--warning)' }}>미매칭 {previewRows.filter(r => !r.matched).length}건</span>
                )}
              </div>
              <div className="table-wrapper" style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '12px' }}>
                <table className="data-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>구분</th><th>거래처</th><th>품목명</th>
                      <th className="text-right">수량</th><th className="text-right">원가</th>
                      <th>날짜</th><th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <span style={{
                            background: r.type === 'in' ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)',
                            color: r.type === 'in' ? '#16a34a' : '#ef4444',
                            padding: '2px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                          }}>
                            {r.type === 'in' ? '입고' : '출고'}
                          </span>
                        </td>
                        <td>{r.vendor || '-'}</td>
                        <td>{r.itemName}</td>
                        <td className="text-right">{fmt(r.quantity)}</td>
                        <td className="text-right">{r.unitPrice ? W(r.unitPrice) : '-'}</td>
                        <td>{r.date}</td>
                        <td>
                          {r.matched
                            ? <span style={{ color: 'var(--success)', fontSize: '11px' }}>매칭</span>
                            : <span style={{ color: 'var(--warning)', fontSize: '11px' }}>신규</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button className="btn btn-outline" onClick={() => setPreviewRows(null)}>취소</button>
                <button className="btn btn-primary" onClick={handleConfirm}>총 {previewRows.length}건 등록</button>
              </div>
            </div>
          )}
        </div>
      </div>
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
  const pageIcon = isInMode ? '📥' : isOutMode ? '📤' : '📦';
  const pageDesc = isInMode
    ? '입고 기록을 등록하면 재고 수량이 자동으로 증가합니다.'
    : isOutMode
      ? '출고 기록을 등록하면 재고 수량이 자동으로 감소합니다.'
      : '입고와 출고를 기록하면 재고 수량이 자동으로 반영됩니다.';

  // 필터 / 정렬 상태
  const initialQuick = isInMode ? 'in' : isOutMode ? 'out' : 'all';
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState(isInMode ? 'in' : isOutMode ? 'out' : '');
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [quick, setQuick] = useState(initialQuick);
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(1);

  // 모달
  const [modal, setModal] = useState(null); // null | { type: 'add', txType: 'in'|'out' } | { type: 'bulk' }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const tableRef = useRef(null);
  const outRow1Ref = useRef(null);
  const [outRow1H, setOutRow1H] = useState(36);

  const today = todayStr();
  const month = monthStr();
  const itemMap = useMemo(() => new Map(mappedData.map(it => [it.itemName, it])), [mappedData]);

  // 품목별 가중평균 매입원가 (입고 거래 기반)
  const wacMap = useMemo(() => {
    const acc = {};
    transactions.forEach(tx => {
      if (tx.type !== 'in') return;
      const k = tx.itemName; if (!k) return;
      if (!acc[k]) acc[k] = { amt: 0, qty: 0 };
      const qty = parseFloat(tx.quantity) || 0;
      const price = parseFloat(tx.unitPrice) || 0;
      acc[k].amt += price * qty;
      acc[k].qty += qty;
    });
    const result = {};
    Object.entries(acc).forEach(([k, v]) => {
      result[k] = v.qty > 0 && v.amt > 0 ? v.amt / v.qty : 0;
    });
    return result;
  }, [transactions]);

  // ── 파생 통계 ──────────────────────────────────────────────────────────────
  const inList = useMemo(() => transactions.filter(tx => tx.type === 'in'), [transactions]);
  const outList = useMemo(() => transactions.filter(tx => tx.type === 'out'), [transactions]);

  const statTotal = isInMode ? inList.length : isOutMode ? outList.length : transactions.length;
  const statTodayIn = useMemo(() => inList.filter(tx => tx.date === today).length, [inList, today]);
  const statTodayOut = useMemo(() => outList.filter(tx => tx.date === today).length, [outList, today]);
  const statToday = isInMode ? statTodayIn : isOutMode ? statTodayOut : statTodayIn;
  const statMonthIn = useMemo(() => inList.filter(tx => String(tx.date || '').startsWith(month)).length, [inList, month]);
  const statMonthOut = useMemo(() => outList.filter(tx => String(tx.date || '').startsWith(month)).length, [outList, month]);
  const stat3 = isInMode ? statMonthIn : isOutMode ? statMonthOut : statTodayOut;

  const statTotalLabel = isInMode ? '전체 입고' : isOutMode ? '전체 출고' : '전체 기록';
  const statTodayLabel = isInMode ? '오늘 입고' : isOutMode ? '오늘 출고' : '오늘 입고';
  const stat3Label = isInMode ? '이번달 입고' : isOutMode ? '이번달 출고' : '오늘 출고';

  // 거래처 옵션
  const vendorOptions = useMemo(() => {
    const set = new Set(transactions.map(tx => tx.vendor).filter(Boolean));
    return Array.from(set).sort();
  }, [transactions]);

  // ── 빠른 필터 칩 ───────────────────────────────────────────────────────────
  const quickChips = isInMode
    ? [
        { value: 'in', label: '전체 보기' },
        { value: 'today', label: '오늘 기록' },
        { value: 'recent3', label: '최근 3일' },
        { value: 'missingVendor', label: '거래처 미입력' },
      ]
    : isOutMode
      ? [
          { value: 'out', label: '전체 보기' },
          { value: 'today', label: '오늘 기록' },
          { value: 'recent3', label: '최근 3일' },
          { value: 'missingVendor', label: '거래처 미입력' },
        ]
      : [
          { value: 'all', label: '전체 보기' },
          { value: 'today', label: '오늘 기록' },
          { value: 'in', label: '입고만' },
          { value: 'out', label: '출고만' },
          { value: 'missingVendor', label: '거래처 미입력' },
          { value: 'recent3', label: '최근 3일' },
        ];

  const handleQuickChange = (val) => {
    setQuick(val);
    setPage(1);
    if (!isInMode && !isOutMode) {
      if (val === 'in') setTypeFilter('in');
      else if (val === 'out') setTypeFilter('out');
      else setTypeFilter('');
    }
    if (val === 'today') setDateFilter(today);
    else setDateFilter('');
  };

  // ── 필터링 + 정렬 ──────────────────────────────────────────────────────────
  const threeDaysAgo = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 2);
    return d.toISOString().slice(0, 10);
  }, []);

  const filtered = useMemo(() => {
    const kw = keyword.toLowerCase();
    return transactions.filter(tx => {
      if (kw && !(
        (tx.itemName || '').toLowerCase().includes(kw) ||
        (tx.itemCode || '').toLowerCase().includes(kw) ||
        (tx.vendor || '').toLowerCase().includes(kw)
      )) return false;
      if (typeFilter && tx.type !== typeFilter) return false;
      if (dateFilter && tx.date !== dateFilter) return false;
      if (vendorFilter && tx.vendor !== vendorFilter) return false;
      if (quick === 'today' && tx.date !== today) return false;
      if (quick === 'in' && tx.type !== 'in') return false;
      if (quick === 'out' && tx.type !== 'out') return false;
      if (quick === 'missingVendor' && String(tx.vendor || '').trim()) return false;
      if (quick === 'recent3' && String(tx.date || '') < threeDaysAgo) return false;
      return true;
    });
  }, [transactions, keyword, typeFilter, dateFilter, vendorFilter, quick, today, threeDaysAgo]);

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const aItem = itemMap.get(a.itemName) || {};
      const bItem = itemMap.get(b.itemName) || {};
      let av, bv;
      if (sort.key === 'date') {
        av = new Date(a.date || a.createdAt || 0).getTime();
        bv = new Date(b.date || b.createdAt || 0).getTime();
      } else if (sort.key === 'quantity') {
        av = parseFloat(a.quantity) || 0;
        bv = parseFloat(b.quantity) || 0;
      } else if (sort.key === 'unitPrice') {
        av = parseFloat(a.unitPrice || aItem.unitPrice) || 0;
        bv = parseFloat(b.unitPrice || bItem.unitPrice) || 0;
      } else if (sort.key === 'sellingPrice') {
        av = parseFloat(a.sellingPrice || aItem.salePrice) || 0;
        bv = parseFloat(b.sellingPrice || bItem.salePrice) || 0;
      } else if (sort.key === 'supply') {
        const aWac = wacMap[a.itemName] || (parseFloat(a.unitPrice || aItem.unitPrice) || 0);
        const bWac = wacMap[b.itemName] || (parseFloat(b.unitPrice || bItem.unitPrice) || 0);
        av = aWac * (parseFloat(a.quantity) || 0);
        bv = bWac * (parseFloat(b.quantity) || 0);
      } else if (sort.key === 'outAmt') {
        av = (parseFloat(a.sellingPrice || aItem.salePrice) || 0) * (parseFloat(a.quantity) || 0);
        bv = (parseFloat(b.sellingPrice || bItem.salePrice) || 0) * (parseFloat(b.quantity) || 0);
      } else if (sort.key === 'outTotal') {
        av = Math.round((parseFloat(a.sellingPrice || aItem.salePrice) || 0) * (parseFloat(a.quantity) || 0) * 1.1);
        bv = Math.round((parseFloat(b.sellingPrice || bItem.salePrice) || 0) * (parseFloat(b.quantity) || 0) * 1.1);
      } else if (sort.key === 'profit') {
        const aQty = parseFloat(a.quantity) || 0;
        const bQty = parseFloat(b.quantity) || 0;
        const aUp = parseFloat(a.unitPrice || aItem.unitPrice) || 0;
        const bUp = parseFloat(b.unitPrice || bItem.unitPrice) || 0;
        const aSp = parseFloat(a.sellingPrice || aItem.salePrice) || 0;
        const bSp = parseFloat(b.sellingPrice || bItem.salePrice) || 0;
        av = (aSp - aUp) * aQty;
        bv = (bSp - bUp) * bQty;
      } else if (sort.key === 'vat') {
        const aUp = parseFloat(a.unitPrice || aItem.unitPrice) || 0;
        const bUp = parseFloat(b.unitPrice || bItem.unitPrice) || 0;
        av = Math.floor(aUp * (parseFloat(a.quantity) || 0) * 0.1);
        bv = Math.floor(bUp * (parseFloat(b.quantity) || 0) * 0.1);
      } else if (sort.key === 'totalPrice') {
        const aUp = parseFloat(a.unitPrice || aItem.unitPrice) || 0;
        const bUp = parseFloat(b.unitPrice || bItem.unitPrice) || 0;
        const aSupply = Math.round(aUp * (parseFloat(a.quantity) || 0));
        const bSupply = Math.round(bUp * (parseFloat(b.quantity) || 0));
        av = aSupply + Math.floor(aSupply * 0.1);
        bv = bSupply + Math.floor(bSupply * 0.1);
      } else if (sort.key === 'profitMargin') {
        const aQty = parseFloat(a.quantity) || 0;
        const bQty = parseFloat(b.quantity) || 0;
        const aUp = parseFloat(a.unitPrice || aItem.unitPrice) || 0;
        const bUp = parseFloat(b.unitPrice || bItem.unitPrice) || 0;
        const aSp = parseFloat(a.sellingPrice || aItem.salePrice) || 0;
        const bSp = parseFloat(b.sellingPrice || bItem.salePrice) || 0;
        const aSupply = aUp * aQty; const aOut = aSp * aQty;
        const bSupply = bUp * bQty; const bOut = bSp * bQty;
        av = aOut > 0 ? (aOut - aSupply) / aOut * 100 : 0;
        bv = bOut > 0 ? (bOut - bSupply) / bOut * 100 : 0;
      } else if (sort.key === 'cogsMargin') {
        const aQty = parseFloat(a.quantity) || 0;
        const bQty = parseFloat(b.quantity) || 0;
        const aUp = parseFloat(a.unitPrice || aItem.unitPrice) || 0;
        const bUp = parseFloat(b.unitPrice || bItem.unitPrice) || 0;
        const aSp = parseFloat(a.sellingPrice || aItem.salePrice) || 0;
        const bSp = parseFloat(b.sellingPrice || bItem.salePrice) || 0;
        const aOut = aSp * aQty; const bOut = bSp * bQty;
        av = aOut > 0 ? aUp * aQty / aOut * 100 : 0;
        bv = bOut > 0 ? bUp * bQty / bOut * 100 : 0;
      } else if (sort.key === 'note') {
        av = (a.note || '').toLowerCase();
        bv = (b.note || '').toLowerCase();
      } else if (sort.key === 'itemName') {
        av = (a.itemName || '').toLowerCase();
        bv = (b.itemName || '').toLowerCase();
      } else if (sort.key === 'vendor') {
        av = (a.vendor || '').toLowerCase();
        bv = (b.vendor || '').toLowerCase();
      } else if (sort.key === 'category') {
        av = (a.category || aItem.category || '').toLowerCase();
        bv = (b.category || bItem.category || '').toLowerCase();
      } else if (sort.key === 'itemCode') {
        av = (a.itemCode || aItem.itemCode || '').toLowerCase();
        bv = (b.itemCode || bItem.itemCode || '').toLowerCase();
      } else if (sort.key === 'spec') {
        av = (a.spec || aItem.spec || '').toLowerCase();
        bv = (b.spec || bItem.spec || '').toLowerCase();
      } else if (sort.key === 'unit') {
        av = (a.unit || aItem.unit || '').toLowerCase();
        bv = (b.unit || bItem.unit || '').toLowerCase();
      } else {
        av = a[sort.key] || '';
        bv = b[sort.key] || '';
      }
      if (typeof av === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'ko-KR', { numeric: true }) * dir;
    });
  }, [filtered, sort, itemMap, wacMap]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageData = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // 출고 합계 (필터링된 전체 기준)
  const outTotals = useMemo(() => {
    if (!isOutMode) return null;
    let totQty = 0, totOutAmt = 0, totOutTotal = 0, totWacSupply = 0, totWacVat = 0, totWacTotal = 0, totProfit = 0;
    sorted.forEach(tx => {
      const q = parseFloat(tx.quantity) || 0;
      const itd = itemMap.get(tx.itemName) || {};
      const sp = parseFloat(tx.sellingPrice || itd.salePrice) || 0;
      const oa = Math.round(sp * q);
      const wac = wacMap[tx.itemName] || (parseFloat(tx.unitPrice || itd.unitPrice) || 0);
      const ws = Math.round(wac * q);
      totQty += q;
      totOutAmt += oa;
      totOutTotal += Math.round(oa * 1.1);
      totWacSupply += ws;
      totWacVat += Math.floor(ws * 0.1);
      totWacTotal += ws + Math.floor(ws * 0.1);
      totProfit += oa - ws;
    });
    return {
      totQty, totOutAmt, totOutTotal, totWacSupply, totWacVat, totWacTotal, totProfit,
      totProfitMargin: totOutAmt > 0 ? (totProfit / totOutAmt * 100).toFixed(1) + '%' : '-',
      totCogsMargin:   totOutAmt > 0 ? (totWacSupply / totOutAmt * 100).toFixed(1) + '%' : '-',
    };
  }, [sorted, isOutMode, itemMap, wacMap]);

  // ── 선택 ───────────────────────────────────────────────────────────────────
  const allOnPageSelected = pageData.length > 0 && pageData.every(tx => selectedIds.has(tx.id));

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) pageData.forEach(tx => next.delete(tx.id));
      else pageData.forEach(tx => next.add(tx.id));
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
    selectedIds.forEach(id => deleteTransaction(id));
    setSelectedIds(new Set());
    showToast(`${selectedIds.size}건 삭제 완료`, 'success');
  };

  // ── 엑셀 내보내기 ──────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!transactions.length) { showToast('내보낼 기록이 없습니다.', 'warning'); return; }
    const itemMap = new Map(mappedData.map(it => [it.itemName, it]));
    let data, fileName;

    if (isInMode) {
      const list = transactions.filter(tx => tx.type === 'in');
      if (!list.length) { showToast('입고 기록이 없습니다.', 'warning'); return; }
      data = list.map(tx => {
        const it = itemMap.get(tx.itemName) || {};
        const qty = parseFloat(tx.quantity) || 0;
        const cost = parseFloat(tx.unitPrice) || 0;
        const supply = Math.round(cost * qty);
        const vat = Math.floor(supply * 0.1);
        return {
          '자산': it.category || '', '입고일자': tx.date || '',
          '거래처': tx.vendor || '', '상품코드': tx.itemCode || it.itemCode || '',
          '품명': tx.itemName || '', '규격': it.spec || '', '단위': it.unit || '',
          '입고수량': qty, '단가': cost, '공급가액': supply, '부가세': vat, '합계금액': supply + vat,
        };
      });
      fileName = '입고관리';
    } else if (isOutMode) {
      const list = transactions.filter(tx => tx.type === 'out');
      if (!list.length) { showToast('출고 기록이 없습니다.', 'warning'); return; }
      data = list.map(tx => {
        const it = itemMap.get(tx.itemName) || {};
        const qty = parseFloat(tx.quantity) || 0;
        const cost = parseFloat(tx.unitPrice || it.unitPrice) || 0;
        const supply = Math.round(cost * qty);
        const vat = Math.floor(supply * 0.1);
        const salePrice = parseFloat(tx.sellingPrice || it.sellingPrice) || 0;
        const outAmt = Math.round(salePrice * qty);
        const profit = outAmt - supply;
        const profitRate = outAmt > 0 ? (profit / outAmt * 100).toFixed(1) + '%' : '';
        return {
          '자산': it.category || tx.category || '', '출고일자': tx.date || '',
          '거래처': tx.vendor || '', '상품코드': tx.itemCode || it.itemCode || '',
          '품명': tx.itemName || '', '규격': tx.spec || it.spec || '', '단위': tx.unit || it.unit || '',
          '출고수량': qty, '출고단가': salePrice, '판매가': outAmt,
          '출고합': Math.round(outAmt * 1.1), '매입원가': supply, '부가세': vat,
          '공가합': supply + vat, '이익액': profit, '이익률': profitRate,
        };
      });
      fileName = '출고관리';
    } else {
      data = transactions.map(tx => {
        const it = itemMap.get(tx.itemName) || {};
        const qty = parseFloat(tx.quantity) || 0;
        const cost = parseFloat(tx.unitPrice) || 0;
        const supply = Math.round(cost * qty);
        const vat = Math.floor(supply * 0.1);
        return {
          '구분': tx.type === 'in' ? '입고' : '출고',
          '날짜': tx.date || '', '거래처': tx.vendor || '',
          '품목명': tx.itemName || '', '품목코드': tx.itemCode || it.itemCode || '',
          '수량': qty, '단가': cost, '공급가액': supply, '부가세': vat, '합계금액': supply + vat,
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

  // 정렬 토글
  const toggleSort = (key) => {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: 'date', dir: 'desc' };
    });
    setPage(1);
  };

  const SortTh = ({ sortKey, children, className = '', rowSpan, colSpan, style = {} }) => {
    const isActive = sort.key === sortKey;
    const indicator = !isActive ? '↕' : sort.dir === 'asc' ? '↑' : '↓';
    return (
      <th
        rowSpan={rowSpan}
        colSpan={colSpan}
        className={`sortable-header ${isActive ? 'is-active' : ''} ${className}`}
        style={{ cursor: 'pointer', userSelect: 'none', verticalAlign: 'middle', ...style }}
        onClick={() => toggleSort(sortKey)}
      >
        {children} <span className="sort-indicator" style={{ fontSize: '10px', opacity: 0.6 }}>{indicator}</span>
      </th>
    );
  };

  // 출고 헤더 1행 높이 측정 (2행 sticky top 계산용)
  useEffect(() => {
    if (outRow1Ref.current && isOutMode) {
      const h = outRow1Ref.current.offsetHeight;
      if (h > 0) setOutRow1H(h);
    }
  }, [isOutMode, pageData]);

  // 컬럼 넓이 수동 조절
  useEffect(() => {
    if (tableRef.current) enableColumnResize(tableRef.current);
  }, [pageData]);

  // ── 리셋 ───────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setKeyword('');
    setTypeFilter(isInMode ? 'in' : isOutMode ? 'out' : '');
    setVendorFilter('');
    setDateFilter('');
    setQuick(initialQuick);
    setSort({ key: 'date', dir: 'desc' });
    setPage(1);
    showToast('필터와 정렬을 초기화했습니다.', 'info');
  };

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
          <button className="btn btn-outline" onClick={handleExport}>📊 이력 내보내기</button>
          {canBulk && (
            <button className="btn btn-outline" onClick={() => setModal({ type: 'bulk' })}>📂 엑셀 일괄 등록</button>
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

      {/* 검색 툴바 */}
      <div className="toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="품목명, 코드, 거래처 검색..."
          value={keyword}
          onChange={e => { setKeyword(e.target.value); setPage(1); }}
        />
        {!isInMode && !isOutMode && (
          <select
            className="filter-select"
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          >
            <option value="">전체</option>
            <option value="in">입고만</option>
            <option value="out">출고만</option>
          </select>
        )}
        <select
          className="filter-select"
          value={vendorFilter}
          onChange={e => { setVendorFilter(e.target.value); setPage(1); }}
        >
          <option value="">전체 거래처</option>
          {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <input
          type="date"
          className="filter-select"
          style={{ padding: '7px 10px' }}
          value={dateFilter}
          onChange={e => { setDateFilter(e.target.value); setPage(1); }}
        />
        <select
          className="filter-select"
          value={`${sort.key}:${sort.dir}`}
          onChange={e => {
            const [key, dir] = e.target.value.split(':');
            setSort({ key, dir }); setPage(1);
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
            icon="📭"
            msg={transactions.length === 0 ? '아직 입출고 기록이 없습니다.' : '검색 결과가 없습니다.'}
            sub={transactions.length === 0 ? '위 버튼으로 입고 또는 출고를 등록해 주세요.' : ''}
          />
        ) : (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table" ref={tableRef}>
              <thead>
                {isOutMode ? (
                  <>
                    <tr ref={outRow1Ref}>
                      <th rowSpan={2} style={{ width: '40px', textAlign: 'center', verticalAlign: 'middle', position: 'sticky', top: 0, zIndex: 4 }}>
                        <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} />
                      </th>
                      <th rowSpan={2} className="col-num" style={{ verticalAlign: 'middle', position: 'sticky', top: 0, zIndex: 4 }}>#</th>
                      <SortTh sortKey="category" rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 4 }}>자산</SortTh>
                      <SortTh sortKey="date" rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 4 }}>출고일자</SortTh>
                      <SortTh sortKey="vendor" rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 4 }}>거래처</SortTh>
                      <SortTh sortKey="itemCode" rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 4 }}>상품코드</SortTh>
                      <SortTh sortKey="itemName" className="col-fill" rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 4 }}>품명</SortTh>
                      <SortTh sortKey="spec" rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 4 }}>규격</SortTh>
                      <SortTh sortKey="unit" rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 4 }}>단위</SortTh>
                      <SortTh sortKey="quantity" className="text-right" rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 4 }}>출고수량</SortTh>
                      <th colSpan={3} style={{ textAlign: 'center', background: 'var(--primary,#2563eb)', color: '#fff', fontWeight: 700, padding: '6px', position: 'sticky', top: 0, zIndex: 4 }}>판매</th>
                      <th colSpan={3} style={{ textAlign: 'center', background: '#7c5e2e', color: '#fff', fontWeight: 700, padding: '6px', position: 'sticky', top: 0, zIndex: 4 }}>매입</th>
                      <th colSpan={3} style={{ textAlign: 'center', background: '#2a6b4a', color: '#fff', fontWeight: 700, padding: '6px', position: 'sticky', top: 0, zIndex: 4 }}>이익 분석</th>
                      <th rowSpan={2} style={{ verticalAlign: 'middle', position: 'sticky', top: 0, zIndex: 4 }}>관리</th>
                    </tr>
                    <tr>
                      <SortTh sortKey="sellingPrice" className="text-right" style={{ position: 'sticky', background: 'rgba(37,99,235,0.18)', color: 'inherit', top: outRow1H, zIndex: 3 }}>출고단가</SortTh>
                      <SortTh sortKey="outAmt" className="text-right" style={{ position: 'sticky', background: 'rgba(37,99,235,0.18)', color: 'inherit', top: outRow1H, zIndex: 3 }}>판매가</SortTh>
                      <SortTh sortKey="outTotal" className="text-right" style={{ position: 'sticky', background: 'rgba(37,99,235,0.18)', color: 'inherit', top: outRow1H, zIndex: 3 }}>출고합</SortTh>
                      <SortTh sortKey="supply" className="text-right" style={{ position: 'sticky', background: 'rgba(124,94,46,0.25)', color: 'inherit', top: outRow1H, zIndex: 3 }}>매입원가</SortTh>
                      <SortTh sortKey="vat" className="text-right" style={{ position: 'sticky', background: 'rgba(124,94,46,0.25)', color: 'inherit', top: outRow1H, zIndex: 3 }}>부가세</SortTh>
                      <SortTh sortKey="totalPrice" className="text-right" style={{ position: 'sticky', background: 'rgba(124,94,46,0.25)', color: 'inherit', top: outRow1H, zIndex: 3 }}>공가합</SortTh>
                      <SortTh sortKey="profit" className="text-right" style={{ position: 'sticky', background: 'rgba(42,107,74,0.22)', color: 'inherit', top: outRow1H, zIndex: 3 }}>이익액</SortTh>
                      <SortTh sortKey="profitMargin" className="text-right" style={{ position: 'sticky', background: 'rgba(42,107,74,0.22)', color: 'inherit', top: outRow1H, zIndex: 3 }}>이익율</SortTh>
                      <SortTh sortKey="cogsMargin" className="text-right" style={{ position: 'sticky', background: 'rgba(42,107,74,0.22)', color: 'inherit', top: outRow1H, zIndex: 3 }}>매출원가율</SortTh>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} />
                    </th>
                    <th className="col-num">#</th>
                    {!isInMode && !isOutMode && <SortTh sortKey="type">구분</SortTh>}
                    {isInMode ? (
                      <>
                        <SortTh sortKey="category">자산</SortTh>
                        <SortTh sortKey="date">입고일자</SortTh>
                        <SortTh sortKey="vendor">거래처</SortTh>
                        <SortTh sortKey="itemCode">상품코드</SortTh>
                        <SortTh sortKey="itemName" className="col-fill">품명</SortTh>
                        <SortTh sortKey="spec">규격</SortTh>
                        <SortTh sortKey="unit">단위</SortTh>
                        <SortTh sortKey="quantity" className="text-right">입고수량</SortTh>
                        <SortTh sortKey="unitPrice" className="text-right">단가</SortTh>
                        <SortTh sortKey="supply" className="text-right">공급가액</SortTh>
                        <SortTh sortKey="vat" className="text-right">부가세</SortTh>
                        <SortTh sortKey="totalPrice" className="text-right">합계금액</SortTh>
                      </>
                    ) : (
                      <>
                        <SortTh sortKey="date">날짜</SortTh>
                        <SortTh sortKey="vendor">거래처</SortTh>
                        <SortTh sortKey="itemName" className="col-fill">품목명</SortTh>
                        <SortTh sortKey="quantity" className="text-right">수량</SortTh>
                        <SortTh sortKey="unitPrice" className="text-right">원가</SortTh>
                        <SortTh sortKey="sellingPrice" className="text-right">판매가</SortTh>
                        <SortTh sortKey="supply" className="text-right">금액</SortTh>
                        <SortTh sortKey="note">비고</SortTh>
                      </>
                    )}
                    <th>관리</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {pageData.map((tx, i) => {
                  const rowNum = (safePage - 1) * PAGE_SIZE + i + 1;
                  const qty = parseFloat(tx.quantity) || 0;
                  const itemData = itemMap.get(tx.itemName) || {};
                  const unitPrice = parseFloat(tx.unitPrice || itemData.unitPrice) || 0;
                  const supply = Math.round(unitPrice * qty);        // 입고모드: 매입 공급가
                  const vat = Math.floor(supply * 0.1);
                  const totalPrice = supply + vat;
                  const salePrice = parseFloat(tx.sellingPrice || itemData.salePrice) || 0;
                  const outAmt = Math.round(salePrice * qty);
                  // 출고모드 매입 그룹: 가중평균 원가 우선, 없으면 단가 사용
                  const wac = wacMap[tx.itemName] || unitPrice;
                  const wacSupply = Math.round(wac * qty);
                  const wacVat = Math.floor(wacSupply * 0.1);
                  const wacTotal = wacSupply + wacVat;
                  const purchaseCost = wacSupply;
                  const profit = outAmt - purchaseCost;
                  const profitMargin = outAmt > 0 ? (profit / outAmt * 100).toFixed(1) + '%' : '';
                  const cogsMargin = outAmt > 0 ? (purchaseCost / outAmt * 100).toFixed(1) + '%' : '';
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
                          <td style={{ fontSize: '12px' }}>{spec || '-'}</td>
                          <td style={{ fontSize: '12px' }}>{unit || '-'}</td>
                          <td className="text-right" style={{ color: '#ef4444', fontWeight: 600 }}>
                            {qty ? qty.toLocaleString('ko-KR') : '-'}
                          </td>
                          {/* 판매 그룹 */}
                          <td className="text-right" style={{ background: 'rgba(37,99,235,0.07)' }}>{salePrice ? W(salePrice) : '-'}</td>
                          <td className="text-right" style={{ background: 'rgba(37,99,235,0.07)' }}>{outAmt ? W(outAmt) : '-'}</td>
                          <td className="text-right" style={{ background: 'rgba(37,99,235,0.07)' }}>{outAmt ? W(Math.round(outAmt * 1.1)) : '-'}</td>
                          {/* 매입 그룹 */}
                          <td className="text-right" style={{ background: 'rgba(124,94,46,0.1)' }}>{wacSupply ? W(wacSupply) : '-'}</td>
                          <td className="text-right" style={{ background: 'rgba(124,94,46,0.1)' }}>{wacSupply ? W(wacVat) : '-'}</td>
                          <td className="text-right" style={{ background: 'rgba(124,94,46,0.1)' }}>{wacSupply ? W(wacTotal) : '-'}</td>
                          {/* 이익 분석 그룹 */}
                          <td className="text-right" style={{ background: 'rgba(42,107,74,0.09)', color: profit > 0 ? 'var(--success)' : profit < 0 ? 'var(--danger)' : '' }}>
                            {outAmt ? W(profit) : '-'}
                          </td>
                          <td className="text-right" style={{ background: 'rgba(42,107,74,0.09)' }}>{profitMargin || '-'}</td>
                          <td className="text-right" style={{ background: 'rgba(42,107,74,0.09)' }}>{cogsMargin || '-'}</td>
                        </>
                      ) : isInMode ? (
                        <>
                          <td style={{ fontSize: '12px' }}>{category || '-'}</td>
                          <td style={{ fontSize: '12px' }}>{formatDate(tx.date)}</td>
                          <td style={{ fontSize: '12px' }}>{tx.vendor || '-'}</td>
                          <td style={{ fontSize: '12px' }}>{itemCode || '-'}</td>
                          <td className="col-fill"><strong>{tx.itemName || '-'}</strong></td>
                          <td style={{ fontSize: '12px' }}>{spec || '-'}</td>
                          <td style={{ fontSize: '12px' }}>{unit || '-'}</td>
                          <td className="text-right" style={{ color: '#16a34a', fontWeight: 600 }}>
                            +{qty ? qty.toLocaleString('ko-KR') : '-'}
                          </td>
                          <td className="text-right">{unitPrice ? W(unitPrice) : '-'}</td>
                          <td className="text-right">{supply ? W(supply) : '-'}</td>
                          <td className="text-right">{supply ? W(vat) : '-'}</td>
                          <td className="text-right">{supply ? W(totalPrice) : '-'}</td>
                        </>
                      ) : (
                        <>
                          <td style={{ fontSize: '12px' }}>{formatDate(tx.date)}</td>
                          <td style={{ fontSize: '12px' }}>{tx.vendor || '-'}</td>
                          <td className="col-fill">
                            <strong>{tx.itemName || '-'}</strong>
                            {itemCode && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>{itemCode}</span>}
                          </td>
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
              {isOutMode && outTotals && sorted.length > 0 && (() => {
                const S = { fontWeight: 700, padding: '8px 12px', borderTop: '2px solid var(--border-color,#333)' };
                return (
                  <tfoot>
                    <tr style={{ background: 'var(--bg-lighter)', fontWeight: 700 }}>
                      <td colSpan={10} className="text-right" style={{ ...S, color: 'var(--text-muted)', fontSize: '12px' }}>
                        합계 ({sorted.length.toLocaleString()}건)
                      </td>
                      <td className="text-right" style={{ ...S, background: 'rgba(37,99,235,0.1)' }}>-</td>
                      <td className="text-right" style={{ ...S, background: 'rgba(37,99,235,0.1)' }}>{W(outTotals.totOutAmt)}</td>
                      <td className="text-right" style={{ ...S, background: 'rgba(37,99,235,0.1)' }}>{W(outTotals.totOutTotal)}</td>
                      <td className="text-right" style={{ ...S, background: 'rgba(124,94,46,0.12)' }}>{W(outTotals.totWacSupply)}</td>
                      <td className="text-right" style={{ ...S, background: 'rgba(124,94,46,0.12)' }}>{W(outTotals.totWacVat)}</td>
                      <td className="text-right" style={{ ...S, background: 'rgba(124,94,46,0.12)' }}>{W(outTotals.totWacTotal)}</td>
                      <td className="text-right" style={{ ...S, background: 'rgba(42,107,74,0.12)', color: outTotals.totProfit > 0 ? 'var(--success)' : outTotals.totProfit < 0 ? 'var(--danger)' : '' }}>
                        {W(outTotals.totProfit)}
                      </td>
                      <td className="text-right" style={{ ...S, background: 'rgba(42,107,74,0.12)' }}>{outTotals.totProfitMargin}</td>
                      <td className="text-right" style={{ ...S, background: 'rgba(42,107,74,0.12)' }}>{outTotals.totCogsMargin}</td>
                      <td style={S}></td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {sorted.length > 0 && (
          <div className="pagination">
            <span>
              {sorted.length}건 중 {(safePage - 1) * PAGE_SIZE + 1}~{Math.min(safePage * PAGE_SIZE, sorted.length)}
            </span>
            <div className="pagination-btns">
              <button
                className="page-btn"
                disabled={safePage <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                이전
              </button>
              <span style={{ padding: '4px 8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                {safePage} / {totalPages}
              </span>
              <button
                className="page-btn"
                disabled={safePage >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                다음
              </button>
            </div>
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
