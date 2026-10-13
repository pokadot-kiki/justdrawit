const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-audit-"));
process.env.SCORES_FILE = path.join(tmp, "scores.json");
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const leaderboard = require("../leaderboard");
const economy = require("../economy");
const achievements = require("../achievements");
const chaos = require("../chaos");
const { validateAvatarPhoto } = require("../avatar-photo");
const definitions = require("../../shared/achievements.json");
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("Leaderboard keeps old rows and marks only the verified account with the same nickname", async () => {
  const old = { id: 1, name: "Champion", score: 999, levelReached: 3, playedAt: "2025-10-01 10:00" };
  fs.writeFileSync(process.env.SCORES_FILE, JSON.stringify([old]));
  await leaderboard.init();
  assert.deepEqual(leaderboard.loadScores(), [old]);
  const month = leaderboard.resolveMonth();
  const at = new Date();
  const accountA = "a".repeat(64);
  const accountB = "b".repeat(64);
  leaderboard.saveScore({ name: "Champion", score: 100, levelReached: 1, accountId: accountA }, at);
  leaderboard.saveScore({ name: "Champion", score: 90, levelReached: 1, accountId: accountB }, at);
  const guestView = leaderboard.getLeaderboard(month, "solo");
  assert.equal(guestView.top.length, 2);
  assert.equal(guestView.top.some((row) => row.isMe), false);
  const memberView = leaderboard.getLeaderboard(month, "solo", accountB);
  assert.deepEqual(memberView.top.map((row) => Boolean(row.isMe)), [false, true]);
  assert.equal(JSON.stringify(memberView).includes(accountB), false);
  assert.equal(leaderboard.saveVerifiedScore({ name: "Champion", score: 10000, accountId: null }), null);
  assert.equal(leaderboard.saveVerifiedScore({ name: "Champion", score: 10000, accountId: "fake" }), null);
  assert.equal(leaderboard.loadScores().length, 3);
});

test("Economy rejects fake purchases and equips only owned items without duplicate rewards", () => {
  const identity = `guest:audit-${Date.now()}`;
  assert.equal(economy.snapshot(identity).coins, 0);
  for (const slot of ["hat", "frame", "base"]) assert.equal(economy.snapshot(identity).catalog.filter((item) => item.slot === slot).length, 8);
  assert.equal(economy.buy(identity, "gold_crown").error, "INSUFFICIENT_COINS");
  assert.equal(economy.buy(identity, "not-in-catalog").error, "ITEM_NOT_FOUND");
  assert.equal(economy.saveOutfit(identity, { hat: "gold_crown" }).error, "ITEM_NOT_OWNED");
  assert.equal(economy.grant(identity, "game:1", 120), true);
  assert.equal(economy.grant(identity, "game:1", 120), false);
  assert.equal(economy.buy(identity, "gold_crown").ok, true);
  assert.equal(economy.buy(identity, "gold_crown").error, "ALREADY_OWNED");
  assert.equal(economy.snapshot(identity).coins, 0);
  assert.equal(economy.saveOutfit(identity, { hat: "gold_crown" }).ok, true);
  assert.equal(economy.saveOutfit(identity, { hat: "wizard_hat" }).error, "ITEM_NOT_OWNED");
});

test("Avatar photo URL is accepted only for its authenticated Firebase owner", () => {
  const bucket = "justdrawit-test.appspot.com";
  const user = { sub: "owner-uid" };
  const path = encodeURIComponent("avatars/owner-uid/profile");
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${path}?alt=media&token=${"a".repeat(32)}`;
  assert.equal(validateAvatarPhoto(url, user, bucket).ok, true);
  assert.equal(validateAvatarPhoto(url, { sub: "other-uid" }, bucket).ok, false);
  assert.equal(validateAvatarPhoto(url, null, bucket).ok, false);
  assert.equal(validateAvatarPhoto("data:image/png;base64,AAAA", user, bucket).ok, false);
});

test("all 16 Achievement definitions unlock from server state only once", () => {
  assert.equal(definitions.length, 16);
  const state = achievements.createState();
  const unlocked = [];
  const award = (id) => unlocked.push(id);
  for (let i = 0; i < 9; i++) achievements.guess(state, { correct: true, first: true, fast: true }, award);
  achievements.guess(state, { correct: false }, award);
  assert.equal(state.unlocked.has("ทายติดคริ"), false);
  for (let i = 0; i < 20; i++) achievements.guess(state, { correct: true, first: true, fast: true }, award);
  assert.equal(state.unlocked.has("ทายติดคริ"), true);
  assert.equal(state.unlocked.has("นิ้วไวไฟ"), true);
  assert.equal(state.unlocked.has("นิ้วไวแสง"), true);
  assert.equal(unlocked.filter((id) => id === "ทายติดคริ").length, 1);
  for (let i = 0; i < 50; i++) achievements.drawing(state, { challenge: "none", fast: true, shapes: 0, strokes: 2, lifted: true, correctCount: 1 }, award);
  for (let i = 0; i < 10; i++) achievements.drawing(state, { challenge: "colour_fix", allCorrect: true, fast: false, shapes: 0, strokes: 1, lifted: true, correctCount: 1 }, award);
  for (let i = 0; i < 20; i++) achievements.drawing(state, { challenge: "dont_lift_pen", allCorrect: true, fast: false, shapes: 0, strokes: 1, lifted: false, correctCount: 1 }, award);
  achievements.drawing(state, { challenge: "shapes_only", fast: true, shapes: 3, strokes: 0, lifted: false, correctCount: 1 }, award);
  for (let i = 0; i < 20; i++) achievements.drawing(state, { challenge: "none", fast: false, shapes: 0, strokes: 2, lifted: true, correctCount: 2 }, award);
  for (let i = 0; i < 100; i++) achievements.game(state, { won: true, teamCarry: true, completed: true, creatorPrivate: true, utcDay: "2026-10-13" }, award);
  const solo = achievements.createState();
  for (let i = 0; i < 30; i++) achievements.soloRound(solo, { hard: true, lifeLost: false }, () => {});
  assert.equal(solo.unlocked.has("ราชา AI"), true);
  assert.equal(solo.unlocked.has("ไร้บาดแผล"), true);
  assert.equal(achievements.snapshot(solo, "solo").progress["ราชา AI"], 30);
  assert.deepEqual(new Set([...state.unlocked, ...solo.unlocked]), new Set(definitions.map((entry) => entry.id)));
  assert.equal(new Set(unlocked).size, unlocked.length);
  const unfinished = achievements.createState();
  achievements.game(unfinished, { won: true, teamCarry: true, completed: false, utcDay: "2026-10-13" }, () => {});
  assert.equal(unfinished.progress["ตัวตึงไร้พ่าย"] || 0, 0);
  assert.equal(unfinished.progress["แบกเพื่อนตึงๆ"] || 0, 0);
});

test("CHAOS validates energy, target, phase, shield, cooldown and expiration", () => {
  const players = ["a", "b"].map((id) => ({ id, connected: true }));
  const state = chaos.create(players);
  chaos.phaseStart(state, players, 1);
  const request = (targetId, itemId = "pixel_fly", phase = "draw") => chaos.attack(state, {
    attackerId: "a", targetId, itemId, phase, players, doneIds: new Map(), challenge: { type: "none" },
  });
  assert.equal(request("b").error, "NO_ENERGY");
  assert.equal(request("a").error, "INVALID_TARGET");
  assert.equal(request("missing").error, "INVALID_TARGET");
  assert.equal(request("ai", "pixel_fly", "over").error, "INVALID_PHASE");
  for (let i = 0; i < 8; i++) chaos.drawingAction(state, "a");
  assert.equal(state.energy.get("a"), 40);
  assert.equal(request("b").error, "SHIELDED");
  assert.equal(state.energy.get("a"), 40);
  assert.equal(request("b").error, "TOO_FAST");
  state.attempts.set("a", Date.now() - 1000);
  assert.equal(request("b").ok, true);
  assert.equal(state.energy.get("a"), 15);
  assert.equal(request("b").error, "TARGET_BUSY");
  state.effects.get("b").until = Date.now() - 1;
  assert.equal(chaos.active(state, "b"), null);
  assert.equal(request("b").error, "COOLDOWN");
  chaos.phaseStart(state, players, 2);
  assert.equal(state.shields.get("b"), 1);
  assert.equal(state.effects.size, 0);
  assert.deepEqual(chaos.ITEMS.map(({ id, price }) => [id, price]), [
    ["cursed_doodle", 30], ["blackout", 40], ["pixel_fly", 25],
    ["shaky_hand", 35], ["ice_canvas", 50], ["rainbow_chaos", 35],
  ]);
  assert.deepEqual(chaos.point({ id: "cursed_doodle" }, .2, .4), { x: .8, y: .4 });
  assert.notEqual(chaos.color({ id: "rainbow_chaos" }, "#000000"), "#000000");
});
