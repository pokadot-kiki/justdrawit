import { useState } from "react";
import { socket } from "../socket";

// สร้างห้อง / เข้าห้อง ผ่าน socket (ใช้ร่วมกันระหว่างหน้า SET UP กับกล่องใส่รหัสห้อง)
// ฝั่งนี้แค่ช่วยให้ใช้ง่าย ของจริง server เป็นคนตรวจซ้ำเสมอ (server-authoritative)
export function useEnterRoom({ connected, onEntered, onError }) {
  const [busy, setBusy] = useState(false);

  // event = "create_room" | "join_room" · payload ตามหน้าตาใน events.md §1
  function enter(event, payload, { name, avatar, avatarPhoto = null }) {
    if (busy || !connected) return;
    setBusy(true);

    // กันตอบซ้ำ: ถ้า server ไม่ตอบใน 6 วิ (เช่นลืมเปิด server) ให้ปลดล็อกปุ่มแล้วบอกผู้ใช้
    let answered = false;
    const finish = (fn) => {
      if (answered) return;
      answered = true;
      setBusy(false);
      fn();
    };

    socket.timeout(6000).emit(event, payload, (err, res) => {
      if (err) return finish(() => onError("CONNECT_FAILED"));
      if (!res?.ok) return finish(() => onError(res?.error));
      // join_room ไม่ได้ส่ง code กลับมา เราใช้รหัสที่ผู้ใช้พิมพ์เอง
      finish(() => onEntered({ playerId: res.playerId, code: res.code ?? payload.code, name, avatar, avatarPhoto }));
    });
  }

  return { busy, enter };
}
