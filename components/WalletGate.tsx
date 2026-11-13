'use client';

import dynamic from 'next/dynamic';
import React, { useState } from 'react';
import GameState from '@/lib/GameState';

interface WalletGateProps {
    gameState: GameState;
}

/** The wallet box on demand: the page itself carries no wallet code. The
 *  click pulls in the chunk with the provider, the wallet CSS, the connect
 *  button and the reptile loader (next/dynamic with ssr: false — the wallet
 *  only ever runs in the browser). While that chunk is in flight the button
 *  reads "Loading...". */
const WalletPanel = dynamic(() => import('./WalletBox'), {
    ssr: false,
    loading: () => (
        <div className="left-box">
            <button type="button" className="me-btn" disabled>
                Loading...
            </button>
        </div>
    ),
});

/** The plain "Wallet" button the HUD shows in the wallet box's place (only
 *  when an RPC endpoint is configured). One click swaps it for the wallet
 *  panel; nothing from @solana/* is on the page before that. */
const WalletGate: React.FC<WalletGateProps> = ({ gameState }) => {
    const [open, setOpen] = useState(false);

    if (open) {
        return <WalletPanel gameState={gameState} />;
    }
    return (
        <div className="left-box">
            <button type="button" className="me-btn" onClick={() => setOpen(true)}>
                Wallet
            </button>
        </div>
    );
};

export default WalletGate;
