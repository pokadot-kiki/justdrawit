import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isNearChatBottom } from "./chatScroll.js";

const filename = fileURLToPath(new URL("./Chat.jsx", import.meta.url));
const stubs = {
  "./Icons": "import React from 'react'; export function Icon({ name }) { return React.createElement('i', { 'data-icon': name }) }",
  "../utils/predictiveText": "export const predictWords = () => []",
  "../utils/speechToText": "export const createSpeechRecognizer = () => null",
};
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true },
  plugins: [{
    name: "chat-stubs", enforce: "pre",
    resolveId(id, importer) { return importer === filename && id in stubs ? `\0chat-stub:${id}` : undefined; },
    load(id) { return id.startsWith("\0chat-stub:") ? stubs[id.slice(11)] : undefined; },
  }],
});
const { default: Chat } = await vite.ssrLoadModule(filename);
await vite.close();

test("shared chat keeps server message order and separates player and system rows", () => {
  const html = renderToStaticMarkup(React.createElement(Chat, {
    meId: "a", onSend() {}, messages: [
      { seq: 1, playerId: "a", name: "ชื่อภาษาไทยยาว", text: "คำทายแรก" },
      { seq: 2, system: true, kind: "correct", text: "ผู้เล่นทายถูกแล้ว" },
      { seq: 3, playerId: "b", name: "Long English Name", text: "ข้อความยาว & อีกคำ" },
    ],
  }));
  const rows = [...html.matchAll(/<p class="chat__row[^>]*>.*?<\/p>/g)].map(([row]) => row);
  assert.equal(rows.length, 3);
  assert.match(rows[0], /ชื่อภาษาไทยยาว.*คำทายแรก/);
  assert.match(rows[1], /note--correct.*ผู้เล่นทายถูกแล้ว/);
  assert.match(rows[2], /Long English Name.*ข้อความยาว &amp; อีกคำ/);
});

test("auto scroll follows new messages only while the reader is near the bottom", () => {
  assert.equal(isNearChatBottom({ scrollHeight: 600, clientHeight: 200, scrollTop: 400 }), true);
  assert.equal(isNearChatBottom({ scrollHeight: 600, clientHeight: 200, scrollTop: 360 }), true);
  assert.equal(isNearChatBottom({ scrollHeight: 600, clientHeight: 200, scrollTop: 340 }), false);
  assert.equal(isNearChatBottom({ scrollHeight: 120, clientHeight: 200, scrollTop: 0 }), true);
});
