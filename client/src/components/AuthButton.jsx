import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Avatar from "./Avatar";
import { Icon } from "./Icons";

// ปุ่มเข้าสู่ระบบ / ชิปบัญชี — มุมขวาบนของหน้าแรก ข้างปุ่มเพลง/เสียง (ไม่บังคับ ไม่ล็อกอินก็เล่นได้ทุกโหมดเหมือนเดิม)
// enabled=false (server ยังไม่ได้ตั้งค่า Firebase) → ซ่อนทั้งปุ่ม ไม่โชว์อะไรค้าง ไม่ error
export default function AuthButton({ enabled, user, avatar = 0, onLogout }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const boxRef = useRef(null);

  // คลิกนอกเมนู/กด Esc = ปิดเมนู
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!enabled) return null;

  if (!user) {
    return (
      <button
        type="button"
        className="auth-btn"
        onClick={() => navigate(`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`)}
      >
        เข้าสู่ระบบ
      </button>
    );
  }

  return (
    <div className="auth-chip-wrap" ref={boxRef}>
      <button
        type="button"
        className="auth-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar index={avatar} />
        <span className="auth-chip__name">{user.name || user.email}</span>
      </button>
      {open && (
        <div className="auth-menu" role="menu">
          <p className="auth-menu__email" title={user.email}>{user.email}</p>
          <button
            type="button"
            className="auth-menu__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <Icon name="door" size={16} /> ออกจากระบบ
          </button>
        </div>
      )}
    </div>
  );
}
