import { IdlAccounts, Program, AnchorProvider } from "@coral-xyz/anchor";
import IDL from "../idl/clipchain.json";
import { Connection, PublicKey } from "@solana/web3.js";
import { getRpcUrl } from "../lib/solanaRpc";

const programId = new PublicKey("B2Sj5CsvGJvYEVUgF1ZBnWsBzWuHRQLrgMSJDjBU5hWA");
const connection = new Connection(getRpcUrl(), "confirmed");

// You need a dummy wallet to initialize AnchorProvider.
// Replace this with real wallet integration if needed.
const dummyWallet = {
    publicKey: null,
    signAllTransactions: async (txs: any) => txs,
    signTransaction: async (tx: any) => tx,
};

const provider = new AnchorProvider(connection, dummyWallet as any, {});
export const program = new Program(IDL as any, programId, provider);

// Derive PDA for the "counter" seed
export const [counterPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter")],
    program.programId
);

// Optional: define CounterData if you want to strongly type your account
export type CounterData = any;
