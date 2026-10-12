// แถบแดงมุมบน ใช้แสดง game_error และ error จาก callback
// ตัว App เป็นคนคุมว่าจะโชว์อะไรและซ่อนเมื่อไร คอมโพเนนต์นี้แค่แสดง
export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={toast.tone === "coin" ? "toast toast--coin" : "toast"} role={toast.tone === "coin" ? "status" : "alert"}>
      {toast.text}
    </div>
  );
}
