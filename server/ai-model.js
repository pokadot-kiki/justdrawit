// ---------- สมอง AI แบบโมเดลในเครื่อง (QuickDraw 345 SE-ResNet) ----------
// รันที่ server เท่านั้น ไม่ผูกกับ socket · โหลดไม่ได้ = คืน false แล้วให้ ai.js ใช้สมองถัดไป ห้ามล่ม
// โมเดล: zarqankhn/quickdraw-345-tflite (Apache 2.0) แปลงเป็น ONNX · 345 คำ · อินพุต [1,28,28,1]
// สคริปต์ฝึกใช้ bitmap Quick Draw ตรงๆ /255: พื้นดำ = 0 เส้นสว่าง = 1 (ตรวจด้วยภาพวงกลมจริง)
const fs = require("fs");
const path = require("path");

const MODEL_DIR = process.env.AI_MODEL_DIR || path.join(__dirname, "models", "quickdraw345");
const SIZE = 28;
const INK_MIN = 40; // ความเข้มต่ำสุด (0–255) ที่นับว่าเป็นเส้น ตัดสัญญาณรบกวนของ JPEG

let session = null;
let labels = []; // labels[i] = ชื่ออังกฤษของคลาส i

function isReady() {
  return session !== null;
}

// โหลดโมเดล · คืน true/false · ไม่ throw
async function load() {
  try {
    const onnx = require("onnxruntime-node");
    const list = fs.readFileSync(path.join(MODEL_DIR, "labels.txt"), "utf8").trimEnd().split(/\r?\n/);
    if (list.length !== 345 || new Set(list).size !== 345 || list.some((x) => !x.trim())) throw new Error("labels.txt ไม่ถูกรูปแบบ");
    const s = await onnx.InferenceSession.create(path.join(MODEL_DIR, "model.onnx"));
    labels = list;
    session = s;
    return true;
  } catch (err) {
    session = null;
    console.warn("โหลดโมเดล AI ไม่สำเร็จ (ใช้สมองอื่นแทน):", err.message);
    return false;
  }
}

// ความหนาเส้นสำคัญที่สุดต่อความแม่นของโมเดล: ข้อมูลฝึกมีเส้นกว้างราว 1.5 จาก 24 พิกเซลของภาพวาด (6.25%)
// วัดแล้วเส้นหนาเป็น 3px ที่ 28×28 ทายถูกลดลงมาก ส่วนผู้เล่นเลือกแปรงได้ 2–40px จึงต้องปรับให้เท่ากันก่อนย่อ
const TARGET_STROKE = 1.5 / 24; // สัดส่วนความหนาเส้นต่อด้านของภาพวาด
const MAX_MORPH = 0.06;         // ปรับเส้นได้ไม่เกิน 6% ของด้านภาพวาดต่อข้าง (กันพื้นที่ที่เทสีจนหายหมด)

// ความหนาเส้นโดยประมาณ = 2 × พื้นที่ ÷ จำนวนพิกเซลขอบ (ใช้ได้กับเส้นเรียวยาว)
function estimateStroke(img, n) {
  let area = 0, edge = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (img[y * n + x] < 128) continue;
      area++;
      const up = y > 0 ? img[(y - 1) * n + x] : 0;
      const down = y < n - 1 ? img[(y + 1) * n + x] : 0;
      const l = x > 0 ? img[y * n + x - 1] : 0;
      const r = x < n - 1 ? img[y * n + x + 1] : 0;
      if (up < 128 || down < 128 || l < 128 || r < 128) edge++;
    }
  }
  return edge === 0 ? 0 : (2 * area) / edge;
}

// ขยาย (max) หรือกร่อน (min) ภาพขาวดำด้วยสี่เหลี่ยมรัศมี r ทีละแกน
function morph(img, n, r, grow) {
  const pick = grow ? Math.max : Math.min;
  const init = grow ? 0 : 255;
  const tmp = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = init;
      for (let k = Math.max(0, x - r); k <= Math.min(n - 1, x + r); k++) v = pick(v, img[y * n + k]);
      tmp[y * n + x] = v;
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = init;
      for (let k = Math.max(0, y - r); k <= Math.min(n - 1, y + r); k++) v = pick(v, tmp[k * n + x]);
      img[y * n + x] = v;
    }
  }
}

// ปรับความหนาเส้นในภาพ (แก้ที่ตัวภาพเลย) ให้ใกล้ TARGET_STROKE
function normalizeStroke(img, n, side) {
  const est = estimateStroke(img, n);
  if (est === 0) return;
  const target = side * TARGET_STROKE;
  const cap = Math.max(1, Math.round(side * MAX_MORPH));
  const r = Math.max(-cap, Math.min(cap, Math.round((target - est) / 2)));
  if (r !== 0) morph(img, n, Math.abs(r), r > 0);
}

// ตัดขอบว่าง → จัดให้เป็นสี่เหลี่ยมจัตุรัสตรงกลาง → ย่อเป็น 28×28 → ปรับความเข้มให้เหมือนข้อมูลที่ฝึกมา
// อินพุตเป็น data URL (jpeg/png/webp) พื้นขาว เส้นสีใดก็ได้ · คืน Float32Array(784) หรือ null ถ้ากระดานว่าง
async function preprocess(image) {
  const sharp = require("sharp");
  const m = /^data:image\/(?:png|jpeg|webp);base64,(.+)$/.exec(image);
  if (!m) return null;
  const { data, info } = await sharp(Buffer.from(m[1], "base64"))
    .flatten({ background: "#ffffff" }) // โปร่งใส → ขาว
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  // ความเข้มของหมึก = ห่างจากสีขาวแค่ไหน (ใช้ช่องที่เข้มสุด สีอ่อนอย่างเหลืองจะได้ไม่หาย)
  const ink = new Uint8Array(w * h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const v = 255 - Math.min(data[i], data[i + 1], data[i + 2]);
      ink[y * w + x] = v < INK_MIN ? 0 : v;
      if (v >= INK_MIN) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null; // ไม่มีเส้นเลย

  // สี่เหลี่ยมจัตุรัสครอบรอยวาด เว้นขอบให้ภาพวาดกินที่ ~24 จาก 28 พิกเซล (ตรงกับชุดข้อมูลที่ฝึก)
  const side = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  const pad = Math.max(2, Math.round(side * 0.083));
  const box = side + pad * 2;
  const cx = (x0 + x1 + 1) / 2;
  const cy = (y0 + y1 + 1) / 2;
  const left = Math.round(cx - box / 2);
  const top = Math.round(cy - box / 2);

  // วางลงผืนผ้าสี่เหลี่ยมจัตุรัส (พื้นดำ) แล้วย่อ — ทำเองเพื่อให้ครอบนอกขอบภาพได้
  const sq = Buffer.alloc(box * box);
  for (let y = 0; y < box; y++) {
    const sy = y + top;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < box; x++) {
      const sx = x + left;
      if (sx < 0 || sx >= w) continue;
      sq[y * box + x] = ink[sy * w + sx];
    }
  }
  normalizeStroke(sq, box, side);
  const small = await sharp(sq, { raw: { width: box, height: box, channels: 1 } })
    .resize(SIZE, SIZE, { kernel: "lanczos3", fit: "fill" })
    .toColourspace("b-w") // บังคับช่องเดียว ไม่งั้น sharp คืน 3 ช่อง (RGB) แล้วอ่านภาพเพี้ยน
    .raw()
    .toBuffer();
  if (small.length !== SIZE * SIZE) throw new Error("ย่อภาพได้ขนาดไม่ตรง");

  // ยืดความเข้มให้ตรงกับภาพฝึก: พื้นดำ = 0, เส้นสว่าง = 1
  let max = 0;
  for (const v of small) if (v > max) max = v;
  const out = new Float32Array(SIZE * SIZE);
  if (max === 0) return null;
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, small[i] / max);
  return out;
}

// ทายภาพ · allowed = Set ของชื่อคลาสอังกฤษที่ยอมให้ตอบ (คำที่อยู่ในเกม) · คืนอันดับสูงสุดก่อน
// [{ label, prob }] หรือ null ถ้ากระดานว่าง · โมเดลไม่พร้อม/พัง = throw (ให้ ai.js ตัดสินใจ)
async function classify(image, { allowed = null, top = 5 } = {}) {
  if (!session) throw new Error("โมเดลยังไม่ถูกโหลด");
  const pixels = await preprocess(image);
  if (!pixels) return null;
  const onnx = require("onnxruntime-node");
  const feeds = { [session.inputNames[0]]: new onnx.Tensor("float32", pixels, [1, SIZE, SIZE, 1]) };
  const result = await session.run(feeds);
  const scores = result[session.outputNames[0]]?.data;
  if (!scores || scores.length !== labels.length || Array.from(scores).some((v) => !Number.isFinite(v) || v < 0 || v > 1)) {
    throw new Error("ผลโมเดล AI ไม่ถูกรูปแบบ");
  }
  // โมเดลให้ softmax มาแล้ว: กรองเฉพาะคำในเกม แต่คงความมั่นใจจริงของแต่ละคำไว้ใช้คิดคะแนน
  const keep = [];
  for (let i = 0; i < labels.length; i++) if (!allowed || allowed.has(labels[i])) keep.push(i);
  if (keep.length === 0) return null;
  return keep
    .map((i) => ({ label: labels[i], prob: scores[i] }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, top);
}

module.exports = { load, isReady, classify, preprocess };
