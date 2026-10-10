import { useState } from "react";
import Ribbon from "../components/Ribbon";
import Critter from "../components/Critter";
import { randomName } from "../playerName";
import { AvatarArt, Icon } from "../components/Icons";
import { useEnterRoom } from "../hooks/useEnterRoom";
import OptionRow from "../components/OptionRow";
import { DIFFICULTY_CHOICES, ROOM_DIFFICULTY_CHOICES, VISIBILITY_CHOICES, TEAM_COUNT_CHOICES, TEAM_CAPACITY } from "../roomOptions";

// หน้า SET UP (กดสร้างห้องแล้วมาหน้านี้): ซ้าย แผงตั้งค่า · ขวาบน การ์ดแข่งเดี่ยว/แข่งทีมคู่กัน
// · ขวาล่าง กล่องใหญ่ "แข่งกับ AI" (ข้างในมีการ์ด SOLO VS AI กับ MULTIPLAYER VS AI) · ล่าง ปุ่มสร้างห้อง/เริ่มเกม (ตามภาพ setup-screen.png)
// ค่าที่เลือกส่งไปกับ create_room (events.md §1) server เช็คซ้ำ ค่าไม่ถูกจะใช้ค่าเริ่มต้น
const ROUND_CHOICES = [1, 2, 3, 4, 5];
const TIME_CHOICES = [30, 45, 60, 90];

// ตัวเลขของโหมด Solo ที่โชว์ในกล่องข้อมูล — คัดลอกมาจากค่าจริงที่ server ใช้ ห้ามเดา/คิดเอง
// SOLO_LIVES (server/index.js) และ LEVEL_TIME + "ยากขึ้นทุก 2 ด่าน" (server/ai.js levelConfig) ถ้าแก้ตัวเลขฝั่ง server ต้องแก้ที่นี่ด้วย
const SOLO_LIVES = 3;
const SOLO_LEVEL_TIME = 60;

// จำนวนผู้เล่นที่โชว์ท้ายการ์ด — ค่าจริงของ server (server/index.js): เริ่มเกมได้เมื่อมี ≥ 2 คน · ห้องละไม่เกิน MAX_PLAYERS = 8
// · โหมดทีมคำนวณจำนวนจากกฎร่วมของ server และ client
const ROOM_MAX_PLAYERS = 8;
const CLASSIC_MIN_PLAYERS = 2;

export default function SetUp({ connected, profile, onBack, onEntered, onError, onStartSolo }) {
  const [mode, setMode] = useState("classic"); // classic | team | mpai (Multiplayer vs AI สร้างห้อง) | ai (ai = Solo แข่งกับ AI ไม่สร้างห้อง)
  const [rounds, setRounds] = useState(3);
  const [drawTime, setDrawTime] = useState(60);
  // จำนวนทีมเลือกในห้องรอ ไม่ตั้งที่นี่แล้ว — ห้องเริ่มที่จำนวนทีมต่ำสุดตามกฎร่วม
  const [difficulty, setDifficulty] = useState("mixed"); // ชุดคำของห้อง (ไม่เกี่ยวกับเวลา) · mixed ใช้ได้เฉพาะห้อง
  // ระดับเริ่มต้นของ Solo แยกจาก difficulty ของห้องโดยเจตนา (คนละความหมาย: ห้องคือ "ชุดคำทั้งเกม"
  // ส่วน Solo คือ "จุดเริ่มต้น" แล้วยากขึ้นเอง) สลับไปมาระหว่างโหมดจึงจำค่าของแต่ละฝั่งไว้คนละตัว ไม่ทับกัน
  const [soloLevel, setSoloLevel] = useState("easy");
  const [visibility, setVisibility] = useState("private");
  // Challenge เลือกเปิด/ปิดทีละใบในห้องรอ (การ์ด 4 ใบ) ไม่ตั้งที่นี่แล้ว — ห้องเริ่มด้วยชุดเริ่มต้นของ server
  const { busy, enter } = useEnterRoom({ connected, onEntered, onError });
  const { name, avatar } = profile;

  const isAI = mode === "ai";

  function submit() {
    if (isAI) {
      // โหมดแข่งกับ AI: ไม่สร้างห้อง เข้าเกม Solo ทันทีด้วยระดับเริ่มต้นที่เลือก
      onStartSolo(soloLevel);
      return;
    }
    const who = name.trim() || randomName(); // กันกรณีชื่อว่าง
    enter(
      "create_room",
      { name: who, avatar, mode, rounds, drawTime, difficulty, visibility },
      { name: who, avatar }
    );
  }

  return (
    <div className="screen screen--setup">
      <button type="button" className="back-btn" onClick={onBack}>
        <Icon name="arrowL" size={14} /> กลับ
      </button>
      <Ribbon tone="red">SET UP</Ribbon>

      <div className="setup">
        <section className="panel setup__opts deco-host" aria-label="ตั้งค่าห้อง">
          <Critter name="cat" className="crit crit--top-left" />
          <h2 className="panel__title setup__title">ตั้งค่า</h2>
          {/* โหมดแข่งกับ AI ไม่มีรอบ ไม่มีเวลาวาดแบบห้อง (Solo ตายตัว 60 วิ/ด่าน) จึงซ่อนสองช่องนี้ */}
          {!isAI && (
            <div className="setup__opt">
              <h3 className="setup__head">
                <Icon name="flag" size={22} /> จำนวนรอบ
              </h3>
              <div className="segmented" role="group" aria-label="จำนวนรอบ">
                {ROUND_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={rounds === n ? "seg seg--active" : "seg"}
                    aria-pressed={rounds === n}
                    onClick={() => setRounds(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!isAI && (
            <div className="setup__opt">
              <h3 className="setup__head">
                <Icon name="clock" size={22} /> เวลาวาด <small>(วินาที)</small>
              </h3>
              <div className="segmented" role="group" aria-label="เวลาวาดต่อตา">
                {TIME_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={drawTime === n ? "seg seg--active" : "seg"}
                    aria-pressed={drawTime === n}
                    onClick={() => setDrawTime(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
          {isAI ? (
            <div className="setup__opt">
              <h3 className="setup__head">
                <Icon name="star" size={22} /> เริ่มที่ระดับ
              </h3>
              <OptionRow label="เริ่มที่ระดับ" choices={DIFFICULTY_CHOICES} value={soloLevel} onChange={setSoloLevel} />
              <small className="setup__opt-note">คำยากขึ้นเองทุก 2 ด่าน</small>
            </div>
          ) : (
            <div className="setup__opt">
              <h3 className="setup__head">
                <Icon name="star" size={22} /> ความยากของคำ
              </h3>
              <OptionRow label="ระดับความยากของคำ" choices={ROOM_DIFFICULTY_CHOICES} value={difficulty} onChange={setDifficulty} />
            </div>
          )}
          {/* โหมดแข่งกับ AI ไม่ต้องมีห้อง จึงซ่อนตัวเลือกประเภทห้อง แทนด้วยกล่องสรุปกติกา Solo สั้นๆ */}
          {!isAI && (
            <div className="setup__opt">
              <h3 className="setup__head">
                <Icon name="door" size={22} /> ประเภทห้อง
              </h3>
              <OptionRow label="ประเภทห้อง" choices={VISIBILITY_CHOICES} value={visibility} onChange={setVisibility} />
            </div>
          )}
          {isAI && (
            <ul className="setup__ai-facts" aria-label="กติกาโหมด Solo">
              <li>
                <Icon name="heart" size={20} /> {SOLO_LIVES} ชีวิต
              </li>
              <li>
                <Icon name="clock" size={20} /> ด่านละ {SOLO_LEVEL_TIME} วินาที
              </li>
              <li>
                <Icon name="robot" size={20} /> ผลัดกันวาดกับ AI
              </li>
              <li>
                <Icon name="trophy" size={20} /> คะแนนขึ้น Leaderboard
              </li>
            </ul>
          )}
          <p className="setup__note">
            {isAI
              ? "แข่งกับ AI: วาดคนเดียว AI ทายภาพ ความยากของคำใช้ค่าที่เลือกด้านบน"
              : visibility === "public"
                ? "Public: ห้องขึ้นในรายการหน้าแรก ใครก็กดเข้าได้ · Mini Challenge เปิด/ปิดได้ในห้องรอ"
                : "Private: เข้าได้ด้วยรหัสห้องหรือลิงก์เชิญเท่านั้น · Mini Challenge เปิด/ปิดได้ในห้องรอ"}
          </p>
          <p className="setup__who">
            <span className="setup__who-art">
              <AvatarArt index={avatar} size={34} />
            </span>
            <span className="setup__who-text">
              <small>ผู้เล่น</small>
              <span>{name.trim() || "ยังไม่ได้ใส่ชื่อ"}</span>
            </span>
          </p>
        </section>

        <div className="mode-cards deco-host" role="radiogroup" aria-label="โหมดเกม">
          <Critter name="parrot" className="crit crit--top-right" />
          <ModeCard id="classic" mode={mode} onPick={setMode} players={`${CLASSIC_MIN_PLAYERS}–${ROOM_MAX_PLAYERS}`} tag="Free-for-All">
            <span className="mode-card__art" aria-hidden="true">
              <span className="mode-card__tile mode-card__tile--yellow">
                <AvatarArt index={1} size={34} />
              </span>
              <span className="mode-card__tile mode-card__tile--pink">
                <Icon name="house" size={34} />
              </span>
              <span className="mode-card__tile mode-card__tile--green">
                <AvatarArt index={3} size={34} />
              </span>
            </span>
            <span className="mode-card__title">แข่งเดี่ยว</span>
            <span className="mode-card__desc">ทุกคนแข่งกันเอง ผลัดกันวาด คนอื่นพิมพ์ทาย ทายถูกเร็วได้คะแนนเยอะ</span>
          </ModeCard>

          <ModeCard id="team" mode={mode} onPick={setMode} players={`${TEAM_COUNT_CHOICES[0] * TEAM_CAPACITY}–${TEAM_COUNT_CHOICES.at(-1) * TEAM_CAPACITY}`} tag="Team Battle">
            <span className="mode-card__art" aria-hidden="true">
              <span className="mode-card__side mode-card__side--A">
                <AvatarArt index={0} size={30} />
                <AvatarArt index={2} size={30} />
              </span>
              <span className="mode-card__vs">VS</span>
              <span className="mode-card__side mode-card__side--B">
                <AvatarArt index={4} size={30} />
                <AvatarArt index={5} size={30} />
              </span>
            </span>
            <span className="mode-card__title">แข่งทีม</span>
            <span className="mode-card__desc">
              แบ่ง 2–4 ทีม เลือกจำนวนทีมได้ในห้องรอ วาดคำเดียวกันพร้อมกัน ทีมไหนทายถูกก่อนได้โบนัส (ทีมละอย่างน้อย 2 คน)
            </span>
          </ModeCard>

          {/* กล่องใหญ่ "แข่งกับ AI" — SOLO VS AI กับ MULTIPLAYER VS AI (server รองรับแล้ว: server/mp-ai.js · events.md หัวข้อ 10) */}
          <section className="ai-panel" aria-labelledby="ai-panel-title">
            <header className="ai-panel__head">
              <span className="ai-panel__icon" aria-hidden="true">
                <Icon name="robot" size={36} />
              </span>
              <span className="ai-panel__heading">
                <span className="ai-panel__title-row">
                  <span id="ai-panel-title" className="ai-panel__title">แข่งกับ AI</span>
                  <span className="ai-panel__tag">PLAY WITH AI</span>
                </span>
                <span className="ai-panel__sub">เลือกรูปแบบการประลองฝีมือวาดภาพกับ AI</span>
              </span>
            </header>

            {/* สองแบบเคียงกัน (ตามภาพอ้างอิง setup-screen.png): SOLO VS AI (ไม่สร้างห้อง) · MULTIPLAYER VS AI (สร้างห้อง mode "mpai") */}
            <div className="ai-panel__cards">
            <button
              type="button"
              role="radio"
              aria-checked={mode === "ai"}
              className={`mode-card mode-card--ai${mode === "ai" ? " mode-card--active" : ""}`}
              onClick={() => setMode("ai")}
            >
              {mode === "ai" && <SelectedBadge />}
              <span className="mode-card__ai-top">
                <span className="mode-card__ai-name">SOLO VS AI</span>
                <span className="mode-card__chip">1 vs 1 Arcade</span>
              </span>
              <span className="mode-card__ai-body">
                <span className="mode-card__duel" aria-hidden="true">
                  <span className="mode-card__fighter">
                    <AvatarArt index={avatar} size={34} />
                    <small>คุณ</small>
                  </span>
                  <span className="mode-card__duel-vs">VS</span>
                  <span className="mode-card__fighter">
                    <Icon name="robot" size={34} />
                    <small>AI Bot</small>
                  </span>
                </span>
                <span className="mode-card__ai-text">
                  <span className="mode-card__title">เล่นคนเดียว แข่งกับ AI</span>
                  <span className="mode-card__desc">ไม่ต้องรอใคร พร้อมเมื่อไหร่ก็เริ่มได้ทันที</span>
                  <span className="mode-card__points">
                    <span>คุณวาด AI ทาย / AI วาด คุณทาย ผลัดกันทุกด่าน</span>
                    <span>ออกแบบสำหรับผู้เล่น 1 คน</span>
                    <span>บันทึกคะแนนขึ้น Leaderboard กระดาน Solo</span>
                  </span>
                </span>
              </span>
            </button>

            {/* Multiplayer vs AI: สร้างห้องเหมือนแข่งเดี่ยว จึงใช้แผงตั้งค่าห้องฝั่งซ้ายชุดเดียวกัน (รอบ/เวลา/ความยาก/ประเภทห้อง)
                แข่งกันรายคน (ไม่ใช่ทีม) — จำนวนผู้เล่นใช้ค่าคงที่เดียวกับการ์ดแข่งเดี่ยว (ค่าจริงของ server) */}
            <button
              type="button"
              role="radio"
              aria-checked={mode === "mpai"}
              className={`mode-card mode-card--ai mode-card--mpai${mode === "mpai" ? " mode-card--active" : ""}`}
              onClick={() => setMode("mpai")}
            >
              {mode === "mpai" && <SelectedBadge />}
              <span className="mode-card__ai-top">
                <span className="mode-card__ai-name mode-card__ai-name--mp">MULTIPLAYER VS AI</span>
                <span className="mode-card__chip">เล่นกับเพื่อนในห้องเดียวกัน</span>
              </span>
              <span className="mode-card__ai-body">
                <span className="mode-card__duel" aria-hidden="true">
                  <span className="mode-card__fighter">
                    <span className="mode-card__crowd">
                      <AvatarArt index={avatar} size={28} />
                      <AvatarArt index={3} size={28} />
                    </span>
                    <small>เพื่อนในห้อง</small>
                  </span>
                  <span className="mode-card__duel-vs mode-card__duel-vs--mp">VS</span>
                  <span className="mode-card__fighter">
                    <Icon name="robot" size={34} />
                    <small>AI</small>
                  </span>
                </span>
                <span className="mode-card__ai-text">
                  <span className="mode-card__title">สร้างห้อง ชวนเพื่อนมาแข่งกับ AI</span>
                  <span className="mode-card__desc">
                    {CLASSIC_MIN_PLAYERS}–{ROOM_MAX_PLAYERS} คนในห้องเดียว แข่งกันเก็บคะแนนรายคน
                  </span>
                  <span className="mode-card__points">
                    <span>ทุกคนวาดคำเดียวกัน AI ให้คะแนนภาพตามความมั่นใจ</span>
                    <span>เปิดแกลเลอรีดูภาพทุกคน แล้ว AI วาดให้ทุกคนทายแยกกัน</span>
                    <span>บันทึกคะแนนขึ้น Leaderboard กระดานเล่นกับเพื่อน</span>
                  </span>
                </span>
              </span>
            </button>
            </div>
          </section>
        </div>
      </div>

      <button type="button" className="big-btn big-btn--green setup__create" disabled={!connected || busy} onClick={submit}>
        <Icon name={isAI ? "robot" : "star"} size={28} />
        <span>{isAI ? "เริ่มเกม" : busy ? "กำลังสร้าง..." : "สร้างห้อง"}</span>
      </button>
    </div>
  );
}

// ป้าย "เลือกอยู่" มุมขวาบนของการ์ดที่เลือก
function SelectedBadge() {
  return (
    <span className="mode-card__badge">
      <Icon name="check" size={14} /> เลือกอยู่
    </span>
  );
}

// การ์ดโหมดห้อง (แข่งเดี่ยว/แข่งทีม): รูป ชื่อ คำอธิบาย แล้วท้ายการ์ดเป็นจำนวนผู้เล่นกับป้ายชื่อโหมด
function ModeCard({ id, mode, onPick, players, tag, children }) {
  const active = mode === id;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={`mode-card mode-card--${id}${active ? " mode-card--active" : ""}`}
      onClick={() => onPick(id)}
    >
      {active && <SelectedBadge />}
      {children}
      <span className="mode-card__foot">
        <span>ผู้เล่น {players} คน</span>
        <span className="mode-card__chip">{tag}</span>
      </span>
    </button>
  );
}
