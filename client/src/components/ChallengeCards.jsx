import { socket } from "../socket";
import { Icon } from "./Icons";
import { CHALLENGE_CARDS, DEFAULT_CHALLENGES } from "../roomOptions";

// ไอคอนพิกเซลของแต่ละกติกา (ใช้ชุดไอคอนเดิมใน Icons.jsx)
const CARD_ICONS = {
  none: "pen",
  colour_fix: "palette",
  dont_lift_pen: "shape-line",
  shapes_only: "shape-circle",
};

// การ์ด Mini Challenge 2×2 ในห้องรอ — กดทั้งการ์ดเพื่อเปิด/ปิด (หัวห้องเท่านั้น)
// คนอื่นเห็นสถานะ realtime แต่การ์ดเป็น div กดไม่ได้ · ต้องเปิดอย่างน้อย 1 ใบเสมอ
// server ตรวจซ้ำทุกครั้ง (set_challenges รับเฉพาะหัวห้อง และ sanitize ให้เหลือ ≥1)
export default function ChallengeCards({ enabled = DEFAULT_CHALLENGES, isHost }) {
  const active = CHALLENGE_CARDS.filter((c) => enabled.includes(c.id)).length;

  function toggle(id) {
    if (!isHost) return;
    const has = enabled.includes(id);
    if (has && enabled.length <= 1) return;
    socket.emit("set_challenges", { challenges: has ? enabled.filter((x) => x !== id) : [...enabled, id] });
  }

  return (
    <div className="lb-card lb-chal">
      <div className="lb-card__head">
        <h2 className="lb-card__title">
          <Icon name="dice" size={22} /> Mini Challenge
        </h2>
        <span className="lb-count">เปิด {active}/{CHALLENGE_CARDS.length}</span>
      </div>
      <div className="lb-chal__grid" role={isHost ? "group" : undefined} aria-label="เปิด/ปิด Mini Challenge">
        {CHALLENGE_CARDS.map((c) => {
          const on = enabled.includes(c.id);
          const lastOne = on && enabled.length <= 1; // ปิดไม่ได้เพราะเหลือใบเดียว
          const cls = `lb-ch${on ? " lb-ch--on" : ""}${isHost ? " lb-ch--host" : ""}`;
          const content = (
            <>
              <span className="lb-ch__icon" aria-hidden="true">
                <Icon name={CARD_ICONS[c.id] ?? "star"} size={22} />
              </span>
              <span className="lb-ch__text">
                <span className="lb-ch__title">{c.title}</span>
                <span className="lb-ch__desc">{c.desc}</span>
              </span>
              <span className={`lb-ch__badge lb-ch__badge--${on ? "on" : "off"}`}>{on ? "เปิดอยู่ ✓" : "ปิด"}</span>
            </>
          );
          return isHost ? (
            <button
              key={c.id}
              type="button"
              className={cls}
              aria-pressed={on}
              disabled={lastOne}
              title={lastOne ? "ต้องเปิดอย่างน้อย 1 ใบ" : on ? "กดเพื่อปิด" : "กดเพื่อเปิด"}
              onClick={() => toggle(c.id)}
            >
              {content}
            </button>
          ) : (
            <div key={c.id} className={cls}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
