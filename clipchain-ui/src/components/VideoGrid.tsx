import React, { useEffect, useState } from "react";
import VideoCard, { Video } from "./VideoCard";
import type { Timestamp } from "firebase/firestore";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import { ensureUserDoc } from "../lib/userService";

interface FirestoreVideo {
    id: string;
    title?: string;
    thumbnailUrl?: string;
    creator?: string;
    creatorDisplayName?: string;
    creatorAvatar?: string;
    tokenMint?: string;
    createdAt?: Timestamp | null; // Firestore Timestamp or undefined
}

interface VideoGridProps {
    videos: FirestoreVideo[] | undefined;
    loading?: boolean;
}

const VideoGrid: React.FC<VideoGridProps> = ({ videos, loading }) => {
    const [creatorMap, setCreatorMap] = useState<Record<string, { displayName?: string; avatarUrl?: string }>>({});

    useEffect(() => {
        // Fetch creators once to display the latest display name/avatar even if video doc is stale
        (async () => {
            try {
                await ensureUserDoc();
                const snap = await getDocs(collection(db, "creators"));
                const map: Record<string, { displayName?: string; avatarUrl?: string }> = {};
                snap.forEach((doc) => {
                    const data = doc.data() as any;
                    map[doc.id] = { displayName: data.displayName, avatarUrl: data.avatarUrl };
                });
                setCreatorMap(map);
            } catch (e) {
                console.warn("VideoGrid: failed to fetch creators", e);
            }
        })();
    }, []);

    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                    <VideoCard key={`sk-${i}`} video={{ id: "", title: "" } as Video} loading />
                ))}
            </div>
        );
    }

    if (!videos || videos.length === 0) {
        return <p className="text-gray-400 text-center mt-6">No videos available yet.</p>;
    }

    // Safely normalize Firestore timestamps → Date
    const toDate = (ts?: Timestamp | null): Date | null => {
        try {
            return ts?.toDate ? ts.toDate() : null;
        } catch {
            return null;
        }
    };

    const sorted = [...videos].sort((a, b) => {
        const aDate = toDate(a.createdAt)?.getTime() ?? 0;
        const bDate = toDate(b.createdAt)?.getTime() ?? 0;
        return bDate - aDate;
    });

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {sorted.map((v) => {
                const created = toDate(v.createdAt);
                const isNew = created ? now - created.getTime() < sevenDaysMs : false;

                const card: Video = {
                    id: v.id,
                    title: v.title || "Untitled Video",
                    thumbnailUrl: v.thumbnailUrl || "/default-thumbnail.png",
                    creatorName: creatorMap[v.creator || ""]?.displayName || v.creatorDisplayName,
                    creatorAvatar: creatorMap[v.creator || ""]?.avatarUrl || v.creatorAvatar,
                    views: typeof (v as any).views === "number" ? (v as any).views : 0,
                    duration: "N/A",         // placeholder if you don’t store it
                    uploadDate: created ? created.toLocaleDateString() : "Unknown",
                    earnings: "0.00 SOL",    // placeholder
                    isNew,
                };

                return <VideoCard key={v.id} video={card} />;
            })}
        </div>
    );
};

export default VideoGrid;
