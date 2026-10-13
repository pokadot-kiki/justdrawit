import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "@firebase/auth";
import { socket } from "./socket";
import { errorText } from "./messages";
import { useGame } from "./hooks/useGame";
import { useMpAi } from "./hooks/useMpAi";
import { useEconomy } from "./hooks/useEconomy";
import MpAiGame from "./screens/MpAiGame";
import Lobby from "./screens/Lobby";
import AvatarShop from "./screens/AvatarShop";
import AvatarDressingRoom from "./screens/AvatarDressingRoom";
import { initialName, loadAvatar, saveAvatar, saveName } from "./playerName";
import { AVATARS } from "./avatars";
import { getUserAuth } from "./prefs";
import ProfileModal from "./components/ProfileModal";
import AvatarUploadModal from "./components/AvatarUploadModal";
import { firebaseAuth } from "./firebase";
import { avatarStorageError, loadAvatarPhoto, removeAvatarPhoto, storageReady, uploadAvatarPhoto } from "./avatarStorage";
import WaitingRoom from "./screens/WaitingRoom";
import Game from "./screens/Game";
import Leaderboard from "./screens/Leaderboard";
import SoloAI from "./screens/SoloAI";
import SetUp from "./screens/SetUp";
import CategorySelection from "./screens/CategorySelection";
import Achievements from "./screens/Achievements";
const Login = lazy(() => import("./screens/Login"));
import AudioDock from "./components/AudioDock";
import AuthButton from "./components/AuthButton";
import { PHOTO_UPLOAD_ENABLED } from "./featureFlags";
import { roomCodeFromSearch } from "./invite";
import Toast from "./components/Toast";

// แปลง URL เป็น "หน้าจอ" — URL คือความจริงว่าตอนนี้อยู่หน้าไหน (ไม่ใช่ state ในหน่วยความจำเหมือนเดิม)
// จึงรีเฟรชแล้วอยู่หน้าเดิม และปุ่มย้อนกลับของเบราว์เซอร์พากลับหน้าก่อนหน้าได้
//   /              หน้าแรก (รับ ?room=12345 จากลิงก์เชิญ)
//   /setup         ตั้งค่าก่อนสร้างห้อง
//   /room/12345    ห้อง (ห้องรอ หรือหน้าเกม แล้วแต่สถานะของห้อง)
//   /leaderboard   อันดับคะแนน
//   /solo          แข่งกับ AI
function parseRoute(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { screen: "lobby" };
  if (path === "/login") return { screen: "login" };
  if (path === "/setup") return { screen: "setup" };
  if (path === "/leaderboard") return { screen: "leaderboard" };
  if (path === "/solo") return { screen: "solo" };
  if (path === "/shop") return { screen: "shop" };
  if (path === "/dressing-room") return { screen: "dressing" };
  const m = /^\/room\/(\d{5})$/.exec(path);
  if (m) return { screen: "room", code: m[1] };
  return { screen: "unknown" };
}

// App เป็นที่เดียวที่ผูก socket ไว้ หน้าจออื่นรับข้อมูลเป็น props
// ทำแบบนี้เพราะ socket เป็นของกลาง ถ้าต่างคนต่างผูก จะมี listener ซ้ำและลืมถอดออกง่าย
export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = parseRoute(location.pathname);
  const routeCode = route.screen === "room" ? route.code : null;

  const [connected, setConnected] = useState(socket.connected);
  const [auth, setAuth] = useState({ loading: true, enabled: false, user: null, error: null });
  const [room, setRoom] = useState(null); // RoomState ก้อนล่าสุดจาก server
  const [me, setMe] = useState(null); // { playerId, name, avatar, code } ของเครื่องนี้
  const [inGame, setInGame] = useState(false); // อยู่ในห้องแล้วเกมเริ่มหรือยัง (ห้องรอ ↔ หน้าเกม)
  // ชื่อ + อวตารที่เลือกในหน้าแรก อยู่ที่นี่เพื่อให้ติดไปหน้า SET UP / Solo ได้ ไม่ต้องกรอกซ้ำ
  const [profile, setProfile] = useState(() => ({ name: initialName(getUserAuth()?.username), avatar: loadAvatar(AVATARS.length, getUserAuth()?.username), avatarPhoto: null }));
  const [showProfile, setShowProfile] = useState(false);
  const [showAvatarUpload, setShowAvatarUpload] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  // ค่าเริ่ม Solo ที่ส่งมาจากหน้า SET UP (เลือกโหมด "แข่งกับ AI") → SoloAI เริ่มเกมทันทีด้วยความยากนี้
  // null = เข้า /solo ตรง ๆ (เช่นรีเฟรช) จะเห็นหน้ากรอกชื่อตามปกติ
  const [soloBoot, setSoloBoot] = useState(null);
  const [toast, setToast] = useState(null);
  const { economy, buyItem, saveOutfit, resetEconomy } = useEconomy();
  const toastTimer = useRef(null);
  // me แบบอ่านได้ทันที (ไม่ต้องรอ React วาดรอบใหม่) + socket.id ตอนที่เราเข้าห้องสำเร็จ
  // ถ้า socket.id ตอนนี้ไม่ตรงกับที่จำไว้ แปลว่าหลุดแล้วต่อใหม่ → server ยังไม่รู้ว่า socket ตัวใหม่นี้อยู่ห้องไหน ต้อง rejoin
  const meRef = useRef(null);
  const joinedSidRef = useRef(null);
  const rejoiningRef = useRef(null);

  // เปิดจากลิงก์เชิญ /?room=12345 → หน้าแรกเปิดกล่องใส่รหัสให้เอง
  const inviteCode = route.screen === "lobby" ? roomCodeFromSearch(location.search) : null;

  // ล็อกอินเป็นทางเลือก ไม่ใช่ของบังคับ — แค่ถามเฉยๆ ว่ามีใครล็อกอินค้างไว้ไหม (cookie) ไม่เคยกันไม่ให้เล่น
  // ต่อ server ไม่ได้/ยังไม่ได้ตั้งค่า Firebase เลย = enabled:false → ปุ่ม "เข้าสู่ระบบ" ซ่อนไปเอง เกมเล่นได้ปกติทุกกรณี
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((result) => {
        if (active) setAuth({ loading: false, enabled: result.enabled === true, user: result.user ?? null, error: null });
      })
      .catch(() => {
        if (active) setAuth({ loading: false, enabled: false, user: null, error: null });
      });
    return () => { active = false; };
  }, []);

  // รูปอยู่ใน Firebase Storage ตาม UID เท่านั้น ไม่เก็บ URL หรือไฟล์ใน localStorage
  useEffect(() => {
    // ปิดอัปโหลดรูปอยู่: ไม่ติดต่อ Firebase Storage เลย (ไม่มี error ของ Storage โผล่)
    if (!PHOTO_UPLOAD_ENABLED || !auth.user?.uid || !firebaseAuth) {
      setProfile((previous) => previous.avatarPhoto ? { ...previous, avatarPhoto: null } : previous);
      return undefined;
    }
    let active = true;
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (!active) return;
      if (!user || user.uid !== auth.user.uid) {
        setProfile((previous) => previous.avatarPhoto ? { ...previous, avatarPhoto: null } : previous);
        return;
      }
      try {
        await storageReady();
        const avatarPhoto = await loadAvatarPhoto(user.uid);
        if (!active) return;
        setProfile((previous) => ({ ...previous, avatarPhoto }));
        const own = meRef.current;
        if (own?.code && socket.connected && own.avatarPhoto !== avatarPhoto) {
          socket.timeout(6000).emit("update_profile", { name: own.name, avatar: own.avatar, avatarPhoto }, () => {});
        }
      } catch {
        // Storage ยังไม่พร้อม: คงอวตารตัวละครเดิม และแจ้งสาเหตุเมื่อเปิดหน้ารูปโปรไฟล์
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [auth.user?.uid]);

  useEffect(() => {
    if (route.screen === "login" && auth.user) navigate("/", { replace: true });
  }, [auth.user, navigate, route.screen]);

  // สถานะของเกมที่กำลังเล่น ผูก socket ไว้ที่นี่ (ไม่ใช่ในหน้า Game) เพื่อไม่ให้ event หลุด
  // ดูเหตุผลเต็มๆ ในคอมเมนต์ของ useGame
  const {
    game,
    chooseLeft,
    chooseWord,
    sendGuess,
    startGame,
    backToLobby,
    resetGame,
    clearMessages,
    // ข้อ 4: ส่งการวาดออก · ขอย้อน/ทำซ้ำ · ผูกกระดานเข้ากับตัวรับ action ของคนอื่น
    sendAction,
    askUndo,
    askRedo,
    askHint,
    bindCanvas,
  } = useGame(room?.settings?.teamNames);
  // โหมด Multiplayer vs AI: ผูก event ไว้ที่ App เหมือน useGame (event แรกมาก่อนหน้าจอเกมจะเกิด)
  const { mp, sendSnapshot: mpSnapshot, acceptChaosState } = useMpAi(me?.playerId);

  function showToast(text) {
    setToast({ text, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    // server ส่ง room_update ทุกครั้งที่มีคนเข้าออก แก้ตั้งค่า หรือคะแนนเปลี่ยน
    // หน้าจอแค่เอาค่าที่ได้ไปแสดง ไม่ต้องคำนวณเอง
    const onRoomUpdate = (next) => {
      setRoom(next);
      if (next.status === "category_selection") setInGame(false);
      const own = next.code === meRef.current?.code ? next.players?.find((p) => p.id === meRef.current?.playerId) : null;
      if (own) {
        const info = { ...meRef.current, name: own.name, avatar: own.avatar, avatarPhoto: own.avatarPhoto ?? null, outfit: own.outfit };
        meRef.current = info;
        setMe(info);
        setProfile((previous) => previous.name === own.name && previous.avatar === own.avatar && previous.avatarPhoto === (own.avatarPhoto ?? null)
          ? previous : { name: own.name, avatar: own.avatar, avatarPhoto: own.avatarPhoto ?? null });
      }
    };
    const onGameStarted = () => setInGame(true);
    // รีเฟรชหลังเกมจบ: server ส่ง game_end กลับมาให้ (ไม่มี game_started) → ต้องอยู่หน้าเกมเพื่อโชว์ผลจบเกม
    const onGameEnd = () => setInGame(true);
    // server พาทุกคนกลับห้องรอหลังจบเกม (ห้องเดิม หัวห้องเดิม) → สลับไปหน้าห้องรอ
    const onLobbyReturn = () => setInGame(false);
    const onGameError = (err) => showToast(errorText(err?.code));
    const onAchievementUnlocked = (data) => showToast(`ปลดล็อก Achievement และฉายา: ${data?.title}`);
    const onEconomyReward = (data) => {
      if (Number.isSafeInteger(data?.coins) && data.coins > 0) showToast(`ได้รับ ${data.coins} Coins จากการเล่นเกม`);
    };
    // ถูกหัวห้องเตะออก — กลับหน้าแรกพร้อมข้อความ · ออกจาก URL ห้องแล้ว effect จะไม่ rejoin กลับเอง
    const onKicked = () => {
      showToast("คุณถูกหัวห้องเชิญออกจากห้อง");
      clearRoom();
      navigate("/");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room_update", onRoomUpdate);
    socket.on("game_started", onGameStarted);
    socket.on("game_end", onGameEnd);
    socket.on("lobby_return", onLobbyReturn);
    socket.on("game_error", onGameError);
    socket.on("achievement_unlocked", onAchievementUnlocked);
    socket.on("economy_reward", onEconomyReward);
    socket.on("kicked", onKicked);

    // สำคัญมาก: socket อาจต่อติดไปแล้วก่อนที่ effect นี้จะได้ทำงาน (เกิดจริงตอน dev
    // เพราะ StrictMode ถอด listener ออกแล้วใส่ใหม่) ถ้าพลาด event "connect" ไปแล้ว
    // มันจะไม่ยิงซ้ำอีก ปุ่มจะถูกปิดค้างตลอด จึงต้องอ่านสถานะจริง ณ ตอนนี้ด้วย
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room_update", onRoomUpdate);
      socket.off("game_started", onGameStarted);
      socket.off("game_end", onGameEnd);
      socket.off("lobby_return", onLobbyReturn);
      socket.off("game_error", onGameError);
      socket.off("achievement_unlocked", onAchievementUnlocked);
      socket.off("economy_reward", onEconomyReward);
      socket.off("kicked", onKicked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // จำชื่อล่าสุดที่ใช้ไว้ในเบราว์เซอร์ (พิมพ์เองก็จำ) เปิดครั้งหน้าใช้ชื่อเดิม
  useEffect(() => saveName(profile.name, getUserAuth()?.username), [profile.name]);
  useEffect(() => saveAvatar(profile.avatar, AVATARS.length, getUserAuth()?.username), [profile.avatar]);

  async function saveProfile(next) {
    if ((route.screen === "room" || route.screen === "solo") && !socket.connected) return { ok: false, error: "CONNECT_FAILED" };
    const avatarPhoto = next.avatarPhoto === undefined ? profile.avatarPhoto : next.avatarPhoto;
    if (PHOTO_UPLOAD_ENABLED && avatarPhoto === null && profile.avatarPhoto && auth.user?.uid) {
      if (firebaseAuth?.currentUser?.uid !== auth.user.uid) return { ok: false, error: "AUTH_REQUIRED" };
      try {
        await storageReady();
        await removeAvatarPhoto(auth.user.uid);
      } catch (reason) {
        return { ok: false, error: reason?.code || reason?.message || "STORAGE_UNAVAILABLE" };
      }
    }
    const update = { ...next, avatarPhoto };
    if (route.screen !== "room" && route.screen !== "solo") {
      setProfile(update);
      return { ok: true };
    }
    return new Promise((resolve) => {
      socket.timeout(6000).emit("update_profile", update, (err, result) => {
        if (err) return resolve({ ok: false, error: "CONNECT_FAILED" });
        if (!result?.ok) {
          if (route.screen === "solo" && result?.error === "NOT_IN_GAME") {
            setProfile(update);
            return resolve({ ok: true });
          }
          return resolve(result ?? { ok: false, error: "SERVER_ERROR" });
        }
        const saved = { name: result.name, avatar: result.avatar, avatarPhoto: result.avatarPhoto ?? null };
        setProfile(saved);
        if (meRef.current) {
          meRef.current = { ...meRef.current, ...saved };
          setMe(meRef.current);
        }
        resolve({ ok: true });
      });
    });
  }

  async function uploadPhoto(file) {
    if (!auth.user?.uid || firebaseAuth?.currentUser?.uid !== auth.user.uid) return { ok: false, error: "AUTH_REQUIRED" };
    try {
      await storageReady();
      const avatarPhoto = await uploadAvatarPhoto(auth.user.uid, file);
      setProfile((previous) => ({ ...previous, avatarPhoto }));
      return { ok: true };
    } catch (reason) {
      return { ok: false, error: reason?.code || reason?.message || "STORAGE_UNAVAILABLE" };
    }
  }

  async function selectPresetAvatar(avatar) {
    const result = await saveProfile({ ...profile, avatar, avatarPhoto: null });
    if (!result.ok) showToast(avatarStorageError(result.error));
    return result;
  }

  // ล้างสถานะห้องในเครื่อง (ไม่ได้บอก server — คนเรียกเป็นคนตัดสินใจว่าต้องส่ง leave_room ไหม)
  function clearRoom() {
    meRef.current = null;
    joinedSidRef.current = null;
    resetGame();
    setRoom(null);
    setMe(null);
    setInGame(false);
  }

  // ── URL กับห้องต้องตรงกันเสมอ ──
  // 1) URL ไม่ใช่หน้าห้องแล้ว แต่เรายังอยู่ในห้อง (กดปุ่มย้อนกลับของเบราว์เซอร์) → ออกจากห้อง
  // 2) URL เป็นหน้าห้อง แต่ socket ตัวนี้ยังไม่ได้อยู่ในห้องนั้น (เพิ่งรีเฟรช / เน็ตหลุดแล้วต่อใหม่ / เปิดลิงก์ตรงๆ)
  //    → ขอ rejoin · server จำเราได้จาก playerId แล้วส่งสถานะทั้งหมดกลับมา (ห้อง คะแนน รอบ เวลา ภาพบนกระดาน)
  //    server ไม่รู้จักเรา (ไม่เคยอยู่ห้องนี้ หรือหลุดเกิน 30 วิ) → พาไปหน้าแรกพร้อมกล่องเข้าห้องที่เติมรหัสให้แล้ว
  useEffect(() => {
    if (route.screen === "unknown") {
      navigate("/", { replace: true });
      return;
    }
    if (!routeCode) {
      if (meRef.current) {
        socket.emit("leave_room");
        clearRoom();
      }
      return;
    }
    if (!connected) return; // ยังต่อ server ไม่ติด รอ connect ก่อน (effect นี้จะทำงานอีกรอบเอง)
    const inPlace = meRef.current?.code === routeCode && joinedSidRef.current === socket.id;
    const key = `${socket.id}:${routeCode}`;
    if (inPlace || rejoiningRef.current === key) return;
    rejoiningRef.current = key;

    socket.timeout(6000).emit("rejoin", { code: routeCode }, (err, res) => {
      if (rejoiningRef.current === key) rejoiningRef.current = null;
      if (err) return showToast(errorText("CONNECT_FAILED"));
      if (res?.ok) {
        const info = { playerId: res.playerId, name: res.name, avatar: res.avatar, avatarPhoto: res.avatarPhoto ?? null, outfit: res.outfit, code: res.code };
        meRef.current = info;
        joinedSidRef.current = socket.id;
        setMe(info);
        setProfile((p) => ({ ...p, name: res.name, avatar: res.avatar, avatarPhoto: res.avatarPhoto ?? null }));
        return;
      }
      clearRoom();
      if (res?.error === "NOT_IN_ROOM") return navigate(`/?room=${routeCode}`, { replace: true });
      showToast(errorText(res?.error));
      navigate("/", { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, routeCode, route.screen]);

  function handleEntered(info) {
    // เข้าห้องสำเร็จด้วยชื่อนี้ (อาจเป็นชื่อที่ต่อเลขให้หลังชื่อซ้ำ) → ใช้ชื่อนี้ต่อไป
    setProfile((p) => (p.name === info.name ? p : { ...p, name: info.name }));
    meRef.current = info;
    joinedSidRef.current = socket.id;
    setMe(info);
    setInGame(false);
    // ไปหน้าห้อง · มาจากหน้า SET UP หรือลิงก์เชิญ ให้ "แทนที่" หน้านั้นในประวัติ
    // กดย้อนกลับจากห้องจะได้กลับหน้าแรก ไม่ใช่กลับไปหน้าที่เพิ่งกดสร้าง/เข้าห้องซ้ำ
    const replace = location.pathname !== "/" || location.search !== "";
    navigate(`/room/${info.code}`, { replace });
  }

  function handleLeave() {
    socket.emit("leave_room");
    clearRoom();
    navigate("/");
  }

  const goHome = () => navigate("/");
  const openLeaderboard = (board) => navigate(`/leaderboard?board=${encodeURIComponent(board)}`);
  // อยู่ที่ URL ของห้อง และข้อมูลห้องนั้นมาถึงแล้ว
  const roomReady = route.screen === "room" && me && room && room.code === routeCode;
  // กลับมาห้องรอหลังจบเกม (inGame จริง→เท็จ ทั้งที่ยังอยู่ในห้อง) = ล้างแชทของเกมก่อนหน้า
  const wasInGame = useRef(false);
  useEffect(() => {
    if (wasInGame.current && !inGame && room) clearMessages();
    wasInGame.current = inGame;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inGame]);

  const showGame = roomReady && inGame && room.status !== "category_selection";
  // returnTo: หน้าที่จะกลับไปหลังล็อกอินสำเร็จ (กดปุ่ม "เข้าสู่ระบบ" จากหน้าไหนก็กลับไปหน้านั้น)
  const returnTo = route.screen === "login"
    ? new URLSearchParams(location.search).get("returnTo") || "/"
    : `${location.pathname}${location.search}`;

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (firebaseAuth) {
        try { await signOut(firebaseAuth); } catch { /* server session ถูกลบแล้ว ให้กลับเป็น Guest ต่อ */ }
      }
      socket.disconnect();
      resetEconomy();
      setAuth({ loading: false, enabled: true, user: null, error: null });
      setProfile((previous) => ({ ...previous, avatarPhoto: null }));
      socket.connect(); // ต่อใหม่ทันทีแบบ Guest — ออกจากระบบแล้วยังเล่นต่อได้เลย ไม่ต้องเด้งไปไหน
    } catch (error) {
      showToast(`ออกจากระบบไม่สำเร็จ (${error.message})`);
    }
  }

  // /login เป็นหน้าปกติหน้าหนึ่ง ไม่ใช่ประตูที่บังคับผ่านก่อนเล่น — เข้าได้ตรงๆ หรือกดปุ่ม "เข้าสู่ระบบ" พาไปเอง
  // มีปุ่ม "เล่นเลยแบบ Guest" ในหน้านี้เองให้กลับไปเล่นได้โดยไม่ต้องล็อกอิน
  if (route.screen === "login") {
    return (
      <Suspense fallback={<div className="screen"><div className="panel">กำลังโหลดหน้าเข้าสู่ระบบ...</div></div>}>
        <Login
          enabled={auth.enabled}
          error={auth.error}
          returnTo={returnTo}
          onAuthenticated={(user) => {
            socket.disconnect();
            resetEconomy();
            setAuth({ loading: false, enabled: true, user, error: null });
            socket.connect();
          }}
        />
      </Suspense>
    );
  }

  return (
    <>
      {/* ปุ่มเพลง/เสียงเอฟเฟกต์: หน้าเกม/Solo อยู่ในแถบบน (TopIcons) หน้าอื่นลอยมุมขวาบนของหน้า
          ปุ่มเข้าสู่ระบบ/ชิปบัญชี (ไม่บังคับ) อยู่ข้างๆ กันเฉพาะหน้าแรก — ซ่อนเองถ้ายังไม่ได้ตั้งค่า Firebase บน server */}
      {!showGame && route.screen !== "solo" && (
        <div className="top-dock">
          {route.screen === "lobby" && (
            <AuthButton enabled={auth.enabled} user={auth.user} avatar={profile.avatar} avatarPhoto={profile.avatarPhoto} outfit={economy?.equipped} onLogout={handleLogout} />
          )}
          <AudioDock />
        </div>
      )}
      {route.screen === "lobby" && (
        <Lobby
          key={inviteCode ?? "home"} // ลิงก์เชิญเปลี่ยน = สร้างหน้าใหม่ให้กล่องเข้าห้องเปิดพร้อมรหัสนั้น
          connected={connected}
          profile={profile}
          onProfile={setProfile}
          onSelectAvatar={selectPresetAvatar}
          canUploadPhoto={PHOTO_UPLOAD_ENABLED && Boolean(auth.user)}
          onUploadPhoto={() => setShowAvatarUpload(true)}
          onEditProfile={() => setShowProfile(true)}
          inviteCode={inviteCode}
          onEntered={handleEntered}
          // หน้า Lobby ส่ง "รหัส error" มา ที่นี่แปลงเป็นข้อความไทยก่อนโชว์
          onError={(code) => showToast(errorText(code))}
          onOpenSetup={() => navigate("/setup")}
          onAchievements={() => setShowAchievements(true)}
          economy={economy}
          onShop={() => navigate("/shop")}
          onDress={() => navigate("/dressing-room")}
        />
      )}

      {route.screen === "shop" && <AvatarShop economy={economy} profile={profile} onBuy={buyItem} onBack={goHome} onDress={() => navigate("/dressing-room")} />}
      {route.screen === "dressing" && <AvatarDressingRoom economy={economy} profile={profile} onSave={saveOutfit} onAvatar={selectPresetAvatar} onBack={goHome} onShop={() => navigate("/shop")} />}

      {/* SET UP: เลือกโหมด/รอบ/เวลา/ความยาก/ประเภทห้อง แล้วสร้างห้อง */}
      {route.screen === "setup" && (
        <SetUp
          connected={connected}
          profile={{ ...profile, outfit: economy?.equipped }}
          onEditProfile={() => setShowProfile(true)}
          onBack={goHome}
          onEntered={handleEntered}
          onError={(code) => showToast(errorText(code))}
          // เลือกโหมด "แข่งกับ AI" แล้วกดเริ่มเกม → ไปหน้า Solo แล้วเริ่มทันทีด้วยความยากที่เลือก
          onStartSolo={(difficulty) => {
            setSoloBoot({ difficulty });
            navigate("/solo");
          }}
        />
      )}

      {/* Leaderboard ไม่ได้ใช้ socket เลย ขอข้อมูลผ่าน HTTP เอง */}
      {route.screen === "leaderboard" && <Leaderboard onBack={goHome} initialBoard={new URLSearchParams(location.search).get("board")} />}

      {/* Solo ผูก socket event ของตัวเองในหน้านั้น (ไม่เกี่ยวกับห้อง) */}
      {route.screen === "solo" && (
        <SoloAI
          initialName={profile.name}
          profile={{ ...profile, outfit: economy?.equipped }}
          onEditProfile={() => setShowProfile(true)}
          onAchievements={() => setShowAchievements(true)}
          onLeaderboard={() => openLeaderboard("solo")}
          boot={soloBoot}
          onName={(name) => setProfile((p) => ({ ...p, name }))}
          onBack={() => {
            setSoloBoot(null);
            goHome();
          }}
        />
      )}

      {/* room ยังมาไม่ถึง (กำลัง rejoin หลังรีเฟรช) ก็มีให้เห็นว่ากำลังทำอะไรอยู่ ไม่ใช่จอเปล่า */}
      {route.screen === "room" && !roomReady && (
        <div className="screen">
          <div className="panel">{connected ? "กำลังเข้าห้อง..." : "กำลังต่อ server..."}</div>
        </div>
      )}

      {roomReady && room.status === "category_selection" && (
        <CategorySelection room={room} me={me} onLeave={handleLeave} />
      )}

      {roomReady && !inGame && room.status !== "category_selection" && (
        <WaitingRoom room={room} me={me} messages={game.messages} onSend={sendGuess} onLeave={handleLeave} onEditProfile={() => setShowProfile(true)} onAchievements={() => setShowAchievements(true)} onToast={showToast} />
      )}

      {showGame && room.settings.mode === "mpai" && (
        <MpAiGame
          room={room}
          meId={me.playerId}
          mp={mp}
          acceptChaosState={acceptChaosState}
          sendSnapshot={mpSnapshot}
          sendGuess={sendGuess}
          game={game}
          startGame={startGame}
          backToLobby={backToLobby}
          onLeave={handleLeave}
          onToast={showToast}
          onEditProfile={() => setShowProfile(true)}
          onLeaderboard={() => openLeaderboard("mpai")}
        />
      )}

      {showGame && room.settings.mode !== "mpai" && (
        <Game
          room={room}
          meId={me.playerId}
          game={game}
          chooseLeft={chooseLeft}
          chooseWord={chooseWord}
          sendGuess={sendGuess}
          startGame={startGame}
          backToLobby={backToLobby}
          sendAction={sendAction}
          askUndo={askUndo}
          askRedo={askRedo}
          askHint={askHint}
          bindCanvas={bindCanvas}
          onLeave={handleLeave}
          // Toast ตัวกลางอยู่ที่ App หน้าเกมจึงขอยืมใช้ (เช่นตอนกดคัดลอกรหัสห้อง)
          onToast={showToast}
          onAchievements={() => setShowAchievements(true)}
          onEditProfile={() => setShowProfile(true)}
          onLeaderboard={() => openLeaderboard(room.settings.mode)}
        />
      )}

      {/* หลุดจาก server ระหว่างอยู่ในห้อง: บอกให้รู้ว่ากำลังต่อใหม่ (ต่อติดแล้ว rejoin เองโดยอัตโนมัติ) */}
      {roomReady && !connected && <div className="reconnect-note">การเชื่อมต่อหลุด กำลังต่อใหม่...</div>}

      {showProfile && <ProfileModal profile={roomReady ? { name: me.name, avatar: me.avatar, avatarPhoto: me.avatarPhoto, outfit: me.outfit } : { ...profile, outfit: economy?.equipped }} onSave={saveProfile} onClose={() => setShowProfile(false)} />}
      {PHOTO_UPLOAD_ENABLED && showAvatarUpload && auth.user && <AvatarUploadModal profile={{ ...profile, outfit: economy?.equipped }} onSave={uploadPhoto} onRemove={() => saveProfile({ ...profile, avatarPhoto: null })} onClose={() => setShowAvatarUpload(false)} />}
      {showAchievements && <Achievements onClose={() => setShowAchievements(false)} onPlay={() => setShowAchievements(false)} onProfile={() => { setShowAchievements(false); setShowProfile(true); }} onLeaderboard={() => { setShowAchievements(false); openLeaderboard("classic"); }} />}

      {/* key ผูกกับ id ของ toast เพื่อให้แสดงข้อความซ้ำแล้วเล่นอนิเมชันใหม่ */}
      <Toast key={toast?.id ?? "none"} toast={toast} />
    </>
  );
}
