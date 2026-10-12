const assert = require("node:assert/strict");
const { test } = require("node:test");
const { cleanName } = require("../clean");
const { validateProfile, applyRoomProfile } = require("../profile");

const avatar = (value) => Number.isInteger(value) && value >= 0 && value <= 5 ? value : 0;

test("profile validation rejects empty, long, markup and invalid avatars", () => {
  for (const name of ["", "   ", "a".repeat(21), "<script>", "bad\nname"]) {
    assert.equal(validateProfile({ name, avatar: 0 }, cleanName, avatar).ok, false);
  }
  for (const index of [-1, 6, "2", null]) assert.equal(validateProfile({ name: "Valid", avatar: index }, cleanName, avatar).ok, false);
  assert.deepEqual(validateProfile({ name: "  ชื่อใหม่  ", avatar: 2 }, cleanName, avatar), { ok: true, name: "ชื่อใหม่", avatar: 2 });
});

test("profile update keeps player identity, score, team, host, and current snapshots", () => {
  const player = { id: "host", name: "Old", avatar: 0, score: 500, team: "A", isHost: true };
  const other = { id: "other", name: "Other", avatar: 1, score: 400, team: "A" };
  const room = {
    players: [player, other], hostId: "host", classicEntrants: new Map([["host", player]]),
    teamParticipants: [{ playerId: "host", name: "Old", avatar: 0, team: "A" }],
    teams: { A: { roundDrawer: { playerId: "host", name: "Old", avatar: 0 } } },
    lastTeamRoundEnd: { gallery: [{ drawer: { playerId: "host", name: "Old", avatar: 0 }, image: "real-image" }] },
    mp: {
      entries: new Map([["host", { playerId: "host", name: "Old", avatar: 0, drawPoints: 200, guessPoints: 300 }]]),
      gallery: { results: [{ playerId: "host", name: "Old", avatar: 0, image: "real-image" }] },
      watch: { chat: [{ playerId: "host", name: "Old", text: "Old ทายถูก", kind: "correct", system: true }] },
      watchEnd: { results: [{ playerId: "host", name: "Old", points: 50 }] },
    },
    lastEnded: { ranking: [{ playerId: "host", name: "Old", avatar: 0, score: 500 }], teamRanking: [{ team: "A", score: 900, members: [{ playerId: "host", name: "Old", avatar: 0 }] }] },
  };
  assert.equal(applyRoomProfile(room, "host", "New", 3), true);
  assert.equal(player.id, "host");
  assert.equal(player.score, 500);
  assert.equal(player.team, "A");
  assert.equal(room.hostId, "host");
  assert.equal(other.name, "Other");
  for (const entry of [player, room.teamParticipants[0], room.teams.A.roundDrawer, room.lastTeamRoundEnd.gallery[0].drawer, room.mp.entries.get("host"), room.mp.gallery.results[0], room.mp.watchEnd.results[0], room.lastEnded.ranking[0], room.lastEnded.teamRanking[0].members[0]]) {
    assert.equal(entry.name, "New");
    assert.equal(entry.avatar, 3);
  }
  assert.equal(room.mp.watch.chat[0].text, "New ทายถูก");
  assert.equal(room.lastEnded.teamRanking[0].score, 900);
  assert.equal(applyRoomProfile(room, "other-player", "Wrong", 4), false);
});
