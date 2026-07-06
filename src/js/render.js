/* ============ render.js — live reveal.js preview in the main stage ============
   Slides are authored on a fixed 1280x720 (16:9) canvas with large type;
   reveal.js scales that canvas to fit ANY window or zoom level with a CSS
   transform, so the design never reflows or breaks.
   The preview re-renders (debounced) on every outline edit, keeping the
   current slide position. */
"use strict";
(function (SF) {
  const { $, el, state } = SF;
  let deck = null;

  /* ---------- slide DOM construction (all content sanitized, spec §7.3) ---------- */
  function bulletsList(bullets, dirAuto) {
    const ul = el("ul");
    for (const b of bullets) {
      const li = el("li");
      if (dirAuto) li.setAttribute("dir", "auto");
      li.appendChild(SF.richTextNode(b));
      ul.appendChild(li);
    }
    return ul;
  }

  function imgNode(slideId, alt) {
    const asset = state.assets[slideId];
    if (asset) return el("img", { src: `data:${asset.mime};base64,${asset.b64}`, alt: alt || "" });
    return null;
  }

  /**
   * Build one <section> per slide.
   * opts.forExport: charts become <img> PNG (unless opts.liveCharts) and
   * placeholders are dropped entirely.
   */
  function buildSlideSection(slide, outline, opts) {
    opts = opts || {};
    const sec = el("section", { class: `sf-slide sf-l-${slide.layout}`, "data-sf-id": slide.id, dir: "auto" });
    const H = (tag, text) => { const h = el(tag, { dir: "auto" }); h.appendChild(SF.richTextNode(text)); return h; };

    switch (slide.layout) {
      case "title": {
        sec.appendChild(H("h1", slide.title || outline.title));
        const sub = slide.bullets[0] || outline.subtitle;
        if (sub) { const d = el("div", { class: "sf-subtitle", dir: "auto" }); d.appendChild(SF.richTextNode(sub)); sec.appendChild(d); }
        break;
      }
      case "section":
        sec.appendChild(H("h2", slide.title));
        break;
      case "quote": {
        const q = el("blockquote", { dir: "auto" });
        q.appendChild(SF.richTextNode(slide.bullets[0] || slide.title));
        sec.appendChild(q);
        if (slide.bullets[1]) { const a = el("div", { class: "sf-attribution", dir: "auto" }); a.appendChild(SF.richTextNode("— " + slide.bullets[1])); sec.appendChild(a); }
        break;
      }
      case "image_full": {
        const img = imgNode(slide.id, slide.image_prompt);
        const cover = el("div", { class: "sf-img-cover" });
        if (img) cover.appendChild(img);
        else if (!opts.forExport) cover.appendChild(el("div", { class: "sf-img-placeholder", text: "🖼 " + (slide.image_prompt || "image") }));
        sec.appendChild(cover);
        if (slide.title) sec.appendChild(H("h2", slide.title));
        break;
      }
      case "bullets_image": {
        sec.appendChild(H("h2", slide.title));
        const body = el("div", { class: "sf-body" });
        body.appendChild(bulletsList(slide.bullets, true));
        const box = el("div", { class: "sf-img-box" });
        const img = imgNode(slide.id, slide.image_prompt);
        if (img) box.appendChild(img);
        else if (!opts.forExport) box.appendChild(el("div", { class: "sf-img-placeholder", text: "🖼 " + (slide.image_prompt || "image") }));
        body.appendChild(box);
        sec.appendChild(body);
        break;
      }
      case "chart": {
        sec.appendChild(H("h2", slide.title));
        const box = el("div", { class: "sf-chart-box" });
        if (slide.chart_spec) {
          if (opts.forExport && !opts.liveCharts) {
            box.appendChild(el("img", { class: "sf-chart-png", alt: slide.chart_spec.title || "chart", src: SF.charts.chartToPngDataUri(slide.chart_spec, state.theme) }));
          } else {
            const canvas = el("canvas", { width: "1140", height: "480", "data-sf-chart": slide.id });
            box.appendChild(canvas);
            if (opts.forExport && opts.liveCharts) canvas.setAttribute("data-sf-chart-spec", JSON.stringify(slide.chart_spec));
          }
        }
        sec.appendChild(box);
        break;
      }
      case "two_column": {
        sec.appendChild(H("h2", slide.title));
        const body = el("div", { class: "sf-body" });
        const half = Math.ceil(slide.bullets.length / 2);
        body.appendChild(bulletsList(slide.bullets.slice(0, half), true));
        body.appendChild(bulletsList(slide.bullets.slice(half), true));
        sec.appendChild(body);
        break;
      }
      default: { // bullets
        sec.appendChild(H("h2", slide.title));
        const body = el("div", { class: "sf-body" });
        body.appendChild(bulletsList(slide.bullets, true));
        sec.appendChild(body);
      }
    }

    if (slide.notes) {
      const aside = el("aside", { class: "notes" });
      aside.appendChild(SF.richTextNode(slide.notes));
      sec.appendChild(aside);
    }
    return sec;
  }

  function hasAutoTitle() {
    const o = state.outline;
    return !o.slides.length || o.slides[0].layout !== "title";
  }

  function buildAllSections(opts) {
    const o = state.outline;
    const frag = document.createDocumentFragment();
    /* auto title slide if the outline doesn't start with one */
    if (hasAutoTitle()) {
      frag.appendChild(buildSlideSection({ id: "auto_title", layout: "title", title: o.title, bullets: o.subtitle ? [o.subtitle] : [], notes: "", image_prompt: null, chart_spec: null }, o, opts));
    }
    for (const s of o.slides) frag.appendChild(buildSlideSection(s, o, opts));
    return frag;
  }

  /* ---------- in-app live preview ---------- */
  async function renderPreview() {
    if (!state.outline) { updateStageVisibility(); return; }
    updateStageVisibility();
    const slidesRoot = $("#reveal-slides");
    const keepIndex = deck ? deck.getIndices().h : 0;
    slidesRoot.textContent = "";
    slidesRoot.appendChild(buildAllSections({ forExport: false }));

    if (!deck) {
      deck = new window.Reveal($("#reveal-root"), {
        embedded: true,
        width: 1280, height: 720, margin: 0.02,   // 16:9, scales to any window/zoom
        minScale: 0.05, maxScale: 4,
        hash: false, center: false,
        slideNumber: "c/t",
        keyboardCondition: "focused",
        plugins: [window.RevealNotes],
      });
      await deck.initialize();
      deck.on("slidechanged", (ev) => {
        const id = ev.currentSlide && ev.currentSlide.getAttribute("data-sf-id");
        if (id) SF.editor.markActive(id);
      });
    } else {
      deck.sync();
      deck.slide(Math.min(keepIndex, deck.getTotalSlides() - 1));
    }
    applyTheme();
    renderVisibleCharts();
  }
  const renderPreviewDebounced = SF.debounce(renderPreview, 500);

  function updateStageVisibility() {
    const has = !!state.outline;
    $("#preview-empty").hidden = has;
    $("#preview-frame").hidden = !has;
    $("#preview-keys").hidden = !has;
  }

  function goToSlide(slideId) {
    if (!deck) return;
    const offset = hasAutoTitle() ? 1 : 0;
    const idx = state.outline.slides.findIndex((s) => s.id === slideId);
    if (idx >= 0) deck.slide(idx + offset);
  }

  function applyTheme() {
    const vp = $("#reveal-root").closest(".reveal-viewport") || $("#reveal-root");
    vp.setAttribute("data-sf-theme", state.theme);
    if (deck) renderVisibleCharts();
  }

  function renderVisibleCharts() {
    for (const canvas of document.querySelectorAll("#reveal-slides canvas[data-sf-chart]")) {
      const id = canvas.getAttribute("data-sf-chart");
      const slide = state.outline.slides.find((s) => s.id === id);
      if (slide && slide.chart_spec) SF.charts.renderChart(canvas, slide.chart_spec, state.theme, { fontSize: 22 });
    }
  }

  /* ---------- present mode ---------- */
  function present() {
    const frame = $("#preview-frame");
    if (frame.requestFullscreen) frame.requestFullscreen();
    $("#reveal-root").focus();
  }

  function init() {
    $("#btn-present").addEventListener("click", present);
    SF.on("theme-changed", applyTheme);
    SF.on("outline-edited", renderPreviewDebounced);
    SF.on("outline-replaced", renderPreviewDebounced);
    SF.on("session-cleared", updateStageVisibility);
  }

  SF.render = { init, renderPreview, buildAllSections, buildSlideSection, goToSlide, getDeck: () => deck };
})(window.SF);
