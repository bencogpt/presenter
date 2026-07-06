# SlideForge Offline

Air-gapped, single-file HTML presentation generator. Upload a document
(docx / pdf / md / txt), an internal LLM condenses it into a slide outline,
you review and edit every slide, then the app renders a reveal.js deck with
optional Flux2-generated images and locally-rendered Chart.js charts — and
exports one self-contained `presentation.html` that runs offline anywhere.

Built to the specification in `docs/SPEC.md` (v0.1, 2026-07-06).

## The one file

**`dist/slideforge.html`** (~3 MB) is the entire application. Every library,
style and font is inlined; it makes **zero** external requests — the only
network calls it can ever make are to the two endpoints you configure:

- an OpenAI-compatible chat endpoint (`POST {base}/v1/chat/completions`)
- a Flux2 image endpoint (`POST {base}/v1/images/generations`), optional

Copy it into the air-gapped network, serve or open it, done.

## Quick start (users)

1. Open `slideforge.html` (ideally from the internal static host — see below).
2. **Setup**: enter the LLM base URL, model name and token; press *Test
   connection*. Flux2 is optional. Tokens stay in memory only unless you
   double-opt-in to persistence.
3. **Upload** a document (or paste text), trim the extracted text.
4. **Generate outline** — pick slide count, tone, language, visuals density.
5. **Review & edit** — every slide is a card: bullets, layout, speaker notes,
   chart data table, image prompt. Drag to reorder, undo/redo, per-slide
   regenerate. Nothing is built until you press **Approve**.
6. **Visuals** — generate images per slide (accept / retry / skip), or upload
   your own.
7. **Present** — 16:9, large type, keyboard nav (`F` fullscreen, `S` speaker
   notes, `ESC` overview). The deck is a fixed 1280×720 canvas that reveal.js
   scales to any window or browser zoom without breaking the layout.
8. **Export** — standalone `presentation.html` (images embedded as base64,
   charts baked to PNG or kept live), `*.slideforge.json` project file for
   save/resume (never contains tokens), or PDF via the browser print dialog.

## Deployment (admins)

The browser must be allowed to call the model routes (CORS). Options in
order of recommendation (spec §7.4):

1. **Serve `slideforge.html` from an internal static host** and add that
   origin to `Access-Control-Allow-Origin` on the LLM/Flux2 routes (plus
   `Authorization` in `Access-Control-Allow-Headers`, and handle `OPTIONS`).
2. Open via `file://` and set `Access-Control-Allow-Origin: null` on the
   routes (weaker; acceptable in some labs).
3. Put a small internal reverse proxy that adds CORS headers in front of the
   model services.

Two admin-editable blocks sit at the top of the file, clearly marked:

- `DEFAULT_CONFIG` — bake in your endpoint URLs and model names (never tokens).
- The CSP `<meta>` — replace `connect-src https: http:` with your exact
  route origins to pin the file to your infrastructure.

## Security model (summary)

- Tokens live in JS memory; persistence requires an explicit double opt-in
  with a shared-machine warning. "Clear session" wipes everything.
- All LLM/document/project-file strings enter the DOM via `textContent` or a
  DOMPurify pass with a tight allowlist (`b i em strong ul ol li br code`);
  chart numbers are `Number()`-coerced and bounds-checked. Imported project
  files are re-validated and re-sanitized.
- The app ships a CSP; exported decks get `connect-src 'none'` — a deck can
  never phone home or carry stored XSS onto another machine.
- Documents are sent only to the configured LLM endpoint; image prompts only
  to Flux2. No telemetry, no logging of content.

## Repository layout

```
src/index.html      app shell + build directives (+ DEFAULT_CONFIG block)
src/css/            app chrome styles; deck.css = slide layouts + themes
src/js/             one module per concern (config, ingest, llm, schema,
                    editor, charts, render, visuals, exporter, app)
build/build.mjs     single-file assembler + offline-guarantee check
tools/mock-server.mjs  dev-only mock of both endpoints (with CORS)
test/e2e.mjs        Playwright end-to-end smoke test (33 checks)
test/screenshot.mjs renders demo deck at several sizes (zoom-safety proof)
dist/slideforge.html  ← the shipped artifact
docs/SPEC.md        the specification this implements
```

## Developing

```bash
npm install          # connected machine only (vendors the libraries)
npm run build        # → dist/slideforge.html (+ NFR-1 offline check)
npm run mock         # mock LLM/Flux2 + static host on :8787
npm test             # build + e2e suite
```

Custom org theme: copy a theme block at the top of `src/css/deck.css`,
adjust the CSS variables, add an `<option>` to both theme selectors in
`src/index.html`, rebuild.

## Known deviations / open items (tracked from the spec)

- **OQ-1** Flux2 contract is assumed OpenAI-images-style; the adapter is a
  single function (`generateImage` in `src/js/visuals.js`) and also accepts
  `images: [...]` bodies and raw `image/*` responses. Confirm against the
  real OpenShift AI runtime before rollout.
- **OQ-2 / CSP** `connect-src` ships broad because endpoints are
  user-configurable; admins should pin it (see Deployment).
- PDF export uses the print dialog with a print-optimized layout; charts and
  images print as raster.
- Speaker-notes window requires pop-ups to be allowed for the app's origin.
