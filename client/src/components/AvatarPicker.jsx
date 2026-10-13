import { AVATARS } from "../avatars";
import { Icon } from "./Icons";
import { AvatarImage } from "./Avatar";

// อวตารใหญ่ตรงกลาง มีลูกศรซ้ายขวาเปลี่ยนตัววนไปเรื่อยๆ (ค่า 0-5 ตรงกับ avatar ใน events.md)
export default function AvatarPicker({ value, photoUrl, outfit, onChange, onEdit, onUpload, onDress }) {
  const n = AVATARS.length;
  const step = (d) => onChange((value + d + n) % n);
  return (
    <div className="avatar-picker" role="group" aria-label="เลือกอวตาร">
      <button type="button" className="avatar-picker__arrow" onClick={() => step(-1)} aria-label="อวตารก่อนหน้า">
        <Icon name="arrowL" size={18} />
      </button>
      {onEdit ? (
        <div className="avatar-picker__photo-wrap">
          <button type="button" className="avatar-picker__stage avatar-picker__stage--edit" onClick={onEdit} aria-label="แก้ไขโปรไฟล์และอวตาร">
            <AvatarImage index={value} photoUrl={photoUrl} outfit={outfit} size={112} />
          </button>
          {onUpload && <button type="button" className="avatar-picker__camera" onClick={onUpload} aria-label="อัปโหลดรูปโปรไฟล์" title="อัปโหลดรูปโปรไฟล์">📷</button>}
          {onDress && <button type="button" className="avatar-picker__dress" onClick={onDress} aria-label="เปิดห้องแต่งตัว Avatar" title="แต่งตัว Avatar">✏️</button>}
        </div>
      ) : (
        <div className="avatar-picker__stage" aria-live="polite">
          <AvatarImage index={value} photoUrl={photoUrl} outfit={outfit} size={112} />
        </div>
      )}
      <button type="button" className="avatar-picker__arrow" onClick={() => step(1)} aria-label="อวตารถัดไป">
        <Icon name="arrowR" size={18} />
      </button>
    </div>
  );
}
