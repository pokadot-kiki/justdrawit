import { useRef, useState } from "react";
import { socket } from "../socket";
import { errorText } from "../messages";
import categories from "../../../shared/wordCategories.json" with { type: "json" };

export default function CategorySelection({ room, me, onLeave }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const isHost = room.hostId === me?.playerId;

  function select(category) {
    if (!isHost || sending.current) return;
    sending.current = true;
    setPending(true);
    setError("");
    socket.timeout(6000).emit("select_category", { category }, (err, result) => {
      sending.current = false;
      if (err || !result?.ok) {
        setPending(false);
        setError(errorText(err ? "CONNECT_FAILED" : result?.error));
      }
    });
  }

  return (
    <main className="screen category-screen">
      <section className="panel category-panel" aria-labelledby="category-title">
        <p className="category-eyebrow">ห้อง {room.code} · {room.settings.mode === "team" ? "แข่งทีม" : "แข่งเดี่ยว"}</p>
        <h1 id="category-title">เลือกหมวดคำศัพท์</h1>
        <p>{isHost ? "เลือกหนึ่งหมวดเพื่อเริ่มเกม ทุกตาจะใช้หมวดนี้" : "กำลังรอหัวห้องเลือกหมวดคำศัพท์..."}</p>
        {isHost && (
          <div className="category-options">
            {categories.map(({ id, label, icon }) => (
              <button className="btn category-option" type="button" key={id} disabled={pending} onClick={() => select(id)}>
                <span aria-hidden="true">{icon}</span> {label}
              </button>
            ))}
          </div>
        )}
        {pending && <p role="status">กำลังยืนยันหมวด...</p>}
        {error && <p className="category-error" role="alert">{error}</p>}
        <button className="btn" type="button" onClick={onLeave}>ออกจากห้อง</button>
      </section>
    </main>
  );
}
