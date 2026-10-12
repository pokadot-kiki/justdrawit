const assert = require("node:assert/strict");
const { test } = require("node:test");
const { rules, teamChoices, getTeams, teamCount } = require("../team-membership");

// กฎร่วมของโหมดทีม (shared/teamRules.json) — กติกาสมดุลทีม/ย้ายทีม/สลับตัวทดสอบผ่าน socket จริงใน smoke.js
const room = (count, players = []) => ({ settings: { mode: "team", teamCount: count, maxPlayers: 8 }, players });
const member = (team) => ({ team });

test("team count choices and active teams come from the shared rule", () => {
  assert.deepEqual(rules.ids, ["A", "B", "C", "D"]);
  assert.deepEqual(teamChoices, [2, 3, 4]);
  assert.equal(rules.minPlayers, 2);
  for (const count of teamChoices) assert.deepEqual(getTeams(room(count)), rules.ids.slice(0, count));
});

test("a room without teamCount falls back to the minimum number of teams", () => {
  assert.deepEqual(getTeams({ settings: {}, players: [] }), ["A", "B"]);
});

test("teamCount counts members of one team only", () => {
  const current = room(3, [member("A"), member("B"), member("A"), member("C"), member(null)]);
  assert.deepEqual(rules.ids.slice(0, 3).map((team) => teamCount(current, team)), [2, 1, 1]);
});
