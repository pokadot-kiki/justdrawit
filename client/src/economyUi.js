export const SLOT_NAMES = { hat: "หมวก (Hats)", frame: "กรอบ (Frames)", base: "ฐานรอง (Bases)" };
export const slotName = (slot) => SLOT_NAMES[slot] || slot;

export function economyError(code) {
  return {
    INSUFFICIENT_COINS: "Coins ไม่เพียงพอ",
    ALREADY_OWNED: "คุณซื้อไอเทมนี้แล้ว",
    ITEM_NOT_FOUND: "ไม่พบสินค้านี้",
    ITEM_NOT_OWNED: "ยังไม่มีสิทธิ์ใช้ไอเทมนี้",
    INVALID_OUTFIT: "ชุดที่เลือกไม่ถูกต้อง",
    CONNECT_FAILED: "เชื่อมต่อ Server ไม่สำเร็จ กรุณาลองอีกครั้ง",
  }[code] || "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง";
}
