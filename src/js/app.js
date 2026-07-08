/* ============ app.js — workspace controller, dialogs, language, boot ============
   No wizard: the main stage always shows the live preview (or an empty
   state); the sidebar loads the document and edits slides; settings /
   images / export live in dialogs. */
"use strict";
(function (SF) {
  const { $, $$, el, state, t } = SF;

  /* Reveal progressive sections of the UI as the user advances. */
  function updateUI() {
    const hasDoc = !!state.doc;
    const hasOutline = !!state.outline;
    $("#side-generate").hidden = !hasDoc && !hasOutline;
    $("#side-slides").hidden = !hasOutline;
    $("#edit-actions").hidden = !hasOutline;
    $("#deck-actions").hidden = !hasOutline;
    $("#btn-generate").textContent = t(hasOutline ? "gen.redo" : "gen.go");
    if (hasOutline) $("#theme-select").value = state.theme;
  }

  /* ---------- outline generation ---------- */
  let generating = false;

  async function runGenerate() {
    if (generating || !state.doc) return;
    if (!SF.config.isLlmConfigured()) { SF.config.openDialog(); SF.toast(t("cfg.needLlm"), "error"); return; }
    if (state.outline) {
      const ok = await SF.confirmDialog(t("gen.confirmRedo"), t("gen.redo"));
      if (!ok) return;
    }
    generating = true;
    const status = $("#gen-status");
    const errBox = $("#gen-error");
    const t0 = performance.now();
    errBox.hidden = true;
    $("#btn-generate").disabled = true;
    $("#btn-cancel-generate").hidden = false;
    status.classList.add("busy");

    const ticker = setInterval(() => {
      const secs = Math.round((performance.now() - t0) / 1000);
      status.textContent = (status.dataset.msg || "") + ` (${secs}s)`;
    }, 1000);
    const onStatus = (msg) => { status.dataset.msg = msg; status.textContent = msg; };

    try {
      SF.config.readForm();
      state.gen = {
        slideCount: $("#gen-count").value,
        tone: $("#gen-tone").value,
        language: $("#gen-lang").value,
        visuals: $("#gen-visuals").value,
        source: $("#gen-source").value,
      };
      const { outline, sourceText } = await SF.llm.generateOutline(state.doc.text, state.gen, onStatus);
      state.lastSourceText = sourceText;
      state.outline = outline;
      state.approved = true; // live preview = continuous review; generation/export stay explicit
      SF.history.resetHistory();
      onStatus(t("st.ready", { n: outline.slides.length }));
      SF.emit("outline-replaced");
      updateUI();
      /* offer image generation if the outline suggests images and Flux is configured */
      if (state.config.fluxBase && outline.slides.some((s) => s.image_prompt)) SF.visuals.openDialog();
    } catch (e) {
      onStatus("");
      /* always leave a persistent note in the sidebar error box (the toast
         and dialog can be dismissed; this stays until the next attempt) */
      errBox.hidden = false;
      $("#gen-error-msg").textContent = e.message;
      $("#gen-error-detail").textContent = e.rawOutput || e.detail || "—";
      if (e.rawOutput) {
        /* manual-fix editor (FR-LLM-2 / FR-ERR-3) */
        SF.toast(e.message, "error", 10000);
        $("#json-fix-area").value = e.rawOutput;
        $("#dlg-jsonfix").showModal();
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
      state.approved = true;
      SF.history.resetHistory();
      $("#dlg-jsonfix").close();
      SF.emit("outline-replaced");
      updateUI();
    } catch (e) {
      SF.toast(t("jf.still", { msg: e.message }), "error", 7000);
    }
  }

  /* ---------- browser support check (FR-ERR-4) ---------- */
  function browserOk() {
    try {
      return typeof fetch === "function" && typeof FileReader === "function" &&
        typeof structuredClone === "function" &&
        !!document.createElement("canvas").getContext("2d") &&
        typeof AbortController === "function" &&
        typeof HTMLDialogElement === "function";
    } catch (e) { return false; }
  }

  function boot() {
    if (!browserOk()) {
      SF.i18n.applyStatic();
      $("#unsupported-banner").hidden = false;
      return;
    }

    /* UI language: DEFAULT_CONFIG.uiLang > saved choice > browser language */
    const forced = (window.DEFAULT_CONFIG || {}).uiLang;
    SF.i18n.setLang(forced || SF.i18n.initialLang());

    /* slide count selector: auto + 5..40 (FR-LLM-4) */
    const count = $("#gen-count");
    for (let i = 5; i <= 40; i++) count.appendChild(el("option", { value: String(i), text: String(i) }));

    SF.config.init();
    SF.ingest.init();
    SF.editor.init();
    SF.render.init();
    SF.visuals.init();
    SF.exporter.init();

    /* header actions */
    $("#btn-open-settings").addEventListener("click", SF.config.openDialog);
    $("#btn-images").addEventListener("click", SF.visuals.openDialog);
    $("#btn-export").addEventListener("click", SF.exporter.openDialog);
    $("#btn-lang").addEventListener("click", () => {
      SF.i18n.setLang(SF.i18n.getLang() === "he" ? "en" : "he");
    });
    $("#theme-select").addEventListener("change", (e) => {
      state.theme = e.target.value;
      SF.emit("theme-changed");
    });
    $("#btn-clear-session").addEventListener("click", async () => {
      const ok = await SF.confirmDialog(t("cl.confirm"), t("cl.btn"));
      if (!ok) return;
      SF.clearSession();
      updateUI();
      SF.toast(t("cl.done"), "ok");
    });

    /* generation */
    $("#btn-generate").addEventListener("click", runGenerate);
    $("#btn-cancel-generate").addEventListener("click", () => SF.llm.cancelActive());
    $("#btn-json-fix").addEventListener("click", manualJsonFix);

    /* generic dialog close buttons ([data-close]) */
    $$("dialog .dlg-close, dialog [data-close]").forEach((btn) => {
      btn.addEventListener("click", () => btn.closest("dialog").close());
    });

    SF.on("doc-changed", updateUI);
    SF.on("lang-changed", updateUI);
    SF.on("session-cleared", updateUI);
    updateUI();

    /* first run: model not configured yet → open the settings dialog */
    if (!SF.config.isLlmConfigured()) SF.config.openDialog();
  }

  SF.app = { updateUI, boot };
  document.addEventListener("DOMContentLoaded", boot);
})(window.SF);
