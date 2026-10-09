import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  inMemoryPersistence,
  linkWithCredential,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "@firebase/auth";
import { firebaseAuth, firebaseReady } from "../firebase";
import Logo from "../components/Logo";
import Ribbon from "../components/Ribbon";

const AUTH_ERRORS = {
  "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
  "auth/weak-password": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
  "auth/popup-closed-by-user": "คุณปิดหน้าต่าง Google ก่อนเข้าสู่ระบบ",
  "auth/popup-blocked": "เบราว์เซอร์บล็อกหน้าต่าง Google กรุณาอนุญาต popup แล้วลองใหม่",
  "auth/unauthorized-domain": "โดเมนนี้ยังไม่ได้เพิ่มใน Authorized domains ของ Firebase",
  AUTH_NOT_CONFIGURED: "เกมยังไม่ได้ตั้งค่า Firebase Authentication กรุณาแจ้งผู้ดูแลระบบ",
  AUTH_PROVIDER_UNAVAILABLE: "เชื่อมต่อ Firebase ไม่สำเร็จ กรุณาลองใหม่",
  EMAIL_NOT_VERIFIED: "กรุณายืนยันอีเมลจากกล่องจดหมายก่อนเข้าสู่ระบบ",
  INVALID_TOKEN: "ยืนยันตัวตนไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่",
};

export default function Login({ enabled, error, returnTo, onAuthenticated }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState(null);
  const [pendingEmailCredential, setPendingEmailCredential] = useState(null);
  const ready = enabled && firebaseReady && Boolean(firebaseAuth);
  const target = typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\")
    ? returnTo
    : "/";

  async function finishLogin(user) {
    if (!user.emailVerified) {
      await sendEmailVerification(user);
      await signOut(firebaseAuth);
      setMessage("อีเมลนี้ยังไม่ยืนยัน เราส่งลิงก์ยืนยันให้แล้ว กรุณากดยืนยันแล้วเข้าสู่ระบบอีกครั้ง");
      return;
    }

    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: await user.getIdToken() }),
      credentials: "same-origin",
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 403 && result.error === "EMAIL_NOT_VERIFIED") {
      await sendEmailVerification(user);
      await signOut(firebaseAuth);
      setMessage("อีเมลนี้ยังไม่ยืนยัน เราส่งลิงก์ยืนยันให้แล้ว กรุณากดยืนยันแล้วเข้าสู่ระบบอีกครั้ง");
      return;
    }
    if (!response.ok) throw new Error(result.error || "AUTH_PROVIDER_UNAVAILABLE");
    await signOut(firebaseAuth);
    onAuthenticated(result.user);
    navigate(target, { replace: true });
  }

  function showError(reason) {
    const code = reason?.code || reason?.message;
    setMessage(AUTH_ERRORS[code] || "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองใหม่");
  }

  async function handleGoogleLogin() {
    if (!ready || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await setPersistence(firebaseAuth, inMemoryPersistence);
      const result = await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
      let user = result.user;
      if (pendingEmailCredential) {
        user = (await linkWithCredential(user, pendingEmailCredential)).user;
        setPendingEmailCredential(null);
      }
      await finishLogin(user);
    } catch (reason) {
      if (reason?.code === "auth/account-exists-with-different-credential") {
        const credential = GoogleAuthProvider.credentialFromError(reason);
        if (credential) {
          setPendingGoogleCredential(credential);
          setPendingEmailCredential(null);
          setEmail(reason.customData?.email || email);
          setMode("signin");
          setMessage("อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านเดิมเพื่อเชื่อมบัญชีกับ Google");
        } else {
          showError(reason);
        }
      } else if (reason?.code === "auth/email-already-in-use" && pendingEmailCredential) {
        setMessage("กรุณาใช้ปุ่ม Google เพื่อเข้าสู่บัญชีเดิมและเชื่อมอีเมล");
      } else {
        showError(reason);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSubmit(event) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await setPersistence(firebaseAuth, inMemoryPersistence);
      let user;
      if (mode === "signup") {
        const result = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
        user = result.user;
        await sendEmailVerification(user);
        await signOut(firebaseAuth);
        setPassword("");
        setMessage("สมัครบัญชีแล้ว กรุณากดลิงก์ยืนยันที่ส่งไปทางอีเมล แล้วกลับมาเข้าสู่ระบบ");
        return;
      }

      user = (await signInWithEmailAndPassword(firebaseAuth, email.trim(), password)).user;
      if (pendingGoogleCredential) {
        user = (await linkWithCredential(user, pendingGoogleCredential)).user;
        setPendingGoogleCredential(null);
      }
      await finishLogin(user);
    } catch (reason) {
      if (reason?.code === "auth/email-already-in-use" && mode === "signup") {
        setPendingEmailCredential(EmailAuthProvider.credential(email.trim(), password));
        setMode("signin");
        setMessage("อีเมลนี้มีบัญชีอยู่แล้ว หากบัญชีเดิมใช้ Google ให้กดปุ่ม Google เพื่อเชื่อมวิธีเข้าสู่ระบบ");
      } else if (reason?.code === "auth/account-exists-with-different-credential" && pendingGoogleCredential) {
        setMessage("เข้าสู่ระบบด้วยวิธีเดิมของบัญชีนี้ก่อน แล้วลองเชื่อม Google อีกครั้ง");
      } else {
        showError(reason);
      }
    } finally {
      setBusy(false);
    }
  }

  const firebaseError = !firebaseReady
    ? "ยังไม่ได้ตั้งค่า Firebase สำหรับหน้าเว็บ (VITE_FIREBASE_*)"
    : error
      ? `ตรวจสอบสถานะล็อกอินไม่ได้: ${error}`
      : !enabled
        ? AUTH_ERRORS.AUTH_NOT_CONFIGURED
        : "";

  return (
    <main className="screen auth-screen">
      <div className="auth-card panel">
        <Logo />
        <Ribbon tone="red">SIGN IN</Ribbon>
        <h1>เข้าสู่ระบบก่อนเล่น</h1>
        <p>เลือกเข้าสู่ระบบด้วย Google หรืออีเมล เกมจะเริ่มได้หลังยืนยันอีเมลแล้ว</p>
        {(message || firebaseError) && (
          <p className="auth-message" role="alert">{message || firebaseError}</p>
        )}
        {mode === "signup" && (
          <p className="auth-note">สมัครด้วยอีเมลแล้วต้องกดยืนยันจากกล่องจดหมายก่อนเล่น</p>
        )}
        <button
          type="button"
          className="big-btn big-btn--blue auth-google"
          disabled={!ready || busy}
          onClick={handleGoogleLogin}
        >
          เข้าสู่ระบบด้วย Google
        </button>
        <div className="auth-divider"><span>หรือใช้อีเมล</span></div>
        <form className="auth-form" onSubmit={handleEmailSubmit}>
          <label className="field__label" htmlFor="auth-email">อีเมล</label>
          <input
            id="auth-email"
            className="input"
            type="email"
            autoComplete="email"
            required
            maxLength={320}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label className="field__label" htmlFor="auth-password">รหัสผ่าน</label>
          <input
            id="auth-password"
            className="input"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={6}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit" className="big-btn big-btn--green auth-google" disabled={!ready || busy}>
            {busy ? "กำลังตรวจสอบ..." : mode === "signup" ? "สมัครด้วยอีเมล" : "เข้าสู่ระบบด้วยอีเมล"}
          </button>
        </form>
        <button
          type="button"
          className="auth-mode-toggle"
          disabled={busy}
          onClick={() => {
            setMode((current) => current === "signin" ? "signup" : "signin");
            setMessage("");
          }}
        >
          {mode === "signup" ? "มีบัญชีแล้ว? เข้าสู่ระบบ" : "ยังไม่มีบัญชี? สมัครด้วยอีเมล"}
        </button>
        <a className="auth-leaderboard" href="/leaderboard">ดู Leaderboard โดยไม่ต้องเข้าสู่ระบบ</a>
      </div>
    </main>
  );
}
