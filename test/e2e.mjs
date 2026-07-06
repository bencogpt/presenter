#!/usr/bin/env node
/**
 * End-to-end smoke test: drives the workspace UI against tools/mock-server.mjs.
 *   node test/e2e.mjs
 * Assumes `node build/build.mjs` has been run. Starts its own mock server.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
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
const fallbackChrome = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath = process.env.SF_CHROMIUM || (existsSync(fallbackChrome) ? fallbackChrome : undefined);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("pageerror", (e) => { console.log("  ✘ page error: " + e.message); failures++; });

try {
  console.log("1. app loads → settings dialog auto-opens (no wizard step)");
  await page.goto(BASE + "/");
  check("title", (await page.title()) === "SlideForge Offline");
  await page.waitForSelector("#dlg-settings[open]", { timeout: 5000 });
  check("settings dialog auto-opened on first run", true);
  check("empty-state preview visible behind dialog", await page.isVisible("#preview-empty"));

  console.log("2. configure inside the dialog + connection tests");
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
  await page.click("#btn-settings-done");
  check("settings dialog closed", !(await page.isVisible("#dlg-settings")));

  console.log("3. sidebar: paste text + txt upload");
  await page.click("#paste-fallback summary");
  await page.fill("#paste-area", "Infrastructure report.\n\nWe migrated 40 services. Uptime was 99.1, 99.5, 99.8, 99.95 across quarters.");
  await page.click("#btn-use-pasted");
  await page.waitForSelector("#doc-chip:not([hidden])");
  check("doc chip shown", true);
  check("generate section revealed", await page.isVisible("#side-generate"));
  const tmp = mkdtempSync(join(tmpdir(), "sf-"));
  const txtPath = join(tmp, "doc.txt");
  writeFileSync(txtPath, "# Report\n\nQuarterly infrastructure review with uptime data 99.1 99.5 99.8 99.95.");
  await page.setInputFiles("#file-input", txtPath);
  await page.waitForFunction(() => document.querySelector("#doc-preview").value.includes("Report"));
  check("txt upload extracted into trim view", true);

  console.log("4. generate → cards in sidebar + live preview in main stage");
  await page.click("#btn-generate");
  await page.waitForSelector("#side-slides:not([hidden])", { timeout: 20000 });
  check("slide cards section shown", (await page.locator(".slide-card").count()) === 5);
  check("deck title populated", (await page.inputValue("#deck-title")) === "Quarterly Infrastructure Review");
  /* visuals dialog auto-opens since the outline has image prompts */
  await page.waitForSelector("#dlg-visuals[open]", { timeout: 5000 });
  check("images dialog offered after generation", true);
  await page.click("#btn-gen-all-images");
  await page.waitForSelector(".visual-row .thumb-box img", { timeout: 15000 });
  check("flux image generated + shown", true);
  await page.click("#dlg-visuals [data-close]");
  await page.waitForSelector("#reveal-slides section.present", { timeout: 10000 });
  const slideCount = await page.locator("#reveal-slides > section").count();
  check("live preview renders 5 sections", slideCount === 5, "got " + slideCount);
  check("deck actions in header", await page.isVisible("#btn-export"));

  console.log("5. editing: live refresh, undo, card→preview navigation");
  await page.click("#btn-add-slide");
  check("add slide → 6 cards", (await page.locator(".slide-card").count()) === 6);
  await page.waitForFunction(() => document.querySelectorAll("#reveal-slides > section").length === 6, { timeout: 5000 });
  check("live preview picked up new slide", true);
  await page.click("#btn-undo");
  check("undo removes added slide", (await page.locator(".slide-card").count()) === 5);
  await page.locator(".slide-card").nth(2).click();
  await page.waitForTimeout(1200);
  const idxAfterClick = await page.evaluate(() => SF.render.getDeck().getIndices().h);
  check("clicking card 3 navigates preview", idxAfterClick === 2, "h=" + idxAfterClick);
  await page.locator(".slide-card").nth(1).locator("button:has-text('Regenerate')").click();
  await page.waitForFunction(() => {
    const inp = document.querySelectorAll(".slide-card .slide-title-input")[1];
    return inp && inp.value.startsWith("Regenerated:");
  }, { timeout: 10000 });
  check("per-slide regeneration", true);

  console.log("6. export dialog: deck + project");
  await page.click("#btn-export");
  await page.waitForSelector("#dlg-export[open]");
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

  console.log("7. exported deck opens standalone (file://) and presents");
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
  await deckPage.close();

  console.log("8. project re-import round-trip");
  await page.setInputFiles("#project-input", projPath);
  await page.waitForFunction(() => document.querySelectorAll(".slide-card").length === 5, { timeout: 10000 });
  check("project import restores slides", true);
  check("export dialog closed after import", !(await page.isVisible("#dlg-export")));

  console.log("9. Hebrew UI (RTL)");
  await page.click("#btn-lang");
  await page.waitForTimeout(200);
  check("dir=rtl on <html>", (await page.getAttribute("html", "dir")) === "rtl");
  check("lang=he on <html>", (await page.getAttribute("html", "lang")) === "he");
  const srcTitle = await page.textContent("#side-source h2");
  check("sidebar heading translated", srcTitle.includes("מסמך מקור"), srcTitle);
  const genBtn = await page.textContent("#btn-generate");
  check("generate button translated (regenerate state)", genBtn.includes("צור מתאר מחדש"), genBtn);
  const cardBtn = await page.locator(".slide-card").first().locator("button[title]").first();
  check("dynamic card content translated", (await page.locator(".slide-card select option").first().textContent()) === "כותרת");
  await page.click("#btn-lang");
  await page.waitForTimeout(200);
  check("toggle back to English", (await page.getAttribute("html", "dir")) === "ltr");

  console.log("10. bad token → friendly error (settings dialog)");
  await page.click("#btn-open-settings");
  await page.waitForSelector("#dlg-settings[open]");
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
