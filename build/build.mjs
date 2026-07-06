#!/usr/bin/env node
/**
 * SlideForge Offline — single-file build.
 *
 * Run on a CONNECTED dev machine (needs node_modules via `npm install`);
 * the produced dist/slideforge.html is the artifact that enters the
 * air-gapped network. See BUILD.md.
 *
 * Steps:
 *   1. Read src/index.html and expand the <!--@js/@css/@b64 ...--> directives,
 *      inlining app modules, vendored libraries, and the Inter font.
 *   2. Escape "</script" inside inlined JS so the HTML parser can't
 *      terminate early (the \/ escape is a no-op for the JS engine).
 *   3. Inject version + build date.
 *   4. Offline-guarantee check (NFR-1): no external URL can be referenced
 *      by markup of the final file.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
const readBuf = (p) => readFileSync(resolve(root, p));

const VERSION = JSON.parse(read("package.json")).version || "0.0.0";
const BUILD_DATE = new Date().toISOString().slice(0, 10);

/* `</script` (any case) inside inline JS would end the <script> element.
   Replacing with `<\/script` is transparent to the JS engine (inside string
   literals and regexes `\/` === `/`). */
const scriptSafe = (js) => js.replace(/<\/(script)/gi, "<\\/$1");

const FONTS = [
  ["latin", "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212"],
  ["latin-ext", "node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2", "U+0100-02AF, U+0300-0301, U+1E00-1EFF, U+2113"],
  ["cyrillic", "node_modules/@fontsource-variable/inter/files/inter-cyrillic-wght-normal.woff2", "U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116"],
  ["greek", "node_modules/@fontsource-variable/inter/files/inter-greek-wght-normal.woff2", "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF"],
];

function fontCss() {
  return FONTS.map(([subset, path, range]) => {
    const b64 = readBuf(path).toString("base64");
    return `/* Inter variable (${subset}) — OFL license */
@font-face {
  font-family: "InterVariable";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url(data:font/woff2;base64,${b64}) format("woff2-variations");
  unicode-range: ${range};
}`;
  }).join("\n");
}

let html = read("src/index.html");

/* expand directives */
html = html.replace(/<!--@(js|css|b64) id="([^"]+)"(?: src="([^"]+)")?( font-inline)?-->/g, (m, kind, id, src, font) => {
  if (font) return `<style id="${id}">\n${fontCss()}\n</style>`;
  const content = read(src);
  if (kind === "css") return `<style id="${id}">\n${content}\n</style>`;
  if (kind === "b64") return `<script type="text/plain" id="${id}">${readBuf(src).toString("base64")}</script>`;
  return `<script id="${id}">\n${scriptSafe(content)}\n</script>`;
});

html = html.replace(/__VERSION__/g, VERSION).replace(/__BUILD_DATE__/g, BUILD_DATE);
html = html.replace("</title>", `</title>\n<meta name="sf-version" content="${VERSION} (${BUILD_DATE})">`);

/* ---------- offline-guarantee check (NFR-1) ----------
   Scan markup + inline CSS only: script BODIES are inert JS strings until
   executed, and everything they touch is covered by the CSP (connect-src). */
const markupOnly = html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2");
const violations = [];
for (const re of [
  /<script[^>]+src\s*=/gi,           // external scripts
  /<link[^>]+href\s*=/gi,            // external stylesheets
  /<img[^>]+src\s*=\s*["']?https?:/gi,
  /url\(\s*["']?https?:/gi,          // css url() to network
  /@import/gi,
  /<iframe/gi,
]) {
  const m = markupOnly.match(re);
  if (m) violations.push(`${re} → ${m.length}x, e.g. ${JSON.stringify(m[0])}`);
}
if (violations.length) {
  console.error("OFFLINE CHECK FAILED — external references found in markup:");
  violations.forEach((v) => console.error("  " + v));
  process.exit(1);
}
/* leftover directives / placeholders would mean a broken build */
if (/<!--@(js|css|b64)/.test(html) || /__VERSION__|__BUILD_DATE__/.test(html)) {
  console.error("BUILD FAILED — unexpanded directive or placeholder remains.");
  process.exit(1);
}

mkdirSync(resolve(root, "dist"), { recursive: true });
const out = resolve(root, "dist/slideforge.html");
writeFileSync(out, html);
console.log(`✔ dist/slideforge.html — ${(html.length / 1048576).toFixed(2)} MB (version ${VERSION}, ${BUILD_DATE})`);
console.log("  Offline check passed: no external references in markup.");
