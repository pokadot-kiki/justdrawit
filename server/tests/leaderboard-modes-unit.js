const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jdi-boards-"));
process.env.SCORES_FILE = path.join(dir, "scores.json");
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const board = require("../leaderboard");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("four mode boards use verified accounts, preserve old rows, and reject duplicate game writes", () => {
  const month = board.resolveMonth();
  const uidA = "a".repeat(64);
  const uidB = "b".repeat(64);
  const old = { id: 1, name: "Old guest", score: 9000, levelReached: 2, playedAt: `${month}-01 10:00`, board: "multi" };
  fs.writeFileSync(process.env.SCORES_FILE, JSON.stringify([old]));
  assert.equal(board.saveVerifiedScore({ name: "Guest", score: 9999, accountId: null, board: "classic" }), null);
  for (const mode of ["classic", "team", "solo", "mpai"]) {
    const input = { name: "Player", score: 100, levelReached: mode === "solo" ? 3 : 0, board: mode, accountId: uidA, avatar: 2, won: mode !== "solo", gameId: `${mode}-game` };
    assert.ok(board.saveVerifiedScore(input));
    assert.equal(board.saveVerifiedScore(input), null);
    assert.equal(board.getLeaderboard(month, mode).top.length, 1);
  }
  board.saveVerifiedScore({ name: "Another", score: 50, board: "classic", accountId: uidB, gameId: "classic-b" });
  board.saveVerifiedScore({ name: "Another", score: 0, board: "team", accountId: uidB, gameId: "team-zero" });
  board.saveVerifiedScore({ name: "Renamed", score: 80, board: "classic", accountId: uidA, gameId: "classic-next" });
  const classic = board.getLeaderboard(month, "classic", uidA).top;
  assert.deepEqual(classic.map(({ name, score, games, wins, isMe }) => [name, score, games, wins, Boolean(isMe)]), [
    ["Renamed", 100, 2, 1, true], ["Another", 50, 1, 0, false],
  ]);
  assert.equal(board.getLeaderboard(month, "multi").top.length, 0);
  assert.equal(board.getLeaderboard(month, "team").top.find((item) => item.name === "Another")?.score, 0);
  assert.equal(board.loadScores()[0].name, "Old guest");
  assert.equal(JSON.stringify(classic).includes(uidA), false);
});
