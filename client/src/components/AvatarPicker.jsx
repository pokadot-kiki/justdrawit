import { AVATARS } from "../avatars";
import { AvatarArtLayered, Icon } from "./Icons";

// อวตารใหญ่ตรงกลาง มีลูกศรซ้ายขวาเปลี่ยนตัววนไปเรื่อยๆ (ค่า 0-5 ตรงกับ avatar ใน events.md)
// equipped: ของตกแต่งที่ใส่อยู่จาก economy_state (ไม่มี/Guest = undefined เรนเดอร์เหมือนเดิม)
export default function AvatarPicker({ value, onChange, onEdit, equipped }) {
  const n = AVATARS.length;
  const step = (d) => onChange((value + d + n) % n);
  return (
    <div className="avatar-picker" role="group" aria-label="เลือกอวตาร">
      <button type="button" className="avatar-picker__arrow" onClick={() => step(-1)} aria-label="อวตารก่อนหน้า">
        <Icon name="arrowL" size={18} />
      </button>
      {onEdit ? (
        <button type="button" className="avatar-picker__stage avatar-picker__stage--edit" onClick={onEdit} aria-label="แก้ไขโปรไฟล์และอวตาร">
          <AvatarArtLayered index={value} equipped={equipped} size={112} label={`อวตาร ${AVATARS[value]}`} />
        </button>
      ) : (
        <div className="avatar-picker__stage" aria-live="polite">
          <AvatarArtLayered index={value} equipped={equipped} size={112} label={`อวตาร ${AVATARS[value]}`} />
        </div>
      )}
      <button type="button" className="avatar-picker__arrow" onClick={() => step(1)} aria-label="อวตารถัดไป">
        <Icon name="arrowR" size={18} />
      </button>
    </div>
  );
}
