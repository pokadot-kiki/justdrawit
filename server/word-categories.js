const categories = require("../shared/wordCategories.json");

const categoryIds = new Set(categories.map((category) => category.id));

function categoryWordPool(bank, difficulty, category) {
  const levels = difficulty === "mixed" ? ["easy", "medium", "hard"] : [difficulty];
  return levels.flatMap((level) => (bank[level] || [])
    .filter((item) => category == null || item.category === category)
    .map((item) => item.word));
}

function availableCategories(bank) {
  return categories.filter(({ id }) => categoryWordPool(bank, "mixed", id).length > 0);
}

// Keep the original bank for "all"; a selected category must never fall back
// to a different category or difficulty when an AI picker runs out of words.
function roomWordBank(bank, difficulty, category) {
  if (category == null) return bank;
  return Object.fromEntries(["easy", "medium", "hard"].map((level) => [
    level,
    difficulty !== "mixed" && level !== difficulty ? [] : (bank[level] || []).filter((item) => item.category === category),
  ]));
}

module.exports = { categoryIds, categoryWordPool, availableCategories, roomWordBank };
