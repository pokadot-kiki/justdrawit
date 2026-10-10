import test from "node:test";
import assert from "node:assert/strict";
import { finishedShape, shapeEnd, toNorm } from "./shapeGesture.js";

const rect = { left: 20, top: 30, width: 400, height: 300 };
const start = { x: 0.25, y: 0.25 };
const gesture = (shape) => ({ shape, start, x1: start.x, y1: start.y, x2: start.x, y2: start.y });
const release = { clientX: 220, clientY: 180 };

test("each shape commits from pointerup even when no pointermove arrived", () => {
  for (const shape of ["line", "rect", "circle", "triangle"]) {
    const action = finishedShape(gesture(shape), release, rect, "#000000", 5, true);
    assert.equal(action.type, "draw_shape");
    assert.equal(action.shape, shape);
    assert.notEqual(action.x2, action.x1);
    assert.notEqual(action.y2, action.y1);
  }
});

test("pointercancel/lost capture discard preview; a tap remains below the drag threshold", () => {
  assert.equal(finishedShape(gesture("rect"), release, rect, "#000000", 5, false), null);
  assert.equal(finishedShape(gesture("rect"), null, rect, "#000000", 5, true), null);
  assert.equal(finishedShape(gesture("rect"), { clientX: 121, clientY: 106 }, rect, "#000000", 5, true), null);
});

test("rapid tool changes keep the shape captured on pointerdown for that gesture", () => {
  assert.equal(finishedShape(gesture("rect"), release, rect, "#000000", 5, true).shape, "rect");
  assert.equal(finishedShape(gesture("triangle"), release, rect, "#000000", 5, true).shape, "triangle");
});

test("coordinates use the current canvas size and clamp releases outside the board", () => {
  assert.deepEqual(toNorm({ clientX: 220, clientY: 180 }, rect), { x: 0.5, y: 0.5 });
  assert.deepEqual(toNorm({ clientX: 420, clientY: 330 }, { left: 20, top: 30, width: 800, height: 600 }), { x: 0.5, y: 0.5 });
  const action = finishedShape(gesture("line"), { clientX: 999, clientY: -10 }, rect, "#000000", 5, true);
  assert.deepEqual([action.x2, action.y2], [1, 0]);
  assert.deepEqual(shapeEnd(gesture("circle"), { x: 0.5, y: 0.5 }, rect), { x: 0.5, y: 0.5833 });
});
