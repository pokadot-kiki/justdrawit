import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAvatar, saveAvatar, loadName, saveName, NAME_MAX_LEN } from "./playerName.js";
import { AVATARS } from "./avatars.js";
import { profileInputError } from "./profileValidation.js";
import { withProfileIdentity, withProfileList } from "./profileIdentity.js";

test("profile input validates the existing name length and unsafe characters", () => {
  assert.match(profileInputError("  "), /กรุณา/);
  assert.match(profileInputError("a".repeat(NAME_MAX_LEN + 1)), /ไม่เกิน/);
  assert.match(profileInputError("<b>"), /อักขระ/);
  assert.equal(profileInputError("ชื่อใหม่"), null);
});

test("guest avatar selection survives a fresh profile load", () => {
  const saved = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  try {
    saveAvatar(AVATARS.length - 1, AVATARS.length);
    saveName("ชื่อที่บันทึก");
    assert.equal(loadAvatar(AVATARS.length), AVATARS.length - 1);
    assert.equal(loadName(), "ชื่อที่บันทึก");
    saveAvatar(AVATARS.length, AVATARS.length);
    assert.equal(loadAvatar(AVATARS.length), AVATARS.length - 1);
  } finally {
    globalThis.localStorage = original;
  }
});

test("existing local account keeps its profile separate from the guest", () => {
  const saved = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  try {
    saveName("GuestName");
    saveAvatar(1, AVATARS.length);
    saveName("MemberName", "member");
    saveAvatar(4, AVATARS.length, "member");
    assert.equal(loadName("member"), "MemberName");
    assert.equal(loadAvatar(AVATARS.length, "member"), 4);
    assert.equal(loadName(), "GuestName");
    assert.equal(loadAvatar(AVATARS.length), 1);
  } finally {
    globalThis.localStorage = original;
  }
});

test("profile event updates chat, gallery and final-result identities without changing scores", () => {
  const update = { playerId: "same-id", name: "ชื่อใหม่", avatar: 3 };
  const old = { playerId: "same-id", name: "Old", avatar: 0, score: 123, text: "guess" };
  const other = { playerId: "other", name: "Other", avatar: 1, score: 55 };
  const result = withProfileList([old, other], update);
  assert.deepEqual(result[0], { ...old, name: "ชื่อใหม่", avatar: 3 });
  assert.equal(result[1], other);
  assert.equal(withProfileIdentity({ ...old, kind: "correct", system: true, text: "Old ทายถูก" }, update).text, "ชื่อใหม่ ทายถูก");
});
