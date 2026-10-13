const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanName, nameKey } = require("../clean");
const { nameTaken } = require("../name-policy");

test("ชื่อใช้ Unicode รูปแบบเดียวกันและไม่สนตัวพิมพ์เล็ก/ใหญ่", () => {
  assert.equal(cleanName("  Ａlice   Smith  "), "Alice Smith");
  assert.equal(nameKey("  Ａlice   Smith  "), nameKey("alice smith"));
});

test("Guest ถูกปฏิเสธเมื่อซ้ำกับผู้เล่นในห้อง", () => {
  assert.equal(nameTaken({ players: [{ id: "host", name: "Player One" }], name: " player   one ", selfId: "guest" }), true);
  assert.equal(nameTaken({ players: [{ id: "guest", name: "Player One" }], name: "PLAYER ONE", selfId: "guest" }), false);
});

test("Guest ถูกปฏิเสธเมื่อซ้ำกับชื่อบัญชีที่ Server มีข้อมูล", () => {
  const registeredRows = [{ accountId: "a".repeat(64), name: "Registered" }];
  assert.equal(nameTaken({ registeredRows, name: " registered " }), true);
  assert.equal(nameTaken({ registeredRows, name: "New Guest" }), false);
});

test("ผู้ใช้ Login ใช้ชื่อของบัญชีตัวเองได้ แต่ใช้ชื่อบัญชีอื่นไม่ได้", () => {
  const ownId = "a".repeat(64);
  const otherId = "b".repeat(64);
  const registeredRows = [{ accountId: ownId, name: "Owner" }, { accountId: otherId, name: "Other" }];
  assert.equal(nameTaken({ registeredRows, name: "owner", accountId: ownId }), false);
  assert.equal(nameTaken({ registeredRows, name: "other", accountId: ownId }), true);
});
