import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";


const values = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check that all required Firebase configuration values exist.
const hasRequiredValues = Object.values(values).every(
  (value) =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/replace_me|your-project|your_api_key/i.test(value)
);

export const firebaseConfigured = hasRequiredValues;

let app = null;
export let auth = null;
export let db = null;
export let storage = null;

if (firebaseConfigured) {
  // Reuse an existing app during development/HMR.
  app = getApps().length > 0 ? getApp() : initializeApp(values);

  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { app };