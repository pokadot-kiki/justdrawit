const assert = require("node:assert/strict");
const { test } = require("node:test");
const sharp = require("sharp");
const ai = require("../ai");
const model = require("../ai-model");
const createMpAi = require("../mp-ai");

const shape = { type: "draw_shape", shape: "line", x1: .1, y1: .1, x2: .9, y2: .9, color: "#000000", size: 5 };

test("one local model serves concurrent requests and a transient failure does not disable every room", async () => {
  const oldMode = process.env.AI_MODE;
  const oldKey = process.env.ANTHROPIC_API_KEY;
  const classify = model.classify;
  try {
    delete process.env.AI_MODE;
    delete process.env.ANTHROPIC_API_KEY;
    await ai.init();
    assert.equal(ai.aiMode(), "model");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="384"><rect width="100%" height="100%" fill="white"/><circle cx="256" cy="192" r="100" fill="none" stroke="black" stroke-width="8"/></svg>';
    const image = `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64")}`;
    const results = await Promise.all(Array.from({ length: 8 }, () => model.classify(image, { top: 1 })));
    assert.ok(results.every((result) => result[0]?.label === results[0][0].label));
    model.classify = async () => { throw new Error("transient test failure"); };
    const word = ai.soloWords({}).easy[0].word;
    await assert.rejects(ai.guessImage({ image, word, allWords: [word], elapsed: 0, time: 60, wrong: [], requireReal: true }), /ไม่มี AI/);
    assert.equal(ai.aiMode(), "model");
    model.classify = classify;
    assert.equal((await ai.guessImage({ image, word, allWords: [word], elapsed: 0, time: 60, wrong: [], requireReal: true })).source, "model");
  } finally {
    model.classify = classify;
    if (oldMode === undefined) delete process.env.AI_MODE; else process.env.AI_MODE = oldMode;
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
  }
});

test("three multiplayer rooms keep AI results, scores, and images in their own state", async () => {
  const events = [];
  const rooms = new Map();
  const words = ["cat", "dog", "bird"];
  const io = { to(target) { return { emit(name, data) { events.push({ target, name, data }); } }; } };
  const fakeAi = {
    soloWords: () => ({ easy: words.map((word) => ({ word })) }),
    pickWord: () => words.shift(), wordsOf: () => words, drawScore: () => 123,
    guessImage: async ({ word, requireReal }) => { assert.equal(requireReal, true); await new Promise((resolve) => setTimeout(resolve, 5)); return { guess: word, correct: true, confidence: 1 }; },
  };
  const game = createMpAi({ io, rooms, ai: fakeAi, aiDrawings: { pick: () => null }, wordBank: {}, makeHint: () => "_", normalize: String, roomState: (room) => ({ code: room.code }), endGame() {}, snapshotGapMs: 0, drawBudgetRatio: 1, drawColor: "#000000", drawSize: 5, rollChallenge: () => ({ type: "none" }), introMsFor: () => 0, canvasPayload: (board) => ({ items: board.canvasOps.flatMap((op) => op.events) }), createPrivateBoard: (pid, challenge) => ({ code: pid, challenge, canvasOps: [], redoOps: [], revision: 0 }), closePrivateStroke() {} });
  try {
    for (const code of ["R1", "R2", "R3"]) {
      const pid = `${code}-P`;
      const room = { code, status: "playing", players: [{ id: pid, name: pid, score: 0, connected: true }], settings: { rounds: 1, drawTime: 30, difficulty: "easy" } };
      rooms.set(code, room);
      game.startGame(room);
      const board = game.actionRoom(room, pid);
      board.canvasOps.push({ events: [shape] });
      board.revision++;
    }
    await Promise.all([...rooms.values()].map((room) => game.handleSnapshot({ data: { pid: room.players[0].id } }, room)));
    await new Promise((resolve) => setTimeout(resolve, 30));
    for (const room of rooms.values()) {
      const pid = room.players[0].id;
      assert.equal(room.players[0].score, 123);
      assert.equal(room.mp.done.get(pid).guess, room.mp.word);
      assert.equal(room.mp.images.size, 1);
      assert.equal(events.filter((event) => event.name === "mpai_ai_guess" && event.target === pid).length, 1);
      assert.equal(events.filter((event) => event.name === "mpai_done" && event.target === room.code).length, 1);
    }
  } finally { for (const room of rooms.values()) game.stop(room); }
});
