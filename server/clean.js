// ตัวช่วยทำความสะอาดข้อมูลจาก client ที่ใช้มากกว่าหนึ่งไฟล์
// (ระบบห้องใน index.js และ leaderboard.js ใช้ cleanName ตัวเดียวกัน ชื่อจึงถูกตัดด้วยกติกาเดียวกันทุกที่)

// ทำให้ชื่ออยู่ในรูปแบบเดียวกันก่อนเก็บลง room/leaderboard:
// Unicode รูปแบบเดียวกัน, ตัดช่องว่างหัวท้าย และยุบช่องว่างติดกัน
function normalizeName(name) {
  return String(name ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ");
}

// ตัดความยาวตามกติกาเดิม (20 ตัวอักษร) หลัง normalize แล้ว
function cleanName(name) {
  return Array.from(normalizeName(name)).slice(0, 20).join("");
}

// ใช้ตรวจชื่อซ้ำโดยไม่สนตัวพิมพ์เล็ก/ใหญ่
function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

module.exports = { cleanName, normalizeName, nameKey };
