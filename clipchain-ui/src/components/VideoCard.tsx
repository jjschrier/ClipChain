import React from "react";
import { Play, Eye, Clock, MoreVertical, Heart } from "lucide-react";
import { Link } from "react-router-dom";

// Helper function for formatting views (e.g., 12500 -> 12.5K)
const formatViews = (views: number | null | undefined): string => {
    if (!views || !Number.isFinite(views) || views < 0) {
        return "0";
    }
    if (views >= 1000000) {
        return (views / 1000000).toFixed(1) + 'M';
    }
    if (views >= 1000) {
        return (views / 1000).toFixed(1) + 'K';
    }
    return views.toLocaleString();
};

export interface Video {
    id: string;
    title: string;
    thumbnailUrl?: string;
    creatorName?: string;
    creatorAvatar?: string;
    views?: number | null;
    likes?: number | null;
    duration?: string | null;
    uploadDate?: string | null;
    earnings?: string | null;
    isNew?: boolean;
    isTrending?: boolean;
    onClick?: () => void; // optional if you want to handle navigation yourself
}

// Define the union type for wrapper props to eliminate 'as any'
type LinkProps = React.ComponentPropsWithoutRef<typeof Link>;
type ButtonProps = React.ComponentPropsWithoutRef<'button'>;
type WrapperProps = LinkProps | ButtonProps;

const VideoCard: React.FC<{ video: Video; loading?: boolean }> = React.memo(
    ({ video, loading }) => {
        if (loading) {
            // ... (loading skeleton remains the same)
            return (
                <div className="bg-gray-800/30 rounded-2xl overflow-hidden border border-gray-700/50 animate-pulse">
                    <div className="aspect-video bg-gray-700" />
                    <div className="p-4 space-y-3">
                        <div className="h-4 bg-gray-600 rounded w-3/4" />
                        <div className="flex space-x-3">
                            <div className="h-3 bg-gray-600 rounded w-1/4" />
                            <div className="h-3 bg-gray-600 rounded w-1/4" />
                        </div>
                    </div>
                </div>
            );
        }

        // Determine the wrapper component and its props safely
        const Wrapper = (video.onClick ? "button" : Link) as React.ElementType;

        const wrapperProps = video.onClick
            ? ({ onClick: video.onClick, type: "button" } as ButtonProps)
            : ({ to: `/watch/${video.id}` } as LinkProps);

        const thumb = video.thumbnailUrl || "/default-thumbnail.png";
        const title = video.title || "Untitled";
        const creatorAvatar = video.creatorAvatar || "/default-avatar.png";
        const creatorName = video.creatorName || "Creator";

        return (
            <Wrapper
                aria-label={`Watch ${title}`}
                className="group bg-gray-800/30 backdrop-blur-sm rounded-2xl overflow-hidden border border-gray-700/50 hover:border-purple-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10 text-left"
                {...(wrapperProps as WrapperProps)} // Safely cast to the union type
            >
                {/* Thumbnail */}
                <div className="relative aspect-video overflow-hidden">
                    <img
                        loading="lazy"
                        src={thumb}
                        alt={`${title} thumbnail`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = "/default-thumbnail.png";
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                    {/* Play overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <span className="bg-white/20 backdrop-blur-sm rounded-full p-3 group-hover:bg-white/30 transition-colors">
                            <Play className="w-6 h-6 text-white fill-white" />
                        </span>
                    </div>

                    {/* Duration */}
                    {video.duration ? (
                        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded-md flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{video.duration}</span>
                        </div>
                    ) : null}

                    {/* Action button */}
                    <button
                        aria-label="Video options"
                        className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/70"
                        onClick={(e) => {
                            e.stopPropagation();
                            // open menu here
                        }}
                    >
                        <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Badges */}
                    {(video.isNew || video.isTrending) && (
                        <div className="absolute top-2 left-2 flex space-x-2">
                            {video.isNew && (
                                <span className="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded">
                                    NEW
                                </span>
                            )}
                            {video.isTrending && (
                                <span className="bg-red-500 text-white text-xs font-semibold px-2 py-1 rounded">
                                    TRENDING
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="p-3 sm:p-4">
                    <h3 className="text-white font-semibold mb-2 line-clamp-2 group-hover:text-purple-300 transition-colors">
                        {title}
                    </h3>

                    <div className="flex items-center justify-between text-sm text-gray-400">
                        <div className="flex items-center space-x-2">
                            <img
                                src={creatorAvatar}
                                alt={creatorName}
                                className="w-7 h-7 rounded-full object-cover border border-gray-700"
                                onError={(e) => { (e.target as HTMLImageElement).src = "/default-avatar.png"; }}
                            />
                            <span className="text-white text-xs sm:text-sm">{creatorName}</span>
                        </div>
                        <div className="flex items-center space-x-4">
                            {typeof video.views === "number" && (
                                <div className="flex items-center space-x-1">
                                    <Eye className="w-4 h-4" />
                                    {/* ✅ Using the centralized formatViews helper */}
                                    <span>{formatViews(video.views)}</span>
                                </div>
                            )}
                            {typeof video.likes === "number" && (
                                <div className="flex items-center space-x-1">
                                    <Heart className="w-4 h-4" />
                                    <span>{formatViews(video.likes)}</span>
                                </div>
                            )}
                            {video.uploadDate && <span>{video.uploadDate}</span>}
                        </div>
                        {video.earnings && (
                            <div className="text-green-400 font-semibold">{video.earnings}</div>
                        )}
                    </div>
                </div>
            </Wrapper>
        );
    }
);

export default VideoCard;
