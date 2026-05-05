const NON_SORTABLE_HEADERS = new Set([
  '#',
  'no',
  '번호',
  '순위',
  '관리',
  '삭제',
  '선택',
  '액션',
  '작업',
  '상태',
]);

const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });

export function enableLocalReportSort(container) {
  if (!container) return;

  Array.from(container.querySelectorAll('.data-table')).forEach((table, tableIndex) => {
    table.dataset.autoSort = 'off';

    const headerRow = table.tHead?.rows?.[0];
    const tbody = table.tBodies?.[0];
    if (!headerRow || !tbody || !tbody.rows.length) return;

    Array.from(tbody.rows).forEach((row, rowIndex) => {
      if (!row.dataset.localSortOriginalIndex) {
        row.dataset.localSortOriginalIndex = String(rowIndex);
      }
    });

    if (!table.__localSortState) {
      table.__localSortState = { key: '', direction: '' };
    }

    Array.from(headerRow.cells).forEach((cell, cellIndex) => {
      const label = normalizeLabel(cell.textContent || '');
      if (!isSortableColumn(label, cellIndex) || hasInteractiveHeader(cell)) {
        cell.classList.remove('sortable-header', 'is-active');
        cell.removeAttribute('data-local-sort-key');
        cell.removeAttribute('aria-sort');
        return;
      }

      cell.dataset.localSortKey = String(cellIndex);
      cell.dataset.localSortLabel = cell.textContent || '';
      cell.classList.add('sortable-header');
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');

      if (!cell.dataset.localSortBound) {
        cell.addEventListener('click', () => {
          toggleSort(table, cellIndex);
        });
        cell.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          toggleSort(table, cellIndex);
        });
        cell.dataset.localSortBound = '1';
      }
    });

    table.dataset.localSortIndex = String(tableIndex);
    renderHeaderState(table);
  });
}

function toggleSort(table, columnIndex) {
  const key = String(columnIndex);
  const state = table.__localSortState || { key: '', direction: '' };

  if (state.key !== key) {
    state.key = key;
    state.direction = 'asc';
  } else if (state.direction === 'asc') {
    state.direction = 'desc';
  } else {
    state.key = '';
    state.direction = '';
  }

  table.__localSortState = state;
  applySort(table);
}

function applySort(table) {
  const tbody = table.tBodies?.[0];
  if (!tbody) return;

  const rows = Array.from(tbody.rows);
  const state = table.__localSortState || { key: '', direction: '' };

  let sortedRows = [...rows];
  if (state.key && state.direction) {
    const columnIndex = Number(state.key);
    const type = detectColumnType(sortedRows, columnIndex);
    sortedRows.sort((left, right) => compareRows(left, right, columnIndex, state.direction, type));
  } else {
    sortedRows.sort(compareOriginalOrder);
  }

  const fragment = document.createDocumentFragment();
  sortedRows.forEach((row) => fragment.appendChild(row));
  tbody.appendChild(fragment);
  renderHeaderState(table);
}

function renderHeaderState(table) {
  const headerRow = table.tHead?.rows?.[0];
  if (!headerRow) return;

  const state = table.__localSortState || { key: '', direction: '' };
  Array.from(headerRow.cells).forEach((cell, index) => {
    if (!cell.dataset.localSortKey) return;

    const isActive = state.key === String(index);
    const direction = isActive ? state.direction : '';
    const label = cell.dataset.localSortLabel || cell.textContent || '';

    const resizeHandle = cell.querySelector('.col-resize-handle');

    cell.classList.toggle('is-active', Boolean(direction));
    cell.setAttribute(
      'aria-sort',
      direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'
    );
    cell.innerHTML = `
      <button type="button" class="sort-hitbox" aria-hidden="true" tabindex="-1">
        <span class="sort-label">${escapeHtml(label)}</span>
        <span class="sort-indicator">${direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕'}</span>
      </button>
    `;
    if (resizeHandle) cell.appendChild(resizeHandle);
  });
}

function isSortableColumn(label, index) {
  if (!label) return false;
  if (index === 0 && ['#', 'no', '번호', '순위', '컬럼'].includes(label)) return false;
  return !NON_SORTABLE_HEADERS.has(label);
}

function hasInteractiveHeader(cell) {
  return Boolean(cell?.querySelector('input, select, textarea, button, label, [role="button"]'));
}

function detectColumnType(rows, columnIndex) {
  const samples = rows
    .map((row) => normalizeCell(row.cells[columnIndex]?.textContent || ''))
    .filter(Boolean)
    .slice(0, 20);

  if (!samples.length) return 'text';
  if (samples.every(isDateLike)) return 'date';
  if (samples.every(isNumericLike)) return 'number';
  return 'text';
}

function compareRows(left, right, columnIndex, direction, type) {
  const multiplier = direction === 'asc' ? 1 : -1;
  const leftValue = getComparableValue(left.cells[columnIndex]?.textContent || '', type);
  const rightValue = getComparableValue(right.cells[columnIndex]?.textContent || '', type);

  if (leftValue === null && rightValue === null) return compareOriginalOrder(left, right);
  if (leftValue === null) return 1;
  if (rightValue === null) return -1;

  let result = 0;
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    result = leftValue - rightValue;
  } else {
    result = collator.compare(String(leftValue), String(rightValue));
  }

  if (result === 0) return compareOriginalOrder(left, right);
  return result * multiplier;
}

function compareOriginalOrder(left, right) {
  return Number(left.dataset.localSortOriginalIndex || 0) - Number(right.dataset.localSortOriginalIndex || 0);
}

function getComparableValue(rawValue, type) {
  const value = normalizeCell(rawValue);
  if (!value) return null;

  if (type === 'date') {
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  if (type === 'number') {
    const cleaned = value.replace(/[^\d.-]/g, '');
    const numeric = Number.parseFloat(cleaned);
    return Number.isNaN(numeric) ? null : numeric;
  }

  return value.toLowerCase();
}

function normalizeCell(value) {
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  if (!normalized || normalized === '-' || normalized === '—') return '';
  return normalized;
}

function normalizeLabel(value) {
  return String(value).replace(/\s+/g, '').trim().toLowerCase();
}

function isDateLike(value) {
  return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(value);
}

function isNumericLike(value) {
  const cleaned = value.replace(/[^\d.-]/g, '');
  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
