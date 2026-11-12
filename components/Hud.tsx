import React, { useState, useCallback } from 'react';
import Player from '../lib/player';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getRelatedAssetsByOwner } from '../lib/helius';
import { useWallet } from '@solana/wallet-adapter-react';
import GameState from '@/lib/GameState';


interface HudProps {
    player: Player;
    gameState: GameState;
}

const Hud: React.FC<HudProps> = ({ player, gameState }) => {
    const { publicKey } = useWallet();
    const [assetImage, setAssetImage] = useState<string | null>(null);

    const handleCheckAssets = useCallback(async () => {
        if (publicKey) {
            const assets = await getRelatedAssetsByOwner(publicKey.toBase58());
            assets.forEach((element: {
                file: any;
                collection: string; data: any; 
}) => {
                if (element.collection == 'Dj5gDUph6CuUiQBjh31HhpmJTXhhfHzbMTNK89wNHzvz' && element.data){
                    const data = element.data;
                    const image = element.file;

                    setAssetImage(image);
                    player.setPlayerDetails(data);
                    gameState.setLook({
                        Head: player.head,
                        Eye: player.eye,
                        Clothes: player.clothes,
                        Body: player.body,
                        Back: player.back,
                    });

                    return;
                }   
            });
        }
    }, [publicKey]);

    return (
        <div id="hud">
            <div className="left-box">
                <WalletMultiButton />
                {publicKey && <button className="wallet-actions" onClick={handleCheckAssets}>🔎 Assets</button>}

                {assetImage && <img src={assetImage} alt="Asset" className="asset-image" />}
            </div>
            <div className="right-box">
                <div className="bar-container">
                    <div id="stat-energy">Energy: 0</div>
                    <div id="energy-bar">
                        <div id="energy-bar-inner" style={{ width: `${player.energy}%` }}></div>
                    </div>
                </div>
                <div className="bar-container">
                    <div id="stat-score">Score: 0</div>
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
                        <div id="stat-attack">{Math.round(player.attack*10)/10}</div>
                    </div>
                    <div className="stat">
                        <div>🛡️ Defense</div>
                        <div id="stat-defense">{Math.round(player.defense*10)/10}</div>
                    </div>
                    <div className="stat">
                        <div>🏃‍♂️ Speed</div>
                        <div id="stat-speed">{Math.round(player.speed * 100)}%</div>
                    </div>
                    <div className="stat">
                        <div>⚡ Consumption</div>
                        <div id="stat-consumption">{Math.round(player.consumption * 100)}%</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Hud;
