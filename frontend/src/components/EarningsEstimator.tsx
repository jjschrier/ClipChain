import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { getUserTokenBalance, getTotalSupply } from '../utils/solana';

const EarningsEstimator = () => {
    const { connection } = useConnection();
    const { publicKey } = useWallet();

    const [userShare, setUserShare] = useState<number | null>(null);
    const [estimatedEarnings, setEstimatedEarnings] = useState<number | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!publicKey) return;

            const userBalance = await getUserTokenBalance(publicKey, connection);
            const totalSupply = await getTotalSupply(connection);

            const share = userBalance / totalSupply;
            const mockPool = 1.0; // 1 SOL pool
            const earnings = share * mockPool;

            setUserShare(share);
            setEstimatedEarnings(earnings);
        };

        fetchData();
    }, [publicKey, connection]);

    return (
        <div>
            {userShare !== null && estimatedEarnings !== null ? (
                <div>
                    <p>You own {(userShare * 100).toFixed(2)}% of the supply</p>
                    <p>Estimated earnings: {estimatedEarnings.toFixed(4)} SOL</p>
                </div>
            ) : (
                <p>Connect wallet to view earnings.</p>
            )}
        </div>
    );
};

export default EarningsEstimator;
