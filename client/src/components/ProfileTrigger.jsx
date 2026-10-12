import Avatar from "./Avatar";

export default function ProfileTrigger({ name, avatar, onClick, className = "" }) {
  return (
    <button type="button" className={`profile-trigger ${className}`.trim()} onClick={onClick} aria-label={`แก้ไขโปรไฟล์ ${name}`} title="แก้ไขโปรไฟล์">
      <Avatar index={avatar} />
      <span className="profile-trigger__name">{name}</span>
    </button>
  );
}
