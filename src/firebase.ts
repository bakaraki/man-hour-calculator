import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Use environment variables (Vite's process.env or import.meta.env)
// These are injected via vite.config.ts from firebase-applet-config.json or actual env vars
const firebaseConfig = {
  apiKey: (process.env as any).VITE_FIREBASE_API_KEY,
  authDomain: (process.env as any).VITE_FIREBASE_AUTH_DOMAIN,
  projectId: (process.env as any).VITE_FIREBASE_PROJECT_ID,
  appId: (process.env as any).VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: (process.env as any).VITE_FIREBASE_DATABASE_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();
export { signInWithPopup, signOut };

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);
