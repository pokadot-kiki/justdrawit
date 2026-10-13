// เทสเบราว์เซอร์จริง (Chrome headless ผ่าน CDP · --mute-audio) ของร้านค้าของตกแต่งที่รวมอยู่ในหน้าแต่งโปรไฟล์
// ต้อง `cd client && npm run build` ก่อน · เปิด server ทดสอบเองสองตัว (ไม่แตะพอร์ต 3000):
//   3014 = Guest (ไม่ได้ล็อกอิน) · 3015 = โหมดเทสที่ถือว่าล็อกอินแล้ว (NODE_ENV=test + JDI_TEST_AUTH_BYPASS=1)
// กระเป๋าเงินเก็บในไฟล์ชั่วคราว (WALLET_FILE) · เติม coin ให้บัญชีทดสอบโดยแก้ไฟล์นั้นตรงๆ แล้วโหลดหน้าใหม่ (server อ่านไฟล์ทุกครั้ง)
// ภาพหน้าจอเก็บในโฟลเดอร์ argv[2] (ไม่ส่ง = โฟลเดอร์ชั่วคราว) · ปิด Chrome/server และลบไฟล์ชั่วคราวเสมอตอนจบ
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), "jdi-browser-shots-"));
fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-shop-"));
const PROFILE = path.join(os.tmpdir(), "jdi-chrome-" + process.pid);
const PORT_GUEST = 3014, PORT_USER = 3015, DBG = 9349;
const CHROME = process.env.CHROME_BIN || (process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} [shop] ${n}${ok ? "" : "  " + JSON.stringify(extra)}`); };

const walletFile = path.join(TMP, "wallet.json");
const startServer = (port, extra = {}) => spawn(process.execPath, ["index.js"], {
  cwd: path.join(ROOT, "server"), stdio: "ignore",
  env: { ...process.env, PORT: String(port), SCORES_FILE: path.join(TMP, "scores.json"), WALLET_FILE: walletFile, AI_MODE: "mock", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", ...extra },
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
  const open = async (port) => {
    await send("Page.navigate", { url: `http://localhost:${port}/` });
    await waitFor("document.querySelector('.screen')");
    await ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.music","off");localStorage.setItem("jdi.sound","off")`);
  };
  const openModal = async () => { await click(".avatar-picker__stage--edit"); return waitFor("document.querySelector('.modal__panel--profile')"); };
  const tabs = () => ev(`[...document.querySelectorAll('.pe__tab')].map(b=>b.textContent.trim())`);
  const coins = () => ev(`Number(document.querySelector('.pe__coins')?.textContent.trim())`);
  const layout = () => ev(`(()=>{const p=document.querySelector('.modal__panel--profile');const R=e=>e.getBoundingClientRect();const pr=R(p);
    const spill=[...p.querySelectorAll('.pe__item,.pe__tab,.pe__buy,.pe__coins,.pe__stage')].filter(e=>{const r=R(e);return r.left<pr.left-1||r.right>pr.right+1}).length;
    return {spill,inView:pr.left>=0&&pr.right<=innerWidth&&pr.top>=0&&pr.bottom<=innerHeight,scrollX:p.scrollWidth>p.clientWidth+1}})()`);

  await send("Page.enable"); await send("Runtime.enable");

  // ---- Guest: ไม่มีแท็บร้านค้า ไม่มี coin ----
  await size(1440, 900);
  await open(PORT_GUEST); await send("Page.reload"); await waitFor("document.querySelector('.avatar-picker__stage--edit')");
  ck("Guest: เปิดหน้าแต่งโปรไฟล์ได้", await openModal());
  ck("Guest: มีแค่แท็บอวตาร ไม่มีหมวดร้านค้า", JSON.stringify(await tabs()) === JSON.stringify(["อวตาร"]), await tabs());
  ck("Guest: ไม่โชว์ coin และมีข้อความชวนล็อกอิน", !(await ev("!!document.querySelector('.pe__coins')")) && (await ev("!!document.querySelector('.pe__note')")));
  await shot("01-guest-1440");
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))`); await sleep(300);

  // ---- ล็อกอินแล้ว: เติม coin ให้บัญชีทดสอบ ----
  await open(PORT_USER); await send("Page.reload"); await waitFor("document.querySelector('.avatar-picker__stage--edit')");
  await sleep(800); // รอ economy_state ครั้งแรก (server สร้างแถวกระเป๋าเงิน)
  const key = await ev(`sessionStorage.getItem("jdi.playerKey")`);
  const sub = `test-${crypto.createHash("sha256").update(key).digest("hex")}`;
  const acc = crypto.createHash("sha256").update(`jdi:wallet-account:v1:${sub}`).digest("hex");
  const rows = fs.existsSync(walletFile) ? JSON.parse(fs.readFileSync(walletFile, "utf8")) : [];
  const row = rows.find((r) => r.accountId === acc);
  ck("server สร้างกระเป๋าเงินของบัญชีทดสอบ", Boolean(row));
  if (row) { row.coins = 1000; fs.writeFileSync(walletFile, JSON.stringify(rows, null, 2)); }
  await send("Page.reload"); await waitFor("document.querySelector('.avatar-picker__stage--edit')"); await sleep(800);

  ck("ล็อกอิน: เปิดหน้าแต่งโปรไฟล์ได้", await openModal());
  ck("ล็อกอิน: แท็บ อวตาร กรอบ หมวก แว่น ของคอ พื้นหลัง", JSON.stringify(await tabs()) === JSON.stringify(["อวตาร", "กรอบ", "หมวก", "แว่น", "ของคอ", "พื้นหลัง"]), await tabs());
  ck("ล็อกอิน: coin จาก server ขึ้นที่พรีวิว (1000)", (await coins()) === 1000, await coins());
  await shot("02-user-avatar-tab-1440");

  await click(".pe__tab", "หมวก"); await sleep(300);
  const hatCards = await ev(`[...document.querySelectorAll('.pe__item')].map(e=>e.dataset.itemId)`);
  ck("แท็บหมวก: มีเฉพาะของหมวดหมวก", hatCards.length > 0 && hatCards.every((x) => x.startsWith("hat_")), hatCards);
  ck("มงกุฎทอง (2000) ปุ่มซื้อกดไม่ได้เพราะเหรียญไม่พอ", await ev(`document.querySelector('[data-item-id="hat_crown"] .pe__buy')?.disabled === true`));
  // ลองใส่ก่อนซื้อ: พรีวิวมีหมวกแต่ coin ไม่ลด
  await ev(`document.querySelector('[data-item-id="hat_bunny"]').click()`); await sleep(200);
  ck("กดการ์ด = ลองใส่: พรีวิวมีหมวก coin ไม่ลด", (await ev(`!!document.querySelector('.pe__stage .avatar-layers__hat')`)) && (await coins()) === 1000);
  await shot("03-user-hat-try-on-1440");

  const price = await ev(`Number(document.querySelector('[data-item-id="hat_bunny"] .pe__buy').textContent.replace(/\\D/g,""))`);
  await click('[data-item-id="hat_bunny"] .pe__buy'); await sleep(600);
  ck(`ซื้อหูกระต่าย: coin ลด ${price} ตามที่ server ตอบ`, (await coins()) === 1000 - price, await coins());
  ck("ซื้อแล้วปุ่มเปลี่ยนเป็น ใส่", (await ev(`document.querySelector('[data-item-id="hat_bunny"] .pe__buy')?.textContent.trim()`)) === "ใส่");
  await click('[data-item-id="hat_bunny"] .pe__buy'); await sleep(600);
  ck("ใส่แล้วการ์ดมีป้าย ใส่อยู่", (await ev(`document.querySelector('[data-item-id="hat_bunny"] .pe__badge')?.textContent.trim()`)) === "ใส่อยู่");
  const saved = JSON.parse(fs.readFileSync(walletFile, "utf8")).find((r) => r.accountId === acc);
  ck("server บันทึกของที่ซื้อและที่ใส่จริง", saved?.owned?.includes("hat_bunny") && saved?.equipped?.hat === "hat_bunny", saved?.equipped);

  await click(".pe__tab", "พื้นหลัง"); await sleep(300);
  await click('[data-item-id="bg_sky"] .pe__buy'); await sleep(600);
  await click('[data-item-id="bg_sky"] .pe__buy'); await sleep(600);
  ck("ซื้อ+ใส่พื้นหลังได้ (หมวดที่สอง)", (await ev(`!!document.querySelector('[data-item-id="bg_sky"] .pe__badge')`)));
  const l1440 = await layout();
  ck("1440×900 อยู่ในจอ ไม่มีชิ้นส่วนล้น", l1440.inView && !l1440.spill && !l1440.scrollX, l1440);
  await shot("04-user-bg-equipped-1440");

  await size(390, 844); await sleep(400);
  const l390 = await layout();
  ck("390×844 อยู่ในจอ ไม่มีชิ้นส่วนล้น", l390.inView && !l390.spill && !l390.scrollX, l390);
  ck("390×844 ปุ่มแท็บ/ซื้อสูง ≥ 44px", await ev(`[...document.querySelectorAll('.pe__tab,.pe__buy')].every(b=>b.getBoundingClientRect().height>=43.5)`));
  await shot("05-user-shop-390");
  await ev(`document.querySelector('.pe__tabs').scrollIntoView()`); await shot("06-user-shop-390-tabs");

  // ปิดแล้วอวตารหน้าแรกมีของที่ใส่
  await click(".pe__close"); await sleep(300);
  ck("ปิดหน้าต่างแล้วอวตารหน้าแรกใส่หมวกอยู่", await ev(`!!document.querySelector('.avatar-picker .avatar-layers__hat')`));
  ck("ไม่มี exception ในหน้าเว็บ", errs.length === 0, errs);
} catch (e) {
  ck("สคริปต์ทำงานจนจบ", false, String(e?.stack || e).slice(0, 300));
} finally {
  try { chrome.kill(); } catch {}
  for (const s of servers) try { s.kill(); } catch {}
  await sleep(500);
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.rmSync(TMP, { recursive: true, force: true });
}
console.log(`สรุป [shop]: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
console.log(`ภาพหน้าจอ: ${OUT}`);
process.exit(fail ? 1 : 0);
