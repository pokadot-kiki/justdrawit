const assert = require("node:assert/strict");
const { test } = require("node:test");
const words = require("../data/words.json");
const { categoryIds, categoryWordPool } = require("../word-categories");

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
