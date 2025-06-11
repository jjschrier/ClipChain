
import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { getUserTokenBalance, getTotalSupply } from '../utils/solana';

const CreatorTokenStats = () => {
    const { connection } = useConnection();
    const { publicKey } = useWallet();

    const [userBalance, setUserBalance] = useState<number | null>(null);
    const [userShare, setUserShare] = useState<number | null>(null);
    const [estimatedEarnings, setEstimatedEarnings] = useState<number | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            if (!publicKey) return;

            const balance = await getUserTokenBalance(publicKey, connection);
            const total = await getTotalSupply(connection);

            const share = balance / total;
            const mockPool = 1.0; // Replace with real value if needed
            const earnings = share * mockPool;

            setUserBalance(balance);
            setUserShare(share);
            setEstimatedEarnings(earnings);
        };

        fetchStats();
    }, [publicKey, connection]);

    if (!publicKey) return <p>Please connect your wallet.</p>;
    if (userBalance === null || userShare === null || estimatedEarnings === null) return <p>Loading...</p>;

    return (
        <div>
            <h2>Your Creator Token Stats</h2>
            <p>Balance: {userBalance} tokens</p>
            <p>You own {(userShare * 100).toFixed(2)}% of the total supply</p>
            <p>Estimated Revenue Share: {estimatedEarnings.toFixed(4)} SOL</p>
        </div>
    );
};

export default CreatorTokenStats;
