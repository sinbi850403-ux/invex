/**
 * sidebar-customize.js — 사이드바 항목 표시/숨김 커스터마이징
 *
 * 사용자가 원하는 허브 메뉴만 사이드바에 표시할 수 있게 함.
 * 설정은 localStorage에 저장되며 로그인 상태와 무관하게 유지됨.
 */

const STORAGE_KEY = 'invex:sidebar-hidden';

// 커스터마이징 가능한 모든 항목 정의 (home은 항상 표시)
const ALL_NAV_ITEMS = [
  { page: 'hub-data',      icon: '📂', label: '데이터 가져오기' },
  { page: 'hub-inventory', icon: '📦', label: '재고 관리' },
  { page: 'hub-warehouse', icon: '🏢', label: '창고·거래처' },
  { page: 'hub-order',     icon: '🤖', label: '발주·예측' },
  { page: 'hub-report',    icon: '📊', label: '보고·분석' },
  { page: 'hub-documents', icon: '📑', label: '문서·서류' },
  { page: 'hub-hr',        icon: '👥', label: '인사·급여' },
  { page: 'hub-settings',  icon: '⚙️', label: '설정' },
  { page: 'hub-support',   icon: '💬', label: '지원' },
];

function getHidden() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHidden(hiddenPages) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hiddenPages));
}

/** 저장된 설정을 실제 사이드바 DOM에 적용 */
export function applySidebarVisibility() {
  const hidden = getHidden();
  ALL_NAV_ITEMS.forEach(({ page }) => {
    const btn = document.querySelector(`#sidebar [data-page="${page}"]`);
    if (!btn) return;
    // admin/pos는 별도 로직(isAdmin)이 관리하므로 건드리지 않음
    if (btn.style.display === 'none' && !hidden.includes(page)) return;
    btn.style.display = hidden.includes(page) ? 'none' : '';
  });
}

/** 사이드바 편집 모달 열기 */
function openCustomizeModal() {
  const hidden = getHidden();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay sidebar-customize-overlay';
  overlay.innerHTML = `
    <div class="modal sidebar-customize-modal">
      <div class="modal-header">
        <h3 class="modal-title">사이드바 편집</h3>
        <button class="btn-close" id="sc-close">✕</button>
      </div>
      <div class="modal-body">
        <p class="sc-desc">표시할 메뉴를 선택하세요. 해제하면 사이드바에서 숨겨집니다.</p>
        <ul class="sc-list">
          ${ALL_NAV_ITEMS.map(({ page, icon, label }) => `
            <li class="sc-item">
              <label class="sc-label">
                <input type="checkbox" class="sc-check" data-page="${page}"
                  ${hidden.includes(page) ? '' : 'checked'}>
                <span class="sc-icon">${icon}</span>
                <span class="sc-text">${label}</span>
              </label>
            </li>
          `).join('')}
        </ul>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="sc-reset">초기화</button>
        <button class="btn btn-primary" id="sc-save">저장</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.querySelector('#sc-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#sc-reset').addEventListener('click', () => {
    overlay.querySelectorAll('.sc-check').forEach(cb => { cb.checked = true; });
  });

  overlay.querySelector('#sc-save').addEventListener('click', () => {
    const newHidden = [];
    overlay.querySelectorAll('.sc-check').forEach(cb => {
      if (!cb.checked) newHidden.push(cb.dataset.page);
    });
    saveHidden(newHidden);
    applySidebarVisibility();
    close();
  });
}

/** 편집 버튼 클릭 핸들러 연결 + 초기 visibility 적용 */
export function initSidebarCustomize() {
  // HTML에 고정된 버튼에 클릭 핸들러만 연결
  const btn = document.getElementById('btn-sidebar-edit');
  if (btn) btn.addEventListener('click', openCustomizeModal);
  applySidebarVisibility();
}
