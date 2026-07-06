# Building `slideforge.html`

The build runs **once, on a connected machine**. The produced single file is
what enters the air-gapped network (spec §6, NFR-5).

## Prerequisites

- Node.js ≥ 20 (no global tools needed)
- `npm install` — pulls the vendored libraries:

| Library | File inlined | License |
|---|---|---|
| reveal.js 5 | `dist/reveal.js`, `dist/reveal.css`, `plugin/notes/notes.js` | MIT |
| mammoth 1.x | `mammoth.browser.min.js` | BSD-2 |
| pdfjs-dist 3.11.174 (last UMD build) | `build/pdf.min.js` + worker (base64) | Apache-2.0 |
| chart.js 4 | `dist/chart.umd.js` | MIT |
| dompurify 3 | `dist/purify.min.js` | Apache-2.0/MPL |
| @fontsource-variable/inter | latin, latin-ext, cyrillic, greek woff2 (base64) | OFL |

## Build

```bash
node build/build.mjs        # or: npm run build
```

Output: `dist/slideforge.html` (~3 MB). The version string comes from
`package.json` and is embedded in the footer, exported decks and project
files (NFR-6).

## What the build script does

1. Expands the `<!--@js/@css/@b64 ...-->` directives in `src/index.html`,
   inlining every module/library/font. Each asset lands in its own
   `<script id=…>` / `<style id=…>` tag — the exporter re-reads those tags at
   runtime to compose standalone decks without duplicating anything.
2. Escapes `</script` sequences inside inlined JS (`<\/script`), which is
   byte-identical to the JS engine but keeps the HTML parser from
   terminating the script element early.
3. The pdf.js **worker** is embedded as base64 in a `text/plain` script tag
   and turned into a `Blob` URL at runtime (spec R-2).
4. **Offline-guarantee check (NFR-1):** after assembly it strips script
   bodies and fails the build if any markup/CSS references an external URL
   (`<script src>`, `<link href>`, `url(http…)`, `@import`, `<iframe>`, …).

Verify by hand: open dist with DevTools → Network while offline; the only
requests ever made are to the endpoints configured in Settings.

## Testing

```bash
npm run mock   # OpenAI-compatible LLM + Flux2 mock with CORS on :8787
npm test       # build + Playwright e2e (full wizard → export → file:// deck)
node test/screenshot.mjs   # renders the demo deck at 3 window sizes
```

## Releasing a new version

1. Bump `version` in `package.json`.
2. `npm run build` && `npm test`.
3. Optionally edit `DEFAULT_CONFIG` and the CSP `connect-src` in
   `dist/slideforge.html` (both clearly marked near the top) to pin your
   org's endpoints before distributing.
