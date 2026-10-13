import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { AVATARS } from "../avatars.js";

const modalFile = fileURLToPath(new URL("./ProfileModal.jsx", import.meta.url));
const triggerFile = fileURLToPath(new URL("./ProfileTrigger.jsx", import.meta.url));
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true },
  plugins: [{
    name: "profile-modal-stub", enforce: "pre",
    resolveId(id, importer) { return importer === modalFile && id === "./Modal" ? "\0profile-modal-stub" : undefined; },
    load(id) { return id === "\0profile-modal-stub" ? "import React from 'react'; export default function Modal({ children }) { return React.createElement('section', { role: 'dialog' }, children) }" : undefined; },
  }],
});
const { default: ProfileModal } = await vite.ssrLoadModule(modalFile);
const { default: ProfileTrigger } = await vite.ssrLoadModule(triggerFile);
await vite.close();

test("avatar and name form a keyboard-accessible profile trigger", () => {
  const html = renderToStaticMarkup(React.createElement(ProfileTrigger, { name: "ผู้เล่น", avatar: 2, onClick() {} }));
  assert.match(html, /^<button[^>]*type="button"[^>]*aria-label="แก้ไขโปรไฟล์ ผู้เล่น"/);
  assert.match(html, /ผู้เล่น/);
  assert.doesNotMatch(html, /icon--pen/);
});

test("profile modal shows current preview, all real avatars, name, save and cancel", () => {
  const html = renderToStaticMarkup(React.createElement(ProfileModal, { profile: { name: "เจ้าของ", avatar: 2 }, onSave() {}, onClose() {} }));
  assert.match(html, /role="dialog"/);
  assert.match(html, /แต่งโปรไฟล์/);
  assert.equal((html.match(/class="profile-avatars__item/g) ?? []).length, AVATARS.length);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /value="เจ้าของ"/);
  assert.match(html, /ยกเลิก[\s\S]*บันทึก/);
});
