import Avatar from "./Avatar";

// cosmetics (ถ้ามี) แสดงแบบย่อ: หมวก แว่น คอ
export default function ProfileTrigger({ name, avatar, onClick, className = "", cosmetics = null }) {
  return (
    <button type="button" className={`profile-trigger ${className}`.trim()} onClick={onClick} aria-label={`แก้ไขโปรไฟล์ ${name}`} title="แก้ไขโปรไฟล์">
      <Avatar index={avatar} cosmetics={cosmetics} layers="compact" />
      <span className="profile-trigger__name">{name}</span>
    </button>
  );
}
