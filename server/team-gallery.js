const renderDrawing = require("./mp-ai-render");

// ใช้เฉพาะหลังจบตา: ภาพมาจาก action ที่ server รับและเก็บไว้ในเลนของแต่ละทีม
async function teamGallery(room, teams, render = renderDrawing) {
  return Promise.all(teams.map(async (team) => {
    const lane = room.teams[team];
    const actions = lane.canvasOps.flatMap((op) => op.events);
    const lastClear = actions.findLastIndex((action) => action.type === "clear_canvas");
    const hasDrawing = actions.slice(lastClear + 1).some((action) => ["stroke_start", "draw_shape", "fill"].includes(action.type));
    let image = null;
    let failed = false;
    if (hasDrawing && !lane.canvasFrozen) {
      try { image = await render(actions); }
      catch (err) { failed = true; console.warn("เรนเดอร์ภาพทีมไม่สำเร็จ:", err.message); }
    }
    return { team, name: room.teamNames?.[team] ?? `ทีม ${team}`, drawer: lane.roundDrawer,
      image, status: lane.canvasFrozen ? "incomplete" : failed ? "unavailable" : image ? "ok" : "missing" };
  }));
}

module.exports = teamGallery;
