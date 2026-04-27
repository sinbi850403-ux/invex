/**
 * page-settings.js - 설정 페이지
 * 역할: 사용성 설정, 데이터 초기화
 */

import { getState, setState, resetState } from './store.js';
import { showToast } from './toast.js';
import { isSupabaseConfigured } from './supabase-client.js';
import { clearAllUserData, transactions as dbTransactions, transfers as dbTransfers } from './db.js';

export function renderSettingsPage(container, navigateTo) {
  const state = getState();
  const beginnerMode = state.beginnerMode !== false;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">설정</h1>
        <div class="page-desc">사용성 설정과 데이터 초기화를 관리합니다.</div>
      </div>
    </div>

    <!-- 사용성 설정 -->
    <div class="card">
      <div class="card-title"> 사용성 설정</div>
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

    <!-- 데이터 관리 -->
    <div class="card">
      <div class="card-title"> 데이터 관리</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-outline" id="btn-clear-tx"> 입출고 기록 초기화</button>
        <button class="btn btn-outline" id="btn-clear-transfers"> 이동 이력 초기화</button>
        <button class="btn btn-danger" id="btn-clear-all"> 전체 데이터 초기화</button>
      </div>
    </div>
  `;

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

  // 데이터 초기화
  container.querySelector('#btn-clear-tx').addEventListener('click', async () => {
    if (!confirm('입출고 기록을 모두 삭제하시겠습니까?')) return;
    const btn = container.querySelector('#btn-clear-tx');
    if (btn) { btn.disabled = true; btn.textContent = '삭제 중...'; }
    try {
      if (isSupabaseConfigured) {
        await dbTransactions.deleteAll();
      }
      setState({ transactions: [] });
      showToast('입출고 기록이 초기화되었습니다.', 'info');
    } catch (err) {
      console.error('[Settings] 입출고 초기화 실패:', err);
      showToast('삭제 중 오류가 발생했습니다.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = ' 입출고 기록 초기화'; }
    }
  });

  container.querySelector('#btn-clear-transfers').addEventListener('click', async () => {
    if (!confirm('이동 이력을 모두 삭제하시겠습니까?')) return;
    const btn = container.querySelector('#btn-clear-transfers');
    if (btn) { btn.disabled = true; btn.textContent = '삭제 중...'; }
    try {
      if (isSupabaseConfigured) {
        await dbTransfers.deleteAll();
      }
      setState({ transfers: [] });
      showToast('이동 이력이 초기화되었습니다.', 'info');
    } catch (err) {
      console.error('[Settings] 이동 이력 초기화 실패:', err);
      showToast('삭제 중 오류가 발생했습니다.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = ' 이동 이력 초기화'; }
    }
  });

  container.querySelector('#btn-clear-all').addEventListener('click', async () => {
    if (!confirm(' 모든 데이터(품목, 거래, 설정)를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
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
