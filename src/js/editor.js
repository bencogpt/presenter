/* ============ editor.js — outline review & editing (spec FR-EDIT) ============ */
"use strict";
(function (SF) {
  const { $, $$, el, state } = SF;
  const LAYOUT_LABELS = {
    title: "Title", bullets: "Bullets", bullets_image: "Bullets + image", image_full: "Full image",
    chart: "Chart", two_column: "Two columns", quote: "Quote", section: "Section divider",
  };

  /* snapshot BEFORE a text edit burst: capture pre-state once per burst */
  let burstActive = false;
  function beforeTextEdit() {
    if (!burstActive) { SF.history.snapshot(); burstActive = true; setTimeout(() => (burstActive = false), 900); }
  }
  /* call AFTER mutating; snapshot() must be called BEFORE the mutation */
  function structuralChange() { renderCards(); }

  /* ---------- card rendering ---------- */
  function renderCards() {
    const wrap = $("#slide-cards");
    wrap.textContent = "";
    const o = state.outline;
    if (!o) return;
    $("#deck-title").value = o.title || "";
    $("#deck-subtitle").value = o.subtitle || "";
    o.slides.forEach((slide, idx) => wrap.appendChild(renderCard(slide, idx)));
    updateUndoButtons();
  }

  function renderCard(slide, idx) {
    const card = el("div", { class: "slide-card", draggable: "false", "data-id": slide.id });

    /* head: handle, number, layout, actions */
    const layoutSel = el("select", {
      onchange: () => { beforeTextEdit(); slide.layout = layoutSel.value; renderCards(); },
    }, SF.schema.LAYOUTS.map((l) => {
      const opt = el("option", { value: l, text: LAYOUT_LABELS[l] });
      if (l === slide.layout) opt.selected = true;
      return opt;
    }));
    const handle = el("span", { class: "drag-handle", title: "Drag to reorder", text: "⠿" });
    handle.addEventListener("mousedown", () => card.setAttribute("draggable", "true"));
    card.addEventListener("dragend", () => card.setAttribute("draggable", "false"));

    const head = el("div", { class: "slide-card-head" }, [
      handle,
      el("span", { class: "slide-num", text: String(idx + 1) }),
      layoutSel,
      el("span", { class: "spacer" }),
      el("button", { class: "mini", text: "✦ Regenerate", title: "Ask the model to redo this slide", onclick: () => regenerate(slide, card) }),
      el("button", { class: "mini", text: "⧉", title: "Duplicate", onclick: () => {
        SF.history.snapshot();
        const copy = JSON.parse(JSON.stringify(slide)); copy.id = SF.uid("s");
        state.outline.slides.splice(idx + 1, 0, copy); structuralChange();
      } }),
      el("button", { class: "mini", text: "✕", title: "Delete slide", onclick: () => {
        SF.history.snapshot();
        state.outline.slides.splice(idx, 1);
        delete state.assets[slide.id];
        structuralChange();
      } }),
    ]);
    card.appendChild(head);

    /* title */
    const titleInput = el("input", { type: "text", class: "slide-title-input", value: slide.title, placeholder: "Slide title", "aria-label": "Slide title" });
    titleInput.addEventListener("input", () => { beforeTextEdit(); slide.title = titleInput.value; });
    card.appendChild(titleInput);

    /* bullets */
    if (!["title", "section", "image_full"].includes(slide.layout)) {
      const list = el("div");
      const renderBullets = () => {
        list.textContent = "";
        slide.bullets.forEach((b, bi) => {
          const input = el("input", { type: "text", value: b, "aria-label": `Bullet ${bi + 1}` });
          input.addEventListener("input", () => { beforeTextEdit(); slide.bullets[bi] = input.value; });
          list.appendChild(el("div", { class: "bullet-row" }, [
            input,
            el("button", { class: "mini", text: "↑", title: "Move up", onclick: () => { if (bi > 0) { beforeTextEdit(); [slide.bullets[bi - 1], slide.bullets[bi]] = [slide.bullets[bi], slide.bullets[bi - 1]]; renderBullets(); } } }),
            el("button", { class: "mini", text: "↓", title: "Move down", onclick: () => { if (bi < slide.bullets.length - 1) { beforeTextEdit(); [slide.bullets[bi + 1], slide.bullets[bi]] = [slide.bullets[bi], slide.bullets[bi + 1]]; renderBullets(); } } }),
            el("button", { class: "mini", text: "✕", title: "Remove", onclick: () => { beforeTextEdit(); slide.bullets.splice(bi, 1); renderBullets(); } }),
          ]));
        });
        list.appendChild(el("button", { class: "mini", text: "＋ bullet", onclick: () => { beforeTextEdit(); slide.bullets.push(""); renderBullets(); const inputs = list.querySelectorAll("input"); if (inputs.length) inputs[inputs.length - 1].focus(); } }));
      };
      renderBullets();
      card.appendChild(el("div", { class: "card-section" }, [el("div", { class: "label", text: slide.layout === "quote" ? "Quote (first line) + attribution (second)" : "Bullets (supports **bold**, *italic*, `code`)" }), list]));
    }

    /* visual: image prompt / chart editor (mutually exclusive, spec §5.1) */
    if (slide.layout === "chart") card.appendChild(chartEditor(slide));
    else if (["bullets_image", "image_full", "bullets", "two_column"].includes(slide.layout)) card.appendChild(imageEditor(slide));

    /* speaker notes */
    const notes = el("textarea", { class: "notes-input", rows: "2", placeholder: "Speaker notes (only you see these)", "aria-label": "Speaker notes" });
    notes.value = slide.notes || "";
    notes.addEventListener("input", () => { beforeTextEdit(); slide.notes = notes.value; });
    card.appendChild(el("div", { class: "card-section" }, [el("div", { class: "label", text: "Speaker notes" }), notes]));

    /* drag & drop reorder (FR-EDIT-2) */
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/sf-slide", slide.id);
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", (e) => {
      if (!e.dataTransfer.types.includes("text/sf-slide")) return;
      e.preventDefault();
      const before = e.offsetY < card.offsetHeight / 2;
      card.classList.toggle("dragover-above", before);
      card.classList.toggle("dragover-below", !before);
    });
    card.addEventListener("dragleave", () => card.classList.remove("dragover-above", "dragover-below"));
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("dragover-above", "dragover-below");
      const draggedId = e.dataTransfer.getData("text/sf-slide");
      if (!draggedId || draggedId === slide.id) return;
      const slides = state.outline.slides;
      const from = slides.findIndex((s) => s.id === draggedId);
      if (from < 0) return;
      SF.history.snapshot();
      const [moved] = slides.splice(from, 1);
      let to = slides.findIndex((s) => s.id === slide.id);
      if (e.offsetY >= card.offsetHeight / 2) to += 1;
      slides.splice(to, 0, moved);
      structuralChange();
    });

    return card;
  }

  /* ---------- image prompt editor (FR-EDIT-3, FR-IMG-5) ---------- */
  function imageEditor(slide) {
    const box = el("div", { class: "card-section" });
    box.appendChild(el("div", { class: "label", text: "Image (generated by Flux2 in step 5, or upload your own)" }));
    const asset = state.assets[slide.id];
    if (asset) {
      box.appendChild(el("img", { class: "asset-thumb", alt: "Slide image", src: `data:${asset.mime};base64,${asset.b64}` }));
      box.appendChild(el("button", { class: "mini", text: "Remove image", onclick: () => { delete state.assets[slide.id]; structuralChange(); } }));
    }
    const prompt = el("textarea", { rows: "2", placeholder: "Image prompt for Flux2 (leave empty for no image)" });
    prompt.value = slide.image_prompt || "";
    prompt.addEventListener("input", () => { beforeTextEdit(); slide.image_prompt = prompt.value.trim() || null; slide.chart_spec = null; });
    box.appendChild(prompt);
    const up = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp" });
    up.addEventListener("change", async () => {
      const f = up.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { SF.toast("Image too large (max 8 MB).", "error"); return; }
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      state.assets[slide.id] = { kind: "user_image", mime: f.type || "image/png", b64: btoa(bin) };
      structuralChange();
    });
    box.appendChild(el("label", { class: "check" }, ["Upload own image: ", up]));
    return box;
  }

  /* ---------- chart data editor (FR-EDIT-3: simple table-of-data) ---------- */
  function chartEditor(slide) {
    if (!slide.chart_spec) slide.chart_spec = { type: "bar", title: "", labels: ["A", "B", "C"], datasets: [{ label: "Series 1", data: [1, 2, 3] }] };
    const spec = slide.chart_spec;
    const box = el("div", { class: "card-section" });
    box.appendChild(el("div", { class: "label", text: "Chart data (rendered locally by Chart.js — never by the image model)" }));

    const typeSel = el("select", {}, SF.schema.CHART_TYPES.map((t) => {
      const o = el("option", { value: t, text: t });
      if (t === spec.type) o.selected = true;
      return o;
    }));
    typeSel.addEventListener("change", () => { beforeTextEdit(); spec.type = typeSel.value; });
    const chartTitle = el("input", { type: "text", value: spec.title || "", placeholder: "Chart title" });
    chartTitle.addEventListener("input", () => { beforeTextEdit(); spec.title = chartTitle.value; });
    box.appendChild(el("div", { class: "row" }, [typeSel, chartTitle]));

    const table = el("table", { class: "chart-mini-table" });
    const rebuild = () => {
      table.textContent = "";
      const headRow = el("tr", {}, [el("th", { text: "Series ╲ Labels" })]);
      spec.labels.forEach((lab, li) => {
        const inp = el("input", { value: lab, "aria-label": `Label ${li + 1}` });
        inp.addEventListener("input", () => { beforeTextEdit(); spec.labels[li] = inp.value; });
        headRow.appendChild(el("th", {}, inp));
      });
      headRow.appendChild(el("th", {}, el("button", { class: "mini", text: "＋ col", onclick: () => {
        beforeTextEdit(); spec.labels.push("…"); spec.datasets.forEach((d) => d.data.push(0)); rebuild();
      } })));
      table.appendChild(headRow);

      spec.datasets.forEach((ds, di) => {
        const row = el("tr");
        const nameInp = el("input", { value: ds.label || "", "aria-label": `Series ${di + 1} name` });
        nameInp.addEventListener("input", () => { beforeTextEdit(); ds.label = nameInp.value; });
        row.appendChild(el("td", {}, nameInp));
        spec.labels.forEach((_, li) => {
          const v = ds.data[li];
          const cell = el("input", { value: v == null ? "" : (typeof v === "object" ? `${v.x};${v.y}` : String(v)), inputmode: "decimal", "aria-label": `Value` });
          cell.addEventListener("input", () => {
            beforeTextEdit();
            if (spec.type === "scatter" && cell.value.includes(";")) {
              const [x, y] = cell.value.split(";").map(Number);
              ds.data[li] = { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
            } else ds.data[li] = Number(cell.value) || 0;
          });
          row.appendChild(el("td", {}, cell));
        });
        row.appendChild(el("td", {}, el("button", { class: "mini", text: "✕", title: "Remove series", onclick: () => { beforeTextEdit(); spec.datasets.splice(di, 1); rebuild(); } })));
        table.appendChild(row);
      });
      const foot = el("tr");
      foot.appendChild(el("td", {}, el("button", { class: "mini", text: "＋ series", onclick: () => {
        beforeTextEdit(); spec.datasets.push({ label: "Series " + (spec.datasets.length + 1), data: spec.labels.map(() => 0) }); rebuild();
      } })));
      table.appendChild(foot);
    };
    rebuild();
    box.appendChild(table);
    return box;
  }

  /* ---------- per-slide regeneration (FR-LLM-5) ---------- */
  async function regenerate(slide, card) {
    const btns = card.querySelectorAll("button, input, select, textarea");
    btns.forEach((b) => (b.disabled = true));
    SF.toast("Regenerating slide…");
    try {
      const fresh = await SF.llm.regenerateSlide(slide, state.outline, "");
      const i = state.outline.slides.findIndex((s) => s.id === slide.id);
      if (i >= 0) { SF.history.snapshot(); state.outline.slides[i] = fresh; renderCards(); SF.toast("Slide regenerated.", "ok"); }
    } catch (e) {
      SF.toast(e.message, "error", 8000);
      btns.forEach((b) => (b.disabled = false));
    }
  }

  function updateUndoButtons() {
    $("#btn-undo").disabled = !SF.history.canUndo();
    $("#btn-redo").disabled = !SF.history.canRedo();
  }

  function init() {
    $("#deck-title").addEventListener("input", () => { beforeTextEdit(); if (state.outline) state.outline.title = $("#deck-title").value; });
    $("#deck-subtitle").addEventListener("input", () => { beforeTextEdit(); if (state.outline) state.outline.subtitle = $("#deck-subtitle").value || null; });
    $("#btn-add-slide").addEventListener("click", () => {
      SF.history.snapshot();
      state.outline.slides.push(SF.schema.blankSlide());
      structuralChange();
    });
    $("#btn-undo").addEventListener("click", () => { SF.history.undo(); });
    $("#btn-redo").addEventListener("click", () => { SF.history.redo(); });
    document.addEventListener("keydown", (e) => {
      if (state.step !== 4 || e.target.matches("input, textarea, select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); SF.history.undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); SF.history.redo(); }
    });
    SF.on("outline-replaced", renderCards);
    SF.on("undo-changed", updateUndoButtons);

    /* the explicit approval gate (FR-EDIT-5 / G3) */
    $("#btn-approve").addEventListener("click", () => {
      if (!state.outline || !state.outline.slides.length) { SF.toast("Nothing to build — the outline is empty.", "error"); return; }
      state.approved = true;
      const hasImagePrompts = state.outline.slides.some((s) => s.image_prompt && !state.assets[s.id]);
      SF.app.goto(hasImagePrompts && state.config.fluxBase ? 5 : 6);
    });

    const themeSync = (e) => {
      state.theme = e.target.value;
      $("#theme-select").value = state.theme;
      $("#theme-select-2").value = state.theme;
      SF.emit("theme-changed");
    };
    $("#theme-select").addEventListener("change", themeSync);
    $("#theme-select-2").addEventListener("change", themeSync);
  }

  SF.editor = { init, renderCards };
})(window.SF);
