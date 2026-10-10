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
// ตำแหน่งกล่องหลักของหน้า (ตามภาพอ้างอิง setup-screen.png): ซ้ายแผงตั้งค่า · ขวาบนการ์ดห้องสองใบ · ขวาล่างกล่อง AI · ล่างปุ่ม
const boxes = (c) => c.ev(`(()=>{const r=(s)=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {l:Math.round(b.left),t:Math.round(b.top+scrollY),r:Math.round(b.right),b:Math.round(b.bottom+scrollY)}};return {opts:r(".setup__opts"),classic:r(".mode-card--classic"),team:r(".mode-card--team"),ai:r(".ai-panel"),btn:r(".setup__create"),vw:innerWidth}})()`);
const overlap = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
function layoutProblems(x, desktop) {
  const p = [];
  const all = ["opts", "classic", "team", "ai", "btn"];
  for (const k of all) if (!x[k]) p.push(`ไม่มี ${k}`);
  if (p.length) return p;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (overlap(x[all[i]], x[all[j]])) p.push(`${all[i]} ทับ ${all[j]}`);
  for (const k of all) if (x[k].l < 0 || x[k].r > x.vw) p.push(`${k} ล้นขอบจอ`);
  if (desktop) {
    if (Math.abs(x.classic.t - x.team.t) > 2) p.push("การ์ดเดี่ยว/ทีมไม่อยู่แถวเดียวกัน");
    if (!(x.classic.l > x.opts.r)) p.push("การ์ดโหมดไม่อยู่ขวาแผงตั้งค่า");
    if (!(x.ai.t >= Math.max(x.classic.b, x.team.b))) p.push("กล่อง AI ไม่อยู่ใต้การ์ดสองใบ");
    if (Math.abs(x.ai.l - x.classic.l) > 2 || Math.abs(x.ai.r - x.team.r) > 2) p.push("กล่อง AI ไม่กว้างเต็มสองคอลัมน์");
    if (Math.abs(x.ai.b - x.opts.b) > 4) p.push(`ขอบล่างกล่อง AI (${x.ai.b}) ไม่เสมอแผงตั้งค่า (${x.opts.b})`);
  }
  if (!desktop) {
    // มือถือ: เรียงบนลงล่าง แผงตั้งค่า → แข่งเดี่ยว → แข่งทีม → กล่อง AI และทุกกล่องกว้างเกือบเต็มจอ (กันการ์ดถูกบีบเป็นแถบแคบ)
    const order = ["opts", "classic", "team", "ai"];
    for (let i = 1; i < order.length; i++) if (!(x[order[i]].t >= x[order[i - 1]].b)) p.push(`${order[i]} ไม่อยู่ใต้ ${order[i - 1]}`);
    for (const k of all) if (x[k].r - x[k].l < (x.vw - 40) * 0.9) p.push(`${k} แคบเกิน (${x[k].r - x[k].l}px)`);
  }
  if (!(x.btn.t >= Math.max(x.opts.b, x.ai.b))) p.push("ปุ่มไม่อยู่ล่างสุด");
  return p;
}
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
  await click(C, ".mode-card", "แข่งทีม"); await sleep(200);
  txt = await C.ev(`document.querySelector(".setup__opts").innerText`);
  ck("ทีม: มีจำนวนรอบ/เวลาวาด/ความยาก/ประเภทห้องครบ เหมือน classic", /จำนวนรอบ/.test(txt) && /เวลาวาด/.test(txt) && /ความยากของคำ/.test(txt) && /ประเภทห้อง/.test(txt) && /ผสม/.test(txt), txt.slice(0, 160));
  const hTeam = await panelH(C);
  ck("ทีม: ความสูงการ์ดเท่ากับ classic", Math.abs(hTeam - hClassic) <= 10, `${hClassic} → ${hTeam}`);

  ck("ทีม: ไม่มีปุ่มจำนวนทีมในหน้า SET UP (ย้ายไปเลือกในห้องรอ)", !/จำนวนทีม/.test(txt), txt.slice(0, 200));

  // ── การ์ดโหมดตามภาพอ้างอิง ──
  const cards = await C.ev(`[...document.querySelectorAll(".mode-card")].map(e=>({cls:e.className,text:e.innerText.replace(/\\s+/g," "),badge:!!e.querySelector(".mode-card__badge"),checked:e.getAttribute("aria-checked")}))`);
  ck("มีการ์ดโหมด 4 ใบ (แข่งเดี่ยว/แข่งทีม/SOLO VS AI/MULTIPLAYER VS AI)", cards.length === 4 && /แข่งเดี่ยว/.test(cards[0].text) && /แข่งทีม/.test(cards[1].text) && /SOLO VS AI/.test(cards[2].text) && /MULTIPLAYER VS AI/.test(cards[3].text), JSON.stringify(cards.map((c) => c.text.slice(0, 30))));
  ck("SOLO VS AI กับ MULTIPLAYER VS AI อยู่ในกล่อง 'แข่งกับ AI' ใบเดียวกัน และไม่มีป้าย 'เร็วๆ นี้'", await C.ev(`document.querySelectorAll(".ai-panel .mode-card").length===2 && !/เร็วๆ นี้/.test(document.body.innerText)`), "");
  ck("ป้าย 'เลือกอยู่' อยู่เฉพาะการ์ดที่เลือก (ตอนนี้ แข่งทีม)", cards.filter((c) => c.badge).length === 1 && cards[1].badge && cards[1].checked === "true", JSON.stringify(cards.map((c) => [c.badge, c.checked])));
  // จำนวนผู้เล่นต้องตรงกับ server จริง: ห้องละ MAX_PLAYERS · เริ่มได้เมื่อ ≥ 2 คน · ทีมละ ≥ TEAM_MIN_PLAYERS (2 ทีม)
  const srvMax = execSync(`grep -oE "const MAX_PLAYERS = [0-9]+" ${ROOT}/server/index.js`).toString().match(/\d+/)[0];
  const srvTeamMin = execSync(`grep -oE "const TEAM_MIN_PLAYERS = [0-9]+" ${ROOT}/server/index.js`).toString().match(/\d+/)[0];
  const srvClassicMin = execSync(`grep -oE "players.length < [0-9]+" ${ROOT}/server/index.js | head -1`).toString().match(/\d+/)[0];
  ck("แข่งเดี่ยว: 'ผู้เล่น 2–8 คน' ตรงกับ server + ป้าย Free-for-All", cards[0].text.includes(`ผู้เล่น ${srvClassicMin}–${srvMax} คน`) && /Free-for-All/.test(cards[0].text), `${cards[0].text} | server ${srvClassicMin}-${srvMax}`);
  ck("แข่งทีม: 'ผู้เล่น 4–8 คน' ตรงกับ server (2 ทีม × ทีมละ 2) + ป้าย Team Battle", cards[1].text.includes(`ผู้เล่น ${srvTeamMin * 2}–${srvMax} คน`) && /Team Battle/.test(cards[1].text), `${cards[1].text} | server ${srvTeamMin}x2-${srvMax}`);
  ck("กล่อง AI มีหัว 'แข่งกับ AI' + ป้าย PLAY WITH AI", await C.ev(`(()=>{const t=document.querySelector(".ai-panel")?.innerText||"";return /แข่งกับ AI/.test(t)&&/PLAY WITH AI/.test(t)})()`), "");

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
    await click(C, ".mode-card", "แข่งทีม"); await sleep(250);
    const pt = await page(C);
    ck(`team ${w}×${h}: ไม่เลื่อนหน้า`, pt.sv <= 0 && pt.sh <= 0, JSON.stringify(pt));
    await shot(C, `team-${w}x${h}`);
    for (const label of ["แข่งเดี่ยว", "SOLO VS AI", "MULTIPLAYER VS AI"]) {
      await click(C, ".mode-card", label); await sleep(200);
      const pl = await page(C);
      if (label === "MULTIPLAYER VS AI") ck(`MULTIPLAYER VS AI ${w}×${h}: ไม่เลื่อนหน้า`, pl.sv <= 0 && pl.sh <= 0, JSON.stringify(pl));
      const lp = layoutProblems(await boxes(C), true);
      ck(`${label} ${w}×${h}: วางตามภาพอ้างอิง ไม่มีกล่องทับกัน`, lp.length === 0, lp.join(" · "));
    }
  }

  // ── มือถือ (เรียงบนลงล่าง เลื่อนลงได้ตามปกติ แต่ห้ามล้นแนวนอนและห้ามมีกล่องทับกัน) ──
  for (const [w, h] of (process.env.MOBILE_SIZES || "390x844").split(",").map((x) => x.split("x").map(Number))) {
    await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: true }); await sleep(300);
    await C.send("Page.navigate", { url: `${base}/setup` }); await sleep(800);
    for (const label of ["แข่งเดี่ยว", "แข่งทีม", "SOLO VS AI", "MULTIPLAYER VS AI"]) {
      await click(C, ".mode-card", label); await sleep(200);
      const pm = await page(C);
      const lp = layoutProblems(await boxes(C), false);
      ck(`${label} ${w}px: ไม่ล้นแนวนอน ไม่มีกล่องทับกัน`, pm.sh <= 0 && lp.length === 0, JSON.stringify(pm) + " " + lp.join(" · "));
      await shot(C, `mobile-${{ "SOLO VS AI": "ai", "MULTIPLAYER VS AI": "mpai", "แข่งทีม": "team" }[label] || "classic"}-${w}`);
    }
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
