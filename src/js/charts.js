/* ============ charts.js — Chart.js rendering (local only, spec FR-IMG-6) ============ */
"use strict";
(function (SF) {
  /* per-theme chart palette + ink colors, aligned with deck.css themes */
  const THEME_CHART = {
    corporate: { ink: "#16233c", grid: "rgba(22,35,60,.12)", palette: ["#2456d6", "#0e9488", "#d97706", "#7c3aed", "#be185d", "#4d7c0f"] },
    dark:      { ink: "#edf0f6", grid: "rgba(237,240,246,.14)", palette: ["#6f9dff", "#4dd0c0", "#ffb454", "#c4a5ff", "#ff8fab", "#a3d977"] },
    contrast:  { ink: "#ffffff", grid: "rgba(255,255,255,.28)", palette: ["#ffd400", "#00e5ff", "#ff6ec7", "#7CFC00", "#ff9e00", "#ffffff"] },
  };

  function toChartJsConfig(spec, theme, opts) {
    const t = THEME_CHART[theme] || THEME_CHART.corporate;
    const circular = spec.type === "pie" || spec.type === "doughnut";
    const datasets = spec.datasets.map((ds, i) => ({
      label: ds.label || `Series ${i + 1}`,
      data: ds.data,
      backgroundColor: circular ? spec.labels.map((_, j) => t.palette[j % t.palette.length]) : t.palette[i % t.palette.length] + (spec.type === "line" ? "33" : ""),
      borderColor: circular ? "transparent" : t.palette[i % t.palette.length],
      borderWidth: spec.type === "line" || spec.type === "scatter" ? 3 : 1,
      pointRadius: 4,
      fill: spec.type === "line",
      tension: 0.25,
    }));
    const fontSpec = { family: "InterVariable, Inter, system-ui, sans-serif", size: opts && opts.fontSize || 20 };
    return {
      type: spec.type,
      data: { labels: spec.labels, datasets },
      options: {
        responsive: false,
        animation: false,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: datasets.length > 1 || circular, labels: { color: t.ink, font: fontSpec } },
          title: spec.title ? { display: true, text: spec.title, color: t.ink, font: { ...fontSpec, size: fontSpec.size + 6, weight: "700" } } : { display: false },
        },
        scales: circular ? {} : {
          x: { ticks: { color: t.ink, font: fontSpec }, grid: { color: t.grid } },
          y: { ticks: { color: t.ink, font: fontSpec }, grid: { color: t.grid } },
        },
      },
    };
  }

  const live = new Map(); // canvas -> Chart instance

  function renderChart(canvas, spec, theme, opts) {
    if (live.has(canvas)) { live.get(canvas).destroy(); live.delete(canvas); }
    const chart = new window.Chart(canvas.getContext("2d"), toChartJsConfig(spec, theme, opts));
    live.set(canvas, chart);
    return chart;
  }

  /** Offscreen render → PNG data URI (for export, spec FR-RENDER-4). */
  function chartToPngDataUri(spec, theme, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width || 2280; canvas.height = height || 960; // 2x for crispness
    const cfg = toChartJsConfig(spec, theme, { fontSize: 34 });
    /* transparent background keeps the theme's slide background visible */
    const chart = new window.Chart(canvas.getContext("2d"), cfg);
    chart.resize(canvas.width, canvas.height);
    chart.update();
    const uri = canvas.toDataURL("image/png");
    chart.destroy();
    return uri;
  }

  SF.charts = { renderChart, chartToPngDataUri, toChartJsConfig };
})(window.SF);
