// เทสเครื่องประดับ (เฟส B3) — รัน: node tests/cosmetics.js (ต่อท้าย npm test)
// ส่วน 1: cosmetics.js ตรงๆ (รายการไอเทม · ตรวจช่อง · ล้างค่าที่แนบมา)
// ส่วน 2: server จริงผ่าน socket (ชุดติดเข้าห้อง · equip + สิทธิ์ · จำกัดความถี่ · คนอื่นเห็นผ่าน room_update)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

// เทสต้องไม่ใช้ค่าจริงจาก server/.env ของเครื่องนักพัฒนา (dotenv ไม่เขียนทับตัวแปรที่มีอยู่แล้ว)
for (const k of ["FIREBASE_API_KEY", "AUTH_SESSION_SECRET", "ANTHROPIC_API_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) process.env[k] = "";

const SERVER_DIR = path.join(__dirname, "..");
const io = require(path.join(path.dirname(require.resolve("socket.io/package.json")), "client-dist", "socket.io.js"));
const cosmetics = require("../cosmetics");
const catalog = require("../../shared/cosmetics.json");
const PORT = process.env.COSMETICS_PORT || "3078";
const URL = `http://localhost:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-cosmetics-"));

let passed = 0, failed = 0;
const problems = [];
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { passed++; console.log(`✅ ${label}`); }
  else { failed++; problems.push(label); console.log(`❌ ${label}  ได้ ${JSON.stringify(got)} คาดว่า ${JSON.stringify(want)}`); }
}
const checkOk = (label, cond, extra = "") => check(label + (cond ? "" : extra ? ` (${extra})` : ""), !!cond, true);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NONE = { frame: null, hat: null, glasses: null, neck: null, background: null };

function unitTests() {
  console.log("\n── ส่วน 1: cosmetics.js ──");
  check("มี 5 ช่อง ตามลำดับ", catalog.slots, ["frame", "hat", "glasses", "neck", "background"]);
  check("ของเริ่มต้นฟรีช่องละ 3 ชิ้น (รวม 15)", catalog.slots.map((s) => catalog.items.filter((i) => i.slot === s && i.free === true).length), [3, 3, 3, 3, 3]);
  checkOk("id ไม่ซ้ำ ทุกชิ้นมีชื่อและอยู่ในช่องที่รู้จัก", new Set(catalog.items.map((i) => i.id)).size === catalog.items.length && catalog.items.every((i) => typeof i.name === "string" && i.name && catalog.slots.includes(i.slot)));
  check("ชุดว่าง = ทุกช่องเป็น null", cosmetics.empty(), NONE);
  check("ใส่ของฟรีได้ (guest ก็ได้)", cosmetics.check("hat", "hat_cap", null), { ok: true, slot: "hat", itemId: "hat_cap" });
  check("ถอดได้ (itemId null)", cosmetics.check("hat", null), { ok: true, slot: "hat", itemId: null });
  check("ไอเทมผิดช่อง → INVALID_ITEM", cosmetics.check("glasses", "hat_cap"), { ok: false, error: "INVALID_ITEM" });
  check("id ไม่มีจริง / ช่องไม่มีจริง / ชนิดข้อมูลผิด → INVALID_ITEM",
    [cosmetics.check("hat", "hat_wizard_9999"), cosmetics.check("wings", "hat_cap"), cosmetics.check("hat", 5), cosmetics.check("hat", { id: "hat_cap" }), cosmetics.check(null, "hat_cap"), cosmetics.check("__proto__", "hat_cap"), cosmetics.check("hat", "constructor")].map((r) => r.error),
    Array(7).fill("INVALID_ITEM"));
  // ไอเทมที่ไม่ฟรี (ของขายในเฟส B2) ต้องใช้ไม่ได้จนกว่าจะมีระบบเป็นเจ้าของ — จำลองด้วยไอเทมปลอมในหน่วยความจำ
  cosmetics.ITEMS.set("hat_paid_test", { id: "hat_paid_test", slot: "hat", name: "ของขาย (เทส)", free: false });
  check("ไอเทมที่ไม่ฟรี → NOT_OWNED", cosmetics.check("hat", "hat_paid_test", "a".repeat(64)), { ok: false, error: "NOT_OWNED" });
  check("ล้างทั้งชุด: ช่องที่ผ่านเก็บไว้ ช่องที่ไม่ผ่านถอดออกเงียบๆ ช่องแปลกถูกทิ้ง",
    cosmetics.sanitize({ frame: "frame_gold", hat: "hat_paid_test", glasses: "hat_cap", neck: 42, background: "bg_sky", wings: "x", __proto__: { hat: "hat_cap" } }),
    { frame: "frame_gold", hat: null, glasses: null, neck: null, background: "bg_sky" });
  cosmetics.ITEMS.delete("hat_paid_test");
  check("ค่าที่ไม่ใช่ object → ชุดว่าง", [cosmetics.sanitize(null), cosmetics.sanitize("hat_cap"), cosmetics.sanitize([1, 2]), cosmetics.sanitize(undefined), cosmetics.sanitize(7)], Array(5).fill(NONE));
}

const sockets = [];
function connect() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ["websocket"], reconnection: false });
    const ev = [];
    s.onAny((name, data) => ev.push({ name, data }));
    const t = setTimeout(() => reject(new Error("ต่อ server ไม่ติด")), 8000);
    s.on("connect", () => { clearTimeout(t); sockets.push(s); resolve({ s, ev, last: (name) => ev.filter((e) => e.name === name).at(-1)?.data, count: (name) => ev.filter((e) => e.name === name).length }); });
    s.on("connect_error", (e) => { clearTimeout(t); reject(e); });
  });
}
const ack = (P, event, data, ms = 4000) => new Promise((resolve) => { const t = setTimeout(() => resolve(null), ms); P.s.emit(event, data, (r) => { clearTimeout(t); resolve(r); }); });
const lookOf = (P, id) => P.last("room_update").players.find((p) => p.id === id)?.cosmetics;

async function socketTests() {
  console.log("\n── ส่วน 2: server จริง ──");
  const srv = spawn(process.execPath, ["index.js"], {
    cwd: SERVER_DIR, stdio: "ignore",
    env: { ...process.env, PORT, SCORES_FILE: path.join(TMP, "scores.json"), WALLET_FILE: path.join(TMP, "wallets.json"), AI_MODE: "mock", CHALLENGE_INTRO_MS: "0" },
  });
  try {
    let up = false;
    for (let i = 0; i < 100 && !up; i++) { up = await fetch(`${URL}/healthz`).then((r) => r.ok).catch(() => false); if (!up) await sleep(150); }
    checkOk("server เปิดได้", up);

    // ── ชุดติดเข้าห้องตอน create_room / join_room (server ล้างค่าที่ไม่ผ่าน) ──
    const H = await connect(), G = await connect(), K = await connect();
    const made = await ack(H, "create_room", { name: "Host", avatar: 0, cosmetics: { hat: "hat_cap", glasses: "glasses_dark", frame: "ไม่มีจริง", neck: "hat_cap" } });
    await sleep(150);
    check("create_room: ชุดที่แนบมาถูกเก็บเฉพาะช่องที่ผ่าน (id ปลอม/ผิดช่องถูกถอด) — เข้าห้องได้ตามปกติ", [made.ok, lookOf(H, made.playerId)], [true, { ...NONE, hat: "hat_cap", glasses: "glasses_dark" }]);
    const gj = await ack(G, "join_room", { code: made.code, name: "Guest", avatar: 1, cosmetics: { background: "bg_grass", neck: "neck_bow" } });
    const kj = await ack(K, "join_room", { code: made.code, name: "Kid", avatar: 2 }); // ไม่แนบชุดมาเลย
    await sleep(200);
    check("join_room: คนที่เข้าทีหลังมีชุดของตัวเอง · ไม่แนบ = ชุดว่างครบ 5 ช่อง", [lookOf(H, gj.playerId), lookOf(H, kj.playerId)], [{ ...NONE, background: "bg_grass", neck: "neck_bow" }, NONE]);
    check("ทุกคนในห้องเห็นชุดของกันและกันเหมือนกัน (room_update)", [H, G, K].map((P) => P.last("room_update").players.map((p) => p.cosmetics)), Array(3).fill([{ ...NONE, hat: "hat_cap", glasses: "glasses_dark" }, { ...NONE, background: "bg_grass", neck: "neck_bow" }, NONE]));

    // ── equip ──
    const before = [H, G, K].map((P) => P.count("room_update"));
    check("equip ของฟรี: ตอบ ok พร้อมชุดใหม่", await ack(K, "equip", { slot: "hat", itemId: "hat_straw" }), { ok: true, cosmetics: { ...NONE, hat: "hat_straw" } });
    await sleep(200);
    check("equip แล้วทั้งห้องได้ room_update และเห็นหมวกของ K", [[H, G, K].map((P, i) => P.count("room_update") - before[i]), lookOf(H, kj.playerId), lookOf(G, kj.playerId)], [[1, 1, 1], { ...NONE, hat: "hat_straw" }, { ...NONE, hat: "hat_straw" }]);
    check("equip เปลี่ยนเฉพาะช่องนั้น ช่องอื่นคงเดิม", (await ack(G, "equip", { slot: "glasses", itemId: "glasses_3d" })).cosmetics, { ...NONE, background: "bg_grass", neck: "neck_bow", glasses: "glasses_3d" });
    check("ถอด (itemId null) ได้", (await ack(G, "equip", { slot: "neck", itemId: null })).cosmetics, { ...NONE, background: "bg_grass", glasses: "glasses_3d" });
    await sleep(150);
    const snap = JSON.stringify(H.last("room_update").players.map((p) => p.cosmetics));
    const count0 = H.count("room_update");
    check("equip ที่ไม่ผ่าน: id ปลอม · ผิดช่อง · ช่องไม่มีจริง · ชนิดผิด → INVALID_ITEM",
      [await ack(K, "equip", { slot: "hat", itemId: "hat_gold_crown" }), await ack(K, "equip", { slot: "hat", itemId: "glasses_round" }), await ack(K, "equip", { slot: "tail", itemId: "hat_cap" }), await ack(K, "equip", { slot: "hat", itemId: 123 }), await ack(K, "equip", null)].map((r) => r?.error),
      Array(5).fill("INVALID_ITEM"));
    await sleep(150);
    check("equip ที่ไม่ผ่านไม่เปลี่ยนชุดใคร และไม่ส่ง room_update", [JSON.stringify(H.last("room_update").players.map((p) => p.cosmetics)), H.count("room_update")], [snap, count0]);
    // ใส่แทนคนอื่นไม่ได้: แนบ playerId/targetId ของคนอื่นมาก็เปลี่ยนแต่ของตัวเอง
    await ack(K, "equip", { slot: "frame", itemId: "frame_stars", playerId: made.playerId, targetId: made.playerId, id: made.playerId });
    await sleep(150);
    check("แนบ playerId ของคนอื่นมากับ equip: เปลี่ยนแต่ชุดของคนส่ง ชุดของ Host ไม่เปลี่ยน", [lookOf(H, kj.playerId).frame, lookOf(H, made.playerId)], ["frame_stars", { ...NONE, hat: "hat_cap", glasses: "glasses_dark" }]);
    K.s.emit("equip", { slot: "hat", itemId: "hat_cap" }); // ไม่มี callback
    K.s.emit("equip");
    await sleep(150);
    checkOk("equip ไม่มี callback / ไม่มีข้อมูล: ไม่เกิดอะไรและ server ไม่ล่ม", lookOf(H, kj.playerId).hat === "hat_straw" && (await fetch(`${URL}/healthz`)).ok);

    // ── ไม่ได้อยู่ในห้อง ──
    const X = await connect();
    check("equip ตอนไม่ได้อยู่ในห้อง → NOT_IN_ROOM", await ack(X, "equip", { slot: "hat", itemId: "hat_cap" }), { ok: false, error: "NOT_IN_ROOM" });

    // ── จำกัดความถี่: 10 ครั้ง/10 วิ ต่อคน (H ยังไม่เคยเรียก equip) ──
    const results = [];
    for (let i = 0; i < 14; i++) results.push(await ack(H, "equip", { slot: "neck", itemId: i % 2 ? "neck_tie" : "neck_bow" }));
    check("equip รัว 14 ครั้ง: 10 ครั้งแรกผ่าน ที่เหลือ TOO_MANY_ATTEMPTS", [results.filter((r) => r.ok).length, results.slice(10).map((r) => r.error)], [10, Array(4).fill("TOO_MANY_ATTEMPTS")]);
    check("โควตาเป็นของแต่ละคน: คนอื่นยังใส่ได้", (await ack(G, "equip", { slot: "hat", itemId: "hat_beanie" })).ok, true);

    // ── ชุดอยู่กับผู้เล่นตลอดเกม และไม่กระทบข้อมูลเดิมของผู้เล่น ──
    const p0 = H.last("room_update").players[0];
    check("ผู้เล่นใน room_update มีช่องเดิมครบ + cosmetics", Object.keys(p0).sort(), ["avatar", "connected", "cosmetics", "id", "isHost", "name", "ready", "score", "team"].sort());
    G.s.emit("set_ready", { ready: true }); K.s.emit("set_ready", { ready: true });
    await sleep(200);
    H.s.emit("start_game");
    await sleep(600);
    check("เริ่มเกมแล้วชุดยังอยู่ และเปลี่ยนระหว่างเล่นได้", [H.last("room_update").status, lookOf(H, kj.playerId).hat, (await ack(K, "equip", { slot: "hat", itemId: "hat_cap" })).cosmetics.hat], ["playing", "hat_straw", "hat_cap"]);
    await sleep(150);
    check("update_profile (ชื่อ/อวตาร) ไม่ล้างชุด", [(await ack(K, "update_profile", { name: "KidNew", avatar: 4 })).ok, await sleep(150), lookOf(H, kj.playerId).hat].filter((x) => x !== undefined), [true, "hat_cap"]);
  } finally {
    for (const s of sockets) s.disconnect();
    srv.kill();
    await sleep(300);
  }
}

(async () => {
  try {
    unitTests();
    await socketTests();
  } catch (err) {
    failed++; problems.push(`พังกลางทาง: ${err.message}`);
    console.log(`❌ เทส cosmetics พังกลางทาง: ${err.stack}`);
  } finally {
    for (const s of sockets) s.disconnect();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
    console.log(`\nสรุป [cosmetics]: ผ่าน ${passed} · ไม่ผ่าน ${failed}`);
    if (failed) console.log("หัวข้อที่ไม่ผ่าน: " + problems.join(" · "));
    process.exit(failed ? 1 : 0);
  }
})();
