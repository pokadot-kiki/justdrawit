// Coins, prices, and rewards live on the server. All data is in memory until server restart.
const CATALOG = Object.freeze([
  { id: "gold_crown", name: "มงกุฎทอง", slot: "hat", price: 120 },
  { id: "wizard_hat", name: "หมวกพ่อมด", slot: "hat", price: 80 },
  { id: "bunny_ears", name: "หูกระต่าย", slot: "hat", price: 55 },
  { id: "cat_ears", name: "หูแมว", slot: "hat", price: 55 },
  { id: "chef_hat", name: "หมวกเชฟ", slot: "hat", price: 40 },
  { id: "pirate_hat", name: "หมวกโจรสลัด", slot: "hat", price: 65 },
  { id: "mushroom_hat", name: "หมวกเห็ด", slot: "hat", price: 50 },
  { id: "angel_halo", name: "รัศมีเทวดา", slot: "hat", price: 90 },
  { id: "gold_frame", name: "กรอบทองคำ", slot: "frame", price: 70 },
  { id: "flower_frame", name: "กรอบดอกไม้", slot: "frame", price: 45 },
  { id: "heart_frame", name: "กรอบหัวใจ", slot: "frame", price: 50 },
  { id: "star_frame", name: "กรอบดวงดาว", slot: "frame", price: 55 },
  { id: "rainbow_frame", name: "กรอบสายรุ้ง", slot: "frame", price: 75 },
  { id: "ice_frame", name: "กรอบน้ำแข็ง", slot: "frame", price: 65 },
  { id: "fire_frame", name: "กรอบเปลวไฟ", slot: "frame", price: 75 },
  { id: "galaxy_frame", name: "กรอบกาแล็กซี", slot: "frame", price: 90 },
  { id: "cloud_base", name: "ฐานเมฆ", slot: "base", price: 35 },
  { id: "flower_base", name: "ฐานดอกไม้", slot: "base", price: 40 },
  { id: "gold_base", name: "ฐานทองคำ", slot: "base", price: 65 },
  { id: "rainbow_base", name: "ฐานสายรุ้ง", slot: "base", price: 70 },
  { id: "ice_base", name: "ฐานน้ำแข็ง", slot: "base", price: 60 },
  { id: "lava_base", name: "ฐานลาวา", slot: "base", price: 75 },
  { id: "star_base", name: "ฐานดวงดาว", slot: "base", price: 55 },
  { id: "galaxy_base", name: "ฐานกาแล็กซี", slot: "base", price: 90 },
  // Items sold by the first shop remain usable for players who already bought them.
  { id: "sun_cap", name: "หมวกแดด", slot: "hat", price: 20, retired: true },
  { id: "pixel_glasses", name: "แว่นพิกเซล", slot: "frame", price: 25, retired: true },
  { id: "blue_bow", name: "โบว์สีฟ้า", slot: "base", price: 15, retired: true },
]);

const REWARDS = Object.freeze({ completedRoomGame: 10, completedSoloGame: 5 });
const SLOTS = Object.freeze(["hat", "frame", "base"]);
const records = new Map();

function key(accountId, playerId) {
  return accountId ? `account:${accountId}` : `guest:${playerId}`;
}

function record(identity) {
  let value = records.get(identity);
  if (!value) {
    value = { coins: 0, owned: new Set(), equipped: { hat: null, frame: null, base: null }, rewards: new Set() };
    records.set(identity, value);
  }
  return value;
}

function snapshot(identity) {
  const state = record(identity);
  return { coins: state.coins, owned: [...state.owned], equipped: { ...state.equipped }, catalog: CATALOG.filter((item) => !item.retired || state.owned.has(item.id)) };
}

function buy(identity, itemId) {
  const item = CATALOG.find((entry) => entry.id === itemId);
  if (!item || item.retired) return { ok: false, error: "ITEM_NOT_FOUND" };
  const state = record(identity);
  if (state.owned.has(itemId)) return { ok: false, error: "ALREADY_OWNED" };
  if (state.coins < item.price) return { ok: false, error: "INSUFFICIENT_COINS" };
  state.coins -= item.price;
  state.owned.add(itemId);
  return { ok: true, state: snapshot(identity) };
}

function saveOutfit(identity, next) {
  if (!next || typeof next !== "object" || Array.isArray(next) || Object.keys(next).some((slot) => !SLOTS.includes(slot))) {
    return { ok: false, error: "INVALID_OUTFIT" };
  }
  const state = record(identity);
  for (const slot of SLOTS) {
    const itemId = next[slot] ?? null;
    if (itemId !== null) {
      const item = CATALOG.find((entry) => entry.id === itemId && entry.slot === slot);
      if (!item || !state.owned.has(itemId)) return { ok: false, error: "ITEM_NOT_OWNED" };
    }
  }
  state.equipped = Object.fromEntries(SLOTS.map((slot) => [slot, next[slot] ?? null]));
  return { ok: true, state: snapshot(identity) };
}

function grant(identity, rewardId, amount) {
  const state = record(identity);
  if (state.rewards.has(rewardId) || !Number.isSafeInteger(amount) || amount <= 0) return false;
  state.rewards.add(rewardId);
  state.coins += amount;
  return true;
}

module.exports = { key, snapshot, buy, saveOutfit, grant, REWARDS };
