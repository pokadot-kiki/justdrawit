import { TEAM_IDS, TEAM_CAPACITY, TEAM_COUNT_CHOICES } from "./roomOptions.js";

export function teamRoomView(room) {
  const teams = TEAM_IDS.slice(0, room.settings.teamCount || TEAM_COUNT_CHOICES[0]);
  const counts = Object.fromEntries(teams.map((team) => [team, room.players.filter((player) => player.team === team).length]));
  const incomplete = teams.filter((team) => counts[team] !== TEAM_CAPACITY);
  const canJoin = (team) => counts[team] < TEAM_CAPACITY;
  return { teams, counts, incomplete, capacity: teams.length * TEAM_CAPACITY, canJoin };
}
