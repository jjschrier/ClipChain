import {
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress,
    createMintToInstruction,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
} from "@solana/web3.js";
import { WalletContextState } from "@solana/wallet-adapter-react";

export async function airdropFanToken({
    connection,
    mint,
    fanPublicKey,
    creatorWallet,
    amount = 1_000_000,
}: {
    connection: Connection;
    mint: PublicKey;
    fanPublicKey: PublicKey;
    creatorWallet: WalletContextState;
    amount?: number;
}) {
    if (!creatorWallet.publicKey || !creatorWallet.signTransaction) {
        throw new Error("Wallet not connected.");
    }

    const payer = creatorWallet.publicKey;

    // Get fan’s associated token account address
    const fanATA = await getAssociatedTokenAddress(mint, fanPublicKey);

    const instructions = [];

    // Create associated token account (assumes it doesn't exist yet)
    instructions.push(
        createAssociatedTokenAccountInstruction(
            payer,        // payer
            fanATA,       // associated token account
            fanPublicKey, // owner
            mint          // mint
        )
    );

    // Mint tokens to fan
    instructions.push(
        createMintToInstruction(
            mint,
            fanATA,
            payer, // mint authority
            amount
        )
    );

    const transaction = new Transaction().add(...instructions);

    // ✅ Add missing required fields
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = payer;

    // Sign & send transaction
    const signedTx = await creatorWallet.signTransaction(transaction);
    const txid = await connection.sendRawTransaction(signedTx.serialize());
    await connection.confirmTransaction(txid, "confirmed");

    console.log("✅ Airdrop complete:", txid);
    return txid;
}
