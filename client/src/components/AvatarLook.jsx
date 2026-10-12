import { useMemo } from "react";
import { GRID, lookRects } from "../cosmeticArt.js";

// อวตาร + เครื่องประดับซ้อนชั้น (พื้นหลัง → กรอบ → อวตาร → คอ → แว่น → หมวก) บนผืน 24×24 ช่อง
// อวตารกินที่ 16 จาก 24 ช่อง — ถ้าอยากให้ตัวอวตารกว้าง N px ให้ส่ง size = N × 1.5
// compact = แค่หมวก แว่น คอ (อวตารขนาดเล็กในแถบคะแนน) · รูปทั้งหมดวาดจาก cosmeticArt.js ไม่มีไฟล์ภาพ
export default function AvatarLook({ avatar = 0, cosmetics = null, size = 48, compact = false, label, className = "" }) {
  const key = cosmetics ? JSON.stringify(cosmetics) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rects = useMemo(() => lookRects(avatar, cosmetics, { compact }), [avatar, key, compact]);
  return (
    <svg
      className={`pix avatar-look ${className}`.trim()}
      viewBox={`0 0 ${GRID} ${GRID}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      {rects.map((q) => (
        <rect key={`${q.x}-${q.y}`} x={q.x} y={q.y} width={q.w} height={1} fill={q.fill} />
      ))}
    </svg>
  );
}
