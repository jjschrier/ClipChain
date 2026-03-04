import { auth, db } from "../firebase/config";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import type { Unsubscribe } from "firebase/firestore";

export type UserProfile = {
  avatarUrl?: string;
  wallet?: string;
  displayName?: string;
  bio?: string;
  createdAt?: any;
  updatedAt?: any;
};

let _cachedUid: string | null = null;
let _degradedLogged = false;

/**
 * Waits until we have an auth user (anonymous or otherwise).
 */
const waitForAuthUser = (): Promise<NonNullable<typeof auth.currentUser>> =>
  new Promise((resolve, reject) => {
    if (auth.currentUser) {
      console.debug("waitForAuthUser: already have currentUser", auth.currentUser.uid);
      return resolve(auth.currentUser);
    }
    const stop = auth.onAuthStateChanged(
      (u) => {
        if (u) {
          stop();
          console.debug("waitForAuthUser: onAuthStateChanged ->", u.uid, "anonymous:", u.isAnonymous);
          resolve(u);
        }
      },
      (err) => {
        console.error("waitForAuthUser: onAuthStateChanged error", err);
        reject(err);
      }
    );
  });

/**
 * Ensure the user doc exists (id = auth.uid). Creates a minimal doc on first touch.
 * If Firestore rules prevent reads/writes (permission-denied), treat that as a non-fatal condition
 * and return the auth uid so the client can continue in a degraded mode.
 */
export const ensureUserDoc = async (): Promise<string> => {
  if (_cachedUid) return _cachedUid;

  try {
    const user = await waitForAuthUser();
    const ref = doc(db, "users", user.uid);

    let snap;
    try {
      snap = await getDoc(ref);
    } catch (e: any) {
      // If permission denied, log once and continue  app will operate in read-only/degraded mode
      if (e?.code === "permission-denied" || e?.message?.includes("Missing or insufficient permissions")) {
        if (!_degradedLogged) {
          console.warn("ensureUserDoc: Firestore permission denied  operating in degraded mode. Check Firestore rules. UID:", user.uid);
          _degradedLogged = true;
        }
        _cachedUid = user.uid;
        return user.uid;
      }
      throw e;
    }

    if (!snap.exists()) {
      console.info("Creating user doc for uid:", user.uid);
      try {
        await setDoc(
          ref,
          {
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e: any) {
        if (e?.code === "permission-denied" || e?.message?.includes("Missing or insufficient permissions")) {
          if (!_degradedLogged) {
            console.warn("ensureUserDoc: cannot create user doc due to Firestore rules. Operating without user doc. UID:", user.uid);
            _degradedLogged = true;
          }
          _cachedUid = user.uid;
          return user.uid;
        }
        throw e;
      }
    } else {
      console.debug("User doc exists for uid:", user.uid);
    }

    _cachedUid = user.uid;
    return user.uid;
  } catch (e) {
    console.error("ensureUserDoc failed:", e);
    throw e;
  }
};

/**
 * Save / update avatar.
 */
export const saveAvatar = async (wallet: string, url: string) => {
  const uid = await ensureUserDoc();
  const ref = doc(db, "users", uid);
  try {
    await setDoc(
      ref,
      {
        avatarUrl: url,
        wallet,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await setDoc(
      doc(db, "creators", wallet),
      {
        avatarUrl: url,
        wallet,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e: any) {
    if (e?.code === "permission-denied" || e?.message?.includes("Missing or insufficient permissions")) {
      if (!_degradedLogged) {
        console.warn("saveAvatar: Firestore write blocked by rules  skipping save.");
        _degradedLogged = true;
      }
      return;
    }
    throw e;
  }
};

/**
 * Get current user's avatar URL.
 */
export const getAvatar = async (): Promise<string | null> => {
  const uid = await ensureUserDoc();
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    const data = snap.data() as UserProfile;
    return data.avatarUrl ?? null;
  } catch (e: any) {
    if (e?.code === "permission-denied" || e?.message?.includes("Missing or insufficient permissions")) {
      if (!_degradedLogged) {
        console.warn("getAvatar: Firestore read blocked by rules  returning null.");
        _degradedLogged = true;
      }
      return null;
    }
    throw e;
  }
};

/**
 * Read full user profile.
 */
export const getCurrentUserProfile = async (): Promise<UserProfile | null> => {
  const uid = await ensureUserDoc();
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  } catch (e: any) {
    if (e?.code === "permission-denied" || e?.message?.includes("Missing or insufficient permissions")) {
      if (!_degradedLogged) {
        console.warn("getCurrentUserProfile: Firestore read blocked by rules  returning null.");
        _degradedLogged = true;
      }
      return null;
    }
    throw e;
  }
};

/**
 * Live subscribe to the current user's profile.
 */
export const subscribeCurrentUserProfile = async (
  cb: (profile: UserProfile | null) => void
): Promise<Unsubscribe> => {
  const uid = await ensureUserDoc();
  const ref = doc(db, "users", uid);
  try {
    return onSnapshot(ref, (snap) => {
      cb(snap.exists() ? (snap.data() as UserProfile) : null);
    });
  } catch (e: any) {
    if (e?.code === "permission-denied" || e?.message?.includes("Missing or insufficient permissions")) {
      if (!_degradedLogged) {
        console.warn("subscribeCurrentUserProfile: Firestore subscribe blocked by rules  invoking callback with null and returning noop.");
        _degradedLogged = true;
      }
      cb(null);
      return () => {};
    }
    throw e;
  }
};

/**
 * Upsert basic profile fields.
 */
export const upsertUserProfile = async (patch: Partial<UserProfile>) => {
  const uid = await ensureUserDoc();
  try {
    await setDoc(
      doc(db, "users", uid),
      {
        ...patch,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e: any) {
    if (e?.code === "permission-denied" || e?.message?.includes("Missing or insufficient permissions")) {
      if (!_degradedLogged) {
        console.warn("upsertUserProfile: Firestore write blocked by rules  skipping update.");
        _degradedLogged = true;
      }
      return;
    }
    throw e;
  }
}
