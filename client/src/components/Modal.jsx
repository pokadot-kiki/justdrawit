import { useEffect } from "react";
import { createPortal } from "react-dom";

// หน้าต่างลอยกลางจอ ม่านดำโปร่ง 50% คลุมทั้งจอ — ใช้ร่วมกันทุกหน้าต่างในเกม
//   - แสดงผ่าน portal ไปที่ <body> ระดับบนสุด จึงไม่ถูก transform / animation / position / overflow ของแผงที่ซ้อนอยู่กระทบ
//     (เดิมเรนเดอร์ในหน้านั้นตรงๆ แล้วกฎ CSS ของหน้าแรกไปทับ position: fixed ทำให้กล่องหลุดไปล่างสุดและดันหน้าเลื่อน)
//   - onClose: ใส่เมื่อปิดได้ → กด Esc หรือคลิกนอกกล่อง (บนม่าน) เพื่อปิด · ไม่ใส่ = กล่องที่ต้องตอบ (เลือกคำ สรุปตา จบเกม) ปิดเองไม่ได้
//   - ระหว่างเปิด ล็อกไม่ให้หน้าข้างหลังเลื่อน
export default function Modal({ children, labelledBy, onClose, panelClassName = "" }) {
  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      className="modal"
      // คลิกที่ม่านเอง (ไม่ใช่ข้างในกล่อง) = ปิด · ใช้ mousedown กันลากเลือกข้อความในกล่องแล้วปล่อยนอกกล่องปิดเอง
      onMouseDown={(e) => onClose && e.target === e.currentTarget && onClose()}
    >
      <div className={`modal__panel${panelClassName ? ` ${panelClassName}` : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
