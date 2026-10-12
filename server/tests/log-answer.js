// ตรวจคำที่ถูกพิมพ์เป็นค่าแยกหรือระบุเป็นคำตอบ ไม่จับคำสั้นที่อยู่ในคำอื่น เช่น มด ใน โหมด
function logContainsAnswer(logText, answer) {
  if (typeof answer !== "string" || !answer) return false;
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const separateValue = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{M}\\p{N}])`, "u");
  const taggedAnswer = new RegExp(`(?:คำตอบ(?:คือ|เป็น)?|คำว่า|คำตานี้(?:คือ)?)\\s*[:=]?\\s*${escaped}`, "u");
  return logText.split("\n").some((line) => separateValue.test(line) || taggedAnswer.test(line));
}

module.exports = logContainsAnswer;
