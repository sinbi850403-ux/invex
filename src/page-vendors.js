/**
 * page-vendors.js - 거래처 마스터 관리 (ERP급)
 * 역할: 공급처·고객사를 완전히 관리 — 코드, 업태/종목, 결제조건, 신용한도, 거래이력
 * 모든 발주서·거래명세서·세금계산서의 기초 데이터
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { escapeHtml } from './ux-toolkit.js';

function safeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ── 자동 거래처 코드 생성 ──────────────────────────────── */
function genVendorCode(vendors, type) {
  const prefix = type === 'customer' ? 'C' : type === 'both' ? 'B' : 'S';
  const existing = vendors
    .filter(v => (v.code || '').startsWith(prefix))
    .map(v => parseInt((v.code || '').slice(1)) || 0);
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/* ── 금액 포맷 ──────────────────────────────────────────── */
function fmt(v) {
  const n = parseFloat(String(v || '').replace(/,/g, '')) || 0;
  if (!n) return '-';
  return '₩' + Math.round(n).toLocaleString('ko-KR');
}

function toNum(v) {
  return parseFloat(String(v || '').replace(/,/g, '')) || 0;
}

/* ── 거래처 유형 레이블 ─────────────────────────────────── */
const TYPE_LABEL = { supplier: '매입처', customer: '매출처', both: '양방향' };
const TYPE_BADGE = { supplier: 'badge-info', customer: 'badge-success', both: 'badge-warning' };

/* ── 결제 조건 옵션 ─────────────────────────────────────── */
const PAYMENT_TERMS = [
  { value: '', label: '-- 선택 --' },
  { value: 'cash', label: '현금' },
  { value: 'card', label: '카드' },
  { value: 'transfer', label: '계좌이체' },
  { value: 'bill30', label: '30일 어음' },
  { value: 'bill60', label: '60일 어음' },
  { value: 'bill90', label: '90일 어음' },
  { value: 'consign', label: '위탁' },
];

/* ── 거래처별 통계 빌드 ─────────────────────────────────── */
function buildStats(vendors, transactions) {
  const map = new Map();
  vendors.forEach(v => map.set(v.name, { inAmt: 0, outAmt: 0, count: 0, lastDate: '' }));

  transactions.forEach(tx => {
    const name = (tx.vendor || '').trim();
    if (!name) return;
    if (!map.has(name)) map.set(name, { inAmt: 0, outAmt: 0, count: 0, lastDate: '' });
    const s = map.get(name);
    const amt = toNum(tx.quantity) * toNum(tx.unitPrice || tx.unitCost || tx.price || 0);
    if (tx.type === 'in') s.inAmt += amt;
    if (tx.type === 'out') s.outAmt += amt;
    s.count++;
    const d = String(tx.date || tx.createdAt || '');
    if (d > s.lastDate) s.lastDate = d;
  });

  let totalIn = 0, totalOut = 0, activeCount = 0;
  map.forEach(s => {
    totalIn += s.inAmt; totalOut += s.outAmt;
    if (s.count > 0) activeCount++;
  });
  return { map, totalIn, totalOut, activeCount };
}

/* ═══════════════════════════════════════════════════════════
   메인 렌더
═══════════════════════════════════════════════════════════ */
let currentTab = 'all';
let currentKeyword = '';

export function renderVendorsPage(container, navigateTo) {
  const state   = getState();
  const vendors = state.vendorMaster || [];
  const txs     = state.transactions || [];
  const stats   = buildStats(vendors, txs);

  const supplierCount  = vendors.filter(v => v.type === 'supplier').length;
  const customerCount  = vendors.filter(v => v.type === 'customer').length;
  const bothCount      = vendors.filter(v => v.type === 'both').length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">거래처 관리</h1>
        <div class="page-desc">공급처·고객사 마스터 데이터를 관리합니다. 발주서·거래명세서·세금계산서에 자동 연동됩니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-vendor-import">📂 엑셀 가져오기</button>
        <button class="btn btn-outline" id="btn-vendor-export">📥 내보내기</button>
        <button class="btn btn-primary" id="btn-add-vendor">+ 거래처 등록</button>
      </div>
    </div>

    <!-- 요약 카드 -->
    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px;">
      <div class="card card-compact" style="text-align:center;">
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">전체 거래처</div>
        <div style="font-size:24px; font-weight:700; color:var(--accent);">${vendors.length}</div>
      </div>
      <div class="card card-compact" style="text-align:center;">
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">매입처</div>
        <div style="font-size:24px; font-weight:700; color:var(--info);">${supplierCount + bothCount}</div>
      </div>
      <div class="card card-compact" style="text-align:center;">
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">매출처</div>
        <div style="font-size:24px; font-weight:700; color:var(--success);">${customerCount + bothCount}</div>
      </div>
      <div class="card card-compact" style="text-align:center;">
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">거래 발생</div>
        <div style="font-size:24px; font-weight:700;">${stats.activeCount}</div>
      </div>
    </div>

    <!-- 탭 + 검색 -->
    <div class="card card-compact" style="margin-bottom:12px;">
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <div style="display:flex; gap:4px; background:var(--bg-input); border-radius:8px; padding:4px;">
          ${[
            { key: 'all',      label: `전체 (${vendors.length})` },
            { key: 'supplier', label: `매입처 (${supplierCount})` },
            { key: 'customer', label: `매출처 (${customerCount})` },
            { key: 'both',     label: `양방향 (${bothCount})` },
          ].map(t => `
            <button class="vendor-tab${currentTab === t.key ? ' active' : ''}" data-tab="${t.key}"
              style="padding:6px 14px; border-radius:6px; border:none; cursor:pointer; font-size:13px;
              background:${currentTab === t.key ? 'var(--accent)' : 'transparent'};
              color:${currentTab === t.key ? '#fff' : 'var(--text-muted)'};">
              ${t.label}
            </button>
          `).join('')}
        </div>
        <input class="form-input" id="vendor-search" placeholder="🔍 거래처명·코드·담당자·사업자번호 검색..."
          value="${safeAttr(currentKeyword)}" style="flex:1; min-width:200px;" />
      </div>
    </div>

    <!-- 거래처 목록 -->
    <div id="vendor-table-area">
      ${renderVendorTable(vendors, txs, stats.map)}
    </div>

    <!-- 상세 슬라이드오버 -->
    <div id="vendor-detail-overlay" style="display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.4);">
      <div id="vendor-detail-panel"
        style="position:absolute; right:0; top:0; bottom:0; width:520px; max-width:95vw;
               background:var(--bg-card); box-shadow:-4px 0 24px rgba(0,0,0,0.3);
               display:flex; flex-direction:column; overflow:hidden;">
        <div id="vendor-detail-content" style="flex:1; overflow-y:auto;"></div>
      </div>
    </div>

    <!-- 등록/수정 모달 -->
    <div class="modal-overlay" id="vendor-modal" style="display:none;">
      <div class="modal" style="max-width:680px; width:95vw;">
        <div class="modal-header">
          <h2 class="modal-title" id="vendor-modal-title">거래처 등록</h2>
          <button class="modal-close" id="vendor-modal-close">✕</button>
        </div>
        <div class="modal-body" id="vendor-modal-body"></div>
      </div>
    </div>
  `;

  /* ── 탭 전환 ── */
  container.querySelectorAll('.vendor-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      renderVendorsPage(container, navigateTo);
    });
  });

  /* ── 검색 ── */
  container.querySelector('#vendor-search').addEventListener('input', e => {
    currentKeyword = e.target.value;
    container.querySelector('#vendor-table-area').innerHTML =
      renderVendorTable(vendors, txs, stats.map);
    bindTableActions(container, vendors, txs, stats.map, navigateTo);
  });

  /* ── 등록 버튼 ── */
  container.querySelector('#btn-add-vendor').addEventListener('click', () => {
    openVendorModal(container, null, vendors, navigateTo);
  });

  /* ── 내보내기 ── */
  container.querySelector('#btn-vendor-export').addEventListener('click', () => {
    if (!vendors.length) { showToast('내보낼 거래처가 없습니다.', 'warning'); return; }
    const rows = vendors.map(v => ({
      '거래처코드': v.code || '',
      '구분': TYPE_LABEL[v.type] || '',
      '거래처명': v.name,
      '사업자번호': v.bizNumber || '',
      '대표자': v.ceoName || '',
      '업태': v.bizType || '',
      '종목': v.bizItem || '',
      '담당자': v.contactName || '',
      '연락처': v.phone || '',
      '이메일': v.email || '',
      '팩스': v.fax || '',
      '주소': v.address || '',
      '결제조건': (PAYMENT_TERMS.find(p => p.value === v.paymentTerm) || {}).label || '',
      '신용한도': v.creditLimit || '',
      '은행': v.bankName || '',
      '계좌번호': v.bankAccount || '',
      '예금주': v.bankHolder || '',
      '비고': v.note || '',
    }));
    downloadExcel(rows, '거래처마스터');
    showToast('거래처 목록을 내보냈습니다.', 'success');
  });

  /* ── 엑셀 가져오기 (placeholder) ── */
  container.querySelector('#btn-vendor-import').addEventListener('click', () => {
    showToast('엑셀 가져오기 기능은 준비 중입니다.', 'info');
  });

  /* ── 상세 오버레이 닫기 ── */
  container.querySelector('#vendor-detail-overlay').addEventListener('click', e => {
    if (e.target.id === 'vendor-detail-overlay') closeDetail(container);
  });

  bindTableActions(container, vendors, txs, stats.map, navigateTo);
}

/* ═══════════════════════════════════════════════════════════
   거래처 목록 테이블
═══════════════════════════════════════════════════════════ */
function renderVendorTable(vendors, txs, statsMap) {
  const kw = currentKeyword.toLowerCase();
  let filtered = vendors.filter(v => {
    if (currentTab !== 'all' && v.type !== currentTab) return false;
    if (kw) {
      const hay = [v.name, v.code, v.contactName, v.bizNumber, v.phone, v.email]
        .map(x => String(x || '').toLowerCase()).join(' ');
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    return `<div class="card" style="padding:48px; text-align:center; color:var(--text-muted);">
      <div style="font-size:40px; margin-bottom:12px;">🤝</div>
      <div style="font-size:15px;">${kw ? '검색 결과가 없습니다.' : '등록된 거래처가 없습니다.'}</div>
      ${!kw ? '<div style="margin-top:8px; font-size:13px;">위 [+ 거래처 등록] 버튼을 눌러 추가하세요.</div>' : ''}
    </div>`;
  }

  return `
    <div class="card card-flush">
      <div class="table-wrapper" style="border:none; border-radius:0;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:90px;">코드</th>
              <th style="width:70px;">구분</th>
              <th>거래처명</th>
              <th>사업자번호</th>
              <th>담당자</th>
              <th>연락처</th>
              <th>결제조건</th>
              <th class="text-right">거래 건수</th>
              <th class="text-right">누적 매입</th>
              <th class="text-right">누적 매출</th>
              <th>최근 거래</th>
              <th style="width:110px;">관리</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(v => {
              const s = statsMap?.get(v.name) || { inAmt: 0, outAmt: 0, count: 0, lastDate: '' };
              const realIdx = vendors.indexOf(v);
              const payLabel = (PAYMENT_TERMS.find(p => p.value === v.paymentTerm) || {}).label || '-';
              return `
                <tr>
                  <td style="font-size:11px; color:var(--text-muted); font-family:monospace;">${escapeHtml(v.code || '-')}</td>
                  <td><span class="badge ${TYPE_BADGE[v.type] || 'badge-default'}">${TYPE_LABEL[v.type] || '-'}</span></td>
                  <td>
                    <button class="vendor-detail-btn" data-idx="${safeAttr(realIdx)}"
                      style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:700; font-size:14px; padding:0; text-align:left;">
                      ${escapeHtml(v.name)}
                    </button>
                    ${v.ceoName ? `<div style="font-size:11px; color:var(--text-muted);">대표: ${escapeHtml(v.ceoName)}</div>` : ''}
                    ${v.bizType ? `<div style="font-size:11px; color:var(--text-muted);">${escapeHtml(v.bizType)} / ${escapeHtml(v.bizItem || '')}</div>` : ''}
                  </td>
                  <td style="font-size:12px;">${escapeHtml(v.bizNumber || '-')}</td>
                  <td style="font-size:13px;">${escapeHtml(v.contactName || '-')}</td>
                  <td style="font-size:12px;">${escapeHtml(v.phone || '-')}</td>
                  <td style="font-size:12px;">${payLabel}</td>
                  <td class="text-right">${s.count.toLocaleString('ko-KR')}건</td>
                  <td class="text-right" style="font-size:12px;">${fmt(s.inAmt)}</td>
                  <td class="text-right" style="font-size:12px;">${fmt(s.outAmt)}</td>
                  <td style="font-size:12px; color:var(--text-muted);">${s.lastDate ? s.lastDate.slice(0,10) : '-'}</td>
                  <td>
                    <div style="display:flex; gap:4px;">
                      <button class="btn btn-xs btn-outline vendor-detail-btn" data-idx="${safeAttr(realIdx)}" title="상세보기">상세</button>
                      <button class="btn btn-xs btn-outline vendor-edit" data-idx="${safeAttr(realIdx)}" title="수정">수정</button>
                      <button class="btn btn-xs btn-icon-danger vendor-delete" data-idx="${safeAttr(realIdx)}" title="삭제">삭제</button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   상세 슬라이드오버
═══════════════════════════════════════════════════════════ */
function openDetail(container, vendor, txs, navigateTo) {
  const overlay = container.querySelector('#vendor-detail-overlay');
  const content = container.querySelector('#vendor-detail-content');
  overlay.style.display = 'block';

  const vendorTxs = txs.filter(tx => (tx.vendor || '').trim() === vendor.name).reverse();
  const inAmt  = vendorTxs.filter(t => t.type === 'in').reduce((s, t) => s + toNum(t.quantity) * toNum(t.unitPrice || 0), 0);
  const outAmt = vendorTxs.filter(t => t.type === 'out').reduce((s, t) => s + toNum(t.quantity) * toNum(t.unitPrice || 0), 0);
  const payLabel = (PAYMENT_TERMS.find(p => p.value === vendor.paymentTerm) || {}).label || '-';

  content.innerHTML = `
    <div style="padding:20px 24px 8px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:flex-start;">
      <div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
          <span class="badge ${TYPE_BADGE[vendor.type] || ''}">${TYPE_LABEL[vendor.type] || ''}</span>
          <span style="font-size:12px; color:var(--text-muted); font-family:monospace;">${escapeHtml(vendor.code || '')}</span>
        </div>
        <h2 style="font-size:20px; font-weight:700; margin:0 0 2px;">${escapeHtml(vendor.name)}</h2>
        ${vendor.ceoName ? `<div style="font-size:13px; color:var(--text-muted);">대표: ${escapeHtml(vendor.ceoName)}</div>` : ''}
      </div>
      <button id="detail-close" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-muted);">✕</button>
    </div>

    <!-- 요약 수치 -->
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1px; background:var(--border); margin-bottom:16px;">
      ${[
        { label: '총 거래 건수', value: `${vendorTxs.length}건` },
        { label: '누적 매입액', value: fmt(inAmt) },
        { label: '누적 매출액', value: fmt(outAmt) },
      ].map(c => `
        <div style="background:var(--bg-card); padding:12px 16px; text-align:center;">
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">${c.label}</div>
          <div style="font-size:16px; font-weight:700;">${c.value}</div>
        </div>`).join('')}
    </div>

    <div style="padding:0 24px 24px;">
      <!-- 기본 정보 -->
      <div style="margin-bottom:20px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-muted); letter-spacing:0.05em; margin-bottom:10px;">기본 정보</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          ${[
            { label: '사업자번호', value: vendor.bizNumber },
            { label: '업태 / 종목', value: [vendor.bizType, vendor.bizItem].filter(Boolean).join(' / ') },
            { label: '담당자', value: vendor.contactName },
            { label: '연락처', value: vendor.phone },
            { label: '이메일', value: vendor.email },
            { label: '팩스', value: vendor.fax },
            { label: '결제조건', value: payLabel },
            { label: '신용한도', value: vendor.creditLimit ? fmt(vendor.creditLimit) : undefined },
          ].filter(r => r.value).map(r => `
            <div style="background:var(--bg-input); border-radius:6px; padding:8px 10px;">
              <div style="font-size:10px; color:var(--text-muted); margin-bottom:2px;">${r.label}</div>
              <div style="font-size:13px; font-weight:600;">${escapeHtml(String(r.value))}</div>
            </div>`).join('')}
        </div>
        ${vendor.address ? `<div style="margin-top:8px; background:var(--bg-input); border-radius:6px; padding:8px 10px;">
          <div style="font-size:10px; color:var(--text-muted); margin-bottom:2px;">주소</div>
          <div style="font-size:13px;">${escapeHtml(vendor.address)}</div>
        </div>` : ''}
        ${(vendor.bankName || vendor.bankAccount) ? `<div style="margin-top:8px; background:var(--bg-input); border-radius:6px; padding:8px 10px;">
          <div style="font-size:10px; color:var(--text-muted); margin-bottom:2px;">계좌정보</div>
          <div style="font-size:13px;">${escapeHtml([vendor.bankName, vendor.bankAccount, vendor.bankHolder].filter(Boolean).join(' / '))}</div>
        </div>` : ''}
        ${vendor.note ? `<div style="margin-top:8px; background:var(--bg-input); border-radius:6px; padding:8px 10px;">
          <div style="font-size:10px; color:var(--text-muted); margin-bottom:2px;">비고</div>
          <div style="font-size:13px; color:var(--text-muted);">${escapeHtml(vendor.note)}</div>
        </div>` : ''}
      </div>

      <!-- 거래 이력 -->
      <div>
        <div style="font-size:12px; font-weight:700; color:var(--text-muted); letter-spacing:0.05em; margin-bottom:10px;">
          최근 거래 이력 <span style="font-weight:400;">(${vendorTxs.length}건)</span>
        </div>
        ${vendorTxs.length === 0 ? `<div style="text-align:center; padding:24px; color:var(--text-muted); font-size:13px;">거래 이력이 없습니다.</div>` : `
          <div style="border:1px solid var(--border); border-radius:8px; overflow:hidden;">
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
              <thead>
                <tr style="background:var(--bg-input);">
                  <th style="padding:8px 10px; text-align:left; color:var(--text-muted);">날짜</th>
                  <th style="padding:8px 10px; text-align:left; color:var(--text-muted);">구분</th>
                  <th style="padding:8px 10px; text-align:left; color:var(--text-muted);">품목</th>
                  <th style="padding:8px 10px; text-align:right; color:var(--text-muted);">수량</th>
                  <th style="padding:8px 10px; text-align:right; color:var(--text-muted);">금액</th>
                </tr>
              </thead>
              <tbody>
                ${vendorTxs.slice(0, 20).map((tx, i) => {
                  const amt = toNum(tx.quantity) * toNum(tx.unitPrice || 0);
                  return `<tr style="border-top:1px solid var(--border); ${i % 2 === 0 ? '' : 'background:var(--bg-input)'}">
                    <td style="padding:7px 10px; color:var(--text-muted);">${String(tx.date || '').slice(0,10)}</td>
                    <td style="padding:7px 10px;"><span class="${tx.type === 'in' ? 'type-in' : 'type-out'}">${tx.type === 'in' ? '입고' : '출고'}</span></td>
                    <td style="padding:7px 10px;">${escapeHtml(tx.itemName || '-')}</td>
                    <td style="padding:7px 10px; text-align:right;">${toNum(tx.quantity).toLocaleString('ko-KR')}</td>
                    <td style="padding:7px 10px; text-align:right;">${fmt(amt)}</td>
                  </tr>`;
                }).join('')}
                ${vendorTxs.length > 20 ? `<tr><td colspan="5" style="padding:8px; text-align:center; color:var(--text-muted);">외 ${vendorTxs.length - 20}건 더 있음</td></tr>` : ''}
              </tbody>
            </table>
          </div>`}
      </div>
    </div>
  `;

  content.querySelector('#detail-close').addEventListener('click', () => closeDetail(container));
}

function closeDetail(container) {
  container.querySelector('#vendor-detail-overlay').style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════
   이벤트 바인딩
═══════════════════════════════════════════════════════════ */
function bindTableActions(container, vendors, txs, statsMap, navigateTo) {
  container.querySelectorAll('.vendor-detail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      openDetail(container, vendors[idx], txs, navigateTo);
    });
  });

  container.querySelectorAll('.vendor-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      openVendorModal(container, vendors[idx], vendors, navigateTo);
    });
  });

  container.querySelectorAll('.vendor-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const v = vendors[idx];
      if (!confirm(`"${v.name}" 거래처를 삭제하시겠습니까?`)) return;
      setState({ vendorMaster: vendors.filter((_, i) => i !== idx) });
      showToast('거래처를 삭제했습니다.', 'info');
      renderVendorsPage(container, navigateTo);
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   등록/수정 모달
═══════════════════════════════════════════════════════════ */
function openVendorModal(container, editVendor, vendors, navigateTo) {
  const modal = container.querySelector('#vendor-modal');
  const title = container.querySelector('#vendor-modal-title');
  const body  = container.querySelector('#vendor-modal-body');

  const isEdit = !!editVendor;
  title.textContent = isEdit ? '거래처 수정' : '거래처 등록';
  modal.style.display = 'flex';

  const d = editVendor || {};
  const suggestedCode = isEdit ? (d.code || '') : genVendorCode(vendors, d.type || 'supplier');

  body.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
      <!-- 좌측: 필수 정보 -->
      <div>
        <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:10px; letter-spacing:0.05em;">기본 정보</div>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">구분 <span class="required">*</span></label>
            <select class="form-select" id="vm-type">
              <option value="supplier" ${d.type === 'supplier' ? 'selected' : ''}>매입처 (공급처)</option>
              <option value="customer" ${d.type === 'customer' ? 'selected' : ''}>매출처 (고객사)</option>
              <option value="both" ${d.type === 'both' ? 'selected' : ''}>양방향 (매입+매출)</option>
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">거래처 코드</label>
            <input class="form-input" id="vm-code" value="${safeAttr(d.code || suggestedCode)}" placeholder="자동생성" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label">거래처명 <span class="required">*</span></label>
          <input class="form-input" id="vm-name" value="${safeAttr(d.name || '')}" placeholder="예: (주)삼성전자" />
        </div>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">사업자번호</label>
            <input class="form-input" id="vm-biz" value="${safeAttr(d.bizNumber || '')}" placeholder="000-00-00000" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">대표자명</label>
            <input class="form-input" id="vm-ceo" value="${safeAttr(d.ceoName || '')}" />
          </div>
        </div>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">업태</label>
            <input class="form-input" id="vm-biztype" value="${safeAttr(d.bizType || '')}" placeholder="예: 제조업" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">종목</label>
            <input class="form-input" id="vm-bizitem" value="${safeAttr(d.bizItem || '')}" placeholder="예: 전자부품" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label">주소</label>
          <input class="form-input" id="vm-address" value="${safeAttr(d.address || '')}" />
        </div>
      </div>

      <!-- 우측: 연락처 + 거래 조건 -->
      <div>
        <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:10px; letter-spacing:0.05em;">연락처</div>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">담당자명</label>
            <input class="form-input" id="vm-contact" value="${safeAttr(d.contactName || '')}" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">연락처</label>
            <input class="form-input" id="vm-phone" value="${safeAttr(d.phone || '')}" placeholder="010-0000-0000" />
          </div>
        </div>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">이메일</label>
            <input class="form-input" id="vm-email" value="${safeAttr(d.email || '')}" type="email" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">팩스</label>
            <input class="form-input" id="vm-fax" value="${safeAttr(d.fax || '')}" />
          </div>
        </div>

        <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin:16px 0 10px; letter-spacing:0.05em;">거래 조건</div>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">결제조건</label>
            <select class="form-select" id="vm-payterm">
              ${PAYMENT_TERMS.map(p => `<option value="${safeAttr(p.value)}" ${d.paymentTerm === p.value ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">신용한도 (₩)</label>
            <input class="form-input" id="vm-credit" type="number" value="${safeAttr(d.creditLimit || '')}" placeholder="0" />
          </div>
        </div>

        <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin:16px 0 10px; letter-spacing:0.05em;">계좌 정보</div>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">은행명</label>
            <input class="form-input" id="vm-bank-name" value="${safeAttr(d.bankName || '')}" placeholder="국민은행" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">예금주</label>
            <input class="form-input" id="vm-bank-holder" value="${safeAttr(d.bankHolder || '')}" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label">계좌번호</label>
          <input class="form-input" id="vm-bank-account" value="${safeAttr(d.bankAccount || '')}" placeholder="000-000-000000" />
        </div>
      </div>
    </div>

    <div class="form-group" style="margin-bottom:16px;">
      <label class="form-label">비고</label>
      <input class="form-input" id="vm-note" value="${safeAttr(d.note || '')}" placeholder="특이사항, 메모 등" />
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end; padding-top:12px; border-top:1px solid var(--border);">
      <button class="btn btn-outline" id="vm-cancel">취소</button>
      <button class="btn btn-primary" id="vm-save">${isEdit ? '수정 저장' : '등록'}</button>
    </div>
  `;

  /* 구분 변경 시 코드 자동 제안 */
  if (!isEdit) {
    body.querySelector('#vm-type').addEventListener('change', e => {
      const codeInput = body.querySelector('#vm-code');
      if (!codeInput.value || /^[SCB]\d{4}$/.test(codeInput.value)) {
        codeInput.value = genVendorCode(vendors, e.target.value);
      }
    });
  }

  const closeModal = () => { modal.style.display = 'none'; };
  container.querySelector('#vendor-modal-close').onclick = closeModal;
  body.querySelector('#vm-cancel').onclick = closeModal;

  body.querySelector('#vm-save').addEventListener('click', () => {
    const name = body.querySelector('#vm-name').value.trim();
    if (!name) { showToast('거래처명을 입력해 주세요.', 'warning'); return; }

    const type = body.querySelector('#vm-type').value;
    const code = body.querySelector('#vm-code').value.trim() || genVendorCode(vendors, type);

    /* 코드 중복 체크 */
    const codeConflict = vendors.find((v, i) => v.code === code && i !== (isEdit ? vendors.indexOf(editVendor) : -1));
    if (codeConflict) { showToast(`거래처 코드 "${code}"가 이미 사용 중입니다.`, 'warning'); return; }

    const newVendor = {
      code,
      type,
      name,
      bizNumber:   body.querySelector('#vm-biz').value.trim(),
      ceoName:     body.querySelector('#vm-ceo').value.trim(),
      bizType:     body.querySelector('#vm-biztype').value.trim(),
      bizItem:     body.querySelector('#vm-bizitem').value.trim(),
      contactName: body.querySelector('#vm-contact').value.trim(),
      phone:       body.querySelector('#vm-phone').value.trim(),
      email:       body.querySelector('#vm-email').value.trim(),
      fax:         body.querySelector('#vm-fax').value.trim(),
      address:     body.querySelector('#vm-address').value.trim(),
      paymentTerm: body.querySelector('#vm-payterm').value,
      creditLimit: parseFloat(body.querySelector('#vm-credit').value) || 0,
      bankName:    body.querySelector('#vm-bank-name').value.trim(),
      bankAccount: body.querySelector('#vm-bank-account').value.trim(),
      bankHolder:  body.querySelector('#vm-bank-holder').value.trim(),
      note:        body.querySelector('#vm-note').value.trim(),
      createdAt:   editVendor?.createdAt || new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    };

    const updated = [...vendors];
    if (isEdit) {
      updated[vendors.indexOf(editVendor)] = newVendor;
    } else {
      updated.push(newVendor);
    }

    setState({ vendorMaster: updated });
    showToast(`"${name}" 거래처를 ${isEdit ? '수정' : '등록'}했습니다.`, 'success');
    closeModal();
    renderVendorsPage(container, navigateTo);
  });
}
