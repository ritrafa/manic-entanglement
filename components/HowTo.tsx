"use client";

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import GameState, { type GameSnapshot } from '@/lib/GameState';
import { HOWTO, type HowToLine } from '@/game/menu';

interface HowToProps {
    gameState: GameState;
}

/**
 * The how-to-play screen: the HOWTO lines as a list, each with its sprite to
 * the left (the sentence carries the meaning, so the images stay decorative
 * with empty alt text), and one button — "Start" when the first Play opened
 * it, "Back" when it was opened on request. The button takes focus when the
 * screen appears; Enter activates it and Esc closes the screen (the shell maps
 * pause on "howto" back to the title or the countdown).
 */
const HowTo: React.FC<HowToProps> = ({ gameState }) => {
    const model: GameSnapshot = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const open = model.screen === 'howto';

    useEffect(() => {
        if (open) buttonRef.current?.focus();
    }, [open]);

    if (!open) return null;

    return (
        <div className="howto-panel" role="dialog" aria-modal="true" aria-label="How to play">
            <p className="overlay-title">How to play</p>
            <ul className="howto-list">
                {HOWTO.map((line: HowToLine, index: number) => (
                    <li className="howto-line" key={index}>
                        {line.image !== null
                            ? <img className="howto-sprite" src={line.image} alt="" draggable={false} />
                            : <span className="howto-sprite howto-sprite-empty" aria-hidden="true" />}
                        <span className="howto-text">{line.text}</span>
                    </li>
                ))}
            </ul>
            <div className="overlay-buttons">
                <button ref={buttonRef} onClick={() => gameState.confirm()}>
                    {model.howtoFromPlay ? 'Start' : 'Back'}
                </button>
            </div>
        </div>
    );
};

export default HowTo;
