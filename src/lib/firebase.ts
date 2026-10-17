// Firebase bootstrap for the Petroleum Depot admin dashboard.
//
// The values below are the PUBLIC web-app configuration (not secrets). They
// identify the shared `petroleum-depot` Firebase project whose Firestore is the
// authoritative store shared with the Android app. Override any value at build
// time with VITE_FIREBASE_* environment variables (see .env.example).
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyA2Xxz9r_wNfg9-zdncYHW5_iyNyqiXZvs",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "petroleum-depot.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "petroleum-depot",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "petroleum-depot.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "1075561100968",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:1075561100968:web:29675039c19d776db9f49d",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? "G-VEJMJ7GWPB",
};

// The Firebase Auth account that owns this depot. On its first sign-in the app
// writes the `users/{uid}` owner profile + the one-time `settings/__bootstrap__`
// lock automatically (see src/lib/auth.tsx), so no manual step is required.
// Override with VITE_OWNER_UID when pointing at a different project.
export const OWNER_UID: string =
  env.VITE_OWNER_UID ?? "MGtP71uoi6XWeOcSa4AwldhVo552";

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

// A second, isolated Auth instance used only to CREATE user accounts from the
// dashboard. `createUserWithEmailAndPassword` signs in the caller, so using the
// secondary app keeps the administrator's own session intact.
let _secondaryAuth: Auth | null = null;
export function secondaryAuth(): Auth {
  if (!_secondaryAuth) {
    const secondaryApp = initializeApp(firebaseConfig, "secondary");
    _secondaryAuth = getAuth(secondaryApp);
  }
  return _secondaryAuth;
}
