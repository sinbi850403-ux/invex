import { getState, setState } from './store.js';
import { getNotifications, renderNotificationPanel } from './notifications.js';
import {
  renderWeeklyTrendChart,
  renderCategoryChart,
  renderMonthlyChart,
  destroyAllCharts,
} from './charts.js';

const HOME_COLLAPSE_STORAGE_KEY = 'invex:home:collapsed-sections:v1';

export function renderHomePage(container, navigateTo) {
  destroyAllCharts();

  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const safetyStock = state.safetyStock || {};
  const notifications = getNotifications();
  const dashboardMode = state.dashboardMode === 'operator' ? 'operator' : 'executive';
  const beginnerMode = state.beginnerMode !== false;

  const today = new Date();
  const todayKey = toDateKey(today);
  const thirtyDayCutoff = toDateKey(addDays(today, -30));

  const totalItems = items.length;
  const totalQty = sumBy(items, item => toNumber(item.quantity));
  const totalSaleValue = sumBy(items, item => getItemSaleValue(item));
  const totalSupplyValue = sumBy(items, item => getItemSupplyValue(item));
  const totalVendors = new Set([
    ...(state.vendorMaster || []).map(vendor => vendor.name).filter(Boolean),
    ...items.map(item => item.vendor).filter(Boolean),
  ]).size;

  const lowStockItems = items.filter(item => {
    const minimum = toNumber(safetyStock[item.itemName]);
    if (!minimum) return false;
    return toNumber(item.quantity) <= minimum;
  }).map(item => ({
    ...item,
    minimum: toNumber(safetyStock[item.itemName]),
  }));

  const deadStockItems = items.filter(item => {
    if (toNumber(item.quantity) <= 0) return false;
    return !transactions.some(tx =>
      tx.type === 'out' &&
      tx.itemName === item.itemName &&
      String(tx.date || '') >= thirtyDayCutoff
    );
  });

  const expiringSoonItems = items
    .filter(item => item.expiryDate)
    .map(item => ({
      ...item,
      daysLeft: Math.ceil((new Date(item.expiryDate) - today) / (1000 * 60 * 60 * 24)),
    }))
    .filter(item => item.daysLeft >= 0 && item.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const recentTransactions = [...transactions]
    .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
    .slice(0, 6);

  const topItems = [...items]
    .sort((a, b) => getItemValue(b) - getItemValue(a))
    .slice(0, 5);

  const categoryMap = new Map();
  items.forEach(item => {
    const category = item.category || '미분류';
    categoryMap.set(category, (categoryMap.get(category) || 0) + toNumber(item.quantity));
  });
  const categories = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);
  const topCategory = categories[0] || null;

  const todayTransactions = transactions.filter(tx => String(tx.date || '') === todayKey);
  const todayInQty = sumBy(todayTransactions.filter(tx => tx.type === 'in'), tx => toNumber(tx.quantity));
  const todayOutQty = sumBy(todayTransactions.filter(tx => tx.type === 'out'), tx => toNumber(tx.quantity));
  const todayTxCount = todayTransactions.length;

  const last30Transactions = transactions.filter(tx => String(tx.date || '') >= thirtyDayCutoff);
  const last30InQty = sumBy(last30Transactions.filter(tx => tx.type === 'in'), tx => toNumber(tx.quantity));
  const last30OutQty = sumBy(last30Transactions.filter(tx => tx.type === 'out'), tx => toNumber(tx.quantity));
  const avgDailyOutQty = last30OutQty > 0 ? last30OutQty / 30 : 0;
  const coverageDays = avgDailyOutQty > 0 ? Math.floor(totalQty / avgDailyOutQty) : null;
  const turnoverRate = totalQty > 0 ? ((last30OutQty / totalQty) * 12).toFixed(1) : '0.0';
  const topValueItem = topItems[0] || null;

  const riskLevel = getRiskLevel(lowStockItems.length, expiringSoonItems.length, deadStockItems.length);
  const executiveSummary = [
    `총 재고자산은 소가 기준 ${formatCurrency(totalSaleValue)}, 공급가 기준 ${formatCurrency(totalSupplyValue)}입니다.`,
    `안전재고 부족 ${lowStockItems.length}건, 30일 이상 정체 ${deadStockItems.length}건, 유통기한 임박 ${expiringSoonItems.length}건입니다.`,
    `최근 30일 기준 입고 ${formatNumber(last30InQty)}개, 출고 ${formatNumber(last30OutQty)}개가 기록되었습니다.`,
  ].join(' ');
  const operatorSummary = [
    `오늘 처리할 이슈는 부족 품목 ${lowStockItems.length}건, 임박 품목 ${expiringSoonItems.length}건입니다.`,
    `오늘 입고 ${formatNumber(todayInQty)}개, 출고 ${formatNumber(todayOutQty)}개가 기록되었습니다.`,
    notifications.length > 0 ? `실시간 알림 ${notifications.length}건이 남아 있습니다.` : '현재 미확인 알림은 없습니다.',
  ].join(' ');

  const executiveDecisions = buildExecutiveDecisions({
    lowStockItems,
    deadStockItems,
    expiringSoonItems,
    notifications,
    topCategory,
    coverageDays,
  });

  const operatorTasks = buildOperatorTasks({
    lowStockItems,
    expiringSoonItems,
    notifications,
    todayTxCount,
    deadStockItems,
  });

  const actionCards = dashboardMode === 'executive'
    ? [
        { title: '자산 집중 점검', desc: '금액이 큰 품목과 정체 재고를 빠르게 확인합니다.', meta: '재고 현황으로 이동', nav: 'inventory' },
        { title: '손익 분석 열기', desc: '원가와 이익 가능성을 보고 의사결정을 내립니다.', meta: '손익 분석으로 이동', nav: 'profit' },
        { title: '주간 보고 확인', desc: '운영 지표와 이상 흐름을 한 페이지로 확인합니다.', meta: '주간 보고서 열기', nav: 'weekly-report' },
        { title: '거래처 점검', desc: '공급처와 고객 현황을 보고 거래 집중도를 확인합니다.', meta: '거래처 관리로 이동', nav: 'vendors' },
      ]
    : [
        { title: '입출고 등록', desc: '오늘 들어오고 나간 수량을 바로 반영합니다.', meta: '입출고 페이지 열기', nav: 'in' },
        { title: '재고 부족 확인', desc: '부족 품목부터 채워서 현장 리스크를 줄입니다.', meta: '재고 현황 열기', nav: 'inventory' },
        { title: '수불부 보기', desc: '기초재고, 입고, 출고, 기말재고를 바로 확인합니다.', meta: '수불부 열기', nav: 'ledger' },
        { title: '문서 생성', desc: '필요한 보고서나 증빙 문서를 빠르게 만듭니다.', meta: '문서 페이지 열기', nav: 'documents' },
      ];

  const weekData = getLast7Days(transactions);
  const monthData = getLast6Months(transactions);
  const chartSort = {
    weekly: 'asc',
    monthly: 'asc',
    category: 'qty-desc',
  };

  /* 데이터가 없을 때는 온보딩 중심 간소화 화면 표시 */
  const hasData = totalItems > 0;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">대시보드</h1>
        <div class="page-desc">${today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} 운영 요약</div>
      </div>
      <div class="page-actions">
        <!-- 모드 전환: 헤더 세그먼트 컨트롤로 이동 — 화면 공간 절약 -->
        <div class="segment-control">
          <button class="segment-btn ${dashboardMode === 'executive' ? 'is-active' : ''}" data-dashboard-mode="executive">경영자용</button>
          <button class="segment-btn ${dashboardMode === 'operator' ? 'is-active' : ''}" data-dashboard-mode="operator">실무자용</button>
        </div>
        ${notifications.length > 0
          ? `<button type="button" class="badge badge-danger dashboard-notif-trigger">알림 ${notifications.length}건</button>`
          : '<span class="badge badge-success">알림 안정</span>'}
      </div>
    </div>

    ${!hasData ? `
    <!-- 데이터 0건: 온보딩 전용 화면 -->
    <div class="card" style="text-align:center; padding:48px 24px;">
      <div style="font-size:48px; margin-bottom:12px;">📦</div>
      <h2 style="font-size:18px; font-weight:700; margin-bottom:8px;">아직 등록된 데이터가 없습니다</h2>
      <p style="color:var(--text-muted); margin-bottom:20px;">엑셀 파일을 업로드하거나 품목을 직접 등록하면<br/>여기에 핵심 경영 지표가 자동으로 표시됩니다.</p>
      <div class="empty-state-actions">
        <button class="btn btn-primary" data-nav="upload">📂 엑셀 업로드</button>
        <button class="btn btn-outline" data-nav="inventory">✏️ 품목 직접 등록</button>
      </div>
      <div class="empty-state-tip">💡 TIP: 기존 엑셀 파일(.xlsx)을 그대로 드래그하면 자동으로 인식합니다</div>
    </div>
    ` : ''}

    ${hasData ? `
    <div class="card dashboard-quick-card">
      <div class="dashboard-quick-head">
        <div>
          <div class="card-title">홈에서 바로 실행</div>
        </div>
        <span class="badge badge-info">빠른 액션</span>
      </div>
      <div class="dashboard-quick-grid">
        <button class="dashboard-quick-action is-inbound" id="btn-home-quick-in">
          <div class="dashboard-quick-title">📥 빠른 입고</div>
          <div class="dashboard-quick-meta">품목 선택 + 수량 입력 모달 바로 열기</div>
        </button>
        <button class="dashboard-quick-action is-outbound" id="btn-home-quick-out">
          <div class="dashboard-quick-title">📤 빠른 출고</div>
          <div class="dashboard-quick-meta">출고 모달 즉시 열고 재고 차감 등록</div>
        </button>
        <button class="dashboard-quick-action" id="btn-home-quick-item">
          <div class="dashboard-quick-title">📦 새 품목 등록</div>
          <div class="dashboard-quick-meta">현재 등록 품목 ${formatNumber(totalItems)}건</div>
        </button>
        <button class="dashboard-quick-action" id="btn-home-quick-alert">
          <div class="dashboard-quick-title">🔔 실시간 알림</div>
          <div class="dashboard-quick-meta">미확인 알림 ${formatNumber(notifications.length)}건</div>
        </button>
      </div>
    </div>
    ` : ''}

    ${hasData ? (dashboardMode === 'executive'
      ? renderExecutiveView({
          riskLevel,
          executiveSummary,
          totalSaleValue,
          totalSupplyValue,
          lowStockItems,
          deadStockItems,
          expiringSoonItems,
          topValueItem,
          topCategory,
          coverageDays,
          turnoverRate,
          actionCards,
          executiveDecisions,
          topItems,
          totalVendors,
          last30OutQty,
        })
      : renderOperatorView({
          riskLevel,
          operatorSummary,
          todayInQty,
          todayOutQty,
          lowStockItems,
          expiringSoonItems,
          notifications,
          turnoverRate,
          deadStockItems,
          actionCards,
          operatorTasks,
          topItems,
        })) : ''}

    ${hasData ? `
      <div class="card">
        <div class="chart-control-row">
          <div>
            <div class="card-title">최근 7일 입출고 흐름</div>
          </div>
          <div class="chart-control-inline">
            <span class="chart-control-label">보기 순서</span>
            <select class="filter-select chart-sort-select" id="weekly-sort">
              <option value="asc">오래된 날짜부터</option>
              <option value="desc">최신 날짜부터</option>
            </select>
          </div>
        </div>
        <div style="height:240px; position:relative;">
          <canvas id="chart-weekly"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="chart-control-row">
          <div>
            <div class="card-title">최근 6개월 입출고 비교</div>
          </div>
          <div class="chart-control-inline">
            <span class="chart-control-label">보기 순서</span>
            <select class="filter-select chart-sort-select" id="monthly-sort">
              <option value="asc">오래된 월부터</option>
              <option value="desc">최신 월부터</option>
            </select>
          </div>
        </div>
        <div style="height:240px; position:relative;">
          <canvas id="chart-monthly"></canvas>
        </div>
      </div>
    </div>

    <div class="dashboard-side-grid">
      <div class="card">
        <div class="card-title">${dashboardMode === 'executive' ? '최근 거래와 흐름' : '최근 작업 기록'}</div>
        <div class="dashboard-recent-list">
          ${recentTransactions.length > 0
            ? recentTransactions.map(tx => `
                <div class="dashboard-recent-item">
                  <span class="badge ${tx.type === 'in' ? 'badge-success' : 'badge-danger'}">${tx.type === 'in' ? '입고' : '출고'}</span>
                  <div class="dashboard-recent-main">
                    <div class="dashboard-recent-title">${escapeHtml(tx.itemName || '-')}</div>
                    <div class="dashboard-recent-meta">${escapeHtml(tx.date || '-')} · ${escapeHtml(tx.vendor || '거래처 없음')} · ${formatNumber(tx.quantity)}개</div>
                  </div>
                </div>
              `).join('')
            : '<div class="dashboard-empty-note">아직 기록된 거래가 없습니다.</div>'}
        </div>
      </div>

      <div>
        <div class="card">
          <div class="chart-control-row">
            <div>
              <div class="card-title">분류별 재고 비중</div>
            </div>
            <div class="chart-control-inline">
              <span class="chart-control-label">정렬 기준</span>
              <select class="filter-select chart-sort-select" id="category-sort">
                <option value="qty-desc">수량 많은 순</option>
                <option value="qty-asc">수량 적은 순</option>
                <option value="name-asc">이름 가나다순</option>
              </select>
            </div>
          </div>
          ${categories.length > 0
            ? `
              <div style="height:220px; position:relative;">
                <canvas id="chart-category"></canvas>
              </div>
            `
            : '<div class="dashboard-empty-note">분류 데이터가 아직 없습니다.</div>'}
        </div>
        <div class="card">
          <div class="card-title">${dashboardMode === 'executive' ? '핵심 숫자' : '현장 체크 숫자'}</div>
          <div class="dashboard-priority-list">
            <div class="dashboard-priority-item">
              <div class="dashboard-priority-rank">1</div>
              <div class="dashboard-priority-main">
                <div class="dashboard-priority-title">총 등록 품목</div>
                <div class="dashboard-priority-meta">현재 시스템에 등록된 전체 품목 수입니다.</div>
              </div>
              <strong>${formatNumber(totalItems)}건</strong>
            </div>
            <div class="dashboard-priority-item">
              <div class="dashboard-priority-rank">2</div>
              <div class="dashboard-priority-main">
                <div class="dashboard-priority-title">총 보유 수량</div>
                <div class="dashboard-priority-meta">모든 품목의 현재 수량 합계입니다.</div>
              </div>
              <strong>${formatNumber(totalQty)}개</strong>
            </div>
            <div class="dashboard-priority-item">
              <div class="dashboard-priority-rank">3</div>
              <div class="dashboard-priority-main">
                <div class="dashboard-priority-title">거래처 수</div>
                <div class="dashboard-priority-meta">등록 또는 사용 중인 공급처와 고객 수입니다.</div>
              </div>
              <strong>${formatNumber(totalVendors)}곳</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
    ` : ''}
  `;

  container.querySelectorAll('[data-nav]').forEach(element => {
    element.addEventListener('click', (event) => {
      const targetPage = element.dataset.nav;
      if (targetPage === 'notifications') {
        event.preventDefault();
        event.stopPropagation();
        renderNotificationPanel();
        return;
      }
      navigateTo(targetPage);
    });
  });

  container.querySelectorAll('.dashboard-notif-trigger').forEach(button => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      renderNotificationPanel();
    });
  });

  container.querySelectorAll('[data-dashboard-mode]').forEach(button => {
    button.addEventListener('click', () => {
      const nextMode = button.dataset.dashboardMode === 'operator' ? 'operator' : 'executive';
      if (nextMode === dashboardMode) return;
      setState({ dashboardMode: nextMode });
      renderHomePage(container, navigateTo);
    });
  });

  container.querySelector('#btn-home-quick-in')?.addEventListener('click', () => {
    sessionStorage.setItem('invex:quick-open-inbound', '1');
    navigateTo('in');
  });

  container.querySelector('#btn-home-quick-out')?.addEventListener('click', () => {
    sessionStorage.setItem('invex:quick-open-outbound', '1');
    navigateTo('in');
  });

  container.querySelector('#btn-home-quick-item')?.addEventListener('click', () => {
    sessionStorage.setItem('invex:quick-open-item', '1');
    navigateTo('inventory');
  });

  container.querySelector('#btn-home-quick-alert')?.addEventListener('click', () => {
    renderNotificationPanel();
  });

  container.querySelector('#weekly-sort')?.addEventListener('change', event => {
    chartSort.weekly = event.target.value;
    renderDashboardCharts();
  });

  container.querySelector('#monthly-sort')?.addEventListener('change', event => {
    chartSort.monthly = event.target.value;
    renderDashboardCharts();
  });

  container.querySelector('#category-sort')?.addEventListener('change', event => {
    chartSort.category = event.target.value;
    renderDashboardCharts();
  });

  setTimeout(() => {
    renderDashboardCharts();
  }, 50);

  initHomeSectionCollapse();

  function renderDashboardCharts() {
    renderWeeklyTrendChart('chart-weekly', sortTimeSeriesData(weekData, chartSort.weekly));
    renderMonthlyChart('chart-monthly', sortTimeSeriesData(monthData, chartSort.monthly));
    if (categories.length > 0) {
      renderCategoryChart('chart-category', sortCategorySeries(categories, chartSort.category));
    }
  }

  function initHomeSectionCollapse() {
    const collapsedState = loadHomeCollapsedState();
    const sectionConfigs = [
      { id: 'mode', selector: '.dashboard-mode-shell', label: '대시보드 모드' },
      { id: 'quick', selector: '.dashboard-quick-card', label: '빠른 실행' },
      { id: 'guide', selector: '.mission-panel', label: '대시보드 가이드' },
      { id: 'hero', selector: '.dashboard-hero', label: dashboardMode === 'executive' ? '핵심 요약' : '실무 요약' },
      { id: 'work', selector: '.dashboard-section-grid', label: dashboardMode === 'executive' ? '의사결정과 우선 품목' : '처리 순서와 우선 품목' },
      { id: 'chart', selector: '.dashboard-chart-grid', label: '차트 분석' },
      { id: 'side', selector: '.dashboard-side-grid', label: '거래와 분류 현황' },
    ];

    sectionConfigs.forEach(config => {
      const sectionEl = container.querySelector(config.selector);
      if (!sectionEl) return;

      const strip = document.createElement('div');
      strip.className = 'home-collapse-strip';
      strip.dataset.homeCollapseId = config.id;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-ghost btn-sm home-collapse-toggle';
      strip.appendChild(button);
      sectionEl.before(strip);

      const applyState = () => {
        const collapsed = !!collapsedState[config.id];
        sectionEl.style.display = collapsed ? 'none' : '';
        strip.classList.toggle('is-collapsed', collapsed);
        button.textContent = `${config.label} ${collapsed ? '펼치기' : '접기'}`;
        button.setAttribute('aria-expanded', String(!collapsed));
        button.setAttribute('aria-label', `${config.label} ${collapsed ? '펼치기' : '접기'}`);
      };

      button.addEventListener('click', () => {
        const isCollapsed = !!collapsedState[config.id];
        if (isCollapsed) delete collapsedState[config.id];
        else collapsedState[config.id] = true;
        saveHomeCollapsedState(collapsedState);
        applyState();

        if (isCollapsed && (config.id === 'chart' || config.id === 'side')) {
          setTimeout(() => renderDashboardCharts(), 0);
        }
      });

      applyState();
    });
  }

  function loadHomeCollapsedState() {
    try {
      const raw = localStorage.getItem(HOME_COLLAPSE_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveHomeCollapsedState(nextState) {
    try {
      localStorage.setItem(HOME_COLLAPSE_STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // Ignore storage errors to keep the dashboard functional.
    }
  }
}

function renderExecutiveView(context) {
  return `
    <div class="card dashboard-hero">
      <div class="dashboard-hero-grid">
        <div>
          <div class="dashboard-eyebrow">경영자 한눈 요약</div>
          <div class="dashboard-hero-title">현재 재고 운영 상태는 ${context.riskLevel} 단계입니다.</div>

          <div class="dashboard-highlight-grid">
            <div class="dashboard-highlight">
              <div class="dashboard-highlight-label">총 재고자산(소가)</div>
              <div class="dashboard-highlight-value">${formatCurrency(context.totalSaleValue)}</div>
            </div>
            <div class="dashboard-highlight">
              <div class="dashboard-highlight-label">총 재고자산(공급가)</div>
              <div class="dashboard-highlight-value">${formatCurrency(context.totalSupplyValue)}</div>
            </div>
            <div class="dashboard-highlight">
              <div class="dashboard-highlight-label">가장 먼저 볼 리스크</div>
              <div class="dashboard-highlight-value ${context.lowStockItems.length > 0 ? 'text-danger' : 'text-success'}">
                ${context.lowStockItems.length > 0 ? `${formatNumber(context.lowStockItems.length)}건 부족` : '부족 없음'}
              </div>
            </div>
            <div class="dashboard-highlight">
              <div class="dashboard-highlight-label">장기 정체 재고</div>
              <div class="dashboard-highlight-value">${formatNumber(context.deadStockItems.length)}건</div>
            </div>
            <div class="dashboard-highlight">
              <div class="dashboard-highlight-label">출고 기준 커버일</div>
              <div class="dashboard-highlight-value">${context.coverageDays === null ? '계산 불가' : `${formatNumber(context.coverageDays)}일`}</div>
            </div>
          </div>

          <div class="dashboard-action-grid">
            ${renderActionCards(context.actionCards)}
          </div>
        </div>

        <div class="dashboard-signal-board">
          <div class="dashboard-signal-title">지금 바로 볼 경영 신호</div>
          <div class="dashboard-signal-list">
            <div class="dashboard-signal-item">
              <div class="dashboard-signal-icon">⚠️</div>
              <div>
                <div class="dashboard-signal-head">재고 부족</div>
                <div class="dashboard-signal-desc">
                  ${context.lowStockItems.length > 0
                    ? `${formatNumber(context.lowStockItems.length)}개 품목이 안전재고 이하입니다. 발주 승인 또는 보충 일정 확인이 필요합니다.`
                    : '지금은 안전재고 이하 품목이 없습니다.'}
                </div>
              </div>
            </div>
            <div class="dashboard-signal-item">
              <div class="dashboard-signal-icon">📦</div>
              <div>
                <div class="dashboard-signal-head">자산 집중 품목</div>
                <div class="dashboard-signal-desc">
                  ${context.topValueItem
                    ? `${escapeHtml(context.topValueItem.itemName)}가 자산 비중이 가장 큰 품목이며 소가 ${formatCurrency(getItemSaleValue(context.topValueItem))}, 공급가 ${formatCurrency(getItemSupplyValue(context.topValueItem))}입니다.`
                    : '아직 금액 데이터를 계산할 품목이 없습니다.'}
                </div>
              </div>
            </div>
            <div class="dashboard-signal-item">
              <div class="dashboard-signal-icon">🏷️</div>
              <div>
                <div class="dashboard-signal-head">집중 분류</div>
                <div class="dashboard-signal-desc">
                  ${context.topCategory
                    ? `${escapeHtml(context.topCategory[0])} 분류가 ${formatNumber(context.topCategory[1])}개로 가장 큰 비중을 차지합니다.`
                    : '분류 데이터가 아직 없습니다.'}
                </div>
              </div>
            </div>
            <div class="dashboard-signal-item">
              <div class="dashboard-signal-icon">📅</div>
              <div>
                <div class="dashboard-signal-head">기한 임박</div>
                <div class="dashboard-signal-desc">
                  ${context.expiringSoonItems.length > 0
                    ? `${formatNumber(context.expiringSoonItems.length)}개 품목이 30일 이내 만료 예정입니다. 할인 판매 또는 우선 소진 여부를 검토해 보세요.`
                    : '30일 이내 만료 예정 품목은 없습니다.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="dashboard-section-grid">
      <div class="card">
        <div class="card-title">경영 의사결정 포인트</div>
        <div class="dashboard-worklist">
          ${renderWorkItems(context.executiveDecisions)}
        </div>
      </div>

      <div class="card">
        <div class="card-title">자산 집중도 상위 품목</div>
        <div class="dashboard-priority-list">
          ${context.topItems.length > 0
            ? context.topItems.map((item, index) => `
                <div class="dashboard-priority-item">
                  <div class="dashboard-priority-rank">${index + 1}</div>
                  <div class="dashboard-priority-main">
                    <div class="dashboard-priority-title">${escapeHtml(item.itemName || '-')}</div>
                    <div class="dashboard-priority-meta">${escapeHtml(item.category || '미분류')} · ${formatNumber(item.quantity)}개 보유</div>
                  </div>
                  <strong>${formatCurrency(getItemValue(item))}</strong>
                </div>
              `).join('')
            : '<div class="dashboard-empty-note">표시할 품목 데이터가 없습니다.</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderOperatorView(context) {
  return `
    <div class="card dashboard-hero">
      <div class="dashboard-hero-grid">
        <div>
          <div class="dashboard-eyebrow">실무자 바로 실행</div>
          <div class="dashboard-hero-title">오늘 바로 처리할 작업을 우선순위대로 정리했습니다.</div>

          <div class="dashboard-highlight-grid">
            <div class="dashboard-highlight">
              <div class="dashboard-highlight-label">오늘 입고</div>
              <div class="dashboard-highlight-value text-success">+${formatNumber(context.todayInQty)}</div>
            </div>
            <div class="dashboard-highlight">
              <div class="dashboard-highlight-label">오늘 출고</div>
              <div class="dashboard-highlight-value text-danger">-${formatNumber(context.todayOutQty)}</div>
            </div>
            <div class="dashboard-highlight">
              <div class="dashboard-highlight-label">부족 품목</div>
              <div class="dashboard-highlight-value ${context.lowStockItems.length > 0 ? 'text-danger' : 'text-success'}">
                ${context.lowStockItems.length > 0 ? `${formatNumber(context.lowStockItems.length)}건` : '없음'}
              </div>
            </div>
            <div class="dashboard-highlight">
              <div class="dashboard-highlight-label">임박 품목</div>
              <div class="dashboard-highlight-value">${formatNumber(context.expiringSoonItems.length)}건</div>
            </div>
          </div>

          <div class="dashboard-action-grid">
            ${renderActionCards(context.actionCards)}
          </div>
        </div>

        <div class="dashboard-signal-board">
          <div class="dashboard-signal-title">실무 체크 신호</div>
          <div class="dashboard-signal-list">
            <div class="dashboard-signal-item">
              <div class="dashboard-signal-icon">🧾</div>
              <div>
                <div class="dashboard-signal-head">기록 누락 방지</div>
                <div class="dashboard-signal-desc">
                  ${context.notifications.length > 0
                    ? `미확인 알림 ${formatNumber(context.notifications.length)}건이 있습니다. 먼저 내용을 확인해 주세요.`
                    : '현재 특별한 경보는 없습니다. 오늘 작업 기록만 놓치지 않으면 됩니다.'}
                </div>
              </div>
            </div>
            <div class="dashboard-signal-item">
              <div class="dashboard-signal-icon">📉</div>
              <div>
                <div class="dashboard-signal-head">재고 회전</div>
                <div class="dashboard-signal-desc">
                  평균 회전율은 ${context.turnoverRate}회/년입니다. ${Number.parseFloat(context.turnoverRate) < 1 ? '느린 품목을 우선 정리해 보세요.' : '현재 순환 흐름은 비교적 안정적입니다.'}
                </div>
              </div>
            </div>
            <div class="dashboard-signal-item">
              <div class="dashboard-signal-icon">🧊</div>
              <div>
                <div class="dashboard-signal-head">정체 재고</div>
                <div class="dashboard-signal-desc">
                  ${context.deadStockItems.length > 0
                    ? `${formatNumber(context.deadStockItems.length)}건이 최근 30일 동안 움직이지 않았습니다. 진열, 프로모션, 폐기 여부를 판단해 보세요.`
                    : '최근 30일 무출고 품목은 없습니다.'}
                </div>
              </div>
            </div>
            <div class="dashboard-signal-item">
              <div class="dashboard-signal-icon">🚦</div>
              <div>
                <div class="dashboard-signal-head">운영 상태</div>
                <div class="dashboard-signal-desc">
                  현재 운영 상태는 ${context.riskLevel} 단계입니다. 부족 품목과 임박 품목부터 처리하면 됩니다.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="dashboard-section-grid">
      <div class="card">
        <div class="card-title">오늘 처리 순서</div>
        <div class="dashboard-worklist">
          ${renderWorkItems(context.operatorTasks)}
        </div>
      </div>

      <div class="card">
        <div class="card-title">현장 우선 확인 품목</div>
        <div class="dashboard-priority-list">
          ${context.lowStockItems.length > 0
            ? context.lowStockItems.slice(0, 5).map((item, index) => `
                <div class="dashboard-priority-item">
                  <div class="dashboard-priority-rank">${index + 1}</div>
                  <div class="dashboard-priority-main">
                    <div class="dashboard-priority-title">${escapeHtml(item.itemName || '-')}</div>
                    <div class="dashboard-priority-meta">현재 ${formatNumber(item.quantity)}개 / 안전재고 ${formatNumber(item.minimum)}개</div>
                  </div>
                  <span class="badge badge-danger">부족</span>
                </div>
              `).join('')
            : context.topItems.length > 0
              ? context.topItems.map((item, index) => `
                  <div class="dashboard-priority-item">
                    <div class="dashboard-priority-rank">${index + 1}</div>
                    <div class="dashboard-priority-main">
                      <div class="dashboard-priority-title">${escapeHtml(item.itemName || '-')}</div>
                      <div class="dashboard-priority-meta">${escapeHtml(item.category || '미분류')} · ${formatNumber(item.quantity)}개 보유</div>
                    </div>
                    <strong>${formatCurrency(getItemValue(item))}</strong>
                  </div>
                `).join('')
              : '<div class="dashboard-empty-note">표시할 우선 품목 데이터가 없습니다.</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderActionCards(cards) {
  return cards.map(card => `
    <button class="dashboard-action-card" data-nav="${card.nav}">
      <div class="dashboard-action-title">${card.title}</div>
      <div class="dashboard-action-desc">${card.desc}</div>
      <div class="dashboard-action-meta">${card.meta}</div>
    </button>
  `).join('');
}

function renderWorkItems(items) {
  return items.map(item => `
    <div class="dashboard-work-item">
      <div class="dashboard-work-kicker">${item.kicker}</div>
      <div class="dashboard-work-main">
        <div class="dashboard-work-title">${item.title}</div>
        <div class="dashboard-work-desc">${item.desc}</div>
      </div>
      <button class="btn btn-outline btn-sm dashboard-work-cta" data-nav="${item.nav}">${item.action}</button>
    </div>
  `).join('');
}

function buildExecutiveDecisions(context) {
  const decisions = [];

  decisions.push(
    context.lowStockItems.length > 0
      ? {
          kicker: '긴급',
          title: `안전재고 이하 품목 ${formatNumber(context.lowStockItems.length)}건`,
          desc: `${escapeHtml(context.lowStockItems[0]?.itemName || '부족 품목')}부터 보충 일정과 발주량을 검토하는 것이 좋습니다.`,
          nav: 'inventory',
          action: '부족 품목 보기',
        }
      : {
          kicker: '안정',
          title: '안전재고 부족 품목 없음',
          desc: '현재 기준으로 즉시 보충이 필요한 품목은 없습니다.',
          nav: 'inventory',
          action: '재고 현황 보기',
        }
  );

  decisions.push(
    context.deadStockItems.length > 0
      ? {
          kicker: '정체',
          title: `장기 미출고 품목 ${formatNumber(context.deadStockItems.length)}건`,
          desc: `${escapeHtml(context.deadStockItems[0]?.itemName || '정체 재고')} 같은 묶인 자산은 할인, 폐기, 재배치 판단이 필요합니다.`,
          nav: 'dashboard',
          action: '고급 분석 보기',
        }
      : {
          kicker: '흐름',
          title: '장기 정체 재고가 거의 없습니다',
          desc: '최근 30일 동안 재고 흐름이 비교적 건강하게 유지되고 있습니다.',
          nav: 'summary',
          action: '요약 보고 보기',
        }
  );

  decisions.push(
    context.expiringSoonItems.length > 0
      ? {
          kicker: '기한',
          title: `유통기한 임박 품목 ${formatNumber(context.expiringSoonItems.length)}건`,
          desc: `${escapeHtml(context.expiringSoonItems[0]?.itemName || '임박 품목')}은 우선 소진이나 판매 정책 조정이 필요합니다.`,
          nav: 'inventory',
          action: '해당 품목 보기',
        }
      : {
          kicker: '안정',
          title: '기한 임박 품목 없음',
          desc: '30일 이내 만료 예정 품목이 없어 폐기 리스크가 낮습니다.',
          nav: 'inventory',
          action: '재고 현황 보기',
        }
  );

  decisions.push(
    context.notifications.length > 0
      ? {
          kicker: '알림',
          title: `실시간 알림 ${formatNumber(context.notifications.length)}건`,
          desc: '현장 이슈 또는 운영 알림이 남아 있으니 의사결정 전에 먼저 확인해 주세요.',
          nav: 'notifications',
          action: '알림 센터 열기',
        }
      : {
          kicker: '분류',
          title: context.topCategory ? `${escapeHtml(context.topCategory[0])} 분류가 가장 큽니다` : '분류 데이터 확인 필요',
          desc: context.topCategory
            ? `현재 상위 분류는 ${formatNumber(context.topCategory[1])}개를 보유하고 있습니다.`
            : '품목 분류가 비어 있으면 분석 정확도가 떨어질 수 있습니다.',
          nav: 'inventory',
          action: '재고 데이터 보기',
        }
  );

  if (context.coverageDays !== null) {
    decisions.push({
      kicker: '커버',
      title: `현 재고는 약 ${formatNumber(context.coverageDays)}일을 버팁니다`,
      desc: '최근 30일 평균 출고 속도를 기준으로 한 재고 커버일입니다.',
      nav: 'summary',
      action: '상세 수치 보기',
    });
  }

  return decisions.slice(0, 4);
}

function buildOperatorTasks(context) {
  const tasks = [];

  tasks.push(
    context.lowStockItems.length > 0
      ? {
          kicker: '1순위',
          title: `부족 품목 ${formatNumber(context.lowStockItems.length)}건 확인`,
          desc: `${escapeHtml(context.lowStockItems[0]?.itemName || '부족 품목')}부터 현재 수량과 보충 계획을 확인하세요.`,
          nav: 'inventory',
          action: '재고 보기',
        }
      : {
          kicker: '1순위',
          title: '재고 부족 품목 없음',
          desc: '오늘은 부족 재고보다 입출고 기록 누락 여부를 먼저 보면 됩니다.',
          nav: 'in',
          action: '입출고 열기',
        }
  );

  tasks.push(
    context.expiringSoonItems.length > 0
      ? {
          kicker: '2순위',
          title: `임박 품목 ${formatNumber(context.expiringSoonItems.length)}건 처리`,
          desc: `${escapeHtml(context.expiringSoonItems[0]?.itemName || '임박 품목')}의 우선 출고 또는 진열 계획을 잡아 주세요.`,
          nav: 'inventory',
          action: '품목 보기',
        }
      : {
          kicker: '2순위',
          title: '유통기한 임박 품목 없음',
          desc: '기한 이슈는 없으니 오늘 처리량과 부족 품목에 집중하면 됩니다.',
          nav: 'summary',
          action: '요약 보기',
        }
  );

  tasks.push(
    context.todayTxCount > 0
      ? {
          kicker: '3순위',
          title: `오늘 거래 ${formatNumber(context.todayTxCount)}건 점검`,
          desc: '입고/출고 수량이 실제 현장 기록과 맞는지 확인해 주세요.',
          nav: 'ledger',
          action: '수불부 보기',
        }
      : {
          kicker: '3순위',
          title: '오늘 거래 기록이 아직 없습니다',
          desc: '입고나 출고가 있었다면 지금 바로 기록해 두는 것이 좋습니다.',
          nav: 'in',
          action: '거래 등록',
        }
  );

  tasks.push(
    context.notifications.length > 0
      ? {
          kicker: '점검',
          title: `실시간 알림 ${formatNumber(context.notifications.length)}건 확인`,
          desc: '경고를 먼저 확인하면 누락되는 현장 이슈를 줄일 수 있습니다.',
          nav: 'notifications',
          action: '알림 확인',
        }
      : {
          kicker: '점검',
          title: `정체 재고 ${formatNumber(context.deadStockItems.length)}건 점검`,
          desc: context.deadStockItems.length > 0
            ? '움직이지 않는 재고가 쌓이지 않도록 진열과 프로모션을 조정해 보세요.'
            : '현재는 장기 정체 재고도 많지 않아 안정적인 편입니다.',
          nav: 'dashboard',
          action: '분석 보기',
        }
  );

  return tasks;
}

function getRiskLevel(lowStockCount, expiringCount, deadStockCount) {
  if (lowStockCount > 0 || expiringCount > 0) return '주의';
  if (deadStockCount > 0) return '점검 필요';
  return '안정';
}

function getItemValue(item) {
  const saleValue = getItemSaleValue(item);
  if (saleValue > 0) return saleValue;
  return getItemSupplyValue(item);
}

function getItemSaleValue(item) {
  const salePrice = toNumber(item.salePrice);
  if (salePrice <= 0) return 0;
  return toNumber(item.quantity) * salePrice;
}

function getItemSupplyValue(item) {
  const supplyValue = toNumber(item.supplyValue);
  if (supplyValue > 0) return supplyValue;
  return toNumber(item.quantity) * toNumber(item.unitPrice || item.unitCost);
}

function getLast7Days(transactions) {
  const result = [];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = addDays(new Date(), -offset);
    const dateKey = toDateKey(date);
    const dayTransactions = transactions.filter(tx => String(tx.date || '') === dateKey);

    result.push({
      date: dateKey,
      label: `${date.getMonth() + 1}/${date.getDate()} (${dayNames[date.getDay()]})`,
      inQty: sumBy(dayTransactions.filter(tx => tx.type === 'in'), tx => toNumber(tx.quantity)),
      outQty: sumBy(dayTransactions.filter(tx => tx.type === 'out'), tx => toNumber(tx.quantity)),
    });
  }

  return result;
}

function getLast6Months(transactions) {
  const result = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - offset);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const monthTransactions = transactions.filter(tx => String(tx.date || '').startsWith(prefix));

    result.push({
      label: `${month}월`,
      inQty: sumBy(monthTransactions.filter(tx => tx.type === 'in'), tx => toNumber(tx.quantity)),
      outQty: sumBy(monthTransactions.filter(tx => tx.type === 'out'), tx => toNumber(tx.quantity)),
    });
  }

  return result;
}

function addDays(baseDate, delta) {
  const copy = new Date(baseDate);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function toDateKey(value) {
  return new Date(value).toISOString().split('T')[0];
}

function sortTimeSeriesData(rows, direction) {
  const nextRows = [...rows];
  return direction === 'desc' ? nextRows.reverse() : nextRows;
}

function sortCategorySeries(rows, mode) {
  const nextRows = [...rows];
  if (mode === 'qty-asc') {
    return nextRows.sort((left, right) => left[1] - right[1]);
  }
  if (mode === 'name-asc') {
    return nextRows.sort((left, right) => String(left[0] || '').localeCompare(String(right[0] || ''), 'ko'));
  }
  return nextRows.sort((left, right) => right[1] - left[1]);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number.parseFloat(String(value).replace(/,/g, ''));
  return Number.isNaN(numeric) ? 0 : numeric;
}

function sumBy(rows, iteratee) {
  return rows.reduce((sum, row) => sum + iteratee(row), 0);
}

function formatNumber(value) {
  return Math.round(toNumber(value)).toLocaleString('ko-KR');
}

function formatCurrency(value) {
  const numeric = toNumber(value);
  if (numeric <= 0) return '-';
  return `₩${Math.round(numeric).toLocaleString('ko-KR')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
