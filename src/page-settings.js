/**
 * page-settings.js - 설정 페이지
 */

import { getState, setState, clearAllData } from './store.js';
import { showToast } from './toast.js';

const INDUSTRY_TEMPLATES = [
  { id: 'general', name: '일반(기본)', desc: '범용 재고 운영 설정' },
  { id: 'food', name: '식품/음료', desc: '유통기한·LOT 중심 운영' },
  { id: 'clothing', name: '의류/패션', desc: '사이즈·색상 중심 운영' },
  { id: 'electronics', name: '전자기기', desc: '시리얼·보증 정보 중심 운영' },
  { id: 'construction', name: '건설/자재', desc: '규격·현장 단위 운영' },
  { id: 'pharmacy', name: '의약/헬스', desc: '성분·복용 정보 중심 운영' },
];

export function renderSettingsPage(container, navigateTo) {
  const state = getState();
  const beginnerMode = state.beginnerMode !== false;
  const currentTemplate = state.industryTemplate || 'general';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">⚙️</span> 설정</h1>
        <div class="page-desc">운영 모드와 데이터 관리 옵션을 설정합니다.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">사용자 설정</div>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
        <div style="min-width:220px;">
          <div style="font-size:14px; font-weight:600; color:var(--text-primary);">초보자 안내 모드</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">처음 쓰는 사용자를 위한 안내를 더 자세히 표시합니다.</div>
        </div>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none;">
          <input type="checkbox" id="beginner-mode-toggle" ${beginnerMode ? 'checked' : ''} />
          <span style="font-size:13px; color:var(--text-secondary);">${beginnerMode ? '켜짐' : '꺼짐'}</span>
        </label>
      </div>
      <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" id="btn-reset-view-prefs">정렬/필터 기본값으로 되돌리기</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">업종 템플릿 <span class="card-subtitle">운영 성격에 맞는 기본 모드를 선택합니다.</span></div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:12px; margin-bottom:12px;">
        ${INDUSTRY_TEMPLATES.map((t) => `
          <div class="template-card ${currentTemplate === t.id ? 'active' : ''}" data-template="${t.id}" style="cursor:pointer;">
            <div style="font-size:14px; font-weight:600; margin-bottom:4px;">${t.name}</div>
            <div style="font-size:11px; color:var(--text-muted);">${t.desc}</div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-primary" id="btn-apply-template">선택 템플릿 적용</button>
    </div>

    <div class="card">
      <div class="card-title">데이터 관리</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-outline" id="btn-clear-tx">입출고 기록 초기화</button>
        <button class="btn btn-outline" id="btn-clear-transfers">이동 이력 초기화</button>
        <button class="btn btn-danger" id="btn-clear-all">전체 데이터 초기화</button>
      </div>
    </div>
  `;

  let selectedTemplate = currentTemplate;

  container.querySelector('#beginner-mode-toggle')?.addEventListener('change', (e) => {
    const enabled = !!e.target.checked;
    setState({ beginnerMode: enabled });
    showToast(`초보자 안내 모드가 ${enabled ? '켜졌습니다' : '꺼졌습니다'}.`, 'success');
    renderSettingsPage(container, navigateTo);
  });

  container.querySelector('#btn-reset-view-prefs')?.addEventListener('click', () => {
    setState({
      inventoryViewPrefs: {
        filter: { keyword: '', category: '', warehouse: '', stock: '', itemCode: '', vendor: '', focus: 'all' },
        sort: { key: '', direction: '' },
      },
      inoutViewPrefs: {
        filter: { keyword: '', type: '', date: '', vendor: '', itemCode: '', quick: 'all' },
        sort: { key: 'date', direction: 'desc' },
      },
    });
    showToast('정렬/필터 설정을 기본값으로 되돌렸습니다.', 'info');
  });

  container.querySelectorAll('.template-card').forEach((card) => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.template-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      selectedTemplate = card.dataset.template;
    });
  });

  container.querySelector('#btn-apply-template')?.addEventListener('click', () => {
    const template = INDUSTRY_TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!template) return;
    setState({ industryTemplate: template.id });
    showToast(`"${template.name}" 템플릿을 적용했습니다.`, 'success');
    renderSettingsPage(container, navigateTo);
  });

  container.querySelector('#btn-clear-tx')?.addEventListener('click', () => {
    if (!confirm('입출고 기록을 모두 삭제하시겠습니까?')) return;
    setState({ transactions: [] });
    showToast('입출고 기록을 초기화했습니다.', 'info');
  });

  container.querySelector('#btn-clear-transfers')?.addEventListener('click', () => {
    if (!confirm('이동 이력을 모두 삭제하시겠습니까?')) return;
    setState({ transfers: [] });
    showToast('이동 이력을 초기화했습니다.', 'info');
  });

  container.querySelector('#btn-clear-all')?.addEventListener('click', async () => {
    if (!confirm('전체 데이터를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
    if (!confirm('정말로 전체 초기화를 진행하시겠습니까? (최종 확인)')) return;

    const btn = container.querySelector('#btn-clear-all');
    if (btn) { btn.disabled = true; btn.textContent = '초기화 중...'; }

    try {
      await clearAllData(); // Supabase + IndexedDB + 메모리 모두 삭제
      showToast('전체 데이터를 초기화했습니다.', 'info');
      navigateTo('home');
    } catch (err) {
      showToast('초기화 중 오류가 발생했습니다: ' + (err?.message || ''), 'error');
      if (btn) { btn.disabled = false; btn.textContent = '전체 데이터 초기화'; }
    }
  });
}
