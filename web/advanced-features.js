/* ===== Advanced Features JavaScript ===== */

// Excel File Support with Auto-detection
async function handleFileUpload(file) {
  const fileName = file.name.toLowerCase();
  let data = null;
  
  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    // Handle Excel files
    data = await readExcelFile(file);
  } else if (fileName.endsWith('.csv')) {
    // Handle CSV files (existing logic)
    data = await readCSVFile(file);
  } else {
    throw new Error('Unsupported file format');
  }
  
  return data;
}

async function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        // Auto-detect columns
        const detectedData = autoDetectColumns(jsonData);
        resolve(detectedData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function readCSVFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      preview: 11,
      complete: (res) => {
        const rows = res.data.filter(r => r.length > 1);
        const detectedData = autoDetectColumns(rows);
        resolve(detectedData);
      },
      error: reject
    });
  });
}

function autoDetectColumns(data) {
  if (!data || data.length < 2) return data;
  
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const detectedIndices = {
    date: -1,
    open: -1,
    high: -1,
    low: -1,
    close: -1
  };
  
  // Auto-detect date column
  const datePatterns = ['date', 'time', 'datetime', 'timestamp', 'date_time', 'date time'];
  detectedIndices.date = headers.findIndex(h => datePatterns.some(p => h.includes(p)));
  
  // Auto-detect OHLC columns
  detectedIndices.open = headers.findIndex(h => h === 'open' || h.includes('open'));
  detectedIndices.high = headers.findIndex(h => h === 'high' || h.includes('high'));
  detectedIndices.low = headers.findIndex(h => h === 'low' || h.includes('low'));
  detectedIndices.close = headers.findIndex(h => h === 'close' || h.includes('close'));
  
  // If all columns detected, reorder them
  if (Object.values(detectedIndices).every(i => i >= 0)) {
    const reorderedData = data.map((row, idx) => {
      if (idx === 0) {
        // Header row
        return ['date_time', 'open', 'high', 'low', 'close'];
      } else {
        // Data rows
        return [
          row[detectedIndices.date],
          row[detectedIndices.open],
          row[detectedIndices.high],
          row[detectedIndices.low],
          row[detectedIndices.close]
        ];
      }
    });
    
    console.log('✓ Auto-detected columns:', detectedIndices);
    return reorderedData;
  }
  
  return data;
}

// Real-time Progress Updates
let progressInterval = null;

function showProgress() {
  show('progress-container', true);
  el('progress-bar').style.width = '0%';
  el('progress-text').textContent = 'Initializing...';
  el('progress-percent').textContent = '0%';
}

function updateProgress(percent, text, details = '') {
  el('progress-bar').style.width = percent + '%';
  el('progress-text').textContent = text;
  el('progress-percent').textContent = percent + '%';
  
  if (details) {
    el('progress-details').textContent = details;
    el('progress-details').classList.add('show');
  }
}

function hideProgress() {
  show('progress-container', false);
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

function simulateProgress(duration = 10000) {
  let progress = 0;
  const steps = [
    { percent: 10, text: 'Uploading file...' },
    { percent: 25, text: 'Validating data...' },
    { percent: 40, text: 'Calculating indicators...' },
    { percent: 60, text: 'Detecting signals...' },
    { percent: 80, text: 'Simulating trades...' },
    { percent: 95, text: 'Analyzing performance...' },
    { percent: 100, text: 'Complete!' }
  ];
  
  let currentStep = 0;
  const interval = duration / steps.length;
  
  progressInterval = setInterval(() => {
    if (currentStep < steps.length) {
      const step = steps[currentStep];
      updateProgress(step.percent, step.text);
      currentStep++;
    } else {
      clearInterval(progressInterval);
    }
  }, interval);
}

// Performance Heatmap
let heatmapView = 'monthly'; // 'monthly' or 'yearly'
let heatmapData = null;

function toggleHeatmapView() {
  heatmapView = heatmapView === 'monthly' ? 'yearly' : 'monthly';
  if (heatmapData) {
    renderHeatmap(heatmapData);
  }
}

function renderHeatmap(trades) {
  if (!trades || trades.length === 0) {
    el('heatmap-container').innerHTML = '<p style="text-align:center; color:var(--muted)">No data available for heatmap</p>';
    return;
  }
  
  heatmapData = trades;
  
  // Group trades by month/year
  const grouped = {};
  trades.forEach(trade => {
    const exitTime = trade.exit_time || trade['Exit Time'];
    if (!exitTime) return;
    
    const date = new Date(exitTime);
    const key = heatmapView === 'monthly' 
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      : `${date.getFullYear()}`;
    
    if (!grouped[key]) {
      grouped[key] = { pnl: 0, trades: 0 };
    }
    
    grouped[key].pnl += trade.pnl || trade['PNL'] || 0;
    grouped[key].trades++;
  });
  
  // Create heatmap HTML
  let html = `<div class="heatmap-grid">`;
  
  if (heatmapView === 'monthly') {
    // Monthly view - show last 8 months to keep it compact
    const months = Object.keys(grouped).sort().slice(-8);
    months.forEach(month => {
      const data = grouped[month];
      const pnl = data.pnl;
      const cellClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral';
      const [year, monthNum] = month.split('-');
      const monthName = new Date(year, parseInt(monthNum) - 1).toLocaleString('default', { month: 'short' });
      
      html += `
        <div class="heatmap-month">
          <div class="heatmap-label">${monthName} '${year.slice(-2)}</div>
          <div class="heatmap-cell ${cellClass}" title="${monthName} ${year}: $${pnl.toFixed(2)} (${data.trades} trades)">
            ${pnl > 0 ? '+' : ''}${(pnl/1000).toFixed(1)}k
          </div>
        </div>
      `;
    });
  } else {
    // Yearly view - show last 5 years
    const years = Object.keys(grouped).sort().slice(-5);
    years.forEach(year => {
      const data = grouped[year];
      const pnl = data.pnl;
      const cellClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral';
      
      html += `
        <div class="heatmap-month">
          <div class="heatmap-label">${year}</div>
          <div class="heatmap-cell ${cellClass}" title="${year}: $${pnl.toFixed(2)} (${data.trades} trades)">
            ${pnl > 0 ? '+' : ''}${(pnl/1000).toFixed(1)}k
          </div>
        </div>
      `;
    });
  }
  
  html += `</div>`;
  
  // Add legend
  html += `
    <div class="heatmap-legend">
      <div class="heatmap-legend-item">
        <div class="heatmap-legend-color" style="background: linear-gradient(135deg, #22c55e, #16a34a)"></div>
        <span>Profit</span>
      </div>
      <div class="heatmap-legend-item">
        <div class="heatmap-legend-color" style="background: linear-gradient(135deg, #ef4444, #dc2626)"></div>
        <span>Loss</span>
      </div>
      <div class="heatmap-legend-item">
        <div class="heatmap-legend-color" style="background: rgba(148, 163, 184, 0.2)"></div>
        <span>Breakeven</span>
      </div>
      <div style="margin-left: auto; color: var(--muted)">
        View: ${heatmapView === 'monthly' ? 'Monthly' : 'Yearly'}
      </div>
    </div>
  `;
  
  el('heatmap-container').innerHTML = html;
}

// Initialize all advanced features
document.addEventListener('DOMContentLoaded', () => {
  // Advanced features initialized
  console.log('Advanced features loaded');
});
