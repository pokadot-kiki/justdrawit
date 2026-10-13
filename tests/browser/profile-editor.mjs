// เทสเบราว์เซอร์จริง (Chrome headless ผ่าน CDP · --mute-audio) ของหน้าแต่งโปรไฟล์ (ProfileModal เฟส A)
// ต้อง `cd client && npm run build` ก่อน · เปิด server ทดสอบเองสองตัว (ไม่แตะพอร์ต 3000):
//   3012 = ผู้เล่นทั่วไป (ไม่ได้ล็อกอิน) · 3013 = โหมดเทสที่ถือว่าล็อกอินแล้ว (NODE_ENV=test + JDI_TEST_AUTH_BYPASS=1)
// ปิด Chrome/server และลบโปรไฟล์ชั่วคราวเสมอตอนจบ · ภาพหน้าจอเก็บในโฟลเดอร์ที่ส่งมาเป็น argv[2] (ไม่ส่ง = โฟลเดอร์ชั่วคราวของระบบ)
// ตั้ง CHROME_BIN ถ้า Chrome ไม่ได้อยู่ที่ตำแหน่งมาตรฐาน
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), "jdi-browser-shots-"));
fs.mkdirSync(OUT, { recursive: true });
const PROFILE = path.join(os.tmpdir(), "jdi-chrome-" + process.pid);
const PORT_GUEST = 3012, PORT_USER = 3013, DBG = 9348;
const CHROME = process.env.CHROME_BIN || (process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} [profile] ${n}${ok ? "" : "  " + extra}`); };

// คำไม่เหมาะสมหนึ่งคำจากรายการของ server (ไม่พิมพ์ออกจอ) ไว้ลองว่าตัวกรองยังทำงาน
const bad = JSON.parse(fs.readFileSync(path.join(ROOT, "server/data/badwords.json"), "utf8")).blocked;
const BAD_WORD = (Array.isArray(bad) ? bad : Object.values(bad).flat()).find((w) => typeof w === "string" && w.length >= 3 && w.length <= 12);

const scores = path.join(os.tmpdir(), `jdi-profile-scores-${process.pid}.json`);
const startServer = (port, extra = {}) => spawn(process.execPath, ["index.js"], {
  cwd: path.join(ROOT, "server"), stdio: "ignore",
  env: { ...process.env, PORT: String(port), SCORES_FILE: scores, WALLET_FILE: scores.replace("scores", "wallet"), CHALLENGE_INTRO_MS: "0", ...extra },
});
const servers = [startServer(PORT_GUEST), startServer(PORT_USER, { NODE_ENV: "test", JDI_TEST_AUTH_BYPASS: "1" })];
const chrome = spawn(CHROME, ["--headless=new", "--mute-audio", "--disable-gpu", `--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "about:blank"], { stdio: "ignore" });

try {
  for (const port of [PORT_GUEST, PORT_USER]) {
    let up = false;
    for (let i = 0; i < 80 && !up; i++) { up = await fetch(`http://localhost:${port}/healthz`).then((r) => r.ok).catch(() => false); if (!up) await sleep(250); }
    if (!up) throw new Error(`server ${port} ไม่ขึ้น`);
  }
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) { ready = await fetch(`http://127.0.0.1:${DBG}/json/version`).then((r) => r.ok).catch(() => false); if (!ready) await sleep(200); }
  const t = await (await fetch(`http://127.0.0.1:${DBG}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") errs.push(String(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 200)); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(`!!(${expr})`)) return true; await sleep(120); } return false; };
  const size = (w, h) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(r.result.data, "base64")); };
  const click = (sel, text) => ev(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(sel)})];const e=${text ? `els.find(x=>x.textContent.includes(${JSON.stringify(text)}))` : "els[0]"};if(!e||e.disabled)return false;e.click();return true})()`);
  const type = (sel, text) => ev(`(()=>{const i=document.querySelector(${JSON.stringify(sel)});if(!i)return false;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;s.call(i,${JSON.stringify(text)});i.dispatchEvent(new Event("input",{bubbles:true}));return true})()`);
  const open = async (port, pathName = "/") => {
    await send("Page.navigate", { url: `http://localhost:${port}${pathName}` });
    await waitFor("document.querySelector('.screen')");
    await ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.teamRulesSeen","1");localStorage.setItem("jdi.music","off");localStorage.setItem("jdi.sound","off")`);
  };
  const modalOpen = "document.querySelector('.modal__panel--profile')";
  // วัดหน้าต่าง: อยู่ในจอ · ไม่ล้นแนวนอน · เลย์เอาต์ · ชิ้นส่วนไม่ล้นกรอบ
  const MEASURE = `(()=>{const p=document.querySelector('.modal__panel--profile');if(!p)return null;const R=e=>e.getBoundingClientRect();
    const pr=R(p),side=R(p.querySelector('.pe__side')),main=R(p.querySelector('.pe__main')),act=R(p.querySelector('.pe__actions'));
    const kids=[...p.querySelectorAll('.pe__ribbon .ribbon,.pe__close,.pe__preview,.pe__stage,.pe__name,.pe__name-row,.profile-avatars__item,.pe__badge,.pe__actions .btn,.pe__tab')];
    const spill=kids.filter(e=>{const r=R(e);return r.left<pr.left-1||r.right>pr.right+1}).map(e=>e.className.split(' ')[0]);
    const cards=[...p.querySelectorAll('.profile-avatars__item')];const tops=[...new Set(cards.map(c=>Math.round(R(c).top)))];
    const btns=[...p.querySelectorAll('button')].map(R);
    return {vw:innerWidth,vh:innerHeight,scrollW:document.documentElement.scrollWidth,left:Math.round(pr.left),right:Math.round(pr.right),top:Math.round(pr.top),bottom:Math.round(pr.bottom),
      panelScrollX:p.scrollWidth>p.clientWidth+1,twoCol:main.left>=side.right-1&&Math.abs(main.top-side.top)<40,stacked:main.top>=side.bottom-1&&act.top>=main.bottom-1,actionsUnderSide:act.top>=side.bottom-1&&act.right<=main.left+1,
      spill,cards:cards.length,rows:tops.length,selected:cards.filter(c=>c.getAttribute('aria-pressed')==='true').length,badges:p.querySelectorAll('.pe__badge').length,badgeText:p.querySelector('.pe__badge')?.textContent.trim(),
      ribbon:p.querySelector('.pe__ribbon')?.textContent.trim(),minBtn:Math.round(Math.min(...btns.map(b=>b.height))),closeBtn:!!p.querySelector('.pe__close'),
      preview:p.querySelector('.pe__stage svg')?.getAttribute('aria-label')||p.querySelector('.pe__stage [aria-label]')?.getAttribute('aria-label'),name:p.querySelector('.pe__name').textContent,input:p.querySelector('#edit-profile-name').value,
      wide:[...document.querySelectorAll('body *')].filter(e=>{const r=R(e);return r.width>0&&(r.right>innerWidth+1||r.left<-1)&&e.closest('.modal')}).slice(0,6).map(e=>e.tagName.toLowerCase()+'.'+String(e.className.baseVal??e.className).split(' ')[0]+':'+Math.round(R(e).right)),
      badgeIcon:Math.round(R(p.querySelector('.pe__badge svg')).width),ribbonHitsClose:R(p.querySelector('.pe__ribbon .ribbon')).right>R(p.querySelector('.pe__close')).left-2,ribbonLeft:Math.round(R(p.querySelector('.pe__ribbon .ribbon')).left-pr.left),panelScrollY:p.scrollHeight>p.clientHeight+1,
      gapUnderCards:Math.round(R(p.querySelector('.pe__main')).bottom-R(cards.at(-1)).bottom),avatarInStage:(()=>{const a=R(p.querySelector('.pe__stage .avatar-art')),st=R(p.querySelector('.pe__stage'));return a.left>=st.left&&a.right<=st.right&&a.top>=st.top&&a.bottom<=st.bottom})(),
      externalImgs:[...document.querySelectorAll('img')].filter(i=>/googleusercontent|http/.test(i.src)&&!i.src.startsWith(location.origin)).length}})()`;

  // ───────── 1) ไม่ได้ล็อกอิน: หน้าแรก ─────────
  await send("Page.enable"); await send("Runtime.enable");
  await size(1440, 900);
  await open(PORT_GUEST);
  await send("Page.reload"); await waitFor("document.querySelector('#player-name')");
  const nameBefore = await ev("document.querySelector('#player-name').textContent.trim()");
  ck("ไม่ได้ล็อกอิน: หน้าแรกไม่มีชิปบัญชี", !(await ev("!!document.querySelector('.auth-chip')")));
  await click("#player-name");
  ck("กดชื่อที่หน้าแรกแล้วหน้าแต่งโปรไฟล์เปิด", await waitFor(modalOpen));
  await sleep(300);

  for (const [w, h, label] of [[1440, 900, "desktop"], [390, 844, "mobile-390"], [320, 640, "mobile-320"]]) {
    await size(w, h); await sleep(350);
    const m = await ev(MEASURE);
    ck(`${w}×${h} หน้าต่างไม่ทำให้หน้าล้นแนวนอน และอยู่ในจอ (${m?.left}..${m?.right})`, m && m.wide.length === 0 && m.left >= 0 && m.right <= m.vw && !m.panelScrollX, `ของในหน้าต่างที่เกินจอ: ${JSON.stringify(m?.wide)}`);
    // ของตกแต่งที่ขยับได้ของหน้าข้างหลัง (ดาว/ตัวการ์ตูน) อาจยื่นเกินจอเล็กน้อยเป็นจังหวะ — ไม่ใช่ของหน้าต่างนี้ แค่แจ้งไว้
    if (m && m.scrollW > m.vw + 1) console.log(`   ℹ️  ${w}px: หน้าข้างหลังกว้าง ${m.scrollW}px (ของตกแต่งหน้าแรก ไม่ใช่หน้าต่างโปรไฟล์)`);
    ck(`${w}×${h} ไม่มีชิ้นส่วนล้นกรอบหน้าต่าง`, m && m.spill.length === 0, JSON.stringify(m?.spill));
    if (w >= 721) {
      ck(`${w}×${h} สองคอลัมน์: พรีวิว+ชื่อซ้าย · อวตารขวา · ปุ่มยกเลิก/บันทึกใต้ฝั่งซ้าย`, m?.twoCol && m.actionsUnderSide, JSON.stringify(m));
      ck(`${w}×${h} หน้าต่างสูงไม่เกินจอ (ไม่ต้องเลื่อน)`, m && m.top >= 0 && m.bottom <= m.vh, `${m?.top}..${m?.bottom} / ${m?.vh}`);
    } else {
      ck(`${w}×${h} คอลัมน์เดียว: พรีวิว → อวตาร → ปุ่ม`, m?.stacked, JSON.stringify(m));
    }
    ck(`${w}×${h} อวตาร 6 ตัว เรียง 2 แถว แถวละ 3 · เลือกอยู่ 1 ตัวพร้อมป้าย "${m?.badgeText}"`, m && m.cards === 6 && m.rows === 2 && m.selected === 1 && m.badges === 1 && m.badgeText === "เลือกอยู่", JSON.stringify(m));
    ck(`${w}×${h} ริบบิ้น "แต่งโปรไฟล์" + ปุ่มปิด · ปุ่มทุกปุ่มสูง ≥ 44px (${m?.minBtn})`, m && m.ribbon === "แต่งโปรไฟล์" && m.closeBtn && m.minBtn >= 44, JSON.stringify(m));
    ck(`${w}×${h} ริบบิ้นไม่ชนปุ่มปิดและไม่ถูกตัดขอบซ้าย · ไอคอนในป้าย "เลือกอยู่" ขนาดปกติ (${m?.badgeIcon}px) · อวตารอยู่ในวงพรีวิว`, m && !m.ribbonHitsClose && m.ribbonLeft >= 4 && m.badgeIcon <= 14 && m.avatarInStage, JSON.stringify([m?.ribbonHitsClose, m?.ribbonLeft, m?.badgeIcon, m?.avatarInStage]));
    if (h >= 800) ck(`${w}×${h} เห็นครบทั้งหน้าต่างโดยไม่ต้องเลื่อน`, m && !m.panelScrollY, JSON.stringify(m));
    if (w >= 721) ck(`${w}×${h} คอลัมน์ขวาไม่เหลือที่ว่างโหว่ใต้การ์ด (${m?.gapUnderCards}px)`, m && m.gapUnderCards <= 40, String(m?.gapUnderCards));
    await shot(`profile-${label}`);
  }
  ck("ไม่มีรูปจากเว็บภายนอก (googleusercontent ฯลฯ)", (await ev(MEASURE)).externalImgs === 0);
  ck("ไม่โหลด Tailwind", !(await ev("[...document.scripts].some(s=>/tailwind/.test(s.src))||!!document.querySelector('link[href*=tailwind]')")));

  // ───────── 2) การทำงาน (จอคอม) ─────────
  await size(1440, 900); await sleep(250);
  const before = await ev(MEASURE);
  await ev(`document.querySelectorAll('.profile-avatars__item')[${before.preview?.includes("กบ") ? 4 : 3}].click()`);
  await sleep(200);
  const picked = await ev(MEASURE);
  ck(`เลือกอวตารแล้วพรีวิวเปลี่ยนทันที (${before.preview} → ${picked.preview})`, picked.preview !== before.preview && picked.selected === 1 && picked.badges === 1);
  await click(".pe__name-row .name-row__dice"); await sleep(200);
  const diced = await ev(MEASURE);
  ck(`ปุ่มลูกเต๋าสุ่มชื่อใหม่ และพรีวิวชื่อเปลี่ยนตาม`, diced.input !== before.input && diced.input.length > 0 && diced.name === diced.input, JSON.stringify([before.input, diced.input, diced.name]));
  await type("#edit-profile-name", "พิมพ์เอง"); await sleep(150);
  ck("พิมพ์ชื่อแล้วพรีวิวเปลี่ยนตามทันที", (await ev(MEASURE)).name === "พิมพ์เอง");
  await type("#edit-profile-name", "   "); await click(".pe__actions .btn--primary"); await sleep(250);
  ck("ชื่อว่าง → เตือนและไม่ปิดหน้าต่าง", (await ev(`document.querySelector('.profile-error')?.textContent||''`)).includes("กรุณาใส่ชื่อ") && (await ev(`!!${modalOpen}`)));

  await click(".pe__actions .btn", "ยกเลิก"); await sleep(300);
  ck("ยกเลิก → หน้าต่างปิด ชื่อที่หน้าแรกไม่เปลี่ยน", !(await ev(`!!${modalOpen}`)) && (await ev("document.querySelector('#player-name').textContent.trim()")) === nameBefore);
  await click("#player-name"); await waitFor(modalOpen);
  await click(".pe__close"); await sleep(300);
  ck("ปุ่มปิด (กากบาท) → หน้าต่างปิด ไม่บันทึก", !(await ev(`!!${modalOpen}`)) && (await ev("document.querySelector('#player-name').textContent.trim()")) === nameBefore);
  await click("#player-name"); await waitFor(modalOpen);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(300);
  ck("กด Esc → หน้าต่างปิด", !(await ev(`!!${modalOpen}`)));

  await click("#player-name"); await waitFor(modalOpen);
  await ev("document.querySelectorAll('.profile-avatars__item')[5].click()");
  await type("#edit-profile-name", "ชื่อใหม่ทดสอบ");
  await click(".pe__actions .btn--primary"); await sleep(400);
  ck("บันทึก → หน้าต่างปิด ชื่อใหม่ขึ้นที่หน้าแรก", !(await ev(`!!${modalOpen}`)) && (await ev("document.querySelector('#player-name').textContent.trim()")) === "ชื่อใหม่ทดสอบ");
  await click("#player-name"); await waitFor(modalOpen);
  const reopened = await ev(MEASURE);
  ck("เปิดอีกครั้ง: จำอวตารและชื่อที่บันทึกไว้", reopened.input === "ชื่อใหม่ทดสอบ" && reopened.preview?.includes("ปลาหมึก"), JSON.stringify([reopened.input, reopened.preview]));
  await click(".pe__close"); await sleep(200);

  // ───────── 3) ในห้อง: update_profile ผ่าน server (ตัวกรองคำไม่เหมาะสมต้องยังทำงาน) ─────────
  await click(".big-btn--green"); await waitFor("document.querySelector('.setup__create')");
  await click(".setup__create");
  ck("สร้างห้องได้ (เข้าห้องรอ)", await waitFor("document.querySelector('.lb-top .profile-trigger')", 10000));
  await click(".lb-top .profile-trigger"); await waitFor(modalOpen);
  await type("#edit-profile-name", BAD_WORD); await click(".pe__actions .btn--primary");
  await waitFor("document.querySelector('.profile-error')", 5000);
  const badErr = await ev(`document.querySelector('.profile-error')?.textContent||''`);
  ck("ชื่อไม่เหมาะสม → server ปฏิเสธ ขึ้นข้อความ และหน้าต่างไม่ปิด", badErr.includes("ชื่อนี้ใช้ไม่ได้") && (await ev(`!!${modalOpen}`)), badErr);
  ck("ชื่อในห้องไม่ถูกเปลี่ยนเป็นคำนั้น", (await ev("document.querySelector('.lb-top .profile-trigger__name').textContent")) === "ชื่อใหม่ทดสอบ");
  await ev("document.querySelectorAll('.profile-avatars__item')[0].click()");
  await type("#edit-profile-name", "ชื่อในห้อง"); await click(".pe__actions .btn--primary");
  await waitFor(`!${modalOpen}`, 5000);
  ck("ชื่อปกติ → บันทึกผ่าน server แถบบนและรายชื่อในห้องเปลี่ยนตาม",
    (await ev("document.querySelector('.lb-top .profile-trigger__name').textContent")) === "ชื่อในห้อง" && (await ev("[...document.querySelectorAll('.lb-player__name')].some(e=>e.textContent.includes('ชื่อในห้อง'))")));
  await size(390, 844); await click(".lb-top .profile-trigger"); await waitFor(modalOpen); await sleep(300);
  const inRoom = await ev(MEASURE);
  ck("ในห้องรอ จอ 390px: หน้าต่างไม่ล้น", inRoom && inRoom.scrollW <= inRoom.vw + 1 && inRoom.spill.length === 0 && inRoom.right <= inRoom.vw, JSON.stringify(inRoom));
  await click(".pe__close");

  // ───────── 4) ล็อกอินแล้ว (server โหมดเทส) ─────────
  await size(1440, 900);
  await open(PORT_USER);
  await send("Page.reload");
  ck("ล็อกอินแล้ว: หน้าแรกมีชิปบัญชี", await waitFor("document.querySelector('.auth-chip')", 8000));
  await click("#player-name");
  ck("ล็อกอินแล้ว: หน้าแต่งโปรไฟล์เปิดได้", await waitFor(modalOpen));
  await sleep(300);
  const u = await ev(MEASURE);
  ck("ล็อกอินแล้ว: เลย์เอาต์เหมือนเดิม (สองคอลัมน์ · 6 อวตาร · ไม่ล้น)", u && u.twoCol && u.cards === 6 && u.spill.length === 0 && u.scrollW <= u.vw + 1, JSON.stringify(u));
  await shot("profile-logged-in");
  await ev("document.querySelectorAll('.profile-avatars__item')[2].click()");
  await type("#edit-profile-name", "ล็อกอินแล้ว"); await click(".pe__actions .btn--primary"); await sleep(400);
  ck("ล็อกอินแล้ว: บันทึกได้ ชื่อใหม่ขึ้นที่หน้าแรก", !(await ev(`!!${modalOpen}`)) && (await ev("document.querySelector('#player-name').textContent.trim()")) === "ล็อกอินแล้ว");
  await click(".big-btn--green"); await waitFor("document.querySelector('.setup__create')"); await click(".setup__create");
  await waitFor("document.querySelector('.lb-top .profile-trigger')", 10000);
  await click(".lb-top .profile-trigger"); await waitFor(modalOpen);
  await type("#edit-profile-name", BAD_WORD); await click(".pe__actions .btn--primary");
  await waitFor("document.querySelector('.profile-error')", 5000);
  ck("ล็อกอินแล้ว: ชื่อไม่เหมาะสมก็ถูกปฏิเสธเหมือนกัน", (await ev(`document.querySelector('.profile-error')?.textContent||''`)).includes("ชื่อนี้ใช้ไม่ได้"));
  await type("#edit-profile-name", "บัญชีทดสอบ"); await click(".pe__actions .btn--primary");
  await waitFor(`!${modalOpen}`, 5000);
  ck("ล็อกอินแล้ว: update_profile ในห้องสำเร็จ", (await ev("document.querySelector('.lb-top .profile-trigger__name').textContent")) === "บัญชีทดสอบ");

  ck("ไม่มี exception ในหน้าเว็บ", errs.length === 0, errs.join(" | "));
} catch (e) {
  fail++; console.log("❌ [profile] สคริปต์พังกลางทาง:", e.message);
} finally {
  chrome.kill();
  for (const s of servers) s.kill();
  await sleep(900);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(scores, { force: true }); fs.rmSync(scores.replace("scores", "wallet"), { force: true }); } catch {}
  console.log(`สรุป [profile]: ผ่าน ${pass} · ไม่ผ่าน ${fail}\nภาพหน้าจอ: ${OUT}`);
  process.exit(fail ? 1 : 0);
}
