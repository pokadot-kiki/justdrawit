// ช่วยเดาคำในช่องทาย — คำแนะนำคำนวณในเบราว์เซอร์ทั้งหมด ไม่ส่งอะไรไป server
//
// คลังคำ: client/public/data/guess-words.json (สร้างโดย client/scripts/get-guess-words.mjs)
//   มาจาก PyThaiNLP (https://github.com/PyThaiNLP/pythainlp) สัญญาอนุญาต CC0-1.0
//   (Creative Commons Zero — ใช้ซ้ำ/ดัดแปลงได้อิสระ ไม่บังคับเครดิต) รายละเอียดเต็มดูที่หัวไฟล์ get-guess-words.mjs
//   คำเรียงจาก "ใช้บ่อย" ไปหา "ใช้น้อย" ตามข้อมูลความถี่จริงจาก Thai National Corpus — ไม่เกี่ยวกับคลังคำของเกมเราเลย
//   (ไม่ได้ดึงหรือให้น้ำหนักจาก words.json/ai-words.json แต่อย่างใด กันไม่ให้กลายเป็นการใบ้คำตอบ)
// ไฟล์นี้อยู่ใน client/public/ (ไม่ถูกมัดรวมเข้า bundle หลักของ Vite) โหลดด้วย fetch() ตอนเปิดช่องทายครั้งแรกเท่านั้น

const DATA_URL = "/data/guess-words.json";
let wordsPromise = null;

function loadWords() {
  if (!wordsPromise) {
    wordsPromise = fetch(DATA_URL)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  }
  return wordsPromise;
}

function normalize(str) {
  return String(str || "").trim();
}

// ระยะห่างแบบ Levenshtein ทั่วไป ตัดจบเร็วถ้าความยาวต่างกันเกิน maxDist อยู่แล้ว (คำสั้นๆ จึงไวมาก)
function levenshtein(a, b, maxDist) {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

// จับคู่: คำขึ้นต้นตรงกันก่อนเสมอ (เรียงตามความถี่ของคลังคำ = ลำดับในไฟล์) แล้วค่อยเติมด้วยคำสะกดใกล้เคียง
// (กันพิมพ์ผิดเล็กน้อย) เฉพาะตอนคำขึ้นต้นตรงยังไม่ครบ limit — ไม่แตะคลังคำของเกมเราเลยทั้งสองขั้น
export async function predictWords(input, limit = 3) {
  const query = normalize(input);
  if (!query) return [];
  const words = await loadWords();
  if (!words.length) return [];

  const prefixMatches = [];
  for (const w of words) {
    if (w === query) continue;
    if (w.startsWith(query)) {
      prefixMatches.push(w);
      if (prefixMatches.length >= limit) break; // คลังคำเรียงตามความถี่อยู่แล้ว เจอครบก่อนแปลว่าได้ตัวที่ใช้บ่อยสุดแล้ว
    }
  }

  const fuzzyMatches = [];
  if (prefixMatches.length < limit && query.length >= 2) {
    const maxDist = query.length <= 3 ? 1 : 2;
    for (const w of words) {
      if (prefixMatches.includes(w)) continue;
      if (Math.abs([...w].length - [...query].length) > maxDist) continue;
      if (levenshtein(query, w, maxDist) <= maxDist) {
        fuzzyMatches.push(w);
        if (prefixMatches.length + fuzzyMatches.length >= limit) break;
      }
    }
  }

  return [...prefixMatches, ...fuzzyMatches].slice(0, limit);
}
