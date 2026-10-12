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
const TAG = "balance";
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
const SIZES = (process.env.SIZES || "1440x900,1366x768,1024x768,1180x740").split(",").map((x) => x.split("x").map(Number));
const R = (c, sel) => c.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {t:Math.round(r.top),b:Math.round(r.bottom),l:Math.round(r.left),r:Math.round(r.right),h:Math.round(r.height)}})()`);
const page = (c) => c.ev(`({sv:document.documentElement.scrollHeight-innerHeight,sh:document.documentElement.scrollWidth-innerWidth})`);
const resize = async (cs, w, h) => { for (const c of cs) await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(450); };
try {
  // คะแนนตัวอย่างให้ตาราง Leaderboard มีแถวให้เลื่อน
  // เกมเล่นกับเพื่อน 16 คะแนน (ชื่อสุดท้ายยาว) ให้ตารางมีแถวมากกว่าที่พอดีกับแผง
  execSync(`node -e 'const l=require("./leaderboard");const n=["Tar","Mew","Joy","Ploy","Bank","Fah","Ice","Nut","Beam","Pim","Oat","Kan","Ning","Gun","Max","ช้างน้อยซนน่ารักมาก"];n.forEach((x,i)=>l.saveScore({name:x,score:2000-i*90,levelReached:0,board:"multi"}))'`, { cwd: `${ROOT}/server`, env: { ...process.env, SCORES_FILE: `${SP}/scores-b.json` }, stdio: "ignore" });
  server = spawn("node", ["index.js"], { cwd: `${ROOT}/server`, env: { ...process.env, NODE_ENV: "test", JDI_TEST_AUTH_BYPASS: "1", PORT: String(PORT), SCORES_FILE: `${SP}/scores-b.json`, AI_MODE: "mock", AI_MOCK_CHANCE: "0", CHALLENGE_ODDS: "1", CHALLENGE_NO_PACING: "1", CHALLENGE_INTRO_MS: "0" }, stdio: "ignore" });
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1500);
  const H = await newTab(`${base}/`); const G = await newTab(`${base}/`);
  for (const c of [H, G]) { await c.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.teamRulesSeen","1");localStorage.setItem("jdi.music","0");localStorage.setItem("jdi.name","Joy")`); }

  // ── หน้าแรก ──
  await H.send("Page.navigate", { url: `${base}/` }); await sleep(1500);
  for (const [w, h] of SIZES) {
    await resize([H], w, h);
    const left = await R(H, ".lobby .home"), right = await R(H, ".lobby__board"), pg = await page(H);
    ck(`หน้าแรก ${w}×${h}: แผง Leaderboard สูงเท่าแผงซ้าย (ขอบบน/ล่างเสมอกัน ±2px)`, left && right && Math.abs(left.t - right.t) <= 2 && Math.abs(left.b - right.b) <= 2, JSON.stringify({ left, right }));
    ck(`หน้าแรก ${w}×${h}: ไม่เลื่อนหน้า`, pg.sv <= 0 && pg.sh <= 0, JSON.stringify(pg));
    const inner = await H.ev(`(()=>{const q=s=>document.querySelector(s);const sc=q(".lobby__board .board-panel__scroll"),b=q(".lobby__board").getBoundingClientRect();
      const head=q(".lobby__board .board-panel__head").getBoundingClientRect().top, tabs=q(".lobby__board .board-tabs").getBoundingClientRect().top;
      sc.scrollTop=sc.scrollHeight;
      const head2=q(".lobby__board .board-panel__head").getBoundingClientRect().top, tabs2=q(".lobby__board .board-tabs").getBoundingClientRect().top;
      const th=q(".lobby__board thead th").getBoundingClientRect().top-sc.getBoundingClientRect().top;
      const me=[...document.querySelectorAll(".lobby__board tbody tr")].find(r=>r.querySelector(".you-tag"));
      sc.scrollTop=0;
      return {scrollable:sc.scrollHeight>sc.clientHeight+1,inside:sc.getBoundingClientRect().bottom<=b.bottom+1,rows:document.querySelectorAll(".lobby__board tbody tr").length,fixed:head===head2&&tabs===tabs2,stickyHead:Math.abs(th)<=4,me:!!me,meText:me?.textContent.replace(/\s+/g," ").slice(0,40)}})()`);
    ck(`หน้าแรก ${w}×${h}: ตารางเลื่อนในกรอบ · หัว/เดือน/แท็บไม่เลื่อนตาม · หัวตารางค้าง`, inner.scrollable && inner.inside && inner.rows >= 10 && inner.fixed && inner.stickyHead, JSON.stringify(inner));
    ck(`หน้าแรก ${w}×${h}: แถวของเรามีป้าย "คุณ"`, inner.me, JSON.stringify(inner));
    const lbtn = await H.ev(`(()=>{const h=document.querySelector(".lobby .home").getBoundingClientRect();const bs=[...document.querySelectorAll(".home__buttons .big-btn")].map(b=>b.getBoundingClientRect());const last=Math.max(...bs.map(b=>b.bottom));return {gap:Math.round(h.bottom-last)}})()`);
    ck(`หน้าแรก ${w}×${h}: แผงซ้ายไม่มีที่ว่างโหว่ใต้ปุ่ม (≤ 30px = ขอบแผง)`, lbtn.gap <= 30, JSON.stringify(lbtn));
    await shot(H, `home-${w}x${h}`);
  }
  // ── ห้อง + เกม ──
  await H.send("Page.navigate", { url: `${base}/setup` }); await sleep(900);
  await click(H, ".setup__create"); await waitFor(H, `document.querySelector(".screen--lb")`);
  const code = await H.ev(`document.querySelector(".lb-codechip b")?.textContent`);
  await G.send("Page.navigate", { url: `${base}/?room=${code}` }); await sleep(900); await click(G, ".modal .btn--primary"); await waitFor(G, `document.querySelector(".screen--lb")`);
  await sleep(400); await click(G, ".lb-bigbtn"); await sleep(400); await click(H, ".lb-bigbtn");
  await waitFor(H, `document.querySelector(".word-choices")`, 8000); await click(H, ".word-choices button");
  await waitFor(H, `document.querySelector(".wordbar .topbar__real-word")`, 8000); await sleep(1200);
  for (const [w, h] of SIZES) {
    await resize([H, G], w, h);
    for (const [nm, c] of [["คนวาด", H], ["คนทาย", G]]) {
      const bar = await R(c, ".wordbar"), pl = await R(c, ".game__players"), bd = await R(c, ".board"), tb = await R(c, ".timebar"), sd = await R(c, ".game__side"), pg = await page(c);
      ck(`เกม ${w}×${h} ${nm}: แผงผู้เล่นเริ่มระดับเดียวกับแถบคำ (±2px)`, bar && pl && Math.abs(bar.t - pl.t) <= 2, JSON.stringify({ bar, pl }));
      ck(`เกม ${w}×${h} ${nm}: ขอบล่างผู้เล่น = ล่างแถบเวลา = ล่างแผงขวา (±3px)`, tb && pl && sd && Math.abs(pl.b - tb.b) <= 3 && Math.abs(sd.b - tb.b) <= 3, JSON.stringify({ pl, tb, sd }));
      ck(`เกม ${w}×${h} ${nm}: ไม่เลื่อนหน้า`, pg.sv <= 0 && pg.sh <= 0, JSON.stringify(pg));
    }
    await shot(H, `game-drawer-${w}x${h}`); await shot(G, `game-guesser-${w}x${h}`);
  }
  ck("ไม่มี exception", H.errs.length + G.errs.length === 0, JSON.stringify([...H.errs, ...G.errs].slice(0, 2)));
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
