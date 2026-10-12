// จังหวะที่หน้าเว็บส่งภาพให้ AI ดู — ใช้ร่วมกันระหว่าง Solo (SoloAI.jsx) กับ Multiplayer vs AI (MpAiGame.jsx)
// server รับห่างกันได้ไม่ต่ำกว่า 4 วิ (SNAPSHOT_MIN_GAP_MS ใน server/index.js) และให้ AI ดูทีละภาพ
export const SNAPSHOT_MS = 5000; // ส่งภาพให้ AI ดูทุก 5 วินาที
export const SNAPSHOT_WIDTH = 512; // กว้างสุดของภาพที่ส่ง (โมเดลวัดความแม่นที่ขนาดนี้)
export const SNAPSHOT_HEIGHT = SNAPSHOT_WIDTH * 3 / 4; // กระดานเกม 4:3
export const THINK_TIMEOUT_MS = 20000; // server รอ AI สูงสุด 15 วิ เผื่อไว้อีกนิดกันค้างถ้าคำตอบหาย
