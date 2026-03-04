import { useEffect, useState } from "react";
import { getCreators, Creator } from "../services/firestore";
import { Copy } from "lucide-react";

const FanDashboard = () => {
    const [creators, setCreators] = useState<Creator[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadCreators = async () => {
            try {
                const data = await getCreators();
                setCreators(data);
            } catch (err) {
                setError("Failed to load creators. Please try again.");
            } finally {
                setLoading(false);
            }
        };
        loadCreators();
    }, []);

    const copyWallet = (wallet: string) => {
        navigator.clipboard.writeText(wallet);
        alert("Wallet address copied!");
    };

    return (
        <div className="mt-6">
            <h2 className="text-xl font-semibold mb-4 text-white">Top Creators</h2>

            {loading ? (
                <p className="text-gray-400">Loading creators...</p>
            ) : error ? (
                <p className="text-red-500">{error}</p>
            ) : creators.length === 0 ? (
                <p className="text-gray-400">No creators found yet. Check back later!</p>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {creators.map((creator) => (
                        <div
                            key={creator.id}
                            className="bg-gray-800/80 p-4 rounded-xl text-center hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300"
                        >
                            <img
                                src={creator.avatarUrl || "/profile.png"}
                                alt={creator.username}
                                className="w-16 h-16 rounded-full mx-auto mb-3 border border-gray-700"
                            />
                            <p className="text-white font-semibold">{creator.username}</p>
                            <div className="flex items-center justify-center mt-1 space-x-2 text-gray-400 text-xs">
                                <span>{creator.wallet.slice(0, 6)}...{creator.wallet.slice(-4)}</span>
                                <button
                                    onClick={() => copyWallet(creator.wallet)}
                                    className="hover:text-purple-400"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FanDashboard;
