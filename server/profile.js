function validateProfile(data, cleanName, cleanAvatar) {
  if (typeof data?.name !== "string") return { ok: false, error: "INVALID_NAME" };
  const name = data.name.trim();
  if (!name || name !== cleanName(name) || /[\u0000-\u001f\u007f<>]/u.test(name)) return { ok: false, error: "INVALID_NAME" };
  if (!Number.isInteger(data.avatar) || data.avatar < 0 || cleanAvatar(data.avatar) !== data.avatar) return { ok: false, error: "INVALID_AVATAR" };
  return { ok: true, name, avatar: data.avatar };
}

function updateIdentity(entry, playerId, name, avatar) {
  if (entry && (entry.playerId === playerId || entry.id === playerId)) {
    entry.name = name;
    entry.avatar = avatar;
  }
}

function applyRoomProfile(room, playerId, name, avatar) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return false;
  player.name = name;
  player.avatar = avatar;
  updateIdentity(room.classicEntrants?.get(playerId), playerId, name, avatar);
  room.teamParticipants?.forEach((p) => updateIdentity(p, playerId, name, avatar));
  Object.values(room.teams ?? {}).forEach((lane) => updateIdentity(lane.roundDrawer, playerId, name, avatar));
  room.lastTeamRoundEnd?.gallery?.forEach((item) => updateIdentity(item.drawer, playerId, name, avatar));
  const mp = room.mp;
  updateIdentity(mp?.entries?.get(playerId), playerId, name, avatar);
  mp?.gallery?.results?.forEach((item) => updateIdentity(item, playerId, name, avatar));
  mp?.watchEnd?.results?.forEach((item) => updateIdentity(item, playerId, name, avatar));
  mp?.watch?.chat?.forEach((item) => {
    if (item.playerId !== playerId) return;
    item.name = name;
    if (item.system && item.kind === "correct") item.text = `${name} ทายถูก`;
  });
  room.lastEnded?.ranking?.forEach((item) => updateIdentity(item, playerId, name, avatar));
  room.lastEnded?.teamRanking?.forEach((team) => team.members?.forEach((item) => updateIdentity(item, playerId, name, avatar)));
  return true;
}

module.exports = { validateProfile, applyRoomProfile };
