const COLLAPSE_STORAGE_KEY = 'invex:page-collapse:v1';

const TARGET_PAGES = new Set([
  // 관리
  'inventory',
  'inout',
  'bulk',
  'scanner',
  'labels',
  'warehouses',
  'transfer',
  'stocktake',
  'vendors',
  'auto-order',
  'orders',
  'forecast',
  // 보고 · 분석
  'summary',
  'weekly-report',
  'profit',
  'accounts',
  'costing',
  'dashboard',
  'tax-reports',
  'documents',
  'ledger',
  'auditlog',
]);

function loadCollapsedMap() {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCollapsedMap(map) {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors.
  }
}

function getSectionLabel(element, index) {
  if (element.classList.contains('stat-grid')) return '핵심 지표';
  if (element.classList.contains('toolbar')) return '검색 · 필터';

  const titleEl = element.querySelector('.card-title, .quick-start-title, h2, h3');
  if (titleEl?.textContent?.trim()) {
    return titleEl.textContent.trim().slice(0, 40);
  }
  return `섹션 ${index + 1}`;
}

function isCollapsibleCandidate(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
  if (element.classList.contains('page-header')) return false;
  if (element.classList.contains('auto-collapsible-section')) return false;
  if (element.classList.contains('inventory-collapsible-section')) return false;
  if (element.dataset.noCollapse === '1') return false;

  if (element.classList.contains('card')) return true;
  if (element.classList.contains('stat-grid')) return true;
  if (element.classList.contains('toolbar')) return true;
  return false;
}

function updateSectionUI(wrapper, collapsed) {
  wrapper.classList.toggle('is-collapsed', collapsed);
  const button = wrapper.querySelector('.auto-collapse-toggle');
  if (!button) return;
  const label = wrapper.dataset.sectionLabel || '섹션';
  button.textContent = `${label} ${collapsed ? '펼치기' : '접기'}`;
  button.setAttribute('aria-expanded', String(!collapsed));
  button.setAttribute('aria-label', `${label} ${collapsed ? '펼치기' : '접기'}`);
}

export function applyPageCollapsibleSections(container, pageName) {
  if (!container || !TARGET_PAGES.has(pageName)) return;

  const collapsedMap = loadCollapsedMap();
  const directChildren = Array.from(container.children);
  let sectionOrder = 0;

  directChildren.forEach((child) => {
    if (!isCollapsibleCandidate(child)) return;

    const sectionIndex = sectionOrder++;
    const label = getSectionLabel(child, sectionIndex);
    const classToken = [...child.classList].find(name => name !== 'card') || 'section';
    const sectionId = `${pageName}:${classToken}:${sectionIndex}`;

    const wrapper = document.createElement('section');
    wrapper.className = 'auto-collapsible-section';
    wrapper.dataset.sectionId = sectionId;
    wrapper.dataset.sectionLabel = label;

    const header = document.createElement('div');
    header.className = 'auto-collapse-header';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-ghost btn-sm auto-collapse-toggle';

    header.appendChild(button);
    const body = document.createElement('div');
    body.className = 'auto-collapsible-body';
    body.appendChild(child);

    wrapper.appendChild(header);
    wrapper.appendChild(body);
    container.insertBefore(wrapper, child.nextSibling);

    const collapsed = !!collapsedMap[sectionId];
    updateSectionUI(wrapper, collapsed);

    button.addEventListener('click', () => {
      const next = !wrapper.classList.contains('is-collapsed');
      if (next) {
        collapsedMap[sectionId] = true;
      } else {
        delete collapsedMap[sectionId];
      }
      saveCollapsedMap(collapsedMap);
      updateSectionUI(wrapper, next);
    });
  });
}
