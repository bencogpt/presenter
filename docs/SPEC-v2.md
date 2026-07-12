# Specification v2 — SlideForge Offline (As-Built + Roadmap)

**Version:** 1.0 (as-built) → 1.1 (planned enhancements)
**Date:** 2026-07-12
**Supersedes:** `docs/SPEC.md` v0.1 (2026-07-06, original design draft)
**Status:** v1.0 implemented, tested (89-check Playwright e2e), and shipping as
`dist/slideforge.html`. §12 describes the next planned iteration.
**Target environment:** Air-gapped internal network. No public internet at
run-time. Internal-network access only to (a) an OpenAI-compatible LLM endpoint
(e.g. OpenShift AI serving GLM/Gemma/vLLM, and now validated against public
OpenAI o-series / GPT-5 too), and (b) an optional image-generation endpoint —
either OpenAI-images style or a custom FastAPI `/generate_image` service — both
authenticated with bearer tokens.

> This document reconciles the original specification with what was actually
> built across the development conversation, then defines the v1.1 task:
> raising slide-design quality using the principles from the "HTML slide skill"
> curated library (§12).

---

## 1. Overview

### 1.1 Purpose
A single-file HTML application that converts an uploaded document (docx, pdf,
md, txt) — or a short topic brief — into a reveal.js slide deck. An internal
LLM condenses the input into a slide outline (fewer words, more impact,
suggested visuals). The user reviews and edits every slide in a live workspace,
optionally enriches slides with generated images (Flux2) and locally-rendered
charts (Chart.js), then exports one self-contained offline `presentation.html`.

### 1.2 Goals (all met in v1.0)
- **G1** — Runs from a single `.html` file; every library, style and font is
  inlined. Zero external requests except to the two user-configured endpoints.
  Enforced by an automated offline check in the build (NFR-1).
- **G2** — Connects only to the configured LLM / image endpoints over
  HTTP(S) with bearer-token auth.
- **G3** — Human-in-the-loop: the live preview *is* the continuous review;
  generation and export are always explicit actions.
- **G4** — Exports a standalone deck (reveal.js embedded, all assets base64)
  that runs offline from `file://` with a locked-down `connect-src 'none'` CSP.
- **G5** — Usable by non-technical staff: one workspace, model config hidden in
  a settings dialog, English + Hebrew UI.

### 1.3 Non-Goals (unchanged)
- No PPTX/Keynote export (HTML only; PDF via browser print is acceptable).
- No server-side component of its own.
- No multi-user/real-time collaboration; no storage backend (persistence is
  file download/upload of project files).
- No internet-dependent features (analytics, telemetry, update checks) — ever.

### 1.4 Definitions
- **App file** — the single distributable `dist/slideforge.html` (~3.1 MB).
- **Project file** — a token-free JSON snapshot of app state for save/resume.
- **Deck file** — the exported standalone `presentation.html`.
- **Outline** — the structured intermediate representation (§5.1), produced by
  the LLM and edited by the user.

---

## 2. Architecture (as built)

### 2.1 Data flow
```
 [User]                         [Browser: slideforge.html]
   │ upload docx/pdf/md/txt  or  paste topic brief
   ├──────────────────────────────►│ 1. Extract text (mammoth.js / pdf.js / native)
   │                               │    (over-cap docs → map-reduce summarization)
   │                               │ 2. POST {base}/v1/chat/completions ─► [LLM]
   │                               │    system prompt + STRICT-SOURCE or TOPIC mode
   │                               │ ◄── outline JSON (robust extraction + repair)
   │ live preview = review         │ 3. Render reveal.js deck immediately; edit
   │ edit slides in sidebar        │    cards (bullets/layout/chart/image/notes)
   │ request visuals (optional)    │ 4a. POST prompt ─► [Flux2 / FastAPI] ─► image
   │                               │ 4b. chart_spec ─► Chart.js (local, no network)
   │ export                        │ 5. Serialize deck + base64 assets → download
   ▼                               ▼
```

### 2.2 Modules (one file, delimited source blocks under `src/js/`)
| Module | File | Responsibility |
|---|---|---|
| Util / state / i18n | `util.js`, `state.js`, `i18n.js` | `$`/`el`, event bus, central `SF.state`, EN/HE dictionaries + RTL |
| Config | `config.js` | Settings dialog, token handling, connectivity tests, runtime-compat self-heal surface |
| Ingest | `ingest.js` | Upload/paste, type detection, extraction, trim view, over-cap notice |
| LLM client | `llm.js` | OpenAI-compatible chat, prompt templates, JSON extraction/repair, outline pipeline, per-slide regen, **o-series/GPT-5 parameter self-heal** |
| Schema | `schema.js` | Hand-rolled outline validator/sanitizer (no deps) |
| Editor | `editor.js` | Card-per-slide editing, drag reorder, undo/redo, hide toggle |
| Renderer | `render.js` | Outline → reveal.js sections, per-slide `dir`, decorations, footer |
| Charts | `charts.js` | Chart.js config; per-theme palettes; PNG bake for export |
| Visuals | `visuals.js` | Image adapter (openai + fastapi styles); user uploads |
| Exporter | `exporter.js` | Standalone deck build; project save/load |
| App | `app.js` | Workspace controller, dialogs, language, boot |

### 2.3 Why client-only is viable (unchanged)
mammoth.js (docx) and pdf.js (PDF, worker inlined as a base64→Blob) extract
text fully in-browser; both AI services are network-served and called directly
with `fetch`. **CORS remains the key deployment prerequisite** (§7.4).

---

## 3. Functional Requirements — as implemented

### 3.1 Configuration & Connectivity (FR-CFG)
- **FR-CFG-1** — Settings **dialog** (not a wizard step; auto-opens on first
  run, thereafter only via ⚙). Fields: LLM base URL / model / token; image base
  URL / API style (`openai` | `fastapi`) / model or endpoint path / token;
  request timeout (default 120 s); max output tokens; document char cap; image
  size; style prefix; editable system prompt; JSON-mode toggle.
- **FR-CFG-2** — Per-service "Test connection". LLM test = a real `pong` chat
  completion (generous 64-token budget so reasoning models that spend budget on
  internal thinking still pass). Image test = an actual tiny image generation
  (a `/v1/models` probe would false-pass on a text URL, so it is not used).
- **FR-CFG-2a (NEW)** — Connection tests surface the **server's own error
  message** under the result line ("Server said: …"), so a 400/422 is
  self-explanatory (wrong model name, bad URL, unsupported parameter).
- **FR-CFG-3** — Tokens live in memory only by default. Persisting config to
  `localStorage` is one opt-in ("Remember settings"); persisting *tokens*
  requires a **second** opt-in with a shared-machine warning. Config is stored
  without tokens; the token key is separate and only written on the double
  opt-in.
- **FR-CFG-4** — `DEFAULT_CONFIG` block at the top of the file for admin-baked
  endpoint URLs / model names / style prefix (URLs only — never tokens). A
  `uiLang` field can force the UI language.
- **FR-CFG-5** — `http://` endpoints are allowed but raise a persistent ⚠️
  banner ("traffic is unencrypted — acceptable only in isolated labs").

### 3.2 Document Ingest (FR-ING)
- **FR-ING-1** — `.docx`, `.pdf`, `.md`, `.txt` via drag-drop or picker, plus a
  paste-text fallback.
- **FR-ING-2** — docx → mammoth.js (headings preserved as `#` hints); pdf →
  pdf.js page-ordered text (inlined worker; scanned/empty PDFs error clearly);
  md/txt read directly.
- **FR-ING-3** — 20 MB file cap; configurable character cap (default 60,000).
  Over-cap input triggers **map-reduce chunked summarization** (summarize
  sections preserving all numeric data, then outline from the summaries) with a
  visible notice. Verified against a 3,000-note (~280k-char) document.
- **FR-ING-4** — Extracted-text preview is editable/trimmable before generation.
- **FR-ING-5** — Legacy `.doc` rejected with a convert-to-.docx message.

### 3.3 LLM Outline Generation (FR-LLM)
- **FR-LLM-1** — `POST {base}/v1/chat/completions`, `Authorization: Bearer`,
  non-streaming. The base URL is normalized (a trailing `/v1` is stripped so
  users can paste either form).
- **FR-LLM-1a (NEW) — Runtime compatibility self-heal.** Request bodies default
  to `{ model, messages, temperature, max_tokens, stream:false }`. On a 400 that
  names an unsupported parameter, the client adapts for the rest of the session
  and retries automatically:
  - `max_tokens` not supported → resend as `max_completion_tokens`
    (OpenAI o-series / GPT-5).
  - non-default `temperature` rejected → drop it (send model default).
  One-way flags guarantee at most one adaptation per parameter (no retry loop);
  runtimes that accept the classic body (vLLM, llama.cpp, LM Studio) are
  unaffected.
- **FR-LLM-2 — Robust JSON handling.** The model is asked for JSON only.
  Extraction strips `<think>`/reasoning blocks, prefers a fenced block, then
  does a balanced-brace slice, then a last-`}` slice, then `repairJson`
  (smart-quote fix, trailing-comma strip, auto-close of truncated
  strings/braces). Content extraction is liberal: string, array-of-parts,
  `reasoning_content` / `reasoning`, or completions-style `choice.text`. On
  failure: one reinforcement retry, then a **manual-fix editor** seeded with the
  raw output.
- **FR-LLM-2a (NEW) — Diagnostics.** The last raw HTTP body is captured on every
  call and attached to *every* failure as `err.detail`; the sidebar Details
  expander always shows it (never a bare dash). Distinct, actionable messages
  for: empty answer (whole budget spent on reasoning → raise Max output tokens),
  truncation (`finish_reason:"length"`), context overflow (400 naming the model
  window → lower char cap and/or max tokens), and bad JSON.
- **FR-LLM-3 — Content-source modes (NEW, user-selectable in the sidebar):**
  - **Document mode** (`STRICT SOURCE MODE`) — use only facts/figures/names in
    the input; never invent; make fewer slides rather than pad. Input is labeled
    `DOCUMENT`.
  - **Prompt mode** (`TOPIC MODE`) — the input is a topic/brief; the model
    composes content from general knowledge. Input is labeled `BRIEF`.
- **FR-LLM-4** — Pre-generation controls: slide count (auto / 5–40), tone,
  language (auto / forced), visuals density (none / light / rich), content
  source (document / prompt).
- **FR-LLM-5** — Per-slide regeneration sends only that slide + a trimmed source
  excerpt + the deck's titles, and keeps the slide `id` stable.
- **FR-LLM-6** — All LLM/document output is untrusted (§7.3); the system prompt
  states the document is data, not instructions (prompt-injection defense).

### 3.4 Outline Review & Editing (FR-EDIT)
- **FR-EDIT-1** — Card-per-slide editor: title, bullets (add/remove/reorder),
  notes, layout selector (title / bullets / bullets_image / image_full / chart /
  two_column / quote / section).
- **FR-EDIT-2** — Drag-reorder, add blank, delete, duplicate; a per-card 👁
  toggle **hides** a slide (kept in the project, skipped in
  present/export/print).
- **FR-EDIT-3** — Editable `image_prompt` (text) or `chart_spec` (data-table
  editor), mutually exclusive per slide.
- **FR-EDIT-4** — Undo/redo (snapshot taken *before* each mutation).
- **FR-EDIT-5** — The live preview is the review surface; **generation and
  export remain explicit** (G3). Clicking a card jumps the preview to it.
- **FR-EDIT-6** — Assets are keyed by stable slide `id`, so editing never loses
  generated images.

### 3.5 Presentation Rendering (FR-RENDER)
- **FR-RENDER-1** — reveal.js 5 (hakimel/reveal.js) renders the deck on a fixed
  **1280×720** canvas scaled by CSS transform, so browser zoom and any screen
  size preserve the design. Present mode: `F` fullscreen, `S` speaker notes,
  `ESC` overview, Alt+click zoom, Ctrl+Shift+F in-deck search. Deck options:
  transition (slide/fade/convex/zoom/none) and "reveal bullets one by one"
  (fragments), both applied to preview and export. Export adds a kiosk mode
  (auto-advance every N s, loop).
- **FR-RENDER-2 — Themes (expanded to 10).** Each theme is a CSS-variable block
  plus optional decorative layers:
  1. Light corporate 2. Dark 3. High contrast 4. Pastel creative
  5. Bold gradient 6. Elegant ivory (serif display, gold frame) 7. Minimalist
  8. Retro vintage (70s sunburst) 9. Nature botanical (leaf shapes)
  10. Tech neon (navy + cyan/violet glow). Themes 4–10 are Slidesgo-inspired
  original designs (decorated title/section slides, organic image frames, slide
  footers). Custom org theme = copy a block, add one `<option>`, rebuild.
- **FR-RENDER-3** — Layout templates map 1:1 to the FR-EDIT-1 layouts.
- **FR-RENDER-4** — Charts render live via Chart.js (bar/line/pie/doughnut/
  scatter) with per-theme palettes; on export they bake to PNG by default, with
  a toggle to embed live interactive Chart.js instead.
- **FR-RENDER-5 — RTL (NEW).** Slide `dir` is computed per slide from its text
  (Hebrew/Arabic → `rtl`): right-aligned text, bullet markers flipped to the
  right, logical CSS properties throughout; RTL survives export.

### 3.6 Image Generation (FR-IMG)
- **FR-IMG-1 — Two adapter styles (NEW).**
  - `openai`: `POST {base}/v1/images/generations`, body
    `{ model, prompt, size, n:1, response_format:"b64_json" }`.
  - `fastapi`: `POST {base}{path}` (default `/generate_image`), body
    `{ prompt, width, height }`, response `{ image | b64_json | images[] }`.
  A liberal parser (`findB64`) accepts several response shapes and raw
  `image/*` bodies.
- **FR-IMG-2** — Post-generation images dialog: per-slide Accept / Retry
  (edit prompt) / Skip, or "generate all"; auto-offered when the outline has
  image prompts and an image endpoint is configured.
- **FR-IMG-3** — Configurable style prefix prepended to prompts.
- **FR-IMG-4** — Images live in memory as base64; nothing is uploaded.
- **FR-IMG-5** — Per-slide user image upload (bypass generation).
- **FR-IMG-6** — Charts never go through image generation (accuracy).

### 3.7 Export & Persistence (FR-EXP)
- **FR-EXP-1** — Self-contained `presentation.html`: reveal.js inlined, images
  base64, `connect-src 'none'` CSP, no external references, no tokens. Opens
  from `file://` with zero network requests (verified).
- **FR-EXP-2** — `project.json` (§5.2): outline, theme, deck options, assets,
  config-minus-tokens, image API style/path. Re-validated and re-sanitized on
  import.
- **FR-EXP-3** — PDF via a print-optimized layout + one-click print.
- **FR-EXP-4** — Size warning with client-side image downscale option.

### 3.8 Error Handling (FR-ERR)
- **FR-ERR-1** — Every call: timeout + one automatic retry on 5xx/timeout/
  network; actionable message; raw body behind the Details expander.
- **FR-ERR-2** — 401/403 → "Token rejected → Settings".
- **FR-ERR-3** — Malformed JSON → retry → manual-fix editor.
- **FR-ERR-4** — Browser-support check on load (fetch, FileReader,
  structuredClone, canvas, AbortController, HTMLDialogElement).

---

## 4. UI / UX (as built — workspace, not wizard)

The original 7-step wizard was replaced by a **single workspace**:

- **Main stage** — the live 16:9 preview (or an empty state) fills the window.
- **Sidebar** — 1 · Source document (drop/paste, trim) · 2 · Generate outline
  (count / tone / language / content-source / visuals) · 3 · Slides (deck title,
  per-slide cards, deck options).
- **Header** — theme selector, ✦ Images, ▶ Present, ⬇ Export, EN/HE toggle,
  ⚙ Settings, 🗑 Clear session.
- **Dialogs** — Settings, Images, Export, JSON-fix, confirm.
- Live status during generation ("Sending 14,203 characters to model glm-4…"),
  elapsed timer, cancel (AbortController).
- **Languages** — full English + Hebrew UI; Hebrew UI is RTL. Content language
  is independent and follows the source (or explicit choice).
- Accessibility — WCAG AA on built-in themes; keyboard-operable editor.
  *(Gap: `prefers-reduced-motion` not yet honored — see §12.)*

---

## 5. Data Schemas

### 5.1 Outline JSON (LLM contract) — unchanged from v0.1
```json
{
  "title": "string",
  "subtitle": "string|null",
  "language": "en|he|...",
  "slides": [{
    "id": "s1",
    "layout": "title|bullets|bullets_image|image_full|chart|two_column|quote|section",
    "title": "string",
    "bullets": ["max 10 words each"],
    "notes": "speaker notes, optional",
    "image_prompt": "string|null",
    "chart_spec": { "type": "bar|line|pie|doughnut|scatter", "title": "string",
                    "labels": ["..."], "datasets": [{ "label": "string", "data": [1,2,3] }] }
  }]
}
```
Strict client-side validation; unknown fields dropped; `image_prompt` and
`chart_spec` mutually exclusive.

### 5.2 Project JSON (as built)
```json
{
  "format": "slideforge-project", "version": 1, "created": "ISO-8601",
  "outline": { "...": "schema 5.1" },
  "theme": "corporate|dark|contrast|creative|gradient|elegant|minimal|retro|nature|tech",
  "deckOpts": { "transition": "slide|fade|convex|zoom|none", "fragments": true },
  "assets": { "s1": { "kind": "image|user_image", "mime": "image/png", "b64": "..." } },
  "config": { "llm_base": "...", "llm_model": "...", "flux_base": "...",
              "flux_api": "openai|fastapi", "flux_path": "/generate_image" }
}
```
**Tokens are never written.** Import re-validates and re-sanitizes.

---

## 6. Technology & Build

Vendored inline via `build/build.mjs` (`<!--@js/@css/@b64-->` directives):
reveal.js 5 (+ notes/zoom/search plugins), mammoth.js, pdf.js (worker inlined),
Chart.js, DOMPurify, and one variable font (Inter). Plain modular vanilla JS
with a small `SF` state store — no framework. App-file size ~3.1 MB. The build
runs an **offline check** (no external refs in markup) as NFR-1.

Dev tooling: `tools/mock-server.mjs` (mocks both endpoints incl. reasoning
quirks, context overflow, o-series parameter rules, FastAPI image contract);
`test/e2e.mjs` (89-check Playwright suite against the mock).

---

## 7. Security (unchanged intent; as built)

- **7.1 Threat model** — assets: tokens, uploaded documents, decks. Adversaries:
  shared-workstation users, tampered project files, prompt-injection in
  documents.
- **7.2 Token & data handling** — tokens in memory by default; double-opt-in
  persistence; "Clear session" wipes everything. Documents go only to the LLM
  endpoint, prompts only to the image endpoint. No telemetry.
- **7.3 Sanitization** — all LLM/document/project strings enter the DOM via
  `textContent` or a DOMPurify pass with a tight allowlist
  (`b i em strong ul ol li br code`); chart numbers `Number()`-coerced and
  bounds-checked. Exported decks carry only sanitized content.
- **7.4 CORS / deployment** — the app origin must be allowed on the model routes
  (`Access-Control-Allow-Origin` + `Authorization` header + `OPTIONS`).
  Recommended: serve the file from an internal static host. App CSP allows
  `connect-src https: http:` (pin to exact origins in production); exported
  decks get `connect-src 'none'`.
- **7.5 Rate limiting** — client politeness only (sequential images, one LLM
  call at a time).

---

## 8. Non-Functional Requirements (met)
- **NFR-1 Offline guarantee** — build-time check; deck verified with networking
  blocked (zero requests).
- **NFR-2 Performance** — async calls, chunked large-file handling; UI stays
  responsive.
- **NFR-3 Browser support** — Chromium/Firefox ≥ 110.
- **NFR-4 Capacity** — decks up to ~60 slides / ~40 images.
- **NFR-5 Maintainability** — delimited module blocks; `README`/build docs.
- **NFR-6 Auditability** — version + build date in footer and exports.

---

## 9. Deviations from the original spec (v0.1 → v1.0)

| Area | v0.1 said | v1.0 built | Why |
|---|---|---|---|
| Navigation | 7-step wizard | Single workspace, live preview | More intuitive for non-technical users (user request) |
| Config | A wizard step | Settings dialog (auto-opens once) | Hide model plumbing from end users |
| Language | English UI only | English + Hebrew, full RTL | User request |
| Themes | ≥ 3 | 10 (7 Slidesgo-style) | User request |
| Content source | Document only | Document *and* topic-brief modes | Clarified two distinct use cases |
| Image API | OpenAI-images only | + FastAPI `/generate_image` adapter | Matches user's real service |
| LLM compat | Classic body | + o-series/GPT-5 self-heal | Validated against public OpenAI |
| Diagnostics | Details expander | Always-populated Details + specific error classes | Debugging empty/truncated/overflow answers |

---

## 10. Risks & Open Questions (current)

| ID | Item | Status |
|---|---|---|
| OQ-1 | Exact Flux2 contract on OpenShift AI | Mitigated: two adapter styles + liberal parser; confirm before rollout |
| OQ-2 | CORS strategy | Deployment decision; recommend internal static host |
| OQ-3 | Deployed model context window | Configurable char cap + context-overflow diagnostics |
| R-1 | LLM JSON reliability | Extraction/repair + reinforcement retry + manual-fix editor + JSON mode |
| R-4 | Shared-machine token leakage | Memory-only default; double opt-in |

---

## 11. Original future enhancements (still open)
Streaming responses with live preview; speaker-note generation pass; Mermaid
diagrams; corporate PPTX theme-color import; optional OCR for scanned PDFs.

---

## 12. NEW TASK — Design-quality upgrade from the "HTML slide skill" library

**Source:** *"30+ Best HTML Slide Skill — The Complete Curated Library for
Claude Code, Codex, Cursor…"* (Sylvia Chen, Medium, 2026) and its referenced
open-source skills — notably `nghiahsgs/skills-slides` ("anti-AI-slop",
50,000+ design combinations) and `ToseaAI/awesome-html-slide-skills`.

**Goal:** raise the visual quality of generated decks to match hand-crafted
HTML-slide skills, *without* breaking the air-gapped, single-file, offline
constraints (so techniques that need Google Fonts CDNs or npm are adapted to
vendored equivalents).

### 12.1 Principles distilled from the article (the "anti-AI-slop" checklist)
1. **Typography beyond the defaults** — avoid relying on a single generic sans
   (Inter/Roboto/Arial). Use intentional **display + body font pairings**
   (serif/sans discipline), 3+ distinct text sizes for hierarchy.
2. **Named, cohesive color palettes** with documented WCAG AA contrast — not
   arbitrary picks; avoid the clichéd purple-gradient-on-white.
3. **Shadow hierarchy** — differentiated `sm/md/lg` elevation tokens, not flat.
4. **Background depth** — texture / gradient / subtle noise instead of solid
   flat fills; at least one **signature visual effect** per aesthetic
   (glassmorphism card, aurora, grain, particles) used tastefully.
5. **All colors via CSS variables** (already true) — extend to spacing, radius,
   shadow, and type-scale tokens to prevent drift.
6. **Fixed presentation canvas** (we use 1280×720; the skills favor 1920×1080)
   with responsive scaling — already satisfied by our transform-scale approach.
7. **Inline SVG diagrams** (timelines, flows, simple infographics) as a
   dependency-free alternative to image generation for conceptual slides.
8. **Motion discipline** — smooth but not gratuitous; **honor
   `prefers-reduced-motion`** (current gap).
9. **Visible grid / whitespace** as a deliberate design feature (Swiss/Bauhaus
   influence) for editorial-minimal aesthetics.

### 12.2 Proposed requirements (v1.1)
- **FR-DQ-1 — Font pairings (vendored).** Add 2–3 open-license font pairings
  (e.g. a serif display + humanist sans; a grotesk display + serif body),
  base64-inlined like Inter. Each theme selects a pairing; the "Elegant" theme
  already previews this (Georgia display). Keep total added weight modest
  (subset to Latin + Hebrew where the theme needs RTL).
- **FR-DQ-2 — Design-token layer.** Introduce `--sf-shadow-sm/md/lg`,
  `--sf-radius-*`, `--sf-space-*`, and a type-scale (`--sf-fs-1…5`) per theme;
  refactor layouts to consume them so new themes stay consistent.
- **FR-DQ-3 — Background depth + signature effect per theme.** Give each theme
  a subtle non-flat content background (soft gradient / faint grain via a CSS
  radial-pattern or an inlined tiny noise data-URI) and one optional signature
  accent (e.g. glassmorphism chart card, aurora on title slides), all
  pure-CSS/offline and behind the existing decorative-layer system.
- **FR-DQ-4 — `prefers-reduced-motion`.** When set, disable reveal.js
  transitions/auto-animate and decorative motion; applies to preview and export.
- **FR-DQ-5 — Inline-SVG "concept" visuals.** Extend the schema with an
  optional `diagram_spec` (e.g. `timeline`, `process`, `comparison`, `stat`)
  that the app renders as themed inline SVG — a chart-like, accurate, offline
  alternative to a generated image for non-data conceptual slides. Mutually
  exclusive with `image_prompt`/`chart_spec`. The LLM prompt gains guidance on
  when to choose it.
- **FR-DQ-6 — "Aesthetic" presets (stretch).** Optionally expose a small set of
  curated aesthetics (e.g. editorial-minimal, startup-pitch, luxury-noir) as
  theme+pairing+effect bundles, mirroring the skills' token approach — still
  just CSS blocks, no new dependencies.
- **FR-DQ-7 — WCAG AA audit.** Document the contrast ratio of every palette
  (foreground/background pairs) in a comment block, as the referenced skills do.

### 12.3 Non-negotiable constraints on this task
- **No new network dependency.** Fonts, textures, effects, and diagrams must be
  inlined; the offline check (NFR-1) and `connect-src 'none'` export CSP must
  keep passing.
- **Single-file size budget.** Stay within a few hundred KB of added weight;
  subset fonts; prefer CSS-generated texture over bitmap noise where possible.
- **Accessibility first.** Every new palette meets AA (FR-DQ-7); every effect
  degrades under `prefers-reduced-motion` (FR-DQ-4).
- **RTL parity.** New layouts/effects must use logical properties so Hebrew/
  Arabic decks render correctly (FR-RENDER-5).
- **Regression safety.** The 89-check e2e suite must keep passing; add checks
  for reduced-motion, any new schema field, and at least one new
  pairing/effect.

### 12.4 Acceptance criteria (v1.1)
- At least 3 vendored font pairings selectable via themes; no deck depends on a
  network font.
- Every theme has a non-flat content background and passes AA (documented).
- `prefers-reduced-motion` verifiably disables motion in preview and export.
- `diagram_spec` renders a themed inline-SVG for ≥ 3 diagram types, exports
  offline, and round-trips through the project file.
- Build offline check + full e2e suite green; app-file size increase ≤ ~400 KB.

---

*End of SPEC v2.*
