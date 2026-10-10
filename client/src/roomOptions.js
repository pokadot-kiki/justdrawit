// ตัวเลือกของห้องที่ใช้ร่วมกันหลายหน้า (SET UP · ห้องรอ · รายการห้อง Public · Solo)
// ค่าต้องตรงกับที่ server รับ (events.md §1) — server ตรวจซ้ำเสมอ ค่าที่ไม่อนุญาตถูกเมิน
import teamRules from "../../shared/teamRules.json" with { type: "json" };
import challengeRules from "../../shared/challengeRules.json" with { type: "json" };

// ความยาก = "ชุดคำ" ที่ server สุ่มให้ (ไม่เกี่ยวกับเวลา)
export const DIFFICULTY_CHOICES = [
  ["easy", "ง่าย"],
  ["medium", "กลาง"],
  ["hard", "ยาก"],
];

// ห้องเล่นกับเพื่อนมี "ผสม" (สุ่มจากทุกระดับปนกัน) เพิ่มเป็นค่าเริ่มต้น · Solo ไม่มีผสม (ยากขึ้นตามด่าน)
export const ROOM_DIFFICULTY_CHOICES = [["mixed", "ผสม"], ...DIFFICULTY_CHOICES];

// จำนวนทีมและความจุจากกฎร่วมของ server/client · เลือกจำนวนทีมในห้องรอ
export const TEAM_IDS = teamRules.ids;
export const TEAM_CAPACITY = teamRules.capacity;
export const TEAM_COUNT_CHOICES = TEAM_IDS.map((_, index) => index + 1).filter((count) => count >= teamRules.minTeams);

// จำนวนผู้เล่นสูงสุดของโหมดที่ไม่ใช่ทีม (โหมดทีมคำนวณจากจำนวนทีม × ความจุต่อทีม)
export const MAX_PLAYER_CHOICES = [4, 6, 8];
export const DEFAULT_MAX_PLAYERS = 8;

// Public = ขึ้นในรายการห้องหน้าแรก กดเข้าได้เลย · Private = เข้าได้ด้วยรหัสห้อง/ลิงก์เชิญเท่านั้น
export const VISIBILITY_CHOICES = [
  ["private", "Private"],
  ["public", "Public"],
];

// ชนิดรูปแบบการวาดจาก registry ร่วม; Standard เป็นตัวเลือกสุ่มได้เหมือนแบบอื่น
const CHALLENGE_DETAILS = {
  none: { title: "Standard Drawing", desc: "วาดอิสระ ไม่มีกติกาพิเศษ" },
  colour_fix: { title: "Colour Fix", desc: "วาดได้สีเดียวที่ถูกล็อกตลอดตา" },
  dont_lift_pen: { title: "Don't Lift Pen", desc: "วาดได้เส้นเดียว ห้ามยกปากกา" },
  shapes_only: { title: "Geometric Shapes Only", desc: "ใช้ได้แต่เครื่องมือรูปทรง (เส้น สี่เหลี่ยม วงกลม สามเหลี่ยม)" },
};
export const STANDARD_CHALLENGE = challengeRules.standard;
export const CHALLENGE_CARDS = challengeRules.types.map((id) => ({ id, ...CHALLENGE_DETAILS[id] }));
export const ACTUAL_CHALLENGE_CARDS = CHALLENGE_CARDS.filter((card) => card.id !== STANDARD_CHALLENGE);

// ค่าเริ่มต้นเมื่อ server ยังไม่ได้ส่ง challenges มา (กันพังตอน render)
export const DEFAULT_CHALLENGES = challengeRules.types;

export function nextChallengeSelection(enabled, id) {
  if (!CHALLENGE_CARDS.some((card) => card.id === id)) return enabled;
  return enabled.includes(id) ? enabled.filter((type) => type !== id) : CHALLENGE_CARDS.map((card) => card.id).filter((type) => enabled.includes(type) || type === id);
}

export const difficultyLabel = (d) => ROOM_DIFFICULTY_CHOICES.find(([v]) => v === d)?.[1] ?? "ผสม";
