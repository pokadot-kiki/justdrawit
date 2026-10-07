import { useEffect, useState } from "react";
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
import { errorText } from "../messages";
import { ROOM_DIFFICULTY_CHOICES, MAX_PLAYER_CHOICES, DEFAULT_MAX_PLAYERS, VISIBILITY_CHOICES, DEFAULT_CHALLENGES } from "../roomOptions";

// ค่าที่ server ยอมรับ ตาม events.md (ค่าอื่น server จะเมิน)
const ROUND_CHOICES = [1, 2, 3, 4, 5];
const TIME_CHOICES = [30, 45, 60, 90];
const TEAM_CODES = ["A", "B", "C", "D"]; // รหัสทีมข้างใน คงที่เสมอ — ชื่อที่โชว์มาจาก room.settings.teamNames
const TEAM_COUNT_CHOICES = [2, 3, 4];
const TEAM_MIN = 2; // โหมดทีมต้องมีทีมละอย่างน้อย 2 คน (server เช็คซ้ำ)
const TEAM_NAME_MAX = 16;
const TEAM_BALANCE_MAX_DIFF = 1; // ทีมใหญ่สุดกับเล็กสุดห่างกันได้ไม่เกินเท่านี้คน (server เช็คซ้ำเสมอ)

export default function WaitingRoom({ room, me, messages = [], onSend, onLeave, onToast }) {
  const [linkCopied, setLinkCopied] = useState(false);
  // กล่องกติกาโชว์เองครั้งแรกที่เข้าห้อง (จำไว้ในเบราว์เซอร์) ครั้งต่อไปกดดูเองได้จากปุ่ม ℹ️ ในหน้าเกม
  const [showRules, setShowRules] = useState(() => !rulesSeen());
  const [showTeamRules, setShowTeamRules] = useState(false); // กติกาโหมดทีม (เดิมเป็นกล่องยาวกินที่ ตอนนี้เปิดจากปุ่ม)
  const [editingTeam, setEditingTeam] = useState(null); // รหัสทีมที่กำลังแก้ชื่ออยู่ (null = ไม่มี)
  const [editValue, setEditValue] = useState("");
  const isHost = room.hostId === me?.playerId;
  const teamMode = room.settings.mode === "team";
  const teams = TEAM_CODES.slice(0, room.settings.teamCount ?? 2);
  const teamNames = room.settings.teamNames || {};
  const teamLabel = (t) => teamNames[t] || `ทีม ${t}`;
  const teamSize = (t) => room.players.filter((p) => p.team === t).length;
  const teamsReady = teams.every((t) => teamSize(t) >= TEAM_MIN);
  const myTeam = room.players.find((p) => p.id === me?.playerId)?.team ?? null;
  // ทีมใหญ่สุดกับเล็กสุดห่างกันไม่เกิน 1 คนไหม (server เช็คซ้ำเสมอ ฝั่งนี้แค่ช่วยโชว์เหตุผล/ปิดปุ่ม)
  const teamSizes = teams.map(teamSize);
  const teamsBalanced = teamSizes.length === 0 || Math.max(...teamSizes) - Math.min(...teamSizes) <= TEAM_BALANCE_MAX_DIFF;

  // ย้ายทีมเอง (ปุ่ม "ย้ายมาทีม X") ได้ไหม: ต้องเป็นทีมที่คนน้อยกว่าทีมตัวเองเท่านั้น และย้ายแล้วทุกทีมยังห่างกันไม่เกิน 1
  function canMoveTo(t) {
    if (myTeam == null) return true;
    const counts = Object.fromEntries(teams.map((x) => [x, teamSize(x)]));
    if (!(counts[t] < counts[myTeam])) return false;
    const sim = { ...counts };
    sim[myTeam]--;
    sim[t]++;
    const vals = Object.values(sim);
    return Math.max(...vals) - Math.min(...vals) <= TEAM_BALANCE_MAX_DIFF;
  }

  // ── ขอสลับตัวกับคนทีมอื่น ──
  const [incomingSwap, setIncomingSwap] = useState(null); // { fromId, fromName, expiresAt } — คำขอที่มีคนส่งมาหาเรา
  const [pendingSwapTo, setPendingSwapTo] = useState(null); // playerId ที่เรากำลังรอคำตอบอยู่
  useEffect(() => {
    const onSwapRequest = (data) => setIncomingSwap(data);
    const onSwapResult = (data) => {
      if (data.fromId !== me?.playerId && data.targetId !== me?.playerId) return;
      setIncomingSwap((cur) => (cur && cur.fromId === data.fromId ? null : cur));
      setPendingSwapTo((cur) => (cur === data.targetId || cur === data.fromId ? null : cur));
      const otherName = data.fromId === me?.playerId ? data.targetName : data.fromName;
      if (onToast) {
        if (data.accepted === true) onToast(`สลับทีมกับ ${otherName} แล้ว`);
        else if (data.accepted === null) onToast(`คำขอสลับตัวกับ ${otherName} หมดอายุแล้ว`);
        else if (data.fromId === me?.playerId) onToast(`${otherName} ปฏิเสธคำขอสลับตัว`);
      }
    };
    socket.on("swap_request", onSwapRequest);
    socket.on("swap_result", onSwapResult);
    return () => {
      socket.off("swap_request", onSwapRequest);
      socket.off("swap_result", onSwapResult);
    };
  }, [me?.playerId, onToast]);

  function requestSwap(targetId) {
    setPendingSwapTo(targetId);
    socket.timeout(4000).emit("request_swap", { targetId }, (err, res) => {
      if (err || !res?.ok) {
        setPendingSwapTo(null);
        if (onToast) onToast(errorText(res?.error ?? "SERVER_ERROR"));
      }
    });
  }

  function respondSwap(accept) {
    const req = incomingSwap;
    setIncomingSwap(null);
    socket.timeout(4000).emit("respond_swap", { accept }, (err, res) => {
      if ((err || !res?.ok) && onToast) onToast(errorText(res?.error ?? "SERVER_ERROR"));
      if (err || !res?.ok) setIncomingSwap(req); // ตอบไม่สำเร็จจริงๆ (เช่นต่อ server ไม่ติด) เอากลับมาให้ลองใหม่
    });
  }

  // แก้ชื่อทีม: เฉพาะสมาชิกของทีมนั้นเอง หัวห้องไม่มีสิทธิ์พิเศษเรื่องนี้เลย (เปลี่ยนจากรอบก่อน) · server ตรวจซ้ำอีกชั้นเสมอ (ยาว 1-16 ไม่ซ้ำ ไม่มีอักขระควบคุม ไม่มีคำไม่เหมาะสม)
  const canRenameTeam = (t) => myTeam === t;
  function startEditTeam(t) {
    setEditingTeam(t);
    setEditValue(teamNames[t] || `ทีม ${t}`);
  }
  function submitEditTeam(t) {
    const name = editValue.trim();
    if (name && name !== teamNames[t]) socket.emit("set_team_name", { team: t, name });
    setEditingTeam(null);
  }
  const myReady = room.players.find((p) => p.id === me?.playerId)?.ready ?? false;
  // ผู้เล่นคนอื่น (ไม่ใช่หัวห้อง) ต้องกด Ready ครบทุกคน หัวห้องจึงเริ่มได้ (หัวห้องไม่ต้องกด)
  const others = room.players.filter((p) => p.id !== room.hostId);
  const allReady = others.length > 0 && others.every((p) => p.ready);
  const enoughPlayers = teamMode ? teamsReady : room.players.length >= 2;
  const canStart = enoughPlayers && allReady && (!teamMode || teamsBalanced);

  // ลิงก์เชิญ: เพื่อนเปิดแล้วหน้าแรกเติมรหัสห้องให้เอง
  async function copyLink() {
    if (await copyText(inviteUrl(room.code))) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    }
  }


  const modeChoices = [
    ["classic", "แข่งเดี่ยว"],
    ["team", "แข่งทีม"],
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
        {/* ขอสลับตัวกับคนทีมอื่น — คนละหนึ่งคำขอค้าง (ปุ่มกดไม่ได้ถ้ากำลังรอคำตอบของคำขออื่นอยู่) */}
        {teamMode && !isMe && myTeam != null && player.team !== myTeam && (
          <button
            type="button"
            className="swap-btn"
            disabled={pendingSwapTo != null || incomingSwap != null}
            aria-label={pendingSwapTo === player.id ? `รอ ${player.name} ตอบคำขอสลับตัว` : `ขอสลับตัวกับ ${player.name}`}
            title={pendingSwapTo === player.id ? "รอคำตอบ..." : `ขอสลับตัวกับ ${player.name}`}
            onClick={() => requestSwap(player.id)}
          >
            <Icon name="redo" size={14} />
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
        ? `ต้องมีทีมละอย่างน้อย ${TEAM_MIN} คน (ตอนนี้ ${teams.map((t) => `${teamLabel(t)} ${teamSize(t)}`).join(" · ")})`
        : "ต้องมีผู้เล่นอย่างน้อย 2 คนจึงเริ่มได้"
      : teamMode && !teamsBalanced
        ? "ทีมยังไม่สมดุล (ต่างกันเกิน 1 คน) — กดปุ่ม \"จัดทีมให้สมดุล\" หรือย้ายคนเอง"
        : !allReady
          ? 'รอผู้เล่นคนอื่นกด "พร้อม" ให้ครบ'
          : "ทุกคนพร้อมแล้ว เริ่มเกมได้เลย!"
    : teamMode && !teamsReady
      ? `โหมดทีมต้องมีทีมละอย่างน้อย ${TEAM_MIN} คน`
      : teamMode && !teamsBalanced
        ? "ทีมยังไม่สมดุล (ต่างกันเกิน 1 คน) รอหัวห้องจัดทีมให้สมดุล"
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
                <div className="lb-set">
                  <span className="lb-set__label">
                    <b>1</b> โหมด
                  </span>
                  <div className="lb-seg" role="group" aria-label="โหมดเกม">
                    {modeChoices.map(([v, text]) => (
                      <button
                        key={v}
                        type="button"
                        className={s.mode === v ? "seg seg--active" : "seg"}
                        aria-pressed={s.mode === v}
                        disabled={!isHost}
                        onClick={() => changeSetting({ mode: v })}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  {/* จำนวนทีม (2-4) — เฉพาะโหมดแข่งทีม · server บังคับ maxPlayers >= 2 × จำนวนทีมเสมอ ค่าที่ขัดกันถูกเมิน */}
                  {teamMode && (
                    <div className="lb-seg lb-seg--sub" role="group" aria-label="จำนวนทีม">
                      {TEAM_COUNT_CHOICES.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={(s.teamCount ?? 2) === n ? "seg seg--active" : "seg"}
                          aria-pressed={(s.teamCount ?? 2) === n}
                          disabled={!isHost}
                          onClick={() => changeSetting({ teamCount: n })}
                        >
                          {n} ทีม
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                {teamMode && isHost && !teamsBalanced && (
                  <button type="button" className="btn lb-rules-btn" onClick={() => socket.emit("balance_teams")}>
                    <Icon name="users" size={16} /> จัดทีมให้สมดุล
                  </button>
                )}
                {teamMode && (
                  <button type="button" className="btn lb-rules-btn" onClick={() => setShowTeamRules(true)}>
                    <Icon name="info" size={16} /> กติกาทีม
                  </button>
                )}
              </div>

              {/* มีคนขอสลับตัวกับเรา — ต้องตอบก่อนหมดเวลา 20 วิ ไม่งั้น server ยกเลิกให้เอง */}
              {incomingSwap && (
                <div className="lb-swap-banner" role="alert">
                  <span>
                    <b>{incomingSwap.fromName}</b> ขอสลับตัวกับคุณ
                  </span>
                  <span className="lb-swap-banner__actions">
                    <button type="button" className="btn btn--primary" onClick={() => respondSwap(true)}>
                      รับ
                    </button>
                    <button type="button" className="btn" onClick={() => respondSwap(false)}>
                      ปฏิเสธ
                    </button>
                  </span>
                </div>
              )}

              <div className="lb-roster__list">
                {teamMode ? (
                  <div className="lb-teams" style={{ "--team-cols": teams.length }}>
                    {teams.map((t) => (
                      <section className={`team-col team-col--${t}`} key={t} aria-label={teamLabel(t)}>
                        <h3 className="team-col__title">
                          {editingTeam === t ? (
                            <input
                              className="team-col__name-input"
                              autoFocus
                              maxLength={TEAM_NAME_MAX}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => submitEditTeam(t)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") submitEditTeam(t);
                                if (e.key === "Escape") setEditingTeam(null);
                              }}
                            />
                          ) : (
                            <span className="team-col__name" title={teamLabel(t)}>
                              {teamLabel(t)}
                              {myTeam === t ? " (ทีมคุณ)" : ""}
                              {canRenameTeam(t) && (
                                <button
                                  type="button"
                                  className="team-col__rename"
                                  aria-label={`เปลี่ยนชื่อ${teamLabel(t)}`}
                                  title="เปลี่ยนชื่อทีม"
                                  onClick={() => startEditTeam(t)}
                                >
                                  <Icon name="pen" size={13} />
                                </button>
                              )}
                            </span>
                          )}
                          <span className="team-col__count">{teamSize(t)} คน</span>
                        </h3>
                        <div className="lb-plist">
                          {room.players.filter((p) => p.team === t).map(renderPlayer)}
                          {teamSize(t) === 0 && <p className="team-col__empty">ยังไม่มีใคร</p>}
                        </div>
                        {myTeam !== t && (
                          <button
                            type="button"
                            className="btn team-col__join"
                            disabled={!canMoveTo(t)}
                            title={canMoveTo(t) ? "" : "ย้ายได้เฉพาะทีมที่คนน้อยกว่าทีมตัวเอง และห้ามทำให้ทีมต่างกันเกิน 1 คน"}
                            onClick={() => socket.emit("set_team", { team: t })}
                          >
                            ย้ายมา{teamLabel(t)}
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
