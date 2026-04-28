import React, { useState, useEffect } from 'react';

export function ColumnPanel({ fields, activeFields, onApply, onClose }) {
  const [checked, setChecked] = useState(new Set(activeFields));

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(key) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="col-settings-panel" style={{
      position: 'absolute', right: 0, top: '100%', zIndex: 200,
      background: 'var(--card-bg)', border: '1px solid var(--border)',
      borderRadius: 8, boxShadow: 'var(--shadow-lg)', padding: 16, minWidth: 260,
    }}>
      <div className="col-settings-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>표시 항목 선택</strong>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
      </div>
      <div className="col-settings-body" style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {fields.map(f => (
          <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={checked.has(f.key)} onChange={() => toggle(f.key)} />
            {f.label}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setChecked(new Set(fields.map(f => f.key)))}>전체 선택</button>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onApply([...checked])}>적용</button>
      </div>
    </div>
  );
}
