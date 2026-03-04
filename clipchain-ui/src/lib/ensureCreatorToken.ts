import { Connection, PublicKey, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { WalletContextState } from "@solana/wallet-adapter-react";
import {
    MINT_SIZE,
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    createInitializeMintInstruction,
    createMintToInstruction,
    getAssociatedTokenAddress,
    getMint,
    AuthorityType,
    createSetAuthorityInstruction,
} from "@solana/spl-token";
import { createCreateMetadataAccountV3Instruction, PROGRAM_ID as MPL_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { db } from "../firebase/config";
import { uploadTokenMetadata } from "./tokenMetadata";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";

const DECIMALS = 6;
const INITIAL_SUPPLY = 100 * 10 ** DECIMALS;
const TOKEN_METADATA_PROGRAM_ID = MPL_PROGRAM_ID || new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const BACKEND_MINT_AUTHORITY = (() => {
    const raw = import.meta.env.VITE_MINT_AUTH_PUBKEY;
    if (!raw) return null;
    try {
        return new PublicKey(raw.trim());
    } catch {
        return null;
    }
})();

const sanitizeTokenName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return "ClipChain";
    return trimmed.length > 32 ? trimmed.slice(0, 32) : trimmed;
};

const sanitizeTokenSymbol = (name: string) => {
    const cleaned = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (!cleaned) return "FAN";
    return cleaned.length > 10 ? cleaned.slice(0, 10) : cleaned;
};

export async function ensureCreatorToken(wallet: WalletContextState, connection: Connection): Promise<PublicKey> {
    if (!wallet.publicKey || !wallet.sendTransaction) throw new Error("Wallet not connected");

    const payer = wallet.publicKey;
    const creatorAddress = payer.toBase58();
    const docRef = doc(db, "creators", creatorAddress);
    let docSnap = await getDoc(docRef);
    let data = docSnap.exists() ? docSnap.data() : null;

    if (!data) {
        const defaultName = `Creator-${creatorAddress.slice(0, 5)}`;
        await setDoc(docRef, {
            displayName: defaultName,
            createdAt: Timestamp.now()
        });
        data = { displayName: defaultName };
    }

    if (data.tokenMint) {
        if (BACKEND_MINT_AUTHORITY) {
            try {
                const mintPubkey = new PublicKey(data.tokenMint);
                const mintInfo = await getMint(connection, mintPubkey, "confirmed", TOKEN_PROGRAM_ID);
                const currentAuthority = mintInfo.mintAuthority;
                if (currentAuthority && currentAuthority.equals(BACKEND_MINT_AUTHORITY)) {
                    if (data.mintAuthority !== BACKEND_MINT_AUTHORITY.toBase58()) {
                        await setDoc(docRef, { mintAuthority: BACKEND_MINT_AUTHORITY.toBase58() }, { merge: true });
                    }
                } else if (currentAuthority && currentAuthority.equals(payer) && !currentAuthority.equals(BACKEND_MINT_AUTHORITY)) {
                    const tx = new Transaction().add(
                        createSetAuthorityInstruction(
                            mintPubkey,
                            payer,
                            AuthorityType.MintTokens,
                            BACKEND_MINT_AUTHORITY,
                            [],
                            TOKEN_PROGRAM_ID
                        )
                    );
                    const sig = await wallet.sendTransaction(tx, connection);
                    await connection.confirmTransaction(sig, "confirmed");
                    await setDoc(docRef, { mintAuthority: BACKEND_MINT_AUTHORITY.toBase58() }, { merge: true });
                }
            } catch (e) {
                console.warn("Failed to verify/transfer mint authority", e);
            }
        }
        return new PublicKey(data.tokenMint);
    }

    // ✅ Create mint + ATA using wallet as fee payer and mint authority
    const mintKeypair = Keypair.generate();
    const rent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    const ata = await getAssociatedTokenAddress(mintKeypair.publicKey, payer);
    const tokenName = sanitizeTokenName(String(data.displayName || `Creator-${creatorAddress.slice(0, 5)}`));
    const tokenSymbol = sanitizeTokenSymbol(tokenName);
    let metadataUri = "";
    try {
        metadataUri = await uploadTokenMetadata({
            name: tokenName,
            symbol: tokenSymbol,
            imageUrl: data.avatarUrl || "",
            creatorAddress,
        });
    } catch (e) {
        console.warn("Failed to upload token metadata; continuing without URI.", e);
    }

    const metadataPda = PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            mintKeypair.publicKey.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
    )[0];

    const tx = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer,
            newAccountPubkey: mintKeypair.publicKey,
            space: MINT_SIZE,
            lamports: rent,
            programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(mintKeypair.publicKey, DECIMALS, payer, payer, TOKEN_PROGRAM_ID),
        createCreateMetadataAccountV3Instruction(
            {
                metadata: metadataPda,
                mint: mintKeypair.publicKey,
                mintAuthority: payer,
                payer,
                updateAuthority: payer,
            },
            {
                createMetadataAccountArgsV3: {
                    data: {
                        name: tokenName,
                        symbol: tokenSymbol,
                        uri: metadataUri,
                        sellerFeeBasisPoints: 0,
                        creators: null,
                        collection: null,
                        uses: null,
                    },
                    isMutable: true,
                    collectionDetails: null,
                },
            }
        ),
        createAssociatedTokenAccountInstruction(
            payer,           // payer
            ata,             // ata address
            payer,           // owner
            mintKeypair.publicKey,
            TOKEN_PROGRAM_ID
        ),
        createMintToInstruction(
            mintKeypair.publicKey,
            ata,
            payer,
            INITIAL_SUPPLY
        )
    );

    if (BACKEND_MINT_AUTHORITY) {
        tx.add(
            createSetAuthorityInstruction(
                mintKeypair.publicKey,
                payer,
                AuthorityType.MintTokens,
                BACKEND_MINT_AUTHORITY,
                [],
                TOKEN_PROGRAM_ID
            )
        );
    } else {
        console.warn("Missing VITE_MINT_AUTH_PUBKEY; mint authority will stay with creator wallet.");
    }

    const sig = await wallet.sendTransaction(tx, connection, { signers: [mintKeypair] });
    await connection.confirmTransaction(sig, "confirmed");

    // ✅ Save in Firestore
    await setDoc(docRef, {
        ...data,
        tokenMint: mintKeypair.publicKey.toBase58(),
        tokenName: tokenName,
        tokenSymbol: tokenSymbol,
        symbol: tokenSymbol,
        metadataUri: metadataUri,
        initialSupply: INITIAL_SUPPLY,
        yieldRate: 0.1,
        mintAuthority: BACKEND_MINT_AUTHORITY ? BACKEND_MINT_AUTHORITY.toBase58() : payer.toBase58(),
    }, { merge: true });

    return mintKeypair.publicKey;
}
