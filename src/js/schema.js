/* ============ schema.js — outline validation & sanitization (spec §5.1) ============
   Hand-rolled validator: every string cleaned, unknown fields dropped,
   numbers coerced & bounds-checked. Applied to LLM output AND imported
   project files (defense against tampered files, spec §5.2). */
"use strict";
(function (SF) {
  const LAYOUTS = ["title", "bullets", "bullets_image", "image_full", "chart", "two_column", "quote", "section"];
  const CHART_TYPES = ["bar", "line", "pie", "doughnut", "scatter"];
  const MAX_SLIDES = 80, MAX_BULLETS = 12, MAX_DATASETS = 8, MAX_POINTS = 60;

  const T = (v, len) => SF.cleanText(v, len);

  function cleanChartSpec(raw) {
    if (!raw || typeof raw !== "object") return null;
    const type = CHART_TYPES.includes(raw.type) ? raw.type : "bar";
    const labels = Array.isArray(raw.labels) ? raw.labels.slice(0, MAX_POINTS).map((l) => T(l, 80)) : [];
    let datasets = Array.isArray(raw.datasets) ? raw.datasets.slice(0, MAX_DATASETS) : [];
    datasets = datasets.map((ds) => {
      const data = (Array.isArray(ds && ds.data) ? ds.data.slice(0, MAX_POINTS) : []).map((n) => {
        if (type === "scatter" && n && typeof n === "object") {
          const x = Number(n.x), y = Number(n.y);
          return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
        }
        const v = Number(n);
        return Number.isFinite(v) ? v : 0;
      });
      return { label: T(ds && ds.label, 80), data };
    }).filter((ds) => ds.data.length);
    if (!datasets.length) return null;
    return { type, title: T(raw.title, 140), labels, datasets };
  }

  function cleanSlide(raw, i, usedIds) {
    if (!raw || typeof raw !== "object") raw = {};
    let id = T(raw.id, 40).replace(/[^\w-]/g, "");
    if (!id || usedIds.has(id)) id = SF.uid("s");
    usedIds.add(id);
    const slide = {
      id,
      layout: LAYOUTS.includes(raw.layout) ? raw.layout : "bullets",
      title: T(raw.title, 200),
      bullets: (Array.isArray(raw.bullets) ? raw.bullets.slice(0, MAX_BULLETS) : []).map((b) => T(b, 300)).filter(Boolean),
      notes: T(raw.notes, 4000),
      image_prompt: raw.image_prompt ? T(raw.image_prompt, 1500) : null,
      chart_spec: cleanChartSpec(raw.chart_spec),
    };
    /* image_prompt and chart_spec are mutually exclusive; chart wins on chart layout */
    if (slide.chart_spec && slide.image_prompt) {
      if (slide.layout === "chart") slide.image_prompt = null;
      else slide.chart_spec = null;
    }
    if (slide.layout === "chart" && !slide.chart_spec) slide.layout = "bullets";
    if (i === 0 && !slide.title && slide.layout === "title") slide.title = "Untitled";
    return slide;
  }

  /** Validate & clean a raw outline object. Throws Error with .details on hopeless input. */
  function validateOutline(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw Object.assign(new Error("Outline is not a JSON object"), { details: raw });
    }
    let slides = raw.slides;
    if (!Array.isArray(slides) || !slides.length) {
      throw Object.assign(new Error("Outline has no slides[] array"), { details: raw });
    }
    const usedIds = new Set();
    const outline = {
      title: T(raw.title, 300) || "Untitled presentation",
      subtitle: raw.subtitle ? T(raw.subtitle, 300) : null,
      language: T(raw.language, 12) || "en",
      slides: slides.slice(0, MAX_SLIDES).map((s, i) => cleanSlide(s, i, usedIds)),
    };
    return outline;
  }

  function blankSlide(layout) {
    return { id: SF.uid("s"), layout: layout || "bullets", title: "New slide", bullets: [], notes: "", image_prompt: null, chart_spec: null };
  }

  SF.schema = { validateOutline, cleanChartSpec, blankSlide, LAYOUTS, CHART_TYPES };
})(window.SF);
