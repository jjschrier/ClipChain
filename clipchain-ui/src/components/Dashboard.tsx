import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import VideoCard from './VideoCard';
import { useNavigate } from 'react-router-dom';
import { getVideos, getStats } from '../services/firestore'; // Firestore service

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const [videos, setVideos] = useState<any[]>([]);
    const [stats, setStats] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [videoData, statData] = await Promise.all([
                    getVideos().catch((e) => {
                        console.warn("getVideos failed", e);
                        return [];
                    }),
                    getStats().catch((e) => {
                        console.warn("getStats failed", e);
                        return [];
                    }),
                ]);
                setVideos(videoData || []);
                setStats(statData || []);
            } catch (err) {
                console.error("Error loading dashboard:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    return (
        <div className="p-4 lg:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                        Creator Dashboard
                    </h1>
                    <p className="text-gray-400">
                        Manage your content and track your Web3 earnings
                    </p>
                </div>
                <button
                    onClick={() => navigate('/upload')}
                    className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white px-6 py-3 rounded-xl font-medium flex items-center space-x-2 hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-200"
                >
                    <Plus className="w-5 h-5" />
                    <span>Upload Video</span>
                </button>
            </div>

            {/* Stats Section */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-24 bg-gray-700/50 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : stats.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                    {stats.map((stat, index) => {
                        const Icon = stat.icon;
                        return (
                            <div
                                key={index}
                                className="bg-gray-800/30 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50 hover:border-purple-500/30 transition-all duration-300"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    {Icon && <Icon className={`w-6 h-6 ${stat.color}`} />}
                                    <span className={`text-sm font-medium ${stat.color}`}>
                                        {stat.change}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-1">{stat.value}</h3>
                                <p className="text-gray-400 text-sm">{stat.label}</p>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="text-gray-400">No stats available.</p>
            )}

            {/* Videos Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white">Recent Videos</h2>
                    <button className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors">
                        View All
                    </button>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-48 bg-gray-700/50 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : videos.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {videos.map((video) => (
                            <VideoCard key={video.id} video={video} />
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-400">No videos uploaded yet.</p>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
