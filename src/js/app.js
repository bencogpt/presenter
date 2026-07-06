/* ============ app.js — wizard navigation, generate step, boot ============ */
"use strict";
(function (SF) {
  const { $, $$, el, state } = SF;

  /* ---------- wizard ---------- */
  function stepAvailable(n) {
    switch (n) {
      case 1: case 2: return true;
      case 3: return !!state.doc;
      case 4: return !!state.outline;
      case 5: case 6: case 7: return !!state.outline && state.approved;
      default: return false;
    }
  }

  function goto(n) {
    if (!stepAvailable(n)) return;
    state.step = n;
    for (let i = 1; i <= 7; i++) $("#panel-" + i).hidden = i !== n;
    $$("#stepbar .step").forEach((btn) => {
      const s = +btn.dataset.step;
      btn.disabled = !stepAvailable(s);
      btn.classList.toggle("done", s < n && stepAvailable(s));
      if (s === n) btn.setAttribute("aria-current", "step");
      else btn.removeAttribute("aria-current");
    });
    /* per-step side effects */
    if (n === 4) SF.editor.renderCards();
    if (n === 5) SF.visuals.renderList();
    if (n === 6) SF.render.renderPreview();
    if (n === 7) SF.exporter.updateSizeWarning();
    document.querySelector("#panel-" + n + " h1")?.focus?.();
    window.scrollTo(0, 0);
  }

  /* ---------- step 3: outline generation ---------- */
  let generating = false;

  async function runGenerate() {
    if (generating || !state.doc) return;
    generating = true;
    const status = $("#gen-status");
    const errBox = $("#gen-error");
    const t0 = performance.now();
    errBox.hidden = true;
    $("#json-fix-wrap").hidden = true;
    $("#btn-generate").disabled = true;
    $("#btn-cancel-generate").hidden = false;
    status.classList.add("busy");

    const ticker = setInterval(() => {
      const secs = Math.round((performance.now() - t0) / 1000);
      status.textContent = status.dataset.msg + ` (${secs}s)`;
    }, 1000);
    const onStatus = (msg) => { status.dataset.msg = msg; status.textContent = msg; };

    try {
      SF.config.readForm();
      state.gen = {
        slideCount: $("#gen-count").value,
        tone: $("#gen-tone").value,
        language: $("#gen-lang").value,
        visuals: $("#gen-visuals").value,
      };
      const { outline, sourceText } = await SF.llm.generateOutline(state.doc.text, state.gen, onStatus);
      state.lastSourceText = sourceText;
      state.outline = outline;
      state.approved = false;
      SF.history.resetHistory();
      onStatus(`✔ Outline ready: ${outline.slides.length} slides.`);
      SF.emit("outline-replaced");
      goto(4);
    } catch (e) {
      onStatus("");
      if (e.rawOutput) {
        /* manual-fix editor (FR-LLM-2 / FR-ERR-3) */
        $("#json-fix-wrap").hidden = false;
        $("#json-fix-area").value = e.rawOutput;
      } else {
        errBox.hidden = false;
        $("#gen-error-msg").textContent = e.message;
        $("#gen-error-detail").textContent = e.detail || "(no further details)";
      }
    } finally {
      clearInterval(ticker);
      status.classList.remove("busy");
      $("#btn-generate").disabled = false;
      $("#btn-cancel-generate").hidden = true;
      generating = false;
    }
  }

  function manualJsonFix() {
    try {
      const outline = SF.schema.validateOutline(SF.llm.extractJson($("#json-fix-area").value));
      state.outline = outline;
      state.approved = false;
      SF.history.resetHistory();
      $("#json-fix-wrap").hidden = true;
      SF.emit("outline-replaced");
      goto(4);
    } catch (e) {
      SF.toast("Still not valid: " + e.message, "error", 7000);
    }
  }

  /* ---------- browser support check (FR-ERR-4) ---------- */
  function browserOk() {
    try {
      return typeof fetch === "function" && typeof FileReader === "function" &&
        typeof structuredClone === "function" &&
        !!document.createElement("canvas").getContext("2d") &&
        typeof AbortController === "function";
    } catch (e) { return false; }
  }

  function boot() {
    if (!browserOk()) {
      $("#unsupported-banner").hidden = false;
      return;
    }

    /* slide count selector: auto + 5..40 (FR-LLM-4) */
    const count = $("#gen-count");
    for (let i = 5; i <= 40; i++) count.appendChild(el("option", { value: String(i), text: String(i) }));

    SF.config.init();
    SF.ingest.init();
    SF.editor.init();
    SF.render.init();
    SF.visuals.init();
    SF.exporter.init();

    $$("#stepbar .step").forEach((btn) => btn.addEventListener("click", () => goto(+btn.dataset.step)));
    $$("[data-goto]").forEach((btn) => btn.addEventListener("click", () => goto(+btn.dataset.goto)));
    $("#btn-open-settings").addEventListener("click", () => goto(1));
    $("#btn-generate").addEventListener("click", runGenerate);
    $("#btn-cancel-generate").addEventListener("click", () => SF.llm.cancelActive());
    $("#btn-json-fix").addEventListener("click", manualJsonFix);
    $("#btn-clear-session").addEventListener("click", async () => {
      const ok = await SF.confirmDialog("Clear session? This wipes tokens, document text, outline and all generated images from memory (and stored tokens, if any).", "Clear everything");
      if (!ok) return;
      SF.clearSession();
      goto(SF.config.isLlmConfigured() ? 2 : 1);
      SF.toast("Session cleared.", "ok");
    });

    /* step 1 auto-skipped once configured (spec §4) */
    goto(SF.config.isLlmConfigured() ? 2 : 1);
  }

  SF.app = { goto, boot };
  document.addEventListener("DOMContentLoaded", boot);
})(window.SF);
