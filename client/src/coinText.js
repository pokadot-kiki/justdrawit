// ข้อความของ coin ที่ได้ (แจ้งเตือนตอน wallet_update และสรุปท้ายเกม) — แสดงผลอย่างเดียว
// จำนวนและเหตุผลมาจาก server ทั้งหมด (events.md หัวข้อ 11) ฝั่งนี้ไม่คิดเลขเองนอกจากบวกรวมไว้โชว์
export const COIN_REASON_TEXT = {
  guessCorrect: "ทายถูก",
  firstGuess: "ทายถูกคนแรก",
  drawerPerGuesser: "มีคนทายภาพคุณถูก",
  finishGame: "เล่นจนจบเกม",
  dailyBonus: "โบนัสเกมแรกของวัน",
};

const cleanGains = (gains) =>
  (Array.isArray(gains) ? gains : []).filter((g) => g && typeof g.reason === "string" && Number.isFinite(g.amount) && g.amount > 0);

// ข้อความสั้นสำหรับ toast เช่น "+15 coin · ทายถูก · ทายถูกคนแรก" (ไม่มีรายการ = null ไม่ต้องโชว์)
export function coinToastText(gains) {
  const list = cleanGains(gains);
  if (list.length === 0) return null;
  const total = list.reduce((n, g) => n + g.amount, 0);
  const why = [...new Set(list.map((g) => COIN_REASON_TEXT[g.reason] ?? "ได้ coin"))].join(" · ");
  return `+${total} coin · ${why}`;
}

// ยอดสะสมของเกมนี้: { total, byReason: { reason: amount } } — บวกเพิ่มจาก gains ของ wallet_update หนึ่งครั้ง
export const emptyCoinSummary = () => ({ total: 0, byReason: {} });
export function addGains(summary, gains) {
  const next = { total: summary.total, byReason: { ...summary.byReason } };
  for (const g of cleanGains(gains)) {
    next.total += g.amount;
    next.byReason[g.reason] = (next.byReason[g.reason] ?? 0) + g.amount;
  }
  return next;
}

// รายการย่อยเรียงตามลำดับในตาราง เช่น [["ทายถูก", 30], ["เล่นจนจบเกม", 5]]
export function summaryRows(summary) {
  return Object.keys(COIN_REASON_TEXT)
    .filter((reason) => summary?.byReason?.[reason] > 0)
    .map((reason) => [COIN_REASON_TEXT[reason], summary.byReason[reason]]);
}
