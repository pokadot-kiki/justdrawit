const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const io = require(path.join(path.dirname(require.resolve("socket.io/package.json")), "client-dist", "socket.io.js"));

const port = 3077;
const url = `http://localhost:${port}`;
const words = require("../data/words.json");
const clients = [];
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-categories-"));
const server = spawn(process.execPath, ["index.js"], {
  cwd: path.join(__dirname, ".."),
  env: { ...process.env, PORT: String(port), SCORES_FILE: path.join(temp, "scores.json"), TEXT_CHECK: "off", REJOIN_GRACE_MS: "1000" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (data) => { serverLog += data; });
server.stderr.on("data", (data) => { serverLog += data; });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, ms = 4000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const result = await fn();
    if (result) return result;
    await sleep(10);
  }
  throw new Error(`หมดเวลารอ event\n${serverLog.slice(-1500)}`);
}
async function connect(key) {
  const socket = io(url, { transports: ["websocket"], auth: { playerKey: key }, reconnection: false });
  const events = [];
  socket.onAny((name, data) => events.push({ name, data }));
  await waitFor(() => socket.connected);
  clients.push(socket);
  return { socket, events, last: (name) => events.filter((event) => event.name === name).at(-1)?.data };
}
function ack(socket, name, data) {
  return new Promise((resolve) => socket.timeout(3000).emit(name, data, (error, result) => resolve(error ? null : result)));
}
function assertOptions(options, category, difficulty) {
  const allowed = new Set((difficulty === "mixed" ? Object.values(words).flat() : words[difficulty])
    .filter((item) => item.category === category).map((item) => item.word));
  assert.ok(options.length > 0);
  assert.ok(options.every((word) => allowed.has(word)), `คำหลุดหมวด/ระดับ: ${options}`);
}
async function scenario(mode, difficulty, category, count) {
  const group = [];
  for (let i = 0; i < count; i++) group.push(await connect(`category-${mode}-${i}-persistent-key`));
  const host = group[0];
  let guest = group[1];
  const created = await ack(host.socket, "create_room", { name: `${mode}Host`, mode, difficulty, rounds: 1, challenges: ["none"] });
  assert.equal(created.ok, true);
  for (let i = 1; i < count; i++) {
    assert.equal((await ack(group[i].socket, "join_room", { code: created.code, name: `${mode}Guest${i}` })).ok, true);
  }
  await waitFor(() => host.last("room_update")?.players.length === count);
  assert.equal(host.last("room_update").settings.difficulty, difficulty);
  host.socket.emit("start_game");
  host.socket.emit("start_game");
  await waitFor(() => group.every((client) => client.last("room_update")?.status === "category_selection"));
  guest.socket.disconnect();
  guest = await connect(`category-${mode}-1-persistent-key`);
  group[1] = guest;
  assert.equal((await ack(guest.socket, "rejoin", { code: created.code })).ok, true);
  await waitFor(() => guest.last("room_update")?.status === "category_selection");
  assert.equal(group.some((client) => client.last("game_started")), false);
  assert.equal(group.some((client) => client.last("choose_word")), false);
  assert.equal(group.some((client) => client.last("timer")), false);
  assert.equal((await ack(guest.socket, "select_category", { category })).error, "NOT_HOST");
  assert.equal((await ack(host.socket, "select_category", { category: "อื่นๆ" })).error, "INVALID_CATEGORY");
  assert.equal(host.last("room_update").status, "category_selection");
  const result = await ack(host.socket, "select_category", { category });
  assert.equal(result.ok, true);
  assert.equal((await ack(host.socket, "select_category", { category })).error, "INVALID_GAME_STATE");
  await waitFor(() => group.every((client) => client.last("room_update")?.status === "playing"));
  assert.equal(group.every((client) => client.last("room_update")?.category === category), true);
  await waitFor(() => group.some((client) => client.last("choose_word")));
  for (const client of group) {
    for (const event of client.events.filter((item) => item.name === "choose_word")) assertOptions(event.data.options, category, difficulty);
  }
  assert.equal(host.events.filter((event) => event.name === "game_started").length, 1);
  console.log(`ผ่าน: ${mode} ${difficulty} ${category}`);
}

(async () => {
  await waitFor(async () => fetch(`${url}/healthz`).then((res) => res.ok).catch(() => false), 8000);
  await scenario("classic", "hard", "สัตว์", 2);
  await scenario("team", "mixed", "อาหาร", 4);
  console.log("Word categories ผ่านทั้งหมด");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  clients.forEach((client) => client.disconnect());
  server.kill();
  fs.rmSync(temp, { recursive: true, force: true });
});
