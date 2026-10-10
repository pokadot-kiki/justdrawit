import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { socket } from "../socket";
import Timer from "../components/Timer";
import TimeBar from "../components/TimeBar";
import HintSlots from "../components/HintSlots";
import Canvas from "../components/Canvas";
import Toolbar from "../components/Toolbar";
import Scoreboard from "../components/Scoreboard";
import Chat from "../components/Chat";
import Modal from "../components/Modal";
import GameOverModal from "../components/GameOverModal";
import { MascotNote } from "../components/Mascot";
import { TopIcons, InfoModal, ExitModal } from "../components/TopIcons";
import { Icon, AvatarArt } from "../components/Icons";
import { play } from "../sound/sfx";
import { clearBoard } from "../canvas/actions";
import { drawingActionsAt } from "../canvas/sharedDrawing";
import { PAINT_COLORS, SIZE_DEFAULT, TOOLS, isShapeTool } from "../canvas/palette";
import { SNAPSHOT_MS, THINK_TIMEOUT_MS } from "../aiSnapshot";
import ChallengeBanner from "../components/ChallengeBanner";
import ChallengeIntro from "../components/ChallengeIntro";
import { galleryLayout } from "../galleryLayout";

const MAX_SIZE = 12; // แปรงหนาเกินทำให้ AI จำภาพไม่ได้ (วัดไว้ตอนทำ Solo) — ช่วยผู้เล่นเท่านั้น ไม่ใช่กติกา
const STATUS_TEXT = { missing: "ไม่ได้ส่งภาพ", error: "AI ดูภาพไม่สำเร็จ", timeout: "AI ใช้เวลานานเกิน" };

const OP_START = new Set(["stroke_start", "fill", "draw_shape", "clear_canvas"]);

/**
 * หน้าเกม Multiplayer vs AI (events.md หัวข้อ 10)
 * ช่วง 1 วาดคำเดียวกันแบบส่วนตัว · ส่ง action ให้ server ตรวจ แล้วขอให้สร้างภาพให้ AI ดูทุก SNAPSHOT_MS
 *        ทายผิด = วาดต่อ · ทายถูก = เสร็จ รอเพื่อน → แกลเลอรี (เมื่อทุกคนเสร็จหรือหมดเวลา)
 * ช่วง 2 ดู AI วาด แล้วทายในแชทร่วมของห้อง (Chat + useGame เดิม) → เฉลย → รอบถัดไป/จบเกม
 * สถานะเกมมาจาก useMpAi (ผูกที่ App) — หน้านี้แค่แสดงผล ส่งภาพ และส่งข้อความ server ตัดสินทั้งหมด
 */
export default function MpAiGame({ room, meId, mp, sendSnapshot, sendGuess, game, startGame, backToLobby, onLeave, onToast }) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState(TOOLS.PEN);
  const [color, setColor] = useState(PAINT_COLORS[0].hex); // เริ่มที่สีดำ (ตัวแรกในพาเลต)
  const [size, setSize] = useState(SIZE_DEFAULT);
  const [hist, setHist] = useState({ undo: false, redo: false });
  const [showInfo, setShowInfo] = useState(false);
  const [showExit, setShowExit] = useState(false);
  // AI กำลังดูภาพอยู่ (เหมือน Solo): ข้ามรอบส่งภาพจนกว่าจะได้คำตอบ/ AI_UNAVAILABLE / เกินเวลา
  const [thinking, setThinking] = useState(false);
  const thinkingRef = useRef(false);
  const thinkTimer = useRef(null);

  const players = room.players;
  const online = players.filter((p) => p.connected !== false).length;
  const watching = mp.phase === "watch" || mp.phase === "watch_end";
  const drawPhase = mp.phase === "draw";
  const myDone = mp.myPoints != null;
  const challenge = mp.challenge;
  const colourFix = challenge?.type === "colour_fix" ? challenge.color : null;
  const noLift = challenge?.type === "dont_lift_pen";
  const shapesOnly = challenge?.type === "shapes_only";
  let drawTool = noLift && (tool === TOOLS.BUCKET || isShapeTool(tool)) ? TOOLS.PEN : tool;
  if (shapesOnly && (drawTool === TOOLS.PEN || drawTool === TOOLS.ERASER)) drawTool = TOOLS.LINE;
  const canDraw = drawPhase && !myDone && !mp.intro && !mp.penLocked && (mp.timeLeft ?? 1) > 0;
  const canClearLocked = noLift && drawPhase && !myDone && !mp.intro && mp.penLocked && (mp.timeLeft ?? 1) > 0;
  const solvedMe = mp.watch?.myPoints != null;

  function setThink(on) {
    thinkingRef.current = on;
    setThinking(on);
    clearTimeout(thinkTimer.current);
    if (on) thinkTimer.current = setTimeout(() => setThink(false), THINK_TIMEOUT_MS);
  }
  // ได้คำทายใหม่ = AI ดูภาพเสร็จแล้ว
  useEffect(() => {
    setThink(false);
    if (mp.myGuesses.at(-1)?.correct) play("aiCorrect"); // เสียงเดียวกับตอน AI ทายถูกใน Solo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mp.myGuesses.length]);
  // AI พัง (error เดียวกับ Solo) → เลิกรอ วาดต่อได้ รอบถัดไปลองใหม่ (ข้อความ Toast ขึ้นจาก App อยู่แล้ว)
  useEffect(() => {
    const onErr = (err) => err?.code === "AI_UNAVAILABLE" && setThink(false);
    socket.on("game_error", onErr);
    return () => {
      socket.off("game_error", onErr);
      clearTimeout(thinkTimer.current);
    };
  }, []);

  // ── ช่วง 1: ขอภาพจาก action ที่ server รับไว้ทุก SNAPSHOT_MS — ข้ามถ้ากระดานว่างหรือ AI ยังคิดอยู่ ──
  function hasInk() {
    return (canvasRef.current?.getActions().length ?? 0) > 0;
  }
  function persistDrawing() {
    if (hasInk()) sendSnapshot();
  }
  useEffect(() => {
    if (!canDraw) return undefined;
    const id = setInterval(() => {
      if (thinkingRef.current) return;
      if (!hasInk()) return;
      setThink(true);
      sendSnapshot();
    }, SNAPSHOT_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDraw, mp.round]);
  // ใกล้หมดเวลา: ส่งภาพล่าสุดให้ server เก็บไว้ (ตอนหมดเวลา AI ได้ดูภาพล่าสุดที่ยังไม่ได้ดูอีกครั้ง)
  useEffect(() => {
    if (canDraw && mp.timeLeft === 1) {
      persistDrawing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mp.timeLeft]);

  function handleAction(action) {
    const { type, ...payload } = action;
    socket.emit(type, payload);
    if (OP_START.has(type)) setHist({ undo: true, redo: false });
    // ส่งเมื่อเส้นจบหรือเครื่องมือแบบคลิกทำงานแล้ว ภาพจึงเป็นภาพที่วาดเสร็จจริง
    if (canDraw && (action.type === "stroke_end" || action.type === "fill" || action.type === "draw_shape" || action.type === "clear_canvas")) {
      queueMicrotask(persistDrawing);
    }
  }
  function undo() {
    socket.emit("undo");
  }
  function redo() {
    socket.emit("redo");
  }
  // รอบใหม่ = กระดานใหม่ (Canvas ถูกสร้างใหม่ด้วย key) → ล้างกองย้อน/สถานะรอ AI
  useEffect(() => {
    setHist({ undo: false, redo: false });
    setThink(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mp.round, watching]);

  useEffect(() => {
    if ((mp.phase !== "draw" && mp.phase !== "eval") || !mp.myCanvas) return;
    canvasRef.current?.applyHistory(mp.myCanvas.items);
    setHist({ undo: mp.myCanvas.canUndo, redo: mp.myCanvas.canRedo });
    if (drawPhase) queueMicrotask(sendSnapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mp.myCanvas, mp.round]);

  // ทุกเฟรมสร้างภาพจากเวลาเริ่มเส้นของ server; ผู้ที่เข้ากลางรอบจึงเห็นภาพ ณ เวลาปัจจุบัน
  useEffect(() => {
    if (!watching || !mp.watch) return;
    let raf = 0;
    const render = () => {
      const board = canvasRef.current;
      if (!board) return;
      const { actions, animating } = drawingActionsAt(mp.watch.strokes, Date.now() - mp.watch.clockOffset);
      board.applyHistory(actions);
      if (animating) raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [watching, mp.round, mp.watch?.strokes, mp.watch?.clockOffset]);

  // เสียง: เราทายถูกในช่วง 2 / เริ่มช่วง / จบเกม
  useEffect(() => {
    if (solvedMe) play("selfCorrect");
  }, [solvedMe]);
  useEffect(() => {
    if (mp.phase === "draw" || mp.phase === "watch") play("roundStart");
  }, [mp.phase, mp.round]);
  useEffect(() => {
    if (game.ranking) play("gameOver");
  }, [game.ranking]);

  const doneIds = watching ? mp.watch?.solvedIds ?? [] : mp.doneIds;
  const live = mp.phase === "draw" || mp.phase === "watch";
  const phaseLabel =
    mp.phase === "over" || game.ranking ? "จบเกม" : watching ? "ช่วง 2 · AI วาด คุณทาย" : "ช่วง 1 · ทุกคนวาด AI ทาย";

  return (
    <div className="screen screen--game">
      <header className="topbar">
        <div className="topbar__who">
          <span className="topbar__label">Multiplayer vs AI</span>
          <span className="topbar__name">{phaseLabel}</span>
        </div>
        <div className="topbar__meta">
          <span className="topbar__round">
            รอบ {mp.round ?? "-"}/{mp.totalRounds ?? room.settings.rounds}
          </span>
          <Timer timeLeft={live ? mp.timeLeft : null} />
        </div>
        <TopIcons onInfo={() => setShowInfo(true)} onExit={() => setShowExit(true)} shareCode={room.code} onToast={onToast} />
      </header>

      <main className={`game mp-ai${drawPhase ? "" : " game--no-tools"}`}>
        <aside className="game__players">
          <div className="game__players-list">
            <Scoreboard players={players} drawerId={null} drawing={false} guessed={doneIds} meId={meId} />
          </div>
          {!watching && (
            <p className="mp-ai__legend">
              <Icon name="check" size={14} /> AI ทายภาพถูกแล้ว
            </p>
          )}
        </aside>

        <section className="game__stage">
          <div className="wordbar">
            <div className="wordbar__side">
              <span className="solo-stage">{watching ? "2/2" : "1/2"}</span>
            </div>
            <div className="wordbar__word">
              {drawPhase || mp.phase === "eval" ? (
                <span className="topbar__real-word" title="คำที่ทุกคนต้องวาด">
                  {mp.word}
                </span>
              ) : mp.phase === "gallery" ? (
                <span className="topbar__real-word">{mp.gallery?.word}</span>
              ) : watching && mp.watch ? (
                mp.watch.hint ? (
                  <HintSlots hint={mp.watch.hint} />
                ) : (
                  <span className="topbar__idle">
                    หมวด: {mp.watch.category || "-"} · คำใบ้ขึ้นเมื่อเหลือ {mp.watch.hintAt} วิ
                  </span>
                )
              ) : (
                <span className="topbar__idle">กำลังเริ่ม...</span>
              )}
            </div>
            <div className="wordbar__side wordbar__side--end">{(drawPhase || mp.phase === "eval") && <ChallengeBanner challenge={challenge} />}</div>
          </div>

          {mp.phase === "gallery" && mp.gallery ? (
            <Gallery gallery={mp.gallery} meId={meId} />
          ) : (
            <Canvas
              key={`${watching ? "w" : "d"}-${mp.round}`}
              ref={canvasRef}
              canDraw={canDraw}
              tool={drawTool}
              color={colourFix ?? color}
              size={Math.min(size, MAX_SIZE)}
              onAction={drawPhase ? handleAction : undefined}
              empty={
                drawPhase ? (
                  <MascotNote mood="draw">วาด “{mp.word}” — ไม่มีใครเห็นจนกว่าจะเปิดแกลเลอรี</MascotNote>
                ) : mp.phase === "watch" ? (
                  <MascotNote mood="wait">ดู AI วาด แล้วพิมพ์ทายในแชทเลย!</MascotNote>
                ) : null
              }
              overlay={
                drawPhase && mp.intro ? <ChallengeIntro challenge={challenge} /> : mp.phase === "eval" ? (
                  <div className="mp-ai__eval" role="status">
                    <Icon name="robot" size={40} />
                    <p>AI กำลังดูภาพสุดท้ายของคนที่ยังไม่ผ่าน</p>
                    <p className="mp-ai__eval-count">
                      {mp.evalDone}/{mp.evalTotal}
                    </p>
                  </div>
                ) : drawPhase && myDone ? (
                  <div className="mp-ai__eval" role="status">
                    <Icon name="check" size={36} />
                    <p>AI ทายภาพคุณถูกแล้ว! +{mp.myPoints}</p>
                    <p>
                      รอเพื่อน ({mp.doneIds.length}/{online})
                    </p>
                  </div>
                ) : null
              }
            />
          )}

          <TimeBar timeLeft={live ? mp.timeLeft : null} total={mp.time} />
        </section>

        <aside className="game__side">
          {drawPhase && (
            <div className="game__tools">
              <Toolbar
                tool={drawTool}
                color={colourFix ?? color}
                size={size}
                onTool={setTool}
                onColor={setColor}
                onSize={setSize}
                onClear={() => noLift ? socket.emit("clear_canvas") : canvasRef.current?.dispatch(clearBoard())}
                onUndo={undo}
                onRedo={redo}
                canUndo={hist.undo && !noLift}
                canRedo={hist.redo && !noLift}
                locked={!canDraw}
                canClearWhileLocked={canClearLocked}
                maxSize={MAX_SIZE}
                lockedColor={colourFix}
                hideBucket={noLift}
                hideShapes={noLift}
                hidePen={shapesOnly}
                historyLocked={noLift}
              />
            </div>
          )}
          <div className="game__answers game__answers--solo">
            {watching ? (
              // ช่วง 2: แชทร่วมของห้อง (ตัวเดียวกับโหมดปกติ) — ทายถูกแล้วคุยได้แค่กับคนที่ถูกแล้ว (server คุม)
              <div className="mp-ai__chat">
                <p className={`mp-ai__status${solvedMe ? " mp-ai__status--ok" : ""}`}>
                  {solvedMe ? (
                    <>
                      <Icon name="check" size={18} /> ถูก! +{mp.watch.myPoints} · รอเพื่อน ({mp.watch.solvedIds.length}/{online})
                    </>
                  ) : (
                    "พิมพ์ทายในแชท ทายถูกเร็วได้คะแนนมาก · ทุกคนทายแยกกัน"
                  )}
                </p>
                <Chat messages={mp.watch?.chat ?? []} meId={meId} disabled={mp.phase !== "watch"} onSend={sendGuess} focusKey={mp.round ?? 0} />
              </div>
            ) : (
              <section className="panel ai-box" aria-live="polite">
                <h2 className="panel__title">{mp.phase === "gallery" ? "แกลเลอรี" : "AI คิดว่า..."}</h2>
                {mp.phase === "gallery" ? (
                  <div className="ai-box__body">
                    <p className="ai-box__hint">ภาพของทุกคน คำที่ AI ทาย และคะแนน · เดี๋ยวเข้าช่วง 2 (AI วาด คุณทาย)</p>
                  </div>
                ) : (
                  <>
                    {/* คำที่ AI ทายภาพของเรา เรียงตามเวลา — เห็นแค่เรา (server ส่งถึงเราคนเดียว) */}
                    <ol className="mp-ai__guesses" aria-label="คำที่ AI ทายภาพของคุณ">
                      {mp.myGuesses.length === 0 && !thinking && (
                        <li className="mp-ai__guess mp-ai__guess--hint">วาดเลย AI จะดูภาพทุก {SNAPSHOT_MS / 1000} วินาที</li>
                      )}
                      {mp.myGuesses.map((g, i) => (
                        <li key={i} className={`mp-ai__guess${g.correct ? " mp-ai__guess--ok" : ""}`}>
                          <Icon name={g.correct ? "check" : "robot"} size={16} />
                          <span>
                            AI: {g.guess}
                            {g.correct ? " — ถูก!" : ""}
                          </span>
                        </li>
                      ))}
                      {thinking && !myDone && <li className="mp-ai__guess mp-ai__guess--hint">AI กำลังดูภาพ...</li>}
                    </ol>
                    <p className="ai-box__past">
                      AI ทายถูกแล้ว {mp.doneIds.length}/{online} คน · ภาพและคำทายของคุณเห็นแค่คุณจนกว่าจะเปิดแกลเลอรี
                    </p>
                  </>
                )}
              </section>
            )}
          </div>
        </aside>
      </main>

      {mp.phase === "watch_end" && mp.watchEnd && !game.ranking && (
        // แสดงแค่คำตอบ — คะแนน/สถานะของแต่ละคนดูได้ที่แถบรายชื่ออยู่แล้ว
        <Modal labelledBy="mp-ai-watch-end">
          <p className="answer" id="mp-ai-watch-end">
            {mp.watchEnd.word}
          </p>
        </Modal>
      )}

      {game.ranking && (
        <GameOverModal
          ranking={game.ranking}
          meId={meId}
          isHost={room.hostId === meId}
          onPlayAgain={startGame}
          onBackToLobby={backToLobby}
          returnAt={game.returnAt}
          onLeave={onLeave}
        />
      )}

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
      {showExit && <ExitModal onNo={() => setShowExit(false)} onYes={onLeave} />}
    </div>
  );
}

// แกลเลอรี: ภาพจริงและผลรู้จำแบบสั้นของทุกคน — เปิดเผยครั้งแรกตรงนี้
function Gallery({ gallery, meId }) {
  const ref = useRef(null);
  const [cardWidth, setCardWidth] = useState(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const measure = () => {
      const style = getComputedStyle(node);
      const width = node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const gap = parseFloat(style.columnGap);
      const minCardWidth = parseFloat(style.getPropertyValue("--mp-gallery-min-card"));
      setCardWidth(galleryLayout(gallery.results.length, width, minCardWidth, gap).cardWidth);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [gallery.results.length]);
  return (
    <div ref={ref} className="mp-gallery" aria-label="แกลเลอรีภาพของทุกคน" style={cardWidth == null ? undefined : { "--mp-gallery-card-width": `${cardWidth}px` }}>
      {gallery.results.map((r) => (
        <figure key={r.playerId} className={`mp-gallery__card${r.playerId === meId ? " mp-gallery__card--me" : ""}`}>
          <figcaption>
            <span className="mp-gallery__name">
              <span className="mp-gallery__avatar"><AvatarArt index={r.avatar} size={24} /></span>
              <span className="mp-gallery__player-name">{r.name}</span>
            </span>
            <span className={`mp-gallery__ai${r.recognized ? " mp-gallery__ai--ok" : ""}`}>
              {r.recognized ? "AI ทายถูก" : r.status === "ok" ? "AI ยังทายไม่ถูก" : STATUS_TEXT[r.status] ?? "AI ดูภาพไม่สำเร็จ"}
            </span>
          </figcaption>
          <div className="mp-gallery__img">
            {r.image ? <img src={r.image} alt={`ภาพของ ${r.name}`} /> : <span className="mp-gallery__none">ไม่มีภาพ</span>}
          </div>
        </figure>
      ))}
    </div>
  );
}
