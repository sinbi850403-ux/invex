/**
 * VendorsPage.jsx - 거래처 관리
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';
import { getState as getRawState } from '../store.js';

const TYPE_LABEL = { supplier: '매입처', customer: '매출처', both: '양방향' };
const TYPE_BADGE = { supplier: 'badge-info', customer: 'badge-success', both: 'badge-warning' };
const PAYMENT_TERMS = [
  { value: '', label: '-- 선택 --' },
  { value: 'cash', label: '현금' },
  { value: 'card', label: '카드' },
  { value: 'transfer', label: '계좌이체' },
  { value: 'bill30', label: '30일 어음' },
  { value: 'bill60', label: '60일 어음' },
  { value: 'bill90', label: '90일 어음' },
  { value: 'consign', label: '위탁' },
];

function toNum(v) { return parseFloat(String(v || '').replace(/,/g, '')) || 0; }
function fmt(v) { const n = parseFloat(String(v || '').replace(/,/g, '')) || 0; if (!n) return '-'; return '₩' + Math.round(n).toLocaleString('ko-KR'); }

function genVendorCode(vendors, type) {
  const prefix = type === 'customer' ? 'C' : type === 'both' ? 'B' : 'S';
  const existing = vendors.filter(v => (v.code || '').startsWith(prefix)).map(v => parseInt((v.code || '').slice(1)) || 0);
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

function buildStats(vendors, transactions) {
  const map = new Map();
  vendors.forEach(v => map.set(v.name, { inAmt: 0, outAmt: 0, count: 0, lastDate: '' }));
  transactions.forEach(tx => {
    const name = (tx.vendor || '').trim();
    if (!name) return;
    if (!map.has(name)) map.set(name, { inAmt: 0, outAmt: 0, count: 0, lastDate: '' });
    const s = map.get(name);
    const amt = toNum(tx.quantity) * toNum(tx.unitPrice || tx.unitCost || tx.price || 0);
    if (tx.type === 'in') s.inAmt += amt;
    if (tx.type === 'out') s.outAmt += amt;
    s.count++;
    const d = String(tx.date || tx.createdAt || '');
    if (d > s.lastDate) s.lastDate = d;
  });
  return map;
}

const EMPTY_FORM = { code: '', type: 'supplier', name: '', bizNumber: '', ceoName: '', bizType: '', bizItem: '', contactName: '', phone: '', email: '', fax: '', address: '', paymentTerm: '', creditLimit: '', bankName: '', bankAccount: '', bankHolder: '', note: '' };

/** 거래처 등록/수정 모달 */
function VendorModal({ initial, vendors, onClose, onSave }) {
  const isEdit = !!(initial?.name);
  const suggested = isEdit ? (initial.code || '') : genVendorCode(vendors, initial?.type || 'supplier');
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial, code: initial?.code || suggested });

  const set = (k, v) => setForm(f => {
    const next = { ...f, [k]: v };
    if (k === 'type' && !isEdit && /^[SCB]\d{4}$/.test(next.code)) {
      next.code = genVendorCode(vendors, v);
    }
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
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            {/* 좌측 */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '.05em' }}>기본 정보</div>
              <div className="form-row" style={{ marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">구분 <span className="required">*</span></label>
                  <select className="form-select" value={form.type} onChange={e => set('type', e.target.value)}>
                    <option value="supplier">매입처 (공급처)</option>
                    <option value="customer">매출처 (고객사)</option>
                    <option value="both">양방향 (매입+매출)</option>
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
            {/* 우측 */}
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

/** 상세 슬라이드오버 */
function VendorDetail({ vendor, transactions, onClose, onEdit }) {
  const vendorTxs = transactions.filter(tx => (tx.vendor || '').trim() === vendor.name).reverse();
  const inAmt = vendorTxs.filter(t => t.type === 'in').reduce((s, t) => s + toNum(t.quantity) * toNum(t.unitPrice || 0), 0);
  const outAmt = vendorTxs.filter(t => t.type === 'out').reduce((s, t) => s + toNum(t.quantity) * toNum(t.unitPrice || 0), 0);
  const payLabel = (PAYMENT_TERMS.find(p => p.value === vendor.paymentTerm) || {}).label || '-';

  const infoCells = [
    { label: '사업자번호', value: vendor.bizNumber },
    { label: '업태 / 종목', value: [vendor.bizType, vendor.bizItem].filter(Boolean).join(' / ') },
    { label: '담당자', value: vendor.contactName },
    { label: '연락처', value: vendor.phone },
    { label: '이메일', value: vendor.email },
    { label: '팩스', value: vendor.fax },
    { label: '결제조건', value: payLabel !== '-' ? payLabel : '' },
    { label: '신용한도', value: vendor.creditLimit ? fmt(vendor.creditLimit) : '' },
  ].filter(r => r.value);

  return (
    <div style={{ display: 'block', position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '520px', maxWidth: '95vw', background: 'var(--bg-card)', boxShadow: '-4px 0 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* 헤더 */}
        <div style={{ padding: '20px 24px 8px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className={`badge ${TYPE_BADGE[vendor.type] || ''}`}>{TYPE_LABEL[vendor.type] || ''}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{vendor.code || ''}</span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 2px' }}>{vendor.name}</h2>
            {vendor.ceoName && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>대표: {vendor.ceoName}</div>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-sm btn-outline" onClick={onEdit}>✏️ 수정</button>
            <button style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* 요약 수치 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'var(--border)', marginBottom: '16px' }}>
          {[{ label: '총 거래 건수', value: `${vendorTxs.length}건` }, { label: '누적 매입액', value: fmt(inAmt) }, { label: '누적 매출액', value: fmt(outAmt) }].map(c => (
            <div key={c.label} style={{ background: 'var(--bg-card)', padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{c.label}</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{c.value}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '0 24px 24px' }}>
          {/* 기본 정보 */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.05em', marginBottom: '10px' }}>기본 정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {infoCells.map(r => (
                <div key={r.label} style={{ background: 'var(--bg-input)', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>{r.label}</div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{r.value}</div>
                </div>
              ))}
            </div>
            {vendor.address && (
              <div style={{ marginTop: '8px', background: 'var(--bg-input)', borderRadius: '6px', padding: '8px 10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>주소</div>
                <div style={{ fontSize: '13px' }}>{vendor.address}</div>
              </div>
            )}
            {(vendor.bankName || vendor.bankAccount) && (
              <div style={{ marginTop: '8px', background: 'var(--bg-input)', borderRadius: '6px', padding: '8px 10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>계좌정보</div>
                <div style={{ fontSize: '13px' }}>{[vendor.bankName, vendor.bankAccount, vendor.bankHolder].filter(Boolean).join(' / ')}</div>
              </div>
            )}
            {vendor.note && (
              <div style={{ marginTop: '8px', background: 'var(--bg-input)', borderRadius: '6px', padding: '8px 10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>비고</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{vendor.note}</div>
              </div>
            )}
          </div>

          {/* 거래 이력 */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.05em', marginBottom: '10px' }}>
              최근 거래 이력 <span style={{ fontWeight: 400 }}>({vendorTxs.length}건)</span>
            </div>
            {vendorTxs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>거래 이력이 없습니다.</div>
            ) : (
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table className="data-table">
                  <thead>
                    <tr><th>날짜</th><th>구분</th><th>품목</th><th className="text-right">수량</th><th className="text-right">금액</th></tr>
                  </thead>
                  <tbody>
                    {vendorTxs.slice(0, 20).map((tx, i) => {
                      const amt = toNum(tx.quantity) * toNum(tx.unitPrice || 0);
                      return (
                        <tr key={tx.id || i}>
                          <td style={{ color: 'var(--text-muted)' }}>{String(tx.date || '').slice(0, 10)}</td>
                          <td><span className={tx.type === 'in' ? 'type-in' : 'type-out'}>{tx.type === 'in' ? '입고' : '출고'}</span></td>
                          <td>{tx.itemName || '-'}</td>
                          <td className="text-right">{toNum(tx.quantity).toLocaleString('ko-KR')}</td>
                          <td className="text-right">{fmt(amt)}</td>
                        </tr>
                      );
                    })}
                    {vendorTxs.length > 20 && (
                      <tr><td colSpan={5} style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>외 {vendorTxs.length - 20}건 더 있음</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VendorsPage() {
  const [state, setState] = useStore();
  const vendors = state.vendorMaster || [];
  const transactions = state.transactions || [];

  const [tab, setTab] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [detailVendor, setDetailVendor] = useState(null);
  const [editVendor, setEditVendor] = useState(null); // null=closed, EMPTY_FORM=new, vendor=edit

  const statsMap = useMemo(() => buildStats(vendors, transactions), [vendors, transactions]);

  const counts = useMemo(() => ({
    all: vendors.length,
    supplier: vendors.filter(v => v.type === 'supplier').length,
    customer: vendors.filter(v => v.type === 'customer').length,
    both: vendors.filter(v => v.type === 'both').length,
  }), [vendors]);

  const totalIn = useMemo(() => { let t = 0; statsMap.forEach(s => { t += s.inAmt; }); return t; }, [statsMap]);
  const totalOut = useMemo(() => { let t = 0; statsMap.forEach(s => { t += s.outAmt; }); return t; }, [statsMap]);
  const activeCount = useMemo(() => { let c = 0; statsMap.forEach(s => { if (s.count > 0) c++; }); return c; }, [statsMap]);

  const filtered = useMemo(() => {
    const kw = keyword.toLowerCase();
    return vendors.filter(v => {
      if (tab !== 'all' && v.type !== tab) return false;
      if (kw) {
        const hay = [v.name, v.code, v.contactName, v.bizNumber, v.phone, v.email].map(x => String(x || '').toLowerCase()).join(' ');
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [vendors, tab, keyword]);

  const handleSave = useCallback((form) => {
    const current = [...vendors];
    const existingIdx = current.findIndex(v => v.name === editVendor?.name && editVendor?.name);
    if (existingIdx >= 0) {
      current[existingIdx] = form;
      showToast(`"${form.name}" 거래처를 수정했습니다.`, 'success');
    } else {
      current.push(form);
      showToast(`"${form.name}" 거래처를 등록했습니다.`, 'success');
    }
    setState({ vendorMaster: current });
    setEditVendor(null);
    if (detailVendor?.name === form.name) setDetailVendor(form);
  }, [vendors, editVendor, detailVendor, setState]);

  const handleDelete = useCallback((vendor) => {
    if (!confirm(`"${vendor.name}" 거래처를 삭제하시겠습니까?`)) return;
    const rawState = getRawState();
    const prev = rawState._deletedVendors || [];
    setState({ vendorMaster: vendors.filter(v => v.name !== vendor.name), _deletedVendors: [...prev, vendor] });
    showToast('거래처를 삭제했습니다.', 'info');
    if (detailVendor?.name === vendor.name) setDetailVendor(null);
  }, [vendors, detailVendor, setState]);

  const handleExport = () => {
    if (!vendors.length) { showToast('내보낼 거래처가 없습니다.', 'warning'); return; }
    const rows = vendors.map(v => ({
      '거래처코드': v.code || '', '구분': TYPE_LABEL[v.type] || '', '거래처명': v.name,
      '사업자번호': v.bizNumber || '', '대표자': v.ceoName || '', '업태': v.bizType || '',
      '종목': v.bizItem || '', '담당자': v.contactName || '', '연락처': v.phone || '',
      '이메일': v.email || '', '팩스': v.fax || '', '주소': v.address || '',
      '결제조건': (PAYMENT_TERMS.find(p => p.value === v.paymentTerm) || {}).label || '',
      '신용한도': v.creditLimit || '', '은행': v.bankName || '', '계좌번호': v.bankAccount || '',
      '예금주': v.bankHolder || '', '비고': v.note || '',
    }));
    downloadExcel(rows, '거래처마스터');
    showToast('거래처 목록을 내보냈습니다.', 'success');
  };

  return (
    <div>
      {editVendor !== null && (
        <VendorModal
          initial={editVendor}
          vendors={vendors}
          onClose={() => setEditVendor(null)}
          onSave={handleSave}
        />
      )}
      {detailVendor && (
        <VendorDetail
          vendor={detailVendor}
          transactions={transactions}
          onClose={() => setDetailVendor(null)}
          onEdit={() => { setEditVendor(detailVendor); setDetailVendor(null); }}
        />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">거래처 관리</h1>
          <div className="page-desc">공급처·고객사 마스터 데이터를 관리합니다. 발주서·거래명세서·세금계산서에 자동 연동됩니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => showToast('엑셀 가져오기 기능은 준비 중입니다.', 'info')}>📥 엑셀 가져오기</button>
          <button className="btn btn-outline" onClick={handleExport}>📤 내보내기</button>
          <button className="btn btn-primary" onClick={() => setEditVendor({ ...EMPTY_FORM })}>+ 거래처 등록</button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: '전체 거래처', value: vendors.length, color: 'var(--accent)' },
          { label: '매입처', value: counts.supplier + counts.both, color: 'var(--info)' },
          { label: '매출처', value: counts.customer + counts.both, color: 'var(--success)' },
          { label: '거래 발생', value: activeCount, color: undefined },
        ].map(c => (
          <div key={c.label} className="card card-compact" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* 탭 + 검색 */}
      <div className="card card-compact" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-input)', borderRadius: '8px', padding: '4px' }}>
            {[{ key: 'all', label: `전체 (${counts.all})` }, { key: 'supplier', label: `매입처 (${counts.supplier})` }, { key: 'customer', label: `매출처 (${counts.customer})` }, { key: 'both', label: `양방향 (${counts.both})` }].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', background: tab === t.key ? 'var(--accent)' : 'transparent', color: tab === t.key ? '#fff' : 'var(--text-muted)' }}>
                {t.label}
              </button>
            ))}
          </div>
          <input className="form-input" placeholder="🔍 거래처명·코드·담당자·사업자번호 검색..." value={keyword} onChange={e => setKeyword(e.target.value)} style={{ flex: 1, minWidth: '200px' }} />
        </div>
      </div>

      {/* 거래처 목록 */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏢</div>
          <div style={{ fontSize: '15px' }}>{keyword ? '검색 결과가 없습니다.' : '등록된 거래처가 없습니다.'}</div>
          {!keyword && <div style={{ marginTop: '8px', fontSize: '13px' }}>위 [+ 거래처 등록] 버튼을 눌러 추가하세요.</div>}
        </div>
      ) : (
        <div className="card card-flush">
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '90px' }}>코드</th>
                  <th style={{ width: '70px' }}>구분</th>
                  <th>거래처명</th>
                  <th>사업자번호</th>
                  <th>담당자</th>
                  <th>연락처</th>
                  <th>결제조건</th>
                  <th className="text-right">거래 건수</th>
                  <th className="text-right">누적 매입</th>
                  <th className="text-right">누적 매출</th>
                  <th>최근 거래</th>
                  <th style={{ width: '110px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => {
                  const s = statsMap.get(v.name) || { inAmt: 0, outAmt: 0, count: 0, lastDate: '' };
                  const payLabel = (PAYMENT_TERMS.find(p => p.value === v.paymentTerm) || {}).label || '-';
                  return (
                    <tr key={v.code || v.name}>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{v.code || '-'}</td>
                      <td><span className={`badge ${TYPE_BADGE[v.type] || 'badge-default'}`}>{TYPE_LABEL[v.type] || '-'}</span></td>
                      <td>
                        <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700, fontSize: '14px', padding: 0, textAlign: 'left' }} onClick={() => setDetailVendor(v)}>
                          {v.name}
                        </button>
                        {v.ceoName && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>대표: {v.ceoName}</div>}
                        {v.bizType && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{v.bizType} / {v.bizItem || ''}</div>}
                      </td>
                      <td style={{ fontSize: '12px' }}>{v.bizNumber || '-'}</td>
                      <td style={{ fontSize: '13px' }}>{v.contactName || '-'}</td>
                      <td style={{ fontSize: '12px' }}>{v.phone || '-'}</td>
                      <td style={{ fontSize: '12px' }}>{payLabel}</td>
                      <td className="text-right">{s.count.toLocaleString('ko-KR')}건</td>
                      <td className="text-right" style={{ fontSize: '12px' }}>{fmt(s.inAmt)}</td>
                      <td className="text-right" style={{ fontSize: '12px' }}>{fmt(s.outAmt)}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.lastDate ? s.lastDate.slice(0, 10) : '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-xs btn-outline" onClick={() => setDetailVendor(v)}>상세</button>
                          <button className="btn btn-xs btn-outline" onClick={() => setEditVendor(v)}>수정</button>
                          <button className="btn btn-xs btn-icon-danger" onClick={() => handleDelete(v)}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
