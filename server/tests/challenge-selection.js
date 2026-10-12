const assert = require("node:assert/strict");
const { test } = require("node:test");
const { standard, types, actualTypes, sanitizeChallenges, selectChallengeType } = require("../challenge-selection");

test("all four enabled: each option, including Standard, occupies an equal random interval", () => {
  for (let index = 0; index < types.length; index++) {
    assert.equal(selectChallengeType(types, () => (index + 0.5) / types.length), types[index]);
  }
});

test("one enabled option always wins, including Standard", () => {
  for (const type of types) {
    for (const random of [() => 0, () => 0.999]) assert.equal(selectChallengeType([type], random), type);
  }
});

test("every turn selects only an enabled option, with no memory or separate chance gate", () => {
  for (const excluded of types) {
    const enabled = types.filter((type) => type !== excluded);
    for (let index = 0; index < enabled.length; index++) {
      const random = () => (index + 0.5) / enabled.length;
      assert.equal(selectChallengeType(enabled, random), enabled[index]);
      assert.equal(selectChallengeType(enabled, random), enabled[index]);
    }
  }
  assert.deepEqual(actualTypes, types.filter((type) => type !== standard));
});

test("empty or unknown settings fail validation rather than silently selecting Standard", () => {
  for (const invalid of [[], ["bogus"], null, "none", {}]) assert.equal(sanitizeChallenges(invalid), null);
  assert.throws(() => selectChallengeType([]), /INVALID_CHALLENGES/);
  assert.deepEqual(sanitizeChallenges([actualTypes[0], actualTypes[0], "bogus"]), [actualTypes[0]]);
});
