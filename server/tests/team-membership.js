const assert = require("node:assert/strict");
const { test } = require("node:test");
const { rules, teamChoices, getTeams, teamCount, roomCapacity, autoTeam, teamsComplete, settingsMembershipValid } = require("../team-membership");

const room = (count, players = [], mode = "team") => ({ settings: { mode, teamCount: count, maxPlayers: 8 }, players });
const member = (team) => ({ team });

test("selected team counts and capacity use the shared rule", () => {
  assert.deepEqual(teamChoices, [2, 3, 4, 5]);
  for (const count of teamChoices) {
    const current = room(count);
    assert.equal(getTeams(current).length, count);
    assert.equal(roomCapacity(current), count * rules.capacity);
  }
  assert.equal(roomCapacity(room(5, [], "classic")), 8);
});

test("assignment never places a third member and opens a slot after departure", () => {
  const current = room(2, [member("A"), member("B"), member("A"), member("B")]);
  assert.equal(teamCount(current, "A"), rules.capacity);
  assert.equal(autoTeam(current), null);
  assert.equal(teamsComplete(current), true);
  current.players.pop();
  assert.equal(autoTeam(current), "B");
  assert.equal(teamsComplete(current), false);
});

test("settings reject invalid team reduction and mode switch without changing membership", () => {
  const members = rules.ids.flatMap((team) => [member(team), member(team)]);
  const current = room(5, members);
  assert.equal(settingsMembershipValid(current, "team", 4, 8), false);
  assert.equal(settingsMembershipValid(current, "classic", 5, 8), false);
  assert.equal(settingsMembershipValid(current, "team", 5, 8), true);
  assert.equal(teamsComplete(current), true);
  assert.deepEqual(current.players.map((player) => player.team), rules.ids.flatMap((team) => [team, team]));
  current.players.pop();
  assert.equal(teamsComplete(current), false);
  assert.equal(settingsMembershipValid(current, "team", 5, 8), true);
});

test("switching an existing non-Team room validates derived capacity", () => {
  assert.equal(settingsMembershipValid(room(2, Array.from({ length: 5 }, () => member(null)), "classic"), "team", 2, 8), false);
  assert.equal(settingsMembershipValid(room(2, Array.from({ length: 5 }, () => member(null)), "classic"), "team", 3, 8), true);
  assert.equal(settingsMembershipValid(room(2, Array.from({ length: 6 }, () => member(null)), "classic"), "classic", 2, 4), true);
});
