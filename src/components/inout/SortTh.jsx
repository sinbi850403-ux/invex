import React from 'react';

export function SortTh({ sortKey, sort, onSort, children, className = '', rowSpan, colSpan, style = {} }) {
  const isActive = sort.key === sortKey;
  const indicator = !isActive ? '↕' : sort.dir === 'asc' ? '↑' : '↓';
  return (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
      className={`sortable-header ${isActive ? 'is-active' : ''} ${className}`}
      style={{ cursor: 'pointer', userSelect: 'none', verticalAlign: 'middle', textTransform: 'none', fontSize: '13px', ...style }}
      onClick={() => onSort(sortKey)}
    >
      {children} <span className="sort-indicator" style={{ fontSize: '10px', opacity: 0.6 }}>{indicator}</span>
    </th>
  );
}
