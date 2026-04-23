type InoutFiltersProps = {
  filter: {
    keyword: string;
    type: string;
    vendor: string;
    quick: string;
  };
  options: {
    vendors: string[];
  };
  resultCount: number;
  totalCount: number;
  onChange: (next: {
    keyword: string;
    type: string;
    vendor: string;
    quick: string;
  }) => void;
};

const QUICK_FILTERS = [
  { value: 'all', label: '전체 흐름' },
  { value: 'today', label: '오늘' },
  { value: 'in', label: '입고' },
  { value: 'out', label: '출고' },
  { value: 'missingVendor', label: '거래처 미입력' },
] as const;

export function InoutFilters({ filter, options, resultCount, totalCount, onChange }: InoutFiltersProps) {
  const hasActiveFilter = Boolean(filter.keyword || filter.type || filter.vendor || filter.quick !== 'all');

  function resetFilters() {
    onChange({
      keyword: '',
      type: '',
      vendor: '',
      quick: 'all',
    });
  }

  return (
    <article className="react-card react-card--filters">
      <div className="react-section-head react-section-head--compact">
        <div>
          <span className="react-card__eyebrow">필터</span>
          <h3>원하는 거래만 빠르게 찾기</h3>
        </div>
        <strong className="react-filter-summary">
          {resultCount} / {totalCount}건 표시
        </strong>
      </div>

      <div className="react-toolbar">
        <input
          className="react-input"
          value={filter.keyword}
          onChange={(event) => onChange({ ...filter, keyword: event.target.value })}
          placeholder="품목명, 코드, 거래처 검색"
        />
        <select
          className="react-select"
          value={filter.type}
          onChange={(event) => onChange({ ...filter, type: event.target.value })}
        >
          <option value="">전체 유형</option>
          <option value="in">입고</option>
          <option value="out">출고</option>
        </select>
        <select
          className="react-select"
          value={filter.vendor}
          onChange={(event) => onChange({ ...filter, vendor: event.target.value })}
        >
          <option value="">전체 거래처</option>
          {options.vendors.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="react-chip-row">
        {QUICK_FILTERS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={filter.quick === chip.value ? 'react-chip-button is-active' : 'react-chip-button'}
            onClick={() => onChange({ ...filter, quick: chip.value })}
          >
            {chip.label}
          </button>
        ))}

        {hasActiveFilter ? (
          <button type="button" className="react-chip-button react-chip-button--ghost" onClick={resetFilters}>
            필터 초기화
          </button>
        ) : null}
      </div>
    </article>
  );
}
