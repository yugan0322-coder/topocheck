export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">TC</div>
          <div><h1>TopoCheck</h1><p>Geometry inspection / ROUND 03</p></div>
        </div>

        <section className="upload-section" aria-label="模型上传">
          <input id="file-input" type="file" accept=".obj,.glb" hidden />
          <button id="upload-button" className="upload-button" type="button">
            <span className="upload-icon">＋</span>
            <span><strong>低模 / Slot A</strong><small>点击选择或拖放 .OBJ / .GLB</small></span>
          </button>
          <div className="file-row"><p id="file-name" className="file-name">尚未载入低模</p><button id="clear-a" className="clear-slot" type="button" aria-label="清空 Slot A">×</button></div>

          <input id="high-file-input" type="file" accept=".obj,.glb" hidden />
          <button id="high-upload-button" className="upload-button reference-upload" type="button">
            <span className="upload-icon reference-icon">◇</span>
            <span><strong>高模参考 / Slot B</strong><small>用于 D2 精度与 PK 对比</small></span>
          </button>
          <div className="file-row"><p id="high-file-name" className="file-name">尚未载入高模参考</p><button id="clear-b" className="clear-slot" type="button" aria-label="清空 Slot B">×</button></div>
        </section>

        <section className="metrics" aria-label="模型统计">
          <div className="section-heading"><span>几何统计</span><span className="live-dot">LIVE</span></div>
          <div className="metric"><span>总面数</span><strong id="face-count">—</strong></div>
          <div className="metric"><span>顶点数</span><strong id="vertex-count">—</strong></div>
          <div className="metric metric-accent"><span>D1 坏面占比</span><strong id="bad-ratio">—</strong></div>
          <div className="ratio-track"><span id="ratio-fill" /></div>
          <p className="threshold">D3 长宽比 &gt; <b id="threshold-label">10</b> / 最小角 &lt; 10°</p>
        </section>

        <section className="score-panel quick-score" aria-label="核心评分">
          <div className="section-heading"><span>核心评分</span><span className="score-caption">/ 100</span></div>
          <div className="score-grid score-grid-three">
            <div className="score-card score-d2"><span className="score-code">D2</span><strong id="d2-score">—</strong><small id="d2-detail">请上传高模参考</small></div>
            <div className="score-card"><span className="score-code">D3</span><strong id="d3-score">—</strong><small id="d3-detail">面片质量</small></div>
            <div className="score-card"><span className="score-code">D4</span><strong id="d4-score">—</strong><small id="d4-detail">Edge Flow</small></div>
          </div>
          <div className="d2-values"><span>平均 <b id="d2-average">—</b></span><span>最大 <b id="d2-max">—</b></span></div>
        </section>

        <section className="radar-panel" aria-label="D1 到 D6 雷达图">
          <div className="section-heading"><span>质量雷达</span><span id="radar-mode" className="radar-mode">SLOT A</span></div>
          <div className="radar-wrap"><canvas id="radar-chart" aria-label="D1 到 D6 评分雷达图" role="img" /></div>
        </section>

        <section className="detail-panel" aria-label="详细评分卡片">
          <div className="section-heading"><span>详细评分</span><span className="score-caption">D1 — D5</span></div>
          <div id="detail-cards" className="detail-cards">
            <article className="detail-card" data-dimension="D1"><div><span className="detail-code">D1</span><strong>拓扑完整性</strong></div><b className="detail-score">—</b><small>等待低模</small></article>
            <article className="detail-card" data-dimension="D2"><div><span className="detail-code">D2</span><strong>几何精度</strong></div><b className="detail-score">—</b><small>等待高模</small></article>
            <article className="detail-card" data-dimension="D3"><div><span className="detail-code">D3</span><strong>面片质量</strong></div><b className="detail-score">—</b><small>等待低模</small></article>
            <article className="detail-card" data-dimension="D4"><div><span className="detail-code">D4</span><strong>Edge Flow</strong></div><b className="detail-score">—</b><small>等待低模</small></article>
            <article className="detail-card" data-dimension="D5"><div><span className="detail-code">D5</span><strong>面数效率</strong></div><b className="detail-score">—</b><small>等待低模</small></article>
          </div>
        </section>

        <section className="tips-panel" aria-label="优化建议">
          <div className="section-heading"><span>优化建议</span><span className="tip-spark">✦</span></div>
          <div id="tips-list" className="tips-list"><p className="tip-empty">上传模型后生成智能诊断建议。</p></div>
        </section>

        <div className="diagnostic-actions">
          <button id="diagnostic-toggle" className="diagnostic-toggle" type="button" disabled>
            <span className="toggle-indicator" />
            <span><strong>拓扑诊断</strong><small id="toggle-label">载入低模后可用</small></span>
          </button>
          <button id="d2-toggle" className="diagnostic-toggle d2-toggle" type="button" disabled>
            <span className="toggle-indicator" />
            <span><strong>几何偏差热力图</strong><small id="d2-toggle-label">需要 Slot B 高模</small></span>
          </button>
          <button id="swap-button" className="swap-button" type="button" disabled>⇄ &nbsp;Swap A &amp; B</button>
        </div>

        <div className="legend">
          <span><i className="legend-normal" />正常面</span><span><i className="legend-bad" />D1 问题面</span><span><i className="legend-d3" />D3 坏面</span><span><i className="legend-pole" />D4 极点</span><span><i className="legend-d2" />D2 偏差</span>
        </div>
      </aside>

      <section id="viewport" className="viewport" aria-label="3D 模型视口">
        <div className="viewport-topbar">
          <span className="viewport-title">3D VIEWPORT</span>
          <span id="pk-indicator" className="pk-indicator">⚔ PK MODE INACTIVE</span>
          <span id="view-mode" className="view-mode">原色模式</span>
        </div>
        <div id="split-label-low" className="split-label split-label-low">LOW / SLOT A</div>
        <div id="split-label-high" className="split-label split-label-high">HIGH / SLOT B</div>
        <div id="split-divider" className="split-divider" aria-label="拖动调整分屏比例"><span /></div>
        <div id="drop-overlay" className="drop-overlay"><strong>释放以分析低模</strong><span>.OBJ 或 .GLB</span></div>
        <div id="loading-overlay" className="loading-overlay"><div className="loading-spinner" /><strong id="loading-label">正在准备几何分析…</strong><div className="loading-track"><span id="loading-fill" /></div></div>
        <div id="empty-state" className="empty-state">
          <div className="wire-cube"><span /><span /><span /></div>
          <h2>把低模拖到这里</h2><p>上传 Slot A 开始 D1 — D5 评测</p>
        </div>
        <div className="axis-hint"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span></div>
      </section>

      <footer className="log-panel">
        <div className="log-title"><span className="terminal-icon">›_</span> ANALYSIS LOG</div>
        <div id="log-output" className="log-output" aria-live="polite"><span className="timestamp">[READY]</span> 等待模型输入…</div>
        <div className="status"><i id="status-dot" /><span id="status-text">系统就绪</span></div>
      </footer>
      <div id="toast" className="toast" role="status" aria-live="polite" />

      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js" />
      <script type="importmap" dangerouslySetInnerHTML={{__html: JSON.stringify({imports:{three:"https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/"}})}} />
      <script type="module" src="/js/main.js" />
    </main>
  );
}
