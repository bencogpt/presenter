/* ============ config.js — settings, token handling, connectivity tests ============ */
"use strict";
(function (SF) {
  const { $, state } = SF;
  const LS_CFG = "slideforge.config";
  const LS_TOK = "slideforge.tokens";

  const FIELDS = [
    ["cfg-llm-base", "llmBase"], ["cfg-llm-model", "llmModel"], ["cfg-llm-token", "llmToken"],
    ["cfg-flux-base", "fluxBase"], ["cfg-flux-model", "fluxModel"], ["cfg-flux-token", "fluxToken"],
    ["cfg-timeout", "timeoutS"], ["cfg-max-tokens", "maxTokens"], ["cfg-char-cap", "charCap"],
    ["cfg-image-size", "imageSize"], ["cfg-style-prefix", "stylePrefix"], ["cfg-system-prompt", "systemPrompt"],
  ];
  const NUMERIC = { timeoutS: [10, 600, 120], maxTokens: [256, 32768, 4096], charCap: [5000, 500000, 60000] };

  function normBase(url) {
    return String(url || "").trim().replace(/\/+$/, "").replace(/\/v1$/, "");
  }

  function loadInitial() {
    const dc = window.DEFAULT_CONFIG || {};
    for (const k of ["llmBase", "llmModel", "fluxBase", "fluxModel", "imageSize", "timeoutS", "maxTokens", "charCap", "stylePrefix"]) {
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
    if (!c.systemPrompt) $("#cfg-system-prompt").value = SF.llmDefaults.systemPrompt;
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
    if (c.systemPrompt.trim() === SF.llmDefaults.systemPrompt.trim()) c.systemPrompt = "";
    c.persistConfig = $("#cfg-persist").checked;
    c.persistTokens = c.persistConfig && $("#cfg-persist-tokens").checked;
    persist();
    updateHttpWarning();
    SF.emit("config-changed");
  }

  function updateHttpWarning() {
    const c = state.config;
    const insecure = [c.llmBase, c.fluxBase].some((u) => /^http:\/\//i.test(u));
    $("#http-warning").hidden = !insecure;
  }

  /* ---------- connectivity tests (spec FR-CFG-2) ---------- */
  async function testLlm() {
    const out = $("#llm-test-result");
    out.className = "test-result"; out.textContent = "Testing…";
    readForm();
    try {
      const t0 = performance.now();
      await SF.llm.chat([{ role: "user", content: "Reply with the single word: pong" }], { maxTokens: 8, timeoutS: 30 });
      out.textContent = `✔ OK (${Math.round(performance.now() - t0)} ms)`;
      out.classList.add("ok");
    } catch (e) {
      out.textContent = "✘ " + e.message;
      out.classList.add("fail");
    }
  }

  async function testFlux() {
    const out = $("#flux-test-result");
    out.className = "test-result"; out.textContent = "Testing…";
    readForm();
    const c = state.config;
    if (!c.fluxBase) { out.textContent = "✘ No base URL set"; out.classList.add("fail"); return; }
    try {
      /* cheap probe first (OpenAI-style /v1/models), tiny image as fallback */
      const r = await SF.llm.rawFetch(c.fluxBase + "/v1/models", {
        headers: c.fluxToken ? { Authorization: "Bearer " + c.fluxToken } : {},
      }, 20);
      if (r.ok) { out.textContent = "✔ Endpoint reachable"; out.classList.add("ok"); return; }
      if (r.status === 401 || r.status === 403) throw new Error("Token rejected (" + r.status + ")");
      /* fall through to image probe */
      await SF.visuals.generateImage("test pattern, minimal", { size: "256x256", timeoutS: 60 });
      out.textContent = "✔ OK (test image generated)";
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

  function init() {
    loadInitial();
    fillForm();
    updateHttpWarning();
    for (const [id] of FIELDS) $("#" + id).addEventListener("change", readForm);
    $("#cfg-persist").addEventListener("change", () => {
      const on = $("#cfg-persist").checked;
      $("#cfg-persist-tokens").disabled = !on;
      if (!on) $("#cfg-persist-tokens").checked = false;
      readForm();
    });
    $("#cfg-persist-tokens").addEventListener("change", async () => {
      if ($("#cfg-persist-tokens").checked) {
        const ok = await SF.confirmDialog(
          "Store API tokens in this browser's localStorage? Anyone with access to this machine account could read them. Never enable this on a shared computer.",
          "I understand — store tokens");
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
    $("#btn-setup-done").addEventListener("click", () => {
      readForm();
      if (!isLlmConfigured()) { SF.toast("Set the LLM base URL and model name first.", "error"); return; }
      SF.app.goto(2);
    });
    SF.on("session-cleared", () => { fillForm(); persist(); });
  }

  SF.config = { init, readForm, fillForm, isLlmConfigured };
})(window.SF);
