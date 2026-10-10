import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const filename = fileURLToPath(new URL("./Scoreboard.jsx", import.meta.url));
const stubs = {
  "./Avatar": "import React from 'react'; export default function Avatar() { return React.createElement('span', { 'data-avatar': '' }) }",
  "./AnimatedNumber": "import React from 'react'; export default function AnimatedNumber({ value }) { return React.createElement('span', null, value) }",
  "./YouTag": "import React from 'react'; export default function YouTag() { return React.createElement('span', { className: 'you-tag' }, 'คุณ') }",
  "./Icons": "import React from 'react'; export function Icon({ name }) { return React.createElement('span', { 'data-icon': name }) }",
};
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true },
  plugins: [{
    name: "scoreboard-stubs",
    enforce: "pre",
    resolveId(id, importer) {
      return importer === filename && id in stubs ? `\0scoreboard-stub:${id}` : undefined;
    },
    load(id) { return id.startsWith("\0scoreboard-stub:") ? stubs[id.slice(17)] : undefined; },
  }],
});
const { default: Scoreboard } = await vite.ssrLoadModule(filename);
await vite.close();

test("Classic sidebar keeps long names, scores, current-player and gameplay badges in score order", () => {
  const html = renderToStaticMarkup(React.createElement(Scoreboard, {
    players: [
      { id: "thai", name: "ชื่อผู้เล่นภาษาไทยที่ยาวมาก", score: 1234, isHost: true, avatar: 0 },
      { id: "english", name: "ExtraordinarilyLongPlayerName", score: 9876, avatar: 1 },
    ],
    meId: "thai", drawerId: "thai", nextDrawerId: "english", drawing: true,
  }));
  assert.match(html, /ExtraordinarilyLongPlayerName[\s\S]*9876[\s\S]*ชื่อผู้เล่นภาษาไทยที่ยาวมาก[\s\S]*1234/);
  assert.match(html, /score-row--me[\s\S]*class="you-tag">คุณ/);
  assert.match(html, /tag--host[^>]*title="หัวห้อง"[\s\S]*data-icon="crown"/);
  assert.match(html, /tag--drawing[^>]*title="กำลังวาด"/);
  assert.match(html, /tag--next[^>]*title="วาดคนถัดไป"/);
});

test("Multiplayer vs AI sidebar retains guessed and disconnected states with score", () => {
  const html = renderToStaticMarkup(React.createElement(Scoreboard, {
    players: [
      { id: "one", name: "ผู้เล่นหนึ่งชื่อยาว", score: 300, avatar: 0, connected: true },
      { id: "two", name: "AnotherLongPlayerName", score: 200, avatar: 1, connected: false },
    ],
    meId: "one", guessed: ["one"], drawing: false,
  }));
  assert.match(html, /score-row--guessed score-row--me[\s\S]*ผู้เล่นหนึ่งชื่อยาว[\s\S]*300/);
  assert.match(html, /score-row--away[\s\S]*AnotherLongPlayerName[\s\S]*หลุด กำลังรอ\.\.\.[\s\S]*200/);
  assert.equal((html.match(/class="score-row__score"/g) ?? []).length, 2);
});
