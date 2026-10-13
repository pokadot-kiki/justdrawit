// ---------- กระเป๋าเงิน (coin) และของตกแต่งโปรไฟล์ ----------
// แผนเต็มอยู่ที่ design/profile-editor/PLAN.md — ไฟล์นี้คือ "รอบ A" (รากฐาน server ไม่แตะ client)
//
// แยกที่เก็บจาก Leaderboard เด็ดขาด (คนละไฟล์ คนละคีย์ Upstash คนละแฮช accountId)
// accountId ที่ใช้ในไฟล์นี้ = แฮช namespace เศรษฐกิจ (jdi:wallet-account:v1:<uid>) ที่ server/index.js คำนวณไว้ที่
// socket.data.walletAccountId — คนละตัวกับ socket.data.accountId ที่ใช้กับคะแนน Leaderboard
// Guest (ไม่ได้ล็อกอิน) ไม่มี accountId เลย = ไม่มีกระเป๋าเงินให้ผูกได้ตั้งแต่ชั้นนี้ (ทุกฟังก์ชันคืนค่าว่าง/error ถ้า accountId เป็น falsy)
//
// เก็บข้อมูลแบบเดียวกับ server/leaderboard.js ทุกตัวอักษร (อ่านคอมเมนต์ที่ไฟล์นั้นถ้าอยากรู้รายละเอียดกลไก Upstash):
//   1) ไฟล์ server/data/wallet.json — ค่าเริ่มต้น ใช้ตอนเล่นในเครื่อง
//   2) Upstash Redis (HTTP) คีย์ jdi:wallet:v1 — เปิดเมื่อตั้ง UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
const fs = require("fs");
const path = require("path");

const WALLET_FILE = process.env.WALLET_FILE || path.join(__dirname, "data", "wallet.json");
const CATALOG_FILE = process.env.SHOP_ITEMS_FILE || path.join(__dirname, "data", "shop-items.json");
const RULES_FILE = process.env.ECONOMY_RULES_FILE || path.join(__dirname, "economy-rules.json");
const REMOTE_KEY = "jdi:wallet:v1";
const REMOTE_TIMEOUT_MS = 5000;
const REMOTE_RETRY_MS = 5000;

// 5 หมวดของตกแต่ง — ต้องมีของฟรี (price:0) อย่างน้อยหมวดละ 1 ชิ้นเสมอใน shop-items.json (ดู PLAN.md ความเสี่ยงข้อ 3)
const CATEGORIES = ["frame", "hat", "glasses", "neck", "bg"];

// ---------- แคตตาล็อก + กติกา coin (ไฟล์ static อ่านครั้งเดียวตอนสตาร์ท ไม่ผูกกับ accountId ใคร) ----------
let catalog = [];
let rules = {};

function isValidItem(item) {
  return (
    typeof item?.id === "string" && item.id.length > 0 &&
    CATEGORIES.includes(item.category) &&
    typeof item.name === "string" && item.name.length > 0 &&
    Number.isInteger(item.price) && item.price >= 0
  );
}

// โหลดแคตตาล็อก/กติกาจากไฟล์ — พัง/หาย = ใช้ค่าว่าง/ค่าเริ่มต้นแล้วเตือน ห้ามทำให้ server สตาร์ทไม่ติด
function loadStaticData() {
  try {
    const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
    catalog = Array.isArray(raw) ? raw.filter(isValidItem) : [];
    if (catalog.length !== raw.length) console.warn(`shop-items.json มีไอเทมหน้าตาไม่ถูก ${raw.length - catalog.length} ชิ้น ถูกกรองทิ้ง`);
  } catch (err) {
    catalog = [];
    console.warn(`อ่าน shop-items.json ไม่ได้ (${err.message}) — ร้านค้าจะว่างเปล่า`);
  }
  try {
    const raw = JSON.parse(fs.readFileSync(RULES_FILE, "utf8"));
    rules = { ...raw };
    delete rules._note; // บรรทัดอธิบายในไฟล์ ไม่ใช่ตัวเลขกติกา
  } catch (err) {
    rules = { guessCorrect: 0, firstGuessBonus: 0, drawerPerGuesser: 0, finishGame: 0, dailyLogin: 0, dailyCap: 0, soloAiGuessCorrect: 0 };
    console.warn(`อ่าน economy-rules.json ไม่ได้ (${err.message}) — ใช้ค่า 0 ทั้งหมด (ไม่แจก coin จนกว่าจะแก้ไฟล์)`);
  }
}

function getCatalog() {
  return [...catalog];
}

function getRules() {
  return { ...rules };
}

// ---------- โหมด Upstash Redis (เหมือน leaderboard.js เป๊ะ) ----------
let cache = null; // null = โหมดไฟล์ · array = โหมด Upstash (กระเป๋าเงินทั้งหมดในหน่วยความจำ)
let remote = null;
let dirty = false;
let flushing = null;
let retryTimer = null;

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

async function init() {
  loadStaticData();
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (url && token) {
    remote = { url, token };
    try {
      const text = await redis(["GET", REMOTE_KEY]);
      let rows = [];
      if (text != null) {
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error("ข้อมูลใน Upstash ไม่ใช่ array");
        rows = data.filter(isValidWalletRow);
      }
      cache = rows;
      console.log(`Wallet: เก็บใน Upstash Redis (โหลดมา ${rows.length} บัญชี)`);
    } catch (err) {
      remote = null;
      cache = null;
      console.warn(`ต่อ Upstash สำหรับ wallet ไม่สำเร็จ (${err.message}) — ใช้ไฟล์แทน (ข้อมูลจะหายเมื่อรีสตาร์ทบน Render)`);
    }
  }
}

function persistSoon() {
  dirty = true;
  if (flushing) return;
  flushing = (async () => {
    while (dirty && remote) {
      dirty = false;
      try {
        await redis(["SET", REMOTE_KEY, JSON.stringify(cache)]);
      } catch (err) {
        dirty = true;
        console.warn(`เขียน wallet ลง Upstash ไม่สำเร็จ (${err.message}) — จะลองใหม่`);
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

// ---------- หน้าตาแถวกระเป๋าเงินหนึ่งบัญชี ----------
function isValidWalletRow(row) {
  return (
    typeof row?.accountId === "string" &&
    Number.isFinite(row.coins) &&
    Array.isArray(row.owned) &&
    row.equipped && typeof row.equipped === "object"
  );
}

function loadWallets() {
  if (cache) return [...cache];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`อ่าน wallet.json ไม่ได้ (${err.message}) — ถือว่ายังไม่มีกระเป๋าเงิน`);
    return [];
  }
  return Array.isArray(data) ? data.filter(isValidWalletRow) : [];
}

function writeWallets(rows) {
  if (cache) {
    cache = rows;
    persistSoon();
    return;
  }
  fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true });
  const tmp = `${WALLET_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2));
  fs.renameSync(tmp, WALLET_FILE);
}

function todayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatUpdatedAt(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

// แถวใหม่สำหรับบัญชีที่ไม่เคยมีกระเป๋าเงินมาก่อน — ของฟรี (price:0) ของทุกหมวดถูกใส่/ใส่อยู่ให้อัตโนมัติ
function defaultWalletRow(accountId) {
  const freeByCategory = {};
  for (const item of catalog) {
    if (item.price === 0 && !(item.category in freeByCategory)) freeByCategory[item.category] = item.id;
  }
  const owned = Object.values(freeByCategory);
  const equipped = {};
  for (const cat of CATEGORIES) equipped[cat] = freeByCategory[cat] ?? null;
  return {
    accountId,
    coins: 0,
    owned,
    equipped,
    avatarBase: { kind: "pixel", index: 0 },
    coinsToday: 0,
    coinsTodayDate: todayKey(),
    dailyLoginDate: "",
    updatedAt: formatUpdatedAt(new Date()),
  };
}

// ขึ้นวันใหม่แล้ว → รีเซ็ตตัวนับ dailyCap ของแถวนี้ (แก้ใน object ตรงๆ ไม่เขียนไฟล์ที่นี่ ผู้เรียกเป็นคนเขียนทีหลัง)
function resetDailyIfNewDay(row) {
  const today = todayKey();
  if (row.coinsTodayDate !== today) {
    row.coinsTodayDate = today;
    row.coinsToday = 0;
  }
}

function findOrCreateRow(rows, accountId) {
  const idx = rows.findIndex((r) => r.accountId === accountId);
  const row = idx >= 0 ? rows[idx] : defaultWalletRow(accountId);
  resetDailyIfNewDay(row);
  return { row, idx };
}

function saveRow(rows, idx, row) {
  row.updatedAt = formatUpdatedAt(new Date());
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);
  writeWallets(rows);
}

// อ่านอย่างเดียว ไม่เขียนไฟล์ — ใช้ตอนแค่อยากรู้สถานะปัจจุบัน (เช่นส่ง economy_state) บัญชีที่ยังไม่เคยมีแถวก็ได้ค่าเริ่มต้นที่ถูกต้องกลับมา
function readWallet(accountId) {
  if (!accountId) return null;
  const rows = loadWallets();
  const row = rows.find((r) => r.accountId === accountId);
  if (!row) return defaultWalletRow(accountId);
  resetDailyIfNewDay(row); // แค่คำนวณไว้แสดงผล ไม่เขียนกลับ (เขียนจริงรอธุรกรรมจริงที่ต้องแก้ไฟล์อยู่แล้ว)
  return row;
}

// payload สำหรับ event economy_state (ฝั่ง client ยังไม่มีในรอบ A แต่ server ส่งได้แล้ว)
function economyState(accountId) {
  const row = readWallet(accountId);
  if (!row) return null;
  return { coins: row.coins, owned: row.owned, equipped: row.equipped, avatarBase: row.avatarBase, catalog: getCatalog() };
}

// แจก coin จริง (เรียกจาก index.js ทุกจุดที่เกมตัดสินว่า "ได้ coin" — client ขอเองไม่ได้)
// เคารพ dailyCap เสมอ: granted อาจน้อยกว่า amount ที่ขอถ้าใกล้ชน cap แล้ว ไม่เคย error ไม่เคยบล็อกการเล่น
function grantCoins(accountId, amount) {
  if (!accountId || !(amount > 0)) return { granted: 0, coins: readWallet(accountId)?.coins ?? 0 };
  const rows = loadWallets();
  const { row, idx } = findOrCreateRow(rows, accountId);
  const room = Math.max(0, (Number(rules.dailyCap) || 0) - row.coinsToday);
  const granted = Math.min(Math.floor(amount), room);
  row.coins += granted;
  row.coinsToday += granted;
  saveRow(rows, idx, row);
  return { granted, coins: row.coins };
}

// โบนัสล็อกอินครั้งแรกของวัน — เรียกตอน connection สำเร็จ (ให้ครั้งเดียวต่อวันต่อบัญชี ไม่ว่าจะต่อ socket กี่รอบก็ตาม)
function grantDailyLoginBonus(accountId) {
  if (!accountId) return { granted: 0 };
  const rows = loadWallets();
  const { row, idx } = findOrCreateRow(rows, accountId);
  const today = todayKey();
  if (row.dailyLoginDate === today) return { granted: 0 }; // ได้ไปแล้ววันนี้ (ไม่เขียนไฟล์เปล่าๆ)
  row.dailyLoginDate = today;
  const room = Math.max(0, (Number(rules.dailyCap) || 0) - row.coinsToday);
  const granted = Math.min(Number(rules.dailyLogin) || 0, room);
  row.coins += granted;
  row.coinsToday += granted;
  saveRow(rows, idx, row);
  return { granted };
}

// ซื้อไอเทม — server ตรวจราคา/ยอดเงิน/ของซ้ำเองทั้งหมด client ส่งแค่ itemId มา
function buyItem(accountId, itemId) {
  if (!accountId) return { ok: false, error: "ECONOMY_GUEST" };
  const item = catalog.find((i) => i.id === itemId);
  if (!item) return { ok: false, error: "ITEM_NOT_FOUND" };
  const rows = loadWallets();
  const { row, idx } = findOrCreateRow(rows, accountId);
  if (row.owned.includes(itemId)) return { ok: true, coins: row.coins, owned: row.owned }; // มีอยู่แล้ว ไม่หักซ้ำ ไม่เขียนไฟล์เปล่าๆ
  if (row.coins < item.price) return { ok: false, error: "INSUFFICIENT_COINS" };
  row.coins -= item.price;
  row.owned = [...row.owned, itemId];
  saveRow(rows, idx, row);
  return { ok: true, coins: row.coins, owned: row.owned };
}

// ใส่/ถอดของตกแต่งหนึ่งหมวด — itemId เป็น null = ถอด
function equipItem(accountId, category, itemId) {
  if (!accountId) return { ok: false, error: "ECONOMY_GUEST" };
  if (!CATEGORIES.includes(category)) return { ok: false, error: "ITEM_NOT_FOUND" };
  if (itemId !== null) {
    const item = catalog.find((i) => i.id === itemId && i.category === category);
    if (!item) return { ok: false, error: "ITEM_NOT_FOUND" };
  }
  const rows = loadWallets();
  const { row, idx } = findOrCreateRow(rows, accountId);
  if (itemId !== null && !row.owned.includes(itemId)) return { ok: false, error: "ITEM_NOT_OWNED" };
  row.equipped = { ...row.equipped, [category]: itemId };
  saveRow(rows, idx, row);
  return { ok: true, equipped: row.equipped };
}

// เลือกอวตารพิกเซลฐาน (0-5) — "photo" ยังไม่รองรับในรอบนี้ (รอบ D)
function setAvatarBase(accountId, kind, index) {
  if (!accountId) return { ok: false, error: "ECONOMY_GUEST" };
  if (kind !== "pixel") return { ok: false, error: "ITEM_NOT_FOUND" };
  const safeIndex = Number.isInteger(index) && index >= 0 && index <= 5 ? index : 0;
  const rows = loadWallets();
  const { row, idx } = findOrCreateRow(rows, accountId);
  row.avatarBase = { kind: "pixel", index: safeIndex };
  saveRow(rows, idx, row);
  return { ok: true, avatarBase: row.avatarBase };
}

module.exports = {
  init,
  flush,
  WALLET_FILE,
  CATEGORIES,
  getCatalog,
  getRules,
  economyState,
  readWallet,
  grantCoins,
  grantDailyLoginBonus,
  buyItem,
  equipItem,
  setAvatarBase,
  loadWallets,
  writeWallets,
};
