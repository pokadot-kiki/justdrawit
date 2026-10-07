import { useState } from "react";
import Modal from "./Modal";
import { AVATARS } from "../avatars";
import { AvatarArt } from "./Icons";
import { addCoins, getCoins, getUnlockedAvatars, getUserAuth, unlockAvatar } from "../prefs";

const AVATAR_COST = 100;

export default function AvatarShopModal({ onClose, onSelectAvatar }) {
  const [coins, setCoinsState] = useState(() => getCoins());
  const [unlocked, setUnlockedState] = useState(() => getUnlockedAvatars());
  const auth = getUserAuth();

  function handleBuy(idx) {
    if (!auth) {
      alert("กรุณาล็อกอินเข้าสู่ระบบเพื่อซื้ออวตาร");
      return;
    }
    if (coins < AVATAR_COST) {
      alert("เหรียญไม่พอ! ต้องใช้ " + AVATAR_COST + " เหรียญ");
      return;
    }
    addCoins(-AVATAR_COST);
    unlockAvatar(idx);
    setCoinsState(getCoins());
    setUnlockedState(getUnlockedAvatars());
    if (onSelectAvatar) onSelectAvatar(idx);
  }

  return (
    <Modal labelledBy="shop-title" onClose={onClose}>
      <h2 className="modal__title" id="shop-title">
        🛍️ ร้านค้าอวตาร (Avatar Shop)
      </h2>

      <div style={{ textAlign: "center", marginBottom: "16px" }}>
        <p style={{ fontSize: "16px", fontWeight: "bold" }}>
          💰 ยอดเหรียญของคุณ: <span style={{ color: "#eab308" }}>{coins}</span> เหรียญ
        </p>
        {!auth && (
          <p style={{ color: "#ef4444", fontSize: "13px" }}>
            * คุณอยู่ในโหมด Guest กรุณาล็อกอินเพื่อสะสมเหรียญและซื้ออวตาร
          </p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
        {AVATARS.map((name, idx) => {
          const isUnlocked = unlocked.includes(idx);
          return (
            <div
              key={idx}
              style={{
                border: "2px solid #e5e7eb",
                borderRadius: "12px",
                padding: "8px",
                textAlign: "center",
                background: isUnlocked ? "#f0fdf4" : "#f9fafb",
              }}
            >
              <AvatarArt index={idx} size={64} label={name} />
              <p style={{ fontSize: "13px", fontWeight: "bold", margin: "4px 0" }}>{name}</p>
              {isUnlocked ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ fontSize: "11px", padding: "2px 8px" }}
                  onClick={() => {
                    if (onSelectAvatar) onSelectAvatar(idx);
                    onClose();
                  }}
                >
                  เลือกใช้งาน
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: "11px", padding: "2px 8px", background: "#eab308", color: "#ffffff" }}
                  onClick={() => handleBuy(idx)}
                >
                  ซื้อ ({AVATAR_COST} 💰)
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="modal__actions">
        <button className="btn" type="button" onClick={onClose}>
          ปิด
        </button>
      </div>
    </Modal>
  );
}
