import { useEffect, useState } from "react";
import Modal from "./Modal";
import Mascot from "./Mascot";
import Confetti from "./Confetti";
import YouTag from "./YouTag";
import { Icon } from "./Icons";

const MEDALS = ["medal1", "medal2", "medal3"];

// จบเกม — แท่นรางวัลอันดับ 1-3
// ทุกคนมีปุ่มกลับห้องรอ (back_to_lobby → server พาทุกคนกลับพร้อมกัน หรือพาเองเมื่อครบเวลา) กับกลับหน้าแรก (leave_room) · หัวห้องมีปุ่มเล่นอีกรอบเลย (start_game)
export default function GameOverModal({ ranking, isHost, onPlayAgain, onBackToLobby, returnAt = null, onLeave, teamRanking = null, winner = null, myTeam = null, meId = null, teamNames = {} }) {
  // โหมดทีม: ประกาศทีมที่ชนะ (เสมอ = winner เป็น null) พลุเล่นเหมือนเดิมเพราะอยู่ในกล่องเดียวกัน
  const teamMode = Boolean(teamRanking);
  const teamName = (t) => teamNames[t] || `ทีม ${t}`;
  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3);
  // นับถอยหลังก่อน server พากลับห้องรอเอง (server เป็นคนสั่งจริง ตัวเลขนี้แค่โชว์)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (returnAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [returnAt]);
  const secLeft = returnAt == null ? null : Math.max(0, Math.ceil((returnAt - now) / 1000));

  // เรียงให้ที่ 1 อยู่กลาง เวลาตกแต่งด้วย CSS จะได้เหมือนแท่นรางวัลจริง
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);

  return (
    <Modal labelledBy="game-over-title">
      <Mascot mood="trophy" className="mascot--modal" />
      <h2 className="modal__title" id="game-over-title">
        จบเกมแล้ว
      </h2>

      {teamMode && (
        <div className={`team-winner${winner ? ` team-winner--${winner}` : ""}`}>
          <p className="team-winner__title">
            <Icon name={winner ? "trophy" : "users"} size={24} /> {winner ? `${teamName(winner)} ชนะ!` : "เสมอกัน!"}
            {winner && winner === myTeam ? " (ทีมคุณ)" : ""}
          </p>
          <div className="team-vs">
            {teamRanking.map((t) => (
              <span key={t.team} className={`team-vs__chip team-vs__chip--${t.team}`}>
                {teamName(t.team)} <b>{t.score}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* พลุพุ่งจากแท่นรางวัล: กล่อง relative ครอบเฉพาะแท่น ให้พลุเริ่มที่แท่นไม่ใช่ที่มุมหน้าต่าง */}
      {teamMode && <p className="modal__note">คะแนนรายคน</p>}
      <div className="podium-stage">
        <Confetti />
        <ol className="podium">
          {podiumOrder.map((p) => {
            const place = top3.indexOf(p);
            return (
              <li className={`podium__item podium__item--${place + 1}${p.playerId === meId ? " podium__item--me" : ""}`} key={p.playerId}>
                <span className="podium__medal"><Icon name={MEDALS[place]} size={34} /></span>
                <span className="podium__name">{p.name}</span>
                {p.playerId === meId && <YouTag />}
                <span className="podium__score">{p.score}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {rest.length > 0 && (
        <ul className="gains">
          {rest.map((p, i) => (
            <li className={p.playerId === meId ? "gains__row gains__row--me" : "gains__row"} key={p.playerId}>
              <span>
                {i + 4}. {p.name}
                {p.playerId === meId && <YouTag />}
              </span>
              <span className="gains__value">{p.score}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="modal__actions">
        <button className="btn btn--primary" type="button" onClick={onBackToLobby}>
          กลับห้องรอ
        </button>
        {isHost && (
          <button className="btn" type="button" onClick={onPlayAgain}>
            เล่นอีกรอบเลย
          </button>
        )}
        <button className="btn" type="button" onClick={onLeave}>
          กลับหน้าแรก
        </button>
      </div>
      {secLeft != null && <p className="modal__note">กลับห้องรอเองอัตโนมัติใน {secLeft} วิ</p>}
    </Modal>
  );
}
