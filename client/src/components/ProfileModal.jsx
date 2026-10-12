import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import Ribbon from "./Ribbon";
import { AvatarArt, Icon } from "./Icons";
import AvatarLook from "./AvatarLook";
import { SLOTS, SLOT_LABEL, cleanLook, itemsOf } from "../cosmetics";
import { AVATARS } from "../avatars";
import { NAME_MAX_LEN, randomName } from "../playerName";
import { profileInputError } from "../profileValidation";
import coinRules from "../../../shared/coinRules.json" with { type: "json" };

// ข้อความ "ได้ coin ยังไง" (โชว์เมื่อชี้/แตะค้างที่ชิป) — ตัวเลขอ่านจากไฟล์เดียวกับที่ server ใช้
const COIN_HELP = [
  `ทายถูก +${coinRules.guessCorrect}`,
  `ทายถูกคนแรก +${coinRules.firstGuess}`,
  `มีคนทายภาพเราถูก +${coinRules.drawerPerGuesser} ต่อคน`,
  `เล่นจนจบเกม +${coinRules.finishGame}`,
  `จบเกมแรกของวัน +${coinRules.dailyBonus}`,
  `ได้สูงสุดวันละ ${coinRules.dailyCap} (ไม่นับโบนัสรายวัน)`,
].join(" · ");

const ERROR_TEXT = {
  INVALID_NAME: "ชื่อผู้เล่นไม่ถูกต้อง",
  INVALID_AVATAR: "อวตารที่เลือกไม่ถูกต้อง",
  INAPPROPRIATE_NAME: "ชื่อนี้ใช้ไม่ได้ ลองตั้งชื่ออื่นนะ",
  INVALID_ITEM: "ไอเทมนี้ใช้ไม่ได้ ลองเลือกใหม่อีกครั้ง",
  NOT_OWNED: "คุณยังไม่มีไอเทมนี้",
  TOO_MANY_ATTEMPTS: "เปลี่ยนชุดถี่เกินไป รอสักครู่แล้วลองใหม่",
  NAME_TAKEN: "ชื่อนี้มีคนใช้ในห้องแล้ว",
  NOT_IN_ROOM: "คุณไม่ได้อยู่ในห้องนี้แล้ว",
  NOT_IN_GAME: "เกมเดี่ยวสิ้นสุดแล้ว กรุณาลองอีกครั้ง",
  CONNECT_FAILED: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองอีกครั้ง",
  SERVER_ERROR: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง",
};

// หน้าแต่งโปรไฟล์ (เฟส A — หน้าตาอย่างเดียว ไม่แตะ server)
// จอคอม: สองคอลัมน์ · ซ้าย = พรีวิวอวตารใหญ่ + ชื่อ + ปุ่มยกเลิก/บันทึก · ขวา = เลือกอวตาร 6 ตัว
// มือถือ: เรียงบนลงล่าง พรีวิว → ชื่อ → อวตาร → ปุ่ม
// ข้อมูลที่บันทึกยังเป็น { name, avatar } ชุดเดิมผ่าน onSave (App ส่งต่อเป็น update_profile ตอนอยู่ในห้อง/Solo)
// server เป็นคนตรวจชื่อจริง (รูปแบบ · ชื่อซ้ำ · คำไม่เหมาะสม) ฝั่งนี้แค่ช่วยเตือนก่อนส่ง
// แท็บเครื่องประดับ (กรอบ หมวก แว่น คอ พื้นหลัง): ของเริ่มต้นฟรีช่องละ 3 ชิ้น ใช้ได้ทุกคนรวม guest
// ชุดที่เลือกส่งกลับไปกับ onSave เป็น cosmetics — server ตรวจสิทธิ์ทุกช่อง (events.md หัวข้อ 12) ฝั่งนี้แค่พรีวิว
const TABS = [["avatar", "อวตาร"], ...SLOTS.map((slot) => [slot, SLOT_LABEL[slot]])];
// wallet = ยอดจาก server ของคนที่ล็อกอิน ({ coins, earnedToday, dailyCap }) · null = guest หรือยังโหลดไม่เสร็จ
// canLogin = เกมเปิดระบบล็อกอินและเรายังไม่ได้ล็อกอิน → ชวนล็อกอินเพื่อเก็บ coin (guest ไม่ได้ coin)
// cosmetics = ชุดที่ใส่อยู่ตอนเปิดหน้าต่าง ({ frame, hat, glasses, neck, background })
export default function ProfileModal({ profile, onSave, onClose, wallet = null, canLogin = false, cosmetics = null }) {
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [look, setLook] = useState(() => cleanLook(cosmetics));
  const [tab, setTab] = useState("avatar");
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
      const result = await onSave({ name: name.trim(), avatar, cosmetics: look });
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

  const shownName = name.trim() || "ชื่อผู้เล่น";

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
          {/* ซ้ายบน: พรีวิว (เปลี่ยนตามอวตาร/ชื่อที่เลือกทันที) + ช่องชื่อ */}
          <section className="pe__side" aria-label="พรีวิวโปรไฟล์">
            <div className="pe__preview">
              <span className="pe__tag">PREVIEW</span>
              {wallet ? (
                <span className="pe__coins" title={`${COIN_HELP} · วันนี้ได้แล้ว ${wallet.earnedToday}/${wallet.dailyCap}`} aria-label={`มี ${wallet.coins} coin`}>
                  <Icon name="coin" size={16} /> <b>{wallet.coins.toLocaleString("en-US")}</b> <small>COIN</small>
                </span>
              ) : canLogin ? (
                <span className="pe__coins pe__coins--guest" title={COIN_HELP}>
                  <Icon name="coin" size={14} /> เข้าสู่ระบบเพื่อเก็บ coin
                </span>
              ) : null}
              <div className="pe__stage">
                <AvatarLook avatar={avatar} cosmetics={look} size={176} label={`อวตาร ${AVATARS[avatar] ?? AVATARS[0]}`} />
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

          {/* ขวา: แท็บ อวตาร + เครื่องประดับ 5 ช่อง — กดแล้วพรีวิวทางซ้ายเปลี่ยนทันที (ยังไม่บันทึกจนกว่าจะกด "บันทึก") */}
          <div className="pe__main">
            <div className="pe__tabs" role="tablist" aria-label="หมวดที่จะแต่ง">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`pe__tabbtn${tab === id ? " pe__tabbtn--active" : ""}`}
                  disabled={busy}
                  onClick={() => setTab(id)}
                >
                  {label}
                  {id !== "avatar" && look[id] && <span className="pe__tabdot" aria-label="ใส่อยู่" />}
                </button>
              ))}
            </div>
            <fieldset className="profile-avatars" disabled={busy}>
              <legend className="pe__title">{tab === "avatar" ? "เลือกอวตาร" : `เลือก${SLOT_LABEL[tab]}`}</legend>
              {tab === "avatar" ? (
                <>
                  <p className="pe__sub">เลือกตัวละครที่จะเป็นตัวแทนของคุณ ({AVATARS.length} ตัว)</p>
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
                </>
              ) : (
                <>
                  <p className="pe__sub">{SLOT_LABEL[tab]}เริ่มต้น ใช้ได้ฟรีทุกคน ({itemsOf(tab).length} ชิ้น)</p>
                  <div className="profile-avatars__grid">
                    {[{ id: null, name: "ไม่ใส่" }, ...itemsOf(tab)].map((item) => {
                      const selected = (look[tab] ?? null) === item.id;
                      return (
                        <button
                          key={item.id ?? "none"}
                          type="button"
                          className={`profile-avatars__item${selected ? " profile-avatars__item--selected" : ""}`}
                          aria-label={item.id ? `${SLOT_LABEL[tab]} ${item.name}` : `ไม่ใส่${SLOT_LABEL[tab]}`}
                          aria-pressed={selected}
                          data-item={item.id ?? "none"}
                          onClick={() => setLook((current) => ({ ...current, [tab]: item.id }))}
                        >
                          {selected && (
                            <span className="pe__badge">
                              <Icon name="check" size={11} /> {item.id ? "ใส่อยู่" : "เลือกอยู่"}
                            </span>
                          )}
                          {/* ตัวอย่างไอเทมชิ้นนี้บนอวตารที่เลือกอยู่ (ชิ้นเดียว ไม่รวมช่องอื่น จะได้เห็นชัด) */}
                          <AvatarLook avatar={avatar} cosmetics={item.id ? { [tab]: item.id } : null} size={76} className="avatar-art" />
                          <span className="profile-avatars__label">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </fieldset>
          </div>

          <div className="modal__actions modal__actions--row pe__actions">
            <button type="button" className="btn" disabled={busy} onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
