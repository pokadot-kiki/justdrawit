// ไฟล์นี้ใส่ .js ต่อท้าย (ทั้งโปรเจกต์ที่เหลือไม่ใส่) เพราะถูก import ตรงจาก Node
// ในเทสหน่วยของ canvas ด้วย — Node บังคับต้องมีนามสกุล ส่วน Vite รับได้ทั้งสองแบบ
import { BOARD_COLOR } from "./palette.js";

// ─────────────────────────────────────────────────────────────────────────
// ตัววาดกลาง — มีที่เดียวในโปรเจกต์ที่แตะ canvas จริง
//
// ทำงาน 3 อย่าง
//   setSize()  ตั้งขนาดกระดาน + ล้างเป็นสีขาว
//   apply()    วาด "หนึ่ง action" ลงจอ
//   replay()   ล้างจอแล้ววาด action ทั้งชุดใหม่
//
// replay สำคัญมาก: ตอนจอเปลี่ยนขนาด canvas ถูก browser ล้างทิ้งทั้งใบ
// เราจึงเก็บ action ทุกอันไว้ในลิสต์ แล้ว "วาดซ้ำจากลิสต์" ด้วยขนาดใหม่
// พิกัดในลิสต์เป็นสัดส่วน 0–1 ทั้งหมด (ตาม events.md) จึงคูณขนาดใหม่แล้วได้ภาพเดิมเป๊ะ
// กลไกนี้เป็นตัวเดียวกับที่ข้อ 4 จะใช้ตอนรับ canvas_history หรือตอนวาดตามคนอื่นสดๆ
// ─────────────────────────────────────────────────────────────────────────

// ค่าความต่างสีที่ยอมให้ถือว่า "สีเดียวกัน" ตอนเทสี (0–255 ต่อช่อง R G B)
//
// ทำไมต้องมี: ขอบเส้นที่วาดด้วยความละเอียดสูงจะไล่สีจากดำไปขาวแบบค่อยเป็นค่อยไป
// (anti-aliasing / ลบรอยหยัก) ถ้าเทียบสีแบบเป๊ะๆ ถังสีจะหยุดที่พิกเซลเทาแรก
// แล้วเหลือขอบขาวบางๆ คั่นระหว่างสีที่เทกับเส้น
// ค่านี้ทำให้ถังสีกลืนพิกเซลเทาอ่อนที่ติดกับพื้นขาวเข้าไปด้วย จึงไม่เหลือช่องขาว
//
// 40 มาจากการลอง: พอปิดรอยหยักได้ แต่ยังไม่มากพอจะทะลุผ่านเส้นสีอ่อนๆ ที่บางมาก
export const FILL_TOLERANCE = 40;

// หลังเทรอบแรกแล้ว ให้ "ขยาย" พื้นที่ที่เทออกไปได้อีกไม่เกินกี่พิกเซล
// เผื่อกลืนพิกเซลรอยต่อที่ยังเหลือค้างระหว่างสีที่เทกับเส้น (ดู FILL_GROW_TOLERANCE)
export const FILL_GROW_PX = 2;

// พิกเซลรอยต่อจะถูกขยายทับได้ก็ต่อเมื่อ "ยังใกล้สีพื้นเดิม" ไม่เกินค่านี้
//
// 127 คือจุดกึ่งกลางพอดี พิกเซลที่ยังเหมือนพื้นมากกว่าเหมือนเส้น (สีเทาอ่อนกว่าเท่ากับครึ่ง)
// จึงได้ลงสี ส่วนพิกเซลที่เข้มกว่านั้นถือเป็นเนื้อเส้น ปล่อยไว้
// ผลคือสีที่เทวิ่งไปจนชิดเส้น ไม่เหลือขอบขาวคั่น (โจทย์ข้อ 3)
// แต่เส้นยังหนาอยู่ เพราะแกนเส้นจริงห่างจากสีพื้นไกลกว่านี้มาก
// เส้นบางมากที่ทั้งเส้นจางกว่า 50% (แทบมองไม่เห็นอยู่แล้ว) จึงจะถูกกลืนไปด้วย
export const FILL_GROW_TOLERANCE = 127;

// เทียบสีสองชุดว่าต่างกันไม่เกิน tol ทุกช่องสี
function sameColor(a, b, tol) {
  return (
    Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol
  );
}

// "#FFC81E" → [255, 200, 30]
export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * ถังสี — flood fill
 *
 * วิธีคิด: เริ่มจากพิกเซลที่กด แล้วลามไปยังพิกเซลข้างเคียงที่ "สีใกล้เคียงกับจุดเริ่ม"
 * หยุดเมื่อเจอสีที่ต่างออกไป (เส้นที่ลากไว้) จึงไหลไปได้เฉพาะพื้นที่ที่มีเส้นล้อม
 * ถ้าไม่มีเส้นล้อมเลย มันจะลามจนเต็มจอ ซึ่งตรงกับที่ events.md เขียนไว้
 *
 * ใช้วิธีไล่ทีละแถว (scanline) ไม่ใช่เรียกซ้ำทีละพิกเซล เพราะพิกเซลหนึ่งจอมีเป็นแสน
 * ถ้าเรียกซ้ำจะซ้อนลึกจน stack overflow
 *
 * @param img   ImageData ของทั้งกระดาน (แก้คาในตัวเลย ไม่ต้องคืนค่า)
 * @param w,h   ขนาดเป็นพิกเซลจริงของ canvas
 * @param sx,sy จุดที่กด (พิกเซลจริง)
 * @returns true ถ้าเทสีจริง, false ถ้าไม่ได้ทำอะไร
 */
export function floodFill(img, w, h, sx, sy, fill, tol = FILL_TOLERANCE) {
  const d = img.data;
  const idx = (x, y) => (y * w + x) * 4;

  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return false;

  const s = idx(sx, sy);
  const target = [d[s], d[s + 1], d[s + 2], d[s + 3]];

  // กดซ้ำบนสีเดิมก็ไม่ต้องทำอะไร (ถ้าเทสีทับด้วยสีเดิม พิกเซลจะไม่เปลี่ยน
  // แล้วการลามจะไม่รู้จักจบ เพราะเงื่อนไขหยุดคือ "สีเปลี่ยนไปแล้ว")
  if (sameColor(target, fill, tol)) return false;

  // ตารางธงว่าพิกเซลนี้ถูกเยี่ยมแล้วหรือยัง — ทำให้แน่ใจว่าวนได้จบ
  const seen = new Uint8Array(w * h);
  const match = (x, y) => {
    const p = y * w + x;
    if (seen[p]) return false;
    const i = p * 4;
    return (
      Math.abs(d[i] - target[0]) <= tol &&
      Math.abs(d[i + 1] - target[1]) <= tol &&
      Math.abs(d[i + 2] - target[2]) <= tol
    );
  };
  // ทาสีหนึ่งพิกเซล (รับลำดับพิกเซล ไม่ใช่พิกัด เพราะขั้นตอนขยายใช้ลำดับตรงๆ)
  const paintAt = (p) => {
    const i = p * 4;
    d[i] = fill[0];
    d[i + 1] = fill[1];
    d[i + 2] = fill[2];
    d[i + 3] = 255;
    seen[p] = 1;
  };
  const paint = (x, y) => paintAt(y * w + x);

  const stack = [[sx, sy]];
  while (stack.length > 0) {
    const [x0, y0] = stack.pop();
    if (!match(x0, y0)) continue;

    // ถอยซ้ายสุดของแถวนี้ก่อน แล้วค่อยไล่ไปทางขวาจนสุดช่วง
    let left = x0;
    while (left > 0 && match(left - 1, y0)) left--;

    let up = false;
    let down = false;
    for (let x = left; x < w && match(x, y0); x++) {
      paint(x, y0);

      // จำไว้ว่าแถวบน/ล่างเคยเจอช่วงที่ลามได้แล้ว จะได้ไม่ push ซ้ำถี่ๆ
      if (y0 > 0) {
        if (match(x, y0 - 1)) {
          if (!up) {
            stack.push([x, y0 - 1]);
            up = true;
          }
        } else up = false;
      }
      if (y0 < h - 1) {
        if (match(x, y0 + 1)) {
          if (!down) {
            stack.push([x, y0 + 1]);
            down = true;
          }
        } else down = false;
      }
    }
  }

  // ── ขั้นที่สอง: ขยายพื้นที่ที่เทแล้วออกไปกลืนพิกเซลรอยต่อ (โจทย์ข้อ 3) ──
  //
  // หลังเทรอบแรกจะยังเหลือพิกเซลสีเทาบางๆ คั่นระหว่างสีที่เทกับเส้น
  // เพราะมันเข้มเกินกว่าที่ tolerance 40 จะรับได้ แต่ก็ยังไม่ใช่เนื้อเส้นจริง
  // (เกิดจากตอนวาด เบราว์เซอร์ไล่สีจากพื้นไปเส้นแบบค่อยเป็นค่อยไป — anti-alias)
  //
  // วิธีแก้: ขยายออกอีกครั้งด้วยเกณฑ์ที่หลวมขึ้น แต่มีสองข้อจำกัดกันสีรั่ว
  //   1. ขยายได้ไม่เกิน FILL_GROW_PX พิกเซล (ไม่ลามไปไกล)
  //   2. พิกเซลนั้นต้องติดกับพื้นที่ที่เทแล้ว และต้องยังใกล้สีพื้นเดิมไม่เกิน FILL_GROW_TOLERANCE
  // ข้อ 2 สำคัญที่สุด: แกนเส้นจริงห่างจากสีพื้นเกิน 127 มาก จึงไม่ถูกทับ เส้นจึงยังอยู่ครบ
  const nearTarget = (x, y) => {
    const i = idx(x, y);
    return (
      Math.abs(d[i] - target[0]) <= FILL_GROW_TOLERANCE &&
      Math.abs(d[i + 1] - target[1]) <= FILL_GROW_TOLERANCE &&
      Math.abs(d[i + 2] - target[2]) <= FILL_GROW_TOLERANCE
    );
  };
  const touchesFilled = (x, y) => {
    const p = y * w + x;
    return (
      (x > 0 && seen[p - 1] === 1) ||
      (x < w - 1 && seen[p + 1] === 1) ||
      (y > 0 && seen[p - w] === 1) ||
      (y < h - 1 && seen[p + w] === 1)
    );
  };

  for (let round = 0; round < FILL_GROW_PX; round++) {
    const batch = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (seen[p] === 1 || !nearTarget(x, y) || !touchesFilled(x, y)) continue;
        batch.push(p);
      }
    }
    if (batch.length === 0) break; // ไม่มีอะไรให้ขยายแล้ว
    // ทีละรอบพร้อมกัน ไม่ทาระหว่างไล่ ไม่งั้นในรอบเดียวสีจะลามต่อไปได้ไม่จำกัดชั้น
    for (const p of batch) paintAt(p);
  }

  return true;
}

/**
 * วาดเส้นขอบรูปทรงหนึ่งอัน (line | rect | circle | triangle) ลง ctx — ใช้ทั้งตอนวาดจริงและเงาตัวอย่างตอนลาก
 * พิกัดเป็นสัดส่วน 0–1 คูณด้วย w,h ของกระดาน · circle = วงรีที่พอดีกรอบสี่เหลี่ยมของสองจุด
 * triangle = สามเหลี่ยมหน้าจั่วที่พอดีกรอบสี่เหลี่ยมของสองจุด
 * (ฝั่งที่ลากเป็นคนทำให้เป็นวงกลมจริงโดยบังคับกรอบเป็นจัตุรัสตามพิกเซลก่อนส่ง)
 */
export function strokeShape(ctx, a, w, h) {
  const x1 = a.x1 * w;
  const y1 = a.y1 * h;
  const x2 = a.x2 * w;
  const y2 = a.y2 * h;
  ctx.strokeStyle = a.color;
  ctx.lineWidth = a.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (a.shape === "line") {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  } else if (a.shape === "rect") {
    ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  } else if (a.shape === "circle") {
    ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
  } else if (a.shape === "triangle") {
    // ยอดอยู่กึ่งกลางด้านที่เริ่มลาก ฐานอยู่ด้านที่ปล่อยมือ (ลากลง = ยอดชี้ขึ้น · ลากขึ้น = ยอดชี้ลง)
    ctx.moveTo((x1 + x2) / 2, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x1, y2);
    ctx.closePath();
  } else {
    return; // ชนิดแปลกปลอม ไม่วาดอะไร
  }
  ctx.stroke();
}

/**
 * สร้างตัววาดผูกกับ canvas หนึ่งใบ
 * @param ctx 2D context ของ canvas นั้น
 * @param debug true = เปิดตัวนับสำหรับโหมดดีบักชั่วคราว (?debug=1)
 */
export function createPainter(ctx, debug = false) {
  let w = 0; // ขนาดกระดานเป็น CSS pixel (ไม่ใช่พิกเซลจริง) — ดูหมายเหตุเรื่อง dpr ด้านล่าง
  let h = 0;
  let dpr = 1;
  // เส้นที่กำลังลากอยู่ { x, y, mx, my, color, size, drew } — null คือยังไม่เริ่มเส้น
  // x,y = จุดจริงล่าสุดที่นิ้วผ่าน · mx,my = จุดกึ่งกลางล่าสุดที่เส้นวาดไปถึง (อธิบายด้านล่าง)
  let current = null;

  // ── ตัวนับสำหรับโหมดดีบักชั่วคราว (?debug=1) — ลบบล็อกนี้ได้ทั้งก้อนเมื่อหาเสร็จ ──
  // นับว่าเส้นที่วาดไปใช้ "เส้นโค้ง" จริงกี่ช่วง และมีกี่ช่วงที่เรียก quadTo แต่ผลออกมาเป็นเส้นตรง
  // เปิดใช้เฉพาะเมื่อส่ง debug=true มา ตอนเล่นจริงไม่นับเลย จึงไม่ช้าลง
  let dbg = { curves: 0, straight: 0, tail: 0, dots: 0 };

  // จอ Retina มีพิกเซลจริงมากกว่าขนาด CSS เท่าตัว (devicePixelRatio)
  // เราตั้ง canvas.width เป็นพิกเซลจริง (ภาพจะได้คม) แต่สั่ง setTransform ไว้
  // ทำให้ "พิกัดที่เราสั่งวาด" ยังเป็น CSS pixel อยู่ พิกัดสัดส่วน 0–1 จึงคูณกับ w,h ตรงๆ ได้เลย
  // (ระวัง: getImageData/putImageData ไม่สนใจ transform ต้องคูณ dpr เอง ดูใน fillAt)
  function applyTransform() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearBoard() {
    current = null;
    // ทาด้วยพิกเซลจริงของ canvas (ไม่ใช่ขนาด CSS) เพื่อให้คลุมเต็มใบเป๊ะ
    // เพราะ canvas.width ปัดเศษขึ้นได้ เช่น สูง 608.5px บนจอ dpr=1 จะได้ canvas สูง 609px
    // ถ้าทาแค่ 608.5 จะเหลือแถวล่างบางๆ ที่ยังโปร่งใส มองเห็นพื้นหลังทะลุขึ้นมาเป็นเส้นริ้ว
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BOARD_COLOR;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    applyTransform();
  }

  // สัดส่วน 0–1 → CSS pixel
  const px = (v, total) => v * total;

  // ─────────────────────────────────────────────────────────────────────
  // วาดเส้นให้โค้งเรียบ (โจทย์ข้อ 1)
  //
  // ถ้าลากตรงๆ จากจุดหนึ่งไปอีกจุดด้วย lineTo จะเห็นเป็นมุมหักชัดมากตอนลากเร็ว
  // เพราะตอนลากเร็ว เบราว์เซอร์เก็บจุดได้ห่างกันเป็นสิบพิกเซล ได้เส้นเป็นรูปหลายเหลี่ยม
  //
  // วิธีที่ใช้: "เส้นโค้งกำลังสอง" (quadraticCurveTo) ที่มีจุดจริงเป็นจุดควบคุม
  // แล้ววาดจากจุดกึ่งกลางของช่วงก่อนหน้า ไปยังจุดกึ่งกลางของช่วงนี้
  //   จุดจริง  ●───────●───────●
  //   ที่วาด   ●────◗───◗───◗──●   (◗ = จุดกึ่งกลาง ที่เส้นวิ่งผ่านจริง)
  // เส้นจะผ่านจุดกึ่งกลางพอดี (ซึ่งนิ้วลากผ่านจริง) และโค้งตามจุดจริง
  // ผลคือต่อให้จุดห่างกันแค่ไหน เส้นก็ยังโค้งนุ่มไม่เป็นเหลี่ยม
  //
  // ข้อดีที่สำคัญมาก: ตรรกะทั้งหมดอยู่ในไฟล์นี้ที่เดียว
  // ตอน "วาดซ้ำจากลิสต์" (จอเปลี่ยนขนาด หรือข้อ 4 ที่เครื่องอื่นรับ action ไปวาด)
  // ก็เรียกฟังก์ชันชุดเดียวกันนี้ ได้เส้นโค้งเหมือนกันเป๊ะ
  //
  // ที่ยัง stroke ทุกช่วงแทนที่จะรอวาดทีเดียวตอน stroke_end
  // เพราะผู้ใช้ต้องเห็นเส้นตามนิ้วทันที และปลายมนของแต่ละช่วงจะเชื่อมกันเนียนอยู่แล้ว
  // ─────────────────────────────────────────────────────────────────────

  function beginStroke(a) {
    // ยางลบ = ทาสีพื้นกระดานทับ (ดูหมายเหตุใน palette.js)
    const color = a.tool === "eraser" ? BOARD_COLOR : a.color;
    const x = px(a.x, w);
    const y = px(a.y, h);
    // เริ่มต้นยังไม่มีจุดกึ่งกลาง จุดกึ่งกลางแรกจึงเท่ากับจุดเริ่ม (เส้นจะได้ไม่กระโดด)
    current = { x, y, mx: x, my: y, color, size: a.size, drew: false };
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = a.size;
    ctx.lineCap = "round"; // ปลายมน ตามโจทย์ข้อ 1
    ctx.lineJoin = "round";
  }

  function extendStroke(a) {
    if (!current) return; // ไม่มีต้นเส้น (เช่นเข้าห้องกลางเส้น) ข้ามไป ไม่ให้พัง
    for (const p of a.points) {
      const nx = px(p.x, w);
      const ny = px(p.y, h);
      // จุดกึ่งกลางระหว่างจุดจริงล่าสุดกับจุดใหม่ = จุดที่เส้นจะวิ่งไปสิ้นสุด
      const mx = (current.x + nx) / 2;
      const my = (current.y + ny) / 2;

      // นับเพื่อโหมดดีบัก: ช่วงนี้จะ "โค้งจริง" ก็ต่อเมื่อจุดควบคุม (จุดจริง) ไม่ทับกับจุดเริ่ม
      // ทับกันเมื่อไหร่ สมการกำลังสองจะยุบเป็นเส้นตรงทันที ถึงจะเรียก quadTo ก็ตาม
      // เกิดได้สองกรณี: ช่วงแรกของทุกเส้น (mx,my ตั้งต้นทับกับ x,y พอดี)
      // และจุดที่นิ้วไม่ขยับเลยจากจุดก่อนหน้า
      if (debug) {
        if (current.mx === current.x && current.my === current.y) dbg.straight++;
        else dbg.curves++;
      }

      ctx.beginPath();
      ctx.moveTo(current.mx, current.my);
      ctx.quadraticCurveTo(current.x, current.y, mx, my); // จุดจริงเป็นตัวดึงให้โค้ง
      ctx.stroke();

      current.mx = mx;
      current.my = my;
      current.x = nx;
      current.y = ny;
      current.drew = true;
    }
  }

  function endStroke() {
    if (!current) return;
    if (!current.drew) {
      // คลิกเฉยๆ ไม่ลากเลย จะไม่มีช่วงให้ stroke จึงไม่มีรอยอะไรเกิดขึ้น
      // เติมจุดกลมขนาดเท่าความกว้างแปรงให้ แทนการทิ้งรอยคลิกที่มองไม่เห็น
      if (debug) dbg.dots++;
      ctx.beginPath();
      ctx.arc(current.x, current.y, current.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // ปิดปลายเส้น: เส้นโค้งหยุดที่ "จุดกึ่งกลาง" เสมอ จึงยังเหลือครึ่งช่วงสุดท้ายที่ไม่ได้วาด
      // ถ้าไม่ปิดตรงนี้ ปลายเส้นจะสั้นกว่าที่นิ้วลากไปครึ่งช่วง (เห็นชัดตอนลากเร็วๆ)
      // ช่วงนี้เป็น "เส้นตรง" แน่นอน เพราะเป็นการลากตรงปิดปลาย (lineTo)
      if (debug) dbg.tail++;
      ctx.beginPath();
      ctx.moveTo(current.mx, current.my);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }
    current = null;
  }

  function shapeAt(a) {
    current = null; // รูปทรงไม่ใช่เส้นที่ลากค้าง
    strokeShape(ctx, a, w, h);
  }

  function fillAt(a) {
    // อ่านขนาดจริงจาก canvas ตรงๆ ไม่คูณ dpr เอง จะได้ไม่เพี้ยนเรื่องปัดเศษ
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const x = Math.round(px(a.x, w) * dpr); // พิกัดจริง ไม่ใช่ CSS pixel (getImageData ไม่สน transform)
    const y = Math.round(px(a.y, h) * dpr);
    const img = ctx.getImageData(0, 0, cw, ch);
    if (floodFill(img, cw, ch, x, y, hexToRgb(a.color))) ctx.putImageData(img, 0, 0);
  }

  return {
    /** ตั้งขนาดกระดาน (CSS pixel) + ความละเอียดจอ แล้วล้างเป็นสีขาว */
    setSize(cssW, cssH, scale) {
      w = cssW;
      h = cssH;
      dpr = scale;
      clearBoard();
    },

    /** วาดหนึ่ง action ลงจอ — จุดเดียวที่ตัดสินว่า action แต่ละแบบทำอะไร */
    apply(action) {
      switch (action.type) {
        case "stroke_start":
          return beginStroke(action);
        case "stroke_points":
          return extendStroke(action);
        case "stroke_end":
          return endStroke();
        case "fill":
          return fillAt(action);
        case "draw_shape":
          return shapeAt(action);
        case "clear_canvas":
          return clearBoard();
        default:
          return undefined; // action แปลกปลอม ไม่ทำอะไร ไม่ให้ล้ม
      }
    },

    /** ล้างจอแล้ววาดใหม่ทั้งชุด — ใช้ตอนจอเปลี่ยนขนาด และตอนขึ้นตาใหม่ */
    replay(actions) {
      clearBoard();
      for (const a of actions) this.apply(a);
    },

    // ── สองตัวนี้มีไว้ให้โหมดดีบักชั่วคราว (?debug=1) เท่านั้น — ลบได้ทั้งก้อน ──
    // หมายเหตุ: replay() ก็เรียก apply() ข้างใน จึงนับรวมด้วย
    // Canvas.jsx จึงเรียก debugReset() ตอนเริ่มเส้นใหม่ เพื่อให้ตัวเลขหมายถึง "เส้นที่เพิ่งลาก" จริงๆ
    debugStats() {
      return { ...dbg };
    },
    debugReset() {
      dbg = { curves: 0, straight: 0, tail: 0, dots: 0 };
    },
  };
}
