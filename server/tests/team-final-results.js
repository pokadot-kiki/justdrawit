const assert = require("node:assert/strict");
const { test } = require("node:test");
const teamFinalResults = require("../team-final-results");
const { rules } = require("../team-membership");

function fixture(count, scores) {
  const teams = rules.ids.slice(0, count);
  const teamParticipants = teams.flatMap((team) => Array.from({ length: rules.capacity }, (_, i) => ({
    playerId: `${team}-${i}`, team, name: `${team} member ${i}`, avatar: i,
  })));
  const room = { teamParticipants, players: teamParticipants.map((p) => ({ id: p.playerId })) };
  const names = Object.fromEntries(teams.map((team) => [team, `ทีม ${team}`]));
  return { room, teams, names, scores: Object.fromEntries(teams.map((team, i) => [team, scores?.[i] ?? 0])) };
}

for (const count of [2, 3, 4, 5]) {
  test(`${count} teams: every authoritative team and starter appears once`, () => {
    const f = fixture(count, Array.from({ length: count }, (_, i) => (count - i) * 10));
    const result = teamFinalResults(f.room, f.teams, f.scores, f.names);
    assert.deepEqual(result.teamRanking.map((t) => t.team), f.teams);
    assert.equal(result.winner, f.teams[0]);
    result.teamRanking.forEach((t, i) => {
      assert.equal(t.name, f.names[t.team]);
      assert.equal(t.score, f.scores[t.team]);
      assert.equal(t.members.length, rules.capacity);
      assert.deepEqual(t.members.map((p) => p.playerId), f.room.teamParticipants.slice(i * rules.capacity, (i + 1) * rules.capacity).map((p) => p.playerId));
    });
  });
}

test("ties and zero scores preserve team order and have no sole winner", () => {
  const f = fixture(3, [0, 0, 0]);
  const result = teamFinalResults(f.room, f.teams, f.scores, f.names);
  assert.deepEqual(result.teamRanking.map((t) => t.team), f.teams);
  assert.equal(result.winner, null);
});

test("highest authoritative score sets winner and ranking despite team id order", () => {
  const f = fixture(3, [10, 70, 30]);
  f.names.B = "ทีมสายฟ้า";
  const result = teamFinalResults(f.room, f.teams, f.scores, f.names);
  assert.deepEqual(result.teamRanking.map((t) => [t.team, t.score]), [["B", 70], ["C", 30], ["A", 10]]);
  assert.equal(result.teamRanking[0].name, "ทีมสายฟ้า");
  assert.equal(result.winner, "B");
});

test("departed starter retains saved name and avatar; result survives later room changes", () => {
  const f = fixture(2, [20, 10]);
  const departed = f.room.teamParticipants[1];
  const originalName = departed.name;
  f.room.players = f.room.players.filter((p) => p.id !== departed.playerId);
  const saved = teamFinalResults(f.room, f.teams, f.scores, f.names);
  assert.deepEqual(saved.teamRanking[0].members[1], {
    playerId: departed.playerId, name: departed.name, avatar: departed.avatar, left: true,
  });
  f.room.teamParticipants[1].name = "Changed";
  f.room.players = [];
  assert.equal(saved.teamRanking[0].members[1].name, originalName);
  assert.equal(saved.teamRanking[0].members[0].left, false);
});
