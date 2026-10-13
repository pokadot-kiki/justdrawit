import Avatar from "./Avatar";

export default function ProfileTrigger({ name, avatar, avatarPhoto, outfit, title, onClick, className = "" }) {
  return (
    <button type="button" className={`profile-trigger ${className}`.trim()} onClick={onClick} aria-label={`แก้ไขโปรไฟล์ ${name}${title ? ` ฉายา ${title}` : ""}`} title="แก้ไขโปรไฟล์">
      <Avatar index={avatar} photoUrl={avatarPhoto} outfit={outfit} />
      <span className="profile-trigger__identity"><span className="profile-trigger__name">{name}</span>{title && <small>« {title} »</small>}</span>
    </button>
  );
}
