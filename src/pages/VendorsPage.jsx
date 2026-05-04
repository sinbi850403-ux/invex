import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';
import { getState as getRawState } from '../store.js';
import { TYPE_LABEL, TYPE_BADGE, PAYMENT_TERMS, EMPTY_FORM, fmt, buildStats } from '../domain/vendorsConfig.js';
import { VendorModal }  from '../components/vendors/VendorModal.jsx';
import { VendorDetail } from '../components/vendors/VendorDetail.jsx';

export default function VendorsPage() {
  const [state, setState] = useStore();
  const vendors      = state.vendorMaster || [];
  const transactions = state.transactions || [];
  const items        = state.mappedData   || [];

  const [tab,          setTab]          = useState('all');
  const [keyword,      setKeyword]      = useState('');
  const [detailVendor, setDetailVendor] = useState(null);
  const [editVendor,   setEditVendor]   = useState(null);

  const statsMap = useMemo(() => buildStats(vendors, transactions, items), [vendors, transactions, items]);

  const counts = useMemo(() => ({
    all:      vendors.length,
    supplier: vendors.filter(v => v.type === 'supplier').length,
    customer: vendors.filter(v => v.type === 'customer').length,
    both:     vendors.filter(v => v.type === 'both').length,
    transfer: vendors.filter(v => v.type === 'transfer').length,
    adjust:   vendors.filter(v => v.type === 'adjust').length,
    return:   vendors.filter(v => v.type === 'return').length,
  }), [vendors]);

  const totalIn    = useMemo(() => { let t = 0; statsMap.forEach(s => { t += s.inAmt;  }); return t; }, [statsMap]);
  const totalOut   = useMemo(() => { let t = 0; statsMap.forEach(s => { t += s.outAmt; }); return t; }, [statsMap]);
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
        <VendorModal initial={editVendor} vendors={vendors} onClose={() => setEditVendor(null)} onSave={handleSave} />
      )}
      {detailVendor && (
        <VendorDetail vendor={detailVendor} transactions={transactions} items={items} onClose={() => setDetailVendor(null)}
          onEdit={() => { setEditVendor(detailVendor); setDetailVendor(null); }} />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">거래처 관리</h1>
          <div className="page-desc">공급처·고객사 마스터 데이터를 관리합니다. 발주서·거래명세서·세금계산서에 자동 연동됩니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => showToast('엑셀 가져오기 기능은 준비 중입니다.', 'info')}> 엑셀 가져오기</button>
          <button className="btn btn-outline" onClick={handleExport}> 내보내기</button>
          <button className="btn btn-primary" onClick={() => setEditVendor({ ...EMPTY_FORM })}>+ 거래처 등록</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '8px' }}>
        {[
          { label: '전체 거래처', value: vendors.length,                   unit: '개', color: 'var(--accent)' },
          { label: '매입처',     value: counts.supplier + counts.both,    unit: '개', color: 'var(--info)' },
          { label: '매출처',     value: counts.customer + counts.both,    unit: '개', color: 'var(--success)' },
        ].map(c => (
          <div key={c.label} className="card card-compact" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: c.color }}>{c.value}<span style={{ fontSize: '13px', fontWeight: 400 }}> {c.unit}</span></div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: '거래 발생',    value: activeCount,  unit: '개', color: undefined },
          { label: '누적 매입금액', value: fmt(totalIn),  unit: '',   color: 'var(--info)' },
          { label: '누적 매출금액', value: fmt(totalOut), unit: '',   color: 'var(--success)' },
        ].map(c => (
          <div key={c.label} className="card card-compact" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: c.label === '거래 발생' ? '24px' : '18px', fontWeight: 700, color: c.color }}>{c.value}{c.unit && <span style={{ fontSize: '13px', fontWeight: 400 }}> {c.unit}</span>}</div>
          </div>
        ))}
      </div>

      <div className="card card-compact" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-input)', borderRadius: '8px', padding: '4px' }}>
            {[
              { key: 'all',      label: `전체 (${counts.all})` },
              { key: 'supplier', label: `매입처 (${counts.supplier})` },
              { key: 'customer', label: `매출처 (${counts.customer})` },
              { key: 'both',     label: `양방향 (${counts.both})` },
              { key: 'transfer', label: `창고이동 (${counts.transfer})` },
              { key: 'adjust',   label: `조정 (${counts.adjust})` },
              { key: 'return',   label: `반품 (${counts.return})` },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', background: tab === t.key ? 'var(--accent)' : 'transparent', color: tab === t.key ? '#fff' : 'var(--text-muted)' }}>
                {t.label}
              </button>
            ))}
          </div>
          <input className="form-input" placeholder=" 거래처명·코드·담당자·사업자번호 검색..." value={keyword} onChange={e => setKeyword(e.target.value)} style={{ flex: 1, minWidth: '200px' }} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}></div>
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
