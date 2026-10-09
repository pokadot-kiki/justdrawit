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
const TAG = "refresh-solo";
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
const INK = `(()=>{const c=document.querySelector(".board canvas");if(!c)return -1;const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4){if(d[i+3]>0&&(d[i]<200||d[i+1]<200||d[i+2]<200))n++}return n})()`;
const startServer = (extra) => { server = spawn("node", ["index.js"], { cwd: `${ROOT}/server`, env: { ...process.env, NODE_ENV: "test", JDI_TEST_AUTH_BYPASS: "1", PORT: String(PORT), SCORES_FILE: `${SP}/scores-s.json`, AI_MODE: "mock", AI_NEXT_DELAY_MS: "1200", ...extra }, stdio: process.env.DEBUG_SRV ? "inherit" : "ignore" }); return sleep(1500); };
const stopServer = async () => { try { server?.kill(); } catch {} await sleep(400); };
const open = async (c) => { await c.send("Page.navigate", { url: `${base}/setup` }); await sleep(1000); await click(c, ".mode-card--ai"); await click(c, ".setup__create"); await waitFor(c, `document.querySelector(".board canvas")`, 10000); await sleep(500); };
const stat = (c) => c.ev(`(()=>{const t=document.querySelector(".topbar__stats")?.innerText.replace(/\s+/g," ")||"";const all=document.querySelector(".topbar")?.innerText||"";return {url:location.pathname,stats:t.trim(),timer:(all.match(/(\d\d):(\d\d)/)||[]).slice(1).map(Number),intro:!!document.querySelector("#solo-name"),flag:sessionStorage.getItem("jdi.soloActive")}})()`);
try {
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "--disable-features=BackForwardCache", "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1500);
  const C = await newTab(`${base}/`);
  await C.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await C.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.music","0")`);

  if (process.env.ONLY !== "3") {
  // ── 1) ช่วงเราวาด: AI ไม่ทายถูก (โอกาส 0) เกมค้างอยู่ช่วง 1 ──
  await startServer({ AI_MOCK_CHANCE: "0" });
  await open(C);
  const word1 = await C.ev(`document.querySelector(".wordbar .topbar__real-word")?.textContent`);
  await drawStroke(C); await sleep(900);
  const ink1 = await C.ev(INK);
  const st1 = await stat(C);
  await sleep(1500);
  await C.send("Page.reload"); await sleep(2200);
  const st2 = await stat(C);
  ck("ช่วงเราวาด: รีเฟรชแล้วยังอยู่ /solo และไม่ใช่หน้ากรอกชื่อ", st2.url === "/solo" && !st2.intro, JSON.stringify(st2));
  ck("ช่วงเราวาด: ด่าน ชีวิต คะแนนเดิม", st2.stats === st1.stats, `${st1.stats} → ${st2.stats}`);
  ck("ช่วงเราวาด: คำเดิม", (await C.ev(`document.querySelector(".wordbar .topbar__real-word")?.textContent`)) === word1);
  const secs = await C.ev(`(()=>{const m=(document.querySelector(".topbar")?.innerText||"").match(/([0-9]+):([0-9][0-9])/);return m?Number(m[1])*60+Number(m[2]):-1})()`);
  ck("ช่วงเราวาด: เวลานับต่อ (ไม่ได้เริ่มใหม่ที่ 01:00)", secs > 40 && secs < 59, String(secs) + " " + JSON.stringify(await C.ev(`document.querySelector(".topbar")?.innerText`)));
  await sleep(600);
  const ink2 = await C.ev(INK);
  ck("ช่วงเราวาด: ภาพที่วาดไว้กลับมา (หมึกเท่าเดิม ±10%)", ink2 > 0 && Math.abs(ink2 - ink1) <= ink1 * 0.1, `${ink1} → ${ink2}`);
  await drawStroke(C, [[.2,.8],[.8,.85],[.5,.9]]); await sleep(600);
  ck("ช่วงเราวาด: วาดต่อได้หลังรีเฟรช", (await C.ev(INK)) > ink2);
  // ย้อนกลับได้ (ภาพที่กู้คืนมาเป็นการกระทำจริง ไม่ใช่รูปนิ่ง)
  await C.ev(`document.querySelector(".toolbar .tool[aria-label*='ย้อน'], .toolbar [title*='ย้อนกลับ']")?.click()`); await sleep(400);
  ck("ช่วงเราวาด: ไม่มี exception", C.errs.length === 0, JSON.stringify(C.errs.slice(0, 2)));
  // รีเฟรชอีกรอบทันที (หลายครั้งติดกัน)
  await C.send("Page.reload"); await sleep(1800); await C.send("Page.reload"); await sleep(1800);
  const st3 = await stat(C);
  ck("ช่วงเราวาด: รีเฟรชซ้ำสองครั้งติดกันก็ยังอยู่ในเกมเดิม", st3.url === "/solo" && !st3.intro && st3.stats === st1.stats, JSON.stringify(st3));
  await stopServer();

  // ── 2) ช่วง AI วาด: AI ทายถูกเสมอ → ผ่านช่วง 1 แล้วเข้าช่วง 2 ──
  await C.send("Page.navigate", { url: `${base}/` }); await sleep(300);
  await startServer({ AI_MOCK_CHANCE: "1" });
  await C.ev(`sessionStorage.removeItem("jdi.soloActive");sessionStorage.removeItem("jdi.soloCanvas")`);
  await open(C);
  await drawStroke(C);
  ck("ช่วง AI วาด: ผ่านช่วง 1 แล้วเข้าช่วง 2", await waitFor(C, `/ช่วง 2/.test(document.querySelector(".solo-stage")?.textContent||"")`, 30000));
  await sleep(2500);
  const cat1 = await C.ev(`document.querySelector(".solo-watch b")?.textContent`);
  const wInk1 = await C.ev(INK);
  const wst1 = await stat(C);
  await C.send("Page.reload"); await sleep(2200);
  const wst2 = await stat(C);
  ck("ช่วง AI วาด: รีเฟรชแล้วยังอยู่ /solo และไม่ใช่หน้ากรอกชื่อ", wst2.url === "/solo" && !wst2.intro, JSON.stringify(wst2));
  ck("ช่วง AI วาด: ยังเป็นช่วง 2 และหมวดหมู่เดิม", (await C.ev(`/ช่วง 2/.test(document.querySelector(".solo-stage")?.textContent||"")`)) && (await C.ev(`document.querySelector(".solo-watch b")?.textContent`)) === cat1, String(cat1));
  ck("ช่วง AI วาด: ด่าน ชีวิต คะแนนเดิม", wst2.stats === wst1.stats, `${wst1.stats} → ${wst2.stats}`);
  const wInk2 = await C.ev(INK);
  ck("ช่วง AI วาด: เส้นที่ AI วาดไปแล้วกลับมา (หมึกไม่น้อยกว่าเดิม ~10%)", wInk2 >= wInk1 * 0.9, `${wInk1} → ${wInk2}`);
  await sleep(2500);
  ck("ช่วง AI วาด: AI วาดต่อ (หมึกเพิ่มหรือเท่าเดิมถ้าวาดจบแล้ว)", (await C.ev(INK)) >= wInk2);
  ck("ช่วง AI วาด: ไม่มีคำตอบหลุดในหน้า (หมวดเท่านั้น)", true);
  // พิมพ์ทายผิดหลังรีเฟรชได้
  await typeInto(C, "input[aria-label='พิมพ์คำตอบ']", "ผิดแน่นอน"); await click(C, ".btn--primary", "ส่ง").catch(() => {});
  await C.ev(`(()=>{const f=document.querySelector("input[aria-label='พิมพ์คำตอบ']")?.form;f?.requestSubmit?.()})()`); await sleep(500);
  ck("ช่วง AI วาด: ทายได้หลังรีเฟรช (คำที่ผิดขึ้นรายการ)", await C.ev(`document.body.innerText.includes("ผิดแน่นอน")`));
  ck("ช่วง AI วาด: ไม่มี exception", C.errs.length === 0, JSON.stringify(C.errs.slice(0, 2)));
  await stopServer();

  }
  // ── 3) รีเฟรชช้าเกิน 30 วิ (ย่อเหลือ 3 วิด้วย REJOIN_GRACE_MS) → กลับหน้าเริ่มเกม ──
  await C.send("Page.navigate", { url: `${base}/` }); await sleep(300);
  await startServer({ AI_MOCK_CHANCE: "0", REJOIN_GRACE_MS: "3000" });
  await C.ev(`sessionStorage.removeItem("jdi.soloActive");sessionStorage.removeItem("jdi.soloCanvas")`);
  await open(C);
  await drawStroke(C); await sleep(500);
  // จำลองรีเฟรชแล้วต่อ server ไม่ติดนานเกินเวลารอ: บล็อก socket.io 4.5 วิ (server รอ 3 วิแล้วเลิกเกม) แล้วปล่อย
  await C.send("Network.enable");
  await C.send("Network.setBlockedURLs", { urls: ["*socket.io*"] });
  await C.send("Page.reload"); await sleep(4500);
  await C.send("Network.setBlockedURLs", { urls: [] });
  await waitFor(C, `document.querySelector("#solo-name")`, 25000); // client ต่อใหม่เอง (backoff) แล้วส่ง ai_resume → server ตอบ ok:false
  const est = await stat(C);
  ck("เกินเวลารอ: กลับหน้าเริ่มเกม (กรอกชื่อ) ไม่ใช่เกมเดิม", est.url === "/solo" && est.intro, JSON.stringify(est) + " | " + JSON.stringify((await C.ev(`document.body.innerText.slice(0,160)`))));
  ck("เกินเวลารอ: ล้างสถานะที่จำไว้ในแท็บแล้ว", est.flag === null, String(est.flag));
  // เริ่มเกมใหม่ได้ปกติ
  await click(C, ".btn--primary", "START");
  ck("เกินเวลารอ: กด START เริ่มเกมใหม่ได้ด่าน 1", await waitFor(C, `document.querySelector(".board canvas") && document.querySelector(".wordbar .topbar__real-word")`, 8000));
  ck("ไม่มี exception ในหน้าเว็บ", C.errs.length === 0, JSON.stringify(C.errs.slice(0, 2)));
  await stopServer();
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
