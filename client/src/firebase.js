import { initializeApp } from "@firebase/app";
import { getAuth } from "@firebase/auth";
import { getStorage } from "@firebase/storage";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Object.values(config).every((value) => typeof value === "string" && value.length > 0);
export const firebaseApp = firebaseReady ? initializeApp(config) : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const storageBucket = String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim();
export const firebaseStorage = firebaseApp && storageBucket ? getStorage(firebaseApp, `gs://${storageBucket}`) : null;
