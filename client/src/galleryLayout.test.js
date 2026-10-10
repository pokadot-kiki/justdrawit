import assert from "node:assert/strict";
import { test } from "node:test";
import { galleryLayout } from "./galleryLayout.js";

test("gallery layouts for every submission count from two through eight", () => {
  const expected = new Map([[2, 2], [3, 3], [4, 2], [5, 3], [6, 3], [7, 4], [8, 4]]);
  for (const [count, columns] of expected) {
    const layout = galleryLayout(count, 700, 150, 10);
    assert.equal(layout.columns, columns, `${count} submissions`);
    assert.ok(layout.cardWidth >= 150, `${count} cards stay legible`);
    assert.ok(layout.cardWidth * columns + 10 * (columns - 1) <= 700);
  }
});

test("narrow galleries fit cards and center incomplete rows", () => {
  for (let count = 2; count <= 8; count++) {
    const { columns, cardWidth } = galleryLayout(count, 340, 150, 10);
    assert.equal(columns, 2);
    assert.equal(cardWidth, 165);
  }
  assert.equal(galleryLayout(7, 140, 150, 10).columns, 1);
});

test("Team Battle gallery balances its supported team counts", () => {
  assert.deepEqual([2, 3, 4, 5].map((count) => galleryLayout(count, 500, 220, 12).columns), [2, 2, 2, 2]);
  assert.deepEqual([2, 3, 4, 5].map((count) => galleryLayout(count, 320, 220, 12).columns), [1, 1, 1, 1]);
});
