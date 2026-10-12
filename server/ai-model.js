// ---------- สมอง AI แบบโมเดลในเครื่อง (Quick, Draw! 345 คำ) ----------
// รันที่ server เท่านั้น ไม่ผูกกับ socket · โหลดไม่ได้ = คืน false แล้วให้ ai.js ใช้สมองถัดไป ห้าม throw ให้ server ล่ม
// รองรับโมเดลสองตัว เลือกตามลำดับนี้ (Solo กับ Multiplayer vs AI ใช้ตัวเดียวกันเสมอ):
//   1) quickdraw345  server/models/quickdraw345/ (model.onnx + labels.txt)
//      zarqankhn/quickdraw-345-tflite (Apache 2.0) แปลงเป็น ONNX เอง · อินพุต [1,28,28,1] · เอาต์พุตเป็น softmax แล้ว
//   2) mobilevit     server/models/ (model.onnx + config.json) — ตัวที่ `npm run get-model` ดาวน์โหลดให้
//      VinayHajare/quickdraw-mobilevit-small-onnx (MIT) · อินพุต [1,1,28,28] · เอาต์พุตเป็น logits
// ไม่มีตัวแรก หรือตัวแรกโหลดไม่ได้ → ใช้ตัวที่สอง · ภาพที่ป้อน (พื้นดำ = 0 เส้นสว่าง = 1) เตรียมแบบเดียวกันทั้งสองตัว
const fs = require("fs");
const path = require("path");

const MODELS_ROOT = path.join(__dirname, "models");
const SIZE = 28;
const INK_MIN = 40; // ความเข้มต่ำสุด (0–255) ที่นับว่าเป็นเส้น ตัดสัญญาณรบกวนของ JPEG

// รูปแบบของโมเดลแต่ละตัว: อ่านรายชื่อคลาสจากไฟล์ไหน · รูปร่างอินพุต · เอาต์พุตเป็นความน่าจะเป็นแล้วหรือยัง
const FORMATS = {
  quickdraw345: {
    title: "QuickDraw 345 SE-ResNet",
    labelFile: "labels.txt",
    shape: [1, SIZE, SIZE, 1],
    probs: true,
    readLabels(dir) {
      const list = fs.readFileSync(path.join(dir, "labels.txt"), "utf8").trimEnd().split(/\r?\n/);
      if (list.length !== 345 || new Set(list).size !== 345 || list.some((x) => !x.trim())) throw new Error("labels.txt ไม่ถูกรูปแบบ");
      return list;
    },
  },
  mobilevit: {
    title: "Quick, Draw! MobileViT",
    labelFile: "config.json",
    shape: [1, 1, SIZE, SIZE],
    probs: false,
    readLabels(dir) {
      const config = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
      const list = [];
      for (const id of Object.keys(config.id2label).map(Number)) list[id] = config.id2label[id];
      if (list.length < 2 || list.some((x) => typeof x !== "string")) throw new Error("config.json ไม่ถูกรูปแบบ");
      return list;
    },
  },
};

// ลำดับที่ลองโหลด · ตั้ง AI_MODEL_DIR = ใช้โฟลเดอร์นั้นที่เดียว (ไว้ให้เทสชี้ไปที่อื่น) ดูรูปแบบจากไฟล์ที่มีข้างใน
function candidates() {
  const custom = process.env.AI_MODEL_DIR;
  if (custom) {
    const format = fs.existsSync(path.join(custom, FORMATS.quickdraw345.labelFile)) ? "quickdraw345" : "mobilevit";
    return [{ format, dir: custom }];
  }
  return [
    { format: "quickdraw345", dir: path.join(MODELS_ROOT, "quickdraw345") },
    { format: "mobilevit", dir: MODELS_ROOT },
  ];
}

let session = null;
let labels = []; // labels[i] = ชื่ออังกฤษของคลาส i
let active = null; // { format, title, dir } ของโมเดลที่โหลดติด

function isReady() {
  return session !== null;
}

// โมเดลที่ใช้อยู่ตอนนี้ (null = ไม่มี) — ไว้พิมพ์ตอนสตาร์ทและให้เทสตรวจ
function info() {
  return active ? { ...active } : null;
}

// โหลดโมเดลตัวแรกที่โหลดติดตามลำดับ · คืน true/false · ไม่ throw
// list ส่งมาเองได้ (เทสใช้จำลอง "ตัวแรกเสีย ต้องถอยไปตัวที่สอง")
async function load(list = candidates()) {
  session = null;
  labels = [];
  active = null;
  const problems = [];
  for (const { format, dir } of list) {
    const spec = FORMATS[format];
    // ไม่มีไฟล์ของตัวนี้ = ข้ามไปตัวถัดไป (เรื่องปกติ ไม่ใช่ข้อผิดพลาด)
    if (!spec || !fs.existsSync(path.join(dir, "model.onnx")) || !fs.existsSync(path.join(dir, spec.labelFile))) {
      problems.push(`${format}: ไม่พบไฟล์ใน ${dir}`);
      continue;
    }
    try {
      const onnx = require("onnxruntime-node");
      const names = spec.readLabels(dir);
      const s = await onnx.InferenceSession.create(path.join(dir, "model.onnx"));
      labels = names;
      session = s;
      active = { format, title: spec.title, dir };
      return true;
    } catch (err) {
      // มีไฟล์แต่เสีย: บอกให้รู้ แล้วลองตัวถัดไป (ไม่ปล่อยให้ตกไปโหมดจำลองทั้งที่ยังมีอีกตัวให้ใช้)
      console.warn(`โหลดโมเดล AI ${format} ไม่สำเร็จ (ลองตัวถัดไป):`, err.message);
      problems.push(`${format}: ${err.message}`);
    }
  }
  console.warn("โหลดโมเดล AI ไม่สำเร็จ (ใช้สมองอื่นแทน):", problems.join(" · "));
  return false;
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
  const spec = FORMATS[active.format];
  const feeds = { [session.inputNames[0]]: new onnx.Tensor("float32", pixels, spec.shape) };
  const result = await session.run(feeds);
  const raw = result[session.outputNames[0]]?.data;
  if (!raw || raw.length !== labels.length || Array.from(raw).some((v) => !Number.isFinite(v))) {
    throw new Error("ผลโมเดล AI ไม่ถูกรูปแบบ");
  }
  // AI ต้องเลือกจากคำที่เกมมีเท่านั้น: ตัดคลาสอื่นทิ้งก่อน
  const keep = [];
  for (let i = 0; i < labels.length; i++) if (!allowed || allowed.has(labels[i])) keep.push(i);
  if (keep.length === 0) return null;
  let probs;
  if (spec.probs) {
    // quickdraw345 ให้ softmax มาแล้ว: คงความมั่นใจจริงของแต่ละคำไว้ใช้คิดคะแนน
    if (Array.from(raw).some((v) => v < 0 || v > 1)) throw new Error("ผลโมเดล AI ไม่ถูกรูปแบบ");
    probs = keep.map((i) => raw[i]);
  } else {
    // mobilevit ให้ logits: คิดความน่าจะเป็นเฉพาะในกลุ่มคำที่เกมมี
    probs = softmax(keep.map((i) => raw[i]));
  }
  return keep
    .map((i, k) => ({ label: labels[i], prob: probs[k] }))
    .sort((x, y) => y.prob - x.prob)
    .slice(0, top);
}

function softmax(logits) {
  let max = -Infinity;
  for (const v of logits) if (v > max) max = v;
  const exps = Array.from(logits, (v) => Math.exp(v - max));
  const sum = exps.reduce((x, y) => x + y, 0);
  return exps.map((e) => e / sum);
}

module.exports = { load, isReady, info, classify, preprocess };
