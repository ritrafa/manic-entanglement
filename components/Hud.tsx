"use client";

import React from 'react';
import { Player } from '../lib/types';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getRelatedAssetsByOwner } from '../lib/helius';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';



interface HudProps {
    player: Player;
}

const Hud: React.FC<HudProps> = ({ player }) => {
    const { publicKey } = useWallet();
    const progress = (player.points / player.high_score) * 100;

    const handleCheckAssets = async () => {
        if (publicKey) {
            const assets = await getRelatedAssetsByOwner(publicKey.toBase58());
            console.log(assets);
        } else {
            console.error('Public key is not available');
        }
    };

    return (
        <div id="hud">
            <div id="energy-bar">
                <div id="energy-bar-inner" style={{ width: `${player.energy}%` }}></div>
            </div>
            <div id="status">Points: {player.points}</div>

            <div id="progress-bar">
                <div id="progress-bar-inner" style={{ width: `${progress}%` }}></div>
            </div>
            <div id="high-score">High Score: {player.high_score}</div>
            <WalletMultiButton />
            <button onClick={handleCheckAssets}>Check Assets</button>
        </div>
    );
};

export default Hud;
