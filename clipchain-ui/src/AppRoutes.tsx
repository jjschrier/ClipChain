import { FC, useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Routes, Route, Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { doc, onSnapshot, collection } from "firebase/firestore";

import UploadVideo from "./components/UploadVideo";
import VideoGrid from "./components/VideoGrid";
import UploadAvatar from "./components/UploadAvatar";
import CreatorDashboard from "./components/CreatorDashboard";
import FanDashboard from "./components/FanDashboard";
import VideoPlayer from "./components/VideoPlayer";

import { getAvatar, ensureUserDoc } from "./lib/userService";
import { db } from "./firebase/config";

export interface Video {
    id: string;
    title: string;
    videoUrl: string;
    thumbnailUrl?: string;
    tokenMint: string;
    creator: string;
    createdAt: any;
}

const AppRoutes: FC = () => {
    const { publicKey } = useWallet();
    const [videos, setVideos] = useState<Video[]>([]);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [displayName, setDisplayName] = useState<string | null>(null);
    const [showAvatarUpload, setShowAvatarUpload] = useState(false);
    const [navOpen, setNavOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsub: (() => void) | undefined;
        (async () => {
            try {
                await ensureUserDoc();
                unsub = onSnapshot(
                    collection(db, "videos"),
                    (snap) => {
                        const vids = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Video[];
                        setVideos(vids);
                        setLoading(false);
                    },
                    (err) => {
                        console.error("❌ Error fetching videos:", err);
                        setLoading(false);
                    }
                );
            } catch (error) {
                console.error("❌ Error initializing video listener:", error);
                setLoading(false);
            }
        })();
        return () => unsub?.();
    }, []);

    // Load saved avatar on mount
    useEffect(() => {
        (async () => {
            try {
                const url = await getAvatar();
                if (url) setAvatarUrl(url);
            } catch (err) {
                console.warn("Failed to load avatar", err);
            }
        })();
    }, []);

    // Live creator profile (avatar/display name) from the creator doc tied to the wallet
    useEffect(() => {
        if (!publicKey) {
            setAvatarUrl(null);
            setDisplayName(null);
            return;
        }
        const creatorRef = doc(db, "creators", publicKey.toBase58());
        const unsub = onSnapshot(creatorRef, (snap) => {
            const data = snap.data() as any;
            if (data?.avatarUrl) setAvatarUrl(data.avatarUrl);
            if (data?.displayName) setDisplayName(data.displayName);
        });
        return () => unsub();
    }, [publicKey]);

    return (
        <div className="min-h-screen bg-[#0f0f0f] text-white">
            {/* ✅ Navigation Bar */}
            <nav className="bg-[#121212] px-4 sm:px-6 py-4 flex items-center justify-between border-b border-gray-800 shadow-sm sticky top-0 z-40">
                <div className="flex items-center space-x-3 sm:space-x-6">
                    {/* Logo */}
                    <Link to="/" className="flex items-center">
                        <img
                            src="/ClipChain.png"
                            alt="ClipChain Logo"
                            className="h-16 w-auto object-contain"
                        />
                    </Link>

                    {/* Navigation Links */}
                    <div className="hidden md:flex items-center space-x-4">
                        <Link
                            to="/"
                            className="text-white text-sm sm:text-base font-medium hover:text-gray-300 transition"
                        >
                            Explore
                        </Link>
                        <Link
                            to="/creator"
                            className="text-white text-sm sm:text-base font-medium hover:text-gray-300 transition"
                        >
                            Creator Dashboard
                        </Link>
                        <Link
                            to="/upload"
                            className="text-white text-sm sm:text-base font-medium hover:text-gray-300 transition"
                        >
                            Upload
                        </Link>
                    </div>
                </div>

                {/* Wallet + Avatar */}
                <div className="flex items-center space-x-3">
                    <button
                        className="md:hidden text-white bg-gray-800 rounded-lg px-3 py-2 border border-gray-700"
                        onClick={() => setNavOpen((o) => !o)}
                        aria-label="Toggle navigation"
                    >
                        ☰
                    </button>
                    <div className="hidden sm:block">
                        <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 text-white rounded-full px-4 py-2 text-sm" />
                    </div>
                    <div className="relative">
                        <img
                            src={avatarUrl || "/profile.png"}
                            alt="Profile"
                            className="h-10 w-10 rounded-full border border-gray-600 cursor-pointer"
                            onClick={() => setShowAvatarUpload(!showAvatarUpload)}
                        />
                        {displayName && (
                            <p className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-gray-300 whitespace-nowrap">
                                {displayName}
                            </p>
                        )}
                        {showAvatarUpload && (
                            <div className="absolute right-0 mt-2 z-50 bg-[#1f1f1f] p-4 rounded shadow-xl">
                                <UploadAvatar
                                    onComplete={(url) => {
                                        setAvatarUrl(url);
                                        setShowAvatarUpload(false);
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </nav>

            {/* Mobile dropdown nav */}
            {navOpen && (
                <div className="md:hidden bg-[#1a1a1a] border-b border-gray-800 px-4 py-3 space-y-3">
                    <div className="flex flex-col space-y-2">
                        <Link
                            to="/"
                            className="text-white text-sm font-medium hover:text-gray-300 transition"
                            onClick={() => setNavOpen(false)}
                        >
                            Explore
                        </Link>
                        <Link
                            to="/creator"
                            className="text-white text-sm font-medium hover:text-gray-300 transition"
                            onClick={() => setNavOpen(false)}
                        >
                            Creator Dashboard
                        </Link>
                        <Link
                            to="/upload"
                            className="text-white text-sm font-medium hover:text-gray-300 transition"
                            onClick={() => setNavOpen(false)}
                        >
                            Upload
                        </Link>
                        <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 text-white rounded-full px-4 py-2 text-sm w-full justify-center" />
                    </div>
                </div>
            )}

            {/* ✅ Main Routes */}
            <main className="p-6 pt-4">
                <Routes>
                    <Route
                        path="/"
                        element={
                            <>
                                {loading ? (
                                    <div className="text-center text-gray-400 mt-16 text-lg">
                                        Loading videos...
                                    </div>
                                ) : videos.length > 0 ? (
                                    <VideoGrid videos={videos} />
                                ) : (
                                    <div className="text-center text-gray-400 mt-16 text-lg">
                                        No videos yet. Upload one to get started!
                                    </div>
                                )}
                                <FanDashboard />
                            </>
                        }
                    />
                    <Route
                        path="/creator"
                        element={<CreatorDashboard />}
                    />
                    <Route
                        path="/upload"
                        element={
                            <UploadVideo
                                onUpload={(video) =>
                                    setVideos((prev) => [video, ...prev])
                                }
                            />
                        }
                    />
                    <Route
                        path="/watch/:videoId"
                        element={<VideoPlayer />}
                    />
                </Routes>
            </main>
        </div>
    );
};

export default AppRoutes;
