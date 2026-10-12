import { NAME_MAX_LEN } from "./playerName.js";

export function profileInputError(name) {
  const clean = name.trim();
  if (!clean) return "กรุณาใส่ชื่อผู้เล่น";
  if (clean.length > NAME_MAX_LEN) return `ชื่อต้องไม่เกิน ${NAME_MAX_LEN} ตัวอักษร`;
  if (/[\u0000-\u001f\u007f<>]/u.test(clean)) return "ชื่อมีอักขระที่ใช้ไม่ได้";
  return null;
}
