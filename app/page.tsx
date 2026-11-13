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
import type { Screen } from '../game/screens';
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

/** The screens that show a panel over the board: while one is open the pause
 * button and the D-pad stand down (design/components/Panel and DPad). */
const PANEL_SCREENS: readonly Screen[] = ['howto', 'paused', 'settings', 'keys', 'over', 'feats', 'wardrobe'];

/** On top of the panels, the screens where the touch pause button also stands
 *  down: the title menu owns the title (a pause there would pause nothing),
 *  and the countdown runs on its own. The button sat over the title menu
 *  until E47 hid it here too. */
const PAUSE_HIDDEN_SCREENS: readonly Screen[] = [...PANEL_SCREENS, 'title', 'countdown'];

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
    // A panel (pause, game over, settings, how-to, controls, feats, wardrobe)
    // owns the screen: the touch pause button and the D-pad hide while one shows.
    const panelOpen = PANEL_SCREENS.includes(model.screen);
    // The pause button additionally stands down on the title and countdown.
    const pauseHidden = PAUSE_HIDDEN_SCREENS.includes(model.screen);

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
        <div className="game-container" data-screen={model.screen}>

            {/* On the title screen the title block takes the board's place in
                the column (the board area itself stands down, styles/globals.css);
                the HUD and the D-pad follow it, top-aligned. */}
            {model.screen === 'title' && <Menu gameState={gameState} />}

            <div id="maze-container">
                <div id="maze"/>
                {/* The touch pause button: the same toggle Esc and P use, a
                    48 px icon button with the CSS pause mark, hidden while a
                    panel is open and on the title and countdown. */}
                {coarse && !pauseHidden && (
                    <button type="button" className="me-btn me-btn-icon pause-button" aria-label="Pause" onClick={() => gameState.togglePause()}>
                        <span className="me-pause-bars" aria-hidden="true"><i /><i /></span>
                    </button>
                )}
                {/* The title art over the board comes from the shell's screen:
                    it shows (dimmed under the countdown) on howto and countdown;
                    on the title the whole block sits in the column above. */}
                {model.screen !== 'title' && <Menu gameState={gameState} />}
                <HowTo gameState={gameState} />
                <SettingsPanel gameState={gameState} />
                <ControlsPanel gameState={gameState} />
                <FeatsPanel gameState={gameState} />
                <Overlay gameState={gameState} />
            </div>

            {/* The HUD shows from the countdown on: the title screen hides it
                (E52), so its rows take no room and the title page fits the
                viewport without scrolling at 403x900 and 1280x800. */}
            {model.screen !== 'title' && <Hud gameState={gameState} />}

            {/* The optional D-pad is the column's last item, below the HUD,
                and hides while a panel is open. */}
            {coarse && !panelOpen && model.settings.touch === 'dpad' && (
                <DPad onPress={handlePress} onRelease={handleRelease} />
            )}
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
