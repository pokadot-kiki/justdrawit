import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import { AvatarArt, AvatarArtLayered, Icon } from "./Icons";
import { AVATARS } from "../avatars";
import { NAME_MAX_LEN } from "../playerName";
import { profileInputError } from "../profileValidation";

const ERROR_TEXT = {
  INVALID_NAME: "ชื่อผู้เล่นไม่ถูกต้อง",
  INVALID_AVATAR: "อวตารที่เลือกไม่ถูกต้อง",
  NAME_TAKEN: "ชื่อนี้มีคนใช้ในห้องแล้ว",
  NOT_IN_ROOM: "คุณไม่ได้อยู่ในห้องนี้แล้ว",
  NOT_IN_GAME: "เกมเดี่ยวสิ้นสุดแล้ว กรุณาลองอีกครั้ง",
  CONNECT_FAILED: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองอีกครั้ง",
  SERVER_ERROR: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง",
};

const CATEGORY_LABEL = { frame: "กรอบ", hat: "หมวก", glasses: "แว่น", neck: "ของคอ", bg: "พื้นหลัง" };
const CATEGORY_ORDER = ["frame", "hat", "glasses", "neck", "bg"];
// ที่เหลือใช้ item.id เป็นชื่อไอคอนตรงๆ (ดู Icons.jsx) · "ไม่ใส่อะไร" ใช้ deco_none ร่วมกัน
const ITEM_ICON = { hat_crown: "crown", hat_default: "deco_none", glasses_default: "deco_none", neck_default: "deco_none" };

// แก้ไขโปรไฟล์ — หน้าเดียวรวมเลือกอวตาร เปลี่ยนชื่อ และร้านค้าของตกแต่ง (รวมมาจากแยกสองหน้าต่างเดิม)
export default function ProfileModal({ profile, onSave, onClose, loggedIn = false, economy, onBuyItem, onEquipItem }) {
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("avatar"); // "avatar" | "shop"
  const [preview, setPreview] = useState(() => economy?.equipped ?? {}); // ลองใส่ของได้ก่อนซื้อจริง (เริ่มจากของที่ใส่จริง)
  const [shopBusyId, setShopBusyId] = useState(null);
  const [shopMessage, setShopMessage] = useState("");
  const nameRef = useRef(null);
  const contentRef = useRef(null);
  const previousFocus = useRef(typeof document === "undefined" ? null : document.activeElement);
  const busyRef = useRef(null);

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
      const result = await onSave({ name: name.trim(), avatar });
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

  function tryOn(category, itemId) {
    setPreview((prev) => ({ ...prev, [category]: itemId }));
  }

  async function handleBuy(item) {
    setShopBusyId(item.id);
    setShopMessage("");
    const result = await onBuyItem(item.id);
    setShopBusyId(null);
    if (!result?.ok) setShopMessage(result?.error === "INSUFFICIENT_COINS" ? "เหรียญไม่พอ" : "ซื้อไม่สำเร็จ ลองใหม่อีกครั้ง");
  }

  async function handleEquip(category, itemId) {
    setShopBusyId(itemId);
    setShopMessage("");
    const result = await onEquipItem(category, itemId);
    setShopBusyId(null);
    if (!result?.ok) setShopMessage("ใส่ไม่สำเร็จ ลองใหม่อีกครั้ง");
  }

  const byCategory = {};
  if (economy) for (const item of economy.catalog) (byCategory[item.category] ??= []).push(item);

  return (
    <Modal labelledBy="edit-profile-title" onClose={busy ? undefined : onClose} panelClassName="modal__panel--profile">
      <div ref={contentRef} tabIndex={-1} onKeyDown={trapTab}>
        <h2 id="edit-profile-title" className="modal__title">แก้ไขโปรไฟล์</h2>
        <div className="profile-preview">
          <AvatarArtLayered index={avatar} equipped={tab === "shop" ? preview : economy?.equipped} size={88} />
          <span>{name.trim() || "ชื่อผู้เล่น"}</span>
        </div>

        <label className="field__label" htmlFor="edit-profile-name">ชื่อผู้เล่น</label>
        <input ref={nameRef} id="edit-profile-name" className="input profile-name-input" value={name} maxLength={NAME_MAX_LEN + 1} disabled={busy} autoComplete="off" onChange={(event) => { setName(event.target.value); setError(""); }} />

        {/* แท็บ: เลือกอวตาร / ร้านค้าของตกแต่ง (ร้านค้าเฉพาะคนล็อกอิน) */}
        <div className="profile-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "avatar"} className={`profile-tabs__btn${tab === "avatar" ? " profile-tabs__btn--active" : ""}`} onClick={() => setTab("avatar")}>
            เลือกอวตาร
          </button>
          {loggedIn && (
            <button type="button" role="tab" aria-selected={tab === "shop"} className={`profile-tabs__btn${tab === "shop" ? " profile-tabs__btn--active" : ""}`} onClick={() => setTab("shop")}>
              ร้านค้าของตกแต่ง
            </button>
          )}
        </div>

        {tab === "avatar" ? (
          <fieldset className="profile-avatars" disabled={busy}>
            <legend>เลือกอวตาร</legend>
            <div className="profile-avatars__grid">
              {AVATARS.map((label, index) => (
                <button key={label} type="button" className={`profile-avatars__item${avatar === index ? " profile-avatars__item--selected" : ""}`} aria-label={`อวตาร ${label}`} aria-pressed={avatar === index} onClick={() => setAvatar(index)}>
                  <AvatarArt index={index} size={48} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="profile-shop">
            {!economy ? (
              <p>กำลังโหลดข้อมูล... (ต้องต่อ server สำเร็จก่อน)</p>
            ) : (
              <>
                <p className="profile-shop__coins"><Icon name="coin" size={16} /> {economy.coins} เหรียญ</p>
                {shopMessage && <p className="profile-error" role="alert">{shopMessage}</p>}
                {CATEGORY_ORDER.filter((cat) => byCategory[cat]?.length).map((cat) => (
                  <div key={cat} className="profile-shop__section">
                    <h3 className="profile-shop__heading">{CATEGORY_LABEL[cat] ?? cat}</h3>
                    <div className="profile-shop__grid">
                      {byCategory[cat].map((item) => {
                        const owned = economy.owned.includes(item.id);
                        const equippedNow = economy.equipped[cat] === item.id;
                        const itemBusy = shopBusyId === item.id;
                        const rowEquipped = { ...economy.equipped, [cat]: item.id };
                        return (
                          <div
                            key={item.id}
                            className={`profile-shop__item${equippedNow ? " profile-shop__item--equipped" : owned ? " profile-shop__item--owned" : ""}`}
                            onClick={() => tryOn(cat, item.id)}
                          >
                            <AvatarArtLayered index={avatar} equipped={rowEquipped} size={52} label={`${item.name} ใส่บนอวตาร`} />
                            <p className="profile-shop__item-name"><Icon name={ITEM_ICON[item.id] ?? item.id} size={14} /> {item.name}</p>
                            {equippedNow ? (
                              <span className="btn profile-shop__badge">ใส่อยู่</span>
                            ) : owned ? (
                              <button type="button" className="btn btn--primary profile-shop__buy" disabled={itemBusy} onClick={(e) => { e.stopPropagation(); handleEquip(cat, item.id); }}>
                                {itemBusy ? "..." : "ใส่"}
                              </button>
                            ) : (
                              <button type="button" className="btn profile-shop__buy profile-shop__buy--price" disabled={itemBusy} onClick={(e) => { e.stopPropagation(); handleBuy(item); }}>
                                {itemBusy ? "..." : <>ซื้อ <Icon name="coin" size={12} /> {item.price}</>}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {error && <p className="profile-error" role="alert">{error}</p>}
        <div className="modal__actions modal__actions--row">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>ยกเลิก</button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={submit}>{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
        </div>
      </div>
    </Modal>
  );
}
