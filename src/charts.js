/**
 * charts.js - 데이터 시각화 유틸리티
 * 
 * 왜 별도 파일? → 차트 로직을 한 곳에 모아서 여러 페이지에서 재사용하기 위함
 * Chart.js 사용 — 가볍고 반응형이며 다크 모드 지원이 좋음
 */

import {
  Chart,
  LineController,
  BarController,
  DoughnutController,
  LineElement,
  BarElement,
  ArcElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// 필요한 컴포넌트만 등록 (번들 크기 최적화)
Chart.register(
  LineController, BarController, DoughnutController,
  LineElement, BarElement, ArcElement, PointElement,
  LinearScale, CategoryScale,
  Tooltip, Legend, Filler
);

/**
 * 다크 모드 감지
 */
function isDark() {
  return document.documentElement.classList.contains('dark-mode');
}

/**
 * 테마에 맞는 차트 기본 색상
 */
function getThemeColors() {
  const dark = isDark();
  return {
    textColor: dark ? '#8b949e' : '#5a6474',
    gridColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    bgCard: dark ? '#161b22' : '#ffffff',
  };
}

// 차트 인스턴스 관리 (메모리 누수 방지)
const chartInstances = {};

/**
 * 기존 차트 제거 후 새로 생성
 * 왜? → 같은 canvas에 중복 생성하면 메모리 누수 + 렌더링 깨짐
 */
function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

/**
 * 주간 입출고 추이 (라인 차트)
 * @param {string} canvasId - canvas 요소 ID
 * @param {Array} weekData - [{label, inQty, outQty}]
 */
export function renderWeeklyTrendChart(canvasId, weekData) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const { textColor, gridColor } = getThemeColors();

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: weekData.map(d => d.label),
      datasets: [
        {
          label: '입고',
          data: weekData.map(d => d.inQty),
          borderColor: '#3fb950',
          backgroundColor: 'rgba(63,185,80,0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#3fb950',
        },
        {
          label: '출고',
          data: weekData.map(d => d.outQty),
          borderColor: '#f85149',
          backgroundColor: 'rgba(248,81,73,0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#f85149',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: { color: textColor, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' },
        },
        tooltip: {
          backgroundColor: isDark() ? '#21262d' : '#fff',
          titleColor: isDark() ? '#e6edf3' : '#1a1a2e',
          bodyColor: isDark() ? '#b1bac4' : '#5a6474',
          borderColor: isDark() ? '#30363d' : '#e2e6eb',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}개`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10 } },
          grid: { color: gridColor },
        },
        y: {
          beginAtZero: true,
          ticks: { color: textColor, font: { size: 10 }, stepSize: 1 },
          grid: { color: gridColor },
        },
      },
    },
  });
}

/**
 * 카테고리별 재고 비율 (도넛 차트)
 * @param {string} canvasId - canvas 요소 ID
 * @param {Array} categories - [[카테고리명, 수량], ...]
 */
export function renderCategoryChart(canvasId, categories) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const { textColor } = getThemeColors();

  // 상위 6개 + 나머지
  const top6 = categories.slice(0, 6);
  const rest = categories.slice(6);
  if (rest.length > 0) {
    const restQty = rest.reduce((s, c) => s + c[1], 0);
    top6.push(['기타', restQty]);
  }

  const colors = [
    '#58a6ff', '#3fb950', '#d29922', '#f85149',
    '#a371f7', '#79c0ff', '#8b949e',
  ];

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: top6.map(c => c[0]),
      datasets: [{
        data: top6.map(c => c[1]),
        backgroundColor: colors.slice(0, top6.length),
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            font: { size: 11 },
            padding: 12,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          backgroundColor: isDark() ? '#21262d' : '#fff',
          titleColor: isDark() ? '#e6edf3' : '#1a1a2e',
          bodyColor: isDark() ? '#b1bac4' : '#5a6474',
          borderColor: isDark() ? '#30363d' : '#e2e6eb',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toLocaleString('ko-KR')}개`,
          },
        },
      },
    },
  });
}

/**
 * 월별 입출고 추이 (바 차트)
 * @param {string} canvasId - canvas 요소 ID
 * @param {Array} monthData - [{label, inQty, outQty}]
 */
export function renderMonthlyChart(canvasId, monthData) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const { textColor, gridColor } = getThemeColors();

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: monthData.map(d => d.label),
      datasets: [
        {
          label: '입고',
          data: monthData.map(d => d.inQty),
          backgroundColor: 'rgba(63,185,80,0.7)',
          borderRadius: 4,
          barPercentage: 0.6,
        },
        {
          label: '출고',
          data: monthData.map(d => d.outQty),
          backgroundColor: 'rgba(248,81,73,0.7)',
          borderRadius: 4,
          barPercentage: 0.6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: textColor, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' },
        },
        tooltip: {
          backgroundColor: isDark() ? '#21262d' : '#fff',
          titleColor: isDark() ? '#e6edf3' : '#1a1a2e',
          bodyColor: isDark() ? '#b1bac4' : '#5a6474',
          borderColor: isDark() ? '#30363d' : '#e2e6eb',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
        },
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10 } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: textColor, font: { size: 10 } },
          grid: { color: gridColor },
        },
      },
    },
  });
}

/**
 * 모든 차트 제거 (페이지 전환 시 호출)
 */
export function renderItemTimelineChart(canvasId, timelineData) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const { textColor, gridColor } = getThemeColors();
  const labels = timelineData.map(point => point.label);
  const values = timelineData.map(point => point.value);

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '누적 재고 흐름',
          data: values,
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88,166,255,0.14)',
          fill: true,
          tension: 0.28,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#58a6ff',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: { color: textColor, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' },
        },
        tooltip: {
          backgroundColor: isDark() ? '#21262d' : '#fff',
          titleColor: isDark() ? '#e6edf3' : '#1a1a2e',
          bodyColor: isDark() ? '#b1bac4' : '#5a6474',
          borderColor: isDark() ? '#30363d' : '#e2e6eb',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => {
              const point = timelineData[ctx.dataIndex];
              const delta = Number(point?.delta || 0);
              const deltaText = `${delta >= 0 ? '+' : ''}${Math.round(delta).toLocaleString('ko-KR')}`;
              return ` 누적 ${Math.round(ctx.parsed.y).toLocaleString('ko-KR')}개 (변동 ${deltaText})`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
          grid: { color: gridColor },
        },
        y: {
          ticks: { color: textColor, font: { size: 10 } },
          grid: { color: gridColor },
        },
      },
    },
  });
}

export function destroyAllCharts() {
  Object.keys(chartInstances).forEach(destroyChart);
}
