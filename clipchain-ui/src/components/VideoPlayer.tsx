import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
    doc,
    getDoc,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    getCountFromServer,
    setDoc,
    deleteDoc,
    updateDoc,
    increment
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useWallet } from "@solana/wallet-adapter-react";
import { Heart, Bell } from "lucide-react";
import { logWatchHeartbeat } from "../services/watchLogs";
import { markEngagedViewer } from "../services/viewerProfile";
import { requestClaim } from "../services/claims";
import { getSolanaNetwork } from "../lib/solanaRpc";

interface VideoData {
    id: string;
    title: string;
    videoUrl: string;
    creator: string;
    tokenMint: string;
    views?: number;
    creatorDisplayName?: string;
    creatorAvatar?: string;
    createdAt?: any;
}

interface Comment {
    id: string;
    text: string;
    user: string;
    createdAt: any;
}

interface CreatorProfile {
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    tokenSymbol?: string;
}

const encodeBase64 = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...Array.from(bytes)));

const buildVideoCandidates = (rawUrl: string): string[] => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return [];
    let cid: string | null = null;
    try {
        const parsed = new URL(trimmed);
        const match = parsed.pathname.match(/\/ipfs\/([^/]+)/);
        if (match) cid = match[1];
    } catch {
        cid = null;
    }
    if (!cid) return [trimmed];
    const gateways = [
        `https://tan-tired-firefly-179.mypinata.cloud/ipfs/${cid}`,
        `https://gateway.pinata.cloud/ipfs/${cid}`,
        `https://ipfs.io/ipfs/${cid}`,
        `https://cloudflare-ipfs.com/ipfs/${cid}`,
    ];
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const entry of [trimmed, ...gateways]) {
        if (!entry || seen.has(entry)) continue;
        seen.add(entry);
        candidates.push(entry);
    }
    return candidates;
};

const AD_TAG_URL = "https://s.magsrv.com/v1/vast.php?idzone=5813564";

const parseDurationToSeconds = (value?: string | null): number | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    const parts = trimmed.split(":").map((part) => part.trim());
    if (parts.length < 2) return null;
    const nums = parts.map((part) => Number(part));
    if (nums.some((num) => Number.isNaN(num))) return null;
    if (nums.length === 2) {
        const [minutes, seconds] = nums;
        return minutes * 60 + seconds;
    }
    const [hours, minutes, seconds] = nums;
    return hours * 3600 + minutes * 60 + seconds;
};

const parseSkipOffsetToSeconds = (value: string | null, durationSeconds: number | null): number | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.endsWith("%")) {
        if (!durationSeconds) return null;
        const percent = Number(trimmed.replace("%", ""));
        if (Number.isNaN(percent)) return null;
        return (durationSeconds * percent) / 100;
    }
    return parseDurationToSeconds(trimmed);
};

const fetchVastMedia = async () => {
    const response = await fetch(AD_TAG_URL, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`VAST request failed: ${response.status}`);
    }
    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const mediaFiles = Array.from(xmlDoc.getElementsByTagName("MediaFile"));
    const pickMedia = (mediaFiles.find((node) => node.getAttribute("type")?.includes("mp4")) || mediaFiles[0]) as
        | Element
        | undefined;
    const mediaUrl = pickMedia?.textContent?.trim() ?? null;

    const linear = xmlDoc.getElementsByTagName("Linear")[0];
    const skipOffsetRaw = linear?.getAttribute("skipoffset") ?? null;
    const durationNode = xmlDoc.getElementsByTagName("Duration")[0];
    const durationSeconds = parseDurationToSeconds(durationNode?.textContent);
    const skipOffsetSeconds = parseSkipOffsetToSeconds(skipOffsetRaw, durationSeconds);

    if (!mediaUrl) {
        throw new Error("No media file found in VAST response.");
    }

    return {
        mediaUrl,
        durationSeconds,
        skipOffsetSeconds,
    };
};

const VideoPlayer: React.FC = () => {
    const { videoId } = useParams<{ videoId: string }>();
    const [videoData, setVideoData] = useState<VideoData | null>(null);
    const [loading, setLoading] = useState(true);
    const [rewardStatus, setRewardStatus] = useState<string>("");
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentText, setCommentText] = useState("");
    const [likeLoading, setLikeLoading] = useState(false);
    const [subLoading, setSubLoading] = useState(false);
    const [likesCount, setLikesCount] = useState<number>(0);
    const [subCount, setSubCount] = useState<number>(0);
    const [liked, setLiked] = useState(false);
    const [subscribed, setSubscribed] = useState(false);
    const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
    const [rewardRate, setRewardRate] = useState<number>(0.05);
    const [pendingReward, setPendingReward] = useState<number>(0);
    const [claiming, setClaiming] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);
    const [videoCandidates, setVideoCandidates] = useState<string[]>([]);
    const [candidateIndex, setCandidateIndex] = useState(0);
    const [adStatus, setAdStatus] = useState<"idle" | "loading" | "playing" | "blocked">("idle");
    const [adBreak, setAdBreak] = useState<"preroll" | "midroll" | null>(null);
    const [adMediaUrl, setAdMediaUrl] = useState<string | null>(null);
    const [adSkipOffset, setAdSkipOffset] = useState<number | null>(null);
    const [adCanSkip, setAdCanSkip] = useState(false);
    const [adDuration, setAdDuration] = useState<number | null>(null);
    const [adTime, setAdTime] = useState(0);
    const [claimId, setClaimId] = useState<string | null>(null);
    const [claimStatus, setClaimStatus] = useState<string | null>(null);
    const [claimTxid, setClaimTxid] = useState<string | null>(null);
    const viewLoggedRef = useRef(false);
    const accumulatedRef = useRef(0);
    const lastTimeRef = useRef<number | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const adRef = useRef<HTMLVideoElement>(null);
    const sessionIdRef = useRef<string>(globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const adPlayingRef = useRef(false);
    const preRollPlayedRef = useRef(false);
    const midrollCueRef = useRef<number | null>(null);
    const midrollPlayedRef = useRef(false);
    const resumeTimeRef = useRef(0);
    const resumeShouldPlayRef = useRef(false);
    const wallet = useWallet();
    const isAdActive = adStatus !== "idle";

    // Fetch video data
    useEffect(() => {
        let mounted = true;
        const fetchVideo = async () => {
            try {
                if (!videoId) return;
                const docRef = doc(db, "videos", videoId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists() && mounted) {
                    const video = { ...(docSnap.data() as VideoData), id: docSnap.id };
                    setVideoData(video);

                    // Fetch creator profile
                    const creatorDoc = await getDoc(doc(db, "creators", video.creator));
                    if (creatorDoc.exists()) {
                        const data = creatorDoc.data() as any;
                        setCreatorProfile(data as CreatorProfile);
                        setRewardRate(typeof data.rewardRatePerSecond === "number" ? data.rewardRatePerSecond : 0.05);
                    } else {
                        setRewardRate(0.05);
                    }

                    // Fetch likes and subscribers count
                    const likesSnap = await getCountFromServer(collection(db, "videos", videoId, "likes"));
                    setLikesCount(likesSnap.data().count);

                    const subSnap = await getCountFromServer(collection(db, "creators", video.creator, "subscribers"));
                    setSubCount(subSnap.data().count);
                }
            } catch (error) {
                console.error("❌ Error fetching video:", error);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        fetchVideo();
        return () => {
            mounted = false;
        };
    }, [videoId]);

    // Live updates for creator profile (display name/avatar)
    useEffect(() => {
        if (!videoData?.creator) return;
        const unsub = onSnapshot(doc(db, "creators", videoData.creator), (snap) => {
            if (snap.exists()) {
                const data = snap.data() as any;
                setCreatorProfile(data as CreatorProfile);
                if (typeof data.rewardRatePerSecond === "number") {
                    setRewardRate(data.rewardRatePerSecond);
                }
            }
        });
        return () => unsub();
    }, [videoData?.creator]);

    // Real-time comments listener
    useEffect(() => {
        if (!videoId) return;
        const q = query(collection(db, "videos", videoId, "comments"), orderBy("createdAt", "asc"));
        const unsub = onSnapshot(q, (snapshot) => {
            const data: Comment[] = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...(doc.data() as Omit<Comment, "id">),
            }));
            setComments(data);
        });
        return () => unsub();
    }, [videoId]);

    // Reset watch tracking when video changes
    useEffect(() => {
        accumulatedRef.current = 0;
        lastTimeRef.current = null;
        viewLoggedRef.current = false;
        preRollPlayedRef.current = false;
        midrollPlayedRef.current = false;
        midrollCueRef.current = null;
        adPlayingRef.current = false;
        resumeTimeRef.current = 0;
        resumeShouldPlayRef.current = false;
        setAdStatus("idle");
        setAdBreak(null);
        setAdMediaUrl(null);
        setAdSkipOffset(null);
        setAdCanSkip(false);
        setAdDuration(null);
        setAdTime(0);
    }, [videoId]);

    useEffect(() => {
        if (!videoData?.videoUrl) {
            setVideoCandidates([]);
            setCandidateIndex(0);
            setVideoError(null);
            return;
        }
        setVideoCandidates(buildVideoCandidates(videoData.videoUrl));
        setCandidateIndex(0);
        setVideoError(null);
    }, [videoData?.videoUrl, videoId]);

    // Check like/subscription state for current user
    useEffect(() => {
        const fetchUserReactions = async () => {
            if (!wallet.publicKey || !videoData) return;
            try {
                const likeRef = doc(db, "videos", videoId!, "likes", wallet.publicKey.toBase58());
                const likeSnap = await getDoc(likeRef);
                setLiked(likeSnap.exists());

                const subRef = doc(db, "creators", videoData.creator, "subscribers", wallet.publicKey.toBase58());
                const subSnap = await getDoc(subRef);
                setSubscribed(subSnap.exists());
            } catch (e) {
                console.warn("Failed to load reaction state", e);
            }
        };
        fetchUserReactions();
    }, [wallet.publicKey, videoData, videoId]);

    useEffect(() => {
        if (!claimId) return;
        const ref = doc(db, "claim_requests", claimId);
        const unsub = onSnapshot(ref, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as any;
            const nextStatus = data?.status || "pending";
            setClaimStatus(nextStatus);
            setClaimTxid(data?.txid || null);
            if (nextStatus === "settled") {
                setPendingReward(0);
                setRewardStatus("✅ Claim settled");
                setTimeout(() => setRewardStatus(""), 2500);
            }
        });
        return () => unsub();
    }, [claimId]);

    useEffect(() => {
        if (!adMediaUrl) return;
        if (adStatus !== "loading") return;
        const adVideo = adRef.current;
        if (!adVideo) return;
        adVideo.src = adMediaUrl;
        adVideo.currentTime = 0;
        adVideo.muted = false;
        const playResult = adVideo.play();
        if (playResult?.then) {
            playResult
                .then(() => setAdStatus("playing"))
                .catch(() => setAdStatus("blocked"));
        } else {
            setAdStatus("playing");
        }
    }, [adMediaUrl, adStatus]);

    // Handle like button
    const handleLike = async () => {
        if (!wallet.publicKey) return alert("Connect wallet first!");
        setLikeLoading(true);
        try {
            const likeRef = doc(db, "videos", videoId!, "likes", wallet.publicKey.toBase58());
            const snap = await getDoc(likeRef);
            if (snap.exists()) {
                await deleteDoc(likeRef);
                setLikesCount((prev) => Math.max(0, prev - 1));
                setLiked(false);
            } else {
                await setDoc(likeRef, {
                    user: wallet.publicKey.toBase58(),
                    createdAt: serverTimestamp(),
                });
                await markEngagedViewer(wallet.publicKey.toBase58());
                setLikesCount((prev) => prev + 1);
                setLiked(true);
            }
        } catch (error) {
            console.error("❌ Like error:", error);
        } finally {
            setLikeLoading(false);
        }
    };

    // Handle subscribe button
    const handleSubscribe = async () => {
        if (!wallet.publicKey) return alert("Connect wallet first!");
        setSubLoading(true);
        try {
            const subRef = doc(db, "creators", videoData!.creator, "subscribers", wallet.publicKey.toBase58());
            const snap = await getDoc(subRef);
            if (snap.exists()) {
                await deleteDoc(subRef);
                setSubCount((prev) => Math.max(0, prev - 1));
                setSubscribed(false);
            } else {
                await setDoc(subRef, {
                    user: wallet.publicKey.toBase58(),
                    createdAt: serverTimestamp(),
                });
                await markEngagedViewer(wallet.publicKey.toBase58());
                setSubCount((prev) => prev + 1);
                setSubscribed(true);
            }
        } catch (error) {
            console.error("❌ Subscribe error:", error);
        } finally {
            setSubLoading(false);
        }
    };

    // Handle comment post
    const handleComment = async () => {
        if (!wallet.publicKey || !commentText.trim()) return;
        try {
            await addDoc(collection(db, "videos", videoId!, "comments"), {
                text: commentText,
                user: wallet.publicKey.toBase58(),
                createdAt: serverTimestamp(),
            });
            setCommentText("");
        } catch (error) {
            console.error("❌ Comment error:", error);
        }
    };

    if (loading) {
        return (
            <div className="p-6 max-w-4xl mx-auto animate-pulse">
                <div className="w-full h-64 bg-gray-700 rounded-xl mb-4"></div>
                <div className="h-6 bg-gray-700 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-gray-700 rounded w-1/2"></div>
            </div>
        );
    }

    if (!videoData) return <div className="text-center text-gray-400 mt-16">Video not found or failed to load.</div>;

    const creatorName = (creatorProfile?.displayName || videoData.creatorDisplayName || creatorProfile?.username || "Creator");
    const creatorTokenLabel = creatorProfile?.tokenSymbol || "Fan Token";
    const creatorAvatar = creatorProfile?.avatarUrl || videoData.creatorAvatar || "/default-avatar.png";
    const fallbackMint = videoData.tokenMint || (creatorProfile as any)?.tokenMint;
    const network = getSolanaNetwork();
    const explorerSuffix = network === "mainnet-beta" ? "" : `?cluster=${network}`;
    const claimExplorerUrl = claimTxid ? `https://solscan.io/tx/${claimTxid}${explorerSuffix}` : null;
    const claimDisabledReason = !wallet.publicKey
        ? "Connect wallet to claim"
        : !wallet.signMessage
            ? "Wallet does not support message signing"
        : !fallbackMint
            ? "Creator token not set yet"
            : claimStatus === "pending"
                ? "Claim pending settlement"
                : pendingReward <= 0
                ? "Watch at least 15s with sound on and tab visible to earn"
                : null;

    const handleClaim = async () => {
        if (!wallet.publicKey) return alert("Connect wallet first!");
        if (!wallet.signMessage) return alert("Wallet does not support message signing.");
        if (pendingReward <= 0) return alert("No pending reward yet. Watch at least 15 seconds with sound on.");
        try {
            setClaiming(true);
            const pendingFixed = Number(pendingReward.toFixed(2));
            const nonce = `${Date.now()}`;
            const message = [
                "ClipChain Claim v1",
                `viewer:${wallet.publicKey.toBase58()}`,
                `creator:${videoData.creator}`,
                `videoId:${videoId}`,
                `mint:${fallbackMint || ""}`,
                `amount:${pendingFixed}`,
                `nonce:${nonce}`,
            ].join("\n");
            const signatureBytes = await wallet.signMessage(new TextEncoder().encode(message));
            const signature = encodeBase64(signatureBytes);
            const claimResult = await requestClaim({
                viewer: wallet.publicKey.toBase58(),
                creator: videoData.creator,
                mint: fallbackMint || undefined,
                videoId,
                pendingReward: pendingFixed,
                reason: "watch-session",
                signature,
                message,
                nonce,
                signatureType: "message",
                signedAt: Date.now(),
            });
            if (claimResult.mode === "instant") {
                setClaimStatus(claimResult.status || "settled");
                setClaimTxid(claimResult.txid || null);
                setPendingReward(0);
                setRewardStatus("✅ Claim settled");
            } else {
                setClaimId(claimResult.claimId || null);
                setClaimStatus(claimResult.status || "pending");
                setRewardStatus("⏳ Claim queued for settlement");
            }
            setTimeout(() => setRewardStatus(""), 1500);
        } catch (e) {
            console.error("Claim failed", e);
            alert("Could not file claim. Try again.");
        } finally {
            setClaiming(false);
        }
    };

    const endAd = () => {
        adPlayingRef.current = false;
        setAdStatus("idle");
        setAdBreak(null);
        setAdMediaUrl(null);
        setAdSkipOffset(null);
        setAdCanSkip(false);
        setAdDuration(null);
        setAdTime(0);
        const adVideo = adRef.current;
        if (adVideo) {
            adVideo.pause();
            adVideo.removeAttribute("src");
            adVideo.load();
        }
        const contentVideo = videoRef.current;
        if (contentVideo && resumeShouldPlayRef.current) {
            contentVideo.currentTime = resumeTimeRef.current || contentVideo.currentTime;
            contentVideo.play().catch(() => {});
        }
        lastTimeRef.current = null;
    };

    const startAd = async (breakType: "preroll" | "midroll") => {
        if (adPlayingRef.current) return;
        adPlayingRef.current = true;
        setAdBreak(breakType);
        setAdStatus("loading");
        setAdMediaUrl(null);
        setAdCanSkip(false);
        setAdSkipOffset(null);
        setAdDuration(null);
        setAdTime(0);
        lastTimeRef.current = null;

        const contentVideo = videoRef.current;
        if (contentVideo) {
            resumeTimeRef.current = contentVideo.currentTime || 0;
            resumeShouldPlayRef.current = !contentVideo.paused;
            contentVideo.pause();
        } else {
            resumeShouldPlayRef.current = false;
        }

        try {
            const { mediaUrl, durationSeconds, skipOffsetSeconds } = await fetchVastMedia();
            setAdMediaUrl(mediaUrl);
            setAdDuration(durationSeconds);
            setAdSkipOffset(skipOffsetSeconds);
        } catch (error) {
            console.warn("Ad failed to load, resuming content.", error);
            endAd();
        }
    };

    const handleContentPlay = async () => {
        if (adPlayingRef.current) return;
        if (!preRollPlayedRef.current) {
            preRollPlayedRef.current = true;
            resumeShouldPlayRef.current = true;
            await startAd("preroll");
            return;
        }
        if (!viewLoggedRef.current) {
            void handleViewIncrement();
        }
    };

    const handleAdPlayClick = async () => {
        const adVideo = adRef.current;
        if (!adVideo) return;
        try {
            await adVideo.play();
            setAdStatus("playing");
        } catch {
            setAdStatus("blocked");
        }
    };

    const handleAdTimeUpdate = () => {
        const adVideo = adRef.current;
        if (!adVideo) return;
        setAdTime(adVideo.currentTime);
        if (adSkipOffset !== null && adVideo.currentTime >= adSkipOffset) {
            setAdCanSkip(true);
        }
    };

    const handleTimeUpdate = async () => {
        const video = videoRef.current;
        if (!video || !wallet.publicKey || !videoData?.creator) return;
        if (adPlayingRef.current) return;
        if (video.muted || document.visibilityState !== "visible") return;

        const current = video.currentTime;
        if (!midrollPlayedRef.current && midrollCueRef.current !== null && current >= midrollCueRef.current) {
            midrollPlayedRef.current = true;
            await startAd("midroll");
            return;
        }
        if (lastTimeRef.current === null) {
            lastTimeRef.current = current;
            return;
        }
        let delta = current - (lastTimeRef.current ?? 0);
        if (delta < 0 || delta > 10) {
            lastTimeRef.current = current;
            return;
        }
        accumulatedRef.current += delta;
        lastTimeRef.current = current;

        while (accumulatedRef.current >= 15) {
            accumulatedRef.current -= 15;
            try {
                await logWatchHeartbeat({
                    videoId: videoId!,
                    creator: videoData.creator,
                    mint: fallbackMint || undefined,
                    viewer: wallet.publicKey!.toBase58(),
                    seconds: 15,
                    sessionId: sessionIdRef.current,
                    deviceHash: sessionIdRef.current,
                    muted: video.muted,
                    hidden: document.visibilityState !== "visible",
                    rewardRate,
                });
                setPendingReward((prev) => prev + 15 * rewardRate);
                setRewardStatus("⏱️ Watch time logged");
                setTimeout(() => setRewardStatus(""), 1500);
            } catch (err) {
                console.warn("Watch heartbeat failed", err);
                setRewardStatus("⚠️ Watch logging blocked (auth/rules?)");
                setTimeout(() => setRewardStatus(""), 2500);
            }
        }
    };

    const handlePause = () => {
        lastTimeRef.current = null;
    };

    const handleVideoReady = () => {
        if (videoError) setVideoError(null);
        if (midrollCueRef.current !== null) return;
        const contentVideo = videoRef.current;
        if (!contentVideo) return;
        const duration = contentVideo.duration;
        if (Number.isFinite(duration) && duration >= 60) {
            midrollCueRef.current = Math.max(30, Math.min(60, duration * 0.5));
        } else if (!Number.isFinite(duration)) {
            midrollCueRef.current = 120;
        }
    };

    const handleVideoError = () => {
        if (videoCandidates.length > 0 && candidateIndex < videoCandidates.length - 1) {
            setCandidateIndex((prev) => prev + 1);
            setVideoError("Video gateway failed. Trying another source...");
            return;
        }
        setVideoError("Could not load this video. Check the file URL or try again.");
    };

    const handleViewIncrement = async () => {
        if (viewLoggedRef.current || !videoId) return;
        if (adPlayingRef.current) return;
        try {
            viewLoggedRef.current = true;
            await updateDoc(doc(db, "videos", videoId), { views: increment(1) });
            setVideoData((prev) => prev ? { ...prev, views: (prev.views || 0) + 1 } : prev);
        } catch (e) {
            console.warn("Could not increment view count", e);
        }
    };

    const activeVideoUrl = videoCandidates.length > 0 ? videoCandidates[candidateIndex] : videoData.videoUrl;
    const skipRemaining = adSkipOffset !== null ? Math.max(0, Math.ceil(adSkipOffset - adTime)) : null;

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            {/* Video Player */}
            <h1 className="text-2xl font-bold mb-4">{videoData.title}</h1>
            <div className="relative">
                {activeVideoUrl ? (
                    <video
                        key={activeVideoUrl}
                        ref={videoRef}
                        controls
                        playsInline
                        preload="auto"
                        onPlay={handleContentPlay}
                        onTimeUpdate={handleTimeUpdate}
                        onPause={handlePause}
                        onEnded={handlePause}
                        onLoadedMetadata={handleVideoReady}
                        onCanPlay={handleVideoReady}
                        onError={handleVideoError}
                        className={`w-full rounded-xl shadow-lg ${isAdActive ? "opacity-0 pointer-events-none" : ""}`}
                        src={activeVideoUrl}
                    />
                ) : (
                    <div className="w-full h-64 rounded-xl bg-gray-800 flex items-center justify-center text-gray-300">
                        Video URL is missing.
                    </div>
                )}
                {isAdActive && (
                    <div className="absolute inset-0 rounded-xl overflow-hidden bg-black">
                        <video
                            ref={adRef}
                            playsInline
                            className="w-full h-full object-contain"
                            onTimeUpdate={handleAdTimeUpdate}
                            onEnded={endAd}
                            onError={endAd}
                        />
                        <div className="absolute top-3 left-3 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            {adBreak === "midroll" ? "Ad Break" : "Ad"}
                        </div>
                        {skipRemaining !== null && !adCanSkip && (
                            <div className="absolute top-3 right-3 bg-black/70 text-white text-xs px-2 py-1 rounded">
                                Skip in {skipRemaining}s
                            </div>
                        )}
                        {adCanSkip && (
                            <button
                                onClick={endAd}
                                className="absolute top-3 right-3 bg-white/90 text-black text-xs px-3 py-1 rounded"
                            >
                                Skip ad
                            </button>
                        )}
                        {adStatus === "blocked" && (
                            <button
                                onClick={handleAdPlayClick}
                                className="absolute inset-x-0 bottom-6 mx-auto w-fit bg-white text-black px-4 py-2 rounded"
                            >
                                Tap to play ad to continue
                            </button>
                        )}
                        {adStatus === "loading" && (
                            <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
                                Loading ad...
                            </div>
                        )}
                    </div>
                )}
                {(rewardStatus || videoError) && (
                    <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-1 rounded text-sm max-w-[90%]">
                        {videoError || rewardStatus}
                    </div>
                )}
            </div>

            {/* Creator Profile */}
            {creatorProfile && (
                <div className="bg-gray-800/50 p-4 rounded-lg flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <img
                            src={creatorAvatar}
                            alt={creatorName}
                            className="w-12 h-12 rounded-full object-cover"
                        />
                        <div>
                            <h3 className="text-white font-semibold">{creatorName}</h3>
                            <p className="text-gray-400 text-xs">Reward rate: {rewardRate.toFixed(2)} tokens/sec</p>
                        </div>
                    </div>
                    <div className="text-gray-300 text-sm">
                        Subscribers: {subCount}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs text-amber-300 bg-amber-900/40 px-3 py-2 rounded border border-amber-700">
                    {pendingReward > 0 ? `Pending reward for this session: ${pendingReward.toFixed(2)} tokens` : "Start watching to earn tokens"}
                </div>
                <button
                    onClick={handleClaim}
                    disabled={!!claimDisabledReason || claiming}
                    className={`px-3 py-2 rounded text-white text-sm ${!claimDisabledReason ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-700 cursor-not-allowed"}`}
                    title={claimDisabledReason || undefined}
                >
                    {claiming ? "Submitting claim..." : "Claim tokens"}
                </button>
                {claimStatus && (
                    <span className="text-xs text-gray-300">
                        Claim status: {claimStatus}
                        {claimExplorerUrl && claimStatus === "settled" && (
                            <>
                                {" · "}
                                <a className="text-emerald-400 underline" href={claimExplorerUrl} target="_blank" rel="noreferrer">
                                    View tx
                                </a>
                            </>
                        )}
                    </span>
                )}
                {claimDisabledReason && (
                    <span className="text-xs text-gray-300">{claimDisabledReason}</span>
                )}
                <button
                    onClick={handleLike}
                    disabled={likeLoading}
                    className={`flex items-center space-x-2 px-4 py-2 rounded ${liked ? "bg-pink-600/80" : "bg-gray-800 hover:bg-gray-700"}`}
                >
                    <Heart className={`w-5 h-5 ${liked ? "text-white" : "text-pink-500"}`} />
                    <span>{likeLoading ? (liked ? "Unliking..." : "Liking...") : `${liked ? "Unlike" : "Like"} (${likesCount})`}</span>
                </button>
                <button
                    onClick={handleSubscribe}
                    disabled={subLoading}
                    className={`flex items-center space-x-2 px-4 py-2 rounded ${subscribed ? "bg-yellow-600/80" : "bg-gray-800 hover:bg-gray-700"}`}
                >
                    <Bell className={`w-5 h-5 ${subscribed ? "text-white" : "text-yellow-500"}`} />
                    <span>{subLoading ? (subscribed ? "Unsubscribing..." : "Subscribing...") : subscribed ? "Unsubscribe" : "Subscribe"}</span>
                </button>
            </div>

            {/* Comments Section */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold">Comments</h2>
                <div className="flex items-center space-x-2">
                    <input
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Add a comment..."
                        className="flex-1 bg-gray-800 px-4 py-2 rounded"
                    />
                    <button
                        onClick={handleComment}
                        className="bg-purple-600 px-4 py-2 rounded hover:bg-purple-700 text-white"
                    >
                        Post
                    </button>
                </div>
                <div className="space-y-2">
                    {comments.map((c) => (
                        <div key={c.id} className="bg-gray-800 p-3 rounded">
                            <p className="text-sm text-white">{c.text}</p>
                            <p className="text-xs text-gray-400">{c.user}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default VideoPlayer;
