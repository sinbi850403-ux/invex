/**
 * ApiPage.jsx - API 연동 관리 (Enterprise)
 */
import React, { useState } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';

function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let key = 'invex_';
  for (let i = 0; i < 32; i++) key += chars[bytes[i] % chars.length];
  return key;
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const WEBHOOK_EVENTS = [
  { id: 'stock.low', label: '재고 부족' },
  { id: 'inbound.created', label: '입고 등록' },
  { id: 'outbound.created', label: '출고 등록' },
  { id: 'transfer.created', label: '창고 이동' },
  { id: 'item.created', label: '품목 추가' },
  { id: 'item.deleted', label: '품목 삭제' },
];

const API_ENDPOINTS = [
  { group: ' 재고 관리', items: [
    { method: 'GET', path: '/api/v1/items', desc: '전체 품목 조회' },
    { method: 'POST', path: '/api/v1/items', desc: '품목 추가' },
    { method: 'PUT', path: '/api/v1/items/:id', desc: '품목 수정' },
    { method: 'DEL', path: '/api/v1/items/:id', desc: '품목 삭제' },
  ]},
  { group: ' 입출고', items: [
    { method: 'GET', path: '/api/v1/transactions', desc: '이력 조회' },
    { method: 'POST', path: '/api/v1/inbound', desc: '입고 등록' },
    { method: 'POST', path: '/api/v1/outbound', desc: '출고 등록' },
  ]},
  { group: ' 창고', items: [
    { method: 'GET', path: '/api/v1/warehouses', desc: '창고 목록' },
    { method: 'POST', path: '/api/v1/transfers', desc: '창고 이동' },
  ]},
  { group: ' 거래처', items: [
    { method: 'GET', path: '/api/v1/vendors', desc: '거래처 목록' },
    { method: 'POST', path: '/api/v1/vendors', desc: '거래처 추가' },
  ]},
];

const METHOD_BADGE = {
  GET:  { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  POST: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  PUT:  { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  DEL:  { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
};

/* ── API 키 생성 모달 ── */
function KeyModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState('read');

  const handleSave = () => {
    if (!name.trim()) { showToast('키 이름을 입력해 주세요.', 'warning'); return; }
    onSave({ name: name.trim(), scope });
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h3> API 키 생성</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">키 이름 <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="예: 쇼핑몰 연동, POS 시스템" />
          </div>
          <div className="form-group">
            <label className="form-label">권한 범위</label>
            <select className="form-select" value={scope} onChange={e => setScope(e.target.value)}>
              <option value="read"> 읽기 전용 (조회만 가능)</option>
              <option value="write"> 읽기/쓰기 (조회 + 등록/수정)</option>
              <option value="full"> 전체 (삭제 포함)</option>
            </select>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '10px', fontSize: '12px', color: 'var(--danger)' }}>
             API 키 생성 후에는 키 값을 다시 확인할 수 없습니다. 반드시 안전한 곳에 보관하세요.
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={handleSave}>생성</button>
        </div>
      </div>
    </div>
  );
}

/* ── Webhook 추가 모달 ── */
function WebhookModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState(new Set());

  const toggleEvent = (id) => {
    setEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    if (!name.trim() || !url.trim()) { showToast('이름과 URL을 입력해 주세요.', 'warning'); return; }
    if (events.size === 0) { showToast('최소 1개의 이벤트를 선택해 주세요.', 'warning'); return; }
    onSave({ name: name.trim(), url: url.trim(), events: [...events] });
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3> Webhook 추가</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">이름 <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="예: 슬랙 알림" />
          </div>
          <div className="form-group">
            <label className="form-label">URL <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://hooks.slack.com/..." />
          </div>
          <div className="form-group">
            <label className="form-label">트리거 이벤트</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              {WEBHOOK_EVENTS.map(ev => (
                <label key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={events.has(ev.id)} onChange={() => toggleEvent(ev.id)} />
                  <span style={{ fontSize: '13px' }}>{ev.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={handleSave}>추가</button>
        </div>
      </div>
    </div>
  );
}

export default function ApiPage() {
  const [state, setState] = useStore();
  const apiKeys = state.apiKeys || [];
  const webhooks = state.webhooks || [];

  const [visibleKeys, setVisibleKeys] = useState(new Set());
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);

  const toggleKeyVisibility = (id) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleGenKey = ({ name, scope }) => {
    const newKey = {
      id: 'key-' + Date.now().toString(36),
      name, scope,
      key: generateApiKey(),
      createdAt: new Date().toISOString(),
      lastUsed: null,
    };
    setState({ apiKeys: [...apiKeys, newKey] });
    setVisibleKeys(prev => new Set([...prev, newKey.id]));
    showToast(`API 키 "${name}"이 생성되었습니다. 키를 복사해 안전하게 보관하세요.`, 'success');
    setShowKeyModal(false);
  };

  const handleRevokeKey = (keyId) => {
    if (!window.confirm('이 API 키를 폐기하시겠습니까? 이 키를 사용하는 모든 연동이 중단됩니다.')) return;
    setState({ apiKeys: apiKeys.filter(k => k.id !== keyId) });
    showToast('API 키를 폐기했습니다.', 'info');
  };

  const handleCopyKey = (key) => {
    navigator.clipboard.writeText(key)
      .then(() => showToast('API 키가 클립보드에 복사되었습니다.', 'success'))
      .catch(() => showToast('복사에 실패했습니다. 수동으로 복사해 주세요.', 'error'));
  };

  const handleAddWebhook = ({ name, url, events }) => {
    const newWebhook = {
      id: 'wh-' + Date.now().toString(36),
      name, url, events,
      active: true,
      createdAt: new Date().toISOString(),
    };
    setState({ webhooks: [...webhooks, newWebhook] });
    showToast(`Webhook "${name}"을 추가했습니다.`, 'success');
    setShowWebhookModal(false);
  };

  const handleDeleteWebhook = (whId) => {
    if (!window.confirm('이 Webhook을 삭제하시겠습니까?')) return;
    setState({ webhooks: webhooks.filter(w => w.id !== whId) });
    showToast('Webhook을 삭제했습니다.', 'info');
  };

  const scopeBadge = (scope) => {
    if (scope === 'full') return { cls: 'badge-warning', text: '전체' };
    if (scope === 'read') return { cls: 'badge-info', text: '읽기' };
    return { cls: 'badge-success', text: '쓰기' };
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> API 연동</h1>
          <div className="page-desc">Enterprise — 외부 시스템과 데이터를 연동하고 API 키를 관리합니다.</div>
        </div>
      </div>

      {/* API 키 관리 */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div className="card-title" style={{ margin: 0 }}> API 키</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowKeyModal(true)}>+ 새 API 키 생성</button>
        </div>
        {apiKeys.length > 0 ? (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>API 키</th>
                  <th>권한</th>
                  <th>생성일</th>
                  <th>마지막 사용</th>
                  <th style={{ width: '80px' }}></th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map(k => {
                  const visible = visibleKeys.has(k.id);
                  const badge = scopeBadge(k.scope);
                  return (
                    <tr key={k.id}>
                      <td><strong>{k.name}</strong></td>
                      <td>
                        <code style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                          {visible ? k.key : `${k.key.substring(0, 10)}${'•'.repeat(22)}`}
                        </code>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleKeyVisibility(k.id)} title="키 표시/숨김" style={{ marginLeft: '4px' }}>
                          {visible ? '' : ''}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleCopyKey(k.key)} title="복사" style={{ marginLeft: '2px' }}></button>
                      </td>
                      <td><span className={`badge ${badge.cls}`}>{badge.text}</span></td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatDate(k.createdAt)}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{k.lastUsed || '사용 전'}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleRevokeKey(k.id)} style={{ color: 'var(--danger)' }}>폐기</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}></div>
            <div>아직 생성된 API 키가 없습니다.</div>
          </div>
        )}
      </div>

      {/* Webhook 설정 */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div className="card-title" style={{ margin: 0 }}> Webhook</div>
          <button className="btn btn-accent btn-sm" onClick={() => setShowWebhookModal(true)}>+ Webhook 추가</button>
        </div>
        {webhooks.length > 0 ? (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>이름</th><th>URL</th><th>이벤트</th><th>상태</th><th style={{ width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map(wh => (
                  <tr key={wh.id}>
                    <td><strong>{wh.name}</strong></td>
                    <td style={{ fontSize: '12px' }}><code>{wh.url}</code></td>
                    <td>{(Array.isArray(wh.events) ? wh.events : []).map(e => (
                      <span key={e} className="badge badge-default" style={{ margin: '1px' }}>{e}</span>
                    ))}</td>
                    <td><span className={`badge ${wh.active ? 'badge-success' : 'badge-default'}`}>{wh.active ? '활성' : '비활성'}</span></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => handleDeleteWebhook(wh.id)}></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}></div>
            <div>등록된 Webhook이 없습니다.</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>재고 변동, 입출고 발생 등의 이벤트를 외부로 알릴 수 있습니다.</div>
          </div>
        )}
      </div>

      {/* API 레퍼런스 */}
      <div className="card">
        <div className="card-title"> API 레퍼런스</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          INVEX API를 사용하여 외부 시스템과 재고 데이터를 연동하세요.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          {API_ENDPOINTS.map(section => (
            <div key={section.group} style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px' }}>
              <div style={{ fontWeight: 700, marginBottom: '8px' }}>{section.group}</div>
              {section.items.map((ep, i) => {
                const mb = METHOD_BADGE[ep.method] || METHOD_BADGE.GET;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: i < section.items.length - 1 ? '1px solid var(--border)' : 'none', fontSize: '12px' }}>
                    <span style={{ background: mb.bg, color: mb.color, borderRadius: '4px', padding: '1px 6px', fontSize: '10px', minWidth: '36px', textAlign: 'center', fontWeight: 600 }}>{ep.method}</span>
                    <code style={{ fontFamily: 'monospace', fontSize: '12px' }}>{ep.path}</code>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: 'auto' }}>{ep.desc}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
          <div style={{ fontWeight: 700, marginBottom: '8px' }}> 인증 방식</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            모든 API 요청에 <code>Authorization</code> 헤더를 포함해야 합니다.
          </div>
          <pre style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '6px', fontSize: '12px', overflowX: 'auto', color: 'var(--text-primary)', margin: 0 }}>
{`curl -X GET https://api.invex.kr/v1/items \\
  -H "Authorization: Bearer invex_YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
          </pre>
        </div>

        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontWeight: 700, marginBottom: '8px' }}> 응답 예시</div>
          <pre style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '6px', fontSize: '12px', overflowX: 'auto', color: 'var(--text-primary)', margin: 0 }}>
{`{
  "success": true,
  "data": [
    {
      "itemName": "A4용지",
      "itemCode": "P-001",
      "quantity": 500,
      "unitPrice": 5000,
      "warehouse": "본사 창고",
      "category": "사무용품"
    }
  ],
  "total": 142,
  "page": 1
}`}
          </pre>
        </div>
      </div>

      {showKeyModal && <KeyModal onSave={handleGenKey} onClose={() => setShowKeyModal(false)} />}
      {showWebhookModal && <WebhookModal onSave={handleAddWebhook} onClose={() => setShowWebhookModal(false)} />}
    </div>
  );
}
