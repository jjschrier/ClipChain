import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { ensureUserDoc } from "../lib/userService";

export type WatchHeartbeat = {
  videoId: string;
  creator: string;
  mint?: string;
  viewer: string;
  seconds: number;
  sessionId: string;
  deviceHash?: string;
  muted?: boolean;
  hidden?: boolean;
  tier?: string;
  rewardRate?: number;
};

const watchLogRef = collection(db, "watch_logs");

// Write a single heartbeat record; heavy filtering/capping is done in backend settlement.
export async function logWatchHeartbeat(payload: WatchHeartbeat) {
  await ensureUserDoc();
  const data: any = {
    ...payload,
    settled: false,
    createdAt: serverTimestamp(),
  };
  if (!payload.mint) delete data.mint;
  await addDoc(watchLogRef, data);
}
