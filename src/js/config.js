/* ============ config.js — settings dialog, token handling, connectivity tests ============
   Configuration lives in the ⚙ Settings dialog (auto-opened on first run),
   never as a wizard step. */
"use strict";
(function (SF) {
  const { $, state, t } = SF;
  const LS_CFG = "slideforge.config";
  const LS_TOK = "slideforge.tokens";

  const FIELDS = [
    ["cfg-llm-base", "llmBase"], ["cfg-llm-model", "llmModel"], ["cfg-llm-token", "llmToken"],
    ["cfg-flux-base", "fluxBase"], ["cfg-flux-model", "fluxModel"], ["cfg-flux-token", "fluxToken"],
    ["cfg-flux-api", "fluxApi"], ["cfg-flux-path", "fluxPath"],
    ["cfg-timeout", "timeoutS"], ["cfg-max-tokens", "maxTokens"], ["cfg-char-cap", "charCap"],
    ["cfg-image-size", "imageSize"], ["cfg-style-prefix", "stylePrefix"], ["cfg-system-prompt", "systemPrompt"],
  ];
  const NUMERIC = { timeoutS: [10, 600, 120], maxTokens: [256, 131072, 8192], charCap: [5000, 500000, 60000] };

  function normBase(url) {
    return String(url || "").trim().replace(/\/+$/, "").replace(/\/v1$/, "");
  }

  function loadInitial() {
    const dc = window.DEFAULT_CONFIG || {};
    for (const k of ["llmBase", "llmModel", "fluxBase", "fluxModel", "fluxApi", "fluxPath", "imageSize", "timeoutS", "maxTokens", "charCap", "stylePrefix"]) {
      if (dc[k] != null && dc[k] !== "") state.config[k] = dc[k];
    }
    try {
      const saved = JSON.parse(localStorage.getItem(LS_CFG) || "null");
      if (saved && typeof saved === "object") {
        delete saved.llmToken; delete saved.fluxToken; // belt & suspenders: tokens never come from this key
        Object.assign(state.config, saved);
        state.config.persistConfig = true;
      }
      const tok = JSON.parse(localStorage.getItem(LS_TOK) || "null");
      if (tok && typeof tok === "object") {
        state.config.llmToken = String(tok.llmToken || "");
        state.config.fluxToken = String(tok.fluxToken || "");
        state.config.persistTokens = true;
      }
    } catch (e) { /* localStorage unavailable (some file:// setups) — memory only */ }
  }

  function persist() {
    const c = state.config;
    try {
      if (c.persistConfig) {
        const { llmToken, fluxToken, persistConfig, persistTokens, ...rest } = c;
        localStorage.setItem(LS_CFG, JSON.stringify(rest));
      } else localStorage.removeItem(LS_CFG);
      if (c.persistConfig && c.persistTokens) {
        localStorage.setItem(LS_TOK, JSON.stringify({ llmToken: c.llmToken, fluxToken: c.fluxToken }));
      } else localStorage.removeItem(LS_TOK);
    } catch (e) { /* ignore */ }
  }

  function fillForm() {
    const c = state.config;
    for (const [id, key] of FIELDS) $("#" + id).value = c[key] ?? "";
    updateFluxRows();
    if (!c.systemPrompt) $("#cfg-system-prompt").value = SF.llmDefaults.systemPrompt;
    $("#cfg-json-mode").checked = !!c.jsonMode;
    $("#cfg-persist").checked = c.persistConfig;
    $("#cfg-persist-tokens").checked = c.persistTokens;
    $("#cfg-persist-tokens").disabled = !c.persistConfig;
  }

  function readForm() {
    const c = state.config;
    for (const [id, key] of FIELDS) {
      let v = $("#" + id).value;
      if (key in NUMERIC) {
        const [min, max, dflt] = NUMERIC[key];
        v = Math.min(max, Math.max(min, parseInt(v, 10) || dflt));
      } else v = String(v).trim();
      c[key] = v;
    }
    c.llmBase = normBase(c.llmBase);
    c.fluxBase = normBase(c.fluxBase);
    if (!["openai", "fastapi"].includes(c.fluxApi)) c.fluxApi = "openai";
    c.fluxPath = "/" + String(c.fluxPath || "/generate_image").trim().replace(/^\/+/, "");
    updateFluxRows();
    if (c.systemPrompt.trim() === SF.llmDefaults.systemPrompt.trim()) c.systemPrompt = "";
    c.jsonMode = $("#cfg-json-mode").checked;
    c.persistConfig = $("#cfg-persist").checked;
    c.persistTokens = c.persistConfig && $("#cfg-persist-tokens").checked;
    persist();
    updateHttpWarning();
    SF.emit("config-changed");
  }

  function updateFluxRows() {
    const fastapi = state.config.fluxApi === "fastapi";
    $("#flux-path-row").hidden = !fastapi;
    $("#flux-model-row").hidden = fastapi;
  }

  function updateHttpWarning() {
    const c = state.config;
    const insecure = [c.llmBase, c.fluxBase].some((u) => /^http:\/\//i.test(u));
    $("#http-warning").hidden = !insecure;
  }

  /* ---------- connectivity tests (spec FR-CFG-2) ---------- */
  async function testLlm() {
    const out = $("#llm-test-result");
    out.className = "test-result"; out.textContent = t("cfg.testing");
    readForm();
    try {
      const t0 = performance.now();
      /* generous max_tokens: reasoning models may spend a small budget before
         emitting any content, which is fine — a valid chat response is the test */
      await SF.llm.chat([{ role: "user", content: "Reply with the single word: pong" }], { maxTokens: 64, timeoutS: 45 });
      out.textContent = t("cfg.testOk", { ms: Math.round(performance.now() - t0) });
      out.classList.add("ok");
    } catch (e) {
      out.textContent = "✘ " + e.message;
      out.classList.add("fail");
    }
  }

  async function testFlux() {
    const out = $("#flux-test-result");
    out.className = "test-result"; out.textContent = t("cfg.testingImg");
    readForm();
    const c = state.config;
    if (!c.fluxBase) { out.textContent = t("cfg.noUrl"); out.classList.add("fail"); return; }
    try {
      /* The only proof this is really an image endpoint is generating an
         image — a /v1/models probe would also succeed on a text-model URL. */
      await SF.visuals.generateImage("test pattern, minimal", { size: "256x256", timeoutS: 90 });
      out.textContent = t("cfg.testImg");
      out.classList.add("ok");
    } catch (e) {
      out.textContent = "✘ " + e.message;
      out.classList.add("fail");
    }
  }

  function isLlmConfigured() {
    const c = state.config;
    return !!(c.llmBase && c.llmModel);
  }

  function openDialog() {
    fillForm();
    const dlg = $("#dlg-settings");
    if (!dlg.open) dlg.showModal();
  }

  function init() {
    loadInitial();
    fillForm();
    updateHttpWarning();
    for (const [id] of FIELDS) $("#" + id).addEventListener("change", readForm);
    $("#cfg-json-mode").addEventListener("change", readForm);
    $("#cfg-persist").addEventListener("change", () => {
      const on = $("#cfg-persist").checked;
      $("#cfg-persist-tokens").disabled = !on;
      if (!on) $("#cfg-persist-tokens").checked = false;
      readForm();
    });
    $("#cfg-persist-tokens").addEventListener("change", async () => {
      if ($("#cfg-persist-tokens").checked) {
        const ok = await SF.confirmDialog(t("cfg.tokenConfirm"), t("cfg.tokenBtn"));
        if (!ok) $("#cfg-persist-tokens").checked = false;
      }
      readForm();
    });
    $("#btn-test-llm").addEventListener("click", testLlm);
    $("#btn-test-flux").addEventListener("click", testFlux);
    $("#btn-reset-prompt").addEventListener("click", (e) => {
      e.preventDefault();
      $("#cfg-system-prompt").value = SF.llmDefaults.systemPrompt;
      readForm();
    });
    $("#btn-settings-done").addEventListener("click", () => {
      readForm();
      if (!isLlmConfigured()) { SF.toast(t("cfg.needLlm"), "error"); return; }
      $("#dlg-settings").close();
    });
    $("#dlg-settings").addEventListener("close", readForm);
    SF.on("session-cleared", () => { fillForm(); persist(); });
  }

  SF.config = { init, readForm, fillForm, isLlmConfigured, openDialog };
})(window.SF);
