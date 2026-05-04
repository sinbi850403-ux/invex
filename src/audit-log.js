/**
 * audit-log.js - 감사 추적 시스템
 * 역할: 모든 데이터 변경 이력을 자동 기록 (누가, 언제, 뭘, 왜)
 * 왜 필수? → 세무조사 시 변경 이력 제출 필수. 보안·컴플라이언스의 기초.
 */

import { getState, setState } from './store.js';
import { auditLogs as auditLogsDb } from './db.js';

/**
 * HTML 특수문자 이스케이프 — innerHTML XSS 방지
 * VULN-002 / ATTACK-003 대응 패치 (2026-05-03)
 * @param {*} value - 이스케이프할 값
 * @returns {string}
 */
function escHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * 감사 로그 추가
 * @param {string} action - 행위 (예: '입고', '출고', '재고조정', '삭제')
 * @param {string} target - 대상 (예: 'A4용지')
 * @param {object} detail - 상세 정보 (before/after 등)
 */
// 민감 필드 — 감사 로그에 평문 저장 금지
const SENSITIVE_KEYS = ['rrn', 'password', 'accountNo', 'bankAccount', 'token', 'secret'];

function sanitizeDetail(detail) {
  if (!detail || typeof detail !== 'object') return detail;
  const result = {};
  for (const [k, v] of Object.entries(detail)) {
    result[k] = SENSITIVE_KEYS.some(s => k.toLowerCase().includes(s)) ? '[REDACTED]' : v;
  }
  return result;
}

export function addAuditLog(action, target, detail = {}) {
  const state = getState();
  const logs = state.auditLogs || [];
  const safeDetail = sanitizeDetail(detail);

  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    action,
    target,
    detail: safeDetail,
    user: state.userName || '관리자',
  };

  // 로컬 store 갱신
  const updated = [...logs, entry];
  if (updated.length > 5000) updated.splice(0, updated.length - 5000);
  setState({ auditLogs: updated });

  // Supabase 즉시 저장 (동기화 디바운스와 무관하게 즉시 기록)
  auditLogsDb.create({ action, target, detail: safeDetail }).catch(err => {
    console.warn('[AuditLog] Supabase 저장 실패:', err.message);
  });
}

/**
 * 감사 로그 페이지 렌더
 */
export function renderAuditLogPage(container, navigateTo) {
  const state = getState();
  const logs = (state.auditLogs || []).slice().reverse();

  // 필터 옵션
  const actions = [...new Set(logs.map(l => l.action))];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">감사 추적</h1>
        <div class="page-desc">모든 데이터 변경 이력을 기록합니다. 세무·감사 대비 필수 기능.</div>
      </div>
      <div class="page-actions">
        <span style="font-size:12px; color:var(--text-muted);">총 ${logs.length}건</span>
      </div>
    </div>

    <div class="card card-compact" style="margin-bottom:12px;">
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <div style="flex:1; min-width:180px;">
          <input class="form-input" id="audit-search" placeholder=" 대상, 행위 검색..." />
        </div>
        <select class="form-select" id="audit-action-filter" style="width:auto;">
          <option value="">전체 행위</option>
          ${actions.map(a => `<option value="${escHtml(a)}">${escHtml(a)}</option>`).join('')}
        </select>
        <select class="form-select" id="audit-period-filter" style="width:auto;">
          <option value="">전체 기간</option>
          <option value="today">오늘</option>
          <option value="week">최근 7일</option>
          <option value="month">최근 30일</option>
        </select>
      </div>
    </div>

    <div class="card card-flush" id="audit-list">
      ${renderAuditList(logs)}
    </div>
  `;

  // 필터링
  const filterLogs = () => {
    const keyword = container.querySelector('#audit-search').value.toLowerCase();
    const actionFilter = container.querySelector('#audit-action-filter').value;
    const periodFilter = container.querySelector('#audit-period-filter').value;

    let filtered = logs;

    if (keyword) {
      filtered = filtered.filter(l =>
        (l.target || '').toLowerCase().includes(keyword) ||
        (l.action || '').toLowerCase().includes(keyword)
      );
    }

    if (actionFilter) {
      filtered = filtered.filter(l => l.action === actionFilter);
    }

    if (periodFilter) {
      const now = new Date();
      const cutoff = new Date();
      if (periodFilter === 'today') cutoff.setHours(0, 0, 0, 0);
      else if (periodFilter === 'week') cutoff.setDate(now.getDate() - 7);
      else if (periodFilter === 'month') cutoff.setDate(now.getDate() - 30);
      filtered = filtered.filter(l => new Date(l.timestamp) >= cutoff);
    }

    container.querySelector('#audit-list').innerHTML = renderAuditList(filtered);
  };

  container.querySelector('#audit-search').addEventListener('input', filterLogs);
  container.querySelector('#audit-action-filter').addEventListener('change', filterLogs);
  container.querySelector('#audit-period-filter').addEventListener('change', filterLogs);
}

function renderAuditList(logs) {
  if (logs.length === 0) {
    return '<div style="padding:40px; text-align:center; color:var(--text-muted);">기록이 없습니다</div>';
  }

  // 날짜별 그룹핑
  const groups = {};
  logs.forEach(l => {
    const date = l.timestamp.split('T')[0];
    if (!groups[date]) groups[date] = [];
    groups[date].push(l);
  });

  return Object.entries(groups).map(([date, items]) => `
    <div style="padding:8px 16px; background:var(--bg-main); font-size:12px; font-weight:600; color:var(--text-muted); border-bottom:1px solid var(--border-light);">
       ${date} (${items.length}건)
    </div>
    ${items.slice(0, 50).map(l => {
      const time = new Date(l.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const icon = getActionIcon(l.action);
      const detailStr = formatDetail(l.detail);
      // [SECURITY] escHtml 적용 — l.action, l.target, l.user, detailStr 모두 이스케이프
      // VULN-002 / ATTACK-003 대응 패치 (2026-05-03)
      return `
        <div style="display:flex; gap:10px; padding:8px 16px; border-bottom:1px solid var(--border-light); align-items:flex-start;">
          <span style="font-size:16px; flex-shrink:0; margin-top:2px;">${icon}</span>
          <div style="flex:1; min-width:0;">
            <div style="font-size:13px;">
              <span class="badge badge-default" style="font-size:10px;">${escHtml(l.action)}</span>
              <strong style="margin-left:4px;">${escHtml(l.target)}</strong>
            </div>
            ${detailStr ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${escHtml(detailStr)}</div>` : ''}
          </div>
          <div style="font-size:11px; color:var(--text-muted); flex-shrink:0; text-align:right;">
            ${time}<br/>${escHtml(l.user || '')}
          </div>
        </div>
      `;
    }).join('')}
  `).join('');
}

function getActionIcon(action) {
  const map = {
    '입고': '', '출고': '', '삭제': '', '수정': '', '등록': '',
    '재고조정': '', '이동': '', '발주': '', '백업': '', '복원': '',
    '설정변경': '', '거래처등록': '', '거래처삭제': '',
  };
  return map[action] || '';
}

function formatDetail(detail) {
  if (!detail || Object.keys(detail).length === 0) return '';
  const parts = [];
  if (detail.quantity) parts.push(`수량: ${detail.quantity}`);
  if (detail.before !== undefined && detail.after !== undefined) {
    parts.push(`${detail.before} → ${detail.after}`);
  }
  if (detail.note) parts.push(detail.note);
  return parts.join(' | ');
}
