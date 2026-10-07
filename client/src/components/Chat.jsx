import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { predictWords } from "../utils/predictiveText";
import { createSpeechRecognizer } from "../utils/speechToText";

/**
 * แชทของห้อง — คอลัมน์ขวาของหน้าเกม (DESIGN.md หัวข้อหน้าเกม)
 *
 * รวมสองอย่างไว้ในกล่องเดียว (เดิมแยกเป็น "คำตอบ" กับ "ในห้อง")
 *   ข้อความผู้เล่น  ทายผิดดำปกติ · ทายถูกพื้นเขียวอ่อนตัวเขียว (คำของตัวเองเห็นคำจริง คนอื่นเห็น ****** — server ตัดสิน) · ของตัวเองขอบซ้ายสีฟ้า
 *   ข้อความระบบ     เรื่องที่เกิดในห้อง (ใครเข้าออก ใครทายถูก คำใบ้ หมดเวลา) แถวเทาเอียงพร้อมไอคอนตามชนิด (`kind` ที่ useGame ใส่มา)
 *
 * คนวาดพิมพ์ไม่ได้ระหว่างวาด server ตัดทิ้งอยู่แล้ว แต่ฝั่งเราปิดช่องไปเลยจะได้เข้าใจง่าย
 */
// ชนิดข้อความระบบ → ไอคอน (ชนิดที่ไม่รู้จัก/ไม่มี = info)
const KINDS = {
  join: "door",
  leave: "door",
  correct: "check",
  timeout: "clock",
  hint: "bulb",
  pen: "pen",
  team: "flag",
  info: "info",
};

export default function Chat({ messages = [], meId, disabled = false, onSend, focusKey = 0 }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const recognizerRef = useRef(null);

  const suggestions = predictWords(text, 3);

  // Initialize Speech Recognizer
  useEffect(() => {
    recognizerRef.current = createSpeechRecognizer({
      onResult: (transcript) => {
        setText(transcript);
      },
      onError: () => {
        setListening(false);
      },
      onEnd: () => {
        setListening(false);
      },
    });
  }, []);

  function toggleListening() {
    if (!recognizerRef.current) return;
    if (listening) {
      recognizerRef.current.stop();
      setListening(false);
    } else {
      setListening(true);
      recognizerRef.current.start();
    }
  }

  // ข้อความใหม่มา ให้เลื่อนลงล่างสุดเสมอ
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  // ขึ้นตาใหม่ = เริ่มทายใหม่ ให้เคอร์เซอร์อยู่ที่ช่องพิมพ์เลย จะได้พิมพ์ได้ทันทีไม่ต้องกดก่อน
  // ข้ามตอนที่พิมพ์ไม่ได้ (เราเป็นคนวาด) ไม่งั้นจะไปแย่งโฟกัสทั้งที่พิมพ์ไม่ได้
  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  function handleSubmit(e) {
    if (e) e.preventDefault(); // กด Enter ในช่องนี้ = ส่ง (ฟอร์มจัดการให้เอง ไม่ต้องดักคีย์เอง)
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText("");
  }

  function handleSelectSuggestion(word) {
    onSend(word);
    setText("");
    if (!disabled) inputRef.current?.focus();
  }

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

      {/* Word Suggestion Candidate Pills (Predictive Text) */}
      {!disabled && text.trim().length > 0 && suggestions.length > 0 && (
        <div style={{ display: "flex", gap: "6px", margin: "4px 0", flexWrap: "wrap" }}>
          {suggestions.map((word) => (
            <button
              key={word}
              type="button"
              className="btn"
              style={{
                fontSize: "12px",
                padding: "2px 8px",
                background: "#eef2ff",
                border: "1px solid #6366f1",
                color: "#4338ca",
                borderRadius: "12px",
                cursor: "pointer",
              }}
              onClick={() => handleSelectSuggestion(word)}
            >
              💡 {word}
            </button>
          ))}
        </div>
      )}

      <form className="chat__form" onSubmit={handleSubmit} style={{ display: "flex", gap: "4px" }}>
        <input
          ref={inputRef}
          className="input chat__input"
          type="text"
          value={text}
          maxLength={100}
          disabled={disabled}
          placeholder={disabled ? "คุณกำลังวาดอยู่" : "ทายคำ..."}
          aria-label="ช่องทายคำ"
          onChange={(e) => setText(e.target.value)}
        />
        {!disabled && (
          <button
            type="button"
            className="btn"
            style={{
              padding: "0 8px",
              background: listening ? "#ef4444" : "#f3f4f6",
              color: listening ? "#ffffff" : "#374151",
              border: "1px solid #d1d5db",
            }}
            title={listening ? "กำลังฟังเสียง..." : "ตอบด้วยเสียง (Speech-to-Text)"}
            onClick={toggleListening}
          >
            🎤
          </button>
        )}
        <button className="btn btn--primary" type="submit" disabled={disabled || !text.trim()}>
          ส่ง
        </button>
      </form>
    </section>
  );
}
