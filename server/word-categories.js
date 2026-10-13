const categories = require("../shared/wordCategories.json");

const categoryIds = new Set(categories.map((category) => category.id));

function categoryWordPool(bank, difficulty, category) {
  const levels = difficulty === "mixed" ? ["easy", "medium", "hard"] : [difficulty];
  return levels.flatMap((level) => (bank[level] || [])
    .filter((item) => item.category === category)
    .map((item) => item.word));
}

module.exports = { categoryIds, categoryWordPool };
