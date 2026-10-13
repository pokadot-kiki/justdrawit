import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import { AvatarImage } from "./Avatar";
import { avatarStorageError, storageReady, validateAvatarFile } from "../avatarStorage";

export default function AvatarUploadModal({ profile, onSave, onRemove, onClose }) {
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    storageReady().then(() => { if (active) setReady(true); })
      .catch((reason) => { if (active) setError(avatarStorageError(reason)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function chooseFile(event) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    try {
      await validateAvatarFile(selected);
      setFile(selected);
      setError("");
    } catch (reason) {
      setFile(null);
      setPreview(null);
      setError(avatarStorageError(reason));
    }
  }

  async function run(action) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await action();
      if (result?.ok) onClose();
      else setError(avatarStorageError(result?.error));
    } catch (reason) {
      setError(avatarStorageError(reason));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal labelledBy="avatar-upload-title" onClose={busy ? undefined : onClose} panelClassName="modal__panel--profile">
      <h2 id="avatar-upload-title" className="modal__title">รูปโปรไฟล์</h2>
      <div className="avatar-upload__preview">
        {preview
          ? <img className="avatar-photo" src={preview} width="112" height="112" alt="ตัวอย่างรูปโปรไฟล์" />
          : <AvatarImage index={profile.avatar} photoUrl={profile.avatarPhoto} outfit={profile.outfit} size={112} />}
      </div>
      <p className="form-note">JPG, PNG หรือ WebP ขนาดไม่เกิน 2 MB</p>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="avatar-upload__input" onChange={chooseFile} disabled={busy} aria-label="เลือกรูปโปรไฟล์" />
      <button type="button" className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>เลือกรูปจากเครื่อง</button>
      {error && <p className="profile-error" role="alert">{error}</p>}
      <div className="modal__actions modal__actions--row">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>ยกเลิก</button>
        {profile.avatarPhoto && <button type="button" className="btn" disabled={busy || !ready} onClick={() => run(onRemove)}>ใช้อวตารตัวละคร</button>}
        <button type="button" className="btn btn--primary" disabled={busy || !ready || !file} onClick={() => run(() => onSave(file))}>{busy ? "กำลังบันทึก..." : "บันทึกรูป"}</button>
      </div>
    </Modal>
  );
}
