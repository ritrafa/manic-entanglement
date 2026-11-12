"use client"; // Add this line at the top

import React, { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import Player from '../lib/player';
import GameState from '../lib/GameState';
import Hud from '../components/Hud';
import TouchLayer from '../components/TouchLayer';
import DPad from '../components/DPad';
import Overlay from '../components/Overlay';
import Menu from '../components/Menu';
import HowTo from '../components/HowTo';
import SettingsPanel from '../components/Settings';
import ControlsPanel from '../components/Controls';
import type { Dir } from '../game/stepper';
import '../styles/globals.css';
import { Analytics } from "@vercel/analytics/react"

/** True on a phone or tablet; desktop mice never see the D-pad or the pause button. */
function useCoarsePointer(): boolean {
    const [coarse, setCoarse] = useState(false);
    useEffect(() => {
        try {
            setCoarse(window.matchMedia('(pointer: coarse)').matches);
        } catch {
            setCoarse(false);
        }
    }, []);
    return coarse;
}

interface GameShellProps {
    gameState: GameState;
    player: Player;
}

/**
 * The playing page once a GameState exists: the board inside the touch layer,
 * the HUD, and the touch-only controls — the swipe-and-hold layer always, the
 * D-pad when settings.touch says so, and the pause button top right, both only
 * on devices with a coarse pointer.
 */
const GameShell: React.FC<GameShellProps> = ({ gameState, player }) => {
    const model = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const coarse = useCoarsePointer();

    // Held directions go straight to the Stepper's cadence, exactly like keys;
    // taps never come here — the browser's own click drives the title and the
    // game-over panel.
    const handlePress = useCallback((dir: Dir) => gameState.pressDir(dir), [gameState]);
    const handleRelease = useCallback((dir: Dir) => gameState.releaseDir(dir), [gameState]);

    return (
        <>
        <TouchLayer onPress={handlePress} onRelease={handleRelease}>
        <div className="game-container">

            <div id="maze-container">
                <div id="maze"/>
                {/* The touch pause button: the same toggle Esc and P use. */}
                {coarse && (
                    <button type="button" className="pause-button" aria-label="Pause" onClick={() => gameState.togglePause()}>
                        {'\u23F8'}
                    </button>
                )}
                {/* The title art, the menu buttons and the how-to come from the
                    shell's screen: the art shows on title, howto and countdown. */}
                <Menu gameState={gameState} />
                <HowTo gameState={gameState} />
                <SettingsPanel gameState={gameState} />
                <ControlsPanel gameState={gameState} />
                <Overlay gameState={gameState} />
            </div>

            {/* The optional D-pad sits below the board, above the HUD. */}
            {coarse && model.settings.touch === 'dpad' && (
                <DPad onPress={handlePress} onRelease={handleRelease} />
            )}

            <Hud player={player} gameState={gameState} />
        </div>
        </TouchLayer>
        <Analytics/>
        </>
    );
};

const Page: React.FC = () => {
    const [player, setPlayer] = useState<Player | null>(null);
    const [gameState, setGameState] = useState<GameState | null>(null);

    useEffect(() => {
        const newGameState = new GameState();
        setGameState(newGameState);
        setPlayer(newGameState.player);

        const handleKeyPress = (event: KeyboardEvent) => newGameState.handleKeyPress(event);
        const handleKeyRelease = (event: KeyboardEvent) => newGameState.handleKeyRelease(event);
        window.addEventListener('keydown', handleKeyPress);
        window.addEventListener('keyup', handleKeyRelease);

        return () => {
            window.removeEventListener('keydown', handleKeyPress);
            window.removeEventListener('keyup', handleKeyRelease);
            // Release every timer, listener and sound the shell owns.
            newGameState.dispose();
        };
    }, []);

    useEffect(() => {
        const updateMazeContainerSize = () => gameState?.handleResize();

        window.addEventListener('resize', updateMazeContainerSize);
        updateMazeContainerSize();

        return () => {
            window.removeEventListener('resize', updateMazeContainerSize);
        };
    }, [gameState]);

    if (!player || !gameState) {
        return <div>Loading...</div>;
    }

    return <GameShell gameState={gameState} player={player} />;
};

export default Page;
