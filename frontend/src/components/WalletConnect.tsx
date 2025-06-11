import {
    ConnectionProvider,
    WalletProvider
} from '@solana/wallet-adapter-react';
import {
    PhantomWalletAdapter
} from '@solana/wallet-adapter-wallets';
import {
    WalletModalProvider,
    WalletMultiButton
} from '@solana/wallet-adapter-react-ui';

const endpoint = "https://api.devnet.solana.com";
const wallets = [new PhantomWalletAdapter()];

export const WalletConnect = ({ children }: { children: React.ReactNode }) => (
    <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
    </ConnectionProvider>
);
