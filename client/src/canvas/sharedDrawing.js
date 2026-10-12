// Build the same canvas action history for a given server time on every client.
// Replaying a history also lets a late joiner jump directly to the current frame.
import { beginStroke, extendStroke, endStroke } from "./actions.js";
import { TOOLS } from "./palette.js";

const HEIGHT_RATIO = 3 / 4; // กระดาน 4:3; รักษาจังหวะเส้นตามตัวเล่นเดิม

export function drawingActionsAt(strokes, serverTime) {
  const actions = [];
  let animating = false;
  for (const stroke of strokes) {
    const { points, startedAt, ms, color, size } = stroke;
    if (!Array.isArray(points) || !points.length || serverTime < startedAt) continue;
    const fraction = Math.min(1, Math.max(0, (serverTime - startedAt) / ms));
    if (fraction < 1) animating = true;
    actions.push(beginStroke({ x: points[0].x, y: points[0].y, color, size, tool: TOOLS.PEN }));
    const distance = [0];
    for (let i = 1; i < points.length; i++) distance.push(distance[i - 1] + Math.hypot(points[i].x - points[i - 1].x, (points[i].y - points[i - 1].y) * HEIGHT_RATIO));
    const target = fraction * distance.at(-1);
    const drawn = [];
    for (let i = 1; i < points.length; i++) {
      if (fraction === 1 || distance[i] <= target) drawn.push(points[i]);
      else {
        if (distance[i] > distance[i - 1] && target > distance[i - 1]) {
          const part = (target - distance[i - 1]) / (distance[i] - distance[i - 1]);
          drawn.push({ x: points[i - 1].x + (points[i].x - points[i - 1].x) * part, y: points[i - 1].y + (points[i].y - points[i - 1].y) * part });
        }
        break;
      }
    }
    if (drawn.length) actions.push(extendStroke(drawn));
    actions.push(endStroke());
  }
  return { actions, animating };
}
