import { AVATARS } from "../avatars";
import { AvatarArt } from "./Icons";
import AvatarLook from "./AvatarLook";
import { COMPACT_SLOTS, hasAny } from "../cosmetics";

// อวตารแบบแสดงเฉยๆ (ห้องรอ แถบคะแนน หน้าจบเกม ปุ่มโปรไฟล์)
// ค่าที่ server ส่งมาควรเป็น 0-5 อยู่แล้ว แต่ถ้าแปลกมาให้ใช้ตัวแรกแทน ไม่ให้หน้าพัง
// เครื่องประดับ (cosmetics จาก room_update):
//   layers="full"    แสดงครบทุกชั้น (ห้องรอ · หน้าจบเกม)
//   layers="compact" แสดงแค่หมวก แว่น คอ (แถบคะแนน — กรอบ/พื้นหลังมองไม่ชัดที่ขนาดนี้)
//   layers="none"    (ค่าเริ่มต้น) ไม่แสดง
// คนที่ไม่ได้ใส่อะไรในชั้นที่แสดง จะได้หน้าตาเดิมทุกพิกเซล
export default function Avatar({ index, large = false, cosmetics = null, layers = "none" }) {
  const safe = Number.isInteger(index) && index >= 0 && index < AVATARS.length ? index : 0;
  const px = large ? 40 : 30;
  const full = layers === "full";
  const worn = layers !== "none" && hasAny(cosmetics, full ? undefined : COMPACT_SLOTS);
  if (!worn) {
    return (
      <span className={large ? "avatar-chip avatar-chip--lg" : "avatar-chip"} aria-hidden="true">
        <AvatarArt index={safe} size={px} />
      </span>
    );
  }
  const classes = ["avatar-chip", "avatar-chip--look"];
  if (large) classes.push("avatar-chip--lg");
  if (full && cosmetics.background) classes.push("avatar-chip--bg"); // พื้นหลังของไอเทมแทนพื้นครีม
  if (full && cosmetics.frame) classes.push("avatar-chip--frame"); // กรอบของไอเทมแทนขอบดำ
  return (
    <span className={classes.join(" ")} aria-hidden="true">
      {/* แบบย่อ: ผืน 24 ช่องใหญ่กว่าวง 1.5 เท่า ตัวอวตาร (16 ช่อง) จึงกว้างเท่าเดิม หมวก/ของที่คอยื่นออกนอกวงได้
          แบบเต็ม: ผืนพอดีกับวง (42px) ไม่ยื่นทับชื่อข้างๆ — พื้นหลัง/กรอบของไอเทมแทนวงเดิม ตัวอวตารเล็กลงเล็กน้อย */}
      <span className="avatar-chip__look">
        <AvatarLook avatar={safe} cosmetics={cosmetics} compact={!full} size={full ? px * 1.4 : px * 1.5} />
      </span>
    </span>
  );
}
