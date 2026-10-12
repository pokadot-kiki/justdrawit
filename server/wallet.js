// ---------- กระเป๋า coin ต่อบัญชี (เฟส B1) ----------
// ไม่ผูกกับ socket · index.js เป็นคนเรียก award() ตอนเกิดเหตุการณ์จริงในเกม (ทายถูก จบเกม ฯลฯ)
// ไม่มีทางให้ client เพิ่ม coin เอง: ไฟล์นี้ไม่รับข้อมูลจาก client เลย รับแค่ accountId ที่ server สร้างจาก session
//
// ที่เก็บ (แบบเดียวกับ leaderboard.js):
//   ตั้ง UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN → Upstash Redis คีย์เดียว `jdi:wallets:v1` (JSON ทั้งก้อน แยกจากคะแนน)
//   ไม่ตั้ง / ต่อไม่ได้ / ข้อมูลเสีย → ไฟล์ server/data/wallets.json (env WALLET_FILE เปลี่ยนที่ได้ ไว้ให้เทส) ไม่ล่ม
// ทั้งสองโหมดถือยอดไว้ในหน่วยความจำ จึงตอบได้ทันทีไม่ต้อง async · เขียนกลับเบื้องหลัง
// (เก็บทั้งก้อนในคีย์เดียวใช้ได้เมื่อมี server ตัวเดียว — ถ้าวันหนึ่งรันหลายตัวต้องเปลี่ยนเป็นคีย์ต่อบัญชี)
const fs = require("fs");
const path = require("path");
const RULES = require("../shared/coinRules.json");

const REMOTE_KEY = "jdi:wallets:v1";
const REMOTE_TIMEOUT_MS = 5000;
const REMOTE_RETRY_MS = 5000;
const WALLET_FILE = process.env.WALLET_FILE || path.join(__dirname, "data", "wallets.json");
const ACCOUNT_ID_RE = /^[0-9a-f]{64}$/; // accountId = SHA-256 ที่ server สร้างจาก Firebase UID (index.js)

// เหตุผลที่ได้ coin → จำนวน (ตัวเลขทั้งหมดอยู่ใน shared/coinRules.json ไฟล์เดียว)
const REASONS = {
  guessCorrect: RULES.guessCorrect,       // ทายถูก
  firstGuess: RULES.firstGuess,           // ทายถูกเป็นคนแรกของตา
  drawerPerGuesser: RULES.drawerPerGuesser, // มีคนทายภาพเราถูก (ต่อคน)
  finishGame: RULES.finishGame,           // เล่นจนจบเกม
  dailyBonus: RULES.dailyBonus,           // จบเกมแรกของวัน (ไม่นับเข้าเพดานต่อวัน)
};
const UNCAPPED = new Set(["dailyBonus"]);

let wallets = {}; // accountId → { coins, day, earnedToday, bonusDay }
let remote = null; // { url, token } เมื่อเปิดโหมด Upstash
let dirty = false;
let flushing = null;
let retryTimer = null;

const validAccount = (id) => typeof id === "string" && ACCOUNT_ID_RE.test(id);
const cleanInt = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);

// วันที่ตามเวลาไทย "YYYY-MM-DD" — เพดานต่อวันและโบนัสรายวันรีเซ็ตตอนเที่ยงคืนเวลาไทย
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: RULES.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
const dayOf = (now = new Date()) => dayFormat.format(now);

// ข้อมูลที่อ่านมา (ไฟล์/Upstash) อาจเพี้ยน: เก็บเฉพาะแถวที่หน้าตาถูก ที่เหลือทิ้ง
function sanitize(data) {
  const out = {};
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  for (const [id, w] of Object.entries(data)) {
    if (!validAccount(id) || !w || typeof w !== "object") continue;
    out[id] = {
      coins: cleanInt(w.coins),
      day: typeof w.day === "string" ? w.day : "",
      earnedToday: cleanInt(w.earnedToday),
      bonusDay: typeof w.bonusDay === "string" ? w.bonusDay : "",
    };
  }
  return out;
}

async function redis(command) {
  const res = await fetch(remote.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${remote.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
  return body.result;
}

function loadFile() {
  try {
    return sanitize(JSON.parse(fs.readFileSync(WALLET_FILE, "utf8")));
  } catch {
    return {}; // ไม่มีไฟล์/JSON เสีย = เริ่มจากว่าง (ไม่ล่ม)
  }
}

// เขียนไฟล์แบบปลอดภัย: เขียนไฟล์ชั่วคราวก่อนแล้ว rename ทับ (ไฟดับกลางทางไฟล์จริงยังครบ)
function writeFile() {
  try {
    fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true });
    const tmp = `${WALLET_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(wallets));
    fs.renameSync(tmp, WALLET_FILE);
  } catch (err) {
    console.warn(`เขียนไฟล์ coin ไม่สำเร็จ (${err.message})`);
  }
}

// เรียกครั้งเดียวตอนสตาร์ท (index.js รอให้เสร็จก่อนเปิดรับคน) · ไม่ throw
async function init() {
  remote = null;
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (url && token) {
    remote = { url, token };
    try {
      const text = await redis(["GET", REMOTE_KEY]);
      const data = text == null ? {} : JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("ข้อมูลใน Upstash ไม่ใช่ object");
      wallets = sanitize(data);
      console.log(`Coin: เก็บใน Upstash Redis (โหลดมา ${Object.keys(wallets).length} บัญชี)`);
      return;
    } catch (err) {
      remote = null;
      console.warn(`ต่อ Upstash ไม่สำเร็จ (${err.message}) — coin ใช้ไฟล์แทน`);
    }
  }
  wallets = loadFile();
  // เตือนชัดๆ: บนที่ที่ดิสก์ไม่ถาวร (เช่น Render) ไฟล์นี้หายทุกครั้งที่ server รีสตาร์ท/deploy ใหม่
  console.warn(
    `⚠️  Coin: เก็บในไฟล์ ${path.relative(path.join(__dirname, ".."), WALLET_FILE).split(path.sep).join("/")} (ไม่ได้ตั้ง Upstash) — ` +
    "ยอด coin จะหายเมื่อ server รีสตาร์ทบนที่ที่ดิสก์ไม่ถาวร (เช่น Render) ตั้ง UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN เพื่อเก็บถาวร"
  );
}

// เขียนทั้งก้อนกลับ Upstash เบื้องหลัง · ล้มแล้วลองใหม่ทุก REMOTE_RETRY_MS (ยอดในหน่วยความจำยังถูกอยู่)
function persistSoon() {
  dirty = true;
  if (flushing) return;
  flushing = (async () => {
    while (dirty && remote) {
      dirty = false;
      try {
        await redis(["SET", REMOTE_KEY, JSON.stringify(wallets)]);
      } catch (err) {
        dirty = true;
        console.warn(`เขียน coin ลง Upstash ไม่สำเร็จ (${err.message}) — จะลองใหม่`);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          flushing = null;
          if (dirty) persistSoon();
        }, REMOTE_RETRY_MS);
        retryTimer.unref?.();
        return;
      }
    }
    flushing = null;
  })();
}

function persist() {
  if (remote) persistSoon();
  else writeFile();
}

// รอให้เขียนค้างเสร็จ (ตอน server โดนสั่งปิด) ไม่ให้เสีย coin ล่าสุด
async function flush(timeoutMs = 4000) {
  const until = Date.now() + timeoutMs;
  while (remote && (dirty || flushing) && Date.now() < until) {
    if (dirty && (retryTimer || !flushing)) {
      clearTimeout(retryTimer);
      retryTimer = null;
      flushing = null;
      persistSoon();
    }
    await (flushing || Promise.resolve());
    await new Promise((r) => setTimeout(r, 25));
  }
}

// กระเป๋าของบัญชี ณ วันนี้ (ข้ามวันแล้ว earnedToday นับใหม่) — ยังไม่เขียนลงที่เก็บ
function current(accountId, now) {
  const today = dayOf(now);
  const w = wallets[accountId] ?? { coins: 0, day: today, earnedToday: 0, bonusDay: "" };
  if (w.day !== today) {
    w.day = today;
    w.earnedToday = 0;
  }
  return w;
}

const view = (w, today) => ({
  coins: w.coins,
  earnedToday: w.earnedToday,
  dailyCap: RULES.dailyCap,
  dailyBonusClaimed: w.bonusDay === today,
});

// ยอดของบัญชี · guest/accountId ไม่ถูกรูปแบบ = null
function get(accountId, now = new Date()) {
  if (!validAccount(accountId)) return null;
  return view(current(accountId, now), dayOf(now));
}

// ให้ coin ตามเหตุผล (หลายเหตุผลพร้อมกันได้) · คืน { ...ยอดใหม่, gains: [{ reason, amount }] } เฉพาะรายการที่ได้จริง
// หรือ null เมื่อเป็น guest · ไม่รู้จักเหตุผล · ชนเพดานต่อวันแล้วไม่ได้อะไรเลย
// โบนัสรายวันให้ได้วันละครั้ง และไม่นับเข้าเพดาน · เหตุผลอื่นรวมกันไม่เกิน dailyCap ต่อวัน (ได้เท่าที่เหลือ)
function award(accountId, reasons, now = new Date()) {
  if (!validAccount(accountId)) return null;
  const list = (Array.isArray(reasons) ? reasons : [reasons]).filter((r) => Object.hasOwn(REASONS, r));
  if (list.length === 0) return null;
  const today = dayOf(now);
  const w = current(accountId, now);
  const gains = [];
  for (const reason of list) {
    let amount = REASONS[reason];
    if (UNCAPPED.has(reason)) {
      if (w.bonusDay === today) continue; // รับของวันนี้ไปแล้ว
      w.bonusDay = today;
    } else {
      amount = Math.min(amount, Math.max(0, RULES.dailyCap - w.earnedToday));
      if (amount <= 0) continue; // ถึงเพดานของวันแล้ว
      w.earnedToday += amount;
    }
    w.coins += amount;
    gains.push({ reason, amount });
  }
  if (gains.length === 0) return null;
  wallets[accountId] = w;
  persist();
  return { ...view(w, today), gains };
}

module.exports = { init, flush, get, award, dayOf, RULES, REASONS, WALLET_FILE, REMOTE_KEY, validAccount };
