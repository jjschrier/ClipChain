import React, { useEffect, useState } from "react";
import { auth } from "../firebase/config";

export default function AuthDebug() {
  const [uid, setUid] = useState<string | null>(null);
  const [isAnon, setIsAnon] = useState<boolean | null>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) {
        setUid(u.uid);
        setIsAnon(u.isAnonymous ?? false);
      } else {
        setUid(null);
        setIsAnon(null);
      }
    });
    return () => unsub();
  }, []);

  return (
    <div style={{ position: "fixed", right: 12, bottom: 12, zIndex: 9999 }}>
      <div
        style={{
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          padding: 8,
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        <div>
          <strong>Auth</strong>
        </div>
        <div>uid: {uid ?? "—"}</div>
        <div>anonymous: {String(isAnon)}</div>
      </div>
    </div>
  );
}