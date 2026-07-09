/* ============ charts.js — Chart.js rendering (local only, spec FR-IMG-6) ============ */
"use strict";
(function (SF) {
  /* per-theme chart palette + ink colors, aligned with deck.css themes */
  const THEME_CHART = {
    corporate: { ink: "#16233c", grid: "rgba(22,35,60,.12)", palette: ["#2456d6", "#0e9488", "#d97706", "#7c3aed", "#be185d", "#4d7c0f"] },
    dark:      { ink: "#edf0f6", grid: "rgba(237,240,246,.14)", palette: ["#6f9dff", "#4dd0c0", "#ffb454", "#c4a5ff", "#ff8fab", "#a3d977"] },
    contrast:  { ink: "#ffffff", grid: "rgba(255,255,255,.28)", palette: ["#ffd400", "#00e5ff", "#ff6ec7", "#7CFC00", "#ff9e00", "#ffffff"] },
    creative:  { ink: "#2d2a32", grid: "rgba(45,42,50,.10)", palette: ["#ff6b5e", "#17b8a6", "#ffc145", "#7c6ff0", "#2d9cdb", "#e8618c"] },
    gradient:  { ink: "#241b3a", grid: "rgba(36,27,58,.10)", palette: ["#7b2ff7", "#f72f8e", "#2fb7f7", "#f7a72f", "#27c39f", "#5d5fef"] },
    elegant:   { ink: "#2b2620", grid: "rgba(43,38,32,.12)", palette: ["#b08d4a", "#274035", "#c67b57", "#7a8b6f", "#8f5f43", "#4a6358"] },
    minimal:   { ink: "#141414", grid: "rgba(20,20,20,.10)", palette: ["#141414", "#e0301e", "#767676", "#b5b5b5", "#4a4a4a", "#e08f86"] },
    retro:     { ink: "#3f2d20", grid: "rgba(63,45,32,.12)", palette: ["#d95d39", "#2f6f6a", "#e3b13e", "#7d4a32", "#4a8f88", "#c88b2e"] },
    nature:    { ink: "#23372a", grid: "rgba(35,55,42,.12)", palette: ["#3e7d4f", "#8aab5c", "#d9a44a", "#5b8f8a", "#a2c084", "#7a5c3e"] },
    tech:      { ink: "#e6ecff", grid: "rgba(230,236,255,.14)", palette: ["#22d3ee", "#8b5cf6", "#f471b5", "#34d399", "#facc15", "#60a5fa"] },
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

  SF.charts = { renderChart, chartToPngDataUri, toChartJsConfig, THEME_CHART };
})(window.SF);
