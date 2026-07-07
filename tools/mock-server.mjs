#!/usr/bin/env node
/**
 * Dev-only mock of the two internal services SlideForge talks to:
 *   POST /v1/chat/completions   (OpenAI-compatible LLM)
 *   POST /v1/images/generations (Flux2, OpenAI-images style)
 *   GET  /v1/models             (used by the Flux connectivity probe)
 * Also serves dist/slideforge.html at "/" (the recommended §7.4 option-1
 * deployment shape: static file + model routes with CORS).
 *
 * NOT part of the shipped artifact — local testing only.
 *   node tools/mock-server.mjs [port]
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8787);

/* a real 64x64 PNG (blue square), base64 */
import { deflateSync } from "node:zlib";
function makePng(size = 64, rgb = [36, 86, 214]) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = rgb[2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crcTable = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
    let crc = 0xffffffff;
    for (const b of body) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PNG_B64 = makePng().toString("base64");

const OUTLINE = {
  title: "Quarterly Infrastructure Review",
  subtitle: "Platform team briefing",
  language: "en",
  slides: [
    { id: "s1", layout: "title", title: "Quarterly Infrastructure Review", bullets: ["Platform team briefing"], notes: "Welcome everyone.", image_prompt: null, chart_spec: null },
    { id: "s2", layout: "bullets", title: "Key Achievements", bullets: ["Migrated 40 services to OpenShift", "Cut deploy time by **60%**", "Zero unplanned downtime"], notes: "Emphasize the migration effort.", image_prompt: null, chart_spec: null },
    { id: "s3", layout: "chart", title: "Uptime by Quarter", bullets: [], notes: "Data from the monitoring report.", image_prompt: null, chart_spec: { type: "bar", title: "Uptime %", labels: ["Q1", "Q2", "Q3", "Q4"], datasets: [{ label: "Uptime", data: [99.1, 99.5, 99.8, 99.95] }] } },
    { id: "s4", layout: "bullets_image", title: "Next Steps", bullets: ["Roll out GPU nodes", "Expand internal AI services", "Quarterly security audits"], notes: "", image_prompt: "server room with glowing racks, isometric illustration", chart_spec: null },
    { id: "s5", layout: "quote", title: "", bullets: ["Boring infrastructure is a feature, not a bug", "Site Reliability Handbook"], notes: "", image_prompt: null, chart_spec: null },
  ],
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function readBody(req) {
  return new Promise((res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => res(b));
  });
}

createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const auth = req.headers.authorization || "";
  console.log(new Date().toISOString(), req.method, req.url);

  if (req.url === "/" || req.url === "/slideforge.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(readFileSync(resolve(root, "dist/slideforge.html")));
  }
  if (req.url === "/v1/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ object: "list", data: [{ id: "mock-glm" }, { id: "mock-flux2" }] }));
  }
  if (!auth.startsWith("Bearer ") || auth === "Bearer bad-token") {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: { message: "invalid token" } }));
  }
  if (req.url === "/v1/chat/completions") {
    const body = JSON.parse(await readBody(req));
    const userMsg = (body.messages.find((m) => m.role === "user") || {}).content || "";
    const sysMsg = (body.messages.find((m) => m.role === "system") || {}).content || "";
    let content;
    if (/^You summarize document sections/.test(sysMsg)) content = "Summary: " + userMsg.slice(0, 300);
    else if (/ONE slide/i.test(sysMsg)) {
      const m = userMsg.match(/current JSON.:\s*(\{[\s\S]*?\})\n\nInstruction/);
      const slide = m ? JSON.parse(m[1]) : OUTLINE.slides[1];
      slide.title = "Regenerated: " + (slide.title || "slide");
      content = JSON.stringify(slide);
    } else if (/pong/i.test(userMsg)) content = "pong";
    else content = "```json\n" + JSON.stringify(OUTLINE) + "\n```"; // fenced on purpose: exercises the parser
    /* emulate reasoning runtimes: on a small max_tokens budget, content comes
       back null with the text in reasoning_content (seen on GLM/vLLM) */
    const message = body.max_tokens && body.max_tokens < 100
      ? { role: "assistant", content: null, reasoning_content: content }
      : { role: "assistant", content };
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ id: "mock", object: "chat.completion", model: body.model, choices: [{ index: 0, message, finish_reason: "stop" }] }));
  }
  if (req.url === "/v1/images/generations") {
    await readBody(req);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ created: Date.now(), data: [{ b64_json: PNG_B64 }] }));
  }
  if (req.url === "/generate_image") { /* FastAPI-style custom contract */
    const body = JSON.parse(await readBody(req) || "{}");
    if (!body.prompt) { res.writeHead(422, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ detail: [{ msg: "field required", loc: ["body", "prompt"] }] })); }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ image: PNG_B64, width: body.width || 1344, height: body.height || 768 }));
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: "not found" } }));
}).listen(PORT, () => console.log(`mock LLM/Flux2 + static host on http://localhost:${PORT}`));
