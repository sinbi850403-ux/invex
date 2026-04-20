import { getState, setState } from './store.js';

const mountedContainers = new WeakMap();

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
]);

const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });

export function mountAutoTableSort(container) {
  if (!container) return;

  const existing = mountedContainers.get(container);
  if (existing) {
    existing.schedule();
    return;
  }

  let rafId = 0;
  const schedule = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      enhanceTables(container);
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(container, { childList: true, subtree: true });

  mountedContainers.set(container, { observer, schedule });
  schedule();
}

function enhanceTables(container) {
  Array.from(container.querySelectorAll('.data-table')).forEach((table, index) => {
    if (shouldSkipTable(table)) return;
    table.dataset.autoSortIndex = String(index);
    ensureOriginalIndexes(table);
    ensureSortState(table);
    ensureSummaryBar(table);
    applyResponsiveLabels(table);
    decorateHeaders(table);
    applyTableSort(table);
  });
}

function shouldSkipTable(table) {
  if (table.dataset.autoSort === 'off') return true;

  const thead = table.tHead;
  const tbody = table.tBodies[0];
  if (!thead || !tbody || !tbody.rows.length) return true;

  const headerCells = Array.from(thead.querySelectorAll('th'));
  if (headerCells.some(th => hasInteractiveHeader(th))) return true;

  return headerCells.some(th => {
    const isCustomSortable = th.dataset.sortKey || (th.classList.contains('sortable-header') && !th.dataset.autoSortKey);
    return Boolean(isCustomSortable);
  });
}

function ensureOriginalIndexes(table) {
  Array.from(table.tBodies[0].rows).forEach((row, index) => {
    if (!row.dataset.autoSortOriginalIndex) {
      row.dataset.autoSortOriginalIndex = String(index);
    }
  });
}

function ensureSortState(table) {
  if (table.__autoSortState) return;

  const saved = getSavedSortState(table);
  table.__autoSortState = saved
    ? { key: String(saved.key), direction: saved.direction, type: 'text' }
    : { key: '', direction: '', type: 'text' };
}

function ensureSummaryBar(table) {
  const wrapper = table.closest('.table-wrapper') || table.parentElement;
  if (!wrapper || !wrapper.parentElement) return;

  let summary = table.__autoSortSummary;
  if (!summary || !summary.isConnected) {
    summary = document.createElement('div');
    summary.className = 'filter-summary auto-sort-summary';
    summary.addEventListener('click', event => {
      const resetButton = event.target.closest('[data-auto-sort-reset]');
      if (!resetButton) return;
      table.__autoSortState = { key: '', direction: '', type: 'text' };
      persistSortState(table);
      applyTableSort(table);
    });
    wrapper.parentElement.insertBefore(summary, wrapper);
    table.__autoSortSummary = summary;
  }
}

function decorateHeaders(table) {
  const headerRow = getHeaderRow(table);
  if (!headerRow) return;

  Array.from(headerRow.cells).forEach((cell, index) => {
    const displayLabel = cell.dataset.autoSortDisplayLabel || extractCellLabel(cell);
    const normalizedLabel = normalizeHeaderLabel(displayLabel);

    cell.dataset.autoSortDisplayLabel = displayLabel;
    cell.dataset.autoSortNormalizedLabel = normalizedLabel;

    if (cell.dataset.autoSortIgnore === 'true' || !isSortableColumn(normalizedLabel, index)) {
      cell.removeAttribute('data-auto-sort-key');
      cell.classList.remove('sortable-header', 'is-active');
      cell.removeAttribute('aria-sort');
      return;
    }

    cell.dataset.autoSortKey = String(index);
    cell.classList.add('sortable-header');
    cell.title = '클릭해서 정렬';
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('role', 'button');

    if (!cell.dataset.autoSortBound) {
      cell.addEventListener('click', () => toggleTableSort(table, index));
      cell.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleTableSort(table, index);
      });
      cell.dataset.autoSortBound = '1';
    }
  });

  renderHeaderState(table);
}

function applyResponsiveLabels(table) {
  const headerRow = getHeaderRow(table);
  if (!headerRow) return;
  const labels = Array.from(headerRow.cells).map(cell => extractCellLabel(cell));
  Array.from(table.tBodies[0]?.rows || []).forEach(row => {
    Array.from(row.cells).forEach((cell, index) => {
      const label = labels[index] || '';
      if (label) cell.dataset.label = label;
    });
  });
}

function toggleTableSort(table, index) {
  const state = table.__autoSortState || { key: '', direction: '' };
  const key = String(index);

  if (state.key !== key) {
    state.key = key;
    state.direction = 'asc';
  } else if (state.direction === 'asc') {
    state.direction = 'desc';
  } else {
    state.key = '';
    state.direction = '';
  }

  table.__autoSortState = state;
  persistSortState(table);
  applyTableSort(table);
}

function applyTableSort(table) {
  const tbody = table.tBodies[0];
  const rows = Array.from(tbody.rows);
  const state = table.__autoSortState || { key: '', direction: '' };
  const visibleRows = rows.filter(row => !row.hidden);
  const hiddenRows = rows.filter(row => row.hidden).sort(compareOriginalOrder);

  let sortedVisibleRows;
  if (!state.key || !state.direction) {
    sortedVisibleRows = [...visibleRows].sort(compareOriginalOrder);
    state.type = 'text';
  } else {
    const columnIndex = Number(state.key);
    const type = detectColumnType(visibleRows, columnIndex);
    state.type = type;
    sortedVisibleRows = [...visibleRows].sort((a, b) => compareRows(a, b, columnIndex, state.direction, type));
  }

  const fragment = document.createDocumentFragment();
  [...sortedVisibleRows, ...hiddenRows].forEach(row => fragment.appendChild(row));
  tbody.appendChild(fragment);

  renumberIndexColumn(table);
  renderHeaderState(table);
  renderSummaryState(table);
}

function renderHeaderState(table) {
  const headerRow = getHeaderRow(table);
  if (!headerRow) return;
  const state = table.__autoSortState || { key: '', direction: '' };

  Array.from(headerRow.cells).forEach((cell, index) => {
    if (!cell.dataset.autoSortKey) return;

    const direction = state.key === String(index) ? state.direction : '';
    const label = cell.dataset.autoSortDisplayLabel || extractCellLabel(cell);

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
  });
}

function renderSummaryState(table) {
  const summary = table.__autoSortSummary;
  if (!summary) return;

  const state = table.__autoSortState || { key: '', direction: '' };
  const headerRow = getHeaderRow(table);
  const rows = Array.from(table.tBodies[0].rows);
  const visibleCount = rows.filter(row => !row.hidden).length;
  const totalCount = rows.length;

  let sortLabel = '원본 순서';
  if (state.key && state.direction && headerRow?.cells[state.key]) {
    const headerLabel = headerRow.cells[state.key].dataset.autoSortDisplayLabel || extractCellLabel(headerRow.cells[state.key]);
    sortLabel = `${headerLabel} ${state.direction === 'asc' ? '오름차순' : '내림차순'}`;
  }

  summary.innerHTML = `
    <div class="filter-summary-row">
      <div class="filter-summary-count">표시 ${visibleCount}건 / 전체 ${totalCount}건</div>
      <div class="filter-summary-chips">
        <span class="filter-chip ${state.key ? '' : 'filter-chip-muted'}">정렬: ${escapeHtml(sortLabel)}</span>
        <span class="filter-chip filter-chip-muted">헤더 전체 클릭으로 정렬</span>
        ${state.key ? '<button type="button" class="filter-chip filter-chip-action" data-auto-sort-reset="1">정렬 초기화</button>' : ''}
      </div>
    </div>
  `;
}

function renumberIndexColumn(table) {
  const headerRow = getHeaderRow(table);
  const firstHeaderLabel = normalizeHeaderLabel(headerRow?.cells[0]?.dataset.autoSortDisplayLabel || headerRow?.cells[0]?.textContent || '');
  if (!['#', 'no', '번호'].includes(firstHeaderLabel)) return;

  Array.from(table.tBodies[0].rows).forEach((row, index) => {
    const firstCell = row.cells[0];
    if (!firstCell) return;
    firstCell.textContent = String(index + 1);
  });
}

function getHeaderRow(table) {
  return table.tHead?.rows?.[0] || null;
}

function isSortableColumn(label, index) {
  if (!label) return false;
  if (index === 0 && ['#', 'no', '번호', '순위'].includes(label)) {
    return false;
  }
  return !NON_SORTABLE_HEADERS.has(label);
}

function hasInteractiveHeader(cell) {
  if (!cell) return false;
  return Boolean(cell.querySelector('input, select, textarea, button, label, [role="button"]'));
}

function compareRows(a, b, columnIndex, direction, type) {
  const multiplier = direction === 'asc' ? 1 : -1;
  const av = getComparableValue(a.cells[columnIndex]?.textContent || '', type);
  const bv = getComparableValue(b.cells[columnIndex]?.textContent || '', type);

  if (av === null && bv === null) return compareOriginalOrder(a, b);
  if (av === null) return 1;
  if (bv === null) return -1;

  let result = 0;
  if (typeof av === 'number' && typeof bv === 'number') {
    result = av - bv;
  } else {
    result = collator.compare(String(av), String(bv));
  }

  if (result === 0) {
    return compareOriginalOrder(a, b);
  }
  return result * multiplier;
}

function compareOriginalOrder(a, b) {
  return Number(a.dataset.autoSortOriginalIndex || 0) - Number(b.dataset.autoSortOriginalIndex || 0);
}

function detectColumnType(rows, columnIndex) {
  const samples = rows
    .map(row => normalizeCell(row.cells[columnIndex]?.textContent || ''))
    .filter(Boolean)
    .slice(0, 20);

  if (!samples.length) return 'text';
  if (samples.every(isDateLike)) return 'date';
  if (samples.every(isNumericLike)) return 'number';
  return 'text';
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

function isDateLike(value) {
  return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(value);
}

function isNumericLike(value) {
  const cleaned = value.replace(/[^\d.-]/g, '');
  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

function normalizeCell(value) {
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  if (!normalized || normalized === '-' || normalized === '—') return '';
  return normalized;
}

function extractCellLabel(cell) {
  return normalizeCell(cell.textContent || '').replace(/[↑↓↕]/g, '').trim() || '컬럼';
}

function normalizeHeaderLabel(value) {
  return String(value).replace(/\s+/g, '').trim().toLowerCase();
}

function getSavedSortState(table) {
  const prefs = getState().tableSortPrefs || {};
  const persistKey = getPersistKey(table);
  const saved = prefs[persistKey];
  if (!saved || !saved.key || !saved.direction) return null;
  if (!['asc', 'desc'].includes(saved.direction)) return null;
  return saved;
}

function persistSortState(table) {
  const persistKey = getPersistKey(table);
  if (!persistKey) return;

  const current = getState().tableSortPrefs || {};
  const next = { ...current };
  const state = table.__autoSortState || { key: '', direction: '' };

  if (state.key && state.direction) {
    next[persistKey] = { key: state.key, direction: state.direction };
  } else {
    delete next[persistKey];
  }

  if (JSON.stringify(current[persistKey] || null) === JSON.stringify(next[persistKey] || null)) {
    return;
  }

  setState({ tableSortPrefs: next });
}

function getPersistKey(table) {
  const pageKey = table.closest('[data-page]')?.dataset.page || 'unknown';
  const explicitKey = table.dataset.autoSortId || table.id;
  if (explicitKey) return `${pageKey}::${explicitKey}`;

  const cardTitle = table.closest('.card')?.querySelector('.card-title')?.textContent || '';
  const headerSignature = Array.from(getHeaderRow(table)?.cells || [])
    .slice(0, 4)
    .map(cell => normalizeHeaderLabel(cell.dataset.autoSortDisplayLabel || cell.textContent || ''))
    .filter(Boolean)
    .join('|');

  return `${pageKey}::${normalizeHeaderLabel(cardTitle || 'table')}::${headerSignature || table.dataset.autoSortIndex || '0'}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
