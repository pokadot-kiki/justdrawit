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
  TOO_FAST: "กรุณารอสักครู่ก่อนโจมตีอีกครั้ง",
  SHIELDED: "โล่ของเป้าหมายป้องกันการโจมตีครั้งนี้ พลังไม่ถูกหัก",
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

export default function ChaosBar({ chaos, players, meId, phase, doneIds, now, intro }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [energyNotice, setEnergyNotice] = useState("");
  const busyRef = useRef(false);
  const previousEnergy = useRef(null);
  const energy = chaos?.energy ?? 0;
  const maximum = chaos?.maxEnergy ?? 100;
  const aiBusy = (chaos?.aiEffect?.until ?? 0) > now;
  const targets = phase === "draw"
    ? [...players.filter((p) => p.id !== meId && p.connected !== false && !doneIds.includes(p.id)).map((p) => ({ id: p.id, name: p.name })), ...(!aiBusy ? [{ id: "ai", name: "AI ผู้ทาย" }] : [])]
    : phase === "watch" && !aiBusy ? [{ id: "ai", name: "AI ผู้วาด" }] : [];
  const activePhase = phase === "draw" || phase === "watch";
  const canAttack = !!chaos && !intro && activePhase && targets.length > 0;

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
        setEnergyNotice(`−${selected.price} Energy`);
        setMessage(`โจมตี ${targetId === "ai" ? "AI" : targets.find((t) => t.id === targetId)?.name ?? "ผู้เล่น"} ด้วย ${selected.name} สำเร็จ`);
      }
    });
  }

  return <section className="chaos-bar" aria-label="CHAOS ATTACK">
    <div className="chaos-bar__energy"><strong>ϟ CHAOS ATTACK</strong><span>พลังโจมตี: <b>{energy} / {maximum}</b></span><div className="chaos-bar__meter" role="progressbar" aria-valuenow={energy} aria-valuemax={maximum}><i style={{ width: `${Math.min(100, energy / maximum * 100)}%` }} /></div><small>วาดครบ 2 ครั้งได้ +10 (สูงสุด 40 ต่อรอบ) · ทายถูกได้ +15</small><small>{chaos ? chaos.shield ? "🛡 โล่พร้อมป้องกัน 1 ครั้ง" : "โล่ใช้ไปแล้วในรอบนี้" : "รอสถานะจาก Server"}</small>{energyNotice && <span className="chaos-bar__notice" role="status">{energyNotice}</span>}</div>
    <div className="chaos-bar__items">{items.map((item) => {
      const left = Math.max(0, Math.ceil(((chaos?.cooldowns?.[item.id] ?? 0) - now) / 1000));
      const status = !activePhase ? "รอช่วงโจมตี" : intro ? "รอเริ่มรอบ" : !chaos ? "รอข้อมูล Server" : !targets.length ? "ยังไม่มีเป้าหมายโจมตี" : left ? `Cooldown ${left} วิ` : energy < item.price ? "พลังงานไม่เพียงพอ" : busy ? "กำลังยืนยัน" : selected?.id === item.id ? "กำลังเลือก" : "พร้อมใช้";
      const disabled = !canAttack || Boolean(left) || energy < item.price || busy;
      return <div key={item.id} className="chaos-item-wrap" title={`${item.name} · ${item.price} Energy\n${ABILITY[item.id].detail}\n${status}`} tabIndex={disabled ? 0 : -1} aria-label={disabled ? `${item.name}: ${status}. ${ABILITY[item.id].detail}` : undefined}><button type="button" className={`chaos-item${selected?.id === item.id ? " chaos-item--selected" : ""}`} disabled={disabled} aria-label={`${item.name} ${item.price} Energy: ${ABILITY[item.id].detail}. ${status}`} onClick={() => { setSelected(item); setMessage(""); }}><AttackArt id={item.id} /><strong>{item.name}</strong><span className="chaos-item__price">ϟ {item.price} Energy</span><span className="chaos-item__ability">{ABILITY[item.id].short}</span><em className={disabled ? "chaos-item__status chaos-item__status--disabled" : "chaos-item__status"}>{status}</em></button></div>;
    })}</div>
    {message && <p className="chaos-bar__message" role="status">{message}</p>}
    {selected && <Modal labelledBy="chaos-target-title" onClose={busy ? undefined : () => setSelected(null)}><h2 className="modal__title" id="chaos-target-title">{selected.name} · เลือกเป้าหมาย</h2><div className="chaos-targets">{targets.map((target) => <button type="button" className="btn" key={target.id} disabled={busy} onClick={() => useItem(target.id)}>{target.name}</button>)}</div><div className="modal__actions"><button type="button" className="btn" disabled={busy} onClick={() => setSelected(null)}>ยกเลิก</button></div></Modal>}
  </section>;
}
