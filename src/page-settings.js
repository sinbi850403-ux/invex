/**
 * page-settings.js - 설정 페이지 (업종 템플릿 + 데이터 관리)
 * 역할: 사용자 정의 컬럼 추가/관리, 업종별 초기 설정
 * 왜 필요? → 업종마다 필요한 정보가 다름 (의류=사이즈/색상, 식품=유통기한, 건설=규격)
 */

import { getState, setState, resetState } from './store.js';
import { showToast } from './toast.js';
import { isSupabaseConfigured } from './supabase-client.js';
import { clearAllUserData } from './db.js';

// 업종별 템플릿 정의
const INDUSTRY_TEMPLATES = [
  {
    id: 'general',
    name: '📦 일반 (기본)',
    desc: '범용 재고 관리',
    fields: [],
    safetyDefaults: {},
  },
  {
    id: 'food',
    name: '🍔 식품/음료',
    desc: '유통기한, LOT, 보관온도 관리',
    fields: [
      { key: 'storageTemp', label: '보관온도', type: 'text' },
      { key: 'allergen', label: '알레르기', type: 'text' },
      { key: 'origin', label: '원산지', type: 'text' },
    ],
    safetyDefaults: {},
  },
  {
    id: 'clothing',
    name: '👕 의류/패션',
    desc: '사이즈, 색상, 시즌 관리',
    fields: [
      { key: 'size', label: '사이즈', type: 'text' },
      { key: 'color', label: '색상', type: 'text' },
      { key: 'season', label: '시즌', type: 'text' },
      { key: 'material', label: '소재', type: 'text' },
    ],
    safetyDefaults: {},
  },
  {
    id: 'electronics',
    name: '💻 전자기기',
    desc: '시리얼번호, 보증기간, 모델 관리',
    fields: [
      { key: 'serialNumber', label: '시리얼번호', type: 'text' },
      { key: 'modelName', label: '모델명', type: 'text' },
      { key: 'warrantyEnd', label: '보증만료일', type: 'date' },
      { key: 'manufacturer', label: '제조사', type: 'text' },
    ],
    safetyDefaults: {},
  },
  {
    id: 'construction',
    name: '🏗️ 건설/자재',
    desc: '규격, 현장명, 자재코드 관리',
    fields: [
      { key: 'specification', label: '규격', type: 'text' },
      { key: 'siteName', label: '현장명', type: 'text' },
      { key: 'grade', label: '등급', type: 'text' },
    ],
    safetyDefaults: {},
  },
  {
    id: 'pharmacy',
    name: '💊 의약품',
    desc: '성분, 용량, 처방전 관리',
    fields: [
      { key: 'ingredient', label: '주성분', type: 'text' },
      { key: 'dosage', label: '용량/용법', type: 'text' },
      { key: 'prescriptionReq', label: '처방전필요', type: 'text' },
    ],
    safetyDefaults: {},
  },
];

export function renderSettingsPage(container, navigateTo) {
  const state = getState();
  const currentTemplate = state.industryTemplate || 'general';
  const beginnerMode = state.beginnerMode !== false;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">설정</h1>
        <div class="page-desc">업종별 템플릿과 데이터 초기화를 관리합니다.</div>
      </div>
    </div>

    <!-- 사용성 설정 -->
    <div class="card">
      <div class="card-title">🧭 사용성 설정</div>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
        <div style="min-width:220px;">
          <div style="font-size:14px; font-weight:600; color:var(--text-primary);">초보자 도움 모드</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">온보딩과 빠른 시작 가이드를 화면에 표시합니다.</div>
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

    <!-- 업종 템플릿 -->
    <div class="card">
      <div class="card-title">🎨 업종별 템플릿 <span class="card-subtitle">업종에 맞는 필드를 자동으로 추가합니다</span></div>
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:12px; margin-bottom:12px;">
        ${INDUSTRY_TEMPLATES.map(t => `
          <div class="template-card ${currentTemplate === t.id ? 'active' : ''}" data-template="${t.id}" style="cursor:pointer;">
            <div style="font-size:14px; font-weight:600; margin-bottom:4px;">${t.name}</div>
            <div style="font-size:11px; color:var(--text-muted);">${t.desc}</div>
            ${t.fields.length > 0 ? `<div style="font-size:10px; color:var(--accent); margin-top:4px;">+${t.fields.length}개 필드</div>` : ''}
          </div>
        `).join('')}
      </div>
      <button class="btn btn-primary" id="btn-apply-template">✓ 템플릿 적용</button>
    </div>

    <!-- 데이터 관리 -->
    <div class="card">
      <div class="card-title">🔧 데이터 관리</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-outline" id="btn-clear-tx">🗑️ 입출고 기록 초기화</button>
        <button class="btn btn-outline" id="btn-clear-transfers">🗑️ 이동 이력 초기화</button>
        <button class="btn btn-danger" id="btn-clear-all">⚠️ 전체 데이터 초기화</button>
      </div>
    </div>
  `;

  // === 선택된 템플릿 상태 ===
  let selectedTemplate = currentTemplate;

  // 초보자 도움 모드 토글
  container.querySelector('#beginner-mode-toggle')?.addEventListener('change', (e) => {
    const enabled = !!e.target.checked;
    setState({ beginnerMode: enabled });
    showToast(`초보자 도움 모드가 ${enabled ? '켜졌습니다' : '꺼졌습니다'}.`, 'success');
    renderSettingsPage(container, navigateTo);
  });

  // 정렬/필터 설정 초기화
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

  // 템플릿 선택
  container.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectedTemplate = card.dataset.template;
    });
  });

  // 템플릿 적용
  container.querySelector('#btn-apply-template').addEventListener('click', () => {
    const template = INDUSTRY_TEMPLATES.find(t => t.id === selectedTemplate);
    if (!template) return;

    setState({ industryTemplate: selectedTemplate });
    showToast(`"${template.name}" 템플릿 적용 완료`, 'success');
    renderSettingsPage(container, navigateTo);
  });

  // 데이터 초기화
  container.querySelector('#btn-clear-tx').addEventListener('click', () => {
    if (!confirm('입출고 기록을 모두 삭제하시겠습니까?')) return;
    setState({ transactions: [] });
    showToast('입출고 기록이 초기화되었습니다.', 'info');
  });

  container.querySelector('#btn-clear-transfers').addEventListener('click', () => {
    if (!confirm('이동 이력을 모두 삭제하시겠습니까?')) return;
    setState({ transfers: [] });
    showToast('이동 이력이 초기화되었습니다.', 'info');
  });

  container.querySelector('#btn-clear-all').addEventListener('click', async () => {
    if (!confirm('⚠️ 모든 데이터(품목, 거래, 설정)를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
    if (!confirm('정말로 전체 초기화하시겠습니까? (최종 확인)')) return;
    const clearButton = container.querySelector('#btn-clear-all');
    const originalLabel = clearButton?.textContent || '데이터 전체초기화';
    if (clearButton) {
      clearButton.disabled = true;
      clearButton.textContent = '초기화 중...';
    }

    try {
      if (isSupabaseConfigured) {
        await clearAllUserData();
      }
      resetState();
      setState({ _onboardingDone: false });
      showToast('전체 데이터가 초기화되었습니다.', 'info');
      navigateTo('home');
    } catch (error) {
      console.error('[Settings] 전체 초기화 실패:', error);
      showToast(error?.message || '전체 초기화에 실패했습니다.', 'error');
    } finally {
      if (clearButton) {
        clearButton.disabled = false;
        clearButton.textContent = originalLabel;
      }
    }
  });
}
