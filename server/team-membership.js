// กฎโหมดทีมที่ server กับ client ใช้ร่วมกัน (shared/teamRules.json)
// ids = รหัสทีมข้างใน (คงที่ A-D) · minTeams = จำนวนทีมน้อยสุด · minPlayers = แต่ละทีมต้องมีอย่างน้อยกี่คนถึงเริ่มเกมได้
// กติกาที่เหลือ (ทีมห่างกันไม่เกิน 1 คน · ย้ายทีม · สลับตัว) อยู่ใน index.js เพราะต้องใช้สถานะห้อง
const rules = require("../shared/teamRules.json");

const teamChoices = rules.ids.map((_, index) => index + 1).filter((count) => count >= rules.minTeams);
const getTeams = (room) => rules.ids.slice(0, room.settings.teamCount || rules.minTeams);
const teamCount = (room, team) => room.players.filter((player) => player.team === team).length;

module.exports = { rules, teamChoices, getTeams, teamCount };
