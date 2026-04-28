/**
 * WarehousesPage.jsx - 다중 창고 관리
 */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { canAction } from '../auth.js';

const WH_TYPE_LABELS = { main: '본사 창고', branch: '지점 창고', factory: '공장/생산', temp: '임시 보관', returns: '반품 창고', other: '기타' };
const WH_TYPE_ICONS  = { main: '', branch: '', factory: '', temp: '', returns: '↩', other: '' };
const WH_TYPE_COLORS = { main: 'var(--accent)', branch: 'var(--success)', factory: '#f59e0b', temp: 'var(--text-muted)', returns: 'var(--danger)', other: 'var(--text-muted)' };

function fmt(n) { return Math.round(n || 0).toLocaleString('ko-KR'); }
function genId() { return 'wh-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4); }

const EMPTY_FORM = { id: '', name: '', type: 'branch', address: '', manager: '', memo: '' };

/** 창고 추가/수정 모달 */
function WarehouseModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name.trim()) { showToast('창고명을 입력해 주세요.', 'warning'); return; }
    onSave(form);
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3>{form.id ? '창고 수정' : '창고 추가'}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">창고명 <span className="required">*</span></label>
            <input className="form-input" placeholder="예: 부산 물류센터" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">창고 유형</label>
            <select className="form-select" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="main"> 본사 창고</option>
              <option value="branch"> 지점 창고</option>
              <option value="factory"> 공장/생산</option>
              <option value="temp"> 임시 보관</option>
              <option value="returns">↩ 반품 창고</option>
              <option value="other"> 기타</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">주소</label>
            <input className="form-input" placeholder="창고 소재지" value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">담당자</label>
            <input className="form-input" placeholder="관리 담당자명" value={form.manager} onChange={e => set('manager', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">메모</label>
            <textarea className="form-input" rows={2} placeholder="비고사항" value={form.memo} onChange={e => set('memo', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
}

/** 미배정 품목 배정 모달 */
function AssignModal({ items, warehouses, onClose, onAssign }) {
  const [target, setTarget] = useState(warehouses[0]?.name || '');
  const [checked, setChecked] = useState(new Set(items.map(i => i.itemName)));

  const toggle = (name) => setChecked(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const toggleAll = (v) => setChecked(v ? new Set(items.map(i => i.itemName)) : new Set());

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3> 미배정 품목 일괄 배정</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">배정할 창고</label>
            <select className="form-select" value={target} onChange={e => setTarget(e.target.value)}>
              {warehouses.map(w => <option key={w.id} value={w.name}>{WH_TYPE_ICONS[w.type] || ''} {w.name}</option>)}
            </select>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            총 {items.length}개 품목이 창고에 배정되지 않았습니다.
          </div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '30px' }}><input type="checkbox" checked={checked.size === items.length} onChange={e => toggleAll(e.target.checked)} /></th>
                  <th>품목명</th>
                  <th>코드</th>
                  <th className="text-right">수량</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.itemName}>
                    <td><input type="checkbox" checked={checked.has(item.itemName)} onChange={() => toggle(item.itemName)} /></td>
                    <td>{item.itemName}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{item.itemCode || '-'}</td>
                    <td className="text-right">{fmt(parseFloat(item.quantity) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={() => onAssign(target, null)}>전체 배정</button>
          <button className="btn btn-accent" onClick={() => onAssign(target, checked)}>선택 배정</button>
        </div>
      </div>
    </div>
  );
}

export default function WarehousesPage() {
  const navigate = useNavigate();
  const [state, setState] = useStore();
  const items = state.mappedData || [];
  const warehouses = state.warehouses || [];
  const transfers = state.transfers || [];
  const safetyStock = state.safetyStock || {};

  const [editModal, setEditModal] = useState(null); // null | EMPTY_FORM | warehouseObj
  const [showAssign, setShowAssign] = useState(false);

  // 창고별 통계
  const warehouseStats = useMemo(() => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return warehouses.map(wh => {
      const whItems = items.filter(i => i.warehouse === wh.name);
      const totalQty = whItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
      const totalValue = whItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0), 0);
      const recentTransfers = transfers.filter(t => (t.fromWarehouse === wh.name || t.toWarehouse === wh.name) && new Date(t.date) >= weekAgo).length;
      const lowStockCount = whItems.filter(i => { const min = safetyStock[i.itemName]; return min && (parseFloat(i.quantity) || 0) < min; }).length;
      return { ...wh, itemCount: whItems.length, totalQty, totalValue, recentTransfers, lowStockCount, whItems };
    });
  }, [warehouses, items, transfers, safetyStock]);

  const totalValue = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0), 0);
  const unassigned = items.filter(i => !i.warehouse || !warehouses.some(w => w.name === i.warehouse));

  const handleSaveWarehouse = (form) => {
    const current = [...(state.warehouses || [])];
    if (form.id) {
      const idx = current.findIndex(w => w.id === form.id);
      if (idx >= 0) {
        const oldName = current[idx].name;
        current[idx] = { ...current[idx], ...form };
        if (oldName !== form.name) {
          const updatedItems = items.map(i => i.warehouse === oldName ? { ...i, warehouse: form.name } : i);
          setState({ warehouses: current, mappedData: updatedItems });
        } else {
          setState({ warehouses: current });
        }
        showToast(`"${form.name}" 창고를 수정했습니다.`, 'success');
      }
    } else {
      if (current.some(w => w.name === form.name)) { showToast('이미 동일한 이름의 창고가 있습니다.', 'warning'); return; }
      current.push({ ...form, id: genId(), createdAt: new Date().toISOString() });
      setState({ warehouses: current });
      showToast(`"${form.name}" 창고를 추가했습니다.`, 'success');
    }
    setEditModal(null);
  };

  const handleDeleteWarehouse = (wh) => {
    if (!canAction('warehouse:delete')) { showToast('창고 삭제 권한이 없습니다. 관리자만 가능합니다.', 'warning'); return; }
    const whItems = items.filter(i => i.warehouse === wh.name);
    const msg = whItems.length > 0
      ? `"${wh.name}"에 ${whItems.length}개 품목이 있습니다.\n삭제하면 해당 품목들은 미배정 상태가 됩니다.\n계속하시겠습니까?`
      : `"${wh.name}" 창고를 삭제하시겠습니까?`;
    if (!confirm(msg)) return;
    const updates = { warehouses: warehouses.filter(w => w.id !== wh.id) };
    if (whItems.length > 0) updates.mappedData = items.map(i => i.warehouse === wh.name ? { ...i, warehouse: '' } : i);
    setState(updates);
    showToast(`"${wh.name}" 창고를 삭제했습니다.`, 'info');
  };

  const handleAssign = (target, selectedNames) => {
    const updatedItems = items.map(i => {
      if (i.warehouse && warehouses.some(w => w.name === i.warehouse)) return i;
      if (selectedNames && !selectedNames.has(i.itemName)) return i;
      return { ...i, warehouse: target };
    });
    const count = selectedNames ? selectedNames.size : unassigned.length;
    setState({ mappedData: updatedItems });
    showToast(`${count}개 품목을 "${target}"에 배정했습니다.`, 'success');
    setShowAssign(false);
  };

  return (
    <div>
      {editModal !== null && (
        <WarehouseModal
          initial={editModal}
          onClose={() => setEditModal(null)}
          onSave={handleSaveWarehouse}
        />
      )}
      {showAssign && (
        <AssignModal
          items={unassigned}
          warehouses={warehouses}
          onClose={() => setShowAssign(false)}
          onAssign={handleAssign}
        />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">다중 창고 관리</h1>
          <div className="page-desc">Enterprise — 창고별 재고 현황을 한눈에 관리합니다.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => {
            if (!canAction('warehouse:create')) { showToast('창고 추가 권한이 없습니다. 관리자만 가능합니다.', 'warning'); return; }
            setEditModal({ ...EMPTY_FORM });
          }}> 창고 추가</button>
          <button className="btn btn-ghost" title="미배정 품목을 창고에 배정" onClick={() => {
            if (unassigned.length === 0) { showToast('미배정 품목이 없습니다.', 'info'); return; }
            if (warehouses.length === 0) { showToast('먼저 창고를 추가해 주세요.', 'warning'); return; }
            setShowAssign(true);
          }}> 미배정 품목 ({unassigned.length})</button>
        </div>
      </div>

      {/* 전체 요약 */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '24px' }}>
        <div className="stat-card"><div className="stat-label">등록 창고</div><div className="stat-value">{warehouses.length}</div></div>
        <div className="stat-card"><div className="stat-label">총 품목 수</div><div className="stat-value">{fmt(items.length)}</div></div>
        <div className="stat-card"><div className="stat-label">총 재고 가치</div><div className="stat-value">₩{fmt(totalValue)}</div></div>
        <div className="stat-card" style={unassigned.length > 0 ? { borderColor: 'var(--warning)' } : {}}>
          <div className="stat-label">미배정 품목</div>
          <div className="stat-value" style={unassigned.length > 0 ? { color: 'var(--warning)' } : {}}>{unassigned.length}</div>
        </div>
      </div>

      {/* 창고 카드 그리드 */}
      {warehouseStats.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}></div>
          <div>등록된 창고가 없습니다. 창고를 추가해 주세요.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {warehouseStats.map(wh => (
            <div
              key={wh.id}
              className="card"
              style={{ cursor: 'pointer', transition: 'all 0.2s', borderLeft: `4px solid ${WH_TYPE_COLORS[wh.type] || 'var(--text-muted)'}` }}
              onClick={e => {
                if (e.target.closest('.btn-edit-wh') || e.target.closest('.btn-delete-wh')) return;
                setState({ activeWarehouseFilter: wh.name });
                navigate('/inventory');
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '24px', marginBottom: '4px' }}>{WH_TYPE_ICONS[wh.type] || ''}</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>{wh.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{WH_TYPE_LABELS[wh.type] || wh.type}{wh.manager ? ' · ' + wh.manager : ''}</div>
                  {wh.address && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}> {wh.address}</div>}
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn btn-ghost btn-sm btn-edit-wh" title="수정" onClick={e => { e.stopPropagation(); setEditModal({ ...wh }); }}></button>
                  {wh.type !== 'main' && (
                    <button className="btn btn-ghost btn-sm btn-delete-wh" title="삭제" onClick={e => { e.stopPropagation(); handleDeleteWarehouse(wh); }}></button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                {[
                  ['품목', `${wh.itemCount}종`],
                  ['총 수량', fmt(wh.totalQty)],
                  ['재고 가치', `₩${fmt(wh.totalValue)}`],
                  ['7일 이동', `${wh.recentTransfers}건`],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{value}</div>
                  </div>
                ))}
              </div>

              {wh.lowStockCount > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '8px', fontSize: '12px', color: 'var(--danger)' }}>
                   재고 부족 {wh.lowStockCount}건
                </div>
              )}

              {wh.whItems.length > 0 ? (
                <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>상위 품목</div>
                  {wh.whItems
                    .sort((a, b) => (parseFloat(b.quantity) || 0) * (parseFloat(b.unitPrice) || 0) - (parseFloat(a.quantity) || 0) * (parseFloat(a.unitPrice) || 0))
                    .slice(0, 3)
                    .map(item => (
                      <div key={item.itemName} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '2px 0' }}>
                        <span>{item.itemName}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{fmt(parseFloat(item.quantity) || 0)}개</span>
                      </div>
                    ))}
                  {wh.whItems.length > 3 && <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px' }}>+{wh.whItems.length - 3}건 더...</div>}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  아직 배정된 품목이 없습니다
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
