// ตัวเลือกลดภาพเคลื่อนไหว (อนิเมชัน/พลุ/ตัวเลขวิ่ง)
// ค่าเริ่มต้นตามที่ตั้งไว้ในระบบ (prefers-reduced-motion) ผู้ใช้สลับเองได้ในกล่อง ℹ️ แล้วจำไว้ในเบราว์เซอร์
// ใช้ได้สองทาง: CSS อ่านจาก <html data-motion="reduce"> · JS อ่านจาก reduceMotion()

const KEY = "jdi.reduceMotion"; // "1" = ลด · "0" = ไม่ลด · ไม่มี = ตามระบบ
const listeners = new Set();
let value = false;

function systemPrefers() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function apply() {
  document.documentElement.dataset.motion = value ? "reduce" : "full";
}

try {
  const saved = localStorage.getItem(KEY);
  value = saved === null ? systemPrefers() : saved === "1";
} catch {
  value = systemPrefers();
}
apply();

export function reduceMotion() {
  return value;
}

export function setReduceMotion(next) {
  value = Boolean(next);
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    /* จำค่าไม่ได้ก็ยังใช้ได้ในรอบนี้ */
  }
  apply();
  listeners.forEach((fn) => fn());
}

export function subscribeMotion(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// กล่องกติกา ℹ️ โชว์เองครั้งแรกที่เข้าห้อง — จำไว้ว่าเคยเห็นแล้ว (ครั้งต่อไปกดดูเองได้จากปุ่ม ℹ️)
const RULES_KEY = "jdi.rulesSeen";

export function rulesSeen() {
  try {
    return localStorage.getItem(RULES_KEY) === "1";
  } catch {
    return true; // จำไม่ได้ก็ไม่โชว์ซ้ำๆ รบกวนทุกครั้ง
  }
}

// กติกาโหมดทีม โชว์เองครั้งแรกที่เริ่มเกมโหมดทีม (แยกกุญแจจากกติกาทั่วไป)
const TEAM_RULES_KEY = "jdi.teamRulesSeen";

export function teamRulesSeen() {
  try {
    return localStorage.getItem(TEAM_RULES_KEY) === "1";
  } catch {
    return true;
  }
}

export function markTeamRulesSeen() {
  try {
    localStorage.setItem(TEAM_RULES_KEY, "1");
  } catch {
    /* ไม่เป็นไร */
  }
}

export function markRulesSeen() {
  try {
    localStorage.setItem(RULES_KEY, "1");
  } catch {
    /* ไม่เป็นไร */
  }
}

// ── Economy & Rewards Persistence (Requires Authentication) ──
// ปิดไว้ก่อน (ซ่อนปุ่ม/UI ที่ใช้ระบบนี้ ไม่ได้ลบโค้ด) — เหรียญ/ของปลดล็อกเก็บใน localStorage ฝั่งผู้เล่นเอง
// แก้ไขค่าในเบราว์เซอร์เองได้ตรงๆ (เช่นเปิด DevTools แล้วพิมพ์ localStorage.setItem) ขัดกับหลัก server-authoritative
// ของโปรเจกต์นี้ (ทุกอย่างที่มีผลต่อคะแนน/ของในเกมต้องให้ server เป็นคนตัดสินเท่านั้น ดูกติกาใน CLAUDE.md)
// แม้มี Google login สำหรับเข้าเล่นแล้ว แต่ยังไม่ได้ผูกบัญชี/เหรียญกับ server จึงห้ามเปิดร้านค้าจนกว่าจะย้ายข้อมูลไปฝั่ง server
export const SHOP_ENABLED = false;
const COINS_KEY = "jdi.userCoins";
const UNLOCKED_AVATARS_KEY = "jdi.unlockedAvatars";
const AUTH_KEY = "jdi.userAuth";

export function getUserAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUserAuth(user) {
  try {
    if (!user) localStorage.removeItem(AUTH_KEY);
    else localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  } catch {}
}

export function getCoins() {
  try {
    const auth = getUserAuth();
    if (!auth) return 0; // Guest gets 0 coins
    return Number(localStorage.getItem(`${COINS_KEY}.${auth.username}`) || 0);
  } catch {
    return 0;
  }
}

export function addCoins(amount) {
  try {
    const auth = getUserAuth();
    if (!auth || amount <= 0) return 0;
    const current = getCoins();
    const updated = current + amount;
    localStorage.setItem(`${COINS_KEY}.${auth.username}`, String(updated));
    return updated;
  } catch {
    return 0;
  }
}

export function getUnlockedAvatars() {
  try {
    const auth = getUserAuth();
    if (!auth) return [0, 1]; // Default free avatars for guests
    const raw = localStorage.getItem(`${UNLOCKED_AVATARS_KEY}.${auth.username}`);
    return raw ? JSON.parse(raw) : [0, 1];
  } catch {
    return [0, 1];
  }
}

export function unlockAvatar(idx) {
  try {
    const auth = getUserAuth();
    if (!auth) return false;
    const unlocked = getUnlockedAvatars();
    if (!unlocked.includes(idx)) {
      unlocked.push(idx);
      localStorage.setItem(`${UNLOCKED_AVATARS_KEY}.${auth.username}`, JSON.stringify(unlocked));
    }
    return true;
  } catch {
    return false;
  }
}
