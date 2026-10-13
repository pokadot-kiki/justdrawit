import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import Ribbon from "./Ribbon";
import { AvatarArt, AvatarArtLayered, BG_COLOR, Icon } from "./Icons";
import { AVATARS } from "../avatars";
import { NAME_MAX_LEN, randomName } from "../playerName";
import { profileInputError } from "../profileValidation";

const ERROR_TEXT = {
  INVALID_NAME: "ชื่อผู้เล่นไม่ถูกต้อง",
  INVALID_AVATAR: "อวตารที่เลือกไม่ถูกต้อง",
  INAPPROPRIATE_NAME: "ชื่อนี้ใช้ไม่ได้ ลองตั้งชื่ออื่นนะ",
  NAME_TAKEN: "ชื่อนี้มีคนใช้ในห้องแล้ว",
  NOT_IN_ROOM: "คุณไม่ได้อยู่ในห้องนี้แล้ว",
  NOT_IN_GAME: "เกมเดี่ยวสิ้นสุดแล้ว กรุณาลองอีกครั้ง",
  CONNECT_FAILED: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองอีกครั้ง",
  SERVER_ERROR: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง",
};

// แท็บในคอลัมน์ขวา: "อวตาร" ทุกคนเห็น · หมวดของตกแต่งเห็นเฉพาะคนล็อกอิน (coin ผูกกับบัญชีที่ server)
const SHOP_TABS = [
  { id: "frame", label: "กรอบ" },
  { id: "hat", label: "หมวก" },
  { id: "glasses", label: "แว่น" },
  { id: "neck", label: "ของคอ" },
  { id: "bg", label: "พื้นหลัง" },
];
// ไอคอนของแต่ละชิ้นใช้ item.id ตรงๆ (ดู Icons.jsx) ยกเว้นตัวด้านล่าง
const ITEM_ICON = { hat_crown: "crown", hat_default: "deco_none", glasses_default: "deco_none", neck_default: "deco_none" };

// หน้าแต่งโปรไฟล์ — หน้าเดียวรวม เลือกอวตาร + เปลี่ยนชื่อ + ร้านค้าของตกแต่ง
// จอคอม: สองคอลัมน์ · ซ้าย = พรีวิว + coin + ชื่อ + ปุ่มยกเลิก/บันทึก · ขวา = แท็บ อวตาร / กรอบ / หมวก / แว่น / ของคอ / พื้นหลัง
// มือถือ: เรียงบนลงล่าง พรีวิว → ชื่อ → แท็บ → ปุ่ม
// "บันทึก" ส่งแค่ { name, avatar } ผ่าน onSave เหมือนเดิม · ซื้อ/ใส่ของเป็นคำสั่งแยก (onBuyItem/onEquipItem) server ตัดสินราคา ยอดเงิน และของที่มีเอง
export default function ProfileModal({ profile, onSave, onClose, loggedIn = false, economy, onBuyItem, onEquipItem }) {
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("avatar");
  const [tryOn, setTryOn] = useState({}); // ลองใส่ก่อนซื้อ (เฉพาะในเครื่อง ไม่ส่งไป server)
  const [shopBusyId, setShopBusyId] = useState(null);
  const [shopMessage, setShopMessage] = useState("");
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

  async function shopAction(itemId, run, failText) {
    setShopBusyId(itemId);
    setShopMessage("");
    try {
      const result = await run();
      if (!result?.ok) setShopMessage(result?.error === "INSUFFICIENT_COINS" ? "เหรียญไม่พอ" : failText);
    } catch {
      setShopMessage(failText);
    } finally {
      setShopBusyId(null);
    }
  }

  const shownName = name.trim() || "ชื่อผู้เล่น";
  const showShop = loggedIn && Boolean(economy);
  const equipped = economy?.equipped ?? null;
  // พรีวิวซ้าย = ของที่ใส่จริง ทับด้วยของที่กำลังลองใส่
  const previewEquipped = showShop ? { ...equipped, ...tryOn } : null;
  const tabs = [{ id: "avatar", label: "อวตาร" }, ...(showShop ? SHOP_TABS : [])];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "avatar";
  const items = showShop ? economy.catalog.filter((item) => item.category === activeTab) : [];

  return (
    <Modal labelledBy="edit-profile-title" onClose={busy ? undefined : onClose} panelClassName="modal__panel--profile">
      <div ref={contentRef} tabIndex={-1} onKeyDown={trapTab} className="pe">
        <header className="pe__head">
          {/* ริบบิ้นเป็นของตกแต่ง ชื่อหน้าต่างจริงสำหรับโปรแกรมอ่านจออยู่ที่ h2 */}
          <h2 id="edit-profile-title" className="pe__title">แต่งโปรไฟล์</h2>
          <div className="pe__ribbon" aria-hidden="true">
            <Ribbon tone="red">แต่งโปรไฟล์</Ribbon>
          </div>
          <button type="button" className="icon-btn pe__close" disabled={busy} onClick={onClose} aria-label="ปิด" title="ปิด">
            <Icon name="x" size={20} />
          </button>
        </header>

        <form className="pe__body" onSubmit={submit}>
          {/* ซ้าย: พรีวิว (เปลี่ยนตามอวตาร/ชื่อ/ของที่ลองใส่ทันที) + ช่องชื่อ */}
          <section className="pe__side" aria-label="พรีวิวโปรไฟล์">
            <div className="pe__preview">
              <span className="pe__tag">PREVIEW</span>
              {showShop && (
                <span className="pe__coins" title="เหรียญของบัญชีนี้">
                  <Icon name="coin" size={16} /> {economy.coins}
                </span>
              )}
              {/* พื้นหลังที่เลือก ระบายทั้งวงพรีวิว (ตัวอวตารทึบจนบังพื้นหลังเล็กๆ ของมันเอง) */}
              <div className="pe__stage" style={BG_COLOR[previewEquipped?.bg] ? { background: BG_COLOR[previewEquipped.bg] } : undefined}>
                <AvatarArtLayered index={avatar} equipped={previewEquipped} size={124} label={`อวตาร ${AVATARS[avatar] ?? AVATARS[0]}`} />
              </div>
              <p className="pe__name" aria-live="polite">{shownName}</p>
            </div>

            <label className="field__label" htmlFor="edit-profile-name">ชื่อผู้เล่น</label>
            <div className="name-row pe__name-row">
              <input
                ref={nameRef}
                id="edit-profile-name"
                className="input profile-name-input"
                value={name}
                maxLength={NAME_MAX_LEN + 1}
                disabled={busy}
                autoComplete="off"
                onChange={(event) => {
                  setName(event.target.value);
                  setError("");
                }}
              />
              <button
                type="button"
                className="icon-btn name-row__dice"
                disabled={busy}
                onClick={() => {
                  setName(randomName());
                  setError("");
                }}
                aria-label="สุ่มชื่อใหม่"
                title="สุ่มชื่อใหม่"
              >
                <Icon name="dice" size={30} />
              </button>
            </div>
            <p className="pe__hint">ไม่เกิน {NAME_MAX_LEN} ตัวอักษร</p>
            {error && <p className="profile-error" role="alert">{error}</p>}
          </section>

          {/* ขวา: แท็บหมวด */}
          <section className="pe__main profile-avatars" aria-label="เลือกอวตารและของตกแต่ง">
            <div className="pe__tabs" role="tablist" aria-label="หมวด">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  className={`pe__tab${activeTab === t.id ? " pe__tab--active" : ""}`}
                  onClick={() => {
                    setTab(t.id);
                    setShopMessage("");
                  }}
                >
                  {t.id === "avatar" && <Icon name="palette" size={16} />} {t.label}
                </button>
              ))}
            </div>

            {activeTab === "avatar" ? (
              <fieldset className="pe__panel" disabled={busy}>
                <legend className="pe__sub">เลือกตัวละครที่จะเป็นตัวแทนของคุณ ({AVATARS.length} ตัว)</legend>
                {!loggedIn && <p className="pe__note">ล็อกอินเพื่อซื้อของตกแต่งด้วยเหรียญ</p>}
                <div className="profile-avatars__grid">
                  {AVATARS.map((label, index) => {
                    const selected = avatar === index;
                    return (
                      <button
                        key={label}
                        type="button"
                        className={`profile-avatars__item${selected ? " profile-avatars__item--selected" : ""}`}
                        aria-label={`อวตาร ${label}`}
                        aria-pressed={selected}
                        onClick={() => setAvatar(index)}
                      >
                        {selected && (
                          <span className="pe__badge">
                            <Icon name="check" size={11} /> เลือกอยู่
                          </span>
                        )}
                        <AvatarArt index={index} size={56} />
                        <span className="profile-avatars__label">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <div className="pe__panel">
                <p className="pe__sub">กดการ์ดเพื่อลองใส่ดูที่พรีวิวก่อน · ซื้อแล้วกด "ใส่"</p>
                {shopMessage && <p className="profile-error" role="alert">{shopMessage}</p>}
                <div className="profile-avatars__grid">
                  {items.map((item) => {
                    const owned = economy.owned.includes(item.id);
                    const wearing = equipped?.[item.category] === item.id;
                    const trying = tryOn[item.category] === item.id && !wearing;
                    const itemBusy = shopBusyId === item.id;
                    return (
                      <div
                        key={item.id}
                        data-item-id={item.id}
                        className={`profile-avatars__item pe__item${wearing ? " profile-avatars__item--selected" : ""}${trying ? " pe__item--trying" : ""}`}
                        style={BG_COLOR[item.id] ? { background: BG_COLOR[item.id] } : undefined}
                        onClick={() => setTryOn((prev) => ({ ...prev, [item.category]: item.id }))}
                      >
                        {wearing && (
                          <span className="pe__badge">
                            <Icon name="check" size={11} /> ใส่อยู่
                          </span>
                        )}
                        <AvatarArtLayered index={avatar} equipped={{ ...equipped, [item.category]: item.id }} size={52} label={`${item.name} บนอวตาร`} />
                        <span className="pe__item-name">
                          <Icon name={ITEM_ICON[item.id] ?? item.id} size={14} /> <span>{item.name}</span>
                        </span>
                        {wearing ? null : owned ? (
                          <button
                            type="button"
                            className="btn btn--primary pe__buy"
                            disabled={itemBusy || busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              shopAction(item.id, () => onEquipItem(item.category, item.id), "ใส่ไม่สำเร็จ ลองใหม่อีกครั้ง");
                            }}
                          >
                            {itemBusy ? "..." : "ใส่"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn pe__buy pe__buy--price"
                            disabled={itemBusy || busy || economy.coins < item.price}
                            title={economy.coins < item.price ? "เหรียญไม่พอ" : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              shopAction(item.id, () => onBuyItem(item.id), "ซื้อไม่สำเร็จ ลองใหม่อีกครั้ง");
                            }}
                          >
                            {itemBusy ? "..." : <>ซื้อ <Icon name="coin" size={12} /> {item.price}</>}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <div className="modal__actions modal__actions--row pe__actions">
            <button type="button" className="btn" disabled={busy} onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
