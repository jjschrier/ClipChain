import { WalletContextState } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { transferTokens } from "./transferTokens";

export async function incrementWatchTime(
    wallet: WalletContextState,
    creator: string,
    connection: Connection,
    mintAddress: string
) {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    if (!creator) {
        console.warn("incrementWatchTime: missing creator pubkey, skipping reward");
        return;
    }
    if (!mintAddress) {
        console.warn("incrementWatchTime: missing mint address, skipping reward");
        return;
    }

    let creatorPubKey: PublicKey;
    let mintPubKey: PublicKey;
    try {
        creatorPubKey = new PublicKey(creator);
        mintPubKey = new PublicKey(mintAddress);
    } catch (e) {
        console.warn("incrementWatchTime: invalid public key input", e);
        return;
    }

    console.log(`⏱️ Sending reward to ${creatorPubKey.toBase58()}`);
    await transferTokens(connection, wallet, wallet.publicKey, creatorPubKey, mintPubKey, 0.1);
}
