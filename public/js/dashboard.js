const DIMENSIONS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
const D6_PLACEHOLDER = 50;

function d5Score(analysis) {
  if (!analysis) return null;
  // D5 没有外部面数预算时使用固定 100k 面作为效率上限，避免把随机值带入评分。
  return Math.max(0, Math.round(100 - Math.min(100, (analysis.totals.faceCount / 100000) * 100)));
}

function scoresFor(analysis, d2Result) {
  if (!analysis) return null;
  return {
    D1: Math.max(0, Math.round(100 - analysis.totals.badFaceRatio)),
    D2: d2Result ? d2Result.d2_score : null,
    D3: Math.round(analysis.totals.d3_score),
    D4: Math.round(analysis.totals.d4_score),
    D5: d5Score(analysis),
    D6: D6_PLACEHOLDER,
  };
}

function tone(score) {
  if (score === null || score === undefined) return 'score-muted';
  if (score > 80) return 'score-good';
  if (score > 60) return 'score-warn';
  return 'score-bad';
}

function format(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export class Dashboard {
  constructor() {
    this.canvas = document.getElementById('radar-chart');
    this.radarMode = document.getElementById('radar-mode');
    this.cards = [...document.querySelectorAll('.detail-card')];
    this.tips = document.getElementById('tips-list');
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadingLabel = document.getElementById('loading-label');
    this.loadingFill = document.getElementById('loading-fill');
    this.toast = document.getElementById('toast');
    this.chart = null;
    this.lastState = {};
    this.initChart();
  }

  initChart() {
    if (!this.canvas || !window.Chart) return;
    this.chart = new window.Chart(this.canvas.getContext('2d'), {
      type: 'radar',
      data: { labels: DIMENSIONS, datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 260 },
        plugins: {
          legend: { display: true, labels: { color: '#aeb8be', boxWidth: 9, font: { size: 9, family: 'monospace' } } },
          tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.raw ?? '未评估'}` } },
        },
        scales: {
          r: {
            min: 0, max: 100,
            beginAtZero: true,
            angleLines: { color: 'rgba(150,165,175,.16)' },
            grid: { color: 'rgba(150,165,175,.22)' },
            pointLabels: { color: '#b9c4ca', font: { size: 9, family: 'monospace' } },
            ticks: { display: false, stepSize: 20 },
          },
        },
      },
    });
  }

  setLoading(active, label = '正在准备几何分析…', progress = 0) {
    this.loadingOverlay?.classList.toggle('visible', active);
    if (this.loadingLabel) this.loadingLabel.textContent = label;
    if (this.loadingFill) this.loadingFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }

  showToast(message, kind = 'error') {
    if (!this.toast) return;
    this.toast.textContent = message;
    this.toast.className = `toast visible ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('visible'), 3400);
  }

  update(state = {}) {
    this.lastState = state;
    const { analysisA, analysisB, d2Result, pkActive } = state;
    const scoreA = scoresFor(analysisA, d2Result);
    const scoreB = scoresFor(analysisB, d2Result);
    this.updateRadar(scoreA, scoreB, pkActive);
    this.updateCards(scoreA, scoreB, analysisA, analysisB, d2Result, pkActive);
    this.updateTips(analysisA, d2Result, scoreA);
  }

  updateRadar(scoreA, scoreB, pkActive) {
    if (!this.radarMode) return;
    this.radarMode.textContent = pkActive ? 'PK · A / B' : scoreA ? 'SLOT A' : 'WAITING';
    if (!this.chart) return;
    const datasets = [];
    if (scoreA) datasets.push({
      label: 'Slot A', data: DIMENSIONS.map((key) => scoreA[key]),
      borderColor: '#3ea6ff', backgroundColor: 'rgba(62,166,255,.18)', pointBackgroundColor: '#3ea6ff',
      borderWidth: 1.5, pointRadius: 2,
    });
    if (pkActive && scoreB) datasets.push({
      label: 'Slot B', data: DIMENSIONS.map((key) => scoreB[key]),
      borderColor: '#67dc96', backgroundColor: 'rgba(103,220,150,.16)', pointBackgroundColor: '#67dc96',
      borderWidth: 1.5, pointRadius: 2,
    });
    this.chart.data.datasets = datasets;
    this.chart.update('none');
  }

  updateCards(scoreA, scoreB, analysisA, analysisB, d2Result, pkActive) {
    const metricsA = analysisA ? {
      D1: `坏面 ${analysisA.totals.badFaceCount} · ${analysisA.totals.badFaceRatio.toFixed(1)}%`,
      D2: d2Result ? `平均 ${format(d2Result.d2_averageDeviation, 4)} · 最大 ${format(d2Result.d2_maxDeviation, 4)}` : '请上传高模参考',
      D3: `坏面 ${analysisA.totals.d3_badFaceCount} · 角度阈值 10°`,
      D4: `极点 ${analysisA.totals.d4_poleCount} · 顶点 ${analysisA.totals.d4_vertexCount}`,
      D5: `三角面 ${analysisA.totals.faceCount.toLocaleString()}`,
    } : {};
    const metricsB = analysisB ? {
      D1: `B 坏面 ${analysisB.totals.badFaceCount}`,
      D2: '共享 A → B 偏差',
      D3: `B 坏面 ${analysisB.totals.d3_badFaceCount}`,
      D4: `B 极点 ${analysisB.totals.d4_poleCount}`,
      D5: `B 三角面 ${analysisB.totals.faceCount.toLocaleString()}`,
    } : {};
    for (const card of this.cards) {
      const dimension = card.dataset.dimension;
      const scoreElement = card.querySelector('.detail-score');
      const metricElement = card.querySelector('small');
      const current = scoreA?.[dimension];
      card.classList.remove('score-good', 'score-warn', 'score-bad', 'score-muted');
      card.classList.add(tone(current));
      scoreElement.textContent = current === null || current === undefined ? '—' : (pkActive && scoreB?.[dimension] !== null ? `A ${current} / B ${scoreB[dimension]}` : current);
      metricElement.textContent = pkActive && metricsB[dimension] ? `${metricsA[dimension] || ''} · ${metricsB[dimension]}` : (metricsA[dimension] || '等待模型');
      if (dimension === 'D6') metricElement.textContent = '占位维度';
    }
  }

  updateTips(analysis, d2Result, scoreA) {
    if (!this.tips) return;
    const suggestions = [];
    if (!analysis) suggestions.push('先上传 Slot A 低模，系统会生成真实几何评分。');
    if (analysis && scoreA.D1 < 80) suggestions.push(`检测到 ${analysis.totals.badFaceCount} 个拓扑问题面，建议在 Blender 中检查三角化与重复索引。`);
    if (analysis && scoreA.D2 !== null && scoreA.D2 < 80) suggestions.push('几何偏差过大，建议检查减面算法或增加低模顶点数。');
    if (analysis && scoreA.D3 < 80) suggestions.push('细长或小角度三角面较多，建议重新布线并避免极端长宽比。');
    if (analysis && analysis.totals.d4_poleCount > 0) suggestions.push(`检测到 ${analysis.totals.d4_poleCount} 个 5/7 价极点，可能导致动画变形褶皱，请调整 Edge Flow。`);
    if (analysis && !suggestions.length) suggestions.push('当前几何质量稳定，暂未发现需要优先处理的问题。');
    this.tips.innerHTML = suggestions.map((tip) => `<p class="tip-item"><span>›</span>${tip}</p>`).join('');
  }
}

export { scoresFor, d5Score };
