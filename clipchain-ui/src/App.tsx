import React, { Suspense, useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth } from "./firebase/config";
import ErrorBoundary from "./components/ErrorBoundary";
import WalletProviderWrapper from "./components/WalletProviderWrapper";

const AppRoutes = React.lazy(() => import("./AppRoutes"));
const AuthDebug = React.lazy(() => import("./components/AuthDebug"));

const DEBUG = (import.meta.env as any).VITE_DEBUG === "true";

function DebugShell({ onReload }: { onReload: () => void }) {
    return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
            <div className="max-w-xl w-full p-8 bg-gray-800/60 rounded-xl border border-gray-700">
                <h1 className="text-2xl font-bold mb-4">ClipChain — Debug</h1>
                <p className="text-gray-300 mb-4">
                    This is a debug shell. Toggle VITE_DEBUG to exit debug mode and load the real app.
                </p>
                <div className="space-y-3">
                    <p className="text-green-400">✅ React mounted successfully</p>
                    <button onClick={onReload} className="px-4 py-2 bg-purple-600 rounded-md text-white">
                        Reload App
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function App() {
    const [authReady, setAuthReady] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.debug("Firebase auth ready — uid:", user.uid, "anonymous:", user.isAnonymous);
                setAuthReady(true);
            } else {
                try {
                    await signInAnonymously(auth);
                } catch (err) {
                    console.error("Failed to sign in anonymously:", err);
                }
            }
        });

        return () => unsubscribe();
    }, []);

    if (DEBUG) {
        return <DebugShell onReload={() => window.location.reload()} />;
    }

    if (!authReady) {
        return (
            <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
                <p className="text-gray-400">Authenticating…</p>
            </div>
        );
    }

    return (
        <ErrorBoundary>
            <WalletProviderWrapper>
                <Suspense fallback={<div className="min-h-screen bg-gray-900 text-gray-200 flex items-center justify-center">Loading ClipChain…</div>}>
                    <AppRoutes />
                </Suspense>
                <Suspense fallback={null}>
                    <AuthDebug />
                </Suspense>
            </WalletProviderWrapper>
        </ErrorBoundary>
    );
}
