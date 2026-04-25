export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeAttr(value) {
  return escapeHtml(value);
}

export function setInputValue(inputEl, value) {
  if (!inputEl) return;
  inputEl.value = value == null ? '' : String(value);
}

export function fillSelectOptions(selectEl, options = [], { placeholder = null } = {}) {
  if (!selectEl) return;
  selectEl.textContent = '';

  if (placeholder !== null) {
    const first = document.createElement('option');
    first.value = '';
    first.textContent = String(placeholder);
    selectEl.appendChild(first);
  }

  options.forEach((entry) => {
    const option = document.createElement('option');
    if (typeof entry === 'string' || typeof entry === 'number') {
      option.value = String(entry);
      option.textContent = String(entry);
    } else {
      option.value = String(entry?.value ?? '');
      option.textContent = String(entry?.label ?? entry?.value ?? '');
      if (entry?.disabled) option.disabled = true;
      if (entry?.selected) option.selected = true;
      if (entry?.dataset && typeof entry.dataset === 'object') {
        Object.entries(entry.dataset).forEach(([key, val]) => {
          if (val != null) option.dataset[key] = String(val);
        });
      }
    }
    selectEl.appendChild(option);
  });
}

// ─── 폼 유효성 검증 헬퍼 ──────────────────────────────────────────────────────

/**
 * 입력 필드에 인라인 에러를 표시하고 빨간 테두리를 적용
 * @param {HTMLElement} inputEl  - 오류가 발생한 input/select 요소
 * @param {string}      message  - 사용자에게 표시할 한국어 메시지
 */
export function showFieldError(inputEl, message) {
  if (!inputEl) return;
  inputEl.classList.add('is-error');
  inputEl.classList.remove('is-success');

  // 기존 에러 메시지 제거
  inputEl.parentNode?.querySelector('.form-error-msg')?.remove();

  const msg = document.createElement('div');
  msg.className = 'form-error-msg';
  msg.setAttribute('role', 'alert');
  msg.textContent = message;
  inputEl.parentNode?.appendChild(msg);
  inputEl.focus();
}

/**
 * 입력 필드의 에러 상태를 해제
 */
export function clearFieldError(inputEl) {
  if (!inputEl) return;
  inputEl.classList.remove('is-error');
  inputEl.parentNode?.querySelector('.form-error-msg')?.remove();
}

/**
 * 여러 필드의 에러를 한번에 해제
 */
export function clearAllFieldErrors(formEl) {
  if (!formEl) return;
  formEl.querySelectorAll('.is-error').forEach(el => el.classList.remove('is-error'));
  formEl.querySelectorAll('.form-error-msg').forEach(el => el.remove());
}

/**
 * 저장 버튼 로딩 상태로 전환 / 복원
 * @returns {Function} restore — 호출하면 원래 상태로 복원
 */
export function setSavingState(btnEl, loadingText = '저장 중...') {
  if (!btnEl) return () => {};
  const original = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = loadingText;
  btnEl.style.opacity = '0.7';
  return () => {
    btnEl.disabled = false;
    btnEl.textContent = original;
    btnEl.style.opacity = '';
  };
}

function renderAction(action) {
  const variant = action.variant || 'btn-outline';
  const attrs = [];
  if (action.id) attrs.push(`id="${action.id}"`);
  if (action.nav) attrs.push(`data-nav="${action.nav}"`);
  if (action.value) attrs.push(`data-value="${escapeHtml(action.value)}"`);
  if (action.extraAttrs) attrs.push(action.extraAttrs);
  return `<button class="btn ${variant} btn-sm" ${attrs.join(' ')}>${escapeHtml(action.label || '실행')}</button>`;
}

export function renderGuidedPanel({
  eyebrow = '빠른 흐름',
  title,
  desc = '',
  badge = '',
  tone = 'info',
  steps = [],
  actions = [],
  foldId = '',
  open = true,
}) {
  const foldAttr = foldId ? ` data-fold-id="${escapeHtml(foldId)}"` : '';
  return `
    <details class="card mission-panel mission-panel-${tone} fold-card"${foldAttr} ${open ? 'open' : ''}>
      <summary class="fold-card-summary mission-panel-head">
        <div>
          <div class="mission-panel-eyebrow">${escapeHtml(eyebrow)}</div>
          <div class="mission-panel-title">${escapeHtml(title)}</div>
        </div>
        ${badge ? `<span class="mission-badge">${escapeHtml(badge)}</span>` : ''}
      </summary>
      <div class="fold-card-body">
        ${desc ? `<div class="mission-panel-desc">${escapeHtml(desc)}</div>` : ''}
        ${steps.length > 0 ? `
          <div class="mission-step-list">
            ${steps.map(step => `
              <div class="mission-step ${step.done ? 'is-done' : ''}">
                <span class="mission-step-index">${escapeHtml(step.kicker || '')}</span>
                <div>
                  <div class="mission-step-title">${escapeHtml(step.title || '')}</div>
                  ${step.desc ? `<div class="mission-step-desc">${escapeHtml(step.desc)}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${actions.length > 0 ? `
          <div class="mission-actions">
            ${actions.map(renderAction).join('')}
          </div>
        ` : ''}
      </div>
    </details>
  `;
}
export function renderInsightHero({
  eyebrow = '핵심 요약',
  title,
  desc = '',
  tone = 'default',
  metrics = [],
  bullets = [],
  actions = [],
  foldId = '',
  open = true,
}) {
  const foldAttr = foldId ? ` data-fold-id="${escapeHtml(foldId)}"` : '';
  return `
    <details class="card mission-panel mission-panel-${tone} fold-card"${foldAttr} ${open ? 'open' : ''}>
      <summary class="fold-card-summary mission-panel-head">
        <div>
          <div class="mission-panel-eyebrow">${escapeHtml(eyebrow)}</div>
          <div class="mission-panel-title">${escapeHtml(title)}</div>
        </div>
      </summary>
      <div class="fold-card-body">
        ${desc ? `<div class="mission-panel-desc">${escapeHtml(desc)}</div>` : ''}
        ${metrics.length > 0 ? `
          <div class="mission-highlight-grid">
            ${metrics.map(metric => `
              <div class="mission-highlight">
                <div class="mission-highlight-label">${escapeHtml(metric.label || '')}</div>
                <div class="mission-highlight-value ${metric.stateClass || ''}">${escapeHtml(metric.value || '-')}</div>
                ${metric.note ? `<div class="mission-highlight-note">${escapeHtml(metric.note)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${actions.length > 0 ? `
          <div class="mission-actions">
            ${actions.map(renderAction).join('')}
          </div>
        ` : ''}
      </div>
    </details>
  `;
}

export function renderQuickFilterRow({
  label = '빠른 조건',
  attr = 'data-quick-filter',
  chips = [],
}) {
  return `
    <div class="quick-filter-row">
      <span class="quick-filter-label">${escapeHtml(label)}</span>
      <div class="quick-filter-chips">
        ${chips.map(chip => `
          <button
            type="button"
            class="quick-filter-chip ${chip.active ? 'is-active' : ''}"
            ${attr}="${escapeHtml(chip.value)}"
          >
            ${escapeHtml(chip.label)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}
