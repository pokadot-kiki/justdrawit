import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTUAL_CHALLENGE_CARDS, CHALLENGE_CARDS, DEFAULT_CHALLENGES, STANDARD_CHALLENGE, nextChallengeSelection } from "./roomOptions.js";

test("Waiting Room registry includes all four independently selectable options", () => {
  assert.equal(CHALLENGE_CARDS.length, ACTUAL_CHALLENGE_CARDS.length + 1);
  assert.ok(CHALLENGE_CARDS.some((card) => card.id === STANDARD_CHALLENGE));
  assert.ok(ACTUAL_CHALLENGE_CARDS.every((card) => card.id !== STANDARD_CHALLENGE));
});

test("Standard can be disabled and enabled without changing the other options", () => {
  assert.deepEqual(nextChallengeSelection(DEFAULT_CHALLENGES, STANDARD_CHALLENGE), ACTUAL_CHALLENGE_CARDS.map((card) => card.id));
  assert.deepEqual(nextChallengeSelection(ACTUAL_CHALLENGE_CARDS.map((card) => card.id), STANDARD_CHALLENGE), DEFAULT_CHALLENGES);
  const first = ACTUAL_CHALLENGE_CARDS[0].id;
  assert.deepEqual(nextChallengeSelection([STANDARD_CHALLENGE], first), [STANDARD_CHALLENGE, first]);
  assert.deepEqual(nextChallengeSelection([first], first), []);
});

test("each option toggles independently and zero selection is sent for server rejection", () => {
  const [first, second] = ACTUAL_CHALLENGE_CARDS.map((card) => card.id);
  assert.deepEqual(nextChallengeSelection([STANDARD_CHALLENGE, first], second), [STANDARD_CHALLENGE, first, second]);
  assert.deepEqual(nextChallengeSelection([first, second], first), [second]);
  assert.deepEqual(nextChallengeSelection([STANDARD_CHALLENGE], STANDARD_CHALLENGE), []);
});
