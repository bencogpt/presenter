# Specification — Air-Gapped HTML Presentation Generator ("SlideForge Offline")

**Version:** 0.1 (Draft for review)
**Date:** 2026-07-06
**Status:** Specification only — no implementation authorized yet
**Target environment:** Air-gapped internal network. No public internet access at build-run-time for the client. Internal network access only to (a) an OpenAI-compatible LLM endpoint served via OpenShift AI, and (b) a Flux2 image-generation endpoint, both authenticated with secret bearer tokens.

---

## 1. Overview

### 1.1 Purpose
A single-file HTML application that converts an uploaded document (docx, txt, md, pdf) into an HTML-based slide presentation. An internal LLM condenses the document into slide-friendly content (fewer words, more bullet points, suggested visuals). The user reviews and edits the proposed outline, then the app renders a reveal.js-based presentation. Slides may be enriched with AI-generated images (Flux2) and real rendered charts (Chart.js). The final deck can be presented in-app or exported as one self-contained offline HTML file.

### 1.2 Goals
- G1: Run entirely from a single `.html` file opened in a modern browser (Chromium/Firefox), with all JS/CSS/fonts vendored inline. No CDN calls, ever.
- G2: Connect only to internal-network endpoints (LLM, Flux2) over HTTPS with bearer-token auth.
- G3: Human-in-the-loop: nothing is generated into the final deck without explicit user approval of the outline.
- G4: Export a standalone presentation HTML file (reveal.js embedded, images inlined as base64) that runs on any offline machine with a browser.
- G5: Usable as a shared internal tool by non-technical staff.

### 1.3 Non-Goals
- No PPTX/Keynote export (HTML only; PDF via browser print is acceptable).
- No server-side component of its own — the app is client-only; the LLM/Flux2 services are pre-existing infrastructure.
- No multi-user collaboration/real-time editing.
- No storage backend; persistence is via file download/upload of project files.
- No internet-dependent features of any kind (analytics, telemetry, update checks — all forbidden).

### 1.4 Definitions
- **App file:** the single distributable `slideforge.html`.
- **Project file:** a JSON export of app state (outline, settings, generated assets) for save/resume.
- **Deck file:** the exported standalone presentation HTML.
- **Outline:** structured intermediate representation of the presentation produced by the LLM and edited by the user.

---

## 2. Architecture

### 2.1 High-Level Data Flow

```
 [User]                       [Browser: slideforge.html]
   │  upload docx/txt/md/pdf         │
   ├────────────────────────────────►│ 1. Parse to plain text (mammoth.js / pdf.js / native)
   │                                 │
   │                                 │ 2. POST /v1/chat/completions  ──► [OpenShift AI LLM]
   │                                 │    (system prompt: "convert to      (GLM / Gemma,
   │                                 │     slide outline JSON")             OpenAI-compatible)
   │                                 │ ◄── outline JSON ────────────────
   │  review / edit outline          │
   ├────────────────────────────────►│ 3. Outline editor UI (approve/edit/regenerate per slide)
   │  approve                        │
   ├────────────────────────────────►│ 4. Render reveal.js deck in-app
   │                                 │
   │  request visuals (optional)     │ 5a. POST image prompt ──► [Flux2 endpoint] ──► PNG
   │                                 │ 5b. Chart spec ──► Chart.js (local render, no network)
   │                                 │
   │  export                         │ 6. Serialize deck + base64 assets → download deck.html
   ▼                                 ▼
```

### 2.2 Components (all inside one file)
| Component | Responsibility |
|---|---|
| **Config module** | Endpoint URLs, model names, token entry, connectivity test |
| **Ingest module** | File upload, type detection, text extraction |
| **LLM client** | OpenAI-compatible chat completions; prompt templates; JSON-mode parsing; retry/timeout |
| **Outline model** | In-memory structured representation + undo history |
| **Outline editor UI** | Per-slide review, edit, reorder, delete, regenerate |
| **Renderer** | Outline → reveal.js DOM; theme system |
| **Visuals module** | Flux2 client for images; Chart.js for graphs; per-asset approve/retry |
| **Exporter** | Standalone deck HTML with inlined assets; project JSON save/load |
| **Sanitizer** | DOMPurify pass on ALL LLM-derived content before DOM insertion |

### 2.3 Why client-only is viable
- mammoth.js extracts docx text fully in-browser.
- pdf.js extracts PDF text fully in-browser.
- Both AI services are already network-served; the browser calls them directly with `fetch`.
- Constraint: the OpenShift AI routes and Flux2 route **must send CORS headers** allowing the app's origin (`file://` origin is `null` — see §7.4, this is a key deployment decision).

---

## 3. Functional Requirements

### 3.1 Configuration & Connectivity (FR-CFG)
- FR-CFG-1: Settings panel with fields: LLM base URL, LLM model name, LLM API token; Flux2 base URL, Flux2 API token; request timeout (default 120 s); max output tokens.
- FR-CFG-2: "Test connection" button per service. LLM test = minimal chat completion ("ping"); Flux2 test = health/metadata call or 1-step tiny image.
- FR-CFG-3: Tokens are held **in memory only** by default. An explicit opt-in checkbox "Remember on this machine (shared computer warning)" stores config in `localStorage` **excluding tokens** unless a second explicit opt-in is checked. Default: never persist tokens. (Shared-tool requirement, see §7.2.)
- FR-CFG-4: Admin-prefill: the app file may be distributed with default endpoint URLs baked into a clearly marked `DEFAULT_CONFIG` block at the top of the file (URLs only — never tokens).
- FR-CFG-5: All endpoints must be `https://` on the internal network; the app warns (but does not block) on `http://` to accommodate lab setups, logging a visible ⚠️ banner.

### 3.2 Document Ingest (FR-ING)
- FR-ING-1: Accepted inputs: `.docx`, `.txt`, `.md`, `.pdf`. Drag-and-drop and file-picker. Also a plain "paste text" textarea as fallback.
- FR-ING-2: Extraction:
  - docx → mammoth.js → HTML → stripped to structured text (headings preserved as hints).
  - pdf → pdf.js → page-ordered text (no OCR; scanned PDFs out of scope, show a clear error if extracted text < threshold).
  - txt/md → read directly; md headings preserved as structure hints.
- FR-ING-3: Max input size: 20 MB file / configurable character cap (default 60,000 chars ≈ safe context for typical GLM/Gemma deployments). Over-cap documents trigger a **chunked summarization strategy** (map-reduce: summarize sections, then outline from summaries) with a user notice.
- FR-ING-4: Show extracted text preview; user can trim/edit before sending to LLM.
- FR-ING-5: Legacy `.doc` is rejected with a helpful message (convert to .docx first).

### 3.3 LLM Outline Generation (FR-LLM)
- FR-LLM-1: API: OpenAI-compatible `POST {base}/v1/chat/completions`, header `Authorization: Bearer <token>`, JSON body with `model`, `messages`, `temperature`, `max_tokens`. Non-streaming for v1 (streaming = future enhancement).
- FR-LLM-2: The LLM must return a **structured outline as JSON** (not free prose). Schema in §5.1. Prompt requests JSON only; parser strips markdown fences; on parse failure, one automatic retry with a "return only valid JSON" reinforcement, then surface raw output to the user with a manual-fix editor.
- FR-LLM-3: Core prompt intent (template, editable in an "advanced" settings area):
  - System: "You convert documents into presentation outlines. Less text, more impact: max 5 bullets per slide, max 10 words per bullet. Prefer visuals: for each slide suggest either an image concept (`image_prompt`) or a chart (`chart_spec` with real data drawn from the document) when the content is data-like. Output only JSON matching the provided schema. Use the same language as the source document."
  - User: schema + extracted document text.
- FR-LLM-4: User controls before generation: target slide count (auto / 5–40), tone (business / technical / educational), language (auto-detect / force), visuals density (none / light / rich).
- FR-LLM-5: Per-slide regeneration: "regenerate this slide" sends only that slide's source context + instruction, not the whole document.
- FR-LLM-6: All LLM output is treated as untrusted input (sanitized per §7.3) — including defenses against prompt-injection content embedded in uploaded documents (e.g., a docx containing "ignore previous instructions"): the system prompt instructs the model to treat document content strictly as data, and the app never executes or interprets LLM output as code.

### 3.4 Outline Review & Editing (FR-EDIT)
- FR-EDIT-1: Card-per-slide editor: title, bullets (add/remove/reorder), speaker notes, layout selector (title / bullets / bullets+image / image-full / chart / two-column / quote / section-divider).
- FR-EDIT-2: Drag-and-drop slide reordering; add blank slide; delete; duplicate.
- FR-EDIT-3: Visual placeholders shown per slide: the LLM's `image_prompt` (editable text) or `chart_spec` (editable via a simple table-of-data editor).
- FR-EDIT-4: Undo/redo (≥ 20 steps, in-memory).
- FR-EDIT-5: Explicit "Approve outline → Build presentation" gate. Nothing renders to a deck before this.
- FR-EDIT-6: Diff-safe iteration: user may go back to the editor from the preview at any time without losing generated assets (assets keyed by stable slide IDs).

### 3.5 Presentation Rendering (FR-RENDER)
- FR-RENDER-1: reveal.js (vendored) renders the deck inside the app in a preview pane and a full-screen "Present" mode (keyboard nav, speaker-notes view, overview mode, PDF print export via `?print-pdf` equivalent).
- FR-RENDER-2: ≥ 3 built-in themes (light corporate, dark, high-contrast). Theme = CSS variables block; org can add a custom theme by editing a marked CSS section.
- FR-RENDER-3: Layout templates map 1:1 to FR-EDIT-1 layouts.
- FR-RENDER-4: Charts are rendered live by Chart.js from `chart_spec` (bar, line, pie, doughnut, scatter). Charts remain vector/canvas in the in-app deck; on export they are serialized to PNG (canvas → base64) for maximum portability, with a toggle to embed live Chart.js instead.

### 3.6 Image Generation — Flux2 (FR-IMG)
- FR-IMG-1: API contract (assumed OpenAI-images-style since the deployment mirrors the text LLM; **must be confirmed against the actual OpenShift AI serving runtime before implementation** — flagged as Open Question OQ-1): `POST {flux_base}/v1/images/generations` with `Authorization: Bearer <token>`, body `{ "model": "flux2", "prompt": "...", "size": "1344x768", "n": 1, "response_format": "b64_json" }`. Adapter layer isolates this so a ComfyUI-style contract can be swapped in by changing one module.
- FR-IMG-2: "Generate visuals" step (post-outline-approval, optional): lists all slides with `image_prompt`, generates sequentially with progress UI, shows each result with Accept / Retry (edit prompt) / Skip.
- FR-IMG-3: Prompt hygiene: the app prepends a style prefix (configurable, e.g., "clean corporate illustration, presentation graphic, no text in image") to slide image prompts.
- FR-IMG-4: Generated images live in memory as base64; nothing is uploaded anywhere.
- FR-IMG-5: User may also upload their own images per slide (bypass Flux2 entirely).
- FR-IMG-6: Do **not** use Flux2 for data charts; charts always go through Chart.js (accuracy requirement).

### 3.7 Export & Persistence (FR-EXP)
- FR-EXP-1: **Deck export:** one self-contained `presentation.html` — reveal.js JS/CSS inlined, images as base64 `data:` URIs, no external references whatsoever. Must open from `file://` on any offline machine.
- FR-EXP-2: **Project export/import:** `project.json` (schema §5.2) containing outline, config-minus-tokens, assets (base64), theme. Enables save/resume and hand-off between colleagues.
- FR-EXP-3: PDF: instructions + one-click trigger of the browser print flow in print-optimized layout.
- FR-EXP-4: Export size warning at > 50 MB (many images) with an option to downscale images (client-side canvas resize to max 1920 px, JPEG q0.85).

### 3.8 Error Handling (FR-ERR)
- FR-ERR-1: Every network call: timeout (configurable), single automatic retry on 5xx/timeout, then user-facing actionable error ("LLM unreachable — check URL/token in Settings"). Generic messages only; raw response bodies visible behind a "details" expander for admins, never auto-shown.
- FR-ERR-2: 401/403 → "Token rejected" with a direct link to Settings.
- FR-ERR-3: Malformed LLM JSON → retry once, then manual-fix editor (FR-LLM-2).
- FR-ERR-4: Browser-support check on load (required APIs: `fetch`, `FileReader`, `structuredClone`, canvas); show unsupported-browser banner otherwise.

---

## 4. UI / UX Flow

Wizard with a persistent step bar; back-navigation allowed at all times:

```
 [1 Setup] → [2 Upload] → [3 Generate outline] → [4 Review & edit]
      → [5 Visuals (optional)] → [6 Preview / Present] → [7 Export]
```

- Step 1 hidden after first successful config (accessible via ⚙ icon).
- Step 3 shows a live status ("Sending 14,203 characters to model glm-4…"), elapsed time, cancel button (AbortController).
- Step 5 skippable ("Build without images").
- Present mode: `F` fullscreen, `S` speaker notes, `ESC` overview — standard reveal.js bindings, with an on-screen help overlay (`?`).
- Accessibility: WCAG AA contrast on built-in themes, full keyboard operability of the editor, `aria-live` progress announcements.
- Language: UI in English v1; content language follows the source document (FR-LLM-3). RTL content support in slide rendering (`dir="auto"` on slide text nodes) — relevant for Hebrew/Arabic documents.

---

## 5. Data Schemas

### 5.1 Outline JSON (LLM contract)
```json
{
  "title": "string",
  "subtitle": "string|null",
  "language": "en|he|...",
  "slides": [
    {
      "id": "s1",
      "layout": "title|bullets|bullets_image|image_full|chart|two_column|quote|section",
      "title": "string",
      "bullets": ["max 10 words each"],
      "notes": "speaker notes, optional",
      "image_prompt": "string|null",
      "chart_spec": {
        "type": "bar|line|pie|doughnut|scatter",
        "title": "string",
        "labels": ["..."],
        "datasets": [{ "label": "string", "data": [1, 2, 3] }]
      }
    }
  ]
}
```
Validation: strict schema check client-side (hand-rolled validator, no dependency); unknown fields dropped; `image_prompt` and `chart_spec` mutually exclusive per slide.

### 5.2 Project JSON
```json
{
  "format": "slideforge-project",
  "version": 1,
  "created": "ISO-8601",
  "outline": { "...": "schema 5.1" },
  "theme": "string",
  "assets": { "s1": { "kind": "image|chart_png", "mime": "image/png", "b64": "..." } },
  "config": { "llm_base": "...", "llm_model": "...", "flux_base": "..." }
}
```
**Tokens are never written to project files.** Import of a project file re-validates the outline schema and sanitizes all strings (defense against a tampered shared file).

---

## 6. Technology & Vendored Libraries (single-file build)

All libraries embedded inline in `slideforge.html` via a documented build script (the build script itself is a dev-time tool run once on a connected machine; the artifact it produces is what enters the air-gapped network).

| Library | Purpose | License | Approx. size (min) |
|---|---|---|---|
| reveal.js | slide framework | MIT | ~250 KB |
| mammoth.js | docx → text/HTML | BSD-2 | ~600 KB |
| pdf.js (core + worker inlined as blob) | PDF text extraction | Apache-2.0 | ~1.5 MB |
| Chart.js | charts | MIT | ~200 KB |
| DOMPurify | sanitize LLM/document HTML | Apache-2.0/MPL | ~50 KB |
| (no framework) | UI in vanilla JS + `<template>` elements | — | — |

Expected app-file size: **~3–4 MB**. No fonts vendored beyond one open-license variable font (e.g., Inter, OFL) to keep decks consistent across machines (~300 KB woff2, base64).

Deliberately **no** React/Vue (size, build complexity, single-file constraint) — plain modular vanilla JS with a small state store.

---

## 7. Security (shared internal tool, air-gapped)

### 7.1 Threat model (summary)
Assets: API tokens, potentially sensitive uploaded documents, generated decks. Adversaries: other users of a shared workstation, a tampered project file, malicious content embedded in uploaded documents, prompt-injection via document text. Out of scope: compromise of the LLM/Flux2 services themselves, network MITM inside the trusted segment (mitigated by HTTPS anyway).

### 7.2 Token & data handling
- Tokens in a JS closure, never in `localStorage`/`sessionStorage`/cookies by default; optional persistence requires double opt-in with a shared-machine warning (FR-CFG-3).
- "Clear session" button wipes tokens, document text, outline, and assets from memory.
- No document content is ever sent anywhere except the configured LLM endpoint; images prompts only to Flux2. This is stated in the UI.
- No telemetry, no logging of content; `console` logging limited to non-sensitive event names in production build.

### 7.3 Content sanitization (⚠️ SECURITY-critical)
- Every string originating from (a) the LLM, (b) uploaded files, (c) imported project files is inserted into the DOM via `textContent`, or where rich text is needed, passed through DOMPurify with a tight allowlist (`b,i,em,strong,ul,ol,li,br,code`).
- The exported deck embeds only sanitized content — an exported deck must never carry a stored-XSS payload to another machine.
- `chart_spec` numeric fields coerced with `Number()` and bounds-checked; labels sanitized as text.
- CSP `<meta http-equiv="Content-Security-Policy">` in both app and exported decks: `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src <configured endpoints only — app file only>`. (`unsafe-inline` is unavoidable in a single-file design; compensated by the sanitization layer. Exported deck gets `connect-src 'none'`.)

### 7.4 CORS / deployment decision (⚠️ blocking infrastructure prerequisite)
The browser must be allowed to call the LLM/Flux2 routes. Options, in order of recommendation:
1. **Serve the app file from an internal static host** (any internal web server / OpenShift route serving one static file). Origin becomes `https://tools.internal/...`; add that origin to `Access-Control-Allow-Origin` on the model routes (plus `Authorization` in allowed headers, handle `OPTIONS` preflight). *Recommended for a shared tool anyway (one canonical version).* 
2. Open the file via `file://` and set `Access-Control-Allow-Origin: null` on the routes — works but weaker (any local file could then call the endpoint; token still required, so acceptable in some labs).
3. A tiny internal reverse proxy adding CORS headers in front of the model services.
This must be decided with the OpenShift AI admins before implementation (OQ-2).

### 7.5 Rate limiting / abuse
Client-side politeness only (sequential image generation, max 1 concurrent LLM call); real rate limiting is the serving platform's responsibility. Documented as an operational note.

---

## 8. Non-Functional Requirements

- **NFR-1 Offline guarantee:** zero external resource references; verified by an automated check in the build script (grep for `http(s)://` outside the config module + a manual test with networking disabled except allowlisted hosts).
- **NFR-2 Performance:** app interactive < 2 s after load on a mid-range workstation; 60k-char document outline round-trip bounded by LLM speed (UI must stay responsive — all calls async, parsing in chunks/`requestIdleCallback` for large files).
- **NFR-3 Browser support:** current Chromium ≥ 110 and Firefox ≥ 110. No IE/legacy Edge.
- **NFR-4 Capacity:** decks up to 60 slides, 40 images; memory budget < 1.5 GB tab.
- **NFR-5 Maintainability:** single file but internally organized in clearly delimited, commented module blocks; a `BUILD.md` documents how to regenerate the file from source modules.
- **NFR-6 Auditability:** version string + build date visible in the footer and embedded in exported decks/projects.

---

## 9. Risks & Open Questions

| ID | Item | Impact | Mitigation / needed decision |
|---|---|---|---|
| OQ-1 | Exact Flux2 API contract on OpenShift AI (OpenAI-images style vs. custom) | Blocks FR-IMG | Confirm with platform team; adapter layer isolates the risk |
| OQ-2 | CORS strategy (§7.4) | Blocks all network features | Decide hosting model with admins; recommend option 1 |
| OQ-3 | LLM context window of the deployed GLM/Gemma | Affects chunking threshold (FR-ING-3) | Make char cap configurable; default conservative |
| R-1 | LLM JSON reliability varies by model | Degraded UX | Retry + manual-fix editor; consider structured-output/JSON mode if the serving runtime supports it |
| R-2 | pdf.js worker inlining is fiddly in single-file builds | Build complexity | Known blob-URL technique; fallback: drop PDF support to v1.1 |
| R-3 | Very large exported decks | Usability | FR-EXP-4 downscaling |
| R-4 | Shared-machine token leakage | Security | §7.2 defaults; user education banner |

---

## 10. Future Enhancements (explicitly out of v1 scope)
- Streaming LLM responses with live outline preview
- Speaker-note generation pass; per-slide "expand/condense" buttons
- Mermaid diagrams (vendored) for flowcharts suggested by the LLM
- Org template/theme gallery; import of corporate PPTX theme colors
- Optional OCR (tesseract.js, +2 MB) for scanned PDFs
