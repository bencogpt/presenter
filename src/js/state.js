/* ============ state.js — central store + undo history ============ */
"use strict";
(function (SF) {
  const state = {
    step: 1,
    /* config: tokens live ONLY here (JS closure-ish memory), never persisted
       unless the user double-opts-in (see config.js / spec §7.2) */
    config: {
      llmBase: "", llmModel: "", llmToken: "",
      fluxBase: "", fluxModel: "flux2", fluxToken: "",
      imageSize: "1344x768",
      timeoutS: 120, maxTokens: 4096, charCap: 60000,
      stylePrefix: "",
      systemPrompt: "",           // empty = built-in default (llm.js)
      persistConfig: false, persistTokens: false,
    },
    doc: null,        // { name, text, chars, chunked }
    gen: { slideCount: "auto", tone: "business", language: "auto", visuals: "light" },
    outline: null,    // schema §5.1 (validated)
    assets: {},       // slideId -> { kind: "image"|"user_image", mime, b64 }
    theme: "corporate",
    deckOpts: { transition: "slide", fragments: false },
    approved: false,
    version: (document.querySelector('meta[name="sf-version"]') || {}).content || "dev",
  };

  const listeners = {};
  function on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); }
  function emit(event, data) { (listeners[event] || []).forEach((fn) => fn(data)); }

  /* ---------- undo/redo for the outline (spec FR-EDIT-4) ---------- */
  const UNDO_MAX = 50;
  let undoStack = [], redoStack = [];

  function snapshot() {
    if (!state.outline) return;
    undoStack.push(JSON.stringify(state.outline));
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack = [];
    emit("undo-changed");
  }
  function undo() {
    if (!undoStack.length) return false;
    redoStack.push(JSON.stringify(state.outline));
    state.outline = JSON.parse(undoStack.pop());
    emit("outline-replaced");
    emit("undo-changed");
    return true;
  }
  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(JSON.stringify(state.outline));
    state.outline = JSON.parse(redoStack.pop());
    emit("outline-replaced");
    emit("undo-changed");
    return true;
  }
  function resetHistory() { undoStack = []; redoStack = []; emit("undo-changed"); }

  function clearSession() {
    state.config.llmToken = "";
    state.config.fluxToken = "";
    state.doc = null;
    state.outline = null;
    state.assets = {};
    state.approved = false;
    resetHistory();
    try { localStorage.removeItem("slideforge.tokens"); } catch (e) { /* private mode */ }
    emit("session-cleared");
  }

  SF.state = state;
  SF.on = on;
  SF.emit = emit;
  SF.history = { snapshot, undo, redo, resetHistory, canUndo: () => undoStack.length > 0, canRedo: () => redoStack.length > 0 };
  SF.clearSession = clearSession;
})(window.SF);
