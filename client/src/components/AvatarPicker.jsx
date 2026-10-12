import { AVATARS } from "../avatars";
import { AvatarArt, Icon } from "./Icons";
import AvatarLook from "./AvatarLook";
import { hasAny } from "../cosmetics";

// อวตารใหญ่ตรงกลาง มีลูกศรซ้ายขวาเปลี่ยนตัววนไปเรื่อยๆ (ค่า 0-5 ตรงกับ avatar ใน events.md)
// look = เครื่องประดับที่ใส่อยู่ (ถ้ามี จะวาดทับอวตารใหญ่)
export default function AvatarPicker({ value, onChange, onEdit, look = null }) {
  const n = AVATARS.length;
  const step = (d) => onChange((value + d + n) % n);
  return (
    <div className="avatar-picker" role="group" aria-label="เลือกอวตาร">
      <button type="button" className="avatar-picker__arrow" onClick={() => step(-1)} aria-label="อวตารก่อนหน้า">
        <Icon name="arrowL" size={18} />
      </button>
      {onEdit ? (
        <button type="button" className="avatar-picker__stage avatar-picker__stage--edit" onClick={onEdit} aria-label="แก้ไขโปรไฟล์และอวตาร">
          {hasAny(look) ? <AvatarLook avatar={value} cosmetics={look} size={148} label={`อวตาร ${AVATARS[value]}`} /> : <AvatarArt index={value} size={112} label={`อวตาร ${AVATARS[value]}`} />}
        </button>
      ) : (
        <div className="avatar-picker__stage" aria-live="polite">
          {hasAny(look) ? <AvatarLook avatar={value} cosmetics={look} size={148} label={`อวตาร ${AVATARS[value]}`} /> : <AvatarArt index={value} size={112} label={`อวตาร ${AVATARS[value]}`} />}
        </div>
      )}
      <button type="button" className="avatar-picker__arrow" onClick={() => step(1)} aria-label="อวตารถัดไป">
        <Icon name="arrowR" size={18} />
      </button>
    </div>
  );
}
