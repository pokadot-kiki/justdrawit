import { Icon } from "./Icons";
import { CHALLENGE_INFO } from "./ChallengeBanner";
import { difficultyLabel } from "../roomOptions";

// ข้อมูลห้องเล็กๆ ท้ายแผงผู้เล่น (ใช้ที่ว่างตอนคนในห้องน้อย) — รหัสห้อง โหมด รอบ ระดับคำ และกติกา Mini Challenge ของตานี้
// ทุกค่ามาจาก room.settings / game ที่ server ส่งมา (ไม่มีคำตอบ ปลอดภัยโชว์ทุกคน)
export default function RoomInfo({ code, settings, roundNo, totalRounds, challenge }) {
  const teamMode = settings.mode === "team";
  const info = CHALLENGE_INFO[challenge?.type];
  return (
    <section className="room-info" aria-label="ข้อมูลห้อง">
      <h3 className="room-info__title">ข้อมูลห้อง</h3>
      <dl className="room-info__list">
        <div>
          <dt>รหัสห้อง</dt>
          <dd className="room-info__code">{code}</dd>
        </div>
        <div>
          <dt>โหมด</dt>
          <dd>{teamMode ? "ทีม A vs B" : "แข่งเดี่ยว"}</dd>
        </div>
        <div>
          <dt>รอบ</dt>
          <dd>
            {roundNo ?? "-"}/{totalRounds ?? settings.rounds}
          </dd>
        </div>
        <div>
          <dt>ระดับคำ</dt>
          <dd>{difficultyLabel(settings.difficulty)}</dd>
        </div>
      </dl>
      <div className={`room-info__rule${info ? " room-info__rule--on" : ""}`}>
        {info ? (
          <>
            <span className="room-info__rule-head">
              <Icon name={info.icon} size={18} /> {info.title}
            </span>
            <span className="room-info__rule-desc">{info.desc}</span>
          </>
        ) : (
          <span className="room-info__rule-desc">{challenge ? "ตานี้วาดอิสระ ไม่มีกติกาพิเศษ" : "Mini Challenge: รอเริ่มตา"}</span>
        )}
      </div>
    </section>
  );
}
