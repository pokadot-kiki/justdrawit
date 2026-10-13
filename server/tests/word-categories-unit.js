const assert = require("node:assert/strict");
const { test } = require("node:test");
const words = require("../data/words.json");
const aiWords = require("../data/ai-words.json");
const ai = require("../ai");
const { categoryIds, categoryWordPool, availableCategories, roomWordBank } = require("../word-categories");

test("all allowed categories have real words at every difficulty", () => {
  assert.deepEqual([...categoryIds], ["สัตว์", "อาหาร", "สิ่งของ"]);
  for (const category of categoryIds) {
    for (const difficulty of ["easy", "medium", "hard", "mixed"]) {
      const pool = categoryWordPool(words, difficulty, category);
      assert.ok(pool.length > 0, `${category} ${difficulty}`);
      const levels = difficulty === "mixed" ? Object.values(words).flat() : words[difficulty];
      const expected = levels.filter((item) => item.category === category).map((item) => item.word);
      assert.deepEqual(pool, expected);
    }
  }
});

test("missing category and difficulty produce no words", () => {
  assert.deepEqual(categoryWordPool(words, "hard", "ไม่มีหมวด"), []);
  assert.deepEqual(categoryWordPool(words, "unknown", "สัตว์"), []);
  assert.deepEqual(categoryWordPool({ easy: [] }, "easy", "สัตว์"), []);
});

test("all categories and selected categories use the room difficulty without silent fallback", () => {
  assert.equal(categoryWordPool(words, "mixed", null).length, Object.values(words).flat().length);
  assert.deepEqual(availableCategories(words).map(({ id }) => id), [...categoryIds]);
  assert.deepEqual(availableCategories(aiWords).map(({ id }) => id), [...categoryIds]);
  for (const category of categoryIds) {
    for (const difficulty of ["easy", "medium", "hard"]) {
      const bank = roomWordBank(aiWords, difficulty, category);
      assert.equal(categoryWordPool(bank, difficulty, category).length, aiWords[difficulty].filter((item) => item.category === category).length);
      for (const level of ["easy", "medium", "hard"].filter((level) => level !== difficulty)) assert.deepEqual(bank[level], []);
      const picked = ai.pickWord(bank, difficulty);
      assert.ok(aiWords[difficulty].some((item) => item.word === picked && item.category === category));
    }
  }
  assert.equal(roomWordBank(words, "hard", null), words);
  assert.deepEqual(availableCategories({ easy: [{ word: "x", category: "สัตว์" }] }).map(({ id }) => id), ["สัตว์"]);
});
