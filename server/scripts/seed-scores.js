/**
 * ใส่คะแนนตัวอย่างลง server/data/scores.json — สำหรับทดสอบและวันนำเสนอ
 * รันด้วย `npm run seed` (ในโฟลเดอร์ server) ไม่ได้อยู่ในโค้ดหลักของ server
 *
 * ถ้ามีคะแนนอยู่แล้วจะไม่ทับ (กันเผลอลบคะแนนจริง)
 * อยากล้างแล้วใส่ใหม่ ใช้ `npm run seed -- --reset` (ของเดิมจะถูกสำรองไว้ก่อน)
 *
 * วันที่เล่นคิดย้อนจาก "วันนี้" เสมอ (เดือนนี้ · เดือนก่อน · สองเดือนก่อน)
 * วันนำเสนอจึงมีคะแนนของเดือนปัจจุบันให้โชว์แน่นอน ไม่ว่าจะรันวันไหน
 *
 * Leaderboard แสดงได้แค่ "ปีปัจจุบัน" เท่านั้นแล้ว (ดู purgeOldYears ใน server/leaderboard.js)
 * ถ้ารันตอนเดือนมกราคม/กุมภาพันธ์ "เดือนก่อน"/"สองเดือนก่อน" จะเลยไปเป็นเดือนของปีที่แล้ว —
 * กรณีนั้นใช้เดือนปัจจุบันแทน (ไม่งั้นแถวนั้นจะไม่โผล่เลยและถูกลบทิ้งตอน server รีสตาร์ทครั้งถัดไป)
 */
const fs = require("fs");
const { SCORES_FILE, loadScores, writeScores, formatPlayedAt } = require("../leaderboard");

// [ชื่อ, คะแนน, ด่าน, ย้อนกี่เดือน]
const SAMPLES = [
  ["Tar", 1880, 8, 0], ["Mew", 1320, 6, 0], ["Joy", 1240, 6, 0], ["Ploy", 990, 5, 0],
  ["Bank", 860, 4, 0], ["Fah", 720, 4, 0], ["Ice", 540, 3, 0], ["Nut", 310, 2, 0],
  ["Mew", 1650, 7, 1], ["Joy", 1500, 7, 1], ["Tar", 1100, 5, 1], ["Beam", 640, 3, 1],
  ["Ploy", 2010, 9, 2], ["Bank", 1200, 6, 2], ["Fah", 450, 3, 2],
];

const reset = process.argv.includes("--reset");

if (loadScores().length > 0 && !reset) {
  console.log(`มีคะแนนอยู่แล้วใน ${SCORES_FILE} — ไม่ทับให้`);
  console.log("ถ้าจะล้างแล้วใส่ตัวอย่างใหม่ ใช้: npm run seed -- --reset");
  process.exit(0);
}

if (reset && fs.existsSync(SCORES_FILE)) {
  const backup = `${SCORES_FILE}.backup-${Date.now()}`;
  fs.copyFileSync(SCORES_FILE, backup);
  console.log(`สำรองของเดิมไว้ที่ ${backup}`);
}

const now = new Date();
const rows = SAMPLES.map(([name, score, levelReached, monthsAgo], i) => {
  // ย้อนไปแล้วจะข้ามไปปีก่อน (เช่นรันตอน ม.ค./ก.พ.) → ใช้เดือนปัจจุบันแทน (monthsAgo มีค่าสูงสุด 2 ในชุดตัวอย่างนี้)
  const safeMonthsAgo = monthsAgo <= now.getMonth() ? monthsAgo : 0;
  // วันที่ 1-25 ของเดือนนั้น (เดือนนี้ใช้ไม่เกินวันนี้ จะได้ไม่มีคะแนนจากอนาคต)
  const maxDay = safeMonthsAgo === 0 ? now.getDate() : 25;
  const day = 1 + (i % maxDay);
  const playedAt = new Date(now.getFullYear(), now.getMonth() - safeMonthsAgo, day, 19 + (i % 4), (i * 7) % 60);
  return { id: i + 1, name, score, levelReached, playedAt: formatPlayedAt(playedAt) };
});

writeScores(rows);
console.log(`ใส่คะแนนตัวอย่าง ${rows.length} แถวลง ${SCORES_FILE} แล้ว`);
