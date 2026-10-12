import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { predictWords } from "../utils/predictiveText";
import { createSpeechRecognizer } from "../utils/speechToText";

/**
 * ช่องพิมพ์ทายคำ — component เดียวใช้ร่วมกันทุกที่ที่พิมพ์ทาย (แข่งเดี่ยว/แข่งทีมใน `Chat.jsx`
 * และช่วง "AI วาด เราทาย" ของ Solo ใน `SoloAI.jsx`) ไม่ใช้ในแชทห้องรอ (`LobbyChat.jsx` มีช่องพิมพ์ของตัวเอง)
 *
 * มีสองตัวช่วยอยู่ในนี้ ทั้งคู่ทำงานฝั่งเบราว์เซอร์ล้วนๆ ไม่เกี่ยวกับ server เลย:
 *   - ช่วยเดาคำ: โชว์คำแนะนำ ≤3 คำเหนือช่องพิมพ์ จากคลังคำภาษาไทยทั่วไป (ดู predictiveText.js
 *     ว่ามาจากไหน) ไม่ใช่คลังคำของเกม กดเลือกด้วยนิ้ว/เมาส์ได้ หรือกด ArrowDown จากช่องพิมพ์ย้ายโฟกัสเข้ามา
 *     แล้ว ArrowUp/ArrowDown ไล่ดูทีละคำ Tab ไหลผ่านตามลำดับ DOM ปกติ — Enter ในช่องพิมพ์ยังส่งข้อความที่
 *     พิมพ์อยู่เหมือนเดิมเสมอ (ไม่ถูกคำแนะนำแย่งไป)
 *   - ตอบด้วยเสียง: ปุ่มไมค์ใช้ Web Speech API ของเบราว์เซอร์ เบราว์เซอร์ที่ไม่รองรับปุ่มจะจางและบอกเหตุผล
 *     ใน title/aria-label แทนการ error
 */
export default function GuessInput({
  onSend,
  disabled = false,
  placeholder = "ทายคำ...",
  inputAriaLabel = "ช่องทายคำ",
  submitLabel = "ส่ง",
  maxLength = 100,
  focusKey = 0,
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [sttSupported, setSttSupported] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const inputRef = useRef(null);
  const suggestionRefs = useRef([]);
  const recognizerRef = useRef(null);

  useEffect(() => {
    const r = createSpeechRecognizer({
      onResult: (transcript) => setText(transcript),
      onError: () => setListening(false),
      onEnd: () => setListening(false),
    });
    recognizerRef.current = r;
    setSttSupported(r.supported);
  }, []);

  // ขึ้นตาใหม่/ด่านใหม่ (หรือตอน mount ครั้งแรก) = โฟกัสช่องพิมพ์ให้เอง
  // ข้ามตอนพิมพ์ไม่ได้ ไม่งั้นจะไปแย่งโฟกัสทั้งที่พิมพ์ไม่ได้
  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // ช่วยเดาคำ: คำนวณใหม่ทุกครั้งที่พิมพ์ — โหลดคลังคำ (lazy, ครั้งแรกเท่านั้น) แล้วจับคู่ในเบราว์เซอร์ล้วนๆ
  useEffect(() => {
    let cancelled = false;
    if (!text.trim()) {
      setSuggestions([]);
      return undefined;
    }
    predictWords(text, 3).then((list) => {
      if (!cancelled) setSuggestions(list);
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  function toggleListening() {
    if (!recognizerRef.current?.supported) return;
    if (listening) {
      recognizerRef.current.stop();
      setListening(false);
    } else {
      setListening(true);
      recognizerRef.current.start();
    }
  }

  function handleSubmit(e) {
    if (e) e.preventDefault(); // Enter ในช่องพิมพ์ = ส่งข้อความที่พิมพ์อยู่เสมอ ไม่ถูกคำแนะนำแย่งไป
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText("");
  }

  function selectSuggestion(word) {
    onSend(word);
    setText("");
    if (!disabled) inputRef.current?.focus();
  }

  // ลูกศรลงจากช่องพิมพ์ = เข้าแถวคำแนะนำ (คำแรก) ลูกศรขึ้น/ลงไล่ทีละคำ Tab ไหลตาม DOM ปกติ
  function onInputKeyDown(e) {
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      suggestionRefs.current[0]?.focus();
    }
  }
  function onSuggestionKeyDown(e, i) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      suggestionRefs.current[i + 1]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i === 0) inputRef.current?.focus();
      else suggestionRefs.current[i - 1]?.focus();
    }
  }

  const micTitle = !sttSupported
    ? "เบราว์เซอร์นี้ไม่รองรับระบบรู้จำเสียง"
    : listening
      ? "กำลังฟังเสียง... (ใช้ระบบรู้จำเสียงในตัวเบราว์เซอร์)"
      : "ตอบด้วยเสียง — ใช้ระบบรู้จำเสียงในตัวเบราว์เซอร์ (Web Speech API)";
  const micAriaLabel = !sttSupported
    ? "ตอบด้วยเสียง ไม่รองรับในเบราว์เซอร์นี้"
    : listening
      ? "กำลังฟังเสียง"
      : "ตอบด้วยเสียง";

  return (
    <>
      {!disabled && suggestions.length > 0 && (
        <div className="guess-suggest" role="listbox" aria-label="คำแนะนำ">
          {suggestions.map((word, i) => (
            <button
              key={word}
              type="button"
              ref={(el) => (suggestionRefs.current[i] = el)}
              className="guess-suggest__pill"
              onClick={() => selectSuggestion(word)}
              onKeyDown={(e) => onSuggestionKeyDown(e, i)}
            >
              <Icon name="bulb" size={14} />
              {word}
            </button>
          ))}
        </div>
      )}
      <form className="chat__form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="input chat__input"
          type="text"
          value={text}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={inputAriaLabel}
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onInputKeyDown}
        />
        {!disabled && (
          <button
            type="button"
            className={`icon-btn${listening ? " chat__mic--on" : ""}`}
            disabled={!sttSupported}
            title={micTitle}
            aria-label={micAriaLabel}
            onClick={toggleListening}
          >
            <Icon name={listening ? "micOn" : "micOff"} size={22} />
          </button>
        )}
        <button className="btn btn--primary" type="submit" disabled={disabled || !text.trim()}>
          {submitLabel}
        </button>
      </form>
    </>
  );
}
