#!/usr/bin/env node
/* Renders the demo deck at several window sizes to prove the 16:9 canvas
   scales without breaking, and saves screenshots. node test/screenshot.mjs [outdir] */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] || "test/shots";
mkdirSync(out, { recursive: true });
const PORT = 8793;
const server = spawn(process.execPath, ["tools/mock-server.mjs", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 700));
const fallbackChrome = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: existsSync(fallbackChrome) ? fallbackChrome : undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

/* drive the wizard to a rendered deck */
await page.goto(`http://localhost:${PORT}/`);
await page.fill("#cfg-llm-base", `http://localhost:${PORT}`);
await page.fill("#cfg-llm-model", "mock-glm");
await page.fill("#cfg-llm-token", "t");
await page.fill("#cfg-flux-base", `http://localhost:${PORT}`);
await page.fill("#cfg-flux-token", "t");
await page.click("#btn-setup-done");
await page.click("#paste-fallback summary");
await page.fill("#paste-area", "Quarterly infrastructure report.");
await page.click("#btn-use-pasted");
await page.click("#btn-to-generate");
await page.click("#btn-generate");
await page.waitForSelector("#panel-4:not([hidden])", { timeout: 20000 });
await page.screenshot({ path: join(out, "editor.png") });
await page.click("#btn-approve");
await page.waitForSelector("#panel-5:not([hidden])");
await page.click("#btn-gen-all-images");
await page.waitForSelector(".visual-row .thumb-box img", { timeout: 15000 });
await page.click("#btn-skip-visuals");
await page.waitForSelector("#reveal-slides section.present", { timeout: 10000 });
await page.waitForTimeout(600);

const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#panel-6 [data-goto='7']").then(() => page.click("#btn-export-deck"))]);
const deckPath = join(out, "deck.html");
await dl.saveAs(deckPath);

const deck = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await deck.goto("file://" + process.cwd() + "/" + deckPath);
await deck.waitForSelector("section.present");
await deck.waitForTimeout(500);
const scaleAt = async () => deck.evaluate(() => getComputedStyle(document.querySelector(".reveal .slides")).transform);
await deck.screenshot({ path: join(out, "deck-title-1080p.png") });
const t1080 = await scaleAt();
for (let i = 0; i < 2; i++) { await deck.keyboard.press("ArrowRight"); await deck.waitForTimeout(1100); }
await deck.screenshot({ path: join(out, "deck-chart-1080p.png") });
await deck.keyboard.press("ArrowRight"); await deck.waitForTimeout(1100);
await deck.screenshot({ path: join(out, "deck-image-1080p.png") });

/* zoom / resize behavior: reveal re-scales the fixed 1280x720 canvas */
await deck.setViewportSize({ width: 640, height: 360 });
await deck.waitForTimeout(1100);
const t360 = await scaleAt();
await deck.screenshot({ path: join(out, "deck-image-640w.png") });
await deck.setViewportSize({ width: 2560, height: 1440 });
await deck.waitForTimeout(1100);
const t1440 = await scaleAt();
console.log("transform @1080p:", t1080, "| @360p:", t360, "| @1440p:", t1440);
console.log("scaling responds to window size (zoom-safe):", t1080 !== t360 && t360 !== t1440 ? "YES" : "NO");
await browser.close(); server.kill();
