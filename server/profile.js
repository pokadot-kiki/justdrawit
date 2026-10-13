const { normalizeName } = require("./clean");

function validateProfile(data, cleanName, cleanAvatar) {
  if (typeof data?.name !== "string") return { ok: false, error: "INVALID_NAME" };
  const normalized = normalizeName(data.name);
  const name = cleanName(normalized);
  if (!normalized || [...normalized].length > 20 || /[\u0000-\u001f\u007f<>]/u.test(data.name)) return { ok: false, error: "INVALID_NAME" };
  if (!Number.isInteger(data.avatar) || data.avatar < 0 || cleanAvatar(data.avatar) !== data.avatar) return { ok: false, error: "INVALID_AVATAR" };
  return { ok: true, name, avatar: data.avatar };
}

function updateIdentity(entry, playerId, name, avatar, avatarPhoto) {
  if (entry && (entry.playerId === playerId || entry.id === playerId)) {
    entry.name = name;
    entry.avatar = avatar;
    entry.avatarPhoto = avatarPhoto;
  }
}

function applyRoomProfile(room, playerId, name, avatar, avatarPhoto) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return false;
  player.name = name;
  player.avatar = avatar;
  player.avatarPhoto = avatarPhoto;
  updateIdentity(room.classicEntrants?.get(playerId), playerId, name, avatar, avatarPhoto);
  room.teamParticipants?.forEach((p) => updateIdentity(p, playerId, name, avatar, avatarPhoto));
  Object.values(room.teams ?? {}).forEach((lane) => updateIdentity(lane.roundDrawer, playerId, name, avatar, avatarPhoto));
  room.lastTeamRoundEnd?.gallery?.forEach((item) => updateIdentity(item.drawer, playerId, name, avatar, avatarPhoto));
  const mp = room.mp;
  updateIdentity(mp?.entries?.get(playerId), playerId, name, avatar, avatarPhoto);
  mp?.gallery?.results?.forEach((item) => updateIdentity(item, playerId, name, avatar, avatarPhoto));
  mp?.watchEnd?.results?.forEach((item) => updateIdentity(item, playerId, name, avatar, avatarPhoto));
  mp?.watch?.chat?.forEach((item) => {
    if (item.playerId !== playerId) return;
    item.name = name;
    if (item.system && item.kind === "correct") item.text = `${name} ทายถูก`;
  });
  room.lastEnded?.ranking?.forEach((item) => updateIdentity(item, playerId, name, avatar, avatarPhoto));
  room.lastEnded?.teamRanking?.forEach((team) => team.members?.forEach((item) => updateIdentity(item, playerId, name, avatar, avatarPhoto)));
  return true;
}

module.exports = { validateProfile, applyRoomProfile };
