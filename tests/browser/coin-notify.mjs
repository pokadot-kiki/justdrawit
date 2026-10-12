// เทสเบราว์เซอร์จริง (Chrome headless ผ่าน CDP · --mute-audio): แจ้งเตือนตอนได้ coin + สรุป coin ท้ายเกม
// เล่นเกมแข่งเดี่ยวจริง 3 คน: สองบัญชีที่ล็อกอิน (cookie ที่เซ็นด้วย secret ปลอมของเทส) + guest หนึ่งคน
// แต่ละคนอยู่คนละ browser context (cookie แยกกัน) · ต้อง `cd client && npm run build` ก่อน
// เปิด server ทดสอบเองที่พอร์ต 3014 (ไม่แตะพอร์ต 3000 · ไม่อ่านคีย์จริงจาก server/.env · กระเป๋า coin ใช้ไฟล์ชั่วคราว)
// ปิด Chrome/server และลบโปรไฟล์ชั่วคราวเสมอตอนจบ · ภาพหน้าจอเก็บในโฟลเดอร์ที่ส่งมาเป็น argv[2]
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const authSession = require(path.join(ROOT, "server/auth-session.js"));
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), "jdi-browser-shots-"));
fs.mkdirSync(OUT, { recursive: true });
const PROFILE = path.join(os.tmpdir(), "jdi-chrome-" + process.pid);
const PORT = 3014, DBG = 9349;
const BASE = `http://localhost:${PORT}`;
const SECRET = "coin-notify-test-secret-not-real-0123456789"; // ของปลอมสำหรับเทส
const CHROME = process.env.CHROME_BIN || (process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} [coin] ${n}${ok ? "" : "  " + extra}`); };

const scores = path.join(os.tmpdir(), `jdi-coin-scores-${process.pid}.json`);
const wallets = path.join(os.tmpdir(), `jdi-coin-wallets-${process.pid}.json`);
const server = spawn(process.execPath, ["index.js"], {
  cwd: path.join(ROOT, "server"), stdio: "ignore",
  env: {
    ...process.env, PORT: String(PORT), SCORES_FILE: scores, WALLET_FILE: wallets, CHALLENGE_INTRO_MS: "0", LOBBY_RETURN_MS: "120000",
    FIREBASE_API_KEY: "test-not-a-real-key", AUTH_SESSION_SECRET: SECRET,
    UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", ANTHROPIC_API_KEY: "", AI_MODE: "mock",
  },
});
const chrome = spawn(CHROME, ["--headless=new", "--mute-audio", "--disable-gpu", `--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "about:blank"], { stdio: "ignore" });

try {
  let up = false;
  for (let i = 0; i < 80 && !up; i++) { up = await fetch(`${BASE}/healthz`).then((r) => r.ok).catch(() => false); if (!up) await sleep(250); }
  if (!up) throw new Error("server ไม่ขึ้น");
  let version = null;
  for (let i = 0; i < 60 && !version; i++) { version = await fetch(`http://127.0.0.1:${DBG}/json/version`).then((r) => r.json()).catch(() => null); if (!version) await sleep(200); }

  // ต่อ CDP ระดับเบราว์เซอร์ แล้วเปิดแต่ละคนใน browser context ของตัวเอง (cookie ไม่ปนกัน)
  const ws = new WebSocket(version.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === "Runtime.exceptionThrown") errs.push(String(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 200));
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  };
  const raw = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });

  async function person(sub) {
    const { browserContextId } = (await raw("Target.createBrowserContext")).result;
    const { targetId } = (await raw("Target.createTarget", { url: "about:blank", browserContextId })).result;
    const { sessionId } = (await raw("Target.attachToTarget", { targetId, flatten: true })).result;
    const send = (method, params = {}) => raw(method, params, sessionId);
    const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
    const P = {
      sub, send, ev, targetId,
      act: () => raw("Target.activateTarget", { targetId }),
      waitFor: async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(`!!(${expr})`)) return true; await sleep(120); } return false; },
      click: (sel, text) => ev(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(sel)})];const e=${text ? `els.find(x=>x.textContent.includes(${JSON.stringify(text)}))` : "els[0]"};if(!e||e.disabled)return false;e.click();return true})()`),
      type: (sel, text) => ev(`(()=>{const i=document.querySelector(${JSON.stringify(sel)});if(!i)return false;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;s.call(i,${JSON.stringify(text)});i.dispatchEvent(new Event("input",{bubbles:true}));return true})()`),
      shot: async (name) => { await raw("Target.activateTarget", { targetId }); const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(r.result.data, "base64")); },
    };
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    if (sub) await send("Network.setCookie", { name: authSession.SESSION_COOKIE, value: authSession.signSession({ sub, email: `${sub}@example.com`, name: sub }, SECRET), url: BASE, httpOnly: true });
    await send("Page.navigate", { url: BASE + "/" });
    await P.waitFor("document.querySelector('.screen')");
    await ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.teamRulesSeen","1");localStorage.setItem("jdi.music","off");localStorage.setItem("jdi.sound","off")`);
    // เก็บข้อความ toast ทุกอันที่เคยขึ้น (toast หายเองใน 3.5 วิ จึงจดไว้ตอนมันโผล่)
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__toasts=[];new MutationObserver(()=>{const t=document.querySelector('.toast');if(t&&t!==window.__lastToast){window.__lastToast=t;window.__toasts.push((t.classList.contains('toast--coin')?'coin:':'error:')+t.textContent.trim())}}).observe(document,{childList:true,subtree:true,characterData:true})` });
    return P;
  }
  const toasts = (P) => P.ev("window.__toasts||[]");

  const A = await person("alice"), B = await person("bob"), G = await person(null);
  for (const P of [A, B, G]) { await P.send("Page.navigate", { url: BASE + "/" }); await P.waitFor("document.querySelector('#player-name')"); }
  ck("สองคนล็อกอิน (มีชิปบัญชี) · หนึ่งคนเป็น guest", (await A.ev("!!document.querySelector('.auth-chip')")) && (await B.ev("!!document.querySelector('.auth-chip')")) && !(await G.ev("!!document.querySelector('.auth-chip')")));

  // ── สร้างห้อง (1 รอบ = คนละ 1 ตา) แล้วอีกสองคนเข้าด้วยลิงก์เชิญ ──
  await A.act(); await A.click(".big-btn--green"); await A.waitFor("document.querySelector('.setup__create')");
  await A.click(".seg", "1"); // จำนวนรอบ = 1
  await A.click(".setup__create");
  await A.waitFor("document.querySelector('.lb-top__code')", 10000);
  const code = (await A.ev("document.querySelector('.lb-top__code').textContent")).replace(/\D/g, "");
  for (const P of [B, G]) {
    await P.act();
    await P.send("Page.navigate", { url: `${BASE}/?room=${code}` });
    await P.waitFor("document.querySelector('.input--code')");
    await sleep(300);
    await P.click(".modal__actions .btn--primary");
    await P.waitFor("document.querySelector('.lb-bigbtn')", 10000);
    await P.click(".lb-bigbtn"); // พร้อม
  }
  await A.act();
  ck("ทั้งสามคนอยู่ในห้องรอ", await A.waitFor("document.querySelectorAll('.lb-player').length===3"));
  await A.waitFor("!document.querySelector('.lb-bigbtn').disabled");
  // ตั้งรอบเป็น 1 ในห้องรอ (เผื่อปุ่มในหน้า SET UP ไม่ใช่ตัวเลขรอบ) แล้วเริ่ม
  await A.ev(`(()=>{const g=document.querySelector('[aria-label="จำนวนรอบ"]');g&&[...g.querySelectorAll('.seg')].find(b=>b.textContent.trim()==='1')?.click()})()`);
  await sleep(300);
  await A.click(".lb-bigbtn");

  const people = [A, B, G];
  const expectTotal = new Map([[A, 0], [B, 0]]);
  for (let turn = 0; turn < 3; turn++) {
    // หาคนวาด = คนที่เห็นหน้าต่างเลือกคำ
    let drawer = null;
    for (let i = 0; i < 200 && !drawer; i++) { for (const P of people) if (!drawer && (await P.ev("!!document.querySelector('.btn--word')"))) drawer = P; if (!drawer) await sleep(120); }
    if (!drawer) throw new Error(`ตาที่ ${turn + 1}: ไม่มีใครได้เลือกคำ`);
    await drawer.act();
    const word = await drawer.ev("document.querySelector('.btn--word').textContent.trim()");
    await drawer.click(".btn--word");
    for (const P of people) await P.waitFor("document.querySelector('.chat__input')", 8000);
    await sleep(500);
    const guessers = people.filter((P) => P !== drawer);
    const before = new Map(await Promise.all(people.map(async (P) => [P, (await toasts(P)).length])));
    for (const P of guessers) {
      await P.act();
      await P.type(".chat__input", word);
      await P.ev("document.querySelector('.chat__form').requestSubmit()");
      await sleep(700);
    }
    const fresh = async (P) => (await toasts(P)).slice(before.get(P)).filter((t) => t.startsWith("coin:"));
    const loggedGuessers = guessers.filter((P) => P.sub);
    for (const P of [A, B]) {
      const got = await fresh(P);
      if (P === drawer) {
        ck(`ตาที่ ${turn + 1}: ${P.sub} เป็นคนวาด → toast "+3 coin · มีคนทายภาพคุณถูก" ต่อคนทายที่ล็อกอิน (${loggedGuessers.length} ครั้ง)`, got.length === loggedGuessers.length && got.every((t) => t === "coin:+3 coin · มีคนทายภาพคุณถูก"), JSON.stringify(got));
        expectTotal.set(P, expectTotal.get(P) + 3 * loggedGuessers.length);
      } else {
        const first = P === guessers[0];
        const want = first ? "coin:+15 coin · ทายถูก · ทายถูกคนแรก" : "coin:+10 coin · ทายถูก";
        ck(`ตาที่ ${turn + 1}: ${P.sub} ทายถูก${first ? "คนแรก" : ""} → toast "${want.slice(5)}"`, got.length === 1 && got[0] === want, JSON.stringify(got));
        expectTotal.set(P, expectTotal.get(P) + (first ? 15 : 10));
      }
    }
    if (turn === 0) { const who = guessers.find((P) => P.sub); await who.shot("coin-toast"); }
  }

  // ── จบเกม: สรุป coin ──
  for (const P of people) await P.waitFor("document.querySelector('.modal__panel--game-over')", 15000);
  await sleep(600);
  const summary = (P) => P.ev(`(()=>{const s=document.querySelector('.game-coins');if(!s)return null;return {guest:s.classList.contains('game-coins--guest'),total:s.querySelector('.game-coins__total')?.textContent.replace(/\\s+/g,' ').trim()??null,rows:[...s.querySelectorAll('.game-coins__list li')].map(li=>li.textContent.replace(/\\s+/g,' ').trim()),note:s.querySelector('.game-coins__note')?.textContent.trim()??null,inPanel:(()=>{const p=document.querySelector('.modal__panel--game-over').getBoundingClientRect(),r=s.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right})()}})()`);
  for (const P of [A, B]) {
    const s = await summary(P);
    const want = expectTotal.get(P) + 25; // + จบเกม 5 + โบนัสเกมแรกของวัน 20
    ck(`จบเกม: ${P.sub} เห็น "เกมนี้ได้ +${want} coin" พร้อมรายการย่อย (${JSON.stringify(s?.rows)})`, s && !s.guest && s.total === `เกมนี้ได้ +${want} coin` && s.rows.includes("เล่นจนจบเกม +5") && s.rows.includes("โบนัสเกมแรกของวัน +20") && s.rows.some((r) => r.startsWith("ทายถูก +")) && s.inPanel, JSON.stringify(s));
    ck(`จบเกม: ${P.sub} ได้ toast ของตอนจบเกมด้วย`, (await toasts(P)).includes("coin:+25 coin · เล่นจนจบเกม · โบนัสเกมแรกของวัน"), JSON.stringify(await toasts(P)));
  }
  const sg = await summary(G);
  ck("จบเกม: guest เห็นข้อความชวนเข้าสู่ระบบ ไม่มีตัวเลข coin", sg && sg.guest && sg.total === null && sg.note?.includes("เข้าสู่ระบบเพื่อเก็บ coin"), JSON.stringify(sg));
  ck("guest ไม่ได้ toast coin เลยทั้งเกม", (await toasts(G)).filter((t) => t.startsWith("coin:")).length === 0, JSON.stringify(await toasts(G)));
  await A.shot("coin-game-over");
  await G.shot("coin-game-over-guest");
  ck("หน้าจบเกมไม่ล้นแนวนอน (1280px)", (await A.ev("document.documentElement.scrollWidth<=innerWidth+1")));
  await A.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  const m = await summary(A);
  ck("จอ 390px: กล่องสรุป coin อยู่ในหน้าต่างจบเกม ไม่ล้น", m?.inPanel && (await A.ev("(()=>{const p=document.querySelector('.modal__panel--game-over').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth})()")), JSON.stringify(m));
  await A.shot("coin-game-over-390");
  await A.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  // ── ยอดในกระเป๋าตรงกับที่สรุป (ตัวเลขจาก server) ──
  const api = (sub) => fetch(`${BASE}/api/wallet`, { headers: { cookie: `${authSession.SESSION_COOKIE}=${authSession.signSession({ sub, email: `${sub}@example.com`, name: sub }, SECRET)}` } }).then((r) => r.json());
  for (const P of [A, B]) ck(`ยอดที่ server ของ ${P.sub} = ผลรวมที่หน้าเว็บสรุป (${expectTotal.get(P) + 25})`, (await api(P.sub)).coins === expectTotal.get(P) + 25);
  ck("ไม่มี exception ในหน้าเว็บ", errs.length === 0, errs.join(" | "));
} catch (e) {
  fail++; console.log("❌ [coin] สคริปต์พังกลางทาง:", e.message);
} finally {
  chrome.kill();
  server.kill();
  await sleep(900);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(scores, { force: true }); fs.rmSync(wallets, { force: true }); } catch {}
  console.log(`สรุป [coin]: ผ่าน ${pass} · ไม่ผ่าน ${fail}\nภาพหน้าจอ: ${OUT}`);
  process.exit(fail ? 1 : 0);
}
