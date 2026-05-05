import React from 'react';

export function TrendBadge({ pct }) {
  if (pct == null) return null;
  const up = pct > 0, down = pct < 0;
  return (
    <div style={{ fontSize: 11, color: up ? 'var(--success)' : down ? 'var(--danger)' : 'var(--text-muted)', marginTop: 2 }}>
      {up ? '▲' : down ? '▼' : '–'} {Math.abs(pct)}% 전월 대비
    </div>
  );
}
