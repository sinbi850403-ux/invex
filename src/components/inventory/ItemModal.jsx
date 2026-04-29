import React, { useState, useEffect } from 'react';
import { useStore } from '../../hooks/useStore.js';
import { showToast } from '../../toast.js';
import { addItem, updateItem, setSafetyStock, getState as getRawState } from '../../store.js';
import { fmt } from '../../domain/inventoryConfig.js';

export function ItemModal({ item, editIdx, onClose, onSaved }) {
  const isEdit = editIdx != null;
  const [state] = useStore();
  const safetyStock = state.safetyStock || {};
  const vendors    = (state.vendorMaster || []).filter(v => v.type === 'supplier' || v.type === 'both');
  const existingCats  = [...new Set((state.mappedData || []).map(d => d.category).filter(Boolean))].sort();
  const existingUnits = [...new Set((state.mappedData || []).map(d => d.unit).filter(Boolean))].sort();
  const allUnits      = [...new Set([...existingUnits, 'EA', 'BOX', 'KG', 'L', 'M', 'SET'])];

  const [form, setForm] = useState({
    itemName:       item?.itemName    ?? '',
    itemCode:       item?.itemCode    ?? '',
    spec:           item?.spec        ?? '',
    category:       item?.category    ?? '',
    color:          item?.color       ?? '',
    year:           item?.year        ?? '',
    quantity:       String(item?.quantity    ?? ''),
    unit:           item?.unit        ?? '',
    unitPrice:      String(item?.unitPrice   ?? ''),
    salePrice:      String(item?.salePrice   ?? ''),
    vendor:         item?.vendor      ?? '',
    warehouse:      item?.warehouse   ?? '',
    note:           item?.note        ?? '',
    lockedUntil:    item?.lockedUntil ?? '',
    safetyStockMin: String(item?.itemName ? (safetyStock[item.itemName] ?? '') : ''),
  });
  const [errors, setErrors] = useState({});

  const qty    = parseFloat(form.quantity)  || 0;
  const up     = parseFloat(form.unitPrice) || 0;
  const sp     = parseFloat(form.salePrice) || 0;
  const supply = Math.round(qty * up);
  const vat    = Math.ceil(supply * 0.1);
  const total  = supply + vat;
  const margin = sp > 0 ? sp - up : null;

  const statusItems = [
    { done: !!form.itemName.trim(),  text: '품목명이 입력되었습니다.' },
    { done: form.quantity !== '',    text: '수량이 입력되었습니다.' },
    { done: up > 0,                  text: '원가가 입력되었습니다.' },
    { done: sp > 0,                  text: '판매가가 입력되었습니다.' },
    { done: !!form.vendor.trim(),    text: '거래처가 연결되었습니다.' },
    { done: !!form.warehouse.trim(), text: '창고/위치가 입력되었습니다.' },
  ];
  const quality = statusItems.filter(s => s.done).length;

  function genItemCode() {
    const items = getRawState().mappedData || [];
    const nums  = items.map(d => parseInt((d.itemCode || '').replace(/\D/g, '')) || 0);
    return 'I' + String(nums.length ? Math.max(...nums) + 1 : 1).padStart(5, '0');
  }

  function handleSave() {
    const errs = {};
    const name = form.itemName.trim();
    if (!name) errs.itemName = '품목명은 필수입니다.';
    else if (!isEdit) {
      const existing = (getRawState().mappedData || []).map(d => d.itemName?.trim().toLowerCase());
      if (existing.includes(name.toLowerCase())) errs.itemName = `"${name}"은(는) 이미 등록된 품목명입니다.`;
    }
    if (form.quantity !== '' && isNaN(parseFloat(form.quantity))) errs.quantity = '숫자만 입력해 주세요.';
    if (form.unitPrice !== '' && (isNaN(up) || up < 0)) errs.unitPrice = '0 이상의 숫자를 입력해 주세요.';
    if (form.salePrice !== '' && (isNaN(sp) || sp < 0)) errs.salePrice = '0 이상의 숫자를 입력해 주세요.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const newItem = {
      itemName:    name,
      itemCode:    form.itemCode.trim(),
      spec:        form.spec.trim(),
      category:    form.category.trim(),
      color:       form.color.trim(),
      year:        form.year.trim(),
      vendor:      form.vendor,
      quantity:    parseFloat(form.quantity) || 0,
      unit:        form.unit.trim(),
      unitPrice:   up,
      salePrice:   sp,
      warehouse:   form.warehouse.trim(),
      note:        form.note.trim(),
      lockedUntil: form.lockedUntil || null,
    };

    const prevItem = isEdit ? (getRawState().mappedData[editIdx] || {}) : {};
    const prevSv   = parseFloat(prevItem.supplyValue) || 0;
    const prevVat  = parseFloat(prevItem.vat) || 0;
    const vatRate  = (isEdit && prevSv > 0 && prevVat / prevSv < 0.05) ? 0 : 0.1;
    newItem.supplyValue = Math.round(newItem.quantity * newItem.unitPrice);
    newItem.vat         = Math.ceil(newItem.supplyValue * vatRate);
    newItem.totalPrice  = newItem.supplyValue + newItem.vat;

    if (isEdit) {
      updateItem(editIdx, newItem);
      showToast(`"${name}" 품목을 수정했습니다.`, 'success');
    } else {
      addItem(newItem);
      showToast(`"${name}" 품목을 추가했습니다.`, 'success');
    }
    const ssv = parseFloat(form.safetyStockMin);
    if (!isNaN(ssv) && ssv >= 0) setSafetyStock(name, ssv);
    onSaved();
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const f = field => ({ value: form[field], onChange: e => setForm(p => ({ ...p, [field]: e.target.value })) });

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 980 }}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? '품목 수정' : '새 품목 추가'}</h3>
          <button className="modal-close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="form-shell">
            <div className="form-shell-main">
              <datalist id="dl-category">{existingCats.map(v => <option key={v} value={v} />)}</datalist>
              <datalist id="dl-unit">{allUnits.map(v => <option key={v} value={v} />)}</datalist>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">품목명 <span className="required">*</span></label>
                  <input className={`form-input${errors.itemName ? ' is-error' : ''}`} {...f('itemName')} placeholder="예: A4용지, 복사용지 80g" />
                  {errors.itemName && <div className="field-error">{errors.itemName}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">품목코드</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="form-input" {...f('itemCode')} placeholder="예: I00001" style={{ flex: 1 }} />
                    {!isEdit && <button type="button" className="btn btn-outline btn-sm" onClick={() => setForm(p => ({ ...p, itemCode: genItemCode() }))}>자동</button>}
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">규격/스펙</label>
                  <input className="form-input" {...f('spec')} placeholder="예: 80g/m², A4, 500매" />
                </div>
                <div className="form-group">
                  <label className="form-label">분류(카테고리)</label>
                  <input className="form-input" {...f('category')} list="dl-category" placeholder="예: 사무용품" autoComplete="off" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">수량 <span className="required">*</span></label>
                  <input className={`form-input${errors.quantity ? ' is-error' : ''}`} type="number" min="0" {...f('quantity')} placeholder="0" />
                  {errors.quantity && <div className="field-error">{errors.quantity}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">단위</label>
                  <input className="form-input" {...f('unit')} list="dl-unit" placeholder="EA, BOX, KG ..." autoComplete="off" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">매입가(원가)</label>
                  <input className={`form-input${errors.unitPrice ? ' is-error' : ''}`} type="number" min="0" {...f('unitPrice')} placeholder="0" />
                  {errors.unitPrice && <div className="field-error">{errors.unitPrice}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">판매단가</label>
                  <input className={`form-input${errors.salePrice ? ' is-error' : ''}`} type="number" min="0" {...f('salePrice')} placeholder="미입력 시 손익 정확도 저하" />
                  {sp > 0 && up > 0 && sp < up && <div className="form-warn-msg">판매가가 원가보다 낮습니다.</div>}
                </div>
              </div>

              <details className="smart-details" open>
                <summary>추가 정보 더 보기</summary>
                <div className="smart-details-body">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">주공급처</label>
                      <select className="form-select" value={form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))}>
                        <option value="">-- 선택 또는 직접 입력 --</option>
                        {vendors.map(v => <option key={v.id || v.name} value={v.name}>{v.name}{v.code ? ` (${v.code})` : ''}</option>)}
                        {form.vendor && !vendors.find(v => v.name === form.vendor) && <option value={form.vendor}>{form.vendor}</option>}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">창고/위치</label>
                      <input className="form-input" {...f('warehouse')} placeholder="예: 본사 1층 A-03" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">색상</label>
                      <input className="form-input" {...f('color')} placeholder="예: 블랙, White, #FF0000" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">년도</label>
                      <input className="form-input" {...f('year')} placeholder="예: 2024" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">비고</label>
                      <input className="form-input" {...f('note')} placeholder="메모" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">품목 잠금 해제일</label>
                      <input className="form-input" type="date" {...f('lockedUntil')} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">안전재고 기준 수량</label>
                      <input className="form-input" type="number" min="0" {...f('safetyStockMin')} placeholder="이 이하면 경고 표시" />
                    </div>
                    <div className="form-group" />
                  </div>
                </div>
              </details>
            </div>

            <div className="form-shell-side">
              <div className="form-card">
                <div className="form-card-title">입력 진행 상태</div>
                <div className="form-card-desc">필수값만 채워도 저장됩니다.</div>
                <div className="form-status-list">
                  {statusItems.map((s, i) => (
                    <div key={i} className={`form-status-item${s.done ? ' is-complete' : ''}`}>{s.text}</div>
                  ))}
                </div>
              </div>
              <div className="smart-summary-grid">
                <div className="smart-summary-item">
                  <div className="smart-summary-label">현재 재고 가치</div>
                  <div className="smart-summary-value">{total > 0 ? '₩' + Math.round(total).toLocaleString('ko-KR') : '₩0'}</div>
                  <div className="smart-summary-note">
                    {total > 0 ? `공급가액 ${fmt(supply)} / 부가세 ${fmt(vat)} / 합계 ${fmt(total)}` : '수량과 원가를 입력하면 자동 계산됩니다.'}
                  </div>
                </div>
                <div className="smart-summary-item">
                  <div className="smart-summary-label">예상 판매 기준 차익</div>
                  <div className="smart-summary-value">{margin == null ? '미입력' : `${margin >= 0 ? '+' : '-'}₩${Math.abs(Math.round(margin)).toLocaleString('ko-KR')}`}</div>
                  <div className="smart-summary-note">{margin == null ? '판매가를 넣으면 원가 대비 차익을 바로 볼 수 있습니다.' : `개당 차익 ${margin >= 0 ? '+' : '-'}₩${Math.abs(Math.round(margin)).toLocaleString('ko-KR')}`}</div>
                </div>
                <div className="smart-summary-item">
                  <div className="smart-summary-label">데이터 품질</div>
                  <div className="smart-summary-value">{quality}/6 단계 완료</div>
                  <div className="smart-summary-note">{quality >= 5 ? '보고와 발주에 필요한 정보가 잘 채워져 있습니다.' : '거래처, 위치, 판매가를 채우면 분석 품질이 올라갑니다.'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={handleSave}>{isEdit ? '수정 저장' : '품목 저장'}</button>
        </div>
      </div>
    </div>
  );
}
