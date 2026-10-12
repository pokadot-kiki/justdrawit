/**
 * เทสโหมด Multiplayer vs AI (settings.mode === "mpai") — รันด้วย `npm test` (ต่อจาก smoke.js) หรือ `node tests/mpai.js`
 * แยกไฟล์จาก smoke.js เพราะชุดนั้นยาวจนเกือบชนเพดานเวลา 300 วิแล้ว
 * สตาร์ท server ของตัวเอง (พอร์ต MPAI_PORT ค่าเริ่มต้น 3061–3064) ย่อเวลาด้วย env ปิดเองตอนจบ ไม่แตะคะแนนจริง
 * AI ใช้ API ปลอมเฉพาะในเทส (ตอบผิด/ถูกตามโจทย์ของแต่ละส่วน) — จังหวะการทายใช้ค่าจริงของ Solo (4 วิ)
 *
 * ครอบคลุม: ช่วง 1 AI ทายเป็นระยะ (ทีละภาพ ห่างกันตามจังหวะ Solo) · คำทายถึงเจ้าของภาพคนเดียว เรียงตามเวลา ไม่ซ้ำคำที่ผิด
 * · ทายผิดวาดต่อได้ · ทายถูก = เสร็จ คะแนนตามความมั่นใจ · ทุกคนเสร็จ = แกลเลอรีทันที · หมดเวลา = ภาพล่าสุดที่ยังไม่ถูกดูได้ทายอีกครั้ง
 * · ไม่มีภาพ/คำทายของใครรั่วก่อนแกลเลอรี · ช่วง 2 แชทร่วม (ผิดเห็นทุกคนพร้อมชื่อ เรียงตามลำดับ · ถูกเห็นเป็น ****** · คนถูกแล้วคุยกันเอง)
 * · คนแรกถูกไม่จบช่วง · คำตอบไม่หลุดก่อนเฉลย · หลุด/ออกไม่ถูกรอ คะแนน/ภาพไม่หาย · rejoin · AI พัง/ช้า ไม่ค้าง
 */
const path = require("path");
const { standard: standardChallenge, types: challengeTypes } = require("../challenge-selection");
const fs = require("fs");
const os = require("os");
const http = require("http");
const { spawn } = require("child_process");
// ใช้ตัว client ที่มากับแพ็กเกจ socket.io (แบบเดียวกับ smoke.js ไม่เพิ่ม library)
const io = require(path.join(path.dirname(require.resolve("socket.io/package.json")), "client-dist", "socket.io.js"));
const ai = require("../ai");

const SERVER_DIR = path.join(__dirname, "..");
const PORT_A = process.env.MPAI_PORT || "3061";
const PORT_B = String(Number(PORT_A) + 1);
const API_PORT = String(Number(PORT_A) + 2);
const PORT_D = String(Number(PORT_A) + 3);
const TEST_API_PORT = String(Number(PORT_A) + 4);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-mpai-"));
const IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
const IMG2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAB==";
const IMG3 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAC==";
const isRendered = (image) => typeof image === "string" && image.startsWith("data:image/png;base64,") && ![IMG, IMG2, IMG3].includes(image);
function drawLine(P, y) {
  P.s.emit("draw_shape", { shape: "line", x1: 0.1, y1: y, x2: 0.8, y2: y, color: "#000000", size: 4 });
}
const GAP_MS = 4000; // SNAPSHOT_MIN_GAP_MS ของ Solo (server/index.js) — จังหวะที่ AI ดูภาพได้

let passed = 0;
let failed = 0;
const problems = [];
function checkOk(label, cond, extra = "") {
  if (cond) { passed++; console.log(`✅ ${label}`); }
  else { failed++; problems.push(label); console.log(`❌ ${label}${extra ? "  " + extra : ""}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const servers = [];
const sockets = [];
let testApi;

// คำเดียวในไฟล์ภาพ → รู้คำตอบของช่วง 2 (เทสอย่างเดียว)
const oneWord = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, "data", "ai-words.json"), "utf8")).easy[0];
const drawingsFile = path.join(TMP, "one-drawing.json");
fs.writeFileSync(drawingsFile, JSON.stringify({ [oneWord.en]: [[[0.2, 0.2, 0.8, 0.8], [0.2, 0.8, 0.8, 0.2]]] }));

function startServer(port, extraEnv) {
  const env = {
    ...process.env, PORT: port, SCORES_FILE: path.join(TMP, `scores-${port}.json`), AI_DRAWINGS_FILE: drawingsFile,
    MPAI_GALLERY_MS: "300", MPAI_REST_MS: "300", REJOIN_GRACE_MS: "1500", LOBBY_RETURN_MS: "60000", ...extraEnv,
  };
  const srv = spawn(process.execPath, ["index.js"], { cwd: SERVER_DIR, stdio: ["ignore", "pipe", "pipe"], env });
  srv.log = [];
  srv.stdout.on("data", (d) => srv.log.push(String(d)));
  srv.stderr.on("data", (d) => srv.log.push(String(d)));
  servers.push(srv);
  return srv;
}
async function waitUp(port) {
  for (let i = 0; i < 150; i++) {
    if (await fetch(`http://localhost:${port}/healthz`).then((r) => r.ok).catch(() => false)) return true;
    await sleep(100);
  }
  return false;
}

// เก็บทุก event (ไม่พลาด event ที่มาก่อน wait)
function connectAs(port, key) {
  return new Promise((resolve, reject) => {
    const s = io(`http://localhost:${port}`, { transports: ["websocket"], auth: { playerKey: key }, reconnection: false });
    const t = setTimeout(() => reject(new Error("ต่อ server ไม่ติด")), 8000);
    s.on("connect", () => {
      clearTimeout(t);
      const all = [];
      s.onAny((name, ...args) => all.push({ name, arg: args[0], at: Date.now() }));
      const P = {
        s, all,
        mark: () => all.length,
        since: (i) => all.slice(i),
        last: (name) => all.filter((e) => e.name === name).at(-1)?.arg,
        list: (name, from = 0) => all.slice(from).filter((e) => e.name === name).map((e) => e.arg),
        async wait(name, pred = () => true, ms = 6000, from = 0) {
          const t0 = Date.now();
          while (Date.now() - t0 < ms) {
            const hit = all.slice(from).find((e) => e.name === name && pred(e.arg));
            if (hit) return hit.arg;
            await sleep(15);
          }
          throw new Error(`ไม่ได้รับ ${name} ภายใน ${ms} ms`);
        },
      };
      sockets.push(s);
      resolve(P);
    });
    s.on("connect_error", (e) => { clearTimeout(t); reject(e); });
  });
}
const ack = (P, event, data, ms = 4000) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    P.s.emit(event, data, (r) => { clearTimeout(t); resolve(r); });
  });
async function makeRoom(port, keys, settings = {}) {
  const ps = [];
  for (const k of keys) ps.push(await connectAs(port, k));
  const made = await ack(ps[0], "create_room", { name: "Host", avatar: 1, mode: "mpai", rounds: 1, drawTime: 30, challenges: [standardChallenge], ...settings });
  for (let i = 1; i < ps.length; i++) await ack(ps[i], "join_room", { code: made.code, name: `P${i}`, avatar: i % 6 });
  await sleep(150);
  return { ps, code: made.code, ids: ps[0].last("room_update").players.map((p) => p.id) };
}

async function run() {
  // API จำลองสำหรับเทสเท่านั้น — เกมจริงต้องมีโมเดลหรือ key จึงจะทายได้
  let testAnswer = null;
  let wrongNumber = 0;
  testApi = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ content: [{ type: "text", text: testAnswer || `คำผิด ${++wrongNumber}` }] }));
  });
  await new Promise((r) => testApi.listen(Number(TEST_API_PORT), r));
  const testProvider = { AI_MODE: "", ANTHROPIC_API_KEY: "sk-test-not-real", AI_API_URL: `http://localhost:${TEST_API_PORT}/v1/messages`, AI_MODEL_DIR: path.join(TMP, "no-model") };
  // ═════════ ส่วน A: API ทายผิดตลอด — คำทายส่วนตัว เรียงตามเวลา วาดต่อได้ หมดเวลา → ทายภาพล่าสุดอีกครั้ง ═════════
  startServer(PORT_A, { ...testProvider, MPAI_TIME_OVERRIDE: "6" });
  checkOk("A: server เปิดได้", await waitUp(PORT_A));
  const { ps: [H, G, K], code } = await makeRoom(PORT_A, ["mp-host-0123456789abcd", "mp-gst1-0123456789abcd", "mp-gst2-0123456789abcd"]);
  const [hid, gid, kid] = H.last("room_update").players.map((p) => p.id);
  checkOk("เลือกโหมด: create_room mode=mpai เก็บไว้ที่ห้อง", H.last("room_update").settings.mode === "mpai");
  G.s.emit("update_settings", { mode: "classic" });
  await sleep(200);
  checkOk("เลือกโหมด: ลูกห้องเปลี่ยนโหมดไม่ได้", H.last("room_update").settings.mode === "mpai");

  const m0 = [H.mark(), G.mark(), K.mark()];
  H.s.emit("start_game");
  const ds = await Promise.all([H, G, K].map((P) => P.wait("mpai_draw_start")));
  checkOk("ช่วง 1: ทุกคนได้คำเดียวกัน", ds.every((d) => d.word && d.word === ds[0].word) && ds[0].time === 6);
  const word1 = ds[0].word;
  const tDraw = Date.now();

  // ── ทุกภาพช่วงนี้สร้างจาก action ที่ server รับไว้แบบส่วนตัว ──
  H.s.emit("stroke_start", { x: 0.1, y: 0.1, color: "#000000", size: 4, tool: "pen" });
  H.s.emit("stroke_points", { points: [{ x: 0.2, y: 0.2 }] });
  H.s.emit("stroke_end");
  H.s.emit("draw_shape", { shape: "line", x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, color: "#000000", size: 4 });
  // ── ภาพผิดรูปแบบถูกทิ้งเงียบ ไม่มีการทาย ──
  H.s.emit("mpai_snapshot", { image: "javascript:alert(1)" });
  H.s.emit("mpai_snapshot", { image: { a: 1 } });
  H.s.emit("mpai_snapshot", null);
  await sleep(300);
  checkOk("ภาพผิดรูปแบบไม่ถูกส่งให้ AI", H.list("mpai_ai_guess", m0[0]).length === 0);
  // ── ภาพแรก → AI ทาย (ผิด) ถึง H คนเดียว ── (จังหวะ 4 วิ นับจากภาพที่ AI ดูครั้งก่อน)
  const tFirst = Date.now();
  H.s.emit("mpai_snapshot");
  const g1 = await H.wait("mpai_ai_guess", () => true, 3000, m0[0]);
  checkOk("AI ทายภาพแรก: ได้คำทาย (ผิด) กลับมาที่เจ้าของภาพ", typeof g1.guess === "string" && g1.correct === false && !("points" in g1));
  await sleep(700);
  drawLine(H, 0.3);
  H.s.emit("mpai_snapshot"); // ยังไม่ครบจังหวะ → เก็บภาพ แต่ AI ยังไม่ดู
  await sleep(500);
  checkOk("ส่งภาพถี่กว่าจังหวะของ Solo: AI ไม่ทายซ้ำ (ยังเก็บภาพล่าสุดไว้)", H.list("mpai_ai_guess", m0[0]).length === 1);
  drawLine(K, 0.4);
  K.s.emit("mpai_snapshot");
  await K.wait("mpai_ai_guess", () => true, 3000, m0[2]);
  // ── ครบจังหวะ → AI ทายครั้งที่สอง ไม่ซ้ำคำที่ผิดแล้ว ──
  await sleep(Math.max(0, GAP_MS + 150 - (Date.now() - tFirst)));
  H.s.emit("mpai_snapshot");
  const g2nd = await H.wait("mpai_ai_guess", (g) => g !== g1, 3000, m0[0]).catch(() => null);
  const hGuesses = H.list("mpai_ai_guess", m0[0]);
  checkOk("ครบจังหวะ 4 วิ: AI ทายครั้งที่สอง (ทายผิดแล้ววาดต่อได้)", !!g2nd && hGuesses.length === 2);
  checkOk("AI ไม่ตอบคำที่ผิดไปแล้วซ้ำ", !!g2nd && g2nd.guess !== g1.guess);
  await sleep(600);
  drawLine(H, 0.6);
  H.s.emit("mpai_snapshot"); // ภาพล่าสุดที่ AI ยังไม่ได้ดู → ต้องถูกดูตอนหมดเวลา
  await sleep(200);
  K.s.disconnect(); // K หลุด (ยังอยู่ในห้องช่วงรอ 1.5 วิ) — ภาพที่ส่งแล้วต้องไม่หาย
  checkOk("ความเป็นส่วนตัว: G ไม่ได้รับคำทายของใครเลย", G.list("mpai_ai_guess", m0[1]).length === 0);
  checkOk("ความเป็นส่วนตัว: ไม่มี stroke/shape/ภาพของใครถึง G ก่อนแกลเลอรี", ["stroke_start", "stroke_points", "stroke_end", "draw_shape"].every((n) => G.list(n, m0[1]).length === 0) && !JSON.stringify(G.since(m0[1])).includes("data:image"));
  checkOk("ความเป็นส่วนตัว: คำที่ AI ทายให้ H ไม่อยู่ใน event ใดที่ G ได้รับ", !JSON.stringify(G.since(m0[1])).includes(`"${g1.guess}"`) || g1.guess === word1);
  // ── หมดเวลา → ภาพล่าสุดของ H (IMG3) ได้ทายอีกครั้ง → แกลเลอรี ──
  const evalStart = await H.wait("mpai_evaluating", () => true, 9000, m0[0]);
  const gal = await H.wait("mpai_gallery", () => true, 6000, m0[0]);
  const hAll = H.list("mpai_ai_guess", m0[0]);
  checkOk("หมดเวลา: ภาพล่าสุดที่ยังไม่ถูกดูได้ทายอีกหนึ่งครั้ง (H ครั้งที่ 3)", evalStart.total === 1 && hAll.length === 3, JSON.stringify({ evalStart, n: hAll.length }));
  const byId = Object.fromEntries(gal.results.map((r) => [r.playerId, r]));
  checkOk("แกลเลอรี: มีทั้ง 3 คน (รวม K ที่หลุด)", gal.word === word1 && gal.results.length === 3);
  checkOk("แกลเลอรี: คำทายของ AI เรียงตามเวลาครบ 3 คำ (เปิดเผยได้แล้ว)", JSON.stringify(byId[hid]?.predictions) === JSON.stringify(hAll.map((g) => g.guess)) && isRendered(byId[hid]?.image));
  checkOk("AI จำไม่ได้ → 0 คะแนน", byId[hid]?.recognized === false && byId[hid]?.points === 0 && byId[hid]?.status === "ok");
  checkOk("ภาพของ K ที่หลุดยังอยู่ในแกลเลอรี", isRendered(byId[kid]?.image) && byId[kid]?.predictions.length === 1);
  checkOk("ไม่ได้ส่งภาพ → missing", byId[gid]?.status === "missing" && byId[gid]?.image === null && byId[gid]?.points === 0);

  // ── ช่วง 2: แชทร่วม ──
  const mW = [H.mark(), G.mark()];
  const ws = await H.wait("mpai_watch_start", () => true, 3000, m0[0]);
  checkOk("ช่วง 2: มีหมวด/เวลา/เวลาคำใบ้ ไม่มีคำตอบ",
    ws.category === oneWord.category && ws.time === ds[0].time && ws.hintAt === Math.floor(ws.time / 2)
    && Number.isFinite(ws.serverNow) && !("word" in ws) && !JSON.stringify(ws).includes(oneWord.word), JSON.stringify(ws));
  G.s.emit("guess", { text: "ผิดหนึ่ง" });
  await sleep(80);
  G.s.emit("guess", { text: "ผิดสอง" });
  await sleep(400);
  const chatH = H.list("chat_message", mW[0]);
  checkOk("คำที่ทายผิดถึงทุกคนพร้อมชื่อ เรียงตามลำดับ", JSON.stringify(chatH.map((m) => `${m.name}:${m.text}`)) === JSON.stringify(["P1:ผิดหนึ่ง", "P1:ผิดสอง"]), JSON.stringify(chatH));
  const t0 = Date.now();
  await H.wait("mpai_watch_stroke", () => true, 3000, mW[0]);
  H.s.emit("guess", { text: oneWord.word });
  const notice = await H.wait("correct_guess", (m) => m.playerId === hid, 2000, mW[0]);
  const corr = await H.wait("mpai_correct", (c) => c.playerId === hid, 2000, mW[0]);
  const elapsed = (Date.now() - t0) / 1000;
  checkOk("ทายถูก: แจ้งทุกคนโดยไม่มีคำตอบ", notice.system && notice.text === "Host ทายถูก" && !!(await G.wait("correct_guess", (c) => c.playerId === hid, 2000, mW[1]).catch(() => null)));
  checkOk("ทายถูก: ไม่ส่งคำตอบผ่าน chat_message", !H.list("chat_message", mW[0]).some((m) => m.correct) && !G.list("chat_message", mW[1]).some((m) => m.correct));
  checkOk("ทายถูก: คะแนนความเร็วแบบ Solo (100–500)", corr.points >= 100 && corr.points <= 500 && Math.abs(corr.points - ai.scoreFor(ws.time - elapsed, ws.time)) <= 60, `${corr.points}`);
  await sleep(300);
  H.s.emit("guess", { text: "ข้อความหลังถูก" });
  await sleep(400);
  checkOk("คนที่ถูกแล้วคุยได้แค่กับคนที่ถูกแล้ว (G ไม่เห็น)", !JSON.stringify(G.since(mW[1])).includes("ข้อความหลังถูก") && JSON.stringify(H.since(mW[0])).includes("ข้อความหลังถูก"));
  checkOk("คนแรกถูก ไม่จบช่วง 2", !H.all.some((e) => e.name === "mpai_watch_end"));
  checkOk("คำตอบไม่หลุดถึง G ก่อนเฉลย", !JSON.stringify(G.since(mW[1])).includes(oneWord.word));
  // K หลุดเกินเวลารอแล้ว (ถูกลบออก) → เหลือ G คนเดียวที่ยังไม่ถูก → G ถูก = จบช่วงทันที
  G.s.emit("guess", { text: oneWord.word });
  const we = await H.wait("mpai_watch_end", () => true, 2000, mW[0]).catch(() => null);
  checkOk("ทุกคนที่ยังอยู่ถูก → จบช่วง 2 ทันทีและเฉลย", !!we && we.word === oneWord.word && we.results.length === 2);
  const end = await H.wait("game_end", () => true, 4000, mW[0]);
  const rk = Object.fromEntries(end.ranking.map((r) => [r.playerId, r]));
  checkOk("จบเกม: อันดับรายคน รวมคนที่ออกไปแล้ว (K) แยกคะแนนวาด/ทาย", end.ranking.length === 3 && rk[kid]?.left === true && rk[hid]?.guessPoints === corr.points && rk[hid]?.drawPoints === 0);
  checkOk("จบเกม: อันดับมีอวตารและสถานะหัวห้องจริง รวมคนที่ออกไปแล้ว", end.ranking.every((r) => Number.isInteger(r.avatar) && typeof r.isHost === "boolean") && rk[hid]?.isHost === true && rk[kid]?.avatar === 2);
  checkOk("game_end มี returnIn (ใช้ระบบกลับห้องรอเดิม)", typeof end.returnIn === "number");

  // ═════════ ส่วน B: API ตอบคำจริง — เสร็จแล้วรอ · ทุกคนเสร็จ = แกลเลอรีทันที · rejoin ═════════
  startServer(PORT_B, { ...testProvider, MPAI_TIME_OVERRIDE: "20", MPAI_OFFLINE_WAIT_MS: "1200" });
  checkOk("B: server เปิดได้", await waitUp(PORT_B));
  const KEYS = ["mpb-host-0123456789abcd", "mpb-gst1-0123456789abcd"];
  let { ps: [H2, G2] } = await makeRoom(PORT_B, KEYS, { difficulty: "easy" });
  const code2 = H2.last("room_update").code;
  const [h2, g2] = H2.last("room_update").players.map((p) => p.id);
  H2.s.emit("start_game");
  const d2 = await G2.wait("mpai_draw_start");
  testAnswer = d2.word;
  const tB = Date.now();
  drawLine(H2, 0.2);
  H2.s.emit("mpai_snapshot");
  const ok = await H2.wait("mpai_ai_guess", () => true, 3000);
  checkOk("AI ทายถูก: เจ้าของภาพได้ correct + คะแนน Claude (0.75 → 400)", ok.correct === true && ok.guess === d2.word && ok.points === 400);
  const done = await G2.wait("mpai_done", () => true, 2000);
  checkOk("คนอื่นได้แค่ mpai_done {playerId} (ไม่มีคำทาย/คะแนน/ภาพ)", Object.keys(done).join() === "playerId" && done.playerId === h2 && G2.list("mpai_ai_guess").length === 0);
  await sleep(GAP_MS + 200 - Math.min(GAP_MS, Date.now() - tB));
  drawLine(H2, 0.5);
  H2.s.emit("mpai_snapshot");
  await sleep(500);
  checkOk("เสร็จแล้ว: ส่งภาพเพิ่มก็ไม่ถูกทายอีก (รอเพื่อน)", H2.list("mpai_ai_guess").length === 1);
  checkOk("คนเดียวเสร็จ ยังไม่เปิดแกลเลอรี", !H2.all.some((e) => e.name === "mpai_gallery"));
  // G2 รีเฟรชกลางช่วง 1: ได้สถานะช่วงวาด รู้ว่า H เสร็จแล้ว แต่ไม่เห็นภาพ/คำทายของ H
  G2.s.disconnect();
  await sleep(200);
  G2 = await connectAs(PORT_B, KEYS[1]);
  const rj = await ack(G2, "rejoin", { code: code2 });
  const st = await G2.wait("mpai_state");
  checkOk("รีเฟรชสั้นๆ ไม่ทำให้ช่วง 1 จบกลางคัน", !H2.all.some((e) => e.name === "mpai_gallery"));
  checkOk("rejoin กลางช่วง 1: สถานะช่วงวาด คำเดิม รู้ว่าใครเสร็จแล้ว", rj?.ok && st.phase === "draw" && st.word === d2.word && st.doneIds.includes(h2) && st.myGuesses.length === 0 && st.myPoints === null);
  checkOk("rejoin กลางช่วง 1: ไม่มีภาพ/คำทายของคนอื่นใน mpai_state", !JSON.stringify(st).includes("data:image") && !("preds" in st));
  const tG = Date.now();
  drawLine(G2, 0.4);
  G2.s.emit("mpai_snapshot");
  const gal2 = await H2.wait("mpai_gallery", () => true, 4000).catch(() => null);
  checkOk("AI ทายถูกครบทุกคน → เปิดแกลเลอรีทันที (ไม่รอหมดเวลา)", !!gal2 && Date.now() - tG < 3000);
  const r2 = Object.fromEntries((gal2?.results || []).map((r) => [r.playerId, r]));
  checkOk("แกลเลอรี: ภาพล่าสุด ชื่อ คำทาย คะแนน", isRendered(r2[h2]?.image) && r2[h2]?.name === "Host" && r2[h2]?.guess === d2.word && r2[h2]?.points === 400 && r2[g2]?.points === 400 && r2[g2]?.recognized);
  await H2.wait("mpai_watch_start", () => true, 3000);
  await H2.wait("mpai_watch_stroke", () => true, 3000);
  // H2 รีเฟรชกลางช่วง 2: ได้เส้นที่วาดแล้ว ไม่มีคำตอบ
  H2.s.disconnect();
  await sleep(200);
  const H2b = await connectAs(PORT_B, KEYS[0]);
  await ack(H2b, "rejoin", { code: code2 });
  const st2 = await H2b.wait("mpai_state");
  checkOk("rejoin กลางช่วง 2: ได้เส้นที่วาดแล้ว ไม่มีคำตอบ", st2.phase === "watch" && st2.watch.strokes.length >= 1 && !JSON.stringify(st2).includes(oneWord.word));
  G2.s.emit("leave_room");
  await sleep(200);
  checkOk("คนออกกลางเกม เกมไม่จบ (แข่งรายคน)", H2b.last("room_update").status === "playing");

  // ── คนหลุดจริง (ไม่กลับมา) ไม่ถ่วงห้อง: อีกคนเสร็จแล้ว → แกลเลอรีเปิดหลังรอสั้นๆ ไม่ต้องรอหมดเวลา 20 วิ ──
  const { ps: [H5, G5] } = await makeRoom(PORT_B, ["mpc-host-0123456789abcd", "mpc-gst1-0123456789abcd"]);
  H5.s.emit("start_game");
  const d5 = await H5.wait("mpai_draw_start");
  testAnswer = d5.word;
  drawLine(H5, 0.2);
  H5.s.emit("mpai_snapshot");
  await H5.wait("mpai_ai_guess", (g) => g.correct, 3000);
  const tOff = Date.now();
  G5.s.disconnect();
  const gal5 = await H5.wait("mpai_gallery", () => true, 6000).catch(() => null);
  checkOk("คนหลุดไม่กลับมา → ไม่ถูกรอ แกลเลอรีเปิดหลังรอสั้นๆ (ไม่รอหมดเวลา)", !!gal5 && Date.now() - tOff < 4000, `${Date.now() - tOff} ms`);

  // ═════════ ส่วน D: AI พัง (500) แล้ว AI ช้า (เกินเพดาน) → แจ้งเจ้าของภาพ ไม่ค้าง ═════════
  let calls = 0;
  const api = http.createServer((req, res) => {
    calls++;
    req.resume();
    if (calls === 1) { res.writeHead(500); res.end("{}"); } // ครั้งแรก: API พัง
    // ครั้งต่อไป: ไม่ตอบเลย (ค้าง) → ต้องโดนเพดานเวลา
  });
  await new Promise((r) => api.listen(Number(API_PORT), r));
  startServer(PORT_D, {
    AI_MODE: "", ANTHROPIC_API_KEY: "sk-test-not-real", AI_API_URL: `http://localhost:${API_PORT}/v1/messages`,
    AI_MODEL_DIR: path.join(TMP, "no-model"), MPAI_EVAL_TIMEOUT_MS: "700", MPAI_TIME_OVERRIDE: "3",
  });
  checkOk("D: server เปิดได้", await waitUp(PORT_D));
  const { ps: [H3] } = await makeRoom(PORT_D, ["mpd-host-0123456789abcd", "mpd-gst1-0123456789abcd"]);
  H3.s.emit("start_game");
  await H3.wait("mpai_draw_start");
  drawLine(H3, 0.2);
  H3.s.emit("mpai_snapshot");
  const err = await H3.wait("game_error", () => true, 3000).catch(() => null);
  checkOk("AI พัง: เจ้าของภาพได้ AI_UNAVAILABLE (แบบ Solo) และยังไม่เสร็จ", err?.code === "AI_UNAVAILABLE" && H3.list("mpai_ai_guess").length === 0);
  const gal3 = await H3.wait("mpai_gallery", () => true, 8000).catch(() => null);
  const st3 = gal3?.results.map((r) => `${r.status}:${r.points}`);
  checkOk("หมดเวลา: ภาพที่ AI ยังดูไม่สำเร็จได้ลองอีกครั้ง → ช้าเกินเพดาน = timeout 0 คะแนน · ยังได้แกลเลอรี", JSON.stringify(st3) === '["timeout:0","missing:0"]', JSON.stringify(st3));
  checkOk("หลังพังห้องเดินต่อไปช่วง 2", !!(await H3.wait("mpai_watch_start", () => true, 3000).catch(() => null)));
  checkOk("log ไม่มีกุญแจ API", !servers.at(-1).log.join("").includes("sk-test-not-real"));
  api.close();

  // ═════════ Mini Challenge: setting -> server choice -> action enforcement -> private restore ═════════
  const { ps: [EN, EN2] } = await makeRoom(PORT_B, ["mpen-host-0123456789abcd", "mpen-gst1-0123456789abcd"], { challenges: challengeTypes });
  EN.s.emit("start_game");
  const enDraw = await EN.wait("mpai_draw_start");
  checkOk("Mini Challenge: เปิดทั้งสี่แบบแล้วสุ่มหนึ่งแบบจากที่เปิดตรงกันทั้งห้อง", challengeTypes.includes(enDraw.challenge?.type) && JSON.stringify(enDraw.challenge) === JSON.stringify((await EN2.wait("mpai_draw_start")).challenge));
  EN.s.disconnect(); EN2.s.disconnect();

  const challengeKeys = ["mpch-host-0123456789abcd", "mpch-gst1-0123456789abcd"];
  let { ps: [CH, CG], code: challengeCode } = await makeRoom(PORT_B, challengeKeys, { challenges: ["shapes_only"] });
  CH.s.emit("start_game");
  const chStart = await CH.wait("mpai_draw_start");
  const cgStart = await CG.wait("mpai_draw_start");
  checkOk("Mini Challenge: ห้องเปิด Shapes Only แล้ว server เลือกให้ทั้งคู่เหมือนกัน", chStart.challenge?.type === "shapes_only" && JSON.stringify(chStart.challenge) === JSON.stringify(cgStart.challenge) && chStart.intro === true);
  testAnswer = chStart.word;
  CH.s.emit("stroke_start", { x: .1, y: .1, color: "#000000", size: 5, tool: "pen" });
  await CH.wait("mpai_intro_end", () => true, 4000);
  CH.s.emit("stroke_start", { x: .1, y: .1, color: "#000000", size: 5, tool: "pen" });
  CH.s.emit("stroke_end");
  CH.s.emit("mpai_snapshot", { image: IMG });
  await sleep(250);
  checkOk("Mini Challenge: เส้นอิสระและภาพปลอมไม่ทำให้ AI ทาย", CH.list("mpai_ai_guess").length === 0);
  drawLine(CH, .3);
  CH.s.emit("mpai_snapshot");
  await CH.wait("mpai_ai_guess", (g) => g.correct, 3000);
  CH.s.disconnect();
  CH = await connectAs(PORT_B, challengeKeys[0]);
  await ack(CH, "rejoin", { code: challengeCode });
  const chState = await CH.wait("mpai_state");
  checkOk("Mini Challenge: reconnect คืนกติกาและเฉพาะภาพของตัวเอง", chState.challenge?.type === "shapes_only" && chState.myCanvas?.items.length === 1 && !JSON.stringify(chState).includes("data:image"));
  drawLine(CG, .5);
  CG.s.emit("mpai_snapshot");
  const chGallery = await CH.wait("mpai_gallery", () => true, 4000);
  checkOk("Mini Challenge: ภาพที่ใช้ AI/Gallery สร้างจากรูปทรงที่ผ่าน server", chGallery.results.every((r) => isRendered(r.image)) && chGallery.results.length === 2);

  const { ps: [ST, SG] } = await makeRoom(PORT_B, ["mpst-host-0123456789abcd", "mpst-gst1-0123456789abcd"], { challenges: ["none"] });
  ST.s.emit("start_game");
  const standard = await ST.wait("mpai_draw_start");
  checkOk("Mini Challenge: เปิด Standard อย่างเดียวได้ตาปกติ", standard.challenge?.type === "none" && !standard.intro && SG.last("mpai_draw_start")?.challenge?.type === "none");
  ST.s.emit("stroke_start", { x: .1, y: .1, color: "#000000", size: 5, tool: "pen" });
  ST.s.emit("stroke_points", { points: [{ x: .8, y: .2 }] });
  await sleep(100);
  ST.s.disconnect();
  const STR = await connectAs(PORT_B, "mpst-host-0123456789abcd");
  await ack(STR, "rejoin", { code: ST.last("room_update").code });
  const stState = await STR.wait("mpai_state");
  checkOk("Mini Challenge: รีเฟรชกลางเส้นปิดเส้นเดิมและคืนภาพก่อนวาดต่อ", stState.challenge?.type === "none" && stState.myCanvas?.items.at(-1)?.type === "stroke_end");

  const { ps: [CF] } = await makeRoom(PORT_B, ["mpcf-host-0123456789abcd", "mpcf-gst1-0123456789abcd"], { challenges: ["colour_fix"] });
  CF.s.emit("start_game");
  const colour = await CF.wait("mpai_draw_start");
  checkOk("Mini Challenge: Colour Fix ใช้สีที่ server เลือก", colour.challenge?.type === "colour_fix" && /^#[0-9a-f]{6}$/i.test(colour.challenge.color));
  await CF.wait("mpai_intro_end", () => true, 4000);
  drawLine(CF, .2); // สีดำไม่ผ่าน ยกเว้นกรณี server เลือกดำ
  if (colour.challenge.color.toLowerCase() !== "#000000") {
    CF.s.emit("mpai_snapshot");
    await sleep(250);
    checkOk("Mini Challenge: Colour Fix ปฏิเสธสีผิด", CF.list("mpai_ai_guess").length === 0);
  }
  CF.s.emit("draw_shape", { shape: "line", x1: .1, y1: .4, x2: .8, y2: .4, color: colour.challenge.color, size: 4 });
  CF.s.emit("mpai_snapshot");
  await CF.wait("mpai_ai_guess", () => true, 3000);

  const dlKey = "mpdl-host-0123456789abcd";
  const { ps: [DL], code: dlCode } = await makeRoom(PORT_B, [dlKey, "mpdl-gst1-0123456789abcd"], { challenges: ["dont_lift_pen"] });
  DL.s.emit("start_game");
  const noLift = await DL.wait("mpai_draw_start");
  checkOk("Mini Challenge: Don't Lift Pen ถูกเลือกจากห้อง", noLift.challenge?.type === "dont_lift_pen");
  await DL.wait("mpai_intro_end", () => true, 4000);
  DL.s.emit("stroke_start", { x: .1, y: .1, color: "#000000", size: 5, tool: "pen" });
  DL.s.emit("stroke_points", { points: [{ x: .8, y: .1 }] });
  DL.s.emit("stroke_end");
  await DL.wait("mpai_pen_locked", () => true, 1000);
  DL.s.emit("stroke_start", { x: .1, y: .8, color: "#000000", size: 5, tool: "pen" });
  DL.s.emit("stroke_end");
  DL.s.emit("undo");
  DL.s.emit("mpai_snapshot");
  await DL.wait("mpai_ai_guess", () => true, 3000);
  DL.s.disconnect();
  const DLR = await connectAs(PORT_B, dlKey);
  await ack(DLR, "rejoin", { code: dlCode });
  const dlState = await DLR.wait("mpai_state");
  checkOk("Mini Challenge: ยกปากกาแล้วเส้นที่สองและ undo ถูกปฏิเสธ; reconnect ยังล็อก", dlState.penLocked === true && dlState.myCanvas?.items.length === 3);
  DLR.s.emit("clear_canvas");
  const dlClear = await DLR.wait("mpai_canvas_history");
  checkOk("Mini Challenge: Clear ล้างกระดานส่วนตัวและปลดล็อกปากกา", dlClear.items.length === 0 && dlClear.penLocked === false && dlClear.canUndo === false);
  DLR.s.emit("stroke_start", { x: .2, y: .2, color: "#000000", size: 5, tool: "pen" });
  DLR.s.emit("stroke_end");
  await DLR.wait("mpai_pen_locked", () => true, 1000);
  DLR.s.disconnect();
  const DL2 = await connectAs(PORT_B, dlKey);
  await ack(DL2, "rejoin", { code: dlCode });
  const dlRestored = await DL2.wait("mpai_state");
  checkOk("Mini Challenge: reconnect หลัง Clear คืนเฉพาะเส้นใหม่และสถานะล็อก", dlRestored.penLocked === true && dlRestored.myCanvas?.items.filter((a) => a.type === "stroke_start").length === 1);

  // ═════════ ส่วน E: ป้องกันการใช้ผิดโหมด ═════════
  const { ps: [H4] } = await makeRoom(PORT_A, ["mpe-host-0123456789abcd", "mpe-gst1-0123456789abcd"], { mode: "classic" });
  const m4 = H4.mark();
  H4.s.emit("mpai_snapshot", { image: IMG });
  await sleep(400);
  checkOk("ห้อง classic ส่ง mpai_snapshot แล้วไม่มีอะไรเกิดขึ้น", !H4.since(m4).some((e) => e.name.startsWith("mpai_")));
  H4.s.emit("update_settings", { ...H4.last("room_update").settings, mode: "mpai" });
  await sleep(200);
  checkOk("หัวห้องเปลี่ยนโหมดเป็น mpai ในห้องรอได้", H4.last("room_update").settings.mode === "mpai");
  const solo = await connectAs(PORT_A, "mpe-solo-0123456789abcd");
  await ack(solo, "create_room", { name: "Alone", avatar: 0, mode: "mpai" });
  solo.s.emit("start_game");
  const e2 = await solo.wait("game_error", () => true, 2000).catch(() => null);
  checkOk("เริ่มเกม mpai ต้องมีอย่างน้อย 2 คน (กติกาเดิมของห้อง)", e2?.code === "NOT_ENOUGH_PLAYERS");
  void code;
}

const watchdog = setTimeout(() => { console.log("❌ เทส mpai ค้างเกิน 150 วิ"); cleanup(); process.exit(1); }, 150000);
function cleanup() {
  for (const s of sockets) try { s.disconnect(); } catch {}
  for (const srv of servers) try { srv.kill(); } catch {}
  testApi?.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}
run()
  .catch((e) => { failed++; problems.push("ตัวเทสพัง"); console.log(`❌ ตัวเทสพัง: ${e.message}`); })
  .finally(() => {
    clearTimeout(watchdog);
    cleanup();
    console.log(`\nสรุป [mpai]: ผ่าน ${passed} · ไม่ผ่าน ${failed}`);
    if (failed) {
      console.log("ไม่ผ่าน: " + problems.join(" · "));
      for (const srv of servers) console.log(srv.log.join("").split("\n").slice(-8).join("\n"));
    }
    process.exit(failed ? 1 : 0);
  });
