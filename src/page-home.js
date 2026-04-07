/**
 * page-home.js - 대시보드 홈 (경영 현황판)
 * 역할: 앱 진입 시 한눈에 경영 현황을 파악할 수 있는 메인 대시보드
 * 왜 필요? → 매일 아침 열면 "오늘 뭘 해야 하는지" 바로 알 수 있어야 진짜 ERP
 */

import { getState } from './store.js';
import { getNotifications } from './notifications.js';

export function renderHomePage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const safetyStock = state.safetyStock || {};
  const notifications = getNotifications();

  // === KPI 계산 ===
  const totalItems = items.length;
  const totalQty = items.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0);
  const totalValue = items.reduce((s, r) => s + (parseFloat(r.totalPrice) || (parseFloat(r.quantity) || 0) * (parseFloat(r.unitPrice) || 0)), 0);

  // 안전재고 부족 품목
  const lowStockCount = items.filter(d => {
    const min = safetyStock[d.itemName];
    return min !== undefined && (parseFloat(d.quantity) || 0) <= min;
  }).length;

  // 오늘 거래
  const today = new Date().toISOString().split('T')[0];
  const todayTx = transactions.filter(tx => tx.date === today);
  const todayIn = todayTx.filter(tx => tx.type === 'in').reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);
  const todayOut = todayTx.filter(tx => tx.type === 'out').reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);

  // 최근 7일 추이
  const weekData = getLast7Days(transactions);

  // 카테고리별 비율
  const catMap = {};
  items.forEach(item => {
    const cat = item.category || '미분류';
    catMap[cat] = (catMap[cat] || 0) + (parseFloat(item.quantity) || 0);
  });
  const categories = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const catTotal = categories.reduce((s, c) => s + c[1], 0) || 1;

  // 최근 입출고 5건
  const recentTx = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);

  // 상위 품목 5개
  const topItems = [...items].sort((a, b) => (parseFloat(b.totalPrice) || 0) - (parseFloat(a.totalPrice) || 0)).slice(0, 5);

  // 거래처별 통계
  const vendorMap = {};
  items.forEach(item => {
    const v = item.vendor || '';
    if (!v) return;
    vendorMap[v] = (vendorMap[v] || 0) + 1;
  });
  const vendorCount = Object.keys(vendorMap).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🏠</span> 대시보드</h1>
        <div class="page-desc">${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} 현황</div>
      </div>
      <div class="page-actions">
        ${notifications.length > 0 ? `<span class="badge badge-danger" style="font-size:12px; padding:4px 10px;">🔔 알림 ${notifications.length}건</span>` : ''}
      </div>
    </div>

    <!-- 핵심 KPI -->
    <div class="stat-grid" style="grid-template-columns: repeat(5, 1fr);">
      <div class="stat-card" style="cursor:pointer;" data-nav="inventory">
        <div class="stat-label">등록 품목</div>
        <div class="stat-value text-accent">${totalItems.toLocaleString('ko-KR')}</div>
        <div class="stat-change">총 ${totalQty.toLocaleString('ko-KR')}개</div>
      </div>
      <div class="stat-card" style="cursor:pointer;" data-nav="dashboard">
        <div class="stat-label">총 재고 가치</div>
        <div class="stat-value">${totalValue > 0 ? '₩' + totalValue.toLocaleString('ko-KR') : '-'}</div>
      </div>
      <div class="stat-card" style="cursor:pointer;" data-nav="inout">
        <div class="stat-label">오늘 입고</div>
        <div class="stat-value text-success">+${todayIn.toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card" style="cursor:pointer;" data-nav="inout">
        <div class="stat-label">오늘 출고</div>
        <div class="stat-value text-danger">-${todayOut.toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card" style="cursor:pointer;" data-nav="inventory">
        <div class="stat-label">재고 부족</div>
        <div class="stat-value ${lowStockCount > 0 ? 'text-danger' : 'text-success'}">${lowStockCount > 0 ? lowStockCount + '건' : '없음'}</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:16px;">
      <!-- 좌측: 주간 추이 + 최근 거래 -->
      <div>
        <!-- 주간 입출고 추이 -->
        <div class="card">
          <div class="card-title">📊 최근 7일 입출고 추이</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${weekData.map(d => {
              const maxVal = Math.max(...weekData.map(w => Math.max(w.inQty, w.outQty))) || 1;
              return `
                <div style="display:flex; align-items:center; gap:12px;">
                  <span style="width:60px; font-size:12px; color:var(--text-muted); flex-shrink:0;">${d.label}</span>
                  <div style="flex:1; display:flex; gap:4px;">
                    <div style="height:16px; flex:1; background:var(--border-light); border-radius:3px; overflow:hidden;">
                      <div style="height:100%; width:${(d.inQty/maxVal)*100}%; background:var(--success); border-radius:3px; transition:width 0.5s;"></div>
                    </div>
                    <div style="height:16px; flex:1; background:var(--border-light); border-radius:3px; overflow:hidden;">
                      <div style="height:100%; width:${(d.outQty/maxVal)*100}%; background:var(--danger); border-radius:3px; transition:width 0.5s;"></div>
                    </div>
                  </div>
                  <span style="width:80px; font-size:11px; color:var(--text-muted); text-align:right; flex-shrink:0;">
                    <span class="type-in">+${d.inQty}</span> / <span class="type-out">-${d.outQty}</span>
                  </span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 최근 거래 -->
        <div class="card">
          <div class="card-title">🕐 최근 거래 <span class="card-subtitle">최근 5건</span></div>
          ${recentTx.length > 0 ? `
            <div style="display:flex; flex-direction:column; gap:2px;">
              ${recentTx.map(tx => `
                <div style="display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px solid var(--border-light);">
                  <span style="font-size:18px;">${tx.type === 'in' ? '📥' : '📤'}</span>
                  <div style="flex:1;">
                    <div style="font-weight:500; font-size:13px;">${tx.itemName}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${tx.date} | ${tx.itemCode || '-'}</div>
                  </div>
                  <span class="${tx.type === 'in' ? 'type-in' : 'type-out'}" style="font-size:14px; font-weight:600;">
                    ${tx.type === 'in' ? '+' : '-'}${tx.quantity}
                  </span>
                </div>
              `).join('')}
            </div>
          ` : '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">아직 거래 기록이 없습니다</div>'}
        </div>
      </div>

      <!-- 우측: 카테고리 + 빠른 동선 + 상위 품목 -->
      <div>
        <!-- 빠른 동선 -->
        <div class="card">
          <div class="card-title">⚡ 빠른 실행</div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <button class="btn btn-primary btn-lg" style="width:100%;" data-nav="inout">🔄 입출고 등록</button>
            <button class="btn btn-outline" style="width:100%;" data-nav="documents">📄 문서 생성</button>
            <button class="btn btn-outline" style="width:100%;" data-nav="ledger">📒 수불부</button>
            <button class="btn btn-outline" style="width:100%;" data-nav="vendors">🤝 거래처 관리</button>
          </div>
        </div>

        <!-- 분류별 비율 -->
        <div class="card">
          <div class="card-title">📦 분류별 재고 비율</div>
          ${categories.slice(0, 6).map(([cat, qty]) => {
            const pct = Math.round((qty / catTotal) * 100);
            return `
              <div style="margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
                  <span style="font-weight:500;">${cat}</span>
                  <span style="color:var(--text-muted);">${qty.toLocaleString('ko-KR')}개 (${pct}%)</span>
                </div>
                <div style="height:8px; background:var(--border-light); border-radius:4px; overflow:hidden;">
                  <div style="height:100%; width:${pct}%; background:var(--accent); border-radius:4px; transition:width 0.5s;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- 거래처 요약 -->
        <div class="card">
          <div class="card-title">🤝 거래처 현황</div>
          <div style="text-align:center; padding:8px;">
            <div style="font-size:28px; font-weight:700; color:var(--accent);">${vendorCount}</div>
            <div style="font-size:12px; color:var(--text-muted);">등록 거래처</div>
          </div>
        </div>

        <!-- TOP 5 품목 -->
        ${topItems.length > 0 ? `
        <div class="card">
          <div class="card-title">💎 금액 상위 품목</div>
          ${topItems.map((item, i) => {
            const val = parseFloat(item.totalPrice) || (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
            return `
              <div style="display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid var(--border-light); font-size:13px;">
                <span style="color:var(--text-muted); font-weight:600; width:18px;">${i + 1}</span>
                <span style="flex:1; font-weight:500;">${item.itemName}</span>
                <span style="color:var(--accent); font-weight:600;">${val > 0 ? '₩' + val.toLocaleString('ko-KR') : '-'}</span>
              </div>
            `;
          }).join('')}
        </div>
        ` : ''}
      </div>
    </div>
  `;

  // KPI 카드 & 버튼 클릭 → 페이지 이동
  container.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.nav));
  });
}

/**
 * 최근 7일 입출고 데이터 계산
 */
function getLast7Days(transactions) {
  const result = [];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const label = `${d.getMonth() + 1}/${d.getDate()} (${dayNames[d.getDay()]})`;
    const dayTx = transactions.filter(tx => tx.date === dateStr);
    result.push({
      date: dateStr,
      label,
      inQty: dayTx.filter(tx => tx.type === 'in').reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0),
      outQty: dayTx.filter(tx => tx.type === 'out').reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0),
    });
  }
  return result;
}
