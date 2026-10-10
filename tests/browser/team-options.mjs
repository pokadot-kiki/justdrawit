import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// เทสเบราว์เซอร์จริง (Chrome headless ผ่าน CDP · --mute-audio) — ต้อง `cd client && npm run build` ก่อน
// ตรวจขยายโหมดทีม: เลือกจำนวนทีม (2-4) + ตั้งชื่อทีมเอง — 4 ทีม 8 แท็บจริง
const SP = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-browser-shots-"));
const PROFILE = path.join(os.tmpdir(), "jdi-chrome-" + process.pid);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 3001, DBG = 9334;
let pass = 0, fail = 0;
const ck = (n, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} [team-options] ${n}${ok ? "" : "  " + extra}`); };
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
async function newTab(url, w = 1440, h = 900) {
  const t = await (await fetch(`http://127.0.0.1:${DBG}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const c = await cdpOf(t.webSocketDebuggerUrl);
  c.tid = t.id;
  await c.send("Page.enable"); await c.send("Runtime.enable");
  await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  return c;
}
const act = (c) => fetch(`http://127.0.0.1:${DBG}/json/activate/${c.tid}`);
const shot = async (c, name) => { await act(c); const r = await c.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.writeFileSync(`${SP}/team-options-${name}.png`, Buffer.from(r.result.data, "base64")); };
const waitFor = async (c, expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await c.ev(`!!(${expr})`)) return true; await sleep(120); } return false; };
const click = (c, sel, text) => c.ev(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(sel)})];const e=${text ? `els.find(x=>x.textContent.includes(${JSON.stringify(text)}))` : "els[0]"};if(!e)return false;e.scrollIntoView({block:"center"});e.click();return true})()`);
const typeInto = (c, sel, text) => c.ev(`(()=>{const i=document.querySelector(${JSON.stringify(sel)});if(!i)return false;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;s.call(i,${JSON.stringify(text)});i.dispatchEvent(new Event("input",{bubbles:true}));return true})()`);
const noOverflow = (c) => c.ev(`document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1`);

const base = `http://localhost:${PORT}`;

try {
  server = spawn("node", ["index.js"], { cwd: `${ROOT}/server`, env: { ...process.env, NODE_ENV: "test", JDI_TEST_AUTH_BYPASS: "1", PORT: String(PORT), SCORES_FILE: `${SP}/scores-to.json`, AI_MODE: "mock", CHALLENGE_NO_PACING: "1", CHALLENGE_ODDS: "0" }, stdio: "ignore" });
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1200);
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {} await sleep(200); }

  // ── หัวห้อง: ไปหน้า SET UP เลือกแข่งทีมแล้วสร้างห้อง (ไม่มีปุ่มจำนวนทีมที่หน้านี้แล้ว — เลือกในห้องรอ) ──
  const H = await newTab(`${base}/`);
  await H.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.teamRulesSeen","1");localStorage.setItem("jdi.music","0");localStorage.setItem("jdi.name","Host")`);
  await act(H);
  await H.send("Page.navigate", { url: `${base}/setup` }); await sleep(900);
  ck("หน้า SET UP ไม่มีปุ่มจำนวนทีมเลย (ย้ายไปห้องรอแล้ว)", await H.ev(`!document.querySelector(".mode-card__teamcount")`));
  await click(H, ".mode-card", "แข่งทีม"); await sleep(250);
  await click(H, ".setup__create"); await sleep(900);
  ck("สร้างห้องสำเร็จ เข้าห้องรอ", await waitFor(H, `document.querySelector(".screen--lb")`, 8000));
  const code = await H.ev(`document.querySelector(".lb-codechip b")?.textContent`);
  ck("ห้องทีมเริ่มที่ 2 ทีมเสมอ (ไม่ได้เลือกจากหน้า SET UP)", await H.ev(`document.querySelectorAll(".lb-teams .team-col").length === 2`));
  // หัวห้องปรับจำนวนทีมเป็น 4 จากกล่อง "จำนวนทีม" ของห้องรอเอง (เหมือนเดิมก่อนงานนี้)
  await click(H, `[aria-label="จำนวนทีม"] .seg`, "4 ทีม"); await sleep(300);
  ck("ห้องรอ: ปรับเป็น 4 ทีมจากกล่องในห้องรอได้ มีคอลัมน์ทีมครบ 4 ทีม", await waitFor(H, `document.querySelectorAll(".lb-teams .team-col").length === 4`, 3000));

  // ── อีก 7 แท็บเข้าห้องเดียวกัน ──
  const guests = [];
  for (let i = 2; i <= 8; i++) {
    const c = await newTab(`${base}/`);
    await c.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.teamRulesSeen","1");localStorage.setItem("jdi.music","0");localStorage.setItem("jdi.name","P${i}")`);
    await c.send("Page.navigate", { url: `${base}/?room=${code}` }); await sleep(600);
    await click(c, ".modal .btn--primary"); // ยืนยันเข้าห้อง
    await waitFor(c, `document.querySelector(".screen--lb")`, 6000);
    guests.push(c);
  }
  await sleep(800);
  const ALL = [H, ...guests];
  ck("ทั้ง 8 แท็บเข้าห้องรอสำเร็จ", await Promise.all(ALL.map((c) => c.ev(`!!document.querySelector(".screen--lb")`))).then((xs) => xs.every(Boolean)));
  ck("ห้องรอ 8 คน: ทุกคน (รวมหัวห้อง) เห็นคอลัมน์ทีมครบ 4", (await Promise.all(ALL.map((c) => c.ev(`document.querySelectorAll(".lb-teams .team-col").length === 4`)))).every(Boolean));

  // ── 8 คนเข้า 4 ทีม จัดอัตโนมัติได้ 2 คนต่อทีมพอดีอยู่แล้ว (ไม่ต้องกดย้ายเอง) ──
  // งานขยายทีมสมดุล (ห่างไม่เกิน 1 คน) ทำให้ "ย้ายมา..." กดได้แค่ไปทีมที่คนน้อยกว่าจริงเท่านั้น
  // 8 คน/4 ทีมของเดิมก็ได้ 2-2-2-2 พอดีอยู่แล้วตามธรรมชาติ จึงไม่ต้องกดย้ายเลย — หาว่าใครอยู่ทีมไหนจาก DOM แทนการเดาลำดับ
  await sleep(300);
  const counts = await H.ev(`Object.fromEntries([..."ABCD"].map(t=>[t, document.querySelectorAll(".team-col--"+t+" .lb-player").length]))`);
  ck("8 คนเข้า 4 ทีม จัดอัตโนมัติได้ 2 คนต่อทีมพอดี (A B C D)", JSON.stringify(counts) === JSON.stringify({ A: 2, B: 2, C: 2, D: 2 }), JSON.stringify(counts));

  // หาว่าแต่ละแท็บอยู่ทีมไหนจริง (ดูป้าย "(ทีมคุณ)" ที่ตัวเองเห็น)
  // "(ทีมคุณ)" ถูกแทนด้วยป้าย "คุณ" (.you-tag) แล้ว (รอบปรับ layout ห้องรอ) — หาทีมของเราจากป้ายนี้แทนข้อความเดิม
  const ownTeam = (c) => c.ev(`[...document.querySelectorAll(".team-col")].find(e=>e.querySelector(".team-col__name .you-tag"))?.className.match(/team-col--(\\w)/)?.[1] ?? null`);
  const hostTeam = await ownTeam(H);
  ck("หาทีมของหัวห้องได้จาก DOM", ["A", "B", "C", "D"].includes(hostTeam), hostTeam);
  const otherTeam = ["A", "B", "C", "D"].find((t) => t !== hostTeam);
  let memberOther = null, memberThird = null;
  for (const g of guests) {
    const t = await ownTeam(g);
    if (t === otherTeam && !memberOther) memberOther = g;
    else if (t !== hostTeam && t !== otherTeam && !memberThird) memberThird = g;
  }
  ck("หาสมาชิกทีมอื่น (ไม่ใช่ทีมหัวห้อง) ได้จาก DOM", Boolean(memberOther));

  // ── ตั้งชื่อทีม (หัวห้องเปลี่ยนชื่อทีมตัวเอง และลองแก้ทีมอื่นซึ่งไม่ใช่ทีมตัวเอง) ──
  // ต้อง activate แท็บก่อนเสมอ (บทเรียนเดิมของโปรเจกต์: แท็บที่ไม่ active ทำงานช้ากว่าปกติ)
  await act(H);
  await click(H, `.team-col--${hostTeam} .team-col__name-text--edit`); await sleep(300);
  await typeInto(H, `.team-col--${hostTeam} .team-col__name-input`, "มังกรทอง");
  await sleep(100);
  await H.ev(`document.querySelector(".team-col--${hostTeam} .team-col__name-input")?.blur()`);
  await sleep(800);
  ck("หัวห้องเปลี่ยนชื่อทีมตัวเองสำเร็จ (เห็นในห้องรอ)", await H.ev(`document.querySelector(".team-col--${hostTeam} .team-col__name")?.textContent.includes("มังกรทอง")`));
  ck("คนอื่นในห้องเห็นชื่อทีมใหม่ด้วย (room_update ถึงทุกคน)", await guests[6].ev(`document.querySelector(".team-col--${hostTeam} .team-col__name")?.textContent.includes("มังกรทอง")`));
  ck("แชทห้องรอขึ้นข้อความว่าใครเปลี่ยนชื่อทีมเป็นอะไร (เห็นที่คนอื่นด้วย)",
    await guests[6].ev(`[...document.querySelectorAll(".lb-chat__row")].some(e=>e.textContent.includes("Host")&&e.textContent.includes("มังกรทอง"))`));

  // หัวห้องไม่มีสิทธิ์พิเศษอีกต่อไป — ปุ่มเปลี่ยนชื่อทีมอื่น (ไม่ใช่ทีมตัวเอง) ต้องไม่โผล่ให้หัวห้องกดเลย
  ck("หัวห้องไม่เห็นปุ่มเปลี่ยนชื่อทีมอื่น (ไม่มีสิทธิ์พิเศษอีกต่อไป)", await H.ev(`!document.querySelector(".team-col--${otherTeam} .team-col__name-text--edit")`));

  // สมาชิกจริงของทีมอื่น (memberOther) เปลี่ยนชื่อทีมตัวเองแทน
  await act(memberOther);
  await click(memberOther, `.team-col--${otherTeam} .team-col__name-text--edit`); await sleep(300);
  await typeInto(memberOther, `.team-col--${otherTeam} .team-col__name-input`, "อินทรีเงิน");
  await sleep(100);
  await memberOther.ev(`document.querySelector(".team-col--${otherTeam} .team-col__name-input")?.blur()`);
  await sleep(800);
  ck("สมาชิกจริงของทีมอื่นเปลี่ยนชื่อทีมตัวเองได้", await H.ev(`document.querySelector(".team-col--${otherTeam} .team-col__name")?.textContent.includes("อินทรีเงิน")`));

  // สมาชิกทีมที่สาม ลองกดปุ่มเปลี่ยนชื่อทีมหัวห้อง (ไม่ใช่ทีมตัวเอง) — ปุ่มต้องไม่โผล่ให้กดเลย
  ck("สมาชิกทีมอื่นไม่เห็นปุ่มเปลี่ยนชื่อทีมหัวห้องเลย (ปุ่มกดได้เฉพาะหัวห้อง/เจ้าของทีม)",
    await memberThird.ev(`!document.querySelector(".team-col--${hostTeam} .team-col__name-text--edit")`));

  // ── เลย์เอาต์ 4 ทีม ไม่ล้นจอ หลายขนาด ──
  for (const [w, h] of [[1440, 900], [1366, 768], [1024, 768]]) {
    await H.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    ck(`ห้องรอ 4 ทีม ไม่ล้นจอที่ ${w}x${h}`, await noOverflow(H));
  }
  await H.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  ck("ห้องรอ 4 ทีม ไม่ล้นแนวนอนที่มือถือ 390px", await H.ev(`document.documentElement.scrollWidth<=391`));
  await H.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await shot(H, "lobby-4teams");

  // ── เริ่มเกม แล้วดูหน้าเกม: ชิปคะแนนทีม 4 ใบ + ชื่อทีมที่ตั้งไว้ ──
  for (const c of guests) await click(c, ".lb-bigbtn"); // ทุกคนกด "พร้อม"
  await sleep(500);
  await click(H, ".lb-bigbtn"); // หัวห้องกด "เริ่มเกม"
  await sleep(1200);
  // ใครก็ตามที่เห็นกล่องเลือกคำ กดเลือกคำแรก (คนวาดของแต่ละทีม)
  for (const c of ALL) { if (await c.ev(`!!document.querySelector(".word-choices")`)) await click(c, ".word-choices button"); }
  ck("ทุกแท็บเข้าหน้าเกม", (await Promise.all(ALL.map((c) => waitFor(c, `document.querySelector(".game")`, 10000)))).every(Boolean));
  await sleep(2500);
  ck("แถบบน: มีชิปคะแนนทีมครบ 4 ใบ", await H.ev(`document.querySelectorAll(".team-vs__chip").length === 4`));
  ck("ชิปคะแนนทีมโชว์ชื่อที่ตั้งไว้ (มังกรทอง) ไม่ใช่แค่ตัวอักษร A", await H.ev(`[...document.querySelectorAll(".team-vs__name")].some(e=>e.textContent.includes("มังกรทอง"))`));
  await noOverflow(H).then((ok) => ck("หน้าเกม 4 ทีม ไม่ล้นจอ 1440x900", ok));
  await shot(H, "game-4teams");
  ck("ไม่มี exception ตลอดการทดสอบ (หัวห้อง)", H.errs.length === 0, JSON.stringify(H.errs.slice(0, 3)));
} catch (e) {
  fail++; console.log("❌ สคริปต์พัง:", e.stack?.split("\n").slice(0, 3).join(" | "));
} finally {
  try { chrome?.kill(); } catch {}
  try { server?.kill(); } catch {}
  await sleep(500);
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`); } catch {}
  fs.rmSync(PROFILE, { recursive: true, force: true });
  console.log(`ภาพหน้าจอ: ${SP}`);
  console.log(`\nสรุป [team-options]: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}
