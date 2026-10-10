import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
// เทส Multiplayer vs AI ในเบราว์เซอร์จริง 2 แท็บ (Chrome headless ผ่าน CDP · --mute-audio) — ต้อง `cd client && npm run build` ก่อน
// เลือกโหมดจาก SET UP · ช่วง 1 วาดส่วนตัว AI ทายเป็นแชทของเจ้าของภาพ (ไม่เห็นภาพ/คำทายเพื่อน) · รีเฟรชกลางช่วง · แกลเลอรีเมื่อ AI ทายถูกครบ · ช่วง 2 แชทร่วม · ผลจบเกม
// เปิด server ทดสอบเองที่พอร์ต 3051 (ไม่แตะ server พอร์ต 3000) ปิด Chrome/server และลบโปรไฟล์ชั่วคราวเสมอตอนจบ
// ภาพหน้าจอเก็บในโฟลเดอร์ชั่วคราวของระบบ (พิมพ์ที่อยู่ตอนจบ) · ตั้ง CHROME_BIN ถ้า Chrome ไม่ได้อยู่ที่ตำแหน่งมาตรฐาน
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const SP = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-browser-shots-"));
const [W, H_] = (process.argv[2] || "390x844").split("x").map(Number);
const TAG = `${W}x${H_}-mpai`;
const PROFILE = path.join(os.tmpdir(), "jdi-chrome-" + process.pid);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 3051, DBG = 9351;
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
  await c.send("Emulation.setDeviceMetricsOverride", { width: W, height: H_, deviceScaleFactor: 1, mobile: W < 700 });
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
const drawStroke = async (c) => {
  await act(c);
  const r = await c.ev(`(()=>{const e=document.querySelector(".board canvas");e.scrollIntoView({block:"center"});const b=e.getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  if (!r) return false;
  await sleep(200);
  const r2 = await c.ev(`(()=>{const b=document.querySelector(".board canvas").getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height}})()`);
  const p = (fx, fy) => ({ x: r2.x + r2.w * fx, y: r2.y + r2.h * fy });
  const pts = [[.3,.3],[.7,.3],[.7,.7],[.3,.7],[.3,.3]].map(([a,b]) => p(a,b));
  await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pts[0].x, y: pts[0].y, button: "left", clickCount: 1 });
  for (const q of pts.slice(1)) await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: q.x, y: q.y, button: "left", buttons: 1 });
  await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pts.at(-1).x, y: pts.at(-1).y, button: "left", clickCount: 1 });
  return true;
};

const base = `http://localhost:${PORT}`;
const INK = `(()=>{const c=document.querySelector(".board canvas");if(!c)return -1;const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=16)if(d[i]<200||d[i+1]<200||d[i+2]<200)n++;return n})()`;
const words = JSON.parse(fs.readFileSync(`${ROOT}/server/data/ai-words.json`, "utf8"));
const WORD = words.easy[0];
const DRAWINGS = `${SP}/one-drawing.json`;
fs.writeFileSync(DRAWINGS, JSON.stringify({ [WORD.en]: [[[0.2, 0.2, 0.8, 0.8], [0.2, 0.8, 0.8, 0.2], [0.5, 0.1, 0.5, 0.9]]] }));
try {
  server = spawn("node", ["index.js"], { cwd: `${ROOT}/server`, env: { ...process.env, PORT: String(PORT), SCORES_FILE: `${SP}/scores-mp.json`, AI_MODE: "mock", AI_MOCK_CHANCE: "1", AI_MOCK_CONFIDENCE: "0.8", AI_DRAWINGS_FILE: DRAWINGS, MPAI_TIME_OVERRIDE: "25", MPAI_GALLERY_MS: "2500", MPAI_REST_MS: "1500", LOBBY_RETURN_MS: "30000" }, stdio: "ignore" });
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1500);
  const H = await newTab(`${base}/`), G = await newTab(`${base}/`);
  for (const c of [H, G]) await c.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.music","0")`);

  // ── เลือกโหมดจาก SET UP ──
  await H.send("Page.navigate", { url: `${base}/setup` });
  await waitFor(H, `document.querySelector(".ai-panel .mode-card--mpai")`); // รอหน้าพร้อมจริง ไม่ใช่รอเวลาตายตัว (เครื่องช้าแล้วคลิกพลาด)
  ck("SET UP มีการ์ด MULTIPLAYER VS AI ในกล่อง 'แข่งกับ AI'", await click(H, ".ai-panel .mode-card", "MULTIPLAYER VS AI"));
  await sleep(200);
  ck("เลือกแล้วยังตั้งรอบ/เวลา/ประเภทห้องได้ (เป็นห้อง)", await H.ev(`/จำนวนรอบ/.test(document.querySelector(".setup__opts").innerText) && /ประเภทห้อง/.test(document.querySelector(".setup__opts").innerText)`));
  await sweep(H, "SET UP เลือก Multiplayer vs AI", "setup");
  await click(H, ".setup__create");
  ck("สร้างห้องได้", await waitFor(H, `document.querySelector(".screen--lb")`));
  const code = await H.ev(`document.querySelector(".lb-codechip b")?.textContent`);
  ck("ห้องรอ: โหมดที่เลือกคือ 'แข่งกับ AI'", await H.ev(`[...document.querySelectorAll(".lb-set")][0].querySelector(".seg--active")?.textContent.includes("แข่งกับ AI")`));
  ck("ห้องรอ: Mini Challenge อยู่ใต้ตั้งค่าและคอลัมน์ซ้ายเลื่อนได้เมื่อเนื้อหาสูง", await H.ev(`(()=>{const left=document.querySelector(".lb-left"),settings=document.querySelector(".lb-settings"),challenge=document.querySelector(".lb-chal");return !!left&&!!settings&&!!challenge&&settings.getBoundingClientRect().bottom<=challenge.getBoundingClientRect().top&&((left.scrollHeight>left.clientHeight)?getComputedStyle(left).overflowY==="auto":true)})()`));
  await G.send("Page.navigate", { url: `${base}/?room=${code}` });
  await waitFor(G, `document.querySelector(".modal .btn--primary:not([disabled])")`);
  await click(G, ".modal .btn--primary");
  ck("เพื่อนเข้าห้องได้", await waitFor(G, `document.querySelector(".screen--lb")`));
  // ตั้ง 1 รอบ: หากล่องตั้งค่าที่มีคำว่า "รอบ" (ไม่พึ่งลำดับกล่อง) แล้วกดปุ่ม 1
  await H.ev(`(()=>{const box=[...document.querySelectorAll(".lb-set")].find(b=>/รอบ/.test(b.querySelector(".lb-set__label")?.textContent||""));const btn=[...(box?.querySelectorAll(".seg")||[])].find(x=>x.textContent.trim()==="1");btn?.click();return !!btn})()`);
  await sleep(300);
  ck("ห้องรอ: ตั้ง 1 รอบได้", await H.ev(`(()=>{const box=[...document.querySelectorAll(".lb-set")].find(b=>/รอบ/.test(b.querySelector(".lb-set__label")?.textContent||""));return box?.querySelector(".seg--active")?.textContent.trim()==="1"})()`));
  await click(G, ".lb-bigbtn"); await sleep(400);
  await click(H, ".lb-bigbtn");
  ck("เริ่มเกม: ทั้งสองจอเข้าหน้า Multiplayer vs AI", (await Promise.all([H, G].map((c) => waitFor(c, `document.querySelector(".mp-ai")`, 8000)))).every(Boolean));
  await sleep(500);
  const wH = await H.ev(`document.querySelector(".wordbar .topbar__real-word")?.textContent`);
  const wG = await G.ev(`document.querySelector(".wordbar .topbar__real-word")?.textContent`);
  ck("ช่วง 1: ทั้งสองคนเห็นคำเดียวกัน", !!wH && wH === wG, `${wH} / ${wG}`);
  await sweep(H, "ช่วง 1 (วาด)", "draw");

  // ── วาดส่วนตัว: AI ดูภาพทุก 5 วิ (จังหวะเดียวกับ Solo) คำทายขึ้นเป็นแชทของเจ้าของภาพ ──
  await drawStroke(H); await drawStroke(G);
  await sleep(300);
  ck("วาดได้ (มีหมึกบนกระดานของตัวเอง)", (await H.ev(INK)) > 0 && (await G.ev(INK)) > 0);
  ck("ช่วง 1 ไม่มีปุ่มส่งภาพ (AI ดูเองเป็นระยะ)", !(await H.ev(`!!document.querySelector(".mp-ai__send")`)));
  ck("ก่อน AI ดู: บอกว่า AI จะดูภาพทุก 5 วินาที", await H.ev(`document.querySelector(".mp-ai__guesses")?.textContent.includes("ทุก 5 วินาที")`));
  // G รีเฟรชก่อน AI ทายภาพของ G (รีเฟรชสั้นๆ ต้องไม่ทำให้ช่วงจบ)
  await G.send("Page.reload"); await sleep(400);
  ck("รีเฟรชกลางช่วง 1: กลับมาหน้าเกมเดิม คำเดิม", await waitFor(G, `document.querySelector(".mp-ai") && document.querySelector(".wordbar .topbar__real-word")?.textContent===${JSON.stringify(wH)}`, 8000));
  ck("H: AI ทายถูก → แชทคำทาย 'ถูก!' และม่าน 'รอเพื่อน' (วาดต่อไม่ได้)", await waitFor(H, `document.querySelector(".mp-ai__guess--ok")?.textContent.includes(${JSON.stringify(wH)}) && document.querySelector(".mp-ai__eval")?.textContent.includes("+420")`, 9000));
  ck("H: เครื่องมือวาดถูกล็อกหลังเสร็จ", await H.ev(`!!document.querySelector(".game__tools .toolbar--locked, .game__tools [aria-disabled='true'], .game__tools button:disabled")`));
  await sleep(300);
  ck("G เห็นแค่ว่า H เสร็จแล้ว (1/2) ไม่เห็นคำทาย/ภาพของ H", await waitFor(G, `document.querySelector(".ai-box")?.textContent.includes("AI ทายถูกแล้ว 1/2")`, 4000) && !(await G.ev(`document.querySelectorAll(".mp-ai__guess--ok").length>0 || document.querySelectorAll("img").length>0`)));
  ck("ยังไม่ครบทุกคน → ยังไม่เปิดแกลเลอรี", !(await H.ev(`!!document.querySelector(".mp-gallery")`)));
  await sweep(H, "ช่วง 1 (เสร็จแล้ว รอเพื่อน)", "draw-done");
  await drawStroke(G);
  ck("AI ทายภาพ G ถูกครบทุกคน → แกลเลอรีมีภาพ 2 ภาพทั้งสองจอ", (await Promise.all([H, G].map((c) => waitFor(c, `document.querySelectorAll(".mp-gallery img").length===2`, 12000)))).every(Boolean));
  ck("แกลเลอรี: แสดงอวตาร ชื่อ ภาพจริง และผลรู้จำแบบสั้น", await H.ev(`document.querySelectorAll(".mp-gallery__name").length===2 && document.querySelectorAll(".mp-gallery__img img").length===2 && [...document.querySelectorAll(".mp-gallery__ai")].every(e=>e.textContent.includes("AI ทายถูก"))`));
  ck("แกลเลอรี: ไม่มีประวัติคำทายหรือคะแนน และการ์ดเราขอบฟ้าเท่านั้น", await H.ev(`(()=>{const me=document.querySelector(".mp-gallery__card--me"),ref=document.createElement("span");ref.style.color="var(--blue)";document.body.append(ref);const blue=getComputedStyle(ref).color;ref.remove();return !!me&&!document.querySelector(".mp-gallery__pts")&&!document.querySelector(".mp-gallery__card").textContent.includes("มั่นใจ")&&getComputedStyle(me).borderTopColor===blue&&getComputedStyle(me).boxShadow==="none"})()`));
  await sweep(H, "แกลเลอรี", "gallery");

  // ── ช่วง 2: แชทร่วม ──
  ck("ช่วง 2: แชทร่วมขึ้น", (await Promise.all([H, G].map((c) => waitFor(c, `document.querySelector(".mp-ai__chat .chat__input:not([disabled])")`, 6000)))).every(Boolean));
  ck("ช่วง 2: ไม่มีสถานะทายถูกแล้วซ้ำที่ท้าย sidebar", await H.ev(`!document.querySelector(".game__players .mp-ai__legend")`));
  ck("ช่วง 2: ไม่มีคำตอบบนจอก่อนเฉลย", !(await H.ev(`document.body.innerText.includes(${JSON.stringify(WORD.word)})`)));
  ck("ช่วง 2: AI วาดขึ้นบนกระดาน", await waitFor(H, `${INK} > 0`, 6000));
  await sweep(G, "ช่วง 2 (แชท)", "watch");
  const send = async (c, text) => { await act(c); await typeInto(c, ".mp-ai__chat .chat__input", text); await click(c, ".mp-ai__chat .chat__form button[type=submit]"); await sleep(250); };
  await send(G, "ผิดหนึ่ง"); await send(G, "ผิดสอง");
  const rowsH = await H.ev(`[...document.querySelectorAll(".mp-ai__chat .chat__row:not(.chat__row--system)")].map(r=>r.textContent.trim())`);
  ck("คำที่ทายผิดขึ้นที่ทุกจอพร้อมชื่อ เรียงตามลำดับ", rowsH.length >= 2 && /ผิดหนึ่ง/.test(rowsH.at(-2)) && /ผิดสอง/.test(rowsH.at(-1)), JSON.stringify(rowsH));
  await send(H, WORD.word);
  ck("H ทายถูก: ขึ้น 'ถูก! +คะแนน'", await waitFor(H, `/ถูก! \\+\\d+/.test(document.querySelector(".mp-ai__status")?.textContent||"")`, 3000));
  ck("G เห็น ****** + ข้อความระบบว่า H ทายถูก (ไม่เห็นคำ)", await waitFor(G, `document.querySelector(".mp-ai__chat").textContent.includes("******") && [...document.querySelectorAll(".mp-ai__chat .chat__row--system")].some(r=>r.textContent.includes("ทายถูก"))`, 3000) && !(await G.ev(`document.body.innerText.includes(${JSON.stringify(WORD.word)})`)));
  ck("คนแรกถูก ช่วง 2 ยังไม่จบ (G ยังพิมพ์ได้)", await G.ev(`!!document.querySelector(".mp-ai__chat .chat__input:not([disabled])") && !document.querySelector(".modal .answer")`));
  await send(G, WORD.word);
  ck("ทุกคนถูก → เฉลย", await waitFor(H, `document.querySelector(".modal .answer")?.textContent===${JSON.stringify(WORD.word)}`, 3000));
  ck("เฉลยแสดงเฉพาะคำตอบ ไม่มีรายชื่อหรือคะแนน", await H.ev(`(()=>{const m=document.querySelector(".modal__panel");return !!m&&m.querySelectorAll(".answer").length===1&&!m.querySelector(".mp-ai__solved")&&!/\\+\\d+/.test(m.textContent)})()`));
  ck("จบเกม: ตารางอันดับแยกคะแนนวาด/ทาย", (await Promise.all([H, G].map((c) => waitFor(c, `document.querySelector(".gains--split")?.textContent.includes("วาด 420")`, 6000)))).every(Boolean));
  ck("จบเกม: #2 ซ้าย #1 กลาง ความสูงถูกต้อง ไม่มีแท่น #3 เมื่อเล่นสองคน", await H.ev(`(()=>{const items=[...document.querySelectorAll(".podium__item")],a=items.find(e=>e.classList.contains("podium__item--1")),b=items.find(e=>e.classList.contains("podium__item--2"));return items.length===2&&!!a&&!!b&&!document.querySelector(".podium__item--3")&&b.getBoundingClientRect().left<a.getBoundingClientRect().left&&a.getBoundingClientRect().height>b.getBoundingClientRect().height&&!document.querySelector(".podium .you-tag")})()`));
  await sweep(H, "จบเกม", "gameover");
  ck("ไม่มี exception ในหน้าเว็บ", [H, G].every((c) => c.errs.length === 0), JSON.stringify([H, G].flatMap((c) => c.errs).slice(0, 3)));
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
