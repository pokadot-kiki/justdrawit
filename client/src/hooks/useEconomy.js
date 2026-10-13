import { useEffect, useState } from "react";
import { socket } from "../socket";

export function useEconomy() {
  const [economy, setEconomy] = useState(null);

  useEffect(() => {
    const refresh = () => {
      socket.timeout(6000).emit("get_economy", (error, result) => {
        if (!error && result?.ok) setEconomy(result.state);
      });
    };
    const update = (state) => setEconomy(state);
    socket.on("connect", refresh);
    socket.on("economy_update", update);
    if (socket.connected) refresh();
    return () => {
      socket.off("connect", refresh);
      socket.off("economy_update", update);
    };
  }, []);

  function request(event, data) {
    if (!socket.connected) return Promise.resolve({ ok: false, error: "CONNECT_FAILED" });
    return new Promise((resolve) => {
      socket.timeout(6000).emit(event, data, (error, result) => {
        if (error) return resolve({ ok: false, error: "CONNECT_FAILED" });
        if (result?.ok) setEconomy(result.state);
        resolve(result ?? { ok: false, error: "SERVER_ERROR" });
      });
    });
  }

  return {
    economy,
    buyItem: (itemId) => request("buy_item", { itemId }),
    saveOutfit: (outfit) => request("save_outfit", { outfit }),
    resetEconomy: () => setEconomy(null),
  };
}
