/**
 * global-search.js - 글로벌 검색 (Ctrl+K 단축키)
 * 역할: 모든 페이지에서 품목, 거래처, 거래 기록을 즉시 검색
 * 왜 필수? → 1000개 이상 품목 관리 시 검색 없으면 사용 불가. 파워 유저 필수.
 */

import { getState } from './store.js';
import { escapeHtml as escHtml } from './ux-toolkit.js';

let navigateCallback = null;
let panelElement = null;

/**
 * 글로벌 검색 초기화
 * Ctrl+K 단축키 등록
 */
export function initGlobalSearch(navigateTo) {
  navigateCallback = navigateTo;

  document.addEventListener('keydown', (e) => {
    // Ctrl+K 또는 Cmd+K
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      toggleGlobalSearch();
    }
    // ESC로 닫기
    if (e.key === 'Escape' && panelElement) {
      closeGlobalSearch();
    }
  });
}

/**
 * 글로벌 검색 토글
 */
export function toggleGlobalSearch() {
  if (panelElement) {
    closeGlobalSearch();
  } else {
    openGlobalSearch();
  }
}

function openGlobalSearch() {
  panelElement = document.createElement('div');
  panelElement.className = 'global-search-overlay';
  panelElement.innerHTML = `
    <div class="global-search-panel" id="gs-panel">
      <div class="gs-input-wrap">
        <span class="gs-icon"></span>
        <input class="gs-input" id="gs-input" placeholder="품목, 거래처, 코드 검색... (ESC로 닫기)" autofocus />
        <span class="gs-shortcut">Ctrl+K</span>
      </div>
      <div class="gs-results" id="gs-results">
        <div class="gs-hint">검색어를 입력하세요</div>
      </div>
    </div>
  `;

  document.body.appendChild(panelElement);

  // 오버레이 클릭 시 닫기
  panelElement.addEventListener('click', (e) => {
    if (e.target === panelElement) closeGlobalSearch();
  });

  // 검색 입력
  const input = panelElement.querySelector('#gs-input');
  input.focus();
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    renderSearchResults(query);
  });

  // 키보드 네비게이션
  let selectedIndex = -1;
  input.addEventListener('keydown', (e) => {
    const results = panelElement.querySelectorAll('.gs-result-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
      highlightResult(results, selectedIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      highlightResult(results, selectedIndex);
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      results[selectedIndex].click();
    }
  });
}

function closeGlobalSearch() {
  if (panelElement) {
    panelElement.remove();
    panelElement = null;
  }
}

function highlightResult(results, index) {
  results.forEach((r, i) => {
    r.classList.toggle('gs-selected', i === index);
  });
  if (results[index]) {
    results[index].scrollIntoView({ block: 'nearest' });
  }
}

/**
 * 검색 결과 렌더링
 */
function renderSearchResults(query) {
  const resultsEl = panelElement.querySelector('#gs-results');

  if (!query || query.length < 1) {
    resultsEl.innerHTML = '<div class="gs-hint">검색어를 입력하세요</div>';
    return;
  }

  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const vendorMaster = state.vendorMaster || [];
  const results = [];

  // 1. 품목 검색
  items.forEach(item => {
    const matchFields = [item.itemName, item.itemCode, item.category, item.vendor, item.warehouse].join(' ').toLowerCase();
    if (matchFields.includes(query)) {
      results.push({
        type: 'item',
        icon: '',
        title: item.itemName,
        subtitle: `${item.itemCode || '-'} | 재고: ${parseFloat(item.quantity) || 0} | ${item.warehouse || '-'}`,
        page: 'inventory',
      });
    }
  });

  // 2. 거래처 검색
  vendorMaster.forEach(v => {
    const matchFields = [v.name, v.bizNumber, v.contactName, v.phone].join(' ').toLowerCase();
    if (matchFields.includes(query)) {
      results.push({
        type: 'vendor',
        icon: '',
        title: v.name,
        subtitle: `${v.type === 'supplier' ? '매입처' : '매출처'} | ${v.contactName || '-'} | ${v.phone || '-'}`,
        page: 'vendors',
      });
    }
  });

  // 3. 거래 기록 검색
  transactions.slice(-100).forEach(tx => {
    const matchFields = [tx.itemName, tx.itemCode, tx.note, tx.date].join(' ').toLowerCase();
    if (matchFields.includes(query)) {
      results.push({
        type: 'tx',
        icon: tx.type === 'in' ? '' : '',
        title: `${tx.itemName} (${tx.type === 'in' ? '+' : '-'}${tx.quantity})`,
        subtitle: `${tx.date} | ${tx.note || '-'}`,
        page: 'in',
      });
    }
  });

  // 4. 페이지 검색
  const pages = [
    { name: '대시보드', page: 'home', icon: '' },
    { name: '파일 업로드', page: 'upload', icon: '' },
    { name: '데이터 확인', page: 'mapping', icon: '' },
    { name: '재고 현황', page: 'inventory', icon: '' },
    { name: '입출고 관리', page: 'in', icon: '' },
    { name: '바코드 스캔', page: 'scanner', icon: '' },
    { name: '창고 이동', page: 'transfer', icon: '' },
    { name: '요약 보고', page: 'summary', icon: '' },
    { name: '고급 분석', page: 'dashboard', icon: '' },
    { name: '수불부', page: 'ledger', icon: '' },
    { name: '문서 생성 발주서 견적서', page: 'documents', icon: '' },
    { name: '거래처 관리', page: 'vendors', icon: '' },
    { name: '수불관리', page: 'stocktake', icon: '' },
    { name: '일괄 처리 발주 추천', page: 'bulk', icon: '' },
    { name: '설정 템플릿', page: 'settings', icon: '' },
  ];

  pages.forEach(p => {
    if (p.name.toLowerCase().includes(query)) {
      results.push({
        type: 'page',
        icon: p.icon,
        title: p.name,
        subtitle: '페이지 이동',
        page: p.page,
      });
    }
  });

  if (results.length === 0) {
    resultsEl.innerHTML = `<div class="gs-hint">검색 결과가 없습니다</div>`;
    return;
  }

  // 최대 15개로 제한
  const shown = results.slice(0, 15);

  resultsEl.innerHTML = shown.map((r, i) => `
    <div class="gs-result-item" data-page="${escHtml(r.page)}">
      <span class="gs-result-icon">${escHtml(r.icon)}</span>
      <div class="gs-result-content">
        <div class="gs-result-title">${escHtml(r.title)}</div>
        <div class="gs-result-subtitle">${escHtml(r.subtitle)}</div>
      </div>
      <span class="gs-result-type">${r.type === 'item' ? '품목' : r.type === 'vendor' ? '거래처' : r.type === 'tx' ? '거래' : '페이지'}</span>
    </div>
  `).join('') + (results.length > 15 ? `<div class="gs-hint">... 외 ${results.length - 15}건</div>` : '');

  // 클릭 이벤트
  resultsEl.querySelectorAll('.gs-result-item').forEach(el => {
    el.addEventListener('click', () => {
      if (navigateCallback) navigateCallback(el.dataset.page);
      closeGlobalSearch();
    });
  });
}
