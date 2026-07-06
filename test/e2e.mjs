#!/usr/bin/env node
/**
 * End-to-end smoke test: drives the full wizard against tools/mock-server.mjs.
 *   node test/e2e.mjs
 * Assumes `node build/build.mjs` has been run. Starts its own mock server.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8791;
const BASE = `http://localhost:${PORT}`;
let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? "  ✔ " : "  ✘ ") + name + (cond ? "" : (extra ? " — " + extra : "")));
  if (!cond) failures++;
};

const server = spawn(process.execPath, ["tools/mock-server.mjs", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 700));

/* use the environment's chromium if playwright's own download is absent */
import { existsSync } from "node:fs";
const fallbackChrome = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath = process.env.SF_CHROMIUM || (existsSync(fallbackChrome) ? fallbackChrome : undefined);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => { console.log("  ✘ page error: " + e.message); failures++; });

try {
  console.log("1. app loads");
  await page.goto(BASE + "/");
  check("title", (await page.title()) === "SlideForge Offline");
  check("setup panel shown first", await page.isVisible("#panel-1"));

  console.log("2. configure + test connections");
  await page.fill("#cfg-llm-base", BASE);
  await page.fill("#cfg-llm-model", "mock-glm");
  await page.fill("#cfg-llm-token", "test-token");
  await page.fill("#cfg-flux-base", BASE);
  await page.fill("#cfg-flux-token", "test-token");
  await page.click("#btn-test-llm");
  await page.waitForSelector("#llm-test-result.ok", { timeout: 10000 });
  check("LLM connectivity test", true);
  await page.click("#btn-test-flux");
  await page.waitForSelector("#flux-test-result.ok", { timeout: 10000 });
  check("Flux connectivity test", true);
  await page.click("#btn-setup-done");
  check("moved to upload", await page.isVisible("#panel-2"));

  console.log("3. ingest (paste path + txt upload path)");
  await page.click("#paste-fallback summary");
  await page.fill("#paste-area", "Infrastructure report.\n\nWe migrated 40 services. Uptime was 99.1, 99.5, 99.8, 99.95 across quarters.");
  await page.click("#btn-use-pasted");
  await page.waitForSelector("#doc-preview-wrap:not([hidden])");
  check("preview shows extracted text", (await page.inputValue("#doc-preview")).includes("Infrastructure"));
  const tmp = mkdtempSync(join(tmpdir(), "sf-"));
  const txtPath = join(tmp, "doc.txt");
  writeFileSync(txtPath, "# Report\n\nQuarterly infrastructure review with uptime data 99.1 99.5 99.8 99.95.");
  await page.setInputFiles("#file-input", txtPath);
  await page.waitForFunction(() => document.querySelector("#doc-preview").value.includes("Report"));
  check("txt upload extracted", true);
  await page.click("#btn-to-generate");

  console.log("4. outline generation (fenced-JSON path)");
  await page.click("#btn-generate");
  await page.waitForSelector("#panel-4:not([hidden])", { timeout: 20000 });
  const cardCount = await page.locator(".slide-card").count();
  check("editor shows 5 slide cards", cardCount === 5, "got " + cardCount);
  check("deck title populated", (await page.inputValue("#deck-title")) === "Quarterly Infrastructure Review");

  console.log("5. editing: bullets, undo, add slide, regenerate");
  const firstBullet = page.locator(".slide-card").nth(1).locator(".bullet-row input").first();
  await firstBullet.fill("Edited bullet text");
  await page.waitForTimeout(1000);
  await page.click("#btn-add-slide");
  check("add slide → 6 cards", (await page.locator(".slide-card").count()) === 6);
  await page.click("#btn-undo");
  check("undo removes added slide", (await page.locator(".slide-card").count()) === 5);
  await page.locator(".slide-card").nth(1).locator("button:has-text('Regenerate')").click();
  await page.waitForFunction(() => {
    const inp = document.querySelectorAll(".slide-card .slide-title-input")[1];
    return inp && inp.value.startsWith("Regenerated:");
  }, { timeout: 10000 });
  check("per-slide regeneration", true);

  console.log("6. approve → visuals");
  await page.click("#btn-approve");
  await page.waitForSelector("#panel-5:not([hidden])");
  check("image-prompt slide listed", (await page.locator(".visual-row").count()) === 1);
  await page.click("#btn-gen-all-images");
  await page.waitForSelector(".visual-row .thumb-box img", { timeout: 15000 });
  check("flux image generated + shown", true);
  await page.click("#btn-skip-visuals");

  console.log("7. preview (reveal.js)");
  await page.waitForSelector("#panel-6:not([hidden])");
  await page.waitForSelector("#reveal-slides section.present", { timeout: 10000 });
  const slideCount = await page.locator("#reveal-slides > section").count();
  check("reveal renders 5 sections", slideCount === 5, "got " + slideCount);
  const chartDrawn = await page.evaluate(() => {
    const cv = document.querySelector("canvas[data-sf-chart]");
    return !!cv && cv.toDataURL().length > 2000;
  });
  check("chart.js drew the chart", chartDrawn);
  const themed = await page.getAttribute(".reveal-viewport", "data-sf-theme");
  check("theme applied", themed === "corporate", String(themed));

  console.log("8. export deck + project");
  await page.click("#panel-6 [data-goto='7']");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-deck")]);
  const deckPath = join(tmp, "deck.html");
  await download.saveAs(deckPath);
  const deckHtml = readFileSync(deckPath, "utf8");
  check("deck is self-contained (no http refs in markup)",
    !/<(script|link|img)[^>]+(src|href)\s*=\s*["']https?:/i.test(deckHtml.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2")));
  check("deck has locked-down CSP", deckHtml.includes("connect-src 'none'"));
  check("chart baked to PNG", deckHtml.includes('class="sf-chart-png"') && deckHtml.includes("data:image/png;base64"));
  check("flux image embedded", deckHtml.includes("data:image/png;base64,iVBOR"));
  check("no token anywhere in deck", !deckHtml.includes("test-token"));

  const [projDl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-project")]);
  const projPath = join(tmp, "project.json");
  await projDl.saveAs(projPath);
  const proj = JSON.parse(readFileSync(projPath, "utf8"));
  check("project format + 5 slides", proj.format === "slideforge-project" && proj.outline.slides.length === 5);
  check("project has no tokens", !JSON.stringify(proj).includes("test-token"));

  console.log("9. exported deck opens standalone (file://) and presents");
  const deckPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  deckPage.on("pageerror", (e) => { console.log("  ✘ deck page error: " + e.message); failures++; });
  let extRequests = 0;
  await deckPage.route("**/*", (route) => {
    if (!route.request().url().startsWith("file://")) { extRequests++; return route.abort(); }
    route.continue();
  });
  await deckPage.goto("file://" + deckPath);
  await deckPage.waitForSelector("section.present", { timeout: 10000 });
  check("reveal initialized offline", true);
  check("zero network requests from deck", extRequests === 0, String(extRequests));
  await deckPage.keyboard.press("ArrowRight");
  await deckPage.waitForTimeout(400);
  const idx = await deckPage.evaluate(() => deck.getIndices().h);
  check("keyboard navigation works", idx === 1, "h=" + idx);
  const deckThemed = await deckPage.getAttribute(".reveal-viewport", "data-sf-theme");
  check("deck theme applied", deckThemed === "corporate", String(deckThemed));
  await deckPage.close();

  console.log("10. project re-import round-trip");
  await page.setInputFiles("#project-input", projPath);
  await page.waitForSelector("#panel-4:not([hidden])", { timeout: 10000 });
  check("project import returns to editor with slides", (await page.locator(".slide-card").count()) === 5);

  console.log("11. bad token → friendly error");
  await page.click("#btn-open-settings");
  await page.fill("#cfg-llm-token", "bad-token");
  await page.click("#btn-test-llm");
  await page.waitForSelector("#llm-test-result.fail", { timeout: 10000 });
  check("token-rejected message", (await page.textContent("#llm-test-result")).includes("Token rejected"));
} finally {
  await browser.close();
  server.kill();
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
