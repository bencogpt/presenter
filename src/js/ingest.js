/* ============ ingest.js — file upload & text extraction (spec FR-ING) ============ */
"use strict";
(function (SF) {
  const { $, state, t } = SF;
  const MAX_FILE = 20 * 1024 * 1024;
  const MIN_PDF_CHARS = 200; // below this we assume a scanned PDF

  function setStatus(msg, busy) {
    const s = $("#extract-status");
    s.textContent = msg || "";
    s.classList.toggle("busy", !!busy);
  }

  /* ---------- extractors ---------- */
  async function extractDocx(file) {
    const buf = await file.arrayBuffer();
    const result = await window.mammoth.convertToHtml({ arrayBuffer: buf });
    /* HTML → structured text: keep headings as markdown-ish hints (spec FR-ING-2) */
    const doc = new DOMParser().parseFromString(DOMPurify.sanitize(result.value), "text/html");
    const lines = [];
    const walk = (node) => {
      for (const child of node.children) {
        const tag = child.tagName.toLowerCase();
        const text = child.textContent.replace(/\s+/g, " ").trim();
        if (!text) { walk(child); continue; }
        if (/^h[1-6]$/.test(tag)) lines.push("#".repeat(+tag[1]) + " " + text);
        else if (tag === "li") lines.push("- " + text);
        else if (tag === "ul" || tag === "ol" || tag === "table") walk(child);
        else if (tag === "tr") lines.push(Array.from(child.cells || []).map((c) => c.textContent.trim()).join(" | "));
        else lines.push(text);
      }
    };
    walk(doc.body);
    return lines.join("\n");
  }

  async function extractPdf(file) {
    const workerB64 = document.getElementById("vendor-pdfjs-worker").textContent.trim();
    const bin = atob(workerB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const workerBlob = new Blob([bytes], { type: "application/javascript" });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
    const parts = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      setStatus(t("st.pdfPage", { i: p, n: pdf.numPages }), true);
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      let line = [], lastY = null;
      const pageLines = [];
      for (const item of content.items) {
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) { pageLines.push(line.join(" ")); line = []; }
        line.push(item.str);
        lastY = y;
      }
      if (line.length) pageLines.push(line.join(" "));
      parts.push(pageLines.join("\n"));
      await new Promise((r) => setTimeout(r, 0)); // keep UI responsive (NFR-2)
    }
    const text = parts.join("\n\n").replace(/[ \t]+/g, " ").trim();
    if (text.length < MIN_PDF_CHARS) throw new Error(t("err.scannedPdf"));
    return text;
  }

  async function extractText(file) { return await file.text(); }

  /* ---------- intake ---------- */
  async function handleFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE) { SF.toast(t("err.fileTooBig", { size: SF.fmtBytes(file.size) }), "error"); return; }
    const ext = (file.name.match(/\.([^.]+)$/) || [, ""])[1].toLowerCase();
    if (ext === "doc") { SF.toast(t("err.legacyDoc"), "error", 8000); return; }
    try {
      setStatus(t("st.reading", { name: file.name }), true);
      let text;
      if (ext === "docx") text = await extractDocx(file);
      else if (ext === "pdf") text = await extractPdf(file);
      else if (["txt", "md", "markdown"].includes(ext)) text = await extractText(file);
      else throw new Error(t("err.badType", { ext }));
      acceptText(text, file.name);
    } catch (e) {
      setStatus("");
      SF.toast(e.message, "error", 9000);
    }
  }

  function acceptText(text, name) {
    text = SF.cleanText(text).trim();
    if (!text) { setStatus(""); SF.toast(t("err.noText"), "error"); return; }
    state.doc = { name: name || null, text, chars: text.length, chunked: false };
    setStatus("");
    renderDocUI();
    SF.emit("doc-changed");
  }

  function renderDocUI() {
    const doc = state.doc;
    $("#doc-chip").hidden = !doc;
    $("#doc-preview-wrap").hidden = !doc;
    if (!doc) return;
    $("#doc-chip-label").textContent = "📄 " + t("src.loaded", { name: doc.name || t("src.pasted"), chars: doc.chars.toLocaleString() });
    $("#doc-preview").value = doc.text;
    updateChunkNotice();
  }

  function updateChunkNotice() {
    const doc = state.doc;
    if (!doc) return;
    const cap = state.config.charCap;
    const notice = $("#chunk-notice");
    doc.chunked = doc.chars > cap;
    notice.hidden = !doc.chunked;
    if (doc.chunked) notice.textContent = t("src.chunk", { cap: cap.toLocaleString() });
    $("#doc-chip-label").textContent = "📄 " + t("src.loaded", { name: doc.name || t("src.pasted"), chars: doc.chars.toLocaleString() });
  }

  function init() {
    const dz = $("#dropzone");
    const input = $("#file-input");
    dz.addEventListener("click", () => input.click());
    dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", () => handleFile(input.files[0]));
    ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); }));
    dz.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));

    $("#btn-use-pasted").addEventListener("click", () => acceptText($("#paste-area").value, null));

    /* user trims/edits the extracted text before sending (FR-ING-4) */
    $("#doc-preview").addEventListener("input", SF.debounce(() => {
      if (!state.doc) return;
      state.doc.text = $("#doc-preview").value;
      state.doc.chars = state.doc.text.length;
      updateChunkNotice();
    }, 300));

    SF.on("session-cleared", () => { $("#paste-area").value = ""; $("#doc-preview").value = ""; setStatus(""); renderDocUI(); });
    SF.on("config-changed", () => { if (state.doc) updateChunkNotice(); });
    SF.on("lang-changed", () => { if (state.doc) renderDocUI(); });
  }

  SF.ingest = { init };
})(window.SF);
