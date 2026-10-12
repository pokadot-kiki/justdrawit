// ผลจบเกมทีม: ใช้คะแนนทีม (ค่าเฉลี่ยต่อสมาชิก — คำนวณใน index.js) และเก็บสมาชิกจากตอนเริ่มแมตช์ · คะแนนสูงสุดเสมอกัน = ไม่มีผู้ชนะ
module.exports = function teamFinalResults(room, teams, scores, names) {
  const present = new Set(room.players.map((p) => p.id));
  const teamRanking = teams.map((team) => ({
    team,
    name: names[team],
    score: scores[team],
    members: room.teamParticipants
      .filter((p) => p.team === team)
      .map((p) => ({ playerId: p.playerId, name: p.name, avatar: p.avatar, left: !present.has(p.playerId) })),
  })).sort((a, b) => b.score - a.score);
  return {
    teamRanking,
    winner: teamRanking.length >= 2 && teamRanking[0].score > teamRanking[1].score ? teamRanking[0].team : null,
  };
};
