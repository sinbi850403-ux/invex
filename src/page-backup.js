/**
 * page-backup.js - 데이터 백업/복원
 * 
 * 역할: 로컬 데이터를 JSON 파일로 백업하고, 복원할 수 있는 기능
 * 왜 필요? → "내 데이터 날아가면?" 불안 해소. 유료 전환 시 신뢰도 핵심.
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';

export function renderBackupPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const vendors = state.vendorMaster || [];

  // 마지막 백업 시간
  const lastBackup = state._lastBackup || null;

  // 데이터 크기 추정
  const rough = JSON.stringify(state).length;
  const sizeKB = Math.round(rough / 1024);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">데이터 백업/복원</h1>
        <div class="page-desc">소중한 데이터를 안전하게 백업하고, 필요할 때 복원하세요.</div>
      </div>
    </div>

    <!-- 현재 데이터 요약 -->
    <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
      <div class="stat-card">
        <div class="stat-label">등록 품목</div>
        <div class="stat-value text-accent">${items.length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">거래 이력</div>
        <div class="stat-value">${transactions.length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">거래처</div>
        <div class="stat-value">${vendors.length}곳</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">데이터 크기</div>
        <div class="stat-value" style="font-size:18px;">${sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + 'MB' : sizeKB + 'KB'}</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
      <!-- 백업 -->
      <div class="card" style="border-top:3px solid var(--success);">
        <div style="text-align:center; padding:16px 0;">
          <div style="font-size:48px; margin-bottom:12px;"></div>
          <h3 style="font-size:18px; font-weight:700; margin-bottom:8px;">데이터 백업</h3>
          <p style="font-size:13px; color:var(--text-muted); margin-bottom:20px;">
            현재 모든 데이터를 JSON 파일로 다운로드합니다.<br/>
            정기적으로 백업하면 데이터 유실을 방지할 수 있습니다.
          </p>
          
          ${lastBackup ? `
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">
              마지막 백업: ${new Date(lastBackup).toLocaleString('ko-KR')}
            </div>
          ` : ''}

          <button class="btn btn-success btn-lg" style="width:100%;" id="btn-backup">
             전체 백업 다운로드
          </button>
          
          <div style="margin-top:12px;">
            <button class="btn btn-outline btn-sm" id="btn-backup-items" style="margin:4px;">품목만</button>
            <button class="btn btn-outline btn-sm" id="btn-backup-tx" style="margin:4px;">거래이력만</button>
            <button class="btn btn-outline btn-sm" id="btn-backup-vendors" style="margin:4px;">거래처만</button>
          </div>
        </div>
      </div>

      <!-- 복원 -->
      <div class="card" style="border-top:3px solid var(--accent);">
        <div style="text-align:center; padding:16px 0;">
          <div style="font-size:48px; margin-bottom:12px;"></div>
          <h3 style="font-size:18px; font-weight:700; margin-bottom:8px;">데이터 복원</h3>
          <p style="font-size:13px; color:var(--text-muted); margin-bottom:20px;">
            이전에 백업한 JSON 파일을 업로드하여 데이터를 복원합니다.<br/>
            <strong style="color:var(--danger);"> 복원 시 현재 데이터가 대체됩니다.</strong>
          </p>

          <div id="drop-zone" style="
            border:2px dashed var(--border); border-radius:12px; padding:32px 16px;
            cursor:pointer; transition:all 0.2s; margin-bottom:16px;
          ">
            <div style="font-size:24px; margin-bottom:8px;"></div>
            <div style="font-size:13px; color:var(--text-muted);">
              백업 파일을 여기에 드래그하거나<br/>클릭하여 선택하세요
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">.json 파일만 지원</div>
          </div>
          <input type="file" id="restore-file" accept=".json" style="display:none;" />
        </div>
      </div>
    </div>

    <!-- 백업 팁 -->
    <div class="card" style="border-left:3px solid var(--accent);">
      <div class="card-title"> 백업 가이드</div>
      <div style="font-size:13px; color:var(--text-muted); line-height:1.8;">
        <ul style="margin:0; padding-left:16px;">
          <li>매주 1회 이상 정기 백업을 권장합니다</li>
          <li>중요한 변경 작업(일괄 등록, 수불관리 등) 전후에 백업하세요</li>
          <li>백업 파일은 안전한 클라우드(구글 드라이브, 네이버 클라우드 등)에 보관하세요</li>
          <li>로그인하면 클라우드에 자동 동기화되어 별도 백업 없이도 안전합니다</li>
        </ul>
      </div>
    </div>
  `;

  // === 이벤트 ===

  // 전체 백업
  container.querySelector('#btn-backup').addEventListener('click', () => {
    downloadBackup(state, '전체백업');
  });

  // 부분 백업
  container.querySelector('#btn-backup-items').addEventListener('click', () => {
    downloadBackup({ mappedData: items }, '품목백업');
  });
  container.querySelector('#btn-backup-tx').addEventListener('click', () => {
    downloadBackup({ transactions }, '거래이력백업');
  });
  container.querySelector('#btn-backup-vendors').addEventListener('click', () => {
    downloadBackup({ vendorMaster: vendors }, '거래처백업');
  });

  // 복원 — 파일 선택
  const dropZone = container.querySelector('#drop-zone');
  const fileInput = container.querySelector('#restore-file');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--accent)';
    dropZone.style.background = 'rgba(37,99,235,0.05)';
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'var(--border)';
    dropZone.style.background = '';
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border)';
    dropZone.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file) restoreFromFile(file, container, navigateTo);
  });
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) restoreFromFile(file, container, navigateTo);
  });
}

/**
 * 백업 파일 다운로드
 */
function downloadBackup(data, label) {
  try {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const filename = `INVEX_${label}_${dateStr}.json`;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    // 백업 시간 기록
    setState({ _lastBackup: now.toISOString() });
    showToast(`${label} 다운로드 완료! (${filename})`, 'success');
  } catch (e) {
    showToast('백업 실패: ' + e.message, 'error');
  }
}

/**
 * 백업 파일에서 복원
 */
function restoreFromFile(file, container, navigateTo) {
  if (!file.name.endsWith('.json')) {
    showToast('JSON 파일만 복원할 수 있습니다.', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // 데이터 유효성 간단 체크
      const keys = Object.keys(data);
      const validKeys = ['mappedData', 'transactions', 'vendorMaster', 'transfers', 'safetyStock', 'warehouses'];
      const hasValidData = keys.some(k => validKeys.includes(k));

      if (!hasValidData && !data.mappedData && !data.transactions) {
        showToast('올바른 INVEX 백업 파일이 아닙니다.', 'error');
        return;
      }

      const itemCount = (data.mappedData || []).length;
      const txCount = (data.transactions || []).length;
      const summary = `품목 ${itemCount}건, 거래이력 ${txCount}건`;

      if (!confirm(`다음 데이터를 복원하시겠습니까?\n\n${summary}\n\n 현재 데이터가 대체됩니다.`)) return;

      setState(data);
      showToast(`복원 완료! (${summary})`, 'success');

      // 페이지 새로고침
      renderBackupPage(container, navigateTo);
    } catch (err) {
      showToast('파일 읽기 실패: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}
