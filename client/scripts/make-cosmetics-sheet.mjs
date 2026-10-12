// ทำภาพตารางรวม "อวตาร 6 ตัว × เครื่องประดับทุกชิ้น" ไว้ตรวจด้วยตาว่าไอเทมเข้ากับอวตารทุกตัว
// ใช้รูปชุดเดียวกับที่หน้าเว็บวาดจริง (client/src/cosmeticArt.js) · แปลง SVG เป็น PNG ด้วย sharp ของ server (ไม่เพิ่ม library)
// รัน: node client/scripts/make-cosmetics-sheet.mjs [ไฟล์ปลายทาง]   (ค่าเริ่มต้น screenshots-cosmetics/sheet.png — โฟลเดอร์นี้ไม่เข้า git)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookRects, GRID, DRAWN_IDS } from "../src/cosmeticArt.js";
import { AVATAR_ART } from "../src/avatarData.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const sharp = require(path.join(ROOT, "server/node_modules/sharp"));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "shared/cosmetics.json"), "utf8"));
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "screenshots-cosmetics/sheet.png"));

const missing = catalog.items.filter((i) => !DRAWN_IDS.includes(i.id)).map((i) => i.id);
if (missing.length) { console.error("ไอเทมใน shared/cosmetics.json ที่ยังไม่มีรูป:", missing.join(", ")); process.exit(1); }

const CELL = 6;                 // 1 ช่องพิกเซล = 6px
const TILE = GRID * CELL;       // 144px ต่อภาพ
const GAP = 14, LABEL_W = 170, HEAD_H = 34;
// แถว: ไม่ใส่อะไร → ไอเทมทีละชิ้น (15 แถว) → ชุดเต็มตัวอย่าง 3 ชุด → แบบย่อ (compact: หมวก แว่น คอ) ของชุดเต็ม
const full = (n) => Object.fromEntries(catalog.slots.map((slot) => [slot, catalog.items.filter((i) => i.slot === slot)[n].id]));
const rows = [
  { label: "ไม่ใส่อะไร", look: {} },
  ...catalog.items.map((i) => ({ label: `${i.name}`, sub: i.id, look: { [i.slot]: i.id } })),
  { label: "ชุดเต็ม 1", look: full(0) },
  { label: "ชุดเต็ม 2", look: full(1) },
  { label: "ชุดเต็ม 3", look: full(2) },
  { label: "ชุดเต็ม 1 (แบบย่อ)", sub: "แถบคะแนน: หมวก แว่น คอ", look: full(0), compact: true },
  { label: "ชุดเต็ม 2 (แบบย่อ)", sub: "แถบคะแนน: หมวก แว่น คอ", look: full(1), compact: true },
];
const W = LABEL_W + AVATAR_ART.length * (TILE + GAP) + GAP;
const H = HEAD_H + rows.length * (TILE + GAP) + GAP;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`;
svg += `<rect width="100%" height="100%" fill="#6b5bff"/>`; // พื้นม่วงของเกม (สีที่อวตารจะไปอยู่จริง)
AVATAR_ART.forEach((a, c) => { svg += `<text x="${LABEL_W + c * (TILE + GAP) + TILE / 2}" y="23" font-family="sans-serif" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">${esc(a.name)}</text>`; });
rows.forEach((row, r) => {
  const y0 = HEAD_H + r * (TILE + GAP);
  svg += `<text x="10" y="${y0 + TILE / 2 - 2}" font-family="sans-serif" font-size="15" font-weight="700" fill="#fff">${esc(row.label)}</text>`;
  if (row.sub) svg += `<text x="10" y="${y0 + TILE / 2 + 16}" font-family="sans-serif" font-size="11" fill="#e4e0ff">${esc(row.sub)}</text>`;
  AVATAR_ART.forEach((_, c) => {
    const x0 = LABEL_W + c * (TILE + GAP);
    svg += `<rect x="${x0}" y="${y0}" width="${TILE}" height="${TILE}" rx="10" fill="#f8f9fc"/>`; // การ์ดครีมแบบในเกม
    for (const q of lookRects(c, row.look, { compact: row.compact })) svg += `<rect x="${x0 + q.x * CELL}" y="${y0 + q.y * CELL}" width="${q.w * CELL}" height="${CELL}" fill="${q.fill}"/>`;
  });
});
svg += "</svg>";

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log(`เขียนภาพตารางรวมแล้ว: ${OUT} (${W}×${H}px · อวตาร ${AVATAR_ART.length} ตัว × ${rows.length} แถว)`);
