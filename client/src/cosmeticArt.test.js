// เทสหน่วยของรูปเครื่องประดับ — รัน: node --test client/src/cosmeticArt.test.js
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { ANCHORS, DRAWN_IDS, GRID, avatarCells, itemCells, lookRects } from "./cosmeticArt.js";
import { AVATAR_ART } from "./avatarData.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../../shared/cosmetics.json", import.meta.url), "utf8"));
const cellsOf = (rects) => rects.flatMap((q) => Array.from({ length: q.w }, (_, i) => `${q.x + i},${q.y}`));

test("ทุกไอเทมใน shared/cosmetics.json มีรูป และไม่มีรูปที่ไม่อยู่ในรายการ", () => {
  assert.deepEqual([...DRAWN_IDS].sort(), catalog.items.map((i) => i.id).sort());
});

test("มีจุดวางครบสำหรับอวตารทุกตัว", () => {
  assert.equal(ANCHORS.length, AVATAR_ART.length);
  for (const a of ANCHORS) for (const k of ["hat", "eyes", "neck"]) assert.ok(Number.isInteger(a[k]) && a[k] >= 0 && a[k] < 16);
});

test("ทุกไอเทมบนอวตารทุกตัว: มีพิกเซลจริง และไม่มีช่องไหนหลุดนอกผืน 24×24", () => {
  for (let avatar = 0; avatar < AVATAR_ART.length; avatar++) {
    for (const item of catalog.items) {
      const cells = itemCells(item.id, avatar);
      assert.ok(cells.length > 0, `${item.id} บนอวตาร ${avatar} ไม่มีพิกเซล`);
      for (const c of cells) assert.ok(c.x >= 0 && c.x < GRID && c.y >= 0 && c.y < GRID && /^#[0-9a-f]{6}$/i.test(c.fill), `${item.id} บนอวตาร ${avatar} หลุดผืน/สีผิด ${JSON.stringify(c)}`);
    }
  }
});

test("หมวก แว่น คอ ทับตัวอวตารจริง (ไม่ลอยอยู่ข้างนอก)", () => {
  for (let avatar = 0; avatar < AVATAR_ART.length; avatar++) {
    const body = new Set(avatarCells(avatar).map((c) => `${c.x},${c.y}`));
    for (const item of catalog.items.filter((i) => ["hat", "glasses", "neck"].includes(i.slot))) {
      const touching = itemCells(item.id, avatar).filter((c) => body.has(`${c.x},${c.y}`)).length;
      assert.ok(touching >= 4, `${item.id} บนอวตาร ${avatar} ทับตัวอวตารแค่ ${touching} ช่อง`);
    }
  }
});

test("id ที่ไม่รู้จัก/ค่าว่าง ไม่วาดอะไร และไม่พัง", () => {
  assert.deepEqual(itemCells("hat_does_not_exist", 0), []);
  assert.deepEqual(itemCells(null, 0), []);
  assert.deepEqual(lookRects(0, null), lookRects(0, {}));
  assert.equal(cellsOf(lookRects(99, { hat: "nope" })).length, cellsOf(lookRects(0, null)).length); // อวตารนอกช่วง = ตัวแรก
});

test("แบบย่อไม่วาดพื้นหลังและกรอบ แต่ยังวาดหมวก แว่น คอ", () => {
  const look = { frame: "frame_gold", hat: "hat_cap", glasses: "glasses_dark", neck: "neck_bow", background: "bg_sky" };
  for (let avatar = 0; avatar < AVATAR_ART.length; avatar++) {
    const full = new Set(cellsOf(lookRects(avatar, look)));
    const compact = new Set(cellsOf(lookRects(avatar, look, { compact: true })));
    const worn = new Set(cellsOf(lookRects(avatar, { hat: look.hat, glasses: look.glasses, neck: look.neck })));
    assert.deepEqual([...compact].sort(), [...worn].sort());
    assert.ok(full.size > compact.size);
    assert.ok(!compact.has("0,12") && full.has("0,12")); // ขอบซ้ายสุดของผืนมีแต่พื้นหลัง/กรอบ
  }
});

test("ชั้นหน้าทับชั้นหลัง: ไม่มีช่องซ้ำใน lookRects และพื้นหลังถูกอวตารบังตรงกลาง", () => {
  const rects = lookRects(0, { background: "bg_dots", hat: "hat_straw" });
  const cells = cellsOf(rects);
  assert.equal(new Set(cells).size, cells.length);
  const at = (x, y) => rects.find((q) => q.y === y && x >= q.x && x < q.x + q.w)?.fill;
  assert.notEqual(at(12, 14), at(1, 14)); // กลางผืน = ตัวอวตาร · ขอบ = พื้นหลัง
});
