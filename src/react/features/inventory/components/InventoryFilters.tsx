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
  onChange: (next: {
    keyword: string;
    category: string;
    warehouse: string;
    focus: string;
  }) => void;
};

export function InventoryFilters({ filter, options, onChange }: InventoryFiltersProps) {
  return (
    <article className="react-card react-card--filters">
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
        {[
          { value: 'all', label: '전체' },
          { value: 'low', label: '부족 재고' },
          { value: 'missingVendor', label: '거래처 미설정' },
        ].map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={filter.focus === chip.value ? 'react-chip-button is-active' : 'react-chip-button'}
            onClick={() => onChange({ ...filter, focus: chip.value })}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </article>
  );
}

