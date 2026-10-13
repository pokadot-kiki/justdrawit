// Multiplayer VS AI only. Energy and attacks live in the current game, never in Economy.
const MAX_ENERGY = 100;
const DRAW_ACTIONS_PER_REWARD = 2;
const DRAW_REWARD = 10;
const DRAW_REWARD_CAP = 40;
const CORRECT_REWARD = 15;
const ATTACK_REQUEST_GAP_MS = 500;
const ITEMS = Object.freeze(require("../shared/chaos-items.json"));

function create(players) {
  return {
    energy: new Map(players.map((player) => [player.id, 0])),
    cooldowns: new Map(), effects: new Map(), shields: new Map(),
    actions: new Map(), drawEarned: new Map(), attempts: new Map(), round: 0,
  };
}

function phaseStart(state, players, round) {
  state.effects.clear();
  state.actions.clear();
  state.drawEarned.clear();
  if (state.round !== round) {
    state.shields = new Map(players.map((player) => [player.id, 1]));
    state.round = round;
  }
  for (const player of players) if (!state.energy.has(player.id)) state.energy.set(player.id, 0);
}

function active(state, targetId) {
  const effect = state?.effects.get(targetId);
  if (!effect) return null;
  if (effect.until <= Date.now()) {
    state.effects.delete(targetId);
    return null;
  }
  return effect;
}

function snapshot(state, playerId) {
  const now = Date.now();
  return {
    energy: state.energy.get(playerId) ?? 0, maxEnergy: MAX_ENERGY,
    items: ITEMS, shield: state.shields.get(playerId) ?? 0,
    cooldowns: Object.fromEntries(ITEMS.map((item) => [item.id, state.cooldowns.get(`${playerId}:${item.id}`) ?? 0])),
    selfEffect: active(state, playerId), aiEffect: active(state, "ai"), serverNow: now,
  };
}

function grant(state, playerId, amount) {
  if (!state.energy.has(playerId)) return false;
  const old = state.energy.get(playerId);
  state.energy.set(playerId, Math.min(MAX_ENERGY, old + amount));
  return state.energy.get(playerId) !== old;
}

function drawingAction(state, playerId) {
  const n = (state.actions.get(playerId) ?? 0) + 1;
  state.actions.set(playerId, n);
  if (n % DRAW_ACTIONS_PER_REWARD || (state.drawEarned.get(playerId) ?? 0) >= DRAW_REWARD_CAP) return false;
  state.drawEarned.set(playerId, (state.drawEarned.get(playerId) ?? 0) + DRAW_REWARD);
  return grant(state, playerId, DRAW_REWARD);
}

function attack(state, { attackerId, targetId, itemId, phase, players, doneIds, challenge }) {
  const item = ITEMS.find((entry) => entry.id === itemId);
  if (!item) return { ok: false, error: "INVALID_ITEM" };
  if (!state.energy.has(attackerId) || targetId === attackerId) return { ok: false, error: "INVALID_TARGET" };
  const aiTarget = targetId === "ai";
  if (phase !== "draw" && phase !== "watch") return { ok: false, error: "INVALID_PHASE" };
  if (!aiTarget && (phase !== "draw" || !players.some((p) => p.id === targetId && p.connected !== false) || doneIds.has(targetId))) return { ok: false, error: "INVALID_TARGET" };
  if (itemId === "rainbow_chaos" && !aiTarget && challenge?.type === "colour_fix") return { ok: false, error: "CHALLENGE_CONFLICT" };
  const now = Date.now();
  if (active(state, targetId)) return { ok: false, error: "TARGET_BUSY" };
  if ((state.cooldowns.get(`${attackerId}:${itemId}`) ?? 0) > now) return { ok: false, error: "COOLDOWN" };
  if ((state.energy.get(attackerId) ?? 0) < item.price) return { ok: false, error: "NO_ENERGY" };
  if (now - (state.attempts.get(attackerId) ?? 0) < ATTACK_REQUEST_GAP_MS) return { ok: false, error: "TOO_FAST" };
  state.attempts.set(attackerId, now);
  if (!aiTarget && (state.shields.get(targetId) ?? 0) > 0) {
    state.shields.set(targetId, 0);
    return { ok: false, error: "SHIELDED", shieldUsed: true };
  }
  const effect = { id: item.id, targetId, until: now + item.durationMs };
  state.energy.set(attackerId, state.energy.get(attackerId) - item.price);
  state.cooldowns.set(`${attackerId}:${itemId}`, now + item.cooldownMs);
  state.effects.set(targetId, effect);
  return { ok: true, effect };
}

const clamp = (value) => Math.max(0, Math.min(1, value));
function point(effect, x, y) {
  if (effect?.id === "cursed_doodle") return { x: clamp(1 - x), y: clamp(y) };
  if (effect?.id === "shaky_hand") return { x: clamp(x + (Math.random() - .5) * .045), y: clamp(y + (Math.random() - .5) * .045) };
  return { x, y };
}

const RAINBOW = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];
function color(effect, original) {
  return effect?.id === "rainbow_chaos" ? RAINBOW[Math.floor(Date.now() / 350) % RAINBOW.length] : original;
}

module.exports = { ITEMS, MAX_ENERGY, CORRECT_REWARD, create, phaseStart, active, snapshot, grant, drawingAction, attack, point, color };
