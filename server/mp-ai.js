// ══════════════════════════════════════════════════════════════════════
// โหมด Multiplayer vs AI (settings.mode === "mpai") — เพื่อนหลายคนในห้องเดียว แข่งกันเป็นรายคน
//
// หนึ่งรอบมีสองช่วง:
//   ช่วง 1 "วาด"   ทุกคนวาดคำเดียวกันพร้อมกันแบบส่วนตัว · AI ดูภาพเป็นระยะแบบเดียวกับ Solo (ai.guessImage
//                  ทีละภาพ ห่างกัน ≥ snapshotGapMs) แล้วบอกคำที่ทาย "เฉพาะเจ้าของภาพ" · ทายผิด = วาดต่อได้
//                  ทายถูก = คนนั้นเสร็จ ได้คะแนนตามความมั่นใจ แล้วรอ
//                  แกลเลอรีเปิดเมื่อ AI ทายถูกครบทุกคนที่ยังออนไลน์ หรือหมดเวลา (คนที่ยังไม่ถูกได้ทายภาพล่าสุดอีกครั้งตอนหมดเวลา)
//   ช่วง 2 "ทาย"   AI วาดภาพหนึ่งภาพ (เล่นซ้ำภาพ Quick, Draw! แบบเดียวกับ Solo) ทุกคนพิมพ์ทายในแชทร่วมของห้อง
//                  (คำผิดทุกคนเห็นพร้อมชื่อ · คำถูกแจ้งโดยไม่เผยคำตอบ · คนที่ถูกแล้วคุยได้แค่กันเอง)
//                  ทายถูกคนหนึ่งไม่จบช่วง · จบเมื่อผู้มีสิทธิ์ตั้งแต่ต้นช่วงครบ (เผื่อเวลารีเฟรช) หรือหมดเวลา
// คะแนนช่วง 1 = ai.drawScore (100–500 ตามความมั่นใจของ AI ต่อคำที่ถูก · จำไม่ได้ 0)
// คะแนนช่วง 2 = ai.scoreFor เดียวกับ Solo (เร็วยิ่งได้มาก)
//
// ความเป็นส่วนตัว: ระหว่างช่วง 1 server รับ stroke_* ในกระดานส่วนตัวของแต่ละคน
// mpai_snapshot เป็นเพียงคำขอให้ server สร้างภาพจาก action ที่ผ่านกติกาแล้ว · คำที่ AI ทายส่งผ่านห้องส่วนตัวชื่อ playerId
// คนอื่นรู้แค่ว่า "ใครเสร็จแล้ว" · ภาพและคำทายเปิดครั้งแรกใน mpai_gallery · ช่วง 2 ไม่ส่งคำตอบก่อน mpai_watch_end
//
// หลุด/ออก: คะแนนและภาพอยู่ใน room.mp.entries / room.mp.images (แยกจาก room.players) จึงไม่หาย และขึ้นอันดับตอนจบ
// ไม่มีใครถูกรอ: เงื่อนไขจบช่วงนับเฉพาะคนที่ยังออนไลน์ · ไม่มีใครออนไลน์ก็จบตามเวลา
// ══════════════════════════════════════════════════════════════════════
const LEVELS = ["easy", "medium", "hard"];
const renderDrawing = require("./mp-ai-render");

function envMs(name, fallback) {
  const v = process.env[name];
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : fallback;
}

// env สำหรับเทสเท่านั้น (ย่อเวลา) ใช้งานจริงไม่ต้องตั้ง
const TIME_OVERRIDE = Number(process.env.MPAI_TIME_OVERRIDE) || 0;       // วินาทีต่อช่วง (แทน drawTime ของห้อง)
const GALLERY_MS = envMs("MPAI_GALLERY_MS", 8000);                      // ดูแกลเลอรีก่อนเข้าช่วง 2
const REST_MS = envMs("MPAI_REST_MS", 5000);                            // ดูเฉลยช่วง 2 ก่อนรอบถัดไป/จบเกม
const EVAL_TIMEOUT_MS = envMs("MPAI_EVAL_TIMEOUT_MS", 10000);           // เพดานเวลา AI ต่อหนึ่งครั้งที่ดูภาพ — เกินแล้วถือว่าครั้งนั้นไม่สำเร็จ ไม่ค้าง
// คนหลุด: รอสั้นๆ ก่อนเลิกนับว่าเขาต้องทำให้เสร็จ — รีเฟรช (1–2 วิ) จึงไม่ทำให้ช่วงจบกลางคัน แต่คนที่หลุดจริงไม่ถ่วงห้องเกินนี้
const OFFLINE_WAIT_MS = envMs("MPAI_OFFLINE_WAIT_MS", 5000);

module.exports = function createMpAi({ io, rooms, ai, aiDrawings, wordBank, makeHint, normalize, roomState, endGame, snapshotGapMs, drawBudgetRatio, drawColor, drawSize, rollChallenge, introMsFor, canvasPayload, createPrivateBoard, closePrivateStroke }) {
  const bank = () => ai.soloWords(wordBank); // คำที่มีชื่ออังกฤษให้โมเดลรู้จัก (ai-words.json) · ไม่มีไฟล์ใช้คลังคำปกติ
  const online = (room) => room.players.filter((p) => p.connected !== false);
  // callback ที่ตั้งไว้ก่อนเปลี่ยนช่วง/ห้องถูกลบ/เกมจบ จะเห็น token ไม่ตรงแล้วเลิกทำงานเอง
  const alive = (room, token) => rooms.get(room.code) === room && room.status === "playing" && room.mp && room.mp.token === token;

  function entryOf(room, player) {
    let e = room.mp.entries.get(player.id);
    if (!e) {
      e = { playerId: player.id, name: player.name, avatar: player.avatar, drawPoints: 0, guessPoints: 0, left: false };
      room.mp.entries.set(player.id, e);
    }
    e.name = player.name;
    e.avatar = player.avatar;
    e.left = false;
    return e;
  }

  // คะแนนรวมของผู้เล่นเก็บที่ entry (ไม่หายตอนออก) แล้วคัดลอกไปที่ player.score ให้แถบคะแนน/room_update เห็นตรงกัน
  function syncScore(room, e) {
    const p = room.players.find((x) => x.id === e.playerId);
    if (p) p.score = e.drawPoints + e.guessPoints;
  }

  function clearTimers(room) {
    const mp = room.mp;
    if (!mp) return;
    clearInterval(mp.ticker);
    clearTimeout(mp.phaseTimer);
    for (const t of mp.strokeTimers) clearTimeout(t);
    mp.ticker = null;
    mp.phaseTimer = null;
    mp.strokeTimers = [];
  }

  // เปลี่ยนช่วง: ล้างตัวจับเวลาของช่วงก่อน แล้วออก token ใหม่
  function nextToken(room) {
    clearTimers(room);
    room.mp.token++;
    return room.mp.token;
  }

  function pickLevel(room) {
    const d = room.settings.difficulty;
    return LEVELS.includes(d) ? d : LEVELS[Math.floor(Math.random() * LEVELS.length)]; // mixed = สุ่มทุกรอบ
  }

  function categoryOf(word) {
    const b = bank();
    for (const l of LEVELS) {
      const hit = (b[l] || []).find((w) => w.word === word);
      if (hit) return hit.category || "";
    }
    return "";
  }

  // นับเวลาของช่วง (ส่ง timer ทุกวิ เหมือนเกมห้อง) · หมดแล้วเรียก onEnd ถ้ายังอยู่ช่วงเดิม
  function runTimer(room, token, seconds, onEnd) {
    const mp = room.mp;
    mp.time = seconds;
    mp.timeLeft = seconds;
    mp.ticker = setInterval(() => {
      if (!alive(room, token)) return clearInterval(mp.ticker);
      mp.timeLeft--;
      io.to(room.code).emit("timer", { timeLeft: mp.timeLeft });
      if (mp.timeLeft <= 0) {
        clearInterval(mp.ticker);
        mp.ticker = null;
        onEnd();
      }
    }, 1000);
  }

  function phaseTime(room) {
    return TIME_OVERRIDE || room.settings.drawTime;
  }

  // รอผล AI ไม่เกิน ms · เกินแล้ว reject (งานเดิมยังวิ่งต่อเบื้องหลังได้ แต่ผลถูกเมิน)
  function withTimeout(promise, ms) {
    let t;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        t = setTimeout(() => reject(Object.assign(new Error(`AI ไม่ตอบภายใน ${ms} ms`), { timeout: true })), ms);
      }),
    ]).finally(() => clearTimeout(t));
  }

  // ---------- เริ่มเกม ----------
  function startGame(room) {
    if (room.mp) clearTimers(room);
    room.phase = "mpai"; // ไม่ใช่ "drawing" → handler การวาดของเกมห้อง (drawRoom) ทิ้งทุกอย่างอยู่แล้ว
    room.drawerId = null;
    room.mp = { token: 0, round: 0, phase: null, entries: new Map(), usedWords: new Set(), strokeTimers: [], ticker: null, phaseTimer: null };
    for (const p of room.players) entryOf(room, p);
    startDrawPhase(room);
  }

  // ---------- ช่วง 1: ทุกคนวาดคำเดียวกันแบบส่วนตัว AI ทายเป็นระยะ ----------
  function startDrawPhase(room) {
    const mp = room.mp;
    const token = nextToken(room);
    const word = ai.pickWord(bank(), pickLevel(room), mp.usedWords);
    if (!word) return finish(room); // ไม่มีคำเลย (ไม่น่าเกิด) → จบเกมแทนการค้าง
    mp.round++;
    mp.usedWords.add(word);
    mp.phase = "draw";
    mp.word = word;
    mp.category = categoryOf(word);
    mp.startedAt = Date.now();
    mp.challenge = rollChallenge(room);
    mp.intro = introMsFor(mp.challenge) > 0;
    mp.boards = new Map(room.players.map((p) => [p.id, createPrivateBoard(p.id, mp.challenge)]));
    mp.renderedRevision = new Map();
    mp.rendering = new Set();
    mp.renderQueued = new Set();
    // ทุกอย่างของช่วงนี้เก็บที่ server เท่านั้นจนถึงแกลเลอรี (key = playerId)
    mp.images = new Map();    // ภาพล่าสุดที่สร้างจาก action ส่วนตัว
    mp.lastAsked = new Map();  // เวลาที่ให้ AI ดูล่าสุด
    mp.busy = new Set();       // กำลังรอ AI อยู่ (ทีละภาพต่อคน)
    mp.queued = new Map();     // นัดให้ AI ดูภาพล่าสุดครั้งถัดไป (ภาพมาก่อนครบจังหวะ = timer · มาระหว่าง AI คิด = null)
    mp.seen = new Map();       // ภาพที่ AI ดูไปแล้วล่าสุด (ไว้รู้ว่าตอนหมดเวลาภาพล่าสุดยังไม่ถูกดูหรือเปล่า)
    mp.preds = new Map();      // คำที่ AI ทายตามลำดับเวลา [{ guess, correct }]
    mp.done = new Map();       // AI ทายถูกแล้ว → { image, guess, confidence, points }
    mp.failed = new Map();     // ครั้งล่าสุดที่ AI ดูไม่สำเร็จ → "error" | "timeout"
    mp.gallery = null;
    mp.watch = null;
    mp.watchEnd = null;
    const time = phaseTime(room);
    // ทุกคนเป็นคนวาดคำเดียวกัน จึงบอกคำได้ทั้งห้อง (ช่วงนี้ไม่มีใครเป็นคนทาย)
    io.to(room.code).emit("mpai_draw_start", { round: mp.round, totalRounds: room.settings.rounds, word, category: mp.category, time, challenge: mp.challenge, intro: mp.intro });
    mp.time = time;
    mp.timeLeft = time;
    if (mp.intro) {
      mp.phaseTimer = setTimeout(() => {
        if (!alive(room, token) || mp.phase !== "draw") return;
        mp.intro = false;
        io.to(room.code).emit("mpai_intro_end", {});
        runTimer(room, token, time, () => finishDrawPhase(room));
      }, introMsFor(mp.challenge));
    } else runTimer(room, token, time, () => finishDrawPhase(room));
  }

  // Same validated action history and challenge rules as Classic/Team, but each player has a private board.
  function actionRoom(room, pid) {
    const mp = room.mp;
    if (!mp || mp.phase !== "draw" || mp.intro || mp.done.has(pid)) return null;
    const player = room.players.find((p) => p.id === pid && p.connected !== false);
    if (!player) return null;
    if (!mp.boards.has(pid)) mp.boards.set(pid, createPrivateBoard(pid, mp.challenge));
    return mp.boards.get(pid);
  }

  function clearPlayerDrawing(room, pid) {
    const mp = room.mp;
    const board = mp.boards.get(pid);
    if (board) board.clearGeneration = (board.clearGeneration || 0) + 1;
    mp.images.delete(pid);
    mp.seen.delete(pid);
    mp.renderedRevision.delete(pid);
    mp.failed.delete(pid);
  }

  // ให้ AI ดูภาพหนึ่งครั้ง (Solo ใช้ฟังก์ชันเดียวกัน: ai.guessImage ไม่ตอบคำที่ทายผิดไปแล้วในภาพนี้ซ้ำ)
  // คืน { guess, correct, confidence } หรือ throw (พัง/เกินเวลา)
  function askAi(room, pid, image) {
    const mp = room.mp;
    return withTimeout(
      ai.guessImage({
        image,
        word: mp.word,
        allWords: ai.wordsOf(bank()),
        elapsed: (Date.now() - mp.startedAt) / 1000,
        time: mp.time,
        wrong: (mp.preds.get(pid) || []).filter((p) => !p.correct).map((p) => p.guess),
        requireReal: true,
      }),
      EVAL_TIMEOUT_MS
    );
  }

  // บันทึกผลหนึ่งครั้งที่ AI ทาย · ถูก = คนนั้นเสร็จ ได้คะแนนตามความมั่นใจ
  function recordGuess(room, e, image, out) {
    const mp = room.mp;
    const pid = e.playerId;
    mp.seen.set(pid, image);
    mp.failed.delete(pid);
    if (!mp.preds.has(pid)) mp.preds.set(pid, []);
    mp.preds.get(pid).push({ guess: out.guess, correct: out.correct });
    if (!out.correct) return { guess: out.guess, correct: false };
    const points = ai.drawScore({ recognized: true, confidence: out.confidence });
    mp.done.set(pid, { image, guess: out.guess, confidence: Math.round(out.confidence * 100) / 100, points });
    e.drawPoints += points;
    syncScore(room, e);
    return { guess: out.guess, correct: true, points };
  }

  // รับคำขอ snapshot: สร้างภาพจาก action ที่ server รับไว้ แล้วนัด AI ตามจังหวะของ Solo
  // (ห่างจากครั้งก่อน >= snapshotGapMs และทีละภาพต่อคน) — ภาพที่มาก่อนครบจังหวะหรือระหว่าง AI ยังคิด
  // ไม่ถูกทิ้งเงียบอีกต่อไป: ต่อคิวไว้ดูทันทีที่ถึงเวลา จึงได้คำตอบเสมอ
  // (เดิมทิ้งเงียบ → หน้าเว็บที่รอคำตอบค้าง "AI กำลังดูภาพ..." นานถึง 20 วิ เจอจริงตอนเล่นด้วยโมเดลจริง)
  async function handleSnapshot(socket, room, data) {
    const mp = room.mp;
    if (!mp || mp.phase !== "draw" || mp.intro) return;
    if (data !== undefined) return; // mpai_snapshot is only a request to render accepted actions.
    const player = room.players.find((p) => p.id === socket.data.pid);
    if (!player) return;
    const pid = player.id;
    const board = actionRoom(room, pid);
    if (!board) return;
    if (board.canvasOps.length === 0) {
      mp.images.delete(pid);
      mp.seen.delete(pid);
      mp.renderedRevision.delete(pid);
      return;
    }
    if (mp.renderedRevision.get(pid) === board.revision && mp.images.has(pid)) {
      requestAsk(room, pid);
      return;
    }
    if (mp.rendering.has(pid)) {
      mp.renderQueued.add(pid);
      return;
    }
    mp.rendering.add(pid);
    const token = mp.token;
    const revision = board.revision;
    try {
      const image = await renderDrawing(canvasPayload(board).items);
      if (!alive(room, token) || mp.phase !== "draw") return;
      if (board.revision !== revision) {
        mp.renderQueued.add(pid);
        return;
      }
      mp.images.set(pid, image);
      mp.renderedRevision.set(pid, revision);
      if (mp.done.has(pid)) return;
      entryOf(room, player);
      requestAsk(room, pid);
    } catch (err) {
      if (alive(room, token)) {
        mp.failed.set(pid, "error");
        io.to(pid).emit("game_error", { code: "AI_UNAVAILABLE", message: "สร้างภาพสำหรับ AI ไม่สำเร็จ ลองวาดต่ออีกครั้ง" });
      }
    } finally {
      mp.rendering.delete(pid);
      if (mp.renderQueued.delete(pid) && alive(room, token) && mp.phase === "draw") void handleSnapshot(socket, room);
    }
  }

  // ให้ AI ดูภาพล่าสุดของคนนี้ "เร็วที่สุดที่จังหวะอนุญาต" — นัดได้ครั้งเดียวต่อคน (ภาพที่มาระหว่างรอ ใช้ภาพล่าสุดตอนถึงเวลา)
  function requestAsk(room, pid) {
    const mp = room.mp;
    if (mp.busy.has(pid)) {
      if (!mp.queued.has(pid)) mp.queued.set(pid, null); // AI กำลังคิดอยู่ → นัดต่อทันทีที่เสร็จ (ดู finally ใน askLatest)
      return;
    }
    if (mp.queued.has(pid)) return; // นัดไว้แล้ว ตอนถึงเวลาจะใช้ภาพล่าสุดเอง
    const wait = Math.max(0, (mp.lastAsked.get(pid) || 0) + snapshotGapMs - Date.now());
    if (wait === 0) return void askLatest(room, pid);
    const token = mp.token;
    const t = setTimeout(() => {
      mp.queued.delete(pid);
      if (alive(room, token) && mp.phase === "draw") askLatest(room, pid);
    }, wait);
    mp.queued.set(pid, t);
    mp.strokeTimers.push(t); // ล้างพร้อมตัวจับเวลาอื่นตอนเปลี่ยนช่วง
  }

  async function askLatest(room, pid) {
    const mp = room.mp;
    const image = mp.images.get(pid);
    const clearGeneration = mp.boards.get(pid)?.clearGeneration || 0;
    const e = mp.entries.get(pid);
    if (!image || !e || mp.done.has(pid)) return;
    mp.lastAsked.set(pid, Date.now());
    mp.busy.add(pid);
    const token = mp.token;
    try {
      const out = await askAi(room, pid, image);
      if (!alive(room, token) || mp.phase !== "draw" || mp.done.has(pid) || (mp.boards.get(pid)?.clearGeneration || 0) !== clearGeneration) return; // Clear ระหว่างรอ → ทิ้งผลของภาพเก่า
      const res = recordGuess(room, e, image, out);
      // คำที่ AI ทาย = ของเจ้าของภาพคนเดียว (ห้องส่วนตัวชื่อ playerId) ไม่ส่งให้คนอื่น
      io.to(pid).emit("mpai_ai_guess", res);
      if (res.correct) {
        io.to(room.code).emit("mpai_done", { playerId: pid }); // คนอื่นรู้แค่ว่าเสร็จแล้ว ไม่มีภาพ/คำทาย/คะแนน
        io.to(room.code).emit("room_update", roomState(room));
        checkProgress(room);
      }
    } catch (err) {
      if (!alive(room, token) || mp.phase !== "draw") return;
      mp.failed.set(pid, err?.timeout ? "timeout" : "error");
      // ไม่ log ภาพหรือคำตอบ · แจ้งเจ้าของภาพด้วย error เดียวกับ Solo แล้ววาดต่อได้ (ครั้งถัดไป AI ลองใหม่)
      console.warn(`Multiplayer vs AI ห้อง ${room.code}: AI ดูภาพไม่สำเร็จ (${mp.failed.get(pid)})`);
      io.to(pid).emit("game_error", { code: "AI_UNAVAILABLE", message: "AI ตอบไม่ได้ในตอนนี้ ลองใหม่อีกครั้ง" });
    } finally {
      if (alive(room, token)) {
        mp.busy.delete(pid);
        // มีภาพเข้ามาระหว่างที่ AI คิด → นัดดูภาพล่าสุดในจังหวะถัดไป
        if (mp.queued.get(pid) === null) {
          mp.queued.delete(pid);
          if (mp.phase === "draw" && !mp.done.has(pid)) requestAsk(room, pid);
        }
      }
    }
  }

  // จบช่วง 1 (ทุกคนที่ออนไลน์เสร็จ หรือหมดเวลา): คนที่ยังไม่เสร็จและมีภาพล่าสุดที่ AI ยังไม่ได้ดู
  // ได้ให้ AI ดูอีกหนึ่งครั้งตามลำดับ (พัง/เกินเวลา = 0 คะแนน ไปคนถัดไป ไม่ค้าง) แล้วเปิดแกลเลอรี
  async function finishDrawPhase(room) {
    const mp = room.mp;
    if (!mp || mp.phase !== "draw" || !alive(room, mp.token)) return;
    const token = nextToken(room);
    mp.phase = "eval";
    // Rebuild every final drawing after the phase closes; late actions cannot alter this version.
    for (const [pid, board] of mp.boards) {
      if (board.canvasOps.length === 0) {
        mp.images.delete(pid);
        continue;
      }
      try {
        mp.images.set(pid, await renderDrawing(canvasPayload(board).items));
      } catch (err) {
        mp.failed.set(pid, "error");
      }
      if (!alive(room, token)) return;
    }
    // คนที่ยังอยู่ทุกคน + คนที่ออกไปแล้วแต่มีภาพ (ภาพที่ส่งแล้วไม่หาย)
    const order = [...mp.entries.values()].filter((e) => !e.left || mp.images.has(e.playerId));
    const pending = order.filter((e) => !mp.done.has(e.playerId) && mp.images.has(e.playerId) && mp.seen.get(e.playerId) !== mp.images.get(e.playerId));
    io.to(room.code).emit("mpai_evaluating", { total: pending.length });
    let n = 0;
    for (const e of pending) {
      const image = mp.images.get(e.playerId);
      try {
        const out = await askAi(room, e.playerId, image);
        if (!alive(room, token)) return; // ห้องถูกลบ/เกมจบระหว่างรอ AI
        const res = recordGuess(room, e, image, out);
        io.to(e.playerId).emit("mpai_ai_guess", res); // เจ้าของภาพเห็นคำทายครั้งสุดท้ายด้วย
      } catch (err) {
        if (!alive(room, token)) return;
        mp.failed.set(e.playerId, err?.timeout ? "timeout" : "error");
        console.warn(`Multiplayer vs AI ห้อง ${room.code}: AI ดูภาพสุดท้ายไม่สำเร็จ (${mp.failed.get(e.playerId)}) ให้ 0 คะแนน`);
      }
      io.to(room.code).emit("mpai_eval_progress", { done: ++n, total: pending.length });
    }
    const results = order.map((e) => {
      const pid = e.playerId;
      const done = mp.done.get(pid);
      const preds = mp.preds.get(pid) || [];
      const image = mp.images.get(pid) ?? done?.image ?? null;
      return {
        playerId: pid,
        name: e.name,
        avatar: e.avatar,
        image,
        guess: preds.at(-1)?.guess ?? null,
        predictions: preds.map((p) => p.guess),
        recognized: !!done,
        confidence: done?.confidence ?? 0,
        points: done?.points ?? 0,
        status: done ? "ok" : !image ? "missing" : mp.failed.get(pid) || "ok",
      };
    });
    mp.phase = "gallery";
    mp.gallery = { round: mp.round, word: mp.word, results };
    io.to(room.code).emit("mpai_gallery", mp.gallery);
    io.to(room.code).emit("room_update", roomState(room));
    mp.phaseTimer = setTimeout(() => alive(room, token) && startWatchPhase(room), GALLERY_MS);
  }

  // ---------- ช่วง 2: AI วาด ทุกคนทายในแชทร่วม ----------
  function startWatchPhase(room) {
    const mp = room.mp;
    const token = nextToken(room);
    const picked = aiDrawings.pick(bank(), pickLevel(room), mp.usedWords);
    if (!picked) return afterWatch(room, token); // ไม่มีไฟล์ภาพ → ข้ามช่วง 2 ไม่ล่ม
    mp.usedWords.add(picked.word);
    const time = phaseTime(room);
    const hintAt = Math.floor(time / 2);
    mp.phase = "watch";
    mp.watch = { word: picked.word, category: picked.category || "", time, hintAt, hint: null, startedAt: Date.now(), strokes: [], solved: new Map(), eligibleIds: new Set(online(room).map((p) => p.id)), offlineGrace: new Map(), chat: [] };
    const w = mp.watch;
    // ห้ามมีคำตอบใน event นี้ (มีแค่หมวด)
    io.to(room.code).emit("mpai_watch_start", { round: mp.round, totalRounds: room.settings.rounds, category: w.category, time, hintAt, serverNow: Date.now() });
    mp.strokeTimers.push(
      setTimeout(() => {
        if (!alive(room, token)) return;
        w.hint = makeHint(w.word);
        io.to(room.code).emit("mpai_watch_hint", { hint: w.hint });
      }, (time - hintAt) * 1000)
    );
    for (const s of aiDrawings.schedule(picked.strokes, time * 1000 * drawBudgetRatio)) {
      mp.strokeTimers.push(
        setTimeout(() => {
          if (!alive(room, token)) return;
          const stroke = { points: s.points, color: drawColor, size: drawSize, ms: s.ms, startedAt: w.startedAt + s.at };
          w.strokes.push(stroke);
          io.to(room.code).emit("mpai_watch_stroke", stroke);
        }, s.at)
      );
    }
    runTimer(room, token, time, () => endWatch(room));
  }

  // ข้อความในแชทระหว่างช่วง 2 (มาจาก handler `guess` เดิม ซึ่งเช็คชนิด ตัดความยาว และจำกัดความถี่ไว้แล้ว)
  // ผิด = ทุกคนเห็นพร้อมชื่อ · ถูก = correct_guess ที่ไม่มีคำตอบ · คนที่ถูกแล้วคุยได้แค่กันเอง
  function handleGuess(socket, room, player, text) {
    const mp = room.mp;
    if (!mp || mp.phase !== "watch") return;
    const w = mp.watch;
    const msg = { playerId: player.id, name: player.name, text };
    const guess = normalize(text);
    const answer = normalize(w.word);
    const bareGuess = guess.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, "");
    const publish = (event, message, recipients = null) => {
      const item = { ...message, round: mp.round, seq: w.chat.length + 1 };
      w.chat.push({ ...item, recipients });
      if (recipients) for (const id of recipients) io.to(id).emit(event, item);
      else io.to(room.code).emit(event, item);
    };
    if (w.solved.has(player.id)) {
      // คนที่ทายถูกแล้วคุยกันเองได้ แต่ห้ามส่งคำตอบหลุดก่อนเฉลย
      if (guess === answer || bareGuess === answer) return;
      const recipients = room.players.filter((p) => w.solved.has(p.id)).map((p) => p.id);
      publish("chat_message", msg, recipients);
      return;
    }
    if (guess === answer) {
      const points = ai.scoreFor(w.time - (Date.now() - w.startedAt) / 1000, w.time); // สูตรเดียวกับ Solo
      w.solved.set(player.id, points);
      const e = entryOf(room, player);
      e.guessPoints += points;
      syncScore(room, e);
      publish("correct_guess", { playerId: player.id, name: player.name, system: true, kind: "correct", text: `${player.name} ทายถูก` });
      io.to(room.code).emit("mpai_correct", { playerId: player.id, name: player.name, points });
      io.to(room.code).emit("room_update", roomState(room));
      return checkProgress(room);
    }
    if (bareGuess === answer) return; // เติมวรรคตอนรอบคำตอบ ห้ามเผยคำตอบในแชท
    publish("chat_message", msg);
  }

  function endWatch(room) {
    const mp = room.mp;
    if (!mp || mp.phase !== "watch" || !alive(room, mp.token)) return;
    const token = nextToken(room);
    const w = mp.watch;
    mp.phase = "watch_end";
    const results = [...w.solved.entries()].map(([playerId, points]) => ({ playerId, name: mp.entries.get(playerId)?.name ?? "", points }));
    mp.watchEnd = { round: mp.round, word: w.word, results };
    io.to(room.code).emit("mpai_watch_end", mp.watchEnd); // เฉลยได้แล้วเพราะช่วงจบแล้ว
    afterWatch(room, token);
  }

  function afterWatch(room, token) {
    const mp = room.mp;
    mp.phaseTimer = setTimeout(() => {
      if (!alive(room, token)) return;
      if (mp.round < room.settings.rounds) startDrawPhase(room);
      else finish(room);
    }, REST_MS);
  }

  // ---------- จบเกม ----------
  // อันดับรายคน รวมคนที่ออกไปแล้ว (คะแนนไม่หาย) · ใช้ endGame เดิม (game_end + บันทึก Leaderboard + กลับห้องรอ)
  function ranking(room) {
    return [...room.mp.entries.values()]
      .map((e) => ({ playerId: e.playerId, name: e.name, avatar: e.avatar, isHost: e.playerId === room.hostId, score: e.drawPoints + e.guessPoints, drawPoints: e.drawPoints, guessPoints: e.guessPoints, left: e.left }))
      .sort((a, b) => b.score - a.score);
  }

  function finish(room) {
    clearTimers(room);
    room.mp.phase = "over";
    endGame(room);
  }

  // ---------- คนหลุด/ออก ----------
  function closePlayerStroke(room, pid) {
    if (room.mp?.phase !== "draw") return;
    const board = room.mp.boards.get(pid);
    if (board) closePrivateStroke(board);
  }

  // จบช่วงเร็วเมื่อทุกคนที่ยังออนไลน์ทำเสร็จแล้ว (ไม่มีใครถูกรอ)
  function checkProgress(room) {
    const mp = room.mp;
    if (!mp || room.status !== "playing") return;
    const on = online(room);
    if (on.length === 0) return; // ไม่มีใครออนไลน์ → จบตามเวลา
    if (mp.phase === "draw" && on.every((p) => mp.done.has(p.id))) return finishDrawPhase(room);
    if (mp.phase === "watch") {
      const eligiblePresent = room.players.filter((p) => mp.watch.eligibleIds.has(p.id) && (p.connected !== false || mp.watch.offlineGrace.has(p.id)));
      if (eligiblePresent.every((p) => mp.watch.solved.has(p.id))) return endWatch(room);
    }
  }

  // socket หลุด (ยังอยู่ในห้องช่วงรอ rejoin): ถ้าเกิน OFFLINE_WAIT_MS แล้วยังไม่กลับ ให้เช็คว่าคนที่เหลือเสร็จครบหรือยัง
  function onPlayerOffline(room, pid) {
    closePlayerStroke(room, pid);
    if (room.mp?.phase === "watch") {
      const w = room.mp.watch;
      const marker = {};
      w.offlineGrace.set(pid, marker);
      setTimeout(() => {
        if (room.mp?.watch !== w || w.offlineGrace.get(pid) !== marker) return;
        w.offlineGrace.delete(pid);
        if (room.players.some((p) => p.id === pid && p.connected === false)) checkProgress(room);
      }, OFFLINE_WAIT_MS);
      return;
    }
    setTimeout(() => {
      const p = room.players.find((x) => x.id === pid);
      if (p && p.connected === false) checkProgress(room);
    }, OFFLINE_WAIT_MS);
  }

  function onPlayerLeft(room, pid) {
    closePlayerStroke(room, pid);
    const e = room.mp?.entries.get(pid);
    if (e) e.left = true; // เก็บคะแนน/ภาพไว้ แค่ทำเครื่องหมาย
    room.mp?.watch?.offlineGrace.delete(pid);
    checkProgress(room);
  }

  function stop(room) {
    if (!room.mp) return;
    clearTimers(room);
    room.mp.token++;
  }

  // คนเข้ากลางเกม/กลับมาหลังหลุด → มีที่เก็บคะแนนของตัวเอง (กลับมาแล้วไม่นับว่าออก)
  function addPlayer(room, player) {
    if (room.mp) {
      entryOf(room, player);
      if (room.mp.phase === "draw" && !room.mp.boards.has(player.id)) room.mp.boards.set(player.id, createPrivateBoard(player.id, room.mp.challenge));
      room.mp.watch?.offlineGrace.delete(player.id);
    }
  }

  // สถานะทั้งหมดของคนที่เข้ามากลางเกม/รีเฟรช — คำที่ AI ทายมีเฉพาะของตัวเอง · ภาพคนอื่นมีเฉพาะหลังแกลเลอรีเปิด · ช่วง 2 ไม่มีคำตอบ
  function snapshot(room, pid) {
    const mp = room.mp;
    if (!mp) return null;
    const base = { round: mp.round, totalRounds: room.settings.rounds, phase: mp.phase, timeLeft: mp.timeLeft ?? null, time: mp.time ?? null };
    if (mp.phase === "draw" || mp.phase === "eval") {
      Object.assign(base, {
        word: mp.word,
        category: mp.category,
        challenge: mp.challenge,
        intro: mp.intro,
        myCanvas: canvasPayload(mp.boards.get(pid) ?? createPrivateBoard(pid, mp.challenge)),
        penLocked: !!mp.boards.get(pid)?.penUsed,
        doneIds: [...mp.done.keys()],
        myGuesses: (mp.preds.get(pid) || []).map((p) => ({ guess: p.guess, correct: p.correct })),
        myPoints: mp.done.get(pid)?.points ?? null,
      });
    }
    if (mp.gallery) base.gallery = mp.gallery;
    if (mp.phase === "watch" || mp.phase === "watch_end") {
      const w = mp.watch;
      base.watch = {
        category: w.category,
        time: w.time,
        hintAt: w.hintAt,
        hint: w.hint,
        strokes: w.strokes,
        serverNow: Date.now(),
        solvedIds: [...w.solved.keys()],
        myPoints: w.solved.get(pid) ?? null,
        chat: w.chat.filter((item) => !item.recipients || item.recipients.includes(pid)).map(({ recipients, ...item }) => item),
      };
    }
    if (mp.phase === "watch_end") base.watchEnd = mp.watchEnd;
    return base;
  }

  return { startGame, addPlayer, actionRoom, clearPlayerDrawing, handleSnapshot, handleGuess, onPlayerOffline, onPlayerLeft, checkProgress, stop, snapshot, ranking };
};
