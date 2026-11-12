"use client";

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import GameState, { type GameSnapshot } from '@/lib/GameState';
import type { SummaryLine } from '@/game/screens';

interface OverlayProps {
    gameState: GameState;
}

/**
 * The pause and game-over panels, rendered from the shell's snapshot and nothing
 * else: while the game plays this draws nothing, "paused" gets a panel with
 * Resume, Restart and Quit to title, and "over" shows the run summary with Retry
 * and Menu. Real <button> elements, so keyboard, mouse and touch all work; the
 * first button takes focus when a panel appears, so Enter acts on it at once
 * (actionFor keeps Enter off the global confirm while a button is focused).
 */
const Overlay: React.FC<OverlayProps> = ({ gameState }) => {
    const model: GameSnapshot = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const firstButtonRef = useRef<HTMLButtonElement>(null);
    const open = model.screen === 'paused' || model.screen === 'over';

    // The panel is modal while it shows: focus its first button when it appears.
    useEffect(() => {
        if (open) firstButtonRef.current?.focus();
    }, [open, model.screen]);

    if (!open) return null;

    if (model.screen === 'paused') {
        return (
            <div className="game-over-message" role="dialog" aria-modal="true" aria-label="Paused">
                <p className="overlay-title">Paused</p>
                <div className="overlay-buttons">
                    <button ref={firstButtonRef} onClick={() => gameState.resume()}>Resume</button>
                    <button onClick={() => gameState.restart()}>Restart</button>
                    <button onClick={() => gameState.openSettings()}>Settings</button>
                    <button onClick={() => gameState.quit()}>Quit to title</button>
                </div>
            </div>
        );
    }

    return (
        <div className="game-over-message" role="dialog" aria-modal="true" aria-label={model.finished ? 'Run finished' : 'Game over'}>
            <p className="overlay-title">{model.finished ? 'Run complete' : 'Game over'}</p>
            <div className="summary">
                {(model.summary ?? []).map((line: SummaryLine) => (
                    <div className="summary-line" key={line.label}>
                        <span className="summary-label">{line.label}</span>
                        <span className="summary-value">{line.value}</span>
                    </div>
                ))}
            </div>
            <div className="overlay-buttons">
                <button ref={firstButtonRef} onClick={() => gameState.confirm()}>Retry</button>
                <button onClick={() => gameState.quit()}>Menu</button>
            </div>
        </div>
    );
};

export default Overlay;
