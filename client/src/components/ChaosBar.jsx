import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import Modal from "./Modal";
import items from "../../../shared/chaos-items.json";

const ABILITY = {
  cursed_doodle: { short: "เส้นวาดผิดเพี้ยน", detail: "ทำให้เส้นที่เป้าหมายวาดผิดเพี้ยนชั่วคราว" },
  blackout: { short: "บังพื้นที่ภาพ", detail: "บังบางส่วนของภาพที่เป้าหมายมองเห็นชั่วคราว" },
  pixel_fly: { short: "แมลงรบกวนภาพ", detail: "ส่งแมลงพิกเซลเคลื่อนไหวรบกวนพื้นที่ภาพชั่วคราว" },
  shaky_hand: { short: "เส้นวาดสั่น", detail: "ทำให้เส้นที่เป้าหมายวาดสั่นชั่วคราว" },
  ice_canvas: { short: "หยุดการวาด", detail: "แช่แข็งผ้าใบของเป้าหมาย ทำให้วาดไม่ได้ชั่วคราว" },
  rainbow_chaos: { short: "สีเส้นเปลี่ยน", detail: "ทำให้สีเส้นที่เป้าหมายวาดเปลี่ยนไปชั่วคราว" },
};

const ERROR_TEXT = {
  INVALID_ITEM: "ไม่พบไอเทมโจมตี", INVALID_TARGET: "เลือกเป้าหมายไม่ได้ในช่วงนี้",
  INVALID_PHASE: "ช่วงนี้ยังโจมตีไม่ได้", NOT_IN_GAME: "เกมยังไม่พร้อมให้โจมตี",
  CHALLENGE_CONFLICT: "สีรุ้งป่วนใช้กับ Colour Fix ไม่ได้", TARGET_BUSY: "เป้าหมายกำลังติดเอฟเฟกต์อยู่",
  COOLDOWN: "ไอเทมยังอยู่ในช่วงพัก", NO_ENERGY: "พลังโจมตีไม่เพียงพอ",
  ATTACK_USED: "ใช้การโจมตีแล้วในตานี้",
  TOO_FAST: "กรุณารอสักครู่ก่อนโจมตีอีกครั้ง",
  SHIELDED: "โล่ของเป้าหมายป้องกันสกิลครั้งนี้ พลังไม่ถูกหัก",
};

function AttackArt({ id }) {
  const dark = "#18183d";
  return <svg viewBox="0 0 40 40" shapeRendering="crispEdges" aria-hidden="true" className="chaos-art">
    {id === "cursed_doodle" && <><path d="m8 29 20-22 6 6-20 22-9 2z" fill="#b54bda" stroke={dark} strokeWidth="3" /><path d="m24 11 6 6" stroke="#efb9ff" strokeWidth="4" /></>}
    {id === "blackout" && <><path d="M20 7 8 16v16h24V16z" fill="#303454" stroke={dark} strokeWidth="3" /><path d="M15 12h10M18 8h4" stroke="#8793c8" strokeWidth="4" /><circle cx="24" cy="23" r="3" fill="#6f78a5" /></>}
    {id === "pixel_fly" && <><path d="M14 15 5 8l-2 9 11 5m12-7 9-7 2 9-11 5" fill="#9bdbb1" stroke={dark} strokeWidth="2" /><rect x="13" y="14" width="14" height="19" fill="#774733" stroke={dark} strokeWidth="3" /><path d="M19 19h3M19 26h3" stroke="#f7bc6c" strokeWidth="3" /><path d="M10 30H4m32 0h-6" stroke={dark} strokeWidth="3" /></>}
    {id === "shaky_hand" && <><path d="M20 4C7 7 7 17 18 19c11 2 14 10 3 15" fill="none" stroke={dark} strokeWidth="9" /><path d="M20 4C7 7 7 17 18 19c11 2 14 10 3 15" fill="none" stroke="#6294f4" strokeWidth="5" /></>}
    {id === "ice_canvas" && <><path d="M20 3v34M3 20h34M8 8l24 24M32 8 8 32" stroke={dark} strokeWidth="7" /><path d="M20 3v34M3 20h34M8 8l24 24M32 8 8 32" stroke="#71dafa" strokeWidth="4" /></>}
    {id === "rainbow_chaos" && <><path d="M6 33C6 10 33 10 34 33" fill="none" stroke={dark} strokeWidth="11" /><path d="M6 33C6 10 33 10 34 33" fill="none" stroke="#ef487e" strokeWidth="7" /><path d="M11 33c0-16 18-16 18 0" fill="none" stroke="#f7cd4c" strokeWidth="6" /><path d="M16 33c0-9 8-9 8 0" fill="none" stroke="#50cfc1" strokeWidth="5" /></>}
  </svg>;
}

export function ChaosOverlay({ effect }) {
  if (!effect) return null;
  return <div className={`chaos-overlay chaos-overlay--${effect.id}`} aria-live="polite">
    {effect.id === "blackout" && <div className="chaos-overlay__blackout" />}
    {effect.id === "pixel_fly" && <div className="chaos-overlay__flies">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</div>}
    <span className="chaos-overlay__label">{effect.id === "ice_canvas" ? "ผ้าใบถูกแช่แข็ง" : "กำลังโดน CHAOS ATTACK"}</span>
  </div>;
}

export function ChaosEffectBadge({ effect, now }) {
  if (!effect) return null;
  const item = items.find((entry) => entry.id === effect.id);
  return <div className="chaos-ai-effect" role="status">ϟ AI ถูกโจมตี: {item?.name ?? "CHAOS ATTACK"} · เหลือ {Math.max(0, Math.ceil((effect.until - now) / 1000))} วิ</div>;
}

export default function ChaosBar({ chaos, syncError, onConfirmedState, players, meId, phase, doneIds, now, intro, challenge }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [energyNotice, setEnergyNotice] = useState("");
  const busyRef = useRef(false);
  const previousEnergy = useRef(null);
  const energy = chaos?.energy ?? 0;
  const maximum = chaos?.maxEnergy ?? 100;
  const currentRules = typeof chaos?.attackUsed === "boolean";
  const eligiblePlayers = phase === "draw"
    ? players.filter((p) => p.id !== meId && p.connected !== false && !doneIds.includes(p.id) && !(chaos?.targetEffects?.[p.id]?.until > now)).map((p) => ({ id: p.id, name: p.name }))
    : [];
  const targets = selected?.id === "rainbow_chaos" && challenge?.type === "colour_fix" ? [] : eligiblePlayers;
  const activePhase = phase === "draw";
  const canAttack = currentRules && !chaos.attackUsed && !intro && activePhase && eligiblePlayers.length > 0;

  useEffect(() => {
    if (!chaos) { previousEnergy.current = null; return; }
    if (previousEnergy.current !== null && energy > previousEnergy.current) setEnergyNotice(`+${energy - previousEnergy.current} Energy`);
    previousEnergy.current = energy;
  }, [chaos, energy]);
  useEffect(() => {
    if (!energyNotice) return undefined;
    const timer = setTimeout(() => setEnergyNotice(""), 3200);
    return () => clearTimeout(timer);
  }, [energyNotice]);
  useEffect(() => {
    if (phase !== "draw") { setOpen(false); setSelected(null); }
  }, [phase]);

  function useItem(targetId) {
    if (!selected || !canAttack || !targets.some((target) => target.id === targetId) || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    socket.timeout(6000).emit("chaos_attack", { itemId: selected.id, targetId }, (error, result) => {
      busyRef.current = false;
      setBusy(false);
      setSelected(null);
      if (error) setMessage("เชื่อมต่อ Server ไม่สำเร็จ กรุณาลองอีกครั้ง");
      else if (!result?.ok) setMessage(ERROR_TEXT[result?.error] ?? "โจมตีไม่สำเร็จ");
      else {
        onConfirmedState?.(result.state);
        setEnergyNotice(`−${selected.price} Energy`);
        setMessage(`โจมตี ${targets.find((t) => t.id === targetId)?.name ?? "ผู้เล่น"} ด้วย ${selected.name} สำเร็จ`);
        setOpen(false);
      }
    });
  }

  const closePanel = () => { setSelected(null); setOpen(false); };
  return <div className="mp-ai-skills">
    <button type="button" className="btn mp-ai-skills__trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
      ⚡ สกิล <span>{energy}/{maximum}</span>
    </button>
    {message && <span className="mp-ai-skills__feedback" role="status">{message}</span>}
    {energyNotice && <span className="mp-ai-skills__feedback" role="status">{energyNotice}</span>}
    {open && <Modal labelledBy="chaos-panel-title" panelClassName="chaos-modal" onClose={busy ? undefined : closePanel}>
      <h2 className="modal__title" id="chaos-panel-title">{selected ? `${selected.name} · เลือกผู้เล่น` : "⚡ เลือกสกิล"}</h2>
      <div className="chaos-modal__energy">
        <strong>Energy {energy}/{maximum}</strong>
        <div className="chaos-bar__meter" role="progressbar" aria-valuenow={energy} aria-valuemax={maximum}><i style={{ width: `${Math.min(100, energy / maximum * 100)}%` }} /></div>
        <small>ใช้สกิลได้ 1 ครั้งต่อตา · AI ทายภาพคุณถูก +10 Energy</small>
      </div>
      {selected ? <>
        <p className="chaos-modal__hint">เลือกผู้เล่นหนึ่งครั้งเพื่อใช้สกิลทันที</p>
        <div className="chaos-targets">{targets.map((target) => <button type="button" className="btn" key={target.id} disabled={busy} onClick={() => useItem(target.id)}>{target.name}</button>)}</div>
        {!targets.length && <p role="status">ไม่มีผู้เล่นที่ใช้เป็นเป้าหมายได้ในตอนนี้</p>}
        <button type="button" className="btn" disabled={busy} onClick={() => setSelected(null)}>กลับไปเลือกสกิล</button>
      </> : <div className="chaos-bar__items">{items.map((item) => {
        const left = Math.max(0, Math.ceil(((chaos?.cooldowns?.[item.id] ?? 0) - now) / 1000));
        const challengeConflict = item.id === "rainbow_chaos" && challenge?.type === "colour_fix";
        const status = !activePhase ? "รอช่วงโจมตี" : intro ? "รอเริ่มรอบ" : !chaos ? syncError ? "Server ยังไม่พร้อม" : "รอข้อมูล Server" : !currentRules ? "กรุณารีสตาร์ต Server" : chaos.attackUsed ? "ใช้สกิลแล้วในตานี้" : challengeConflict ? "ใช้กับ Colour Fix ไม่ได้" : !eligiblePlayers.length ? "ไม่มีเป้าหมาย" : left ? `Cooldown ${left} วิ` : energy < item.price ? "พลังงานไม่เพียงพอ" : busy ? "กำลังยืนยัน" : "พร้อมใช้";
        const disabled = !canAttack || challengeConflict || Boolean(left) || energy < item.price || busy;
        return <div key={item.id} className="chaos-item-wrap" title={ABILITY[item.id].detail}><button type="button" className="chaos-item" disabled={disabled} aria-label={`${item.name} ${item.price} Energy: ${ABILITY[item.id].detail}. ${status}`} onClick={() => { setSelected(item); setMessage(""); }}><AttackArt id={item.id} /><strong>{item.name}</strong><span className="chaos-item__price">ϟ {item.price} Energy</span><span className="chaos-item__ability">{ABILITY[item.id].short}</span><em className={disabled ? "chaos-item__status chaos-item__status--disabled" : "chaos-item__status"}>{status}</em></button></div>;
      })}</div>}
      {message && <p className="chaos-modal__message" role="status">{message}</p>}
      <div className="modal__actions"><button type="button" className="btn" disabled={busy} onClick={closePanel}>ปิด</button></div>
    </Modal>}
  </div>;
}
