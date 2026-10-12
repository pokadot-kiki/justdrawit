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
const TAG = "solo-wordbar";
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
// ตรวจแถบคำ + กล่องขวาของ Solo ทุกช่วง: ช่วง 1 โชว์คำที่ต้องวาด · ช่วง 2 โชว์หมวด/คำใบ้เท่านั้น · ขึ้นด่านใหม่ไม่มีของเก่าค้าง
const view = (c) => c.ev(`(()=>{const q=s=>document.querySelector(s);return {
  real:q(".wordbar .topbar__real-word")?.textContent??null,
  bar:(q(".wordbar")?.innerText||"").replace(/\\s+/g," ").trim(),
  cat:q(".solo-watch b")?.textContent??null,
  stage:q(".solo-stage")?.textContent??null,
  box:q(".game__answers .panel__title")?.textContent??null,
  guess:q(".ai-box__guess")?.textContent?.trim()??null,
  past:q(".ai-box__past")?.textContent??null,
  modal:q(".modal__panel .answer")?.textContent??null,
  tools:!!q(".game__tools")}})()`);
try {
  server = spawn("node", ["index.js"], { cwd: `${ROOT}/server`, env: { ...process.env, PORT: String(PORT), SCORES_FILE: `${SP}/scores-w.json`, AI_MODE: "mock", AI_MOCK_CHANCE: "1", AI_TIME_OVERRIDE: "14", AI_NEXT_DELAY_MS: "1500" }, stdio: "ignore" });
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "--disable-features=BackForwardCache", "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1500);
  await sleep(1500);
  const C = await newTab(`${base}/`);
  await C.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await C.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.music","0")`);
  await C.send("Page.navigate", { url: `${base}/setup` }); await sleep(1000);
  await click(C, ".mode-card--ai"); await click(C, ".setup__create");
  await waitFor(C, `document.querySelector(".board canvas") && document.querySelector(".wordbar .topbar__real-word")`, 10000);
  await sleep(400);

  // ── ด่าน 1 ช่วง 1 (เราวาด) ──
  const v1 = await view(C);
  const word1 = v1.real;
  ck("ช่วง 1: แถบคำโชว์คำที่ต้องวาด ไม่มีหมวด", !!word1 && v1.cat === null && /ช่วง 1/.test(v1.stage || ""), JSON.stringify(v1));
  ck("ช่วง 1: กล่องขวาเป็น 'AI คิดว่า...' และยังไม่มีคำทายค้าง", v1.box === "AI คิดว่า..." && v1.guess === null && v1.past === null && v1.tools, JSON.stringify(v1));
  await drawStroke(C); await sleep(1500);
  // รีเฟรชกลางช่วง 1 (ก่อน AI เดา) → ข้อมูลต้องถูกช่วง
  await C.send("Page.reload"); await sleep(2200);
  const v1r = await view(C);
  ck("ช่วง 1 หลังรีเฟรช: แถบคำยังเป็นคำที่ต้องวาดของช่วงนี้ ไม่มีหมวด/ของช่วง 2", v1r.real === word1 && v1r.cat === null && /ช่วง 1/.test(v1r.stage || "") && v1r.box === "AI คิดว่า..." && v1r.tools, JSON.stringify(v1r));
  await shot(C, "solo-stage1");
  await waitFor(C, `document.querySelector(".ai-box__guess")`, 12000);
  const v1b = await view(C);
  ck("ช่วง 1: AI เดาแล้วกล่องขวาโชว์คำทายของช่วงนี้ แถบคำยังเป็นคำเดิม", v1b.guess !== null && v1b.real === word1, JSON.stringify(v1b));

  // ── หน้าต่างผลช่วง 1 (rest kind draw): เฉลยคือคำที่วาด ──
  ck("ผลช่วง 1: ขึ้นหน้าต่างเฉลย", await waitFor(C, `document.querySelector(".modal__panel .answer")`, 15000));
  const v1m = await view(C);
  ck("ผลช่วง 1: เฉลยตรงกับคำที่วาด และแถบคำยังเป็นคำช่วง 1", v1m.modal === word1 && v1m.real === word1, JSON.stringify(v1m));

  // ── ช่วง 2 (AI วาด) ──
  ck("ช่วง 2: เริ่มแล้ว", await waitFor(C, `/ช่วง 2/.test(document.querySelector(".solo-stage")?.textContent||"") && !document.querySelector(".modal__panel")`, 20000));
  await sleep(800);
  const v2 = await view(C);
  ck("ช่วง 2: แถบคำโชว์หมวดเท่านั้น ไม่มีคำของช่วง 1", v2.real === null && v2.cat !== null && !v2.bar.includes(word1), JSON.stringify(v2));
  ck("ช่วง 2: กล่องขวาเป็น 'พิมพ์คำตอบ' ไม่มีคำทายของ AI ช่วง 1 ค้าง และซ่อนเครื่องมือ", v2.box === "พิมพ์คำตอบ" && v2.guess === null && v2.past === null && !v2.tools, JSON.stringify(v2));
  await shot(C, "solo-stage2");
  const cat2 = v2.cat;
  await C.send("Page.reload"); await sleep(2200);
  const v2r = await view(C);
  ck("ช่วง 2 หลังรีเฟรช: แถบคำยังเป็นหมวดเดิม ไม่มีคำของช่วง 1 · กล่องขวาถูกช่วง", v2r.real === null && v2r.cat === cat2 && !v2r.bar.includes(word1) && v2r.box === "พิมพ์คำตอบ" && v2r.guess === null, JSON.stringify(v2r));

  // ── หมดเวลาช่วง 2: หน้าต่างเฉลยของช่วง 2 แต่แถบคำ/กล่องขวาต้องยังเป็นของช่วง 2 (ไม่ย้อนไปโชว์คำช่วง 1) ──
  ck("ผลช่วง 2: ขึ้นหน้าต่างเฉลย", await waitFor(C, `document.querySelector(".modal__panel .answer")`, 25000));
  const v2m = await view(C);
  ck("ผลช่วง 2: เฉลยเป็นคำของภาพ (ไม่ใช่คำช่วง 1) · แถบคำไม่โชว์คำช่วง 1", !!v2m.modal && v2m.modal !== word1 && v2m.real === null && !v2m.bar.includes(word1), JSON.stringify(v2m));
  ck("ผลช่วง 2: กล่องขวายังเป็นของช่วง 2 (พิมพ์คำตอบ) ไม่ใช่ 'AI คิดว่า' ของช่วง 1", v2m.box === "พิมพ์คำตอบ" && v2m.guess === null && v2m.past === null, JSON.stringify(v2m));

  // ── ขึ้นด่าน 2: ของช่วง 2 ต้องหายหมด ──
  ck("ด่าน 2: เริ่มช่วง 1 ใหม่ (มีแถบคำที่ต้องวาด)", await waitFor(C, `document.querySelector(".wordbar .topbar__real-word") && !document.querySelector(".modal__panel")`, 15000));
  await sleep(500);
  const v3 = await view(C);
  ck("ด่าน 2: แถบคำเป็นคำใหม่ ไม่มีหมวด/คำของช่วง 2 ค้าง", !!v3.real && v3.cat === null && !v3.bar.includes(v2m.modal) && /ช่วง 1/.test(v3.stage || ""), JSON.stringify(v3));
  ck("ด่าน 2: กล่องขวาเป็น 'AI คิดว่า...' สะอาด (ไม่มีคำทายของด่านก่อน) และมีเครื่องมือ", v3.box === "AI คิดว่า..." && v3.guess === null && v3.past === null && v3.tools, JSON.stringify(v3));
  await shot(C, "solo-level2");
  ck("ไม่มี exception", C.errs.length === 0, JSON.stringify(C.errs.slice(0, 2)));
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
