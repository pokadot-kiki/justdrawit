import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// เทสเบราว์เซอร์จริง (Chrome headless ผ่าน CDP · --mute-audio) — ต้อง `cd client && npm run build` ก่อน
// ตรวจทีมต้องสมดุล (ห่างไม่เกิน 1 คน) · ปุ่ม "จัดทีมให้สมดุล" · ขอสลับตัว · คะแนนทีมเป็นค่าเฉลี่ย — 3 ทีม 7 แท็บจริง (3-2-2)
const SP = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-browser-shots-"));
const PROFILE = path.join(os.tmpdir(), "jdi-chrome-" + process.pid);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 3002, DBG = 9335;
let pass = 0, fail = 0;
const ck = (n, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} [team-balance] ${n}${ok ? "" : "  " + extra}`); };
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
const shot = async (c, name) => { await act(c); const r = await c.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.writeFileSync(`${SP}/team-balance-${name}.png`, Buffer.from(r.result.data, "base64")); };
const waitFor = async (c, expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await c.ev(`!!(${expr})`)) return true; await sleep(120); } return false; };
const click = (c, sel, text) => c.ev(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(sel)})];const e=${text ? `els.find(x=>x.textContent.includes(${JSON.stringify(text)}))` : "els[0]"};if(!e)return false;e.scrollIntoView({block:"center"});e.click();return true})()`);
const noOverflow = (c) => c.ev(`document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1`);
const ownTeam = (c) => c.ev(`[...document.querySelectorAll(".team-col")].find(e=>e.querySelector(".team-col__name")?.textContent.includes("(ทีมคุณ)"))?.className.match(/team-col--(\\w)/)?.[1] ?? null`);
const teamSizes = (c, teams) => c.ev(`(${JSON.stringify(teams)}).map(t=>document.querySelectorAll(".team-col--"+t+" .lb-player").length)`);

const base = `http://localhost:${PORT}`;

try {
  server = spawn("node", ["index.js"], { cwd: `${ROOT}/server`, env: { ...process.env, PORT: String(PORT), SCORES_FILE: `${SP}/scores-tb.json`, AI_MODE: "mock", CHALLENGE_NO_PACING: "1", CHALLENGE_ODDS: "0" }, stdio: "ignore" });
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1200);
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {} await sleep(200); }

  // ── หัวห้อง: ไปหน้า SET UP เลือกแข่งทีม + 3 ทีม แล้วสร้างห้อง ──
  const H = await newTab(`${base}/`);
  await H.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.teamRulesSeen","1");localStorage.setItem("jdi.music","0");localStorage.setItem("jdi.name","Host")`);
  await act(H);
  await H.send("Page.navigate", { url: `${base}/setup` }); await sleep(900);
  await click(H, ".mode-card", "แข่งทีม"); await sleep(250);
  await click(H, ".setup__opt .segmented .seg", "3 ทีม"); await sleep(150);
  await click(H, ".setup__create"); await sleep(900);
  ck("สร้างห้อง 3 ทีมสำเร็จ เข้าห้องรอ", await waitFor(H, `document.querySelector(".screen--lb")`, 8000));
  const code = await H.ev(`document.querySelector(".lb-codechip b")?.textContent`);
  ck("ห้องรอ: มีคอลัมน์ทีมครบ 3 ทีม", await H.ev(`document.querySelectorAll(".lb-teams .team-col").length === 3`));

  // ── อีก 6 แท็บเข้าห้องเดียวกัน (รวม 7 คน) ──
  const guests = [];
  const nameOf = new Map([[H, "Host"]]);
  for (let i = 2; i <= 7; i++) {
    const c = await newTab(`${base}/`);
    const nm = `P${i}`;
    await c.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.teamRulesSeen","1");localStorage.setItem("jdi.music","0");localStorage.setItem("jdi.name",${JSON.stringify(nm)})`);
    await c.send("Page.navigate", { url: `${base}/?room=${code}` }); await sleep(600);
    await click(c, ".modal .btn--primary");
    await waitFor(c, `document.querySelector(".screen--lb")`, 6000);
    guests.push(c);
    nameOf.set(c, nm);
  }
  await sleep(800);
  const ALL = [H, ...guests];
  // คลิกปุ่ม "ขอสลับ" (.swap-btn) เฉพาะที่อยู่ในแถวของผู้เล่นชื่อ targetName (กันคลิกโดนคนผิดเมื่อมีปุ่มขอสลับหลายปุ่มในจอ)
  const clickSwapFor = (c, targetName) => c.ev(`(()=>{const row=[...document.querySelectorAll(".lb-player")].find(r=>r.textContent.includes(${JSON.stringify(targetName)}));const btn=row?.querySelector(".swap-btn");if(!btn)return false;btn.scrollIntoView({block:"center"});btn.click();return true})()`);
  ck("ทั้ง 7 แท็บเข้าห้องรอสำเร็จ", await Promise.all(ALL.map((c) => c.ev(`!!document.querySelector(".screen--lb")`))).then((xs) => xs.every(Boolean)));

  const sz0 = await teamSizes(H, ["A", "B", "C"]);
  const sorted0 = [...sz0].sort((a, b) => b - a);
  ck("7 คนเข้า 3 ทีม จัดอัตโนมัติได้ 3-2-2 (เรียงมากไปน้อย)", JSON.stringify(sorted0) === JSON.stringify([3, 2, 2]), JSON.stringify(sz0));
  await shot(H, "01-lobby-3teams-7people");

  // ── ปุ่ม "ย้ายมา..." ของทีมที่เท่ากัน/มากกว่าต้องกดไม่ได้ (disabled) ──
  const bigTeam = ["A", "B", "C"][sz0.indexOf(3)];
  const smallTeams = ["A", "B", "C"].filter((t) => t !== bigTeam);
  let memberBig = null;
  for (const c of ALL) { if ((await ownTeam(c)) === bigTeam) { memberBig = c; break; } }
  ck("หาสมาชิกทีมใหญ่ (3 คน) ได้จาก DOM", Boolean(memberBig));
  // คนในทีมเล็ก(smallTeams[0]) ลองย้ายไปทีมเล็กอีกทีม(smallTeams[1]) — ขนาดเท่ากัน ไม่ใช่ "น้อยกว่า" → ปุ่มต้องกดไม่ได้ (disabled)
  let memberSmallCheck = null;
  for (const c of ALL) { if ((await ownTeam(c)) === smallTeams[0]) { memberSmallCheck = c; break; } }
  ck("หาสมาชิกทีมเล็ก (ไว้เช็คปุ่มย้ายไปทีมเล็กอีกทีม)", Boolean(memberSmallCheck));
  ck(`คนทีมเล็กย้ายไปทีมเล็กอีกทีมที่เท่ากัน (ไม่ใช่น้อยกว่าจริง) → ปุ่มกดไม่ได้`,
    await memberSmallCheck.ev(`document.querySelector(".team-col--${smallTeams[1]} .team-col__join")?.disabled === true`));
  // คนทีมใหญ่ย้ายไปทีมเล็ก (คนน้อยกว่าจริง) — ปุ่มต้องกดได้
  const joinSel = `.team-col--${smallTeams[0]} .team-col__join`;
  ck("ปุ่มย้ายไปทีมที่คนน้อยกว่าจริง กดได้ (ไม่ disabled)", await memberBig.ev(`document.querySelector(${JSON.stringify(joinSel)})?.disabled === false`));

  // ── ขอสลับตัวกับคนทีมอื่น: memberBig ขอสลับกับคนในทีมเล็กทีมแรก ──
  let memberSmall = null;
  for (const c of ALL) { if ((await ownTeam(c)) === smallTeams[0]) { memberSmall = c; break; } }
  ck("หาสมาชิกทีมเล็กอีกฝั่งได้จาก DOM", Boolean(memberSmall));
  await act(memberBig);
  ck("มีปุ่มขอสลับข้างชื่อผู้เล่นทีมอื่น", await memberBig.ev(`!!document.querySelector(".swap-btn")`));
  ck("กดปุ่มขอสลับตัวกับผู้เล่นที่เลือกไว้สำเร็จ", await clickSwapFor(memberBig, nameOf.get(memberSmall)));
  await sleep(500);
  ck("ฝั่งที่ถูกขอเห็นแถบแจ้งคำขอสลับตัว", await waitFor(memberSmall, `document.querySelector(".lb-swap-banner")`, 3000));
  await shot(memberSmall, "02-swap-request-banner");
  const bigTeamBefore = await ownTeam(memberBig);
  const smallTeamBefore = await ownTeam(memberSmall);
  await act(memberSmall);
  await click(memberSmall, ".lb-swap-banner__actions .btn--primary"); // กด "รับ"
  await sleep(500);
  ck("รับคำขอแล้วสลับทีมจริง (สองฝั่งสลับทีมกัน)",
    (await ownTeam(memberBig)) === smallTeamBefore && (await ownTeam(memberSmall)) === bigTeamBefore);
  ck("แถบแจ้งคำขอหายไปหลังตอบแล้ว", !(await memberSmall.ev(`!!document.querySelector(".lb-swap-banner")`)));

  // ── ปุ่ม "จัดทีมให้สมดุล" (หัวห้องเท่านั้น) — เตะคนออกให้ไม่สมดุลก่อน ──
  // 7 คน/3 ทีม ที่สมดุลมีแค่รูปแบบ 3-2-2 เท่านั้น เตะจากทีม "เล็ก" (2 คน) จะได้ 3-2-1 (ห่าง 2 คน จริง)
  // ถ้าเตะจากทีมใหญ่จะได้ 2-2-2 ซึ่งยังสมดุลอยู่ (ไม่มีประโยชน์กับเทสนี้) — ทีมที่เหลือ 1 คนจะชน NOT_ENOUGH_PLAYERS ไปด้วย (เป็นธรรมดา เพราะ 7 หาร 3 ลงตัวที่ 3-2-2 พอดี ไม่มีทางได้ 3-2-1 แบบไม่ชนเงื่อนไขนี้)
  // จึงเช็คแค่ว่า "เริ่มเกมกดไม่ได้พร้อมเหตุผลบางอย่าง" ไม่เจาะจงข้อความ (ข้อความเฉพาะของ TEAM_UNBALANCED มีเทส server ข้อ 44 ยืนยันแยกไว้แล้วด้วยสถานการณ์ที่แยกสองเงื่อนไขนี้ออกจากกันได้)
  const szNow = await teamSizes(H, ["A", "B", "C"]);
  const smallestNow = ["A", "B", "C"][szNow.indexOf(Math.min(...szNow))];
  let kickTarget = null;
  for (const c of guests) { if ((await ownTeam(c)) === smallestNow) { kickTarget = c; break; } }
  ck("หาคนทีมเล็กสุด ไว้เตะเพื่อทดสอบปุ่มจัดสมดุลได้", Boolean(kickTarget));
  if (kickTarget) {
    await act(H);
    // คลิกปุ่มเตะของแถวผู้เล่นที่อยู่ทีมเล็กสุด (เอาแถวแรกที่เจอในคอลัมน์นั้นที่มีปุ่มเตะ)
    await H.ev(`(()=>{const col=document.querySelector(".team-col--${smallestNow}");const btn=[...col.querySelectorAll(".lb-player")].map(p=>p.querySelector(".kick-btn")).find(Boolean);if(btn)btn.click();return !!btn})()`);
    await sleep(500);
    const szAfterKick = await teamSizes(H, ["A", "B", "C"]);
    ck("เตะคนออกแล้วทีมไม่สมดุล (ห่างเกิน 1)", Math.max(...szAfterKick) - Math.min(...szAfterKick) > 1, JSON.stringify(szAfterKick));
    ck("ปุ่มเริ่มเกมกดไม่ได้ พร้อมเหตุผลที่อ่านออก (มีข้อความอธิบายไม่ใช่กดเฉยๆ)",
      await H.ev(`document.querySelector(".lb-bigbtn")?.disabled === true && /ทีม|คน/.test(document.querySelector(".lb-roster")?.textContent ?? "")`));
    // ผู้เล่นที่ไม่ใช่หัวห้องไม่เห็นปุ่มจัดทีมให้สมดุล
    const nonHost = guests.find((g) => g !== kickTarget) ?? guests[0];
    ck("ผู้เล่นที่ไม่ใช่หัวห้องไม่เห็นปุ่มจัดทีมให้สมดุล", !(await nonHost.ev(`[...document.querySelectorAll(".lb-rules-btn")].some(b=>b.textContent.includes("จัดทีมให้สมดุล"))`)));
    await act(H);
    ck("หัวห้องเห็นปุ่มจัดทีมให้สมดุล", await H.ev(`[...document.querySelectorAll(".lb-rules-btn")].some(b=>b.textContent.includes("จัดทีมให้สมดุล"))`));
    await click(H, ".lb-rules-btn", "จัดทีมให้สมดุล");
    await sleep(500);
    const szAfterBalance = await teamSizes(H, ["A", "B", "C"]);
    ck("กดจัดทีมให้สมดุลแล้ว ทุกทีมห่างกันไม่เกิน 1 คน", Math.max(...szAfterBalance) - Math.min(...szAfterBalance) <= 1, JSON.stringify(szAfterBalance));
    // เริ่มเกมยังกดไม่ได้ (ทุกคนยังไม่กด "พร้อม") แต่เหตุผลต้องไม่พูดถึงทีมไม่สมดุลแล้ว เพราะจัดสมดุลไปแล้ว — เหลือแค่รอความพร้อม
    ck("หลังจัดสมดุลแล้ว ไม่มีข้อความเรื่องทีมไม่สมดุลอีกต่อไป (เหลือแค่รอคนพร้อม)",
      !(await H.ev(`document.querySelector(".lb-roster")?.textContent.includes("ไม่สมดุล")`)));
  }
  await shot(H, "03-lobby-after-balance");

  // ── เลย์เอาต์ 3 ทีม ไม่ล้นจอ ──
  for (const [w, h] of [[1440, 900], [1366, 768], [1024, 768]]) {
    await H.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    ck(`ห้องรอ 3 ทีม ไม่ล้นจอที่ ${w}x${h}`, await noOverflow(H));
  }
  await H.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // ── เริ่มเกม + คะแนนทีมโชว์ "เฉลี่ย/คน" ── (เหลือ 6 แท็บที่ยังอยู่ในห้องจริง — คนที่ถูกเตะไปแล้วไม่นับ)
  const active = ALL.filter((c) => c !== kickTarget);
  for (const c of active) if (c !== H) await click(c, ".lb-bigbtn");
  await sleep(500);
  await click(H, ".lb-bigbtn");
  await sleep(1200);
  for (const c of active) { if (await c.ev(`!!document.querySelector(".word-choices")`)) await click(c, ".word-choices button"); }
  ck("ทุกแท็บที่ยังอยู่ในห้องเข้าหน้าเกม", (await Promise.all(active.map((c) => waitFor(c, `document.querySelector(".game")`, 10000)))).every(Boolean));
  await sleep(2500);
  ck("แถบบน: มีชิปคะแนนทีมครบ 3 ใบ", await H.ev(`document.querySelectorAll(".team-vs__chip").length === 3`));
  await noOverflow(H).then((ok) => ck("หน้าเกม 3 ทีม ไม่ล้นจอ 1440x900", ok));
  await shot(H, "04-game-3teams");
  ck("ไม่มี exception ตลอดการทดสอบ (หัวห้อง)", H.errs.length === 0, JSON.stringify(H.errs.slice(0, 3)));
  ck("ไม่มี exception ตลอดการทดสอบ (แท็บทีมใหญ่)", memberBig.errs.length === 0, JSON.stringify(memberBig.errs.slice(0, 3)));
} catch (e) {
  fail++; console.log("❌ สคริปต์พัง:", e.stack?.split("\n").slice(0, 3).join(" | "));
} finally {
  try { chrome?.kill(); } catch {}
  try { server?.kill(); } catch {}
  await sleep(500);
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`); } catch {}
  fs.rmSync(PROFILE, { recursive: true, force: true });
  console.log(`ภาพหน้าจอ: ${SP}`);
  console.log(`\nสรุป [team-balance]: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}
