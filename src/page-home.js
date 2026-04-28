import { getState } from './store.js';
import { getNotifications, renderNotificationPanel } from './notifications.js';
import {
  renderWeeklyTrendChart,
  renderCategoryChart,
  destroyAllCharts,
} from './charts.js';

export function renderHomePage(container, navigateTo) {
  destroyAllCharts();

  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const safetyStock = state.safetyStock || {};
  const notifications = getNotifications();

  const today = new Date();
  const todayKey = toDateKey(today);
  const yesterdayKey = toDateKey(addDays(today, -1));
  const thirtyDayCutoff = toDateKey(addDays(today, -30));

  const thisMonthStart = toDateKey(new Date(today.getFullYear(), today.getMonth(), 1));
  const lastMonthStart = toDateKey(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const lastMonthEnd   = toDateKey(new Date(today.getFullYear(), today.getMonth(), 0));

  const totalItems = items.length;
  const totalSupplyValue = sumBy(items, item => getItemSupplyValue(item));

  const lowStockItems = items.filter(item => {
    const minimum = toNumber(safetyStock[item.itemName]);
    if (!minimum) return false;
    return toNumber(item.quantity) <= minimum;
  });

  const deadStockItems = items.filter(item => {
    if (toNumber(item.quantity) <= 0) return false;
    return !transactions.some(tx =>
      tx.type === 'out' &&
      tx.itemName === item.itemName &&
      String(tx.date || '') >= thirtyDayCutoff
    );
  });

  const todayTx     = transactions.filter(tx => String(tx.date || '') === todayKey);
  const yesterdayTx = transactions.filter(tx => String(tx.date || '') === yesterdayKey);
  const todayInCount  = todayTx.filter(tx => tx.type === 'in').length;
  const todayOutCount = todayTx.filter(tx => tx.type === 'out').length;
  const yestInCount   = yesterdayTx.filter(tx => tx.type === 'in').length;
  const yestOutCount  = yesterdayTx.filter(tx => tx.type === 'out').length;

  const thisMonthTx = transactions.filter(tx => String(tx.date || '') >= thisMonthStart);
  const lastMonthTx = transactions.filter(tx => {
    const d = String(tx.date || '');
    return d >= lastMonthStart && d <= lastMonthEnd;
  });
  const thisMonthInCount  = thisMonthTx.filter(tx => tx.type === 'in').length;
  const lastMonthInCount  = lastMonthTx.filter(tx => tx.type === 'in').length;
  const thisMonthOutCount = thisMonthTx.filter(tx => tx.type === 'out').length;
  const lastMonthOutCount = lastMonthTx.filter(tx => tx.type === 'out').length;

  const recentTransactions = [...transactions]
    .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
    .slice(0, 8);

  const categoryMap = new Map();
  items.forEach(item => {
    const cat = item.category || '미분류';
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + toNumber(item.quantity));
  });
  const categories = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);

  const weekData = getChartData(transactions, 7);
  const hasData  = totalItems > 0;

  // 스파크라인용 7일 데이터
  const sparkIn  = weekData.map(d => d.inQty);
  const sparkOut = weekData.map(d => d.outQty);

  const dateStr = today.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">대시보드</h1>
        <div class="page-desc">${dateStr}</div>
      </div>
      <div class="page-actions">
        ${notifications.length > 0
          ? `<button type="button" class="badge badge-danger dashboard-notif-trigger">알림 ${notifications.length}건</button>`
          : ''}
        <button class="btn btn-success" id="btn-home-quick-in">입고 등록</button>
        <button class="btn btn-danger"  id="btn-home-quick-out">출고 등록</button>
      </div>
    </div>

    ${!hasData ? `
    <div class="card" style="text-align:center; padding:48px 24px;">
      <h2 style="font-size:18px; font-weight:700; margin-bottom:8px;">아직 등록된 데이터가 없습니다</h2>
      <p style="color:var(--text-muted); margin-bottom:20px;">엑셀 파일을 업로드하거나 품목을 직접 등록하면<br/>여기에 핵심 경영 지표가 자동으로 표시됩니다.</p>
      <div class="empty-state-actions">
        <button class="btn btn-primary" data-nav="upload">엑셀 업로드</button>
        <button class="btn btn-outline" data-nav="inventory">품목 직접 등록</button>
      </div>
    </div>
    ` : `

    <!-- KPI 6개 -->
    <div class="db-kpi-grid">

      <div class="db-kpi-card" data-nav="inventory">
        <div class="db-kpi-label">총 품목</div>
        <div class="db-kpi-value text-accent">${totalItems.toLocaleString('ko-KR')}</div>
        <div class="db-kpi-footer">
          <span class="db-kpi-delta db-delta-flat">전월 집계 중</span>
          ${buildSparkline(sparkIn.map((v, i) => v + sparkOut[i]), 'var(--accent)')}
        </div>
      </div>

      <div class="db-kpi-card" data-nav="inventory">
        <div class="db-kpi-label">재고 금액</div>
        <div class="db-kpi-value text-success">${formatCurrency(totalSupplyValue)}</div>
        <div class="db-kpi-footer">
          ${buildDelta(thisMonthInCount, lastMonthInCount, '전월 입고')}
          ${buildSparkline(sparkIn, '#22c55e')}
        </div>
      </div>

      <div class="db-kpi-card ${lowStockItems.length > 0 ? 'db-kpi-danger' : ''}" data-nav="inventory">
        <div class="db-kpi-label">부족 품목</div>
        <div class="db-kpi-value ${lowStockItems.length > 0 ? 'text-danger' : ''}">${lowStockItems.length > 0 ? `${lowStockItems.length}건` : '없음'}</div>
        <div class="db-kpi-footer">
          <span class="db-kpi-delta ${lowStockItems.length > 0 ? 'db-delta-down' : 'db-delta-flat'}">${lowStockItems.length > 0 ? '주의 필요' : '정상 범위'}</span>
          ${buildSparkline([0, 0, 0, 0, 0, 0, lowStockItems.length], lowStockItems.length > 0 ? '#ef4444' : '#9ca3af')}
        </div>
      </div>

      <div class="db-kpi-card" data-nav="in">
        <div class="db-kpi-label">오늘 입고</div>
        <div class="db-kpi-value text-success">${todayInCount}건</div>
        <div class="db-kpi-footer">
          ${buildDelta(todayInCount, yestInCount, '전일비')}
          ${buildSparkline(sparkIn, '#22c55e')}
        </div>
      </div>

      <div class="db-kpi-card" data-nav="out">
        <div class="db-kpi-label">오늘 출고</div>
        <div class="db-kpi-value text-danger">${todayOutCount}건</div>
        <div class="db-kpi-footer">
          ${buildDelta(todayOutCount, yestOutCount, '전일비')}
          ${buildSparkline(sparkOut, '#ef4444')}
        </div>
      </div>

      <div class="db-kpi-card ${deadStockItems.length > 0 ? 'db-kpi-warn' : ''}" data-nav="inventory">
        <div class="db-kpi-label">정체 재고(30일)</div>
        <div class="db-kpi-value ${deadStockItems.length > 0 ? 'text-warning' : ''}">${deadStockItems.length}건</div>
        <div class="db-kpi-footer">
          <span class="db-kpi-delta ${deadStockItems.length > 0 ? 'db-delta-down' : 'db-delta-flat'}">${deadStockItems.length > 0 ? '출고 검토 필요' : '정상'}</span>
          ${buildSparkline([0, 0, 0, 0, 0, 0, deadStockItems.length], deadStockItems.length > 0 ? '#f59e0b' : '#9ca3af')}
        </div>
      </div>

    </div>

    <!-- 재고 부족 경고 바 -->
    ${lowStockItems.length > 0 ? `
    <div class="db-alert-bar">
      <span class="db-alert-title">재고 부족 ${lowStockItems.length}건</span>
      <span class="db-alert-items">
        ${lowStockItems.slice(0, 3).map(item =>
          `${escapeHtml(item.itemName)} (현재 ${toNumber(item.quantity)} / 안전 ${toNumber(safetyStock[item.itemName])})`
        ).join(' · ')}${lowStockItems.length > 3 ? ` 외 ${lowStockItems.length - 3}건` : ''}
      </span>
      <button class="db-alert-order-btn" id="btn-goto-order">발주 바로가기</button>
      <button class="db-alert-goto" data-nav="inventory">재고현황 →</button>
    </div>
    ` : ''}

    <!-- 메인 3열 그리드 -->
    <div class="db-main-grid">

      <!-- 최근 입출고 이력 -->
      <div class="card">
        <div class="card-title">최근 입출고 이력</div>
        ${recentTransactions.length > 0 ? `
        <div class="table-wrapper" style="border:none; margin:0;">
          <table class="data-table" style="font-size:12px;">
            <thead>
              <tr>
                <th>유형</th>
                <th>품목명</th>
                <th class="text-right">수량</th>
                <th>날짜</th>
                <th>거래처</th>
              </tr>
            </thead>
            <tbody>
              ${recentTransactions.map(tx => `
                <tr>
                  <td><span class="badge ${tx.type === 'in' ? 'badge-success' : 'badge-danger'}">${tx.type === 'in' ? '입고' : '출고'}</span></td>
                  <td>${escapeHtml(tx.itemName || '-')}</td>
                  <td class="text-right">${toNumber(tx.quantity).toLocaleString('ko-KR')}</td>
                  <td style="color:var(--text-muted);">${escapeHtml(tx.date || '-')}</td>
                  <td style="color:var(--text-muted);">${escapeHtml(tx.vendor || '-')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : `<div class="empty-state"><div class="msg">아직 기록된 거래가 없습니다</div></div>`}
      </div>

      <!-- 입출고 흐름 (기간 필터) -->
      <div class="card">
        <div class="db-chart-header">
          <div class="card-title">입출고 흐름</div>
          <div class="db-period-btns">
            <button class="db-period-btn active" data-days="7">7일</button>
            <button class="db-period-btn" data-days="30">1달</button>
            <button class="db-period-btn" data-days="90">3달</button>
            <button class="db-period-btn" data-days="0">전체</button>
          </div>
        </div>
        <div style="height:200px; position:relative;">
          <canvas id="chart-weekly"></canvas>
        </div>
        <div class="db-chart-hint">차트 클릭 시 해당 날짜 입출고 상세로 이동</div>
      </div>

      <!-- 분류별 비중 -->
      ${categories.length > 0 ? `
      <div class="card">
        <div class="card-title">분류별 재고 비중</div>
        <div style="height:200px; position:relative;">
          <canvas id="chart-category"></canvas>
        </div>
      </div>
      ` : ''}

    </div>

    `}
  `;

  // ── 이벤트 ───────────────────────────────────────────────────

  container.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.nav));
  });

  container.querySelectorAll('.dashboard-notif-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      renderNotificationPanel();
    });
  });

  container.querySelector('#btn-home-quick-in')?.addEventListener('click', () => {
    sessionStorage.setItem('invex:quick-open-inbound', '1');
    navigateTo('in');
  });

  container.querySelector('#btn-home-quick-out')?.addEventListener('click', () => {
    sessionStorage.setItem('invex:quick-open-outbound', '1');
    navigateTo('out');
  });

  container.querySelector('#btn-goto-order')?.addEventListener('click', () => {
    navigateTo('auto-order');
  });

  // 기간 필터
  const onClickDate = (dateKey) => {
    sessionStorage.setItem('invex:inout-date-filter', dateKey);
    navigateTo('inout');
  };

  container.querySelectorAll('.db-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.db-period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const days = parseInt(btn.dataset.days, 10);
      const span = days === 0 ? getDaySpan(transactions) : days;
      renderWeeklyTrendChart('chart-weekly', getChartData(transactions, span), onClickDate);
    });
  });

  if (hasData) {
    setTimeout(() => {
      renderWeeklyTrendChart('chart-weekly', weekData, onClickDate);
      if (categories.length > 0) {
        renderCategoryChart('chart-category', categories);
      }
    }, 50);
  }
}

// ── 헬퍼 함수 ─────────────────────────────────────────────────

function getItemSupplyValue(item) {
  const supplyValue = toNumber(item.supplyValue);
  if (supplyValue > 0) return supplyValue;
  return toNumber(item.quantity) * toNumber(item.unitPrice || item.unitCost);
}

function getChartData(transactions, days) {
  const result = [];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const actualDays = Math.min(Math.max(days, 1), 365);
  for (let offset = actualDays - 1; offset >= 0; offset--) {
    const date = addDays(new Date(), -offset);
    const dateKey = toDateKey(date);
    const dayTx = transactions.filter(tx => String(tx.date || '') === dateKey);
    result.push({
      date: dateKey,
      label: actualDays <= 14
        ? `${date.getMonth() + 1}/${date.getDate()} (${dayNames[date.getDay()]})`
        : `${date.getMonth() + 1}/${date.getDate()}`,
      inQty:  sumBy(dayTx.filter(tx => tx.type === 'in'),  tx => toNumber(tx.quantity)),
      outQty: sumBy(dayTx.filter(tx => tx.type === 'out'), tx => toNumber(tx.quantity)),
    });
  }
  return result;
}

function getDaySpan(transactions) {
  const dates = transactions.map(tx => String(tx.date || '')).filter(Boolean).sort();
  if (dates.length === 0) return 7;
  const earliest = new Date(dates[0]);
  const diff = Math.ceil((new Date() - earliest) / 86400000) + 1;
  return Math.min(Math.max(diff, 7), 365);
}

function buildSparkline(values, color) {
  const W = 56, H = 22, pad = 2;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = pad + (n > 1 ? (i / (n - 1)) : 0.5) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="db-kpi-spark" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function buildDelta(current, prev, label) {
  if (prev === 0 && current === 0) {
    return `<span class="db-kpi-delta db-delta-flat">— ${label} 동일</span>`;
  }
  if (prev === 0) {
    return `<span class="db-kpi-delta db-delta-up">신규 ${current}건</span>`;
  }
  const pct = (current - prev) / prev * 100;
  const absPct = Math.abs(pct).toFixed(1);
  if (pct > 0) return `<span class="db-kpi-delta db-delta-up">▲ ${absPct}% ${label}</span>`;
  if (pct < 0) return `<span class="db-kpi-delta db-delta-down">▼ ${absPct}% ${label}</span>`;
  return `<span class="db-kpi-delta db-delta-flat">— ${label} 동일</span>`;
}

function addDays(baseDate, delta) {
  const copy = new Date(baseDate);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function toDateKey(value) {
  return new Date(value).toISOString().split('T')[0];
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number.parseFloat(String(value).replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

function sumBy(rows, fn) {
  return rows.reduce((sum, row) => sum + fn(row), 0);
}

function formatCurrency(value) {
  const n = toNumber(value);
  if (n <= 0) return '-';
  return `₩${Math.round(n).toLocaleString('ko-KR')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
