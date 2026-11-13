"use client";

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import GameState, { type GameSnapshot } from '@/lib/GameState';
import { FEATS } from '@/game/feats';

interface FeatsProps {
    gameState: GameState;
}

/**
 * The feats panel (design/components/Panel): one row per feat (game/feats.ts)
 * with its name, its one line of text and the word "Earned" or "Locked" — the
 * word carries the meaning, the gold colour only repeats it. Opened from the
 * title menu; the Back button (and Esc, which the shell maps to "back")
 * returns to the title. The first button takes focus when the panel appears,
 * and the list is a real list so a screen reader walks it entry by entry.
 */
const FeatsPanel: React.FC<FeatsProps> = ({ gameState }) => {
    const model: GameSnapshot = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const firstButtonRef = useRef<HTMLButtonElement>(null);
    const open = model.screen === 'feats';

    // The panel is modal while it shows: focus its Back button when it appears.
    useEffect(() => {
        if (open) firstButtonRef.current?.focus();
    }, [open]);

    if (!open) return null;

    const earned = new Set(model.feats);

    // Esc closes the list from anywhere inside it, the way the settings panel does.
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        gameState.closeFeats();
    };

    return (
        <div className="me-scrim" onKeyDown={handleKeyDown}>
            <section className="me-panel" role="dialog" aria-modal="true" aria-label="Feats">
                <h2 className="me-panel-title">Feats</h2>
                <div className="me-panel-body">
                    <ul className="feats-list">
                        {FEATS.map((feat) => {
                            const have = earned.has(feat.id);
                            return (
                                <li className={have ? 'feats-row earned' : 'feats-row'} key={feat.id}>
                                    <span className="feats-name">{feat.name}</span>
                                    <span className="feats-text">{feat.text}</span>
                                    <span className="feats-state">{have ? 'Earned' : 'Locked'}</span>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="me-panel-actions">
                        <button className="me-btn me-btn-primary" ref={firstButtonRef} onClick={() => gameState.closeFeats()}>Back</button>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default FeatsPanel;
