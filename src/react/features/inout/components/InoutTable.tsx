import { useEffect, useState } from 'react';

import type { InoutSortKey } from '../../../domain/inout/selectors';
import { formatLocalDateLabel, normalizeYyyyMmDd } from '../../../utils/date';

const PAGE_SIZE = 20;

type InoutRow = {
  id?: string;
  type?: string;
  itemName?: string;
  itemCode?: string;
  quantity?: string | number;
  date?: string;
  createdAt?: string;
  vendor?: string;
  warehouse?: string;
  _index?: number;
};

type InoutTableProps = {
  rows: InoutRow[];
  sort: {
    key: InoutSortKey;
    direction: 'asc' | 'desc';
  };
  onSortChange: (key: InoutSortKey) => void;
  onDelete: (row: InoutRow) => void;
};

function SortableHeader({
  label,
  sortKey,
  sort,
  onSortChange,
}: {
  label: string;
  sortKey: InoutSortKey;
  sort: InoutTableProps['sort'];
  onSortChange: InoutTableProps['onSortChange'];
}) {
  const isActive = sort.key === sortKey;
  const indicator = isActive ? (sort.direction === 'asc' ? '▲' : '▼') : '↕';

  return (
    <button
      type="button"
      className={isActive ? 'react-sort-button is-active' : 'react-sort-button'}
      onClick={() => onSortChange(sortKey)}
      aria-label={`${label} 정렬`}
    >
      <span>{label}</span>
      <span className="react-sort-indicator">{indicator}</span>
    </button>
  );
}

function getTypeMeta(rawType?: string) {
  const type = String(rawType || '').toLowerCase();
  if (type === 'in') return { label: '입고', className: 'react-badge is-good' };
  if (type === 'out') return { label: '출고', className: 'react-badge is-warn' };
  return { label: '미분류', className: 'react-badge' };
}

export function InoutTable({ rows, sort, onSortChange, onDelete }: InoutTableProps) {
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [rows.length, sort.key, sort.direction]);

  const visibleRows = rows.slice(0, displayCount);
  const hasMore = rows.length > displayCount;

  return (
    <article className="react-card react-card--table">
      <div className="react-section-head">
        <div>
          <span className="react-card__eyebrow">입출고 이력</span>
          <h3>최근 거래 기록</h3>
        </div>
        <strong>
          {visibleRows.length} / {rows.length}건
        </strong>
      </div>

      <div className="react-data-table">
        <table>
          <thead>
            <tr>
              <th>
                <SortableHeader label="유형" sortKey="type" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>
                <SortableHeader label="품목" sortKey="itemName" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>
                <SortableHeader label="코드" sortKey="itemCode" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>
                <SortableHeader label="수량" sortKey="quantity" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>
                <SortableHeader label="날짜" sortKey="date" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>
                <SortableHeader label="거래처" sortKey="vendor" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>
                <SortableHeader label="창고" sortKey="warehouse" sort={sort} onSortChange={onSortChange} />
              </th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length ? (
              visibleRows.map((row, index) => {
                const dateLabel = normalizeYyyyMmDd(row.date)
                  ? formatLocalDateLabel(row.date)
                  : formatLocalDateLabel(row.createdAt);
                const typeMeta = getTypeMeta(row.type);
                return (
                  <tr key={row.id ?? `${String(row.date || '')}-${String(row.itemCode || row.itemName || '')}-${index}`}>
                    <td>
                      <span className={typeMeta.className}>{typeMeta.label}</span>
                    </td>
                    <td>{row.itemName || '-'}</td>
                    <td>{row.itemCode || '-'}</td>
                    <td>{row.quantity || '-'}</td>
                    <td>{dateLabel}</td>
                    <td>{row.vendor || '-'}</td>
                    <td>{row.warehouse || '-'}</td>
                    <td>
                      <button type="button" className="react-link-button is-danger" onClick={() => onDelete(row)}>
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="react-empty-cell">
                  현재 조건에 맞는 입출고 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore ? (
        <div className="react-load-more">
          <button
            type="button"
            className="react-secondary-button"
            onClick={() => setDisplayCount((prev) => prev + PAGE_SIZE)}
          >
            더 보기 ({rows.length - displayCount}건 남음)
          </button>
        </div>
      ) : null}
    </article>
  );
}
