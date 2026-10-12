// เครื่องประดับฝั่งหน้าเว็บ: รายการไอเทม (ไฟล์เดียวกับที่ server ใช้ตรวจ) + ชุดที่จำไว้ในเบราว์เซอร์
// ชุดที่ใส่ = { frame, hat, glasses, neck, background } แต่ละช่องเป็น id หรือ null
// ฝั่งนี้แค่ช่วยให้ใช้ง่าย — server ตรวจซ้ำเสมอ (ตอนสร้างห้อง/เข้าห้อง และ event equip · events.md หัวข้อ 12)
// ตอนนี้ชุดเก็บในเบราว์เซอร์ (เหมือนอวตาร) เปลี่ยนเครื่องแล้วไม่ตามมา — ผูกกับบัญชีจะทำพร้อมร้านค้า (เฟส B2)
import catalog from "../../shared/cosmetics.json" with { type: "json" };

export const SLOTS = catalog.slots;
export const ITEMS = catalog.items;
export const SLOT_LABEL = { frame: "กรอบ", hat: "หมวก", glasses: "แว่น", neck: "คอ", background: "พื้นหลัง" };
export const COMPACT_SLOTS = ["hat", "glasses", "neck"]; // ที่แสดงในอวตารขนาดเล็ก (แถบคะแนน)

const KEY = "jdi.cosmetics";
const byId = new Map(ITEMS.map((item) => [item.id, item]));

export const emptyLook = () => Object.fromEntries(SLOTS.map((slot) => [slot, null]));
export const itemsOf = (slot) => ITEMS.filter((item) => item.slot === slot);

// เก็บเฉพาะช่องที่ id มีจริงและตรงช่อง ที่เหลือเป็น null (ค่าใน localStorage อาจเก่าหรือถูกแก้เอง)
export function cleanLook(input) {
  const out = emptyLook();
  if (!input || typeof input !== "object") return out;
  for (const slot of SLOTS) if (byId.get(input[slot])?.slot === slot) out[slot] = input[slot];
  return out;
}

export const hasAny = (look, slots = SLOTS) => Boolean(look) && slots.some((slot) => look[slot]);
export const sameLook = (a, b) => SLOTS.every((slot) => (a?.[slot] ?? null) === (b?.[slot] ?? null));

export function loadLook() {
  try {
    return cleanLook(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return emptyLook();
  }
}

export function saveLook(look) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cleanLook(look)));
  } catch {
    /* ไม่เป็นไร (โหมดส่วนตัว/ที่เก็บเต็ม) */
  }
}
