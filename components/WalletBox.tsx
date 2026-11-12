'use client';

import React, { useCallback, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { loadReptile } from '@/lib/reptile';
import GameState from '@/lib/GameState';

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

/** The left box of the HUD: connect, look up the reptile, show its image and
 *  a status line. It only changes the look (gameState.setLook), never stats
 *  or the high score. Rendered only when an RPC endpoint is configured, so
 *  the useWallet hook here always has its provider. */
const WalletBox: React.FC<WalletBoxProps> = ({ gameState }) => {
    const { publicKey } = useWallet();
    const [assetImage, setAssetImage] = useState<string | null>(null);
    const [status, setStatus] = useState<LoadStatus>('idle');

    const handleCheckAssets = useCallback(async () => {
        if (!publicKey) return;
        setStatus('loading');
        // loadReptile never throws: every failure comes back as a status.
        const result = await loadReptile(publicKey.toBase58());
        if (result.status === 'found') {
            gameState.setLook(result.look);
            setAssetImage(result.image);
        } else {
            setAssetImage(null);
        }
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
            {assetImage && <img src={assetImage} alt="Your Entangled Reptile" className="asset-image" />}
        </div>
    );
};

export default WalletBox;
