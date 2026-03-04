import { doc, setDoc, serverTimestamp, increment } from "firebase/firestore";
import { db } from "../firebase/config";

const viewerDoc = (wallet: string) => doc(db, "viewer_profiles", wallet);

export async function markEngagedViewer(wallet: string) {
  if (!wallet) return;
  await setDoc(
    viewerDoc(wallet),
    {
      engaged: true,
      lastEngagedAt: serverTimestamp(),
      engagementCount: increment(1),
    },
    { merge: true }
  );
}

export async function markVerifiedViewer(wallet: string) {
  if (!wallet) return;
  await setDoc(
    viewerDoc(wallet),
    {
      verified: true,
      lastVerifiedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function markTrustedViewer(wallet: string) {
  if (!wallet) return;
  await setDoc(
    viewerDoc(wallet),
    {
      trusted: true,
      lastTrustedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
