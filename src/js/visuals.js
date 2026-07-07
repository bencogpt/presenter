/* ============ visuals.js — image generation dialog (spec FR-IMG) ============
   ADAPTER NOTE (OQ-1): the API contract is assumed OpenAI-images-style.
   If your OpenShift AI runtime serves a different contract (e.g. ComfyUI),
   swap out generateImage() below — everything else stays unchanged. */
"use strict";
(function (SF) {
  const { $, el, state, t } = SF;
  let stopRequested = false;
  let running = false;

  /* Liberal base64-image finder: FastAPI wrappers name the field freely
     (image / images[0] / b64 / b64_json / data[0].b64_json / result / output /
     a data: URI). Checks common keys first, then scans for any base64-looking
     string ≥1 KB. */
  function findB64(json) {
    const b64ish = (v, minLen) => typeof v === "string" && (v.startsWith("data:image") || (v.length >= minLen && /^[A-Za-z0-9+/=\r\n]+$/.test(v.slice(0, 200))));
    /* known keys: any plausible base64 counts; deep scan: long strings only
       (avoids mistaking ids/hashes for images) */
    const looksB64 = (v) => b64ish(v, 1000);
    const direct = [
      json && json.data && json.data[0] && (json.data[0].b64_json || json.data[0].b64),
      json && json.image, json && json.b64, json && json.b64_json, json && json.result, json && json.output,
      Array.isArray(json && json.images) ? (typeof json.images[0] === "string" ? json.images[0] : json.images[0] && (json.images[0].b64_json || json.images[0].image)) : null,
    ];
    for (const v of direct) if (b64ish(v, 50)) return v;
    const stack = [json];
    let depth = 0;
    while (stack.length && depth++ < 200) {
      const cur = stack.pop();
      if (!cur || typeof cur !== "object") continue;
      for (const v of Object.values(cur)) {
        if (looksB64(v)) return v;
        if (v && typeof v === "object") stack.push(v);
      }
    }
    return null;
  }

  function sizeWH(sizeStr) {
    const m = String(sizeStr || "").match(/(\d+)\s*[xX×]\s*(\d+)/);
    return m ? { width: +m[1], height: +m[2] } : { width: 1344, height: 768 };
  }

  /** Call the image model. Returns { mime, b64 }. Sequential use only (spec §7.5).
      Two API styles (Settings → Image model → API style):
      - "openai":  POST {base}/v1/images/generations, OpenAI images body
      - "fastapi": POST {base}{fluxPath}, body { prompt, width, height } */
  async function generateImage(prompt, opts) {
    opts = opts || {};
    const c = state.config;
    if (!c.fluxBase) throw new Error(t("err.imgNotConfigured"));
    const size = opts.size || c.imageSize || "1344x768";
    let url, body;
    if (c.fluxApi === "fastapi") {
      url = c.fluxBase + (c.fluxPath || "/generate_image");
      const { width, height } = sizeWH(size);
      body = JSON.stringify({ prompt, width, height });
    } else {
      url = c.fluxBase + "/v1/images/generations";
      body = JSON.stringify({ model: c.fluxModel || "flux2", prompt, size, n: 1, response_format: "b64_json" });
    }
    const doCall = async () => {
      const r = await SF.llm.rawFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(c.fluxToken ? { Authorization: "Bearer " + c.fluxToken } : {}) },
        body,
      }, opts.timeoutS || Math.max(state.config.timeoutS, 180));
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) throw Object.assign(new Error(t("err.imgToken", { status: r.status })), { tokenProblem: true });
        if (r.status === 404 || r.status === 405 || r.status === 501) throw Object.assign(new Error(t("cfg.noImgApi", { status: r.status })), { notImageApi: true });
        throw Object.assign(new Error(t("err.imgStatus", { status: r.status })), { detail: await r.text().catch(() => "") });
      }
      const ct = r.headers.get("content-type") || "";
      if (ct.startsWith("image/") || ct.includes("octet-stream")) { /* raw bytes (FastAPI Response/FileResponse) */
        const buf = new Uint8Array(await r.arrayBuffer());
        let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        return { mime: ct.startsWith("image/") ? ct.split(";")[0] : "image/png", b64: btoa(bin) };
      }
      const json = await r.json();
      const b64 = findB64(json);
      if (!b64) throw Object.assign(new Error(t("err.imgShape")), { detail: JSON.stringify(json).slice(0, 1500) });
      const dataUri = String(b64).match(/^data:(image\/[\w+.-]+);base64,(.*)$/s);
      if (dataUri) return { mime: dataUri[1], b64: dataUri[2].replace(/\s+/g, "") };
      return { mime: "image/png", b64: String(b64).replace(/^data:[^,]+,/, "").replace(/\s+/g, "") };
    };
    try { return await doCall(); }
    catch (e) {
      if (e.tokenProblem || e.name === "SyntaxError") throw e;
      if (e.name === "AbortError") throw new Error(t("err.imgTimeout"));
      if (e.name === "TypeError") throw new Error(t("err.imgUnreachable"));
      throw e;
    }
  }

  function fullPrompt(slide) {
    const prefix = (state.config.stylePrefix || "").trim();
    return (prefix ? prefix + ", " : "") + slide.image_prompt;
  }

  /* ---------- dialog UI ---------- */
  function openDialog() {
    renderList();
    const dlg = $("#dlg-visuals");
    if (!dlg.open) dlg.showModal();
  }

  function renderList() {
    const wrap = $("#visuals-list");
    wrap.textContent = "";
    const slides = (state.outline ? state.outline.slides : []).filter((s) => s.image_prompt);
    if (!slides.length) {
      wrap.appendChild(el("p", { class: "muted", text: t("vis.none") }));
      return;
    }
    slides.forEach((slide) => wrap.appendChild(renderRow(slide)));
  }

  function renderRow(slide) {
    const idx = state.outline.slides.indexOf(slide) + 1;
    const asset = state.assets[slide.id];
    const row = el("div", { class: "visual-row", "data-id": slide.id });
    const thumb = el("div", { class: "thumb-box" }, asset
      ? el("img", { alt: "", src: `data:${asset.mime};base64,${asset.b64}` })
      : t("vis.noImg"));
    const prompt = el("textarea", { rows: "3", "aria-label": "Image prompt", dir: "auto" });
    prompt.value = slide.image_prompt || "";
    prompt.addEventListener("input", () => { slide.image_prompt = prompt.value.trim() || null; });
    const status = el("span", { class: "visual-status", text: asset ? (asset.kind === "user_image" ? t("vis.own") : t("vis.ok")) : "" });
    if (asset) status.classList.add("ok");

    const genBtn = el("button", { class: "mini", text: asset ? t("vis.retry") : t("vis.gen"), onclick: () => generateOne(slide, row).then(() => SF.emit("outline-edited")).catch(() => {}) });
    const rmBtn = el("button", { class: "mini", text: t("vis.rm"), onclick: () => { delete state.assets[slide.id]; renderList(); SF.emit("outline-edited"); } });
    const right = el("div", {}, [
      el("div", { class: "label", text: t("vis.slide", { n: idx, title: slide.title || "…" }) }),
      prompt,
      el("div", { class: "row" }, [genBtn, asset ? rmBtn : null, status]),
    ]);
    row.appendChild(thumb);
    row.appendChild(right);
    return row;
  }

  async function generateOne(slide, row) {
    row.classList.add("busy");
    const status = row.querySelector(".visual-status");
    if (status) { status.className = "visual-status"; status.textContent = t("vis.busy"); }
    try {
      const img = await generateImage(fullPrompt(slide));
      state.assets[slide.id] = { kind: "image", mime: img.mime, b64: img.b64 };
      renderList();
    } catch (e) {
      if (status) { status.textContent = "✘ " + e.message; status.classList.add("fail"); }
      row.classList.remove("busy");
      throw e;
    }
  }

  /* sequential batch generation with progress (FR-IMG-2, §7.5) */
  async function generateAll() {
    if (running) return;
    running = true; stopRequested = false;
    $("#btn-gen-all-images").hidden = true;
    $("#btn-stop-images").hidden = false;
    const progress = $("#img-progress");
    const targets = state.outline.slides.filter((s) => s.image_prompt && !state.assets[s.id]);
    let done = 0, failed = 0;
    for (const slide of targets) {
      if (stopRequested) break;
      progress.textContent = t("vis.progress", { i: done + failed + 1, n: targets.length });
      progress.classList.add("busy");
      const row = document.querySelector(`.visual-row[data-id="${slide.id}"]`);
      try { await generateOne(slide, row || $("#visuals-list")); done++; }
      catch (e) { failed++; if (e.tokenProblem) break; }
    }
    progress.classList.remove("busy");
    progress.textContent = stopRequested
      ? t("vis.stopped", { n: done })
      : t("vis.doneAll", { ok: done, failed: failed ? t("vis.failedPart", { n: failed }) : "" });
    $("#btn-gen-all-images").hidden = false;
    $("#btn-stop-images").hidden = true;
    running = false;
    SF.emit("outline-edited"); // refresh preview with new images
  }

  function init() {
    $("#btn-gen-all-images").addEventListener("click", generateAll);
    $("#btn-stop-images").addEventListener("click", () => { stopRequested = true; SF.llm.cancelActive(); });
    SF.on("lang-changed", () => { if ($("#dlg-visuals").open) renderList(); });
  }

  SF.visuals = { init, renderList, generateImage, openDialog };
})(window.SF);
