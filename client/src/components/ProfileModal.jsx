import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import { AvatarArt } from "./Icons";
import { AvatarImage } from "./Avatar";
import { AVATARS } from "../avatars";
import { NAME_MAX_LEN } from "../playerName";
import { profileInputError } from "../profileValidation";
import { PHOTO_UPLOAD_ENABLED } from "../featureFlags";

const ERROR_TEXT = {
  INVALID_NAME: "ชื่อผู้เล่นไม่ถูกต้อง",
  INVALID_AVATAR: "อวตารที่เลือกไม่ถูกต้อง",
  NAME_TAKEN: "มีชื่อนี้แล้ว กรุณาใช้ชื่ออื่น",
  NOT_IN_ROOM: "คุณไม่ได้อยู่ในห้องนี้แล้ว",
  NOT_IN_GAME: "เกมเดี่ยวสิ้นสุดแล้ว กรุณาลองอีกครั้ง",
  CONNECT_FAILED: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองอีกครั้ง",
  SERVER_ERROR: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง",
  AUTH_REQUIRED: "กรุณาเข้าสู่ระบบอีกครั้งเพื่อจัดการรูปโปรไฟล์",
  STORAGE_NOT_CONFIGURED: "ยังไม่ได้เปิดใช้ Firebase Storage สำหรับรูปโปรไฟล์",
  STORAGE_UNAVAILABLE: "ระบบอัปโหลดรูปยังไม่พร้อมใช้งาน กรุณาลองอีกครั้ง",
};

export default function ProfileModal({ profile, onSave, onClose }) {
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [avatarPhoto, setAvatarPhoto] = useState(PHOTO_UPLOAD_ENABLED ? profile.avatarPhoto ?? null : null); // ปิดอัปโหลดรูป = เลือกได้แค่อวตารพิกเซล
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef(null);
  const contentRef = useRef(null);
  const previousFocus = useRef(typeof document === "undefined" ? null : document.activeElement);
  const busyRef = useRef(false);

  useEffect(() => {
    nameRef.current?.focus();
    return () => previousFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    if (busy) contentRef.current?.focus();
  }, [busy]);

  async function submit(event) {
    event.preventDefault();
    if (busyRef.current) return;
    const problem = profileInputError(name);
    if (problem) return setError(problem);
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await onSave({ name: name.trim(), avatar, avatarPhoto });
      if (result?.ok) onClose();
      else setError(ERROR_TEXT[result?.error] ?? "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
    } catch {
      setError(ERROR_TEXT.SERVER_ERROR);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function trapTab(event) {
    if (event.key !== "Tab") return;
    const controls = [...contentRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
    if (!controls.length) return event.preventDefault();
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault();
      controls.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault();
      controls[0]?.focus();
    }
  }

  return (
    <Modal labelledBy="edit-profile-title" onClose={busy ? undefined : onClose} panelClassName="modal__panel--profile">
      <div ref={contentRef} tabIndex={-1} onKeyDown={trapTab}>
        <h2 id="edit-profile-title" className="modal__title">แก้ไขโปรไฟล์</h2>
        <form onSubmit={submit}>
          <div className="profile-preview"><AvatarImage index={avatar} photoUrl={avatarPhoto} outfit={profile.outfit} size={88} /><span>{name.trim() || "ชื่อผู้เล่น"}</span></div>
          <fieldset className="profile-avatars" disabled={busy}>
            <legend>เลือกอวตาร</legend>
            <div className="profile-avatars__grid">
              {AVATARS.map((label, index) => (
                <button key={label} type="button" className={`profile-avatars__item${!avatarPhoto && avatar === index ? " profile-avatars__item--selected" : ""}`} aria-label={`อวตาร ${label}`} aria-pressed={!avatarPhoto && avatar === index} onClick={() => { setAvatar(index); setAvatarPhoto(null); }}>
                  <AvatarArt index={index} size={48} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field__label" htmlFor="edit-profile-name">ชื่อผู้เล่น</label>
          <input ref={nameRef} id="edit-profile-name" className="input profile-name-input" value={name} maxLength={NAME_MAX_LEN + 1} disabled={busy} autoComplete="off" onChange={(event) => { setName(event.target.value); setError(""); }} />
          {error && <p className="profile-error" role="alert">{error}</p>}
          <div className="modal__actions modal__actions--row">
            <button type="button" className="btn" disabled={busy} onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
