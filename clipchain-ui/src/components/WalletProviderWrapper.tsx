import React, { useMemo } from 'react';
import { clusterApiUrl } from '@solana/web3.js';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { getRpcUrl, getSolanaNetwork } from '../lib/solanaRpc';

// Import the wallets you want to support
import {
    PhantomWalletAdapter,
    SolflareWalletAdapter,
    // Add other wallets here...
} from '@solana/wallet-adapter-wallets';

// Require the style sheet for the wallet modal
import '@solana/wallet-adapter-react-ui/styles.css';

const WalletProviderWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const network = getSolanaNetwork();
    const endpoint = useMemo(() => getRpcUrl() || clusterApiUrl(network), [network]);

    // Setup the wallets
    const wallets = useMemo(() => {
        const list = [];
        try {
            list.push(new PhantomWalletAdapter());
        } catch (e) {
            console.warn("Phantom adapter init failed", e);
        }
        try {
            list.push(new SolflareWalletAdapter({ network }));
        } catch (e) {
            console.warn("Solflare adapter init failed", e);
        }
        return list;
    }, [network]);

    return (
        // The structure: ConnectionProvider -> WalletProvider -> WalletModalProvider
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    {children}
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

export default WalletProviderWrapper;
