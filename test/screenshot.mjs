#!/usr/bin/env node
/* Captures the workspace UI (EN + HE) and the exported deck at several
   window sizes to prove the 16:9 canvas scales without breaking.
   node test/screenshot.mjs [outdir] */
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

/* configure via the settings dialog */
await page.goto(`http://localhost:${PORT}/`);
await page.waitForSelector("#dlg-settings[open]");
await page.screenshot({ path: join(out, "settings-dialog.png") });
await page.fill("#cfg-llm-base", `http://localhost:${PORT}`);
await page.fill("#cfg-llm-model", "mock-glm");
await page.fill("#cfg-llm-token", "t");
await page.fill("#cfg-flux-base", `http://localhost:${PORT}`);
await page.fill("#cfg-flux-token", "t");
await page.click("#btn-settings-done");
await page.screenshot({ path: join(out, "workspace-empty.png") });

/* load a document + generate */
await page.click("#paste-fallback summary");
await page.fill("#paste-area", "Quarterly infrastructure report with uptime data.");
await page.click("#btn-use-pasted");
await page.click("#btn-generate");
await page.waitForSelector("#dlg-visuals[open]", { timeout: 20000 });
await page.click("#btn-gen-all-images");
await page.waitForSelector(".visual-row .thumb-box img", { timeout: 15000 });
await page.screenshot({ path: join(out, "images-dialog.png") });
await page.click("#dlg-visuals [data-close]");
await page.waitForSelector("#reveal-slides section.present", { timeout: 10000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: join(out, "workspace-preview.png") });

/* Hebrew RTL */
await page.click("#btn-lang");
await page.waitForTimeout(400);
await page.screenshot({ path: join(out, "workspace-hebrew.png") });
await page.click("#btn-lang");
await page.waitForTimeout(300);

/* export deck + verify scaling at several sizes */
await page.click("#btn-export");
await page.waitForSelector("#dlg-export[open]");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-deck")]);
const deckPath = join(out, "deck.html");
await dl.saveAs(deckPath);

const deck = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await deck.goto("file://" + process.cwd() + "/" + deckPath);
await deck.waitForSelector("section.present");
await deck.waitForTimeout(500);
const scaleAt = async () => deck.evaluate(() => getComputedStyle(document.querySelector(".reveal .slides")).transform);
const t1080 = await scaleAt();
for (let i = 0; i < 2; i++) { await deck.keyboard.press("ArrowRight"); await deck.waitForTimeout(1100); }
await deck.screenshot({ path: join(out, "deck-chart-1080p.png") });
await deck.setViewportSize({ width: 640, height: 360 });
await deck.waitForTimeout(400);
const t360 = await scaleAt();
await deck.setViewportSize({ width: 2560, height: 1440 });
await deck.waitForTimeout(400);
const t1440 = await scaleAt();
console.log("transform @1080p:", t1080, "| @360p:", t360, "| @1440p:", t1440);
console.log("scaling responds to window size (zoom-safe):", t1080 !== t360 && t360 !== t1440 ? "YES" : "NO");
await browser.close(); server.kill();
