const sharp = require("sharp");

// Render only server-accepted drawing actions. Client image bytes are never used for AI or Gallery.
const shared = Promise.all([
  import("../client/src/aiSnapshot.js"),
  import("../client/src/canvas/painter.js"),
]);

module.exports = async function renderMpAiDrawing(actions) {
  const [{ SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT }, { floodFill, hexToRgb }] = await shared;
  const width = SNAPSHOT_WIDTH;
  const height = SNAPSHOT_HEIGHT;
  const blank = () => sharp({ create: { width, height, channels: 4, background: "#ffffff" } }).png().toBuffer();
  let image = await blank();
  let paths = [];
  let stroke = null;
  const x = (v) => v * width;
  const y = (v) => v * height;

  const finishStroke = () => {
    if (!stroke) return;
    const color = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
    if (!stroke.drew) {
      paths.push(`<circle cx="${stroke.x}" cy="${stroke.y}" r="${stroke.size / 2}" fill="${color}"/>`);
    } else {
      paths.push(`<path d="${stroke.path} L ${stroke.x} ${stroke.y}" fill="none" stroke="${color}" stroke-width="${stroke.size}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    stroke = null;
  };
  const flush = async () => {
    finishStroke();
    if (!paths.length) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${paths.join("")}</svg>`;
    image = await sharp(image).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
    paths = [];
  };

  for (const a of actions) {
    if (a.type === "stroke_start") {
      finishStroke();
      stroke = { x: x(a.x), y: y(a.y), mx: x(a.x), my: y(a.y), color: a.color, size: a.size, tool: a.tool, path: `M ${x(a.x)} ${y(a.y)}`, drew: false };
    } else if (a.type === "stroke_points" && stroke) {
      for (const p of a.points) {
        const nx = x(p.x), ny = y(p.y);
        const mx = (stroke.x + nx) / 2, my = (stroke.y + ny) / 2;
        stroke.path += ` Q ${stroke.x} ${stroke.y} ${mx} ${my}`;
        stroke.x = nx; stroke.y = ny; stroke.mx = mx; stroke.my = my; stroke.drew = true;
      }
    } else if (a.type === "stroke_end") {
      finishStroke();
    } else if (a.type === "draw_shape") {
      finishStroke();
      const x1 = x(a.x1), y1 = y(a.y1), x2 = x(a.x2), y2 = y(a.y2);
      let d;
      if (a.shape === "line") d = `M ${x1} ${y1} L ${x2} ${y2}`;
      if (a.shape === "rect") d = `M ${x1} ${y1} H ${x2} V ${y2} H ${x1} Z`;
      if (a.shape === "triangle") d = `M ${(x1 + x2) / 2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
      if (a.shape === "circle") {
        paths.push(`<ellipse cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" rx="${Math.abs(x2 - x1) / 2}" ry="${Math.abs(y2 - y1) / 2}" fill="none" stroke="${a.color}" stroke-width="${a.size}"/>`);
      } else if (d) {
        paths.push(`<path d="${d}" fill="none" stroke="${a.color}" stroke-width="${a.size}" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
    } else if (a.type === "fill") {
      await flush();
      const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (floodFill({ data }, info.width, info.height, Math.round(x(a.x)), Math.round(y(a.y)), hexToRgb(a.color))) {
        image = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
      }
    } else if (a.type === "clear_canvas") {
      stroke = null;
      paths = [];
      image = await blank();
    }
  }
  await flush();
  return `data:image/png;base64,${image.toString("base64")}`;
};
