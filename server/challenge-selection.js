const { standard, types } = require("../shared/challengeRules.json");

const actualTypes = types.filter((type) => type !== standard);

function sanitizeChallenges(list) {
  if (!Array.isArray(list)) return null;
  const selected = types.filter((type) => list.includes(type));
  return selected.length ? selected : null;
}

function selectChallengeType(enabled, random = Math.random) {
  if (!Array.isArray(enabled)) throw new Error("INVALID_CHALLENGES");
  const pool = types.filter((type) => enabled.includes(type));
  if (!pool.length) throw new Error("INVALID_CHALLENGES");
  // ทุกแบบที่เปิดมีโอกาสเท่ากันในทุกตา รวม Standard ด้วย
  return pool[Math.floor(random() * pool.length)];
}

module.exports = { standard, types, actualTypes, sanitizeChallenges, selectChallengeType };
