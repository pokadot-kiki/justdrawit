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
const TAG = "cursor";
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
  const ev = async (expr) => (await Promise.race([send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }), sleep(10000).then(() => ({ result: { result: { value: undefined } } }))])).result?.result?.value;
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
// ถอดรูปเคอร์เซอร์จากค่า CSS cursor ในหน้าเว็บ: ขนาดรูป hotspot และพิกเซลจริง
const decode = async (c, sel = ".board") => { await act(c); return c.ev(`(async()=>{
  const cur=getComputedStyle(document.querySelector(${JSON.stringify(sel)})).cursor;
  const m=/^url\\("?(data:image\\/png;base64,[^")]+)"?\\)\\s+(\\d+)\\s+(\\d+),\\s*crosshair$/.exec(cur);
  if(!m)return {cur:cur.slice(0,60),ok:false};
  const img=new Image();await new Promise(r=>{img.onload=r;img.onerror=r;img.src=m[1]});
  const k=document.createElement("canvas");k.width=img.width;k.height=img.height;const x=k.getContext("2d");x.drawImage(img,0,0);
  const d=x.getImageData(0,0,k.width,k.height).data;let black=0,white=0,opaque=0;
  for(let i=0;i<d.length;i+=4){if(d[i+3]>60){opaque++;if(d[i]<110&&d[i+1]<110&&d[i+2]<110)black++;if(d[i]>200&&d[i+1]>200&&d[i+2]>200)white++}}
  const mid=(img.height>>1)*img.width*4+(img.width>>1)*4;
  return {ok:true,w:img.width,h:img.height,hx:+m[2],hy:+m[3],black,white,opaque,centerAlpha:d[mid+3],url:m[1].slice(-40),full:m[1]}})()`); };
const setSize = (c, v) => c.ev(`(()=>{const i=document.querySelector("input[aria-label='ขนาดแปรง']");const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;s.call(i,${v});i.dispatchEvent(new Event("input",{bubbles:true}));i.dispatchEvent(new Event("change",{bubbles:true}))})()`);
const tool = async (c, label) => { const r = await c.ev(`(()=>{const b=document.querySelector(${JSON.stringify('.toolbar button[aria-label="' + label + '"]')});if(!b)return false;b.click();return true})()`); if (!r) console.log("(ไม่พบปุ่มเครื่องมือ)", label); return r; };
try {
  server = spawn("node", ["index.js"], { cwd: `${ROOT}/server`, env: { ...process.env, PORT: String(PORT), SCORES_FILE: `${SP}/scores-c.json`, AI_MODE: "mock", AI_MOCK_CHANCE: "0", CHALLENGE_ODDS: "0" }, stdio: "ignore" });
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1500);
  const H = await newTab(`${base}/`); const G = await newTab(`${base}/`);
  for (const c of [H, G]) { await c.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await c.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.music","0")`); }
  await H.send("Page.navigate", { url: `${base}/setup` }); await sleep(1000);
  await click(H, ".setup__create"); await waitFor(H, `document.querySelector(".screen--lb")`);
  const code = await H.ev(`document.querySelector(".lb-codechip b")?.textContent`);
  await G.send("Page.navigate", { url: `${base}/?room=${code}` }); await sleep(900); await click(G, ".modal .btn--primary"); await waitFor(G, `document.querySelector(".screen--lb")`);
  await sleep(400); await click(G, ".lb-bigbtn"); await sleep(400); await click(H, ".lb-bigbtn");
  await waitFor(H, `document.querySelector(".word-choices")`, 8000); await click(H, ".word-choices button");
  await waitFor(H, `document.querySelector(".board--draw")`, 8000); await sleep(600);

  // ปากกา
  await setSize(H, 12); await sleep(150);
  const p12 = await decode(H); const preview = { "ปากกา 12": p12.full };
  ck("ปากกา: เคอร์เซอร์เป็นรูป PNG + จุดปลาย + crosshair สำรอง", p12.ok === true, JSON.stringify(p12));
  ck("ปากกา: รูปไม่เกิน 32×32 · จุดปลายอยู่กลางวงกลม · กลางวงโปร่ง", p12.w <= 32 && p12.h <= 32 && p12.hx === p12.w / 2 && p12.hy === p12.h / 2 && p12.centerAlpha === 0, JSON.stringify(p12));
  ck("ปากกา: มีทั้งเส้นดำและเส้นขาว (เห็นชัดทั้งพื้นขาวและพื้นเข้ม)", p12.black > 10 && p12.white > 10, JSON.stringify(p12));
  await setSize(H, 4); await sleep(150);
  const p4 = await decode(H); preview["ปากกา 4"] = p4.full;
  await setSize(H, 40); await sleep(150);
  const p40 = await decode(H); preview["ปากกา 40 (เพดาน)"] = p40.full;
  ck("ปากกา: วงกลมโตตามขนาดแปรง (4 < 12 < 40) และไม่เกิน 32 px แม้แปรงใหญ่สุด", p4.w < p12.w && p12.w < p40.w && p40.w <= 32 && p40.h <= 32, `${p4.w} ${p12.w} ${p40.w}`);
  await setSize(H, 2); await sleep(150);
  const p2 = await decode(H); preview["ปากกา 2 (เล็กสุด)"] = p2.full;
  ck("ปากกา: แปรงเล็กสุด (2px) ยังเห็นวงกลม (ไม่เล็กจนหาย)", p2.ok && p2.w >= 12 && p2.black > 5 && p2.white > 5, JSON.stringify(p2));
  await setSize(H, 12); await sleep(150);

  // ยางลบ = วงกลมแบบเดียวกับปากกาขนาดเดียวกัน
  await tool(H, "ยางลบ"); await sleep(150);
  const er = await decode(H);
  ck("ยางลบ: ใช้วงกลมแบบเดียวกับปากกา (ขนาดเดียวกัน)", er.ok && er.w === p12.w && er.url === p12.url, JSON.stringify(er));

  // ถังสี = คนละแบบ จุดปลายที่หยดสี
  await tool(H, "ถังสี"); await sleep(150);
  const bk = await decode(H); preview["ถังสี"] = bk.full;
  ck("ถังสี: เคอร์เซอร์ต่างจากปากกา/ยางลบ · ≤ 32×32 · จุดปลายไม่ใช่กลางรูป (อยู่ที่หยดสี)", bk.ok && bk.url !== p12.url && bk.w <= 32 && bk.h <= 32 && (bk.hx !== bk.w / 2 || bk.hy !== bk.h / 2) && bk.hx < bk.w && bk.hy < bk.h, JSON.stringify(bk));
  ck("ถังสี: มีขอบดำและขอบขาวชัด", bk.black > 20 && bk.white > 20, JSON.stringify(bk));
  await H.ev(`document.querySelector(".toolbar button[aria-label='สี']")?.scrollIntoView`);
  const red = await H.ev(`(()=>{const b=[...document.querySelectorAll(".toolbar button[title='แดง']")][0];if(!b)return false;b.click();return true})()`);
  await sleep(150);
  const bk2 = await decode(H); preview["ถังสี (สีแดง)"] = bk2.full;
  ck("ถังสี: เปลี่ยนสีแล้วรูปเปลี่ยนตาม (ตัวถังใช้สีที่เลือก)", red && bk2.ok && bk2.url !== bk.url, JSON.stringify([red, bk2.url, bk.url]));

  // รูปทรง = กากบาทของเราเอง
  const shapeLabel = await H.ev(`(()=>{const bs=[...document.querySelectorAll(".toolbar__group--tools button")].map(b=>b.getAttribute("aria-label"));return bs.find(l=>!["ปากกา","ยางลบ","ถังสี","ล้างจอ"].includes(l))})()`);
  await tool(H, shapeLabel); await sleep(150);
  const sh = await decode(H); preview["รูปทรง"] = sh.full;
  ck(`รูปทรง (${shapeLabel}): กากบาทดำ+ขาวของเราเอง ≤ 32×32 จุดปลายอยู่กลาง`, sh.ok && sh.w <= 32 && Math.abs(sh.hx - (sh.w - 1) / 2) <= 0.5 && Math.abs(sh.hy - (sh.h - 1) / 2) <= 0.5 && sh.black > 10 && sh.white > 10, JSON.stringify(sh));

  // วาดไม่ได้ = เคอร์เซอร์ปกติ
  const gcur = await G.ev(`getComputedStyle(document.querySelector(".board")).cursor`);
  ck("คนทาย (วาดไม่ได้): ใช้เคอร์เซอร์ปกติ ไม่ใช่ของเรา/crosshair", !/url\(|crosshair/.test(gcur), gcur.slice(0, 60));
  ck("ไม่มี exception", H.errs.length + G.errs.length === 0, JSON.stringify([...H.errs, ...G.errs].slice(0, 2)));
  // ภาพขยาย 8 เท่า บนพื้นขาว / เทา / ม่วง (ไว้ดูด้วยตาว่าเห็นชัดทุกพื้นไหม)
  await H.send("Page.navigate", { url: "about:blank" }); await sleep(300);
  await H.ev(`(()=>{const P=${JSON.stringify(preview)};document.body.style.cssText="margin:0;font:14px sans-serif";
    const row=(bg,fg)=>{const d=document.createElement("div");d.style.cssText="display:flex;gap:28px;padding:18px;align-items:flex-end;background:"+bg+";color:"+fg;
      for(const [k,v] of Object.entries(P)){const w=document.createElement("div");w.style.cssText="text-align:center";const i=new Image();i.src=v;i.style.cssText="image-rendering:pixelated;display:block;margin:0 auto 6px";i.onload=()=>{i.style.width=i.naturalWidth*6+"px"};w.appendChild(i);w.append(k+" ("+"px)");d.appendChild(w)}document.body.appendChild(d)};
    row("#ffffff","#222");row("#6b5bff","#fff");row("#2a2a3a","#fff");row("#ffd9a0","#222")})()`);
  await sleep(500);
  await shot(H, "cursor-preview");
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
