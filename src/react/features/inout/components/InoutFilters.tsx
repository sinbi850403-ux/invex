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
  onChange: (next: {
    keyword: string;
    type: string;
    vendor: string;
    quick: string;
  }) => void;
};

export function InoutFilters({ filter, options, onChange }: InoutFiltersProps) {
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
        {[
          { value: 'all', label: '전체 흐름' },
          { value: 'today', label: '오늘' },
          { value: 'in', label: '입고' },
          { value: 'out', label: '출고' },
          { value: 'missingVendor', label: '거래처 미입력' },
        ].map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={filter.quick === chip.value ? 'react-chip-button is-active' : 'react-chip-button'}
            onClick={() => onChange({ ...filter, quick: chip.value })}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </article>
  );
}

