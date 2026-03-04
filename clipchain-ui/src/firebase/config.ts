// firebase/config.ts
import { initializeApp } from "firebase/app";
import { initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInAnonymously, connectAuthEmulator } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyB5GySa6LDc2_FKzOksl8Stnv2KXiDX6FI",
    authDomain: "clip-chain.firebaseapp.com",
    databaseURL: "https://clip-chain-default-rtdb.firebaseio.com",
    projectId: "clip-chain",
    storageBucket: "clip-chain.firebasestorage.app",
    messagingSenderId: "690901757971",
    appId: "1:690901757971:web:f5729b7ceb941ba814cfe6",
    measurementId: "G-9RW15VH4BM",
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false });
const auth = getAuth(app);

// Connect to local emulators when requested via env
if (typeof window !== "undefined") {
    const useEmu = (import.meta.env as any).VITE_USE_FIRESTORE_EMULATOR === "true";
    if (useEmu) {
        console.info("Connecting to Firebase emulators (firestore/auth)");
        try {
            // Firestore emulator default port 8080
            connectFirestoreEmulator(db, 'localhost', 8080);
        } catch (e) {
            console.warn("connectFirestoreEmulator failed:", e);
        }
        try {
            // Auth emulator default port 9099
            connectAuthEmulator(auth, 'http://localhost:9099');
        } catch (e) {
            console.warn("connectAuthEmulator failed:", e);
        }
    }
}

// DEBUG: log which project the client is using
if (typeof window !== "undefined") {
    console.info("Firebase projectId:", firebaseConfig.projectId);
}

// Auto sign-in anonymously in the browser
if (typeof window !== "undefined") {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.info("Firebase auth ready — uid:", user.uid, "anonymous:", user.isAnonymous);
            user.getIdToken().then(t => console.info("Firebase ID token length:", t.length)).catch(e => console.warn("getIdToken failed", e));
        } else {
            console.info("No auth user — attempting anonymous sign-in");
            signInAnonymously(auth).catch((e) =>
                console.error("Anon sign-in failed:", e)
            );
        }
    });
}

export { app, db, auth };
