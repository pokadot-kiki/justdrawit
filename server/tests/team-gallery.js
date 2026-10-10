const assert = require("node:assert/strict");
const { test } = require("node:test");
const sharp = require("sharp");
const teamGallery = require("../team-gallery");
const { rules } = require("../team-membership");

test("server accepted artwork, drawer identity, and empty states for supported team counts", async () => {
  for (let count = rules.minTeams; count <= rules.ids.length; count++) {
    const teams = rules.ids.slice(0, count);
    const room = { teams: {}, teamNames: Object.fromEntries(teams.map((t) => [t, `ชื่อ ${t}`])) };
    for (const team of teams) room.teams[team] = {
      roundDrawer: { playerId: `drawer-${team}`, name: `ผู้วาด ${team}`, avatar: 1 },
      canvasFrozen: false,
      canvasOps: team === teams.at(-1) ? [] : [{ events: [
        { type: "stroke_start", x: 0.1, y: 0.1, color: "#000000", size: 8, tool: "pen" },
        { type: "stroke_points", points: [{ x: 0.9, y: 0.9 }] },
        { type: "stroke_end" },
      ] }],
    };
    const gallery = await teamGallery(room, teams);
    assert.deepEqual(gallery.map((g) => g.team), teams);
    assert.deepEqual(gallery.map((g) => g.drawer?.playerId), teams.map((t) => `drawer-${t}`));
    assert.equal(gallery.at(-1).image, null);
    assert.equal(gallery.at(-1).status, "missing");
    for (const entry of gallery.slice(0, -1)) {
      assert.equal(entry.status, "ok");
      const png = Buffer.from(entry.image.slice("data:image/png;base64,".length), "base64");
      const pixel = await sharp(png).extract({ left: 256, top: 192, width: 1, height: 1 }).raw().toBuffer();
      assert.ok(pixel[0] < 255, "actual server stroke appears in the rendered PNG");
    }
  }
});

test("a cleared or truncated drawing cannot be presented as completed artwork", async () => {
  const room = { teams: {
    A: { roundDrawer: null, canvasFrozen: false, canvasOps: [{ events: [{ type: "stroke_start", x: 0, y: 0, color: "#000000", size: 8, tool: "pen" }] }, { events: [{ type: "clear_canvas" }] }] },
    B: { roundDrawer: { playerId: "old-drawer", name: "ผู้วาด", avatar: 2 }, canvasFrozen: true, canvasOps: [{ events: [{ type: "draw_shape", shape: "line", x1: 0, y1: 0, x2: 1, y2: 1, color: "#000000", size: 8 }] }] },
  } };
  const gallery = await teamGallery(room, ["A", "B"]);
  assert.deepEqual(gallery.map((g) => [g.image, g.status]), [[null, "missing"], [null, "incomplete"]]);
  assert.equal(gallery[1].drawer.playerId, "old-drawer");
});

test("renderer failure is disclosed as unavailable instead of a missing drawing", async () => {
  const room = { teams: { A: { roundDrawer: { playerId: "drawer", name: "ผู้วาด", avatar: 1 },
    canvasFrozen: false, canvasOps: [{ events: [{ type: "draw_shape", shape: "line" }] }] } } };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const [entry] = await teamGallery(room, ["A"], async () => { throw new Error("render failed"); });
    assert.equal(entry.image, null);
    assert.equal(entry.status, "unavailable");
  } finally { console.warn = originalWarn; }
});
