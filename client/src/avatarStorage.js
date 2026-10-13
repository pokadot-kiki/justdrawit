import { deleteObject, getDownloadURL, ref, uploadBytes } from "@firebase/storage";
import { firebaseStorage, storageBucket } from "./firebase";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

function avatarRef(uid) {
  if (!firebaseStorage || !storageBucket) throw new Error("STORAGE_NOT_CONFIGURED");
  if (typeof uid !== "string" || !uid) throw new Error("AUTH_REQUIRED");
  return ref(firebaseStorage, `avatars/${uid}/profile`);
}

export async function storageReady() {
  if (!firebaseStorage) throw new Error("STORAGE_NOT_CONFIGURED");
  const response = await fetch("/api/avatar/storage-status", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("STORAGE_UNAVAILABLE");
  const status = await response.json();
  if (!status.ready || status.bucket !== storageBucket) throw new Error("STORAGE_NOT_CONFIGURED");
}

export async function validateAvatarFile(file) {
  if (!file || !AVATAR_TYPES.includes(file.type)) throw new Error("INVALID_IMAGE_TYPE");
  if (file.size < 1 || file.size > AVATAR_MAX_BYTES) throw new Error("IMAGE_TOO_LARGE");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = file.type === "image/png" && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  const webp = file.type === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!jpeg && !png && !webp) throw new Error("INVALID_IMAGE_TYPE");
}

export async function loadAvatarPhoto(uid) {
  try {
    return await getDownloadURL(avatarRef(uid));
  } catch (error) {
    if (error?.code === "storage/object-not-found") return null;
    throw error;
  }
}

export async function uploadAvatarPhoto(uid, file) {
  await validateAvatarFile(file);
  const target = avatarRef(uid);
  await uploadBytes(target, file, { contentType: file.type, cacheControl: "no-cache" });
  const url = new URL(await getDownloadURL(target));
  url.searchParams.set("v", String(Date.now()));
  return url.toString();
}

export async function removeAvatarPhoto(uid) {
  try {
    await deleteObject(avatarRef(uid));
  } catch (error) {
    if (error?.code !== "storage/object-not-found") throw error;
  }
}

export function avatarStorageError(error) {
  const code = error?.code || error?.message;
  if (code === "STORAGE_NOT_CONFIGURED") return "ยังไม่ได้เปิดใช้ Firebase Storage สำหรับรูปโปรไฟล์";
  if (code === "STORAGE_UNAVAILABLE") return "ระบบอัปโหลดรูปยังไม่พร้อมใช้งาน กรุณาลองอีกครั้ง";
  if (code === "AUTH_REQUIRED" || code === "storage/unauthenticated") return "กรุณาเข้าสู่ระบบอีกครั้งเพื่อจัดการรูปโปรไฟล์";
  if (code === "INVALID_IMAGE_TYPE") return "เลือกได้เฉพาะรูป JPG, PNG หรือ WebP";
  if (code === "IMAGE_TOO_LARGE") return "รูปต้องมีขนาดไม่เกิน 2 MB";
  if (code === "storage/unauthorized") return "ไม่มีสิทธิ์แก้ไขรูปนี้ กรุณาตรวจ Storage Rules";
  return "บันทึกรูปไม่สำเร็จ กรุณาลองอีกครั้ง";
}
