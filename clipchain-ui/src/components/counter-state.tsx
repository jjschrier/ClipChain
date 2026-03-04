import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { program, counterPDA, CounterData } from "../anchor/setup";

export default function CounterState() {
    const { connection } = useConnection();
    const [counterData, setCounterData] = useState<CounterData | null>(null);

    useEffect(() => {
        const fetchCounterData = async () => {
            try {
                // Fetch initial account data
                const data = await program.account.counter.fetch(counterPDA);
                setCounterData(data);
            } catch (error) {
                console.error("Error fetching counter data:", error);
            }
        };

        fetchCounterData();

        // Subscribe to account change
        const subscriptionId = connection.onAccountChange(
            // The address of the account we want to watch
            counterPDA,
            // Callback for when the account changes
            (accountInfo) => {
                try {
                    const decodedData = program.coder.accounts.decode(
                        "counter",
                        accountInfo.data,
                    );
                    setCounterData(decodedData);
                } catch (error) {
                    console.error("Error decoding account data:", error);
                }
            },
        );

        return () => {
            // Unsubscribe from account change
            connection.removeAccountChangeListener(subscriptionId);
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [program, counterPDA, connection]);

    // Render the value of the counter
    return <p className="text-lg">Count: {counterData?.count?.toString()}</p>;
}