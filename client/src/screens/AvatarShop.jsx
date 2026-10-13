import { useRef, useState } from "react";
import Modal from "../components/Modal";
import Ribbon from "../components/Ribbon";
import { CosmeticArt } from "../components/AvatarAccessories";
import { economyError, slotName } from "../economyUi";

export default function AvatarShop({ economy, profile, onBuy, onBack, onDress }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);
  const items = economy?.catalog ?? [];

  async function confirm() {
    if (!selected || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await onBuy(selected.id);
      if (result?.ok) {
        setMessage(`ซื้อ ${selected.name} สำเร็จ`);
        setSelected(null);
      } else {
        setMessage(economyError(result?.error));
        setSelected(null);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return <main className="screen economy-screen">
    <div className="economy-nav">
      <button type="button" className="btn" onClick={onBack}>← กลับ Home</button>
      <span className="economy-balance">🪙 {economy?.coins ?? 0} Coins</span>
    </div>
    <section className="panel economy-panel">
      <Ribbon tone="red">SHOP</Ribbon>
      <h1>🛍️ ร้านค้า</h1>
      <p>เลือกดูของแต่ง Avatar แล้วซื้อด้วย Coins จากการเล่นเกม</p>
      {message && <p className="economy-message" role="status">{message}</p>}
      {!economy && <p>กำลังโหลดร้านค้า...</p>}
      <div className="economy-grid">
        {items.map((item) => {
          const owned = economy.owned.includes(item.id);
          const equipped = economy.equipped[item.slot] === item.id;
          return <article className="economy-item" key={item.id}>
            <div className="economy-item__art"><CosmeticArt id={item.id} slot={item.slot} className="economy-product-art" /></div>
            <small>{slotName(item.slot)}</small>
            <h2>{item.name}</h2>
            <strong>🪙 {item.price} Coins</strong>
            {equipped ? <span className="economy-item__status">ติดตั้งแล้ว</span>
              : owned ? <span className="economy-item__status">ซื้อแล้ว</span>
                : <button type="button" className="btn btn--primary" onClick={() => {
                  if (economy.coins < item.price) setMessage("Coins ไม่เพียงพอ");
                  else { setMessage(""); setSelected(item); }
                }}>ซื้อ</button>}
          </article>;
        })}
      </div>
      <div className="economy-actions"><button type="button" className="btn" onClick={onDress}>✏️ ไปหน้าแต่งตัว</button></div>
    </section>
    {selected && <Modal labelledBy="shop-confirm-title" onClose={busy ? undefined : () => setSelected(null)}>
      <h2 id="shop-confirm-title" className="modal__title">ยืนยันการซื้อ</h2>
      <p>ซื้อ {selected.name} ราคา 🪙 {selected.price} Coins?</p>
      <div className="modal__actions modal__actions--row">
        <button type="button" className="btn" disabled={busy} onClick={() => setSelected(null)}>ยกเลิก</button>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={confirm}>{busy ? "กำลังซื้อ..." : "ยืนยันซื้อ"}</button>
      </div>
    </Modal>}
  </main>;
}
