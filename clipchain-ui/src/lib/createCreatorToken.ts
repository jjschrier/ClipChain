import { Connection, PublicKey } from "@solana/web3.js";
import { WalletContextState } from "@solana/wallet-adapter-react";
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo
} from "@solana/spl-token";

export async function createCreatorToken(
    connection: Connection,
    wallet: WalletContextState
): Promise<PublicKey> {
    if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Wallet not connected or missing signTransaction");
    }

    const payer = {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions
    } as any;

    // ✅ Create the mint
    const mint = await createMint(
        connection,
        payer,
        wallet.publicKey, // Mint authority
        wallet.publicKey, // Freeze authority
        6 // Decimals
    );

    console.log("✅ Mint created at:", mint.toBase58());

    // ✅ Create Associated Token Account for creator
    const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        wallet.publicKey
    );

    // ✅ Mint initial supply (e.g., 100 tokens)
    await mintTo(connection, payer, mint, ata.address, wallet.publicKey, 100 * 10 ** 6);

    console.log("✅ Initial supply minted to:", ata.address.toBase58());

    return mint;
}
