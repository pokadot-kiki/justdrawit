import { useEffect, useState } from "react";
import { socket } from "../socket";
import { errorText } from "../messages";
import definitions from "../../../shared/achievements.json" with { type: "json" };

export default function Achievements({ onClose, onPlay, onProfile, onLeaderboard }) {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const update = (next) => setState(next);
    socket.on("achievement_state", update);
    socket.timeout(6000).emit("get_achievements", (err, result) => {
      if (err || !result?.ok) setError(errorText("CONNECT_FAILED"));
      else setState(result.state);
    });
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { socket.off("achievement_state", update); window.removeEventListener("keydown", onKey); };
  }, []);

  function equip(title) {
    if (busy) return;
    setBusy(true);
    setError("");
    socket.timeout(6000).emit("set_title", { title }, (err, result) => {
      setBusy(false);
      if (err || !result?.ok) setError(errorText(err ? "CONNECT_FAILED" : result?.error));
      else setState(result.state);
    });
  }

  const shown = definitions.filter((item) => tab === "all" || item.scope === tab);
  const unlocked = state?.unlocked || [];
  const unlockedCount = unlocked.length;
  return (
    <div className="ach-page" role="dialog" aria-modal="true" aria-labelledby="ach-title">
      <header className="ach-nav">
        <span className="ach-brand">✎ JUST DRAW IT</span><span className="ach-live">ARCADE LIVE</span>
        <nav className="ach-nav__links" aria-label="เมนูหลัก"><button type="button" onClick={onPlay}>Play</button><button type="button" onClick={onProfile}>Profile</button><button type="button" onClick={onLeaderboard}>Leaderboard</button></nav>
      </header>
      <main className="ach-shell">
        <div className="ach-head">
          <button type="button" className="ach-back" onClick={onClose}>← ย้อนกลับ</button>
          <div><h1 id="ach-title"><span>🏆</span> ความสำเร็จ <em>(ACHIEVEMENTS)</em></h1><p>ทำภารกิจท้าทายให้สำเร็จและสะสมฉายาในห้องปัจจุบัน</p></div>
          <button type="button" className="ach-close" aria-label="ปิด" onClick={onClose}>×</button>
        </div>
        <div className="ach-body">
          <div className="ach-meter" aria-label={`ปลดล็อก ${unlockedCount} จาก ${definitions.length}`}>
            <span>🏆</span><div className="ach-meter__track"><i style={{ width: `${unlockedCount / definitions.length * 100}%` }} /></div>
          </div>
          <div className="ach-filters">
            <div className="ach-tabs">
              {[ ["all", `✦ ทั้งหมด (${definitions.length})`], ["multi", "♟ เล่นกับเพื่อน (Multiplayer)"], ["solo", "♧ เล่นคนเดียว & ท้าทาย AI"] ].map(([key, label]) => (
                <button type="button" key={key} className={tab === key ? "ach-tab ach-tab--on" : "ach-tab"} onClick={() => setTab(key)}>{label}</button>
              ))}
            </div>
            <span className="ach-count">🟢 {unlockedCount} ปลดล็อกแล้ว / ○ {definitions.length - unlockedCount} ยังไม่ปลดล็อก</span>
          </div>
          {state?.scope === "none" && <p className="ach-notice">เข้าห้องหรือเริ่ม Solo เพื่อสะสม Achievement ฉายาจะอยู่เฉพาะห้องหรือ Solo session นั้น</p>}
          {error && <p className="ach-error" role="alert">{error}</p>}
          <div className="ach-grid">
            {shown.map((item) => {
              const activeScope = state?.scope === item.scope;
              const isUnlocked = activeScope && unlocked.includes(item.id);
              const equipped = isUnlocked && state.equipped === item.id;
              const progress = activeScope ? Math.min(item.target, state?.progress?.[item.id] || 0) : 0;
              return (
                <article className={`ach-card${isUnlocked ? " ach-card--unlocked" : " ach-card--locked"}`} key={item.id}>
                  <div className="ach-card__top">
                    <span className="ach-card__icon" aria-hidden="true">{item.icon}</span>
                    <div><h2>{item.id}</h2><p>{item.description}</p><small>ฉายาที่ได้รับ: « {item.id} »</small></div>
                  </div>
                  <div className="ach-card__foot">
                    <span className={isUnlocked ? "ach-badge ach-badge--yes" : "ach-badge"}>{isUnlocked ? "✓ ปลดล็อกแล้ว" : "♙ ยังไม่ปลดล็อก"}</span>
                    {isUnlocked ? (
                      <button type="button" className="ach-equip" disabled={busy} onClick={() => equip(equipped ? null : item.id)}>{equipped ? "ถอดฉายา" : "ใช้ฉายา"}</button>
                    ) : <span className="ach-progress">{progress} / {item.target}</span>}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <footer className="ach-footer"><span>💡 ฉายาที่ปลดล็อกอยู่เฉพาะห้องหรือ Solo session ปัจจุบัน</span><button type="button" onClick={onClose}>เข้าใจแล้ว!</button></footer>
      </main>
    </div>
  );
}
