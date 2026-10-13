const assert = require("node:assert/strict");
const { test } = require("node:test");
const words = require("../data/words.json");
const aiWords = require("../data/ai-words.json");
const ai = require("../ai");
const { categoryIds, categoryWordPool, availableCategories, roomWordBank } = require("../word-categories");

test("all allowed categories have real words and preserve difficulty counts", () => {
  for (const category of categoryIds) {
    assert.ok(categoryWordPool(words, "mixed", category).length > 0, `${category} mixed`);
    for (const difficulty of ["easy", "medium", "hard", "mixed"]) {
      const pool = categoryWordPool(words, difficulty, category);
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

test("sampled pools stay inside the selected category", () => {
  for (const category of ["สัตว์", "อาหาร", "ยานพาหนะ"]) {
    const pool = categoryWordPool(words, "mixed", category);
    assert.ok(pool.length > 0);
    const source = new Set(Object.values(words).flat().filter((item) => item.category === category).map((item) => item.word));
    for (let i = 0; i < Math.min(10, pool.length); i++) assert.ok(source.has(pool[i]));
  }
});

test("all categories and selected categories use the room difficulty without silent fallback", () => {
  assert.equal(categoryWordPool(words, "mixed", null).length, Object.values(words).flat().length);
  assert.deepEqual(availableCategories(words).map(({ id }) => id), [...categoryIds]);
  assert.deepEqual(availableCategories(aiWords).map(({ id }) => id), [...categoryIds].filter((id) => categoryWordPool(aiWords, "mixed", id).length > 0));
  for (const category of categoryIds) {
    for (const difficulty of ["easy", "medium", "hard"]) {
      const bank = roomWordBank(aiWords, difficulty, category);
      assert.equal(categoryWordPool(bank, difficulty, category).length, aiWords[difficulty].filter((item) => item.category === category).length);
      for (const level of ["easy", "medium", "hard"].filter((level) => level !== difficulty)) assert.deepEqual(bank[level], []);
      const expected = aiWords[difficulty].filter((item) => item.category === category);
      if (expected.length) {
        const picked = ai.pickWord(bank, difficulty);
        assert.ok(expected.some((item) => item.word === picked));
      } else assert.equal(ai.pickWord(bank, difficulty), null);
    }
  }
  assert.equal(roomWordBank(words, "hard", null), words);
  assert.deepEqual(availableCategories({ easy: [{ word: "x", category: "สัตว์" }] }).map(({ id }) => id), ["สัตว์"]);
});
