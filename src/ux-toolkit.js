export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
        ${bullets.length > 0 ? `
          <div class="mission-bullet-list">
            ${bullets.map(bullet => `<div class="mission-bullet">${escapeHtml(bullet)}</div>`).join('')}
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
