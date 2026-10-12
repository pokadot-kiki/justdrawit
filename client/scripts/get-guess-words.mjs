// ดึงคลังคำสำหรับ "ช่วยเดาคำ" (predictive text) ในช่องทายคำ — รันครั้งเดียวตอนพัฒนา ไม่ได้รันตอนเล่นเกมจริง
// แหล่งข้อมูล: PyThaiNLP (https://github.com/PyThaiNLP/pythainlp) — โครงการโอเพนซอร์ส Apache-2.0
//   คลังคำ/ชุดข้อมูลของ PyThaiNLP เองประกาศสัญญาอนุญาตแยกจากโค้ด ดูได้ที่
//   https://github.com/PyThaiNLP/pythainlp/blob/dev/pythainlp/corpus/corpus_license.md
//   ไฟล์ที่ใช้ทั้งสองไฟล์อยู่ในหมวด "Dictionaries and Word Lists" ซึ่งระบุว่า
//   "created by the PyThaiNLP project and released under Creative Commons Zero 1.0
//   Universal Public Domain Dedication License (CC0-1.0)" — ไม่บังคับเครดิต ใช้ซ้ำ/ดัดแปลงได้อิสระ
//   - tnc_freq.txt   คำ+ความถี่จาก Thai National Corpus (ใช้เรียงลำดับ "คำที่ใช้บ่อย")
//   - stopwords_th.txt  คำฟังก์ชัน/คำเชื่อมภาษาไทย (ใช้กรองคำที่ไม่มีประโยชน์ต่อการทายคำ เช่น "ที่" "การ" "เป็น")
// ไม่ได้ใช้ words.json/ai-words.json ของเกมเราเองเลยในการกรองหรือจัดอันดับ (กันใบ้คำตอบ)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(ROOT, "../public/data/guess-words.json");
const TNC_URL = "https://raw.githubusercontent.com/PyThaiNLP/pythainlp/dev/pythainlp/corpus/tnc_freq.txt";
const STOPWORDS_URL = "https://raw.githubusercontent.com/PyThaiNLP/pythainlp/dev/pythainlp/corpus/stopwords_th.txt";
const CAP = 8000; // จำนวนคำสูงสุดหลังกรอง (เรียงจากใช้บ่อยไปน้อย) — ยิ่งมากไฟล์ยิ่งใหญ่ วัดแล้ว gzip ~38KB ที่ 8000 คำ

// เฉพาะอักษรไทย (พยัญชนะ+สระ+วรรณยุกต์) ไม่มีเลข/เว้นวรรค/จุด — กันคำย่อ ("ก.ค.") และวลี ("ก ข ไม่กระดิกหู") หลุดเข้ามา
const THAI_ONLY = /^[ก-ฺเ-๎]+$/;

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลด ${url} ไม่สำเร็จ: ${res.status}`);
  return res.text();
}

async function main() {
  console.log("กำลังโหลดคลังคำจาก PyThaiNLP (CC0-1.0)...");
  const [tnc, stop] = await Promise.all([fetchText(TNC_URL), fetchText(STOPWORDS_URL)]);

  const stopwords = new Set(stop.split("\n").map((l) => l.trim()).filter(Boolean));

  const seen = new Set();
  const words = [];
  for (const line of tnc.split("\n")) {
    const [w, freqStr] = line.split("\t");
    if (!w || !freqStr) continue;
    if (stopwords.has(w)) continue;
    if (!THAI_ONLY.test(w)) continue;
    const n = [...w].length; // นับอักขระแบบเดียวกับที่อื่นในโปรเจกต์ (กันสระ/วรรณยุกต์นับซ้อน)
    if (n < 2 || n > 12) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    words.push(w); // tnc_freq.txt เรียงจากความถี่สูงไปต่ำอยู่แล้ว ไม่ต้องเก็บตัวเลขความถี่ไว้ก็ได้
  }

  const final = words.slice(0, CAP);
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const json = JSON.stringify(final);
  const bytes = Buffer.byteLength(json, "utf8"); // json.length นับหน่วย UTF-16 ไม่ใช่ไบต์จริง ภาษาไทยหนึ่งตัวอักษร = 3 ไบต์ใน UTF-8 ต้องนับแบบนี้ถึงถูก
  fs.writeFileSync(OUT_FILE, json);

  console.log(`กรองได้ ${words.length} คำ (ก่อนตัด) → เก็บ ${final.length} คำ`);
  console.log(`เขียนไฟล์: ${OUT_FILE} (${(bytes / 1024).toFixed(1)} KB ก่อนบีบอัด)`);
}

main().catch((err) => {
  console.error("พัง:", err.message);
  process.exitCode = 1;
});
