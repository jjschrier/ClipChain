import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import idl from "../idl/clipchain.json";

const programID = new PublicKey(idl.metadata.address);
const network = "https://api.devnet.solana.com";

export function useAnchorProgram() {
    const wallet = useWallet();
    const connection = new Connection(network, "confirmed");

    const provider = new AnchorProvider(connection, wallet, {
        preflightCommitment: "confirmed",
    });

    const program = new Program(idl as Idl, programID, provider);

    return { program, provider };
}
