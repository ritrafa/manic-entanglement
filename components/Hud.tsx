import React, { useSyncExternalStore } from 'react';
import { rpcUrl } from '@/lib/reptile';
import GameState from '@/lib/GameState';
import ToolBar from './ToolBar';
import WalletBox from './WalletBox';

interface HudProps {
    gameState: GameState;
}

const Hud: React.FC<HudProps> = ({ gameState }) => {
    // The whole model comes from the shell's store: one source, no getElementById,
    // and a React re-render (e.g. a wallet connecting) can never put stale text back.
    const model = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);

    // No RPC endpoint configured: no wallet box at all (no button, no hook
    // that would miss its context). WalletBox holds the wallet hooks so they
    // are never called conditionally here.
    const hasWallet = rpcUrl() !== null;

    return (
        <div id="hud">
            {hasWallet && <WalletBox gameState={gameState} />}
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
                {/* Gear picked up since the last exit: kept by reaching it, lost
                    on death (game/run.ts). The marker shows only while something
                    is carried. */}
                {model.carried > 0 && (
                    <div className="carried-marker" title="Reach the exit to keep it">
                        Carried: {model.carried}
                    </div>
                )}
            </div>
            {/* The two tool buttons: Anchor and Twist, spent by click, tap or keys 1 and 2. */}
            <ToolBar gameState={gameState} />
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
