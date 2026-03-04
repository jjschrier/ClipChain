import React from 'react';
import { Home, Video, Upload, DollarSign, Settings, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
    const location = useLocation();
    const activePath = location.pathname;

    const menuItems = [
        { path: '/', label: 'Home', icon: Home },
        { path: '/videos', label: 'My Videos', icon: Video },
        { path: '/upload', label: 'Upload', icon: Upload },
        { path: '/earnings', label: 'Earnings', icon: DollarSign },
        { path: '/settings', label: 'Settings', icon: Settings },
    ];

    return (
        <>
            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div
                className={`fixed left-0 top-0 h-full bg-gray-900/95 backdrop-blur-xl border-r border-gray-800 z-50 transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    } lg:translate-x-0 lg:static lg:z-auto w-64`}
            >
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="p-6 border-b border-gray-800 flex justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-lg flex items-center justify-center">
                                <Video className="w-5 h-5 text-white" />
                            </div>
                            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                                ClipChain
                            </h1>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="lg:hidden text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-4">
                        <ul className="space-y-2">
                            {menuItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = activePath === item.path;
                                return (
                                    <li key={item.path}>
                                        <Link
                                            to={item.path}
                                            onClick={() => setIsOpen(false)}
                                            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                                                    ? 'bg-gradient-to-r from-purple-500/20 to-cyan-500/20 text-white border border-purple-500/30'
                                                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                                                }`}
                                        >
                                            <Icon
                                                className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'
                                                    }`}
                                            />
                                            <span className="font-medium">{item.label}</span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>

                    {/* Footer */}
                    <div className="p-4 border-t border-gray-800">
                        <div className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10 rounded-xl p-4 border border-purple-500/20">
                            <h3 className="text-sm font-semibold text-white mb-1">Creator Pro</h3>
                            <p className="text-xs text-gray-400 mb-3">Unlock advanced analytics</p>
                            <button className="w-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white text-sm font-medium py-2 rounded-lg hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-200">
                                Upgrade
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Sidebar;
