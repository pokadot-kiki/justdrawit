// ---------- ตรวจ "เขียนตัวหนังสือบนกระดาน" (กันโกง) ----------
// ไฟล์นี้ไม่ผูกกับ socket และ **ไม่รู้คำตอบเลย** — ทำแค่ "อ่านว่ามีตัวหนังสืออะไรบนภาพ" แล้วคืนข้อความ
// การเทียบกับคำตอบ + การลงโทษ อยู่ที่ index.js (เกมเป็นคนตัดสิน)
//
// ขั้นตอน:
//   1) renderPng  — server ไม่มีภาพ มีแต่ "ลิสต์การกระทำ" (เส้น รูปทรง) → วาดเป็น SVG แล้วให้ sharp แปลงเป็น PNG
//   2) looksLikeText — ตัวกรองถูกๆ จากรูปร่างเส้น (ไม่ใช่ตัวตัดสิน) ใช้แค่ "ประหยัดการเรียก OCR" กับภาพที่ไม่น่าเป็นตัวหนังสือ
//   3) readText   — ส่ง PNG ให้ Gemini (vision) อ่านตัวหนังสือ · คืน { text, confidence } หรือ null
//
// หลักสำคัญ: **ล้มเหลวแล้วปล่อยผ่าน (fail open)** — ไม่มี key, โควตาหมด, เน็ตล่ม, ตอบแปลก → คืน null
// เกมเดินต่อตามปกติ ไม่มีใครโดนลงโทษ และ server ไม่ล่ม
// เพิ่มผู้ให้บริการ OCR อื่นได้ (เช่น tesseract) โดยเพิ่มฟังก์ชันใน PROVIDERS แล้วตั้ง env OCR_PROVIDER

// ── ตั้งค่า (env ไว้ให้ deploy/เทส · ไม่ตั้ง = ค่าจริง) ──
const GEMINI_API_URL = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta";
// รุ่นที่ใช้อ่านตัวหนังสือ · เปลี่ยนได้ด้วย env GEMINI_MODEL (id ตรวจจาก models list ของ API แล้ว 10 ต.ค.)
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const API_TIMEOUT_MS = 15000; // ทดสอบจริงช่วงคนใช้เยอะ Gemini ตอบช้ากว่า 8 วิบ่อย · ตรวจแบบ async จึงไม่ขวางเกม
// เพดานรวมทั้ง server (ทุกห้องรวมกัน) · เกินแล้วข้ามการตรวจ (ไม่ใช่รอคิว)
// ตั้งให้ต่ำกว่าโควตาฟรีของ gemini-3.1-flash-lite (15 ครั้ง/นาที · 500 ครั้ง/วัน) เผื่อไว้ จะได้ไม่โดน 429 บ่อย
const GLOBAL_MAX_PER_MIN = Number(process.env.TEXT_CHECK_GLOBAL_PER_MIN) || 12;
const GLOBAL_MAX_PER_DAY = Number(process.env.TEXT_CHECK_GLOBAL_PER_DAY) || 450;
// โดน 429 (โควตาหมด) → พักทั้ง server 1 นาที (env TEXT_CHECK_BACKOFF_MS ไว้ให้เทสย่อเวลาเท่านั้น)
const QUOTA_BACKOFF_MS = Number(process.env.TEXT_CHECK_BACKOFF_MS) || 60000;

// ขนาดภาพที่ส่งไปอ่าน (4:3 เหมือนกระดาน) · พิกัดในเกมเป็น 0–1 จึงคูณขนาดนี้ได้ตรงๆ
const W = 640;
const H = 480;
const BOARD = "#ffffff";

// ── ผู้ให้บริการ OCR ──
const PROVIDERS = { gemini: geminiReadText };
const providerName = () => process.env.OCR_PROVIDER || "gemini";

// เปิดใช้ไหม: ปิดได้ด้วย TEXT_CHECK=off · gemini ต้องมี key (อยู่ใน server/.env หรือ env ของ Render เท่านั้น ห้ามอยู่ใน client)
function isEnabled() {
  if (process.env.TEXT_CHECK === "off") return false;
  if (!PROVIDERS[providerName()]) return false;
  if (providerName() === "gemini" && !process.env.GEMINI_API_KEY) return false;
  return Date.now() >= backoffUntil;
}

let backoffUntil = 0;
const recentCalls = []; // เวลาที่เรียก OCR ใน 1 นาทีล่าสุด (ทั้ง server)
const dayCalls = [];    // เวลาที่เรียก OCR ใน 24 ชั่วโมงล่าสุด (ทั้ง server · ไม่เกิน GLOBAL_MAX_PER_DAY ตัว)
function globalRateOk() {
  const now = Date.now();
  while (recentCalls.length && now - recentCalls[0] > 60000) recentCalls.shift();
  while (dayCalls.length && now - dayCalls[0] > 24 * 60 * 60 * 1000) dayCalls.shift();
  if (recentCalls.length >= GLOBAL_MAX_PER_MIN || dayCalls.length >= GLOBAL_MAX_PER_DAY) return false;
  recentCalls.push(now);
  dayCalls.push(now);
  return true;
}

// ── 1) วาดลิสต์การกระทำเป็นภาพ ──
// ops = room.canvasOps (ลิสต์ของ { events: [...] }) — ใช้ชุดเดียวกับที่ส่งให้คนเข้าห้องกลางตา (canvas_history)
// fill (ถังสี) ข้าม: SVG เทสีตามขอบไม่ได้ และการเทสีไม่ได้ทำให้เกิดตัวหนังสือ
const n = (v) => Math.round(v * 10) / 10; // ปัดทศนิยมให้ SVG สั้น
function opsToSvg(ops) {
  const parts = [];
  for (const op of ops) {
    const first = op.events[0];
    if (first.type === "clear_canvas") {
      parts.length = 0; // ล้างจอ = ทุกอย่างก่อนหน้าหายไป
    } else if (first.type === "stroke_start") {
      const pts = [`${n(first.x * W)},${n(first.y * H)}`];
      for (const ev of op.events) if (ev.type === "stroke_points") for (const p of ev.points) pts.push(`${n(p.x * W)},${n(p.y * H)}`);
      if (pts.length === 1) pts.push(pts[0]); // คลิกจุดเดียว ให้เป็นจุดกลม
      const color = first.tool === "eraser" ? BOARD : first.color;
      parts.push(`<polyline points="${pts.join(" ")}" stroke="${color}" stroke-width="${first.size}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else if (first.type === "draw_shape") {
      const s = first;
      const [x1, y1, x2, y2] = [s.x1 * W, s.y1 * H, s.x2 * W, s.y2 * H];
      const st = `stroke="${s.color}" stroke-width="${s.size}" fill="none" stroke-linejoin="round" stroke-linecap="round"`;
      if (s.shape === "line") parts.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${st}/>`);
      else if (s.shape === "rect") parts.push(`<rect x="${n(Math.min(x1, x2))}" y="${n(Math.min(y1, y2))}" width="${n(Math.abs(x2 - x1))}" height="${n(Math.abs(y2 - y1))}" ${st}/>`);
      else if (s.shape === "circle") parts.push(`<ellipse cx="${n((x1 + x2) / 2)}" cy="${n((y1 + y2) / 2)}" rx="${n(Math.abs(x2 - x1) / 2)}" ry="${n(Math.abs(y2 - y1) / 2)}" ${st}/>`);
      else if (s.shape === "triangle") parts.push(`<polygon points="${n((x1 + x2) / 2)},${n(y1)} ${n(x2)},${n(y2)} ${n(x1)},${n(y2)}" ${st}/>`);
    }
  }
  if (parts.length === 0) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="${BOARD}"/>${parts.join("")}</svg>`;
}

// คืน base64 ของ PNG หรือ null ถ้ากระดานว่าง
async function renderPng(ops) {
  const svg = opsToSvg(ops);
  if (!svg) return null;
  const sharp = require("sharp");
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return png.toString("base64");
}

// ── 2) ตัวกรองจากรูปร่างเส้น (เสริม ไม่ใช่ตัวตัดสิน) ──
// หน้าที่เดียว: ไม่เสียโควตาเรียก OCR กับกระดานที่ "เป็นตัวหนังสือไม่ได้แน่ๆ" = ว่าง หรือมีเส้นสั้นเส้นเดียว
// ไม่ดูขนาดเส้นแล้ว: เดิมนับแค่เส้นที่เล็กกว่า 45% ของกระดาน แต่ทดสอบจริงพบว่าคนเขียนคำตัวใหญ่ (สูงครึ่งกระดาน)
// วัดได้ 0.50 ทุกตัว → ถูกกรองทิ้งหมด Gemini ไม่ได้เห็นเลย (ตัวกรองที่แรงเกินเท่ากับปล่อยคนโกงหลุด)
// ผ่านเมื่อ: มีเส้น/รูปทรงตั้งแต่ 2 อันขึ้นไป (ขนาดไหนก็ได้) หรือเส้นเดียวที่ยาวพอเป็นลายมือเขียนติดกัน
// ตัวตัดสินจริงคือ OCR + การเทียบคำ + ต้องเจอสองครั้งติดกัน · ค่าใช้จ่ายคุมด้วยเพดานจำนวนครั้งใน index.js
const MIN_STROKES = 2;
const LONG_STROKE = 1.0; // ความยาวเส้นรวม (หน่วย = ความกว้างกระดาน) ที่เส้นเดียวก็ยังน่าเป็นลายมือเขียนติดกัน
// วัดแต่ละเส้น/รูปทรงที่ยังอยู่บนกระดาน: size = ด้านยาวของกรอบ · length = ความยาวเส้น (ทั้งคู่เป็นสัดส่วนของกระดาน)
function strokeStats(ops) {
  let list = [];
  for (const op of ops) {
    const first = op.events[0];
    if (first.type === "clear_canvas") { list = []; continue; }
    if (first.type === "draw_shape") {
      const size = Math.max(Math.abs(first.x2 - first.x1), Math.abs(first.y2 - first.y1));
      list.push({ size, length: size });
      continue;
    }
    if (first.type !== "stroke_start" || first.tool === "eraser") continue;
    let x0 = first.x, x1 = first.x, y0 = first.y, y1 = first.y;
    let length = 0, px = first.x, py = first.y;
    for (const ev of op.events) {
      if (ev.type !== "stroke_points") continue;
      for (const p of ev.points) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
        length += Math.hypot(p.x - px, p.y - py);
        px = p.x; py = p.y;
      }
    }
    list.push({ size: Math.max(x1 - x0, y1 - y0), length });
  }
  return list;
}

// คืน { ok, reason, sizes } — reason/sizes บอกว่าทำไมผ่าน/ไม่ผ่าน (เทสใช้ตรวจขนาดเส้นที่วัดได้)
function shapeCheck(ops) {
  const stats = strokeStats(ops);
  const sizes = stats.map((s) => s.size);
  if (stats.length === 0) return { ok: false, reason: "กระดานว่าง", sizes };
  if (stats.length >= MIN_STROKES) return { ok: true, reason: `มี ${stats.length} เส้น`, sizes };
  if (stats[0].length >= LONG_STROKE) return { ok: true, reason: "เส้นเดียวแต่ยาว (อาจเขียนติดกัน)", sizes };
  return { ok: false, reason: `เส้นเดียวสั้น (ยาว ${stats[0].length.toFixed(2)} < ${LONG_STROKE})`, sizes };
}

const looksLikeText = (ops) => shapeCheck(ops).ok;

// ── 3) อ่านตัวหนังสือ ──
// คืน { text, confidence } หรือ null (ปิดอยู่ / เกินเพดาน / ภาพว่าง / ผิดพลาดทุกชนิด) — ไม่ throw
async function readText(ops) {
  if (!isEnabled() || !globalRateOk()) return null;
  try {
    const png = await renderPng(ops);
    if (!png) return null;
    return await PROVIDERS[providerName()](png);
  } catch (err) {
    if (err?.quota) backoffUntil = Date.now() + QUOTA_BACKOFF_MS;
    // log แค่ข้อความ error ไม่ log ภาพ/ข้อความที่อ่านได้/key
    console.warn("ตรวจตัวอักษรบนกระดานไม่สำเร็จ (ข้ามไป เกมเล่นต่อ):", err?.message || err);
    return null;
  }
}

// ── ผู้ให้บริการ: Gemini (vision) ผ่าน fetch ของ Node (ไม่ใช้ SDK) ──
// **ไม่ส่งคำตอบไปให้ Gemini** — ขอแค่ "ถอดตัวหนังสือที่เห็น" แล้วเกมเทียบเองที่ server
const PROMPT =
  "This image is a drawing from a Pictionary-style game. Transcribe any handwritten letters, words or digits " +
  "(Thai or English) exactly as written. Ignore pictures and shapes that are not letters. If there is no readable text, " +
  'use an empty string. Reply only with JSON: {"text": string, "confidence": number from 0 to 1}.';

async function geminiReadText(pngBase64) {
  const res = await fetch(`${GEMINI_API_URL}/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: "image/png", data: pngBase64 } }, { text: PROMPT }] }],
      // maxOutputTokens รวมโทเคน "คิด" ของโมเดลด้วย — ตั้ง 200 แล้ว JSON ถูกตัดกลางทาง (เจอตอนทดสอบกับ key จริง) จึงเผื่อไว้ 1024
      generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (res.status === 429) throw Object.assign(new Error("Gemini โควตาหมด (429)"), { quota: true });
  if (!res.ok) throw new Error(`Gemini ตอบ ${res.status}`); // ไม่ log body
  const body = await res.json();
  const raw = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
  const json = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); // เผื่อห่อมาด้วย ```
  const text = typeof json?.text === "string" ? json.text.slice(0, 200) : "";
  const confidence = Number(json?.confidence);
  return { text, confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0 };
}

// เหลือเวลาพักหลังโดน 429 อีกกี่ ms (0 = ไม่ได้พัก) — index.js ใช้นัดตรวจใหม่ตอนพักจบ แทนการทิ้งภาพนั้นไปเลย
function backoffLeft() {
  return Math.max(0, backoffUntil - Date.now());
}

module.exports = { isEnabled, readText, looksLikeText, shapeCheck, renderPng, opsToSvg, backoffLeft };
