// รูปพิกเซลของเครื่องประดับ + การซ้อนชั้นกับอวตาร — ไฟล์ .js ล้วน (ไม่มี JSX) ใช้ทั้ง AvatarLook.jsx
// และสคริปต์ทำภาพตารางรวม (client/scripts/make-cosmetics-sheet.mjs)
//
// ผืนวาด 24×24 ช่อง: อวตาร 16×16 วางที่ (4, 5) → เหลือที่ด้านบน 5 แถวให้หมวก · รอบตัวให้กรอบ/พื้นหลัง · ด้านล่าง 3 แถวให้ของที่คอ
// ลำดับชั้น (หลังไปหน้า): พื้นหลัง → กรอบ → อวตาร → คอ → แว่น → หมวก
// รายการไอเทม (id ช่อง ชื่อ) อยู่ที่ shared/cosmetics.json ไฟล์เดียว server ใช้ตรวจ ฝั่งนี้แค่วาด — id ที่ไม่มีรูป = ไม่วาด
import { PAL, AVATAR_ART } from "./avatarData.js";

export const GRID = 24;
const OX = 4, OY = 5; // มุมซ้ายบนของอวตารบนผืนวาด

// จุดวางของอวตารแต่ละตัว (พิกัดในตาราง 16×16 ของอวตาร) — หัว ตา คาง อยู่ไม่เท่ากัน จึงต้องมีตารางนี้
//   hat   = แถวที่ "ฐานหมวก" ทับ (ขอบบนของหัว)
//   eyes  = แถวบนของดวงตา (แว่นสูง 4 แถว เริ่มเหนือแถวนี้ 1 แถว)
//   neck  = แถวที่ของที่คอเริ่ม (ทับคางเล็กน้อย)
// ลำดับตรงกับ AVATAR_ART: แพนด้า แมว จิ้งจอก กบ ลิง ปลาหมึก
export const ANCHORS = [
  { hat: 2, eyes: 7, neck: 13 }, // แพนด้า
  { hat: 3, eyes: 7, neck: 13 }, // แมว (หูแหลมโผล่ข้างหมวก)
  { hat: 3, eyes: 6, neck: 12 }, // จิ้งจอก (คางแคบ)
  { hat: 1, eyes: 2, neck: 13 }, // กบ (ตาอยู่บนหัว)
  { hat: 1, eyes: 7, neck: 13 }, // ลิง
  { hat: 1, eyes: 6, neck: 10 }, // ปลาหมึก (ไม่มีคอ ผูกไว้เหนือหนวด)
];

// ── หมวก: 16 ช่อง · base = แถวที่วางทับ ANCHORS.hat ──
const HATS = {
  hat_cap: {
    base: 3,
    rows: [
      "....kkkkkkkk....",
      "...krrrrrrrrk...",
      "..krRRrrrrrrrk..",
      "..krrrrrrrrrrkkk",
      "..kkkkkkkkkkkrrk",
      "............kkk.",
    ],
  },
  hat_beanie: {
    base: 5,
    rows: [
      "......kkkk......",
      ".....kwwwwk.....",
      "....kkkkkkkk....",
      "...kbbbbbbbbk...",
      "..kbBbBbBbBbbk..",
      "..kwwwwwwwwwwk..",
      "..kkkkkkkkkkkk..",
    ],
  },
  hat_straw: {
    base: 5,
    rows: [
      ".....kkkkkk.....",
      "....kyyyyyyk....",
      "....kyYYyyyk....",
      "....krrrrrrk....",
      "kkkkkyyyyyykkkkk",
      "kyyYyyyyyyyyyyyk",
      ".kkkkkkkkkkkkkk.",
    ],
  },
};

// ── แว่น: 16 ช่อง 4 แถว (แถวที่ 2 ตรงกับ ANCHORS.eyes) · "." = โปร่ง เห็นตาข้างหลัง ──
const GLASSES = {
  glasses_round: [
    "..kkk......kkk..",
    ".k...kkkkkk...k.",
    ".k...k....k...k.",
    "..kkk......kkk..",
  ],
  glasses_dark: [
    "kkkkkkkkkkkkkkkk",
    ".kkwkkk..kkwkkk.",
    ".kkkkkk..kkkkkk.",
    "..kkkk....kkkk..",
  ],
  glasses_3d: [
    "kkkkkkkkkkkkkkkk",
    "kwrrrrrkkwbbbbbk",
    "kwrrrrrkkwbbbbbk",
    ".kkkkkk..kkkkkk.",
  ],
};

// ── ของที่คอ: 16 ช่อง เริ่มที่ ANCHORS.neck ──
const NECKS = {
  neck_bow: [
    "...kk.kkkk.kk...",
    "..krrkrRRrkrrk..",
    "..krrkrrrrkrrk..",
    "...kk.kkkk.kk...",
  ],
  neck_scarf: [
    "..kkkkkkkkkkkk..",
    ".kgGgGgGgGgGggk.",
    "..kkkkkkkkkgGk..",
    "..........kggk..",
    "...........kk...",
  ],
  neck_tie: [
    "....kkkkkkkk....",
    "....kwwbbwwk....",
    ".....kkbbkk.....",
    "......kbBk......",
    "......kbbk......",
    ".......kk.......",
  ],
};

// ── กรอบ/พื้นหลัง: คำนวณจากระยะถึงจุดกลางผืนวาด (วงกลมพิกเซล) ──
const C = (GRID - 1) / 2; // 11.5
const dist = (x, y) => Math.hypot(x - C, y - C);
const R_OUT = 12.1, R_RING = 10.6; // วงแหวน = 10.6 ≤ d < 12.1

function ringCells(colorAt) {
  const out = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const d = dist(x, y);
    if (d >= R_RING && d < R_OUT) {
      const fill = colorAt(x, y, Math.atan2(y - C, x - C));
      if (fill) out.push({ x, y, fill });
    }
  }
  return out;
}
// พื้นหลัง = เต็มผืน มุมมน (เหมือนรูปโปรไฟล์) — ถ้าใช้เป็นวงกลมเล็กกว่านี้ หัวอวตาร (กว้าง 16 จาก 24) จะบังจนเหลือแค่ขอบ
function tileCells(colorAt) {
  const out = [];
  const corner = 3; // ตัดมุม 3 ช่อง
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const cx = Math.min(x, GRID - 1 - x), cy = Math.min(y, GRID - 1 - y);
    if (cx + cy < corner - 1) continue;
    out.push({ x, y, fill: colorAt(x, y) });
  }
  return out;
}
const sector = (angle, n) => Math.floor(((angle + Math.PI) / (2 * Math.PI)) * n) % n;

const FRAMES = {
  frame_gold: () => ringCells((x, y) => (x + y < 14 ? PAL.Y : PAL.y)), // ทองทึบ มุมซ้ายบนสว่าง (แสงตก)
  frame_dash: () => ringCells((x, y, a) => (dist(x, y) >= 10.9 && dist(x, y) < 11.9 && sector(a + Math.PI / 12, 12) % 2 === 0 ? PAL.k : null)), // เส้นประดำบาง 6 ขีด
  frame_stars: () => {
    const ring = ringCells((x, y) => (dist(x, y) < 11.3 ? PAL.u : null)); // เส้นม่วงบาง
    const stars = [];
    for (let i = 0; i < 8; i++) { // ดาวเหลือง (รูปบวก 3×3) 8 ดวงรอบวง
      const a = (i / 8) * 2 * Math.PI - Math.PI / 2;
      const sx = Math.round(C + 11 * Math.cos(a)), sy = Math.round(C + 11 * Math.sin(a));
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = sx + dx, y = sy + dy;
        if (x >= 0 && x < GRID && y >= 0 && y < GRID) stars.push({ x, y, fill: dx === 0 && dy === 0 ? PAL.Y : PAL.y });
      }
    }
    return [...ring, ...stars];
  },
};

// เมฆ/ดอกไม้วางไว้ตามมุมและขอบ (ตรงกลางถูกหัวอวตารบัง)
const CLOUDS = new Set(["1,3", "2,3", "3,3", "2,2", "3,2", "19,1", "20,1", "21,1", "20,0", "18,2", "19,2", "20,2", "21,2", "22,2", "0,10", "1,10", "22,8", "23,8", "21,9", "22,9", "23,9"]);
const FLOWERS = new Set(["1,20", "3,22", "21,20", "19,22", "22,22"]);
const BACKGROUNDS = {
  bg_sky: () => tileCells((x, y) => (CLOUDS.has(`${x},${y}`) ? PAL.w : PAL.B)),
  bg_dots: () => tileCells((x, y) => (x % 4 === 1 && y % 4 === 1 ? PAL.u : PAL.U)),
  bg_grass: () => tileCells((x, y) => (y >= 19 ? (FLOWERS.has(`${x},${y}`) ? PAL.Y : (x + 2 * y) % 7 === 0 ? PAL.G : PAL.g) : y === 18 && x % 3 === 0 ? PAL.g : CLOUDS.has(`${x},${y}`) && y < 4 ? PAL.w : PAL.B)),
};

function rowsToCells(rows, x0, y0) {
  const out = [];
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const fill = PAL[ch];
      if (ch !== "." && fill) out.push({ x: x0 + c, y: y0 + r, fill });
    });
  });
  return out;
}

// ไอเทมที่มีรูปให้วาดจริง (ใช้ตรวจตอนเทส/ทำตารางรวมว่ารายการใน shared/cosmetics.json มีรูปครบ)
export const DRAWN_IDS = [...Object.keys(FRAMES), ...Object.keys(HATS), ...Object.keys(GLASSES), ...Object.keys(NECKS), ...Object.keys(BACKGROUNDS)];

// ชั้นของไอเทมหนึ่งชิ้นบนอวตารตัวที่กำหนด → [{ x, y, fill }] (id ไม่รู้จัก = [])
export function itemCells(id, avatarIndex = 0) {
  const an = ANCHORS[avatarIndex] ?? ANCHORS[0];
  if (FRAMES[id]) return FRAMES[id]();
  if (BACKGROUNDS[id]) return BACKGROUNDS[id]();
  if (HATS[id]) return rowsToCells(HATS[id].rows, OX, OY + an.hat - HATS[id].base);
  if (GLASSES[id]) return rowsToCells(GLASSES[id], OX, OY + an.eyes - 1);
  if (NECKS[id]) return rowsToCells(NECKS[id], OX, OY + an.neck);
  return [];
}

export function avatarCells(avatarIndex = 0) {
  const art = AVATAR_ART[avatarIndex] ?? AVATAR_ART[0];
  const full = art.rows.map((r) => r + [...r].reverse().join("")); // ครึ่งขวาสะท้อนจากซ้าย
  return rowsToCells(full, OX, OY);
}

// ซ้อนทุกชั้นเป็นรายการช่องเดียว (ช่องที่ชั้นหน้าทับ ชั้นหลังถูกตัดทิ้ง) → [{ x, y, w, fill }] รวมช่องติดกันสีเดียวกันในแถว
// compact = แสดงแค่หมวก แว่น คอ (อวตารขนาดเล็กในแถบคะแนน: กรอบ/พื้นหลังมองไม่ชัดและกินที่)
export function lookRects(avatarIndex = 0, cosmetics = null, { compact = false } = {}) {
  const c = cosmetics ?? {};
  const layers = [
    compact ? [] : itemCells(c.background, avatarIndex),
    compact ? [] : itemCells(c.frame, avatarIndex),
    avatarCells(avatarIndex),
    itemCells(c.neck, avatarIndex),
    itemCells(c.glasses, avatarIndex),
    itemCells(c.hat, avatarIndex),
  ];
  const grid = new Array(GRID * GRID).fill(null);
  for (const layer of layers) for (const { x, y, fill } of layer) if (x >= 0 && x < GRID && y >= 0 && y < GRID) grid[y * GRID + x] = fill;
  const rects = [];
  for (let y = 0; y < GRID; y++) {
    let x = 0;
    while (x < GRID) {
      const fill = grid[y * GRID + x];
      let end = x + 1;
      while (end < GRID && grid[y * GRID + end] === fill) end++;
      if (fill) rects.push({ x, y, w: end - x, fill });
      x = end;
    }
  }
  return rects;
}
