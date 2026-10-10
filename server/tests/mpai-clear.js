const assert = require("node:assert/strict");
const { test } = require("node:test");
const createMpAi = require("../mp-ai");

test("private Clear invalidates a pending AI answer and the old image", async () => {
  const events = [];
  const io = { to(target) { return { emit(name, data) { events.push({ target, name, data }); } }; } };
  const room = { code: "room", status: "playing", players: [{ id: "P", name: "Player", connected: true }], settings: { rounds: 1, drawTime: 30, difficulty: "easy" } };
  let finishGuess;
  const ai = {
    soloWords: () => ({ easy: [{ word: "cat", category: "animal" }] }),
    pickWord: () => "cat", wordsOf: () => ["cat"], drawScore: () => 10,
    guessImage: () => new Promise((resolve) => { finishGuess = resolve; }),
  };
  const canvasPayload = (board) => ({ items: board.canvasOps.flatMap((op) => op.events) });
  const game = createMpAi({ io, rooms: new Map([[room.code, room]]), ai, aiDrawings: { pick: () => null }, wordBank: {}, makeHint: () => "_", normalize: String, roomState: () => ({}), endGame: () => {}, snapshotGapMs: 0, drawBudgetRatio: 1, drawColor: "#000000", drawSize: 5, rollChallenge: () => ({ type: "dont_lift_pen" }), introMsFor: () => 0, canvasPayload, createPrivateBoard: (pid, challenge) => ({ code: pid, challenge, canvasOps: [], redoOps: [], revision: 0 }), closePrivateStroke: () => {} });
  try {
    game.startGame(room);
    const board = game.actionRoom(room, "P");
    board.canvasOps.push({ events: [{ type: "draw_shape", shape: "line", x1: .1, y1: .1, x2: .9, y2: .9, color: "#000000", size: 5 }] });
    board.revision++;
    await game.handleSnapshot({ data: { pid: "P" } }, room);
    assert.equal(typeof finishGuess, "function");
    board.canvasOps = [];
    board.revision++;
    game.clearPlayerDrawing(room, "P");
    assert.equal(room.mp.images.has("P"), false);
    finishGuess({ guess: "cat", correct: true, confidence: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(events.some((e) => e.name === "mpai_ai_guess"), false);
    assert.equal(room.mp.done.has("P"), false);
  } finally { game.stop(room); }
});
