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
const TAG = `${W}x${H_}-o${ODDS}`;
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
  await c.send("Emulation.setDeviceMetricsOverride", { width: W, height: H_, deviceScaleFactor: 1, mobile: true });
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
try {
  server = spawn("node", ["index.js"], { cwd: `${ROOT}/server`, env: { ...process.env, NODE_ENV: "test", JDI_TEST_AUTH_BYPASS: "1", PORT: String(PORT), SCORES_FILE: `${SP}/scores-m.json`, AI_MODE: "mock", AI_MOCK_CHANCE: "1", AI_NEXT_DELAY_MS: "1200", CHALLENGE_ODDS: ODDS, CHALLENGE_NO_PACING: "1", LOBBY_RETURN_MS: "15000" }, stdio: "ignore" });
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1500);
  const H = await newTab(`${base}/`); const G = await newTab(`${base}/`);
  for (const c of [H, G]) { await c.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.teamRulesSeen","1");localStorage.setItem("jdi.music","0")`); }

  if (process.env.PART !== "room") {
    // ── หน้าทั่วไป ──
    await H.send("Page.navigate", { url: `${base}/` }); await sleep(1200); await sweep(H, "หน้าแรก", "home");
    await H.send("Page.navigate", { url: `${base}/setup` }); await sleep(1000); await sweep(H, "SET UP", "setup");
    await H.send("Page.navigate", { url: `${base}/leaderboard` }); await sleep(1200); await sweep(H, "Leaderboard", "board");
    // ── Solo ──
    await H.send("Page.navigate", { url: `${base}/setup` }); await sleep(1000);
    await click(H, ".mode-card--ai"); await sleep(200);
    await click(H, ".setup__create");
    ck("Solo: เริ่มด่านแล้วมีกระดานและแถบคำ", await waitFor(H, `document.querySelector(".board canvas") && document.querySelector(".wordbar .topbar__real-word")`, 10000));
    await sleep(600);
    await sweep(H, "Solo ช่วง 1 (เราวาด)", "solo-draw");
    const wordBox = await H.ev(`(()=>{const w=document.querySelector(".wordbar .topbar__real-word").getBoundingClientRect(),b=document.querySelector(".board").getBoundingClientRect(),bar=document.querySelector(".wordbar").getBoundingClientRect();return {wb:Math.round(w.bottom),bt:Math.round(b.top),barB:Math.round(bar.bottom),h:Math.round(w.height)}})()`);
    ck("Solo: คำที่ต้องวาดอยู่เหนือกระดาน (ไม่ตกหลังกระดาน)", wordBox.wb <= wordBox.bt + 1 && wordBox.wb <= wordBox.barB + 1, JSON.stringify(wordBox));
    await drawStroke(H);
    ck("Solo: AI คิดแล้วโชว์ผลด่าน", await waitFor(H, `document.querySelector(".modal__panel")`, 20000));
    await sleep(500); await sweep(H, "Solo หน้าต่างผลด่าน", "solo-result");
    ck("Solo: ขึ้นช่วง 2 (AI วาด เราทาย)", await waitFor(H, `/ช่วง 2/.test(document.querySelector(".solo-stage")?.textContent||"")`, 25000));
    await sleep(1500);
    await sweep(H, "Solo ช่วง 2 (AI วาด)", "solo-watch");
    const wb2 = await H.ev(`(()=>{const bar=document.querySelector(".wordbar").getBoundingClientRect();const b=document.querySelector(".board").getBoundingClientRect();return {barB:Math.round(bar.bottom),bt:Math.round(b.top),h:Math.round(bar.height)}})()`);
    ck("Solo ช่วง 2: แถบคำอยู่เหนือกระดาน", wb2.barB <= wb2.bt + 1, JSON.stringify(wb2));
    await H.send("Page.navigate", { url: `${base}/` }); await sleep(800);
  }

  // ── ห้องเกมปกติ 2 คน ──
  await H.send("Page.navigate", { url: `${base}/setup` }); await sleep(1000);
  await click(H, ".setup__opts .seg", "1"); // รอบ (ปุ่มแรกที่มีข้อความ 1)
  await click(H, ".setup__create");
  ck("เข้าห้องรอ (หัวห้อง)", await waitFor(H, `document.querySelector(".screen--lb")`));
  const code = await H.ev(`document.querySelector(".lb-codechip b")?.textContent`);
  await G.send("Page.navigate", { url: `${base}/?room=${code}` }); await sleep(1000);
  await click(G, ".modal .btn--primary");
  ck("เข้าห้องรอ (ลูกห้อง)", await waitFor(G, `document.querySelector(".screen--lb")`));
  await sleep(500);
  await sweep(H, "ห้องรอ (หัวห้อง)", "lobby-host"); await sweep(G, "ห้องรอ (ลูกห้อง)", "lobby-guest");
  // ตั้งค่า: รอบ 1 เวลา 30
  await click(H, ".lb-set:nth-child(3) .seg", "1"); await click(H, ".lb-set:nth-child(2) .seg", "30"); await sleep(400);
  await click(G, ".lb-bigbtn"); await sleep(400);
  await click(H, ".lb-bigbtn");
  ck("เริ่มเกม: หัวห้องเห็นกล่องเลือกคำ", await waitFor(H, `document.querySelector(".word-choices")`, 8000));
  await sleep(300); await sweep(H, "กล่องเลือกคำ", "choose");
  await click(H, ".word-choices button");
  ck("หน้าเกมของคนวาดมาแล้ว", await waitFor(H, `document.querySelector(".wordbar .topbar__real-word")`, 8000));
  await sleep(2600); // ผ่านป้ายใหญ่ Mini Challenge
  await sweep(H, "เกม: คนวาด (ยังไม่เปิดคำใบ้)", "game-drawer");
  await sweep(G, "เกม: คนทาย (ยังไม่เปิดคำใบ้)", "game-guesser");
  if (process.env.PROBE) console.log("PROBE", JSON.stringify(await G.ev(`(()=>{const l=document.querySelector(".score-list");const q=e=>{const r=e.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]};return {list:q(l),scrollW:l.scrollWidth,clientW:l.clientWidth,scrollLeft:l.scrollLeft,gc:getComputedStyle(l).gridAutoColumns,gtc:getComputedStyle(l).gridTemplateColumns,rows:[...l.children].map(r=>({row:q(r),kids:[...r.children].map(q)}))}})()`)));
  const hb = await H.ev(`(()=>{const w=document.querySelector(".wordbar").getBoundingClientRect(),r=document.querySelector(".wordbar .topbar__real-word").getBoundingClientRect(),b=document.querySelector(".board").getBoundingClientRect();return {wordB:Math.round(r.bottom),barB:Math.round(w.bottom),bt:Math.round(b.top)}})()`);
  ck("เกม: คำของคนวาดเห็นเต็มตัว อยู่เหนือกระดาน", hb.wordB <= hb.barB + 1 && hb.barB <= hb.bt + 1, JSON.stringify(hb));
  await click(H, ".hint-btn"); // เปิดคำใบ้ก่อนเวลา
  ck("คำใบ้เปิดแล้วที่จอคนทาย", await waitFor(G, `document.querySelector(".wordbar .hint__row")`, 6000));
  await sleep(300);
  await sweep(G, "เกม: คนทาย (คำใบ้เปิดแล้ว)", "game-guesser-hint"); await sweep(H, "เกม: คนวาด (คำใบ้เปิดแล้ว)", "game-drawer-hint");
  const gb = await G.ev(`(()=>{const w=document.querySelector(".wordbar").getBoundingClientRect(),h=[...document.querySelectorAll(".wordbar .hint__row")].map(e=>e.getBoundingClientRect()),b=document.querySelector(".board").getBoundingClientRect();return {rows:h.length,hintB:Math.round(Math.max(...h.map(x=>x.bottom))),barB:Math.round(w.bottom),bt:Math.round(b.top)}})()`);
  ck("เกม: คำใบ้ทุกแถวอยู่ในแถบคำเหนือกระดาน", gb.hintB <= gb.barB + 1 && gb.barB <= gb.bt + 1, JSON.stringify(gb));
  // เล่นให้จบ 2 ตา: คนทายพิมพ์คำที่คนวาดเห็น
  for (let turn = 1; turn <= 2; turn++) {
    const drawerTab = (await H.ev(`!!document.querySelector(".wordbar .topbar__real-word")`)) ? H : G;
    const guesserTab = drawerTab === H ? G : H;
    const w = await drawerTab.ev(`document.querySelector(".wordbar .topbar__real-word").textContent`);
    await typeInto(guesserTab, ".chat__input", w); await click(guesserTab, ".chat__form .btn");
    if (turn === 1) {
      ck("ตา 1 จบ: หน้าต่างสรุปตา", await waitFor(H, `document.querySelector(".modal__panel")`, 8000));
      await sleep(400); await sweep(H, "หน้าต่างสรุปตา", "round-summary");
      ck("ตา 2 เริ่ม (คนวาดสลับ)", await waitFor(G, `document.querySelector(".word-choices")||document.querySelector(".wordbar .topbar__real-word")`, 12000));
      if (await G.ev(`!!document.querySelector(".word-choices")`)) await click(G, ".word-choices button");
      await waitFor(G, `document.querySelector(".wordbar .topbar__real-word")`, 6000); await sleep(2600);
    }
  }
  ck("จบเกม: หน้าสรุปผลมีปุ่ม กลับห้องรอ ทั้งสองจอ", await waitFor(H, `[...document.querySelectorAll(".modal__actions .btn")].some(b=>b.textContent.includes("กลับห้องรอ"))`, 15000) && await waitFor(G, `[...document.querySelectorAll(".modal__actions .btn")].some(b=>b.textContent.includes("กลับห้องรอ"))`, 5000));
  await sleep(500);
  await sweep(H, "หน้าสรุปผลจบเกม (หัวห้อง)", "gameover-host"); await sweep(G, "หน้าสรุปผลจบเกม (ลูกห้อง)", "gameover-guest");
  ck("มีข้อความนับถอยหลังกลับห้องรอ", await H.ev(`/อัตโนมัติใน \\d+ วิ/.test(document.querySelector(".modal__panel").textContent)`));
  // รีเฟรชระหว่างหน้าสรุปผล
  await G.send("Page.reload"); await sleep(1800);
  ck("รีเฟรชระหว่างหน้าสรุปผล: กลับมาเห็นหน้าสรุปผลและปุ่มกลับห้องรอ", await waitFor(G, `[...document.querySelectorAll(".modal__actions .btn")].some(b=>b.textContent.includes("กลับห้องรอ"))`, 8000));
  // ลูกห้องกดกลับห้องรอ → ทั้งสองจอกลับ
  await click(G, ".modal__actions .btn", "กลับห้องรอ");
  ck("กดกลับห้องรอ: ทั้งสองจอเข้าห้องรอพร้อมกัน", await waitFor(H, `document.querySelector(".screen--lb")`, 6000) && await waitFor(G, `document.querySelector(".screen--lb")`, 6000));
  await sleep(600);
  const back = await H.ev(`({players:document.querySelectorAll(".lb-player").length,scores:[...document.querySelectorAll(".lb-player__score")].map(e=>e.textContent.trim()),ready:document.querySelectorAll(".ready-badge--on").length,crown:!!document.querySelector(".lb-player--me .pix, .lb-player--me [aria-label='หัวห้อง']"),chat:document.querySelectorAll(".lb-chat__row:not(.lb-chat__row--sys)").length,code:document.querySelector(".lb-codechip b").textContent})`);
  ck("ห้องเดิม คนครบ 2 คน คะแนน 0 Ready รีเซ็ต แชทเก่าล้าง", back.players === 2 && back.scores.every((s) => s.startsWith("0")) && back.ready === 0 && back.chat === 0 && back.code === code, JSON.stringify(back));
  ck("หัวห้องยังเป็นคนเดิม (ปุ่มเริ่มเกมอยู่ที่ H)", await H.ev(`!!document.querySelector(".lb-bigbtn")?.textContent.includes("เริ่มเกม")`) && await G.ev(`!document.querySelector(".lb-bigbtn")?.textContent.includes("เริ่มเกม")`));
  await sweep(H, "ห้องรอหลังกลับมา (หัวห้อง)", "back-host"); await sweep(G, "ห้องรอหลังกลับมา (ลูกห้อง)", "back-guest");
  // หัวห้องเปลี่ยนตั้งค่าแล้วเริ่มใหม่ได้
  await click(H, ".lb-set:nth-child(2) .seg", "45"); await click(G, ".lb-bigbtn"); await sleep(500);
  ck("ตั้งค่าใหม่ซิงก์ (45 วิ)", await waitFor(G, `[...document.querySelectorAll(".lb-set")][1].querySelector(".seg--active")?.textContent==="45"`));
  await click(H, ".lb-bigbtn");
  ck("เริ่มเกมใหม่ได้หลังกลับห้องรอ", await waitFor(H, `document.querySelector(".word-choices")||document.querySelector(".wordbar")`, 8000) && await waitFor(G, `document.querySelector(".game")`, 8000));
  ck("ไม่มี exception ในหน้าเว็บ", H.errs.length + G.errs.length === 0, JSON.stringify([...H.errs, ...G.errs].slice(0, 3)));
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
