import Logo from "../components/Logo";
import Ribbon from "../components/Ribbon";
import LeaderboardPanel from "../components/LeaderboardPanel";
import { Icon } from "../components/Icons";

// หน้า Leaderboard เต็ม (ข้อ 6) — เนื้อในเหมือนการ์ดในหน้าแรก (ใช้ LeaderboardPanel ร่วมกัน)
// หน้านี้เปิดได้ด้วย URL /leaderboard ตรง ๆ (หน้าแรกโชว์ตัวเต็มในการ์ดขวาแล้ว จึงไม่มีลิงก์ "ดูทั้งหมด" อีก)
export default function Leaderboard({ onBack, initialBoard }) {
  return (
    <div className="screen">
      <Logo />
      <Ribbon tone="blue">LEADERBOARD</Ribbon>

      <section className="panel board-panel">
        <LeaderboardPanel key={initialBoard || "classic"} limit={20} initialBoard={initialBoard} />

        <button type="button" className="btn btn--wide board-panel__back" onClick={onBack}>
          <Icon name="arrowL" size={14} /> กลับหน้าแรก
        </button>
      </section>
    </div>
  );
}
