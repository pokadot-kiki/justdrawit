import { useState } from "react";
import Modal from "./Modal";

// ร้านค้าของตกแต่ง — อ่าน coin/ของที่มี/ของที่ใส่จาก economy_state ของ server (รอบ A) ล้วนๆ
// ซื้อด้วย buy_item ใส่ด้วย equip_item เท่านั้น ไม่มี localStorage ที่นี่อีกแล้ว
const CATEGORY_LABEL = { frame: "กรอบ", hat: "หมวก", glasses: "แว่น", neck: "ของคอ", bg: "พื้นหลัง" };
const CATEGORY_ORDER = ["frame", "hat", "glasses", "neck", "bg"];

export default function AvatarShopModal({ economy, onBuy, onEquip, onClose }) {
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState("");

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

  async function handleBuy(item) {
    setBusyId(item.id);
    setMessage("");
    const result = await onBuy(item.id);
    setBusyId(null);
    if (!result?.ok) {
      setMessage(result?.error === "INSUFFICIENT_COINS" ? "เหรียญไม่พอ" : "ซื้อไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
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

      <div style={{ textAlign: "center", marginBottom: "16px" }}>
        <p style={{ fontSize: "16px", fontWeight: "bold" }}>
          ยอดเหรียญของคุณ: <span style={{ color: "#eab308" }}>{economy.coins}</span> เหรียญ
        </p>
        {message && <p style={{ color: "#ef4444", fontSize: "13px" }}>{message}</p>}
      </div>

      {CATEGORY_ORDER.filter((cat) => byCategory[cat]?.length).map((cat) => (
        <div key={cat} style={{ marginBottom: "14px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: "bold", margin: "0 0 6px" }}>{CATEGORY_LABEL[cat] ?? cat}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {byCategory[cat].map((item) => {
              const owned = economy.owned.includes(item.id);
              const equipped = economy.equipped[cat] === item.id;
              const busy = busyId === item.id;
              return (
                <div
                  key={item.id}
                  style={{
                    border: equipped ? "2px solid #22c55e" : "2px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "8px",
                    textAlign: "center",
                    background: equipped ? "#f0fdf4" : owned ? "#f9fafb" : "#fff",
                  }}
                >
                  <p style={{ fontSize: "12px", fontWeight: "bold", margin: "0 0 6px" }}>{item.name}</p>
                  {equipped ? (
                    <span className="btn" style={{ fontSize: "11px", padding: "2px 8px", background: "#22c55e", color: "#fff" }}>
                      ใส่อยู่
                    </span>
                  ) : owned ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      style={{ fontSize: "11px", padding: "2px 8px" }}
                      disabled={busy}
                      onClick={() => handleEquip(cat, item.id)}
                    >
                      {busy ? "..." : "ใส่"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: "11px", padding: "2px 8px", background: "#eab308", color: "#fff" }}
                      disabled={busy}
                      onClick={() => handleBuy(item)}
                    >
                      {busy ? "..." : `ซื้อ (${item.price} เหรียญ)`}
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
