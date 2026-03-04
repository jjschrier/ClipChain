// Minimal safe injected-wallet detector. Use getInjectedProvider() before calling connect().
// Returns provider or null (no provider).
export const getInjectedProvider = () => {
  try {
    // prefer Phantom (window.solana.isPhantom), then Solflare, then generic window.solana
    // Keep checks non-invasive (no connect calls here).
    const w = (window as any);
    if (w.solana?.isPhantom) return w.solana;
    if (w.solflare) return w.solflare;
    if (w.solana) return w.solana;
    return null;
  } catch (e) {
    console.warn("safeWallet.getInjectedProvider failed:", e);
    return null;
  }
};