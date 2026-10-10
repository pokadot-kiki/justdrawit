import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// เทสเบราว์เซอร์จริง (Chrome headless ผ่าน CDP · --mute-audio) — ต้อง `cd client && npm run build` ก่อน
// ตรวจหน้าจบเกม Solo: ข้อความต้องเป็น "อันดับ X ของเดือนนี้" (ไม่ใช่ "ตลอดกาล" อีกแล้ว)
// และเลขอันดับต้องคำนวณจากกระดาน solo ของเดือนปัจจุบันเท่านั้น (ไม่นับคะแนนของเดือนก่อน)
const SP = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-browser-shots-"));
const PROFILE = path.join(os.tmpdir(), "jdi-chrome-" + process.pid);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 3001, DBG = 9334;
let pass = 0, fail = 0;
const ck = (n, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} [solo-rank] ${n}${ok ? "" : "  " + extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server, chrome;
const cdpOf = async (wsUrl) => {
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") errs.push(String(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 200)); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  return { send, ev, ws, errs };
};
async function newTab(url) {
  const t = await (await fetch(`http://127.0.0.1:${DBG}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const c = await cdpOf(t.webSocketDebuggerUrl);
  c.tid = t.id;
  await c.send("Page.enable"); await c.send("Runtime.enable");
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  return c;
}
const act = (c) => fetch(`http://127.0.0.1:${DBG}/json/activate/${c.tid}`);
const waitFor = async (c, expr, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await c.ev(`!!(${expr})`)) return true; await sleep(150); } return false; };
const click = (c, sel) => c.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.scrollIntoView({block:"center"});e.click();return true})()`);

const base = `http://localhost:${PORT}`;
const now = new Date();
const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const prevMonth = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;

try {
  // เตรียมกระดาน solo: สองแถวเดือนนี้ (ต้องถูกนับ) + หนึ่งแถวเดือนก่อนคะแนนสูงลิ่ว (ต้องไม่ถูกนับ)
  execSync(
    `node -e 'const fs=require("fs");fs.writeFileSync(process.env.SCORES_FILE, JSON.stringify([` +
      `{id:1,name:"Z1",score:5000,levelReached:9,playedAt:"${curMonth}-02 10:00"},` +
      `{id:2,name:"Z2",score:10,levelReached:1,playedAt:"${curMonth}-03 10:00"},` +
      `{id:3,name:"OldChamp",score:999999,levelReached:9,playedAt:"${prevMonth}-04 10:00"}` +
      `]))'`,
    { cwd: `${ROOT}/server`, env: { ...process.env, SCORES_FILE: `${SP}/scores-sr.json` }, stdio: "inherit" }
  );
  // AI_MOCK_CHANCE=0 ไม่มีทางทายถูก · AI_TIME_OVERRIDE สั้นมาก · ปิดช่วงที่ 2 (ชี้ AI_DRAWINGS_FILE ไปที่ไม่มีจริง)
  // ⇒ แพ้ครบ 3 ชีวิตด้วยเวลาหมดล้วนๆ totalScore คงเป็น 0 เสมอ ไม่มีทางสุ่มทายถูกปนมา
  server = spawn("node", ["index.js"], {
    cwd: `${ROOT}/server`,
    env: { ...process.env, NODE_ENV: "test", JDI_TEST_AUTH_BYPASS: "1", PORT: String(PORT), SCORES_FILE: `${SP}/scores-sr.json`, AI_MODE: "mock", AI_MOCK_CHANCE: "0", AI_TIME_OVERRIDE: "2", AI_NEXT_DELAY_MS: "300", AI_DRAWINGS_FILE: `${SP}/no-such-file.json` },
    stdio: "ignore",
  });
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1500);
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {} await sleep(200); }

  const C = await newTab(`${base}/`);
  await C.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.music","0")`);
  await act(C);

  await C.send("Page.navigate", { url: `${base}/setup` }); await sleep(900);
  await click(C, ".mode-card--ai");
  await click(C, ".setup__create");
  ck("เข้าเกม Solo ได้", await waitFor(C, `document.querySelector(".board canvas")`, 10000));

  // ไม่วาดอะไรเลย ปล่อยให้เวลาหมดทั้ง 3 ชีวิต จนขึ้นหน้าจบเกม
  ck("ขึ้นหน้าจบเกม (3 ชีวิตหมดด้วยเวลา)", await waitFor(C, `document.querySelector("#solo-over-title")`, 30000));

  const final = await C.ev(`(()=>{
    const score=document.querySelector(".solo-final__score")?.textContent;
    const rankP=document.querySelector(".solo-result--ok")?.textContent || "";
    return {score,rankP};
  })()`);
  ck("คะแนนจบเกม = 0 (ไม่มีทางทายถูกได้เลยด้วยเงื่อนไขที่ตั้ง)", final.score === "0", JSON.stringify(final));
  ck('ข้อความอันดับเป็น "ของเดือนนี้" ไม่ใช่ "ตลอดกาล"', /ของเดือนนี้/.test(final.rankP) && !/ตลอดกาล/.test(final.rankP), final.rankP);
  // คาดหวังอันดับ 3: แพ้ Z1(5000) และ Z2(10) ทั้งคู่มากกว่า 0 แต่ไม่นับ OldChamp เพราะอยู่เดือนก่อน (ถ้านับจะกลายเป็นอันดับ 4)
  ck("อันดับ = 3 (นับ Z1, Z2 ของเดือนนี้ แต่ไม่นับ OldChamp ของเดือนก่อน)", /อันดับ\s*3\s*ของเดือนนี้/.test(final.rankP), final.rankP);

  ck("ไม่มี exception", C.errs.length === 0, JSON.stringify(C.errs.slice(0, 3)));
} catch (e) {
  fail++; console.log("❌ สคริปต์พัง:", e.stack?.split("\n").slice(0, 3).join(" | "));
} finally {
  try { chrome?.kill(); } catch {}
  try { server?.kill(); } catch {}
  await sleep(500);
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`); } catch {}
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.rmSync(SP, { recursive: true, force: true });
  console.log(`\nสรุป [solo-rank]: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}
