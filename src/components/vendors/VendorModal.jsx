import React, { useState } from 'react';
import { showToast } from '../../toast.js';
import { EMPTY_FORM, PAYMENT_TERMS, genVendorCode } from '../../domain/vendorsConfig.js';

export function VendorModal({ initial, vendors, onClose, onSave }) {
  const isEdit   = !!(initial?.name);
  const suggested = isEdit ? (initial.code || '') : genVendorCode(vendors, initial?.type || 'supplier');
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial, code: initial?.code || suggested });

  const set = (k, v) => setForm(f => {
    const next = { ...f, [k]: v };
    if (k === 'type' && !isEdit && /^[SCB]\d{4}$/.test(next.code)) next.code = genVendorCode(vendors, v);
    return next;
  });

  const handleSave = () => {
    if (!form.name.trim()) { showToast('거래처명을 입력해 주세요.', 'warning'); return; }
    const code = form.code.trim() || genVendorCode(vendors, form.type);
    const conflict = vendors.find(v => v.code === code && v.name !== (initial?.name));
    if (conflict) { showToast(`거래처 코드 "${code}"가 이미 사용 중입니다.`, 'warning'); return; }
    onSave({ ...form, code, createdAt: initial?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
  };

  const F = ({ label, id, ...props }) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label">{label}</label>
      <input className="form-input" value={form[id] ?? ''} onChange={e => set(id, e.target.value)} {...props} />
    </div>
  );

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: '680px', width: '95vw' }}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? '거래처 수정' : '거래처 등록'}</h2>
          <button className="modal-close" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '.05em' }}>기본 정보</div>
              <div className="form-row" style={{ marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">구분 <span className="required">*</span></label>
                  <select className="form-select" value={form.type} onChange={e => set('type', e.target.value)}>
                    <option value="supplier">매입처 (공급처)</option>
                    <option value="customer">매출처 (고객사)</option>
                    <option value="both">양방향 (매입+매출)</option>
                    <option value="transfer">창고이동처</option>
                    <option value="adjust">조정처</option>
                    <option value="return">반품처</option>
                  </select>
                </div>
                <F label="거래처 코드" id="code" placeholder="자동생성" />
              </div>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label">거래처명 <span className="required">*</span></label>
                <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="예: (주)삼성전자" />
              </div>
              <div className="form-row" style={{ marginBottom: '12px' }}>
                <F label="사업자번호" id="bizNumber" placeholder="000-00-00000" />
                <F label="대표자명" id="ceoName" />
              </div>
              <div className="form-row" style={{ marginBottom: '12px' }}>
                <F label="업태" id="bizType" placeholder="예: 제조업" />
                <F label="종목" id="bizItem" placeholder="예: 전자부품" />
              </div>
              <F label="주소" id="address" />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '.05em' }}>연락처</div>
              <div className="form-row" style={{ marginBottom: '12px' }}>
                <F label="담당자명" id="contactName" />
                <F label="연락처" id="phone" placeholder="010-0000-0000" />
              </div>
              <div className="form-row" style={{ marginBottom: '12px' }}>
                <F label="이메일" id="email" type="email" />
                <F label="팩스" id="fax" />
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', margin: '16px 0 10px', letterSpacing: '.05em' }}>거래 조건</div>
              <div className="form-row" style={{ marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">결제조건</label>
                  <select className="form-select" value={form.paymentTerm} onChange={e => set('paymentTerm', e.target.value)}>
                    {PAYMENT_TERMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <F label="신용한도 (₩)" id="creditLimit" type="number" placeholder="0" />
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', margin: '16px 0 10px', letterSpacing: '.05em' }}>계좌 정보</div>
              <div className="form-row" style={{ marginBottom: '12px' }}>
                <F label="은행명" id="bankName" placeholder="국민은행" />
                <F label="예금주" id="bankHolder" />
              </div>
              <F label="계좌번호" id="bankAccount" placeholder="000-000-000000" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">비고</label>
            <input className="form-input" value={form.note} onChange={e => set('note', e.target.value)} placeholder="특이사항, 메모 등" />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-outline" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={handleSave}>{isEdit ? '수정 저장' : '등록'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
