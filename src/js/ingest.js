/* ============ ingest.js — file upload & text extraction (spec FR-ING) ============ */
"use strict";
(function (SF) {
  const { $, state } = SF;
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
      setStatus(`Extracting PDF page ${p}/${pdf.numPages}…`, true);
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
    if (text.length < MIN_PDF_CHARS) {
      throw new Error("Almost no text found in this PDF — it is probably scanned images. OCR is not supported; export the source as text or docx instead.");
    }
    return text;
  }

  async function extractText(file) { return await file.text(); }

  /* ---------- intake ---------- */
  async function handleFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE) { SF.toast(`File is ${SF.fmtBytes(file.size)} — max 20 MB.`, "error"); return; }
    const ext = (file.name.match(/\.([^.]+)$/) || [, ""])[1].toLowerCase();
    if (ext === "doc") { SF.toast("Legacy .doc isn't supported. Open it in Word and save as .docx, then retry.", "error", 8000); return; }
    try {
      setStatus(`Reading ${file.name}…`, true);
      let text;
      if (ext === "docx") text = await extractDocx(file);
      else if (ext === "pdf") text = await extractPdf(file);
      else if (["txt", "md", "markdown"].includes(ext)) text = await extractText(file);
      else throw new Error("Unsupported file type ." + ext + " — use .docx, .pdf, .md or .txt");
      acceptText(text, file.name);
    } catch (e) {
      setStatus("");
      SF.toast(e.message, "error", 9000);
    }
  }

  function acceptText(text, name) {
    text = SF.cleanText(text).trim();
    if (!text) { setStatus(""); SF.toast("No text could be extracted from this file.", "error"); return; }
    state.doc = { name: name || "pasted text", text, chars: text.length, chunked: false };
    setStatus(`✔ ${name || "Text"} loaded`);
    renderPreview();
    SF.emit("doc-changed");
  }

  function renderPreview() {
    const wrap = $("#doc-preview-wrap");
    const doc = state.doc;
    if (!doc) { wrap.hidden = true; $("#btn-to-generate").disabled = true; return; }
    wrap.hidden = false;
    $("#doc-preview").value = doc.text;
    updateStats();
    $("#btn-to-generate").disabled = false;
  }

  function updateStats() {
    const doc = state.doc;
    const cap = state.config.charCap;
    $("#doc-stats").textContent = `— ${doc.chars.toLocaleString()} characters`;
    const notice = $("#chunk-notice");
    if (doc.chars > cap) {
      doc.chunked = true;
      notice.hidden = false;
      notice.textContent = `This document exceeds the ${cap.toLocaleString()}-character cap. It will be summarized in sections first (map-reduce), then outlined — generation takes several model calls and a bit longer.`;
    } else {
      doc.chunked = false;
      notice.hidden = true;
    }
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

    $("#btn-use-pasted").addEventListener("click", () => acceptText($("#paste-area").value, "pasted text"));

    /* user trims/edits the extracted text before sending (FR-ING-4) */
    $("#doc-preview").addEventListener("input", SF.debounce(() => {
      if (!state.doc) return;
      state.doc.text = $("#doc-preview").value;
      state.doc.chars = state.doc.text.length;
      updateStats();
    }, 300));

    $("#btn-to-generate").addEventListener("click", () => SF.app.goto(3));
    SF.on("session-cleared", () => { $("#paste-area").value = ""; $("#doc-preview").value = ""; setStatus(""); renderPreview(); });
    SF.on("config-changed", () => { if (state.doc) updateStats(); });
  }

  SF.ingest = { init };
})(window.SF);
