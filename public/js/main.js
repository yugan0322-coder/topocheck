import { Viewer } from './viewer.js';
import { alignMesh, applyReferenceMaterial, loadModelFile, restoreReferenceMaterial } from './loader.js';
import { analyzeObject, computeGeometricDeviation } from './analyzer.js';
import { DiagnosticVisualizer } from './visualizer.js';
import { Dashboard } from './dashboard.js';
import { PKManager } from './pkManager.js';

const ASPECT_THRESHOLD = 10;
const ANGLE_THRESHOLD = 10;
const $ = (id) => document.getElementById(id);
const elements = {
  viewport: $('viewport'), input: $('file-input'), upload: $('upload-button'), empty: $('empty-state'),
  overlay: $('drop-overlay'), fileName: $('file-name'), faceCount: $('face-count'), vertexCount: $('vertex-count'),
  badRatio: $('bad-ratio'), ratioFill: $('ratio-fill'), toggle: $('diagnostic-toggle'), toggleLabel: $('toggle-label'),
  d2Toggle: $('d2-toggle'), d2ToggleLabel: $('d2-toggle-label'), viewMode: $('view-mode'), log: $('log-output'),
  statusText: $('status-text'), statusDot: $('status-dot'), d3Score: $('d3-score'), d3Detail: $('d3-detail'),
  d4Score: $('d4-score'), d4Detail: $('d4-detail'), d2Score: $('d2-score'), d2Detail: $('d2-detail'),
  d2Average: $('d2-average'), d2Max: $('d2-max'), highInput: $('high-file-input'), highUpload: $('high-upload-button'),
  highFileName: $('high-file-name'), divider: $('split-divider'), splitLabelHigh: $('split-label-high'),
  pkIndicator: $('pk-indicator'), swapButton: $('swap-button'), clearA: $('clear-a'), clearB: $('clear-b'),
};

const viewer = new Viewer(elements.viewport);
const dashboard = new Dashboard();
let lowModel = null;
let highModel = null;
let analysisA = null;
let analysisB = null;
let d2Result = null;
let visualizer = null;
let d2RunId = 0;

const pkManager = new PKManager({
  onStateChange: ({ active }) => {
    elements.pkIndicator.textContent = active ? '⚔ PK MODE ACTIVE' : '⚔ PK MODE INACTIVE';
    elements.pkIndicator.classList.toggle('active', active);
    elements.swapButton.disabled = !active;
  },
  onSwap: (slotA, slotB) => handleSwap(slotA, slotB),
});

function writeLog(message, type = '') {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const row = document.createElement('div');
  row.innerHTML = `<span class="timestamp">[${time}]</span> <span class="${type}"></span>`;
  row.lastElementChild.textContent = message;
  elements.log.append(row);
  elements.log.scrollTop = elements.log.scrollHeight;
}

function setStatus(text, color = '#67dc96') {
  elements.statusText.textContent = text;
  elements.statusDot.style.background = color;
  elements.statusDot.style.boxShadow = `0 0 8px ${color}`;
}

function formatDeviation(value) {
  return Number.isFinite(value) ? value.toFixed(4) : '—';
}

function updateQuickScore() {
  if (!analysisA) {
    elements.faceCount.textContent = '—';
    elements.vertexCount.textContent = '—';
    elements.badRatio.textContent = '—';
    elements.ratioFill.style.width = '0%';
    elements.d3Score.textContent = '—';
    elements.d4Score.textContent = '—';
  } else {
    elements.faceCount.textContent = analysisA.totals.faceCount.toLocaleString();
    elements.vertexCount.textContent = analysisA.totals.vertexCount.toLocaleString();
    elements.badRatio.textContent = `${analysisA.totals.badFaceRatio.toFixed(2)}%`;
    elements.ratioFill.style.width = `${Math.min(analysisA.totals.badFaceRatio, 100)}%`;
    elements.d3Score.textContent = Math.round(analysisA.totals.d3_score);
    elements.d4Score.textContent = Math.round(analysisA.totals.d4_score);
  }
  elements.d2Score.textContent = d2Result ? d2Result.d2_score : '—';
  elements.d2Detail.textContent = d2Result ? `未映射 ${d2Result.d2_unmappedCount}/${d2Result.d2_sampledCount}` : '请上传高模参考';
  elements.d2Average.textContent = d2Result ? formatDeviation(d2Result.d2_averageDeviation) : '—';
  elements.d2Max.textContent = d2Result ? formatDeviation(d2Result.d2_maxDeviation) : '—';
}

function syncDashboard() {
  updateQuickScore();
  dashboard.update({ analysisA, analysisB, d2Result, pkActive: pkManager.pkActive });
}

function setSplitActive(active) {
  elements.viewport.classList.toggle('split-active', active);
  elements.splitLabelHigh.textContent = highModel ? `HIGH / SLOT B · ${elements.highFileName.textContent}` : 'HIGH / SLOT B';
  if (active) elements.divider.style.left = `${viewer.splitRatio * 100}%`;
}

function setMode(mode) {
  if (!visualizer) return;
  visualizer.setMode(mode);
  elements.toggle.classList.toggle('active', mode === 'diagnostic');
  elements.d2Toggle.classList.toggle('active', mode === 'd2');
  elements.viewMode.textContent = mode === 'd2' ? 'D2 偏差热力图' : mode === 'diagnostic' ? 'D1/D3/D4 诊断' : '原色模式';
  elements.toggleLabel.textContent = mode === 'diagnostic' ? '红色 D1 / 黄色 D3 / 红点 D4' : '显示拓扑问题高亮';
}

function resetD2() {
  d2RunId += 1;
  d2Result = null;
  visualizer?.setD2Result(null);
  elements.d2Toggle.disabled = true;
  elements.d2ToggleLabel.textContent = '需要 Slot B 高模';
  syncDashboard();
}

async function runD2() {
  if (!lowModel || !highModel || !visualizer) return;
  const currentRun = ++d2RunId;
  elements.d2Toggle.disabled = true;
  elements.d2ToggleLabel.textContent = 'D2 计算中…';
  elements.d2Detail.textContent = '计算中…';
  dashboard.setLoading(true, 'D2：双向法线射线检测…', 14);
  setStatus('D2 射线计算中', '#f5b94c');
  writeLog('D2：按低模顶点法线双向发射射线…');
  try {
    const result = await computeGeometricDeviation(lowModel, highModel, {
      maxSamples: 5000,
      batchSize: 100,
      onProgress: ({ processed, total }) => {
        const progress = total ? 14 + (processed / total) * 78 : 14;
        dashboard.setLoading(true, `D2：正在处理 ${processed}/${total} 顶点`, progress);
        elements.d2ToggleLabel.textContent = `D2 计算中 ${processed}/${total}`;
      },
    });
    if (currentRun !== d2RunId) return;
    d2Result = result;
    visualizer.setD2Result(result);
    updateQuickScore();
    dashboard.update({ analysisA, analysisB, d2Result, pkActive: pkManager.pkActive });
    elements.d2Toggle.disabled = false;
    elements.d2ToggleLabel.textContent = '蓝→绿→红：偏差热力图';
    writeLog(`D2 完成：平均 ${formatDeviation(result.d2_averageDeviation)}，最大 ${formatDeviation(result.d2_maxDeviation)}，得分 ${result.d2_score}`, 'log-success');
    dashboard.setLoading(false);
    setStatus('PK 分析完成');
  } catch (error) {
    if (currentRun !== d2RunId) return;
    console.error(error);
    dashboard.setLoading(false);
    dashboard.showToast('高模参考无法完成 D2 评估，已降级为未评估。');
    writeLog(error.message || 'D2 计算失败', 'log-error');
    elements.d2ToggleLabel.textContent = 'D2 未评估';
    setStatus('D2 未评估', '#f5b94c');
  }
}

async function processLowFile(file) {
  if (!file) return;
  elements.fileName.textContent = file.name;
  dashboard.setLoading(true, '正在加载 Slot A 低模…', 4);
  setStatus('解析低模', '#f5b94c');
  writeLog(`正在读取低模 ${file.name}…`);
  try {
    const model = await loadModelFile(file);
    dashboard.setLoading(true, '正在分析 D1 / D3 / D4 / D5…', 18);
    await new Promise(requestAnimationFrame);
    const nextAnalysis = analyzeObject(model, ASPECT_THRESHOLD, ANGLE_THRESHOLD);
    if (!nextAnalysis.meshes.length) throw new Error('文件中没有可分析的 Mesh 几何体');

    visualizer?.dispose();
    lowModel = model;
    analysisA = nextAnalysis;
    viewer.setModel(lowModel);
    visualizer = new DiagnosticVisualizer(analysisA);
    pkManager.setSlot('A', { model: lowModel, analysis: analysisA, fileName: file.name });
    elements.toggle.disabled = false;
    elements.empty.classList.add('hidden');
    setMode('off');
    syncDashboard();
    writeLog(`低模分析完成：${analysisA.totals.faceCount.toLocaleString()} 面，D4 极点 ${analysisA.totals.d4_poleCount}`, 'log-success');

    if (highModel) {
      alignMesh(highModel, lowModel);
      viewer.setReferenceModel(highModel);
      setSplitActive(true);
      await runD2();
    } else {
      viewer.clearReferenceModel();
      setSplitActive(false);
      dashboard.setLoading(false);
      setStatus('等待高模参考');
    }
  } catch (error) {
    dashboard.setLoading(false);
    dashboard.showToast('无法加载该文件，请选择有效的 OBJ 或 GLB 模型。');
    writeLog(error.message || '低模处理失败', 'log-error');
    setStatus('低模失败', '#ff3c32');
  }
}

async function processHighFile(file) {
  if (!file) return;
  elements.highFileName.textContent = file.name;
  dashboard.setLoading(true, '正在加载 Slot B 高模参考…', 6);
  setStatus('解析高模参考', '#f5b94c');
  writeLog(`正在读取高模参考 ${file.name}…`);
  try {
    const model = applyReferenceMaterial(await loadModelFile(file));
    const nextAnalysis = analyzeObject(model, ASPECT_THRESHOLD, ANGLE_THRESHOLD);
    highModel = model;
    analysisB = nextAnalysis;
    pkManager.setSlot('B', { model: highModel, analysis: analysisB, fileName: file.name });
    syncDashboard();
    if (!lowModel) {
      dashboard.setLoading(false);
      writeLog('高模已就绪，请先上传 Slot A 低模');
      setStatus('等待低模');
      return;
    }
    alignMesh(highModel, lowModel);
    viewer.setReferenceModel(highModel);
    setSplitActive(true);
    writeLog('高模已对齐：居中并按最大包围盒轴等比缩放', 'log-success');
    await runD2();
  } catch (error) {
    highModel = null;
    analysisB = null;
    elements.highFileName.textContent = '尚未载入高模参考';
    pkManager.clearSlot('B');
    viewer.clearReferenceModel();
    setSplitActive(false);
    resetD2();
    dashboard.setLoading(false);
    dashboard.showToast('高模加载失败，D2 已降级为未评估。');
    writeLog(error.message || '高模处理失败', 'log-error');
    setStatus('D2 未评估', '#f5b94c');
  }
}

async function handleSwap(slotA, slotB) {
  if (!slotA?.model || !slotB?.model) return;
  d2RunId += 1;
  dashboard.setLoading(true, '正在交换并重新分析 A / B…', 8);
  writeLog('PK：交换 Slot A 与 Slot B…');
  // 交换后，新的 A 必须恢复原材质，新的 B 必须重新套用参考材质。
  restoreReferenceMaterial(slotA.model);
  applyReferenceMaterial(slotB.model);
  lowModel = slotA.model;
  highModel = slotB.model;
  analysisA = analyzeObject(lowModel, ASPECT_THRESHOLD, ANGLE_THRESHOLD);
  analysisB = analyzeObject(highModel, ASPECT_THRESHOLD, ANGLE_THRESHOLD);
  slotA.analysis = analysisA;
  slotB.analysis = analysisB;
  visualizer?.dispose();
  viewer.setModel(lowModel);
  visualizer = new DiagnosticVisualizer(analysisA);
  alignMesh(highModel, lowModel);
  viewer.setReferenceModel(highModel);
  elements.fileName.textContent = slotA.fileName;
  elements.highFileName.textContent = slotB.fileName;
  resetD2();
  elements.toggle.disabled = false;
  setMode('off');
  setSplitActive(true);
  syncDashboard();
  await runD2();
  writeLog('PK：模型交换完成', 'log-success');
}

function clearSlot(slot) {
  dashboard.setLoading(false);
  if (slot === 'A') {
    d2RunId += 1;
    visualizer?.dispose();
    visualizer = null;
    lowModel = null;
    analysisA = null;
    viewer.clearModel();
    viewer.clearReferenceModel();
    elements.fileName.textContent = '尚未载入低模';
    elements.toggle.disabled = true;
    elements.empty.classList.remove('hidden');
  } else {
    highModel = null;
    analysisB = null;
    viewer.clearReferenceModel();
    elements.highFileName.textContent = '尚未载入高模参考';
  }
  pkManager.clearSlot(slot);
  setSplitActive(false);
  resetD2();
  syncDashboard();
  setStatus(lowModel ? '单模型评测' : '系统就绪');
  writeLog(`已清空 Slot ${slot}，退出 PK 模式`);
}

elements.upload.addEventListener('click', () => elements.input.click());
elements.input.addEventListener('change', (event) => processLowFile(event.target.files[0]));
elements.highUpload.addEventListener('click', () => elements.highInput.click());
elements.highInput.addEventListener('change', (event) => processHighFile(event.target.files[0]));
elements.clearA.addEventListener('click', () => clearSlot('A'));
elements.clearB.addEventListener('click', () => clearSlot('B'));
elements.swapButton.addEventListener('click', () => pkManager.swapSlots());

elements.toggle.addEventListener('click', () => {
  setMode(visualizer?.mode === 'diagnostic' ? 'off' : 'diagnostic');
  writeLog(visualizer?.mode === 'diagnostic' ? '已启用 D1 / D3 / D4 诊断高亮' : '已恢复模型原始材质');
});
elements.d2Toggle.addEventListener('click', () => {
  if (!d2Result) return;
  setMode(visualizer?.mode === 'd2' ? 'off' : 'd2');
  writeLog(visualizer?.mode === 'd2' ? '已启用 D2 几何偏差热力图' : '已恢复模型原始材质');
});

let draggingDivider = false;
elements.divider.addEventListener('pointerdown', (event) => {
  draggingDivider = true;
  elements.divider.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
elements.divider.addEventListener('pointermove', (event) => {
  if (!draggingDivider) return;
  const rect = elements.viewport.getBoundingClientRect();
  viewer.setSplitRatio((event.clientX - rect.left) / rect.width);
  elements.divider.style.left = `${viewer.splitRatio * 100}%`;
});
elements.divider.addEventListener('pointerup', () => { draggingDivider = false; });
elements.divider.addEventListener('pointercancel', () => { draggingDivider = false; });

for (const target of [document.body, elements.viewport]) {
  target.addEventListener('dragover', (event) => { event.preventDefault(); elements.overlay.classList.add('visible'); });
  target.addEventListener('dragleave', (event) => { if (!event.relatedTarget || !elements.viewport.contains(event.relatedTarget)) elements.overlay.classList.remove('visible'); });
  target.addEventListener('drop', (event) => { event.preventDefault(); elements.overlay.classList.remove('visible'); processLowFile(event.dataTransfer.files[0]); });
}
