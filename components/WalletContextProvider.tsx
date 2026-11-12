'use client';

import { FC, ReactNode, useMemo } from "react";
import {
    ConnectionProvider,
    WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { rpcUrl } from "@/lib/reptile";

const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    // The RPC host comes from NEXT_PUBLIC_RPC_URL; with no usable https://
    // URL configured there is no endpoint to talk to, so the game renders
    // plain children and the HUD leaves the wallet box out entirely.
    const endpoint = rpcUrl();
    // Phantom and Solflare register themselves through the Wallet Standard,
    // so no explicit wallet adapters are needed here.
    const wallets = useMemo(() => [], []);

    if (endpoint === null) {
        return <>{children}</>;
    }

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect={true}>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

export default WalletContextProvider;
