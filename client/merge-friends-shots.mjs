import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SP = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-merge-friends-"));
const PROFILE = path.join(os.tmpdir(), "jdi-chrome-" + process.pid);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3161, DBG = 9361;
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
const shot = async (c, name) => { await act(c); const r = await c.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.writeFileSync(`${SP}/${name}.png`, Buffer.from(r.result.data, "base64")); console.log("shot:", name); };
const waitFor = async (c, expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await c.ev(`!!(${expr})`)) return true; await sleep(120); } return false; };
const click = (c, sel) => c.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.scrollIntoView({block:"center"});e.click();return true})()`);

const base = `http://localhost:${PORT}`;

try {
  const walletFile = `${SP}/wallet.json`;
  server = spawn("node", ["index.js"], {
    cwd: `${ROOT}/server`,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "test", JDI_TEST_AUTH_BYPASS: "1", AI_MODE: "mock", CLIENT_DIST: `${ROOT}/client/dist`, SCORES_FILE: `${SP}/scores.json`, WALLET_FILE: walletFile },
    stdio: "ignore",
  });
  chrome = spawn((process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), [`--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`, "--headless=new", "--mute-audio", "--no-first-run", "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(200); } }
  await sleep(1200);
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {} await sleep(200); }

  const H = await newTab(`${base}/`);
  await H.ev(`localStorage.setItem("jdi.rulesSeen","1");localStorage.setItem("jdi.music","0");localStorage.setItem("jdi.name","ทดสอบ")`);
  await act(H);
  await H.send("Page.navigate", { url: `${base}/` }); await sleep(1500);

  const playerKey = await H.ev(`sessionStorage.getItem("jdi.playerKey")`);
  const sub = `test-${crypto.createHash("sha256").update(playerKey).digest("hex")}`;
  const walletAccountId = crypto.createHash("sha256").update(`jdi:wallet-account:v1:${sub}`).digest("hex");
  const rows = JSON.parse(fs.readFileSync(walletFile, "utf8"));
  const row = rows.find((r) => r.accountId === walletAccountId);
  console.log("เจอแถวกระเป๋าเงินของบัญชีทดสอบ:", Boolean(row));
  if (row) row.coins = 2000;
  fs.writeFileSync(walletFile, JSON.stringify(rows, null, 2));

  // เปิดหน้าแก้ไขโปรไฟล์ผ่านอวตารหน้าแรก
  console.log("เปิดหน้าแก้ไขโปรไฟล์:", await click(H, ".avatar-picker__stage--edit"));
  await sleep(500);
  console.log("โมดัลเปิด:", await waitFor(H, `document.getElementById("edit-profile-title")`, 5000));
  await shot(H, "01-profile-avatar-tab");

  // สลับไปแท็บร้านค้า
  console.log("มีแท็บร้านค้า:", await waitFor(H, `[...document.querySelectorAll(".profile-tabs__btn")].some(b=>b.textContent.includes("ร้านค้า"))`, 3000));
  await H.ev(`[...document.querySelectorAll(".profile-tabs__btn")].find(b=>b.textContent.includes("ร้านค้า"))?.click()`);
  await sleep(400);
  await shot(H, "02-profile-shop-tab");

  // ซื้อของสองสามชิ้นจากหมวดต่างๆ แล้วใส่ ให้เห็นพรีวิวเปลี่ยน
  for (const id of ["hat_bunny", "glasses_round", "bg_sky"]) {
    await click(H, `[data-item-id="${id}"] button`);
    await sleep(400);
  }
  await shot(H, "03-profile-shop-after-buy-preview");
  for (const id of ["hat_bunny", "glasses_round", "bg_sky"]) {
    await click(H, `[data-item-id="${id}"] button`);
    await sleep(400);
  }
  await shot(H, "04-profile-shop-equipped");

  console.log("SHOT_DIR=" + SP);
} catch (e) {
  console.log("สคริปต์พัง:", e.stack?.split("\n").slice(0, 5).join(" | "));
} finally {
  try { chrome?.kill(); } catch {}
  try { server?.kill(); } catch {}
  await sleep(500);
  try { execSync(`pkill -f "remote-debugging-port=${DBG}"`); } catch {}
  fs.rmSync(PROFILE, { recursive: true, force: true });
}
