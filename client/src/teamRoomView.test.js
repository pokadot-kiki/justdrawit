import assert from "node:assert/strict";
import { test } from "node:test";
import { teamRoomView } from "./teamRoomView.js";
import { TEAM_COUNT_CHOICES, TEAM_CAPACITY, TEAM_IDS } from "./roomOptions.js";

test("Waiting Room renders every selected team, capacity, and incomplete team", () => {
  for (const count of TEAM_COUNT_CHOICES) {
    const players = TEAM_IDS.slice(0, count).flatMap((team) => [{ team }, { team }]);
    const current = { settings: { teamCount: count }, players };
    const view = teamRoomView(current);
    assert.deepEqual(view.teams, TEAM_IDS.slice(0, count));
    assert.equal(view.capacity, count * TEAM_CAPACITY);
    assert.deepEqual(view.incomplete, []);
    assert.ok(view.teams.every((team) => view.counts[team] === TEAM_CAPACITY));
    assert.ok(view.teams.every((team) => view.canJoin(team) === false));
    current.players.pop();
    assert.deepEqual(teamRoomView(current).incomplete, [view.teams.at(-1)]);
    assert.equal(teamRoomView(current).canJoin(view.teams.at(-1)), true);
  }
});
