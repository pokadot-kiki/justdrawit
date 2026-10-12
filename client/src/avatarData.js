// ข้อมูลรูปพิกเซลของอวตาร 6 ตัว + จานสี — ไฟล์ .js ล้วน (ไม่มี JSX) เพื่อให้ทั้ง Icons.jsx, เครื่องประดับ (cosmeticArt.js)
// และสคริปต์ทำภาพตารางรวม (client/scripts/make-cosmetics-sheet.mjs) ใช้ข้อมูลชุดเดียวกัน
// ย้ายมาจาก components/Icons.jsx ทุกตัวอักษร (ลำดับอวตาร 0–5 ตรงกับค่า avatar ใน events.md)

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

// อวตาร 16×16: แต่ละแถวคือครึ่งซ้าย 8 ช่อง (ครึ่งขวาสะท้อนจากซ้าย)
export const AVATAR_ART = [
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
