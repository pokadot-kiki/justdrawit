import { useEffect, useState } from "react";
import { socket } from "../socket";

// สถานะเริ่มต้นของโหมด Multiplayer vs AI (events.md หัวข้อ 10)
// phase: null | "draw" | "eval" | "gallery" | "watch" | "watch_end" | "over"
function emptyMp() {
  return {
    phase: null,
    round: null,
    totalRounds: null,
    word: null, // ช่วง 1 เท่านั้น (ทุกคนวาดคำเดียวกัน) · ช่วง 2 server ไม่ส่งคำตอบจนกว่าจะเฉลย
    category: "",
    challenge: null,
    intro: false,
    penLocked: false,
    myCanvas: null,
    time: null,
    timeLeft: null,
    doneIds: [], // playerId ที่ AI ทายภาพถูกแล้ว (เสร็จ รอเพื่อน) — ไม่มีภาพ/คำทายของคนอื่น
    myGuesses: [], // คำที่ AI ทายภาพของเราตามลำดับเวลา [{ guess, correct }] (ของเราคนเดียว)
    myPoints: null, // คะแนนช่วง 1 ของเรา (AI ทายถูก)
    evalDone: 0,
    evalTotal: 0,
    gallery: null, // { round, word, results }
    watch: null, // { category, time, hintAt, hint, strokes, solvedIds, myPoints }
    watchEnd: null, // { round, word, results }
  };
}

const add = (list, id) => (list.includes(id) ? list : [...list, id]);

/**
 * ผูก event ของ Multiplayer vs AI ไว้ที่ App (ไม่ใช่ที่หน้าจอเกม) ด้วยเหตุผลเดียวกับ useGame:
 * server ส่ง mpai_draw_start ตามหลัง game_started ทันที ตอนนั้นหน้าจอเกมยังไม่ทันเกิด ถ้าให้หน้าจอผูกเอง event จะหลุด
 * hook นี้แค่เก็บสิ่งที่ server บอก — กติกา เวลา คะแนน server ตัดสินทั้งหมด
 */
export function useMpAi(meId) {
  const [mp, setMp] = useState(emptyMp);

  useEffect(() => {
    const patch = (p) => setMp((m) => ({ ...m, ...(typeof p === "function" ? p(m) : p) }));

    const onGameStarted = () => setMp(emptyMp());
    const onLobbyReturn = () => setMp(emptyMp());
    const onDrawStart = (d) =>
      setMp((m) => ({
        ...emptyMp(),
        totalRounds: d.totalRounds,
        round: d.round,
        phase: "draw",
        word: d.word,
        category: d.category ?? "",
        challenge: d.challenge ?? null,
        intro: !!d.intro,
        time: d.time,
        timeLeft: d.time,
        // ผลรอบก่อนไม่ต้องเก็บ แต่คงไว้ถ้าเป็นรอบเดียวกัน (ไม่เกิด)
        gallery: m.gallery && m.gallery.round === d.round ? m.gallery : null,
      }));
    // คำที่ AI ทายภาพของเรา (server ส่งถึงเราคนเดียว) — ต่อท้ายตามลำดับเวลา
    const onAiGuess = ({ guess, correct, points }) =>
      patch((m) => ({
        myGuesses: [...m.myGuesses, { guess, correct }],
        myPoints: correct ? points : m.myPoints,
      }));
    const onDone = ({ playerId }) => patch((m) => ({ doneIds: add(m.doneIds, playerId) }));
    const onIntroEnd = () => patch({ intro: false });
    const onPenLocked = () => patch({ penLocked: true });
    const onCanvasHistory = (canvas) => patch({ myCanvas: canvas, penLocked: !!canvas?.penLocked });
    const onEvaluating = ({ total }) => patch({ phase: "eval", evalDone: 0, evalTotal: total });
    const onProgress = ({ done, total }) => patch({ evalDone: done, evalTotal: total });
    const onGallery = (g) => patch({ phase: "gallery", gallery: g });
    const onWatchStart = (d) =>
      patch({
        phase: "watch",
        round: d.round,
        totalRounds: d.totalRounds,
        time: d.time,
        timeLeft: d.time,
        watchEnd: null,
        watch: { category: d.category ?? "", time: d.time, hintAt: d.hintAt, hint: null, strokes: [], solvedIds: [], myPoints: null, chat: [], clockOffset: Date.now() - d.serverNow },
      });
    const onWatchChat = (item) => setMp((m) => {
      if (!m.watch || m.phase !== "watch" || !Number.isInteger(item.seq) || item.round !== m.round || m.watch.chat?.some((old) => old.seq === item.seq)) return m;
      return { ...m, watch: { ...m.watch, chat: [...(m.watch.chat ?? []), item].sort((a, b) => a.seq - b.seq) } };
    });
    const onChat = (item) => { if (!item.correct) onWatchChat(item); };
    const onCorrectChat = (item) => { if (item.system) onWatchChat(item); };
    // เส้นแต่ละเส้นถูกส่งตอนเวลา server = startedAt ของมัน → ทุกเส้นที่มาถึงคือ "ตัวอย่าง" ส่วนต่างนาฬิกาเครื่องเรากับ server
    // เก็บค่าที่น้อยที่สุด (ข้อความที่มาถึงช้าน้อยที่สุด) — เดิมใช้ค่าจาก mpai_watch_start ข้อความเดียว
    // ถ้าข้อความนั้นถูกจัดการช้า (เครื่องช้า/แท็บอยู่เบื้องหลัง) เครื่องนั้นจะเล่นภาพช้ากว่าคนอื่นไปทั้งช่วง
    const onStroke = (s) =>
      patch((m) => {
        if (!m.watch) return {};
        const sample = Number.isFinite(s.startedAt) ? Date.now() - s.startedAt : Infinity;
        return { watch: { ...m.watch, strokes: [...m.watch.strokes, s], clockOffset: Math.min(m.watch.clockOffset, sample) } };
      });
    const onHint = ({ hint }) => patch((m) => (m.watch ? { watch: { ...m.watch, hint } } : {}));
    // ช่วง 2: ใครทายถูก (คำที่พิมพ์มาทางแชทร่วม chat_message ซึ่ง useGame เก็บไว้) · คะแนนของเราดูจาก playerId
    const onCorrect = ({ playerId, points }) =>
      patch((m) =>
        m.watch
          ? { watch: { ...m.watch, solvedIds: add(m.watch.solvedIds, playerId), myPoints: playerId === meId ? points : m.watch.myPoints } }
          : {}
      );
    const onWatchEnd = (we) => patch({ phase: "watch_end", watchEnd: we });
    const onTimer = ({ timeLeft }) => patch({ timeLeft });
    const onGameEnd = () => patch({ phase: "over" });
    // เข้ากลางเกม/รีเฟรช: server ส่งภาพรวมทั้งหมดมาทีเดียว
    const onState = (s) => {
      if (!s) return;
      setMp({
        ...emptyMp(),
        phase: s.phase,
        round: s.round,
        totalRounds: s.totalRounds,
        time: s.time,
        timeLeft: s.timeLeft,
        word: s.word ?? null,
        category: s.category ?? s.watch?.category ?? "",
        challenge: s.challenge ?? null,
        intro: !!s.intro,
        penLocked: !!s.penLocked,
        myCanvas: s.myCanvas ?? null,
        doneIds: s.doneIds ?? [],
        myGuesses: s.myGuesses ?? [],
        myPoints: s.myPoints ?? null,
        gallery: s.gallery ?? null,
        watch: s.watch ? { ...s.watch, clockOffset: Date.now() - s.watch.serverNow } : null,
        watchEnd: s.watchEnd ?? null,
      });
    };

    const handlers = {
      game_started: onGameStarted,
      lobby_return: onLobbyReturn,
      mpai_draw_start: onDrawStart,
      mpai_intro_end: onIntroEnd,
      mpai_pen_locked: onPenLocked,
      mpai_canvas_history: onCanvasHistory,
      mpai_ai_guess: onAiGuess,
      mpai_done: onDone,
      mpai_evaluating: onEvaluating,
      mpai_eval_progress: onProgress,
      mpai_gallery: onGallery,
      mpai_watch_start: onWatchStart,
      mpai_watch_stroke: onStroke,
      chat_message: onChat,
      correct_guess: onCorrectChat,
      mpai_watch_hint: onHint,
      mpai_correct: onCorrect,
      mpai_watch_end: onWatchEnd,
      mpai_state: onState,
      timer: onTimer,
      game_end: onGameEnd,
    };
    for (const [ev, fn] of Object.entries(handlers)) socket.on(ev, fn);
    return () => {
      for (const [ev, fn] of Object.entries(handlers)) socket.off(ev, fn);
    };
  }, [meId]);

  // ขอให้ server สร้างภาพจาก action ที่ตรวจแล้ว — server คุมจังหวะ/ทีละภาพและส่งคำทายส่วนตัว
  function sendSnapshot() {
    socket.emit("mpai_snapshot");
  }

  return { mp, sendSnapshot };
}
