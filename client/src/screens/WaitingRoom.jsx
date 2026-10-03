import { useState } from "react";
import { socket } from "../socket";
import Avatar from "../components/Avatar";
import Logo from "../components/Logo";
import LobbyChat from "../components/LobbyChat";
import { AudioButtons } from "../components/AudioDock";
import { MascotNote } from "../components/Mascot";
import { InfoModal } from "../components/TopIcons";
import YouTag from "../components/YouTag";
import { markRulesSeen, rulesSeen } from "../prefs";
import { Icon } from "../components/Icons";
import { copyText, inviteUrl } from "../invite";
import ChallengeCards from "../components/ChallengeCards";
import { ROOM_DIFFICULTY_CHOICES, MAX_PLAYER_CHOICES, DEFAULT_MAX_PLAYERS, VISIBILITY_CHOICES, DEFAULT_CHALLENGES } from "../roomOptions";

// ค่าที่ server ยอมรับ ตาม events.md (ค่าอื่น server จะเมิน)
const ROUND_CHOICES = [1, 2, 3, 4, 5];
const TIME_CHOICES = [30, 45, 60, 90];
const TEAMS = ["A", "B"];
const TEAM_MIN = 2; // โหมดทีมต้องมีทีมละอย่างน้อย 2 คน (server เช็คซ้ำ)

export default function WaitingRoom({ room, me, messages = [], onSend, onLeave }) {
  const [linkCopied, setLinkCopied] = useState(false);
  // กล่องกติกาโชว์เองครั้งแรกที่เข้าห้อง (จำไว้ในเบราว์เซอร์) ครั้งต่อไปกดดูเองได้จากปุ่ม ℹ️ ในหน้าเกม
  const [showRules, setShowRules] = useState(() => !rulesSeen());
  const [showTeamRules, setShowTeamRules] = useState(false); // กติกาโหมดทีม (เดิมเป็นกล่องยาวกินที่ ตอนนี้เปิดจากปุ่ม)
  const isHost = room.hostId === me?.playerId;
  const teamMode = room.settings.mode === "team";
  const teamSize = (t) => room.players.filter((p) => p.team === t).length;
  const teamsReady = TEAMS.every((t) => teamSize(t) >= TEAM_MIN);
  const myTeam = room.players.find((p) => p.id === me?.playerId)?.team ?? null;
  const myReady = room.players.find((p) => p.id === me?.playerId)?.ready ?? false;
  // ผู้เล่นคนอื่น (ไม่ใช่หัวห้อง) ต้องกด Ready ครบทุกคน หัวห้องจึงเริ่มได้ (หัวห้องไม่ต้องกด)
  const others = room.players.filter((p) => p.id !== room.hostId);
  const allReady = others.length > 0 && others.every((p) => p.ready);
  const enoughPlayers = teamMode ? teamsReady : room.players.length >= 2;
  const canStart = enoughPlayers && allReady;

  // ลิงก์เชิญ: เพื่อนเปิดแล้วหน้าแรกเติมรหัสห้องให้เอง
  async function copyLink() {
    if (await copyText(inviteUrl(room.code))) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    }
  }


  const modeChoices = [
    ["classic", "แข่งเดี่ยว"],
    ["team", "ทีม A vs B"],
  ];

  // แก้ตั้งค่าได้เฉพาะหัวห้อง — server เช็คซ้ำอีกชั้นเสมอ
  // ส่งไปทั้งก้อนตามหน้าตาใน events.md
  function changeSetting(patch) {
    if (isHost) socket.emit("update_settings", { ...room.settings, ...patch });
  }

  function renderPlayer(player) {
    const isMe = player.id === me?.playerId;
    return (
      <div
        key={player.id}
        className={`lb-player${isMe ? " lb-player--me" : ""}${player.connected === false ? " lb-player--away" : ""}`}
      >
        <Avatar index={player.avatar} />
        <span className="lb-player__info">
          <span className="lb-player__name">
            {player.name}
            {player.connected === false && <small> (หลุด กำลังรอ...)</small>}
          </span>
          <span className="lb-player__score">{player.score ?? 0} คะแนน</span>
        </span>
        {isMe && <YouTag />}
        {player.id === room.hostId ? (
          <span title="หัวห้อง" aria-label="หัวห้อง">
            <Icon name="crown" size={22} />
          </span>
        ) : (
          <span className={`ready-badge ready-badge--${player.ready ? "on" : "off"}`}>
            {player.ready ? "พร้อม" : "รอ"}
          </span>
        )}
        {/* หัวห้องเตะคนอื่นได้ (server ตรวจซ้ำว่าเป็นหัวห้อง) */}
        {isHost && !isMe && (
          <button
            type="button"
            className="kick-btn"
            aria-label={`เตะ ${player.name} ออกจากห้อง`}
            title="เตะออกจากห้อง"
            onClick={() => socket.emit("kick_player", { playerId: player.id })}
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </div>
    );
  }

  // กล่องย่อยของการ์ดตั้งค่า (มีเลขกำกับ) — คนที่ไม่ใช่หัวห้องกดไม่ได้
  function Choice({ no, title, className = "", label, choices, value, onChange }) {
    return (
      <div className={`lb-set ${className}`}>
        <span className="lb-set__label">
          <b>{no}</b> {title}
        </span>
        <div className="lb-seg" role="group" aria-label={label}>
          {choices.map(([v, text]) => (
            <button
              key={String(v)}
              type="button"
              className={value === v ? "seg seg--active" : "seg"}
              aria-pressed={value === v}
              disabled={!isHost}
              onClick={() => onChange(v)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const s = room.settings;
  const note = isHost
    ? !enoughPlayers
      ? teamMode
        ? `ต้องมีทีมละอย่างน้อย ${TEAM_MIN} คน (ตอนนี้ A ${teamSize("A")} · B ${teamSize("B")})`
        : "ต้องมีผู้เล่นอย่างน้อย 2 คนจึงเริ่มได้"
      : !allReady
        ? 'รอผู้เล่นคนอื่นกด "พร้อม" ให้ครบ'
        : "ทุกคนพร้อมแล้ว เริ่มเกมได้เลย!"
    : teamMode && !teamsReady
      ? `โหมดทีมต้องมีทีมละอย่างน้อย ${TEAM_MIN} คน`
      : "รอหัวห้องเริ่มเกม";

  return (
    <div className="screen screen--lb">
      {/* แถบบนเล็ก: ซ้ายโลโก้+รหัสห้อง · ขวาเสียง ชื่อเรา ออกจากห้อง */}
      <header className="lb-top">
        <Logo />
        <span className="lb-top__code">ห้อง {room.code}</span>
        <span className="lb-top__spacer" />
        <AudioButtons />
        <span className="lb-top__me">
          <Avatar index={me?.avatar ?? 0} />
          <span className="lb-top__name">{me?.name}</span>
        </span>
        <button type="button" className="btn btn--danger lb-top__leave" onClick={onLeave}>
          <Icon name="door" size={18} /> ออกจากห้อง
        </button>
      </header>

      <main className="lb-box" aria-label="ห้องรอ">
        <div className="lb-box__head">
          <button type="button" className="lb-codechip" onClick={copyLink} aria-label={`คัดลอกลิงก์เชิญห้อง ${room.code}`}>
            <span className="lb-codechip__tag">รหัสห้อง</span>
            <b>{room.code}</b>
            <Icon name="share" size={20} />
          </button>
          <button type="button" className="btn lb-box__invite" onClick={copyLink}>
            {linkCopied ? "คัดลอกลิงก์แล้ว!" : "คัดลอกลิงก์เชิญ"}
          </button>
          <span className="lb-box__spacer" />
          <span className={`lb-vis lb-vis--${s.visibility === "public" ? "pub" : "priv"}`}>
            {s.visibility === "public" ? "ห้อง Public" : "ห้อง Private"}
          </span>
        </div>

        <div className="lb-cols">
          {/* ── ซ้าย: ตั้งค่าเกม · Mini Challenge ── */}
          <div className="lb-left">
            <section className="lb-card lb-settings" aria-label="ตั้งค่าเกม">
              <div className="lb-card__head">
                <h2 className="lb-card__title">ตั้งค่าเกม</h2>
                {!isHost && <span className="lb-count">ดูอย่างเดียว</span>}
              </div>
              <div className="lb-settings__grid">
                <Choice no="1" title="โหมด" label="โหมดเกม" choices={modeChoices} value={s.mode} onChange={(mode) => changeSetting({ mode })} />
                <Choice no="2" title="เวลาต่อตา (วิ)" label="เวลาวาดต่อตา" choices={TIME_CHOICES.map((n) => [n, n])} value={s.drawTime} onChange={(drawTime) => changeSetting({ drawTime })} />
                <Choice no="3" title="จำนวนรอบ" label="จำนวนรอบ" choices={ROUND_CHOICES.map((n) => [n, n])} value={s.rounds} onChange={(rounds) => changeSetting({ rounds })} />
                <Choice no="4" title="ความยากของคำ" label="ระดับความยากของคำ" choices={ROOM_DIFFICULTY_CHOICES} value={s.difficulty} onChange={(difficulty) => changeSetting({ difficulty })} />
                <Choice no="5" title="จำนวนผู้เล่นสูงสุด" label="จำนวนผู้เล่นสูงสุด" choices={MAX_PLAYER_CHOICES.map((n) => [n, n])} value={s.maxPlayers ?? DEFAULT_MAX_PLAYERS} onChange={(maxPlayers) => changeSetting({ maxPlayers })} />
                <Choice no="6" title="ประเภทห้อง" label="ประเภทห้อง" choices={VISIBILITY_CHOICES} value={s.visibility} onChange={(visibility) => changeSetting({ visibility })} />
              </div>
            </section>
            <ChallengeCards enabled={s.challenges ?? DEFAULT_CHALLENGES} isHost={isHost} />
          </div>

          {/* ── ขวา: รายชื่อผู้เล่น + ปุ่ม · แชท ── */}
          <div className="lb-right">
            <section className="lb-card lb-roster" aria-label="ผู้เล่น">
              <div className="lb-card__head">
                <h2 className="lb-card__title">
                  <Icon name="users" size={22} /> ผู้เล่น
                </h2>
                <span className="lb-count">
                  {room.players.length}/{s.maxPlayers ?? DEFAULT_MAX_PLAYERS} คน
                </span>
                {teamMode && (
                  <button type="button" className="btn lb-rules-btn" onClick={() => setShowTeamRules(true)}>
                    <Icon name="info" size={16} /> กติกาทีม
                  </button>
                )}
              </div>

              <div className="lb-roster__list">
                {teamMode ? (
                  <div className="lb-teams">
                    {TEAMS.map((t) => (
                      <section className={`team-col team-col--${t}`} key={t} aria-label={`ทีม ${t}`}>
                        <h3 className="team-col__title">
                          <span>ทีม {t}{myTeam === t ? " (ทีมคุณ)" : ""}</span>
                          <span className="team-col__count">{teamSize(t)} คน</span>
                        </h3>
                        <div className="lb-plist">
                          {room.players.filter((p) => p.team === t).map(renderPlayer)}
                          {teamSize(t) === 0 && <p className="team-col__empty">ยังไม่มีใคร</p>}
                        </div>
                        {myTeam !== t && (
                          <button type="button" className="btn team-col__join" onClick={() => socket.emit("set_team", { team: t })}>
                            ย้ายมาทีม {t}
                          </button>
                        )}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="lb-plist">{room.players.map(renderPlayer)}</div>
                )}
                {/* คนยังน้อย = มาสคอตตัวเล็กรอเพื่อนในที่ว่างของรายชื่อ */}
                {room.players.length < 4 && !teamMode && (
                  <div className="lb-mascot">
                    <MascotNote mood="wait">{room.players.length < 2 ? "รอเพื่อนเข้าห้อง..." : "รอเพื่อนอีกนิด..."}</MascotNote>
                  </div>
                )}
              </div>

              <div className="lb-roster__foot">
                {isHost ? (
                  <button type="button" className="btn btn--primary lb-bigbtn" disabled={!canStart} onClick={() => socket.emit("start_game")}>
                    เริ่มเกม
                  </button>
                ) : (
                  <button
                    type="button"
                    className={myReady ? "btn btn--ready-on lb-bigbtn" : "btn btn--primary lb-bigbtn"}
                    onClick={() => socket.emit("set_ready", { ready: !myReady })}
                  >
                    {myReady ? "พร้อมแล้ว · กดเพื่อยกเลิก" : "พร้อม"}
                  </button>
                )}
                <p className="lb-roster__note">{note}</p>
              </div>
            </section>

            <LobbyChat messages={messages} meId={me?.playerId} onSend={onSend} />
          </div>
        </div>
      </main>

      {showRules && (
        <InfoModal
          onClose={() => {
            markRulesSeen();
            setShowRules(false);
          }}
        />
      )}
      {showTeamRules && <InfoModal teamMode onClose={() => setShowTeamRules(false)} />}
    </div>
  );
}
