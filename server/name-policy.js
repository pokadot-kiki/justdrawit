const { nameKey } = require("./clean");
const ACCOUNT_ID_RE = /^[a-f0-9]{64}$/;

// ตรวจเฉพาะชื่อที่ Server รู้จริง: ผู้เล่นใน room ปัจจุบัน และชื่อจากแถว
// leaderboard ที่มี accountId ซึ่งยืนยันโดย Server แล้ว
function nameTaken({ players = [], registeredRows = [], name, selfId = null, accountId = null } = {}) {
  const key = nameKey(name);
  if (!key) return false;

  if (players.some((player) => player?.id !== selfId && nameKey(player?.name) === key)) return true;

  return registeredRows.some((row) =>
    typeof row?.accountId === "string" && ACCOUNT_ID_RE.test(row.accountId) &&
    row.accountId !== accountId && nameKey(row.name) === key
  );
}

module.exports = { nameTaken };
