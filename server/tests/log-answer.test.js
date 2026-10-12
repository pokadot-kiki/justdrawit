const assert = require("node:assert/strict");
const { test } = require("node:test");
const logContainsAnswer = require("./log-answer");

test("ordinary log words containing a short offered word do not count as leaked answers", () => {
  assert.equal(logContainsAnswer("AI Solo: โหมด mock", "มด"), false);
  assert.equal(logContainsAnswer("ประวัติการวาดตานี้ชนเพดาน", "ตา"), false);
});

test("answers printed alone or identified in text and structured logs are detected", () => {
  assert.equal(logContainsAnswer("คำตอบ: มด", "มด"), true);
  assert.equal(logContainsAnswer("คำตอบคือมด", "มด"), true);
  assert.equal(logContainsAnswer("ผู้เล่นวาดคำว่ามด", "มด"), true);
  assert.equal(logContainsAnswer('{"word":"มด"}', "มด"), true);
  assert.equal(logContainsAnswer("มด", "มด"), true);
});
