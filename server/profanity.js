// ตัวกรองคำไม่เหมาะสม — ใช้กับชื่อเล่นและชื่อทีม (ดู CLAUDE.md หัวข้อ "ตัวกรองคำไม่เหมาะสม")
// รายการคำอยู่ที่ data/badwords.json ไม่ส่งไฟล์นี้ไปหน้าเว็บเลย (require แค่ฝั่ง server)
// ใส่เฉพาะคำหยาบที่ชัดเจน ลดปัญหาได้ ไม่ได้การันตีว่ากันได้ทุกคำ/ทุกภาษา/ทุกวิธีเลี่ยง
const fs = require("fs");
const path = require("path");

const FILE = process.env.BADWORDS_FILE || path.join(__dirname, "data", "badwords.json");

let BLOCKED = [];
let ALLOW = [];
try {
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  BLOCKED = [...(data.blocked?.th ?? []), ...(data.blocked?.en ?? [])].filter((w) => typeof w === "string" && w);
  ALLOW = (data.allow ?? []).filter((w) => typeof w === "string" && w);
} catch (err) {
  console.warn(`อ่าน badwords.json ไม่ได้ (${err.message}) — ข้ามตัวกรองคำไม่เหมาะสม (ชื่อยังผ่านกติกาความยาว/อักขระปกติอยู่)`);
}

// เลขที่คนมักใช้แทนตัวอักษรตอนเลี่ยงตัวกรอง (เช่น a55hole → asshole)
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };
const ZERO_WIDTH_RE = /[​-‍﻿⁠]/g;
// ตัดช่องว่าง จุด ขีด สัญลักษณ์ และตัวเลขที่เหลือ (ตัวเลขที่ใช้แทนตัวอักษรถูกแปลงเป็นตัวอักษรไปแล้วก่อนหน้า)
// *ไม่* ตัด \p{M} (สระบน/ล่าง วรรณยุกต์ไทย) เพราะเป็นส่วนหนึ่งของตัวสะกดปกติ ตัดทิ้งจะทำให้คำไทยชนกันมั่วได้ง่ายเกินไป
const STRIP_RE = /[\s\p{P}\p{S}\p{N}]/gu;

// แปลงข้อความให้อยู่ในรูปเทียบง่าย: ตัวเล็ก → ตัดอักขระล่องหน → แปลงเลขแทนตัวอักษร → ตัดช่องว่าง/สัญลักษณ์ → ยุบตัวซ้ำ
// ต้องแปลงเลขแทนตัวอักษรก่อนตัดสัญลักษณ์ ไม่งั้น @ กับ $ จะถูกตัดทิ้งไปก่อนมีโอกาสแปลงเป็นตัวอักษร
function normalize(raw) {
  let s = String(raw ?? "").toLowerCase();
  s = s.replace(ZERO_WIDTH_RE, "");
  s = [...s].map((ch) => LEET[ch] ?? ch).join("");
  s = s.replace(STRIP_RE, "");
  s = s.replace(/(.)\1+/gu, "$1"); // ยุบตัวซ้ำติดกัน เช่น "fuuuuck" → "fuck"
  return s;
}

// เจอคำต้องห้ามอยู่ในชื่อไหม (เทียบแบบ substring หลัง normalize ทั้งสองฝั่ง)
// คำที่เจอ "ถูกคุ้มครอง" ถ้ามันเป็นแค่ส่วนหนึ่งของคำปลอดภัยในรายการยกเว้นที่ปรากฏอยู่ในชื่อจริงๆ
// (เช่น "ass" อยู่ใน "class" — ถ้าชื่อคือ "classic" ก็ไม่โดน แต่ถ้าชื่อคือแค่ "ass" เฉยๆ ก็ยังโดนอยู่)
function hasBadWord(raw) {
  const n = normalize(raw);
  if (!n) return false;
  for (const bad of BLOCKED) {
    const nb = normalize(bad);
    if (!nb || !n.includes(nb)) continue;
    const covered = ALLOW.some((safe) => {
      const ns = normalize(safe);
      return ns.includes(nb) && n.includes(ns);
    });
    if (!covered) return true;
  }
  return false;
}

module.exports = { hasBadWord, normalize };
