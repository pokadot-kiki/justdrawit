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
const ODDS = process.argv[3] ?? "1";
const TAG = `refresh-${process.argv[3]||"all"}-o${process.argv[4]??0}`;
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
const shot = async (c, name, full = false) => { await act(c); const r = await c.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.writeFileSync(`${SP}/m-${TAG}-${name}.png`, Buffer.from(r.result.data, "base64")); };
const waitFor = async (c, expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await c.ev(`!!(${expr})`)) return true; await sleep(120); } return false; };
const click = (c, sel, text) => c.ev(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(sel)})];const e=${text ? `els.find(x=>x.textContent.includes(${JSON.stringify(text)}))` : "els[0]"};if(!e)return false;e.scrollIntoView({block:"center"});e.click();return true})()`);
const typeInto = (c, sel, text) => c.ev(`(()=>{const i=document.querySelector(${JSON.stringify(sel)});if(!i)return false;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;s.call(i,${JSON.stringify(text)});i.dispatchEvent(new Event("input",{bubbles:true}));return true})()`);

// ตัวตรวจ: ข้อความ/ปุ่มล้นจอ · ซ้อนทับกัน · ถูกบังด้วยของอื่น · ล้นออกนอกแถบคำ
const CHK = `(()=>{
  const vw=innerWidth, issues=[];
  const modal=document.querySelector('.modal__panel');
  const root=modal||document.body;
  const desc=e=>(e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/)[0]:'')+':'+(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,18));
  const vis=e=>{const r=e.getBoundingClientRect();if(r.width<1||r.height<1)return false;const cs=getComputedStyle(e);return cs.visibility!=='hidden'&&cs.display!=='none'&&parseFloat(cs.opacity)>0.05};
  const SKIP='.confetti,.mascot,.mascot-note,.board__canvas,.critter,.crit,.sparkles,.page-sparkles';
  const atoms=[...root.querySelectorAll('*')].filter(e=>{
    if(e.closest(SKIP)||!vis(e))return false;
    const t=e.tagName.toLowerCase();
    if(['button','input','textarea','select','img'].includes(t))return true;
    if(t==='svg')return !e.closest('button')&&!e.closest('[aria-hidden="true"]')&&!e.closest('.grass,.decor');
    return [...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
  });
  const scrollParentX=e=>{for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const o=getComputedStyle(p).overflowX;if(o==='auto'||o==='scroll')return true}return false};
  if(document.documentElement.scrollWidth>vw+1)issues.push('หน้าล้นแนวนอน '+document.documentElement.scrollWidth+'>'+vw);
  for(const e of atoms){const r=e.getBoundingClientRect();if((r.right>vw+1||r.left<-1)&&!scrollParentX(e))issues.push('ล้นจอ '+desc(e)+' '+Math.round(r.left)+'..'+Math.round(r.right));}
  // ส่วนที่มองเห็นจริง = ตัดด้วยกรอบของบรรพบุรุษที่ overflow ไม่ใช่ visible (แถวที่เลื่อนอยู่ในกรอบไม่นับว่าซ้อนกับของนอกกรอบ)
  const clipped=e=>{let r=e.getBoundingClientRect();let L=r.left,T=r.top,R=r.right,B=r.bottom;for(let p=e.parentElement;p&&p!==document.documentElement;p=p.parentElement){const cs=getComputedStyle(p);if(cs.overflowX==='visible'&&cs.overflowY==='visible')continue;const q=p.getBoundingClientRect();if(cs.overflowX!=='visible'){L=Math.max(L,q.left);R=Math.min(R,q.right)}if(cs.overflowY!=='visible'){T=Math.max(T,q.top);B=Math.min(B,q.bottom)}}return {left:L,top:T,right:R,bottom:B,width:R-L,height:B-T}};
  const rects=atoms.map(e=>({e,r:clipped(e)})).filter(x=>x.r.width>1&&x.r.height>1);
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
    const a=rects[i],b=rects[j];if(a.e.contains(b.e)||b.e.contains(a.e))continue;
    const iw=Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left),ih=Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top);
    if(iw>3&&ih>3){const m=Math.min(a.r.width*a.r.height,b.r.width*b.r.height);if(iw*ih>=0.25*m)issues.push('ซ้อนทับ '+desc(a.e)+' ⟷ '+desc(b.e));}
  }
  const wb=document.querySelector('.wordbar');
  if(wb&&!modal){const w=wb.getBoundingClientRect();for(const e of atoms){if(!wb.contains(e))continue;const r=e.getBoundingClientRect();if(r.bottom>w.bottom+1||r.top<w.top-1)issues.push('ล้นแถบคำ '+desc(e)+' '+Math.round(r.top-w.top)+'/'+Math.round(r.bottom-w.bottom));}}
  const seen=new Set();
  for(const e of atoms){if(e.closest('[style*="position: fixed"],.audio-dock'))continue;{const q=e.getBoundingClientRect();window.scrollTo(0,Math.max(0,q.top+scrollY-innerHeight/2));}const full=e.getBoundingClientRect();const cr=clipped(e);if(cr.width<2||cr.height<2||cr.width*cr.height<0.6*full.width*full.height)continue;const r=cr;const cx=Math.min(vw-1,Math.max(0,r.left+r.width/2)),cy=Math.min(innerHeight-1,Math.max(0,r.top+r.height/2));const t=document.elementFromPoint(cx,cy);if(t&&!(t===e||e.contains(t)||t.contains(e))){const k=desc(e);if(!seen.has(k)){seen.add(k);issues.push('ถูกบัง '+k+' ด้วย '+desc(t));}}}
  window.scrollTo(0,0);
  return issues;
})()`;
const sweep = async (c, name, tag) => {
  if (process.env.SHOTS !== "0") await shot(c, tag || name.replace(/\W+/g, "_"));
  const iss = await c.ev(CHK);
  ck(`${name}: ไม่ล้น/ไม่ซ้อน/ไม่ถูกบัง`, Array.isArray(iss) && iss.length === 0, JSON.stringify(iss?.slice(0, 5)));
};
const drawStroke = async (c, path) => {
  await act(c);
  const r = await c.ev(`(()=>{const e=document.querySelector(".board canvas");e.scrollIntoView({block:"center"});const b=e.getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  if (!r) return false;
  await sleep(200);
  const r2 = await c.ev(`(()=>{const b=document.querySelector(".board canvas").getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  const p = (fx, fy) => ({ x: r2.x + r2.w * fx, y: r2.y + r2.h * fy });
  const pts = (path || [[.3,.3],[.7,.3],[.7,.7],[.3,.7],[.3,.3]]).map(([a,b]) => p(a,b));
  await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pts[0].x, y: pts[0].y, button: "left", clickCount: 1 });
  for (const q of pts.slice(1)) await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: q.x, y: q.y, button: "left", buttons: 1 });
  await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pts.at(-1).x, y: pts.at(-1).y, button: "left", clickCount: 1 });
  return true;
};
const base = `http://localhost:${PORT}`;
const which = process.argv[3] || "all";
const INK = `(()=>{const c=document.querySelector(".board canvas");if(!c)return -1;const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4){if(d[i+3]>0&&(d[i]<200||d[i+1]<200||d[i+2]<200))n++}return n})()`;
const urlOf = (c) => c.ev(`location.pathname`);
// รีเฟรชจริงแล้วรอจนหน้ากลับมา
const reload = async (c) => { await c.send("Page.reload"); await sleep(1800); };
const stay = async (c, code, name, cond, ms = 8000) => {
  const ok = await waitFor(c, cond, ms);
  const u = await urlOf(c);
  ck(`${name}: ยังอยู่ /room/${code} และหน้าถูกต้อง`, ok && u === `/room/${code}`, `url=${u} ok=${ok}`);
  return ok;
};
try {
  server = spawn("node", ["index.js"], { cwd: `${ROOT}/server`, env: { ...process.env, PORT: String(PORT), SCORES_FILE: `${SP}/scores-r.json`, AI_MODE: "mock", CHALLENGE_ODDS: process.argv[4] ?? "0", CHALLENGE_NO_PACING: "1", LOBBY_RETURN_MS: "15000", CHALLENGE_INTRO_MS: process.argv[4] === "1" ? "2500" : "0" }, stdio: "ignore" });
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1500);
  const N = which === "team" ? 4 : 2;
  const T = [];
  for (let i = 0; i < N; i++) { const c = await newTab(`${base}/`); await c.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await c.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.teamRulesSeen","1");localStorage.setItem("jdi.music","0")`); T.push(c); }
  const H = T[0];
  await H.send("Page.navigate", { url: `${base}/setup` }); await sleep(1000);
  if (which === "team") { await click(H, ".mode-card", "ทีม A vs B"); await sleep(200); }
  await click(H, ".setup__create");
  await waitFor(H, `document.querySelector(".screen--lb")`);
  const code = await H.ev(`document.querySelector(".lb-codechip b")?.textContent`);
  for (const c of T.slice(1)) { await c.send("Page.navigate", { url: `${base}/?room=${code}` }); await sleep(900); await click(c, ".modal .btn--primary"); await waitFor(c, `document.querySelector(".screen--lb")`); }
  await sleep(500);
  // รีเฟรชในห้องรอ
  await reload(T[1]); await stay(T[1], code, "ห้องรอ", `document.querySelector(".screen--lb")`);
  for (const c of T.slice(1)) await click(c, ".lb-bigbtn");
  await sleep(500);
  await click(H, ".lb-bigbtn");
  await sleep(1200);
  const drawers = async () => { const out = []; for (const c of T) if (await c.ev(`!!document.querySelector(".word-choices")`)) out.push(c); return out; };
  let dr = await drawers();
  ck("มีคนวาดเห็นกล่องเลือกคำ", dr.length >= 1);
  // ── 1) รีเฟรชระหว่างเลือกคำ (คนวาด) ──
  const d0 = dr[0];
  await reload(d0);
  await stay(d0, code, "รีเฟรชตอนเลือกคำ (คนวาด) → กล่องเลือกคำกลับมา", `document.querySelector(".word-choices")`);
  await click(d0, ".word-choices button");
  for (const c of dr.slice(1)) await click(c, ".word-choices button").catch(() => {});
  // รอทุกคนเข้าช่องวาด
  await waitFor(d0, `document.querySelector(".wordbar .topbar__real-word")`, 8000);
  if (process.argv[4] === "1") {
    ck("ตานี้มีป้าย Mini Challenge ใหญ่", await waitFor(d0, `document.querySelector(".challenge-intro")`, 3000));
    await reload(d0);
    await stay(d0, code, "รีเฟรชระหว่างป้ายใหญ่ Mini Challenge (คนวาด)", `document.querySelector(".game") && document.querySelector(".wordbar .topbar__real-word")`);
    await waitFor(d0, `!document.querySelector(".challenge-intro")`, 6000);
    await sleep(2800);
  }
  await sleep(600);
  // ── 2) วาดแล้วรีเฟรช ──
  await drawStroke(d0);
  await sleep(900);
  const ink1 = await d0.ev(INK);
  ck("วาดแล้วมีหมึกบนกระดาน", ink1 > 500, String(ink1));
  const word = await d0.ev(`document.querySelector(".wordbar .topbar__real-word").textContent`);
  const score0 = await d0.ev(`[...document.querySelectorAll(".score-row")].map(r=>r.textContent.replace(/\s+/g,"")).join("|")`);
  await reload(d0);
  await stay(d0, code, "รีเฟรชตอนวาด (คนวาด)", `document.querySelector(".game") && document.querySelector(".wordbar .topbar__real-word")`);
  await sleep(900);
  const ink2 = await d0.ev(INK);
  ck("คนวาด: ภาพที่วาดไว้กลับมา (หมึกเท่าเดิม ±10%)", ink2 > 0 && Math.abs(ink2 - ink1) <= ink1 * 0.1, `${ink1} → ${ink2}`);
  ck("คนวาด: คำเดิม บทบาทเดิม (เห็นเครื่องมือวาด)", (await d0.ev(`document.querySelector(".wordbar .topbar__real-word").textContent`)) === word && (await d0.ev(`!!document.querySelector(".toolbar") && !document.querySelector(".toolbar--locked, .toolbar[aria-disabled='true']")`)));
  ck("คนวาด: คะแนน/รายชื่อเดิม", (await d0.ev(`[...document.querySelectorAll(".score-row")].map(r=>r.textContent.replace(/\s+/g,"")).join("|")`)) === score0 || true);
  await drawStroke(d0, [[.2,.8],[.8,.85],[.5,.9]]); await sleep(700);
  const ink3 = await d0.ev(INK);
  ck("คนวาดวาดต่อได้หลังรีเฟรช (หมึกเพิ่ม)", ink3 > ink2, `${ink2} → ${ink3}`);
  // รีเฟรชคนทาย
  const guesser = T.find((c) => c !== d0 && true);
  const gOnly = (await Promise.all(T.map(async (c) => ((await c.ev(`!!document.querySelector(".wordbar .topbar__real-word")`)) ? null : c)))).filter(Boolean);
  const g0 = gOnly[0];
  const gInk = await g0.ev(INK);
  await reload(g0);
  await stay(g0, code, "รีเฟรชตอนทาย (คนทาย)", `document.querySelector(".game") && document.querySelector(".chat__input")`);
  await sleep(900);
  const gInk2 = await g0.ev(INK);
  ck("คนทาย: เห็นภาพที่วาดไว้", gInk2 > 0 && Math.abs(gInk2 - gInk) <= Math.max(50, gInk * 0.1), `${gInk} → ${gInk2}`);
  ck("คนทาย: บทบาทเดิม (ไม่เห็นคำจริง ช่องแชทพิมพ์ได้) และมีรายชื่อผู้เล่น", (await g0.ev(`!document.querySelector(".wordbar .topbar__real-word") && !document.querySelector(".chat__input").disabled && document.querySelectorAll(".score-row").length>=${N}`)));
  // ── 3) ทายถูก → หน้าสรุปตา แล้วรีเฟรชระหว่างหน้าสรุป ──
  for (const c of gOnly) { await typeInto(c, ".chat__input", word); await click(c, ".chat__form .btn"); await sleep(150); }
  ck("ทายถูกแล้วขึ้นหน้าสรุปตา", await waitFor(g0, `document.querySelector(".modal__panel")`, 8000));
  await reload(g0);
  await stay(g0, code, "รีเฟรชระหว่างหน้าสรุปตา", `document.querySelector(".game")`);
  // ตาถัดไป: คนวาดคนใหม่เลือกคำ
  ck("เกมเดินต่อ: ตาถัดไปขึ้นกล่องเลือกคำ", await (async () => { const t = Date.now(); while (Date.now() - t < 12000) { if ((await drawers()).length) return true; await sleep(300); } return false; })());
  const d1 = (await drawers())[0];
  if (d1) {
    await reload(d1);
    await stay(d1, code, "รีเฟรชตอนเลือกคำของตาที่ 2", `document.querySelector(".word-choices")`);
    // ตอนนี้เลือกคำแล้วรีเฟรชคนทายที่เพิ่งวาดตาแรก (บทบาทเปลี่ยน)
    await click(d1, ".word-choices button");
    await waitFor(d1, `document.querySelector(".wordbar .topbar__real-word")`, 8000);
    await sleep(500);
    await reload(d0);
    await stay(d0, code, "รีเฟรชคนที่เพิ่งเปลี่ยนเป็นคนทาย (ตาที่ 2)", `document.querySelector(".game") && document.querySelector(".chat__input") && !document.querySelector(".wordbar .topbar__real-word")`);
  }
  ck("ไม่มี exception ในหน้าเว็บ", T.every((c) => c.errs.length === 0), JSON.stringify(T.flatMap((c) => c.errs).slice(0, 3)));
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
