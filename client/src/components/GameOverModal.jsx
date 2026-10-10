import { useEffect, useState } from "react";
import Modal from "./Modal";
import Mascot from "./Mascot";
import Confetti from "./Confetti";
import Avatar from "./Avatar";
import YouTag from "./YouTag";
import { Icon } from "./Icons";
import { addCoins, getUserAuth } from "../prefs";

const MEDALS = ["medal1", "medal2", "medal3"];

// จบเกม — แท่นรางวัลอันดับ 1-3 และอันดับครบทุกคนของโหมดรายคน
// ทุกคนมีปุ่มกลับห้องรอ (back_to_lobby → server พาทุกคนกลับพร้อมกัน หรือพาเองเมื่อครบเวลา) กับกลับหน้าแรก (leave_room) · หัวห้องมีปุ่มเล่นอีกรอบเลย (start_game)
export default function GameOverModal({ ranking, isHost, onPlayAgain, onBackToLobby, returnAt = null, onLeave, teamRanking = null, winner = null, myTeam = null, meId = null }) {
  const teamMode = Boolean(teamRanking);
  const top3 = ranking.slice(0, 3);
  const teamTop3 = teamRanking?.slice(0, 3) ?? [];
  const winningTeam = teamRanking?.find((t) => t.team === winner);
  // นับถอยหลังก่อน server พากลับห้องรอเอง (server เป็นคนสั่งจริง ตัวเลขนี้แค่โชว์)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (returnAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [returnAt]);
  const secLeft = returnAt == null ? null : Math.max(0, Math.ceil((returnAt - now) / 1000));

  // เรียงให้ที่ 1 อยู่กลาง เวลาตกแต่งด้วย CSS จะได้เหมือนแท่นรางวัลจริง (เล่นสองคน = ไม่มีที่ 3 ไม่สร้างเพิ่ม)
  const podiumOrder = (items) => [items[1], items[0], items[2]].filter(Boolean);
  // Multiplayer vs AI: แยกคะแนนวาด (ช่วง 1) / ทาย (ช่วง 2) ไว้ในการ์ด/แถวของแต่ละคนเอง ไม่ทำรายชื่อซ้ำอีกชุด
  const split = (p) =>
    p.drawPoints === undefined ? null : (
      <span className="podium__split">
        วาด {p.drawPoints} · ทาย {p.guessPoints}
        {p.left ? " · ออกแล้ว" : ""}
      </span>
    );

  const auth = getUserAuth();
  const baseCoins = 100;
  const myPlayer = ranking.find((p) => p.playerId === meId);
  const score = myPlayer?.score || 0;
  const totalEarned = auth ? baseCoins + Math.floor(score / 5) : 0;

  useEffect(() => {
    if (auth && totalEarned > 0) {
      addCoins(totalEarned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal labelledBy="game-over-title" panelClassName={teamMode ? "modal__panel--team-over" : ""}>
      <Mascot mood="trophy" className="mascot--modal" />
      <h2 className={`modal__title${teamMode ? " team-over__headline" : ""}`} id="game-over-title">
        {teamMode ? winningTeam ? "ทีมผู้ชนะ!" : "เสมอกัน!" : "จบเกมแล้ว"}
      </h2>

      {teamMode ? (
        <>
          <div className="team-over__winner">
            <Icon name={winningTeam ? "trophy" : "users"} size={32} />
            {winningTeam ? (
              <>
                <strong className="team-over__winner-name">{winningTeam.name}</strong>
                <span className="team-over__winner-members">{winningTeam.members.map((p) => p.name).join(" × ")}</span>
                <span className="team-over__winner-score">{winningTeam.score} คะแนน{winningTeam.team === myTeam ? " · ทีมคุณ" : ""}</span>
              </>
            ) : (
              <span>ไม่มีทีมชนะเพียงทีมเดียว</span>
            )}
          </div>

          {/* ใช้อันดับทีมที่ server ส่งมาโดยตรง; พลุเล่นครั้งเดียวจากแท่นเดิม */}
          <div className="podium-stage team-over__stage">
            <Confetti />
            <ol className={`team-podium${teamTop3.length === 2 ? " team-podium--two" : ""}`}>
              {podiumOrder(teamTop3).map((t) => {
                const place = teamTop3.indexOf(t);
                return (
                  <li className={`team-podium__item team-podium__item--${place + 1}`} key={t.team}>
                    <span className="team-podium__medal"><Icon name={MEDALS[place]} size={30} /></span>
                    <span className={`team-vs__chip team-vs__chip--${t.team}`}>ทีม {t.team}</span>
                    <strong className="team-podium__name">{t.name}</strong>
                    <span className="team-podium__members">
                      {t.members.map((p) => (
                        <span className="team-podium__member" key={p.playerId}>
                          {Number.isInteger(p.avatar) && <Avatar index={p.avatar} />}
                          <span title={p.name}>{p.name}{p.left ? " · ออกแล้ว" : ""}</span>
                        </span>
                      ))}
                    </span>
                    <strong className="team-podium__score">{t.score} คะแนน</strong>
                  </li>
                );
              })}
            </ol>
          </div>

          <section className="team-standings" aria-labelledby="team-standings-title">
            <h3 className="team-standings__title" id="team-standings-title">อันดับทีมทั้งหมด</h3>
            <ol className="team-standings__list">
              {teamRanking.map((t, i) => (
                <li className="team-standings__row" key={t.team}>
                  <span className="team-standings__rank">{i + 1}.</span>
                  <span className="team-standings__identity">
                    <span className={`team-vs__chip team-vs__chip--${t.team}`}>{t.name}</span>
                    <span className="team-standings__members">
                      {t.members.map((p) => (
                        <span className="team-standings__member" key={p.playerId}>
                          {Number.isInteger(p.avatar) && <Avatar index={p.avatar} />}
                          <span title={p.name}>{p.name}{p.left ? " · ออกแล้ว" : ""}</span>
                        </span>
                      ))}
                    </span>
                  </span>
                  <strong className="team-standings__score">{t.score}</strong>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : (
        <div className="podium-stage">
          <Confetti />
          <ol className={`podium${top3.length === 2 ? " podium--two" : ""}`}>
            {podiumOrder(top3).map((p) => {
              const place = top3.indexOf(p);
              return (
                <li className={`podium__item podium__item--${place + 1}${p.playerId === meId ? " podium__item--me" : ""}`} key={p.playerId}>
                  <span className="podium__medal"><Icon name={MEDALS[place]} size={34} /></span>
                  <span className="podium__name">{p.name}</span>
                  <span className="podium__score">{p.score}</span>
                  {split(p)}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {!teamMode && (
        <section className="match-ranking" aria-labelledby="match-ranking-title">
          <h3 className="match-ranking__title" id="match-ranking-title">อันดับผู้เล่นทั้งหมด</h3>
          <ol className="match-ranking__list">
            {ranking.map((p, i) => (
              <li className={`match-ranking__row${p.playerId === meId ? " match-ranking__row--me" : ""}`} key={p.playerId}>
                <span className="match-ranking__place">{i + 1}.</span>
                <span className="match-ranking__avatar">{Number.isInteger(p.avatar) && <Avatar index={p.avatar} />}</span>
                <span className="match-ranking__identity">
                  <span className="match-ranking__name" title={p.name}>{p.name}</span>
                  {(p.playerId === meId || p.isHost || p.left) && (
                    <span className="match-ranking__badges">
                      {p.playerId === meId && <YouTag />}
                      {p.isHost && <span className="tag tag--host" title="หัวห้อง"><Icon name="crown" size={13} /> หัวห้อง</span>}
                      {p.left && <span className="match-ranking__left">ออกแล้ว</span>}
                    </span>
                  )}
                </span>
                <strong className="match-ranking__score">{p.score}</strong>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Economy & Reward System Breakdown (ข้อ 6) ── */}
      <div style={{ margin: "16px 0", padding: "12px", background: "#fefce8", border: "1px solid #fef08a", borderRadius: "8px", textAlign: "center" }}>
        <h3 style={{ margin: 0, fontSize: "14px", color: "#a16207" }}>💰 สรุปเหรียญรางวัลประจำรอบ (Coin Rewards)</h3>
        {auth ? (
          <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#854d0e" }}>
            คุณได้รับ <b>+{totalEarned}</b> เหรียญ! (เหรียญพื้นฐาน 100 + คะแนนผลงาน)
          </p>
        ) : (
          <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#dc2626" }}>
            ⚠️ คุณเล่นในโหมด Guest (0 เหรียญ) — กรุณาล็อกอินเข้าสู่ระบบเพื่อสะสมเหรียญ
          </p>
        )}
      </div>

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
