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

  console.log("3b. docx + pdf extraction (mammoth / pdf.js)");
  await page.setInputFiles("#file-input", "test/fixtures/sample.docx");
  await page.waitForFunction(() => document.querySelector("#doc-preview").value.includes("Docx Ingestion Report"), { timeout: 15000 });
  const docxText = await page.inputValue("#doc-preview");
  check("docx heading preserved as structure hint", docxText.includes("# Docx Ingestion Report"));
  check("docx body extracted", docxText.includes("99.95"));
  await page.setInputFiles("#file-input", "test/fixtures/sample.pdf");
  await page.waitForFunction(() => document.querySelector("#doc-preview").value.includes("PDF Ingestion Report"), { timeout: 20000 });
  check("pdf text extracted via inlined worker", (await page.inputValue("#doc-preview")).includes("sixty percent"));

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
  await page.click("#btn-redo");
  check("redo restores added slide", (await page.locator(".slide-card").count()) === 6);
  await page.click("#btn-undo");
  check("undo again back to 5", (await page.locator(".slide-card").count()) === 5);
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

  console.log("5b. reveal.js features: transition, fragments, hide slide");
  await page.selectOption("#deck-transition", "fade");
  await page.check("#deck-fragments");
  await page.waitForFunction(() => document.querySelectorAll("#reveal-slides li.fragment").length > 0, { timeout: 5000 });
  check("fragments applied in live preview", true);
  await page.locator(".slide-card").nth(4).locator('button:has-text("👁")').click();
  await page.waitForTimeout(800);
  check("slide card marked skipped", await page.locator(".slide-card").nth(4).evaluate((n) => n.classList.contains("skipped")));
  check("preview skips hidden slide", await page.evaluate(() => !!document.querySelector('#reveal-slides section[data-visibility="hidden"]')));

  console.log("6. export dialog: deck + project");
  await page.click("#btn-export");
  await page.waitForSelector("#dlg-export[open]");
  await page.check("#exp-kiosk");
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
  check("transition setting exported", deckHtml.includes('transition: "fade"'));
  check("fragments exported", deckHtml.includes('class="fragment"'));
  check("hidden slide exported as data-visibility=hidden", deckHtml.includes('data-visibility="hidden"'));
  check("kiosk auto-advance + loop exported", deckHtml.includes("autoSlide: 8000") && deckHtml.includes("loop: true"));
  check("zoom + search plugins embedded", deckHtml.includes("RevealZoom") && deckHtml.includes("RevealSearch"));

  const [projDl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-project")]);
  const projPath = join(tmp, "project.json");
  await projDl.saveAs(projPath);
  const proj = JSON.parse(readFileSync(projPath, "utf8"));
  check("project format + 5 slides", proj.format === "slideforge-project" && proj.outline.slides.length === 5);
  check("project has no tokens", !JSON.stringify(proj).includes("test-token"));

  console.log("6c. export with live interactive charts");
  await page.check("#exp-live-charts");
  await page.uncheck("#exp-kiosk");
  const [liveDl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-deck")]);
  const livePath = join(tmp, "deck-live.html");
  await liveDl.saveAs(livePath);
  const liveHtml = readFileSync(livePath, "utf8");
  check("live deck embeds Chart.js + specs", liveHtml.includes("data-sf-chart-spec") && liveHtml.includes("__sfChartCfg"));
  const livePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await livePage.goto("file://" + livePath);
  await livePage.waitForSelector("section.present", { timeout: 10000 });
  const liveChartPainted = await livePage.evaluate(() => {
    const cv = document.querySelector("canvas[data-sf-chart-spec]");
    return !!cv && cv.toDataURL().length > 2000;
  });
  check("live chart rendered offline in exported deck", liveChartPainted);
  await livePage.close();
  await page.uncheck("#exp-live-charts");
  await page.check("#exp-kiosk");

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
  await page.waitForFunction(() => !document.querySelector("#dlg-export").open, { timeout: 10000 }); // import closes the dialog when done
  check("export dialog closed after import", true);
  check("project import restores slides", (await page.locator(".slide-card").count()) === 5);
  check("hidden-slide flag survives project round-trip", await page.locator(".slide-card").nth(4).evaluate((n) => n.classList.contains("skipped")));
  check("deck options restored from project", (await page.inputValue("#deck-transition")) === "fade" && (await page.isChecked("#deck-fragments")));

  console.log("8b. JSON mode sends response_format and still generates");
  await page.click("#btn-open-settings");
  await page.waitForSelector("#dlg-settings[open]");
  await page.locator("#dlg-settings > details > summary").first().click(); // expand Advanced
  await page.check("#cfg-json-mode");
  await page.click("#btn-settings-done");
  let sawResponseFormat = false;
  await page.route("**/v1/chat/completions", (route) => {
    try { const b = JSON.parse(route.request().postData() || "{}"); if (b.response_format && b.response_format.type === "json_object") sawResponseFormat = true; } catch (e) {}
    route.continue();
  });
  await page.click("#btn-generate");
  await page.locator("#modal-buttons .btn-primary").click(); // confirm regenerate
  await page.waitForFunction(() => document.querySelector("#gen-status").textContent.includes("✔"), { timeout: 20000 });
  check("generation succeeded in JSON mode", true);
  check("request carried response_format json_object", sawResponseFormat);
  await page.unroute("**/v1/chat/completions");
  if (await page.isVisible("#dlg-visuals")) await page.click("#dlg-visuals [data-close]");
  await page.click("#btn-open-settings");
  await page.waitForSelector("#dlg-settings[open]");
  await page.uncheck("#cfg-json-mode"); // Advanced still expanded from above
  await page.click("#btn-settings-done");

  console.log("8c. content-source modes change the request");
  const prompts = [];
  await page.route("**/v1/chat/completions", (route) => {
    try { const b = JSON.parse(route.request().postData() || "{}"); prompts.push({ sys: b.messages[0].content, user: b.messages[b.messages.length - 1].content }); } catch (e) {}
    route.continue();
  });
  await page.selectOption("#gen-source", "prompt");
  await page.click("#btn-generate");
  await page.locator("#modal-buttons .btn-primary").click();
  await page.waitForFunction(() => document.querySelector("#gen-status").textContent.includes("✔"), { timeout: 20000 });
  check("topic mode: system prompt switches to TOPIC MODE", prompts.some((m) => m.sys.includes("TOPIC MODE")));
  check("topic mode: input labeled as BRIEF", prompts.some((m) => m.user.includes("<<<BRIEF")));
  if (await page.isVisible("#dlg-visuals")) await page.click("#dlg-visuals [data-close]");
  prompts.length = 0;
  await page.selectOption("#gen-source", "document");
  await page.click("#btn-generate");
  await page.locator("#modal-buttons .btn-primary").click();
  await page.waitForFunction(() => document.querySelector("#gen-status").textContent.includes("✔"), { timeout: 20000 });
  check("document mode: STRICT SOURCE MODE in system prompt", prompts.some((m) => m.sys.includes("STRICT SOURCE MODE")));
  check("document mode: input labeled as DOCUMENT", prompts.some((m) => m.user.includes("<<<DOCUMENT")));
  await page.unroute("**/v1/chat/completions");
  if (await page.isVisible("#dlg-visuals")) await page.click("#dlg-visuals [data-close]");

  console.log("8d. Hebrew document → RTL slides");
  await page.evaluate(() => { document.querySelector("#paste-fallback").open = true; });
  await page.fill("#paste-area", "דוח תשתיות רבעוני. הצוות היגר ארבעים שירותים לענן וקיצר את זמן הפריסה בשישים אחוז. לא נרשמו השבתות לא מתוכננות ברבעון האחרון.");
  await page.click("#btn-use-pasted");
  await page.click("#btn-generate");
  await page.locator("#modal-buttons .btn-primary").click();
  await page.waitForFunction(() => document.querySelector("#gen-status").textContent.includes("✔"), { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll("#reveal-slides > section").length === 2, { timeout: 8000 });
  const rtl = await page.evaluate(() => {
    const sec = document.querySelector('#reveal-slides section.sf-l-bullets');
    const li = sec && sec.querySelector("li");
    return sec && li ? {
      dir: sec.getAttribute("dir"),
      align: getComputedStyle(sec).textAlign,
      liDir: li.getAttribute("dir"),
      markerRight: getComputedStyle(li, "::before").right !== "auto" && getComputedStyle(li).paddingRight !== "0px",
    } : null;
  });
  check("Hebrew slide gets explicit dir=rtl", rtl && rtl.dir === "rtl", JSON.stringify(rtl));
  check("Hebrew slide text right-aligned", rtl && rtl.align === "right");
  check("bullets flip to the right side", rtl && rtl.liDir === "rtl" && rtl.markerRight);
  /* export the Hebrew deck and confirm RTL carries into the standalone file */
  await page.click("#btn-export");
  await page.waitForSelector("#dlg-export[open]");
  const [heDl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-deck")]);
  const hePath = join(tmp, "deck-he.html");
  await heDl.saveAs(hePath);
  check("exported Hebrew deck keeps dir=rtl sections", readFileSync(hePath, "utf8").includes('dir="rtl"'));
  await page.click("#dlg-export .dlg-close");

  console.log("8e. large document (3000 notes ≈ 280k chars): chunked map-reduce");
  await page.evaluate(() => {
    let text = "";
    for (let i = 0; i < 3000; i++) text += `Note ${i}: the platform team migrated service number ${i} and reduced deploy time measurably.\n\n`;
    document.querySelector("#paste-fallback").open = true;
    document.querySelector("#paste-area").value = text;
  });
  await page.click("#btn-use-pasted");
  await page.waitForFunction(() => !document.querySelector("#chunk-notice").hidden, { timeout: 5000 });
  check("over-cap notice shown for 280k chars", true);
  await page.click("#btn-generate");
  await page.locator("#modal-buttons .btn-primary").click();
  await page.waitForFunction(() => document.querySelector("#gen-status").textContent.includes("✔"), { timeout: 60000 });
  check("3000-note document → valid outline via chunked summarization", (await page.locator(".slide-card").count()) > 0);
  if (await page.isVisible("#dlg-visuals")) await page.click("#dlg-visuals [data-close]");

  console.log("8f. context overflow (cap raised past the model window) → actionable error");
  await page.click("#btn-open-settings");
  await page.waitForSelector("#dlg-settings[open]");
  await page.fill("#cfg-char-cap", "400000"); // whole 280k doc now goes in ONE call → mock rejects like vLLM
  await page.click("#btn-settings-done");
  await page.click("#btn-generate");
  await page.locator("#modal-buttons .btn-primary").click();
  await page.waitForFunction(() => !document.querySelector("#gen-error").hidden, { timeout: 30000 });
  const ctxMsg = await page.textContent("#gen-error-msg");
  check("context-overflow explained with the two knobs to fix", ctxMsg.includes("context window"), ctxMsg);
  await page.click("#btn-open-settings");
  await page.waitForSelector("#dlg-settings[open]");
  await page.fill("#cfg-char-cap", "60000");
  await page.click("#btn-settings-done");

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

  console.log("11. image test rejects a non-image endpoint");
  await page.fill("#cfg-flux-base", BASE + "/nowhere");
  await page.click("#btn-test-flux");
  await page.waitForSelector("#flux-test-result.fail", { timeout: 15000 });
  const fluxMsg = await page.textContent("#flux-test-result");
  check("clear 'not an image API' message", fluxMsg.includes("image-generation API"), fluxMsg);

  console.log("12. custom FastAPI image adapter (/generate_image)");
  await page.fill("#cfg-flux-base", BASE);
  await page.selectOption("#cfg-flux-api", "fastapi");
  await page.waitForTimeout(200);
  check("endpoint-path field appears for FastAPI style", await page.isVisible("#flux-path-row"));
  check("model-name field hidden for FastAPI style", !(await page.isVisible("#flux-model-row")));
  check("default path prefilled", (await page.inputValue("#cfg-flux-path")) === "/generate_image");
  await page.click("#btn-test-flux");
  await page.waitForSelector("#flux-test-result.ok", { timeout: 15000 });
  check("FastAPI-style image generated ({image: b64} response parsed)", true);
} finally {
  await browser.close();
  server.kill();
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
