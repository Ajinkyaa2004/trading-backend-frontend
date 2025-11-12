/* Backtest UI enhancements — loader made unmistakable.
   - Full-screen loader with determinate progress + step list
   - Inline mini bar next to status
   - Tabs, preview, charts, downloads
   - Longer simulated run so the bar is visible (~5s)
*/

(function () {
  // ------- Helpers -------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const el = {
    config: $("#config"),
    results: $("#results"),
    uploadForm: $("#upload-form"),
    file: $("#file"),
    fileInfo: $("#file-info"),
    previewWrap: $("#preview"),
    previewTable: $("#preview-table"),
    runBtn: $("#run"),
    status: $("#status"),
    loadTrades: $("#load-trades"),
    tradesTable: $("#trades-table"),
    pnlFilter: $("#pnl-filter"),
    sideFilter: $("#side-filter"),
    nextPage: $("#next-page"),
    prevPage: $("#prev-page"),
    pageInfo: $("#page-info"),
    dlTrades: $("#download-trades"),
    dlMetrics: $("#download-metrics"),
    equityChart: $("#equityChart"),
    monthlyChart: $("#monthlyChart"),
  };

  let parsedRows = [];
  let tradesCache = []; // placeholder dataset for the table
  let page = 1, pageSize = 15;

  // ------- Inject Tabs -------
  function injectTabs() {
    if (document.querySelector(".nav-tabs")) return;
    const tabs = document.createElement("div");
    tabs.className = "nav-tabs";
    tabs.innerHTML = `
      <button class="tab-btn active" data-tab="config">Configuration</button>
      <button class="tab-btn" data-tab="results">Results</button>
    `;
    document.querySelector("header").after(tabs);

    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-btn");
      if (!btn) return;
      $$(".tab-btn").forEach(b => b.classList.toggle("active", b === btn));
      const to = btn.dataset.tab;
      toggleSection(to);
    });
  }

  function toggleSection(target) {
    if (target === "config") {
      el.config.classList.remove("hidden");
      el.results.classList.add("hidden");
    } else {
      el.results.classList.remove("hidden");
      el.config.classList.add("hidden");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ------- Loader Overlay -------
  let loader;
  function injectLoader() {
    loader = document.querySelector(".loader-overlay");
    if (loader) return;
    loader = document.createElement("div");
    loader.className = "loader-overlay";
    loader.innerHTML = `
      <div class="loader-card">
        <div class="loader-spinner"></div>
        <div style="font-weight:800; font-size:16px; margin-bottom:6px">Running backtest…</div>
        <div id="loader-status" class="muted" style="margin-bottom:12px">Initializing...</div>
        <div class="progress-bar">
          <div id="loader-progress" style="width:0%; height:100%; background:linear-gradient(90deg, var(--brand), var(--brand-2)); border-radius:999px; transition:width 0.3s ease"></div>
        </div>
      </div>
    `;
    document.body.appendChild(loader);
  }
  function showLoader(){
    injectLoader();
    loader.classList.add("show");
    updateLoaderProgress(0, "Initializing...");
  }
  function hideLoader(){
    loader.classList.remove("show");
    // Reset for next run
    updateLoaderProgress(0, "Initializing...");
  }

  function updateLoaderProgress(percent, message){
    const bar = document.getElementById("loader-progress");
    const txt = document.getElementById("loader-status");
    if (bar) bar.style.width = Math.min(100, Math.max(0, percent)) + "%";
    if (txt) txt.textContent = message;
  }

  // ------- Inline Progress (shown next to status text) -------
  let inlineBar;
  function injectInlineBar() {
    inlineBar = document.createElement("span");
    inlineBar.className = "inline-progress";
    inlineBar.innerHTML = `<i></i>`;
    // place it right after the #status span
    el.status.insertAdjacentElement("afterend", inlineBar);
  }
  function showInlineBar(){ inlineBar?.classList.add("show"); }
  function hideInlineBar(){ inlineBar?.classList.remove("show"); }

  // ------- CSV Preview -------
  function previewCSV(rows) {
    if (!rows || !rows.length) return;
    const cols = Object.keys(rows[0] || {});
    const head = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>`;
    const body = `<tbody>${rows.slice(0,10).map(r=>`<tr>${cols.map(c=>`<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
    el.previewTable.innerHTML = head + body;
    el.previewWrap.classList.remove("hidden");
  }

  // ------- Trades Table (light demo) -------
  function renderTrades() {
    const cols = ["entry_time","exit_time","side","qty","entry_price","exit_price","pnl"];
    const head = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>`;
    // simple filters
    let filtered = tradesCache.slice();
    const pf = el.pnlFilter.value;
    if (pf === "wins") filtered = filtered.filter(r => +r.pnl > 0);
    if (pf === "losses") filtered = filtered.filter(r => +r.pnl <= 0);
    const sf = el.sideFilter.value;
    if (sf !== "both") filtered = filtered.filter(r => r.side === sf);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, totalPages);

    const start = (page-1)*pageSize;
    const rows = filtered.slice(start, start+pageSize);

    const body = `<tbody>${
      rows.map(r => `
        <tr>
          <td>${r.entry_time}</td>
          <td>${r.exit_time}</td>
          <td>${r.side}</td>
          <td>${r.qty}</td>
          <td>${r.entry_price}</td>
          <td>${r.exit_price}</td>
          <td style="color:${+r.pnl>0?'#22c55e':(+r.pnl<0?'#ef4444':'#e6eef7')}">${r.pnl}</td>
        </tr>
      `).join("")
    }</tbody>`;

    el.tradesTable.innerHTML = head + body;
    el.pageInfo.textContent = `Page ${page} / ${totalPages}`;
    el.prevPage.disabled = page<=1;
    el.nextPage.disabled = page>=totalPages;
  }

  // ------- Charts (placeholder rendering using Chart.js) -------
  let equityChart, monthlyChart;
  function drawCharts() {
    if (!window.Chart) return;

    // Dispose previous charts
    equityChart && equityChart.destroy();
    monthlyChart && monthlyChart.destroy();

    // Equity curve (mock from parsedRows length)
    const n = Math.min(200, Math.max(30, parsedRows.length || 100));
    const eq = Array.from({length:n}, (_,i) => 100000 + Math.round((Math.sin(i/8)+Math.random()*0.5)*800) + i*10);
    const labels = Array.from({length:n}, (_,i)=>i+1);

    equityChart = new Chart(el.equityChart.getContext("2d"), {
      type: "line",
      data: { labels, datasets: [{ label:"Equity", data:eq, fill:false, tension:.25 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins:{
          legend:{ labels:{ color:"#cfe0ff" } },
          zoom: {
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, drag: { enabled: true }, mode: "xy" },
            pan: { enabled: true, mode: "xy" }
          }
        },
        scales:{
          x:{ ticks:{ color:"#9fb3c7" }, grid:{ color:"rgba(255,255,255,.06)"} },
          y:{ ticks:{ color:"#9fb3c7" }, grid:{ color:"rgba(255,255,255,.06)"} },
        }
      }
    });
    // Double-click equity chart to reset zoom
    if (el.equityChart && equityChart?.resetZoom) {
      el.equityChart.addEventListener("dblclick", () => equityChart.resetZoom());
    }

    // Monthly returns (dummy)
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const rets = months.map(()=> +( (Math.random()-0.4)*6 ).toFixed(2));
    monthlyChart = new Chart(el.monthlyChart.getContext("2d"), {
      type: "bar",
      data: { labels: months, datasets: [{ label:"% Return", data: rets }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins:{
          legend:{ labels:{ color:"#cfe0ff" } },
          zoom: {
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "xy" },
            pan: { enabled: true, mode: "xy" }
          }
        },
        scales:{
          x:{ ticks:{ color:"#9fb3c7" }, grid:{ color:"rgba(255,255,255,.06)"} },
          y:{ ticks:{ color:"#9fb3c7" }, grid:{ color:"rgba(255,255,255,.06)"}, beginAtZero:true }
        }
      }
    });
  }

  // ------- Downloads (dummy enable after run) -------
  function enableDownloads() {
    el.dlTrades.disabled = false;
    el.dlMetrics.disabled = false;

    // Create minimal CSVs in-memory so buttons work
    el.dlTrades.onclick = () => {
      const csv = "entry_time,exit_time,side,qty,entry_price,exit_price,pnl\n" +
        tradesCache.map(r => [r.entry_time,r.exit_time,r.side,r.qty,r.entry_price,r.exit_price,r.pnl].join(",")).join("\n");
      const blob = new Blob([csv], {type:"text/csv"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "trades.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    };

    el.dlMetrics.onclick = () => {
      const metrics = [
        ["Starting Balance","100000"],
        ["Ending Balance",(100000 + (tradesCache.reduce((s,r)=>s+Number(r.pnl),0))).toFixed(2)],
        ["Win Rate (%)",(Math.random()*30+40).toFixed(2)],
        ["Max Drawdown (%)",(Math.random()*12+6).toFixed(2)],
        ["Profit Factor",(Math.random()*0.8+1.2).toFixed(2)]
      ];
      const csv = "metric,value\n" + metrics.map(m=>m.join(",")).join("\n");
      const blob = new Blob([csv], {type:"text/csv"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "metrics.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    };
  }

  // ------- Wire Up Events -------
  function wire() {
    // File choose -> parse preview
    el.file.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      parsedRows = [];
      if (!file) { el.runBtn.disabled = true; return; }

      el.fileInfo.textContent = `Selected: ${file.name} • ${(file.size/1024).toFixed(1)} KB`;
      el.status.textContent = "Parsing CSV preview…";

      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function (res) {
          parsedRows = res.data || [];
          el.status.textContent = `Rows: ${parsedRows.length}`;
          previewCSV(parsedRows);

          // synthesize a tiny trades list so the table isn't empty
          tradesCache = Array.from({length: Math.min(120, Math.max(30, Math.floor(parsedRows.length/5) ))}, (_,i)=>({
            entry_time: `2025-05-${String((i%28)+1).padStart(2,"0")} 10:${String(i%60).padStart(2,"0")}`,
            exit_time:  `2025-05-${String((i%28)+1).padStart(2,"0")} 10:${String((i+5)%60).padStart(2,"0")}`,
            side: i%2? "short":"long",
            qty: 1,
            entry_price: (100 + i*0.5).toFixed(2),
            exit_price: (100 + i*0.5 + (Math.random()-0.4)*1.6).toFixed(2),
            pnl: (Math.random()*20 - 8).toFixed(2),
          }));
          renderTrades();

          el.runBtn.disabled = false;
        }
      });
    });

    // Submit -> progressive loader -> switch to Results tab
    el.uploadForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (el.runBtn.disabled) return;

      showLoader();
      el.status.textContent = "Running backtest…";

      const steps = [
        {progress: 10, message: "Loading CSV data..."},
        {progress: 25, message: "Parsing timestamps and prices..."},
        {progress: 40, message: "Running strategy logic..."},
        {progress: 55, message: "Calculating position sizing..."},
        {progress: 70, message: "Applying risk management..."},
        {progress: 80, message: "Computing performance metrics..."},
        {progress: 90, message: "Generating charts and reports..."},
        {progress: 95, message: "Almost done, finalizing..."},
        {progress: 100, message: "Complete!"}
      ];

      let i = 0;
      const t = setInterval(() => {
        if (i < steps.length) {
          const s = steps[i++];
          updateLoaderProgress(s.progress, s.message);
        } else {
          clearInterval(t);
          setTimeout(() => {
            hideLoader();
            el.status.textContent = "Backtest completed successfully!";

            // Reveal results tab & section
            $$(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === "results"));
            toggleSection("results");

            // Draw charts & enable downloads
            drawCharts();
            enableDownloads();
          }, 500);
        }
      }, 300);
    });

    // Trades controls
    el.loadTrades?.addEventListener("click", renderTrades);
    el.pnlFilter?.addEventListener("change", ()=>{ page=1; renderTrades(); });
    el.sideFilter?.addEventListener("change", ()=>{ page=1; renderTrades(); });
    el.nextPage?.addEventListener("click", ()=>{ page++; renderTrades(); });
    el.prevPage?.addEventListener("click", ()=>{ page=Math.max(1,page-1); renderTrades(); });
  }

  // ------- Init -------
  function init(){
    injectLoader();
    injectInlineBar();
    (function(){
      const src = "https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.umd.min.js";
      if (!document.querySelector(`script[src="${src}"]`)){
        const s = document.createElement("script");
        s.src = src; document.head.appendChild(s);
      }
    })();
    (function(){
      const actions = document.querySelector(".actions");
      if (!actions || document.querySelector("#bt-progress-wrap")) return;
      const wrap = document.createElement("div");
      wrap.id = "bt-progress-wrap";
      wrap.innerHTML = `
        <div class="bt-progress"><div class="bt-progress-bar" id="bt-progress" style="width:0%"></div></div>
        <div class="bt-progress-label" id="bt-progress-label">Idle</div>
      `;
      actions.appendChild(wrap);
    })();
    // Keep downloads in its original HTML location (no relocation)
    const Progress = (function(){
      let t = null, pct = 0, active = false;
      const bar = () => document.querySelector("#bt-progress");
      const label = () => document.querySelector("#bt-progress-label");
      function start(text){
        stop(true); active = true; pct = 0; update(2, text || "Preparing...");
        t = setInterval(()=>{
          if (pct < 85) update(pct + Math.random()*3, "Crunching bars & ticks...");
          else if (pct < 95) update(pct + Math.random()*1.2, "Almost there…");
        }, 200);
      }
      function update(p, text){
        pct = Math.max(0, Math.min(100, p));
        const b = bar(); const l = label();
        if (b) b.style.width = pct+"%";
        if (l) l.textContent = text || (pct < 100 ? "Working..." : "Done");
      }
      function done(){ update(100, "Done"); setTimeout(()=>stop(true), 600); }
      function stop(reset){ if (t) clearInterval(t); t=null; active=false; if (reset){ const b=bar(), l=label(); if (b) b.style.width="0%"; if (l) l.textContent="Idle"; } }
      function isActive(){ return active; }
      return { start, update, done, stop, isActive };
    })();
    (function(){
      const results = el.results;
      if (!results) return;
      const obs = new MutationObserver(()=>{
        const visible = !results.classList.contains("hidden");
        if (visible && Progress.isActive()){
          setTimeout(()=> Progress.done(), 500);
          setTimeout(enableZoomOnCharts, 800);
          setTimeout(ensurePopoutButton, 900);
        }
        // do not move downloads; respect original DOM placement
      });
      obs.observe(results, { attributes:true, attributeFilter:["class"] });
    })();
    (function(){
      const form = el.uploadForm; const runBtn = el.runBtn;
      if (!form) return;
      form.addEventListener("submit", ()=>{
        Progress.start("Uploading & parsing CSV…");
        if (runBtn) runBtn.disabled = true;
        if (el.status) el.status.textContent = "Running backtest…";
      }, true);
    })();
    function enableZoomOnCharts(){
      if (typeof Chart === "undefined" || !window["chartjs-plugin-zoom"]) { setTimeout(enableZoomOnCharts, 300); return; }
      // Register plugin for Chart.js v4 if not already
      try {
        const Zoom = (window["chartjs-plugin-zoom"] && window["chartjs-plugin-zoom"].default) || window["chartjs-plugin-zoom"]; 
        if (Zoom && !Chart.registry.plugins.get("zoom")) { Chart.register(Zoom); }
      } catch(_) {}
      const ids = ["equityChart","monthlyChart"];
      ids.forEach((id)=>{
        const chart = Chart.getChart(id);
        if (!chart) return;
        chart.options.plugins = chart.options.plugins || {};
        chart.options.plugins.zoom = {
          zoom: { wheel:{enabled:true}, pinch:{enabled:true}, mode:"xy" },
          pan: { enabled:true, mode:"xy" },
          limits: { x:{min:"original",max:"original"}, y:{min:"original",max:"original"} }
        };
        chart.resetZoom && chart.resetZoom();
        chart.update();
      });
      injectChartControls();
    }
    function injectChartControls(){
      const charts = [ {id:"equityChart"}, {id:"monthlyChart"} ];
      charts.forEach(({id})=>{
        const canvas = document.getElementById(id);
        if (!canvas) return; const parent = canvas.parentElement;
        if (!parent || parent.querySelector(".zoom-controls")) return;
        const ctrls = document.createElement("div");
        ctrls.className = "zoom-controls";
        ctrls.innerHTML = `
          <button data-chart="${id}" data-act="zoomin">+</button>
          <button data-chart="${id}" data-act="zoomout">-</button>
          <button data-chart="${id}" data-act="reset">Reset</button>
        `;
        parent.appendChild(ctrls);
      });
      document.addEventListener("click", (e)=>{
        const btn = e.target.closest(".zoom-controls button");
        if (!btn) return; const id = btn.getAttribute("data-chart"); const act = btn.getAttribute("data-act");
        const chart = Chart.getChart(id); if (!chart) return;
        if (act === "reset" && chart.resetZoom) chart.resetZoom();
        if (act === "zoomin") chart.zoom(1.2);
        if (act === "zoomout") chart.zoom(0.8);
      });
    }
    function ensurePopoutButton(){
      const downloads = document.getElementById("downloads");
      if (!downloads || document.getElementById("open-results-page")) return;
      const btn = document.createElement("button");
      btn.id = "open-results-page"; btn.textContent = "Open Results Page"; btn.title = "View a clean, printable results page";
      btn.addEventListener("click", exportResultsToPage);
      downloads.appendChild(btn);
    }
    function exportResultsToPage(){
      const data = {}; data.generatedAt = new Date().toISOString();
      const metrics = document.getElementById("metrics");
      data.metricsHTML = metrics ? metrics.innerHTML : "";
      const trades = document.getElementById("trades-table");
      data.tradesHTML = trades ? trades.outerHTML : "";
      const eq = document.getElementById("equityChart");
      const mon = document.getElementById("monthlyChart");
      try{ data.equityChart = eq ? eq.toDataURL("image/png") : null; }catch(e){}
      try{ data.monthlyChart = mon ? mon.toDataURL("image/png") : null; }catch(e){}
      data.params = {
        starting_balance: document.getElementById("starting_balance")?.value || null,
        tp_ticks: document.getElementById("tp_ticks")?.value || null,
        sl_ticks: document.getElementById("sl_ticks")?.value || null,
        risk_percentage: document.getElementById("risk_percentage")?.value || null,
        trailing_stop: document.getElementById("trailing_stop")?.checked || false,
      };
      localStorage.setItem("bt_results_payload", JSON.stringify(data));
      window.open("results.html", "_blank");
    }
    (function(){
      const tgt = document.getElementById("downloads");
      if (!tgt) return;
      const obs = new MutationObserver(()=>{
        const any = Array.from(tgt.querySelectorAll("button")).some(b=>!b.disabled);
        if (any) ensurePopoutButton();
      });
      obs.observe(tgt, { childList:true, subtree:true });
    })();
    // Start with Config tab visible, Results hidden (HTML already hides results)
    toggleSection("config");
    wire();
    // Optional: press "L" to preview the loader
    document.addEventListener("keydown", (e)=>{
      if((e.key||"").toLowerCase()==="l"){ showLoader(); setTimeout(hideLoader, 1500); }
    });
    // Press 'r' to reset chart zoom
    document.addEventListener("keydown", (e)=>{
      if ((e.key||"").toLowerCase() === "r"){
        const ids = ["equityChart","monthlyChart"];
        ids.forEach(id=>{ const c = window.Chart?.getChart?.(id); if (c && c.resetZoom) c.resetZoom(); });
      }
    });
    // Re-apply zoom if charts are re-rendered
    const mo = new MutationObserver(()=>{ enableZoomOnCharts(); });
    mo.observe(document.body, { childList:true, subtree:true });
  }
  document.readyState !== "loading" ? init() : document.addEventListener("DOMContentLoaded", init);
})();
