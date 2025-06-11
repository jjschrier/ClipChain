import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';

const CREATOR_TOKEN_MINT = new PublicKey('PASTE_YOUR_MINT_ADDRESS_HERE');

export const getUserTokenBalance = async (walletAddress: PublicKey, connection: Connection) => {
    const tokenAccounts = await connection.getTokenAccountsByOwner(walletAddress, {
        mint: CREATOR_TOKEN_MINT,
    });

    if (tokenAccounts.value.length === 0) return 0;

    const accountData = tokenAccounts.value[0].account.data;
    const parsed = accountData.parsed ?? JSON.parse(accountData.toString());
    const balance = parsed?.info?.tokenAmount?.uiAmount;

    return balance || 0;
};

export const getTotalSupply = async (connection: Connection) => {
    const mintInfo = await getMint(connection, CREATOR_TOKEN_MINT);
    return Number(mintInfo.supply) / (10 ** mintInfo.decimals);
};
