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

Chart.register(
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
);

const chartInstances = {};

function isDark() {
  return document.documentElement.classList.contains('dark-mode');
}

function getThemeColors() {
  const dark = isDark();
  return {
    textColor: dark ? '#8b949e' : '#5a6474',
    gridColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
  };
}

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

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
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('ko-KR')}개`,
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

export function renderCategoryChart(canvasId, categories) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const { textColor } = getThemeColors();

  const top6 = categories.slice(0, 6);
  const rest = categories.slice(6);
  if (rest.length > 0) {
    const restQty = rest.reduce((s, c) => s + c[1], 0);
    top6.push(['기타', restQty]);
  }

  const colors = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#a371f7', '#79c0ff', '#8b949e'];

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: top6.map(c => c[0]),
      datasets: [
        {
          data: top6.map(c => c[1]),
          backgroundColor: colors.slice(0, top6.length),
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
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

export function renderProfitTrendChart(canvasId, series) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const { textColor, gridColor } = getThemeColors();

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: series.map(s => s.label),
      datasets: [
        {
          type: 'bar',
          label: '매입',
          data: series.map(s => s.totalIn),
          backgroundColor: 'rgba(59,130,246,0.55)',
          borderRadius: 4,
          barPercentage: 0.7,
        },
        {
          type: 'bar',
          label: '매출',
          data: series.map(s => s.totalOut),
          backgroundColor: 'rgba(34,197,94,0.65)',
          borderRadius: 4,
          barPercentage: 0.7,
        },
        {
          type: 'line',
          label: '손익',
          data: series.map(s => s.profit),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.15)',
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#f59e0b',
          fill: true,
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
              const value = ctx.parsed.y ?? 0;
              return ` ${ctx.dataset.label}: ${Math.round(value).toLocaleString('ko-KR')}원`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10 } },
          grid: { display: false },
        },
        y: {
          ticks: { color: textColor, font: { size: 10 } },
          grid: { color: gridColor },
        },
      },
    },
  });
}

export function renderVendorProfitChart(canvasId, rows) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const { textColor, gridColor } = getThemeColors();
  const labels = rows.map(r => r.name);
  const data = rows.map(r => r.profit);
  const colors = data.map(v => (v >= 0 ? 'rgba(34,197,94,0.65)' : 'rgba(239,68,68,0.65)'));

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '손익',
          data,
          backgroundColor: colors,
          borderRadius: 4,
          barPercentage: 0.7,
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
          callbacks: {
            label: (ctx) => {
              const value = ctx.parsed.y ?? 0;
              return ` 손익: ${Math.round(value).toLocaleString('ko-KR')}원`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10 } },
          grid: { display: false },
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
