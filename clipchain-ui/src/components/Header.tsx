import React, { Suspense, useEffect, useMemo, useState } from "react";
import ErrorBoundary from "./ErrorBoundary";
import { Menu, Bell, Search, ChevronDown } from 'lucide-react';
import { useWallet } from "@solana/wallet-adapter-react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

// Lazy-load the wallet connect UI so extension code runs only when needed
const ConnectWalletButton = React.lazy(() => import("../components/ConnectWalletButton"));

interface HeaderProps {
    setSidebarOpen: (open: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({ setSidebarOpen }) => {
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const { publicKey } = useWallet();
    const [displayName, setDisplayName] = useState<string | null>(null);

    useEffect(() => {
        if (!publicKey) {
            setDisplayName(null);
            return;
        }

        const creatorRef = doc(db, "creators", publicKey.toBase58());
        const unsub = onSnapshot(creatorRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data() as any;
                setDisplayName(data.displayName || null);
            } else {
                setDisplayName(null);
            }
        }, (e) => {
            console.warn("Header: failed to load display name", e);
        });

        return () => unsub();
    }, [publicKey]);

    const initials = useMemo(() => {
        if (displayName) {
            return displayName
                .split(" ")
                .map((s) => s.charAt(0).toUpperCase())
                .join("")
                .slice(0, 2) || "?";
        }
        if (publicKey) return publicKey.toBase58().slice(0, 2).toUpperCase();
        return "?";
    }, [displayName, publicKey]);

    return (
        <header className="bg-gray-900/80 backdrop-blur-xl border-b border-gray-800 sticky top-0 z-30">
            <div className="flex items-center justify-between h-16 px-4 lg:px-6">
                {/* Left Section */}
                <div className="flex items-center space-x-4">
                    {/* Sidebar Toggle for Mobile */}
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="lg:hidden text-gray-400 hover:text-white transition-colors p-2"
                    >
                        <Menu className="w-6 h-6" />
                    </button>

                    {/* Search - Desktop */}
                    <div className="hidden md:flex relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search videos..."
                            className="bg-gray-800/50 border border-gray-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 w-64 transition-all duration-200"
                        />
                    </div>
                </div>

                {/* Right Section */}
                <div className="flex items-center space-x-4">
                    {/* Search Icon - Mobile */}
                    <button className="md:hidden text-gray-400 hover:text-white p-2">
                        <Search className="w-5 h-5" />
                    </button>

                    {/* Notifications */}
                    <button className="relative text-gray-400 hover:text-white transition-colors p-2">
                        <Bell className="w-5 h-5" />
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                            3
                        </span>
                    </button>

                    {/* Wallet Connect */}
                    <div className="hidden sm:block">
                        <ErrorBoundary>
                            <Suspense fallback={<button className="px-3 py-1 rounded bg-gray-700 text-white">Connect</button>}>
                                <ConnectWalletButton />
                            </Suspense>
                        </ErrorBoundary>
                    </div>

                    {/* Profile Dropdown */}
                    <div className="relative">
                        <button
                            className="flex items-center space-x-3 p-1 rounded-xl hover:bg-gray-800/50 transition-colors"
                            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                        >
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-sm font-semibold">{initials}</span>
                            </div>
                            <div className="text-left hidden sm:block">
                                <div className="text-sm text-white leading-none">{displayName || "Wallet"}</div>
                                <div className="text-[11px] text-gray-400 leading-none">
                                    {publicKey ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}` : "Disconnected"}
                                </div>
                            </div>
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                        </button>

                        {profileMenuOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                                <a
                                    href="/dashboard"
                                    className="block px-4 py-2 text-gray-200 hover:bg-gray-700"
                                >
                                    Dashboard
                                </a>
                                <a
                                    href="/settings"
                                    className="block px-4 py-2 text-gray-200 hover:bg-gray-700"
                                >
                                    Settings
                                </a>
                                <button
                                    onClick={() => alert('Log out')}
                                    className="w-full text-left px-4 py-2 text-red-400 hover:bg-gray-700"
                                >
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
