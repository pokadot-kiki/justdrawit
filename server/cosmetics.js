// ---------- เครื่องประดับของอวตาร (เฟส B3) ----------
// ไม่ผูกกับ socket · รายการไอเทมอยู่ที่ shared/cosmetics.json ไฟล์เดียว (หน้าเว็บอ่านไฟล์เดียวกันไว้วาด)
// ชุดที่ใส่ = { frame, hat, glasses, neck, background } แต่ละช่องเป็น id ของไอเทม หรือ null (ไม่ใส่)
// server เป็นคนตรวจทุกครั้ง: ไอเทมต้องมีจริง · ตรงช่อง · มีสิทธิ์ใช้ — หน้าเว็บส่ง id อะไรมาก็ได้ แต่ที่ไม่ผ่านจะไม่ถูกใช้
const catalog = require("../shared/cosmetics.json");

const SLOTS = catalog.slots;
const ITEMS = new Map(catalog.items.map((item) => [item.id, item]));

const empty = () => Object.fromEntries(SLOTS.map((slot) => [slot, null]));

// สิทธิ์ใช้ไอเทม: ตอนนี้ = เป็นของฟรี (ใช้ได้ทุกคน รวม guest)
// เฟส B2 (ร้านค้า) จะเพิ่ม "บัญชีนี้ซื้อแล้ว" ที่ฟังก์ชันนี้ที่เดียว — accountId รับไว้ล่วงหน้าเพื่อการนั้น
function canUse(item, accountId) { // eslint-disable-line no-unused-vars
  return item.free === true;
}

// ตรวจการใส่หนึ่งช่อง (event equip — ผู้เล่นตั้งใจส่งมา จึงตอบเหตุผลชัดๆ)
// itemId = null คือถอดออก · คืน { ok: true, slot, itemId } หรือ { ok: false, error }
function check(slot, itemId, accountId = null) {
  if (typeof slot !== "string" || !SLOTS.includes(slot)) return { ok: false, error: "INVALID_ITEM" };
  if (itemId === null) return { ok: true, slot, itemId: null };
  if (typeof itemId !== "string" || !ITEMS.has(itemId)) return { ok: false, error: "INVALID_ITEM" };
  const item = ITEMS.get(itemId);
  if (item.slot !== slot) return { ok: false, error: "INVALID_ITEM" }; // เช่นเอาหมวกไปใส่ช่องแว่น
  if (!canUse(item, accountId)) return { ok: false, error: "NOT_OWNED" };
  return { ok: true, slot, itemId };
}

// ล้างทั้งชุดที่แนบมาตอนสร้างห้อง/เข้าห้อง (ค่าที่จำไว้ในเบราว์เซอร์ อาจเก่าหรือถูกแก้เอง)
// ช่องไหนไม่ผ่านการตรวจ = ถอดช่องนั้น (null) เงียบๆ ไม่ทำให้เข้าห้องไม่ได้ · ช่องที่ไม่รู้จักถูกทิ้ง
function sanitize(input, accountId = null) {
  const out = empty();
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const slot of SLOTS) {
    const value = input[slot];
    if (value === null || value === undefined) continue;
    const result = check(slot, value, accountId);
    if (result.ok) out[slot] = result.itemId;
  }
  return out;
}

module.exports = { SLOTS, ITEMS, empty, check, sanitize, canUse };
