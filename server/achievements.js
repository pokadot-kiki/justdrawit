const definitions = require("../shared/achievements.json");
const targets = new Map(definitions.map((item) => [item.id, item.target]));

function createState() {
  return { unlocked: new Set(), equipped: null, progress: {}, dailyDate: null, dailyGames: 0 };
}

function snapshot(state, scope) {
  return {
    scope,
    unlocked: [...state.unlocked],
    equipped: state.equipped,
    progress: Object.fromEntries(definitions.filter((item) => item.scope === scope)
      .map((item) => [item.id, Math.min(item.target, state.progress[item.id] || 0)])),
  };
}

function add(state, id, amount, onUnlock) {
  if (state.unlocked.has(id)) return;
  state.progress[id] = (state.progress[id] || 0) + amount;
  if (state.progress[id] >= targets.get(id)) {
    state.unlocked.add(id);
    onUnlock(id);
  }
}

function set(state, id, value, onUnlock) {
  if (state.unlocked.has(id)) return;
  state.progress[id] = value;
  if (value >= targets.get(id)) {
    state.unlocked.add(id);
    onUnlock(id);
  }
}

function guess(state, { correct, first, fast }, onUnlock) {
  if (!correct) {
    set(state, "ทายติดคริ", 0, onUnlock);
    set(state, "พรสวรรค์คูณสอง", 0, onUnlock);
    return;
  }
  add(state, "ทายติดคริ", 1, onUnlock);
  add(state, "พรสวรรค์คูณสอง", 1, onUnlock);
  if (first) add(state, "นิ้วไวไฟ", 1, onUnlock);
  if (first && fast) add(state, "นิ้วไวแสง", 1, onUnlock);
}

function drawing(state, { challenge, allCorrect, fast, shapes, strokes, lifted, correctCount }, onUnlock) {
  if (challenge === "none" && fast) add(state, "นักวาดฟรีสไตล์", 1, onUnlock);
  if (challenge === "colour_fix" && allCorrect) add(state, "พรหมลิขิตสีเดียว", 1, onUnlock);
  if (challenge === "dont_lift_pen" && allCorrect && strokes === 1 && !lifted && shapes === 0) add(state, "เซียนมือนิ่ง", 1, onUnlock);
  if (fast && shapes >= 1 && shapes <= 5) add(state, "เซียนเรขาคณิต", 1, onUnlock);
  if (correctCount >= 2) add(state, "อาร์ตตัวจริง", 1, onUnlock);
}

function game(state, { won, teamCarry, completed, creatorPrivate, utcDay }, onUnlock) {
  if (!completed) return;
  if (won) add(state, "ตัวตึงไร้พ่าย", 1, onUnlock);
  else set(state, "ตัวตึงไร้พ่าย", 0, onUnlock);
  if (teamCarry) add(state, "แบกเพื่อนตึงๆ", 1, onUnlock);
  add(state, "ตัวเก๋าประจำห้อง", 1, onUnlock);
  if (state.dailyDate !== utcDay) { state.dailyDate = utcDay; state.dailyGames = 0; }
  state.dailyGames++;
  set(state, "นกเฝ้าห้อง", state.dailyGames, onUnlock);
  if (creatorPrivate) add(state, "เจ้าของห้องตัวจริง", 1, onUnlock);
}

function soloRound(state, { hard, lifeLost }, onUnlock) {
  if (!hard) return;
  add(state, "ราชา AI", 1, onUnlock);
  if (lifeLost) set(state, "ไร้บาดแผล", 0, onUnlock);
  else add(state, "ไร้บาดแผล", 1, onUnlock);
}

module.exports = { createState, snapshot, guess, drawing, game, soloRound };
