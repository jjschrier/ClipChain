import React, { useEffect, useState } from "react";

/**
 * Safe Connect Button for injected wallets (Phantom, Solflare).
 * - Defensive: checks for window.injected providers and wraps calls in try/catch.
 * - Friendly error messages for extension conflicts.
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
    // Detect injected wallets (non-invasive)
    const providers: string[] = [];
    if (window.solana) providers.push(window.solana?.isPhantom ? "Phantom" : "Solana(injected)");
    if (window.solflare) providers.push("Solflare");
    if (window.phantom) providers.push("Phantom(window.phantom)");
    setDetected(providers);
    // If already connected (some wallets auto-connect), reflect that
    try {
      const k =
        window.solana?.publicKey?.toString() ||
        window.solflare?.publicKey?.toString() ||
        null;
      if (k) setPubkey(k);
    } catch {
      // ignore
    }
  }, []);

  const connect = async () => {
    setError(null);
    setConnecting(true);
    try {
      // Prefer Phantom / window.solana if available
      if (window.solana && window.solana.isPhantom) {
        // Phantom
        const resp = await window.solana.connect();
        setPubkey(resp?.publicKey?.toString() ?? window.solana?.publicKey?.toString() ?? null);
        return;
      }

      // Solflare (older injectors use window.solflare)
      if (window.solflare && typeof window.solflare.connect === "function") {
        const resp = await window.solflare.connect();
        setPubkey(resp?.publicKey?.toString() ?? window.solflare?.publicKey?.toString() ?? null);
        return;
      }

      // Generic injected solana provider
      if (window.solana && typeof window.solana.connect === "function") {
        const resp = await window.solana.connect();
        setPubkey(resp?.publicKey?.toString() ?? window.solana?.publicKey?.toString() ?? null);
        return;
      }

      throw new Error("No supported wallet extension found. Install Phantom or Solflare, or use a wallet adapter.");
    } catch (e: any) {
      console.error("Wallet connect failed:", e);
      // If common extension conflict patterns appear, suggest disabling others
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
      if (window.solana && typeof window.solana.disconnect === "function") {
        await window.solana.disconnect();
      }
      if (window.solflare && typeof window.solflare.disconnect === "function") {
        await window.solflare.disconnect();
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
        <>
          <button
            onClick={connect}
            disabled={connecting}
            className={`px-3 py-1 rounded ${connecting ? "bg-gray-600" : "bg-purple-600 hover:bg-purple-700"} text-white text-sm`}
          >
            {connecting ? "Connecting…" : "Connect Wallet"}
          </button>
        </>
      )}

      {error && (
        <div className="text-xs text-red-300 ml-2 max-w-xs">
          {error}
        </div>
      )}
    </div>
  );
}