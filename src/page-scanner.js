/**
 * page-scanner.js - 바코드/QR 스캔 입출고 페이지
 * 역할: 카메라로 바코드/QR을 스캔해서 빠르게 입고/출고 등록
 * 왜 필요? → 수기 입력 없이 핸드폰 카메라만으로 창고 실물 관리 가능
 */

import { Html5Qrcode } from 'html5-qrcode';
import { getState, addTransaction } from './store.js';
import { showToast } from './toast.js';

let scanner = null;

/**
 * 바코드 스캐너 페이지 렌더링
 */
export function renderScannerPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📱</span> 바코드/QR 스캔</h1>
        <div class="page-desc">카메라로 바코드를 스캔하면 자동으로 품목을 찾아 입출고를 등록합니다.</div>
      </div>
    </div>

    <!-- 스캔 모드 선택 -->
    <div class="scan-mode-bar">
      <button class="scan-mode-btn active" id="scan-mode-in" data-type="in">
        📥 입고 모드
      </button>
      <button class="scan-mode-btn" id="scan-mode-out" data-type="out">
        📤 출고 모드
      </button>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
      <!-- 카메라 영역 -->
      <div class="card">
        <div class="card-title">📷 카메라 스캔</div>
        <div id="scanner-region" style="width:100%; min-height:300px; background:#000; border-radius:8px; overflow:hidden;"></div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button class="btn btn-primary" id="btn-start-scan">📷 스캔 시작</button>
          <button class="btn btn-outline" id="btn-stop-scan" disabled>⏹ 스캔 중지</button>
        </div>
        <div style="margin-top:12px;">
          <div class="form-label">또는 코드 직접 입력</div>
          <div style="display:flex; gap:8px;">
            <input class="form-input" id="manual-code" placeholder="바코드/QR 코드를 입력하세요" />
            <button class="btn btn-primary" id="btn-manual-search">검색</button>
          </div>
        </div>
      </div>

      <!-- 스캔 결과 & 등록 -->
      <div>
        <div class="card" id="scan-result-card" style="display:none;">
          <div class="card-title">🔍 스캔 결과</div>
          <div id="scan-result-body"></div>
        </div>

        <!-- 최근 스캔 이력 -->
        <div class="card">
          <div class="card-title">📋 최근 스캔 이력 <span class="card-subtitle" id="scan-history-count">(0건)</span></div>
          <div id="scan-history-list">
            <div class="empty-state" style="padding:24px;">
              <div class="icon" style="font-size:32px;">📷</div>
              <div class="msg" style="font-size:13px;">스캔한 이력이 없습니다</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    ${items.length === 0 ? `
      <div class="alert alert-warning" style="margin-top:12px;">
        ⚠️ 등록된 품목이 없습니다. 먼저 재고 현황에서 품목을 등록하거나 파일을 업로드해 주세요.
        바코드 스캔 시 품목코드로 매칭됩니다.
      </div>
    ` : ''}
  `;

  // === 상태 ===
  let scanType = 'in'; // 'in' 또는 'out'
  const scanHistory = [];

  // 스캔 모드 전환 이벤트
  container.querySelectorAll('.scan-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.scan-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      scanType = btn.dataset.type;
      showToast(`${scanType === 'in' ? '📥 입고' : '📤 출고'} 모드로 전환`, 'info');
    });
  });

  // === 카메라 스캔 ===
  const startBtn = container.querySelector('#btn-start-scan');
  const stopBtn = container.querySelector('#btn-stop-scan');

  startBtn.addEventListener('click', async () => {
    try {
      // 기존 스캐너가 있으면 정리
      if (scanner) {
        try { await scanner.stop(); } catch (_) {}
      }

      scanner = new Html5Qrcode('scanner-region');
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => handleScanResult(decodedText),
        () => {} // 에러 무시 (스캔 진행 중)
      );

      startBtn.disabled = true;
      stopBtn.disabled = false;
      showToast('카메라 스캔을 시작합니다.', 'success');
    } catch (err) {
      showToast('카메라를 열 수 없습니다: ' + err.message, 'error');
    }
  });

  stopBtn.addEventListener('click', async () => {
    try {
      if (scanner) {
        await scanner.stop();
        scanner = null;
      }
      startBtn.disabled = false;
      stopBtn.disabled = true;
      showToast('스캔을 중지했습니다.', 'info');
    } catch (_) {}
  });

  // 수동 코드 입력
  container.querySelector('#btn-manual-search').addEventListener('click', () => {
    const code = container.querySelector('#manual-code').value.trim();
    if (!code) {
      showToast('코드를 입력해 주세요.', 'warning');
      return;
    }
    handleScanResult(code);
    container.querySelector('#manual-code').value = '';
  });

  // Enter 키 지원
  container.querySelector('#manual-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') container.querySelector('#btn-manual-search').click();
  });

  /**
   * 스캔 결과 처리
   * 왜 이렇게? → 스캔한 코드로 품목을 자동 매칭하고, 즉시 입출고 등록 UI를 보여줌
   */
  function handleScanResult(code) {
    // 품목 검색 (품목코드 일치)
    const matchedItem = items.find(item =>
      item.itemCode === code ||
      item.itemCode === code.trim()
    );

    const resultCard = container.querySelector('#scan-result-card');
    const resultBody = container.querySelector('#scan-result-body');
    resultCard.style.display = 'block';

    if (!matchedItem) {
      resultBody.innerHTML = `
        <div class="alert alert-warning" style="margin:0;">
          ❌ 코드 "${code}"에 해당하는 품목을 찾지 못했습니다.
          <br><small>품목코드가 정확한지 확인해 주세요.</small>
        </div>
      `;
      return;
    }

    const currentQty = parseFloat(matchedItem.quantity) || 0;
    const today = new Date().toISOString().split('T')[0];

    resultBody.innerHTML = `
      <div style="padding:4px 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <div style="font-size:16px; font-weight:700;">${matchedItem.itemName}</div>
            <div style="color:var(--text-muted); font-size:13px;">코드: ${matchedItem.itemCode} | 분류: ${matchedItem.category || '-'}</div>
          </div>
          <span class="badge ${scanType === 'in' ? 'badge-success' : 'badge-danger'}" style="font-size:13px; padding:4px 12px;">
            ${scanType === 'in' ? '📥 입고' : '📤 출고'}
          </span>
        </div>

        <div class="stat-grid" style="grid-template-columns: 1fr 1fr 1fr; margin-bottom:12px;">
          <div class="stat-card" style="padding:10px 14px;">
            <div class="stat-label">현재 재고</div>
            <div class="stat-value" style="font-size:18px;">${currentQty.toLocaleString('ko-KR')}</div>
          </div>
          <div class="stat-card" style="padding:10px 14px;">
            <div class="stat-label">단가</div>
            <div class="stat-value" style="font-size:18px;">${matchedItem.unitPrice ? '₩' + Math.round(parseFloat(matchedItem.unitPrice)).toLocaleString('ko-KR') : '-'}</div>
          </div>
          <div class="stat-card" style="padding:10px 14px;">
            <div class="stat-label">거래처</div>
            <div class="stat-value" style="font-size:14px;">${matchedItem.vendor || '-'}</div>
          </div>
        </div>

        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">수량 <span class="required">*</span></label>
            <input class="form-input" type="number" id="scan-qty" value="1" min="1" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">비고</label>
            <input class="form-input" id="scan-note" placeholder="메모 (선택)" />
          </div>
        </div>

        <button class="btn ${scanType === 'in' ? 'btn-success' : 'btn-danger'} btn-lg" id="btn-scan-register" style="width:100%;">
          ${scanType === 'in' ? '📥 입고 등록' : '📤 출고 등록'}
        </button>
      </div>
    `;

    // 수량 입력에 포커스
    const qtyInput = resultBody.querySelector('#scan-qty');
    qtyInput.focus();
    qtyInput.select();

    // 등록 이벤트
    resultBody.querySelector('#btn-scan-register').addEventListener('click', () => {
      const qty = parseFloat(qtyInput.value);
      if (!qty || qty <= 0) {
        showToast('수량을 입력해 주세요.', 'warning');
        return;
      }

      // 출고 시 재고 확인
      if (scanType === 'out' && qty > currentQty) {
        showToast(`재고가 부족합니다. (현재 ${currentQty})`, 'error');
        return;
      }

      const note = resultBody.querySelector('#scan-note').value.trim();
      openScanConfirm({
        item: matchedItem,
        qty,
        note,
        type: scanType,
        date: today,
        currentQty,
      }, () => {
        addTransaction({
          type: scanType,
          itemName: matchedItem.itemName,
          itemCode: matchedItem.itemCode || '',
          quantity: qty,
          unitPrice: parseFloat(matchedItem.unitPrice) || 0,
          date: today,
          note: note ? `[스캔] ${note}` : '[스캔]',
        });

        // 이력 추가
        scanHistory.unshift({
          time: new Date().toLocaleTimeString('ko-KR'),
          type: scanType,
          name: matchedItem.itemName,
          code: matchedItem.itemCode,
          qty,
        });

        showToast(
          `${scanType === 'in' ? '입고' : '출고'} 등록: ${matchedItem.itemName} ${qty}개`,
          scanType === 'in' ? 'success' : 'info'
        );

        // 결과 초기화 & 이력 업데이트
        resultCard.style.display = 'none';
        renderScanHistory();
      });
    });

    // Enter 키로 바로 등록
    qtyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') resultBody.querySelector('#btn-scan-register').click();
    });
  }

  /**
   * 스캔 이력 렌더링
   */
  function renderScanHistory() {
    const listEl = container.querySelector('#scan-history-list');
    const countEl = container.querySelector('#scan-history-count');
    countEl.textContent = `(${scanHistory.length}건)`;

    if (scanHistory.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="padding:24px;">
          <div class="icon" style="font-size:32px;">📷</div>
          <div class="msg" style="font-size:13px;">스캔한 이력이 없습니다</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = scanHistory.slice(0, 20).map(h => `
      <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border-light);">
        <span class="${h.type === 'in' ? 'type-in' : 'type-out'}" style="font-size:16px;">
          ${h.type === 'in' ? '📥' : '📤'}
        </span>
        <div style="flex:1;">
          <div style="font-weight:500; font-size:13px;">${h.name}</div>
          <div style="color:var(--text-muted); font-size:11px;">${h.code} | ${h.time}</div>
        </div>
        <span class="${h.type === 'in' ? 'type-in' : 'type-out'}" style="font-size:13px;">
          ${h.type === 'in' ? '+' : '-'}${h.qty}
        </span>
      </div>
    `).join('');
  }

  function openScanConfirm(payload, onConfirm) {
    const existing = document.getElementById('scan-confirm-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'scan-confirm-modal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3 class="modal-title">스캔 등록 확인</h3>
          <button class="modal-close" data-scan-close>✕</button>
        </div>
        <div class="modal-body">
          <div style="display:grid; gap:10px;">
            <div><strong>${payload.item.itemName}</strong> (${payload.item.itemCode || '-'})</div>
            <div>유형: <strong>${payload.type === 'in' ? '입고' : '출고'}</strong></div>
            <div>수량: <strong>${payload.qty.toLocaleString('ko-KR')}개</strong></div>
            <div>기준 재고: ${payload.currentQty.toLocaleString('ko-KR')}개 → ${
              payload.type === 'in'
                ? (payload.currentQty + payload.qty).toLocaleString('ko-KR')
                : Math.max(0, payload.currentQty - payload.qty).toLocaleString('ko-KR')
            }개</div>
            <div>날짜: ${payload.date}</div>
            ${payload.note ? `<div>메모: ${payload.note}</div>` : ''}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-scan-cancel>취소</button>
          <button class="btn btn-primary" data-scan-confirm>등록</button>
        </div>
      </div>
    `;
    overlay.querySelector('[data-scan-close]')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('[data-scan-cancel]')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('[data-scan-confirm]')?.addEventListener('click', () => {
      overlay.remove();
      onConfirm();
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }
}
