/**
 * page-api.js - API 연동 관리 페이지 (Enterprise)
 * 역할: API 키 관리, Webhook 설정, API 문서 제공
 * 왜 필요? → 외부 시스템(쇼핑몰, POS, WMS 등)과 데이터 연동 시 표준 API 인터페이스 제공
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { escapeHtml } from './ux-toolkit.js';

/**
 * API 키 생성 유틸
 */
function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'invex_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

/**
 * 날짜 포맷
 */
function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function renderApiPage(container, navigateTo) {
  const state = getState();
  const apiKeys = state.apiKeys || [];
  const webhooks = state.webhooks || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">API 연동</h1>
        <div class="page-desc">Enterprise — 외부 시스템과 데이터를 연동하고 API 키를 관리합니다.</div>
      </div>
    </div>

    <!-- API 키 관리 -->
    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div class="card-title" style="margin:0;"> API 키</div>
        <button class="btn btn-primary btn-sm" id="btn-gen-key"> 새 API 키 생성</button>
      </div>

      ${apiKeys.length > 0 ? `
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead><tr>
              <th>이름</th>
              <th>API 키</th>
              <th>권한</th>
              <th>생성일</th>
              <th>마지막 사용</th>
              <th style="width:80px;"></th>
            </tr></thead>
            <tbody>
              ${apiKeys.map(k => `
                <tr>
                  <td><strong>${escapeHtml(k.name)}</strong></td>
                  <td>
                    <code style="background:var(--bg-secondary); padding:2px 8px; border-radius:4px; font-size:12px;" id="key-${escapeHtml(k.id)}">
                      ${k.visible ? escapeHtml(k.key) : `${escapeHtml(k.key.substring(0, 10))}${'•'.repeat(22)}`}
                    </code>
                    <button class="btn btn-ghost btn-sm btn-toggle-key" data-key-id="${escapeHtml(k.id)}" title="키 표시/숨김" style="margin-left:4px;">
                      ${k.visible ? '' : ''}
                    </button>
                    <button class="btn btn-ghost btn-sm btn-copy-key" data-key="${escapeHtml(k.key)}" title="복사" style="margin-left:2px;"></button>
                  </td>
                  <td><span class="badge ${k.scope === 'full' ? 'badge-warning' : k.scope === 'read' ? 'badge-info' : 'badge-success'}">${k.scope === 'full' ? '전체' : k.scope === 'read' ? '읽기' : '쓰기'}</span></td>
                  <td style="font-size:12px; color:var(--text-muted);">${formatDate(k.createdAt)}</td>
                  <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(k.lastUsed || '사용 전')}</td>
                  <td>
                    <button class="btn btn-ghost btn-sm btn-revoke-key" data-key-id="${escapeHtml(k.id)}" style="color:var(--danger);">폐기</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div style="text-align:center; padding:32px; color:var(--text-muted);">
          <div style="font-size:28px; margin-bottom:8px;"></div>
          <div>아직 생성된 API 키가 없습니다.</div>
        </div>
      `}
    </div>

    <!-- Webhook 설정 -->
    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div class="card-title" style="margin:0;"> Webhook</div>
        <button class="btn btn-accent btn-sm" id="btn-add-webhook"> Webhook 추가</button>
      </div>

      ${webhooks.length > 0 ? `
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead><tr>
              <th>이름</th>
              <th>URL</th>
              <th>이벤트</th>
              <th>상태</th>
              <th style="width:60px;"></th>
            </tr></thead>
            <tbody>
              ${webhooks.map(wh => `
                <tr>
                  <td><strong>${escapeHtml(wh.name)}</strong></td>
                  <td style="font-size:12px;"><code>${escapeHtml(wh.url)}</code></td>
                  <td>${(Array.isArray(wh.events) ? wh.events : []).map(e => `<span class="badge badge-default" style="margin:1px;">${escapeHtml(e)}</span>`).join('')}</td>
                  <td>
                    <span class="badge ${wh.active ? 'badge-success' : 'badge-default'}">
                      ${wh.active ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td><button class="btn btn-ghost btn-sm btn-delete-webhook" data-wh-id="${escapeHtml(wh.id)}"></button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div style="text-align:center; padding:32px; color:var(--text-muted);">
          <div style="font-size:28px; margin-bottom:8px;"></div>
          <div>등록된 Webhook이 없습니다.</div>
          <div style="font-size:12px; margin-top:4px;">재고 변동, 입출고 발생 등의 이벤트를 외부로 알릴 수 있습니다.</div>
        </div>
      `}
    </div>

    <!-- API 문서 (간략) -->
    <div class="card">
      <div class="card-title"> API 레퍼런스</div>
      <div style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
        INVEX API를 사용하여 외부 시스템과 재고 데이터를 연동하세요.
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
        <!-- 재고 API -->
        <div style="background:var(--bg-secondary); border-radius:8px; padding:16px;">
          <div style="font-weight:700; margin-bottom:8px;"> 재고 관리</div>
          <div class="api-endpoint">
            <span class="badge badge-success" style="font-size:10px; min-width:36px; text-align:center;">GET</span>
            <code>/api/v1/items</code>
            <span style="color:var(--text-muted); font-size:11px; margin-left:auto;">전체 품목 조회</span>
          </div>
          <div class="api-endpoint">
            <span class="badge badge-info" style="font-size:10px; min-width:36px; text-align:center;">POST</span>
            <code>/api/v1/items</code>
            <span style="color:var(--text-muted); font-size:11px; margin-left:auto;">품목 추가</span>
          </div>
          <div class="api-endpoint">
            <span class="badge badge-warning" style="font-size:10px; min-width:36px; text-align:center;">PUT</span>
            <code>/api/v1/items/:id</code>
            <span style="color:var(--text-muted); font-size:11px; margin-left:auto;">품목 수정</span>
          </div>
          <div class="api-endpoint">
            <span class="badge" style="background:rgba(239,68,68,0.15); color:#ef4444; font-size:10px; min-width:36px; text-align:center;">DEL</span>
            <code>/api/v1/items/:id</code>
            <span style="color:var(--text-muted); font-size:11px; margin-left:auto;">품목 삭제</span>
          </div>
        </div>

        <!-- 입출고 API -->
        <div style="background:var(--bg-secondary); border-radius:8px; padding:16px;">
          <div style="font-weight:700; margin-bottom:8px;"> 입출고</div>
          <div class="api-endpoint">
            <span class="badge badge-success" style="font-size:10px; min-width:36px; text-align:center;">GET</span>
            <code>/api/v1/transactions</code>
            <span style="color:var(--text-muted); font-size:11px; margin-left:auto;">이력 조회</span>
          </div>
          <div class="api-endpoint">
            <span class="badge badge-info" style="font-size:10px; min-width:36px; text-align:center;">POST</span>
            <code>/api/v1/inbound</code>
            <span style="color:var(--text-muted); font-size:11px; margin-left:auto;">입고 등록</span>
          </div>
          <div class="api-endpoint">
            <span class="badge badge-info" style="font-size:10px; min-width:36px; text-align:center;">POST</span>
            <code>/api/v1/outbound</code>
            <span style="color:var(--text-muted); font-size:11px; margin-left:auto;">출고 등록</span>
          </div>
        </div>

        <!-- 창고 API -->
        <div style="background:var(--bg-secondary); border-radius:8px; padding:16px;">
          <div style="font-weight:700; margin-bottom:8px;"> 창고</div>
          <div class="api-endpoint">
            <span class="badge badge-success" style="font-size:10px; min-width:36px; text-align:center;">GET</span>
            <code>/api/v1/warehouses</code>
            <span style="color:var(--text-muted); font-size:11px; margin-left:auto;">창고 목록</span>
          </div>
          <div class="api-endpoint">
            <span class="badge badge-info" style="font-size:10px; min-width:36px; text-align:center;">POST</span>
            <code>/api/v1/transfers</code>
            <span style="color:var(--text-muted); font-size:11px; margin-left:auto;">창고 이동</span>
          </div>
        </div>

        <!-- 거래처 API -->
        <div style="background:var(--bg-secondary); border-radius:8px; padding:16px;">
          <div style="font-weight:700; margin-bottom:8px;"> 거래처</div>
          <div class="api-endpoint">
            <span class="badge badge-success" style="font-size:10px; min-width:36px; text-align:center;">GET</span>
            <code>/api/v1/vendors</code>
            <span style="color:var(--text-muted); font-size:11px; margin-left:auto;">거래처 목록</span>
          </div>
          <div class="api-endpoint">
            <span class="badge badge-info" style="font-size:10px; min-width:36px; text-align:center;">POST</span>
            <code>/api/v1/vendors</code>
            <span style="color:var(--text-muted); font-size:11px; margin-left:auto;">거래처 추가</span>
          </div>
        </div>
      </div>

      <!-- 인증 예시 -->
      <div style="margin-top:20px; background:var(--bg-secondary); border-radius:8px; padding:16px;">
        <div style="font-weight:700; margin-bottom:8px;"> 인증 방식</div>
        <div style="font-size:13px; color:var(--text-muted); margin-bottom:8px;">
          모든 API 요청에 <code>Authorization</code> 헤더를 포함해야 합니다.
        </div>
        <pre style="background:var(--bg-primary); padding:12px; border-radius:6px; font-size:12px; overflow-x:auto; color:var(--text-primary);"><code>curl -X GET https://api.invex.kr/v1/items \\
  -H "Authorization: Bearer invex_YOUR_API_KEY" \\
  -H "Content-Type: application/json"</code></pre>
      </div>

      <!-- 응답 예시 -->
      <div style="margin-top:12px; background:var(--bg-secondary); border-radius:8px; padding:16px;">
        <div style="font-weight:700; margin-bottom:8px;"> 응답 예시</div>
        <pre style="background:var(--bg-primary); padding:12px; border-radius:6px; font-size:12px; overflow-x:auto; color:var(--text-primary);"><code>{
  "success": true,
  "data": [
    {
      "itemName": "A4용지",
      "itemCode": "P-001",
      "quantity": 500,
      "unitPrice": 5000,
      "warehouse": "본사 창고",
      "category": "사무용품"
    }
  ],
  "total": 142,
  "page": 1
}</code></pre>
      </div>
    </div>

    <!-- API 키 생성 모달 -->
    <div id="key-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:450px;">
        <div class="modal-header">
          <h3> API 키 생성</h3>
          <button class="btn btn-ghost btn-sm" id="key-modal-close"></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">키 이름 <span class="required">*</span></label>
            <input class="form-input" id="key-name" placeholder="예: 쇼핑몰 연동, POS 시스템" />
          </div>
          <div class="form-group">
            <label class="form-label">권한 범위</label>
            <select class="form-select" id="key-scope">
              <option value="read"> 읽기 전용 (조회만 가능)</option>
              <option value="write"> 읽기/쓰기 (조회 + 등록/수정)</option>
              <option value="full"> 전체 (삭제 포함)</option>
            </select>
          </div>
          <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); border-radius:6px; padding:10px; font-size:12px; color:var(--danger);">
             API 키 생성 후에는 키 값을 다시 확인할 수 없습니다. 반드시 안전한 곳에 보관하세요.
          </div>
        </div>
        <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-ghost" id="key-cancel">취소</button>
          <button class="btn btn-primary" id="key-save">생성</button>
        </div>
      </div>
    </div>

    <!-- Webhook 추가 모달 -->
    <div id="webhook-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:500px;">
        <div class="modal-header">
          <h3> Webhook 추가</h3>
          <button class="btn btn-ghost btn-sm" id="webhook-modal-close"></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">이름 <span class="required">*</span></label>
            <input class="form-input" id="webhook-name" placeholder="예: 슬랙 알림" />
          </div>
          <div class="form-group">
            <label class="form-label">URL <span class="required">*</span></label>
            <input class="form-input" id="webhook-url" placeholder="https://hooks.slack.com/..." />
          </div>
          <div class="form-group">
            <label class="form-label">트리거 이벤트</label>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
              ${[
                { id: 'stock.low', label: '재고 부족' },
                { id: 'inbound.created', label: '입고 등록' },
                { id: 'outbound.created', label: '출고 등록' },
                { id: 'transfer.created', label: '창고 이동' },
                { id: 'item.created', label: '품목 추가' },
                { id: 'item.deleted', label: '품목 삭제' },
              ].map(ev => `
                <label style="display:flex; align-items:center; gap:6px; padding:4px; cursor:pointer;">
                  <input type="checkbox" class="webhook-event" value="${ev.id}" />
                  <span style="font-size:13px;">${ev.label}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-ghost" id="webhook-cancel">취소</button>
          <button class="btn btn-primary" id="webhook-save">추가</button>
        </div>
      </div>
    </div>
  `;

  // === CSS for API endpoints ===
  const style = document.createElement('style');
  style.textContent = `
    .api-endpoint {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
    }
    .api-endpoint:last-child { border-bottom: none; }
    .api-endpoint code {
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }
  `;
  container.appendChild(style);

  // === 이벤트 바인딩 ===

  const keyModal = container.querySelector('#key-modal');
  const webhookModal = container.querySelector('#webhook-modal');

  function closeAll() {
    keyModal.style.display = 'none';
    webhookModal.style.display = 'none';
  }

  // API 키 생성
  container.querySelector('#btn-gen-key').addEventListener('click', () => {
    keyModal.style.display = 'flex';
  });

  container.querySelector('#key-save').addEventListener('click', () => {
    const name = container.querySelector('#key-name').value.trim();
    if (!name) { showToast('키 이름을 입력해 주세요.', 'warning'); return; }

    const newKey = {
      id: 'key-' + Date.now().toString(36),
      name,
      key: generateApiKey(),
      scope: container.querySelector('#key-scope').value,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      visible: true, // 생성 직후에는 키를 보여줌
    };

    setState({ apiKeys: [...apiKeys, newKey] });
    showToast(`API 키 "${name}"이 생성되었습니다. 키를 복사해 안전하게 보관하세요.`, 'success');
    closeAll();
    renderApiPage(container, navigateTo);
  });

  // API 키 표시/숨김 토글
  container.querySelectorAll('.btn-toggle-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const keyId = btn.dataset.keyId;
      const updated = apiKeys.map(k =>
        k.id === keyId ? { ...k, visible: !k.visible } : k
      );
      setState({ apiKeys: updated });
      renderApiPage(container, navigateTo);
    });
  });

  // API 키 복사
  container.querySelectorAll('.btn-copy-key').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.key)
        .then(() => showToast('API 키가 클립보드에 복사되었습니다.', 'success'))
        .catch(() => showToast('복사에 실패했습니다. 수동으로 복사해 주세요.', 'error'));
    });
  });

  // API 키 폐기
  container.querySelectorAll('.btn-revoke-key').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('이 API 키를 폐기하시겠습니까? 이 키를 사용하는 모든 연동이 중단됩니다.')) return;
      const keyId = btn.dataset.keyId;
      setState({ apiKeys: apiKeys.filter(k => k.id !== keyId) });
      showToast('API 키를 폐기했습니다.', 'info');
      renderApiPage(container, navigateTo);
    });
  });

  // Webhook 추가
  container.querySelector('#btn-add-webhook').addEventListener('click', () => {
    webhookModal.style.display = 'flex';
  });

  container.querySelector('#webhook-save').addEventListener('click', () => {
    const name = container.querySelector('#webhook-name').value.trim();
    const url = container.querySelector('#webhook-url').value.trim();
    if (!name || !url) { showToast('이름과 URL을 입력해 주세요.', 'warning'); return; }

    const events = [];
    container.querySelectorAll('.webhook-event:checked').forEach(cb => events.push(cb.value));
    if (events.length === 0) { showToast('최소 1개의 이벤트를 선택해 주세요.', 'warning'); return; }

    const newWebhook = {
      id: 'wh-' + Date.now().toString(36),
      name, url, events,
      active: true,
      createdAt: new Date().toISOString(),
    };

    setState({ webhooks: [...webhooks, newWebhook] });
    showToast(`Webhook "${name}"을 추가했습니다.`, 'success');
    closeAll();
    renderApiPage(container, navigateTo);
  });

  // Webhook 삭제
  container.querySelectorAll('.btn-delete-webhook').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('이 Webhook을 삭제하시겠습니까?')) return;
      const whId = btn.dataset.whId;
      setState({ webhooks: webhooks.filter(w => w.id !== whId) });
      showToast('Webhook을 삭제했습니다.', 'info');
      renderApiPage(container, navigateTo);
    });
  });

  // 모달 닫기
  ['key-modal-close', 'key-cancel', 'webhook-modal-close', 'webhook-cancel'].forEach(id => {
    container.querySelector(`#${id}`)?.addEventListener('click', closeAll);
  });
  [keyModal, webhookModal].forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) closeAll(); });
  });
}
