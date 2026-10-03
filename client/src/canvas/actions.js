// ตัวสร้าง "การกระทำ" (action) บนกระดาน
//
// ทุกอย่างที่เกิดขึ้นบนกระดาน — เริ่มเส้น ต่อเส้น จบเส้น เทสี ล้างจอ —
// ถูกแปลงเป็น object หน้าตาเดียวกับที่ events.md หัวข้อ 4 กำหนดไว้เป๊ะ
// ข้อ 4 จะได้แค่เอา action นี้ยัดลง socket.emit ตรงๆ ไม่ต้องแปลงอะไรอีก
//
//   beginStroke  →  stroke_start   { x, y, color, size, tool }
//   extendStroke →  stroke_points  { points: [ { x, y }, ... ] }
//   endStroke    →  stroke_end     {}
//   applyFill    →  fill           { x, y, color }
//   drawShape    →  draw_shape     { shape, x1, y1, x2, y2, color, size }
//   clearBoard   →  clear_canvas   {}
//
// ทุกฟังก์ชันเป็น pure function (คืน object ใหม่ ไม่แก้ของเดิม) จึงเอาไปเทสแยกได้

export function beginStroke({ x, y, color, size, tool }) {
  return { type: "stroke_start", x, y, color, size, tool };
}

// points เป็นชุด ไม่ใช่จุดเดียว — events.md สั่งให้รวมจุดแล้วส่งทุก ~30-50ms
// เพื่อไม่ให้ส่งถี่เกินไปจนเกมหน่วง (ดู FLUSH_MS ใน Canvas.jsx)
export function extendStroke(points) {
  return { type: "stroke_points", points };
}

export function endStroke() {
  return { type: "stroke_end" };
}

export function applyFill({ x, y, color }) {
  return { type: "fill", x, y, color };
}

// รูปทรง (line | rect | circle | triangle) ลากเสร็จแล้วส่งทีเดียว — ไม่มีสามจังหวะแบบเส้น
export function drawShape({ shape, x1, y1, x2, y2, color, size }) {
  return { type: "draw_shape", shape, x1, y1, x2, y2, color, size };
}

export function clearBoard() {
  return { type: "clear_canvas" };
}
