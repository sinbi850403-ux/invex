/**
 * sidebar-customize.js — 사이드바 섹션 표시/숨김 커스터마이징
 *
 * 사용자가 원하는 섹션만 사이드바에 표시할 수 있게 함.
 * 새 snav 아코디언 구조 기준으로 재작성.
 */

const STORAGE_KEY = 'invex:sidebar-hidden-v2';

// 커스터마이징 가능한 섹션 목록 (data-section 속성 기준)
const ALL_SECTIONS = [
  { section: 'inventory', label: '재고 관리' },
  { section: 'warehouse', label: '창고·거래처' },
  { section: 'trading',   label: '구매·판매' },
  { section: 'report',    label: '보고·분석' },
  { section: 'documents', label: '문서·서류' },
  { section: 'hr',        label: '인사·급여' },
  { section: 'system',    label: '설정·지원' },
];

function getHidden() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const validSections = new Set(ALL_SECTIONS.map(s => s.section));
    return saved.filter(s => validSections.has(s));
  } catch {
    return [];
  }
}

function saveHidden(hiddenSections) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hiddenSections));
}

/** 저장된 설정을 실제 사이드바 DOM에 적용 */
export function applySidebarVisibility() {
  const hidden = getHidden();
  ALL_SECTIONS.forEach(({ section }) => {
    const el = document.querySelector(`.snav-section[data-section="${section}"]`);
    if (!el) return;
    el.style.display = hidden.includes(section) ? 'none' : '';
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
        <button class="btn-close" id="sc-close"></button>
      </div>
      <div class="modal-body">
        <p class="sc-desc">표시할 메뉴를 선택하세요. 해제하면 사이드바에서 숨겨집니다.</p>
        <ul class="sc-list">
          ${ALL_SECTIONS.map(({ section, label }) => `
            <li class="sc-item">
              <label class="sc-label">
                <input type="checkbox" class="sc-check" data-section="${section}"
                  ${hidden.includes(section) ? '' : 'checked'}>
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
      if (!cb.checked) newHidden.push(cb.dataset.section);
    });
    saveHidden(newHidden);
    applySidebarVisibility();
    close();
  });
}

/** 편집 버튼 클릭 핸들러 연결 + 초기 visibility 적용 */
export function initSidebarCustomize() {
  const btn = document.getElementById('btn-sidebar-edit');
  if (btn) btn.addEventListener('click', openCustomizeModal);
  applySidebarVisibility();
}
