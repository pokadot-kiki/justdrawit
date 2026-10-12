const assert = require('node:assert/strict');
const sharp = require('sharp');
const createMpAi = require('../mp-ai');
const renderDrawing = require('../mp-ai-render');

const action = (y) => ({ type: 'draw_shape', shape: 'line', x1: .1, y1: y, x2: .9, y2: y, color: '#000000', size: 5 });
const makeBoard = (pid, challenge) => ({ code: pid, challenge, canvasOps: [], redoOps: [], penUsed: false, revision: 0 });
const canvasPayload = (board) => ({ items: board.canvasOps.flatMap((op) => op.events), canUndo: !!board.canvasOps.length, canRedo: !!board.redoOps.length });

async function run() {
  const sample = await renderDrawing([action(.4)]);
  const { data, info } = await sharp(Buffer.from(sample.split(',')[1], 'base64')).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width / info.height, 4 / 3);
  assert.ok(data.some((v) => v < 255));
  const filled = await renderDrawing([
    { type: 'draw_shape', shape: 'rect', x1: .2, y1: .2, x2: .8, y2: .8, color: '#000000', size: 5 },
    { type: 'fill', x: .5, y: .5, color: '#e8553f' },
  ]);
  const filledRaw = await sharp(Buffer.from(filled.split(',')[1], 'base64')).raw().toBuffer();
  const center = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  assert.deepEqual([...filledRaw.subarray(center, center + 3)], [232, 85, 63]);
  assert.notEqual(filled, await renderDrawing([{ type: 'clear_canvas' }]));
  const sent = [];
  const io = { to(target) { return { emit(name, data) { sent.push({ target, name, data }); } }; } };
  const room = { code: '12345', status: 'playing', players: [{ id: 'P1', name: 'One', connected: true }, { id: 'P2', name: 'Two', connected: true }], settings: { rounds: 1, drawTime: 1, difficulty: 'easy', challenges: ['shapes_only'] } };
  const rooms = new Map([[room.code, room]]);
  let asked = 0;
  let rolled = 0;
  const ai = { soloWords: () => ({ easy: [{ word: 'cat', category: 'animal' }] }), pickWord: () => 'cat', wordsOf: () => ['cat'], drawScore: () => 0,
    guessImage: async ({ image, requireReal }) => { assert.equal(requireReal, true); assert.ok(image.startsWith('data:image/png;base64,')); asked++; return { guess: 'wrong', correct: false, confidence: 0 }; } };
  const mpAi = createMpAi({ io, rooms, ai, aiDrawings: { pick: () => null }, wordBank: {}, makeHint: () => '_', normalize: String, roomState: () => ({}), endGame: () => {}, snapshotGapMs: 0, drawBudgetRatio: 1 / 6, drawColor: '#000', drawSize: 2, rollChallenge: (r) => { rolled++; return { type: r.settings.challenges[0] }; }, introMsFor: () => 0, canvasPayload, createPrivateBoard: makeBoard, closePrivateStroke: () => {} });
  try {
    mpAi.startGame(room);
    assert.equal(rolled, 1);
    assert.equal(sent.find((e) => e.name === 'mpai_draw_start').data.challenge.type, 'shapes_only');
    const p1 = { data: { pid: 'P1' } };
    const board = mpAi.actionRoom(room, 'P1');
    board.canvasOps.push({ events: [action(.2)] });
    board.revision++;
    await mpAi.handleSnapshot(p1, room, { image: sample });
    assert.equal(asked, 0, 'untrusted image rejected');
    await mpAi.handleSnapshot(p1, room);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(asked, 1);
    assert.ok(sent.some((e) => e.target === 'P1' && e.name === 'mpai_ai_guess'));
    assert.ok(!sent.some((e) => e.target === 'P2' && e.name === 'mpai_ai_guess'));
    assert.equal(mpAi.snapshot(room, 'P1').myCanvas.items.length, 1);
    assert.equal(mpAi.snapshot(room, 'P2').myCanvas.items.length, 0);
    assert.equal(mpAi.snapshot(room, 'P1').challenge.type, 'shapes_only');
    board.canvasOps.push({ events: [action(.8)] });
    board.revision++;
    await mpAi.handleSnapshot(p1, room);
    const gallery = await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('gallery timeout')), 2500);
      const poll = setInterval(() => { const found = sent.find((e) => e.name === 'mpai_gallery')?.data; if (found) { clearInterval(poll); clearTimeout(deadline); resolve(found); } }, 10);
    });
    assert.equal(gallery.results.find((r) => r.playerId === 'P1').image, await renderDrawing([action(.2), action(.8)]));
    assert.equal(gallery.results.find((r) => r.playerId === 'P2').status, 'missing');
    assert.equal(mpAi.actionRoom(room, 'P1'), null);
  } finally { mpAi.stop(room); }
  console.log('Phase 1 authoritative rendering, private AI result, reconnect, final gallery: passed');
}
run().catch((err) => { console.error(err); process.exitCode = 1; });
