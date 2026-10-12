import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// เทสเบราว์เซอร์จริง (Chrome headless ผ่าน CDP · --mute-audio) — ต้อง `cd client && npm run build` ก่อน
// ตรวจว่า dropdown เดือนของ Leaderboard (หน้าแรก + หน้าเต็ม ทั้งสองแท็บ) ไม่มี "ตลอดกาล" แล้ว
// และมีแค่ ม.ค.–เดือนปัจจุบันของปีนี้ ค่าเริ่มต้น = เดือนปัจจุบัน
const SP = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-browser-shots-"));
const PROFILE = path.join(os.tmpdir(), "jdi-chrome-" + process.pid);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 3001, DBG = 9334;
let pass = 0, fail = 0;
const ck = (n, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} [leaderboard-year] ${n}${ok ? "" : "  " + extra}`); };
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
const waitFor = async (c, expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await c.ev(`!!(${expr})`)) return true; await sleep(120); } return false; };

const base = `http://localhost:${PORT}`;

const now = new Date();
const curYear = now.getFullYear();
const curMonthStr = `${curYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const expectedCount = now.getMonth() + 1; // ม.ค. ถึงเดือนปัจจุบัน

const checkSelect = async (c, sel, label) => {
  const info = await c.ev(`(()=>{const s=document.querySelector(${JSON.stringify(sel)});if(!s)return null;
    const opts=[...s.options].map(o=>({value:o.value,text:o.textContent}));
    return {opts,value:s.value};})()`);
  ck(`${label}: dropdown มีอยู่`, !!info, JSON.stringify(info));
  if (!info) return;
  const hasAllTime = info.opts.some((o) => o.value === "" || /ตลอดกาล/.test(o.text));
  ck(`${label}: ไม่มีตัวเลือก "ตลอดกาล"`, !hasAllTime, JSON.stringify(info.opts));
  ck(`${label}: จำนวนตัวเลือก = ม.ค.ถึงเดือนปัจจุบัน (${expectedCount})`, info.opts.length === expectedCount, JSON.stringify(info.opts.map((o) => o.value)));
  const yearsOk = info.opts.every((o) => o.value.startsWith(String(curYear)));
  ck(`${label}: ทุกตัวเลือกเป็นปีปัจจุบัน (${curYear})`, yearsOk, JSON.stringify(info.opts.map((o) => o.value)));
  ck(`${label}: ค่าเริ่มต้น = เดือนปัจจุบัน (${curMonthStr})`, info.value === curMonthStr, info.value);
};

try {
  server = spawn("node", ["index.js"], { cwd: `${ROOT}/server`, env: { ...process.env, NODE_ENV: "test", JDI_TEST_AUTH_BYPASS: "1", PORT: String(PORT), SCORES_FILE: `${SP}/scores-ly.json`, AI_MODE: "mock" }, stdio: "ignore" });
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1200);
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {} await sleep(200); }

  const H = await newTab(`${base}/`);
  await H.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.music","0")`);
  await act(H);

  // ── หน้าแรก: กล่อง Leaderboard ──
  await H.send("Page.navigate", { url: `${base}/` }); await sleep(1200);
  await waitFor(H, `document.querySelector(".lobby__board select")`, 8000);
  await checkSelect(H, ".lobby__board select", "หน้าแรก");
  const homeText = await H.ev(`document.querySelector(".lobby__board")?.textContent || ""`);
  ck("หน้าแรก: ไม่มีคำว่า \"ตลอดกาล\" ที่ไหนในกล่องเลย", !/ตลอดกาล/.test(homeText), homeText.slice(0, 200));

  // ── หน้า Leaderboard เต็ม: สองแท็บ ──
  await H.send("Page.navigate", { url: `${base}/leaderboard` }); await sleep(1200);
  await waitFor(H, `document.querySelector(".board-panel select")`, 8000);
  await checkSelect(H, ".board-panel select", "หน้า Leaderboard เต็ม (แท็บแรก)");
  let fullText = await H.ev(`document.querySelector(".board-panel")?.textContent || ""`);
  ck("หน้า Leaderboard เต็ม (แท็บแรก): ไม่มีคำว่า \"ตลอดกาล\"", !/ตลอดกาล/.test(fullText), fullText.slice(0, 200));

  // สลับแท็บ (เล่นกับเพื่อน <-> แข่งกับ AI)
  const tabs = await H.ev(`[...document.querySelectorAll(".board-tabs button")].map(b=>b.textContent)`);
  ck("หน้า Leaderboard เต็ม: มีสองแท็บ", Array.isArray(tabs) && tabs.length === 2, JSON.stringify(tabs));
  await H.ev(`[...document.querySelectorAll(".board-tabs button")][1]?.click()`);
  await sleep(600);
  await checkSelect(H, ".board-panel select", "หน้า Leaderboard เต็ม (แท็บสอง)");
  fullText = await H.ev(`document.querySelector(".board-panel")?.textContent || ""`);
  ck("หน้า Leaderboard เต็ม (แท็บสอง): ไม่มีคำว่า \"ตลอดกาล\"", !/ตลอดกาล/.test(fullText), fullText.slice(0, 200));

  ck("ไม่มี exception", H.errs.length === 0, JSON.stringify(H.errs.slice(0, 3)));
} catch (e) {
  fail++; console.log("❌ สคริปต์พัง:", e.stack?.split("\n").slice(0, 3).join(" | "));
} finally {
  try { chrome?.kill(); } catch {}
  try { server?.kill(); } catch {}
  await sleep(500);
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`); } catch {}
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.rmSync(SP, { recursive: true, force: true });
  console.log(`\nสรุป [leaderboard-year]: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}
