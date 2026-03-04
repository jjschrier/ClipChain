import React, { useEffect, useState } from "react";

/**
 * Safe Connect Button for injected wallets (Phantom, Solflare).
 * Defensive checks and helpful error messages for extension conflicts.
 */

declare global {
  interface Window {
    solana?: any;
    solflare?: any;
    phantom?: any;
  }
}

const truncate = (s: string | undefined, len = 8) =>
  s ? `${s.slice(0, len)}...${s.slice(-4)}` : "";

export default function ConnectWalletButton() {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<string[] | null>(null);

  useEffect(() => {
    const providers: string[] = [];
    try {
      const w = window as any;
      if (w.solana?.isPhantom) providers.push("Phantom");
      if (w.solflare) providers.push("Solflare");
      if (w.phantom) providers.push("Phantom(window.phantom)");
      setDetected(providers);

      const k =
        w.solana?.publicKey?.toString() ||
        w.solflare?.publicKey?.toString() ||
        null;
      if (k) setPubkey(k);
    } catch (e) {
      console.warn("ConnectWalletButton: detection failed", e);
    }
  }, []);

  const connect = async () => {
    setError(null);
    setConnecting(true);
    try {
      if ((window as any).solana?.isPhantom) {
        const resp = await (window as any).solana.connect();
        setPubkey(resp?.publicKey?.toString() ?? (window as any).solana?.publicKey?.toString() ?? null);
        return;
      }

      if ((window as any).solflare && typeof (window as any).solflare.connect === "function") {
        const resp = await (window as any).solflare.connect();
        setPubkey(resp?.publicKey?.toString() ?? (window as any).solflare?.publicKey?.toString() ?? null);
        return;
      }

      if ((window as any).solana && typeof (window as any).solana.connect === "function") {
        const resp = await (window as any).solana.connect();
        setPubkey(resp?.publicKey?.toString() ?? (window as any).solana?.publicKey?.toString() ?? null);
        return;
      }

      throw new Error("No supported wallet extension found. Install Phantom or Solflare.");
    } catch (e: any) {
      console.error("Wallet connect failed:", e);
      const conflictHint =
        detected && detected.length > 1
          ? "Multiple wallet extensions detected. Try disabling conflicting extensions and reload."
          : "If you use multiple wallet extensions, try disabling them or open an Incognito window with only one installed.";
      setError((e?.message || String(e)) + " — " + conflictHint);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      if ((window as any).solana && typeof (window as any).solana.disconnect === "function") {
        await (window as any).solana.disconnect();
      }
      if ((window as any).solflare && typeof (window as any).solflare.disconnect === "function") {
        await (window as any).solflare.disconnect();
      }
    } catch (e) {
      console.warn("Disconnect failed:", e);
    } finally {
      setPubkey(null);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      {pubkey ? (
        <>
          <div className="text-sm text-gray-200 bg-gray-800/50 px-3 py-1 rounded">{truncate(pubkey)}</div>
          <button
            onClick={disconnect}
            className="px-3 py-1 rounded bg-red-600 text-white text-sm"
            title="Disconnect wallet"
          >
            Disconnect
          </button>
        </>
      ) : (
        <button
          onClick={connect}
          disabled={connecting}
          className={`px-3 py-1 rounded ${connecting ? "bg-gray-600" : "bg-purple-600 hover:bg-purple-700"} text-white text-sm`}
        >
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
      )}

      {error && (
        <div className="text-xs text-red-300 ml-2 max-w-xs">
          {error}
        </div>
      )}
    </div>
  );
}