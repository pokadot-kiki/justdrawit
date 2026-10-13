import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { AVATARS } from "../avatars";
import { AvatarImage } from "../components/Avatar";
import { CosmeticArt } from "../components/AvatarAccessories";
import { economyError, SLOT_NAMES } from "../economyUi";
import { PHOTO_UPLOAD_ENABLED } from "../featureFlags";

const EMPTY_OUTFIT = { hat: null, frame: null, base: null };
const TABS = [["hat", "หมวก (Hats)"], ["frame", "กรอบ (Frames)"], ["base", "ฐานรอง (Bases)"], ["skin", "สีขน/สกิน"]];

export default function AvatarDressingRoom({ economy, profile, onSave, onBack, onShop, onAvatar }) {
  const [page, setPage] = useState("dress");
  const [slot, setSlot] = useState("hat");
  const [draft, setDraft] = useState(() => economy?.equipped ?? EMPTY_OUTFIT);
  const [draftAvatar, setDraftAvatar] = useState(profile.avatar);
  const [draftPhoto, setDraftPhoto] = useState(PHOTO_UPLOAD_ENABLED ? profile.avatarPhoto : null); // ปิดอัปโหลดรูป = ใช้อวตารพิกเซล
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [titles, setTitles] = useState(null);
  const busyRef = useRef(false);
  const initialized = useRef(Boolean(economy));

  useEffect(() => {
    if (economy && !initialized.current) {
      setDraft(economy.equipped);
      initialized.current = true;
    }
  }, [economy]);
  useEffect(() => {
    const update = (next) => setTitles(next);
    socket.on("achievement_state", update);
    const read = () => socket.timeout(6000).emit("get_achievements", (error, result) => {
      if (!error && result?.ok) setTitles(result.state);
    });
    if (socket.connected) read();
    socket.on("connect", read);
    return () => { socket.off("achievement_state", update); socket.off("connect", read); };
  }, []);

  const catalog = economy?.catalog ?? [];
  const owned = economy?.owned ?? [];
  const items = catalog.filter((item) => item.slot === slot);
  const ownedCount = catalog.filter((item) => owned.includes(item.id)).length;
  const visibleTitle = titles?.equipped ?? null;

  function selectItem(item) {
    setSelected(item);
    if (owned.includes(item.id)) {
      setDraft((previous) => ({ ...previous, [item.slot]: item.id }));
      setMessage("");
    }
  }

  function randomize() {
    if (!economy) return;
    const next = { ...EMPTY_OUTFIT };
    for (const key of Object.keys(EMPTY_OUTFIT)) {
      const choices = catalog.filter((item) => item.slot === key && owned.includes(item.id));
      if (choices.length) next[key] = choices[Math.floor(Math.random() * choices.length)].id;
    }
    setDraft(next);
    setSelected(null);
    setMessage("สุ่มชุดจากไอเทมที่มีแล้ว — กดบันทึกเพื่อใช้งานจริง");
  }

  async function save() {
    if (!economy || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (draftAvatar !== profile.avatar || draftPhoto !== profile.avatarPhoto) {
        const avatarResult = await onAvatar(draftAvatar);
        if (!avatarResult?.ok) { setMessage("บันทึก Avatar ตัวละครไม่สำเร็จ กรุณาลองอีกครั้ง"); return; }
      }
      const result = await onSave(draft);
      if (!result?.ok) { setMessage(economyError(result?.error)); return; }
      setMessage("บันทึกการแต่งตัวแล้ว");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function equipTitle(title) {
    if (busyRef.current || (title && !titles?.unlocked?.includes(title))) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    socket.timeout(6000).emit("set_title", { title }, (error, result) => {
      busyRef.current = false;
      setBusy(false);
      if (error || !result?.ok) setMessage("เลือกฉายาไม่สำเร็จ กรุณาอยู่ในห้องหรือ Solo session ที่ปลดล็อกฉายานี้");
      else setTitles(result.state);
    });
  }

  return <main className="dress-page">
    <header className="dress-nav">
      <div className="dress-nav__left"><button type="button" onClick={onBack}>← กลับหน้าหลัก</button><button type="button" onClick={onShop}>ร้านค้า</button><span className="dress-coins">◎ {economy?.coins ?? 0} Coins</span></div>
      <h1>◯ ห้องแต่งตัวอวาตาร์ · DRESSING ROOM</h1>
      <button type="button" className="dress-nav__close" onClick={onBack} aria-label="กลับหน้าหลัก">×</button>
    </header>
    <div className="dress-shell">
      <div className="dress-main-tabs" role="tablist" aria-label="หน้าแต่งตัวและฉายา"><button type="button" role="tab" aria-selected={page === "dress"} className={page === "dress" ? "is-active" : ""} onClick={() => { setPage("dress"); setMessage(""); }}>◉ แต่งตัวอวาตาร์</button><button type="button" role="tab" aria-selected={page === "titles"} className={page === "titles" ? "is-active" : ""} onClick={() => { setPage("titles"); setMessage(""); }}>♜ ฉายาของฉัน</button></div>
      <div className="dress-columns">
        <section className="dress-preview-panel">
          <div className="dress-preview-panel__head"><span>● PREVIEW STAGE</span><span>ไอเทม {ownedCount} / {catalog.length}</span></div>
          <div className="dress-stage"><div className="dress-stage__circle"><AvatarImage index={draftAvatar} photoUrl={draftPhoto} outfit={draft} size={220} /></div></div>
          <h2>{profile.name}</h2>
          <div className="dress-title-chip">{visibleTitle ? `ฉายา: ${visibleTitle}` : "ยังไม่ได้ติดตั้งฉายา"}</div>
          <div className="dress-equipped">{Object.entries(SLOT_NAMES).map(([key, label]) => <div key={key}><small>{label}</small><strong>{catalog.find((item) => item.id === draft[key])?.name ?? "ไม่ได้ใส่"}</strong></div>)}</div>
          {message && <p className="dress-message" role="status">{message}</p>}
          <div className="dress-actions"><button type="button" className="dress-save" disabled={!economy || busy} onClick={save}>{busy ? "กำลังบันทึก..." : "✓ บันทึกการแต่งตัว"}</button><button type="button" onClick={() => { setDraft({ ...EMPTY_OUTFIT }); setMessage("ถอดทั้งหมดใน Preview — กดบันทึกเพื่อใช้งานจริง"); }}>ถอดทั้งหมด</button><button type="button" disabled={!economy} onClick={randomize}>สุ่มชุด</button></div>
        </section>
        {page === "dress" ? <section className="dress-inventory">
          <div className="dress-category-tabs" role="tablist" aria-label="หมวดไอเทม">{TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={slot === key} className={slot === key ? "is-active" : ""} onClick={() => { setSlot(key); setSelected(null); }}>{label}</button>)}</div>
          <div className="dress-inventory__summary"><span>{slot === "skin" ? "เลือกอวาตาร์ตัวละครเดิม" : `คอลเลกชัน${SLOT_NAMES[slot]} · ${items.filter((item) => owned.includes(item.id)).length} / ${items.filter((item) => !item.retired).length} ชิ้น`}</span><button type="button" onClick={onShop}>ร้านค้า →</button></div>
          {slot === "skin" ? <div className="dress-item-grid">{AVATARS.map((name, index) => <button key={name} type="button" className={`dress-item-card${draftAvatar === index && !draftPhoto ? " is-equipped" : ""}`} onClick={() => { setDraftAvatar(index); setDraftPhoto(null); }}><span className="dress-item-card__badge">{draftAvatar === index && !draftPhoto ? "กำลังเลือก" : "มีแล้ว"}</span><span className="dress-item-card__art"><AvatarImage index={index} size={76} /></span><strong>{name}</strong><span className="dress-item-card__button">{draftAvatar === index && !draftPhoto ? "✓ กำลังเลือก" : "ทดลองใช้"}</span></button>)}</div>
            : <div className="dress-item-grid"><button type="button" className={`dress-item-card${draft[slot] === null ? " is-equipped" : ""}`} onClick={() => { setDraft((previous) => ({ ...previous, [slot]: null })); setSelected(null); }}><span className="dress-item-card__badge">{draft[slot] === null ? "กำลังเลือก" : "มีแล้ว"}</span><span className="dress-item-card__art dress-item-card__none">⊘</span><strong>ไม่สวมใส่</strong><span className="dress-item-card__button">{draft[slot] === null ? "✓ กำลังเลือก" : "เลือก"}</span></button>{items.map((item) => { const has = owned.includes(item.id); const active = draft[slot] === item.id; return <button key={item.id} type="button" className={`dress-item-card${active ? " is-equipped" : ""}${has ? "" : " is-locked"}`} onClick={() => selectItem(item)}><span className="dress-item-card__badge">{active ? "สวมใส่" : has ? "มีแล้ว" : "ยังไม่มี"}</span><span className="dress-item-card__art"><CosmeticArt id={item.id} slot={item.slot} /></span><strong>{item.name}</strong><span className="dress-item-card__button">{active ? "✓ กำลังใส่" : has ? "สวมใส่" : `${item.price} Coins · ร้านค้า`}</span></button>; })}</div>}
          {selected && <div className="dress-selected"><span className="dress-selected__art"><CosmeticArt id={selected.id} slot={selected.slot} /></span><div><strong>{selected.name}</strong><small>{SLOT_NAMES[selected.slot]} · {owned.includes(selected.id) ? "มีแล้ว" : `${selected.price} Coins`}</small></div><button type="button" onClick={owned.includes(selected.id) ? () => setDraft((previous) => ({ ...previous, [selected.slot]: selected.id })) : onShop}>{owned.includes(selected.id) ? "✓ สวมใส่" : "ไปร้านค้า"}</button></div>}
        </section> : <section className="dress-inventory dress-titles"><h2>ฉายาของฉัน</h2><p>ฉายามาจาก Achievement ที่ปลดล็อกในห้องหรือ Solo session ปัจจุบัน</p>{titles?.scope === "none" && <p>ยังไม่มี Session ที่เปิดใช้งาน เข้าเกมเพื่อปลดล็อกและเลือกฉายา</p>}{titles?.unlocked?.length ? <div className="dress-title-list">{titles.unlocked.map((title) => <button type="button" key={title} disabled={busy} className={titles.equipped === title ? "is-equipped" : ""} onClick={() => equipTitle(title)}><span>♜ {title}</span><strong>{titles.equipped === title ? "✓ กำลังใช้" : "ใช้ฉายา"}</strong></button>)}</div> : <p>ยังไม่มีฉายาที่ปลดล็อกใน Session นี้</p>}<button type="button" disabled={busy || !titles?.equipped} onClick={() => equipTitle(null)}>ถอดฉายา</button></section>}
      </div>
    </div>
  </main>;
}
