/**
 * AccountsPage.jsx - 미수금/미지급금 정산 관리
 */
import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';
import { addAuditLog } from '../audit-log.js';
import { fmtNum as fmt } from '../utils/formatters.js';
const todayStr = () => new Date().toISOString().slice(0, 10);
const ageDays = dueDate => dueDate ? Math.ceil((new Date(todayStr()) - new Date(dueDate)) / 86400000) : null;

function agingBucket(dueDate) {
  const d = ageDays(dueDate);
  if (d === null) return { label: '-',       color: 'var(--text-muted)' };
  if (d <= 0)    return { label: '정상',      color: '#16a34a' };
  if (d <= 30)   return { label: '30일 내',   color: '#d97706' };
  if (d <= 60)   return { label: '31-60일',   color: '#ea580c' };
  if (d <= 90)   return { label: '61-90일',   color: '#dc2626' };
  return                { label: '90일 초과', color: '#7f1d1d' };
}

/* 에이징 요약 카드 */
function AgingSummary({ receivables }) {
  const pending = receivables.filter(e => !e.settled);
  if (!pending.length) return null;
  const colors = ['#16a34a', '#d97706', '#ea580c', '#dc2626', '#7f1d1d'];
  const buckets = [
    { label: '정상 (만기 이전)',  fn: e => { const d = ageDays(e.dueDate); return d !== null && d <= 0; } },
    { label: '1-30일 연체',      fn: e => { const d = ageDays(e.dueDate); return d > 0 && d <= 30; } },
    { label: '31-60일 연체',     fn: e => { const d = ageDays(e.dueDate); return d > 30 && d <= 60; } },
    { label: '61-90일 연체',     fn: e => { const d = ageDays(e.dueDate); return d > 60 && d <= 90; } },
    { label: '90일+ 연체',       fn: e => ageDays(e.dueDate) > 90 },
  ];
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-title"> 미수금 에이징 분석</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {buckets.map((b, i) => {
          const items = pending.filter(b.fn);
          const total = items.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
          return (
            <div key={i} style={{ flex: 1, minWidth: '120px', padding: '12px', background: `${colors[i]}18`, border: `1px solid ${colors[i]}40`, borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: colors[i], fontWeight: 600 }}>{b.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: colors[i] }}>₩{fmt(total)}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{items.length}건</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* 전표 테이블 */
function EntryTable({ list, onSettle, onDelete }) {
  const sorted = [...list].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const t = todayStr();
  if (!sorted.length) return <div className="empty-state"><div className="icon"></div><div className="msg">내역이 없습니다</div></div>;
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>구분</th><th>거래처</th><th className="col-fill">적요</th>
            <th className="text-right">금액</th><th>발생일</th><th>만기일</th>
            <th>연체</th><th>상태</th><th>관리</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(e => {
            const days = ageDays(e.dueDate);
            const bucket = agingBucket(e.dueDate);
            const isOverdue = !e.settled && e.dueDate && e.dueDate < t;
            return (
              <tr key={e.id}>
                <td>
                  <span style={{ background: e.type === 'receivable' ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)', color: e.type === 'receivable' ? '#16a34a' : '#ef4444', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
                    {e.type === 'receivable' ? '미수금' : '미지급금'}
                  </span>
                </td>
                <td><strong>{e.vendorName || '-'}</strong></td>
                <td className="col-fill" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{e.description || '-'}</td>
                <td className="text-right" style={{ fontWeight: 700 }}>₩{fmt(e.amount)}</td>
                <td style={{ fontSize: '12px' }}>{e.date || '-'}</td>
                <td style={{ fontSize: '12px', ...(isOverdue ? { color: 'var(--danger)', fontWeight: 600 } : {}) }}>{e.dueDate || '-'}</td>
                <td style={{ fontSize: '12px' }}>
                  {days !== null && !e.settled
                    ? <span style={{ color: bucket.color, fontWeight: 600 }}>{bucket.label}{days > 0 ? ` (${days}일)` : ''}</span>
                    : '-'}
                </td>
                <td>
                  {e.settled
                    ? <div style={{ fontSize: '11px', color: '#16a34a' }}> {e.settledDate || ''}<br /><span style={{ color: 'var(--text-muted)' }}>{e.paymentMethod || ''}</span></div>
                    : <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: 600 }}>미정산</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {!e.settled && <button className="btn btn-xs btn-outline" style={{ color: '#16a34a', borderColor: '#16a34a' }} onClick={() => onSettle(e)}>정산</button>}
                    <button className="btn btn-xs btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => onDelete(e)}>삭제</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700 }}>
            <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
            <td className="text-right">₩{fmt(sorted.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0))}</td>
            <td colSpan={5}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* 거래처별 집계 */
function VendorSummary({ entries }) {
  const t = todayStr();
  const pending = entries.filter(e => !e.settled);
  const byVendor = {};
  pending.forEach(e => {
    const v = e.vendorName || '(미지정)';
    if (!byVendor[v]) byVendor[v] = { receivable: 0, payable: 0, overdue: 0, count: 0 };
    byVendor[v][e.type] += parseFloat(e.amount) || 0;
    byVendor[v].count++;
    if (e.dueDate && e.dueDate < t) byVendor[v].overdue += parseFloat(e.amount) || 0;
  });
  const rows = Object.entries(byVendor).sort((a, b) => (b[1].receivable + b[1].payable) - (a[1].receivable + a[1].payable));
  if (!rows.length) return <div className="empty-state"><div className="icon"></div><div className="msg">집계할 데이터가 없습니다</div></div>;
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr><th className="col-fill">거래처</th><th className="text-right">미수금</th><th className="text-right">미지급금</th><th className="text-right">순 채권</th><th className="text-right">연체금액</th><th className="text-right">건수</th></tr>
        </thead>
        <tbody>
          {rows.map(([name, d]) => {
            const net = d.receivable - d.payable;
            return (
              <tr key={name}>
                <td className="col-fill"><strong>{name}</strong></td>
                <td className="text-right" style={{ color: '#16a34a', fontWeight: 600 }}>₩{fmt(d.receivable)}</td>
                <td className="text-right" style={{ color: '#ef4444', fontWeight: 600 }}>₩{fmt(d.payable)}</td>
                <td className="text-right" style={{ fontWeight: 700, color: net >= 0 ? '#16a34a' : '#ef4444' }}>₩{fmt(net)}</td>
                <td className="text-right" style={{ color: d.overdue > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{d.overdue > 0 ? `₩${fmt(d.overdue)}` : '-'}</td>
                <td className="text-right">{d.count}건</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* 세금계산서 테이블 */
function InvoiceTable({ invoices }) {
  if (!invoices.length) return <div className="empty-state"><div className="icon"></div><div className="msg">세금계산서가 없습니다</div></div>;
  const sorted = [...invoices].sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead><tr><th>구분</th><th>계산서번호</th><th className="col-fill">거래처</th><th>발행일</th><th className="text-right">공급가</th><th className="text-right">부가세</th><th className="text-right">합계</th><th>원본 문서</th></tr></thead>
        <tbody>
          {sorted.map((inv, i) => (
            <tr key={i}>
              <td><span style={{ background: inv.type === 'sales' ? 'rgba(22,163,74,0.12)' : 'rgba(37,99,235,0.12)', color: inv.type === 'sales' ? '#16a34a' : '#2563eb', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{inv.type === 'sales' ? '매출' : '매입'}</span></td>
              <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{inv.invoiceNo}</td>
              <td className="col-fill">{inv.customer || inv.vendor || '-'}</td>
              <td style={{ fontSize: '12px' }}>{inv.issueDate || '-'}</td>
              <td className="text-right">₩{fmt(inv.supply)}</td>
              <td className="text-right" style={{ color: 'var(--text-muted)' }}>₩{fmt(inv.vat)}</td>
              <td className="text-right" style={{ fontWeight: 700 }}>₩{fmt(inv.total)}</td>
              <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{inv.sourceOrderNo || '-'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700 }}>
            <td colSpan={4} style={{ textAlign: 'right' }}>합계</td>
            <td className="text-right">₩{fmt(sorted.reduce((s, i) => s + (parseFloat(i.supply) || 0), 0))}</td>
            <td className="text-right">₩{fmt(sorted.reduce((s, i) => s + (parseFloat(i.vat) || 0), 0))}</td>
            <td className="text-right">₩{fmt(sorted.reduce((s, i) => s + (parseFloat(i.total) || 0), 0))}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* 정산 모달 */
function SettleModal({ entry, onClose, onConfirm }) {
  const [settledDate, setSettledDate] = useState(todayStr());
  const [paymentMethod, setPaymentMethod] = useState('계좌이체');
  const [settleNote, setSettleNote] = useState('');
  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{entry.type === 'receivable' ? ' 미수금 정산' : ' 미지급금 정산'}</h2>
          <button className="modal-close" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-input)', borderRadius: '8px', fontSize: '13px' }}>
            <div style={{ marginBottom: '4px' }}><span style={{ color: 'var(--text-muted)' }}>거래처:</span> <strong>{entry.vendorName}</strong></div>
            <div style={{ marginBottom: '4px' }}><span style={{ color: 'var(--text-muted)' }}>금액:</span> <strong style={{ fontSize: '18px', color: 'var(--accent)' }}>₩{fmt(entry.amount)}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>적요:</span> {entry.description || '-'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div><label className="form-label">정산일 *</label><input className="form-input" type="date" value={settledDate} onChange={e => setSettledDate(e.target.value)} /></div>
            <div>
              <label className="form-label">결제 수단</label>
              <select className="form-input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                {['계좌이체','현금','카드','어음','상계처리'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}><label className="form-label">메모</label><input className="form-input" value={settleNote} onChange={e => setSettleNote(e.target.value)} placeholder="영수증번호, 계좌 등" /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="btn btn-outline" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={() => onConfirm({ settledDate, paymentMethod, settleNote })}> 정산 완료</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 수동 전표 모달 */
function AccountModal({ vendors, onClose, onSave }) {
  const [type, setType] = useState('receivable');
  const [vendorName, setVendorName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal" style={{ maxWidth: '520px' }}>
        <div className="modal-header"><h2 className="modal-title"> 수동 전표 등록</h2><button className="modal-close" onClick={onClose}></button></div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label className="form-label">구분 *</label>
              <select className="form-input" value={type} onChange={e => setType(e.target.value)}>
                <option value="receivable">미수금 (받을 돈)</option>
                <option value="payable">미지급금 (줄 돈)</option>
              </select>
            </div>
            <div>
              <label className="form-label">거래처</label>
              <select className="form-input" value={vendorName} onChange={e => setVendorName(e.target.value)}>
                <option value="">-- 선택 --</option>
                {vendors.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
            </div>
            <div><label className="form-label">금액 *</label><input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" min="0" /></div>
            <div><label className="form-label">발생일</label><input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label className="form-label">만기일</label><input className="form-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
            <div><label className="form-label">적요</label><input className="form-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="거래 내용" /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="btn btn-outline" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={() => {
              const amt = parseFloat(amount);
              if (!amt || amt <= 0) { showToast('금액을 입력해 주세요.', 'warning'); return; }
              onSave({ type, vendorName, amount: amt, date, dueDate, description: description.trim() });
            }}>등록</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  const [state, setState] = useStore();
  const entries  = state.accountEntries || [];
  const vendors  = state.vendorMaster || [];
  const invoices = state.taxInvoices || [];

  const [currentTab, setCurrentTab] = useState('receivable');
  const [settleEntry, setSettleEntry] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const today = todayStr();

  const receivables = useMemo(() => entries.filter(e => e.type === 'receivable'), [entries]);
  const payables    = useMemo(() => entries.filter(e => e.type === 'payable'), [entries]);

  const totalReceivable = useMemo(() => receivables.filter(e => !e.settled).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0), [receivables]);
  const totalPayable    = useMemo(() => payables.filter(e => !e.settled).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0), [payables]);
  const overdueR = useMemo(() => receivables.filter(e => !e.settled && e.dueDate && e.dueDate < today), [receivables, today]);
  const overdueP = useMemo(() => payables.filter(e => !e.settled && e.dueDate && e.dueDate < today), [payables, today]);
  const settledThisMonth = useMemo(() => entries.filter(e => e.settled && (e.settledDate || '').startsWith(today.slice(0, 7))).length, [entries, today]);

  const handleSettle = (entry, { settledDate, paymentMethod, settleNote }) => {
    const updated = entries.map(e => e.id === entry.id ? { ...e, settled: true, settledDate, paymentMethod, settleNote } : e);
    setState({ accountEntries: updated });
    addAuditLog('정산처리', entry.id, { vendor: entry.vendorName, amount: entry.amount, method: paymentMethod });
    showToast(`${entry.type === 'receivable' ? '미수금' : '미지급금'} 정산 완료! (${paymentMethod})`, 'success');
    setSettleEntry(null);
  };

  const handleDelete = (entry) => {
    if (!confirm(`이 전표를 삭제하시겠습니까?\n거래처: ${entry.vendorName} / 금액: ₩${fmt(entry.amount)}`)) return;
    setState({ accountEntries: entries.filter(e => e.id !== entry.id) });
    showToast('전표 삭제 완료', 'info');
  };

  const handleAddEntry = (data) => {
    const entry = { id: crypto.randomUUID(), ...data, settled: false };
    setState({ accountEntries: [...entries, entry] });
    addAuditLog('전표등록', entry.id, { vendor: data.vendorName, type: data.type, amount: data.amount });
    showToast('전표 등록 완료!', 'success');
    setShowAddModal(false);
  };

  const handleExport = () => {
    if (!entries.length) { showToast('데이터가 없습니다.', 'warning'); return; }
    downloadExcel(entries.map(e => ({
      '구분': e.type === 'receivable' ? '미수금(매출)' : '미지급금(매입)',
      '거래처': e.vendorName || '', '금액': parseFloat(e.amount) || 0,
      '발생일': e.date || '', '만기일': e.dueDate || '', '적요': e.description || '',
      '정산여부': e.settled ? '완료' : '미정산', '정산일': e.settledDate || '', '결제수단': e.paymentMethod || '',
    })), `정산장부_${today}`);
    showToast('장부를 내보냈습니다.', 'success');
  };

  const TABS = [
    { key: 'receivable',    label: `미수금 (${receivables.filter(e => !e.settled).length})` },
    { key: 'payable',       label: `미지급금 (${payables.filter(e => !e.settled).length})` },
    { key: 'vendor-summary',label: '거래처별 집계' },
    { key: 'invoices',      label: `세금계산서 (${invoices.length})` },
    { key: 'settled',       label: `정산완료 (${entries.filter(e => e.settled).length})` },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 미수금/미지급금 정산</h1>
          <div className="page-desc">판매 미수금과 구매 미지급금을 통합 관리하고 정산 처리합니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={handleExport}> 내보내기</button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ 수동 전표</button>
        </div>
      </div>

      {/* KPI */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">미수금 (받을 돈)</div>
          <div className="stat-value text-success">₩{fmt(totalReceivable)}</div>
          <div className="stat-sub">{overdueR.length ? <span style={{ color: 'var(--danger)' }}> 연체 {overdueR.length}건</span> : '연체 없음'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">미지급금 (줄 돈)</div>
          <div className="stat-value text-danger">₩{fmt(totalPayable)}</div>
          <div className="stat-sub">{overdueP.length ? <span style={{ color: 'var(--danger)' }}> 연체 {overdueP.length}건</span> : '연체 없음'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">순 채권 (미수 − 미지급)</div>
          <div className={`stat-value ${totalReceivable - totalPayable >= 0 ? 'text-success' : 'text-danger'}`}>₩{fmt(totalReceivable - totalPayable)}</div>
          <div className="stat-sub">{totalReceivable - totalPayable >= 0 ? '채권 우위' : '채무 우위'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">이번달 정산완료</div>
          <div className="stat-value text-accent">{settledThisMonth}건</div>
          <div className="stat-sub">{today.slice(0, 7)}</div>
        </div>
      </div>

      <AgingSummary receivables={receivables} />

      {/* 탭 */}
      <div className="scan-mode-bar" style={{ marginBottom: '12px', marginTop: '16px' }}>
        {TABS.map(t => (
          <button key={t.key} className={`scan-mode-btn${currentTab === t.key ? ' active' : ''}`} onClick={() => setCurrentTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="card card-flush">
        {currentTab === 'receivable'     && <EntryTable list={receivables.filter(e => !e.settled)} onSettle={setSettleEntry} onDelete={handleDelete} />}
        {currentTab === 'payable'        && <EntryTable list={payables.filter(e => !e.settled)} onSettle={setSettleEntry} onDelete={handleDelete} />}
        {currentTab === 'settled'        && <EntryTable list={entries.filter(e => e.settled)} onSettle={setSettleEntry} onDelete={handleDelete} />}
        {currentTab === 'vendor-summary' && <VendorSummary entries={entries} />}
        {currentTab === 'invoices'       && <InvoiceTable invoices={invoices} />}
      </div>

      {settleEntry && <SettleModal entry={settleEntry} onClose={() => setSettleEntry(null)} onConfirm={(data) => handleSettle(settleEntry, data)} />}
      {showAddModal && <AccountModal vendors={vendors} onClose={() => setShowAddModal(false)} onSave={handleAddEntry} />}
    </div>
  );
}
