import React, { useState, useMemo, useEffect } from 'react';
import { showToast } from '../../toast.js';
import { fmtNum as fmt, fmtWon as W } from '../../utils/formatters.js';

const todayStr = () => new Date().toISOString().slice(0, 10);

export function TxModal({ txType, items, vendors, onClose, onSave }) {
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
    if (cost > 0 && sell > 0) return ((sell - cost) / sell * 100).toFixed(1);
    return null;
  }, [form.unitPrice, form.sellingPrice]);

  const handleSave = () => {
    const name = form.itemName.trim();
    const qty = parseFloat(form.quantity);
    if (!name) { showToast('품목명을 입력해 주세요.', 'warning'); return; }
    if (!qty || qty <= 0) { showToast('수량을 입력해 주세요.', 'warning'); return; }
    const unitPrice = parseFloat(form.unitPrice) || 0;
    const sellingPrice = parseFloat(form.sellingPrice) || 0;
    const supplyValue = Math.round(unitPrice * qty);
    const vat = Math.ceil(supplyValue * 0.1);
    onSave({
      type: txType,
      itemName: name,
      itemCode: selectedItem?.itemCode || '',
      vendor: form.vendor.trim(),
      quantity: qty,
      unitPrice,
      sellingPrice,
      supplyValue,
      vat,
      totalAmount: supplyValue + vat,
      actualSellingPrice: sellingPrice,
      note: form.note.trim(),
      date: form.date || today,
    });
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{txType === 'in' ? ' 입고 등록' : ' 출고 등록'}</h3>
          <button className="modal-close" onClick={onClose}></button>
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
                        <option key={item.itemName ?? i} value={i}>
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
                    min="0"
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
                  min="0"
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
