import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHALLENGE_CARDS, DEFAULT_CHALLENGES, STANDARD_CHALLENGE } from "../roomOptions.js";

const filename = fileURLToPath(new URL("./ChallengeCards.jsx", import.meta.url));
const stubs = {
  "../socket": "export const socket = { emit() {} }",
  "./Icons": "import React from 'react'; export function Icon({ name }) { return React.createElement('i', { 'data-icon': name }) }",
};
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true },
  plugins: [{
    name: "challenge-card-stubs",
    enforce: "pre",
    resolveId(id, importer) { return importer === filename && id in stubs ? `\0stub:${id}` : undefined; },
    load(id) { return id.startsWith("\0stub:") ? stubs[id.slice(6)] : undefined; },
  }],
});
const { default: ChallengeCards } = await vite.ssrLoadModule(filename);
await vite.close();

function render(enabled) {
  return renderToStaticMarkup(React.createElement(ChallengeCards, { enabled, isHost: true }));
}

test("all four enabled displays 4/4 and Standard remains an enabled button", () => {
  const html = render(DEFAULT_CHALLENGES);
  assert.match(html, new RegExp(`เปิด ${CHALLENGE_CARDS.length}/${CHALLENGE_CARDS.length}`));
  assert.equal((html.match(/<button/g) ?? []).length, CHALLENGE_CARDS.length);
  assert.match(html, new RegExp(`class="[^"]*lb-ch--${STANDARD_CHALLENGE}[^"]*" aria-pressed="true"`));
  assert.doesNotMatch(html, /disabled=""/);
});

test("turning Standard off leaves the three restricted options visibly enabled", () => {
  const html = render(DEFAULT_CHALLENGES.filter((type) => type !== STANDARD_CHALLENGE));
  assert.match(html, new RegExp(`เปิด ${CHALLENGE_CARDS.length - 1}/${CHALLENGE_CARDS.length}`));
  assert.match(html, new RegExp(`class="[^"]*lb-ch--${STANDARD_CHALLENGE}[^"]*" aria-pressed="false"`));
});
