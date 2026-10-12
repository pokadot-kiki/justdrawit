import { useEffect, useRef } from "react";
import { Icon } from "./Icons";
import GuessInput from "./GuessInput";

/**
 * แชทของห้อง — คอลัมน์ขวาของหน้าเกม (DESIGN.md หัวข้อหน้าเกม)
 *
 * รวมสองอย่างไว้ในกล่องเดียว (เดิมแยกเป็น "คำตอบ" กับ "ในห้อง")
 *   ข้อความผู้เล่น  ทายผิดดำปกติ · ทายถูกพื้นเขียวอ่อนตัวเขียว (คำของตัวเองเห็นคำจริง คนอื่นเห็น ****** — server ตัดสิน) · ของตัวเองขอบซ้ายสีฟ้า
 *   ข้อความระบบ     เรื่องที่เกิดในห้อง (ใครเข้าออก ใครทายถูก คำใบ้ หมดเวลา) แถวเทาเอียงพร้อมไอคอนตามชนิด (`kind` ที่ useGame ใส่มา)
 *
 * คนวาดพิมพ์ไม่ได้ระหว่างวาด server ตัดทิ้งอยู่แล้ว แต่ฝั่งเราปิดช่องไปเลยจะได้เข้าใจง่าย
 * ช่องพิมพ์ (ช่วยเดาคำ + ปุ่มไมค์) อยู่ใน GuessInput.jsx ใช้ร่วมกับช่วง AI วาดของ Solo
 */
// ชนิดข้อความระบบ → ไอคอน (ชนิดที่ไม่รู้จัก/ไม่มี = info)
const KINDS = {
  join: "door",
  leave: "door",
  correct: "check",
  timeout: "clock",
  hint: "bulb",
  pen: "pen",
  violation: "pen", // คนวาดเขียนตัวหนังสือบนกระดาน (rule_violation) — ไอคอนดินสอเหมือนเดิม แต่กรอบแดง

  team: "flag",
  info: "info",
};

export default function Chat({ messages = [], meId, disabled = false, onSend, focusKey = 0 }) {
  const listRef = useRef(null);

  // ข้อความใหม่มา ให้เลื่อนลงล่างสุดเสมอ
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  return (
    <section className="panel panel--chat" aria-label="แชท">
      <h2 className="panel__title">แชท</h2>

      <div className="chat__list" ref={listRef}>
        {messages.length === 0 && <p className="chat__empty">พิมพ์ทายคำที่นี่</p>}
        {messages.map((m, i) => {
          if (m.system) {
            const kind = KINDS[m.kind] ? m.kind : "info";
            return (
              <p className={`chat__row chat__row--system note note--${kind}`} key={i}>
                <span className="note__icon" aria-hidden="true">
                  <Icon name={KINDS[kind]} size={16} />
                </span>
                <span className="note__text">{m.text}</span>
              </p>
            );
          }
          const classes = ["chat__row"];
          if (m.correct) classes.push("chat__row--correct");
          if (m.playerId === meId) classes.push("chat__row--mine");
          return (
            <p className={classes.join(" ")} key={i}>
              <span className="chat__name">{m.name}:</span> {m.text}
            </p>
          );
        })}
      </div>

      <GuessInput
        onSend={onSend}
        disabled={disabled}
        placeholder={disabled ? "คุณกำลังวาดอยู่" : "ทายคำ..."}
        inputAriaLabel="ช่องทายคำ"
        submitLabel="ส่ง"
        maxLength={100}
        focusKey={focusKey}
      />
    </section>
  );
}
