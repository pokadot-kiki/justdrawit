import { useEffect, useState } from "react";
import { AVATARS } from "../avatars";
import { AvatarArt } from "./Icons";
import AvatarAccessories from "./AvatarAccessories";
import { PHOTO_UPLOAD_ENABLED } from "../featureFlags";

export function AvatarImage({ index, photoUrl: rawPhotoUrl = null, outfit = null, size = 30 }) {
  // ปิดอัปโหลดรูปอยู่ = ไม่แสดงรูปที่เคยตั้งไว้ ใช้อวตารพิกเซลแทน (ทุกที่ที่โชว์อวตารผ่านตัวนี้)
  const photoUrl = PHOTO_UPLOAD_ENABLED ? rawPhotoUrl : null;
  const [failedUrl, setFailedUrl] = useState(null);
  useEffect(() => setFailedUrl(null), [photoUrl]);
  const safe = Number.isInteger(index) && index >= 0 && index < AVATARS.length ? index : 0;
  const art = photoUrl && failedUrl !== photoUrl
    ? <img className="avatar-photo" src={photoUrl} width={size} height={size} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(photoUrl)} />
    : <AvatarArt index={safe} size={size} />;
  if (!outfit || !Object.values(outfit).some(Boolean)) return art;
  return <span className="avatar-figure" style={{ width: size, height: size }}>{art}<AvatarAccessories outfit={outfit} /></span>;
}

// อวตารแบบแสดงเฉยๆ (ในห้องรอ และต่อจากนี้คือแถบคะแนน)
// ค่าที่ server ส่งมาควรเป็น 0-5 อยู่แล้ว แต่ถ้าแปลกมาให้ใช้ตัวแรกแทน ไม่ให้จอพัง
export default function Avatar({ index, photoUrl = null, outfit = null, large = false }) {
  return (
    <span className={large ? "avatar-chip avatar-chip--lg" : "avatar-chip"} aria-hidden="true">
      <AvatarImage index={index} photoUrl={photoUrl} outfit={outfit} size={large ? 40 : 30} />
    </span>
  );
}
