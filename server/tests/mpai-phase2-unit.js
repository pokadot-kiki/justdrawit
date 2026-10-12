const test = require("node:test");
const assert = require("node:assert/strict");
const OFFLINE_WAIT_MS = 80; // ย่อค่าผ่าน env สำหรับเทสเท่านั้น
process.env.MPAI_OFFLINE_WAIT_MS = String(OFFLINE_WAIT_MS);
const createMpAi = require("../mp-ai");
const { scoreFor } = require("../ai");

function fixture() {
  const sent = [];
  const io = { to(target) { return {
    emit(event, data) { sent.push({ target, event, data }); },
    except(id) { return { emit(event, data) { sent.push({ target, except: id, event, data }); } }; },
  }; } };
  const players = ["a", "b", "c"].map((id) => ({ id, name: id.toUpperCase(), score: 0, connected: true }));
  const watch = { word: "cat", category: "animal", time: 60, hintAt: 30, startedAt: Date.now(), strokes: [], solved: new Map(), eligibleIds: new Set(players.map((p) => p.id)), offlineGrace: new Map(), chat: [] };
  const room = { code: "ROOM", hostId: "a", status: "playing", settings: { rounds: 1 }, players, mp: {
    token: 1, round: 1, phase: "watch", strokeTimers: [], entries: new Map(players.map((p) => [p.id, { playerId: p.id, name: p.name, drawPoints: 0, guessPoints: 0, left: false }])), watch,
  } };
  const api = createMpAi({ io, rooms: new Map([[room.code, room]]), ai: { scoreFor }, normalize: (s) => s.trim().toLowerCase(), roomState: () => ({}) });
  const guess = (id, text) => api.handleGuess({ data: { pid: id } }, room, players.find((p) => p.id === id), text);
  return { sent, room, api, guess };
}

test("Phase 2 chat is ordered, shared, private after solve, and restored safely", () => {
  const { sent, room, api, guess } = fixture();
  guess("a", "dog");
  guess("b", "bird");
  guess("a", "cat");
  assert.deepEqual(room.mp.watch.chat.map((m) => m.seq), [1, 2, 3]);
  assert.deepEqual(room.mp.watch.chat.map((m) => m.text), ["dog", "bird", "A ทายถูก"]);
  assert.equal(sent.filter((e) => ["chat_message", "correct_guess"].includes(e.event) && Number.isInteger(e.data.seq) && e.target === "ROOM").length, 3);
  assert.equal(sent.filter((e) => e.event === "chat_message" && e.data.text === "cat").length, 0);
  assert.equal(JSON.stringify(api.snapshot(room, "b").watch.chat).includes("cat"), false);
  assert.ok(room.mp.watch.solved.get("a") > 0);
  guess("a", "secret chat");
  assert.equal(room.mp.watch.chat[3].recipients[0], "a");
  assert.equal(api.snapshot(room, "b").watch.chat.length, 3);
  assert.equal(api.snapshot(room, "a").watch.chat.length, 4);
  guess("a", "cat");
  assert.equal(room.mp.watch.chat.length, 4);
  assert.equal(room.mp.watch.solved.size, 1);
});

test("an answer with punctuation is never broadcast as an incorrect guess", () => {
  const { sent, guess } = fixture();
  guess("a", "cat!");
  assert.equal(sent.filter((e) => e.event === "chat_message" && e.target === "ROOM").length, 0);
  guess("a", "catfish");
  assert.equal(sent.filter((e) => e.event === "chat_message" && e.data.text === "catfish").length, 1);
});

test("private solved chat is not sent to a player who left the room", () => {
  const { sent, room, guess, api } = fixture();
  guess("a", "cat");
  guess("b", "cat");
  room.players = room.players.filter((p) => p.id !== "b");
  api.onPlayerLeft(room, "b");
  sent.length = 0;
  guess("a", "private chat");
  assert.equal(sent.some((e) => e.target === "b" && e.event === "chat_message"), false);
  api.stop(room);
});

test("reconnect grace holds the round, then disconnect does not block or erase points", async () => {
  const { sent, room, api, guess } = fixture();
  guess("a", "cat");
  const points = room.players[0].score;
  guess("a", "cat");
  assert.equal(room.players[0].score, points);
  room.players[2].connected = false;
  api.onPlayerOffline(room, "c");
  guess("b", "cat");
  assert.equal(room.mp.phase, "watch");
  await new Promise((resolve) => setTimeout(resolve, OFFLINE_WAIT_MS + 10));
  assert.equal(room.mp.phase, "watch_end");
  assert.equal(sent.filter((e) => e.event === "mpai_watch_end").length, 1);
  assert.equal(room.mp.watchEnd.results.length, 2);
  assert.equal(room.mp.entries.get("a").guessPoints, points);
  assert.equal(api.snapshot(room, "a").watch.chat.filter((m) => m.kind === "correct").length, 2);
  assert.equal(api.snapshot(room, "a").watch.strokes.length, 0);
  room.players[2].connected = true;
  api.checkProgress(room);
  assert.equal(sent.filter((e) => e.event === "mpai_watch_end").length, 1);
  api.stop(room);
});

test("a reconnect cancels the old grace window before a second disconnect", async () => {
  const { room, api, guess } = fixture();
  guess("a", "cat");
  room.players[2].connected = false;
  api.onPlayerOffline(room, "c");
  await new Promise((resolve) => setTimeout(resolve, OFFLINE_WAIT_MS / 4));
  room.players[2].connected = true;
  api.addPlayer(room, room.players[2]);
  room.players[2].connected = false;
  api.onPlayerOffline(room, "c");
  guess("b", "cat");
  await new Promise((resolve) => setTimeout(resolve, OFFLINE_WAIT_MS * 3 / 4 + 5));
  assert.equal(room.mp.phase, "watch");
  await new Promise((resolve) => setTimeout(resolve, OFFLINE_WAIT_MS / 4));
  assert.equal(room.mp.phase, "watch_end");
  api.stop(room);
});

test("final individual ranking keeps stable ties, zero scores, avatars and departed players", () => {
  const { room, api } = fixture();
  room.hostId = "a";
  room.mp.entries.get("a").drawPoints = 50;
  room.mp.entries.get("a").avatar = 2;
  room.mp.entries.get("b").guessPoints = 50;
  room.mp.entries.get("b").avatar = 3;
  room.mp.entries.get("c").avatar = 4;
  room.mp.entries.get("c").left = true;
  room.players = room.players.filter((p) => p.id !== "c");
  const ranked = api.ranking(room);
  assert.deepEqual(ranked.map((p) => [p.playerId, p.score, p.avatar, p.isHost, p.left]), [
    ["a", 50, 2, true, false],
    ["b", 50, 3, false, false],
    ["c", 0, 4, false, true],
  ]);
});
