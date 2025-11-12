// Automatically detect the API base URL based on environment
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:8000' 
  : 'https://trading-backend-frontend.onrender.com';  // Live backend URL

const el = (id) => document.getElementById(id);
const show = (id, v=true) => el(id).classList.toggle('hidden', !v);

// Function to fetch and display the list of uploaded files
async function refreshFileList() {
    try {
        const response = await fetch(`${API_BASE}/api/files/`);
        if (!response.ok) throw new Error('Failed to fetch files');
        const files = await response.json();
        
        const fileList = el('file-list');
        if (!fileList) return; // Exit if file list element doesn't exist
        
        if (!files || files.length === 0) {
            fileList.innerHTML = '<p>No files uploaded yet.</p>';
            return;
        }
        
        // Create a table to display the files
        let html = `
            <table class="file-table">
                <thead>
                    <tr>
                        <th>Filename</th>
                        <th>Symbol</th>
                        <th>Date Uploaded</th>
                        <th>Rows</th>
                        <th>Size</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        files.forEach(file => {
            const date = new Date(file.uploaded_at).toLocaleString();
            html += `
                <tr>
                    <td>${file.filename}</td>
                    <td>${file.symbol}</td>
                    <td>${date}</td>
                    <td>${file.row_count.toLocaleString()}</td>
                    <td>${(file.size_mb || 0).toFixed(2)} MB</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        fileList.innerHTML = html;
        
    } catch (error) {
        console.error('Error refreshing file list:', error);
        const fileList = el('file-list');
        if (fileList) {
            fileList.innerHTML = `<p>Error loading files: ${error.message}</p>`;
        }
    }
}

let lastBacktestId = null;
let tradesCsvUrl = null;
let metricsCsvUrl = null;
let tradesData = []; // parsed trades rows for table
let currentPage = 1;
const pageSize = 20;

// Charts
let equityChart = null;
let monthlyChart = null;
let drawdownChart = null;
let distributionChart = null;
let cumulativePnlChart = null;
let allTradesData = []; // Store all trades for chart calculations

function formatBytes(bytes){
  if(bytes === 0) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes)/Math.log(k));
  return (bytes/Math.pow(k,i)).toFixed(2)+' '+sizes[i];
}

function requiredColsPresent(cols){
  const lc = cols.map(c => c.trim().toLowerCase());
  const sets = [
    ['date_time','open','high','low','close'],
    ['datetime','open','high','low','close'],
    ['date time','open','high','low','close'],
  ];
  return sets.some(req => req.every(c => lc.includes(c)));
}

function renderPreviewTable(data){
  const table = el('preview-table');
  table.innerHTML = '';
  if(!data || !data.length) return;
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  data[0].forEach(h => {
    const th = document.createElement('th'); th.textContent = h; headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  const tbody = document.createElement('tbody');
  for(let i=1;i<data.length;i++){
    const tr = document.createElement('tr');
    data[i].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);});
    tbody.appendChild(tr);
  }
  table.appendChild(thead); table.appendChild(tbody);
}

el('file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const info = el('file-info');
  tradesData = []; currentPage = 1; // reset
  if(!file){ info.textContent = ''; el('run').disabled = true; show('preview',false); return; }
  info.textContent = `${file.name} • ${formatBytes(file.size)}`;
  if(file.size > 220*1024*1024){
    info.textContent += ' — Too large (limit 220MB)';
    el('run').disabled = true;
    return;
  }
  Papa.parse(file, {
    header: false,
    preview: 11,
    complete: (res) => {
      const rows = res.data.filter(r=>r.length>1);
      if(rows.length){
        const headers = rows[0];
        if(!requiredColsPresent(headers)){
          info.textContent += ' — Missing required columns (date_time|datetime|"date time", open, high, low, close)';
          el('run').disabled = true; show('preview',false);
          return;
        }
        renderPreviewTable(rows);
        show('preview', true);
        el('run').disabled = false;
      }
    }
  });
});

function collectParams(){
  const pct = parseFloat(el('risk_percentage').value)/100.0;
  return {
    starting_balance: parseFloat(el('starting_balance').value),
    tp_ticks: parseInt(el('tp_ticks').value),
    sl_ticks: parseInt(el('sl_ticks').value),
    risk_percentage: pct,
    trailing_stop: el('trailing_stop').checked,
    trailing_stop_ticks: parseInt(el('trailing_stop_ticks').value),
    tick_size: parseFloat(el('tick_size').value),
    tick_value: parseFloat(el('tick_value').value),
    commission_per_trade: parseFloat(el('commission_per_trade').value),
    slippage_ticks: parseInt(el('slippage_ticks').value),
    contract_margin: parseFloat(el('contract_margin').value)
  };
}

function renderMetrics(m){
  const container = el('metrics');
  container.innerHTML = '';
  const asTiles = [
    ['Total Trades', m.total_trades],
    ['Win Rate', (m.win_rate*100).toFixed(2)+'%'],
    ['Total P&L', m.total_pnl.toFixed(2)],
    ['Average P&L', m.avg_pnl.toFixed(2)],
    ['Sharpe Ratio', m.sharpe_ratio.toFixed(2)],
    ['Max Drawdown', m.max_drawdown.toFixed(2)],
    ['Best Trade', m.best_trade.toFixed(2)],
    ['Worst Trade', m.worst_trade.toFixed(2)],
  ];
  asTiles.forEach(([k,v]) => {
    const div = document.createElement('div'); div.className='tile';
    div.innerHTML = `<div class="muted">${k}</div><div style="font-size:1.2em;">${v}</div>`;
    container.appendChild(div);
  });
}

// Common chart options with zoom, pan, tooltip, and crosshair
function getChartOptions(title, yAxisLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(10, 19, 38, 0.95)',
        titleColor: '#e2e8f0',
        bodyColor: '#e2e8f0',
        borderColor: '#4f9cff',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) label += ': ';
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat('en-US', { 
                style: 'decimal', 
                minimumFractionDigits: 2,
                maximumFractionDigits: 2 
              }).format(context.parsed.y);
            }
            return label;
          }
        }
      },
      zoom: {
        zoom: {
          wheel: { enabled: true, speed: 0.1 },
          pinch: { enabled: true },
          mode: 'xy',
        },
        pan: {
          enabled: true,
          mode: 'xy',
        },
        limits: {
          x: { min: 'original', max: 'original' },
          y: { min: 'original', max: 'original' }
        }
      },
      crosshair: {
        line: {
          color: '#4f9cff',
          width: 1,
          dashPattern: [5, 5]
        },
        sync: {
          enabled: false
        },
        zoom: {
          enabled: false
        }
      }
    },
    scales: {
      x: {
        display: true,
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
          drawBorder: false
        },
        ticks: {
          color: '#8ea1b5',
          maxRotation: 45,
          minRotation: 0
        }
      },
      y: {
        display: true,
        title: {
          display: !!yAxisLabel,
          text: yAxisLabel,
          color: '#8ea1b5'
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
          drawBorder: false
        },
        ticks: {
          color: '#8ea1b5'
        }
      }
    }
  };
}

function renderEquityChart(dates, balance){
  const ctx = el('equityChart');
  if(equityChart) equityChart.destroy();
  
  equityChart = new Chart(ctx, {
    type: 'line',
    data: { 
      labels: dates, 
      datasets: [{ 
        label: 'Balance',
        data: balance,
        borderColor: '#4f9cff',
        backgroundColor: 'rgba(79, 156, 255, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#4f9cff',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      }]
    },
    options: getChartOptions('Equity Curve', 'Balance ($)')
  });
}

function renderMonthlyChart(months, pnl){
  const ctx = el('monthlyChart');
  if(monthlyChart) monthlyChart.destroy();
  
  monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: { 
      labels: months, 
      datasets: [{ 
        label: 'Monthly P&L',
        data: pnl,
        backgroundColor: pnl.map(v=> v>=0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)'),
        borderColor: pnl.map(v=> v>=0 ? '#22c55e' : '#ef4444'),
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      ...getChartOptions('Monthly Returns', 'P&L ($)'),
      scales: {
        ...getChartOptions().scales,
        y: {
          ...getChartOptions().scales.y,
          title: {
            display: true,
            text: 'P&L ($)',
            color: '#8ea1b5'
          }
        }
      }
    }
  });
}

function renderDrawdownChart(dates, balance) {
  const ctx = el('drawdownChart');
  if(drawdownChart) drawdownChart.destroy();
  
  // Calculate drawdown
  let peak = balance[0] || 0;
  const drawdown = balance.map(b => {
    if (b > peak) peak = b;
    return peak - b;
  });
  
  drawdownChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'Drawdown',
        data: drawdown,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5
      }]
    },
    options: getChartOptions('Drawdown', 'Drawdown ($)')
  });
}

function renderDistributionChart(trades) {
  const ctx = el('distributionChart');
  if(distributionChart) distributionChart.destroy();
  
  // Calculate P&L distribution
  const pnlValues = trades.map(t => t.pnl || 0);
  const wins = pnlValues.filter(p => p > 0).length;
  const losses = pnlValues.filter(p => p < 0).length;
  const breakeven = pnlValues.filter(p => p === 0).length;
  
  distributionChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Wins', 'Losses', 'Breakeven'],
      datasets: [{
        data: [wins, losses, breakeven],
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(148, 163, 184, 0.8)'
        ],
        borderColor: ['#22c55e', '#ef4444', '#8ea1b5'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#e2e8f0',
            padding: 15,
            font: { size: 12 }
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(10, 19, 38, 0.95)',
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
          borderColor: '#4f9cff',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.parsed / total) * 100).toFixed(1);
              return `${context.label}: ${context.parsed} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

function renderCumulativePnlChart(trades) {
  const ctx = el('cumulativePnlChart');
  if(cumulativePnlChart) cumulativePnlChart.destroy();
  
  // Calculate cumulative P&L
  let cumulative = 0;
  const cumulativeData = trades.map(t => {
    cumulative += (t.pnl || 0);
    return cumulative;
  });
  
  const labels = trades.map((t, i) => `Trade ${i + 1}`);
  
  cumulativePnlChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Cumulative P&L',
        data: cumulativeData,
        borderColor: '#22d3ee',
        backgroundColor: 'rgba(34, 211, 238, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#22d3ee',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      }]
    },
    options: getChartOptions('Cumulative P&L', 'Cumulative P&L ($)')
  });
}

// Reset chart zoom function
function resetChart(chartId) {
  const charts = {
    'equityChart': equityChart,
    'monthlyChart': monthlyChart,
    'drawdownChart': drawdownChart,
    'distributionChart': distributionChart,
    'cumulativePnlChart': cumulativePnlChart
  };
  
  const chart = charts[chartId];
  if (chart && chart.resetZoom) {
    chart.resetZoom();
  }
}

function setDownloads(links){
  tradesCsvUrl = links.trades_csv ? (API_BASE + links.trades_csv) : null;
  metricsCsvUrl = links.metrics_csv ? (API_BASE + links.metrics_csv) : null;
  const btnT = el('download-trades');
  const btnM = el('download-metrics');
  btnT.disabled = !tradesCsvUrl; btnM.disabled = !metricsCsvUrl;
  btnT.onclick = ()=> tradesCsvUrl && window.open(tradesCsvUrl, '_blank');
  btnM.onclick = ()=> metricsCsvUrl && window.open(metricsCsvUrl, '_blank');
}

async function fetchBacktestDetail(id){
  const r = await fetch(`${API_BASE}/backtests/${id}`);
  if(!r.ok) throw new Error('Failed to fetch detail');
  return r.json();
}

function renderTradesTablePage(){
  const table = el('trades-table');
  table.innerHTML='';
  const start = (currentPage-1)*pageSize;
  const pageRows = tradesData.slice(start, start+pageSize);
  if(!pageRows.length){ table.innerHTML = '<tr><td>No trades loaded</td></tr>'; return; }
  const headers = Object.keys(pageRows[0]);
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  headers.forEach(h=>{ const th = document.createElement('th'); th.textContent=h; trh.appendChild(th)});
  thead.appendChild(trh);
  const tbody = document.createElement('tbody');
  pageRows.forEach(r=>{
    const tr = document.createElement('tr');
    headers.forEach(h=>{
      const td = document.createElement('td');
      td.textContent = r[h];
      if(h.toLowerCase().includes('p&l') || h.toLowerCase()==='pnl'){
        const v = parseFloat(r[h]);
        if(!isNaN(v)) td.style.color = v>=0 ? '#2dd36f' : '#ef4444';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(thead); table.appendChild(tbody);
  el('page-info').textContent = `Page ${currentPage} / ${Math.max(1, Math.ceil(tradesData.length/pageSize))}`;
}

async function loadTradesCsvToTable(filterSide='both', filterPnl='all'){
  if(!tradesCsvUrl) return;
  const res = await fetch(tradesCsvUrl);
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true });
  let rows = parsed.data.filter(r=>Object.keys(r).length>1);
  // Optional filtering
  if(filterSide !== 'both') rows = rows.filter(r => (r['Position']||'').toLowerCase() === filterSide);
  if(filterPnl === 'wins') rows = rows.filter(r => parseFloat(r['P&L']||r['PNL']||0) > 0);
  if(filterPnl === 'losses') rows = rows.filter(r => parseFloat(r['P&L']||r['PNL']||0) < 0);
  tradesData = rows;
  currentPage = 1;
  renderTradesTablePage();
}

el('prev-page').onclick = ()=>{ if(currentPage>1){ currentPage--; renderTradesTablePage(); }};
el('next-page').onclick = ()=>{ const maxp = Math.max(1, Math.ceil(tradesData.length/pageSize)); if(currentPage<maxp){ currentPage++; renderTradesTablePage(); }};
el('load-trades').onclick = ()=>{
  const side = el('side-filter').value; const pf = el('pnl-filter').value;
  loadTradesCsvToTable(side, pf);
};

// Add event listener for when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initial load of file list
    refreshFileList();
    
    // Set up auto-refresh every 30 seconds
    setInterval(refreshFileList, 30000);
    
    // Set up history button handlers
    setupHistoryHandlers();
});

el('upload-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const file = el('file').files[0];
  if(!file){ alert('Select a file first'); return; }
  
  // Show progress
  showProgress();
  simulateProgress(8000);
  
  el('status').textContent = 'Uploading and running backtest...';
  el('run').disabled = true;

  const params = collectParams();
  const fd = new FormData();
  fd.append('file', file);
  fd.append('params_json', JSON.stringify(params));
  try{
    const r = await fetch(`${API_BASE}/backtests`, { method: 'POST', body: fd });
    if(!r.ok){ throw new Error(await r.text()); }
    const { id } = await r.json();
    lastBacktestId = id;
    
    updateProgress(100, 'Complete!');
    setTimeout(() => hideProgress(), 1000);
    
    el('status').textContent = 'Backtest completed. Loading results...';

    const detail = await fetchBacktestDetail(id);
    if(detail.status && detail.status !== 'completed'){
      el('status').textContent = `Status: ${detail.status}`;
      return;
    }

    // Render metrics & charts
    renderMetrics(detail.metrics);
    const ec = detail.chart_data?.equity_curve || { dates: [], balance: [] };
    renderEquityChart(ec.dates, ec.balance);
    const mr = detail.chart_data?.monthly_returns || { months: [], pnl: [] };
    renderMonthlyChart(mr.months, mr.pnl);
    
    // Render new charts
    renderDrawdownChart(ec.dates, ec.balance);
    
    // Store trades data for distribution and cumulative charts
    allTradesData = detail.trades || [];
    console.log('Trades data received:', allTradesData.length, 'trades');
    if (allTradesData.length > 0) {
      renderDistributionChart(allTradesData);
      renderCumulativePnlChart(allTradesData);
      renderHeatmap(allTradesData);
    } else {
      console.warn('No trades data available for distribution and cumulative charts');
    }

    // Downloads
    setDownloads(detail.download_links || {});

    // Show results section
    show('results', true);
    el('status').textContent = 'Done';
    // Refresh the file list after successful upload
    await refreshFileList();
  }catch(err){
    console.error(err);
    el('status').textContent = 'Error: '+ err;
  }finally{
    el('run').disabled = false;
  }
});

/* ===== Chart Zoom (equityChart + monthlyChart) — auto-applied ===== */
(function () {
  const IDS = ["equityChart", "monthlyChart"]; // add/remove chart canvas IDs here
  const PLUGIN_SRC = "https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.umd.min.js";

  function loadPlugin(cb){
    if (window["chartjs-plugin-zoom"]) return cb();
    const s = document.createElement("script");
    s.src = PLUGIN_SRC;
    s.onload = cb;
    s.onerror = () => console.warn("[zoom] failed to load plugin");
    document.head.appendChild(s);
  }

  function registerZoom(){
    const Zoom = (window["chartjs-plugin-zoom"]?.default) || window["chartjs-plugin-zoom"];
    if (Zoom && !Chart.registry.plugins.get("zoom")) Chart.register(Zoom);
  }

  function applyZoomToId(id){
    const chart = Chart.getChart(id);
    if (!chart) return false;

    chart.options = chart.options || {};
    chart.options.interaction = chart.options.interaction || { mode: "index", intersect: false };
    chart.options.plugins = chart.options.plugins || {};
    chart.options.plugins.zoom = {
      zoom: {
        wheel: { enabled: true },   // mouse wheel / trackpad
        pinch: { enabled: true },   // touch pinch
        drag: { enabled: true },    // drag-rectangle to zoom
        mode: "xy"
      },
      pan: { enabled: true, mode: "xy" },
      limits: { x: { min: "original", max: "original" }, y: { min: "original", max: "original" } }
    };
    chart.update();

    // Double-click or press R to reset
    const canvas = document.getElementById(id);
    if (canvas && chart.resetZoom) {
      canvas.addEventListener("dblclick", () => chart.resetZoom());
      document.addEventListener("keydown", (e)=> (e.key === "r" || e.key === "R") && chart.resetZoom());
    }

    // Tiny + / − / Reset controls (auto-injected under each chart)
    injectControls(id);
    return true;
  }

  function injectControls(id){
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent || parent.querySelector(`.zoom-controls[data-for="${id}"]`)) return;

    if (!document.getElementById("zoom-controls-style")) {
      const st = document.createElement("style");
      st.id = "zoom-controls-style";
      st.textContent = `
        .zoom-controls{display:flex;gap:6px;margin-top:8px}
        .zoom-controls button{padding:6px 10px;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:#0b1426;color:#e2e8f0;cursor:pointer}
        .zoom-controls button:hover{background:#0e1a34}
      `;
      document.head.appendChild(st);
    }

    const box = document.createElement("div");
    box.className = "zoom-controls";
    box.setAttribute("data-for", id);
    box.innerHTML = `
      <button data-act="in">+</button>
      <button data-act="out">-</button>
      <button data-act="reset">Reset</button>
    `;
    parent.appendChild(box);

    box.addEventListener("click", (e)=>{
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const chart = Chart.getChart(id);
      if (!chart) return;
      const act = btn.dataset.act;
      if (act === "reset" && chart.resetZoom) chart.resetZoom();
      if (act === "in") chart.zoom(1.2);
      if (act === "out") chart.zoom(0.8);
    });
  }

  function applyAll(){
    registerZoom();
    let appliedAny = false;
    IDS.forEach(id => { appliedAny = applyZoomToId(id) || appliedAny; });
    return appliedAny;
  }

  function init(){
    loadPlugin(() => {
      if (applyAll()) return;
      // Poll briefly until charts exist
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (applyAll() || tries > 80) clearInterval(iv); // ~20s max
      }, 250);
    });
  }

  // Re-run if your app recreates charts later
  const mo = new MutationObserver(() => init());
  mo.observe(document.body, { childList: true, subtree: true });

  init();
})();

/* ===== Previous Strategies (History from MongoDB) ===== */
let historicalData = [];
let filteredHistoricalData = [];

function setupHistoryHandlers() {
  const viewBtn = el('view-history-btn');
  const closeBtn = el('close-history-btn');
  const refreshBtn = el('refresh-history-btn');
  const searchInput = el('search-strategy');
  const sortSelect = el('sort-history');
  
  if (viewBtn) {
    viewBtn.onclick = async () => {
      show('history-section', true);
      show('config', false);
      show('file-list-section', false);
      show('results', false);
      await loadHistoricalData();
    };
  }
  
  if (closeBtn) {
    closeBtn.onclick = () => {
      show('history-section', false);
      show('config', true);
      show('file-list-section', true);
    };
  }
  
  if (refreshBtn) {
    refreshBtn.onclick = () => loadHistoricalData();
  }
  
  if (searchInput) {
    searchInput.oninput = () => filterAndDisplayHistory();
  }
  
  if (sortSelect) {
    sortSelect.onchange = () => filterAndDisplayHistory();
  }
}

async function loadHistoricalData() {
  const historyList = el('history-list');
  historyList.innerHTML = '<p style="text-align:center; color:var(--muted)">Loading previous strategies...</p>';
  
  try {
    const response = await fetch(`${API_BASE}/api/historical-data/?limit=100`);
    if (!response.ok) throw new Error('Failed to fetch historical data');
    
    historicalData = await response.json();
    filteredHistoricalData = [...historicalData];
    
    filterAndDisplayHistory();
  } catch (error) {
    console.error('Error loading historical data:', error);
    historyList.innerHTML = `<p style="text-align:center; color:var(--danger)">Error loading data: ${error.message}</p>`;
  }
}

function filterAndDisplayHistory() {
  const searchTerm = el('search-strategy').value.toLowerCase();
  const sortBy = el('sort-history').value;
  
  // Filter by search term
  filteredHistoricalData = historicalData.filter(item => {
    const filename = (item.original_filename || '').toLowerCase();
    const strategy = (item.strategy_name || '').toLowerCase();
    return filename.includes(searchTerm) || strategy.includes(searchTerm);
  });
  
  // Sort
  filteredHistoricalData.sort((a, b) => {
    switch(sortBy) {
      case 'newest':
        return new Date(b.timestamp) - new Date(a.timestamp);
      case 'oldest':
        return new Date(a.timestamp) - new Date(b.timestamp);
      case 'best':
        return (b.metrics?.total_pnl || 0) - (a.metrics?.total_pnl || 0);
      case 'worst':
        return (a.metrics?.total_pnl || 0) - (b.metrics?.total_pnl || 0);
      default:
        return 0;
    }
  });
  
  displayHistoricalData();
}

function displayHistoricalData() {
  const historyList = el('history-list');
  
  if (filteredHistoricalData.length === 0) {
    historyList.innerHTML = '<p style="text-align:center; color:var(--muted)">No strategies found.</p>';
    return;
  }
  
  let html = '';
  filteredHistoricalData.forEach(item => {
    const metrics = item.metrics || {};
    const timestamp = new Date(item.timestamp);
    const dateStr = timestamp.toLocaleString();
    
    const totalPnl = metrics.total_pnl || 0;
    const winRate = (metrics.win_rate || 0) * 100;
    const totalTrades = metrics.total_trades || 0;
    const sharpe = metrics.sharpe_ratio || 0;
    
    const pnlClass = totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : 'neutral';
    const winRateClass = winRate >= 50 ? 'positive' : 'negative';
    
    html += `
      <div class="history-item" data-id="${item._id}" onclick="loadHistoricalBacktest('${item._id}')">
        <div class="history-header">
          <div>
            <h3 class="history-title">${item.original_filename || 'Unknown File'}</h3>
            <div class="history-meta">${item.strategy_name || 'Strategy'} • ${totalTrades} trades</div>
          </div>
          <div class="history-date">${dateStr}</div>
        </div>
        <div class="history-metrics">
          <div class="history-metric">
            <span class="history-metric-label">Total P&L</span>
            <span class="history-metric-value ${pnlClass}">${totalPnl.toFixed(2)}</span>
          </div>
          <div class="history-metric">
            <span class="history-metric-label">Win Rate</span>
            <span class="history-metric-value ${winRateClass}">${winRate.toFixed(1)}%</span>
          </div>
          <div class="history-metric">
            <span class="history-metric-label">Sharpe Ratio</span>
            <span class="history-metric-value neutral">${sharpe.toFixed(2)}</span>
          </div>
          <div class="history-metric">
            <span class="history-metric-label">Max Drawdown</span>
            <span class="history-metric-value negative">${(metrics.max_drawdown || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>
    `;
  });
  
  historyList.innerHTML = html;
}

async function loadHistoricalBacktest(dataId) {
  try {
    el('status').textContent = 'Loading historical backtest...';
    
    const response = await fetch(`${API_BASE}/api/historical-data/${dataId}`);
    if (!response.ok) throw new Error('Failed to load backtest');
    
    const data = await response.json();
    
    // Hide history, show results
    show('history-section', false);
    show('results', true);
    
    // Render metrics
    renderMetrics(data.metrics);
    
    // Render charts
    const ec = data.equity_curve || { dates: [], balance: [] };
    renderEquityChart(ec.dates, ec.balance);
    
    const mr = data.monthly_returns || { months: [], pnl: [] };
    renderMonthlyChart(mr.months, mr.pnl);
    
    // Render new charts
    renderDrawdownChart(ec.dates, ec.balance);
    
    // Store trades data for distribution and cumulative charts
    allTradesData = data.trades || [];
    console.log('Historical trades data received:', allTradesData.length, 'trades');
    if (allTradesData.length > 0) {
      renderDistributionChart(allTradesData);
      renderCumulativePnlChart(allTradesData);
      renderHeatmap(allTradesData);
    } else {
      console.warn('No trades data in historical backtest');
    }
    
    // Set download links if available
    if (data.trades_csv_path) {
      tradesCsvUrl = `${API_BASE}/downloads/${data.trades_csv_path.split('/').pop()}`;
      el('download-trades').disabled = false;
      el('download-trades').onclick = () => window.open(tradesCsvUrl, '_blank');
    }
    
    if (data.metrics_csv_path) {
      metricsCsvUrl = `${API_BASE}/downloads/${data.metrics_csv_path.split('/').pop()}`;
      el('download-metrics').disabled = false;
      el('download-metrics').onclick = () => window.open(metricsCsvUrl, '_blank');
    }
    
    el('status').textContent = `Loaded: ${data.original_filename}`;
    
  } catch (error) {
    console.error('Error loading historical backtest:', error);
    el('status').textContent = `Error: ${error.message}`;
  }
}
