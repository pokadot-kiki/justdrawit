import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

// ไอคอนข้อความระบบ (ใครเข้า/ออก) — ชนิดอื่นใช้ info
const KINDS = { join: "door", leave: "door", info: "info" };

// แชทในห้องรอ: ข้อความผู้เล่น + ข้อความระบบ ส่งผ่าน event "guess" เดิม
// (server ถือว่านอกช่วงวาดคือคุยเล่นปกติ ส่งถึงทั้งห้อง · ตัด 100 ตัวอักษร · จำกัดความถี่เหมือนแชทในเกม)
export default function LobbyChat({ messages, meId, onSend }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function submit(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
  }

  return (
    <section className="lb-card lb-chat" aria-label="แชทในห้องรอ">
      <div className="lb-card__head">
        <h2 className="lb-card__title">
          <Icon name="question" size={22} /> แชทห้องรอ
        </h2>
        <span className="lb-live">LIVE</span>
      </div>
      <div className="lb-chat__list" ref={listRef}>
        {messages.length === 0 && <p className="chat__empty">ทักทายเพื่อนๆ ได้เลย</p>}
        {messages.map((m, i) =>
          m.system ? (
            <p className="lb-chat__row lb-chat__row--sys" key={i}>
              <Icon name={KINDS[m.kind] ?? "info"} size={14} /> {m.text}
            </p>
          ) : (
            <p className={`lb-chat__row${m.playerId === meId ? " lb-chat__row--me" : ""}`} key={i}>
              <b>{m.name}:</b> {m.text}
            </p>
          )
        )}
      </div>
      <form className="lb-chat__form" onSubmit={submit}>
        <input
          className="input lb-chat__input"
          type="text"
          value={text}
          maxLength={100}
          placeholder="พิมพ์ข้อความ..."
          aria-label="พิมพ์ข้อความในห้องรอ"
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn btn--primary" type="submit" disabled={!text.trim()}>
          ส่ง
        </button>
      </form>
    </section>
  );
}
