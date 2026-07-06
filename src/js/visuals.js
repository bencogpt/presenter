/* ============ visuals.js — Flux2 image generation step (spec FR-IMG) ============
   ADAPTER NOTE (OQ-1): the API contract is assumed OpenAI-images-style.
   If your OpenShift AI runtime serves a different contract (e.g. ComfyUI),
   swap out generateImage() below — everything else stays unchanged. */
"use strict";
(function (SF) {
  const { $, el, state } = SF;
  let stopRequested = false;
  let running = false;

  /** Call Flux2. Returns { mime, b64 }. Sequential use only (spec §7.5). */
  async function generateImage(prompt, opts) {
    opts = opts || {};
    const c = state.config;
    if (!c.fluxBase) throw new Error("Image endpoint not configured — open Settings.");
    const body = JSON.stringify({
      model: c.fluxModel || "flux2",
      prompt,
      size: opts.size || c.imageSize || "1344x768",
      n: 1,
      response_format: "b64_json",
    });
    const doCall = async () => {
      const r = await SF.llm.rawFetch(c.fluxBase + "/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(c.fluxToken ? { Authorization: "Bearer " + c.fluxToken } : {}) },
        body,
      }, opts.timeoutS || Math.max(state.config.timeoutS, 180));
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) throw Object.assign(new Error("Token rejected (" + r.status + ") — check the Flux2 token in Settings."), { tokenProblem: true });
        throw Object.assign(new Error("Image endpoint returned " + r.status), { detail: await r.text().catch(() => "") });
      }
      const ct = r.headers.get("content-type") || "";
      if (ct.startsWith("image/")) { /* some runtimes return raw bytes */
        const buf = new Uint8Array(await r.arrayBuffer());
        let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        return { mime: ct.split(";")[0], b64: btoa(bin) };
      }
      const json = await r.json();
      const d = json && json.data && json.data[0];
      const b64 = (d && (d.b64_json || d.b64)) || (Array.isArray(json.images) ? (typeof json.images[0] === "string" ? json.images[0] : json.images[0] && json.images[0].b64_json) : null);
      if (!b64) throw Object.assign(new Error("Image endpoint response not understood (no b64 image found)."), { detail: JSON.stringify(json).slice(0, 1500) });
      return { mime: "image/png", b64: String(b64).replace(/^data:[^,]+,/, "") };
    };
    try { return await doCall(); }
    catch (e) {
      if (e.tokenProblem || e.name === "SyntaxError") throw e;
      if (e.name === "AbortError") throw new Error("Image request timed out.");
      if (e.name === "TypeError") throw new Error("Image endpoint unreachable — check URL/CORS in Settings.");
      throw e;
    }
  }

  function fullPrompt(slide) {
    const prefix = (state.config.stylePrefix || "").trim();
    return (prefix ? prefix + ", " : "") + slide.image_prompt;
  }

  /* ---------- step-5 UI ---------- */
  function renderList() {
    const wrap = $("#visuals-list");
    wrap.textContent = "";
    const slides = (state.outline ? state.outline.slides : []).filter((s) => s.image_prompt);
    if (!slides.length) {
      wrap.appendChild(el("p", { class: "muted", text: "No slides have an image prompt. Add prompts in the editor, or continue." }));
      return;
    }
    slides.forEach((slide, i) => wrap.appendChild(renderRow(slide, i)));
  }

  function renderRow(slide) {
    const idx = state.outline.slides.indexOf(slide) + 1;
    const asset = state.assets[slide.id];
    const row = el("div", { class: "visual-row", "data-id": slide.id });
    const thumb = el("div", { class: "thumb-box" }, asset
      ? el("img", { alt: "", src: `data:${asset.mime};base64,${asset.b64}` })
      : "no image yet");
    const prompt = el("textarea", { rows: "3", "aria-label": "Image prompt" });
    prompt.value = slide.image_prompt || "";
    prompt.addEventListener("input", () => { slide.image_prompt = prompt.value.trim() || null; });
    const status = el("span", { class: "visual-status", text: asset ? (asset.kind === "user_image" ? "✔ your upload" : "✔ generated") : "" });
    if (asset) status.classList.add("ok");

    const genBtn = el("button", { class: "mini", text: asset ? "↻ Retry / regenerate" : "✦ Generate", onclick: () => generateOne(slide, row) });
    const rmBtn = el("button", { class: "mini", text: "✕ Remove image", onclick: () => { delete state.assets[slide.id]; renderList(); } });
    const right = el("div", {}, [
      el("div", { class: "label", text: `Slide ${idx}: ${slide.title || "(untitled)"}` }),
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
    status.className = "visual-status";
    status.textContent = "generating…";
    try {
      const img = await generateImage(fullPrompt(slide));
      state.assets[slide.id] = { kind: "image", mime: img.mime, b64: img.b64 };
      renderList();
    } catch (e) {
      status.textContent = "✘ " + e.message;
      status.classList.add("fail");
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
      progress.textContent = `Generating image ${done + failed + 1} of ${targets.length}…`;
      progress.classList.add("busy");
      const row = document.querySelector(`.visual-row[data-id="${slide.id}"]`);
      try { await generateOne(slide, row || $("#visuals-list")); done++; }
      catch (e) { failed++; if (e.tokenProblem) break; }
    }
    progress.classList.remove("busy");
    progress.textContent = stopRequested ? `Stopped — ${done} generated.` : `Done: ${done} generated${failed ? `, ${failed} failed (retry individually)` : ""}.`;
    $("#btn-gen-all-images").hidden = false;
    $("#btn-stop-images").hidden = true;
    running = false;
  }

  function init() {
    $("#btn-gen-all-images").addEventListener("click", generateAll);
    $("#btn-stop-images").addEventListener("click", () => { stopRequested = true; SF.llm.cancelActive(); });
    $("#btn-skip-visuals").addEventListener("click", () => SF.app.goto(6));
  }

  SF.visuals = { init, renderList, generateImage };
})(window.SF);
