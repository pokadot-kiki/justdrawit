import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TOOLS } from "../canvas/palette.js";

const filename = fileURLToPath(new URL("./Toolbar.jsx", import.meta.url));
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true },
  plugins: [{
    name: "toolbar-icon-stub",
    enforce: "pre",
    resolveId(id, importer) { return importer === filename && id === "./Icons" ? "\0toolbar-icons" : undefined; },
    load(id) { return id === "\0toolbar-icons" ? "import React from 'react'; export function Icon({ name }) { return React.createElement('i', { 'data-icon': name }) }" : undefined; },
  }],
});
const { default: Toolbar } = await vite.ssrLoadModule(filename);
await vite.close();

const props = { tool: TOOLS.LINE, color: "#000000", size: 5, onTool() {}, onColor() {}, onSize() {}, onClear() {}, onUndo() {}, onRedo() {} };
const render = (extra) => renderToStaticMarkup(React.createElement(Toolbar, { ...props, ...extra }));

test("Don't Lift Pen leaves only Clear available after a stroke is locked", () => {
  const html = render({ locked: true, canClearWhileLocked: true, hideBucket: true, hideShapes: true, historyLocked: true });
  assert.match(html, /toolbar--clear-only/);
  assert.match(html, /aria-label="ล้างจอ"[^>]*title="ล้างจอแล้วเริ่มวาดเส้นใหม่"/);
  assert.doesNotMatch(html, /aria-label="ล้างจอ"[^>]*disabled/);
  assert.match(html, /aria-label="ปากกา"[^>]*disabled/);
});

test("Shapes Only shows disabled freehand tools and an active selected shape", () => {
  const html = render({ hidePen: true, tool: TOOLS.RECT });
  assert.match(html, /aria-label="ปากกา"[^>]*title="กติกา Shapes Only:[^"]*"[^>]*disabled/);
  assert.match(html, /aria-label="ยางลบ"[^>]*title="กติกา Shapes Only:[^"]*"[^>]*disabled/);
  assert.match(html, /aria-label="สี่เหลี่ยม"[^>]*aria-pressed="true"/);
});
