'use client';

import React, { useCallback, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { loadReptile } from '@/lib/reptile';
import GameState from '@/lib/GameState';
import WalletContextProvider from './WalletContextProvider';

interface WalletBoxProps {
    gameState: GameState;
}

type LoadStatus = 'idle' | 'loading' | 'found' | 'none' | 'error';

/** One short line under the button so a failure tells the player something
 *  instead of dying silently in an unawaited promise. */
const STATUS_TEXT: Record<Exclude<LoadStatus, 'idle' | 'found'>, string> = {
    loading: 'Loading...',
    none: 'No Entangled Reptile in this wallet',
    error: 'Could not reach the network',
};

/** The wallet box of the HUD: connect, look up the reptile and show a status
 *  line. It only changes the look (gameState.setLook), never stats or the high
 *  score; the look then feeds the HUD's own PFP portrait (components/Hud.tsx),
 *  which is built locally from the loadout, never from the NFT's image address.
 *  Rendered only when an RPC endpoint is configured, so the useWallet hook
 *  here always has its provider.
 *
 *  The wallet code lives behind components/WalletGate.tsx (next/dynamic,
 *  ssr: false): this file brings its own provider — and with it the wallet
 *  CSS the provider imports — so nothing from @solana/* is on the page
 *  before the Wallet button is clicked. The connect button and the reptile
 *  loader sit in the inner component, under the provider, so their hooks
 *  see the live wallet context. */
const WalletBox: React.FC<WalletBoxProps> = ({ gameState }) => (
    <WalletContextProvider>
        <WalletBoxContent gameState={gameState} />
    </WalletContextProvider>
);

/** The box as it was before the lazy split, unchanged: it only ever renders
 *  as a child of WalletContextProvider, so useWallet has its context. */
const WalletBoxContent: React.FC<WalletBoxProps> = ({ gameState }) => {
    const { publicKey } = useWallet();
    const [status, setStatus] = useState<LoadStatus>('idle');

    const handleCheckAssets = useCallback(async () => {
        if (!publicKey) return;
        setStatus('loading');
        // loadReptile never throws: every failure comes back as a status.
        const result = await loadReptile(publicKey.toBase58());
        // The loaded look goes straight to the shell; the HUD portrait follows.
        if (result.status === 'found') gameState.setLook(result.look);
        setStatus(result.status);
    }, [publicKey, gameState]);

    return (
        <div className="left-box">
            <WalletMultiButton />
            {publicKey && (
                <button className="wallet-actions" onClick={handleCheckAssets} disabled={status === 'loading'}>
                    🔍 Assets
                </button>
            )}
            {status !== 'idle' && status !== 'found' && (
                <div className="wallet-status">{STATUS_TEXT[status]}</div>
            )}
        </div>
    );
};

export default WalletBox;
