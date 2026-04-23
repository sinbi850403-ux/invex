type InventoryFiltersProps = {
  filter: {
    keyword: string;
    category: string;
    warehouse: string;
    focus: string;
  };
  options: {
    categories: string[];
    warehouses: string[];
  };
  resultCount: number;
  totalCount: number;
  onChange: (next: {
    keyword: string;
    category: string;
    warehouse: string;
    focus: string;
  }) => void;
};

const QUICK_FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'low', label: '부족 재고' },
  { value: 'outOfStock', label: '품절' },
  { value: 'missingVendor', label: '거래처 미입력' },
  { value: 'missingWarehouse', label: '창고 미입력' },
] as const;

export function InventoryFilters({ filter, options, resultCount, totalCount, onChange }: InventoryFiltersProps) {
  const hasActiveFilter = Boolean(filter.keyword || filter.category || filter.warehouse || filter.focus !== 'all');

  function resetFilters() {
    onChange({
      keyword: '',
      category: '',
      warehouse: '',
      focus: 'all',
    });
  }

  return (
    <article className="react-card react-card--filters">
      <div className="react-section-head react-section-head--compact">
        <div>
          <span className="react-card__eyebrow">필터</span>
          <h3>필요한 재고만 빠르게 보기</h3>
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
          value={filter.category}
          onChange={(event) => onChange({ ...filter, category: event.target.value })}
        >
          <option value="">전체 카테고리</option>
          {options.categories.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          className="react-select"
          value={filter.warehouse}
          onChange={(event) => onChange({ ...filter, warehouse: event.target.value })}
        >
          <option value="">전체 창고</option>
          {options.warehouses.map((option) => (
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
            className={filter.focus === chip.value ? 'react-chip-button is-active' : 'react-chip-button'}
            onClick={() => onChange({ ...filter, focus: chip.value })}
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
