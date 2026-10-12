import test from "node:test";
import assert from "node:assert/strict";
import { drawingActionsAt } from "./sharedDrawing.js";

test("clients and late joiners render identical progress at the same server time", () => {
  const strokes = [
    { startedAt: 1000, ms: 1000, color: "#000000", size: 4, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
    { startedAt: 2200, ms: 1000, color: "#000000", size: 4, points: [{ x: 0, y: 1 }, { x: 1, y: 1 }] },
  ];
  const first = drawingActionsAt(strokes, 1500);
  const second = drawingActionsAt(strokes, 1500);
  assert.deepEqual(first, second);
  assert.equal(first.animating, true);
  assert.equal(first.actions[1].points[0].x, 0.5);
  assert.deepEqual(drawingActionsAt(strokes, 1800), drawingActionsAt(strokes, 1800));
  const late = drawingActionsAt(strokes, 2700);
  assert.equal(late.actions.filter((a) => a.type === "stroke_start").length, 2);
  assert.equal(late.actions.at(-2).points[0].x, 0.5);
  assert.equal(drawingActionsAt(strokes, 4000).animating, false);
});
