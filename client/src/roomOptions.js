// ตัวเลือกของห้องที่ใช้ร่วมกันหลายหน้า (SET UP · ห้องรอ · รายการห้อง Public · Solo)
// ค่าต้องตรงกับที่ server รับ (events.md §1) — server ตรวจซ้ำเสมอ ค่าที่ไม่อนุญาตถูกเมิน

// ความยาก = "ชุดคำ" ที่ server สุ่มให้ (ไม่เกี่ยวกับเวลา)
export const DIFFICULTY_CHOICES = [
  ["easy", "ง่าย"],
  ["medium", "กลาง"],
  ["hard", "ยาก"],
];

// Public = ขึ้นในรายการห้องหน้าแรก กดเข้าได้เลย · Private = เข้าได้ด้วยรหัสห้อง/ลิงก์เชิญเท่านั้น
export const VISIBILITY_CHOICES = [
  ["private", "Private"],
  ["public", "Public"],
];

// การ์ด Mini Challenge 4 ใบ ที่หัวห้องเปิด/ปิดทีละใบในห้องรอ (ตรงกับ CHALLENGE_TYPES ของ server)
// "none" = Standard Drawing (วาดอิสระ) · ต้องเปิดอย่างน้อย 1 ใบเสมอ · server สุ่มแต่ละตาจากใบที่เปิด
export const CHALLENGE_CARDS = [
  { id: "none", title: "Standard Drawing", desc: "วาดอิสระ ไม่มีกติกาพิเศษ" },
  { id: "colour_fix", title: "Colour Fix", desc: "วาดได้สีเดียวที่ถูกล็อกตลอดตา" },
  { id: "dont_lift_pen", title: "Don't Lift Pen", desc: "วาดได้เส้นเดียว ห้ามยกปากกา" },
  { id: "shapes_only", title: "Geometric Shapes Only", desc: "ใช้ได้แต่เครื่องมือรูปทรง (เส้น สี่เหลี่ยม วงกลม สามเหลี่ยม)" },
];

// ค่าเริ่มต้นเมื่อ server ยังไม่ได้ส่ง challenges มา (กันพังตอน render)
export const DEFAULT_CHALLENGES = ["none", "colour_fix", "dont_lift_pen", "shapes_only"];

export const difficultyLabel = (d) => DIFFICULTY_CHOICES.find(([v]) => v === d)?.[1] ?? "ง่าย";
