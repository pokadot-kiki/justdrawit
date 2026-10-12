// เทสกระเป๋า coin (เฟส B1) — รัน: node tests/wallet.js (ต่อท้าย npm test)
// ส่วน 1: wallet.js ตรงๆ (ตัวเลข · เพดานต่อวัน · โบนัสรายวัน · ข้ามวัน · ไฟล์/Upstash ปลอม)
// ส่วน 2: server จริงผ่าน socket (จุดที่ให้ coin ในแต่ละโหมด · guest ไม่ได้ · client โกงไม่ได้ · เพดานต่อวัน · ห้องคนน้อย)
// "ล็อกอิน" ในเทส = session cookie ที่เซ็นด้วย secret ปลอมของเทสเอง (ไม่แตะ Firebase และไม่อ่านคีย์จริงจาก server/.env)
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
// socket ที่ต้องแนบ cookie ตอนจับมือ: ใช้ socket.io-client ตัว Node ของฝั่ง client (ติดตั้งแล้วจาก npm run setup — ไม่ได้เพิ่ม library)
// ตัว client-dist ที่ smoke.js ใช้เป็นฉบับเบราว์เซอร์ ตั้ง header cookie เองไม่ได้
let io;
try {
  ({ io } = require(path.join(__dirname, "..", "..", "client", "node_modules", "socket.io-client")));
} catch {
  console.log("❌ เทส wallet ต้องใช้ client/node_modules/socket.io-client — รัน npm run setup (หรือ cd client && npm install) ก่อน");
  process.exit(1);
}

// เทสต้องไม่ใช้ค่าจริงจาก server/.env ของเครื่องนักพัฒนา — ตั้งเป็นค่าว่างไว้ก่อน (dotenv ไม่เขียนทับ)
for (const k of ["FIREBASE_API_KEY", "AUTH_SESSION_SECRET", "ANTHROPIC_API_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) process.env[k] = "";

const SERVER_DIR = path.join(__dirname, "..");
const PORT = process.env.WALLET_PORT || "3075";
const STUB_PORT = String(Number(PORT) + 1);
const URL = `http://localhost:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-wallet-"));
const TEST_SECRET = "wallet-test-secret-not-real-0123456789abcdef"; // ≥ 32 ไบต์ ใช้ในเทสเท่านั้น
const authSession = require("../auth-session");
const RULES = require("../../shared/coinRules.json");

let passed = 0, failed = 0;
const problems = [];
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { passed++; console.log(`✅ ${label}`); }
  else { failed++; problems.push(label); console.log(`❌ ${label}  ได้ ${JSON.stringify(got)} คาดว่า ${JSON.stringify(want)}`); }
}
const checkOk = (label, cond, extra = "") => check(label + (cond ? "" : extra ? ` (${extra})` : ""), !!cond, true);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const accountIdOf = (sub) => crypto.createHash("sha256").update(`jdi:score-account:v1:${sub}`).digest("hex");
const cookieOf = (sub) => `${authSession.SESSION_COOKIE}=${authSession.signSession({ sub, email: `${sub}@example.com`, name: sub }, TEST_SECRET)}`;
const G = (reason, amount) => ({ reason, amount });

// โหลด wallet.js ตัวใหม่ทุกครั้ง (ไฟล์/env ต่างกันในแต่ละกรณี) · เก็บข้อความเตือนที่พิมพ์ไว้ตรวจ
function freshWallet(env) {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  delete require.cache[require.resolve("../wallet")];
  return require("../wallet");
}
async function quietInit(w) {
  const logs = [];
  const ow = console.warn, ol = console.log;
  console.warn = (...a) => logs.push(a.join(" ")); console.log = (...a) => logs.push(a.join(" "));
  try { await w.init(); } finally { console.warn = ow; console.log = ol; }
  return logs.join("\n");
}

async function unitTests() {
  console.log("\n── ส่วน 1: wallet.js ──");
  const file = path.join(TMP, "unit-wallets.json");
  let w = freshWallet({ WALLET_FILE: file, UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" });
  const warn = await quietInit(w);
  checkOk("ไม่มี Upstash: พิมพ์คำเตือนตอนสตาร์ทว่า coin เก็บในไฟล์และจะหายเมื่อ server รีสตาร์ทบนดิสก์ไม่ถาวร", warn.includes("Coin: เก็บในไฟล์") && warn.includes("รีสตาร์ท") && warn.includes("Render"), warn);

  check("ตัวเลขตามดีไซน์ (shared/coinRules.json)", [RULES.guessCorrect, RULES.firstGuess, RULES.drawerPerGuesser, RULES.finishGame, RULES.dailyBonus, RULES.dailyCap, RULES.minPlayers], [10, 5, 3, 5, 20, 300, 2]);
  check("wallet.js ใช้ตัวเลขจากไฟล์เดียวกัน", w.REASONS, { guessCorrect: 10, firstGuess: 5, drawerPerGuesser: 3, finishGame: 5, dailyBonus: 20 });

  const A = accountIdOf("unit-a"), B = accountIdOf("unit-b");
  const day1 = new Date("2026-03-10T05:00:00Z"); // 12:00 เวลาไทย
  check("guest (accountId null) ไม่ได้ coin", [w.award(null, "guessCorrect", day1), w.get(null, day1)], [null, null]);
  check("accountId ผิดรูปแบบไม่ได้ coin", [w.award("abc", "guessCorrect", day1), w.award({ a: 1 }, "guessCorrect", day1), w.award(A.toUpperCase(), "guessCorrect", day1)], [null, null, null]);
  check("เหตุผลที่ไม่รู้จัก/จำนวนที่ client คิดเองไม่มีผล", [w.award(A, "bonus9999", day1), w.award(A, 9999, day1), w.award(A, ["__proto__", "constructor"], day1), w.award(A, { reason: "guessCorrect", amount: 9999 }, day1)], [null, null, null, null]);
  check("บัญชีใหม่เริ่มที่ 0", w.get(A, day1), { coins: 0, earnedToday: 0, dailyCap: 300, dailyBonusClaimed: false });
  check("ทายถูก + คนแรก = 15 ในครั้งเดียว", w.award(A, ["guessCorrect", "firstGuess"], day1), { coins: 15, earnedToday: 15, dailyCap: 300, dailyBonusClaimed: false, gains: [G("guessCorrect", 10), G("firstGuess", 5)] });
  check("คนวาดได้ +3", w.award(A, "drawerPerGuesser", day1).gains, [G("drawerPerGuesser", 3)]);
  check("จบเกมแรกของวัน: +5 และโบนัส +20", w.award(A, ["finishGame", "dailyBonus"], day1), { coins: 43, earnedToday: 23, dailyCap: 300, dailyBonusClaimed: true, gains: [G("finishGame", 5), G("dailyBonus", 20)] });
  check("โบนัสรายวันได้วันละครั้ง", w.award(A, ["finishGame", "dailyBonus"], day1).gains, [G("finishGame", 5)]);
  check("โบนัสรายวันไม่นับเข้าเพดาน (earnedToday = 28 จากยอด 48)", w.get(A, day1), { coins: 48, earnedToday: 28, dailyCap: 300, dailyBonusClaimed: true });

  // เพดานต่อวัน
  let last = null;
  for (let i = 0; i < 27; i++) last = w.award(A, "guessCorrect", day1); // 28 + 270 = 298
  check("ใกล้เพดาน: earnedToday 298", last.earnedToday, 298);
  check("เหลือ 2 ก่อนถึงเพดาน: ได้แค่เท่าที่เหลือ", w.award(A, ["guessCorrect", "firstGuess"], day1), { coins: 320, earnedToday: 300, dailyCap: 300, dailyBonusClaimed: true, gains: [G("guessCorrect", 2)] });
  check("ถึงเพดานแล้ว: ไม่ได้อีกเลยทุกเหตุผล", [w.award(A, "guessCorrect", day1), w.award(A, ["drawerPerGuesser", "finishGame", "firstGuess"], day1), w.get(A, day1).coins], [null, null, 320]);
  check("เพดานเป็นของแต่ละบัญชี (อีกบัญชียังได้ปกติ)", w.award(B, "guessCorrect", day1).coins, 10);
  const late = new Date("2026-03-10T16:59:00Z"); // 23:59 เวลาไทย วันเดียวกัน
  const next = new Date("2026-03-10T17:01:00Z"); // 00:01 เวลาไทย วันถัดไป
  check("23:59 เวลาไทยยังเป็นวันเดิม (ยังติดเพดาน)", w.award(A, "guessCorrect", late), null);
  check("ข้ามเที่ยงคืนเวลาไทย: เพดานและโบนัสรายวันเริ่มใหม่ ยอดสะสมไม่หาย", w.award(A, ["guessCorrect", "dailyBonus"], next), { coins: 350, earnedToday: 10, dailyCap: 300, dailyBonusClaimed: true, gains: [G("guessCorrect", 10), G("dailyBonus", 20)] });

  // ไฟล์
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  check("เขียนลงไฟล์ (คีย์ = accountId ไม่มีอีเมล/ชื่อ)", [Object.keys(saved).sort(), saved[A].coins, JSON.stringify(saved).includes("@")], [[A, B].sort(), 350, false]);
  checkOk("ไม่มีไฟล์ .tmp ค้าง", !fs.readdirSync(TMP).some((f) => f.endsWith(".tmp")));
  w = freshWallet({ WALLET_FILE: file });
  await quietInit(w);
  check("\"รีสตาร์ท\" (โหลดใหม่จากไฟล์) ยอดยังอยู่", [w.get(A, next).coins, w.get(B, next).coins], [350, 10]);
  fs.writeFileSync(file, "{ พังครึ่งไฟล์");
  w = freshWallet({ WALLET_FILE: file });
  await quietInit(w);
  check("ไฟล์เสีย → เริ่มจากว่าง ไม่ล่ม", w.get(A, next).coins, 0);
  fs.writeFileSync(file, JSON.stringify({ [A]: { coins: -5, earnedToday: "x", day: 7 }, "not-an-account": { coins: 999 }, [B]: { coins: 7, day: "2026-03-11", earnedToday: 7, bonusDay: "" } }));
  w = freshWallet({ WALLET_FILE: file });
  await quietInit(w);
  check("ค่าเพี้ยนในไฟล์ถูกล้างเป็น 0 · คีย์ที่ไม่ใช่ accountId ถูกทิ้ง", [w.get(A, next).coins, w.get(B, next).coins, w.get("not-an-account", next)], [0, 7, null]);

  // Upstash ปลอม (http server ในเครื่อง)
  const store = new Map();
  let failWrites = 0, sets = 0, lastAuth = "";
  const stub = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastAuth = req.headers.authorization || "";
      const cmd = JSON.parse(body || "[]");
      res.setHeader("content-type", "application/json");
      if (lastAuth !== "Bearer stub-token") { res.statusCode = 401; return res.end(JSON.stringify({ error: "WRONGPASS" })); }
      if (cmd[0] === "GET") return res.end(JSON.stringify({ result: store.get(cmd[1]) ?? null }));
      if (cmd[0] === "SET") {
        if (failWrites > 0) { failWrites--; res.statusCode = 500; return res.end(JSON.stringify({ error: "ERR down" })); }
        sets++; store.set(cmd[1], cmd[2]);
        return res.end(JSON.stringify({ result: "OK" }));
      }
      res.end(JSON.stringify({ result: null }));
    });
  });
  await new Promise((r) => stub.listen(Number(STUB_PORT), r));
  try {
    const up = { UPSTASH_REDIS_REST_URL: `http://localhost:${STUB_PORT}`, UPSTASH_REDIS_REST_TOKEN: "stub-token", WALLET_FILE: path.join(TMP, "unused.json") };
    w = freshWallet(up);
    const log = await quietInit(w);
    checkOk("โหมด Upstash: บอกตอนสตาร์ท และไม่พิมพ์ token", log.includes("Upstash") && !log.includes("stub-token") && !log.includes("เก็บในไฟล์"), log);
    w.award(A, "guessCorrect", day1);
    await w.flush();
    check("เขียนลง Upstash คีย์ jdi:wallets:v1 (แยกจากคะแนน jdi:scores:v1)", [[...store.keys()], JSON.parse(store.get("jdi:wallets:v1"))[A].coins], [["jdi:wallets:v1"], 10]);
    checkOk("ไม่เขียนไฟล์ในโหมด Upstash", !fs.existsSync(up.WALLET_FILE));
    w = freshWallet(up);
    await quietInit(w);
    check("\"รีสตาร์ท\" แล้วยอดกลับมาจาก Upstash", w.get(A, day1).coins, 10);
    failWrites = 1;
    const ow = console.warn; console.warn = () => {};
    try {
      check("เขียนล้ม: ยอดในหน่วยความจำยังถูก", w.award(A, "guessCorrect", day1).coins, 20);
      await sleep(150);
      await w.flush(); // เขียนซ้ำทันที (ไม่ต้องรอรอบลองใหม่ 5 วิ)
    } finally { console.warn = ow; }
    check("เขียนล้มแล้วลองใหม่สำเร็จ", JSON.parse(store.get("jdi:wallets:v1"))[A].coins, 20);
    store.set("jdi:wallets:v1", "[1,2,3]");
    w = freshWallet({ ...up, WALLET_FILE: path.join(TMP, "fallback.json") });
    const bad = await quietInit(w);
    checkOk("ข้อมูลใน Upstash เสีย → ถอยไปใช้ไฟล์พร้อมคำเตือน ไม่ล่ม ไม่เขียนทับของใน Upstash", bad.includes("ใช้ไฟล์แทน") && bad.includes("เก็บในไฟล์") && w.award(A, "guessCorrect", day1).coins === 10 && store.get("jdi:wallets:v1") === "[1,2,3]", bad);
    w = freshWallet({ ...up, UPSTASH_REDIS_REST_TOKEN: "wrong-token", WALLET_FILE: path.join(TMP, "fallback2.json") });
    const wrong = await quietInit(w);
    checkOk("token ผิด → ใช้ไฟล์แทน และไม่พิมพ์ token ลง log", wrong.includes("ใช้ไฟล์แทน") && !wrong.includes("wrong-token"), wrong);
  } finally {
    await new Promise((r) => stub.close(r));
    process.env.UPSTASH_REDIS_REST_URL = ""; process.env.UPSTASH_REDIS_REST_TOKEN = "";
  }
}

// ───────────────────────── ส่วน 2: server จริง ─────────────────────────
const sockets = [];
function connect({ sub = null, key = null, auth = {} } = {}) {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ["websocket"], forceNew: true, extraHeaders: sub ? { cookie: cookieOf(sub) } : {}, auth: { ...(key ? { playerKey: key } : {}), ...auth } });
    const ev = [];
    s.onAny((name, data) => ev.push({ name, data }));
    const P = {
      s, ev, sub, id: null,
      mark: () => ev.length,
      list: (name, from = 0) => ev.slice(from).filter((e) => e.name === name).map((e) => e.data),
      async wait(name, pred = () => true, ms = 6000, from = 0) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          const hit = ev.slice(from).find((e) => e.name === name && pred(e.data));
          if (hit) return hit.data;
          await sleep(25);
        }
        throw new Error(`ไม่ได้รับ ${name} ภายใน ${ms} ms`);
      },
    };
    const t = setTimeout(() => reject(new Error("ต่อ server ไม่ติด")), 8000);
    s.on("connect", () => { clearTimeout(t); sockets.push(s); resolve(P); });
    s.on("connect_error", (e) => { clearTimeout(t); reject(e); });
  });
}
const ack = (P, event, data, ms = 4000) => new Promise((resolve) => { const t = setTimeout(() => resolve(null), ms); P.s.emit(event, data, (r) => { clearTimeout(t); resolve(r); }); });
const walletOf = async (sub) => { const r = await fetch(`${URL}/api/wallet`, { headers: sub ? { cookie: cookieOf(sub) } : {} }); return [r.status, await r.json().catch(() => null)]; };
const gainsOf = (P, from = 0) => P.list("wallet_update", from).map((u) => u.gains);

async function makeRoom(players, settings, joinExtra = {}) {
  const made = await ack(players[0], "create_room", { name: "P0", avatar: 0, rounds: 1, drawTime: 30, challenges: ["none"], ...settings });
  players[0].id = made.playerId;
  for (let i = 1; i < players.length; i++) {
    const r = await ack(players[i], "join_room", { code: made.code, name: `P${i}`, avatar: i % 6, ...joinExtra });
    players[i].id = r.playerId;
    players[i].s.emit("set_ready", { ready: true });
  }
  await sleep(250);
  return made.code;
}

// เล่นหนึ่งตาของโหมดแข่งเดี่ยว: หาคนวาด (คนที่ได้ choose_word) เลือกคำ แล้วให้ order(drawer) ทายตามลำดับ · คืน { drawer, marks }
async function classicTurn(players, order, from) {
  let drawer = null, options = null;
  for (let i = 0; i < 400 && !drawer; i++) {
    for (const P of players) { const c = P.list("choose_word", from.get(P))[0]; if (c) { drawer = P; options = c.options; } }
    if (!drawer) await sleep(25);
  }
  if (!drawer) throw new Error("ไม่มีใครได้ choose_word");
  const marks = new Map(players.map((P) => [P, P.mark()]));
  drawer.s.emit("word_chosen", { word: options[0] });
  await Promise.all(players.map((P) => P.wait("round_start", () => true, 6000, from.get(P))));
  for (const P of order(drawer)) { P.s.emit("guess", { text: options[0] }); await sleep(200); }
  await players[0].wait("round_end", () => true, 6000, marks.get(players[0]));
  return { drawer, marks };
}

async function socketTests() {
  console.log("\n── ส่วน 2: server จริง ──");
  const walletFile = path.join(TMP, "server-wallets.json");
  const w = require("../wallet");
  const today = w.dayOf(new Date());
  const CAP = accountIdOf("cap-user");
  fs.writeFileSync(walletFile, JSON.stringify({ [CAP]: { coins: 1000, day: today, earnedToday: 295, bonusDay: "" } }));
  const words = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, "data", "ai-words.json"), "utf8"));
  const oneWord = words.easy[0];
  const drawingsFile = path.join(TMP, "one-drawing.json");
  fs.writeFileSync(drawingsFile, JSON.stringify({ [oneWord.en]: [[[0.2, 0.2, 0.8, 0.8], [0.2, 0.8, 0.8, 0.2]]] }));

  const log = [];
  const srv = spawn(process.execPath, ["index.js"], {
    cwd: SERVER_DIR, stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env, PORT, SCORES_FILE: path.join(TMP, "scores.json"), WALLET_FILE: walletFile,
      FIREBASE_API_KEY: "test-not-a-real-key", AUTH_SESSION_SECRET: TEST_SECRET, // ทำให้ระบบ session เปิดใช้ โดยไม่มีการเรียก Firebase จริง (เทสเซ็น cookie เอง)
      UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", ANTHROPIC_API_KEY: "", AI_MODE: "mock",
      AI_DRAWINGS_FILE: drawingsFile, MPAI_TIME_OVERRIDE: "2", MPAI_GALLERY_MS: "200", MPAI_REST_MS: "200", MPAI_OFFLINE_WAIT_MS: "60000",
      CHALLENGE_INTRO_MS: "0", LOBBY_RETURN_MS: "60000", REJOIN_GRACE_MS: "60000",
    },
  });
  srv.stdout.on("data", (d) => log.push(String(d)));
  srv.stderr.on("data", (d) => log.push(String(d)));
  try {
    let up = false;
    for (let i = 0; i < 100 && !up; i++) { up = await fetch(`${URL}/healthz`).then((r) => r.ok).catch(() => false); if (!up) await sleep(150); }
    checkOk("server เปิดได้", up);
    await sleep(200);
    checkOk("บรรทัดสตาร์ทเตือนว่า coin เก็บในไฟล์ (ไม่มี Upstash) และจะหายเมื่อรีสตาร์ทบนดิสก์ไม่ถาวร", log.join("").includes("Coin: เก็บในไฟล์") && log.join("").includes("Render"));

    // ── GET /api/wallet ──
    check("guest เรียก /api/wallet → 401", await walletOf(null), [401, { error: "LOGIN_REQUIRED" }]);
    const forged = `${authSession.SESSION_COOKIE}=${authSession.signSession({ sub: "alice", email: "a@example.com", name: "a" }, "another-secret-that-is-not-the-servers-0123")}`;
    check("cookie ที่เซ็นด้วย secret อื่น → 401", (await fetch(`${URL}/api/wallet`, { headers: { cookie: forged } })).status, 401);
    check("ล็อกอินแล้ว บัญชีใหม่ = 0", await walletOf("alice"), [200, { coins: 0, earnedToday: 0, dailyCap: 300, dailyBonusClaimed: false }]);
    checkOk("ห้าม cache คำตอบ", (await fetch(`${URL}/api/wallet`, { headers: { cookie: cookieOf("alice") } })).headers.get("cache-control") === "no-store");

    // ══ ห้องแข่งเดี่ยว: alice + bob (ล็อกอิน) + guest (พยายามสวม accountId ของ alice) ══
    const A = await connect({ sub: "alice" }), B = await connect({ sub: "bob" });
    const Gs = await connect({ auth: { accountId: accountIdOf("alice"), sub: "alice" } });
    const room1 = [A, B, Gs];
    await makeRoom(room1, { mode: "classic" }, { accountId: accountIdOf("alice") });
    let from = new Map(room1.map((P) => [P, P.mark()]));
    A.s.emit("start_game");
    const expect = new Map([[A, []], [B, []]]);
    for (let turn = 0; turn < 3; turn++) {
      const t = await classicTurn(room1, (d) => [A, B, Gs].filter((P) => P !== d), from);
      const guessers = [A, B, Gs].filter((P) => P !== t.drawer);
      const loggedGuessers = guessers.filter((P) => P.sub);
      for (const P of [A, B]) {
        const got = gainsOf(P, t.marks.get(P));
        let want;
        if (P === t.drawer) want = loggedGuessers.map(() => [G("drawerPerGuesser", 3)]); // เฉพาะคนทายที่ล็อกอิน — guest ทายไม่ทำให้คนวาดได้
        else want = [P === guessers[0] ? [G("guessCorrect", 10), G("firstGuess", 5)] : [G("guessCorrect", 10)]];
        check(`แข่งเดี่ยว ตาที่ ${turn + 1}: ${P.sub} ${P === t.drawer ? "เป็นคนวาด ได้ +3 ต่อคนทายที่ล็อกอิน" : P === guessers[0] ? "ทายถูกคนแรก +10 +5" : "ทายถูก +10"}`, got, want);
        expect.get(P).push(...want.flat());
      }
      from = t.marks;
    }
    const endA = await A.wait("game_end", () => true, 8000);
    checkOk("เกมจบ", !!endA);
    await sleep(300);
    const lastA = A.list("wallet_update").at(-1), lastB = B.list("wallet_update").at(-1);
    check("จบเกมแรกของวัน: +5 และโบนัส +20 (ทั้งสองคนที่ล็อกอิน)", [lastA.gains, lastB.gains], [[G("finishGame", 5), G("dailyBonus", 20)], [G("finishGame", 5), G("dailyBonus", 20)]]);
    const sum = (P) => expect.get(P).reduce((n, g) => n + g.amount, 0);
    check("ยอดใน wallet_update = ผลรวมที่ได้จริง", [lastA.coins, lastA.earnedToday, lastB.coins, lastB.earnedToday], [sum(A) + 25, sum(A) + 5, sum(B) + 25, sum(B) + 5]);
    check("GET /api/wallet ตรงกับ wallet_update ล่าสุด", [(await walletOf("alice"))[1], (await walletOf("bob"))[1]],
      [{ coins: lastA.coins, earnedToday: lastA.earnedToday, dailyCap: 300, dailyBonusClaimed: true }, { coins: lastB.coins, earnedToday: lastB.earnedToday, dailyCap: 300, dailyBonusClaimed: true }]);
    check("guest เล่นจบทั้งเกม (ทายถูกทุกตา) ไม่ได้ wallet_update เลยสักครั้ง", Gs.list("wallet_update").length, 0);
    checkOk("guest ที่ส่ง accountId ของคนอื่นมาเอง (handshake/join_room) ไม่ทำให้ยอดของ alice เปลี่ยน", lastA.coins === sum(A) + 25);
    checkOk("wallet_update ของแต่ละคนถึงเจ้าของคนเดียว (จำนวนครั้งตรงกับของตัวเอง)", A.list("wallet_update").length === A.list("wallet_update").filter((u) => u.coins <= lastA.coins).length && !A.list("wallet_update").some((u) => JSON.stringify(u).includes("bob")));
    checkOk("wallet_update ไม่มี accountId/อีเมล", !JSON.stringify([...A.list("wallet_update"), ...B.list("wallet_update")]).match(/accountId|@example|[0-9a-f]{64}/));

    // ══ client โกง: ไม่มี event/API ไหนเพิ่ม coin ได้ ══
    const before = (await walletOf("alice"))[1];
    for (const P of [A, Gs]) {
      for (const name of ["wallet_update", "wallet_add", "add_coins", "award_coins", "awardCoins", "coins", "wallet"]) {
        P.s.emit(name, { coins: 999999, amount: 999999, gains: [G("guessCorrect", 999999)], reason: "dailyBonus", accountId: accountIdOf("alice") });
        P.s.emit(name, 999999, () => {});
      }
      P.s.emit("guess", { text: "อะไรก็ได้", coins: 999999, reason: "dailyBonus" });
      P.s.emit("update_profile", { name: "P0", avatar: 0, coins: 999999 }, () => {});
    }
    const hdr = { cookie: cookieOf("alice"), "content-type": "application/json" };
    const statuses = [];
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) statuses.push((await fetch(`${URL}/api/wallet`, { method, headers: hdr, body: JSON.stringify({ coins: 999999, reason: "dailyBonus" }) })).status);
    await fetch(`${URL}/api/wallet?coins=999999&add=999999&reason=dailyBonus`, { headers: hdr });
    await sleep(300);
    checkOk("POST/PUT/PATCH/DELETE /api/wallet ไม่มีให้ใช้ (ไม่ตอบ 200)", statuses.every((x) => x !== 200), JSON.stringify(statuses));
    check("client ส่ง event/คำขอปลอม 30+ แบบแล้วยอดไม่เปลี่ยน", (await walletOf("alice"))[1], before);
    checkOk("server ยังไม่ล่ม", (await fetch(`${URL}/healthz`)).ok);
    for (const P of room1) P.s.disconnect();

    // ══ เพดานต่อวันผ่านเกมจริง: cap-user เหลือ 5 ก่อนถึงเพดาน ══
    const C = await connect({ sub: "cap-user" }), D = await connect({ sub: "dave" });
    const room2 = [C, D];
    await makeRoom(room2, { mode: "classic" });
    from = new Map(room2.map((P) => [P, P.mark()]));
    C.s.emit("start_game");
    // cap-user เหลือโควตาวันนี้ 5 coin — ไม่ว่าได้วาดก่อนหรือทายก่อน ต้องได้รวมไม่เกิน 5 แล้วหยุด
    let room = 5;
    const capped = (pairs) => { const out = []; for (const [reason, amount] of pairs) { const n = Math.min(amount, room); if (n > 0) { out.push(G(reason, n)); room -= n; } } return out.length ? [out] : []; };
    for (let turn = 0; turn < 2; turn++) {
      const t = await classicTurn(room2, (d) => room2.filter((P) => P !== d), from);
      const left = room;
      const want = t.drawer === C ? capped([["drawerPerGuesser", 3]]) : capped([["guessCorrect", 10], ["firstGuess", 5]]);
      check(`เพดานต่อวัน: เหลือ ${left} → ${t.drawer === C ? "เป็นคนวาด" : "ทายถูกคนแรก"} ได้แค่เท่าที่เหลือ (${JSON.stringify(want.flat().map((g) => g.amount))})`, gainsOf(C, t.marks.get(C)), want);
      from = t.marks;
    }
    check("เพดานต่อวัน: หลังสองตาโควตาหมดพอดี", room, 0);
    await C.wait("game_end", () => true, 8000);
    await sleep(300);
    check("เพดานต่อวัน: จบเกมได้แต่โบนัสรายวัน (ไม่นับเพดาน) ไม่ได้ +5", C.list("wallet_update").at(-1).gains, [G("dailyBonus", 20)]);
    check("เพดานต่อวัน: ยอดรวม 1000 + 5 + 20 และ earnedToday หยุดที่ 300", (await walletOf("cap-user"))[1], { coins: 1025, earnedToday: 300, dailyCap: 300, dailyBonusClaimed: true });
    check("คนที่ยังไม่ถึงเพดานในห้องเดียวกันได้ปกติ (3 + 15 + 5 + 20)", (await walletOf("dave"))[1].coins, 43);
    for (const P of room2) P.s.disconnect();

    // ══ บัญชีเดียวกันสองแท็บ: วาดเองทายเอง ไม่ได้ทั้งคู่ ══
    const X1 = await connect({ sub: "solo-farmer" }), X2 = await connect({ sub: "solo-farmer" });
    const room3 = [X1, X2];
    await makeRoom(room3, { mode: "classic" });
    from = new Map(room3.map((P) => [P, P.mark()]));
    X1.s.emit("start_game");
    await classicTurn(room3, (d) => room3.filter((P) => P !== d), from);
    await sleep(200);
    check("บัญชีเดียวกันสองแท็บ (วาดเองทายเอง) ไม่ได้ coin ทั้งคนวาดและคนทาย", [X1.list("wallet_update").length, X2.list("wallet_update").length, (await walletOf("solo-farmer"))[1].coins], [0, 0, 0]);
    for (const P of room3) P.s.disconnect();

    // ══ คนวาดล็อกอิน + มีแต่แท็บ guest มาทาย: คนวาดไม่ได้ coin จาก guest ══
    const H = await connect({ sub: "host-with-guests" }), g1 = await connect(), g2 = await connect();
    const room4 = [H, g1, g2];
    await makeRoom(room4, { mode: "classic" });
    from = new Map(room4.map((P) => [P, P.mark()]));
    H.s.emit("start_game");
    const t4 = await classicTurn(room4, (d) => room4.filter((P) => P !== d), from);
    await sleep(200);
    checkOk("ตาแรกคนที่ล็อกอินเป็นคนวาด", t4.drawer === H);
    check("แท็บ guest 2 แท็บทายภาพของคนที่ล็อกอินถูก: ไม่มีใครได้ coin (คนวาดไม่ได้ +3 จาก guest)", [H.list("wallet_update").length, g1.list("wallet_update").length, g2.list("wallet_update").length, (await walletOf("host-with-guests"))[1].coins], [0, 0, 0, 0]);
    for (const P of room4) P.s.disconnect();

    // ══ โหมดทีม: คนแรกของตา = คนแรกของทีมที่ทายถูกก่อน (ทั้งห้องมีคนเดียว) ══
    const T = [];
    for (let i = 0; i < 4; i++) T.push(await connect({ sub: `team-${i}` }));
    await makeRoom(T, { mode: "team" });
    const teamOf = Object.fromEntries(T[0].list("room_update").at(-1).players.map((p) => [p.id, p.team]));
    const m5 = new Map(T.map((P) => [P, P.mark()]));
    T[0].s.emit("start_game");
    let chooser = null, opts = null;
    for (let i = 0; i < 400 && !chooser; i++) { for (const P of T) { const c = P.list("choose_word", m5.get(P))[0]; if (c) { chooser = P; opts = c.options; } } if (!chooser) await sleep(25); }
    chooser.s.emit("word_chosen", { word: opts[0] });
    const rs = await Promise.all(T.map((P) => P.wait("round_start", () => true, 6000, m5.get(P))));
    const drawerIds = rs[0].drawerIds;
    const byId = Object.fromEntries(T.map((P) => [P.id, P]));
    const guesser = (team) => T.find((P) => teamOf[P.id] === team && P.id !== drawerIds[team]);
    const m6 = new Map(T.map((P) => [P, P.mark()]));
    guesser("A").s.emit("guess", { text: opts[0] }); await sleep(300);
    guesser("B").s.emit("guess", { text: opts[0] }); await sleep(400);
    check("โหมดทีม: ทีมแรกที่ทายถูก คนทาย +10 +5 · คนวาดของทีม +3", [gainsOf(guesser("A"), m6.get(guesser("A"))), gainsOf(byId[drawerIds.A], m6.get(byId[drawerIds.A]))], [[[G("guessCorrect", 10), G("firstGuess", 5)]], [[G("drawerPerGuesser", 3)]]]);
    check("โหมดทีม: ทีมที่สอง คนทาย +10 (ไม่มีโบนัสคนแรก) · คนวาดของทีม +3", [gainsOf(guesser("B"), m6.get(guesser("B"))), gainsOf(byId[drawerIds.B], m6.get(byId[drawerIds.B]))], [[[G("guessCorrect", 10)]], [[G("drawerPerGuesser", 3)]]]);
    for (const P of T) P.s.disconnect();

    // ══ Multiplayer vs AI: ได้ coin เฉพาะช่วงทาย (ไม่มีส่วนของคนวาด) ══
    const M1 = await connect({ sub: "mp-1" }), M2 = await connect({ sub: "mp-2" });
    await makeRoom([M1, M2], { mode: "mpai" });
    M1.s.emit("start_game");
    await M1.wait("mpai_draw_start", () => true, 6000);
    await M1.wait("mpai_watch_start", () => true, 15000);
    check("mpai ช่วง 1 (วาดให้ AI ทาย): ไม่มี coin", [M1.list("wallet_update").length, M2.list("wallet_update").length], [0, 0]);
    M1.s.emit("guess", { text: oneWord.word }); await sleep(300);
    M2.s.emit("guess", { text: oneWord.word }); await sleep(300);
    check("mpai ช่วงทาย: คนแรก +10 +5 · คนที่สอง +10 · ไม่มี +3 ของคนวาด", [gainsOf(M1)[0], gainsOf(M2)[0]], [[G("guessCorrect", 10), G("firstGuess", 5)], [G("guessCorrect", 10)]]);
    await M1.wait("game_end", () => true, 10000);
    await sleep(300);
    check("mpai จบเกม: +5 และโบนัสเกมแรกของวัน", [M1.list("wallet_update").at(-1).gains, (await walletOf("mp-1"))[1].coins, (await walletOf("mp-2"))[1].coins], [[G("finishGame", 5), G("dailyBonus", 20)], 40, 35]);
    M1.s.disconnect(); M2.s.disconnect();

    // ══ ห้องคนน้อยเกินไป: เหลือคนต่ออยู่คนเดียว (อีกคนหลุดอยู่ในช่วงรอกลับ) → ไม่ได้ coin ══
    const L1 = await connect({ sub: "lonely-1", key: "wallet-lonely-key-000001" }), L2 = await connect({ sub: "lonely-2", key: "wallet-lonely-key-000002" });
    await makeRoom([L1, L2], { mode: "mpai" });
    L1.s.emit("start_game");
    await L1.wait("mpai_watch_start", () => true, 15000);
    L2.s.disconnect();
    await L1.wait("room_update", (r) => r.players.some((p) => p.connected === false), 5000);
    L1.s.emit("guess", { text: oneWord.word });
    await sleep(500);
    check(`ห้องที่เหลือคนต่ออยู่ ${RULES.minPlayers - 1} คน (ต่ำกว่า minPlayers ${RULES.minPlayers}): ทายถูกก็ไม่ได้ coin`, [L1.list("wallet_update").length, (await walletOf("lonely-1"))[1].coins], [0, 0]);
    checkOk("แต่คะแนนในเกมยังได้ตามปกติ (แค่ไม่ได้ coin)", L1.list("mpai_correct").length === 1);
    L1.s.disconnect();

    // ══ ยอดถูกเขียนลงที่เก็บ และ log ไม่มีของลับ ══
    await sleep(200);
    const stored = JSON.parse(fs.readFileSync(walletFile, "utf8"));
    check("ยอดถูกเขียนลงไฟล์ (คีย์ = accountId)", [stored[accountIdOf("alice")].coins, stored[CAP].coins], [lastA.coins, 1025]);
    const all = log.join("");
    checkOk("log ของ server ไม่มี secret/cookie/accountId", !all.includes(TEST_SECRET) && !all.includes(accountIdOf("alice")) && !all.includes("jdi_session="));
  } finally {
    for (const s of sockets) s.disconnect();
    srv.kill();
    await sleep(300);
  }
}

(async () => {
  try {
    await unitTests();
    await socketTests();
  } catch (err) {
    failed++; problems.push(`พังกลางทาง: ${err.message}`);
    console.log(`❌ เทส wallet พังกลางทาง: ${err.stack}`);
  } finally {
    for (const s of sockets) s.disconnect();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
    console.log(`\nสรุป [wallet]: ผ่าน ${passed} · ไม่ผ่าน ${failed}`);
    if (failed) console.log("หัวข้อที่ไม่ผ่าน: " + problems.join(" · "));
    process.exit(failed ? 1 : 0);
  }
})();
