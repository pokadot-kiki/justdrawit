const assert = require("node:assert/strict");
const { test } = require("node:test");
const sharp = require("sharp");
const ai = require("../ai");

test("Solo model prediction has real provenance; scoring and answer matching stay unchanged", async () => {
  const originalMode = process.env.AI_MODE;
  const originalChance = process.env.AI_MOCK_CHANCE;
  try {
    delete process.env.AI_MODE;
    await ai.init();
    assert.equal(ai.aiMode(), "model");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="384"><rect width="100%" height="100%" fill="white"/><circle cx="256" cy="192" r="120" fill="none" stroke="black" stroke-width="8"/></svg>';
    const image = `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64")}`;
    const result = await ai.guessImage({ image, word: "วงกลม", allWords: ["วงกลม"], elapsed: 1, time: 60, wrong: [] });
    assert.equal(result.source, "model");
    assert.equal(result.guess, "วงกลม");
    assert.equal(result.correct, ai.sameWord(result.guess, "วงกลม"));
    assert.equal(ai.scoreFor(30, 60), 300);

    process.env.AI_MODE = "mock";
    process.env.AI_MOCK_CHANCE = "1";
    const mock = await ai.guessImage({ image, word: "วงกลม", allWords: ["วงกลม"], elapsed: 1, time: 60, wrong: [] });
    assert.equal(mock.source, "mock");
    assert.equal(mock.correct, true); // Existing Solo fallback still uses the same answer and scoring path.
  } finally {
    originalMode === undefined ? delete process.env.AI_MODE : process.env.AI_MODE = originalMode;
    originalChance === undefined ? delete process.env.AI_MOCK_CHANCE : process.env.AI_MOCK_CHANCE = originalChance;
  }
});
