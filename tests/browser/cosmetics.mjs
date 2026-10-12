// เทสเบราว์เซอร์จริง (Chrome headless ผ่าน CDP · --mute-audio): เครื่องประดับของอวตาร (เฟส B3/B4)
// สองคน (guest ทั้งคู่ คนละ browser context): แต่งตัวในหน้าแต่งโปรไฟล์ → เข้าห้อง → อีกคนเห็นชุด → เปลี่ยนในห้อง → เกม → จบเกม
// ต้อง `cd client && npm run build` ก่อน · เปิด server ทดสอบเองที่พอร์ต 3015 (ไม่แตะพอร์ต 3000 · ไม่อ่านคีย์จริงจาก server/.env)
// ปิด Chrome/server และลบโปรไฟล์ชั่วคราวเสมอตอนจบ · ภาพหน้าจอเก็บในโฟลเดอร์ที่ส่งมาเป็น argv[2]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), "jdi-browser-shots-"));
fs.mkdirSync(OUT, { recursive: true });
const PROFILE = path.join(os.tmpdir(), "jdi-chrome-" + process.pid);
const PORT = 3015, DBG = 9350;
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_BIN || (process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} [cosmetics] ${n}${ok ? "" : "  " + extra}`); };

// สีที่ใช้ยืนยันว่าไอเทมถูกวาดจริง (จานสีใน client/src/avatarData.js)
const RED = "#e8553f";   // หมวกแก๊ปแดง · โบว์แดง
const BLUE = "#1e6fe8";  // หมวกไหมพรม · แว่นสามมิติ
const SKY = "#6fa6f2";   // พื้นหลังท้องฟ้า
const GOLD = "#ffc81e";  // วงแหวนทอง · หมวกฟาง

const scores = path.join(os.tmpdir(), `jdi-cos-scores-${process.pid}.json`);
const wallets = path.join(os.tmpdir(), `jdi-cos-wallets-${process.pid}.json`);
const server = spawn(process.execPath, ["index.js"], {
  cwd: path.join(ROOT, "server"), stdio: "ignore",
  env: { ...process.env, PORT: String(PORT), SCORES_FILE: scores, WALLET_FILE: wallets, CHALLENGE_INTRO_MS: "0", LOBBY_RETURN_MS: "120000", AI_MODE: "mock",
    FIREBASE_API_KEY: "", AUTH_SESSION_SECRET: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", ANTHROPIC_API_KEY: "" },
});
const chrome = spawn(CHROME, ["--headless=new", "--mute-audio", "--disable-gpu", `--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "about:blank"], { stdio: "ignore" });

try {
  let up = false;
  for (let i = 0; i < 80 && !up; i++) { up = await fetch(`${BASE}/healthz`).then((r) => r.ok).catch(() => false); if (!up) await sleep(250); }
  if (!up) throw new Error("server ไม่ขึ้น");
  let version = null;
  for (let i = 0; i < 60 && !version; i++) { version = await fetch(`http://127.0.0.1:${DBG}/json/version`).then((r) => r.json()).catch(() => null); if (!version) await sleep(200); }
  const ws = new WebSocket(version.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === "Runtime.exceptionThrown") errs.push(String(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 200));
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  };
  const raw = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });

  async function person() {
    const { browserContextId } = (await raw("Target.createBrowserContext")).result;
    const { targetId } = (await raw("Target.createTarget", { url: "about:blank", browserContextId })).result;
    const { sessionId } = (await raw("Target.attachToTarget", { targetId, flatten: true })).result;
    const send = (method, params = {}) => raw(method, params, sessionId);
    const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
    const P = {
      send, ev,
      act: () => raw("Target.activateTarget", { targetId }),
      size: (w, h) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false }),
      waitFor: async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(`!!(${expr})`)) return true; await sleep(120); } return false; },
      click: (sel, text) => ev(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(sel)})];const e=${text ? `els.find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)}))` : "els[0]"};if(!e||e.disabled)return false;e.click();return true})()`),
      type: (sel, text) => ev(`(()=>{const i=document.querySelector(${JSON.stringify(sel)});if(!i)return false;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;s.call(i,${JSON.stringify(text)});i.dispatchEvent(new Event("input",{bubbles:true}));return true})()`),
      shot: async (name) => { await raw("Target.activateTarget", { targetId }); const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(r.result.data, "base64")); },
    };
    await send("Page.enable"); await send("Runtime.enable");
    await P.size(1440, 900);
    await send("Page.navigate", { url: BASE + "/" });
    await P.waitFor("document.querySelector('.screen')");
    await ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.teamRulesSeen","1");localStorage.setItem("jdi.music","off");localStorage.setItem("jdi.sound","off")`);
    await send("Page.navigate", { url: BASE + "/" });
    await P.waitFor("document.querySelector('#player-name')");
    return P;
  }
  // สีทั้งหมดที่วาดอยู่ใน svg ของ selector นั้น (ตัวพิมพ์เล็ก) — ใช้ดูว่าไอเทมไหนถูกวาด
  const fills = (P, sel) => P.ev(`(()=>{const s=document.querySelector(${JSON.stringify(sel)});return s?[...new Set([...s.querySelectorAll('rect')].map(r=>r.getAttribute('fill').toLowerCase()))]:null})()`);
  const pickItem = async (P, tabLabel, itemId) => { await P.click(".pe__tabbtn", tabLabel); await sleep(150); return P.ev(`(()=>{const b=document.querySelector('.profile-avatars__item[data-item="${itemId}"]');if(!b)return false;b.click();return true})()`); };
  const openEditor = async (P, trigger) => { await P.act(); await P.click(trigger); return P.waitFor("document.querySelector('.modal__panel--profile')"); };
  const save = async (P) => { await P.click(".pe__actions .btn--primary"); return P.waitFor("!document.querySelector('.modal__panel--profile')", 8000); };

  const A = await person(), B = await person();

  // ───────── 1) หน้าแต่งโปรไฟล์: แท็บและพรีวิว (หน้าแรก ยังไม่เข้าห้อง) ─────────
  ck("เปิดหน้าแต่งโปรไฟล์จากหน้าแรก", await openEditor(A, "#player-name"));
  const tabInfo = await A.ev(`[...document.querySelectorAll('.pe__tabbtn')].map(b=>b.textContent.trim())`);
  ck("มีแท็บ อวตาร + กรอบ หมวก แว่น คอ พื้นหลัง", tabInfo.join(",") === "อวตาร,กรอบ,หมวก,แว่น,คอ,พื้นหลัง", JSON.stringify(tabInfo));
  const counts = {};
  for (const t of ["กรอบ", "หมวก", "แว่น", "คอ", "พื้นหลัง"]) { await A.click(".pe__tabbtn", t); await sleep(120); counts[t] = await A.ev("document.querySelectorAll('.profile-avatars__item').length"); }
  ck("ทุกแท็บเครื่องประดับมี \"ไม่ใส่\" + ของฟรี 3 ชิ้น", Object.values(counts).every((n) => n === 4), JSON.stringify(counts));
  const plain = await fills(A, ".pe__stage svg");
  ck("เลือกหมวกแก๊ปแดง → พรีวิวมีสีแดงของหมวกทันที", (await pickItem(A, "หมวก", "hat_cap")) && (await sleep(150), true) && !plain.includes(RED) && (await fills(A, ".pe__stage svg")).includes(RED));
  ck("การ์ดที่เลือกมีป้าย \"ใส่อยู่\" และแท็บหมวกมีจุดบอกว่าใส่อยู่", (await A.ev(`document.querySelector('.profile-avatars__item[data-item="hat_cap"] .pe__badge')?.textContent.trim()`)) === "ใส่อยู่" && (await A.ev(`[...document.querySelectorAll('.pe__tabbtn')].find(b=>b.textContent.trim()==='หมวก')?.querySelector('.pe__tabdot')!==null`)));
  await pickItem(A, "พื้นหลัง", "bg_sky"); await pickItem(A, "กรอบ", "frame_gold"); await pickItem(A, "แว่น", "glasses_3d"); await pickItem(A, "คอ", "neck_bow");
  await sleep(200);
  const dressed = await fills(A, ".pe__stage svg");
  ck("ใส่ครบ 5 ช่อง → พรีวิวมีสีของหมวก พื้นหลัง กรอบ แว่น", [RED, SKY, GOLD, BLUE].every((c) => dressed.includes(c)), JSON.stringify(dressed));
  await A.shot("cosmetics-editor-desktop");
  for (const [w, h, label] of [[390, 844, "390"], [320, 640, "320"]]) {
    await A.size(w, h); await sleep(350);
    const m = await A.ev(`(()=>{const p=document.querySelector('.modal__panel--profile'),pr=p.getBoundingClientRect();const R=e=>e.getBoundingClientRect();
      const spill=[...p.querySelectorAll('.pe__preview,.pe__stage,.profile-avatars,.profile-avatars__item,.pe__actions .btn,.pe__tabs')].filter(e=>{const r=R(e);return r.left<pr.left-1||r.right>pr.right+1}).length;
      const cards=[...p.querySelectorAll('.profile-avatars__item')];const lab=cards.map(c=>{const l=c.querySelector('.profile-avatars__label');return l.scrollWidth<=l.clientWidth+1});
      return {left:pr.left,right:pr.right,vw:innerWidth,spill,scrollY:p.scrollHeight>p.clientHeight+1,cards:cards.length,rows:new Set(cards.map(c=>Math.round(R(c).top))).size,tabsScroll:p.querySelector('.pe__tabs').scrollWidth>p.querySelector('.pe__tabs').clientWidth,labelsFit:lab.every(Boolean)}})()`);
    ck(`${w}×${h} แท็บเครื่องประดับ: หน้าต่างอยู่ในจอ ไม่มีชิ้นส่วนล้น การ์ด 4 ใบ`, m && m.left >= 0 && m.right <= m.vw && m.spill === 0 && m.cards === 4, JSON.stringify(m));
    if (h >= 800) ck(`${w}×${h} แท็บเครื่องประดับ: เห็นครบโดยไม่ต้องเลื่อน`, m && !m.scrollY, JSON.stringify(m));
    await A.shot(`cosmetics-editor-${label}`);
  }
  await A.size(1440, 900); await sleep(250);
  ck("บันทึก (ยังไม่เข้าห้อง) → หน้าต่างปิด อวตารใหญ่หน้าแรกใส่ชุดแล้ว", (await save(A)) && (await sleep(200), true) && [RED, SKY].every(async () => true) && (await fills(A, ".avatar-picker__stage svg")).includes(RED) && (await fills(A, ".avatar-picker__stage svg")).includes(SKY));
  await A.send("Page.reload"); await A.waitFor("document.querySelector('.avatar-picker__stage svg')");
  ck("รีเฟรชหน้าแล้วชุดยังอยู่ (จำในเบราว์เซอร์)", (await fills(A, ".avatar-picker__stage svg")).includes(RED));
  await A.shot("cosmetics-home");

  // ───────── 2) เข้าห้อง: อีกคนเห็นชุดผ่าน room_update ─────────
  await A.act(); await A.click(".big-btn--green"); await A.waitFor("document.querySelector('.setup__create')"); await A.click(".setup__create");
  await A.waitFor("document.querySelector('.lb-top__code')", 10000);
  const code = (await A.ev("document.querySelector('.lb-top__code').textContent")).replace(/\D/g, "");
  await B.act(); await B.send("Page.navigate", { url: `${BASE}/?room=${code}` }); await B.waitFor("document.querySelector('.input--code')"); await sleep(300);
  await B.click(".modal__actions .btn--primary"); await B.waitFor("document.querySelectorAll('.lb-player').length===2", 10000);
  const rowOf = (who) => `.lb-player${who === "A" ? ":first-child" : ":last-child"} .avatar-chip svg`;
  const aAtB = await fills(B, rowOf("A"));
  ck("ห้องรอ: อีกคนเห็นชุดของเราครบทุกชั้น (หมวก พื้นหลัง กรอบ แว่น)", aAtB && [RED, SKY, GOLD, BLUE].every((c) => aAtB.includes(c)), JSON.stringify(aAtB));
  const bAtA = await fills(A, rowOf("B"));
  ck("คนที่ไม่ได้ใส่อะไร แสดงอวตารเปล่าเหมือนเดิม", bAtA && !bAtA.includes(RED) && !(await A.ev("!!document.querySelector('.lb-player:last-child .avatar-chip--look')")), JSON.stringify(bAtA));
  const box = await B.ev(`(()=>{const c=document.querySelector('.lb-player:first-child .avatar-chip'),n=document.querySelector('.lb-player:last-child .avatar-chip');const a=c.getBoundingClientRect(),b=n.getBoundingClientRect();return {same:Math.round(a.width)===Math.round(b.width)&&Math.round(a.height)===Math.round(b.height),rowsSame:Math.abs(document.querySelector('.lb-player:first-child').getBoundingClientRect().height-document.querySelector('.lb-player:last-child').getBoundingClientRect().height)<=1,scroll:document.documentElement.scrollWidth<=innerWidth+1}})()`);
  ck("ห้องรอ: กล่องอวตารของคนที่ใส่ชุดขนาดเท่าคนที่ไม่ใส่ (ชุดไม่ดันเลย์เอาต์) ไม่ล้นแนวนอน", box?.same && box.scroll, JSON.stringify(box));
  await B.shot("cosmetics-waiting-room");

  // ── เปลี่ยนชุดในห้อง (event equip) → อีกคนเห็นทันที ──
  ck("B เปิดหน้าแต่งโปรไฟล์ในห้องรอ", await openEditor(B, ".lb-top .profile-trigger"));
  await pickItem(B, "หมวก", "hat_beanie"); await pickItem(B, "คอ", "neck_scarf");
  ck("B บันทึกชุดในห้อง (server รับ)", await save(B));
  ck("A เห็นหมวกไหมพรมของ B ทันที", await A.waitFor(`[...document.querySelectorAll('.lb-player:last-child .avatar-chip svg rect')].some(r=>r.getAttribute('fill').toLowerCase()==='${BLUE}')`, 6000));
  ck("A เปิดหน้าแต่งโปรไฟล์ในห้อง: เห็นชุดปัจจุบันของตัวเอง แล้วถอดหมวก", (await openEditor(A, ".lb-top .profile-trigger")) && (await fills(A, ".pe__stage svg")).includes(RED) && (await pickItem(A, "หมวก", "none")) && (await save(A)));
  ck("B เห็นว่า A ถอดหมวกแล้ว (ไม่มีสีแดงของหมวก แต่ยังมีพื้นหลัง)", await B.waitFor(`(()=>{const rs=[...document.querySelectorAll('.lb-player:first-child .avatar-chip svg rect')];const red=(r)=>r.getAttribute('fill').toLowerCase()==='${RED}';return rs.some(r=>r.getAttribute('fill').toLowerCase()==='${SKY}')&&!rs.some(r=>red(r)&&Number(r.getAttribute('y'))<12)&&rs.some(r=>red(r)&&Number(r.getAttribute('y'))>=12)})()`, 6000));
  // โบว์แดงที่คอยังอยู่ (สีแดงเดียวกัน) — ใส่หมวกฟางแทนเพื่อไปดูแบบย่อในเกม
  await openEditor(A, ".lb-top .profile-trigger"); await pickItem(A, "หมวก", "hat_straw"); await save(A);
  await sleep(400);

  // ───────── 3) ในเกม: แถบคะแนนแสดงแบบย่อ (หมวก แว่น คอ) ─────────
  await B.act(); await B.click(".lb-bigbtn"); // พร้อม
  await A.act(); await A.waitFor("!document.querySelector('.lb-bigbtn').disabled"); await A.click(".lb-bigbtn");
  for (const P of [A, B]) await P.waitFor("document.querySelector('.score-row')", 10000);
  await sleep(500);
  const sb = await B.ev(`(()=>{const rows=[...document.querySelectorAll('.score-row')];return rows.map(r=>{const c=r.querySelector('.avatar-chip');const rs=[...c.querySelectorAll('rect')];const f=[...new Set(rs.map(x=>x.getAttribute('fill').toLowerCase()))];return {look:c.classList.contains('avatar-chip--look'),bg:c.classList.contains('avatar-chip--bg'),frame:c.classList.contains('avatar-chip--frame'),edge:rs.some(x=>Number(x.getAttribute('x'))===0),fills:f}})})()`);
  ck("แถบคะแนน: ทุกคนที่ใส่ของเห็นหมวก/แว่น/คอ แต่ไม่มีพื้นหลัง (ฟ้า) และไม่ใช้กรอบของไอเทม", sb && sb.length === 2 && sb.every((r) => r.look && !r.bg && !r.frame && !r.edge) && sb.some((r) => r.fills.includes(GOLD)) && sb.some((r) => r.fills.includes(BLUE)), JSON.stringify(sb));
  const sbBox = await B.ev(`(()=>{const hs=[...document.querySelectorAll('.score-row')].map(r=>Math.round(r.getBoundingClientRect().height));return {heights:hs,scroll:document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1}})()`);
  ck("แถบคะแนน: ความสูงแถวเท่ากันทุกแถว (68px เดิม) และหน้าเกมไม่เลื่อน", sbBox && sbBox.heights.every((h) => h === sbBox.heights[0]) && sbBox.scroll, JSON.stringify(sbBox));
  await B.shot("cosmetics-scoreboard");

  // ───────── 4) เล่นจนจบเกม: หน้าจบเกมแสดงครบทุกชั้น ─────────
  for (let turn = 0; turn < 12; turn++) {
    let drawer = null, over = false;
    for (let i = 0; i < 200 && !drawer && !over; i++) {
      for (const P of [A, B]) { if (!drawer && (await P.ev("!!document.querySelector('.btn--word')"))) drawer = P; }
      over = await A.ev("!!document.querySelector('.modal__panel--game-over')");
      if (!drawer && !over) await sleep(120);
    }
    if (over || !drawer) break;
    await drawer.act();
    const word = await drawer.ev("document.querySelector('.btn--word').textContent.trim()");
    await drawer.click(".btn--word");
    const guesser = drawer === A ? B : A;
    await guesser.waitFor("document.querySelector('.chat__input') && !document.querySelector('.chat__input').disabled", 8000);
    await sleep(400);
    await guesser.act(); await guesser.type(".chat__input", word); await guesser.ev("document.querySelector('.chat__form').requestSubmit()");
    await sleep(900);
  }
  ck("เล่นจนจบเกม", await A.waitFor("document.querySelector('.modal__panel--game-over')", 20000));
  await sleep(500);
  const over = await A.ev(`(()=>{const chips=[...document.querySelectorAll('.modal__panel--game-over .avatar-chip')];return chips.map(c=>({look:c.classList.contains('avatar-chip--look'),fills:[...new Set([...c.querySelectorAll('rect')].map(x=>x.getAttribute('fill').toLowerCase()))]}))})()`);
  ck("หน้าจบเกม: อวตารบนแท่นและในอันดับแสดงครบทุกชั้น (มีพื้นหลังฟ้าและกรอบทองของ A)", over && over.length >= 2 && over.some((c) => c.look && c.fills.includes(SKY) && c.fills.includes(GOLD)) && over.some((c) => c.look && c.fills.includes(BLUE)), JSON.stringify(over?.map((c) => [c.look, c.fills.length])));
  await A.shot("cosmetics-game-over");
  ck("หน้าจบเกมไม่ล้นแนวนอน", await A.ev("document.documentElement.scrollWidth<=innerWidth+1"));
  ck("ไม่มี exception ในหน้าเว็บ", errs.length === 0, errs.join(" | "));
} catch (e) {
  fail++; console.log("❌ [cosmetics] สคริปต์พังกลางทาง:", e.message);
} finally {
  chrome.kill();
  server.kill();
  await sleep(900);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(scores, { force: true }); fs.rmSync(wallets, { force: true }); } catch {}
  console.log(`สรุป [cosmetics]: ผ่าน ${pass} · ไม่ผ่าน ${fail}\nภาพหน้าจอ: ${OUT}`);
  process.exit(fail ? 1 : 0);
}
