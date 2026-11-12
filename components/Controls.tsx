"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import GameState, { type GameSnapshot } from '@/lib/GameState';
import { ACTION_LABELS, ACTIONS, keyLabel, type Action } from '@/game/keys';

interface ControlsProps {
    gameState: GameState;
}

/** Which button is waiting for a key right now. */
interface Capture {
    action: Action;
    slot: 0 | 1;
}

/**
 * The Controls screen (game/keys.ts): one row per action with its label and
 * two buttons showing the bound keys as players read them (keyLabel), or "-"
 * for an empty slot. Activating a button puts the panel in capture mode: the
 * button reads "Press a key", the shell's global handler ignores every key
 * while the capture runs (gameState.beginKeyCapture), and the next keydown
 * binds its code to that slot — conflicts swap, Escape is refused, all decided
 * by the pure rebind. Escape itself cancels the capture. Reset to defaults
 * restores DEFAULT_KEYS, Back returns to the settings panel.
 */
const ControlsPanel: React.FC<ControlsProps> = ({ gameState }) => {
    const model: GameSnapshot = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const open = model.screen === 'keys';
    const [capture, setCapture] = useState<Capture | null>(null);
    // The capture listener reads the pending binding through a ref, so the one
    // listener attached for a capture always sees the button it belongs to.
    const captureRef = useRef<Capture | null>(null);

    const stopCapture = (): void => {
        captureRef.current = null;
        gameState.endKeyCapture();
        setCapture(null);
    };

    const startCapture = (action: Action, slot: 0 | 1): void => {
        captureRef.current = { action, slot };
        gameState.beginKeyCapture();
        setCapture({ action, slot });
    };

    // Leaving the screen (Back, Esc, anything) drops a waiting capture.
    useEffect(() => {
        if (!open) stopCapture();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // While a capture runs the panel owns the keyboard: the shell's global
    // handler stands down (the capturingKey flag), and this listener takes the
    // next keydown itself — bound, or Escape to cancel. preventDefault keeps
    // arrows and Space from scrolling and a focused button from re-clicking.
    useEffect(() => {
        if (!open || capture === null) return;
        const handleKeyDown = (event: KeyboardEvent): void => {
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
            const pending = captureRef.current;
            if (pending !== null && event.code !== 'Escape') {
                gameState.setKey(pending.action, pending.slot, event.code);
            }
            stopCapture();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, capture, gameState]);

    if (!open) return null;

    const keys = model.settings.keys;
    return (
        <div className="settings-panel controls-panel" role="dialog" aria-modal="true" aria-label="Controls">
            <p className="overlay-title">Controls</p>
            <div className="settings-rows controls-rows">
                {ACTIONS.map((action: Action) => (
                    <div className="settings-row controls-row" key={action}>
                        <span className="controls-label">{ACTION_LABELS[action]}</span>
                        {([0, 1] as const).map((slot) => {
                            const code = keys[action][slot];
                            const capturing = capture !== null && capture.action === action && capture.slot === slot;
                            return (
                                <button
                                    key={slot}
                                    className="controls-key"
                                    aria-label={`${ACTION_LABELS[action]} slot ${slot + 1}`}
                                    onClick={() => (capturing ? stopCapture() : startCapture(action, slot))}
                                >
                                    {capturing ? 'Press a key' : code === undefined ? '-' : keyLabel(code)}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
            <div className="overlay-buttons">
                <button onClick={() => gameState.resetKeys()}>Reset to defaults</button>
                <button onClick={() => gameState.closeControls()}>Back</button>
            </div>
        </div>
    );
};

export default ControlsPanel;
