import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// สร้างรายชื่อเพลงให้ /music/playlist.json จากไฟล์ใน public/music/ (ผู้ใช้แค่ใส่ไฟล์ ไม่ต้องแก้โค้ด)
// - ตอน dev: ตอบสดทุกครั้งที่ขอ (ใส่ไฟล์เพิ่มแล้วรีเฟรชหน้าก็เห็น)
// - ตอน build: เขียนไฟล์ลง dist ให้
// ไม่มีโฟลเดอร์/ไม่มีไฟล์ = รายชื่อว่าง → client ซ่อนปุ่มเพลง
const MUSIC_DIR = path.resolve("public/music");
const AUDIO_RE = /\.(mp3|ogg|wav|m4a|webm)$/i;
function playlist() {
  try {
    return fs.readdirSync(MUSIC_DIR).filter((f) => AUDIO_RE.test(f)).sort();
  } catch {
    return [];
  }
}
function musicPlaylist() {
  return {
    name: "jdi-music-playlist",
    configureServer(server) {
      server.middlewares.use("/music/playlist.json", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(playlist()));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "music/playlist.json", source: JSON.stringify(playlist()) });
    },
  };
}

// ให้ client คุยกับ server ผ่าน origin เดียวกัน (เบราว์เซอร์เห็นเป็น localhost:5173 ทั้งคู่)
// ข้อดีคือข้อ 8 ตอนรวมเป็นพอร์ตเดียว โค้ดฝั่ง client ไม่ต้องแก้อะไรเลย
// PROXY_PORT / DEV_PORT: ไว้ให้เทสรัน server กับ vite คนละพอร์ตจากของจริง (ไม่ตั้ง = 3000 / 5173 ตามเดิม)
// ใช้ IPv4 ตรงกับ Server ของโปรเจกต์นี้; localhost อาจเลือก ::1 และไปหา Server อีกตัวที่จับพอร์ตเดียวกัน
const SERVER = `http://127.0.0.1:${process.env.PROXY_PORT || 3000}`;
export default defineConfig({
  plugins: [react(), musicPlaylist()],
  server: {
    port: Number(process.env.DEV_PORT) || 5173,
    proxy: {
      // ws: true สำคัญมาก — socket.io เริ่มด้วย HTTP แล้วขออัปเกรดเป็น WebSocket
      // ถ้าไม่ใส่ flag นี้การอัปเกรดจะไม่ผ่าน แล้วภาพวาดสดจะไม่ทำงาน
      "/socket.io": { target: SERVER, ws: true },
      "/api": { target: SERVER },
    },
  },
});
