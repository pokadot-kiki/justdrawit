const rules = require("../shared/teamRules.json");

const teamChoices = rules.ids.map((_, index) => index + 1).filter((count) => count >= rules.minTeams);
const getTeams = (room) => rules.ids.slice(0, room.settings.teamCount || rules.minTeams);
const teamCount = (room, team) => room.players.filter((player) => player.team === team).length;
const roomCapacity = (room) => room.settings.mode === "team" ? getTeams(room).length * rules.capacity : room.settings.maxPlayers;
const autoTeam = (room) => getTeams(room).filter((team) => teamCount(room, team) < rules.capacity)
  .sort((a, b) => teamCount(room, a) - teamCount(room, b))[0] ?? null;
const teamsComplete = (room) => room.players.length === roomCapacity(room)
  && getTeams(room).every((team) => teamCount(room, team) === rules.capacity);

function settingsMembershipValid(room, mode, selectedCount, maxPlayers) {
  if (mode !== "team") return room.settings.mode !== "team" || room.players.length <= maxPlayers;
  const teams = rules.ids.slice(0, selectedCount);
  if (room.players.length > teams.length * rules.capacity) return false;
  if (room.settings.mode !== "team") return true;
  return room.players.every((player) => teams.includes(player.team))
    && teams.every((team) => teamCount(room, team) <= rules.capacity);
}

module.exports = { rules, teamChoices, getTeams, teamCount, roomCapacity, autoTeam, teamsComplete, settingsMembershipValid };
