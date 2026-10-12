import assert from "node:assert/strict";
import { test } from "node:test";
import { appendSoloGuess } from "./soloGuessHistory.js";

test("shows only real predictions from the current drawing round", () => {
  const first = { guess: "แมว", correct: false, source: "model", roundId: 3 };
  const next = { guess: "หมา", correct: true, source: "claude", roundId: 3 };
  let history = appendSoloGuess([], first, 3, "playing");
  assert.deepEqual(history, [{ text: "แมว", correct: false }]);
  assert.equal(appendSoloGuess(history, first, 3, "playing"), history);
  assert.equal(appendSoloGuess(history, { ...next, source: "mock" }, 3, "playing"), history);
  assert.equal(appendSoloGuess(history, { ...next, roundId: 2 }, 3, "playing"), history);
  assert.equal(appendSoloGuess(history, next, 3, "rest"), history);
  history = appendSoloGuess(history, next, 3, "playing");
  assert.deepEqual(history, [{ text: "แมว", correct: false }, { text: "หมา", correct: true }]);
  // New round starts with empty history. Delayed guesses from the old round cannot repopulate it.
  assert.deepEqual(appendSoloGuess([], first, 4, "playing"), []);
  assert.deepEqual(appendSoloGuess([], { ...first, guess: "ปลา", roundId: 4 }, 4, "playing"), [{ text: "ปลา", correct: false }]);
});
