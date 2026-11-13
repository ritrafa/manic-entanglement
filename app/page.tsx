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

            {/* E65: one fixed stage on every screen. The board area is the
                same square box in the same place from the first paint on; the
                maze is centred inside it and the space around a smaller maze
                is the void. On the title the title block shows inside the
                stage, over the void, with the board hidden beneath it
                (styles/globals.css); the countdown and the how-to keep their
                overlays over the stage as before. */}
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
                {/* The title block (components/Menu.tsx) lives inside the
                    stage on every screen it shows: the whole block on the
                    title, the art alone (dimmed under the countdown) on
                    howto and countdown, nothing elsewhere. */}
                <Menu gameState={gameState} />
                <HowTo gameState={gameState} />
                <SettingsPanel gameState={gameState} />
                <ControlsPanel gameState={gameState} />
                <FeatsPanel gameState={gameState} />
                <Overlay gameState={gameState} />
            </div>

            {/* E65: the HUD is on screen under the stage on every screen, the
                title included, always in the same place. Before a run its
                meters show their starting values and the tool buttons are
                disabled (components/Hud.tsx). */}
            <Hud gameState={gameState} />

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

/** A single CSS custom property in a skeleton style object (--s the sprite,
 *  --v the meter), the same shape components/Hud.tsx uses. */
function skeletonVars(vars: Record<string, string>): React.CSSProperties {
    return vars as React.CSSProperties;
}

/**
 * The HUD's place held while the GameState does not exist yet (E65): the same
 * #hud box with the same rows, portrait well, meters, stats and tool buttons
 * at their starting values, so the stage above it sits exactly where the game
 * will put it and the first paint does not jump when the real HUD arrives.
 */
const HudSkeleton: React.FC = () => (
    <div id="hud" className="me-hud" aria-hidden="true">
        <div className="me-hud-row">
            <div className="me-portrait">
                <div className="me-sprite" style={skeletonVars({ '--s': '48px' })} />
            </div>
            <div className="me-hud-meters">
                <span className="me-label">Energy</span>
                <span className="me-num me-energy">100</span>
                <div className="me-meter" style={skeletonVars({ '--v': '100%' })}><i /></div>
                <span className="me-label">Score</span>
                <span className="me-num me-gold">0</span>
                <div className="me-meter is-gold" style={skeletonVars({ '--v': '0%' })}><i /></div>
            </div>
        </div>
        <div className="me-hud-row">
            <div className="me-stats">
                <div className="me-stat">
                    <img className="me-icon" src="/images/gloves.gif" alt="" />
                    <span className="me-label">Atk</span>
                    <b>1.0</b>
                </div>
                <div className="me-stat">
                    <img className="me-icon" src="/images/shield.gif" alt="" />
                    <span className="me-label">Def</span>
                    <b>1.0</b>
                </div>
                <div className="me-stat">
                    <img className="me-icon" src="/images/speed.gif" alt="" />
                    <span className="me-label">Clock</span>
                    <b>100%</b>
                </div>
                <div className="me-stat">
                    <img className="me-icon" src="/images/boots.gif" alt="" />
                    <span className="me-label">Step</span>
                    <b>100%</b>
                </div>
            </div>
            <div className="me-tools">
                <button type="button" className="me-btn me-tool" disabled tabIndex={-1}>
                    <img className="me-tool-icon" src="/images/tools/anchor.png" alt="" width={24} height={24} draggable={false} />
                    <span>Anchor</span>
                    <span className="me-count" aria-hidden="true">0</span>
                </button>
                <button type="button" className="me-btn me-tool" disabled tabIndex={-1}>
                    <img className="me-tool-icon" src="/images/tools/twist.png" alt="" width={24} height={24} draggable={false} />
                    <span>Twist</span>
                    <span className="me-count" aria-hidden="true">0</span>
                </button>
                <button type="button" className="me-btn me-tool" disabled tabIndex={-1}>
                    <img className="me-tool-icon" src="/images/tools/cut.png" alt="" width={24} height={24} draggable={false} />
                    <span>Cut</span>
                    <span className="me-count" aria-hidden="true">0</span>
                </button>
            </div>
        </div>
    </div>
);

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
        // E65: the first paint already shows the steady layout: the empty
        // stage box (the same size, painted in the void colour, its size from
        // the --stage-size the stylesheet guesses until the shell writes the
        // exact pixels) with the loading text inside it, and an empty HUD box
        // of the same height under it. Nothing jumps when the game appears.
        return (
            <div className="game-container" data-screen="loading">
                <div id="maze-container" aria-hidden="true">
                    <p className="stage-loading">Loading...</p>
                </div>
                <HudSkeleton />
            </div>
        );
    }

    return <GameShell gameState={gameState} />;
};

export default Page;
