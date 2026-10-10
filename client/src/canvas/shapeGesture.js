import { drawShape } from "./actions.js";

const round4 = (v) => Math.round(v * 10000) / 10000;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const MIN_SHAPE_DRAG_PX = 4;

export function toNorm(e, rect) {
  return {
    x: round4(clamp01((e.clientX - rect.left) / rect.width)),
    y: round4(clamp01((e.clientY - rect.top) / rect.height)),
  };
}

export function shapeEnd(s, p, rect) {
  if (s.shape !== "circle") return p;
  const dx = (p.x - s.start.x) * rect.width;
  const dy = (p.y - s.start.y) * rect.height;
  const sx = dx >= 0 ? 1 : -1;
  const sy = dy >= 0 ? 1 : -1;
  const roomX = (sx > 0 ? 1 - s.start.x : s.start.x) * rect.width;
  const roomY = (sy > 0 ? 1 - s.start.y : s.start.y) * rect.height;
  const side = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), roomX, roomY);
  return {
    x: round4(s.start.x + (sx * side) / rect.width),
    y: round4(s.start.y + (sy * side) / rect.height),
  };
}

export function finishedShape(s, release, rect, color, size, commit) {
  if (!s || !commit || !release) return null;
  const end = shapeEnd(s, toNorm(release, rect), rect);
  if (Math.hypot((end.x - s.x1) * rect.width, (end.y - s.y1) * rect.height) < MIN_SHAPE_DRAG_PX) return null;
  return drawShape({ shape: s.shape, x1: s.x1, y1: s.y1, x2: end.x, y2: end.y, color, size });
}
