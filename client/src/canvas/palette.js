// สีที่ใช้ "วาด" กับ ขนาดแปรง
//
// ทำไมสีวาดเก็บไว้ใน JS ไม่ใช่ตัวแปร CSS ใน theme.css เหมือนสีอื่นของธีม
// เพราะสีวาดไม่ใช่สีตกแต่ง มันเป็น "ข้อมูล" ที่ต้องส่งไปกับ event stroke_start / fill
// ในช่อง color (events.md หัวข้อ 4) ฝั่งรับต้องได้ค่า hex ตรงตัวไปตั้ง strokeStyle
// ถ้าเก็บเป็น var(--...) ฝั่ง JS จะไม่รู้ค่าจริงว่าคืออะไร
//
// (สีของ "ตัวจุดสี" บนแถบเครื่องมือก็อ่านจากไฟล์นี้ไปใส่ style ตรงๆ จึงไม่มีรหัสสีกระจายอยู่ในคอมโพเนนต์)
//
// 6 จาก 8 สีตั้งใจให้ค่าตรงกับตัวแปรใน theme.css เป๊ะ (แดง ส้ม เหลือง เขียว ฟ้า ม่วง)
// อีก 2 สี (ดำ ขาว) เป็นสีสำหรับวาดโดยเฉพาะ จึงไม่มีในธีม

// จานสี 20 สี เรียงเป็นตาราง 7 คอลัมน์ (ช่องที่ 21 คือปุ่ม "สีเอง") ตามลำดับนี้ทีละแถว
// สีโทนเดียวกันอยู่ใกล้กัน: เทา/ขาว/สีผิว → น้ำตาล → แดง ส้ม เหลือง → เขียว → ฟ้า น้ำเงิน ม่วง ชมพู
// ⚠️ สีหลัก 8 สีที่ server ใช้สุ่มให้ Mini Challenge colour_fix (server/index.js CHALLENGE_COLORS ตัดขาวออก)
//    ต้องอยู่ในจานนี้ครบ ค่า hex ตรงกันเป๊ะ — ไม่งั้นตา colour_fix จะล็อกสีที่หาในจานไม่เจอ:
//    ดำ #000000 · แดง #e8553f · ส้ม #ef8a2b · เหลือง #ffc81e · เขียว #22a559 · น้ำเงิน #1e6fe8 · ม่วง #7b5ce0 (+ ขาว #ffffff)
export const PAINT_COLORS = [
  { name: "ดำ", hex: "#000000" },
  { name: "เทาเข้ม", hex: "#4a4a4a" },
  { name: "เทา", hex: "#8a8a8a" },
  { name: "เทาอ่อน", hex: "#c8c8c8" },
  { name: "ขาว", hex: "#ffffff" },
  { name: "สีผิว", hex: "#f2c4a0" },
  { name: "น้ำตาล", hex: "#a8693a" },
  { name: "น้ำตาลเข้ม", hex: "#5e3a1e" },
  { name: "แดงเข้ม", hex: "#a3261c" },
  { name: "แดง", hex: "#e8553f" }, // = --red
  { name: "ส้ม", hex: "#ef8a2b" },
  { name: "เหลือง", hex: "#ffc81e" }, // = --yellow
  { name: "เขียวอ่อน", hex: "#8fd36e" },
  { name: "เขียว", hex: "#22a559" }, // = --green
  { name: "เขียวเข้ม", hex: "#11663a" },
  { name: "ฟ้า", hex: "#5bb8f5" },
  { name: "น้ำเงิน", hex: "#1e6fe8" }, // = --blue
  { name: "น้ำเงินเข้ม", hex: "#17338f" },
  { name: "ม่วง", hex: "#7b5ce0" }, // = --purple
  { name: "ชมพู", hex: "#f06fb0" },
];

// ชื่อสำหรับอ่านออกเสียง/aria-label: "สีแดง" (ชื่อที่ขึ้นต้นด้วย "สี" อยู่แล้วเช่น "สีผิว" ไม่ต้องเติมซ้ำ)
export const colorLabel = (c) => (c.name.startsWith("สี") ? c.name : `สี${c.name}`);

// สีพื้นกระดาน — ใช้ทั้งตอนล้างจอ และตอนที่เลือกยางลบ
// ยางลบทำงานด้วยการ "ทาสีพื้นกระดานทับ" ไม่ใช่ลบให้โปร่งใส
// เพราะพื้นกระดานเป็นสีขาวทึบอยู่แล้ว (DESIGN.md) การทาสีขาวทับจึงเห็นผลเหมือนกัน
// แต่ทำให้ถังสีอ่านค่าสีพื้นได้ง่ายกว่า (ทุกพิกเซลมีสีจริง ไม่มีพิกเซลโปร่งใสปน)
export const BOARD_COLOR = "#ffffff";

// ขนาดแปรงตาม DESIGN.md: สไลด์ 2–40
export const SIZE_MIN = 2;
export const SIZE_MAX = 40;
export const SIZE_DEFAULT = 5;

// ── ช่องเลือกสีเองแบบสองแกน ──
// แนวนอน = เปลี่ยนสี (องศาสี 0–360) · แนวตั้ง = อ่อน↔เข้ม (ความสว่าง บนอ่อน ล่างเข้ม) · ความอิ่มตัว 100% ตลอด
// สีเทา/ขาว/ดำมีในจานสีอยู่แล้ว จึงไม่ให้ลากไปสุดขอบ: ความสว่างอยู่ในช่วง PICK_L_TOP → PICK_L_BOTTOM เท่านั้น
// พื้นช่องวาดด้วย gradient ซ้อนสองชั้น (ขาวโปร่ง→ใส→ดำโปร่ง ทับแถบสีรุ้ง) ซึ่งคำนวณให้ตรงกับ hslToHex(h, 1, L) เป๊ะ:
//   L > 0.5 คือผสมขาว (2L−1) · L < 0.5 คือผสมดำ (1−2L) จึงตั้งความทึบของสองชั้นตามนั้น สีใต้จุดจับ = สีที่ได้จริง
export const PICK_L_TOP = 0.86;
export const PICK_L_BOTTOM = 0.16;
export const PICK_DEFAULT = { hue: 330, light: 0.62 }; // เริ่มที่ชมพู ตรงกับ --pink ในธีม
const HUES = "#ff0000 0%, #ffff00 16.7%, #00ff00 33.3%, #00ffff 50%, #0000ff 66.7%, #ff00ff 83.3%, #ff0000 100%";
const whiteA = 2 * PICK_L_TOP - 1; // ความทึบขาวที่ขอบบน
const blackA = 1 - 2 * PICK_L_BOTTOM; // ความทึบดำที่ขอบล่าง
const midY = ((PICK_L_TOP - 0.5) / (PICK_L_TOP - PICK_L_BOTTOM)) * 100; // ตำแหน่งแนวตั้งที่ L = 0.5 (สีสดเต็ม)
export const PICK_BACKGROUND =
  `linear-gradient(to bottom, rgb(255 255 255 / ${whiteA.toFixed(3)}) 0%, rgb(255 255 255 / 0) ${midY.toFixed(1)}%, ` +
  `rgb(0 0 0 / 0) ${midY.toFixed(1)}%, rgb(0 0 0 / ${blackA.toFixed(3)}) 100%), linear-gradient(to right, ${HUES})`;
// แถบสีรุ้งสดเต็มแถบ (แกนนอน) ไว้บนสุดของแผง — เห็นชัดว่าแกนนอนคือสีอะไรบ้าง และลากเปลี่ยนสีอย่างเดียวได้
export const PICK_HUE_BAR = `linear-gradient(to right, ${HUES})`;

/**
 * HSL → hex
 * สูตรมาตรฐาน: หาความอิ่มตัวจริงก่อน แล้วไล่คำนวณทีละช่องสี (แดง เขียว น้ำเงิน)
 * @param h องศาสี 0–360
 * @param s ความอิ่มตัว 0–1
 * @param l ความสว่าง 0–1
 */
export function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

// โหมดของแถบเครื่องมือ — "bucket" ไม่ใช่วาดเส้น แต่เป็นการเทสี one-shot
export const TOOLS = { PEN: "pen", ERASER: "eraser", BUCKET: "bucket", LINE: "line", RECT: "rect", CIRCLE: "circle", TRIANGLE: "triangle" };
// เครื่องมือรูปทรง: ชื่อ tool ตรงกับช่อง shape ของ draw_shape เป๊ะ
export const SHAPE_TOOLS = [TOOLS.LINE, TOOLS.RECT, TOOLS.CIRCLE, TOOLS.TRIANGLE];
export const isShapeTool = (t) => SHAPE_TOOLS.includes(t);
