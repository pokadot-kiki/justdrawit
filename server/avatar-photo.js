// URL รูปต้องชี้ไปยังไฟล์ของ Firebase UID ที่ยืนยันจาก session เท่านั้น
// ไม่มีการรับไฟล์หรือ data URL ผ่าน Socket.IO
function validateAvatarPhoto(value, user, bucket) {
  if (value === null) return { ok: true, url: null };
  if (!user?.sub) return { ok: false, error: "PHOTO_NOT_ALLOWED" };
  if (!bucket) return { ok: false, error: "STORAGE_NOT_CONFIGURED" };
  if (typeof value !== "string" || value.length > 1100) return { ok: false, error: "INVALID_AVATAR_PHOTO" };
  try {
    const url = new URL(value);
    const objectPath = `avatars/${user.sub}/profile`;
    const expectedPath = `/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}`;
    if (url.origin !== "https://firebasestorage.googleapis.com" || url.pathname !== expectedPath || url.hash) {
      return { ok: false, error: "INVALID_AVATAR_PHOTO" };
    }
    const params = url.searchParams;
    const token = params.get("token");
    const version = params.get("v");
    if (params.get("alt") !== "media" || !token || !/^[A-Za-z0-9_-]{16,256}$/.test(token) ||
        (version !== null && !/^\d{1,16}$/.test(version)) ||
        [...params.keys()].some((key) => !["alt", "token", "v"].includes(key)) ||
        [...params.keys()].length !== new Set(params.keys()).size) {
      return { ok: false, error: "INVALID_AVATAR_PHOTO" };
    }
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, error: "INVALID_AVATAR_PHOTO" };
  }
}

module.exports = { validateAvatarPhoto };
