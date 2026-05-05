import React from 'react';
import { STATUS } from '../../domain/salesConfig.js';

export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.draft;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
      {s.label}
    </span>
  );
}
