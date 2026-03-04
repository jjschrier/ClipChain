import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { db } from "../firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { airdropFanToken } from "../lib/airdropFanToken";
import { getRpcUrl } from "../lib/solanaRpc";
import { toast } from "react-hot-toast";

const SubscribeButton = ({ mintAddress }: { mintAddress: string }) => {
    const wallet = useWallet();
    const [subscribed, setSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);

    const connection = new Connection(getRpcUrl());

    const fan = wallet.publicKey?.toBase58();
    const subDocId = fan && mintAddress ? `${fan}_${mintAddress}` : null;

    useEffect(() => {
        const checkSubscribed = async () => {
            if (!subDocId) return;
            try {
                const docRef = doc(db, "subscriptions", subDocId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setSubscribed(true);
                }
            } catch (error) {
                console.error("Error checking subscription:", error);
            }
        };
        checkSubscribed();
    }, [subDocId]);

    const handleSubscribe = async () => {
        if (!wallet.publicKey || !wallet.signTransaction) {
            toast.error("Connect your wallet first.");
            return;
        }
        if (!mintAddress) {
            toast.error("Token mint address missing.");
            return;
        }

        try {
            setLoading(true);
            toast.loading("Processing subscription...");

            await airdropFanToken({
                connection,
                mint: new PublicKey(mintAddress),
                fanPublicKey: wallet.publicKey,
                creatorWallet: wallet
            });

            await setDoc(doc(db, "subscriptions", subDocId!), {
                fan,
                tokenMint: mintAddress,
                timestamp: new Date()
            });

            setSubscribed(true);
            toast.dismiss();
            toast.success("🎉 Subscribed successfully!");
        } catch (err) {
            console.error("Subscription error:", err);
            toast.dismiss();
            toast.error("Subscription failed. Try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleSubscribe}
            disabled={subscribed || loading}
            className={`text-white px-3 py-1 rounded text-sm transition ${subscribed ? "bg-gray-500 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"
                }`}
        >
            {subscribed ? "Subscribed" : loading ? "Subscribing..." : "Subscribe"}
        </button>
    );
};

export default SubscribeButton;
