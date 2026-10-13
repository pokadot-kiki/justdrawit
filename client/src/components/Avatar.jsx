import { AVATARS } from "../avatars";
import { AvatarArtLayered } from "./Icons";

// อวตารแบบแสดงเฉยๆ (ห้องรอ แถบคะแนน หน้าจบเกม ฯลฯ)
// ค่าที่ server ส่งมาควรเป็น 0-5 อยู่แล้ว แต่ถ้าแปลกมาให้ใช้ตัวแรกแทน ไม่ให้จอพัง
// equipped = { frame, hat, glasses, neck, bg } จาก economy_state — ใส่เฉพาะอวตารของ "เราเอง" เท่านั้น
// (server ยังไม่ส่งของตกแต่งของผู้เล่นอื่นมาด้วย รอรอบ B) ไม่ใส่ก็เรนเดอร์เหมือนเดิมทุกตัวอักษร
export default function Avatar({ index, large = false, equipped }) {
  const safe = Number.isInteger(index) && index >= 0 && index < AVATARS.length ? index : 0;
  return (
    <span className={large ? "avatar-chip avatar-chip--lg" : "avatar-chip"} aria-hidden="true">
      <AvatarArtLayered index={safe} equipped={equipped} size={large ? 40 : 30} />
    </span>
  );
}
