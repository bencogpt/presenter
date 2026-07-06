/* ============ editor.js — slide cards in the sidebar (spec FR-EDIT) ============
   Every mutation emits "outline-edited" so the live preview in the main
   stage refreshes (debounced in render.js). Clicking a card navigates the
   preview to that slide. */
"use strict";
(function (SF) {
  const { $, $$, el, state, t } = SF;

  /* snapshot BEFORE a text edit burst: capture pre-state once per burst */
  let burstActive = false;
  function beforeTextEdit() {
    if (!burstActive) { SF.history.snapshot(); burstActive = true; setTimeout(() => (burstActive = false), 900); }
  }
  function edited() { SF.emit("outline-edited"); }
  /* call AFTER mutating; snapshot() must be called BEFORE the mutation */
  function structuralChange() { renderCards(); edited(); }

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

  function markActive(id) {
    $$("#slide-cards .slide-card").forEach((c) => c.classList.toggle("active", c.dataset.id === id));
  }

  function renderCard(slide, idx) {
    const card = el("div", { class: "slide-card", draggable: "false", "data-id": slide.id });

    /* clicking a card jumps the live preview to that slide */
    card.addEventListener("click", () => { markActive(slide.id); SF.render.goToSlide(slide.id); });

    /* head: handle, number, layout, actions */
    const layoutSel = el("select", {
      "aria-label": "Layout",
      onchange: () => { beforeTextEdit(); slide.layout = layoutSel.value; structuralChange(); },
    }, SF.schema.LAYOUTS.map((l) => {
      const opt = el("option", { value: l, text: t("layout." + l) });
      if (l === slide.layout) opt.selected = true;
      return opt;
    }));
    const handle = el("span", { class: "drag-handle", title: t("card.drag"), text: "⠿" });
    handle.addEventListener("mousedown", () => card.setAttribute("draggable", "true"));
    card.addEventListener("dragend", () => card.setAttribute("draggable", "false"));

    if (slide.skip) card.classList.add("skipped");
    const head = el("div", { class: "slide-card-head" }, [
      handle,
      el("span", { class: "slide-num", text: String(idx + 1) }),
      layoutSel,
      el("span", { class: "spacer" }),
      el("button", { class: "mini", text: slide.skip ? "🚫" : "👁", title: t(slide.skip ? "card.show" : "card.hide"), onclick: (e) => {
        e.stopPropagation();
        SF.history.snapshot();
        slide.skip = !slide.skip;
        structuralChange();
      } }),
      el("button", { class: "mini", text: t("card.regen"), title: t("card.regenTitle"), onclick: () => regenerate(slide, card) }),
      el("button", { class: "mini", text: "⧉", title: t("card.dup"), onclick: () => {
        SF.history.snapshot();
        const copy = JSON.parse(JSON.stringify(slide)); copy.id = SF.uid("s");
        state.outline.slides.splice(idx + 1, 0, copy); structuralChange();
      } }),
      el("button", { class: "mini", text: "✕", title: t("card.del"), onclick: () => {
        SF.history.snapshot();
        state.outline.slides.splice(idx, 1);
        delete state.assets[slide.id];
        structuralChange();
      } }),
    ]);
    card.appendChild(head);

    /* title */
    const titleInput = el("input", { type: "text", class: "slide-title-input", value: slide.title, placeholder: t("sl.titlePh"), "aria-label": t("sl.titlePh"), dir: "auto" });
    titleInput.addEventListener("input", () => { beforeTextEdit(); slide.title = titleInput.value; edited(); });
    card.appendChild(titleInput);

    /* bullets */
    if (!["title", "section", "image_full"].includes(slide.layout)) {
      const list = el("div");
      const renderBullets = () => {
        list.textContent = "";
        slide.bullets.forEach((b, bi) => {
          const input = el("input", { type: "text", value: b, "aria-label": `Bullet ${bi + 1}`, dir: "auto" });
          input.addEventListener("input", () => { beforeTextEdit(); slide.bullets[bi] = input.value; edited(); });
          list.appendChild(el("div", { class: "bullet-row" }, [
            input,
            el("button", { class: "mini", text: "↑", title: t("card.up"), onclick: () => { if (bi > 0) { beforeTextEdit(); [slide.bullets[bi - 1], slide.bullets[bi]] = [slide.bullets[bi], slide.bullets[bi - 1]]; renderBullets(); edited(); } } }),
            el("button", { class: "mini", text: "↓", title: t("card.down"), onclick: () => { if (bi < slide.bullets.length - 1) { beforeTextEdit(); [slide.bullets[bi + 1], slide.bullets[bi]] = [slide.bullets[bi], slide.bullets[bi + 1]]; renderBullets(); edited(); } } }),
            el("button", { class: "mini", text: "✕", title: t("card.rm"), onclick: () => { beforeTextEdit(); slide.bullets.splice(bi, 1); renderBullets(); edited(); } }),
          ]));
        });
        list.appendChild(el("button", { class: "mini", text: t("card.addBullet"), onclick: () => { beforeTextEdit(); slide.bullets.push(""); renderBullets(); const inputs = list.querySelectorAll("input"); if (inputs.length) inputs[inputs.length - 1].focus(); } }));
      };
      renderBullets();
      card.appendChild(el("div", { class: "card-section" }, [
        el("div", { class: "label", text: slide.layout === "quote" ? t("card.quote") : t("card.bullets") }), list,
      ]));
    }

    /* visual: image prompt / chart editor (mutually exclusive, spec §5.1), collapsed by default */
    let visual = null, visualLabel = "";
    if (slide.layout === "chart") { visual = chartEditor(slide); visualLabel = t("layout.chart"); }
    else if (["bullets_image", "image_full", "bullets", "two_column"].includes(slide.layout)) {
      visual = imageEditor(slide); visualLabel = t("card.image");
    }
    if (visual) {
      const det = el("details", { class: "card-details" }, [el("summary", { text: visualLabel }), visual]);
      if (slide.layout === "chart" || slide.layout === "image_full" || slide.layout === "bullets_image" || state.assets[slide.id]) det.open = true;
      card.appendChild(det);
    }

    /* speaker notes (collapsed) */
    const notes = el("textarea", { class: "notes-input", rows: "2", placeholder: t("card.notesPh"), "aria-label": t("card.notes"), dir: "auto" });
    notes.value = slide.notes || "";
    notes.addEventListener("input", () => { beforeTextEdit(); slide.notes = notes.value; edited(); });
    const notesDet = el("details", { class: "card-details" }, [el("summary", { text: t("card.notes") }), notes]);
    if (slide.notes) notesDet.open = true;
    card.appendChild(notesDet);

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
    const asset = state.assets[slide.id];
    if (asset) {
      box.appendChild(el("img", { class: "asset-thumb", alt: "", src: `data:${asset.mime};base64,${asset.b64}` }));
      box.appendChild(el("button", { class: "mini", text: t("card.rmImage"), onclick: () => { delete state.assets[slide.id]; structuralChange(); } }));
    }
    const prompt = el("textarea", { rows: "2", placeholder: t("card.imagePh"), dir: "auto" });
    prompt.value = slide.image_prompt || "";
    prompt.addEventListener("input", () => { beforeTextEdit(); slide.image_prompt = prompt.value.trim() || null; slide.chart_spec = null; });
    box.appendChild(prompt);
    const up = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp" });
    up.addEventListener("change", async () => {
      const f = up.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { SF.toast(t("err.imgTooBig"), "error"); return; }
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      state.assets[slide.id] = { kind: "user_image", mime: f.type || "image/png", b64: btoa(bin) };
      structuralChange();
    });
    box.appendChild(el("label", { class: "check" }, [t("card.upload") + " ", up]));
    return box;
  }

  /* ---------- chart data editor (FR-EDIT-3: simple table-of-data) ---------- */
  function chartEditor(slide) {
    if (!slide.chart_spec) slide.chart_spec = { type: "bar", title: "", labels: ["A", "B", "C"], datasets: [{ label: "1", data: [1, 2, 3] }] };
    const spec = slide.chart_spec;
    const box = el("div", { class: "card-section" });
    box.appendChild(el("div", { class: "label", text: t("card.chart") }));

    const typeSel = el("select", {}, SF.schema.CHART_TYPES.map((ct) => {
      const o = el("option", { value: ct, text: ct });
      if (ct === spec.type) o.selected = true;
      return o;
    }));
    typeSel.addEventListener("change", () => { beforeTextEdit(); spec.type = typeSel.value; edited(); });
    const chartTitle = el("input", { type: "text", value: spec.title || "", placeholder: t("card.chartTitlePh"), dir: "auto" });
    chartTitle.addEventListener("input", () => { beforeTextEdit(); spec.title = chartTitle.value; edited(); });
    box.appendChild(el("div", { class: "row" }, [typeSel, chartTitle]));

    const table = el("table", { class: "chart-mini-table" });
    const rebuild = () => {
      table.textContent = "";
      const headRow = el("tr", {}, [el("th", { text: t("card.series") })]);
      spec.labels.forEach((lab, li) => {
        const inp = el("input", { value: lab, "aria-label": `Label ${li + 1}`, dir: "auto" });
        inp.addEventListener("input", () => { beforeTextEdit(); spec.labels[li] = inp.value; edited(); });
        headRow.appendChild(el("th", {}, inp));
      });
      headRow.appendChild(el("th", {}, el("button", { class: "mini", text: t("card.addCol"), onclick: () => {
        beforeTextEdit(); spec.labels.push("…"); spec.datasets.forEach((d) => d.data.push(0)); rebuild(); edited();
      } })));
      table.appendChild(headRow);

      spec.datasets.forEach((ds, di) => {
        const row = el("tr");
        const nameInp = el("input", { value: ds.label || "", "aria-label": `Series ${di + 1} name`, dir: "auto" });
        nameInp.addEventListener("input", () => { beforeTextEdit(); ds.label = nameInp.value; edited(); });
        row.appendChild(el("td", {}, nameInp));
        spec.labels.forEach((_, li) => {
          const v = ds.data[li];
          const cell = el("input", { value: v == null ? "" : (typeof v === "object" ? `${v.x};${v.y}` : String(v)), inputmode: "decimal", "aria-label": "Value", dir: "ltr" });
          cell.addEventListener("input", () => {
            beforeTextEdit();
            if (spec.type === "scatter" && cell.value.includes(";")) {
              const [x, y] = cell.value.split(";").map(Number);
              ds.data[li] = { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
            } else ds.data[li] = Number(cell.value) || 0;
            edited();
          });
          row.appendChild(el("td", {}, cell));
        });
        row.appendChild(el("td", {}, el("button", { class: "mini", text: "✕", title: t("card.rmSeries"), onclick: () => { beforeTextEdit(); spec.datasets.splice(di, 1); rebuild(); edited(); } })));
        table.appendChild(row);
      });
      const foot = el("tr");
      foot.appendChild(el("td", {}, el("button", { class: "mini", text: t("card.addSeries"), onclick: () => {
        beforeTextEdit(); spec.datasets.push({ label: String(spec.datasets.length + 1), data: spec.labels.map(() => 0) }); rebuild(); edited();
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
    SF.toast(t("card.regenBusy"));
    try {
      const fresh = await SF.llm.regenerateSlide(slide, state.outline, "");
      const i = state.outline.slides.findIndex((s) => s.id === slide.id);
      if (i >= 0) { SF.history.snapshot(); state.outline.slides[i] = fresh; structuralChange(); SF.toast(t("card.regenDone"), "ok"); }
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
    $("#deck-title").addEventListener("input", () => { beforeTextEdit(); if (state.outline) { state.outline.title = $("#deck-title").value; edited(); } });
    $("#deck-subtitle").addEventListener("input", () => { beforeTextEdit(); if (state.outline) { state.outline.subtitle = $("#deck-subtitle").value || null; edited(); } });
    $("#btn-add-slide").addEventListener("click", () => {
      if (!state.outline) return;
      SF.history.snapshot();
      state.outline.slides.push(SF.schema.blankSlide());
      structuralChange();
    });
    $("#deck-transition").addEventListener("change", (e) => {
      state.deckOpts.transition = e.target.value;
      edited();
    });
    $("#deck-fragments").addEventListener("change", (e) => {
      state.deckOpts.fragments = e.target.checked;
      edited();
    });
    $("#btn-undo").addEventListener("click", () => { SF.history.undo(); });
    $("#btn-redo").addEventListener("click", () => { SF.history.redo(); });
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea, select") || document.querySelector("dialog[open]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); SF.history.undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); SF.history.redo(); }
    });
    SF.on("outline-replaced", () => {
      $("#deck-transition").value = state.deckOpts.transition;
      $("#deck-fragments").checked = state.deckOpts.fragments;
      renderCards(); edited();
    });
    SF.on("undo-changed", updateUndoButtons);
    SF.on("lang-changed", renderCards);
  }

  SF.editor = { init, renderCards, markActive };
})(window.SF);
