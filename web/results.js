(function init() {
  const payloadRaw = localStorage.getItem("bt_results_payload");
  if (!payloadRaw) {
    document.body.innerHTML = "<div style='max-width:800px;margin:2rem auto;font:16px/1.4 system-ui'><h2>No results found</h2><p>Open this page via the <b>Open Results Page</b> button after running a backtest.</p></div>";
    return;
  }
  const data = JSON.parse(payloadRaw);

  const meta = document.getElementById("meta");
  if (meta) {
    const p = data.params || {};
    const when = new Date(data.generatedAt);
    meta.textContent = `Generated on ${when.toLocaleString()} • Starting Balance: ${p.starting_balance ?? "-"} • TP: ${p.tp_ticks ?? "-"} • SL: ${p.sl_ticks ?? "-"} • Risk: ${p.risk_percentage ?? "-"}% • Trailing: ${p.trailing_stop ? "On" : "Off"}`;
  }

  // Charts (images)
  const eqImg = document.getElementById("eq-img");
  const monImg = document.getElementById("mon-img");
  if (eqImg && data.equityChart) eqImg.src = data.equityChart;
  if (monImg && data.monthlyChart) monImg.src = data.monthlyChart;

  // Metrics + Trades
  const metricsSlot = document.getElementById("metrics-slot");
  const tradesSlot = document.getElementById("trades-slot");
  if (metricsSlot) metricsSlot.innerHTML = data.metricsHTML || "<div class='muted'>No metrics available.</div>";
  if (tradesSlot) tradesSlot.innerHTML = data.tradesHTML || "<div class='muted'>No trades available.</div>";

  // Downloads
  function dl(dataURL, filename) {
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  document.getElementById("download-eq")?.addEventListener("click", () => {
    if (data.equityChart) dl(data.equityChart, "equity-chart.png");
  });
  document.getElementById("download-mon")?.addEventListener("click", () => {
    if (data.monthlyChart) dl(data.monthlyChart, "monthly-chart.png");
  });
  document.getElementById("print-page")?.addEventListener("click", () => window.print());
})();
