import { clusterApiUrl } from "@solana/web3.js";

type SolanaNetwork = "devnet" | "testnet" | "mainnet-beta";

const normalizeNetwork = (value: unknown): SolanaNetwork => {
    const cleaned = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (cleaned === "devnet") return "devnet";
    if (cleaned === "testnet") return "testnet";
    return "mainnet-beta";
};

export const getSolanaNetwork = (): SolanaNetwork =>
    normalizeNetwork(import.meta.env.VITE_SOLANA_NETWORK);

export const getRpcUrl = () => {
    const raw = import.meta.env.VITE_RPC_URL || import.meta.env.VITE_SOLANA_RPC_URL;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed || clusterApiUrl(getSolanaNetwork());
};
