import {
    Connection,
    PublicKey,
    Transaction,
    TransactionSignature,
    Signer
} from "@solana/web3.js";
import {
    getOrCreateAssociatedTokenAccount,
    createTransferInstruction
} from "@solana/spl-token";
import { WalletContextState } from "@solana/wallet-adapter-react";

export async function transferTokens(
    connection: Connection,
    wallet: WalletContextState,
    from: PublicKey,
    to: PublicKey,
    mintAddress: PublicKey,
    amount: number
): Promise<TransactionSignature> {
    if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Wallet not connected or cannot sign transactions");
    }

    const payer = wallet as unknown as Signer;

    // Get ATA for sender & receiver
    const fromToken = await getOrCreateAssociatedTokenAccount(connection, payer, mintAddress, from);
    const toToken = await getOrCreateAssociatedTokenAccount(connection, payer, mintAddress, to);

    // Transfer instruction
    const transferIx = createTransferInstruction(
        fromToken.address,
        toToken.address,
        wallet.publicKey,
        amount * 1_000_000 // Assuming 6 decimals
    );

    const tx = new Transaction().add(transferIx);
    const signedTx = await wallet.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signedTx.serialize());
    await connection.confirmTransaction(sig, "confirmed");

    console.log(`✅ Transferred ${amount} tokens to ${to.toBase58()}`);
    return sig;
}
