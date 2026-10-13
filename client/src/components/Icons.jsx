// ชุดไอคอนพิกเซลของเราเอง — ที่เดียวที่เก็บรูปทั้งหมด ทุกหน้าเรียกผ่าน <Icon name="..."/> หรือ <AvatarArt index={n}/>
// วิธีวาด: แต่ละรูปคือตารางตัวอักษร 1 ตัว = 1 พิกเซล (จุด . = โปร่งใส) แล้วแปลงเป็น <rect> ใน SVG
//   ใช้ shapeRendering="crispEdges" ให้ขอบคมเวลาขยาย · ขอบดำหนา 1 พิกเซลตามธีม
// รูปสมมาตร (อวตาร มงกุฎ หัวใจ ...) เขียนแค่ครึ่งซ้าย แล้วสะท้อนอัตโนมัติ (mirror)

// ตัวอักษร → สี (สีทุกตัวมาจากชุดสีของธีมใน theme.css)
export const PAL = {
  k: "#2b2b2b", // ดำ (ขอบ)
  w: "#ffffff",
  c: "#fbf6e6", // ครีม
  y: "#ffc81e", // เหลือง
  Y: "#ffe27a", // เหลืองอ่อน
  o: "#f08a24", // ส้ม
  O: "#c9622a", // ส้มเข้ม
  r: "#e8553f", // แดง
  R: "#f07a66", // แดงอ่อน
  g: "#22a559", // เขียว
  G: "#7fd39b", // เขียวอ่อน
  b: "#1e6fe8", // น้ำเงิน
  B: "#6fa6f2", // ฟ้า
  p: "#e85c9e", // ชมพู
  P: "#f6a6cc", // ชมพูอ่อน
  t: "#13a3a0", // เขียวน้ำทะเล
  u: "#7b5ce0", // ม่วง
  U: "#a994ee", // ม่วงอ่อน
  n: "#8a5a3c", // น้ำตาล
  N: "#c28a5e", // น้ำตาลอ่อน
  s: "#f5cfa0", // สีเนื้อ
  a: "#b9b4a6", // เทา
  A: "#dcd7c8", // เทาอ่อน
};

// ── อวตาร 6 ตัว 16×16 (ครึ่งซ้าย 8 ช่อง) ──
const AVATAR_ART = [
  {
    name: "แพนด้า",
    rows: [
      ".kkk....",
      "kkkkk...",
      "kkkkkkkk",
      "kkkkwwww",
      ".kwwwwww",
      "kwwwwwww",
      "kwkkkwww",
      "kwkwkwww",
      "kwkkkwww",
      "kwwwwwww",
      "kwwwwwkk",
      "kwwwwwkk",
      ".kwwwwwk",
      ".kwwwwww",
      "..kkwwww",
      "....kkkk",
    ],
  },
  {
    name: "แมว",
    rows: [
      "kk......",
      "kok.....",
      "kook....",
      "koookkkk",
      "kooooooo",
      "kooooooo",
      "kooooooo",
      "kowkoooo",
      "kokkoooo",
      "kooooopp",
      "kooookkp",
      "kooowwkk",
      ".kooowww",
      ".koooooo",
      "..kkoooo",
      "....kkkk",
    ],
  },
  {
    name: "จิ้งจอก",
    rows: [
      "kk......",
      "kkk.....",
      "kokk....",
      "kookkkkk",
      "kooooooo",
      "kooooooo",
      "kowkoooo",
      "kokkoooo",
      "kooooooo",
      "kowoooww",
      "kwwwwwww",
      ".kwwwwww",
      ".kwwwwkk",
      "..kwwwkk",
      "...kkwww",
      ".....kkk",
    ],
  },
  {
    name: "กบ",
    rows: [
      "..kkkk..",
      ".kwwwwk.",
      "kwwkkwwk",
      "kwkkkwwk",
      "kggkkggg",
      "kggggggg",
      "kggggggg",
      "kggggggg",
      "kggggggg",
      "kgkgggkg",
      "kggkkkkk",
      "kgggggGG",
      ".kggggGG",
      ".kgggggg",
      "..kkgggg",
      "....kkkk",
    ],
  },
  {
    name: "ลิง",
    rows: [
      "..kkkk..",
      ".knnnnnk",
      "kssknnnn",
      "kssknnnn",
      "kssnnnnn",
      ".knnkkkk",
      ".knsssss",
      ".knsksss",
      ".knsssss",
      ".knssssk",
      ".knsssnn",
      ".knssssk",
      "..knnsss",
      "..knnnnn",
      "...kknnn",
      ".....kkk",
    ],
  },
  {
    name: "ปลาหมึก",
    rows: [
      "....kkkk",
      "..kkuuuu",
      ".kuuuuuU",
      ".kuuuuUU",
      "kuuuuuuu",
      "kuuwwuuu",
      "kuuwkwuu",
      "kuuwwuuu",
      "kuuuuuuu",
      "kuuuuuuu",
      "kukuukuu",
      "kukuukuu",
      "kuk.kuuk",
      ".kk.kuk.",
      "....kk..",
      "........",
    ],
  },
];

// ── ไอคอนทั่วไป ──
// size = ขนาดตารางจริง · mirror = เขียนแค่ครึ่งซ้าย
const ART = {
  // ── ไอคอนของตกแต่งในร้านค้า (รอบ A/B) สไตล์เดียวกับอวตารสัตว์ ──
  frame_default: [
    "kkkkkkk",
    "k.....k",
    "k.....k",
    "k.....k",
    "kkkkkkk",
  ],
  frame_sakura: [
    "..kkk..",
    ".kpPpk.",
    "kpPwPpk",
    "kpPwPpk",
    "kpPpPpk",
    ".kpPpk.",
    "..kkk..",
  ],
  frame_rainbow: [
    "kkkkkkkkk",
    "krrrrrrrk",
    "koooooook",
    "kyyyyyyyk",
    "kgggggggk",
    "kbbbbbbbk",
    "kuuuuuuuk",
    "kkkkkkkkk",
  ],
  frame_stars: [
    "....k....",
    "...kyk...",
    "..kyyyk..",
    "kkkyyykkk",
    "kyyyyyyyk",
    "..kyyyk..",
    "...kyk...",
    "....k....",
  ],
  hat_wizard: [
    "....k....",
    "...kuk...",
    "...kuk...",
    "..kuuuk..",
    ".kuYuuuk.",
    "kuuuuuuuk",
    "kkkkkkkkk",
  ],
  glasses_pixel: [
    "kkkkk.kkkkk",
    "kaaak.kaaak",
    "kaaakkkaaak",
    "kaaak.kaaak",
    "kkkkk.kkkkk",
  ],
  neck_bowtie: [
    "kk...kk",
    "krk.krk",
    "krrkrrk",
    "krk.krk",
    "kk...kk",
  ],
  bg_default: [
    "kkkkkkk",
    "kccccck",
    "kccccck",
    "kccccck",
    "kkkkkkk",
  ],
  frame_heart: [
    "..kkk.kkk..",
    ".krrrkrrrk.",
    "krRRrkrrrrk",
    "krRrrkrrrrk",
    "krrrkrrrrrk",
    ".krrrkrrrk.",
    "..krrkrrk..",
    "...krkrk...",
    "....kkk....",
  ],
  hat_cap: [
    "...kkkkk...",
    "..krrrrrk..",
    ".krrrrrrrk.",
    "krrrrrrrrrk",
    "kkkkkkkkkkk",
    "......kkkkk",
  ],
  hat_bunny: [
    ".kk.....kk.",
    ".kwk...kwk.",
    "kwPwk.kwPwk",
    "kwPwk.kwPwk",
    ".kwk...kwk.",
    "..k.....k..",
    ".kkkkkkkkk.",
  ],
  glasses_round: [
    ".kkk.k.kkk.",
    "kaaak.kaaak",
    "kaaakkkaaak",
    "kaaak.kaaak",
    ".kkk.k.kkk.",
  ],
  neck_scarf: [
    "kkkkkkkkk",
    "ktttttttk",
    "kkkkkkkkk",
    "...ktk...",
    "...ktk...",
    "..kttk...",
    "...kk....",
  ],
  neck_tie: [
    "..kkk..",
    ".krrrk.",
    "..krk..",
    "..krk..",
    ".krrrk.",
    "krrrrrk",
    ".krrrk.",
    "..krk..",
  ],
  bg_sky: [
    "kBBBBBBBk",
    "kBBBBBBBk",
    "kBwwwBBBk",
    "kwwwwwBBk",
    "kBwwwBBBk",
    "kBBBBBBBk",
    "kkkkkkkkk",
  ],
  bg_dots: [
    "kuuuuuuuk",
    "kuUuuUuuk",
    "kuuuuuuuk",
    "kuuUuuUuk",
    "kuuuuuuuk",
    "kuUuuUuuk",
    "kkkkkkkkk",
  ],
  bg_grass: [
    "kgggggggk",
    "kgGgGgGgk",
    "kgggggggk",
    "kGgGgGgGk",
    "kgggggggk",
    "kkkkkkkkk",
  ],
  deco_none: [
    ".......",
    ".......",
    ".kkkkk.",
    ".......",
    ".......",
  ],
  coin: [
    "..kkk..",
    ".kyYyk.",
    "kyYyYyk",
    "kyYkYyk",
    "kyYyYyk",
    ".kyYyk.",
    "..kkk..",
  ],
  arrowL: [
    ".....kk.",
    "....kkk.",
    "...kkkk.",
    "..kkkkk.",
    ".kkkkkk.",
    "kkkkkkk.",
    ".kkkkkk.",
    "..kkkkk.",
    "...kkkk.",
    "....kkk.",
    ".....kk.",
  ],
  // ภาพบ้านเล็กๆ ใช้เป็นภาพวาดในการ์ดโหมดแข่งเดี่ยว
  house: [
    "......kk......",
    ".....krrk.....",
    "....krrrrk....",
    "...krrrrrrk...",
    "..krrrrrrrrk..",
    ".kkkkkkkkkkkk.",
    "..kYYYYYYYYk..",
    "..kYnnYYYbbk..",
    "..kYnnYYYbbk..",
    "..kYnnYYYbbk..",
    "..kkkkkkkkkk..",
  ],
  users: [
    ".kkkk....kkkk.",
    "kbbbbk..kooook",
    "kbbbbk..kooook",
    ".kkkk....kkkk.",
    "kbbbbbkkoooook",
    "kbbbbbkkoooook",
    "kkkkkkkkkkkkkk",
  ],
  music: [
    "........kkkk",
    "........kwwk",
    "........kk.k",
    "........kk..",
    "........kk..",
    "........kk..",
    "...kkkk.kk..",
    "..kwwwwkkk..",
    "..kwwwwwk...",
    "...kkkkk....",
  ],
  share: [
    ".....kk.....",
    "....kwwk....",
    "...kwwwwk...",
    "..kkkwwkkk..",
    "....kwwk....",
    "....kwwk....",
    "k...kwwk...k",
    "k...kkkk...k",
    "k..........k",
    "k..........k",
    "kkkkkkkkkkkk",
  ],
  clock: [
    "...kkkkkk...",
    "..kwwwwwwk..",
    ".kwwwwkwwwk.",
    "kwwwwwkwwwwk",
    "kwwwwwkwwwwk",
    "kwwwwwkkkkwk",
    "kwwwwwwwwwwk",
    "kwwwwwwwwwwk",
    ".kwwwwwwwwk.",
    "..kwwwwwwk..",
    "...kkkkkk...",
  ],
  question: [
    "...kkkkkk...",
    "..kbbbbbbk..",
    ".kbbbbbbbbk.",
    "kbbbwwwwbbbk",
    "kbbbwbbwbbbk",
    "kbbbbbbwbbbk",
    "kbbbbwwbbbbk",
    "kbbbbwbbbbbk",
    "kbbbbbbbbbbk",
    ".kbbbwbbbbk.",
    "..kbbbbbbk..",
    "...kkkkkk...",
  ],
  // ไมค์ (ปุ่มตอบด้วยเสียงในช่องทาย) สองสถานะ: ปิด (เทา) / กำลังฟัง (แดง+คลื่นเสียง)
  micOff: [
    "...kkkk....",
    "..kAAAAk...",
    ".kAAAAAAk..",
    ".kAAAAAAk..",
    ".kAAAAAAk..",
    ".kAAAAAAk..",
    ".kAAAAAAk..",
    "..kAAAAk...",
    "...kkkk....",
    "....kk.....",
    "...kkkk....",
    "...........",
  ],
  micOn: [
    "...kkkk....",
    "..krrrrk...",
    ".krrrrrrk..",
    "k.rrrrrrk.k",
    ".krrrrrrk..",
    "k.rrrrrrk.k",
    ".krrrrrrk..",
    "..krrrrk...",
    "...kkkk....",
    "....kk.....",
    "...kkkk....",
    "...........",
  ],
  // เครื่องมือ (12×12)
  pen: [
    ".........kkk",
    "........kppp",
    ".......kpppk",
    "......kaaak.",
    ".....kyyyk..",
    "....kyyyk...",
    "...kyyyk....",
    "..kyyyk.....",
    ".ksssk......",
    "ksskk.......",
    "kkk.........",
    "k...........",
  ],
  eraser: [
    "............",
    "............",
    "......kkkkk.",
    ".....kBBBBBk",
    "....kBBBBBk.",
    "...kBBBBBk..",
    "..kBBBBBk...",
    ".kwwwwwk....",
    "kwwwwwk.....",
    "wwwwwk......",
    "wwwwk.......",
    "kkkk........",
  ],
  // ลูกเต๋าพิกเซล (ปุ่มสุ่มชื่อ)
  dice: [
    "............",
    ".kkkkkkkkkk.",
    ".kwwwwwwwwk.",
    ".kwkkwwkkwk.",
    ".kwkkwwkkwk.",
    ".kwwwkkwwwk.",
    ".kwwwkkwwwk.",
    ".kwkkwwkkwk.",
    ".kwkkwwkkwk.",
    ".kwwwwwwwwk.",
    ".kkkkkkkkkk.",
    "............",
  ],
  // ถังสี 20×20: ถังเอียง 45° มีหูหิ้ว สีไหลออกปากถังเป็นหยด — "สีเดียวทั้งถัง" คือสีที่เลือกอยู่ (prop accent)
  // C = สีที่เลือก · D = เฉดเข้มของสีนั้น · E = เฉดอ่อน (คำนวณใน toRects) · k = ขอบดำ จึงเห็นชัดแม้เลือกสีขาว/สีอ่อน
  bucket: [
    ".........kkkkkk.....",
    "........kDDDDDDk....",
    ".......kDDkkkkDDk...",
    ".......kDk....kDk...",
    ".......kDDk....kDk..",
    "......kEDDDk...kDk..",
    ".....kECEDDDk..kDk..",
    "....kECCCEDDDk.kDk..",
    "....kECCCCEDDDkDDk..",
    "...kECCCCCCEDDDDk...",
    "...kDCCCCCCCEDDDk...",
    "....kDCCCCCCDEkCk...",
    ".....kDCCCCDkk.kCk..",
    "......kDCCDk...kCk..",
    ".......kDDk....kCk..",
    "...............kCk..",
    "..............kECCk.",
    "..............kCCCk.",
    "...............kkk..",
    "....................",
  ],
  // เครื่องมือรูปทรง: เส้นตรง สี่เหลี่ยม วงกลม สามเหลี่ยม
  "shape-line": [
    "............",
    "..........kk",
    ".........kkk",
    "........kkk.",
    ".......kkk..",
    "......kkk...",
    ".....kkk....",
    "....kkk.....",
    "...kkk......",
    "..kkk.......",
    "kkkk........",
    "kk..........",
  ],
  "shape-rect": [
    "............",
    "............",
    ".kkkkkkkkkk.",
    ".kBBBBBBBBk.",
    ".kBBBBBBBBk.",
    ".kBBBBBBBBk.",
    ".kBBBBBBBBk.",
    ".kBBBBBBBBk.",
    ".kBBBBBBBBk.",
    ".kkkkkkkkkk.",
    "............",
    "............",
  ],
  "shape-circle": [
    "............",
    "....kkkk....",
    "..kkBBBBkk..",
    ".kBBBBBBBBk.",
    ".kBBBBBBBBk.",
    "kBBBBBBBBBBk",
    "kBBBBBBBBBBk",
    ".kBBBBBBBBk.",
    ".kBBBBBBBBk.",
    "..kkBBBBkk..",
    "....kkkk....",
    "............",
  ],
  "shape-triangle": [
    "............",
    ".....kk.....",
    ".....kk.....",
    "....kBBk....",
    "....kBBk....",
    "...kBBBBk...",
    "...kBBBBk...",
    "..kBBBBBBk..",
    "..kBBBBBBk..",
    ".kBBBBBBBBk.",
    ".kkkkkkkkkk.",
    "............",
  ],
  trash: [
    "....kkkk....",
    "..kkkkkkkk..",
    "kkkkkkkkkkkk",
    "..kaaaaaak..",
    "..kawakwak..",
    "..kawakwak..",
    "..kawakwak..",
    "..kawakwak..",
    "..kawakwak..",
    "..kaaaaaak..",
    "..kkkkkkkk..",
    "............",
  ],
  undo: [
    "............",
    "...k........",
    "..kk........",
    ".kkkkkkkk...",
    "kkkkkkkkkk..",
    ".kk.....kkk.",
    "..k......kk.",
    "..........k.",
    "..........k.",
    ".........kk.",
    "...kkkkkkk..",
    "............",
  ],
  redo: [
    "............",
    "........k...",
    "........kk..",
    "...kkkkkkkk.",
    "..kkkkkkkkkk",
    ".kkk.....kk.",
    ".kk......k..",
    "k...........",
    ".k..........",
    ".kk.........",
    "..kkkkkkk...",
    "............",
  ],
  // แถบบน (12×12)
  sound: [
    "............",
    "....k.......",
    "...kk...k...",
    "kkkkk....k..",
    "kwwkk.k..k..",
    "kwwkk..k.k..",
    "kwwkk..k.k..",
    "kwwkk.k..k..",
    "kkkkk....k..",
    "...kk...k...",
    "....k.......",
    "............",
  ],
  mute: [
    "............",
    "....k.......",
    "...kk.......",
    "kkkkk.k...k.",
    "kwwkk..k.k..",
    "kwwkk...k...",
    "kwwkk...k...",
    "kwwkk..k.k..",
    "kkkkk.k...k.",
    "...kk.......",
    "....k.......",
    "............",
  ],
  // สัญลักษณ์ทั่วไป
  heartBroken: [
    "..kkk.kkk..",
    ".krrrkrrrk.",
    "krRRrkrrrrk",
    "krRrrkrrrrk",
    "krrrkrrrrrk",
    ".krrrkrrrk.",
    "..krrkrrk..",
    "...krkrk...",
    "....kkk....",
    ".....k.....",
  ],
  check: [
    "..........kk",
    ".........kgk",
    "........kggk",
    "kk.....kgGk.",
    "kgk...kggk..",
    "kggk.kgGk...",
    ".kggkggk....",
    "..kggggk....",
    "...kgGk.....",
    "....kk......",
  ],
  pencil: [
    ".........kk.",
    "........kpk.",
    ".......kppk.",
    "......kyyk..",
    ".....kyyk...",
    "....kyyk....",
    "...kyyk.....",
    "..kyyk......",
    ".kyyk.......",
    "kyok........",
    "kok.........",
  ],
  flag: [
    "kkkkkkkk....",
    "krrrrrrrkk..",
    "krRRrrrrrrk.",
    "krrrrrrrrk..",
    "krrrrrrkk...",
    "kkkkkkk.....",
    "kk..........",
    "k...........",
    "k...........",
    "kk..........",
  ],
  skip: [
    "kk......kk..",
    "kkk.....kk..",
    "kkkk....kk..",
    "kkkkk...kk..",
    "kkkk....kk..",
    "kkk.....kk..",
    "kk......kk..",
  ],
  palette: [
    "...kkkkkkk..",
    ".kkcccccccck",
    "kcccrrcccccc",
    "kccrrrccbbck",
    "kccccccbbbck",
    "kcgggcccbbck",
    "kcggggccccck",
    "kcccggccykck",
    ".kcccccckkyk",
    "..kkkkkkkkk.",
  ],
  hourglass: [
    "kkkkkkkkkk",
    "kYYYYYYYYk",
    ".kYYYYYYk.",
    "..kYYYYk..",
    "...kkkk...",
    "...kyyk...",
    "..kyyyyk..",
    ".kyyyyyyk.",
    "kyyyyyyyyk",
    "kkkkkkkkkk",
  ],
};

// เหรียญ 1–3 (14×17) — สร้างจากโค้ด: ริบบิ้นสองแถบ + วงกลม + ตัวเลขฟอนต์พิกเซล 3×5
const DIGITS = {
  1: [".#.", "##.", ".#.", ".#.", "###"],
  2: ["###", "..#", "###", "#..", "###"],
  3: ["###", "..#", "###", "..#", "###"],
};
function medalRows(n, face, dark) {
  const g = Array.from({ length: 17 }, () => Array(14).fill("."));
  for (let y = 0; y < 4; y++) "...kbbkkrrk...".split("").forEach((ch, x) => (g[y][x] = ch));
  const inside = (x, y) => (x - 6.5) ** 2 + (y - 10) ** 2 <= 6.3 ** 2;
  for (let y = 4; y < 17; y++) {
    for (let x = 0; x < 14; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      g[y][x] = edge ? "k" : face;
    }
  }
  DIGITS[n].forEach((row, dy) =>
    row.split("").forEach((ch, dx) => {
      if (ch === "#") g[8 + dy][6 + dx - 1] = dark;
    }),
  );
  return g.map((r) => r.join(""));
}

// รวมช่องสีเดียวกันติดกันในแถวเดียวกันเป็น <rect> เดียว
// ผสมสีกับดำ/ขาว ให้ได้เฉดเข้ม/อ่อนของสีเดียวกัน (ใช้กับสีเน้นของไอคอน)
function mixHex(hex, target, t) {
  const n = (i) => parseInt(String(hex).slice(1 + i * 2, 3 + i * 2), 16) || 0;
  const to = target === "black" ? 0 : 255;
  return `#${[0, 1, 2].map((i) => Math.round(n(i) + (to - n(i)) * t).toString(16).padStart(2, "0")).join("")}`;
}

export function toRects(rows, mirror, accent = "#e8553f") {
  const shades = { C: accent, D: mixHex(accent, "black", 0.3), E: mixHex(accent, "white", 0.45) };
  const full = mirror ? rows.map((r) => r + [...r].reverse().join("")) : rows;
  const rects = [];
  full.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = shades[ch] ?? PAL[ch]; // C = สีเน้น (เช่น สีที่เลือกอยู่ในหยดของถังสี)
      if (ch !== "." && fill) rects.push({ x, y, w: end - x, fill });
      x = end;
    }
  });
  return { rects, w: full[0].length, h: full.length };
}

function Pix({ rows, mirror = false, size = 20, className = "", label, accent }) {
  const { rects, w, h } = toRects(rows, mirror, accent);
  return (
    <svg
      className={`pix ${className}`.trim()}
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={Math.round((size * h) / w)}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill={r.fill} />
      ))}
    </svg>
  );
}

// ครึ่งซ้ายของรูปสมมาตร (เขียนสั้นๆ ที่เดียว)
const HALF = {
  trophy: [
    "kkkkkkk",
    "kkyyyyy",
    "k.kyYyy",
    "k.kyYyy",
    "kkkyyyy",
    ".kkyyyy",
    "...kyyy",
    "....kyy",
    ".....ky",
    ".....ky",
    "....kky",
    "...kkkk",
    "...koooo",
    "...kkkk",
  ],
  heart: [
    "..kkk.k",
    ".krrrkr",
    "krRRrrr",
    "krRrrrr",
    "krrrrrr",
    ".krrrrr",
    "..krrrr",
    "...krrr",
    "....krr",
    ".....kr",
    "......k",
  ],
  heartOff: [
    "..kkk.k",
    ".kaaaka",
    "kaAAaaa",
    "kaAaaaa",
    "kaaaaaa",
    ".kaaaaa",
    "..kaaaa",
    "...kaaa",
    "....kaa",
    ".....ka",
    "......k",
  ],
  crown: [
    "k.....",
    "kk....",
    "kyk...",
    "kyyk.k",
    "kyyykk",
    "kyyyyy",
    "kyrYyy",
    "kyyyyy",
    "kkkkkk",
  ],
  robot: [
    ".....k",
    ".....r",
    "..kkkk",
    ".kBBBB",
    "kkBwkB",
    "kBBkkB",
    "kkBBBB",
    ".kBkkk",
    ".kBBBB",
    "..kkkk",
  ],
  door: [
    "..kkkk",
    ".krrrr",
    ".krRRR",
    ".krRRR",
    ".krrrr",
    ".krRRR",
    ".krRRR",
    ".krRRR",
    ".krrrr",
    "kkkkkk",
  ],
  info: [
    "....kk",
    "..kkbb",
    ".kbbbw",
    ".kbbbw",
    "kbbbbb",
    "kbbbww",
    "kbbbbw",
    "kbbbbw",
    ".kbbbw",
    ".kbbww",
    "..kkbb",
    "....kk",
  ],
  star: [
    ".....k",
    ".....k",
    "....ky",
    "kkkkky",
    "kyyyyy",
    ".kyyyy",
    "..kyyy",
    "..kyyy",
    ".kyyyk",
    ".kkkk.",
  ],
  bulb: [
    "...kkk",
    "..kyyy",
    ".kyYYy",
    ".kyYyy",
    ".kyyyy",
    ".kyyyy",
    "..kyyy",
    "...kyy",
    "...kaa",
    "...kkk",
    "....ka",
    ".....k",
  ],
  x: [
    "kk...",
    "krk..",
    ".krk.",
    "..krk",
    "...kr",
    "...kr",
    "..krk",
    ".krk.",
    "krk..",
    "kk...",
  ],
};

// รายชื่อไอคอนที่ใช้ได้ (ใช้ตรวจตอนเขียนโค้ด)
export const ICON_NAMES = [...new Set([...Object.keys(ART), ...Object.keys(HALF), "medal1", "medal2", "medal3"])];

// <Icon name="trophy" size={20} /> — size คือความกว้างเป็นพิกเซลหน้าจอ
// label ใส่เมื่อไอคอนสื่อความหมายเองโดยไม่มีข้อความอยู่ข้างๆ (ไม่ใส่ = ซ่อนจากโปรแกรมอ่านหน้าจอ)
export function Icon({ name, size = 20, className = "", label, accent }) {
  let rows;
  let mirror = false;
  if (name === "medal1") rows = medalRows(1, "y", "O");
  else if (name === "medal2") rows = medalRows(2, "A", "k");
  else if (name === "medal3") rows = medalRows(3, "N", "k");
  else if (HALF[name]) ({ rows, mirror } = { rows: HALF[name], mirror: true });
  else if (ART[name]) rows = ART[name];
  else if (name === "arrowR") rows = ART.arrowL.map((r) => [...r].reverse().join(""));
  else return null;
  // ทุกแถวต้องกว้างเท่ากัน (กันพิมพ์พลาดแล้วรูปเบี้ยว)
  const w = rows[0].length;
  const fixed = rows.map((r) => r.padEnd(w, ".").slice(0, w));
  return <Pix rows={fixed} mirror={mirror} size={size} className={`icon icon--${name} ${className}`.trim()} label={label} accent={accent} />;
}

export const AVATAR_COUNT = AVATAR_ART.length;
export const AVATAR_NAMES = AVATAR_ART.map((a) => a.name);

// อวตาร 16×16 · index 0–5 ตรงกับค่า avatar ที่ส่งไป server (events.md)
export function AvatarArt({ index = 0, size = 40, label }) {
  const safe = Number.isInteger(index) && index >= 0 && index < AVATAR_COUNT ? index : 0;
  return <Pix rows={AVATAR_ART[safe].rows} mirror size={size} className="avatar-art" label={label} />;
}

// ── อวตารซ้อนชั้นของตกแต่ง (รอบ A/B ร้านค้า) ──
// itemId ของแต่ละหมวดใน equipped ตรงกับ server/data/shop-items.json เป๊ะ · ไม่มี/เป็น default = ไม่วาดชั้นนั้นเพิ่ม
const HAT_ICON = { hat_wizard: "hat_wizard", hat_crown: "crown", hat_cap: "hat_cap", hat_bunny: "hat_bunny" };
const GLASSES_ICON = { glasses_pixel: "glasses_pixel", glasses_round: "glasses_round" };
const NECK_ICON = { neck_bowtie: "neck_bowtie", neck_scarf: "neck_scarf", neck_tie: "neck_tie" };
const FRAME_RING = {
  frame_sakura: "0 0 0 4px #f6a6cc",
  frame_rainbow: "0 0 0 2px #1e6fe8, 0 0 0 4px #e85c9e",
  frame_stars: "0 0 0 4px #ffc81e, 0 0 10px 3px #ffe27a",
  frame_heart: "0 0 0 4px #e8553f",
};
// สี/ลายพื้นหลังหลังอวตาร — ตั้งใจทำแค่สีพื้นเรียบๆ ไม่ใช่ลายเต็มรูปแบบ (เร็วและอ่านง่ายทุกขนาด)
export const BG_COLOR = { bg_sky: "#bfe3f7", bg_dots: "#d9c9f6", bg_grass: "#cdeec2" };

// index = อวตารสัตว์ 0-5 · equipped = { frame, hat, glasses, neck, bg } จาก economy_state (null = ยังไม่ล็อกอิน/ยังไม่มีของ → เหมือนเดิมทุกตัวอักษร)
export function AvatarArtLayered({ index = 0, equipped, size = 40, label }) {
  const eq = equipped || {};
  const ring = FRAME_RING[eq.frame];
  const bg = BG_COLOR[eq.bg];
  return (
    <span
      className="avatar-layers"
      style={{ position: "relative", display: "inline-grid", placeItems: "center", width: size, height: size, borderRadius: "50%", boxShadow: ring, background: bg }}
    >
      <AvatarArt index={index} size={size} label={label} />
      {NECK_ICON[eq.neck] && <Icon name={NECK_ICON[eq.neck]} size={Math.round(size * 0.4)} className="avatar-layers__item avatar-layers__neck" />}
      {GLASSES_ICON[eq.glasses] && <Icon name={GLASSES_ICON[eq.glasses]} size={Math.round(size * 0.5)} className="avatar-layers__item avatar-layers__glasses" />}
      {HAT_ICON[eq.hat] && <Icon name={HAT_ICON[eq.hat]} size={Math.round(size * 0.58)} className="avatar-layers__item avatar-layers__hat" />}
    </span>
  );
}

