import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { ensureUserDoc } from "../lib/userService";

type ClaimPayload = {
  viewer: string;
  mint?: string;
  creator?: string;
  videoId?: string;
  reason?: string;
  pendingReward?: number;
  signature?: string;
  message?: string;
  nonce?: string;
  signatureType?: string;
  signedAt?: number;
};

type ClaimResult = {
  mode: "instant" | "queued";
  claimId?: string;
  txid?: string;
  status?: string;
  error?: string;
};

const getClaimNowUrl = () => {
  const override = (import.meta.env as any).VITE_CLAIM_FUNCTION_URL as string | undefined;
  if (override && override.trim()) return override.trim();
  const projectId = db.app.options.projectId;
  if (!projectId) return null;
  return `https://us-central1-${projectId}.cloudfunctions.net/claimNow`;
};

export async function requestClaim(payload: ClaimPayload): Promise<ClaimResult> {
  await ensureUserDoc();
  const claimNowUrl = getClaimNowUrl();
  if (claimNowUrl) {
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      if (token) {
        const res = await fetch(claimNowUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.txid) {
          return { mode: "instant", txid: data.txid, status: data.status || "settled" };
        }
      }
    } catch (error) {
      console.warn("Instant claim failed; falling back to queue.", error);
    }
  }
  const data: any = {
    ...payload,
    createdAt: serverTimestamp(),
    status: "pending",
  };
  if (!payload.mint) delete data.mint;
  const ref = await addDoc(collection(db, "claim_requests"), data);
  return { mode: "queued", claimId: ref.id, status: "pending" };
}
