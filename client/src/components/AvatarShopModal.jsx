import { useState } from "react";
import Modal from "./Modal";
import { AvatarArtLayered, Icon } from "./Icons";

// ร้านค้าของตกแต่ง — อ่าน coin/ของที่มี/ของที่ใส่จาก economy_state ของ server (รอบ A) ล้วนๆ
// ซื้อด้วย buy_item ใส่ด้วย equip_item เท่านั้น ไม่มี localStorage ที่นี่อีกแล้ว
// ไอคอนของตกแต่งแต่ละชิ้นอยู่ใน Icons.jsx (ชื่อ icon ตรงกับ itemId ใน shop-items.json ยกเว้น hat_crown ยืมไอคอน "crown" เดิม)
const CATEGORY_LABEL = { frame: "กรอบ", hat: "หมวก", glasses: "แว่น", neck: "ของคอ", bg: "พื้นหลัง" };
const CATEGORY_ORDER = ["frame", "hat", "glasses", "neck", "bg"];
// ที่เหลือใช้ item.id เป็นชื่อไอคอนตรงๆ (frame_sakura, frame_rainbow, frame_stars, frame_default,
// hat_wizard, glasses_pixel, neck_bowtie, bg_default — ดู Icons.jsx) · ส่วนของ "ไม่ใส่อะไร" ใช้ deco_none ร่วมกัน
const ITEM_ICON = { hat_crown: "crown", hat_default: "deco_none", glasses_default: "deco_none", neck_default: "deco_none" };

export default function AvatarShopModal({ avatarIndex = 0, economy, onBuy, onEquip, onClose }) {
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState("");
  // พรีวิว "ลองใส่" อิสระจากของที่ใส่จริง — เริ่มจากของจริง กดชิ้นไหนพรีวิวเปลี่ยนตามทันที (ลองได้ก่อนซื้อจริง)
  const [preview, setPreview] = useState(() => economy?.equipped ?? {});

  if (!economy) {
    return (
      <Modal labelledBy="shop-title" onClose={onClose}>
        <h2 className="modal__title" id="shop-title">ร้านค้าของตกแต่ง</h2>
        <p>กำลังโหลดข้อมูล... (ต้องต่อ server สำเร็จก่อน)</p>
        <div className="modal__actions">
          <button className="btn" type="button" onClick={onClose}>ปิด</button>
        </div>
      </Modal>
    );
  }

  const byCategory = {};
  for (const item of economy.catalog) (byCategory[item.category] ??= []).push(item);

  function tryOn(category, itemId) {
    setPreview((prev) => ({ ...prev, [category]: itemId }));
  }

  async function handleBuy(item) {
    setBusyId(item.id);
    setMessage("");
    const result = await onBuy(item.id);
    setBusyId(null);
    if (!result?.ok) setMessage(result?.error === "INSUFFICIENT_COINS" ? "เหรียญไม่พอ" : "ซื้อไม่สำเร็จ ลองใหม่อีกครั้ง");
  }

  async function handleEquip(category, itemId) {
    setBusyId(itemId);
    setMessage("");
    const result = await onEquip(category, itemId);
    setBusyId(null);
    if (!result?.ok) setMessage("ใส่ไม่สำเร็จ ลองใหม่อีกครั้ง");
  }

  return (
    <Modal labelledBy="shop-title" onClose={onClose}>
      <h2 className="modal__title" id="shop-title">ร้านค้าของตกแต่ง</h2>

      {/* พรีวิวใหญ่ด้านบน — ของจริงที่ใส่อยู่ + สิ่งที่กำลังลอง (ยังไม่ซื้อ/ใส่จริงจนกว่าจะกดปุ่ม) */}
      <div style={{ textAlign: "center", marginBottom: "12px" }}>
        <AvatarArtLayered index={avatarIndex} equipped={preview} size={100} label="พรีวิวอวตาร" />
        <p style={{ fontSize: "16px", fontWeight: "bold", margin: "6px 0 0" }}>
          <Icon name="coin" size={16} /> {economy.coins}
        </p>
        {message && <p style={{ color: "#ef4444", fontSize: "13px", margin: "4px 0 0" }}>{message}</p>}
      </div>

      {CATEGORY_ORDER.filter((cat) => byCategory[cat]?.length).map((cat) => (
        <div key={cat} style={{ marginBottom: "14px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: "bold", margin: "0 0 6px" }}>{CATEGORY_LABEL[cat] ?? cat}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {byCategory[cat].map((item) => {
              const owned = economy.owned.includes(item.id);
              const equippedNow = economy.equipped[cat] === item.id;
              const busy = busyId === item.id;
              // อวตารเล็กของแถวนี้: ของจริงที่ใส่อยู่ทุกหมวด แต่สับเฉพาะหมวดนี้เป็นไอเทมนี้ ให้เห็นว่าใส่จริงแล้วหน้าตาเป็นยังไง
              const rowEquipped = { ...economy.equipped, [cat]: item.id };
              return (
                <div
                  key={item.id}
                  data-item-id={item.id}
                  onClick={() => tryOn(cat, item.id)}
                  style={{
                    cursor: "pointer",
                    border: equippedNow ? "2px solid #22c55e" : "2px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "6px",
                    textAlign: "center",
                    background: equippedNow ? "#f0fdf4" : owned ? "#f9fafb" : "#fff",
                  }}
                >
                  <AvatarArtLayered index={avatarIndex} equipped={rowEquipped} size={56} label={`${item.name} ใส่บนอวตาร`} />
                  <p style={{ fontSize: "11px", fontWeight: "bold", margin: "4px 0 6px", display: "flex", alignItems: "center", justifyContent: "center", gap: "3px" }}>
                    <Icon name={ITEM_ICON[item.id] ?? item.id} size={14} /> {item.name}
                  </p>
                  {equippedNow ? (
                    <span className="btn" style={{ fontSize: "11px", padding: "2px 8px", background: "#22c55e", color: "#fff", whiteSpace: "nowrap" }}>
                      ใส่อยู่
                    </span>
                  ) : owned ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      style={{ fontSize: "11px", padding: "2px 8px", whiteSpace: "nowrap" }}
                      disabled={busy}
                      onClick={(e) => { e.stopPropagation(); handleEquip(cat, item.id); }}
                    >
                      {busy ? "..." : "ใส่"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: "11px", padding: "2px 8px", background: "#eab308", color: "#fff", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "3px" }}
                      disabled={busy}
                      onClick={(e) => { e.stopPropagation(); handleBuy(item); }}
                    >
                      {busy ? "..." : <>ซื้อ <Icon name="coin" size={12} /> {item.price}</>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="modal__actions">
        <button className="btn" type="button" onClick={onClose}>ปิด</button>
      </div>
    </Modal>
  );
}
