// ตารางอันดับ ใช้ทั้งหน้าแรก (compact, 10 อันดับ) และหน้า Leaderboard (20 อันดับ)
// รับ { status, top, retry } จาก useLeaderboard แล้วจัดการทั้งสามสถานะ: โหลด · error · ว่าง
import YouTag from "./YouTag";
import { Icon } from "./Icons";
import Avatar from "./Avatar";

const MEDALS = { 1: "medal1", 2: "medal2", 3: "medal3" };

// showLevel = false ซ่อนคอลัมน์ "ด่าน" (กระดานเล่นกับเพื่อนไม่มีด่าน) · emptyHint = บรรทัดชวนเล่นตอนยังไม่มีคะแนน
export default function RankTable({
  board,
  limit = 20,
  compact = false,
  emptyText,
  showLevel = true,
  emptyHint = "ลองเล่นโหมด Solo แข่งกับ AI แล้วมาเป็นคนแรกบนกระดานนี้กัน!",
  emptyIcon = "robot",
}) {
  const rows = board.top.slice(0, limit);

  if (board.status === "error") {
    return (
      <div className="board-empty">
        <p>ต่อ server ไม่ได้ ลองใหม่อีกครั้ง</p>
        <button type="button" className="btn" onClick={board.retry}>
          ลองใหม่
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    if (board.status === "loading") return <p className="board-empty">กำลังโหลด...</p>;
    return (
      <div className="board-empty">
        <p className="board-empty__icon">
          <Icon name={emptyIcon} size={44} />
        </p>
        <p>{emptyText}</p>
        <p className="muted">{emptyHint}</p>
      </div>
    );
  }

  const classes = ["rank-table"];
  if (compact) classes.push("rank-table--compact");
  // ตอนกำลังโหลดใหม่ ยังโชว์ตารางเดิมแบบจางไว้ จอจะได้ไม่กระพริบ
  if (board.status === "loading") classes.push("rank-table--loading");

  return (
    <table className={classes.join(" ")}>
      <thead>
        <tr>
          <th scope="col">อันดับ</th>
          <th scope="col">ชื่อ</th>
          {showLevel && <th scope="col">ด่าน</th>}
          <th scope="col">คะแนน</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.rank}
            className={`${row.rank <= 3 ? `rank-row rank-row--${row.rank}` : "rank-row"}${row.isMe ? " rank-row--me" : ""}`}
          >
            <td className="rank-row__rank">{MEDALS[row.rank] ? <Icon name={MEDALS[row.rank]} size={compact ? 20 : 26} label={`อันดับ ${row.rank}`} /> : row.rank}</td>
            {/* ชื่อแสดงผ่าน {} ของ React = ข้อความธรรมดาเสมอ
                ชื่อแบบ <b>x</b> จะขึ้นเป็นตัวอักษรตามนั้น ไม่ถูกตีความเป็น HTML
                (ห้ามเปลี่ยนไปใช้ dangerouslySetInnerHTML ที่นี่เด็ดขาด) */}
            <td className="rank-row__name">
              <span className="rank-row__identity"><Avatar index={row.avatar} photoUrl={row.avatarPhoto} outfit={row.outfit} /><span className="rank-row__details"><span className="rank-row__display-name">{row.name}{row.isMe && <YouTag />}</span><small>{row.games ?? 0} เกม{row.wins > 0 ? ` · ชนะ ${row.wins}` : ""}</small></span></span>
            </td>
            {showLevel && <td className="rank-row__level">{row.levelReached}</td>}
            <td className="rank-row__score">{row.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
