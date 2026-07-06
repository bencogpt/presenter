/* ============ util.js — DOM helpers, sanitization, misc ============ */
"use strict";
window.SF = window.SF || {};

(function (SF) {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Create an element: el('div', {class:'x', onclick:fn}, [children|string]) */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else node.setAttribute(k, v);
      }
    }
    if (children != null) {
      for (const c of Array.isArray(children) ? children : [children]) {
        if (c == null) continue;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  /* ---------- sanitization (SECURITY-critical, see spec §7.3) ----------
     Plain strings from the LLM / documents / project files must go into
     the DOM via textContent (el(...,{text})). Where light rich text is
     wanted (bullets), richTextNode() escapes everything, applies a tiny
     markdown subset, then runs DOMPurify with a tight allowlist. */
  const PURIFY_OPTS = {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "ul", "ol", "li", "br", "code"],
    ALLOWED_ATTR: [],
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /** Escaped + md-lite (**bold**, *italic*, `code`) + DOMPurify. Returns a <span>. */
  function richTextNode(s) {
    let h = escapeHtml(String(s == null ? "" : s));
    h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
         .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
         .replace(/`([^`]+)`/g, "<code>$1</code>");
    const span = document.createElement("span");
    span.innerHTML = DOMPurify.sanitize(h, PURIFY_OPTS);
    return span;
  }

  /** Force any value to a clean plain-text string (strips control chars). */
  function cleanText(v, maxLen) {
    let s = String(v == null ? "" : v);
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }

  /* ---------- misc ---------- */
  let uidCounter = 0;
  const uid = (prefix) => `${prefix || "id"}_${Date.now().toString(36)}_${(++uidCounter).toString(36)}`;

  function debounce(fn, ms) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }

  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function downloadFile(name, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Heuristic: does this text read right-to-left? */
  function isRtl(s) {
    const m = String(s || "").match(/[֐-ࣿיִ-﷿ﹰ-﻿]/g);
    return !!m && m.length > String(s).replace(/\s/g, "").length * 0.3;
  }

  /* ---------- toasts / modal ---------- */
  function toast(msg, kind, ms) {
    const region = $("#toast-region");
    const t = el("div", { class: "toast " + (kind || ""), text: msg });
    region.appendChild(t);
    setTimeout(() => t.remove(), ms || 4500);
  }

  /** confirm dialog → Promise<boolean> */
  function confirmDialog(message, okLabel) {
    return new Promise((resolve) => {
      const backdrop = $("#modal-backdrop");
      const body = $("#modal-body");
      const btns = $("#modal-buttons");
      body.textContent = "";
      body.appendChild(el("p", { text: message }));
      btns.textContent = "";
      const close = (val) => { backdrop.hidden = true; resolve(val); };
      btns.appendChild(el("button", { class: "btn", text: "Cancel", onclick: () => close(false) }));
      const ok = el("button", { class: "btn btn-primary", text: okLabel || "OK", onclick: () => close(true) });
      btns.appendChild(ok);
      backdrop.hidden = false;
      ok.focus();
    });
  }

  Object.assign(SF, { $, $$, el, escapeHtml, richTextNode, cleanText, uid, debounce, fmtBytes, downloadFile, isRtl, toast, confirmDialog, PURIFY_OPTS });
})(window.SF);
