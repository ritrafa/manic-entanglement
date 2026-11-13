"use client"; // Add this line at the top

import React, { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import GameState from '../lib/GameState';
import Hud from '../components/Hud';
import TouchLayer from '../components/TouchLayer';
import DPad from '../components/DPad';
import Overlay from '../components/Overlay';
import Menu from '../components/Menu';
import HowTo from '../components/HowTo';
import SettingsPanel from '../components/Settings';
import ControlsPanel from '../components/Controls';
import FeatsPanel from '../components/Feats';
import type { Dir } from '../game/stepper';
import { Analytics } from "@vercel/analytics/react"

/** Follow the coarse-pointer media query; the store re-renders when it flips. */
function subscribeCoarsePointer(onStoreChange: () => void): () => void {
    try {
        const query = window.matchMedia('(pointer: coarse)');
        query.addEventListener('change', onStoreChange);
        return () => query.removeEventListener('change', onStoreChange);
    } catch {
        return () => {};
    }
}

/** The device as the browser sees it now; phones and tablets answer true. */
function readCoarsePointer(): boolean {
    try {
        return window.matchMedia('(pointer: coarse)').matches;
    } catch {
        return false;
    }
}

/** There is no pointer at all while server rendering: the D-pad stays hidden. */
function readCoarsePointerOnServer(): boolean {
    return false;
}

/** True on a phone or tablet; desktop mice never see the D-pad or the pause button. */
function useCoarsePointer(): boolean {
    return useSyncExternalStore(subscribeCoarsePointer, readCoarsePointer, readCoarsePointerOnServer);
}

interface GameShellProps {
    gameState: GameState;
}

/**
 * The playing page once a GameState exists: the board inside the touch layer,
 * the HUD, and the touch-only controls — the swipe-and-hold layer always, the
 * D-pad when settings.touch says so, and the pause button top right, both only
 * on devices with a coarse pointer.
 */
const GameShell: React.FC<GameShellProps> = ({ gameState }) => {
    const model = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const coarse = useCoarsePointer();

    // Held directions go straight to the Stepper's cadence, exactly like keys;
    // taps never come here — the browser's own click drives the title and the
    // game-over panel.
    const handlePress = useCallback((dir: Dir) => gameState.pressDir(dir), [gameState]);
    const handleRelease = useCallback((dir: Dir) => gameState.releaseDir(dir), [gameState]);

    // The board mounts once #maze is actually in the page: in a production
    // build the GameState is created before the element exists, so the
    // constructor's call is a no-op and this one does the mounting. Board.mount
    // uses replaceChildren, so a second call is harmless.
    useEffect(() => {
        gameState.mountBoard();
    }, [gameState]);

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
                <FeatsPanel gameState={gameState} />
                <Overlay gameState={gameState} />
            </div>

            {/* The optional D-pad sits below the board, above the HUD. */}
            {coarse && model.settings.touch === 'dpad' && (
                <DPad onPress={handlePress} onRelease={handleRelease} />
            )}

            <Hud gameState={gameState} />
        </div>
        </TouchLayer>
        <Analytics/>
        </>
    );
};

const Page: React.FC = () => {
    const [gameState, setGameState] = useState<GameState | null>(null);

    useEffect(() => {
        const newGameState = new GameState();

        const handleKeyPress = (event: KeyboardEvent) => newGameState.handleKeyPress(event);
        const handleKeyRelease = (event: KeyboardEvent) => newGameState.handleKeyRelease(event);
        window.addEventListener('keydown', handleKeyPress);
        window.addEventListener('keyup', handleKeyRelease);

        // The shell is created here, never during a render: its constructor
        // touches window, storage, document and audio. The hand-off to React
        // rides a microtask so the state lands before the browser paints; the
        // effect still owns subscribing and dispose(), and StrictMode's extra
        // mount/unmount pair disposes exactly the shell it created.
        queueMicrotask(() => setGameState(newGameState));

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

    if (!gameState) {
        return <div>Loading...</div>;
    }

    return <GameShell gameState={gameState} />;
};

export default Page;
