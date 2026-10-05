import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
// เทสเบราว์เซอร์จริง (Chrome headless ผ่าน CDP · --mute-audio) — ต้อง `cd client && npm run build` ก่อน
// เปิด server ทดสอบเองที่พอร์ต 3001 (ไม่แตะ server พอร์ต 3000) ปิด Chrome/server และลบโปรไฟล์ชั่วคราวเสมอตอนจบ
// ภาพหน้าจอเก็บในโฟลเดอร์ชั่วคราวของระบบ (พิมพ์ที่อยู่ตอนจบ) · ตั้ง CHROME_BIN ถ้า Chrome ไม่ได้อยู่ที่ตำแหน่งมาตรฐาน
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const SP = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-browser-shots-"));
const [W, H_] = (process.argv[2] || "390x844").split("x").map(Number);
const TAG = "setup-solo";
const PROFILE = path.join(os.tmpdir(), "jdi-chrome-" + process.pid);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 3001, DBG = 9334;
let pass = 0, fail = 0;
const ck = (n, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} [${TAG}] ${n}${ok ? "" : "  " + extra}`); };
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
  await c.send("Emulation.setDeviceMetricsOverride", { width: W, height: H_, deviceScaleFactor: 1, mobile: false });
  return c;
}
const act = (c) => fetch(`http://127.0.0.1:${DBG}/json/activate/${c.tid}`);
const shot = async (c, name) => { await act(c); const r = await c.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.writeFileSync(`${SP}/m-${TAG}-${name}.png`, Buffer.from(r.result.data, "base64")); };
const waitFor = async (c, expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await c.ev(`!!(${expr})`)) return true; await sleep(120); } return false; };
const click = (c, sel, text) => c.ev(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(sel)})];const e=${text ? `els.find(x=>x.textContent.includes(${JSON.stringify(text)}))` : "els[0]"};if(!e)return false;e.scrollIntoView({block:"center"});e.click();return true})()`);
const base = `http://localhost:${PORT}`;
const page = (c) => c.ev(`({sv:document.documentElement.scrollHeight-innerHeight,sh:document.documentElement.scrollWidth-innerWidth})`);
const panelH = (c) => c.ev(`Math.round(document.querySelector(".setup__opts").getBoundingClientRect().height)`);
const SIZES = (process.env.SIZES || "1440x900,1366x768,1024x768").split(",").map((x) => x.split("x").map(Number));
try {
  server = spawn("node", ["index.js"], { cwd: `${ROOT}/server`, env: { ...process.env, PORT: String(PORT), SCORES_FILE: `${SP}/scores-su.json`, AI_MODE: "mock" }, stdio: "ignore" });
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1500);
  const C = await newTab(`${base}/setup`);
  await C.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.music","0")`);
  await C.send("Page.navigate", { url: `${base}/setup` }); await sleep(1000);

  // ── classic (ค่าเริ่มต้น): รอบ/เวลา/ความยาก(ผสม)/ประเภทห้อง ครบ ไม่มีกล่อง Solo ──
  let txt = await C.ev(`document.querySelector(".setup__opts").innerText`);
  ck("classic: มีจำนวนรอบ/เวลาวาด/ความยากของคำ(ผสม)/ประเภทห้อง", /จำนวนรอบ/.test(txt) && /เวลาวาด/.test(txt) && /ความยากของคำ/.test(txt) && /ประเภทห้อง/.test(txt), txt.slice(0, 120));
  ck("classic: ไม่มีกล่องกติกา Solo", !document_had(txt), "");
  function document_had(t) { return /3 ชีวิต|ด่านละ \d+ วินาที/.test(t); }
  // เลือกค่าที่ไม่ใช่ default ไว้เทียบตอนสลับกลับ
  await click(C, ".setup__opts .segmented", "5"); // รอบ = 5 (ปุ่มแรกที่ข้อความ 5 ในกลุ่มใดก็ได้ — เจาะจงด้วย nth ด้านล่างแทน)
  const rows = await C.ev(`[...document.querySelectorAll(".setup__opt")].map(e=>e.querySelector(".setup__head").textContent.trim())`);
  ck("classic: ลำดับช่องถูกต้อง (รอบ/เวลา/ความยาก/ประเภทห้อง)", rows.length === 4 && /รอบ/.test(rows[0]) && /เวลา/.test(rows[1]) && /ความยาก/.test(rows[2]) && /ประเภทห้อง/.test(rows[3]), JSON.stringify(rows));
  await C.ev(`[...document.querySelectorAll(".setup__opt")][0].querySelectorAll(".seg")[4].click()`); // รอบ=5 (ตัวที่ 5 ใน [1,2,3,4,5])
  await C.ev(`[...document.querySelectorAll(".setup__opt")][1].querySelectorAll(".seg")[0].click()`); // เวลา=30
  await C.ev(`[...document.querySelectorAll(".setup__opt")][2].querySelectorAll(".seg")[2].click()`); // ความยาก index2 = "กลาง" (ผสม,ง่าย,กลาง,ยาก)
  await sleep(150);
  const before = await C.ev(`({rounds:[...document.querySelectorAll(".setup__opt")][0].querySelector(".seg--active").textContent,time:[...document.querySelectorAll(".setup__opt")][1].querySelector(".seg--active").textContent,diff:[...document.querySelectorAll(".setup__opt")][2].querySelector(".seg--active").textContent})`);
  ck("classic: ตั้งค่าที่เลือกไว้ถูกต้องก่อนสลับโหมด", before.rounds === "5" && before.time === "30" && before.diff === "กลาง", JSON.stringify(before));
  const hClassic = await panelH(C);
  const pgClassic = await page(C);

  // ── สลับไปแข่งกับ AI ──
  await click(C, ".mode-card--ai"); await sleep(200);
  txt = await C.ev(`document.querySelector(".setup__opts").innerText`);
  ck("AI: ซ่อนจำนวนรอบและเวลาวาด", !/จำนวนรอบ/.test(txt) && !/เวลาวาด/.test(txt), txt.slice(0, 160));
  ck("AI: มี 'เริ่มที่ระดับ' แทนความยากของคำ และมีบรรทัด 'คำยากขึ้นเองทุก 2 ด่าน'", /เริ่มที่ระดับ/.test(txt) && /คำยากขึ้นเองทุก 2 ด่าน/.test(txt), txt.slice(0, 200));
  ck("AI: ไม่มีประเภทห้อง", !/ประเภทห้อง/.test(txt), "");
  ck("AI: กล่องข้อมูลมีครบ 3 ชีวิต / ด่านละ 60 วินาที / ผลัดกันวาดกับ AI / คะแนนขึ้น Leaderboard", /3 ชีวิต/.test(txt) && /ด่านละ 60 วินาที/.test(txt) && /ผลัดกันวาดกับ AI/.test(txt) && /คะแนนขึ้น Leaderboard/.test(txt), txt);
  // ตัวเลขต้องตรงค่าจริงของ server (SOLO_LIVES=3, LEVEL_TIME=60) — อ่านจากซอร์สเพื่อกันข้อความเพี้ยน
  const srvLives = execSync(`grep -oE "SOLO_LIVES = [0-9]+" ${ROOT}/server/index.js`).toString().match(/\d+/)[0];
  const srvTime = execSync(`grep -oE "LEVEL_TIME = [0-9]+" ${ROOT}/server/ai.js`).toString().match(/\d+/)[0];
  ck("AI: ตัวเลขชีวิต/เวลาตรงกับค่าจริงใน server", txt.includes(`${srvLives} ชีวิต`) && txt.includes(`ด่านละ ${srvTime} วินาที`), `server lives=${srvLives} time=${srvTime}`);
  const hAI = await panelH(C);
  const pgAI = await page(C);
  ck("AI: ไม่เลื่อนหน้า", pgAI.sv <= 0 && pgAI.sh <= 0, JSON.stringify(pgAI));
  ck("AI: ความสูงการ์ดตั้งค่าไม่กระโดดมาก (เหลือ ≥ 80% ของเดิม ไม่ใช่ล้นออกมา)", hAI >= hClassic * 0.8 && hAI <= hClassic + 10, `classic=${hClassic} ai=${hAI}`);

  // ── สลับกลับ classic: ค่าที่ตั้งไว้ก่อนหน้ากลับมาครบ (รอบ/เวลา/ความยาก) ──
  await click(C, ".mode-card--classic, .mode-card", "แข่งเดี่ยว"); await sleep(200);
  const after = await C.ev(`({rounds:[...document.querySelectorAll(".setup__opt")][0].querySelector(".seg--active")?.textContent,time:[...document.querySelectorAll(".setup__opt")][1].querySelector(".seg--active")?.textContent,diff:[...document.querySelectorAll(".setup__opt")][2].querySelector(".seg--active")?.textContent})`);
  ck("สลับกลับ classic: จำรอบ/เวลา/ความยาก(ผสม→กลางที่เคยตั้ง)ได้ครบ", JSON.stringify(after) === JSON.stringify(before), JSON.stringify({ before, after }));
  const hBack = await panelH(C);
  ck("สลับกลับ classic: ความสูงการ์ดกลับมาเท่าเดิม", Math.abs(hBack - hClassic) <= 10, `${hClassic} → ${hBack}`);

  // ── โหมดทีม: มีครบรอบ/เวลา/ความยาก(มีผสม)/ประเภทห้อง เหมือนกัน ──
  await click(C, ".mode-card", "ทีม A vs B"); await sleep(200);
  txt = await C.ev(`document.querySelector(".setup__opts").innerText`);
  ck("ทีม: มีจำนวนรอบ/เวลาวาด/ความยาก/ประเภทห้องครบ เหมือน classic", /จำนวนรอบ/.test(txt) && /เวลาวาด/.test(txt) && /ความยากของคำ/.test(txt) && /ประเภทห้อง/.test(txt) && /ผสม/.test(txt), txt.slice(0, 160));
  const hTeam = await panelH(C);
  ck("ทีม: ความสูงการ์ดเท่ากับ classic", Math.abs(hTeam - hClassic) <= 10, `${hClassic} → ${hTeam}`);

  // ── สลับ classic → AI → team → classic อีกรอบ เพื่อความชัวร์ (ไม่มี exception) ──
  for (const label of [".mode-card--ai", ".mode-card", ".mode-card--ai"]) await (label === ".mode-card" ? click(C, label, "แข่งเดี่ยว") : click(C, label));
  await sleep(300);

  // ── ตรวจทุกขนาดจอว่าไม่เลื่อน ทั้งสองโหมด ──
  for (const [w, h] of SIZES) {
    await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(300);
    await C.send("Page.navigate", { url: `${base}/setup` }); await sleep(800);
    const pc = await page(C);
    ck(`classic ${w}×${h}: ไม่เลื่อนหน้า`, pc.sv <= 0 && pc.sh <= 0, JSON.stringify(pc));
    await shot(C, `classic-${w}x${h}`);
    await click(C, ".mode-card--ai"); await sleep(250);
    const pa = await page(C);
    ck(`AI ${w}×${h}: ไม่เลื่อนหน้า`, pa.sv <= 0 && pa.sh <= 0, JSON.stringify(pa));
    await shot(C, `ai-${w}x${h}`);
    await click(C, ".mode-card", "ทีม A vs B"); await sleep(250);
    const pt = await page(C);
    ck(`team ${w}×${h}: ไม่เลื่อนหน้า`, pt.sv <= 0 && pt.sh <= 0, JSON.stringify(pt));
    await shot(C, `team-${w}x${h}`);
  }
  ck("ไม่มี exception ในหน้าเว็บ", C.errs.length === 0, JSON.stringify(C.errs.slice(0, 3)));
} catch (e) { fail++; console.log("❌ สคริปต์พัง:", e.stack?.split("\n").slice(0, 3).join(" | ")); }
finally {
  try { chrome?.kill(); } catch {}
  try { server?.kill(); } catch {}
  await sleep(500);
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`); } catch {}
  fs.rmSync(PROFILE, { recursive: true, force: true });
  console.log(`ภาพหน้าจอ: ${SP}`);
  console.log(`\nสรุป [${TAG}]: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}
