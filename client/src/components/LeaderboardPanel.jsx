import { useState } from "react";
import RankTable from "./RankTable";
import { monthKey, useLeaderboard } from "../hooks/useLeaderboard";
import { Icon } from "./Icons";

// เนื้อในของ Leaderboard — ใช้ร่วมกันทั้งการ์ดในหน้าแรกและหน้า /leaderboard เต็ม (ไม่เขียนซ้ำ)
// ประกอบด้วย: หัว (ชื่อ + dropdown เลือกเดือน) · แท็บ เล่นกับเพื่อน/แข่งกับ AI · ตารางอันดับ
// หน้าแรกส่ง scroll เพื่อให้ตารางเลื่อนภายในการ์ด (ไม่ดันการ์ดสูงจนล้น)
// แสดงได้แค่ "ปีปัจจุบัน" เท่านั้น (ไม่มีตัวเลือก "ตลอดกาล" แล้ว) — server ก็ลบคะแนนปีก่อนออกจากที่เก็บไปแล้วตอนสตาร์ท
// ดู server/leaderboard.js purgeOldYears/resolveMonth

// สองกระดานแยกกัน (server เก็บแยกด้วยช่อง board) — แท็บแค่เปลี่ยนว่าขอกระดานไหนจาก API
const BOARDS = [
  { id: "multi", label: "เล่นกับเพื่อน", icon: "star", note: "คะแนนรวมตอนจบเกมในห้อง" },
  { id: "solo", label: "แข่งกับ AI", icon: "robot", note: "คะแนนจากโหมด Solo แข่งกับ AI" },
];

// "2026-10" → "ตุลาคม" (แสดงเฉพาะเดือน ไม่ต้องแสดงปี)
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "long" });
}

// มกราคมถึงเดือนปัจจุบันของปีนี้ เรียงเดือนปัจจุบันไว้แรกสุด (ตัวเลือกแรก = ค่าเริ่มต้น)
function monthsThisYear() {
  const now = new Date();
  return Array.from({ length: now.getMonth() + 1 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
}

export default function LeaderboardPanel({ limit = 20, scroll = false, meName = "" }) {
  const [months] = useState(monthsThisYear);
  const [month, setMonth] = useState(months[0]); // เปิดมาเห็นเดือนปัจจุบันก่อน
  const [tab, setTab] = useState("multi");
  // เปิดหน้า เปลี่ยนแท็บ หรือเปลี่ยนเดือน = ขอ API ใหม่ทุกครั้ง (ไม่เก็บคะแนนไว้ในเครื่อง)
  const board = useLeaderboard(month, tab);
  const info = BOARDS.find((b) => b.id === tab);
  const periodText = `เดือน${monthLabel(month)}`;

  const table = (
    <RankTable
      board={board}
      limit={limit}
      meName={meName}
      showLevel={tab === "solo"} // กระดานเล่นกับเพื่อนไม่มี "ด่าน"
      emptyIcon={info.icon}
      emptyHint={tab === "solo" ? undefined : "ชวนเพื่อนมาเล่นให้จบหนึ่งเกม แล้วคะแนนจะขึ้นกระดานนี้เอง!"}
      emptyText={`ยังไม่มีใครติดอันดับ${periodText}`}
    />
  );

  return (
    <>
      <div className="board-panel__head">
        <h2 className="panel__title board-panel__title">
          <Icon name="trophy" size={28} /> Leaderboard
        </h2>
        <div className="board-panel__picker">
          <label className="field__label board-panel__label" htmlFor="lb-month">
            MONTH
          </label>
          <select
            id="lb-month"
            className="input board-panel__select"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            {months.map((key) => (
              <option key={key} value={key}>
                {monthLabel(key)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="board-tabs" role="tablist" aria-label="กระดานคะแนน">
        {BOARDS.map((b) => (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={tab === b.id}
            className={tab === b.id ? "board-tab board-tab--active" : "board-tab"}
            onClick={() => setTab(b.id)}
          >
            <Icon name={b.icon} size={20} /> {b.label}
          </button>
        ))}
      </div>

      <p className="hint-text">
        {info.note} · {periodText} · {limit} อันดับแรก
      </p>

      {/* หน้าแรก: ตารางเลื่อนภายในกรอบ (scroll) · หน้าเต็ม: ให้หน้าเลื่อนตามปกติ */}
      {scroll ? <div className="board-panel__scroll">{table}</div> : table}
    </>
  );
}
