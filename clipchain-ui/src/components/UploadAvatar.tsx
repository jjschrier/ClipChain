import React, { useState } from "react";
import { uploadToStorage } from "../lib/uploadToStorage";
import { useWallet } from "@solana/wallet-adapter-react";
import { saveAvatar } from "../lib/userService";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { createUpdateMetadataAccountV2Instruction, PROGRAM_ID as MPL_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { getRpcUrl } from "../lib/solanaRpc";
import { uploadTokenMetadata } from "../lib/tokenMetadata";

type Uploaded = { url: string }[] | undefined;

const UploadAvatar = ({
    onComplete,
    onUpload,
}: {
    onComplete?: (url: string) => void;
    onUpload?: (url: string) => void;
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const wallet = useWallet();
    const { publicKey } = wallet;
    const TOKEN_METADATA_PROGRAM_ID = MPL_PROGRAM_ID || new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

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

    const updateTokenMetadataForAvatar = async (avatarUrl: string) => {
        if (!wallet.publicKey || !wallet.sendTransaction) return;
        const creatorKey = wallet.publicKey.toBase58();
        let creatorSnap;
        try {
            creatorSnap = await getDoc(doc(db, "creators", creatorKey));
        } catch (e) {
            console.warn("Failed to load creator profile for metadata update", e);
            return;
        }
        if (!creatorSnap.exists()) return;
        const data = creatorSnap.data() as any;
        if (!data?.tokenMint) return;

        const nameSource = data.tokenName || data.displayName || `Creator-${creatorKey.slice(0, 5)}`;
        const tokenName = sanitizeTokenName(String(nameSource));
        const tokenSymbol = sanitizeTokenSymbol(String(data.tokenSymbol || data.tokenName || data.displayName || tokenName));

        let metadataUri = "";
        try {
            metadataUri = await uploadTokenMetadata({
                name: tokenName,
                symbol: tokenSymbol,
                imageUrl: avatarUrl,
                creatorAddress: creatorKey,
            });
        } catch (e) {
            console.warn("Metadata upload failed; skipping token image update", e);
            return;
        }

        const connection = new Connection(getRpcUrl(), "confirmed");
        const mintPubkey = new PublicKey(data.tokenMint);
        const metadataPda = PublicKey.findProgramAddressSync(
            [
                Buffer.from("metadata"),
                TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                mintPubkey.toBuffer(),
            ],
            TOKEN_METADATA_PROGRAM_ID
        )[0];

        try {
            const ix = createUpdateMetadataAccountV2Instruction(
                {
                    metadata: metadataPda,
                    updateAuthority: wallet.publicKey,
                },
                {
                    updateMetadataAccountArgsV2: {
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
                        primarySaleHappened: null,
                        updateAuthority: wallet.publicKey,
                    },
                }
            );

            const tx = new Transaction().add(ix);
            const sig = await wallet.sendTransaction(tx, connection);
            await connection.confirmTransaction(sig, "confirmed");
            await setDoc(
                doc(db, "creators", creatorKey),
                { metadataUri, updatedAt: serverTimestamp() },
                { merge: true }
            );
        } catch (e) {
            console.warn("Token metadata update failed", e);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            console.log("Selected file:", selectedFile.name);
            setFile(selectedFile);
        }
    };

    const handleUpload = async () => {
        if (!file) return alert("Please select a file.");
        if (!publicKey) return alert("Please connect your wallet.");

        setLoading(true);

        try {
            console.log("Uploading avatar to IPFS...");
            const url = await uploadToStorage(file, "avatars");
            console.log("Avatar uploaded to IPFS:", url);

            console.log("Saving avatar to Firestore...");
            await saveAvatar(publicKey.toBase58(), url);
            await updateTokenMetadataForAvatar(url);
            console.log("Avatar saved to Firestore successfully");

            handleComplete([{ url }]);
        } catch (error) {
            console.error("Avatar upload error:", error);
            alert("Failed to upload avatar. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = (res: Uploaded) => {
        console.debug("UploadAvatar.onClientUploadComplete", res);
        if (!res || !Array.isArray(res) || res.length === 0) {
            alert("Upload failed: unexpected server response.");
            return;
        }
        const url = res[0]?.url;
        if (!url) {
            alert("Upload failed: missing URL.");
            return;
        }
        onComplete?.(url);
        onUpload?.(url);
    };

    return (
        <div className="flex flex-col gap-3 text-sm text-white w-64">
            <label htmlFor="avatar-upload" className="text-gray-300 font-medium">
                Choose Profile Picture
            </label>
            <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleChange}
                className="text-xs text-white bg-gray-700 p-2 rounded border border-gray-600"
            />

            <button
                onClick={handleUpload}
                disabled={!file || loading}
                className={`mt-2 px-4 py-2 rounded text-sm font-medium transition ${loading
                    ? "bg-gray-600 cursor-wait"
                    : file
                        ? "bg-purple-600 hover:bg-purple-700"
                        : "bg-gray-600 cursor-not-allowed"
                    }`}
            >
                {loading ? "Uploading..." : "Upload Avatar"}
            </button>
        </div>
    );
};

export default UploadAvatar;
