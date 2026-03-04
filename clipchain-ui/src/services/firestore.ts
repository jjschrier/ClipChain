import { db } from "../firebase/config";
import { collection, getDocs } from "firebase/firestore";
import { Video as VideoIcon, Users as UsersIcon, DollarSign as DollarSignIcon, TrendingUp as TrendingUpIcon } from "lucide-react";
import { ensureUserDoc } from "../lib/userService";

export interface Creator {
    id: string;
    wallet: string;
    username: string;
    role: "creator" | "fan";
    avatarUrl?: string;
}

export interface Video {
    id: string;
    title: string;
    videoUrl: string;
    thumbnailUrl: string;
    tokenMint: string;
    creator: string;
    creatorDisplayName?: string;
    creatorAvatar?: string;
    createdAt: any;
}

// Fetch all videos — wait for auth, return [] on error
export async function fetchVideos(): Promise<Video[]> {
    try {
        await ensureUserDoc();
        const snapshot = await getDocs(collection(db, "videos"));
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<Video, "id">),
        }));
    } catch (e) {
        console.error("Error fetching videos:", e);
        return [];
    }
}

// Explicit named export for bundlers
export async function getVideos(): Promise<Video[]> {
    return fetchVideos();
}

// Fetch all creators with defaults — wait for auth, return [] on error
export async function getCreators(): Promise<Creator[]> {
    try {
        await ensureUserDoc();
        const snapshot = await getDocs(collection(db, "creators"));
        return snapshot.docs.map((doc) => {
            const data = doc.data() as any;
            return {
                id: doc.id,
                wallet: data.wallet || doc.id,
                username: data.displayName || data.username || "Unnamed",
                role: (data.role as "creator" | "fan") || "creator",
                avatarUrl: data.avatarUrl || "/profile.png"
            };
        });
    } catch (e) {
        console.error("Error fetching creators:", e);
        return [];
    }
}

/**
 * Return dashboard stat cards.
 * - Uses counts from fetchVideos/getCreators.
 * - Safe if those return [].
 */
export async function getStats() {
    const [videos, creators] = await Promise.all([fetchVideos(), getCreators()]);

    const videoCount = videos?.length ?? 0;
    const creatorsCount = creators?.length ?? 0;

    return [
        {
            icon: VideoIcon,
            color: "text-purple-400",
            change: `+${Math.max(0, Math.round((videoCount / Math.max(1, videoCount - 5)) * 100 - 100))}%`,
            value: `${videoCount}`,
            label: "Total Videos",
        },
        {
            icon: UsersIcon,
            color: "text-cyan-400",
            change: `+${Math.floor(Math.max(0, creatorsCount * 0.03))}%`,
            value: `${creatorsCount}`,
            label: "Creators",
        },
        {
            icon: DollarSignIcon,
            color: "text-green-400",
            change: "+3.2%",
            value: "12.8 SOL",
            label: "Total Earned",
        },
        {
            icon: TrendingUpIcon,
            color: "text-blue-400",
            change: "+0.8%",
            value: "Up",
            label: "Momentum",
        },
    ];
}
