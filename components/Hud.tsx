import React, { useState, useCallback, useSyncExternalStore } from 'react';
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
    // The whole model comes from the shell's store: one source, no getElementById,
    // and a React re-render (e.g. a wallet connecting) can never put stale text back.
    const model = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);

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
                {publicKey && <button className="wallet-actions" onClick={handleCheckAssets}>🔍 Assets</button>}

                {assetImage && <img src={assetImage} alt="Asset" className="asset-image" />}
            </div>
            <div className="right-box">
                <div className="bar-container">
                    <div id="stat-energy">{model.energyText}</div>
                    <div
                        id="energy-bar"
                        role="progressbar"
                        aria-label="Energy"
                        aria-valuenow={Math.round(model.energyPct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                    >
                        <div id="energy-bar-inner" style={{ width: `${model.energyPct}%` }}></div>
                    </div>
                </div>
                <div className="bar-container">
                    <div id="stat-score">{model.scoreText}</div>
                    <div
                        id="progress-bar"
                        role="progressbar"
                        aria-label="Progress toward best score"
                        aria-valuenow={Math.round(model.bestPct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                    >
                        <div id="progress-bar-inner" style={{ width: `${model.bestPct}%` }}></div>
                    </div>
                </div>
                <div className="stats-container">
                <div className="stat">
                        <div><span aria-hidden="true">🌌</span> Maze Level</div>
                        <div id="stat-level">{model.level}</div>
                    </div>
                    <div className="stat">
                        <div><span aria-hidden="true">⚔️</span> Attack</div>
                        <div id="stat-attack">{model.attack}</div>
                    </div>
                    <div className="stat">
                        <div><span aria-hidden="true">🛡️</span> Defense</div>
                        <div id="stat-defense">{model.defense}</div>
                    </div>
                    <div className="stat">
                        <div><span aria-hidden="true">🏃‍♂️</span> Clock</div>
                        <div id="stat-speed">{model.clockPct}%</div>
                    </div>
                    <div className="stat">
                        <div><span aria-hidden="true">⚡</span> Step cost</div>
                        <div id="stat-consumption">{model.stepPct}%</div>
                    </div>
                </div>
            </div>
            {/* Spoken by assistive technology when the shell has something to
                say (game/settings.ts announcement): Energy low, Level N,
                Paused, Game over. Invisible on screen, polite in the reader. */}
            <div className="visually-hidden" aria-live="polite" role="status">
                {model.announcement}
            </div>
        </div>
    );
};

export default Hud;
