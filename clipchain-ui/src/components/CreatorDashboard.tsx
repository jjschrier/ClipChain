import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { db } from "../firebase/config";
// 🛑 CRITICAL FIX: Add query and where to the imports
import { collection, doc, updateDoc, query, where, getDoc, getDocs, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import VideoCard from "./VideoCard";
import { ensureCreatorToken } from "../lib/ensureCreatorToken";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, getMint } from "@solana/spl-token";
import toast from "react-hot-toast";
import { getRpcUrl } from "../lib/solanaRpc";
import { createUpdateMetadataAccountV2Instruction, PROGRAM_ID as MPL_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { uploadTokenMetadata } from "../lib/tokenMetadata";

type Video = {
    id: string;
    creator: string; // Should store the Solana Public Key string
    title: string;
    videoUrl: string;
    tokenMint?: string;
    thumbnailUrl?: string;
    views?: number;
};

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

const CreatorDashboard = () => {
    const wallet = useWallet();
    const { publicKey } = wallet;

    const [myVideos, setMyVideos] = useState<Video[]>([]);
    const [mintAddress, setMintAddress] = useState<string | null>(null);
    const [loadingToken, setLoadingToken] = useState(false);
    const [tokenBalance, setTokenBalance] = useState<number | null>(null);
    const [loadingBalance, setLoadingBalance] = useState(false);
    const [tokenDecimals, setTokenDecimals] = useState<number | null>(null);
    const [loadingVideos, setLoadingVideos] = useState(true);
    const [displayName, setDisplayName] = useState("");
    const [creatorAvatar, setCreatorAvatar] = useState<string | null>(null);
    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    const [rewardRate, setRewardRate] = useState<number>(0.05); // tokens per second (assigned)
    const [tier, setTier] = useState<"basic" | "pro" | "boosted">("basic"); // assigned
    const [dailyCap, setDailyCap] = useState<number>(200); // assigned
    const [subscriberCount, setSubscriberCount] = useState<number>(0);
    const [likesByVideo, setLikesByVideo] = useState<Record<string, number>>({});
    const [tokenCreated, setTokenCreated] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [syncingAuthority, setSyncingAuthority] = useState(false);
    const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);
    const [videosRefreshKey, setVideosRefreshKey] = useState(0);
    const [updatingMetadata, setUpdatingMetadata] = useState(false);

const connection = new Connection(getRpcUrl(), "confirmed");
const backendMintAuthority = import.meta.env.VITE_MINT_AUTH_PUBKEY as string | undefined;
const TOKEN_METADATA_PROGRAM_ID = MPL_PROGRAM_ID || new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

    useEffect(() => {
        loadProfile();
        loadMintInfo();
        // The dependency array should contain wallet.publicKey (or just publicKey) 
        // to reload videos when the user connects or changes wallet.
    }, [publicKey]);

    useEffect(() => {
        if (!publicKey) {
            setSubscriberCount(0);
            return;
        }
        const subRef = collection(db, "creators", publicKey.toBase58(), "subscribers");
        const unsub = onSnapshot(
            subRef,
            (snap) => setSubscriberCount(snap.size),
            (err) => console.warn("Failed to watch subscribers", err)
        );
        return () => unsub();
    }, [publicKey]);

    const loadProfile = async () => {
        if (!publicKey) {
            setDisplayName("");
            return;
        }
        try {
            const snap = await getDoc(doc(db, "creators", publicKey.toBase58()));
            if (snap.exists()) {
                const data = snap.data() as any;
                setDisplayName(data.displayName || "");
                setCreatorAvatar(data.avatarUrl || null);
                setRewardRate(typeof data.rewardRatePerSecond === "number" ? data.rewardRatePerSecond : 0.05);
                setTier((data.tier as any) || "basic");
                setDailyCap(typeof data.dailyMintCap === "number" ? data.dailyMintCap : 200);
            }
        } catch (e) {
            console.warn("Failed to load creator profile", e);
        }
    };

    /**
     * ✅ FIX IMPLEMENTED: Use a Firestore query to filter videos server-side.
     * This avoids reading the entire 'videos' collection and saves cost/time.
     */
    const loadMyVideos = () => {
        setLoadingVideos(true);
        setVideosRefreshKey((prev) => prev + 1);
    };

    useEffect(() => {
        if (!publicKey) {
            setMyVideos([]);
            setLoadingVideos(false);
            return;
        }

        setLoadingVideos(true);
        setError(null);

        const creatorKey = publicKey.toBase58();
        const videosRef = collection(db, "videos");
        const q = query(videosRef, where("creator", "==", creatorKey));

        const unsub = onSnapshot(
            q,
            (snapshot) => {
                const vids: Video[] = snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...(docSnap.data() as Omit<Video, "id">),
                })) as Video[];

                setMyVideos(vids);

                if (vids[0]?.tokenMint) {
                    setMintAddress(vids[0].tokenMint);
                    fetchTokenBalance(vids[0].tokenMint).catch(() => {});
                }

                setLoadingVideos(false);
            },
            (err) => {
                console.error("Error loading videos:", err);
                setError("Failed to load your videos. Please check console for Firestore index requirements.");
                setLoadingVideos(false);
            }
        );

        return () => unsub();
    }, [publicKey, videosRefreshKey]);

    useEffect(() => {
        if (myVideos.length === 0) {
            setLikesByVideo({});
            return;
        }
        const unsubs = myVideos.map((video) => {
            const likesRef = collection(db, "videos", video.id, "likes");
            return onSnapshot(
                likesRef,
                (snap) => {
                    setLikesByVideo((prev) => ({ ...prev, [video.id]: snap.size }));
                },
                (err) => console.warn("Failed to watch likes for video", video.id, err)
            );
        });
        return () => {
            unsubs.forEach((unsub) => unsub());
        };
    }, [myVideos]);

    const loadMintInfo = async () => {
        if (!publicKey) {
            setMintAddress(null);
            setTokenCreated(false);
            return;
        }
        try {
            const snap = await getDoc(doc(db, "creators", publicKey.toBase58()));
            if (snap.exists()) {
                const data = snap.data() as any;
                if (data.tokenMint) {
                    setMintAddress(data.tokenMint);
                    setTokenCreated(true);
                    await fetchTokenBalance(data.tokenMint);
                }
            }
        } catch (e) {
            console.warn("Failed to load creator token info", e);
        }
    };

    useEffect(() => {
        if (!publicKey || !mintAddress || !backendMintAuthority || autoSyncAttempted) return;
        let cancelled = false;
        const run = async () => {
            try {
                setSyncingAuthority(true);
                await ensureCreatorToken(wallet, connection);
                if (!cancelled) {
                    await loadMintInfo();
                }
            } catch (e) {
                console.warn("Auto mint authority sync failed", e);
                toast.error("Mint authority sync failed. Claims may not settle yet.");
            } finally {
                if (!cancelled) {
                    setSyncingAuthority(false);
                    setAutoSyncAttempted(true);
                }
            }
        };
        run();
        return () => {
            cancelled = true;
        };
    }, [publicKey, mintAddress, backendMintAuthority, autoSyncAttempted, wallet, connection]);

    const fetchTokenBalance = async (mint: string) => {
        if (!publicKey) return;
        try {
            setLoadingBalance(true);
            const mintPubkey = new PublicKey(mint);
            let decimals = tokenDecimals ?? 9;
            try {
                const mintInfo = await getMint(connection, mintPubkey);
                decimals = mintInfo.decimals;
                setTokenDecimals(decimals);
            } catch (e) {
                console.warn("Failed to load mint decimals, falling back to 9", e);
            }

            const ata = await getAssociatedTokenAddress(mintPubkey, publicKey);
            const account = await getAccount(connection, ata);
            const divisor = 10 ** decimals;
            setTokenBalance(Number(account.amount) / divisor);
        } catch (err) {
            console.warn("⚠️ Could not fetch token balance (ATA may not exist):", err);
            setTokenBalance(0); // Set to 0 if the token account is not found/empty
        } finally {
            setLoadingBalance(false);
        }
    };

    const handleCreateToken = async () => {
        if (!wallet.publicKey || !wallet.signTransaction) {
            toast.error("Connect your wallet first.");
            return;
        }
        try {
            setLoadingToken(true);
            setError(null);
            toast.loading("Creating your fan token...");

            // Assuming ensureCreatorToken returns a PublicKey for the new Mint
            const mint = await ensureCreatorToken(wallet, connection);

            setMintAddress(mint.toBase58());
            await fetchTokenBalance(mint.toBase58());

            // ✅ Save mint to Firestore to the creator's doc
            const creatorDocRef = doc(db, "creators", publicKey.toBase58());
            await updateDoc(creatorDocRef, {
                tokenMint: mint.toBase58()
            });
            setTokenCreated(true);

            // Backfill existing videos with this tokenMint so watch/claims work
            const vidsSnap = await getDocs(query(collection(db, "videos"), where("creator", "==", publicKey.toBase58())));
            const updates = vidsSnap.docs.map((d) => updateDoc(d.ref, { tokenMint: mint.toBase58() }));
            await Promise.all(updates);

            toast.dismiss();
            toast.success("✅ Fan token created!");
        } catch (err) {
            console.error(err);
            setError("Token creation failed. See console for details.");
            toast.dismiss();
            toast.error("❌ Token creation failed.");
        } finally {
            setLoadingToken(false);
        }
    };

    const updateTokenMetadata = async (opts?: { showToast?: boolean }) => {
        const showToast = opts?.showToast ?? true;
        if (!publicKey || !wallet.sendTransaction) {
            if (showToast) toast.error("Connect your wallet first.");
            return false;
        }
        if (!mintAddress) {
            if (showToast) toast.error("No token mint found.");
            return false;
        }
        const normalizedDisplayName = displayName.trim();
        const tokenName = sanitizeTokenName(normalizedDisplayName || `Creator-${publicKey.toBase58().slice(0, 5)}`);
        const tokenSymbol = sanitizeTokenSymbol(tokenName);
        try {
            setUpdatingMetadata(true);
            if (showToast) toast.loading("Updating token metadata...");
            let metadataUri = "";
            try {
                metadataUri = await uploadTokenMetadata({
                    name: tokenName,
                    symbol: tokenSymbol,
                    imageUrl: creatorAvatar || "",
                    creatorAddress: publicKey.toBase58(),
                });
            } catch (e) {
                console.warn("Metadata upload failed; continuing without URI", e);
            }
            const mintPubkey = new PublicKey(mintAddress);
            const metadataPda = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("metadata"),
                    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                    mintPubkey.toBuffer(),
                ],
                TOKEN_METADATA_PROGRAM_ID
            )[0];

            const ix = createUpdateMetadataAccountV2Instruction(
                {
                    metadata: metadataPda,
                    updateAuthority: publicKey,
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
                        updateAuthority: publicKey,
                    },
                }
            );

            const tx = new Transaction().add(ix);
            const sig = await wallet.sendTransaction(tx, connection);
            await connection.confirmTransaction(sig, "finalized");

            await setDoc(
                doc(db, "creators", publicKey.toBase58()),
                { tokenName: tokenName, tokenSymbol: tokenSymbol, metadataUri: metadataUri, updatedAt: serverTimestamp() },
                { merge: true }
            );

            if (showToast) {
                toast.dismiss();
                toast.success("Token name updated on-chain.");
            }
            return true;
        } catch (e) {
            console.error("Metadata update failed", e);
            if (showToast) {
                toast.dismiss();
                toast.error("Token metadata update failed.");
            }
            return false;
        } finally {
            setUpdatingMetadata(false);
        }
    };

    const handleSaveProfile = async () => {
        if (!publicKey) return toast.error("Connect your wallet first.");
        if (!displayName.trim()) return toast.error("Enter a display name.");
        try {
            toast.loading("Saving profile...");
            await setDoc(
                doc(db, "creators", publicKey.toBase58()),
                {
                    wallet: publicKey.toBase58(),
                    displayName: displayName.trim(),
                    avatarUrl: creatorAvatar || "",
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            toast.dismiss();
            toast.success("Profile updated");
            setProfileMessage("Saved!");
            if (mintAddress && wallet.sendTransaction) {
                const updated = await updateTokenMetadata({ showToast: false });
                if (updated) {
                    setProfileMessage("Profile saved and token metadata updated.");
                }
            }
        } catch (e) {
            toast.dismiss();
            console.error(e);
            toast.error("Failed to save profile");
            setProfileMessage("Save failed");
        }
    };

    const handleUpdateTokenMetadata = async () => {
        await updateTokenMetadata({ showToast: true });
    };

    const tokenSymbol = publicKey ? `$${(displayName || publicKey.toBase58().slice(0, 5))}...` : "???";

    return (
        <div className="space-y-8">
            <h1 className="text-2xl font-bold">{tokenSymbol} Your Creator Dashboard</h1>

            {/* Profile Section */}
            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 space-y-3">
                <h2 className="text-lg font-semibold text-white">Profile</h2>
                <div className="space-y-2">
                    <label className="text-sm text-gray-300">Display Name</label>
                    <input
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="How fans see you"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 rounded border border-gray-700 bg-gray-900/60">
                            <p className="text-sm text-gray-300">Reward Rate</p>
                            <p className="text-white font-semibold">{rewardRate.toFixed(2)} tokens/sec</p>
                            <p className="text-xs text-gray-400">Assigned by ClipChain</p>
                        </div>
                        <div className="p-3 rounded border border-gray-700 bg-gray-900/60">
                            <p className="text-sm text-gray-300">Subscribers</p>
                            <p className="text-white font-semibold">{subscriberCount}</p>
                            <p className="text-xs text-gray-400">Live count</p>
                        </div>
                        <div className="p-3 rounded border border-gray-700 bg-gray-900/60">
                            <p className="text-sm text-gray-300">Daily Mint Cap</p>
                            <p className="text-white font-semibold">{dailyCap} tokens/day</p>
                            <p className="text-xs text-gray-400">Auto-managed to prevent spam</p>
                        </div>
                        <div className="p-3 rounded border border-gray-700 bg-gray-900/60">
                            <p className="text-sm text-gray-300">Tier</p>
                            <p className="text-white font-semibold capitalize">{tier}</p>
                            <p className="text-xs text-gray-400">Earn higher tiers by engagement</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSaveProfile}
                        disabled={!displayName.trim() || !publicKey}
                        className="px-4 py-2 bg-purple-600 rounded text-white disabled:opacity-50"
                    >
                        Save Profile
                    </button>
                    <button
                        onClick={handleUpdateTokenMetadata}
                        disabled={!publicKey || !mintAddress || !displayName.trim() || updatingMetadata}
                        className="ml-2 px-4 py-2 bg-emerald-600 rounded text-white disabled:opacity-50"
                    >
                        {updatingMetadata ? "Updating Token Name..." : "Update Token Name"}
                    </button>
                    {profileMessage && <p className="text-xs text-gray-300">{profileMessage}</p>}
                </div>
            </div>

            {/* Token Section */}
            <div className="bg-gray-900/70 p-4 rounded-lg border border-gray-800 space-y-3">
                <h3 className="text-sm font-semibold text-white">Tier Travel Path</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-200">
                    <div className="p-3 bg-gray-800/60 rounded border border-gray-700">
                        <p className="font-semibold">Basic → Pro</p>
                        <p className="text-gray-400">Keep good bot score, upload consistently, and earn engagement (likes, comments, subs).</p>
                    </div>
                    <div className="p-3 bg-gray-800/60 rounded border border-gray-700">
                        <p className="font-semibold">Pro → Boosted</p>
                        <p className="text-gray-400">Sustain high retention & verified identity; request review in app when eligible.</p>
                    </div>
                    <div className="p-3 bg-gray-800/60 rounded border border-gray-700">
                        <p className="font-semibold">Boosted → Trusted</p>
                        <p className="text-gray-400">Maintain low bot score and strong community signals; manual approval unlocks higher caps.</p>
                    </div>
                    <div className="p-3 bg-gray-800/60 rounded border border-gray-700">
                        <p className="font-semibold">Trusted → Featured</p>
                        <p className="text-gray-400">Stake platform token or apply for featured creator; reviewed by ClipChain team.</p>
                    </div>
                </div>
            </div>
            <div className="bg-[#0a0a23] text-white p-4 rounded shadow space-y-2">
                <p className="font-medium">Your Token: {tokenSymbol}</p>
                {mintAddress && <p className="text-sm text-green-400 break-all">✅ Mint Address: {mintAddress}</p>}
                {tokenBalance !== null && (
                    <p className="text-sm text-blue-400">
                        💰 Balance: {tokenBalance.toFixed(2)} {tokenSymbol}
                        <button
                            onClick={() => mintAddress && fetchTokenBalance(mintAddress)}
                            className="ml-2 px-2 py-1 bg-blue-600 rounded text-xs hover:bg-blue-700"
                            disabled={loadingBalance || !mintAddress}
                        >
                            {loadingBalance ? "Refreshing..." : "Refresh"}
                        </button>
                    </p>
                )}
                {syncingAuthority && (
                    <p className="text-xs text-blue-300">Syncing mint authority for claims...</p>
                )}
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button
                    onClick={handleCreateToken}
                    disabled={loadingToken || !publicKey || tokenCreated}
                    className={`mt-2 px-4 py-2 rounded text-sm text-white ${tokenCreated ? "bg-green-700 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"} disabled:opacity-50`}
                >
                    {loadingToken ? "Creating Token..." : tokenCreated ? "Token Created" : "Create My Fan Token"}
                </button>
            </div>

            {/* Videos Section */}
            <div className="mt-6">
                <h2 className="text-xl font-semibold mb-4">Your Videos</h2>
                {loadingVideos ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="bg-gray-800 p-4 rounded-lg animate-pulse h-40" />
                        ))}
                    </div>
                ) : error ? (
                    <div>
                        <p className="text-red-400">{error}</p>
                        <button onClick={loadMyVideos} className="bg-red-600 px-4 py-2 rounded text-white mt-2">
                            Retry
                        </button>
                    </div>
                ) : myVideos.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {myVideos.map((video) => {
                            const card = {
                                id: video.id,
                                title: video.title,
                                thumbnailUrl: video.thumbnailUrl || "/default-thumbnail.png",
                                creatorName: displayName,
                                creatorAvatar: creatorAvatar || "/default-avatar.png",
                                views: typeof video.views === "number" ? video.views : 0,
                                likes: likesByVideo[video.id] ?? 0,
                                duration: null,
                                uploadDate: null,
                                earnings: null,
                            };
                            return <VideoCard key={video.id} video={card} />;
                        })}
                    </div>
                ) : (
                    <p className="text-gray-400">No videos uploaded yet. Time to create some content!</p>
                )}
            </div>
        </div>
    );
};

export default CreatorDashboard;
