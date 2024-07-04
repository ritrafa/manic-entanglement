import React, { useState, useCallback } from 'react';
import { Player } from '../lib/types';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getRelatedAssetsByOwner } from '../lib/helius';
import { useWallet } from '@solana/wallet-adapter-react';

interface HudProps {
    player: Player;
}

const Hud: React.FC<HudProps> = ({ player }) => {
    const { publicKey } = useWallet();
    const [assetImage, setAssetImage] = useState<string | null>(null);

    const handleCheckAssets = useCallback(async () => {
        if (publicKey) {
            const assets = await getRelatedAssetsByOwner(publicKey.toBase58());
            const asset = assets.find(item => item.grouping.some(group => group.group_value === 'h76khMf58obcfMnnQpvU9Snh71DtGQBzj2WoQwxndjL'));
            if (asset) {
                setAssetImage(asset.content.files[0].cdn_uri);
            }
        }
    }, [publicKey]);

    return (
        <div id="hud">
            <div className="left-box">
                <WalletMultiButton />
                {publicKey && <button className="check-assets" onClick={handleCheckAssets}>🔎 Assets</button>}
                {assetImage && <img src={assetImage} alt="Asset" className="asset-image" />}
            </div>
            <div className="right-box">
                <div className="bar-container">
                    <div>Energy</div>
                    <div id="energy-bar">
                        <div id="energy-bar-inner" style={{ width: `${player.energy}%` }}></div>
                    </div>
                </div>
                <div className="bar-container">
                    <div>Score</div>
                    <div id="progress-bar">
                        <div id="progress-bar-inner" style={{ width: `${(player.points / player.high_score) * 100}%` }}></div>
                    </div>
                </div>
                <div className="stats-container">
                <div className="stat">
                        <div>🌌 Maze Level</div>
                        <div id="stat-level">{player.maze_level}</div>
                    </div>
                    <div className="stat">
                        <div>⚔️ Attack</div>
                        <div id="stat-attack">{player.attack}</div>
                    </div>
                    <div className="stat">
                        <div>🛡️ Defense</div>
                        <div id="stat-defense">{player.defense}</div>
                    </div>
                    <div className="stat">
                        <div>🏃‍♂️ Speed</div>
                        <div id="stat-speed">{Math.round(player.speed * 100)}%</div>
                    </div>
                    <div className="stat">
                        <div>⚡ Consumption</div>
                        <div id="stat-consumption">{Math.round(player.energy_usage * 100)}%</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Hud;
